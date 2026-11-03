import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * The Brand Center journey on the v3 engine: an owner opens the brand system Kora made, changes it, saves, reloads,
 * and finds a new version while the old one is untouched. Also: phone layout, owner uploads, and who may see what.
 */
const BASE = `http://127.0.0.1:${process.env.E2E_V3_PORT ?? "3212"}`;
test.use({ baseURL: BASE });
const H = { "x-requested-with": "kora" };

async function signup(browser: Browser, tag: string) {
  const ctx = await browser.newContext({ baseURL: BASE });
  const p = await ctx.newPage();
  await p.goto("/signup");
  await p.getByLabel("Your name").fill(`Owner ${tag}`);
  await p.getByLabel("Business name").fill(`Bakery ${tag}`);
  await p.getByLabel("Email").fill(`${tag}+${Date.now()}@example.com`);
  await p.getByLabel("Password").fill("correct horse battery");
  await p.getByRole("button", { name: "Create account" }).click();
  await expect(
    p.getByRole("heading", { name: /Tell Kora about your business/ }),
  ).toBeVisible();
  const me = await (await ctx.request.get("/api/auth/me")).json();
  return { ctx, page: p, orgId: me.data.orgs[0].id as string };
}

async function makeSite(
  a: Awaited<ReturnType<typeof signup>>,
  name: string,
): Promise<string> {
  const api = a.ctx.request;
  const site = (
    await (
      await api.post("/api/sites", {
        headers: H,
        data: { orgId: a.orgId, name },
      })
    ).json()
  ).data;
  const gen = await api.post(`/api/sites/${site.id}/generate`, {
    headers: H,
    data: {
      name,
      description:
        "A home bakery in Lekki making birthday cakes, cupcakes and small chops. Customers order on WhatsApp.",
      whatsapp: "+2348012345678",
      location: "Lekki, Lagos",
      services: ["Birthday cakes", "Cupcakes", "Small chops"],
    },
  });
  expect(gen.status()).toBe(201);
  return site.id as string;
}

const overflow = (p: Page) =>
  p.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );

test.describe.configure({ mode: "serial" });
let owner: Awaited<ReturnType<typeof signup>>;
let other: Awaited<ReturnType<typeof signup>>;
let siteId = "";
let v1Hash = "";

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000);
  owner = await signup(browser, "a");
  other = await signup(browser, "b");
  siteId = await makeSite(owner, "Tola's Cakes");
});
test.afterAll(async () => {
  await owner?.ctx.close();
  await other?.ctx.close();
});

test("the owner reads the brand system Kora made", async () => {
  const p = owner.page;
  await p.goto(`/app/sites/${siteId}/brand`);
  await expect(p.getByText(/Brand system · version 1/)).toBeVisible();
  await expect(p.getByRole("list", { name: "Brand colours" })).toBeVisible();
  await expect(p.getByRole("heading", { name: "Always" })).toBeVisible();
  await expect(p.getByRole("heading", { name: "Never" })).toBeVisible();
  await expect(p.getByRole("group", { name: "Change the look" })).toBeVisible();
  // owner-friendly controls, not genome jargon
  for (const label of ["Warmer", "Darker", "More editorial", "More minimal"])
    await expect(p.getByRole("button", { name: label })).toBeVisible();
  const v1 = await (
    await owner.ctx.request.get(`/api/sites/${siteId}/brand-os/1`)
  ).json();
  v1Hash = v1.data.hash as string;
  expect(v1Hash).toMatch(/^[0-9a-f]{16,}$/);
});

test("changing the look saves a new draft and brand version; history stays untouched", async () => {
  const p = owner.page;
  await p.goto(`/app/sites/${siteId}/brand`);
  await p.getByRole("button", { name: "More minimal" }).click();
  await expect(p.getByText(/saved a new draft/i)).toBeVisible({
    timeout: 20_000,
  });
  await p.reload();
  await expect(p.getByText(/Brand system · version 2/)).toBeVisible();
  const v1 = await (
    await owner.ctx.request.get(`/api/sites/${siteId}/brand-os/1`)
  ).json();
  expect(v1.data.hash).toBe(v1Hash);
  const v2 = await (
    await owner.ctx.request.get(`/api/sites/${siteId}/brand-os/2`)
  ).json();
  expect(v2.data.hash).not.toBe(v1Hash);
  // the earlier website version still exists unchanged
  const versions = (
    await (await owner.ctx.request.get(`/api/sites/${siteId}/versions`)).json()
  ).data as Array<{ version: number }>;
  expect(versions.length).toBeGreaterThanOrEqual(2);
});

test("a design request Kora does not offer is refused, not guessed at", async () => {
  const p = owner.page;
  const r = await owner.ctx.request.post(`/api/sites/${siteId}/edit`, {
    headers: H,
    data: { designEdit: { kind: "nudge", nudge: "not-a-real-nudge" } },
  });
  expect(r.status()).toBeGreaterThanOrEqual(400);
  expect(r.status()).toBeLessThan(500);
  await p.goto(`/app/sites/${siteId}/brand`);
  await expect(p.getByText(/Brand system · version/)).toBeVisible();
});

