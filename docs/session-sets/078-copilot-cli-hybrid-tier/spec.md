# Copilot CLI Hybrid Tier (Seat-Transport Profile)

> **Purpose:** Give the Full tier a subscription-billed **seat profile**:
> `route()` keeps its brains (task typing, tiering, cross-provider
> verification, metrics, the whole session workflow) but dispatches calls
> through the GitHub Copilot CLI's headless mode (`--model` picker) instead
> of provider HTTPS APIs — so the operator's corporate-policy-locked team
> (GitHub Copilot seats only, no provider API keys) gets an *indirect Full
> tier*: routed work under one underlying model provider, independent
> verification under another, inside one seat. The profile is presented
> honestly as **Full-compatible with explicitly degraded guarantees**
> (provider provenance asserted from a discovered catalog snapshot, seat
> billing not locally meterable), never as byte-equivalent Full (Critique-2
> M1/M6). The sanctioned channel is the Copilot CLI (and, where the
> enterprise enables it, the official GitHub Models API — the named pivot
> if the CLI contract fails the S1 gate); the internal
> `api.githubcopilot.com` completions endpoint is explicitly out of bounds
> (ToS gray zone; suspension risk in a corporate org).
> **Created:** 2026-07-02
> **Session Set:** `docs/session-sets/078-copilot-cli-hybrid-tier/`
> **Prerequisite:** None machine-enforced (see **Sequencing against Set
> 077** below — S1 is read-only discovery and may start immediately; S2+
> carry explicit start gates so code work and the 0.28.0 release cannot
> outrun Set 077's 0.27.0).
> **Workflow:** Orchestrator → AI Router → Cross-provider verification
> **Target:** weekend delivery (by 2026-07-06). Critique-1 M1 called the
> timeline infeasible; the **operator corrected that premise on
> 2026-07-02** from months of demonstrated cadence — roughly 3–4 sessions
> on 2026-07-02, 1 on 2026-07-03, 4–5 on 2026-07-04, and the remainder on
> 2026-07-05 — which comfortably covers Set 077's remaining four sessions
> plus this set's five. Scheduling is the operator's call; sessions run
> in order at that cadence without scope-cutting for calendar reasons.
> The safeguards M1 motivated are retained **on their own merits, not as
> deadline hedges**: the S1 contract pin stays a hard go/no-go, `v0.28.0`
> never precedes 077's `v0.27.0`, and the release gates on quality and
> ordering — never on the calendar in either direction (rollback is a
> named deliverable regardless).

---

## Session Set Configuration

```yaml
tier: full
requiresUAT: true
requiresE2E: false
uatScope: per-set
uatStyle: ad-hoc
pathAwareCritique: required
contractGate: none
totalSessions: 5
```

> Rationale: the deliverable is an operator-runnable transport whose whole
> point is behavior against a live, seat-authenticated external CLI that
> the mechanical suite cannot exercise hermetically — `requiresUAT: true`
> with an ad-hoc per-set checklist covering the happy path AND induced
> failures (auth probe failure, malformed output; Critique-2 nit).
> `requiresE2E: false` — no browser surface. `pathAwareCritique: required`
> — new transport in the mission-critical path. `contractGate: none` is
> deliberate but compensated: the metrics-schema additive-compat tests
> (Critique-1 M6) are explicit S4 deliverables rather than an armed gate.

### Sequencing against Set 077 (Critique-1 M1/M2/M8)

The original draft hard-gated this set on 077 `complete` while its prose
authorized lifting the gate — a contradiction (Critique-1 M2). Resolved:
**no machine prerequisite**, with the constraints moved into enforceable
session steps:

- **S1 is read-only** (discovery + design lock; touches only this set's
  directory) and may run at any time, including before 077 finishes.
- **S2+ start gate:** at session start, either Set 077 is complete, or the
  orchestrator enumerates 077's remaining sessions' Touches lists and
  proves file-level disjointness with this session's Touches (recording
  the enumeration in the activity log) and works in a parallel worktree.
  Known shared-surface risks to check by name: `ai_router/__init__.py`,
  `ai_router/metrics.py`, `ai_router/verification.py` (Critique-1 M8).
- **Release-ordering invariant:** the `v0.28.0` tag is never pushed before
  077's `v0.27.0` is released; 0.28.0 is cut from a base that includes
  0.27.0 (Critique-1 M2).

---

## Project Overview

### Motivation (operator request, 2026-07-02)

