/**
 * The evidence page: one HTML document with its CSS and JS embedded as strings,
 * so it ships inside dist with no build step and no extra file. The page reads
 * the API's existing JSON routes with GET and builds every element with
 * createElement and textContent; data never reaches an HTML parser.
 *
 * Constraints the script keeps (tests enforce them): no innerHTML, no style
 * attributes, no network call except same-origin GET of four known paths, no
 * control that changes state.
 */

export const STYLE = String.raw`
:root {
  color-scheme: light dark;
  --bg: #ffffff;
  --fg: #1b1f24;
  --muted: #4a5560;
  --panel: #f3f5f7;
  --border: #b8c2cc;
  --link: #0b5cad;
  --focus: #b34700;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #101418;
    --fg: #e8edf2;
    --muted: #a9b4bf;
    --panel: #181e24;
    --border: #46535f;
    --link: #8cc0f7;
    --focus: #ffb454;
  }
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font: 1rem/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  overflow-wrap: anywhere;
}
header, main, footer { max-width: 60rem; margin: 0 auto; padding: 0 16px; }
header { padding-top: 1rem; }
main { padding-bottom: 2rem; }
footer { border-top: 1px solid var(--border); margin-top: 1rem; padding-top: 1rem; padding-bottom: 2rem; color: var(--muted); font-size: 0.9rem; }
h1 { font-size: 1.5rem; margin: 0.25rem 0; }
h2 { font-size: 1.25rem; margin: 1.5rem 0 0.5rem; }
h3 { font-size: 1.1rem; margin: 0 0 0.5rem; }
h4 { font-size: 1rem; margin: 1rem 0 0.25rem; }
p { margin: 0.5rem 0; }
a { color: var(--link); text-underline-offset: 0.15em; }
:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
main:focus { outline: none; }
.skip { position: absolute; left: -9999px; top: 0; background: var(--bg); padding: 0.5rem; }
.skip:focus { left: 8px; top: 8px; z-index: 1; }
.muted { color: var(--muted); }
.plain-list { list-style: none; margin: 0; padding: 0; }
.item { border: 1px solid var(--border); border-radius: 0.5rem; background: var(--panel); padding: 0.75rem; margin: 0.5rem 0; }
.item a, summary { display: inline-block; min-height: 2.75rem; padding: 0.5rem 0; }
summary { cursor: pointer; font-weight: 600; }
details { margin-top: 0.75rem; }
dl { display: grid; grid-template-columns: minmax(0, 11rem) minmax(0, 1fr); gap: 0.25rem 0.75rem; margin: 0.5rem 0; }
dt { color: var(--muted); }
dd { margin: 0; }
code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.9em; }
pre { white-space: pre-wrap; overflow: auto; max-height: 12rem; margin: 0.25rem 0; padding: 0.5rem; border: 1px solid var(--border); border-radius: 0.25rem; }
.state { border: 1px solid var(--border); border-radius: 0.5rem; padding: 0.5rem 0.75rem; margin: 0.5rem 0; }
.state.error { border-width: 3px; border-style: double; }
.state.empty { border-style: dashed; }
.badge { display: inline-flex; align-items: baseline; gap: 0.35em; padding: 0 0.5em; border-radius: 0.25rem; font-weight: 600; font-size: 0.9rem; }
.badge.unknown { border: 2px dashed currentColor; }
.badge.notcollected { border: 2px solid currentColor; background: var(--panel); }
.badge.plain { border: 1px solid var(--border); }
.badge .glyph { font-weight: 700; }
.legend { border-left: 4px solid var(--border); padding-left: 0.75rem; color: var(--muted); }
.cmd { display: inline-block; border: 1px solid var(--border); border-radius: 0.25rem; padding: 0.1rem 0.4rem; background: var(--panel); }
@media (max-width: 30rem) {
  dl { grid-template-columns: minmax(0, 1fr); }
  dt { margin-top: 0.5rem; }
}
`;

