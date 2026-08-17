# dabbler-ai-orchestration v2

Rebuild of the AI-led coding-session framework. Python package `ai_router`
(distribution `dabbler-ai-router`), plus a VS Code extension under `tools/`
(Session 3). The compatibility contract, module inventory, and session plan
live in the rebuild work plan; `STATUS.md` carries the inter-session handoff.

## Ground rules

1. **No new module without deleting one.** The module inventory in the rebuild
   work plan is the ceiling.
2. **No guard may guard another guard.** Every gate must cite the concrete v1
   incident it would have prevented (the five kept gates each have one; see
   Session 2).
3. **One implementation of any rule, in one language.** TS renders; Python
   decides.
4. **Test budget is a ceiling: 480 Python / 215 TS.** One test per behavior.
   No falsifier-twin doctrine, no tests of test infrastructure, no source-text
   assertions (use ruff/ESLint), no migration-path tests, no tests asserting
   exact markdown strings.
5. **The machine owns the record.** Nothing under `.dabbler/runs/` is ever
   hand-edited or exempted; no code path may accept a hand-written verdict.
6. **No process ceremony on this repo itself.** Plain git commits with plain
   messages. Do not use v1's session machinery, and do not build v2's own
   machinery around v2's development.
7. **Comments state constraints, not history.** No "Set NNN" archaeology. If a
   lesson matters, encode it structurally.
8. **LOC budgets are targets ±30%, not gates.** If a module wants to be 2× its
   budget, stop and reconsider the design instead of writing a justification.

## Environment

- Windows 11, PowerShell primary. Python 3.11+; `.venv` in the repo root.
- Run tests: `.venv/Scripts/python -m pytest` (no live network outside the
  `e2e` marker).
- Provider keys via env vars: `DABBLER_ANTHROPIC_API_KEY`,
  `DABBLER_OPENAI_API_KEY`, `DABBLER_GEMINI_API_KEY`. Never in config or logs.
- Transport preference: CLI flag `--transport` > `DABBLER_TRANSPORT` env >
  `transport.profile` in router-config.yaml > default `api`.
