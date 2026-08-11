# Consensus — GPT-5.6 Sol

> **Model:** `gpt-5.6-sol`. **Elapsed:** 368s.
> **Prompt:** identical to Gemini 3.1 Pro's; see [`proposal.md`](proposal.md)
> → *Method*.
>
> **Verbatim summary.** This reviewer cited repository line numbers; the
> load-bearing ones were checked against the tree and are accurate.
> Editorial framing confined to this block.

## Recommendation — Option A

> Use **one repository with short-lived session-set branches and separate
> worktrees.** Reject Option B for modules that will later form one
> application.
>
> Option B solves concurrency by **postponing integration**. That is not
> simplicity; it moves ordinary small merges into a future consolidation
> project with incompatible histories, duplicated framework artifacts, and
> stale verification.

**And the observation that dissolves Option B's main appeal:**

> **"One repo" does not mean one shared working directory.** With one
> worktree or clone per active session, Option A already isolates: the git
> index and HEAD, edited files, test execution trees, and per-set state
> and logs. **Therefore Option B's main claimed concurrency advantage is
> already available under A** without fragmenting project history.

## What breaks first

| architecture | first failure | next failure |
| :--- | :--- | :--- |
| **A** | merge conflicts in `CHANGELOG.md`, `lessons-learned.md`, `router-metrics.jsonl`, occasionally `modules.yaml` | **two individually green branches fail when combined**, because neither tested the prospective merge result |
| **B** | contracts, dependencies, framework versions and guidance drift immediately | consolidation collides on root configuration, default session sets, histories, tests, duplicated framework files |

> Under A, neither the shared index nor the half-edited test tree should
> fail if every developer uses a separate worktree. The remaining test
> problem is **integration freshness**, not filesystem interference.
>
> The close gate only proves the current branch snapshot
> (`gate_checks.py:1755-1811`). **It cannot prove that two concurrently
> verified branches work together.**
>
> **Blocking fix:** serialize merges or use a merge queue. Test the
> prospective merge commit, not merely both parent branches.

## Option B's hidden costs — eight, in its order

1. **Verification does not transfer.** A subtree-merged artifact is a *new* artifact; integration tests and cross-provider verification must run again.
2. **Framework skew.** Package installation eases distribution; it does not ensure synchronized upgrades.
3. **Session-set identity collisions.** Separate bootstraps all create `001-…`, `002-…`; consolidation requires renaming historical identities and repairing prerequisites.
4. **Non-atomic refactors.** A shared contract change becomes ordered PRs, releases, dependency bumps and compatibility windows instead of one reviewed change.
5. **Guidance divergence.** Lessons in one repo never reach other developers absent a synchronization process nobody has designed.
6. **Lost provenance.** Manual ports weaken commit, PR, blame and verification-artifact traceability.
7. **Multiplied administration.** CI, branch protection, dependency updates, releases, permissions, CODEOWNERS, issue tracking — repeated per repo.
8. **The Explorer is not safely multi-repo today.** Modules from roots are merged without retaining repository identity (`SessionSetsModel.ts:390-477`); module rows carry only a slug (`workExplorerTreeModel.ts:159-165`) while lifecycle commands use `workspaceFolders[0]`, so **a context action can target the wrong root.**

> *"Merge later by whatever means" is not a complete architecture. The
> omitted integration mechanism is its most consequential component.*

## Where the answer flips

- **One application, shared libraries, schemas, migrations or coordinated release → Option A.**
- **Genuinely independent deployables with stable public interfaces and independent release schedules →** separate repos, *"but keep them separate permanently. Integrate through versioned APIs/packages and contract tests. Do not plan a later source consolidation."*

> **"Semi-independent now, merge later" is still Option A territory.**

## Minimum module-authoring surface

**Keep in the extension:** open module plan; open `modules.yaml`; copy
module-plan prompt; copy decomposition / next-work prompt; thin launchers
for lifecycle commands.

**Put lifecycle in Python:**

```text
python -m ai_router.modules create | rename | delete | assign-sets
```

The extension passes an explicit repository root and module slug, shows
the output, and refreshes.

> **Do not use AI prompts for create/rename/delete.** Those operations
> require deterministic validation, rollback, numbering, running-session
> refusal, and sanctioned cancellation. **Prompts are appropriate for
> creative plan/decomposition content, not transactional mutation.**

**And the finding that makes this structural rather than cosmetic:**

> Delete currently reaches a TypeScript cancellation writer, and that
> writer **directly writes `session-state.json`** —
> `moduleAuthoring.ts:2249-2252`, `cancelLifecycle.ts:294-297,441-475`.
> That contradicts the stated Python-only writer boundary. **Moving
> lifecycle to Python is not merely cleanup; it restores the
> architecture.**

*(Verified: `cancelLifecycle.ts:296` calls `atomicWriteFile(statePath, …)`.)*

## Simplest workable process for next week

1. Commit `modules.yaml` and module ownership before concurrent work begins.
2. One developer per module.
3. Every active set gets its own worktree and short-lived branch.
4. **Reserve full session-set slugs in a shared issue or chat before scaffolding.**
5. Freeze shared configuration during the sprint; route cross-module changes through one integration owner.
6. Merge small PRs daily.
7. **One merge captain:** update the PR from current `main`; run the full suite after the last change; verify, close, push; merge one PR at a time; require aggregate CI on the merge result.
8. Preserve both sides when resolving append-only conflicts.

> Do not build test selectors, physical module directories, repository
> consolidation tooling, or new TS lifecycle machinery next week.

## What is being missed

**Blocking**

- **Merge-result verification.** Individually verified branches can fail together; add a serialized merge protocol or merge queue.
- **Module boundaries are descriptive, not enforced** — the planning doc admits no scope check exists (`module-organized-projects-recommendation.md:299-307`).
- **Scaffolded ownership and CI are inert.** CODEOWNERS is comment-only and the monorepo CI workflow runs no tests until manually adapted.

**Non-blocking but important**

- **Number allocation is contradictory.** Concurrent scaffolds can pick the same prefix, while `resolve_set.py:150-156` calls that *"a repo-authoring bug."* Reserve numbers centrally until resolved.
- **Global append-only files are the wrong granularity.** Partition per set/module and aggregate.
- **Context actions need explicit root identity.** Never infer the target repository from the first workspace folder.
