## Q1 — Cleanup sequence for the harvester anomalies

My default recommendation for Anomaly A is: preserve first, relocate second, decide merge-vs-retire later. I would not merge it into `main` by default right now, because the current primary worktree is dirty and the PoC branch is 36 commits behind its merge base target. I also would not discard it by default, because the branch has three unique commits, was never pushed, and appears to contain real exploratory value.

Recommended sequence for the current harvester state:

1. Pre-flight and freeze the state.

```powershell
$repo = 'C:\Users\denmi\source\repos\dabbler-access-harvester'
$wt = Join-Path $repo '.claude\worktrees\vba-symbol-resolution-session-1'
git -C $repo worktree list --porcelain
git -C (Join-Path $repo 'main') status --short --branch
git -C $wt status --short --branch
git -C $repo rev-list --left-right --count main...worktree-vba-symbol-resolution-session-1
```

Before touching anything, close any VS Code window or terminal whose cwd is inside `.claude\worktrees\vba-symbol-resolution-session-1`.

2. Create rollback anchors before any destructive step.

```powershell
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
git -C $repo branch "backup/worktree-vba-symbol-resolution-session-1-$stamp" worktree-vba-symbol-resolution-session-1
git -C $repo bundle create "..\harvester-vba-symbol-resolution-session-1-$stamp.bundle" worktree-vba-symbol-resolution-session-1
```

That gives you both a local ref and an external portable backup.

3. Relocate the live worktree out of `.claude\worktrees` to the canonical sibling path for the current Option D layout.

Pre-flight checks:
- Confirm the target path does not already exist.
- Confirm `git worktree list` still shows the source path.

```powershell
$target = Join-Path $repo 'vba-symbol-resolution-session-1'
if (Test-Path $target) { throw "Target already exists: $target" }
git -C $repo worktree move $wt $target
git -C $repo worktree list --porcelain
git -C $target status --short --branch
```

4. Remove the two stranded empty directories only after verifying they are truly empty and not registered worktrees.

```powershell
$empty1 = Join-Path $repo 'docs\session-sets\workflow-package-pilot'
$empty2 = Join-Path $repo 'tmp\feedback'
Get-ChildItem -Force $empty1
Get-ChildItem -Force $empty2
Remove-Item -LiteralPath $empty1 -Force
Remove-Item -LiteralPath $empty2 -Force
```

I would not use recursive deletion here unless the emptiness check failed and you intentionally re-ran with `-Recurse`.

5. Only after the topology is clean, decide Anomaly A’s final disposition.

Default disposition order:
- Best default: keep the branch, relocate the worktree, and review whether the PoC was already superseded by later `main` work before merging anything.
- Merge-and-retire: only if the three commits are still wanted after diff review against current `main`.
- Discard: only if the operator explicitly confirms the PoC has no remaining value and the backup ref + bundle exist.

If the branch should be merged later, I would first clean the primary worktree, then integrate from `main/` with a normal merge commit:

```powershell
git -C (Join-Path $repo 'main') status --short --branch
git -C (Join-Path $repo 'main') merge --no-ff worktree-vba-symbol-resolution-session-1
```

If the branch should be retired without merge after review:

```powershell
git -C $repo worktree remove $target --force
git -C $repo branch -D worktree-vba-symbol-resolution-session-1
```

Pre-flight checks before each destructive step:
- Before `worktree remove --force`: confirm the only uncommitted files are the regenerable `session-state.json` artifacts.
- Before `branch -D`: confirm the backup branch exists and the bundle file exists.
- Before deleting filesystem-only directories: confirm `git worktree list` does not mention them and `Get-ChildItem -Force` shows no contents.

Rollback:
- If `git worktree move` fails halfway, run `git -C $repo worktree repair $wt` or `git -C $repo worktree repair $target`, then re-check `git worktree list --porcelain`.
- If the branch is deleted accidentally, restore it from the backup ref or bundle:

```powershell
git -C $repo branch worktree-vba-symbol-resolution-session-1 "backup/worktree-vba-symbol-resolution-session-1-$stamp"
# or
git -C $repo fetch "..\harvester-vba-symbol-resolution-session-1-$stamp.bundle" worktree-vba-symbol-resolution-session-1:worktree-vba-symbol-resolution-session-1
```

- If the relocated worktree is removed accidentally, recreate it from the restored branch:

```powershell
git -C $repo worktree add $target worktree-vba-symbol-resolution-session-1
```

## Q2 — Compare the four named layout options (A / B / C / D)

My ranking for this operator is:

1. Option B — Nephew-and-Niece Worktrees
2. Option A — Repo-Level Sibling Worktrees
3. Option C — Son-and-Daughter-Level Worktrees
4. Option D — Subrepo-Level Sibling Worktrees

I would recommend Option B as the new standard for this operator’s scale.

Why B wins here:
- `~/source/repos/<repo>/` stays the primary checkout forever.
- Extra worktrees are glance-readable and grouped in one obvious sibling folder.
- VS Code opened on the main repo does not automatically recurse into sibling worktrees, so you avoid most double-indexing and search pollution.
- The off-ramp back to sequential mode is simple: remove the last worktree and optionally delete `<repo>-worktrees/`.

Option-by-option:

Option A:
- Strongest virtue: simplest mental model and almost no Git trickiness.
- Main drawback: `~/source/repos/` gets noisy once several repos each have 1-2 active worktrees.
- Fit: good when only one repo is “hot” at a time and root-level clutter is acceptable.

Option B:
- Best balance for this operator.
- It preserves the fixed main path, groups auxiliary work, and keeps repo-internal tooling operating on just the main checkout by default.
- Fit: ideal for 0-3 active worktrees per repo and a solo operator who wants low ceremony plus clear topology.

Option C:
- Git itself can handle it, but I would not make it canonical here.
- It places extra worktrees inside the main repo’s directory tree, which is exactly where search tools, IDE watchers, language servers, and ad-hoc scripts naturally recurse.
- Fit: niche. Acceptable only if you strongly value one self-contained repo folder and are willing to maintain explicit exclusions in editor and tooling config.

Option D:
- Its best feature is collapsing everything into one container.
- Its biggest cost is structural tax even when you are not using parallelism: the primary checkout is no longer `~/source/repos/<repo>/`.
- Fit: worthwhile only when one repo routinely carries several long-lived concurrent worktrees and the sibling-directory sprawl is a bigger problem than the moved-main topology.

### Option C technical validation

On Git behavior alone, Option C is technically feasible.

What I validated locally on `git version 2.51.0.windows.2`:
- With `worktrees/` in `.gitignore`, `git status` from the main worktree ignores the nested worktrees as expected.
- `git clean -fdx -n` still reported `Would skip repository worktrees/feature` for a registered nested worktree. In other words, Git recognized the nested worktree as another repository and did not offer to delete it, even with `-x`.

My conclusion on the specific sub-questions:

- `git status`:
  Yes, it ignores the nested registered worktree if the parent `worktrees/` directory is ignored.

- `git clean -fdx`:
  On current Git for Windows, it skips registered nested worktrees. That said, I still would not normalize `git clean -fdx` at repo root under Option C. The safe command shape is either path-scoped cleaning of known build-output directories or an explicit exclude:

```powershell
git -C <repo> clean -fd -e worktrees/ -n
git -C <repo> clean -fd -e worktrees/
```

  Registered worktrees are protected; random loose files under `worktrees/` are not.

- IDE indexers:
  This is where Option C loses points. VS Code search, file watchers, and many language servers treat nested worktrees as ordinary nested folders unless you exclude them. The nested `.git` pointer file does not reliably stop generic tooling from indexing them. Expect duplicate search hits, duplicated symbol indexing, and heavier watcher load unless you add exclusions.

- Windows-specific concerns:
  The extra path depth increases path-length pressure for already-deep project trees and build outputs. File-lock diagnosis is also worse because a process holding a nested child worktree can block operations on the parent repo directory. Git can cope; surrounding tools become more fragile.

### When each option is a fit

- Option A is a fit when the operator usually has 0-1 active worktrees per repo and does not mind a somewhat noisier `~/source/repos/`.
- Option B is a fit when the operator wants fixed main paths plus modest parallelism. That is this case.
- Option C is a fit when single-folder containment matters more than tooling simplicity, and the team is willing to maintain editor/search exclusions.
- Option D becomes worth it when a repo routinely has 4+ concurrent worktrees for sustained periods, or when directory proliferation across many repos is the dominant pain. For this operator’s current scale, I would not choose D as the default.

### Migration cost from current D to B

Rough effort: moderate, about 30-90 minutes of focused manual work if the primary worktree is first brought to a clean state.

Risk: low-to-medium.
- Lower than average because the harvester currently appears to have no custom hooks and no stash entries.
- Higher than average because the primary `main/` worktree is currently dirty, and Windows path locks can complicate the rename/cutover.

## Q3 — Migration recipe to your recommended option

My recommendation is Option B, so the target layout is:

