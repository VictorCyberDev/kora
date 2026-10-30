import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  artifactHash,
  briefSchema,
  hashSpec,
  lintArtifact,
  missingBlockingDetails,
  renderSite,
  type SiteSpec,
  type StructuredEdit,
} from "@kora/site-schema";
import { EditNotUnderstood, type SiteAuthor } from "./author.js";
import type { PlatformConfig } from "./config.js";
import { sendArtifact } from "./hosting.js";
import {
  HttpError,
  ROLE_RANK,
  notFound,
  requireOrgRole,
  requireUser,
  type Role,
} from "./http.js";
import type { Operations, Principal } from "./operations.js";
import type { OpsStore } from "./ops-store.js";
import type { PublishService } from "./services.js";
import type { BillingService } from "./billing.js";
import type { PlatformStore } from "./store.js";
import {
  RateLimiter,
  SESSION_TTL_SECONDS,
  hashPassword,
  newSessionToken,
  serializeSessionCookie,
  sha256Hex,
  verifyPassword,
} from "./security.js";
import type { SitePublisher } from "./publisher.js";
import { describeChannels, noEmailProvider } from "./notifications.js";

export interface RouteDeps {
  platform: PlatformStore;
  ops: OpsStore;
  operations: Operations;
  publishing: PublishService;
  publisher: SitePublisher;
  author: SiteAuthor;
  billing: BillingService;
  config: PlatformConfig;
}
/** Publishers whose sites are served by a Kora-run host that honours controlled-test faults. */
const CHAOS_PUBLISHERS = new Set(["kora-hosted", "kora-site-host"]);
const uuid = z.string().uuid();
const idParam = z.object({ id: uuid });
const email = z
  .string()
  .email()
  .max(200)
  .transform((v) => v.trim());
const slugify = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "site";
const DUMMY_HASH = await hashPassword("kora-dummy-password-for-timing");

export function formEndpointFor(
  config: PlatformConfig,
  siteId: string,
): string | undefined {
  return config.KORA_PUBLIC_URL
    ? `${config.KORA_PUBLIC_URL.replace(/\/+$/, "")}/api/public/sites/${siteId}/forms`
    : undefined;
}

