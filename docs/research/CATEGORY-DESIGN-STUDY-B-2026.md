# Category Design Study B (2026)

Studied on 2026-11-07. Categories: creative agency, software consultancy / creative technology studio, photographer, home repair, medical practice, education centre / tutoring, real estate agency.

Machine-readable twin: `docs/research/data/category-design-principles-B.json` (rules with support counts per category, plus must-not-claim lists).

## Method and honest limits

- Sites were chosen from well-known brands and search roundups (vendor and agency blog lists; no single authoritative ranking exists), then each homepage was read with WebFetch on 2026-11-07. WebFetch returns a text summary of the page, so it shows section order, nav labels, links, and copy, but mostly not typefaces, colour, type scale, sticky headers or true mobile layout. Those are recorded as "not determinable" and never guessed.
- Support counts ("2 of 3") count only sites actually read for that category. Rules tagged "derived" are honest-design principles for the generator that no site demonstrated; they are labelled as such.
- Principles only. No copy, layouts or assets are reproduced.
- Search results were used only for discovery and for regulatory pointers (UK ASA/CAP, UK Trading Standards/Property Ombudsman). Those pointers are secondary summaries; owners must check rules in their own market.
- A bias to note: most home-repair, education and real-estate sites that could be read are national franchises or marketplaces, which are denser and more conversion-engineered than a typical independent local business. Medical evidence is the thinnest.

## Evidence strength

| Category                    | Sites read OK                                                                        | Unreadable                                                                 | Strength                            |
| --------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | ----------------------------------- |
| Creative agency             | Pentagram, Instrument                                                                | none tried beyond these                                                    | Medium (2 sites, no typography)     |
| Consultancy / creative tech | ustwo, thoughtbot                                                                    | none                                                                       | Medium-strong (2 sites, consistent) |
| Photographer                | Steve McCurry, Brandon Woelfel, Peter McKinnon (all text-only, images not described) | Chris Burkard (JS-only), Jose Villa (503), Annie Leibovitz (domain parked) | Weak-medium                         |
| Home repair                 | Benjamin Franklin Plumbing, Mr. Electric, Mr. Handyman (nav only)                    | none                                                                       | Medium (all franchises)             |
| Medical                     | Nuffield Health, Parsley Health (partial)                                            | One Medical (403), Mayo Clinic (403), drmcminn.com (parked)                | Weak                                |
| Education                   | Varsity Tutors, Sylvan Learning, Tutorful                                            | MyTutor (empty), Kumon (403), Mathnasium (403)                             | Medium-strong                       |
| Real estate                 | Winkworth, Compass, Knight Frank                                                     | The Agency (JS-only), Hamptons (403)                                       | Medium                              |

tend.com was fetched by mistake (it is farm software) and is not used.

---

## 1. Creative agency

Sites read: pentagram.com, instrument.com (both 2026-11-07).

**Homepage hierarchy.** Pentagram: nav, a featured-project showcase of about 11 large images, a tagline with discipline and sector filters, alternating project grids and editorial retrospectives, footer. Instrument: award banner, nav, one-line positioning, work filter tabs, client roster, services intro, work carousel, awards row, purpose statement, news cards, contact block.

**Navigation.** Pentagram 4 items (Work, About, News, Contact) plus search and archive. Instrument 6 top-level (Work, Services with 3 children, About, Careers, Latest, Contact). Sticky: not determinable.

**Customer intent.** A prospective client or collaborator judging taste and fit; a recruiter or journalist.

**Imagery.** Project photography and renders (architecture, installations, packaging, screens), large, with a title and one line. Instrument work items had empty alt text; subjects were only inferable from filenames.

**Typography.** Not determinable from either fetch.

**Density.** Pentagram very high card count but almost no prose; Instrument sparse with generous spacing.

**Personality.** Confident, editorial, understated; the work speaks.

**Page architecture.** Work (filterable), About, News/Latest, Contact, Careers, newsletter, press.

**Trust cues.** Named clients and projects, founding date and size claim (Pentagram); client names, award badges, press (Instrument). Honest substitutes if none exist: labelled self-initiated or concept work, founders named and photographed, process description. No fabricated logos or awards.

**Conversion.** Contact in nav; "Start a Project" and press/careers routes; newsletter as soft path. No forms seen on the homepage.

**Mobile.** Instrument has a mobile menu repeating the nav; layout otherwise not observable.

