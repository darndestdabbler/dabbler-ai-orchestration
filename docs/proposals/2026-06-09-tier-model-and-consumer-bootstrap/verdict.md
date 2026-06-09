# Verdict — Tier-Model Clarity & Consumer-Repo Bootstrap Reconciliation

> **Date:** 2026-06-09
> **Question:** Reconcile the Dabbler consumer-repo setup + documentation
> layer to the code-verified tier model, so a fresh human **and** a cold AI
> orchestrator can stand up and run a Full- or Lightweight-tier repo with no
> "what do I do next?" gaps.
> **Method:** Cross-provider decision consensus (openai:gpt-5.4 +
> google:gemini-2.5-pro), then a fresh-instance tiebreaker
> (anthropic:claude-opus-4-8) on the single split. Orchestrator
> (claude-opus-4-8, this conversation) excluded from the consensus vote.
> **Raw inputs:** [`consensus-gpt-5-4.md`](consensus-gpt-5-4.md),
> [`consensus-gemini-pro.md`](consensus-gemini-pro.md),
> [`tiebreaker-opus.md`](tiebreaker-opus.md).
> **Consult cost:** consensus $0.1328 + tiebreaker $0.0526 = **$0.1854**.

---

## Triggering defect

A human scaffolded a new **Lightweight** consumer repo and was left stuck:
no `AGENTS.md` / `CLAUDE.md`, no `.venv`, generated specs missing the `tier:`
field, no clear "what next." Root cause: **four setup surfaces encode a
stale, pre-Set-048 tier model** ("Lightweight = no Python / no venv / no
close-out / copyable-prompt verification") that contradicts the actual code
(`ai_router/runtime_mode.py`), Set 057, and operator intent:

1. `docs/adoption-bootstrap.md` — defines Lightweight as "No `ai_router/`, no
   Python venv, no close-out machinery, no cross-provider verification"; only
   ever writes "a small CLAUDE.md amendment."
2. The Get Started wizard (`webview/wizard.html`) — lists Python as a
   **Full-only** prerequisite; "copyable review prompts"; no engine-file
   mention; no "you're set up, here's what *start the next session* does"
   closure.
3. `sessionGenPrompt.ts` — emits specs with **no `tier:` field**, bare slugs
   (no `NNN-`), `schemaVersion: 2` (canonical is v4), no `verificationMode`.
4. `gitScaffold.ts` — empty folders only; no venv, no package install, no
   engine files, no spec template.

**Code-verified correction:** the only tier differentiator is the AI router
(external API calls). `tier: lightweight` in `spec.md` flips `--no-router`
(zero API calls); `start_session`, `close_session`, the blessed writer, state
derivation, and the close-out gate **all still run**. **Lightweight is
router-off, not Python-off.**

---

## Locked decisions

Both engines returned **high confidence** and converged on D1–D4, D7, D8.
D5 (cold-start shape) was the lone split, broken by the Opus tiebreaker
(Option A, medium confidence); D6 is the tiebreaker's refinement.

- **D1 — Single source of truth for the tier model.** Standardize all docs
  and setup on "Lightweight = router-off, not Python-off; `tier:` is the
  single declarative switch; both tiers share the Python lifecycle." Create
  one canonical SSoT doc (`docs/concepts/tier-model.md`); README,
  `adoption-bootstrap.md`, the wizard, and the engine files **point** to it
  rather than restating it.

- **D2 — Engine files: all three, every consumer repo, both tiers, thin
  pointers.** Always write `AGENTS.md` + `CLAUDE.md` + `GEMINI.md` (the next
  session's orchestrator may be a different engine). Thin shared body + a
  short engine-specific bootstrap tail; no inline hand-maintained copies.

- **D3 — Setup uniformity.** Both tiers scaffold a `.venv` and
  `pip install dabbler-ai-router`. The **only** intentional divergence: Full
  writes router config; Lightweight sets `tier: lightweight` and omits router
  config. Everything else identical (package, lifecycle CLI, engine files,
  folder layout, start/close, close-out).

- **D4 — One canonical `spec.md` template.** `schemaVersion: 4`, fixed field
  set including required `tier` and `verificationMode` (default
  `out-of-band-or-none`), `NNN-` slug enforced. Replace the ad-hoc markdown
  assembly in `sessionGenPrompt.ts` with **one shared template writer** used
  by the fast path, the wizard, and `gitScaffold`. It must never emit the
  `schemaVersion: 2` shape again.

- **D5 — Cold-start chain = Option A (local `start-here.md`).** *Opus
  tiebreaker.* Chain: **engine file → `docs/dabbler/start-here.md` → active
  `spec.md` → read `tier` + `verificationMode` → run `start_session`
  (routed | `--no-router`) → close via the shared gate.** The invariant
  lifecycle *procedure* lives once in a generated, never-hand-edited local
  operative file — **not** duplicated into every per-set `spec.md` (which is
  per-set *content*, not procedure) and **not** behind a network-only URL.
  `start-here.md` is generated from the same template bundle as the engine
  files and snapshot-tested.

- **D6 — Deterministic active-set resolution.** *Opus refinement.*
  `start-here.md` must name **one machine-checkable rule** for selecting *the*
  active `spec.md` (e.g., the highest `NNN-` whose state is not closed, or an
  explicit current-session pointer) and state it verbatim; CI enforces
  "exactly one active set" so a cold agent never guesses among sets.

- **D7 — Fix lives in BOTH code and docs.** A docs-only fix is insufficient —
  the wizard / `sessionGenPrompt` / `gitScaffold` literally generate
  broken Lightweight repos. The extension materializes the correct artifacts
  on every path (including the fast path); docs/templates are the durable
  source of truth. This ships a **VS Code Marketplace release.**

- **D8 — Drift prevention.** SSoT + pointers, plus **CI drift checks**:
  generated stubs / `start-here.md` are rendered from the same template
  bundle (snapshot-tested), and a guard forbids the stale framing
  (`Lightweight = no Python` / "no venv") from reappearing in any doc.

## Recorded dissent (rejected)

Both engines named the same counter-argument and rejected it: *"uniformity
forces Python/venv onto Lightweight users who wanted a pure-docs workflow."*
Rejected because the pure-docs model "was an illusion that was already broken
and inconsistent with the implemented `--no-router` mode" (Gemini). The
operator has independently confirmed they want the uniform Python lifecycle.

A second, narrower dissent (GPT-5.4): a docs-only fix would avoid a
Marketplace release since `runtime_mode.py` already supports Lightweight once
`spec.md` is written correctly — rejected because the repo-creation paths are
exactly where the wrong model is encoded.

## Sequencing (both engines converged; adopted into the spec)

1. Ratify canonical contract: SSoT tier doc, v4 spec template, engine
   bootstrap text, `start-here.md` template. *(docs/templates — no release)*
2. Fix `sessionGenPrompt.ts` to the shared template writer.
3. Fix `gitScaffold.ts` to scaffold venv + package + engine files +
   `start-here.md` + templated spec; router config Full-only.
4. Update the Get Started wizard (prereqs/copy + explicit "you're ready —
   tell your orchestrator *start the next session*" closure).
5. Rewrite README + `adoption-bootstrap.md` as thin pointers to the SSoT.
6. Acceptance tests (cold-start, both tiers) + CI drift checks.
7. Ship the Marketplace release; backfill existing consumer repos.

Folded into the three-session arc in
[`../../session-sets/058-tier-model-clarity-and-consumer-bootstrap/spec.md`](../../session-sets/058-tier-model-clarity-and-consumer-bootstrap/spec.md).
