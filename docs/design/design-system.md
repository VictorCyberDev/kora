# Design system

## Components

A section is one of 14 types; each type has a set of human-designed variants. The AI picks among them; it cannot add one.

| Type                   | Variants                                                                                                                                           |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header                 | classic, minimal, centered, floating, split, dark                                                                                                  |
| Hero (12)              | editorial-centered, split-art, full-bleed, media-left, bento, collage, local-service, portfolio, product, luxury, minimal-statement, stacked-story |
| Trust                  | strip, checklist, credentials                                                                                                                      |
| Services               | grid, list, editorial-list, image-cards, numbered, split, accordion                                                                                |
| Features               | statements, icon-led, alternating, bento                                                                                                           |
| About                  | image-text, editorial, mission, values                                                                                                             |
| Process                | numbered, timeline, steps, horizontal                                                                                                              |
| Portfolio              | grid, editorial, featured, list                                                                                                                    |
| Testimonials           | spotlight, grid, stacked                                                                                                                           |
| Team / Pricing / Stats | cards, list / columns, featured, minimal / row, big                                                                                                |
| FAQ                    | accordion, split, minimal                                                                                                                          |
| Contact                | split, conversion, whatsapp, booking, local                                                                                                        |
| Call to action         | band, outline, split, big-type                                                                                                                     |
| Footer                 | minimal, columns, brand-heavy, local                                                                                                               |

## Tokens

Palette: 17 semantic roles, built from 16 curated colourways (`PALETTE_STRATEGIES`) with a small per-business hue shift. Every text pair is checked at ≥ 4.5:1 and
brand colours used as _text_ are pulled to a readable shade (`--accent-text`, `--primary-text`).
Type: 11 pairings over 14 bundled OFL families (`packages/site-fonts`, licences in `LICENSE-FONTS.md`); a page loads at most five files.
Shape (sharp/soft/rounded), surface (flat/outlined/raised), buttons (solid/outline/pill/underline), density (compact → editorial), fluid type scale.

## Media strategy (in order)

1. Owner-supplied image (https, alt text, focal point; credit if it is not theirs).
2. **Curated Kora photograph.** Five Pexels-licensed images (restaurant x2, café, hospitality hall, phone-repair bench), WebP, 640 KB total, in `packages/site-media` with creator/licence/source in `LICENSES.md` and `src/v2/catalog.ts`. Served at `/_kora/media/<exact file>` by the API and the Site Host (not in artifacts, not hot-linked). A photo is used only for businesses it honestly represents; photographs showing another business's signage were rejected.
3. **Procedural art** from the site's palette (mesh, rings, grid, waves, blocks, arch, planes, orbit, signal), different per slot.
4. Typography-only composition (several heroes need no image).

Not built (POST-SUBMISSION): customer image upload and storage, additional categories (beauty, fitness, interior, studio currently use procedural art), local image generation.

## Imagery and icons

The renderer never invents or hot-links a photo. A media slot is either owner-supplied media (https, alt text, focal point; external images need a credit) or
deterministic abstract art drawn from the site's palette (`mesh`, `rings`, `grid`, `waves`, `blocks`, `arch`). Icons are an embedded Lucide subset (43 icons);
an icon is shown only when the item's title clearly maps to one, otherwise index numbers are used consistently.

## Motion

CSS only, progressive: scroll-reveal uses `animation-timeline: view()` where supported, nothing otherwise, and is off under `prefers-reduced-motion`.
Mobile menus use `<details>`, FAQs use `<details>`: no JavaScript on customer sites except the existing contact-form handler.

## Delivery

Static HTML + one stylesheet + favicon. A page is ~30-55 KB of HTML+CSS plus 28-81 KB of fonts. CSP: `default-src 'none'; img-src 'self' https: data:; font-src 'self'; style-src 'self'; script-src 'self'`.
That policy is why the renderer uses **no inline `style` attributes**; the artifact lint rejects them (a browser would silently drop them).

## Accessibility

Semantic landmarks, one `h1`, skip link, visible focus, keyboard-operable menu and FAQ, 4.5:1 text contrast by construction, reduced-motion support,
`alt` required for owner images. Verified by axe-core (WCAG 2.1 A/AA) on all generated fixture sites; see [visual-qa.md](visual-qa.md).
