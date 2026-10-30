# ADR-020: Presence Graph, Presence Health and versioned Brand Kit

Status: accepted. Milestones M18–M20 of the Presence OS + Marketing Execution OS build.

## Context

Kora began as a reliability product for customer websites. The strategy
(`docs/research/MARKETING-EXECUTION-OS-2026.md`) extends it into a presence and
marketing system for African small businesses. Every later module (channels,
customers, content, campaigns, publishing, analytics) needs one factual model of
the business to read from, or each module will invent its own copy of the
business's name, phone number and hours and they will drift apart.

## Decision

1. **One factual profile per site** (`business_profiles`), written only by the
   owner or by an explicit import from the site's spec. Every write appends an
   immutable revision (`business_profile_revisions`) and uses optimistic
   concurrency (`expectedRevision`), so two people cannot silently overwrite each
   other and any fact can be traced to a change.
2. **The Presence Graph is derived, never stored.** `buildPresenceGraph` is a pure
   function over the profile, the live site, the domain, the brand kit, channel
   connections, proof, operations and demand. Data a source does not provide is
   shown as unavailable; nothing is defaulted to a flattering zero.
3. **Presence Health is a list of decomposable checks, not a score.** Each check
   carries what Kora observed, why it matters, the recommended fix, whether Kora
   can make the fix (`yes` / `with_approval` / `no`) and what authorization the
   owner must give. The headline is a sentence. A numeric score would hide the
   reasons and invite gaming, so none is computed or stored.
4. **Applying facts to the website creates a new draft version.** It never
   publishes. Publishing remains behind the existing publish route, plan
   entitlement and audit.
5. **Brand Kits are append-only versions** (`brand_kits`, update-blocked by a
   trigger). Generated and scheduled assets will reference a kit version, so
   editing the kit can never change something already published. Owner overrides
   that make text unreadable (contrast < 4.5) are rejected.
6. **Plan gating is a feature map, not scattered conditions.** `@kora/growth`
   defines `TIER_FEATURES`; the API resolves a plan to a tier in one place
   (`growth/entitlements.ts`) and calls `requireFeature`. A restricted
   subscription (expired or cancelled) blocks writes and keeps reads, matching
   the existing rule that an unpaid organization's sites stay online.
7. **Tenant integrity is enforced in the database.** Every new table that names a
   site carries `org_id` and a composite foreign key `(site_id, org_id)` to
   `sites(id, org_id)`.

## Consequences

- Later milestones add inputs to `PresenceInputs` (channels, demand) instead of
  new parallel models. Until a source exists its input is empty and the health
  output says so (`distribution.channels` is `UNKNOWN`, not `OK`).
- Pricing and tier names are hypotheses held in one map and the plan catalog;
  changing them touches no UI.
- The recovery invariant is untouched: presence checks read operations state but
  never write to it, and `run_health_check` semantics are unchanged.

## Not decided here

Channel providers, OAuth and token storage (M21), customer/lead model (M22) and
publishing (M27) have their own decisions.
