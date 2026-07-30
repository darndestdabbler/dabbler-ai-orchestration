# Proposal v2 — fix the first run, then make git disappear

> **Status:** PROPOSAL, not accepted. Written 2026-07-30 for a second evaluation round.
> **Supersedes:** [`git-transparency-proposal.md`](git-transparency-proposal.md) (v1).
> v1 and the two reviews of it are left intact as the audit trail:
> [GPT/Copilot](git-transparency-proposal-gpt.md), [Gemini](git-transparency-proposal-gemini.md),
> [my synthesis](git-transparency-synthesis.md).
> **Audience:** an evaluator with repo access and no conversation history.
> Every factual claim carries a citation you can check.

---

## 0. How to evaluate this

v1 was reviewed and **three of its core design choices were rejected**. v2 adopts
those rejections. So do not spend this round re-confirming the consensus — spend
it on §6, which is the part **nobody has evaluated yet** and where I am least
confident.

Ranked by what they cost if wrong:

1. **§6.1 — can the 15-minute first run actually run an AI session with no
   credential setup?** My answer is Lightweight tier. If that is wrong, the
   headline deliverable is impossible as specified and the whole plan needs
   re-sequencing.
2. **§6.3 — does splitting 1 document into 4 re-create the drift-maintenance tax
   that Set 106 just spent three sessions eliminating?** If yes, this plan trades
   one failure for a known-worse one.
3. **§6.2 — what actually produces the sample repository?** Unresolved. It
   determines whether increment A is small or large.
4. **§5's two-action model** — is *Start work* / *Send for review* genuinely
   outcome-shaped, or has it just renamed the git state machine?
5. **§8 — is the sequencing right given a hard budget?**

If you agree with everything here, this round was wasted.

---

## 1. The failure being fixed

Staff called the hello-world tutorial "way too complicated". Some abandoned it
mid-way. The operator: *"We are in jeopardy of all this effort going to waste…
they won't use it and they will adopt less standard development processes. Trust
me, they are already doing it."*

Two distinct causes were identified, one already fixed:

- **Host branching was presented as trailing italic asides** (GitHub in the body,
  Azure DevOps in parentheses), so ADO readers could not tell the two were
  alternatives. **Fixed and shipped** — see §10.
- **First-run cognitive load.** Unfixed, and the subject of this proposal.

## 2. Success criterion

Replacing v1's "remove 12 of 15 raw git commands", which all three reviewers
judged to be measuring the wrong thing:

> **A new developer sees AI produce and test working code before learning any
> Dabbler governance concept.**

Every proposed step is testable against it. The current tutorial
[`hello-world.md`](../tutorials/hello-world.md) fails it at Part 3, before any
code exists: branch protection arrives in Part 3 step 5, worktrees in Part 4
step 4, CI in Part 4 step 6, pull requests in Part 4 step 7.

## 3. What v1 got wrong

Recorded because the reviews are worth more than the proposal was.

| v1 said | Rejected because | v2 says |
| --- | --- | --- |
| Six new git commands | *"Removes typing but preserves the Git state machine as a user responsibility. The extension should expose **outcomes, not Git phases**."* | Two actions (§5) |
| `Publish current branch` **and** `Open PR for current branch` | *"A developer with dirty files cannot know which command is correct without understanding repository state."* | One action: **Send for review** |
| Generalize `SESSION_BRANCH_PREFIX` to cover `authoring/*` | *"Still makes branch naming the lifecycle authority."* | Reconcile from tracked branch/worktree/PR state; clean up on activation |
| Git automation first, short tutorial third | *Critical* — *"sequences two rounds of Git automation before addressing that conclusion"* | Short tutorial **first** (§8) |

Two things the reviews found that v1 missed entirely, both verified in code:

