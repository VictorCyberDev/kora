import {describe,expect,it} from "vitest";
import {mediaUrls,unapprovedMediaUrls} from "./studio-media-guard.js";
const old={
  business:{logo:{url:"https://media.example.test/logo.webp"}},
  pages:[{slug:"home",sections:[
    {type:"hero",media:{url:"https://images.unsplash.com/retained",srcset:[{url:"https://images.unsplash.com/retained-small"}]}},
    {type:"gallery",items:[{media:{url:"https://media.example.test/owner-existing.webp"}}]},
  ]}],
};
describe("Studio media tenancy",()=>{
 it("collects nested media, srcset and logos but does not confuse link hrefs with photo assets",()=>{
   const urls=mediaUrls({...old,footer:{links:[{href:"https://example.test/"}]}});
   expect(urls.size).toBe(4);
   expect(urls.has("https://example.test/")).toBe(false);
 });
 it("permits reuse of original approved stock and site-owned image variants",()=>{
   const next={...old,pages:[{sections:[{media:{url:"https://media.example.test/new-owner.webp",
      srcset:[{url:"https://media.example.test/new-owner-small.webp"}]}},
      {media:{url:"https://images.unsplash.com/retained"}}]}]};
   expect(unapprovedMediaUrls(old,next,[{
     url:"https://media.example.test/new-owner.webp",
     srcset:[{url:"https://media.example.test/new-owner-small.webp"}],
   }])).toEqual([]);
 });
 it("rejects cross-tenant URLs for all operations, including nested gallery images",()=>{
   const evil={...old,pages:[{sections:[{type:"gallery",items:[
     {media:{url:"https://other-site.example.test/other-owner.webp"}},
   ]}]}]};
   expect(unapprovedMediaUrls(old,evil,[])).toEqual([
     "https://other-site.example.test/other-owner.webp",
   ]);
 });
 it("rejects a swapped srcset variant even when the primary image URL stays unchanged",()=>{
   const mutated=structuredClone(old);
   (mutated.pages[0]!.sections[0] as {media:{srcset:Array<{url:string}>}}).media.srcset=[{url:"https://attacker.example.test/trojan.webp"}];
   expect(unapprovedMediaUrls(old,mutated,[])).toContain("https://attacker.example.test/trojan.webp");
 });
});
