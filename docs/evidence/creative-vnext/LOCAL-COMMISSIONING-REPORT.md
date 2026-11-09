# Local commissioning report (zero incremental infrastructure cost)

Release candidate: branch `claude/eloquent-turing-38283b`. Checkpoint on entry: `1c34f561f6a8c27241cb94030ad99d55af9a3b2e`.
Everything here ran on one development machine (Linux, 4 vCPU, 16 GB) against a throwaway PostgreSQL 16 database whose name ends in
`_test`. **No hosted service, production database, bucket, domain or credential was contacted; nothing was deployed, merged or
provisioned.** Docker is not available in this environment, so the container image was not built (see "Not shown locally").

Machine-readable results: `commissioning/results.json` (199 checks), `browser-results.json`, `migration-results.json`,
`resources.json`, `load-results.json`; the log is `commissioning/commissioning.log`; service logs are in `commissioning/service-logs/`.
Re-run: `node scripts/commission/local.mjs <outDir>` (needs the previous release built at `/var/tmp/kora-base`).

## Real versus simulated

| Kind          | Meaning                                                                                                                                                                        | Count in the run              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| **real**      | real processes (control plane serving the web app; Site Host), real HTTP, real PostgreSQL, real Chromium                                                                       | 188                           |
| **simulated** | an external provider replaced by a local fake server: **Unsplash** (search, selection, download tracking, quota headers) and a **language model** (OpenAI-compatible endpoint) | 11 (tagged `mock` in the log) |

No result in this report is evidence about the real Unsplash service or a real model. Where a browser check displayed a stock
picture, the request to `images.unsplash.com` was answered locally with a placeholder, and the check's name says so.

## Outcome by phase

| #   | Phase                                                                                                                                | Checks         | Failed | What it established                                                                                                                                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | Environment                                                                                                                          | 4              | 0      | disposable `_test` database; built artifacts of this release and of the previous release (`e2b62df`) present                                                                                                                                                                                                                                          |
| 1   | **Previous release** on migrations up to 027 with customer-shaped data                                                               | 8              | 0      | a v2 site was generated, published (live bytes MATCH), monitored; a visitor enquiry stored; row counts captured                                                                                                                                                                                                                                       |
| 2   | **Migrations 028, 029, 030** one at a time on that data                                                                              | 21             | 0      | objects absent before and present after; each applies in 4 / 8 / 27 ms; each is a no-op the second time; no row lost or added; existing sites `deleted_at` NULL; `owner_confirmations` rejects UPDATE and DELETE; `domains.state` accepts `RELEASED`; the production runner completes (30 files)                                                      |
| 3   | **This release on the documented staging values** (`KORA_CREATIVE_ENGINE=v3`, `KORA_MEDIA_UNSPLASH=off`, `KORA_MODEL_COMPOSE=false`) | 15             | 0      | API and Site Host start; the startup log states the effective switches; no warning; `/health`, `/__kora`; the web app and a built asset are served by the API process; the legacy site, its history and its pre-upgrade enquiry survive; its spec is still version 2                                                                                  |
| 4   | Existing v7 commissioning (monitoring, controlled failure and recovery, Brand OS), flag v3 then flag back to v2                      | 4 (+40 inside) | 0      | `commission-v7` v3 phase 32 checks and rollback phase 8 checks pass against this release; the previous release's baseline phase had 8                                                                                                                                                                                                                 |
| 5   | **vNext journeys over HTTP** (below)                                                                                                 | 102            | 0      | see next section                                                                                                                                                                                                                                                                                                                                      |
| 6   | **Browser** on two API instances (default engine and v3) and one Site Host, one shared database                                      | 10             | 0      | published Kochab, bakery and barber sites at desktop and phone width: every page 200, no overflow, no broken image, no console error, no serious axe violation; a contact form typed in a phone browser returns 201 and appears in the owner's inbox; the repository's Playwright suite run against the **running** services: **27 passed** (8.4 min) |
| 7   | **Rollback compatibility**: the previous release run on the database this release wrote to                                           | 18             | 0      | see below                                                                                                                                                                                                                                                                                                                                             |
| 8   | **Deployment order**                                                                                                                 | 5              | 0      | see below                                                                                                                                                                                                                                                                                                                                             |
| 9   | **Production-image contents** (tree built only from the Dockerfile `COPY` list, `NODE_ENV=production`)                               | 11             | 0      | production dependencies install from the lockfile; both services start; web app served; signup, generation of Kochab (6 pages), publish (MATCH), Site Host serving, bundled photographs and catalogue present; no module-not-found                                                                                                                    |
| 10  | Resources                                                                                                                            | 1              | 0      | `resources.json`; see HOSTING-ARCHITECTURE.md                                                                                                                                                                                                                                                                                                         |
|     | **Total**                                                                                                                            | **199**        | **0**  |                                                                                                                                                                                                                                                                                                                                                       |

