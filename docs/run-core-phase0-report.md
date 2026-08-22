# Phase 0 external slice — implementation report

**Status:** The external scratch slice of `docs/run-core-blueprint.md` §§3–9
plus §11 is implemented in this disposable repository, under ordinary Git and
direct pytest. The production repository and the VS Code extension are
untouched. This document records what was built, what the blueprint left
undefined, and what those gaps were resolved to.

Per the blueprint's §0 rule, every gap below is reported as a **blueprint
defect** rather than filled with an invented contract. Where a section
mandated a behavior whose vocabulary the blueprint does not supply, the
behavior is *not* implemented and the gap is named.

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

Five new schemas under `ai_router/schemas/`: `run-event`, `run-projection`,
`session-organization`, `verification-request`, `verification-result`.
`router-config.schema.json` gains the §5.3 `run_policy`, `git`, `explorer`,
and `worktree` blocks; `config.py` gains their defaults.

**Preserved unchanged**, as §10 requires: `verdict.py` (parsing, severity,
blocking classification, `validate_session_verdict`), `identity.py`,
`selection.py`, `route.py`, both transports and the transport-precedence
rules, `pricing.py`, `seat_cost.py`, `metrics.py`. `affected.py`'s
`testing.selection` contract is *reused*, not reimplemented: `checks.py`
imports `load_selection_config`, `select_tests`, and `targeted_command`.

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
| 15 | Framework overhead in `fast` ≤ 10 s | pass, thin margin — see §4 |
| 16 | HL7-class benchmark | blocked on operator input (§15.2) |
| 17 | Replacement markedly smaller than what it deletes | **at risk** — see §4 |

109 new tests, one behavior each. No falsifier twins, no source-text
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
*Resolved:* the edge is implemented. The fold permits `run.finished(completed)`
from `waiting`. **§4's diagram needs the edge added.**

**D2. Organizational events have no run to name.**
§3.2 makes `run_id` required on every envelope. §3.3 lists
`organization.cancelled` / `organization.restored` as operator events whose
target is a set or a session — which may have no run at all (cancelling a
never-started session is the common case). The blueprint specifies no value.
*Resolved:* a reserved `r0000-organization` id (`r0000` is never allocated by
the §2 counter, so it cannot collide), and the fold skips organization events
entirely. Folding one into a run is wrong independently: cancelling a session
is not a move in any run's state machine, and folding it into a *terminal* run
would read as reopening it. **§3.2 should either allow a null `run_id` or name
the reserved value.**

**D3. §5.2.1's `fast` escalation for unknown selection has no token.**
> "Unknown selection … records `selection-unknown`, and escalates `fast` to
> `verified` or blocks verification until the operator resolves/overrides it."

§5.3's trigger list is closed and contains no token for this.
`no-declared-check` is not it: that token means *no declared check `covers`
the changed path*, which is a different declaration from *no
`testing.selection` rule maps it*. A path can be covered by a suite and still
be unmapped by selection.
*Resolved:* the **verified** half is implemented literally — `verify` refuses
`selection-unknown` until the risk is resolved or the targeted stage ran under
the attested operator override. The **fast** half is **not implemented**: no
token exists for it and one was not invented. **§5.3 needs a
`selection-unknown` trigger token, or §5.2.1 needs to drop the fast-side
escalation.**

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
*Resolved:* §7's shape is implemented; the ask is the session's title.
**§11.2's `--ask` spellings are stale.**

**D5. §5.3 names a `--policy verified` flag that §7's `run --register` row
does not carry.** *Resolved:* `--policy` is implemented as an optional
override on `run --register`; it is additive and does not change the default
resolution order (session policy, then `run_policy.default`).

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
*Resolved:* the run's ordinal among runs linked to the same session — a retry
after a failed attempt is attempt 2. Fixed at `run.created` and carried on
every event of that run. This is the only reading consistent with §6.3's
"a failed attempt … can be retried as a new run linked to the same session".

**D8. `run.cost_updated.dispatch_id` is never defined.** §9.1 has
`request_id`; §9.2 has `request_id` and `attempt`. §5.2 requires "the latest
update per dispatch" so a seat correction replaces rather than doubles.
*Resolved:* `dispatch_id = "<request_id>:<attempt>"`, derivable from the
persisted result so a later measurement can address the same dispatch.

