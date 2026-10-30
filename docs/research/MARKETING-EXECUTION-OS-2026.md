# Kora — Marketing Execution OS lock (October 2026)

## Executive decision

Kora should expand from an Africa-first **Trusted Presence OS** into a combined **Presence + Marketing Execution OS** for small businesses.

The product promise becomes:

> Put the business online, keep it trusted and reachable, then continuously turn its real business context into useful marketing actions and customer follow-up.

This is not a pivot away from the reliability kernel. The reliability kernel becomes the trust and execution substrate underneath marketing: connected channels, scheduled posts, customer contact paths, landing pages and campaigns should be observable, auditable and recoverable rather than treated as fire-and-forget actions.

Kora should **not** compete as a generic Canva clone, Buffer clone, CRM clone or chatbot. The differentiator is that Kora already owns the business's canonical facts, website, brand system, offers, customer enquiries, domains, operational state and eventually connected discovery/performance data. Marketing is generated from that source of truth.

## The category

The full company category is:

**Kora = the operating system for a small business's online presence and growth.**

Two tightly coupled layers:

1. **Presence OS** — identity, website, domain, Google presence, reachability, trust, customer contact paths, monitoring and recovery.
2. **Marketing Execution OS** — strategy, content, motion/video, publishing, campaigns, analytics, follow-up and a grounded marketing agent.

The user should not have to assemble a website builder + Canva + Buffer + WhatsApp tooling + a spreadsheet CRM + a marketing consultant just to maintain a credible online business.

## Why this is strategically stronger than adding random marketing features

Content creation and social scheduling are already mature categories. Adobe Express, Canva and Predis.ai already create social assets and publish across multiple channels. Predis.ai also offers AI posts, videos, scheduling, analytics and competitor intelligence.

Kora therefore cannot win on **"we can create a Reel and schedule it"** alone.

Kora's advantage is **business-context depth**:

- the current products/services and owner-approved prices from the business profile/site
- current contact channels and opening hours
- brand colours, typography, imagery and tone from SiteSpec / Brand Kit
- real website changes and newly published offers
- inbound enquiries and unanswered leads
- Google Business Profile state and performance where connected
- search/discovery data where connected
- previous campaign/post performance
- reviews and recurring customer questions
- operational failures that may be hurting acquisition

This lets Kora answer a harder question than a design tool:

> **What should this specific business do next, why, and can Kora execute it safely?**

## Core product model: the Business Growth Graph

Extend the existing Presence Graph into a **Business Growth Graph**. The canonical record should eventually connect:

- **identity** — business name, category, logo, description, tone, locations
- **offer** — services/products, owner-supplied pricing, promotions, availability
- **brand** — palette, typography, media, visual rules, voice
- **presence** — website, domain, Google Business Profile, social accounts
- **customers** — enquiries, consented contacts, segments, reviews, follow-up state
- **content** — posts, flyers, carousels, Reels/shorts, motion templates, campaigns
- **distribution** — Instagram, Facebook, TikTok, LinkedIn, Google posts, WhatsApp campaigns, email later
- **performance** — clicks, messages, calls, post metrics, website conversions, campaign results
- **operations** — reachability, failed publishes, broken links, token expiry, incidents, recovery evidence

Every marketing recommendation should be traceable back to data on this graph.

## Product modules to build

### 1. Channels

A single connection surface for the business's supported accounts.

Initial target order:

1. Instagram professional account
2. Facebook Page
3. Google Business Profile
4. WhatsApp Business Platform
5. TikTok
6. LinkedIn business page/member where relevant
7. Email provider integration
8. YouTube Shorts later

The UI should show connection health, permission state, token expiry/reauthorisation need, last successful publish and channel-specific limitations.

Do not imply every platform supports the same action.

### 2. Brand Studio

Brand Studio is **not** a general-purpose freeform editor.

It should generate ready-to-use business assets from the canonical Kora brand system:

- Instagram square/portrait posts
- Instagram Stories
- WhatsApp Status-sized exports for manual sharing where API publishing is unavailable
- promo flyers
- offer cards
- testimonial/review cards
- service/product cards
- carousels
- Google Business Profile graphics
- LinkedIn graphics
- basic ad creatives

The owner can edit text, media, CTA, offer and layout choices, but Kora preserves brand consistency automatically.

### 3. Motion Studio

Kora should create deterministic, branded motion content rather than depending entirely on expensive generative-video APIs.

Use reusable motion compositions driven by business data:

- animated offer/reveal
- before/after
- service spotlight
- product/service list
- review/testimonial animation
- opening-hours/location card
- countdown/promotion
- new-launch announcement
- FAQ explainer
- simple kinetic-typography Reel/Short
- image montage with captions, transitions and optional voice-over

A template-driven renderer (for example, Remotion/FFmpeg-style server-side rendering) gives Kora predictable cost, brand consistency and export quality. Generative video can be an optional premium provider later, not the base architecture.

### 4. Content Studio

The owner can start from:

- a business goal: "get more bookings this weekend"
- a new offer: "20% off braids Friday to Sunday"
- a website/service update
- a customer question/review
- a product/service from the business profile
- a prompt or voice note
- an existing image/video upload

