# Review — make git and pull requests transparent to developers

> **Reviewed:** [`git-transparency-proposal.md`](git-transparency-proposal.md)
> **Date:** 2026-07-30
> **Reviewer:** GitHub Copilot, without the AI router or another model

## Findings

### 1. Critical — the proposal puts the actual solution last

The "genuine 15-minute first run" is increment 3 in the
[proposed sequencing](git-transparency-proposal.md#8-proposed-sequencing). It
should be increment 1 and the governing acceptance criterion for everything
else.

The proposal correctly says Git automation alone will not solve adoption, but
then sequences two rounds of Git automation before addressing that conclusion.
That risks shipping six new commands while staff still abandon the tutorial.

### 2. High — six Git-shaped commands are not transparent Git

The [proposed command table](git-transparency-proposal.md#6-proposed-commands)
still requires developers to understand:

- what an authoring branch is;
- when to publish rather than open a PR;
- when a worktree is necessary;
- whether a PR is merely open or ready to complete; and
- when local finalization is required.

That removes typing but preserves the Git state machine as a user
responsibility. The extension should expose outcomes, not Git phases.

### 3. High — `Publish current branch` and `Open PR for current branch` overlap

One command claims commit/push ownership while the other "absorbs the
commit-then-open dance." A developer with dirty files cannot know which command
is correct without understanding repository state.

Replace both with one action: **Send for review**. It should:

- show the files that will be included;
- scan and refuse suspicious files;
- derive an editable commit message;
- commit, push, and create or update the PR; and
- optionally arm host-native auto-complete.

### 4. High — the tutorial is primarily a repository-administration guide

Before the first visible code result, the solo path requires multiple
installations and authentications, repository creation, module cleanup, manual
manifest YAML, branch protection, plan and decomposition sessions, an authoring
PR, a worktree, hand-authored CI, another PR, and a required-check policy. See
the current [Hello World tutorial](../tutorials/hello-world.md).

Those are legitimate adoption topics, but they are not Hello World topics.
Automating their Git commands will not reduce the conceptual burden enough.

### 5. High — avoidable product gaps are more visible than raw Git

The first-module experience currently means creating `greeter`, deleting
`Default`, manually deleting its leftover folder, and editing
`docs/modules.yaml` by hand. The command itself deliberately creates a module
with empty `codeRoots`; see
[`newModule.ts`](../../tools/dabbler-ai-orchestration/src/commands/newModule.ts).

Before adding lifecycle Git commands, make first-module setup one coherent
form:

- module name;
- display title;
- code root; and
- optional dependency or `touches` selection.

There should be no `Default` cleanup and no YAML editing in the first-run path.

### 6. Medium — `Finalize merged branch` should not merely add another prefix

The existing `session-set/*` limitation is a real defect; see
[`gitWorkflow.ts`](../../tools/dabbler-ai-orchestration/src/commands/gitWorkflow.ts).
Changing it to recognize `authoring/*`, however, still makes branch naming the
lifecycle authority.

Dabbler should track work it created and reconcile it using branch, worktree,
and remote PR state. After a PR merges, cleanup can normally happen
automatically on activation. A dirty checkout or failed fast-forward becomes an
actionable exception, not a routine command.

### 7. Medium — remote URL settings should not become normal setup

The existing implementation already reads `remote.origin.url`, detects the
host, and derives trunk from `origin/HEAD`. That is the right default. Settings
should only handle custom enterprise hosts or unusual remotes.

## Recommended product model

The normal workflow should have at most two developer-facing actions:

1. **Start work.** From a session-set row, Dabbler creates or opens the correct
   branch and worktree, then copies or launches the session prompt. Branch names
   and worktree paths remain internal details.
2. **Send for review.** Dabbler commits any explicitly confirmed remainder,
   pushes, creates or updates the PR, and arms auto-complete when repository
   policy permits. After merge, it reconciles trunk and cleans up
   automatically.

Dabbler commands that mutate project structure, such as New Module, should call
a shared `ensureManagedChange()` internally. There should be no separate
"Start authoring branch" ceremony.

## Recommended documentation split

### Hello World — 10 to 15 minutes

Use a prepared sample repository, one already-authored implementation set, one
AI session, tests, and a visible result. Include zero raw Git, YAML,
branch-policy configuration, CI authoring, worktree terminology, or teammate
setup.

### Adopt Dabbler in a repository

Cover scaffolding, providers, host authentication, CI, branch policies, and
initial module declaration.

### Team workflow

Cover the plan/decomposition lifecycle, dependencies, ownership, reviews,
parallel work, and worktrees.

### Reference and troubleshooting

Cover raw Git commands, recovery, custom hosts, and failure states.

The existing Hello World document can become the team adoption guide. It should
not remain the first experience.

## Answers to the proposal's open questions

1. **Should Azure DevOps become the primary worked path?** Neither host should
   dominate Hello World. Host administration belongs in adoption guides; the
   team-specific guide can be Azure DevOps-first.
2. **Is increment 3 in scope?** Yes, and it must be first.
3. **How much raw Git should appear in the main tutorial?** None.
4. **Should the commit message be prompted or derived?** Derive it from the
   operation or set, with an optional edit affordance.
5. **Should PR completion be automated?** Yes, where policy permits, but fold it
   into **Send for review** through host-native auto-complete instead of
   introducing another routine command.

## Recommended success criterion

The proposal has the right diagnosis in its dissent, but its implementation
does not follow that diagnosis far enough. The success metric should not be
"remove 12 of 15 Git commands." It should be:

> A new developer sees AI produce and test working code before learning any
> Dabbler governance concept.