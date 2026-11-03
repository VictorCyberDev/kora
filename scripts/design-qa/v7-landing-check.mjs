import { createRequire } from "node:module";
const req = createRequire(import.meta.url);
const { chromium } = req("@playwright/test");
const AxeBuilder = req("@axe-core/playwright").default ?? req("@axe-core/playwright");
const b = await chromium.launch();
for (const [name,w,h] of [["d",1280,900],["m",390,844]]) {
  const ctx = await b.newContext({ viewport:{width:w,height:h}, deviceScaleFactor:1 });
  const p = await ctx.newPage();
  const errs=[]; const bad=[];
  p.on("console",m=>{if(m.type()==="error")errs.push(m.text())});
  p.on("response",r=>{if(r.status()>=400)bad.push(r.status()+" "+r.url())});
  await p.goto("http://127.0.0.1:3310/",{waitUntil:"networkidle"});
  await p.evaluate(async()=>{for(let y=0;y<document.body.scrollHeight;y+=600){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,120))}window.scrollTo(0,0)});
  await p.waitForTimeout(500);
  const ov = await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
  const broken = await p.evaluate(()=>[...document.images].filter(i=>i.complete&&i.naturalWidth===0).map(i=>i.src));
  let ax=[]; try{ax=(await new AxeBuilder({page:p}).analyze()).violations.map(v=>v.id+":"+v.nodes.length)}catch(e){ax=[String(e).slice(0,80)]}
  console.log(name,{overflow:ov,broken,errs,bad,ax});
  await p.screenshot({path:`/tmp/claude-0/-home-user-kora/4f0d1afe-dbf2-541a-81af-8551af5b06d9/scratchpad/land-${name}.png`,fullPage:true});
  await ctx.close();
}
await b.close();