Kora produces the campaign bundle, not one isolated asset:

- recommended angle/hook
- platform-specific caption
- flyer/static creative
- carousel where useful
- short motion/video variation
- CTA and destination/deep link
- suggested posting time
- WhatsApp campaign copy where policy permits
- optional Google Business Profile post

### 5. Marketing Agent

This is a **Plus feature** and one of Kora's primary paid differentiators.

The agent should operate as a grounded strategist + executor.

It should continuously answer:

- What is working?
- What is underperforming?
- What changed?
- What customer demand signals are appearing?
- What content should we create next?
- Which channel should receive it?
- Which enquiries need follow-up?
- Which business detail is hurting discovery or conversion?
- What is the single highest-impact next action?

Example:

> Your Saturday bookings are strongest when you post service transformations on Thursday evening. Your current weekend offer exists on Instagram but not on your website or Google profile. Kora recommends one 12-second Reel, one Story reminder and one Google offer post, all pointing to the same WhatsApp booking link.

Then the user can choose **Create campaign**.

### 6. Growth Brief

Do not force owners to chat with the agent.

Provide a short proactive brief daily/weekly:

- what happened
- what needs attention
- what opportunity Kora found
- why it matters
- one-click action

The default should be **3–5 high-confidence actions**, not a wall of generic marketing advice.

### 7. Content Calendar + publishing

One calendar for drafts, approvals, scheduled items, published items and failures.

Kora should adapt the same campaign to each platform rather than blindly cross-posting identical media/copy.

Publishing support should reflect platform capabilities:

- **Instagram:** professional accounts can publish supported media through Meta APIs after permissions/app review.
- **Facebook:** Page publishing through Meta APIs after required permissions.
- **TikTok:** direct posting is technically available, but production visibility requires TikTok app approval/audit and explicit user authorisation.
- **LinkedIn:** organic posts can be created with the relevant member/organisation permissions.
- **Google Business Profile:** local posts can be created/managed through the Business Profile APIs, including offer/event/CTA posts.
- **WhatsApp:** treat as conversations and consented marketing campaigns using Business Platform rules/templates. Do **not** promise generic automated WhatsApp Status publishing unless Meta exposes and approves an appropriate API surface.

### 8. Unified Customer Hub

The marketing system becomes much more valuable if it closes the loop from content to conversation.

Bring supported inbound activity into one lightweight customer surface:

- Kora site enquiries
- WhatsApp conversations where connected/authorised
- Instagram business messaging where permitted
- contact form submissions
- Google reviews and review replies
- email later

Core states:

- new
- replied
- follow-up due
- won/booked
- lost/not relevant

This is not a full Salesforce replacement. It is enough customer memory to make marketing recommendations and follow-up useful.

### 9. Reputation

Reviews are a growth input and trust input.

Kora should eventually support:

- Google review monitoring
- review-reply suggestions
- owner approval before replies
- review-request links/QR cards
- positive review → branded testimonial asset
- recurring complaint → marketing/operations insight

### 10. Campaign measurement and attribution

Kora should know whether marketing created business outcomes, not just impressions.

Use factual attribution where possible:

- tagged links/deep links
- website CTA clicks
- WhatsApp/call clicks
- form submissions
- Google Business Profile interactions
- platform post metrics
- campaign/message delivery/read data where available
- conversion events explicitly supplied by the owner or integrations

Avoid pretending to know revenue when Kora does not have payment/order evidence.

### 11. Competitor/market intelligence — later Plus/Pro

Use only public, compliant data sources.

Possible outputs:

- recurring content themes in the business's category
- underused local content angles
- promotion timing patterns
- gaps in competitors' public business information
- review themes customers repeatedly mention

The output should inspire strategy, not scrape private data or clone competitors' creative.

### 12. Africa-native interaction layer

Kora should feel designed around how small African businesses actually work.

High-value differentiators:

- voice-note command: "Kora, make something for the weekend promo and post it tomorrow evening"
- English-first with Pidgin and major local-language support added deliberately
- low-bandwidth previews and compressed exports
- mobile-first creation/approval
- WhatsApp-centric customer flows
- one-tap call/WhatsApp CTAs
- offline-safe draft state / explicit retry on weak networks
- clear naira pricing and local calendar context

Voice is especially promising because SMB owners are mobile-first and time-constrained; a conversational/voice interface can reduce the learning cost of analytics and marketing tools.

## Agent authority model

Kora's marketing agent must inherit the product's existing approval philosophy.

### Safe autonomy levels

**Level 0 — Suggest only**
- recommendations
- draft copy/assets
- no external actions

**Level 1 — Prepare**
- build campaign bundle
- choose proposed schedule
- wait for approval

**Level 2 — Organic autopilot**
- user explicitly authorises selected channels, content categories and schedule rules
- Kora may publish within those boundaries
- every action is logged and reversible where the platform allows

**Level 3 — Customer messaging automation**
- only with explicit consent/compliance rules
- approved templates and segmentation
- frequency caps and unsubscribe/opt-out handling

