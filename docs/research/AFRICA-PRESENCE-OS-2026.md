# Kora — Africa-first Trusted Presence OS thesis (October 2026)

This document joins the existing Kora reliability architecture with current Nigerian/African merchant behaviour, the competitive landscape, the Devcenter/Rumpty judging context, and the product/design decisions for the next phase.

## Executive decision

Kora should **not** become another inventory/POS product, another generic AI website builder, or another WhatsApp chatbot.

The strongest wedge is a **Trusted Presence OS for small businesses**:

> Put the business online, make it easy to find and contact, keep every public touchpoint accurate and reachable, turn inbound attention into leads, and tell the owner the next useful action.

The website is the owned home. Google, WhatsApp and social profiles are distribution surfaces. Kora is the control plane. The existing reliability kernel is the moat: evidence, immutable versions, typed changes, approval boundaries, verified recovery and audit are unusually strong foundations for a small-business product.

## What the market says

### Nigerian businesses are social-first, not website-first

PwC's 2024 MSME survey reported WhatsApp Business as the most-used listed technology (23%), followed by Facebook (19%) and Instagram (15%); online stores were only 7%. FATE Foundation's 2024 State of Entrepreneurship report found 87.7% of youth-led businesses using social media/digital marketing, and 74.7% of those businesses said technology increased referrals/new customers.

This means Kora must meet merchants where they already work. A website alone is not the operating system. It is the durable, searchable source of truth that should connect to the channels where demand already happens.

### Mobile is the primary work surface, but connectivity is uneven

GSMA's 2025 Nigeria data shows 95% urban mobile ownership, 73% internet-enabled handset ownership and 61% mobile-internet adoption; rural figures were 90%, 39% and 28%. This is not merely a responsive-design requirement. It means Kora should be useful on a phone, economical with data, tolerant of weak connections and explicit about retry/offline states.

Paystack reached the same product conclusion from merchant research in 2026: its rebuilt Dashboard committed to full mobile parity rather than a reduced mobile experience.

### Discovery is fragmented

Nigerian entrepreneurs already use social channels for discovery, while Google Search/Maps remain important for local intent. Google Business Profile performance exposes searches, views and interactions; Google local ranking is driven mainly by relevance, distance and prominence. LocalBusiness structured data can expose hours and other business facts to Search.

The opportunity is therefore not "SEO as a service". It is a canonical business profile that keeps name, category, location, hours, services and contact paths consistent across the website and connected discovery surfaces.

### Trust is a product problem

Social commerce is already normal across the region, but fraud and scam exposure are material. Visa's 2026 CEMEA research frames trust, control and confidence as core issues as commerce becomes more digital and AI-assisted. Nigeria-specific Visa research has also documented high scam exposure over time.

Kora should not create a vague "verified seller" badge. Any trust claim must be tied to concrete evidence: domain control, HTTPS, reachable contact channels, consistent business information, payment-provider identity where available, uptime and other checks Kora can actually prove.

## Competitive reality

The market is not empty.

### Bumpa

Bumpa already owns a strong Nigerian seller-operations position: website, inventory, orders, invoices, customers, POS, shipping and analytics. Starter is currently listed at ₦15,000 quarterly (₦5,000 monthly equivalent), Pro at ₦30,000 quarterly (₦10,000 monthly equivalent), with higher tiers for growing teams.

**Decision:** do not rebuild inventory, POS and multichannel order management from scratch. Integrate/import later if customer evidence supports it.

### Mola

Mola is an especially important competitor because it is already pursuing a broad "business partner" vision. Its current plans include WhatsApp/Instagram AI replies, storefront, escrow, delivery, bookings, Google Business Profile monitoring, Search Console/SEO, CRM, win-back campaigns, custom domains and AI-search visibility. Its published annual pricing starts at ₦250,000/year.

**Decision:** "website + graphics + AI marketing + WhatsApp" is not differentiated enough. Kora must lead with a different promise: **the trusted, owned and continuously operated business presence**.

### Paystack Storefront / Flowcart and other store builders

Paystack Storefront can be created without a recurring subscription, while the Paystack/Flowcart integration brings end-to-end commerce into WhatsApp. Nigerian builders also compete aggressively around low-cost storefronts.

**Decision:** a cheap storefront is a commodity. Kora has to make the business more discoverable, trustworthy, consistent and resilient after launch.

## Product wedge: the Kora Presence Graph

Kora already has a system graph for technical operations. Extend the idea to a business presence graph.

The canonical business record should eventually include:

- identity: name, logo, description, categories, location, service area
- contact: phone, WhatsApp, email, booking/order paths
- availability: opening hours, closures, response expectations
- offer: products/services, price ranges where the owner supplies them
- proof: domain, HTTPS, reachable channels, payment identity integrations, reviews/testimonials with provenance
- distribution: website, Google Business Profile, social profiles, directories
- demand: search queries, website interactions, messages, calls/clicks where integrations provide them
- operations: uptime, incidents, changes, recovery and audit

