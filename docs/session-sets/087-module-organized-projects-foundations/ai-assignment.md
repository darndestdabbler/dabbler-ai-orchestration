# AI Assignment Ledger — Set 087

Per-session record of the cheapest-capable AI for each step, plus the
next-session recommendation. Next-orchestrator / next-session choices are
produced via routed analysis (`route(task_type="analysis")`), never
self-opined (L-064-6 / Rule 17). The routed analysis for S1 is saved raw at
`s1-next-orchestrator-analysis.json`; the S1 collision-check architecture
decision is saved raw at `s1-collision-check-architecture.json`.

## Session 1 of 4 — Manifest + module metadata + global-uniqueness invariant

Orchestrator: **claude / anthropic / claude-fable-5**.

| Step | Handled by | Rationale |
| :--- | :--- | :--- |
| Read the two operator-approved design docs + map the extension seams (fileSystem.ts, types.ts, test harness) | Orchestrator (direct) | Read-only reconnaissance over files the spec names explicitly; no reasoning to route. |
| **Collision-check architecture decision** (how to distinguish the legitimate main+worktree merge from a true duplicate-name collision; what surfacing Session 1 ships given the webview protocol is S2 scope; merge behavior under collision) | **Routed — architecture (tier 3, opus)** | Genuine oracle-free design question with >1 plausible answer (spec Step 4 mandates the routed delegation). Ruled: repo-family identity derived from the worktree enumeration discovery already runs (zero new git calls) + root-relative path folded into the identity key (Phase-3-proof); one deterministic winner row flagged with an optional `duplicateNameError`; `readAllSessionSetsWithDiagnostics()` envelope + one deduped, re-arming `console.error`; no throwing, no notifications from the data layer. Saved raw. |
| `readModulesManifest` (real YAML parse per the routerConfig.ts house style; tolerant-entry rules) | Orchestrator (direct) | Implementation fully determined by the spec + recommendation §2.4; mirrors existing tolerant-reader conventions. |
| `module`/`moduleTitle` threading (types.ts + parseSessionSetConfig + readSessionSets validation) | Orchestrator (direct) | Deterministic from the spec; grouping-attribute-not-identity invariant applied as specified. |
| Fail-loud uniqueness check (`discoverRootsWithFamilies`, `readAllSessionSetsWithDiagnostics`) | Orchestrator (direct) | Directly implements the routed architecture ruling. |
| Extension unit tests (18 new, final count after two verifier-round additions: manifest matrix, attribution matrix, config key, collision matrix incl. a real git-worktree fixture, wrong-shape warning, warning-precision) | Orchestrator (direct) | Written against the live module; exercised by the full suite. |
| **Session verification (Step 6)** | **Routed — cross-provider, non-anthropic** | Mandatory no-skip cross-provider check (no-skip-verification-mandate). |
| Next-orchestrator AI assignment | **Routed — analysis (gemini-pro, tier 2)** | L-064-6: never self-opine on model choice. Saved raw at `s1-next-orchestrator-analysis.json`. |

**Delegation note.** The one oracle-free, solution-divergent decision (the
collision predicate + surfacing) was routed to a tier-3 architecture
reviewer; the implementation that flows deterministically from that ruling +
the operator-approved recommendation doc was handled directly. The routed
analysis sanity-checked this split and recommended no changes.

## Next-session recommendation (routed analysis, made in S1)

For **Session 2 of 4 (Explorer module tier — protocol, view-model, host,
webview client, Layer 2/3 tests)** the routed analysis
(`s1-next-orchestrator-analysis.json`, gemini-pro, tier 2) recommends
**claude / anthropic / Opus-class / high effort**. Rationale (routed): S2
spans the VS Code host (TS), the webview client (HTML/JS/CSS), and the
Playwright layer, with strict ARIA and pixel-compatibility constraints —
nuanced cross-surface work where a lesser model risks subtle visual
regressions in the core Explorer UI whose remediation cost exceeds the seat
premium. Operator supervision warranted on: the `ModulePayload` protocol
contract, the ARIA attributes in the webview rendering, and the Layer 3
assertions' fidelity to the desired UX. The operator owns the final seat
choice.

