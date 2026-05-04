# Marketplace publish + workspace-relative config + README shrink-and-spinout

> **Purpose:** Take the framework's adoption story from "clone a repo, find a VSIX, manually install it, set two env vars" to "click Install in the VS Code Marketplace, open your workspace, run one command — done." Three streams of work feed that endpoint: (1) ship the extension on the **VS Code Marketplace** so the install step is a single click for any user; (2) make the router **auto-discover workspace-relative config + metrics paths** so the operator never has to set `AI_ROUTER_CONFIG` / `AI_ROUTER_METRICS_PATH` env vars; (3) **shrink the README** to a lean inviting on-ramp — hero screenshot + 3-paragraph value prop + 4-6 feature bullets + 3-step quick start — and move the file map / technical detail / worked examples to a separate `docs/repository-reference.md` that the README links to.
> **Created:** 2026-05-04
> **Session Set:** `docs/session-sets/012-marketplace-publish-and-readme-shrink/`
> **Prerequisite:** Set 010 (`010-pypi-publish-and-installer`) must be closed. Both `Dabbler: Install ai-router` (Set 010) and `pip install dabbler-ai-router` (Set 010) are load-bearing for Session 3's README quick-start copy. Set 010 is closed at creation time.
> **Reorder note:** Set 011 (`011-readme-polish`) is a polish pass that adds screenshots / sample-report excerpts / a posture-shift framing section to the README. Its prerequisite was originally "Set 010 closed"; Set 012 reorders that to "Set 012 closed." Set 011 lands its polish onto the lean structure Set 012 establishes, rather than padding the bloated current README. Update Set 011's `Prerequisite:` line as a Session 3 housekeeping touch.
> **Workflow:** Orchestrator → AI Router → Cross-provider verification.

---

## Session Set Configuration

```yaml
totalSessions: 3
requiresUAT: false
requiresE2E: false
effort: normal
outsourceMode: first
```

> Rationale: no UI surface that needs human UAT. Session 1 is a small Python change with unit tests. Session 2 is YAML + prose + a one-time human-driven Marketplace publisher account setup. Session 3 is a documentation restructure. Synchronous per-call routing is the right shape; no daemon needed.

---

## Project Overview

### What the set delivers

Three things, one per session:

1. **Workspace-relative config + metrics auto-discovery.** `ai_router/config.py:load_config()` walks up from `cwd` looking for `ai_router/router-config.yaml` before falling back to the package-bundled default. `ai_router/metrics.py:_log_path()` does the same for `router-metrics.jsonl`. The `AI_ROUTER_CONFIG` / `AI_ROUTER_METRICS_PATH` env vars retain their override semantics for explicit deployment scenarios but **operators no longer need them for the common case** of "I have a tuned `ai_router/router-config.yaml` in my workspace; the router should read it." This kills the env-var dance the harvester migration's PR description called out as a known gap.

2. **VS Code Marketplace publishing.** A GitHub Actions workflow at `.github/workflows/publish-vscode.yml` (analogous to Set 010's `release.yml` for PyPI) tag-publishes the extension to the Microsoft Marketplace via `vsce publish`. A runbook at `docs/planning/marketplace-release-process.md` (analogous to `release-process.md`) documents the one-time human-driven publisher-account setup, the per-release checklist, and the rollback path. The first publish lands as `vsix-v0.13.0` (a minor bump from the current 0.12.0 to mark the Marketplace transition).

3. **README shrink + technical-detail spinout.** The repo-root `README.md` collapses to its lean inviting shape: hero screenshot, 3-paragraph value prop, 4-6 feature bullets (each 1-2 sentences with a link to deeper docs), 3-step quick start (**1.** Install from the Marketplace, **2.** open your workspace, **3.** run `Dabbler: Install ai-router`), license footer. The current "Highlighted features" multi-paragraph blocks, the "Repos that need UAT and/or E2E support" matrix, the "End-of-session output (worked example)" section, and the "Repository file map" all move to a new `docs/repository-reference.md`. Internal cross-links throughout the repo are updated so any agent file or planning doc that pointed at the README's file-map section now points at the reference doc.

### Motivation

The current adoption flow has too many moving parts for a user who just wants to try the framework:

1. Clone the repo (or know to navigate to the right directory)
2. Find the VSIX file under `tools/dabbler-ai-orchestration/`
3. Use VS Code's "Install from VSIX" Extensions-view "..." menu (most users haven't done this)
4. Run the install command
5. Manually `export AI_ROUTER_CONFIG=ai_router/router-config.yaml`
6. Manually `export AI_ROUTER_METRICS_PATH=ai_router/router-metrics.jsonl`
7. Set API keys

