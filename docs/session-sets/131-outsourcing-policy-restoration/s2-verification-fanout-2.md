**VERIFIED** — I checked the actual catalog implementation, new structural tests, routing/export surfaces, transport/preflight neighbors, and `ai_router/docs`; I found no Critical/Major defect that currently lets `probe_premium_requests` drive model selection or pricing.

**NITS**

- **Nit:** `dumps(loads(v1_lockfile))` emits the renamed `probe_premium_requests` key but preserves `schema_version = 1`, so a load/write migration can create a v1-labeled file with a v2 field. The normal `--refresh` path writes schema v2, so this is low-impact.
- **Nit:** Zero is disarmed by interpretation/prohibition, not storage: v1 `0` still loads as `probe_premium_requests == 0`. That is defensible for preserving the true probe sample, but a same-module or external reader can still see the literal zero.
- **Nit:** The prohibition test allowlist is basename-based, so another future file named `copilot_catalog.py` under `ai_router/` would bypass the guard. Low probability, but path-specific allowlisting would close it.