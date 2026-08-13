You are an adversarial code-and-docs reviewer with **full read access to this
repository** (repo root: the current working directory). A session set
(**Session step skeleton and test ordering**, slug
`128-session-step-skeleton-and-test-ordering`) has just finished its
implementation work and is about to close. Your job is to find what is
**wrong, risky, incomplete, or internally inconsistent** in its changes —
across code, tests, and documentation — **before** it ships. Be a genuine
devil's advocate: assume the work is flawed and try to prove it. A
rubber-stamp is a failure.

**Anti-bias instruction (load-bearing).** Do **not** rely on my summary below.
**Open and read the actual files yourself** and reason from what is on disk.
Where my description and the code/docs disagree, **the repository wins** — call
that out explicitly. Pull ground truth; do not trust a flattering paraphrase.
In particular, for every claim of *current behavior* (what a function reads,
writes, enforces, or defaults to; what a test asserts; what a doc says the code
does), verify it against the actual file before accepting it.

## What this set changed (my summary — verify it, do not trust it)

The set has three sessions. Sessions 1 and 2 are closed and VERIFIED; Session
3 is the set-terminal session and is what this critique is primarily about,
though the whole set is in scope.

**The problem.** The repo's canonical test/verify ordering is *targeted tests
→ verify → remediate → full suites → close*. A spec could compress three
canonical stages into one numbered step — e.g. `5. Full pytest and the Layer 3
run recorded as runs of record; verify; close.` — in the wrong internal order,
where nothing could check it. That shape caused a 15-run / 186-minute incident
(Set 112 S3) and a repeat (Set 127 S2).

**Session 1 (Component B — the shape).** Added `check_step_shape` to
`ai_router/spec_admission.py` beside the existing step-count check. Every
session must declare: step 1 `Register`, then N authored work steps, then a
fixed 3-step tail (`Cross-provider verification`, `Required portion of the
full test suite`, `Close-out`). Recognised by *intent*, not exact prose.
Operator-ratified: `N = 3` work steps (so 7 declared steps), and the shape
verdict is **blocking for unstarted sets**, an **informational note** for
started/complete/cancelled ones. `authoring.max_steps_per_session` went 5 → 7,
derived as `CEREMONY_STEPS + WORK_STEP_BUDGET`.

**Session 2 (Component A — the rules).** Wrote A1–A4 into
`docs/session-constitution.md` and `docs/planning/session-set-authoring-guide.md`,
and mechanized A4 as `ai_router/post_round_delta.py`, which classifies the
delta since the session's recorded verification round as
`no-change` / `test-only` / `shipped-code` / `unknown`. A4.1: a post-suite fix
touching only test surfaces owes no re-verification. A4.2: one touching
shipped code owes a delta-scoped `--phase remediation-review`.

**Session 3 (this session).** Re-authored the four *unstarted* specs so the
blocking check refuses none of them:

- `118-test-retirement-and-coupling-budget` — the **substantive** half.
  Restructured to the skeleton, its measurements **re-read** rather than
  restated, and its retirement rule restated in terms of A1 / A3 / A4.
- `113-narrated-video-walkthroughs`, `121-guidance-becomes-executable`,
  `122-module-lifecycle-to-python` — the **mechanical** restructuring.
- Retired `docs/planning/session-step-skeleton-and-verification-cost.md` from
  "diagnosed, not fixed" to fixed, naming Set 129 as A5's owner.
- Authored `change-log.md` and added 2 new test functions.

## Files changed (read these; do not stop at the ones I emphasize)

Session 3 (uncommitted working tree):
- `docs/session-sets/118-test-retirement-and-coupling-budget/spec.md`
- `docs/session-sets/113-narrated-video-walkthroughs/spec.md`
- `docs/session-sets/121-guidance-becomes-executable/spec.md`
- `docs/session-sets/122-module-lifecycle-to-python/spec.md`
- `docs/planning/session-step-skeleton-and-verification-cost.md`
- `ai_router/tests/test_spec_admission_shape.py` (2 new test functions)
- `docs/session-sets/128-session-step-skeleton-and-test-ordering/change-log.md`
- `docs/session-sets/128-session-step-skeleton-and-test-ordering/decisions.jsonl`

