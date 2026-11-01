# Design v2 decisions (owner answers)

| Date       | Question                 | Answer                                          | Consequence                                                                                                                                                                                                                                          |
| ---------- | ------------------------ | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-31 | Image generation default | Yes: hosted API first, self-hosted worker later | `ImageProvider` chain defaults to a hosted provider; open-weight self-hosting is a later addition                                                                                                                                                    |
| 2026-10-31 | Remotion licence tier    | Free tier (the owner's answer: "free remotion") | Valid only while the organisation has at most 3 people; Phase 5 must record this in `DEPENDENCIES.md` and re-check if the team grows. The message was cut off after this point, so any qualification the owner meant to add is **not** recorded here |

Still open: references, dish reviewers, legal read (see `audit-before/FINDINGS.md`, section 5).
