<!--
  GENERATED FILE — do not hand-edit the shared body.
  This body is rendered identically into CLAUDE.md, AGENTS.md, and GEMINI.md
  by the Dabbler shared template writer. Only the engine-specific bootstrap
  tail below the marker differs per file. Change the template at
  docs/templates/consumer-bootstrap/engine-file.shared-body.md (in the
  dabbler-ai-orchestration repo), not this generated copy.
-->
# AI orchestrator instructions — `acme-app`

> All three engine files in this repo (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`)
> share this body and differ only in the short engine-specific bootstrap tail
> at the bottom. Whichever engine you are, the role and the procedure are the
> same — the next session may be run by a different engine, which is why all
> three files exist.

## Your role

You are the **orchestrator** for `acme-app`, running AI-led work one
session at a time under the Dabbler session-set workflow. You do the
mechanics (file edits, shell, git) and follow a predefined per-session plan.

## Start every session here

When the operator says **"start the next session"**, open the cold-start
operative doc and follow it:

➡️ **[`docs/dabbler/start-here.md`](docs/dabbler/start-here.md)**

That file resolves the active session set, tells you the tier, registers the
session, and walks you through to close-out. **Do not improvise the
lifecycle** — `start-here.md` is the single home for the procedure, and it is
generated (never hand-edited).

## This project's tier

This repo's sets declare `tier: full` or `tier: lightweight` in each
`spec.md` (resolved per-set). The model is defined once — read it there, do
not assume it: the tier-model SSoT is
<https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/concepts/tier-model.md>.

## Canonical references (online — this repo does not vendor them)

- **Cold-start procedure:** [`docs/dabbler/start-here.md`](docs/dabbler/start-here.md)
- **Tier model (SSoT):**
  <https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/concepts/tier-model.md>
- **Full execution mechanics (10-step procedure, rules, verification):**
  <https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/ai-led-session-workflow.md>
- **Spec schema:**
  <https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/spec-md-schema.md>

Do not restate the tier model or the workflow in this file — link to the
canonical sources above so this engine file never drifts stale.

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
  When the active set is `tier: full`, run
  `.venv/Scripts/python.exe -m ai_router.verify_session` (POSIX:
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
- **Copilot-locked shop? Same engine, different provider is sanctioned
  (Mode B).** A Lightweight `dedicated-sessions` verification session must
  differ from the work sessions by engine **or by model provider**
  (`dabbler-ai-router` >= 0.27.0). If every session runs under Copilot, open a
  **second chat with the model picker on a different provider** than the one
  that did the work, and declare it honestly with **both** `--model` (required
  for a Copilot seat — it, not the label, is the real identity) **and** a
  **truthful** `--provider` that matches that model's provider: verify under
  `--engine copilot --model gpt-5.4 --provider openai` work done under
  `--engine copilot --model claude-sonnet-4.6 --provider anthropic`. Mind the
  split: a Copilot seat's identity is always the **model** (Set 084 F1), but the
  **Lightweight** Mode-B cross-provider check is older machinery that still
  compares the `--provider` **label** (Set 084 deliberately left the Lightweight
  tiers untouched). So the label must never diverge from the model's true
  provider — `start_session` warns when a `--model`'s registry provider
  contradicts its `--provider`, and declaring a false label to slip a
  same-provider pair past the Lightweight check would be **gaming** the
  guardrail, not satisfying it. `start_session --type verification` refuses a
  same-`(engine, provider)` start and the close-out gate fails it; pass a
  truthful `--provider` on work sessions too so the provider arm can be
  confirmed.
- **Want the Full-tier workflow on a Copilot-only seat, not just
  Lightweight Mode B?** A `copilot-cli` transport profile
  (`dabbler-ai-router` >= 0.28.0) lets Full-tier `route()`/`verify()`
  dispatch through the Copilot CLI's headless mode instead of a direct
  provider API — an indirect Full tier with explicitly degraded guarantees
  (asserted, not confirmed, provider provenance; no locally meterable
  billing). The seat still declares `--model` at `start_session` (above). See
  <https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/concepts/tier-model.md>
  → *The Full tier seat-profile option*.
