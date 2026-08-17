# Migrating from v1

Short version: there is nothing to migrate. The artifact contract is
unchanged — a v1 project opens in the v2 Work Explorer unmodified.

## Artifacts

- The four per-set artifacts keep their v1 names, locations, and
  schemas: `docs/session-sets/<slug>/spec.md`, `session-state.json`
  (schema v4), `change-log.md`, `activity-log.json`. The metrics ledger
  format `router-metrics.jsonl` is unchanged.
- **Schema v3 state files normalize on read** — no rewrite needed. A
  one-shot v3→v4 migrator existed and was retired after migrating the
  reference corpus; if ever needed again it lives in git history at
  commit `6a1e4b7` (`ai_router/migrate_v3.py`).

## Verification records

- Round and verification files now live under `.dabbler/runs/<set>/s<N>/`
  (gitignored) — outside the git working tree. Existing committed
  verification round files in v1 projects are left in place and
  ignored; only new rounds write to `.dabbler/runs/`.
- The close gate reads the machine-written round ledger
  (`rounds.jsonl`). Verification stamps, backstops, and integrity
  corroboration are gone — the record is trustworthy because only
  `ai_router.verify` writes it, and a tampered line blocks the close.

## Extension

- The TypeScript ports of Python logic are gone. The Work Explorer is a
  pure renderer: everything comes from
  `python -m ai_router.progress --json <set-dir>`. There are no parity
  tests because there is nothing to keep in parity.
- The command surface shrank from 43 to ~15. Removed: the migration UI,
  the git PR/release workflow, Copilot seat setup, the sample project,
  and the annotation scanner. Kept: tree refresh, open
  spec/state/logs, copy session prompts, start/close session, new
  module, cancel/restore, bootstrap project, install router,
  troubleshoot.

## Orchestrator instruction files

Both `AGENTS.md` and `CLAUDE.md` carry a fenced managed block
maintained by `python -m ai_router.bootstrap` (`<!--
dabbler:managed:start -->` … `<!-- dabbler:managed:end -->`). Run it
once in an existing v1 project to install the v2 workflow block; user
content outside the fence is never touched.
