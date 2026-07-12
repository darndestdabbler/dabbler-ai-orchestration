# Change Log — Set 092: Work Explorer Single-Dialect Renderer (Work Explorer redesign — Set B)

**Set:** `092-work-explorer-single-dialect-renderer` · **Sessions:** 2 · **Tier:** Full
**Closed:** 2026-07-11 · **Verdict:** VERIFIED (S1: 3 rounds; S2: 2 rounds — details below)

## What this set did

Switched the Session Set Explorer to **one rendering dialect** — the
WAI-ARIA module → status-bucket → row tree — for every repo state,
deleting the legacy implicit flat view (the Set 087 S2 ARIA deferral,
resolved **by deletion**), renamed the contributed view to **Work
Explorer** (view ID unchanged), and added the persistent fault-only
**System Status strip** plus the `docs/modules.yaml` render guardrails
(pinned invalid banner, per-root last-known-good rendering). All
Playwright pins, testids, fixtures, docs, and screenshots moved
atomically with the renderer switch (amendment 6). **No Marketplace
publish out of this set** — single release boundary after Set 094; UAT
runs against the locally built, untracked 0.41.0 VSIX.

### Session 1 — the renderer switch (one dialect, Work Explorer, atomic pins)

- Host snapshot pipeline consumes Set 091's `computeVisibleModules`
  per root with a pure global merge/payload adapter — `buildModules`
  always yields ≥1 module (declared → undeclared-slug fallback groups →
  pseudo-module).
- Webview client: the implicit-only flat branch is **deleted**; every
  repo state renders module → bucket → row with stable
  `data-testid` markers and conformant `aria-level`/roles. The sole
  pseudo-module renders as an auto-expanded, visually muted `Default`
  header (adjudication B); fallback groups carry a visible warning
  affordance; `Unassigned` follows the Set 091 naming semantics.
- `duplicateNameError` affordance: flagged-winner row badge + tooltip,
  at most one throttled notification per fresh cache cycle (the
  inherited 087 S1→S3 deferral, closed here).
- Rename: contributed label → **Work Explorer**, view ID
  `dabblerSessionSets` unchanged; README/onboarding strings and the
  hero screenshot regenerated.
- Operator UAT: all three substantive walks passed and were saved to
  the set checklist.

### Session 2 — diagnostics strip + modules.yaml render guardrails

Started by github-copilot/openai gpt-5.4 (high); resumed and closed by
claude-code/anthropic claude-fable-5 (medium) per the routed
recommendation — the mid-session checkpoint is recorded in
`ai-assignment.md`.

- **System Status strip** (`media/session-sets-tree/systemStatusHtml.js`,
  typed `SystemStatusPayload`): a persistent, fault-only strip rendered
  above BOTH the Getting Started form and the tree. Relocated there from
  the form: the provider-key warning (direct-API only), the Python
  probe, the Copilot-CLI probe (Copilot seat only), and
  workspace-initialization faults. The form's inline warning builders
  (`envWarningHtml` / `pythonWarningHtml` / `copilotWarningHtml`), their
  copy constants, and the `gs-warning` CSS were **removed** (prefer
  removal); READMEs updated to describe the strip.
- **Manifest guardrails:** an invalid `docs/modules.yaml` pins a loud
  strip fault naming the parse failure and the retention state — and the
  explorer keeps rendering the **per-root last-known-good** snapshot
  (`chooseRenderableModuleSnapshot`, pure + falsifier-tested) so a bad
  hand-edit can never blank the tree. The file is NEVER auto-written.
  Absent / valid-empty manifests stay healthy compat states (no fault,
  snapshot replaced). `docs/modules.yaml` joined the workspace watcher
  so edit → invalidate → repair updates render without waiting for the
  poll.
- **Verification-driven fix (S2 R1 Major):** the strip originally
  rendered from pre-seed `gsState` on the first getting-started paint,
  so a durable Lightweight seed could flash a false provider-key fault.
  The strip now renders only after the durable tier/profile seed is
  applied, list mode renders from the host's durable snapshot fields,
  and a source-ordering pin in `systemStatusHtml.test.ts` guards the
  class. The fault test also pins the literal operator-facing fault
  copy the UAT walks quote.
- Coverage: `systemStatusHtml.test.ts` (6 tests), relocation suites in
  `gettingStartedHtml.test.ts`, the `chooseRenderableModuleSnapshot`
  falsifier in `visibleModules.test.ts`, and a real-webview Playwright
  walk (`module-tier.spec.ts`) driving valid → invalid → repaired
  `modules.yaml` with file-bytes-untouched assertions.
