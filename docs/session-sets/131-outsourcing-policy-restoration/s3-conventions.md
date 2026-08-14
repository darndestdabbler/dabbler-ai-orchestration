# Conventions for this round (read before reporting findings)

## What this session is

Set 131 Session 3 of 3, "Rotation, the lever that was never written down" —
the **set-terminal** session.

Sessions 1 and 2 changed code and config: Session 1 lifted a temporary
`outsourcing_mode` pin, replaced Delegation Discipline with a five-rule
precedence order, and added `delegation.direct_work_reason_codes`,
`child_budget` and transport-keyed `thresholds`; Session 2 renamed the catalog
lockfile's `premium_request_weight` to `probe_premium_requests` and prohibited
every reader outside `copilot_catalog.py`. Both are **VERIFIED and committed**.

This session is **documentation and three pointer files**. Its spec-declared
irony budget is *"0 new test functions"* — verbatim: *"A test asserting that
prose exists is the ceremony this repo keeps deleting."* Judge it as prose
against evidence, not as code.

Its job is to write down the measurement that changed this set's conclusion:
**transcript rotation, not model substitution, is the dominant cost lever.**

## What changed in this diff

| file | change |
| :--- | :--- |
| `docs/ai-led-session-workflow.md` | **New canonical section** *"Rotation, and the trade we declined"* (after Delegation Discipline, before the decision-rights rubric). Two small edits inside Delegation Discipline that make the two sections cite each other. |
| `docs/planning/orchestration-strategy.md` | Rotation added as a fourth cost lever beside §2's three currencies, plus one §7 summary bullet. Both point at the canonical section rather than restating it. |
| `AGENTS.md`, `CLAUDE.md`, `GEMINI.md` | The `## Delegation Discipline (pointer)` section replaced with one **byte-identical** block in all three (verified: 1,129 bytes, identical SHA-256). |
| `ai_router/changelog.d/0130-set-131-…md` | The set's single changelog fragment, created through the sanctioned writer (`python -m ai_router.changelog add`), covering all three sessions. |
| `docs/session-sets/131-…/change-log.md` | The set-terminal change log. |
| `docs/session-sets/131-…/s3-next-set-routed.md` | Step 3.5 routed next-set recommendation (gpt-5.5, `anthropic` excluded; router's own verify pass gemini-3.1-pro-preview → VERIFIED, 0 issues). Raw, unedited. |

Session-set bookkeeping files (`activity-log.json`, `decisions.jsonl`,
`session-state.json`, `session-events.jsonl`, `checklist-posts.jsonl`) are
sanctioned-writer output, not hand edits.

## Suite baseline

- **Targeted (A1), run after the last edit: 218 passed, 1 skipped, 0 failed**
  — `test_changelog_partition.py` (the changelog fragment writer and its
  ordering/byte-identity contract), `test_doc_only_cap.py`,
  `test_guidance_preload_manifest.py`, `test_guidance_meta.py`. These are the
  suites whose declared inputs this session's change set actually touches.
- **No test was added, deleted, weakened, or marked xfail.** Zero is the
  spec's declared budget for this session, not an omission.
- The **required portion of the full suite runs at Step 8**, after every
  code-changing stage including any remediation this round produces (test-run
  policy A2). Sessions 1 and 2 each recorded pytest 4490/9, mocha 1455/2, and
  playwright 31/31 for this same set.

## Release contract

Nothing is version-bumped. The `ai_router/changelog.d/` fragment accrues to
`[Unreleased]`; publishing to PyPI or the Marketplace is operator-only and is
not part of any session in this set. `CHANGELOG.md` is deliberately **not**
edited — this repo uses partitioned append files
(`docs/partitioned-append-files.md`), and editing the shared file instead of
writing a fragment would be the defect.

## By-design exclusions — please do not report these as findings

1. **Zero new tests.** Declared in `spec.md` for this session. The claims this
   session makes are historical measurements against a machine-local seat
   store; a test asserting prose exists would not falsify any of them.
2. **No automatic compaction trigger.** An explicit `spec.md` non-goal.
   Rotation is documented, thresholded and contracted, and stays **manual**.
   Shipping a writer that flushes an orchestrator's transcript on its behalf,
   in the same set that first measured the effect, was judged out of scope.
3. **No orchestrator model change, no cost gating, no budget enforcement, no
   new store reads, no VS Code extension surface.** All explicit `spec.md`
   non-goals.
4. **`requiresUAT: false`, `requiresE2E: false`, `pathAwareCritique` absent
   (defaults to `none`).** Nothing rendered changes.
5. **The naive per-model cost table is reproduced in the workflow doc on
   purpose**, immediately above the table that refutes it. That is the stated
   design: a future reader who rediscovers the naive numbers should find them
   already labelled. It is not a contradiction inside the document.
6. **`docs/planning/lessons-archive.md` still contains "Set 110 Session 4"
   text.** The archive is a historical record and is never rewritten.
7. **`docs/planning/lessons-learned.md` is not in this diff yet.** The Step 9
   reorganization review runs after this verification round, per the workflow's
   own ordering, and any guidance change it produces lands afterward.

## Three things I want adversarial attention on

1. **The ~150K rotation threshold is a number I chose, and the spec did not
   supply one.** The spec says the trigger must be "a token threshold, not a
   vibe" and stops there. I derived 150K from the banded measurement for
   `claude-opus-5`: 7.65 credits/inference at 25–75K, 9.76 at 75–150K, then
   17.18 at 150–300K and 35.77 above 300K — i.e. 150K is where the curve
   leaves its plateau. Journaled in `decisions.jsonl` with the alternatives
   (300K, 600K, no number). **Attack the arithmetic and the framing:** is a
   threshold one band *before* the expensive band defensible, given that
   compaction has a fixed cost that is paid more often the earlier you fire?
   I state payback as ~30 inferences at 150–300K and ~13 above 300K, charging
   the full measured 400 credits and noting that a smaller transcript costs
   less to flush. Check those numbers.

2. **The survival contract is unenforced prose.** It lists what must live
   through a flush (bootstrap file, spec + active step, `session-state.json`,
   activity log, open findings with severities, a carry-forward of what was
   tried and rejected) and what must not be assumed to. Nothing checks it. I
   judged a checker out of scope for the set that first measured the effect,
   and the recommendation routed at Step 3.5 independently agrees that a
   "checkable survival contract" belongs in the next set. **If you think an
   unenforced contract is worse than no contract — say so and name the failure
   scenario.**

3. **Byte-identical engine pointers may be the wrong unit of agreement.** The
   three files are supposed to differ *only* in their engine-specific
   bootstrap, and this section had drifted three ways (`CLAUDE.md` and
   `GEMINI.md` still named "Sets 110-112" as a live window; `AGENTS.md` carried
   a compressed variant of the same stale claim; all three pointed at
   "human-tunable thresholds" Session 1 deleted as phantom). I made the block
   byte-identical. **Is triplicated prose the right fix, or does it just
   guarantee the next drift is silent?** The alternative — one shared doc all
   three point at — costs an extra hop at session start, when the engine file
   is the only thing guaranteed to be in context.

Also worth checking, generally: every number in the new section
(`631,304 → 54,119` tokens, `~33–35 → ~3.6–5.0` credits/inference, 400.01
credits, 1,148 inferences, $367.18, the band table, `22.40 / 4.51 / 2.65`,
the 4.7x and ~1.7–2x lever sizes) must agree with `spec.md`, which is the
set's source of record. Any disagreement between the new prose and `spec.md`
is a real finding.

## Severity rubric (L-095-1)

Grade by **consequence**: probability the stated failure scenario reaches a
real user, times impact. Low probability **or** low impact is Minor. No
nameable failure scenario is a nit, not a finding. Please state the concrete
failure scenario for anything you rate Critical or Major.
