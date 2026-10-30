import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/** URL prefix under which every Kora host serves the curated, licensed photographs. */
export const MEDIA_URL_PREFIX = "/_kora/media/";
const FILE_RE = /^[a-z0-9-]+\.webp$/;
const filesDir = [
  new URL("../files/", import.meta.url),
  new URL("../../files/", import.meta.url),
]
  .map((u) => fileURLToPath(u))
  .find((p) => existsSync(p));

/** Returns a bundled photograph, or null for anything that is not exactly a bundled file name. */
export async function readMediaFile(name: string): Promise<Buffer | null> {
  if (!FILE_RE.test(name) || !filesDir) return null;
  try {
    return await readFile(`${filesDir}${name}`);
  } catch {
    return null;
  }
}
export const MEDIA_CACHE_CONTROL = "public, max-age=2592000";
