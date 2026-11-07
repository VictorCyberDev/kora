# Architecture of the vNext creative engine

```
brief (name + one sentence)
  └─ buildTruth ───────────────► BusinessTruth (what the owner said; what is missing; what is prohibited)
  └─ classifyVertical ─────────► vertical + confidence + alternatives + evidence (corroboration-scored)
  └─ profileFor(vertical) ─────► IndustryProfile (versioned INDUSTRY_GENERAL knowledge)
  └─ buildBlueprint ───────────► BusinessBlueprint (provenance-tagged; 4-7 PagePlans; ImagePlan; unknown facts)
        └─ planSiteV3 ─────────► SiteSpecV3 (builders per section kind; fitText; media relevance + reuse cap)
              └─ repairCompleteness (≤2 rounds) ─► completenessV3 gate (whole site)
                    └─ parseSiteSpecV3 → renderSiteV3 → immutable artifact → publish → verify → monitor   (unchanged)
```

No model is called anywhere above. `KORA_COPY_ASSIST` (headline proposal, validated against owner facts) is untouched.

## 1. Business Blueprint (`packages/creative/src/blueprint.ts`)

Typed output: `identity`, `classification` (vertical, subcategory, confidence, alternatives, evidence, `ambiguous`),
`confirmedFacts` (OWNER_CONFIRMED), `inferredIndustryKnowledge` (INDUSTRY_GENERAL), `unknownFacts` (UNKNOWN, each with how
the site behaves instead of inventing), `confirmedOfferCategories` vs `suggestedOfferCategories` (SUGGESTED_UNCONFIRMED, never
rendered as offerings), `conversionStrategy`, `pageArchitecture`, `contentPlan.mustNotClaim`, `imagePlan` (grouped search
intents and slots), one optional skippable `followUp`, `provenance[]`, `confidence[]`. `blueprintIssues()` validates it.

Ambiguity: when no trade word is found (or confidence < 0.4) the classification is "General business", no suggestions are
made, the architecture stays broad, and a single skippable follow-up is offered. "My company provides services." produces six
honest pages with no invented industry (tested).

## 2. Industry knowledge (`packages/creative/src/knowledge.ts`)

21 editorial profiles (bakery, catering, restaurant, fashion, salon, barber, makeup, photographer, agency, **digital-studio**,
saas, cyber, gadgets/phone repair, plumbing, cleaning, real estate, events, tutoring, clinic, consulting) plus a
`genericProfile` built from the vertical's own fields for the other ~40. Each profile: subcategories, offering topics (what
it is, what to consider, image subjects, whether it earns its own page), customer-style FAQ answered as advice, enquiry
prompts, grouped media search intents, approach notes, and `meta` (`profileVersion`, sources, `reviewedAt`, regions,
restrictions, `validation`). `assertKnowledgeSafe()` (run in tests) fails the build if any string reads as a claim about the
owner's business: numbers, awards/certificates/guarantees, superlatives, years, price claims, speed/availability promises,
freshness schedules, delivery promises, customer claims.

Classification fixes: new `digital-studio` vertical; corroboration scoring (several distinct matches of one trade
outweigh one longer incidental phrase), so "I bake cakes and small chops" is a bakery. A 21-case classification matrix is a test.

## 3. Page architecture

4-7 pages from the trade and the customer, never from how much was typed: Home; one page each for up to two confirmed
page-worthy offerings (bakery: Cakes, Small chops) or one consolidated services page; a way-of-working page for conversational
trades; a gallery page **only when distinct relevant photographs exist**; About; a questions page when the site would
otherwise be short; Contact. Ceiling `MAX_SITE_PAGES = 7`: enforced by the planner and by `applyStructuredEditV3`
(a site is never grown past `max(7, current)`); the Zod schema still reads up to 8 so historical sites stay valid and servable.
Pages that lose all substance after photo de-duplication are dropped rather than shipped thin.

## 4. Content

Copy comes from (a) the owner's words (`fitText`, which keeps whole sentences or cuts at a clause boundary and closes with a
full stop; no ellipsis), (b) INDUSTRY_GENERAL knowledge phrased as advice to the customer, (c) structural labels. No section
exists without a fact or a piece of general knowledge behind it; no testimonials/proof/prices/hours/maps are produced.

## 5. Media

`packages/site-media/src/providers/`: `MediaProvider` contract, `UnsplashProvider` (+ `loadUnsplashConfig`), `QuotaStore`
(in-memory; `PostgresQuota` in `apps/api` for multi-instance), `buildCandidatePool` (budget, cache, halt-on-429),
`rankCandidates`. In the planner: topic pages accept only pictures tagged for that topic (`CatalogEntry.topics`) or supplied
by the owner; subpages no longer inherit the home hero photo; **no photo is used more than twice per site**; the gallery page
claims distinct photos first. `buildImageManifest` (site-schema) derives a per-placement record (provider, creator, licence,
rights, alt, focal point, selection state) and `manifestReplacements` gives the replacement history across versions
(`GET /api/sites/:id/versions/:versionId/media-manifest`). The footer now renders structured photo credits.

## 6. Whole-site quality gate (`v3/completeness.ts`)

New critic dimensions `contentCompleteness`, `navigation`, `mediaIntegrity`. Blocking: `TOO_FEW_PAGES`/`TOO_MANY_PAGES`
(generation only), `THIN_PAGE`, `THIN_HOME`, `EMPTY_SECTION`, `TRUNCATED_COPY`, `BROKEN_LINK`, `NO_CONTACT_JOURNEY`,
`NON_FUNCTIONAL_CONTACT`, `UNSUPPLIED_CLAIM`, `INVENTED_NUMBER`. `repairCompleteness` is bounded (2 rounds) and only applies
fact-free repairs (broken internal link → /contact, trailing ellipsis); whatever still blocks is returned and appended to the
generation note, never hidden. Opt-in per call so a historical one-page site is not failed retroactively.

## 7. Owner control (`v3/edit.ts`)

New validated structured edits: `remove-page`, `move-page`, `section-text` (owner text allowed; model-authored text must pass
the claim check), `replace-media` (full `mediaV3Schema` validation, so `javascript:` etc. are rejected). Existing: hero text,
contact, nudges, colourway, type voice, remove/move section, CTA label. Every edit becomes a new immutable version.
**Not built:** per-section/per-page regeneration, add-section, undo as a UI action (version restore/rollback already exists), preview UI.

## 8. Lifecycle (`apps/api`)

`GET /api/sites/:id/deletion-impact`, `DELETE /api/sites/:id` (ADMIN, must type the site's exact name; idempotent; one
transaction: `UNPUBLISHED` + `deleted_at/by` + audit row). The Site Host serves only `PUBLISHED`, so the public site stops at
commit. A deleted site is invisible to every ordinary route (`getSite` filters `deleted_at`) and the public form endpoint
404s. Plan allowance counts `deleted_at IS NULL`; creation checks the allowance under a per-organisation advisory lock.
Rows, immutable versions and enquiries are **retained** (no purge job exists; see SECURITY-REVIEW.md).
