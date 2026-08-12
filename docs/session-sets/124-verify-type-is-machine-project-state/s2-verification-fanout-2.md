**VERIFIED** — I checked the changed config load path, override allow-list/refusal behavior, verify-type derivation mapping, targeted tests, router config comments, and live ignored seat-local files. The implementation meets the session requirement: `transport.profile` is no longer locally overridable, stale nested uses are refused with a derived `verify_type --set` command, and allowed local overrides still work.

**NITS**

- **Nit:** `ai_router/config.py:867-868` hard-codes `ai_router/local-overrides.yaml` in the refusal text even though `load_config()` reads the override from `config_path.parent`; unusual explicit config locations could see a misleading delete path.
- **Nit:** Some non-runtime prose is stale: `ai_router/config.py:260-268`, `ai_router/tests/test_verify_type_resolution.py:7-8`, and `ai_router/tests/test_local_overrides_merge.py:324-325` still imply a seat-local transport profile belongs in `local-overrides.yaml`.