# Change Log — Set 102: Git Workflow Automation

> **Set complete: 2026-07-14** (3 sessions). The framework now runs the
> mechanical trunk-based git — push a session branch and open its PR
> (Session 1), sync-and-clean-up after the merge (Session 1), cut a release
> tag / start a hotfix / roll back (Session 2) — while the human keeps every
> judgment call: PR review/approval, branch-protection policy, what/when to
> release, rollback authorization. Every command previews the exact command
> lines it will run and waits for the operator's confirm ("remove
> keystrokes, not oversight"). Dual-host by operator directive: everything
> works identically on **GitHub (incl. Enterprise) and Azure DevOps**, with
> the host auto-detected from the `origin` remote. Session 3 re-cut the
> hello-world tutorial to this automated flow. **This set closes a release
> boundary** — extension `0.45.0` is staged (queued behind `0.42.0`/
> `0.43.0`/`0.44.0`; registry-live is `0.40.0`); Marketplace/Open VSX
> publish (tag `vsix-v0.45.0`) is operator-gated. `dabbler-ai-router` stays
> `0.33.0`: zero `ai_router/` changes accrued.

## Session 1 of 3 — PR + finalize-merge automation (dual-host)

- **`Dabbler: Open PR for this set`** — pushes the current branch and
  creates the PR via the host CLI (`gh pr create` / `az repos pr create`,
  org/project/repo parsed from the remote URL — no `az devops configure
  --defaults`), templated body linking the session set, PR URL reported and
  opened. Confirm-gated; refuses from the trunk / detached HEAD / missing
  origin; dirty tree warns. **No-CLI floor:** push still happens (pure git)
  and the host's create-a-PR page opens with install/auth guidance.
- **`Dabbler: Finalize merged set`** — after the operator merges on the
  host: `git pull --ff-only` + `git worktree remove` + `git branch -d` +
  `git fetch --prune`, one confirm-gated action from the main checkout.
  Idempotent, safely re-runnable; only `session-set/*` candidates; `-d`
  never `-D`.
- **The one host-specific seam is isolated:** `utils/gitHost.ts` (remote
  classification across every real ADO/GitHub URL form, percent-decoded
  names, `insteadOf`-immune config read, `dabblerSessionSets.gitHost`
  override) + `utils/hostCli.ts` (preflight for `gh.exe`/`az.cmd`,
  `ghCliPath`/`azCliPath` overrides, BatBadBut-hardened `.cmd` spawn with
  conservatively validated args). Everything else is pure git.
- Dogfood: a real GitHub PR round-trip (open → merge → finalize, local
  end-state asserted). The Azure DevOps live walk is an **armed operator
  UAT** (needs an ADO org); ADO code paths pinned by the unit suite.
  Verification: VERIFIED after one remediation pass (1 Major + 4 nits
  fixed, 2 nits deferred with reasons); suite 1713 green.

## Session 2 of 3 — Release tagging + hotfix/rollback (pure git)

- **`Dabbler: Cut release tag`** — annotated tag + push behind a MANDATORY,
  non-bypassable operator confirm (the release gate). Live ref-format
  validation; existing-tag refusal (pushed tags immutable by convention);
  the tag is pinned to the resolved commit sha shown in the dialog.
- **`Dabbler: Start hotfix from tag`** / **`Dabbler: Roll back to tag`** —
  the tutorial's Part-10 drills as commands: hotfix branches from the
  deployed tag (never the trunk); rollback is redeploying the previous tag
  (detached HEAD + return-to-trunk guidance). Both refuse a dirty tree; tag
  listing distinguishes "no tags" from "not a git repo".
- Host-agnostic by construction (tags/branches/refs are pure git). 54 new
  unit tests + a real-git dogfood (4 drills against a scratch repo + bare
  remote). Verification: VERIFIED on discovery round 1 with ZERO blocking
  findings (6 Minor nits: 2 fixed with falsifier tests — sha-pinning,
  listTags null-on-error — 4 accepted/dismissed with reasons); suite 1767
  green.

## Session 3 of 3 — Automation-first tutorial re-cut + manual-git appendix

- **`docs/tutorials/module-team-hello-world.md` re-cut to the automated
  flow** (719 lines): the per-set loop (open PR → approve/merge on the git
  host → finalize → tag) now runs through the five commands, host-neutral
  across GitHub and Azure DevOps, with every human-decision point called
  out explicitly and every Expect block quoting the shipped dialog text.
  The one-time bootstrap (repo creation, branch protection, CODEOWNERS/CI)
  stays hand-taught with GitHub as the worked example + short ADO-equivalent
  callouts (spec non-goal: bootstrap is policy, not toil). The
  "automation is coming" callout is gone — it landed.
- **New Part 0.5 per-host setup section** (install command, one auth
  command, the PAT alternative, the three settings, what "green" looks
  like) mirroring the in-product preflight guidance, and a **new "Git under
  the hood" appendix** — the exact raw sequence each command runs (PR step
  shown for both hosts), plus what the automation deliberately does *not*
  cover (authoring/hotfix branch cleanup, one-time bootstrap, PR approval
  itself).
- **Doc sweep:** README (headline + feature entry), quick-start, and the
  scaffolded `getting-started.md.template` now reference the commands
  (cold-start goldens regenerated — the tripwire diff is exactly the new
  paragraph, both tiers). The companion workflow review prompt needed no
  change (it audits host-agnostic repo end-state). Screenshots: none
  affected (the shipped PNGs render from HTML mockups of surfaces 102 never
  touched) — recorded determination.
- **Release staging:** extension CHANGELOG `0.45.0` section +
  `package.json` bump; router changelog intentionally unchanged
  (extension-only set). Suites green: unit 1767, pytest 3030/6, tsc clean;
  eslint carries 7 pre-existing errors in test files untouched by 102
  (recorded baseline). Verification: **VERIFIED on discovery round 1 with
  zero findings of any severity** (gpt-5-6 × 2 fan-out, $0.38).
- **Authoring provenance:** the tutorial re-cut and the changelog section
  were routed documentation calls (gemini-2.5-pro, $0.13 + $0.01) per the
  routed step-3.5 assignment analysis, then orchestrator-fidelity-passed
  against the shipped code (exact command titles, dialog strings, settings
  keys; ~20 restorations/corrections).

## Deferred / follow-ons

- **Azure DevOps live UAT walk** (armed since Session 1): open a real PR,
  merge, finalize, tag against a scratch ADO project — operator-assisted.
- **GitHub-Copilot-flavored hello-world tutorial** (operator directive,
  2026-07-14, mid-Session-3): the operator's staff is Copilot-locked; a
  Copilot-specific cut of the tutorial (Copilot seat setup, ADO-first git
  host) should be authored as its own follow-on set — pairs naturally with
  the armed ADO walk.
- **eslint baseline hygiene:** 7 pre-existing errors in five test files
  untouched by Set 102 (`no-var-requires`, one `no-regex-spaces`) — a
  small cleanup candidate for any future hygiene pass.
- **Publish** (the release boundary): operator's click — tag
  `vsix-v0.45.0` after the queued `0.42.0`–`0.44.0` decisions.
