import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startHarness, type Harness } from "./test-support/platform-harness.js";

/**
 * One matrix for the whole v7 surface: every endpoint added or changed by the creative OS is exercised signed out,
 * without the CSRF header, as a read-only member, and as another organisation. The expectation is the same for all.
 */
const enabled = Boolean(process.env.DATABASE_URL);
const d = enabled ? describe : describe.skip;
let h: Harness;
beforeAll(async () => {
  if (enabled)
    h = await startHarness({
      env: {
        KORA_CREATIVE_ENGINE: "v3",
        KORA_MEDIA_PUBLIC_URL: "https://media.test.example",
      },
    });
});
afterAll(async () => {
  if (enabled) await h.close();
});

const brief = {
  name: "Tola's Cakes",
  description:
    "A home bakery in Lekki making birthday cakes, cupcakes and small chops.",
  whatsapp: "+2348012345678",
  services: ["Birthday cakes", "Cupcakes", "Small chops"],
};

type Ep = {
  name: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: (s: string) => string;
  body?: unknown;
  /** needs MEMBER or better to change anything */
  writes: boolean;
};
const ENDPOINTS: Ep[] = [
  {
    name: "brand os (read)",
    method: "GET",
    path: (s) => `/api/sites/${s}/brand-os`,
    writes: false,
  },
  {
    name: "brand os version (read)",
    method: "GET",
    path: (s) => `/api/sites/${s}/brand-os/1`,
    writes: false,
  },
  {
    name: "brand os backfill",
    method: "POST",
    path: (s) => `/api/sites/${s}/brand-os/backfill`,
    body: {},
    writes: true,
  },
  {
    name: "design edit",
    method: "POST",
    path: (s) => `/api/sites/${s}/edit`,
    body: { designEdit: { kind: "nudge", nudge: "calmer" } },
    writes: true,
  },
  {
    name: "creative feedback",
    method: "POST",
    path: (s) => `/api/sites/${s}/creative-feedback`,
    body: { kind: "DIRECTION_CHOSEN", subject: "x" },
    writes: true,
  },
  {
    name: "media library (list)",
    method: "GET",
    path: (s) => `/api/sites/${s}/media-library`,
    writes: false,
  },
  {
    name: "media library (upload)",
    method: "POST",
    path: (s) => `/api/sites/${s}/media-library?kind=photo&filename=a.png`,
    body: {},
    writes: true,
  },
  {
    name: "artifact create",
    method: "POST",
    path: (s) => `/api/sites/${s}/artifacts`,
    body: { format: "social-square", headline: "Hello" },
    writes: true,
  },
  {
    name: "artifact preview",
    method: "POST",
    path: (s) => `/api/sites/${s}/artifacts/preview`,
    body: { format: "social-square", headline: "Hello" },
    writes: false,
  },
  {
    name: "artifact bundle",
    method: "POST",
    path: (s) => `/api/sites/${s}/artifacts/bundle`,
    body: { formats: ["story"], headline: "Hello" },
    writes: true,
  },
  {
    name: "campaign proposal",
    method: "POST",
    path: (s) => `/api/sites/${s}/campaign-proposal`,
    body: { request: "I need more birthday cake orders next week" },
    writes: true,
  },
  {
    name: "directions (site)",
    method: "POST",
    path: (s) => `/api/sites/${s}/design/directions`,
    body: {},
    writes: true,
  },
  {
    name: "upgrade to v3",
    method: "POST",
    path: (s) =>
      `/api/sites/${s}/versions/${"0".repeat(8)}-0000-4000-8000-${"0".repeat(12)}/upgrade-v3`,
    body: {},
    writes: true,
  },
];

