# ADR-002: AI cannot directly execute infrastructure commands
**Status:** Accepted

## Context
Future models will reason over operational evidence. Model output is probabilistic and may be wrong or manipulated by untrusted evidence.
## Decision
AI returns schema-validated diagnoses/recommendations only. It receives no unrestricted cloud credentials and no raw shell execution capability. Actions are typed and separately policy evaluated/executed.
## Consequences
Automation has explicit control points and auditability at the cost of more deliberate action contracts. AI outages do not disable deterministic detection.
## Alternatives Considered
Agentic shell access is flexible but creates unacceptable credential, injection and blast-radius risk. Hard-coded diagnosis only cannot cover future complex reasoning needs.
