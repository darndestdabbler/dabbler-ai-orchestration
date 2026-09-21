# Migrating from v1

Short version: there is nothing to migrate. The artifact contract is
unchanged — a v1 project opens in the v2 Work Explorer unmodified.

## Artifacts

- The per-repository artifacts keep their v1 names, locations, and
  schemas: the session plan, the session ledger, `change-log.md`,
  `activity-log.json`. The metrics ledger format `router-metrics.jsonl`
  is unchanged.
- **Schema v3 state files normalize on read** — no rewrite needed. A
  one-shot v3→v4 migrator existed and was retired after a validation run
  over the full v1 reference corpus; if ever needed it lives in git
  history at commit `6a1e4b7` (`ai_router/migrate_v3.py`).
- v4 set-shaped state migrates to the v5 per-repository ledger with
  `dabbler session migrate`, which reads the v4 file once and never
  writes it again.

## Verification records

- Round and verification files live under `.dabbler/runs/s<N>/`
  (gitignored) — outside the git working tree. Existing committed
  verification round files in v1 projects are left in place and ignored;
  only new rounds write to `.dabbler/runs/`.
- The close gate reads the machine-written round ledger (`rounds.jsonl`).
  Verification stamps, backstops, and integrity corroboration are gone —
  the record is trustworthy because only `dabbler verify` writes it, and a
  tampered line blocks the close.

## There is no Python

v1 and early v2 shipped a Python package, `ai_router`, and the extension
reached it by spawning `python -m ai_router.<module>`. Both are gone. The
router is one TypeScript implementation, published as the npm package
`dabbler-ai-router` with a `dabbler` command, and the extension bundles it
and calls it in-process.

What this changes for a project:

- **Nothing to install.** No interpreter, no virtual environment, no
  `pip install`. The extension puts `dabbler` on the integrated terminal's
  PATH, run on the editor's own Node. Outside VS Code, `npm i -g
  dabbler-ai-router`.
- **Every `python -m ai_router.<module>` becomes `dabbler <verb>`.** The
  arguments are unchanged; only the program in front of them moved. The
  managed instruction fence is regenerated with the new spelling by
  re-running `dabbler bootstrap` in the project, and so is the pre-commit
  guard, which used to bake in an absolute interpreter path and now names
  the command.
- **`dabbler status`** is the operator-facing name for the projection the
  Work Explorer renders. It was `python -m ai_router.progress --json`.
- The extension's "Install ai-router" command is gone; there is nothing to
  install. "Set Up New Project" is one call rather than a venv, a pip
  install and a bootstrap sent to a terminal.

Run `dabbler bootstrap --project-dir .` once in an existing project to
refresh the managed block and the hook. User content outside the fence is
never touched.

## Extension

- The Work Explorer re-implements no logic: it renders the projection the
  router computes, and the gates read the same record. It calls the router
  as a function now rather than reading a subprocess's stdout, so a
  truncated pipe is no longer a way for the view to be wrong.
- The command surface is: tree refresh, open plan/state/logs, copy session
  prompts, start/close session, new module, cancel/restore, set up new
  project, troubleshoot.

## Orchestrator instruction files

`AGENTS.md`, `CLAUDE.md` and `GEMINI.md` each carry a fenced managed block
maintained by `dabbler bootstrap` (`<!-- dabbler:managed:start -->` … `<!--
dabbler:managed:end -->`). `AGENTS.md` holds the body; the other two import
it and add their engine tail.
