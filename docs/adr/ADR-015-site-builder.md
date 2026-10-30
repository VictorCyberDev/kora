# ADR-015: Typed SiteSpec and a trusted renderer

The AI never produces code. `packages/site-schema` defines `SiteSpec` (Zod): business, brand, SEO, navigation, pages and 13 section types. The model (or the deterministic generator) emits a spec or a JSON-pointer patch; the patch is applied to a copy and the _whole result_ is revalidated, with prototype-pollution paths blocked. The renderer escapes all text, emits no inline script or handler attributes, restricts links to https/mailto/tel/anchors/site paths, adds a CSP meta, and is deterministic (stable artifact hash). The deterministic generator only rearranges what the owner wrote and never invents services, prices, hours or testimonials.

Versions are immutable (database trigger) with a spec hash and artifact hash; rollback republishes an older version. Preview serves the stored artifact bytes. Sitemap/robots are added at publish time when the base URL is known.