```text
~/source/repos/
  dabbler-access-harvester/
  dabbler-access-harvester-worktrees/
    vba-symbol-resolution-session-1/
```

I would treat this as a documented manual recipe, not a one-shot script. The failure modes are too stateful: dirty worktrees, local-only branches, absolute-path IDE state, and Windows file locks. A helper can validate preconditions and print the commands, but the cutover itself should stay human-supervised.

### Precondition

Do not start the migration while `main/` has uncommitted changes unless you first preserve them explicitly. The primary worktree is currently dirty, so the first safe move is either:
- commit the work,
- stash it intentionally,
- or export a patch and copy any required untracked files.

For a patch backup:

```powershell
$old = 'C:\Users\denmi\source\repos\dabbler-access-harvester'
git -C (Join-Path $old 'main') diff --binary > '..\harvester-main-working-copy.patch'
```

If there are valuable untracked files in `main/`, archive them separately before proceeding.

### Step-by-step migration

1. Snapshot the old repo and preserve the local-only worktree branch.

```powershell
$old = 'C:\Users\denmi\source\repos\dabbler-access-harvester'
$new = 'C:\Users\denmi\source\repos\dabbler-access-harvester-new'
$wts = 'C:\Users\denmi\source\repos\dabbler-access-harvester-worktrees'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'

git -C $old worktree list --porcelain
git -C $old branch "backup/worktree-vba-symbol-resolution-session-1-$stamp" worktree-vba-symbol-resolution-session-1
git -C $old bundle create "..\harvester-vba-symbol-resolution-session-1-$stamp.bundle" worktree-vba-symbol-resolution-session-1
```

2. Build the new normal repo as a sibling.

```powershell
git clone https://github.com/darndestdabbler/dabbler-access-harvester.git $new
git -C $new switch migrate/dabbler-ai-router-pip
New-Item -ItemType Directory -Force -Path $wts | Out-Null
```

3. Recreate the local-only branch in the new repo from the old bare repo or bundle.

Using the old repo directly while it still exists:

```powershell
git -C $new fetch "$old\.bare" worktree-vba-symbol-resolution-session-1:worktree-vba-symbol-resolution-session-1
```

4. Create the new canonical worktree under the sibling worktrees folder.

```powershell
git -C $new worktree add (Join-Path $wts 'vba-symbol-resolution-session-1') worktree-vba-symbol-resolution-session-1
git -C (Join-Path $wts 'vba-symbol-resolution-session-1') status --short --branch
```

That minimizes downtime. The old anomalous worktree can stay untouched until the new one exists.

5. Carry over local-only Git config that actually matters.

From the current harvester state, the important repo-local items appear to be:
- `credential.https://github.com.username`
- branch tracking for `migrate/dabbler-ai-router-pip`
- optional VS Code merge-base hints

Concrete commands:

```powershell
git -C $new config credential.https://github.com.username darndestdabbler
git -C $new config branch.migrate/dabbler-ai-router-pip.remote origin
git -C $new config branch.migrate/dabbler-ai-router-pip.merge refs/heads/migrate/dabbler-ai-router-pip
git -C $new config branch.migrate/dabbler-ai-router-pip.vscode-merge-base origin/main
git -C $new config branch.worktree-vba-symbol-resolution-session-1.vscode-merge-base origin/main
```

I did not see custom hooks or stash entries in the current `.bare`, so there may be nothing else to migrate there.

6. If you preserved dirty changes from the old `main/`, reapply them in the new repo now.

```powershell
git -C $new apply '..\harvester-main-working-copy.patch'
git -C $new status --short --branch
```

If the patch does not apply cleanly, stop here and resolve it before any rename.

7. Smoke test the new repo before cutover.

```powershell
git -C $new status --short --branch
git -C $new worktree list --porcelain
```

Then run the project’s normal build/test steps from `$new` and from the new sibling worktree if needed.

8. Close VS Code windows and release file locks. If needed:

```powershell
python -m ai_router.utils cleanup-dev-orphans --dry-run --match-path dabbler-access-harvester
python -m ai_router.utils cleanup-dev-orphans --yes --match-path dabbler-access-harvester
dotnet build-server shutdown
```

9. Perform the swap as separate rename operations.

```powershell
Rename-Item -LiteralPath $old -NewName 'dabbler-access-harvester-old'
Rename-Item -LiteralPath $new -NewName 'dabbler-access-harvester'
```

10. Repair worktree metadata after the rename.

```powershell
$repo = 'C:\Users\denmi\source\repos\dabbler-access-harvester'
git -C $repo worktree repair (Join-Path $wts 'vba-symbol-resolution-session-1')
git -C $repo worktree list --porcelain
```

