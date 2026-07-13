# Remediation notes — round 1 (discovery, 2 findings / 2 distinct, both Major)

- **The decomposition template instructed hand-authoring `session-state.json`
  for newly authored child sets, contradicting "state files are the blessed
  runtime writers' job" (discovery call 1):** the `Sessions` step 2 of
  `docs/templates/consumer-bootstrap/module-decomposition-set.spec.md.template`
  (and, before the fix below, the equivalent inline literal in
  `renderModuleDecompositionSetSpec`) told an AI decomposing a plan into new
  session sets to write both `spec.md` **and** `session-state.json` for each
  child. That directly contradicts this same session's own
  `scaffoldModuleLifecycleSets` posture (spec.md only — state files are the
  blessed runtime writers' job, per `start_session`'s documented ability to
  bootstrap `session-state.json` from a spec's `totalSessions` field) and
  risked hand-invented or stale lifecycle state colliding with
  `start_session`/registration on every generated child set. **Fixed:**
  reworded the template's step 2 to author only `spec.md` per child set and
  explicitly forbid hand-authoring `session-state.json`, naming the
  blessed-writer bootstrap contract instead. Pinned with a new assertion in
  `moduleAuthoring.test.ts` ("decomposition-set spec parses with kind:
  decomposition and a prerequisites cross-link") checking the corrected
  guidance text is present, so this cannot silently regress.

- **The two render functions embedded template text as hand-synced TS
  literals instead of rendering the actual checked-in template files, so a
  future edit to either `.template` file would drift from generated output
  with no test to catch it (discovery call 2):** `renderModulePlanSetSpec`
  and `renderModuleDecompositionSetSpec` returned inline template-literal
  strings; nothing in production or test code ever read
  `module-plan-set.spec.md.template` /
  `module-decomposition-set.spec.md.template` off disk, so the two "sources
  of truth" the earlier design intentionally kept were purely
  hand-maintained parity with no verification. **Fixed:** both render
  functions now load and `{{TOKEN}}`-substitute the real on-disk template
  files via a new `resolveModuleLifecycleTemplatesDir()` resolver (mirrors
  `consumerBootstrap.ts`'s bundle-directory precedent — one candidate for
  the packaged extension's `dist/templates/consumer-bootstrap` esbuild copy,
  one for the checked-in `docs/templates/consumer-bootstrap` repo copy,
  both the same directory depth below the extension root so `src`, `out`,
  and `dist` callers all resolve correctly), plus a fail-loud
  unsubstituted-token guard. Added a parity test
  ("renders are a token-substitution of the checked-in template files
  (single source of truth)") that independently reads the two `.template`
  files and asserts the render functions' output matches a hand-rolled
  substitution of them exactly — the templates are now the actual rendered
  source, not documentation to keep manually in sync.

Suite after remediation: extension unit 1534 passed (1533 pre-remediation +
1 new parity test); `tsc --noEmit` clean; `eslint` clean (same one
pre-existing `any` warning, unrelated to this session); esbuild rebuild
confirms the corrected `module-decomposition-set.spec.md.template` is what
ships in `dist/templates/consumer-bootstrap`. `ai_router` pytest and
Playwright Layer 3 untouched by this remediation (no `ai_router/` or
webview-rendering files touched — both fixes are confined to
`moduleAuthoring.ts`, the two `.template` files, and the test suite).
