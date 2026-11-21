import { expect, test } from "@playwright/test";

const BASE = `http://127.0.0.1:${process.env.E2E_V3_PORT ?? "3212"}`;
test.use({ baseURL: BASE });

test("consenting business enrolls, records feedback and withdraws from pilot", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await page.goto("/signup");
  const token = Date.now().toString(36);
  await page.getByLabel("Your name").fill("Pilot Test Owner");
  await page.getByLabel("Business name").fill("Meridian Bakes");
  await page.getByLabel("Email").fill(`pilot-${token}@example.com`);
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(
    page.getByRole("heading", { name: /Tell Krevstudio about your business/ }),
  ).toBeVisible();

  const me = (await (await context.request.get("/api/auth/me")).json()).data;
  expect(me.orgs).toHaveLength(1);
  const created = await context.request.post("/api/sites", {
    headers: { "x-requested-with": "kora" },
    data: { orgId: me.orgs[0].id, name: "Meridian Bakes" },
  });
  expect(created.status()).toBe(201);
  const siteId = (await created.json()).data.id;

  await page.goto(`/app/sites/${siteId}/pilot`);
  await expect(page.getByRole("heading", { name: "Commercial pilot" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Join the optional product pilot" })).toBeVisible();
  await page.getByLabel("Industry").fill("bakery");
  await page.getByLabel(/I consent to taking part/).check();
  await page.getByRole("button", { name: "Enroll this business" }).click();
  await expect(page.getByText(/Participation consent recorded/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pilot participation" })).toBeVisible();
  await expect(page.getByText("Not verified by this pilot")).toBeVisible();

  await page.getByLabel(/What worked/).fill("I could create my bakery flyer.");
  await page.getByRole("button", { name: "Submit feedback" }).click();
  await expect(page.getByText(/Feedback recorded as owner-reported/)).toBeVisible();

  await page.getByRole("button", { name: "Withdraw pilot consent" }).click();
  await expect(page.getByText(/Participation withdrawn/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Join the optional product pilot" })).toBeVisible();
});
