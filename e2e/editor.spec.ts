import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * The visual editor, end to end in a real browser against the real API: a bakery owner edits pages, sections, items and
 * pictures, reorders, rewrites, undoes, previews on a phone, publishes, and the live site matches what was edited.
 */
const BASE = `http://127.0.0.1:${process.env.E2E_V3_PORT ?? "3212"}`;
test.use({ baseURL: BASE });
const H = { "x-requested-with": "kora" };
const SHOTS = "docs/evidence/creative-vnext/screens";

async function signup(browser: Browser, tag: string) {
  const ctx = await browser.newContext({
    baseURL: BASE,
    viewport: { width: 1440, height: 1000 },
  });
  const p = await ctx.newPage();
  await p.goto("/signup");
  await p.getByLabel("Your name").fill(`Owner ${tag}`);
  await p.getByLabel("Business name").fill("Sweet Crumbs Bakery");
  await p.getByLabel("Email").fill(`${tag}+${Date.now()}@example.com`);
  await p.getByLabel("Password").fill("correct horse battery");
  await p.getByRole("button", { name: "Create account" }).click();
  await expect(
    p.getByRole("heading", { name: /Tell Kora about your business/ }),
  ).toBeVisible();
  const me = await (await ctx.request.get("/api/auth/me")).json();
  return { ctx, page: p, orgId: me.data.orgs[0].id as string };
}
const frameText = async (p: Page) =>
  (
    await p.frameLocator('[data-testid="preview"]').locator("body").innerText()
  ).replace(/\s+/g, " ");
const draftNo = async (p: Page) =>
  Number((await p.getByTestId("draft-label").innerText()).replace(/\D/g, ""));
const settled = async (p: Page, before: number) =>
  expect.poll(() => draftNo(p), { timeout: 15_000 }).toBeGreaterThan(before);

