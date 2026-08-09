# S2 verification conventions — read before Round 1

> Handed to every verifier round for Set 112 Session 2. Its purpose is to
> keep Round 1 spent on real defects instead of on the agreed baseline
> (project-guidance → *up-front conventions block*).

## What this session is

Set 112 removes the **Lightweight tier** from the Dabbler AI-led-workflow
framework. Session 1 (VERIFIED) removed the router-side half in Python.
**Session 2 — this one — removes the other half: the VS Code extension
surface and the teaching docs.** This is a *removal* set. Its non-goals are
explicit in `spec.md`: no verification-loop changes, no seat-profile
changes, no consumer-repo edits, and **no opportunistic refactors** of files
touched only to delete branches.

The boundary of the removal is `s1-kill-inventory.md`, not the spec's
starting kill list. S2 owns that inventory's buckets E/F/G/H/J (extension
`src` + `media`, extension tests + fixtures, `docs/templates/`, `docs/`
prose, root README/schemas) plus two deferrals S1 named explicitly:
the generated `test-fixtures/cold-start/full/` golden (regenerate from
templates; never hand-edit) and `docs/ai-led-session-workflow.md`'s typed
verification/remediation session procedure, whose writers S1 deleted.

## Suite baseline — all green, no tracked failures

| Suite | Result | Note |
|---|---|---|
| Layer 1 `pytest ai_router/tests` | **3,561 passed, 0 failed, 9 skipped** | The 9 skips are pre-existing and environment-gated, not new. |
| Layer 2 `npm run test:unit` | **1,602 passing, 0 failing, 1 pending** | The 1 pending is pre-existing. |
| Layer 3 `npm run test:playwright` | **33 passed, 0 failed** (9.1m) | Run after the last code change, as the trigger requires. |
| `ai_router/scripts/drift_guard.py` | exit 0 | |
| `ai_router/scripts/tutorial_gate.py` | exit 0 | |

All three are recorded as runs of record for session 2. **There is no known
failing test.** A finding that asserts a suite is red is wrong on its face —
please re-run rather than reporting it.

## By-design exclusions — NOT defects

1. **Archives are not rewritten.** `docs/session-sets/**` and
   `docs/proposals/**` still describe the Lightweight tier in the present
   tense. That is deliberate (spec: "archives readable as history"), and
   Session 3's grep gate exempts both subtrees by construction. Do not
   report tier references there.
2. **Changelogs are records.** `ai_router/CHANGELOG.md`,
   `ai_router/MIGRATIONS.md`, and
   `tools/dabbler-ai-orchestration/CHANGELOG.md` keep their historical
   entries verbatim.
3. **`docs/concepts/tier-model.md` still describes the tier** — on purpose.
   It was rewritten from an SSoT into a *historical note* that opens with a
   RETIRED banner. Archived sets link to it; a 404 would be worse.
4. **`docs/cross-repo-lightweight-removal-notice.md` names
   `tier: lightweight` repeatedly** — it is the migration notice; naming
   what breaks is its job.
5. **`docs/cross-repo-lightweight-notice.md`** (the Set 048 notice that
   *announced* the tier) is a frozen dated record. S2 added a SUPERSEDED
   banner rather than editing its body.
6. **The `test-fixtures/cold-start/full/` directory keeps its `full/`
   name.** It is a path, not a claim that a second tier exists; renaming it
   would ripple into the Python cold-start acceptance test for no gain.
   The comment in `coldStartSnapshot.test.ts` says so.
7. **`--no-router` and `DABBLER_NO_ROUTER` still exist.** The spec retains
   them as CI/hermetic test affordances (Decisions already made, item 2).
   S1 removed their *gate relief*; S2 did not touch them.
8. **Release/version bumps are NOT in this session.** Spec Session 3 owns
   the major-version bump, the CHANGELOG breaking-change entry, and the
   release staging. `package.json` is still `0.49.0` and `pyproject.toml`
   still `0.34.0` deliberately.
9. **The UAT walk is NOT in this session.** The set declares
   `requiresUAT: true` with `uatScope: per-set`; spec Session 3 runs the
   single guided-look walk for the whole set.
10. **The anti-resurrection grep gate is NOT in this session.** It is spec
    Session 3's first deliverable.

## What the evidence bundle EXCLUDES, and why

The full change is 169 files / +3,093 / −14,275, which overruns the
verifier's evidence cap. The bundle you are reading was shrunk **by
dropping content that cannot carry a defect**, never by dropping content
that can. Specifically excluded:

1. **`tools/dabbler-ai-orchestration/dist/`** — build output, regenerated
   by `npm run compile`; never hand-edited. A CI drift guard
   (`check_dist_bundle_in_sync`) proves it byte-matches its source.
