VERIFIED — I checked the Session 2 spec obligations against the changed catalog code, routing/verifier catalog consumers, tests, and referenced docs. The implementation renames the misleading field, preserves legacy lockfile loading, documents the non-price rationale and authoritative cost axes, and no current runtime path selects models from the probe sample.

**NITS**
- **Nit:** A literal zero still loads as `probe_premium_requests == 0`; the current no-reader prohibition makes this non-blocking, but it is not a field-level `0 -> unknown` coercion.
- **Nit:** The referenced Set 078 design doc still shows the old schema name; it is historical, but current comments still point to it as “Full schema + rationale.”