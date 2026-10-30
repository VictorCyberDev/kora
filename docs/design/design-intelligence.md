# Design intelligence

```
brief (name + what you do, optional goal/feel)
   -> industry recipe (32 priors, matched on the owner's own words)
   -> deterministic planner  -> 3 directions (look x colourway x copy arrangement)
   -> [optional] DesignIntelligenceProvider: model chooses among registered looks/palettes/art and may polish a headline
   -> quality gate (cliches, invented numbers/claims, fabricated sections, contrast, structure)
   -> validated SiteSpec v2 -> deterministic renderer -> immutable version -> publish -> verify -> monitor
```

## Without any AI

The deterministic designer is a complete product, not a fallback toy. It picks a recipe (interior studio, restaurant, clinic, repair, SaaS... 32 in all), three
distinct _looks_ (hero composition, header, type, spacing, shape, section layouts) and three colourways, and arranges only what the owner wrote.
Recipes are priors, not templates: the same recipe yields three different directions, and the fixtures show different industries sharing none of them
([diversity-matrix.md](diversity-matrix.md)).

## What may never be invented

Testimonials, logos, prices, addresses, phone numbers, emails, hours, awards, certifications, statistics, team members, years in business, clients, ratings,
case studies. The planner only rearranges supplied facts; it will not add a testimonials/pricing/stats/team/portfolio section from nothing. `designQuality`
re-checks any spec, from any generator, and rejects: AI-style clichés ("unlock", "elevate", "world-class", "journey"...), claims not present in the brief ("award-winning",
"15 years", "5-star"), numbers that are not in the brief, fabricated section types, weak button labels, missing alt text, unreadable colours.

## The provider

`applyIntelligence` accepts untrusted model text, validates it against `designIntelligenceSchema` (six sections: understanding, strategy, architecture, design, content, media;
every design field is an enum over what exists) and applies it **through the planner**. If the answer is not valid JSON, names an unknown look/palette, or the copy fails the quality
gate, the offending part is refused (the reason is returned and shown) and the deterministic choice is kept. Prompt-injection in the brief can at worst change a headline that must still
pass the gate.

## Provider chain

```
on-device AI in the owner's browser (Chrome built-in Prompt API, opt-in, no key)
  -> Rumpty / any OpenAI-compatible endpoint (AI_*), ordered fallbacks
  -> Kora's deterministic designer
```

Every link produces _text that Kora's server validates_ with `applyIntelligence`; none has authority over publishing, versions or recovery.

**On-device (Chrome Prompt API).** Verified against current Chrome docs (Prompt API shipped for the web in Chrome 148; requires desktop Chrome/ChromeOS Plus, ~22 GB free disk, a GPU with >4 GB VRAM or 16 GB RAM/4 cores; the model downloads separately on first use and needs user activation; not available in Web Workers).
`apps/web/src/local-ai.ts` feature-detects `LanguageModel.availability()`, shows the option only when it is `available` or `downloadable`, passes Kora's JSON Schema as `responseConstraint`, times out after 60 s, and returns `null` on any error. The generate endpoint accepts the text as `intelligence`, validates it, and falls back to the remote model and then the deterministic designer if it is unusable. English only for now. Tested with a stubbed Prompt API in Playwright (`e2e/local-ai.spec.ts`) and with the real endpoint in `design-v2.integration.test.ts`; it has not been exercised against a real Gemini Nano in CI (CI browsers do not ship the model).

**WebLLM / Transformers.js: not implemented in this release (POST-SUBMISSION).** A multi-GB WebGPU model cannot be tested in headless CI and the mandate forbids risking release for it. The seam is the same `{ text, provider }` shape `runLocalDesign` returns, so adding it later changes only `local-ai.ts`.

## Configuration (provider-neutral)

| Variable                                                                           | Purpose                                                                                        |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `AI_PROVIDER`                                                                      | Label only (e.g. `rumpty`, `openrouter`), shown in the UI/logs                                 |
| `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`                                            | Any OpenAI-compatible `/chat/completions` endpoint                                             |
| `AI_TIMEOUT_MS`, `AI_MAX_OUTPUT_TOKENS`                                            | Optional                                                                                       |
| `AI_FALLBACK_1_*` … `AI_FALLBACK_3_*` (`PROVIDER`, `BASE_URL`, `API_KEY`, `MODEL`) | Ordered fallbacks tried when the primary fails (one retry each; a rejected key is not retried) |
| `INFERENCE_*`                                                                      | The previous names. Still accepted; `AI_*` wins when both are set                              |

A reasonable order for the free/low-cost path: RumptyCloud Inference → OpenRouter free models → Cloudflare Workers AI → Gemini's OpenAI-compatible endpoint → deterministic designer.
Any of them is just a base URL, key and model. Keys live in environment/secrets only. Responses carry the answering `provider`, token counts are recorded as usage, and nothing is silent:
`note` explains when the AI was not used. No provider is required for the product to work.

## Directions

`POST /api/sites/:id/design/directions` returns three rendered directions (real files from the real renderer, held 30 minutes per user, nothing saved).
"Choose for me" is direction A. The owner's optional _goal_ (calls, bookings, enquiries, orders, visits, show our work) decides the primary button; the optional _feel_ ("calm", "bold", "dark"...) decides direction A's look.
