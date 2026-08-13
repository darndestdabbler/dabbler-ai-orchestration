# Conventions — Set 129, Session 2 of 2

Read this before the diff. It states the baseline, the release contract,
and the by-design exclusions, so a round is not spent on the agreed
starting position (L-064-10).

## What this session is

**Set 129 Session 2 of 2: "A5 answered, and the apparatus refused."** The
deliverable is **doctrine and record**, not mechanism. Session 1 shipped
the executable half (`affected_suites()`, `load_suites_checked()`, the
re-derived `covers` declarations, ten falsifiers) and closed VERIFIED
after five rounds. This session writes the answer down where an author
will meet it, records what was refused so it is not re-proposed, retires
the question in its owning note, and authors the changelogs.

The spec's Session 2 plan (`spec.md` → *Session 2 of 2*):

1. Register.
2. Write A5's answer and the corrected safety claim into the authoring
   guide, beside A1–A4. Carry the replacement wording verbatim, and say
   why the stronger version is refused.
3. Record the refusals so they are not re-proposed, and retire the
   question: eight rejections with reasons and six deferrals with
   **trigger conditions** (`verdict.md` §6–§7) land where a future author
   will meet them; close A5 in
   `docs/planning/session-step-skeleton-and-verification-cost.md`; author
   `change-log.md`.
4. Cross-provider verification.
5. Required portion of the full test suite.
6. Close-out, including the Step 9 guidance review.

**Progress keys:** `a5Answered`, `claimCorrected`, `refusalsRecorded`,
`noteClosed`.
**Declared irony budget: 2 new test functions.** *"The deliverable is
documentation; Session 1 owns the executable half."*

## Source of record

`docs/proposals/2026-08-12-multi-module-retesting/verdict.md` is
authoritative for what was adopted, rejected and deferred. It judges
`proposal.md` (operator-supplied) against two independent routed reviews
(`gpt-5.6-sol`, `gemini-3.1-pro`). **Read the verdict before the
proposal.** Two of the proposal's load-bearing claims are false in this
repo, and a reader who meets the proposal first will assess this session
against the wrong target.

Do not re-litigate the verdict's decisions. This session's job is to
**record** them accurately, not to re-derive them. A finding that the
verdict is wrong is out of scope; a finding that this session
*misreports* the verdict is exactly in scope.

## Suite baseline

| suite | baseline at Session 1 close | tracked failures |
| :--- | :--- | :--- |
| Layer 1 `pytest` | 4349 passed, 9 skipped, 0 failed (713.4s) | none |
| Layer 2 `mocha` (`npm run test:unit`) | 1450 passing, 2 pending, 0 failing (187.7s) | none |
| Layer 3 `playwright` | 31 passed, 0 failed (374.6s) at `--workers=2` | none |

**Layer 3 must be run at `--workers=2`,** the CI worker count. The
4-worker local default starves the Electron launches and times out
`vsix-first-run-walkthrough`; that is the parallel-load flake Set 122
recorded on this box, not a regression, and it reproduces across Sets
123/124/127/128.

Per A1/A2 the **full** suites have not been run yet and must not be: they
belong at Step 5, after every code-changing stage (this verification and
any remediation) is finished. Targeted runs only, so far —
`test_guidance_preload_manifest`, `test_guidance_meta`,
`test_guidance_report`, `test_changelog_partition`, `test_drift_guard`,
`test_doc_only_cap`, `test_step_status_drift`: **97 + 294 passed, 1
skipped, 0 failed** after the fix described below.

## The one code change, and why it is here

This session is documentation **except** for one test-only fix, and it
was not planned — it was forced by the session's own changelog fragment.

`test_drift_guard.py::test_changelog_round_trip_flags_a_planted_reorder`
plants a fragment reorder and asserts the CI gate fires. It selected
`cl.load_fragments(...)[0]` and `[1]` — the two **newest** fragments.
`changelog.check()` deliberately re-renders from the **baseline**
(pre-partition) fragment set alone, so reordering two post-partition
contributions is not a violation at all; it is the hand-slotting the
order gap exists for. The falsifier therefore only fired while at most
one post-baseline fragment sat above the frozen corpus. Adding this
set's own fragment (`0110-…`) made it two, and the plant stopped firing.