**Paid media:** do not let the agent autonomously spend ad budget in the first commercial version. Kora may create the ad plan/creative/audience recommendation and later prepare a draft campaign, but budget activation remains owner-approved until there is enough product maturity and control evidence.

## Reliability becomes a marketing differentiator

This is where Kora can be structurally different from ordinary schedulers.

Kora should monitor:

- social account connection health
- expiring/revoked tokens
- failed scheduled posts
- broken destination links
- failed landing pages/forms
- WhatsApp CTA reachability
- domain/SSL state
- incorrect business hours across connected surfaces
- campaign delivery failures
- duplicate/inconsistent offers across channels

A failed post should become an observable incident, not disappear into a scheduler log.

## Information architecture lock

Target navigation:

1. **Home** — status, next actions, business summary
2. **Presence** — site, domain, business profile, Google, connected surfaces
3. **Customers** — messages, leads, reviews, follow-up
4. **Marketing** — agent, Studio, campaigns, calendar, analytics
5. **Health** — reachability, incidents, recovery, audit
6. **More** — billing, team, integrations, settings

On mobile, Marketing should open to **Today**: current recommendation, scheduled content, drafts needing approval and recent results.

## Pricing lock for testing

Keep exact price experimental until customer interviews, but align feature boundaries to outcomes.

| Plan | Test price | Core outcome |
| --- | ---: | --- |
| Trial | Free | experience a real Kora site and basic presence monitoring |
| Launch | ~₦4,900/mo or ~₦49k/yr | website, Kora address, basic brand kit, inbox, reachability |
| **Plus** | **~₦12,900–₦14,900/mo or ~₦129k–₦149k/yr** | custom domain, Presence Health, connected channels, Marketing Agent, Brand/Motion Studio, content calendar, publishing, Growth Brief, lightweight customer follow-up |
| Pro | ~₦29,900/mo or ~₦299k/yr | teams/multi-location, advanced automation, reputation, competitor intelligence, higher media generation/retention, approval policies and priority recovery |
| Done-for-you | ₦25k–₦75k setup test | Kora configures the starting presence, brand and channels for the owner |

Do not expose confusing token/AI-credit accounting as the main pricing story. Use fair-use limits internally for expensive rendering/generation and show the customer practical limits such as included video renders, connected brands or storage only when needed.

## What is Plus vs core

### Core/Launch

- website + Kora subdomain
- basic business profile
- essential contact/inbox
- basic Brand Kit
- basic Presence Health
- simple static asset generation samples

### Plus

- custom domain / richer presence controls
- social/Google channel connections
- Marketing Agent
- weekly/daily Growth Brief
- Content Studio
- Brand Studio
- Motion Studio / short branded video
- campaign bundles
- content calendar
- scheduling/publishing
- basic cross-channel analytics
- customer follow-up reminders
- review-reply drafts

### Pro

- multiple locations/brands
- team roles + approval workflows
- more advanced autopilot rules
- reputation workflows
- deeper competitor/category intelligence
- advanced segmentation
- higher render/generation allowances
- priority recovery/support

## Final build order

### P0 — current judge/submission product

Already prioritised separately: polished Kora Presence v3, business-first dashboard, generated-site quality, proven recovery flow and truthful evidence. Do not destabilise the accepted build by rushing half-connected social integrations into the hackathon demo.

### P1 — commercial foundation

1. canonical Business Profile / Presence Graph
2. Presence Health
3. Brand Kit as reusable business identity
4. Channels connection model + token/permission health
5. Google Business Profile integration
6. Customer Hub for Kora enquiries/follow-up
7. Content Studio static campaign bundles
8. Growth Brief

### P2 — Plus marketing product

1. Instagram/Facebook publishing
2. Marketing Agent
3. content calendar + approvals
4. Motion Studio template renderer
5. analytics/attribution loop
6. WhatsApp Business Platform campaigns/conversations
7. review monitoring/reply workflow
8. TikTok publishing after developer approval/audit
9. LinkedIn where customer segment justifies it

### P3 — expansion after customer evidence

- email campaign provider
- YouTube Shorts
- voice-note business commands
- category/competitor intelligence
- campaign experiments and creative variants
- Meta/Google paid-ad draft creation
- richer customer segmentation/journeys
- optional provider-backed generative video

## Explicitly do not build yet

- full POS
- inventory engine
- delivery/escrow network
- accounting suite
- general-purpose Canva-style freeform editor
- generic Buffer clone disconnected from Kora data
- generic chatbot that only writes captions
- autonomous paid-ad spending
- unsupported WhatsApp Status autopublishing claims
- fake engagement/revenue attribution
- vanity AI/SEO scores that cannot explain their inputs
- mass cold-message spam automation

These either have strong incumbents, create policy/regulatory risk or dilute Kora's wedge before product-market evidence exists.

## The final strategic sentence

**Kora should not merely help an African business make a website or make social posts. Kora should know the business, keep its public presence correct and reachable, decide the next useful growth action from real evidence, create the branded work, execute it across authorised channels, follow the resulting customers and prove what happened.**

That is the locked company direction.