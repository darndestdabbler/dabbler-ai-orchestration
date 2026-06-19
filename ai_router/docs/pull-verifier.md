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

---

## What Set 069 S3 added (the probe-template lane — "the missing middle")

S2 let a critic **trigger** a fixed operator-authored command. The next rung up
(proposal rung 4) is the **probe-template lane**: operator-authored, **versioned**
probe harnesses the critic invokes with **typed, validated args**. It is the
narrowest lane that finds *novel-but-local* edge cases (e.g. "feed malformed bytes
to this validator", "call this entrypoint with a bad parent dir") without
arbitrary code execution — the two 0.22.x bugs were exactly this shape. The
harness stays inside the trusted-command model (it runs in the same
disposable-worktree cage); the model supplies **only** typed inputs — never code,
never argv. All additive: absent a `ProbeTemplateConfig` the loop is byte-for-byte
the prior behavior.

- **Declarations + typed-arg validation** (`ai_router/probe_templates.py`). A
  `ProbeTemplate` is a versioned record naming the **real public entrypoint** it
  drives (`entrypoint_kind` is one of the meta-oracle `PUBLIC_ENTRYPOINT_KINDS`)
  and its typed `ArgSpec` inputs. `validate_template_args` enforces
  required-present / exact-type / enum-membership / no-unknown-keys and **never
  raises** — an invalid call returns to the model as a raw `ERROR:` it can correct.
- **The harness (the driver).** The per-template probe bodies run **inside the
  cage** as `python -m ai_router.probe_templates --run <id> <json-args>`; because
  the cage's cwd is the disposable checkout, the driver imports the code **under
  review** from that worktree and drives its public entrypoint, printing a single
  **deterministic** `PROBE_RESULT:` line (no addresses / temp paths) so a pristine
  replay reproduces the same `outputHash`. Exit `1` = reproduced the defect, `0` =
  the entrypoint was robust, `2` = a probe-internal error.
- **`run_probe_template` tool.** Pass a `ProbeTemplateConfig` (repo root + pinned
  ref + the template library + caps) and each critic is offered the
  `run_probe_template` tool (select a template id + supply its typed args).
  Dispatched to the cage like `run_test` (outside the byte-equality guard). A
  clean run is captured so a `REPRODUCED` claim can be replayed; the agent
  proposes `evidenceTier` + **`templateId`**, and the orchestrator confers
  `REPRODUCED` only after a matching pristine replay — emitting a `templateId`
  falsifier transcript (the Set 066 `EvidenceTranscript` `commandId` XOR
  `templateId`) whose entrypoint is the template's declared **public** surface.
  CLI: `--probe-templates` (+ `--exec-ref`).
- **The seed library** (`BUILTIN_PROBE_TEMPLATES`) — repo-authored, drives
  `ai_router`'s own public entrypoints; these are the templates that would have
  caught the two 0.22.x bug classes:
  - `malformed_artifact_bytes` → feeds malformed bytes (incl. invalid UTF-8) to
    `validate_path_aware_critique_artifact` and checks it does not crash. **This
    found a still-latent instance of the 0.22.x UnicodeError class**: four readers
    in `path_aware_critique.py` caught only `(OSError, json.JSONDecodeError)` and
    crashed on invalid UTF-8 — fixed in S3 by adding `UnicodeError` (the same fix
    Set 068 applied to `contract_gate`).
  - `bad_parent_dir` → calls `run_test_in_cage` with a bad `worktrees_parent` and
    checks it returns a clean error rather than letting `mkdtemp`'s `OSError`
    escape (the run_test mkdtemp-escaped-try/finally class).

The *mechanism* is repo-portable; the *seed library* is repo-authored (a consumer
repo writes its own templates against its own public entrypoints). The
ceiling→floor ratchet (rungs 5–6) remains a later session.

## What Set 069 S4 added (the Podman model-authored-probe lane — rung b)

Rungs 1–4 never run **model-authored** code: a critic may only *trigger* an
operator-authored `run_test` command, read `get_diff`, or *parameterize* an
operator-authored probe template. Rung (b) is the one lane where the model
**authors the probe body** — so it runs **only inside a real Podman container**
(the container is the security boundary, **not** the floor). It graduated into
`ai_router/` only after the **GREEN** Podman feasibility spike
(`docs/proposals/2026-06-16-pull-architecture-capabilities/podman-spike/`, 6/6
acceptance criteria, podman 4.9.3).

- **The cage** (`ai_router/podman_sandbox.py`) — `run_test_sandbox`'s sibling,
  isolation by `podman run` instead of `git worktree add`. Containment:
  `--network=none`, `--read-only` rootfs, the repo bind-mounted **read-only** at
  `/repo`, a **tmpfs** `/scratch` (the only writable place), `--cap-drop=ALL`,
  `--security-opt=no-new-privileges`, `--rm`, and a hard wall-clock timeout with
  **crash-safe teardown** (the timed-out container is force-removed by name). The
  image is operator-authored and no-secrets (`ai_router/podman/Containerfile`).
  The **checked-in** image uses a tag base (dev/CI); production **must**
  digest-pin both the base (`FROM python@sha256:...`) and the runtime ref
  (`name@sha256:...`) — an operator/arch deploy step deliberately not hard-coded
  in the portable template. `image_is_digest_pinned()` is the runtime enforcement
  seam: the lane prepends a `NOTE:` to its tool result whenever it runs an
  un-pinned image, so an un-pinned production run is visible, never silent. The
  model authors only the probe **body** (`build_probe_argv` wraps it as `python -B
  -c <body>` with `PYTHONPATH=/repo` — `-I`/`-E` are deliberately NOT used, they
  would drop `PYTHONPATH`); it never authors a `podman` flag.
- **The three spike findings, carried into production:**
  1. **Rootless cgroups-v1 ignores `--memory`/`--pids-limit`/`--cpus`.**
     `cgroup_caps_enforceable()` detects the cgroup version and emits the
     resource-cap flags **only on cgroup v2** (where they are honored), so a v1
     host leans on the wall-clock cap (the effective bound) instead of being
     polluted by the ignore-warning. Restoring the caps is an environment change
     (enable cgroup v2 + delegation), then they are used automatically.
  2. **Timeout teardown is ~10 s in rootless WSL** (vs ~1.5 s steady-state), so
     `wall_seconds` defaults conservative and `PodmanResult.wall_seconds` reports
     the cost.
  3. **Probe output is separated from podman runtime warnings:** stdout
     (`probe_output`, the bytes hashed for the re-runnability check) vs stderr
     (`runtime_diagnostics`, never hashed), so a runtime warning cannot perturb
     the replay match.
- **`run_authored_probe` tool.** Pass a `PodmanLaneConfig` (repo root + image +
  caps + a triage hook) to `pull_route()` (or `--podman-lane` [+ `--podman-image`]
  on the producer CLI). The model supplies `probe` (the Python body), the
  `entrypointRef`/`entrypointKind` of the **real public entrypoint** it drives
  (meta-oracle), and the `claim` (the critical/major issue — severity-gating).
- **Autonomous + severity-gated.** No human approval for (b) itself (the
  container is the boundary); the tool is documented for use **only** on a
  critical/major issue unconfirmable by reading / `run_test` / `run_probe_template`.
- **The AI safety check is triage-only** (`default_triage`): it may **reject /
  escalate**, **never approve** (the container makes approval unnecessary). The
  default heuristic rejects an empty probe, a missing `claim`, or a probe that
  never references the code under review (meta-oracle), and **escalates** a probe
  that reaches for the network / a subprocess (a rung-(c) escape, human-gated). It
  is metered-free; a deployment may swap in a routed AI triage with the same
  contract.
- **A model-authored probe can NEVER mint `REPRODUCED`.** `validate_transcript`
  requires a **trusted** `commandId` XOR `templateId` (never model-authored argv),
  so `_build_transcript` returns `None` for an authored execution and the
  orchestrator **caps an authored-probe-backed finding at `HYPOTHESIS`** — a
  flagged, container-backed suspicion a human verifies. Promotion to the floor is
  the **S5 human-gated ratchet** (graduate a good autonomous probe into a trusted
  template, which can then mint `REPRODUCED`). This keeps the human as the
  meta-oracle defense (a deliberate S4 non-goal to retire it).
- **Disk hygiene is a hard requirement** (the Docker bloat failure mode):
  `--rm` containers, tmpfs scratch (no named volumes), one image reused across all
  probes (never rebuilt per probe). Every container carries a lane **label**
  (`pull-probe-lane`); `podman_footprint()` filters by it so the check is
  **lane-local on a shared host** (a co-tenant's containers/volumes are never
  miscounted), and the S4 regression asserts **0 leftover labeled containers + 0
  labeled volumes + the reused image still present** after N probes.

The lane is **additive**: absent a `PodmanLaneConfig` the offered tools + verdict
schema are byte-for-byte the prior behavior. The cage-mechanics regressions
(`--network=none`, read-only mount, teardown, disk footprint) require a real
podman + a built image, so they run on Linux CI / WSL and **skip on the Windows
host** (where podman lives in WSL2); the lane-wiring + evidence-tiering tests fake
the cage and run everywhere.

## What Set 069 S5 added (the ceiling→floor ratchet + the measured replacement gate — rungs 5–6)

S1–S4 let a critic produce **execution-backed evidence**; S5 is how that evidence
**pays rent into the deterministic floor** and how the automated process is
**measured** against the manual run rather than assumed equal to it. Both modules
are net-new pure-Python libraries imported by no existing runtime path — zero
behavioral change to any existing flow.

- **The quality-gated ratchet** (`ai_router/floor_ratchet.py`). A reproduced
  probeable defect (a `REPRODUCED` finding from the S1 protocol) yields a
  **candidate falsifier artifact** (`candidate-falsifiers.json`) that is **NEVER
  auto-merged**: `build_candidate_from_finding` always emits
  `humanSignoff={status: "pending"}` (only a human writes `"approved"`) and
  extracts the trusted falsifier (`commandId` XOR `templateId` + args, pinned ref,
  public entrypoint) **from the reproduced transcript**, so the promoted falsifier
  *is* the reproduced probe, not an agent re-authoring. `admission_decision` runs
  five mechanical gates — **fails-on-old** (failed on a named ref), **passes-on-fixed**
  (passed on a *different* ref — a real differential), **drives-a-public-contract**
  (a `PUBLIC_ENTRYPOINT_KINDS` entrypoint AND `contractKind == "public_contract"`,
  so an incidental string/timing is rejected even with a public entrypoint),
  **flake-check** (`runs >= min` AND stable AND a strict agreeing majority),
  **has-owner** — and admits to the floor **only when all five pass AND
  `humanSignoff.status == "approved"`**. A **rubber-stamp guard** returns REJECTED
  when a human approved but a mechanical gate fails — a human approval can never
  override a failing gate, so a brittle agent-authored test cannot poison the
  deterministic floor. `check_floor_ratchet_coverage` enforces the **mandatory**
  rule (every `REPRODUCED` finding in a `path-aware-critique.json` needs a
  candidate that is admitted / pending / waived; a PENDING candidate satisfies it
  so the gate never blocks on human-review latency; a REJECTED one does not).
  This is also how a good autonomous Podman-lane (`HYPOTHESIS`) probe is
  **graduated** into a trusted template that can *then* mint `REPRODUCED`.
- **The measured replacement gate** (`ai_router/replacement_gate.py`). A
  **pre-registered** benchmark (`benchmark-registration.json`: seeded classes +
  `>= 1` holdout = a recent real miss, e.g. the two 0.22.0 Major bugs; thresholds
  committed before scoring; `minCasesForPower`) + a **raw** scoreboard
  (`replacement-scoreboard.json`: per-case detected / replayed / false-`REPRODUCED`
  + the gated-surface **telemetry** the Set 068 DEMOTE said RETIRE reopens on —
  escaped-defect rate, intro-stage-vs-end-of-set timing, rework saved,
  false-positive churn, predicate-should-have-fired misses). `score_benchmark`
  **derives** recall / precision / replay-success / false-`REPRODUCED` — the
  verdict is derived, **never hand-asserted** (the closed top-level schema rejects
  a smuggled `verdict`/`meets`/`cadence` field). Honesty rules: underpowered
  (`real_cases < minCasesForPower`) **forces** `meets_thresholds = False`;
  zero-denominator metrics are `None` (never coerced 0/1) and a `None` never
  satisfies a threshold; a `caseId` not in the pre-registration is rejected. **The
  manual run is never retired** — the strongest cadence recommendation the gate can
  emit is *reduce manual to a periodic backstop* (the human stays the meta-oracle
  defense).

Schemas: `docs/candidate-falsifier.schema.json`,
`docs/benchmark-registration.schema.json`,
`docs/replacement-scoreboard.schema.json` (+ example fixtures + pure-Python
validators with L-066-1 parity). CLIs:
`python -m ai_router.floor_ratchet --session-set-dir <dir>` and
`python -m ai_router.replacement_gate --session-set-dir <dir>`.

> **Strategy context.** How these layers fit the settled verification surface —
> floor / ceiling / gated-routed, and how Set 069 made the ceiling *executable* —
> is in [`../../docs/verification-surface-strategy.md`](../../docs/verification-surface-strategy.md)
> § *Set 069 — the execution-backed evidence layer*.

## What Set 070 added (the dual-surface mode + the steelman-push upgrade)

Set 069 made the *pull* ceiling executable; Set 070 (`ai_router` **0.24.0**) gives
the *push* surface a **fair shake** before any RETIRE decision and builds the
head-to-head instrument that turns keep/demote/retire from faith into measurement.
Two gaps the Set 065→069 program left: production push shipped at **weak** framing
(weaker than the moderate Experiment A instrument that demoted it, and weaker than
adversarial pull), so push had **never been measured at its strong best**; and
nothing ran **both** surfaces head-to-head and recorded which surface uniquely
caught which high-severity defect — the exact telemetry the strategy §5 RETIRE
criterion needs. Full rationale and the L-069-2 directive:
[`../../docs/verification-surface-strategy.md`](../../docs/verification-surface-strategy.md)
§ 5.1–5.2.

- **Steelman push (S1).** `prompt-templates/verification.md` upgraded to the
  devil's-advocate framing pull already uses, **preserving** the machine contract
  (`build_verification_prompt` placeholders + the `VERIFIED` / `ISSUES FOUND` /
  `Issue N:` / Category / Severity grammar `parse_verification_response` reads). A
  framing-pin regression (`test_verification_framing.py`) catches a silent
  weakening. The standing gated per-session push now runs at its strongest form.
- **`dual_surface_verify.run_dual_surface` (S1).** Runs the **push** arm (snippet-fed
  `route`/`call_model` over the committed diff, repo-blind) and the **pull** arm
  (`pull_route` repo-reading agentic loop, the same adapter this doc describes) over
  the **same committed state**, with **provider, model, and framing held equal across
  arms**. Equality is **measured** from each arm's actually-reported identity
  (`UnequalArmsError` if they diverge), not assumed; framing is classified from each
  template's **single-source body** (`classify_framing_strength` over the unfilled
  template, with the pull instruction rendered from that same body via a new
  `template_text` seam in `pull_critique.py`), so interpolation cannot spoof markers
  and classify-vs-execute cannot drift. Both arms are injectable, so unit tests run
  hermetically with no metered call. **S1 ships the two-arm runner only — no merge.**
