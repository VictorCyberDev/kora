import {expect,test} from "@playwright/test";
const BASE=`http://127.0.0.1:${process.env.E2E_V3_PORT??"3212"}`;
test.use({baseURL:BASE});
test("Krevstudio user creates, edits, saves, reopens and exports an editable vector mark and matching flyer",async({browser})=>{
 test.setTimeout(200_000);
 const ctx=await browser.newContext({baseURL:BASE,acceptDownloads:true});
 const page=await ctx.newPage();
 try{
  await page.goto("/signup");
  const token=Date.now().toString(36);
  await page.getByLabel("Your name").fill("Krevstudio Test Owner");
  await page.getByLabel("Business name").fill("Meridian Bakes");
  await page.getByLabel("Email").fill(`krev-e2e-${token}@example.com`);
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button",{name:"Create account"}).click();
  await expect(page.getByRole("heading",{name:/Tell Krevstudio about your business/})).toBeVisible();
  const me=(await(await ctx.request.get("/api/auth/me")).json()).data;
  const created=await ctx.request.post("/api/sites",{
   headers:{"x-requested-with":"kora"},data:{orgId:me.orgs[0].id,name:"Meridian Bakes"},
  });
  expect(created.status()).toBe(201);
  const siteId=(await created.json()).data.id;
  const made=await ctx.request.post(`/api/sites/${siteId}/generate`,{
   headers:{"x-requested-with":"kora"},
   data:{name:"Meridian Bakes",description:"Artisan sourdough bread, pastries and custom cakes.",industry:"bakery",
     services:["Sourdough","Pastries","Custom cakes"],whatsapp:"+2348012345678"},
  });
  expect(made.status()).toBe(201);
  await page.goto(`/app/sites/${siteId}/creative-studio`);
  await expect(page.getByRole("heading",{name:"Creative workspace"})).toBeVisible();
  await page.getByLabel("Format").selectOption("logo");
  await page.getByLabel("Project title").fill("Meridian identity");
  await page.getByLabel("Headline or wordmark").fill("Meridian Bakes");
  await page.getByRole("button",{name:"Generate editable design"}).click();
  await expect(page.getByRole("img",{name:"Editable design canvas"})).toBeVisible();
  await page.getByRole("button",{name:/text/i}).first().click();
  await expect(page.getByRole("button",{name:"Save draft"})).toBeEnabled();
  await page.getByRole("button",{name:"Save draft"}).click();
  await expect(page.getByText(/Saved as immutable revision/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button",{name:/Meridian identity/})).toBeVisible();
  await page.getByRole("button",{name:/Meridian identity/}).click();
  await expect(page.getByRole("img",{name:"Editable design canvas"})).toBeVisible();
  await page.getByRole("button",{name:"Approve and use as brand logo"}).click();
  await expect(page.getByText(/New graphics will reuse it/)).toBeVisible();
  await page.getByLabel("Format").selectOption("flyer");
  await page.getByLabel("Project title").fill("Bakery launch flyer");
  await page.getByLabel("Headline or wordmark").fill("Artisan sourdough and pastries");
  await page.getByRole("button",{name:"Generate editable design"}).click();
  await expect(page.getByRole("img",{name:"Editable design canvas"})).toBeVisible();
  await page.screenshot({path:"test-results/kora-studio-benchmark/krevstudio-graphics-editor.png",fullPage:true,animations:"disabled"});
  const exportJson=page.waitForEvent("download");
  await page.getByRole("button",{name:"Export editable JSON"}).click();
  expect((await exportJson).suggestedFilename()).toContain("krevstudio-flyer");
  const exportPng=page.waitForEvent("download");
  await page.getByRole("button",{name:"Export PNG"}).click();
  expect((await exportPng).suggestedFilename()).toContain(".png");
  const current=await ctx.request.get(`/api/sites/${siteId}/creative-documents`);
  expect(current.status()).toBe(200);
  const docs=(await current.json()).data;
  expect(docs.length).toBeGreaterThanOrEqual(2);
  const flyer=docs.find((d:{kind:string})=>d.kind==="flyer");
  const logo=docs.find((d:{kind:string})=>d.kind==="logo");
  const flyerDetail=(await(await ctx.request.get(`/api/sites/${siteId}/creative-documents/${flyer.id}`)).json()).data;
  expect(flyerDetail.source.approvedLogoId).toBe(logo.id);
 }finally{await ctx.close();}
});
