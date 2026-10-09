# ADR-006: Remediation must be verified

**Status:** Accepted

## Context

A provider accepting an action does not prove service recovery; actions can succeed mechanically while user-visible health remains broken.

## Decision

Action execution and recovery are distinct states. Recovery is established only by subsequent deterministic observations meeting configured verification criteria. Milestone 1 already applies this principle to manual recovery.

## Consequences

Kora may report an executed action as unsuccessful until health evidence confirms it. Verification windows and evidence retention become core action semantics.

## Alternatives Considered

Trusting HTTP 2xx/provider job success is simpler but measures command acceptance, not reliability recovery.
