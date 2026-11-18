import {expect,test} from "@playwright/test";
import {mkdirSync,writeFileSync} from "node:fs";
import {buildCreativeDocument,renderSlideSvg} from "../apps/api/src/platform/creative-documents";
const briefs=[
 ["bakery","Meridian Bakes","Artisan sourdough, pastries and celebration cakes"],
 ["beauty","Velvet Studio","Hair styling, makeup and nail care"],
 ["fashion","Atelier Nova","Tailored clothing and accessories"],
 ["realestate","Northline Homes","Property viewings and residential listings"],
 ["creative","Kochab Works","Motion graphics and digital branding"],
 ["education","Bright Path","Workshops, tutoring and small-group learning"],
 ["fitness","Pulse Movement","Movement classes, strength and training"],
 ["technology","Meridian Cloud","Web applications, APIs and integrations"],
 ["photography","Luma Portraits","Brand photography and event portraits"],
 ["restaurant","Terrace Table","Freshly prepared lunch and dinner"],
] as const;
const colors=[
 ["#fcf4e8","#272421","#945e3c","#e1aa82"],
 ["#fff8f6","#302a2e","#97516e","#e3a5b9"],
 ["#f6f4ef","#141e28","#4e6290","#a0b6d3"],
 ["#fbf6eb","#272020","#775a50","#c29c86"],
 ["#edf5f0","#183b35","#27735f","#9fd3b8"],
] as const;
test("55 authentic graphic and vector sources render for ten industries; five connected brand systems retain logo provenance",async({browser})=>{
 test.setTimeout(240_000);
 mkdirSync("test-results/kora-studio-benchmark",{recursive:true});
 const ctx=await browser.newContext({viewport:{width:600,height:900},reducedMotion:"reduce"});
 const page=await ctx.newPage();
 const evidence:Array<{industry:string;kind:string;slideCount:number;dimensions:string;rendered:boolean;humanReviewed:boolean;visionReviewed:boolean;approvedLogoReused:boolean}>=[];
 try{
  for(let i=0;i<briefs.length;i++){
   const [industry,name,description]=briefs[i]!;
   const pal=colors[i%colors.length]!;
   const brandBase={version:3,name,colors:{background:pal[0],foreground:pal[1],primary:pal[2],accent:pal[3]}};
   const logo=buildCreativeDocument({kind:"logo",title:`${name} identity`,headline:name,logoForm:(["wordmark","lettermark","monogram","geometric","abstract","combination","emblem","icon"] as const)[i%8]!,direction:i%3},brandBase);
   const logoId=crypto.randomUUID();
   const brand={...brandBase,approvedLogo:{id:logoId,source:logo}};
   const kinds:Array<"logo"|"flyer"|"poster"|"social"|"ad"|"carousel">=["logo","flyer","poster","social","ad"];
   if(i<5)kinds.push("carousel");
   for(const kind of kinds){
    const doc=kind==="logo"?logo:buildCreativeDocument({
      kind,title:`${name} ${kind}`,headline:description.slice(0,90),
      description:`Created for ${name}.`,cta:"Contact us",
      slides:kind==="carousel"?5:1,direction:i%3
    },brand);
    expect(doc.brandVersion).toBe(3);
    if(kind!=="logo")expect(doc.approvedLogoId).toBe(logoId);
    for(let j=0;j<doc.slides.length;j++){
      const slide=doc.slides[j]!;
      const svg=renderSlideSvg(slide);
      expect(svg).toContain("<svg");
      expect(svg).not.toContain("<script>");
      const encoded=Buffer.from(svg,"utf8").toString("base64");
      await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#ece9e3;display:grid;place-items:center;min-height:100vh"><img alt="Actual Krevstudio source render" style="width:min(96%,540px);height:auto" src="data:image/svg+xml;base64,${encoded}"></body></html>`);
      const img=page.getByRole("img",{name:"Actual Krevstudio source render"});
      await expect(img).toBeVisible();
      expect(await img.evaluate((el:HTMLImageElement)=>el.complete&&el.naturalWidth>0)).toBe(true);
      if(j===0){
       await img.screenshot({
        path:`test-results/kora-studio-benchmark/graphic-${industry}-${kind}.png`,
        animations:"disabled"
       });
      }
    }
    evidence.push({
      industry,kind,slideCount:doc.slides.length,
      dimensions:`${doc.slides[0]!.width}x${doc.slides[0]!.height}`,
      rendered:true,humanReviewed:false,visionReviewed:false,
      approvedLogoReused:kind!=="logo"&&doc.approvedLogoId===logoId
    });
   }
  }
 }finally{await ctx.close();}
 expect(evidence.filter(x=>x.kind==="logo")).toHaveLength(10);
 for(const kind of ["flyer","poster","social","ad"])expect(evidence.filter(x=>x.kind===kind)).toHaveLength(10);
 expect(evidence.filter(x=>x.kind==="carousel")).toHaveLength(5);
 expect(evidence.filter(x=>x.approvedLogoReused)).toHaveLength(45);
 writeFileSync("test-results/kora-studio-benchmark/graphics-source-review.json",
  JSON.stringify({testMode:"actual generated source, browser SVG rasterization",
   disclaimer:"Source rendering is not human/aesthetic acceptance. No screenshots were manually or vision-model reviewed.",
   screenshots:evidence.length,humanReviewed:false,visionReviewed:false,evidence},null,2));
});
