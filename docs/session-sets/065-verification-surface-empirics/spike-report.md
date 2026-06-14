# Integration-Surface Spike — SDK vs CLI vs First-Party Adapter

> **Set 065, Session 2.** Empirically determine whether "path-aware critique
> can be a routed call," and which integration surface + billing model to
> recommend. Hands-on spike (2026-06-14) on this Windows host; raw traces:
> `copilot-trace-sample.jsonl`, `first-party-trace-sample.json`; spike harness:
> `spike_first_party_adapter.py`. Builds on S1's finding that path-awareness is
> a **tool loop with no proprietary algorithm** and **~92% of catches are
> probeable** (`bake-off-results.md`).

## TL;DR — GO

Path-aware critique can be a routed call. **Two** surfaces were proven headless
here, each independently catching **both** S1 catch-classes (probeable +
novel-reasoning) with **empirically-confirmed tool use** (not just afforded
capability), with **repeat-stable verdicts** over 3 repeats (outcomes stable;
tool counts and severity labels varied slightly run-to-run):

| Surface | Billing observed | Both bugs caught | Tool calls (probes run) | Cost / run | Wall |
|---|---|---|---|---|---|
| **GitHub Copilot CLI** (`copilot -p`) | **subscription** (1 premium req/run) | 3/3 | 5–6 (4 file reads) | $0 marginal | ~18–27 s |
| **First-party tool-loop adapter** (Anthropic API via httpx) | **metered BYOK** | 3/3 (+1 bonus find) | 4 (4 file reads) | **~$0.024** | ~17–22 s |

**Recommendation:** build the **first-party tool-loop adapter** as the primary
path, with the **Copilot CLI as a zero-marginal-cost subscription alternative**
for operators who have a Copilot seat. Rationale below; both pass the rubric,
they trade differently on dependency footprint vs. tuning burden.

## What's actually available on this host (survey, step 1)

| Surface | Present? | Headless / non-interactive | Notes |
|---|---|---|---|
| **GitHub Copilot CLI** 1.0.51 | ✅ | ✅ `-p --allow-all-tools --output-format json` | Team standard. Authed via subscription (credential store). |
| **`claude -p` CLI** 2.1.63 | ✅ | ⚠️ **refuses to nest** inside a Claude Code session ("cannot be launched inside another Claude Code session… will crash all active sessions"); bypass needs unsetting `CLAUDECODE` | A real headless-reliability finding: the Claude harness actively blocks subprocess nesting; Copilot does not. |
| **Claude Agent SDK** (Python) | installable | n/a (would nest as above) | `pip install` pulls **20 transitive deps** (mcp, pydantic, cryptography, uvicorn, starlette, pywin32…) **and** wraps the Node `claude` CLI. First-hand grounding: this orchestrator runs inside it. |
| **Codex CLI / SDK** | ❌ not on PATH | — | Could not prove here. |
| **Gemini CLI** | ❌ not on PATH | — | Could not prove here. |
| **First-party adapter** | built here (`spike_first_party_adapter.py`) | ✅ | ~150 LOC, **httpx-only** (already a router dep). |

### Per-surface characterization (the axes the spec asked for)

**GitHub Copilot CLI** (`copilot -p`)
- **Path-awareness level:** rung-1 tool loop ✅ (`view`, grep, shell); rung-3
  execution ✅ (`--allow-all-tools` can run tests/commands); rung-2 semantic
  `@workspace` indexing **not exercised** — for local critique it used literal
  `view` file reads (+ a bundled GitHub MCP server, irrelevant to a local
  critique). So the empirically-used rung was 1, not 2.
- **Auth & billing:** OAuth device-flow → credential store (**subscription**),
  *or* headless token (`COPILOT_GITHUB_TOKEN` / `GH_TOKEN` / `GITHUB_TOKEN`,
  documented for automation), *or* BYOK custom providers (**metered**). Observed
  here: subscription — `result.usage.premiumRequests: 1` per run, no metered $.
  This confirms S1's "**SDK/CLI ⇒ metered** is false" point: billing is a
  per-call choice, so it is **not** the decisive axis.
- **Harness vs. model:** one harness, default model `claude-sonnet-4.6`.
  **Caveat (go/no-go-relevant):** every other model tried (`gpt-5`, `gpt-5.2`,
  `claude-opus-4.1`, `gemini-2.5-pro`) returned *"Model … is not available"* on
  **this** subscription. The "one harness drives GPT∪Claude∪Gemini" property is
  a product capability but was **not reproducible on this account** — cross-
  provider diversity through Copilot is **plan-gated**, and on the seat tested
  it collapses to Claude-only. That matters because S1's headline config is
  **path-aware AND multi-provider**; a Claude-only Copilot seat delivers the
  first half, not the second.
