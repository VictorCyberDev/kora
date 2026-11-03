#!/usr/bin/env bash
# Regenerates every set the review is made from, with the CURRENT engine, and captures them in Chromium
# (axe + overflow + console + fonts). Sheets are assembled afterwards by v7-sheet.mjs / v7-art-sheet.mjs.
# usage: scripts/design-qa/v7-final.sh <workDir>
set -euo pipefail
W="${1:-/var/tmp/v7-final}"
rm -rf "$W"; mkdir -p "$W"
MODE=plain    node scripts/design-qa/v7-golden.mjs "$W/gold"     > "$W/gold.log" 2>&1
MODE=enriched node scripts/design-qa/v7-golden.mjs "$W/enriched" > "$W/enriched.log" 2>&1
MODE=v2       node scripts/design-qa/v7-golden.mjs "$W/v2"       > "$W/v2.log" 2>&1
BRIEFS=sameindustry MODE=plain node scripts/design-qa/v7-golden.mjs "$W/same" > "$W/same.log" 2>&1
for s in gold enriched same; do
  node scripts/design-qa/v7-shoot.mjs "$W/$s" "$W/shots-$s" "" 390,1280 | tee "$W/shoot-$s.log" | tail -3
done
# the v2 designer's output for the before/after comparison (desktop and phone, first direction only)
IDX=0 node scripts/design-qa/v7-shoot.mjs "$W/v2" "$W/shots-v2" "" 390,1280 | tee "$W/shoot-v2.log" | tail -3
node scripts/design-qa/v7-artifacts.mjs "$W/art" > "$W/art.log" 2>&1 || true
echo done > "$W/DONE"
