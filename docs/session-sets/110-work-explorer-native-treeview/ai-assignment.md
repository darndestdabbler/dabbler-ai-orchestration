# AI Assignment — 110-work-explorer-native-treeview

## Session 1 of 4 — Decide with good advice, and measure before committing

- Orchestrator: claude / anthropic / claude-opus-5 / high (operator-invoked;
  picked up automatically after Set 109 closed, per a standing operator
  instruction to poll and proceed).
- Routed step-3.5 analysis: [`s1-ai-assignment-analysis.json`](s1-ai-assignment-analysis.json)
  (route `task_type=analysis`, excl. anthropic → `gemini-2.5-pro`, $0.0091,
  truncation-clean, `served_model_mismatch: false`).
- Set-level facts carried from the spec (immutable at runtime): **Full tier**,
  `requiresUAT true` (**S4** walks it; S1 neither arms nor runs it),
  `requiresE2E true` (L-064-12 arms at full strength — this *is* the
  Explorer-rendering surface — but **S1 changes no shipping code**, so the
  Layer 3 obligation lands on S2–S4, not here), `pathAwareCritique advisory`
  (set-terminal, in S4). Prerequisite `109-model-registry-and-pricing-truth`
  confirmed `complete` before registration.
- **Budget note, by source.** This session spent **$0.1514** of `DABBLER_*`
  provider credit: one routed analysis ($0.0091), two routed panel seats
  ($0.0367 Sonnet 5, $0.1056 GPT-5.6 Sol), plus verification. The Opus 5 panel
  seat cost **$0** because the operator ruled that the orchestrator *is* Opus 5
  and need not be routed to. **Zero Copilot seat capacity** was consumed.

### Routing plan

| Step | Action | Routing decision |
| :--- | :--- | :--- |
| 1 | Register; preload; keys; confirm the 109 prerequisite. | Orchestrator direct — bootstrapping. |
| 3.5 | Assignment analysis + next-orchestrator / next-set recommendations. | **Routed** (`analysis`) — repo rule: never self-opine on model choice. |
| 2 | Re-run the architecture panel on the corrected registry. | **Routed** (`architecture`) ×2 with `prefer_model`, **plus the orchestrator's own written opinion** as the Opus 5 seat, committed before the routed ones were read. |
| 3 | Measure startup cost at four scales. | Orchestrator direct — **execution, not reasoning**. Timings are facts; asking a model to estimate them would substitute recall for evidence. |
| 4 | Spike `contributes.submenus`, `"group": "inline"`, lazy `getChildren`, and the operator's status SVGs. | Orchestrator direct — a real Extension Development Host answers these; a model would only recite documentation the spec explicitly refused to trust. |
| 5 | Put the density trade to the operator. | **Human only** — never consensus-eligible. |
| 6 | Write `s1-migration-decision.md`. | Orchestrator direct — synthesis of the above. |
| Verify | Phased `verify_session` for this set. | **Routed** — `session-verification`, anthropic auto-excluded per the no-skip mandate. |
| Close | `disposition.json`; commit + push; `close_session`; notify. | Orchestrator direct — mechanics. |

### The routed analyst's forward-looking recommendations

**Orchestrator assignments for S2–S4** (recorded as advice; the operator
assigns):

| session | recommended | analyst's reasoning |
| :--- | :--- | :--- |
| S2 | `codex` / gpt-5.6-sol | greenfield implementation against a typed SDK; wants precise idiomatic TypeScript |
| S3 | `claude` / opus | ~2k lines of deletion plus a test-suite rewrite from DOM assertions to provider assertions; wants reasoning about code *intent* |
| S4 | `gemini` / gemini-3.1-pro-preview | human-centric walk, triage, UAT checklist, CHANGELOG |

On within-set independence the analyst declined the premise: *"select
orchestrators based on task suitability rather than mandating maximum provider
diversity"*, on the grounds that mandatory cross-provider verification already
mitigates shared blind spots.

**Two caveats the operator should weigh before adopting any of this.**

1. **These are engine-seat costs, not `DABBLER_*` key costs.** Running S2 on
   `codex` or S4 on `gemini` means driving those CLIs as the orchestrator,
   which draws on whatever subscription backs them — a different budget from
   the API keys this session spent, and one the operator has recently been
   cutting back. An all-`claude` set spends nothing extra.
2. **S3's recommendation is the one worth taking seriously on its merits.**
   S3 is the session all three panelists called riskiest, and it is a deletion
   plus a behavioural-spec re-expression rather than greenfield authoring.

**Candidate next session set.** The analyst proposed
`111-core-router-registry-hardening` — the owed `route()`-side model-id
validation, `pull_verifier._pricing_for`'s fail-open on unknown ids, and the
two redundant identity-only registry entries. That is a coherent set and all
three items are genuinely owed.

**This session surfaced a second, stronger candidate the analyst could not have
known about:** the Explorer's empty-tree cost is ~102 ms of blocking host work,
essentially all of it a synchronous `git worktree list` subprocess inside
`discoverRootsWithFamilies()`, run twice per refresh. It is the actual cause of
the operator's original complaint, Set 110 explicitly does **not** fix it, and
it is now backed by a measurement rather than a hunch. See
[`s1-migration-decision.md`](s1-migration-decision.md) §2.

### Where this session departed from the routed analysis

The analyst's **risk prediction was exactly right** and deserves the credit:

> *"The performance measurement incorrectly attributes startup latency to the
> legacy webview renderer when the true bottleneck is the underlying
> data-gathering filesystem scan. A 'go' decision would then be made on a false
> premise."*

The measurement bore this out — with a refinement the analyst did not
anticipate: it is not the filesystem scan either (0.3 ms on an empty tree) but
the **git subprocess inside root discovery**.

**Its proposed mitigation was adopted; its proposed decision rule was not.** The
analyst wrote that *"the go/no-go decision must be contingent on buckets 3 and 4
being the primary latency source"* — i.e. **no-go** once the scan dominates.
This session isolated the buckets exactly as advised, found that rendering is
**not** the primary latency source, and still returned **GO** — because the
migration's case was never primarily performance, and all three panel voices
ranked defect-class elimination first. The honest response to "the perf premise
is false" is to **withdraw the perf claim in writing**, which
`s1-migration-decision.md` does, not to abandon a migration justified on other
grounds.

One further departure: the analyst's four proposed buckets assume a running
extension host. Two of them (view creation, first paint) are not measurable from
Node, and this session says so rather than fabricating them.
