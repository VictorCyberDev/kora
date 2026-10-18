import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The Passport is integrity-evident only. These claims are never made about
// it. The phrases are assembled from fragments so this file does not contain
// them either.
const forbidden = [
  new RegExp(["tamper", "[- ]?", "proof"].join(""), "i"),
  new RegExp(["at", "tested"].join(""), "i"),
  new RegExp(["verified", "\\s+", "deployment"].join(""), "i"),
];
const files = [
  "docs/architecture/incident-passport.md",
  "docs/adr/ADR-011-incident-passport.md",
  "apps/api/src/passport-routes.ts",
  "packages/passport/src/canonical.ts",
  "packages/passport/src/passport.ts",
  "packages/passport/src/verify.ts",
  "packages/passport/src/verify-cli.ts",
  "packages/passport/src/cli.ts",
  "packages/passport/package.json",
];
const root = new URL("../../../", import.meta.url);

describe("terminology", () => {
  it.each(files)("%s makes no claim beyond integrity", (file) => {
    const text = readFileSync(new URL(file, root), "utf8");
    for (const pattern of forbidden) expect(text).not.toMatch(pattern);
  });

  it("the documentation states the integrity-only boundary and lists signing as future work", () => {
    const doc = readFileSync(
      new URL("docs/architecture/incident-passport.md", root),
      "utf8",
    );
    expect(doc).toMatch(/integrity-evident/i);
    expect(doc).toMatch(/not authentic/i);
    expect(doc).toMatch(/not signed/i);
    expect(doc).toMatch(/## Future work[\s\S]*\*\*Signing\.\*\*/);
    const adr = readFileSync(
      new URL("docs/adr/ADR-011-incident-passport.md", root),
      "utf8",
    );
    expect(adr).toMatch(/not authentic/i);
    expect(adr).toMatch(/Signing is future work/i);
  });
});