Shipped earlier in the set (already committed, still in scope):
- `ai_router/spec_admission.py`, `ai_router/tests/test_spec_admission_shape.py`
- `ai_router/post_round_delta.py`, `ai_router/run_of_record.py`,
  `ai_router/verify_session.py`, `ai_router/verification_stamp.py`,
  `ai_router/close_backstop.py`, `ai_router/router-config.yaml`
- `docs/session-constitution.md`,
  `docs/planning/session-set-authoring-guide.md`,
  `docs/guidance-lifecycle.md`

Use `git status --short` and `git diff` to see the working tree, and
`git log --oneline -6` for the committed sessions.

## Load-bearing claims to check against the code (prove or disprove each)

1. **The A4.1 / test-deletion collision is real as described.**
   `ai_router/run_of_record.py::classify_changed_paths` decides "is this path
   a test" by **path prefix alone** — it does not distinguish an edited test
   from a **deleted** one and does not check the path still exists. Therefore
   `post_round_delta.classify_delta` would classify a post-suite *test
   deletion* as `test-only`, and A4.1 would report that nothing is owed —
   even though Set 118's own Session 2 rules that retiring a test **is a
   verification reduction** under the constitution's hard carve-out. Verify
   this reading against the actual code. Then judge whether 118's remedy is
   adequate: a hard ordering constraint ("the retirement pass lands before
   verification, never after the full suite") carried in the *attested
   record*, plus an anti-pattern entry and an end-of-set deliverable. Is
   there a hole this leaves open? Is the claim overstated or understated?

2. **The Set 118 re-read measurements are honest and reproducible.** The
   claim is that the counters were validated by reproducing 118's original
   2026-08-10 row exactly at commit `8fda8d85` (124 test files / 3,345 test
   functions / 60,188 test LOC) before being run at HEAD (133 / 3,513 /
   67,182). And that the **coupling** figure did *not* reproduce: 43 files /
   1,294 tests under 118's literal prose detector (`Path(__file__)`,
   `parents[N]`, a repo-root constant), 48 / 1,497 under a bare `__file__`
   reading, against a stated 47 / 1,485. Check the numbers you can check.
   Does the re-read section overclaim from a 3-day window (it reports
   +56 test functions/day against a cited +29/day)? Is the ratio claim
   (0.99, inside a measured 0.91–1.04 band) consistent with the numbers
   printed beside it?

3. **The mechanical restructurings dropped no authored content.** Two of the
   fourteen sessions had real work inside the compressed ceremony step:
   `113` Session 4 (the set's own dogfood UAT, and "reserve the follow-on
   sets") and `121` Session 2 ("Argue N and the cap from data"). The claim is
   that 113 S4's content was folded faithfully (follow-on-set reservation
   into step 4, the dogfood UAT into close-out) so it lands at 7 steps, while
   121 S2 was **not** folded and instead declares a `sessionSizeException` at
   8 steps. Read the diffs. Was anything silently lost, reordered, or
   weakened? Are the progress keys still all covered by a step?

4. **The `sessionSizeException` on 121 S2 is legitimate, not a dodge.** Set
   128's own spec asserted "no `sessionSizeException` is owed anywhere" and
   instructed Session 3 to "re-measure rather than trust that sentence." The
   claim is 13 of 14 sessions needed none and one genuinely did. Verify the
   step counts yourself (`python -m ai_router.spec_admission --all --check`).
   Is the exception's stated reason accurate, and does `spec_admission`
   actually honour it?

5. **The retired planning note is honest.**
   `docs/planning/session-step-skeleton-and-verification-cost.md` should now
   carry a FIXED status naming the three closing sessions, an inline
   RESOLVED/OWNED marker at every previously-open question (A4's journalling,
   the `N` budget, the refuse-or-warn question, A5's ownership by Set 129,
   the Set 118 recommendation), and stale claims of *current* behaviour
   should be marked rather than left reading authoritative. Is any RESOLVED
   marker claiming something that did not actually happen? Cross-check each
   against the code and `decisions.jsonl`.

