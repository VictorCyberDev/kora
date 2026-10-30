import { z } from "zod";
import { parseSiteSpec, type SiteSpec } from "./spec.js";

const BLOCKED = new Set(["__proto__", "constructor", "prototype"]);
export const sitePatchSchema = z.object({
  ops: z
    .array(
      z.discriminatedUnion("op", [
        z.object({
          op: z.literal("replace"),
          path: z.string(),
          value: z.json(),
        }),
        z.object({ op: z.literal("add"), path: z.string(), value: z.json() }),
        z.object({ op: z.literal("remove"), path: z.string() }),
      ]),
    )
    .min(1)
    .max(50),
});
export type SitePatch = z.infer<typeof sitePatchSchema>;

export class PatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PatchError";
  }
}

function segments(path: string): string[] {
  if (!path.startsWith("/")) throw new PatchError("path must start with /");
  const parts = path
    .slice(1)
    .split("/")
    .map((s) => s.replaceAll("~1", "/").replaceAll("~0", "~"));
  for (const part of parts)
    if (BLOCKED.has(part)) throw new PatchError("path segment is not allowed");
  return parts;
}

/**
 * Applies a JSON-pointer patch to a copy of the spec, then validates the
 * result as a whole. A patch can only ever produce a valid SiteSpec (typed
 * content), never code: the schema is the gate.
 */
export function applySitePatch(spec: SiteSpec, patch: unknown): SiteSpec {
  const { ops } = sitePatchSchema.parse(patch);
  const doc = structuredClone(spec) as unknown as Record<string, unknown>;
  for (const op of ops) {
    const parts = segments(op.path);
    const last = parts.pop();
    if (last === undefined)
      throw new PatchError("cannot patch the document root");
    let node: unknown = doc;
    for (const part of parts) {
      if (Array.isArray(node)) node = node[Number(part)];
      else if (node && typeof node === "object")
        node = Object.hasOwn(node, part)
          ? (node as Record<string, unknown>)[part]
          : undefined;
      else node = undefined;
      if (node === undefined) throw new PatchError(`no such path ${op.path}`);
    }
    if (Array.isArray(node)) {
      if (last === "-" && op.op === "add") {
        node.push(structuredClone((op as { value: unknown }).value));
        continue;
      }
      const index = Number(last);
      if (!Number.isInteger(index) || index < 0 || index > node.length)
        throw new PatchError(`bad array index in ${op.path}`);
      if (op.op === "add")
        node.splice(
          index,
          0,
          structuredClone((op as { value: unknown }).value),
        );
      else if (index >= node.length)
        throw new PatchError(`no such path ${op.path}`);
      else if (op.op === "remove") node.splice(index, 1);
      else node[index] = structuredClone((op as { value: unknown }).value);
    } else if (node && typeof node === "object") {
      const obj = node as Record<string, unknown>;
      if (op.op === "remove") {
        if (!Object.hasOwn(obj, last))
          throw new PatchError(`no such path ${op.path}`);
        delete obj[last];
      } else {
        if (op.op === "replace" && !Object.hasOwn(obj, last))
          throw new PatchError(`no such path ${op.path}`);
        obj[last] = structuredClone((op as { value: unknown }).value);
      }
    } else throw new PatchError(`no such path ${op.path}`);
  }
  return parseSiteSpec(doc);
}

/** Structured (non-chat) edits compile to the same patch format. */
export type StructuredEdit =
  | { kind: "brand"; field: "primaryColor" | "accentColor"; value: string }
  | {
      kind: "brand-style";
      field: "tone" | "typography" | "radius";
      value: string;
    }
  | {
      kind: "business";
      field:
        "name" | "description" | "phone" | "whatsapp" | "email" | "location";
      value: string;
    }
  | { kind: "seo"; field: "title" | "description"; value: string };

export function structuredEditToPatch(edit: StructuredEdit): SitePatch {
  const base =
    edit.kind === "brand" || edit.kind === "brand-style"
      ? "/brand"
      : edit.kind === "business"
        ? "/business"
        : "/seo";
  return {
    ops: [{ op: "add", path: `${base}/${edit.field}`, value: edit.value }],
  };
}
