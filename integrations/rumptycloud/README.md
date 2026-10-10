# RumptyCloud provider boundary

RumptyCloud is Kora's first provider. Kora keeps provider identity and capabilities behind a provider-neutral contract; incident detection does not depend on provider availability.

## Verified interfaces

Checked against the official RumptyCloud documentation on 2026-10-09:

- resources are scoped to a **workspace**;
- Virtual Machines expose a unique VM ID in the console Deploy tab;
- the Rumpty CLI supports `vm ls`, `vm start`, `vm stop`, `vm reboot`, `exec`, `copy`, `expose`, and workspace selection;
- non-interactive CLI authentication uses a Personal API key via `RUMPTY_API_KEY`, `--token`, or `rumpty login --token`;
- VM GitHub deployment uses `rumptycloud/deploy-action@v1` with a token and unique VM ID;
- deployments route traffic and platform health checks through their configured port and readiness path;
- managed PostgreSQL exposes connection information through the console and supports firewall policies.

The docs currently available to this implementation do **not** specify a stable machine-readable response schema for VM discovery/status or a public REST endpoint contract. Kora therefore does not parse guessed CLI output and does not invent HTTP endpoints.

## Milestone 2 implementation

`apps/api/src/providers/rumptycloud.ts` validates a Rumpty resource identity supplied from verified console values and maps it into Kora's provider-neutral resource model. It advertises only `HEALTH_OBSERVATION`: Kora can bind a real Rumpty VM/deployment to a health endpoint and observe it over HTTP.

It deliberately does not advertise `RESOURCE_DISCOVERY`, `RESOURCE_STATUS`, `LOG_ACCESS`, `METRIC_ACCESS`, or remediation capabilities until a documented machine-readable contract is verified.

Durable identity is:

`provider + workspace + region + resource type + provider resource ID`

Display names are metadata, never identity.

## Credentials

The current adapter does not require a Rumpty API key. When credentialed discovery/status is added, use `RUMPTY_API_KEY` from secret storage only. Never persist it in PostgreSQL, evidence, events, logs, or API responses.

## Acceptance requirement

A real-cloud acceptance run needs a Rumpty workspace resource ID, verified zone/region, public health URL, and a deployed demo workload. These are account-scoped external facts and are not fabricated in CI.