Steps 1-3 collapse to "click Install in the Marketplace" once Session 2 lands. Steps 5-6 disappear once Session 1 lands. The remaining flow becomes:

1. Install **Dabbler AI Orchestration** from the VS Code Marketplace
2. Open your project as a workspace
3. Run **`Dabbler: Install ai-router`** from the command palette
4. Set API keys (one-time)

Four steps, no manual VSIX hunting, no env-var setup. That's what the README's Quick Start section says in Session 3.

The README shrink is the front-of-house complement to the install simplification. The current README is ~700 lines — a feature tour that pre-qualifies readers who want to dig deep, but **buries the simple "how do I try this?" question** for readers who'd otherwise convert. The lean shape leads with the simple question and links the depth where it belongs.

### Non-goals

- **No OIDC trusted publishing for the Marketplace.** Microsoft's Marketplace doesn't yet support OIDC the way PyPI does (last surveyed 2026-05-02); a Personal Access Token in GitHub Secrets is the supported path. The runbook acknowledges this and mitigates via PAT scoping (Marketplace publish only) + GitHub deployment-environment protection (required reviewer on `marketplace` env). When OIDC support lands, that's a follow-up.
- **No marketplace search-listing optimization.** Tags, gallery banner color, README-as-extension-listing — all of those exist already in `tools/dabbler-ai-orchestration/package.json` and the per-extension README. Session 2 confirms they're publish-ready but doesn't redesign them. Marketing copy is a future polish (and Set 011's framing-section work feeds into it).
- **No retroactive change to `dabbler-ai-router`'s PyPI version.** Session 1's auto-discovery is forward-compatible: it adds a workspace-relative resolution path, doesn't break the existing package-default path. Operators on `dabbler-ai-router>=0.1.1` (post-Session-1 release) get the new behavior; operators on 0.1.0 still get the env-var-required behavior. No version yank, no deprecation notice on 0.1.0.
- **No deletion of content during the README shrink.** Every section that moves out of the README lands intact in `docs/repository-reference.md`. The shrink is a restructure, not a content cull.
- **No screenshot capture.** Set 011 owns that work. Set 012's Session 3 leaves the existing single hero screenshot in place; Set 011 replaces it later with a more representative gallery shot.

---

## Naming decisions (recorded here so future audits don't relitigate)

- **Marketplace publisher ID:** `darndestdabbler` (matches the existing `publisher` field in `tools/dabbler-ai-orchestration/package.json`). Confirm at Marketplace publisher account creation; if taken, fall back to `dabbler` or `darndest-dabbler` and update the package.json field accordingly.
- **Marketplace extension ID:** `dabbler-ai-orchestration` (matches the existing `name` field). Full identifier on the Marketplace will be `darndestdabbler.dabbler-ai-orchestration`.
- **Release tag pattern:** `vsix-vX.Y.Z` (e.g. `vsix-v0.13.0`). Distinct from the PyPI release pattern (`vX.Y.Z`) so a single repo can drive both releases without tag collision. The PyPI workflow at `.github/workflows/release.yml` filters on `v*` and ignores `vsix-v*`; the new workflow filters on `vsix-v*` and ignores `v*`.
- **Workflow file name:** `.github/workflows/publish-vscode.yml`. Matches the per-platform naming convention (`release.yml` is implicitly "release Python package"; this one is explicitly "publish VS Code extension").
- **Runbook location:** `docs/planning/marketplace-release-process.md`. Lives alongside `docs/planning/release-process.md` (the PyPI runbook). Same shape: one-time setup → per-release checklist → rollback → failure-modes table → maintenance.
- **Reference doc location:** `docs/repository-reference.md`. Single flat reference page covering the file map, the UAT/E2E flag matrix, and the worked end-of-session output example. One file because that's what the user asked for ("another README"); not split across multiple files because the cross-links would proliferate.

---

## Session Plan

### Session 1 of 3: Workspace-relative config + metrics auto-discovery

**Goal:** Make `ai_router/router-config.yaml` and `ai_router/router-metrics.jsonl` work without operator-set env vars when the file lives in a sensibly-located workspace directory.

**Steps:**

1. **`ai_router/config.py:load_config()`** — add a `_find_workspace_config()` helper that walks up from `os.getcwd()` looking for `ai_router/router-config.yaml`. Stops at the first hit (workspace root) or the filesystem root. Returns `None` if no hit. The new resolution order in `load_config()`:
   - Explicit `path` parameter (if provided) — wins.
   - `AI_ROUTER_CONFIG` env var — wins next.
   - Workspace-relative search via `_find_workspace_config()` — new. If the search hits, use that.
   - Bundled default at `_THIS_DIR / "router-config.yaml"` — final fallback.
2. **`ai_router/metrics.py:_log_path()`** — update to follow the resolved config's directory. If `load_config()` resolved to a workspace-relative `<workspace>/ai_router/router-config.yaml`, metrics default to `<workspace>/ai_router/router-metrics.jsonl`. Otherwise the existing default (next to `metrics.py` in site-packages) applies. The `AI_ROUTER_METRICS_PATH` env var still wins.
3. **Unit tests** — extend `ai_router/tests/test_config.py` and `test_metrics.py` (or create them if absent):
   - Workspace-relative search hits when `ai_router/router-config.yaml` exists in `cwd` or any ancestor.
   - Workspace-relative search misses cleanly (returns bundled default) when no such file exists in any ancestor.
   - Explicit `path` parameter wins over both env-var and workspace search.
   - `AI_ROUTER_CONFIG` env var wins over workspace search but loses to explicit `path`.
   - Metrics path follows config path resolution: workspace-config → workspace-metrics; bundled-config → bundled-metrics; env-var-overridden config does NOT auto-override metrics (the two env vars are independent, matching current semantics).
   - Walking up stops at the filesystem root without erroring (operator running tools from `/` should not crash).
4. **Backward-compat smoke test** — confirm the default-path test cases (no workspace config present, no env vars) still pass unchanged. The new code is additive: existing semantics for "router invoked outside any workspace" are unchanged.
5. **Integration check** — from each consumer repo's `.venv` (`dabbler-access-harvester` and the canonical itself), run `python -c "from ai_router.config import load_config; c = load_config(); print(c.get('models', {}).keys())"` from inside the workspace **without** setting `AI_ROUTER_CONFIG`. Confirm the workspace's tuned config is loaded (not the package-bundled one). The harvester's tuning is observably different from the bundled default (per-task-type effort overrides), so the test is checking real workspace-config resolution.
6. **Bump `dabbler-ai-router` to 0.1.1** in `pyproject.toml`. Add a CHANGELOG note (or commit message that the runbook + release-process doc treats as the source of truth) describing the new auto-discovery and noting it's additive (env vars unchanged).
7. **End-of-session cross-provider verification.** Verifier reviews: (a) the resolution-order logic in `_find_workspace_config()` for edge cases (symlinks, permission-denied directories during walk-up, race conditions if a workspace file is created during the walk); (b) the test coverage for the new branch; (c) the CHANGELOG / commit-message framing for the version bump.
8. **Commit, push, run close-out.** Tag and release `v0.1.1` of `dabbler-ai-router` via the existing `.github/workflows/release.yml` workflow (Set 010 deliverable). The release IS load-bearing for Session 3's README copy — Session 3 says "no env vars needed" and that's only true on `>=0.1.1`.

**Creates:** new test cases in `ai_router/tests/test_config.py` (or new file if needed); new test cases in `ai_router/tests/test_metrics.py` (or new file).

**Touches:** `ai_router/config.py`, `ai_router/metrics.py`, `pyproject.toml` (version bump), and the matching `__version__` constant in `ai_router/__init__.py`.

**Ends with:** `from ai_router import route` works from any workspace that has `ai_router/router-config.yaml` checked in, with no env-var setup; the full pytest suite passes (target: existing test count + 6-10 new tests, no regressions); cross-provider verification returns `VERIFIED`; `dabbler-ai-router 0.1.1` is published on PyPI via the existing release workflow.

**Progress keys:** `_find_workspace_config` is exported from `ai_router/config.py` (or wired internally — testable either way); the canonical repo's `python -c "import ai_router; ai_router.route(...)"` from `cwd = c:/Users/denmi/source/repos/dabbler-ai-orchestration` reads `<repo>/ai_router/router-config.yaml` rather than the site-packages copy; the harvester's `python -c` from `cwd = .../main` reads `<harvester>/ai_router/router-config.yaml`.

---

### Session 2 of 3: VS Code Marketplace publishing

**Goal:** First publish of `darndestdabbler.dabbler-ai-orchestration` on the VS Code Marketplace, via an auditable, repeatable release workflow.

**Recommended path: PAT in GitHub Secrets, scoped + protected.** The Marketplace doesn't support OIDC trusted publishing yet (as of 2026-05-04). The supported path is: Microsoft Marketplace publisher account → Azure DevOps PAT scoped to "Marketplace (publish)" → store as a GitHub Secret → workflow uses it via `vsce publish -p $VSCE_PAT`. To mitigate the secret-in-repo risk: PAT is scoped to publish-only (cannot read other Marketplace data), the workflow runs in a protected GitHub Environment (`marketplace`) requiring required-reviewer approval, and the runbook documents a rotation cadence.

**Steps:**

1. **Pre-session check** — confirm `darndestdabbler` is available as a Marketplace publisher ID. If taken, choose a fallback (`dabbler` or `darndest-dabbler`) and update `tools/dabbler-ai-orchestration/package.json` `publisher` field accordingly. The orchestrator runs the check; the operator confirms and authorizes the choice.
2. **Author `.github/workflows/publish-vscode.yml`** — analog to Set 010's `release.yml`, three jobs:
   - `classify` — strict regex on `github.ref` to decide whether the tag is a publish-eligible `vsix-vX.Y.Z` or a no-op. Outputs `should_publish: true|false` and `version` (parsed from the tag).
   - `build` — `npm install` in `tools/dabbler-ai-orchestration/`, `npx vsce package`, verify the produced VSIX's filename version matches the tag's version (catches "tagged but didn't bump package.json"), upload as workflow artifact.
   - `publish-marketplace` — gated by `should_publish == 'true'`, runs in the `marketplace` deployment environment (protected behind a required reviewer), pulls the VSIX artifact, runs `npx vsce publish --packagePath <vsix> -p $VSCE_PAT`. The `VSCE_PAT` secret is bound at the environment level so it's not visible to non-protected jobs. Optionally also `npx ovsx publish` to Open VSX Registry as an unattended secondary publish (gated separately so a publish failure doesn't block the primary).
