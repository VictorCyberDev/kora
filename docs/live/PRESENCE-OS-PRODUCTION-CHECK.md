# Presence OS and Marketing Execution OS: production verification

Separate from `LIVE-ACCEPTANCE.md` (the October 30 reliability acceptance on commit `cb871bf`, which is unchanged). This file records a
fresh production run of the Presence/Marketing build on **commit `b29226c0835648a5f447be3021b50dddd16ce9c1`**, observed from
`https://kora-api.rumptycloud.app/__kora` immediately before each run, on **2026-10-31**.

Both scripts are in `scripts/` and create a throwaway trial account. They send nothing to any third-party provider. No secrets are
printed; tracking codes are masked.

## 1. Presence and marketing features (`scripts/live-presence-check.mjs`): 24 of 24 passed

```
PASS  runtime claim  commit b29226c0835648a5f447be3021b50dddd16ce9c1
PASS  signup  201
PASS  features: trial includes everything  tier TRIAL
PASS  site generated  201
PASS  site published  200
PASS  presence profile imported (migration 013 live)
PASS  profile saved with revision
PASS  brand kit derived
PASS  presence health has no numeric score  Nothing is broken. 2 things could be better.
PASS  channels honest: NOT_CONFIGURED, no sandbox  {"provider":"instagram","state":"NOT_CONFIGURED","missing":["META_APP_ID","META_APP_SECRET"]}
PASS  connect refuses without credentials
PASS  content drafted from facts (usage metering constraint live)  source deterministic
PASS  branded image created  201
PASS  image is a real PNG with fonts rendered  46411 bytes
PASS  video export reported honestly  exportAvailable=false
PASS  campaign bundle built, awaiting approval  posts 6
PASS  tracked link in post  https://kora-site-host.rumptycloud.app/s/presence-check-kitchen-b4b207/?utm_source=facebook&utm_medium=social&utm_campaign=lunch-launch&k=********
PASS  tracked visit counted, with limits note  Counts only people who arrived through a link Kora created. Other visitors are not measured, and Kora does not see sales.
PASS  agent suggestions carry evidence and policy  1 suggestions
PASS  growth brief lists what is unavailable
PASS  voice intent routes and needs confirmation
PASS  calendar reachable
PASS  reviews reachable
PASS  unauthenticated request cannot read a profile  401

{
  "base": "https://kora-api.rumptycloud.app",
  "commit": "b29226c0835648a5f447be3021b50dddd16ce9c1",
  "at": "2026-10-31T08:39:45.137Z",
  "passed": 24,
  "failed": 0,
  "siteId": "1e1c49d4-088d-4017-b6d5-7d1eb759221e",
  "orgId": "ddc6efc8-5c7d-48e8-879c-b2419f3bf132"
}
```

What this proves on production: migrations 013–021 applied on startup; business profile with revisions; Brand Kit; honest
`NOT_CONFIGURED` channels with no sandbox; fact-bound drafts; a real PNG rendered with the bundled fonts inside the production image;
campaign bundle with a tracked link; a tracked visit counted with its limits note; evidenced suggestions; brief with unavailable list;
voice-intent routing that needs confirmation; unauthenticated access refused.

What it deliberately does **not** show: posting to any social network, live metrics or reviews, video export, or WhatsApp. Those are
not configured on production (see the final report).

## 2. Reliability loop regression (`scripts/live-recovery-check.mjs`): passed

The recovery story still works end to end on the same commit: controlled HTTP 500, Kora's own detection, one incident, typed rollback
proposal requiring approval, owner approval, execution that is **not** counted as recovery, and `RECOVERY_VERIFIED` only after new
healthy observations.

```
PASS  runtime claim  b29226c0835648a5f447be3021b50dddd16ce9c1
PASS  publish v1
PASS  publish v2 (the 'bad release' candidate)
PASS  live site serves 200  https://kora-site-host.rumptycloud.app/s/recovery-check-laundry-04ca64/
PASS  five healthy observations
PASS  controlled fault applied
PASS  public site genuinely returns 500
PASS  Kora detected it and opened exactly one incident  c8b2531f-ae69-4e14-bc8f-6be4ef3cf714
PASS  reasoner proposed a typed rollback  republish_site_version
PASS  policy requires approval (nothing ran by itself)  AWAITING_APPROVAL
PASS  owner approved  READY
PASS  executed  VERIFYING
PASS  execution alone is not recovery  VERIFYING
PASS  recovery verified by new observations
PASS  site serves 200 again
{
  "base": "https://kora-api.rumptycloud.app",
  "commit": "b29226c0835648a5f447be3021b50dddd16ce9c1",
  "at": "2026-10-31T08:41:02.205Z",
  "siteId": "a3e828f1-3fbc-4550-805e-a66b973cc55c",
  "incidentId": "c8b2531f-ae69-4e14-bc8f-6be4ef3cf714",
  "actionId": "4deed5ec-ba51-469f-bf0f-cb96fe8bef5a",
  "result": "RECOVERY_VERIFIED"
}
```
