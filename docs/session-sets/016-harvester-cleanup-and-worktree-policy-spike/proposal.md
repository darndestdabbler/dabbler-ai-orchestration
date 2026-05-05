# Proposal — `dabbler-access-harvester` cleanup + canonical layout shift

> **Status:** Spike output, awaiting operator approval. Once approved, this document drives the consumer-side work in Set 015 Session 3 (harvester alignment) and queues the canonical-layout-doc edit + tooling sets that follow.
> **Inputs synthesized:** `findings.md`, `provider-responses/gemini-2.5-pro.md`, `provider-responses/codex.md` (GPT-5.4 Medium via Codex), and orchestrator (Opus 4.7) analysis.
> **Multi-provider consensus:** Strong on Option B as the new canonical layout; meaningful divergences on Q1 disposition, Q3 migration approach, and Q5 archive location — synthesized below.

---

## TL;DR

1. **Adopt Option B (Nephew-and-Niece worktrees) as the new canonical layout.** Strong consensus across all three independent takes. Replaces the current Option D (bare-repo + flat-worktree) standard.
2. **Clean up the harvester via a "preserve first, decide later" sequence**: backup the unmerged PoC branch (ref + bundle) before any destructive operation; relocate the stranded worktree to the canonical sibling path; remove the empty top-level dirs; defer the merge-vs-retire decision until after the topology is stable.
3. **Migrate the harvester from D to B via clone-and-swap**, not collapse-in-place. Old container preserved for ~1 week as a rollback safety net.
4. **Build canonical worktree CLIs** as the primary regression guardrail (`python -m ai_router.worktree open|close <slug>`). The harvester's `.claude/worktrees/...` drift happened because no canonical path enforcement existed; tooling fixes that more reliably than documentation.
5. **Build a cancel-and-cleanup CLI** with patch-archive as the safe-path default (`python -m ai_router.cancel_session`).

Estimated downstream work: 2–3 new session sets (or absorbed into existing Set 015 + a new tooling set).

---

## 1. Recommended canonical layout — Option B (Nephew-and-Niece)

```
~/source/repos/
  <repo>/                       # main checkout, NEVER moves regardless of worktree state
    .git/                       # standard, not a bare-repo pointer
    ...source files...
  <repo>-worktrees/             # sibling container, only exists when worktrees are active
    <session-set-slug>/         # one subfolder per active worktree, named for the session set
    <other-slug>/
```

### Why Option B

| Constraint / desire | Option B | Notes |
|---|---|---|
| `~/source/repos/<repo>/` is the stable main checkout, never moves | ✓ | Hard constraint from operator; satisfied unconditionally |
| Glance-readable directory listing | ✓ | `<repo>-worktrees/` is self-documenting; embedded "this is a worktree container" signal |
| Visual quarantine of clutter | ✓ | All worktrees collected in one sibling per repo; doesn't intermix with real repo dirs in `~/source/repos/` |
| Clean off-ramp to sequential workflow | ✓ | Remove the last worktree, optionally `rmdir <repo>-worktrees/`; main repo is unchanged |
| Compatible with standard `git worktree add/move/remove` | ✓ | No special git invocation required; same commands as Option A |
| Low cognitive overhead | ✓ | Path layout is plainly visible; no hidden footguns like Option C's `git clean -fdx` |

### Where Option B is wrong (honest framing)

- If you typically run **zero** worktrees and only rarely do parallel work, the `<repo>-worktrees/` container is mild ceremony you don't need. Option A wins for that profile.
- If you commit to running **5+ concurrent long-lived worktrees** per repo regularly, the bare-repo + container collapse of Option D becomes worth the structural tax.
- Neither pattern matches your actual usage (1–2 typical, sometimes 0, occasionally 3 briefly).

### Rejected options (with rationale)

