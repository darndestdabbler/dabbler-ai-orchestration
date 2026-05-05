# Cross-provider design review — `python -m ai_router.worktree`

> **Routing target:** GPT-5.4 Medium via Codex AND Gemini-2.5 Pro via Gemini Code Assist, independently. Same prompt to both. No cross-pollination.
> **Routing surface choice:** IDE-agent routing for both providers is deliberate. Per the lesson recorded in [docs/case-studies/cross-provider-collaboration-spike-016.md → "Surface choice (API vs IDE agent) was load-bearing"](../../case-studies/cross-provider-collaboration-spike-016.md#surface-choice-api-vs-ide-agent-was-load-bearing), design-review questions about how new code should fit existing conventions benefit from providers actually inspecting the codebase rather than reasoning from prose. Both providers should read the existing `ai_router/` module conventions before answering.
> **Format expected:** Structured response with the section headers requested below; markdown OK. The "caveats" section is required.

---

## System / context framing

You are a senior Python engineer being consulted on the design of a new
CLI module. You are independently giving your best recommendation;
another engineer is being consulted in parallel and their answer will
be compared against yours. Disagree with the prevailing approach if
you have grounds to. Prefer concrete suggestions with file paths and
function signatures over vague principles.

The operator is a solo developer on Windows (PowerShell 7+) who runs
this codebase and ~3 closely-related repos. The CLI you're reviewing
is the structural fix for a regression class that surfaced in Set 016
(see context below). Code quality matters more than speed for this
piece — we are deliberately routing for design review BEFORE writing
any of the implementation.

## Background — why we need this CLI

Set 016 was a cross-provider spike that landed two outcomes:

1. **A new canonical worktree layout** ("sibling-worktrees-folder",
   internally called "Option B"): main checkout at
   `~/source/repos/<repo>/`, worktrees at
   `~/source/repos/<repo>-worktrees/<slug>/`, branch named
   `session-set/<slug>`. This replaced a bare-repo + flat-worktree
   pattern that proved over-engineered for the operator's actual
   scale of usage. Full doc: [docs/planning/repo-worktree-layout.md](../../planning/repo-worktree-layout.md).
2. **A diagnosis** that the original drift (worktree at
   `.claude/worktrees/...`) happened because no canonical-path
   enforcement existed. Documentation alone wasn't enough — humans
   and agents inventing paths under time pressure circumvented the
   docs. **The structural fix is tooling that makes the canonical
   path the easiest path.** That's this CLI.

The full reasoning is in [docs/case-studies/cross-provider-collaboration-spike-016.md](../../case-studies/cross-provider-collaboration-spike-016.md).
The original design spec is in [docs/session-sets/016-harvester-cleanup-and-worktree-policy-spike/proposal.md §4.1](../016-harvester-cleanup-and-worktree-policy-spike/proposal.md).

## Codebase you should inspect before answering

You have file-system access via your IDE-integrated agent. **Please
actually read these files** before answering the questions; the
codebase conventions matter for several of the questions below.

- `ai_router/utils.py` — pattern for "subprocess wrapper around git/dotnet/etc. with safety prompts." The CLI under review will follow a similar shape. Section 5 (`cleanup-dev-orphans` and friends) is most relevant.
- `ai_router/session_state.py` — example of a module that wraps file-system state with a public API consumed by other ai_router modules + tests. The CLI may want similar public helpers.
- `ai_router/session_events.py` — append-only ledger pattern; not directly relevant but illustrates the codebase's style for safe-by-default file ops.
- `ai_router/close_session.py` — the canonical "CLI module with subcommands and gate checks" pattern. This CLI will look similar in shape.
- `ai_router/tests/test_utils.py`, `ai_router/tests/test_close_session_*.py`, `ai_router/tests/conftest.py` — the test pattern. Particular note: tests use real filesystems via `tempfile.TemporaryDirectory` rather than mocking, and use real git operations rather than mocking subprocess calls.
- `ai_router/__init__.py` — public exports. Whether `worktree` should re-export anything is one of the questions below.
- `docs/planning/repo-worktree-layout.md` — the canonical layout this CLI enforces. Read at minimum the "Worktree lifecycle" and "Drift recovery" sections.

## Proposed design

```text
python -m ai_router.worktree open <slug> [--base <branch>]
python -m ai_router.worktree close <slug> [--keep-branch] [--delete-remote]
python -m ai_router.worktree list [--json]
```

### `open <slug>`

- Resolves the main repo root from cwd (works whether invoked from main or from any existing worktree of the same repo).
- Computes the canonical worktree path: `<repo-parent>/<repo>-worktrees/<slug>/`.
- Refuses if a worktree already exists at that path or if the slug is registered with git at any path.
- Determines branch name:
  - If `--base <branch>` is given: creates `session-set/<slug>` from the named base branch.
  - If `--base` is omitted: creates `session-set/<slug>` from the repo's default branch (resolved via `git symbolic-ref refs/remotes/origin/HEAD`).
- Creates `<repo>-worktrees/` container if it doesn't exist (`mkdir -p` semantics).
- Runs `git worktree add <canonical-path> -b session-set/<slug>` (or without `-b` if branch already exists).
- Prints a confirmation including the cd command the operator should run next.

### `close <slug>`

- Resolves the canonical worktree path for `<slug>`.
- Verifies a worktree exists at that path AND is registered with git there.
- **Pre-flight refuses to proceed if any of:**
  - Worktree has uncommitted changes (`git status --porcelain` non-empty)
  - Branch has unmerged commits vs base (`git rev-list base..HEAD` non-empty)
  - Branch has unpushed commits (if upstream is configured)
- On refusal, prints a pointer to `python -m ai_router.cancel_session <slug>` (the queued companion CLI for the messy path).
- On clean state:
  - `git worktree remove <canonical-path>`
  - `git branch -d session-set/<slug>` (unless `--keep-branch`)
  - If `--delete-remote`: `git push origin --delete session-set/<slug>` after explicit y/N confirmation
  - If `<repo>-worktrees/` is now empty: `rmdir` (refuses gracefully if not empty, which is the right safety check)

### `list [--json]`

- Runs `git worktree list --porcelain` and parses.
- Classifies each worktree:
  - `main` — at the repo root
  - `canonical` — at `<repo-parent>/<repo>-worktrees/<slug>/`
  - `drift` — anywhere else
- Default output: human-readable table grouped by class.
- `--json` output: machine-readable for tooling consumption.

### Implementation notes (proposed)

- Module: `ai_router/worktree.py`
- Tests: `ai_router/tests/test_worktree.py`
- argparse-based CLI with subparsers
- Subprocess invocation of `git` — no GitPython dependency (matches existing `ai_router/utils.py` style)
- Helpers factored for reuse by future `repo_layout_check` and `cancel_session` CLIs:
  - `find_main_repo_root(cwd: Path) -> Path` — resolves main checkout from any worktree's cwd
  - `canonical_worktree_path(repo_root: Path, slug: str) -> Path` — `<repo-parent>/<repo>-worktrees/<slug>/`
  - `enumerate_worktrees(repo_root: Path) -> list[WorktreeInfo]` — parses `git worktree list --porcelain`, classifies each
  - `is_clean(worktree_path: Path) -> CleanlinessReport` — uncommitted + unmerged + unpushed checks
  - `default_branch(repo_root: Path) -> str` — resolves origin's default branch
- Tests use `tempfile.TemporaryDirectory` + real `git init` for fixtures (matching the existing test pattern).

## Six questions

Please answer each in its own section. Be concrete and specific.

### Question 1 — Helper-factoring granularity

The proposed helpers (`find_main_repo_root`, `canonical_worktree_path`,
`enumerate_worktrees`, `is_clean`, `default_branch`) are factored
anticipating reuse by future tooling (`repo_layout_check`,
`cancel_session`). Is this the right granularity?

- **Too fine?** Would you collapse some helpers? Which?
- **Too coarse?** Would you split any further? E.g., `is_clean` returns three independent checks — should those be separate functions?
- **Module boundary:** Should the helpers live in `ai_router/worktree.py` (module-private with underscore-prefixed names; other modules import them) or in a new shared `ai_router/worktree_layout.py` (public utility)?
- **Comparison to existing patterns:** how does `ai_router/utils.py` factor its helpers? Does the worktree CLI fit that style or call for a different one?

### Question 2 — `--keep-branch` default vs opt-in

The proposed design has `--keep-branch` as opt-in (default behavior:
local branch is deleted when the worktree is closed). Is this right?

- **Argument for opt-in (current proposal):** the canonical convention is "session set is done → branch is deleted (locally and remotely)." Keeping the branch by default would silently drift away from that convention.
- **Argument against (counter-proposal):** branch deletion is irreversible-without-recovery; defaulting to it could cost real work if the operator misuses the CLI on a still-active branch.
- The pre-flight already refuses to close a dirty/unmerged/unpushed worktree, so by the time `close` proceeds, the branch is provably safe to delete. Does that pre-flight cover the operator-mistake case?

### Question 3 — Canonical-path enforcement: hard refusal or `--force-non-canonical` opt-out?

The proposed design hard-refuses to create a worktree at a non-canonical path. Should there be an escape hatch?

- **Argument for hard refusal (current proposal):** the entire point of the CLI is to make non-canonical paths impossible-by-default. An opt-out flag undermines the structural guarantee.
- **Argument against (counter-proposal):** edge cases exist (operator deliberately wants a worktree outside the canonical layout for migration testing, exploratory work, etc.). Refusing absolutely sends them back to raw `git worktree add`, where they then have no path enforcement at all — *worse* outcome than an opt-out flag.
- Is there a third path (e.g., an environment variable `AI_ROUTER_WORKTREE_ALLOW_NON_CANONICAL=1` that enables non-canonical paths but logs a warning)?

### Question 4 — `close` failure modes for remote-branch deletion

The proposed design runs `git push origin --delete session-set/<slug>` only when `--delete-remote` is passed AND after explicit y/N confirmation. What should happen on common failure modes?

- **Network error / auth failure:** retry, or fail-with-instructions?
- **Remote moved upstream (the branch was already deleted, or someone else pushed to it):** silent success, warning, or error?
- **Permission denied (the operator doesn't have delete permissions on the remote):** fail-with-instructions to delete via web UI?
- **Local branch was already deleted but remote-delete fails:** how does the CLI surface the partially-completed state?

### Question 5 — `list` output format

The proposed design defaults to a human-readable table grouped by classification (`main`, `canonical`, `drift`). Two specific sub-questions:

- **Path normalization:** absolute paths or relative paths in the human output? Absolute is unambiguous; relative is more readable from the cwd. Which is right?
- **`--json` schema:** what should the JSON output shape be? Propose a concrete schema. (We'll use this in `repo_layout_check` later, so it should be future-proof.)

### Question 6 — End-of-session verification: route or skip?

This CLI is being landed under a session-set workflow that normally
runs an end-of-session cross-provider verification route (a final
review of the diff by a model from a different provider before
commit). For tooling code with comprehensive tests, is that route
worth running, or are tests sufficient?

- **Argument for skip (current proposal):** tests are the canonical verification surface for tooling; the design-review consultation up-front is more valuable per dollar than a post-hoc diff review; the existing test pattern in this codebase is comprehensive enough that a passing test suite is strong evidence of correctness.
- **Argument against (counter-proposal):** the test suite has blind spots that an independent reviewer would catch (UX issues, error-message clarity, undocumented assumptions). Even comprehensive tests don't replace independent eyes.

If you recommend running the verification route, what specific things
should the verifier focus on (vs. relying on tests for the rest)?

---

## Output format you should follow

Six question-sections in order, plus caveats:

```
## Q1 — Helper-factoring granularity
[your answer; reference specific files in ai_router/ that informed your view]

## Q2 — --keep-branch default vs opt-in
[your answer]

## Q3 — Canonical-path enforcement strictness
[your answer]

## Q4 — Remote-delete failure modes
[your answer]

## Q5 — list output format
[your answer; include the proposed --json schema]

## Q6 — Verification: route or skip
[your answer]

## Caveats / things you'd want to know before being more confident
[anything you couldn't determine from the prompt or codebase that would change your answer]
```

The "caveats" section is required — be honest about where your answer
is conjecture vs grounded in actual codebase inspection.
