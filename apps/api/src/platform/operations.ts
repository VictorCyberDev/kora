import type { FastifyBaseLogger } from "fastify";
import {
  affectedComponents,
  validateGraph,
  type SiteGraph,
} from "@kora/topology";
import {
  evaluatePolicy,
  type PolicyInput,
  type Role,
} from "@kora/policy-engine";
import {
  ACTION_OWNER_TEXT,
  deterministicReasoning,
  ownerCategoryText,
  ownerFindingText,
  ownerHeadline,
  reason,
  type ActionType,
  type ChangeLike,
  type LlmClient,
  type ReasonerInput,
} from "@kora/reasoner";
import type { SiteSpec } from "@kora/site-schema";
import type { KoraConfig } from "../config.js";
import { deterministicHash } from "../diagnosis.js";
import type { KoraStore } from "../store.js";
import type { PlatformConfig } from "./config.js";
import { HttpError, notFound } from "./http.js";
import { OpsStore, type ActionRecord, type ActionState } from "./ops-store.js";
import type { SitePublisher } from "./publisher.js";
import type { PublishService, SiteMonitors } from "./services.js";
import { redactSecrets } from "./security.js";
import type { PlatformStore } from "./store.js";

type Site = NonNullable<Awaited<ReturnType<PlatformStore["getSite"]>>>;
export interface Principal {
  userId: string | null;
  role: Role;
  requestId?: string | undefined;
}
const SYSTEM: Principal = { userId: null, role: "MEMBER" };
const CHANGE_WINDOW_SECONDS = 900;
/** Capability names understood by the policy engine, from the publisher's documented abilities. */
const policyCapabilities = (p: SitePublisher) =>
  new Set(p.capabilities.has("REPUBLISH") ? ["REPUBLISH"] : []);

export class Operations {
  constructor(
    private readonly d: {
      kora: KoraStore;
      platform: PlatformStore;
      ops: OpsStore;
      monitors: SiteMonitors;
      publishing: PublishService;
      publisher: SitePublisher;
      llm: LlmClient | null;
      config: PlatformConfig;
      koraConfig: KoraConfig;
      log: FastifyBaseLogger;
      now?: () => Date;
    },
  ) {}
  private now() {
    return this.d.now?.() ?? new Date();
  }

  // ---- graph & changes -------------------------------------------------------
  /** Only relationships Kora actually knows from its own records. */
  async siteGraph(site: Site): Promise<SiteGraph> {
    const { ops, platform } = this.d;
    const binding = await ops.getSiteBinding(site.id);
    const nodes: SiteGraph["nodes"][number][] = [
      { id: "site", kind: "site", label: site.name },
      { id: "health", kind: "health_endpoint", label: "Website health check" },
    ];
    const edges: SiteGraph["edges"][number][] = [];
    if (binding?.resource) {
      nodes.push({
        id: "workspace",
        kind: "provider_workspace",
        label: binding.resource.providerAccount,
      });
      nodes.push({
        id: "resource",
        kind: binding.provider === "rumptycloud" ? "storage" : "deployment",
        label: `${binding.provider}:${binding.resource.resourceType}`,
      });
      edges.push({ from: "workspace", to: "resource", relationship: "HOSTS" });
      edges.push({ from: "resource", to: "health", relationship: "EXPOSES" });
      edges.push({ from: "resource", to: "site", relationship: "DEPLOYED_AS" });
    }
    const version = site.publishedVersionId
      ? await platform.getVersion(site.id, site.publishedVersionId)
      : null;
    if (version) {
      nodes.push({
        id: "version",
        kind: "site_version",
        label: `Version ${version.number}`,
      });
      if (binding?.resource)
        edges.push({
          from: "version",
          to: "resource",
          relationship: "DEPLOYED_AS",
        });
    }
    const spec = site.publishedVersionId
      ? ((await platform.getVersionRow(site.id, site.publishedVersionId))
          ?.spec as SiteSpec | undefined)
      : undefined;
    const hasForm = Boolean(
      this.d.config.KORA_PUBLIC_URL &&
      spec?.pages.some((p) =>
        p.sections.some((s) => s.type === "contact" && s.form),
      ),
    );
    if (hasForm) {
      nodes.push({ id: "forms", kind: "forms_backend", label: "Contact form" });
      edges.push({ from: "site", to: "forms", relationship: "DEPENDS_ON" });
    }
    for (const dom of await ops.domainsForSite(site.id)) {
      if (dom.state !== "ACTIVE") continue;
      nodes.push({
        id: `domain:${dom.hostname}`,
        kind: "domain",
        label: dom.hostname,
      });
      edges.push({
        from: `domain:${dom.hostname}`,
        to: "site",
        relationship: "ROUTES_TO",
      });
    }
    edges.push({ from: "health", to: "site", relationship: "MONITORS" });
    const graph = { nodes, edges };
    const problems = validateGraph(graph);
    if (problems.length)
      throw new Error(`graph invariant violated: ${problems[0]}`);
    return graph;
  }
  /** Business impact in plain words, claiming only what the graph contains. */
  impactFor(graph: SiteGraph, failedId = "health") {
    const hit = affectedComponents(graph, failedId);
    const notes = ["Your website is unavailable"];
    if (hit.some((n) => n.kind === "forms_backend"))
      notes.push("The contact form is affected");
    for (const n of hit)
      if (n.kind === "domain") notes.push(`${n.label} is affected`);
    return { affected: hit.map((n) => n.id), notes: [...new Set(notes)] };
  }
  correlate(
    changes: Array<{
      id: string;
      kind: string;
      occurredAt: string;
      revision: string | null;
    }>,
    firstFailureAt: string | null,
  ): ChangeLike[] {
    const t = firstFailureAt ? new Date(firstFailureAt).getTime() : null;
    return changes.map((c) => ({
      id: c.id,
      kind: c.kind,
      occurredAt: c.occurredAt,
      revision: c.revision,
      secondsBeforeFailure:
        t === null
          ? null
          : Math.round((t - new Date(c.occurredAt).getTime()) / 1000),
    }));
  }

