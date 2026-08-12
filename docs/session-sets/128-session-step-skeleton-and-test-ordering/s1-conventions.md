# Session 1 verification conventions — Set 128, Session 1 of 3

Read this before the change set. It states the agreed baseline so a round
spends its findings on real defects rather than on the things already
settled here (L-064-10).

## What this session was asked to do

Spec: `docs/session-sets/128-session-step-skeleton-and-test-ordering/spec.md`,
**Session 1 of 3: The shape a session declares**.

The set fixes the **shape a spec is allowed to declare its steps in**,
then (Session 2) writes the ordering rules into that shape, then
(Session 3) re-authors Set 118 under both. Session 1 is Component B only:
the skeleton, the `spec_admission` shape check, its falsifiers, and the
re-baselined budget. **The ordering rules themselves (A1–A4) are Session
2's deliverable and are deliberately absent here.**

## The problem, precisely

The canonical order — targeted tests → verify → remediate → full suites →
close — already lived in `docs/session-constitution.md` Steps 5/6/8, and
was violated anyway. Set 127 Session 2's spec compressed three canonical
stages into one numbered instruction, in the wrong internal order:

```
5. Full pytest and the Layer 3 run recorded as runs of record; verify; close.
```

The orchestrator followed the spec's letter over the policy that outranks
it: a 752-second pytest run and a 350-second Playwright run, both taken
before a verification round that returned a blocking finding, so both
were staled by the remediation that followed. Set 112 S3 had done the
same thing into 15 runs and 186 minutes (fixed by Set 116 S3). Session 1
of that same spec got it right, so this is not ignorance of the policy —
it is **compression**, three stages inside one step whose ordering is
stated in a sentence where nothing can check it.

Source of record:
`docs/planning/session-step-skeleton-and-verification-cost.md`, raised by
the operator on 2026-08-12 during Set 127 S2.

## The two decisions this session was not allowed to take alone

Both were journalled to `decisions.jsonl` at registration, **before any
implementation**, with `authority: "human"` and the rejected alternatives
recorded:

1. **The work-step budget `N`.** Ratified **N = 3** (7 declared = 4
   ceremony + 3 work). The operator's own opening suggestion of N = 4 was
   put to them beside it and rejected as a deliberate loosening rather
   than an artifact of re-counting. Carrying 5 over unchanged was the
   third option and was also rejected.
2. **What the check does to the existing corpus.** Ratified: **blocking
   for a set that has not started, an informational note for the rest.**
   Advisory-everywhere and blocking-everywhere were both put and
   rejected; silent grandfathering was excluded by the source-of-record
   note and not offered.

Two operator wording rulings are part of ratification 2 and are load-bearing:

- The blocking verdict is **"requires restructuring"**, never "refused".
- The note on already-started sets is **not a warning**: *"It was a
  different time and a different approach. Leave it at that."* The
  report says the spec predates the skeleton and stops. A finding asking
  for a warning, a severity, or a remediation instruction there is
  asking this session to overturn an operator ruling.

**A finding that re-opens either ratified choice is out of scope.** A
finding that the *implementation* does not match what was ratified is in
scope and welcome.

## The change set, in one paragraph

`ai_router/spec_admission.py` gains `check_step_shape()` beside the
existing count check, reading the step texts the module already parses
(no second parser — L-069-1). It asserts step 1 registers and the last
three are cross-provider verification → required portion of the full test
suite → close-out, each naming exactly one stage. `resolve_set_status()`
reads the set's own `session-state.json` to decide blocking vs note.
`DEFAULT_MAX_STEPS` becomes `CEREMONY_STEPS + WORK_STEP_BUDGET` (4 + 3 =
7) and `router-config.yaml` follows. The rest is 12 falsifier functions
(19 cases) and documentation: the authoring guide's new *step skeleton*
section, its re-baselined *session-size cap* section, the spec template
snippet, and the router changelog.

## The mid-session scope addition, and why it is here

