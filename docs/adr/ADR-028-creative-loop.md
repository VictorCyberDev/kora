# ADR-028: Creative loop: campaigns, audit, taste, managed requests

Status: accepted. Milestones M13–M26.

- **Campaign briefs (M13).** A brief produces four structurally different creative directions (product, moment, people, place). A direction that needs facts Kora does not hold (a verified testimonial, verified premises, a product photo) is returned as _blocked_, and choosing it is refused (422). No store holds verified testimonials or premises yet, so people/place are always blocked today; that is deliberate, not a gap to paper over.
- **Ads are hypotheses (M12).** Any budget above zero is `NEEDS_APPROVAL` until a person approves a cap at least as large. Nothing in this branch spends money; there is no ad-platform integration.
- **Public audit (M22/M23).** `POST /api/public/audit` fetches one public page with an SSRF-hardened fetcher: http/https only, standard ports, no credentials, every redirect re-validated, connections pinned by a lookup that rejects private/loopback/link-local/CGNAT/ULA addresses, 1 MB and 8 s caps, HTML only, 5 requests per hour per IP. Results are stored without a tenant; a result is readable only through an HMAC-signed, 30-day token. Test builds may audit loopback; production may not.
- **Taste (M21).** Feedback is append-only and owner-authored. Kora claims a preference only after three judgements of the same trait.
- **Managed requests (M25).** A state machine (OPEN → IN_PROGRESS ⇄ NEEDS_OWNER → DELIVERED → ACCEPTED/CANCELLED) with an append-only event trail. Owner-side events need MEMBER; delivery-side events need ADMIN in the org. There is **no Kora-staff role** yet, so "managed by Kora staff" is not implemented; an org admin (or agency delegate) works the request.
- **Share secret.** Uses `KORA_SECRETS_KEY`. In production without it, a random per-process secret is used and share links die on restart; setting the key is an owner action.
- **Pure engines without persistence** (shipped, tested, not yet exposed): asset quality, storyboard, hand-off pack, performance report, pilot summary, context packets and cost gate.
