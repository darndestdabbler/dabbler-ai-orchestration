# Synthesis — git transparency and first-run load

> **Supersedes the plan in** [`git-transparency-proposal.md`](git-transparency-proposal.md)
> **but does not replace it.** That document is left intact because both reviews
> cite it by section.
> **Inputs:** the proposal (Claude Opus 5 + a routed GPT-5.4 architecture consult),
> [`git-transparency-proposal-gpt.md`](git-transparency-proposal-gpt.md) (GitHub
> Copilot, no router), [`git-transparency-proposal-gemini.md`](git-transparency-proposal-gemini.md).
> **Status:** recommendation. Four decisions in §6 are the operator's.
> **Date:** 2026-07-30

---

## 1. Unanimous across all three reviewers

No dissent on any of these. They can be treated as settled unless the operator
overrules them.

| # | Conclusion |
| --- | --- |
| 1 | **The root cause is first-run cognitive load, not raw git.** Git is one symptom. |
| 2 | **The 15-minute first run must ship FIRST**, not third. GPT rates the sequencing error *Critical*; Gemini says "re-write the tutorial immediately". |
| 3 | **All governance leaves Hello World** — branch protection, CI, PRs, worktrees, CODEOWNERS, `touches`, prerequisites, teammates. |
| 4 | **PR completion is automated server-side**, via host-native auto-complete, so nobody watches CI in a browser. |
| 5 | **Commit messages are derived, with an edit affordance** — prefilled, `Enter` to accept. |
| 6 | **Zero raw git in the main tutorial.** |

## 2. Where I concede — the proposal was wrong, not just incomplete

Three hits from the Copilot review that land, and that change the design rather
than extend it.

### 2.1 Six git-shaped commands are not transparent git

> "That removes typing but preserves the Git state machine as a user
> responsibility. The extension should expose **outcomes, not Git phases**."

This is correct and it is the deepest criticism of my proposal. A developer given
`Start authoring branch`, `Publish current branch`, `Open worktree`,
`Open PR`, `Finalize merged branch` and `Complete PR when ready` must still know
what an authoring branch is, when a worktree is required, and whether a PR is
merely open or ready to complete. I removed the typing and kept the model.

**Adopted instead — two developer-facing actions:**

1. **Start work** — from a session-set row: create or open the right branch and
   worktree, then copy or launch the session prompt. *Branch names and worktree
   paths become internal details.*
2. **Send for review** — commit any confirmed remainder, push, create or update
   the PR, arm auto-complete where policy permits. After merge, reconcile trunk
   and clean up automatically.

### 2.2 `Publish current branch` and `Open PR` overlapped

> "A developer with dirty files cannot know which command is correct without
> understanding repository state."

Right. Two commands both claiming commit/push ownership is a worse interface than
one. They collapse into **Send for review**, which shows the file list, refuses
suspicious files, derives an editable message, commits, pushes, opens/updates the
PR, and optionally arms auto-complete.

### 2.3 Generalizing the branch-prefix filter was the wrong fix

> "Changing it to recognize `authoring/*` still makes **branch naming the
> lifecycle authority**. Dabbler should track work it created and reconcile it
> using branch, worktree, and remote PR state. After a PR merges, cleanup can
> normally happen automatically on activation."

My §5 finding — that `Finalize merged set` is arbitrarily scoped to
`SESSION_BRANCH_PREFIX` — remains a true defect. But "add another prefix" treats
a naming convention as the source of truth. Reconciling from tracked state is the
better design, and it turns routine cleanup into something that just happens,
with a dirty checkout or failed fast-forward surfacing as an *exception* rather
than a command someone must remember to run.

## 3. What the reviews found that I missed

### 3.1 The first-module experience is a product gap, and it is more visible than git

