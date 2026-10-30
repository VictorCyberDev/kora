import { expect, test, type Page } from "@playwright/test";

/** Screenshots are captured only when asked for (E2E_SCREENSHOTS=dir). */
const shot = async (page: Page, name: string) => {
  if (process.env.E2E_SCREENSHOTS)
    await page.screenshot({
      path: `${process.env.E2E_SCREENSHOTS}/${name}.png`,
      fullPage: true,
    });
};

test("a business owner builds, publishes, survives a bad release, and sees verified recovery", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);

  // 1. Landing communicates the product, then sign up.
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Build your website/ }),
  ).toBeVisible();
  await shot(page, "01-landing");
  await page.getByRole("link", { name: "Build my website" }).first().click();
  await page.getByLabel("Your name").fill("Victor");
  await page.getByLabel("Business name").fill("Victor Laundry");
  await page.getByLabel("Email").fill(`victor+${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Create account" }).click();

  // 2. Describe the business; Kora builds a first version.
  await expect(
    page.getByRole("heading", { name: /Tell Kora about your business/ }),
  ).toBeVisible();
  await page.getByLabel("Business name").fill("Victor Laundry");
  await page
    .getByLabel(/What do you do/)
    .fill(
      "Modern laundry in Lagos. We provide pickup and delivery, dry cleaning and ironing.",
    );
  await page.getByLabel(/WhatsApp number/).fill("+2348012345678");
  await page.getByRole("button", { name: "Create my website" }).click();

  // 3. Preview is the stored artifact; edit by asking.
  const preview = page.frameLocator('iframe[title="Website preview"]');
  await expect(
    preview.getByRole("heading", { name: "Victor Laundry" }).first(),
  ).toBeVisible({ timeout: 20_000 });
  await shot(page, "02-build-preview");
  await page.getByRole("button", { name: "Tablet" }).click();
  await page.getByRole("button", { name: "Phone" }).click();
  await page.getByLabel("Your request").fill("Make the primary colour red");
  await page.getByRole("button", { name: "Apply change" }).click();
  await expect(page.getByText(/saved as version 2/)).toBeVisible();

  // 4. Publish version 1, then the edited version 2: a real URL appears.
  await page.getByRole("button", { name: "v1", exact: true }).click();
  await page.getByRole("button", { name: "Publish this version" }).click();
  await expect(page.getByText(/Published: http/)).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "v2", exact: true }).click();
  await page.getByRole("button", { name: "Publish this version" }).click();
  await expect(page.getByText("This version is live")).toBeVisible({
    timeout: 20_000,
  });
  const url = await page.getByText(/Published: http/).innerText();
  const liveUrl = /(http\S+)/.exec(url)![1]!.replace(/ —.*/, "");
  const siteResponse = await context.request.get(liveUrl);
  expect(siteResponse.status()).toBe(200);
  expect(await siteResponse.text()).toContain("Victor Laundry");

  // 5. Kora watches it: the overview says Online.
  await page
    .getByRole("link", { name: "Overview", exact: true })
    .nth(1)
    .click();
  await expect(page.getByText("Online", { exact: true }).first()).toBeVisible({
    timeout: 30_000,
  });

  // 6. Controlled test: the live version fails for real; Kora notices.
  await shot(page, "03-online");
  await expect(page.getByText("Controlled test").first()).toBeVisible();
  await page.getByRole("button", { name: "Start HTTP 500 test" }).click();
  await expect(page.getByText("Needs attention").first()).toBeVisible({
    timeout: 40_000,
  });
  await page.getByRole("link", { name: "See what happened" }).click();

  // 7. Plain-language explanation, honest about what is unknown.
  await expect(
    page
      .getByText(
        "Your website is reachable, but the application is returning an internal error.",
      )
      .first(),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "6. What is still unknown?" }),
  ).toBeVisible();
  await expect(page.getByText(/does not prove/).first()).toBeVisible();
  await expect(
    page.locator("strong", {
      hasText: "Restore the previous healthy version of your website",
    }),
  ).toBeVisible();
  await expect(page.getByText(/needs your approval/).first()).toBeVisible();

  // 8. Approval is required; approve and apply.
  await shot(page, "04-incident-approval");
  await page.getByRole("button", { name: "Approve and apply" }).click();
  // 9. Not "fixed" yet: verifying, then restored only after new checks pass.
  await expect(
    page.getByText(/Fix applied — verifying|Website restored/).first(),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Website restored").first()).toBeVisible({
    timeout: 45_000,
  });
  await expect(
    page
      .getByText(
        /Your website is working again and Kora has verified the recovery/,
      )
      .first(),
  ).toBeVisible();

  await shot(page, "05-restored");
  // 10. Proof mode shows the full chain of evidence.
  await page.getByRole("button", { name: "Proof", exact: true }).click();
  // Proof mode opens the technical evidence by default.
  await expect(
    page.getByText("POLICY_VERSION_CHANGE_NEEDS_APPROVAL").first(),
  ).toBeVisible();
  await expect(page.getByText("RECOVERY_VERIFIED").first()).toBeVisible();
  await page.getByRole("button", { name: "Load Passport" }).click();
  await expect(page.getByText(/kora.incident-passport\/v2/)).toBeVisible();

  await shot(page, "06-proof");
  // 11. Activity log has the trail.
  await page.goto("/app/audit");
  await expect(page.getByText("action.recovery_verified")).toBeVisible();
});

test("public pages render and protected pages require sign-in", async ({
  page,
}) => {
  await page.goto("/pricing");
  await expect(page.getByRole("heading", { name: "Pricing" })).toBeVisible();
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "Privacy" })).toBeVisible();
  await page.goto("/app/sites");
  await expect(page).toHaveURL(/\/login/);
  const anon = await page.request.get("/incidents");
  expect(anon.status()).toBe(401);
});

test("mobile layout has no horizontal overflow", async ({ browser }) => {
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 800 },
  });
  const page = await ctx.newPage();
  for (const path of ["/", "/pricing", "/login"]) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
  await ctx.close();
});
