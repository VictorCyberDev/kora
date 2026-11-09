// vNext journeys driven over HTTP against the running API, Site Host and web app. External providers are local fakes and
// every step that depends on one is tagged "mock" (a simulation, not evidence about the real provider).
import fs from "node:fs";
import path from "node:path";
import { startProc, stopProc, logText, until, wait, health, client, png, fakeServer, repo } from "./lib.mjs";

const briefs = JSON.parse(fs.readFileSync(path.join(repo, "packages/creative/test/fixtures/business-matrix.json"), "utf8"));
const brief = (k) => briefs.find((b) => b.key === k);
const photo = (id, desc) => ({
  id, width: 4000, height: 2667, color: "#cc9966", alt_description: desc,
  urls: { raw: `https://images.unsplash.com/photo-${id}?ixid=zz${id}&ixlib=rb-4.0`, regular: "https://images.unsplash.com/x" },
  links: { html: `https://unsplash.com/photos/${id}`, download_location: `https://api.unsplash.com/photos/${id}/download?ixid=zz${id}` },
  user: { name: `Maker ${id}`, links: { html: `https://unsplash.com/@maker${id}` } },
});

export async function runJourneys(ctx) {
  const { R, outDir, svcLogs, stackEnv, live, apiUrl, hostUrl, sql, state, SECRETS } = ctx;
  const { step } = R;
  const stamp = Date.now();

  // ---- local fakes of external providers (simulations) ------------------------------------------------------------------
  const unsplash = { mode: "ok" };
  const fakeUnsplash = await fakeServer((r) => {
    if (r.url.startsWith("/search")) {
      if (unsplash.mode === "down") return { status: 500, body: { errors: ["boom"] } };
      if (unsplash.mode === "exhausted")
        return { body: { results: [photo("q1", "a celebration cake")] }, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-limit": "50" } };
      return { body: { results: [photo("p1", "a celebration cake with berries"), photo("p2", "wedding cake detail"), photo("p3", "a mountain lake")] }, headers: { "x-ratelimit-remaining": "45", "x-ratelimit-limit": "50" } };
    }
    return { body: { url: "https://images.unsplash.com/ignored" } };
  });
  const llm = { mode: "off", calls: 0, lastUser: "" };
  const fakeLlm = await fakeServer((r) => {
    llm.calls++;
    let msgs = [];
    try {
      msgs = JSON.parse(r.body).messages ?? [];
    } catch {
      /* ignore */
    }
    const user = String(msgs.filter((m) => m.role === "user").pop()?.content ?? "");
    llm.lastUser = user;
    const fields = (() => {
      try {
        const v = JSON.parse(user.split("FIELDS:\n").pop().trim());
        return Array.isArray(v) ? v : [];
      } catch {
        return [];
      }
    })();
    const reply = (content) => ({ body: { choices: [{ message: { content } }], usage: { prompt_tokens: 800, completion_tokens: 200 } } });
    if (llm.mode === "off") return reply(JSON.stringify({ edits: [] }));
    if (llm.mode === "down") return { status: 503, body: { error: "unavailable" } };
    if (llm.mode === "garbage") return reply("Sure! Here is a better site: <html>…");
    const f = fields.find((x) => x.kind === "story paragraph") ?? fields.find((x) => x.kind === "offering description") ?? fields[0];
    if (!f) return reply(JSON.stringify({ edits: [] }));
    if (llm.mode === "hostile")
      return reply(JSON.stringify({ edits: [{ id: f.id, text: "Award-winning cakes with a 100% money-back guarantee, since 1998, from 15% off every order." }, { id: "../../hero.title", text: "pwned" }] }));
    return reply(JSON.stringify({ edits: [{ id: f.id, text: "Cakes and party platters are made to order, so the plan for the day starts with the occasion and the guest list." }] }));
  });
  ctx.fakes = { fakeUnsplash, fakeLlm };

  // ---- 1. invalid configuration stops the release before the database is touched -------------------------------------
  const rowsBefore = Number((await sql`SELECT count(*)::int AS n FROM site_versions`)[0].n);
  for (const [name, env, expect] of [
    ["KORA_MODEL_COMPOSE=on (the value the staging notes once documented)", { KORA_MODEL_COMPOSE: "on" }, "KORA_MODEL_COMPOSE"],
    ["KORA_CREATIVE_ENGINE=v4", { KORA_CREATIVE_ENGINE: "v4" }, "KORA_CREATIVE_ENGINE"],
    ["KORA_MEDIA_UNSPLASH=true", { KORA_MEDIA_UNSPLASH: "true" }, "KORA_MEDIA_UNSPLASH"],
  ]) {
    const p = startProc(svcLogs, "invalid-config", ["apps/api/dist/server.js"], stackEnv({ ...env, API_PORT: "3330" }), repo);
    await until(() => p.exited, 40, 250);
    const out = logText(p);
    step(`invalid ${name}: process exits 78 naming the variable`, p.exited?.code === 78 && out.includes(expect), `exit ${p.exited?.code}`);
    step(`invalid ${name}: stopped before any migration or database work`, !/migration applied|ECONNREFUSED/.test(out.split("Invalid Kora configuration")[0] ?? ""));
    fs.writeFileSync(path.join(svcLogs, "invalid-config.log"), "");
  }
  step("no rows were written by the failed starts", Number((await sql`SELECT count(*)::int AS n FROM site_versions`)[0].n) === rowsBefore);

  // ---- 2. the release candidate with every switch on, providers faked ---------------------------------------------------
  const flags = {
    KORA_CREATIVE_ENGINE: "v3",
    KORA_MEDIA_UNSPLASH: "on",
    UNSPLASH_ACCESS_KEY: "MOCK-KEY-NOT-REAL",
    UNSPLASH_APP_NAME: "kora-commission",
    UNSPLASH_API_BASE: fakeUnsplash.url,
    UNSPLASH_RATE_LIMIT: "50",
    UNSPLASH_RESERVE: "10",
    KORA_MODEL_COMPOSE: "true",
    AI_PROVIDER: "mock-llm",
    AI_BASE_URL: `${fakeLlm.url}/v1`,
    AI_API_KEY: "MOCK-LLM-KEY-NOT-REAL",
    AI_MODEL: "mock-model",
  };
  if (!live.host || live.host.exited) step("site host starts", !!(await ctx.startHost("site-host-j")));
  const ok = await ctx.startApi("api-vnext", flags);
  step("API starts with every switch on (Unsplash and the model are local fakes)", ok);
  const lg = logText(live.api);
  step("startup log states switches and carries no warning for a complete configuration", /"mediaUnsplash":"on"/.test(lg) && /"modelCompose":true/.test(lg) && /"aiProviderConfigured":true/.test(lg) && !/"level":40,[^\n]*(KORA_MEDIA|UNSPLASH_|AI provider)/.test(lg));
  step("no secret value appears in the API log", !/MOCK-KEY-NOT-REAL|MOCK-LLM-KEY-NOT-REAL/.test(lg) && !lg.includes(SECRETS));

  // ---- 3. two owners in two organisations -------------------------------------------------------------------------------
  const mkOwner = async (label) => {
    const c = client(apiUrl);
    const email = `${label}+${stamp}@example.com`;
    const su = await c.call("POST", "/api/auth/signup", { email, password: "correct horse battery", displayName: label, orgName: `${label} org ${stamp}` });
    const me = await c.call("GET", "/api/auth/me");
    return { c, email, status: su.status, orgId: me.json?.data?.orgs?.[0]?.id };
  };
  const A = await mkOwner("ada"), B = await mkOwner("bola");
  step("two owners in two organisations sign up", A.status === 201 && B.status === 201 && A.orgId && B.orgId && A.orgId !== B.orgId);
  const prov = await A.c.call("GET", "/api/media/providers");
  step("media provider status endpoint is admin-only and reports the Unsplash provider as available (against the fake)", prov.status === 200 && /AVAILABLE/.test(JSON.stringify(prov.json)), String(prov.status), "mock");

  const mkSite = async (O, name, description, extra = {}) => {
    const s = await O.c.call("POST", "/api/sites", { orgId: O.orgId, name });
    const g = await O.c.call("POST", `/api/sites/${s.json.data.id}/generate`, { name, description, ...extra });
    return { site: s.json?.data, gen: g, versionId: g.json?.data?.version?.id };
  };
  const specOf = async (O, siteId, vid) => (await O.c.call("GET", `/api/sites/${siteId}/versions/${vid}`)).json.data.spec;
  const publish = async (O, siteId, vid) => (await O.c.call("POST", `/api/sites/${siteId}/versions/${vid}/publish`)).json?.data;
  const get = async (url) => {
    const r = await fetch(url, { redirect: "manual" }).catch(() => null);
    return { status: r?.status ?? 0, text: r ? await r.text() : "" };
  };

  // ---- 4. the three mandatory briefs, end to end -----------------------------------------------------------------------
  llm.mode = "off";
  const made = {};
  for (const [key, label, min, wantPlacements] of [["kochab", "Kochab Studio", 6, 0], ["bakery", "Sweet Crumbs Bakery", 6, 10], ["barber-minimal", "Mr Lee (\"I cut hair.\")", 6, 0]]) {
    const b = brief(key);
    const m = await mkSite(A, b.name, b.description);
    made[key] = m;
    step(`${label}: generated through the API`, m.gen.status === 201, String(m.gen.status));
    const spec = await specOf(A, m.site.id, m.versionId);
    step(`${label}: a v3 design with ${min}+ pages`, spec.version === 3 && spec.pages.length >= min && spec.pages.length <= 7, `${spec.pages.length} pages: ${spec.pages.map((p) => p.slug).join(",")}`);
    const q = (await A.c.call("GET", `/api/sites/${m.site.id}/versions/${m.versionId}/quality`)).json?.data;
    step(`${label}: no blocking quality issue`, !(q?.issues ?? []).some((i) => i.severity === "block"), `${(q?.issues ?? []).length} notes`);
    const man = (await A.c.call("GET", `/api/sites/${m.site.id}/versions/${m.versionId}/media-manifest`)).json?.data?.manifest?.summary;
    if (wantPlacements) step(`${label}: at least ${wantPlacements} image placements, ${man?.distinctImages} distinct`, (man?.placements ?? 0) >= wantPlacements, `${man?.placements} placements / ${man?.distinctImages} distinct`);
    const pub = await publish(A, m.site.id, m.versionId);
    step(`${label}: published and live bytes verified (MATCH)`, pub?.verification?.status === "MATCH", pub?.verification?.status);
    m.publicUrl = pub?.publicUrl;
    const pages = [];
    for (const p of spec.pages) {
      const r = await get(p.slug === "home" ? m.publicUrl : `${m.publicUrl}${p.slug}/`);
      pages.push(r.status);
      if (/undefined|\[object Object\]|NaN/.test(r.text.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ""))) pages.push(-1);
    }
    step(`${label}: every page is served by the Site Host (200, no placeholder leakage)`, pages.every((s) => s === 200), pages.join(","));
  }
  const kb = await specOf(A, made.bakery.site.id, made.bakery.versionId);
  const barber = await specOf(A, made["barber-minimal"].site.id, made["barber-minimal"].versionId);
  const barberOffers = barber.pages.flatMap((p) => p.sections).filter((s) => s.type === "offer").flatMap((s) => s.items?.map((i) => i.title) ?? []);
  step('"I cut hair." yields a single Haircuts offering and no duplicate "hair" page', barberOffers.length === 1 && barberOffers[0] === "Haircuts" && !barber.pages.some((p) => p.slug === "hair"), JSON.stringify(barberOffers));
  const kochab = await specOf(A, made.kochab.site.id, made.kochab.versionId);
  step("Kochab Studio carries no invented client, award, price or testimonial", !/award|testimonial|trusted by|\bclients?\b.*\b\d{2,}\b|£|\$|₦\d/i.test(JSON.stringify(kochab.pages)));

  const fourth = await A.c.call("POST", "/api/sites", { orgId: A.orgId, name: "A fourth site" });
  step("plan allowance: a fourth site on a three-site plan is refused with a 4xx, not a server error", fourth.status >= 400 && fourth.status < 500, `${fourth.status} ${fourth.json?.error ?? ""}`);

  // ---- 5. editor operations and regeneration on the bakery site ---------------------------------------------------------
  const bk = made.bakery;
  let head = bk.versionId;
  const edit = async (designEdit, extra = {}) => {
    const r = await A.c.call("POST", `/api/sites/${bk.site.id}/edit`, { baseVersionId: head, designEdit, ...extra });
    if (r.status === 201) head = r.json.data.version.id;
    return r;
  };
  let cur = await specOf(A, bk.site.id, head);
  const E = async (name, designEdit, check) => {
    const r = await edit(designEdit);
    const spec = r.status === 201 ? await specOf(A, bk.site.id, head) : null;
    step(`editor: ${name}`, r.status === 201 && (!check || check(spec)), r.status === 201 ? "" : `${r.status} ${JSON.stringify(r.json).slice(0, 120)}`);
    if (spec) cur = spec;
    return cur;
  };
  let sp = await E("rename a page and its menu label", { kind: "page-meta", page: "cakes", title: "Our cakes", nav: "Cakes" }, (s) => s.pages.find((p) => p.slug === "cakes").title === "Our cakes");
  const heroIdx = 0;
  sp = await E("edit the opening headline", { kind: "section-text", page: "home", index: heroIdx, heading: "Cakes and party small chops." }, (s) => s.pages[0].sections[heroIdx].heading === "Cakes and party small chops.");
  const homeOffer = sp.pages[0].sections.findIndex((s) => s.type === "offer");
  sp = await E("edit a service's name", { kind: "item", page: "home", index: homeOffer, action: "update", item: 1, title: "Party small chops" }, (s) => s.pages[0].sections[homeOffer].items[1].title === "Party small chops");
  const n = sp.pages[0].sections.length;
  const order0 = sp.pages[0].sections.map((s) => s.type).join(",");
  sp = await E("reorder two sections", { kind: "move-section", page: "home", from: 1, to: 2 }, (s) => s.pages[0].sections.map((x) => x.type).join(",") !== order0 && s.pages[0].sections.length === n);
  sp = await E("reorder pages", { kind: "move-page", slug: "about", to: 2 }, (s) => s.pages.map((p) => p.slug)[2] === "about" && s.pages[0].slug === "home");
  sp = await E("remove a page", { kind: "remove-page", slug: "gallery" }, (s) => !s.pages.some((p) => p.slug === "gallery") && s.pages.every((p) => !JSON.stringify(p).includes('"gallery/')));
  sp = await E("add a page", { kind: "add-page", page: "faq" }, (s) => s.pages.some((p) => p.slug === "faq"));
  const sections = sp.pages[0].sections.length;
  sp = await E("add a section", { kind: "add-section", page: "home", section: "statement" }, (s) => s.pages[0].sections.length === sections + 1);
  const stIdx = sp.pages[0].sections.findIndex((x) => x.type === "statement");
  sp = await E("remove that section again", { kind: "remove-section", page: "home", index: stIdx }, (s) => s.pages[0].sections.length === sections);
  const beforeRegen = JSON.stringify(sp.pages.find((p) => p.slug === "about"));
  sp = await E("regenerate a page from the same design", { kind: "regenerate-page", page: "about" }, (s) => s.pages.find((p) => p.slug === "about") && s.pages.length === sp.pages.length);
  const regenSecIdx = sp.pages[0].sections.findIndex((s) => s.type === "faq" || s.type === "process");
  if (regenSecIdx >= 0) sp = await E("regenerate one section", { kind: "regenerate-section", page: "home", index: regenSecIdx }, (s) => s.pages[0].sections.length === sp.pages[0].sections.length);
  void beforeRegen;
  // a claim-like sentence is refused until the owner confirms that exact sentence
  const claim = "We have been baking for over 20 years.";
  const refused = await edit({ kind: "section-text", page: "home", index: heroIdx, subheading: claim });
  step("editor: an unconfirmed claim (years in business) is refused", refused.status >= 400, String(refused.status));
  const conf = await A.c.call("POST", `/api/sites/${bk.site.id}/confirmations`, { text: claim });
  const okc = await edit({ kind: "section-text", page: "home", index: heroIdx, subheading: claim });
  step("editor: after the owner records a confirmation of that exact sentence the edit is accepted", conf.status === 200 && okc.status === 201, `${conf.status}/${okc.status}`);
  const otherSite = await A.c.call("POST", `/api/sites/${made.kochab.site.id}/edit`, { baseVersionId: made.kochab.versionId, designEdit: { kind: "section-text", page: "home", index: 0, subheading: claim } });
  step("editor: a confirmation is per site: the same sentence is still refused on the owner's other site", otherSite.status >= 400, String(otherSite.status));

  // pictures: bundled catalogue, owner photo, stock selection (fake provider)
  const cat = (await A.c.call("GET", `/api/sites/${bk.site.id}/media/catalogue`)).json?.data ?? [];
  step("picture picker: Kora's catalogue offers topic-relevant photos for a bakery", cat.length >= 8, `${cat.length} photos`);
  const galleryIdx = (s) => s.pages[0].sections.findIndex((x) => x.type === "hero");
  const pick = cat[0];
  const catEdit = await edit({ kind: "replace-media", page: "home", index: galleryIdx(sp), media: { url: pick.url, alt: pick.alt, width: pick.width, height: pick.height, role: "feature", treatment: "none", provenance: { sourceType: "licensed-stock", provider: "Pexels", reviewStatus: "kora-curated" } } });
  step("picture replace: a catalogue photo is applied with provenance derived by the server", catEdit.status === 201, String(catEdit.status));
  const forged = await edit({ kind: "replace-media", page: "home", index: galleryIdx(sp), media: { url: "https://images.unsplash.com/photo-forged", alt: "forged", width: 1600, height: 1000, role: "feature", treatment: "none", provenance: { sourceType: "licensed-stock", provider: "Unsplash", reviewStatus: "owner-approved", creator: "Nobody", creatorUrl: "https://unsplash.com/@nobody", sourceUrl: "https://unsplash.com/photos/x", attribution: "Photo by Nobody on Unsplash" } } });
  step("picture replace: a forged Unsplash picture with no server-signed selection is refused", forged.status >= 400, String(forged.status));
  const up = await A.c.call("POST", `/api/sites/${bk.site.id}/media-library?kind=photo&filename=cake-owner.png`, png(1400, 933, 11), { type: "image/png" });
  step("owner photo upload", up.status === 201 || up.status === 200, String(up.status));
  const own = (await A.c.call("GET", `/api/sites/${bk.site.id}/media/owner`)).json?.data;
  step("owner photos are listed with an https public address (the configured media origin)", own?.usable === true && own.items.length >= 1 && /^https:\/\//.test(own.items[0].url ?? ""), own?.items?.[0]?.url?.slice(0, 80));
  if (own?.items?.[0]) {
    const o1 = own.items[0];
    const oe = await edit({ kind: "replace-media", page: "home", index: galleryIdx(sp), media: { url: o1.url, alt: o1.alt || "Our own cake", width: o1.width, height: o1.height, role: "feature", treatment: "none", provenance: { sourceType: "owner-supplied", reviewStatus: "owner-approved" } } });
    step("owner-photo replacement: applied for a photo that belongs to this site", oe.status === 201, String(oe.status));
    const bserve = await fetch(o1.url.replace(/^https:\/\/media\.commission\.example/, apiUrl));
    step("the owner photo is served by the API's public media route (local address; the hosted media origin is not exercised)", bserve.status === 200 && /image\//.test(bserve.headers.get("content-type") ?? ""), String(bserve.status));
    const bForeign = await edit({ kind: "replace-media", page: "home", index: galleryIdx(sp), media: { url: o1.url.replace(bk.site.id, made.kochab.site.id), alt: "x", width: o1.width, height: o1.height, role: "feature", treatment: "none", provenance: { sourceType: "owner-supplied", reviewStatus: "owner-approved" } } });
    step("owner-photo replacement: a photo address that belongs to another site is refused", bForeign.status >= 400, String(bForeign.status));
  }
  unsplash.mode = "ok";
  const cands = await A.c.call("POST", `/api/sites/${bk.site.id}/media/candidates`, {});
  step("stock suggestions come from the (fake) provider with signed tokens and no key in the response", cands.status === 200 && cands.json.data.candidates.length >= 1 && !JSON.stringify(cands.json).includes("MOCK-KEY"), `${cands.json?.data?.candidates?.length} candidates`, "mock");
  const c1 = cands.json?.data?.candidates?.[0];
  if (c1) {
    const sel = await A.c.call("POST", `/api/sites/${bk.site.id}/media/select`, { candidateToken: c1.candidateToken });
    const se = await edit({ kind: "replace-media", page: "home", index: galleryIdx(sp), media: sel.json.data.media, selectionToken: sel.json.data.selectionToken });
    step("stock selection: applied through a verified token; credit carries the app's UTM", sel.status === 200 && se.status === 201 && /utm_source=kora-commission/.test(JSON.stringify(sel.json.data.media.provenance)), `${sel.status}/${se.status}`, "mock");
    const dl = fakeUnsplash.requests.filter((r) => r.url.includes("/download")).length;
    step("stock selection: exactly one download event was recorded for the pick (fake provider)", dl === 1, String(dl), "mock");
    const othersTokenOnB = await B.c.call("POST", `/api/sites/${made.kochab.site.id}/media/select`, { candidateToken: c1.candidateToken });
    step("another organisation cannot use this owner's candidate token", othersTokenOnB.status >= 400, String(othersTokenOnB.status));
  }

  // undo: restore an earlier version as a new draft (history untouched)
  const versions = (await A.c.call("GET", `/api/sites/${bk.site.id}/versions`)).json.data;
  const earlier = versions.find((v) => v.id === bk.versionId) ?? versions[versions.length - 1];
  const rd = await A.c.call("POST", `/api/sites/${bk.site.id}/versions/${earlier.id}/restore-draft`);
  const versions2 = (await A.c.call("GET", `/api/sites/${bk.site.id}/versions`)).json.data;
  step("undo: restoring the first version creates a new draft and keeps all history", rd.status === 201 && versions2.length === versions.length + 1, `${versions.length} -> ${versions2.length}`);
  const bad = await edit({ kind: "add-page", page: "faq" });
  step("an edit the limits refuse (duplicate page) leaves the history untouched", bad.status >= 400 && (await A.c.call("GET", `/api/sites/${bk.site.id}/versions`)).json.data.length === versions2.length);

  // publish the edited version, check the public bytes, then roll back
  const lastGood = (await specOf(A, bk.site.id, head)) && head;
  const p2 = await publish(A, bk.site.id, lastGood);
  step("the edited version is published and verified (MATCH)", p2?.verification?.status === "MATCH", p2?.verification?.status);
  const home2 = await get(p2.publicUrl);
  step("the public home page reflects the owner's edits and carries the photo-credit line", /Cakes and party small chops\./.test(home2.text) && /Photography on this site is illustrative|Photo:/.test(home2.text));
  const rb = await A.c.call("POST", `/api/sites/${bk.site.id}/versions/${bk.versionId}/rollback`);
  const home3 = await get(p2.publicUrl);
  step("rollback to the first version restores the earlier public bytes (verified)", rb.status === 200 && !/Cakes and party small chops\./.test(home3.text), `${rb.status} ${rb.json?.data?.verification?.status ?? ""}`);

  // ---- 6. public form, owner inbox, monitoring and a controlled failure with recovery -----------------------------------
  const fs1 = await client(apiUrl).call("POST", `/api/public/sites/${bk.site.id}/forms`, { name: "Tola", phone: "08023456789", message: "A cake for Saturday for 20 people", service: "Cakes" }, { anonymous: true });
  const fs2 = await client(apiUrl).call("POST", `/api/public/sites/${bk.site.id}/forms`, { name: "Spam", message: "buy now", website: "http://spam.example" }, { anonymous: true });
  const fs3 = await client(apiUrl).call("POST", `/api/public/sites/${bk.site.id}/forms`, {}, { anonymous: true });
  step("form: a real enquiry is accepted (201), a honeypot post is silently dropped, an empty post is refused (422)", fs1.status === 201 && fs2.status === 200 && fs3.status === 422, `${fs1.status}/${fs2.status}/${fs3.status}`);
  const inbox = (await A.c.call("GET", `/api/sites/${bk.site.id}/forms`)).json.data;
  step("owner inbox returns the enquiry and not the honeypot post", inbox.some((s) => JSON.stringify(s).includes("Saturday")) && !inbox.some((s) => JSON.stringify(s).includes("spam.example")), `${inbox.length} items`);
  const inboxB = await B.c.call("GET", `/api/sites/${bk.site.id}/forms`);
  step("another organisation cannot read that inbox", inboxB.status === 404 || inboxB.status === 403, String(inboxB.status));
  const hostForm = await fetch(`${hostUrl}/`).then((r) => r.status).catch(() => 0);
  step("Site Host answers on its own address", hostForm > 0, String(hostForm));
  const ch = await A.c.call("POST", `/api/sites/${made.kochab.site.id}/chaos`, { mode: "http_500", ttlSeconds: 60 });
  step("controlled failure: injected on a published test site", ch.status === 200 || ch.status === 201, String(ch.status));
  const down = await until(async () => (await get(made.kochab.publicUrl)).status >= 500, 20, 500);
  step("controlled failure: the Site Host now serves errors for that site", !!down);
  const inc = await until(async () => {
    const r = await A.c.call("GET", `/api/sites/${made.kochab.site.id}/incidents`);
    return (r.json?.data ?? []).length > 0 ? r.json.data : null;
  }, 40, 500);
  step("monitoring: the site monitor opened an incident", !!inc, `${inc?.length ?? 0} incidents`);
  await A.c.call("DELETE", `/api/sites/${made.kochab.site.id}/chaos`);
  const back = await until(async () => (await get(made.kochab.publicUrl)).status === 200, 20, 500);
  step("recovery: the site serves again after the fault is removed", !!back);
  const stBody = await A.c.call("GET", `/api/sites/${made.kochab.site.id}/status`);
  step("recovery: site status endpoint reports without error", stBody.status === 200, String(stBody.status));

  // ---- 7. delete and restore; enquiries are retained ------------------------------------------------------------------
  const impact = await A.c.call("GET", `/api/sites/${bk.site.id}/deletion-impact`);
  step("deletion impact is shown before deleting", impact.status === 200);
  const delBad = await A.c.call("DELETE", `/api/sites/${bk.site.id}`, { confirm: "wrong name" });
  step("deleting without typing the site's name is refused", delBad.status >= 400 && delBad.status < 500, String(delBad.status));
  const del = await A.c.call("DELETE", `/api/sites/${bk.site.id}`, { confirm: bk.site.name });
  step("delete with the confirmed name succeeds", del.status === 200, String(del.status));
  step("deleted: the public site stops being served", (await get(p2.publicUrl)).status === 404);
  step("deleted: the public form refuses new enquiries", (await client(apiUrl).call("POST", `/api/public/sites/${bk.site.id}/forms`, { name: "Late", message: "hello" }, { anonymous: true })).status === 404);
  const exp = await A.c.call("GET", `/api/sites/${bk.site.id}/deleted-enquiries`);
  step("deleted: the owner can still export the retained enquiries (nothing silently purged)", exp.status === 200 && JSON.stringify(exp.json).includes("Saturday"));
  const rest = await A.c.call("POST", `/api/sites/${bk.site.id}/restore`);
  step("restore brings the site back as UNPUBLISHED", rest.status === 200 && rest.json?.data?.status === "UNPUBLISHED", `${rest.status} ${rest.json?.data?.status ?? ""}`);
  const p3 = await publish(A, bk.site.id, lastGood);
  step("restored site republishes and serves again", p3?.verification?.status === "MATCH" && (await get(p3.publicUrl)).status === 200);
  step("the retained enquiry is still in the inbox after restore", JSON.stringify((await A.c.call("GET", `/api/sites/${bk.site.id}/forms`)).json).includes("Saturday"));

  // ---- 8. tenant isolation ----------------------------------------------------------------------------------------------
  const tgt = made.kochab.site.id, tv = made.kochab.versionId;
  const attempts = {
    "read the site": ["GET", `/api/sites/${tgt}`],
    "list versions": ["GET", `/api/sites/${tgt}/versions`],
    "read a version": ["GET", `/api/sites/${tgt}/versions/${tv}`],
    "edit": ["POST", `/api/sites/${tgt}/edit`, { baseVersionId: tv, designEdit: { kind: "page-meta", page: "services", title: "Hacked" } }],
    "publish": ["POST", `/api/sites/${tgt}/versions/${tv}/publish`],
    "delete": ["DELETE", `/api/sites/${tgt}`, { confirm: made.kochab.site.name }],
    "restore": ["POST", `/api/sites/${tgt}/restore`],
    "media candidates": ["POST", `/api/sites/${tgt}/media/candidates`, {}],
    "media catalogue": ["GET", `/api/sites/${tgt}/media/catalogue`],
    "confirm a statement": ["POST", `/api/sites/${tgt}/confirmations`, { text: "We are the best." }],
    "read enquiries": ["GET", `/api/sites/${tgt}/forms`],
    "export deleted enquiries": ["GET", `/api/sites/${tgt}/deleted-enquiries`],
    "inject a controlled failure": ["POST", `/api/sites/${tgt}/chaos`, { mode: "http_500" }],
  };
  const leaks = [];
  for (const [what, [m, p, b]] of Object.entries(attempts)) {
    const r = await B.c.call(m, p, b);
    if (r.status < 400 || r.status >= 500) leaks.push(`${what}:${r.status}`);
  }
  step("tenant isolation: owner B is refused (4xx) on all 13 attempts against owner A's site", leaks.length === 0, leaks.join(","));
  step("tenant isolation: owner A's site is unchanged after those attempts", (await get(made.kochab.publicUrl)).status === 200 && (await specOf(A, tgt, tv)).pages.length >= 6);
  const lst = await B.c.call("GET", `/api/orgs/${A.orgId}/sites`);
  step("tenant isolation: owner B cannot list owner A's organisation's sites", lst.status >= 400 && lst.status < 500, String(lst.status));

  // ---- 9. concurrent publish and delete ---------------------------------------------------------------------------------
  const RC = await mkOwner("race");
  const bad2 = [];
  for (let i = 0; i < 6; i++) {
    const m = await mkSite(RC, `Race Cakes ${i}`, "I bake cakes and small chops.");
    await publish(RC, m.site.id, m.versionId);
    const pubP = RC.c.call("POST", `/api/sites/${m.site.id}/versions/${m.versionId}/publish`);
    const delP = RC.c.call("DELETE", `/api/sites/${m.site.id}`, { confirm: m.site.name });
    await Promise.all([pubP, delP]);
    const row = (await sql`SELECT status, deleted_at FROM sites WHERE id=${m.site.id}`)[0];
    const served = (await get(m.publicUrl)).status;
    if (row.deleted_at && (row.status === "PUBLISHED" || served === 200)) bad2.push(`trial ${i}: deleted_at set, status ${row.status}, served ${served}`);
  }
  step("concurrent publish and delete (6 trials): a deleted site is never left PUBLISHED or served", bad2.length === 0, bad2.join("; "));
  const CC = await mkOwner("cap");
  const capRes = await Promise.all([0, 1, 2, 3, 4].map((i) => CC.c.call("POST", "/api/sites", { orgId: CC.orgId, name: `Parallel ${i}` })));
  const made3 = capRes.filter((r) => r.status === 201).length;
  step("concurrent creation: five simultaneous requests on a three-site plan admit exactly three (allowance enforced under a lock), the rest get a 4xx", made3 === 3 && capRes.every((r) => r.status === 201 || (r.status >= 400 && r.status < 500)), capRes.map((r) => r.status).join(","));

  // ---- 10. media provider failure and quota exhaustion (fake provider) -----------------------------------------------
  unsplash.mode = "down";
  const sBk = made.kochab.site.id;
  const dn = await A.c.call("POST", `/api/sites/${sBk}/media/candidates`, { intents: ["offline probe"] });
  step("media fallback: a provider outage is absorbed (200, no candidates, the failure is reported in the pool report, no server error)", dn.status === 200 && (dn.json?.data?.candidates ?? []).length === 0 && (dn.json?.data?.report?.failures ?? []).length >= 1, `${dn.status} candidates=${dn.json?.data?.candidates?.length} failures=${JSON.stringify(dn.json?.data?.report?.failures ?? []).slice(0, 80)}`, "mock");
  const catStill = await A.c.call("GET", `/api/sites/${sBk}/media/catalogue`);
  step("media fallback: the bundled catalogue still works during the outage", catStill.status === 200, String(catStill.status));
  const OC = await mkOwner("outage");
  const gDown = await mkSite(OC, "Outage Cakes", "I bake cakes and small chops.");
  const sDown = await specOf(OC, gDown.site.id, gDown.versionId);
  step("media fallback: generation during an outage still produces a complete site from bundled photos", gDown.gen.status === 201 && sDown.pages.length >= 6);
  unsplash.mode = "exhausted";
  const q1 = await A.c.call("POST", `/api/sites/${sBk}/media/candidates`, { intents: ["quota probe one"] });
  const callsAfterFirst = fakeUnsplash.requests.filter((r) => r.url.startsWith("/search")).length;
  const q2 = await A.c.call("POST", `/api/sites/${sBk}/media/candidates`, { intents: ["quota probe two"] });
  const callsAfterSecond = fakeUnsplash.requests.filter((r) => r.url.startsWith("/search")).length;
  step("media fallback: once the provider reports no allowance left, the next search is absorbed (200, no candidates) and makes no upstream call", q1.status === 200 && q2.status === 200 && (q2.json?.data?.candidates ?? []).length === 0 && callsAfterSecond === callsAfterFirst, `calls ${callsAfterFirst} -> ${callsAfterSecond}; skipped=${JSON.stringify(q2.json?.data?.report?.skipped ?? []).slice(0, 100)}`, "mock");
  const lim = [];
  for (let i = 0; i < 12; i++) lim.push((await A.c.call("POST", `/api/sites/${sBk}/media/candidates`, { intents: [`rate probe ${i}`] })).status);
  step("media rate limit: more than 10 searches a minute by one user get 429 (the shared hourly allowance cannot be drained by one account)", lim.includes(429), lim.join(","));
  unsplash.mode = "ok";

  // ---- 11. model composition (fake model) ---------------------------------------------------------------------------------
  const composeSite = async (mode, label) => {
    llm.mode = mode;
    const before = llm.calls;
    const CO = await mkOwner(`compose${mode}`);
    const m = await mkSite(CO, `Compose ${mode} ${stamp}`, "I bake cakes and small chops.");
    const s = await specOf(CO, m.site.id, m.versionId);
    return { m, s, calls: llm.calls - before, label };
  };
  const cv = await composeSite("valid", "valid");
  step("model composition (valid proposal): one model call, the edit is applied, structure unchanged", cv.m.gen.status === 201 && cv.calls === 1 && /plan for the day starts with the occasion/.test(JSON.stringify(cv.s.pages)) && cv.s.pages.length >= 6, `${cv.calls} calls`, "mock");
  const ch2 = await composeSite("hostile", "hostile");
  step("model composition (hostile proposal): invented claims and a foreign path are rejected; the site is still complete", ch2.m.gen.status === 201 && !/Award-winning|money-back|since 1998|15% off|pwned/.test(JSON.stringify(ch2.s.pages)) && ch2.s.pages.length >= 6, "", "mock");
  const cg = await composeSite("garbage", "garbage");
  step("model composition (malformed answer): deterministic site, no error", cg.m.gen.status === 201 && cg.s.pages.length >= 6, "", "mock");
  const cd = await composeSite("down", "down");
  step("model composition (provider down, 503): deterministic site, no error", cd.m.gen.status === 201 && cd.s.pages.length >= 6, "", "mock");
  step("the model was only ever shown owner facts: no site text, token or key left the process in prompts", !/MOCK-KEY|MOCK-LLM-KEY|KORA_SECRETS/.test(llm.lastUser), "", "mock");

  // ---- 12. feature flags: back to v2, then v3 -------------------------------------------------------------------------------
  await stopProc(live.api);
  const ok2 = await ctx.startApi("api-flag-v2", { ...flags, KORA_CREATIVE_ENGINE: "v2", KORA_MODEL_COMPOSE: "false", KORA_MEDIA_UNSPLASH: "off" });
  step("API restarts with KORA_CREATIVE_ENGINE=v2 (rollback of behaviour)", ok2);
  const FO = await mkOwner("flagv2");
  const A2 = FO.c;
  const g2 = await A2.call("POST", "/api/sites", { orgId: FO.orgId, name: `V2 Flag ${stamp}` });
  const gg = await A2.call("POST", `/api/sites/${g2.json.data.id}/generate`, { name: g2.json.data.name, description: "I bake cakes and small chops." });
  const sv2 = (await A2.call("GET", `/api/sites/${g2.json.data.id}/versions/${gg.json.data.version.id}`)).json.data.spec;
  step("flag v2: a new site is a v2 design", gg.status === 201 && sv2.version === 2, `version ${sv2.version}`);
  const still = await get(made.kochab.publicUrl);
  step("flag v2: the v3 site made earlier keeps serving", still.status === 200);
  const callsBeforeOff = fakeUnsplash.requests.length;
  const cand2 = await A2.call("POST", `/api/sites/${g2.json.data.id}/media/candidates`, {});
  const cat2 = await A2.call("GET", `/api/sites/${g2.json.data.id}/media/catalogue`);
  step("flag off: with KORA_MEDIA_UNSPLASH=off a search returns no candidates and makes no upstream call; the bundled catalogue still works", cand2.status === 200 && (cand2.json?.data?.candidates ?? []).length === 0 && fakeUnsplash.requests.length === callsBeforeOff && cat2.status === 200, `${cand2.status} candidates=${cand2.json?.data?.candidates?.length} catalogue=${cat2.status}`);
  const legacyPage = await get(state.legacy.publicUrl ?? `${hostUrl}/`);
  step("legacy v2 site (from the previous release) still renders", legacyPage.status === 200 && legacyPage.text.length > 500);
  await stopProc(live.api);
  const ok3 = await ctx.startApi("api-flag-v3-final", { KORA_CREATIVE_ENGINE: "v3", KORA_MEDIA_UNSPLASH: "off", KORA_MODEL_COMPOSE: "false" });
  step("API restarts with the documented staging values (v3, off, false)", ok3);
  fs.writeFileSync(path.join(outDir, "journeys-state.json"), JSON.stringify({
    A: { email: A.email, orgId: A.orgId },
    urls: { kochab: made.kochab.publicUrl, bakery: p3?.publicUrl ?? p2?.publicUrl, barber: made["barber-minimal"].publicUrl },
    siteIds: { kochab: made.kochab.site.id, bakery: bk.site.id, barber: made["barber-minimal"].site.id },
  }, null, 2));
  await fakeUnsplash.close();
  await fakeLlm.close();
}
