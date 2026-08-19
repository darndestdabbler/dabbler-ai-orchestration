# Critique contracts and synchronous shadow records

> **Purpose:** First of five sets implementing the verification pipeline
> v3 plan as an **additive policy layer** over the existing verification
> loop — not a replacement, and not a revival of cancelled set 138. This
> set proves the canonical artifacts and their validators while changing
> **nothing** about routing, verdicts, or close. Everything it adds is
> default `off`, with one explicit `shadow` setting. It also carries the
> experiment's entry gate: the repository is at 475/480 Python tests, and
> sets 141–145 need 48 slots. Session 1 either reclaims them defensibly
> or the experiment stops before a line of production code is written.
> **Session Set:** `docs/session-sets/141-critique-contracts-and-shadow-records/`
> **Created:** 2026-08-19
> **Workflow:** Full
> **Plan of record:** `docs/verification-pipeline-v3-plan.md` (the
> Verification Pipeline Operationalization Plan, 2026-08-19), sections
> 2, 3, 4, 5, and 10.
> **Baseline commit:** `8be18fb8` on `master`, immediately after tag
> `v1.1.0` at `3ebda389`.
> **Integration branch:** `experiment/verification-pipeline-v3`. This set
> is **not** developed on `master`.
> **Prerequisite:** set 139 and set 140 complete and released. None of
> sets 142–145 may start before this one closes.

> **Note on rule 6:** operator-authorized exception, as sets 136–140.

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

## Where the work happens, and where it must not

The plan makes branch isolation a hard constraint, because this is an
experiment with a declared kill criterion (plan §11.3) and `master` is a
released line.

- Every session of sets 141–145 runs on a short-lived child branch off
  `experiment/verification-pipeline-v3`. This set's child branch is
  `verification-v3/set-141-contracts`.
- A child branch merges into the experiment branch only after its scoped
  tests and cross-provider verification pass. **No child branch merges to
  `master`.**
- Ordinary production fixes continue on `master`. Merge `master` *into*
  the experiment branch at set boundaries, resolve drift there, and rerun
  the affected checks. Never merge unfinished experiment work into a
  release fix.
- No package or extension release is cut from the experiment branch. The
  merge to `master` is a single deliberate release decision after set 145
  passes the §11 gates — not a sequence of partially enabled sets.
- Creating and switching branches is an **operator action**. This spec
  records the topology; it does not authorize an agent to create a branch
  on its own initiative.

This contradicts the repository's usual trunk-based habit. That is the
point: the usual habit assumes the work is going to ship.

## The entry gate, and why it is session 1's real content

Set 139 closed the suite at **475 of 480**. Sets 141–145 allocate:

| Set | Python | TypeScript |
| --- | ---: | ---: |
| 141 | 11 | 0 |
| 142 | 10 | 0 |
| 143 | 13 | 0 |
| 144 | 8 | 0 |
| 145 | 6 | 8 |
| **Total** | **48** | **8** |

Five slots exist. Forty-eight are needed, so **at least 43 must be
reclaimed** before production code is written. The rules on how:

- Reclaim only by deleting **superseded or duplicative** tests where the
  behavioral coverage remains explicit somewhere else. A behavior that
  loses its last test has not been reclaimed; it has been dropped.
- **Parameterization does not count.** Collected cases count against the
  ceiling, so collapsing twelve cases into one parameterized test that
  collects twelve is bookkeeping, not reclamation.
- Branch isolation makes the experiment reversible. It does **not** waive
  the ceiling and does not justify deleting meaningful coverage.
- If 43 defensible slots cannot be found, **stop**. Re-scope the
  allocation downward or invoke the kill criterion. Do not proceed on a
  promise to find them later, and do not raise the ceiling.

The allocations above are **ceilings, not targets**. One test per
behavior; no source-text assertions, no migration-path tests, no tests of
test infrastructure.

## What this set does NOT do (do not reopen)

- **No behavior change to `verify` or close.** After this set, the
  existing verification loop, round cap, dispute, adjudication, waiver,
  and the five close gates behave exactly as they did at `8be18fb8`. The
  new artifacts are written and validated; nothing reads them to decide
  anything.
