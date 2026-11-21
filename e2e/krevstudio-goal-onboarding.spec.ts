import { expect, test } from "@playwright/test";

const BASE = `http://127.0.0.1:${process.env.E2E_V3_PORT ?? "3212"}`;
test.use({ baseURL: BASE });

test("flyer-first signup opens a creative workspace without generating a website", async ({
  page,
  context,
}) => {
  await page.goto("/signup");
  const token = Date.now().toString(36);
  await page.getByLabel("Your name").fill("Flyer Test Owner");
  await page.getByLabel("Business name").fill("Meridian Bakes");
  await page.getByLabel("First creative goal").selectOption("flyer");
  await page.getByLabel("Email").fill(`flyer-first-${token}@example.com`);
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/app\/sites\/[^/]+\/create$/, {
    timeout: 20000,
  });
  const siteId = new URL(page.url()).pathname.split("/")[3];
  const site = await context.request.get(`/api/sites/${siteId}`);
  expect(site.status()).toBe(200);
  const workspace = (await site.json()).data;
  expect(workspace.name).toBe("Meridian Bakes");
  expect(workspace.publishedVersionId).toBeNull();
  expect(workspace.currentVersionId).toBeNull();
});