11. Re-open the repo from the new main path, verify both worktrees, and only then remove the old anomalous copy from the old container.

At this point the new repo is authoritative. The old container should remain as a rollback safety net for several days.

### Edge cases and gotchas

- Windows file locks are the biggest practical risk. Old VS Code windows, terminal cwd handles, `VBCSCompiler.exe`, MSBuild servers, Defender, and Search Indexer can all block the rename.
- The old anomalous worktree under `.claude\worktrees\...` should not be deleted until the new sibling worktree is verified.
- Any IDE workspace files or `.vs` state that pinned the old container path should be recreated, not migrated.
- If you created the new worktree before the final rename, `git worktree repair` after the swap is mandatory.

### Rollback

Rollback is straightforward if you keep `dabbler-access-harvester-old` intact.

If the new repo misbehaves after cutover:

```powershell
Rename-Item -LiteralPath 'C:\Users\denmi\source\repos\dabbler-access-harvester' -NewName 'dabbler-access-harvester-bad'
Rename-Item -LiteralPath 'C:\Users\denmi\source\repos\dabbler-access-harvester-old' -NewName 'dabbler-access-harvester'
```

Then repair any worktree metadata that pointed at the failed new repo and continue working from the restored old container. Because the old container is left untouched until late, rollback risk is low.

## Q4 — Regression guardrails

I would add four guardrails.

### 1. Layout checker

Implementation surface:
- Python module, for example `ai_router/repo_layout.py`
- CLI entry point, for example `python -m ai_router.repo_layout_check`

What it checks for Option B:
- repo root is a normal working tree, not a `.git` pointer to a bare repo
- sibling `<repo>-worktrees/` exists only if there are active worktrees
- every registered non-primary worktree lives under `<repo>-worktrees/<slug>`
- no registered worktrees live under `.claude/`, `docs/`, `tmp/`, or other non-canonical paths
- no filesystem leftovers remain under the old Option D container pattern

Complexity: medium.

This should run in two places:
- optional pre-commit/pre-push wrapper for fast feedback
- required session close-out verifier, because layout drift can happen without a commit

### 2. Weekly anomaly audit command

Implementation surface:
- Python CLI, for example `python -m ai_router.audit_worktrees`

Suggested behavior:
- scan `git worktree list --porcelain`
- scan the filesystem for suspicious worktree-like directories
- compare live refs against base branch
- classify each anomaly as `move`, `merge-review`, `archive`, `remove-empty-dir`, or `manual-review`
- print a human-readable report and optionally JSON

Example shape:

```powershell
python -m ai_router.audit_worktrees --repo C:\Users\denmi\source\repos\dabbler-access-harvester
python -m ai_router.audit_worktrees --repo C:\Users\denmi\source\repos\dabbler-access-harvester --json
```

Complexity: medium-high.

### 3. Canonical worktree create/remove commands

Implementation surface:
- Python CLI, for example `python -m ai_router.worktree open <slug>` and `python -m ai_router.worktree close <slug>`

Purpose:
- stop agents and humans from inventing paths ad hoc
- centralize the canonical path logic
- normalize branch naming
- make cleanup-on-close the easy path

For Option B, `open` should always create:
- branch `session-set/<slug>` by default
- worktree path `..\ <repo>-worktrees\<slug>`

Complexity: medium.

This is the best defense against another `.claude\worktrees\...` drift event.

### 4. Documentation additions

Implementation surface:
- `docs/planning/repo-worktree-layout.md`
- `docs/ai-led-session-workflow.md`

Add:
- a decision matrix for A vs B vs C vs D
- an explicit “deactivate worktree mode” recipe
- a “drift recovery” section covering non-canonical worktree paths and empty stranded directories
- a warning that `git clean -fdx` should not be normalized as a repo-root habit under Option C
- a policy that all worktree creation/removal goes through the helper CLI once it exists

Complexity: low.

## Q5 — Cancel-and-cleanup safe-way-out

I agree with the operator’s overall instinct that cancelled work needs a safe, low-regret off-ramp. Where I differ is on the default. My recommendation is: preserve by default, merge only when explicitly chosen or when the tool can prove the branch is ready and low-risk. For cancelled work, automatic integration into `main` is often higher-regret than automatic preservation.

### 1. Decision tree

The single command should:

1. Identify the target worktree and base branch.
2. Summarize the state:
   - current branch
   - ahead/behind counts vs base
   - pushed or local-only
   - uncommitted tracked changes
   - untracked files
