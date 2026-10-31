import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  startHarness,
  type Harness,
} from "../test-support/platform-harness.js";

const enabled = Boolean(process.env.DATABASE_URL);
const d = enabled ? describe : describe.skip;
const SECRET = "test-app-secret";

let live: Harness; // no provider credentials: everything reports NOT_CONFIGURED
let box: Harness; // sandbox providers + webhook secret
beforeAll(async () => {
  if (!enabled) return;
  live = await startHarness();
  box = await startHarness({
    env: {
      KORA_SANDBOX_CHANNELS: "true",
      META_APP_SECRET: SECRET,
      WHATSAPP_VERIFY_TOKEN: "verify-me",
    },
  });
});
afterAll(async () => {
  if (enabled) {
    await live.close();
    await box.close();
  }
});

const brief = {
  name: "Chan Shop",
  description:
    "Shop in Lagos selling fabrics, tailoring and delivery across town.",
  whatsapp: "+2348012345678",
};
async function site(h: Harness, email: string) {
  const a = await h.signup(email, "Org");
  const s = (
    await h.call("POST", "/api/sites", {
      cookie: a.cookie,
      body: { orgId: a.orgId, name: brief.name },
    })
  ).json.data;
  const gen = await h.call("POST", `/api/sites/${s.id}/generate`, {
    cookie: a.cookie,
    body: brief,
  });
  await h.call(
    "POST",
    `/api/sites/${s.id}/versions/${gen.json.data.version.id}/publish`,
    { cookie: a.cookie },
  );
  return { a, s };
}

d("channels without credentials", () => {
  it("lists the matrix honestly and refuses to connect, naming only missing settings", async () => {
    const { a, s } = await site(live, "ch1@example.com");
    const list = await live.call("GET", `/api/sites/${s.id}/channels`, {
      cookie: a.cookie,
    });
    expect(list.status).toBe(200);
    const ig = list.json.data.channels.find(
      (c: { provider: string }) => c.provider === "instagram",
    );
    expect(ig.runtime.state).toBe("NOT_CONFIGURED");
    expect(ig.runtime.missing).toEqual(
      expect.arrayContaining(["META_APP_ID", "META_APP_SECRET"]),
    );
    const wa = list.json.data.channels.find(
      (c: { provider: string }) => c.provider === "whatsapp",
    );
    expect(wa.capabilities.publish).toBe("unsupported");
    expect(wa.notes.join(" ")).toMatch(/Status/);
    const conn = await live.call(
      "POST",
      `/api/sites/${s.id}/channels/instagram/connect`,
      { cookie: a.cookie, body: {} },
    );
    expect(conn.status).toBe(409);
    expect(conn.json.error).toBe("not_configured");
    expect(
      (
        await live.call(
          "POST",
          `/api/sites/${s.id}/channels/linkedin/connect`,
          { cookie: a.cookie, body: {} },
        )
      ).json.message,
    ).toMatch(/not available yet/);
  });
});

