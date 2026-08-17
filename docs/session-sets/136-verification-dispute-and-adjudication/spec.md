# Verification dispute and adjudication

> **Purpose:** Give a disputed blocking finding a sanctioned path to
> resolution, so the round cap is a handoff instead of an impasse. Today
> the loop suspends at the cap and tells the operator a disputed finding
> "goes to the operator" — with no verb. The operator's only lever is
> re-running past the cap and steering the route by hand, which produces
> a ledger that misdescribes what happened.
> **Session Set:** `docs/session-sets/136-verification-dispute-and-adjudication/`
> **Created:** 2026-08-17
> **Workflow:** Full
> **Prerequisite:** none.

> **Note on rule 6:** this repo's ground rules say v2 development uses
> plain commits, not its own session machinery. This set is an
> operator-authorized exception; it does not open the door to routine
> self-hosted ceremony here.

---

## Session Set Configuration

```yaml
requiresUAT: false
requiresE2E: false
pathAwareCritique: none
module: default
totalSessions: 3
prerequisites: []
```

---

## The incident this set exists for

`dabbler-simulation-player`, set 004 session 2, 2026-08-17. The verifier
(`gpt-5-6-sol`) raised the same Major three rounds running — CSS
selector-grammar validation — re-litigating a scope decision documented
in the target repo (`docs/tutorial-validation.md` not-covered list,
recorded in its set 003). The prompt instructs verifiers to RE-RAISE
persisting findings but carries no channel for the orchestrator's
defense, so a scope dispute cannot converge. At the cap the close
blocked; the operator judged the finding unwarranted; the system offered
no mechanism for that judgment. The operator improvised a round 4 routed
to a third provider (Gemini), which returned VERIFIED and unblocked the
close — the right move, recorded as an ordinary fix-delta round, which a
future auditor will misread as "fixed in round 4."

## What this set does NOT change (do not reopen)

- **No code path accepts a hand-written verdict.** Unchanged, including
  for the operator. The 2026-07-06 incident stands as the reason.
- **The round cap stays at 3.** The cap did its job; the missing piece
  was the exit, not more rounds.
- **Cross-provider exclusion is permanent canon.** This set strengthens
  it: the adjudicator excludes MORE providers, never fewer.
- **No new gate.** `verification_clean` already reads the latest ledger
  row; every new outcome in this set is expressed as a ledger row that
  gate already knows how to read. A change that needs a sixth gate is
  out of spec.
- **No new module** (ground rule 1). Everything lands in `verify.py`,
  `ledger.py`, `verdict.py`, and the schemas/docs.

## Design rationale

The capability-scaling test: dispute-and-adjudicate gets more valuable
as models improve (better rebuttals, better judging); round-grinding
gets less necessary. Consensus precedes human in the decision-rights
rubric — a third independent provider is the next escalation after two
parties deadlock, and the human is the auditor of that record, and the
decider only where the machine path is exhausted or the decision
reduces verification.

---

## Sessions

### Session 1 of 3: The dispute channel

1. Register.
2. Add the dispute record: `.dabbler/runs/<set>/s<N>/disputes.jsonl`,
   machine-written only by `ai_router.verify`, one row per dispute —
   `round`, `finding_index`, `grounds`, `evidence_paths`, `recorded_at`
   — schema-validated on read like `rounds.jsonl`. One dispute per
   finding, immutable; a second dispute of the same finding is refused.
3. Add the CLI entry: `python -m ai_router.verify dispute
   --session-set-dir <set> --round R --finding F --grounds "..."
   --evidence <path> [--evidence <path> ...]`. At least one
   `--evidence` naming an existing repo path is required — a dispute is
   an argument from the record, not a complaint; prose-only disputes are
   refused with a message saying exactly that. The bare `verify`
   invocation keeps its current behavior unchanged.