The owner edits the fact once. Kora renders or synchronises it everywhere it is allowed to.

## The five product pillars

### 1. Presence

Website, domain, brand kit, canonical business facts, structured data, connected Google Business Profile and social/contact links.

### 2. Reachability

Kora continuously checks whether customers can actually reach the business: website, domain/SSL, primary CTA, form path, WhatsApp link and connected public profiles. The output is plain language, not an engineering dashboard.

### 3. Trust

Evidence-backed trust signals: domain ownership, HTTPS, information consistency, healthy/reachable customer paths, payment/KYC integrations where supported, review freshness and change history. Never imply fraud safety without evidence.

### 4. Growth

Grounded recommendations using actual business data. The model may explain; deterministic code computes the facts. Examples: a Google profile is incomplete, a high-intent page has no WhatsApp CTA, messages are arriving but not being followed up, a business-hour mismatch exists, or an important page disappeared from search indexing.

### 5. Brand studio

Generate practical marketing assets from the same design DNA as the website: WhatsApp Status art, Instagram post/story sizes, simple promo flyers, offer cards and captions. The key is **brand consistency**, not becoming a general-purpose Canva clone.

## The hidden need: Presence Health

Owners do not wake up wanting "digital infrastructure". They want to know whether people can find them, trust them and contact them.

A Kora Presence Health view can translate dozens of checks into concrete tasks. It should never be a mysterious vanity score. Every state must be decomposable into factual checks, for example:

- website reachable
- domain/HTTPS valid
- mobile layout passes Kora checks
- contact form succeeds
- WhatsApp/call link valid
- business details consistent between Kora site and connected Google profile
- Google profile has required basics
- search indexing present
- recent inbound message not ignored
- public business hours current

The UI should say **"2 things are costing you discoverability"**, then show the two things.

## Growth intelligence, not an AI chatbot

Paystack's 2026 Dashboard is a strong benchmark: its AI is grounded in merchant data and embedded in context rather than launched as a separate branded assistant. Kora should follow the same principle.

Kora should answer questions such as:

- "Can customers reach me right now?"
- "What needs my attention today?"
- "How are people finding me?"
- "Which messages have I not followed up?"
- "What changed this week?"
- "What is the highest-impact thing I can improve next?"

The business owner should not need to learn "prompting".

## Design thesis: Calm confidence, not SaaS decoration

The desired emotional outcome is **calm confidence**. Kora should feel like a capable operator beside the owner, not an engineering console and not an AI toy.

### Principles adopted from current best practice

**Apple:** simplicity is clarity, not feature removal; strong hierarchy, agency, recovery, responsibility and craft build trust.

**Linear:** navigation should recede after it has oriented the user; structure should be felt rather than drawn with borders everywhere.

**Paystack Canvas:** structure navigation around merchant mental models, use a real design system, preserve full mobile functionality, and make intelligence contextual and data-grounded.

**ustwo / Klir:** small-business software should feel closer to a consumer product than accounting software — friendly language, clear tasks, low cognitive load.

**COLLINS / Clay:** memorable brands use a coherent high-signal visual language across marketing and product, not isolated decorative assets.

## Kora Presence visual system v3

### Colour ownership

The old Kora brand used green as both brand and healthy state. That weakens semantics and makes the product visually generic.

V3 separates the two:

- **Kora Ink** — `#171319`: primary chrome, depth, authority
- **Kora Ember** — `#F15B43`: the brand action/signature colour
- **Warm Canvas** — `#F2EDE4`: main light workspace
- **Paper** — `#FFFAF2`: raised content
- **Lilac fog** — `#E6DFF0`: optional supporting atmosphere
- **Health green** — reserved only for healthy/recovered status
- amber — warning/approval
- red — failure/destructive
- blue — information/verification

Ember should be a signal, not wallpaper. The product becomes memorable through contrast between deep Ink, warm Canvas and small decisive Ember moments.

### Typography

Use Manrope/system sans for the product interface. Reserve DM Serif Display for selected public/brand moments. A control plane should scan quickly; editorial type should not appear on every dashboard card.

### Motif

The existing LevelLine is worth keeping. Evolve it into the **Kora Signal**: one continuous line language reused as health state, section transition, small chart treatment and motion cue. One owned motif is stronger than a collection of generic gradients, blobs and sparkle icons.

### Surfaces

Reduce card count. Prefer open sections, grouped content and two elevation levels. Every border must explain structure. Main content receives visual priority; navigation recedes.

### Motion

Motion communicates status and continuity: publish → watching, failure dip, approval → checking, recovery return. Respect `prefers-reduced-motion`. No gratuitous floating objects or AI sparkle animations.

## Information architecture

The current top-level architecture reflects Kora's feature history. The target merchant mental model is:

1. **Home** — can customers reach me, what needs me, what should I do next?
2. **Presence** — website, domain, Google, business profile, brand kit
3. **Customers** — messages/leads, reviews, follow-up
4. **Grow** — discovery, content, campaigns and grounded recommendations
5. **Health / More** — incidents, recovery proof, billing, audit, settings

For the current hackathon build, do not fake future modules. Group existing functionality more clearly first, then expose modules only when they are real.

## Mobile contract

Mobile is a first-class product, not a compressed desktop.

- full feature parity for core workflows
- 44–48px tap targets
- primary status/action before secondary detail
- progressive disclosure for technical evidence
- low image weight and no required decorative video
- explicit loading/retry states
- no essential interaction that requires hover
- test at 320/360/390/412/600/768 widths plus weak-network scenarios

## Pricing hypothesis

Do not optimise price before customer interviews, but position Kora between commodity storefronts and expensive managed growth products.

Suggested test bands:

| Plan               |                    Hypothesis | Core outcome                                                                                         |
| ------------------ | ----------------------------: | ---------------------------------------------------------------------------------------------------- |
| Trial              |                          Free | Launch a real Kora site and experience monitoring                                                    |
| Launch             |   ~₦4,900/month or ~₦49k/year | owned website, Kora address, inbox, basic brand kit, reachability monitoring                         |
| Grow               | ~₦12,900/month or ~₦129k/year | custom domain, Google connection, Presence Health, growth brief, more brand assets, managed recovery |
| Pro                | ~₦29,900/month or ~₦299k/year | team/multi-presence, advanced discovery/analytics, more automation and priority recovery             |
| Done-for-you setup |       one-time ₦25k–₦75k test | Kora sets up the owner's complete starting presence                                                  |

Avoid pricing the core experience around abstract "AI credits". Owners buy outcomes. Meter expensive generation behind the scenes if needed.

## What to build next

### P0 — hackathon/judge quality

- ship visual system v3 and business-first dashboard
- clean information hierarchy across Mission Control
- keep generated customer sites at the same visual quality bar
- preserve responsive/accessibility/browser QA
- remove stale repository language
- record the final demo on the exact commit being judged
- make the first 60 seconds of the demo business-first, then reveal technical proof

### P1 — first commercial wedge

- canonical Business Profile
- Brand Kit derived from SiteSpec design DNA
- lightweight Campaign Creator for WhatsApp/Instagram assets
- Presence Health factual checks
- Google Business Profile connection/monitoring
- Search Console connection
- WhatsApp/call/deep-link tracking
- customer inbox + follow-up states
- weekly grounded Growth Brief

### P2 — expansion

- social publishing/analytics integrations
- review request/reputation workflows
- lightweight customer memory/CRM
- bookings and payment integrations
- import/integrate inventory rather than rebuilding it

### Do not build yet

- full POS
- inventory engine
- escrow/delivery network
- general-purpose design editor
- autonomous ad spending
- unverifiable "AI SEO" scores
- generic social chatbot disconnected from business truth

These areas either have strong incumbents or create operational/regulatory complexity before Kora has proven its wedge.

## Existing Kora items still pending

The live reliability proof is complete. Remaining gaps should be separated into hackathon-critical vs commercial follow-up:

- production model-backed generation: code path exists, Rumpty inference endpoint/key/model still need console configuration
- live Paystack: contract implemented/tested; real credentialled run still pending
- registrar-backed domain purchase: scaffold exists; provider configuration/credentials pending
- email delivery: not implemented
- customer media uploads/local image generation/WebLLM: post-submission work
- provider VM restart/redeploy/deployment rollback: not currently Kora typed actions
- real-owner usability study and field performance data: still needed before claiming product-market fit

## Judge strategy

Devcenter says the final projects will be judged on technical execution, innovation and real-world value. Preliminary judges also include engineers with strong product, design-system and production-software backgrounds.

The demo should therefore run in this order:

**owner problem → beautiful simple business experience → live site → real controlled failure → Kora notices → plain-language explanation → approval boundary → recovery → proof.**

Do not lead with architecture diagrams. Let the architecture explain why the magical-looking owner experience can be trusted.

## Research sources consulted

Research snapshot includes: Devcenter/Rumpty Hacktober 2026 announcements; Paystack's 2026 Dashboard rebuild and mobile guidance; Apple 2026 Human Interface Guidelines; Linear's 2026 interface refresh; PwC Nigeria MSME Survey 2024; FATE Foundation State of Entrepreneurship in Nigeria 2024 and Access to Markets report; GSMA State of Mobile Internet Connectivity 2025; Google Business Profile/Search documentation; Visa trust/fraud research; current Bumpa and Mola pricing/product pages; Paystack Storefront and Flowcart; and design-system/brand case studies from COLLINS, Clay and ustwo.
