import { expect, test } from "@playwright/test";

const BASE = `http://127.0.0.1:${process.env.E2E_V3_PORT ?? "3212"}`;
test.use({ baseURL: BASE });

test("video-first business creates facts and Brand Kit without creating a website", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await page.goto("/signup?goal=video");
  await expect(page.getByLabel("First creative goal")).toHaveValue("video");
  const token = Date.now().toString(36);
  await page.getByLabel("Your name").fill("Video First Owner");
  await page.getByLabel("Business name").fill("Meridian Bakes");
  await page.getByLabel("Email").fill(`video-first-${token}@example.com`);
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/app\/sites\/[^/]+\/presence\?goal=video$/);
  const siteId = new URL(page.url()).pathname.split("/")[3];
  await expect(page.getByRole("form", { name: "Start business profile" })).toBeVisible();
  await page.getByLabel("Industry").fill("Bakery");
  await page.getByLabel("What your business does").fill("We bake celebration cakes.");
  await page.getByRole("button", { name: "Save business brief" }).click();
  await expect(page.getByRole("link", { name: "Continue to Brand Kit" })).toBeVisible();
  await page.getByRole("link", { name: "Continue to Brand Kit" }).click();
  await expect(page.getByRole("heading", { name: "Start with your own brand preferences" })).toBeVisible();
  await page.getByRole("button", { name: "Create editable Brand Kit" }).click();
  await expect(page.getByRole("link", { name: "Create my first video" })).toBeVisible();
  await page.getByRole("link", { name: "Create my first video" }).click();
  await expect(page).toHaveURL(/\/create\?tool=video$/);
  await expect(page.getByRole("button", { name: "Video" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "From brief to editable timeline" })).toBeVisible();

  const site = await context.request.get(`/api/sites/${siteId}`);
  expect(site.status()).toBe(200);
  const data = (await site.json()).data;
  expect(data.publishedVersionId).toBeNull();
  expect(data.currentVersionId).toBeNull();
});
