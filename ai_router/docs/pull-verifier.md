# The first-party pull-verifier adapter + path-aware-critique producer

> **What this is.** `ai_router`'s first-party, multi-provider **tool-loop
> "pull" verifier** (`ai_router/pull_verifier.py`) and the opt-in
> **producer** (`ai_router/pull_critique.py`) that uses it to write the Set
> 066 `path-aware-critique.json` artifact automatically. Shipped across Set
> 067 (S1 adapter core + Anthropic binding; S2 OpenAI + Gemini bindings +
> config wiring; S3 the Experiment A capability study; S4 the producer +
> this doc).
>
> **Authoritative design.** The tool contract is pinned in
> `docs/session-sets/067-pull-verifier-adapter-experiment-a/tool-contract.md`;
> the capability evidence is in that set's `experiment-a-results.md`.

---

## Why a "pull" verifier (and why a new seam)

The routed path (`route()` / `ai_router.providers.call_model`) is **single-shot
text-in/text-out**: one POST, one result, no loop. A reviewer on that path sees
only the snippet the (biased) author chose to paste — it cannot go read the rest
of the repo. Set 065's bake-off and Set 067's Experiment A both showed that a
reviewer with **real, path-aware access** catches a class of high-severity
**cross-file** defects (dup-key collisions, index undercounts, cross-artifact
contract drift) that a snippet-fed single-shot reviewer structurally cannot see.

`pull_route()` is the seam for that: a **`route()`-parallel agentic executor**
in which the **verifier drives a tool-use loop** and the orchestrator is a
**deterministic servant** answering read-only tool calls with **raw ground
truth**. It is a first-class entrypoint, not a branch inside `route()`, because
the two are different control structures (multi-turn agentic loop vs. one-shot).
They share only the provider *config* block.

### Load-bearing invariants

- **Deterministic servant (anti-bias).** Every tool result is raw ground
  truth — file bytes, raw grep lines, a directory listing — never a
  model-summarized view. The driver independently re-derives ground truth and
  asserts byte-equality; a summarizing servant raises
  `DeterministicServantViolation` (a hard failure). This is what makes a
  "pull" review trustworthy: the critic cannot be fed a flattering paraphrase.
- **Read-only + sandbox-confined.** The tool registry has no write/edit/delete
  tool, and every path is confined to the review sandbox by `_safe()` (resolves
  symlinks and `..`; a real-target-outside-sandbox path is refused).
- **Capped + instrumented.** Every run enforces turn / token / cost ceilings
  and emits a tool-call trace. A run that produces a verdict with **zero** probe
  calls is a **failed** run (`zero_tool_calls`), not a fast one — `PullResult.ok`
  requires both a schema-valid verdict AND a real probe.
- **Forced structured verdict.** The loop ends with a forced `submit_verdict`
  tool call shaped to the Set 066 critique-entry (`provider` / `model` /
  `verdict` / `summary` / `findings`), so a single emitted entry already
  satisfies the per-entry structural rules of `path-aware-critique.json`.

---

## Providers

Three provider bindings drive the same provider-agnostic loop:

| Provider | API surface | Notes |
|---|---|---|
| `anthropic` | Messages API `tool_use` | effort + adaptive thinking knobs. |
| `openai` | **Responses API** `function_call` / `function_call_output` | GPT-5.x rejects function tools + `reasoning_effort` on `/chat/completions`; reasoning is kept server-side via `previous_response_id` chaining (stateful per run). |
| `google` | `function_declarations` | positional `functionCall` / `functionResponse` (no wire id); bounded `thinkingBudget` per L-064-1. |

### Configuration (`router-config.yaml` → `pull_verifier:`)

This executor block is **distinct from** the single-shot routing table — the
pull verifier is not a routed model, it is an agentic seam:

```yaml
pull_verifier:
  models:                # per-provider model pin (else _DEFAULT_MODELS)
    anthropic: claude-sonnet-4-6
    openai: gpt-5.4
    google: gemini-2.5-pro
  caps:                  # PullCaps; loop stops at the first ceiling
    max_turns: 14
    max_output_tokens: 24000   # generous: reasoning consumes the output budget
    token_budget: 300000
    cost_ceiling_usd: 1.00
  generation_params:     # per-provider reasoning knobs
    openai:   { reasoning_effort: medium }
    google:   { thinking_budget: 8192 }
```

---

## Using the adapter directly

```python
from ai_router import pull_route

result = pull_route(
    "path/to/sandbox",              # read-only review sandbox (a directory)
    "Review this repository for real defects.",
    provider="openai",              # anthropic | openai | google
)
print(result.ok, result.trace.tool_call_count)
print(result.critique.to_critique_entry())   # the Set 066 critique entry
```

`pull_route` returns a `PullResult` (`provider`, `model`, `critique`, `trace`).
The diagnostic CLI `python -m ai_router.pull_verifier <sandbox>` runs one
provider and prints/writes the result JSON.

---

## The path-aware-critique producer (opt-in)

`ai_router/pull_critique.py` is the Set 067 S4 producer. It drives `pull_route`
once per provider over a read-only repository sandbox, assembles the
per-provider verdicts into the Set 066 `path-aware-critique.json` envelope, and
writes it beside `spec.md` at the session-set root — the same artifact the
close-out gate validates.

**Manual flow stays the default.** The producer is strictly opt-in: nothing in
the normal session flow invokes it, and the manual GitHub-Copilot flow
(`ai_router/prompt-templates/path-aware-critique.md`) remains the always-
available fallback. The producer reuses that very template as its critique
instruction, so the automated and manual critiques ask the same adversarial
question.

