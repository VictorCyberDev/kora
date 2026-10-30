import { createHash } from "node:crypto";

export type SiteFiles = Record<string, string>;

const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  svg: "image/svg+xml",
  xml: "application/xml; charset=utf-8",
  txt: "text/plain; charset=utf-8",
};
export const contentType = (path: string) =>
  TYPES[path.split(".").pop() ?? ""] ?? "application/octet-stream";

/** Resolves a request sub-path to a file in an artifact; null when absent or unsafe. */
export function resolveArtifactPath(
  files: SiteFiles,
  subPath: string,
): { path: string } | { redirect: string } | null {
  const clean = subPath.replace(/^\/+/, "");
  if (clean.includes("..") || clean.includes("\0") || clean.includes("\\"))
    return null;
  if (clean === "") return { path: "index.html" };
  if (Object.hasOwn(files, clean)) return { path: clean };
  if (clean.endsWith("/") && Object.hasOwn(files, `${clean}index.html`))
    return { path: `${clean}index.html` };
  if (!clean.endsWith("/") && Object.hasOwn(files, `${clean}/index.html`))
    return { redirect: `${clean}/` };
  return null;
}

export const etagFor = (content: string) =>
  `"sha256-${createHash("sha256").update(content).digest("hex").slice(0, 32)}"`;

export interface ServeResult {
  status: 200 | 301 | 304 | 404;
  headers: Record<string, string>;
  body: string | null;
}
const COMMON = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
};

/** Pure: maps (artifact, path, conditional header) to a response. Shared by every host. */
export function serveArtifact(
  files: SiteFiles,
  subPath: string,
  basePath: string,
  ifNoneMatch?: string,
): ServeResult {
  const hit = resolveArtifactPath(files, subPath);
  if (!hit)
    return {
      status: 404,
      headers: { ...COMMON, "content-type": "text/plain; charset=utf-8" },
      body: "Not found",
    };
  if ("redirect" in hit)
    return {
      status: 301,
      headers: { ...COMMON, location: `${basePath}${hit.redirect}` },
      body: null,
    };
  const content = files[hit.path]!;
  const etag = etagFor(content);
  const headers = {
    ...COMMON,
    "content-type": contentType(hit.path),
    // Same URL, different version over time: revalidate, and make revalidation cheap.
    "cache-control": "no-cache",
    etag,
  };
  if (ifNoneMatch === etag) return { status: 304, headers, body: null };
  return { status: 200, headers, body: content };
}
