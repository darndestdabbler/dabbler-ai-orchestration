# Cross-provider verification — Set 12 Session 2: Marketplace publish workflow + runbook + v0.13.0 bump (with bundled maxoutClaude removal)

You are reviewing a session that authored a tag-driven release pipeline
for publishing the **Dabbler AI Orchestration** VS Code extension to
the Microsoft VS Code Marketplace and the Open VSX Registry, plus the
operator-facing runbook for the publish, plus a small bundled UX
removal (the `maxoutClaude` command + context-menu entry). The
extension is bumped 0.12.1 → 0.13.0 to mark the Marketplace-launch
window.

The deliverables are configuration-shaped: a GitHub Actions workflow
file with strict tag classification + version-vs-package.json gate +
artifact upload + environment-protected publish jobs; a runbook
mirroring Set 010's PyPI runbook in section structure; a
`package.json` version bump + a CHANGELOG section; a deletion of one
preset from a single command file + the matching package.json
entries; recompiled `dist/` and `out/` artifacts.

**Goal of the verification:** would the produced workflow + runbook
actually publish the extension to the Marketplace correctly and
recoverably when the operator pushes a `vsix-v0.13.0` tag (after the
one-time human-driven publisher account setup the runbook documents)?
Are the runbook's failure modes actionable? Does the bundled
maxoutClaude removal land cleanly across source, package.json,
compiled artifacts, and the CHANGELOG without leaving stale
references? Does the v0.13.0 CHANGELOG entry give a reader an
accurate picture of what shipped?

---

## Context: Set 010's PyPI release pipeline (the analog)

The PyPI release path (closed in Set 010) lives at:

- `.github/workflows/release.yml` — OIDC trusted publishing, classify
  job → build job → `publish-testpypi` (rc tags) / `publish-pypi`
  (final tags) gated by GitHub deployment environments.
- `docs/planning/release-process.md` — naming, OIDC rationale,
  one-time setup, per-release checklist, rollback, failure-modes
  table, maintenance.

The Marketplace pipeline mirrors this shape. The two structural
differences are:

1. **Authentication.** PyPI supports OIDC trusted publishing as of
   2023; the Marketplace does not (last surveyed 2026-05-04). The
   Marketplace path uses an Azure DevOps PAT scoped to "Marketplace
   (publish)" stored as the `VSCE_PAT` secret in a GitHub deployment
   environment. The runbook layers PAT scoping + environment binding +
   required-reviewer approval + annual rotation as mitigations.
2. **Tag pattern coexistence.** PyPI uses `v*`, the Marketplace uses
   `vsix-v*`. The prefix is load-bearing: a single repo carries both
   pipelines on the same default branch and the prefix prevents
   collision.

---

## Spec excerpt for Session 2

