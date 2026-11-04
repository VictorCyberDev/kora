# Prompt for Cowork: build Kora v7 (the creative operating system)

Copy everything below the line into Cowork. It is self-contained. Repository: `VictorCyberDev/kora` (pnpm monorepo, TypeScript, Postgres, Fastify API, React web app, Playwright e2e).

---

## ROLE

You are the lead engineer and art director for Kora v7. Kora is "your creative and growth team, as software": a small-business owner writes two sentences and Kora creates a brand, a website, the flyers, posts and stories that match it, asks before anything goes out, and then keeps the presence monitored and recoverable after launch. You build it end to end, prove it with evidence, and never claim more than you observed.

## THE PRODUCT IN ONE PARAGRAPH

An owner describes their business. Kora works out what is TRUE (told by the owner / worked out / still missing / never allowed), proposes THREE genuinely different design directions with a recommendation and a reason, records the chosen one as a versioned BRAND OS, builds a SITE from it with a closed, validated vocabulary and a trusted renderer, makes flyers/posts/stories/WhatsApp status/banners from the same Brand OS, lets the owner change the brand in plain words, uses the owner's own logo and photos when they exist, publishes through the existing trust pipeline (validate, immutable version, publish, verify live bytes, monitor, approved rollback, verified recovery) and never posts or spends without approval.

## NON-NEGOTIABLE RULES

1. **Trust core is unchanged.** Models never emit HTML, CSS or script and are never the publishing authority. Every field is an enum or a validated string; unknown components, fonts, colours, link schemes and media origins cannot enter a spec. No free-form HTML. Do not weaken validation, approvals, tenant isolation or the CSRF guard (`x-requested-with: kora` on mutating `/api/` calls).
2. **v1 and v2 are untouched.** SiteSpec v1/v2 renderers and golden hashes must not change. v3 is additive behind `KORA_CREATIVE_ENGINE=v2|v3` (default `v2`). No site is converted automatically; "Try a new Kora design" creates a NEW draft; the live version keeps serving until published; rollback is the existing path.
3. **History is immutable.** Brand OS versions are append-only and hash-bound. Changing a brand writes version N+1; earlier versions, site versions and artifacts are never rewritten. Artifacts store their brand version.
4. **Truth over polish.** Never invent numbers, prices, years, awards, guarantees, testimonials, people, or reviews. Missing facts are asked for, not made up. Structured data (JSON-LD) carries only supplied facts. `og:image` only from a real picture of the business.
5. **Honest labels.** Use IMPLEMENTED / STUB_TESTED / LOCAL_ACCEPTED / PRODUCTION_ACCEPTED / EXTERNAL_ACCEPTANCE_PENDING / NOT_DONE. PRODUCTION_ACCEPTED only with real evidence from the real URL. Report test numbers exactly. If a check was skipped, say so.
6. **Deterministic first.** v3 generation needs no model. A model may only assist (optional copy), and only through a validator against the owner's facts with a deterministic fallback.
7. **Never auto-post or spend.** Live social posting is NOT_CONFIGURED; artifacts are created, never posted. Campaign proposals carry `autoPublish:false`, `spends:false`.
8. **Look at the output.** Automated checks are necessary, not sufficient. Render, screenshot and read every set you ship, at 390 px and 1280 px. A defect someone could point at is not "done".

## ARCHITECTURE TO BUILD

Packages and apps (existing workspace): `packages/creative` (new), `packages/site-schema` (add v3), `packages/growth`, `packages/site-fonts`, `packages/site-media`, `apps/api`, `apps/web`, `apps/site-host`, `e2e`, `scripts`.

### 1. `@kora/creative` (the thinking)

