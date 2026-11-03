# ArtifactSpec

One validated contract and one trusted renderer for every non-website creative.

| Format                             | Size                     | Notes                          |
| ---------------------------------- | ------------------------ | ------------------------------ |
| `social-square`                    | 1080 x 1080              | feed                           |
| `social-portrait`                  | 1080 x 1350              | feed                           |
| `story`                            | 1080 x 1920              | safe zone: 250 top, 340 bottom |
| `whatsapp-status`                  | 1080 x 1920              | safe zone: 190 top, 230 bottom |
| `banner`                           | 1500 x 500               | wide                           |
| `flyer-a5`                         | 1480 x 2100 + 3 mm bleed | 10 px/mm; RGB                  |
| `carousel-cover`, `carousel-slide` | 1080 x 1350              | slides                         |

Composition families: poster-type, photo-hero, split-panel, editorial-column, badge-offer, ticker-banner, list-card.
`chooseComposition` decides from **format first, then the brand's composition mode**, image availability, bullets and
offer. A square and a story are not a resize of each other.

The spec carries the Brand OS version and hash, palette, type voice and motif, the campaign objective, the content, a
media reference and provenance. Media is a reference (`assetId`); the renderer never fetches. A generated picture is
accepted only when the owner has approved it (`generated_media.review = APPROVED`), otherwise `media_not_approved`.

Gates: text must stay on the canvas and off story chrome (`TEXT_OFF_CANVAS`, `OUTSIDE_SAFE_ZONE`), generic phrases warn,
unreviewed or missing media blocks, and Kora-composed copy may not contain figures the owner never supplied.

API: `GET /api/artifact-formats`, `POST /api/sites/:id/artifacts/preview`, `POST /api/sites/:id/artifacts`,
`POST /api/sites/:id/artifacts/bundle` (one message, up to six formats, one campaign id). Assets are stored in the
existing immutable `media_assets` table with the Brand OS version in `brand_version`.

## Print, stated truthfully

Print output is RGB at 254 dpi with 3 mm bleed included in the canvas. It is **not** press-ready: no CMYK, no PDF/X, no
crop marks. The spec constant `PRINT.pressReady` is `false`.

## Status words

An artifact is CREATED when stored. It is never described as posted: Kora has no live posting adapter for any channel,
so the UI says "Created, not posted" and offers download or the existing calendar hand-off.