- **Option A (Repo-Level Sibling)** — recreates the original proliferation problem in `~/source/repos/` if cleanup discipline slips. Your insight that proliferation was a *discipline* failure rather than a *layout* failure is correct in principle, but discipline fails under pressure and Option B's quarantine to `<repo>-worktrees/` makes the proliferation visually contained even when discipline slips.
- **Option C (Son-and-Daughter)** — IDE indexer pollution kills it for daily use. Note: GPT-5.4 actually tested `git clean -fdx -n` on Git 2.51 and confirmed Git **protects registered worktrees** even with `-x`, contrary to assumptions in the prompt. The data-loss footgun on registered worktrees is real but weaker than initially feared. The IDE indexer concern (VS Code search, language servers, file watchers double-indexing nested worktrees because their `.git` is a pointer file) is the actual blocker. Cognitive overhead and Windows path-length pressure are secondary concerns.
- **Option D (Subrepo-Level Sibling, current)** — moves main into a subdirectory the moment you adopt the pattern, paying structural tax even on sequential-work days. The harvester's mess after one week of adoption is a strong empirical signal the pattern is over-engineered for this scale.

---

## 2. Harvester cleanup recipe (immediate, pre-migration)

> **Goal:** Bring the harvester to a clean Option D state first, deferring the bigger D→B migration to a later step. This isolates the cleanup work from the migration work; either can be paused independently.
>
> **Scope:** Anomalies A (live worktree at `.claude/worktrees/...`), B (empty `docs/session-sets/workflow-package-pilot/`), C (empty `tmp/feedback/`).
>
> **Provider divergence on default disposition:** Gemini recommended auto-merging the PoC branch with `--no-ff`. GPT-5.4 Medium recommended preserve first, relocate, decide later — noting the primary worktree is currently dirty and the PoC branch is 36 commits behind its base. **GPT's caution wins here**; auto-merging on top of a dirty main with a 36-commit gap compounds risk. The merge-vs-retire decision happens AFTER the topology is stable.

### Step-by-step (PowerShell, run from repo root)

```powershell
$repo = 'C:\Users\denmi\source\repos\dabbler-access-harvester'
$wt = Join-Path $repo '.claude\worktrees\vba-symbol-resolution-session-1'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
```

**Phase 1 — Pre-flight and freeze.**

```powershell
git -C $repo worktree list --porcelain
git -C (Join-Path $repo 'main') status --short --branch
git -C $wt status --short --branch
git -C $repo rev-list --left-right --count main...worktree-vba-symbol-resolution-session-1
```

Close any VS Code window or terminal with cwd inside `.claude\worktrees\...` before proceeding.

**Phase 2 — Create rollback anchors before any destructive step.**

```powershell
git -C $repo branch "backup/worktree-vba-symbol-resolution-session-1-$stamp" worktree-vba-symbol-resolution-session-1
git -C $repo bundle create "..\harvester-vba-symbol-resolution-session-1-$stamp.bundle" worktree-vba-symbol-resolution-session-1
```

The local backup ref AND external bundle file are belt-and-suspenders preservation. If anything goes wrong later, the branch is recoverable two independent ways.

**Phase 3 — Relocate Anomaly A to the canonical Option D path.**

```powershell
$target = Join-Path $repo 'vba-symbol-resolution-session-1'
if (Test-Path $target) { throw "Target already exists: $target" }
git -C $repo worktree move $wt $target
git -C $repo worktree list --porcelain
git -C $target status --short --branch
```

After this, the worktree lives at the canonical sibling path that Option D expects. The `.claude/worktrees/` directory becomes empty and can be removed.

**Phase 4 — Remove empty stranded directories (B + C).**

```powershell
$empty1 = Join-Path $repo 'docs\session-sets\workflow-package-pilot'
$empty2 = Join-Path $repo 'tmp\feedback'
Get-ChildItem -Force $empty1
Get-ChildItem -Force $empty2
Remove-Item -LiteralPath $empty1 -Force
Remove-Item -LiteralPath $empty2 -Force

# Optionally remove the now-empty parent dirs:
Remove-Item -LiteralPath (Join-Path $repo 'docs\session-sets') -Force
Remove-Item -LiteralPath (Join-Path $repo 'docs') -Force
Remove-Item -LiteralPath (Join-Path $repo 'tmp') -Force
Remove-Item -LiteralPath (Join-Path $repo '.claude\worktrees') -Force
```

