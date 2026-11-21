import { expect, test } from "@playwright/test";

const BASE = `http://127.0.0.1:${process.env.E2E_V3_PORT ?? "3212"}`;
test.use({ baseURL: BASE });

test("Meridian Bakes remembers a rejected style and changes the next design direction", async ({
  page,
  context,
}) => {
  test.setTimeout(100_000);
  await page.goto("/signup");
  const token = Date.now().toString(36);
  await page.getByLabel("Your name").fill("Memory Test Owner");
  await page.getByLabel("Business name").fill("Meridian Bakes");
  await page.getByLabel("Email").fill(`design-memory-${token}@example.com`);
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(
    page.getByRole("heading", { name: /Tell Krevstudio about your business/ }),
  ).toBeVisible();
  const auth = await context.request.get("/api/auth/me");
  expect(auth.status()).toBe(200);
  const me = (await auth.json()).data;
  const created = await context.request.post("/api/sites", {
    headers: { "x-requested-with": "kora" },
    data: { orgId: me.orgs[0].id, name: "Meridian Bakes" },
  });
  expect(created.status()).toBe(201);
  const siteId = (await created.json()).data.id;

  await page.goto(`/app/sites/${siteId}/creative-studio`);
  await expect(page.getByRole("heading", { name: "Creative workspace" })).toBeVisible();
  await page.getByLabel("Format").selectOption("flyer");
  await page.getByLabel("Project title").fill("Christmas bakery launch");
  await page.getByLabel("Headline or wordmark").fill("Christmas cakes baked to order");
  await page.getByRole("button", { name: "Explore three real directions" }).click();
  const choices = page.getByRole("group", {
    name: "Real creative direction previews",
  });
  await expect(choices.getByRole("button", { name: "Always avoid" })).toHaveCount(3);
  await choices.getByRole("button", { name: "Always avoid" }).first().click();
  await expect(page.getByText(/visual restriction was saved/)).toBeVisible();
  await page.reload();
  await page.getByLabel("Format").selectOption("flyer");
  await page.getByLabel("Project title").fill("Second bakery campaign");
  await page.getByLabel("Headline or wordmark").fill("New pastries every morning");
  await page.getByRole("button", { name: "Explore three real directions" }).click();
  await expect(
    page.getByText("Why this direction: An owner-locked rejected visual direction was avoided."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Concept 2 — Selected" })).toBeVisible();
});
