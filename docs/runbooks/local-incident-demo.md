# Local incident demonstration

Prerequisites: Node.js 22+, pnpm 10+, Docker with Compose, and curl.

1. `pnpm install`
2. `cp .env.example .env` and set `DEMO_FAILURE_INJECTION_ENABLED=true` **for this local controlled demo only**.
3. `docker compose up -d postgres`
4. Export the variables from `.env` into your shell, then run `pnpm db:migrate`.
5. Terminal A: `pnpm --filter @kora/demo-service dev`
6. Terminal B: `pnpm --filter @kora/api dev`
7. Verify workload: `curl -i http://localhost:3100/health`; verify Kora: `curl -i http://localhost:3000/health`.
8. Trigger the controlled outage: `curl -i -X POST http://localhost:3100/dev/failure`.
9. With the default 5-second interval, wait for at least three failed checks. API logs show each check and `incident created` when the threshold is reached.
10. Query: `curl http://localhost:3000/incidents`. Copy the incident UUID.
11. Inspect `curl http://localhost:3000/incidents/<UUID>/evidence` and `curl http://localhost:3000/incidents/<UUID>/events`.
12. Restore: `curl -i -X POST http://localhost:3100/dev/recover`.
13. Wait for three successful checks. Logs show `recovery verified`.
14. Re-query the incident, evidence and events. It should be `RESOLVED`, contain recovery evidence and include `RecoveryVerified`.

For normal operation return `DEMO_FAILURE_INJECTION_ENABLED=false`. Without explicit enablement, the development control routes return 404 and cannot change health.
