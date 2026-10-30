import { createHmac } from "node:crypto";
import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PaystackProvider } from "./platform/billing.js";
import type { DnsResolver } from "./platform/domains.js";
import { startHarness, type Harness } from "./test-support/platform-harness.js";

const enabled = Boolean(process.env.DATABASE_URL);
const d = enabled ? describe : describe.skip;
const SECRET = "sk_test_integration";

// A fake Paystack: records what Kora asked and answers only for references it was initialised with.
const references = new Map<
  string,
  { amount: number; currency: string; status: string }
>();
const fakePaystack = ((url: string, init?: RequestInit) => {
  const u = new URL(url);
  if (u.pathname === "/transaction/initialize") {
    const b = JSON.parse(init!.body as string) as {
      reference: string;
      amount: number;
      currency: string;
    };
    references.set(b.reference, {
      amount: b.amount,
      currency: b.currency,
      status: "pending",
    });
    return Promise.resolve(
      new Response(
        JSON.stringify({
          status: true,
          data: {
            authorization_url: `https://checkout.paystack.com/${b.reference}`,
            reference: b.reference,
          },
        }),
      ),
    );
  }
  const ref = decodeURIComponent(u.pathname.split("/").pop()!);
  const r = references.get(ref);
  if (!r) return Promise.resolve(new Response("{}", { status: 404 }));
  return Promise.resolve(
    new Response(
      JSON.stringify({
        status: true,
        data: {
          status: r.status,
          amount: r.amount,
          currency: r.currency,
          customer: { customer_code: "CUS_test" },
          subscription_code: "SUB_test",
        },
      }),
    ),
  );
}) as unknown as typeof fetch;

let clock = new Date();
const resolverState: { cname: string[] | Error } = {
  cname: Object.assign(new Error("x"), { code: "ENOTFOUND" }),
};
const resolver: DnsResolver = {
  resolveCname: () =>
    resolverState.cname instanceof Error
      ? Promise.reject(resolverState.cname)
      : Promise.resolve(resolverState.cname),
  resolve4: () =>
    Promise.reject(Object.assign(new Error("nx"), { code: "ENOTFOUND" })),
};
// null = HTTPS unreachable; otherwise the body the domain's HTTPS endpoint returns.
let httpsBody: string | null = null;
const domainFetch = (() =>
  httpsBody !== null
    ? Promise.resolve(new Response(httpsBody))
    : Promise.reject(new Error("tls not ready"))) as unknown as typeof fetch;

let h: Harness;
beforeAll(async () => {
  if (enabled)
    h = await startHarness({
      payments: new PaystackProvider(SECRET, fakePaystack),
      resolver,
      domainFetch,
      now: () => clock,
    });
});
afterAll(async () => {
  if (enabled) await h.close();
});
const sign = (body: string) =>
  createHmac("sha512", SECRET).update(body).digest("hex");
const brief = {
  name: "Shop",
  description: "We sell shoes, bags and belts across Lagos.",
};

