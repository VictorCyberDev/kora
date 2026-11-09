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

## Observed in the final review

- **Minimal-brief sites are thin where the owner said little.** From "I cut hair." the engine produces six pages with no
  invented facts, but the Haircuts page is short (one offering sentence, two enquiry prompts) and, in one direction, type-led
  with decorative plates because the few relevant barbershop photographs are claimed by the home and gallery pages first.
- **Call-first contact layout** (call-led trades when a phone number is supplied) shows the number instead of an enquiry form;
  this pre-dates this work.
- **The photographer and agency directions do not all open with a photograph;** one of three does (see
  `docs/research/RESEARCH-APPLICATION-2026.md`).
- **Image licence audit covers 50 of the 64 catalogue photographs;** the other 14 are the earlier curated set.

## After local commissioning

- **Hosted behaviour is unverified:** the Docker image was never built (no daemon here); readiness, restarts, TLS, secure cookies, the platform proxy, the public https media origin
  (owner photos were exercised on a local address only), real memory limits and free-plan sleeping are all untested. See HOSTING-ARCHITECTURE.md.
- **Single instance:** per-site monitors and rate limiters are in-process. Two API instances were run only to test the repository's browser suite; hosted staging must run one of each.
- **Custom-domain retirement on delete** is covered by integration tests but was not exercised against the running services (creating a domain needs the paid flow).
- **The commissioning harness** (`scripts/commission/`) drives local processes and a previous-release build; it is not a hosted acceptance suite as it stands.
- **Simulated providers:** every Unsplash and model result in the commissioning is from a local fake and says nothing about the real services.
- **Migration timings** are from an almost empty database; production-sized behaviour is unrehearsed.
- **Memory and load figures** come from one 4 vCPU machine over loopback; they size a minimum plan and are not a capacity promise.