Verified against the code. `Dabbler: New Module` creates the module with
**`codeRoots: []`** by design —
[`newModule.ts:103`](../../tools/dabbler-ai-orchestration/src/commands/newModule.ts#L103).
So the tutorial's Part 3 has a reader run **four** steps to end up with one
module: `New Module`, `Delete Module` on `Default`, delete the orphaned
`docs/modules/default/` folder by hand, then hand-edit `docs/modules.yaml` to add
the code root.

None of that is git. All of it is on the first-run path. **One form** — name,
title, code root, optional `touches` — replaces the lot, with no `Default`
cleanup and no YAML editing.

This is the cheapest high-visibility win in the whole programme, and it was
absent from my proposal.

### 3.2 The operator's opening premise is already satisfied

The question was whether staff should *"create environment variables or project
settings for the remote repo URL"*. **They should not, because they do not need
to** — the code already derives it:

- host from `git config --get remote.origin.url` —
  [`gitWorkflow.ts:426`](../../tools/dabbler-ai-orchestration/src/commands/gitWorkflow.ts#L426)
- trunk from `symbolic-ref refs/remotes/origin/HEAD` —
  [`gitWorkflow.ts:346`](../../tools/dabbler-ai-orchestration/src/commands/gitWorkflow.ts#L346)

Settings should exist only for custom enterprise hosts and unusual remotes.
Adding routine remote-URL configuration would *add* setup burden to solve a
problem that is already solved.

## 4. The documentation split

From the Copilot review, adopted:

| Document | Contains | Length |
| --- | --- | --- |
| **Hello World** | A prepared sample repo, one already-authored implementation set, one AI session, tests, a visible result. **Zero** raw git, YAML, branch policy, CI authoring, worktree terminology or teammate setup. | 10–15 min |
| **Adopt Dabbler in a repository** | Scaffolding, providers, host authentication, CI, branch policies, initial module declaration. | — |
| **Team workflow** | Plan/decomposition lifecycle, dependencies, ownership, reviews, parallel work, worktrees. | — |
| **Reference and troubleshooting** | Raw git, recovery, custom hosts, failure states. | — |

> "The existing Hello World document can become the team adoption guide. **It
> should not remain the first experience.**"

That is the cheapest possible restructure: the 419-line tutorial Set 106 just
built is not wasted — it is *relocated*, and a new short first-run doc is written
in front of it.

**One trade worth stating**, since no reviewer named it: a *prepared sample
repository* means the reader never scaffolds their own on the first run. That is
the right call for time-to-value, but it changes what Hello World proves — it
demonstrates the AI session loop, not the setup. Setup then has to be genuinely
good in the adoption guide, because it is no longer rehearsed anywhere first.

## 5. The success criterion

Replacing "remove 12 of 15 git commands":

> **A new developer sees AI produce and test working code before learning any
> Dabbler governance concept.**

This is a better metric because it fails loudly. Any proposed step can be tested
against it, and the current tutorial fails it at Part 3.

## 6. Decisions for the operator

### 6.1 What happens to Set 106 Session 4? — time-sensitive

S4 is the live ~2-hour operator + staff walk of the current tutorial. Cards are
written and about to be sent. If the restructure happens first, that walk tests a
document being relocated.

**The uncomfortable observation: S4's acceptance test has already run informally,
and it failed.** Staff attempted the tutorial and abandoned it. That *is* the
finding. Spending two hours of the operator's and a staff member's time to
re-discover it formally is the most expensive way to learn something already
known.

Options:

| | Option | Cost | What it buys |
| --- | --- | --- | --- |
| **A** | Run S4 as planned | 2 h operator + 2 h staff | Validates governance content that survives relocation; does **not** test the thing that is broken |
| **B** | Defer S4 until the new Hello World exists, then walk that | ~15 min walk | Tests the actual first-run experience; governance walk moves to a later set |
| **C** | Run a reduced S4 now — governance only | ~1 h | Splits the difference; needs the checklist re-cut |

I recommend **B**. It is the only option where the expensive human resource is
spent on the failing experience rather than the working one, and it makes the
walk affordable enough to repeat.

**This changes Set 106's scope, so it is not mine to decide** — the constitution
requires scope doubt to be surfaced, not resolved unilaterally.

### 6.2 Should Azure DevOps be the primary worked path?

Copilot's answer: **neither host should dominate Hello World** — host
administration belongs in the adoption guide, and *that* guide can be ADO-first
for this team. This dissolves the question rather than answering it, and it is
better than either horn.

Still live either way: **someone must write an `azure-pipelines.yml`**, or ADO
teams hit the same dead end in the adoption guide that they hit in the tutorial.
No reviewer addressed this.

### 6.3 Does the product work come before or with the docs?

§3.1's one-form module creation is product code. Set 106's non-goals forbid
product changes — but that is Set 106's constraint, not a permanent one. A new
set can do both, and the doc restructure is cheaper if the four-step module dance
no longer needs documenting at all.

### 6.4 How many sets, given the budget?

The minimum that addresses the failure:

1. **Set A — first-run rescue.** New 15-minute Hello World; relocate the existing
   tutorial to "adopt Dabbler in a repository"; one-form module creation. This
   alone satisfies §5's criterion.
2. **Set B — two-action git.** `Start work` and `Send for review`, state-based
   reconciliation, auto-complete. Removes the raw git from the *adoption* guide,
   which is where it now lives.

Deferred: dashboards, PR templating, teaching raw git anywhere but Reference.

## 7. What has already shipped

Do not re-propose:

- **Host branching is now structural**, not trailing italic asides — seven
  `▸ Your host — do ONE of these` blocks plus a banner stating the either/or rule
  once. This was the specific defect that made ADO staff abandon the tutorial.
- **The ADO CI dead end is named** rather than hidden, with a stated stopping
  point.