### Actuals (S1)
- Orchestrator used: claude / anthropic / claude-fable-5
- Routed cost (pre-verification): architecture (tier 3, opus, $0.74) +
  analysis (tier 2, gemini-pro, $0.006); both saved raw.
- Verification: recorded at close (see disposition.json / the
  sN-verification artifacts).

## Session 2 of 4 — Explorer module tier (module → buckets → rows)

Orchestrator: **claude / anthropic / claude-fable-5** (recommendation was
Opus-class/high; the operator owns the seat choice and started the session
on the Fable seat — a capability superset, so no scope adjustment).

| Step | Handled by | Rationale |
| :--- | :--- | :--- |
| Read S1 outcome + map the four touched surfaces (protocol, view-model, host view, webview client) | Orchestrator (direct) | Read-only reconnaissance over files the spec names explicitly. |
| **Module-tier rendering architecture decision** (implicit-module rendering when labeled modules coexist; `SnapshotPayload.buckets` fate once `modules[]` exists; where manifest display order comes from so `groupByModule(all)` stays pure; DOM-compat strictness for the no-manifest case + aria-level placement + collapse-key encoding) | **Routed — architecture** | The one oracle-free, solution-divergent decision cluster of the session (`delegation.always_route_task_types` includes architecture). Saved raw: `s2-explorer-render-architecture.json`. |
| Protocol / view-model / host / webview implementation | Orchestrator (direct) | Flows deterministically from the spec + the routed ruling; mirrors existing house patterns (bucket rendering, quiet markers, monotonic-version protocol). |
| Layer 2 unit tests + fixtures; Playwright Layer 3 module-tier smoke | Orchestrator (direct) | Written against the live modules; exercised by the full suite. |
| **Session verification (Step 6)** | **Routed — cross-provider, non-anthropic** | Mandatory no-skip cross-provider check (no-skip-verification-mandate). |
| Next-orchestrator AI assignment (S3) | **Routed — analysis** | L-064-6: never self-opine on model choice. Saved raw: `s2-next-orchestrator-analysis.json`. |

## Next-session recommendation (routed analysis, made in S2)

For **Session 3 of 4 (module authoring, scaffolding & ownership templates)**
the routed analysis (`s2-next-orchestrator-analysis.json`, gemini-pro,
tier 2) recommends **claude / anthropic / Opus-class / medium effort**.
Rationale (routed): S3 centers on precise file manipulations (YAML, MD, TS)
and structured template generation (CODEOWNERS, monorepo CI) rather than
novel architecture or complex rendering — an Opus-class seat at moderate
effort fits; continuity from S2 is a secondary benefit. Supervision points
(routed): (1) the CODEOWNERS/CI templates' path-scoping and ownership
mappings, (2) the new scaffold action's typing across the webview action
union + host handler, (3) error handling on the modules.yaml /
project-plan.md writes. The same analysis sanity-checked S2's delegation
split and found no mis-delegated step. The operator owns the final seat
choice.

