# Live evidence

Everything here came from the real RumptyCloud deployment of `main` (no localhost, no mock). No secrets, cookies or passwords are included; the evidence account's credentials were generated for the run and are not stored.

| File                                       | What it is                                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `acceptance-final.evidence.json`           | Authoritative run on SHA `cb871bf`: ids, server timestamps, HTTP statuses, policy, execution, recovery verification |
| `acceptance-api-driver.log.jsonl`          | Time-stamped driver log for both API-driven runs (first on `fab20e3`, then `cb871bf`)                               |
| `acceptance-run1-fab20e3.evidence.json`    | The earlier run that exposed the owner-status defect (fixed in PR #19)                                              |
| `passport/incident-49148f51.passport.json` | Incident Passport v2 of the authoritative run; `pnpm kora:verify <file>` → PASS                                     |
| `passport/incident-8d294a6c.passport.json` | Passport of the earlier run; also PASS                                                                              |
| `screens/ui-1…ui-5`                        | Real UI run: overview _Waiting for approval_ → incident story → _Checking recovery_ → _Recovered_ → Proof mode      |
| `screens/showcase-oko-dining-*.png`        | The live showcase customer site (desktop and phone)                                                                 |
| `ui-run.log.json`                          | Step log of the UI run (pill text asserted before each screenshot)                                                  |

Verify a Passport yourself: `pnpm install && pnpm kora:verify docs/live/passport/incident-49148f51.passport.json`.
Narrative and the list of what was **not** verified: `LIVE-ACCEPTANCE.md`.
