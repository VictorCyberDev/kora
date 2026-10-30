import type { SiteSpec } from "../spec.js";
import { planSite, type DesignBrief } from "./plan.js";
import { parseSiteSpecV2, type SectionV2, type SiteSpecV2 } from "./spec.js";

export interface UpgradeResult {
  spec: SiteSpecV2;
  /** What from the v1 site was carried over, for the "what changed" summary. */
  carried: string[];
  /** Content the owner had that has no v2 home yet; listed, never silently dropped. */
  notCarried: string[];
}

/**
 * Builds a NEW v2 draft from the facts and copy of a v1 site. The v1 version is untouched,
 * nothing is published, and nothing the owner did not write is added.
 */
export function upgradeV1ToV2(
  v1: SiteSpec,
  opts: {
    direction?: 0 | 1 | 2;
    goal?: DesignBrief["goal"];
    feel?: string;
  } = {},
): UpgradeResult {
  const home = v1.pages.find((p) => p.slug === "home")!;
  const all = v1.pages.flatMap((p) => p.sections);
  const pick = <
    T extends SiteSpec["pages"][number]["sections"][number]["type"],
  >(
    t: T,
  ) => all.filter((s): s is Extract<typeof s, { type: T }> => s.type === t);
  const services = [...pick("services")].flatMap((s) =>
    s.items.map((i) => i.title),
  );
  const hours = pick("hours").flatMap((s) => s.items);
  const hero = home.sections.find((s) => s.type === "hero");
  const about = pick("about");
  const brief: DesignBrief = {
    name: v1.business.name,
    description: (
      v1.business.description ||
      about[0]?.body.join(" ") ||
      `${v1.business.name} ${v1.business.industry}`
    )
      .padEnd(12, " ")
      .slice(0, 2000),
    ...(v1.business.industry ? { industry: v1.business.industry } : {}),
    ...(v1.business.location ? { location: v1.business.location } : {}),
    ...(v1.business.phone ? { phone: v1.business.phone } : {}),
    ...(v1.business.whatsapp ? { whatsapp: v1.business.whatsapp } : {}),
    ...(v1.business.email ? { email: v1.business.email } : {}),
    ...(services.length
      ? { services: [...new Set(services)].slice(0, 12) }
      : {}),
    ...(hours.length ? { hours } : {}),
    ...(opts.goal ? { goal: opts.goal } : {}),
    ...(opts.feel ? { feel: opts.feel } : {}),
  };
  const planned = planSite(brief, {
    direction: opts.direction ?? 0,
    ...(hero?.type === "hero"
      ? {
          copy: {
            heading: hero.heading.slice(0, 110),
            ...(hero.subheading
              ? { subheading: hero.subheading.slice(0, 280) }
              : {}),
          },
        }
      : {}),
  });
  const carried = ["business details", "hours", "services"].filter(
    (_, i) => [true, hours.length > 0, services.length > 0][i],
  );
  const notCarried: string[] = [];
  const sections = [...planned.pages[0]!.sections];
  const idx = (t: SectionV2["type"]) => sections.findIndex((s) => s.type === t);
  const insertAfter = (
    t: SectionV2["type"],
    s: SectionV2,
    fallback: SectionV2["type"] = "hero",
  ) => {
    const i = idx(t) >= 0 ? idx(t) : idx(fallback);
    sections.splice(i + 1, 0, s);
  };

  if (hero?.type === "hero") carried.push("headline");
  const aboutBody = about.flatMap((a) => a.body);
  if (aboutBody.length) {
    const at = idx("about");
    const v2about: SectionV2 = {
      type: "about",
      variant:
        ((planned.pages[0]!.sections[at] as { variant: string } | undefined)
          ?.variant as "editorial") ?? "image-text",
      heading: about[0]!.heading,
      body: aboutBody.slice(0, 4),
      values: [],
    };
    if (at >= 0) sections[at] = v2about;
    else insertAfter("services", v2about, "hero");
    carried.push("about text");
  }
  const feats = pick("features");
  if (feats.length) {
    insertAfter(
      "services",
      {
        type: "features",
        variant: "icon-led",
        heading: feats[0]!.heading,
        intro: "",
        items: feats[0]!.items
          .slice(0, 8)
          .map((i) => ({ title: i.title, text: i.description })),
      },
      "hero",
    );
    carried.push("features");
  }
  const gal = pick("gallery");
  if (gal.length) {
    insertAfter(
      "services",
      {
        type: "portfolio",
        variant: "grid",
        heading: gal[0]!.heading,
        intro: "",
        items: gal[0]!.items.slice(0, 9).map((g) => ({
          title: g.caption,
          text: "",
          ...(g.imageUrl
            ? {
                media: {
                  url: g.imageUrl,
                  alt: g.alt || g.caption,
                  source: "external" as const,
                },
              }
            : {}),
        })),
      },
      "hero",
    );
    carried.push("gallery");
  }
  const tm = pick("testimonials");
  if (tm.length) {
    insertAfter(
      "about",
      {
        type: "testimonials",
        variant: tm[0]!.items.length > 2 ? "grid" : "spotlight",
        heading: tm[0]!.heading,
        items: tm[0]!.items
          .slice(0, 6)
          .map((t) => ({ quote: t.quote, author: t.author })),
      },
      "services",
    );
    carried.push("testimonials");
  }
  const pr = pick("pricing");
  if (pr.length) {
    insertAfter(
      "services",
      {
        type: "pricing",
        variant: "columns",
        heading: pr[0]!.heading,
        intro: "",
        tiers: pr[0]!.tiers.slice(0, 4).map((t) => ({
          name: t.name,
          price: t.price,
          description: t.description,
          features: t.features.slice(0, 10),
          featured: false,
          ...(t.cta ? { cta: t.cta } : {}),
        })),
      },
      "hero",
    );
    carried.push("pricing");
  }
  const st = pick("stats");
  if (st.length) {
    const at = idx("cta");
    sections.splice(at >= 0 ? at : sections.length - 1, 0, {
      type: "stats",
      variant: "row",
      heading: st[0]!.heading,
      items: st[0]!.items.slice(0, 4),
    });
    carried.push("stats");
  }
  const faq = pick("faq");
  if (faq.length) {
    const at = idx("faq");
    const v2faq: SectionV2 = {
      type: "faq",
      variant: "accordion",
      heading: faq[0]!.heading,
      items: faq[0]!.items.slice(0, 10),
    };
    if (at >= 0)
      sections[at] = {
        ...v2faq,
        variant: (sections[at] as { variant: "split" }).variant,
      };
    else insertAfter("about", v2faq, "services");
    carried.push("faq");
  }
  const soc = pick("social");
  const social = soc.flatMap((s) => s.links).slice(0, 8);
  if (social.length) carried.push("social links");
  if (
    all.filter((s) => s.type === "gallery").length > 1 ||
    feats.length > 1 ||
    v1.pages.length > 3
  )
    notCarried.push(
      "extra pages and repeated sections were folded into the home page",
    );

  // no two adjacent sections of the same kind
  const spec = {
    ...planned,
    business: { ...planned.business, social },
    pages: [
      {
        slug: "home",
        title: "Home",
        sections: sections.filter(
          (s, i) => i === 0 || sections[i - 1]!.type !== s.type,
        ),
      },
    ],
    seo: {
      ...planned.seo,
      title: v1.seo.title,
      description: v1.seo.description || planned.seo.description,
      keywords: v1.seo.keywords,
    },
    footer: {
      text: v1.footer.text || planned.footer.text,
      links: v1.footer.links,
    },
    meta: { ...planned.meta, generator: "edit" as const },
  };
  return { spec: parseSiteSpecV2(spec), carried, notCarried };
}