The operator's staff is corporate-policy-limited to GitHub Copilot: no
`DABBLER_*` provider API keys are possible, so today their only option is
the Lightweight tier (router off, copy-prompt verification). A Copilot
seat's model picker spans models from multiple underlying providers
(Claude / GPT / Gemini families), and the Copilot CLI exposes a headless
programmatic mode with model selection. That combination makes the Full
tier's core guarantee — work generated under one model provider,
independently verified under a different one — *plausibly* satisfiable
inside a single subscription. The operator asked for exactly this: "a
lightweight CLI that calls other CLIs … a hybrid full tier," targeted at
the weekend before the team's mission-critical week.

**Plausibly, not provenly** (Critique-2 M3/M4): everything load-bearing
about the CLI — structured output, model catalog, per-entry underlying
provider provenance, quota visibility, noninteractive auth — is unpinned
until S1 tests the operator's (and a representative team member's)
installed CLI. S1 is therefore a hard go/no-go gate with a named pivot,
not a formality.

### Architecture (revised per Critique-2; S1 locks it against the real contract)

- **A first-class transport seam, selected by profile at startup — not a
  per-model `transport:` key** (Critique-2 M1). New module
  `ai_router/cli_transport.py` implements a `Transport` interface;
  `router-config.yaml` gains a top-level transport profile
  (`transport.profile: api | copilot-cli`, default `api`). Under the
  `api` profile the dispatch path is unchanged (regression-tested — we do
  not claim "byte-identical"; loader/schema changes are observable,
  Critique-2 nit). Under `copilot-cli`, `route()` resolves model choices
  through a **seat-local discovered catalog** and dispatches every call
  via the CLI transport. Seat-wide concerns (auth, catalog, quota,
  failure semantics) live in the transport layer, not on model entries.
- **Seat-local catalog lockfile, not checked-in picker strings**
  (Critique-2 M7, Critique-1 M5). A discovery command
  (`python -m ai_router.copilot_catalog --refresh`) generates
  `ai_router/copilot-catalog.lock`: CLI version, model IDs, each entry's
  reported underlying provider/source, capture date. Config references
  logical roles/aliases; the lockfile binds them per seat. Every routed
  run validates the lockfile against the live CLI version and **fails
  closed to "verification unavailable"** on drift, missing provenance, or
  a same-provider-only catalog (Critique-2 M3).
- **An extended result contract, not a forced `APIResult`** (Critique-2
  M2; recheck nit folded). The transport returns a `TransportResult`:
  the `APIResult` fields plus `usage_authoritative: bool`,
  `finish_reason_known: bool`, `content_complete: bool`,
  `partial_output_discarded: bool`, `raw_stdout`, `raw_stderr`, and
  `transport_metadata` — the discard decision is ON the contract, not
  implicit in the state machine, so downstream consumers never see a
  patched-together answer without knowing it. Consumers branch on the
  flags: truncation detection uses content heuristics when
  `finish_reason_known` is false (L-064-1 already supports this); cost
  and escalation logic treat non-authoritative usage as **absent, never
  estimated-and-fed-forward**.
- **A CLI-specific invocation state machine, not the HTTP retry loop**
  (Critique-2 M5): enforced noninteractive flags on every call; spawn /
  first-byte / total timeouts; auth-class failures trigger a re-probe and
  an operator-visible stop (never an interactive hang); quota-exhaustion
  and catalog-drift classes are fail-fast operator actions; **no
  automatic retry after any content has been emitted** (retries can
  double-bill a metered seat); partial output is discarded, never
  patched together. Serialized execution (no concurrent CLI calls)
  unless S1 proves concurrency safe (Critique-2 nit).
- **Honest non-accounting** (Critique-2 M6, Critique-1 M7). Local
  invocations are not authoritative billed units. Metrics record
  `transport`, `local_invocations`, `attempts`, and
  `billed_usage_unavailable: true`; the profile is **excluded from every
  cost-keyed guard and escalation heuristic** (cost guard: skip with a
  recorded reason; escalation: never cost-triggered under this profile).
  The protective ceiling is a **hard local-invocation circuit breaker**
  (`transport.max_invocations_per_session`, fail-loud, operator-visible)
  — a cap on what we *did* (which local counting can assert), not a
  fabricated cap on what GitHub billed.
- **Fail loud, fail early.** Presence/auth/catalog probes run before the
  first dispatch with friendly explainers; a missing, unauthenticated,
  or provenance-less CLI is an operator-visible error, never a silent
  fallback to API transport.

### Hard checkpoint (S1) — the go/no-go gate (Critique-2 M4, Critique-1 M3/M4/M5)