d("billing", () => {
  it("starts every organization on a trial and lists configured plans", async () => {
    const o = await h.signup("bill-1@example.com");
    const sub = (
      await h.call("GET", `/api/orgs/${o.orgId}/subscription`, {
        cookie: o.cookie,
      })
    ).json.data;
    expect(sub.subscription.state).toBe("TRIAL");
    expect(sub.entitlements.canPublish).toBe(true);
    expect(sub.paymentsConfigured).toBe(true);
    const plans = (await h.call("GET", "/api/billing/plans")).json.data;
    expect(plans.map((p: { code: string }) => p.code)).toEqual(
      expect.arrayContaining(["trial", "starter-dev", "business-dev"]),
    );
  });
  it("activates only after server-side verification, and verification is idempotent", async () => {
    const o = await h.signup("bill-2@example.com");
    const co = await h.call("POST", "/api/billing/checkout", {
      cookie: o.cookie,
      body: { orgId: o.orgId, planCode: "business-dev" },
    });
    expect(co.status).toBe(200);
    const ref = co.json.data.reference as string;
    // Nothing activates while the provider still reports pending.
    expect(
      (
        await h.call("POST", "/api/billing/verify", {
          cookie: o.cookie,
          body: { reference: ref },
        })
      ).json.data,
    ).toMatchObject({ activated: false, status: "PENDING" });
    expect(
      (
        await h.call("GET", `/api/orgs/${o.orgId}/subscription`, {
          cookie: o.cookie,
        })
      ).json.data.subscription.state,
    ).toBe("TRIAL");
    references.get(ref)!.status = "success";
    expect(
      (
        await h.call("POST", "/api/billing/verify", {
          cookie: o.cookie,
          body: { reference: ref },
        })
      ).json.data.activated,
    ).toBe(true);
    expect(
      (
        await h.call("POST", "/api/billing/verify", {
          cookie: o.cookie,
          body: { reference: ref },
        })
      ).json.data.activated,
    ).toBe(true);
    const sub = (
      await h.call("GET", `/api/orgs/${o.orgId}/subscription`, {
        cookie: o.cookie,
      })
    ).json.data.subscription;
    expect(sub).toMatchObject({ state: "ACTIVE", planCode: "business-dev" });
    const [counted] =
      (await h.sql`SELECT COUNT(*)::int AS n FROM subscriptions WHERE org_id=${o.orgId} AND state IN ('TRIAL','ACTIVE','PAST_DUE')`) as unknown as Array<{
        n: number;
      }>;
    expect(counted!.n).toBe(1);
    expect(
      (
        await h.call("GET", `/api/orgs/${o.orgId}/billing`, {
          cookie: o.cookie,
        })
      ).json.data[0],
    ).toMatchObject({ status: "VERIFIED" });
  });
  it("rejects a verified payment whose amount does not match the plan", async () => {
    const o = await h.signup("bill-3@example.com");
    const ref = (
      await h.call("POST", "/api/billing/checkout", {
        cookie: o.cookie,
        body: { orgId: o.orgId, planCode: "starter-dev" },
      })
    ).json.data.reference as string;
    references.set(ref, { amount: 1, currency: "NGN", status: "success" });
    expect(
      (
        await h.call("POST", "/api/billing/verify", {
          cookie: o.cookie,
          body: { reference: ref },
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await h.call("GET", `/api/orgs/${o.orgId}/subscription`, {
          cookie: o.cookie,
        })
      ).json.data.subscription.state,
    ).toBe("TRIAL");
  });
  it("only an owner can buy, and nobody can verify another org's reference", async () => {
    const a = await h.signup("bill-a@example.com");
    const b = await h.signup("bill-b@example.com");
    expect(
      (
        await h.call("POST", "/api/billing/checkout", {
          cookie: b.cookie,
          body: { orgId: a.orgId, planCode: "starter-dev" },
        })
      ).status,
    ).toBe(404);
    const ref = (
      await h.call("POST", "/api/billing/checkout", {
        cookie: a.cookie,
        body: { orgId: a.orgId, planCode: "starter-dev" },
      })
    ).json.data.reference as string;
    expect(
      (
        await h.call("POST", "/api/billing/verify", {
          cookie: b.cookie,
          body: { reference: ref },
        })
      ).status,
    ).toBe(404);
  });
  it("webhooks: bad signature rejected, valid one verified with the provider, replay ignored", async () => {
    const o = await h.signup("bill-hook@example.com");
    const ref = (
      await h.call("POST", "/api/billing/checkout", {
        cookie: o.cookie,
        body: { orgId: o.orgId, planCode: "starter-dev" },
      })
    ).json.data.reference as string;
    references.get(ref)!.status = "success";
    const body = JSON.stringify({
      event: "charge.success",
      data: {
        id: 777,
        reference: ref,
        customer: { customer_code: "CUS_test" },
      },
    });
    const post = (b: string, sig?: string) =>
      fetch(`${h.base}/api/billing/webhook/paystack`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(sig ? { "x-paystack-signature": sig } : {}),
        },
        body: b,
      });
    expect((await post(body)).status).toBe(401);
    expect((await post(body, "00")).status).toBe(401);
    expect(
      (
        (await (await post(body, sign(body))).json()) as {
          data: { outcome: string };
        }
      ).data.outcome,
    ).toBe("VERIFIED");
    expect(
      (
        (await (await post(body, sign(body))).json()) as {
          data: { outcome: string };
        }
      ).data.outcome,
    ).toBe("duplicate");
    expect(
      (
        await h.call("GET", `/api/orgs/${o.orgId}/subscription`, {
          cookie: o.cookie,
        })
      ).json.data.subscription.state,
    ).toBe("ACTIVE");
    // A forged "success" for a reference the provider never confirmed activates nothing.
    const forged = JSON.stringify({
      event: "charge.success",
      data: { id: 778, reference: "kora_unknown" },
    });
    expect((await post(forged, sign(forged))).status).toBe(200);
    const [counted] =
      (await h.sql`SELECT COUNT(*)::int AS n FROM payment_webhook_events`) as unknown as Array<{
        n: number;
      }>;
    expect(counted!.n).toBe(2);
  });
  it("a failed payment starts grace without taking a site offline; expiry restricts but never deletes", async () => {
    const o = await h.signup("bill-grace@example.com");
    const ref = (
      await h.call("POST", "/api/billing/checkout", {
        cookie: o.cookie,
        body: { orgId: o.orgId, planCode: "business-dev" },
      })
    ).json.data.reference as string;
    references.get(ref)!.status = "success";
    await h.call("POST", "/api/billing/verify", {
      cookie: o.cookie,
      body: { reference: ref },
    });
    const site = (
      await h.call("POST", "/api/sites", {
        cookie: o.cookie,
        body: { orgId: o.orgId, name: "Grace Shop" },
      })
    ).json.data;
    const v = (
      await h.call("POST", `/api/sites/${site.id}/generate`, {
        cookie: o.cookie,
        body: brief,
      })
    ).json.data.version;
    await h.call("POST", `/api/sites/${site.id}/versions/${v.id}/publish`, {
      cookie: o.cookie,
    });
    const failed = JSON.stringify({
      event: "invoice.payment_failed",
      data: {
        id: 901,
        subscription: { subscription_code: "SUB_test" },
        customer: { customer_code: "CUS_test" },
      },
    });
    const hook = await fetch(`${h.base}/api/billing/webhook/paystack`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-paystack-signature": sign(failed),
      },
      body: failed,
    });
    expect(hook.status).toBe(200);
    const sub = (
      await h.call("GET", `/api/orgs/${o.orgId}/subscription`, {
        cookie: o.cookie,
      })
    ).json.data;
    expect(sub.subscription.state).toBe("PAST_DUE");
    expect(sub.entitlements.canPublish).toBe(true);
    expect((await fetch(`${h.base}/s/${site.slug}/`)).status).toBe(200);
    expect(
      (
        await h.call("GET", "/api/notifications", { cookie: o.cookie })
      ).json.data.map((n: { kind: string }) => n.kind),
    ).toContain("PAYMENT_FAILED");
    // Grace elapses.
    clock = new Date(Date.now() + 9 * 86_400_000);
    const after = (
      await h.call("GET", `/api/orgs/${o.orgId}/subscription`, {
        cookie: o.cookie,
      })
    ).json.data;
    expect(after.subscription.state).toBe("EXPIRED");
    expect(
      (
        await h.call("POST", `/api/sites/${site.id}/versions/${v.id}/publish`, {
          cookie: o.cookie,
        })
      ).status,
    ).toBe(402);
    expect(
      (
        await h.call("POST", `/api/sites/${site.id}/generate`, {
          cookie: o.cookie,
          body: brief,
        })
      ).status,
    ).toBe(402);
    expect((await fetch(`${h.base}/s/${site.slug}/`)).status).toBe(200); // still online
    expect(
      (await h.call("GET", `/api/sites/${site.id}`, { cookie: o.cookie }))
        .status,
    ).toBe(200); // not deleted
    clock = new Date();
  });
  it("enforces the plan's site limit", async () => {
    const o = await h.signup("bill-limit@example.com");
    for (const n of [1, 2, 3])
      expect(
        (
          await h.call("POST", "/api/sites", {
            cookie: o.cookie,
            body: { orgId: o.orgId, name: `S${n}` },
          })
        ).status,
      ).toBe(201);
    expect(
      (
        await h.call("POST", "/api/sites", {
          cookie: o.cookie,
          body: { orgId: o.orgId, name: "S4" },
        })
      ).status,
    ).toBe(402);
  });
});