  // ---- reasoning --------------------------------------------------------------
  async buildReasonerInput(incidentId: string): Promise<{
    input: ReasonerInput;
    snapshotId: string;
    site: Site | null;
    versionIds: string[];
  } | null> {
    const { kora, ops, platform } = this.d;
    const incident = await ops.incidentRow(incidentId);
    if (!incident) return null;
    const computed = await kora.computeDiagnosticSnapshot(incidentId);
    if (!computed) return null;
    const stored = await kora.persistDiagnosticSnapshot(computed);
    const ref = await ops.siteForService(incident.serviceId);
    const site = ref ? await platform.getSite(ref.siteId) : null;
    let changes: ChangeLike[] = [];
    let graph: SiteGraph = { nodes: [], edges: [] };
    let rollbackTarget: string | null = null;
    if (site) {
      const recent = (await ops.listChanges(site.id, 30)).filter((c) =>
        [
          "VERSION_PUBLISHED",
          "DEPLOYMENT_FAILED",
          "DEPLOYMENT_REVISION_CHANGED",
          "DOMAIN_STATUS_CHANGED",
          "ACTION_EXECUTED",
        ].includes(c.kind),
      );
      changes = this.correlate(recent, computed.temporal.firstFailureAt).filter(
        (c) =>
          c.secondsBeforeFailure === null ||
          (c.secondsBeforeFailure >= -CHANGE_WINDOW_SECONDS &&
            c.secondsBeforeFailure <= 24 * 3600),
      );
      graph = await this.siteGraph(site);
      const published = await platform.getPublishedVersionRow(site.id);
      if (published)
        rollbackTarget =
          ((
            await platform.getPreviousKnownGood(
              site.id,
              Number(published.number),
            )
          )?.id as string | undefined) ?? null;
    }
    const permitted: ActionType[] = ["run_health_check"];
    if (
      site &&
      this.d.publisher.capabilities.has("REPUBLISH") &&
      rollbackTarget
    )
      permitted.push("republish_site_version");
    const impact = this.impactFor(graph);
    const latest = (await ops.listActions(incidentId)).at(-1);
    const verification = latest ? await ops.getVerification(latest.id) : null;
    const input: ReasonerInput = {
      incident: {
        id: incident.id,
        state: incident.state,
        startedAt: incident.startedAt,
        resolvedAt: incident.resolvedAt,
      },
      snapshot: computed,
      topology: {
        components: graph.nodes.map((n) => ({
          id: n.id,
          kind: n.kind,
          label: n.label,
        })),
        affected: impact.affected,
      },
      recentChanges: changes,
      verification: verification ? { outcome: verification.outcome } : null,
      permittedActions: permitted,
      rollbackTargetVersionId: rollbackTarget,
    };
    return {
      input,
      snapshotId: stored.snapshot.snapshotId,
      site,
      versionIds: rollbackTarget ? [rollbackTarget] : [],
    };
  }

