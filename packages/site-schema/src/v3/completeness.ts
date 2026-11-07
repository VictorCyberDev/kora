/**
 * Whole-site checks for a newly generated site: is it complete, truthful, navigable and honest about its pictures?
 * The older critic judges the opening and the design; this one reads every page. It is deliberately separate so that a
 * historical site (a single page, or more than seven) is never failed retroactively: callers opt in for new generation.
 */
import {
  claimIssues,
  findCliches,
  inventedNumbers,
  buildTruth,
  type CreativeBrief,
} from "@kora/creative";
import type { CriticIssue } from "./critic.js";
import { MAX_SITE_PAGES, MIN_SITE_PAGES, type SiteSpecV3 } from "./spec.js";
import { catalogTopicsForUrl } from "../v2/catalog.js";

export interface CompletenessOptions {
  /** The brief the owner gave. Enables the claim check against what they actually supplied. */
  brief?: CreativeBrief;
  /** True for a site being generated now. Enforces the 4-7 page rule. Historical sites pass false. */
  generation?: boolean;
}

const issue = (
  code: string,
  severity: CriticIssue["severity"],
  dimension: CriticIssue["dimension"],
  message: string,
  repairable = false,
): CriticIssue => ({ code, severity, dimension, message, repairable });

const TEXT_KEYS = [
  "heading",
  "subheading",
  "intro",
  "text",
  "body",
  "eyebrow",
  "caption",
  "answer",
  "question",
  "title",
];

/** Every visible string with where it lives, so a defect can be traced to a page and section. */
export function textAt(
  spec: SiteSpecV3,
): Array<{ at: string; text: string; supplied: boolean }> {
  const out: Array<{ at: string; text: string; supplied: boolean }> = [];
  const walk = (v: unknown, at: string, key: string) => {
    if (typeof v === "string") {
      if (TEXT_KEYS.includes(key)) out.push({ at, text: v, supplied: false });
    } else if (Array.isArray(v))
      v.forEach((x, i) => walk(x, `${at}[${i}]`, key));
    else if (v && typeof v === "object")
      for (const [k, x] of Object.entries(v as Record<string, unknown>))
        if (k !== "media" && k !== "plate") walk(x, `${at}.${k}`, k);
  };
  spec.pages.forEach((p) =>
    p.sections.forEach((s, i) => walk(s, `${p.slug}#${i}:${s.type}`, "")),
  );
  return out;
}

