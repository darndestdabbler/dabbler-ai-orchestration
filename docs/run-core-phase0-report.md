# Phase 0 external slice — implementation report

**Status:** The external scratch slice of `docs/run-core-blueprint.md` §§3–9
plus §11 is implemented in this disposable repository, under ordinary Git and
direct pytest. The production repository and the VS Code extension are
untouched. This document records what was built, what the blueprint left
undefined, and what those gaps were resolved to.

Per the blueprint's §0 rule, every gap was first reported as a **blueprint
defect** rather than filled with an invented contract. After review, six of
them were resolved in the blueprint itself and the code now follows the
resolved contract; §3 records both the defect and its resolution. §4 answers
the review's integrity findings and §5 gives the measurements the cutover
decision needs.

---

## 1. What landed

Six modules under `ai_router/`, matching the §13 ownership table exactly — no
seventh module, no per-verb shims:

| Module | Owns |
| --- | --- |
| `journal.py` | Envelope, append+lock+fsync, sequence, read-after, truncation tolerance, heartbeat |
| `runcore.py` | Run identity, state fold, transitions, preconditions, escalation triggers, resume probe, worktree preparation |
| `runproject.py` | `run-projection.json`, spec parsing, organization join, the four documents |
| `checks.py` | Declared-check loading, targeted selection, execution, tree measurement |
| `verifyjob.py` | Request/Result contracts, evidence manifest, dispatch, rounds, remediation |
| `runcli.py` | The §7 verbs, JSON I/O, exit codes |

`router-config.schema.json` gains the §5.3 `run_policy`, `git`, `explorer`,
and `worktree` blocks; `config.py` gains their defaults.

Six new schemas under `ai_router/schemas/`: `run-event`, `run-projection`,
`session-organization`, `session-state-v5`, `verification-request`,
`verification-result`.

**Preserved unchanged**, as §10 requires: `verdict.py` (parsing, severity,
blocking classification, `validate_session_verdict`), `identity.py`,
`selection.py`, `route.py`, both transports and the transport-precedence
rules, `pricing.py`, `seat_cost.py`, `metrics.py`.

**Owned outright, not borrowed.** §5.1 says the `testing.selection` contract
"moves behind `checks.py` rather than being reimplemented", and that is what
happened: the selector, the throwaway-index tree snapshot, the path-prefix
matcher, and the git plumbing now live in the run core, and no run-core
module imports anything the cutover deletes. §5 measures what that costs and
what it makes removable.