- **Business Truth**: facts classed supplied / inferred / missing / prohibited; invented-number detection.
- **Vertical Intelligence**: 62 verticals in 13 clusters (food, beauty, trades, professional, health, creative, hospitality, retail, education, civic, tech, agri, mobility), each with customer, job to be done, primary/secondary intent (call, whatsapp, quote, book, visit, order), trust barrier, useful content, pages, curated grammars, anti-traits. Cluster-level "never dress as" rules (a builder, clinic, law firm, mechanic, hotel is never offered cartoon/nursery language unless the owner names it).
- **15 first-party design grammars** (e.g. trade-solid, neighbourhood-energy, quiet-authority, gallery-monograph, sunday-table, handmade-modern, fresh-market, lush-retreat, precision-practice, civic-warmth, grand-stay, after-dark, fashion-edit, signal-product, play-school), each with colourways, voice, signature device, anti-patterns, campaign behaviour.
- **Design Genome** (30 dimensions): composition, grid, density, rhythm, type voice (17 voices over OFL fonts, bundled, no third-party requests), type contrast, headline behaviour, image dominance/crop, palette behaviour, accent scarcity, surface, border, radius, shape, header, nav, buttons, hero philosophy, service/product/process/proof layouts, footer, motion intensity/character, mobile strategy, signature motif.
- **Three-direction engine**: best fit, then most different from it, then most different from both; controlled variation so two businesses sharing a grammar still differ; "choose for me" with a stated reason (never simply the first). `avoidGrammarIds` for template fatigue.
- **Brand OS** (`kora.brand-os/1`): name, grammar, strategy (essence, audience, positioning, personality, voice, tone, anti-traits), genome, visual (colourway, mode, 5 palette roles, type voice, motif, shape, logo asset id, wordmark), voice (tone, CTA language, use/avoid words with cliché list), media briefs and source priority, channel rules, dos/donts, provenance (`kora-deterministic` | `owner-edit` | `inferred-from-site`). Stable content hash.
- **History and taste**: design decisions stored in design terms (grammar, type voice, colourway, composition; chosen and passed over). `fatigueAvoid` (recency half-life 45 days, threshold 1.2, at most two avoided). `tasteSignals` claims nothing below three judgements; `rerankByTaste` moves only the recommendation (+1/+0.5/-1.5), owner can pick any.
- **ArtifactSpec** (`kora.artifact/1`) and renderer: square, portrait, story, WhatsApp status, banner, A5 flyer (3 mm bleed, RGB, not press-ready), carousel cover, og-image 1200x630; per-format composition and safe zones; logo drawing, focal-aware photo cover; geometry gates (text on canvas, out of platform chrome); copy composed by Kora may not contain unsupplied figures.
- **Colour engine**: every text pair at WCAG AA across all surfaces (`legibleOnAll`), cluster hue avoidance (food never on cold blue), distinct colourways within a set.
- **Reference atlas**: 100+ principle entries as design MEMORY (principle, signature, why it works, when it fails, small-business applicability, grammars informed, `doNotCopy`). Evidence classes DIRECT_SITE_REVIEW / SEARCH_LEAD / ANALYST_MEMORY; only the first counts as studied.

### 2. SiteSpec v3 (`@kora/site-schema/v3`)

