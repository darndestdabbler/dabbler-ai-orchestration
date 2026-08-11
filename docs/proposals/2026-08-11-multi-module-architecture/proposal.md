# Multi-module, multi-developer architecture — the question put to two providers

> **Status:** consultation record, 2026-08-11. **Ruling: Option A** — one
> repository, worktrees, modules. See [`verdict.md`](verdict.md).
>
> This file records what was asked, so the two consensus files can be read
> against it — **including a factual error in the prompt**, which both
> reviewers caught and which materially weakened the case for the option
> that lost.

## Why it was asked

The operator needs multi-developer, multi-module support. **Real
developers are waiting**, and his constraint is one word: **SIMPLE**.

> *"Two or more developers could work on semi-independent modules at the
> same time and then integrate them later. My developers are OK with
> manually executing git commands associated with the modules, but it
> would be helpful to provide them with `copy prompt` context menu items
> for modules. And it would be more convenient to make the module
> authoring happen via context menu — either via copy prompts for the AI
> engine to assist or via executing python scripts."*

And the question that prompted the consultation:

> *"That said, I am mindful that AI is so powerful that we could start
> with individual repos and then merge them later. So, if that is a better
> approach, let me know."*

## The two options as put to the reviewers

**Option A — one repo, modules + worktrees.** What exists today:
`docs/modules.yaml` declares modules with `codeRoots`; session sets are
stamped with a module; the documented standard is a main checkout at
`~/source/repos/<repo>/` with worktrees at
`~/source/repos/<repo>-worktrees/<slug>/`. Tooling: `moduleAuthoring.ts`
(2,458 lines) plus 7 VS Code commands.

**Option B — separate repos per module, merged later.** Each developer
gets an independent repo with its own session sets and its own framework
install. Integration happens later by some unspecified means.

## The constraints given

Three distinct sources of concurrency pain, only one of which is
file-level conflict:

1. **The shared git index.** Observed twice on 2026-08-10: a bare `git commit` writes the *whole index*, sweeping another agent's staged work into an unrelated commit — 1,167 lines in one case.
2. **Whole-tree test runs.** *(This framing was wrong — see below.)*
3. **Shared append-only files.** `ai_router/CHANGELOG.md`, `docs/planning/lessons-learned.md` and `ai_router/router-metrics.jsonl` are appended by every session. Per-set files are naturally partitioned and fine.

Plus: bus factor of one, a successor reluctant to take the codebase over,
and therefore unusual weight on simplicity.

## The error in the prompt, and why it matters

The prompt asserted that concurrent sessions interfere through the test
tree — *"if session A runs the suite while session B has a file
half-edited, A gets failures unrelated to its own work."*

**Both reviewers rejected this, and they are right.** `pytest.ini` sets
`testpaths = ai_router/tests`, which is **relative**, so a run scans only
its own worktree. Worktrees are separate directories on disk with their
own index and HEAD, sharing only the append-only object store.

Gemini named it *"the half-edited file fallacy"*: if a run is disturbed by
another session's uncommitted files, the two are in the **same** worktree,
which is a hygiene failure rather than an architectural constraint. That
is exactly the condition observed on 2026-08-10 — two agents in one
checkout — and it does not generalise.

**Consequence:** constraint 2 does not distinguish the options. Option B
was credited with solving a problem Option A does not have, so the case
for B was weaker than the prompt implied. Both reviewers reached Option A
*despite* being handed that error, which strengthens rather than weakens
the ruling.

## Method

Both reviewers received an **identical prompt**, read access to this repo,
and an instruction to give a decisive recommendation and argue against
the option they did not pick. Neither was told what the other said. Both
were told **not to run any test suite** — other work held the machine's
CPU.

| reviewer | model | elapsed |
| :--- | :--- | ---: |
| [`consensus-gemini-3.1-pro.md`](consensus-gemini-3.1-pro.md) | `gemini-3.1-pro-preview` | 127s |
| [`consensus-gpt-5.6-sol.md`](consensus-gpt-5.6-sol.md) | `gpt-5.6-sol` | 368s |