**The operator reported two defects from a screenshot of the Work
Explorer while this session was at Step 5, and directed that they be
fixed here rather than deferred into another set** (*"we need to stop
creating set after set to just deal with issues arising from sets from
today"*). My recommendation had been to record them as residuals; it was
overruled, and the record should show that the expansion was the
operator's call, not scope creep.

1. **A gate-policy record rendered as a finished step.** A
   `path_aware_critique` entry is written at *registration*, before any
   work exists, and `build_rows` rendered it as a `complete` row — so the
   panel showed the path-aware critique, a stage that runs once at the
   **end of a set**, with a done glyph minutes after the session began.
   Pre-existing since Set 066 and present in **50 sets**; visible now
   only because 128 is the first set since 117 to arm the flag. Fixed by
   rendering only steps (`is_logged_step`), in Python and in the
   TypeScript mirror, with the parity corpus updated in both directions.
   Falsified for **all four** bookkeeping kinds, not just the reported
   one (L-069-1).
2. **Two rows named `Close-out` under one session.** This one **is caused
   by this session**: the skeleton mandates a step named *Close-out*, and
   the close-out obligations group row (Set 115) was already labelled
   `Close-out`. The group row is renamed **`Close-out readiness`** via a
   named constant, since the label is looked up by text in four files.

**This makes the extension a surface of this session, which the spec did
not anticipate** (`requiresE2E: false`, *"the extension is not a surface
of this set"*). `covers` is by path, so the Playwright suite is now owed
at Step 6 and will be run there; `requiresE2E` governs whether an **E2E
procedure** is required, which is still false. The flag/reality mismatch
is surfaced at Step 9 rather than re-litigated mid-session, per the
constitution.

## Recognition is by INTENT, and that is the point

Matching a fixed sentence would fail an author who writes "Close out"
instead of "Close-out" while still passing one who re-encodes the retired
ordering in different words — exactly backwards. Each of the four is a
family of phrasings (`_INTENT_RE`), and the compression rule is an
**unordered** set test, so "verify then full suite" and "full suite then
verify" both fire. `test_a_compressed_step_fires_in_either_internal_order`
asserts that directly.

## The scope boundary, stated so it is reviewed rather than discovered

The compression rule reads the **tail region only**. Two reasons, and the
second is a hard constraint:

1. A work step that *describes* verification is prose, not ceremony. A
   work step that *orders* an early full suite is an **A2 ordering**
   concern, and A2 is Session 2's deliverable, not a shape check.
2. This set's own Session 1 Step 3 reads *"FIRES: a spec that compresses
   verify + full suite into one step"*. Scanning work steps would fail
   the very spec that ships the check, and the spec's STRUCTURAL
   requirement is that its own three sessions pass.

`test_a_work_step_that_describes_the_ceremony_is_prose` pins the
boundary. If a reviewer believes an early full-suite work step must be
caught **here** rather than in Session 2, that is a legitimate scope
argument — please raise it as such, not as a missed defect.

## Falsifiers were proven to bite, not merely observed green

L-112-1: only a planted violation separates a gate that finds nothing
from one that checks nothing. 12 test functions / 19 cases, weighted to
the negative direction:

| planted malformation | fires |
|---|---|
| the Set 127 S2 compressed step, **verbatim** | yes, as a `compresses` finding at position 5 |
| the same compression in the reverse internal order | yes |
| tail in the wrong order (suite before verification) | yes, positions 3 and 4 |
| a missing tail step | yes |
| work after close-out | yes, position 6 |
| a session that never registers | yes, position 1 |
| fewer steps than the ceremony | yes, position 0 |

Legitimate look-alikes that must **not** fire: a conforming spec at the
budget; a conforming spec over the cap with a declared
`sessionSizeException`; a tail written entirely in non-canonical prose; a
work step that describes the ceremony.

**Mutation probe:** `check_step_shape` was gutted to `return []`, the
suite re-run (**12 of 19 cases failed**), and the module restored — byte
-for-byte identical to a pre-probe copy, verified by comparison. Nothing
from the probe is in the working tree.

## Suite baseline — the suites this session owes

- **pytest (full, `-n auto`)**: recorded in `test-runs.jsonl` at Step 6,
  after the last code change.
- **Playwright (Layer 3)**: **owed**, because the mid-session scope
  addition touched Explorer rendering surfaces
  (`sessionStepModel.ts`, `workExplorerTreeModel.ts`) — L-064-12's
  trigger list, run after the last code change.
- **mocha (Layer 2)** ran green at 1524 passing after the extension
  edits; it is not an expensive suite under `covers`.

Targeted pre-verification runs: **154 passed** across
`test_spec_admission.py`, `test_spec_admission_shape.py`,
`test_plan_seeding.py`, `test_start_session.py`, `test_config.py`; then
**125 passed** across `test_session_checklist.py` and
`test_step_row_parity.py` for the scope addition.

## By-design decisions this session made — please DO scrutinise these

1. **A corrupt or unparseable `session-state.json` resolves to
   `in-progress`, not to "never started".** Only `start_session` creates
   that file, so its presence is itself evidence of registration.
   Reading a corrupt file as unstarted would turn a state-file bug into
   a blocking finding against work already in flight.
   (`test_a_corrupt_state_file_reads_as_started_not_as_unstarted`.)
2. **`SpecAdmission.passed` now covers shape as well as size**, so the
   existing size tests were isolated by giving their fixture spec a
   `complete` state file. That is dimension isolation, not a weakened
   assertion: every size assertion still runs, and the shape dimension
   has its own file.
3. **`sessionSizeException` covers the COUNT only.** A session cannot
   except itself out of the skeleton. Stated in the authoring guide.
4. **`--all` does not print the informational note.** A note is not
   something to say in a 127-spec sweep; the summary line counts
   restructuring separately.
5. **`DEFAULT_MAX_STEPS` is derived** (`CEREMONY_STEPS +
   WORK_STEP_BUDGET`) so the ceremony count and the budget cannot drift
   apart from the cap.

## By-design exclusions — please do not report these as defects

1. **No ordering rules.** A1–A4, the constitution edits, and the A4 diff
   classifier are Session 2. The constitution is deliberately untouched
   here — it also sits at 100% of its 4,000-token preload ceiling.
2. **No retrofit of historical specs.** A declared set non-goal. 4
   unstarted specs (113, 118, 121, 122) now require restructuring; 118 is
   re-authored by Session 3, and the other three are re-authored when
   their own sets start.
3. **`docs/planning/session-step-skeleton-and-verification-cost.md` still
   says the cap is "currently 5" and is still marked "diagnosed, not
   fixed".** Retiring that note is **Session 3 Step 3** by name. It is a
   known, scheduled echo, not an oversight.
4. **No CI wiring.** `spec_admission` is not run by
   `.github/workflows/test.yml` today and this session did not add it;
   `--all --check` now exits 1 on the four unstarted specs, so wiring it
   without first re-authoring them would red the pipeline on purpose.
5. **No version bump and nothing published.** The changelog entries land
   under existing `[Unreleased]` structures; publishing is operator-only.
6. **The irony budget was 10 new test functions; 12 shipped for the
   planned work, plus 3 Python and 3 TypeScript for the operator's
   mid-session defects.** The two extra on the planned side are the
   requires-restructuring gate's own both-direction pair, which the
   budget predated — ratification (b) did not exist when the spec was
   authored. The six on the addition side are the operator's scope call.
7. **`dist/extension.js` and its map are regenerated build artifacts**,
   tracked in this repo, and move whenever `src/` does.

## Severity rubric for this round

Grade by **consequence**: probability the stated failure scenario reaches
a real user × impact (L-095-1 / project-guidance). Low probability **or**
low impact is Minor. A finding with no nameable failure scenario is a nit.

The thing that must not regress: **a spec must never again be able to
declare a step that compresses verification and the full suite into one
instruction, in any words and in any internal order.** A phrasing that
slips past `_INTENT_RE`, or a gating predicate that lets an unstarted set
through, replaces a checkable shape with a false all-clear — worse than
the prose it replaced, because an author would then have reason to trust
it. Findings in those directions are Critical/Major by construction.
