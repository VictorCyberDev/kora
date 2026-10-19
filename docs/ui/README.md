# Evidence page screenshots

Taken from `GET /ui` served by the API against a throw-away PostgreSQL database (name ending in `_test`) seeded with three services (one with a name made of HTML to show it is rendered as text), one open and one resolved incident, and two Deployment Verification checks.

| File                          | View                                                            |
| ----------------------------- | --------------------------------------------------------------- |
| `home-375.png`                | Services and the Deployment Verification panel, 375px wide      |
| `home-1280.png`               | The same, 1280px wide                                           |
| `incident-diagnosis-375.png`  | One incident: diagnosis, gaps (UNKNOWN vs NOT COLLECTED), 375px |
| `incident-diagnosis-1280.png` | The same, 1280px wide                                           |

Both widths are cropped from full-page captures (the full incident page at 375px is about 10,000px tall). Light scheme shown; the page follows `prefers-color-scheme` and was also checked in dark.

To reproduce: build, run the API against a seeded `_test` database, then with Playwright's preinstalled Chromium (`PLAYWRIGHT_BROWSERS_PATH`, no browser download) open `http://127.0.0.1:<port>/ui` at the two viewport widths.