Do **not** use `-Recurse`. If any of these dirs unexpectedly contains files, the explicit `Get-ChildItem -Force` check catches it; investigate before deleting.

**Phase 5 — Defer the merge-vs-retire decision.**

The PoC branch now lives at the canonical path with rollback anchors in place. Operator reviews the three commits (`d2c7d88`, `8c2aa88`, `8ccabf0`) against the current state of `main/docs/session-sets/vba-symbol-resolution-and-enrichment/` (the slightly-different-named successor session) and decides:

- **Merge** (if the PoC findings are still load-bearing): clean main first, then `git -C main/ merge --no-ff worktree-vba-symbol-resolution-session-1`.
- **Retire** (if superseded by the later session-set): `git -C $repo worktree remove $target --force` (backup ref + bundle still exist) and `git -C $repo branch -D worktree-vba-symbol-resolution-session-1`.
- **Defer** (if you want to migrate to Option B before deciding): leave the worktree at the canonical Option D location; it'll get relocated to `<repo>-worktrees/vba-symbol-resolution-session-1/` during the D→B migration.

### Pre-flight checks before each destructive step

- Before `git worktree move`: target path does not exist; source path still in `git worktree list`.
- Before `git worktree remove --force`: only uncommitted files are the regenerable `session-state.json` artifacts; backup ref and bundle file both exist.
- Before `git branch -D`: backup ref `backup/worktree-vba-symbol-resolution-session-1-$stamp` exists and `git log` shows it points at the same commit (`8ccabf0`).
- Before `Remove-Item` on filesystem dirs: `git worktree list` does not mention them; `Get-ChildItem -Force` shows no contents.

### Rollback

If `git worktree move` fails halfway: `git -C $repo worktree repair $wt` or `git -C $repo worktree repair $target`, then re-check `git worktree list --porcelain`.

If the branch is deleted accidentally: restore from backup ref or bundle.

```powershell
# From backup ref:
git -C $repo branch worktree-vba-symbol-resolution-session-1 "backup/worktree-vba-symbol-resolution-session-1-$stamp"

# From bundle:
git -C $repo fetch "..\harvester-vba-symbol-resolution-session-1-$stamp.bundle" worktree-vba-symbol-resolution-session-1:worktree-vba-symbol-resolution-session-1

# Recreate the worktree from the restored branch:
git -C $repo worktree add $target worktree-vba-symbol-resolution-session-1
```

---

## 3. Migration recipe — Option D → Option B (clone-and-swap)

> **When:** After Phase 5 above. Can be deferred indefinitely if the operator prefers to run on cleaned-up Option D for a while.
>
> **Strategy:** Clone-and-swap, not collapse-in-place. A new sibling repo is built, populated, smoke-tested, and atomically renamed into position. The old container is preserved for ~1 week as a rollback safety net. This matches the existing canonical migration recipe in [`docs/planning/repo-worktree-layout.md`](../../planning/repo-worktree-layout.md) (which already says "Keep `<repo>-old/` for ~1 week").
>
> **Provider divergence resolution:** Gemini proposed collapse-in-place (rename `.bare/` to `.git/`, unset `core.bare`, move files around). GPT-5.4 proposed clone-and-swap. **GPT wins because**: (a) it preserves a full rollback path; (b) the smoke-test phase happens before any irreversible operation; (c) it matches the canonical migration recipe pattern already documented in this repo. Collapse-in-place trades safety for fewer steps; for a one-time migration on a repo this size, the safety is worth more.

### Target layout after migration