3. **Author `docs/planning/marketplace-release-process.md`** — runbook covering:
   - **One-time setup:** create Microsoft account / publisher → claim publisher ID → mint PAT in Azure DevOps with Marketplace (publish) scope → store as GitHub Secret in the `marketplace` environment → set required-reviewer on the environment.
   - **One-time decision: dual-publish to Open VSX Registry?** Brief discussion: yes recommended (cursor / VSCodium / forks read from Open VSX), small additional setup. Decision recorded as "yes" by default; operator can veto at session start.
   - **Per-release checklist:** decide version → bump `package.json` `version` → write change-notes (CHANGELOG entry or release-notes file) → commit on master → optional `vsix-v<X.Y.Z>-rc1` for a pre-release verification round → tag `vsix-v<X.Y.Z>` → push tag → approve the `marketplace` deployment in the GitHub UI → verify the listing on the Marketplace website → cut a GitHub Release with the change-notes.
   - **Rollback:** Marketplace allows unpublishing a specific version; the runbook captures the URL pattern and the implications (downstream users on auto-update get bumped down). Hotfix path is `vsix-vX.Y.(Z+1)`.
   - **Failure-modes table:** `vsce publish` rejected due to PAT expiry / invalid scope → rotate; mismatched version in package.json vs tag → caught by `build` job's verify step; unpublish race vs auto-update → wait 24h before re-publishing.
   - **Maintenance:** PAT rotation cadence (annual minimum), Marketplace publisher ownership transfer if needed.
