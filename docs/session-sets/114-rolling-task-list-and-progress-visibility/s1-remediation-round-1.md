# Session 1 — remediation notes, round 1 (discovery, fan-out 2)

Four Major findings, all accepted. Findings 1 and 4 are the same defect
reported by both discovery lenses.

---

## F1 / F4 — a single late post satisfied the gate for every earlier transition

**Accepted, fixed.** This was a genuine fail-open on the set's own
central claim, and the verifier reproduced it directly (start/test/verify
at 0/20/30 minutes, one post at 60, gate returned `(True, '')`).

The first cut skipped **every** transition older than the ledger's first
post, reasoning that "a ledger cannot describe the time before it
existed". That reasoning is sound for the migration case it was written
for and wrong as a blanket rule: a session that ignored the checklist all
day, was refused by this gate, ran the remediation command once and
retried, had all of its transitions "older than the first post" — so the
retry passed. The gate's remediation message was, in effect, an
instruction for how to defeat it.

**Fix (`gate_checks.check_checklist_posted`):** the grace is now bounded
to exactly one transition kind — `session-start` — and still only when it
precedes the session's first post. Every other transition binds
unconditionally, however old the ledger is. The bound is what the
verifier asked for ("any migration grace must be explicitly bounded"),
and it is the narrowest form that still lets a session already in flight
at upgrade time close: it could not have recorded its own start, but it
can record everything after it.

A second, related modelling gap surfaced while testing the fix: records
**older than the session's own `startedAt`** were being treated as this
session's transitions. They are not — a session cannot owe a post for a
moment that preceded it. Those are now dropped before the coverage rule
runs. That is not a softening: every real transition is stamped `now()`
by its writer during the session, so nothing legitimate is excluded.

**Falsifier:** `test_one_late_post_cannot_launder_a_whole_silent_session`
plants the verifier's exact scenario and asserts the refusal names the
missing transitions. `test_transitions_older_than_the_ledger_are_not_failed`
was rewritten from enshrining the hole to pinning the bounded grace.
`test_a_record_after_the_start_still_binds` is the look-alike for the
pre-start rule.

---

## F3 — "every operator stop" was documented as required and not gated

**Accepted, fixed.** The verifier caught a **false statement in the
code**, which is worse than the omission it justified: the comment said
operator stops "leave no timestamped record of their own", when
`decision_journal` timestamps every decision it writes and the
`authority: human` rows *are* the stops.

**Fix:** `_checklist_transitions` now reads `decisions.jsonl` and emits an
`operator-stop (<rubric_line>)` transition for each human-authority row
belonging to this session. The false comment is replaced with a note
recording that it was false and why.

**Falsifier:** `test_an_operator_stop_without_a_post_is_refused` plants
the stop; `test_an_ai_authority_decision_is_not_an_operator_stop` is the
legitimate look-alike (journaled, but nobody was stopped), and
`test_another_sessions_operator_stop_is_not_this_sessions` pins the
session filter.

---

## F2 — the "before a long-running command" post is not enforced

**Accepted; resolved by changing the contract, not the gate.** The
finding is correct that the cadence claimed something the gate does not
check. It is *not* fixable by adding a record, and this is the one place
where the spec pre-empts the obvious remedy.

Starting a command leaves no artifact. The only way to get a
"pre-command" record is to have the orchestrator declare one — and
Decision 3 of this set's spec rules that out in terms:

> Anything that asks the orchestrator to *separately* attest it posted
> the checklist is self-reported and will decay exactly as the prose
> obligation did.

A `--before-long-command` flag would be exactly that attestation: it
would be satisfied by typing it, in the same breath as skipping the post,
and it would make the ledger *less* trustworthy by mixing observed
records with claimed ones. The completion half is observable and binds;
inventing an unobservable half would trade a stated limit for a hidden
one.

**Fix:** the cadence table in the authoring guide now carries a
**Gate-checked?** column, the before-post row says **No**, and the reason
is stated where the rule is (no start artifact exists; a declared one
would be self-reported). The gate docstring says the same. The practice
is still prescribed — that post is for the operator staring at a silent
terminal — it is simply named as doctrine rather than implied to be
enforced.

**Residual, owned and named:** the *before* half of a long-running
command remains unenforceable with the records this framework keeps. If a
future set introduces a command wrapper that stamps a real start record
(not a declaration), this becomes checkable and the row should flip.
