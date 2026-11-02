import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  criticV3,
  diversityReport,
  lintArtifact,
  planDirectionsV3,
  renderSiteV3,
  voiceFiles,
} from "../src/index.js";

// The golden benchmark businesses live next to the visual QA scripts so tests and screenshots use the same briefs.
const GOLDEN = JSON.parse(
  readFileSync(
    new URL(
      "../../../scripts/design-qa/v7-golden-briefs.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as Array<[string, Parameters<typeof planDirectionsV3>[0]]>;
const ctx = { formEndpoint: "https://kora.example/api/public/sites/s1/forms" };
const kb = (s: string) => Buffer.byteLength(s) / 1024;

describe("golden businesses", () => {
  const all = GOLDEN.map(([id, brief]) => ({ id, ...planDirectionsV3(brief) }));
  it("covers at least 18 businesses and every direction validates, lints and has no blocking critic issue", () => {
    expect(GOLDEN.length).toBeGreaterThanOrEqual(18);
    for (const g of all)
      for (const d of g.directions) {
        expect(
          lintArtifact(renderSiteV3(d.spec, ctx)),
          `${g.id}/${d.index}`,
        ).toEqual([]);
        expect(
          criticV3(d.spec).filter((i) => i.severity === "block"),
          `${g.id}/${d.index}`,
        ).toEqual([]);
      }
  });
  it("anti-sameness: across 18 industries no two recommended designs read as one template", () => {
    const specs = all.map((g) => g.directions.find((d) => d.recommended)!.spec);
    const r = diversityReport(specs);
    // Siblings in related trades (mechanic/logistics) may share a design language, never a face AND a colourway.
    expect(r.max).toBeLessThan(0.72);
    expect(r.mean).toBeLessThan(0.3);
    for (let i = 0; i < specs.length; i++)
      for (let j = i + 1; j < specs.length; j++)
        if (r.matrix[i]![j]! >= 0.6)
          expect(
            specs[i]!.design.genome.typeVoice !==
              specs[j]!.design.genome.typeVoice ||
              specs[i]!.design.colorwayId !== specs[j]!.design.colorwayId,
            `${GOLDEN[i]![0]} vs ${GOLDEN[j]![0]}`,
          ).toBe(true);
    expect(
      new Set(specs.map((s) => s.design.genome.typeVoice)).size,
    ).toBeGreaterThanOrEqual(12);
    expect(
      new Set(specs.map((s) => s.design.colorwayId)).size,
    ).toBeGreaterThanOrEqual(14);
  });
  it("within one brief the three directions are visibly different languages", () => {
    for (const g of all) {
      const grammars = g.directions.map((d) => d.direction.grammarId);
      expect(new Set(grammars).size, g.id).toBe(3);
    }
  });
  it("performance budgets: light pages, few fonts, no script but the shared tracker", () => {
    for (const g of all)
      for (const d of g.directions) {
        const files = renderSiteV3(d.spec, ctx);
        const html = kb(files["index.html"]!);
        const css = kb(files["styles.css"]!);
        expect(html, `${g.id} html`).toBeLessThan(45);
        expect(css, `${g.id} css`).toBeLessThan(48);
        expect(kb(files["site.js"]!), "js").toBeLessThan(3);
        const fonts = voiceFiles(d.spec.design.genome.typeVoice);
        expect(fonts.length, `${g.id} font files`).toBeLessThanOrEqual(6);
        expect(
          /<script(?![^>]*src=)(?![^>]*ld\+json)/.test(files["index.html"]!),
        ).toBe(false);
        // every bundled stock image referenced is an optimised webp from our own origin
        for (const m of files["index.html"]!.matchAll(
          /src="(\/_kora\/media\/[a-z0-9-]+\.webp)"/g,
        )) {
          const size =
            statSync(
              new URL(
                `../../site-media/files/${m[1]!.split("/").pop()!}`,
                import.meta.url,
              ),
            ).size / 1024;
          expect(size, m[1]).toBeLessThan(260);
        }
      }
  });
  it("every font file a voice needs is bundled with the right licence file", () => {
    const fonts = new Set<string>();
    for (const g of all)
      for (const d of g.directions)
        for (const f of voiceFiles(d.spec.design.genome.typeVoice))
          fonts.add(f);
    for (const f of fonts)
      expect(
        statSync(new URL(`../../site-fonts/files/${f}`, import.meta.url)).size,
        f,
      ).toBeGreaterThan(2000);
    expect(
      readFileSync(
        new URL("../../site-fonts/LICENSE-FONTS.md", import.meta.url),
        "utf8",
      ),
    ).toContain("SIL Open Font License");
  });
});
