import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { HttpError, notFound, requireOrgRole, requireUser } from "./http.js";
import { sha256Hex } from "./security.js";
import type { PlatformStore } from "./store.js";

export type SubscriptionState =
  "TRIAL" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED";
export const GRACE_DAYS = 7;
export const TRIAL_DAYS = 30;

export interface PlanCapabilities {
  sites: number;
  customDomain: boolean;
  aiOperationsPerMonth: number;
  storageMb: number;
  managedRecovery: boolean;
  advancedProof: boolean;
  teamMembers: number;
}
export interface PlanSeed {
  code: string;
  name: string;
  currency: string;
  amountMinor: number;
  interval: "monthly" | "annually" | "none";
  paystackPlanCode?: string;
  capabilities: PlanCapabilities;
}
const planSchema = z.object({
  code: z.string().regex(/^[a-z0-9-]{2,40}$/),
  name: z.string().min(1).max(80),
  currency: z.string().length(3),
  amountMinor: z.number().int().min(0),
  interval: z.enum(["monthly", "annually", "none"]),
  paystackPlanCode: z.string().optional(),
  capabilities: z.object({
    sites: z.number().int().min(0),
    customDomain: z.boolean(),
    aiOperationsPerMonth: z.number().int().min(0),
    storageMb: z.number().int().min(0),
    managedRecovery: z.boolean(),
    advancedProof: z.boolean(),
    teamMembers: z.number().int().min(1),
  }),
});
/** Development plans only: clearly not production pricing. Production uses KORA_PLANS_JSON. */
export const DEVELOPMENT_PLANS: PlanSeed[] = [
  {
    code: "trial",
    name: "Trial (development)",
    currency: "NGN",
    amountMinor: 0,
    interval: "none",
    capabilities: {
      sites: 3,
      customDomain: true,
      aiOperationsPerMonth: 200,
      storageMb: 500,
      managedRecovery: true,
      advancedProof: true,
      teamMembers: 5,
    },
  },
  {
    code: "starter-dev",
    name: "Starter (development)",
    currency: "NGN",
    amountMinor: 500_000,
    interval: "monthly",
    capabilities: {
      sites: 1,
      customDomain: false,
      aiOperationsPerMonth: 50,
      storageMb: 200,
      managedRecovery: false,
      advancedProof: false,
      teamMembers: 1,
    },
  },
  {
    code: "business-dev",
    name: "Business (development)",
    currency: "NGN",
    amountMinor: 1_500_000,
    interval: "monthly",
    capabilities: {
      sites: 5,
      customDomain: true,
      aiOperationsPerMonth: 500,
      storageMb: 2000,
      managedRecovery: true,
      advancedProof: true,
      teamMembers: 5,
    },
  },
];
export function loadPlanCatalog(
  env: Record<string, string | undefined>,
): PlanSeed[] {
  if (env.KORA_PLANS_JSON)
    return z
      .array(planSchema)
      .parse(JSON.parse(env.KORA_PLANS_JSON)) as PlanSeed[];
  // Production always has the free trial (it carries no price); paid plans must be configured.
  return env.NODE_ENV === "production"
    ? DEVELOPMENT_PLANS.filter((p) => p.amountMinor === 0)
    : DEVELOPMENT_PLANS;
}

// ---- state machine ---------------------------------------------------------
export type BillingEvent =
  | { type: "PAYMENT_VERIFIED"; periodEnd: Date }
  | { type: "PAYMENT_FAILED" }
  | { type: "CANCEL_REQUESTED" }
  | { type: "PERIOD_ENDED" }
  | { type: "CLOCK" };
