VERIFIED — The Session 2 deliverables are implemented: `transport.profile` is removed from the local override allowlist, stale local profiles are refused with the replacement `verify_type --set` command, allowed overrides still work, tests cover the migration path, and the decision journal records refuse-vs-warn.

NITS:
- **Nit:** `ai_router/tests/test_verify_type_resolution.py:7-8` still describes the old “project file beats seat-local local-overrides” precedence, though the tests now correctly assert refusal.
- **Nit:** `ai_router/tests/test_local_overrides_merge.py:252-325` has stale explanatory/failure text suggesting `copilot-cli` belongs in `ai_router/local-overrides.yaml`; that advice now contradicts the retired override.