- **The provenance merge + comparison artifact (S2).** `merge_findings` labels each
  finding `push-only` / `pull-only` / `both` — `both` **only** when both arms share a
  non-empty explicit `defectKey`, **never** on free-text wording (Set 069 S6:
  description ≠ identity). The **safe direction** is enforced: an unkeyed defect both
  arms caught splits into two single-surface entries (conservative — it never *hides*
  a push-unique catch, which would bias RETIRE toward retiring push), and the result
  flags `provenanceComplete=false` + per-surface unkeyed counts.
  `build_comparison_artifact` / `validate_comparison_artifact` write + check
  `dual-surface-comparison.json`
  ([`../../docs/dual-surface-comparison.schema.json`](../../docs/dual-surface-comparison.schema.json));
  the pure-Python validator holds **L-066-1 parity** (closed key sets, int-not-bool
  guards, typed optionals) plus the cross-field provenance invariants the schema
  cannot express.
- **The fair-shake scoring (S2).** `score_comparison` derives the
  push-unique / pull-unique / shared **high-severity** tally (an *upper bound* when
  provenance is incomplete). `score_against_benchmark` scores it over the Set 069
  pre-registered seeded + holdout benchmark (ground truth = `defectKey` is a
  registered case); **underpowered → `INCONCLUSIVE`** even when `push_unique > 0`,
  unkeyed high-severity excluded, and **push is never retired here** (the verdict is a
  recommendation toward the operator-confirmed decision).
  `aggregate_retire_telemetry` **refuses to pool** `sampled` with `opt-in` runs.
