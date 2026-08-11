# Verdict — multi-module, multi-developer architecture

> **Ruling: Option A — one repository, one worktree per active session,
> modules declared in `modules.yaml`.** Both reviewers reached it
> independently, from an identical prompt, with no knowledge of each
> other.
>
> **Not adopted: Option B** (separate repos merged later) — *except* in
> the one case named in §3, where it is correct but must be permanent.
>
> **Date:** 2026-08-11. **Reviewers:** `gemini-3.1-pro-preview` (127s),
> `gpt-5.6-sol` (368s). Records in the sibling consensus files.

---

## 1. The decisive argument

Option B's appeal was that it eliminates two concurrency problems
outright. **One of those problems does not exist**, and the other is
solved by Option A anyway.

> **"One repo" does not mean one shared working directory.** With one
> worktree per active session, Option A already isolates the git index and
> HEAD, edited files, test execution trees, and per-set state. **Option
> B's main claimed concurrency advantage is already available under A**
> without fragmenting project history. — Sol

The prompt asserted that concurrent sessions interfere through the test
tree. **That was wrong.** `pytest.ini` sets `testpaths = ai_router/tests`
— a *relative* path — so a run scans only its own worktree, and worktrees
are separate directories on disk. Gemini called it *"the half-edited file
fallacy"*: if one session's run is disturbed by another's uncommitted
files, they are in the **same** worktree. That is a hygiene failure, and
it is exactly what happened on 2026-08-10 with two agents in one
checkout — not a property of the architecture.

Both reviewers chose Option A **while holding a prompt biased toward B.**

And on the "merge later" premise itself:

> Deferring integration creates Integration Hell. **AI does not solve
> Integration Hell; it accelerates it.** — Gemini

> Option B solves concurrency by **postponing integration**. That is not
> simplicity. — Sol

## 2. What Option B would have cost

Beyond the obvious, and neither reviewer needed prompting for these:

| cost | why it bites |
| :--- | :--- |
| **Session-set ID collisions** | Both repos create `121-`, `122-`. `resolve_set.py:150-156` already calls a duplicate prefix *"a repo-authoring bug."* Consolidation means renaming historical identities and repairing prerequisite references. |
| **"AI lobotomy"** (Gemini's term) | `lessons-learned.md` is per-repo. Developer B's agent stays blind to what A just learned and **repeats the mistake A just solved.** |
| **Framework version skew** | One repo upgrades the PyPI package to fix a bug; the other does not. Packaging eases distribution; it does not synchronise upgrades. |
| **Verification does not transfer** | A merged artifact is a *new* artifact. Every integration test and cross-provider verification runs again. |
| **Non-atomic refactors** | A shared contract change becomes ordered PRs, releases and compatibility windows instead of one reviewed change. |
| **The Explorer is not multi-repo safe** | Modules from roots are merged without retaining repository identity (`SessionSetsModel.ts:390-477`), while lifecycle commands use `workspaceFolders[0]` — **a context action can target the wrong root.** |

> *"Merge later by whatever means" is not a complete architecture. The
> omitted integration mechanism is its most consequential component.* — Sol

## 3. Where the answer flips — and it is not "merge later"

If the modules are **genuinely independent deployables** — stable public
interfaces, independent ownership, independent release schedules, no
shared code — then separate repos are correct. **But then they stay
separate permanently**, integrating through versioned packages and
contract tests. Both reviewers were explicit on this.

> *"Semi-independent now, merge later" is still Option A territory.* — Sol

The operator's description — semi-independent modules, integrated later —
falls on the Option A side by both readings.

## 4. Module authoring — Python CLI, not copy-prompts

The reviewers split here, and **Sol's position is adopted**, because it
rests on a finding in the tree rather than a preference.

Gemini proposed copy-prompts only: the extension copies *"create module
X, update `modules.yaml`"* to the clipboard and an AI executes it. Zero
TypeScript to maintain.

Sol's objection is decisive:

> **Do not use AI prompts for create/rename/delete.** Those operations
> require deterministic validation, rollback, numbering, running-session
> refusal, and sanctioned cancellation. Prompts are appropriate for
> creative plan/decomposition content, **not transactional mutation.**

**And the finding that settles it — verified against the tree:**
`cancelLifecycle.ts:296` calls `atomicWriteFile(statePath, …)`. **TypeScript
writes `session-state.json` today**, reached via the `deleteModule` path.
The framework's central invariant — *Python owns every mutation of
`session-state.json`* — is **already violated in shipped code.**

So moving module lifecycle to Python is not cleanup. **It restores an
invariant the project believes it already has.**

**The adopted surface:**

| where | what |
| :--- | :--- |
| **Python** | `python -m ai_router.modules create \| rename \| delete \| assign-sets` — validation, rollback, numbering, running-session refusal |
| **Extension** | open module plan; open `modules.yaml`; **copy module-plan prompt; copy decomposition / next-work prompt**; thin launchers that pass an explicit repo root and slug, show output, refresh |

That satisfies the operator's ask — copy-prompts *and* context-menu
authoring — while removing lifecycle logic from `moduleAuthoring.ts`
(2,458 lines) rather than adding to it. **Prompts for creative content;
CLI for transactional mutation.**

## 5. The problem neither architecture solves

Both reviewers raised it independently, and it is the highest-value
finding after §4:

> **Two individually verified branches can fail when combined.** The close
> gate proves the current branch snapshot (`gate_checks.py:1755-1811`); it
> cannot prove that two concurrently verified branches work together.

**This is a process rule, not code.** Serialize merges, and test the
*prospective merge commit* rather than both parents. A **merge captain**
is the cheapest form.

## 6. Adopted: the next-week protocol

Deliberately not tooling. Both reviewers converged on this shape.

1. **One repo.** Both developers clone it.
2. **Commit `modules.yaml` and module ownership** before concurrent work begins. One developer per module.
3. **One worktree and one short-lived branch per active session set.** This is the whole isolation story — not a nicety.
4. **Reserve session-set numbers in chat or an issue before scaffolding.** The collision is real and `resolve_set.py` treats it as a bug.
5. **Freeze shared configuration** during the sprint; route cross-module changes through one integration owner.
6. **Small PRs, merged daily.** Deferring is the failure mode.
7. **One merge captain:** rebase on current `main` → run the full suite after the last change → verify, close, push → **merge one PR at a time** → require CI on the merge result.
8. **Preserve both sides** when resolving append-only conflicts.

> **Do not build test selectors, physical module directories, repository
> consolidation tooling, or new TypeScript lifecycle machinery next week.**

## 7. Adopted: partition the append-only files

The one conflict Option A genuinely has, with a fix that needs no
architecture change:

> Instead of everyone appending to `CHANGELOG.md` or
> `router-metrics.jsonl`, have sessions write individual files to a
> directory (`changelogs/121.md`, `metrics/121.json`). **A 10-line Python
> script can concatenate them on demand.** — Gemini

This is the same shape as Set 120's projection — *partitioned sources,
one computed view* — and it removes a guaranteed merge conflict from
every concurrent session. **`lessons-learned.md` is the exception**: it is
already headed for deletion under the executable-or-drop rule, so it
should not be re-engineered.

## 8. Standing decisions from this consultation

1. **One repository. One worktree per active session.** Not one shared working directory — that distinction is the entire ruling.
2. **"Semi-independent now, integrate later" is a monorepo requirement**, not a multi-repo one. Separate repos are for permanently separate deployables.
3. **Transactional mutation goes through Python.** Prompts are for creative content. `session-state.json` has exactly one writer.
4. **Merge results must be verified, not just branches.** Individually green is not jointly green.
5. **Do not re-litigate Option B** without a mechanism for the integration itself. "Merge later by whatever means" is the part that was missing.

## 9. Follow-on work this creates

Unscheduled, and none of it blocks the next-week protocol:

- **`cancelLifecycle.ts` writes `session-state.json`** (`:296`) — an existing violation of the writer invariant. Should be fixed regardless of the module work; belongs with the extension carve or Set 120.
- **`python -m ai_router.modules`** — the lifecycle CLI (§4).
- **Partition the append-only files** (§7).
- **Module boundaries are descriptive, not enforced** — no scope check exists. Related to guidance candidate C-001's enforcement lint.
- **Scaffolded CODEOWNERS and monorepo CI are inert** in the cold-start fixture — comment-only, no tests run until manually adapted. A consumer adopting multi-module today inherits both.
