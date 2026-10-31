// Production verification for the Presence/Marketing build. Creates one throwaway trial account on the target,
// exercises the real routes, and prints a JSON report. It never sends anything to a third-party provider.
// Usage: node scripts/live-presence-check.mjs https://kora-api.rumptycloud.app
const base = process.argv[2];
if (!base) throw new Error("usage: live-presence-check.mjs <base-url>");
let cookie = "";
const out = [];
const call = async (method, path, body) => {
  const res = await fetch(base + path, {
    method,
    redirect: "manual",
    headers: {
      "x-requested-with": "kora",
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const sc = res.headers.get("set-cookie");
  if (sc) cookie = sc.split(";")[0];
  const buf = Buffer.from(await res.arrayBuffer());
  let json = null;
  try {
    json = JSON.parse(buf.toString());
  } catch {
    /* binary */
  }
  return {
    status: res.status,
    json,
    buf,
    type: res.headers.get("content-type"),
  };
};
const step = (name, ok, detail) => {
  out.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
};

const claim = await (await fetch(base + "/__kora")).json();
step("runtime claim", true, `commit ${claim.commit}`);
const email = `presence+${Date.now()}@example.com`;
let r = await call("POST", "/api/auth/signup", {
  email,
  password: "correct horse battery",
  displayName: "Presence Check",
  orgName: "Presence Check Co",
});
step("signup", r.status === 201, String(r.status));
const me = await call("GET", "/api/auth/me");
const orgId = me.json.data.orgs[0].id;
r = await call("GET", `/api/orgs/${orgId}/features`);
step(
  "features: trial includes everything",
  r.json?.data?.tier === "TRIAL" &&
    r.json.data.features["marketing.agent"] === true,
  `tier ${r.json?.data?.tier}`,
);
r = await call("POST", "/api/sites", { orgId, name: "Presence Check Kitchen" });
const siteId = r.json.data.id;
r = await call("POST", `/api/sites/${siteId}/generate`, {
  name: "Presence Check Kitchen",
  description: "Home-style Nigerian meals and party jollof in Lekki, Lagos.",
  whatsapp: "+2348012345678",
  hours: [{ days: "Mon-Sat", hours: "9am-8pm" }],
});
step("site generated", r.status === 201, String(r.status));
const versionId = r.json.data.version.id;
r = await call("POST", `/api/sites/${siteId}/versions/${versionId}/publish`);
step("site published", r.status === 200, String(r.status));
r = await call("POST", `/api/sites/${siteId}/presence/import`);
step("presence profile imported (migration 013 live)", r.status === 201);
const facts = r.json.data.facts;
facts.offer.services = ["Party jollof"];
facts.offer.offers = [
  {
    id: "lunch",
    title: "Weekday lunch",
    detail: "Rice and stew",
    price: "₦3,500",
  },
];
r = await call("PUT", `/api/sites/${siteId}/presence/profile`, {
  facts,
  expectedRevision: 1,
});
step(
  "profile saved with revision",
  r.status === 200 && r.json.data.revision === 2,
);
r = await call("POST", `/api/sites/${siteId}/brand-kit`, { from: "site" });
step("brand kit derived", r.status === 201);
r = await call("GET", `/api/sites/${siteId}/presence`);
step(
  "presence health has no numeric score",
  r.status === 200 && !("score" in r.json.data.health),
  r.json?.data?.health?.headline,
);
r = await call("GET", `/api/sites/${siteId}/channels`);
const ig = r.json?.data?.channels?.find((c) => c.provider === "instagram");
step(
  "channels honest: NOT_CONFIGURED, no sandbox",
  ig?.runtime?.state === "NOT_CONFIGURED" && r.json.data.sandbox === false,
  JSON.stringify(ig?.runtime),
);
r = await call("POST", `/api/sites/${siteId}/channels/instagram/connect`, {});
step(
  "connect refuses without credentials",
  r.status === 409 && r.json.error === "not_configured",
);
r = await call("POST", `/api/sites/${siteId}/content/drafts`, {
  goal: "announce_offer",
  channel: "facebook",
  offerId: "lunch",
});
step(
  "content drafted from facts (usage metering constraint live)",
  r.status === 201 && r.json.data.drafts[0].draft.body.includes("₦3,500"),
  `source ${r.json?.data?.source}`,
);
r = await call("POST", `/api/sites/${siteId}/assets`, {
  format: "square",
  category: "offer",
  headline: "Weekday lunch",
  subline: "Rice and stew",
  detail: "₦3,500",
  cta: "Order on WhatsApp",
  contact: "+2348012345678",
});
step("branded image created", r.status === 201, String(r.status));
const assetId = r.json?.data?.asset?.id;
if (assetId) {
  const f = await call("GET", `/api/sites/${siteId}/assets/${assetId}/file`);
  step(
    "image is a real PNG with fonts rendered",
    f.type === "image/png" &&
      f.buf.subarray(0, 8).toString("hex") === "89504e470d0a1a0a" &&
      f.buf.length > 5000,
    `${f.buf.length} bytes`,
  );
}
r = await call("GET", `/api/sites/${siteId}/studio/options`);
step(
  "video export reported honestly",
  typeof r.json?.data?.motion?.exportAvailable === "boolean",
  `exportAvailable=${r.json?.data?.motion?.exportAvailable}`,
);
r = await call("POST", `/api/sites/${siteId}/campaigns`, {
  name: "Lunch launch",
  offerId: "lunch",
  channels: ["facebook", "whatsapp"],
  startOn: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
  endOn: new Date(Date.now() + 8 * 86400000).toISOString().slice(0, 10),
});
step(
  "campaign bundle built, awaiting approval",
  r.status === 201 && r.json.data.posts === 6,
  `posts ${r.json?.data?.posts}`,
);
if (r.status === 201) {
  const d = await call(
    "GET",
    `/api/sites/${siteId}/campaigns/${r.json.data.id}`,
  );
  const link =
    /https?:\/\/\S+/.exec(d.json.data.items[0].caption.body)?.[0] ?? "";
  step(
    "tracked link in post",
    /[?&]k=[a-z]{8}/.test(link),
    link.replace(/k=[a-z]{8}/, "k=********"),
  );
  const k = /[?&]k=([a-z]{8})/.exec(link)?.[1];
  if (k) {
    await fetch(`${base}/api/public/sites/${siteId}/events`, {
      method: "POST",
      headers: {
        "content-type": "text/plain;charset=UTF-8",
        "user-agent":
          "Mozilla/5.0 (Linux; Android 13) Chrome/120 Mobile Safari/537.36",
      },
      body: JSON.stringify({ k, t: "visit" }),
    });
    const a = await call("GET", `/api/sites/${siteId}/attribution?days=1`);
    step(
      "tracked visit counted, with limits note",
      a.json?.data?.summary?.visits === 1 &&
        /only people who arrived through a link/.test(a.json.data.note),
      a.json?.data?.note,
    );
  }
}
r = await call("POST", `/api/sites/${siteId}/marketing/refresh`);
step(
  "agent suggestions carry evidence and policy",
  r.status === 200 &&
    r.json.data.every((x) => x.evidence.length && x.rec.policy),
  `${r.json?.data?.length} suggestions`,
);
r = await call("GET", `/api/sites/${siteId}/marketing/brief`);
step(
  "growth brief lists what is unavailable",
  r.status === 200 && r.json.data.brief.unavailable.length >= 3,
);
r = await call("POST", `/api/sites/${siteId}/intent`, {
  text: "who is waiting for a reply?",
});
step(
  "voice intent routes and needs confirmation",
  r.json?.data?.intent === "customers_waiting" &&
    r.json.data.requiresConfirmation === true,
);
r = await call("GET", `/api/sites/${siteId}/calendar`);
step("calendar reachable", r.status === 200);
r = await call("GET", `/api/sites/${siteId}/reviews`);
step("reviews reachable", r.status === 200);
const other = await fetch(base + `/api/sites/${siteId}/presence`, {
  headers: { "x-requested-with": "kora" },
});
step(
  "unauthenticated request cannot read a profile",
  other.status === 404 || other.status === 401,
  String(other.status),
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
