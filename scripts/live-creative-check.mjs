// Production verification for the creative-loop build (migrations 022-024). Creates one throwaway trial account and
// exercises the real routes. It never contacts a third-party provider and posts nothing.
// Usage: node scripts/live-creative-check.mjs https://kora-api.rumptycloud.app
const base = process.argv[2];
if (!base) throw new Error("usage: live-creative-check.mjs <base-url>");
let cookie = "";
const out = [];
const call = async (method, path, body, auth = true) => {
  const res = await fetch(base + path, {
    method,
    headers: {
      "x-requested-with": "kora",
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(auth && cookie ? { cookie } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const sc = res.headers.get("set-cookie");
  if (sc && auth) cookie = sc.split(";")[0];
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* not json */
  }
  return { status: res.status, json };
};
const step = (name, ok, detail) => {
  out.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
};
// RumptyCloud may be asleep; wait for the app, not for a fixed time.
let claim = null;
for (let i = 0; i < 12 && !claim; i++) {
  const r = await fetch(base + "/__kora");
  if (r.ok && (r.headers.get("content-type") ?? "").includes("json"))
    claim = await r.json();
  else await new Promise((r2) => setTimeout(r2, 10_000));
}
if (!claim) throw new Error("app did not wake");
step("runtime claim", true, `commit ${claim.commit}`);

let r = await call("POST", "/api/auth/signup", {
  email: `creative+${Date.now()}@example.com`,
  password: "correct horse battery",
  displayName: "Creative Check",
  orgName: "Creative Check Co",
});
step("signup", r.status === 201, String(r.status));
const me = await call("GET", "/api/auth/me");
const orgId = me.json.data.orgs[0].id;
r = await call("POST", "/api/sites", { orgId, name: "Ada Cakes" });
const siteId = r.json.data.id;
r = await call("POST", `/api/sites/${siteId}/generate`, {
  name: "Ada Cakes",
  description:
    "Birthday cakes, cupcakes and sourdough bread baked to order in Yaba, Lagos.",
  whatsapp: "+2348012345678",
  hours: [{ days: "Mon-Sat", hours: "9am-6pm" }],
  services: ["Birthday cakes", "Cupcakes"],
});
step("site generated", r.status === 201);
const versionId = r.json.data.version.id;
r = await call("POST", `/api/sites/${siteId}/versions/${versionId}/publish`);
step(
  "site published and verified",
  r.status === 200 && r.json.data.verification?.status === "MATCH",
);

r = await call("GET", `/api/sites/${siteId}/versions/${versionId}/quality`);
step(
  "creative quality grade + budgets (migration-free route)",
  r.status === 200 &&
    /^K[0-5]$/.test(r.json.data.grade) &&
    Array.isArray(r.json.data.budgets),
  r.json?.data?.grade,
);

r = await call("POST", `/api/sites/${siteId}/presence/import`);
step("presence import", r.status === 201);
r = await call("POST", `/api/sites/${siteId}/brand-kit`, { from: "site" });
step("brand kit", r.status === 201);

r = await call("POST", `/api/sites/${siteId}/truth/check`, {
  subject: "check",
  claims: [
    { kind: "hours", key: "hours" },
    { kind: "testimonial", key: "t1", text: "Best cake in Lagos" },
  ],
});
step(
  "truth ledger (migration 022): hours allowed, testimonial blocked",
  r.status === 201 &&
    r.json.data.used.length === 1 &&
    r.json.data.blocked.length === 1 &&
    r.json.data.publishable === false,
);
r = await call("POST", `/api/sites/${siteId}/genome`, {
  positioning: "Cakes baked to order.",
});
step(
  "brand genome v1 saved",
  r.status === 201 && r.json.data.current.version === 1,
);
r = await call("POST", `/api/sites/${siteId}/genome`, {});
step(
  "brand genome v2 keeps owner positioning",
  r.status === 201 &&
    r.json.data.current.version === 2 &&
    r.json.data.current.strategic.positioning === "Cakes baked to order.",
);

r = await call("POST", `/api/sites/${siteId}/campaign-briefs`, {
  hasProductPhoto: true,
  brief: {
    name: "Box",
    objective: "announce",
    audience: "Parents",
    subjectKey: "offer:box",
    subject: "the cake box",
    startOn: "2026-11-01",
    endOn: "2026-11-30",
    channels: ["instagram"],
  },
});
step(
  "campaign brief (migration 023): 2 feasible, 2 blocked",
  r.status === 201 &&
    r.json.data.directions.length === 2 &&
    r.json.data.blocked.length === 2,
);
const bid = r.json?.data?.id;
r = await call("POST", `/api/sites/${siteId}/campaign-briefs/${bid}/choose`, {
  angle: "people",
});
step("blocked direction refused", r.status === 422);

r = await call("GET", `/api/sites/${siteId}/discovery`);
step(
  "discovery JSON-LD from owner facts",
  r.status === 200 && r.json.data.jsonld["@type"] === "LocalBusiness",
);
r = await call("GET", `/api/sites/${siteId}/today-actions`);
step("today actions", r.status === 200 && Array.isArray(r.json.data.actions));
r = await call("GET", `/api/sites/${siteId}/performance`);
step(
  "performance report is honest",
  r.status === 200 && typeof r.json.data.headline === "string",
);
r = await call("GET", `/api/sites/${siteId}/customers/suggestions`);
step("customer suggestions reachable", r.status === 200);
r = await call("POST", `/api/sites/${siteId}/feedback`, {
  subject: "p1",
  label: "LOVE",
  traits: ["close-crop"],
});
step("taste feedback saved", r.status === 201);
r = await call("POST", `/api/sites/${siteId}/requests`, {
  title: "Valentine flyer",
});
step("managed request opened", r.status === 201);

r = await call("GET", `/api/sites/${siteId}/media/status`);
step(
  "media status (migration 024)",
  r.status === 200 && typeof r.json.data.image.configured === "boolean",
  `image configured: ${r.json?.data?.image?.configured}`,
);
const mediaConfigured = r.json?.data?.image?.configured === true;
r = await call("POST", `/api/sites/${siteId}/media/generate`, {
  subject: "Wedding venue",
});
step(
  "generation refuses things the owner did not say they sell",
  mediaConfigured ? r.status === 422 : r.status === 503,
  String(r.status),
);

r = await call(
  "POST",
  "/api/public/audit",
  { url: "file:///etc/passwd" },
  false,
);
step("public audit refuses file:// (SSRF guard)", r.status === 422);
r = await call(
  "POST",
  "/api/public/audit",
  { url: "http://169.254.169.254/latest/meta-data" },
  false,
);
step("public audit refuses link-local metadata address", r.status === 422);
r = await call(
  "POST",
  "/api/public/audit",
  { url: "https://example.com" },
  false,
);
step(
  "public audit reads a real public page and signs a share link",
  r.status === 201 &&
    r.json.data.total > 5 &&
    typeof r.json.data.shareToken === "string",
  `${r.json?.data?.passed}/${r.json?.data?.total}`,
);
const tok = r.json?.data?.shareToken;
r = await call(
  "GET",
  `/api/public/audit/shared?t=${encodeURIComponent(tok)}`,
  undefined,
  false,
);
step("share link opens", r.status === 200);
r = await call(
  "GET",
  `/api/public/audit/shared?t=${encodeURIComponent(tok)}x`,
  undefined,
  false,
);
step("tampered share link rejected", r.status === 404);

r = await call("GET", "/api/billing/plans", undefined, false);
console.log(
  "plans on this deploy:",
  JSON.stringify(
    r.json?.data?.map((p) => [p.code, p.amountMinor / 100, p.currency]),
  ),
);
const ch = await call("GET", `/api/sites/${siteId}/channels`);
console.log(
  "channel states:",
  JSON.stringify(
    ch.json?.data?.channels?.map((c) => [c.provider, c.runtime?.state]),
  ),
);

console.log(
  "\n" +
    JSON.stringify(
      {
        base,
        commit: claim.commit,
        at: new Date().toISOString(),
        passed: out.filter((o) => o.ok).length,
        failed: out.filter((o) => !o.ok).length,
        siteId,
        orgId,
      },
      null,
      2,
    ),
);
process.exit(out.some((o) => !o.ok) ? 1 : 0);
