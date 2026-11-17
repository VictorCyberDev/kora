import {describe,it,expect,beforeAll,afterAll} from "vitest";
import {startHarness,type Harness} from "./test-support/platform-harness.js";
const enabled=Boolean(process.env.DATABASE_URL);
const suite=enabled?describe:describe.skip;
let h:Harness;
beforeAll(async()=>{if(enabled)h=await startHarness({env:{KORA_CREATIVE_ENGINE:"v3"}})});
afterAll(async()=>{if(enabled)await h.close()});
const brief={name:"Meridian Bakes",industry:"bakery",description:"Artisan sourdough bread, pastries and custom cakes.",services:["Sourdough","Pastries","Custom cakes"],whatsapp:"+2348012345678"};
suite("M3/M4 real authenticated creative document lifecycle",()=>{
 it("creates, edits, reopens, restores and exports vector graphics with tenant isolation",async()=>{
  const owner=await h.signup("krevm3-owner@example.com");
  const site=(await h.call("POST","/api/sites",{cookie:owner.cookie,body:{orgId:owner.orgId,name:brief.name}})).json.data;
  const gen=await h.call("POST",`/api/sites/${site.id}/generate`,{cookie:owner.cookie,body:brief});
  expect(gen.status).toBe(201);
  const req={kind:"carousel",title:"Bakery launch",headline:"Meridian Bakes",description:"Artisan sourdough bread",cta:"Message us",slides:4,direction:1};
  const made=await h.call("POST",`/api/sites/${site.id}/creative-documents`,{cookie:owner.cookie,body:req});
  expect(made.status).toBe(201);
  const id=made.json.data.id as string;
  expect(made.json.data.source.slides).toHaveLength(4);
  const before=await h.call("GET",`/api/sites/${site.id}/creative-documents/${id}`,{cookie:owner.cookie});
  expect(before.json.data.revision).toBe(1);
  const updated=structuredClone(before.json.data.source);
  updated.slides[1].layers[1].text="Our Saturday launch";
  const edit=await h.call("PUT",`/api/sites/${site.id}/creative-documents/${id}`,{cookie:owner.cookie,body:{revision:1,source:updated}});
  expect(edit.status).toBe(200);
  expect(edit.json.data.revision).toBe(2);
  const stale=await h.call("PUT",`/api/sites/${site.id}/creative-documents/${id}`,{cookie:owner.cookie,body:{revision:1,source:updated}});
  expect(stale.status).toBe(409);
  const reopen=await h.call("GET",`/api/sites/${site.id}/creative-documents/${id}`,{cookie:owner.cookie});
  expect(reopen.json.data.source.slides[1].layers[1].text).toBe("Our Saturday launch");
  const response=await fetch(h.base+`/api/sites/${site.id}/creative-documents/${id}/export/0`,{headers:{cookie:owner.cookie}});
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("image/svg+xml");
  expect(await response.text()).toContain("<svg");
  const other=await h.signup("krevm3-other@example.com");
  const hidden=await h.call("GET",`/api/sites/${site.id}/creative-documents/${id}`,{cookie:other.cookie});
  expect([403,404]).toContain(hidden.status);
  const restore=await h.call("POST",`/api/sites/${site.id}/creative-documents/${id}/restore`,{
   cookie:owner.cookie,body:{revision:1,currentRevision:2},
  });
  expect(restore.status).toBe(200);
  expect(restore.json.data.revision).toBe(3);
  const history=await h.call("GET",`/api/sites/${site.id}/creative-documents/${id}/history`,{cookie:owner.cookie});
  expect(history.json.data).toHaveLength(3);
 });
 it("approves a vector logo and binds new designs to a new immutable BrandOS version",async()=>{
  const owner=await h.signup("krevm4-owner@example.com");
  const site=(await h.call("POST","/api/sites",{cookie:owner.cookie,body:{orgId:owner.orgId,name:brief.name}})).json.data;
  const gen=await h.call("POST",`/api/sites/${site.id}/generate`,{cookie:owner.cookie,body:brief});
  expect(gen.status).toBe(201);
  const logo=await h.call("POST",`/api/sites/${site.id}/creative-documents`,{cookie:owner.cookie,
   body:{kind:"logo",title:"Approved monogram",headline:"Meridian Bakes",direction:1}});
  expect(logo.status).toBe(201);
  const logoId=logo.json.data.id;
  const activationBefore=await h.call("POST",`/api/sites/${site.id}/creative-documents/${logoId}/activate-logo`,{cookie:owner.cookie});
  expect(activationBefore.status).toBe(409);
  const approved=await h.call("POST",`/api/sites/${site.id}/creative-documents/${logoId}/approve`,{cookie:owner.cookie,body:{revision:1}});
  expect(approved.status).toBe(200);
  const activate=await h.call("POST",`/api/sites/${site.id}/creative-documents/${logoId}/activate-logo`,{cookie:owner.cookie});
  expect(activate.status).toBe(200);
  expect(activate.json.data.version).toBeGreaterThan(1);
  const graphic=await h.call("POST",`/api/sites/${site.id}/creative-documents`,{
   cookie:owner.cookie,body:{kind:"flyer",title:"Seasonal launch",headline:"Artisan pastries",direction:0},
  });
  expect(graphic.status).toBe(201);
  expect(graphic.json.data.source.approvedLogoId).toBe(logoId);
  expect(graphic.json.data.source.brandVersion).toBe(activate.json.data.version);
  const swap=structuredClone(graphic.json.data.source);
  swap.approvedLogoId=crypto.randomUUID();
  const illegal=await h.call("PUT",`/api/sites/${site.id}/creative-documents/${graphic.json.data.id}`,{
   cookie:owner.cookie,body:{revision:1,source:swap},
  });
  expect(illegal.status).toBe(409);
 });
});
