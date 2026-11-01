# Premium design brief (research → rules)

Researched 2026-11-01. Sources: Apple Human Interface Guidelines and apple.com (screenshot reviewed); stripe.com and linear.app (screenshots reviewed); Awwwards articles on whitespace and award-winning typography; Ehrenberg-Bass / Ipsos / JKR work on distinctive brand assets; Figma, GoDaddy, Haddington and Buzz 2026 trend write-ups (bold typography, bento grids, scroll storytelling, micro-delight, dark by default).

## What the reference sites actually do

- **Apple:** one idea per screen. A single oversized headline, one line of support, two pill buttons, then one cinematic image doing all the work. Black or white fields only; colour comes from the product. Nothing decorative.
- **Stripe:** a signature visual nobody else has (the colour ribbon), a large two-tone editorial headline (dark first sentence, muted second), thin hairline grid, logos as proof.
- **Linear:** near-black field, tiny quiet navigation, content revealed with motion rather than shown all at once.
- **Awwwards winners (articles):** type does the hierarchy (large contrast between sizes and weights), whitespace is _active_ (a graphic can sit alone in space), scroll is paced like a story.
- **Brand science:** a brand is remembered by _combinations_ of assets used consistently (shape + colour + type + motion), not by one element; uniqueness matters more than fame; constant restyling resets memory. Distinctive assets must still work when the name is removed.

## Where Kora fell short (measured in the Phase 0 audit and by looking)

No signature visual; small timid type; flat colour blocks with nothing in them; generic filler sections; flyers that are one colour with an empty middle; a landing hero whose picture is a tiny screenshot.

## Rules applied everywhere

1. **One idea per screen, one dominant element.** Everything else steps back.
2. **Type is the design.** Display size ≥ 7vw on heroes, 3–4 steps between levels, tight leading (0.95–1.05) on display, tracking −0.03em.
3. **Active whitespace.** Section padding 120–200px desktop; never fill a gap just because it is empty.
4. **A signature visual** that only Kora uses, built from the brand's own shapes, reused on every output (site, flyer, post, app) so they read as one family.
5. **Restraint in colour:** one field colour, one ink, one accent used rarely. Contrast ≥ 4.5:1.
6. **Rich surfaces, not flat fills:** gradients with depth, fine grain, hairlines, layered shapes.
7. **Hierarchy by scale and weight, not by boxes.** Fewer cards, fewer borders.
8. **Motion with purpose:** short reveal on scroll, honoured `prefers-reduced-motion`.
9. **Real content over filler:** no section without a fact behind it (already enforced by the quality gate).
10. **Consistency over novelty:** the same codes on the landing page, the dashboard, the customer's site and the flyer.