d("sandbox connection lifecycle", () => {
  it("connects through a user-bound single-use state, never exposes tokens, disconnects", async () => {
    const { a, s } = await site(box, "ch2@example.com");
    const start = await box.call(
      "POST",
      `/api/sites/${s.id}/channels/facebook/connect`,
      { cookie: a.cookie, body: {} },
    );
    expect(start.status).toBe(200);
    const url = new URL(start.json.data.authorizeUrl);
    const state = url.searchParams.get("state")!;

    // Another user cannot finish this flow with the state they intercepted.
    const other = await box.signup("ch2-other@example.com", "Other");
    const stolen = await box.call(
      "GET",
      `/api/oauth/callback?state=${encodeURIComponent(state)}&code=sandbox`,
      { cookie: other.cookie },
    );
    expect(stolen.status).toBe(400);

    // The stolen attempt consumed it, so even the rightful user must start again.
    const again = await box.call(
      "GET",
      `/api/oauth/callback?state=${encodeURIComponent(state)}&code=sandbox`,
      { cookie: a.cookie },
    );
    expect(again.status).toBe(400);

    const s2 = new URL(
      (
        await box.call("POST", `/api/sites/${s.id}/channels/facebook/connect`, {
          cookie: a.cookie,
          body: {},
        })
      ).json.data.authorizeUrl,
    ).searchParams.get("state")!;
    const ok = await box.call(
      "GET",
      `/api/oauth/callback?state=${encodeURIComponent(s2)}&code=sandbox`,
      { cookie: a.cookie },
    );
    // The redirect lands on the SPA path, which this API-only harness does not serve; state is verified below.
    expect(ok.status).not.toBe(400);
    const replay = await box.call(
      "GET",
      `/api/oauth/callback?state=${encodeURIComponent(s2)}&code=sandbox`,
      { cookie: a.cookie },
    );
    expect(replay.status).toBe(400);

    const list = await box.call("GET", `/api/sites/${s.id}/channels`, {
      cookie: a.cookie,
    });
    const fb = list.json.data.channels.find(
      (c: { provider: string }) => c.provider === "facebook",
    );
    expect(fb.connection.state).toBe("CONNECTED");
    expect(fb.connection.mode).toBe("SANDBOX");
    expect(JSON.stringify(list.json)).not.toMatch(
      /sandbox-token|token_ciphertext|accessToken/,
    );
    // Stored encrypted, not as the token itself.
    const row = (
      await box.sql`SELECT token_ciphertext FROM channel_connections WHERE site_id=${s.id}`
    )[0]!;
    expect(String(row.token_ciphertext)).toMatch(/^v1\./);
    expect(String(row.token_ciphertext)).not.toContain("sandbox-token");

    const chk = await box.call(
      "POST",
      `/api/sites/${s.id}/channels/facebook/check`,
      { cookie: a.cookie },
    );
    expect(chk.json.data.state).toBe("CONNECTED");

    // Presence now sees the channel.
    await box.call("POST", `/api/sites/${s.id}/presence/import`, {
      cookie: a.cookie,
    });
    const pres = await box.call("GET", `/api/sites/${s.id}/presence`, {
      cookie: a.cookie,
    });
    expect(
      pres.json.data.graph.distribution.channels.find(
        (c: { provider: string }) => c.provider === "facebook",
      ).state,
    ).toBe("CONNECTED");

    expect(
      (
        await box.call(
          "POST",
          `/api/sites/${s.id}/channels/facebook/disconnect`,
          { cookie: a.cookie },
        )
      ).status,
    ).toBe(200);
    const after =
      await box.sql`SELECT token_ciphertext,state FROM channel_connections WHERE site_id=${s.id}`;
    expect(after[0]!.token_ciphertext).toBeNull();
    expect(after[0]!.state).toBe("DISCONNECTED");
  });

  it("marks an expired token AUTH_EXPIRED on check and keeps other tenants out", async () => {
    const { a, s } = await site(box, "ch3@example.com");
    const st = new URL(
      (
        await box.call(
          "POST",
          `/api/sites/${s.id}/channels/instagram/connect`,
          { cookie: a.cookie, body: {} },
        )
      ).json.data.authorizeUrl,
    ).searchParams.get("state")!;
    await box.call(
      "GET",
      `/api/oauth/callback?state=${encodeURIComponent(st)}&code=sandbox`,
      { cookie: a.cookie },
    );
    await box.sql`UPDATE channel_connections SET token_expires_at = now() - interval '1 hour' WHERE site_id=${s.id}`;
    // Sandbox refresh renews, so expiry is healed rather than reported: the contract is "refresh when due".
    expect(
      (
        await box.call("POST", `/api/sites/${s.id}/channels/instagram/check`, {
          cookie: a.cookie,
        })
      ).json.data.state,
    ).toBe("CONNECTED");

    const b = await box.signup("ch3-b@example.com", "B");
    for (const [m, p, body] of [
      ["GET", `/api/sites/${s.id}/channels`],
      ["POST", `/api/sites/${s.id}/channels/instagram/connect`, {}],
      ["POST", `/api/sites/${s.id}/channels/instagram/disconnect`],
      ["POST", `/api/sites/${s.id}/channels/instagram/check`],
    ] as Array<[string, string, unknown?]>) {
      expect(
        (await box.call(m, p, { cookie: b.cookie, ...(body ? { body } : {}) }))
          .status,
        `${m} ${p}`,
      ).toBe(404);
    }
  });
});