```markdown
### Session 2 of 3: VS Code Marketplace publishing

**Goal:** First publish of `darndestdabbler.dabbler-ai-orchestration`
on the VS Code Marketplace, via an auditable, repeatable release
workflow.

**Recommended path: PAT in GitHub Secrets, scoped + protected.** The
Marketplace doesn't support OIDC trusted publishing yet (as of
2026-05-04). The supported path is: Microsoft Marketplace publisher
account → Azure DevOps PAT scoped to "Marketplace (publish)" → store
as a GitHub Secret → workflow uses it via `vsce publish -p $VSCE_PAT`.
To mitigate the secret-in-repo risk: PAT is scoped to publish-only
(cannot read other Marketplace data), the workflow runs in a
protected GitHub Environment (`marketplace`) requiring required-
reviewer approval, and the runbook documents a rotation cadence.

**Steps (paraphrased):**
1. Pre-session check: confirm publisher ID available (operator-driven).
2. Author `.github/workflows/publish-vscode.yml` with three+ jobs:
   - `classify` — strict regex on github.ref, outputs is_publish + version.
   - `build` — npm install in tools/dabbler-ai-orchestration/, vsce
     package, verify VSIX filename version matches tag, upload
     artifact.
   - `publish-marketplace` — gated by is_final, runs in marketplace
     environment, downloads VSIX, runs vsce publish.
   - Optionally also `npx ovsx publish` to Open VSX Registry as a
     gated separately so a publish failure doesn't block the primary.
3. Author `docs/planning/marketplace-release-process.md` covering:
   one-time setup, per-release checklist, rollback, failure-modes
   table, maintenance.
4. Bump extension version 0.12.0 → 0.13.0 (operator note: actually
   0.12.1 → 0.13.0 since Set 013 already bumped 0.12.0 → 0.12.1).
5. Pre-publish runbook dry run (operator-driven).
6. (Optional) Author npm run smoketest:vsix-marketplace. SKIPPED.
7. Test-run with vsix-v0.13.0-rc1 (operator-driven).
8. First production publish (operator-driven).
9. Verify post-publish (operator-driven).
10. End-of-session cross-provider verification (THIS IS THAT).
11. Commit, push, run close_session.py.

**Configuration:** requiresUAT: false, requiresE2E: false,
outsourceMode: first.

**Bundled change authorized in this session by the operator:** remove
the `Dabbler: Copy: Start next session — maxout Claude` command + its
session-set context-menu entry from the extension. Surface in the
v0.13.0 CHANGELOG `[Removed]` section. The broader `— maxout <engine>`
workflow concept stays documented in `docs/ai-led-session-workflow.md`.
```

---

## Files authored / changed in this session

### NEW: `.github/workflows/publish-vscode.yml`

Triggered on `vsix-v*` tag pushes. Four jobs:

- **classify** — strict regex on `github.ref_name`. Final pattern:
  `vsix-v[0-9]+\.[0-9]+\.[0-9]+`. RC pattern:
  `vsix-v[0-9]+\.[0-9]+\.[0-9]+-rc[0-9]+`. Outputs `is_final`,
  `is_rc`, and `semver_version` (the dashed pre-release form, since
  vsce/Marketplace use semver 2.0.0 natively without normalization).
  Anything else exits 1 with an error.
- **build** — needs `classify`. Working directory
  `tools/dabbler-ai-orchestration`. Steps: checkout, setup-node@v4
  (Node 20), `npm ci`, verify tag matches `package.json` version (Node
  inline script: string-equality check on the semver), `npx vsce
  package`, verify produced VSIX filename matches the expected
  `dabbler-ai-orchestration-<version>.vsix`, upload as workflow
  artifact (30-day retention).
- **publish-marketplace** — needs `[classify, build]`. Gated by
  `if: ${{ needs.classify.outputs.is_final == 'true' }}`. Runs in
  `marketplace` deployment environment with URL pointing at the
  Marketplace listing. Downloads the VSIX artifact, runs
  `npx --yes @vscode/vsce publish --packagePath <vsix> -p
  $VSCE_PAT`. The `VSCE_PAT` secret is bound at the environment
  level so the build job above does not have access to it. RC tags
  skip this job by design.
- **publish-openvsx** — needs `[classify, build, publish-marketplace]`.
  Gated identically by `is_final`. Runs in `openvsx` deployment
  environment. If `OVSX_PAT` is empty, logs a skip and exits 0
  (non-fatal — Marketplace publish above already succeeded). If
  populated, runs `npx --yes ovsx publish <vsix> -p $OVSX_PAT`.
  Sequential after publish-marketplace by design — Open VSX is the
  secondary registry, primary publish should land first.

### NEW: `docs/planning/marketplace-release-process.md`

Mirrors `docs/planning/release-process.md` (the PyPI runbook from
Set 010). Sections:

1. Why a Personal Access Token (not OIDC) — explains the gap
   (Marketplace doesn't support OIDC as of 2026-05-04) and the
   layered mitigations: PAT scoped to "Marketplace (publish)" only,
   environment binding, required-reviewer gate, annual rotation. Open
   VSX uses the same PAT model with the same mitigations.
2. Naming — Marketplace publisher ID `DarndestDabbler` (matches
   `package.json` `publisher` field), extension ID
   `dabbler-ai-orchestration` (matches `name` field), full
   Marketplace ID `DarndestDabbler.dabbler-ai-orchestration`. Open
   VSX namespace matches publisher ID. First Marketplace release
   `vsix-v0.13.0`.
3. Tag-pattern coexistence with PyPI — explicit statement that `v*`
   = PyPI, `vsix-v*` = Marketplace, prefix is load-bearing.
4. One-time setup (six numbered subsections):
   - 1. Create the Microsoft / Azure DevOps account that owns the
        publisher.
   - 2. Claim the Marketplace publisher ID.
   - 3. Mint the Marketplace PAT (Azure DevOps): name, organization
        "All accessible organizations" (required), expiration,
        scope = Marketplace → Manage.
   - 4. Configure the GitHub deployment environments — `marketplace`
        (with `VSCE_PAT` secret + required reviewer + optional
        branch restriction) and `openvsx` (with optional `OVSX_PAT`).
   - 5. (Recommended) Configure Open VSX Registry dual-publish.
   - 6. Verify by publishing a release candidate (optional).
5. Per-release checklist — eleven numbered steps from "decide the
   version" through "update consumer repos." Includes the optional
   RC dry-run path.
6. Rollback — two paths (patch forward, unpublish + patch forward)
   + the constraint that the Marketplace burns version slots like
   PyPI does (you cannot re-upload a deleted version).
7. Failure modes and how to recognize them — eight-row table
   covering tag mismatches, classify failures, PAT issues, publisher
   mismatches, RC tag-skipped-publish surprise, Open VSX namespace
   issues, CDN cache lag, missing files in the produced VSIX.
8. Maintenance — PAT rotation cadence, pinned actions review, Node
   version, `.vscodeignore`, ownership transfer, future OIDC
   migration when upstream lands.

### NEW: edits to `tools/dabbler-ai-orchestration/package.json`

```diff
-  "version": "0.12.1",
+  "version": "0.13.0",
```

```diff
       {
         "command": "dabblerSessionSets.copyStartCommand.parallel",
         "title": "Copy: Start next parallel session",
         "category": "Dabbler"
       },
-      {
-        "command": "dabblerSessionSets.copyStartCommand.maxoutClaude",
-        "title": "Copy: Start next session — maxout Claude",
-        "category": "Dabbler"
-      },
       {
         "command": "dabblerSessionSets.copySlug",
```

```diff
         {
           "command": "dabblerSessionSets.copyStartCommand.parallel",
           "when": "view == dabblerSessionSets && viewItem =~ /^sessionSet:(in-progress|not-started)/",
           "group": "3_copy@2"
         },
-        {
-          "command": "dabblerSessionSets.copyStartCommand.maxoutClaude",
-          "when": "view == dabblerSessionSets && viewItem =~ /^sessionSet:(in-progress|not-started)/",
-          "group": "3_copy@3"
-        },
         {
           "command": "dabblerSessionSets.copySlug",
```

### EDIT: `tools/dabbler-ai-orchestration/src/commands/copyCommand.ts`

```diff
 const startCommandPresets: Record<string, (slug: string) => string> = {
   default: (slug) => `Start the next session of \`${slug}\`.`,
   parallel: (slug) => `Start the next parallel session of \`${slug}\`.`,
-  maxoutClaude: (slug) => `Start the next session of \`${slug}\`. — maxout Claude`,
 };

 const presetLabels: Record<string, string> = {
   default: "start next session",
   parallel: "start next parallel session",
-  maxoutClaude: "start next session — maxout Claude",
 };
```

### EDIT: `tools/dabbler-ai-orchestration/CHANGELOG.md`

```diff
 ## [Unreleased]