```
~/source/repos/
  dabbler-access-harvester/                                # standard repo, main at root
    .git/                                                  # standard, not bare
    main/                                                  # NO — this becomes flat
    ...source files...                                     # main worktree contents at root
  dabbler-access-harvester-worktrees/                      # only if active worktrees exist
    vba-symbol-resolution-session-1/                       # if Phase 5 deferred merge-vs-retire
```

### Step-by-step

**Setup variables.**

```powershell
$old = 'C:\Users\denmi\source\repos\dabbler-access-harvester'
$new = 'C:\Users\denmi\source\repos\dabbler-access-harvester-new'
$wts = 'C:\Users\denmi\source\repos\dabbler-access-harvester-worktrees'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
```

**1. Snapshot and preserve local-only state.**

```powershell
git -C $old worktree list --porcelain
git -C $old branch --list  # capture all local branches before clone
git -C $old stash list     # capture stashes (none expected on harvester per audit)
```

If `main/` has uncommitted work, preserve it as a patch first:

```powershell
git -C (Join-Path $old 'main') diff --binary > '..\harvester-main-working-copy.patch'
```

Archive any valuable untracked files in `main/` separately.

**2. Build the new repo as a sibling.**

```powershell
git clone https://github.com/darndestdabbler/dabbler-access-harvester.git $new
git -C $new switch migrate/dabbler-ai-router-pip
New-Item -ItemType Directory -Force -Path $wts | Out-Null
```

**3. Recreate any local-only branches (e.g., the PoC branch if Phase 5 deferred its disposition).**

```powershell
git -C $new fetch "$old\.bare" worktree-vba-symbol-resolution-session-1:worktree-vba-symbol-resolution-session-1
```

**4. Create the canonical worktree under the sibling worktrees folder.**

```powershell
git -C $new worktree add (Join-Path $wts 'vba-symbol-resolution-session-1') worktree-vba-symbol-resolution-session-1
git -C (Join-Path $wts 'vba-symbol-resolution-session-1') status --short --branch
```

**5. Carry over local-only Git config that matters.**

The audit identified these as relevant:

```powershell
git -C $new config credential.https://github.com.username darndestdabbler
git -C $new config branch.migrate/dabbler-ai-router-pip.remote origin
git -C $new config branch.migrate/dabbler-ai-router-pip.merge refs/heads/migrate/dabbler-ai-router-pip
git -C $new config branch.migrate/dabbler-ai-router-pip.vscode-merge-base origin/main
git -C $new config branch.worktree-vba-symbol-resolution-session-1.vscode-merge-base origin/main
```

No custom hooks or stashes were observed in the harvester's `.bare/` per the audit.

**6. Reapply preserved dirty changes (if any from Step 1).**

```powershell
git -C $new apply '..\harvester-main-working-copy.patch'
git -C $new status --short --branch
```

If the patch does not apply cleanly, **stop here and resolve before any rename**.

**7. Smoke test.**

```powershell
git -C $new status --short --branch
git -C $new worktree list --porcelain
# Run normal build/test from $new and from the new sibling worktree.
# Run the import test for ai_router if relevant.
```

**8. Release file locks before the swap.**

```powershell
python -m ai_router.utils cleanup-dev-orphans --dry-run --match-path dabbler-access-harvester
python -m ai_router.utils cleanup-dev-orphans --yes --match-path dabbler-access-harvester
dotnet build-server shutdown
```

Close any VS Code window or terminal with cwd inside `$old`.

**9. Atomic swap as separate rename operations.**

```powershell
Rename-Item -LiteralPath $old -NewName 'dabbler-access-harvester-old'
Rename-Item -LiteralPath $new -NewName 'dabbler-access-harvester'
```

Run as **separate commands**, not chained. If the first fails on a file lock, you don't want the second running blind.

**10. Repair worktree metadata after rename.**

```powershell
$repo = 'C:\Users\denmi\source\repos\dabbler-access-harvester'
git -C $repo worktree repair (Join-Path $wts 'vba-symbol-resolution-session-1')
git -C $repo worktree list --porcelain
```

