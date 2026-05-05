---
title: Repo Worktree Layout — Sibling Worktrees Folder
status: standard
last-updated: 2026-05-05
applies-to: all dabbler repos
supersedes: v1 of this doc dated 2026-04-28 (bare-repo + flat-worktree pattern, retired after Set 016)
---

# Repo Worktree Layout — Sibling Worktrees Folder

> **Standard for all dabbler repos as of 2026-05-05.** Replaces the
> bare-repo + flat-worktree pattern adopted on 2026-04-28 (which
> proved over-engineered for this operator's actual usage scale; see
> [docs/case-studies/cross-provider-collaboration-spike-016.md](../case-studies/cross-provider-collaboration-spike-016.md)
> for the full reasoning). Existing repos migrate at convenience using
> the recipe below; new repos adopt this layout from the start.

## TL;DR

The repo's main checkout lives at `~/source/repos/<repo>/` and **never
moves**, regardless of whether you're working sequentially or running
parallel session sets. When you need a worktree, it goes into a
sibling container `~/source/repos/<repo>-worktrees/<slug>/`. When the
session set closes, the worktree is removed; if it was the last one,
the container goes too. Glance-readable, low-ceremony, no bare-repo
magic.

## Target layout

```
~/source/repos/
  <repo>/                       # main checkout, never moves
    .git/                       # standard, not a bare-repo pointer
    ...source files...
  <repo>-worktrees/             # sibling container, only exists when worktrees are active
    <session-set-slug>/         # one subfolder per active worktree, named for the session set
    <other-slug>/               # another, if running multiple in parallel
```

`<repo>` matches the GitHub repo name (e.g.,
`dabbler-access-harvester`). The repo folder itself is a normal
working tree — `git status`, `git log`, builds, and tests all work
exactly as if there were no worktree pattern in use at all.

The `<repo>-worktrees/` container is **created on demand** when the
first session-set worktree is opened and **deleted when the last one
closes**. It does not persist as an empty folder.

## Rules

1. **Main never moves.** `~/source/repos/<repo>/` is the main checkout.
   Whether you're doing sequential or parallel work doesn't change
   that path.
2. **All worktrees go in the sibling container.** Never under
   `.claude/worktrees/`, never as direct siblings of `<repo>/`,
   never inside `<repo>/` itself.
3. **Worktree folder name = session-set slug.** No prefix, no
   suffix. The container name (`<repo>-worktrees/`) already tells the
   reader these are worktrees.
4. **Branch name = `session-set/<slug>`.** Matches the canonical
   convention so cleanup can find the branch from the slug.
5. **Cleanup-on-close is mandatory.** When a session set's last
   session merges, the worktree is removed AND the local branch is
   deleted AND the remote branch (if pushed) is deleted. The
   convention is enforced because the original "proliferation"
   problem that retired the bare-repo pattern was actually a cleanup-
   discipline problem, not a layout problem.

## Why this layout

The previous bare-repo + flat-worktree pattern paid structural tax
even on sequential-work days — main lived in a subdirectory of a
container, the container could accumulate stranded files at its root,
and tools that assumed "the repo root is the working tree root"
needed adjustment. That tax was justified only at scale (5+
concurrent worktrees per repo); for the typical 1–2 in-flight session
sets per repo, the simpler pattern wins on every dimension that
matters:

- **Main never moves.** Stable IDE workspace files, stable terminal
  cwds, stable absolute paths in any tool that pins them.
- **Glance-readable.** `ls ~/source/repos/` shows one folder per repo
  plus, at most, one `<repo>-worktrees/` container per repo with
  active worktrees. No mixed-purpose siblings to mentally parse.
- **Visual quarantine of clutter.** Worktrees aren't intermixed with
  real repo folders in `~/source/repos/`. The `<repo>-worktrees/`
  container is its own visual signal.
- **Clean off-ramp.** If a repo decides parallel work isn't paying
  off, removing the last worktree and the empty container restores
  the repo to plain single-tree state. Nothing irreversible.