4. **Bump extension version** in `tools/dabbler-ai-orchestration/package.json` from 0.12.0 → 0.13.0 to mark the Marketplace transition. (0.13.0 is a minor — same as 0.12.0 in shape, no breaking changes; the version bump is the audit trail of "this is the first version that hit the Marketplace.")
5. **Pre-publish runbook dry run** — orchestrator walks the runbook with the operator on a side channel (chat / verbal): does the operator have the Microsoft account ready? Has the PAT been minted? Is the GitHub Environment configured? Surface any gaps before the workflow file is committed; the workflow is useless until the secret is in place.
6. **(Optional) Author a small `npm run smoketest:vsix-marketplace`** that downloads the latest published VSIX from the Marketplace and runs the existing extension test suite against it. Useful for the runbook's "verify" step. Skip if the standalone-mocha suite (already in `src/test/suite/`) is enough.
7. **Test-run the workflow** — push `vsix-v0.13.0-rc1` (a release-candidate tag — needs the workflow to handle the RC pattern, even if the pattern is "build-only, do not publish"). Operator runs the workflow's manual-approval step on a TestPyPI-equivalent if Marketplace has one (it does — the runbook documents using a personal publisher account first if the operator wants a sandboxed dry run before claiming the real publisher ID).
8. **First production publish** — the orchestrator authors the workflow + runbook + version bump; the operator pushes the `vsix-v0.13.0` tag, approves the deployment, watches the listing appear on the Marketplace. As with Set 010 Session 2, this is an explicit human-driven handoff in the close-out summary.
9. **Verify post-publish** — `code --install-extension darndestdabbler.dabbler-ai-orchestration` from a clean VS Code instance (or the VS Code Marketplace web UI) installs the published extension; opening a workspace shows the Session Set Explorer activity-bar icon.
10. **End-of-session cross-provider verification.** Verifier reviews: workflow correctness (regex gates, env-protection wiring, classify-job logic), runbook completeness (all human-driven steps documented, all failure modes actionable), the dual-publish-to-Open-VSX decision rationale.
11. **Commit, push, run close-out.** Close-out summary surfaces the human handoff: "Operator must complete Microsoft publisher account setup + PAT minting before tag push."

