# ai_router Hygiene & Dead-Code Audit Spec

> **Purpose:** Arrest the slow growth of `ai_router/` (now 36 top-level
> modules + 52 test files + a 6-file `joiner/` subpackage + a `scripts/`
> dir, up from "about a dozen" at the start) by removing code that is
> demonstrably unreachable, fixing a broken packaging entry point, and
> consolidating scattered tests — without touching any code path that is
> actually used. Audit-first: nothing is deleted until a session proves
> it has no live caller.
> **Created:** 2026-05-29
> **Session Set:** `docs/session-sets/051-ai-router-hygiene-and-dead-code-audit/`
> **Prerequisite:** None (independent of Set 050; light overlap on the
> migrators, which this set only *reviews*, not rewrites).
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

---

## Session Set Configuration

```yaml
tier: full
requiresUAT: false
requiresE2E: false
uatScope: none
```

> Rationale: Pure internal cleanup of the `ai_router` Python package +
> its packaging. No UI behavior, no browser surface. The quality bar is
> the existing test suite staying green (minus tests deleted with their
> dead code) plus cross-provider verification of the "is this truly
> unreachable" reasoning. `requiresUAT`/`requiresE2E` stay `false`.

---

## Project Overview

### Motivation

A 2026-05-29 usage scan (operator-prompted) found the package has grown
well past its original ~dozen files and now contains a stranded
subsystem plus packaging bugs:

- **`joiner/` (6 files) + `dabbler_launch.py` — orphaned subsystem.**
  The joiner CLI's only live caller was the extension's `HarvestService`,
  **deleted in Set 049** when the harvest UI was reverted (P4).
  `dabbler_launch.py` and `joiner/` now reference only each other (plus a
  "consumed once `dabbler-launch` ships" comment that never shipped).
  Set 049's own notes acknowledge it kept "load-bearing scaffolding in
  `ai_router/joiner/`" — but nothing loads it. Largest cleanup target.
- **Broken console-script entry point.** `pyproject.toml` declares
  `backfill_session_state = "ai_router.backfill_session_state:main"`,
  but that module does not exist at top level — the file lives at
  `ai_router/scripts/backfill_session_state.py`. The installed console
  script would `ModuleNotFoundError`.
- **Packaging / test-location hygiene.** Two `test_*.py` files live in
  `ai_router/scripts/` instead of `ai_router/tests/`, and `pyproject`
  excludes only `ai_router.tests` from the wheel — so those tests ship
  to PyPI consumers. Tests are split across two locations.
- **Four migrators** (`migrate_session_state`, `migrate_v3_to_v4`,
  `migrate_lightweight_to_canonical_v4`, `migrate_router_config`) — all
  currently used, each distinct; reviewed here for *consolidation
  opportunity only*, not assumed dead.

### Confirmed-still-used (do NOT touch — recorded so the audit doesn't re-litigate)

- `close_lock` / `close_out` / `close_session` are three distinct,
  live modules (lock primitives / fresh-close-out-turn helper / CLI +
  gate checks). Not redundant.
- All five `[project.scripts]` entry points except the `backfill` path
  bug above resolve correctly.

### Non-goals

- **No behavior changes** to any live code path. This is deletion +
  packaging + relocation only.
- **No migrator rewrites.** Consolidation is *evaluated* and, if
  proposed, scoped as a follow-on — not executed here unless the S1
  audit judges it low-risk and bundles it explicitly.
- **No deletion without a proven-unreachable finding.** Every removal
  cites the scan that shows zero live callers.

---

## Open design questions (S1 audit)

1. **joiner/dabbler_launch removal vs. archive.** Delete outright, or
   move to an `_archived/` location / git-tag for possible Set-037-041
   launch-adapter revival? Confirm truly zero live callers first
   (extension, hooks, entry points, consumer repos).
2. **`backfill` entry point.** Fix by pointing the entry point at
   `ai_router.scripts.backfill_session_state:main`, or relocate the file
   to top level to match the declared path? Which preserves any
   documented `backfill_session_state` CLI usage?
3. **`scripts/` disposition.** Move the `dump_session_state_schema` /
   `backfill` utilities to top level or a clearly-packaged location;
   move the two stray `test_*` files to `tests/`; ensure no test ships
   in the wheel.
4. **Migrator consolidation.** Is there a low-risk merge (shared
   normalize core) or is the four-way split correct as-is?
5. **Wheel-contents assertion.** Add a test that asserts the built wheel
   contains no `test_*` and no known-dead modules, to prevent regrowth?

---

## Sessions

### Session 1 of 3: Audit & removal plan

**Steps:**
1. Register the set; re-run the usage scan fresh (modules with no live
   caller; entry-point resolution; wheel contents).
2. Prove or disprove the joiner/dabbler_launch orphan claim across the
   extension, hooks, entry points, and all consumer repos.
3. Cross-provider consensus on the five open questions (delete vs.
   archive being the load-bearing one). Produce `proposal.md` + verdict.
4. Lock the exact removal/relocation list for S2.

**Creates:** `docs/proposals/2026-05-29-ai-router-hygiene/proposal.md` + verdict.
**Touches:** this `spec.md` (scope-lock).
**Ends with:** an audit-locked, line-item removal/relocation plan with a
zero-live-caller citation per item.
**Progress keys:** S1 audit verdict committed; removal list locked.

### Session 2 of 3: Execute removals + packaging fixes

**Steps:**
1. Remove (or archive, per S1) the joiner/dabbler_launch island and its
   tests.
2. Fix the `backfill` entry point; relocate `scripts/` utilities + stray
   tests per S1; exclude tests from the wheel.
3. Add the wheel-contents regression assertion (per S1).
4. Run the full suite; confirm green minus the tests removed with their
   code; build the wheel and inspect contents.

**Creates:** wheel-contents test; any `_archived/` placement.
**Touches:** `ai_router/joiner/*`, `ai_router/dabbler_launch.py`,
`pyproject.toml`, `ai_router/scripts/*`, affected tests.
**Ends with:** dead subsystem gone/archived; entry point resolves; wheel
carries no tests; suite green.
**Progress keys:** removals done; packaging fixed; suite green.

### Session 3 of 3: Docs, changelog, close-out

**Steps:**
1. Update `ai_router/CHANGELOG.md`, any docs that reference the removed
   joiner CLI as live (rewrite as historical), and `CLAUDE.md` if it
   names removed surfaces.
2. Version bump (PyPI `dabbler-ai-router`); change-log.md.
3. Cross-provider verification; close-out; publish **held** for
   operator-initiated tag-push.

**Creates:** `change-log.md`.
**Touches:** `ai_router/CHANGELOG.md`, docs, `pyproject.toml`, `CLAUDE.md`.
**Ends with:** docs reconciled; version bumped; publish queued.
**Progress keys:** docs updated; version bumped; close-out verdict recorded.

---

## End-of-set deliverables

- joiner/dabbler_launch island removed or archived (per S1), with
  zero-live-caller citations.
- `backfill` console-script entry point fixed.
- `scripts/` utilities relocated; stray tests moved to `tests/`; wheel
  ships no tests.
- Wheel-contents regression test guarding against regrowth.
- Migrator-consolidation recommendation (execute only if S1 bundles it).
- CHANGELOG + change-log + version bump; publish held for operator.
