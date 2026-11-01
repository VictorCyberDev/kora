// Summarises a pilot from a JSON file: [{ "id": "biz-1", "consented": true, "metrics": { "enquiries_per_week": 4 } }, ...]
// Usage: node scripts/pilot-summary.mjs pilot.json
// Businesses without consent are excluded. Fewer than 10 counted businesses is reported as not conclusive.
import { readFileSync } from "node:fs";
import { pilotSummary } from "../packages/growth/dist/src/index.js";
const file = process.argv[2];
if (!file) throw new Error("usage: pilot-summary.mjs <pilot.json>");
const data = JSON.parse(readFileSync(file, "utf8"));
if (!Array.isArray(data))
  throw new Error("expected a JSON array of businesses");
console.log(JSON.stringify(pilotSummary(data), null, 2));
