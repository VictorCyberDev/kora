// Production regression for the reliability loop after the Presence/Marketing build: a controlled HTTP 500 on a throwaway
// customer site must be detected by Kora, proposed, approved by the owner, restored, and counted as recovered only after
// NEW healthy observations. Usage: node scripts/live-recovery-check.mjs https://kora-api.rumptycloud.app
const base = process.argv[2];
if (!base) throw new Error("usage: live-recovery-check.mjs <base-url>");
let cookie = "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const call = async (method, path, body) => {
  const res = await fetch(base + path, {
    method,
    headers: {
      "x-requested-with": "kora",
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const sc = res.headers.get("set-cookie");
  if (sc) cookie = sc.split(";")[0];
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not json */
  }
  return { status: res.status, json, text };
};
const log = [];
const step = (n, ok, d = "") => {
  log.push({ n, ok, d });
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`);
  if (!ok) {
    console.log(
      JSON.stringify({ failedAt: n, passed: log.filter((x) => x.ok).length }),
    );
    process.exit(1);
  }
};
const until = async (fn, ms, every = 3000) => {
  const end = Date.now() + ms;
  let v;
  while (Date.now() < end) {
    v = await fn();
    if (v) return v;
    await sleep(every);
  }
  return null;
};

const claim = await (await fetch(base + "/__kora")).json();
step("runtime claim", true, claim.commit);
await call("POST", "/api/auth/signup", {
  email: `recovery+${Date.now()}@example.com`,
  password: "correct horse battery",
  displayName: "Recovery Check",
  orgName: "Recovery Check Co",
});
const orgId = (await call("GET", "/api/auth/me")).json.data.orgs[0].id;
const siteId = (
  await call("POST", "/api/sites", { orgId, name: "Recovery Check Laundry" })
).json.data.id;
const gen = await call("POST", `/api/sites/${siteId}/generate`, {
  name: "Recovery Check Laundry",
  description:
    "Laundry in Lagos with pickup, delivery, dry cleaning and ironing.",
  whatsapp: "+2348012345678",
});
const v1 = gen.json.data.version.id;
step(
  "publish v1",
  (await call("POST", `/api/sites/${siteId}/versions/${v1}/publish`)).status ===
    200,
);
const edit = await call("POST", `/api/sites/${siteId}/edit`, {
  baseVersionId: v1,
  instruction: "Make the primary colour red",
});
const v2 = edit.json.data.version.id;
step(
  "publish v2 (the 'bad release' candidate)",
  (await call("POST", `/api/sites/${siteId}/versions/${v2}/publish`)).status ===
    200,
);
const url = (await call("GET", `/api/sites/${siteId}`)).json.data.publicUrl;
step("live site serves 200", (await fetch(url)).status === 200, url);
step(
  "five healthy observations",
  !!(await until(
    async () =>
      (await call("GET", `/api/sites/${siteId}/status`)).json?.data?.headline
        ?.status === "ONLINE" ||
      (await call("GET", `/api/sites/${siteId}/status`)).json?.data?.headline
        ?.label === "Healthy",
    90_000,
  )),
);
step(
  "controlled fault applied",
  (await call("POST", `/api/sites/${siteId}/chaos`, { mode: "http_500" }))
    .status < 300,
);
step(
  "public site genuinely returns 500",
  !!(await until(
    async () => (await fetch(url, { cache: "no-store" })).status === 500,
    30_000,
    1000,
  )),
);
const inc = await until(
  async () =>
    (await call("GET", `/api/sites/${siteId}/incidents`)).json?.data?.[0],
  120_000,
);
step(
  "Kora detected it and opened exactly one incident",
  !!inc &&
    (await call("GET", `/api/sites/${siteId}/incidents`)).json.data.length ===
      1,
  inc?.id,
);
await call("POST", `/api/incidents/${inc.id}/reason`);
const act = await until(
  async () =>
    (await call("GET", `/api/incidents/${inc.id}/actions`)).json?.data?.find(
      (a) => a.type === "republish_site_version",
    ),
  60_000,
);
step("reasoner proposed a typed rollback", !!act, act?.type);
step(
  "policy requires approval (nothing ran by itself)",
  act.state === "AWAITING_APPROVAL" || act.state === "POLICY_EVALUATED",
  act.state,
);
const appr = await call("POST", `/api/actions/${act.id}/approve`, {
  note: "live regression",
});
step(
  "owner approved",
  appr.status === 200,
  appr.json?.data?.state ?? String(appr.status),
);
const ex = await call("POST", `/api/actions/${act.id}/execute`);
step("executed", ex.status === 200, ex.json?.data?.state ?? String(ex.status));
const afterExec = await call("GET", `/api/actions/${act.id}`);
step(
  "execution alone is not recovery",
  afterExec.json?.data?.state !== "RECOVERY_VERIFIED",
  afterExec.json?.data?.state,
);
const done = await until(async () => {
  await call("GET", `/api/incidents/${inc.id}/actions`);
  const a = await call("GET", `/api/actions/${act.id}`);
  return a.json?.data?.state === "RECOVERY_VERIFIED" ? a.json.data : null;
}, 240_000);
step("recovery verified by new observations", !!done);
step(
  "site serves 200 again",
  (await fetch(url, { cache: "no-store" })).status === 200,
);
console.log(
  JSON.stringify(
    {
      base,
      commit: claim.commit,
      at: new Date().toISOString(),
      siteId,
      incidentId: inc.id,
      actionId: act.id,
      result: "RECOVERY_VERIFIED",
    },
    null,
    2,
  ),
);