  async reasonAbout(incidentId: string) {
    const built = await this.buildReasonerInput(incidentId);
    if (!built) throw notFound();
    const result = await reason(this.d.llm, built.input, {
      versionIds: built.versionIds,
    });
    const id = await this.d.ops.saveReasoning({
      incidentId,
      snapshotId: built.snapshotId,
      source: result.source,
      model: result.model,
      output: result.output,
      rejectionReason: result.rejectionReason,
      inputHash: result.inputHash,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    });
    if (built.site && result.source === "MODEL") {
      if (result.inputTokens)
        await this.d.platform.recordUsage(
          built.site.orgId,
          built.site.id,
          "AI_INPUT_TOKENS",
          result.inputTokens,
        );
      if (result.outputTokens)
        await this.d.platform.recordUsage(
          built.site.orgId,
          built.site.id,
          "AI_OUTPUT_TOKENS",
          result.outputTokens,
        );
    }
    return { id, ...result, snapshotId: built.snapshotId };
  }

  // ---- proposals & policy -------------------------------------------------------
  private async emit(
    type:
      | "ActionProposed"
      | "ActionApproved"
      | "ActionRejected"
      | "ActionExecuted"
      | "ActionFailed"
      | "RecoveryVerified"
      | "RecoveryFailed",
    a: ActionRecord,
    payload: Record<string, unknown>,
  ) {
    await this.d.kora.recordEvent({
      eventId: crypto.randomUUID(),
      eventType: type,
      schemaVersion: 1,
      occurredAt: this.now().toISOString(),
      source: "kora-remediation",
      serviceId: a.serviceId,
      correlationId: a.incidentId,
      payload: { actionId: a.id, actionType: a.type, ...payload },
    });
  }
  private async audit(
    a: ActionRecord,
    principal: Principal,
    action: string,
    metadata: Record<string, unknown> = {},
  ) {
    await this.d.platform.audit({
      orgId: a.orgId,
      actorUserId: principal.userId,
      actorKind: principal.userId ? "USER" : "SYSTEM",
      action,
      objectType: "action",
      objectId: a.id,
      requestId: principal.requestId ?? null,
      metadata: { actionType: a.type, incidentId: a.incidentId, ...metadata },
    });
  }

