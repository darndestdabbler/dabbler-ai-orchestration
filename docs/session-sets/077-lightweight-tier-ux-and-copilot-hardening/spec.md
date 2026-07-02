# Lightweight Tier UX and Copilot Hardening

> **Purpose:** Make the extension and the Lightweight tier bulletproof for a
> team that is corporate-policy-locked to GitHub Copilot and starts
> mission-critical work the week of 2026-07-06: fix the Getting Started tier
> leak (the operator-reported "chose Lightweight, extension still says Full"),
> make Lightweight cross-provider verification self-completing and visible
> (Mode A writes its own artifact; Mode B is reachable, surfaced, and passes
> its gate in a single-engine shop), warn about the Python prerequisite at
> setup, and run a general review-and-hardening pass over the surfaces the
> team will exercise. Ships coordinated releases of both packages.
> **Created:** 2026-07-02
> **Session Set:** `docs/session-sets/077-lightweight-tier-ux-and-copilot-hardening/`
> **Prerequisite:** None (Set 076 is complete; its local-only close path is
> adjacent but independent).
> **Workflow:** Orchestrator → AI Router → Cross-provider verification
> **Design input:** `docs/proposals/2026-06-23-lightweight-tier-leak-and-local-only-closeout.md`
> (Defect 1 — deferred from Set 076 to its own set: this one) and the
> 2026-07-02 operator report + repo audit recorded in the Project Overview
> below.

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
totalSessions: 6
```

> Rationale: this set redesigns interactive webview + copy-prompt surfaces
> (Getting Started form, Explorer row markers, clipboard prompts) — the layer
> the mechanical stack only partially covers and exactly where the 0.28.0-era
> defects shipped (Set 060 precedent). `requiresUAT: true` with an ad-hoc,
> per-set checklist: the deliverable is a human-attestable flow ("a
> Copilot-locked developer gets from empty folder to a verified Lightweight
> set with no dead-ends"), walked on a **local VSIX before any publish**.
> `requiresE2E: false` — webview form actions are non-deterministic under
> Playwright (Set 052/060 precedent); the existing Layer-3 rendering smoke
> plus Layer-2 provider tests are the mechanical floor and must stay green.
> `pathAwareCritique: required` — the operator asked for the extension to be
> "as bulletproof as possible" for mission-critical use; the multi-provider
> end-of-set critique is the second net over the whole change set.

---

## Project Overview

### Motivation (operator report, 2026-07-02)

The operator's staff — corporate-policy-limited to GitHub Copilot — adopts
the framework for mission-critical work the week of 2026-07-06. Their field
report, confirmed by audit:

1. **Tier leak.** After choosing Lightweight in Getting Started, the
   extension still reports/behaves as if Full is selected. Two coupled
   causes, one family (ephemeral tier state):
   - **Webview state persistence (the reported symptom).** The form state
     lives only in the in-memory `gsState` (initialized `tier: "full"`,
     `media/session-sets-tree/client.js:45`); `client.js` never calls
     `vscode.setState()`/`getState()`, and the view is registered without
     `retainContextWhenHidden` (`src/extension.ts:121`). Hiding/re-expanding
     the view or reloading the window re-runs `client.js`: the **Full radio
     re-checks itself and the "Full tier routes work through provider
     APIs…" warning reappears** (`media/session-sets-tree/gettingStartedHtml.js:233-250`)
     — the extension literally re-announces Full after a Lightweight pick,
     and a Build click at that point scaffolds Full. (The message plumbing
     and the dynamic notifications are correct within a single live view —
     verified; the bug is state loss, not display logic.)
   - **Decomposition-prompt fallback** (proposal Defect 1):
     `buildSessionGenPrompt` falls back to `options.tier ?? "full"`
     (`src/wizard/sessionGenPrompt.ts:99-104,131`), so post-reload prompt
     generation silently renders the exemplar as Full and invites a
     fabricated "per the operator's selection" rationale.
   Amplifier: the auto-opened static getting-started doc leads with a
   prominent Full-first section regardless of the choice
   (`src/providers/CustomSessionSetsView.ts:481-486`).
2. **Out-of-band verification doesn't complete itself.** The `Evaluate …`
   review prompts (`src/commands/copyPromptCommands.ts:87-161`) never
   instruct the reviewing engine to produce an output artifact, so
   path-aware engines "forget" to write `external-verification.md`; the file
   is created empty and templateless (`src/commands/externalVerification.ts:42`);
   the only "save the reply here" text is a close-time stderr warning
   (`ai_router/close_session.py:1665-1673`).
3. **Dedicated verification sessions "never happened."** Mode B
   (`verificationMode: dedicated-sessions`, Sets 057/062) appends typed
   sessions **only** when someone manually runs
   `start_session --type verification` (`ai_router/start_session.py:653-657`,
   `ai_router/session_state.py:925`); recording the mode appends nothing
   (`ai_router/dedicated_verification.py:271-332`). Nothing nudges the next
   session, the wizard never offers the mode, and the tier leak meant even
   `tier: lightweight` didn't reach generated specs. The machinery shipped;
   the on-ramp didn't.
4. **No visibility.** The Explorer renders set rows only — a verification
   session has no row/icon of its own; posture is compressed into `N/M+`,
   `v?`/`v+` markers and a hover tooltip (`src/utils/tierLegibility.ts:63-71,199-223`,
   `src/providers/SessionSetsModel.ts:73-93`).
5. **Python prerequisite is invisible at setup.** Staff did not realize
   Python must be installed first. (The operator's in-flight, uncommitted
   edit to `docs/templates/consumer-bootstrap/getting-started.md.template`
   adds a Troubleshooting appendix — this set lands it properly.)

### Audit findings this set must fix (pinned 2026-07-02)

| # | Finding | Where |
|---|---|---|
| A1 | Tier choice ephemeral: form state lost on webview teardown (no `setState`/`getState`; no `retainContextWhenHidden`) so the Full radio + Full-tier warning reassert after hide/reload; decomposition prompt falls back to Full; fabricated tier rationale; no durable marker | `media/session-sets-tree/client.js:45,156-165`, `src/extension.ts:121`, `media/session-sets-tree/gettingStartedHtml.js:233-250`, `src/wizard/sessionGenPrompt.ts:99-104,131`, scaffold path `buildProjectStructureNoPrompt` (`src/commands/gitScaffold.ts`) |
| A2 | `Evaluate …` prompts have no output-artifact instruction; `external-verification.md` created empty, no template | `src/commands/copyPromptCommands.ts:87-161`, `src/commands/externalVerification.ts:35-60` |
| A3 | external-verification soft gate keys off the raw `--no-router` CLI flag, not the resolved tier — a set that is Lightweight via `spec.md`/env skips the gate entirely | `ai_router/close_session.py:1657` vs `resolve_no_router_mode` caching at `:2088-2098`; `ai_router/runtime_mode.py:169-193` never consulted by the gate |
| A4 | Gate is presence-only — an empty file passes | `ai_router/close_session.py:1661` |
| A5 | `start_session` never surfaces an owed/pending verification from the prior session/set | `ai_router/start_session.py:553-844` |
| A6 | Mode-B close gate requires a different **engine**; a Copilot-locked shop (every session `--engine copilot`) can never pass even when the underlying model **provider** differs | `ai_router/dedicated_verification.py:816-973` (engine-set comparison at `:927-942`) |
| A7 | Explorer reads `verificationMode` from the spec seed, not the durable activity-log record — drift after a blessed A→B transition whose seed-alignment failed | `src/utils/fileSystem.ts:263-270,760-766` vs `ai_router/dedicated_verification.py:151-197` |
| A8 | Redundant double-gating when a dedicated-sessions set closes with `--no-router` (both the external-verification gate and the typed-session gate fire) | `ai_router/close_session.py:1657-1776` |
| A9 | Verification-kickoff prompt is a long 6-step inline script while the short Evaluate prompts omit the one load-bearing instruction — inverted complexity | `src/commands/copyPromptCommands.ts:186-222` |
| A10 | Python missing → no proactive check anywhere in the form; failure surfaces late as `spawn python ENOENT` folded into a warning summary; the friendly interpreter-failure explainer exists but is wired only to run/config paths | `src/utils/pythonInterpreter.ts:93-96` (no existence check), `src/utils/aiRouterInstall.ts:336-342` (ENOENT), `src/commands/gitScaffold.ts:344`, `src/utils/aiRouterInstall.ts:178-194` (`describeAiRouterImportFailure`, unused here); host D6 probe checks provider keys only (`src/utils/gettingStartedDetection.ts:144-171`) |
| A11 | Same-family incidentals: form `budget`/`zeroMethod` share the A1 persistence gap; `asTier` silently narrows unknown/case-variant values to `"full"`; structure-only scaffold hardcodes `verificationMode` to the default (would silently drop a new form selector); `switchTier` guardrail probes `set.root` while writing `set.specPath` | `media/session-sets-tree/client.js:45`, `src/commands/gitScaffold.ts:154-156`, `src/commands/gettingStartedActions.ts:83`, `src/utils/consumerBootstrap.ts:33,478`, `src/commands/switchTier.ts:72,88-89` |
| A12 | Lazy state synthesis misclassifies a freshly-authored (not-yet-started) set as **in-progress**: `read_status` → `ensure_session_state_file` → `_backfill_payload` infers "activity-log.json present ⇒ in-progress", but the modern authoring flow (quick-start) creates the empty `entries: []` log up front — so any router entry point that resolves the active set (e.g. bare `route()` → `is_no_router_mode` → `find_active_session_set`) materializes a bogus in-progress state file and the Explorer shows a set in flight nobody started. Reproduced live while authoring this very set (2026-07-02); remediated via the sanctioned `synthesize_not_started_state`. Fix: disambiguate on `entries` length (empty ⇒ not-started), preserving the legacy inference for logs with entries | `ai_router/session_state.py:2181-2206` (`ensure_session_state_file`), `_backfill_payload`, `ai_router/runtime_mode.py:184-188`, `ai_router/session_state.py:2156-2178` (the sanctioned bootstrap synth) |

Baseline (2026-07-02): `python -m pytest` → 2267 passed / 5 skipped / 1 failed
(`test_drift_guard.py::test_real_repo_passes_all_drift_checks`, `dist-in-sync`
— caused by the then-uncommitted template edit; **cleared at the set-authoring
commit**, which landed the template appendix and recompiled `dist/`, so the
set starts from a fully green suite). Extension `0.33.1`, `dabbler-ai-router`
`0.26.2`.

> **Pre-authoring adversarial critique.** The draft of this spec was routed
> for devil's-advocate review before finalization
> (`planning-critique-1-planning.md` in this directory — raw, unedited;
> Opus tier-3, $0.52). Verdict: SOUND-WITH-CHANGES; its material findings
> (M1–M6: provider-persistence confirmation + start-time guardrail,
> canonical-doc ensure-write for existing consumers, `switchTier`
> assignment, S4 de-scoping, record-over-seed shared precedence, tier-aware
> auto-opened doc) are folded into the features and sessions below.
> **Named limitation:** the second, non-Anthropic critique leg
> (`task_type: architecture`) failed twice on provider read-timeouts on
> 2026-07-02 and is **owed** — S1 re-runs it as part of its routed review
> and folds any material findings before implementation begins (the
> orchestrator-provider-critiques-itself asymmetry is real; L-064-6).

### Architecture decisions locked for this set

- **Typed verification sessions stay runtime-appended — never pre-authored
  into `spec.md` or pre-seeded into `session-state.json` at set creation.**
  The round count is unknowable up front (0–2+ remediation rounds; bounded
  loop), phantom pending sessions would violate the sessions-ledger
  invariants and the authored-count contract
  (`docs/session-state-schema.md` § per-session `type`), and the derived
  `awaiting-verification` state already *is* the "phantom session" — the fix
  is to **surface and auto-route into it** (S4/S5), not to persist it.
- **Cross-provider means provider, not IDE.** The Mode-B gate's purpose is
  independent review by a different model provider. Same engine + different
  provider (Copilot driving GPT-5.4 to verify work done under Copilot
  driving Claude) satisfies the property; the gate is extended, not
  weakened — same engine + same provider still fails (A6).
- **Prompts are pointers.** Copyable prompts reference canonical in-repo
  instructions and name their required output artifact; they do not inline
  multi-step procedures (A9). Consumer repos receive the canonical
  instruction file via the existing consumer-bootstrap template channel.
- **Fail-soft posture is preserved.** The out-of-band gate stays soft
  (interactive prompt / headless warn) but becomes content-aware and
  correctly keyed (A3/A4); the Q6 hard-block-in-TTY posture is unchanged.

### Non-goals

- No per-session child rows in the Explorer tree (set-level rows keep their
  contract; visibility improves via row description/markers/tooltips and
  prompt auto-routing). A full session-level tree is a future set if the
  surfaced markers prove insufficient.
- No change to Full-tier routed verification (Step 6 `api` path) beyond the
  shared gate-keying fix (A3 touches only the no-router branch).
- No consumer-repo file edits (the DABBLER_ env-prefix propagation and
  pilot-cohort enablement remain the separately-deferred consumer sweep).
- No B→A verification-mode transition (Set 062 lock stands).
- No new close-out gates. Everything lands inside existing gates' semantics.

---

## Feature 1: Tier truth chain (Defect 1 — A1, A11)

### Scope

- **Persist the form state across webview teardown** — `vscode.setState()`
  / `getState()` in `client.js` (tier **and** the same-family `budget` /
  `zeroMethod` fields, A11), and/or `retainContextWhenHidden` on the view
  registration — so hiding, re-expanding, or reloading never re-checks the
  Full radio or re-shows the Full-tier warning over a Lightweight pick.
- Persist the operator's tier choice at scaffold time as a durable marker
  (`.dabbler/tier`, beside the existing `.dabbler/install-method`), written
  by the same path that shapes the scaffold.
- `asTier` narrowing becomes case-insensitive and **fails loud on unknown
  values instead of silently defaulting to `"full"`** (A11).
- Every downstream consumer of "the tier" reads the marker first, then falls
  back to inference (absence of `ai_router/router-config.yaml` ⇒
  lightweight), then to the volatile radio: the session-set decomposition
  prompt (`copySessionSetGenPrompt` → `buildSessionGenPrompt`), the Getting
  Started form's own state after reload, and any completion/summary message
  that names the selected tier.
- `buildSessionGenPrompt` renders the worked exemplar and the
  "author each set with `tier: lightweight`" guidance from the true tier and
  **never** invites the planner to fabricate a "per the operator's selection"
  rationale it cannot know.
- A tier mismatch (marker vs. generated/active spec) surfaces as a tree
  advisory through the existing marker channel.

### Standards

- The marker is one word (`full` | `lightweight`), UTF-8, no BOM; a helper
  with the same read-precedence contract is shared by form + prompt paths
  and unit-tested at Layer 2.
- The `asTier` fail-loud applies only to the scaffold/form narrowing path
  (early, operator-visible); confirm no close-path or reader consumer can
  reach the throw.
- Regression fixtures: a Lightweight-scaffolded workspace whose generated
  decomposition prompt must contain `tier: lightweight` (the Set 076
  incident, replayed as a test).

## Feature 2: Getting Started — three-way verification choice and Python prerequisite (A10)

### Scope

- The form's tier step becomes a three-way choice the operator asked for:
  1. **Full** — router on, automatic cross-provider verification.
  2. **Lightweight + dedicated verification sessions** — router off; seeds
     `verificationMode: dedicated-sessions` into generated specs and the
     decomposition prompt.
  3. **Lightweight + out-of-band / none** — router off; seeds the default
     `verificationMode: out-of-band-or-none`.
  The choice is stored in the durable tier marker channel (tier +
  verification-mode seed) and threaded through spec generation.
  **Plug-in points (audited):** a Lightweight-only block in step 1 of
  `renderGettingStarted` (`media/session-sets-tree/gettingStartedHtml.js:238-251`),
  the mirror image of the Full-only budget block; a new rider on the
  `build-structure` message narrowed in `routeGettingStartedAction`
  (`src/commands/gettingStartedActions.ts`); carried through
  `structureOnlyContext` (`src/utils/consumerBootstrap.ts:478` currently
  hardcodes the default — A11) and into `buildSessionGenPrompt` so the
  generated specs actually declare it. Do **not** conflate with the
  Full-tier $0-budget `zeroMethod` radios — different concept.
- A **Python prerequisite check** on the form: a host-side `pythonPresent`
  probe analogous to the D6 provider-key probe (computed in
  `CustomSessionSetsView.buildGettingStarted()`, carried on
  `GettingStartedPayload`), rendered as a prominent step-1 warning when no
  interpreter resolves, with install guidance (python.org build,
  Add-to-PATH, avoid the Store build, or set
  `dabblerSessionSets.pythonPath`). Plus a pre-flight check in
  `buildProjectStructureNoPrompt` so a missing interpreter fails **before**
  venv creation with the friendly explainer
  (`describeAiRouterImportFailure` pattern) instead of
  `spawn python ENOENT` buried in a warning summary (A10).
- The Troubleshooting appendix in
  `docs/templates/consumer-bootstrap/getting-started.md.template`
  (Python-first install, AV-quarantined activate scripts, execution policy)
  **landed with the set-authoring commit** (with the `dist/` recompile that
  cleared the `dist-in-sync` drift failure); this session verifies it
  renders correctly and extends it if gaps show during the form work.
- **Tier-aware auto-opened doc (critique M6):** the getting-started doc the
  view auto-opens (`src/providers/CustomSessionSetsView.ts:481-486`) stops
  greeting a Lightweight operator with Full-first content — either render
  tier-conditionally from the durable marker or lead with an explicit
  "you chose Lightweight/Full" callout; the perceptual half of
  "still says Full" dies here.

### Standards

- The three-way choice maps onto existing schema fields only (`tier` +
  `verificationMode`); no new spec fields.
- Copy on the form must follow the tier-model SSoT
  (`docs/concepts/tier-model.md`) — link, don't paraphrase; the drift guard
  stays green.

## Feature 3: Out-of-band verification that completes itself (A2, A3, A4, A8, A9)

### Scope

- **Canonical instruction doc** — a short, engine-facing
  `docs/dabbler/cross-provider-verification.md` (generated into consumer
  repos via the consumer-bootstrap template channel, like `start-here.md`)
  that tells a path-aware reviewing engine: what to read, the review stance,
  the verdict grammar (`VERIFIED` / `ISSUES_FOUND` + severities), and the
  **required output**: write the verdict to
  `docs/session-sets/<slug>/external-verification.md` (UTF-8), append-only,
  one dated section per round. It also carries the Copilot-locked Mode-A
  recipe explicitly: open a *second* chat and switch the model picker to a
  different provider than the one that did the work.
- **No dangling pointers for the installed base (critique M2):** the
  extension **ensure-writes/refreshes** the canonical doc into the
  workspace idempotently *before* emitting any pointer prompt (the
  `start-here.md` generated-never-hand-edited pattern), so the three
  existing consumer repos get the doc on first use after upgrading the
  extension — no re-bootstrap required. The prompt also carries a one-line
  fallback instruction for the pathological missing-doc case.
- **Pointer prompts** — `buildSpecReviewPrompt` / `buildSessionAccomplishmentsPrompt`
  / `buildSetAccomplishmentsPrompt` open with the pointer to that doc and
  close with the one non-negotiable line: the engine itself writes
  `external-verification.md` (path spelled out). Prompt bodies shrink; the
  operator-criteria trailer (`docs/review-criteria/*`) is preserved.
- **Template the artifact** — `openExternalVerificationDoc` seeds a minimal
  header (set, date, round, verdict-pending) instead of an empty file.
- **Gate correctness** —
  - key the external-verification gate off the resolved runtime mode
    (`is_no_router_mode()` / the cached resolution), not the raw
    `args.no_router` flag (A3);
  - make it content-aware but still soft: empty file or no recognizable
    verdict line ⇒ same soft prompt/warn as absence today (A4);
  - when the set's recorded `verificationMode` is `dedicated-sessions`, the
    external-verification gate stands down — the typed-session gate is the
    authority (A8). The stand-down keys off
    `dedicated_verification.read_verification_mode(...)` — the durable
    record, which already prefers activity-log over spec seed — so once S5
    gives the Explorer the same precedence (A7), gate and UI derive the
    mode from the same source and cannot disagree (critique M5);
  - fix the lazy-synth misclassification (A12): `_backfill_payload`
    disambiguates on activity-log `entries` length (empty ⇒ not-started),
    with a regression test replaying the authored-today/started-tomorrow
    flow; legacy inference (entries present ⇒ in-progress) unchanged.

### Standards

- Verdict-line grammar shared with the Mode-B artifacts where sensible;
  parser lives in `ai_router` with unit tests; the extension never parses
  verdicts itself.
- All writes UTF-8; ASCII-only console output (project convention).

## Feature 4: The next session notices unfinished verification (A5)

> Lands in **Session 5** (critique M4 de-scoped Session 4 to Feature 3
> only; this feature rides with the other owed-state surfacing work).

### Scope

- `start_session` (work sessions, both tiers, no-router-aware) gains a
  **pending-verification banner**: when the set (or, for a new set in the
  same repo, the most recently completed set) closed with
  `verificationVerdict: null` and no recorded external verification — or a
  Mode-B set derives to `awaiting-verification` / `awaiting-remediation` —
  print a loud, ASCII, non-blocking banner naming the exact next action
  (the file to write, or the `start_session --type verification` command,
  or "review and respond to external-verification.md round N").
- The banner is advisory (never blocks a start); headless output identical.

### Standards

- Derivation reuses `dedicated_verification.derive_workflow_state(...)` and
  the existing readers — no new persisted state (Set 047 derive rule).
- Unit tests per state (owed / in-flight / verified / opt-out) on both
  tiers; a no-router fixture proves the banner fires without router config.

## Feature 5: Mode B reachable, visible, and Copilot-fit (A6, A7, A9)

### Scope

- **Gate (A6):** `validate_dedicated_verification` accepts a verification
  session whose `orchestrator` differs from every work session by engine
  **or by provider**. Same engine + same provider still fails, and a
  session with **no recorded provider** cannot satisfy the
  provider-difference arm (missing data fails closed, mirroring the
  existing no-work-engine-baseline posture). Doc the sanctioned
  single-engine pattern (Copilot model picker:
  `--engine copilot --provider openai` verifying work done under
  `--engine copilot --provider anthropic`) in the workflow doc's Mode B
  section and the consumer `AGENTS.md` tail.
- **Start-time guardrail (critique M1):** `start_session --type
  verification` **refuses at start** (fail-loud, before any write) when
  the declared `(engine, provider)` pair matches every work session's
  pair, printing the sanctioned model-picker pattern inline — the
  cross-provider property is enforced where the operator can still fix it,
  not only at close. S1 hard-confirms the `orchestrator.provider` field is
  persisted per session by the existing writers (omit-null caveat) before
  this session builds on it; the declared provider remains self-attested
  bookkeeping (the framework's existing posture for engine/model/effort) —
  the guardrail narrows honest mistakes, not adversarial mislabeling.
- **Explorer drift (A7):** the marker/action derivation prefers the durable
  activity-log `verification_mode` / `verification_mode_change` record and
  falls back to the spec seed only when no record exists.
- **Auto-routing (with A9):** when a Mode-B set derives to
  `awaiting-verification`, the row's **Start Next Session** copy action
  yields the verification kickoff (pointer-style, rewritten per Feature 3's
  prompt standard) instead of a work-session prompt; `awaiting-remediation`
  yields the remediation handoff prompt. The Explorer row description says
  so in words (`verification owed`, `remediation owed`), not only `v+`.

### Standards

- Gate change is additive and fully covered in
  `test_dedicated_verification_close_gate.py` (new provider-differs cases,
  same-engine-same-provider still-fails case).
- Marker precedence (record > seed) unit-tested at Layer 2 against fixture
  activity logs, including the failed-seed-alignment drift case.

## Feature 6: Review, hardening, UAT, release

### Scope

- A routed comprehensive review (S1) over the surfaces this set touches and
  the mission-critical path (wizard, prompts, state writers, gates,
  Explorer derivation), plus the full three-layer suite, producing a
  structured findings artifact that feeds S2–S5 scopes.
- End-of-set: ad-hoc per-set UAT on a locally built VSIX using
  `npm run make-uat-workspace` plus a fresh-scaffold walk of all three
  setup choices (including one Copilot-persona walk of the Lightweight
  out-of-band round-trip); the `required` path-aware critique; coordinated
  releases (`dabbler-ai-router` 0.27.0, extension 0.34.0) via the tag-driven
  workflows.
- **Operator prerequisite for the release session:** renew `VSCE_PAT`
  (expired 2026-05-28) in the repo environment before the `vsix-v0.34.0`
  tag push, or the Marketplace publish fails; staff can sideload the
  UAT-approved local VSIX if renewal lags.

---

## Sessions

### Session 1 of 6: Comprehensive review baseline and triage

**Steps:**
1. Register session start; read guidance docs (Step 0 set).
2. Run the full pass: `python -m pytest`; `npx tsc --noEmit && npm run
   test:unit`; `npm run test:playwright`. Record exact counts as the set's
   conventions-block baseline.
3. Route `code-review` over the audit surfaces: `src/wizard/**`,
   `src/commands/copyPromptCommands.ts`, `src/commands/externalVerification.ts`,
   `src/commands/setupVerification.ts`, `src/utils/{fileSystem,tierLegibility}.ts`,
   `src/providers/{SessionSetsModel,ActionRegistry,CustomSessionSetsView}.ts`,
   `ai_router/{start_session,close_session,dedicated_verification,session_state,runtime_mode}.py`.
   Split bundles rather than truncate. Include the **owed second critique
   leg** of this spec (`task_type: architecture`, non-Anthropic — see the
   pre-authoring-critique note above): save it raw as
   `planning-critique-2-architecture.md` and fold material findings before
   S2 begins.
4. Triage: confirm each A1–A12 against code; **hard-confirm that
   `orchestrator.provider` is persisted per session by the existing
   writers** (omit-null caveat — the A6/S5 gate change builds on it;
   if absent, S5's scope grows to record it and this spec is amended);
   classify every new finding (fix-inline / fold-into-S2–S5 /
   defer-with-reason). Fix inline only mechanical, <50-line items.
5. Write the structured findings artifact; update this spec's session
   Touches lists if the review moved scope; verify and close.

**Creates:** `s1-review-findings.md` (+ `s1-issues.json` if the verifier
finds issues)
**Touches:** at most small inline fixes; spec Touches-list updates
**Ends with:** three-layer baseline recorded; every A-finding confirmed or
amended with evidence; S2–S5 scopes confirmed against triage; session
verified and closed.
**Progress keys:** `s1.baseline`, `s1.review-routed`, `s1.triage`, `s1.closed`

### Session 2 of 6: Tier truth chain (Feature 1)

**Steps:**
1. Fix webview state persistence: `vscode.setState()`/`getState()` for
   `gsState` (tier, budget, zeroMethod) in `client.js`; evaluate
   `retainContextWhenHidden` on the view registration as belt-and-braces.
2. Write the durable tier marker at scaffold time; add the shared
   read-precedence helper (marker → router-config inference → volatile UI).
3. Re-point `copySessionSetGenPrompt` / `buildSessionGenPrompt` at the
   helper; remove the `?? "full"` fallback and the fabricated-rationale
   invitation; make `asTier` case-insensitive and loud on unknowns.
4. Add the tier-mismatch tree advisory (marker vs. active spec); fix the
   `switchTier` guardrail path coupling (probe the same path the write
   targets — A11) with a Layer-2 test.
5. Layer-2 tests: state survives simulated teardown/re-render; marker
   precedence; prompt regression (Lightweight workspace ⇒
   `tier: lightweight` exemplar + guidance line); refresh UAT-matrix
   fixtures if touched. Full pass; verify; close.

**Creates:** tier-marker helper + tests; regression fixture
**Touches:** `media/session-sets-tree/client.js`,
`media/session-sets-tree/gettingStartedHtml.js`, `src/extension.ts` (view
registration), `src/wizard/sessionGenPrompt.ts`,
`src/commands/copyPromptCommands.ts` (gen-prompt entry),
`src/commands/{gitScaffold,gettingStartedActions,switchTier}.ts` (`asTier`,
scaffold marker write, guardrail path), `src/utils/fileSystem.ts`
(advisory), Layer-2 suites
**Ends with:** a Lightweight choice survives hide/reload/window reopen into
every downstream surface (radio, warning, prompt, scaffold, summary);
regression tests lock it; suites green.
**Progress keys:** `s2.persistence`, `s2.marker`, `s2.prompt-truth`,
`s2.advisory`, `s2.closed`

### Session 3 of 6: Getting Started three-way choice and Python prerequisite (Feature 2)

**Steps:**
1. Extend the form's tier step to the three-way choice: Lightweight-only
   `verificationMode` block in step 1 (mirror of the Full-only budget
   block), a new `build-structure` rider narrowed in
   `routeGettingStartedAction`, carried through `structureOnlyContext`
   (replacing the `consumerBootstrap.ts:478` hardcode) and into
   `buildSessionGenPrompt` output (spec exemplar gains `verificationMode:`
   when Lightweight).
2. Add the `pythonPresent` host probe + step-1 warning (D6-probe pattern);
   add the `buildProjectStructureNoPrompt` pre-flight with the friendly
   interpreter-failure explainer; copy links to the tier-model SSoT and the
   Troubleshooting doc.
3. Verify the Troubleshooting appendix (landed at the set-authoring
   commit) renders correctly; extend it if the form work exposes gaps;
   confirm `dist-in-sync` and the full drift guard stay green.
4. Make the auto-opened getting-started doc tier-aware (M6): the operator's
   durable tier choice leads, no Full-first greeting on a Lightweight pick.
5. Layer-2 + Layer-3 coverage for the new form step and warning states.
   Full pass; verify; close.

**Creates:** form step + warning UI; `pythonPresent` probe; template
appendix landed
**Touches:** `media/session-sets-tree/{gettingStartedHtml,client}.js`,
`src/types/sessionSetsWebviewProtocol.ts`,
`src/commands/{gettingStartedActions,gitScaffold}.ts`,
`src/providers/CustomSessionSetsView.ts` (payload build),
`src/utils/{consumerBootstrap,pythonInterpreter,aiRouterInstall,gettingStartedDetection}.ts`,
`src/wizard/sessionGenPrompt.ts`,
`docs/templates/consumer-bootstrap/getting-started.md.template`,
Layer-2/3 suites
**Ends with:** all three setup choices produce correctly-seeded scaffolds
and prompts; missing Python is loud in the form and fails friendly at
build; drift guard green.
**Progress keys:** `s3.three-way`, `s3.python-warning`, `s3.template`, `s3.closed`

### Session 4 of 6: Out-of-band self-completing verification (Feature 3)

**Steps:**
1. Author `docs/dabbler/cross-provider-verification.md` (canonical,
   engine-facing, incl. the Copilot second-chat/model-picker recipe) +
   consumer-bootstrap template rendering + the extension's idempotent
   ensure-write before any pointer prompt is emitted (M2 — the installed
   base gets the doc without re-bootstrap).
2. Rewrite the three Evaluate prompts pointer-style with the mandatory
   write-the-artifact close and the missing-doc fallback line; template
   `external-verification.md` on create.
3. Fix gate keying to the resolved runtime mode (A3); add the soft
   content-awareness (A4); stand the gate down under recorded
   `dedicated-sessions` via `read_verification_mode` (A8/M5);
   verdict-line parser + tests in `ai_router`.
4. Fix the lazy-synth misclassification (A12): empty-`entries[]` activity
   log ⇒ not-started, with the authored-today regression test.
5. Full pass; verify; close.

**Creates:** canonical verification doc + template + ensure-write; verdict
parser + tests
**Touches:** `src/commands/copyPromptCommands.ts`,
`src/commands/externalVerification.ts`, `ai_router/close_session.py`,
`ai_router/session_state.py` (`_backfill_payload`),
`ai_router/runtime_mode.py` (read path only),
`docs/templates/consumer-bootstrap/`, pytest suites
**Ends with:** a pasted Evaluate prompt ends in the engine itself writing a
well-formed `external-verification.md` — in old and new consumer repos
alike; a spec-declared Lightweight set gets the soft gate (A3 closed); an
authored-but-unstarted set reads not-started everywhere (A12 closed).
**Progress keys:** `s4.canonical-doc`, `s4.prompts`, `s4.gates`,
`s4.lazy-synth`, `s4.closed`

### Session 5 of 6: Verification owed — every surface says so (Features 4–5)

**Steps:**
1. Extend `validate_dedicated_verification` to engine-or-provider
   difference (missing provider fails the provider arm closed); keep
   same-engine+same-provider failing; add the start-time
   same-`(engine,provider)` refusal in `start_session --type verification`
   (M1); extend `test_dedicated_verification_close_gate.py` + start-time
   tests.
2. Explorer mode derivation prefers the durable activity-log record over
   the spec seed (A7) with Layer-2 fixture coverage including the drift
   case — the TS mirror of the `read_verification_mode` precedence S4's
   gate uses (M5).
3. Add the `start_session` pending-verification banner (Feature 4) with
   per-state unit tests on both tiers, incl. a no-router fixture.
4. Auto-route the Start Next Session copy action by derived state
   (verification/remediation kickoff, pointer-style per Feature 3);
   row description gains the words `verification owed` / `remediation owed`.
5. Doc the single-engine (Copilot model picker) cross-provider pattern in
   the workflow doc Mode B section + consumer `AGENTS.md` tail template.
   Full pass (Layer 3 included — Explorer rendering changed); verify;
   close.

**Creates:** gate + guardrail + banner + Explorer tests; workflow-doc +
template additions
**Touches:** `ai_router/dedicated_verification.py`,
`ai_router/start_session.py`,
`src/utils/{fileSystem,tierLegibility}.ts`, `src/providers/{SessionSetsModel,ActionRegistry,CustomSessionSetsView}.ts`,
`src/commands/copyPromptCommands.ts`, `docs/ai-led-session-workflow.md`,
`docs/templates/consumer-bootstrap/engine-file.agents-tail.md`
**Ends with:** a Copilot-locked team can run Mode B end-to-end and pass the
gate on provider difference (and cannot start a same-pair verification by
accident); the Explorer tells the truth after A→B drift; an owed
verification is named out loud at the next `start_session` and is one copy
action away in every owed state.
**Progress keys:** `s5.gate`, `s5.guardrail`, `s5.drift`, `s5.banner`,
`s5.autoroute`, `s5.docs`, `s5.closed`

### Session 6 of 6: UAT, path-aware critique, and coordinated release

**Steps:**
1. Build the VSIX locally (`npx vsce package`); install locally.
2. Author and walk the ad-hoc per-set UAT checklist
   (`077-lightweight-tier-ux-and-copilot-hardening-uat-checklist.json`):
   `make-uat-workspace` matrix walk + fresh-scaffold walks of all three
   setup choices + one Copilot-persona Lightweight out-of-band round-trip
   (prompt → engine writes artifact → gate → next-session banner) + the
   Mode-B single-engine gate pass. Operator attests.
3. Run the required end-of-set path-aware critique (≥2 providers) over the
   set's changes; adjudicate findings per the workflow; save
   `path-aware-critique.json`.
4. CHANGELOGs; bump `dabbler-ai-router` → 0.27.0 and extension → 0.34.0;
   update `docs/repository-reference.md` version walk; refresh
   `router-config.yaml` `metadata.pricing_reviewed` (stale-price warning
   observed 2026-07-02); confirm `VSCE_PAT` renewed (operator action).
   Record the rollback escape hatch in the change-log: pin back to
   extension `0.33.1` / router `0.26.2` if a hotfix-grade defect surfaces
   during the mission-critical week.
5. Commit, push, green `Test` run; operator-authorized tag pushes
   (`v0.27.0`, `vsix-v0.34.0`); confirm both publish workflows; change-log;
   close set.

**Creates:** UAT checklist + attestation, `path-aware-critique.json`,
`change-log.md`, two releases
**Touches:** `pyproject.toml`, `tools/dabbler-ai-orchestration/package.json`,
both CHANGELOGs, `docs/repository-reference.md`
**Ends with:** UAT attested on the local build; critique gate satisfied;
0.27.0 on PyPI and 0.34.0 on the Marketplace/Open VSX (or, if `VSCE_PAT`
renewal is pending, the local VSIX is handed to staff and the tag push is
queued); set closed.
**Progress keys:** `s6.uat`, `s6.critique`, `s6.versions`, `s6.release`, `s6.closed`

---

## End-of-set deliverables

- Tier truth chain: durable marker, truthful prompts/messages, mismatch
  advisory, regression fixtures (Defect 1 closed).
- Getting Started: three-way setup choice seeding `tier` +
  `verificationMode`; Python prerequisite warning; Troubleshooting template
  landed; drift guard green.
- Out-of-band verification: canonical instruction doc (also templated to
  consumers), pointer prompts with a mandatory write-the-artifact close,
  templated `external-verification.md`, content-aware and correctly-keyed
  soft gate, no redundant double-gate.
- `start_session` pending-verification banner on both tiers.
- Mode B: engine-or-provider gate (Copilot-locked shops pass on provider
  difference), Explorer reads the durable mode record, owed-state
  auto-routing of the next-session prompt, documented single-engine
  pattern.
- Review artifacts: S1 findings, per-session verifications, end-of-set
  multi-provider path-aware critique.
- Releases: `dabbler-ai-router` 0.27.0 (PyPI), extension 0.34.0
  (Marketplace + Open VSX), UAT-attested on a local VSIX first.
