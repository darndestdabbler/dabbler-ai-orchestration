# Session 1 — remediation notes, round 3 (remediation-review)

Two Major findings. One accepted and fixed; one **disputed** and stopped
to the operator rather than re-rounded.

The round's fix verdicts were 2 accepted / 2 rejected. Both rejections
are the same objection reworded — that the gate does not enforce a post
*before* something happens — so they are answered together below.

---

## Accepted and fixed — the operator-stop row claimed a timing the gate does not check

The authoring guide's table said:

> **Every operator stop** | Immediately before the education-mode brief,
> so the human sees where the session is while they decide. | **Yes**

The gate checks a post **after** the decision is journaled, because
`decision_journal` writes its line once the decision exists — which is
after the brief, not before it. So the row advertised the pre-brief
timing as enforced when the enforced thing is the post-journal one. That
is a doc/gate mismatch introduced by *this session's own* round-1
remediation, and the finding is right to call it out.

**Fix:** the row is split into what is checked (`An operator stop is
journaled` → post after the record → **Yes**) and what is prescribed but
unchecked (`Before the education-mode brief` → **No**). The gate
docstring, the constitution's Step 4 line, and the acceptance test's
docstring now all say the same thing. The test that pins the passing case
now states in its name and docstring what it is actually pinning.

---

## Disputed — "the gate must enforce a command-start transition"

**Finding:** *"check_checklist_posted must have an enforceable
command-start transition, or equivalent non-attestation mechanism, and
must fail when the pre-command checklist post is missing."*

**Position: the fix is correct as delivered, and the demand cannot be met
without violating this set's own spec.** Escalated to the operator rather
than re-rounded, per the loop discipline ("a Critical/Major the
orchestrator disputes → stop to the human; never re-round a disputed
finding").

The reasoning, stated so it can be overruled on its merits:

1. **Every record this framework keeps is written after the thing it
   describes.** `run_of_record record` stamps `recordedAt` when the
   metadata line is appended; `verify_session` appends `round-completed`
   after the round; `decision_journal` writes once a decision exists.
   There is no artifact for "a command is about to start", and no
   existing writer produces one.

2. **The only zero-scope way to manufacture one is an attestation** — a
   flag on `session_checklist` (or on the suite command) by which the
   orchestrator declares "this post precedes a long-running command".
   The spec's Decision 3 forecloses exactly that:

   > Anything that asks the orchestrator to *separately* attest it posted
   > the checklist is self-reported and will decay exactly as the prose
   > obligation did.

   Such a flag is satisfied by typing it, and it would make the ledger
   *less* trustworthy by mixing observed records with claimed ones.

3. **A non-attested mechanism exists but is a scope expansion, and a
   partial one.** `verify_session` could append a `round-started` record
   before dispatching; the existing window rule would then force a post
   before each routed round, with no attestation anywhere. That is a real
   answer for routed rounds — but it touches `ai_router/verify_session.py`,
   which is not in this session's declared **Touches**, and it does
   nothing for the suites an orchestrator runs in a shell (`pytest`,
   `npm run test:playwright`), which are the majority of the
   silent-terminal minutes the before-post exists for. Covering those
   needs a launcher wrapper — a larger design than a remediation should
   introduce on an expensive path.

4. **A tolerance window was considered and rejected** in round 2 for a
   reason that still holds: "the covering post must be within N minutes
   of the next transition" introduces an arbitrary constant, and
   coverage would then depend on how fast the orchestrator typed.

5. **The goal is met; the letter is not.** The spec's gap 4 is *"an
   undefined cadence cannot be followed consistently or checked at all."*
   The cadence is now defined, four of six moments are machine-checked,
   and the two that cannot be are labelled `No` in the same table — so
   nobody, human or AI, is misled about what the gate proves. What the
   finding asks for is the remaining letter.

**Options put to the operator** (education-mode brief, recorded in
`decisions.jsonl`):

- **A. Accept as delivered.** The two before-posts stay prescribed and
  unchecked, named as such in the table. Residual owned, named, and
  cheap to revisit.
- **B. Authorize a scope expansion into `verify_session`** to stamp a
  `round-started` record, making the before-post enforceable for routed
  rounds only. Shell-run suites stay unchecked, so the table still
  carries a `No` — the residual shrinks rather than closing.
- **C. Third-provider opinion** on whether (2) is a real bar or an
  over-reading of Decision 3.
- **D. Drop the before-posts from the cadence entirely**, on the
  principle that a cadence exists to be checkable and prefer-removal is
  the house rule. Costs the operator the silent-terminal post.

**Default on no answer: A**, because it is the reversible option and the
one that ships an honest table today.
