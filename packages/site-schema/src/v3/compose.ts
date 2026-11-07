/**
 * Deterministic composition of sections and pages from what the site already knows: the owner's description, the
 * Business Blueprint and the trade's knowledge profile. It backs "add a section", "add a page" and "regenerate", so every
 * result is built from supplied facts and general guidance, passes the same schema as generation, and needs no model.
 */
import {
  buildBlueprint,
  profileFor,
  resolveVertical,
  type BusinessBlueprint,
  type IndustryProfile,
} from "@kora/creative";
import {
  catalogExclude,
  catalogMediaPool,
  recipeForVertical,
} from "../v2/catalog.js";
import { EditV3Error } from "./errors.js";
import type { SectionV3, SiteSpecV3 } from "./spec.js";

type Page = SiteSpecV3["pages"][number];

export const ADDABLE_SECTIONS = [
  "story",
  "faq",
  "process",
  "offer",
  "gallery",
  "cta",
  "statement",
] as const;
export type AddableSection = (typeof ADDABLE_SECTIONS)[number];
export const ADDABLE_PAGES = ["about", "faq", "approach", "gallery"] as const;
export type AddablePage = (typeof ADDABLE_PAGES)[number];

const sentences = (s: string) =>
  (
    s
      .replace(/\s+/g, " ")
      .trim()
      .match(/[^.!?]+[.!?]*/g) ?? [s]
  )
    .map((x) => x.trim())
    .filter(Boolean);
const fit = (s: string, n: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  const out: string[] = [];
  for (const x of sentences(t)) {
    if ([...out, x].join(" ").length > n) break;
    out.push(x);
  }
  return out.length
    ? out.join(" ")
    : `${t.slice(0, n - 1).replace(/\s+\S*$/, "")}.`;
};

export interface Knowledge {
  bp: BusinessBlueprint;
  profile: IndustryProfile;
  vertical: ReturnType<typeof resolveVertical>;
}
export function knowledgeOf(spec: SiteSpecV3): Knowledge {
  const b = spec.business;
  const text = `${b.name} ${b.industry} ${b.description}`;
  const brief = {
    name: b.name,
    description: b.description || b.name,
    ...(b.location ? { location: b.location } : {}),
  };
  const vertical = resolveVertical(text);
  return {
    bp: buildBlueprint(brief),
    profile: profileFor(
      vertical.id,
      vertical.offerNoun,
      vertical.usefulContent,
    ),
    vertical,
  };
}

const usedUrls = (spec: SiteSpecV3, page?: Page) => {
  const urls = new Set<string>();
  for (const p of page ? [page] : spec.pages)
    for (const m of JSON.stringify(p).matchAll(/"url":"([^"]+)"/g))
      urls.add(m[1]!);
  return urls;
};

