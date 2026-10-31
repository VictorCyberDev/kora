# ADR-025: Attribution, social analytics, reputation and business memory

Status: accepted. Milestones M31–M34.

## Attribution (M31)

- **Only what Kora can honestly see.** Kora creates tracked links (`?k=<8 letters>` plus UTMs). Only visitors who arrive through such a
  link are measured. Ordinary visits are never recorded, and no sales or revenue are claimed (`ATTRIBUTION_NOTE` ships with every number).
- **Codes are letters only** so a code can never resemble a price or phone number; caption validation also ignores URLs.
- **v2 sites get a separate `SITE_JS_V2`.** It acts only when `?k=` is present: one beacon on landing, one on a tap of a `tel:` or
  WhatsApp link, and `k` added to the enquiry form. v1 `SITE_JS` is untouched (golden hashes still pass). Existing published versions are
  immutable and keep their old script; new builds carry the new one.
- **The public events endpoint** (`/api/public/sites/:id/events`) accepts only a known code that belongs to _that_ site, ignores
  bots and link-preview fetchers, is rate limited, stores no IP, user agent or cookie, and always answers 204.
- **Enquiries** are counted from `form_submissions` whose stored `k` matches a link. The form route keeps `k` only if it has the
  exact issued shape, so a spoofed value never reaches storage.
- Campaign posts get one tracked link per channel automatically; any post can add one. The link is part of the approved text.

## Social analytics (M32)

- Raw metrics are stored exactly as the platform reports them (`raw_name`) next to a normalized name from a data table
  (`impressions`, `reach`, `engagements`, `clicks`, `followers`, `profile_views`). Unknown names are kept as `unmapped`, never guessed.
- Flows are summed; `followers` is a level and uses the latest value.
- **Only the sandbox provider implements `metrics` today.** Live providers report "not available through Kora yet". Sandbox rows are
  stored with `mode=SANDBOX`, labelled "Test data" in the UI and excluded from every report.

## Reviews and reputation (M33)

- A review is _sensitive_ if the rating is 3 or lower or the text touches refunds, health, safety, money, or conduct. For sensitive
  reviews Kora drafts nothing and says so; the owner answers. Even for positive reviews Kora only drafts a short thank-you.
- **Kora never posts a reply to any platform** (policy `reply_to_review` is DENY). The owner posts it there and records "I replied".
- Owners can add reviews they received by hand (mode `MANUAL`); connected channels with a `reviews` method can sync. Themes are
  shown only when at least three reviews mention a word.

## Business memory (M34)

- Tenant-scoped, owner-visible records: `PREFERENCE`, `FACT`, `DECISION` (owner-written) and `OUTCOME` (written by Kora).
- **Preferences are applied**: avoid/use words are merged into the Brand Kit voice for everything written or validated.
- **LEARN step:** when the owner saves a brief, finished campaigns get one `OUTCOME` entry (unique per campaign) with counts from their
  tracked links, never a cause. Owners can forget any entry; `OUTCOME` cannot be forged through the API.

## Limits

No live provider returns metrics or reviews yet (no credentials and no approved apps); the pipeline, storage, normalization and UI are
tested against the sandbox provider only. Visitor measurement is limited to tracked-link arrivals by design.
