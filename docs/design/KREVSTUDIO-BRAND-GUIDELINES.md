# Krevstudio — implemented brand guidelines

Status: **Implementation reference**, not owner trademark or final creative signoff.
Source of truth: `apps/web/src/krev-brand.css` and `apps/web/src/ui.tsx`. Archived `docs/design/brand-v4/DIRECTIONS.md` describes historical **Kora**, not this final product name.

## Identity proposition

**Krevstudio** is one connected creative workspace, not a collection of independent AI generators. The narrative is:

> One business brief → one evolving brand identity → websites, logos, graphics, motion and campaigns.

Positioning: approachable creative capability with transparent owner approvals, persistent editable sources, and verifiable publishing results. Avoid promising autonomous posting, guaranteed conversions or creative perfection.

## Identity and symbol

Current implemented symbol: an angular geometric **K** inside a rounded ink square, with a coral square accent at the upper right. It is rendered in the `Logo` component. The wordmark is **Krevstudio**, not Kora or KREV Studio. Keep the symbol and wordmark paired where possible; use accessible `Krevstudio home` label on logo links. Do not invent trademark clearance.

## Palette (current actual tokens)

| Token          | Hex       | Role                                                      |
| -------------- | --------- | --------------------------------------------------------- |
| `--krev-ink`   | `#17242a` | Primary type, navigation, primary action, K symbol ground |
| `--krev-stone` | `#f5f1e9` | Editorial section background                              |
| `--krev-coral` | `#e37c5c` | Distinctive accent, selective emphasis                    |
| `--krev-paper` | `#fffdf8` | Main canvas and light section background                  |
| `--krev-rule`  | `#b9c1bb` | Borders and dividers                                      |

Extended tones in current CSS include `#24353b` for the dark explainer section and `#b9513b` for editorial headline accents. Never treat a customer brand palette as the Krevstudio corporate palette; exported customer designs derive their own approved BrandOS version.

## Typography

Marketing display: Georgia/Cambria serif, restrained weight, generous scale, tight but readable tracking. Utility/product UI: existing sans-serif system. Clear sentence-case product names and labels. No decorative display font in long-form controls. Respect language-specific line-height and wrapping.

## Motion and imagery

Motion reinforces transitions between idea, brand and output; it must not distract from task completion. Respect `prefers-reduced-motion` (already in `krev-brand.css`). Prefer actual approved creator outputs and screenshots over generic AI stock visuals. Do not depict an exported MP4 or published website as real unless the asset or deployment was tested.

## Application and customer-owned assets

- Public homepage and product routes: premium editorial language, meaningful creative proofs, goal-specific signup paths.
- Dashboard and Today: concise, evidence-backed action copy, explicit draft/queued/published distinctions.
- Studio editors: tool clarity, accessible labels, responsive layout, persistent source, undo/redo and clear export status.
- Generated customer work: never apply Krevstudio ink/coral as a blanket replacement for the owner's approved BrandOS.
- Email and metadata: sender and product name should be Krevstudio; do not change historical provider hostnames or site-domain contracts without planned migration.
- Social previews: use the same symbol, product naming and verified output proof without fictitious usage metrics.

## Product voice

Direct, practical, specific, non-magical. Explain what was created, what still requires approval, what was published and what is unmeasured. Avoid filler like “fully automated growth,” “guaranteed results,” or “your brand is perfect.” Approval copy should identify the exact action before publishing or payment.

## Visual release acceptance (still required)

Actual desktop/mobile screenshots of homepage, product routes, signup, Today, Website/Graphic/Motion Studios and pilot; verify symbol, color hierarchy, typography, reduced motion, captions/contrast and no legacy Kora label in customer-facing copy. Review generated PDF/PNG/SVG/MP4 exports and email/social previews separately. Owner final signoff must be recorded by a real decision-maker, not inferred from this document.
