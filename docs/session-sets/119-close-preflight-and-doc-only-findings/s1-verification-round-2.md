**VERIFIED** — I checked the changed parser/classifier, structured `submit_verdict` surface, schemas/templates, operator decision record, stamp pin, shared classifier callers, and the new falsifier tests. The required `evidencePaths` plumbing and doc-only cap are implemented at the shared predicate, with absent paths still blocking and mixed doc/code evidence still blocking.

#### NITS

- **Nit:** `docs/path-aware-critique.schema.json` still permits whitespace-only `evidencePaths` entries while `ai_router/path_aware_critique.py` rejects them with `p.strip()`. This is fail-closed and not emitted by the normal producer, so it is non-blocking.