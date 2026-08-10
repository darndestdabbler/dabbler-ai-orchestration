# Set 116 Session 3 — conventions for round 3

Everything in [`s3-conventions.md`](s3-conventions.md) still applies.
This file adds what changed since round 1, so this round spends its
findings on the current tree rather than re-deriving history.

## Rounds so far

| Round | Phase | Verifier | Verdict |
|---|---|---|---|
| 1 | discovery, 2-lens fan-out | `gpt-5-6-sol` x2 | **VERIFIED** both lenses, zero Critical/Major, 5 nits |
| — | path-aware critique (`required`) | `gemini-2.5-pro` / `gpt-5.4` | **VERIFIED** / ISSUES_FOUND (1 Major) |
| 2 | close backstop, in-process | `gpt-5-6-sol` | **ISSUES_FOUND**, 1 Major |
| 3 | this round | — | — |

## What changed since round 1, and why

**All five round-1 nits were fixed** — see
[`s3-nit-dispositions.md`](s3-nit-dispositions.md). Three were documents
written in this session that stated something false about the code
beside them.

**The path-aware critique's one Major was dismissed as a false positive
on operator adjudication**, with an executable citation (a passing test
asserts exactly the behaviour the finding called false), and its one
real grain — an ambiguous backstop refusal message — was fixed. Record:
`decisions.jsonl`.

**The close backstop's Major was accepted in full** — see
[`s3-remediation-round-2.md`](s3-remediation-round-2.md). It was right,
and its evidence was this session's own three full pytest runs. The
policy no longer relabels a mid-loop full run as "targeted testing with
a wide net", and the path-aware critique is now named as a
**code-changing stage** that must precede the single full run.

## By-design, please do not re-report

1. **Everything in `s3-conventions.md` §"By-design exclusions"** still
   holds, in particular: the diff base is `0895d200` (an unrelated
   operator commit landed mid-session); zero test-count reduction is
   intended; demoted predicates deliberately still return their failing
   verdict; and there is a named, operator-attested residual about
   close-time `verification_method` enforcement.

2. **Three full pytest runs are recorded for this session, and they are
   left on the record deliberately.** `test-runs.jsonl` is append-only.
   The honest history of "the policy was learned by violating it" is the
   round-2 finding's own evidence and should stay checkable. The
   *policy* is fixed; the *history* is not rewritten.

3. **No suite was re-run for the round-2 remediation, on purpose.**
   Every edit in it is under `docs/`, and `covers` is a path prefix that
   does not include it. `run_of_record check --check` exits 0 against
   this tree with both runs fresh and green. Re-running 5 and 12 minutes
   of tests to "cover" a documentation edit is the reflex this set
   exists to correct.

4. **`checklist_posted` fails for this session and is deliberately not
   waived.** It is advisory under the ruling this session ships, so it
   warns and the close proceeds. Sets 116 S1 and S2 both needed an
   operator-attested waiver for that same gate; this is the first
   session of the three not to, which is the demotion working.

## A flow gap this round should know about (already named as a residual)

The close backstop's blocking message says to *"remediate, then
re-verify with `verify_session` (the sanctioned remediation loop)"*.
That instruction is **not reachable** after a backstop-only blocking
round: `--phase remediation-review` fails closed with *"no prior round
of this session recorded a `discoveryBaselineTree`"*, because round 1's
discovery round was clean and the backstop's own round does not record a
baseline. The in-budget path is a second **discovery** round, which is
what this round is.

This is a real gap in Set 116 S2's own work and is recorded as a named
residual rather than fixed here — fixing the backstop's baseline
recording mid-close, on a session the backstop is currently judging, is
exactly the self-modification the spec warned about.