S1 pins the real contract with evidence from the installed CLI and stops
the set (with a pivot recommendation) unless **all** of the following
hold on the operator's seat AND a representative target-team seat:

1. A noninteractive headless mode with auth-suppression flags and
   documented exit behavior.
2. **Stable structured output** (JSON or equivalent) with deterministic
   separation of content from warnings/metadata — free-form stdout is a
   no-go for a mission-critical router.
3. Model selection, with **machine-readable underlying-provider
   provenance** per catalog entry.
4. **At least two enabled, dispatchable models resolving to different
   underlying providers** on the seat (enterprise policy can enable a
   single family; headless mode "working" is not enough).
5. Usage/quota visibility characterized (even if the answer is "none" —
   that feeds the honest-non-accounting posture, not a stop).
6. Rate/concurrency behavior characterized for back-to-back generate +
   verify calls.

**If the gate fails:** the set stops loudly; the recorded pivot is a
GitHub Models REST API adapter (official, GitHub-billed, multi-provider,
designed for programmatic use — S1 checks its enterprise availability
either way), re-scoped via spec amendment + re-critique. The team is
never left with nothing: Set 077's hardened Lightweight tier is the
already-in-flight floor for the mission-critical week (Critique-1 M3).

### Non-goals

- No use of the internal `api.githubcopilot.com` completions endpoint or
  community proxies of it (ToS gray zone; corporate suspension risk).
- No extension UI for profile selection (config-file activation is
  enough for the pilot team; a picker is a future set).
- No GitHub Models adapter built in this set unless S1 pivots to it.
- No changes to the Lightweight tier or Set 077's verification machinery.
- No new tiers in the tier-model SSoT (the profile is documented under
  Full with its degraded-guarantee caveats stated).
- No claim of byte-identical behavior under the `api` profile — the
  claim is "regression-suite-identical" (Critique-2 nit).

---

## Feature 1: Copilot CLI transport layer

### Scope

- `ai_router/cli_transport.py`: the `Transport` interface + Copilot CLI
  implementation (injected spawner; the invocation state machine above;
  `TransportResult` contract; spawn/first-byte/total timeouts; exit-code
  → error-class mapping per the S1-pinned contract).
- `ai_router/copilot_catalog.py`: discovery command + lockfile
  read/validate (CLI version pin, provenance fields, drift detection,
  fail-closed posture).
- Config: `transport.profile` selection, role/alias mapping, the hard
  `max_invocations_per_session` breaker, load-time validation (unknown
  profile fails loud; `copilot-cli` profile without a lockfile points at
  the discovery command).
- Presence/auth/catalog probes + friendly failure explainers.

### Standards

- Layer-1 tests with a fake spawner cover the full state machine:
  argument construction, noninteractive enforcement, all three timeout
  classes, auth-class re-probe + stop, quota-class fail-fast,
  no-retry-after-content, partial-output discard, malformed/empty
  output, lockfile drift, breaker trip. No test invokes the real CLI.
- The `api` profile passes the entire existing suite unchanged.
- ASCII-only console output; artifacts UTF-8. The transport never reads
  `DABBLER_*` keys and never falls back to API transport on failure.

## Feature 2: Routing, verification, and honest accounting over the profile

### Scope

- `route()` end-to-end under the `copilot-cli` profile: task typing and
  tier selection resolve through the catalog roles; the cross-provider
  verifier rule keys on the lockfile's provenance and **fails closed to
  "verification unavailable"** (operator-visible, non-silent) when it
  cannot assert two distinct underlying providers (Critique-2 M3).
- Metrics: `transport`, `local_invocations`, `attempts`,
  `billed_usage_unavailable` fields; `cost_report` renders invocation
  counts and never fabricates spend; **additive-schema back-compat
  tests** — existing readers tolerate the new fields, and `cost_report`
  handles absent-cost rows (Critique-1 M6).
- Cost-keyed guard exclusions with per-guard unit tests + recorded skip
  reasons; the hard invocation breaker enforced in the route path.
- Live dogfood on a real seat: one routed call + one cross-provider
  verification; save the metrics + lockfile evidence.

### Standards

- A profile whose catalog resolves generator and verifier to the same
  underlying provider must fail model selection loudly (never verify
  same-provider silently).
- Verification templates, blocking predicates (`is_blocking_verdict`),
  and the Step-6/7 loop are untouched.

## Feature 3: Docs, UAT, release, rollback

### Scope

- Tier-model SSoT (`docs/concepts/tier-model.md`): the seat-profile
  clause under Full — what is guaranteed, what is explicitly degraded
  (asserted provenance, no billed-usage accounting), when to choose it;
  the key-less-shop recipe incl. catalog discovery on each seat.
  Workflow-doc note; consumer engine-tail pointer;
  `docs/repository-reference.md` version walk; CHANGELOG.
