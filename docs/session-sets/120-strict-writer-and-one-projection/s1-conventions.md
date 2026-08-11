## What changed since rounds 1 and 2 (read this first)

**Round 1 was right, on both lenses, and is fixed.** `skipped` was legal
at the writer but nameable by no reader — no `STATUS_BOXES` entry (so
`[?]`), not terminal in `_mark_here` or the Explorer's mirrored
`markHere` (so it stole the `<- here` marker). **`skipped` has been
removed from the vocabulary**, which is now **four** tokens:
`complete`, `in-progress`, `pending`, `blocked` — the *intersection* of
what was measured on disk and what the readers can name. Escalated to the
operator and journaled (`decisions.jsonl`, session 1,
`escalate-to-human`, `authority: human`). Full reasoning, the three
rejected alternatives, and the acceptance-criterion argument are in
`s1-remediation-round-1.md`.

The new invariant that makes this stick is
`test_every_accepted_token_is_renderable_by_the_reader`: it drives
`STATUS_BOXES` for every token in `CANONICAL_STEP_STATUSES` and fails if
any renders as `UNKNOWN_BOX`. **Widen the writer without teaching the
reader and the suite fails.**

**Round 2's finding is dismissed as out-of-scope, operator-confirmed.**
The `tools/` changes it describes are a *concurrent, uncommitted*
extension session's work that leaked into the evidence bundle via the
working-tree diff; `git diff --cached --name-only -- tools/` is empty and
this session never opened a file under `tools/`. Reasoning and the
process defect it exposed: `s1-remediation-round-2.md`. **Please do not
re-raise `tools/` as a finding against this session.**

---

# Conventions for this round — Set 120 Session 1

## Suite baseline (measured, not asserted)

The last recorded **full** suite run is Set 119 S3's:
`.venv/Scripts/python.exe -m pytest ai_router/tests -q -n auto` —
**3,780 passed, 9 skipped, 0 failed** in 513s. The 9 skips are the
pre-existing platform / optional-dependency skips this repo has carried
for many sets. **There are no tracked failures.**

This session has so far run the targeted suites covering what it changed:

- `test_step_status_vocabulary.py` (new), `test_session_log.py`,
  `test_plan_seeding.py`, `test_suggestion_disposition.py`,
  `test_contract_gate.py`, `test_path_aware_critique.py`,
  `test_production_imports.py` — **225 + 50 passed**
- `test_session_checklist.py`, `test_dual_surface_verify.py`,
  `test_gate_checks.py`, `test_start_session.py`,
  `test_step_row_parity.py` — **156 passed**

The full suite is run **once, at close, after the last code change**, per
the workflow's Step 5/Step 8 ordering (a full run before remediation is a
run you are about to invalidate — Set 116 S3 measured 15 runs and 186
minutes of exactly that mistake). **Do not report "the full suite was not
run before verification" as a finding; it is the policy.**

## Release contract

`ai_router/CHANGELOG.md` gains an `## [Unreleased]` section for Set 120
S1. The package version stays `1.0.0` — this set is not released, so
every Set 120 section is Unreleased and the version bump belongs to the
release walk, not to this session.

**This session adds public API and narrows an existing contract.** New
exports from `ai_router`: `CANONICAL_STEP_STATUSES`,
`ALLOWED_STEP_STATUSES`, `InvalidStepStatusError`, `validate_step_status`,
`require_step_status`, `is_valid_step_status`, `suggest_step_status`.
`SessionLog.log_step()` and `SessionLog.append_entry()` now **raise** on a
status outside the vocabulary where they previously accepted anything.
That is the deliverable, and it is breaking for any consumer-repo caller
that writes `"completed"` — deliberately so, since such a caller is
already producing an unrenderable ledger.

## By-design exclusions — please do not report these as findings

1. **`pathAwareCritique` is deliberately absent** from this set's
   configuration block, so no critique artifact is owed. The spec argues
   the case explicitly ("a set that declares nothing pays nothing").
2. **Readers were NOT hardened, and must not be.** Standing decision 1 of
   the spec: readers stay lenient about what they find on disk, the
   writer is strict. `session_checklist.STATUS_BOXES` still maps `done`
   → `[x]`, still renders `completed` as `[?]`, and still tolerates a
   1,000-character prose status. A finding that the readers "should also
   reject" the drifted tokens is arguing against an operator-settled
   decision, and would break the rendering of ~281 historical entries.