**Rules (10).** See JSON; summary: open with work not about-copy (2/2); 4-6 nav items (2/2); own project imagery (2/2); filterable work index (2/2); sparse copy (2/2); named-client trust placed high (2/2); persistent contact route (2/2); news layer (2/2); honest no-clients fallback (derived); typography/mobile defaults (derived, unverified).

## 2. Software consultancy / creative technology studio

Sites read: ustwo.com, thoughtbot.com (2026-11-07).

**Hierarchy.** ustwo: nav, outcome headline with abstract graphic, what-we-do, case-study/news cards, client names, a satisfaction score, one testimonial, four capability blocks, responsibility banner (B Corp, employee-owned), certification badges in the footer. thoughtbot: nav, experience-led headline with single CTA and team headshots, featured case study with testimonial, stage-based services, 24-logo wall, product promos, AI highlight, case-study cards, company blurb, six resource cards, closing CTA, footer with phone numbers.

**Navigation.** 6 items each (ustwo: Services, Work, AI, Insights, Our story, Contact us; thoughtbot: Services, Industries, Case Studies, Resources, Blog, Let's Talk). Sticky not determinable.

**Intent.** A product or engineering lead evaluating a delivery partner and de-risking the choice.

**Imagery.** ustwo abstract geometric SVG, no people photography; thoughtbot team headshots plus line illustrations (maze, compass).

**Typography.** Large display headline, small sparse body (ustwo "bold sans feel"); faces not determinable.

**Density.** ustwo airy; thoughtbot moderate to high in the lower half.

**Personality.** Senior, calm, craft-led; ustwo more playful and values-driven, thoughtbot more pragmatic.

**Architecture.** Services, Work/Case studies, Industries, AI, Insights/Resources/Blog, About, Contact, Careers, Responsibility.

**Trust cues.** Client logos, quantified facts (20 years, 9.6/10, 1,000+ outcomes), named testimonial, case studies, certifications. For a studio with none of these: team, working method, own or open-source work, written insights; no invented numbers.

**Conversion.** One consistent contact path ("Let's talk" or "Contact us"), repeated; phone numbers in the footer (thoughtbot); no inline form seen.

**Mobile.** Single-column stacks; ustwo adds a bottom-corner contact button. Otherwise not observable.

**Rules (10).** Outcome headline (2/2); 5-6 nav items (2/2); one CTA path (2/2); trust order logos, facts, testimonial, case studies (2/2); case-study cards (2/2); 3-4 capability blocks (2/2); graphics over stock (2/2); resources section (2/2); credentials only if held (1/2); honest fallback (derived).

## 3. Photographer

Sites read: stevemccurry.com, brandonwoelfel.com, petermckinnon.com (2026-11-07). Not readable: chrisburkard.com (JS-rendered, only utility links returned), josevillaphoto.com (503), annieleibovitz.com (parked).

**Hierarchy.** McCurry: nav, fine-art-prints teaser, three news cards, footer. Woelfel: nav and social, then one gallery of about 48 images, social row. McKinnon: nav and tagline, newsletter, social, email, empty Hours heading.

**Navigation.** McCurry 3 primary items with dropdowns (8 themes under Selected Works; Shop). Woelfel 6 items (Work, About, Photobooks, Presets, Gear, Prints) plus Contact as mailto. McKinnon 7 (People, Places, Things, Clients, About, Connect, Shop) plus a second row. Mobile toggle "Open Menu" on two. Sticky not determinable.

**Intent.** Admire and recognise the style; buy prints or products; for commission photographers, check fit and ask about availability. None of the sites read demonstrated a commission-enquiry flow.

**Imagery.** Image-first with minimal text. Alt text was empty, so subject matter is not reported. Typography not determinable.

**Density.** Very low.

**Personality.** Quiet, gallery-like; the images carry the brand.

**Architecture.** Work by theme or genre, About, Shop/Workshops, News, Contact.

**Trust cues.** None of the three used testimonials or logo walls on the homepage; cues were dated news, a bookshop event, and social profiles. Honest substitutes: the work, publications or exhibitions the owner supplies, a short artist statement.

**Conversion.** Email link or footer Contact; shop and workshop links. Vendor guidance in the search results (secondary) says commission photographers also need Portfolio, About, Contact and an enquiry form, with a curated 15-25 images per category and the location stated.

**Mobile.** Menu toggle only; gallery layout not observable.

**Lesson.** McKinnon's page showed a builder error message in the newsletter block and an empty "Hours" heading: omit any section that has no content.

**Rules (10).** See JSON; image-first hero (2/3); small genre-based nav (2/3); minimal text (3/3); very low density (3/3); simple enquiry path (3/3); shop only if the owner sells (3/3); no fake testimonials (3/3 absent); mobile toggle (2/3); no empty sections (1/3); commission-photographer enquiry form (derived from vendor sources).

## 4. Home repair (plumbing / electrical / handyman)

Sites read: benjaminfranklinplumbing.com, mrelectric.com, mrhandyman.com (partial: header and menus only) (2026-11-07). All three are national franchise sites.

**Hierarchy.** BFP: location link and 24/7 phone, nav, hero with ZIP field and rating badge, guarantees intro, 10 service tiles, emergency block, review excerpts, local-support block, tips articles, footer with pledges and licence note. Mr. Electric: click-to-call and online booking top bar, nav, hero photo with booking-first CTA, booking form, four service cards, offers, ZIP finder, why-us bullets, FAQ, blog/tips, recruiting, footer.

**Navigation.** 6 (BFP), 6 (Mr. Electric), 4 (Mr. Handyman). Services in a dropdown. Sticky not confirmed; BFP shows what looks like a mobile call/book bar (inferred from repeated labels, unconfirmed).

**Intent.** Urgent: "something is broken, who can come now and what will it cost". Planned: install or inspection.

**Imagery.** Real-people photography (technicians group photo, electrician at work, van), icons on service tiles. Few images overall.

**Typography.** Large, bold headings and short copy lines (from heading hierarchy); faces not determinable.

**Density.** Moderate to high, long single-column scroll with repeated CTAs.

**Personality.** Reliable, punctual, friendly; guarantee-forward.

**Architecture.** Services, Residential/Commercial, Reviews, About, Resources/Tips, Locations, Book Now.

**Trust cues.** Rating with review count, named review excerpts, written guarantees and late-arrival pledge, "locally owned" wording, licensed-by-state note. Cautions: Mr. Electric displayed a broken "0/5" widget and a large customer-count claim; no licence number shown. Honest substitutes for a new business: licence and insurance details the owner supplies, a real photo and name of the tradesperson, clear pricing policy, named service area.

**Conversion.** Phone and booking in header at all times; ZIP lookup or short form; offers with expiry dates; emergency block.

**Mobile.** Click-to-call in the header; possible sticky bar (unconfirmed).

**Rules (10).** Header phone plus book (3/3); sticky mobile bar (1/3, inferred); hero with built-in action (2/3); 4-6 nav items (3/3); service tile grid (2/3); emergency block when real (2/3); trust order and no broken widgets (2/3); honest no-reviews fallback (derived); explicit service area (2/3); real photography (2/3).

## 5. Medical practice

Sites read: nuffieldhealth.com (large provider, readable), parsleyhealth.com (text only, partial) (2026-11-07). Not readable: onemedical.com (403), mayoclinic.org (403), drmcminn.com (parked). Evidence is weak; treat the rules as cautious.

**Hierarchy.** Nuffield: nav (four mega-menus), promotional hero, three audience tiles, club feature rows, hospital tiles (book a consultant, find treatment, see a GP, diagnostic imaging), photo tiles, location finder with per-site phone and booking, footer. Parsley: hero about approach, two path cards, one patient quote, conditions grid, clinician trust block, comparison with other care models, FAQ.

**Navigation.** Nuffield 4 mega-menu headings plus login and search. Parsley nav not captured. Sticky not determinable.

**Intent.** "Can you treat my problem, who are you, what does it cost, how do I book".

**Imagery, typography, mobile.** Not determinable (Nuffield uses SVG illustrations and photo tiles per the page text).

**Density.** Nuffield light in body, very dense in menus and location lists; Parsley text-heavy with short labels.

**Personality.** Reassuring and clinical (Nuffield institutional; Parsley warm and explanatory).

**Architecture.** Services/conditions, locations, clinicians, fees or insurance, FAQ, health advice, contact.

**Trust cues.** Nuffield links to CQC ratings, quality and safety, complaints; Parsley states board-certified clinicians and shows one five-star quote. Honest substitutes: address, opening hours, services, how appointments work, fees if known, clinician names and registration numbers only if the owner supplies them.

**Conversion.** Book/find-a-service/location finder, per-location phone, membership join (Nuffield); membership or lab review (Parsley).

**Rules (10).** See JSON; intent-based tiles (2/2); conditions index (2/2); one primary action per screen (1/2); verifiable credentials (2/2, different forms); cost/insurance FAQ (1/2); emergency notice (0/2 on homepage, safety rule); calm need-led hero (1/2); limited testimonial use (1/2); factual fallback (derived); default nav (derived).

**Must NOT be claimed without owner-supplied evidence**

- Treatment outcomes, cure or success rates, or "clinically proven" statements.
- Clinician qualifications, specialist status, registration numbers, regulator ratings or registrations.
- "Best", "leading", "award-winning", rankings.
- Testimonials or star ratings implying efficacy (ASA guidance cited in search results: testimonials alone are unlikely to substantiate efficacy claims; objective claims need evidence).
- Claims that could discourage essential medical treatment (CAP Code rule 12.2 as cited).
- Emergency or 24/7 cover, waiting times, same-day slots, fees, insurance acceptance, affiliations.
- Before/after images and named patients.

The regulatory pointers are UK-based (ASA/CAP); the owner's market may differ. Patient data in enquiry forms also needs market-specific privacy handling (general knowledge, not drawn from this research).

## 6. Education centre / tutoring

Sites read: varsitytutors.com, sylvanlearning.com, tutorful.co.uk (2026-11-07). Not readable: mytutor.co.uk (empty), kumon.com and mathnasium.com (403).

**Hierarchy.** Varsity: top bar with phone, subject menu, hero with chat input and subject pills, stat strip, level tags, image carousel, 60-second intake form, matching banner, dense footer with disclaimers. Sylvan: free-assessment promo, nav groups, hero with parent-child photo and centre finder, four-step explainer, differentiators, comparison table, lead form, app promos, footer centre finder. Tutorful: nav, hero "find a tutor", stats band, first-lesson guarantee, vetting, outcomes, dated testimonials, four-step process, safety, partner logos, subject pills.

**Navigation.** Varsity 13 subject categories; Sylvan about 30 links in 3 groups; Tutorful 8 items with an age/subject/exam-board mega-menu. Sticky not determinable.

**Intent.** A parent or learner: "can you help my child with this subject and level, can I trust the tutor, what is the first step and what does it cost".

**Imagery.** Stock-style people (Varsity, Sylvan) or app screenshots (Tutorful). Typography not determinable (Tutorful uses sentence-case headlines and emoji in headings).

**Density.** Mostly high, with repeated sections.

**Personality.** Supportive, parent-reassuring, outcome-focused.

**Architecture.** Subjects/programs, how it works, tutor vetting/safety, pricing or guarantee, centres/locations, resources, tutor recruitment.

**Trust cues.** Ratings and review counts, stats, vetting and safeguarding statements, guarantees, partner logos, dated testimonials (Tutorful). Observed risk to avoid: unsourced outcome numbers (Varsity "2x growth"), a self-authored comparison table and unsourced superlatives (Sylvan); Tutorful qualified its claim with "on average". Honest substitutes: tutor profiles and qualifications the owner supplies, lesson format, a sample lesson plan, the safeguarding policy, and "enquire for pricing".

**Conversion.** Free assessment, trial lesson or 1-minute form; phone; minimal lead form with consent.

**Mobile.** Not observable beyond mega-menus likely collapsing.

**Rules (10).** Intent-matched hero action (3/3); low-commitment first step (3/3); 3-4 step process (2/3); subject/level nav (3/3); show vetting only if real (3/3); stat band only with basis and date (3/3 use one, 1/3 qualifies, 2/3 leave claims unsourced); phone/short form (2/3); disclosures near claims (3/3); real photos over stock (2/3 use stock); honest fallback (derived).

**Must NOT be claimed without owner-supplied evidence**

- Grade improvement figures, pass rates, "guaranteed results".
- "#1", "top" or "best" without a stated basis and date (CAP expects the basis of "No. 1" claims to be stated).
- Tutor qualifications, vetting percentages, background-check statements.
- Accreditation, inspection ratings, school or exam-board affiliations.
- Student names, photos, scores or testimonials without documented consent.
- Years of operation, student or lesson counts, satisfaction scores.
- Pricing, trial and guarantee terms; employment status of tutors.

The search found no ASA ruling on tutoring grade claims specifically; the pointers come from adjacent education and training rulings.

## 7. Real estate agency

Sites read: winkworth.co.uk, compass.com, knightfrank.com (2026-11-07). Not readable: theagencyre.com (JS-rendered), hamptons.co.uk (403).

**Hierarchy.** Winkworth: nav, search-panel hero, "in numbers", account promo, four role cards, dated Google reviews with valuation CTA, neighbourhood-experts block, about 25 article cards, office finder. Compass: tabs, search-bar hero, exclusives banner, mortgage promo, concierge, expandable cities and markets, large legal footer. Knight Frank: utility bar with consultation button, report banner, country locator, stats, six solution cards, three full-bleed feature blocks, careers, enquiry form.

**Navigation.** Winkworth 3 items (Buy, Rent, Find an office); Compass Buy/Rent/Sell plus 3 dropdowns; Knight Frank 4 menu headings plus utility links. Sticky not determinable.

**Intent.** Buyers and renters: search; sellers and landlords: evaluate the agent and book a valuation.

**Imagery.** Property and lifestyle photography; Winkworth's looked stock-style (doors, houses, cityscapes), Knight Frank used interior and exterior property scenes. Typography not determinable; vendor roundups mention serif accents for boutique agencies, which is not verified by the sites read.

**Density.** Winkworth high; Compass sparse at top then dense link lists; Knight Frank light.

**Personality.** Heritage and local expertise (Winkworth, Knight Frank); product and tech (Compass).

**Architecture.** Buy, Rent, Sell, Landlords, offices/agents, valuation, market research and articles, legal notices.

**Trust cues.** Heritage and scale numbers, dated Google rating, licence statements, client-money and fraud-protection notices, extensive data disclaimers (Compass). Honest substitute for a new agency: the agent's name and photo, specific local knowledge the owner can state, fee structure, how a valuation works.

**Conversion.** Property search, "Book a valuation" or "Book a consultation", office/agent finder, short enquiry form (Knight Frank). Compass showed no obvious valuation CTA.

**Mobile.** Not observable.

**Rules (10).** Search or consultation hero (2/3 search-led, 1/3 advisory); 3-4 nav items (3/3); role signposts (3/3); valuation CTA (2/3); office finder plus short form (3/3); verified numbers and ratings only (2/3, 1/3 dated reviews); real listing photos only (2/3); regulatory notices in footer (2/3); optional insights section (2/3); honest new-agency fallback (derived).

**Must NOT be claimed without owner-supplied evidence**

- Sales figures, homes sold, days on market, achieved-price percentages.
- Awards, market-leader or "No. 1 agent" claims.
- Listings, prices or sold prices the owner has not supplied (UK Trading Standards view cited in search: "price on application" is likely misleading; price, council tax band and tenure are required material information on listings).
- Licence, registration or redress-scheme membership.
- Google or other review ratings and counts.
- Valuation estimates, market statistics, area price trends.
- Neighbourhood claims about schools, crime or demographics (non-discrimination risk in some markets; US fair housing was not verified by the search, so check locally).
- Mortgage, legal or financial advice; stock photos presented as real properties or team.

---

## Cross-category patterns worth encoding

1. Every category has one dominant job for the first screen: show the work (agency, photographer), state the outcome (consultancy), start the job (home repair), choose the pathway (medical, education), search or book a valuation (real estate).
2. Nav stays at 3-7 items; depth goes into dropdowns, filters or tiles.
3. Trust is category-specific and must be owner-supplied; "no evidence yet" always has a factual fallback (process, people, policy, location, price policy), never an invented number.
4. Regulated categories use disclaimers next to claims; weak sites were those that made unsourced superlatives.
5. Never render empty or failed widgets (0/5 rating, empty Hours, builder error text).

## Sources

Searches (discovery only, secondary): Awwwards and agency-site roundups; photographer roundups (Expert Photography, Hostinger, Sitebuilder Report); handyman and plumbing roundups (WebFX, Jobber, Cyberoptik); medical roundups (Framer, Bitcot, Cyberoptik); tutoring roundups (Wix, Colorlib, Krisha Web, HubSpot, The Stacc); real-estate roundups (Zarla, WPResidence, Magier, Circleboom); ASA/CAP pages on testimonials and health claims; Trading Standards and Property Ombudsman guidance for estate agents; CAP education advertising guidance. Roundups are vendor content with commercial angles; they informed site selection only, not rule support counts.
