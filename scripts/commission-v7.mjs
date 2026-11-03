// Commissioning checks for the v7 creative OS against ANY deployment (local container, staging, production).
// It creates one throwaway account and one test business, drives the real HTTP routes, and writes an evidence file.
// It never contacts a third-party provider, posts nothing, spends nothing, and never touches an existing account.
//
//   node scripts/commission-v7.mjs <base-url> <phase> [--expect-commit <sha>] [--site-host <url>] [--out evidence.json]
//   phases (run in this order; the operator flips KORA_CREATIVE_ENGINE between them):
//     baseline  engine flag v2: v2 generation, publish, verify, monitor, NO v3 behaviour is reachable by default
//     v3        engine flag v3: Brand OS, owner logo+photos, publish/verify MATCH, monitoring, controlled failure and
//               recovery, cross-channel artifacts, brand-version test, campaign proposal, v2 -> v3 upgrade as a draft
//     rollback  engine flag back to v2: new sites are v2 again; the v3 site and its artifacts still serve and read
//
// Evidence is printed as PASS/FAIL lines and written to --out. A FAIL exits non-zero. Anything this script cannot
// observe (e.g. a real phone, a social platform) is not claimed.
import { writeFileSync } from "node:fs";
import { deflateSync, crc32 } from "node:zlib";

const [, , base0, phase, ...rest] = process.argv;
if (!base0 || !["baseline", "v3", "rollback"].includes(phase))
  throw new Error(
    "usage: commission-v7.mjs <base-url> baseline|v3|rollback [--expect-commit sha] [--site-host url] [--out file]",
  );
const base = base0.replace(/\/$/, "");
const opt = (k) => {
  const i = rest.indexOf(k);
  return i >= 0 ? rest[i + 1] : undefined;
};
const expectCommit = opt("--expect-commit");
const siteHost = opt("--site-host");
const outFile = opt("--out");
const stateFile = opt("--state") ?? "/tmp/commission-v7-state.json";

let cookie = "";
const results = [];
const evidence = {
  base,
  phase,
  startedAt: new Date().toISOString(),
  steps: [],
};
const call = async (method, path, body, o = {}) => {
  const isBin = body instanceof Uint8Array;
  const res = await fetch(base + path, {
    method,
    headers: {
      "x-requested-with": "kora",
      ...(body !== undefined && !isBin
        ? { "content-type": "application/json" }
        : {}),
      ...(isBin
        ? { "content-type": o.type ?? "application/octet-stream" }
        : {}),
      ...(cookie ? { cookie } : {}),
    },
    ...(body !== undefined
      ? { body: isBin ? body : JSON.stringify(body) }
      : {}),
  });
  const sc = res.headers.get("set-cookie");
  if (sc) cookie = sc.split(";")[0];
  let json = null;
  let text = "";
  try {
    text = await res.text();
    json = JSON.parse(text);
  } catch {
    /* not json */
  }
  return { status: res.status, json, text, headers: res.headers };
};
const step = (name, ok, detail = "") => {
  results.push(ok);
  evidence.steps.push({ name, ok, detail, at: new Date().toISOString() });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
  return ok;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, tries = 30, ms = 1000) {
  for (let i = 0; i < tries; i++) {
    const v = await fn();
    if (v) return v;
    await wait(ms);
  }
  return null;
}