3. **The ~281 drifted entries already on disk are NOT migrated here.**
   Session 2 owns the inventory, the operator ruling, and any migration.
   "History still contains `completed`" is the expected state at the end
   of this session, not a defect in it.
4. **No extension (TypeScript) change.** Standing decision 3: deleting
   the duplicate TS derivation belongs to the extension carve. The
   extension is a *reader* of these files and is untouched.
5. **No new blocking gate.** The writer refuses bad input at the
   boundary; that is validation, not a gate (standing decision 4). No
   close-out check was added.
6. **The spec's token counts are slightly stale and this is reported, not
   hidden.** Reproduced 2026-08-11: `complete` 2,417 (spec: 2,412),
   `pending` 55 (spec: 45), nine prose blobs (spec: "~6"). The
   difference is Set 119's own later writes plus this session's five
   seeded plan rows. The *canonical set* — the only thing Session 1
   needed — is unchanged. Session 2 is spec-mandated to reconcile the
   exact numbers and say whether a discrepancy is about the query or
   about the spec.

## Severity rubric for this round

Grade by **CONSEQUENCE**: probability the stated failure scenario hits a
real user × impact. Low probability **or** low impact is Minor. No
nameable failure scenario is a nit.

**Every Critical or Major finding must carry `Evidence paths:`** — the
repo-relative paths you actually read. This is contract on this template
(Set 119 S1). A blocking finding with no paths is unknown severity, and
unknown still blocks.

## What this session claims to have done

1. **Defined the step-status vocabulary from measurement, then narrowed
   it by nameability.** Four tokens — `complete`, `in-progress`,
   `pending`, `blocked` — each confirmed in use by a fresh count over
   every `activity-log.json` **and** renderable by the checklist reader.
   `skipped` satisfied only the first test and is refused with a message
   that explains why (round 1).
2. **Made the writer fail closed.** `require_step_status` raises
   `InvalidStepStatusError` (a `ValueError` subclass, mirroring
   `InvalidVerificationVerdictError` from Set 086 S1) and is called by
   both `SessionLog.log_step` and `SessionLog.append_entry` **before**
   the entry is appended, so a refused write leaves the log byte-identical.
3. **Audited and routed every sibling writer.** Four modules bypass
   `SessionLog` with their own read-modify-write of `activity-log.json`
   (`contract_gate`, `path_aware_critique`, `dual_surface_verify`,
   `suggestion_disposition`). All four now spell the token from the
   shared `STEP_STATUS_COMPLETE` constant and pass it through
   `require_step_status`. A structural AST scan enforces the rule for
   writers that do not exist yet.
4. **Shipped falsifiers that actually falsify.** 22 test functions / 55
   cases planting every measured drifted token, `skipped`, prose,
   `None`, empty, and near-miss casing. **Mutation-checked:** with the
   two `require_step_status` guards replaced by `pass`, 34 of the cases
   fail. The AST guard has its own planted-violation falsifier *and* a
   session-state look-alike negative, per `L-112-1`.

## Where to be most adversarial

- **Is the vocabulary actually closed?** Is there a path — any path —
  that still writes a `status` into `activity-log.json` without passing
  through `require_step_status`? The AST scan only sees string literals
  in dict displays that carry both `stepKey` and `sessionNumber`; name
  a shape it would miss.
- **Does strictness break a legitimate caller?** `log_step`'s signature
  is unchanged and `status` was always required, but
  `append_entry`'s tolerance changed. Is there a real in-repo or
  consumer-repo call that now raises where it should not?
- **Is `session_checklist.seed_plan_steps` fail-open?** It catches
  `ValueError`, and `InvalidStepStatusError` is one. Argue the case that
  this is reachable today (the written status is a locked constant), or
  that it is not.
- **Are the refusal messages honest?** They claim to name the legal set
  and suggest the intended token. Find an input where the message
  misleads — particularly `suggest_step_status`, which must never be
  usable as a normalisation path to disk.
- **`docs/repository-reference.md` and `docs/ai-led-session-workflow.md`
  now describe the new contract.** Do they describe it *correctly*, and
  is any other surface still teaching the retired one (`L-064-8`, and
  the "propagate a consistency fix to every echo" convention)?
