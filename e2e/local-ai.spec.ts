import { expect, test } from "@playwright/test";

/**
 * Chrome's built-in Prompt API is not available in CI's Chromium, so this stubs the documented
 * surface (LanguageModel.availability/create/prompt) and proves Kora's side end to end: the
 * checkbox appears only when the API reports it, the answer is sent to the server, validated,
 * and shapes the real generated site. Without the stub the flow must work with no AI at all.
 */
const STUB = `
  window.__aiCalls = [];
  window.LanguageModel = {
    availability: async () => "available",
    create: async (o) => ({
      prompt: async (input, opts) => {
        window.__aiCalls.push({ input, hasSchema: !!opts.responseConstraint, system: o.initialPrompts[0].content.slice(0, 40) });
        return JSON.stringify({
          understanding: { industry: "Laundry", audience: "Households", offering: "Pickup and delivery", tone: "friendly" },
          strategy: { positioning: "Easy laundry", keyMessage: "We collect, you relax" },
          architecture: { lookId: "soft-friendly", rationale: "Warm and friendly" },
          design: { paletteStrategy: "sunrise", personality: ["warm"], rationale: "Warm sunrise colours" },
          content: {},
          media: { art: "waves" },
        });
      },
      destroy() {},
    }),
  };
`;

async function signUpAndDescribe(page: import("@playwright/test").Page) {
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Ada");
  await page.getByLabel("Business name").fill("Ada Laundry");
  await page.getByLabel("Email").fill(`ada+${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(
    page.getByRole("heading", { name: /Tell Kora about your business/ }),
  ).toBeVisible();
  await page.getByLabel("Business name").fill("Ada Laundry");
  await page
    .getByLabel(/What do you do/)
    .fill(
      "Laundry in Lagos. We provide pickup and delivery, dry cleaning and ironing.",
    );
  await page.getByRole("button", { name: "Show me three designs" }).click();
  await expect(
    page.getByRole("heading", { name: /Pick a direction/ }),
  ).toBeVisible({ timeout: 20_000 });
}

test("on-device AI (stubbed Prompt API) shapes the site; Kora validates it", async ({
  page,
}) => {
  await page.addInitScript(STUB);
  await signUpAndDescribe(page);
  const box = page.getByLabel(/Use AI on this device/);
  await expect(box).toBeChecked();
  await page.getByRole("button", { name: "Choose for me" }).click();
  await expect(page.getByRole("tab", { name: "Ask Kora" })).toBeVisible({
    timeout: 30_000,
  });
  const calls = await page.evaluate(
    () =>
      (
        window as unknown as {
          __aiCalls: Array<{ hasSchema: boolean; system: string }>;
        }
      ).__aiCalls,
  );
  expect(calls).toHaveLength(1);
  expect(calls[0]!.hasSchema).toBe(true);
  await page.getByRole("tab", { name: "Design" }).click();
  await expect(page.getByRole("button", { name: "Sunrise" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("with no on-device AI the same flow works and offers no AI option", async ({
  page,
}) => {
  await page.addInitScript(
    `window.LanguageModel = { availability: async () => "unavailable" };`,
  );
  await signUpAndDescribe(page);
  await expect(page.getByLabel(/Use AI on this device/)).toHaveCount(0);
  await page.getByRole("button", { name: "Choose for me" }).click();
  await expect(page.getByRole("tab", { name: "Ask Kora" })).toBeVisible({
    timeout: 30_000,
  });
});
