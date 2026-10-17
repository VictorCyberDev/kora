import { createHash } from "node:crypto";

/**
 * Canonical form `kora-stable-json/v1`: UTF-8 JSON with no whitespace, object
 * keys sorted ascending by UTF-16 code unit, arrays in order, strings and
 * numbers exactly as `JSON.stringify` writes them.
 *
 * It is byte-identical to the original `stable()` in apps/api/src/diagnosis.ts
 * for every JSON value (golden vectors prove it). It differs only by refusing
 * values JSON cannot represent (undefined, NaN, Infinity, bigint, Date, Map,
 * class instances, cycles) instead of hashing an unstable rendering of them.
 */
export const CANONICALIZATION = "kora-stable-json/v1";

function encode(value: unknown, ancestors: Set<object>): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value))
        throw new TypeError(`cannot canonicalize non-finite number ${value}`);
      return JSON.stringify(value);
    case "object":
      break;
    default:
      throw new TypeError(
        `cannot canonicalize a value of type ${typeof value}`,
      );
  }
  const object = value;
  if (ancestors.has(object))
    throw new TypeError("cannot canonicalize a cyclic structure");
  ancestors.add(object);
  try {
    if (Array.isArray(object)) {
      const items: string[] = [];
      for (let i = 0; i < object.length; i++)
        items.push(encode((object as unknown[])[i], ancestors));
      return `[${items.join(",")}]`;
    }
    const proto = Object.getPrototypeOf(object) as unknown;
    if (proto !== Object.prototype && proto !== null)
      throw new TypeError("cannot canonicalize a non-plain object");
    const record = object as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${encode(record[key], ancestors)}`)
      .join(",")}}`;
  } finally {
    ancestors.delete(object);
  }
}

export function canonicalize(value: unknown): string {
  return encode(value, new Set());
}

/** Lower-case hex SHA-256 of the canonical form. */
export function hash(value: unknown): string {
  return createHash("sha256").update(canonicalize(value)).digest("hex");
}
