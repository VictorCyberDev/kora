import { describe, expect, it } from "vitest";
import { composeDirections, type CreativeBrief } from "@kora/creative";
import { planSiteV3 } from "../src/v3/plan.js";
import { editPagesV3 } from "../src/v3/page-edit.js";
const brief: CreativeBrief = {
  name: "Example Bakery",
  description:
    "We bake sourdough bread, artisan pastries and custom cakes for local customers.",
  industry: "bakery",
  services: ["Sourdough", "Pastries", "Cakes"],
  whatsapp: "+2348012345678",
};
const make = () => planSiteV3(brief, composeDirections(brief)[0]!).spec;
describe("SiteSpec v3 page editor", () => {
  it("creates, renames, reorders and preserves a validated site", () => {
    const base = make(),
      home = base.pages[0]!;
    let site = editPagesV3(base, {
      kind: "create-page",
      slug: "specials",
      title: "Specials",
      purpose: "products",
      sections: structuredClone(home.sections),
    });
    expect(site.pages.some((p) => p.slug === "specials")).toBe(true);
    site = editPagesV3(site, {
      kind: "rename-page",
      slug: "specials",
      title: "Our Specials",
    });
    expect(site.pages.find((p) => p.slug === "specials")!.title).toBe(
      "Our Specials",
    );
    expect(
      editPagesV3(site, { kind: "reorder-page", slug: "specials", to: 1 })
        .pages[0]!.slug,
    ).toBe("home");
  });
  it("rejects duplicate slugs, last-section deletion and homepage removal", () => {
    const site = make();
    expect(() =>
      editPagesV3(site, { kind: "delete-page", slug: "home" }),
    ).toThrow();
    expect(() =>
      editPagesV3(site, {
        kind: "duplicate-page",
        slug: "home",
        newSlug: "home",
        title: "Duplicate",
      }),
    ).toThrow();
    expect(() =>
      editPagesV3(site, { kind: "remove-section", slug: "home", at: 999 }),
    ).toThrow();
  });
  it("has immutable edits", () => {
    const site = make(),
      before = JSON.stringify(site);
    editPagesV3(site, {
      kind: "rename-page",
      slug: "home",
      title: "Another Headline",
    });
    expect(JSON.stringify(site)).toBe(before);
  });
});