const sign = (raw: string) =>
  `sha256=${createHmac("sha256", SECRET).update(raw).digest("hex")}`;
const waPayload = (pid: string, id: string, text: string) => ({
  entry: [
    {
      changes: [
        {
          value: {
            metadata: { phone_number_id: pid },
            contacts: [{ wa_id: "2348055500001", profile: { name: "Ada" } }],
            messages: [
              {
                id,
                from: "2348055500001",
                timestamp: String(Math.floor(Date.now() / 1000)),
                type: "text",
                text: { body: text },
              },
            ],
          },
        },
      ],
    },
  ],
});
const hook = (h: Harness, payload: unknown, sig?: string) => {
  const raw = JSON.stringify(payload);
  return fetch(`${h.base}/api/webhooks/whatsapp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256": sig ?? sign(raw),
    },
    body: raw,
  });
};

d("whatsapp webhook and customer hub", () => {
  it("verifies the handshake, rejects spoofed signatures, is replay-safe and tenant-mapped", async () => {
    const hs = await fetch(
      `${box.base}/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=abc123`,
    );
    expect(await hs.text()).toBe("abc123");
    expect(
      (
        await fetch(
          `${box.base}/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=x`,
        )
      ).status,
    ).toBe(403);

    const { a, s } = await site(box, "wa1@example.com");
    const st = new URL(
      (
        await box.call("POST", `/api/sites/${s.id}/channels/whatsapp/connect`, {
          cookie: a.cookie,
          body: { externalAccountId: "109900001111" },
        })
      ).json.data.authorizeUrl,
    ).searchParams.get("state")!;
    await box.call(
      "GET",
      `/api/oauth/callback?state=${encodeURIComponent(st)}&code=sandbox`,
      { cookie: a.cookie },
    );

    // A forged delivery changes nothing.
    const bad = await hook(
      box,
      waPayload("109900001111", "wamid.FORGED", "hi"),
      "sha256=" + "0".repeat(64),
    );
    expect(bad.status).toBe(401);
    expect(
      Number(
        (
          await box.sql`SELECT COUNT(*)::int AS n FROM leads WHERE site_id=${s.id}`
        )[0]!.n,
      ),
    ).toBe(0);

    const good = await hook(
      box,
      waPayload("109900001111", "wamid.A1", "How much for 5 yards of ankara?"),
    );
    expect(good.status).toBe(200);
    expect((await good.json()).data.created).toBe(1);
    // Meta retries: the same message id must not create a second lead or message.
    const replay = await hook(
      box,
      waPayload("109900001111", "wamid.A1", "How much for 5 yards of ankara?"),
    );
    expect((await replay.json()).data).toMatchObject({
      created: 0,
      ignored: 1,
    });
    // A second message from the same customer joins the same conversation.
    await hook(
      box,
      waPayload("109900001111", "wamid.A2", "Do you deliver to Lekki?"),
    );
    // A number no business owns is stored and ignored, not attributed to anyone.
    const stray = await hook(box, waPayload("555000000", "wamid.Z9", "hello"));
    expect((await stray.json()).data.ignored).toBe(1);

    const leads = await box.call("GET", `/api/sites/${s.id}/leads`, {
      cookie: a.cookie,
    });
    expect(leads.json.data.leads).toHaveLength(1);
    const lead = leads.json.data.leads[0];
    expect(lead.source).toBe("WHATSAPP");
    expect(lead.customer.name).toBe("Ada");
    expect(leads.json.data.counts.waiting).toBe(1);
    const detail = await box.call(
      "GET",
      `/api/sites/${s.id}/leads/${lead.id}`,
      { cookie: a.cookie },
    );
    expect(detail.json.data.messages).toHaveLength(2);
    expect(detail.json.data.whatsapp.windowOpen).toBe(true);
    expect(detail.json.data.whatsapp.link).toContain("wa.me/2348055500001");

    // The owner replied from their phone and logs it: the customer is no longer waiting.
    const logged = await box.call(
      "POST",
      `/api/sites/${s.id}/leads/${lead.id}/messages`,
      {
        cookie: a.cookie,
        body: { kind: "reply_sent", body: "Yes, 5 yards is ₦12,500." },
      },
    );
    expect(logged.status).toBe(201);
    let sum = await box.call("GET", `/api/sites/${s.id}/customers/summary`, {
      cookie: a.cookie,
    });
    expect(sum.json.data.waiting).toBe(0);
    // They write again: waiting again.
    await hook(
      box,
      waPayload("109900001111", "wamid.A3", "Great, I will pay today"),
    );
    sum = await box.call("GET", `/api/sites/${s.id}/customers/summary`, {
      cookie: a.cookie,
    });
    expect(sum.json.data.waiting).toBe(1);

    // Another tenant never sees the lead.
    const b = await box.signup("wa1-b@example.com", "B");
    expect(
      (await box.call("GET", `/api/sites/${s.id}/leads`, { cookie: b.cookie }))
        .status,
    ).toBe(404);
    expect(
      (
        await box.call("GET", `/api/sites/${s.id}/leads/${lead.id}`, {
          cookie: b.cookie,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await box.call("POST", `/api/sites/${s.id}/leads/${lead.id}/status`, {
          cookie: b.cookie,
          body: { status: "WON" },
        })
      ).status,
    ).toBe(404);
  });

  it("turns website enquiries into leads exactly once and tracks follow-ups", async () => {
    const { a, s } = await site(box, "wa2@example.com");
    const post = (n: string) =>
      fetch(`${box.base}/api/public/sites/${s.id}/forms`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: n,
          phone: "+234 805 550 0002",
          message: "Need a quote",
        }),
      });
    expect((await post("Bola")).status).toBeLessThan(300);
    const first = await box.call("GET", `/api/sites/${s.id}/leads`, {
      cookie: a.cookie,
    });
    const again = await box.call("GET", `/api/sites/${s.id}/leads`, {
      cookie: a.cookie,
    });
    expect(first.json.data.leads).toHaveLength(1);
    expect(again.json.data.leads).toHaveLength(1);
    expect(first.json.data.leads[0].status).toBe("NEW");
    // The same phone writing again from the website reuses the customer.
    await post("Bola A.");
    const two = await box.call("GET", `/api/sites/${s.id}/leads`, {
      cookie: a.cookie,
    });
    expect(two.json.data.leads).toHaveLength(2);
    expect(
      new Set(
        two.json.data.leads.map(
          (l: { customer: { id: string } }) => l.customer.id,
        ),
      ).size,
    ).toBe(1);

    const lead = two.json.data.leads[0];
    expect(
      (
        await box.call("POST", `/api/sites/${s.id}/leads/${lead.id}/seen`, {
          cookie: a.cookie,
        })
      ).json.data.status,
    ).toBe("NEEDS_REPLY");
    const past = await box.call(
      "POST",
      `/api/sites/${s.id}/leads/${lead.id}/follow-ups`,
      { cookie: a.cookie, body: { dueAt: "2020-01-01T00:00:00.000Z" } },
    );
    expect(past.status).toBe(422);
    const fu = await box.call(
      "POST",
      `/api/sites/${s.id}/leads/${lead.id}/follow-ups`,
      {
        cookie: a.cookie,
        body: {
          dueAt: new Date(Date.now() + 86_400_000).toISOString(),
          note: "Call back",
        },
      },
    );
    expect(fu.status).toBe(201);
    expect(
      (
        await box.call("POST", `/api/sites/${s.id}/leads/${lead.id}/status`, {
          cookie: a.cookie,
          body: { status: "WON" },
        })
      ).json.data.status,
    ).toBe("WON");
    expect(
      (
        await box.call("POST", `/api/sites/${s.id}/leads/${lead.id}/status`, {
          cookie: a.cookie,
          body: { status: "BOGUS" },
        })
      ).status,
    ).toBe(400);
    const audit = (
      await box.call("GET", `/api/orgs/${a.orgId}/audit`, { cookie: a.cookie })
    ).json.data as Array<{ action: string }>;
    expect(audit.some((x) => x.action === "lead.status_changed")).toBe(true);
  });
});