4. Render disputes in the next round's prompt: in the prior-findings
   block, each disputed finding carries its rebuttal (grounds plus the
   cited files' relevant content) directly beside it, and the verifier
   instruction changes from "if it persists, RE-RAISE it" to: engage
   the rebuttal — UPHOLD with reasons that address the cited evidence,
   or WITHDRAW. A withdrawn finding no longer counts as unresolved.
5. Cross-provider verification.
6. Required portion of the full test suite.
7. Close-out.

**Creates:** dispute rows + CLI + prompt rendering. No behavior change
for sessions with no disputes. Est. 8–10 new Python tests, one per
behavior, within the 480 ceiling.

### Session 2 of 3: The adjudication round

1. Register.
2. Add `python -m ai_router.verify adjudicate --session-set-dir <set>`.
   Machine-checked preconditions, each refusal naming the unmet one:
   the round cap is reached; the latest round is blocking; every
   blocking finding in the latest round carries a recorded dispute.
   Engine-invokable by design — consensus precedes human, and a routed
   call costs the developer nothing; the audit trail is the control.
3. Adjudicator selection: exclude the orchestrator's effective provider
   AND every provider that verified any round of this session. No
   eligible provider left → the existing `VERIFICATION UNAVAILABLE`
   path, unchanged.
4. Adjudication evidence: per disputed finding — the finding verbatim,
   the dispute verbatim, the cited evidence content, and the current
   fix-delta. The adjudicator's task is to judge each dispute — UPHOLD
   the finding or OVERRULE it, with reasons. It may not raise new
   findings: it judges the dispute; it does not re-review the world.
5. Ledger: one additional row in `rounds.jsonl` with `type:
   "adjudication"`, the per-finding outcomes, and the excluded-provider
   list (additive `rounds.schema.json` change; rows without `type`
   remain valid). All blocking findings overruled → the row's verdict
   is VERIFIED, `blocking: false`, and the existing `verification_clean`
   gate passes with no gate change — assert this in a test. Any finding
   upheld → ISSUES_FOUND, still blocked. One adjudication per session,
   ever; after it, no further verify rounds may open.
6. Cross-provider verification.
7. Required portion of the full test suite.
8. Close-out.

**Creates:** the adjudication command, selection exclusion, ledger row
type. Est. 10–12 new Python tests.

### Session 3 of 3: The operator path, and every refusal names its exit

1. Register.
2. Wire the WAIVED verdict to a mechanism. `VERDICT_WAIVED` exists in
   the closed vocabulary today with no writer path to it. Add
   `python -m ai_router.verify waive --session-set-dir <set>`:
   permitted only when the machine path is exhausted (an adjudication
   row exists and upheld at least one blocking finding, or adjudication
   was unavailable). Interactive-only: the attestation text is typed at
   a prompt, and the command refuses when stdin is not a TTY — an
   engine in a non-interactive shell cannot invoke it, which is the
   mechanical distinction between an operator attestation and a
   confabulated one (the 2026-07-08 lesson). The row records the
   attestation verbatim, what was waived, and that the session is NOT
   verified — WAIVED means "operator accepts unverified," never
   "verified another way." Close then closes carrying WAIVED into
   session-state and the change-log block.
3. Every refusal in the loop names its exit, verbatim commands: the
   round-cap refusal prints the `dispute` and `adjudicate` invocations;
   an upheld adjudication prints remediate-or-`waive`;
   `VERIFICATION UNAVAILABLE` prints its operator resolution. No
   message may describe a dead end without naming the sanctioned next
   command.
4. Documentation: `docs/quick-start.md` gains the dispute → adjudicate
   → waive ladder in its verification section; `docs/schema-reference.md`
   documents `disputes.jsonl`, the adjudication row type, and the
   WAIVED row. The extension needs no change — it renders
   `verificationVerdict` strings as-is.
5. Cross-provider verification.
6. Required portion of the full test suite.
7. Close-out.

**Creates:** the waive mechanism, exit-naming messages, docs. Est. 6–8
new Python tests.

---

## Acceptance criterion for the set

Replay the incident shape end-to-end in a test fixture: three blocking
rounds on a disputed finding → `dispute` recorded → `adjudicate` routed
to a never-before-seen provider → overrule → close passes with an
honest ledger that reads, in order: three ISSUES_FOUND rounds, one
dispute, one adjudication row naming the finding it overruled. The
same fixture with an upheld adjudication must refuse to close until
`waive` is attested interactively, and must then close as WAIVED.
