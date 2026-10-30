import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  GRACE_DAYS,
  PaystackProvider,
  applyBillingEvent,
  entitlementsFor,
  loadPlanCatalog,
  type PlanCapabilities,
  type SubState,
} from "./billing.js";
import {
  canMoveDomain,
  checkDns,
  requiredRecord,
  type DnsResolver,
} from "./domains.js";

const caps: PlanCapabilities = {
  sites: 2,
  customDomain: true,
  aiOperationsPerMonth: 10,
  storageMb: 10,
  managedRecovery: true,
  advancedProof: true,
  teamMembers: 2,
};
const now = new Date("2026-10-30T10:00:00Z");
const active = (over: Partial<SubState> = {}): SubState => ({
  state: "ACTIVE",
  periodEnd: new Date("2026-11-30T00:00:00Z"),
  graceUntil: null,
  cancelAtPeriodEnd: false,
  ...over,
});

describe("subscription state machine", () => {
  it("activates on verified payment and clears any grace", () => {
    const s = applyBillingEvent(
      active({ state: "PAST_DUE", graceUntil: now }),
      { type: "PAYMENT_VERIFIED", periodEnd: new Date("2026-12-01T00:00:00Z") },
      now,
    );
    expect(s).toMatchObject({ state: "ACTIVE", graceUntil: null });
  });
  it("a failed payment starts a grace period instead of cutting anything off", () => {
    const s = applyBillingEvent(active(), { type: "PAYMENT_FAILED" }, now);
    expect(s.state).toBe("PAST_DUE");
    expect(s.graceUntil?.getTime()).toBe(
      now.getTime() + GRACE_DAYS * 86_400_000,
    );
    expect(
      applyBillingEvent(
        s,
        { type: "PAYMENT_FAILED" },
        new Date(now.getTime() + 1000),
      ).graceUntil,
    ).toEqual(s.graceUntil);
    expect(entitlementsFor(s.state, caps, 1).canPublish).toBe(true);
  });
  it("expires only after the grace period, and only restricts", () => {
    const past = applyBillingEvent(active(), { type: "PAYMENT_FAILED" }, now);
    expect(
      applyBillingEvent(
        past,
        { type: "CLOCK" },
        new Date(now.getTime() + 3 * 86_400_000),
      ).state,
    ).toBe("PAST_DUE");
    const expired = applyBillingEvent(
      past,
      { type: "CLOCK" },
      new Date(now.getTime() + 8 * 86_400_000),
    );
    expect(expired.state).toBe("EXPIRED");
    const e = entitlementsFor(expired.state, caps, 2);
    expect(e).toMatchObject({
      canPublish: false,
      canGenerate: false,
      canCreateSite: false,
      sitesStayOnline: true,
      monitoringContinues: true,
    });
    expect(e.restrictedReason).toMatch(/stay online/);
  });
  it("cancellation takes effect at period end", () => {
    const c = applyBillingEvent(active(), { type: "CANCEL_REQUESTED" }, now);
    expect(c.state).toBe("ACTIVE");
    expect(
      applyBillingEvent(c, { type: "CLOCK" }, new Date("2026-12-01T00:00:00Z"))
        .state,
    ).toBe("CANCELED");
  });
  it("trials expire", () => {
    expect(
      applyBillingEvent(
        {
          state: "TRIAL",
          periodEnd: now,
          graceUntil: null,
          cancelAtPeriodEnd: false,
        },
        { type: "CLOCK" },
        new Date(now.getTime() + 1),
      ).state,
    ).toBe("EXPIRED");
  });
  it("enforces the site limit and denies when there is no plan", () => {
    expect(entitlementsFor("ACTIVE", caps, 2).canCreateSite).toBe(false);
    expect(entitlementsFor("ACTIVE", caps, 1).canCreateSite).toBe(true);
    expect(entitlementsFor(null, null, 0).canPublish).toBe(false);
  });
  it("loads production plans from configuration and has no built-in production prices", () => {
    expect(
      loadPlanCatalog({ NODE_ENV: "production" }).map((p) => [
        p.code,
        p.amountMinor,
      ]),
    ).toEqual([["trial", 0]]);
    expect(
      loadPlanCatalog({ NODE_ENV: "development" }).every(
        (p) => p.name.includes("development") || p.code === "trial",
      ),
    ).toBe(true);
    const custom = loadPlanCatalog({
      NODE_ENV: "production",
      KORA_PLANS_JSON: JSON.stringify([
        {
          code: "pro",
          name: "Pro",
          currency: "USD",
          amountMinor: 1900,
          interval: "monthly",
          capabilities: caps,
        },
      ]),
    });
    expect(custom[0]!.amountMinor).toBe(1900);
    expect(() =>
      loadPlanCatalog({ KORA_PLANS_JSON: '[{"code":"x"}]' }),
    ).toThrow();
  });
});