const isLink = (href: string) => /^(https?:|tel:|mailto:|#|\/)/.test(href);

export function completenessV3(
  spec: SiteSpecV3,
  opts: CompletenessOptions = {},
): CriticIssue[] {
  const out: CriticIssue[] = [];
  const slugs = new Set(spec.pages.map((p) => p.slug));
  const n = spec.pages.length;

  if (opts.generation) {
    if (n < MIN_SITE_PAGES)
      out.push(
        issue(
          "TOO_FEW_PAGES",
          "block",
          "contentCompleteness",
          `The site has ${n} page(s); a new site needs at least ${MIN_SITE_PAGES}.`,
        ),
      );
    if (n > MAX_SITE_PAGES)
      out.push(
        issue(
          "TOO_MANY_PAGES",
          "block",
          "contentCompleteness",
          `The site has ${n} pages; the most is ${MAX_SITE_PAGES}.`,
        ),
      );
  }

  // Substance: a page is more than a heading and a button.
  for (const p of spec.pages) {
    const body = p.sections.filter(
      (s) => s.type !== "hero" && s.type !== "cta" && s.type !== "contact",
    );
    if (p.slug !== "home" && p.slug !== "contact" && body.length < 1)
      out.push(
        issue(
          "THIN_PAGE",
          "block",
          "contentCompleteness",
          `Page "${p.slug}" has no content beyond its heading and a button.`,
        ),
      );
    if (p.slug === "home" && p.sections.length < 3)
      out.push(
        issue(
          "THIN_HOME",
          opts.generation ? "block" : "warn",
          "contentCompleteness",
          "The home page has fewer than three sections.",
        ),
      );
    for (const [i, s] of p.sections.entries()) {
      const a = s as unknown as Record<string, unknown>;
      const items =
        (a.items as Array<Record<string, unknown>> | undefined) ?? [];
      if (
        ["offer", "products", "process", "faq", "gallery"].includes(s.type) &&
        items.length === 0
      )
        out.push(
          issue(
            "EMPTY_SECTION",
            "block",
            "contentCompleteness",
            `${p.slug}#${i} (${s.type}) is empty.`,
          ),
        );
      if (s.type === "story" && !(a.body as string[]).some((x) => x.trim()))
        out.push(
          issue(
            "EMPTY_SECTION",
            "block",
            "contentCompleteness",
            `${p.slug}#${i} (story) has no text.`,
          ),
        );
    }
  }

  // Truncation: finished copy never ends in an ellipsis or a cut-off word.
  for (const t of textAt(spec)) {
    if (/…\s*$|\.\.\.\s*$/.test(t.text))
      out.push(
        issue(
          "TRUNCATED_COPY",
          "block",
          "contentCompleteness",
          `${t.at} ends in an ellipsis: "${t.text.slice(-40)}"`,
          true,
        ),
      );
    if (
      /\b(?:and|or|the|a|of|to|for|with|in)\s*$/i.test(t.text.trim()) &&
      t.text.length > 40
    )
      out.push(
        issue(
          "TRUNCATED_COPY",
          "block",
          "contentCompleteness",
          `${t.at} ends mid-sentence: "${t.text.slice(-40)}"`,
        ),
      );
  }

  // Navigation and calls to action must lead somewhere.
  const checkHref = (href: string, where: string) => {
    if (!isLink(href))
      out.push(
        issue(
          "BROKEN_LINK",
          "block",
          "navigation",
          `${where} has an unusable link "${href}".`,
        ),
      );
    else if (href.startsWith("/") && href.length > 1) {
      const slug = href.replace(/^\/|\/$/g, "").split(/[/?#]/)[0]!;
      if (slug && !slugs.has(slug) && !href.startsWith("/_kora/"))
        out.push(
          issue(
            "BROKEN_LINK",
            "block",
            "navigation",
            `${where} points at /${slug}, which is not a page.`,
            true,
          ),
        );
    } else if (href.startsWith("#") && href.length > 1) {
      /* section anchors are validated by the schema per page */
    }
  };
  for (const p of spec.pages)
    for (const [i, s] of p.sections.entries()) {
      const a = s as unknown as Record<
        string,
        { href?: string; label?: string } | undefined
      >;
      for (const k of ["primaryCta", "secondaryCta", "button"]) {
        const l = a[k];
        if (l?.href) checkHref(l.href, `${p.slug}#${i}.${k}`);
      }
    }
  for (const l of spec.footer.links) checkHref(l.href, "footer");
  if (
    !spec.pages.some((p) => p.slug === "contact") &&
    !spec.pages.some((p) => p.sections.some((s) => s.type === "contact"))
  )
    out.push(
      issue(
        "NO_CONTACT_JOURNEY",
        "block",
        "conversionClarity",
        "No page has a way for a visitor to get in touch.",
      ),
    );
  for (const p of spec.pages)
    for (const s of p.sections)
      if (
        s.type === "contact" &&
        !s.form &&
        !spec.business.phone &&
        !spec.business.whatsapp &&
        !spec.business.email
      )
        out.push(
          issue(
            "NON_FUNCTIONAL_CONTACT",
            "block",
            "conversionClarity",
            "The contact section has no form and no supplied contact method.",
          ),
        );

  // Pictures: every one has alternative text, and a topic page only shows pictures that depict it.
  const seenOnPage = new Map<string, Set<string>>();
  for (const p of spec.pages) {
    const urls = new Set<string>();
    seenOnPage.set(p.slug, urls);
    const check = (
      m:
        | { url: string; alt: string; provenance?: { sourceType?: string } }
        | undefined,
      where: string,
    ) => {
      if (!m) return;
      if (!m.alt.trim())
        out.push(
          issue(
            "MISSING_ALT",
            "warn",
            "accessibility",
            `${where} has a picture without alternative text.`,
          ),
        );
      if (urls.has(m.url))
        out.push(
          issue(
            "REPEATED_IMAGE_ON_PAGE",
            "warn",
            "mediaIntegrity",
            `${where} repeats a picture already shown on this page.`,
          ),
        );
      urls.add(m.url);
      const topics = catalogTopicsForUrl(m.url);
      if (topics && !topics.length)
        out.push(
          issue(
            "UNTAGGED_CATALOGUE_IMAGE",
            "info",
            "mediaIntegrity",
            `${where}: catalogue picture has no topic.`,
          ),
        );
    };
    for (const [i, s] of p.sections.entries()) {
      const a = s as unknown as {
        media?: never;
        items?: Array<{ media?: never }>;
      };
      check(a.media, `${p.slug}#${i}`);
      a.items?.forEach((it, j) => check(it.media, `${p.slug}#${i}.${j}`));
    }
  }

  // Truth: nothing reads as an unsupplied claim about the business.
  const truth = opts.brief ? buildTruth(opts.brief) : undefined;
  for (const t of textAt(spec)) {
    const claims = claimIssues(t.text).filter((c) => c !== "a number");
    if (claims.length)
      out.push(
        issue(
          "UNSUPPLIED_CLAIM",
          "block",
          "truthfulness",
          `${t.at} states ${claims[0]}: "${t.text.slice(0, 80)}"`,
        ),
      );
    if (truth) {
      const bad = inventedNumbers(t.text, truth);
      if (bad.length)
        out.push(
          issue(
            "INVENTED_NUMBER",
            "block",
            "truthfulness",
            `${t.at} contains ${bad.join(", ")}, which the owner never supplied.`,
          ),
        );
    }
    const cl = findCliches(t.text);
    if (cl.length)
      out.push(
        issue(
          "CLICHE",
          "warn",
          "contentCompleteness",
          `${t.at} uses a generic phrase: "${cl[0]}".`,
        ),
      );
  }
  return out;
}

export interface RepairResult {
  spec: SiteSpecV3;
  applied: string[];
  remaining: CriticIssue[];
  rounds: number;
}

/**
 * Bounded repair loop: evaluate, apply only repairs that never need a fact, evaluate again. At most `maxRounds` rounds,
 * and whatever still blocks afterwards is returned, not hidden.
 */
export function repairCompleteness(
  spec: SiteSpecV3,
  opts: CompletenessOptions = {},
  maxRounds = 2,
): RepairResult {
  const cur = structuredClone(spec);
  const applied: string[] = [];
  let remaining = completenessV3(cur, opts);
  let rounds = 0;
  while (
    rounds < maxRounds &&
    remaining.some((i) => i.severity === "block" && i.repairable)
  ) {
    rounds++;
    const slugs = new Set(cur.pages.map((p) => p.slug));
    const fixHref = (l: { href: string } | undefined) => {
      if (!l || !l.href.startsWith("/") || l.href.length === 1) return;
      const slug = l.href.replace(/^\/|\/$/g, "").split(/[/?#]/)[0]!;
      if (
        slug &&
        !slugs.has(slug) &&
        !l.href.startsWith("/_kora/") &&
        slugs.has("contact")
      ) {
        l.href = "/contact";
        applied.push("BROKEN_LINK");
      }
    };
    const dropEllipsis = (o: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(o)) {
        if (
          typeof v === "string" &&
          TEXT_KEYS.includes(k) &&
          /(…|\.\.\.)\s*$/.test(v)
        ) {
          o[k] = `${v
            .replace(/\s*(…|\.\.\.)\s*$/, "")
            .replace(/[\s,;:]+\S*$/, "")
            .replace(/[\s,;:]+$/, "")}.`;
          applied.push("TRUNCATED_COPY");
        } else if (Array.isArray(v))
          v.forEach((x, i) => {
            if (
              typeof x === "string" &&
              TEXT_KEYS.includes(k) &&
              /(…|\.\.\.)\s*$/.test(x)
            ) {
              v[i] = `${x
                .replace(/\s*(…|\.\.\.)\s*$/, "")
                .replace(/[\s,;:]+\S*$/, "")
                .replace(/[\s,;:]+$/, "")}.`;
              applied.push("TRUNCATED_COPY");
            } else if (x && typeof x === "object")
              dropEllipsis(x as Record<string, unknown>);
          });
        else if (v && typeof v === "object")
          dropEllipsis(v as Record<string, unknown>);
      }
    };
    for (const p of cur.pages)
      for (const s of p.sections) {
        const a = s as unknown as Record<string, { href: string } | undefined>;
        fixHref(a.primaryCta);
        fixHref(a.secondaryCta);
        fixHref(a.button);
        dropEllipsis(s);
      }
    remaining = completenessV3(cur, opts);
  }
  return { spec: cur, applied: [...new Set(applied)], remaining, rounds };
}
