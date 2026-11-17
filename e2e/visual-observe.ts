/** Inspect a screenshot captured from the live browser plus the same viewport's DOM.
 * Real pixel colors come from a PNG decoded in Chromium, not from design tokens.
 */
import type { Page } from "@playwright/test";
import type { ScreenshotObservation } from "../packages/site-schema/src/v3/visual-qa.js";
export async function observeRenderedScreenshot(
  page: Page,
  pageSlug: string,
  viewport: "mobile" | "tablet" | "desktop",
): Promise<ScreenshotObservation> {
  const view = page.viewportSize();
  if (!view) throw new Error("Screenshot viewport unavailable");
  const png = await page.screenshot({
    clip: { x: 0, y: 0, width: view.width, height: Math.min(view.height, 800) },
    animations: "disabled",
  });
  const imageBase64 = png.toString("base64");
  const evidence = await page.evaluate(async (encoded) => {
    const img = new Image();
    img.src = `data:image/png;base64,${encoded}`;
    await new Promise<void>((resolve, reject) => {
      if (img.complete) {
        img.naturalWidth
          ? resolve()
          : reject(new Error("Screenshot PNG failed to decode"));
        return;
      }
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Screenshot PNG failed to decode"));
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Pixel inspection canvas unavailable");
    ctx.drawImage(img, 0, 0);
    const raw = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const buckets = new Map<string, number>();
    for (let y = 0; y < canvas.height; y += 10)
      for (let x = 0; x < canvas.width; x += 10) {
        const k = (y * canvas.width + x) * 4;
        const bucket = `${raw[k]! >> 5}:${raw[k + 1]! >> 5}:${raw[k + 2]! >> 5}`;
        buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
      }
    const total = [...buckets.values()].reduce((a, b) => a + b, 0);
    const h1 = document.querySelector("h1");
    const rect = h1?.getBoundingClientRect();
    const style = h1 ? getComputedStyle(h1) : null;
    const lineHeight = style ? Number.parseFloat(style.lineHeight) : 0;
    const imageNodes = [...document.querySelectorAll("img")];
    const links = [...document.querySelectorAll("a")];
    const targets = [
      ...document.querySelectorAll("button,a,input,select,textarea"),
    ];
    const hasAction =
      links.some((a) =>
        /^(tel:|mailto:)|wa\.me|\/contact|#contact/.test(
          a.getAttribute("href") ?? "",
        ),
      ) || Boolean(document.querySelector("form"));
    return {
      width: canvas.width,
      height: canvas.height,
      uniqueColorBuckets: buckets.size,
      backgroundFraction: Math.max(...buckets.values()) / Math.max(1, total),
      horizontalOverflowPx: Math.max(
        0,
        document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
      headlineOverflowPx:
        !h1 || !rect
          ? 0
          : Math.max(
              0,
              h1.scrollWidth - h1.clientWidth,
              rect.right - window.innerWidth,
            ),
      headlineLines:
        rect && lineHeight > 0 ? Math.ceil(rect.height / lineHeight) : 0,
      mainContentPresent: Boolean(
        document.querySelector("main")?.getBoundingClientRect().height,
      ),
      contactActionVisible: hasAction,
      brokenImageCount: imageNodes.filter(
        (img) => img.complete && img.naturalWidth === 0,
      ).length,
      linksWithoutNames: links.filter(
        (a) =>
          !a.textContent?.trim() &&
          !a.getAttribute("aria-label")?.trim() &&
          !a.querySelector("img[alt]"),
      ).length,
      missingImageAlt: imageNodes.filter((img) => !img.hasAttribute("alt"))
        .length,
      undersizedTouchTargets: targets.filter((t) => {
        const r = t.getBoundingClientRect(),
          style = getComputedStyle(t);
        return (
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          !t.hasAttribute("disabled") &&
          t.getAttribute("aria-hidden") !== "true" &&
          // Offscreen anti-spam honeypots are intentionally not interactive.
          r.right > 0 &&
          r.left < window.innerWidth &&
          r.bottom > 0 &&
          r.top < document.documentElement.scrollHeight &&
          r.width > 0 &&
          r.height > 0 &&
          (r.width < 24 || r.height < 24)
        );
      }).length,
    };
  }, imageBase64);
  return { ...evidence, page: pageSlug, viewport };
}
