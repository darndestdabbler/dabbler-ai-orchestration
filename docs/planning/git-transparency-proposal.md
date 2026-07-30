# Proposal — make git and pull requests transparent to developers

> **Status:** PROPOSAL, not accepted. Written 2026-07-30 for operator evaluation.
> **Trigger:** staff called the hello-world tutorial "way too complicated"; some
> abandoned it. The operator's words: *"We are in jeopardy of all this effort
> going to waste."*
> **Author:** Claude Opus 5, with a routed GPT-5.4 architecture consult
> (raw: [`s4-git-transparency-consult-gpt.json`](../session-sets/106-hello-world-tutorial-simplification/s4-git-transparency-consult-gpt.json), $0.49).
> **Audience:** an evaluator with repo access and none of the conversation
> history. Every factual claim below carries a citation you can check.

---

## 0. How to evaluate this

This document is written to be **tested, not approved**. It contains a diagnosis
I believe is correct, a proposal I believe is right-sized, and **one finding
that argues the proposal will not fix the stated problem**. If you only confirm
the parts that agree with the operator, this consult was worthless.

Specific things worth attacking, in descending order of how much they'd cost if
wrong:

1. **§5's claim that this is incomplete execution rather than a design choice.**
   If the `authoring/*` branch class was deliberately left manual for a reason
   recorded somewhere I did not find, the whole proposal is mis-framed.
2. **§7's dissent** — that automating git will *not* fix "too complicated".
   Is the first-run concept load the real disease? If so, §8's increment 3 is the
   only one that matters and 1–2 are polish.
3. **§6's automate/gate split.** Every command is a place a tool can destroy work.
   Is any of them gated too loosely?
4. **§9's open questions**, especially whether Azure DevOps should become the
   primary worked path.

---

## 1. What the operator asked for

> "Why wouldn't we have architected things so that many of the operations are
> transparent to the developers … couldn't we have asked them to either create
> environment variables or project settings for the remote repo URL and then have
> python handle all the git operations under the hood? There should be no reason
> why my folks should ever have to manually commit, push, or merge. These should
> be baked into the lifecycle of sessions and session sets."
>
> **The litmus test:** "if the next command-line could be determined, based upon
> session or session set variables, along with project settings or environment
> variables, then the instructions for AI should be to execute that command-line."
>
> And separately: **"Same thing with pull requests."**

The motivation is adoption, not elegance: *"I want things to be as simple and easy
as possible for my staff; otherwise, they won't use it and they will adopt less
standard development processes. Trust me, they are already doing it."*

## 2. The litmus test, assessed

The routed consult judged it **sound as a heuristic, unsound as a rule**:

> "'Determinable from state' is necessary, not sufficient. The correct product
> rule is: if the next repo action is mechanical, derived from trusted local or
> remote state, **and its safety preconditions can be checked**, Dabbler should
> execute it through deterministic extension or Python code with the appropriate
> gate. By that rule, the tutorial's manual branch creation, ff-only sync, branch
> cleanup, push, worktree open, and PR creation are **not justified exceptions;
> leaving them manual is rationalisation.**"

The exceptions it defends — each with a concrete harm, not a vibe:

| Must not be automatic | Harm if it is |
| --- | --- |
| Release / rollback / hotfix **selection** | Cutting, reverting or hotfixing the wrong version. A product judgment. |
| History rewriting — `reset --hard`, `clean -fd`, `branch -D`, force-push | Silent data loss or divergent remote history. |
| Blind `add -A` + commit with no visible file list | Secrets, build output, unrelated edits get published. |
| Completing a PR before approval exists / threads resolved / checks green | Bypassed review policy. |
| Auto-resolving merge conflicts | Semantic conflicts need judgment; the tool lands wrong behaviour while looking clean. |

**One correction to the operator's phrasing, worth adopting.** The test says *"the
instructions for AI should be to execute that command-line."* The consult argues
the command should be run by **deterministic extension/Python code**, not by an
LLM shelling out:

> "if Dabbler can derive the command, Dabbler itself should run it; telling the
> LLM to free-form shell out is weaker than the current confirm-and-run pattern."

Same outcome for the developer; reproducible, testable, and reviewable in a
confirm dialog rather than dependent on a model's turn.

## 3. What is already automated

The extension contributes, each behind a dialog that lists the exact commands
before running them:

| Command | Runs |
| --- | --- |
| `Dabbler: Open PR for this set` | `git push -u origin <branch>` + `gh pr create` / `az repos pr create`. Refuses on the trunk. |
| `Dabbler: Finalize merged set` | `git pull --ff-only`, `git worktree remove`, `git branch -d`, `git fetch --prune`. Idempotent; never force-deletes; refuses on a dirty tree or from inside the worktree it would remove. |
| `Dabbler: Cut release tag` / `Start hotfix from tag` / `Roll back to tag` | The Set 102 release commands. |
| `python -m ai_router.worktree open\|close\|list` | Worktree lifecycle (CLI only — no command-palette entry). |