The falsifier now selects from the baseline corpus and asserts that
corpus is non-empty (L-112-1: assert the input set, not just the
verdict). The sibling falsifiers in `test_changelog_partition.py` already
select this way via a `baseline_fragments()` helper whose docstring names
this exact hazard; the drift-guard copy did not (L-069-1).

**The gate itself is unchanged and was never wrong.** Only the falsifier
was passing for the wrong reason.

## By-design exclusions — not findings

- **No production code changes.** `ai_router/run_of_record.py`,
  `gate_checks.py` and the suite declarations are Session 1's work,
  already VERIFIED across five rounds; they are untouched here and are
  not in this diff.
- **Session 1's decisions are settled.** The nine Major findings of
  Session 1 were all accepted and fixed, and its remediation sidecars
  (`s1-remediation-round-*.md`) are raw records. Nothing in this session
  reopens them.
- **`pathAwareCritique` is deliberately absent** from the spec's config
  block (default `none`). Rationale is in the spec: Sets 118 and 128
  armed it because they **reduced** verification; this set reduces none —
  it makes an existing obligation explicit, adds a fail-closed path, and
  authorizes no new skip. Its absence is a declaration, not an omission.
- **`requiresUAT: false`, `requiresE2E: false`.** No UI surface; Layer 3
  is untouched in content. (Layer 3 is nonetheless *owed* at Step 5,
  because Session 1 declared `ai_router/` one of its inputs and this
  session writes `ai_router/changelog.d/0110-…`. That is the stronger
  `covers` definition binding its own author, and it is intended.)
- **`docs/planning/` prose is not a declared suite input** and
  deliberately so (Session 1's module docstring says why: `cite_lessons`
  rewrites lesson trailers there in the final commit, after the run of
  record). Edits under `docs/planning/` therefore do not stale a run.
- **Preserved historical prose.**
  `session-step-skeleton-and-verification-cost.md` is a diagnosis record
  whose own header says the surrounding text is preserved as written on
  2026-08-12 and is **not** a description of current behaviour; every
  resolved item carries an inline `RESOLVED` marker above the preserved
  text. A5 follows that convention exactly. Text below the marker that
  still reads "unanswered" is the preserved diagnosis, not a stale claim.
- **The version is not bumped and no registry publish happens here.**
  Release is an operator-only, irreversible action. The changelog
  contribution is a **fragment** in `ai_router/changelog.d/`, never an
  edit to `CHANGELOG.md` — that file is not an append target
  (`docs/partitioned-append-files.md`).

## What to review hardest

1. **Does the authoring guide's A5 actually answer A5?** The three
   sub-questions are in
   `session-step-skeleton-and-verification-cost.md` → A5. An answer that
   reads well but leaves a sub-question unanswered is a Major.
2. **Is the corrected safety claim carried verbatim,** and is the reason
   for refusing the stronger version stated in terms of the operator
   attestation, not merely "it is imprecise"?
3. **Are all eight refusals and all six deferrals present, with reasons
   and trigger conditions respectively?** Count them against
   `verdict.md` §6 and §7.
4. **Does anything claim current behaviour that the code does not do?**
   (L-064-8 — this is a documentation session, which is exactly where
   that class lives.) In particular: `run_of_record affected`'s flags,
   `SUITE_FIELDS`' contents, and what `check_test_run_fresh` blocks on.
5. **Consistency across every echo** (L-065-1, promoted): the guide, the
   constitution, the diagnosis note, the module recommendation, the set
   change log, and the changelog fragment must not disagree.

## Severity rubric

Grade by **consequence**: probability the stated failure scenario reaches
a real user × impact. Low probability **or** low impact is Minor. A
finding with no nameable failure scenario is a nit. Documentation-only
findings are capped per `doc_only_cap` unless they cause a wrong action.
