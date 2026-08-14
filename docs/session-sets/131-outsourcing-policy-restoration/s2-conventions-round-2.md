# Conventions for round 2 (delta-scoped remediation review)

## Why this round exists

Round 1 (discovery, 2-way fan-out) returned **VERIFIED with 0 blocking
findings** and 5 Nits. There is **no blocking finding to remediate**. This
round exists because the session then applied three fixes for Nits, which
made round 1's evidence stamp stale, and `post_round_delta` classified the
delta as shipped-code. The repo's A4 rule owes exactly one delta-scoped
remediation-review for that, so this is it.

**Please review the delta, not the session.** Round 1 already covered the
session's substance and the cross-round ledger carries its (empty) findings.

## The delta since the round-1 stamp — all of it

Three changes, all Nit-driven, none behavioural:

1. **`ai_router/tests/test_catalog_weight_not_a_price.py` (test-only).**
   The prohibition scan's allowlist was matched by `Path.name`, so a future
   file that merely *called itself* `copilot_catalog.py` anywhere under
   `ai_router/` would inherit the exemption. Round 1 flagged it (and the
   session had flagged it against itself in `s2-conventions.md`). The
   allowlist is now matched by path relative to `ai_router/`
   (`PERMITTED_BASENAMES` → `PERMITTED_PATHS`). A **new plant** was added
   that writes a reader into `ai_router/_plant_pkg/copilot_catalog.py` and
   asserts the scan fires; it does.

2. **`ai_router/copilot_catalog.py` module docstring (comment-only).**
   Round 1 noted the docstring pointed at the Set 078 design doc as "Full
   schema + rationale" while that doc still spells the pre-rename field
   name. The pointer now states that the document is a v1-era session
   artifact that is never edited, and that `ModelEntry` wins (L-064-8).

3. **`LOCKFILE_SCHEMA_VERSION` comment (comment-only).** Round 1 noted that
   `dumps(loads(v1_lockfile))` emits v2 field names under a v1 schema label.
   Adjudicated as a **deferred residual**: no load-then-write migration path
   exists in this repo (`main()` always writes a freshly discovered
   catalog, which stamps v2), and changing `dumps()` into a restamping
   writer would be a behavioural change to shipped code in response to a
   Nit. The comment now names `discover_catalog()` as the only stamper and
   places the restamping obligation on any future migration that gets
   written.

No production code path changed behaviour between the round-1 stamp and
now. The plants were re-run after these edits: **10 plants, 10 fired.**

## Test evidence after the delta

- pytest **4490 passed / 9 skipped** (758s, one invocation).
- mocha **1455 passing / 2 pending** (35s, one invocation).
- playwright **30 passed** in the declared invocation (7.9m), plus
  `vsix-first-run-walkthrough` re-run in isolation and passing (56.6s)
  after a 300s load-induced timeout. Composition journaled in
  `decisions.jsonl`; every spec executed and passed.

## Adjudications from round 1 you should not re-litigate

- **A genuine `0` is deliberately not coerced to `None`.** Both round-1
  calls raised it, both rated it Nit and defensible. `0` is a true
  measurement of what that probe consumed; the field is disarmed by an
  absolute prohibition on reading it, which is strictly stronger than
  fixing the zero case. If you believe this is wrong, it needs a *named
  failure scenario the prohibition does not already close*.
- The by-design exclusions in `s2-conventions.md` (round 1) still hold:
  the engine-bootstrap files and the Rotation section are **Session 3's**
  declared scope, and `ai_router/copilot-catalog.lock` is gitignored
  seat-local machine state that is deliberately not hand-edited.

## Severity rubric (L-095-1)

Grade by **consequence**: probability the stated failure scenario reaches a
real user, times impact. Low probability **or** low impact is Minor. No
nameable failure scenario is a nit, not a finding.
