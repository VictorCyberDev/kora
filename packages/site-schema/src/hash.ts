import { createHash } from "node:crypto";

/** Deterministic JSON: object keys sorted, no whitespace. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export const sha256 = (data: string) =>
  createHash("sha256").update(data, "utf8").digest("hex");
export const hashSpec = (spec: unknown) => sha256(stableStringify(spec));

export type SiteFiles = Record<string, string>;
/** Hash over sorted (path, content-hash) pairs: stable across file order. */
export function hashFiles(files: SiteFiles): string {
  return sha256(
    Object.keys(files)
      .sort()
      .map((path) => `${path}\0${sha256(files[path]!)}`)
      .join("\n"),
  );
}