d("v7 surface: authentication, CSRF guard, roles and tenant isolation", () => {
  it("every endpoint refuses signed-out callers, cross-site requests, read-only members and other organisations", async () => {
    const owner = await h.signup("sec-owner@example.com", "Owner Org");
    const viewer = await h.signup("sec-viewer@example.com", "Viewer Org");
    const stranger = await h.signup("sec-stranger@example.com", "Stranger Org");
    await h.call("POST", `/api/orgs/${owner.orgId}/members`, {
      cookie: owner.cookie,
      body: { email: "sec-viewer@example.com", role: "VIEWER" },
    });
    const site = (
      await h.call("POST", "/api/sites", {
        cookie: owner.cookie,
        body: { orgId: owner.orgId, name: brief.name },
      })
    ).json.data;
    expect(
      (
        await h.call("POST", `/api/sites/${site.id}/generate`, {
          cookie: owner.cookie,
          body: brief,
        })
      ).status,
    ).toBe(201);

    const failures: string[] = [];
    const want = (label: string, got: number, ok: number[]) => {
      if (!ok.includes(got))
        failures.push(`${label}: got ${got}, wanted ${ok.join("/")}`);
    };
    for (const ep of ENDPOINTS) {
      const path = ep.path(site.id);
      const send = (
        cookie: string | null,
        headers: Record<string, string> = {},
      ) =>
        h.call(ep.method, path, {
          ...(cookie ? { cookie } : {}),
          ...(ep.body !== undefined ? { body: ep.body } : {}),
          headers,
        });
      // 1. signed out
      want(`${ep.name} signed out`, (await send(null)).status, [401]);
      // 2. a mutating call without the CSRF header (a cross-site form post) is refused even with a valid session
      if (ep.method !== "GET") {
        const res = await fetch(`${h.base}${path}`, {
          method: ep.method,
          headers: {
            cookie: owner.cookie,
            "content-type": "application/json",
          },
          body: JSON.stringify(ep.body ?? {}),
        });
        want(`${ep.name} without CSRF header`, res.status, [403]);
      }
      // 3. another organisation never learns the site exists
      want(
        `${ep.name} other org`,
        (await send(stranger.cookie)).status,
        [403, 404],
      );
      // 4. a read-only member cannot change anything
      const v = (await send(viewer.cookie)).status;
      if (ep.writes) want(`${ep.name} viewer`, v, [403, 404]);
    }
    expect(failures).toEqual([]);
    // positive controls, so the refusals above are not simply a broken route: the owner can read and write, and a
    // read-only member can read
    const read = (c: string) =>
      h.call("GET", `/api/sites/${site.id}/brand-os`, { cookie: c });
    expect((await read(owner.cookie)).status).toBe(200);
    expect((await read(viewer.cookie)).status).toBe(200);
    expect(
      (
        await h.call("POST", `/api/sites/${site.id}/campaign-proposal`, {
          cookie: owner.cookie,
          body: { request: "I need more birthday cake orders next week" },
        })
      ).status,
    ).toBe(200);

    // the public, content-addressed media route serves only bytes of a real, non-removed picture, never an error page
    const miss = await fetch(
      `${h.base}/api/public/sites/${site.id}/m/${"a".repeat(64)}/w1280.webp`,
    );
    expect(miss.status).toBe(404);
    expect(await miss.text()).not.toContain("<");
  });

  it("hostile text in a proposal request or a design request is data, never markup or a command", async () => {
    const o = await h.signup("sec-xss@example.com", "XSS Org");
    const site = (
      await h.call("POST", "/api/sites", {
        cookie: o.cookie,
        body: { orgId: o.orgId, name: brief.name },
      })
    ).json.data;
    await h.call("POST", `/api/sites/${site.id}/generate`, {
      cookie: o.cookie,
      body: brief,
    });
    const evil = `<img src=x onerror=alert(1)> more birthday cake orders next week '); DROP TABLE sites;--`;
    const r = await h.call("POST", `/api/sites/${site.id}/campaign-proposal`, {
      cookie: o.cookie,
      body: { request: evil },
    });
    expect([200, 422]).toContain(r.status);
    expect(JSON.stringify(r.json)).not.toMatch(/<img|onerror|DROP TABLE/i);
    // unknown fields are refused, not merged
    const strict = await h.call(
      "POST",
      `/api/sites/${site.id}/campaign-proposal`,
      {
        cookie: o.cookie,
        body: { request: "more cake orders", autoPublish: true, spends: true },
      },
    );
    expect(strict.status).toBe(400);
    // a design request cannot smuggle in a value outside the vocabulary
    const edit = await h.call("POST", `/api/sites/${site.id}/edit`, {
      cookie: o.cookie,
      body: { designEdit: { kind: "nudge", nudge: "<script>" } },
    });
    expect(edit.status).toBeGreaterThanOrEqual(400);
    expect(edit.status).toBeLessThan(500);
    // the site table is intact
    expect(
      (
        await h.sql`SELECT count(*)::int AS n FROM sites WHERE id=${site.id}`
      )[0]!.n,
    ).toBe(1);
  });
});
