# Vertical Intelligence 2.0

Strategic knowledge about how a kind of business is found, trusted and chosen. It feeds strategy, page architecture,
copy and grammar choice. It never outputs a layout or a template.

Source: `packages/creative/src/verticals.ts`. Thirteen clusters (food, beauty, trades, professional, health, creative,
hospitality, retail, education, civic, tech, agri, mobility) supply defaults; each vertical states only what is specific.

Per vertical: common customer, job to be done, primary and secondary intent (16 intents from call to donate),
trust barrier, useful content, pages, whether one strong page suffices, proof that is allowed, expected imagery, mobile
priorities, likely contact method, local-search terms, density, voice range, design pitfalls, compliance risks, artifact
types, campaign use cases, **anti-traits**, the trade's own word for its offer list, the verbs used to read the owner's
description, a ranked list of grammars, and whether real photography is the trust signal.

Coverage: every vertical named in the mandate (barber through creator/personal brand) has an entry, plus a `general`
fallback. Resolution (`resolveVertical`) scores regex matches by length and by how early they appear (what the business
calls itself in its name and opening words outweighs later mentions) and never throws.

Adding a vertical is one `v(...)` entry; no code elsewhere changes. The model is global: currency, address format and
WhatsApp are never assumed (WhatsApp is only used when supplied).

## Anti-traits

Each vertical lists what it must avoid (law: playful, cartoon, unsubstantiated authority claims; barber: generic
corporate, overly delicate; daycare: cold luxury, tiny type, dark surfaces). They map to grammar tags and subtract from
a grammar's score, and they travel into the Brand OS as "Never" rules. An owner who explicitly asks for a feel can
override the penalty for that grammar; the owner's stated taste outranks the vertical default.