+## [0.13.0] — 2026-05-04
+
+### Added
+- VS Code Marketplace launch: this is the first version published as
+  `DarndestDabbler.dabbler-ai-orchestration` on
+  `marketplace.visualstudio.com`. Install via
+  `code --install-extension DarndestDabbler.dabbler-ai-orchestration`
+  or the VS Code Extensions UI; no more local VSIX hunt.
+- `.github/workflows/publish-vscode.yml` — tag-driven publish workflow
+  for the VS Code Marketplace and Open VSX Registry. Triggered on
+  `vsix-vX.Y.Z` (publish) and `vsix-vX.Y.Z-rcN` (build-only) tags.
+  See `docs/planning/marketplace-release-process.md` for the per-release
+  checklist.
+
+### Removed
+- `Dabbler: Copy: Start next session — maxout Claude` command (and the
+  matching session-set context-menu entry). The "maxout" suffix as a
+  per-session token-window override is no longer surfaced as a
+  one-click affordance; the broader `— maxout <engine>` workflow
+  concept remains documented in `docs/ai-led-session-workflow.md` for
+  operators who want to type the suffix manually.
+
 ## [0.12.1] — 2026-05-04
```

### EDIT: regenerated compiled artifacts

- `tools/dabbler-ai-orchestration/out/commands/copyCommand.js`
  — TS `out/` regenerated via `npx tsc --outDir out`. `grep -c
  maxoutClaude` returns 0.
- `tools/dabbler-ai-orchestration/dist/extension.js` — bundled artifact
  regenerated via `npm run compile` (esbuild). `grep -c maxoutClaude`
  returns 0.

---

## What to verify

Please act as the cross-provider verifier. Apply the standard
session-verification template (return JSON
`{"verdict": "VERIFIED" | "ISSUES_FOUND", "issues": [...]}` with each
issue carrying severity Critical/Major/Minor).

Specifically probe:

1. **Workflow `classify` job correctness.** The two regexes —
   `^vsix-v([0-9]+\.[0-9]+\.[0-9]+)$` (final) and
   `^vsix-v([0-9]+\.[0-9]+\.[0-9]+)-rc([0-9]+)$` (RC) — do they
   correctly accept canonical examples (`vsix-v0.13.0`,
   `vsix-v0.13.0-rc1`, `vsix-v1.10.5`) and reject the cases the
   runbook calls out (`vsix-v1.0.0rc1` without dash, `vsix-v1.2`,
   `vsix-vfoo`, plain `v0.13.0`, `vsix-v0.13`)? Does `is_final` and
   `is_rc` come out the right way around for each canonical example?
   Are the outputs wired correctly (`>> "$GITHUB_OUTPUT"` on each
   line)?

2. **Workflow tag-vs-package.json verify step.** The Node inline
   script reads `package.json`, compares its `version` field to
   `EXPECTED_VERSION`, and exits 1 on mismatch. Is the comparison
   correct for all four cases the runbook implies: tag matches
   package.json (pass), tag is final but package.json carries a
   pre-release suffix (fail), tag is RC but package.json carries the
   final form (fail), tag and package.json are both pre-release
   matching strings (pass)? Is the error message clear enough that
   the operator knows what to fix?

3. **Workflow VSIX-filename verify step.** The script greps for
   `dabbler-ai-orchestration-${EXPECTED_VERSION}.vsix`. Does this
   correctly handle the pre-release case where vsce's filename would
   be `dabbler-ai-orchestration-0.13.0-rc1.vsix` (semver 2.0.0
   filename form), or does it implicitly assume the final form?
   Belt-and-suspenders against vsce regression — is this step
   doing the work it claims to?

4. **Workflow `publish-marketplace` job gating.** Final tags only
   (`is_final == 'true'`); environment is `marketplace` with the
   `VSCE_PAT` bound at the environment level (not the repo level).
   Does this give the correct security posture — RC tags can't
   accidentally consume the secret, and the build job above can't
   read it either? Is the `vsce publish` invocation correct
   (`--packagePath` argument, `-p` for the PAT)? Does the job's
   `environment.url` resolve to a working Marketplace URL pattern
   (`https://marketplace.visualstudio.com/items?itemName=DarndestDabbler.dabbler-ai-orchestration`)?

5. **Workflow `publish-openvsx` job soft-skip behavior.** When
   `OVSX_PAT` is empty, the script logs a message and exits 0. Is
   this a sound design choice (Marketplace publish above already
   succeeded, Open VSX is secondary) or does it mask a configuration
   bug an operator who *intended* to dual-publish would miss? Is the
   soft-skip message clear enough to not be lost in CI logs?

