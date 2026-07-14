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
requiresUAT: suggested    # New operator-facing git commands + a re-cut tutorial: arm the ad-hoc human walk (open a real PR, finalize a real merge, cut a real tag — against a scratch Azure DevOps project and/or a scratch GitHub repo; ADO is the team's live host, so it is the priority walk).
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
>
> **Amendment (operator directive, 2026-07-14, pre-start):** the original
> consensus text named `gh`/GitHub as the sole substrate. The operator's team
> uses **Azure DevOps** today and may move to **enterprise GitHub** later, so
> dual-host support (with easy, explicit setup) is now a requirement — see
> the host-adapter point in the authoritative design. The automate/gate split
> itself is unchanged and still not to be re-litigated.

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
  push a session branch, open a PR (via the host CLI — see the host-adapter
  point below), the post-merge finalize (`git pull --ff-only` on the trunk +
  close the worktree + `git branch -d` + `git fetch --prune`), and create/push
  a release tag.
- **Keep human decisions as explicit gates — remove keystrokes, not
  oversight.** PR **review and approval** stay on the git host (a human, or a
  different agent, approves); **branch-protection policy** is a one-time human
  setup; **what/when to release** and **rollback authorization** are human
  choices.
- **Safety boundary (aligns with the constitution's irreversible-actions
  rule).** Local commits on a session branch are already autonomous. Anything
  that touches the **remote**, **merges to protected `main`**, **pushes a
  tag**, or **rolls back** is **operator-confirmed** — never self-authorized by
  the agent. Pushing tags / publishing remain operator-approval-required
  (unchanged); this set only removes the *typing*, not the *approval*.
- **Dual-host support is a requirement, not a nice-to-have (operator
  directive, 2026-07-14).** The team runs **Azure DevOps today** and may move
  to **enterprise GitHub** later; every command in this set must work on both.
  The design that satisfies this cheaply: everything in this set except PR
  creation is **pure git** and therefore already host-agnostic (push, ff-only
  pull, branch delete, prune, tags, hotfix/rollback). The one host-specific
  seam — *open a PR and report its URL* — goes behind a **minimal two-host
  adapter**:
  - **GitHub / GitHub Enterprise:** `gh pr create` (+ `gh auth login`;
    GHE via `gh auth login --hostname <host>` or `GH_HOST` /
    `GH_ENTERPRISE_TOKEN`).
  - **Azure DevOps:** `az repos pr create` (Azure CLI + the `azure-devops`
    extension; auth via `az login` or the `AZURE_DEVOPS_EXT_PAT` env var).
    Derive organization / project / repository from the remote URL — do not
    require `az devops configure --defaults`.
  - **Host detection is automatic** from `git remote get-url origin`
    (`dev.azure.com` / `*.visualstudio.com` / `ssh.dev.azure.com` → Azure
    DevOps; `github.com` → GitHub), with an explicit settings override
    `dabblerSessionSets.gitHost` (`auto` | `github` | `azure-devops`) for the
    cases auto-detect cannot know — chiefly a GHE host with a custom domain.
  - **Setup must be easy and explicit.** The docs (Session 3) ship a short
    per-host setup section — install command, one auth command, the optional
    env var — and the preflight's guidance text mirrors it verbatim.
- **The host CLI (`gh` or `az`) is a new optional dependency.** Detect the one
  the detected host needs and guide install/auth with a friendly preflight
  (mirror the Copilot-CLI-missing pattern from Set 078/086); settings overrides
  for the executable paths (`dabblerSessionSets.ghCliPath` /
  `dabblerSessionSets.azCliPath`, mirroring `copilotCliPath`); never a hard
  failure that strands work. The degradation floor requires **no host CLI at
  all**: push (pure git, confirm-gated) + open the host's create-PR web page in
  the browser (`https://github.com/{owner}/{repo}/compare/{branch}?expand=1` /
  `https://dev.azure.com/{org}/{project}/_git/{repo}/pullrequestcreate?sourceRef={branch}`),
  alongside "here is the manual command" text.
- **Portability rule.** These are UI/workflow conveniences; the universal core
  must still work with `requiresUAT: false` / `requiresE2E: false` defaults,
  and every new command must be a thin, auditable wrapper over explicit
  git / host-CLI invocations (no hidden state, no abstraction that obscures
  what ran).

### Non-goals

- Removing human PR review/approval, branch-protection policy, or the
  release/rollback *decision* — those are the oversight the automation
  preserves, not toil to delete.
- A bespoke merge engine or a *generic* hosting-provider abstraction — git plus
  the two host CLIs (`gh`, `az repos`) are the substrate, and the adapter is
  exactly the two supported hosts (GitHub incl. GHE, Azure DevOps). Note where
  a future GitLab/other host would slot in, but do not build it here.
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
2. Host detection module (pure logic): classify the `origin` remote URL as
   GitHub / Azure DevOps / unknown, honor the `dabblerSessionSets.gitHost`
   override, and parse org/project/repo (ADO: `dev.azure.com/{org}/{project}/_git/{repo}`,
   `{org}.visualstudio.com/...`, `ssh.dev.azure.com:v3/{org}/{project}/{repo}`;
   GitHub: https + ssh forms). Unknown host → prompt to set the override,
   degrade gracefully.
