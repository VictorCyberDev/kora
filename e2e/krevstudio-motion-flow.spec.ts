import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

const BASE = `http://127.0.0.1:${process.env.E2E_V3_PORT ?? "3212"}`;
test.use({ baseURL: BASE, acceptDownloads: true });

test("Meridian Bakes edits, persists, restores and exports a real motion timeline", async ({
  page,
  context,
}) => {
  test.setTimeout(200_000);
  await page.goto("/signup");
  const token = Date.now().toString(36);
  await page.getByLabel("Your name").fill("Motion Test Owner");
  await page.getByLabel("Business name").fill("Meridian Bakes");
  await page.getByLabel("Email").fill(`motion-${token}@example.com`);
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Create account" }).click();
  // Wait for signup to finish and the browser session to be established
  // before making authenticated API requests from the same context.
  await expect(
    page.getByRole("heading", { name: /Tell Krevstudio about your business/ }),
  ).toBeVisible();
  const session = await context.request.get("/api/auth/me");
  expect(session.status()).toBe(200);
  const me = (await session.json()).data;
  expect(me?.orgs?.length).toBeGreaterThan(0);
  const created = await context.request.post("/api/sites", {
    headers: { "x-requested-with": "kora" },
    data: { orgId: me.orgs[0].id, name: "Meridian Bakes" },
  });
  const siteId = (await created.json()).data.id;
  expect(
    (
      await context.request.post(`/api/sites/${siteId}/generate`, {
        headers: { "x-requested-with": "kora" },
        data: {
          name: "Meridian Bakes",
          description:
            "Artisan sourdough, celebration cakes and Christmas pre-orders in Lagos.",
          industry: "bakery",
          services: ["Sourdough", "Pastries", "Custom cakes"],
          whatsapp: "+2348012345678",
        },
      })
    ).status(),
  ).toBe(201);
  expect(
    (
      await context.request.post(`/api/sites/${siteId}/presence/import`, {
        headers: { "x-requested-with": "kora" },
      })
    ).status(),
  ).toBe(201);
  expect(
    (
      await context.request.post(`/api/sites/${siteId}/brand-kit`, {
        headers: { "x-requested-with": "kora" },
        data: { from: "site" },
      })
    ).status(),
  ).toBe(201);

  await page.goto(`/app/sites/${siteId}/create`);
  await page.getByRole("button", { name: "Video" }).click();
  await expect(
    page.getByRole("heading", { name: "From brief to editable timeline" }),
  ).toBeVisible();
  await page
    .getByLabel("Describe the video")
    .fill("Christmas cake pre-orders for Meridian Bakes");
  await page.getByLabel("Video format").selectOption("square");
  await page.getByRole("button", { name: "Generate directions" }).click();
  await page.getByRole("button", { name: /Editorial reveal/ }).click();
  const scenes = page.getByRole("group", { name: "Scenes" });
  await expect(scenes).toBeVisible();
  await scenes.getByRole("button", { name: /^1\./ }).click();
  await page.getByRole("button", { name: /1. text/ }).click();
  await page
    .getByLabel("Text", { exact: true })
    .fill("Christmas cakes, baked to order");
  await page.getByLabel("Duration").fill("2.5");
  await page.getByLabel("Transition").selectOption("slide");
  await page.getByLabel("Motion preset").selectOption("kinetic-type");
  await page.getByRole("button", { name: "Add graphic" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/Saved revision 1/)).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Video" }).click();
  await page.getByLabel("Open motion project").selectOption({ index: 1 });
  await expect(
    page.getByDisplayValue("Christmas cakes, baked to order"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Preview frames" }).click();
  await expect(page.getByAltText("Timeline preview")).toBeVisible();
  await page.getByRole("button", { name: "Play preview" }).click();
  await expect(
    page.getByRole("button", { name: "Pause preview" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/Saved revision 2/)).toBeVisible();
  await page.getByRole("button", { name: "Restore" }).last().click();
  await expect(page.getByText(/Restored as revision/)).toBeVisible();

  const coverEvent = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download cover" }).click();
  const cover = await coverEvent;
  const coverBytes = await readFile(await cover.path());
  expect([...coverBytes.subarray(0, 8)]).toEqual([
    137, 80, 78, 71, 13, 10, 26, 10,
  ]);

  const captionsEvent = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download captions" }).click();
  const captions = await captionsEvent;
  expect(await readFile(await captions.path(), "utf8")).toContain("-->");

  await page.getByRole("button", { name: "Export MP4" }).click();
  await expect(page.getByText(/MP4 export queued/)).toBeVisible();
  let job: { status: string; assetId?: string } | undefined;
  for (let attempt = 0; attempt < 90; attempt++) {
    const response = await context.request.get(`/api/sites/${siteId}/motion`);
    const jobs = (await response.json()).data as Array<{
      status: string;
      assetId?: string;
      projectId?: string;
    }>;
    job = jobs.find((item) => item.projectId);
    if (job && ["READY", "FAILED"].includes(job.status)) break;
    await page.waitForTimeout(1000);
  }
  expect(job?.status).toBe("READY");
  const video = await context.request.get(
    `/api/sites/${siteId}/assets/${job?.assetId}/file`,
  );
  expect(video.status()).toBe(200);
  const mp4 = Buffer.from(await video.body());
  expect(mp4.subarray(4, 8).toString()).toBe("ftyp");
});