**11. Re-open the repo, verify, then delete `dabbler-access-harvester-old/` after ~1 week.**

### Edge cases / gotchas

- Windows file locks are the biggest practical risk. VS Code, terminals, MSBuild servers, Defender, Search Indexer can all block the rename. Use `python -m ai_router.utils cleanup-dev-orphans` first; if rename still fails, reboot is cleanest.
- The old anomalous worktree under `.claude\worktrees\...` should not be touched during migration — it was disposed of in the cleanup phase before migration starts.
- IDE workspace files / `.vs` state with absolute paths must be recreated, not migrated.
- If you create the new worktree before the final rename, `git worktree repair` after the swap is mandatory.

### Rollback

```powershell
Rename-Item -LiteralPath 'C:\Users\denmi\source\repos\dabbler-access-harvester' -NewName 'dabbler-access-harvester-bad'
Rename-Item -LiteralPath 'C:\Users\denmi\source\repos\dabbler-access-harvester-old' -NewName 'dabbler-access-harvester'
```

Repair worktree metadata in the restored old container, continue working. Old container is left untouched until late, so rollback risk is low.

---

## 4. Tooling specifications

### 4.1. Canonical worktree CLI — `python -m ai_router.worktree`

**Why this is the most important guardrail.** The `.claude/worktrees/` drift happened because no canonical-path enforcement existed. Documentation alone fails — operators and agents create paths ad hoc when fast iteration is more valuable than reading docs. A canonical CLI makes the canonical path the *easy* path.

**CLI surface.**

```text
python -m ai_router.worktree open <slug> [--repo <path>] [--base <branch>]
python -m ai_router.worktree close <slug> [--repo <path>] [--keep-branch]
python -m ai_router.worktree list [--repo <path>] [--json]
```

**Behavior.**

- `open <slug>` always creates the worktree at the canonical Option B path: `<repo-parent>/<repo>-worktrees/<slug>/`. Branch name defaults to `session-set/<slug>`. Refuses to create a worktree at a non-canonical path.
- `close <slug>` removes the worktree at the canonical path, deletes the local branch unless `--keep-branch` is passed, optionally deletes the remote branch (gated on operator confirmation). If the worktree has uncommitted changes or unmerged commits, prompts the operator to use `cancel_session` instead.
- `list` enumerates active worktrees in the canonical layout, plus flags any non-canonical worktrees as drift.

**Implementation surface.** New module `ai_router/worktree.py`. Wraps `git worktree add/remove/list/move` with canonical-path enforcement. Complexity: medium (~150–250 lines of Python).

### 4.2. Cancel-and-cleanup CLI — `python -m ai_router.cancel_session`

**Specification (synthesized from Gemini Q5 + GPT Q5 + orchestrator analysis).**

**CLI surface.**

```text
python -m ai_router.cancel_session --slug <slug>
                                   [--repo <path>]
                                   [--worktree <path>]
                                   [--base <branch>]
                                   [--yes]
                                   [--default preserve|merge|discard]
                                   [--delete-remote]
                                   [--keep-branch]
                                   [--json]
                                   [--dry-run]
```

**Decision tree (the interactive flow).**

1. **Identify target.** Worktree path resolved from `--slug` against the canonical Option B layout.
2. **Summarize state.** Current branch, ahead/behind counts vs base, pushed-or-local-only, uncommitted tracked changes, untracked files.
3. **Uncommitted changes prompt** (asked first because easiest to lose).
   - Default: `git stash push -u` with named stash entry (`stash@{0}: cancelled-<slug>-<timestamp>`).
   - Alternatives: WIP commit on rescue branch, discard.
4. **Unmerged commits prompt** (asked second).
   - Default: **preserve as archive ref + bundle**, do not auto-merge.
   - Alternative 1: merge into base with `git merge --no-ff <branch>`.
   - Alternative 2: leave branch intact, just remove worktree.
   - Alternative 3: discard after explicit confirmation.