  async propose(
    i: {
      incidentId: string;
      type: string;
      parameters?: Record<string, unknown>;
      reason: string;
      proposedBy: string;
      reasonerOutputId?: string | null;
    },
    principal: Principal,
  ): Promise<ActionRecord> {
    const { ops, platform, publisher } = this.d;
    const incident = await ops.incidentRow(i.incidentId);
    if (!incident) throw notFound();
    const ref = await ops.siteForService(incident.serviceId);
    if (!ref)
      throw new HttpError(
        409,
        "not_a_site_incident",
        "Only incidents on Kora sites can have actions.",
      );
    const site = (await platform.getSite(ref.siteId))!;
    const parameters = i.parameters ?? {};
    const existing = await ops.findLiveProposal(
      i.incidentId,
      i.type,
      parameters,
    );
    if (existing) return existing;
    const generation = await ops.countProposals(
      i.incidentId,
      i.type,
      parameters,
    );
    const action = await ops.insertProposal({
      orgId: site.orgId,
      siteId: site.id,
      incidentId: i.incidentId,
      serviceId: incident.serviceId,
      type: i.type,
      parameters,
      reason: redactSecrets(i.reason).slice(0, 500),
      proposedBy: i.proposedBy,
      reasonerOutputId: i.reasonerOutputId ?? null,
      idempotencyKey: OpsStore.idempotencyKey(
        i.incidentId,
        i.type,
        parameters,
        generation,
      ),
    });
    await this.emit("ActionProposed", action, {
      reason: action.reason,
      proposedBy: i.proposedBy,
    });
    await this.audit(action, principal, "action.proposed", {
      proposedBy: i.proposedBy,
    });
    const binding = await ops.getSiteBinding(site.id);
    const r = binding?.resource;
    const input: PolicyInput = {
      orgId: site.orgId,
      siteId: site.id,
      incident: { id: incident.id, severity: incident.severity },
      action: { type: i.type, parameters },
      target: {
        providerResourceId: r?.providerResourceId ?? null,
        identityComplete: Boolean(
          binding &&
          r &&
          binding.provider &&
          r.providerAccount &&
          r.region &&
          r.region !== "unspecified" &&
          r.resourceType &&
          r.providerResourceId,
        ),
        capabilities: policyCapabilities(publisher),
        publishedVersionId: site.publishedVersionId,
      },
      history: await ops.executionHistory(i.incidentId),
      blastRadius: { affectsPublicSite: true, sitesAffected: 1 },
      actorRole: principal.role,
      now: this.now(),
    };
    const decision = evaluatePolicy(input);
    await ops.savePolicyDecision(action.id, {
      ...decision,
      input: {
        ...input,
        target: {
          ...input.target,
          capabilities: [...input.target.capabilities],
        },
      },
    });
    await ops.transition(action.id, "PROPOSED", "POLICY_EVALUATED");
    const next: ActionState =
      decision.decision === "ALLOW"
        ? "READY"
        : decision.decision === "DENY"
          ? "DENIED"
          : "AWAITING_APPROVAL";
    await ops.transition(action.id, "POLICY_EVALUATED", next);
    if (next === "DENIED") {
      await this.emit("ActionRejected", action, {
        by: "policy",
        policyCode: decision.policyCode,
      });
      await this.audit(action, principal, "action.denied", {
        policyCode: decision.policyCode,
      });
    }
    if (next === "AWAITING_APPROVAL")
      await platform.notify({
        orgId: site.orgId,
        siteId: site.id,
        kind: "APPROVAL_REQUIRED",
        title: "Approval needed",
        body: `Kora recommends: ${ACTION_OWNER_TEXT[i.type] ?? i.type}.`,
        objectType: "action",
        objectId: action.id,
        dedupeKey: `approval:${action.id}`,
      });
    if (next === "READY") return this.execute(action.id, principal);
    return (await ops.getAction(action.id))!;
  }

  async approve(actionId: string, principal: Principal, note: string | null) {
    const { ops } = this.d;
    const a = await ops.getAction(actionId);
    if (!a) throw notFound();
    if (a.state !== "AWAITING_APPROVAL")
      throw new HttpError(
        409,
        "not_awaiting_approval",
        `Action is ${a.state}.`,
      );
    const decision = await ops.latestPolicyDecision(a.id);
    if (decision?.expiresAt && new Date(decision.expiresAt) < this.now()) {
      await ops.transition(a.id, "AWAITING_APPROVAL", "EXPIRED");
      await this.audit(a, principal, "action.expired");
      throw new HttpError(
        409,
        "approval_expired",
        "This approval request has expired.",
      );
    }
    if (!principal.userId)
      throw new HttpError(403, "forbidden", "Only a person can approve.");
    if (!(await ops.saveApproval(a.id, "APPROVED", principal.userId, note)))
      throw new HttpError(409, "already_decided");
    if (!(await ops.transition(a.id, "AWAITING_APPROVAL", "READY")))
      throw new HttpError(409, "state_changed");
    await this.emit("ActionApproved", a, { approvedBy: principal.userId });
    await this.audit(a, principal, "action.approved");
    return (await ops.getAction(a.id))!;
  }
  async reject(actionId: string, principal: Principal, note: string | null) {
    const { ops } = this.d;
    const a = await ops.getAction(actionId);
    if (!a) throw notFound();
    if (a.state !== "AWAITING_APPROVAL")
      throw new HttpError(
        409,
        "not_awaiting_approval",
        `Action is ${a.state}.`,
      );
    if (!principal.userId) throw new HttpError(403, "forbidden");
    await ops.saveApproval(a.id, "REJECTED", principal.userId, note);
    await ops.transition(a.id, "AWAITING_APPROVAL", "REJECTED");
    await this.emit("ActionRejected", a, { by: principal.userId });
    await this.audit(a, principal, "action.rejected");
    return (await ops.getAction(a.id))!;
  }