6. **The 2 new tests are falsifiable, not decorative.** In
   `ai_router/tests/test_spec_admission_shape.py`, class
   `TestTheUnstartedCorpusStaysConforming`. One scans the real repo corpus
   and asserts no unstarted spec requires restructuring; the other plants the
   Set 127 S2 compressed shape into a temp repo root and asserts the same
   discovery+check path reports it. Do these actually exercise what they
   name? Could the corpus test pass vacuously (e.g. if `_discover_specs`
   returned nothing, or if `restructuring_required` were always empty)? Is
   the second test a genuine both-directions falsifier per `L-112-1`?

7. **`change-log.md` is accurate.** Every factual claim in it (round counts,
   finding counts, test counts, what shipped in which session) should match
   the artifacts on disk (`s1-*`, `s2-*`, `s3-*`, `decisions.jsonl`,
   `session-state.json`, `disposition.json`). Flag any number it states that
   the record does not support.

## Known and deliberate — do NOT report these as defects

- **This session ships almost no production code by design.** Its declared
  deliverable is four re-authored specs, one retired note, and
  `change-log.md`. The spec's stated irony budget is **2 new test
  functions**; exactly 2 were added.
- **`spec_admission --all --check` still exits 1**, reporting 49 sessions
  over the step cap. Those are all in **started/complete** sets and are
  explicitly out of scope per Set 128's spec ("No retrofit of existing specs'
  step text ... their sessions are closed"). No CI job invokes
  `spec_admission`. The metric that matters is `0 unstarted spec(s)
  requiring restructuring`.
- **The four re-authored sets are not executed here** — they stay
  `not-started`. This session edits their specs only.
- **A5 (how "the required portion" resolves per module) is deliberately
  unanswered**; the operator assigned it to Set 129.

## What to attack

1. **Correctness.** Logic errors, wrong conditionals, off-by-one / index
   miscounts, mishandled edge cases, fail-open/fail-closed mistakes, ordering
   bugs. Name the exact file and line.
2. **Contract / cross-artifact drift.** A schema, validator, doc, and test
   that are supposed to describe the same contract but disagree. A doc
   claiming a behavior the code does not implement (or vice versa).
3. **Completeness.** A claimed deliverable with no actual implementation, a
   wired-but-untested path, a stated invariant nothing enforces.
4. **False confidence.** A test that passes without exercising the behavior
   it names; a "VERIFIED" claim the evidence does not support.
5. **Anything unforeseen** — hidden coupling, a wrong default, a stale
   reference, ASCII/encoding hazards on Windows `cp1252`.

## Materiality — the "so what?" gate

Be adversarial, **not** a nitpicker. A correct, complete change **should**
come back `VERIFIED` — that is the right verdict when you genuinely tried to
break it and could not. **Manufacturing a Minor finding just to avoid a clean
verdict is itself a false-positive failure.**

Before you report any **blocking** finding (Critical or Major), it must clear
the three-part "so what?" test — state all three in the Description:

1. **Violation** — the exact requirement, contract, or claim that is broken
   (quote it).
2. **Impact** — the concrete consequence: what breaks, for whom, or which
   merge decision it changes.
3. **Evidence** — the ground truth you read on disk that proves it.

A finding that cannot produce all three is a **nit, not a blocker**.

## Severity anchoring

- **Critical / Major** — block. Major = a defect that would change a
  reasonable reviewer's merge decision.
- **Minor** — real but immaterial; does not block.
- **Plausible-path-to-harm escalation:** to call something Minor you must be
  confident there is no plausible path by which it leads to a Major/Critical
  failure. When in doubt, escalate.

## Output format

Begin with a one-line **VERDICT**: `VERIFIED` or `ISSUES_FOUND`. Then:

- If `VERIFIED`: 1–3 sentences on **what you actually read** (which files,
  which claims you checked) and why you are confident. A bare "looks good" is
  a failed review.
- If `ISSUES_FOUND`: a **Findings** list, each with **Severity**,
  **Category**, **Location** (`file:line`), **Evidence paths** (MANDATORY,
  repo-relative, the files you actually opened — a finding whose evidence is
  entirely `.md`/`.txt` is recorded as a Minor nit), and **Description** (the
  three-part "so what?" plus the concrete fix).

### NITS (optional, non-blocking)

- **Nit:** [observation] (`file:line` if useful)

Do NOT re-do the work. Only evaluate what was produced. Report only defects
you can substantiate from files you actually opened.
