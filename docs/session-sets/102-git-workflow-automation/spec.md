# Git Workflow Automation Spec

> **Purpose:** Remove the manual-git *tedium* from the AI-led team workflow
> without removing human *judgment*. Today the operator hand-runs the whole
> trunk-based loop (feature branch → push → open PR → merge → `git pull
> --ff-only` → branch cleanup → prune → tag). For an operator juggling several
> modules or projects at once that is overwhelming, and it is exactly the kind
> of mechanical work AI/tooling should do. This set adds **confirm-gated,
> one-click / AI-invokable git commands** for the mechanical steps — keeping
> the operator's *decisions* (review/approve a PR, set branch-protection
> policy, choose what/when to release, authorize a rollback) as explicit
> gates — and then **re-cuts the hello-world tutorial** to an automation-first
> main flow with the raw git commands preserved in a reference **appendix**.
> **Created:** 2026-07-14
> **Session Set:** `docs/session-sets/102-git-workflow-automation/`
> **Prerequisite:** `101-default-module-scaffold-and-docs` (complete)
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

---

## Session Set Configuration

```yaml
tier: full
requiresUAT: suggested    # New operator-facing git commands + a re-cut tutorial: arm the ad-hoc human walk (open a real PR, finalize a real merge, cut a real tag against a scratch GitHub repo).
requiresE2E: suggested    # Command wiring + any webview affordance; the Layer 2/3 harness pins the new command surface.
uatStyle: ad-hoc
uatScope: per-session
pathAwareCritique: advisory
prerequisites:
  - slug: 101-default-module-scaffold-and-docs
    condition: complete
```

> Rationale: this is the git-automation follow-on the operator authorized at
> the Set 101 release boundary ("close now + feature follow-on"), backed by a
> two-round GPT + Gemini consensus (raw:
> `../101-default-module-scaffold-and-docs/s2-f2-cross-provider-input.json`
> and `../101-default-module-scaffold-and-docs/s2-git-automation-reframe.json`).
> Publish is operator-gated after the set closes, per standing policy.

---

## Project Overview

### The problem (operator directive, 2026-07-14)

A significant share of real-world commits are already AI-authored; the product
goal is to make AI-assisted individual **and** team development as easy as
possible. Forcing the human to type every branch/PR/merge/cleanup/tag command
does not scale to multiple concurrent modules/projects, and a tool that
enforces manual discipline loses to one that automates the tedium. So: the
framework should **do** the mechanical git work; the human keeps oversight.

### Authoritative design (cross-provider consensus — do not re-litigate the split at runtime)

- **Automate the mechanics** (extension commands the AI agent can also invoke):
  push a session branch, open a PR (via the GitHub CLI `gh`), the post-merge
  finalize (`git pull --ff-only` on the trunk + close the worktree +
  `git branch -d` + `git fetch --prune`), and create/push a release tag.
- **Keep human decisions as explicit gates — remove keystrokes, not
  oversight.** PR **review and approval** stay on GitHub (a human, or a
  different agent, approves); **branch-protection policy** is a one-time human
  setup; **what/when to release** and **rollback authorization** are human
  choices.
- **Safety boundary (aligns with the constitution's irreversible-actions
  rule).** Local commits on a session branch are already autonomous. Anything
  that touches the **remote**, **merges to protected `main`**, **pushes a
  tag**, or **rolls back** is **operator-confirmed** — never self-authorized by
  the agent. Pushing tags / publishing remain operator-approval-required
  (unchanged); this set only removes the *typing*, not the *approval*.
- **`gh` is a new optional dependency.** Detect it and guide install with a
  friendly preflight (mirror the Copilot-CLI-missing pattern from Set 078/086);
  degrade to "here is the manual command" when absent — never a hard failure
  that strands work.
- **Portability rule.** These are UI/workflow conveniences; the universal core
  must still work with `requiresUAT: false` / `requiresE2E: false` defaults,
  and every new command must be a thin, auditable wrapper over explicit git/gh
  invocations (no hidden state, no abstraction that obscures what ran).

### Non-goals

- Removing human PR review/approval, branch-protection policy, or the
  release/rollback *decision* — those are the oversight the automation
  preserves, not toil to delete.
- A bespoke merge engine or hosting-provider abstraction — `gh` + git are the
  substrate; GitHub is the reference host (note where a future GitLab/other
  host would slot in, but do not build it here).
- Auto-merging without an operator confirm, or any autonomous push/tag.
- Automating `git init` / first remote setup / branch-protection creation —
  genuine one-time bootstrap the tutorial still teaches by hand.

---

## Sessions

### Session 1 of 3: PR + finalize-merge automation (the high-frequency toil)

**Steps:**
1. Register; read this spec, the two cross-provider consensus artifacts, the
   existing worktree CLI (`ai_router.worktree`), and the command-registration
   pattern (`newModule.ts` / `gitScaffold.ts` wiring).
2. `gh` preflight: a pure-logic detector + friendly "install / not found"
   guidance (mirror `aiRouterInstall` / the Copilot-CLI-missing surface);
   settings override for the `gh` path; never hard-fail.
3. **`Dabbler: Open PR for this set`** — push the current session branch and
   `gh pr create` with a templated body linking the session set; **confirm
   before the push/PR**. Reports the PR URL.
