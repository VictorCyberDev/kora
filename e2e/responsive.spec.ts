import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Kora's own product UI (landing, auth, Mission Control, builder, incident) at the widths people
 * actually use: small phones through desktop. Rules a user would feel: no sideways scrolling, no
 * control or text pushed off-screen, a header that does not eat the screen, touch-sized controls.
 */
const WIDTHS = [320, 360, 390, 412, 600, 768, 1024, 1280] as const;

type Report = {
  docOverflow: number;
  offenders: string[];
  headerH: number | null;
  small: string[];
  clippedText: string[];
};
const probe = (): Report => {
  const iw = window.innerWidth;
  const inScroller = (e: Element) => {
    for (
      let n = e.parentElement;
      n && n !== document.body;
      n = n.parentElement
    ) {
      const o = getComputedStyle(n);
      if (/(auto|scroll)/.test(o.overflowX)) return true;
    }
    return false;
  };
  const offenders: string[] = [];
  for (const e of document.querySelectorAll("body *")) {
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    if (
      !r.width ||
      cs.position === "fixed" ||
      cs.visibility === "hidden" ||
      cs.display === "none" ||
      e.classList.contains("skip")
    )
      continue;
    if (
      (r.right > iw + 1 || r.left < -1) &&
      !inScroller(e) &&
      !e.closest("svg") &&
      !e.closest("iframe") &&
      !e.closest("pre")
    )
      offenders.push(
        `${e.tagName.toLowerCase()}.${String(e.className).slice(0, 30)} [${Math.round(r.left)},${Math.round(r.right)}]`,
      );
  }
  const h = document.querySelector("header.top");
  const touch = iw < 900;
  const small = touch
    ? [
        ...document.querySelectorAll(
          "button, select, input:not([type=checkbox]):not([type=hidden]), summary, nav a, .tabs a, .tabs button",
        ),
      ]
        .filter((e) => {
          const r = e.getBoundingClientRect();
          const cs = getComputedStyle(e);
          return (
            r.width > 0 &&
            cs.visibility !== "hidden" &&
            r.height < 40 &&
            !e.closest("[hidden]")
          );
        })
        .map(
          (e) =>
            `${e.tagName.toLowerCase()}:${(e.textContent || (e as HTMLInputElement).name || "").trim().slice(0, 18)}:${Math.round(e.getBoundingClientRect().height)}`,
        )
        .slice(0, 6)
    : [];
  const clippedText = [
    ...document.querySelectorAll("h1, h2, h3, p, a, button, label, td, th, li"),
  ]
    .filter((e) => {
      const cs = getComputedStyle(e);
      return (
        (cs.overflow === "hidden" || cs.textOverflow === "ellipsis") &&
        (e as HTMLElement).scrollWidth > (e as HTMLElement).clientWidth + 2
      );
    })
    .map((e) => (e.textContent || "").trim().slice(0, 24))
    .slice(0, 4);
  return {
    docOverflow: document.documentElement.scrollWidth - iw,
    offenders: offenders.slice(0, 5),
    headerH: h ? Math.round(h.getBoundingClientRect().height) : null,
    small,
    clippedText,
  };
};

async function check(page: Page, label: string, w: number, problems: string[]) {
  await page.waitForTimeout(450);
  const r = await page.evaluate(probe);
  const bad: string[] = [];
  if (r.docOverflow > 0)
    bad.push(`page scrolls sideways by ${r.docOverflow}px`);
  if (r.offenders.length)
    bad.push(`pushed off-screen: ${r.offenders.join("; ")}`);
  if (w <= 720 && r.headerH !== null && r.headerH > 120)
    bad.push(`header is ${r.headerH}px tall`);
  if (r.small.length) bad.push(`small touch targets: ${r.small.join(", ")}`);
  if (r.clippedText.length)
    bad.push(`clipped text: ${r.clippedText.join(" | ")}`);
  if (bad.length) problems.push(`${label} @${w}px: ${bad.join(" // ")}`);
}

/** Automated WCAG 2.1 A/AA checks on the pages an owner actually uses, at a phone and a desktop width. */
async function a11y(page: Page, label: string, w: number, problems: string[]) {
  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  for (const v of r.violations)
    problems.push(
      `${label} @${w}px a11y ${v.id} (${v.impact}): ${v.nodes
        .slice(0, 2)
        .map((n) => n.target.join(" "))
        .join(" | ")}`,
    );
}

let state: Awaited<
  ReturnType<import("@playwright/test").BrowserContext["storageState"]>
