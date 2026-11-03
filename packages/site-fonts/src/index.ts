import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/** URL prefix under which every Kora host serves the bundled font files. */
export const FONT_URL_PREFIX = "/_kora/fonts/";
const FILE_RE = /^[a-z0-9-]+-latin-\d{3}-normal\.woff2$/;
const filesDir = [
  new URL("../files/", import.meta.url),
  new URL("../../files/", import.meta.url),
]
  .map((u) => fileURLToPath(u))
  .find((p) => existsSync(p));

/** Returns a bundled font file, or null for anything that is not exactly a bundled file name. */
export async function readFontFile(name: string): Promise<Buffer | null> {
  if (!FILE_RE.test(name) || !filesDir) return null;
  try {
    return await readFile(`${filesDir}${name}`);
  } catch {
    return null;
  }
}
export const FONT_CACHE_CONTROL = "public, max-age=31536000, immutable";

const ttfDir = [
  new URL("../ttf/", import.meta.url),
  new URL("../../ttf/", import.meta.url),
]
  .map((u) => fileURLToPath(u))
  .find((p) => existsSync(p));
/** Absolute paths of the bundled TrueType fonts, for server-side rasterisation (the web uses the woff2 files). */
export async function ttfPaths(): Promise<string[]> {
  if (!ttfDir) return [];
  const { readdir } = await import("node:fs/promises");
  return (await readdir(ttfDir))
    .filter((f) => f.endsWith(".ttf") || f.endsWith(".otf"))
    .map((f) => `${ttfDir}${f}`);
}
