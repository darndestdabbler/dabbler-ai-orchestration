# S2 remediation — round 6 (close backstop, second rejection)

The close backstop rejected the second close attempt with one Major: *"The
tutorial gate still accepts malformed commands and forbidden first-run
content."* **Accepted in full. All three specifics fixed.** This time the fix
is class-closing rather than another point patch, and the reason it is worth
naming is that the right answer was available from the start and I did not take
it.

## 1 — a symmetric typo passed, because symmetry was the wrong contract

> Replacing every `-m unittest` occurrence with `-m unitest` leaves equal
> `Counter` values and produces no violation.

Correct. A contributor doing a global find-and-replace — the most likely way
either command is ever edited — changes both platform lines together, so the
counts stay equal and the gate reports green while **every** reader gets
`No module named unitest`. Round 5 pushed me from sets to counters; round 6
points out that counting was never the contract either.

**The fix that should have been there from round 4.** `bundle.json` already
carries the canonical commands — `testCommandArgs: ["-m", "unittest"]` and
`programEntryPoint: "main.py"` — and the Layer-2 smoke test already runs
exactly those fields. The gate now validates every interpreter invocation
against them, and separately requires both to appear at all. That closes the
whole class in one move: symmetric typo, asymmetric typo, and a dropped step
are all now caught by the same check, and by construction it can never disagree
with what the smoke test actually executes.

The platform-multiplicity comparison is kept alongside it, because it answers a
different question — *is each command shown for both platforms* — which the
canonical check cannot see.

## 2 — git option forms

`git --version`, `git -C <dir>`, `git -c user.email=...` all begin with a dash,
and the subcommand branch required a letter. `git --version` sitting beside the
newly-added Git prerequisite is, as the finding says, a particularly plausible
edit. Fixed; three parametrised tests.

## 3 — block-scalar YAML

Round 5 asked for block-scalar continuations and **the round-5 remediation did
not implement them** — an omission, not a judgement, and round 6 was right to
catch it being silently dropped. `script: |` followed by indented free text now
classifies correctly: once a block-scalar header is seen, more-indented
continuation lines belong to that scalar rather than disqualifying the block.

## Where this leaves the gate, honestly

**83 tests, from 34.** Rounds 1, 4, 5 and 6 each found a way past a version I
had just called complete. The pattern has been consistent and it is worth
stating plainly rather than burying:

> Every version was strong against the defect I had just been shown and weak
> against its neighbour. Allowlisted git subcommands missed `git diff`; matching
> subcommands missed `git --version`. Labelled YAML fences missed unlabelled
> ones; unlabelled ones missed commented ones; commented ones missed block
> scalars. Set comparison missed a duplicated argument; counter comparison
> missed a symmetric typo.

Each step was a *point* fix to the last reported shape. The change that finally
ends the sequence for the command class is different in kind: it stops
describing what a wrong command looks like and instead pins the commands to the
bundle that already defines them. Where a canonical source exists, validate
against it; enumerate prohibited shapes only where none does.

That distinction is the reusable lesson from this session, and it is proposed
for the guidance corpus at Step 9 rather than asserted here.

## Bound status — the loop is spent

Discovery passes: 2 of 2. Remediation-review cycles: 2 of 2. **No further
discretionary verification round will be opened by this session.** These fixes
go to `close_session`, whose backstop verifies independently. If that backstop
finds another material Critical/Major in the gate, this session **stops to the
operator** with the full history rather than grinding — which is exactly the
L-095-1 failure mode (a salience-limited reviewer returning a fresh
technically-real finding every pass on an unbounded surface), and Set 095's 17
non-converging rounds are the precedent for not continuing.

## Gates

`tutorial_gate.py` exit 0; `drift_guard.py` exit 0; `test_tutorial_gate.py`
**83 passed**. Full suite re-run and recorded in the disposition.
