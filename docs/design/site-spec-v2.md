# SiteSpec v2

`SiteSpec` stays the single contract between whatever decides what a site should say and the trusted renderer.
v2 adds a **Design DNA** layer and a larger, still closed, component vocabulary. **v1 is permanent**: every historical v1 version still renders,
publishes, rolls back, verifies and recovers, and v1 hashes are unchanged (see the golden hashes in `packages/site-schema/test/v2.test.ts`, produced by the code on `main` before this work).

## Shape

```
version: 2
business   name, description, industry, location?, phone?, whatsapp?, email?, hours[], social[]
design     personality[1..3]   palette (17 semantic roles)   paletteStrategy   mode
           typography {pairing, scale}   density   shape   surface   buttons   motion
           imagery {style, art, seed}    nav   footer
seo        title, description, keywords
pages[]    slug, title, nav?, sections[]  (<= 8 pages, <= 14 sections)
footer     text, links[]
meta       recipe, direction, generator (deterministic | model | edit)
```

Sections are a discriminated union of 14 types (hero, trust, services, features, about, process, portfolio, testimonials, team, pricing, stats, faq, contact, cta).
Each carries a `variant` that must be one of the registered variants for that type (`VARIANTS` in `src/v2/spec.ts`).
Nothing in the spec can carry markup, a stylesheet, a script or an unvalidated URL.

## What the schema refuses

- Any variant, font pairing, art style or enum value that is not registered.
- A palette in which a text/background pair is below WCAG AA (4.5:1). The schema computes this; the renderer does not trust it.
- Non-https images, javascript: links, malformed colours, control characters, dangling `#anchor` links, duplicate or missing pages.
- Patches that change `version`, even though patches are validated by the spec of the version being edited.

## Versions side by side

|                         | v1                          | v2                                               |
| ----------------------- | --------------------------- | ------------------------------------------------ |
| Generated for new sites | only with `format: 1`       | default                                          |
| Renderer                | `renderSite`                | `renderSiteV2` (via `renderAnySite`)             |
| Edits                   | JSON patch + brand controls | JSON patch + design controls (`designEdit`)      |
| Stored artifact         | text map, hashed            | text map, hashed (same table, same trigger)      |
| Fonts                   | system stacks               | up to 5 bundled files, served at `/_kora/fonts/` |

Artifacts remain text-only in `site_versions`, so fonts are not in the artifact. Every host (API and independent Site Host) serves the bundled files
at `/_kora/fonts/<exact file name>`; pages reference only the one to five files their pairing needs. The page CSP gains `font-src 'self'`.
The experimental Rumpty bucket publisher does not serve `/_kora/fonts/`; pages fall back to the system font stack there (`font-display: swap`).

## Upgrade design

`POST /api/sites/:id/versions/:versionId/upgrade` builds a **new v2 draft** from a v1 version's own content: business facts, hours, services, headline,
about text, FAQ, testimonials, pricing, stats, features, gallery and social links are carried over; nothing is invented. It never publishes. The response lists what was carried
and what was folded (`notCarried`). The v1 version is untouched, so the owner can compare and roll back.

Tested end to end with the real API (`apps/api/src/design-v2.integration.test.ts`): v1 → upgrade → publish v2 → roll back to v1 → publish v2 again, with the live bytes verified (`MATCH`) at every step and the v1 live HTML byte-identical after rollback.

## Visual controls

Each control is a validated structured edit that produces a new immutable version: palette, type pairing, density, corners, surface, buttons, motion, header, footer,
per-section layout, move, duplicate, delete, "try another layout" (`StructuredEditV2`). Chat instructions that need no model (colour, button text, add a service, rename)
also work without AI.
