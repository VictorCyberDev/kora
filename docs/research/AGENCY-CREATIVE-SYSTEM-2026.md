# Agency creative system research (v7, 2026-11-02)

This note records how the v7 creative system was researched, what the research does and does not support, and how
each finding became a first-party design grammar. The structured corpus is `packages/creative/src/references.ts`;
raw observations are in `docs/research/evidence-live-fetch-2026.md`.

## Method and what was actually done

Two bodies of evidence, kept apart so neither is inflated:

**1. The rendered study (this is what the count rests on).** `scripts/research/observe.mjs` opens each site in
Chromium at 1440x900 and again at 390x844 and records what the page actually shows: the fonts applied to the headline,
body and buttons; the colours painted across the first screen by area; headline size, weight, case, alignment and line
length; button radius and height; how much of the first screen is a picture and where it sits; whether the first
screen has a full-bleed background image; header position and visible navigation; page length; structured data and
social preview presence; on a phone, whether there is a menu button, a sticky bottom bar or any sideways overflow.
These are COMPUTED values, not read from source. Raw data: `docs/research/data/site-observations-2026.jsonl`. A table
of every site, with a derived fingerprint: `docs/research/SITE-OBSERVATIONS-2026.md`. Counts are pinned by tests that
read the data file.

| Outcome                                                    | Count   |
| ---------------------------------------------------------- | ------- |
| Attempted (254 sites in 16 kinds of business)              | 254     |
| **Studied: rendered, measured at desktop and phone width** | **182** |
| Blocked by the site (403/429) and recorded as blocked      | 46      |
| Network or other errors, recorded as errors                | 18      |
| Rendered but not counted (bot challenge, empty JS shell)   | 8       |

Evidence class for the 182: **DIRECT_SITE_REVIEW** (live page rendered and measured). One page per site, the home
page: this is a study of first impressions and page systems, not of whole sites. Consent banners were dismissed when a
standard "Accept" button was found. No screenshots, copy, imagery or code from these sites are stored in this
repository.

**2. The reference atlas (design memory).** `packages/creative/src/references.ts` holds 106 structured principle
entries, each with `whyItWorks`, `whenItFails`, `smallBusinessApplicability`, the grammars it informed and a
`doNotCopy` line. Their evidence classes are stated and are NOT counted as studied unless they are the first kind:

| Evidence class       | Count | What it means                                                                                                 |
| -------------------- | ----- | ------------------------------------------------------------------------------------------------------------- |
| `DIRECT_SITE_REVIEW` | 23    | Static HTML and CSS of the live site were retrieved and read (2026-11-02). Superseded in strength by study 1. |
| `SEARCH_LEAD`        | 28    | Named by a search result. The site itself was **not opened**. Kept as a lead; **not counted as studied**.     |
| `ANALYST_MEMORY`     | 55    | Kora's analysis from general knowledge. **Not re-verified live; not counted as studied.**                     |

`CASE_STUDY_REVIEW` and `SECONDARY_DESIGN_ANALYSIS` are not used: no published case study or secondary analysis was
read as a source in this research, so none is claimed.

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

## Kora measured with the same instrument

The 54 golden pages (18 businesses x 3 directions, plain mode: no owner photographs) were rendered and measured by the
same script as the studied sites. This is a calibration check, not a claim of superiority.

| measure                                 | studied sites | Kora v3 golden |
| --------------------------------------- | ------------- | -------------- |
| n                                       | 182           | 54             |
| dark page %                             | 8             | 20             |
| uppercase headline %                    | 13            | 9              |
| italic headline %                       | 0             | 0              |
| centred headline %                      | 33            | 7              |
| median headline words                   | 5             | 5              |
| median headline size (% viewport width) | 3.6           | 6.1            |
| median body px                          | 16            | 18             |
| square button %                         | 49            | 72             |
| pill button %                           | 26            | 11             |
| image-led first screen %                | 62            | 2              |
| text/product-led first screen %         | 21            | 76             |
| sticky header %                         | 40            | 0              |
| median nav items                        | 5             | 5              |
| median page length (screens)            | 6.5           | 4              |
| JSON-LD %                               | 77            | 100            |
| og:image %                              | 75            | 0              |
| phone menu button %                     | 80            | 0              |
| phone sticky bottom bar %               | 29            | 26             |
| phone overflow %                        | 0             | 0              |

Kora distinct (heading font, page colour, headline case, button radius) combinations: 43 of 54
Studied sites distinct combinations: 172 of 182

What this changed and what it did not:

- **Changed.** The first type scale put Kora's median headline at about twice the studied sites' width (7.1% against
  3.6% of the viewport) and above their 90th percentile. The scale was reduced (to 6.1%), the two oversized hero
  families were pulled in, and call-first heroes were scaled down so the phone number sits on the first screen.
  Headlines remain larger than the corpus on purpose: they are short (median five words, like the corpus) and a
  small business gains more from a clear statement than from a corporate-size one.
- **Not changed, and why.** Image-led first screens are 2% for Kora against 62% in the corpus because plain mode has
  no owner photographs; with photographs the first screen becomes picture-led (see the enriched sheet). Kora pages are
  shorter (4 against 6.5 screens) and have no sticky header; both are deliberate for one-page small businesses and
  are listed as design decisions, not defects. "Phone menu button 0%" is a measurement limit: Kora's menu is a
  `<details>` control, which the probe does not count.
- **Diversity.** 43 of 54 golden pages differ in (heading font, page colour, headline case, button radius); the
  studied sites: 172 of 182.
