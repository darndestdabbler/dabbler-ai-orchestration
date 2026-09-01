# Operator decisions of record

Decisions made by the operator (Dennis Mitchell) that govern this repository
and are not derivable from the code, the git history, or `AGENTS.md`.

This file exists because a reviewer reading the repository found no record of
decisions that had been made only in conversation, and correctly reported the
work as conflicting with rules the operator had already set aside. A decision
that lives only in a chat transcript is not a decision the next session, the
next engineer, or a verifying engine can see.

Newest first. Nothing here is machine-written; this is the operator's record,
kept by hand, and it is not a substitute for anything under `.dabbler/runs/`.

---

## 2026-08-29 — Future enhancement: session numbers should be decimals, so a session can be inserted

**Raised by the operator. Not in force — this is a direction for a later
set, recorded so the next person to feel the pain does not re-derive it.**

> We may want to make session numbers floats moving forward. That way we can
> just insert a new session in between by adding a decimal point.

**What prompted it.** Session 29 was asked for as a short session between 28
and 29. The lifecycle would not take an out-of-order number, so inserting one
meant renumbering every session after it: Transport II moved from 29 to 30,
the cutover from 35 to 36, and 38 lines across 15 files had to follow. D188
records what that cost and what it forced — live guidance had to move while
the append-only record deliberately did not, so the repository now contains
decisions from sessions 27 and 28 that name "session 29" meaning what is now
session 30. A reader has to know the renumber happened to read them right.

A decimal number removes the whole problem: session 29 would have been
**28.5**, nothing after it moves, and every statement already written stays
literally true.

**What it would touch**, from a scan rather than an audit — costing it
properly is part of the set that takes it on:

- **The next-number derivation, in both routers.** `max(completed) + 1` at
  `ai_router/session.py:464` and `:496`, and `Math.max(...completed) + 1` at
  `packages/router/src/session.ts:506` and `:537`. This is the rule that
  refuses an out-of-order number, and it is the actual constraint — the
  successor of 28 has to become "the next declared entry" rather than "one
  more than the highest closed one".
- **The schema.** `progress-projection.schema.json:229` pins `number` to
  `"type": "integer"`.
- **Parsing.** `int(...)` on numbers read from plan headings and CLI tokens —
  `ai_router/session.py:337`, `:359`, `:599`.
- **The zero-padded label.** `progress.py:90` is
  `str(number).zfill(SESSION_NUMBER_WIDTH)`, which gives `029`. `28.5` does
  not pad to the same width, and the label is what sorts directory listings.

**Two things to decide before building it**, both of which are why this is a
note and not a ticket:

1. **Do not store it as a float. Neither language has a decimal type.**
   TypeScript's `number` is an IEEE 754 binary double, and so is Python's
   `float`; Python at least ships `decimal.Decimal`, and TypeScript has no
   native equivalent at all. "Decimal session number" therefore has to mean
   a **string** (`"28.5"`) or a **scaled integer** (tenths: `285`), not a
   language float — and the reason is specific to this repository rather
   than general float-anxiety:

   - **Integer-valued floats already serialize differently in the two
     routers.** Python writes `29.0` where JavaScript writes `29`. This
     repository has a `PythonFloat` type solely to paper over that, and the
     parity control compares these records byte-for-byte. Making the
     session number a float would put that hazard on the primary key of
     every record instead of on a duration field.
   - **Halving is exact; typing is not.** `28.5`, `28.25`, `28.75` are
     dyadic rationals and are represented exactly, so an insert-by-halving
     scheme would in fact be safe. But a hand-written `28.1` or `28.3` is
     not exactly representable, and the numbers here are typed by a person.

   Ordering, not arithmetic, is the actual requirement — a version-style
   tuple or a plain "insert before" ordinal would satisfy it too, and a
   sortable string satisfies it without a new numeric type on either side.
2. **The port is mid-flight.** Both routers implement this rule, so changing
   it now means changing it twice and the parity control cannot see a
   behaviour change made on both sides at once. The cheapest moment is after
   the port's final session, when there is one implementation again — the
   same reasoning that deferred the malformed-`sessions.json` question.

**Not urgent.** One insertion in 29 sessions is the whole evidence base. The
note exists so the second one is not paid for at full price again.

