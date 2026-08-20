# Targeted tests before verification, the full suite after

> **Purpose:** First set of the rewritten pipeline, and the one that fixes
> the recurring pain on its own. Orchestrators keep running the full suite
> before verification because prompt wording asked them not to, and prompt
> wording has never once been enough. After this set the economical path
> is the mechanically accepted one: `verify` refuses to dispatch without
> targeted selection evidence, an unapproved full-suite run is invalid
> pre-verification evidence, and the complete suite is recorded only
> against the final verified tree. **This set is worth shipping even if
> every later set is killed** — that is the test each set in this sequence
> has to pass.
> **Session Set:** `docs/session-sets/142-targeted-tests-and-run-of-record/`
> **Created:** 2026-08-19
> **Revised:** 2026-08-19 — rewritten for the plan-first, step-wise design.
> **Workflow:** Full
> **Baseline commit:** `fa3c28c7` on `experiment/verification-pipeline-v3`,
> after set 141.
> **Integration branch:** `experiment/verification-pipeline-v3`; child
> branch `verification-v3/set-142-targeted-tests`. **Not** developed on
> `master`.
> **Prerequisite:** set 141 complete.

> **Note on rule 6:** operator-authorized exception, as sets 136–141.

---

## Session Set Configuration

```yaml
requiresUAT: false
requiresE2E: false
pathAwareCritique: none
module: default
totalSessions: 3
prerequisites: []
```

---

## The relaxation this sequence runs under

The operator has relaxed two v2 ground rules for sets 142–145, on the
grounds that this is a rewrite of the verification pipeline rather than an
increment on it. **Ground rule 1 (no new module without deleting one) and
ground rule 4 (480 Python / 215 TS) do not bind these four sets.** They are
replaced by one envelope, measured against the post-141 baseline:

| Dimension | Baseline (`fa3c28c7`) | Ceiling (+33%) |
| --- | ---: | ---: |
| Python source | 12,650 LOC | **16,800** |
| Python modules | 25 | **33** |
| Python tests | 455 | **605** |
| TypeScript tests | 161 | 215 (unchanged) |

The envelope is a **ceiling for the whole sequence**, not a per-set budget
to spend down. Allocations are 142: 14, 143: 16, 144: 20, 145: 10 — sixty
tests total, reaching 515 of 605. The headroom is deliberate: it absorbs
being wrong, not scope growth.

Two rules survive the relaxation unchanged, because they are what the
ceilings were protecting:

- **One test per behavior.** No falsifier twins, no source-text
  assertions, no migration-path tests, no tests of test infrastructure.
  Set 141's reclamation ledger is the standard for what those look like.
- **A module earns its existence by making another module smaller.** New
  modules are now permitted; new modules that only add are not. `verify.py`
  is 1,886 lines and is the specific target: this sequence must leave it
  **under 1,200**, by moving code out rather than by adding beside it.

Session 1 records this relaxation in `AGENTS.md` itself, because staff
sessions read that file and must not be governed by a ceiling the operator
has already lifted.

## The lifecycle this set makes mechanical

```text
edit -> affected tests + cheap deterministic checks -> verification
     -> remediation -> affected tests + invalidated checks -> re-verification
     -> final verified tree -> full suite once -> record -> commit/close
```

1. **Pre-verification runs only selected tests**, chosen from changed
   paths, module ownership, dependency edges, and configured rules — each
   carrying the named reason that selected it.
2. **No speculative full suite.** A full-suite command is neither required
   nor accepted as ordinary pre-verification evidence.
3. **Selection uncertainty is risk, not permission to run everything.** An
   unmappable path records `selection_unknown`, runs the configured
   smoke/contract tests, and raises risk for verification to inspect.
4. **Two repository-wide exceptions, both auditable:** the selector proves
   every test is affected (test runner, shared bootstrap, or global build
   config changed), or an operator supplies `--allow-full-preverify` with a
   non-empty reason. The record says which applied.
5. **After remediation**, rerun the failed tests plus the tests the fix
   invalidated — not all of them.
6. **The run of record comes last**, once, bound to the final verified tree
   digest.
7. **A failed run of record is not reusable proof.** Fix, rerun affected,
   re-verify, then rerun the suite.
8. **CI stays full.** `.github/workflows/test.yml` is unchanged.

## What this set does NOT do (do not reopen)

- **No change to the cross-provider verification mandate.** Session-level
  cross-provider verification stays mandatory with no skip. Nothing in this
  sequence adds an engine-facing waiver, and the later sets' step-level
  checks are a different granularity that never touches it.
