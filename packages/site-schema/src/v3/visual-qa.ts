/**
 * Screenshot-driven, bounded design review.
 *
 * Observations MUST be produced from a rendered browser viewport and captured
 * image, never guessed from SiteSpec. This pure module consumes that evidence,
 * returns actionable findings, and proposes only reversible, fact-preserving
 * changes to the design genome. Image relevance and aesthetics still require
 * human or an authorized vision-model review.
 */
import { z } from "zod";
import { parseSiteSpecV3, type SiteSpecV3 } from "./spec.js";

export const screenshotObservationSchema = z.object({
  page: z.string().min(1).max(50),
  viewport: z.enum(["desktop","tablet","mobile"]),
  width: z.number().int().min(240).max(3840),
  height: z.number().int().min(200).max(20000),
  /** PNG pixel evidence, measured from the actual screenshot. */
  uniqueColorBuckets: z.number().int().min(1).max(512),
  backgroundFraction: z.number().min(0).max(1),
  /** Document and element geometry measured from the same rendered viewport. */
  horizontalOverflowPx: z.number().min(0),
  headlineOverflowPx: z.number().min(0),
  headlineLines: z.number().min(0).max(100),
  mainContentPresent: z.boolean(),
  contactActionVisible: z.boolean(),
  brokenImageCount: z.number().int().min(0),
  linksWithoutNames: z.number().int().min(0),
  missingImageAlt: z.number().int().min(0),
  undersizedTouchTargets: z.number().int().min(0),
});
export type ScreenshotObservation = z.infer<typeof screenshotObservationSchema>;
export type ScreenshotFinding = {
  code: "HORIZONTAL_OVERFLOW"|"HEADLINE_CLIPPED"|"TOO_MANY_HEADLINE_LINES"|"MISSING_MAIN"|"CONTACT_ACTION_NOT_VISIBLE"|"BROKEN_IMAGE"|"UNNAMED_LINK"|"MISSING_IMAGE_ALT"|"SMALL_TOUCH_TARGET"|"MONOTONE_SCREENSHOT";
  severity: "block"|"warn";
  message: string;
  /** Never confuse a proposed repair with a verified fixed screenshot. */
  autoRepairable: boolean;
};
export function reviewScreenshot(raw: unknown): ScreenshotFinding[] {
  const o=screenshotObservationSchema.parse(raw);
  const findings: ScreenshotFinding[] = [];
  const add=(code: ScreenshotFinding["code"],severity: ScreenshotFinding["severity"],message:string,autoRepairable=false)=>
    findings.push({code,severity,message,autoRepairable});
  if(o.horizontalOverflowPx>1)add("HORIZONTAL_OVERFLOW","block",`Document exceeds ${o.width}px viewport by ${o.horizontalOverflowPx}px`);
  if(o.headlineOverflowPx>1)add("HEADLINE_CLIPPED","block",`Main headline is clipped by ${o.headlineOverflowPx}px`,true);
  if(o.viewport==="mobile"&&o.headlineLines>6)add("TOO_MANY_HEADLINE_LINES","warn",`Main headline occupies ${o.headlineLines} mobile lines`,true);
  if(!o.mainContentPresent)add("MISSING_MAIN","block","Rendered page has no visible main content");
  if(!o.contactActionVisible)add("CONTACT_ACTION_NOT_VISIBLE","warn","No visible contact or conversion action in the document",true);
  if(o.brokenImageCount)add("BROKEN_IMAGE","block",`${o.brokenImageCount} image(s) failed to load`);
  if(o.linksWithoutNames)add("UNNAMED_LINK","block",`${o.linksWithoutNames} link(s) have no accessible name`);
  if(o.missingImageAlt)add("MISSING_IMAGE_ALT","warn",`${o.missingImageAlt} image(s) lack an alt attribute`);
  if(o.undersizedTouchTargets>3&&o.viewport==="mobile")add("SMALL_TOUCH_TARGET","warn",`${o.undersizedTouchTargets} interactive elements are smaller than 24 CSS pixels`);
  if(o.backgroundFraction>0.97&&o.uniqueColorBuckets<5)add("MONOTONE_SCREENSHOT","warn","The captured composition is almost entirely one color; review whether content actually rendered");
  return findings;
}
export const MAX_VISUAL_REVISIONS = 2;
/** Does not alter factual copy, brand-approved colors, photos or published data. */
export function proposeVisualRevision(
  spec: SiteSpecV3, observation: ScreenshotObservation, attempt: number,
): {spec:SiteSpecV3; applied: string[]; requiresReview: ScreenshotFinding[]} {
  if(!Number.isInteger(attempt)||attempt<0||attempt>=MAX_VISUAL_REVISIONS)
    throw new Error("Visual revision budget exhausted");
  const findings=reviewScreenshot(observation);
  const next=structuredClone(parseSiteSpecV3(spec));
  const applied:string[]=[];
  if(findings.some(f=>f.code==="HEADLINE_CLIPPED"||f.code==="TOO_MANY_HEADLINE_LINES")&&
    next.design.genome.headlineBehavior==="oversized") {
    next.design.genome.headlineBehavior="sentence";
    applied.push("HEADLINE_SIZE_REDUCED");
  }
  if(findings.some(f=>f.code==="CONTACT_ACTION_NOT_VISIBLE")&&observation.viewport==="mobile"&&
    (next.business.whatsapp||next.business.phone)&&
    next.design.genome.mobileStrategy!=="action-dock"){
    next.design.genome.mobileStrategy="action-dock";
    applied.push("MOBILE_CONTACT_PRIORITY");
  }
  return {spec:parseSiteSpecV3(next),applied,requiresReview:findings};
}
/** Explicit pass criterion: no screenshot-driven blocks and no unresolved spec blocks. */
export function screenshotGate(observations: ScreenshotObservation[]):{
  ok:boolean; findings:Array<ScreenshotFinding & {page:string;viewport:string}>;
} {
  const findings=observations.flatMap(o=>reviewScreenshot(o).map(f=>({...f,page:o.page,viewport:o.viewport})));
  return {ok:!findings.some(f=>f.severity==="block"),findings};
}
