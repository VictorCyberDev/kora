import { hash } from "./canonical.js";
import {
  CANONICALIZATION,
  INTEGRITY_ALGORITHM,
  PASSPORT_SCHEMA,
  diagnosisHashInput,
  passportHashInput,
  type JsonObject,
} from "./passport.js";

export interface VerifyCheck {
  name: string;
  ok: boolean;
  detail: string;
}
export interface VerifyResult {
  ok: boolean;
  /** One line: why verification failed, or what was checked. */
  reason: string;
  checks: VerifyCheck[];
}

const HEX64 = /^[0-9a-f]{64}$/;
const isObject = (v: unknown): v is JsonObject =>
  v !== null && typeof v === "object" && !Array.isArray(v);

function structureProblem(p: unknown): string | null {
  if (!isObject(p)) return "not a JSON object";
  if (p.schema !== PASSPORT_SCHEMA)
    return `unsupported schema ${JSON.stringify(p.schema)}, expected ${PASSPORT_SCHEMA}`;
  const integrity = p.integrity;
  if (!isObject(integrity)) return "integrity block missing";
  if (integrity.algorithm !== INTEGRITY_ALGORITHM)
    return `unsupported integrity.algorithm ${JSON.stringify(integrity.algorithm)}`;
  if (integrity.canonicalization !== CANONICALIZATION)
    return `unsupported integrity.canonicalization ${JSON.stringify(integrity.canonicalization)}`;
  if (
    typeof integrity.contentHash !== "string" ||
    !HEX64.test(integrity.contentHash)
  )
    return "integrity.contentHash is not 64 lower-case hex characters";
  if (!Array.isArray(p.evidence) || !p.evidence.every(isObject))
    return "evidence is not an array of objects";
  const d = p.diagnosis;
  if (!isObject(d)) return "diagnosis is not an object";
  if (typeof d.contentHash !== "string" || !HEX64.test(d.contentHash))
    return "diagnosis.contentHash is not 64 lower-case hex characters";
  if (!Array.isArray(d.evidence) || !d.evidence.every(isObject))
    return "diagnosis.evidence is not an array of objects";
  return null;
}

function itemHashProblems(items: JsonObject[], label: string): string[] {
  const problems: string[] = [];
  items.forEach((item, index) => {
    const { contentHash, ...rest } = item;
    if (typeof contentHash !== "string" || !HEX64.test(contentHash))
      problems.push(`${label}[${index}] has no valid contentHash`);
    else if (hash(rest) !== contentHash)
      problems.push(`${label}[${index}] does not match its contentHash`);
  });
  return problems;
}

function check(
  name: string,
  fn: () => string[],
  okDetail: string,
): VerifyCheck {
  try {
    const problems = fn();
    return problems.length
      ? { name, ok: false, detail: problems.join("; ") }
      : { name, ok: true, detail: okDetail };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { name, ok: false, detail: `cannot canonicalize: ${message}` };
  }
}

/**
 * Checks that a parsed Passport still matches the hashes it carries. This is
 * an integrity check only: it cannot show who produced the Passport, and
 * anyone who can recompute every hash can produce one that passes.
 */
export function verifyPassport(input: unknown): VerifyResult {
  const problem = structureProblem(input);
  if (problem) {
    const checks = [{ name: "structure", ok: false, detail: problem }];
    return { ok: false, reason: `structure: ${problem}`, checks };
  }
  const p = input as JsonObject;
  const integrity = p.integrity as JsonObject;
  const diagnosis = p.diagnosis as JsonObject;
  const evidence = p.evidence as JsonObject[];
  const diagnosisEvidence = diagnosis.evidence as JsonObject[];
  const checks: VerifyCheck[] = [
    {
      name: "structure",
      ok: true,
      detail: "schema and integrity block recognised",
    },
    check(
      "content-hash",
      () => {
        const actual = hash(passportHashInput(p));
        return actual === integrity.contentHash
          ? []
          : [
              `integrity.contentHash is ${String(integrity.contentHash)} but the content hashes to ${actual}`,
            ];
      },
      String(integrity.contentHash),
    ),
    check(
      "evidence-hashes",
      () => itemHashProblems(evidence, "evidence"),
      `${evidence.length} items match their own hash`,
    ),
    check(
      "diagnosis-hash",
      () => {
        const actual = hash(diagnosisHashInput(diagnosis));
        return actual === diagnosis.contentHash
          ? []
          : [
              `diagnosis.contentHash is ${String(diagnosis.contentHash)} but the snapshot hashes to ${actual}`,
            ];
      },
      String(diagnosis.contentHash),
    ),
    check(
      "diagnosis-evidence-hashes",
      () => itemHashProblems(diagnosisEvidence, "diagnosis.evidence"),
      `${diagnosisEvidence.length} items match their own hash`,
    ),
  ];
  const failed = checks.filter((c) => !c.ok);
  return failed.length
    ? { ok: false, reason: `${failed[0]!.name}: ${failed[0]!.detail}`, checks }
    : { ok: true, reason: "all hashes match", checks };
}