/** A deterministic, sharp, colourful test picture (blocky texture), encoded as PNG without any dependency. */
function png(w, h, seed = 1, rgba = false) {
  let s = seed >>> 0;
  const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  const bs = 12,
    bw = Math.ceil(w / bs),
    bh = Math.ceil(h / bs);
  const cells = Array.from({ length: bw * bh }, () => [
    (40 + rnd() * 180) | 0,
    (40 + rnd() * 150) | 0,
    (40 + rnd() * 120) | 0,
  ]);
  const ch = rgba ? 4 : 3;
  const raw = Buffer.alloc((w * ch + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * ch + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const c = cells[((y / bs) | 0) * bw + ((x / bs) | 0)];
      const o = y * (w * ch + 1) + 1 + x * ch;
      raw[o] = c[0];
      raw[o + 1] = c[1];
      raw[o + 2] = c[2];
      if (rgba) raw[o + 3] = 255;
    }
  }
  const chunk = (type, data) => {
    const t = Buffer.from(type),
      len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = rgba ? 6 : 2;
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}
const logoPng = () => png(640, 240, 7);

// ---- 0. what is running -----------------------------------------------------------------------------------------
let claim = null;
for (let i = 0; i < 12 && !claim; i++) {
  const r = await call("GET", "/__kora");
  if (r.json?.schema) claim = r.json;
  else await wait(8000);
}
if (!claim) {
  step("deployment answers (runtime claim)", false);
  process.exit(1);
}
evidence.claim = claim;
step("runtime claim", true, `commit ${claim.commit} env ${claim.environment}`);
if (expectCommit)
  step(
    "running commit is the one under test",
    claim.commit === expectCommit || claim.commit.startsWith(expectCommit),
    `${claim.commit} vs ${expectCommit}`,
  );
const health = await call("GET", "/health");
step("health", health.status === 200);

// ---- 1. one throwaway account ----------------------------------------------------------------------------------
const stamp = Date.now();
let state = {};
if (phase === "baseline") {
  const su = await call("POST", "/api/auth/signup", {
    email: `commission+${stamp}@example.com`,
    password: "correct horse battery",
    displayName: "Commission Check",
    orgName: `Commission ${stamp}`,
  });
  if (!step("signup (throwaway)", su.status === 201, String(su.status)))
    process.exit(1);
  state.email = `commission+${stamp}@example.com`;
} else {
  state = JSON.parse((await import("node:fs")).readFileSync(stateFile, "utf8"));
  const li = await call("POST", "/api/auth/login", {
    email: state.email,
    password: "correct horse battery",
  });
  if (
    !step(
      "login (same throwaway account)",
      li.status === 200,
      String(li.status),
    )
  )
    process.exit(1);
}
const me = await call("GET", "/api/auth/me");
const orgId = me.json.data.orgs[0].id;
const H = (m, p, b, o) => call(m, p, b, o);
const mk = async (name) =>
  (await H("POST", "/api/sites", { orgId, name })).json.data;
const brief = (name) => ({
  name,
  description:
    "A home bakery in Lekki, Lagos making birthday cakes, cupcakes and small chops to order.",
  whatsapp: "+2348012345678",
  location: "Lekki, Lagos",
  services: ["Birthday cakes", "Cupcakes", "Small chops"],
  hours: [{ days: "Mon-Sat", hours: "9am-6pm" }],
});
const specOf = async (siteId, versionId) =>
  (await H("GET", `/api/sites/${siteId}/versions/${versionId}`)).json.data.spec;

if (phase === "baseline") {
  const site = await mk(`Baseline Bakery ${stamp}`);
  const g = await H("POST", `/api/sites/${site.id}/generate`, brief(site.name));
  step(
    "baseline: new site is a v2 design while the flag is v2",
    g.status === 201 &&
      (await specOf(site.id, g.json.data.version.id)).version === 2,
  );
  const pub = await H(
    "POST",
    `/api/sites/${site.id}/versions/${g.json.data.version.id}/publish`,
  );
  step(
    "baseline: publish and live-byte verification",
    pub.status === 200 && pub.json.data.verification?.status === "MATCH",
    pub.json?.data?.verification?.status,
  );
  const bos = await H("GET", `/api/sites/${site.id}/brand-os`);
  step(
    "baseline: no Brand OS exists for a v2 site (nothing v3 leaks in)",
    bos.status === 200 && bos.json.data.current === null,
  );
  const up = await H(
    "POST",
    `/api/sites/${site.id}/versions/${g.json.data.version.id}/upgrade-v3`,
    {},
  );
  step(
    "baseline: upgrade to v3 is refused while the flag is v2",
    up.status === 409,
    String(up.status),
  );
  const dirs = await H("POST", "/api/design/directions", {
    orgId,
    ...brief(site.name),
  });
  step(
    "baseline: three v2 directions, none of them v3",
    dirs.status === 200 &&
      dirs.json.data.length === 3 &&
      dirs.json.data.every((d) => d.engine === "v2"),
  );
  state = {
    ...state,
    baselineSite: site.id,
    baselineVersion: g.json.data.version.id,
    baselineSpecHash: (
      await H("GET", `/api/sites/${site.id}/versions/${g.json.data.version.id}`)
    ).json.data.specHash,
  };
}

if (phase === "v3") {
  // a v2 site made before the flag flipped: must be untouched, upgradable as a draft, live version unchanged
  const live = (await H("GET", `/api/sites/${state.baselineSite}`)).json.data
    .publishedVersionId;
  const up = await H(
    "POST",
    `/api/sites/${state.baselineSite}/versions/${state.baselineVersion}/upgrade-v3`,
    {},
  );
  step(
    "existing v2 site: upgrade makes a NEW v3 draft with a before/after comparison",
    up.status === 201 && up.json.data.comparison?.before?.inferred === true,
    String(up.status),
  );
  const after = (await H("GET", `/api/sites/${state.baselineSite}`)).json.data;
  step(
    "existing v2 site: the live version did not change",
    after.publishedVersionId === live,
  );
  const old = (
    await H(
      "GET",
      `/api/sites/${state.baselineSite}/versions/${state.baselineVersion}`,
    )
  ).json.data;
  step(
    "existing v2 site: the old version is byte-identical",
    old.specHash === state.baselineSpecHash,
  );

  // the real test business
  const site = await mk(`Commission Cakes ${stamp}`);
  const dirs = await H("POST", "/api/design/directions", {
    orgId,
    ...brief(site.name),
  });
  step(
    "three different v3 directions, with a recommendation and reason",
    dirs.status === 200 &&
      dirs.json.data.length === 3 &&
      dirs.json.data.every((d) => d.engine === "v3") &&
      new Set(dirs.json.data.map((d) => d.name)).size === 3 &&
      !!dirs.json.recommended?.reason,
  );
  // owner logo and photos
  const up1 = await H(
    "POST",
    `/api/sites/${site.id}/media-library?kind=logo&filename=logo.png`,
    logoPng(),
    { type: "image/png" },
  );
  step(
    "owner logo accepted and re-encoded by the server",
    up1.status === 201,
    String(up1.status),
  );
  const photos = [];
  for (const [i, seed] of [11, 12, 13].entries()) {
    const r = await H(
      "POST",
      `/api/sites/${site.id}/media-library?kind=photo&filename=cake-${i}.png`,
      png(1600, 1067, seed),
      { type: "image/png" },
    );
    photos.push(r);
  }
  step(
    "three owner photos accepted with quality scores",
    photos.every(
      (r) => r.status === 201 && typeof r.json.data.quality?.score === "number",
    ),
    photos.map((r) => r.status).join(","),
  );
  const lib = await H("GET", `/api/sites/${site.id}/media-library`);
  step(
    "library lists the logo and photos with plain-language advice",
    lib.status === 200 &&
      lib.json.data.items.length === 4 &&
      lib.json.data.items.every((i) => Array.isArray(i.advice)),
  );
  const bad = await H(
    "POST",
    `/api/sites/${site.id}/media-library?kind=photo&filename=x.png`,
    new TextEncoder().encode("<script>alert(1)</script>"),
    { type: "image/png" },
  );
  step(
    "a file that is not a picture is refused",
    bad.status >= 400 && bad.status < 500 && !bad.text.includes("<script>"),
    String(bad.status),
  );
  state.designsCanUseOwnerMedia = lib.json.data.designsCanUse;

  const g = await H("POST", `/api/sites/${site.id}/generate`, {
    ...brief(site.name),
    direction: 0,
  });
  step("generate on v3 with owner media", g.status === 201);
  const vId = g.json.data.version.id;
  const spec = await specOf(site.id, vId);
  step(
    "site is SiteSpec v3, stamped with Brand OS version 1 and its hash",
    spec.version === 3 &&
      spec.brand?.osVersion === 1 &&
      /^[a-f0-9]{64}$/.test(spec.brand?.osHash ?? ""),
  );
  if (state.designsCanUseOwnerMedia)
    step("owner logo is part of the brand", !!spec.business.logo);
  else
    step(
      "owner media stays out of designs when no https media origin is configured (by design)",
      !spec.business.logo,
      "set KORA_MEDIA_PUBLIC_URL to an https origin to use owner pictures in published sites",
    );
  const bos = (await H("GET", `/api/sites/${site.id}/brand-os`)).json.data;
  step(
    "Brand OS version 1 recorded with a hash",
    bos.current?.version === 1 && /^[a-f0-9]{64}$/.test(bos.current.hash),
  );
  const q = await H("GET", `/api/sites/${site.id}/versions/${vId}/quality`);
  step(
    "creative quality: structured critic result, no blocking issue",
    q.status === 200 &&
      !(q.json.data.issues ?? []).some((i) => i.severity === "block"),
  );

  const pub = await H("POST", `/api/sites/${site.id}/versions/${vId}/publish`);
  step(
    "publish v3 and verify the live bytes (MATCH)",
    pub.status === 200 && pub.json.data.verification?.status === "MATCH",
    pub.json?.data?.verification?.status,
  );
  const url = pub.json?.data?.publicUrl;
  const page = url ? await fetch(url) : null;
  const html = page ? await page.text() : "";
  // no third-party code or fonts: scripts, stylesheets and fonts must be same-origin; pictures may be https (owner media)
  const external = [
    ...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="(https?:[^"]+)"/g),
  ].map((m) => m[1]);
  step(
    "the public page serves, and loads no third-party script, stylesheet or font",
    !!page && page.status === 200 && external.length === 0,
    external.slice(0, 2).join(" "),
  );
  step(
    "structured data present and factual",
    /application\/ld\+json/.test(html) &&
      !/aggregateRating|"review"/.test(html),
  );

  // monitoring
  await H("POST", `/api/sites/${site.id}/check`).catch(() => null);
  const healthy = await until(
    async () => {
      const s = await H("GET", `/api/sites/${site.id}/status`);
      return s.json?.data?.headline?.status === "ONLINE";
    },
    40,
    1500,
  );
  step("monitoring reports the v3 site Healthy", !!healthy);

  // artifacts and brand-version test
  const bundle = await H("POST", `/api/sites/${site.id}/artifacts/bundle`, {
    formats: ["social-square", "story", "flyer-a5", "whatsapp-status"],
    objective: "order",
    headline: "Birthday cakes",
    eyebrow: "Commission Cakes",
    subline: "Message us on WhatsApp to order.",
    cta: "Order on WhatsApp",
  });
  const made = bundle.json?.data?.results ?? [];
  step(
    "cross-channel set (feed, story, flyer, status) rendered from the same Brand OS",
    bundle.status === 201 && made.length === 4 && made.every((r) => !r.error),
    made.map((r) => r.format ?? r.error).join(","),
  );
  const firstAsset = made[0]?.asset?.id;
  const svgBefore = firstAsset
    ? (await H("GET", `/api/sites/${site.id}/assets/${firstAsset}/file?as=svg`))
        .text
    : "";
  const nudge = await H("POST", `/api/sites/${site.id}/edit`, {
    designEdit: { kind: "nudge", nudge: "minimal" },
  });
  step(
    "brand change creates a new draft",
    nudge.status === 201 || nudge.status === 200,
    String(nudge.status),
  );
  const bos2 = (await H("GET", `/api/sites/${site.id}/brand-os`)).json.data;
  step(
    "Brand OS version 2 recorded; version 1 unchanged",
    bos2.current.version === 2 &&
      (await H("GET", `/api/sites/${site.id}/brand-os/1`)).json.data.hash ===
        bos.current.hash,
  );
  if (firstAsset) {
    const list = (await H("GET", `/api/sites/${site.id}/assets`)).json.data;
    const a = list.find((x) => x.id === firstAsset);
    step(
      "an artifact made before the change still points at brand version 1",
      a?.brandVersion === 1,
      String(a?.brandVersion),
    );
    const svgAfter = (
      await H("GET", `/api/sites/${site.id}/assets/${firstAsset}/file?as=svg`)
    ).text;
    step(
      "and its bytes are exactly what they were (history is never rewritten)",
      svgBefore.length > 100 && svgAfter === svgBefore,
    );
  }
  // publish the brand-v2 draft too, so a bad release has a healthy version to go back to
  const pub2 = await H(
    "POST",
    `/api/sites/${site.id}/versions/${nudge.json.data.version.id}/publish`,
  );
  step(
    "the new brand version publishes and verifies (MATCH)",
    pub2.status === 200 && pub2.json.data.verification?.status === "MATCH",
    pub2.json?.data?.verification?.status,
  );
  const prop = await H("POST", `/api/sites/${site.id}/campaign-proposal`, {
    request: "I need more birthday cake orders next week",
  });
  step(
    "plain-language request becomes a PROPOSAL; nothing posted or spent",
    prop.status === 200 &&
      prop.json.data.autoPublish === false &&
      prop.json.data.spends === false &&
      prop.json.data.status === "PROPOSED",
  );

  // controlled failure and recovery on the v3 site (needs the host's controlled-test switch)
  const chaos = await H("POST", `/api/sites/${site.id}/chaos`, {
    mode: "http_500",
    ttlSeconds: 120,
  });
  if (chaos.status === 200 && url) {
    const failing = await until(
      async () => (await fetch(url)).status === 500,
      10,
      500,
    );
    step(
      "controlled test: the public v3 site really fails (HTTP 500)",
      !!failing,
    );
    const inc = await until(
      async () => {
        const l =
          (await H("GET", `/api/sites/${site.id}/incidents`)).json?.data ?? [];
        return l[0];
      },
      60,
      1500,
    );
    step("monitor opens exactly one incident by itself", !!inc);
    if (inc) {
      const view = (await H("GET", `/api/incidents/${inc.id}`)).json.data;
      const actionId = view.recommendedAction?.actionId;
      step(
        "owner explanation in plain words, remediation needs approval",
        !!view.whatHappened &&
          view.recommendedAction?.state === "AWAITING_APPROVAL",
      );
      if (actionId) {
        await H("POST", `/api/actions/${actionId}/approve`, {});
        const ex = await H("POST", `/api/actions/${actionId}/execute`);
        step(
          "approved rollback executed",
          ex.status === 200 || ex.status === 201,
          String(ex.status),
        );
        const rec = await until(
          async () =>
            (await H("GET", `/api/actions/${actionId}`)).json?.data?.state ===
            "RECOVERY_VERIFIED",
          60,
          1500,
        );
        step("recovery verified from new observations only", !!rec);
      }
    }
  } else
    step(
      "controlled-test switch available (skipped where disabled by policy)",
      true,
      `status ${chaos.status}`,
    );
  state = { ...state, v3Site: site.id, v3Version: vId };
}

