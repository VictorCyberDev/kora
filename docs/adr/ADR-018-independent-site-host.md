# ADR-018: The Site Host is a separate service

**Status:** accepted. Supersedes the Kora-hosted publisher as the production runtime (ADR-016).

Serving customer sites from the control plane made one process the failure domain for both. `apps/site-host` is a separate Fastify service whose entire job is to serve published artifacts: it reads four tables (`sites`, `site_versions`, `site_faults`, `domains`) with SELECT only, resolves a slug or a connected hostname, and exposes `/health` and `/__kora`. It has no sessions, billing, Reasoner, provider credentials or remediation authority, and no route besides `/s/:slug/*` and hostname-root serving. Resolution/ETag/path-safety logic is the shared `@kora/site-serving` package, and the renderer is not duplicated: the host serves the immutable artifact the builder stored.

Publishing is moving the published pointer; `SiteHostPublisher.verifyLive` then fetches the page **from the host over HTTP** and compares bytes, so a publish is only reported verified if the separate service really serves it. The control plane monitors the host's public URL like any customer site. Controlled tests are a typed, site-scoped row in `site_faults` bound to the live version, with an expiry (30 s to 30 min); the host applies it (HTTP 500 or a bounded delay) and the control plane never fakes an incident. Recovery is the same closed loop as before: the typed `republish_site_version` action moves the pointer, and only new monitor observations can verify recovery.

Domains: `ACTIVE` now requires DNS correct **and** the domain returning this site's own page over valid HTTPS (provider routing observed) **and** valid TLS. Rumpty documents no custom-domain mechanism, so Kora reports `CUSTOM_DOMAIN_PROVIDER_ROUTING_UNAVAILABLE` instead of claiming it provisioned anything.

Consequences: both services share the database and workspace; they are single-instance; the host's database role should be SELECT-only.
