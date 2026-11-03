# ADR-029: SiteSpec v3 as a new versioned contract

Status: accepted. v7.

**Decision.** The creative ceiling of v2 (variants chosen from a recipe table) cannot express composition-level
decisions (genome, art direction, plates, richer layouts). Introduce `version: 3` with its own parser, renderer and
planner. `renderAnySite` dispatches on `version`. v1 and v2 are not modified: golden hashes and byte-stable history are
preserved, no enum meaning changes, no version is converted automatically.

**Consequences.** Three renderers live side by side until v1/v2 customers are migrated by choice. Old sites upgrade
through a new draft ("Try a new Kora design"), compared and published by the owner, with rollback. The closed
vocabulary stays closed: more families, never arbitrary markup.

**Rejected.** Extending v2 enums in place (would reinterpret historical versions); letting a model emit HTML or CSS.