  // ---- execution ---------------------------------------------------------------
  async execute(actionId: string, principal: Principal): Promise<ActionRecord> {
    const { ops, platform, monitors, publishing } = this.d;
    const a = await ops.getAction(actionId);
    if (!a) throw notFound();
    if (!(await ops.transition(a.id, "READY", "EXECUTING")))
      throw new HttpError(409, "not_ready", `Action is ${a.state}.`);
    const site = (await platform.getSite(a.siteId!))!;
    const startedAt = this.now();
    let outcome:
      | "SUCCEEDED"
      | "FAILED"
      | "UNSUPPORTED"
      | "REQUIRES_MANUAL_PROVIDER_ACTION"
      | "TIMED_OUT" = "FAILED";
    let responseClass = "ERROR";
    let trace: Record<string, unknown> = {};
    let executor = "none";
    try {
      if (a.type === "run_health_check") {
        executor = "health-monitor";
        const o = await monitors.checkNow(site.id);
        outcome = "SUCCEEDED";
        responseClass = "OBSERVED";
        trace = {
          healthy: o.healthy,
          httpStatus: o.httpStatus,
          observationId: o.id,
          note: "a health check observes only; it is not recovery",
        };
      } else if (a.type === "republish_site_version") {
        executor = this.d.publisher.name;
        const versionId = String(
          (a.parameters as { versionId?: string }).versionId,
        );
        const out = await publishing.publish(site, versionId, {
          userId: principal.userId,
          requestId: principal.requestId,
        });
        outcome = "SUCCEEDED";
        responseClass = "PUBLISHED";
        trace = {
          kind: out.kind,
          versionId,
          publicUrl: out.publicUrl,
          deployedHash: out.deployedHash,
          verification: out.verification,
          note: "publishing is not recovery; only new health observations are",
        };
      } else {
        outcome = "REQUIRES_MANUAL_PROVIDER_ACTION";
        responseClass = "NO_DOCUMENTED_INTERFACE";
        trace = { reason: "no documented provider interface for this action" };
      }
    } catch (error) {
      outcome = "FAILED";
      responseClass = "EXCEPTION";
      trace = {
        error: redactSecrets(
          error instanceof Error ? error.message : String(error),
        ).slice(0, 500),
      };
    }
    const finishedAt = this.now();
    await ops.saveExecution(a.id, {
      executor,
      outcome,
      responseClass,
      trace,
      startedAt,
      finishedAt,
    });
    const ok = outcome === "SUCCEEDED";
    await ops.transition(
      a.id,
      "EXECUTING",
      ok ? "EXECUTED" : "EXECUTION_FAILED",
    );
    await this.emit(ok ? "ActionExecuted" : "ActionFailed", a, {
      outcome,
      responseClass,
    });
    await ops.recordChange({
      orgId: a.orgId,
      siteId: a.siteId,
      serviceId: a.serviceId,
      kind: "ACTION_EXECUTED",
      source: "kora-remediation",
      provider: executor,
      metadata: { actionId: a.id, actionType: a.type, outcome },
      provenance: "kora:remediation",
    });
    await platform.recordUsage(site.orgId, site.id, "ACTION_EXECUTION", 1, {
      type: a.type,
      outcome,
    });
    await this.audit(
      a,
      principal,
      ok ? "action.executed" : "action.execution_failed",
      { outcome, responseClass },
    );
    // EXECUTED is never success. Anything that changes the workload must now be verified from new observations.
    if (ok && a.type !== "run_health_check")
      await ops.transition(a.id, "EXECUTED", "VERIFYING");
    return (await ops.getAction(a.id))!;
  }