- **Standard git.** No bare-repo refspec fix. No `.git` pointer file.
  No `core.bare`. Just `git clone`, `git worktree add`, `git worktree
  remove`.

## Decision matrix — when other patterns might fit

The retired bare-repo + flat-worktree pattern (and two other patterns
considered alongside it) are documented here so the choice is visible
rather than implicit. The canonical recommendation for dabbler repos
is the sibling-worktrees-folder pattern above, but the alternatives
are not wrong universally — they're wrong for this operator's profile.

| Pattern | Main location | Worktree location | When this pattern fits | Why it's not canonical here |
|---|---|---|---|---|
| **Sibling worktrees folder (canonical)** | `~/source/repos/<repo>/` | `~/source/repos/<repo>-worktrees/<slug>/` | 0–4 concurrent worktrees per repo, solo developer, "main never moves" matters | — |
| **Repo-level siblings** | `~/source/repos/<repo>/` | `~/source/repos/<repo>-<slug>/` | Worktrees used very rarely (once a year for a hotfix); zero-ceremony preferred | Recreates the proliferation problem in `~/source/repos/` if cleanup discipline slips; mixes worktree dirs with real repo dirs in the listing |
| **Worktrees subdirectory of main** | `~/source/repos/<repo>/` | `~/source/repos/<repo>/worktrees/<slug>/` (with `worktrees/` in `.gitignore`) | Single-folder containment is required; team is willing to maintain editor/search exclusions | IDE indexers (VS Code search, language servers) double-index nested worktrees because their `.git` is a pointer file; deeper path nesting hits Windows path-length limits faster; `git clean -fd -e worktrees` becomes the required habit because plain `git clean -fdx` is unsafe for loose untracked files in `worktrees/` (registered worktrees themselves are protected by Git, but loose files are not) |
| **Bare-repo + flat-worktree (retired)** | `~/source/repos/<repo>/main/` | `~/source/repos/<repo>/<slug>/` | 5+ concurrent long-lived worktrees per repo as routine; container-collapse benefit outweighs main-moves-into-subdir tax | Pays structural tax (main in subdir) every day, not just on parallel-work days; tends to accumulate stranded files at the container root if discipline slips; over-engineered for this operator's 1–2 typical concurrent worktrees |

The full reasoning for choosing the sibling-worktrees-folder pattern
over the alternatives is in
[docs/case-studies/cross-provider-collaboration-spike-016.md](../case-studies/cross-provider-collaboration-spike-016.md),
which captures the cross-provider consultation (Gemini-2.5 Pro,
GPT-5.4 Medium via Codex, orchestrator Opus 4.7) that converged on
this recommendation.

## Setup recipe — fresh repo

Standard `git clone`. Nothing special.

```bash
cd ~/source/repos
git clone <remote-url> <container-name>
cd <container-name>
# main worktree is already at the repo root; no .bare/, no .git pointer file
```

After this, you're working from `~/source/repos/<container-name>/`
exactly as you would in any normal git repo. The
`<container-name>-worktrees/` container does not yet exist; it will
be created on demand when you open your first session-set worktree.

## Worktree lifecycle

> **Once `python -m ai_router.worktree open|close <slug>` exists**
> (queued in
> [docs/session-sets/016-harvester-cleanup-and-worktree-policy-spike/change-log.md](../session-sets/016-harvester-cleanup-and-worktree-policy-spike/change-log.md)),
> all worktree creation and removal goes through that CLI rather than
> through raw `git worktree` commands. The CLI enforces the canonical
> path and branch naming, removing the class of regressions that
> caused Set 016. Until that CLI ships, follow the manual recipes
> below precisely.

### Open a worktree

From `~/source/repos/<repo>/` (the main checkout):

```bash
mkdir -p ../<repo>-worktrees
git worktree add ../<repo>-worktrees/<slug> -b session-set/<slug>
cd ../<repo>-worktrees/<slug>
```

The `-b session-set/<slug>` form creates the new branch in the same
operation. If the branch already exists, drop the `-b` flag.

### List worktrees

From any worktree (main or a session-set worktree):

```bash
git worktree list
```