6. **Tag-pattern coexistence claim.** The runbook says `v*` triggers
   `release.yml` (PyPI) and `vsix-v*` triggers `publish-vscode.yml`
   (Marketplace). Is this claim correct given each workflow's `on:`
   block? Specifically: does `release.yml`'s `on.push.tags: ['v*']`
   filter the `vsix-v*` tags out (it shouldn't — `v*` matches
   `vsix-v0.13.0` too unless the classify job rejects it)? Does
   `release.yml`'s classify job correctly reject `vsix-v*` tags by
   the strict regex `^v([0-9]+\.[0-9]+\.[0-9]+)$`? Either way, is the
   prefix design sound or does the runbook's claim need a
   correction?

7. **Runbook one-time-setup completeness.** The six subsections
   cover Microsoft account, publisher claim, PAT minting, GitHub
   environments, Open VSX dual-publish, and an optional RC verify.
   Is every step actionable by an operator who has not done a
   Marketplace publish before — including the small details (PAT
   organization scope = "All accessible organizations" being
   required, the publisher ID being case-insensitive but case-
   preserving, the Open VSX GitHub OAuth flow)? Any step that
   silently assumes prior Marketplace knowledge is at least Minor.

8. **Runbook per-release checklist completeness.** Eleven numbered
   steps. Compare against Set 010's `release-process.md` per-release
   checklist (which closed VERIFIED). Are the structural elements
   present: version decision rule, package.json bump, release notes
   authoring, commit, optional RC dry run, tag and push, deployment
   approval, post-publish smoke test, GitHub release creation
   (optional), consumer repo update? Is the order sensible (i.e.,
   doesn't ask the operator to do something out of dependency
   order)?

9. **Runbook failure-modes table actionability.** Eight rows. For
   each: does the symptom describe what the operator actually sees
   in the UI / logs, does the cause point at the right thing, and
   does the fix tell the operator exactly what to do (not just
   "investigate")? Any row where the symptom is vague or the fix
   handwaves is at least Minor.

10. **Bundled `maxoutClaude` removal: are stale references left?**
    The change removes the preset from copyCommand.ts and the
    package.json command + view-item-context entries. The compiled
    artifacts (`out/commands/copyCommand.js` and `dist/extension.js`)
    were regenerated; the source authoritatively no longer mentions
    `maxoutClaude`. Are there other references that would now be
    stale — in tests, in CHANGELOG entries beyond the [0.13.0]
    Removed line, in the extension's own README, in the repo-root
    README's command list, in any AGENTS.md / CLAUDE.md / GEMINI.md?
    Note: the `— maxout <engine>` *workflow concept* remains
    documented in `docs/ai-led-session-workflow.md` by design (the
    typed phrase suffix still works for operators who want it). Only
    the one-click menu affordance was removed. Flag if any surface
    suggests the menu still exists.

11. **CHANGELOG `[0.13.0]` accuracy.** The entry covers two distinct
    things: the Marketplace-launch infrastructure (workflow + runbook)
    and the maxoutClaude removal. Is the framing of each accurate? Is
    the mapping of "shipped in this release" tight — i.e., the entry
    doesn't promise things that didn't actually land in this VSIX?
    Specifically the Marketplace-launch claim: at this commit, the
    workflow file exists but the human-driven publisher account setup
    + first publish has not yet happened. Does the CHANGELOG over-
    promise that the extension is *on* the Marketplace, or correctly
    frame the v0.13.0 VSIX as Marketplace-publish-*ready*?

12. **Anything else the spec called out.** The spec's Session 2
    cross-provider-verification step says the verifier should review
    "workflow correctness (regex gates, env-protection wiring,
    classify-job logic), runbook completeness (all human-driven
    steps documented, all failure modes actionable), the dual-
    publish-to-Open-VSX decision rationale." Confirm each is covered
    above and flag anything specific to those probes that you'd want
    to see addressed.

Return your verdict in the standard JSON shape.