- **Python availability:** none (external process; drive via `subprocess`).
- **Structured output:** no native schema-forcing flag found; prompt-instructed
  final-line JSON parsed cleanly 3/3. `--output-format json` gives a rich JSONL
  event stream (`tool.execution_start/complete` with `toolName` + `arguments`,
  `assistant.message.toolRequests`, `result.usage`) — **excellent built-in
  tool-call instrumentation**.
- **Dependency footprint:** Node-based global install (winget/npm); bundles a
  GitHub MCP server. Zero Python deps; heavy external runtime.

**First-party tool-loop adapter** (`spike_first_party_adapter.py`)
- **Path-awareness level:** rung-1 tool loop ✅ (`read_file`, `grep`,
  `list_dir`); rung-2 indexing **none** (literal file/grep only — which S1 says
  covers ~92%); rung-3 execution **not built** here (would add a sandboxed
  `run_test` in a disposable worktree per the spec's guardrail).
- **Auth & billing:** **metered BYOK** (`ANTHROPIC_API_KEY`). Observed
  **~$0.024/run** (2,755 in / ~1,000 out tokens @ Sonnet $3/$15).
- **Harness vs. model:** *we* are the harness — cross-provider routing is under
  our control via `route()`. **This spike exercised only Anthropic** (`tool_use`);
  OpenAI `tool_calls` / Gemini function-calling are the analogous bindings but
  were **not run here**. So this is the surface that best *preserves* S1's
  **multi-provider** requirement under our control — architecturally enabled,
  not yet empirically demonstrated cross-provider.
- **Deterministic-servant guardrail (the anti-bias property):** implemented —
  the servant returns **raw ground truth** (file bytes / grep lines / dir
  listing), never a model-summarized view, so the biased context-assembler that
  path-awareness exists to remove (the C9/C3 mechanism) cannot creep back in.
  This property is *ours to keep* only on the first-party path.
- **Python availability:** native. **Structured output:** prompt-forced here;
  hardenable to a forced `tool`-call verdict against the `sN-issues.json` schema.
- **Dependency footprint:** **httpx only** (already present) + ~150 LOC.

## Capability proof (steps 2 & 4) — parity per catch-class

The fixture (`/c/temp/s2-spike/fixture`, 4 files) seeds one defect of each S1
class, and the prompt **pastes no file contents** — the agent must use tools to
read them, which is how path-awareness gets *measured*, not assumed:

- **Probeable (C9-analog):** `build_unresolved_index` walks only `body_refs`, so
  the unresolved header ref `CurrencyTable` is silently dropped; `index.json`
  claims to be the complete superset but lists only `RoundingPolicy`. Catch =
  read + count across files (rung-1).
- **Novel-reasoning:** `resolve_chain` does `depth < config["max_depth"]` while
  `config.py` defaults `max_depth=None` ("unbounded" per design notes) → a
  latent `TypeError` on the documented-default path that the current `__main__`
  never exercises. Catch = cross-file semantic reasoning, not a count.

| | Probeable (C9-analog) | Novel-reasoning (max_depth/None) | Verdict format |
|---|---|---|---|
| Copilot CLI | **3/3** Critical | **3/3** Major | clean final-line JSON 3/3 |
| First-party adapter | **3/3** Critical | **3/3** Critical/Major | clean final-line JSON 3/3 |

Both surfaces hit **both** classes every run. The first-party adapter even
surfaced a **bonus** real finding (run 2: the recursion guard returns before any
recursion — dead code), evidence the loop reasons rather than pattern-matches.

**Stated limitation on rung-2.** The novel probe tests cross-*file* reasoning
but the repo is 4 files, so the agent never had to *find* the relevant files —
exactly the job rung-2 semantic indexing exists for. So this spike shows rung-1
is **sufficient for both catch-classes at small scale**; it does **not** prove
rung-2 is unnecessary on a large unfamiliar repo. That question belongs to the
S1 forward A/B (it needs a big-repo novel probe). Honest read: rung-2 is the
~8% insurance, unmeasured here.

## Instrumentation (step 3) — probes *run*, not just afforded

Per S1's signature: an agent that makes **zero** tool calls is not path-aware in
practice. Measured tool calls per run:
- **Copilot:** 5–6 (`report_intent` + dir-list + **4 file reads**:
  data.json, resolver.py, index.json, config.py) — from the JSONL trace.
- **First-party:** **4 `read_file`** (all four files) — counted by construction.

Both **actually retrieved ground truth before concluding**. Repeat-stability
over 3 runs: **identical verdict every run**, with small behavioral variance
(Copilot tool counts 6/6/5; first-party novel-bug severity labeled Critical or
Major across runs) — stable outcomes, not bit-for-bit determinism.

## Sandbox / safety posture (step 5)

- **First-party adapter:** read/grep/list are path-confined to the sandbox dir
  (`_safe()` rejects path escapes) and are inherently low-risk. The spec's
  guardrail — **only `run_test` needs the cage** (a disposable git worktree) —
  holds: this spike did not build execution, so no cage was required. A
  production version adds `run_test` in a throwaway worktree.
- **Copilot CLI:** `--allow-all-tools` is required for non-interactive use;
  treat that mode as **permissive unless explicitly constrained**. For verifier
  use, restrict with `--available-tools` (read/grep only) and run against a
  **read-only / disposable checkout**. (Exact default-granted tool set on this
  version was not separately captured; the operational rule — constrain it — holds
  regardless.) A real configuration burden, not a blocker.

## Decision matrix (scored against the complexity/quality rubric)

Rubric (from S1/spec): prefer **deterministic + out-of-band + minimal-deps +
controllable-anti-bias + net-neutral-or-negative overhead**; overhead *location*
beats magnitude.

| Axis | Copilot CLI | First-party adapter | Claude Agent SDK (vendor) |
|---|---|---|---|
| Proven here | ✅ headless, 3/3 | ✅ headless, 3/3 | ❌ (nests; not run) |
| Billing | subscription (or BYOK) — $0 marginal on a seat | metered ~$0.024/run | metered |
| Multi-provider (S1's headline need) | **plan-gated; Claude-only here** | architecturally via `route()`, our control (only Anthropic *run* here) | single-vendor (Anthropic) |
| Path-awareness used | rung-1 (rung-2/3 available) | rung-1 (rung-2 none, rung-3 addable) | rung-1–3 (full harness) |
| Anti-bias servant under our control | ❌ vendor-controlled | ✅ **ours** | ❌ vendor-controlled |
| Tool-call instrumentation | ✅ rich JSONL built-in | ✅ by construction | SDK message stream |
| Dependency footprint | Node runtime + MCP (no Python) | **httpx only** (+150 LOC) | **20 Python deps + Node CLI** |
| Structured verdict | prompt-forced (clean) | prompt-forced; hardenable to schema tool | SDK typed I/O |
| Sandbox default | permissive (`--allow-all-tools`) | read-only by construction | harness-managed |
| Python-native | ❌ subprocess | ✅ | ✅ |

## Go / No-Go

**GO — path-aware critique can be a routed call.** Both proven surfaces clear the
bar. Recommended integration surface and billing model:

1. **Primary: first-party tool-loop adapter, metered BYOK via `route()`.**
   It is the only surface that simultaneously offers (a) the best preservation of
   S1's required **multi-provider** diversity *under our control* (architecturally,
   via `route()` — this spike exercised only Anthropic; other providers' bindings
   are not yet run), (b) the **deterministic-servant anti-bias property under our
   control** (the very mechanism the C9/C3
   catches depend on), (c) a **minimal dependency footprint** (httpx + ~150
   LOC vs. the vendor SDK's 20 deps + Node CLI), and (d) full instrumentation.
   Cost is trivial (~$0.024/critique at Sonnet; S1's 92%-probeable finding means
   most value needs only the cheap rung-1 toolset). This is the rubric winner:
   overhead is small, out-of-band, deterministic, and ours to control.

2. **Alternative: GitHub Copilot CLI, subscription billing**, for operators who
   already hold a Copilot seat and want **$0 marginal cost**. Caveats to accept:
   the verifier model is **whatever the seat exposes** (Claude-only on the seat
   tested — so pair it with a *second* provider from another surface to satisfy
   S1's multi-provider config), the anti-bias servant is vendor-controlled, and
   the sandbox must be tightened (`--available-tools` + read-only checkout).

**No-go on:** a full provider × surface matrix (rubric says axes + one proven
pair, done); shipping any adapter this session (Non-goal); and treating Copilot's
"one harness, all providers" as available — it is **plan-gated** and was not
reproducible here.

### Cost / latency envelope (observed)
- First-party (Sonnet, rung-1): **~$0.024 / critique**, ~17–22 s (~3.8k tokens
  on run 1: 2,755 in / 1,067 out; runs 2–3 similar cost).
- Copilot (subscription): **1 premium request / critique**, ~18–27 s.
- Both scale linearly with repo size via more tool calls; a large repo would
  raise both cost and the case for rung-2 indexing (the unmeasured ~8%).

## Feeds the S1 forward A/B

This spike supplies the A/B's **execution vehicle**: the first-party adapter is
the path-aware arm (B1/B2) — it gives K-repeat non-determinism sampling, the
tool-call instrumentation, and per-provider control the design requires; routed
arms (A1/A2) stay on `route()`. The rung-2 question (large-repo novel probe) is
flagged for the A/B, not settled here.