**D9. §3.4 lists no schema for the v5 `session-state.json`,** though §10's
break 3 says it "gains schema v5". *Resolved:* derived from §6.2's field list
(status, revision/digest, ordered sessions with status, linked run ids,
current run, timestamps, verification summary, cost). It is a generated,
ignored, regenerable view, so it is validated only by its producer. **§3.4 or
§6.2 should say whether a v5 set-document schema is wanted.**

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
`worktree create`, refusing `generated-views-not-ignored`, rather than forking
`snapshot_worktree_tree`'s semantics (which §5.1.3 pins verbatim). This is a
**new refusal token** — the one place this slice added vocabulary, because the
alternative was either to violate §5.1.3 or to violate §12.10.

## 4. Two measurements the operator should see before cutover

### 4.1 The slice is 2.6× its §13 size budget

Raw line counts of the six new modules, against the §13 targets:

| Module | Raw | Code only | Target | Ratio (raw) |
| --- | ---: | ---: | ---: | ---: |
| `journal.py` | 546 | 368 | 250 | 2.2× |
| `runcore.py` | 725 | 536 | 350 | 2.1× |
| `runproject.py` | 659 | 539 | 300 | 2.2× |
| `checks.py` | 442 | 335 | 200 | 2.2× |
| `verifyjob.py` | 651 | 539 | 400 | 1.6× |
| `runcli.py` | **1,517** | 1,284 | 250 | **6.1×** |
| **Total** | **4,540** | **3,601** | **1,750** | **2.6×** |

Plus 1,625 lines of new schema JSON and 1,583 lines of new tests.

Ground rule 8 says a module that wants 2× its budget is a signal to stop and
reconsider the design rather than justify it, so this is surfaced as a
decision rather than absorbed. Three observations:

- **`runcli.py` at 6× is the real outlier, and it is not a design choice.**
  §7 specifies 15 verbs (`run`, `checkpoint`, `guidance`, `escalate`, `check`,
  `verify`, `finish`, `resume`, `status`, `doctor`, `configure transport`,
  four `organize` forms) and §11.2 adds three more (`worktree
  create/init/remove`). The §13 estimate of 250 lines predates counting them.
  Roughly 180 lines are the parser and 170 are the §11 worktree lifecycle,
  which §13's table does not budget for at all.
- **The five uniform ~2.2× modules are documentation density, not design.**
  Code-only lines are 3,601 against 4,540 raw; the ratio matches the existing
  codebase's, which is what ground rule 7 asks for.
- **§12.17 still passes, but the margin is much thinner than advertised.**
  Against the unconditional cutover-deletion rows measured the same way:

  | | Raw | Code only |
  | --- | ---: | ---: |
  | Deleted (`session`, `verify`, `gates`, `writers`, `affected`, `test_evidence`) | 5,801 | 4,535 |
  | Added (six new modules) | 4,540 | 3,601 |
  | **Net** | **−1,261** | **−934** |

  The blueprint projected ~5,450 deleted for ~1,750 added. The real
  unconditional trade is ~5,800 for ~4,540. That is still a reduction, and the
  conditional v3 row (§13, ~3,580 lines, pending set 146) would widen it
  substantially — but "markedly smaller" is now a 22% reduction, not a 68%
  one. **This is the §12.17 judgement call, and it is the operator's.**

### 4.2 §12.15 passes with about 30% headroom

Measured on a scratch repository with a trivial suite, framework overhead
excluding the checks' own runtime and interpreter startup:

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

The cost is not the journal. It is per-invocation Python import of the whole
`ai_router` package (httpx, jsonschema, yaml) multiplied by four CLI
invocations, plus a large number of `git` subprocess calls per command on
Windows. Two consequences worth planning for:

- a longer journal makes this worse: the projection is rebuilt after **every**
  append (§6.1 requires it), and each rebuild re-reads and re-validates every
  event, so the per-command cost grows with the run's own history;
- a real repository has more sets and specs to hash for
  `organization_digest`, so 6.97 s is a floor, not a typical figure.

Neither is a blueprint defect — §6.1's "after every append" is deliberate and
correct. But the 10 s ceiling is close enough that the benchmark in §12.16
should measure it on the real repository before cutover.

## 5. Dogfooding stage

This slice sits at Sol's stage 1, **external build**: implemented with plain
agent sessions, ordinary git, and direct pytest, in a disposable repository.
The new framework was never its own prerequisite or gate at any point. Stage 2
(shadow observation) begins only after the operator accepts §12.17 and closes
or cancels the in-flight v3 sequence per §15.1.