**Not implemented, by instruction:** dependency scheduling, an Agent SDK, the
Explorer/extension gate (§8, §12's extension items), the §12.16 benchmark
(awaits the operator's HL7-class task).

## 2. Acceptance status (§12)

| # | Criterion | Status |
| --- | --- | --- |
| 1 | `fast` end to end, four documents, byte-identical replay | pass |
| 2 | Zero framework model calls in `fast` (transport stub) | pass |
| 3 | `verified`: one dispatch clean; dispatch → remediation → dispatch; round 2 carries the fix delta | pass |
| 4 | No input anywhere accepts a verdict token | pass |
| 5 | A request omitting the working provider is refused at dispatch | pass |
| 6 | Coordinator killed after append, before projection write | pass |
| 7 | Torn final line repaired; complete object missing its newline preserved | pass |
| 8 | `status --after` contiguous; stored gap is `journal-corrupt` | pass |
| 9 | Each trigger fires once; budget ceilings pause in either policy | pass |
| 10 | Dirty registration, empty diff, second live run refused; prepared worktree copies no WIP; machine state never committed | pass |
| 11 | Tree-mutating check rejected; an edit invalidates prior evidence; the commit is the accepted tree | pass |
| 12 | Four crash windows, all idempotent | pass |
| 13 | Schemas reject malformed payloads; run-core defaults load; invalid declarations and limits fail at load | pass |
| 14 | Full suite refused as targeted evidence outside the three exceptions; remediation order proved; `fast` runs the suite once | pass |
| 15 | Framework overhead in `fast` ≤ 10 s | pass — see §5 |
| 16 | HL7-class benchmark | blocked on operator input (§15.2) |
| 17 | Replacement markedly smaller than what it deletes | **operator's call** — see §5 |

126 new tests, one behavior each. No falsifier twins, no source-text
assertions, no migration-path tests, no tests of test infrastructure.

## 3. Blueprint defects

Each of these is a place where the blueprint mandates or implies a behavior it
does not fully specify. The resolution column says what this slice does; none
of them invents new vocabulary except where explicitly noted.

### 3.1 Blocking — the specified behavior is unreachable without a decision

**D1. §4's state diagram omits `waiting → completed`.**
§5.2.6 lists three operator exits from the round-cap wait, one of which is
`finish --waive "<reason>" --attest-operator`. §7's `finish` row says a waiver
requires green checks and a non-empty reason. But the §4 mermaid diagram has
edges from `waiting` only to `running`, `failed`, and `cancelled`. As written,
the documented waiver exit is impossible.
*Resolved in the blueprint:* §4's diagram now carries
`waiting --> completed: run.finished (operator WAIVED, checks green)`, and the
fold permits it.

**D2. Organizational events have no run to name.**
§3.2 makes `run_id` required on every envelope. §3.3 lists
`organization.cancelled` / `organization.restored` as operator events whose
target is a set or a session — which may have no run at all (cancelling a
never-started session is the common case). The blueprint specifies no value.
*Resolved in the blueprint:* §3.2 now states that `run_id` is `null` on the
two organizational events and required everywhere else, and the envelope
schema enforces exactly that. The reserved-sentinel workaround this slice
first used is gone. The fold skips these events regardless: cancelling a
session is not a move in any run's state machine, and folding one into a
*terminal* run would read as reopening it.

**D3. §5.2.1's `fast` escalation for unknown selection has no token.**
> "Unknown selection … records `selection-unknown`, and escalates `fast` to
> `verified` or blocks verification until the operator resolves/overrides it."

§5.3's trigger list is closed and contains no token for this.
`no-declared-check` is not it: that token means *no declared check `covers`
the changed path*, which is a different declaration from *no
`testing.selection` rule maps it*. A path can be covered by a suite and still
be unmapped by selection.
*Resolved in the blueprint:* §5.3's closed list gains a distinct
`selection-unknown` token, and says explicitly that it and `no-declared-check`
are different declarations neither of which implies the other. Both halves are
now implemented: a `fast` run escalates under the new token, and `verify`
refuses `selection-unknown` until the risk is resolved or the targeted stage
ran under the attested operator override. A path that is both uncovered and
unmapped fires both triggers, in §5.3's order — each is fixed in a different
place.

Related: §5.2.1 says "resolves/overrides" without naming the override. This
slice accepts §7's `check --stage targeted --allow-full "<reason>"
--attest-operator` as that override, on the grounds that it is the only
attested targeted-stage override the contract defines and that running
everything does in fact cover the unmapped path.

### 3.2 Contradictions between sections

**D4. §11.2 and §7 disagree on how a run is named.**
§11.2 writes `worktree create --ask "<text>" [--policy ...]` and references an
in-place `run --register --ask`. §7's table gives
`worktree create --set <slug> --session <N>` and
`run --register (--set <slug> --session <N> | --run <prepared-id>)`.
The §7 form is also the only one that can populate `run.created`'s required
`set_slug` and `session_number`.
*Resolved in the blueprint:* §11.2 now reads
`worktree create --set <slug> --session <N>` and
`run --register --set <slug> --session <N>`, matching §7, and says why: the
session's title supplies the ask because `run.created` requires `set_slug` and
`session_number`.

**D5. §5.3 names a `--policy verified` flag that §7's `run --register` row
does not carry.** *Resolved in the blueprint:* §7's row now carries
`[--policy fast|verified]` and states the resolution order — the flag, else
the session's declared policy, else `run_policy.default`.

**D6. §5.5 and §7 disagree on what a failed recovery probe does.**
§5.5: "A probe failure puts the run in `waiting(operator)` with the
discrepancy named." §7's `guidance` row: answering a wait "first passes the
§5.5 recovery probe", which implies a refusal there.
*Resolved:* both, in their respective places. `resume` on a running or
remediating run parks it with the discrepancy as the wait's question;
`guidance --answer` refuses `probe-failed`, because you cannot answer your way
past a discrepancy that still stands.

### 3.3 Under-specified fields

**D7. The envelope's `attempt` is never defined.** §3.2 requires it; §6.1
shows `"attempt": 1` on a run row; §6.2 refers to "each linked run attempt".
*Resolved in the blueprint:* §3.2 now defines it — the run's ordinal among
the runs linked to the same session, fixed at `run.created` and carried
unchanged on every later event of that run. This is the only reading
consistent with §6.3's "a failed attempt … can be retried as a new run linked
to the same session".

**D8. `run.cost_updated.dispatch_id` is never defined.** §9.1 has
`request_id`; §9.2 has `request_id` and `attempt`. §5.2 requires "the latest
update per dispatch" so a seat correction replaces rather than doubles.
*Resolved in the blueprint:* §5.2 now defines
`dispatch_id = "<request_id>:<attempt>"` — the identity of one transport
attempt, derivable from the persisted result so a later seat measurement can
address the dispatch it is correcting.

**D9. §3.4 lists no schema for the v5 `session-state.json`,** though §10's
break 3 says it "gains schema v5". *Resolved in the blueprint:* §3.4 now
lists `schemas/session-state-v5.schema.json`, the file exists, and the
projector validates every set document it writes against it. v4's frozen
schema still covers the historical files this projector never rewrites.

**D10. §9.2's `raw_output_ref` example (`round-1-response.txt`) has no room
for a second attempt,** although the same section requires retries to create
`attempt: 2`. *Resolved:* `round-<n>-attempt-<k>-response.txt` and
`round-<n>-attempt-<k>-result.json`; the request keeps §9.1's specified
`round-<n>-request.json`.

**D11. `verify` on a `fast` run has no specified behavior.** §1 says `fast`
makes zero framework model calls; §7's `verify` row lists only state
preconditions. *Resolved:* refused `policy-fast`, pointing at `escalate`. This
is what makes §12.2 enforceable rather than merely asserted.

**D12. §9.1's `orchestrator_identity.identityProvenance` is camelCase inside
an otherwise snake_case object.** Implemented verbatim as written, because the
JSON is normative. Flagged in case it is a typo.

### 3.4 An assumption that is not enforced anywhere

**D13. §6.2 asserts the generated views "cannot dirty or alter the candidate
tree" — but that holds only when §2's ignore rules exist.**
§5.1.3 pins `tree_digest` to `evidence.snapshot_worktree_tree`'s existing
semantics, which unconditionally drop only `.dabbler/`. In a repository whose
`.gitignore` lacks the three v5 generated filenames, the projector's own
writes would enter the candidate tree and the commit — which §12.10 forbids.
The blueprint specifies no behavior for that state; §11.1 assigns writing the
ignore rules to bootstrap.
*Resolved:* a fail-closed precondition at `run --register` and
`worktree create`, refusing `generated-views-not-ignored`, rather than
changing the snapshot's semantics (which §5.1.3 pins verbatim; the function
itself now lives in `checks.py`, unchanged). This is a **new refusal token** —
the one place this slice added vocabulary, because the alternative was either
to violate §5.1.3 or to violate §12.10.


## 4. Review findings, and what changed

A review of the first pass raised three integrity defects, a performance
defect, and one accounting objection. All five are addressed below. The
review's other three suspicions were checked and were not real: served-model
identity is validated before a result is built, git already excludes ignored
files from the candidate tree, and cost corrections do replace earlier values
by journal order.

### 4.1 Critical — recovery bypassed checks and verification

The commit-before-journal window is the one path that reaches `completed`
without going through `finish`, and it inherited `finish`'s conclusion instead
of re-deriving its proof: any descendant commit carrying the run trailer was
adopted and recorded `checks_green: true`.

A trailer is text anyone can type. Recovery now re-derives the proof.
`runcore.adoption_problems` requires a green `final-full` record bound to the
committed tree for every check the plan says is required and, for a `verified`
run, an accepted verdict bound to that same tree. Anything missing parks the
run for the operator with the specific gap named; it is never recorded as a
completion. `find_run_commit` returns the commit *and its tree* so the tree can
be held against the record, and `finish` refuses `tree-moved` when an existing
run commit does not carry the tree its checks just passed on.

Two tests replace the one that codified the old behaviour: an unproven commit
parks the run and names what is missing, and a `verified` run without its
verdict parks even with green checks. A third proves the safe case still
works — a real `finish` whose closing event is then deliberately lost is
adopted once and never re-committed.

A second defect surfaced while fixing this: `resume` parked the run and then
immediately resumed it in the same call, because the parked state fell through
the "not waiting" branch on the way out. `heal` now reports whether it parked,
and `resume` returns instead of un-parking.

### 4.2 High — journal-lock ownership race

The lock was created empty and filled a moment later, while an unreadable lock
counted as immediately stale. A contender could unlink a lock that was being
born, take its own, and then have that one deleted by the first holder's
unconditional cleanup — two writers, one mutex.

Both halves are fixed. An unreadable lock is now stale only after
`LOCK_BIRTH_GRACE_SECONDS` (10 s, against a create-to-write gap of
microseconds), and every holder writes a unique token and releases the lock
only while that token is still the one on disk. Reclaiming is therefore safe
even when the reclaim was wrong: the displaced holder cannot delete its
successor's lock. Two tests cover both halves.

### 4.3 High — organization parsed and hashed separately

`build_projection` parsed the specs and then re-read them to compute
`organization_digest`, so an edit landing between the two passes published old
content under the new digest — exactly the "this view is current" claim the
digest exists to make. `read_organization` now reads each spec's bytes once
and derives both answers from them.

Separately, `read_projection` accepted whatever JSON was on disk. §3.4
requires readers to validate before rendering, and this is the document a
reader is most tempted to trust because this package wrote it. It is now
validated against its schema, and an invalid one is simply not a projection —
the caller rebuilds.

### 4.4 High — projection performance

The review measured roughly 70 seconds to rebuild a 1,000-event journal and
diagnosed the full re-fold. The measurement reproduced (52 s), but the
diagnosis was only partly right: the dominant cost was `jsonschema.validate`
recompiling the nineteen-branch event schema on **every event of every read**,
plus a `git rev-list` per append for the repository id and a `git ls-files`
per set on every projection write.

| | before | after |
| --- | ---: | ---: |
| `read_events`, 1,000 events | 52.25 s | 0.11 s |
| full projection rebuild, 1,000 events | 52.09 s | 0.19 s |
| `status` on an unchanged journal | 0.06 s | 0.05 s |

What changed: the envelope and each event-type payload get one compiled
validator per process, dispatched on `event_type` rather than evaluating a
nineteen-branch `oneOf` (equivalent, because every branch is keyed by a
distinct const); the repository id and the v4-set detection are cached for the
life of the process; and `journal.batch` reads the journal once per lock and
hands the in-memory event list to the projection, so an append no longer costs
a second full read and re-validation.

Scaling is now linear at about 0.15 ms/event:

| events | journal | full rebuild |
| ---: | ---: | ---: |
| 1,000 | 0.5 MB | 0.19 s |
| 5,000 | 2.4 MB | 0.73 s |
| 20,000 | 9.7 MB | 2.89 s |

**The §8.1 two-second contract is crossed at roughly 14,000 events** — order
400–900 runs, since a run generates 15–40 events.
`test_runcore_independence.py` pins the 1,000-event case, so a regression is a
failing test rather than a slow Explorer.

**On incremental projection specifically.** The review asked for it and I did
not build it. The number that motivated it moved by 275×, and a persisted,
separately-invalidated fold state is a new machine record, a new divergence
mode between the incremental and full paths, and roughly 150 lines — bought
against a ceiling that measurement now puts several hundred runs away. §14
already forbids rotation and compaction in this version, so the eventual fix
for an unbounded journal is compaction, not a cache in front of it. **If you
want incrementality regardless, say so and it is a small follow-up** — but the
decision is better made against 0.19 s than against 70 s.

### 4.5 Major — the size reduction was not demonstrated

Correct, and this was the most useful finding. The first pass imported
`affected`, `evidence`, `ledger`, and `test_evidence` — all on the deletion
list — so the reported reduction assumed removals the code itself prevented.

The dependencies are now extracted rather than borrowed. §5.1's own wording
("the `testing.selection` contract … moves behind `checks.py` rather than
being reimplemented") is now literally true: the selector, the
throwaway-index tree snapshot, the path-prefix matcher, the git plumbing, and
the machine-directory constants live in the run core. `route.py` — a retained
module — imported `verify.auto_verify`; that task-level seam moved to
`verifyjob`, where cross-provider dispatch belongs, so no retained module now
reaches into the deletion set.

`test_runcore_independence.py` proves it two ways: a static import check per
module, and a subprocess import with every deletion-row module blocked at
`sys.meta_path`, so a lazy in-function import cannot hide.

One import remains: `bootstrap.py` takes `EXIT_BLOCKING` from `verify.py` to
format a v3 pre-commit hook. §13 already schedules bootstrap for rewrite in
the same cutover that removes that hook, so this is expected work rather than
a blocker — but it is real, and it is named.

## 5. The numbers the cutover decision needs

### 5.1 Size

| Module | Raw | Code only | §13 target | Ratio |
| --- | ---: | ---: | ---: | ---: |
| `journal.py` | 668 | 424 | 250 | 2.7× |
| `runcore.py` | 777 | 568 | 350 | 2.2× |
| `runproject.py` | 711 | 556 | 300 | 2.4× |
| `checks.py` | 800 | 570 | 200 | 4.0× |
| `verifyjob.py` | 716 | 587 | 400 | 1.8× |
| `runcli.py` | **1,586** | 1,327 | 250 | **6.3×** |
| **Total** | **5,258** | **4,032** | **1,750** | **3.0×** |

Plus 1,732 lines of schema JSON and 2,126 lines of tests.

The core grew by 718 raw lines against the first pass. That is the extracted
dependency, and it is the price of the reduction being real rather than
assumed. Two modules are worth naming: `checks.py` at 4.0× absorbed the whole
selection contract, and `runcli.py` at 6.3× is eighteen verbs (§7's fifteen
plus §11.2's three) whose 250-line estimate never counted them.

Against the cutover deletions, measured the same way:

| | Raw | Code only |
| --- | ---: | ---: |
| Added — the six new modules | 5,258 | 4,032 |
| Deleted — unconditional rows | 5,748 | 4,489 |
| **Net, unconditional only** | **−490** | **−457** |
| Deleted — conditional v3 row (pending set 146) | 3,570 | 2,414 |
| **Net, both rows** | **−4,060** | **−2,871** |

Tests on the same basis: 126 added against 135 superseded by the unconditional
rows (`test_session` 51, `test_verify` 48, `test_gates` 22, `test_affected`
14), for a net of **−9 tests**.

**Read plainly: on the unconditional rows alone this is a wash — an 8%
reduction, not a rebuild that pays for itself.** The economic case rests on
the conditional row, which is set 146's decision and not this slice's. The
blueprint projected ~5,450 deleted for ~1,750 added; the measured
unconditional trade is 5,748 for 5,258. §12.17 says a replacement that is not
markedly smaller than what it deletes has falsified the thesis. That
judgement is the operator's, and these are the numbers to make it on.

### 5.2 Framework overhead in `fast` (§12.15)

Scratch repository, trivial suite, overhead excluding the checks' own runtime
and interpreter startup:

```
run --register        1.53s
checkpoint            1.17s
finish                4.52s   (includes the suite)
status                0.53s
total wall clock      7.75s
  checks' runtime     0.14s
  interpreter boot    0.64s
  framework overhead  6.97s   (target: <= 10s)
```

The cost is per-invocation import of the whole `ai_router` package across four
CLI calls, plus a large number of `git` subprocesses per command on Windows —
not the journal. A real repository has more specs to hash, so treat 6.97 s as
a floor and measure it again during §12.16.

## 6. Dogfooding stage

This slice sits at Sol's stage 1, **external build**: implemented with plain
agent sessions, ordinary git, and direct pytest, in a disposable repository.
The new framework was never its own prerequisite or gate at any point. Stage 2
(shadow observation) begins only after the operator accepts §12.17 and closes
or cancels the in-flight v3 sequence per §15.1.
