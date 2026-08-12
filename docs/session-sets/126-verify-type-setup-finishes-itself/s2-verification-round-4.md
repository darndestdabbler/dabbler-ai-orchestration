VERIFIED

Fix verdict: L1 stale setup instructions still tell Copilot users to configure retired `transport.profile` local override -- fix-accepted

I checked the remediated code-backed migration message, its guard test, the local-override refusal path, and the changed setup docs/templates shown in the fix delta. The stale `ai_router/local-overrides.yaml` recommendation is replaced with the sanctioned `verify_type --set COPILOT_CLI` / `--set-env` path, and the test now pins against reintroducing the retired wording.

NITS

- **Nit:** `docs/cross-repo-lightweight-removal-notice.md` says `--set-env` “persists” the env var generically; the main helper/docs correctly distinguish Windows persistence from POSIX export-only output, so this is docs-only wording drift rather than a blocking defect.