---

## Engine-specific bootstrap (Codex / GitHub Copilot)

You are **Codex (OpenAI)** or **GitHub Copilot**; you read this `AGENTS.md`.
Claude Code reads `CLAUDE.md`; Gemini Code Assist reads `GEMINI.md`. All three
files share the body above — only this tail differs.

- **API keys (Direct-API transport):** ensure `DABBLER_OPENAI_API_KEY` /
  `DABBLER_ANTHROPIC_API_KEY` / `DABBLER_GEMINI_API_KEY` are exported in your
  shell or set in the OS user environment before running routed calls. A
  `copilot-cli` seat carries no provider keys by design — their absence is
  not an error there.
- **Run the router through the venv interpreter:**
  `.venv/Scripts/python.exe -m ai_router.<module>` on Windows,
  `.venv/bin/python -m ai_router.<module>` on POSIX. A bare `python` often
  resolves to a system interpreter without `ai_router` installed — that is an
  interpreter problem, not a missing-keys problem.
- **A Copilot seat must declare `--model` at `start_session`
  (`dabbler-ai-router` >= 0.29.0).** `--engine copilot` / `--engine
  github-copilot` is a multi-provider seat, so its identity is the
  **underlying model, not the seat label** (Set 084 F1). `start_session`
  **refuses** a Copilot start without a registry-known `--model` (e.g.
  `--model claude-sonnet-4.6`) and records `identityProvenance: asserted`.
  Every verifier-exclusion / same-provider check downstream derives the
  effective provider from that model; `--provider` is a human-readable seat
  descriptor only.
- **Cross-provider verification stays cross-provider — and is mandatory.**
  Run `.venv/Scripts/python.exe -m ai_router.verify_session` (POSIX:
  `.venv/bin/python -m ai_router.verify_session`) before every
  `close_session`; there is no skip, and the close gate refuses an
  unverified close. The verifier is chosen by **excluding the orchestrator's
  effective (model-derived) provider** — never back to your own model. If no
  different-provider verifier can be reached, the outcome is
  `verification_unavailable` (blocked; resolvable only by the operator-attested
  `--manual-verify`), never a silent same-provider pass. And **if you reach
  close-out unverified, `close_session` runs the verification itself** (the
  Set 084 backstop) — you can only pre-empt it by running `verify_session`
  first.
- **Copilot-locked shop?** A `copilot-cli` transport profile
  (`dabbler-ai-router` >= 0.28.0) lets `route()` / `verify()` dispatch
  through the Copilot CLI's headless mode instead of a direct provider API,
  with explicitly degraded guarantees (asserted, not confirmed, provider
  provenance; no locally meterable billing). Verification still excludes the
  orchestrator's effective provider — a seat whose catalog serves only one
  provider family yields `verification_unavailable`, never a silent
  same-provider pass. The seat still declares `--model` at `start_session`
  (above).