- **No new Python module.** Ground rule 1 stands, and the plan §2.3
  restates it: this work fits inside `verify.py`, `ledger.py`,
  `evidence.py`, `config.py`, and the `schemas/` directory. If it will
  not fit, that is a design signal to surface, not a module to add.
- **No new close gate.** G0 is a pre-review execution stage, never a
  sixth gate. `gates.py` stays unchanged unless a concrete failure proves
  `verification_clean` cannot consume the final ledger truth.
- **`change-log.md` is not overloaded.** The proposal's per-change
  `change-log.md` collides with the existing end-of-set `change-log.md`,
  which lifecycle code writes and close behavior already reads. The
  canonical artifact is `review-claims.json`; a Markdown twin may be
  rendered for humans and is **never** parsed.
- **No queue directories.** `verify-inbox/`, `instructions-outbox/`,
  `worker-results/`, `escalations/`, and `candidates/` are daemon
  transport, and the daemon is deferred (plan §12). The synchronous
  implementation has no queues.
- **No set-138 revival.** The generic seven-tier context builder is not
  coming back. Check-specific authorized pulls are narrower and must be
  enforced by the execution environment, not asserted in a prompt.
- **The verdict vocabulary does not fork.** `critical | major | minor`
  stays, so `rounds.schema.json`, `verdict.py`, the gates, and the
  extension are not forked. Default CPCF weights are 16 / 4 / 1.

## The artifact layout this set freezes

```text
.dabbler/runs/<set>/s<N>/critique/<change-id>/
  review-run.json
  g0-summary.json
  review-claims.json
  checks.json
  worker-results.jsonl
  dispositions.jsonl
  audits.jsonl
```

`change-id` derives from the reviewed tree/diff digest. **A model never
chooses it.** A remediation creates a linked attempt; it never rewrites
prior evidence. Only router commands write these files, validating before
an atomic replace or append. A hand-written record does not count — and
after this set, it does not parse either.

---

## Sessions

### Session 1 of 3: The entry gate, the frozen schemas, and a switch that is off

1. Register.
2. Reconcile the post-139 state on the experiment branch: confirm the
   working tree matches `8be18fb8` plus any merged `master` drift,
   confirm the suite collects 475, and record the exact starting count
   that the reclamation is measured against.
3. Audit the suite for reclaimable slots and produce a written ledger of
   candidates before deleting anything — file, test, the behavior it
   covers, and the specific test or mechanism that still covers that
   behavior afterwards. Reclaim at least 43. Do not delete a test whose
   behavior would then be untested, and do not count a parameterized
   collapse as a reclamation.
4. **Decision point.** If 43 defensible slots exist, delete them, confirm
   the suite is green at the reduced count, and continue. If they do not,
   stop the set here and report the shortfall with the audit ledger
   attached: the honest outcomes are a smaller allocation or the kill
   criterion, and neither is an agent's call to make silently.
5. Freeze schema v1 for the five new artifacts — review run, review
   claims, check IR, worker results, dispositions — as JSON Schema files
   under `ai_router/schemas/`, each carrying an explicit `schema_version`
   that readers check and refuse on mismatch. The check IR schema follows
   plan §4: identity, one imperative objective, one closed selector, the
   fixed condition operators (`for_each`, `all`, `any`, `not`, `if`,
   `exists`, `equals`, `count`), explicit scope, branch nesting depth at
   most 2, complete `pass`/`fail`/`blocked` evidence shapes, authorized
   pulls, and resource bounds. Nothing recursive, unbounded, or
   whole-program belongs in it.
6. Add the feature configuration to `config.py` and the config schema:
   the pipeline is `off` by default, `shadow` is the only other value
   this set accepts, and `enforce` is declared but refused at load with a
   message naming the set that will enable it. An unknown key is refused
   at load, not ignored — the rule set 139 established for the local
   overlay.
7. Cross-provider verification.
8. Required portion of the full test suite.
9. Close-out.

**Creates:** the reclamation ledger, five frozen v1 schemas, the
default-off feature configuration. Est. 4–5 new Python tests. Removes at
least 43.

### Session 2 of 3: Machine-owned paths, verify prepare, and the immutable change-id

1. Register.
2. Add the critique artifact paths, readers, and writers to `ledger.py`,
   as machine-only surfaces: validate against the frozen schema, then
   atomic-replace or append. A record that fails validation is refused
   and quarantined, never partially written and never best-effort
   skipped.
