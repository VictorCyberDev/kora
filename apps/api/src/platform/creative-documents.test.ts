import {describe,it,expect} from "vitest";
import {buildCreativeDocument,creativeDocumentSchema,renderSlideSvg} from "./creative-documents.js";
const brand={version:3,name:"Meridian Bakes",colors:{background:"#f8f3e9",foreground:"#202020",primary:"#86512e",accent:"#dd9f73"}};
describe("Krevstudio editable documents",()=>{
 it.each(["flyer","poster","social","story","carousel","banner","logo"] as const)("produces a schema-valid brand-bound %s",kind=>{
   const doc=buildCreativeDocument({kind,title:"Launch",headline:"Sourdough and pastries",description:"Fresh bread",cta:"Message us",direction:0,slides:kind==="carousel"?4:1},brand);
   expect(creativeDocumentSchema.parse(doc)).toEqual(doc);
   expect(doc.brandVersion).toBe(3);
   expect(doc.slides).toHaveLength(kind==="carousel"?4:1);
   expect(doc.slides[0]!.layers.length).toBeGreaterThan(1);
   expect(renderSlideSvg(doc.slides[0]!)).toContain('xmlns="http://www.w3.org/2000/svg"');
 });
 it("escapes supplied text and never embeds scripts or foreign SVG",()=>{
   const doc=buildCreativeDocument({kind:"flyer",title:"Test",headline:'<script>alert("no")</script>',description:"",cta:"",direction:1,slides:1},brand);
   const svg=renderSlideSvg(doc.slides[0]!);
   expect(svg).not.toContain("<script>");
   expect(svg).toContain("&lt;script&gt;");
 });
 it("does not fabricate a sale amount or deadline",()=>{
   const doc=buildCreativeDocument({kind:"poster",title:"Campaign",headline:"Our offers",description:"",cta:"",direction:2,slides:1},brand);
   const text=JSON.stringify(doc);
   expect(text).not.toMatch(/30% off|save 50%|tomorrow only/i);
 });
 it("generates genuinely different editable vector compositions",()=>{
   const create=(direction:number)=>buildCreativeDocument({kind:"logo",title:"Identity",headline:"Meridian Bakes",description:"",cta:"",direction,slides:1},brand).slides[0]!;
   const a=create(0),b=create(1),c=create(2);
   expect([a,b,c].map(x=>JSON.stringify(x.layers.map(l=>l.type)))).toEqual([
     JSON.stringify(["rect","ellipse","text"]),
     JSON.stringify(["rect","rect","text"]),
     JSON.stringify(["ellipse","rect","text"]),
   ]);
 });
 it("rejects unsafe layer data and excessive resource use",()=>{
   const doc=buildCreativeDocument({kind:"social",title:"Launch",headline:"New products",description:"",cta:"",direction:0,slides:1},brand);
   expect(()=>creativeDocumentSchema.parse({...doc,slides:[{...doc.slides[0]!,layers:[{...doc.slides[0]!.layers[0]!,fill:"url(https://evil.example)"}]}]})).toThrow();
   expect(()=>creativeDocumentSchema.parse({...doc,slides:Array.from({length:11},()=>doc.slides[0]!)})).toThrow();
 });
});
