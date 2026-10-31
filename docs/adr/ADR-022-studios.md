# ADR-022: Content, Brand and Motion Studio

Status: accepted. Milestones M23–M25.

## Decisions

1. **Facts first.** Every studio starts from the Presence Graph and a saved Brand Kit. Without a profile or kit the API
   answers `409 no_profile` / `no_brand_kit`; nothing is written from a blank prompt.
2. **AI pipeline.** business facts → deterministic context → (optional model) → zod schema → business-rule validation →
   proposal. `validateDraft` blocks any price, time or phone number not in the profile, ended offers, words the Brand Kit
   says to avoid, channel length and hashtag limits, and flags unprovable superlatives. A model draft that fails is
   dropped and the deterministic writer is used. Raw model output is never stored or shown. No model is configured in
   production today, so the deterministic writer is the live path.
3. **Brand Studio is constrained.** The owner controls headline, short line, highlight, button text, contact line,
   layout (bold/clean/split), colorway (kit colors only) and size. Fonts, geometry and colors come from the kit; text
   is placed by a layout engine (`layoutStack`) that scales and truncates so nothing overlaps or leaves the canvas.
   The contact line must be one of the business's numbers. The wordmark is the business name in text; Kora never draws
   a logo.
4. **Assets are immutable and versioned.** `media_assets` rows are update-blocked and record the Brand Kit version
   used. Changing the kit affects only new assets (tested byte-for-byte).
5. **Rendering is deterministic.** SVG is generated purely from (spec, kit, time); PNG via resvg with only bundled
   fonts (no system fonts), so output is identical on every host. SVG served back has a locked-down CSP.
6. **Motion = deterministic frames.** A video is `motionFrameSvg(spec, kit, t)` for t = 0..d. Preview is three poster
   frames, instant. Export is a queued job (Postgres `SKIP LOCKED`), 3 attempts, stuck-job recovery after 5 minutes,
   retry only from `FAILED` (safe because rendering is pure). MP4 needs `ffmpeg`; if absent the API reports
   `not_configured` rather than pretending. Generative video is out of scope and would sit behind capability detection.

## Consequences / limits

- ₦ is not in the bundled latin subsets, so a full Inter (OFL) is bundled as the glyph fallback.
- Production image has no ffmpeg unless built with `--build-arg WITH_FFMPEG=true`.
- Asset bytes live in Postgres (fine at this scale); object storage is the next step if volume grows.
- Publishing these assets/drafts to channels is the next milestone (calendar + publishing engine).
