# Set 050 Change Log

**Session-Set Currency & Addressing — schema-drift guard (Feature 1)
+ number-prefix addressing (Feature 2): audit & design-lock, detect-only
CLI + manifest, pure-JS hot-path drift scan + install path, number→slug
resolver + Explorer UX revision, then consumer rollout + docs + version
bumps + close-out.**

This set replaces the unreliable "the orchestrator remembers to fetch
the canonical schema from GitHub" pattern with a **deterministic,
code-driven guard**. The guard the triggering incident actually required
is a **pure-JS, no-`ai_router`, no-network** drift scan chained into the
Claude Code `SessionStart` hook — because the incident repo
(`dabbler-access-harvester`) had an ancient pinned router that lacked any
detection CLI, a Python-CLI-on-the-hot-path guard would have left it
unprotected. A richer detect-only `python -m ai_router.check_migrations`
CLI plus a declarative advisory `docs/schema-current.json` manifest live
**off the hot path** for CI/manual use. Old schema files are not
force-migrated (the `normalize_to_v4_shape` reader shim consumes v2/v3
transparently); the Explorer flags them with an unobtrusive asterisk +
tooltip and offers a single repo-level bulk-upgrade action. Feature 2
standardizes a monotonic `NNN-` slug prefix and adds a number→slug
resolver so an operator can say "Set 50".

The audit-locked spec at [`spec.md`](spec.md) scopes 5 sessions: audit &
design-lock (S1), manifest + `check_migrations` CLI (S2), pure-JS
hot-path drift scan + install path (S3), number-prefix convention +
resolver + Explorer UX revision (S4), then consumer rollout + docs +
version bumps + close-out (this S5). Companion PyPI release:
`dabbler-ai-router 0.12.0`. Companion Marketplace release:
`DarndestDabbler.dabbler-ai-orchestration 0.25.0` (which also publishes
the held v0.24.1 Copy-Slug fix).

## Session 1 — Audit & design-lock

Closed 2026-05-29 with disposition `completed`.

- Two-pass devil's-advocate cross-provider consensus (`gemini-pro` +
  `gpt-5-4`) over the 11 open design questions (7 Feature-1, 4
  Feature-2). All four calls succeeded (no 429 cascade). **Eight of
  eleven dispositions changed** from the draft. Proposal + verdict at
  [`docs/proposals/2026-05-29-session-set-currency-and-addressing/`](../../proposals/2026-05-29-session-set-currency-and-addressing/).
- Load-bearing changes: the SessionStart drift scan is **pure-JS / no
  router / no network** (gpt-5-4 pass-B correction — the incident repo
  had an ancient router with no `check_migrations`); the GitHub manifest
  is **advisory, off the hot path, declarative** (symbolic migrator IDs,
  not shell strings); `--apply` is **cut** (detect-only); Feature 2
  gains a minimal extension affordance; `NNN-` prefix is **required for
  new sets**; `requiresUAT` stays `false`.
- Spec scope-locked. NTE confirmed $10.
- S1 routed cost: **$0.2829** (gemini $0.0128 + $0.0226; gpt-5-4
  $0.1167 + $0.1309).