- Ad-hoc per-set UAT checklist
  (`078-copilot-cli-hybrid-tier-uat-checklist.json`): probe-failure
  walk (friendly), malformed-output walk (induced), catalog discovery +
  drift refusal, one routed call, one cross-provider verification, the
  breaker trip, and the `api`-profile regression confirmation — walked
  on the operator's seat AND attested against a representative team
  seat's catalog (Critique-1 M5).
- Required end-of-set path-aware critique (>= 2 providers), saved as
  `path-aware-critique.json`.
- Release: `dabbler-ai-router` 0.28.0 cut on a base including 077's
  0.27.0; **rollback recipe recorded in the change-log** (pin
  0.27.0, `transport.profile: api`, lockfile ignored) so a bad release
  during the mission-critical week has a named escape (Critique-1 M9).

---

## Sessions

> **Contingency note (Critique-1 M9):** S2–S5 scopes are committed
> pending S1's contract pin; S1 step 5 amends them where the real
> contract moves them, and a failed S1 gate stops the set with the
> GitHub Models pivot recommendation instead.

### Session 1 of 5: CLI contract discovery and design lock (go/no-go)

**Steps:**
1. Register session start; read guidance docs (Step 0 set). S1 is
   read-only outside this set's directory and may run before Set 077
   completes.
2. Pin the installed Copilot CLI contract with evidence against the full
   six-point gate above (headless/noninteractive + auth suppression,
   structured output, provenance, >= 2 provider-distinct enabled models,
   quota visibility, rate/concurrency); spike one raw subprocess
   round-trip; repeat the catalog/provenance checks against a
   representative target-team seat (operator arranges); save
   `s1-cli-contract.md`. **Go/no-go:** any failed gate point stops the
   set with findings + the GitHub Models pivot recommendation.
3. Check GitHub Models API enterprise availability (recorded either way
   — it is the pivot target and the comparison baseline).
4. Route the design adjudication (`task_type: architecture`): lockfile
   schema, role/alias mapping shape, timeout defaults, retryable-error
   classes, breaker default, guard-exclusion list. Record decisions.
5. Amend Features/Sessions where the pinned contract moved them; verify;
   close.

**Creates:** `s1-cli-contract.md`; spec amendments
**Touches:** spec.md only
**Ends with:** the contract pinned with evidence on two seats and the
design locked — or the set stopped loudly with a pivot recommendation.
**Progress keys:** `s1.contract`, `s1.team-seat`, `s1.design-lock`,
`s1.closed`

### Session 2 of 5: Transport layer and catalog lockfile

**Steps:**
1. **Start gate:** Set 077 complete, or enumerate 077's remaining
   Touches lists, prove disjointness with this session's Touches, and
   work in a parallel worktree (record the enumeration).
2. Implement `cli_transport.py` (Transport interface, state machine,
   `TransportResult`) and `copilot_catalog.py` (discovery + lockfile +
   drift validation).
3. Config: `transport.profile`, roles, breaker, validation, probes +
   friendly explainers.
4. Layer-1 fake-spawner suite per Feature 1 Standards; confirm the `api`
   profile passes the existing suite unchanged.
5. Full pass; verify; close.

**Creates:** `ai_router/cli_transport.py`, `ai_router/copilot_catalog.py`
+ tests; config schema + example profile
**Touches:** `ai_router/providers.py` (seam only), `ai_router/config.py`,
`ai_router/router-config.yaml` (schema comments), pytest suites
**Ends with:** the transport layer proven against a fake spawner; the
weekend minimum (adapter shipped, profile off by default) reached.
**Progress keys:** `s2.start-gate`, `s2.transport`, `s2.catalog`,
`s2.tests`, `s2.closed`

### Session 3 of 5: Routing integration, verification provenance, honest accounting

**Steps:**
1. Start gate (as S2). `route()` under the `copilot-cli` profile:
   catalog-role resolution, verifier provenance rule with the
   fail-closed "verification unavailable" posture, the loud
   same-provider failure test.
2. Metrics fields + `cost_report` invocation rendering + the
   additive-schema back-compat tests (Critique-1 M6).
3. Cost-guard exclusions with per-guard tests + recorded skip reasons;
   the hard invocation breaker in the route path with a trip test.
4. Full pass; verify; close.

