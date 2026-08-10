# Verifying prose is where the time went — Set 116 S3, measured

> **Status:** evidence note, written at the close of Set 116 Session 3
> from that session's own instrumentation. Not a reservation. Offered to
> whoever authors the next latency set.
>
> **Why it exists:** Set 116 removed ~10 minutes of suite time per run
> and an unbounded verification loop, and its own final session still
> took ~2h15 and $4.75 of routed verification. The suite was not the
> problem. This note says what was.

## The measurement

Session 3's routed spend: **13 calls, $4.75.** Where it went:

| Stage | Cost | Verdict | What the finding was about |
| :--- | ---: | :--- | :--- |
| Round 1 — discovery, 2 lenses | $0.79 | VERIFIED both | 5 nits, 3 of them doc wording |
| Path-aware critique, 2 critics | ~$2.5 | 1 VERIFIED, 1 Major | doc wording (a **false positive**, dismissed on operator adjudication with a passing test as the citation) |
| Round 2 — close backstop | $0.47 | 1 Major | doc wording (**correct**) |
| Round 3 — discovery, 2 lenses | $0.88 | 1 Major | doc wording (**correct**) |
| Round 4 — remediation-review | $0.07 | VERIFIED | — |

**The code was clean at round 1 and stayed clean.** Every Critical/Major
raised after the first round concerned the *prose* of
`docs/session-constitution.md`. Nothing found a defect in
`gate_checks.py`, `close_session.py`, `session_state.py`,
`run_of_record.py`, or any of the ~200 tests touched — the one real code
defect of the session (`_flip_state_to_closed` crashing once
`change_log_fresh` was demoted) was found by **the test suite**, before
verification ever ran.

## The mechanism, and why it does not converge

Two of the three prose Majors **were introduced by fixing the previous
one**:

1. Round 1 nit: *"the session ran a full suite before verification,
   which contradicts 'exactly once'."* It offered two remedies. The fix
   took the weaker one — relabel a mid-loop full run as "targeted
   testing with a wide net."
2. Round 2 (backstop) Major: *"that relabel authorizes the exact
   behaviour the set exists to remove."* Correct. The fix removed the
   relabel and added the path-aware critique to the ordering — which
   pushed `session-constitution.md` **11 tokens over its 4,000-token
   ceiling**, so prose had to be evicted to pay for it.
3. Round 3 Major: *"the evicted sentence was the only instruction to RUN
   the critique."* Correct.

That is a loop with a structural cause, not bad luck:

- **The document has a hard token ceiling that ratchets down only.** Every
  added clarification must evict another sentence. Eviction is where
  defect 3 came from, and the ceiling guarantees the next clarification
  will do the same thing.
- **An adversarial verifier rating findings Critical/Major/Minor will
  always find a truer sentence.** Prose has no green bar. A test suite
  converges because "passing" is decidable; a policy document does not,
  because "clearer" is unbounded.
- **The loop's cost is per-round and uniform**, so a one-sentence
  wording change costs the same routed round as a 200-line behaviour
  change.

## What to consider cutting

Offered as options, not a recommendation — the trade-off is the
operator's, and each of these *reduces verification*, so none is
self-authorizable.

1. **Take documentation-only deltas out of the per-session blocking
   loop.** Review them once at the set boundary, or with a deterministic
   check. A grep-able rule like *"every step number referenced by
   another step exists"* would have caught round 3's Major
   deterministically, for free, in milliseconds — it was a dangling
   cross-reference, not a judgment call.
2. **Sever the ceiling from the loop.** The ceiling is a good idea whose
   interaction with an adversarial reviewer is vicious. Either give
   guidance edits their own budget, or stop treating an over-ceiling
   edit as something to solve inside the same session that triggered it.
3. **Gate `Major` on a code surface.** A finding whose only evidence is
   a sentence in a `.md` file could be capped at Minor by construction —
   which under the existing loop rules means it records and does not
   re-round. This is the smallest change with the largest effect on this
   session's transcript: it converts three blocking rounds into three
   recorded nits.
4. **Note what already worked.** Round 4 cost **$0.07** because
   `remediation-review` reads only the fix delta. The expensive rounds
   are the ones that re-read the whole session. More of the loop being
   delta-scoped is a cheap win.

## One flow gap found on the way, worth fixing regardless

The close backstop's blocking message instructs: *"remediate, then
re-verify with `verify_session` (the sanctioned remediation loop)."*
**That instruction is not reachable** after a backstop-only blocking
round: `--phase remediation-review` fails closed with *"no prior round
of this session recorded a `discoveryBaselineTree`"*, because a clean
discovery round records no baseline and the backstop's own round records
none either. The orchestrator must instead spend a second full discovery
round (~$0.88) to get back onto the sanctioned path.

Set 116 S2 shipped the backstop's ledgering; recording a baseline
alongside it is a small addition and would have saved a full round here.
