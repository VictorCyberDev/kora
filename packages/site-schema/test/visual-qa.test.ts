import {describe,expect,it} from "vitest";
import {composeDirections} from "@kora/creative";
import {planSiteV3} from "../src/v3/plan.js";
import {reviewScreenshot,proposeVisualRevision,screenshotGate,MAX_VISUAL_REVISIONS} from "../src/v3/visual-qa.js";
const spec=()=>{const b={name:"Aster Bakes",description:"An artisan bakery offering bread, fresh pastry and celebration cakes.",industry:"bakery",services:["Bread","Pastries","Cakes"],whatsapp:"+2348012345678"};return planSiteV3(b,composeDirections(b)[0]!).spec};
const observation={page:"home",viewport:"mobile" as const,width:390,height:850,uniqueColorBuckets:28,backgroundFraction:0.4,horizontalOverflowPx:0,headlineOverflowPx:0,headlineLines:2,mainContentPresent:true,contactActionVisible:true,brokenImageCount:0,linksWithoutNames:0,missingImageAlt:0,undersizedTouchTargets:0};
describe("rendered screenshot review contract",()=>{
 it("flags real measured failures and refuses to call them fixed",()=>{const o={...observation,horizontalOverflowPx:24,brokenImageCount:1};expect(screenshotGate([o]).ok).toBe(false);expect(reviewScreenshot(o).map(f=>f.code)).toContain("BROKEN_IMAGE")});
 it("retains approved business truth during bounded visual changes",()=>{const base=spec();base.design.genome.headlineBehavior="oversized";const original=JSON.stringify(base.business);const result=proposeVisualRevision(base,{...observation,headlineLines:9,contactActionVisible:false},0);expect(result.applied).toContain("HEADLINE_SIZE_REDUCED");expect(JSON.stringify(result.spec.business)).toBe(original);expect(JSON.stringify(base.business)).toBe(original)});
 it("rejects unbounded retries and malformed pixel evidence",()=>{expect(()=>proposeVisualRevision(spec(),observation,MAX_VISUAL_REVISIONS)).toThrow("budget");expect(()=>reviewScreenshot({...observation,backgroundFraction:3})).toThrow()});
});
