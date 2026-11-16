import { expect, test } from "@playwright/test";
const BASE = `http://127.0.0.1:${process.env.E2E_V3_PORT ?? "3212"}`;
const headers = { "x-requested-with": "kora" };
test.use({ baseURL: BASE });
test("customer manages pages in Website Studio with immutable drafts and real preview", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const ctx = await browser.newContext({ baseURL: BASE });
  const page = await ctx.newPage();
  try {
    await page.goto("/signup");
    const token = Date.now().toString(36);
    await page.getByLabel("Your name").fill("Studio Test Owner");
    await page.getByLabel("Business name").fill("Meridian Bakes");
    await page.getByLabel("Email").fill(`kora-studio-${token}@example.com`);
    await page.getByLabel("Password").fill("correct horse battery");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(
      page.getByRole("heading", { name: /Tell Kora about your business/ }),
    ).toBeVisible();
    const me = (await (await ctx.request.get("/api/auth/me")).json()).data;
    const created = await ctx.request.post("/api/sites", {
      headers,
      data: { orgId: me.orgs[0].id, name: "Meridian Bakes" },
    });
    expect(created.status()).toBe(201);
    const siteId = (await created.json()).data.id as string;
    const made = await ctx.request.post(`/api/sites/${siteId}/generate`, {
      headers,
      data: {
        name: "Meridian Bakes",
        description:
          "We prepare sourdough breads, fresh pastries and custom cakes for local customers.",
        services: ["Sourdough", "Pastries", "Cakes"],
        whatsapp: "+2348012345678",
        industry: "bakery",
      },
    });
    expect(made.status()).toBe(201);
    const original = (await made.json()).data.version.id as string;
    await page.goto(`/app/sites/${siteId}/website-studio`);
    await expect(
      page.getByRole("heading", { name: "Visual website editor" }),
    ).toBeVisible();
    await expect(
      page.getByText("Up to seven complete pages.", { exact: false }),
    ).toBeVisible();
    await page.getByLabel("New page title").fill("Our Methods");
    await page.getByRole("button", { name: "Add page" }).click();
    await expect(
      page.getByRole("button", { name: "Our Methods" }),
    ).toBeVisible();
    const site = (await (await ctx.request.get(`/api/sites/${siteId}`)).json())
      .data;
    expect(site.currentVersionId).not.toBe(original);
    const saved = (
      await (
        await ctx.request.get(
          `/api/sites/${siteId}/versions/${site.currentVersionId}`,
        )
      ).json()
    ).data;
    expect(
      saved.spec.pages.some((p: { slug: string }) => p.slug === "our-methods"),
    ).toBe(true);
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Our Methods" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Actual saved preview" }).click();
    await expect(page.getByTitle(/Saved website preview/)).toBeVisible();
    // Local test Site Host lifecycle: older version, new draft, then restore.
    const firstPublish = await ctx.request.post(
      "/api/sites/" + siteId + "/versions/" + original + "/publish",
      {headers},
    );
    expect(firstPublish.ok()).toBe(true);
    const newPublish = await ctx.request.post(
      "/api/sites/" + siteId + "/versions/" + site.currentVersionId + "/publish",
      {headers},
    );
    expect(newPublish.ok()).toBe(true);
    const publicUrl = (await newPublish.json()).data.publicUrl as string;
    expect(publicUrl).toMatch(/^https?:/);
    expect((await ctx.request.get(publicUrl)).status()).toBe(200);
    const restore = await ctx.request.post(
      "/api/sites/" + siteId + "/versions/" + original + "/rollback",
      {headers},
    );
    expect(restore.ok()).toBe(true);

    await expect(
      page.getByRole("link", { name: "Versions & publish" }),
    ).toBeVisible();
  } finally {
    await ctx.close();
  }
});
