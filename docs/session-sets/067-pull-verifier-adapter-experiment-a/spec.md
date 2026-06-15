# Pull-Verifier Adapter + Experiment A Spec

> **Purpose:** Build the **first-party tool-loop "pull" verifier adapter** — a
> `route()`-parallel agentic seam (`pull_route()`) in which the verifier drives
> the loop and the orchestrator is a **deterministic servant** serving raw
> ground truth (`read_file` / `grep` / `list_dir`, read-only) — with
> **Anthropic + OpenAI + Gemini** bindings; then run **Experiment A**
> (capability) per the Set 065 `forward-ab-design.md` to causally test whether
> path-aware critique catches real defects routed single-shot misses (and how
> much is context-access vs provider-multiplicity). If Experiment A confirms
> capability, wire the adapter as an **optional automated producer** of the
> Set 066 `path-aware-critique.json` artifact (manual stays the default), and
> ship it as an `ai_router` PyPI release. The disposable-worktree `run_test`
> sandbox, **Experiment B** (cadence), the routed **keep/demote/retire**
> decision, and the **contract-test/CDC gate** are deliberately **Set 068**.
> **Created:** 2026-06-15
> **Session Set:** `docs/session-sets/067-pull-verifier-adapter-experiment-a/`
> **Prerequisite:** Set 066 (`066-path-aware-critique-policy`) complete — it
> shipped the manual Path-Aware Critique policy + the `path-aware-critique.json`
> artifact contract this adapter automates.
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

---

## Session Set Configuration

```yaml
tier: full
requiresUAT: false
requiresE2E: false
uatScope: none
pathAwareCritique: required   # dogfood continues (Set 066 norm); see rationale
prerequisites:
  - slug: 066-path-aware-critique-policy
    condition: complete
```

> Rationale: pure `ai_router` tooling + a controlled experiment + a PyPI
> release; **no UI surface** (surfacing the adapter in the Session Set Explorer
> is deferred), so no UAT/E2E gate. **Full tier** because each session is
> cross-provider verified. It ships a **PyPI `ai_router` release** carrying the
> adapter; **no Marketplace bump** (no extension change).
>
> **`pathAwareCritique: required` (dogfood).** Continuing the Set 066 norm — a
> set building verification machinery is gated by the very review it
> institutionalizes. The blast-radius predicate scores this set `required` (new
> module + `router-config.yaml` wiring + it touches the shared
> `path-aware-critique.json` producer surface). The artifact is produced by the
> **manual** flow (Set 066) or, once Experiment A validates the adapter in
> Session 3, by the **new adapter itself** — a recursive dogfood, with the
> manual flow as the always-available fallback. The operator confirms the level
> at set start and may override.

---

## Project Overview

### Background

Set 065 (`bake-off-results.md`, `forward-ab-design.md`, `spike-report.md`,
`spike_first_party_adapter.py`) established, and Set 066 shipped, the **manual**
Path-Aware Critique policy: a multi-provider, repo-reading review saved as
`path-aware-critique.json` and enforced by a close-out gate. Set 066's own
dogfood proved the value live — two providers reading the repo caught four real
defects a snippet-fed single-shot verifier missed.

Two questions Set 066 deliberately left open are this set's job:

1. **Can the path-aware critique be *automated*** as a first-party, multi-provider
   tool-loop adapter (so it is not forever a manual Copilot flow)?
2. **Experiment A — capability:** on *identical frozen code*, does path-aware
   critique catch defects routed single-shot misses, and how much of any edge is
   context-access vs simply a second provider? (`forward-ab-design.md` Q1–Q4.)

### The architecture (settled by the Set 065 proposal + the Set 066 round-1/2 panel)

- The adapter is a **first-class agentic-executor seam / parallel entrypoint**
  (`pull_route()`), **NOT** a "new provider kind" nested in `route()` /
  `providers.call_model` (which is single-shot text-in/text-out — verified at
  `ai_router/providers.py`). The verifier drives a tool-use loop; the
  orchestrator answers tool calls.
- **Deterministic-servant guardrail (load-bearing).** The servant returns **raw
  ground truth** — file bytes, raw `grep` lines, a directory listing — and
  **never** a model-summarized or paraphrased view. This is the anti-bias
  property that makes a "pull" review trustworthy. The Set 065 spike
  (`spike_first_party_adapter.py`) is the ~150-LOC proof to harden.