  // ---- closed loop ---------------------------------------------------------------
  /** Settles every VERIFYING action from observations recorded after its execution. */
  async verifyPending(): Promise<number> {
    const { ops, platform } = this.d;
    let settled = 0;
    for (const a of await ops.listActionsByState(["VERIFYING"])) {
      const execs = await ops.listExecutions(a.id);
      const windowStart = new Date(execs.at(-1)?.finishedAt ?? a.updatedAt!);
      const incident = await ops.incidentRow(a.incidentId);
      if (!incident) continue;
      const recovery = incident.resolvedAt
        ? await ops.lastRecoveryAfter(
            a.incidentId,
            new Date(windowStart.getTime() - 1000),
          )
        : null;
      const site = a.siteId ? await platform.getSite(a.siteId) : null;
      if (recovery && incident.resolvedAt) {
        const resolvedAt = new Date(incident.resolvedAt);
        const observationIds =
          (recovery.payload.recoveryObservationIds as string[] | undefined) ??
          [];
        const saved = await ops.saveVerification({
          actionId: a.id,
          incidentId: a.incidentId,
          outcome: "RECOVERY_VERIFIED",
          windowStartedAt: windowStart,
          decidedAt: this.now(),
          observationIds,
          recoverySeconds: Math.max(
            0,
            (resolvedAt.getTime() - new Date(incident.startedAt).getTime()) /
              1000,
          ),
          detail: {
            secondsAfterAction: Math.round(
              (resolvedAt.getTime() - windowStart.getTime()) / 1000,
            ),
            basis: "consecutive healthy observations after the action",
          },
        });
        if (
          saved &&
          (await ops.transition(a.id, "VERIFYING", "RECOVERY_VERIFIED"))
        ) {
          settled++;
          await this.emit("RecoveryVerified", a, { observationIds });
          await this.audit(a, SYSTEM, "action.recovery_verified");
          if (site)
            await platform.notify({
              orgId: site.orgId,
              siteId: site.id,
              kind: "RECOVERY_VERIFIED",
              title: "Website restored",
              body: "Recovery verified by new observations.",
              objectType: "action",
              objectId: a.id,
              dedupeKey: `recovered:${a.id}`,
            });
        }
      } else if (
        this.now().getTime() - windowStart.getTime() >
        this.d.config.ACTION_VERIFICATION_TIMEOUT_MS
      ) {
        const saved = await ops.saveVerification({
          actionId: a.id,
          incidentId: a.incidentId,
          outcome: "RECOVERY_FAILED",
          windowStartedAt: windowStart,
          decidedAt: this.now(),
          observationIds: [],
          recoverySeconds: null,
          detail: {
            reason:
              "the website was not healthy again within the verification window",
          },
        });
        if (
          saved &&
          (await ops.transition(a.id, "VERIFYING", "RECOVERY_FAILED"))
        ) {
          settled++;
          await this.emit("RecoveryFailed", a, {});
          await this.audit(a, SYSTEM, "action.recovery_failed");
          if (site)
            await platform.notify({
              orgId: site.orgId,
              siteId: site.id,
              kind: "RECOVERY_FAILED",
              title: "Recovery did not work",
              body: "The action ran, but the website is still not healthy. Kora has stopped; please review.",
              objectType: "action",
              objectId: a.id,
              dedupeKey: `recovery-failed:${a.id}`,
            });
        }
      }
    }
    return settled;
  }

  /** Incident hook: explain, then propose the first recommended action (policy decides what happens). */
  async onIncidentCreated(siteId: string, incidentId: string) {
    const { platform } = this.d;
    const site = await platform.getSite(siteId);
    if (!site) return;
    await platform.notify({
      orgId: site.orgId,
      siteId,
      kind: "SITE_DOWN",
      title: "Your website needs attention",
      body: "Kora detected that customers may not be able to reach your website.",
      objectType: "incident",
      objectId: incidentId,
      dedupeKey: `incident:${incidentId}`,
    });
    const r = await this.reasonAbout(incidentId);
    const top = r.output.recommendedActions[0];
    if (top)
      await this.propose(
        {
          incidentId,
          type: top.type,
          parameters: top.parameters,
          reason: top.reason,
          proposedBy:
            r.source === "MODEL" ? "kora-reasoner" : "kora-deterministic",
          reasonerOutputId: r.id,
        },
        SYSTEM,
      );
  }
  async onRecovered(siteId: string, incidentId: string) {
    await this.verifyPending();
    const site = await this.d.platform.getSite(siteId);
    if (site)
      await this.d.platform.notify({
        orgId: site.orgId,
        siteId,
        kind: "SITE_UP",
        title: "Your website is reachable again",
        body: "Kora's checks are passing again.",
        objectType: "incident",
        objectId: incidentId,
        dedupeKey: `up:${incidentId}`,
      });
  }

