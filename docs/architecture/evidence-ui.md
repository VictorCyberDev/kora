# Evidence page (`GET /ui`)

One read-only page, served by the API, so a person can follow one incident from fact to diagnosis to export without `curl`.

## What it is

- A single HTML document with its CSS and JavaScript embedded as strings in `apps/api/src/ui/page.ts`. No framework, no build step, no external font, script, image or network call. It ships inside `dist` with the API; the Dockerfile is unchanged.
- Registered from `app.ts` with one line (`registerUiRoutes(app)`); the route and its headers are in `apps/api/src/ui/ui-routes.ts`.
- The route itself reads nothing. The page reads the API's existing JSON routes with `GET`, same origin only: `/services`, `/incidents`, `/services/:id/verification` and `/incidents/:id/passport`. Nothing under `/dev` is referenced.

## What it shows

1. **Services**, each with the provider-reported status, the number of open incidents (derived from the incident list; if the list cannot be loaded this shows UNKNOWN, not "none"), and the **Deployment Verification (not cryptographic)** panel: status, claimed commit next to the source head, `behindBy` when the API gives one, the evidence list, and the provider leg exactly as the API reports it (`NOT COLLECTED` with its reason).
2. **Incidents**, then one incident, built from a single read of its Passport so every section comes from one consistent export: summary, timeline, evidence items with their SHA-256, the diagnosis (root cause shown as the API states it, `UNKNOWN` included, plus findings, contradictions and the snapshot hash) and the gaps list.
3. **Export**: a "Download Incident Passport" link to `GET /incidents/:id/passport`, the offline command `pnpm kora:verify <file>`, and the line "Integrity only: not signed, does not show who produced it".

`UNKNOWN` (Kora cannot establish the answer from the evidence it has) and `NOT COLLECTED` (Kora does not gather that data) differ in text, in a glyph (`?` and `∅`) and in border style (dashed and solid), never by colour alone. Every list has a loading, an empty and an error state; an error names the HTTP status or "network error" and never echoes the response body.

There is no live health route in the API, so health is shown through incidents and evidence only; the footer says so.

## Security properties

- **No authentication.** The API has none and neither does the page; the footer says so on every view. Anyone who can reach the address can read the page and the data behind it.
- **Strict Content-Security-Policy:** `default-src 'none'`; `style-src` and `script-src` allow only the page's own inline style and script, by SHA-256 hash computed at start-up; `connect-src 'self'`; `base-uri 'none'`; `form-action 'none'`; `frame-ancestors 'none'`. Also `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`.
- **Data is text.** Every dynamic string is inserted with `textContent`; the script contains no `innerHTML`, no style attribute, no dynamic code. Link targets are fixed prefixes plus a value that must be a UUID. Very long values are cut at 2000 characters with a marker.
- **No control changes state.** There is no button, form or input; the only interactive elements are links and `<summary>`, so the page is keyboard operable. All requests are `GET`.

## Tests

`apps/api/src/ui/*.test.ts`: headers and CSP hashes; a self-contained-document check; a jsdom harness that **runs the served script** with `fetch` answering from fixtures (hostile strings in service, incident, evidence, timeline, diagnosis, gap and verification fields stay inert; same-origin GET of known paths only; an empty and an error state for every list; UNKNOWN versus NOT COLLECTED; the download link and command); and one integration test that renders a real incident, a real verification check and a real Passport from PostgreSQL. A terminology guard keeps the claims the project forbids out of the page and its tests.

Screenshots (`docs/ui/`) were taken with the preinstalled Chromium through Playwright against the running API, which also exercised the CSP in a real browser (no violations, no horizontal overflow at 375px). See `docs/ui/README.md`.

## Limits

- It is a viewer, not a monitor: nothing refreshes by itself; reload to read again.
- A service with no verification yet makes the browser log one `404` per service in its console; the page shows that as an empty state.
- jsdom does not enforce CSP; the CSP itself was checked in Chromium, and its hashes by the route tests.