5. **Remote branch prompt** (asked last).
   - Default: do **not** delete remote.
   - Alternative: `--delete-remote` flag.
6. **Worktree removal** (after preservation/integration).
   - Default: yes, remove via `git worktree remove`.

**Default behavior (the "press Enter through every prompt" path).**

1. `git stash push -u` for uncommitted changes (named entry).
2. Create archive ref `refs/archive/cancelled/<timestamp>/<slug>` for committed-but-unmerged work.
3. Write a bundle file (`<archive-location>/<timestamp>-<slug>.bundle`) and a JSON manifest documenting what was archived.
4. Remove the worktree via `git worktree remove`.
5. Delete the local branch only if archive ref + bundle were created successfully.
6. Leave the remote branch alone unless `--delete-remote` was explicitly requested.

**Why preserve-default beats merge-default:** auto-merging cancelled work into `main` pollutes history with code the operator was uncertain enough about to cancel. Preservation is reversible (`git apply` from bundle, or restore from archive ref). Auto-merge is not.

**Archive location — operator decision required.**

| Option | Pros | Cons |
|---|---|---|
| `<repo>/docs/cancelled-sessions/<timestamp>-<slug>.{bundle,json}` (Gemini + orchestrator default) | Discoverable via `ls`; tracked in git so the patch persists with the repo; future operators see the cancelled work without knowing where to look | Adds files to the working tree; pollutes diff/blame for the docs/ folder |
| `<git-common-dir>/ai-router/cancelled-sessions/<timestamp>-<slug>.{bundle,json}` (GPT default) | Doesn't dirty the working tree; works identically across normal repos and worktree-based repos; git-native | Hidden inside `.git/`; not tracked across machines unless explicitly synced; future operator has to know to look |

**Recommendation:** `<repo>/docs/cancelled-sessions/` for discoverability + git-trackability. The cancelled work persisting with the repo is itself documentation. **Operator picks during proposal review.**

**Failure modes (synthesized from GPT Q5 + Gemini Q5).**

| Failure | Behavior |
|---|---|
| Merge conflict during cancel-merge | Abort merge, fall back to archive path, leave `main` unchanged |
| `stash push -u` fails | Stop before removing worktree; report failure; require human intervention |
| Bundle creation fails | Keep branch and worktree; do not proceed to deletion |
| Remote delete fails (auth, moved upstream) | Report; leave local cleanup intact; do not retry destructively |
| Operator interrupts (Ctrl+C) | If preservation steps already ran, print resumable manifest path; exit non-zero without deleting anything else |
| Worktree remove fails (file locks) | Keep refs intact; report blocking process context; exit without branch deletion |

**Core rule:** on any uncertainty or partial failure, **preserve refs and stop**.

**Implementation surface.** New module `ai_router/cancel_session.py`. Complexity: medium-high (~300–500 lines of Python). Should reuse worktree-listing logic from `ai_router/worktree.py`.

### 4.3. Layout checker — `python -m ai_router.repo_layout_check`

**Purpose:** Detect drift from canonical Option B layout. Run as part of session close-out gate AND on operator demand.

**Checks.**

- Repo root is a normal working tree (not a `.git` pointer to a bare repo).
- Sibling `<repo>-worktrees/` exists only if there are active worktrees.
- Every registered non-primary worktree lives under `<repo>-worktrees/<slug>`.
- No registered worktrees live under `.claude/`, `docs/`, `tmp/`, or other non-canonical paths.
- No filesystem leftovers from the old Option D pattern (`.bare/`, top-level `main/`).
- No empty stranded directories at the container root.

**Output.** Human-readable report with one row per anomaly, classified as `move`, `remove-empty-dir`, `merge-review`, `archive`, or `manual-review`. Optional `--json` output for CI integration.

**Implementation surface.** New module `ai_router/repo_layout.py`. Complexity: medium (~100–150 lines).