**Creates:** integration, provenance, back-compat, guard, breaker tests
**Touches:** `ai_router/__init__.py` (route), `ai_router/metrics.py`,
`ai_router/cost_report.py`, `ai_router/verification.py` (picker seam),
pytest suites
**Ends with:** a key-less shop's route path is complete and honest:
cross-provider verification asserts provenance or refuses; accounting
never fabricates; the breaker caps seat burn.
**Progress keys:** `s3.routing`, `s3.provenance`, `s3.accounting`,
`s3.breaker`, `s3.closed`

### Session 4 of 5: Live dogfood and UAT

**Steps:**
1. Catalog discovery on the operator's seat; live dogfood: one routed
   call + one cross-provider verification through the CLI profile; save
   metrics + lockfile evidence.
2. Author the ad-hoc per-set UAT checklist (Feature 3 scope, incl. the
   induced-failure walks and the team-seat catalog attestation);
   operator walks it and attests.
3. Fix-forward anything UAT surfaces (mechanical fixes in-session;
   scope-moving findings amend the spec for S5 or a follow-up).
4. Full pass; verify; close.

**Creates:** dogfood evidence; UAT checklist + attestation
**Touches:** fixes as surfaced; otherwise none
**Ends with:** the profile proven on real seats, failures included; UAT
attested.
**Progress keys:** `s4.dogfood`, `s4.uat`, `s4.closed`

### Session 5 of 5: Docs, path-aware critique, coordinated release

**Steps:**
1. Tier-model SSoT seat-profile clause; workflow-doc note; engine-tail
   pointer; repository-reference version walk; CHANGELOG (incl. the
   rollback recipe).
2. Required end-of-set path-aware critique (>= 2 providers); adjudicate;
   save `path-aware-critique.json`.
3. **Release-ordering check:** 077's `v0.27.0` released; rebase/confirm
   base. Bump `dabbler-ai-router` → 0.28.0; operator-authorized
   `v0.28.0` tag push; confirm publish; change-log; close set.

**Creates:** `path-aware-critique.json`, `change-log.md`, PyPI release
**Touches:** `pyproject.toml`, `docs/concepts/tier-model.md`,
`docs/ai-led-session-workflow.md`, `docs/templates/consumer-bootstrap/`,
`docs/repository-reference.md`, `CHANGELOG.md`
**Ends with:** 0.28.0 on PyPI with a named rollback; the Copilot-locked
team has a documented, UAT-attested, honestly-labeled seat-profile Full
tier.
**Progress keys:** `s5.docs`, `s5.critique`, `s5.release`, `s5.closed`

---

## End-of-set deliverables

- Copilot CLI transport layer (profile-selected at startup; injected-
  spawner-tested state machine; fail-loud probes; no API fallback; no
  `DABBLER_*` reads) with the seat-local catalog lockfile + discovery
  command; the `api` profile regression-suite-identical.
- `route()` + cross-provider verification on one seat across two
  asserted underlying providers, failing closed to "verification
  unavailable" when provenance cannot be asserted.
- Honest seat accounting: `local_invocations`/`attempts`/
  `billed_usage_unavailable` metrics (additive-schema back-compat
  tested), cost-guard exclusions with recorded reasons, hard
  invocation circuit breaker.
- Pinned two-seat CLI contract + GitHub Models availability note (the
  recorded pivot); tier-model SSoT seat-profile clause with explicit
  degraded-guarantee caveats; UAT attestation incl. induced failures;
  required path-aware critique; router 0.28.0 released after 0.27.0
  with a named rollback recipe.

---

> **Pre-authoring adversarial critique.** The draft of this spec was
> routed for devil's-advocate review before finalization, two legs on
> distinct providers, saved raw and unedited in this directory:
> `planning-critique-1-planning.md` (Opus, `task_type: planning`,
> verdict SOUND-WITH-CHANGES, M1–M9 + nits) and
> `planning-critique-2-architecture.md` (GPT-5.4, architecture framing
> routed via the gpt-pinned verification task type after three tier-3
> routing attempts landed on Anthropic; verdict **UNSOUND**, M1–M7 +
> nits). Every material finding from both legs is folded above and
> marked "(Critique-1 Mn)" / "(Critique-2 Mn)"; the fold is a
> substantive redesign (first-class transport profile, catalog lockfile
> with provenance fail-closed, extended TransportResult contract, CLI
> invocation state machine, honest non-accounting + hard breaker,
> two-seat S1 gate, sequencing/release-ordering rework, 5 sessions).
> The revised spec was re-routed to the UNSOUND leg's provider for a
> confirmation pass; verdict recorded below the fold in
> `planning-critique-3-recheck.md`.
