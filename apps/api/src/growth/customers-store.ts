import type postgres from "postgres";
import {
  nextStatus,
  normalizePhone,
  type LeadEvent,
  type LeadSource,
  type LeadStatus,
} from "@kora/growth";

type Row = Record<string, unknown>;
const iso = (v: unknown) =>
  v ? new Date(v as string | Date).toISOString() : null;

export interface LeadRecord {
  id: string;
  siteId: string;
  customer: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
  };
  source: LeadSource;
  status: LeadStatus;
  summary: string;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}
const LEAD_SELECT = `l.id,l.site_id,l.source,l.status,l.summary,l.last_inbound_at,l.last_outbound_at,l.created_at,l.updated_at,
  c.id AS customer_id,c.name AS customer_name,c.phone AS customer_phone,c.email AS customer_email`;
const mapLead = (r: Row): LeadRecord => ({
  id: String(r.id),
  siteId: String(r.site_id),
  customer: {
    id: String(r.customer_id),
    name: String(r.customer_name),
    phone: (r.customer_phone as string | null) ?? null,
    email: (r.customer_email as string | null) ?? null,
  },
  source: r.source as LeadSource,
  status: r.status as LeadStatus,
  summary: String(r.summary),
  lastInboundAt: iso(r.last_inbound_at),
  lastOutboundAt: iso(r.last_outbound_at),
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
});