**Creates:** `.github/workflows/publish-vscode.yml`, `docs/planning/marketplace-release-process.md`. Optional: `npm` script for Marketplace smoketest.

**Touches:** `tools/dabbler-ai-orchestration/package.json` (version bump 0.12.0 → 0.13.0; possibly `publisher` field if fallback needed; possibly `repository.url` confirmation; possibly `categories` / `keywords` review for Marketplace search; possibly `engines.vscode` review). `tools/dabbler-ai-orchestration/CHANGELOG.md` (entry for v0.13.0 — Marketplace launch).

**Ends with:** the Marketplace publish workflow file is committed; the runbook is published; either (a) `darndestdabbler.dabbler-ai-orchestration` is on the Marketplace and `code --install-extension` works, OR (b) the orchestrator's close-out summary states explicitly that the human-driven publisher-account-setup + tag-push is pending and Session 3 should NOT yet write "install from Marketplace" into the README without conditional language.

**Progress keys:** `.github/workflows/publish-vscode.yml` exists and passes its build job on a `-rc` tag; `docs/planning/marketplace-release-process.md` exists; package.json version is 0.13.0; the publisher field matches what's claimed on the Marketplace.

---

### Session 3 of 3: README shrink + technical-detail spinout to `docs/repository-reference.md`

