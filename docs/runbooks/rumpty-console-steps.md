# Rumpty console steps (the only manual part)

Everything else is automated. You will create four resources in the **Kora** workspace and copy back four values. Total time about 15 minutes. Open https://console.rumptycloud.com and select the workspace **Kora** (top navbar).

Do not paste any secret into chat. Secrets go only into the console's environment-variable fields (stored encrypted, injected at runtime).

## 0. Look before you create (avoid duplicates and extra cost)

Open **Compute → Deployments**. If a deployment named `kora-api` (or similar) exists, **reuse it as the control plane** (step 2: open it, Settings tab, change the fields, then redeploy). If a `demo-service` exists, leave it alone. Also open **Databases**: if a Postgres already exists for Kora, reuse it (step 1 becomes "copy its connection strings"). Tell me what you found if it differs from this plan.

## 1. PostgreSQL

- Menu: **Databases → create** (type **Postgres**), name `kora-db`, smallest plan.
- Copy the **internal** connection string (for apps in the same workspace).
- Needed by: steps 2 and 3. Treat it as a secret.

## 2. Control plane (the Kora app)

- Menu: **Compute → Deployments → New deployment**. Name: `kora-control-plane` (or reuse `kora-api`).
- Source: GitHub repository `VictorCyberDev/kora`, branch `main`. Root directory: leave empty.
- Application type: **Web Service/Backend**. Build method: **Dockerfile**. Runtime size: **Tiny** (3 free deployments are included).
- Start command: `node apps/api/dist/server.js`. Port: leave default (the app reads the injected `PORT`; do not set `PORT` anywhere).
- Readiness/health check path: `/health`.
- Environment variables (names exactly):
  - `NODE_ENV` = `production`
  - `DATABASE_URL` = the internal connection string from step 1
  - `KORA_AUTO_MIGRATE` = `true` (applies migrations once at startup under a database lock)
  - `KORA_ENVIRONMENT` = `production`
  - `MONITOR_ENABLED` = `true`
  - `KORA_LEGACY_MONITOR` = `false` (turns off the old single-demo monitor; customer-site monitors stay on)
  - `KORA_CHAOS_ENABLED` = `true` (enables the labelled **Controlled test** for this demo workspace only)
  - `KORA_PUBLIC_URL` and `SITE_HOST_PUBLIC_URL`: leave empty on the first deploy; you add them in step 5.
- Create deployment. Wait for **Active**. Copy its **public URL**.

## 3. Site Host (customer sites, separate service)

- **Compute → Deployments → New deployment**. Name: `kora-site-host`. Same repository, branch `main`, **Web Service/Backend**, **Dockerfile**, **Tiny**.
- Start command: `node apps/site-host/dist/server.js`. Readiness path: `/health`.
- Environment variables: `NODE_ENV` = `production`; `DATABASE_URL` = the same internal string; `SITE_HOST_PUBLIC_URL` empty for now.
- Create. Wait for **Active**. Copy its **public URL**.

## 4. Inference project (hosted AI for explanations)

- Console section **Inference** (listed in the docs as "inference projects with an OpenAI-compatible endpoint and API key for hosted models"). Create a project named `kora-reasoner` and choose a chat/instruct model.
- Copy the endpoint **base URL** and the **model name**. Create/copy the **API key** into the control plane env var only (step 5), never into chat.
- Cost: every account has a free token pool per billing cycle. Leave **Billing → Settings → Token overage OFF** so nothing can be charged. If creating the project asks for payment, stop and skip this step: Kora continues with its rule-based fallback.

## 5. Wire the URLs and redeploy (control plane only)

On `kora-control-plane` → **Env** tab, add:

- `KORA_PUBLIC_URL` = control plane public URL (step 2)
- `SITE_HOST_PUBLIC_URL` = Site Host public URL (step 3)
- `SITE_HOST_RESOURCE_ID` = the Site Host deployment's unique ID shown in the console
- `RUMPTY_WORKSPACE` = the workspace slug, `RUMPTY_REGION` = the region shown in the console
- If step 4 succeeded: `INFERENCE_BASE_URL`, `INFERENCE_MODEL`, `INFERENCE_API_KEY`
  Redeploy it. On `kora-site-host` → **Env**, set `SITE_HOST_PUBLIC_URL` = its own public URL and redeploy.

## Copy back to me (no secrets)

1. Control plane public URL
2. Site Host public URL
3. Inference **base URL** and **model name** (or "skipped")
4. Anything unexpected from step 0 (existing deployments found, their status)

I then run the live acceptance, capture evidence and update the submission.