export interface SubState {
  state: SubscriptionState;
  periodEnd: Date | null;
  graceUntil: Date | null;
  cancelAtPeriodEnd: boolean;
}
/** Pure transition function; never deletes anything, only changes what is allowed. */
export function applyBillingEvent(
  s: SubState,
  e: BillingEvent,
  now: Date,
): SubState {
  switch (e.type) {
    case "PAYMENT_VERIFIED":
      return {
        state: "ACTIVE",
        periodEnd: e.periodEnd,
        graceUntil: null,
        cancelAtPeriodEnd: false,
      };
    case "PAYMENT_FAILED":
      if (s.state === "CANCELED" || s.state === "EXPIRED") return s;
      return {
        ...s,
        state: "PAST_DUE",
        graceUntil:
          s.graceUntil ?? new Date(now.getTime() + GRACE_DAYS * 86_400_000),
      };
    case "CANCEL_REQUESTED":
      return s.state === "ACTIVE" || s.state === "PAST_DUE"
        ? { ...s, cancelAtPeriodEnd: true }
        : s;
    case "PERIOD_ENDED":
      return s.state === "ACTIVE" && s.cancelAtPeriodEnd
        ? { ...s, state: "CANCELED" }
        : s;
    case "CLOCK":
      if (s.state === "TRIAL" && s.periodEnd && s.periodEnd <= now)
        return { ...s, state: "EXPIRED" };
      if (s.state === "PAST_DUE" && s.graceUntil && s.graceUntil <= now)
        return { ...s, state: "EXPIRED" };
      if (
        s.state === "ACTIVE" &&
        s.cancelAtPeriodEnd &&
        s.periodEnd &&
        s.periodEnd <= now
      )
        return { ...s, state: "CANCELED" };
      return s;
  }
}
export interface Entitlements {
  canCreateSite: boolean;
  canGenerate: boolean;
  canPublish: boolean;
  canUseCustomDomain: boolean;
  monitoringContinues: true;
  sitesStayOnline: true;
  restrictedReason: string | null;
}
/** Restriction, not deletion: an unpaid org keeps its sites live and monitored. */
export function entitlementsFor(
  state: SubscriptionState | null,
  caps: PlanCapabilities | null,
  siteCount: number,
): Entitlements {
  const base = {
    monitoringContinues: true as const,
    sitesStayOnline: true as const,
  };
  if (!state || !caps)
    return {
      ...base,
      canCreateSite: false,
      canGenerate: false,
      canPublish: false,
      canUseCustomDomain: false,
      restrictedReason: "No active plan.",
    };
  const restricted = state === "EXPIRED" || state === "CANCELED";
  const reason = restricted
    ? "Your plan has ended. Your websites stay online and monitored; choose a plan to make changes."
    : state === "PAST_DUE"
      ? "A payment failed. Everything still works during the grace period."
      : null;
  return {
    ...base,
    canCreateSite: !restricted && siteCount < caps.sites,
    canGenerate: !restricted,
    canPublish: !restricted,
    canUseCustomDomain: !restricted && caps.customDomain,
    restrictedReason: reason,
  };
}

// ---- payment provider ----------------------------------------------------------
export interface VerifiedTransaction {
  status: "success" | "failed" | "pending";
  amountMinor: number;
  currency: string;
  customerCode: string | null;
  subscriptionCode: string | null;
}
export interface NormalizedWebhook {
  eventKey: string;
  type:
    | "CHARGE_SUCCESS"
    | "PAYMENT_FAILED"
    | "SUBSCRIPTION_CREATED"
    | "SUBSCRIPTION_ENDED"
    | "IGNORED";
  reference: string | null;
  customerCode: string | null;
  subscriptionCode: string | null;
  raw: string;
}
export interface PaymentProvider {
  readonly name: string;
  readonly configured: boolean;
  initializeCheckout(i: {
    email: string;
    amountMinor: number;
    currency: string;
    reference: string;
    callbackUrl: string;
    planCode?: string | undefined;
  }): Promise<{ authorizationUrl: string; reference: string }>;
  verifyTransaction(reference: string): Promise<VerifiedTransaction>;
  verifyWebhookSignature(
    rawBody: string,
    signature: string | undefined,
  ): boolean;
  parseWebhook(rawBody: string): NormalizedWebhook;
}