**Goal:** Take the repo-root README from ~700 lines (feature-tour shape) to ~150-200 lines (lean inviting on-ramp shape). Move the file map, the UAT/E2E flag matrix, the worked end-of-session output, and the deeper feature descriptions to a new `docs/repository-reference.md`.

**Steps:**

1. **Confirm Session 2's Marketplace publish landed** — read the current Marketplace listing URL and confirm the extension is installable via `code --install-extension darndestdabbler.dabbler-ai-orchestration`. If Session 2's human handoff hadn't completed by the time Session 3 starts, the orchestrator falls back to "Install from VSIX" copy in the Quick Start (with Marketplace path noted as "coming soon"). Operator confirms which copy to use at session start.
2. **Author `docs/repository-reference.md`** — the destination doc. Structure:
   - **Section: "Highlighted features (deep dive)"** — the multi-paragraph feature blocks currently in the README's "Highlighted features" section move here verbatim. Anchor links matching the README's old fragment IDs preserved (so any external link to `README.md#1-work-is-organized-into-session-sets-and-sessions` redirects cleanly via a small redirect note in the new shrunken README).
   - **Section: "Repos that need UAT and/or E2E support"** — the entire matrix + decision tree currently in the README, moved verbatim.
   - **Section: "End-of-session output (worked example)"** — the current README's worked example, moved verbatim. Stays useful for readers trying to understand "what does a session actually produce?"
   - **Section: "Repository file map"** — the entire file-map section, moved verbatim. Updated to match current state (post-Set-010, post-Set-011 if landed; in particular the `tools/dabbler-ai-orchestration/` extension is the TS-based shape now, not the historical `vscode-session-sets/extension.js`).
   - **Section: "Pointers"** — short list of "this used to be in the README; if you came looking for X, find it at section Y of this doc."
3. **Shrink the repo-root `README.md`** — new structure:
   - **Hero screenshot + 1-paragraph value prop** (existing).
   - **3-paragraph elevator pitch** — the current "What this repo is for" section trimmed to 3 paragraphs.
   - **4-6 feature bullets** — each 1-2 sentences with a link to the matching deep-dive section in `docs/repository-reference.md`. Targets:
     - **Session sets and sessions** (links to `repository-reference.md#highlighted-features-deep-dive` § Work is organized into session sets)
     - **Cost-minded orchestration** (links to deep dive + the existing `docs/sample-reports/` link stays here as the credibility anchor)
     - **Cross-provider verification** (links to deep dive)
     - **Git integration + parallel session sets** (links to deep dive)
     - **Robust fallbacks** (links to deep dive)
     - **UAT + E2E support** (links to `repository-reference.md` § Repos that need UAT/E2E)
   - **Quick start (3 steps)** — install from Marketplace + open workspace + run `Dabbler: Install ai-router`. Plus a brief "What about API keys?" note pointing at the prerequisites checklist below.
   - **Prerequisites: tools and accounts** (existing — keep, lightly tightened). Stays in the README because it's a setup checklist, not technical reference.
   - **License** (existing).
   - **Footer pointer:** "For technical reference (file map, deep feature descriptions, UAT/E2E matrix, worked example output), see [docs/repository-reference.md](docs/repository-reference.md)."