2. **`test-fixtures/cold-start/`** — the GENERATED golden tree. It is
   re-rendered from `docs/templates/consumer-bootstrap/` by
   `UPDATE_GOLDEN=1`, and `coldStartSnapshot.test.ts` fails if the render
   and the committed golden disagree. **The templates it is generated
   from are IN the bundle** — review those; the golden is their output.
3. **Whole-file DELETIONS** (`git diff --diff-filter=D`) — 41 files, all
   pure removals with no surviving line. In a removal set the risk lives
   in what *survives*, not in text that is gone. The deleted files are:
   `switchTier.ts`, `setupVerification.ts`, `externalVerification.ts`,
   `tierRewrite.ts`, `verificationModeRewrite.ts`, `tierMarkerStore.ts`,
   `tierLegibility.ts`, eight matching test modules
   (`tierLegibility` / `tierMarkerStore` / `tierRewrite` /
   `verificationModeRewrite` / `setupVerification` / `verificationMarker` /
   `workflowStateLegibility` / `gettingStartedDoc`), and the 26-file
   `test-fixtures/uat-matrix/hello-world-lightweight/` fixture tree.

**Every file with surviving content is in the bundle**, including all of
`docs/`, the templates, the extension `src/` and `media/` edits, the
trimmed test modules, `package.json`, and the CI workflow. If you want to
confirm a deleted module has no dangling caller, note that
`npx tsc --noEmit` is clean and all three suites are green — a dangling
*static* reference is impossible; a dangling *string-keyed* one is exactly
what is worth hunting for, and every file that could hold one is in front
of you.

## Judgment calls this session made (both journaled in `decisions.jsonl`)

Please review these as *decisions*, and say so if you think either is
wrong — but they were made deliberately, not overlooked.

1. **The three Evaluate copy-prompts survive, stripped of a false claim.**
   They (and `docs/templates/consumer-bootstrap/cross-provider-verification.md.template`)
   used to order the reviewing engine to write
   `docs/session-sets/<slug>/external-verification.md`, on the stated
   grounds that the close-out gate reads it. S1 deleted that file's parser
   and both Lightweight close gates, so the mandate had become an
   instruction to produce a file nothing reads — and, worse, implied an
   unverified close could be satisfied by it. The prompts are kept
   (they predate Mode A and are the only in-product way to get a cheap
   second opinion) and reframed as **advisory**. The routed
   `verify_session` round is the verification of record.

2. **The shipped sample project now declares a zero budget.** This one was
   a live break, not a cleanup: `docs/templates/sample-project/`'s spec
   declared `tier: lightweight` (which S1's loader now **refuses**), and
   its honest `verification_method: "skipped"` close no longer had a
   sanctioned home once `--no-router` stopped relieving gates. Both would
   have broken `Dabbler: Try a sample project` for every user. The bundle
   now ships `ai_router/budget.yaml` with `threshold_usd: 0` and a matching
   `verification_method` — the exact mechanism `check_verification_integrity`
   names as the operator-declared exception. Verified end-to-end:
   `sampleProjectSmoke.test.ts`'s "close_session closes cleanly on the
   local-only repo" passes against the working tree's router.

## Where to look hardest

This is a large deletion, so the risk is **omission**, not commission:

- A surviving caller of something deleted (the typecheck is clean and all
  three suites are green, so this would have to be a dynamic/string-keyed
  reference — e.g. a `package.json` command id, a `when`-clause
  `viewItem` regex, a webview `data-` attribute, or a doc-scan test's
  anchor string).
- A doc that still teaches a procedure whose implementation is gone.
  `docs/ai-led-session-workflow.md` is the highest-risk file: it is the
  constitution's on-demand reference for Steps 1 and 6–7, and S1
  explicitly flagged its typed-session procedure as a live trap. It lost
  383 lines here.
- A **claim of current behavior** inherited from prose that was true
  before the removal (lesson L-064-8). Grep the changed docs for
  present-tense assertions about reads/writes/enforcement and check them
  against the code.
- The Getting Started form's remaining shape: with the tier radio gone,
  provider access is the first question, and the budget block nests under
  the Direct-API option. Layer 3's rewritten test asserts the tier fork's
  **absence** with stale `.dabbler/tier` markers on disk (they must be
  inert), and the real first-run walkthrough drives an actual Build
  through the form.

## Severity rubric (grade by CONSEQUENCE)

Probability the stated failure scenario reaches a real user × impact. Low
probability **or** low impact is **Minor**. A finding with no nameable
failure scenario is a **nit**, not a Major. Every blocking finding must
name the exact requirement violated, the concrete impact, and the
evidence; lacking all three, record it as Minor. Semantic equivalence is
not a defect.