function getWithHost(
  port: number,
  host: string,
  path: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, path, method: "GET", headers: { host } },
      (res) => {
        let body = "";
        res.on("data", (c: Buffer) => (body += c.toString()));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

d("domains", () => {
  it("connects an existing domain, observes DNS and HTTPS, and only then goes ACTIVE", async () => {
    const o = await h.signup("dom-1@example.com");
    const site = (
      await h.call("POST", "/api/sites", {
        cookie: o.cookie,
        body: { orgId: o.orgId, name: "Dom Shop" },
      })
    ).json.data;
    const v = (
      await h.call("POST", `/api/sites/${site.id}/generate`, {
        cookie: o.cookie,
        body: brief,
      })
    ).json.data.version;
    await h.call("POST", `/api/sites/${site.id}/versions/${v.id}/publish`, {
      cookie: o.cookie,
    });
    expect(
      (
        await h.call("POST", `/api/sites/${site.id}/domains/connect`, {
          cookie: o.cookie,
          body: { hostname: "not a domain" },
        })
      ).status,
    ).toBe(422);
    const c = await h.call("POST", `/api/sites/${site.id}/domains/connect`, {
      cookie: o.cookie,
      body: { hostname: "www.dom-shop.com" },
    });
    expect(c.status).toBe(201);
    expect(c.json.data.domain.state).toBe("DNS_REQUIRED");
    expect(c.json.data.record).toMatchObject({
      type: "CNAME",
      name: "www",
      value: "127.0.0.1",
    });
    const id = c.json.data.domain.id as string;
    // Records not created yet.
    expect(
      (await h.call("GET", `/api/domains/${id}/status`, { cookie: o.cookie }))
        .json.data.domain,
    ).toMatchObject({ state: "DNS_REQUIRED", dnsState: "MISCONFIGURED" });
    // Pointing somewhere else.
    resolverState.cname = ["elsewhere.example."];
    expect(
      (await h.call("GET", `/api/domains/${id}/status`, { cookie: o.cookie }))
        .json.data.domain.dnsState,
    ).toBe("POINTING_ELSEWHERE");
    // Correct DNS but HTTPS not ready: VERIFYING, never ACTIVE.
    resolverState.cname = ["127.0.0.1."];
    expect(
      (await h.call("GET", `/api/domains/${id}/status`, { cookie: o.cookie }))
        .json.data.domain,
    ).toMatchObject({
      state: "VERIFYING",
      dnsState: "CORRECT",
      sslState: "PENDING",
    });
    // Valid HTTPS but the answer is NOT this website (provider routing missing):
    // DNS + an arbitrary HTTPS response must not make the domain ACTIVE.
    httpsBody = "<html>some parking page</html>";
    const parked = (
      await h.call("GET", `/api/domains/${id}/status`, { cookie: o.cookie })
    ).json.data;
    expect(parked.domain).toMatchObject({
      state: "VERIFYING",
      dnsState: "CORRECT",
      sslState: "ACTIVE",
      routingState: "PROVIDER_ROUTING_UNAVAILABLE",
    });
    expect(parked.routingNote).toMatch(
      /CUSTOM_DOMAIN_PROVIDER_ROUTING_UNAVAILABLE/,
    );
    // Routed to this site over valid HTTPS: DNS + routing + TLS all observed -> ACTIVE.
    const [versionRow] =
      (await h.sql`SELECT artifact FROM site_versions WHERE site_id=${site.id}`) as unknown as Array<{
        artifact: Record<string, string>;
      }>;
    httpsBody = versionRow!.artifact["index.html"]!;
    expect(
      (await h.call("GET", `/api/domains/${id}/status`, { cookie: o.cookie }))
        .json.data.domain,
    ).toMatchObject({
      state: "ACTIVE",
      sslState: "ACTIVE",
      routingState: "CONFIGURED",
    });
    // Host-based serving and a change event for the incident timeline.
    const port = Number(new URL(h.base).port);
    const served = await getWithHost(port, "www.dom-shop.com", "/");
    expect(served.status).toBe(200);
    expect(served.body).toContain("Shop");
    const changes = (
      await h.call("GET", `/api/sites/${site.id}/deployments`, {
        cookie: o.cookie,
      })
    ).json.data.changes.map((c: { kind: string }) => c.kind);
    expect(changes).toContain("DOMAIN_STATUS_CHANGED");
    // Regression is noticed: DNS moves away -> back to DNS_REQUIRED with a notification.
    httpsBody = null;
    resolverState.cname = ["elsewhere.example."];
    expect(
      (await h.call("GET", `/api/domains/${id}/status`, { cookie: o.cookie }))
        .json.data.domain.state,
    ).toBe("DNS_REQUIRED");
    expect(
      (
        await h.call("GET", "/api/notifications", { cookie: o.cookie })
      ).json.data.map((n: { kind: string }) => n.kind),
    ).toEqual(expect.arrayContaining(["DOMAIN_CONNECTED", "DOMAIN_PROBLEM"]));
    expect((await getWithHost(port, "www.dom-shop.com", "/")).status).toBe(404);
  });
  it("never fakes buying or searching: it says exactly what is missing", async () => {
    const o = await h.signup("dom-2@example.com");
    const site = (
      await h.call("POST", "/api/sites", {
        cookie: o.cookie,
        body: { orgId: o.orgId, name: "Dom Two" },
      })
    ).json.data;
    const buy = await h.call("POST", `/api/sites/${site.id}/domains/purchase`, {
      cookie: o.cookie,
      body: { hostname: "x.com" },
    });
    expect(buy.status).toBe(501);
    expect(buy.json.message).toMatch(/never registers a domain without/);
    expect(
      (
        await h.call("POST", `/api/sites/${site.id}/domains/search`, {
          cookie: o.cookie,
          body: { query: "myshop" },
        })
      ).status,
    ).toBe(501);
    const list = (
      await h.call("GET", `/api/sites/${site.id}/domains`, { cookie: o.cookie })
    ).json.data;
    expect(list.purchase.available).toBe(false);
    expect(
      list.providers.every(
        (p: { configured: boolean }) => p.configured === false,
      ),
    ).toBe(true);
  });
  it("keeps domains tenant-isolated and unique", async () => {
    const a = await h.signup("dom-a@example.com");
    const b = await h.signup("dom-b@example.com");
    const sa = (
      await h.call("POST", "/api/sites", {
        cookie: a.cookie,
        body: { orgId: a.orgId, name: "A" },
      })
    ).json.data;
    const sb = (
      await h.call("POST", "/api/sites", {
        cookie: b.cookie,
        body: { orgId: b.orgId, name: "B" },
      })
    ).json.data;
    const c = await h.call("POST", `/api/sites/${sa.id}/domains/connect`, {
      cookie: a.cookie,
      body: { hostname: "tenant.example.org" },
    });
    expect(
      (
        await h.call("GET", `/api/domains/${c.json.data.domain.id}/status`, {
          cookie: b.cookie,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await h.call("POST", `/api/sites/${sa.id}/domains/connect`, {
          cookie: b.cookie,
          body: { hostname: "x.example.org" },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await h.call("POST", `/api/sites/${sb.id}/domains/connect`, {
          cookie: b.cookie,
          body: { hostname: "tenant.example.org" },
        })
      ).status,
    ).toBe(409);
  });
});
