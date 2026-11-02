/**
 * Design Genome: first-party design vocabulary. Every value is a Kora term describing behaviour
 * ("cinematic-minimal"), never a third-party brand ("apple"). A genome is data: once stored it
 * reproduces the same design without asking a model again.
 */
import { z } from "zod";

export const COMPOSITION_MODES = [
  "cinematic-minimal",
  "editorial-asymmetric",
  "poster-bold",
  "catalog-grid",
  "centered-classical",
  "split-narrative",
  "collage-layered",
  "stacked-utility",
  "menu-led",
  "monograph",
] as const;
export const GRIDS = [
  "single-column",
  "twelve-column",
  "asymmetric-7-5",
  "modular",
  "offset-rail",
] as const;
export const ALIGNMENTS = ["left", "center", "mixed"] as const;
export const DENSITIES = ["airy", "balanced", "compact", "dense"] as const;
export const SPACING_RHYTHMS = ["steady", "dramatic", "tight"] as const;

/** Behavioural type families; site-schema maps each id to licensed OFL font files. */
export const TYPE_VOICES = [
  "editorial-luxury",
  "soft-luxury",
  "modern-serif",
  "heritage-serif",
  "high-fashion",
  "classical-roman",
  "display-statement",
  "condensed-utility",
  "poster-condensed",
  "technical-grotesk",
  "wide-futurist",
  "friendly-humanist",
  "rounded-playful",
  "craft-warm",
  "local-commerce",
  "minimal-modernist",
  "quirky-grotesk",
] as const;
export type TypeVoice = (typeof TYPE_VOICES)[number];

export const TYPE_CONTRASTS = ["low", "medium", "high", "extreme"] as const;
export const HEADLINE_BEHAVIOURS = [
  "sentence",
  "uppercase",
  "mixed-italic",
  "oversized",
  "tight-stack",
] as const;
export const IMAGE_DOMINANCE = [
  "none",
  "supporting",
  "balanced",
  "dominant",
] as const;
export const IMAGE_CROPS = [
  "natural",
  "tall",
  "square",
  "wide",
  "arch",
] as const;
export const PALETTE_BEHAVIOURS = [
  "ink-on-paper",
  "dark-field",
  "color-field",
  "duotone",
  "soft-neutral",
] as const;
export const ACCENT_SCARCITY = ["rare", "measured", "frequent"] as const;
export const SURFACE_STYLES = ["flat", "paper", "outlined", "raised"] as const;
export const BORDER_STYLES = ["none", "hairline", "heavy", "double"] as const;
export const RADIUS_STYLES = [
  "none",
  "slight",
  "soft",
  "round",
  "pill",
  "arch",
] as const;
export const SHAPE_LANGUAGES = [
  "rectilinear",
  "organic",
  "geometric",
  "arched",
] as const;
export const HEADER_STYLES = [
  "wordmark-left",
  "centered-stack",
  "minimal-bar",
  "split-rule",
  "overlay",
  "sticker",
] as const;
export const NAV_PATTERNS = ["inline", "menu-button", "centered"] as const;
export const BUTTON_CHARACTERS = [
  "solid-square",
  "solid-pill",
  "outline-fine",
  "underline",
  "stamp",
  "block-arrow",
] as const;

export const HERO_LAYOUTS = [
  "cinematic",
  "editorial-split",
  "type-dominant",
  "poster",
  "menu-focus",
  "booking-focus",
  "location-focus",
  "collage",
  "arch-portrait",
  "minimal-statement",
  "ticker-energy",
  "product-dominant",
  "call-first",
] as const;
export type HeroLayout = (typeof HERO_LAYOUTS)[number];

