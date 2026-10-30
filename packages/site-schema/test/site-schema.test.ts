import { describe, expect, it } from "vitest";
import {
  PatchError,
  applySitePatch,
  artifactHash,
  finalizeForPublish,
  generateSpecFromBrief,
  hashSpec,
  lintArtifact,
  missingBlockingDetails,
  parseSiteSpec,
  renderSite,
  structuredEditToPatch,
} from "../src/index.js";

const laundry = () =>
  generateSpecFromBrief({
    name: "Victor Laundry",
    description:
      "Modern laundry in Lagos. We provide pickup and delivery, dry cleaning and ironing.",
    whatsapp: "+2348012345678",
    location: "Lagos",
    hours: [{ days: "Mon-Sat", hours: "8am-6pm" }],
    wantsQuoteForm: true,
  });

describe("generator", () => {
  it("asks only for genuinely blocking details", () => {
    expect(missingBlockingDetails({})).toEqual(["name", "description"]);
    expect(
      missingBlockingDetails({
        name: "A",
        description: "We wash clothes daily.",
      }),
    ).toEqual([]);
  });
  it("uses only what the owner wrote and never invents testimonials or prices", () => {
    const spec = laundry();
    const types = spec.pages.flatMap((p) => p.sections.map((s) => s.type));
    expect(types).not.toContain("testimonials");
    expect(types).not.toContain("pricing");
    expect(types).not.toContain("stats");
    const services = spec.pages
      .filter((p) => p.slug === "services")
      .flatMap((p) => p.sections)
      .flatMap((s) =>
        s.type === "services" ? s.items.map((i) => i.title) : [],
      );
    expect(services).toEqual([
      "Pickup and delivery",
      "Dry cleaning",
      "Ironing",
    ]);
  });
  it("omits hours when none were provided", () => {
    const spec = generateSpecFromBrief({
      name: "A Shop",
      description: "We sell shoes and bags.",
    });
    expect(JSON.stringify(spec)).not.toContain('"hours"');
  });
});

describe("renderer", () => {
  it("is deterministic and hash-stable", () => {
    const a = renderSite(laundry(), {
      formEndpoint: "https://api.example.com/f",
    });
    const b = renderSite(laundry(), {
      formEndpoint: "https://api.example.com/f",
    });
    expect(artifactHash(a)).toBe(artifactHash(b));
    expect(hashSpec(laundry())).toBe(hashSpec(laundry()));
  });
  it("produces accessible, safe HTML with no inline script or handlers", () => {
    const files = renderSite(laundry(), {
      formEndpoint: "https://api.example.com/f",
    });
    expect(lintArtifact(files)).toEqual([]);
    const home = files["index.html"]!;
    expect(home).toContain('<html lang="en">');
    expect(home).toContain('name="viewport"');
    expect(home).toContain('property="og:title"');
    expect(home).toContain('class="skip"');
    expect(home).toContain("Content-Security-Policy");
    expect(home).toContain("wa.me/2348012345678");
  });
  it("escapes hostile text everywhere", () => {
    const spec = parseSiteSpec({
      ...laundry(),
      business: {
        ...laundry().business,
        name: '<img src=x onerror=alert(1)>"',
      },
      seo: {
        title: "</title><script>alert(1)</script>",
        description: "x",
        keywords: [],
      },
    });
    const files = renderSite(spec);
    expect(lintArtifact(files)).toEqual([]);
    for (const html of Object.values(files)) {
      expect(html).not.toContain("<script>alert");
      expect(html).not.toContain("<img src=x");
    }
  });
  it("rejects dangerous links at the schema boundary", () => {
    const bad = laundry();
    (bad.pages[0]!.sections[0] as { cta?: unknown }).cta = {
      label: "x",
      href: "javascript:alert(1)",
    };
    expect(() => parseSiteSpec(bad)).toThrow();
    (bad.pages[0]!.sections[0] as { cta?: unknown }).cta = {
      label: "x",
      href: "http://insecure.example",
    };
    expect(() => parseSiteSpec(bad)).toThrow();
  });
  it("omits the form (keeping direct contact) when no endpoint is configured", () => {
    const html = renderSite(laundry())["index.html"]!;
    expect(html).not.toContain("<form");
    expect(html).toContain("WhatsApp");
  });
  it("adds sitemap and robots only at publish time", () => {
    const spec = laundry();
    const source = renderSite(spec);
    expect(source["sitemap.xml"]).toBeUndefined();
    const published = finalizeForPublish(
      source,
      spec,
      "https://x.example/s/victor/",
    );
    expect(published["sitemap.xml"]).toContain(
      "https://x.example/s/victor/services/",
    );
    expect(published["robots.txt"]).toContain(
      "Sitemap: https://x.example/s/victor/sitemap.xml",
    );
  });
});

describe("patches", () => {
  it("applies a structured colour edit and revalidates", () => {
    const next = applySitePatch(
      laundry(),
      structuredEditToPatch({
        kind: "brand",
        field: "primaryColor",
        value: "#0044ff",
      }),
    );
    expect(next.brand.primaryColor).toBe("#0044ff");
  });
  it("rejects patches that would produce an invalid spec", () => {
    expect(() =>
      applySitePatch(laundry(), {
        ops: [
          {
            op: "replace",
            path: "/brand/primaryColor",
            value: "url(javascript:x)",
          },
        ],
      }),
    ).toThrow();
  });
  it("blocks prototype-pollution paths and unknown paths", () => {
    expect(() =>
      applySitePatch(laundry(), {
        ops: [{ op: "add", path: "/__proto__/polluted", value: 1 }],
      }),
    ).toThrow(PatchError);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(() =>
      applySitePatch(laundry(), {
        ops: [{ op: "replace", path: "/nope/x", value: 1 }],
      }),
    ).toThrow(PatchError);
  });
  it("can add an FAQ section by appending", () => {
    const next = applySitePatch(laundry(), {
      ops: [
        {
          op: "add",
          path: "/pages/0/sections/-",
          value: {
            type: "faq",
            heading: "FAQ",
            items: [{ question: "Do you deliver?", answer: "Yes." }],
          },
        },
      ],
    });
    expect(next.pages[0]!.sections.at(-1)!.type).toBe("faq");
  });
  it("does not mutate the original spec", () => {
    const spec = laundry();
    const before = hashSpec(spec);
    applySitePatch(
      spec,
      structuredEditToPatch({
        kind: "brand",
        field: "accentColor",
        value: "#112233",
      }),
    );
    expect(hashSpec(spec)).toBe(before);
  });
});