export class CustomersStore {
  constructor(private readonly sql: postgres.Sql) {}
  private tx<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
    return this.sql.begin((t) =>
      fn(t as unknown as postgres.Sql),
    ) as Promise<T>;
  }

  /** Finds the customer by phone or email within the site, or creates one. */
  private async customer(
    sql: postgres.Sql,
    i: {
      siteId: string;
      orgId: string;
      name: string;
      phone?: string | undefined;
      email?: string | undefined;
    },
  ) {
    const key = normalizePhone(i.phone);
    const email = i.email?.trim() || null;
    const found = (
      await sql`SELECT id FROM customers WHERE site_id=${i.siteId} AND ((${key}::text IS NOT NULL AND phone_key=${key}) OR (${email}::text IS NOT NULL AND lower(email)=lower(${email})))
        ORDER BY created_at LIMIT 1`
    )[0];
    if (found) {
      await sql`UPDATE customers SET name=CASE WHEN name='' THEN ${i.name.slice(0, 200)} ELSE name END,
        phone=COALESCE(phone,${i.phone ?? null}),phone_key=COALESCE(phone_key,${key}),email=COALESCE(email,${email}),updated_at=now() WHERE id=${String(found.id)}`;
      return String(found.id);
    }
    const id = crypto.randomUUID();
    await sql`INSERT INTO customers(id,site_id,org_id,name,phone,phone_key,email) VALUES(${id},${i.siteId},${i.orgId},${i.name.slice(0, 200)},${i.phone ?? null},${key},${email})`;
    return id;
  }

  /**
   * Creates a lead for an inbound enquiry, once. A repeat of the same (source, sourceRef) returns the existing lead
   * with `created: false`, which is what makes retried form posts and replayed webhooks harmless.
   */
  async ingest(i: {
    siteId: string;
    orgId: string;
    source: LeadSource;
    sourceRef: string;
    name: string;
    phone?: string | undefined;
    email?: string | undefined;
    summary: string;
    body: string;
    channel: "website" | "whatsapp" | "instagram" | "facebook";
    externalId?: string | undefined;
    at?: Date | undefined;
  }): Promise<{ leadId: string; created: boolean }> {
    return this.tx(async (sql) => {
      const dup = (
        await sql`SELECT id FROM leads WHERE site_id=${i.siteId} AND source=${i.source} AND source_ref=${i.sourceRef}`
      )[0];
      const at = (i.at ?? new Date()).toISOString();
      if (dup && !i.externalId)
        return { leadId: String(dup.id), created: false };
      // A later message in a known conversation is a new message on the existing lead, not a new lead.
      const customerId = dup ? null : await this.customer(sql, i);
      const leadId = dup ? String(dup.id) : crypto.randomUUID();
      if (!dup)
        await sql`INSERT INTO leads(id,site_id,org_id,customer_id,source,source_ref,status,summary,last_inbound_at,created_at,updated_at)
          VALUES(${leadId},${i.siteId},${i.orgId},${customerId},${i.source},${i.sourceRef},'NEW',${i.summary.slice(0, 500)},${at},${at},${at})`;
      const ins =
        await sql`INSERT INTO lead_messages(id,lead_id,site_id,org_id,direction,channel,body,external_id,created_at)
        VALUES(${crypto.randomUUID()},${leadId},${i.siteId},${i.orgId},'IN',${i.channel},${i.body.slice(0, 4000)},${i.externalId ?? null},${at})
        ON CONFLICT (site_id, channel, external_id) WHERE external_id IS NOT NULL DO NOTHING RETURNING id`;
      if (dup && ins.length) {
        const cur = (
          await sql`SELECT status FROM leads WHERE id=${leadId} FOR UPDATE`
        )[0]!;
        await sql`UPDATE leads SET status=${nextStatus(cur.status as LeadStatus, { type: "inbound_message" })},last_inbound_at=${at},updated_at=now() WHERE id=${leadId}`;
      }
      return { leadId, created: !dup };
    });
  }

  /** Pulls website form submissions into the hub. Idempotent: each submission becomes exactly one lead. */
  async syncFormLeads(siteId: string, orgId: string) {
    const rows = await this
      .sql`SELECT s.id,s.fields,s.submitted_at FROM form_submissions s
      WHERE s.site_id=${siteId} AND NOT EXISTS (SELECT 1 FROM leads l WHERE l.site_id=s.site_id AND l.source='WEBSITE_FORM' AND l.source_ref=s.id::text)
      ORDER BY s.submitted_at LIMIT 200`;
    for (const r of rows) {
      const f = r.fields as Record<string, string>;
      const text = f.message ?? f.service ?? "";
      await this.ingest({
        siteId,
        orgId,
        source: "WEBSITE_FORM",
        sourceRef: String(r.id),
        channel: "website",
        name: f.name ?? "",
        phone: f.phone,
        email: f.email,
        summary: (f.service ? `${f.service}: ` : "") + text.slice(0, 200),
        body:
          Object.entries(f)
            .map(([k, v]) => `${k}: ${v}`)
            .join("\n") || "(empty message)",
        at: new Date(r.submitted_at as string),
      });
    }
    return rows.length;
  }

  async list(siteId: string, status?: LeadStatus[]) {
    const rows = status?.length
      ? await this.sql.unsafe(
          `SELECT ${LEAD_SELECT} FROM leads l JOIN customers c ON c.id=l.customer_id WHERE l.site_id=$1 AND l.status = ANY($2) ORDER BY l.updated_at DESC LIMIT 200`,
          [siteId, status],
        )
      : await this.sql.unsafe(
          `SELECT ${LEAD_SELECT} FROM leads l JOIN customers c ON c.id=l.customer_id WHERE l.site_id=$1 ORDER BY l.updated_at DESC LIMIT 200`,
          [siteId],
        );
    return rows.map((r) => mapLead(r as Row));
  }
  async get(siteId: string, leadId: string): Promise<LeadRecord | null> {
    const r = (
      await this.sql.unsafe(
        `SELECT ${LEAD_SELECT} FROM leads l JOIN customers c ON c.id=l.customer_id WHERE l.site_id=$1 AND l.id=$2`,
        [siteId, leadId],
      )
    )[0];
    return r ? mapLead(r as Row) : null;
  }
  async messages(siteId: string, leadId: string) {
    return (
      await this
        .sql`SELECT id,direction,channel,body,created_at FROM lead_messages WHERE site_id=${siteId} AND lead_id=${leadId} ORDER BY created_at, id`
    ).map((r) => ({
      id: String(r.id),
      direction: String(r.direction),
      channel: String(r.channel),
      body: String(r.body),
      createdAt: iso(r.created_at),
    }));
  }
  async followUps(siteId: string, leadId?: string) {
    const rows = leadId
      ? await this
          .sql`SELECT id,lead_id,due_at,note,done_at FROM follow_ups WHERE site_id=${siteId} AND lead_id=${leadId} ORDER BY due_at`
      : await this
          .sql`SELECT id,lead_id,due_at,note,done_at FROM follow_ups WHERE site_id=${siteId} AND done_at IS NULL ORDER BY due_at LIMIT 100`;
    return rows.map((r) => ({
      id: String(r.id),
      leadId: String(r.lead_id),
      dueAt: iso(r.due_at),
      note: String(r.note),
      doneAt: iso(r.done_at),
    }));
  }

  /** Applies a lead event under a row lock so concurrent updates cannot skip a state. */
  async apply(
    siteId: string,
    leadId: string,
    ev: LeadEvent,
    extra?: { outbound?: boolean },
  ) {
    return this.tx(async (sql) => {
      const cur = (
        await sql`SELECT status FROM leads WHERE site_id=${siteId} AND id=${leadId} FOR UPDATE`
      )[0];
      if (!cur) return null;
      const next = nextStatus(cur.status as LeadStatus, ev);
      await sql`UPDATE leads SET status=${next},updated_at=now(),last_outbound_at=CASE WHEN ${extra?.outbound === true} THEN now() ELSE last_outbound_at END WHERE id=${leadId}`;
      return { from: cur.status as LeadStatus, to: next };
    });
  }
  async addMessage(i: {
    siteId: string;
    orgId: string;
    leadId: string;
    direction: "OUT" | "NOTE";
    channel: "manual" | "whatsapp";
    body: string;
    userId: string;
  }) {
    await this
      .sql`INSERT INTO lead_messages(id,lead_id,site_id,org_id,direction,channel,body,created_by) VALUES(${crypto.randomUUID()},${i.leadId},${i.siteId},${i.orgId},${i.direction},${i.channel},${i.body},${i.userId})`;
  }
  async addFollowUp(i: {
    siteId: string;
    orgId: string;
    leadId: string;
    dueAt: Date;
    note: string;
    userId: string;
  }) {
    const id = crypto.randomUUID();
    await this
      .sql`INSERT INTO follow_ups(id,lead_id,site_id,org_id,due_at,note,created_by) VALUES(${id},${i.leadId},${i.siteId},${i.orgId},${i.dueAt.toISOString()},${i.note},${i.userId})`;
    return id;
  }
  async completeFollowUp(siteId: string, id: string) {
    const r = await this
      .sql`UPDATE follow_ups SET done_at=now() WHERE site_id=${siteId} AND id=${id} AND done_at IS NULL RETURNING id`;
    return r.length > 0;
  }
  async counts(siteId: string, now: Date) {
    const r = (
      await this
        .sql`SELECT COUNT(*) FILTER (WHERE status IN ('NEW','NEEDS_REPLY'))::int AS waiting,
        COUNT(*) FILTER (WHERE status IN ('NEW','NEEDS_REPLY') AND last_inbound_at < ${new Date(now.getTime() - 24 * 3_600_000).toISOString()})::int AS waiting_over_day,
        MIN(last_inbound_at) FILTER (WHERE status IN ('NEW','NEEDS_REPLY')) AS oldest,
        COUNT(*)::int AS total FROM leads WHERE site_id=${siteId}`
    )[0]!;
    const f = (
      await this
        .sql`SELECT COUNT(*)::int AS n FROM follow_ups WHERE site_id=${siteId} AND done_at IS NULL AND due_at <= ${now.toISOString()}`
    )[0]!;
    return {
      waiting: Number(r.waiting),
      waitingOverDay: Number(r.waiting_over_day),
      oldestWaitingAt: iso(r.oldest),
      total: Number(r.total),
      followUpsDue: Number(f.n),
    };
  }
}
