# SiteSpec v3

A closed, versioned contract. v1 (`version: 1`) and v2 (`version: 2`) are untouched and keep their renderers and golden
hashes; `parseAnySiteSpec` / `renderAnySite` route on `version`.

## Shape

`business` (v2 fields plus `locationKind: premises | service-area` and `language`), `brand` (Brand OS version and hash,
direction, strategy), `design` (genome, 17-role palette checked at 4.5:1 for every text pair, colourway, mode, seed),
`artDirection` (structured image briefs), `seo`, `pages` (slug, purpose, conversion goal, sections), `footer`, `meta`.

## Closed vocabulary

- 13 hero layouts: cinematic, editorial-split, type-dominant, poster, menu-focus, booking-focus, location-focus,
  collage, arch-portrait, minimal-statement, ticker-energy, product-dominant, call-first.
- Offer: 8 layouts (editorial-index, menu-list, image-tiles, stacked-panels, accordion, sticky-split, board, ladder).
  Products 4, story 4, process 3, gallery 4, proof 3, contact 5, cta 3, plus ticker, statement, visit, faq.
- 17 type voices over 18 OFL families (italic faces where the family has one), 11 motifs implemented as CSS
  (hairline rules, numerals, arch frame, stamp label, corner brackets, grain dots, wave edge, diagonal cut, ticket
  perforation, monogram seal, marquee band).
- Media carries `role`, `treatment`, `focalPoint` and **provenance** (source type, provider, licence, attribution,
  review status). `proof` sections require `supplied: true`: an invented testimonial is unrepresentable.
- Procedural plates (arch, stripes, circles, checker, sunburst, lines, monogram, stack) stand in for missing photos as
  honest graphics; quiet brands get tonal plates.

## What a spec can never contain

HTML, CSS, script, unknown component identifiers, unknown fonts, colours that fail contrast, `javascript:` or
non-https remote media, unregistered motion. Text is always escaped by the renderer.

## Mobile

Every layout is written mobile-first. `mobileStrategy: action-dock` adds a fixed Call / WhatsApp bar below 860px;
horizontal rails scroll with snap and are keyboard focusable; navigation is a native `<details>` menu (no JavaScript).
Reveal motion is CSS only (`animation-timeline: view()` as progressive enhancement, transform only so content is never
hidden) and is disabled under `prefers-reduced-motion`.

## Truth rules in the planner

No section without a fact behind it. No team, ratings, years, prices, hours or guarantees are invented. Owner sentences
about their situation ("I only have three photos", "we want more bookings") are filtered out of public copy. A
home-based business (`from home`, `mobile`) gets a service area, not directions. Catalogue stock is only used where it
matches the trade; unrelated tagged photos are excluded.

## Attribution, leads, monitoring

v3 uses the same `site.js` tracker and form contract as v2, so tracked-link arrivals, call and WhatsApp taps and form
enquiries behave identically. Published v3 versions are monitored and rolled back by the existing machinery.
