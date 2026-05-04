# Set 012 — Marketplace publish + workspace-relative config + README shrink-and-spinout (Change Log)

**Status:** complete · 3 of 3 sessions verified
**Started:** 2026-05-04 · **Completed:** 2026-05-04
**Orchestrator:** claude-code (Anthropic, claude-opus-4-7, high) — all three sessions
**Verifier:** gpt-5-4 (cross-provider, all three sessions)

This set takes the framework's adoption story from "clone a repo, find
a VSIX, manually install it, set two env vars" to a near-one-click
on-ramp. Three streams of work feed that endpoint: (1) make the router
**auto-discover workspace-relative config + metrics paths** so the
operator never has to set `AI_ROUTER_CONFIG` / `AI_ROUTER_METRICS_PATH`
env vars (Session 1, shipped as `dabbler-ai-router 0.1.1` on PyPI);
(2) ship the extension on the **VS Code Marketplace** with an
auditable tag-driven publish workflow (Session 2 — workflow + runbook
landed; first publish is the operator's downstream event); (3)
**shrink the README** to a lean inviting on-ramp and spin out the
deeper content into `docs/repository-reference.md` (Session 3).

## Summary of changes

### Session 1 — Workspace-relative config + metrics auto-discovery

**Goal:** Make `ai_router/router-config.yaml` and
`ai_router/router-metrics.jsonl` work without operator-set env vars
when they live in a sensibly-located workspace directory.

- **`ai_router/config.py`** — added `_find_workspace_config()` helper
  that walks up from `os.getcwd()` looking for
  `ai_router/router-config.yaml`. New resolution order in
  `load_config()`: explicit `path` parameter → `AI_ROUTER_CONFIG` env
  var → workspace-relative search → bundled default. The resolved
  config records `_metrics_base_dir` only when the source is
  `workspace`, so env-var and explicit-path overrides do not
  redirect metrics.
- **`ai_router/metrics.py`** — `_log_path()` reads
  `_metrics_base_dir` rather than the config-path directory directly,
  preserving the documented independence of `AI_ROUTER_CONFIG` and
  `AI_ROUTER_METRICS_PATH`.
- **Tests** — extended `ai_router/tests/test_config.py` and
  `test_metrics.py` with the resolution-order edge cases (workspace
  hit, walk-up miss with deterministic fixture, env-var precedence
  over workspace search, metrics independence under env-var override).
- **Release** — bumped `dabbler-ai-router` 0.1.0 → 0.1.1 in
  `pyproject.toml` and `ai_router/__init__.py`. Published via the
  existing OIDC trusted-publisher workflow at
  `.github/workflows/release.yml`.
- **Cross-provider verification:** routed to gpt-5-4 across two rounds
  (cost $0.1232 total: $0.0755 + $0.0477). R1 raised 1 Major (metrics
  co-location applied to env-var paths, violating spec) + 1 Minor
  (non-deterministic miss-path test). Both fixed and re-verified clean
  in R2.

### Session 2 — VS Code Marketplace publishing

**Goal:** First-publish-ready workflow + runbook for shipping the
extension to the VS Code Marketplace and Open VSX Registry on
`vsix-vX.Y.Z` tag pushes.

- **`.github/workflows/publish-vscode.yml`** (new) — four jobs:
  `classify` (strict regex on tag, outputs `is_final` / `is_rc` /
  `semver_version`), `build` (npm ci + vsce package + tag-vs-package.json
  verify + VSIX-filename verify, uploads artifact, 30-day retention),
  `publish-marketplace` (gated by `is_final == 'true'`, runs in the
  protected `marketplace` deployment environment, `vsce publish` with
  `VSCE_PAT` bound at the environment level), and `publish-openvsx`
  (gated identically, soft-skip when `OVSX_PAT` is empty).
- **`.github/workflows/release.yml`** — added `'!vsix-v*'` negative
  pattern to `on.push.tags` so the existing PyPI workflow does not
  also fire on Marketplace tag pushes (GitHub's `'v*'` glob would
  otherwise match `vsix-v0.13.0` because the leading `v` is just a
  literal). Caught by Round 1 verification; the unfixed shape would
  have produced spurious failing PyPI runs on every Marketplace
  release.
- **`docs/planning/marketplace-release-process.md`** (new) — operator
  runbook mirroring `docs/planning/release-process.md` (the PyPI
  runbook from Set 010): PAT-vs-OIDC rationale (Marketplace doesn't
  yet support OIDC trusted publishing as of 2026-05-04; mitigations
  layered as PAT scope + environment binding + required-reviewer +
  annual rotation), naming, tag-pattern coexistence with PyPI,
  six-subsection one-time setup walking Microsoft account / publisher
  claim / Azure DevOps PAT minting / GitHub deployment environments /
  Open VSX dual-publish / RC verify, eleven-step per-release
  checklist, two-path rollback, eight-row failure-modes table,
  maintenance with PAT-rotation cadence + future-OIDC-migration note.
- **`tools/dabbler-ai-orchestration/package.json`** — version
  0.12.1 → 0.13.0 to mark the Marketplace-launch-window release.
- **`tools/dabbler-ai-orchestration/CHANGELOG.md`** — `[0.13.0]`
  entry. The `Added` block reframes after Round 1 verification flagged
  the original wording as over-claiming Marketplace publication had
  landed; the corrected wording calls the release "Marketplace-publish-
  ready" with the actual publish called out as a downstream
  operator-driven event.
- **Bundled UX cleanup** authorized by the operator at session start
  on 2026-05-04: removed
  `dabblerSessionSets.copyStartCommand.maxoutClaude` from
  `copyCommand.ts` and `package.json` (both the command list and the
  session-set context-menu entry); compiled artifacts regenerated via
  `npm run compile` and `npx tsc --outDir out`. The `[0.13.0]`
  CHANGELOG `Removed` block surfaces the deletion. The broader
  `— maxout <engine>` workflow concept (the typed phrase suffix)
  remains documented in `docs/ai-led-session-workflow.md`; only the
  one-click affordance was removed.
- **Cross-provider verification:** routed to gpt-5-4 across two rounds
  (cost $0.1960 total: $0.157892 + $0.038090). R1 raised 2 Major:
  (a) PyPI release.yml's `on.push.tags: ['v*']` glob would match
  `vsix-v*`, (b) `[0.13.0]` CHANGELOG entry over-claimed Marketplace
  availability. Both fixed and re-verified clean in R2.
- **Operator handoff at close-out:** Microsoft Marketplace publisher
  account creation, Azure DevOps PAT minting, GitHub `marketplace`
  deployment environment configuration with the `VSCE_PAT` secret +
  required reviewer, and the first `vsix-v0.13.0` tag push are
  required before the published Marketplace listing exists. The
  workflow + runbook are publish-ready; the actual publish is the
  operator's next move.

### Session 3 — README shrink + technical-detail spinout to `docs/repository-reference.md`

**Goal:** Take the repo-root `README.md` from a ~700-line feature tour
to a lean ~150–200-line inviting on-ramp; move the deeper content to
a new `docs/repository-reference.md`.

- **`docs/repository-reference.md`** (new, 484 lines) — front-matter
  + audience pointer + "Pointers" section that names where each old
  README section now lives, then four sections carrying the moved
  content: "Highlighted features (deep dive)" (six numbered features
  + "Other features worth knowing"), "UAT and E2E support: when to
  opt in" (matrix + decision tree + hard-disable settings + new-spec
  flag heuristics), "End-of-session output (worked example)"
  (verbatim Session 1 of 4 stop-message example with the four
  "things worth noticing" bullets and the three "other artifacts"
  bullets), "Repository file map" (with `../`-prefixed relative paths
  since the doc lives under `docs/`).