export class PaystackProvider implements PaymentProvider {
  readonly name = "paystack";
  readonly configured = true;
  constructor(
    private readonly secretKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly baseUrl = "https://api.paystack.co",
  ) {}
  private async api(
    path: string,
    init?: RequestInit,
  ): Promise<{ status: boolean; data: Record<string, unknown> }> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.secretKey}`,
        "content-type": "application/json",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok)
      throw new HttpError(
        502,
        "payment_provider_error",
        `Paystack returned HTTP ${res.status}`,
      );
    return (await res.json()) as {
      status: boolean;
      data: Record<string, unknown>;
    };
  }
  async initializeCheckout(
    i: Parameters<PaymentProvider["initializeCheckout"]>[0],
  ) {
    const out = await this.api("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email: i.email,
        amount: i.amountMinor,
        currency: i.currency,
        reference: i.reference,
        callback_url: i.callbackUrl,
        ...(i.planCode ? { plan: i.planCode } : {}),
      }),
    });
    const url = out.data.authorization_url;
    if (!out.status || typeof url !== "string")
      throw new HttpError(
        502,
        "payment_provider_error",
        "Paystack did not return a checkout URL",
      );
    return {
      authorizationUrl: url,
      reference:
        typeof out.data.reference === "string"
          ? out.data.reference
          : i.reference,
    };
  }
  async verifyTransaction(reference: string): Promise<VerifiedTransaction> {
    const out = await this.api(
      `/transaction/verify/${encodeURIComponent(reference)}`,
    );
    const d = out.data as {
      status?: string;
      amount?: number;
      currency?: string;
      customer?: { customer_code?: string };
      plan_object?: { plan_code?: string };
      subscription_code?: string;
    };
    const status =
      d.status === "success"
        ? "success"
        : d.status === "failed" || d.status === "abandoned"
          ? "failed"
          : "pending";
    return {
      status,
      amountMinor: Number(d.amount ?? 0),
      currency: String(d.currency ?? ""),
      customerCode: d.customer?.customer_code ?? null,
      subscriptionCode: d.subscription_code ?? null,
    };
  }
  verifyWebhookSignature(
    rawBody: string,
    signature: string | undefined,
  ): boolean {
    if (!signature) return false;
    const expected = createHmac("sha512", this.secretKey)
      .update(rawBody)
      .digest("hex");
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  }
  parseWebhook(rawBody: string): NormalizedWebhook {
    const body = JSON.parse(rawBody) as {
      event?: string;
      data?: {
        id?: number | string;
        reference?: string;
        customer?: { customer_code?: string };
        subscription_code?: string;
        subscription?: { subscription_code?: string };
      };
    };
    const eventKey = `${body.event ?? "unknown"}:${body.data?.id ?? body.data?.reference ?? body.data?.subscription_code ?? sha256Hex(rawBody).slice(0, 24)}`;
    const base = {
      eventKey,
      reference: body.data?.reference ?? null,
      customerCode: body.data?.customer?.customer_code ?? null,
      subscriptionCode:
        body.data?.subscription_code ??
        body.data?.subscription?.subscription_code ??
        null,
      raw: rawBody,
    };
    switch (body.event) {
      case "charge.success":
        return { ...base, type: "CHARGE_SUCCESS" };
      case "invoice.payment_failed":
        return { ...base, type: "PAYMENT_FAILED" };
      case "subscription.create":
        return { ...base, type: "SUBSCRIPTION_CREATED" };
      case "subscription.disable":
      case "subscription.not_renew":
        return { ...base, type: "SUBSCRIPTION_ENDED" };
      default:
        return { ...base, type: "IGNORED" };
    }
  }
}
export const unconfiguredPayments: PaymentProvider = {
  name: "none",
  configured: false,
  initializeCheckout: () =>
    Promise.reject(
      new HttpError(
        501,
        "billing_not_configured",
        "Payments are not configured on this Kora (PAYSTACK_SECRET_KEY is not set).",
      ),
    ),
  verifyTransaction: () =>
    Promise.reject(new HttpError(501, "billing_not_configured")),
  verifyWebhookSignature: () => false,
  parseWebhook: (raw) => ({
    eventKey: sha256Hex(raw),
    type: "IGNORED",
    reference: null,
    customerCode: null,
    subscriptionCode: null,
    raw,
  }),
};

// ---- service ----------------------------------------------------------------------
type SubRow = {
  id: string;
  planId: string;
  planCode: string;
  capabilities: PlanCapabilities;
  state: SubscriptionState;
  periodEnd: Date | null;
  graceUntil: Date | null;
  cancelAtPeriodEnd: boolean;
  providerCustomerCode: string | null;
};
export class BillingService {
  constructor(
    private readonly d: {
      platform: PlatformStore;
      payments: PaymentProvider;
      publicUrl: string | undefined;
      now?: () => Date;
    },
  ) {}
  private now() {
    return this.d.now?.() ?? new Date();
  }
  get paymentsConfigured() {
    return this.d.payments.configured;
  }
  async seedPlans(plans: PlanSeed[]) {
    for (const p of plans)
      await this.d.platform
        .sql`INSERT INTO plans(id,code,name,currency,amount_minor,interval,paystack_plan_code,capabilities) VALUES(${crypto.randomUUID()},${p.code},${p.name},${p.currency},${p.amountMinor},${p.interval},${p.paystackPlanCode ?? null},${this.d.platform.sql.json(p.capabilities as never)})
        ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,currency=EXCLUDED.currency,amount_minor=EXCLUDED.amount_minor,interval=EXCLUDED.interval,paystack_plan_code=EXCLUDED.paystack_plan_code,capabilities=EXCLUDED.capabilities`;
  }
  async listPlans() {
    return (
      await this.d.platform
        .sql`SELECT * FROM plans WHERE active ORDER BY amount_minor`
    ).map((r) => ({
      id: String(r.id),
      code: String(r.code),
      name: String(r.name),
      currency: String(r.currency),
      amountMinor: Number(r.amount_minor),
      interval: String(r.interval),
      capabilities: r.capabilities as PlanCapabilities,
      checkoutAvailable:
        this.d.payments.configured && Number(r.amount_minor) > 0,
    }));
  }
  async current(orgId: string): Promise<SubRow | null> {
    const r = (
      await this.d.platform
        .sql`SELECT s.*,p.code AS plan_code,p.capabilities FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.org_id=${orgId} ORDER BY s.created_at DESC LIMIT 1`
    )[0];
    if (!r) return null;
    let row: SubRow = {
      id: String(r.id),
      planId: String(r.plan_id),
      planCode: String(r.plan_code),
      capabilities: r.capabilities as PlanCapabilities,
      state: r.state as SubscriptionState,
      periodEnd: r.current_period_end
        ? new Date(r.current_period_end as string)
        : null,
      graceUntil: r.grace_until ? new Date(r.grace_until as string) : null,
      cancelAtPeriodEnd: Boolean(r.cancel_at_period_end),
      providerCustomerCode: (r.provider_customer_code as string | null) ?? null,
    };
    const next = applyBillingEvent(row, { type: "CLOCK" }, this.now());
    if (next.state !== row.state) {
      row = { ...row, ...next };
      await this.save(row);
    }
    return row;
  }
  private async save(s: SubRow) {
    await this.d.platform
      .sql`UPDATE subscriptions SET state=${s.state},current_period_end=${s.periodEnd},grace_until=${s.graceUntil},cancel_at_period_end=${s.cancelAtPeriodEnd},provider_customer_code=${s.providerCustomerCode},updated_at=now() WHERE id=${s.id}`;
  }
  async startTrial(orgId: string) {
    const plan = (
      await this.d.platform
        .sql`SELECT id FROM plans WHERE code='trial' AND active`
    )[0];
    if (!plan) return;
    await this.d.platform
      .sql`INSERT INTO subscriptions(id,org_id,plan_id,state,provider,current_period_end) VALUES(${crypto.randomUUID()},${orgId},${plan.id as string},'TRIAL','none',${new Date(this.now().getTime() + TRIAL_DAYS * 86_400_000).toISOString()}) ON CONFLICT DO NOTHING`;
  }
  async entitlements(orgId: string) {
    const sub = await this.current(orgId);
    const count = Number(
      (
        await this.d.platform
          .sql`SELECT COUNT(*)::int AS n FROM sites WHERE org_id=${orgId}`
      )[0]!.n,
    );
    return {
      subscription: sub,
      entitlements: entitlementsFor(
        sub?.state ?? null,
        sub?.capabilities ?? null,
        count,
      ),
    };
  }
  async checkout(
    orgId: string,
    planCode: string,
    email: string,
    actorUserId: string,
  ) {
    const plan = (
      await this.d.platform
        .sql`SELECT * FROM plans WHERE code=${planCode} AND active`
    )[0];
    if (!plan || Number(plan.amount_minor) === 0)
      throw new HttpError(404, "plan_not_found");
    const reference = `kora_${crypto.randomUUID().replaceAll("-", "")}`;
    const callbackUrl = `${(this.d.publicUrl ?? "").replace(/\/+$/, "")}/app/billing?reference=${reference}`;
    const out = await this.d.payments.initializeCheckout({
      email,
      amountMinor: Number(plan.amount_minor),
      currency: String(plan.currency),
      reference,
      callbackUrl,
      planCode: (plan.paystack_plan_code as string | null) ?? undefined,
    });
    await this.d.platform
      .sql`INSERT INTO billing_transactions(id,org_id,plan_id,provider,reference,status,amount_minor,currency) VALUES(${crypto.randomUUID()},${orgId},${plan.id as string},${this.d.payments.name},${reference},'PENDING',${Number(plan.amount_minor)},${String(plan.currency)})`;
    await this.d.platform.audit({
      orgId,
      actorUserId,
      action: "billing.checkout_started",
      objectType: "plan",
      objectId: planCode,
      metadata: { reference },
    });
    return out;
  }
  /** Activates only after the provider confirms the transaction server-side. Idempotent. */
  async confirmReference(
    reference: string,
  ): Promise<{ activated: boolean; status: string }> {
    const tx = (
      await this.d.platform
        .sql`SELECT * FROM billing_transactions WHERE reference=${reference}`
    )[0];
    if (!tx) throw notFound();
    if (tx.status === "VERIFIED")
      return { activated: true, status: "VERIFIED" };
    const v = await this.d.payments.verifyTransaction(reference);
    if (v.status === "pending") return { activated: false, status: "PENDING" };
    if (v.status === "failed") {
      await this.d.platform
        .sql`UPDATE billing_transactions SET status='FAILED' WHERE id=${tx.id as string}`;
      return { activated: false, status: "FAILED" };
    }
    if (
      v.amountMinor !== Number(tx.amount_minor) ||
      v.currency !== String(tx.currency)
    ) {
      await this.d.platform
        .sql`UPDATE billing_transactions SET status='FAILED' WHERE id=${tx.id as string}`;
      throw new HttpError(
        409,
        "amount_mismatch",
        "The verified payment does not match the plan price.",
      );
    }
    const orgId = String(tx.org_id);
    const plan = (
      await this.d.platform
        .sql`SELECT * FROM plans WHERE id=${tx.plan_id as string}`
    )[0]!;
    const periodEnd = new Date(
      this.now().getTime() +
        (plan.interval === "annually" ? 365 : 31) * 86_400_000,
    );
    await this.d.platform.inTransaction(async ({ sql }) => {
      await sql`UPDATE billing_transactions SET status='VERIFIED',verified_at=now() WHERE id=${tx.id as string} AND status<>'VERIFIED'`;
      await sql`UPDATE subscriptions SET state='CANCELED',updated_at=now() WHERE org_id=${orgId} AND state IN ('TRIAL','ACTIVE','PAST_DUE')`;
      await sql`INSERT INTO subscriptions(id,org_id,plan_id,state,provider,provider_customer_code,provider_subscription_code,current_period_end) VALUES(${crypto.randomUUID()},${orgId},${tx.plan_id as string},'ACTIVE',${this.d.payments.name},${v.customerCode},${v.subscriptionCode},${periodEnd.toISOString()})`;
    });
    await this.d.platform.audit({
      orgId,
      actorKind: "SYSTEM",
      action: "billing.subscription_activated",
      objectType: "plan",
      objectId: String(plan.code),
      metadata: { reference },
    });
    await this.d.platform.notify({
      orgId,
      kind: "SUBSCRIPTION_ACTIVE",
      title: "Plan active",
      body: `Your ${String(plan.name)} plan is active.`,
      dedupeKey: `sub:${reference}`,
    });
    return { activated: true, status: "VERIFIED" };
  }
  /** Signature-checked, replay-safe webhook processing. Returns what happened. */
  async handleWebhook(
    rawBody: string,
    signature: string | undefined,
  ): Promise<{ outcome: string }> {
    if (!this.d.payments.verifyWebhookSignature(rawBody, signature))
      throw new HttpError(401, "bad_signature");
    let evt: NormalizedWebhook;
    try {
      evt = this.d.payments.parseWebhook(rawBody);
    } catch {
      throw new HttpError(400, "bad_webhook_body");
    }
    const inserted = await this.d.platform
      .sql`INSERT INTO payment_webhook_events(id,provider,event_key,event_type,payload_hash) VALUES(${crypto.randomUUID()},${this.d.payments.name},${evt.eventKey},${evt.type},${sha256Hex(rawBody)}) ON CONFLICT(provider,event_key) DO NOTHING RETURNING id`;
    if (inserted.length === 0) return { outcome: "duplicate" };
    let outcome = "ignored";
    try {
      if (evt.type === "CHARGE_SUCCESS" && evt.reference)
        outcome = (
          await this.confirmReference(evt.reference).catch((e: unknown) => ({
            activated: false,
            status: e instanceof HttpError ? e.code : "error",
          }))
        ).status;
      else if (
        (evt.type === "PAYMENT_FAILED" || evt.type === "SUBSCRIPTION_ENDED") &&
        (evt.subscriptionCode || evt.customerCode)
      ) {
        const r = (
          await this.d.platform
            .sql`SELECT org_id FROM subscriptions WHERE (provider_subscription_code=${evt.subscriptionCode} OR provider_customer_code=${evt.customerCode}) AND state IN ('ACTIVE','PAST_DUE') ORDER BY created_at DESC LIMIT 1`
        )[0];
        if (r) {
          const sub = (await this.current(String(r.org_id)))!;
          const next = applyBillingEvent(
            sub,
            {
              type:
                evt.type === "PAYMENT_FAILED"
                  ? "PAYMENT_FAILED"
                  : "CANCEL_REQUESTED",
            },
            this.now(),
          );
          await this.save({ ...sub, ...next });
          outcome = next.state;
          if (evt.type === "PAYMENT_FAILED")
            await this.d.platform.notify({
              orgId: String(r.org_id),
              kind: "PAYMENT_FAILED",
              title: "A payment failed",
              body: `Your sites stay online. Please update your payment within ${GRACE_DAYS} days.`,
              dedupeKey: `pf:${evt.eventKey}`,
            });
        }
      }
    } finally {
      await this.d.platform
        .sql`UPDATE payment_webhook_events SET processed_at=now(),outcome=${outcome} WHERE provider=${this.d.payments.name} AND event_key=${evt.eventKey}`;
    }
    return { outcome };
  }
  async transactions(orgId: string) {
    return (
      await this.d.platform
        .sql`SELECT t.reference,t.status,t.amount_minor,t.currency,t.created_at,t.verified_at,p.code AS plan_code FROM billing_transactions t LEFT JOIN plans p ON p.id=t.plan_id WHERE t.org_id=${orgId} ORDER BY t.created_at DESC LIMIT 50`
    ).map((r) => ({
      reference: String(r.reference),
      status: String(r.status),
      amountMinor: Number(r.amount_minor),
      currency: String(r.currency),
      planCode: (r.plan_code as string | null) ?? null,
      createdAt: new Date(r.created_at as string).toISOString(),
      verifiedAt: r.verified_at
        ? new Date(r.verified_at as string).toISOString()
        : null,
    }));
  }
}

export function registerBillingRoutes(
  app: FastifyInstance,
  d: { billing: BillingService; platform: PlatformStore },
) {
  const uuid = z.string().uuid();
  app.get("/api/billing/plans", async () => ({
    data: await d.billing.listPlans(),
  }));
  app.get("/api/orgs/:id/subscription", async (req) => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    requireOrgRole(req, id, "VIEWER");
    const e = await d.billing.entitlements(id);
    return {
      data: {
        ...e,
        paymentsConfigured: d.billing.paymentsConfigured,
        usage: await d.platform.usageSummary(id),
      },
    };
  });
  app.get("/api/orgs/:id/billing", async (req) => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    requireOrgRole(req, id, "ADMIN");
    return { data: await d.billing.transactions(id) };
  });
  app.post("/api/billing/checkout", async (req) => {
    const body = z
      .object({ orgId: uuid, planCode: z.string().min(2).max(40) })
      .parse(req.body);
    requireOrgRole(req, body.orgId, "OWNER");
    const user = requireUser(req);
    return {
      data: await d.billing.checkout(
        body.orgId,
        body.planCode,
        user.email,
        user.userId,
      ),
    };
  });
  app.post("/api/billing/verify", async (req) => {
    const body = z
      .object({ reference: z.string().min(8).max(100) })
      .parse(req.body);
    const tx = (
      await d.platform
        .sql`SELECT org_id FROM billing_transactions WHERE reference=${body.reference}`
    )[0];
    if (!tx) throw notFound();
    requireOrgRole(req, String(tx.org_id), "OWNER");
    return { data: await d.billing.confirmReference(body.reference) };
  });
  // Raw body is required for the signature, so this route owns its own JSON parser.
  void app.register((scope) => {
    scope.addContentTypeParser(
      "application/json",
      { parseAs: "string" },
      (
        _req: FastifyRequest,
        body: string,
        done: (e: Error | null, v?: unknown) => void,
      ) => done(null, body),
    );
    scope.post("/api/billing/webhook/paystack", async (req, reply) => {
      const raw = typeof req.body === "string" ? req.body : "";
      const result = await d.billing.handleWebhook(
        raw,
        req.headers["x-paystack-signature"] as string | undefined,
      );
      return reply.code(200).send({ data: result });
    });
    return Promise.resolve();
  });
}
