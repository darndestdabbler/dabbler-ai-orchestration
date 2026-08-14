## [Unreleased] — the pin comes out, and the lever that was never written down (Set 131)

### Changed

- **(Set 131 S1) `routing.outsourcing_mode` restored to `whenever-helpful`.**
  It was pinned to `verification-only` on 2026-08-05 as a **temporary**
  operator policy whose own comment named Set 111 as the owner of its
  removal. Set 111 shipped the decision-rights rubric and never lifted it, so
  a three-set window became twenty sets of de-facto permanent policy. A
  temporary narrowing should name the set that owns its removal; this was the
  set that owned that line.

- **(Set 131 S1) `delegation.always_route_task_types` regained `code-review`
  and `security-review`, and became a floor.** The list is now exactly the
  work whose *value is* an independent perspective — the tasks where the
  orchestrator doing them does not save money but destroys the thing being
  bought. `load_config()` unions `config.INDEPENDENCE_REQUIRED_TASK_TYPES` in
  regardless of what the file says, so an economic edit cannot delete a
  requirement precedence rule 2 imposes. It is not a list of expensive tasks,
  and it is deliberately no longer than three entries.

- **(Set 131 S1) Delegation Discipline is a precedence order, not a pair of
  lists.** `docs/ai-led-session-workflow.md` now evaluates: **authority veto**
  (the decision-rights rubric and the verification-reduction carve-out, with
  cost not an input) → **independence requirement** → **risk gate** →
  **context footprint** → **model choice, last**. A later rule may never
  override an earlier one, so no economic rule can move a decision from human
  authority to AI authority.

  The risk gate is the operator's gate made precise: work is outsourceable
  when its failure mode is caught by an oracle **already independent of the
  producer**. Tests authored by the same delegate are not one. Stateful
  judgment — work whose correctness depends on what this session already
  tried and rejected — is the standing exception.

- **(Set 131 S2) `ModelEntry.premium_request_weight` renamed to
  `probe_premium_requests`; catalog lockfile schema v1 → v2.** The name
  asserted a rate; the value is the premium-request count the CLI reported
  for the **one short probe call** that confirmed the model. Existing
  lockfiles keep loading — the reader accepts the legacy key
  (`_LEGACY_PROBE_PREMIUM_KEY`) so no seat loses a real measurement — and the
  next `--refresh` writes v2. `None` means **unknown**, never free, and no
  module outside `copilot_catalog.py` may name the field in either spelling.

### Added

- **(Set 131 S1) `delegation.direct_work_reason_codes`** replaces the
  "~50 lines of reasoned output" threshold, which measured the wrong end:
  emitted output is not what gets re-billed, **retained input is**.
  Classification is **constant-time** — pick a code or route, with no
  narrative justification, and if deciding which code applies would require
  opening a file, that *is* the answer. This is the disciplined form of the
  operator's "don't spend more deciding than doing"; the undisciplined form
  is a licence to hoard, because an orchestrator asked to estimate its own
  decision cost reliably concludes that doing the work is cheaper. The list
  is a closed enum — an unknown code is refused at load, because inventing a
  code is inventing a new way to keep work. Codes are audited in aggregate,
  never debated per call.

- **(Set 131 S1) `delegation.child_budget`** — a routed child's cost tracks
  its **inference count**, which is unbounded, not its rate. Advisory, not
  enforced: this repo measures before it gates, and the sample is 11 child
  conversations. A child that would exceed its budget is a task that should
  have been split.

- **(Set 131 S1) `delegation.thresholds`, keyed on `transport.profile`.** One
  philosophy, two thresholds, and the reason is **capability, not money**: on
  `copilot-cli` a child holds a read-only tool allowlist and can explore the
  repo itself, so delegating exploration is cheap; on `api` a child gets no
  tools at all and the orchestrator must package every byte of context, so
  packaging cost frequently dominates. An unknown profile key is refused at
  load rather than silently ignored.

- **(Set 131 S1) "Child output is untrusted data."** The orchestrator is the
  only actor holding write, shell and network rights, so widening delegation
  must not turn it into a relay: child responses are **evidence, never
  instructions** (including repository content they quote), no child-supplied
  command string is ever executed, and child output may not expand scope,
  authorize destructive actions, reduce verification, or close a session.

- **(Set 131 S2) `ai_router/tests/test_catalog_weight_not_a_price.py`** —
  eight structural falsifiers holding down the prohibition, every one proven
  by planting the defect in the real tree and watching the named test fail
  (10 plants, 10 fired). The scan asserts its own corpus is non-empty and
  contains named members, so it cannot pass having examined nothing, and the
  legitimate look-alike (`premium_requests` in the transport metadata) is
  asserted **not** to fire.