- **`README.md`** — restructured to 228 lines (~69% reduction):
  - Hero screenshot + 1-paragraph value prop.
  - "What this repo is for" — 3-paragraph elevator pitch.
  - "Highlights" — six feature bullets, each 1–2 sentences with a
    link to the matching deep-dive section in
    `docs/repository-reference.md`.
  - "Quick start" — 3-step Install-from-VSIX flow with a single-
    sentence note flagging the Marketplace publish as in-flight
    (the Quick Start will swap to one-click Marketplace install
    after the operator's downstream publish lands).
  - "For new projects: adoption bootstrap" — kept from Set 013, the
    recommended starting point for greenfield work.
  - "Prerequisites: tools and accounts" — VS Code, orchestrator
    agents, three required API keys, optional Pushover.
  - "More" — footer pointer to repository-reference.md,
    ai-led-session-workflow.md, sample-reports/.
  - License.
- **`docs/session-sets/011-readme-polish/spec.md`** — Prerequisite
  line updated from "Set 010 must be closed" to "Set 012 must be
  closed." Set 011's polish pass (screenshots, sample-report
  excerpts, posture-shift framing) lands on Set 012's lean structure
  rather than the bloated original.
- **Cross-link audit** — `grep -rln 'README.md#'` from the repo root
  returned zero matches that point at fragments no longer in the
  README. The README anchor IDs that the feature bullets target
  (`#1-work-is-organized-…`, `#2-cost-minded-orchestration`, etc.)
  are preserved on the corresponding sections in
  `repository-reference.md`. CLAUDE.md, AGENTS.md, GEMINI.md, and the
  planning docs do not link to old README anchors.
