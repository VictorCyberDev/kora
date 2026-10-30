import type { SiteFiles } from "../hash.js";

/**
 * A single self-contained HTML document for throw-away previews (design directions shown
 * before anything is saved). It is never stored, hashed or published: the real artifact is
 * the file set. Fonts stay as /_kora/fonts/ URLs on the serving origin.
 */
export function inlinePreview(files: SiteFiles): string {
  const css = files["styles.css"] ?? "";
  return (files["index.html"] ?? "")
    .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\n?/, "")
    .replace(
      /<link rel="stylesheet" href="styles.css">/,
      () => `<style>${css}</style>`,
    )
    .replace(/<script src="site.js" defer><\/script>\n?/, "")
    .replace(/<link rel="icon"[^>]*>\n?/, "");
}