- **The recorded mode + CLI (S2).** `dualSurfaceMode` (`off` / `sampled` / `opt-in`)
  is recorded **once at set start and immutable** in `activity-log.json` (a distinct
  entry kind). `should_run_dual_surface` takes an **injected** draw (hermetic):
  `off` never runs, `opt-in` only on explicit request, `sampled` fires below the
  sample rate (tagged `sampled`); a deliberate opt-in under sampled mode is the
  operational `opt-in` tag (never folded into unbiased telemetry). All readers
  (`read_` / `has_` / `dual_surface_mode_record_unreadable`) **never raise** on a
  corrupt or malformed log. CLI:
  `python -m ai_router.dual_surface_verify record-mode | read-mode | score`.

The **dual-surface mode** is **additive**: absent a recorded `dualSurfaceMode`
(default `off`) and the opt-in run, `route`, `pull_route`, and
`produce_path_aware_critique` are byte-for-byte unchanged. (The standing per-session
push verifier is the one intended behavioral change in the set: `verification.md` now
runs at strong adversarial framing — the steelman-push deliverable, by design.)
As-built telemetry status (built + dogfooded over this set's own diff, but no powered
benchmark datapoint yet) is in the strategy doc § 5.2.

## What Set 071 added (the materiality gate + the nitpick-churn loop discipline)

