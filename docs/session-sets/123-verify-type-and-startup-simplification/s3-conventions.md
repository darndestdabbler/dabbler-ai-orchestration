# Verification conventions — Set 123, Session 3 ("Delete the webview")

## What this session is

The subtraction half of the set. Sessions 1–2 built the replacement setup
path (`ai_router/verify_type.py`: a three-branch resolver whose committed
`project-verify-type.txt` *derives* `transport.profile`; plus the qualified
same-provider verdict). Session 3 removes the surface it replaced.

**Step 2 gated the deletion and passed.** A true cold start (`L-079-3`) was
walked in two fresh `git init` folders holding nothing but `.git` — no
project file, no `AI_ORCHESTRATION_VERIFY_TYPE`, no `router-config.yaml`.
Branch 3 (`--set`) and branch 2 (env default + one `--confirm`) both reached
a committed answer purely in the terminal, and the committed file overrode a
deliberately disagreeing configured profile in both directions. No webview
was needed at any point, so the deletion was earned before it was made.

## The one scope change, and why it is not drift

The spec's step 3 names `configEditor/` (2,671), `wizard/` (583) and
`dashboard/` (322) as "the Getting Started / setup webview". Verified against
the code, that identification is a **measurement error**, in three ways:

1. `wizard/` makes **zero** webview API calls — it is 16 QuickPick/InputBox
   calls behind `Import Project Plan` and two prompt generators.
2. `configEditor/` exports `annotationParser` + `yamlReadWrite` to the
   **surviving** `dabbler.scanAnnotationsForActiveSet` command.
3. The **actual** setup webview — `SetupStatusView.ts`, `systemStatus.ts`,
   `gettingStartedActions.ts`, `gettingStartedDetection.ts`, the protocol
   module and `media/session-sets-tree/*` (~2,459 lines) — is never named in
   the spec, yet it is precisely what the 8 retired Layer 3 scenarios drive.

The spec's letter would therefore have left the setup webview alive while
deleting three unrelated palette commands. This was escalated (it is a
product-value call, not a mechanical one) and the **operator ruled**: delete
every actual webview *plus* `wizard/`, accepting the loss of Import Project
Plan and the two prompt generators. Journaled to `decisions.jsonl` with
`authority: human` and the attestation. **Do not re-litigate the scope.**

Shared library code that surviving commands depend on was **relocated, not
deleted**: `annotationParser` + `yamlReadWrite` → `utils/`,
`providerKeyPresent` → `utils/providerKey.ts`, and
`types/sessionSetsWebviewProtocol.ts` → `types/explorerPayloads.ts` stripped
to the row/bucket/module payload shapes `SessionSetsModel` still builds.

## Test baselines — these are the agreed numbers, not defects

| suite | result | notes |
| :--- | :--- | :--- |
| Layer 3 Playwright | **31 passed / 0 failed, 4.9 min** | exactly the count the spec predicts (39 − 8) |
| Layer 2 stub-mode (`npm run test:unit`) | **1470 passing, 2 pending, 0 failing** | fully green |
| Layer 2 Electron (`npm test`) | 1436 passing, **32 failing** | **all 32 pre-existing.** Verified by stashing the session's work and running HEAD: baseline is 32–33 failures, and a name-by-name diff shows **zero new** failures. Cause is VS Code 1.132.1 making `workspace.workspaceFolders` getter-only, which breaks a test helper that assigns it; two others are EPERM/ENOENT env issues. Not this session's to fix. |
| pytest (targeted) | 20 passed | `test_cold_start_acceptance.py` + `test_verify_type_resolution.py` |

Full pytest runs once at close, after code freeze, per the constitution's
Step 8 ordering (never before verification, which can change code).

## Counting the Layer 3 retirement — the spec was right, its per-file split was not

Re-derived from `npx playwright test --list` rather than trusted:

- retired: `getting-started-surface` (4), `overlay-click-swallow` (1),
  `loading-state` (1), and **2 of 3** in `system-status` = **8**
- **preserved by relocation**: the third `system-status` scenario (the broken
  `docs/modules.yaml` → `TreeView.message` diagnostic) drives **no webview**
  at all and is the falsifier Set 110 S3 shipped for an assigned residual.
  Deleting it with its file-mates would have removed live coverage of a live
  surface, so it moved to `manifest-diagnostic.spec.ts` under a name that says
  what it tests.
- The spec classed `loading-state` as surviving "harness baseline" and all 3
  `system-status` scenarios as webview. Both are wrong on the evidence; the
  two errors cancel, so the spec's predicted **31** is still the right number.

`vsix-first-run-walkthrough.spec.ts` is **rewritten, not retired** (Build now
goes through `Dabbler: Set Up New Project` instead of the deleted form). The
real network `pip install` is **kept** — a decision, not an inheritance: it is
the provisioning step the spec exists to prove, and trimming coverage in the
same session that retired 8 scenarios would compound a reduction.

## By-design exclusions — please do not report these

- **`tools/dabbler-ai-orchestration/dist/**` is generated build output**
  (esbuild bundle + map). It is committed in this repo by existing convention
  and is excluded from the evidence bundle. Do not review it.
- **Seven large PURE DELETIONS have their bodies excluded** so the bundle fits
  the verifier's context window honestly rather than being truncated at the
  boundary with no signal. Every one is `D` in `git status --short`, which is
  in your bundle, so the *fact* of each deletion is visible — only the removed
  text is withheld:

  | file | ~size |
  | :--- | ---: |
  | `src/configEditor/ConfigEditorPanel.ts` | 58 KB |
  | `src/test/suite/gettingStartedActions.test.ts` | 43 KB |
  | `src/test/suite/gettingStartedHtml.test.ts` | 33 KB |
  | `media/session-sets-tree/gettingStartedHtml.js` | 22 KB |
  | `media/session-sets-tree/client.js` | 16 KB |
  | `src/test/suite/schemaValidator.test.ts` | 16 KB |
  | `src/test/suite/patch.test.ts` | 14 KB |

  These are all operator-approved deletion targets, and the question worth
  asking about them — *did anything surviving depend on this?* — is answerable
  from the surviving code, which IS fully in the bundle. Every file that was
  modified, relocated, or rewritten is included in full.
- **Historical records are deliberately untouched**: `docs/session-sets/**`,
  `docs/proposals/**`, both `CHANGELOG.md` files' existing entries, and the
  one-off `scripts/verify_session_0*.py` (pinned to versions long superseded).
  These record what was true then. Only *live* documentation was swept.
- **Pre-existing eslint errors** (`no-var-requires`, `no-control-regex`) in
  test files this session did not author. Lint is not in CI.
- The extension version is **not** bumped and the CHANGELOG entry is authored
  at close; publishing is operator-only and out of scope for this session.

## What is worth your attention

1. **Reachability.** Session 2's findings were all "the machinery is correct
   and unreachable". The mirror risk here is a deletion that leaves a
   dangling reference no compiler catches — a `require()` string, a
   `readFileSync` of a deleted asset, a JSON path, a doc that still tells a
   user to click something that no longer exists.
2. **Did anything surviving lose its backing?** Every relocation is a chance
   to have moved a symbol but missed a caller.
3. **Tests that were re-expressed rather than deleted.** Several Layer 2
   tests asserted against deleted surfaces and were rewritten to assert the
   same invariant against the surviving one. Check each still *falsifies*
   something rather than having become vacuous — an assertion that can no
   longer fail is worse than a deleted one, because it reads as coverage.
