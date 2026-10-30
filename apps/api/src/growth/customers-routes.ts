import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { LEAD_STATUSES, waLink, whatsappWindow } from "@kora/growth";
import {
  HttpError,
  notFound,
  requireOrgRole,
  requireUser,
  type Role,
} from "../platform/http.js";
import type { PlatformStore } from "../platform/store.js";
import type { BillingService } from "../platform/billing.js";
import type { CustomersStore } from "./customers-store.js";
import { requireFeature } from "./entitlements.js";

export interface CustomerDeps {
  platform: PlatformStore;
  billing: BillingService;
  customers: CustomersStore;
  now?: () => Date;
}
const uuid = z.string().uuid();

export function registerCustomerRoutes(app: FastifyInstance, d: CustomerDeps) {
  const { platform, billing, customers } = d;
  const now = d.now ?? (() => new Date());
  const siteFor = async (req: FastifyRequest, min: Role = "VIEWER") => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    const site = await platform.getSite(id);
    if (!site) throw notFound();
    requireOrgRole(req, site.orgId, min);
    return site;
  };
  const leadFor = async (req: FastifyRequest, min: Role = "VIEWER") => {
    const site = await siteFor(req, min);
    const { leadId } = z.object({ leadId: uuid }).parse(req.params);
    const lead = await customers.get(site.id, leadId);
    if (!lead) throw notFound();
    return { site, lead };
  };

  /** Home's "N customers are waiting for a reply". Syncs website enquiries first so the count is never stale. */
  app.get("/api/sites/:id/customers/summary", async (req) => {
    const site = await siteFor(req);
    await customers.syncFormLeads(site.id, site.orgId);
    return { data: await customers.counts(site.id, now()) };
  });

  app.get("/api/sites/:id/leads", async (req) => {
    const site = await siteFor(req);
    const q = z.object({ status: z.string().optional() }).parse(req.query);
    const status = q.status
      ? z.array(z.enum(LEAD_STATUSES)).parse(q.status.split(","))
      : undefined;
    await customers.syncFormLeads(site.id, site.orgId);
    return {
      data: {
        leads: await customers.list(site.id, status),
        counts: await customers.counts(site.id, now()),
        followUps: await customers.followUps(site.id),
      },
    };
  });

  app.get("/api/sites/:id/leads/:leadId", async (req) => {
    const { site, lead } = await leadFor(req);
    const messages = await customers.messages(site.id, lead.id);
    const win = whatsappWindow(
      lead.lastInboundAt ? new Date(lead.lastInboundAt) : null,
      now(),
    );
    return {
      data: {
        lead,
        messages,
        followUps: await customers.followUps(site.id, lead.id),
        whatsapp: {
          link: waLink(lead.customer.phone),
          // Free-form replies are only allowed inside 24h of the customer's last message.
          windowOpen: win.open && lead.source === "WHATSAPP",
          windowClosesAt: win.closesAt?.toISOString() ?? null,
        },
      },
    };
  });

  /** Opening a brand-new lead marks it seen (NEW -> NEEDS_REPLY). */
  app.post("/api/sites/:id/leads/:leadId/seen", async (req) => {
    const { site, lead } = await leadFor(req, "MEMBER");
    const r = await customers.apply(site.id, lead.id, { type: "owner_viewed" });
    return { data: { status: r?.to ?? lead.status } };
  });

  app.post("/api/sites/:id/leads/:leadId/status", async (req) => {
    const { site, lead } = await leadFor(req, "MEMBER");
    await requireFeature(billing, site.orgId, "customers.hub");
    const body = z
      .object({ status: z.enum(LEAD_STATUSES) })
      .strict()
      .parse(req.body);
    const r = await customers.apply(site.id, lead.id, {
      type: "set",
      status: body.status,
    });
    await platform.audit({
      orgId: site.orgId,
      actorUserId: requireUser(req).userId,
      action: "lead.status_changed",
      objectType: "lead",
      objectId: lead.id,
      requestId: req.id,
      metadata: { from: r?.from, to: r?.to },
    });
    return { data: { status: r?.to } };
  });

  /**
   * Records a reply the owner sent (for example from their own WhatsApp) or a private note. Kora does not send
   * anything from here: sending through a provider arrives with the Publishing/Messaging engine and its approval flow.
   */
  app.post("/api/sites/:id/leads/:leadId/messages", async (req, reply) => {
    const { site, lead } = await leadFor(req, "MEMBER");
    await requireFeature(billing, site.orgId, "customers.hub");
    const body = z
      .object({
        kind: z.enum(["reply_sent", "note"]),
        body: z.string().trim().min(1).max(4000),
      })
      .strict()
      .parse(req.body);
    const a = requireUser(req);
    await customers.addMessage({
      siteId: site.id,
      orgId: site.orgId,
      leadId: lead.id,
      userId: a.userId,
      body: body.body,
      direction: body.kind === "note" ? "NOTE" : "OUT",
      channel: "manual",
    });
    if (body.kind === "reply_sent")
      await customers.apply(
        site.id,
        lead.id,
        { type: "owner_replied" },
        { outbound: true },
      );
    await platform.audit({
      orgId: site.orgId,
      actorUserId: a.userId,
      action: body.kind === "note" ? "lead.note_added" : "lead.reply_logged",
      objectType: "lead",
      objectId: lead.id,
      requestId: req.id,
    });
    return reply.code(201).send({ data: { ok: true } });
  });

  app.post("/api/sites/:id/leads/:leadId/follow-ups", async (req, reply) => {
    const { site, lead } = await leadFor(req, "MEMBER");
    await requireFeature(billing, site.orgId, "customers.hub");
    const body = z
      .object({
        dueAt: z.string().datetime(),
        note: z.string().trim().max(500).default(""),
      })
      .strict()
      .parse(req.body);
    const due = new Date(body.dueAt);
    if (due.getTime() < now().getTime() - 60_000)
      throw new HttpError(422, "date_in_past", "Pick a time in the future.");
    const id = await customers.addFollowUp({
      siteId: site.id,
      orgId: site.orgId,
      leadId: lead.id,
      dueAt: due,
      note: body.note,
      userId: requireUser(req).userId,
    });
    return reply.code(201).send({ data: { id } });
  });

  app.post("/api/sites/:id/follow-ups/:followUpId/done", async (req) => {
    const site = await siteFor(req, "MEMBER");
    const { followUpId } = z.object({ followUpId: uuid }).parse(req.params);
    if (!(await customers.completeFollowUp(site.id, followUpId)))
      throw notFound();
    return { data: { done: true } };
  });
}
