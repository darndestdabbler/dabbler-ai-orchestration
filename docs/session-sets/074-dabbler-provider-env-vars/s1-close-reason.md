# Set 074 Session 1 of 1 - close reason

**Orchestrator:** github-copilot / openai / github-copilot / medium
**Verdict:** VERIFIED (routed `session-verification`, gpt-5-4)
**Release target:** `dabbler-ai-router` `0.26.1` / PyPI tag `v0.26.1`; VS Code extension `0.33.1` / Marketplace tag `vsix-v0.33.1`

## Delivered

1. Renamed built-in provider API key defaults from the generic provider-owned
   names to Dabbler-prefixed names:
   `DABBLER_ANTHROPIC_API_KEY`, `DABBLER_GEMINI_API_KEY`, and
   `DABBLER_OPENAI_API_KEY`.
2. Updated runtime defaults, Windows user-env loading, missing-credential
   diagnostics, CI dummy env vars, extension Full-tier key detection/warnings,
   troubleshoot output, READMEs, user docs, bootstrap templates, cold-start
   fixtures, and tests.
3. Clarified user-facing docs that Dabbler does not issue separate provider API
   keys: users store their normal Anthropic, Google, and OpenAI key values under
   the Dabbler-prefixed environment variable names.
4. Bumped package metadata to `0.26.1` and added the `ai_router/CHANGELOG.md`
   patch-release entry.
5. Added extension `0.33.1` as the Marketplace patch carrying the updated
  installed-extension copy/templates and changed `Dabbler: Update ai-router` to
  force-refresh PyPI installs with `pip install --upgrade --force-reinstall
  --no-cache-dir dabbler-ai-router`.

## Verification

- `npm run compile` regenerated `dist/extension.js` and copied updated templates.
- Exact old-env-var scan across live code/docs found only the intentional
  changelog old-to-new mapping sentence.
- Focused Python env-var/config/verifier tests: 222 passed.
- `npx tsc --noEmit`: passed.
- Focused env-var affected extension tests: 129 passed.
- Drift guard: OK.
- Consumer-bootstrap render + cold-start golden snapshot: 22 passed.
- Full Python suite: 2241 passed, 5 skipped.
- Playwright Layer 3: 18 passed.
- Local `python -m build`: built `dabbler_ai_router-0.26.1.tar.gz` and
  `dabbler_ai_router-0.26.1-py3-none-any.whl` successfully; only the existing
  setuptools package-data warnings appeared.
- Final cleanup recheck: migrate router-config tests 9 passed; drift guard OK;
  template snapshot 22 passed.
- Follow-up extension recheck: `npx tsc --noEmit` passed; focused
  `installAiRouter.test.ts` passed (39 tests).

## Residual risks

- The full stub unit suite still has 2 known non-CI failures unrelated to this
  env-var patch (`configEditor-foundation` VS Code stub surface and
  `notificationsSection` expectation). CI intentionally does not run that full
  stub suite.
- The Python build still emits existing setuptools package-data warnings for
  docs/schemas/scripts, but produces the expected artifacts.
- Pre-existing unrelated planning-doc edits remain outside this release commit.

## Release path

The router patch was published to PyPI on 2026-06-20 via tag `v0.26.1` and
release.yml run 27867506784. Commit and push the extension follow-up, wait for
the `Test` workflow to pass for that commit, then push tag `vsix-v0.33.1` so the
tag-driven Marketplace workflow publishes the installed-extension patch through
the green-Test gate.