### 4.4. Documentation additions to `docs/planning/repo-worktree-layout.md`

- Add a **decision matrix** comparing Options A/B/C/D explicitly, with the operator-profile thresholds for when each is appropriate.
- Update the **Target Layout** section to reflect Option B as canonical (replacing the current Option D diagram).
- Update the **Setup Recipe — Fresh Repo** section to use Option B paths.
- Add a **"Drift recovery" section** covering: non-canonical worktree paths (`git worktree move` recipe), empty stranded directories at container root, mixed-layout containers (worktrees in two different patterns).
- Add a **"Deactivate worktree mode"** section explaining when and how to collapse from B back to a single working tree.
- Add a **policy statement** that all worktree creation/removal goes through `python -m ai_router.worktree` once that CLI exists.
- Add the **clone-and-swap migration recipe** (D→B) from this proposal.

---

## 5. Provider divergences (recorded for transparency)

| Topic | Gemini-2.5 Pro | GPT-5.4 Medium (Codex) | Orchestrator (Opus) | Synthesis chose |
|---|---|---|---|---|
| **Q1 default Anomaly A disposition** | Auto-merge with `--no-ff` | Preserve first (backup branch + bundle), relocate, decide later | Move worktree first, defer merge decision | **GPT** — Gemini missed that main is currently dirty + branch is 36 commits behind; auto-merge compounds risk |
| **Q1 backup before destructive ops** | Not mentioned | Explicit backup branch AND bundle file | Implied | **GPT** — belt-and-suspenders preservation is cheap insurance |
| **Q2 ranking** | B > A > D > C | B > A > C > D | B > A > D > C | **B as canonical** (full consensus on top spot) |
| **Q2 Option C `git clean -fdx` behavior** | Would nuke worktrees | Tested on Git 2.51: skips registered worktrees | Would nuke worktrees | **GPT's empirical test** — registered worktrees are protected; loose files in `worktrees/` still vulnerable |
| **Q2 Option C overall verdict** | Reject (clean -fdx + IDE) | Reject (IDE indexers primarily) | Reject (`-fdx` + IDE) | **All three reject; rationale shifts toward IDE indexer being the actual blocker, not `-fdx`** |
| **Q3 migration approach** | Collapse `.bare/` in place (10 steps modifying existing container) | Clone-and-swap (build new sibling, smoke test, atomic rename) | (no recipe drafted) | **GPT** — clone-and-swap matches existing canonical recipe in `repo-worktree-layout.md`; preserves rollback path |
| **Q4 worktree CLI tool** | Not proposed | `python -m ai_router.worktree open|close <slug>` | Not proposed | **GPT** — direct response to the regression that caused this spike; tooling beats documentation for path-enforcement |
| **Q4 layout checker** | `~/dev-tools/check_repo_layout.py` (~50 lines) | `ai_router/repo_layout_check` module + CLI | Not proposed | **GPT's location** (under `ai_router/` for consistency with other utilities) |
| **Q5 default for unmerged commits** | Patch file in `docs/cancelled-sessions/` | Bundle + JSON manifest + archive ref under `<git-common-dir>/ai-router/cancelled-sessions/` | Patch file in `docs/cancelled-sessions/` | **Gemini's location, GPT's git-native preservation** — `docs/cancelled-sessions/<ts>-<slug>.{bundle,json}` (operator-confirmable during review) |
| **Q5 default for remote branch deletion** | No (leave alone) | No (leave alone) | No (leave alone) | **Full consensus** — never auto-delete remotes |
| **Q5 merge meaning** | `git merge --no-ff` | `git merge --no-ff` | (no opinion) | **Full consensus** |
| **Q5 fallback on merge conflict** | Auto-abort, instruct operator | Auto-abort, fall back to archive path | (no opinion) | **GPT's fallback chain** — auto-abort + archive instead of leaving operator to decide |

**Where Gemini was uniquely valuable:**