Expect to see the main worktree plus one entry per active session-set
worktree, all under the canonical paths. Anything outside
`<repo>/` itself or `<repo>-worktrees/<slug>/` is **drift** and
should be addressed via the drift-recovery section below.

### Close a worktree

When a session set's last session merges:

```bash
cd ~/source/repos/<repo>             # back to main
git worktree remove ../<repo>-worktrees/<slug>
git branch -d session-set/<slug>
git push origin --delete session-set/<slug>

# If <repo>-worktrees/ is now empty, remove the container:
rmdir ../<repo>-worktrees             # only removes if empty
```

The `rmdir` succeeds only when the container has no other active
worktrees, which is the right safety check — the container should
never persist empty.

If the worktree has uncommitted or unmerged work and you're
**cancelling** the session set rather than completing it, use
`python -m ai_router.cancel_session` (queued tool, see
[proposal.md §4.2](../session-sets/016-harvester-cleanup-and-worktree-policy-spike/proposal.md))
instead of the raw recipe above. The cancel CLI handles preservation
(stash + bundle + manifest archive) before removal.

## Drift recovery

When the worktree topology has drifted from canonical — non-canonical
paths, stranded directories, or a mix of layouts — the recovery
recipe depends on what's drifted.

### A worktree at a non-canonical path

Use `git worktree move` to relocate it.

```bash
# From the main worktree:
git worktree list                    # confirm the non-canonical path
mkdir -p ../<repo>-worktrees
git worktree move \
  <current-non-canonical-path> \
  ../<repo>-worktrees/<slug>
git worktree list                    # verify the move
```

The branch comes along automatically. Any work in the worktree is
preserved.

If the worktree has uncommitted work, **commit or stash it first** —
`git worktree move` refuses to operate on a dirty worktree.

### Empty stranded directories at the repo root

Plain filesystem cleanup, but always probe before deleting.

```bash
# Probe to verify the directory is genuinely empty:
ls -la <suspect-dir>                 # should show only . and ..
git worktree list                    # confirm it's not a registered worktree

# Then delete:
rmdir <suspect-dir>                  # rmdir refuses non-empty dirs (the right safety check)
```

Do **not** use `rm -rf <suspect-dir>` for this case. If `rmdir`
fails because the directory has unexpected content, investigate
before applying force.

### Mixed-layout containers (worktrees in two patterns at once)

If a repo has both `<repo>/` AND a `<repo>/main/` (i.e., partially
migrated, or both the canonical and the old bare-repo pattern present
at once), audit before fixing:

```bash
git worktree list                    # how does git see the topology?
ls -la ~/source/repos/<repo>/
ls -la ~/source/repos/<repo>-worktrees/ 2>/dev/null
```

The right resolution depends on which pattern has the live work; see
the **Migration Recipe — Option D → Option B** section below for the
complete clone-and-swap recipe used in Set 015 Session 3.

### General drift audit (once tooling exists)

`python -m ai_router.repo_layout_check` (queued in Set 016's
change-log) will report anomalies automatically. Until that ships,
the manual probes above suffice for one-off drift cases.

## Deactivate worktree mode — collapse to single working tree

When parallel worktrees aren't paying off and you want sequential-only
workflow:

1. **Close all active worktrees** using the lifecycle recipe above.
   Each `git worktree remove` + `git branch -d` + `git push origin
   --delete` removes one worktree completely.
2. **Verify clean state.**
   ```bash
   git worktree list                 # should show only the main worktree
   ls ~/source/repos/                # <repo>-worktrees/ should be gone
   ```
3. **You're done.** The repo is now a plain git repo with one
   working tree. No conversion is required because the canonical
   sibling-worktrees-folder pattern doesn't introduce any structure
   that needs reversing — when there are no worktrees, the layout IS
   sequential single-tree.

This is the off-ramp the bare-repo + flat-worktree pattern lacked.
With the sibling-worktrees-folder pattern, "deactivating" parallel
work is the absence of action, not a separate procedure.

## Migration recipes

### Migration recipe — sibling-worktree pattern (Option A) → canonical (Option B)

