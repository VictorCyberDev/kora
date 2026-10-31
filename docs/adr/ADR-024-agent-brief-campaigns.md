# ADR-024: Marketing Agent, Growth Brief and Campaign Bundles

Status: accepted. Milestones M28–M30.

## Decisions

1. **The agent is a rule engine over measured facts** (`recommend`), not a free-form model. Each recommendation carries an
   observation, the evidence read (with its source), a _hypothesis_ (never a promise), the action, objective, confidence,
   whether Kora can do it itself, whether approval is needed, and the policy decision. A test asserts no output mentions
   revenue, guarantees or invented numbers. A model may later _phrase_ suggestions; the rules and evidence stay.
2. **Authority is enforced, not described.** Accepting a suggestion executes only what policy marks `AUTO_SAFE`
   (create a draft, create a Brand Kit). `APPROVAL_REQUIRED` and `DENY` actions are only pointed at: replying to
   customers, review replies, bulk messages and ad spend have no execution path. Executions are audited with the policy
   decision and evidence count.
3. **Reliability is part of marketing.** An open website incident produces a "hold promotion" suggestion and a warning on
   every post (ADR-023). This is the product's differentiator.
4. **Reconciliation, not accumulation.** Recommendations are keyed by rule + subject; refresh updates the open one, resolves
   those that no longer apply, and keeps a dismissed one quiet for 7 days. Evidence is stored as rows
   (`recommendation_evidence`) so it can be inspected and audited.
5. **Growth Brief reports only measured numbers** (enquiries this week vs last, waiting, posts that actually published,
   website checks and incidents, open presence issues). Reach, engagement, visitors and revenue are listed under
   "unavailable" with the reason, and the brief never says a post caused a result. Saved briefs are immutable snapshots.
6. **Campaign bundles** turn one _current_ offer into posts per channel across the campaign dates: launch, reminder,
   last chance (max three per channel, none in the past, 60-day cap). Images come from the Brand Kit; captions come from
   the fact-bound writer and are validated. Everything is created as `APPROVAL_NEEDED`; nothing is queued. "Approve all"
   is one explicit ADMIN decision that still records a content-hash approval per post and then schedules only posts the
   engine can actually publish; the rest (WhatsApp, unconnected channels) are reported as needing the owner.
7. **WhatsApp in a bundle is a ready-made promo image and message for the owner to send to customers who have opted in.**
   There is no bulk sending.
8. Trial includes every feature so an owner can judge the whole product; paid tiers narrow it (`tiers.ts`).

## Limits

- No social analytics yet, so the agent cannot judge what worked; it only reasons about what exists (M32).
- Recommendation rules are intentionally few and conservative.
