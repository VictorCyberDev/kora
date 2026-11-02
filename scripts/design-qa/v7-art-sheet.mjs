import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("@playwright/test");
const dir = process.argv[2] ?? "/var/tmp/art"; const out = process.argv[3] ?? "/var/tmp/art-sheet.png"; const ids = (process.argv[4] ?? "bakery,barber,law").split(",");
const fm = ["social-square", "social-portrait", "story", "banner", "flyer-a5"]; const hh = 330;
const img = (f) => { const p = `${dir}/${f}.png`; return existsSync(p) ? `data:image/png;base64,${readFileSync(p).toString("base64")}` : ""; };
const html = `<body style="margin:0;background:#ddd;font:11px system-ui">${ids.map((id) => `<div style="display:flex;gap:10px;padding:10px;align-items:flex-start"><b style="width:60px">${id}</b>${fm.map((f) => `<img src="${img(`${id}-${f}`)}" style="height:${hh}px;border:1px solid #999">`).join("")}</div>`).join("")}`;
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 400 } }); await p.setContent(html); await p.screenshot({ path: out, fullPage: true }); await b.close();