  // ---- Owner Mode read models ------------------------------------------------------
  async siteStatus(site: Site) {
    const { ops, platform } = this.d;
    const serviceId = await ops.serviceForSite(site.id);
    const base = {
      siteId: site.id,
      publicUrl: site.publicUrl,
      publishedVersionId: site.publishedVersionId,
    };
    if (!serviceId)
      return {
        ...base,
        headline: ownerHeadline({
          hasLiveUrl: false,
          hasObservations: false,
          latestHealthy: null,
          openIncident: false,
          actionState: null,
          recoveryVerified: false,
        }),
        latestCheck: null,
        uptime24h: null,
        openIncidentId: null,
        domains: [],
        version: null,
        deployment: null,
      };
    await this.verifyPending();
    const latest = await ops.latestObservation(serviceId);
    const incidents = await ops.incidentsForService(serviceId, 5);
    const open = incidents.find((i) => !i.resolvedAt) ?? null;
    const actions = open
      ? await ops.listActions(open.id)
      : incidents[0]
        ? await ops.listActions(incidents[0].id)
        : [];
    const lastAction = actions.at(-1);
    const recovered = Boolean(
      !open &&
      lastAction?.state === "RECOVERY_VERIFIED" &&
      incidents[0]?.resolvedAt &&
      Date.now() - new Date(incidents[0].resolvedAt).getTime() < 3600_000,
    );
    const headline = ownerHeadline({
      hasLiveUrl: Boolean(site.publicUrl && site.status === "PUBLISHED"),
      hasObservations: latest !== null,
      latestHealthy: latest?.healthy ?? null,
      openIncident: Boolean(open),
      actionState: open ? (lastAction?.state ?? null) : null,
      recoveryVerified: recovered,
    });
    const version = site.publishedVersionId
      ? await platform.getVersion(site.id, site.publishedVersionId)
      : null;
    const deployments = await ops.listDeployments(site.id);
    return {
      ...base,
      headline,
      latestCheck: latest,
      uptime24h: await ops.uptime(serviceId),
      openIncidentId: open?.id ?? null,
      domains: await ops.domainsForSite(site.id),
      version: version
        ? {
            id: version.id,
            number: version.number,
            artifactHash: version.artifactHash,
          }
        : null,
      deployment: deployments[0] ?? null,
    };
  }

