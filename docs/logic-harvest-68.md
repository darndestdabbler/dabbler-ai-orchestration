# The logic-tree harvest, reconciled

Session 68's first act. The harvest ran outside this repository — in
`C:\temp\dabbler-logic-harvest\`, because a session was in flight and this
repository's close checks for a clean tree — and produced a model of the
framework's decision machine, eighteen findings, and a recommendation set.
This document is the reconciliation: **every finding read against the source
before any of them was acted on**, with a verdict and a disposition, so that
what was rejected is on the record beside what was taken.

## What the harvest is, and what it is not

The framework's decision machine was serialized into one model — the phase
edges out of `drive.ts`, the stops, the session-status machine, rounds and
dispositions, packaging's borrowed gates, evidence freshness, and the
owed-decision classes — annotated with three fields that do the actual work:

- **`actor`** — who must act for an edge to be taken;
- **`timeout`** — what happens if that actor never acts. A `null` timeout on a
  non-framework actor is a state the machine can sit in forever;
- **`observed_by`** — what evidence the transition is judged on. *"The actor's
  own report"* means self-attested.

That single `timeout` query would have found session 67's liveness gap without
anyone walking into it first.

**It does not find implementation slips.** A model review finds missing and
wrong edges; it does not find a mistyped mock, a stale count, or a spinner
sitting on a runner's partial line. Session 66 produced three of those and the
existing machinery caught all three cheaply — test selection, a deterministic
control before a verifier was paid, and the cross-provider verifier. This
**complements** preverify, the controls and the verifier. It replaces none of
them, and anyone who expects otherwise should be told so in those words.

## Calibration, and how much to trust each reviewer

The calibration test PLAN.md designed did not work: the model carried the four
known gaps in its own `note` fields, so both reviewers found them without
effort and the test measured nothing. **A reviewer that could not rediscover
the four known gaps is not calibrated, and its other findings are weighted
accordingly** — but that is not what happened here, because the seeds were too
easy for the measurement to mean anything. What discriminated the two was
something else: *how much each asserted that the code does not do*.

- **`gpt-5-6-sol`** marked its inferences as inferences, and every one was
  correct or correct-but-understated. It found the unresolved-at-cap cycle, the
  close-flip ordering and the `--force` status question independently, and all
  three survive this reconciliation. Two of its claims needed correcting, and
  both were corrected in the direction of the finding being *sharper* than it
  had it.
- **`gemini-3-1-pro`** was faster, shorter and materially less careful. Its V5
  scenario cannot occur as described — `runRound` compares `roundNumber > cap`,
  so a third round under a cap of three runs normally and exits 0; V5 needs a
  *fourth* entry. It then had the re-run hitting V7, but a clean round is not a
  terminal row (`TERMINAL_ROW_TYPES` is `adjudication`, `remediated_at_cap`,
  `waive`), so the re-run hits V5 again. Same outcome, different mechanism —
  and the difference decides the fix. It also missed the highest-value
  structural finding, the one cycle that fixing the tests cannot break.

**Weighting for next time: take Sol's structural claims seriously and check
Gemini's scenarios before quoting them.** Neither ranking was adopted whole;
both put publication-shaped findings at the top, which is where the prompt's
own seeds pointed them. If this is repeated, hold back **one** known gap and
grade on that.

---

## The findings

Verdicts: **REPRODUCES**, **DOES-NOT-REPRODUCE**, **SUPERSEDED**.
Dispositions: **ADOPTED** (this session, naming the step), **CARRIED**
(reproduces, ranked below this session's cut), **CLOSED** (nothing to do).

### F1 — The engine declares its own releasability

**Verdict: REPRODUCES.** `drive.ts phasePlan` passes `plan.releasable` — a
field the engine writes, in the same document as the steps — straight to
`declare()`, and only when `readTaskDeclaration()` returns null. From there
`phasePublish`, `packageSession` and `checkPublishedWhenReleasable` all read an
answer whose premise the engine supplied. Under the typed lifecycle a person
typed `--releasable`; under the driven one nobody does.

**Disposition: ADOPTED, in part, by `releasable-one-owner`.** What this session
takes is the half that removes the *disagreement*: `phasePublish` reads the
declaration, so one fact has one owner. What it does not take is removing
`releasable` from the planning ask so that the driver refuses to plan until a
person has declared — that changes what the entry asks of the operator on every
session, and the entry is the operator's to shape. **CARRIED** as a question for
a planning session, with the cheap form (`phasePlan` refuses until a
declaration exists) and the better one (the engine proposes, a disagreement
with the plan section raises an `external-consequence` decision) both recorded
here.

### F2 — The publish gap reopens through two doors

**Verdict: REPRODUCES**, both doors. `gates.checkPublishedWhenReleasable` asks
`readPackaging(root, current).length > 0`, and `cli/packaging.ts` records every
non-dry run including `outcome: "refused"` and `outcome: "failed"` — so an
attempt that shipped nothing satisfies the gate that exists to prove something
shipped. And `EVIDENCE_GATES` is `{verification_clean, verdict_vocabulary}`,
so `close --force` skips this one with *"skipped by --force (bookkeeping
gate)"*.

**Disposition: ADOPTED by `releasable-one-owner`.** The gate demands
`runIsPublished` — the predicate `packaging.ts` already owns — and moves into
`EVIDENCE_GATES`. Both reviewers ranked this in their top two independently,
and it is the csv-model incident reached from the other side: the operator's
way past a publish stop is `session close`, where this gate printed PASS.

### F3 — The unresolved-at-cap cycle never terminates

**Verdict: REPRODUCES** for the cycle; **DOES-NOT-REPRODUCE** for the budget
claim appended to it. `verify/rounds.ts terminateAtCap`'s UNRESOLVED branch
returns `EXIT_BLOCKING` and writes no round row; `phaseVerify` maps exit 4 to
`setPhase("dispositions")` unconditionally; `phaseDispositions` finds a
disposition set whose `round` still matches the unchanged latest round and
skips the engine entirely; `phaseFix` re-issues `fix-round-N`; preverify runs;
verify returns exit 4 again. `verdict.ts unremediatedFindings` is explicit that
a finding citing no evidence path can never be shown remediated, and
`evidencePaths` is optional in the verifier's output — one uncited blocking
Major makes the cycle unbreakable.

**The budget half is wrong.** The harvest says the budget stop's reason embeds
an incrementing invocation count, so two budget stops never compare equal and
the deadlock classifier can never fire on it. `invoke` refuses **before**
spending an invocation — `if (this.run.invocations >= this.run.max_invocations)`
— so the count cannot advance while the bound is met, and a re-run under the
same bound produces a byte-identical reason. The classifier fires. A test now
pins it (*"classifies a second budget stop under the same bound as a
deadlock"*), so a later edit to that message cannot quietly make the harvest's
version true. Nothing was changed in the stop.

**Disposition: ADOPTED by `unresolved-terminal`**, for the cycle: `EXIT_UNRESOLVED`
of its own, a stop that carries verify's listing of the uncited findings, and
the consumed disposition set cleared once its fix step has been issued. The
at-cap *stale preverify evidence* branch also stopped sharing `EXIT_BLOCKING`
in passing — it is the same refusal as the one that precedes any round, and it
now answers with the same `EXIT_USAGE`, where the driver's own heal already
knows what to do about it.

### F4 — Verification's terminal states have no edge out

**Verdict: REPRODUCES.** `runRound` refuses with `EXIT_USAGE` in three
situations the driven lifecycle reaches, and all three are instructions to
*advance*: a terminal row already stands (V7), the cap is reached and the
latest round left no blocking finding (V5), the cap is reached with disputed
blocking findings (V6). Before session 67 all three arrived as one opaque
sentence; after it they arrive as a stop carrying verify's own words, which is
better and still a permanent stop on correct work — a session whose run of
record fails after a clean at-cap verification can never close.

**Disposition: ADOPTED by `verify-terminal-edge`.** V7 and V5 are answered from
the rounds ledger before the job is spent, and route to `run-of-record`. V6
stays a stop: adjudication is a person's call, and the stop now says so in
verify's own words.

### F5 — Two components read two different fields for "is this releasable"

**Verdict: REPRODUCES.** `phasePublish` reads `this.requirePlan().releasable`;
`packageSession` and `checkPublishedWhenReleasable` read the declaration
through `sessionIsReleasable`. `phasePlan` writes the declaration only when
none exists, which is exactly the case in every session this repository's own
plan describes — *"Register; declare `--not-releasable`"*. They can disagree
freely, and both directions are bad: one publishes what was declared
not-releasable, the other deadlocks the close demanding a packaging row for a
phase that skipped itself.

**Disposition: ADOPTED by `releasable-one-owner`.**

### F6 — The close is terminal before its own bookkeeping, and push mode cannot recover

**Verdict: REPRODUCES**, both parts. `session.ts close()` calls
`flipStateToClosed` and only then commits and pushes the bookkeeping, so a
failure in either leaves the session out of flight with `run.phase === "close"`.
And `drive.ts register()` reads
`typeof inFlight === "number" || !this.pull ? null : this.uncollectedClose()`,
so under the push the recovery is never attempted: `start()` sees no session in
flight, finds N in `completedSessions`, and registers **N+1** over a
half-closed N.

**Disposition: CARRIED.** Both halves are small — drop `|| !this.pull`, and
either commit before the flip or introduce a durable `closing` status — but the
second is a change to the session-status machine, which is the machine this
session's model explicitly does *not* hold to the code. It should land with the
work that extends the control to cover it, and not before.

### F7 — No job has a wall-clock bound

**Verdict: REPRODUCES.** `Job` records `started_at` and `retry_after_seconds`
and neither is ever compared to now. `jobs.pollJob` answers `running` whenever
the status file is absent and `process.kill(pid, 0)` succeeds — which a reused
pid does, and a wedged child does. `vanished` covers the process that is gone;
there is no answer for the process that is there and not finishing.

**Disposition: CARRIED**, with its observation half adopted. A hard ceiling
that kills a session's own verification round is a behaviour change that
deserves its own measurement of what "generous" means for each job kind. What
this session takes instead is the half that costs nothing and tells the
operator: the watcher's `job-outstanding` rule, in `watcher-job-rule`. The
ceiling follows once the watcher has been watched.

### F8 — The `wait` instruction defeats the watcher as specified

**Verdict: REPRODUCES**, against the watcher as shipped in session 67.
`longWork` issues a NEW `wait` on every `next` with a fresh `issued_at`, a
`wait` owes no written answer by construction (`isOutstandingFor` returns false
for it), and `watcherReading` is quiet whenever `run.job` is set. So the rule
reads *not stalled* for as long as the engine keeps polling and would read
*stalled* the moment it stopped — backwards, and blind in exactly the window a
wedged job occupies.

**Disposition: ADOPTED by `watcher-job-rule`.** Two rules, not one, because
there are two counterparties: the engine, whose silence the tree measures, and
the framework's own job, whose silence its log measures.

### F9 — Two unbounded fix cycles, and the bound already exists

**Verdict: REPRODUCES.** `phasePreverify` and `phaseRunOfRecord` are bare
loops with no counter, and `config.ts` exports `runRoundCap` — documented for
exactly this — which no module under `src/` other than `config.ts` itself
mentions.

**Disposition: CARRIED.** It is small and the configuration is already there,
but it did not make this session's cut: unlike F3 and F4 it ends under the push
at the budget stop, and under the pull each turn is one the operator can see
and stop. It belongs with F7's ceilings, which meter the same thing.

### F10 — Under the pull, "not answered yet" and "answered wrongly" are one state

**Verdict: REPRODUCES.** `pullConverse` returns the outstanding instruction
whenever `isOutstandingFor` matches and never asks whether a *new* answer
exists; `judge` then reads whatever `report.json` holds and refuses it, and
each refusal increments a count that persists across calls by design. Three
premature `next` calls — a crashed wrapper, or an operator checking where things
are — stop a session on `rejected-thrice` for a step the engine never answered.

**Disposition: CARRIED.** Real, cheap and independent, and it belongs with the
pull's other ergonomics rather than in a session whose remaining budget is
spent on the model and its control.

### F11 — `blocked` is taken on the engine's word

**Verdict: REPRODUCES.** `askForStep` returns `"blocked"` on
`report.status === "blocked"` and raises `Stop("blocked")` with the engine's
notes. No files are required, no check is run. It is the one judgement in the
driven loop that is entirely self-attested, where every other engine claim is
measured against the tree or a check's exit code.

**Disposition: CARRIED.** The fix — require `files_changed` on a `blocked`
report and run the step's checks anyway, recording their result on the stop —
is the right shape, and it is a change to what a `blocked` report *means*,
which is worth landing beside F15's new reporting edge rather than in the same
session that invents it.

### F12 — `.dabbler/local-only` is invisible to every change-detection mechanism

**Verdict: REPRODUCES**, with Sol's version of it corrected. The marker is
invisible three times over — `.dabbler/` is gitignored so `working_tree_clean`
cannot see it, `snapshotWorktreeTree` drops `.dabbler` from its temp index so
the driver's own tree diff cannot see it, and nothing reads the directory for
provenance. And the two consumers apply different tests: `drive.ts phaseLand`
asks only `existsSync(marker)`, while `gates.checkPushedToRemote` asks
`existsSync(marker) && !hasRemote(root)`. **Sol inferred that this route closes
a session with remote delivery omitted; it does not** — the close gate is
stricter than the land and catches it, which is the two-judges pattern working.

**Disposition: CARRIED.** What remains after the correction is a divergence
between two tests of one fact, whose worst outcome is a confusing late stop
rather than a false record. It goes with F16, which is the other way the land
and the close disagree.

### F13 — Publication is self-attested

**Verdict: REPRODUCES.** `packaging.ts` returns `OUTCOME_PUBLISHED` when the
push step exits 0 for every artifact; the feed is never queried afterwards. The
module is careful about the *tree* — it re-digests after every command and
treats a moved tree as a failure — and not at all about the feed.

**Disposition: CARRIED**, and it belongs to the session that publishes. The
right shape is a `verify` step in the packaging declaration whose exit 0 means
the feed holds it, which keeps the router ignorant of any feed's API; until
that exists the honest token is `pushed`. Session 70 is the publication trial
and is where this will actually be felt.

### F14 — `REMEDIATED_AT_CAP` proves a fix by a path touch

**Verdict: REPRODUCES as a self-satisfiable guard; DOES-NOT-REPRODUCE as a
silent one.** The guard is satisfiable by the actor it constrains — the
disposition instruction hands the engine the cited paths verbatim through
`describeFinding`. But Gemini ranked it first and called it silent, and it is
the loudest thing the framework says: `checkVerificationClean` returns
*"remediated at the cap: … THIS WORK LANDS UNREVIEWED"*, the close prints it
beside the gate, the verdict token is `REMEDIATED_AT_CAP` rather than
`VERIFIED`, and the change log carries its own block.

**Disposition: CARRIED**, at low priority, in the tightened form the finding
itself proposes: the cited path touched **and** the step's checks green **and**
a non-whitespace change. Three cheap tests standing in for one expensive one.

### F15 — Halted-being-repaired has no edge, and no Send channel either

**Verdict: REPRODUCES in its first half; DOES-NOT-REPRODUCE in its second.**
There is genuinely no reporting edge out of a stop: two files were repaired
during session 66's halt, the report omitted them, and `judge` refused it by
comparing against the tree — correctly. But *"`session interrupt` explicitly
refuses when the run has stopped, so there is no Send channel either"* is out of
date: **session 63 made `interrupt` queue against a stopped run**, and
`drive.test.ts` covers it — *"holds a Send made against a stopped run and hands
it to the instruction that resumes it"*. The harvest read a doc comment that
the code had already outgrown, which is the failure mode this whole exercise is
about, arriving from the other direction.

**Disposition: ADOPTED by `rebaseline`**, scoped to the half that is real.

### F16 — The land commits whatever the run of record left behind

**Verdict: REPRODUCES.** `phaseLand` runs `git add -A -- .`, and
`snapshotWorktreeTree` includes untracked files, so anything the full suite
left in an un-ignored path has already moved the tree digest that
`verification_clean` compares against the verified round's `completion_tree`.
Committing it does not restore the match, and the remediation the gate prints —
*re-run `dabbler verify`* — walks straight into F4.

**Disposition: CARRIED**, with F12. Note that F4's fix removes the second half
of the trap: the re-run no longer stops forever. The first half — a late,
confusing stop where an early, actionable one was available — remains.

### F17 — `--force` closes as `complete`, indistinguishably

**Verdict: REPRODUCES at the session row; DOES-NOT-REPRODUCE at the
repository.** `progress.ts` publishes `forceClosed` on the repository, and
`AGENTS.md` already records that it is stamped at the repository level — which
is the sharper version of the complaint, because the record cannot even say
*which* session was forced. The session's own row and verdict token are
indistinguishable from an ordinary close.

**Disposition: CARRIED.** The fix is a terminal record that separates a close
from an administrative one, and it is the same class of change as F6's durable
`closing` status: the session-status machine, which this session's model does
not yet cover.

### F18 — Cancel-then-restore can re-open a closed session

**Verdict: REPRODUCES.** `RESTORABLE_STATUSES` includes `complete`, so a closed
session can be cancelled and its status stored; `restore` reads
`record["preCancelStatus"] ?? null` and then
`if (!RESTORABLE_STATUSES.includes(prior)) prior = STATUS_NOT_STARTED` — so a
record with no `preCancelStatus`, written by an older build or hand-edited,
restores a closed session to `not-started` and it becomes startable again.

**Disposition: CARRIED.** Low likelihood, one-line fix — `restore` refuses when
`preCancelStatus` is absent rather than guessing — and it is listed for the
same reason the harvest listed it: it is the same *class* as F2, an invariant
enforced in one place and derivable around.

---

## What this session took, and what it did not

**Adopted:** F2, F3, F4, F5, F15 (first half), F8, and the half of F1 that
removes the disagreement — as `verify-terminal-edge`, `unresolved-terminal`,
`releasable-one-owner`, `rebaseline` and `watcher-job-rule`.

**Carried:** F1 (the entry question), F6, F7 (the ceiling), F9, F10, F11, F12,
F13, F14, F16, F17, F18. None was dropped and none is closed; each says above
where it belongs. Three of them — F6, F17 and part of F18 — are the same
machine, the session-status one, and they should land with the work that
extends the control in `packages/router/lifecycle.json` to cover it. That
ordering is the point of the control: **an unheld model is deleted, so a
finding about a machine the model does not hold waits for the model to reach
it.**

**Closed:** nothing. Every finding either reproduced or reproduced in part, and
the three partial ones — F3's budget claim, F14's silence and F15's Send channel
— are recorded above as corrections to the reviewers rather than as findings.
All three were found by reading the code the finding named, which is the whole
argument for doing this step before any of the others.

---

## The model was NOT adopted, and is not in this repository

The plan gave two options and no third: *"If the model is adopted into this
repository it is held to the code the way the schemas already are… **If the
model is not adopted, it is deleted** — there is no third option in which an
unheld model stays in the tree."*

**It is not adopted, and it is not here.** No file in this tree carries the
machine — not as JSON, and not as a table in this document, which was the third
option in a different costume. The harvest's own
`C:\temp\dabbler-logic-harvest\model\lifecycle.json` is outside the repository,
unmaintained, and dated; that is where a curious reader goes, knowing what they
are reading. **The machine's one description that is always true is
`packages/router/src/drive.ts`.**

Holding a model *as a source* means the control fails whenever the code or the
model loses an edge, which needs every real transition declared **and** every
declared transition observed. The suite drives 21 of the machine's 38 phase
edges. The other 17 are error, retry, refusal and publication routes no test
reaches, and six of those are self-loops — a rejected report, a red targeted
suite — which the driver's phase lines cannot show at all, because the phase
does not change.

Three attempts to land less than that were refused by the cross-provider
verifier, each correctly and in the plan's own words:

1. **an `exercised` flag** on each transition, with the control asserting only
   that the flag matched what ran. That is an exemption: a `false` is a claim
   about coverage that lets a declaration sit in a source no test reaches.
2. **deleting the unexercised transitions** so the declared and driven sets
   were equal. That buys equality by narrowing the machine, and leaves a file
   named `lifecycle.json` in the router package reading as authoritative while
   nearly half of the real machine is outside it.
3. **keeping the whole machine here as prose**, under a "snapshot, not a
   source" disclaimer. A disclaimer is not a control. The rule is about the
   model, not about the file extension.

All three are the failure the operator's own rule names: *a hand-maintained
diagram of a state machine is worse than none, because it is trusted and
wrong.*

**What adopting it would take**, for the session that wants it: instrument
`setPhase` and the `Stop` constructor so every transition — self-loops
included — is observable rather than inferred from a log line; write the tests
for the 17 edges nothing drives (an adapter that cannot run, a malformed suite
declaration, a successful publication, a refused dispute, and the rest); then
the model lands with a control that fails in both directions, and every edge in
the file is one a test reaches. That is a session, not a step, and it is the
honest price of a model anyone may trust.

**What this session leaves instead**, which is not nothing: the findings above,
each read against the source; four of them fixed in the code; and the driver
edges the harvest found missing — the verification terminal states, the
unresolved cap, the heal into preverify — now real edges with tests, which is
where a model's value ends up anyway.
