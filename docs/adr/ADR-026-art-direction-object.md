# ADR-026: Art Direction is data; models never write HTML or CSS

Status: accepted. Milestone M1 (consumed by M8–M10, M13–M15).

## Context

The Phase 0 audit (`docs/design/audit-before/FINDINGS.md`) shows the SiteSpec v2 renderer is reliable but its output is generic: identical placeholder arches, filler sections, one photo in the first two screens, headlines at 3–8% of page width.
The cause is not the renderer; there is no layer that decides _what this business should look like_ before components are chosen.

## Decision

1. Introduce an **Art Direction object** produced before a SiteSpec is composed: concept (one sentence), distinctive visual object, type pairing and scale, palette roles (not just colours), page composition rhythm (dense/open/full-bleed sequence), image plan (what each image must show, which facts it may depict), motion behaviour (named, with reduced-motion fallback), a bounded irregularity budget, and the brand codes it uses.
2. A model or a human may author the Art Direction object. **No model emits HTML, CSS or SiteSpec nodes directly.** The deterministic composer maps Art Direction + Truth Engine facts to a SiteSpec; the existing renderer, immutable versions, verification and golden-hash tests are unchanged.
3. The object is versioned, stored with the site version it produced, and diffable. Every output can answer "why does it look like this".
4. Category playbooks (restaurant, bakery/cakes, salon, fashion, events, photography, hospitality, fitness) constrain Art Direction with section vocabularies and image requirements instead of fixed templates.
5. A quality floor is enforced at composition time (for example at least three real photos in the first two screens where the category requires them; no section without a fact behind it).

## Consequences

- Quality becomes testable: the audit measurements (H1 width, photo count, edge gaps) become automated gates.
- A new SiteSpec version (v3) is not required initially; Art Direction maps onto v2 nodes and adds nodes only when a gap is proven.
- Cost: the composer grows. Mitigation: ship one category (food/cakes) end to end first.