For a repo currently using `~/source/repos/<repo>-<slug>` siblings:

1. **Cleanup pass.** For every merged session-set branch, run
   `git worktree remove ../<repo>-<slug>`, `git branch -d
   session-set/<slug>`, and `git push origin --delete
   session-set/<slug>`. Goal: only the `main` worktree remains.
2. **Move any in-flight worktrees to the canonical container.**
   ```bash
   cd ~/source/repos/<repo>
   mkdir -p ../<repo>-worktrees
   git worktree move ../<repo>-<slug> ../<repo>-worktrees/<slug>
   ```
   Repeat for each in-flight worktree. `git worktree move` keeps
   the branch and any uncommitted work intact.
3. **Verify.**
   ```bash
   git worktree list
   ls ~/source/repos/
   ```

This migration is non-destructive and reversible — `git worktree
move` is symmetric.

### Migration recipe — bare-repo + flat-worktree (Option D) → canonical (Option B)

For a repo currently in the retired bare-repo pattern (a `<repo>/`
container with `.bare/`, `.git` pointer, and `<repo>/main/` as the
main worktree). Strategy: **clone-and-swap**, not collapse-in-place.
Build a fresh sibling repo, smoke-test it, atomically swap, preserve
the old container as a rollback safety net for ~1 week.

This recipe is from Set 016's spike; the full reasoning (including
why clone-and-swap beats collapse-in-place for safety) is in
[docs/case-studies/cross-provider-collaboration-spike-016.md](../case-studies/cross-provider-collaboration-spike-016.md)
and the operational details in
[proposal.md §3](../session-sets/016-harvester-cleanup-and-worktree-policy-spike/proposal.md).

**Setup variables (PowerShell).**

```powershell
$old = 'C:\Users\denmi\source\repos\<repo>'
$new = 'C:\Users\denmi\source\repos\<repo>-new'
$wts = 'C:\Users\denmi\source\repos\<repo>-worktrees'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
```

**1. Snapshot and preserve local-only state.**

```powershell
git -C $old worktree list --porcelain
git -C $old branch --list
git -C $old stash list
```

If `<old>/main/` has uncommitted work, preserve it as a patch:

```powershell
git -C (Join-Path $old 'main') diff --binary > '..\<repo>-main-working-copy.patch'
```

Archive any valuable untracked files from `<old>/main/` separately.

**2. Build the new repo as a sibling.**

```powershell
git clone <remote-url> $new
git -C $new switch <main-branch-name>
New-Item -ItemType Directory -Force -Path $wts | Out-Null
```

**3. Recreate any local-only branches** (e.g., session-set branches
that were never pushed):

```powershell
git -C $new fetch "$old\.bare" <branch-name>:<branch-name>
```

Repeat for each local-only branch.

**4. Create the canonical worktrees under the sibling container.**

```powershell
git -C $new worktree add (Join-Path $wts '<slug>') session-set/<slug>
```

Repeat for each in-flight worktree.

**5. Carry over local-only Git config.** Identify what matters for
your repo (typically credential helpers, branch upstream tracking,
and IDE-specific config like `vscode-merge-base`), then apply with
`git config` against `$new`. Custom hooks and stash entries also need
manual transfer if present.

**6. Reapply preserved dirty changes.**

```powershell
git -C $new apply '..\<repo>-main-working-copy.patch'
git -C $new status --short --branch
```

If the patch does not apply cleanly, **stop here and resolve before
any rename**.

**7. Smoke test the new repo.**

```powershell
git -C $new status --short --branch
git -C $new worktree list --porcelain
# Run normal build/test from $new and from each new worktree.
```

**8. Release file locks before the swap.**

```powershell
python -m ai_router.utils cleanup-dev-orphans --dry-run --match-path <repo>
python -m ai_router.utils cleanup-dev-orphans --yes --match-path <repo>
dotnet build-server shutdown
```

Close any VS Code window or terminal with cwd inside `$old`.

**9. Atomic swap as separate rename operations.**

```powershell
Rename-Item -LiteralPath $old -NewName '<repo>-old'
Rename-Item -LiteralPath $new -NewName '<repo>'
```