Set 070 gave both reviewer templates their strongest devil's-advocate framing; the
field test confirmed it works **and** surfaced the predicted cost — strong framing
with **no materiality bar** manufactures Minor / false-positive findings and the
re-verify loop churns rounds on them (the canonical case: three rounds on `pytest`
vs `python -m pytest -v`). Set 071 (`ai_router` **0.25.0**) adds the calibration
layer — **additively, never a framing weakening** (L-069-2). Strategy synthesis:
[`../../docs/verification-surface-strategy.md`](../../docs/verification-surface-strategy.md)
§ 7.

- **Materiality "so what?" gate in `path-aware-critique.md` (and `verification.md`),
  S1.** A blocking finding must state the **exact requirement/claim violated**, the
  **concrete impact**, and the **evidence**; if it cannot produce all three it is a
  nit, not a blocker. The **anti-nitpick clause** names semantic-equivalence-not-
  textual-identity (the `pytest` case is the worked example) and that manufacturing a
  Minor to dodge a rubber-stamp is itself a false-positive failure. The **severity
  anchor** (Major = *would change a reasonable reviewer's merge decision*) +
  **plausible-path-to-harm** escalation keep it honest. A non-blocking **`NITS`**
  subsection holds true-but-immaterial observations. The pull template keeps its
  `VERDICT: VERIFIED | ISSUES_FOUND` + per-finding Severity/Category/Location
  grammar; `classify_framing_strength` still returns `ADVERSARIAL` for it (additive
  proof — the dual-surface equal-framing gate is undisturbed).
- **The severity-anchored blocking classifier (`verification.py`), S2.**
  `is_blocking_verdict(verdict, issues)` / `classify_blocking(...)` derive blocking
  from the **severity of the findings given, not the bare verdict token**: a list with
  ≥1 Critical/Major (or any unknown/missing-severity) finding blocks regardless of the
  token passed alongside it; Minor-only is recorded but non-blocking. It is
  **surface-agnostic** — the **pull** surface feeds it via `pull_verifier.Finding`
  (whose `severity` is parsed structurally from `submit_verdict`, never by re-parsing
  prose), so the anti-laundering net is always live on the pull surface; the **push**
  parser `parse_verification_response` instead **trusts a `VERIFIED` token and returns
  no findings** (operator-adjudicated in S2 — it does not re-mine clean prose for a
  hidden Major, which would reintroduce churn), so on push the net bites on the
  `ISSUES_FOUND` path. The **same** classifier governs both loops. `parse_nits` reads
  the `NITS` section for observability only (nits never enter the findings list).
- **The re-verify loop discipline (workflow Step 6), S2.** Minor-only opens no
  remediation round; a round continues only on new/unresolved Critical/Major; a
  cross-round **issue ledger** (`reconcile_issue_ledger`) refuses to resurrect a
  settled point under fresh wording (keyed on a stable `issueId`). The 1–2-automatic
  / 3+-human bound is unchanged.

The materiality layer is **additive**: a path-aware critique still produces the same
`path-aware-critique.json` artifact and severity-bearing findings; what changes is
that the verifier no longer manufactures immaterial blockers, and the loop that
consumes its findings no longer churns on Minor-only rounds.

## What Set 072 added (the provider×surface matrix + the verification-only application mode)

Set 070's `dual_surface_verify.run_dual_surface` (above) **holds provider equal across
arms** to isolate *surface*. An operator field study
(`../../docs/study-findings.md`-style — see
[`../../docs/verification-surface-strategy.md`](../../docs/verification-surface-strategy.md)
§ 8) found that design's blind spot: **provider and surface interact**, and our live
default pairing (`push = gpt-5-4` / `pull = gemini-2.5-pro`) is the study's *single weakest
pull configuration*. Set 072 (`ai_router` **0.26.0**) adds the instrument that can measure
that interaction — without weakening the equal-arms steelman default.

- **Matrix-mode seam in `run_dual_surface` (S1).** Optional per-arm `push_provider` /
  `pull_provider` / `push_model` / `pull_model`. Any one set turns on `matrix_mode`: each
  arm resolves independently, the **strong adversarial framing gate stays on both arms**
  (L-069-2), and only the provider/model **equality refusal** is skipped (divergence
  recorded as `intentionalDivergence`, `mode: "matrix"`). No per-arm params → the
  equal-arms default is byte-for-byte unchanged and still raises `UnequalArmsError`.
  `_arms_held_equal` is **strengthened** to reject a matrix artifact as RETIRE evidence
  (the equal-arms mode stays the only RETIRE-telemetry surface).
- **`ai_router/verification_only_app.py` — the verification-only application mode
  (S2).** A thin orchestration over `run_dual_surface` (matrix), pointable at an
  **external** built target via the runner's `sandbox_dir` seam.
  `run_verification_matrix` runs one matrix-mode call per `MatrixCell` (push×pull
  cross-product; a failing cell → `SkippedCell`, never aborting the matrix — L-067-1) and
  writes **two outputs of one run**: `verification-matrix-report.json` (per-cell,
  experimental, with `CellTelemetry` stamping every confound — orchestrator/push/pull
  provider+model, per-arm framing, surfaces, diff size/shape, `push_broker`/`pull_broker`)
  and the consolidated fixer-facing `remediation-report.{json,md}`
  (`build_remediation_report` merges cell findings via Set 070 `merge_findings`
  provenance, dedups + severity-ranks; the artifact the target remediates from **without
  re-running verification**). Both validators (`validate_matrix_report`,
  `validate_remediation_report`) hold L-066-1 parity.
- **The cross-run aggregator (S3).** `aggregate_remediation_reports` rolls N per-run
  reports over **one** target (`MixedTargetError` guard) into
  `remediation-backlog.{json,md}`, re-running `merge_findings` keyed by stable `defectKey`
  (max severity) and annotating each finding with **corroboration = distinct-run count** —
  cross-config agreement as a confidence/priority signal (unkeyed findings never
  corroborate). `validate_remediation_backlog` holds L-066-1 parity.
- **CLI.** `python -m ai_router.verification_only_app run --target … --base … --cell
  push:anthropic --cell pull:google` (writes both reports) and `… aggregate --report
  a.json --report b.json` (writes the backlog). ASCII-only; returns int. Commentary-only
  `verification_only:` block under `pull_verifier:` in `router-config.yaml` documents the
  best-guess defaults — **no behavioral knob; the live default pull provider is
  unchanged**.
- **L-069-1 sibling-reader hardening (S1).** The non-list-`entries` guard now lands at all
  four sibling readers (`read_path_aware_critique` / `has_path_aware_critique_record` in
  `path_aware_critique.py`; `read_verification_mode` / `has_verification_mode_record` in
  `dedicated_verification.py`), with `UnicodeError` added to the two
  `dedicated_verification.py` readers — closing the malformed-activity-log close-out crash
  class across every reader.

The matrix mode is **additive**: absent per-arm params, `run_dual_surface` is unchanged;
absent a call to `verification_only_app`, nothing in the normal flow runs a matrix. The
**consumer-handoff model** — canonical runs the verification and emits the remediation
report; the target remediates from it and never re-runs verification — is recorded in the
strategy doc § 8.4.
