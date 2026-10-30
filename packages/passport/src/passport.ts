import { CANONICALIZATION } from "./canonical.js";

export const PASSPORT_SCHEMA = "kora.incident-passport/v1";
export const PASSPORT_SCHEMA_V2 = "kora.incident-passport/v2";
/** Every schema this verifier understands. */
export const SUPPORTED_SCHEMAS: readonly string[] = [
  PASSPORT_SCHEMA,
  PASSPORT_SCHEMA_V2,
];
export const INTEGRITY_ALGORITHM = "sha256";
export { CANONICALIZATION };

export type JsonObject = Record<string, unknown>;

/** Everything in a diagnosis snapshot except its creation metadata. */
export function diagnosisHashInput(snapshot: JsonObject): JsonObject {
  return Object.fromEntries(
    Object.entries(snapshot).filter(
      ([key]) =>
        key !== "createdAt" && key !== "contentHash" && key !== "snapshotId",
    ),
  );
}

/**
 * The Passport minus `generatedAt` and `integrity.contentHash`. Every other
 * byte, including the rest of `integrity`, is hash input.
 */
export function passportHashInput(passport: JsonObject): JsonObject {
  const { generatedAt, integrity, ...rest } = passport;
  void generatedAt;
  const { contentHash, ...integrityRest } = (integrity ?? {}) as JsonObject;
  void contentHash;
  return { ...rest, integrity: integrityRest };
}
