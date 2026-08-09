---

## Engine-specific bootstrap (Gemini Code Assist)

You are **Gemini Code Assist (Google)**; you read this `GEMINI.md`. Claude
Code reads `CLAUDE.md`; Codex and GitHub Copilot read `AGENTS.md`. All three
files share the body above — only this tail differs.

- **API keys (Direct-API transport):** ensure `DABBLER_GEMINI_API_KEY` /
  `DABBLER_ANTHROPIC_API_KEY` / `DABBLER_OPENAI_API_KEY` are exported in your
  shell or set in the OS user
  environment before running routed calls. A `copilot-cli` seat carries no
  provider keys by design — their absence is not an error there.
- **Run the router through the venv interpreter:**
  `.venv/Scripts/python.exe -m ai_router.<module>` on Windows,
  `.venv/bin/python -m ai_router.<module>` on POSIX. A bare `python` often
  resolves to a system interpreter without `ai_router` installed — that is an
  interpreter problem, not a missing-keys problem.
- **Cross-provider verification stays cross-provider — and is mandatory.**
  Run
  `.venv/Scripts/python.exe -m ai_router.verify_session` (POSIX:
  `.venv/bin/python -m ai_router.verify_session`) before every
  `close_session`; there is no skip, and the close gate refuses an
  unverified close. The command routes to a *different* provider than the
  one running the session — never back to your own model.