---

## 2026-08-23 — Constraints set aside for the duration of the rebuild

**Authorized by the operator.**

> I am authorizing that we set aside any and all previous decisions that could
> prohibit developing a better solution.

This supersedes, for the duration of the rebuild, every prior constraint that
would block arriving at a better design — including but not limited to:

- **`AGENTS.md` ground rule 1** — "No new module without deleting one."
- **`AGENTS.md` ground rule 4** — the test budget of 480 Python / 215 TS.
- **`AGENTS.md` ground rule 8** — LOC budgets as targets.
- **"The envelope sets 142–147 run under"** — the whole table, its per-dimension
  ceilings, and the requirement that `verify.py` finish under 1,200 lines. The
  envelope was scoped to sets 142–147 and is not the authority under which this
  work proceeds.
- **`docs/run-core-blueprint.md` §12.17** — "the replacement must be markedly
  smaller than what it deletes." Size is no longer the acceptance test for the
  rebuild. The question it stood in for — does the new core actually replace the
  old one rather than sit beside it — is answered separately and independently
  by `tests/test_runcore_independence.py`.
- **The blueprint's module inventory as a ceiling**, and its deletion list where
  that list would prevent building something better.
- **The working-branch rule** naming `experiment/verification-pipeline-v3`. Work
  is proceeding on `spike/thin-run-core` and `design/solution-decomposition`.

**The intent, stated so it is not over-read.** This is permission to design
freely, not permission to sprawl. The constraints are suspended because they
were written to protect a design that is being replaced, and measuring the
replacement against them produces bad decisions in both directions — cramped
design, and creative accounting to satisfy a number.

**Constraints will be restored once there is something better that works**,
measured against the new baseline rather than the old one. Restoring them is
part of finishing, not an optional follow-up. The operator's reasoning: a
runaway train is the natural failure mode of working with eager AI engines that
want to demonstrate their value, and the ceilings exist to stop it. They stop
being useful only while the shape of the thing is still being decided.

**What is NOT set aside**, because none of it protects a design:

- The machine owns the record. Nothing under `.dabbler/runs/` is hand-edited or
  exempted, and no code path accepts a hand-written verdict.
- Verdicts come from the verifier. A token not received from the verifier does
  not exist.
- API keys live in environment variables, never in files or logs.
- One implementation of any rule, in one language: TypeScript renders, Python
  decides.
- One test per behavior, and the banned test kinds: no falsifier twins, no
  source-text assertions, no migration-path tests, no tests of test
  infrastructure.
- No process ceremony on this repository itself.

---

## 2026-08-23 — Solution decomposition becomes the defining objective

The framework's purpose is decomposing **the solution itself** — components,
libraries, published artifacts, interfaces — not decomposing **the work needed
to produce a solution**, which an earlier version of this framework already did.
Both halves are load-bearing: each component small enough to build with little
AI context, *and* the integration small enough to reason about because the
components are genuine black boxes.

Full proposal in `docs/solution-decomposition-direction.md`.

---

## 2026-08-23 — Components are isolated per solution

Components belong to their solution. Cross-solution shared libraries are not the
goal, despite being conventionally virtuous. Redundant implementations across
solutions are acceptable and preferred, with AI reading across solutions
periodically to spot alignment opportunities — producing a **report, never an
automatic refactor**.

**Reasoning:** shared libraries trade duplicated code for coordination cost, and
coordination is exactly the cost AI does not reduce.

**Boundary:** duplicate mechanism freely, share meaning deliberately. Where
divergence between two solutions is a correctness defect rather than an
inconvenience — terminology and code sets, wire formats, units, regulatory rules
— it belongs in one versioned artifact even under this decision.

---

## 2026-08-23 — Integration-driven design (IDD) is the build sequence

Decomposition lands, then interface contracts, then **the integration built
against mocks first**, then mocks replaced by real implementations. The
integration's needs drive the contracts, not the reverse.

---

## 2026-08-23 — Findings are never discarded

Every finding a verifier writes is recorded, whatever its severity and whatever
section it was filed under. Severity is honest description; whether a finding
blocks is a separate decision made elsewhere. Erasure is worse than
mis-severity, because a wrong severity still leaves something a human can
overrule and an erased finding leaves nothing at all.