- Closed vocabulary: 13 hero layouts (with variants), 8 offer layouts, products/story/process/gallery/proof/faq/visit/contact/cta sections, ticker/statement, procedural plates (arch, stripes, circles, checker, sunburst, lines, monogram, stack), media with provenance, focal point, srcset (https only), roles and treatments.
- **Planner** (page architecture from customer intent, never a template skeleton), **trusted renderer** (all text escaped, CSP unchanged, no inline executable script; inline JSON-LD data block only), **critic** with structured defect taxonomy (HERO_WEAK_HIERARCHY, CTA_TOO_GENERIC, TOO_MANY_CARD_GRIDS, COPY_CLICHE, INVENTED_NUMBER (block), UNSUPPORTED_CLAIM (block), MEDIA_UNREVIEWED (block), IMAGE_ALT_MISSING, MOBILE_ACTION_BURIED, cross-channel drift…) across twelve dimensions, safe `repairV3`, **structured edits** (nudges, colourway, type voice, move/remove section, hero text, contact, CTA label; plain-word matching to validated edits only; an unmatched request changes nothing), anti-sameness metric (`similarityV3`, `diversityReport`).
- Nudges: premium, bolder, calmer, playful, warmer, cooler, darker, lighter, editorial, product-focused, minimal, less-text, more-image, stronger-whatsapp, more-contrast. Palette nudges choose another colourway of the SAME grammar; if none exists, tell the owner honestly.
- **Owner media in the planner**: image hierarchy owner > approved stored > licensed stock (only trade-specific, never mismatched) > generated (approved only) > procedural > typography. Composition changes with what exists (arch portrait with a photo, typographic hero without; no empty frames, no grey placeholder boxes, quiet brands go typographic). Weak pictures (blurry/low-res) are never the hero.
- **Backfill**: `inferBrandOs(v1|v2 spec)` reads colours and type from the site, marks `inferred-from-site` with what could not be known.
- **Optional copy assist**: `assistCopy(spec, model)` validates a model proposal (numbers must already exist in the owner's facts; reject prices, awards, guarantees, "best/leading", testimonials, invented names, links, markup, clichés, over-length) and falls back to the deterministic copy on any failure.
- Social preview and SEO: `og:image`/`twitter:card=summary_large_image` only from the hero photo or logo by absolute URL; none otherwise; JSON-LD `LocalBusiness` with supplied facts only; sitemap and robots at publish via `finalizeForPublish`.

### 3. API (`apps/api`), behind `KORA_CREATIVE_ENGINE`

- Directions preview (no site row, no quota, forms stripped, 30-minute in-memory previews bound to the user), generate (v3), "try a new design" upgrade (new draft + before/after comparison, backfills first), quality report, structured edit, Brand OS read/history/version, backfill, creative feedback, design memory in the Brand OS response.
- **Owner media**: `POST /api/sites/:id/media-library?kind=logo|photo` (PNG/JPEG/WebP, server decodes and RE-ENCODES, never serves the upload, strips metadata, dedupes by sha256, variants 640/1280/1920 + logo PNG + thumb, quality score and flags, plain-language advice, roles, focal point), list/patch/soft-remove (history preserved), public content-addressed route. Pictures reach published sites only when `KORA_MEDIA_PUBLIC_URL` (or `KORA_PUBLIC_URL`) is https.
- **Artifacts**: preview/create/bundle/edit, `photoId`, composition override, immutable storage in `media_assets` with `brand_version`.
- **Campaign proposal**: `POST /api/sites/:id/campaign-proposal` ("I need more birthday cake orders next week" → goal, subject matched against what the owner offers, time window, four coordinated pieces, what Kora still needs; creates nothing).
- **Motion** follows the Brand OS genome (pace, overshoot, capitals, radius); preview states the brand version/hash; ffmpeg honesty preserved.
- Migrations: 025 `brand_os_versions` (append-only, immutable trigger, tenant FK), `creative_feedback`; 026 `owner_media`; 027 index on `creative_feedback(org_id, kind, created_at)`. Additive, re-runnable, tenant-scoped through `(site_id, org_id)`. Never edit a deployed migration; add a new file.

### 4. Web (`apps/web`)

- **Kora's own landing** rebuilt with real v7 output (not mock-ups): brief → what is true → three directions → brand → website → flyer/social/story → campaign → monitoring/recovery; a real bakery plus contrasting verticals; Kora's own brand is distinct from every client brand. Hero legible, no overflow, axe clean.
- **Brand Center**: read the brand, nine+ one-tap owner-language changes, history, logo/photo library (upload, role, focal-point picker, advice, "make a new draft with these"), "Tell Kora what you need" (proposal → "Make these drafts"), matching set, backfill button for older sites (with the "worked out from your website" notice), "Try a new Kora design" with a plain-words before/after.

## QUALITY BAR (what "agency-grade" means here)

- 18 golden businesses × 3 directions look clearly different from each other in layout, type, colour and composition, not just recoloured. Same-industry sets (5 bakeries, 5 salons, 5 professional firms, 5 trades) must each show real variety. Trades are the weakest family; keep improving them and state remaining sameness plainly.
- Calibrate against reality: study at least 100 real sites by RENDERING them (computed fonts, painted colours, headline size/case/alignment, button radius, first-screen image share, header, nav, page length, phone behaviour) and measure Kora's own output with the same instrument. Adjust where Kora is an outlier without a reason (the first type scale was twice the corpus median headline size; it was reduced). Keep search leads and memory notes OUT of the "studied" count.
- Image-led when the owner supplies photos; honest typographic design when they do not; never a placeholder that out-shouts a quiet brand.
- Cross-channel: website, flyer, post, story and status are recognisably one brand (same colours, type, device, voice); a drift check in the critic.
- Performance on slow-4G + 4× CPU throttle: median LCP about 1 s, worst under 2.5 s, CLS 0; budgets in tests (home HTML < 45 KB, CSS < 48 KB, site.js < 3 KB, ≤ 6 font files, no third-party requests, bundled stock < 260 KB each).
- Accessibility: axe WCAG 2 A/AA clean, no horizontal overflow, console clean, at 390 and 1280 px. Cross-browser: Chromium plus Firefox and WebKit engines (label them engines, not real devices).

## TESTS AND EVIDENCE TO PRODUCE

- Unit: creative (directions, history/taste/fatigue, sentence casing, suitability), site-schema (v3 generation, golden, critic, edits, backfill, copy assist, SEO), growth (campaign proposal, motion style).
- API integration against real Postgres: design-v3 (directions, generate, Brand OS versions, upgrade, backfill, fatigue, copy assist), artifacts (incl. proposal), owner-media, studio/motion, v3 recovery (bad release → approval → rollback → verified recovery → passport), v3 attribution/lead capture, **migration suite** (numbering and order, byte-stability of deployed migrations, upgrade from the pre-v7 schema, v7 schema behaviour: FKs, checks, immutability, dedupe), and a **security matrix** over every new endpoint: signed out, missing CSRF header, read-only member, other tenant, hostile text, unknown fields.
- Playwright: the Brand Center journey on a second server with `KORA_CREATIVE_ENGINE=v3` (read, change, save, reload, new version, old version unchanged, phone width, signed-out and cross-tenant refusal, logo upload, non-picture refusal, plain-language proposal). Keep the existing e2e suites green (note: the v2-only responsive test can need a longer timeout in slow sandboxes).
- Visual QA scripts (golden render, Chromium/Firefox/WebKit capture with axe, overflow, console; contact sheets) and READ the sheets.
- A **commissioning script** that works against any deployment and writes evidence JSON: phases `baseline` (flag v2: v2 generation, publish MATCH, no Brand OS leaks, upgrade refused), `v3` (directions, owner logo and photos, generate, Brand OS v1, quality, publish MATCH, no third-party scripts/fonts, monitoring, brand change → v2, old artifact bytes unchanged, proposal, controlled failure → incident → approved rollback → verified recovery, v2→v3 upgrade as a draft with the live version unchanged), `rollback` (flag back to v2). Run it against a LOCAL rehearsal with the production Docker image first.
- CI must be fully green on the exact final head: `quality` (prettier on EVERYTHING including the lockfile and docs, lint, typecheck, build, migrations twice, `pnpm -r test`), `e2e`, and `docker image (build, no push)`. Build the Docker image locally too: the Docker build type-checks test files and has caught real errors.

## DEPLOYMENT: LESSONS FROM THE FIRST ATTEMPT (read carefully)

Production runs on RumptyCloud: `kora-api` and `kora-site-host`, both built from the root `Dockerfile` and auto-deployed from `main`. Runtime claim: `GET /__kora` returns `kora.runtime-claim/v1` with the commit. Runbooks: `docs/runbooks/rumpty-deploy.md`, `go-live.md`, `site-host.md`, `creative-production.md`.

What happened: v7 was merged to `main` as `79c29ff` with CI green. The Site Host deployed it, but `kora-api.rumptycloud.app` returned "This app did not start" (503). A revert to the old code did not bring the API back either, so the cause was probably independent of the v7 code. The API had never been observed healthy before the merge; the first look at it was a wake-up page. The environment had no console or log access, so the cause was not found.

Therefore, before merging anything:

1. **Observe production first.** Confirm `kora-api` and `kora-site-host` both answer `/__kora` and `/health` and report the same commit as `main`. If the API is already down, STOP and fix that first.
2. **Get the Rumpty console log for `kora-api`** and check: `DATABASE_URL` (and `?sslmode=require`), `KORA_AUTO_MIGRATE=true`, `NODE_ENV=production`, port/readiness (`/health`), memory limits (the image has image-processing libraries), migration lock, and that migrations 025–027 apply on the production database (take a backup or snapshot first).
3. Rehearse the upgrade on a copy of the production database state (migrations only up to 024, with real rows), using the production image with `NODE_ENV=production`.
4. Deploy with the flag unset (v2). Verify health, an existing published site, publish, monitor, rollback. Only then run the commissioning phases and flip `KORA_CREATIVE_ENGINE=v3` (set an https `KORA_MEDIA_PUBLIC_URL`). Roll back by setting the flag to `v2`; existing v3 versions keep rendering.
5. File the three evidence JSONs under `docs/live/` and only then mark anything PRODUCTION_ACCEPTED.

## DELIVERABLES

1. All code, migrations, tests, scripts above on a feature branch; one pull request with a body that lists exact counts per suite, CI links, screenshots (landing, Brand Center, golden desktop/mobile, enriched-with-photos, same-industry, before/after against the v2 designer, cross-channel) and honest limits.
2. Docs: ADRs (site-spec-v3, brand-os, artifact-spec, reference policy and model boundaries, migration and rollout, visual QA), architecture (Creative OS, Brand OS), design (creative quality, artifact spec, diversity), research (method, classes, counts, calibration table), runbook (enable, roll back, troubleshoot), and a ledger with honest limits and the exact remaining production steps.
3. The final message in this format: what changed; exact test numbers and the head they ran on; CI result on that head; visual-review findings (including known weak spots); production status with evidence or the exact remaining steps; and an `[ASPIRATION CHECK]` block (Criterion, Reviewed, Found, Remainder).

## KNOWN ACCEPTABLE LIMITS (state them; do not hide them)

Live social providers are not configured; no real-device testing; print is RGB not press-ready CMYK; object storage is not needed at current volume (pictures live in Postgres); video export needs ffmpeg in the deployment; model-assisted copy is validated but should be labelled STUB_TESTED unless a real model was exercised. "Agency quality is not consistent" is NOT an acceptable limit: if a family of businesses looks weak, fix it or report the specific defect.

## ORDER OF WORK

1. Observe production and the repo (read `docs/execution/V7-LEDGER.md`, `docs/architecture/CREATIVE-OS.md`, `docs/architecture/BRAND-OS.md`). 2. Engine and schema (creative, v3 spec, planner, renderer, critic, edits). 3. Owner media and artifacts. 4. API and migrations. 5. Web (landing, Brand Center). 6. Research study and calibration. 7. Visual review loop until the sheets are good. 8. Test, lint, format (prettier everything), typecheck, Docker build, local rehearsal with the production image. 9. PR, CI green. 10. Production per the lessons above, with evidence.
