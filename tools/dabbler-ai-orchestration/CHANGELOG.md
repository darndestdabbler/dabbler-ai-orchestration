# Changelog

All notable changes to Dabbler AI Orchestration are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.45.0] — Unreleased (Set 102 — git workflow automation)

> **The Set 102 release boundary: confirm-gated git-workflow automation.**
> The framework now runs the mechanical trunk-based git — push a session
> branch and open its PR, sync-and-clean-up after the merge, cut a release
> tag, start a hotfix, roll back — while the human keeps every judgment
> call: PR review/approval, branch-protection policy, what/when to release,
> rollback authorization. Every command previews the exact command lines it
> will run and waits for the operator's confirm (an AI agent may *invoke*
> the commands; the modal always goes to the human). Marketplace + Open VSX
> publish stays an **operator-gated** action (push tag `vsix-v0.45.0` per
> the [CONTRIBUTING publish runbook](../../CONTRIBUTING.md#publishing); the
> workflow verifies the tag against this `package.json` version). Until
> then the registry-live extension remains `0.40.0`, with
> `0.42.0`/`0.43.0`/`0.44.0` also queued ahead of this one.
>
> **Extension-only** — `dabbler-ai-router` stays at `0.33.0`; zero
> `ai_router/` changes accrued across Set 102.

### Added

- **(Set 102 S1) `Dabbler: Open PR for this set` — dual-host PR
  automation.** Pushes the current branch and creates the pull request via
  the host CLI (`gh pr create` on GitHub/GHE, `az repos pr create` on Azure
  DevOps — org/project/repo parsed from the remote URL, no `az devops
  configure --defaults` needed), with a templated title/body linking the
  session set; the created PR's URL is reported and opened. Confirm-gated:
  the modal lists the exact push + PR-create lines and nothing else runs.
  Refuses from the trunk, a detached HEAD, or a missing `origin`; a dirty
  tree warns (uncommitted changes won't be part of the PR) before
  proceeding. **No-CLI degradation floor:** the push still happens (pure
  git) and the host's create-a-PR web page opens with install/auth
  guidance — the operator is never stranded.
- **(Set 102 S1) `Dabbler: Finalize merged set` — post-merge
  sync-and-clean-up.** After the operator merges on the host: `git pull
  --ff-only` + `git worktree remove` + `git branch -d` + `git fetch
  --prune` as one confirm-gated action from the main checkout. Idempotent
  and safely re-runnable (an already-done step reports itself and the flow
  continues); only `session-set/*` worktrees/branches are candidates;
  `-d` never `-D` (an unmerged branch refuses rather than losing work).
  Refuses from inside a worktree, off the trunk, or on a dirty tree.
- **(Set 102 S1) Git-host detection + host-CLI preflight** (the one
  host-specific seam; everything else in the command set is pure git).
  `utils/gitHost.ts` classifies the `origin` remote across all real URL
  forms — GitHub https/ssh/scp and Azure DevOps `dev.azure.com`,
  `{org}.visualstudio.com` (incl. `DefaultCollection`), and
  `ssh.dev.azure.com` v3, with percent-decoded project/repo names — and
  reads the **configured** `remote.origin.url` so `url.insteadOf`
  transport rewrites don't change the logical host. `utils/hostCli.ts`
  probes for the CLI the detected host needs in the shapes the CLIs
  actually ship as on Windows (`gh.exe`, `az.cmd`) and never hard-fails.
  On win32, `.cmd` targets spawn through `cmd.exe /d /s /c` with
  conservatively validated arguments (the BatBadBut hardening): free text
  carrying a cmd metacharacter is refused up front with an
  operator-actionable message.
- **(Set 102 S1) Settings:** `dabblerSessionSets.gitHost` (`auto` |
  `github` | `azure-devops`) — the explicit override for hosts auto-detect
  cannot know (chiefly GHE custom domains) — plus
  `dabblerSessionSets.ghCliPath` / `dabblerSessionSets.azCliPath`
  executable-path overrides mirroring `copilotCliPath`.
- **(Set 102 S2) `Dabbler: Cut release tag` — the release gate.** Creates
  an **annotated** tag and pushes it to origin, with a mandatory,
  non-bypassable operator confirm. Live ref-format validation,
  existing-tag refusal (pushed tags are immutable by convention), and the
  tag is pinned to the resolved commit sha shown in the dialog — a branch
  moving while the modal is open cannot change what gets tagged.
- **(Set 102 S2) `Dabbler: Start hotfix from tag` / `Dabbler: Roll back to
  tag` — the recovery drills.** Hotfix branches from the deployed tag
  (never the trunk, which may hold unreleased work); rollback is
  redeploying the previous tag (`git checkout <tag>`, detached HEAD, with
  return-to-trunk guidance) — not git surgery. Both refuse a dirty tree,
  and tag listing distinguishes "repo has no tags" from "not a git
  repository" so the drills error honestly from a non-repo folder. Pure
  git, host-agnostic by construction.
- **(Set 102 S3) Automation-first tutorial re-cut.** The hello-world
  tutorial's main flow now teaches "the human approves; the framework runs
  the git," with every human-decision point called out and the per-set
  loop host-neutral across GitHub and Azure DevOps (ADO-equivalent
  callouts annotate the GitHub-worked one-time bootstrap). New **Part 0.5
  per-host setup section** (install + auth + settings + what "green" looks
  like, mirroring the in-product preflight guidance) and a new **"Git
  under the hood" appendix** with the exact raw command sequence each
  automated action runs (PR step shown for both hosts) plus what the
  automation deliberately does **not** cover. README, quick-start, and the
  scaffolded getting-started template now reference the five commands.

### Verification

- ~120 new unit tests across S1/S2 (remote-URL parse table over every
  ADO/GitHub form; CLI-absent, unknown-host, confirm-declined, and
  dirty-tree paths; mandatory-confirm non-bypassability; tag/branch-name
  validation; hotfix/rollback mechanics) + package.json command-surface
  pins. Live dogfoods: a real GitHub PR round-trip (open → merge →
  finalize, asserting the local end-state) and real-git tag/hotfix/
  rollback drills against a scratch repo with a bare remote. The Azure
  DevOps live walk is an **armed operator UAT** (needs an ADO org); the
  ADO code paths are pinned by the unit suite.

## [0.44.0] — Unreleased (Sets 098–101 — module-lifecycle simplification)

> **The single 098–101 release-boundary VSIX.** The four-set
> module-lifecycle-simplification bundle ships together (a half-shipped
> lifecycle UX is worse than either whole): set kinds (098) → rename/delete
> writers (099) → the flattened, lifecycle-action tree (100) → the real
> `default` scaffold + docs (101). Marketplace + Open VSX publish stays an
> **operator-gated** action (push tag `vsix-v0.44.0` per the
> [CONTRIBUTING publish runbook](../../CONTRIBUTING.md#publishing); the
> workflow verifies the tag against this `package.json` version). Until
> then the registry-live extension remains `0.40.0`, with `0.42.0`/`0.43.0`
> also queued ahead of this one.
>
> **Extension-only** — `dabbler-ai-router` stays at `0.33.0`; zero
> `ai_router/` changes accrued across Sets 098–101, so no coordinated PyPI
> bump is required.

### Added

- **(Set 098) The `kind: plan | decomposition` session-set identity.** An
  optional `spec.md` config field (raw-captured, warn-and-degrade on an
  unknown value; every pre-098 spec is unchanged), two scaffolded
  lifecycle-set templates (`module-plan-set` / `module-decomposition-set`,
  the latter prerequisite-linked to the former), and a reusable
  `scaffoldModuleLifecycleSets` writer that mints a module's
  `NNN-<slug>-plan` + `NNN-<slug>-decomposition` starter sets (renders from
  the checked-in templates; identity-based skip-existing; parse-after-write
  guarded). A quiet, presentation-only kind badge renders on set rows.
- **(Set 099) Transactional module Rename and Delete writers** (palette:
  `Dabbler: Rename Module`, `Dabbler: Delete Module`). Rename is
  all-or-nothing: it rewrites the `docs/modules.yaml` entry (format-
  preserving) and restamps `module: <old>` → `module: <new>` in every
  affected set, rolling back on any failure; it refuses a slug that
  collides with an undeclared slug already carrying stamped sets, and
  refuses while any affected set has a running session. Delete removes the
  manifest entry and, per set, leaves completed/cancelled history
  untouched, removes only unstarted clean scaffolds outright, and cancels
  any in-flight set (never hard-deletes work).
- **(Set 100) Module-row lifecycle actions** — `Open Plan`, `Add Module…`,
  `Rename Module…`, `Delete Module…` on the row strip + context menu
  (declared modules only; the pseudo `Unassigned` module keeps only
  `Open Plan` + `Assign legacy sets to module…`). `Add Module…` now also
  scaffolds the new module's two lifecycle sets.
- **(Set 101) A real `default` module on fresh Build.** `Build project
  structure` now declares a `default` module in `docs/modules.yaml` and
  scaffolds its `001-default-plan` + `002-default-decomposition` starter
  sets — the Visual Studio `Class1` pattern (a working starting point,
  rename-or-delete one action away). Gated to a genuinely fresh scaffold:
  a re-run, or a legacy repo that already has `docs/session-sets/` content,
  is left byte-for-byte untouched. The consumer-bootstrap
  `getting-started` / `start-here` docs teach the pattern; a new
  [`docs/module-reorganization.md`](../../docs/module-reorganization.md)
  guide covers rename/delete/split/merge and the optional legacy-repo
  migration recipe.

### Changed

- **(Set 100) The module subtree is flattened.** Status buckets
  (`In Progress` / `Not Started` / `Complete` / `Cancelled`) are now the
  module's **direct** children; the scaffolded decomposition set's
  blocked-until-plan signal rides its existing `prerequisites:` gate.
- **(Set 101) Onboarding docs re-cut to the shipped flow.** The scaffolded
  `getting-started.md`, the repo `quick-start.md`, the extension README,
  and the three-person Hello World tutorial teach Build → Default module +
  starter sets → run the plan set → run the decomposition set →
  rename/delete Default, with no references to retired UI.

### Removed

- **(Set 100) The Set 093 persistent `Plan` / `Session sets` child nodes**
  (and the `blocked-until-plan` module state / `deriveModuleChildren`
  plumbing) — superseding the unpublished `0.42.0` behavior — and the
  **`AI Plan` / `Import Plan` / `AI Sets` module-row strip actions**. Their
  underlying flows survive **palette-only**
  (`Dabbler: Import Project Plan`, `Dabbler: Generate Session-Set Prompt`,
  `Dabbler: Copy Module Decomposition Prompt`) for legacy repos that
  predate `kind` sets.

## [0.43.0] — Unreleased (Set 097 — Copilot seat-status visibility + module-ownership copy)

Extension-only release: `dabbler-ai-router` stays at 0.33.0 (zero
`ai_router/` changes in this set). Publish remains **operator-gated**
(tag-driven, same runbook as 0.42.0); the registry-live extension is
still `0.40.0` until the operator publishes the queued 0.42.0/0.43.0
work.

### Added

- **`Dabbler: Set Up Copilot Seat` command.** Re-runs the Copilot seat
  probe and confirmation-gated `transport.profile` promotion
  (`performCopilotSeatSetup`, unchanged from Set 079) against an
  already-scaffolded workspace's existing `.venv` — reachable from the
  Command Palette regardless of whether the Getting Started form is
  still showing. Added after cross-provider verification caught that
  the persistent seat-status note's advertised recovery command (a bare
  `python -m ai_router.copilot_catalog --refresh …` invocation) never
  actually promoted the profile, and that the ONLY other path to that
  promotion — the form's Build action — is unreachable once a workspace
  has any session sets at all.

### Fixed

- **A cancelled or unconfirmed Copilot seat setup no longer silently
  reverts the Getting Started form, and the recovery path actually
  works.** Three bugs in the same defect chain, all caught before
  shipping (one operator-reported, two by this session's own
  cross-provider verification):
  - The System Status strip now shows a **persistent** note — "You
    selected the GitHub Copilot CLI seat during setup, but it is not
    confirmed yet… Re-run seat setup (no need to re-scaffold): run
    \"Dabbler: Set Up Copilot Seat\" from the Command Palette" —
    whenever the workspace's durable evidence says the operator chose
    the Copilot seat but the seat is not confirmed (cancelled,
    missing/unauthenticated CLI, fewer than 2 confirmed provider
    families, or the scaffold's install never completed). The note is
    derived from a new one-word `.dabbler/copilot-seat-status` marker
    plus the existing `transport.profile` read — never a nag on a
    workspace that never chose Copilot, and never suppressed by a form
    that has (silently or otherwise) repainted back to Full/Direct API,
    since surviving that exact repaint is the point. The marker clears
    on an explicit Direct-API rebuild, so abandoning Copilot in favor of
    the default does not revive the note forever.
  - The Getting Started form's Copilot radio no longer snaps back to
    "Direct provider API keys" the first time `router-config.yaml` is
    seeded. A profile seed's first-ever transition from *nothing on
    disk yet* to a value is now recognized as the template default
    materializing, not a newer sanctioned choice — it no longer
    overrides an explicit Copilot pick made in the interim. A
    genuinely **changed** seed (e.g. a later confirmed seat) still
    updates the radio exactly as before.
- Independent of the volatile in-form control state by design;
  `.venv`/`ai_router` transport-profile confirmation itself (Set 086) is
  unchanged — this only fixes what the operator is told, shown, and can
  actually DO while the seat isn't yet confirmed.

### Changed

- **Module-ownership copy reframed from team grouping to ownership
  exclusivity** (operator directive): a module is a unit of work for
  **one developer at a time**, not "one team per module" — the same
  developer may own several modules, but two developers should never
  work the same module concurrently, since AI-led changes land fast
  enough to make that a constant merge-conflict source. Updated at
  both shipped copy sites (the Getting Started form's Define-modules
  section, the `Copy AI decomposition prompt` command's prompt text)
  and echoed across the module-organized-projects primer (new
  merge-storm rationale in §1.2), the Hello World walkthrough, and
  both READMEs.
- **README screenshot refreshed.** `getting-started.png` shows the new
  module-ownership copy (captured against a locally built
  0.43.0-candidate build).

## [0.42.0] — Unreleased (Sets 087 + 091–094 — Work Explorer module-first redesign)

> **The single 091–094 release-boundary VSIX** (verdict: no Marketplace
> publish until Sets A–D of the Work Explorer module-first redesign are all
> in — a half-migrated UX is worse than either whole). The Marketplace +
> Open VSX publish stays an **operator-gated** action (push tag
> `vsix-v0.42.0` per the [CONTRIBUTING publish runbook](../../CONTRIBUTING.md#publishing);
> the workflow verifies the tag against this `package.json` version). Until
> then the registry-live extension remains `0.40.0`.
>
> **Supersedes the never-published `0.41.0`** (Set 086, below): `0.41.0` was
> prepared but never tagged/published, so a `0.40.0 → 0.42.0` upgrade also
> delivers the Set-086 diagnostics/verdict-legibility changes documented
> under `0.41.0`. Extension-only — no coordinated `dabbler-ai-router` bump
> is required (the module-first redesign adds no new router dependency; the
> router's own 088–090 work is a separate, independently-gated release).
>
> **Pre-publish note — teaching doc resolved by Set 095; screenshot still
> pending:** the scaffolded `getting-started.md` teaching doc is re-cut
> for the two-section form + modules UX (see Changed below), so
> newly-scaffolded repos get an accurate onboarding doc. Still open for
> the operator before (or shortly after) publish: `media/getting-started.png`
> shows the pre-redesign three-step form while the README captions it as
> the two-section form — retake that screenshot in a live VS Code window
> (the hero `session-set-explorer-and-spec.png` was already retaken in
> Set 092).

### Added

- **(Set 087) Module-organized projects — the `docs/modules.yaml` manifest
  + Work Explorer module grouping.** A tolerant manifest reader
  (`slug`/`title`/`codeRoots`/`planPath`/`touches`), fail-loud global
  session-set-name uniqueness, the "New Module" scaffold + module-target
  picker the authoring flows share, and an Explorer tier that groups
  session sets by module (module → status buckets → rows), with CODEOWNERS
  + monorepo-CI ownership templates.
- **(Set 091) Empty-manifest validity + the always-present canonical
  template.** `modules: []` and a bare `modules:` now read as a VALID empty
  manifest; the appender grows either empty form into its first block-style
  entry; `MODULES_YAML_TEMPLATE` (header comments + commented examples +
  `modules: []`) is the canonical scaffold. Pseudo-module semantics
  (`Default`/`Unassigned`), undeclared-slug fallback groups, and the legacy
  root-plan mapping ship the Q8 compat matrix
  ([`docs/planning/work-explorer-compat-matrix.md`](../../docs/planning/work-explorer-compat-matrix.md)).
- **(Set 093) Persistent per-module `Plan` / `Session sets` child nodes**
  (state-bearing: present/missing, blocked-until-plan/empty/bucketed) and
  the **module-row action strip / context menu** (AI plan, import plan,
  open plan, AI sets, and the `Unassigned`-only "Assign legacy sets to
  module…" atomic stamp flow).
- **(Set 094) Create-on-demand `docs/modules.yaml` + the two-section
  Getting Started form.** The form shrinks to **Build project structure**
  + **Define modules (optional)**; `docs/modules.yaml` is created from the
  canonical template on **explicit user actions only** (never on
  activation — adjudication A) across five call sites (scaffold, the form's
  and toolbar's **Open modules.yaml**, **Add module**, and the D6 copy).
  New Work Explorer toolbar **Open modules.yaml** button
  (`dabbler.openModulesManifest`).
- **(Set 094 S2) The D6 module-decomposition copy-prompt command**
  (`dabbler.copyModuleDecompositionPrompt`, plus a **Copy AI decomposition
  prompt** button in the Define-modules section) — a pointer-style prompt
  that has an AI agent decompose the project into modules and fill in
  `docs/modules.yaml`; it is the fourth ensure-write site and is referenced
  from the manifest header comment.
- **(Set 094 S2) `dabbler.generateParallelSessionSetPrompt`** — the
  advanced Command-Palette escape hatch that re-enables the parallel-sets
  decomposition guidance for the narrow multiple-branches-in-one-module
  case (see Changed).

### Changed

- **(Set 092) Single-dialect renderer + the "Work Explorer" rename.** The
  host/webview render through one module-aware dialect
  (`computeVisibleModules` / `buildVisibleModulePayloads`); the sole
  pseudo-module auto-expands and is de-emphasized; a **System Status /
  diagnostics strip** surfaces provider-key/Python/workspace-init faults
  and `modules.yaml` validation warnings (last-known-good render; never
  auto-overwrites an invalid manifest). The tree view's display label is
  now **Work Explorer** (the contributed view id is unchanged).
- **(Set 094 S2) Parallel-session-sets UI shelved (reversible).** The
  "Create parallel session sets where possible" form checkbox and its
  primary-path prompt guidance are removed; the `prerequisites:` ordering
  machinery and the worktree tooling are untouched (the parallel guidance
  survives only behind the new `dabbler.generateParallelSessionSetPrompt`
  escape hatch).
- **(Set 094) Getting Started completion model re-derived** to the single
  `structureBuilt` flag; the orphaned `planPresent`/`sessionSetsPresent`
  flags and the retired plan / session-set / New-module form actions left
  the form (Set 093's per-module row actions + the Command Palette own them
  now).
- **(Set 095) Getting Started teaching doc re-cut for the module-first
  UX.** The scaffolded `getting-started.md` (from
  `getting-started.md.template`) now teaches the shipped flow: the
  two-section form, the new **Define Modules (Optional)** step
  (`Open modules.yaml` / `Copy AI decomposition prompt`), the
  palette-first creation of the first plan + set (the form is replaced by
  the tree once the first set exists), the per-module row actions, and
  the left-click starter line (parallel guidance re-homed to the advanced
  palette command). Cold-start goldens + bundled `dist/templates`
  regenerated. Ships with the new team tutorials the READMEs and
  quick-start now link:
  [`docs/tutorials/module-team-hello-world.md`](../../docs/tutorials/module-team-hello-world.md)
  (the three-person Hello World walkthrough) and its
  [module workflow review prompt](../../docs/tutorials/module-team-hello-world-review-prompt.md).

### Rollback

- Install `0.40.0` (confirmed live on the VS Code Marketplace, published
  2026-07-07): `code --install-extension
  DarndestDabbler.dabbler-ai-orchestration@0.40.0`. `0.40.0` predates the
  module-first redesign — the Work Explorer renders the pre-087 flat
  session-set list; no state or config migration is involved (the
  `docs/modules.yaml` manifest is simply ignored by the older renderer).

## [0.41.0] — Unreleased, superseded by 0.42.0 (Set 086 — Copilot-seat verdict legibility + setup-checklist onboarding)

> Prepared in Set 086 (S2) but **never tagged or published standalone** —
> **superseded by `0.42.0` above**, which is the VSIX that actually ships
> these changes to the Marketplace. Left here as the record of the Set-086
> work folded into that release. Accompanies `dabbler-ai-router 0.31.0`.

### Added

- **(Set 086 S2) Verdict-legibility guardrail in the Session Set
  Explorer.** A persisted `verificationVerdict` the reader does not
  recognize — e.g. the confabulated `manual-override-development` the
  Set-086 root-cause incident wrote — is now **flagged as unrecognized**
  in the verdict hover tooltip instead of being rendered verbatim as if
  it were a clean verdict. New pure predicate
  `tierLegibility.isRecognizedVerdictToken` (prefix-lenient reader
  vocabulary — `VERIFIED` / `ISSUES_FOUND` / `WAIVED` — mirroring the
  strict router-side writer allowlist); `verdictFractionTooltip` uses it.

### Changed

- **(Set 086 S2) Onboarding copy links the Copilot-seat setup
  checklist.** The Getting Started teaching doc
  (`getting-started.md.template`, both the step-1 Copilot-seat paragraph
  and the missing-CLI troubleshooting), the cold-start operative doc
  (`start-here.md.template`), the form's missing-CLI warning
  (`gettingStartedHtml.js`), and the root `README.md` now point at
  `docs/copilot-seat-setup-checklist.md` (install → tenant login →
  auth-preflight), making explicit that an unauthenticated seat is
  blocked at session start rather than silently faking verification.
  Cold-start goldens + bundled `dist/templates` regenerated.

## [0.40.0] — 2026-07-07 (Set 085 — scaffold bundle points sessions at the session constitution)

> Template-bundle-only release accompanying `dabbler-ai-router 0.30.0`
> (the preload manifest + ratcheting ceiling gate). No extension code
> changes.

### Changed

- **(Set 085 S2) The scaffolded consumer-bootstrap bundle teaches the
  slimmed per-session reading contract.** `engine-file.shared-body.md`
  and `start-here.md.template` (and their shipped `dist/templates`
  copies) now link the **session constitution**
  (`docs/session-constitution.md` in the orchestration repo) as the
  happy-path operating doc, and mark the full workflow doc as an
  **on-demand** reference for rare branches instead of required
  reading.

### Rollback

- Install `0.39.0` (confirmed live on the VS Code Marketplace,
  published 2026-07-07): `code --install-extension
  DarndestDabbler.dabbler-ai-orchestration@0.39.0`. Scaffolds produced
  by 0.39.0 simply lack the constitution link; no state or config
  migration is involved.

## [0.39.0] — 2026-07-07 (Sets 083 + 084 — mandatory verification in the scaffold bundle; identity, exclusion, stamped evidence, close backstop taught in the shipped docs)

> The extension ships the consumer-bootstrap template bundle in the VSIX.
> This minor bundles the Set 083 scaffold changes (which never shipped on
> their own) with the Set 084 template + doc updates.

### Changed

- **(Set 083) Scaffolded `start-here.md` teaches mandatory verification with
  no skip branch.** Step 5 is now `python -m ai_router.verify_session` on
  every Full-tier session (the routed-gate step and its "if SKIP, record the
  null-verdict skip" instruction are gone — the Set 068 SKIP path is
  retired by operator decision after the 2026-07-06 UAT incident); Step 6
  closes via `close_session`, and the text states the close gate refuses an
  unverified Full-tier close. The engine bootstrap tails
  (`AGENTS.md`/`GEMINI.md`) now say cross-provider verification is
  mandatory before every close; `getting-started.md` no longer conditions
  verification on the routed gate. No "automatic" claims about Full
  verification anywhere in the bundle. Cold-start goldens regenerated for
  both tiers. Requires `dabbler-ai-router` >= 0.29.0 in consumer venvs for
  the matching CLI + close-gate behavior.
- **(Set 084) The shipped bundle teaches identity-from-model, dynamic
  exclusion, and the close backstop.** The scaffolded `start-here.md` now
  notes that a Copilot seat must pass `--model` at `start_session` (the
  seat's identity is the underlying model, not the label), that the verifier
  is chosen by excluding the orchestrator's effective provider with a hard
  `verification_unavailable` blocked state, and that a close reached
  unverified triggers the **close backstop** (`close_session` runs the
  verification itself). `AGENTS.md`'s Copilot guidance names the `--model`
  requirement for both Mode-B verification and the `copilot-cli` Full-tier
  profile; `getting-started.md` notes the per-session `--model` on a Copilot
  seat. Cold-start goldens and the bundled dist templates regenerated.

## [0.38.0] — 2026-07-06 (Set 082 — omit verificationMode from Full-tier scaffolds)

Extension-only release: `dabbler-ai-router` stays at 0.28.0 (zero
`ai_router/` changes in this set).

### Changed

- **Full-tier scaffolds omit `verificationMode` entirely — field and
  marker.** The field is Lightweight-only (Set 057) and the mode
  machinery is inert on Full, yet a fresh Full scaffold carried
  `verificationMode: out-of-band-or-none` in the session-set prompt's
  worked example and a `.dabbler/verification-mode` marker claiming the
  same — phantom "choices" no Full surface ever made or reads. A live
  operator Copilot session read a fresh Full scaffold back as
  "tier: full, verificationMode: out-of-band-or-none" — the exact wrong
  message, since Full verification is governed by the routed-gate /
  `verify_session` path rather than a Lightweight mode choice. Per the
  simplicity-first principle the fix
  is omission, not a sentinel: omission is already schema-legal
  (`docs/spec-md-schema.md` lists the field as optional with a
  documented default, and every reader applies absence-means-default).
  - `spec.md.template`'s fixed `verificationMode:` line became the
    whole-line `{{VERIFICATION_MODE_LINE}}` token: the writer renders
    the full pre-082 line (comment included) on `lightweight` and the
    empty string on `full`, with no blank-line residue.
  - `scaffoldConsumerRepo` writes the `.dabbler/verification-mode`
    marker on Lightweight only. On Full the marker is **neither written
    nor deleted** — a prior Lightweight pick survives a tier round-trip
    untouched (the Set 081 "hiding never clears" posture; the marker
    stays a write-through cache of the latest *sanctioned* choice).
    `.dabbler/tier` stays unconditional (tier-agnostic by design).
  - `buildSessionGenPrompt`'s hard-requirements prose is rescoped:
    `lightweight` sets declare `verificationMode`; `full` sets OMIT it.
    The Full worked example renders no `verificationMode:` line (shared
    `renderSpec` writer, so the prompt cannot drift from scaffold
    output).
  - Lightweight output is byte-identical to 0.37.0 (golden-snapshot
    tripwire); the Full cold-start golden regenerated without the line.
  Per-set UAT walked 2026-07-06: one REAL cold-start Build per tier
  from fresh empty folders (L-079-3) plus a Full-over-Lightweight
  re-Build asserting marker preservation — all items PASS.

## [0.37.0] — 2026-07-05 (Set 081 — budget input scoped to the Direct-API sub-choice)

Extension-only release: `dabbler-ai-router` stays at 0.28.0 (zero
`ai_router/` changes in this set).

### Changed

- **The Full-tier verification-budget block is scoped to the "Direct
  provider API keys" sub-option.** The budget label, input, help text,
  $0 zero-rule radio pair, and validation element now render as an
  indented child of the Direct-API option row inside the "Provider
  access (how routed calls run)" group — present only while the Full
  tier AND that sub-option are selected. With "GitHub Copilot CLI seat"
  selected the block is omitted from the DOM entirely (the form's
  existing conditional pattern — hiding never clears state), because
  the budget governs metered provider-API verification spend, which the
  `copilot-cli` seat profile excludes by design (seat billing is not
  locally meterable; see `docs/concepts/tier-model.md`). Requested by
  the operator during the Set 080 UAT walk. Wording (label, help,
  placeholder, $0 copy), the `budget.yaml` schema, the zero-rule
  semantics, and the Lightweight tier are all unchanged; a typed budget
  value survives sub-choice flips and window reloads.
- **Build is honest about the scoping.** A Full + Copilot-seat Build
  never validates the (absent) budget input and writes **no**
  `ai_router/budget.yaml` — absence is a documented, supported state
  with compat defaults (`docs/budget-yaml-schema.md`), keeping a later
  flip back to the api profile clean (the operator authors a budget
  then, informed by real usage). The budget rider is dropped at both
  defense lines (action handler and the scaffold caller;
  `writeBudgetYaml` itself is unchanged). The Direct-API Build path is
  byte-identical to 0.36.0: validate, write `budget.yaml` no-clobber,
  report the outcome in the completion notification.
- **Each sub-choice group now closes with a bottom rule** (UAT-walk
  feedback in this set): the same light `--vscode-panel-border` line
  that separates option rows also separates the group from the "Build
  project structure" button below it, so the button no longer reads as
  belonging to the last option row. Applies to both groups (Full's
  provider access, Lightweight's verification mode).
- **README screenshot refreshed.** `getting-started.png` shows the
  budget block nested under the Direct-API row with the new group
  divider (operator-captured against a locally built 0.37.0-candidate
  VSIX).

## [0.36.0] — 2026-07-05 (Set 080 — Getting Started sub-choice legibility)

Extension-only release: `dabbler-ai-router` stays at 0.28.0 (zero
`ai_router/` changes in this set). Presentation-only — no wording, radio
value, schema, or persistence change anywhere in the set.

### Changed

- **Both Getting Started sub-choice groups render as separated rows.**
  The Full tier's "Provider access (how routed calls run)" pair and the
  Lightweight tier's "Verification (per session set)" pair now render
  each option as a table-like row — radio button | short bold option
  name | description — with the three parts aligned as columns across
  rows and a light theme-variable rule (`--vscode-panel-border`)
  separating adjacent rows. Requested by the operator during the Set
  079 UAT walk ("it isn't super-easy to see where the first option ends
  and the second option begins") and attested legible by the same
  operator in this set's UAT walk. The existing copy constants are
  split at their first em-dash for presentation only — wording
  (including each "(default)" marker's position), radio names/values,
  `data-gs-*` block attributes, warning placement/visibility, and the
  seed/dirty/reload persistence contract are all byte-identical to
  0.35.0, and the whole row is one clickable label.
- **README screenshot refreshed.** `getting-started.png` now shows the
  current form — including the Full-tier "Provider access" group, which
  postdates the previous capture — with the new row layout (operator-
  captured against a locally built 0.36.0-candidate VSIX).

## [0.35.0] — 2026-07-05 (Set 079 — Copilot seat-profile onboarding and verification-mode copy)

Extension-only release: `dabbler-ai-router` stays at 0.28.0 (zero
`ai_router/` changes in this set — this UI reads Set 078's CLI surface,
never modifies it).

### Added

- **Guided Full-tier Copilot seat-profile onboarding.** Picking **Full**
  in the Getting Started form now surfaces a "Provider access (how
  routed calls run)" sub-choice: **direct provider API keys** (the
  unchanged default) or a **GitHub Copilot CLI seat** (Set 078's
  `transport.profile: copilot-cli` — no `DABBLER_*` keys needed). The
  pick persists across window reloads with the same seed/dirty
  precedence as the tier and verification-mode radios, and a step-1
  warning (mirroring the Python one) appears when the Copilot option is
  selected but no `copilot` CLI resolves (explicit
  `dabblerSessionSets.copilotCliPath` setting first, then PATH — an
  explicitly configured path decides alone).
- **Build wiring that tells the truth.** With the Copilot option
  selected, Build runs the standard scaffold first and only on success
  invokes the seat's catalog refresh with the scaffolded `.venv`'s own
  interpreter (auto-derived seat id/label — zero typing), inside a
  cancellable progress notification with a host-teardown disposal
  handler. The wrapper parses the refresh's actual confirmed-provider
  result — never the exit code — and renders
  `transport.profile: copilot-cli` into `router-config.yaml` as an
  anchored field replacement (never an append) only when the seat
  confirms ≥2 distinct provider families. Cancel kills the child
  process tree and restores the lockfile's pre-run state.
- **Honest failure UX on every branch.** Every seat-setup failure lands
  in one of two honest states, keyed on the same `DABBLER_*` presence
  probe the key warning uses: with no keys, the message says plainly the
  router is **not yet functional** (plus reason-specific guidance and a
  copy-runnable re-run command — no re-scaffold needed); with keys
  present, `api` is affirmed as a genuinely working fallback. An
  enterprise-locked seat exposing a single provider family gets the
  specific "re-running will not change the result" guidance.

### Changed

- **Simplified Lightweight verification-mode copy.** The two radio
  descriptions are now plain language: "Manual review (default) — paste
  a review prompt into a second AI assistant yourself and record what
  it says." and "Separate verification sessions — a dedicated session
  on a different AI engine or provider reviews the work before the set
  can close." Copy only — radio values, schema fields, and gate logic
  are untouched. Both READMEs' paraphrases updated in the same pass.
- **Docs present the guided flow as the primary seat-profile path.**
  `docs/concepts/tier-model.md` and the bundled getting-started doc now
  document the in-form setup first, manual `router-config.yaml` editing
  as the fallback — carrying forward, verbatim in spirit, the Set 078
  honesty note: evidence remains a **single personal seat** (Set 079's
  dogfood used the same seat); multi-seat / enterprise-seat model
  availability is **not** validated by this set.

### Fixed

- **Fresh scaffolds got no `ai_router/router-config.yaml` on Windows —
  found by this set's own UAT walk 4.** The PyPI install's config-seed
  one-liner printed the bundled `router-config.yaml` through the child
  Python's **text-mode stdout**, which defaults to `cp1252` on Windows
  (pre-3.15 Python); the bundled config contains characters `cp1252`
  cannot encode (e.g. `U+2192` in comments), so the one-liner crashed
  with `UnicodeEncodeError`, the fail-open seed path silently skipped,
  and every fresh scaffold was left with no workspace config — which the
  Copilot seat setup then surfaced as its (correct, honest)
  `config-write-failed` message. Pre-existing defect (any fresh Windows
  scaffold since the bundled config gained non-ASCII characters), same
  `cp1252` bug class as Set 078's CLI-transport decode fix, now on the
  encode side. The one-liner now emits **raw bytes**
  (`sys.stdout.buffer.write(p.read_bytes())` — the spawner already
  decodes UTF-8), a failed seed is **named in the install message**
  instead of staying silent, and both behaviors are pinned by new
  Layer-2 tests. Verified against the real published 0.28.0 wheel on a
  `cp1252` host: the old form crashes, the fixed form emits the full
  config with the `transport:` anchor intact.

### Evidence limits (recorded, not hidden)

- The POSIX process-tree kill on cancel is unit-pinned but has not been
  exercised against a live POSIX process tree (dogfood host: Windows).
- The seat-setup config write is atomic against process crash; it makes
  no power-loss durability claim.

## [0.34.0] — 2026-07-03 (Set 077 — lightweight-tier UX and Copilot hardening)

### Added

- **Three-way setup choice for tier and verification mode.** The Getting
  Started form's tier step now offers Full, Lightweight + dedicated
  verification sessions, and Lightweight + out-of-band/none. The choice
  maps onto existing schema fields only (`tier` + `verificationMode`), is
  persisted in durable `.dabbler/tier` and `.dabbler/verification-mode`
  markers written by the scaffold path, and threads through the generated
  decomposition prompt so generated specs actually declare it.
- **Python prerequisite check at setup.** The form probes for a resolvable
  Python interpreter (the D6-probe pattern) and shows a prominent step-1
  warning with install guidance when none is found; the Build action runs a
  pre-flight interpreter check **before any durable write**, so a missing
  interpreter fails with the friendly explainer instead of a
  `spawn python ENOENT` buried in a warning summary — and leaves no setup
  artifacts behind.
- **Canonical cross-provider verification instructions in every workspace.**
  The engine-facing `docs/dabbler/cross-provider-verification.md` (review
  stance, verdict grammar incl. `WAIVED`, the required output artifact, and
  the Copilot-locked second-chat/model-picker recipe) is ensure-written
  idempotently before any pointer prompt is emitted, so existing consumer
  repos get it on first use after upgrading — no re-bootstrap.

### Changed

- **The Evaluate prompts now complete themselves.** The spec / session / set
  review prompts open with a pointer to the canonical verification doc and
  close with the one non-negotiable instruction: the reviewing engine itself
  writes the verdict to `external-verification.md` (path spelled out, with a
  missing-doc fallback line). `openExternalVerificationDoc` seeds a
  templated header (set, date, round, verdict-pending) instead of an empty
  file.
- **Start Next Session auto-routes in owed states.** When a Mode-B set
  derives to awaiting-verification / awaiting-remediation, the row's copy
  action yields the verification kickoff or remediation handoff prompt
  (pointer-style) instead of a work-session prompt `start_session` would
  refuse; the row description says `verification owed` / `remediation owed`
  in words. Typed prompts carry the required `dabbler-ai-router >= 0.27.0`
  version line so a mixed-version workspace fails loud, not silently.
- **The Explorer reads the durable verification-mode record.** Mode
  derivation prefers the activity-log `verification_mode` /
  `verification_mode_change` record over the spec seed (the same precedence
  the Python close gate uses), so a blessed A→B transition whose
  seed-alignment failed no longer leaves the UI contradicting the gate.
- **The auto-opened getting-started doc is tier-aware.** A Lightweight
  operator is no longer greeted with Full-first content — the doc leads
  with the durable tier choice.

### Fixed

- **The Getting Started tier leak.** The form state (tier, budget,
  zeroMethod) now survives webview teardown via `setState()`/`getState()`,
  so hiding, re-expanding, or reloading never re-checks the Full radio or
  re-shows the Full-tier warning over a Lightweight pick; the operator's
  choice persists as the durable `.dabbler/tier` marker; every downstream
  consumer (decomposition prompt, form reload, summary copy) reads
  marker-first; `switchTier` write-throughs the marker; and a marker-vs-spec
  mismatch surfaces as a tree advisory. `buildSessionGenPrompt` no longer
  falls back to `"full"` or invites a fabricated "per the operator's
  selection" rationale.
- **`asTier` fails loud on unknown values** (case-insensitive) instead of
  silently narrowing to `"full"`.
- **Explorer progress text no longer contradicts the fraction.**
  `progressText` carries the same `+` suffix as the rendered `N/M+`
  fraction on sets with appended typed sessions.

> **Rollback:** if a hotfix-grade defect surfaces during the
> mission-critical week, pin back to the coordinated pair — extension
> `0.33.1` + `dabbler-ai-router==0.26.2` (both remain published).

## [0.33.1] — 2026-06-20 (Set 074 follow-up — provider env vars + forced router refresh)

### Changed

- Marketplace patch for the Set 074 provider API-key env-var rename. The
  extension-side Full-tier key detection, warning copy, troubleshooting output,
  consumer-bootstrap templates, and README now use `DABBLER_ANTHROPIC_API_KEY`,
  `DABBLER_GEMINI_API_KEY`, and `DABBLER_OPENAI_API_KEY`, and clarify that the
  values are the normal provider-issued Anthropic, Google, and OpenAI keys.
- **`Dabbler: Update ai-router` now force-refreshes PyPI installs.** PyPI-backed
  updates run `pip install --upgrade --force-reinstall --no-cache-dir
  dabbler-ai-router`, so the command pulls the newly published Python source
  files instead of accepting an already-satisfied or cached install. The GitHub
  fallback path already re-pulls and recopies the sparse checkout.

## [0.33.0] — 2026-06-14 (Set 064 — guidance-lifecycle scaffold templates)

> **Release note:** `0.32.0` (Set 063) was version-bumped but never tag-pushed
> to the Marketplace; its last published predecessor is `0.31.0`. This `0.33.0`
> release therefore carries **both** Set 063 (the Getting Started budget step,
> below) and Set 064's template-bundle additions, in one publish through the
> green-Test gate.

### Added (Set 064 D7 — consumer-bootstrap guidance starters)

- **The consumer-bootstrap template bundle now ships the guidance-lifecycle
  starters.** Three new metadata-aware templates —
  `lessons-learned.md.template` (the always-loaded active tier, carrying the
  per-lesson metadata-trailer convention), `project-guidance.md.template`
  (ceiling-aware Principles/Conventions skeleton), and
  `lessons-archive.md.template` (the never-auto-loaded archive tier, seeded
  empty) — are rendered into `docs/planning/` by both the full session-set
  scaffold (`renderConsumerBootstrap`) and the structure-only "Build project
  structure" path (`renderStructureBootstrap`). They consume only
  `{{REPO_NAME}}` and link the canonical `docs/guidance-lifecycle.md` via a
  GitHub URL. The scaffold's skip-existing guard means an existing repo's
  accumulated guidance is never clobbered on a re-run. esbuild copies the new
  templates into `dist/templates/consumer-bootstrap`; the cold-start golden
  snapshot fixtures (`test-fixtures/cold-start/{full,lightweight}`) are
  regenerated to include them.

## [0.32.0] — 2026-06-12 (Set 063 — Getting Started budget step + adoption-bootstrap retirement)

### Added

- **Budget / NTE step in the Getting Started form (Full tier only).**
  The Build-project-structure step now requires a verification budget:
  a numeric dollar amount ≥ 0 with inline validation that blocks Build
  until valid. Entering `$0` reveals a required choice — "Check in
  another engine" (`manual-via-other-engine`) or "Skip verification"
  (`skipped`) — with no silent default, matching the workflow doc's
  operator-picks zero-budget contract. At scaffold time the form
  writes `ai_router/budget.yaml` in the post-migration contract shape
  (`threshold_usd`, `scope: per-project`, derived `mode`,
  `verification_method`, explicit `verification_nte_usd`, `set_at`,
  `set_by: getting-started-form`, `warn_at_percent: 80`) and never
  clobbers an existing file. The host boundary fails closed: a Full
  build-structure request whose budget rider does not narrow is
  rejected rather than scaffolded budgetless. The Lightweight tier
  omits the step from the DOM entirely and never writes the file.
  Canonical contract home: `docs/budget-yaml-schema.md` (new).

### Removed

- **The conversational adoption-bootstrap path.** The
  `Dabbler: Copy adoption bootstrap prompt` command (palette-only
  since Set 060 made its welcome button unreachable), the dead
  `viewsWelcome` contribution, the entire pre-Set-060 welcome-HTML
  pipe (host loader/renderer, snapshot protocol field, webview
  fallback branch, `.welcome` CSS), and the now-consumerless
  `dabblerSessionSets.scanState` context key (the ScanState manager
  and the webview `scanState` messages stay). `gettingStarted` is now
  **required** on the snapshot payload, closing the type-level path
  that could have silently revived the welcome fallback. The remote
  doc `docs/adoption-bootstrap.md` stays online as a URL-stable
  deprecation stub, so the prompt copied by ≤ 0.31.0 clients keeps
  resolving to useful instructions.

## [0.31.0] — 2026-06-12 (Cost Dashboard legibility + README tier framing)

### Changed

- Marketplace README: the two-tier model now leads the page as an
  explicit cost/attention tradeoff (Full = more automation, metered
  spend, several projects in parallel while you do other work;
  Lightweight = $0 API spend, more hands-on, more constrained
  multitasking), with a comparison table, per-set tier declaration,
  and the Switch Tier… path. Previously the tier model first appeared
  mid-way through the Get-started steps.

### Fixed

- Cost Dashboard: the per-set table keyed rows on the raw `session_set`
  value from the metrics log, which exists in four historical shapes
  (bare slug, `docs/session-sets/<slug>`, absolute Windows path in
  either drive casing, null). One set's spend fragmented across up to
  three rows, and the absolute-path rows rendered as unreadable machine
  paths — burying every recent set ("the dashboard stops at Set 036").
  `session_set` is now normalized to the bare session-set folder name
  at parse time, merging the shapes into one row per set; null entries
  read "(no session set)". The CSV export sees the normalized names
  too, so machine-specific absolute paths can no longer leak into
  `ai_router/cost-export.csv`.

### Internal

- The Layer-3 Playwright rendering suite was repaired end-to-end
  (8 rotted specs across five families + a Linux-only Electron-launch
  env bug) and the repo's `Test` workflow reached its first-ever green
  run; a green Test run for the tagged commit is now a hard release
  prerequisite for this extension's publishes.

## [0.30.0] — 2026-06-12 (Sets 061 + 062 — Explorer UX polish + Lightweight verification affordance)

One combined release: Set 061's Explorer changes shipped unreleased
(its release session was deferred into Set 062 by operator direction),
so this version carries both sets, gated on one combined operator UAT
against the new fixture workspace.

### Added (Set 061 — Explorer UX polish)

- **`N/M+` session fraction** on Lightweight `dedicated-sessions` sets
  whose ledger has no completed `type: verification` session — the `+`
  says verification/remediation sessions are appended when the work
  sessions complete, so the count can still grow. Tooltip explains it;
  the fraction returns to an honest `N/M` once a typed session lands.
- **`lw` tier marker** on Lightweight rows (quiet, help cursor,
  tooltip: router-off; verification per the set's `verificationMode`).
- **Blocked chain marker (⛓︎)** replaces the all-caps
  `[BLOCKED BY PREREQS]` description badge; its tooltip names each
  unsatisfied prerequisite and its current state (unknown slugs say
  "unknown set — check the slug" and keep the row blocked).
- **`Switch Tier…` row action** on not-started sets: byte-preserving
  `tier:` scalar rewrite with same-tier detection, malformed-scalar
  repair, and inform-only Full-tier guardrails (missing provider key /
  missing `ai_router/router-config.yaml` warn but never block).

### Added (Set 062 — Lightweight verification affordance)

- **Verification-posture markers**: `v?` on completed Mode-A
  (`out-of-band-or-none`) sets with no `external-verification.md` and
  no typed verification session; `v+` on Mode-B (`dedicated-sessions`)
  sets whose work sessions are all complete while verification is
  still owed or in flight. Marker click opens the row context menu —
  it never mutates state. Verified and note-bearing sets stay quiet
  (no positive badge); the persisted verdict surfaces in the fraction
  tooltip ("Verification: VERIFIED (session N)").
- **`Verification Kickoff` copy action** on eligible Mode-B rows: a
  pointer-style prompt handing the Set 057 typed
  verification/remediation flow to a *different* AI engine
  (`start_session --type verification`, remediation chaining via
  `--handoff`) — references docs and commands, embeds no content that
  can go stale.
- **`Set Up Dedicated Verification…` row action** (Mode A → Mode B),
  phased by set state: on not-started sets a confirmed,
  byte-preserving `verificationMode:` seed rewrite (both directions
  legal while no activity-log history exists); on completed sets a
  recorded transition through the new `ai_router` blessed writer
  (`change_verification_mode`) — only on writer success does the spec
  seed align and the kickoff prompt land on the clipboard; failures
  inform and change nothing. In-flight sets are excluded; B→A is
  never offered once any activity-log record exists.
- **`Open External Verification Note`** offered on `v?` rows — the
  sanctioned out-of-band record; creating the note clears the marker.
- **UAT fixture workspace**: a committed hello-world fixture matrix
  (`test-fixtures/uat-matrix/`) covering every marker/action state in
  Sets 061 + 062, with `npm run make-uat-workspace` generating a
  disposable copy outside the repo. The generated `.code-workspace`
  pins `dabblerSessionSets.pythonPath` to the checkout's `.venv` so
  python-backed row actions work with zero setup.

### Changed

- Marketplace README: new Session Set Explorer + Getting Started
  screenshots; feature list updated for the 061/062 row actions and
  markers.

## [0.29.0] — 2026-06-11 (Set 060 — Getting Started redesign)

Replaces the prompt-chain onboarding with a dual-mode Getting Started flow in
the Session Set Explorer and ships the held 0.28.1 activation fixes from
Set 059.

### Added

- A stateful three-step Getting Started form inside the Session Set Explorer
  for empty workspaces: build project structure, import/copy a project plan,
  and copy the session-set decomposition prompt.
- A static editor-side Getting Started instructions document that opens
  alongside the form and carries the SVG-approved onboarding copy.

### Changed

- The Session Set Explorer now has three startup states: a no-folder CTA when
  no workspace is open, the Getting Started form when a folder has no session
  sets, and the normal session-set list once a set exists.
- Build project structure reuses the no-title-prompt scaffold path in the open
  folder, so the old first-session-set title prompt is gone from the primary
  onboarding flow.
- Full-tier setup warns inline when no provider API key is visible at launch
  and tells the operator to reload after setting one; Lightweight shows no such
  warning.
- The parallel-session checkbox now surfaces the git-worktree disclosure in
  place, and `dabbler.getStarted` routes to the new form + instructions rather
  than the retired wizard path.
- `dabbler.setupNewProject` converges on the same no-prompt structure-only
  scaffold the form drives (tier QuickPick only); the retired
  title/purpose/session-count prompts, git-init confirmation modal, and
  worktree opt-in modal are gone, and the Set 021 wizard panel
  (`webview/wizard.html`) is removed.
- The copied session-set decomposition prompt now **references** the plan at
  `docs/planning/project-plan.md` instead of inlining its full text (operator
  UAT feedback — the inlined plan made the prompt hard to read; the audience
  is a path-aware assistant opened in the workspace).
- The Getting Started form's tier radio now rides the Build session sets
  action, so the copied decomposition prompt's worked exemplars and guidance
  steer the planner to the operator's selected tier.

### Fixed

- Carries forward Set 059's no-folder activation fix and tier-selection
  plumbing fix, which were never released as a standalone 0.28.1 publish.

## [0.28.1] — 2026-06-09 (Set 059 — Extension activation & scaffold fix)

> **Not released standalone.** This version number was never tag-pushed; the
> fix below is merged on `master` and ships inside **0.29.0** (Set 060 — Getting
> Started redesign), because operator UAT redirected the scaffolder UX into that
> redesign. Kept here as the record of what landed.

Fixes two operator-found defects in 0.28.0's new consumer-bootstrap flow,
both in the VS Code activation/wiring layer the Set 058 tests (run against a
`vscode-stub`) did not exercise. Users who open VS Code **with** a folder were
unaffected; the breakage was confined to the fresh-window / no-folder path.

### Fixed

- **No-folder activation.** `activate()` returned early when no workspace folder
  was open, leaving the Session Sets webview view provider AND every command
  unregistered — so the view hung and `dabbler.setupNewProject` /
  `dabbler.getStarted` silently did nothing, in exactly the fresh-window case
  those commands exist for. Activation now registers the view provider and all
  commands unconditionally; the folder-dependent runtime (watchers, context
  keys, the poll) stays gated and re-initializes on folder-add, and the view
  renders its welcome CTA instead of hanging.
- **Wizard tier dead-end.** The Get Started wizard's "Set up a new project"
  button now carries the tier you selected into `dabbler.setupNewProject`, so it
  no longer re-prompts for tier (the double prompt) and no longer dead-ends.

### Tests

- Added a no-folder activation regression test (drives the real `activate()`
  with no folder and asserts the view provider + bootstrap commands register)
  and a tier-narrowing unit test — the coverage that would have caught these.

## [0.28.0] — 2026-06-09 (Set 058 — Tier-model clarity & consumer-repo bootstrap)

Makes every repo-creation path emit correct, uniform, tier-aware scaffolding
and reconciles the consumer-bootstrap surfaces to the code-verified tier model
(**Lightweight is router-off, not Python-off; `tier:` is the single switch**).

### Added

- A shared template writer (`src/utils/consumerBootstrap.ts`) that renders the
  canonical `spec.md` (schemaVersion 4, `NNN-` slug, required `tier` +
  `verificationMode`), the three engine files (`CLAUDE.md` / `AGENTS.md` /
  `GEMINI.md` — one shared body + a per-engine tail), and the generated
  `docs/dabbler/start-here.md` cold-start operative doc from one durable
  template bundle. The Get Started wizard, `dabbler.setupNewProject`
  (`gitScaffold`), and `dabbler.generateSessionSetPrompt` (`sessionGenPrompt`)
  all route through it, so they cannot drift apart.
- The template bundle is copied into `dist/templates/consumer-bootstrap/` at
  build time and rendered from there at runtime (the packaged `.vsix` ships
  the bundle).

### Changed

- **`dabbler.setupNewProject` scaffolds both tiers uniformly**: a `.venv` +
  `pip install dabbler-ai-router`, the three engine files, `start-here.md`, and
  a templated `spec.md`. The only divergence is that Full writes
  `ai_router/router-config.yaml` while Lightweight writes `tier: lightweight`
  and no router config.
- **`dabbler.generateSessionSetPrompt`** now produces the canonical spec shape
  (schemaVersion 4, `NNN-` slug, `tier`, `verificationMode`) — never the legacy
  `schemaVersion: 2` / bare-slug shape.
- The Get Started wizard states Python is required on **both** tiers and ends
  with an explicit "you're ready — tell your orchestrator *start the next
  session*" closure.

### Notes

- TS / docs only — no companion PyPI release. The packaged `ai_router` surface
  is unchanged this set; `dabbler-ai-router 0.16.0` (Set 057) remains held.
<!-- drift-guard:allow-begin (describes what the guard forbids) -->
- Set 058 S3 adds a Python cold-start acceptance test (both tiers), a golden
  render snapshot, and CI drift guards (`ai_router/scripts/drift_guard.py`) that
  forbid the stale "Lightweight = no Python / no venv" framing, enforce one
  active session set, and keep the committed `dist/` bundle in sync.
<!-- drift-guard:allow-end -->

## [0.27.0] — 2026-05-30 (Set 052 — Cost-metrics icon redesign)

Fixes the dead cost-dashboard icon. The root cause was a **read/write
path mismatch**, not a disabled flag: the router *writes*
`ai_router/router-metrics.jsonl` (`metrics.log_filename`) while the
dashboard *read* a hardcoded `ai_router/metrics.jsonl` it never wrote to,
so the panel was always empty and showed a "set `METRICS_ENABLED = True`"
placeholder naming a flag that does not exist. This set points the reader
at the file the router actually writes, gates the surface to workspaces
that actually route, replaces the fictional-flag placeholder with three
honest states, and prompts to refresh stale per-provider rate estimates.
TS-only — no companion PyPI release.

### Fixed

- **Cost-dashboard read path (root cause).** The reader and the CSV
  export now resolve the metrics filename from `router-config.yaml` →
  `metrics.log_filename` (default `router-metrics.jsonl`) through a single
  shared resolver (`src/utils/routerConfig.ts`) — no second hardcoded
  name. The dashboard now renders real data instead of looking dead.
- **CSV export session column.** `MetricsEntry` reconciled to the on-disk
  schema: the export now keys off `session_number` (the router never
  emitted `session_num`, so that column was silently blank), an optional
  `call_type` is carried, and `adjudication` bookkeeping rows (no model,
  zero cost) are dropped from the reader.

### Added

- **Router-capability tier gate.** A new `dabblerSessionSets.routesCost`
  context key is set in `extension.ts` from whether a workspace folder
  carries a resolvable `ai_router/router-config.yaml` (folder existence
  alone is insufficient). `package.json` gates both the `view/title` icon
  and the Command-Palette entry on it, so the cost surface is **absent on
  Lightweight** and present only where the workspace actually routes.
- **Cost-estimate staleness banner.** On open, staleness is computed
  in-extension from `metadata.pricing_reviewed` vs
  `metadata.review_frequency_days` (default 30; missing/invalid metadata
  is treated as stale). When stale, a non-blocking banner with an "Update
  cost estimates" action opens `router-config.yaml` at the
  `pricing_reviewed` line. Shares the staleness definition with the
  router's `config.py:_check_pricing_staleness`.
- **Three honest dashboard states.** disabled (`metrics.enabled == false`
  — names the real knob in `router-config.yaml`, **never** the fictional
  `config.py METRICS_ENABLED`) / on-but-empty (distinct copy, shows the
  resolved read path) / on-with-data, plus a defensive no-router state.
  Pure HTML builders extracted to `src/dashboard/dashboardHtml.ts`;
  `CostDashboard` is now a state machine over `selectCostState`. Button
  wiring is CSP-safe (delegated click, no inline `onclick`).
- **16-item UAT checklist** for the set
  (`docs/session-sets/052-cost-metrics-icon-redesign/052-cost-metrics-icon-redesign-uat-checklist.json`)
  — UAT was elected at session start.

### Changed

- Removed the fictional-flag copy from `webview/dashboard.html`. Docs
  reconciled to the new behavior (`docs/repository-reference.md`,
  extension `README.md`).

### Testing notes

- New `routerConfig.test.ts` (gate predicate, read-path resolution incl.
  custom `log_filename`, staleness fresh/stale/missing/invalid, three-state
  selection), `dashboardHtml.test.ts` (honest copy, banner states, config
  anchor resolution), `costDashboardGate.test.ts` (manifest gate-wiring
  guard), and a `metrics.test.ts` schema update.
- The planned Layer-3 Playwright icon-visibility smoke was **pivoted** to
  the deterministic `costDashboardGate.test.ts` manifest guard: VS Code
  `view/title` actions duplicate-render in the DOM and overflow past the
  first action, making them non-deterministic to assert in Playwright (no
  codebase precedent; mirrors `migration-cta-v4.spec.ts`). The deferred
  live icon-visibility coverage is carried as manual operator UAT items.

## [0.26.1] — 2026-05-30 (New Activity Bar icon)

Patch release. Ships the new sidebar icon that landed one commit after
the `0.26.0` Marketplace tag and therefore missed that publish.

### Changed (UI)

- **New Activity Bar (sidebar) icon** — the `dabblerSessionSetsContainer`
  view container now uses `media/dabbler-ai-orchestration-icon.svg`
  (single-path, `fill:currentColor`, themes/states automatically) in
  place of the previous `media/icon.svg`.

## [0.26.0] — 2026-05-30 (Set 051 — Retire the superseded Claude `SessionStart` hook)

Removes the Set 050 Claude-only `SessionStart` hook. Set 053 moved
schema-drift detection into the router session lifecycle
(`start_session` / `close_session` via `summarize_drift`), which fires
for **every** orchestrator (Claude, Copilot, Codex, human) on every
host — making the editor hook a redundant, divergence-prone duplicate
under the portability rule (its `scanSchemaDrift` JS could diverge from
the router's `summarize_drift` message). Companion PyPI release:
`dabbler-ai-router 0.14.0` (joiner/dead-code removal + packaging fixes).

### Removed

- **`scripts/claude-session-start-invoker.js`** — the invoker shim,
  including its `scanSchemaDrift` drift scan and `CURRENT_SCHEMA_VERSION`
  constant (both superseded by the router lifecycle's `summarize_drift`).
  The extension `scripts/` directory is now empty.
- **The `dabbler.installOrchestratorHook.claudeCode` command** and its
  "Copy manual setup" toast/action (Set 050), the `package.json` command
  contribution, and the `extension.ts` registration wiring.
- **`ai_router/tests/test_invoker_schema_constant.py`** — the CI test
  that pinned the now-deleted JS constant to `ai_router`'s
  `SESSION_STATE_SCHEMA_VERSION`; with the constant gone the pin is dead.
- **`src/test/suite/claudeSessionStartInvoker.test.ts`** — the Layer-2
  suite that dynamic-imported the deleted invoker JS (could not pass
  without it).

### Changed

- Docs reconciled to present the Set 053 lifecycle advisory as the sole
  live drift mechanism and the hook as historical: `CLAUDE.md`,
  `docs/ai-led-session-workflow.md`, `docs/session-state-schema.md`, and
  `docs/cross-repo-migration-guard-notice.md` (superseded banner +
  neutralized install step).
- The `watcherInventory.test.ts` allowlist line pin was bumped (154→153)
  to track the one-line import shift in `extension.ts`; no watcher was
  added or removed.

### Added

- **`docs/cross-repo-hook-retirement-notice.md`** — consumer-repo +
  operator remediation: remove the dabbler `SessionStart` entry (the one
  invoking `claude-session-start-invoker.js`) from
  `~/.claude/settings.json`; drift coverage now rides the router
  lifecycle automatically. (Documents the removal only — does not edit
  any machine settings.)

## [0.25.0] — 2026-05-29 (Set 050 — Schema-drift guard + number-prefix addressing)

Ships the extension side of Set 050 and publishes the held 0.24.1
Copy-Slug fix as part of the same release. Companion PyPI release:
`dabbler-ai-router 0.12.0`.

### Added

- **Pure-JS schema-drift scan on the SessionStart hot path.**
  `scripts/claude-session-start-invoker.js` gains a
  `CURRENT_SCHEMA_VERSION` constant and a `scanSchemaDrift(workspaceRoot)`
  step chained after `start_session`. It reads
  `docs/session-sets/*/session-state.json`, compares each `schemaVersion`
  to the bundled constant, and prints a terse one-line summary into
  session context when any set is behind (clean = silent). It has **no
  `ai_router` import and no network**, so it still warns on a repo with
  an absent or stale router; it is fail-open on unreadable/missing files,
  and `start_session` errors are logged-not-fatal so the scan always
  runs. A CI test (`test_invoker_schema_constant.py`) pins the bundled JS
  constant to `ai_router`'s `SESSION_STATE_SCHEMA_VERSION` so the two
  sources of truth cannot drift.
- **`Dabbler: Install Orchestrator Hook (Claude Code)` install path
  extended.** The success toast now mentions both `start_session` and the
  drift scan, and offers a **"Copy manual setup"** action that copies the
  invoker download URL + a minimal `settings.json` stanza for repos
  without the extension (works with no router installed at all).
- **`Dabbler: Resolve Set Number`
  (`dabblerSessionSets.resolveSetNumber`)** — a Command-Palette
  quick-input command that takes a session-set number and resolves it to
  the full slug, backed by a pure-TS resolver (`utils/resolveSetNumber.ts`)
  mirroring the Python `resolve_set` contract so router-less Lightweight
  consumers still get the handle.
- **"Upgrade older session sets" Explorer title-bar icon**
  (`commands/upgradeOlderSets.ts`), gated on the
  `dabblerSessionSets.hasSubCurrentSets` context key (enabled only when
  sub-current sets exist). Runs the corrected three-migrator bulk chain
  (`migrate_session_state` → `migrate_lightweight_to_canonical_v4` →
  `migrate_v3_to_v4`, each `--in-place` via a Python subprocess) across
  all sub-current sets at once — never a per-row obligation.

### Changed

- **Explorer no longer nags per row.** The intrusive `(needs migration)`
  row description is replaced by an unobtrusive asterisk + "Ran under
  schema v\<N\>" hover tooltip (operator non-goal: old schema is
  acceptable; the `normalize_to_v4_shape` reader shim consumes v2/v3
  transparently). The per-row right-click "Migrate to v3/v4 schema"
  actions are left intact as a manual option.

### Fixed (carried from the held 0.24.1 patch, now published)

- **`dabblerSessionSets.copySlug` appears in the Session Set Explorer
  right-click menu.** The command existed in `package.json` and
  `copyCommand.ts` but was never added to `ROW_ACTIONS` in
  `ActionRegistry.ts`. Added as a `flat` action; copies the raw
  session-set slug to the clipboard.

## [0.24.1] — 2026-05-28 (patch — Copy Slug context menu item)

### Fixed

- **`dabblerSessionSets.copySlug` now appears in the Session Set
  Explorer right-click menu.** The command was registered in
  `package.json` and implemented in `copyCommand.ts` but was never
  added to `ROW_ACTIONS` in `ActionRegistry.ts`, making it invisible
  from the context menu. Added as a `flat` action at group 501
  (above the Orchestrator Writer Log entry). Copies the raw session-set
  slug to the clipboard — useful when communicating session state to
  an AI engine mid-session.

## [0.24.0] — 2026-05-27 (Set 049 — Orchestrator coordination removal)

Rips out the extension-side surfaces that paired with the
hard-coordination layer in ai_router. The Session Set Explorer
returns to its pre-Set-045 shape (no orchestrator info, no
harvest-record badges, no coordination-conflict pills). Set 049
implements operator-locked premise P4 (no orchestrator info in
Explorer rendering) end-to-end. Companion PyPI release:
`dabbler-ai-router 0.11.0`.

### Breaking

- **`dabbler.checkOutOrchestrator` command removed.** ("Set
  Orchestrator…" / "Check Out As…" right-click action.) Keybindings
  bound to it via `commandId` will produce a "command not found"
  toast on invocation.
- **`dabbler.releaseCheckOut` command removed.** ("Release
  Check-Out" Command Palette action.) Same caveat.
- **`dabbler.installOrchestratorHook.gemini` and
  `dabbler.installOrchestratorHook.copilot` commands removed.**
  Both depended entirely on the retired check-out quickpick and
  `new_chat_id` toast — broken by construction post-rip.
  `dabbler.installOrchestratorHook.claudeCode` survives.
- **`dabbler.newChatIdWorkflowToast` removed.** Internal command
  consumed by the retired Gemini/Copilot installers; no
  user-facing keybindings expected.
- **Configuration setting `dabblerSessionSets.checkoutPollTimeoutMinutes`
  removed.** Sole consumer (`CheckoutPollService`) was retired.
- **Webview row payload shape narrowed.**
  `RowPayload.harvestSignals` and `RowPayload.conflicts` fields
  removed. Custom consumers of the webview message protocol that
  pinned the old shape will need to update.

### Changed

- **`claude-session-start-invoker.js` simplified.** Drops
  `--chat-session-id` forwarding, `EXIT_CHECKOUT_CONFLICT` handling,
  `emitConflictRecord`, and `~/.dabbler/checkout-conflicts/` directory
  writes. The hook now walks up to resolve the in-progress set and
  spawns `start_session --engine claude --provider anthropic
  [--model X --effort Y]` where model/effort come from prior block
  recovery (no `"unknown"` fallback under T3). On non-zero exit, the
  hook logs stderr and exits 0.
- **Session Set Explorer rows reverted to pre-Set-045 layout.**
  Each row renders: name + fraction + description only. No harvest
  badges, no conflict pills.
- **`CustomSessionSetsView.ts` decoupled from `HarvestService`.**
  Import + instance + cache invalidation calls removed; `buildRow`
  no longer attaches `harvestSignals` / `conflicts`; `dispose()`
  no longer calls `harvest.dispose()`; `refresh()` no longer calls
  `harvest.invalidate()`.
- **`docs/cross-repo-checkout-notice.md` rewritten as deprecation
  instruction.** "Remove this content from your CLAUDE.md" with
  step-by-step remediation for consumer repos that paste-in'd the
  Set 033 or Set 036 snippet, plus a survives / retired summary.

### Removed

- **Source files deleted:**
  - `src/commands/checkOutOrchestrator.ts`
  - `src/commands/releaseCheckOut.ts`
  - `src/commands/newChatIdWorkflowToast.ts`
  - `src/commands/installOrchestratorHookGemini.ts`
  - `src/commands/installOrchestratorHookCopilot.ts`
  - `src/providers/CheckoutPollService.ts`
  - `src/providers/chatSessionMismatchModal.ts`
  - `src/providers/ReadOnlyIntentService.ts` (orphaned by the
    `checkOutOrchestrator` + `CheckoutPollService` deletes)
  - `src/providers/HarvestService.ts` (sole caller disconnected
    by P4 revert; load-bearing scaffolding lives in `ai_router/joiner/`)
- **Webview protocol types deleted** from
  `src/types/sessionSetsWebviewProtocol.ts`: `ConflictKind`,
  `ConflictSeverity`, `HarvestSignalsPayload`, `ConflictPayload`.
- **Webview client code deleted** from `media/session-sets-tree/`:
  `renderHarvestBadges()` + `renderConflictPills()` functions
  (~50 lines), `.harvest-badges` + `.harvest-badge*` +
  `.conflict-pills` + `.conflict-pill` + `.conflict-severity-*`
  CSS rules (~95 lines).
- **ActionRegistry entry** `dabbler.checkOutOrchestrator`
  ("Set Orchestrator…") — 14 entries now, was 15.
- **Tests retired (whole-file):**
  `checkOutOrchestrator.test.ts`,
  `checkOutOrchestratorChatSessionMismatch.test.ts`,
  `releaseCheckOut.test.ts`, `chatSessionMismatchModal.test.ts`,
  `checkoutPollService.test.ts`, `readOnlyIntentService.test.ts`,
  `readOnlyIntentTiming.test.ts`,
  `playwright/new-chat-id-cli-flow.spec.ts`,
  `playwright/chatsessionid-takeover.spec.ts`,
  `playwright/chatsessionid-missing-tolerance.spec.ts`,
  `playwright/checkout-polling.spec.ts`,
  `playwright/checkout-conflict.spec.ts`,
  `playwright/harvest-signals.spec.ts`.

### Kept

- **`dabbler.openOrchestratorWriterLog`** — survives. The
  underlying `~/.dabbler/orchestrator-writer.log` is retained as a
  generic "start_session ran" audit appender per Set 049 T5.
- **`dabbler.installOrchestratorHook.claudeCode`** — survives.
  Installs the simplified `SessionStart` hook.
- **`writer-bypass` detector (D3) in `ai_router/joiner/conflicts.py`** —
  survives as a general writer-discipline check, decoupled from
  coordination context (Python-side; the TS-side rendering surface
  is gone).

## [0.23.0] — 2026-05-27 (Set 048 — Lightweight-tier parity)

Ships end-to-end parity between the Full and Lightweight tiers per the
audit-locked spec at
[`docs/session-sets/048-lightweight-tier-parity/spec.md`](../../docs/session-sets/048-lightweight-tier-parity/spec.md).
The Lightweight tier becomes a first-class peer: same writers, same
Explorer UX, same `session-state.json` lifecycle. Differences from Full
are limited to (a) no AI router runtime calls, (b) no auto-verification,
(c) copyable review prompts in lieu of routed verification, (d)
suggested-not-required UAT/E2E. Companion PyPI release:
`dabbler-ai-router 0.10.0`.

### Added

- **Four copyable-review-prompt commands** under
  `src/commands/copyPromptCommands.ts`:
  `dabbler.copySpecReviewPrompt` (always enabled),
  `dabbler.copySessionAccomplishmentsPrompt` (≥1 completed session),
  `dabbler.copySetAccomplishmentsPrompt` (`state === "complete"`),
  `dabbler.copyStartNextSessionPrompt` (non-terminal rows only).
  Path-reference format per operator-locked L1: prompts list relative
  paths (forward-slash normalized) and NEVER embed session-set
  artifacts. Visible from both Command Palette and the right-click
  context menu's `Copy Eval ▸` submenu. The `sanitizeSlugForPrompt`
  helper guards slug-with-backtick edge cases.
- **`dabbler.openExternalVerificationDoc`** Command Palette action
  (`src/commands/externalVerification.ts`) — opens or creates
  `<set>/external-verification.md` in an editor tab. Free-form text.
  Single-set workspaces skip the picker; multi-set workspaces show a
  QuickPick with `set.name + set.state` columns.
- **Get Started wizard tier-branch** (`webview/wizard.html`) — new
  `Choose adoption tier` radio group above `Prerequisites` with
  `applyTierVisibility(tier)` toggling `.hidden` on `[data-tier]`
  elements on radio change. Lightweight surfaces a new path-aware-
  agent prerequisite + no-API-spend callout; Full preserves the
  existing cost-reality callout. `Configure AI Router` and `Show Cost
  Dashboard` buttons hide under Lightweight; `Troubleshoot` stays.
- **Review-criteria template files** at `docs/review-criteria/{spec,
  session,set}.md` — operator-editable meta-instructions picked up
  automatically by `copyPromptCommands`. Comment-headers explain edit
  and delete-to-default semantics.
- **Cross-repo Lightweight notice** at
  `docs/cross-repo-lightweight-notice.md` — one-time consumer-repo
  paste-in following the `cross-repo-checkout-notice.md` /
  `cross-repo-harvest-notice.md` pattern. Covers activation, copy-
  prompt + paste-back flow, agent-capability requirement, review-
  criteria files, migrator recipe, and the tier-branch wizard.
- **Workflow doc Step 6 Lightweight subsection** at
  `docs/ai-led-session-workflow.md` — 5-step copy / paste / paste-back
  / soft-gate flow with the path-aware-agent requirement.

### Changed

- **Context-menu IA refresh** — right-click context menu rebuilt on
  `vscode.window.showQuickPick` (Bias 3 flip per audit verdict). The
  cursor-anchored HTML popup introduced in Set 034 is fully retired
  including the `.context-menu*` CSS in `media/session-sets-tree/
  tree.css` and ~100 lines of cursor-anchored popup state +
  click/keydown/resize/scroll handlers in
  `media/session-sets-tree/client.js`. Native QuickPick handles
  click-outside, Escape, and focus-loss dismissal (operator-locked
  L4 satisfied as a free byproduct). Two-step submenu pattern: top-
  level shows `Open File ▸` + `Copy Eval ▸` chips when their
  categories are non-empty plus flat actions inline; submenu
  selection opens a second-level QuickPick. `RenderContextMenuMsg` /
  `ContextMenuItem` / `ExecuteRowCommandMsg` removed from
  `src/types/sessionSetsWebviewProtocol.ts`. `COMMAND_ALLOWLIST`
  collapsed from 14 entries to 1 (`dabblerSessionSets.openSpec`) —
  QuickPick selections dispatch from the host directly.
- **Left-click row activation (L5 dual-action)** — clicking a row
  ALWAYS opens `spec.md` in an editor tab. On non-terminal rows
  (`status === "in-progress" | "not-started"`), the click ALSO writes
  `Start the next session of \`<slug>\`.` to the clipboard via
  `vscode.env.clipboard.writeText()` and shows a one-line information
  toast (`Copied: Start the next session of <slug>`). Terminal-state
  rows skip the clipboard write and toast (spec.md opens only).
  Unknown future state values FAIL CLOSED via a positive
  `in-progress | not-started` check so schema drift cannot
  accidentally trigger the clipboard payload. The same start-next-
  session action is also exposed in the right-click `Copy Eval ▸`
  submenu as `Start Next Session`.
- **ActionRegistry reshape** (`src/providers/ActionRegistry.ts`) —
  new `ActionCategory` discriminator (`"openFile" | "copyEval" |
  "flat"`); `categorizedActions(set, supports)` partitions the
  applicable subset by category for the two-step QuickPick. Final
  entry count: 14 (was 15). Operator-locked L2 narrows `Open File ▸`
  to exactly 4 entries: Spec / Activity Log / Change Log / Session
  State.
- **TypeScript schema** (`src/types.ts` + `src/utils/fileSystem.ts`)
  — `TriStateFlag = boolean | "suggested"` + `SessionSetTier = "full"
  | "lightweight"` aliases; `SessionSetConfig` gains `tier` (defaults
  to `"full"`); `requiresUAT` / `requiresE2E` widen to `TriStateFlag`.
  `parseSessionSetConfig` reads `tier:` only from the canonical YAML
  block to prevent free-form prose from silently activating
  Lightweight mode.

### Removed

- **`dabblerSessionSets.openAiAssignment`** command per operator-
  locked L3. Fully deleted from `package.json` `contributes.commands`,
  `src/providers/ActionRegistry.ts` `ROW_ACTIONS`, the
  `COMMAND_ALLOWLIST`, and `src/commands/openFile.ts` registration.
  Any future surface that needs to read `ai-assignment.md` should use
  the `aiAssignmentPath` field on `SessionSet`, not this menu entry.

### Fixed

- **S5 UAT-discovered Critical bare-import bug** —
  `ai_router/__init__.py` (`route()` and `verify()`),
  `start_session.py` (`main()`), `close_session.py` (`run()`), and
  `runtime_mode.py` (`_spec_tier()`) used bare imports of the new
  Set 048 modules (e.g., `from runtime_mode import …`). Those bare
  forms only resolved under the test sys.path shim in
  `ai_router/tests/conftest.py`; pip-installed package consumers —
  the entire Lightweight target audience — hit `ModuleNotFoundError`
  on every call site. `route()` and `verify()` exploded outright;
  `start_session.main()` and `close_session.run()` silently swallowed
  the error in their `try/except`, so `--no-router` was a no-op for
  every CLI consumer. Now uses relative imports. New
  `test_no_bare_imports_of_set048_modules_in_production_code`
  static-analysis test (`ai_router/tests/test_production_imports.py`)
  locks the invariant out at code-review time. `conftest.py` aliases
  the bare names to the package-qualified modules so the existing
  test convention (`import runtime_mode`) still resolves to the same
  module object as production's `from .runtime_mode import …`.

## [0.22.0] — 2026-05-26 (Set 047 — state-file schema v4)

Ships the v4 evolution of `session-state.json`. The v4 schema derives
every legacy top-level lifecycle field (`currentSession`,
`totalSessions`, `completedSessions`, `lifecycleState`, `startedAt`,
`completedAt`, `orchestrator`, `verificationVerdict`) from a
per-session `sessions[]` ledger where each entry carries its own
startedAt / completedAt / orchestrator / verificationVerdict. Reader-
first migration: every reader in both Python and TypeScript routes
through a `normalizeToV4Shape(state, specMdPath)` shim that accepts
v1/v2/v3/v4 input and returns a v4 read-view, so consumer repos on
mixed schema versions read identically. Companion PyPI release:
`dabbler-ai-router 0.9.0`.

### Added

- **`normalizeToV4Shape(state, specMdPath)`** shim
  (`src/utils/progress.ts`) — accepts v1/v2/v3/v4 input, returns
  a v4 read-view with both per-session metadata and derived legacy
  top-level fields. TS mirror of the Python
  `ai_router.progress.normalize_to_v4_shape`. Reader contract is
  byte-equivalent across the two implementations (parity validated
  in Set 047 S2 + S5).
- **v4 writers** (`src/utils/sessionState.ts`,
  `src/utils/cancelLifecycle.ts`) — `synthesizeNotStartedState` /
  `ensureSessionStateFile` / `cancelSessionSet` / `restoreSessionSet`
  now emit canonical v4 on-disk shape per the audit-locked spec.
  Each session record carries `startedAt` / `completedAt` /
  `orchestrator` / `verificationVerdict`; top-level keeps only
  `schemaVersion` / `sessionSetName` / `status` / `sessions`. Helper
  `toV4OnDiskShape` projects any v1/v2/v3/v4 input through the shim
  and trims to the v4 contract. Plan-less carve-out
  (`sessions[]`-absent, top-level `orchestrator` + `startedAt`
  passthrough) preserved across all writers.
- **v3 → v4 right-click migration**
  (`src/commands/migrateSetV4.ts`,
  `src/utils/migrateSessionStateV4.ts`,
  `dabblerSessionSets.migrateToV4`) — single-set migrator with same
  on-disk shape and same backup filename as the Python CLI
  (`python -m ai_router.migrate_v3_to_v4`). `failed-backup`
  notification branches on whether the `.bak` exists, surfacing the
  rollback procedure only when needed. Idempotent: v4 files
  short-circuit with `skipped-v4`.
- **`needsMigration` detector expansion** (`src/utils/fileSystem.ts`)
  — now flags canonical v3 files (target=4) AND v1/v2/broken-v3
  files (target=3) via a new `migrationTargetSchemaVersion: 3 | 4 |
  null` field on the `SessionSet` record. Detector hoisted above
  the `normalizeToV4Shape` call so a normalize failure can't eat
  the badge.
- **`ActionRegistry` predicate split** — `needsMigrationToV3` (group
  801) and `needsMigrationToV4` (group 802) are mutually exclusive
  by construction; one row never surfaces both badges.
- **`spec.md` `prerequisites:` field schema**
  (`src/utils/fileSystem.ts:parsePrerequisites`) — declares cross-set
  dependencies as `{slug, condition: "complete"}` entries. The
  Explorer's `readSessionSets` / `readAllSessionSets` cross-references
  each set's prereqs against target sets' `status` and surfaces a
  `[BLOCKED BY PREREQS]` badge in the row description. Suppressed on
  terminal-state rows (Complete / Cancelled). Unknown target slug
  (typo / missing set) keeps the row blocked — typos do NOT silently
  unblock. Lightweight regex parser (no YAML dep); tolerant of
  inline YAML comments on scalar values.

### Changed

- **`readSessionSets` performance benchmark baseline established**
  (`src/test/suite/readSessionSetsPerfBenchmark.test.ts`) — 47 sets
  × 20 iters: mean=21.8ms p50=21.2ms p95=32.5ms max=32.5ms.
  Regression guard: `p95 < 5000ms`.
- **`readSessionSets`, `readCancellationState`, `fractionFor`,
  gate-check predicates** all route through `normalizeToV4Shape` so
  v3 and v4 files read identically.
- **`cancelLifecycle.ts` writer parity** with `session_lifecycle.py`
  re-validated on v4 emission (Set 035 byte-equivalence preserved).

### Companion releases / cross-references

- **`dabbler-ai-router 0.9.0`** ships the Python writer flip
  (`session_state.py`, `session_lifecycle.py`), the
  `normalize_to_v4_shape` shim (`progress.py`), and the
  `python -m ai_router.migrate_v3_to_v4` CLI.
- **`docs/session-state-schema.md`** rewritten as the canonical v4
  reference.
- **`docs/v3-to-v4-rollback-procedure.md`** documents the rollback
  contract for the migrator.
- **`docs/planning/session-set-authoring-guide.md`** gains the
  `prerequisites:` field documentation.
- **Set 048** (`048-lightweight-tier-parity`) — stubbed for the
  carved-out Lightweight-parity work under its own audit-S1.
- **Set 049** (`049-orchestrator-coordination-removal`) — stubbed for
  the orchestrator-block simplification + check-out/check-in code
  removal under audit-then-spec discipline.

## [0.21.0] — 2026-05-25 (Set 045 — log-harvest implementation)

Ships the user-facing surface for the dual-primary log-harvest
observability architecture locked by Set 044's consensus-audited
proposal v1. The Session Set Explorer now surfaces per-row harvested-
signal badges (wrapper-launched / native-log / narration-marker /
writer-bypass) and conflict-warning pills (engine-mismatch / bare-
touch / stale-checkout-touch / writer-bypass) fed by an async
shell-out to the new `python -m ai_router.joiner` CLI in the
companion `dabbler-ai-router 0.8.0` PyPI release. Adds the
`Dabbler: Regenerate Narration Templates` Command Palette action
that writes canonical CLAUDE.md / AGENTS.md files containing a
single Set-044-spec'd session-start attribution marker an operator
can drop into a free-running consumer workspace to make the
assistant's native-log emissions correlatable back to a Dabbler
session set.

### Added

- **Harvest signal badges** (`media/session-sets-tree/client.js`,
  `media/session-sets-tree/tree.css`) — four single-letter badges
  (W / N / M / B) per Explorer row showing what evidence the joiner
  found for that set. Each lights independently; off-state is dim.
  IBM colorblind-safe palette per the operator's prior
  `gauges_sizing_followup` preference (blue / purple / orange /
  magenta).
- **Conflict pills** (same files) — separate row below the signal
  strip with one pill per detected coordination conflict.
  `data-kind` and `data-severity` attributes drive color
  (magenta / orange / yellow severity scale); hover for the
  joiner's note. Indent uses `calc(12px +
  var(--row-fraction-width) + var(--row-fraction-margin-right))`
  so the pill column tracks the fraction column above through
  font-size changes.
- **HarvestService** (`src/providers/HarvestService.ts`, NEW;
  281 LOC) — async shell-out to `python -m ai_router.joiner
  --coverage --json` and `--conflicts --json` from
  `CustomSessionSetsView.postSnapshot`. 30s TTL cache with
  `onUpdate` callback triggers a re-render when fresh data lands.
  Graceful-fail when both shell-outs fail. Dev-mode PYTHONPATH
  discovery walks up from `extensionUri.fsPath` looking for an
  `ai_router/__init__.py` sibling (present under
  `--extensionDevelopmentPath`; absent in Marketplace install).
  `SpawnResult.diagnostic` field distinguishes
  `missing-ai-router` / `spawn-failed` / `non-zero-exit` /
  `json-parse` failure modes.
- **Missing-dependency setup warning** — when `HarvestService`
  detects `dabbler-ai-router` is not installed (via stderr regex
  on `ModuleNotFoundError.*ai_router` /
  `No module named ['"]ai_router['"]`), fires a one-time
  `vscode.window.showWarningMessage` with an `Open settings`
  action that navigates to `dabblerSessionSets.pythonPath`.
  Sticky per-session via `missingDependencyNotified` flag.
- **`Dabbler: Regenerate Narration Templates`**
  (`src/commands/regenerateNarrationTemplates.ts`, NEW) —
  Command Palette action. Picks the in-progress session set
  (auto-selects when exactly one is in-progress; quickpick
  otherwise via `readAllSessionSets`), shells out to
  `python -m ai_router.narration` twice (claude + agents kinds)
  inside a `vscode.window.withProgress` wrapper, writes outputs
  to `<set-dir>/narration-templates/{CLAUDE.md,AGENTS.md}`, then
  surfaces a toast with `Open Rendered CLAUDE.md` + `Copy to
  consumer workspace…` actions. Copy-to-workspace presents a
  quickpick + `showOpenDialog` folder picker + `fs.copyFileSync`
  with overwrite confirm.
- **`RowPayload` extensions**
  (`src/types/sessionSetsWebviewProtocol.ts`) — new
  `harvestSignals: HarvestSignalsPayload | null` and
  `conflicts: ConflictPayload[]` fields. Type unions for
  `ConflictKind` (`'engine-mismatch' | 'bare-touch' |
  'stale-checkout-touch' | 'writer-bypass'`) and
  `ConflictSeverity` (`'high' | 'medium' | 'low'`).

### Documentation

- `CONTRIBUTING.md` (NEW at repo root) — per-test-layer scope
  guidance and the Set 045 rebuild-trap note: invoke through
  `npm run test:playwright` (not bare `npx playwright test`) so
  the `npm run compile` step rebuilds the extension bundle
  before Playwright loads it. A stale `dist/extension.js`
  silently produces assertion failures that look like
  regressions.
- `docs/cross-repo-harvest-notice.md` (NEW) — cross-tier
  consumer-repo notice covering wrapper install + narration
  template usage + Explorer badge / pill semantics. Parallel
  structure to the existing `cross-repo-checkout-notice.md`;
  operator pulls the snippet into each consumer's CLAUDE.md
  manually.
- `docs/narration-templates.md` (shipped in Set 045 S4; pointer
  here for completeness) — operator reference for the narration
  v1.1 surface.
- `docs/session-sets/045-log-harvest-implementation/joiner-spec.md`
  (shipped in Set 045 S2) — canonical joiner contract: conflict
  modes, Harvest Record schema §5, CoverageSummary fields,
  ConflictReport fields, §7 redaction posture.

### Companion release

`dabbler-ai-router 0.8.0` ships the producer + joiner side:

- `ai_router.dabbler_launch` — headless `dabbler-launch` CLI
  wrapper (Set 045 S3) writing canonical Harvest Record §5
  shape to `~/.dabbler/launches.jsonl`.
- `ai_router.joiner` — joiner package (S2/S3/S4/S5) with
  Claude + Copilot per-event JSONL parsers, conflict-detection
  semantics across the three modes, CoverageSummary +
  ConflictReport surfaces, and the `python -m ai_router.joiner`
  CLI.
- `ai_router.narration` — narration v1.1 module (S4) with
  `MARKER_REGEX`, `detect_marker`, `render_template`,
  `project_state_for_template`, and the
  `python -m ai_router.narration` CLI.

### Notes

- The harvest surface is **observation-only** — it never writes
  to `session-state.json` and never modifies the orchestrator
  block. Set 036's check-out / check-in model remains the sole
  writer.
- The Set 045 architectural commitments (dual-primary channels;
  session-start-only narration; wrapper in `ai_router/`;
  headless-first; ungated-default; LaunchAdapter retirement;
  joiner as engineering center of gravity) are Set 044
  consensus-locked and were not relitigated within Set 045.

## [0.20.0] — 2026-05-24 (Set 036 — chatSessionId identity refinement + watcher-scope discipline)

Ships the user-facing surface for the chatSessionId-refined
holder-identity composite (`engine + provider + chatSessionId`).
Adds a three-button takeover modal (Take Over / Open in Read-Only
Mode / Cancel) for chatSessionId-only mismatches that fire from the
manual `Check Out As…` quickpick or from the auto-conflict-record
polling service. Retires the Codex config-toml watcher and the
`signalKind`-driven gauge variants per the D1 watcher-scope
discipline locked in the cross-provider audit. Adds a watcher-
inventory convention test (Q7) that enforces D1 at code-review
time. Cleans up the orphan source from Set 034's render-surface
retirement (per-row accordion + empty-state CTA +
detectOrchestrators). Companion `dabbler-ai-router` PyPI release:
`0.7.0`.

### Added

- **chatSessionId takeover modal** (`chatSessionMismatchModal.ts`)
  — three buttons (Take Over / Open in Read-Only Mode / Cancel)
  via `showInformationMessage({modal: true})`. Surfaces from
  CheckoutPollService when a conflict record's chatSessionIds
  differ on the same engine+provider, and from the manual
  `Check Out As…` command via
  `maybeShowChatSessionMismatchOnManualCheckout()`. Engine+provider
  mismatches stay on the legacy non-modal flow.
- **ReadOnlyIntentService** (`ReadOnlyIntentService.ts`) — in-memory
  map of session-set paths the operator picked Read-Only on. Shared
  across modal + checkOutOrchestrator + future surfaces. Transient
  by design (clears on extension-host restart); no persistence per
  the audit's Q6 REJECTED verdict. EventEmitter fires on add/clear
  so future UI subscribers can observe state.
- **new_chat_id workflow toast** (`newChatIdWorkflowToast.ts`) —
  one-time-per-(workspace, orchestrator) info toast surfaced by
  the Gemini + Copilot install-shim commands. Three clipboard-copy
  actions (bash / PowerShell / fish) with current-shell-eval
  patterns that persist `$CHAT_SESSION_ID` in the operator's
  active shell. 'Don't show again' suppression via workspaceState.
- **Watcher-inventory convention test** (`watcherInventory.test.ts`)
  — Q7 enforcement of D1 watcher-scope discipline. Hand-maintained
  `WATCHER_ALLOWLIST` of `{file, line, target, purpose}` tuples.
  Fails new `fs.watch` / `createFileSystemWatcher` callsites
  without an allowlist entry.

### Changed

- **`CheckoutPollService` extended** with chatSessionId-aware
  routing. `ConflictRecord` schema (still v1, additive) gains
  optional `heldByChatSessionId` + `wouldBeHolderChatSessionId`;
  new `isChatSessionMismatch` predicate; new
  `handleChatSessionMismatch` branch surfacing the modal in place
  of the legacy poll/force/dismiss prompt. `pollKey()` includes
  the chatSessionId (with sentinel for null) so two distinct
  chats produce distinct keys. `isSlotFreeForHolder()` accepts an
  optional `wouldBeChatSessionId` and applies the H3 tolerant-on-
  read rule.
- **`dabbler.checkOutOrchestrator` (manual command)** routes
  chatSessionId mismatches to the same modal helper before reaching
  the existing force-override confirmation. Take Over → force
  dispatch; Read-Only → set intent + abort; Cancel → abort.
  Read-only intent commit is gated on a successful exit-0 dispatch
  (no silent loss of protection on cancelled prompts).
- **Claude Code SessionStart invoker**
  (`claude-session-start-invoker.js`) extracts `session_id` from
  the hook payload and forwards as `--chat-session-id` to
  `start_session`. `preserveExistingClaude()` gates model/effort
  preservation on the full H4 triple (engine + provider +
  chatSessionId).
- **Session Set Explorer fraction column always populated**
  (`CustomSessionSetsView.fractionFor`). A session set without a
  known `totalSessions` count (spec.md hasn't been written yet, or
  is written but doesn't enumerate sessions) now renders as
  `N/?` instead of an empty fraction. The `?` denominator signals
  "not yet spec'd" without leaving the row visually identical to a
  malformed entry. Operator directive shipped in-flight during the
  S7 release pass.

### Removed

- **Codex config-toml watcher** (`src/codex/configWatcher.ts` and
  the entire `src/codex/` directory) — the most prominent D1
  violator. Codex CLI joins Gemini Code Assist and GitHub Copilot
  as manual-only orchestrators; operators claim via the universal
  `Check Out As…` quickpick.
- **`signalKind` enum + UI variants** — the top-level + nested
  `effort.signalKind` + `effort.observedAt` fields on
  `OrchestratorMarker`; the clock-overlay span (`⏱`) for
  `last-observed`; the `(configured default)` qualifier on the
  model line; the multi-branch `modelTooltip` / `effortTooltip`
  switches; the `.signal-current` / `.signal-manual` /
  `.signal-last-observed` / `.signal-configured-default` /
  `.clock-overlay` CSS rules; the `data-signal=` SVG attribute.
- **Orphan source from Set 034's runtime retirement** —
  `src/providers/OrchestratorAccordion.ts` (496 LOC),
  `src/providers/detectOrchestrators.ts` (137 LOC), and
  `src/test/suite/detectOrchestrators.test.ts` (8 tests) DELETED.
  Set 034 already shipped `accordionHtml: null` on every row at
  the render surface; the source survived as "possible future
  re-enable" deadweight. The H2 writer invariant + Q5 lifecycle
  lock together make the empty-state's predicate
  (in-progress + orchestrator block null) unreachable in any
  properly-operated workspace; a future re-enable fetches the
  implementation from git history at v0.18.x. Same YAGNI pattern
  as the Codex config-toml watcher retirement.
- **`media/orchestrator-indicator/`** directory DELETED.
  indicator.css was orphan since Set 029 S4 retired
  `orchestratorIndicatorProvider`.
- **`media/session-sets-tree/tree.css`** trimmed 458 → 282 lines
  (full accordion-body section, gauge SVG rules, tier/effort
  classes, stale-stripe overlay, model-section styles).

### Migration

- **No operator-visible breaking changes** to the Session Set
  Explorer UI. The retired surfaces were already non-functional in
  v0.19.0 (Set 034).
- **No breaking changes** to consumers of the orchestrator-writer
  protocol. The Set 033 H4 base composite is preserved on
  tolerant-on-read; the chatSessionId field is additive.

### Internal

- Reorganized `Recommendation` interface from OrchestratorAccordion.ts
  to `inProgressSetsService.ts` (its only non-test consumer).
- Layer-3 Playwright suite: 4 pre-existing failures all addressed
  (21/2/4 baseline → 24/2/0 post-cleanup).

## [0.19.0] — 2026-05-21 (Set 034 — Session Set Explorer honesty pass)

Retires the per-row orchestrator-tracking accordion (gauges + model
description + smart CTA + Actual/Suggested mismatch row) and the
right-click orchestrator group (Check Out As… / Release Check-Out /
Open Orchestrator Writer Log) from the Session Set Explorer. Operator
feedback (2026-05-21) called out the gauges as nonfunctional and
misleading: signalKind was always "current" under the Set 033 adapter
regardless of recorded staleness, effort tracking via `/think_*` slash
commands was retired in Set 033 H2 (no longer observed), and for
orchestrators without a hook path (Copilot, Gemini) the gauge area
was either empty or whatever the last manual checkout claimed. Rather
than caveat all of that visually, the entire orchestrator-tracking
display surface is shelved until Set 036+ delivers a real
chatSessionId-backed signal.

The `orchestrator` block on `session-state.json` is still written by
`start_session` / `close_session` (the check-out semantics serve
coordination + audit-log purposes); only the UI surface retires.
Companion `dabbler-ai-router` release: none — Python side is
unchanged.

### Changed (rendering)

- **Tree shell:** per-row chevron + per-row state-badge icon retired.
  The bold color-coded progress fraction (`3/6`, `0/4`, `3/3`)
  becomes the row's right-aligned LEFT-column list icon. Fixed-width
  fraction column right-aligns within itself; the row name + optional
  description sit to its right and wrap freely. When the name wraps,
  the second line indents under the first line of the name (fraction
  column stays outdented).
- **Fraction colors** (theme-aware via CSS variables on body):
  - In Progress: `rgb(86, 180, 233)` (sky blue) both themes
  - Not Started: `rgb(127, 127, 127)` light / `rgb(187, 187, 187)` dark
  - Complete: `rgb(0, 158, 115)` light / `rgb(0, 197, 140)` dark
- **Bucket headers** (IN PROGRESS / NOT STARTED / COMPLETE / CANCELLED)
  are the SOLE collapse affordance. Clicking the header toggles the
  body display; chevron flips between `▾` and `▸`. Empty buckets
  show the heading without a chevron. Heading padding bumped (6/8
  top/bottom) so there's ample air between heading and first row.
- Row description format: drops the `N/M ·` prefix (fraction is now
  the icon column) and the trailing `Complete` word. For in-progress
  rows reads just `session N in flight`; not-started + complete +
  cancelled rows have no description, only the fraction.

### Removed

- `dabbler.checkOutOrchestrator` / `dabbler.releaseCheckOut` /
  `dabbler.openOrchestratorWriterLog` from `ActionRegistry.ROW_ACTIONS`
  (and the right-click context menu). The commands stay registered in
  `extension.ts`; Command Palette access preserved as a power-user
  escape hatch.
- `CustomSessionSetsView.buildRow` no longer invokes
  `OrchestratorAccordion.renderAccordionBody` /
  `accordionStateFromOrchestratorBlock` / `pickEmptyStateCta` /
  `recommendationFor`. Those modules remain in the tree (still used by
  `start_session` / `close_session` plumbing in the router) but the
  webview never calls them.
- ArrowRight / ArrowLeft per-row expand-collapse keyboard handlers in
  `client.js` — accordion is gone, nothing to expand.
- Set 034 Session 1 spec re-scoped mid-session per operator review
  (per `change-log.md`); Session 2 (screenshot + version-bump +
  publish) folded into this release.

### Cleanup

- Updated `actionRegistry.test.ts` to assert the 14-action shape
  (down from 17) and to assert the orchestrator group is NOT exposed.
- Saved the deferred cascading-context-menu preview as a separate
  artifact at
  `docs/proposals/2026-05-21-context-menu-cascade/preview.html` for
  reactivation when Set 036+ delivers a real session-launch path.

### Known limitations carried forward

- 2 Layer-2 unit-test failures persist (configEditor-foundation
  panel-lifecycle stub gap; notificationsSection rendered-HTML regex)
  — both pre-existing and unrelated to this release.
- 3 Layer-3 Playwright scenarios in `session-sets-tree.spec.ts`
  (carried from Set 035) still need refresh to match the new row
  shape; queued for a follow-on cleanup set.

## [0.18.1] — 2026-05-21 (Set 035 — state-file sole truth for cancellation)

Extends the Set 033 H2 verdict (`session-state.json` is canonical) to
the cancellation / restoration side of the lifecycle. The bucketing
reader now consults `state.status === "cancelled"` first; `CANCELLED.md`
and `RESTORED.md` markdown files survive as durable audit-history
artifacts and serve as a legacy-fallback signal only. No companion
PyPI release this set — `ai_router/session_lifecycle.py` was verified
byte-equivalent with the TypeScript writer (10-row parity check) and
required no edits.

### Added

- **`readCancellationState(sessionSetDir)`** in
  `src/utils/cancelLifecycle.ts` — single canonical reader entry point.
  Returns `"cancelled" | "restored" | "active" | "unknown"` as a
  discrete `CancellationState` type union (also exported). Resolution
  order: state.status==="cancelled" → cancelled; non-cancelled status
  + `RESTORED.md` present → restored (history-aware); non-cancelled
  status + no `RESTORED.md` → active; no / unparseable / non-string
  status state file → unknown (caller falls back to legacy
  file-presence predicate).
- **3 Layer-3 Playwright scenarios** in
  `src/test/playwright/cancellation-state-file.spec.ts`:
  state-file-only cancellation (markdown deleted); legacy fallback
  (state file deleted); state-file wins on stray `CANCELLED.md`
  alongside `status: "complete"`.

### Changed

- **`src/utils/fileSystem.ts:readSessionSets`** — bucketing precedence
  now reads `readCancellationState()` first. `"unknown"` +
  `isCancelled(dir)` legacy-fallback path emits `console.warn` naming
  the directory and pointing at `ensure_state_file` for repair.
- **`renderAccordionEmpty()`** in
  `src/providers/OrchestratorAccordion.ts` — removed two grey
  placeholder `renderGaugeSvg('unknown', ...)` elements from the
  empty-state branch (operator-directed bundle in Session 1). Empty
  state now renders only the `.acc-empty-cta` line. Loaded-state
  rendering unchanged.
- **`docs/session-state-schema.md`** — "Cancel / restore" section
  rewritten state-file-first with three new subsections (Canonical
  reader / Writer symmetry / Layer-3 coverage). Status-table
  footnote on `"cancelled"` names the state field as canonical.
  Bucketing-list bullet now reads "status === cancelled → Cancelled
  (state file wins, Set 035)".
- **`docs/ai-led-session-workflow.md`** — "Cancelling and restoring
  a session set" section reframed: canonical writers flip
  `state.status='cancelled'` AND prepend to `CANCELLED.md` in a
  single atomic boundary; hand-edit affordance points at
  `session-state.json` with markdown audit entry
  recommended-not-required. "Detection precedence" rewritten as a
  three-tier ladder. Step 1's `or CANCELLED.md present = skip`
  bullet replaced with `or status: "cancelled" = skip`.
- **`src/utils/cancelLifecycle.ts` JSDoc** — header reframed (markdown
  markers are durable audit artifacts post-Set-035); byte-equivalence
  pin cites Session 2's verified 10-row parity table; legacy
  `isCancelled()` / `wasRestored()` tagged as legacy-fallback-only
  with a pointer at `readCancellationState()` as primary entry point.

### Tests

- **10 new test cases** in `src/test/suite/cancelLifecycle.test.ts`
  under suite "cancelLifecycle — readCancellationState (Set 035
  state-file-first)" — covers the new contract + legacy fallback +
  missing/unparseable state-file edge cases.
- **6 new writer-parity test cases** in the same file under suite
  "cancelLifecycle — writer parity (Set 035 Session 2)" — covers
  LF-only newlines + no-BOM byte scan; JSON byte-equivalent with
  Python; cancel writes only status+preCancelStatus
  (deep-equality); cancel+restore round-trip; cancel timestamp
  shape; re-cancel after restore preserves original preCancelStatus.

### Tooling

- **`docs/session-sets/035-.../scripts/harvest_glossary.py`** — new
  one-shot tool that scans source files for filename-like string
  literals, groups by extension, clusters near-matches via
  Levenshtein distance (default ≤ 3) using union-find. Useful for
  cross-solution naming consistency audits.

### Known issues

- 3 pre-existing Layer-3 test-side failures in
  `src/test/playwright/session-sets-tree.spec.ts`
  (`renders ARIA tree structure with bucket grouping for an in-progress
  set`, `seeded orchestrator block renders provider sublabel in the
  accordion`, `empty-state CTA falls back to Claude installer when no
  orchestrators detected`) — test-scaffolding / locator-specificity
  issues, NOT production regressions. `renderAccordionEmpty` still
  emits `.acc-empty-cta` and `"No signal —"` text correctly. Deferred
  to Set 034 (styling iteration).

## [0.18.0] — 2026-05-21 (Set 033 — orchestrator check-out / check-in)

Ships the reader / UI / queueing side of the check-out / check-in
coordination model anchored in `session-state.json`'s `orchestrator`
block, per the Set 032 audit verdicts. Companion PyPI release:
`dabbler-ai-router 0.6.0`.

### Added

- **`dabbler.releaseCheckOut` command** ("Dabbler: Release Check-Out"
  in the Command Palette). Wraps `start_session --force` against
  the in-progress set (or, on multi-in-progress, QuickPick-selected
  set). Confirmation step required. Force-override is logged to
  `~/.dabbler/orchestrator-writer.log` by the writer.
- **Queueing / polling on check-out conflict.** New
  `CheckoutPollService` (`src/providers/CheckoutPollService.ts`)
  watches `~/.dabbler/checkout-conflicts/` for sentinel JSON files
  emitted by the Claude `SessionStart` invoker and the Codex
  config-toml watcher when `start_session` exits with
  `EXIT_CHECKOUT_CONFLICT (4)`. Surfaces a non-blocking
  information message with three actions:
  - **Poll for release** — 5s-debounced `fs.watch` on the held
    set's `session-state.json`; auto-retries `start_session` for
    the would-be holder when the set frees (uses the H4 identity
    predicate).
  - **Force override** — invokes `start_session --force`.
  - **Dismiss** — no further action.
- **`dabblerSessionSets.checkoutPollTimeoutMinutes` setting**
  (default 30, range 1..1440). On timeout, surfaces a one-time
  toast pointing at the "Release Check-Out" Command Palette
  action.
- **Multi-in-progress rendering.** The Session Sets view renders
  N in-progress sets as N per-set accordions; each has its own
  gauges + bucket counts. Single-active-set banner is gone.

### Changed

- **`dabbler.setOrchestrator` renamed to `dabbler.checkOutOrchestrator`**
  ("Check Out As…"). The implementation modules and call sites
  follow. ActionRegistry display label updated.
- **`resolveActiveSet()` replaced by `listInProgressSets()`** in
  the reader path (previously `MarkerWatchService.ts`; now
  `inProgressSetsService.ts`). Returns the array of in-progress
  `session-state.json` records sorted by `startedAt`; reads each
  set's state file directly via the existing async `fs.promises`
  scan.
- **Hook refactor (H1).** The Claude `SessionStart` hook invokes
  `python -m ai_router.start_session` rather than writing the
  `orchestrator` block directly. Failure surfaces as a toast
  (no silent retry). The Codex config-toml watcher was already
  H1-compliant (Set 029 Session 5).

### Removed

- **`.dabbler/orchestrator.json` per-set marker file** (H2 single
  source of truth — `session-state.json` is canonical):
  - Writer (`scripts/write-orchestrator-marker.js`) deleted.
  - All in-repo stale `.dabbler/orchestrator.json` files purged.
  - `docs/orchestrator-marker-schema.md` deleted; canonical schema
    is now `docs/session-state-schema.md`.

### Layer-3 tests

- `src/test/playwright/checkout-conflict.spec.ts` — refusal-error
  content (holder identity + both release paths in stderr),
  force-override (`orchestrator-writer.log` audit line), same-
  orchestrator re-attach.
- `src/test/playwright/multi-in-progress.spec.ts` — two-set
  rendering with distinct holders.
- `src/test/playwright/checkout-polling.spec.ts` — sentinel
  consumed on activation (1 passing + 1 skipped FIXME on the full
  polls-then-attaches happy path, covered exhaustively at Layer 2).
- Pre-existing 2 skipped Playwright scenarios with FIXMEs
  (release-checkout Command Palette brittleness, pre-existing
  multi-in-progress accordion-body display bug) — out of scope
  for this set.

### Migration

- **Consumer repos** receive a one-time CLAUDE.md insertion via
  `docs/cross-repo-checkout-notice.md` (authored in this set).
  Operator pulls into each manually:
  - `dabbler-platform`
  - `dabbler-access-harvester`
  - `dabbler-homehealthcare-accessdb`

### Reference

- [`docs/session-state-schema.md`](../../docs/session-state-schema.md)
  "Check-out / check-in (Set 033)" — full schema + holder identity
- [`ai_router/docs/close-out.md`](../../ai_router/docs/close-out.md)
  Section 4 — stranded-check-out recovery
- [`docs/ai-led-session-workflow.md`](../../docs/ai-led-session-workflow.md)
  "Orchestrator check-out / check-in (Set 033)" — workflow-level
  invariants

## [0.17.1] — 2026-05-19 (Set 029 Session 6 — UI affordance polish)

Polish pass before the Marketplace publish of the multi-provider work
shipped in 0.17.0. No new features; one user-visible UI change and one
hygiene cleanup. The check-out / check-in architecture migration that
came up during this session's HTML-preview iteration is deferred to a
follow-on session set (`030-orchestrator-checkout-checkin`) under
proper audit-then-spec discipline; pre-audit artifacts are preserved at
[`docs/proposals/2026-05-19-orchestrator-tracking-architecture/`](../../docs/proposals/2026-05-19-orchestrator-tracking-architecture/).

### Changed

- **`Set Orchestrator Model & Effort…` and `Open Orchestrator Writer Log`
  relegated** from the accordion-body buttons to the **right-click
  context menu** (on in-progress / always rows respectively) and the
  **Command Palette** (already registered). The accordion body is no
  longer cluttered with two buttons that don't directly affect the
  surrounding gauges, addressing the affordance-clarity feedback
  surfaced during the Session 6 HTML-preview iteration (and confirmed
  by the cross-provider consensus call run mid-session — GPT-5.4 round
  2 Q4 must-fix: "do not leave a prominently visible button with a
  label that implies stronger behavior than it actually has"). Both
  commands remain available via Command Palette under the "Dabbler"
  category and via right-click on the session-set row. `ActionRegistry`
  now has 16 row actions (was 14 — `dabbler.setOrchestrator` in group
  501 surfaces only on in-progress rows; `dabbler.openOrchestratorWriterLog`
  in group 502 is always available as a diagnostic).
- **`readCurrentMarkerForWorkspace` converted to `async`/`fs.promises`.**
  Tightens up Session 5's deferred Round-B Gemini SUGGEST: the
  force-override pre-check no longer blocks the extension host event
  loop on its session-state.json walk. Caller
  (`maybeConfirmForceOverride`) was already async; the await chain is
  well-contained. Signature is unchanged from an external perspective —
  the function isn't exported.

### Removed

- **Dead CSS.** The `.acc-actions` and `.acc-action` rules in
  [`tree.css`](media/session-sets-tree/tree.css) are removed alongside
  the HTML that produced them. The S4 M8 "indicator-action parity"
  rule retires with them — the right-click context menu subsumes that
  affordance.

### Deferred (not in 0.17.1; will land in `030-orchestrator-checkout-checkin`)

- **Check-out / check-in state machine** replacing today's multi-
  writer precedence model. Cross-provider consensus run during this
  session (Gemini Pro round 1 + GPT-5.4 rounds 1 & 2) endorsed the
  direction; the implementation requires resolving three High items
  before lock-in (writer authority, single source of truth, hard-vs-
  advisory framing) per the audit-input README at
  [`docs/proposals/2026-05-19-orchestrator-tracking-architecture/README.md`](../../docs/proposals/2026-05-19-orchestrator-tracking-architecture/README.md).
- **Multi-in-progress rendering.** Coupled to the resolver refactor
  required by the migration; ships in the same set.
- **Ambiguity banner removal.** Same — its removal is coupled to the
  resolver refactor that ships in the migration set.
- **`pushMru` MRU file race fix** from S5 Round-B SUGGEST #1. Analysis
  found the proposed promise-chain mutex would target a race that
  doesn't exist in the current sync code (the in-process race claim
  was for the *async* version of the function; cross-process races on
  the file need file-level locking, which the proposed fix doesn't
  provide). Folded into the Set 030 module rewrite where the surface
  changes anyway.

## [0.17.0] — 2026-05-19 (Set 029 Session 5 — multi-provider feature-complete)

### Added — Non-Claude orchestrator detection and manual override

- **Codex auto-detect via `~/.codex/config.toml` watcher.** Activated
  at extension start. Reads top-level `model` and `model_reasoning_effort`
  fields from Codex's TOML config, then writes a `configured-default`
  marker (medium confidence) via the shared
  `scripts/write-orchestrator-marker.js` helper. Honors the existing
  multi-writer precedence rules — a fresh `current`/`manual`/
  `last-observed` Claude or manual signal blocks the
  `configured-default` write so a Codex config change can't stomp a
  live session signal. The watcher debounces filesystem events to a
  single dispatch per 500 ms quiet window.
- **Universal manual-override quickpick (`dabbler.setOrchestrator`).**
  Replaces the Session 2 stub. Three flows in one command:
  - **MRU tuples** at the top — operator's recent
    `<provider> + <model> + <effort> + <thinking>` combinations,
    most-recent first, stored at `~/.dabbler/orchestrator-mru.json`
    (capped at 8 entries).
  - **"(set new combination…)"** triggers a multi-step picker flow
    (provider → model → effort → thinking on/off).
  - **"(copy keybindings.json snippet for current selection)"** —
    copies a `keybindings.json` fragment pre-filled with the
    most-recent tuple so the operator can hotkey-bind a
    one-keystroke "back to my preferred orchestrator" preset.
  Hotkey-bindable: callers can invoke `dabbler.setOrchestrator` with
  `{ provider, model, effort, thinking }` args to apply directly,
  bypassing the picker. **Force-override semantics:** if the helper
  detects a fresh `current`-precedence marker from another writer,
  the quickpick shows a modal "Override existing live signal from
  <writer>?" confirmation before proceeding; on accept it passes
  `--force-override` to the helper.
- **Gemini Code Assist installer shim (`dabbler.installOrchestratorHook.gemini`).**
  Per audit Q2 — Gemini Code Assist exposes no documented persisted
  state we can scrape. The command opens the manual-override
  quickpick with `provider: "google"` pre-filled. No actual hook is
  installed; the writer marker carries `signalKind: "manual"`,
  `confidence: "high"`.
- **GitHub Copilot installer shim (`dabbler.installOrchestratorHook.copilot`).**
  Per audit Q4 — Copilot's old chat-model settings keys were
  deprecated and have no current public replacement. Same shape as
  the Gemini shim, with `provider: "github"` pre-filled.
- **Smart empty-state CTA.** The "No signal — install hook" link in
  the accordion-body empty state is no longer hardcoded to Claude.
  The webview detects which orchestrators are installed locally
  (Claude Code via `~/.claude/`, Codex via `~/.codex/`, Gemini Code
  Assist + GitHub Copilot via the VS Code extension registry) and
  surfaces the right installer/preset command. If multiple are
  detected, the operator's MRU ordering wins (most-recent provider
  surfaces first); otherwise priority order is Claude → Codex →
  Gemini → Copilot. Falls back to the Claude installer link when
  nothing is detected.
- **`data-command-args` support in the webview client.** Optional
  JSON-encoded args attribute on accordion buttons gets parsed and
  forwarded through `executeCommand` postMessages so the smart CTA
  can pass `{ prefillProvider }` to `dabbler.setOrchestrator`.

### Changed

- **Webview command allowlist expanded** to include the Gemini and
  Copilot installer-shim command IDs alongside the Claude installer,
  manual-override, and writer-log openers.
- **`renderAccordionEmpty()` signature** now accepts an optional
  `EmptyCta` to drive the install-link target. Existing callers
  passing no argument fall back to the v0.16.0 Claude-installer
  default; the only in-tree caller (`renderAccordionBody`) is updated
  to plumb the detection result through.

### Removed

- **Session 2 manual-override stub** (`setOrchestratorManualStub.ts`)
  is deleted. The `dabbler.setOrchestrator` command ID stays stable —
  only the implementation changes.

## [0.16.0] — 2026-05-18 (Set 029 Session 4 — custom-tree pivot)

### Changed — Session Sets view is now a webview-rendered custom tree (BREAKING within the v0.15.0 preview)

- **`dabblerSessionSets` re-registered as a `WebviewViewProvider`.**
  Replaces the native `TreeDataProvider`. Same view id, same view
  container, same `viewsWelcome` declaration. The custom tree renders
  ARIA-compliant bucket groups + treeitem rows (`role="tree"` /
  `role="group"` / `role="treeitem"` / `aria-level` / `aria-expanded`
  / `aria-selected`) and uses a roving tabindex for keyboard nav.
- **Orchestrator gauges now live in per-row accordions.** The
  v0.14.2/v0.15.0 dedicated `dabblerOrchestratorIndicator` view is
  **retired**. The accordion body of the resolved in-progress set
  carries the v0.15.0 gauge treatment verbatim (SVG semi-circle
  gauges with IBM colorblind-safe palette, capacity bars,
  inverted-band headers, mismatch detection, "updated Xs ago"
  footer, stale stripe overlay, schema-v3 slug-mismatch fallback).
- **Indicator-action parity preserved** (per S4 M8). The accordion
  body retains Install Hook, Set Orchestrator, and Open Writer Log
  buttons. The standalone commands (`dabbler.installOrchestratorHook.claudeCode`,
  `dabbler.setOrchestrator`, `dabbler.openOrchestratorWriterLog`)
  remain registered for direct invocation via the command palette.
- **Row context menus moved to QuickPick** (per S4 Q6). The 14
  `view/item/context` entries previously in `package.json` are
  replaced by a typed `ActionRegistry` in TypeScript. Right-click,
  `Shift+F10`, and Context Menu key all open the same QuickPick
  populated from `ActionRegistry.applicableActions(set, supports)`.
  UX divergence from a native context menu, accepted in v1 per
  audit; v1.1 may revisit if feedback flags it.
- **Multi-window observation** (per pivot synthesis): both VS Code
  windows that have the same workspace open render the same per-set
  marker. Freshness cue via the existing "updated Xs ago" footer
  in the gauge body.
- **Ambiguity banner** (per S4 Q8 = a+c): when the walk-up resolver
  returns `multiple-in-progress-sets`, a banner above the In Progress
  bucket says "Multiple in-progress sets — orchestrator info hidden.
  Open writer log." S3's silent fail-close behavior preserved for
  `no-in-progress-set` and `no-docs-session-sets`.

### Added — file structure

- `src/providers/CustomSessionSetsView.ts` (~500 LOC): the new
  `WebviewViewProvider`. Owns lifecycle, message protocol, snapshot
  serialization.
- `src/providers/OrchestratorAccordion.ts` (~430 LOC, extracted):
  pure render helpers — `renderGaugeSvg`, `describeMarker`,
  `describeRecommendation`, mismatch helpers, `escHtml`, the visual-
  treatment matrix. No `vscode.*` lifecycle / filesystem watcher
  coupling.
- `src/providers/MarkerWatchService.ts` (~395 LOC, extracted): the
  marker reader, per-set marker watcher, state-watcher,
  workspace-folder listener, polling backstop, slug validation.
  Emits typed events; presentation-agnostic.
- `src/providers/ActionRegistry.ts` (~80 LOC): the 14 row-action
  registry with typed predicates. Single source of truth for action
  applicability.
- `src/providers/suppressionState.ts` (~60 LOC): tuple-keyed
  (slug, marker.updatedAt) suppression reducer for the manual-
  collapse "current occurrence only" behavior.
- `src/types/sessionSetsWebviewProtocol.ts` (~130 LOC): typed
  discriminated unions for host↔webview messages with monotonic
  version field. Prevents stale-render races from out-of-order
  watcher/polling events.
- `media/session-sets-tree/client.js` (~280 LOC): webview-side
  rendering, kbd nav, ARIA, contextmenu/Shift+F10/Context Menu key
  dispatch, monotonic-version snapshot drop, defense-in-depth
  HTML escaping.
- `media/session-sets-tree/tree.css` (~270 LOC): tree shell styling
  (bucket headers, row hover/focus/selection, accordion body) plus
  the lifted v0.15.0 gauge CSS.

### Added — test coverage

- Layer-2 unit tests: `actionRegistry.test.ts`,
  `suppressionState.test.ts`, `markerWatchService.test.ts`. Run via
  `npm run test:unit`; complement the Layer-3 Playwright smoke.
- Layer-3 Playwright: `session-sets-tree.spec.ts` replaces the
  retired `treeView.spec.ts` + `orchestrator-indicator.spec.ts`.
  Covers ARIA tree structure, bucket grouping, welcome panel,
  HTML-escape XSS path, loading→ready transition.
- `electronLaunch.openSessionSetsView` updated to return a
  `FrameLocator` traversing the two-level webview iframe stack
  (outer sandbox + inner content frame).

### Removed

- `src/providers/SessionSetsProvider.ts` (deleted; helpers were
  already in `SessionSetsModel` after S3).
- `src/providers/orchestratorIndicatorProvider.ts` (deleted; helpers
  moved to `OrchestratorAccordion.ts` + `MarkerWatchService.ts`).
- `src/test/playwright/treeView.spec.ts` + `orchestrator-indicator.spec.ts`
  (logic ported to `session-sets-tree.spec.ts`).
- `src/test/suite/cancelTreeView.test.ts` + `src/test/suite/e2e/`
  (TreeView-specific @vscode/test-electron tests; mechanism is
  obsolete with the pivot. Bucketing/sort invariants already
  covered by `sessionSetsProvider.test.ts` repointed to
  `SessionSetsModel` in S3).
- `package.json` `dabblerOrchestratorIndicator` view entry and the
  14 `view/item/context` rules (now driven by `ActionRegistry` per
  S4 M2).

### Risks (per S4 audit synthesis)

- R10 (focus/a11y): top-tier risk per GPT-5.4. Mitigation: WAI-ARIA
  tree pattern + Layer-3 kbd nav coverage.
- R11 (QuickPick UX divergence): mid-tier. Mitigation: theme-aware,
  keyboard-navigable; v1.1 custom HTML menu if needed.
- R12 (invalid interactive nesting): mitigated by M1 DOM fix
  (focusable container, not `<button>` wrapping accordion body).
- R13 (XSS via marker payload): mitigated by mandatory `escHtml()`
  on every dynamic webview interpolation + Layer-2/Layer-3 test
  coverage.
- R14 (message-ordering race): mitigated by monotonic version field
  on every render message (webview drops out-of-order).

### S4 custom-tree implementation audit (mid-Set 029, 2026-05-18)

- Authored S4 pre-session audit at
  [`docs/proposals/2026-05-18-custom-tree-implementation/`](../../docs/proposals/2026-05-18-custom-tree-implementation/)
  per memory `feedback_audit_then_spec_for_substantial_features`.
- Cross-engine consensus: Gemini Pro (router, $0.025) + GPT-5.4
  (manual paste in GitHub Copilot, $0.00) — both reviewers ratified
  all 11 implementation-shape questions (Q1–Q11) at proposed defaults.
- GPT-5.4 added 8 must-fix tightening items: focusable-treeitem DOM
  (not `<button>`-wrapped), typed `ActionRegistry`, versioned
  monotonic message protocol, presentation-agnostic
  `MarkerWatchService`, mandatory `escHtml()` on dynamic webview
  text, Layer-2 unit coverage for new logic, exact suppression-key
  tuple shape, and indicator-view retirement gated on action parity.
- Gemini added: Round-B verification pre-planned (single-round
  forecast was unrealistic for ~1500 LOC of new code); type-ahead
  search marked as v1.1 TODO.
- Spec.md Section 4 of 6 rewritten as 20-step implementation plan;
  Risks section grew by 5 (R10–R14: focus/a11y top-tier, QuickPick
  UX mid-tier, invalid interactive nesting, XSS via marker payload,
  message-ordering race); Total estimated cost section updated.
- No code changes shipped; mid-set audit only. Implementation runs
  as Session 4 ship under v0.16.0.

## [0.15.0] — 2026-05-18 (Set 029 Session 3 — per-session-set identity)

### Changed — orchestrator-marker identity model (BREAKING within the v0.14.2 preview)

- **Marker schema bumped to v3.** New top-level `sessionSetSlug` field
  carries the slug of the session set the marker belongs to. The
  reader validates `sessionSetSlug` against the resolved set before
  rendering; a mismatch falls back to the empty-state CTA (treats the
  marker as orphaned).
- **Per-session-set marker path.** Markers now live at
  `<workspace>/docs/session-sets/<slug>/.dabbler/orchestrator.json`
  instead of the legacy global `~/.dabbler/current-orchestrator.json`.
  Three parallel VS Code windows on three different consumer repos
  now render their own correct orchestrator state — the cross-window
  contamination bug from the v0.14.2 preview is eliminated.
- **Walk-up resolver in `scripts/write-orchestrator-marker.js`.** The
  writer walks up from `cwd` looking for `docs/session-sets/`, then
  scans subdirectories for the single set whose `session-state.json`
  reports `status: "in-progress"`. The reader runs the same algorithm
  rooted at the workspace folder.
- **Fail-closed posture.** When zero or more than one in-progress
  sets are resolvable (or no `docs/session-sets/` directory is reachable
  from `cwd`), the writer SKIPS the write and appends a diagnostic
  line to `~/.dabbler/orchestrator-writer.log` (which stays global so
  one log captures every writer attempt across every session set).
  No workspace-level orphan marker is created. The renderer surfaces
  its existing empty-state CTA on the same conditions.
- **Watcher re-binding on set transitions.** The indicator now watches
  every workspace `docs/session-sets/*/session-state.json` file in
  addition to the resolved per-set marker, so close-out flips and
  start_session events trigger an immediate re-resolution + re-render.
- **`.gitignore` self-protection.** On first write, the writer drops
  a `.gitignore` containing `*\n!.gitignore\n` into the per-set
  `.dabbler/` directory. The workspace's root `.gitignore` does not
  need to be patched for the marker file to stay untracked —
  consumer repos inherit the protection automatically. This canonical
  repo's `.gitignore` also lists `docs/session-sets/*/.dabbler/` as
  belt-and-suspenders.
- **`SessionSetsModel` data-layer extraction.** Pulled `progressText`,
  `isCurrentSessionInFlight`, `iconUriFor`, `needsMigrationBadge`,
  `forceClosedBadge`, `bucketSets`, `sortBucket`, and friends out of
  `SessionSetsProvider.ts` into `src/providers/SessionSetsModel.ts`.
  The provider is now a thin VS Code adapter; the model is the
  canonical home and is what the Set 029 S4 custom webview tree will
  consume. Existing callers continue to import from
  `SessionSetsProvider` via re-exports — no breakage.

### Removed

- **Legacy global marker path.** `~/.dabbler/current-orchestrator.json`
  is no longer read or written. Operators who installed the v0.14.2
  Claude Code hook must re-run `Dabbler: Install Orchestrator Hook
  (Claude Code)` to pick up the new walk-up resolver in the helper
  script (the installer is idempotent; helper-script path unchanged).
  Acceptable because v0.14.2 never shipped to Marketplace — no
  external consumer is affected.

### Known limitations

- **Wrong-set attachment (R8).** A stale `session-state.json` that
  lingers as `in-progress` after a forgotten close-out causes the
  walk-up resolver to attach the marker to the wrong work. Mitigation
  in this release: the indicator's hover tooltip surfaces the
  resolved set slug so the operator can spot the mismatch. Set 029 S4
  may add a small "attached to: \<slug\>" badge in the gauge frame.
- **`.gitignore` auto-patch (R9).** Workspaces that haven't been
  re-initialized still have their root `.gitignore` un-patched. The
  per-set `.dabbler/.gitignore` self-protection covers this case —
  the marker file stays untracked even without the root patch.

### Documentation

- **`docs/orchestrator-marker-schema.md`** — new file documenting the
  v3 marker shape, the per-set path, the walk-up resolver algorithm,
  the fail-closed posture, and the migration from the legacy v2
  global marker.

### Set 029 mid-set pivot (2026-05-18, S3 spec basis)

Cross-provider audit reshaped Set 029 from 4 → 6 sessions. Audit +
decisions:
[`docs/proposals/2026-05-18-custom-tree-pivot/`](../../docs/proposals/2026-05-18-custom-tree-pivot/)
(proposal.md, GPT-5.4 + Gemini Pro consensus, synthesis.md,
s3-spec-delta.md). The custom-tree pivot (replacing the native
`dabblerSessionSets` TreeView with a webview-rendered accordion that
embeds the gauges into each in-progress set's row) is S4 with its own
pre-session audit. Non-Claude provider detection is S5; README +
Marketplace publish is S6.

## [0.14.2] — 2026-05-18 (Set 029 Session 2 — orchestrator indicator gauges, Claude-only v1 preview)

### Added — Set 029 Session 2 deliverables (Claude Code surface only)

- **Orchestrator Indicator webview view.** New "Orchestrator" view
  pinned above the Session Sets tree in the Dabbler AI Orchestration
  view container. Renders two side-by-side semi-circle CSS gauges
  driven by `~/.dabbler/current-orchestrator.json`:
  - **Left gauge: Model.** Needle position encodes
    tier-within-provider (low/mid/flagship → red/yellow/green per
    Set 029 D5 — red=warning, green=preferred — inverts the
    conventional "red=expensive" mapping because the operator's
    stated failure mode is *forgetting to switch back up*, not
    overspending).
  - **Right gauge: Effort.** Five normalized levels (Low / Medium /
    High / Extra-High / Max) plus a binary Thinking-on LED.
- **Visual-treatment matrix per signalKind** (Set 029 audit
  §"Visual treatment by signalKind" REVISED 2026-05-18):
  - `current`: solid fill + solid rim + no badge
  - `configured-default`: ~85% opacity + dashed rim + "DEFAULT" pill
  - `last-observed`: hollow rim + filled needle + clock-icon overlay
    + "(last /think Xm ago)" suffix
  - `manual`: solid fill + operator-icon overlay
  - **stale** (signal-agnostic, ≥`stalenessMaxSec` default 8h):
    diagonal-stripe overlay at 50% opacity over whatever the
    underlying treatment is. No install-CTA on stale (only on
    missing marker, per audit Q6).
- **Tooltip copy embeds confidence explicitly:** "live signal (high
  confidence)", "live signal (low confidence — hook payload missing
  model)", "configured default (medium confidence — does not track
  runtime changes)", "last observed Xm ago via /think (high
  confidence in detection, but may not reflect current message)",
  "set manually (high confidence)".
- **`Dabbler: Install Orchestrator Hook (Claude Code)` command.**
  Idempotently adds `SessionStart` (matchers: startup / resume /
  clear / compact) and `UserPromptSubmit` hooks to
  `~/.claude/settings.json` that pipe the hook payload to
  `scripts/write-orchestrator-marker.js`. The SessionStart hook
  writes `signalKind: "current"` + Medium effort default; the
  UserPromptSubmit hook detects `/think` / `/megathink` /
  `/ultrathink` prefixes in the prompt and updates effort to
  `last-observed`. Re-running the command upgrades the helper path
  in place; foreign hooks the operator may have configured are
  preserved verbatim.
- **`Dabbler: Set Orchestrator Model & Effort` command (stub).**
  Surfaces a "coming in the next release (Session 3 of Set 029)"
  message with a one-click jump to the Claude installer. The full
  MRU + multi-step + hotkey-bindable implementation lands in 0.14.3.
- **`Dabbler: Open Orchestrator Writer Log` command.** Opens
  `~/.dabbler/orchestrator-writer.log` for diagnosing skipped marker
  writes (e.g., a Codex configured-default signal blocked by a fresh
  Claude SessionStart per the multi-writer precedence policy).
- **`scripts/write-orchestrator-marker.js` helper.** Multi-mode
  marker writer:
  - `--mode session-start` — full marker write with model + Medium
    default effort. Confidence-low producer rule: if the payload's
    `.model` is missing/null/unparseable, emits `confidence: "low"`
    + `model: "unknown"` + `modelDisplayName: "Claude (model unknown)"`
    so the tooltip can surface the low-confidence reason.
  - `--mode user-prompt-submit` — preserves top-level signal, updates
    only `effort.*` based on the detected `/think*` prefix. Bootstraps
    a Medium-default Claude marker if none exists. Exits cleanly
    (no write) on prompts without a `/think*` prefix.
  - `--mode manual` — sets `signalKind: "manual"` + `confidence: "high"`.
  - `--mode configured-default` — sets `signalKind: "configured-default"`
    + `confidence: "medium"`. Used by Session 3's Codex watcher.
  - `--force-override` — bypasses the precedence check (manual
    quickpick uses this with operator confirmation).
- **Multi-writer precedence** (Set 029 audit §"Multi-writer
  precedence"): every writer reads existing marker, compares
  signalKind precedence (`current` > `manual` > `last-observed` >
  `configured-default`), re-reads immediately before the atomic
  write+rename (to close the TOCTOU race window), and skips the
  write if the proposed signal is weaker than a fresh existing
  signal. Stale signals (>`stalenessMaxSec`) never block a fresh
  write. Skipped writes are appended to
  `~/.dabbler/orchestrator-writer.log` with `{timestamp, writer,
  proposed, existing, reason}` for operator diagnostics.
- **Windows-aware retry loop on atomic write** (Set 029 R5 REVISED
  2026-05-18): 5 attempts total (initial + 4 retries) at 50 / 200 /
  600 / 1200 ms backoff between attempts, ~2050 ms total ceiling.
  Handles `PermissionError` / `EBUSY` contention with the VS Code
  file watcher on `~/.dabbler/current-orchestrator.json`.
- **Effort resets to Medium on every `SessionStart`** (Set 029 R7
  pre-implementation verification PASSED 2026-05-18 via official
  Claude Code hooks docs at https://code.claude.com/docs/en/hooks):
  `/clear` fires `SessionStart` with `source: "clear"` AND
  `/clear` is a fresh-session boundary (`/think*` is per-message,
  not a persistent session setting). Both R7 conditions are TRUE,
  so the SessionStart hook clobbers any existing `last-observed`
  effort signal back to Medium across all four source values
  (`startup`, `resume`, `clear`, `compact`).

### Known limitations (Claude-only v1 preview)

- **Starting model only.** The SessionStart hook fires on session
  boundaries (startup / resume / clear / compact) — mid-session
  `/model` changes are NOT auto-detected in v1 because the Claude
  Code hook payload's `model` field only exists on `SessionStart`,
  not on per-turn hooks. Use `Dabbler: Set Orchestrator Model &
  Effort` as the recovery path when this happens (lands fully in
  Session 3 of Set 029; stub in 0.14.2).
- **Container height cannot be guaranteed.** Per audit S3, VS Code's
  `contributes.views` schema has no `initialSize` property; ordering
  and sizing are best-effort. The webview CSS sizes content to fit
  within 100px, but if the operator has previously dragged the view
  divider, VS Code restores that height. To reset, drag the divider
  back. Content remains scrollable (`overflow: auto`) if compressed
  below 100px.
- **Non-Claude orchestrator surfaces (Codex, Gemini Code Assist,
  GitHub Copilot) ship in 0.14.3** (Session 3 of Set 029). v1 marker
  schema supports them, but the writers and config-file watchers
  are not yet implemented. Operators using non-Claude surfaces will
  see the "No signal — install hook" empty state until they manually
  seed the marker file (or until 0.14.3 ships).
- **Codex config.toml watcher and the universal manual-override
  quickpick (MRU + hotkey-bindable args + force-override
  confirmation) all ship together in 0.14.3.** The 0.14.2 stub for
  `Dabbler: Set Orchestrator Model & Effort` surfaces an
  informational dialog rather than a quickpick.
### Post-S2 polish — operator-feedback round 2 (2026-05-18)

After viewing the standalone `C:\temp\orchestrator-gauges-preview.html`
that Session 2 generated, the operator flagged three more issues and
asked for the mismatch warning to be wired up. All addressed before
Session 3:

- **Container query replaces `@media (max-width: 260px)`.** The
  responsive wrap fired against the BROWSER viewport, not the panel
  width — useless in a wide browser window where only the side-bar
  panel was being resized (the failure mode the operator caught in
  the preview). Switched to `@container (max-width: 260px)` with
  `container-type: inline-size` on `.container`. The wrap now fires
  when the panel itself narrows, regardless of browser viewport.
- **Thinking LED repositioned to the gauge wrapper, not the cell.**
  The LED was at `right: -3px` relative to `.gauge-cell`, but the
  cell stretches to the grid column width (~140px+), so the LED was
  floating in the column gap rather than next to the gauge — looked
  like the LED wasn't there at all. Introduced a `.gauge-svg-wrap`
  positioned div around the SVG; the LED, clock-overlay, and
  operator-overlay now anchor to the gauge's top-right corner.
- **Switched to IBM colorblind-safe categorical palette.** The
  audit-locked D5 red→green polarity ("Haiku is red, Opus is green")
  was semantically wrong — Haiku is the right pick for cheap tasks,
  not a failure state. Replaced with the IBM 5-color colorblind-safe
  palette (`#648FFF` blue, `#785EF0` purple, `#DC267F` magenta,
  `#FE6100` orange, `#FFB000` yellow). Tiers and effort levels both
  draw from this palette; gauge color is now purely categorical
  encoding (which level, not good/bad). The Thinking LED also moved
  to IBM purple when on.
- **Mismatch badge driven by `ai-assignment.md`.** When the active
  session set's `ai-assignment.md` recommends a different
  orchestrator than the current marker (provider, model, OR effort),
  a `≠ recommended` badge appears next to the last-updated annotation
  at the bottom of the indicator. Tooltip enumerates which axes
  differ. **Valence-neutral by design** per operator directive:
  higher-than-recommended is sometimes intentional (extra credits,
  task harder than anticipated), lower might be intentional too.
  The badge surfaces the difference; the operator decides. No color
  warning. The badge is sourced from `ai-assignment.md` parsed via
  a regex against the `## Session N` heading + `### Recommended
  orchestrator` block; defensive — any parse failure (missing file,
  malformed text) silently falls back to no badge.

The audit-locked D5 ("red = low-tier, green = flagship") phrasing is
now **superseded** alongside D3 (the 100px → 150px revision earlier
in S2). Both are documented as in-flight design relaxations the
operator drove during on-device review; the audit-summary.md still
shows the original D3/D5 text with revision notes pointing at this
CHANGELOG.

### Mid-S2 sizing + responsive-wrap revision (operator feedback 2026-05-18)

After seeing the rendered gauges in the Playwright diagnostic, the
operator flagged two issues that were addressed in-session:

- **Effort gauge "Medium" rendered with a too-short color arc.**
  Medium's needle was at -120° (~1/3-filled arc) while the Model
  gauge for Opus rendered at -30° (~5/6-filled arc) — a jarring
  visual imbalance. Re-centered the 5-level effort scale so Medium
  sits at the gauge center (-90°) with the other levels redistributed
  around it: Low -150°, High -60°, Extra-High -35°, Max -15°. Medium
  is now the "neutral half-fill" default that matches the design
  intent (it's the lagging-signal-resistant fallback per Q1).
- **Gauges + fonts bumped ~40-50% for legibility.** Gauge SVG width
  70 → 100px (height 54px), gauge-cell font 10 → 14px, gauge-suffix
  9 → 12px, last-updated 9 → 12px, empty-state 11 → 14px,
  default-pill 8 → 10px, clock/operator overlays 11 → 14px, thinking
  LED 7 → 10px. Container max-height bumped 100 → 150px to match.
- **Responsive wrap added.** When the panel is below 260px wide, the
  CSS grid switches from `1fr 1fr` to single-column so the second
  gauge stacks below the first instead of being squished into an
  unreadable sliver. Matches operator's stated workflow of
  resizing side-bar panels regularly.

### Implementation notes

- **Spec drift correction (versioning).** Set 029 spec.md Session 2
  step 8 directed a 0.13.17 → 0.13.18 bump, authored before Set 030
  shipped its 0.14.x line. Current is 0.14.1; this release bumps
  patch to 0.14.2. The spec-locked S3 → 0.14.0 and S4 → 0.14.1
  progression shifts to S3 → 0.14.3 and S4 → 0.14.4 (or 0.15.0 if
  the feature warrants a minor at publish).
- **Playwright tests live at `src/test/playwright/`,** not the
  prospective `tests/playwright/` the spec text mentioned. Aligned
  to the existing `playwright.config.ts` `testDir`. Seven scenarios
  added in `orchestrator-indicator.spec.ts`: current Opus, low-tier
  Haiku, low-confidence tooltip, last-observed effort with clock
  overlay + elapsed suffix, configured-default with DEFAULT pill
  (and NO stripes — REVISED 2026-05-18 audit decision), 9h-stale
  state, empty-state CTA, plus a non-Electron helper-precedence
  smoke that runs the script directly.

## [0.14.1] — 2026-05-17 (GA hotfix — Linux build casing)

### Fixed

- **Linux CI build failure: `SessionSetsProvider.ts` import casing.**
  The 0.14.0 commit normalized five imports to the lowercase form
  `./providers/sessionSetsProvider` while the file on disk in git is
  `SessionSetsProvider.ts` (capital S). On Windows this worked because
  the filesystem is case-insensitive; on Linux runners the lowercase
  import resolved to nothing and esbuild errored with "Could not
  read from file: .../providers/sessionSetsProvider.ts." This hotfix
  reverts the five imports to capital `SessionSetsProvider`. Affected
  files: `src/extension.ts` and four test files under `src/test/`.
- The `vsix-v0.14.0` tag's CI build never produced a Marketplace
  artifact; 0.14.1 is the first Marketplace-published version of the
  Session 5 deliverables. Functionally identical to 0.14.0 as
  documented below.

## [0.14.0] — 2026-05-17 (GA — never published; superseded by 0.14.1)

### Added — Session 5 deliverables

- **In-extension lazy migration UX for v2 → v3 state files.** Tree
  rows whose `session-state.json` is still v2 (or broken-v3) render
  a "(needs migration)" badge. Right-clicking exposes a new
  "Migrate to v3 schema" command with a quickpick offering three
  strategies: "Use spec.md headings" (regex, zero cost, default),
  "Use AI to refine titles" (routes via `ai_router`,
  ~$0.05/spec, opt-in with cost-confirmation modal), and "Use
  generic labels" (fallback). All three strategies share the same
  Python migrator entry point (`migrate_one_set`) via subprocess,
  so the in-extension migrator and the bulk CLI emit identical
  files set-for-set.
- **AI failure modes get kind-specific notifications.** Per
  cross-provider design audit (2026-05-17), each AI-strategy
  failure has its own action code and operator-actionable
  message: missing provider credentials (instructs which env var
  to set), provider error (rate limit / network — instructs to
  retry), bad output (the model returned non-JSON or wrong shape
  — instructs to retry once or fall back to regex), count
  mismatch (the model returned the wrong number of titles —
  instructs to edit spec.md or use deterministic strategies).
  Distinct from malformed-input-state errors so "your file is
  broken" never overlaps with "the model answered badly."
- **Activation-time scanState lifecycle ("loading" → "ready").** A
  new `ScanState` manager publishes a `dabblerSessionSets.scanState`
  context key. The tree provider renders a "Setting up your
  project…" sentinel TreeItem with the Dabbler icon during the
  loading window; the `viewsWelcome` "No session sets" CTA is now
  gated on `scanState == ready`, eliminating the welcome-CTA
  flash on first activation. The setImmediate flip happens on the
  same tick activation returns, so the loading window is brief on
  warm filesystems and unmissable on cold ones.

### Changed

- Mock SessionSet objects in the test suite gained the new
  required `needsMigration` field. The `SessionSet.needsMigration`
  flag is set by `readSessionSets()` whenever the parsed state
  file lacks `schemaVersion: 3` or has v3 but with a missing
  `sessions[]` array — the same heuristic the bulk migrator's
  ACTION_SKIPPED_MALFORMED case uses.

### Release notes

- **`0.14.0` is the Session 5 GA release.** Published to the
  Marketplace in lockstep with `dabbler-ai-router` 0.4.0 so the
  in-extension migrator's AI-strategy quickpick connects to a
  Python migrator that knows how to handle `--strategy ai`.
- Operators upgrading from any prior 0.13.x version see no
  disruption — v2 state files continue to render correctly; the
  new badge surfaces sets that *could* be migrated, but migration
  remains operator-driven. No automatic background rewrites.

## [0.14.0-rc.1] — 2026-05-17 (release candidate, not published)

### Added

- **`session-state.json` schema v3 support (Set 030).** The Session
  Set Explorer reads v3 files via the new `progress.ts` helper
  (Session 1); the TypeScript writer in `sessionState.ts` emits the
  v3 dual-write shape from Session 2. Status terminology now unified
  on `"complete"` across the JSON schema and the operator-visible
  Explorer display.

### Changed

- **Explorer label: "Done" → "Complete" (Set 030 Session 3, per
  spec D3).** The fourth bucket header in the Session Sets Explorer
  is now "Complete" (was "Done"). Aligns the tree's vocabulary with
  the v3 schema's `status: "complete"`. The TypeScript
  `SessionState` union literal followed the same rename across 24
  test fixtures.
- **v2 state files render correctly during the migration window.**
  The Explorer's read path is permanently v2-tolerant; the tree
  provider's count-derivation uses `read_progress()` (a new TS
  helper) so v2 files with missing `completedSessions[]` no longer
  bucket as "In Progress" — they now bucket correctly based on the
  v3 invariant projection (closed sets to Complete with [FORCED]
  badge per the v2-bare-snapshot rule from Session 3).

### Schema

- The extension's `SessionState` types and reader path now use the
  v3 `sessions[]` ledger internally. The legacy
  `currentSession` / `totalSessions` / `completedSessions` fields
  are read only through approved compatibility helpers (D13 lint
  rule, enforced by the Mocha suite).

### Release notes

- **`0.14.0-rc.1` is the Session 4 release candidate.** Not
  published to the Marketplace. The GA build (`0.14.0`) ships with
  Session 5 after the in-extension migration UX (loading state +
  per-set "(needs migration)" badge + Migrate-to-v3 command) lands.
  Publishing the RC would expose operators to v2 state files
  without the lazy-migration UX, so the publish moves to S5.
- Internal smoke test only: `npx vsce package` + side-load the
  VSIX into a clean VS Code instance.

## [0.13.17] — 2026-05-16

### Changed
- **Electron launch environment: blocklist → allowlist (Set 028 Session 2).** 
  Previously, `_electronEnv()` started from full `process.env` and blocked only
  known VS Code IPC vars (`ELECTRON_RUN_AS_NODE`, `VSCODE_*` prefix). Now uses
  an explicit allowlist of safe vars: universal (PATH, HOME, TEMP, LANG, TERM),
  Windows-specific (SYSTEMROOT, APPDATA), and GUI/locale (DISPLAY,
  WAYLAND_DISPLAY, DBUS_SESSION_BUS_ADDRESS, XDG_RUNTIME_DIR, etc.). This
  guards against future IDE host pollution if new IPC vars are added. Blocklists
  are brittle; allowlists are maintainable.

## [0.13.16] — 2026-05-16

### Added
- **Layer 2 tree-provider e2e harness (Set 027 Session 3).** New suite
  at `src/test/suite/e2e/` (5 test files, 20 scenarios) drives the
  Python harness shim through real start/close CLIs and asserts on
  `SessionSetsProvider.getChildren()` output. Covers happy-path,
  cancel/restore, force-close, multiset, and sibling-worktree
  bucketing. Pins two pre-existing drift classes: (1) fresh-set
  `completedSessions[]` omission disables Set 022's in-flight
  annotation on session 1; (2) `isMidSetComplete` downgrades
  force-closed mid-set snapshots to In Progress regardless of
  `forceClosed` / `status` (truthful-display invariant). Neither
  shipped a fix in this set — both deserve targeted reader/writer
  work.
- **Layer 3 Playwright Electron rendering smoke (Set 027 Session 4).**
  New suite at `src/test/playwright/treeView.spec.ts` (5 scenarios)
  launches a real VS Code Electron instance via Playwright's
  `_electron.launch`, opens the Session Sets activity-bar view, and
  asserts on rendered text — bucket headers (`In Progress (N)`,
  `Not Started (N)`, `Done (N)`, `Cancelled (N)`), `[FORCED]` badge,
  `session N in flight` annotation, `N/N` progress text. Bypasses
  the @vscode/test-electron runner (broken on Windows 11 + VS Code
  1.120 since Set 027 Session 3) by driving the cached `Code.exe`
  binary directly. Runs in ~90s for 5 tests.
- **`test:playwright` npm script** — `npm run test:playwright` runs
  the Layer 3 suite. Each test owns a fresh user-data-dir and
  extensions-dir; tests run serially (workers=1) to avoid
  user-data-dir lock contention.

### Changed
- **Extension shipped against `ai_router` 0.3.1** (was 0.3.0). 0.3.1
  is functionally identical to 0.3.0 for PyPI consumers — the patch
  bump exists to let the extension's version floor track the
  repo-side test harness Set 027 added (`ai_router/tests/e2e/`),
  which is excluded from the published wheel. No public-API changes.

## [0.13.15] — 2026-05-15

### Removed
- **`outsourceMode` config field and the entire queue-mediated verifier
  daemon path (Set 026 Session 1).** The `OutsourceMode` TypeScript
  type, the `outsourceMode` field on `SessionSetConfig`, the `Mode:
  outsource-<x>` tooltip line, and the `modeBadge` text are gone.
  Specs that previously declared `outsourceMode: first` or `last` will
  have the field ignored on read; no behavior change for first-mode
  consumers since first was the default.
- **Reversal of v0.13.14's "the CLIs stay" promise.** v0.13.14's
  CHANGELOG noted the Provider Queues / Heartbeats *views* were
  removed but said the underlying Python CLIs would stay. v0.13.15
  removes those CLIs (`python -m ai_router.queue_status`,
  `python -m ai_router.heartbeat_status`,
  `python -m ai_router.queue_db`, `python -m ai_router.daemon_pid`,
  `python -m ai_router.orchestrator_role`,
  `python -m ai_router.verifier_role`,
  `python -m ai_router.restart_role`,
  `python -m ai_router.role_status`,
  `python -m ai_router.capacity`) along with the underlying modules.
  Justification: Marketplace download count remains at 3 (all
  operator's own); the cost of carrying unused infrastructure
  exceeded the cost of a fast reversal. Restoration is git-revert-able
  from Set 026 Session 1.

### Changed
- **Extension shipped against `ai_router` 0.3.0** (was 0.2.5). The
  router package's breaking change is the public removal of
  `ModeConfig`, `OUTSOURCE_MODES`, `ROLE_VALUES`,
  `DEFAULT_OUTSOURCE_MODE`, `parse_mode_config`, `read_mode_config`,
  `validate_mode_config`, `QueueDB`, `VerifierDaemon`,
  `OrchestratorDaemon`, and the `mode=` / `queue_base_dir=` parameters
  on `route()`.

### Notes
- **Partial release — Session 1 of Set 026 only.** The extension
  bumps to v0.13.15 to reflect the breaking change in the TypeScript
  surface, but docs scrubs (workflow doc, adoption-bootstrap,
  authoring-guide, close-out.md, spec-md-schema) and the 26 historical
  `spec.md` `outsourceMode:` config-line scrubs are deferred to a
  follow-up session. The acceptance criterion "zero hits for
  outsourceMode / queue_db / verifier daemon / subscription cli via
  `git grep`" is NOT yet satisfied — narrative references remain in
  docs and historical specs. Sessions 2–6 of Set 026 (YAML schema,
  resolver, config-editor webview, sections, significance flagging,
  release) are the rest of the work.

### Added (Session 7 — wizard integration + test notification + release)

- **Wizard "Configure AI Router" button** — `Dabbler: Get Started` now includes
  a "Configure AI Router" button that opens the config editor directly. Wired
  via a new `openConfigEditor` webview message case in `WizardPanel.ts`.
- **"Send a test notification now" button (§5 Notifications)** — the button that
  was rendered but disabled in Session 5 is now enabled and wired. Clicking it
  spawns a Python subprocess that calls `send_pushover_notification()` from
  `ai_router/notifications.py`, using the API-key and user-key env var names
  configured in `local-overrides.yaml` (defaulting to `PUSHOVER_API_KEY` /
  `PUSHOVER_USER_KEY`). Success surfaces the Pushover request ID via an info
  notification; failure surfaces the error message. The Python process inherits
  the VS Code process environment, so both standard and custom env var names
  resolve correctly.
- **`docs/quick-start.md` — "Configuring your project" section** — new section
  covering the config editor command, a table of all six sections, and the
  shared/local split for sensitive fields.
- **`docs/adoption-bootstrap.md` — "Configuring the AI router visually" closing
  pointer** — Step 9 closing pointers (Full tier) now include the config editor
  as the recommended ongoing-tuning surface alongside the local-overrides note.
- **`CLAUDE.md` — Router-config editor subsection** — documents the editor's
  file layout and key files for future session-level context; version line
  updated to v0.13.15.

### Added (Session 6 — significance flagging)

- **`dabbler.flagDecisionForReview` command** — operator-invoked input box
  prompts for a one-line reason, appends one JSON line to the active
  session set's `decision-review-queue.jsonl`. With no in-progress set,
  surfaces an info notification and exits cleanly. The "Run command
  now..." button in the config editor's §4 section is now wired to
  this command unconditionally (the Session-5 graceful-fallback branch
  is gone).
- **`dabbler.scanAnnotationsForActiveSet` command** — walks workspace
  source files (ts/tsx/js/py/go/rs/java/cs/cpp/sh/yaml/toml/...) for
  `# @dabbler:outsource-review("...")` or `// @...` annotations,
  deduplicates against the existing queue (file+line+reason), and
  appends new findings. Honors
  `local-overrides.yaml → decision_review.honor_annotations` (default
  `true`; setting `false` makes the scan a no-op with an info
  notification).
- **`src/configEditor/annotationParser.ts`** — pure annotation regex
  parser. `findAnnotations(text, filePath)` returns one entry per match
  with `{ts, reason, source: "annotation", file, line}`; supports
  escaped quotes and backslashes inside the reason and CRLF line
  endings. `deduplicateAnnotations(incoming, existing)` filters out
  collisions keyed on `file+line+reason`.
- **`src/commands/decisionReviewQueue.ts`** — pure helpers shared by
  both commands (`appendQueueEntry`, `findActiveSessionSetDir`,
  `QueueEntry` type). Split from the vscode wiring so the helpers can
  be unit-tested via plain mocha + ts-node.
- **`src/commands/annotationScanner.ts`** — pure helpers for the scan
  command (`scanFilesForAnnotations`, `loadHonorAnnotationsToggle`,
  `loadExistingQueueEntries`, `SCAN_GLOB`, `SCAN_EXCLUDE_GLOB`). Same
  unit-testability rationale.

## [0.13.14] — 2026-05-15

### Removed
- **Provider Queues and Provider Heartbeats tree views (Set 024).** Both
  views, their five commands
  (`dabblerProviderQueues.refresh` / `.openPayload` / `.markFailed` /
  `.forceReclaim`, `dabblerProviderHeartbeats.refresh`), their menu
  contributions, and their six configuration properties under
  `dabblerProviderQueues.*` and `dabblerProviderHeartbeats.*` are gone.
  These views were scaffolding for the `outsourceMode: last`
  (subscription-CLI verifier daemon) path; no session set in this repo
  has declared `outsourceMode: last`, and the persistent yellow
  warning triangle that surfaced on every refresh ("Failed to read
  queue status. queue_status exited 1 …") was worse UX than no view at
  all. The Python CLI surface (`python -m ai_router.queue_status` and
  `python -m ai_router.heartbeat_status`) stays — operators who run
  outsource-last in other repos can still invoke those commands from a
  terminal, and `ai_router/docs/two-cli-workflow.md` still documents
  the path. The shared `dabblerSessionSetsContainer` activity-bar
  container stays for the Session Sets view.
- Five TypeScript source files
  (`ProviderQueuesProvider.ts`, `ProviderHeartbeatsProvider.ts`,
  `queueActions.ts`, and the two corresponding test suites) plus
  `utils/pythonRunner.ts` (now unused after the providers and
  `queueActions` that called it were removed).
- The "Falls back to `dabblerProviderQueues.pythonPath` if unset"
  fallback sentence on `dabblerSessionSets.pythonPath`'s markdown
  description, and the corresponding code-side fallback in
  `installAiRouterCommands.ts → resolvePythonPath`. Operators who want
  to point the install command at a venv interpreter should set
  `dabblerSessionSets.pythonPath` directly.

### Migration

If you had set `dabblerProviderQueues.pythonPath` or
`dabblerProviderHeartbeats.*` keys in your user or workspace settings,
those entries become orphaned on upgrade and are no longer consulted.
Remove them, or — if you were using `dabblerProviderQueues.pythonPath`
to point the install command at a venv — rename the key to
`dabblerSessionSets.pythonPath` so the install command continues to
honor it.

## [0.13.13] — 2026-05-15

### Changed
- **`isMidSetComplete` now consults `completedSessions[]` as an
  alternative authoritative whether-closed signal to the events
  ledger (Set 023 Session 4).** When the snapshot's
  `completedSessions[]` includes `currentSession`, the guard accepts
  the snapshot as Done even if `session-events.jsonl` lacks a
  corresponding `closeout_succeeded` event. This is the migration
  shape Set 022 promised: a pre-Set-022 set whose operator hand-adds
  `completedSessions: [1..N]` to its snapshot now displays as N/N
  Done in the Session Set Explorer without also needing to synthesize
  a final-session ledger event via `--repair --apply`. The legacy
  ledger-only path is preserved for sets that don't carry the array.

### Added
- **Observability warn when the array overrides a missing ledger
  closeout.** When `completedSessions[]` says the final session is
  closed but the events ledger does not, `isMidSetComplete` emits a
  one-line `console.warn` of the form
  `[session-set <slug>] completedSessions[] overrides missing ledger
  closeout for session N`. The override is correct; the warn surfaces
  the drift shape so an operator who wants the ledger healed too can
  run `--repair --apply` (which, as of `ai_router 0.2.4`, preserves
  the operator-attested array while synthesizing the missing event).

### Docs
- `docs/session-state-schema.md` "Parser cheat-sheet" now documents the
  new array-before-ledger ordering in the bucketing guard, plus the
  sharpened invariant phrasing: `completedSessions[]` is authoritative
  for *whether* a session is closed; the events ledger is authoritative
  for *when* each closeout was recorded. Future maintainers should not
  read "both are authoritative" as "must agree" — they are alternative
  whether-closed signals.
- `ai_router/docs/close-out.md` § 5 drift case 1 gains an attestation
  note: `completedSessions[]` is operator-attested for migrated sets
  and tool-maintained for sets that ran the close-out gate.

## [0.13.12] — 2026-05-15

### Changed
- **Tree-view bucketing and progress display follow the new state-first
  lifecycle protocol shipped in `ai_router 0.2.3` (Set 022 Session 1).**
  The Session Set Explorer reflects four behavior changes:

  1. **`completedSessions[]` is the primary count source.** Reader
     priority is now `completedSessions.length` → distinct
     `closeout_succeeded` session numbers in `session-events.jsonl`
     (new Full-tier fallback) → `totalSessions` when `state === "done"`.
     The pre-existing `currentSession - 1` fallback was removed; the
     writer protocol from Session 1 guarantees the array is present
     after the first boundary write, and the events-ledger fallback
     covers legacy sets that haven't been healed by their next
     boundary write yet. Removing the heuristic eliminates the
     off-by-one classes at both lifecycle endpoints (stuck `0/N`
     at start of session 1; stuck `N-1/N` while the final session is
     wrapping up).

  2. **`activity-log.json` is no longer a count source.** Schema-wise,
     it's a step log, not a progress ledger — and the activity log
     was producing inflated counts on Lightweight-tier sets that
     hand-maintained step entries but no `completedSessions[]`. The
     activity-log read is retained for the `totalSessions` field
     (which the schema places at the file's top level) and per-entry
     `dateTime` (which still informs the `lastTouched` display
     because step-level timestamps are more granular than the
     state-file's session-boundary timestamps while a session is
     mid-flight).

  3. **In-flight row annotation: `0/4 · session 1 in flight`.** A new
     `isCurrentSessionInFlight` predicate in
     `src/providers/SessionSetsProvider.ts` implements the spec
     invariant — `currentSession not in completedSessions[]` means
     session N has started but not closed. When that predicate fires,
     `progressText` appends the annotation so the row visibly
     distinguishes "session 1 in flight" from "no work started yet."
     The predicate requires `completedSessions[]` to be present;
     legacy snapshots without the array stay annotation-free.

  4. **Done row annotation: `4/4 Done`.** The trailing " Done" label
     on done rows distinguishes a healthy final close from a stale
     `N/N` snapshot that's about to be downgraded by
     `isMidSetComplete`. Done is now visibly Done.

- **File watcher coverage extended to `session-events.jsonl` and
  `CANCELLED.md`.** The new Full-tier sessionsCompleted fallback
  reads the events ledger directly, and the boundary writes from
  `start_session` / `close_session` only touch the ledger and the
  state file (not `activity-log.json`) — without the ledger in the
  watcher pattern, a Not Started → In Progress bucket-flip on
  session 1 of a fresh set would wait for the 30-second poll loop.
  `CANCELLED.md` is the canonical signal for the cancelled
  tree-state under Set 8's spec; the watcher now refreshes
  immediately when a cancel/restore command writes it.

- **`LiveSession.completedSessions` exposed through the type
  system.** The tree-view's in-flight predicate computes from
  `liveSession.currentSession` and `liveSession.completedSessions`
  without re-reading the state file. Surfaced as `number[] | null`:
  null for legacy snapshots that pre-date the array; empty array
  when the protocol has been applied but no session has closed yet.

  Set 022 Session 2 / consumer-facing spec:
  `docs/session-sets/022-active-lifecycle-management/spec.md`.

## [0.13.11] — 2026-05-13

### Fixed
- **Tree view no longer shows Done for sets whose final session never
  closed.** The v0.13.8 defensive guard caught the
  `currentSession < totalSessions` drift shape (pre-0.2.1 ai_router and
  manual edits). It missed a different shape observed on
  `unified-master-details-composite` (2026-05-12): snapshot claimed
  `status: complete` with `verificationVerdict: VERIFIED` at
  `currentSession=5/totalSessions=5`, but `session-events.jsonl` had
  `closeout_succeeded` events for sessions 1-4 only — session 5 never
  closed. The pre-existing guard didn't fire (5 is not <5) and the set
  appeared in Done. `isMidSetComplete` in
  `src/utils/fileSystem.ts` now also cross-checks the events ledger: if
  the ledger file exists and has no `closeout_succeeded` event for
  `currentSession`, the snapshot has drifted from the authoritative
  ledger and bucketing downgrades to in-progress. The ledger-existence
  check is critical so Lightweight-tier consumers (no router writer,
  no ledger file) are unaffected — there, the snapshot remains
  authoritative. Two regression tests added in
  `src/test/suite/fileSystem.test.ts`: ledger-gap (downgrades) and
  ledger-complete (remains Done). The root-cause writer bug — how the
  snapshot got written without a corresponding closeout event — is a
  separate ai_router investigation; the tree-view fix defends against
  whatever path produced the drift.

## [0.13.3] — 2026-05-06

### Fixed
- **`requiresUAT` / `requiresE2E` detection no longer silently fails
  for specs with non-canonical headings.** `parseSessionSetConfig`
  in `src/utils/fileSystem.ts` previously fell back to scanning only
  the first 4000 bytes of a spec when the canonical
  `## Session Set Configuration` heading was absent. Specs that put
  their config yaml block under a non-canonical heading like
  `## UAT scope` and had enough upstream prose to push the yaml
  past the 4000-byte cutoff were silently treated as
  `requiresUAT: false`, suppressing UAT badges, the
  "Open UAT Checklist" context-menu item, and any other
  UAT-conditional affordance for the affected sets. Fix: scan the
  entire spec when the canonical heading is absent. The line-
  anchored regex (`^\s*requiresUAT\s*:\s*(true|false)\s*$`) is
  specific enough that false positives from prose mentions are very
  unlikely. Two regression tests added in
  `src/test/suite/fileSystem.test.ts` (positive and negative case).
  Surfaced and fixed during dabbler-ai-orchestration Set 015
  Session 3 (consumer-repo alignment) on `dabbler-platform`'s
  `admin-user-creation-flow` and `admin-users-cross-links` specs.

## [0.13.2] — 2026-05-05

### Fixed
- **Marketplace listing image now displays.** The hero screenshot
  was referenced via a relative path (`media/...`); vsce's
  relative-to-absolute URL rewrite based on `repository.url` did
  not consistently apply on the Marketplace render. The image
  reference now uses an absolute `raw.githubusercontent.com` URL
  so the Marketplace listing renders the screenshot reliably.

### Added
- **Defensive activation wrappers.** Each `register*Commands` call
  in `extension.ts` is now wrapped in its own try/catch with
  `console.error` logging via a `safeRegister` helper. v0.13.1
  shipped without these wrappers; in some workspaces a throw in
  one register group silently skipped the registrations that
  followed (causing "command 'dabbler.showCostDashboard' not
  found" because an earlier register call threw and the cost-
  dashboard / wizard / install-ai-router registrations were
  skipped). The wrappers ensure independent failures and surface
  the exact failing group + error in `Help → Toggle Developer
  Tools → Console` rather than presenting as opaque
  command-not-found at click time. The early-activation steps
  `evaluateContextKeys()` and `bindWatchers()` are also wrapped
  for the same reason.
- **Diagnostic state-bucketing log.** `readSessionSets()` now logs
  a one-line summary per root to the dev console:
  `[dabbler-ai-orchestration] readSessionSets(<root>): N set(s) — done=X, in-progress=Y, not-started=Z, cancelled=W`.
  Helps pinpoint cache / worktree-merge / file-read drift when a
  session set's bucket disagrees with its on-disk
  `session-state.json` status.

### Changed
- **Evidence-based bucketing for "in-progress" status.** A session
  set whose `session-state.json` claims `status: "in-progress"`
  is now bucketed as In Progress only when there's positive
  corroborating evidence — either `session-events.jsonl` contains
  at least one `work_started` event, or `activity-log.json` has
  at least one entry. Without corroboration the status decays to
  Not Started. Implements the principle: "default Not Started;
  require positive evidence to escalate to In Progress / Done /
  Cancelled" (Done is already gated by `change-log.md` presence
  via close_session; Cancelled is gated by `CANCELLED.md`; In
  Progress now joins them). Handles two failure modes: stale
  `in-progress` status from past partial work that was abandoned
  without closing, and migrations / manual edits that flipped the
  status field prematurely.

## [0.13.1] — 2026-05-05

### Fixed
- **Marketplace publish workflow now ships the correct VSIX.** The
  `vsix-v0.13.0` release run inadvertently published the prior
  `0.12.1` VSIX to the Marketplace because two VSIX files were present
  in the build directory at tag-checkout time (the just-built one and
  the canonical sideload artifact committed in Set 014); the upload
  step's `*.vsix` glob captured both, and the publish step's
  lexicographic `head -n1` picked the older one. Workflow now
  version-pins the upload and publish paths to the exact tag-derived
  filename, plus a new defensive build-step gate that fails if any
  extra VSIX is present alongside the just-built one. Marketplace
  v0.13.0 was never actually published; v0.13.1 is the corrected
  release with the v0.13.0 payload (Marketplace-publish workflow,
  runbook, `maxoutClaude` removal).

### Added
- **Empty-state Get Started prompt in the Session Set Explorer.** When
  the active workspace has no `docs/session-sets/` directory or the
  directory is empty, the Session Set Explorer view shows a concise
  welcome message with a one-click **Copy adoption bootstrap prompt**
  link and a pointer at the Get Started wizard. Once any session set
  exists, the welcome content suppresses automatically. Previous
  behavior (relying on the activity-bar Get Started icon and the
  context-menu actions) put the discoverable starting point too far
  from where a first-time user is looking; this change makes the
  empty-state itself a teachable moment.

### Changed
- **`[FIRST]` and `[LAST]` mode badges removed from session-set tree
  rows.** When 99% of sets use the default `outsourceMode: first`, the
  badge becomes visual noise that doesn't differentiate anything. The
  mode still surfaces in the row tooltip on hover for diagnostic
  purposes, and the AI router still consumes the `outsourceMode`
  field from each spec — only the always-visible badge text was
  removed.
- **Marketplace listing README rewritten for the listing page
  audience.** The extension-local README that the Marketplace serves
  on the listing page is now lean, visual-led, and points at the
  GitHub repo for technical depth — replaces the ~600-line technical
  reference that was previously the listing copy. The repo's deep
  documentation is unchanged (still at `docs/repository-reference.md`
  in the source tree); this is purely the Marketplace-facing front
  door.

## [0.13.0] — 2026-05-04

### Added
- **Marketplace-publish-ready release.** This is the first VSIX
  designated for publication to the VS Code Marketplace as
  `DarndestDabbler.dabbler-ai-orchestration`. The publishing
  infrastructure (workflow + runbook) lands in this commit; the
  one-time human-driven publisher account setup + first
  `vsix-v0.13.0` tag push are operator-driven steps that may have
  not yet completed at the time the VSIX is built. Once the publish
  lands, `code --install-extension
  DarndestDabbler.dabbler-ai-orchestration` will resolve from the
  Marketplace.
- `.github/workflows/publish-vscode.yml` — tag-driven publish workflow
  for the VS Code Marketplace and Open VSX Registry. Triggered on
  `vsix-vX.Y.Z` (publish) and `vsix-vX.Y.Z-rcN` (build-only) tags.
  See `docs/planning/marketplace-release-process.md` for one-time
  setup, the per-release checklist, rollback paths, and the
  failure-modes table.

### Removed
- `Dabbler: Copy: Start next session — maxout Claude` command (and the
  matching session-set context-menu entry). The "maxout" suffix as a
  per-session token-window override is no longer surfaced as a
  one-click affordance; the broader `— maxout <engine>` workflow
  concept remains documented in `docs/ai-led-session-workflow.md` for
  operators who want to type the suffix manually.

## [0.12.1] — 2026-05-04

### Added
- `Dabbler: Copy adoption bootstrap prompt` command. Copies a short
  prompt to the clipboard that points an arbitrary AI assistant
  (Claude Code, Gemini Code Assist, GPT-based tools) at the canonical
  online instructions at
  [docs/adoption-bootstrap.md](https://raw.githubusercontent.com/darndestdabbler/dabbler-ai-orchestration/master/docs/adoption-bootstrap.md).
  The pasted prompt instructs the AI to gather all decisions in dialog
  with the human, then present a numbered checklist of intended writes
  and configs for batch approval before executing — no per-write
  confirmation prompts. The canonical doc is engine-agnostic
  (capabilities-term tools, no Claude-specific tool names) and runs a
  9-step interactive flow: detect VS Code state, fast-path detection,
  in-flow education, **budget-threshold dialog with four tiers**
  (zero / less than ~$20 / $20–$99 / $100+, mapping to verification
  modes from manual-via-other-engine through outsource-first with full
  API automation), plan alignment, action checklist, execute, and
  closing pointers (budget monitoring, cost dashboard, more-info
  links, next-session trigger phrase).
- `adoption`, `bootstrap`, `onboarding` keywords for Marketplace
  search.
- Extension description now mentions the bootstrap entry point.

### Notes
- This is a single new top-level command with no logic changes to any
  existing command — version bump is a patch (0.12.0 → 0.12.1). The
  next release (Set 012 Session 2's planned Marketplace publish) will
  bump 0.12.1 → 0.13.0.
- This release ships the file format for `ai_router/budget.yaml`
  (documented in the canonical doc) but does not yet enforce
  thresholds or warn on approaching spend — automated enforcement is
  a follow-up set. The bootstrap flow tells the human that monitoring
  is currently manual via `python -m ai_router.report --since
  YYYY-MM-DD` and the cost dashboard.

## [0.11.0] — 2026-04-30

### Added
- `Provider Heartbeats` tree view (Set 5 / Session 3). Reads
  `python -m ai_router.heartbeat_status --format json`. Shows per-provider
  last-completion timestamp and lookback-window completions/tokens. Silent
  providers (no completions in `silentWarningMinutes`, default 30) are
  flagged with a warning icon. The view's description footer carries a
  permanent observational-only disclaimer to discourage misreading the
  view as a routing or capacity signal.
- Mode badges (`[FIRST]` / `[LAST]`) on session-set tree items, derived
  from each spec's `outsourceMode` field. Backward-compat default is
  `first` when the field is absent. Mode also surfaces in the row tooltip.
- Auto-refresh for the heartbeats view (15s default, configurable;
  `0` disables) with rebind on settings change.

## [0.10.0] — 2026-04-30

### Added
- `Provider Queues` and `Provider Heartbeats` view containers in the
  activity-bar (Set 5 / Session 1). Tree implementations land in
  Sessions 2–3; this release wires the manifest-side scaffold so the
  extension still loads while the providers are stubbed.
- Configuration settings for both views: `dabblerProviderQueues.*`
  (auto-refresh interval, Python path, message limit) and
  `dabblerProviderHeartbeats.*` (auto-refresh interval, lookback
  window, silent-provider warning threshold).
- Command IDs for queue refresh, payload inspection, mark-failed,
  force-reclaim, and heartbeat refresh. The extension shells out to
  two new helpers — `python -m ai_router.queue_status` and
  `python -m ai_router.heartbeat_status` — rather than embedding a
  SQLite client of its own.

## [0.9.0] — 2026-04-29

### Added
- TypeScript rewrite with esbuild bundler and strict mode
- Project wizard panel (`Dabbler: Get Started`) — onboarding overview,
  prerequisites checklist, and first-steps guide
- `Dabbler: Set Up New Project` command — git init, folder scaffold,
  optional worktree setup via simple-git
- `Dabbler: Import Project Plan` command — file picker with preview,
  copies plan to `docs/planning/project-plan.md`
- `Dabbler: Generate Session-Set Prompt` command — builds and copies
  an AI prompt to translate a project plan into session-set specs
- `Dabbler: Troubleshoot` command — diagnostic QuickPick covering
  common failure modes (activation, state machine, worktrees, API keys)
- `Dabbler: Show Cost Dashboard` command and toolbar button — reads
  `ai-router/metrics.jsonl`, shows cumulative totals, per-session-set
  breakdown, ASCII sparkline, model mix, and CSV export
- Expense-awareness callout in onboarding panel and after
  session-set prompt generation
- `category: "Dabbler"` on all commands for clean command-palette grouping
- `simple-git` dependency for typed git operations
- Mocha + @vscode/test-electron test infrastructure
- GitHub Actions CI (build + lint + test on push/PR)
- VS Code Marketplace metadata (icon, homepage, bugs, repository, keywords)

### Changed
- Extension renamed from `dabbler-session-sets` / "Session Set Explorer"
  to `dabbler-ai-orchestration` / "Dabbler AI Orchestration"
- Folder renamed from `tools/vscode-session-sets/` to
  `tools/dabbler-ai-orchestration/`
- `engines.vscode` bumped from `^1.70.0` to `^1.85.0`
- Activity-bar container title updated to "Dabbler AI Orchestration"
- All command IDs and setting keys retain the `dabblerSessionSets.*`
  prefix for backwards compatibility with existing consumer repos

### Preserved (no logic changes)
- Session-set tree view (In Progress / Not Started / Done groups)
- State derivation from file presence
- Git worktree auto-discovery
- UAT checklist parsing and badge rendering
- Playwright test discovery
- All existing right-click context-menu commands
- 30-second auto-refresh poll and file watchers
- All three `dabblerSessionSets.*` settings

## [0.8.1] — 2026-04-27

### Fixed
- Version bump for VSIX distribution

## [0.8.0] — 2026-04-27

### Added
- Merged harvester 0.7.1 feature set with platform-specific UAT/E2E gating
- `requiresUAT` and `requiresE2E` spec-level flags
- UAT checklist parsing, pending badge, Open UAT Checklist command
- Playwright test discovery command
- "Copy: Start next session — maxout Claude" variant
- Multi-root / worktree state merging (done > in-progress > not-started)

## [0.7.1] — 2026-04-15

### Added
- Initial harvester session-set explorer
- Git worktree auto-discovery
- Copy trigger-phrase commands