- **`Dabbler: New Module` creates the module with `codeRoots: []` by design** —
  [`newModule.ts:103`](../../tools/dabbler-ai-orchestration/src/commands/newModule.ts#L103).
  The tutorial therefore has a reader run **four** steps to end up with one
  module: `New Module`, `Delete Module` on `Default`, delete the orphaned
  `docs/modules/default/` folder by hand, hand-edit `docs/modules.yaml`. None of
  it is git; all of it is first-run.
- **The operator's opening premise is already satisfied.** No project setting or
  environment variable is needed for the remote URL: host is derived from
  `git config --get remote.origin.url`
  ([`gitWorkflow.ts:426`](../../tools/dabbler-ai-orchestration/src/commands/gitWorkflow.ts#L426))
  and trunk from `symbolic-ref refs/remotes/origin/HEAD`
  ([`:346`](../../tools/dabbler-ai-orchestration/src/commands/gitWorkflow.ts#L346)).
  Adding routine remote configuration would *add* setup to solve a solved problem.

## 4. The document set

| Document | Contains | Target |
| --- | --- | --- |
| **`hello-world.md`** *(new, keeps the name)* | A sample repository, one already-authored implementation set, one AI session, tests, a visible result. **Zero** raw git, YAML editing, branch policy, CI authoring, worktree terminology, teammate setup. | 10–15 min |
| **`adopt-dabbler.md`** *(the current 419-line tutorial, relocated)* | Scaffolding, providers, host authentication, module declaration, CI, branch policies. | — |
| **`team-workflow.md`** | Plan/decomposition lifecycle, dependencies, ownership, reviews, parallel work, worktrees. | — |
| **`release-and-recovery.md`** *(exists)* + reference | Raw git, recovery, custom hosts, failure states. | — |

**Keep the filename `hello-world.md` for the new short document.** This is not
cosmetic. That exact path is linked from the scaffolded
[`getting-started.md.template`](../templates/consumer-bootstrap/getting-started.md.template)
which **ships inside the extension**, from
[`monorepo-ci.yml.template`](../templates/consumer-bootstrap/monorepo-ci.yml.template),
from both cold-start fixtures, and from `README.md`, `docs/quick-start.md` and
`docs/module-reorganization.md`. If the new first-run doc takes the name, the
shipped link stays semantically correct and **no template change, fixture
regeneration or extension version bump is needed**. If the name moves with the
old content, all of that churns.

## 5. The product model — two developer-facing actions

Adopted from the Copilot review. Branch names, worktree paths and PR states
become internal details.

### Start work
From a session-set row: create or open the correct branch and worktree, then copy
or launch the session prompt.

### Send for review
Show the files that will be included; scan and refuse suspicious ones; derive an
editable commit message; commit, push, create or update the PR; arm host-native
auto-complete where repository policy permits. After merge, reconcile trunk and
clean up **automatically on activation** — a dirty checkout or failed
fast-forward surfaces as an actionable exception, not a command to remember.

Structure-mutating commands (`New Module`, and the module lifecycle writers) call
a shared `ensureManagedChange()` internally rather than requiring a separate
"start a branch" ceremony.

**Neither action appears in Hello World.** They belong to `adopt-dabbler.md` and
`team-workflow.md`. This matters: v1's implicit assumption was that better git
commands would improve the first run, and they will not, because the first run
should contain no git at all.

### What stays human

Unchanged from the 2026-07-14 directive and endorsed by both reviews: approving a
PR, setting branch policy, choosing what and when to release, authorising a
rollback. Plus, from the v1 consult: history rewriting (`reset --hard`,
`clean -fd`, `branch -D`, force-push), blind `add -A` without a visible file
list, and conflict resolution.

## 6. Open questions — evaluate these

This is the section that has not been reviewed. I am least confident here, and
the plan's cost swings on it.

### 6.1 Can the first run reach an AI session with no credential setup? *(highest risk)*

The stated goal is "install → see AI write code" in 10–15 minutes. But **an AI
session needs an AI**, and the current Full-tier path requires either
`DABBLER_*` provider API keys or a probed GitHub Copilot seat, plus a
not-to-exceed budget. That is not a 15-minute path, and no reviewer addressed it.

**My proposed answer — Lightweight tier.** Lightweight runs `--no-router`:
*"suppress all AI router runtime calls (no LLM API hits, no auto-verification)"*.
The session itself is executed by whatever AI agent the developer **already has
open** (Copilot CLI, Claude Code, Codex) by pasting the starter line the Work
Explorer copies. So the first run needs: the extension, Python, and an AI agent
they already use. **No provider keys, no seat probe, no budget, no metered spend.**

**What to check:**
- Does a Lightweight session genuinely complete end to end with `--no-router`, or
  does some step still require the router?
- Is `Build project structure` on Lightweight fast enough to sit inside a
  15-minute budget? It creates a `.venv` and pip-installs `ai_router`.
- Is it honest to make a developer's *first* impression the tier without
  cross-provider verification — the framework's main differentiator? Or is
  "verification exists and here is where you turn it on" the right Hello World
  ending?

### 6.2 What actually produces the sample repository? *(unresolved)*

The Copilot review specifies "a prepared sample repository, one already-authored
implementation set". It does not say where that comes from. Candidates:

| Mechanism | Cost | Cost of being wrong |
| --- | --- | --- |
| A GitHub template repo the reader clicks *Use this template* on | small | Needs a GitHub account on the first run; unusable for ADO-only staff |
| A `Dabbler: Try a sample project` command that scaffolds a fixture locally | medium | No host, no account, no network — **arguably the best first run** |
| `git clone` a fixture repo | small | Reintroduces git on the first run, which contradicts §2 |

I lean to the **local scaffold command**: it needs no account, no host and no
network, which removes the entire host-branching problem from the first run —
the very thing that made ADO staff abandon the tutorial. It is also the most
product work.

**Trade nobody has stated:** a prepared sample means the reader never scaffolds
their own repository on the first run. That is right for time-to-value, but it
changes what Hello World *proves* — it demonstrates the session loop, not setup.
Setup must then be genuinely good in `adopt-dabbler.md`, because it is no longer
rehearsed anywhere first.

### 6.3 Does 1 → 4 documents re-create the problem Set 106 just solved? *(structural risk)*

Set 106 collapsed **1,968 lines across three documents into one**, explicitly to
kill a hand-maintained "shared spine" drift discipline where every edit had to be
mirrored across two near-identical host cuts. This proposal goes back to four
documents.

I believe the cases are different — 106 split by **host** (two near-identical
walkthroughs of the same thing, guaranteed duplication); this splits by
**audience and stage** (different content, minimal overlap). But the risk is real
and it deserves a hostile read.

**The one genuine duplication surface is the AI session loop**, which appears in
Hello World *and* in `team-workflow.md`. Proposed mitigation: Hello World shows it
once concretely and **links** rather than explains; `team-workflow.md` owns the
explanation. Any second explanation of the same mechanic is the drift tax
returning and should be rejected in review.

**Check:** is there a third overlap I have not named?

### 6.4 What happens to the nine video scene scripts?

Set 106 Session 3 authored `docs/tutorials/video/` — a README, six scene scripts
1:1 with the current tutorial's six parts, and two alternate takes. If that
tutorial becomes `adopt-dabbler.md`, the scripts follow it and their traceability
tables still hold. A new short Hello World would want its own script, but likely
one scene rather than six.

This is a real cost nobody has counted, and it argues for relocating rather than
rewriting the existing tutorial.

### 6.5 Does the product fix still belong in the first increment?

§3 records the four-step module dance as a first-run defect. **But if Hello World
uses a prepared sample repository with an already-authored set, the reader never
creates a module at all** — the gap moves entirely to `adopt-dabbler.md`, whose
readers are past the first run.

<!-- drift-guard:allow-begin -->
That materially lowers the cost of increment A: it can be **docs-only**, with the
one-form module creation deferred. Unless §6.2 resolves against a prepared
sample, in which case the module dance is back on the critical path.
<!-- drift-guard:allow-end -->

## 7. Risks of the model, and mitigations

Carried from the v1 consult; unchanged by review, and none of these puts git back
on the main path.

| Risk | Mitigation |
| --- | --- |
| Conflict or non-fast-forward with no mental model | Fail closed with a structured panel naming repo, branch, base, conflicting files, plus a guided repair path |
| Wrong checkout / detached HEAD | Persistent status badge (repo root, worktree, branch, tracking); refuse on detached HEAD |
| `add -A` sweeps in secrets | Explicit file list, secret scan, refuse on unignored credential-like files |
| Bad rebase, unrecoverable | Keep rebase off the main path entirely — `pull --ff-only` locally, server-side merges only |
| Auto-complete merges a newer head than the reviewer saw | Show head SHA when arming; require stale-approval dismissal on new commits |
| Stale branches/worktrees accumulate invisibly | A health view for open worktrees and merged-but-unfinalized branches |

## 8. Sequencing

| | Increment | Contains | Depends on |
| --- | --- | --- | --- |
| **A** | **First-run rescue** | New short `hello-world.md`; relocate the current tutorial to `adopt-dabbler.md`; repair the seven inbound links; sample-repo mechanism per §6.2 | §6.1 and §6.2 resolved |
| **B** | **Two-action git** | `Start work`, `Send for review`, state-based reconciliation, host-native auto-complete; `ensureManagedChange()`; one-form module creation; strip raw git from `adopt-dabbler.md` | A |
| **C** | **Team workflow split** | Extract `team-workflow.md` from the adoption guide | B |

**A alone satisfies §2's success criterion.** B and C improve the adoption and
team experience, which is where staff go *after* they are convinced — not before.

Deferred indefinitely: dashboards, PR templating, teaching raw git anywhere but
Reference.

## 9. Decisions for the operator

1. **Set 106 Session 4 — the 2-hour live walk of the current tutorial.** Its
   acceptance test has arguably already run informally and failed: staff
   attempted the tutorial and abandoned it. Options: run as planned (validates
   content that survives relocation, but not the thing that is broken); defer
   until the new Hello World exists and walk that instead (~15 min); or run a
   reduced governance-only walk. **Recommendation: defer.** This changes Set
   106's scope, so it is the operator's call.
2. **Azure DevOps as primary?** Copilot dissolved rather than answered this:
   neither host should dominate Hello World, and the adoption guide can be
   ADO-first for this team. If §6.2's local-scaffold option is chosen, Hello
   World has no host at all and the question disappears for the first run.
3. **`azure-pipelines.yml`.** Still unwritten. ADO teams hit a dead end at the CI
   step of the adoption guide exactly as they did in the tutorial. No reviewer
   addressed it. It is a small, self-contained deliverable that unblocks a whole
   host.
4. **Budget.** Increment A is one session set; B is another; C is small. The
   operator has stated a hard constraint. **A is the one that addresses the
   stated failure**; B and C can wait indefinitely without staff noticing.

## 10. Already shipped — do not re-propose

- **Host branching is structural, not asides.** All seven Azure DevOps
  instructions are now symmetric `▸ Your host — do ONE of these` blocks, with a
  banner stating the either/or rule once. This was the specific defect that made
  ADO staff abandon the tutorial.
- **The ADO CI dead end is named**, with an explicit stopping point, rather than
  discovered mid-flow.

## 11. Cost of analysis so far

One routed GPT-5.4 architecture consult, **$0.49**. Two evaluation rounds
performed by the operator outside the router. The host-branching fix and both
mechanical gates (123 and 358 checks) are pure local Python and cost nothing.
