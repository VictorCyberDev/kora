/**
 * Validated page and section mutations for Website Studio.
 * SiteSpec v3 remains the canonical, publishable document.
 * Persistence and authorization are handled by the owning API; this module
 * deliberately has no network, browser, or tenant privileges.
 */
import { z } from "zod";
import {
  PAGE_PURPOSES, parseSiteSpecV3, sectionV3Schema,
  type SiteSpecV3,
} from "./spec.js";

const pageSlug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,40}$/);
const title = z.string().trim().min(1).max(80);
const index = z.number().int().min(0).max(30);

export const pageEditSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("create-page"), slug: pageSlug, title, purpose: z.enum(PAGE_PURPOSES), sections: z.array(sectionV3Schema).min(1).max(16) }),
  z.object({ kind: z.literal("rename-page"), slug: pageSlug, title, nav: z.string().trim().max(30).optional() }),
  z.object({ kind: z.literal("change-slug"), slug: pageSlug, newSlug: pageSlug }),
  z.object({ kind: z.literal("delete-page"), slug: pageSlug }),
  z.object({ kind: z.literal("duplicate-page"), slug: pageSlug, newSlug: pageSlug, title }),
  z.object({ kind: z.literal("reorder-page"), slug: pageSlug, to: index }),
  z.object({ kind: z.literal("set-navigation"), slug: pageSlug, visible: z.boolean() }),
  z.object({ kind: z.literal("page-seo"), slug: pageSlug, title: z.string().max(70), description: z.string().max(180) }),
  z.object({ kind: z.literal("replace-page-sections"), slug: pageSlug, sections: z.array(sectionV3Schema).min(1).max(16) }),
  z.object({ kind: z.literal("insert-section"), slug: pageSlug, at: index, section: sectionV3Schema }),
  z.object({ kind: z.literal("replace-section"), slug: pageSlug, at: index, section: sectionV3Schema }),
  z.object({ kind: z.literal("remove-section"), slug: pageSlug, at: index }),
  z.object({ kind: z.literal("move-section"), slug: pageSlug, from: index, to: index }),
]);
export type PageEdit = z.infer<typeof pageEditSchema>;
export class PageEditError extends Error {
  constructor(message: string) { super(message); this.name = "PageEditError"; }
}
const linked = (href: string, slug: string) =>
  href === `/${slug}` || href === `/${slug}/` ||
  href.startsWith(`/${slug}/#`);
function usedLinks(spec: SiteSpecV3, slug: string): boolean {
  for (const page of spec.pages)
    for (const s of page.sections)
      for (const c of [
        ("primaryCta" in s ? s.primaryCta : undefined),
        ("secondaryCta" in s ? s.secondaryCta : undefined),
        ("button" in s ? s.button : undefined),
      ])
        if (c && linked(c.href, slug)) return true;
  return spec.footer.links.some((l) => linked(l.href, slug));
}
export function editPagesV3(spec: SiteSpecV3, input: unknown): SiteSpecV3 {
  const e = pageEditSchema.parse(input);
  const next = structuredClone(parseSiteSpecV3(spec));
  const get = (slug: string) => {
    const page = next.pages.find((p) => p.slug === slug);
    if (!page) throw new PageEditError(`Page "${slug}" does not exist.`);
    return page;
  };
  const available = (slug: string) => {
    if (next.pages.some((p) => p.slug === slug))
      throw new PageEditError(`Page "${slug}" already exists.`);
  };
  switch (e.kind) {
    case "create-page":
      if (next.pages.length >= 7) throw new PageEditError("A website can have at most seven pages.");
      if (e.slug === "home" || e.purpose === "home") throw new PageEditError("A second homepage is not allowed.");
      available(e.slug);
      next.pages.push({
        slug: e.slug, title: e.title, nav: e.title.slice(0,30), purpose: e.purpose,
        conversionGoal: "enquire", sections: e.sections,
      });
      break;
    case "rename-page":
      { const p=get(e.slug); p.title=e.title; p.nav=e.nav ?? e.title.slice(0,30); }
      break;
    case "change-slug": {
      if (e.slug === "home" || e.newSlug === "home") throw new PageEditError("Homepage slug is fixed.");
      if(e.newSlug===e.slug) return next;
      available(e.newSlug);
      if (usedLinks(next,e.slug)) throw new PageEditError("Update links to this page before changing its URL.");
      get(e.slug).slug=e.newSlug;
      break;
    }
    case "delete-page":
      if (e.slug === "home") throw new PageEditError("The homepage cannot be deleted.");
      get(e.slug);
      if (usedLinks(next,e.slug)) throw new PageEditError("Remove links to this page before deleting it.");
      next.pages=next.pages.filter((p)=>p.slug!==e.slug);
      break;
    case "duplicate-page": {
      if (next.pages.length >= 7) throw new PageEditError("A website can have at most seven pages.");
      if (e.newSlug === "home") throw new PageEditError("Homepage slug is reserved.");
      available(e.newSlug);
      const original=get(e.slug);
      next.pages.push({ ...structuredClone(original), slug:e.newSlug, title:e.title, nav:e.title.slice(0,30), purpose:original.purpose==="home"?"about":original.purpose });
      break;
    }
    case "reorder-page": {
      if (e.slug === "home" || e.to === 0) throw new PageEditError("Homepage must remain first.");
      const pos=next.pages.findIndex((p)=>p.slug===e.slug);
      if (pos<0 || e.to>=next.pages.length) throw new PageEditError("Invalid page position.");
      next.pages.splice(e.to,0,next.pages.splice(pos,1)[0]!);
      break;
    }
    case "set-navigation": {
      const p=get(e.slug);
      if (e.slug === "home") throw new PageEditError("Homepage is always available.");
      p.navHidden=!e.visible;
      break;
    }
    case "page-seo": {
      const p=get(e.slug); p.seoTitle=e.title; p.seoDescription=e.description; break;
    }
    case "replace-page-sections": {
      get(e.slug).sections=e.sections;
      break;
    }
    case "insert-section":
      { const p=get(e.slug); if(p.sections.length>=16||e.at>p.sections.length)throw new PageEditError("Invalid section position or limit."); p.sections.splice(e.at,0,e.section); }
      break;
    case "replace-section":
      {const p=get(e.slug); if(!p.sections[e.at])throw new PageEditError("Section not found."); p.sections[e.at]=e.section;}
      break;
    case "remove-section":
      {const p=get(e.slug);if(!p.sections[e.at]||p.sections.length===1)throw new PageEditError("Cannot remove the last section.");p.sections.splice(e.at,1);}
      break;
    case "move-section":
      {const p=get(e.slug);if(!p.sections[e.from]||e.to>=p.sections.length)throw new PageEditError("Invalid section position.");p.sections.splice(e.to,0,p.sections.splice(e.from,1)[0]!);}
      break;
  }
  return parseSiteSpecV3(next);
}