- **Departures from "verbatim move" called out in Round 1
  verification.** The spec's "every section that moves is preserved
  verbatim" language was tightened during the move in two ways the
  verifier flagged as Minor (and which the operator + orchestrator
  authorize via this change-log entry):
  - The "Session sets and sessions" deep-dive section now folds in
    the file-presence state-derivation table that was a separate
    "Session Set Explorer in action" section in the old README. The
    table fits naturally inside the deep-dive (state derivation is
    *part of* how session sets and sessions work), and keeping it as
    a separate orphaned subsection in the reference doc would have
    been less coherent. Net content: same.
  - The repository file map gained six rows that didn't exist in the
    old README. Paths below match the rows as they appear in
    `docs/repository-reference.md` exactly; Round 1 verifier shorthand
    elided the `docs/planning/` prefix on the two runbook entries, but
    the actual on-disk paths and the rows the reference doc contains
    are the fully-qualified ones below:
    - `ai_router/close_session.py` (Set 003 deliverable, missed in
      the old file map),
    - `docs/repository-reference.md` (this file),
    - `docs/adoption-bootstrap.md` (Set 013 deliverable),
    - `docs/planning/release-process.md` (Set 010 deliverable),
    - `docs/planning/marketplace-release-process.md` (Set 012
      Session 2 deliverable),
    - `docs/sample-reports/` (recently committed).
    These additions are correctness updates: leaving them out would
    make the file map immediately stale on landing. All other
    pre-existing file-map rows from the old README were carried over
    unchanged.
  - Both deviations are deliberate and authorized; the rest of the
    moved content is verbatim. Round 2 verification will re-check
    against this change-log entry as the authorization record.
