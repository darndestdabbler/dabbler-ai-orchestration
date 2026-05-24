# Session 6 — UI audit findings (orchestrator-agnostic sweep)

**Date:** 2026-05-23
**Scope:** `tools/dabbler-ai-orchestration/` source + media + package
contributions. Tests + dist/ + out/ + CHANGELOG.md excluded (CHANGELOG
is historical; tests are pinned by the code under audit).

---

## TL;DR

The headline finding reframes the spec's three dispositions:
**the per-row accordion that owned the "install Claude Code hook"
empty-state was already retired in Set 034.** `CustomSessionSetsView.buildRow`
ships `accordionHtml: null` on every row, and `client.js:renderRow`
emits only name / fraction / description — no accordion body, no empty
state, no CTA. The `OrchestratorAccordion.ts` + `detectOrchestrators.ts`
modules are orphan source preserved for "possible future re-enable."

The operator's questions answer themselves under the current runtime:

> "I don't need to install a Claude Code hook. Also, what if I am using
> Copilot exclusively? The gauges will still work. Correct? There
> should be no message about signals or Claude Code hooks. Correct?"

— **already true at runtime.** The CTA, the gauges, and the "No signal"
text are all unreachable from the rendering surface.

What the audit actually surfaces is therefore not a refactor question
but a **cleanup question**: keep the orphan source under the "future
re-enable" comment, or delete it now (the YAGNI argument).

---

## Findings catalog

### F1 — Orphan empty-state CTA + accordion machinery (HIGH PRIORITY)

