# S3 verification conventions (read before reviewing)

## Workflow order (do not report the pre-close state as a finding)
This verification runs at **Step 6 of a 10-step session**, BEFORE close-out
(Step 8) — the framework's design, not an omission. At verification time it
is CORRECT and EXPECTED that `session-state.json` says
`status: "in-progress"` for session 3 with `completedAt: null` and
`verificationVerdict: null` (only the blessed `close_session` writer flips
these, after this verification), and that `disposition.json` is authored /
patched incrementally until the loop closes. "The session is not closed
yet" is the definition of Step 6, not a defect. Review the session's WORK —
the code, tests, templates, and docs in the diff. (The same settled point
as the S1 R1/R4 and S2 workflow-order dismissals.)

## Suite baseline — FINAL totals (the ONLY authoritative counts)
- Extension unit suite (`npm run test:unit`): **1350 passing, 0 failing**
  — 37 net-new Set-087-S3 tests (`moduleAuthoring.test.ts` new file:
  validation matrix, scaffold matrix incl. all refusal cases, target
  resolution, picker, flow tests, and the R1-remediation
  classify/invalid-manifest tests; module-targeting suite in
  `sessionGenPrompt.test.ts`; module-aware planImport suite incl. the two
  R1 invalid-manifest tests in `gettingStartedActions.test.ts`;
  MODULE_LINE render in `consumerBootstrap.test.ts`; the form-button test
  in `gettingStartedHtml.test.ts`) plus updated artifact-count/golden
  fixtures. (The 1346 count in earlier log entries is the pre-remediation
  chronology, not a contradiction.)
- `npx tsc --noEmit`: clean. `npm run compile` (esbuild): clean, exit 0.
- `eslint src --ext ts`: **7 pre-existing errors** (6×`no-var-requires`,
  1×`no-regex-spaces`) — the identical pre-existing set S1/S2 recorded;
  this session adds **zero** new lint problems (the new/rewritten files
  lint completely clean, warnings included).
- Layer 1 pytest: **2922 passed, 6 skipped, 0 failed** — including the
  Python cold-start acceptance test consuming the REGENERATED golden
  fixtures (`test-fixtures/cold-start/*` now include the two `.github/`
  teaching templates per tier; regeneration via `UPDATE_GOLDEN=1` is the
  documented, deliberate act the snapshot test prescribes).
- Playwright Layer 3: see the evidence-of-record section below.
- Live dogfood (2026-07-10, this session): a scratch-repo end-to-end run
  drove the REAL `runNewModuleFlow` (scripted UI), the REAL module picker,
  and the REAL prompt builders — **12/12 PASS** (scaffold greeter+clock,
  manifest order round-trip, picker rows + pick, module-stamped
  decomposition prompt, module planning prompt, flow-style-manifest
  refusal honesty).

## UAT gate status (operator-armed)
- The spec declares `requiresUAT`/`requiresE2E: "suggested"`. The operator
  answered the session-start tri-state prompt with **"uat"** (recorded as
  the session-3 `suggestion_disposition` activity-log entry). The armed
  gate is the ad-hoc human UAT checklist; **no E2E gate is armed this
  session** — that is the operator's recorded choice.
- The checklist
  (`087-module-organized-projects-foundations-uat-checklist.json`, 8
  walks) is authored to the Set-078 bar: literal copy-pasteable actions,
  literal-string expectations re-grounded against CURRENT source, and the
  ad-hoc mechanical-verification floor satisfied — every functional item
  carries a `ProgrammaticVerification` naming the exact unit suite and/or
  the live dogfood run that pre-verified it. The human walk covers only
  what automation cannot reach from this shell: the real VS Code UI
  surfaces (input boxes, QuickPick, toasts, the form button).
- UAT runs against the LOCALLY BUILT VSIX
  (`tools/dabbler-ai-orchestration/dabbler-ai-orchestration-0.41.0.vsix`,
  an untracked local artifact) — nothing is published mid-set.
- The checklist is pending the human walk at verification time; pending
  UAT blocks *downstream sessions*, not this verification (Rule 9).

## Interaction / a11y intent (state up front — S2 calibration note)
The new interactive surfaces are **native VS Code widgets** — two
`showInputBox` steps (with live `validateInput`), one `showQuickPick`, and
standard toasts — which carry VS Code's own keyboard/screen-reader
behavior; nothing custom is rendered for them. The ONLY webview DOM change
is one additional `<button>` (secondary style, `title` hover copy) in the
Getting Started form's step 2 — a native, keyboard-focusable button in an
existing form surface. The Explorer's WAI-ARIA tree (S2 scope) is
untouched: no changes to `client.js` tree rendering, `RowPayload`,
`findSetBySlug`, or any action message.

## By-design decisions (routed ruling — do not report as findings)
All ruled by the routed architecture decision saved raw at
`s3-authoring-scaffold-architecture.json` (task_type=architecture;
anthropic excluded after a provider-side 400 ×3 attempts — the S2
precedent — so gemini-pro ruled; auto-verified VERIFIED by gpt-5-4-mini):
- **Q1 — both surfaces**: the `dabbler.newModule` palette command (the
  always-available path; the Getting Started form only renders while a
  repo has zero session sets) PLUS a riderless form button. Slug/title are
  collected host-side via input boxes; the webview posts a bare action.