4. **Internal cross-link update** — every file in the repo that links to a fragment in the old `README.md` (e.g. CLAUDE.md, AGENTS.md, GEMINI.md, planning docs) gets its links updated to point at `docs/repository-reference.md` instead. Greppable: `grep -rln 'README.md#'` from the repo root finds them.
5. **Update Set 011's spec** — change its `Prerequisite:` line from "Set 010 must be closed" to "Set 012 must be closed." Set 011's polish work (screenshots, sample-report excerpts, posture-shift framing) is now landing onto Set 012's lean structure rather than the bloated original. The reorder note in this set's front matter has the rationale.
6. **Word-count / line-count check** — after the restructure, repo-root `README.md` should be under 250 lines (target: ~150-200) and `docs/repository-reference.md` should hold roughly what came out of the README plus its own front-matter and pointer table. Total content across both files should be roughly the same as the README's current content (the shrink is restructure, not content cull).
7. **Verify all internal links resolve** — `grep -rln 'README.md\|repository-reference.md'` and walk each link. Anchors must match.
8. **End-of-session cross-provider verification.** Verifier reviews: README diff for tone (does the lean shape read as inviting? does the value prop survive the shrink?), the new reference doc for completeness (every section that left the README must land in the reference doc), the cross-link integrity. Wording-quality issues are normal at this step; expect a small Round 2 if the lean copy needs tightening.
9. **Commit, push, run close-out.** Final session — write `change-log.md` summarizing the set.

**Creates:** `docs/repository-reference.md` (new), `docs/session-sets/012-marketplace-publish-and-readme-shrink/change-log.md` (close-out).

**Touches:** `README.md` (heavy edit — net reduction ~70-80% of body content moves out); `docs/session-sets/011-readme-polish/spec.md` (Prerequisite line update); CLAUDE.md / AGENTS.md / GEMINI.md / planning docs that link to old README fragments (mechanical edits).

**Ends with:** the README is lean and inviting; the reference doc has the moved content intact; all internal links resolve; cross-provider verification returns `VERIFIED`; `change-log.md` is written; the closeout snapshot flips to closed.

**Progress keys:** `wc -l README.md` returns under 250; `docs/repository-reference.md` exists with anchors covering the moved sections; `grep -rln 'README.md#'` from the repo root returns zero matches that point at fragments no longer in the README (every old fragment-link is updated to `repository-reference.md#...`); Set 011's spec front-matter reads `Set 012 must be closed`.

---

## Acceptance criteria for the set

