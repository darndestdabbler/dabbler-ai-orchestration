### Removed

- **(Set 123 S3) Every webview in the extension is gone.** The Getting
  Started / System Status view (`SetupStatusView`), the visual config
  editor (`Dabbler: Open Dabbler Config Editor`) and the cost dashboard
  (`Dabbler: Show Cost Dashboard`) are deleted, along with the
  QuickPick-driven `wizard/` commands `Dabbler: Import Project Plan`,
  `Dabbler: Generate Session-Set Prompt` and
  `Dabbler: Generate Parallel Session-Set Prompt (advanced)`. The
  extension now contributes exactly one view — the native Work Explorer
  tree — and no webview at all. Net **−12,294 lines** of source, tests and
  assets.

  **What replaced the setup form.** A project says what verifies it in one
  file, `project-verify-type.txt` at the repo root, holding
  `DIRECT_API` or `COPILOT_CLI`. `python -m ai_router.verify_type`
  resolves it — project file, else a machine default confirmed once, else
  a guided setup printed to the terminal — and the router **derives**
  `transport.profile` from that file, so it outranks the tracked
  `router-config.yaml` and nothing can disagree with it. (Set 124 re-scoped
  that file to **gitignored machine/project state** — see the Set 124 entry
  under *Changed* — and retired `transport.profile` from
  `local-overrides.yaml` outright.) Setup is `Dabbler: Set Up New Project`
  (non-interactive)
  plus that one command. The replacement was proven before the deletion:
  a true cold start walked from two `git init` folders holding nothing but
  `.git`, through both resolution branches, with no webview involved.

  **What survived the cut, deliberately.** `annotationParser` and
  `yamlReadWrite` moved to `src/utils/` (the annotation scanner still uses
  them); `providerKeyPresent` moved to `src/utils/providerKey.ts` (the
  scaffolder still uses it); the row/bucket/module payload types moved to
  `src/types/explorerPayloads.ts` — renamed, because a module called
  `sessionSetsWebviewProtocol` in an extension with no webview is a stale
  echo waiting to mislead someone. `Dabbler: Open Module Plan` also
  survived: it lived in `wizard/planImport.ts` but was never wizard work,
  and now lives in `src/commands/openModulePlan.ts`.

  `ai_router/router-metrics.jsonl` is still written on every routed call —
  read it with `python -m ai_router.report`, which produces the full
  markdown spend report the dashboard only visualised a slice of. The
  three config files are edited as YAML.

- **(Set 123 S3) The activity-bar container is `AI Orch`, not `AI Work
  Explorer`.** VS Code renders a view's header as
  `<container title>: <view name>`, so it used to read **AI WORK EXPLORER:
  WORK EXPLORER** — the same words twice. It now reads **AI ORCH: WORK
  EXPLORER**. The view's own name and every command id are unchanged, so
  keybindings and `when`-clauses are untouched.

