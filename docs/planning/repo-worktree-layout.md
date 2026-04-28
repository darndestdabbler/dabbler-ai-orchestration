---
title: Repo Worktree Layout — Bare-Repo + Flat Worktrees
status: standard
last-updated: 2026-04-28
applies-to: all dabbler repos
---

# Repo Worktree Layout — Bare-Repo + Flat Worktrees

> **Standard for all dabbler repos as of 2026-04-28.** Replaces the
> earlier sibling-worktree pattern (`../<repo>-<slug>` worktrees as
> top-level directories in `~/source/repos`). New repos adopt this
> layout from the start; existing repos migrate at convenience using
> the recipe below.

## Target Layout

```
<container-name>/             # the project's only top-level dir
  .bare/                      # bare git repo — the real git data
  .git                        # text file: "gitdir: ./.bare"
  main/                       # main worktree
  <session-set-slug>/         # one dir per active in-flight session-set worktree
  <session-set-slug>/         # ...
```

`<container-name>` matches the GitHub repo name (e.g.,
`dabbler-access-harvester`). The container has **no source files at
its top level** — every working tree is a subdirectory.

## Why This Layout

The legacy sibling-worktree pattern creates one top-level directory in
`~/source/repos` per worktree. With multiple repos each running parallel
session sets, this proliferates fast: nine concurrent harvester worktrees
plus a main means ten siblings, all named `dabbler-access-harvester-*`.
The bare-repo + flat-worktree layout collapses each project back to a
single container and makes the "worktree is ephemeral" model concrete:
when a session set merges, the worktree directory is removed; the
container does not grow.

Other benefits:

- **`cd <slug>` from the container root** — fast switching between
  in-flight branches without typing the repo name twice.
- **One IDE workspace per container** — the workspace file lives at the
  container root; per-worktree window state is configured per VS Code
  window rather than per workspace file.
- **Cleaner `git worktree list`** — output groups under one repo rather
  than scanning siblings.

## Setup Recipe — Fresh Repo

```bash
cd ~/source/repos
mkdir <container-name>
git clone --bare <remote-url> <container-name>/.bare
cd <container-name>
echo "gitdir: ./.bare" > .git

# CRITICAL: fix the bare-clone refspec
git -C .bare config remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*'
git -C .bare fetch origin

# add the main worktree
git worktree add main main
```

After this, `cd main` is your working tree. Build, test, and edit from
inside `main/` — never from the container root.

## Migration Recipe — Existing Repo With Sibling Worktrees

For a repo currently using `~/source/repos/<repo>-<slug>` siblings:

1. **Cleanup pass.** For every merged session-set branch, run
   `git worktree remove ../<repo>-<slug>`, `git branch -d
   session-set/<slug>`, and `git push origin --delete
   session-set/<slug>`. Goal: only the `main` worktree remains.
2. **Build new container as a sibling.** `mkdir <repo>-new`,
   `git clone --bare <remote> <repo>-new/.bare`, write the `.git`
   pointer file, fix the refspec (see above), then
   `git worktree add main main` inside `<repo>-new`.
3. **Migrate local-only git state.** Copy any local-only entries from
   the old `.git/config` (credential helpers, branch upstream tracking,
   etc.) into the new `.bare/config` via `git config`. Copy any
   non-default hooks. Preserve stashes if present.
4. **Recreate untracked-but-needed files** in the new `main/`. The bare
   clone won't carry anything that wasn't committed: virtual envs
   (`.venv/`), large gitignored sample fixtures, runtime metrics
   logs, etc. Recreate venvs fresh — never copy across, paths are
   absolute.
5. **Smoke test in the new container** before swapping. Build, test,
   run any project-specific import sanity checks (e.g., the ai-router
   import test for harvester / orchestration repos).
6. **Atomic swap.**
   ```bash
   mv <repo>     <repo>-old
   mv <repo>-new <repo>
   ```
   Run the two `mv`s as **separate commands**, not chained — when the
   first one fails on a file lock, you don't want the second one
   running blind and producing a nested directory.
7. **Repair worktree links.** The worktree's gitdir pointer files store
   absolute paths and become stale after the rename. Fix with:
   ```bash
   git -C .bare worktree repair ../main
   ```
8. **Clean and rebuild.** `obj/` directories under each project bake in
   absolute paths to the previous build location and won't resolve
   after the swap. Delete every `bin/` and `obj/` and rebuild.
9. **Keep `<repo>-old/` for ~1 week** as a rollback safety net before
   deleting.

## Cleanup Convention — Worktree At Session-Set Close

A worktree is a tool for in-flight work, not a record of past work.
When a session set's last session merges to main, the cleanup is:

```bash
cd <container-name>          # from any working tree, then cd to container
git worktree remove <slug>   # from container root
git branch -d session-set/<slug>
git push origin --delete session-set/<slug>
```

This convention is mirrored in
[`docs/ai-led-session-workflow.md`](../ai-led-session-workflow.md) so
the workflow itself enforces it; this file owns the *why* and the
recipe, the workflow doc owns the *when*.

## Gotchas

### The refspec fix is the #1 failure mode

`git clone --bare` defaults to `+refs/heads/*:refs/heads/*`, which
collides with worktrees that want to claim `refs/heads/<branch>` as
their own checked-out branch. Without the refspec rewrite, the first
`git worktree add` after a fetch will refuse with
`fatal: '<branch>' is already checked out`. **Always run the refspec
fix immediately after `git clone --bare`.**

### Build from inside a worktree, never the container root

The container holds no source — `dotnet build`, `npm install`,
`python -m pytest`, etc. all need a working tree. From the container
root these fail with confusing "no project file" errors. Always
`cd main/` (or `cd <slug>/`) first.

### IDE workspace files hardcode absolute paths

`.code-workspace` files, `.vs/` solution state, `.idea/` project files,
and similar pin themselves to the absolute path that was current when
they were created. After a migration that renames the container, these
must be recreated or hand-edited. Don't migrate them — let the IDE
rebuild on first open.

### `git worktree repair` needs a hint when both ends moved

`git worktree repair` (no arguments) only works when one side of the
worktree↔bare link is still where it expects. After a container rename,
both ends moved together, so repair finds nothing to fix. Pass the
worktree path explicitly: `git -C .bare worktree repair ../main`.

### `obj/` directories carry absolute paths through a rename

Generated source files and incremental build state under each project's
`obj/Debug/<tfm>/` reference the path they were generated under. After
a container rename, the build will fail with errors like
`Source file '...\old-container-name\...\Generated.cs' could not be
found`. Always `dotnet clean` (or `find . -type d \( -name bin -o -name
obj \) -exec rm -rf {} +`) and rebuild from the new location.

### Windows file locks during the swap

`mv` on Windows will fail if any process has the directory as its
current working directory or holds an open file handle inside.
Common holders that survive an "I closed the IDE" pass:

- Persistent build server processes (MSBuild `/nodemode:1` workers,
  `VBCSCompiler.exe`). Run `dotnet build-server shutdown` to release
  them; they'll respawn on the next build.
- Background polling loops left over from prior agent sessions
  (`bash -c "until [ -f ... ]; do sleep 5; done"`). Find them via
  `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine
  -match '<path>' }`.
- VS Code windows opened via File→Open Recent (no command-line
  reference to the path).
- McAfee/Defender scanning files in the directory.
- Windows Search indexer.

If diagnosis takes more than a few minutes, **a reboot is the cleanest
fix** — both the old and new containers are safe across a restart.

**First thing to try before manual diagnosis:**

```bash
python -m ai_router.utils cleanup-dev-orphans [--dry-run] [--yes] [--match-path PATTERN]
```

(Run from inside any worktree where `ai-router/` is importable.) This
helper, in `dabbler-ai-orchestration/ai-router/utils.py` Section 5,
shuts down all `dotnet` build servers (MSBuild `/nodemode:1` workers
and `VBCSCompiler.exe`), kills stale Claude Code background polling
loops (the `bash -c "until [...]; do sleep 5; done"` zombies that
survive an exited Claude session), and cleans up orphan `conhost.exe`
processes — the three orphan classes most likely to be holding the
lock. The optional `--match-path` filter narrows the polling-loop
kill to a specific repo or container. Each category is also runnable
on its own (`kill-dotnet-build-servers`, `kill-stale-claude-polls`,
`kill-conhost`).

**Each category prompts for confirmation by default** — important
because shutting down dotnet build servers is machine-wide (any active
build in another VS Code window will lose its server mid-flight) and
killing all conhost.exe closes every active terminal you have open,
not just orphans. Review the count and the prompt text before
agreeing. Pass `--yes` to skip prompts when you know the state is
safe (e.g., scripted use or fresh-boot cleanup); pass `--dry-run` to
see what would happen without prompting or acting.

## TODO

- Add `tools/init-worktree-repo.sh` automating the fresh-repo recipe
  (clone --bare → refspec fix → `.git` pointer → first worktree add).
- Add `tools/migrate-to-worktree-layout.sh` automating Steps 1–5 of the
  migration recipe (cleanup pass → build new container → smoke test),
  leaving the human to do the atomic swap and post-rename verification
  manually.
