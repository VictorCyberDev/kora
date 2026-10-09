# RumptyCloud provider boundary

RumptyCloud is Kora's first provider target, but the core domain must not depend on provider-specific APIs.

Milestone 1 deliberately contains **no RumptyCloud client code** because no verified API/CLI specification is present in the repository. We will not invent endpoints, commands, authentication, SDK behavior, or credential formats.

## Contract needed for Milestone 2

A provider adapter will need verified capabilities for workload/deployment identity, deployment/change history, health/monitoring metadata, logs, and later constrained typed actions. Cloud credentials stay inside the adapter/executor trust boundary and are never passed to a reasoning model.

Before implementation, verify official RumptyCloud documentation for authentication, GitHub deployment flow, networking/firewall behavior, managed PostgreSQL connection/TLS requirements, health checks, deployment logs, and API/CLI idempotency/error semantics.
