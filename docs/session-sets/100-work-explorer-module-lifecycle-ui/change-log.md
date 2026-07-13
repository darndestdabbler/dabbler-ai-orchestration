# Change Log — Set 100: Work Explorer Module Lifecycle UI

> **Set complete: 2026-07-13** (2 sessions). Third of the four-set
> module-lifecycle-simplification bundle (Sets 098-101): the flattened
> module tree + kind-aware rows (Session 1), and the module-row
> lifecycle actions wired to Set 099's writers + Add-module scaffolding
> (Session 2). No publish — single release boundary after Set 101.

## Session 1 of 2 — Flatten the module subtree; kind-aware rows

- The 093-era persistent `Plan` / `Session sets` child nodes, the
  `blocked-until-plan` module state, `deriveModuleChildren`, and the
  `planExists` plumbing are removed — status buckets are the module's
  direct children (ARIA module 1 / bucket 2 / row 3).
- Kind-typed set rows (Set 098 `kind` field) render a quiet
  presentation-only badge via new pure `kindBadge` / `kindTooltip` model
  functions.
- The scaffolded decomposition set's prerequisite blocked-marker (Set
  061 machinery, pre-linked by Set 098's template) carries the
  blocked-until-plan signal now, pinned end-to-end including
  unblock-on-plan-complete.
- Layer 2 + Layer 3 pins moved in the same session (093 amendment-6
  discipline); the compat-matrix row updated with the renamed pinning
  test.
- Suites green: unit 1588 (stub path), Playwright Layer 3 26/26
  effective, `ai_router` pytest 3030/6 skipped unchanged.
- Cross-provider phased discovery round 1: **VERIFIED** on both fan-out
  calls, zero findings; two prose/test nits folded in.

## Session 2 of 2 — Lifecycle row actions; strip retirement; Add-module scaffolding

- **Module action strip + context menu reworked** (`client.js`,
  `CustomSessionSetsView.showModuleContextMenu`): `Open Plan` survives;
  the Set 093 authoring actions `AI Plan` / `Import Plan` / `AI Sets`
  retire from BOTH surfaces — their underlying flows survive
  palette-only (`dabbler.importPlan`, `dabbler.generateSessionSetPrompt`,
  `dabbler.copyModuleDecompositionPrompt`) for legacy repos that predate
  `kind` sets. `Add Module...` / `Rename Module...` / `Delete Module...`
  join, **declared modules only** — the pseudo module keeps only `Open
  Plan` + `Assign legacy sets to module...` (on `Unassigned`) and gets
  zero lifecycle-management actions.
- **Protocol + narrowing updated to match**
  (`sessionSetsWebviewProtocol.ts`, `moduleActionNarrowing.ts`): the
  `ModuleActionId` closed enum drops the three retired actions and gains
  `add-module` / `rename-module` / `delete-module`, each gated
  declared-only (mirroring the existing pseudo-only gate on
  `assign-legacy`). `add-module` ignores its carried module slug
  entirely — it always launches the same New Module flow for a
  brand-new module regardless of which declared module's strip it was
  clicked from (the row is a convenient reach, not a target).
- **The explicit-target seam extended to rename/delete**
  (`renameModule.ts`, `deleteModule.ts`): `runRenameModuleFlow` /
  `runDeleteModuleFlow` gained `opts.preselectedSlug`, which skips
  `pickModule` entirely and fails loud (never falls back to the picker)
  on a stale slug — mirroring the Set 093 S2 `pickModuleForAuthoring`
  precedent. The palette commands (`dabbler.renameModule` /
  `dabbler.deleteModule`) intentionally keep their own QuickPick — the
  documented targeting-parity contract, row/context vs palette.
- **Add-module scaffolds its lifecycle sets** (`newModule.ts`):
  `runNewModuleFlow` now calls `scaffoldModuleLifecycleSets` right after
  the manifest append, using the just-appended `ModuleManifestEntry`
  constructed directly from `scaffoldNewModule`'s known return shape —
  not a re-read of `docs/modules.yaml`, which would race the async
  `await ui.openFile(...)` call and could silently suppress the
  scaffold on a concurrent edit. A scaffold-writer refusal reports (in
  the same combined toast) but never undoes the module's declaration
  ("module without sets beats half-written sets," spec verbatim).