3. Derive `change-id` from the reviewed tree/diff digest inside
   `verify.py`, and make it structurally unchoosable by a model: the
   prepare path computes it, no CLI flag supplies it, and a
   caller-supplied value is refused rather than honoured.
4. Add `verify prepare` to `verify.py`: it validates author-supplied
   claims, writes the canonical `review-claims.json` under the
   machine-owned run directory, and opens `review-run.json` for the
   attempt. A remediation records a **linked attempt** against the same
   review run; it never rewrites the prior attempt's evidence.
5. Generate the human-readable Markdown twin of the claims, and prove it
   is decorative: no code path reads it, and deleting it changes no
   behavior. Test that, rather than asserting its text.
6. Prove old ledgers still read. A run directory written before this set
   loads unchanged, and the existing `verify` command's behavior on it is
   byte-identical to `8be18fb8`.
7. Cross-provider verification.
8. Required portion of the full test suite.
9. Close-out.

**Creates:** the critique ledger surface, `change-id` derivation,
`verify prepare`, the decorative Markdown twin. Est. 4–5 new Python
tests.

### Session 3 of 3: Evidence provenance, and one fixture that round-trips

1. Register.
2. Implement positive-evidence provenance in `evidence.py`: every quote
   carries path, byte-or-line span, and content hash, and the framework —
   not the worker — verifies the quote against the reviewed tree. Where a
   supported parser exists, also check the AST kind at that location, so
   a string literal containing code-like text cannot satisfy a call-site
   contract.
3. Implement framework-executed absence searches. The worker declares the
   literal, regex, or AST query and the closed scope; the framework
   reruns it and records scope, query, tool version, and result. A
   worker's assertion that it searched is not evidence that it searched.
4. Encode the unprovable-absence fallback ladder, in order: deterministic
   test or analyzer, then a narrower positive counterexample check, then
   `blocked` plus manager adjudication, then human review for a
   designated class. **A `blocked` result may never be converted to
   `pass` because the worker ran out of context or tools** — that
   conversion must be structurally impossible, not merely discouraged.
5. Round-trip one seeded fixture end to end: `prepare` through validated
   *empty* results, with the quote verifier, the absence re-execution,
   and the schema validators all exercised. No model is called.
6. Prove the fail-closed edges: a hand-edited artifact, a malformed
   record, a schema-version mismatch, and a quote whose hash does not
   match the tree each fail closed with a named refusal.
7. Cross-provider verification.
8. Required portion of the full test suite.
9. Close-out, and the end-of-set `change-log.md`.

**Creates:** evidence provenance, AST-kind checks, framework-executed
absence search, the seeded round-trip fixture. Est. 3–4 new Python tests.

---

## Acceptance criterion for the set

On the experiment branch, `verify` and `session close` behave exactly as
they did at `8be18fb8`: same rounds, same verdicts, same five gates, same
output. A pre-existing run directory still reads. The five new schemas
are frozen at v1 and every new artifact validates against them before it
is written; a hand-edited or malformed one fails closed rather than being
tolerated. `change-id` comes from the tree digest and cannot be supplied.
One seeded fixture travels from `prepare` to validated empty results
without a model call, and a quote whose content hash does not match the
reviewed tree is refused.

The pipeline configuration is `off`. Setting it to `enforce` is refused
at load, by name.

Above all: the suite is green with **at least 48 slots free** against the
480 ceiling, and every reclaimed slot is accounted for in the session 1
ledger by the behavior that still covers it. If that ledger could not be
written honestly, this set stopped at session 1, and that is a successful
outcome of the gate rather than a failure of the set.

## Test budget

Baseline 475/480. Session 1 reclaims ≥43 before writing production code,
taking the suite to ≤432. This set then adds at most **11**, leaving sets
142–145 their 37. The three session estimates (4–5, 4–5, 3–4) sum to
11–14 against a ceiling of 11 — so the ranges are pressure, not slack. If
sessions 1 and 2 together have spent more than 8, session 3 tightens to
the two behaviors that must be covered (hash mismatch refused, `blocked`
cannot become `pass`) rather than borrowing from set 142.