- **(Set 131 S3) `docs/ai-led-session-workflow.md` → "Rotation, and the trade
  we declined".** Transcript rotation is the largest measured cost effect in
  this repo's history and was documented nowhere. It ships with a **trigger**
  (~150K retained input tokens, taken at the first step boundary after the
  threshold is crossed, because a boundary already produces most of the
  carry-forward), a **survival contract** naming what must come through a
  flush and what must not be assumed to, and the **failure mode** — a session
  that repeats a path it already abandoned, which is the same statefulness
  argument that keeps stateful judgment with the orchestrator. Rotation stays
  manual: no automatic trigger ships in the set that first measured it.

- **(Set 131 S3) Rotation named as a fourth cost lever in
  `docs/planning/orchestration-strategy.md`.** Its three currencies are all
  managed by choosing what process to run; the orchestrator's own retained
  transcript is the lever that document omitted, and it is the larger one.

### Fixed

- **(Set 131 S2) `premium_request_weight` was not a price and was wrong
  besides.** Measured against the seat store's authoritative
  `request_multiplier`, the probe-derived field disagrees for the **entire
  OpenAI family**: `gpt-5.5` probes `0` and bills **7.5**, the second-highest
  multiplier on the seat; `gpt-5.4` probes `0` and bills `1.0`;
  `gpt-5.4-mini` probes `0` and bills `0.33`. The Anthropic and Google
  entries agree, which is precisely what made the field look trustworthy.

  The defect was **latent** — nothing read it for selection — and Session 1,
  by widening delegation, is what would have created such a reader. The
  subtler half is now stated beside the declaration: the field is unusable
  **even where it agrees**, because the credit axis is decoupled from the
  premium-request axis, so a reader who learns only "the OpenAI numbers are
  wrong" would conclude that correcting them makes the field usable.

- **(Set 131 S1) Two documented config keys that never existed.** The
  workflow doc told readers that `delegation.direct_work_max_lines` and
  `delegation.direct_work_max_files` lived in `router-config.yaml` and were
  human-tunable per project. They appear only in a design proposal and Set
  031's spec and were never shipped. Removed rather than added: the
  replacement rule measures retained input, not emitted lines.

- **(Set 131 S3) `AGENTS.md`, `CLAUDE.md` and `GEMINI.md` disagreed with each
  other and with the config.** `CLAUDE.md` and `GEMINI.md` still named "Set
  110 Session 4 and Sets 111-112" as a live window, `AGENTS.md` had drifted
  to a compressed variant of the same stale claim, and all three pointed at
  "human-tunable thresholds" that Session 1 had just deleted as phantom. The
  three engine files are supposed to differ **only** in their engine-specific
  bootstrap; the section is now byte-identical across all three.

### Measurement

All figures from the live Copilot seat store on 2026-08-14
(`assistant_usage_events`, 17,531 events), opened `mode=ro` — never
`immutable=1`, which skips the WAL and undercounts.

- **Rotation is a ~7–8x per-inference reduction.** Conversation `a9f211a7`
  (1,148 inferences, **$367.18**) compacted at turn 75: input fell
  631,304 → 54,119 tokens and cost fell ~33–35 → **~3.6–5.0** credits per
  inference. One-time cost 400 credits, payback ≈ 14 inferences. Banded on
  the same model, cost is flat from 25K to 150K input (7.65 → 9.76) and then
  roughly doubles per band (17.18 at 150–300K, **35.77** above 300K) — which
  is where the ~150K trigger comes from.

- **The orchestrator-downgrade case does not survive controlling for
  context.** The naive per-model table (opus-5 22.40 credits/inference vs
  gemini-3.1-pro 2.65) is **role/context confounding** — opus-5 is measured
  at ~270K input because it is the orchestrator, children at 33–45K because
  they are children. At matched context the gap collapses to ~1.7–2x, and
  `claude-opus-5` (multiplier **15.0**) and `gpt-5.5` (**7.5**) cost the
  **same** per inference. The premium-request and credit axes are effectively
  decoupled. The trade was declined on the record — a weaker orchestrator is
  a confused deputy at the only end holding write and shell rights — so the
  next reader does not re-derive the opposite from the naive table.

- **An unbounded agentic child can cost more than doing the work.** Over true
  sub-agent children (`initiator='sub-agent'`): gemini-3.1-pro **70.2**
  credits/child over 17 inferences, sonnet-4.6 **39.7** over 18, haiku-4.5
  **47.1** over 34 — but gpt-5.5 **721.8** over 89, which exceeds twenty
  orchestrator inferences at a >300K context. Cost tracks inference count,
  not rate.