- **Tests:** `moduleActionNarrowing.test.ts` (declared-only gating,
  retired-action drop, dispatch wiring for all five actions),
  `renameModule.test.ts` + `deleteModule.test.ts` (`preselectedSlug`
  targeting-parity, stale-slug fail-loud, palette-still-QuickPicks),
  `moduleAuthoring.test.ts` (`runNewModuleFlow` lifecycle-scaffold happy
  path pinning the exact `001-greeter-plan` / `002-greeter-decomposition`
  slugs, a cross-module-coexistence test, a real scaffold-refusal test
  forcing the writer's own directory collision),
  `moduleLifecycleUi.test.ts` (host/client source-scan pinning retired
  actions absent from both surfaces, new actions present, the
  declared-only gate, and `moduleActionExec`'s explicit-target binding).
  Playwright `module-tier.spec.ts` strip assertions updated: declared
  strip still 4 buttons (now `open-plan` / `add-module` /
  `rename-module` / `delete-module`), pseudo `Unassigned` strip now 2
  buttons (down from 5 — zero management actions); the click-focus test
  switched from the retired `ai-plan` to `open-plan` (fire-and-forget,
  never a blocking modal, unlike the three new dialog-opening actions).
- **Live dogfood** on a scratch MULTI-module repo (a second declared
  module `payments` with its own stamped set, plus an unstamped legacy
  set, present before touching anything): ran the real compiled
  **writers** end to end — add `greeter` (plan ready, decomposition
  blocked on the plan) -> rename `greeter`->`welcomer` (zero orphans,
  both restamped) -> delete `welcomer` (manifest entry gone, both
  unstarted scaffolds removed outright per the Set 099 disposition
  rule) — with `payments` and the unstamped set asserted untouched
  after every step. Raw transcript at `s2-dogfood.md`, explicitly named
  as writer-level (one layer below the interactive command-flow
  functions `moduleActionExec` binds — VS Code's native input
  boxes/confirm dialogs aren't practical to drive headlessly in this
  harness). That interactive layer is covered instead by the
  `preselectedSlug` unit suites and ad-hoc UAT Walks 4-6 (suggested,
  non-gating).
- **Suites green:** extension unit 1605/1605 (up from 1588, +17 new
  tests); `tsc --noEmit` clean; esbuild clean; eslint unchanged
  pre-existing baseline; Playwright Layer 3 full run 26/26; `ai_router`
  pytest 3030/6 skipped, unchanged baseline (no `ai_router/` files
  touched).

### Verification (phased loop, 1 round, $0.31 total)

- **Round 1 (discovery, K=2 fan-out, both gpt-5-6):** **VERIFIED** on
  both independent calls, zero blocking findings. Both calls
  independently raised the same evidence/precision nits — the dogfood
  wording overclaimed "multi-module" and "exactly the `moduleActionExec`
  code path"; a test named "skip-existing" actually tested cross-module
  coexistence, not a same-slug re-run; the Add-module numbering test
  asserted only a digit pattern — plus one real defensive-code nit: a
  post-append manifest re-read raced the async `ui.openFile()` call and
  could silently suppress the scaffold-refusal report. All five folded
  in before authoring `disposition.json`: the dogfood script and
  `s2-dogfood.md` were rewritten with a genuinely untouched second
  module and accurate writer-level wording; the misleadingly-named test
  was renamed to state what it verifies; the numbering test now asserts
  the exact `001-greeter-plan` / `002-greeter-decomposition` slugs;
  `newModule.ts` now constructs the manifest entry directly instead of
  re-reading it post-await, removing the race and the silent-skip path
  entirely. Re-verified green (`tsc` clean, unit suite unchanged at
  1605, dogfood re-run PASS) — no second discovery round was needed
  since the original round was already non-blocking.

## End state

The full module lifecycle — add (with scaffolded next steps), open
plan, rename, delete — is reachable on the row it applies to, mouse and
keyboard, declared modules only; the pseudo module correctly excludes
lifecycle-management actions. Superseded strip actions are retired with
their underlying palette capability intact. No release out of this set
— the module-lifecycle-simplification bundle ships together after Set
101.

**Open operator follow-up:** the spec arms `pathAwareCritique: advisory`
for this set. That stage is a manual, operator-run flow (GitHub-Copilot
workspace access — the routed `route()` path has no repo pull-access),
mirroring the Set 099 S2 precedent where the operator ran it AFTER
`close_session` using
[`ai_router/prompt-templates/path-aware-critique.md`](../../../ai_router/prompt-templates/path-aware-critique.md)
pasted once under GPT-5.4 and once under Gemini-Pro, saving the result
to `path-aware-critique.json`. `advisory` means `close_session` only
warns on the artifact's absence — it does not block this close. Highest-
value targets for that critique per this session's own targeting-seam
work: confirm row / context-menu / palette resolve rename and delete
identically (the explicit-target seam vs. the palette's own QuickPick),
and confirm the retired-action removal left no dead dispatch path in
`moduleActionNarrowing.ts` or the webview client.

## Step 9 — reorganization review (`project-guidance.md` / `lessons-learned.md`)

Scanned both files against this session's experience. No lesson,
convention, or principle in either file reached the "at least two
different contexts" promotion bar, and nothing surfaced as an
archival/staleness candidate from this session's work specifically.

> No reorganization changes recommended for `project-guidance.md` or
> `lessons-learned.md`.

One observed-but-not-yet-promoted pattern, recorded here for future
recurrence tracking rather than forced into the active lesson tier
against its own admission test's recurrence bar (a single occurrence
this session, not yet a recurrence): constructing a value **directly**
from data a prior write call is already known to have produced, instead
of re-reading it from disk/state across an intervening `await`, avoids
a TOCTOU-shaped race where a concurrent edit in that window could
silently suppress dependent work with no error surfaced (the
`newModule.ts` fix this session). If this pattern recurs in a future
session, it is a promotion candidate for `lessons-learned.md`.
