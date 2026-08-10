# Set 114 Session 2 — remediation, rounds 1–2

Both discovery lenses and the supplementary pass are remediated in one
change. Three findings, two defects, one lesson.

## The lesson first

Both defects are the same shape: **a rule with two spellings drifts.**
`_reconcile` already knew that "an entry carrying a `kind` is
bookkeeping, not work" and that identity is not the same thing as
ordinal position. The gate filters and the claim order each re-stated a
*weaker* version of what the reconciliation already believed, and both
weaker versions were wrong. L-069-1 in its purest form — and this time
the sibling sites were sitting in the same diff.

The fix in both cases is to have exactly one spelling:

- `session_checklist.is_logged_step(entry)` is now the single predicate,
  used by `_reconcile`, `check_activity_log_entry`, and
  `_checklist_transitions`.
- Claims are made **identity before ordinal**, in that order, once.

---

## I-114-S2-1 / I-114-S2-2 (Major, Correctness) — the "real work" gate counted writer bookkeeping

*Found independently by both discovery lenses (spec-conformance and
failure-scenario), which is the strongest signal a finding can carry.*

**The finding is correct.** `check_activity_log_entry` and
`_checklist_transitions` excluded only `kind == "plan-step"`. But
`path_aware_critique`, `contract_gate`, `dual_surface_mode` and
`suggestion_disposition` all write complete activity-log entries with
their own `kind`, and the first two are written **at registration** for
any set that configures them. So a set with `pathAwareCritique:
advisory` — which this very set declares — could satisfy the gate whose
entire job is to prove one real step was logged, before any work
existed. The session's own changelog claimed the gate "still demands a
real logged step". It did not.

The verifier's probe is reproduced as a falsifier rather than trusted:
`TestThePlanIsNotWork::test_a_policy_record_is_not_a_logged_step_either`
plants exactly that log (seeded plan + one `path_aware_critique` entry)
and asserts the refusal, and a parametrized sibling asserts all four
known bookkeeping kinds behave identically.

