<!-- dabbler:managed:start -->
# AI orchestrator instructions — `dabbler-ai-orchestration`

> `CLAUDE.md` and `AGENTS.md` share this managed body and differ only in
> the engine tail. The next session may be run by a different engine —
> that is why both files exist. Do not hand-edit inside the fence; re-run
> `python -m ai_router.bootstrap` to refresh it.

## Your role

You are the **orchestrator** for `dabbler-ai-orchestration`, running AI-led work one
session at a time under the Dabbler session-set workflow. You do the
mechanics (file edits, shell, git) and follow the per-session plan in the
active set's `spec.md`.

## The session lifecycle

1. **Resolve the active session set.** The active set is the single
   directory `docs/session-sets/<NNN-slug>/` whose `session-state.json`
   has `status: "in-progress"`. There must be at most one. If none is
   in-progress, the next set to start is the `not-started` set with the
   lowest `NNN-` prefix; `complete` and `cancelled` sets are skipped.
   Never infer state from file presence; read the `status` field. Two
   in-progress sets is a drift error — stop and surface it.

2. **Register the session (state first, work second).**

       python -m ai_router.session start --session-set-dir docs/session-sets/<slug> \
           --engine <claude-code|codex|gemini|copilot> --provider <anthropic|openai|google>

   Copilot seats must also pass `--model` (the seat label is not trusted;
   identity resolves through the model registry). Idempotent — safe to
   re-run after a context reset.

3. **Do the work.** Follow the active spec's step list for the current
   session. Log progress, make the edits, run the tests. Do NOT commit
   yet — verification reviews the working tree, and an already-committed
   tree presents an empty diff.

4. **Run cross-provider verification (mandatory — there is no skip).**

       python -m ai_router.verify --session-set-dir docs/session-sets/<slug>

   The verifier is a different provider than you, on either transport.
   Round outcomes land in `.dabbler/runs/` (machine-written; never edit).
   Blocking findings: remediate, re-run the same command — rounds ≥2
   review only your fix delta. The loop suspends at the round cap.

5. **Record the test run of record** after your last code change, then
   **commit and push the verified work**:

       python -m ai_router.test_evidence record --session-set-dir <dir> \
           --suite <name> --outcome passed --duration-seconds <elapsed>

6. **Close via the gate.**

       python -m ai_router.session close --session-set-dir docs/session-sets/<slug>

   Five gates run (verification clean, tree clean, pushed, tests fresh,
   verdict vocabulary); use `--dry-run` any time to preview the rows.
   The close flips the state, then commits and pushes its bookkeeping.

## Hard rules

- State files (`session-state.json`) and everything under `.dabbler/runs/`
  are written by the router only — never by hand, never "fixed up".
- Verification verdicts come from the verifier. A verdict token you did
  not receive from `ai_router.verify` does not exist.
- API keys live in env vars (`DABBLER_ANTHROPIC_API_KEY`,
  `DABBLER_OPENAI_API_KEY`, `DABBLER_GEMINI_API_KEY`), never in files.
- Run the router through the project venv:
  `.venv/Scripts/python -m ai_router.<module>` on Windows,
  `.venv/bin/python -m ai_router.<module>` on POSIX. "No module named
  ai_router" is an interpreter problem, not a missing-keys problem.

---

## Engine tail (Codex / GitHub Copilot / Gemini)

You read this `AGENTS.md`; Claude Code reads `CLAUDE.md` (same managed
body). Copilot seats: declare `--model` at session start and prefer
`DABBLER_TRANSPORT=copilot-cli` when routing through the seat. Cross-
provider verification stays cross-provider on every transport.

<!-- dabbler:managed:end -->