Run as **separate commands**, not chained — when the first fails on
a file lock, you don't want the second running blind and producing a
nested directory.

**10. Repair worktree metadata after rename.**

```powershell
$repo = "$old"   # the now-renamed-back path
git -C $repo worktree repair (Join-Path $wts '<slug>')
git -C $repo worktree list --porcelain
```

**11. Verify, then delete `<repo>-old/` after ~1 week** as the
rollback safety net.

### Rollback (D → B migration)

If the new repo misbehaves after cutover:

```powershell
Rename-Item -LiteralPath '<old-path>' -NewName '<repo>-bad'
Rename-Item -LiteralPath '<old-path>-old' -NewName '<repo>'
```

Repair worktree metadata in the restored old container, continue
working. Because the old container is left untouched until late in
the migration, rollback risk is low.

## Gotchas

### Build from inside a worktree, never from the container root

This applies to the canonical layout when you have multiple worktrees
open: `dotnet build`, `npm install`, `python -m pytest`, etc. all
operate on the working tree's `cwd`. From a worktree's directory
they Just Work; from the wrong directory you get confusing errors.

The canonical sibling-worktrees-folder pattern makes this less of an
issue than the bare-repo pattern did (because main IS the repo root,
not a subdirectory of a container), but if you're working in a
session-set worktree, your `cwd` should be inside that worktree, not
in main.

### IDE workspace files hardcode absolute paths

`.code-workspace` files, `.vs/` solution state, `.idea/` project
files, and similar pin themselves to the absolute path that was
current when they were created. After a migration that renames the
container (e.g., during D → B above), these must be **recreated, not
migrated**. Don't migrate them — let the IDE rebuild on first open.

### `obj/` directories carry absolute paths through a rename

Generated source files and incremental build state under each
project's `obj/Debug/<tfm>/` reference the path they were generated
under. After a container rename, the build will fail with errors
like `Source file '...\old-path\...\Generated.cs' could not be
found`. Always `dotnet clean` (or
`find . -type d \( -name bin -o -name obj \) -exec rm -rf {} +`) and
rebuild from the new location after any migration.

### `git worktree repair` needs a hint when both ends moved

`git worktree repair` (no arguments) only works when one side of the
worktree↔repo link is still where it expects. After a container
rename, both ends moved together, so repair finds nothing to fix.
Pass the worktree path explicitly:
`git -C <repo> worktree repair <repo>-worktrees/<slug>`.

### Windows file locks during migration

`Rename-Item` on Windows fails if any process has the directory as
its current working directory or holds an open file handle inside.
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

(Run from inside any worktree where `ai_router/` is importable.) This
helper, in `dabbler-ai-orchestration/ai_router/utils.py` Section 5,
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

## Related documents

- [docs/case-studies/cross-provider-collaboration-spike-016.md](../case-studies/cross-provider-collaboration-spike-016.md)
  — full case study and reasoning behind this layout choice.
- [docs/session-sets/016-harvester-cleanup-and-worktree-policy-spike/proposal.md](../session-sets/016-harvester-cleanup-and-worktree-policy-spike/proposal.md)
  — full technical proposal driving this doc and the queued
  worktree/cancel/layout-checker tooling.
- [docs/ai-led-session-workflow.md](../ai-led-session-workflow.md)
  — when worktrees are used in the session-set workflow; this doc
  owns the *where* and *how*.

## Version history

- **v2 — 2026-05-05.** This document. Sibling-worktrees-folder
  pattern adopted as canonical based on Set 016 cross-provider
  consultation. Added decision matrix, drift recovery, deactivate-
  mode, and Option D → Option B migration recipe. Removed bare-repo
  refspec-fix and `.git`-pointer-file gotchas (no longer relevant for
  the canonical pattern).
- **v1 — 2026-04-28.** Bare-repo + flat-worktree pattern adopted as
  canonical. Retired in v2 after one week of operational experience
  showed the structural tax (main moves into a subdirectory, drift
  accumulates at the container root) outweighed the container-collapse
  benefit at this operator's scale of usage.