- **Read-only toolset only in this set:** `read_file` / `grep` / `list_dir`,
  sandbox-confined. The `run_test` tool (the only one needing a disposable-worktree
  cage) is **Set 068**.
- Provider tool-loop bindings **differ** and must each be built and exercised:
  Anthropic `tool_use`, OpenAI `tool_calls`, Gemini `function_declarations`. The
  Set 065 spike only ran Anthropic.

### Scope (in)

- A production `pull_route()` agentic-loop adapter module in `ai_router` with
  turn / token / cost caps, the read-only deterministic-servant toolset,
  sandbox path confinement, a **forced structured verdict** matching the Set 066
  `path-aware-critique.json` critique-entry shape, and **tool-call-trace
  instrumentation** (probes actually run, not merely afforded).
- **Anthropic, OpenAI, and Gemini** tool-loop bindings; `router-config.yaml`
  wiring for the new executor.
- **Experiment A** (capability): seeded-defect catalogue + pre-authored
  falsifier suite on a controlled mock-repo (primary) and/or a harvester frozen
  tree (secondary); the 2×2 (context × provider) arms + derived pairs; K-repeat
  non-determinism sampling; the metrics in `forward-ab-design.md`. A written
  `experiment-a-results.md` with an explicit capability verdict.
- **Conditional wiring (S4):** if Experiment A confirms capability, an
  **optional** CLI/seam that produces a real `path-aware-critique.json` via the
  adapter (manual stays the default; the producer is opt-in).
- Focused **tests**, an `ai_router` **PyPI release**, and `change-log.md`.

### Non-goals (out — explicitly deferred)

- The disposable-worktree **`run_test` sandbox** and the `run_test` tool → **068**.
- **Experiment B** (cadence / staged-snapshot intervention study) → **068**.
- The routed **keep / demote / retire** decision → **068** (067 leaves
  per-session routed verification **unchanged**; Experiment A can only rule out a
  *capability* defense for routed, not its cadence defense).
- The **contract-test / CDC gate** → **068**.
- **Explorer / extension UI** for the adapter, and any **Marketplace** bump →
  future / optional.
- Replacing the manual Path-Aware Critique flow — the adapter is **additive**
  automation behind an already-shipped surface; manual remains the default.

### Standards

- **Deterministic servant:** every tool returns raw ground truth, never a
  model-summarized view. This is a pinned invariant, not an aspiration.
