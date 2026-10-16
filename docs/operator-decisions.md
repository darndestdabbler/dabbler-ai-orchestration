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

## 2026-09-22 — No rule stands above finishing; plans change with approval; a proposal is the last resort

**In force.** Given after a consumer repository's AI could not get past
`published_when_releasable` -- the refusal said the declaration is *"made at
step (a), never here"* and named no way out -- and a sibling repository
commented the packaging block out of `dabbler.yaml` to close; and after the
operator, walking a JPA sample, wanted to switch SQLite for H2 mid-plan and
found the plan could not be changed. Consult round 21
(`docs/design/consults/round21-*.md`).

1. **No over-engineering.** The staff who will use this are ordinary
   developers and will reject ceremony. One verb, one dialog, reuse what
   exists.
2. **Every impasse has a way out. No rule is so sacred that it stands above
   the developer's need to get a solution over the finish line.** A human
   override with a reason is always available, including past a gate or a
   verdict. What survives is only honesty of the record: an override is
   recorded as an override -- closed as held, reason given -- never as the
   thing that did not happen, and is scoped to exactly what was approved.
3. **Plans are modifiable at any time in the life of a solution, with the
   operator's approval.** Agile, not waterfall. The immutable-declaration
   doctrine is subordinate to this.
4. **A proposal is the last resort.** The AI works within the rules first
   and asks for an exception only when it has exhausted them.
5. **The Mechanic, not a proposal verb** (later the same day, superseding
   the reviewer-rules-first shape and the closed menu that session 229 had
   begun to build). **Every option is measured against what a developer
   does when stuck: open another chat instance and tell it to fix the
   repository so things can get going again.** The Mechanic is that move
   made first-class. Its model is any with a fresh or different context
   that is at least as capable as the author's -- the one criterion the
   operator has proved over and over -- never the author's live session. It
   works in **prose, not a closed menu**: prose is the check-and-balance
   against a rule that has become an unreasonable obstacle. It is bounded
   by two things: the operator agrees before it acts, and its briefing. The
   two risks, each answered by an instruction: it might break the
   framework's own infrastructure, so it reads the rules first; it might
   change the author's work beyond what was needed, so it makes the
   **minimum viable unblocking fix (MVUF)** and records it as durable
   documentation. It diagnoses, recommends, and -- once the operator agrees
   -- makes the fix itself. Litmus test, passed without new machinery: the
   Mechanic can buy verification rounds past a cap (`verify reopen`).
6. **Nothing is scored.** Interventions are logged and listed at the
   close; a penalty for asking breeds concealment.
7. **The walk before the release, on a branch.** The Mechanic is built on
   `mechanic`, off master, and walked from a local VSIX on the Java sample
   with `claude-sonnet-5` authoring -- a plan that cannot be built as
   written (SQLite through `hibernate-core` only), a packaging block with
   no feed, a cap terminal -- before it is merged; the release follows the
   merge.

Planned as sessions 231 and 232. Sessions 229 and 230 are cancelled;
229's accepted work is kept on `experiment/proposals`, not to be merged.

---

## 2026-09-14 — Zero deadlocks first; then the module machinery goes, and the solution is planned by tier

**In force.** Given after the operator's staff watched the CSV tutorial
deadlock twice (`docs/framework-issues-log.md`), and after consult round 15
(`docs/design/consults/round15-brief.md`, `-sol.md`, `-gemini.md`,
`-synthesis.md`).

> There is a ZERO DEADLOCK TOLERANCE. No more. My developers won't use it if
> there are any more deadlocks.

1. **Order.** Fix the deadlocks and the other logged issues first, commit
   and push them — a point the module machinery can be brought back from.
   After that, deleting the module folder (the focused checkout), the
   in-repository packages and `docs/modules.yaml` is approved: sessions run
   in the developer's own checkout, siblings are project references
   (.NET `ProjectReference`, the Maven reactor), and the Solution Explorer
   is read from the solution's own build files.
2. **Releasing is a project-level setting, defaulting to on request.** A
   developer turns it to ship by default by right-clicking the solution and
   choosing *Ship by Default*. This repository ships by default (its
   Marketplace listing needs the updated code); a .NET or Java solution does
   not until its team adopts continuous delivery. This narrows the morning's
   ship-by-default ruling to the repositories that choose it.
3. **Deployment artifacts.** Real .NET solutions will want an IIS artifact
   or a Windows Service, depending on the deployable, and Java the
   analogous forms. A tutorial deploys nothing: it produces whatever
   artifact is easiest to test now — containers are acceptable — provided
   the framework or the AI knows how to produce the real forms later.
4. **The shop's default production split** is three tiers: an application
   tier that talks to an API tier (.NET or Java, per the solution), which
   talks to the database. Planning asks the developer and offers this as
   the default.
5. **Which tests run.** The whole suite runs at a session's end while it
   costs no more than about 5% of the session's time — 60 seconds for a
   20-minute session, 120 seconds for a 40-minute one. Past that, the tests
   named after the changed files run, with the tests of the projects that
   depend on them. Tests are named after what they test.
6. **Whole-suite runs at a large project's release** need no ruling of
   their own: releasing is the developer's setting (2).

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