/** A section built from the site's own facts. Throws a plain-language EditV3Error when the facts for it are not there. */
export function composeSection(
  spec: SiteSpecV3,
  kind: AddableSection,
  page?: Page,
): SectionV3 {
  const g = spec.design.genome;
  const k = knowledgeOf(spec);
  const b = spec.business;
  switch (kind) {
    case "story": {
      const body = fit(b.description || "", 880);
      if (!body)
        throw new EditV3Error(
          "Tell us a little about the business first, then a story section can be added.",
        );
      return {
        type: "story",
        layout:
          g.compositionMode === "centered-classical"
            ? "founder-note"
            : "manifesto",
        heading: `About ${b.name}`.slice(0, 100),
        body: [body],
        values: [],
      } as SectionV3;
    }
    case "faq": {
      const items = k.profile.faq.slice(0, 6).map((f) => ({
        question: f.question.slice(0, 200),
        answer: fit(f.answer, 700),
      }));
      if (items.length < 1)
        throw new EditV3Error(
          "There are no general questions to start from for this kind of business yet.",
        );
      return {
        type: "faq",
        layout: "accordion",
        heading: "Good to know",
        items,
      };
    }
    case "process": {
      const notes = k.profile.approachNotes;
      const items =
        notes.length >= 2
          ? notes.slice(0, 5).map((n) => ({
              title: n.title.slice(0, 100),
              text: fit(n.text, 400),
            }))
          : [
              { title: "Tell us what you need", text: "" },
              { title: "Send us a message", text: "" },
              { title: "Agree the details with us", text: "" },
            ];
      return {
        type: "process",
        layout: g.processPresentation,
        heading: "How to get started",
        intro: "",
        items,
        eyebrow: "Getting started",
      };
    }
    case "offer": {
      const cats = k.bp.confirmedOfferCategories;
      if (!cats.length)
        throw new EditV3Error(
          "Say what you offer first (add an item), then an offer section can be built.",
        );
      const items = cats.slice(0, 8).map((c) => {
        const t = k.profile.topics.find((x) => x.id === c.topicId);
        return {
          title: c.label.slice(0, 100),
          text: t ? fit(t.intro, 400) : "",
        };
      });
      const L = g.servicePresentation;
      const layout =
        L === "accordion"
          ? "editorial-index"
          : L === "stacked-panels"
            ? "image-tiles"
            : L;
      return {
        type: "offer",
        layout,
        heading: k.vertical.offerHeading.slice(0, 90),
        intro: "",
        items,
      } as SectionV3;
    }
    case "gallery": {
      const topics = k.bp.confirmedOfferCategories
        .map((c) => c.topicId)
        .filter((t): t is string => !!t);
      const taken = usedUrls(spec, page);
      const pool = catalogMediaPool(
        k.vertical.catalogRecipe ?? k.vertical.id,
        topics,
        spec.design.mode,
        24,
      ).filter(
        (m) => !taken.has(m.url) && !catalogExclude(k.vertical.id)?.test(m.alt),
      );
      const pick = pool.slice(
        0,
        pool.length >= 6 ? 6 : pool.length >= 3 ? 3 : pool.length,
      );
      if (pick.length < 2)
        throw new EditV3Error(
          "There are no more suitable pictures to show here yet. Add your own photos, or choose pictures from the suggestions.",
        );
      return {
        type: "gallery",
        layout: pick.length === 2 ? "pair" : "grid",
        heading: "",
        eyebrow: "Illustrative photography",
        items: pick.map((m) => ({
          caption: "",
          media: {
            url: m.url,
            alt: m.alt,
            ...(m.width ? { width: m.width } : {}),
            ...(m.height ? { height: m.height } : {}),
            ...(m.focalPoint ? { focalPoint: m.focalPoint } : {}),
            role: "gallery" as const,
            treatment: "none" as const,
            provenance: {
              sourceType: "licensed-stock" as const,
              provider: "Pexels",
              ...(m.license ? { license: m.license } : {}),
              ...(m.attribution ? { attribution: m.attribution } : {}),
              reviewStatus: "kora-curated" as const,
            },
          },
        })),
      } as SectionV3;
    }
    case "cta": {
      const hero = spec.pages[0]?.sections[0];
      const label =
        hero && hero.type === "hero" && hero.primaryCta
          ? hero.primaryCta.label
          : "Send an enquiry";
      const href = spec.pages.some((p) => p.slug === "contact")
        ? "/contact"
        : "/";
      return {
        type: "cta",
        layout: "statement",
        heading: label.slice(0, 120),
        body: "",
        button: { label: label.slice(0, 40), href },
      };
    }
    case "statement": {
      const first =
        sentences(b.description || "")[0]?.replace(/[.!?]+$/, "") ?? "";
      if (first.length < 24 || first.length > 300)
        throw new EditV3Error(
          "A statement needs a sentence of your own that is a little longer; add one to the description first.",
        );
      return { type: "statement", layout: "large", text: `${first}.` };
    }
  }
}

const PAGE_DEF: Record<
  AddablePage,
  {
    title: string;
    nav: string;
    purpose: Page["purpose"];
    goal: Page["conversionGoal"];
    sections: AddableSection[];
  }
> = {
  about: {
    title: "About",
    nav: "About",
    purpose: "about",
    goal: "trust",
    sections: ["story", "cta"],
  },
  faq: {
    title: "Questions",
    nav: "Questions",
    purpose: "faq",
    goal: "enquire",
    sections: ["faq", "cta"],
  },
  approach: {
    title: "How we work",
    nav: "How we work",
    purpose: "approach",
    goal: "trust",
    sections: ["process", "cta"],
  },
  gallery: {
    title: "Gallery",
    nav: "Gallery",
    purpose: "gallery",
    goal: "view-work",
    sections: ["gallery", "cta"],
  },
};

/** A new page built from the same pieces as a section. The caller enforces the page limit and slug uniqueness. */
export function composePage(spec: SiteSpecV3, kind: AddablePage): Page {
  const d = PAGE_DEF[kind];
  const draft: Page = {
    slug: kind,
    title: d.title,
    nav: d.nav,
    purpose: d.purpose,
    conversionGoal: d.goal,
    sections: [
      {
        type: "hero",
        layout: "type-dominant",
        heading: d.title,
        subheading: "",
        highlights: [],
        variant: 0,
      } as SectionV3,
    ],
  };
  for (const s of d.sections)
    draft.sections.push(composeSection(spec, s, draft));
  return draft;
}