export function registerRoutes(app: FastifyInstance, d: RouteDeps) {
  const {
    platform,
    ops,
    operations,
    publishing,
    publisher,
    author,
    billing,
    config,
  } = d;
  const entitled = async (
    orgId: string,
    key: "canCreateSite" | "canGenerate" | "canPublish",
  ) => {
    const { entitlements } = await billing.entitlements(orgId);
    if (!entitlements[key])
      throw new HttpError(
        402,
        "plan_restriction",
        entitlements.restrictedReason ??
          "Your plan does not include this. Choose a plan to continue.",
      );
  };
  const authLimiter = new RateLimiter(20, 60_000);
  const formLimiter = new RateLimiter(5, 60_000);
  const principal = (req: FastifyRequest, role: Role): Principal => ({
    userId: requireUser(req).userId,
    role,
    requestId: req.id,
  });
  const siteFor = async (
    req: FastifyRequest,
    id: string,
    min: Role = "VIEWER",
  ) => {
    const site = await platform.getSite(id);
    if (!site) throw notFound();
    const role = requireOrgRole(req, site.orgId, min);
    return { site, role };
  };
  const incidentCtx = async (
    req: FastifyRequest,
    incidentId: string,
    min: Role = "VIEWER",
  ) => {
    const incident = await ops.incidentRow(incidentId);
    const ref = incident ? await ops.siteForService(incident.serviceId) : null;
    if (!incident || !ref) throw notFound();
    const role = requireOrgRole(req, ref.orgId, min);
    return { incident, ref, role };
  };
  const actionCtx = async (
    req: FastifyRequest,
    actionId: string,
    min: Role = "VIEWER",
  ) => {
    const action = await ops.getAction(actionId);
    if (!action?.orgId) throw notFound();
    const role = requireOrgRole(req, action.orgId, min);
    return { action, role };
  };
  const setCookie = (
    reply: import("fastify").FastifyReply,
    token: string,
    maxAge = SESSION_TTL_SECONDS,
  ) =>
    reply.header(
      "set-cookie",
      serializeSessionCookie(token, config.KORA_COOKIE_SECURE, maxAge),
    );
  const me = async (req: FastifyRequest) => {
    const a = requireUser(req);
    return {
      user: { id: a.userId, email: a.email, displayName: a.displayName },
      orgs: await platform.listOrgs(a.userId),
    };
  };

  // ---- auth -----------------------------------------------------------------
  app.post("/api/auth/signup", async (req, reply) => {
    if (!config.KORA_SIGNUP_ENABLED)
      throw new HttpError(403, "signup_disabled");
    if (!authLimiter.take(`signup:${req.ip}`))
      throw new HttpError(429, "rate_limited");
    const body = z
      .object({
        email,
        password: z.string().min(10).max(200),
        displayName: z.string().trim().min(1).max(80),
        orgName: z.string().trim().min(1).max(120),
      })
      .parse(req.body);
    if (await platform.findUserByEmail(body.email))
      throw new HttpError(409, "email_in_use");
    const { userId, orgId } = await platform.signUp(
      body.email,
      await hashPassword(body.password),
      body.displayName,
      body.orgName,
    );
    await billing.startTrial(orgId);
    const token = newSessionToken();
    await platform.createSession(userId, sha256Hex(token), SESSION_TTL_SECONDS);
    await platform.audit({
      orgId,
      actorUserId: userId,
      action: "auth.signup",
      objectType: "user",
      objectId: userId,
      requestId: req.id,
    });
    setCookie(reply, token);
    return reply.code(201).send({
      data: {
        user: {
          id: userId,
          email: body.email,
          displayName: body.displayName,
        },
        orgs: [{ id: orgId, name: body.orgName, role: "OWNER" }],
      },
    });
  });
  app.post("/api/auth/login", async (req, reply) => {
    const body = z
      .object({ email, password: z.string().min(1).max(200) })
      .parse(req.body);
    if (
      !authLimiter.take(`login:${req.ip}`) ||
      !authLimiter.take(`login:${body.email.toLowerCase()}`)
    )
      throw new HttpError(429, "rate_limited");
    const user = await platform.findUserByEmail(body.email);
    const ok = await verifyPassword(
      body.password,
      user?.passwordHash ?? DUMMY_HASH,
    );
    if (!user || !ok)
      throw new HttpError(
        401,
        "invalid_credentials",
        "Email or password is incorrect.",
      );
    const token = newSessionToken();
    await platform.createSession(
      user.id,
      sha256Hex(token),
      SESSION_TTL_SECONDS,
    );
    await platform.audit({
      actorUserId: user.id,
      action: "auth.login",
      objectType: "user",
      objectId: user.id,
      requestId: req.id,
    });
    setCookie(reply, token);
    return {
      data: {
        user: { id: user.id, email: user.email, displayName: user.displayName },
        orgs: await platform.listOrgs(user.id),
      },
    };
  });
  app.post("/api/auth/logout", async (req, reply) => {
    if (req.auth) {
      await platform.revokeSession(req.auth.sessionId);
      await platform.audit({
        actorUserId: req.auth.userId,
        action: "auth.logout",
        objectType: "session",
        objectId: req.auth.sessionId,
        requestId: req.id,
      });
    }
    setCookie(reply, "", 0);
    return { data: { ok: true } };
  });
  app.get("/api/auth/me", async (req) => ({ data: await me(req) }));

  // ---- organizations --------------------------------------------------------
  app.get("/api/orgs", async (req) => ({
    data: await platform.listOrgs(requireUser(req).userId),
  }));
  app.post("/api/orgs", async (req, reply) => {
    const a = requireUser(req);
    const body = z
      .object({ name: z.string().trim().min(1).max(120) })
      .parse(req.body);
    const id = await platform.createOrg(a.userId, body.name);
    await billing.startTrial(id);
    await platform.audit({
      orgId: id,
      actorUserId: a.userId,
      action: "org.created",
      objectType: "organization",
      objectId: id,
      requestId: req.id,
    });
    return reply
      .code(201)
      .send({ data: { id, name: body.name, role: "OWNER" } });
  });
  app.get("/api/orgs/:id", async (req) => {
    const { id } = idParam.parse(req.params);
    requireOrgRole(req, id, "VIEWER");
    const org = (await platform.listOrgs(requireUser(req).userId)).find(
      (o) => o.id === id,
    )!;
    return { data: { ...org, members: await platform.listMembers(id) } };
  });
  app.post("/api/orgs/:id/members", async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const actorRole = requireOrgRole(req, id, "ADMIN");
    const body = z
      .object({ email, role: z.enum(["ADMIN", "MEMBER", "VIEWER"]) })
      .parse(req.body);
    if (body.role === "ADMIN" && actorRole !== "OWNER")
      throw new HttpError(403, "forbidden", "Only an owner can add admins.");
    const userId = await platform.addMemberByEmail(id, body.email, body.role);
    if (!userId)
      throw new HttpError(
        404,
        "user_not_found",
        "That person needs a Kora account first.",
      );
    await platform.audit({
      orgId: id,
      actorUserId: requireUser(req).userId,
      action: "org.member_role_set",
      objectType: "user",
      objectId: userId,
      requestId: req.id,
      metadata: { role: body.role },
    });
    return reply.code(201).send({ data: { userId, role: body.role } });
  });
  app.get("/api/orgs/:id/audit", async (req) => {
    const { id } = idParam.parse(req.params);
    requireOrgRole(req, id, "ADMIN");
    return { data: await platform.listAudit(id) };
  });
  app.get("/api/orgs/:id/usage", async (req) => {
    const { id } = idParam.parse(req.params);
    requireOrgRole(req, id, "VIEWER");
    return { data: await platform.usageSummary(id) };
  });

  // ---- sites ------------------------------------------------------------------
  app.get("/api/sites", async (req) => {
    const a = requireUser(req);
    return { data: await platform.listSites([...a.memberships.keys()]) };
  });
  app.post("/api/sites", async (req, reply) => {
    const a = requireUser(req);
    const body = z
      .object({
        orgId: uuid,
        name: z.string().trim().min(1).max(120),
        description: z.string().max(2000).default(""),
      })
      .parse(req.body);
    requireOrgRole(req, body.orgId, "MEMBER");
    await entitled(body.orgId, "canCreateSite");
    const site = await platform.createSite({
      orgId: body.orgId,
      name: body.name,
      slug: `${slugify(body.name)}-${crypto.randomUUID().slice(0, 6)}`,
      description: body.description,
      createdBy: a.userId,
    });
    await platform.audit({
      orgId: site.orgId,
      actorUserId: a.userId,
      action: "site.created",
      objectType: "site",
      objectId: site.id,
      requestId: req.id,
    });
    return reply.code(201).send({ data: site });
  });
  app.get("/api/sites/:id", async (req) => ({
    data: (await siteFor(req, idParam.parse(req.params).id)).site,
  }));
  app.patch("/api/sites/:id", async (req) => {
    const { site } = await siteFor(req, idParam.parse(req.params).id, "ADMIN");
    const body = z
      .object({
        name: z.string().trim().min(1).max(120).optional(),
        description: z.string().max(2000).optional(),
      })
      .parse(req.body);
    const updated = await platform.updateSite(site.id, body);
    await platform.audit({
      orgId: site.orgId,
      actorUserId: requireUser(req).userId,
      action: "site.updated",
      objectType: "site",
      objectId: site.id,
      requestId: req.id,
      metadata: { fields: Object.keys(body) },
    });
    return { data: updated };
  });
  app.get("/api/sites/:id/status", async (req) => {
    const { site } = await siteFor(req, idParam.parse(req.params).id);
    const status = await operations.siteStatus(site);
    const fault = await ops.getFault(site.id);
    return {
      data: {
        ...status,
        site,
        controlledTest:
          fault && fault.versionId === site.publishedVersionId
            ? {
                mode: fault.mode,
                label: "Controlled test",
                expiresAt: fault.expiresAt,
              }
            : null,
        chaosAvailable:
          config.KORA_CHAOS_ENABLED && CHAOS_PUBLISHERS.has(publisher.name),
        publisher: publisher.name,
      },
    };
  });

  // ---- builder ----------------------------------------------------------------
  const buildVersion = async (
    site: NonNullable<Awaited<ReturnType<PlatformStore["getSite"]>>>,
    spec: SiteSpec,
    source: "MODEL" | "DETERMINISTIC" | "EDIT_MODEL" | "EDIT_STRUCTURED",
    createdBy: string,
    parentId: string | null,
  ) => {
    const files = renderSite(spec, {
      siteId: site.id,
      ...(formEndpointFor(config, site.id)
        ? { formEndpoint: formEndpointFor(config, site.id)! }
        : {}),
    });
    const problems = lintArtifact(files);
    if (problems.length)
      throw new HttpError(422, "artifact_rejected", problems[0]);
    return platform.createVersion({
      siteId: site.id,
      orgId: site.orgId,
      spec,
      specHash: hashSpec(spec),
      files,
      artifactHash: artifactHash(files),
      source,
      createdBy,
      parentId,
    });
  };
  app.post("/api/sites/:id/generate", async (req, reply) => {
    const { site } = await siteFor(req, idParam.parse(req.params).id, "MEMBER");
    await entitled(site.orgId, "canGenerate");
    const a = requireUser(req);
    const body = briefSchema.partial({ name: true }).parse(req.body);
    const brief = {
      ...body,
      name: body.name ?? site.name,
      description: body.description ?? "",
    };
    const missing = missingBlockingDetails(brief);
    if (missing.length)
      return reply.code(422).send({
        error: "more_details_needed",
        missing,
        questions: missing.map((m) =>
          m === "name"
            ? "What is your business called?"
            : "In a sentence or two, what does your business do?",
        ),
        requestId: req.id,
      });
    const authored = await author.generate(brief);
    const version = await buildVersion(
      site,
      authored.spec,
      authored.source,
      a.userId,
      null,
    );
    await platform.recordGeneration({
      siteId: site.id,
      orgId: site.orgId,
      kind: "GENERATE",
      prompt: brief.description,
      status: "SUCCEEDED",
      source: authored.source,
      versionId: version.id,
      inputTokens: authored.inputTokens,
      outputTokens: authored.outputTokens,
      createdBy: a.userId,
    });
    await platform.recordUsage(site.orgId, site.id, "GENERATION", 1, {
      source: authored.source,
    });
    if (authored.inputTokens)
      await platform.recordUsage(
        site.orgId,
        site.id,
        "AI_INPUT_TOKENS",
        authored.inputTokens,
      );
    if (authored.outputTokens)
      await platform.recordUsage(
        site.orgId,
        site.id,
        "AI_OUTPUT_TOKENS",
        authored.outputTokens,
      );
    await platform.audit({
      orgId: site.orgId,
      actorUserId: a.userId,
      action: "site.generated",
      objectType: "site_version",
      objectId: version.id,
      requestId: req.id,
      metadata: { source: authored.source },
    });
    return reply.code(201).send({
      data: { version, source: authored.source, note: authored.note },
    });
  });
  app.post("/api/sites/:id/edit", async (req, reply) => {
    const { site } = await siteFor(req, idParam.parse(req.params).id, "MEMBER");
    await entitled(site.orgId, "canGenerate");
    const a = requireUser(req);
    const body = z
      .object({
        baseVersionId: uuid.optional(),
        instruction: z.string().max(1000).optional(),
        edit: z
          .custom<StructuredEdit>((v) => typeof v === "object" && v !== null)
          .optional(),
        patch: z.unknown().optional(),
      })
      .parse(req.body);
    const baseId = body.baseVersionId ?? site.currentVersionId;
    const base = baseId ? await platform.getVersionRow(site.id, baseId) : null;
    if (!base)
      throw new HttpError(
        409,
        "nothing_to_edit",
        "Create a first version before editing.",
      );
    try {
      const authored = await author.edit(base.spec as SiteSpec, body);
      const version = await buildVersion(
        site,
        authored.spec,
        authored.source,
        a.userId,
        String(base.id),
      );
      await platform.recordGeneration({
        siteId: site.id,
        orgId: site.orgId,
        kind: "EDIT",
        prompt: body.instruction ?? "structured edit",
        status: "SUCCEEDED",
        source: authored.source,
        versionId: version.id,
        inputTokens: authored.inputTokens,
        outputTokens: authored.outputTokens,
        createdBy: a.userId,
      });
      if (authored.inputTokens)
        await platform.recordUsage(
          site.orgId,
          site.id,
          "AI_INPUT_TOKENS",
          authored.inputTokens,
        );
      if (authored.outputTokens)
        await platform.recordUsage(
          site.orgId,
          site.id,
          "AI_OUTPUT_TOKENS",
          authored.outputTokens,
        );
      await platform.audit({
        orgId: site.orgId,
        actorUserId: a.userId,
        action: "site.edited",
        objectType: "site_version",
        objectId: version.id,
        requestId: req.id,
        metadata: { source: authored.source, parent: String(base.id) },
      });
      return reply.code(201).send({
        data: { version, source: authored.source, note: authored.note },
      });
    } catch (e) {
      if (e instanceof EditNotUnderstood) {
        await platform.recordGeneration({
          siteId: site.id,
          orgId: site.orgId,
          kind: "EDIT",
          prompt: body.instruction ?? "structured edit",
          status: "FAILED",
          source: "REJECTED",
          error: e.message,
          createdBy: a.userId,
        });
        return reply.code(422).send({
          error: "edit_not_applied",
          message: e.message,
          requestId: req.id,
        });
      }
      throw e;
    }
  });
  app.get("/api/sites/:id/versions", async (req) => ({
    data: await platform.listVersions(
      (await siteFor(req, idParam.parse(req.params).id)).site.id,
    ),
  }));
  app.get("/api/sites/:id/versions/:versionId", async (req) => {
    const { id, versionId } = z
      .object({ id: uuid, versionId: uuid })
      .parse(req.params);
    const { site } = await siteFor(req, id);
    const v = await platform.getVersion(site.id, versionId);
    if (!v) throw notFound();
    return { data: v };
  });
  // Preview serves the stored artifact: the same bytes publish deploys, never a separate renderer.
  app.get(
    "/api/sites/:id/versions/:versionId/preview/*",
    async (req, reply) => {
      const { id, versionId } = z
        .object({ id: uuid, versionId: uuid })
        .parse(req.params);
      const { site } = await siteFor(req, id);
      const row = await platform.getVersionRow(site.id, versionId);
      if (!row) throw notFound();
      const files = { ...(row.artifact as Record<string, string>) };
      // Previews are internal: forms would post to production, so show direct contact only.
      for (const [path, content] of Object.entries(files))
        if (path.endsWith(".html"))
          files[path] = content.replace(
            /<form[\s\S]*?<\/form>/g,
            "<p><em>The contact form works once the site is published.</em></p>",
          );
      return sendArtifact(
        reply,
        files,
        (req.params as Record<string, string>)["*"] ?? "",
        `/api/sites/${id}/versions/${versionId}/preview/`,
        { "x-frame-options": "SAMEORIGIN" },
      );
    },
  );
  app.post("/api/sites/:id/versions/:versionId/publish", async (req) => {
    const { id, versionId } = z
      .object({ id: uuid, versionId: uuid })
      .parse(req.params);
    const { site } = await siteFor(req, id, "MEMBER");
    await entitled(site.orgId, "canPublish");
    return {
      data: await publishing.publish(site, versionId, {
        userId: requireUser(req).userId,
        requestId: req.id,
      }),
    };
  });
  app.post("/api/sites/:id/versions/:versionId/rollback", async (req) => {
    const { id, versionId } = z
      .object({ id: uuid, versionId: uuid })
      .parse(req.params);
    const { site } = await siteFor(req, id, "ADMIN");
    await entitled(site.orgId, "canPublish");
    const target = await platform.getVersionRow(site.id, versionId);
    const live = await platform.getPublishedVersionRow(site.id);
    if (!target) throw notFound();
    if (
      !live ||
      Number(target.number) >= Number(live.number) ||
      target.publish_status !== "PUBLISHED"
    )
      throw new HttpError(
        409,
        "not_a_rollback_target",
        "Only an earlier version that was previously published can be restored.",
      );
    return {
      data: await publishing.publish(site, versionId, {
        userId: requireUser(req).userId,
        requestId: req.id,
      }),
    };
  });
  app.get("/api/sites/:id/deployments", async (req) => {
    const { site } = await siteFor(req, idParam.parse(req.params).id);
    return {
      data: {
        jobs: await platform.listPublishJobs(site.id),
        revisions: await ops.listDeployments(site.id),
        changes: await ops.listChanges(site.id),
      },
    };
  });

  // ---- forms -------------------------------------------------------------------
  app.get("/api/sites/:id/forms", async (req) => ({
    data: await platform.listSubmissions(
      (await siteFor(req, idParam.parse(req.params).id)).site.id,
    ),
  }));
  app.patch("/api/sites/:id/forms/:submissionId", async (req) => {
    const { id, submissionId } = z
      .object({ id: uuid, submissionId: uuid })
      .parse(req.params);
    const { site } = await siteFor(req, id, "MEMBER");
    const body = z
      .object({ status: z.enum(["NEW", "READ", "ARCHIVED"]) })
      .parse(req.body);
    if (
      !(await platform.setSubmissionStatus(site.id, submissionId, body.status))
    )
      throw notFound();
    return { data: { id: submissionId, status: body.status } };
  });
  const cors = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "600",
  };
  app.options("/api/public/sites/:id/forms", (_req, reply) =>
    reply.code(204).headers(cors).send(),
  );
  app.post(
    "/api/public/sites/:id/forms",
    { bodyLimit: 8 * 1024 },
    async (req, reply) => {
      reply.headers(cors);
      const { id } = idParam.parse(req.params);
      if (!formLimiter.take(`form:${req.ip}:${id}`))
        throw new HttpError(
          429,
          "rate_limited",
          "Too many messages. Please try again in a minute.",
        );
      const site = await platform.getSite(id);
      if (!site || site.status !== "PUBLISHED") throw notFound();
      const raw = z.record(z.string(), z.unknown()).parse(req.body ?? {});
      if (typeof raw.website === "string" && raw.website.length > 0)
        return reply.code(200).send({ data: { received: true } });
      const fields: Record<string, string> = {};
      for (const key of ["name", "email", "phone", "message", "service"]) {
        const v = raw[key];
        if (typeof v === "string" && v.trim())
          fields[key] = v.trim().slice(0, 2000);
      }
      if (!Object.keys(fields).length)
        throw new HttpError(422, "empty_submission");
      if (fields.email && !z.string().email().safeParse(fields.email).success)
        throw new HttpError(422, "invalid_email");
      await platform.addSubmission(site.id, site.orgId, fields);
      await platform.recordUsage(site.orgId, site.id, "FORM_SUBMISSION", 1);
      await platform.notify({
        orgId: site.orgId,
        siteId: site.id,
        kind: "FORM_SUBMITTED",
        title: "New enquiry",
        body: `Someone sent a message through ${site.name}.`,
      });
      return reply.code(201).send({ data: { received: true } });
    },
  );

  // ---- operations ----------------------------------------------------------------
  app.get("/api/sites/:id/incidents", async (req) => {
    const { site } = await siteFor(req, idParam.parse(req.params).id);
    const serviceId = await ops.serviceForSite(site.id);
    return {
      data: serviceId ? await ops.incidentsForService(serviceId, 50) : [],
    };
  });
  app.get("/api/incidents/:id", async (req) => ({
    data: await operations.ownerIncident(
      (await incidentCtx(req, idParam.parse(req.params).id)).incident.id,
    ),
  }));
  app.get("/api/incidents/:id/reasoning", async (req) => {
    const { incident } = await incidentCtx(req, idParam.parse(req.params).id);
    return { data: await ops.latestReasoning(incident.id) };
  });
  app.post("/api/incidents/:id/reason", async (req) => {
    const { incident } = await incidentCtx(
      req,
      idParam.parse(req.params).id,
      "MEMBER",
    );
    return { data: await operations.reasonAbout(incident.id) };
  });
  app.get("/api/incidents/:id/actions", async (req) => {
    const { incident } = await incidentCtx(req, idParam.parse(req.params).id);
    await operations.verifyPending();
    return { data: await ops.listActions(incident.id) };
  });
  app.post("/api/incidents/:id/actions", async (req, reply) => {
    const { incident, role } = await incidentCtx(
      req,
      idParam.parse(req.params).id,
      "MEMBER",
    );
    const body = z
      .object({
        type: z.string().min(1).max(60),
        parameters: z.record(z.string(), z.unknown()).default({}),
        reason: z
          .string()
          .min(1)
          .max(500)
          .default("Requested by a team member"),
      })
      .parse(req.body);
    const action = await operations.propose(
      {
        incidentId: incident.id,
        type: body.type,
        parameters: body.parameters,
        reason: body.reason,
        proposedBy: `user:${requireUser(req).userId}`,
      },
      principal(req, role),
    );
    return reply.code(201).send({ data: action });
  });
  const actionDetail = async (id: string) => {
    await operations.verifyPending();
    const action = (await ops.getAction(id))!;
    return {
      ...action,
      policyDecision: await ops.latestPolicyDecision(id),
      approval: await ops.getApproval(id),
      executions: await ops.listExecutions(id),
      recoveryVerification: await ops.getVerification(id),
    };
  };
  app.get("/api/actions/:id", async (req) => ({
    data: await actionDetail(
      (await actionCtx(req, idParam.parse(req.params).id)).action.id,
    ),
  }));
  const noteBody = z
    .object({ note: z.string().max(500).optional() })
    .default({});
  const approverRole = async (actionId: string) =>
    ((await ops.latestPolicyDecision(actionId)) ? "ADMIN" : "ADMIN") as Role;
  app.post("/api/actions/:id/approve", async (req) => {
    const { action } = await actionCtx(req, idParam.parse(req.params).id);
    const role = requireOrgRole(
      req,
      action.orgId!,
      await approverRole(action.id),
    );
    await operations.approve(
      action.id,
      principal(req, role),
      noteBody.parse(req.body ?? {}).note ?? null,
    );
    return { data: await actionDetail(action.id) };
  });
  app.post("/api/actions/:id/reject", async (req) => {
    const { action } = await actionCtx(req, idParam.parse(req.params).id);
    const role = requireOrgRole(
      req,
      action.orgId!,
      await approverRole(action.id),
    );
    await operations.reject(
      action.id,
      principal(req, role),
      noteBody.parse(req.body ?? {}).note ?? null,
    );
    return { data: await actionDetail(action.id) };
  });
  app.post("/api/actions/:id/execute", async (req) => {
    const { action, role } = await actionCtx(
      req,
      idParam.parse(req.params).id,
      "MEMBER",
    );
    if (ROLE_RANK[role] < ROLE_RANK.MEMBER)
      throw new HttpError(403, "forbidden");
    await operations.execute(action.id, principal(req, role));
    return { data: await actionDetail(action.id) };
  });

  // ---- notifications ---------------------------------------------------------------
  app.get("/api/notifications", async (req) => ({
    data: await platform.listNotifications([
      ...requireUser(req).memberships.keys(),
    ]),
  }));
  app.post("/api/notifications/:id/read", async (req) => {
    const { id } = idParam.parse(req.params);
    if (
      !(await platform.markNotificationRead(
        [...requireUser(req).memberships.keys()],
        id,
      ))
    )
      throw notFound();
    return { data: { id, read: true } };
  });

  app.get("/api/notifications/channels", (req) => {
    requireUser(req);
    const aiOn = Boolean(
      config.INFERENCE_BASE_URL &&
      config.INFERENCE_API_KEY &&
      config.INFERENCE_MODEL,
    );
    return {
      data: {
        ...describeChannels(noEmailProvider),
        ai: aiOn
          ? {
              available: true,
              model: config.INFERENCE_MODEL,
              host: new URL(config.INFERENCE_BASE_URL!).hostname,
            }
          : {
              available: false,
              reason:
                "No inference endpoint is configured; explanations are generated from the evidence by rules.",
            },
      },
    };
  });

  // ---- controlled tests (Chaos Lab) ----------------------------------------------------
  app.post("/api/sites/:id/chaos", async (req) => {
    const { site } = await siteFor(req, idParam.parse(req.params).id, "ADMIN");
    if (!config.KORA_CHAOS_ENABLED)
      throw new HttpError(
        403,
        "chaos_disabled",
        "Controlled tests are disabled on this Kora.",
      );
    if (!CHAOS_PUBLISHERS.has(publisher.name))
      throw new HttpError(
        409,
        "chaos_unsupported",
        "Controlled tests only apply to sites served by a Kora host (the API or the Site Host).",
      );
    if (!site.publishedVersionId)
      throw new HttpError(409, "not_published", "Publish the site first.");
    const body = z
      .object({
        mode: z.enum(["http_500", "timeout"]),
        // Faults expire on their own; the host stops applying them after this.
        ttlSeconds: z.number().int().min(30).max(1800).default(600),
      })
      .parse(req.body);
    await ops.setFault(
      site.id,
      site.publishedVersionId,
      body.mode,
      requireUser(req).userId,
      body.ttlSeconds,
    );
    await platform.audit({
      orgId: site.orgId,
      actorUserId: requireUser(req).userId,
      action: "chaos.started",
      objectType: "site",
      objectId: site.id,
      requestId: req.id,
      metadata: {
        mode: body.mode,
        versionId: site.publishedVersionId,
        ttlSeconds: body.ttlSeconds,
      },
    });
    return {
      data: {
        mode: body.mode,
        label: "Controlled test",
        versionId: site.publishedVersionId,
        expiresInSeconds: body.ttlSeconds,
      },
    };
  });
  app.delete("/api/sites/:id/chaos", async (req) => {
    const { site } = await siteFor(req, idParam.parse(req.params).id, "ADMIN");
    await ops.clearFault(site.id);
    await platform.audit({
      orgId: site.orgId,
      actorUserId: requireUser(req).userId,
      action: "chaos.cleared",
      objectType: "site",
      objectId: site.id,
      requestId: req.id,
    });
    return { data: { cleared: true } };
  });
}
