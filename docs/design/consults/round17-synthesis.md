# Consult round 17 — synthesis

2026-09-18. Brief: `round17-brief.md`. Answers: `round17-gemini.md`
(`gemini-3.1-pro-preview`, direct API, 33 s) and `round17-sol.md`
(`gpt-5.6-sol` through the Copilot seat, 92 s — the OpenAI key had no
credits, so the seat carried Sol this round). Every claim below was checked
against the tree before it was repeated.

The frame, from the operator: a human should not have to click Resume for
something no human needed to decide; fix the class, not the hole; and do not
over-engineer — "if there is a simpler solution, we should go with that."

## Where both advisors agree, and so does the orchestrator

1. **Build the crash layer only.** Durable crash evidence, a loop log, and a
   bounded automatic restart. Both advisors deleted the owner table and the
   mechanic outright: Sol — "a taxonomy that does not perform recovery is
   documentation disguised as machinery"; Gemini — the mechanic "violates
   the operator's warning" and an AI troubleshooting a deterministic crash
   tends to blame its own code and mutate the tree.
2. **A recorded stop is never auto-restarted.** Budget, tree, interrupted,
   cancel, rejected-thrice were meant. Only "heartbeat stale and no stop
   recorded" is a crash.
3. **The closed kind/code union is already the table.** No four-owner
   abstraction, no completeness-of-owners test.
4. **Resume stays for a dead AI.** Neither advisor would have the framework
   own a proprietary CLI's lifecycle. The loop already records
   `instruction-overdue` (`drive.ts`, the invoke poll), so the silence is
   named; Sol adds that the two states — loop absent, AI absent — should be
   shown separately with one action each, and that when the loop is alive the
   answer is "reopen the CLI and run `session wait`", not Resume.
5. **Restart only from persisted phase boundaries.** Round 15's rule — every
   phase checks what exists before acting — is what makes a restart safe;
   Sol's one risk is a non-idempotent action repeated, and the mitigation is
   that rule, audited for each phase the supervisor covers.

## Where they split, and the call

**Who restarts a crashed loop.** Gemini: the AI's waiter, because it already
detects the exact condition and is the one framework process running when
the loop is not. Sol: the extension, because it already owns loop startup
and Resume; the waiter should stay observational, and a restarting waiter is
"another lifecycle owner".

*The call: the waiter.* A session driven outside VS Code has no extension
(AGENTS.md: the operator types the two starts), and a supervisor that exists
only in one host is a hole of the same class this round is closing. The
waiter is present whenever an AI is working; when the waiter is gone too,
both sides are dead and that is the Resume case both advisors keep. The
waiter's restart is the same command Resume runs, so it adds no second way
of starting a loop. Sol's race — two loops from one stale heartbeat — is real
and is covered by what the loop already has: the heartbeat carries a pid and
a timestamp, `Driver.save()` fences every write under the lifecycle lock and
stops the loser, and Resume yields to a live heartbeat. The walk proves it
rather than a new lease.

**What an uncaught error writes.** Gemini: a `crash` stop on `run.json` at
once. Sol: that contradicts "a recorded stop is never restarted" — write the
evidence, and the terminal stop only when retries are spent.

*The call: Sol's.* An uncaught error appends `loop-crashed` with its message
to `supervision.jsonl` and the loop log, and exits. The `crash` stop is
written by the waiter after the second failed restart at the same progress
point, with a forced-retry command as its way on. The rule stays one rule.

**Replacing the owner table.** Sol proposed a *forward-exit completeness*
test: every kind/code combination renders at least one executable way on
through `renderStop`. *Adopted.* It is one test, it enforces zero-deadlock
tolerance directly, and it is the property the owner table was really after.

## Refinements taken from Sol

- The restart bound is keyed on durable progress — phase plus outstanding
  instruction seq — and resets when progress lands. Two restarts, then stop.
- Loop output goes to `driver/loop.log` from the loop itself, and to the
  terminal best-effort. Measured today: `Code.exe` under
  `ELECTRON_RUN_AS_NODE` writes stdout/stderr to a redirected file normally
  and exits 1 with the error text on an uncaught throw; only a VS Code
  terminal tab loses it. No wrapper script.
- If the mechanic is ever built: reuse `agency.ts`'s protocol and audit
  trail but not its write policy; count every operation equally; a fresh
  conversation with the configured model, not a mandated third; and it may
  never edit the record or ledger, write verdicts or gates, commit, push,
  publish, close, approve its own result, alter installed framework code,
  leave the workspace, or suppress a check. Recorded here; not planned.
  Revisit after ten real sessions if `supervision.jsonl` shows stops that
  reached a person and needed no decision from one.

## The recommendation

One session, four changes, all in `packages/router`:

1. The loop tees stdout and stderr to `.dabbler/runs/s<N>/driver/loop.log`.
2. An error that is not a `Stop` is appended to `supervision.jsonl` as
   `loop-crashed` with its message before the process exits.
3. The waiter, on a stale heartbeat with no stop recorded, starts
   `dabbler session run --mailbox` detached and goes on waiting — at most
   twice for one progress point, each restart on `supervision.jsonl`; at the
   bound it writes a `crash` stop and prints the ways on.
4. One test: every stop kind/code renders an executable way on.

Proof, Sol's experiment: kill the loop at the incident's exact boundary —
plan accepted, task not yet declared — and pass only if the waiter starts
exactly one replacement, the plan is reused, the first step is issued
exactly once, and a third crash at the same point becomes a recorded stop.
In the same walk, end a loop through a normal recorded stop and show it is
not restarted.