export const SERVICE_LAYOUTS = [
  "editorial-index",
  "menu-list",
  "image-tiles",
  "stacked-panels",
  "accordion",
  "sticky-split",
  "board",
  "ladder",
] as const;
export const PRODUCT_LAYOUTS = [
  "rail",
  "gallery-grid",
  "featured-pair",
  "price-menu",
] as const;
export const PROCESS_LAYOUTS = [
  "numerals",
  "horizontal-steps",
  "timeline-line",
] as const;
export const PROOF_LAYOUTS = ["spotlight", "stack", "facts-band"] as const;
export const FOOTER_STYLES = [
  "minimal",
  "brand-heavy",
  "columns",
  "local-card",
] as const;
export const SECTION_RHYTHMS = [
  "alternating",
  "continuous",
  "banded",
  "ruled",
] as const;
export const MOTION_INTENSITIES = [
  "none",
  "restrained",
  "measured",
  "expressive",
] as const;
export const MOTION_CHARACTERS = [
  "fade",
  "rise",
  "draw",
  "snap",
  "float",
] as const;
export const MOBILE_STRATEGIES = [
  "narrative-stack",
  "action-dock",
  "swipe-rail",
  "compact",
] as const;
export const SIGNATURE_MOTIFS = [
  "none",
  "hairline-rules",
  "numerals",
  "arch-frame",
  "stamp-label",
  "marquee-band",
  "corner-brackets",
  "grain-dots",
  "wave-edge",
  "diagonal-cut",
  "ticket-perforation",
  "monogram-seal",
] as const;

const e = <T extends readonly [string, ...string[]]>(v: T) => z.enum(v);

export const DesignGenomeSchema = z.object({
  version: z.literal(1).default(1),
  compositionMode: e(COMPOSITION_MODES),
  grid: e(GRIDS),
  alignment: e(ALIGNMENTS),
  density: e(DENSITIES),
  spacingRhythm: e(SPACING_RHYTHMS),
  typeVoice: e(TYPE_VOICES),
  typeContrast: e(TYPE_CONTRASTS),
  headlineBehavior: e(HEADLINE_BEHAVIOURS),
  imageDominance: e(IMAGE_DOMINANCE),
  imageCrop: e(IMAGE_CROPS),
  paletteBehavior: e(PALETTE_BEHAVIOURS),
  accentScarcity: e(ACCENT_SCARCITY),
  surfaceStyle: e(SURFACE_STYLES),
  borderStyle: e(BORDER_STYLES),
  radiusStyle: e(RADIUS_STYLES),
  shapeLanguage: e(SHAPE_LANGUAGES),
  headerStyle: e(HEADER_STYLES),
  navigationPattern: e(NAV_PATTERNS),
  buttonCharacter: e(BUTTON_CHARACTERS),
  heroPhilosophy: e(HERO_LAYOUTS),
  sectionRhythm: e(SECTION_RHYTHMS),
  proofPresentation: e(PROOF_LAYOUTS),
  servicePresentation: e(SERVICE_LAYOUTS),
  productPresentation: e(PRODUCT_LAYOUTS),
  processPresentation: e(PROCESS_LAYOUTS),
  footerStyle: e(FOOTER_STYLES),
  motionIntensity: e(MOTION_INTENSITIES),
  motionCharacter: e(MOTION_CHARACTERS),
  mobileStrategy: e(MOBILE_STRATEGIES),
  signatureMotif: e(SIGNATURE_MOTIFS),
});
export type DesignGenome = z.infer<typeof DesignGenomeSchema>;

export type GenomeField = Exclude<keyof DesignGenome, "version">;

/** The genome dimensions two designs must differ on to count as different design languages. */
export const IDENTITY_FIELDS: GenomeField[] = [
  "compositionMode",
  "typeVoice",
  "heroPhilosophy",
  "paletteBehavior",
  "radiusStyle",
  "headerStyle",
  "servicePresentation",
  "signatureMotif",
  "headlineBehavior",
  "buttonCharacter",
];

/** 0 = same design language, 1 = nothing in common (identity fields only). */
export function genomeDistance(a: DesignGenome, b: DesignGenome): number {
  const diff = IDENTITY_FIELDS.filter((k) => a[k] !== b[k]).length;
  return diff / IDENTITY_FIELDS.length;
}