- **Q1 — append, never re-serialize**: the manifest write is a
  format-preserving append (the operator's comments/formatting survive
  verbatim) guarded by a parse-after-append validation that REFUSES —
  writing nothing and printing the copyable entry block — when the
  appended text cannot land in the `modules:` list (flow-style `[]`,
  `modules:` not the last top-level key, broken YAML). The plan stub is
  written FIRST (an orphan stub is harmless; a manifest entry pointing at
  a missing plan would dangle) and is skip-existing.
- **Q2 — writer-rendered stamp**: generated specs acquire `module: <slug>`
  via the whole-line `{{MODULE_LINE}}` template token
  (VERIFICATION_MODE_LINE pattern) so the decomposition prompt's worked
  exemplar SHOWS the line; a module-less render emits the empty string and
  is byte-identical pre-087 output. A single-module manifest auto-selects
  WITH an operator-visible notice; ≥2 modules QuickPick; Esc cancels the
  whole flow (never a silent repo-plan fallback).
- **Q3 — scaffold-written teaching templates**: `.github/CODEOWNERS`
  (comment-only — inert until adapted) and
  `.github/workflows/monorepo-ci.yml` (its single ACTIVE job is the
  all-module guardrail on push to main with a succeeding echo placeholder,
  so committing it unadapted cannot break a build) are written by BOTH
  scaffold paths, skip-existing. The integration `touches` review rule is
  taught as PROCESS in the CODEOWNERS comments — CODEOWNERS semantics are
  path-based only, so full enforcement is not encodable there (and
  runtime enforcement is explicitly deferred to set 088 by the spec).
- **Q4 — both plan flows module-aware**: `copyPlanningPrompt` and
  `importPlanFromFile` share the same picker and target the module's
  `planPath`; the repo-level (no-manifest) renders are byte-identical
  pre-087. The no-workspace error in `importPlanFromFile` deliberately
  stays AFTER the file dialog to preserve the pre-087 cancelled-dialog
  semantics (quiet false, no error toast) the Set 060 suite pins.

## Known scope boundaries (spec non-goals — not findings)
- **No `codeRoots` scope-check enforcement** and **no ai_router/Python
  changes** — deferred to set 088 by the operator-approved spec.
- **Sets stay flat** in `docs/session-sets/`; the module slug in set names
  is RECOMMENDED, never enforced (spec: "Recommend (not enforce)").
- **`module` is grouping, never identity** — `RowPayload.slug`, action
  messages, `findSetBySlug`, and merge-by-name are untouched on purpose.
- The Getting Started form's D3 `planPresent` completion flag keys on the
  repo-level `docs/planning/project-plan.md` only; a module plan does not
  flip step 2 complete. Surfaced here deliberately: the form is a
  fresh-repo surface, the flag is S060 scope, and redefining it was not in
  this session's plan — recorded in `disposition.deferred`.

## Cross-round issue ledger (a settled point must not reopen)
- R1 (Major, Correctness) "a malformed existing module manifest silently
  disables module targeting — `pickModuleForAuthoring` treated a
  PRESENT-but-invalid docs/modules.yaml like an absent one, so the
  authoring flows silently fell back to repo-level unstamped output":
  **fixed** — `classifyModulesManifest` distinguishes absent / invalid /
  present (lstat-based entry check, so a dangling symlink counts as
  present, matching the S1 reader posture); an invalid manifest now shows
  the shared `INVALID_MANIFEST_MESSAGE` error and ABORTS the flow (new
  `invalid-manifest` outcome, handled by copyPlanningPrompt,
  importPlanFromFile — before its file dialog — and
  copySessionSetGenPrompt); `scaffoldNewModule` reuses the same
  classifier/message. Four new tests pin it (classifier matrix, picker
  abort, both planImport flows); unit suite 1346 → 1350.

## Layer-3 / CI evidence of record
- This session's code commit `66ed06d` runs the full CI matrix (Python
  tests on three OSes, Playwright Layer 3 on windows/macos/ubuntu, drift
  guards, preload ceiling, template snapshot). The run link + status are
  recorded in `disposition.json` and the activity log once complete; the
  local-shell Electron-launch limitation (S1/S2 documented control:
  untouched specs fail at `app.firstWindow` locally) makes the green CI
  run the Layer-3 evidence of record, same as S1/S2.
- Note: the operator-armed gate this session is UAT, not E2E — CI Layer 3
  green is still required by L-064-12 (a webview surface changed), which
  is why it is tracked here.

## Release contract
- Mid-set session: **no version bump, no CHANGELOG entry, no publish** —
  release prep happens at the set-terminal session (S4) per the set spec.
  The 0.41.0 VSIX is a LOCAL UAT artifact only (untracked).
- `dist/extension.js` / `.map` / `dist/templates/**` are the committed
  esbuild outputs (repo policy); their diff is generated, not hand-edited.

## files_changed inventory policy
`disposition.json.files_changed` inventories the full `<pre-session>..HEAD`
diff plus all verification artifacts existing when the inventory is
written. The round currently being run necessarily creates its own
`s3-verification*.md` / `s3-issues*.json` after that; they are appended in
the close-out commit. Do not report the running round's own artifacts as
missing.