- **No plan machinery.** The approved plan is set 143. This set is about
  which tests run and when.
- **No new close gate.** `test_run_fresh` stays evidence-only: it checks
  that a `final-full` record is passing and fresh, and never launches a
  test command itself.

---

## Sessions

### Session 1 of 3: The relaxation on the record, and deterministic selection

1. Register.
2. Record the relaxation in `AGENTS.md`, above the managed fence: ground
   rules 1 and 4 are suspended for sets 142–145, the +33% envelope replaces
   them with its four numbers, and the two surviving rules (one test per
   behavior; a new module must shrink another) are stated. A staff session
   reading only `AGENTS.md` must see the real constraint, not a stale
   ceiling.
3. Implement deterministic affected-test selection from changed paths,
   module ownership, dependency edges, and configured repository rules.
   Every selection carries the named reason that produced it; a changed
   path that maps to nothing records `selection_unknown` and raises risk
   rather than widening the run.
4. Extend `test_evidence.py` with the closed stage vocabulary
   `preverify-targeted` and `final-full`. Only `final-full` can satisfy
   `test_run_fresh`, and it binds to the tree digest it ran against.
5. Affected tests, recorded as the `preverify-targeted` evidence.
6. Cross-provider verification; then the full suite once, against the
   final verified tree.
7. Close-out.

**Creates:** the recorded relaxation, the selector, the two evidence
stages. Est. 6 Python tests.

### Session 2 of 3: The refusal, and instructions that name the right command

1. Register.
2. Detect full-suite command fingerprints and **reject them before
   verification** unless the selector proves all tests are affected or the
   operator recorded `--allow-full-preverify` with a non-empty reason. The
   record says which exception applied; an override without a reason is
   refused.
3. Make `verify` refuse to dispatch until valid targeted selection evidence
   exists. This is the mechanism the set exists for: not a warning, not an
   annotation on the bundle — a refusal with the correct command in the
   message.
4. Rewrite the generated orchestrator instructions through `bootstrap.py`
   so they print the targeted command before verification and the
   full-suite command only after the final verified tree. Remove every
   generic phrase an agent can read as "run all tests" — including this
   repository's own current step wording, which says exactly that.
5. State the push policy in the same generated text: **commit during a
   session, push once at the end.** CI runs on push, so a mid-session push
   buys a full Windows matrix run of work that is not finished. The
   `pushed_to_remote` close gate already requires the branch to be pushed
   at close and nowhere earlier; the instructions must stop implying
   otherwise.
5. Affected tests, recorded as the `preverify-targeted` evidence.
6. Cross-provider verification; then the full suite once, against the
   final verified tree.
7. Close-out.

**Creates:** the fingerprint detector, the dispatch refusal, the rewritten
instructions. Est. 5 Python tests.

### Session 3 of 3: Changed-line coverage, and normalized deterministic facts

1. Register.
2. Implement changed-line coverage: which lines the change touched, which
   of those the selected tests actually executed, and which are uncovered.
   This is a deterministic fact here and becomes load-bearing in set 144,
   where it is what stops a step from skipping review by declaring only
   mechanically-checkable evidence.
3. Normalize the configured compile, typecheck, lint, and analyzer outputs
   alongside the selected test command into one deterministic fact record.
   An unsupported control reports `not_applicable` or `unknown` — **never**
   `pass`. Return red required facts to the author before any model spend.
4. Extract the deterministic-facts surface out of `verify.py` into its own
   module, and leave `verify.py` measurably smaller than it started. The
   module count may rise; `verify.py` must fall.
5. Affected tests, recorded as the `preverify-targeted` evidence.
6. Cross-provider verification; then the full suite once, against the
   final verified tree.
7. Close-out, and the end-of-set `change-log.md`.

**Creates:** changed-line coverage, normalized deterministic facts, the
first extraction out of `verify.py`. Est. 3 Python tests.

---

## Acceptance criterion for the set

An ordinary change **cannot** satisfy pre-verification with a full-suite
run: `verify` refuses to dispatch and names the targeted command instead.
Both repository-wide exceptions still work, each records which applied, and
an operator override without a reason is refused.

`test_run_fresh` accepts only a `final-full` record bound to the tree
digest it ran against, still launches nothing itself, and a
`preverify-targeted` record can never satisfy it.

Changed-line coverage is computed and recorded. Unsupported deterministic
controls read `not_applicable` or `unknown`, never `pass`.

`AGENTS.md` states the envelope every engine is actually working under, and
`verify.py` is smaller at the end of this set than at the start.

Sessions 2 and 3 ran this way themselves.
