import { contrast } from "./color.js";
import type { SectionV2, SiteSpecV2 } from "./spec.js";

/** Phrases that make generated copy read as machine-written. Rejected from model output; never emitted by the planner. */
export const CLICHES = [
  "unlock",
  "elevate",
  "seamless",
  "cutting-edge",
  "cutting edge",
  "world-class",
  "world class",
  "revolutioniz",
  "leverage",
  "synergy",
  "game-changer",
  "game changer",
  "empower",
  "next level",
  "next-level",
  "one-stop",
  "state-of-the-art",
  "state of the art",
  "tailored solutions",
  "in today's fast-paced",
  "fast-paced world",
  "take your .* to the next",
  "passionate about",
  "your trusted partner",
  "second to none",
  "unparalleled",
  "transform your",
  "embark on",
  "journey",
  "delve",
  "tapestry",
  "bespoke solutions",
  "holistic",
];
const CLICHE_RE = new RegExp(CLICHES.join("|"), "i");

/** Claims that are only true if the owner said so; a generator may not add them on its own. */
const CLAIMS_RE =
  /\b(?:award[- ]winning|awards?|certified|accredited|iso\s*\d+|guarantee[ds]?|#1|number one|best in|leading|top[- ]rated|five[- ]star|5[- ]star|trusted by|clients? include|as seen (?:on|in)|years of experience|since \d{4}|over \d+|more than \d+|\d+\+)\b/i;

export function visibleText(spec: SiteSpecV2): string[] {
  const out: string[] = [];
  const push = (...v: Array<string | undefined>) =>
    v.forEach((x) => x && out.push(x));
  const walk = (s: SectionV2) => {
    switch (s.type) {
      case "hero":
        push(
          s.eyebrow,
          s.heading,
          s.subheading,
          ...s.highlights,
          s.primaryCta?.label,
          s.secondaryCta?.label,
        );
        break;
      case "trust":
        push(s.heading, ...s.items);
        break;
      case "services":
      case "features":
      case "process":
      case "portfolio":
        push(
          s.heading,
          s.intro,
          ...s.items.flatMap((i) => [i.title, i.text, i.tag]),
        );
        break;
      case "about":
        push(s.heading, ...s.body, ...s.values);
        break;
      case "testimonials":
        push(s.heading, ...s.items.flatMap((i) => [i.quote, i.author, i.role]));
        break;
      case "team":
        push(s.heading, ...s.items.flatMap((i) => [i.name, i.role, i.bio]));
        break;
      case "pricing":
        push(
          s.heading,
          s.intro,
          ...s.tiers.flatMap((t) => [
            t.name,
            t.price,
            t.description,
            ...t.features,
            t.cta?.label,
          ]),
        );
        break;
      case "stats":
        push(s.heading, ...s.items.flatMap((i) => [i.value, i.label]));
        break;
      case "faq":
        push(s.heading, ...s.items.flatMap((i) => [i.question, i.answer]));
        break;
      case "contact":
        push(s.heading, s.intro, s.submitLabel);
        break;
      case "cta":
        push(s.heading, s.body, s.button.label);
        break;
    }
  };
  for (const p of spec.pages) {
    push(p.title);
    p.sections.forEach(walk);
  }
  push(spec.seo.title, spec.seo.description);
  return out;
}

export interface Finding {
  rule: string;
  message: string;
}

/** What the owner told Kora. Anything numeric or factual in generated copy must trace back here. */
export interface Facts {
  text: string;
}

const numbersIn = (s: string) =>
  (s.match(/\d[\d,.]*/g) ?? [])
    .map((n) => n.replace(/[^\d]/g, ""))
    .filter(Boolean);

export function designQuality(spec: SiteSpecV2, facts?: Facts): Finding[] {
  const f: Finding[] = [];
  const text = visibleText(spec);
  for (const t of text) {
    if (CLICHE_RE.test(t))
      f.push({
        rule: "cliche",
        message: `AI-style phrase in "${t.slice(0, 60)}"`,
      });
    if (facts && CLAIMS_RE.test(t) && !CLAIMS_RE.test(facts.text))
      f.push({
        rule: "unsupported-claim",
        message: `claim not supplied by the owner: "${t.slice(0, 60)}"`,
      });
  }
  if (facts) {
    const known = new Set(numbersIn(facts.text));
    const ownerHay = facts.text.toLowerCase();
    for (const t of text)
      for (const n of numbersIn(t))
        if (!known.has(n) && !ownerHay.includes(n))
          f.push({
            rule: "invented-number",
            message: `"${n}" in "${t.slice(0, 60)}" is not in the brief`,
          });
  }
  const home = spec.pages.find((p) => p.slug === "home")!;
  if (home.sections[0]?.type !== "hero")
    f.push({
      rule: "structure",
      message: "the home page should open with a hero",
    });
  if (!home.sections.some((s) => s.type === "contact"))
    f.push({
      rule: "conversion",
      message: "the home page has no contact section",
    });
  for (const p of spec.pages) {
    p.sections.forEach((s, i) => {
      if (i > 0 && p.sections[i - 1]!.type === s.type)
        f.push({ rule: "rhythm", message: `two ${s.type} sections in a row` });
    });
    for (const s of p.sections) {
      if (s.type === "hero" && s.heading.length > 110)
        f.push({ rule: "copy", message: "hero heading is too long" });
      if (s.type === "services" && s.items.length === 1)
        f.push({
          rule: "thin",
          message: "a services section with one item looks unfinished",
        });
      const links = [
        ("primaryCta" in s && s.primaryCta) || null,
        ("secondaryCta" in s && s.secondaryCta) || null,
        ("button" in s && s.button) || null,
      ];
      for (const l of links)
        if (
          l &&
          /^(click here|read more|learn more|submit|here)$/i.test(
            l.label.trim(),
          )
        )
          f.push({
            rule: "cta-label",
            message: `weak button label "${l.label}"`,
          });
      for (const m of [("media" in s && s.media) || null])
        if (m && !m.alt.trim())
          f.push({ rule: "a11y", message: "image without alt text" });
      if (
        s.type === "testimonials" &&
        facts &&
        !/testimonial|review|said|quote/i.test(facts.text)
      )
        f.push({
          rule: "fabrication",
          message: "testimonials without owner-supplied quotes",
        });
      if (
        ["pricing", "stats", "team"].includes(s.type) &&
        facts &&
        !new RegExp(
          s.type === "pricing"
            ? "price|₦|\\$|€|£|cost|fee"
            : s.type === "stats"
              ? "\\d"
              : "team|staff|founder",
          "i",
        ).test(facts.text)
      )
        f.push({
          rule: "fabrication",
          message: `${s.type} section without owner-supplied facts`,
        });
    }
  }
  const p = spec.design.palette;
  for (const [a, b] of [
    ["foreground", "background"],
    ["mutedForeground", "background"],
    ["primaryForeground", "primary"],
    ["accentForeground", "accent"],
  ] as const)
    if (contrast(p[a], p[b]) < 4.5)
      f.push({ rule: "contrast", message: `${a} on ${b}` });
  return f;
}

/** A compact fingerprint used to detect template collapse across generated sites. */
export function designSignature(spec: SiteSpecV2) {
  const home = spec.pages.find((p) => p.slug === "home")!;
  return {
    hero: (home.sections[0] as { variant: string }).variant,
    nav: spec.design.nav,
    pairing: spec.design.typography.pairing,
    palette: spec.design.paletteStrategy,
    footer: spec.design.footer,
    density: spec.design.density,
    shape: spec.design.shape,
    order: home.sections.map((s) => s.type).join(">"),
    variants: home.sections.map((s) => `${s.type}:${s.variant}`).join("|"),
  };
}