- Session 2 UAT walks 4–6 (healthy no-strip, manifest break-and-repair,
  cold-start strip over a warning-free form) are authored to the Set
  078/087-S3 instruction bar in the set checklist against the rebuilt
  local 0.41.0 VSIX; the human walk is **pending the operator** (this
  close ran autonomously).

## Verification

**S1:** 3 rounds: R1 — after two Anthropic HTTP 400s, the sanctioned
remaining-provider fallback (google gemini-3-1-pro, $0.036) returned
**VERIFIED**, zero findings, two non-blocking nits; R2 — Anthropic Opus
freshness round against the final work state returned ISSUES_FOUND (one
Major: a stale negative Layer 2 guard; its predicted suite failure was
disproven, the guard was rewritten as a positive single-dialect
contract); R3 — **VERIFIED, zero findings**.

**S2:** 2 rounds (gpt-5-6, anthropic excluded, ~$0.31): R1 — one Major
(the pre-seed strip ordering above), fixed in flight with the ordering
pin + literal-copy pins, Layer 2 and the full Playwright suite re-run
green; R2 — **VERIFIED, zero findings**.

**Advisory path-aware critique** (automated `pull_critique`,
openai gpt-5.4 + google gemini-2.5-pro): gemini **VERIFIED**; gpt-5.4
ISSUES_FOUND with two findings, both fixed before close — (1) the then
still-unauthored `change-log.md` (this file), and (2) stale README
claims that the form warns inline (both READMEs now describe the
strip; every stale comment echo in the protocol/client sources swept in
the same pass). Per the recorded advisory policy and the
converge-on-no-new-code-defect rule, the artifact stands as the final
round's raw record; per-finding adjudication is in `disposition.json`.

> Suite at close: pytest **2,922 passed / 6 skipped**, extension unit
> **1,406 passing**, Playwright Layer 3 **22 passed** (run locally per
> L-064-12), `tsc --noEmit` clean, guidance ceilings OK. No release out
> of this set — single boundary after Set 094 (verdict).

## Post-close UAT remediation (2026-07-11, after set close)

The operator ran the armed Session 2 walks after close. **Walk 6 passed;
Walk 4 failed** — the System Status strip appeared in this repository
claiming "Workspace initialization is incomplete" even though the repo
is fully working. **Root cause:** the `structureBuilt` scaffold proxy
(`gettingStartedDetection.routerInstalled`) looks for an `ai_router`
package directory under `.venv/.../site-packages`, but this repo installs
`ai_router` **editable** (`pip install -e .`), which puts only a
`.pth` + finder + `dist-info` there and no package dir — so the proxy
read the workspace as uninitialized. Harmless before this set (the proxy
fed only the Getting Started form, which never renders in a repo that has
session sets), it became visible when S2's strip began rendering in list
mode. **Fix:** `buildSystemStatus` now computes
`workspaceInitialized = hasAnySets || structureBuilt` — a workspace that
already has session sets is initialized by construction, so the proxy's
false negative can never surface a workspace-init fault on a working
repo. The runtime provider-key / Python / Copilot faults still persist in
list mode by design (amendment 5). Pinned by a new Playwright falsifier
(`module-tier.spec.ts` — "list-mode repo without a scaffolded router
package shows no System Status strip"), **confirmed failing pre-fix and
passing post-fix**; suite at this rebuild: pytest 2,922/6 skipped,
Layer 2 1,406, Playwright **23** passed, tsc clean. Re-verified
cross-provider (gpt-5-6, anthropic excluded): **VERIFIED**
(`s2-postclose-walk4-verification.md`).

**Operator UAT — all six walks PASS (2026-07-11).** Walk 4 passed on
re-walk against the rebuilt VSIX; Walk 5 (modules.yaml break-and-repair,
previously deferred) passed; Walks 1–3 and Walk 6 already passed. The
set-level UAT gate is fully satisfied.

> Known follow-up (not fixed here — out of scope, feeds the Getting
> Started form indicator owned by Set 094): `routerInstalled` still
> under-reports an editable install in the pre-first-set getting-started
> state. Masked for any repo with sets by the fix above.

## Deferred / pending

- Operator UAT is **complete — all six walks pass**; no set-level UAT
  work remains.
- The `gettingStarted` payload's probe fields (`pythonPresent`,
  `copilotCliPresent`, `providerKeyPresent`) are retained but no longer
  webview-consumed — removal belongs to Set 094's form rework.
- Set 093 (module-row interactions) consumes this renderer; the routed
  next-set recommendation (claude-code / anthropic / Fable-class /
  medium) is in `ai-assignment.md` + `s2-next-set-analysis.json`.