>;
let siteId = "";
let incidentId = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000);
  // one real account with a published site and a real incident, created through the app
  const seed = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const sp = await seed.newPage();
  await sp.goto("/signup");
  await sp.getByLabel("Your name").fill("Resp");
  await sp.getByLabel("Business name").fill("Resp Laundry");
  await sp.getByLabel("Email").fill(`resp+${Date.now()}@example.com`);
  await sp.getByLabel("Password").fill("correct horse battery");
  await sp.getByRole("button", { name: "Create account" }).click();
  await expect(
    sp.getByRole("heading", { name: /Tell Kora about your business/ }),
  ).toBeVisible();
  const api = seed.request;
  const H = { "x-requested-with": "kora" };
  const me = await (await api.get("/api/auth/me")).json();
  const orgId = me.data.orgs[0].id as string;
  const site = (
    await (
      await api.post("/api/sites", {
        headers: H,
        data: { orgId, name: "Resp Laundry" },
      })
    ).json()
  ).data;
  siteId = site.id;
  const gen = (
    await (
      await api.post(`/api/sites/${site.id}/generate`, {
        headers: H,
        data: {
          name: "Resp Laundry",
          description:
            "Laundry in Lagos. We provide pickup and delivery, dry cleaning and ironing.",
          whatsapp: "+2348012345678",
          hours: [{ days: "Mon-Sat", hours: "8am-6pm" }],
        },
      })
    ).json()
  ).data;
  await api.post(`/api/sites/${site.id}/versions/${gen.version.id}/publish`, {
    headers: H,
  });
  const edit = (
    await (
      await api.post(`/api/sites/${site.id}/edit`, {
        headers: H,
        data: {
          baseVersionId: gen.version.id,
          instruction: "Make the primary colour red",
        },
      })
    ).json()
  ).data;
  await api.post(`/api/sites/${site.id}/versions/${edit.version.id}/publish`, {
    headers: H,
  });
  await api.post(`/api/public/sites/${site.id}/forms`, {
    data: {
      name: "Adaeze Okonkwo-Bamidele",
      phone: "+2348055500001",
      message:
        "Good afternoon, I would like a quote for pickup and delivery of about thirty shirts every week, please.",
    },
  });
  await api.post(`/api/sites/${site.id}/presence/import`, { headers: H });
  await api.post(`/api/sites/${site.id}/brand-kit`, {
    headers: H,
    data: { from: "site" },
  });
  await api.post(`/api/sites/${site.id}/chaos`, {
    headers: H,
    data: { mode: "http_500" },
  });
  for (let i = 0; i < 40 && !incidentId; i++) {
    const list = (
      await (await api.get(`/api/sites/${site.id}/incidents`)).json()
    ).data as Array<{ id: string }>;
    incidentId = list[0]?.id ?? "";
    if (!incidentId) await sp.waitForTimeout(1500);
  }
  expect(incidentId).not.toBe("");
  state = await seed.storageState();
  await seed.close();
});

for (const w of WIDTHS) {
  test(`Kora's own UI works at ${w}px`, async ({ browser }) => {
    test.setTimeout(240_000);
    const problems: string[] = [];
    const ctx = await browser.newContext({
      viewport: { width: w, height: 800 },
      isMobile: w < 700,
      hasTouch: w < 900,
      storageState: state,
    });
    const page = await ctx.newPage();
    const pages: Array<[string, string]> = [
      ["landing", "/"],
      ["pricing", "/pricing"],
      ["login", "/login"],
      ["signup", "/signup"],
      ["dashboard", "/app"],
      ["more", "/app/more"],
      ["sites", "/app/sites"],
      ["new-site", "/app/sites/new"],
      ["site-overview", `/app/sites/${siteId}`],
      ["presence", `/app/sites/${siteId}/presence`],
      ["brand", `/app/sites/${siteId}/brand`],
      ["results", `/app/sites/${siteId}/results`],
      ["reviews", `/app/sites/${siteId}/reviews`],
      ["memory", `/app/sites/${siteId}/memory`],
      ["today", `/app/sites/${siteId}/today`],
      ["campaigns", `/app/sites/${siteId}/campaigns`],
      ["create", `/app/sites/${siteId}/create`],
      ["calendar", `/app/sites/${siteId}/calendar`],
      ["channels", `/app/sites/${siteId}/channels`],
      ["customers", `/app/sites/${siteId}/customers`],
      ["builder", `/app/sites/${siteId}/build`],
      ["deployments", `/app/sites/${siteId}/deployments`],
      ["incidents", `/app/sites/${siteId}/incidents`],
      ["incident", `/app/sites/${siteId}/incidents/${incidentId}`],
      ["domain", `/app/sites/${siteId}/domain`],
      ["messages", `/app/sites/${siteId}/messages`],
      ["site-settings", `/app/sites/${siteId}/settings`],
      ["operations", "/app/operations"],
      ["billing", "/app/billing"],
      ["activity", "/app/audit"],
      ["settings", "/app/settings"],
    ];
    for (const [label, url] of pages) {
      await page.goto(url);
      if (label === "builder")
        for (const tab of ["Ask Kora", "Design", "Sections", "Versions"]) {
          await page.getByRole("tab", { name: tab }).click();
          await check(page, `builder/${tab}`, w, problems);
        }
      if (label === "create") {
        await page.getByRole("tab", { name: "Images" }).click();
        await page.getByRole("img", { name: /Preview/ }).waitFor();
        await check(page, "create/images", w, problems);
        await page.getByRole("tab", { name: "Video" }).click();
        await page
          .getByRole("img", { name: /Preview at/ })
          .first()
          .waitFor();
        await check(page, "create/video", w, problems);
      }
      if (label === "customers") {
        await page.locator(".k-lead").first().click();
        await check(page, "customers/open-lead", w, problems);
      }
      if (label === "incident") {
        await page.getByRole("button", { name: "Proof", exact: true }).click();
        await page
          .getByText(/Evidence, decisions and Passport/)
          .first()
          .click()
          .catch(() => undefined);
        await check(page, "incident/proof", w, problems);
        await page.getByRole("button", { name: "Owner", exact: true }).click();
      }
      await check(page, label, w, problems);
      if (
        (w === 390 || w === 1280) &&
        !/^(landing|pricing|login|signup)$/.test(label)
      )
        await a11y(page, label, w, problems);
      if (process.env.RESP_SHOTS)
        await page.screenshot({
          path: `${process.env.RESP_SHOTS}/${w}-${label}.png`,
          fullPage: true,
        });
    }
    await ctx.close();
    expect(problems, problems.join("\n")).toEqual([]);
  });
}
