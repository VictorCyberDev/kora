import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Binding terminology: this check compares claims with a source and is not
// cryptographic, so it must never be described as attested, proven or secure.
const FORBIDDEN = /\b(attested|proven|secure)\b/i;
const here = fileURLToPath(new URL(".", import.meta.url));
const adr = fileURLToPath(
  new URL(
    "../../../../docs/adr/ADR-010-deployment-verification.md",
    import.meta.url,
  ),
);

describe("Deployment Verification terminology", () => {
  const sources = readdirSync(here)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => [f, readFileSync(`${here}${f}`, "utf8")] as const);
  it("has source files to check", () =>
    expect(sources.length).toBeGreaterThan(4));
  it.each(sources)("%s avoids overclaiming words", (_file, text) =>
    expect(text).not.toMatch(FORBIDDEN),
  );
  it("ADR-010 avoids overclaiming words and states the limits", () => {
    const text = readFileSync(adr, "utf8");
    expect(text).not.toMatch(FORBIDDEN);
    expect(text).toContain("Deployment Verification (not cryptographic)");
    expect(text).toContain("NOT COLLECTED");
  });
});