### Actuals (S2)
- Orchestrator used: claude / anthropic / claude-fable-5 (recommendation
  was Opus-class/high; operator's seat choice).
- Total routed cost: ~$0.76 — architecture ruling (gemini-pro after two
  anthropic provider failures, + auto-verify passes), analysis
  (gemini-pro), four session-verification rounds (gpt-5-6: R1 $0.17,
  R2 $0.18, backstop R3 $0.12, R4 $0.22), and the third-provider
  adjudication opinion (gemini-pro).
- Deviations from recommendation: seat (fable-5 vs opus/high) —
  operator's call; no scope effect.
- Verification: R1 ISSUES_FOUND (1 Major — payload-shape test
  substituted with source scans) fixed in-flight (builder extraction +
  7 behavioral tests). R2 ISSUES_FOUND (1 Major — ARIA tree
  conformance), re-raised by the close backstop as R3; adjudication
  chain: orchestrator dispute → operator-selected third-provider
  opinion (gemini-pro: technically correct, recommended DEFER) →
  operator override: FIX NOW. Fixed (conformant nested treeitem/group
  + keyboard operability in the multi-module dialect; implicit dialect
  re-proven byte-identical). R4: **VERIFIED, zero findings**.
- Notes for next-session calibration: the verifier pair (gpt-5-6) held
  the module tier to full WAI-ARIA authoring practice, beyond the
  spec's literal aria-level text — S3's webview-action work should
  state interaction/a11y intent explicitly in its conventions block up
  front. Anthropic-as-provider failed twice on one routed call
  (timeout, then 400); exclude-and-reroute worked cleanly.

## Session 3 of 4 — Module authoring, scaffolding & ownership templates

Orchestrator: **claude / anthropic / claude-fable-5** (recommendation was
Opus-class/medium; the operator owns the seat choice and started the session
on the Fable seat — a capability superset, so no scope adjustment).

| Step | Handled by | Rationale |
| :--- | :--- | :--- |
| Read S1–S2 outcomes + map the touched surfaces (Getting Started action set, sessionGenPrompt, planImport, consumerBootstrap templates) | Orchestrator (direct) | Read-only reconnaissance over files the spec names explicitly. |
| **Authoring/scaffold architecture decision** (new-module action surface + input UX; how generated specs acquire `module:` — prompt-only vs writer-rendered exemplar; CODEOWNERS/CI template posture — reference-only vs scaffold-written, target paths, touches-rule encoding; plan-authoring module-awareness) | **Routed — architecture** | The one oracle-free, solution-divergent decision cluster of the session (`delegation.always_route_task_types` includes architecture). Anthropic-as-provider failed (400 ×3 attempts, S2 precedent) → excluded, rerouted to gemini-pro. Saved raw: `s3-authoring-scaffold-architecture.json`. |
| Scaffold module / command / protocol / prompt-flow / template implementation | Orchestrator (direct) | Flows deterministically from the spec + the routed ruling; mirrors existing house patterns (fail-loud rider narrowing, whole-line template tokens, skip-existing scaffold guard). |
| Unit + Layer 2 tests | Orchestrator (direct) | Written against the live modules; exercised by the full suite. |
| Ad-hoc UAT checklist (operator-armed gate) | Orchestrator (direct), automation-first | Authored to the Set-078 bar; every automation-checkable step pre-verified by the suite before the human walk. |
| **Session verification (Step 6)** | **Routed — cross-provider, non-anthropic** | Mandatory no-skip cross-provider check (no-skip-verification-mandate). |
| Next-orchestrator AI assignment (S4) | **Routed — analysis (gemini-pro, tier 2)** | L-064-6: never self-opine on model choice. Saved raw: `s3-next-orchestrator-analysis.json`. |

**Delegation note.** The routed analysis suggested splitting the direct
implementation further (template boilerplate to a cheaper model). Recorded as
a deviation, not adopted: S1/S2 precedent is that implementation flowing
deterministically from an operator-approved ruling is orchestrator-direct —
at this scale the decomposition/hand-off overhead exceeds the seat delta,
and the templates are teaching artifacts whose wording is review-sensitive.

## Next-session recommendation (routed analysis, made in S3)

For **Session 4 of 4 (Hello World team walkthrough + AI feedback prompt +
set-terminal ceremony)** the routed analysis
(`s3-next-orchestrator-analysis.json`, gemini-pro, tier 2) recommends
**claude / anthropic / Opus-class / high effort**. Rationale (routed): the
deliverables are long-form, coherence-critical prose (tutorial + review
meta-prompt) with strict stylistic constraints; high-end Claude models have
the verified track record here. Supervision points (routed): (1) the operator
executes the walkthrough verbatim in a clean environment (AI tutorials can be
theoretically sound but practically flawed), (2) dogfooded review-prompt
output is checked for coaching tone and cited-evidence quality, not just for
flagging the planted violation, (3) the path-aware critique is rejected if
generic — it must ground in Set 087's actual events. The operator owns the
final seat choice.
