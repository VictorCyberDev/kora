// Builds a contact sheet PNG from captured screenshots (first screen of each), using the browser as the compositor.
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const { chromium } = createRequire(import.meta.url)("@playwright/test");
const dir = process.argv[2] ?? "/var/tmp/shots";
const out = process.argv[3] ?? "/var/tmp/sheet.png";
const idx = Number(process.argv[4] ?? 0);
const w = process.argv[5] ?? "1280";
const ids = [
  ...new Set(
    readdirSync(dir)
      .filter((f) => f.endsWith(`-${idx}-${w}.png`))
      .map((f) => f.replace(`-${idx}-${w}.png`, "")),
  ),
].sort();
const cell = w === "1280" ? 420 : 200;
const img = (id) =>
  `data:image/png;base64,${readFileSync(join(dir, `${id}-${idx}-${w}.png`)).toString("base64")}`;
const html = `<body style="margin:0;background:#e8e6e1;font:12px system-ui"><div style="display:grid;grid-template-columns:repeat(${w === "1280" ? 4 : 9},${cell}px);gap:10px;padding:10px">${ids.map((id) => `<div><div style="width:${cell}px;height:${w === "1280" ? 300 : 360}px;overflow:hidden;border:1px solid #bbb;background:#fff"><img src="${img(id)}" style="width:${cell}px"></div><div style="padding:3px 0">${id}</div></div>`).join("")}</div>`;
const b = await chromium.launch();
const p = await b.newPage({
  viewport: { width: w === "1280" ? 1750 : 1900, height: 900 },
});
await p.setContent(html);
await p.screenshot({ path: out, fullPage: true });
await b.close();
console.log(out, ids.length);