### Phase 5 in detail (against the running services)

- **The three mandatory briefs end to end:** Kochab Studio (6 pages, no invented client, award, price or testimonial), Sweet Crumbs Bakery
  (6 pages; 18 image placements from 11 distinct photographs), "I cut hair." (6 pages; a single "Haircuts" offering; no duplicate page). Each: generated through the
  API, no blocking quality issue, published, live bytes verified (MATCH), every page served by the Site Host with no placeholder text leaking.
- **Editor operations and regeneration:** rename a page; edit the opening headline; edit a service name; reorder sections; reorder pages;
  remove a page; add a page; add and remove a section; regenerate a page; regenerate a section; an unconfirmed claim ("baking for over 20 years") is refused until
  the owner records a confirmation of that exact sentence, and the confirmation does not unlock the same sentence on the owner's other site.
- **Pictures:** a catalogue photo is applied with server-derived provenance; a forged Unsplash object without a server-signed selection is refused; an owner photo is
  uploaded, listed with an https public address, applied, and a photo address belonging to another site is refused; stock selection through a signed token
  (simulated provider) carries the app's credit and records exactly one download event; another organisation cannot use the token.
- **Undo, publish, rollback:** restoring an earlier version creates a new draft and keeps history; an edit the limits refuse changes nothing; the edited version is published
  (MATCH) and shows the owner's edits; rolling back restores the earlier public bytes.
- **Forms:** a real enquiry is accepted (201), a honeypot post is silently dropped, an empty post is refused (422); the owner's inbox shows the enquiry and another organisation cannot read it.
- **Monitoring and recovery:** a controlled failure injected on a published site makes the Site Host serve errors; the site monitor opens an incident; after the
  fault is removed the site serves again.
- **Delete and restore:** the impact is shown; deleting without the confirmed name is refused; deleting stops the public site and the public form; the retained enquiries can be
  exported; restore brings the site back as UNPUBLISHED; it republishes (MATCH) and the enquiry is still there.
- **Tenant isolation:** a second owner is refused (4xx) on all 13 attempts against the first owner's site (read, versions, edit, publish, delete, restore, media candidates,
  catalogue, confirmations, enquiries, deleted enquiries, controlled failure), the first owner's site is unchanged afterwards, and the second owner's site list and organisation
  read exclude the first owner's data.
- **Concurrency:** six rounds of a publish racing a delete never left a deleted site PUBLISHED or served; five simultaneous site creations on a three-site plan admitted exactly three.
- **Allowance:** a fourth site on a three-site plan is refused with a 4xx.
- **Media fallbacks (simulated provider):** a provider outage and a provider reporting no allowance left are both absorbed (200, no candidates, failure reported, no further upstream call);
  more than ten searches a minute by one user get 429; with the Unsplash switch off a search returns no candidates and makes no upstream call, while the bundled catalogue still works.
  Generation during an outage still produced a complete site.
- **Model composition (simulated model):** a valid proposal is applied after one model call; a hostile proposal (invented claims, a foreign field path), a malformed answer and a 503 all leave a complete deterministic
  site; no key or secret appeared in a prompt.
- **Feature flags:** restarting with the default engine makes a new site a v2 design while the earlier v3 site and the legacy v2 site keep serving; restarting with the documented staging values works.
- **Invalid configuration:** `KORA_MODEL_COMPOSE` set to the word `on`, `KORA_CREATIVE_ENGINE` set to `v4` and `KORA_MEDIA_UNSPLASH` set to `true` each end the process with exit status 78 naming the variable,
  before any migration or database work, writing no rows.

### Rollback compatibility (phase 7)

