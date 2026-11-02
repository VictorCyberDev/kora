# Agency creative system research (v7, 2026-11-02)

This note records how the v7 creative system was researched, what the research does and does not support, and how
each finding became a first-party design grammar. The structured corpus is `packages/creative/src/references.ts`;
raw observations are in `docs/research/evidence-live-fetch-2026.md`.

## Method and what was actually done

| Evidence level | Count | What it means                                                                                                                                                         |
| -------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fetched`      | 23    | Homepage HTML and up to six stylesheets were retrieved over HTTP and read for fonts, hex colours, radii, headline and structure counts. No rendering, no screenshots. |
| `search-lead`  | 28    | Named by a search result (mostly agency and vendor roundups). The site itself was **not opened**; only the stated principle is recorded.                              |
| `analyst`      | 55    | Kora's design analysis from general knowledge of the brand or category. **Not re-verified live in this research.**                                                    |

The mandate asked for at least 100 references studied; the corpus has 106 structured entries, but only 23 were read live
and all 23 by static fetch. The Firecrawl allowance ran out on the first batch, so a rendered scrape of the seven
blocked or JavaScript-only sites (Duolingo, Aesop, COS, LEGO, Canva, GoDaddy, Muji) is outstanding. Entries for
those are marked `analyst`. A test pins these counts so the documentation cannot claim more than was done.

Reference policy: **design memory, not a template inventory.** Nothing is copied: no layout, copy, imagery, mark or
motion. Every entry carries a `doNotCopy` line and names the first-party grammar it informed, never a brand as an enum.

## What the observed data supports

1. One saturated accent with one or two supports over tinted neutrals (Wise, Monzo, Mailchimp, Shopify, Airbnb).
   Grammars therefore carry five-colour colourways with an explicit accent scarcity, not a free palette.
2. Neutrals are tinted toward the brand, not grey (warm charcoal, blush, mint, navy). Every Kora surface tone is derived
   from the brand colours.
3. Radius is a personality dial: pill and soft (Apple, Wix, Headspace) versus square and editorial (Glossier, Kinfolk,
   Sonos). `radiusStyle` is a genome field applied consistently.
4. Sparse type-and-colour-led pages (Oatly, Durable) beat image grids when photography is missing. This is why Kora's
   deterministic path prefers typography and procedural plates over unrelated stock.
5. The AI-builder look has converged on near-black with small neon accents and Inter (Framer, Shopify, Linear style).
   Kora uses that dark technical grammar only for genuinely technical businesses.

## Transferable principles to grammars

| Principle                                    | First-party grammar  |
| -------------------------------------------- | -------------------- |
| Generous, warm, appetising, arch frames      | Sunday Table         |
| Layered, tactile, maker's stamp              | Handmade Modern      |
| Measured, hairline rules, classical type     | Quiet Authority      |
| Loud, local, ticker band, flat colour fields | Neighbourhood Energy |
| Calm, numbered steps, thin outlines          | Precision Practice   |
| Moody, cinematic, corner brackets            | After Dark           |
| The work leads; huge image, small type       | The Monograph        |
| Bright, abundant, tag edges                  | Fresh Market         |
| Big, kind, rounded, soft wave                | Bright Beginnings    |
| Plain, strong, number first, diagonal cut    | Solid Ground         |
| Extreme type contrast, selective             | The Edit             |
| Precise, technical, index marks              | Clear Signal         |
| Sincere, rooted, time and place              | Common Ground        |
| Slow, tender, grain and arch                 | Soft Hours           |
| Scale, light, gracious welcome               | Arrival              |

## Competitive findings (read with the caveat that features were not verified live)

Homepage tokens and headlines were observed for Wix, Squarespace, Framer, Durable, Hostinger and Shopify; all feature
claims are unverified. The consistent gap is structural: these tools map a prompt or a template to a layout, so
outputs converge (hero, three cards, call to action) and brand coherence beyond the website is manual. Kora's
position: business truth drives structure and copy; one Brand OS drives website, flyers, posts and stories; and a
published site stays under monitoring. Kora does not claim to beat them on template count, component count or image
generation.

## Not covered

Awwwards, CSS Design Awards and SiteInspire searches returned no usable collections; entries for those are pattern
notes only. Webflow, 10Web, Adobe Express and VistaCreate were not researched live.