**The policy was already decided.** Operator directive 2026-07-14, backed by a
two-round GPT + Gemini consensus: *the framework automates mechanical git
(branch / PR / merge / sync / cleanup / tag) and keeps human judgment
(review / approval / release / rollback); raw git moves to a teaching appendix.*
Set 102 implemented it. See
[`102-git-workflow-automation/spec.md`](../session-sets/102-git-workflow-automation/spec.md).

## 4. What the tutorial nevertheless still makes a human type

From [`docs/tutorials/hello-world.md`](../tutorials/hello-world.md) — 15 commands
across 9 places:

| # | Tutorial location | Commands |
| --- | --- | --- |
| 1 | Part 3 step 4 | `git add -A`, `git commit -m "chore: scaffold Dabbler and declare the greeter module"`, `git push` |
| 2 | Part 4 preamble | `git switch -c authoring/greeter-lifecycle` |
| 3 | Part 4 step 3 | `git status --short`, conditionally `git add -A && git commit -m "…"` |
| 4 | Part 4 step 3 | `git switch main && git pull --ff-only && git branch -d authoring/greeter-lifecycle` |
| 5 | Part 4 step 4 | `.venv\Scripts\python.exe -m ai_router.worktree open <slug>` |
| 6 | Part 5 step 5 | `git switch -c authoring/app-module`, `git add -A`, `git commit -m "…"` |
| 7 | Part 5 step 5 | `git switch main && git pull --ff-only && git branch -d authoring/app-module` |
| 8 | Part 5 step 6 | `git pull --ff-only`, `git switch -c authoring/app-lifecycle` |
| 9 | Part 5 step 6 | `git add -A && git commit -m "docs: app's implementation set depends on greeter's"` |
| 10 | Parts 4 & 6 | Merging every PR by hand in the host's web UI, and watching CI there |

## 5. Diagnosis — incomplete execution, not a new design question