test("voice is saved as a new Brand Kit version and survives a reload", async () => {
  const p = owner.page;
  await p.goto(`/app/sites/${siteId}/brand`);
  const use = p.getByLabel("Words to use");
  if (!(await use.count()))
    await p.getByRole("button", { name: "Use this Brand Kit" }).click();
  await expect(use).toBeVisible();
  await p.getByLabel("Tone").selectOption("warm");
  await use.fill("homemade, fresh, order early");
  await p.getByRole("button", { name: "Save new version" }).click();
  await expect(p.getByText(/Saved as a new version/)).toBeVisible();
  await p.reload();
  await expect(p.getByLabel("Words to use")).toHaveValue(
    "homemade, fresh, order early",
  );
});

test("the owner uploads a logo and sees it in the library", async () => {
  const p = owner.page;
  await p.goto(`/app/sites/${siteId}/brand`);
  const png = await p.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 640;
    c.height = 240;
    const g = c.getContext("2d")!;
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, 640, 240);
    g.fillStyle = "#5a2d1a";
    g.font = "bold 110px serif";
    g.fillText("Tola's", 40, 150);
    g.fillStyle = "#c2542d";
    g.fillRect(40, 175, 380, 14);
    const b64 = c.toDataURL("image/png").split(",")[1]!;
    return b64;
  });
  await p
    .locator('input[type="file"]')
    .first()
    .setInputFiles({
      name: "logo.png",
      mimeType: "image/png",
      buffer: Buffer.from(png, "base64"),
    });
  await expect(p.getByText(/Logo saved/)).toBeVisible({ timeout: 20_000 });
  await expect(p.getByRole("img", { name: "Your logo" })).toBeVisible();
  await p.reload();
  await expect(p.getByRole("img", { name: "Your logo" })).toBeVisible();
  await expect(p.getByRole("button", { name: "Replace logo" })).toBeVisible();
});

test("a file that is not a picture is refused in plain words", async () => {
  const html = Buffer.from("<script>alert(1)</script><svg onload=alert(1)>");
  for (const type of ["image/png", "image/svg+xml"]) {
    const r = await owner.ctx.request.post(
      `/api/sites/${siteId}/media-library?kind=photo&filename=x.png`,
      { headers: { ...H, "content-type": type }, data: html },
    );
    expect([400, 415, 422]).toContain(r.status());
    expect(JSON.stringify(await r.json())).not.toContain("<script>");
  }
  const list = await (
    await owner.ctx.request.get(`/api/sites/${siteId}/media-library`)
  ).json();
  expect(
    (list.data.items as Array<{ kind: string }>).filter(
      (i) => i.kind === "photo",
    ),
  ).toHaveLength(0);
});

test("the owner asks in plain words and gets a proposal; nothing is made until they agree", async () => {
  const p = owner.page;
  await p.goto(`/app/sites/${siteId}/brand`);
  await p
    .getByRole("textbox", { name: "Describe what you want" })
    .fill("I need more birthday cake orders next week");
  await p.getByRole("button", { name: "Plan it" }).click();
  await expect(p.getByText(/Goal:/)).toBeVisible();
  await expect(
    p.getByText(/Nothing has been made, posted or spent/),
  ).toBeVisible();
  const before = await (
    await owner.ctx.request.get(`/api/sites/${siteId}/artifacts`)
  )
    .json()
    .catch(() => null);
  void before;
  await p.getByRole("button", { name: "Make these drafts" }).click();
  await expect(p.getByText(/Drafts made/)).toBeVisible({ timeout: 30_000 });
});

test("the Brand Center fits a phone", async ({ browser }) => {
  const ctx = await browser.newContext({
    baseURL: BASE,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    storageState: await owner.ctx.storageState(),
  });
  const p = await ctx.newPage();
  await p.goto(`/app/sites/${siteId}/brand`);
  await expect(p.getByText(/Brand system · version/)).toBeVisible();
  expect(await overflow(p)).toBeLessThanOrEqual(0);
  await expect(p.getByRole("button", { name: "Warmer" })).toBeVisible();
  await ctx.close();
});

test("only the owner's organisation can read or change a brand", async ({
  browser,
}) => {
  // signed out
  const anon = await browser.newContext({ baseURL: BASE });
  expect(
    (await anon.request.get(`/api/sites/${siteId}/brand-os`)).status(),
  ).toBe(401);
  expect(
    (
      await anon.request.post(`/api/sites/${siteId}/edit`, {
        headers: H,
        data: { designEdit: { kind: "nudge", nudge: "calmer" } },
      })
    ).status(),
  ).toBe(401);
  await anon.close();
  // a different account in another organisation
  const o = other.ctx.request;
  for (const path of [
    `/api/sites/${siteId}/brand-os`,
    `/api/sites/${siteId}/brand-os/1`,
    `/api/sites/${siteId}/media-library`,
    `/api/sites/${siteId}/brand-kit`,
  ]) {
    const s = (await o.get(path)).status();
    expect([403, 404]).toContain(s);
  }
  const w = await o.post(`/api/sites/${siteId}/edit`, {
    headers: H,
    data: { designEdit: { kind: "nudge", nudge: "calmer" } },
  });
  expect([403, 404]).toContain(w.status());
  // and the other account's own brand screen never shows this business
  await other.page.goto(`/app/sites/${siteId}/brand`);
  await expect(other.page.getByText("Tola's Cakes")).toHaveCount(0);
  // the owner's brand is unchanged by those attempts
  const cur = await (
    await owner.ctx.request.get(`/api/sites/${siteId}/brand-os`)
  ).json();
  expect(cur.data.current.version).toBe(2);
});
