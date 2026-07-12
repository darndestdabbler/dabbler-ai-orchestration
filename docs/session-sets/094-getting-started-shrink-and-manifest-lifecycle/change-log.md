# Change Log — Set 094: Getting Started Shrink & Manifest Lifecycle

> **Set D** (final) of the operator-confirmed Work Explorer module-first
> redesign (091–094). Finishes the onboarding/lifecycle half and **prepares
> the single 091–094 release boundary**: when this set closes, the extension
> (bumped to **0.42.0**) is publish-ready pending the operator
> (tag `vsix-v0.42.0`). Prerequisite: `093-work-explorer-module-row-interactions`.

## Session 1 — Form shrink + create-on-demand manifest lifecycle

The Getting Started form shrank to **two sections** — *Build project
structure* (tier / seat-profile / budget / verification-mode, substantially
as before) and *Define modules (optional)* — retiring the old plan /
session-set steps, the S3 New-module button, and the parallel-sets checkbox
(their flows survive on Set 093's per-module rows + the palette). A shared
`ensureModulesManifest` primitive creates `docs/modules.yaml` from the
canonical `MODULES_YAML_TEMPLATE` on **explicit user action only**
(adjudication A — never on activation), wired into the scaffold (sole
writer), the form's *Open modules.yaml* action, and the new
`dabbler.openModulesManifest` toolbar command; Add-module derives a created
manifest from the same template. The completion model re-derived to
`structureBuilt` alone (retiring the orphaned `planPresent` /
`sessionSetsPresent` flags + three dead payload probes) and dropped the
orphaned `docs/session-sets/*` watcher glob. The write primitive is a
genuinely atomic, symlink-safe, no-replace hard-link publish
(`writeFileExclusiveSync`), converged over an **8-round** cross-provider
verification. Suite green (pytest 2922/6, extension unit 1471, Playwright 26);
cross-provider **VERIFIED** (round 8).

## Session 2 — D6 prompt, parallel shelving escape hatch, docs pass & release prep

- **D6 module-decomposition copy-prompt** — a new
  `dabbler.copyModuleDecompositionPrompt` command **and** a *Copy AI
  decomposition prompt* button in the Define-modules section (the
  `copy-decomposition-prompt` form action) share one flow: `ensureModulesManifest`
  runs FIRST (the **fourth** explicit-action ensure-write site — never a
  passive/render path), then a **pointer-style** prompt (references
  `docs/modules.yaml` + the project plan, states the invariants: globally-unique
  set names, `module` = grouping-not-identity) is copied. Referenced from the
  manifest header comment (never embedded as a giant comment block).
- **Parallel-sets UI shelved with an escape hatch** — the primary decomposition
  paths no longer emit the parallel guidance; the advanced
  `dabbler.generateParallelSessionSetPrompt` Command-Palette command is now the
  sole live feeder of `PARALLEL_GUIDANCE` (routed ruling 1a, chosen over a
  sticky `parallelHint` setting that would contaminate the common path). The
  `prerequisites:` machinery + worktree tooling are untouched — regression-pinned
  (the default prompt still documents `prerequisites:`; the parallel-session
  commands stay contributed).
- **Docs pass** — the Q8 compat matrix marked **shipped-state** (Sets 092–094
  landed); quick-start + both READMEs updated for the two-section form; the
  092 "Session Set Explorer" → "Work Explorer" rename residue swept across the
  live docs (20 renames; 2 historical release-records preserved). The
  `getting-started.md.template` teaching-doc rewrite + onboarding screenshots
  are **deferred to Set 095** (the verdict-assigned onboarding rewrite) —
  recorded as a pre-publish caveat.
- **Release prep** — extension bumped **0.41.0 → 0.42.0** as the single
  091–094 release-boundary VSIX; omnibus CHANGELOG entry covering Sets 087 +
  091–094 (superseding the never-published 0.41.0 / Set 086). Publish is
  operator-gated (tag-driven, workflow verifies tag vs `package.json`).
  Extension-only — no coordinated `dabbler-ai-router` bump.

Suite green at close (pytest 2922/6, extension unit 1487, Playwright 26, tsc
clean). Cross-provider verification (gpt-5-6, anthropic excluded): R1/R2 each
surfaced one Major on the **shipping extension README's onboarding sequence**
(it described a circular path — module-row actions create the first set, yet
the tree carrying those rows only appears after the first set exists). Fixed in
flight by tracing `selectExplorerMode` and documenting the actual behavior (form
while zero sets → the **Command Palette** creates the first plan + set → the
tree with per-module row actions appears once ≥1 set exists). Operator
adjudicated the fix as resolving the Major at the 2-round cap
(`ISSUES_FOUND_RESOLVED_IN_FLIGHT`, closed via attested `--manual-verify`).

## End-of-set outcome

The 091–094 Work Explorer module-first redesign is complete and publish-ready
at extension **0.42.0** (operator-gated). Follow-ons per the verdict: **Set 095**
(Hello World walkthrough + comprehensive UAT re-cut + the deferred teaching-doc
rewrite / screenshot refresh) documents the new UX; the re-attached
locator/scope-check and physical-moves sets proceed per their own re-attach
points.
