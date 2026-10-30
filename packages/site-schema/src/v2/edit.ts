import { z } from "zod";
import {
  buildPalette,
  PALETTE_STRATEGY_IDS,
  type PaletteStrategy,
} from "./palette.js";
import {
  PAIRING_IDS,
  parseSiteSpecV2,
  VARIANTS,
  type SectionV2,
  type SiteSpecV2,
} from "./spec.js";

const strat = z.enum(
  PALETTE_STRATEGY_IDS as [PaletteStrategy, ...PaletteStrategy[]],
);
const page = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,40}$/)
  .default("home");
/** The friendly visual controls. Each maps to one validated change; none can carry code. */
export const structuredEditV2Schema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("palette"),
    strategy: strat,
    hueShift: z.number().int().min(-24).max(24).default(0),
  }),
  z.object({ kind: z.literal("font"), pairing: z.enum(PAIRING_IDS) }),
  z.object({
    kind: z.literal("density"),
    value: z.enum(["compact", "balanced", "spacious", "editorial"]),
  }),
  z.object({
    kind: z.literal("shape"),
    value: z.enum(["sharp", "soft", "rounded"]),
  }),
  z.object({
    kind: z.literal("surface"),
    value: z.enum(["flat", "outlined", "raised"]),
  }),
  z.object({
    kind: z.literal("buttons"),
    value: z.enum(["solid", "outline", "pill", "underline"]),
  }),
  z.object({
    kind: z.literal("motion"),
    value: z.enum(["none", "subtle", "expressive"]),
  }),
  z.object({ kind: z.literal("nav"), value: z.enum(VARIANTS.nav) }),
  z.object({ kind: z.literal("footer"), value: z.enum(VARIANTS.footer) }),
  z.object({
    kind: z.literal("section-variant"),
    page,
    index: z.number().int().min(0).max(13),
    value: z.string().max(40),
  }),
  z.object({
    kind: z.literal("section-shuffle"),
    page,
    index: z.number().int().min(0).max(13),
  }),
  z.object({
    kind: z.literal("section-move"),
    page,
    from: z.number().int().min(0).max(13),
    to: z.number().int().min(0).max(13),
  }),
  z.object({
    kind: z.literal("section-duplicate"),
    page,
    index: z.number().int().min(0).max(13),
  }),
  z.object({
    kind: z.literal("section-delete"),
    page,
    index: z.number().int().min(0).max(13),
  }),
  z.object({
    kind: z.literal("business"),
    field: z.enum([
      "name",
      "description",
      "phone",
      "whatsapp",
      "email",
      "location",
    ]),
    value: z.string().max(600),
  }),
]);
export type StructuredEditV2 = z.infer<typeof structuredEditV2Schema>;

export class EditV2Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EditV2Error";
  }
}

export function applyStructuredEditV2(
  input: SiteSpecV2,
  rawEdit: unknown,
): SiteSpecV2 {
  const edit = structuredEditV2Schema.parse(rawEdit);
  const spec = structuredClone(input);
  const sectionsOf = (slug: string) => {
    const p = spec.pages.find((x) => x.slug === slug);
    if (!p) throw new EditV2Error(`There is no page "${slug}".`);
    return p.sections;
  };
  const at = (list: SectionV2[], i: number) => {
    const s = list[i];
    if (!s) throw new EditV2Error("That section does not exist.");
    return s;
  };
  switch (edit.kind) {
    case "palette": {
      const { palette, mode } = buildPalette(edit.strategy, edit.hueShift);
      spec.design.palette = palette;
      spec.design.mode = mode;
      spec.design.paletteStrategy = edit.strategy;
      break;
    }
    case "font":
      spec.design.typography.pairing = edit.pairing;
      break;
    case "density":
      spec.design.density = edit.value;
      break;
    case "shape":
      spec.design.shape = edit.value;
      break;
    case "surface":
      spec.design.surface = edit.value;
      break;
    case "buttons":
      spec.design.buttons = edit.value;
      break;
    case "motion":
      spec.design.motion = edit.value;
      break;
    case "nav":
      spec.design.nav = edit.value;
      break;
    case "footer":
      spec.design.footer = edit.value;
      break;
    case "section-variant": {
      const s = at(sectionsOf(edit.page), edit.index);
      const allowed = VARIANTS[s.type] as readonly string[];
      if (!allowed.includes(edit.value))
        throw new EditV2Error(`"${edit.value}" is not a layout for ${s.type}.`);
      (s as { variant: string }).variant = edit.value;
      break;
    }
    case "section-shuffle": {
      const s = at(sectionsOf(edit.page), edit.index);
      const options = VARIANTS[s.type] as readonly string[];
      (s as { variant: string }).variant =
        options[(options.indexOf(s.variant) + 1) % options.length]!;
      break;
    }
    case "section-move": {
      const list = sectionsOf(edit.page);
      const [s] = list.splice(edit.from, 1);
      if (!s || edit.to >= list.length + 1)
        throw new EditV2Error("That section does not exist.");
      list.splice(edit.to, 0, s);
      break;
    }
    case "section-duplicate": {
      const list = sectionsOf(edit.page);
      list.splice(edit.index + 1, 0, structuredClone(at(list, edit.index)));
      break;
    }
    case "section-delete": {
      const list = sectionsOf(edit.page);
      const s = at(list, edit.index);
      if (
        s.type === "contact" &&
        list.filter((x) => x.type === "contact").length === 1 &&
        edit.page === "home"
      )
        throw new EditV2Error(
          "The contact section is how customers reach you; keep at least one.",
        );
      list.splice(edit.index, 1);
      if (list.length === 0)
        throw new EditV2Error("A page needs at least one section.");
      break;
    }
    case "business": {
      const v = edit.value.trim();
      if (edit.field === "name" || edit.field === "description")
        (spec.business as Record<string, unknown>)[edit.field] = v;
      else if (v === "")
        delete (spec.business as Record<string, unknown>)[edit.field];
      else
        (spec.business as Record<string, unknown>)[edit.field] =
          edit.field === "whatsapp" ? v.replace(/[^0-9+]/g, "") : v;
      break;
    }
  }
  spec.meta.generator = "edit";
  return parseSiteSpecV2(spec);
}

