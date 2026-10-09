# ADR-004: VMs before Kubernetes
**Status:** Accepted

## Context
Kora must prove reliability behavior on real infrastructure before adding orchestration complexity. RumptyCloud product context includes Ubuntu VMs and Kubernetes, but exact deployment APIs are not yet verified.
## Decision
Target simple VM/application deployment for the first real RumptyCloud milestone. Kubernetes support is deferred until Kora's contracts are proven.
## Consequences
Early failure modes are easier to understand and demonstrate. Kubernetes-specific discovery/remediation is delayed.
## Alternatives Considered
Kubernetes first offers rich primitives but would conflate Kora reliability logic with cluster/platform complexity during validation.
