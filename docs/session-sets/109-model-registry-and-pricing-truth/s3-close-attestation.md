# Session 3 close — operator-directed close over a residual backstop finding

## The attestation

The operator directed this session to close, three times and in writing:

1. Ahead of an offsite: *"strive to close that session, even if it means that
   you have to defer something. … I authorize you to do up to two more rounds
   with the current AI engine, and up to one more round with a third AI engine,
   but then close the session after that."*
2. *"Wow, this session has gone on for over 3 hours. Can we finish this?"*
3. *"Can you please close the session"*

The authorised round budget was spent in full: rounds 4 and 5 on the current
engine (gpt-5-6), round 6 on a third engine (google / gemini-3-1-pro). The
close backstop then ran three further rounds of its own (7, 8, 9 in the
framework's numbering); the findings from rounds 7 and 8 were **accepted and
fixed** rather than waived. Round 9's finding is the residual this attestation
covers.

This is an **operator-directed close**, not a self-authorised one, and not a
claim that verification returned clean.

## What is actually residual

One Major from the final backstop round, unfixed and undisputed:

> **Periodic OpenAI reviews propose deleting an already-encoded long-context
> tier.** Once a human has hand-encoded OpenAI's long-context tier as a
> `pricing:` block with an explicit `max_input_tokens`, a later `--fetch` —
> which by design proposes only the short-context rate, because the page never
> states the boundary — will diff that flat rate against the encoded schedule
> and propose replacing it, silently dropping the tier the operator added.

It is real, and it is a **direct consequence of a deliberate design decision**
made in round 1 and never challenged since: the tool refuses to invent the
boundary OpenAI does not publish. The failure needs a human to have encoded the
tier first, so it cannot occur until someone does — and no entry in
`router-config.yaml` has one today.

**Owed to Session 4**, alongside the other residuals: either have `--fetch`
preserve an existing `max_input_tokens`-bearing OpenAI schedule instead of
proposing a flat replacement, or mark such an entry as operator-curated so the
diff skips it.

## The other residuals, all previously documented

- `_google_section_rates` returns `None` when a section's price row labels are
  absent, which is indistinguishable from a per-model label rename. A **global**
  rename is already fatal (every section loses its labels, `parse_google`
  yields nothing, `_require` fires); the uncovered case is a rename affecting
  one model and not its ninety-nine neighbours.
- The Anthropic display-name derivation is rule-based; an id shape it cannot
  derive is reported `NOT CHECKED` rather than proposed. Vacuous against this
  registry — all four Anthropic ids derive correctly, asserted by test.
- OpenAI's long-context tier is reported, never proposed. By design since
  round 1; the residual above is its consequence.

## What the evidence actually supports

- **Suite: 3406 passed, 6 skipped, 8 deselected, 0 failed.** +149 over Session
  2's 3257 baseline — exactly the new tests, with no existing test changed,
  removed, or newly skipped.
- **Nine routed verification rounds across three providers.** Every finding was
  in **one module** (`pricing_proposal.py`) and, bar one date-ordering fix, on
  **one question**: how a parse failure is classified.
- **Nothing in nine rounds touched** `ai_router/pricing.py`, any of the six
  wired consumers, the cost calculation, the schema validation, or any rate in
  `router-config.yaml` — the parts of this session that other code depends on.
- The live `--fetch` run has produced **byte-identical output across every
  round** since round 1: 5 rate changes, 5 confirmations, 2 reported unchecked,
  exit 1, config untouched.
- Two **falsifier checks** were run and restored: reverting `_calculate_cost`
  fails the wiring test; flipping the sort scalar to cheapest-available fails
  two more.

The honest summary is that the remaining findings are on a scraper's tolerance
of hypothetical future page shapes — L-095-1's unbounded-artifact pattern,
where a salience-limited reviewer returns a fresh technically-real finding each
pass. That pattern does not converge on its own, and the operator's decision to
stop funding rounds is the correct response to it, not a compromise.