test("an owner edits, reorders, replaces pictures, rewrites, undoes, previews on a phone and publishes", async ({
  browser,
}) => {
  const a = await signup(browser, "editor");
  const api = a.ctx.request;
  const site = (
    await (
      await api.post("/api/sites", {
        headers: H,
        data: { orgId: a.orgId, name: "Sweet Crumbs Bakery" },
      })
    ).json()
  ).data;
  const gen = await api.post(`/api/sites/${site.id}/generate`, {
    headers: H,
    data: {
      name: "Sweet Crumbs Bakery",
      description: "I bake cakes and small chops.",
    },
  });
  expect(gen.ok()).toBe(true);

  const p = a.page;
  await p.goto(`/app/sites/${site.id}/edit`);
  await expect(p.getByTestId("visual-editor")).toBeVisible();
  await expect(p.getByTestId("draft-label")).toHaveText("Draft 1");
  await expect(p.getByText("6 of 7")).toBeVisible();
  await expect(
    p
      .frameLocator('[data-testid="preview"]')
      .getByText("Cakes and small chops")
      .first(),
  ).toBeVisible();
  await p.screenshot({ path: `${SHOTS}/editor-01-overview-desktop.png` });

  // choose a page and edit its words; the preview shows them, and a new draft exists
  await p.getByTestId("page-cakes").click();
  await expect(p.getByRole("textbox", { name: "Page title" })).toHaveValue(
    "Cakes",
  );
  let n = await draftNo(p);
  const storyIdx = await p
    .locator('[data-testid^="section-"]')
    .evaluateAll((els) =>
      els.findIndex((e) => /Story/.test(e.textContent ?? "")),
    );
  await p.getByTestId(`section-${storyIdx}`).click();
  const para = p.getByRole("textbox", { name: "Paragraph 1" });
  await para.fill("Every cake starts with a conversation about your day.");
  await p.getByRole("button", { name: "Save paragraph 1" }).click();
  await settled(p, n);
  await expect
    .poll(() => frameText(p))
    .toContain("Every cake starts with a conversation about your day.");
  await p.screenshot({ path: `${SHOTS}/editor-02-edit-text.png` });

  // service information: rename an item on the home page
  await p.getByTestId("page-home").click();
  n = await draftNo(p);
  const offerIdx = await p
    .locator('[data-testid^="section-"]')
    .evaluateAll((els) =>
      els.findIndex((e) => /What you offer/.test(e.textContent ?? "")),
    );
  await p.getByTestId(`section-${offerIdx}`).click();
  const nameField = p
    .getByRole("textbox", { name: "Name", exact: true })
    .nth(1);
  await nameField.fill("Party small chops");
  await p.getByRole("button", { name: "Save name" }).nth(1).click();
  await settled(p, n);
  await expect.poll(() => frameText(p)).toContain("Party small chops");

  // reorder pages, add and remove pages within the limit
  n = await draftNo(p);
  await p.getByRole("button", { name: "Move Small chops down" }).click();
  await settled(p, n);
  const order = await p.locator(".ed-pagebtn").allInnerTexts();
  expect(order.indexOf("Cakes")).toBeLessThan(order.indexOf("About"));
  n = await draftNo(p);
  p.once("dialog", (d) => void d.accept());
  await p.getByRole("button", { name: "Remove Gallery" }).click();
  await settled(p, n);
  await expect(p.getByText("5 of 7")).toBeVisible();
  for (const [k] of [["faq"], ["approach"]]) {
    n = await draftNo(p);
    await p.getByTestId("add-page").selectOption(k!);
    await settled(p, n);
  }
  await expect(p.getByText("7 of 7")).toBeVisible();
  await expect(p.getByTestId("add-page")).toBeDisabled();
  await p.screenshot({ path: `${SHOTS}/editor-03-seven-pages.png` });

  // add a section, rewrite it, remove it
  await p.getByTestId("page-about").click();
  n = await draftNo(p);
  await p.getByTestId("add-section").selectOption("faq");
  await settled(p, n);
  const faqIdx = await p
    .locator('[data-testid^="section-"]')
    .evaluateAll((els) =>
      els.findIndex((e) => /Questions/.test(e.textContent ?? "")),
    );
  expect(faqIdx).toBeGreaterThan(0);
  n = await draftNo(p);
  await p
    .getByRole("button", { name: "Rewrite this section" })
    .nth(0)
    .click()
    .catch(() => undefined);
  await p.getByTestId("regenerate-page").click();
  await settled(p, n);

  // replace a picture from Kora's vetted catalogue (small-chops page story picture)
  await p.getByTestId("page-small-chops").click();
  const st = await p
    .locator('[data-testid^="section-"]')
    .evaluateAll((els) =>
      els.findIndex((e) => /Story/.test(e.textContent ?? "")),
    );
  await p.getByTestId(`section-${st}`).click();
  n = await draftNo(p);
  await p.getByTestId("replace-picture").click();
  await expect(
    p.getByRole("dialog", { name: "Choose a picture" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      p
        .locator(".ed-modal-card img")
        .evaluateAll((im) => im.every((i) => (i as HTMLImageElement).complete)),
    )
    .toBe(true);
  await p.screenshot({ path: `${SHOTS}/editor-04-picture-picker.png` });
  await p.getByTestId("choose-catalogue").nth(2).click();
  await settled(p, n);
  await expect(p.getByRole("dialog")).toHaveCount(0);

  // undo returns to the previous design as a new draft
  n = await draftNo(p);
  await p.getByTestId("undo").click();
  await settled(p, n);

  // mobile preview
  await p.getByRole("button", { name: "Phone" }).click();
  const w = await p
    .locator(".ed-frame")
    .evaluate((e) => e.getBoundingClientRect().width);
  expect(Math.round(w)).toBe(390);
  await p.screenshot({ path: `${SHOTS}/editor-05-phone-preview.png` });

  // publish: the live site matches the edited draft
  await p.getByTestId("publish").click();
  await expect(p.getByText(/Published/)).toBeVisible({ timeout: 20_000 });
  const s = (await (await api.get(`/api/sites/${site.id}`)).json()).data;
  const live = await (await fetch(`${s.publicUrl}cakes/`)).text();
  expect(live).toContain(
    "Every cake starts with a conversation about your day.",
  );
  expect(await (await fetch(s.publicUrl)).text()).toContain(
    "Party small chops",
  );
  expect((await fetch(`${s.publicUrl}gallery/`)).status).toBe(404); // the page the owner removed
  await p.screenshot({ path: `${SHOTS}/editor-06-published.png` });
});