- Commits:
  [`fb6ceff`](https://github.com/darndestdabbler/dabbler-ai-orchestration/commit/fb6ceff),
  [`677e57f`](https://github.com/darndestdabbler/dabbler-ai-orchestration/commit/677e57f),
  [`7901e05`](https://github.com/darndestdabbler/dabbler-ai-orchestration/commit/7901e05).

## Session 2 — Manifest + `check_migrations` CLI (detect-only)

Closed 2026-05-29 with disposition `completed`.

- `docs/schema-current.json` — declarative, advisory manifest
  (`manifestVersion` 1, `currentSchemaVersion` 4,
  `minimumAiRouterVersion` 0.10.0, raw-on-master `schemaDocUrl`,
  symbolic migrator IDs + version ranges; **no executable shell
  strings**).
- `ai_router/check_migrations.py` — detect-only scanner. Scans
  `<scan>/*/session-state.json`, classifies clean / drift / ahead /
  unreadable against `SESSION_STATE_SCHEMA_VERSION`. Terse default,
  `--verbose`/`--json` detail, exit non-zero on drift (`--exit-zero`
  suppresses). Optional `--manifest-url` advisory fetch (fail-open +
  `~/.dabbler` cache); `--strict-manifest` flips to fail-loud.
  ASCII-only output (Windows cp1252 console crashes on non-ASCII,
  empirically confirmed).
- **Empirical correction to the S1 verdict (flagged for the S5
  verifier).** Verdict Q7 locked the bulk-upgrade sequence as **two**
  migrators (`lightweight-to-v4` then `v3-to-v4`) claiming it handled
  "a v2 set that needs both steps." The S2 carried-risk-#2 test
  falsified this: a genuine v2 file (explicit `schemaVersion: 2` +
  legacy `currentSession`/`totalSessions`/`completedSessions` triple) is
  **skipped by both**. The v2→v3 step is a **third** existing migrator,
  `migrate_session_state`, omitted by the verdict. Corrected chain
  (adds no new migrator logic): `migrate_session_state` →
  `migrate_lightweight_to_canonical_v4` → `migrate_v3_to_v4`, each
  `--in-place`/idempotent; verified to take genuine v2 losslessly to v4.
- 21 new tests; full suite 988 passed / 1 skipped / 0 regressions.
- No router invoked; $0 added.
- Commits:
  [`9da0cb8`](https://github.com/darndestdabbler/dabbler-ai-orchestration/commit/9da0cb8),
  [`ce45bed`](https://github.com/darndestdabbler/dabbler-ai-orchestration/commit/ce45bed),
  [`899a87c`](https://github.com/darndestdabbler/dabbler-ai-orchestration/commit/899a87c).

## Session 3 — Pure-JS hot-path drift scan + install path

Closed 2026-05-29 with disposition `completed` (takeover continuation:
a prior `claude-sonnet-4-6` chat shipped the deliverable + pushed but
left S3 in-progress without closing; an Opus chat verified and closed).

- `claude-session-start-invoker.js` gains `CURRENT_SCHEMA_VERSION = 4`
  and `scanSchemaDrift(workspaceRoot)` — reads
  `docs/session-sets/*/session-state.json`, compares each `schemaVersion`
  to the bundled constant, emits a terse one-line summary on drift
  (clean = silent), fail-open on unreadable/missing. **No `ai_router`
  import, no network**, so it works when the router is absent or stale.
  Chained AFTER `start_session` in `main()` with `start_session` errors
  logged-not-fatal so the scan always runs.
- `installOrchestratorHook.claudeCode` toast updated to mention both
  `start_session` and the drift scan, plus a "Copy manual setup" button
  copying the invoker download URL + `settings.json` stanza for repos
  without the extension (works with no router installed).
- `test_invoker_schema_constant.py` — CI guard reading
  `CURRENT_SCHEMA_VERSION` from the JS and asserting it equals
  `ai_router`'s `SESSION_STATE_SCHEMA_VERSION`.
- `ai-led-session-workflow.md` documents the guard at the session-start
  step. 8 new Layer-2 tests for `scanSchemaDrift` + the constant.
- No router invoked; $0 added.
- Commits:
  [`b8b2066`](https://github.com/darndestdabbler/dabbler-ai-orchestration/commit/b8b2066),
  [`3859066`](https://github.com/darndestdabbler/dabbler-ai-orchestration/commit/3859066),
  [`cb986b8`](https://github.com/darndestdabbler/dabbler-ai-orchestration/commit/cb986b8),
  [`3725417`](https://github.com/darndestdabbler/dabbler-ai-orchestration/commit/3725417),
  [`76588ad`](https://github.com/darndestdabbler/dabbler-ai-orchestration/commit/76588ad).

## Session 4 — Number-prefix convention + number→slug resolver (Feature 2) + Explorer UX revision

Closed 2026-05-29 with disposition `completed`.

- **Feature 2 (verdict Q8–Q11):** `ai_router/resolve_set.py` exposes
  `resolve_slug`/`resolve_set` (exact integer-prefix match, leading
  zeros normalized, collision names both, no-match lists available
  numbers + `--next`; no fuzzy nearest), `next_session_set_number`
  (`max(existing)+1` as int + zero-padded string, `width = max(3,
  widest existing prefix)`), `resolve_session_set_dir` (bare-number →
  path; path passes through), and a standalone CLI
  (`python -m ai_router.resolve_set <n>` / `--next` / `--json`).
  `start_session --session-set-dir` accepts a bare number resolving
  within `./docs/session-sets`.
- Authoring guide reconciled: monotonic `NNN-` sequence prefix
  **required** for new/scaffolded sets, **recommended + forward-only**
  for consumers; semantic date/phase names still banned; new Numbering
  section documents max+1 + zero-pad width + no-mass-rename.
- Minimal extension Command-Palette quick-input resolver command
  (`dabblerSessionSets.resolveSetNumber`) backed by a pure-TS resolver
  (`utils/resolveSetNumber.ts`) mirroring the Python contract.
- **Explorer UX revision (operator-directed to S4):** the intrusive
  `(needs migration)` row description is replaced by an unobtrusive
  asterisk + "Ran under schema v\<N\>" hover tooltip; a single title-bar
  "Upgrade older session sets" icon (`commands/upgradeOlderSets.ts`),
  gated on the `dabblerSessionSets.hasSubCurrentSets` context key, runs
  the corrected **three-migrator** bulk chain across all sub-current
  sets at once. Per-row right-click migrate actions left intact.
- Python 1025 passed / 1 skipped (15 new resolver + 2 new start_session
  integration tests, 0 regressions); TS `test:unit` 573 passing / 2
  failing (both pre-existing Set-026 stub-harness failures); `tsc
  --noEmit` clean; esbuild clean.
- No router invoked; $0 added.
- Commits:
  [`16e19f0`](https://github.com/darndestdabbler/dabbler-ai-orchestration/commit/16e19f0),
  [`c81791f`](https://github.com/darndestdabbler/dabbler-ai-orchestration/commit/c81791f),
  [`9cf88ab`](https://github.com/darndestdabbler/dabbler-ai-orchestration/commit/9cf88ab),
  [`c368f45`](https://github.com/darndestdabbler/dabbler-ai-orchestration/commit/c368f45).

## Session 5 — Consumer rollout, docs, version bumps, close-out

Closed 2026-05-29 with disposition `completed`.

- `docs/cross-repo-migration-guard-notice.md` — paste-in for consumer
  `CLAUDE.md`: install the SessionStart drift guard (extension command +
  router-less manual fallback), raise the `>=0.10.0` pin, use **raw**
  GitHub URLs, inline the `"schemaVersion": 4` stamp, adopt the `NNN-`
  prefix for new sets, plus an adoption-status table.
- **Harvester first-adopter status confirmed.** Its v2→v4 migration
  (all 49 sets now v4), router pin (`>=0.10.0`), and `CLAUDE.md`
  stamp/raw-URL edits were completed 2026-05-29 ahead of this set; the
  remaining adopter action is the one-time `SessionStart` hook install,
  which — because the hook lives in the shared global
  `~/.claude/settings.json` — covers the harvester and every other repo
  on the machine at once (operator-run).
- Version bumps: `dabbler-ai-router` 0.11.0 → **0.12.0** (`pyproject.toml`
  + `__init__.__version__`); extension 0.24.1 → **0.25.0**
  (`package.json`); both CHANGELOGs; the `CLAUDE.md` version walk;
  this set-level change-log.
- Cross-provider verification of the S2–S5 deferred work (including the
  three-migrator bulk-chain correctness and the bulk-action-shells-to-
  Python divergence).
- Publishes **held** for operator-initiated tag-push per established
  release discipline (`vsix-v0.25.0` for Marketplace; `v0.12.0` for
  PyPI). Note: `VSCE_PAT` was expired 2026-05-28 — confirm PAT freshness
  before pushing the vsix tag.
