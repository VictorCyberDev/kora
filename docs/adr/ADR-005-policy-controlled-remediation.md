# ADR-005: Policy-controlled remediation
**Status:** Accepted

## Context
Future diagnoses may recommend infrastructure changes with very different blast radii.
## Decision
Every ProposedAction is typed and passes a separate policy boundary yielding DENY, REQUIRE_APPROVAL or ALLOW before any executor sees it. Destructive classes can be categorically forbidden.
## Consequences
Safety policy is deterministic, reviewable and independent of model persuasion. More action metadata and policy tests will be required.
## Alternatives Considered
Model-decided authorization mixes probabilistic reasoning with authority. Executor-local ad hoc checks are difficult to audit consistently.
