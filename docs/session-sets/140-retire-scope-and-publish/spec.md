# Retire the cancelled scope, ship the salvaged fixes, publish

> **Purpose:** Set 138 was cancelled during its own session 3, on its own
> measurement: per-token billing makes bundle size the dominant cost, so
> a bounded-scope *push* optimises the wrong variable, and the defect
> class it targets is caught by the existing test suite in seconds at no
> marginal cost. Cancelling was bookkeeping — roughly 1,900 lines and 51
> tests remain on `main`, inert but consuming 11% of a test budget with
> five slots left. This set removes them, ships the parts of session 3
> that never depended on the cancelled premise, and publishes.
> **Session Set:** `docs/session-sets/140-retire-scope-and-publish/`
> **Created:** 2026-08-19
> **Workflow:** Full
> **Prerequisite:** none. Independent of set 139 — either may run first,
> but 139 cannot fit its estimated 36–48 tests until this set frees the
> budget.

> **Note on rule 6:** operator-authorized exception, as sets 136–139.

---

## Session Set Configuration

```yaml
requiresUAT: false
requiresE2E: false
totalSessions: 2
prerequisites: []
```

---

## Why this is not a revert

`git revert` of set 138's two work commits would be wrong. Session 1 of
that set also deleted `prompting.py`, folded it into `route.py`, and
replaced its **silent tail-truncation of a verification bundle** with a
named refusal (`PromptTooLargeError`). That fixed a live defect with
nothing to do with the scope idea, and a revert would restore the bug.
The removal is surgical, and the surgery is the work.

## What goes

- `ai_router/context_scope.py` (1,046 lines).
- `tests/test_context_scope.py` (25 tests), `tests/test_context_pull.py`
  (26 tests).
- `ai_router/schemas/pulls.schema.json`, and the `pulls.jsonl` readers
  and writers in `ai_router/ledger.py`.
- The scope fork in `ai_router/verify.py`: `resolve_scope_for_set`,
  `assemble_scoped_evidence`, `_granted_context_block`,
  `_record_requests`, `decide_escalation`, and the `grant` / `refuse`
  CLI verbs.
- `declared_module_slug` in `ai_router/session.py`.

## What stays, and why

- **`PromptTooLargeError` and the truncation refusal in `route.py`**,
  with its tests in `tests/test_route.py`. The defect it fixes is real
  and independent.
- **`parse_set_config` in `session.py`** — a generic reader for the
  spec's configuration block, not a scope artifact.
- **The `modules.py` manifest extension** (`codeRoots`, `specSections`,
  `contextAssets`) and its tests. Additive, already validated, rendered
  by the VS Code extension, and plausibly reused by whatever the
  redesign produces. Removing it would be churn, not accounting.

## What this set does NOT do (do not reopen)

- **No redesign.** The evidence for that conversation is salvaged
  outside the repository; this set does not prejudge it.
- **No new verification architecture.** The monolithic bundle is the
  only path after this set, exactly as it was before set 138.
- **No test added that was not already written.** The only new tests are
  the five that come with `session log`, already written and green.

---

## Sessions

### Session 1 of 2: Take the cancelled scope out

1. Register.
2. Remove the files and the code named in "What goes" above. Keep
   everything named in "What stays". The monolithic evidence path must
   behave exactly as it did before set 138 touched `verify.py`.
3. Confirm the accounting: the suite drops by 51 tests, and no import,
   CLI verb, or schema reference to the removed surface survives
   anywhere — including `ai_router/__init__.py`, the prompt templates,
   and the VS Code extension's command list.
4. Cross-provider verification.
5. Required portion of the full test suite.
6. Close-out.

**Creates:** nothing. Removes ~1,900 lines and 51 tests.

### Session 2 of 2: Ship the salvaged fixes and publish

1. Register.
2. Apply the `session log` subcommand and its five tests from the
   salvage directory: a `log` verb on the existing `ai_router.session`
   CLI that resolves a step against the seeded plan rows, refuses an
   unresolvable key rather than appending an orphan row, enforces the
   closed status vocabulary at the boundary, and is idempotent.
3. Apply the two stale-doc corrections: `README.md` claims no shipped
   CLI exposes `--transport` (`ai_router.verify` does), and
   `docs/quick-start.md` describes bootstrap persisting
   `DABBLER_TRANSPORT` at system/HKLM scope (it is user scope by
   default, `--machine-scope` for the machine hive, with an announced
   fallback). Document `session log` in `quick-start.md` and
   `schema-reference.md`.
4. Bump the version and build the artifact. Publishing itself is
   operator-gated: the session prepares the build and stops.
5. Cross-provider verification.
6. Required portion of the full test suite.
7. Close-out, and the end-of-set `change-log.md`.

**Creates:** the `session log` subcommand, the doc corrections, a
release build. Est. 5 new Python tests, all already written.

---

## Acceptance criterion for the set

`ai_router.context_scope` and its ledger, schema, and CLI surface are
gone; the truncation refusal, the manifest extension, and
`parse_set_config` remain; the monolithic verification path behaves as
it did before set 138. The suite is green with at least 45 slots free
against the 480 ceiling, so set 139 can fit its estimate. `session log`
closes the lifecycle seam that made logging a plan step reach into
`ai_router.writers` through `python -c`. A release build exists, and the
two stale docs no longer tell an operator something untrue.