export const SCRIPT = String.raw`
(function () {
  "use strict";
  var MAX = 2000;
  var UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  var SCHEMA = "kora.incident-passport/v1";
  var VERIFICATION = "Deployment Verification (not cryptographic)";
  var app = document.getElementById("app");
  var pending = 0;
  var generation = 0;

  function show(value) {
    if (value === null || value === undefined) return "—";
    var s;
    if (typeof value === "string") s = value;
    else if (typeof value === "number" || typeof value === "boolean") s = String(value);
    else {
      try { s = JSON.stringify(value); } catch (e) { s = "[unreadable value]"; }
      if (typeof s !== "string") s = "[unreadable value]";
    }
    if (s.length > MAX) return s.slice(0, MAX) + " … [truncated, " + s.length + " characters]";
    return s;
  }
  function el(tag, className, content) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = show(content);
    return node;
  }
  function isObject(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function begin() { pending += 1; app.setAttribute("aria-busy", "true"); }
  function end() {
    pending -= 1;
    if (pending <= 0) { pending = 0; app.setAttribute("aria-busy", "false"); }
  }

  /* GET one same-origin path. Never rejects; never exposes the response body. */
  function get(path) {
    begin();
    return fetch(path, { method: "GET", credentials: "same-origin", cache: "no-store", headers: { accept: "application/json" } })
      .then(
        function (res) {
          return res.json().then(
            function (body) { return { ok: res.ok, status: res.status, body: body, unreadable: false, network: false }; },
            function () { return { ok: res.ok, status: res.status, body: null, unreadable: true, network: false }; }
          );
        },
        function () { return { ok: false, status: 0, body: null, unreadable: true, network: true }; }
      )
      .then(function (r) { end(); return r; }, function () { end(); return { ok: false, status: 0, body: null, unreadable: true, network: true }; });
  }
  function failure(r, what) {
    if (r.network) return "Could not reach the API to load " + what + " (network error). Reload the page to retry.";
    if (r.ok) return "The API answered for " + what + ", but not with JSON this page can read. Reload the page to retry.";
    return "The API answered HTTP " + r.status + " for " + what + ". Reload the page to retry.";
  }

  /* Elements */
  function panel(name, tag, headingTag, title) {
    var root = el(tag, "panel");
    root.setAttribute("data-section", name);
    root.setAttribute("data-state", "loading");
    var heading = el(headingTag, "", title);
    root.appendChild(heading);
    var body = el("div", "body");
    root.appendChild(body);
    return { root: root, body: body };
  }
  function message(p, kind, text) {
    clear(p.body);
    var m = el("p", "state " + kind, text);
    m.setAttribute("data-kind", kind);
    m.setAttribute("role", kind === "error" ? "alert" : "status");
    p.body.appendChild(m);
    p.root.setAttribute("data-state", kind);
  }
  function ready(p) { p.root.setAttribute("data-state", "ready"); }

  var GLYPHS = { "UNKNOWN": "?", "NOT COLLECTED": "∅" };
  function badge(status) {
    var s = show(status);
    var known = Object.prototype.hasOwnProperty.call(GLYPHS, s);
    var cls = s === "UNKNOWN" ? "badge unknown" : s === "NOT COLLECTED" ? "badge notcollected" : "badge plain";
    var b = el("span", cls);
    b.setAttribute("data-status", s);
    var g = el("span", "glyph", known ? GLYPHS[s] : "•");
    g.setAttribute("aria-hidden", "true");
    b.appendChild(g);
    b.appendChild(el("span", "label", s));
    return b;
  }
  function row(dl, label, field, value) {
    dl.appendChild(el("dt", "", label));
    var dd = el("dd");
    dd.setAttribute("data-field", field);
    if (value && value.nodeType === 1) dd.appendChild(value);
    else dd.textContent = show(value);
    dl.appendChild(dd);
    return dd;
  }
  function item(kind) {
    var li = el("li", "item");
    li.setAttribute("data-item", kind);
    return li;
  }
  function field(tag, name, content) {
    var node = el(tag, "", content);
    node.setAttribute("data-field", name);
    return node;
  }

  /* ---------- home: services, Deployment Verification, incidents ---------- */

  function renderVerification(p, r) {
    if (r.status === 404 && isObject(r.body) && r.body.error === "verification_not_run")
      return message(p, "empty", "No Deployment Verification has run for this service yet.");
    if (!r.ok || r.unreadable) return message(p, "error", failure(r, "the verification"));
    var v = isObject(r.body) ? r.body.data : null;
    if (!isObject(v) || !Array.isArray(v.evidence))
      return message(p, "error", "The verification response has an unexpected shape.");
    clear(p.body);
    var dl = el("dl");
    row(dl, "Status", "status", v.status);
    row(dl, "Claimed commit", "claimedCommit", v.claimedCommit);
    row(dl, "Source head", "scmHead", v.scmHead);
    if (v.behindBy !== null && v.behindBy !== undefined) row(dl, "Behind by (commits)", "behindBy", v.behindBy);
    row(dl, "Relation", "relation", v.relation);
    row(dl, "Detail", "detail", v.detail);
    row(dl, "Checked at", "checkedAt", v.checkedAt);
    p.body.appendChild(dl);

    var ev = panel("verification-evidence", "section", "h4", "Evidence");
    if (v.evidence.length === 0) message(ev, "empty", "No evidence was recorded for this check.");
    else {
      var ul = el("ul", "plain-list");
      v.evidence.forEach(function (e0) {
        var e = isObject(e0) ? e0 : {};
        var li = item("verification-evidence");
        var d = el("dl");
        row(d, "Kind", "kind", e.kind);
        row(d, "Outcome", "outcome", e.outcome);
        row(d, "Used for the result", "used", e.used === true ? "yes" : e.used === false ? "no" : e.used);
        row(d, "Observed at", "observedAt", e.observedAt);
        row(d, "HTTP status", "httpStatus", e.httpStatus);
        row(d, "Source", "sourceUrl", e.sourceUrl);
        row(d, "Reason", "reason", e.reason);
        li.appendChild(d);
        ul.appendChild(li);
      });
      ev.body.appendChild(ul);
      ready(ev);
    }
    p.body.appendChild(ev.root);

    var leg = panel("provider-leg", "section", "h4", "Provider leg");
    var l = isObject(v.providerLeg) ? v.providerLeg : {};
    var ld = el("dl");
    row(ld, "Status", "status", badge(l.status === undefined ? "UNKNOWN" : l.status));
    row(ld, "Reason", "reason", l.reason === undefined ? "The response carried no provider leg." : l.reason);
    leg.body.appendChild(ld);
    ready(leg);
    p.body.appendChild(leg.root);
    ready(p);
  }

  function serviceCard(s0, incidents) {
    var s = isObject(s0) ? s0 : {};
    var li = item("service");
    li.appendChild(el("h3", "", s.name));
    var dl = el("dl");
    row(dl, "Health URL", "healthUrl", s.health_url);
    if (isObject(s.resource)) {
      row(dl, "Provider status", "providerStatus", s.resource.status);
      row(dl, "Provider / region", "provider", show(s.resource.provider) + " / " + show(s.resource.region));
    }
    var open;
    if (incidents === null) open = badge("UNKNOWN");
    else {
      var n = incidents.filter(function (i) { return isObject(i) && i.service_id === s.id && i.state !== "RESOLVED"; }).length;
      open = n === 0 ? "none open" : n + " open";
    }
    row(dl, "Open incidents", "openIncidents", open);
    row(dl, "Registered", "createdAt", s.created_at);
    li.appendChild(dl);

    var v = panel("verification", "details", "summary", VERIFICATION);
    v.root.setAttribute("open", "");
    li.appendChild(v.root);
    message(v, "loading", "Loading the latest verification…");
    return { li: li, panel: v, id: s.id };
  }

  function incidentRow(i0) {
    var i = isObject(i0) ? i0 : {};
    var li = item("incident");
    var label = show(i.severity) + " · " + show(i.state) + " · " + show(i.service_name) + " · started " + show(i.started_at);
    if (typeof i.id === "string" && UUID.test(i.id)) {
      var a = el("a", "", label);
      a.setAttribute("href", "#/incident/" + encodeURIComponent(i.id));
      li.appendChild(a);
    } else {
      li.appendChild(el("span", "", label));
      li.appendChild(el("p", "muted", "This incident has no valid id, so it cannot be opened."));
    }
    return li;
  }

  function renderHome() {
    var gen = ++generation;
    clear(app);
    var services = panel("services", "section", "h2", "Services");
    var incidents = panel("incidents", "section", "h2", "Incidents");
    app.appendChild(services.root);
    app.appendChild(incidents.root);
    message(services, "loading", "Loading services…");
    message(incidents, "loading", "Loading incidents…");
    Promise.all([get("/services"), get("/incidents")]).then(function (rs) {
      if (gen !== generation) return;
      var sr = rs[0], ir = rs[1];
      var incList = null;
      if (ir.ok && !ir.unreadable && isObject(ir.body) && Array.isArray(ir.body.data)) incList = ir.body.data;

      if (incList === null)
        message(incidents, "error", ir.ok && !ir.unreadable ? "The incident list has an unexpected shape." : failure(ir, "incidents"));
      else if (incList.length === 0) message(incidents, "empty", "No incidents have been recorded.");
      else {
        var iul = el("ul", "plain-list");
        incList.forEach(function (i) { iul.appendChild(incidentRow(i)); });
        clear(incidents.body);
        incidents.body.appendChild(iul);
        ready(incidents);
      }

      var svcList = null;
      if (sr.ok && !sr.unreadable && isObject(sr.body) && Array.isArray(sr.body.data)) svcList = sr.body.data;
      if (svcList === null)
        return message(services, "error", sr.ok && !sr.unreadable ? "The service list has an unexpected shape." : failure(sr, "services"));
      if (svcList.length === 0) return message(services, "empty", "No services have been registered.");
      var ul = el("ul", "plain-list");
      var cards = svcList.map(function (s) { return serviceCard(s, incList); });
      cards.forEach(function (c) { ul.appendChild(c.li); });
      clear(services.body);
      services.body.appendChild(ul);
      ready(services);
      cards.forEach(function (c) {
        if (typeof c.id !== "string" || !UUID.test(c.id))
          return message(c.panel, "error", "This service has no valid id, so its verification cannot be requested.");
        get("/services/" + c.id + "/verification").then(function (r) {
          if (gen === generation) renderVerification(c.panel, r);
        });
      });
    });
  }

  /* ---------- one incident, from the Passport ---------- */

  function validPassport(p) {
    return isObject(p) && p.schema === SCHEMA && isObject(p.incident) && isObject(p.service) &&
      Array.isArray(p.timeline) && Array.isArray(p.evidence) && Array.isArray(p.gaps) &&
      isObject(p.diagnosis) && isObject(p.integrity);
  }

  function listSection(p, items, build, emptyText) {
    if (items.length === 0) return message(p, "empty", emptyText);
    var ul = el("ul", "plain-list");
    items.forEach(function (x) { ul.appendChild(build(isObject(x) ? x : {})); });
    clear(p.body);
    p.body.appendChild(ul);
    ready(p);
  }

  function renderIncident(id) {
    var gen = ++generation;
    clear(app);
    var back = el("p");
    var link = el("a", "", "← Services and incidents");
    link.setAttribute("href", "#/");
    link.setAttribute("data-action", "back");
    back.appendChild(link);
    app.appendChild(back);

    var summary = panel("summary", "section", "h2", "Incident");
    var timeline = panel("timeline", "section", "h2", "Timeline");
    var evidence = panel("evidence", "section", "h2", "Evidence items");
    var diagnosis = panel("diagnosis", "section", "h2", "Diagnosis");
    var gaps = panel("gaps", "section", "h2", "Gaps: what is UNKNOWN or NOT COLLECTED");
    var exp = panel("export", "section", "h2", "Export");
    [summary, timeline, evidence, diagnosis, gaps, exp].forEach(function (p) { app.appendChild(p.root); });
    var legend = field("p", "legend", "UNKNOWN means Kora cannot establish the answer from the evidence it has. NOT COLLECTED means Kora does not gather this kind of data at all.");
    legend.className = "legend";
    gaps.root.insertBefore(legend, gaps.body);

    function fail(text, extra) {
      message(summary, "error", text);
      [timeline, evidence, diagnosis, gaps, exp].forEach(function (p) {
        message(p, "error", extra || "Not shown because the Passport could not be loaded.");
      });
    }
    if (!UUID.test(id)) return fail("That is not a valid incident id.", "Not shown: the incident id is not valid.");
    [summary, timeline, evidence, diagnosis, gaps, exp].forEach(function (p) { message(p, "loading", "Loading…"); });

    get("/incidents/" + id + "/passport").then(function (r) {
      if (gen !== generation) return;
      if (r.status === 404) return fail("Incident not found (HTTP 404).");
      if (!r.ok || r.unreadable) return fail(failure(r, "the incident"));
      var pp = r.body;
      if (!validPassport(pp)) return fail("The Passport response has an unexpected shape.");
      var inc = pp.incident, svc = pp.service, d = pp.diagnosis;

      clear(summary.body);
      var sd = el("dl");
      row(sd, "Incident id", "id", inc.id);
      row(sd, "State", "state", inc.state);
      row(sd, "Severity", "severity", inc.severity);
      row(sd, "Started", "startedAt", inc.startedAt);
      row(sd, "Resolved", "resolvedAt", inc.resolvedAt === null ? "not resolved" : inc.resolvedAt);
      row(sd, "Service", "service", svc.name);
      row(sd, "Health URL", "healthUrl", svc.healthUrl);
      var res = pp.resource;
      row(sd, "Provider resource", "resource", isObject(res)
        ? show(res.provider) + " / " + show(res.region) + " / " + show(res.status)
        : badge("UNKNOWN"));
      summary.body.appendChild(sd);
      ready(summary);

      listSection(timeline, pp.timeline, function (t) {
        var li = item("timeline");
        var dl = el("dl");
        row(dl, "Occurred at", "occurredAt", t.occurredAt);
        row(dl, "Event", "eventType", t.eventType);
        row(dl, "Source", "source", t.source);
        li.appendChild(dl);
        var pre = field("pre", "payload", t.payload);
        pre.setAttribute("tabindex", "0");
        li.appendChild(pre);
        return li;
      }, "No timeline events were recorded for this incident.");

      listSection(evidence, pp.evidence, function (e) {
        var li = item("evidence");
        var dl = el("dl");
        row(dl, "Observed at", "observedAt", e.observedAt);
        row(dl, "Kind", "kind", e.kind);
        row(dl, "Health check", "healthy", e.healthy === true ? "healthy" : e.healthy === false ? "failed" : e.healthy);
        row(dl, "HTTP status", "httpStatus", e.httpStatus);
        row(dl, "Failure category", "failureCategory", e.failureCategory);
        row(dl, "Failure reason", "failureReason", e.failureReason);
        row(dl, "Provider status", "providerStatus", e.providerStatus);
        row(dl, "Latency (ms)", "latencyMs", e.latencyMs);
        var hash = el("code", "", e.contentHash);
        hash.setAttribute("data-field", "hash");
        dl.appendChild(el("dt", "", "SHA-256 of this item"));
        var dd = el("dd");
        dd.appendChild(hash);
        dl.appendChild(dd);
        li.appendChild(dl);
        return li;
      }, "No evidence items were recorded for this incident.");

      clear(diagnosis.body);
      var rc = isObject(d.rootCause) ? d.rootCause : {};
      var rcBox = el("div", "root-cause");
      rcBox.setAttribute("data-field", "rootCause");
      rcBox.appendChild(el("strong", "", "Root cause: "));
      rcBox.appendChild(badge(rc.state === undefined ? "UNKNOWN" : rc.state));
      rcBox.appendChild(el("p", "", rc.statement));
      diagnosis.body.appendChild(rcBox);
      var td = el("dl");
      var tp = isObject(d.temporal) ? d.temporal : {};
      row(td, "Last known healthy", "lastKnownHealthyAt", tp.lastKnownHealthyAt);
      row(td, "First failure", "firstFailureAt", tp.firstFailureAt);
      row(td, "Latest failure", "latestFailureAt", tp.latestFailureAt);
      row(td, "Recovery verified", "recoveryVerifiedAt", tp.recoveryVerifiedAt);
      row(td, "Snapshot SHA-256", "snapshotHash", d.contentHash);
      diagnosis.body.appendChild(td);
      if (d.truncated === true)
        diagnosis.body.appendChild(field("p", "truncated", "The diagnosis was truncated: it considered " + show(d.evidence && d.evidence.length) + " of " + show(d.totalEvidenceCount) + " evidence items."));
      var findings = panel("findings", "section", "h3", "Findings");
      var contradictions = panel("contradictions", "section", "h3", "Contradictions");
      diagnosis.body.appendChild(findings.root);
      diagnosis.body.appendChild(contradictions.root);
      if (Array.isArray(d.findings))
        listSection(findings, d.findings, function (f) {
          var li = item("finding");
          var dl = el("dl");
          row(dl, "Code", "code", f.code);
          row(dl, "Confidence", "confidence", f.confidence);
          row(dl, "Statement", "statement", f.statement);
          row(dl, "Evidence items", "evidenceCount", Array.isArray(f.evidenceIds) ? f.evidenceIds.length : f.evidenceIds);
          li.appendChild(dl);
          return li;
        }, "The diagnosis has no findings.");
      else message(findings, "error", "The diagnosis findings have an unexpected shape.");
      if (Array.isArray(d.contradictions))
        listSection(contradictions, d.contradictions, function (c) {
          var li = item("contradiction");
          var dl = el("dl");
          row(dl, "Code", "code", c.code);
          row(dl, "Statement", "statement", c.statement);
          li.appendChild(dl);
          return li;
        }, "The diagnosis found no contradictions in the evidence.");
      else message(contradictions, "error", "The diagnosis contradictions have an unexpected shape.");
      ready(diagnosis);

      listSection(gaps, pp.gaps, function (g) {
        var li = item("gap");
        li.appendChild(badge(g.status));
        li.appendChild(el("strong", "", " " + show(g.item)));
        li.appendChild(field("p", "reason", g.reason));
        return li;
      }, "No gaps were listed for this incident.");

      clear(exp.body);
      var dl = el("dl");
      row(dl, "Passport SHA-256", "contentHash", pp.integrity.contentHash);
      row(dl, "Generated at", "generatedAt", pp.generatedAt);
      exp.body.appendChild(dl);
      var dp = el("p");
      var a = el("a", "", "Download Incident Passport");
      a.setAttribute("href", "/incidents/" + id + "/passport");
      a.setAttribute("download", "incident-" + id + ".passport.json");
      a.setAttribute("data-action", "download-passport");
      dp.appendChild(a);
      exp.body.appendChild(dp);
      var cp = el("p");
      cp.appendChild(el("span", "", "Check the file offline: "));
      var cmd = field("code", "verify-command", "pnpm kora:verify <file>");
      cmd.className = "cmd";
      cp.appendChild(cmd);
      exp.body.appendChild(cp);
      exp.body.appendChild(field("p", "integrity-line", "Integrity only: not signed, does not show who produced it"));
      exp.body.appendChild(el("p", "muted", "The generated-at time is not covered by the hash."));
      ready(exp);
    });
  }

  /* ---------- routing ---------- */

  function route(moveFocus) {
    var hash = window.location.hash || "";
    if (hash !== "" && hash !== "#" && hash.charAt(1) !== "/") return;
    var m = /^#\/incident\/(.*)$/.exec(hash);
    if (m) {
      var id;
      try { id = decodeURIComponent(m[1]); } catch (e) { id = ""; }
      renderIncident(id);
    } else renderHome();
    if (pending === 0) app.setAttribute("aria-busy", "false");
    if (moveFocus) app.focus();
  }
  window.addEventListener("hashchange", function () { route(true); });
  route(false);
})();
`;

export const PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="referrer" content="no-referrer">
<title>Kora evidence (read-only)</title>
<style>${STYLE}</style>
</head>
<body>
<a class="skip" href="#app">Skip to content</a>
<header>
<h1>Kora evidence</h1>
<p class="muted">Read-only view of services, incidents, evidence and diagnoses. Nothing on this page changes state.</p>
</header>
<main id="app" tabindex="-1" aria-busy="true">
<p class="state" role="status" data-kind="loading">Loading…</p>
<noscript><p class="state error">This page needs JavaScript to read the API.</p></noscript>
</main>
<footer data-field="no-auth">
<p>No authentication: this API has none, so anyone who can reach this address can read this page and the data behind it.</p>
<p>Read-only. Every request this page makes is a GET to this same address. Health is shown through incidents and evidence; the API has no live health route.</p>
</footer>
<script>${SCRIPT}</script>
</body>
</html>
`;
