# Design v2, Phase 0: audit before

Commit audited: `99a7e62`. Date: 2026-10-31. Method: built the repo, rendered every design-qa fixture (`scripts/design-qa/render.ts`),
screenshotted restaurant, bakery and fine-dining at 1440, 768 and 390 for all three directions, rendered four sample assets with the
real engine (`scripts/design-qa/audit-assets.ts`), measured the sites (`scripts/design-qa/audit-measure.mjs`), and screenshotted
Kora's own app at 375, 768 and 1440 in light and dark (`scripts/design-qa/audit-app.mjs`). Images are JPEG copies of the renders
(quality 70) to keep the repo small.

**Status of the comparison step: not done.** `docs/design/references/` does not exist, so nothing below is compared against
references. Every gap here is measured against the _premium floor in the brief_ and against what the renders plainly show, not
against target sites. Do not read this as "matches the references".

## 1. The brief's claims, re-proved or corrected

| Claim                                                           | Result                       | Evidence                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Restaurant menu cards show the same placeholder arches, no food | **Confirmed**                | `sites/restaurant/0-desktop.jpg`: four cards (Jollof rice, Pepper soup, Suya, Palm wine) each show three coloured arches and a dot; only the order of colours changes                                                                                                  |
| Restaurant hero is an empty upmarket dining room                | **Confirmed**                | same file: bar, banquette, laid tables, no food, nothing Nigerian                                                                                                                                                                                                      |
| Bakery hero is an empty bright room                             | **Confirmed**                | `sites/bakery/0-desktop.jpg`: white room with tall windows and a pendant lamp                                                                                                                                                                                          |
| Filler sections "How it works"                                  | **Confirmed in all three**   | headings per fixture in `measurements.md`: "Choose a time / We confirm / Come in" (restaurant, fine), "Find us / Come by / Enjoy" (bakery)                                                                                                                             |
| Cake seller has no cake gallery and no cake order flow          | **Confirmed, and worse**     | the brief's offers (sourdough, croissants, celebration cakes, cupcakes) are not listed _anywhere_ on the bakery page; the only product copy is the one-line description. The form is generic ("How can we help?") with no occasion, date, servings, flavour or message |
| Banners and flyers are flat colour with one circle, no food     | **Confirmed**                | `assets/*.jpg`                                                                                                                                                                                                                                                         |
| Fine-dining portrait headline runs almost to the canvas edge    | **Confirmed by measurement** | `assets/edge-gaps.md`: right gap 34 px (3.1% of width) against a left margin of 87 px; "A seven-course" ends at x=1045 of 1080. The other three assets are fine (right gaps 120, 387, 415 px)                                                                          |
| Fine-dining site is the closest to premium                      | **Partly**                   | dark navy, Cormorant serif, gold, quiet buttons and a warm timber-ceiling hero photo are good. But the menu is a three-line text list with no dishes, and "How it works" is still present                                                                              |

## 2. New findings the brief did not list

1. **Facts are shown twice on the bakery page.** Location, hours and phone appear as hero bullets _and_ again directly below in the trust strip.
2. **Asset colours ignore the site's mood.** The fine-dining site is dark navy with gold, but its portrait asset is an olive-gold field with navy text, because `deriveBrandKit` uses the palette's `primary` as the asset background. The campaign does not look like the website it advertises.
3. **Kora's own site-tab strip is 18 tabs and wraps to two rows at 1440** (`app/create-1440-light.jpg`). Known already; now measured and seen.
4. **Hard background seam in the app.** In `app/create-1440-light.jpg` the page's warm gradient ends abruptly near y=770 and the area below is a flatter tone. A visible edge on any page shorter than the viewport.
5. **The Create page is three selects and a button.** Functional, but nothing there suggests "agency-made" or helps a non-writer.

## 3. Measurements (`measurements.md`, 1440x900, first screen plus first scroll)

- **Photos in the first two screens: 1 in all nine variants** (3 fixtures x 3 directions). The premium floor needs at least 3 concrete, on-topic images.
- **Vector art** (the arches) fills the first two screens in only one variant (restaurant direction 0, four pieces); elsewhere the menu cards are below that cut-off.
- **H1 size**: 2.9% to 7.8% of viewport width. The floor's editorial tier asks for at least 7vw; only bakery direction 2 reaches it (7.78%). Restaurant and fine are 4.9 to 5.8%.
- **Fonts**: 2 to 4 files, 32 to 73 KB per page, inside the 5-file / 150 KB limits.
- **Weight**: 175 to 302 KB per page including photos (images 108 to 193 KB). The "under 90 KB" budget in the docs is for HTML and CSS, which I did not separately re-measure here.
- **Repeated imagery**: the same five stock photos serve every business of a type. Image KB values repeat (112, 108, 193), which shows the same files recurring across fixtures.
- **Sample asset edge gaps**: see the table in `assets/edge-gaps.md`.

## 4. What I did not do

- No Lighthouse or LCP measurement. Never measured for Kora; still not.
- No comparison with references (none supplied).
- No review of the Kora marketing landing page beyond the screenshots; no accessibility re-run (axe passes in CI for the logged-in app).
- I viewed one direction per fixture in detail (direction 0, desktop). Directions 1 and 2 and the tablet and mobile shots are captured in `sites/` and the measurements cover all nine, but I did not read each image.

## 5. Stopping here, as the prompt says

Phase 0 requires references before findings can be compared, and it says to stop and ask if they are missing. They are missing.
Phase 1 (DESIGN.md and the premium library) also waits on your review. Nothing in the product code has changed.

What I need from you:

1. **References** in `docs/design/references/`: at least 6 sites, 4 flyers or social posts and 4 food images that represent the target look.
   Patisserie and cake references are the weakest area; the brief asks for 8 premium cake and patisserie sites and 8 flyer or social examples.
2. **Remotion tier**: is Kora (the organisation) more than 3 people? That decides free versus the Automators licence.
3. **GPU stance**: hosted image API first, self-hosted later (the brief's default)?
4. **Dish reviewers**: you plus at least one more person who knows how Nigerian dishes should look, for the dish gate in Phase 3.
5. **Legal read**: a Nigerian lawyer on the attestation wording and the FCCPC position, before Phase 3 ships to owners.