- **Read-only + sandbox-confined:** no tool may write, and every path is
  confined to the review sandbox (mirror the spike's `_safe()` discipline).
- **Routed verification stays UNCHANGED** — 067 does not touch routed's status;
  that decision is 068, gated on Experiment B.
- **Capped + instrumented:** every run enforces turn/token/cost caps and emits a
  tool-call trace; an agentic arm with zero tool calls is a failed run, not a
  fast one.
- **ASCII-only** CLI/terminal output (project-guidance Code Style).
- **Honest sizing for Experiment A:** aim for effect-size clarity, not p-values;
  state explicitly when an effect is too small to resolve at the chosen n/K
  rather than over-reading a near-tie (`forward-ab-design.md` § Sizing & honesty).

---

## Sessions

### Session 1 of 4: Adapter core + Anthropic binding (`pull_route()` seam)

**Steps:**
1. Register session start; read `project-guidance.md`, `lessons-learned.md`,
   `session-set-authoring-guide.md`, the Set 065 proposal (Candidate 1 + §7),
   `forward-ab-design.md`, `spike-report.md`, and `spike_first_party_adapter.py`;
   map `ai_router/providers.py` + the `route()` / `call_model` sites to confirm
   the new seam is **parallel to**, not nested in, the single-shot path.
2. **Finalize the tool contract** (the flagged prerequisite): pin the read-only
   toolset (`read_file` / `grep` / `list_dir`) signatures, the
   deterministic-servant return shapes (raw bytes / raw lines / listing), and the
   forced verdict schema (the Set 066 `path-aware-critique.json` critique entry:
   `provider` / `model` / `verdict` / `summary` / `findings`).
3. Implement `pull_route()` (a new `ai_router` module — e.g.
   `ai_router/pull_verifier.py`): the agentic loop driver with turn / token /
   cost caps, the **Anthropic** `tool_use` binding, sandbox-confined read-only
   tool dispatch (harden the spike's `_safe()`), the forced structured verdict,
   and **tool-call-trace instrumentation** (per-turn tool name + args + a
   raw/elided flag proving the servant returned ground truth).
4. The **deterministic-servant guardrail** as code + test: a tool result is the
   raw artifact, never an LLM-touched string; a guard/assert makes a
   summarizing servant a hard failure.
5. Unit tests (mocked provider tool-loop — no metered calls in unit tests):
   loop terminates at caps; sandbox escape is refused; tools return raw content;
   the verdict is forced to the artifact schema; the trace records real tool use;
   a zero-tool-call run is flagged.
6. Cross-provider verification; `disposition.json` (routed `next_orchestrator`);
   commit + push; `close_session`.

**Creates:** `ai_router/pull_verifier.py` (the adapter), its tests, the tool-contract note.
**Touches:** possibly `ai_router/__init__.py` (export the new seam).
**Ends with:** `pull_route()` drives a capped, instrumented, sandbox-confined
read-only tool loop under Anthropic, emits a schema-valid critique verdict, and
the deterministic-servant guardrail is enforced by a test; session **VERIFIED**.
**Progress keys:** `seam-implemented`, `anthropic-binding`, `servant-guardrail`,
`s1-verified`.

---

### Session 2 of 4: OpenAI + Gemini bindings + config wiring

**Steps:**
1. Register; read S1 deliverables and the provider layer; confirm
   Anthropic / OpenAI / Google **API access** (the flagged prerequisite).
2. Add the **OpenAI** `tool_calls` and **Gemini** `function_declarations`
   bindings behind the same `pull_route()` loop driver — provider-specific
   request/response shaping, same toolset, same forced verdict, same caps and
   trace. Keep the loop driver provider-agnostic; isolate the per-provider
   shaping.
3. Wire the new agentic-executor into `router-config.yaml` (its own config block:
   per-provider model pins, caps, cost ceilings) — distinct from the single-shot
   `route()` config.
4. A **3-provider headless capability check** (a small metered live test, or a
   recorded-cassette test): each provider actually issues tool calls and returns
   a schema-valid verdict on a tiny fixture repo. (Truncation-aware per L-064-1;
   bounded thinking budget for Gemini.)
5. Tests: per-provider binding shaping (mocked); the config loader resolves the
   executor block; tool-call parity across providers.
6. Cross-provider verification; `disposition.json`; commit + push; `close_session`.

**Creates:** the OpenAI + Gemini bindings + their tests; the `router-config.yaml`
executor block.
**Touches:** `ai_router/pull_verifier.py`, `ai_router/router-config.yaml`,
config loader.
**Ends with:** all three providers drive the read-only tool loop headless and
return schema-valid verdicts with confirmed tool use; session **VERIFIED**.
**Progress keys:** `openai-binding`, `gemini-binding`, `config-wired`,
`three-provider-parity`, `s2-verified`.

---

### Session 3 of 4: Experiment A — capability study

**Steps:**
1. Register; read `forward-ab-design.md` (Experiment A, arms, ground-truth,
   metrics, sizing) and `bake-off-results.md`. **Pre-register** Experiment A's
   success criteria (the flagged prerequisite): the catch-rate thresholds and the
   specific comparisons (B1−A1 context effect; A1∪A2−A1 provider-multiplicity;
   does routed-pair catch anything path-aware-pair misses) that will read as
   "capability confirmed / not confirmed."
2. Build the **seeded-defect harness** on the controlled **calculator mock-repo**
   (primary; cheap, fully seedable): ~20–30 defects across ~4–6 frozen trees,
   spanning the catalogue classes in `forward-ab-design.md` (index/count
   undercount, name-collision/dup-key, too-narrow regex, type/shape
   contradiction, silent coercion, cross-file join-key drift,
   remediation-regression, ≥2 genuinely novel-reasoning controls), each
   **pre-labelled probeable vs novel**. Optionally add a harvester 008–012 frozen
   tree as the ecological secondary.
3. **Pre-author the deterministic falsifier suite** (one assert/round-trip test
   per seeded defect) *before* running any agent — this forward-tests the
   retrospective's ~92%-probeable finding and sizes what a contract-test gate
   (068) could carry.
4. Run the **2×2 arms**: A1/A2 = routed (`route()`, GPT / Gemini, snippet/diff);
   B1/B2 = path-aware (the new adapter, GPT / Gemini, repo+probes). **Blind**
   (no arm sees another's output), single-round/matched-cadence, **K≈3 repeats**
   per agentic arm for the non-determinism distribution. Record per-arm:
   severity-weighted catch rate (probeable/novel split), false-positive rate,
   cost ($ metered / tokens / tool-call count), and latency. Persist all raw
   outputs to disk first (L-064-3).
5. Analyze into **`experiment-a-results.md`**: the headline comparisons, the
   capability verdict against the pre-registered criteria, and an explicit
   honesty note where an effect is too small to resolve at this n/K.
6. Cross-provider verification **of the analysis** (the routed verifier checks
   the inference, not the wet-lab run); `disposition.json`; commit + push;
   `close_session`.

**Creates:** the seed harness + defect catalogue, the falsifier suite, the raw
arm outputs, `experiment-a-results.md`.
**Touches:** test/fixture dirs only (no production-code change this session).
**Ends with:** Experiment A run with K-repeats across all four arms; a written,
cross-provider-verified capability verdict against pre-registered criteria;
session **VERIFIED**.
**Progress keys:** `criteria-pre-registered`, `seed-harness-built`,
`falsifiers-authored`, `arms-run`, `experiment-a-verdict`, `s3-verified`.

---

### Session 4 of 4: Conditional producer wiring + synthesis + release

**Steps:**
1. Register; read S1–S3 deliverables and `experiment-a-results.md`.
2. **Conditional on Experiment A:** **if** capability is confirmed, wire the
   adapter as an **optional automated producer** of `path-aware-critique.json` —
   a CLI/seam (e.g. `python -m ai_router.pull_verifier <set-dir>` or a
   `pull_critique` entry) that runs the multi-provider path-aware critique and
   writes the Set 066 artifact the close-out gate already validates; **manual
   stays the default**, the producer is strictly opt-in. **Else** record the
   capability gap and **defer** the producer wiring (the adapter still ships as a
   library seam), documenting why.
3. Update docs: the adapter in `ai_router/docs/` (or the relevant doc), and the
   Set 066 manual-flow docs gain an "automated alternative (opt-in)" note;
   keep the deterministic-servant + read-only invariants explicit.
4. Finalize tests; bump `ai_router` version; ship the **PyPI release** following
   the publish runbook (green-`Test`-on-the-tagged-SHA prerequisite; tag `v*`).
   Record the publish run id post-release. Routed verification stays **unchanged**.
5. Author `change-log.md`; route the **next-session-set recommendation**
   (expected **068** = `run_test` sandbox + Experiment B + the routed
   keep/demote/retire decision + the contract-test/CDC gate); cross-provider
   verification; **dogfood** (`pathAwareCritique: required` — produce this set's
   own `path-aware-critique.json` via the manual flow or the now-validated
   adapter); `close_session`; set closes.

**Creates:** the optional producer CLI/seam (if Exp A confirms), `change-log.md`,
this set's own dogfood artifact.
**Touches:** `ai_router` version + CHANGELOG, the adapter + Set 066 docs.
**Ends with:** the adapter is shipped and (conditionally) wired as an opt-in
automated path-aware-critique producer; Experiment A's verdict is recorded; PyPI
published; this set dogfooded its own gate; the set is closed.
**Progress keys:** `producer-wired-or-deferred`, `docs-updated`, `released`,
`change-log-written`, `dogfooded`, `s4-verified`.

---

## End-of-set deliverables

- The `pull_route()` first-party tool-loop adapter (`ai_router/pull_verifier.py`)
  with Anthropic + OpenAI + Gemini bindings, read-only deterministic-servant
  toolset, caps, sandbox confinement, forced verdict, and trace (S1–S2).
- `router-config.yaml` executor wiring (S2).
- `experiment-a-results.md` — the cross-provider-verified capability verdict
  against pre-registered criteria, with the seed harness + falsifier suite (S3).
- The optional automated `path-aware-critique.json` producer, **or** a recorded
  deferral with rationale (S4).
- An `ai_router` **PyPI release** carrying the adapter (S4).
- This set's dogfood `path-aware-critique.json` and `change-log.md` (S4).

A shipped, capability-validated, multi-provider pull-verifier adapter that can
automate the Set 066 Path-Aware Critique — with the `run_test` sandbox, the
cadence study (Experiment B), the routed keep/demote/retire decision, and the
contract-test/CDC gate sequenced into Set 068.