3. Ask about uncommitted changes first, because they are the easiest to lose.
4. Ask about committed-but-unmerged work second.
5. Ask about remote branch cleanup last.

Concrete decision tree:

- Does the worktree have uncommitted tracked or untracked changes?
  - Default: `stash -u` them with a named stash entry and record the stash SHA in a manifest.
  - Alternatives: create a WIP commit on a rescue branch, or discard.

- Does the branch have commits not on the base branch?
  - Default: create an archive ref and bundle, then remove the worktree without merging.
  - Alternative 1: merge into base.
  - Alternative 2: leave branch intact and just detach/remove worktree.
  - Alternative 3: discard after explicit confirmation.

- Has the branch been pushed?
  - Default: do not delete the remote automatically unless the branch was merged successfully and the operator confirms.
  - Alternative: keep remote branch as-is.

- After preservation/integration, remove the worktree?
  - Default: yes.

### 2. Default behavior

If the operator just hits Enter through every prompt, I would do this:

1. Stash uncommitted changes with `git stash push -u`.
2. Create an archive ref for the branch under `refs/archive/cancelled/<timestamp>/<slug>`.
3. Write a bundle and a JSON manifest under the repo’s common Git dir, not the tracked working tree.
4. Remove the worktree.
5. Delete the original local branch only if the archive ref and bundle were created successfully.
6. Leave the remote branch alone unless it was already merged and `--delete-remote` was explicitly requested.

Why this is the lowest-regret default:
- no committed work is lost
- no uncommitted work is silently dropped
- `main` stays untouched
- the worktree clutter goes away
- recovery is explicit and scriptable

### 3. What “merge what was committed” should mean

If the operator chooses merge, it should mean:

```powershell
git -C <base-worktree> merge --no-ff <branch>
```

Why `--no-ff`:
- it preserves the fact that this was a cancelled branch that was intentionally absorbed
- it is easy to audit and easy to revert

I would not default to cherry-pick for a cancel flow. Cherry-pick is only appropriate if the operator is selecting a subset of commits. I also would not treat “write a patch file” as the primary meaning of merge; patch/bundle artifacts are preservation tools, not integration tools.

If the merge conflicts:
- abort the merge
- fall back to the archive path
- leave `main` unchanged

### 4. Integration surface

Suggested command:

```powershell
python -m ai_router.cancel_session --slug <slug>
```

Recommended flags:
- `--repo <path>`
- `--worktree <path>`
- `--base <branch>`
- `--yes`
- `--default preserve|merge|discard`
- `--delete-remote`
- `--keep-branch`
- `--json`
- `--dry-run`

Recommended output:
- human-readable summary of detected state
- exact actions taken
- recovery instructions
- path to manifest and bundle

Artifact location:
- use `git rev-parse --git-common-dir` and store under:

```text
<git-common-dir>/ai-router/cancelled-sessions/<timestamp>-<slug>.json
<git-common-dir>/ai-router/cancelled-sessions/<timestamp>-<slug>.bundle
```

That works across normal repos and worktree-based repos without dirtying the repo.

### 5. Failure modes and safe failure behavior

- Merge conflict during cancel-merge:
  Abort the merge and fall back to archive; do not leave `main` mid-merge.

- `stash push -u` fails:
  Stop before removing the worktree. Report the failure and require human intervention.

- Bundle creation fails:
  Keep the branch and keep the worktree. Do not proceed to branch deletion.

- Remote delete fails because origin moved or auth failed:
  Report it, leave local cleanup intact, and do not retry destructively.

- Operator interrupts the cancel flow:
  If preservation steps already ran, print a resumable manifest path and exit non-zero without deleting anything else.

- Worktree remove fails due to file locks:
  Keep refs intact, report the blocking path/process context, and exit without branch deletion.

The core rule is simple: on any uncertainty or partial failure, preserve refs and stop.

## Caveats / things you'd want to know before being more confident

- I directly inspected the current harvester state, and the current primary worktree is not clean. That affected my recommendation to avoid any immediate merge into `main`.
- I validated the Option C `git status` and `git clean -fdx -n` behavior in an isolated local test repo on Git for Windows `2.51.0.windows.2`. I did not validate older Git versions.
- I did not inspect VS Code internals directly. My concerns about double-indexing and watcher load under Option C are based on how VS Code and language tooling typically recurse through nested folders, not on a repo-specific trace.
- I did not compare against the existing Gemini or Opus answers, by design.
- If the operator strongly prioritizes “one folder per repo, no sibling folders ever,” my ranking between B and C could change, but only with explicit editor/search exclusions as part of the standard.