3. Host-CLI preflight: a pure-logic detector for the CLI the detected host
   needs (`gh`, or `az` + the `azure-devops` extension) + friendly
   "install / not authenticated" guidance (mirror `aiRouterInstall` / the
   Copilot-CLI-missing surface); settings overrides for the executable paths;
   never hard-fail.
4. **`Dabbler: Open PR for this set`** — push the current session branch and
   create the PR via the host adapter (`gh pr create` / `az repos pr create`)
   with a templated body linking the session set; **confirm before the
   push/PR**. Reports the PR URL on both hosts. CLI-absent floor: push +
   open the host's create-PR web page.
5. **`Dabbler: Finalize merged set`** — after the operator has merged on
   the git host: `git pull --ff-only` on the trunk, close the set's worktree,
   `git branch -d` the session branch, `git fetch --prune`; **confirm before
   the destructive cleanup**; each step idempotent and safely re-runnable.
   (Pure git — identical on both hosts.)
6. Unit tests (injected process/UI surfaces; happy path on **both hosts** +
   CLI-absent + unknown-host + confirm-declined + dirty-tree refusal;
   remote-URL parsing table across all ADO/GitHub URL forms); Layer 2/3
   command-surface pins.
7. Live dogfood against a scratch GitHub repo: open a real PR, merge it, run
   finalize; assert the local end-state. Azure DevOps dogfood is
   operator-assisted (needs an ADO org): prepare the exact walk, run it live
   if the operator supplies a scratch ADO project this session, otherwise
   record it as an armed UAT walk for the operator. Build + full suite;
   verify (mandatory); UAT/E2E per the upfront prompt; `disposition.json`;
   commit + push; `close_session`.

**Creates:** the host-detection module + host-CLI preflight + the two
commands + tests.
**Touches:** `tools/dabbler-ai-orchestration/src/commands/` (new command
files), `package.json` (command contributions), the worktree integration.
**Ends with:** open-PR and finalize-merge are one confirm-gated action each,
AI-invokable on both hosts; host-CLI-absent degrades gracefully to the
push + create-PR-web-page floor; dogfood against a real repo
passes (ADO walk armed or run per the operator's call); suite green;
cross-provider VERIFIED (or Minor-only); pushed; `close_session` succeeded.
**Progress keys:** host-detection, host-cli-preflight, open-pr-command,
finalize-merge-command, graceful-degradation, dogfood-pass, suite-green

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
   run. (This whole session is pure git — tags, branches, refs — so it is
   host-agnostic by construction; the only host touch is keeping any
   user-facing wording host-neutral.)
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
   the git host → finalize → tag), with the human-decision points called out
   explicitly. The main flow is **host-neutral** — it reads identically for
   Azure DevOps and GitHub. Keep the module lifecycle (Build → plan set →
   decomposition set) and the trunk-based concepts.
3. Move the **full raw git / host-CLI command sequences** into a reference
   **appendix** ("Git under the hood — what the framework ran for you"), with
   the host-specific PR step shown for both hosts (`gh` and `az repos`), so
   operators still learn the mechanics without hand-running them.
3b. Write the **per-host setup section** (the operator-directive quality bar:
   easy and explicit). For each host, exactly: the install command
   (GitHub: `winget install GitHub.cli` then `gh auth login`, with the GHE
   `--hostname` variant; Azure DevOps: `winget install Microsoft.AzureCLI`
   then `az extension add --name azure-devops` then `az login`, with the
   `AZURE_DEVOPS_EXT_PAT` alternative for PAT-based auth), the relevant
   settings (`dabblerSessionSets.gitHost` + CLI-path overrides), and how to
   confirm setup worked (the preflight command / what "green" looks like).
   The preflight's in-product guidance text and this section must match.
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
**Progress keys:** tutorial-recut, manual-appendix, host-setup-section,
screenshots-retaken, doc-sweep-clean, changelogs-staged, suite-green,
set-closed

---

## End-of-set deliverables

- Confirm-gated, AI-invokable git commands for the mechanical trunk-based work
  (open PR, finalize merge, cut release tag, hotfix/rollback), working on
  **both Azure DevOps and GitHub (incl. GHE)** via auto-detected host adapters,
  with host-CLI preflight and graceful degradation; human approval preserved
  on every remote/main/tag/rollback action.
- The hello-world tutorial re-cut to a host-neutral, automation-first main
  flow with the raw git commands in a reference appendix and an explicit
  per-host setup section (Azure DevOps and GitHub/GHE).
- Changelogs staged for the operator-gated publish; `change-log.md`; standard
  per-session artifacts.

> **Release boundary:** publish (Marketplace + PyPI if router changes accrue)
> is operator-gated after this set closes.
