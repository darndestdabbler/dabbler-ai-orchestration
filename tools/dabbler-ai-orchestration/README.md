# Dabbler AI Orchestration

**Your AI work, organized like work.** Instead of a chat log you scroll
back through, this extension gives AI-led development the same shape the
rest of your project has: named units of work, an ordered plan for each
one, a step list that shows where the work actually is, and a record at
the end that survives the conversation. The tree below is not a summary
someone wrote — it is read back from files on disk that the workflow
writes as it goes.

![The AI Work Explorer panel in the VS Code sidebar. A Default module holding many sets is expanded into status buckets — In Progress, Not Started, Complete, Cancelled. The one in-progress set is expanded into its sessions; the session in flight is expanded again into its seven steps, each finished step carrying a tick and a start time, the step being worked carrying the in-progress glyph, and the final Close out step not started](https://raw.githubusercontent.com/darndestdabbler/dabbler-ai-orchestration/master/tools/dabbler-ai-orchestration/media/ai-work-explorer.png)

---

## The main features

**1. AI work organized into modules, session sets, sessions, and steps.**
A **module** is a unit of work owned by one developer at a time; under it,
**session sets** are ordered sequences of AI-led sessions you and the AI
co-design *before* code is written, each with a spec on disk; each
**session** carries its own step checklist. The **AI Work Explorer**
renders all four levels with live progress — expand the session in flight
and you see the step it is on and when each finished step started.

**2. Automatic cross-provider verification.** Every session is reviewed
before it closes by a model from a *different provider* than the one that
did the work — the verifier is chosen by excluding the orchestrator's own
provider, resolved from the model registry, never from a label a model
reports about itself. Round 1 reviews the full evidence (spec excerpt,
`git status`, the complete diff, untracked files); when findings need
fixing, later rounds review the fix delta, up to a bounded round cap.
You don't have to remember to ask for it, and the AI cannot decide its
own diff is too small to bother: a close with no verification evidence
runs the verification itself, and when no cross-provider verifier can be
reached the close stays blocked until an operator resolves it — there is
no silent pass. A finding the orchestrator believes is wrong doesn't
loop forever either: it can **dispute** the finding with evidence from
the repo, a deadlock at the round cap goes to a third **adjudicating**
provider that neither wrote nor reviewed the work, and the operator's
last resort — **waiving** — is typed at an interactive prompt an AI
cannot reach, recorded verbatim, and closes the session as *unverified*,
never as verified.

**3. Works through a Copilot seat or direct API keys.**

| | **Direct provider APIs** | **GitHub Copilot CLI seat** |
|---|---|---|
| Setup | Set `DABBLER_ANTHROPIC_API_KEY` / `DABBLER_OPENAI_API_KEY` / `DABBLER_GEMINI_API_KEY` | Install the Copilot CLI and sign in; set `DABBLER_TRANSPORT=copilot-cli` |
| Spend | Metered API calls, every one priced and logged | Covered by your existing Copilot subscription |
| Best for | Anyone with provider accounts | Shops whose staff hold only a Copilot seat and cannot get provider keys |

Verification needs reach to at least two provider families — two of the
three keys, or one seat that exposes two families.

**4. Session lifecycle management.** `session start` registers the
session (refusing to start one already in flight, re-open a closed one,
or skip ahead), seeds the spec's step checklist, and hands the AI the
step addresses to log against. Steps are logged as they execute; then
cross-provider verification, then the recorded test run, then commit and
push. `session close` runs **five gates** — verification clean, working
tree clean, pushed to remote, test run fresh, verdict vocabulary — and
only then flips the state and commits its own bookkeeping.

**5. Cost accounting per session, on both paths.** Every routed API call
is appended to a metrics ledger, priced from the model registry — the
bill is auditable rather than asserted. On a Copilot seat, spend is
measured from the Copilot CLI's own local usage store and attributed to
sessions by conversation id, never by wall clock; a cost that cannot be
priced is reported as unavailable, never as `$0.00`.

**6. Ample markdown documentation of the work.** Each session set keeps
its paper trail in predictable, human-readable places: `spec.md` (the
plan), `activity-log.json` (every step, timestamped), `change-log.md`
(what shipped, appended at every verification and close), and
`session-state.json` (where things stand, with verification verdicts).
You can step away and know exactly what happened while you weren't
watching — months later, from the repo alone.

**7. The machine owns the record.** All of the above is written through
sanctioned, schema-validated writers; verification rounds land in a
machine-only ledger with the raw verifier output saved before any
parsing, and out-of-band edits are detectable. No code path accepts a
hand-written verdict. Each of the five close gates exists because a real
incident got past a weaker check — none of them guards a hypothetical.

---

## Requirements

- **VS Code** 1.85+
- **Python 3.11+** with a workspace `.venv/` (the
  **`Dabbler: Install ai-router`** command sets it up)
- **A provider for the router to call** — either two of the three
  `DABBLER_*_API_KEY` variables (the normal provider-issued keys from
  Anthropic, OpenAI, and Google; Dabbler only prefixes the names), or an
  authenticated GitHub Copilot CLI seat exposing two provider families
- **One orchestrator AI agent** in VS Code (Claude Code, Codex / GitHub
  Copilot, or Gemini — the framework is agent-agnostic)

## Get started

Open a project folder and run **`Dabbler: Set Up New Project`** from the
Command Palette — it runs `python -m ai_router.bootstrap` in your
terminal, which writes the managed instruction blocks your AI agent
reads and prints the prompts for the two bootstrap sessions (project
plan, then decomposition into session sets). From there, tell your agent
**"start the next session"** and watch the tree.

The full workflow, command by command, is in the
[quick start](https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/quick-start.md);
the on-disk formats are documented in the
[schema reference](https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/schema-reference.md).

The framework is open-source (MIT) — your costs are entirely your
provider's API spend or your Copilot seat; nothing in this extension is
paywalled.

---

## Building from source

The extension is a pure renderer of
`python -m ai_router.progress --json` — TypeScript renders, Python
decides.

- Install the router first: `pip install dabbler-ai-router`
- Build the VSIX: `npm install && npm run package`
- Unit tests: `npm run test:unit` (vscode-stub, no Electron)
- UI tests: `npm run test:playwright` (downloads VS Code on first run)