  async ownerIncident(incidentId: string) {
    const { ops } = this.d;
    await this.verifyPending();
    const incident = await ops.incidentRow(incidentId);
    if (!incident) throw notFound();
    const built = await this.buildReasonerInput(incidentId);
    if (!built) throw notFound();
    const stored = await ops.latestReasoning(incidentId);
    const reasoning =
      (stored?.output as
        ReturnType<typeof deterministicReasoning> | undefined) ??
      deterministicReasoning(built.input);
    const snap = built.input.snapshot;
    const top = snap.findings[0];
    const failing = snap.evidence.filter((e) => e.healthy === false).at(-1);
    const actions = await ops.listActions(incidentId);
    const current = actions.at(-1) ?? null;
    const decision = current
      ? await ops.latestPolicyDecision(current.id)
      : null;
    const verification = current ? await ops.getVerification(current.id) : null;
    const graph = built.site
      ? await this.siteGraph(built.site)
      : { nodes: [], edges: [] };
    const impact = this.impactFor(graph);
    const resolved = incident.resolvedAt !== null;
    return {
      incident,
      siteId: built.site?.id ?? null,
      // Deterministic copy: status and sentences never come from the model.
      whatHappened: top
        ? ownerFindingText(top.code)
        : ownerCategoryText(failing?.failureCategory ?? null),
      affected: { websiteAffectedNow: !resolved, notes: impact.notes },
      began: snap.temporal.firstFailureAt ?? incident.startedAt,
      whatChanged: built.input.recentChanges
        .filter(
          (c) =>
            c.secondsBeforeFailure !== null &&
            c.secondsBeforeFailure >= 0 &&
            c.secondsBeforeFailure <= CHANGE_WINDOW_SECONDS,
        )
        .map((c) => ({
          kind: c.kind,
          at: c.occurredAt,
          secondsBeforeFailure: c.secondsBeforeFailure,
          revision: c.revision ?? null,
          text: `${c.kind === "VERSION_PUBLISHED" ? "A new version was published" : "A change was recorded"} ${c.secondsBeforeFailure} seconds before the first failed check. This is timing only; it does not prove the change caused the problem.`,
        })),
      whatWeKnow: reasoning.whatWeKnow,
      whatWeDoNotKnow: reasoning.whatWeDoNotKnow,
      explanation: {
        text: reasoning.ownerSummary,
        source: stored?.source ?? "DETERMINISTIC_FALLBACK",
        note: "Written by Kora's reasoner from the evidence; the status above is computed from observations.",
      },
      recommendedAction: current
        ? {
            actionId: current.id,
            type: current.type,
            text: ACTION_OWNER_TEXT[current.type] ?? current.type,
            state: current.state,
            reason: current.reason,
            policy: decision,
            requiresApproval: current.state === "AWAITING_APPROVAL",
            approvalExpiresAt: decision?.expiresAt ?? null,
          }
        : reasoning.recommendedActions[0]
          ? {
              actionId: null,
              type: reasoning.recommendedActions[0].type,
              text:
                ACTION_OWNER_TEXT[reasoning.recommendedActions[0].type] ?? "",
              state: "NOT_PROPOSED",
              reason: reasoning.recommendedActions[0].reason,
              policy: null,
              requiresApproval: false,
              approvalExpiresAt: null,
            }
          : null,
      verification: verification
        ? {
            state: verification.outcome,
            text:
              verification.outcome === "RECOVERY_VERIFIED"
                ? "Your website is working again and Kora has verified the recovery."
                : "The fix did not restore the website.",
            recoverySeconds: verification.recoverySeconds,
            decidedAt: verification.decidedAt,
          }
        : current?.state === "VERIFYING"
          ? {
              state: "VERIFYING",
              text: "Fix applied — verifying that customers can reach your website.",
              recoverySeconds: null,
              decidedAt: null,
            }
          : {
              state: "NOT_STARTED",
              text: "Recovery is verified only after a fix is applied and new checks pass.",
              recoverySeconds: null,
              decidedAt: null,
            },
      reasoningSource: stored?.source ?? "NOT_RUN",
    };
  }

  /** Passport v2 remediation section; null when the incident has no action trail. */
  async passportTrail(
    incidentId: string,
  ): Promise<Record<string, unknown> | null> {
    const { ops } = this.d;
    const actions = await ops.listActions(incidentId);
    if (!actions.length) return null;
    const reasoning = await ops.latestReasoning(incidentId);
    const items = [];
    for (const a of actions) {
      const item: Record<string, unknown> = {
        id: a.id,
        type: a.type,
        parameters: a.parameters,
        reason: a.reason,
        proposedBy: a.proposedBy,
        state: a.state,
        createdAt: a.createdAt,
        policyDecision: await ops.latestPolicyDecision(a.id),
        approval: await ops.getApproval(a.id),
        executions: await ops.listExecutions(a.id),
        recoveryVerification: await ops.getVerification(a.id),
      };
      items.push({
        ...(JSON.parse(JSON.stringify(item)) as Record<string, unknown>),
        contentHash: deterministicHash(
          JSON.parse(JSON.stringify(item)) as Record<string, unknown>,
        ),
      });
    }
    const siteId = actions[0]?.siteId;
    const changes = siteId ? await ops.listChanges(siteId, 20) : [];
    return JSON.parse(
      JSON.stringify({
        note: "Recovery is established only by new observations after the action, never by the action's own result.",
        actions: items,
        reasoner: reasoning
          ? {
              source: reasoning.source,
              model: reasoning.model,
              inputHash: reasoning.inputHash,
              rejectionReason: reasoning.rejectionReason,
              output: reasoning.output,
            }
          : null,
        recentChanges: changes.map((c) => ({
          kind: c.kind,
          occurredAt: c.occurredAt,
          revision: c.revision,
          provenance: c.provenance,
        })),
      }),
    ) as Record<string, unknown>;
  }
}