const COLOURS: Record<string, string> = {
  blue: "#1f4fd8",
  navy: "#14284b",
  red: "#c62828",
  green: "#2a7d46",
  orange: "#d9680a",
  purple: "#6a2bb0",
  black: "#111827",
  teal: "#0f7f7c",
  pink: "#c93a6e",
  gold: "#a47a00",
  yellow: "#c79a00",
};

/**
 * Edits that need no model: colour, button text, rename, add a service. Returns null when the
 * instruction is something only a model (or the visual controls) can do.
 */
export function ruleBasedEditV2(
  spec: SiteSpecV2,
  instruction: string,
  readableOn: (bg: string) => string,
): SiteSpecV2 | null {
  const text = instruction.trim();
  const colour =
    /\b(primary|main|brand|accent)?\s*colou?r\b.*?\b(?:to|be|is|as)\s+(?:a\s+)?(#[0-9a-f]{6}|[a-z]+)\b/i.exec(
      text,
    ) ??
    /\bmake\s+(?:the\s+)?(primary|accent)?\s*(?:colou?r\s+)?(#[0-9a-f]{6}|blue|navy|red|green|orange|purple|black|teal|pink|gold|yellow)\b/i.exec(
      text,
    );
  if (colour) {
    const raw = colour[2]!.toLowerCase();
    const value = raw.startsWith("#") ? raw : COLOURS[raw];
    if (value) {
      const next = structuredClone(spec);
      const key = /accent/i.test(colour[1] ?? text) ? "accent" : "primary";
      next.design.palette[key] = value;
      next.design.palette[`${key}Foreground`] = readableOn(value);
      next.design.paletteStrategy = "custom";
      next.meta.generator = "edit";
      return parseSiteSpecV2(next);
    }
  }
  const cta =
    /\b(?:change|set|update|make)\s+(?:the\s+)?(?:main\s+)?(?:cta|call to action|button)(?:\s+text)?\s+(?:to\s+say|to|say)\s+["“']?(.{2,40}?)["”']?\s*$/i.exec(
      text,
    );
  if (cta) {
    const next = structuredClone(spec);
    const hero = next.pages
      .find((p) => p.slug === "home")
      ?.sections.find((s) => s.type === "hero");
    if (hero?.type === "hero" && hero.primaryCta) {
      hero.primaryCta.label = cta[1]!;
      next.meta.generator = "edit";
      return parseSiteSpecV2(next);
    }
  }
  const add =
    /^add\s+(?:a\s+)?(.{2,60}?)(?:\s+(?:as\s+)?(?:a\s+)?service)?$/i.exec(text);
  if (
    add &&
    !/faq|testimonial|pric|gallery|hours|page|section/i.test(add[1]!)
  ) {
    const next = structuredClone(spec);
    const services = next.pages
      .flatMap((p) => p.sections)
      .find((s) => s.type === "services");
    if (services?.type === "services") {
      services.items.push({
        title: add[1]!.trim().replace(/^./, (c) => c.toUpperCase()),
        text: "",
      });
      next.meta.generator = "edit";
      return parseSiteSpecV2(next);
    }
  }
  const rename =
    /^(?:rename|call)\s+(?:the\s+)?(?:business|site|website)?\s*(?:to\s+)?["“']?(.{2,80}?)["”']?$/i.exec(
      text,
    );
  if (rename)
    return applyStructuredEditV2(spec, {
      kind: "business",
      field: "name",
      value: rename[1]!,
    });
  return null;
}
