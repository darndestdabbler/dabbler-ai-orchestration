# Change Log - Set 074 (Dabbler-Prefixed Provider API Key Environment Variables)

> **What this set delivered.** Set 074 is a one-session emergency patch that
> moves Dabbler's built-in provider API key defaults to `DABBLER_`-prefixed
> environment variable names so the router does not collide with provider-owned
> IDE extensions that auto-detect generic API-key names. The values remain the
> normal API keys issued by Anthropic, Google, and OpenAI; only the environment
> variable names changed.
>
> **Release:** `dabbler-ai-router` `0.26.1`, PyPI tag `v0.26.1`; VS Code
> extension `0.33.1`, Marketplace tag `vsix-v0.33.1`.

---

## Session 1 of 1 - Rename provider env vars and release

**Status:** VERIFIED (routed `session-verification`, gpt-5-4). PyPI patch
release published; Marketplace patch prepared pending green `Test` workflow and
`vsix-v0.33.1` tag push.

### Delivered

- **Runtime defaults changed.** `ai_router/router-config.yaml` now uses
  `DABBLER_ANTHROPIC_API_KEY`, `DABBLER_GEMINI_API_KEY`, and
  `DABBLER_OPENAI_API_KEY` for the built-in Anthropic, Google, and OpenAI
  providers. `api_key_env` remains configurable, so custom names still work.
- **Helpers and diagnostics updated.** Windows user-env loading,
  secret-resolver examples, migration no-credentials diagnostics, and CI dummy
  env vars now point at the Dabbler-prefixed names.
- **Extension surfaces updated.** The Getting Started provider-key detector,
  Full-tier warning copy, troubleshooting output, webview protocol comment,
  static media warning, rebuilt `dist/extension.js`, and copied
  `dist/templates/consumer-bootstrap` bundle all use the new names.
- **Docs and templates updated.** Root README/instruction files, quick start,
  workflow docs, close-out troubleshooting, extension README, consumer-bootstrap
  templates, and cold-start fixtures now describe the Dabbler-prefixed names and
  explicitly state that Dabbler does not issue separate provider keys.
- **Tests and release metadata updated.** Python and TypeScript test fixtures
  now expect the Dabbler-prefixed defaults. `pyproject.toml` and
  `ai_router.__version__` are `0.26.1`, and `ai_router/CHANGELOG.md` records the
  patch release.
- **Extension update forces a Python source refresh.** The `Dabbler: Update
  ai-router` PyPI path now runs `pip install --upgrade --force-reinstall
  --no-cache-dir dabbler-ai-router`, and extension `0.33.1` is prepared as the
  Marketplace patch carrying the updated installed-extension source, templates,
  README, and changelog.

### Verification

- Exact old-env-var scan across live code/docs: only the intentional changelog
  old-to-new mapping remained.
- Focused Python changed-surface tests: 222 passed.
- Full Python suite: 2241 passed, 5 skipped.
- TypeScript typecheck: passed.
- Focused env-var affected extension tests: 129 passed.
- Drift guard: OK.
- Consumer-bootstrap render + cold-start golden snapshot: 22 passed.
- Playwright Layer 3: 18 passed.
- Local Python package build: produced `dabbler_ai_router-0.26.1.tar.gz` and
  `dabbler_ai_router-0.26.1-py3-none-any.whl` successfully.
- Follow-up extension recheck: `npx tsc --noEmit` passed; focused
  `installAiRouter.test.ts` passed (39 tests).

### Residuals

- Full stub unit suite remains outside CI and still has 2 known unrelated
  failures.
- Existing setuptools package-data warnings remain during `python -m build`.
- Pre-existing dirty guidance files under `docs/planning/` were intentionally not
  included in this release.

### Publish plan

Router `0.26.1` was published to PyPI on 2026-06-20 via tag `v0.26.1` and
release.yml run 27867506784. Push the extension follow-up commit to `master`,
wait for the `Test` workflow to pass, then push tag `vsix-v0.33.1`. The
tag-driven Marketplace workflow requires the green Test run for that commit
before publishing the extension patch.