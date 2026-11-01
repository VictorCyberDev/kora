import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { planSite, renderSiteV2 } from "@kora/site-schema";
import { BRIEFS } from "../../../packages/site-schema/test/fixtures/briefs.js";
const names = (process.env.NAMES ?? "bakery,restaurant,salon,interior,fine").split(",");
for (const n of names) {
  const spec = planSite(BRIEFS[n]!, { direction: Number(process.env.DIR ?? 0) as 0 | 1 | 2 });
  const files = renderSiteV2(spec, { siteId: "00000000-0000-0000-0000-000000000000" });
  for (const [p, c] of Object.entries(files)) {
    const f = join("/tmp/claude-0/sites", n, p);
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, c as string);
  }
  console.log(n, Object.keys(files).join(","));
}