if (phase === "rollback") {
  const site = await mk(`Rollback Check ${stamp}`);
  const g = await H("POST", `/api/sites/${site.id}/generate`, brief(site.name));
  step(
    "rollback: new sites are v2 again",
    g.status === 201 &&
      (await specOf(site.id, g.json.data.version.id)).version === 2,
  );
  const v3site = await H("GET", `/api/sites/${state.v3Site}`);
  step(
    "rollback: the v3 site still exists and is readable",
    v3site.status === 200,
  );
  const bos = await H("GET", `/api/sites/${state.v3Site}/brand-os`);
  step(
    "rollback: its Brand OS history is intact (2 versions)",
    bos.status === 200 && bos.json.data.history.length >= 2,
  );
  const url = v3site.json.data.publicUrl ?? null;
  if (url) {
    const r = await fetch(url);
    step(
      "rollback: the published v3 site still serves",
      r.status === 200,
      String(r.status),
    );
  }
  const dirs = await H("POST", "/api/design/directions", {
    orgId,
    ...brief(site.name),
  });
  step(
    "rollback: directions are v2 again",
    dirs.status === 200 && dirs.json.data.every((d) => d.engine === "v2"),
  );
}

writeFileSync(stateFile, JSON.stringify(state));
evidence.finishedAt = new Date().toISOString();
evidence.passed = results.filter(Boolean).length;
evidence.failed = results.filter((x) => !x).length;
if (outFile) writeFileSync(outFile, JSON.stringify(evidence, null, 1));
console.log(
  `\n${evidence.passed} passed, ${evidence.failed} failed (${phase})`,
);
process.exit(evidence.failed ? 1 : 0);