4. **`Dabbler: Finalize merged set`** — after the operator has merged on
   GitHub: `git pull --ff-only` on the trunk, close the set's worktree,
   `git branch -d` the session branch, `git fetch --prune`; **confirm before
   the destructive cleanup**; each step idempotent and safely re-runnable.
5. Unit tests (injected process/UI surfaces, both happy path + `gh`-absent +
   confirm-declined + dirty-tree refusal); Layer 2/3 command-surface pins.
6. Live dogfood against a scratch GitHub repo: open a real PR, merge it, run
   finalize; assert the local end-state. Build + full suite; verify
   (mandatory); UAT/E2E per the upfront prompt; `disposition.json`; commit +
   push; `close_session`.

**Creates:** the `gh` preflight + the two commands + tests.
**Touches:** `tools/dabbler-ai-orchestration/src/commands/` (new command
files), `package.json` (command contributions), the worktree integration.
**Ends with:** open-PR and finalize-merge are one confirm-gated action each,
AI-invokable; `gh`-absent degrades gracefully; dogfood against a real repo
passes; suite green; cross-provider VERIFIED (or Minor-only); pushed;
`close_session` succeeded.
**Progress keys:** gh-preflight, open-pr-command, finalize-merge-command,
graceful-degradation, dogfood-pass, suite-green

### Session 2 of 3: Release tagging (operator-confirmed) + hotfix/rollback orchestration

**Steps:**
1. Register; read Session 1's outcome and the constitution's
   irreversible-actions rule (pushing tags is operator-approval-required).
2. **`Dabbler: Cut release tag`** — create + push an annotated tag on the
   chosen ref; **operator confirm is mandatory and non-bypassable** (this is
   the release gate, not a convenience toggle). Surfaces the exact tag + ref
   for review before the push.
3. **`Dabbler: Start hotfix from tag`** / **`Dabbler: Roll back to tag`** —
   encapsulate the branch-from-tag / redeploy-previous-tag mechanics from the
   tutorial's drills; each gated, each a thin wrapper printing what it will
   run.
4. Tests (the confirm-mandatory path, tag-format validation, the
   hotfix/rollback mechanics); dogfood the tag + rollback drill on the scratch
   repo. Build + suite; verify; `disposition.json`; commit + push;
   `close_session`.

**Creates:** the tag/hotfix/rollback commands + tests.
**Touches:** `tools/dabbler-ai-orchestration/src/commands/`, `package.json`.
**Ends with:** release tagging and the hotfix/rollback drills are
confirm-gated one-click actions with the operator's approval preserved; suite
green; cross-provider VERIFIED (or Minor-only); pushed; `close_session`
succeeded.
**Progress keys:** tag-release-command, confirm-mandatory, hotfix-command,
rollback-command, dogfood-pass, suite-green

### Session 3 of 3: Automation-first tutorial re-cut + manual-git appendix

**Steps:**
1. Register; read the shipped Session 1/2 commands and the current
   `docs/tutorials/module-team-hello-world.md`.
2. Re-cut the tutorial's main flow to the **automated path**: the operator
   approves and the framework/AI runs the git (open PR → approve/merge on
   GitHub → finalize → tag), with the human-decision points called out
   explicitly. Keep the module lifecycle (Build → plan set → decomposition
   set) and the trunk-based concepts.
3. Move the **full raw git/`gh` command sequences** into a reference
   **appendix** ("Git under the hood — what the framework ran for you"), so
   operators still learn the mechanics without hand-running them.
4. Retake affected screenshots (Set 095 convention). Sweep the getting-started
   template / quick-start / README for the new commands. Update both package
   changelogs; confirm the version walk.
5. Build + full suite; verify (mandatory); UAT/E2E per the upfront prompt;
   `disposition.json`; commit + push; `close_session`; end-of-set
   `change-log.md`; Step 9; the armed advisory path-aware critique. Notify the
   operator: release boundary reached — publish is the operator's click.

**Creates:** the re-cut tutorial + appendix, changelog entries, `change-log.md`.
**Touches:** `docs/tutorials/module-team-hello-world.md`, the consumer-bootstrap
templates, `docs/quick-start.md`, `tools/dabbler-ai-orchestration/README.md` +
both `CHANGELOG.md` files.
**Ends with:** the tutorial teaches the automated flow with the manual commands
in an appendix; docs reference the new commands; changelogs staged; suite
green; cross-provider VERIFIED (or Minor-only); pushed; `close_session`
succeeded; Step 9 + advisory critique recorded; operator notified at the
release boundary.
**Progress keys:** tutorial-recut, manual-appendix, screenshots-retaken,
doc-sweep-clean, changelogs-staged, suite-green, set-closed

---

## End-of-set deliverables

- Confirm-gated, AI-invokable git commands for the mechanical trunk-based work
  (open PR, finalize merge, cut release tag, hotfix/rollback), with `gh`
  preflight and graceful degradation; human approval preserved on every
  remote/main/tag/rollback action.
- The hello-world tutorial re-cut to an automation-first main flow with the raw
  git commands in a reference appendix.
- Changelogs staged for the operator-gated publish; `change-log.md`; standard
  per-session artifacts.

> **Release boundary:** publish (Marketplace + PyPI if router changes accrue)
> is operator-gated after this set closes.