**Fix.** `is_logged_step` replaces both `kind != PLAN_STEP_KIND`
filters. The refusal message now names the kinds it found and says why
they do not count ("written FOR a session at registration, not BY it
doing work"), so an operator who hits it is not left guessing which
entry the gate refused to accept.

**Acceptance criterion** — *"A session whose activity log contains only
seeded plan entries and kind-bearing policy/bookkeeping entries must
fail `check_activity_log_entry`, and `_checklist_transitions` must not
produce a last-logged-step transition until an ordinary
`SessionLog.log_step` entry exists."* — met by
`test_a_policy_record_is_not_a_logged_step_either`,
`test_every_bookkeeping_kind_is_treated_the_same`, and
`test_a_policy_record_is_not_the_last_logged_step_transition`, the last
of which plants the policy record as the **newest** entry in the log so
a timestamp-ordering accident cannot make it pass.

---

## I-114-S2-3 (Major, Correctness) — a mid-flight insertion evicted a planned row

**The finding is correct, and it hits the exact case the spec named.**
Session 2's step 4 asks for "a session whose plan changed mid-flight".
The seeded plan is 1 register / 2 build / 3 verify. The spec is edited
to insert a step; the orchestrator then does what the constitution
tells it to and logs under the spec's **current** numbers. With
ordinal-first matching this cascades: the inserted step claims the
build row, build claims the verify row, and the verify row disappears
from the checklist entirely. A planned step nobody executed, silently
dropped — the one outcome the spec forbids in both directions.

Worth stating plainly: the session had a test named
`test_a_plan_changed_mid_flight_does_not_rewrite_the_ledger`, and it
passed. It asserted the *ledger* was not rewritten, which was true and
was never the risk. It appended its new step at number 4, off the end
of the plan, where no cascade is possible. A test can cover a named
case and still miss the defect in it.

**Fix.** Claims are made in two passes, **identity before ordinal**:
every logged step whose `stepKey` equals a planned key claims that row
first; only then does a remaining step claim by `stepNumber`. A key
match asserts identity and cannot be wrong; an ordinal match is an
inference about a plan that may have moved under it. With that order, a
renumbering can only ever add an unplanned row — it can never evict a
planned one.

This does not weaken the ordinal path that makes reconciliation work in
the normal case: `test_a_logged_step_claims_its_planned_row_by_step_number`
still passes, and this session's own checklist still renders three
claimed rows against keys that do not match the seeded slugs.

**Acceptance criterion** — *"In a seeded plan with original steps 1–3,
after a mid-session insertion is logged as the new step 2 and subsequent
work is logged with shifted step numbers, `build_rows` preserves every
unexecuted original planned row as pending and shows the inserted work
as unplanned rather than replacing a different planned row."* — met by
`test_an_inserted_step_cannot_evict_a_planned_row`, which plants the
verifier's exact fixture and asserts all four rows including the
surviving `[ ]`. `test_a_key_match_wins_over_a_different_rows_number`
states the same rule directly rather than through a cascade.

### Round 3 rejected the round-2 fix, and was right

The round-2 falsifier logged the shifted step under the seeded slug
(`build-the-thing`), so identity matching rescued it. Round 3 logged it
under an ordinary key (`build`) — which is what an orchestrator actually
does, since its step keys are short handles, not the slug the seeder
derived from the spec's sentence — and the cascade came straight back.

The important thing round 3 forced was an honest look for a signal
**inside** the ledger, and there is none: "N logged steps, N planned
rows, each number used once" is the identical shape whether the plan is
intact or renumbered. Identity-first cannot fix that, and dropping
ordinal matching altogether would satisfy the criterion by making nearly
every checklist double (Set 114 S1's own six logged keys match exactly
one seeded slug).

**The signal is outside the ledger, in `spec.md`.** `plan_matches_spec`
compares the seeded descriptions against the spec's step texts *now*;
`build_rows` passes the answer to `_reconcile` as `allow_ordinal`. An
intact plan reconciles as before. A plan that has been edited — or a
spec that is missing, unreadable, or newly unparseable — withdraws the
ordinal pass, so unmatched steps append and **no planned row can ever be
evicted**. Conservative in every failure direction, because losing a
planned row is the failure that matters and showing a step twice is not.

This is not the renderer synthesizing rows from the spec (Set 111 S4's
closed decision). No row ever comes from `spec.md`. The spec answers one
question — *has the plan moved since registration?* — and the answer
only decides whether an inference is trustworthy.

**Round 3's acceptance criterion** — *"a logged row with a non-empty
stepKey that does not match any seeded planned step must not
ordinal-claim and replace a different planned row; unfinished original
planned rows remain visible pending"* — met by
`TestOrdinalClaimingIsGatedOnTheSpec`, which carries the round-3 fixture
verbatim (`test_an_inserted_step_cannot_evict_a_planned_row_under_any_key`),
a **control** proving the identical ledger still reconciles normally
when the spec held, a direct test of the predicate, and a parametrized
pair for the deleted / unparseable spec.

**Stated limit.** An orchestrator that renumbers its `log_step` calls
without editing the spec leaves no signal anywhere, and the ordinal pass
will mislabel a row. That is operator error with no available detector;
it is named here rather than papered over.

---

## What was NOT changed, and why

- **Seed-once stands.** Neither finding argues for re-seeding a mid-
  flight spec edit, and the two-pass fix removes the reason one might
  be tempted to: the edited plan's new work now appears as an unplanned
  row without displacing anything. Re-seeding would still write to the
  activity log mid-session, which is the freshness risk the spec names.
- **No gate was softened.** Both fixes make the gates stricter. The
  `check_activity_log_entry` change refuses logs it previously accepted,
  and no existing test needed relaxing to accommodate it (194 tests
  across the six directly-affected modules pass unchanged).