- Comprehensive Q1 sequence with specific git command syntax for each disposition path.
- Detailed decision-tree wording for the cancel CLI prompts (the exact prompt text).
- The most accessible explanation of *why* each option ranks where it does.

**Where GPT was uniquely valuable:**

- Empirical testing of Option C's `git clean -fdx` behavior on actual Git 2.51 — caught a wrong assumption baked into our prompt.
- Noticed main is dirty + branch is 36 commits behind, which informed the more cautious Q1 default.
- Proposed the worktree CLI as a guardrail — the most direct fix for the drift that caused this spike.
- Clone-and-swap migration matching the existing canonical recipe pattern, with rollback safety net.
- Proposed git-native preservation (archive ref + bundle) for cancelled work, not just patch files.

**Where the orchestrator (Opus) was uniquely valuable:**

- Independent ranking that confirmed the B > A > D > C order before either provider responded.
- Caught the `git clean -fdx` concern early; GPT's empirical test then refined that into the IDE-indexer concern as the real blocker.
- Anticipated patch-archive as the safe-path default before either provider responded.

---

## 6. Open questions for operator review

1. **Archive location for cancelled sessions.** `<repo>/docs/cancelled-sessions/` (proposal default — discoverability + git-trackability) vs. `<git-common-dir>/ai-router/cancelled-sessions/` (GPT's preference — git-native, doesn't dirty working tree). **Operator picks.**

2. **Anomaly A default disposition after relocation.** The PoC branch will sit at the canonical path with backups. Does the operator want to:
   (a) review the three commits' diff against `main/docs/session-sets/vba-symbol-resolution-and-enrichment/` (the apparent successor session) and merge or retire based on what's there, or
   (b) leave the branch indefinitely and revisit when next working on harvester parser/resolver topics?

3. **Migration timing.** The harvester D→B migration is non-trivial work that Set 015 Session 3 was scoped to do anyway (under a different layout assumption). Two options:
   (a) **Amend Set 015 Session 3** to execute this proposal's clone-and-swap migration instead of the in-place D-cleanup originally planned.
   (b) **Insert a new set (017?)** dedicated to the D→B migration across all three consumer repos, leaving Set 015 Session 3 to do only the cleanup work.
   **Recommendation:** option (a). Session 3 was already going to touch the harvester layout; folding the D→B migration in keeps the work consolidated. Sessions 2 and 4 (platform and healthcare-accessdb) get parallel D→B treatment in the same set.

4. **Tooling sequencing.** `worktree` CLI vs `cancel_session` CLI vs `repo_layout_check` — which is highest priority? The worktree CLI is the strongest regression guardrail (most direct fix for the drift that caused this spike). Recommendation: build worktree first, layout-checker second, cancel CLI third (that one is bigger and can wait until you actually cancel a session set).

5. **Documentation update timing.** Edits to `docs/planning/repo-worktree-layout.md` should land before the consumer-repo migrations execute (Sessions 2/3/4 of Set 015 will reference the canonical layout doc). **Recommendation:** doc edits go in their own small commit, BEFORE the consumer migrations.

---

## 7. Open issues NOT addressed in this proposal

These are real concerns that deserve attention but are out of scope for this spike:

- **Other consumer repos may have similar drift.** Set 015's audit (Session 1) probes for the same patterns in `dabbler-platform` and `dabbler-homehealthcare-accessdb`; this proposal informs how that audit interprets findings, but doesn't pre-empt it.
- **Hook behavior writing files to non-canonical paths.** The auto-creation of `session-state.json` files observed in the audit appears benign but should be verified — if a hook is writing to old-style paths somewhere, the layout checker (4.3) will catch it but won't fix the hook itself.
- **The `.claude/` directory's role.** Worktrees ended up under `.claude/worktrees/` — that's a Claude-namespaced path, suggesting a tool default. Identifying which tool created that path and reconfiguring its default belongs in a follow-up; the layout checker will surface this as drift but not fix it.