**The sharpest single piece of evidence:** `Finalize merged set` already performs
exactly the four commands in rows 4 and 7. It is scoped to one branch prefix —
[`gitWorkflow.ts:154`](../../tools/dabbler-ai-orchestration/src/commands/gitWorkflow.ts#L154)
defines `SESSION_BRANCH_PREFIX = "session-set/"`, and
[`:595`](../../tools/dabbler-ai-orchestration/src/commands/gitWorkflow.ts#L595)
and [`:619`](../../tools/dabbler-ai-orchestration/src/commands/gitWorkflow.ts#L619)
filter worktrees and branches on it. **`authoring/*` branches are invisible to a
command that would otherwise clean them up correctly.**

The `authoring/*` class was introduced later, by Set 106 Session 1, to solve a
real problem: once `main` is protected, even doc-only work (a plan, a manifest
edit, a CODEOWNERS edit) needs a branch and a PR. No automation followed it. Raw
git re-entered the tutorial **after** the automate-the-mechanical directive had
been decided and implemented — which is also why Set 106's own cut list said to
cut "git ceremony" and the tutorial nevertheless contains 15 commands.

The routed consult agreed, with a widening:

> "Your named defect is real … That makes this primarily incomplete execution,
> not a new architectural question. **The nuance is that the gap is larger than
> that one prefix filter**: authoring-branch creation, commit or publish of
> human-authored changes, and the `worktree open` CLI also remained outside the
> automation surface."

## 6. Proposed commands

From the consult, with its gate and effort assessments. **Not yet accepted.**

| Command | Replaces | Derivable from | Gate | Effort |
| --- | --- | --- | --- | --- |
| **Start authoring branch** | rows 2, 6, 8 | repo root; trunk from setting or remote HEAD; new `AUTHORING_BRANCH_PREFIX` (default `authoring/`); module/set slug; purpose enum | none | small |
| **Publish current branch** | rows 1, 3, 6, 9 | branch; `git status --porcelain`; upstream from git config; push mode. **Commit message is the one non-derivable input** — prompt, prefilled from set/module context | confirm | medium |
| **Open worktree for this set** | row 5 | set slug; repo root; venv python; branch prefix; `<repo>-worktrees/<slug>` | none | small |
| **Open PR for current branch** | absorbs the commit-then-open dance | current branch; base from settings; remote/host; set context for title/body | confirm | medium |
| **Finalize merged branch** | rows 4, 7 — *and supersedes today's `Finalize merged set`* | branch; trunk; prefix classification; `git worktree list` | confirm | small |
| **Complete PR when ready** | row 10 | branch→PR mapping; host; merge strategy from settings; remote PR state (approvals, threads, checks) | confirm | medium |

**Minimum viable set** to take the tutorial's main path to **zero raw git**:
Finalize merged branch → Start authoring branch → Publish current branch →
Open worktree for this set.

**On pull requests, the consult agrees with the operator:**

> "Approval is human judgment. Waiting on CI is purely mechanical. Once repo
> policy fixes the base branch, merge strategy, required approvals, and required
> checks, the act of completing the PR after those conditions are satisfied is
> mechanical too… So merging should be automated **only as an explicit
> post-review completion step**, not as silent background behaviour."

Design: resolve branch → PR; refuse if draft, approvals missing, changes
requested, threads unresolved, or a required check failing; merge immediately if
green; otherwise **arm host-native auto-complete** (`gh pr merge --auto` /
ADO auto-complete) so the wait happens server-side. Works on both hosts.

## 7. The dissent — this probably does not fix the complaint

Asked explicitly whether raw git is the real cause of "too complicated", the
consult said **no**:

> "It will fix a real, visible defect, but not the whole complaint… the tutorial
> also forces first-time users to install and authenticate multiple tools,
> understand session sets, authoring branches, worktrees, branch protection, CI,
> CODEOWNERS, `touches`, prerequisites, and a two-person review flow, plus make
> manual YAML edits. **Git is one symptom of a larger first-run concept load.**
> If you automate git and do nothing else, the tutorial will feel less
> inconsistent but still too heavy."

**This is worse than the consult knew.** Set 106's spec carries operator
requirement B: Parts 1–4 must read correctly for a one-person, one-module repo.
But the "solo" path still contains **every governance concept**: branch
protection stage 1 (Part 3 step 5), worktrees (Part 4 step 4), CI (Part 4 step 6),
pull requests (Part 4 step 7), branch protection stage 2 (Part 4 step 9).

**There is no path through this product that gets a developer from install to
"an AI session wrote my code" without also teaching team governance.** That, not
git, may be the thing your staff are reacting to.

### Risks of over-automation, and how to mitigate without regressing

| Risk | Mitigation that does *not* put git back on the main path |
| --- | --- |
| Conflict / non-fast-forward with no mental model | Fail closed with a structured panel naming repo, branch, base, conflicting files, plus a guided repair path |
| Wrong checkout / detached HEAD | Persistent status badge (repo root, worktree, branch, tracking); refuse on detached HEAD |
| `add -A` sweeps in secrets | Confirm dialog with explicit file list; secret scan; refuse on unignored credential-like files |
| Bad rebase, unrecoverable | Keep rebase off the main path entirely — `pull --ff-only` locally, server-side merges only |
| Auto-merge lands a newer head than the reviewer saw | Show head SHA when arming; require stale-approval dismissal on new commits |
| Stale branches/worktrees accumulate invisibly | A health view for open worktrees and merged-but-unfinalized branches |

## 8. Proposed sequencing

Three increments. The operator is on a hard budget, so each is independently
shippable and independently valuable.

1. **Make `authoring/*` a first-class managed branch type** *(small)* —
   generalize `Finalize merged set`, add `Start authoring branch` and
   `Publish current branch`, wrap the worktree CLI as a palette command. Update
   the tutorial to use them everywhere. **Removes roughly 12 of the 15 commands.**
   Consider moving Part 3's setup onto an authoring branch too, so protected-main
   behaviour is consistent from the first meaningful change and the tutorial stops
   teaching a special-case direct push.
2. **`Complete PR when ready`** *(medium)* — removes the browser round-trip and
   the CI-watching. Host-native auto-complete on both hosts.
3. **A genuine 15-minute first run** *(medium)* — install → build → one session →
   see code. No branch protection, no CI, no worktrees, no PRs. Today's tutorial
   becomes what it actually is: *adding team guardrails*. **This is the increment
   that addresses §7**, and if §7 is right it is the most important of the three.

Explicitly deferred: smarter PR templating, dashboards, teaching more raw git.

## 9. Open questions the operator must answer

1. **Should Azure DevOps become the primary worked path?** The team is on ADO;
   the tutorial's worked path is GitHub. Making ADO primary inverts a Set 106
   decision and would need an `azure-pipelines.yml` to ship (see §10).
2. **Is increment 3 in or out?** If §7 is right, 1 and 2 alone will not move the
   adoption needle.
3. **How much raw git should a developer ever see?** The 2026-07-14 directive says
   "teaching appendix". Is that still the answer, or should it be zero?
4. **Does `Publish current branch` prompt for a commit message, or derive one?**
   The only non-derivable input in the whole set. A derived message is more
   automatic; a prompted one is more honest about authorship.

## 10. Already fixed — do not re-propose

Applied 2026-07-30, in response to the same staff feedback:

- **Host branching was presented as trailing italic asides**, so ADO readers could
  not tell that the GitHub and ADO instructions were *alternatives*. Some gave up.
  All seven are now symmetric `▸ Your host — do ONE of these` blocks with a
  banner stating the rule once. Both hosts sit at the same visual level.
- **The ADO CI dead end is now named rather than hidden.** Part 4's CI step is a
  GitHub Actions workflow that ADO ignores, and the tutorial deliberately ships no
  `azure-pipelines.yml`. An ADO reader previously hit this mid-flow with no
  warning. Both the banner and the step now say it is a known gap and where to
  stop. **Shipping an `azure-pipelines.yml` is a live candidate for the next set**
  and is not included above.

## 11. Cost of the analysis so far

One routed architecture consult, GPT-5.4, **$0.49**. The host-branching fix was
made directly and cost nothing beyond local gate runs (both gates are pure local
Python: 123 and 358 checks, no API calls).
