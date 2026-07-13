# Session 1 — Remediation round 1

Fixes the 4 merged Critical/Major findings from discovery round 1
(`s1-issues.json`); the supplementary discovery pass (`s1-verification-round-2.md`)
found nothing new.

## Finding 1 & 2 (both discovery calls, same underlying bug) — Major, Correctness

**"Existing repositories with session sets but no modules manifest are
incorrectly seeded with the Default module."**

The original gate — `result.written.includes(MODULES_MANIFEST_DISPLAY)` —
treated "docs/modules.yaml was just created" as proof the repo is a fresh
scaffold. That's wrong: a legacy repo with real work under
`docs/session-sets/*` but no manifest yet (pre-Set-094 repos, or any repo
that simply never got one) creates the manifest on its first post-upgrade
Build too, and the original code would then seed it with `default` + two
new lifecycle sets — corrupting an established project's numbering and
Work Explorer organization. The spec's contract is explicit: "a repo that
already has modules **or sets** makes no module/set writes"; the fix only
checked the "modules" half.

**Fix:** `scaffoldDefaultModuleAndLifecycleSets` (`gitScaffold.ts`) now
checks `listSessionSetDirNames(projectDir).length > 0` FIRST and refuses
(reporting `ran: false`, changing nothing) whenever the repo already has
any session-set directories — regardless of whether the manifest was just
created. This is a self-contained invariant on the function itself (not
just the caller's gate), so it stays correct regardless of what triggers
the call.

**New tests:**
- `gitScaffoldDefaultModule.test.ts`: "a repo with existing session sets
  but no prior manifest is NOT seeded with Default" (real fs, direct call).
- `gitScaffoldDefaultModule.test.ts`: "without a seam override, a repo
  with pre-existing legacy sets gets no Default" (real writer, full
  `buildProjectStructureNoPrompt` wiring).

## Finding 3 — Major, Completeness

**"The mandatory locally built VSIX dogfood was not performed."**

`s1-dogfood.md`'s original run drove the compiled `buildProjectStructureNoPrompt`
and `moduleAuthoring.js` writers directly (Node, `out/` compiled output) —
one layer below the interactive VS Code command-flow / native dialogs, and
not a literally-packaged `.vsix`.

**Fix (two parts):**
1. **Packaged the real VSIX** (`npx vsce package`) — confirms the exact
   changes this session made (the new `gitScaffold.ts` code, the updated
   `getting-started.md.template` / `start-here.md.template` copy) package
   cleanly into `dabbler-ai-orchestration-0.43.0.vsix` (43 files, 1.34 MB;
   `dist/extension.js` + `dist/templates/consumer-bootstrap/` both
   present and current). Not committed (`.vsix` is gitignored, matching
   every prior set).
2. **Added a genuine Playwright Layer-3 spec**
   (`default-module-scaffold-tree.spec.ts`) that launches the REAL VS
   Code Electron instance (via `--extensionDevelopmentPath`, the same
   compiled `dist/extension.js` the VSIX packages) against a fixture
   seeded with the EXACT shape `scaffoldDefaultModuleAndLifecycleSets`
   produces, and asserts the real webview renders it correctly — this is
   the strongest available evidence that the new scaffold's output is
   correctly understood by the shipping renderer, not just by a unit
   test. Full run: 27/27 (26 pre-existing + this 1 new), 0 regressions.

**Residual, cited rather than silently dropped:** driving the Build
button itself (a real venv + network `pip install`) and the native
rename/delete input-box + confirm-dialog flow through Playwright remain
out of scope, per this repo's OWN pre-existing, documented boundary —
not a decision invented by this session:
- `context-menu-quickpick.spec.ts`'s header: "driving the outer VS Code
  QuickPick from inside a Playwright frame is brittle (the QuickPick
  lives in the workbench root, not in the webview's iframe)."
- `CONTRIBUTING.md`: "The `npm test` script (which uses
  `@vscode/test-electron`) is known broken on Windows 11 + VS Code 1.120."

That interactive layer is covered instead by `renameModule.test.ts` /
`deleteModule.test.ts`'s `preselectedSlug` suites (which DO exercise
`runRenameModuleFlow` / `runDeleteModuleFlow` directly, injecting a fake
UI that skips the real dialogs) and this session's writer-level dogfood
(`s1-dogfood.md`) — the same posture Set 100 S2 recorded for the
identical gap.

## Finding 4 — Major, Completeness

**"Required Work Explorer end-state tests are missing."**

The original test suite asserted file-level scaffold output (manifest
entry, plan stub, spec.md `kind:`/`prerequisites:` content) and the
wiring gate, but never drove the actual tree-rendering model the spec's
Session 1 step 4 names explicitly ("tree shows one declared module with
two pending sets and no pseudo-module").

**Fix:** added a `visibleModules()` helper (`readSessionSets` +
`computeVisibleModules` + `buildVisibleModulePayloads` — the exact
pipeline the Work Explorer's host uses) to `gitScaffoldDefaultModule.test.ts`,
plus:
- "fresh Build: exactly one declared module (default), two pending sets,
  no pseudo-module, both tiers" — drives the real model function against
  real scaffold output for Full AND Lightweight.
- "legacy repo: an empty pre-existing manifest with an unstamped set
  keeps rendering pseudo-Default unaffected" — proves the pseudo-module
  path (Set 091 rules) renders byte-for-byte identically before and after
  a Build re-run.
- The new Playwright spec above additionally proves the same end-state at
  the REAL webview layer, not just the pure model function.

## Suite state after remediation

- Extension unit: 1617/1617 (up from the pre-remediation 1613; +4 new
  tests: 1 real-fs legacy-refusal test, 1 real-writer wiring test, 2
  Work-Explorer tree-model tests).
- `tsc --noEmit`, `eslint` (unchanged 7-error pre-existing baseline),
  `esbuild`: all clean.
- Playwright Layer 3: 27/27 (26 pre-existing + 1 new), 0 regressions.
- `ai_router` pytest: unchanged (no Python touched).
- VSIX packages cleanly (`dabbler-ai-orchestration-0.43.0.vsix`, not
  committed).
