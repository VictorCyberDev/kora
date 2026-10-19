import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import {
  FORBIDDEN,
  openUi,
  type Page,
  type Reply,
} from "../test-support/ui-harness.js";

type Json = Record<string, unknown>;
interface Passport {
  incident: Json & { id: string };
  service: Json & { id: string };
  timeline: Json[];
  evidence: Array<Json & { contentHash: string }>;
  gaps: Json[];
  integrity: Json & { contentHash: string };
  diagnosis: {
    contentHash: string;
    truncated: boolean;
    rootCause: Json & { statement: string };
    findings: Json[];
    contradictions: Json[];
    evidence: Json[];
  };
}

// A real export from GET /incidents/:id/passport (resolved incident).
const passport = JSON.parse(
  readFileSync(
    new URL(
      "../../../../packages/passport/test-fixtures/example.passport.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as Passport;
const INCIDENT_ID = passport.incident.id;
const SERVICE_ID = passport.service.id;

const service = (over: Json = {}): Json => ({
  id: SERVICE_ID,
  name: "demo-service",
  health_url: "http://demo.invalid/health",
  created_at: "2026-10-17T12:00:00.000Z",
  resource: {
    id: "r1",
    provider: "rumptycloud",
    providerAccount: "workspace-1",
    region: "region-1",
    resourceType: "virtual_machine",
    providerResourceId: "rc-1",
    displayName: "demo",
    environment: "test",
    status: "RUNNING",
  },
  ...over,
});
const incident = (over: Json = {}): Json => ({
  id: INCIDENT_ID,
  service_id: SERVICE_ID,
  deduplication_key: "k",
  state: "RESOLVED",
  severity: "HIGH",
  started_at: "2026-10-17T12:14:34.820Z",
  resolved_at: "2026-10-17T12:14:40.820Z",
  created_at: "2026-10-17T12:15:34.829Z",
  updated_at: "2026-10-17T12:15:34.843Z",
  service_name: "demo-service",
  resource: null,
  ...over,
});
const verification = (over: Json = {}): Json => ({
  method: "Deployment Verification (not cryptographic)",
  serviceId: SERVICE_ID,
  checkId: "c1",
  checkedAt: "2026-10-17T12:30:00.000Z",
  status: "BEHIND",
  behindBy: 3,
  relation: "claimed_behind",
  detail: "The claimed commit is 3 commits behind the source head.",
  scmHead: "b".repeat(40),
  claimedCommit: "a".repeat(40),
  claim: null,
  evidence: [
    {
      kind: "commit_relation",
      observationId: "o3",
      observedAt: "2026-10-17T12:30:00.000Z",
      outcome: "OBSERVED",
      sourceUrl: "https://api.example.invalid/compare",
      httpStatus: 200,
      reason: null,
      used: true,
    },
    {
      kind: "scm_head",
      observationId: "o1",
      observedAt: "2026-10-17T12:30:00.000Z",
      outcome: "OBSERVED",
      sourceUrl: "https://api.example.invalid/ref",
      httpStatus: 200,
      reason: null,
      used: true,
    },
    {
      kind: "workload_claim",
      observationId: "o2",
      observedAt: "2026-10-17T12:30:00.000Z",
      outcome: "UNKNOWN",
      sourceUrl: "http://demo.invalid/__kora",
      httpStatus: null,
      reason: "connection refused",
      used: false,
    },
  ],
  providerLeg: {
    status: "NOT COLLECTED",
    reason: "Rumpty exposes no documented deployment revision signal",
  },
  ...over,
});

interface Setup {
  services?: Reply;
  incidents?: Reply;
  verification?: Reply;
  passport?: Reply;
}
function routes(s: Setup = {}) {
  return (url: string): Reply => {
    if (url === "/services")
      return s.services ?? { body: { data: [service()] } };
    if (url === "/incidents")
      return s.incidents ?? { body: { data: [incident()] } };
    if (url === `/services/${SERVICE_ID}/verification`)
      return s.verification ?? { body: { data: verification() } };
    if (url === `/incidents/${INCIDENT_ID}/passport`)
      return s.passport ?? { body: passport };
    return { status: 404, body: { error: "not_found" } };
  };
}

const open: Page[] = [];
async function home(s: Setup = {}) {
  const page = await openUi({ routes: routes(s) });
  open.push(page);
  return page;
}
async function incidentView(s: Setup = {}, id = INCIDENT_ID) {
  const page = await openUi({
    routes: routes(s),
    hash: `#/incident/${id}`,
  });
  open.push(page);
  return page;
}
afterEach(() => {
  for (const p of open.splice(0)) p.close();
});

const q = (page: Page, selector: string) =>
  page.document.querySelector(selector);
const qa = (page: Page, selector: string) => [
  ...page.document.querySelectorAll(selector),
];
const text = (page: Page, selector: string) =>
  q(page, selector)?.textContent?.replace(/\s+/g, " ").trim() ?? null;
const section = (page: Page, name: string) =>
  q(page, `[data-section="${name}"]`)!;

describe("home: services, health, Deployment Verification", () => {
  it("lists services with provider status and open-incident count", async () => {
    const page = await home({
      incidents: {
        body: {
          data: [
            incident({ id: "id-open", state: "DETECTED", resolved_at: null }),
            incident({ id: "id-closed" }),
          ],
        },
      },
    });
    const card = q(page, '[data-item="service"]')!;
    expect(card.querySelector("h3")!.textContent).toBe("demo-service");
    expect(
      card.querySelector('[data-field="providerStatus"]')!.textContent,
    ).toBe("RUNNING");
    expect(
      card.querySelector('[data-field="openIncidents"]')!.textContent,
    ).toBe("1 open");
    expect(section(page, "services").getAttribute("data-state")).toBe("ready");
  });

  it("shows the verification panel: status, claimed vs head, behindBy, evidence", async () => {
    const page = await home();
    const panel = section(page, "verification");
    expect(panel.querySelector("summary")!.textContent).toBe(
      "Deployment Verification (not cryptographic)",
    );
    const field = (name: string) =>
      panel.querySelector(`[data-field="${name}"]`)?.textContent ?? null;
    expect(field("status")).toBe("BEHIND");
    expect(field("claimedCommit")).toBe("a".repeat(40));
    expect(field("scmHead")).toBe("b".repeat(40));
    expect(field("behindBy")).toBe("3");
    expect(field("relation")).toBe("claimed_behind");
    expect(field("detail")).toBe(
      "The claimed commit is 3 commits behind the source head.",
    );
    const items = [
      ...panel.querySelectorAll('[data-item="verification-evidence"]'),
    ];
    expect(
      items.map((i) => i.querySelector('[data-field="kind"]')!.textContent),
    ).toEqual(["commit_relation", "scm_head", "workload_claim"]);
    expect(items[2]!.textContent).toContain("connection refused");
    expect(items[2]!.querySelector('[data-field="used"]')!.textContent).toBe(
      "no",
    );
  });

  it("omits behindBy when the API has none", async () => {
    const page = await home({
      verification: {
        body: { data: verification({ status: "MATCH", behindBy: null }) },
      },
    });
    expect(q(page, '[data-field="behindBy"]')).toBeNull();
    expect(
      text(page, '[data-section="verification"] [data-field="status"]'),
    ).toBe("MATCH");
  });

  it("shows the provider leg exactly as NOT COLLECTED with its reason", async () => {
    const page = await home();
    const leg = section(page, "provider-leg");
    expect(leg.querySelector(".badge .label")!.textContent).toBe(
      "NOT COLLECTED",
    );
    expect(leg.querySelector('[data-field="reason"]')!.textContent).toBe(
      "Rumpty exposes no documented deployment revision signal",
    );
  });

  it("links each incident and nothing else dynamic", async () => {
    const page = await home();
    const link = q(page, '[data-item="incident"] a')!;
    expect(link.getAttribute("href")).toBe(`#/incident/${INCIDENT_ID}`);
    expect(link.textContent).toContain("demo-service");
  });
});

describe("empty and error states for every list on the home page", () => {
  const cases: Array<[string, Setup, string, string]> = [
    [
      "services empty",
      { services: { body: { data: [] } } },
      "services",
      "empty",
    ],
    [
      "services http error",
      { services: { status: 500, body: {} } },
      "services",
      "error",
    ],
    [
      "services network error",
      { services: "network-error" },
      "services",
      "error",
    ],
    ["services bad json", { services: { status: 200 } }, "services", "error"],
    [
      "incidents empty",
      { incidents: { body: { data: [] } } },
      "incidents",
      "empty",
    ],
    [
      "incidents http error",
      { incidents: { status: 503, body: {} } },
      "incidents",
      "error",
    ],
    [
      "incidents network error",
      { incidents: "network-error" },
      "incidents",
      "error",
    ],
    [
      "verification not run",
      {
        verification: { status: 404, body: { error: "verification_not_run" } },
      },
      "verification",
      "empty",
    ],
    [
      "verification http error",
      { verification: { status: 500, body: {} } },
      "verification",
      "error",
    ],
    [
      "verification network error",
      { verification: "network-error" },
      "verification",
      "error",
    ],
    [
      "verification evidence empty",
      { verification: { body: { data: verification({ evidence: [] }) } } },
      "verification-evidence",
      "empty",
    ],
  ];
  it.each(cases)("%s", async (_name, setup, name, state) => {
    const page = await home(setup);
    const el = section(page, name);
    expect(el.getAttribute("data-state")).toBe(state);
    const message = el.querySelector(`[data-kind="${state}"]`)!;
    expect(message.textContent.trim().length).toBeGreaterThan(10);
    expect(message.getAttribute("role")).toBe(
      state === "error" ? "alert" : "status",
    );
    expect(page.errors).toEqual([]);
  });

  it("an incident list failure does not hide services, and says health is unknown", async () => {
    const page = await home({ incidents: { status: 500, body: {} } });
    expect(qa(page, '[data-item="service"]')).toHaveLength(1);
    const open = q(page, '[data-field="openIncidents"]')!;
    expect(open.querySelector(".badge .label")!.textContent).toBe("UNKNOWN");
  });

  it("an error never echoes the response body", async () => {
    const page = await home({
      services: { status: 500, body: { error: "SECRET-STACK-TRACE" } },
    });
    expect(page.document.body.textContent).not.toContain("SECRET-STACK-TRACE");
    expect(
      text(page, '[data-section="services"] [data-kind="error"]'),
    ).toContain("HTTP 500");
  });
});

describe("one incident: fact to diagnosis to export", () => {
  it("renders timeline, evidence with hashes, diagnosis and gaps in that order", async () => {
    const page = await incidentView();
    const order = qa(page, "[data-section]")
      .map((e) => e.getAttribute("data-section"))
      .filter((n) =>
        [
          "summary",
          "timeline",
          "evidence",
          "diagnosis",
          "gaps",
          "export",
        ].includes(n!),
      );
    expect(order).toEqual([
      "summary",
      "timeline",
      "evidence",
      "diagnosis",
      "gaps",
      "export",
    ]);
    expect(qa(page, '[data-item="timeline"]')).toHaveLength(
      passport.timeline.length,
    );
    const items = qa(page, '[data-section="evidence"] [data-item="evidence"]');
    expect(items).toHaveLength(passport.evidence.length);
    expect(
      items.map((i) => i.querySelector('[data-field="hash"]')!.textContent),
    ).toEqual(passport.evidence.map((e: Json) => e.contentHash));
    expect(
      text(page, '[data-section="diagnosis"] [data-field="snapshotHash"]'),
    ).toBe(passport.diagnosis.contentHash);
    expect(qa(page, '[data-item="finding"]')).toHaveLength(
      passport.diagnosis.findings.length,
    );
    expect(qa(page, '[data-item="gap"]')).toHaveLength(passport.gaps.length);
    expect(page.requests.map((r) => r.url)).toEqual([
      `/incidents/${INCIDENT_ID}/passport`,
    ]);
  });

  it("shows rootCause UNKNOWN as UNKNOWN, never softened", async () => {
    const page = await incidentView();
    const root = q(page, '[data-field="rootCause"]')!;
    expect(root.querySelector(".badge .label")!.textContent).toBe("UNKNOWN");
    expect(root.textContent).toContain(passport.diagnosis.rootCause.statement);
    expect(root.textContent.toLowerCase()).not.toMatch(
      /likely|probably|maybe|possibly/,
    );
  });

  it("shows a non-UNKNOWN root cause state as given", async () => {
    const changed = structuredClone(passport);
    changed.diagnosis.rootCause = {
      state: "SUSPECTED",
      statement: "A suspected cause.",
    };
    const page = await incidentView({ passport: { body: changed } });
    const root = q(page, '[data-field="rootCause"]')!;
    expect(root.querySelector(".badge .label")!.textContent).toBe("SUSPECTED");
  });

  it("distinguishes UNKNOWN from NOT COLLECTED in text, shape and class, not colour", async () => {
    const page = await incidentView();
    const badges = new Map<string, Element>();
    for (const b of qa(page, '[data-section="gaps"] .badge'))
      badges.set(b.querySelector(".label")!.textContent, b);
    const unknown = badges.get("UNKNOWN")!;
    const notCollected = badges.get("NOT COLLECTED")!;
    expect(unknown).toBeDefined();
    expect(notCollected).toBeDefined();
    expect(unknown.getAttribute("data-status")).toBe("UNKNOWN");
    expect(notCollected.getAttribute("data-status")).toBe("NOT COLLECTED");
    expect(unknown.className).not.toBe(notCollected.className);
    const glyph = (b: Element) => b.querySelector(".glyph")!.textContent;
    expect(glyph(unknown)).not.toBe(glyph(notCollected));
    expect(unknown.querySelector(".glyph")!.getAttribute("aria-hidden")).toBe(
      "true",
    );
    // The legend states the difference in words.
    const legend = text(page, '[data-field="legend"]')!;
    expect(legend).toContain("UNKNOWN");
    expect(legend).toContain("NOT COLLECTED");
    // Each gap carries its reason.
    const gaps = qa(page, '[data-item="gap"]');
    expect(
      gaps.map((g) => g.querySelector('[data-field="reason"]')!.textContent),
    ).toEqual(passport.gaps.map((g: Json) => g.reason));
    const css = page.document.querySelector("style")!.textContent;
    expect(css).toMatch(/\.badge\.unknown\s*\{[^}]*dashed/);
    expect(css).toMatch(/\.badge\.notcollected\s*\{[^}]*(solid|double)/);
  });

  it("offers the Passport download, the offline command and the integrity-only line", async () => {
    const page = await incidentView();
    const link = q(page, 'a[data-action="download-passport"]')!;
    expect(link.textContent).toBe("Download Incident Passport");
    expect(link.getAttribute("href")).toBe(
      `/incidents/${INCIDENT_ID}/passport`,
    );
    expect(link.hasAttribute("download")).toBe(true);
    expect(text(page, '[data-field="verify-command"]')).toBe(
      "pnpm kora:verify <file>",
    );
    expect(text(page, '[data-field="integrity-line"]')).toBe(
      "Integrity only: not signed, does not show who produced it",
    );
    expect(text(page, '[data-field="contentHash"]')).toBe(
      passport.integrity.contentHash,
    );
  });

  it("states truncation of the diagnosis when it happened", async () => {
    const changed = structuredClone(passport);
    changed.diagnosis.truncated = true;
    const page = await incidentView({ passport: { body: changed } });
    expect(text(page, '[data-field="truncated"]')).toMatch(/truncated/i);
  });

  it("links back to the list", async () => {
    const page = await incidentView();
    expect(q(page, 'a[data-action="back"]')!.getAttribute("href")).toBe("#/");
  });
});

describe("empty and error states for every list on the incident page", () => {
  const emptied = () => {
    const p = structuredClone(passport);
    p.timeline = [];
    p.evidence = [];
    p.gaps = [];
    p.diagnosis.findings = [];
    p.diagnosis.contradictions = [];
    p.diagnosis.evidence = [];
    return p;
  };
  it.each(["timeline", "evidence", "findings", "contradictions", "gaps"])(
    "%s is empty",
    async (name) => {
      const page = await incidentView({ passport: { body: emptied() } });
      const el = section(page, name);
      expect(el.getAttribute("data-state")).toBe("empty");
      expect(
        el.querySelector('[data-kind="empty"]')!.getAttribute("role"),
      ).toBe("status");
    },
  );
  const failures: Array<[string, Reply]> = [
    ["http 500", { status: 500, body: {} }],
    ["http 503", { status: 503, body: { error: "incident_changing" } }],
    ["network error", "network-error"],
    ["bad json", { status: 200 }],
  ];
  it.each(failures)(
    "passport %s shows an error in every section",
    async (_n, reply) => {
      const page = await incidentView({ passport: reply });
      for (const name of [
        "timeline",
        "evidence",
        "diagnosis",
        "gaps",
        "export",
      ]) {
        const el = section(page, name);
        expect(el.getAttribute("data-state"), name).toBe("error");
        expect(
          el.querySelector('[data-kind="error"]')!.getAttribute("role"),
        ).toBe("alert");
      }
      expect(q(page, 'a[data-action="download-passport"]')).toBeNull();
    },
  );
  it("an unknown incident says so", async () => {
    const page = await incidentView({
      passport: { status: 404, body: { error: "not_found" } },
    });
    expect(text(page, '[data-section="summary"] [data-kind="error"]')).toMatch(
      /not found/i,
    );
  });
  it("a malformed Passport is an error, not a crash", async () => {
    const page = await incidentView({ passport: { body: { schema: "x" } } });
    expect(page.errors).toEqual([]);
    expect(section(page, "diagnosis").getAttribute("data-state")).toBe("error");
  });
  it("refuses an id that is not a UUID without making a request", async () => {
    const page = await incidentView({}, "x%22%20onmouseover%3Dalert(1)");
    expect(page.requests).toEqual([]);
    expect(text(page, '[data-section="summary"] [data-kind="error"]')).toMatch(
      /not a valid incident id/i,
    );
  });
});

describe("hostile data is rendered inert", () => {
  const LONG = "A".repeat(200_000);
  const HOSTILE = [
    "<script>window.__pwned=1</script>",
    '<img src=x onerror="window.__pwned=1">',
    '"><svg onload=window.__pwned=1>',
    "javascript:window.__pwned=1",
    "</style><script>window.__pwned=1</script>",
    "{{constructor.constructor('window.__pwned=1')()}}",
  ];
  function assertInert(page: Page, hostile: string[]) {
    const w = page.window as unknown as Record<string, unknown>;
    expect(w.__pwned).toBeUndefined();
    expect(page.errors).toEqual([]);
    expect(page.document.querySelectorAll("script")).toHaveLength(1);
    expect(
      page.document.querySelectorAll(
        "img, svg, iframe, object, embed, form, input, button, link, base, meta[http-equiv]",
      ),
    ).toHaveLength(0);
    for (const el of page.document.querySelectorAll("*")) {
      for (const attr of el.getAttributeNames()) {
        expect(attr).not.toMatch(/^on/i);
        expect(attr).not.toBe("style");
      }
    }
    for (const a of page.document.querySelectorAll("a")) {
      const href = a.getAttribute("href") ?? "";
      expect(href, href).toMatch(
        /^(#\/|#app$|\/incidents\/[0-9a-f-]{36}\/passport$)/,
      );
    }
    const body = page.document.body.textContent;
    for (const h of hostile) expect(body).toContain(h.slice(0, 40));
  }

  it("in service names, health URLs and resource fields", async () => {
    const services = HOSTILE.map((h, i) =>
      service({
        id: `00000000-0000-4000-8000-00000000000${i}`,
        name: h,
        health_url: h,
        resource: {
          ...(service().resource as Json),
          displayName: h,
          status: h,
          region: h,
        },
      }),
    );
    const page = await home({
      services: { body: { data: services } },
      verification: { status: 404, body: { error: "verification_not_run" } },
    });
    assertInert(page, HOSTILE);
    expect(qa(page, '[data-item="service"]')).toHaveLength(HOSTILE.length);
  });

  it("in incident names, states and ids", async () => {
    const incidents = HOSTILE.map((h) =>
      incident({ id: h, service_name: h, state: h, severity: h }),
    );
    const page = await home({ incidents: { body: { data: incidents } } });
    assertInert(page, HOSTILE);
    for (const a of qa(page, '[data-item="incident"] a'))
      expect(a.getAttribute("href")!.startsWith("#/incident/")).toBe(true);
  });

  it("in evidence, timeline, diagnosis and gaps", async () => {
    const p = structuredClone(passport);
    const at = <T>(list: T[], i: number): T => list[i % list.length]!;
    HOSTILE.forEach((h, i) => {
      const e = at(p.evidence, i);
      e.failureReason = h;
      e.failureCategory = h;
      e.providerStatus = h;
      e.contentHash = h;
      const t = at(p.timeline, i);
      t.eventType = h;
      t.source = h;
      t.payload = { [h]: h, nested: [h] };
      p.gaps.push({ item: h, status: h, reason: h });
      const finding = at(p.diagnosis.findings, 0);
      finding.statement = h;
      finding.code = h;
      at(p.diagnosis.contradictions, 0).statement = h;
    });
    p.diagnosis.rootCause = { state: HOSTILE[0], statement: HOSTILE[1]! };
    p.incident.severity = HOSTILE[2];
    p.service.name = HOSTILE[3];
    p.integrity.contentHash = HOSTILE[4]!;
    const page = await incidentView({ passport: { body: p } });
    assertInert(page, HOSTILE);
    expect(text(page, 'a[data-action="download-passport"]')).toBe(
      "Download Incident Passport",
    );
  });

  it("in verification evidence and detail", async () => {
    const v = verification({
      status: HOSTILE[0],
      detail: HOSTILE[1],
      scmHead: HOSTILE[2],
      claimedCommit: HOSTILE[3],
      relation: HOSTILE[4],
      providerLeg: { status: HOSTILE[0], reason: HOSTILE[1] },
      evidence: HOSTILE.map((h) => ({
        kind: h,
        observationId: h,
        observedAt: h,
        outcome: h,
        sourceUrl: h,
        httpStatus: h,
        reason: h,
        used: h,
      })),
    });
    const page = await home({ verification: { body: { data: v } } });
    assertInert(page, HOSTILE);
  });

  it("very long values stay inside the page and are cut with a marker", async () => {
    const page = await home({
      services: { body: { data: [service({ name: LONG, health_url: LONG })] } },
    });
    const name = q(page, '[data-item="service"] h3')!.textContent;
    expect(name.length).toBeLessThan(5000);
    expect(name).toMatch(/truncated.*200000/);
    const css = page.document.querySelector("style")!.textContent;
    expect(css).toMatch(/overflow-wrap:\s*anywhere/);
  });

  it("non-string values never throw", async () => {
    const page = await home({
      services: {
        body: {
          data: [service({ name: { a: 1 }, health_url: 42, created_at: null })],
        },
      },
      incidents: { body: { data: [{}, null, 5, "x"] } },
    });
    expect(page.errors).toEqual([]);
    expect(section(page, "services").getAttribute("data-state")).toBe("ready");
  });

  it("a response that is not the documented shape is an error state", async () => {
    const page = await home({
      services: { body: { data: "nope" } },
      incidents: { body: { nodata: 1 } },
    });
    expect(section(page, "services").getAttribute("data-state")).toBe("error");
    expect(section(page, "incidents").getAttribute("data-state")).toBe("error");
  });
});

describe("page rules", () => {
  it("makes only GET requests to same-origin paths it knows", async () => {
    const page = await home();
    page.window.document
      .querySelector<HTMLAnchorElement>('[data-item="incident"] a')!
      .click();
    await page.settle();
    expect(page.requests.length).toBeGreaterThanOrEqual(4);
    const allowed = [
      /^\/services$/,
      /^\/incidents$/,
      /^\/services\/[0-9a-f-]{36}\/verification$/,
      /^\/incidents\/[0-9a-f-]{36}\/passport$/,
    ];
    for (const r of page.requests) {
      expect(r.method).toBe("GET");
      expect(r.url).not.toMatch(/^[a-z][a-z0-9+.-]*:|^\/\//i);
      expect(
        allowed.some((re) => re.test(r.url)),
        r.url,
      ).toBe(true);
    }
    expect(page.requests.some((r) => r.url.includes("/dev"))).toBe(false);
    expect(page.xhrCount()).toBe(0);
  });

  it("navigates between the list and an incident with the keyboard-reachable link", async () => {
    const page = await home();
    const link = q(page, '[data-item="incident"] a') as HTMLAnchorElement;
    link.click();
    await page.settle();
    expect(page.window.location.hash).toBe(`#/incident/${INCIDENT_ID}`);
    expect(q(page, '[data-section="timeline"]')).not.toBeNull();
    (q(page, 'a[data-action="back"]') as HTMLAnchorElement).click();
    await page.settle();
    expect(q(page, '[data-section="services"]')).not.toBeNull();
    expect(q(page, '[data-section="timeline"]')).toBeNull();
  });

  it("has no control that changes state; everything interactive is a link or summary", async () => {
    for (const page of [await home(), await incidentView()]) {
      expect(qa(page, "button, form, input, select, textarea")).toHaveLength(0);
      for (const el of qa(page, "[tabindex]"))
        expect(Number(el.getAttribute("tabindex"))).toBeLessThanOrEqual(0);
      const interactive = qa(page, "a, summary, [role=button], [onclick]");
      for (const el of interactive)
        expect(["A", "SUMMARY"], el.outerHTML.slice(0, 80)).toContain(
          el.tagName,
        );
    }
  });

  it("has landmarks, a skip link, one h1 and a polite status region", async () => {
    const page = await home();
    expect(qa(page, "h1")).toHaveLength(1);
    expect(q(page, "header")).not.toBeNull();
    expect(q(page, "main")).not.toBeNull();
    expect(q(page, "footer")).not.toBeNull();
    expect(q(page, "a.skip")!.getAttribute("href")).toBe("#app");
    expect(page.document.documentElement.getAttribute("lang")).toBe("en");
    expect(q(page, "main")!.getAttribute("aria-busy")).toBe("false");
  });

  it("says in the footer that the API has no authentication", async () => {
    const page = await home();
    expect(text(page, "footer")).toMatch(/no authentication/i);
  });

  it("uses no forbidden word in any rendered text", async () => {
    for (const page of [await home(), await incidentView()])
      expect(page.document.body.textContent).not.toMatch(FORBIDDEN);
  });
});