describe("paystack provider contract", () => {
  const secret = "sk_test_unit";
  const sign = (body: string) =>
    createHmac("sha512", secret).update(body).digest("hex");
  it("verifies webhook signatures in constant time and rejects tampering", () => {
    const p = new PaystackProvider(secret, fetch);
    const body = JSON.stringify({
      event: "charge.success",
      data: { id: 1, reference: "r1" },
    });
    expect(p.verifyWebhookSignature(body, sign(body))).toBe(true);
    expect(p.verifyWebhookSignature(body + " ", sign(body))).toBe(false);
    expect(p.verifyWebhookSignature(body, undefined)).toBe(false);
    expect(p.verifyWebhookSignature(body, "deadbeef")).toBe(false);
  });
  it("normalises documented webhook events and keys them for idempotency", () => {
    const p = new PaystackProvider(secret, fetch);
    expect(
      p.parseWebhook(
        JSON.stringify({
          event: "charge.success",
          data: {
            id: 9,
            reference: "r9",
            customer: { customer_code: "CUS_1" },
          },
        }),
      ),
    ).toMatchObject({
      type: "CHARGE_SUCCESS",
      reference: "r9",
      customerCode: "CUS_1",
      eventKey: "charge.success:9",
    });
    expect(
      p.parseWebhook(
        JSON.stringify({
          event: "invoice.payment_failed",
          data: { subscription: { subscription_code: "SUB_1" } },
        }),
      ).type,
    ).toBe("PAYMENT_FAILED");
    expect(
      p.parseWebhook(
        JSON.stringify({
          event: "subscription.not_renew",
          data: { subscription_code: "SUB_1" },
        }),
      ).type,
    ).toBe("SUBSCRIPTION_ENDED");
    expect(
      p.parseWebhook(JSON.stringify({ event: "something.else", data: {} }))
        .type,
    ).toBe("IGNORED");
  });
  it("calls the documented endpoints with a bearer key and never puts it in the body", async () => {
    const calls: Array<{
      url: string;
      auth: string | undefined;
      body: string;
    }> = [];
    const fake = ((url: string, init: RequestInit) => {
      calls.push({
        url,
        auth: (init.headers as Record<string, string>).authorization,
        body: typeof init.body === "string" ? init.body : "",
      });
      return Promise.resolve(
        new Response(
          JSON.stringify(
            url.includes("initialize")
              ? {
                  status: true,
                  data: {
                    authorization_url: "https://checkout.paystack.com/x",
                    reference: "r1",
                  },
                }
              : {
                  status: true,
                  data: {
                    status: "success",
                    amount: 500,
                    currency: "NGN",
                    customer: { customer_code: "CUS_9" },
                  },
                },
          ),
        ),
      );
    }) as unknown as typeof fetch;
    const p = new PaystackProvider(secret, fake);
    expect(
      (
        await p.initializeCheckout({
          email: "a@b.co",
          amountMinor: 500,
          currency: "NGN",
          reference: "r1",
          callbackUrl: "https://k/app/billing",
        })
      ).authorizationUrl,
    ).toMatch(/^https:\/\/checkout\.paystack\.com/);
    expect(await p.verifyTransaction("r1")).toMatchObject({
      status: "success",
      amountMinor: 500,
      customerCode: "CUS_9",
    });
    expect(calls[0]).toMatchObject({
      url: "https://api.paystack.co/transaction/initialize",
      auth: `Bearer ${secret}`,
    });
    expect(calls[1]!.url).toBe("https://api.paystack.co/transaction/verify/r1");
    expect(calls.every((c) => !c.body.includes(secret))).toBe(true);
  });
});

describe("domains", () => {
  const resolver = (
    cname: string[] | Error,
    a: Record<string, string[]> = {},
  ): DnsResolver => ({
    resolveCname: () =>
      cname instanceof Error ? Promise.reject(cname) : Promise.resolve(cname),
    resolve4: (h) =>
      a[h]
        ? Promise.resolve(a[h])
        : Promise.reject(Object.assign(new Error("nx"), { code: "ENOTFOUND" })),
  });
  const enodata = Object.assign(new Error("no cname"), { code: "ENODATA" });
  it("observes DNS instead of assuming it", async () => {
    expect(
      (
        await checkDns(
          resolver(["kora.example.com."]),
          "www.shop.com",
          "kora.example.com",
        )
      ).dns,
    ).toBe("CORRECT");
    expect(
      (
        await checkDns(
          resolver(["other.host."]),
          "www.shop.com",
          "kora.example.com",
        )
      ).dns,
    ).toBe("POINTING_ELSEWHERE");
    expect(
      (
        await checkDns(
          resolver(enodata, {
            "kora.example.com": ["1.2.3.4"],
            "shop.com": ["1.2.3.4"],
          }),
          "shop.com",
          "kora.example.com",
        )
      ).dns,
    ).toBe("CORRECT");
    expect(
      (
        await checkDns(
          resolver(enodata, {
            "kora.example.com": ["1.2.3.4"],
            "shop.com": ["9.9.9.9"],
          }),
          "shop.com",
          "kora.example.com",
        )
      ).dns,
    ).toBe("POINTING_ELSEWHERE");
    expect(
      (await checkDns(resolver(enodata), "shop.com", "kora.example.com")).dns,
    ).toBe("MISCONFIGURED");
    expect(
      (
        await checkDns(
          resolver(Object.assign(new Error("t"), { code: "ETIMEOUT" })),
          "shop.com",
          "kora.example.com",
        )
      ).dns,
    ).toBe("UNKNOWN");
  });
  it("tells the owner exactly what to create", () => {
    expect(requiredRecord("www.shop.com", "kora.example.com")).toMatchObject({
      type: "CNAME",
      name: "www",
      value: "kora.example.com",
    });
    expect(requiredRecord("shop.com", "kora.example.com").type).toBe("A/ALIAS");
  });
  it("only allows the documented state moves", () => {
    expect(canMoveDomain("DNS_REQUIRED", "VERIFYING")).toBe(true);
    expect(canMoveDomain("VERIFYING", "ACTIVE")).toBe(true);
    expect(canMoveDomain("REQUESTED", "ACTIVE")).toBe(false);
    expect(canMoveDomain("DNS_REQUIRED", "ACTIVE")).toBe(false);
  });
});
