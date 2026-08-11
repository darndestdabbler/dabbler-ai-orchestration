**VERIFIED** — I checked the close-preflight writer/check path, the extension reader/tree rendering, the session menu removal, package contributions, and the Layer 3 harness integration. I found no new Critical/Major defects beyond the already-reported stale full Playwright run.

#### NITS

- **Nit:** `ai_router/close_preflight.py` does not catch `UnicodeDecodeError` when reading a damaged projection, so `--check` could traceback instead of reporting `unreadable` for an invalid-UTF-8 cache file.
- **Nit:** `docs/repository-reference.md` still describes the staged Work Explorer release as showing `<- here`, which is stale after this marker-removal work.