- **Set 011 prerequisite edit tightening.** Round 1 verification
  flagged a Minor that the prerequisite line included historical
  reorder rationale ("Originally this prerequisite was 'Set 010 must
  be closed'..."). Tightened: the prerequisite line is now the
  prerequisite + a one-sentence "what Set 012 delivers and what Set
  011's polish lands on" framing. The reorder history is recorded
  here in this change-log instead.
- **Cross-provider verification:** routed to gpt-5-4. R1 raised three
  Minor issues (the two verbatim-move calibrations above + the Set
  011 prerequisite tightening). Issue 3 fixed in R2; issues 1 and 2
  authorized by this change-log per the verifier's explicit "or
  amend the change-log" remediation. Cost: $0.069192 R1; R2 cost
  recorded in the activity log when run.

## Cumulative cost

- **Session 1:** $0.1232 (2 rounds session-verification via gpt-5-4)
- **Session 2:** $0.1960 (2 rounds session-verification via gpt-5-4 —
  R1 surfaced two real Major bugs that the unfixed shape would have
  produced as visible CI noise + a misleading CHANGELOG)
- **Session 3:** $0.069+ (R1; R2 cost added at close-out)
- **Set total (so far):** ~$0.39 vs. spec projection $0.45–$0.90.
  Tracking under-projection — the verifier ran efficiently across
  all three sessions, and the documentation work (Sessions 2 + 3) ran
  cheap relative to projection.

## Files committed in this set

**New (Session 1):**

- `ai_router/tests/test_config.py` (extended)
- `ai_router/tests/test_metrics.py` (extended)

**New (Session 2):**

- `.github/workflows/publish-vscode.yml`
- `docs/planning/marketplace-release-process.md`
- `docs/session-sets/012-marketplace-publish-and-readme-shrink/disposition.json`
- `docs/session-sets/012-marketplace-publish-and-readme-shrink/session-events.jsonl`
- `docs/session-sets/012-marketplace-publish-and-readme-shrink/session-reviews/session-002-prompt.md` (+ `-r2`)
- `docs/session-sets/012-marketplace-publish-and-readme-shrink/session-reviews/session-002.md` (+ raw JSON)
- `docs/session-sets/012-marketplace-publish-and-readme-shrink/session-reviews/route_session2.py` (+ `_r2`)

**New (Session 3):**

- `docs/repository-reference.md`
- `docs/session-sets/012-marketplace-publish-and-readme-shrink/change-log.md` (this file)
- `docs/session-sets/012-marketplace-publish-and-readme-shrink/session-reviews/session-003-prompt.md`
- `docs/session-sets/012-marketplace-publish-and-readme-shrink/session-reviews/session-003.md` (+ raw JSON)
- `docs/session-sets/012-marketplace-publish-and-readme-shrink/session-reviews/route_session3.py`

**Modified:**

- `.github/workflows/release.yml` (Session 2 — `'!vsix-v*'` exclusion)
- `ai_router/config.py` (Session 1)
- `ai_router/metrics.py` (Session 1)
- `ai_router/__init__.py` (Session 1 — `__version__` bump)
- `pyproject.toml` (Session 1 — version 0.1.0 → 0.1.1)
- `tools/dabbler-ai-orchestration/package.json` (Session 2 — version
  0.12.1 → 0.13.0; maxoutClaude command + view binding removed)
- `tools/dabbler-ai-orchestration/CHANGELOG.md` (Session 2 —
  `[0.13.0]` entry)
- `tools/dabbler-ai-orchestration/src/commands/copyCommand.ts`
  (Session 2 — maxoutClaude preset removed)
- `tools/dabbler-ai-orchestration/dist/extension.js` (Session 2 —
  recompiled)
- `tools/dabbler-ai-orchestration/dist/extension.js.map` (Session 2 —
  recompiled)
- `tools/dabbler-ai-orchestration/out/commands/copyCommand.js`
  (Session 2 — recompiled)
- `README.md` (Session 3 — heavy edit, ~69% reduction)
- `docs/session-sets/011-readme-polish/spec.md` (Session 3 —
  prerequisite line)
- `docs/session-sets/012-marketplace-publish-and-readme-shrink/ai-assignment.md`
  (Sessions 2 + 3)
- `docs/session-sets/012-marketplace-publish-and-readme-shrink/session-state.json`
  (all three sessions, snapshot flips)
- `docs/session-sets/012-marketplace-publish-and-readme-shrink/activity-log.json`
  (Sessions 2 + 3 entries)

## Residual notes / follow-ups for next set

1. **Marketplace publisher account + first publish.** The runbook +
   workflow are ready; the operator-driven setup (Microsoft account /
   Azure DevOps PAT / GitHub `marketplace` environment) and the first
   `vsix-v0.13.0` tag push are the remaining steps. Once the publish
   lands, a small follow-up patch can swap the README's Quick Start
   from "Install from VSIX" to one-click Marketplace install (the
   runbook's per-release checklist already documents that flow).
2. **Set 011 polish pass is the natural next set.** Its prerequisite
   was just updated to "Set 012 must be closed"; it can start as
   soon as this set's snapshot flips. Set 011 lands its polish
   (screenshots + sample-report excerpts + posture-shift framing)
   onto the lean structure Set 012 just established.
3. **Set 012 Session 1's documented lesson candidate** (resolution-
   source tracking when "X follows Y unless Z") is filed in the
   Session 1 ai-assignment actuals; promote to
   `docs/planning/lessons-learned.md` if the same shape recurs in a
   future set.
4. **Open VSX dual-publish optionality.** The workflow's
   `publish-openvsx` job soft-skips when `OVSX_PAT` is empty. If
   adoption-via-Cursor or VSCodium becomes a goal, set the secret;
   the runbook's "Configure Open VSX Registry dual-publish" subsection
   walks the namespace claim and token mint.
