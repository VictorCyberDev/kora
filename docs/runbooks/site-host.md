# Runbook: deploying Kora on RumptyCloud (control plane + Site Host)

Everything below uses only mechanisms in the RumptyCloud docs (read 2026-10-30): deployments are created **from a GitHub repository in the console**, built with the root `Dockerfile`, listen on the injected `PORT`, and are health-checked on a configurable readiness path. There is no documented API or CLI for creating or rolling back deployments, so these steps are manual console actions.

## Resources (one image, three runtime roles)

| #   | Resource             | Type                                              | Start command                                  | Readiness path |
| --- | -------------------- | ------------------------------------------------- | ---------------------------------------------- | -------------- |
| 1   | `kora-db`            | Managed PostgreSQL (console: Databases)           | n/a                                            | n/a            |
| 2   | `kora-control-plane` | Deployment, Web Service/Backend, Dockerfile build | `node apps/api/dist/server.js` (image default) | `/health`      |
| 3   | `kora-site-host`     | Deployment, Web Service/Backend, Dockerfile build | `node apps/site-host/dist/server.js`           | `/health`      |

Do not set `PORT` in a start command or in environment variables: the platform injects it from the Port setting (default 8080).

## Order

1. Create the database. Copy its **internal** connection string for deployments in the same workspace (the console shows it; do not guess hostnames) and the **public** one for running migrations from outside. Use `sslmode=require` if the console says so.
2. Run migrations exactly once, before either service takes traffic: `DATABASE_URL=<public string> node apps/api/dist/db/migrate.js` (from the built image or a checkout: `pnpm db:migrate`). Re-running is safe.
3. Create `kora-site-host` first (it needs only the database): env `DATABASE_URL`, `SITE_HOST_PUBLIC_URL=<its own public URL shown by the console after the first deploy>`; set that variable after the URL is known and redeploy once. Recommended: give it a PostgreSQL role with `SELECT` only on `sites`, `site_versions`, `site_faults`, `domains`; the host never writes.
4. Create `kora-control-plane`: env `NODE_ENV=production`, `DATABASE_URL`, `KORA_PUBLIC_URL=<its public URL>`, `SITE_HOST_PUBLIC_URL=<the Site Host public URL>`, `KORA_ENVIRONMENT=production`, `MONITOR_ENABLED=true`, `GITHUB_REPO=VictorCyberDev/kora` (Deployment Verification), and for the Rumpty identity of the host: `RUMPTY_WORKSPACE`, `RUMPTY_REGION`, `SITE_HOST_RESOURCE_ID=<the deployment's unique ID from the console>`. Optional: `KORA_CHAOS_ENABLED=true` **only** for a demo workspace.
5. Verify: `GET <control-plane>/health`, `/__kora`, `/` (landing), `GET <site-host>/health` (`database":"ok"`), `/__kora` (`service":"kora-site-host"`).

## Failure domains (what is and is not independent)

The control plane and Site Host are separate deployments with separate processes and ports; a Site Host crash does not stop Mission Control, incident processing, policy, audit or billing (tested: `site-host.integration.test.ts`). They share one PostgreSQL database and the same Rumpty workspace, so a database or workspace-wide outage affects both. Kora does not claim separate VMs or network isolation beyond what Rumpty documents for separate deployments.

## Not available

- Custom hostnames: RumptyCloud documents no custom-domain binding, so `CUSTOM_DOMAIN_PROVIDER_ROUTING_UNAVAILABLE`. Use the Rumpty-provided Site Host URL.
- Hosted inference: no inference page exists in the published docs; Kora keeps its deterministic fallback unless you configure `INFERENCE_*` for an OpenAI-compatible endpoint you have.
- The `rumpty` CLI is not in the image. The bucket publisher (`KORA_EXPERIMENTAL_RUMPTY_BUCKET=true`) is experimental, requires a derived image that installs the CLI, and is not used by this deployment.

## Single instance

Rate limits and per-site monitors live in process memory. Run exactly one instance of each service; do not scale out. Trust is limited to one proxy hop (the platform edge).
