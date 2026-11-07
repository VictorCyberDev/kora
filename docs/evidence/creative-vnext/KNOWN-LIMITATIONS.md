# Known limitations

Stated plainly so a reviewer does not have to discover them.

## Validation that did not happen

- **Real Unsplash:** never called with a real key. Adapter, quota, cache, tokens and attribution are tested against a local
  fake server only. Pending operator-supplied credentials.
- **Real language model:** composition is tested with stub models (valid, malformed, hostile, slow, failing). No real model
  output has been evaluated for quality.
- **Core Web Vitals / Lighthouse / field data:** not measured. Page weight and request counts were measured (PERFORMANCE.md).
- **Real devices and screen readers:** not tested. Browser checks use headless Chromium at desktop and 390px widths plus axe.
- **Visual regression baselines:** screenshots are produced and reviewed by eye; there is no stored pixel baseline gate yet.
- **Competitor research:** official pages only; Webflow facts come from search summaries (see the file's own caveats).
- **Production-sized migration rehearsal:** not done.

## Product behaviour

- **Owner confirmation is a recorded human action** (who, when, exact text, append-only), not cryptographic proof that the
  statement is true. Claim-like wording is refused unless the owner has confirmed that exact text.
- **Retention:** no retention period is set and none is invented. Enquiries of a deleted site are kept until the owner
  explicitly exports and erases them. A human decision on policy is needed before any automated purge.
- **Custom domains of a deleted site are released** and must be re-attached manually after a restore.
- **Imagery supply:** the vetted catalogue is small (64 photographs, all from Pexels' free licence, verified by page
  reads on 2026-11-07, three excluded). Trades without catalogue photographs get typographic layouts rather than unrelated
  pictures. A generic "I cut hair" brief leans toward barbershop photography because that is what the catalogue holds.
- **Unsplash is user-mediated only:** the engine never places a stock photo automatically; an owner picks it.
- **Page copy is editorial:** industry knowledge profiles and fallback wording were written in this work and have not been
  reviewed by anyone outside it.
- **Preview iframe** is sandboxed with `allow-same-origin allow-scripts` (needed for the scaled preview); it only ever loads
  the platform's own rendered output, never owner-supplied HTML. There is no HTML editor.
- **Seven pages maximum** for new sites; sites already above it keep their pages.