On the database that this release had written to (30 migrations, six soft-deleted sites, vNext designs with the new optional fields, owner confirmations), the **previous release** started and
migrated cleanly (its own auto-migrate re-ran migrations up to 027 without harm), accepted a login, listed the owner's sites including those made by this release, listed and opened vNext versions
without a server error, and served every site published by this release with its immutable bytes. A site deleted under this release was not served. It accepted a visitor enquiry and showed both enquiries.
It refused a fourth site with 402 (the plan allowance), not a server error. After the rollback, **this release started again on the same database** and still showed the enquiry made during the rollback.

### Deployment order (phase 8)

A new Site Host on a database still at migration 027 answered `/health` with the database "ok" and failed every site request (`column "deleted_at" does not exist`). That was a defect (below);
it now answers 503 with `schema: "outdated"` until the migrations have run, and answers 200 afterwards.

## Defects this commissioning found, and what was done

| #   | Finding                                                                                                                                                                                                             | Fix                                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The staging notes documented `KORA_MODEL_COMPOSE=on`; the parser accepts only `true` or `false`, so following the notes stops the API at startup                                                                    | Corrected everywhere; `CONFIGURATION.md` states the exact syntax; a test fails if any document, `.env.example` or script shows a value the parser rejects (it caught the old text and, later, my own harness labels) |
| 2   | An invalid switch produced a raw stack trace, **after** migrations had already run                                                                                                                                  | Switches are validated before the database is touched; the process exits 78 with a message that names the variable and the accepted values and never prints the offending value                                      |
| 3   | A new Site Host answered readiness 200 on an unmigrated database while failing every site request                                                                                                                   | Readiness is 503 (`schema: "outdated"`) until the schema is current; tested                                                                                                                                          |
| 4   | `KORA_SECRETS_KEY` was validated late (after migrations, with a stack trace)                                                                                                                                        | Validated at startup (32 random bytes, base64) with the same safe message                                                                                                                                            |
| 5   | A switch that is valid but would do nothing (for example model composition with no AI provider, Unsplash on without its key) was silent                                                                             | One `release switches` line at startup and one warning per mismatch (never a secret value)                                                                                                                           |
| 6   | **My earlier "final" commit failed `pnpm lint`**: the generated example sites I had added to the evidence directory were linted as source. The earlier exit codes were from before those files existed              | Evidence examples are excluded from lint; the whole pipeline was rerun on the final code (all six steps exit 0)                                                                                                      |
| 7   | Two of my own commissioning checks were wrong (a tenant-isolation check used a route that does not exist, so it passed vacuously; two media checks expected 429 where the product deliberately absorbs the failure) | Replaced with checks of the real contract; every check was run and read before the final run                                                                                                                         |
| 8   | The first Playwright run against the live services failed 2 of 27: my second API instance had monitoring switched off, and monitors are in-process (documented as "single instance")                                | Both instances monitor in the test-only layout; 27 pass. This confirms the runbook's rule: **run one instance of each service**                                                                                      |

## Not shown locally (depends on RumptyCloud, real Unsplash credentials, or real model access)

See "What still requires RumptyCloud" in HOSTING-ARCHITECTURE.md for the hosted list. Beyond it:

- **Real Unsplash:** every Unsplash result above is from a local fake. The real API's behaviour, quota headers, terms and an operator decision on caching remain **pending credentials**.
- **A real language model:** composition was tested only against a local fake that returns valid, hostile, malformed and failing answers. Quality of real output is **unevaluated**.
- **The container image:** not built (no Docker daemon). The contents rehearsal shows the Dockerfile's `COPY` list is sufficient; it does not show that the build succeeds, the image's size, or the non-root user.
- Hosted TLS, secure cookies, the platform proxy, the public https media origin, real memory limits, sleeping/cold-start behaviour, and a rehearsal on production-sized data.
- Lighthouse and field Core Web Vitals; real devices and screen readers.

## Verdict

**Locally commissioned: yes. Hosted-ready: not established.**

All requirements that can be executed on one machine without infrastructure cost were executed and pass: 199 checks, 0 failed, plus the six repository pipeline steps (`logs/exit-codes.txt`: install, format, lint,
typecheck, build, test; 580 API tests passing, 1 pre-existing skip). The release candidate is **suitable to be put forward for a human-authorised staging rehearsal on RumptyCloud**, in the order in
`STAGING-RELEASE-INSTRUCTIONS.md`, with `KORA_CREATIVE_ENGINE=v3`, Unsplash `off` and model composition `false` first. It is **not** established that it is ready for production, and this work does not claim so:
the hosted-only items above, real Unsplash validation and real model validation are each unproven. Nothing was merged or deployed.