- [ ] `from ai_router import route` works from any workspace that has `ai_router/router-config.yaml` checked in, with no `AI_ROUTER_CONFIG` env var set.
- [ ] `dabbler-ai-router 0.1.1` is on PyPI and the harvester / canonical / homehealthcare repos can `pip install --upgrade dabbler-ai-router` to get the new behavior.
- [ ] `darndestdabbler.dabbler-ai-orchestration` v0.13.0 is published on the VS Code Marketplace and `code --install-extension <id>` works (or, if the human-driven publisher-account setup is pending, the close-out summary states the path is in place and the publish will land on the operator's next push).
- [ ] `.github/workflows/publish-vscode.yml` exists and is committed.
- [ ] `docs/planning/marketplace-release-process.md` exists and covers one-time setup, per-release checklist, rollback path, and a failure-modes table.
- [ ] Repo-root `README.md` is under 250 lines, leads with the lean inviting shape, has a 3-step Quick Start anchored on the Marketplace install.
- [ ] `docs/repository-reference.md` exists with the moved file map, deep feature descriptions, UAT/E2E matrix, and worked end-of-session output.
- [ ] All internal cross-links resolve; no `README.md#<fragment-no-longer-in-readme>` link is dead anywhere in the repo.
- [ ] Set 011's spec `Prerequisite:` line is updated.
- [ ] `change-log.md` summarizes the set in the now-standard close-out format.

---

## Risks

- **Marketplace publisher account setup is human-driven and asymmetric in cost.** The orchestrator authors the workflow file and runbook in minutes; the operator's account creation + PAT minting + GitHub environment config takes 30-90 minutes the first time. Mitigation: Session 2's runbook walks every step in detail; Session 2's pre-session check confirms which decisions need the operator's attention before the workflow file is committed. Acceptable if the human handoff is pending at Session 2 close — Session 3 has fallback copy.
- **PAT-in-secrets is the supported but suboptimal path.** Set 010's PyPI publish used OIDC trusted publishing specifically because secret-storage has well-documented compromise paths. The Marketplace doesn't support OIDC yet. Mitigation: PAT is scoped to publish-only, environment-protected with required reviewer, rotation cadence in the runbook. When OIDC support lands, file as a follow-up.
- **README shrink can lose content readers genuinely valued.** A 700→200 line restructure means ~500 lines of content moves to a less-prominent file. Mitigation: every section that moves is preserved verbatim in the reference doc; the README's footer pointer ensures readers can find it; Step 7 of Session 3 walks every internal link to catch dead anchors.
- **Auto-discovery walk-up has edge cases.** Symlinks, permission-denied directories, race conditions if a workspace file is created during the walk. Mitigation: Session 1's verifier review explicitly probes these edge cases; the test suite covers them.
- **Set 011 reorder coordination.** Set 012 changes Set 011's prerequisite from "Set 010 closed" to "Set 012 closed." If Set 011 had already been started against the old prerequisite, this would create a merge conflict. Mitigation: Set 011 has not been started (`docs/session-sets/011-readme-polish/session-state.json` is at `not-started` if it exists; if absent, then a fortiori). Confirm at Session 3 start.
- **Marketplace listing search ranking is opaque.** First publish lands at the bottom of any "AI workflow" search; readers find it via the canonical repo's README link, not via Marketplace search. Mitigation: this is a marketing concern, not a technical one; out of scope for v0.13.0.

---

## References

- Set 010 (`010-pypi-publish-and-installer`) — the closest analog. Set 010 published `dabbler-ai-router` to PyPI + shipped the install command; Set 012 publishes the extension to the Marketplace + makes the install command's setup invisible to operators. Same shape, different registry.
- Set 011 (`011-readme-polish`) — orders after Set 012. Its polish (screenshots, sample-report framing, posture-shift section) lands onto Set 012's lean structure. Set 012's Session 3 updates Set 011's prerequisite line.
- `docs/sample-reports/` — landed alongside this spec (canonical commit `514f044`). The lean README's "Cost-minded orchestration" feature bullet links to these as the credibility anchor.
- `docs/ai-led-session-workflow.md` — the canonical workflow each session follows.
- `docs/planning/release-process.md` — the PyPI runbook from Set 010. Session 2's runbook for the Marketplace mirrors its structure and section headings.
- VS Code Marketplace publisher docs: https://code.visualstudio.com/api/working-with-extensions/publishing-extension — the canonical reference for `vsce`, PAT minting, and listing management.
- Open VSX Registry (secondary publish target): https://open-vsx.org/

---

## Cost projection

Per-session estimates (single end-of-session cross-provider route each, no analysis routes per the standing operator cost-containment rule):

| Session | Estimated cost | Notes |
|---|---|---|
| 1 — Auto-discovery + 0.1.1 release | $0.10–$0.20 | Small Python change; verification mostly checks the resolution-order edge cases. |
| 2 — Marketplace publish workflow + runbook | $0.15–$0.30 | YAML correctness + runbook completeness verification; comparable to Set 010 Session 2. |
| 3 — README shrink + reference-doc spinout | $0.20–$0.40 | Prose-quality verification on the leaner README + completeness check on the reference doc; expect possible Round 2 if the lean copy needs tightening. |
| **Set total** | **$0.45–$0.90** | Comparable to Set 010 ($0.35–$0.70 projected, $2.40 actual due to a single session blowing past the budget). Documentation work runs cheap; Marketplace workflow YAML is comparable to PyPI workflow YAML. |

The largest cost driver is Session 3's prose-quality verification — comparable to Set 010 Session 3's seven-round excursion. If Session 3's first verification flags structural issues with the README shrink, expect 2-3 rounds rather than 1. Session 3's prompt should be tightly scoped to the diff (changed regions + new reference doc) rather than the whole README, to keep the input size manageable.