| Location | Current | Disposition |
|---|---|---|
| [`OrchestratorAccordion.ts:306-309`](../../../tools/dabbler-ai-orchestration/src/providers/OrchestratorAccordion.ts#L306-L309) | `DEFAULT_CTA = { commandId: "dabbler.installOrchestratorHook.claudeCode", label: "install Claude Code hook" }` | Orphan since Set 034 — no live render path |
| [`OrchestratorAccordion.ts:311-323`](../../../tools/dabbler-ai-orchestration/src/providers/OrchestratorAccordion.ts#L311-L323) | `renderAccordionEmpty()` emits `<span>No signal — </span><button>install Claude Code hook</button>` | Orphan — only caller is `renderAccordionBody`, itself orphan |
| [`OrchestratorAccordion.ts:409-414`](../../../tools/dabbler-ai-orchestration/src/providers/OrchestratorAccordion.ts#L409-L414) | `renderAccordionBody()` dispatcher | Orphan — only callers are tests |
| [`OrchestratorAccordion.ts:334-403`](../../../tools/dabbler-ai-orchestration/src/providers/OrchestratorAccordion.ts#L334-L403) | `renderAccordionLoaded()` (gauges + sublabels) | Orphan — only callers are tests |
| [`OrchestratorAccordion.ts:451-...`](../../../tools/dabbler-ai-orchestration/src/providers/OrchestratorAccordion.ts#L451) | `accordionStateFromOrchestratorBlock()` adapter | Orphan — only callers are tests |
| [`OrchestratorAccordion.ts:56-65`](../../../tools/dabbler-ai-orchestration/src/providers/OrchestratorAccordion.ts#L56-L65) | `EmptyCta` interface (re-exported) | Orphan — only import outside the file is `detectOrchestrators.ts` (itself orphan) |
| [`detectOrchestrators.ts` entire file](../../../tools/dabbler-ai-orchestration/src/providers/detectOrchestrators.ts) | `pickEmptyStateCta()`, `CLAUDE_CTA`/`CODEX_CTA`/`GEMINI_CTA`/`COPILOT_CTA`, `claudeCodeInstalled()`/etc. | Orphan — only callers outside the file are tests |
| [`media/session-sets-tree/tree.css:307-323`](../../../tools/dabbler-ai-orchestration/media/session-sets-tree/tree.css#L307-L323) | `.acc-empty`, `.acc-empty-cta`, `.acc-empty .grey-gauges` rules | Orphan — DOM elements never emitted |
| [`media/orchestrator-indicator/indicator.css:264-...`](../../../tools/dabbler-ai-orchestration/media/orchestrator-indicator/indicator.css#L264) | `.empty-state .grey-gauges` (orphan from Set 035) | Already-stranded per Set 036 Session 3 step 5 deferral |

**Live caller check:** `grep -rn "OrchestratorAccordion\|detectOrchestrators\|renderAccordion\|pickEmptyStateCta" src/ --include='*.ts' | grep -v test/` returns zero non-orphan callers:

- `CustomSessionSetsView.ts` references both modules in COMMENTS only (the import statements were removed in Set 034)
- `inProgressSetsService.ts` imports the `Recommendation` *type* from `OrchestratorAccordion.ts` — this is a non-rendering type re-export and survives any cleanup

### F2 — Broken Playwright test pinning the orphan surface

[`session-sets-tree.spec.ts:243-272`](../../../tools/dabbler-ai-orchestration/src/test/playwright/session-sets-tree.spec.ts#L243-L272) — the
`empty-state CTA falls back to Claude installer when no orchestrators
detected` scenario asserts `.acc-empty-cta` is visible and matches
`/No signal/`. Per `client.js:241-267` no accordion body renders on
any row, so this test is asserting against an element that does not
exist. **This is the test step 5 of the session spec already calls out
for update** — but the disposition is more aggressive than "rewrite":
the scenario itself has no live surface to pin and should be deleted.

### F3 — Engine-specific copy in live user-facing surfaces

| Location | Copy | Verdict |
|---|---|---|
| [`package.json:217`](../../../tools/dabbler-ai-orchestration/package.json#L217) | `"Install Orchestrator Hook (Claude Code)"` | KEEP — Claude-Code-specific command title; the only orchestrator with an auto-install hook. Parity row exists for Gemini (line 222) and Copilot (line 227); the Claude title is correctly engine-specific because the command IS engine-specific. |
| [`package.json:67`](../../../tools/dabbler-ai-orchestration/package.json#L67) (viewsWelcome) | `"...a fresh AI chat (Claude Code, Gemini Code Assist, or any GPT-based tool)..."` | KEEP — names all three; parity, not Claude-specific. |
| [`copyAdoptionBootstrapPrompt.ts:16`](../../../tools/dabbler-ai-orchestration/src/commands/copyAdoptionBootstrapPrompt.ts#L16) | `"Copied. Paste into any AI chat (Claude Code / Gemini / GPT)..."` | KEEP — same parity pattern. |
| [`wizard.html:103`](../../../tools/dabbler-ai-orchestration/webview/wizard.html#L103) | `ANTHROPIC_API_KEY` listed first in `or` enumeration | KEEP — alphabetical-ish, all three listed. |
| [`wizard.html:113`](../../../tools/dabbler-ai-orchestration/webview/wizard.html#L113) | `Anthropic pricing →` link | MINOR — the link target is Anthropic-specific; other operators get no equivalent. Acceptable variance (the "Cost reality" callout's example pricing only needs one anchor). Filed as follow-on if a parity-list emerges later. |

### F4 — Engine-specific copy in installer-shim file headers

| Location | Copy | Verdict |
|---|---|---|
| `installOrchestratorHookCopilot.ts:1-30` | File header documents the Claude-Code-as-sole-auto-detect status in context | KEEP — accurate technical documentation in a Copilot-specific file; not user-facing |
| `installOrchestratorHookGemini.ts:1-30` | Same | KEEP — same reasoning |
| `installOrchestratorHookClaudeCode.ts` (entire file) | Claude-Code-specific by file scope | KEEP |
| `claude-session-start-invoker.js` (entire file) | Claude-Code-specific by file scope | KEEP |

### F5 — Engine-specific copy in retired/comment-only surfaces

- `detectOrchestrators.ts:1-9, 25, 55, 124` — module-level comments
  mention "install Claude Code hook" and "the Claude Code installer."
  Resolves as orphan code per F1.
- `OrchestratorAccordion.ts:58, 301-309` — same. Resolves as orphan.

---

## Disposition: F1 + F2 cleanup

The spec offered three pre-canned dispositions:

> **(a) Neutral copy + smart-CTA only** — replace `DEFAULT_CTA` with
> engine-neutral language; CTA becomes *Check Out As…*
>
> **(b) Retire the empty-state entirely** — if the writer guarantees
> the orchestrator block is populated whenever a set is in-progress,
> the `kind: "empty"` branch is unreachable in normal operation;
> replace with a one-line diagnostic.
>
> **(c) Status quo + label fix** — rephrase "install Claude Code hook"
> to "configure orchestrator" (engine-neutral verb); behaviorally
> unchanged from v0.18.x.

**Post-audit reframe.** All three assume the empty-state still
renders. It doesn't — Set 034 already executed disposition (b) at the
*runtime* level by setting `accordionHtml: null` on every row. The
question on the table is whether to follow through and delete the
*orphan source* now.

The architecture landscape post-Set 036:

1. **Set 033 H2 + H1** — `start_session` is the sole writer; the
   orchestrator block is populated whenever `status === "in-progress"`
2. **Set 036 S1 Q5** — the per-set lifecycle lock + dual-acquire
   protect any hand-edit/migration window from leaving an
   `in-progress` set with `orchestrator: null`
3. **Set 034** — `CustomSessionSetsView.buildRow` ships
   `accordionHtml: null` on every row; `client.js:renderRow` ignores
   it

The empty-state's only conceivable consumer (the per-row accordion)
is dead at the rendering surface AND the source-of-truth invariant
makes the "no orchestrator block" case impossible in any properly
operated workspace. The "future re-enable" justification in the
Set-034 comment ages poorly as the gap from retirement grows — any
future re-enable will need to be re-designed against then-current
schema (chatSessionId, lifecycle lock, etc.) and recovering this
specific frozen-as-of-Set-034 implementation is not a real path.

**Locked disposition: delete the orphan source.** Specifically:

1. `detectOrchestrators.ts` — DELETE the file
2. `OrchestratorAccordion.ts` — keep only `Recommendation` type
   (used by `inProgressSetsService.ts`) + `describeMarker` and
   related helpers if they're imported elsewhere. Delete:
   `DEFAULT_CTA`, `EmptyCta` interface, `renderAccordionEmpty`,
   `renderAccordionBody`, `renderAccordionLoaded`,
   `accordionStateFromOrchestratorBlock`, all gauge-rendering helpers
   that have no non-test caller, the `RenderState` type, the
   `OrchestratorMarker` type if unused outside the module
3. `detectOrchestrators.test.ts` — DELETE
4. `tree.css:307-323` — DELETE the `.acc-empty*` rules
5. `indicator.css:264-...` — DELETE the orphan `.grey-gauges` rule
6. `session-sets-tree.spec.ts:243-272` — DELETE the empty-state test

**Mitigation for the cost of re-implementation.** The git history at
`tools/dabbler-ai-orchestration/src/providers/OrchestratorAccordion.ts`
at tag `v0.18.x` preserves the full implementation. A future re-enable
fetches from history rather than from a frozen-and-rotting source
tree. This is the standard YAGNI cleanup pattern and is consistent
with how Set 036 Session 3 retired the codex config-toml watcher
(deleted the file entirely; relied on git history for any future
reference).

**Operator visibility of the cleanup.** No user-facing copy changes;
the surface is already gone. CHANGELOG entry for 0.19.0 mentions the
source cleanup so future readers don't go looking for the orphan
modules.

---

## Decision-time consensus deferral

The spec called for a brief cross-provider consensus check on the
disposition (gemini-pro + gpt-5-4). With the headline finding flipping
the question from "refactor (a/b/c)" to "delete the orphan source,"
the disposition is mechanical rather than judgment-laden, and the
prerequisites for cross-provider consensus (per [[feedback_prefer_ai_consensus_over_human_prompt]]
+ the workflow doc's Decision-time consensus pointer) are
under-applicable.

[[feedback_ai_router_usage]] restricts mid-session API calls; routing
for what is now a documentation-flag question rather than an
architecture decision would breach that restriction. The audit
findings + the locked disposition are surfaced to the operator
verbatim instead, with the option to redirect to (a) or (c) (neither
of which is reachable from the live render path) if the operator's
intent was specifically to retain the surface as feature-flagged.

---

## Cross-references

- [[project_set_034_closed]] — Set 034's per-row accordion retirement
- [[feedback_ai_router_usage]] — mid-session API restriction
- [[feedback_prefer_ai_consensus_over_human_prompt]] — when to route
  for consensus vs. ask
- Set 033 H2 — orchestrator block populated by `start_session`,
  cleared by `close_session`
- Set 036 S1 Q5 — per-set lifecycle lock keeps the block invariant
  tight across migration windows
