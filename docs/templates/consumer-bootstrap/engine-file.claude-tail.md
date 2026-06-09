---

## Engine-specific bootstrap (Claude Code)

You are **Claude Code**; you read this `CLAUDE.md` automatically. Codex and
GitHub Copilot read `AGENTS.md`; Gemini Code Assist reads `GEMINI.md`. All
three files share the body above — only this tail differs.

- **API keys (Full tier):** Claude Code inherits the OS user environment, so
  `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` / `OPENAI_API_KEY` are normally
  already present. If a routed call fails on a missing key, confirm it is set
  in the user environment before retrying. (Lightweight tier makes no metered
  calls, so keys are not required to run sessions.)
- **Run the router through the venv interpreter:**
  `.venv/Scripts/python.exe -m ai_router.<module>` on Windows,
  `.venv/bin/python -m ai_router.<module>` on POSIX. A bare `python` often
  resolves to a system interpreter without `ai_router` installed — that is an
  interpreter problem, not a missing-keys problem.
- **Import the router** from your scripts with `from ai_router import route`
  after `.venv` activation.