```bash
# Default roster: GPT-5.4 + Gemini-Pro (the pair Experiment A validated).
python -m ai_router.pull_critique docs/session-sets/<slug>

# Pin providers/models; --dry-run assembles + validates without writing.
python -m ai_router.pull_critique docs/session-sets/<slug> \
    --provider openai:gpt-5.4 --provider google --dry-run

# Default sandbox is the git repo root CONTAINING the session-set dir, so a
# critic can read changed source anywhere in the tree; override with --sandbox.
```

### Guarantees

- **Multi-provider at the source.** The producer **refuses to write a
  gate-failing artifact**: if fewer than two *distinct* providers return a
  usable verdict (a schema-valid critique from a run that actually probed),
  `ok` is False, nothing is written, and `reasons` names which providers were
  skipped (a raised binding error, a zero-probe run, or no verdict). A failing
  provider is skipped, never fatal to the others.
- **Identity-stamped.** The artifact self-declares `sessionSetName` (the set
  dir name) and the recorded `pathAwareCritique` level (or an explicit
  `--level`), so the close-out gate's identity check accepts it for *this* set
  under *this* policy.
- **Validated before write.** The assembled envelope is checked with the same
  `validate_path_aware_critique_artifact` the gate uses, so "the producer says
  ok" means "the gate will say ok".
- **L-064-3.** The artifact is written utf-8 to disk; never edited after
  written (verification-artifact discipline).

### Programmatic use

```python
from ai_router import produce_path_aware_critique

res = produce_path_aware_critique("docs/session-sets/<slug>")
if res.ok:
    print("wrote", res.written_to)
else:
    print("not produced:", res.reasons)
```

---

## What Set 068 added (shipped)

Set 067 left these to Set 068; they are now built:

- The disposable-worktree **`run_test`** execution cage
  (`ai_router/run_test_sandbox.py`) — the one tool needing a write cage — and
  the deterministic **contract-test / CDC gate** (`ai_router/contract_gate.py`,
  [`../../docs/contract-gate.md`](../../docs/contract-gate.md)), the floor for
  the ~95%-probeable defect bulk.
- **Experiment B** (the cadence study) ran, and the routed **keep / demote /
  retire** decision was made: **DEMOTE**. Per-session routed verification is no
  longer mandatory on every session — it is **gated** on a deterministic
  blast-radius / coupling predicate (`ai_router/routed_gate.py`). The end-of-set
  path-aware critique (this adapter) + the contract-test gate are now the primary
  verification surface. Full strategy:
  [`../../docs/verification-surface-strategy.md`](../../docs/verification-surface-strategy.md).

---

## What Set 069 S2 added (the execution-evidence lanes in the producer)

Set 068 shipped the `run_test` cage but only wired it into the *adapter*; the
**automated producer still drove its critics read-only**, which is the gap the
0.22.x release exposed (it missed two Major bugs the manual run reproduced by
executing code). Set 069 S2 closes that gap by giving the automated critic a
**constrained evidence-generation lane**, all additive — absent the new config a
critique is byte-for-byte the read-only Set 067/068 loop:

- **Trusted-command execution in `produce_path_aware_critique`.** Pass a
  `RunTestConfig` (the operator-authored command surface + pinned ref + caps) and
  each critic is offered the `run_test` tool: it may **trigger** an
  operator-authored command id in the disposable-worktree cage — **never author
  argv**, fresh checkout, hard caps. The CLI exposes this via `--run-test-cmd` /
  `--run-test-named NAME=CMD` + `--exec-ref` (a shell-style string is
  `shlex`-split into an argv; no shell is ever invoked).
- **`get_diff` (diff-awareness).** Pass a `DiffConfig` (operator-pinned ref
  range) and the critics get a read-only `get_diff` tool returning the **raw
  unified diff + changed-path list** — never a model-summarized symbol map.
  Dispatched to `git` directly (like `run_test`, outside the byte-equality guard:
  the orchestrator runs `git` itself, so there is no model-touchable servant to
  defend). CLI: `--diff-base` (+ optional `--diff-head`).
- **Evidence-tiered findings (the S1 protocol, wired).** Findings from a
  triggered run flow through `ai_router/evidence_protocol.py`: the agent may
  *propose* `evidenceTier` + `commandId` on a finding, but **the orchestrator
  applies the tag** — `REPRODUCED` is conferred only after the orchestrator
  **replays the named command on a second pristine checkout** and the replay's
  output hash matches (a re-runnable falsifier); a claim with no matching run, or
  a non-deterministic replay, **collapses to a read-claim** (the agent can never
  self-grant `REPRODUCED`). The transcript's entrypoint is always
  `test_entrypoint` (a trusted operator-authored command), so the meta-oracle
  rule holds by construction. A `REPRODUCED` entry carries its falsifier
  transcript into `path-aware-critique.json`, which the Set 066 validator
  (S1-extended) enforces.
- **Blast-radius-budgeted loop depth.** When an execution lane is active and no
  caps are pinned, the producer derives `PullCaps` from the set's blast radius
  (`budget_caps_for_paths` over the disposition's `files_changed`): a high-blast
  set gets the full configured budget, a low-blast set probes less — depth earned
  by blast radius, not a magic constant.

The Podman model-authored-probe lane (rung b) and the ceiling→floor ratchet
(rungs 5–6) are later sessions; S2 ships the trusted-command lanes only.
