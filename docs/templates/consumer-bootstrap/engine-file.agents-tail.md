---

## Engine-specific bootstrap (Codex / GitHub Copilot)

You are **Codex (OpenAI)** or **GitHub Copilot**; you read this `AGENTS.md`.
Claude Code reads `CLAUDE.md`; Gemini Code Assist reads `GEMINI.md`. All three
files share the body above — only this tail differs.

- **API keys (Full tier):** ensure `DABBLER_OPENAI_API_KEY` /
  `DABBLER_ANTHROPIC_API_KEY` / `DABBLER_GEMINI_API_KEY` are exported in your
  shell or set in the OS user
  environment before running routed calls. (Lightweight tier makes no metered
  calls, so keys are not required to run sessions.)
- **Run the router through the venv interpreter:**
  `.venv/Scripts/python.exe -m ai_router.<module>` on Windows,
  `.venv/bin/python -m ai_router.<module>` on POSIX. A bare `python` often
  resolves to a system interpreter without `ai_router` installed — that is an
  interpreter problem, not a missing-keys problem.
- **Cross-provider verification stays cross-provider.** When the active set is
  `tier: full`, end-of-session verification routes to a *different* provider
  than the one running the session — never back to your own model.
- **Copilot-locked shop? Same engine, different provider is sanctioned
  (Mode B).** A Lightweight `dedicated-sessions` verification session must
  differ from the work sessions by engine **or by model provider**
  (`dabbler-ai-router` >= 0.27.0). If every session runs under Copilot, open a
  **second chat with the model picker on a different provider** than the one
  that did the work, and declare it honestly:
  `--engine copilot --provider openai` verifying work done under
  `--engine copilot --provider anthropic`. `start_session --type verification`
  refuses a same-engine+same-provider start, and the close-out gate fails it —
  so always pass `--provider` on work sessions too, or the provider arm cannot
  be confirmed and a different engine becomes the only accepted path.
- **Want the Full-tier workflow on a Copilot-only seat, not just
  Lightweight Mode B?** A `copilot-cli` transport profile
  (`dabbler-ai-router` >= 0.28.0) lets Full-tier `route()`/`verify()`
  dispatch through the Copilot CLI's headless mode instead of a direct
  provider API — an indirect Full tier with explicitly degraded guarantees
  (asserted, not confirmed, provider provenance; no locally meterable
  billing). See
  <https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/concepts/tier-model.md>
  → *The Full tier seat-profile option*.
