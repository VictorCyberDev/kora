# ADR-012: The Reasoner explains and proposes; it never decides or acts

**Status:** accepted. Extends ADR-002.

The Reasoner (`services/reasoner`) receives an allow-listed projection of an immutable diagnostic snapshot, topology, recent change events, verification state and the permitted action vocabulary. Untrusted text is bounded, control-stripped and secret-redacted; it travels only inside a `data` object the system prompt declares to be data, never instructions.

Output is JSON validated by Zod and then **referentially**: every `evidenceIds`, `gapIds` and `contradictionIds` entry must exist in the input; a hypothesis cannot claim more confidence than the deterministic findings support; actions must be in the permitted typed vocabulary. Any violation rejects the whole output and the deterministic fallback is used, so Kora is fully functional without inference. The model has no tool access and cannot call the executor. Owner-Mode status and headings come from `ownerHeadline`/`owner.ts`, never from model prose.

The LLM client is provider-neutral (OpenAI-compatible `/chat/completions`). RumptyCloud hosted inference is a configuration choice (`INFERENCE_*`); its endpoint and model names are not hardcoded because they were not verifiable from the public docs.
