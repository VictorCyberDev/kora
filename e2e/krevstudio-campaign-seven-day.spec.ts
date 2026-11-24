import { expect, test } from "@playwright/test";

const BASE = `http://127.0.0.1:${process.env.E2E_V3_PORT ?? "3212"}`;
test.use({ baseURL: BASE });

test("Meridian Bakes creates a seven-day editable campaign with approval and manual handoff", async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  await page.goto("/signup");
  const token = Date.now().toString(36);
  await page.getByLabel("Your name").fill("Campaign Test Owner");
  await page.getByLabel("Business name").fill("Meridian Bakes");
  await page.getByLabel("Email").fill(`seven-day-${token}@example.com`);
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(
    page.getByRole("heading", { name: /Tell Krevstudio about your business/ }),
  ).toBeVisible();

  const session = await context.request.get("/api/auth/me");
  expect(session.status()).toBe(200);
  const org = (await session.json()).data.orgs[0];
  const site = await context.request.post("/api/sites", {
    headers: { "x-requested-with": "kora" },
    data: { orgId: org.id, name: "Meridian Bakes" },
  });
  expect(site.status()).toBe(201);
  const siteId = (await site.json()).data.id;
  const create = await context.request.post(`/api/sites/${siteId}/generate`, {
    headers: { "x-requested-with": "kora" },
    data: {
      name: "Meridian Bakes",
      description:
        "Sourdough breads, fresh pastries and celebration cakes in Lagos.",
      industry: "bakery",
      services: ["Sourdough", "Celebration cakes"],
      whatsapp: "+2348012345678",
    },
  });
  expect(create.status()).toBe(201);
  const imp = await context.request.post(
    `/api/sites/${siteId}/presence/import`,
    {
      headers: { "x-requested-with": "kora" },
    },
  );
  expect(imp.status()).toBe(201);
  const facts = (await imp.json()).data.facts;
  const saved = await context.request.put(
    `/api/sites/${siteId}/presence/profile`,
    {
      headers: { "x-requested-with": "kora" },
      data: {
        expectedRevision: 1,
        facts: {
          ...facts,
          offer: {
            ...facts.offer,
            offers: [
              {
                id: "christmas-cakes",
                title: "Celebration cake orders",
                detail: "Made-to-order cakes for local customers.",
              },
            ],
          },
        },
      },
    },
  );
  expect(saved.status()).toBe(200);
  expect(
    (
      await context.request.post(`/api/sites/${siteId}/brand-kit`, {
        headers: { "x-requested-with": "kora" },
        data: { from: "site" },
      })
    ).status(),
  ).toBe(201);

  await page.goto(`/app/sites/${siteId}/campaigns`);
  await page.getByRole("button", { name: "New campaign" }).click();
  const form = page.getByRole("form", { name: "New campaign" });
  await form.getByLabel("Name").fill("Meridian seven-day launch");
  await form.getByLabel("Offer").selectOption("christmas-cakes");
  await form.getByLabel("Audience").fill("Local cake and bakery customers");
  await form
    .getByLabel("Campaign brief")
    .fill(
      "Promote confirmed celebration cake availability without invented discounts.",
    );
  const date = (days: number) =>
    new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  await form.getByLabel("Starts").fill(date(1));
  await form.getByLabel("Ends (optional)").fill(date(7));
  await form.getByLabel("Facebook Page").check();
  await form.getByLabel("WhatsApp (you send it)").check();
  await form.getByRole("button", { name: "Build the posts" }).click();
  await expect(page.getByText(/Built 6 scheduled posts/)).toBeVisible();
  await expect(page.getByText("Meridian seven-day launch")).toBeVisible();
  await page.getByRole("button", { name: "Open campaign" }).click();
  const workspace = page.getByRole("region", { name: "Campaign workspace" });
  await expect(
    workspace.getByRole("heading", { name: "Meridian seven-day launch" }),
  ).toBeVisible();
  await expect(
    workspace.getByRole("link", { name: "Edit design" }).first(),
  ).toBeVisible();
  const assetHref = await workspace
    .getByRole("link", { name: "Edit design" })
    .first()
    .getAttribute("href");
  expect(assetHref).toMatch(/\/creative-studio\?document=/);

  await page.getByRole("button", { name: /Approve all 6 posts/ }).click();
  await expect(page.getByText(/you post yourself or fix first/)).toBeVisible();
  const campaigns = await context.request.get(`/api/sites/${siteId}/campaigns`);
  expect(campaigns.status()).toBe(200);
  expect((await campaigns.json()).data[0].published).toBe(0);
});
