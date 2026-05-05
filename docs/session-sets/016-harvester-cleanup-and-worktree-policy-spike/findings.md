# Findings — `dabbler-access-harvester` topology audit

> **Audit date:** 2026-05-05
> **Auditor:** orchestrator (claude-code, opus-4-7)
> **Scope:** read-only inspection of `C:\Users\denmi\source\repos\dabbler-access-harvester` against the canonical bare-repo + flat-worktree standard at `dabbler-ai-orchestration/docs/planning/repo-worktree-layout.md`.

## 1. Canonical layout (target)

```
<container>/                # the project's only top-level dir; no source files at root
  .bare/                    # bare git repo
  .git                      # text file: "gitdir: ./.bare"
  main/                     # main worktree
  <session-set-slug>/       # one dir per active in-flight worktree, sibling of main/
```

The container is forbidden from holding source files at its top level; every working tree must be a subdirectory.

## 2. Observed harvester topology

```
dabbler-access-harvester/
  .bare/                                                    # ✓ canonical
  .git                                                      # ✓ canonical (gitdir: ./.bare)
  main/                                                     # ✓ canonical, branch: migrate/dabbler-ai-router-pip @ bfe54d0
  .claude/worktrees/vba-symbol-resolution-session-1/        # ✗ Anomaly A
  docs/session-sets/workflow-package-pilot/                 # ✗ Anomaly B
  tmp/feedback/                                             # ✗ Anomaly C
```

Three anomaly classes; one live (still registered with git), two stranded (filesystem-only).

## 3. `git worktree list` output

```
.bare                                              (bare)
.claude/worktrees/vba-symbol-resolution-session-1  8ccabf0 [worktree-vba-symbol-resolution-session-1]
main                                               bfe54d0 [migrate/dabbler-ai-router-pip]
```

Two worktrees registered (plus the bare repo). The canonical layout expects the second worktree as a sibling of `main/`, not nested in `.claude/worktrees/`.

## 4. Per-anomaly disposition probe

### Anomaly A — `.claude/worktrees/vba-symbol-resolution-session-1/`

**Type:** Live registered worktree at non-canonical path.

**Branch:** `worktree-vba-symbol-resolution-session-1`

**HEAD:** `8ccabf0 — Session 1 complete: PoC verdict is FEASIBLE. Update ai-assignment with actuals.`

**Branch lineage:**
- 3 commits unique to this branch (not on `main`):
  - `8ccabf0` Session 1 complete: PoC verdict is FEASIBLE. Update ai-assignment with actuals.
  - `8c2aa88` Session 1 PoC: Symbol resolution on modStrings + BeforeUpdate example — verdict: feasible
  - `d2c7d88` Initialize vba-symbol-resolution-and-enrichment session set (Session 1 PoC)
- 5+ commits on `main` not in this branch (branch is behind main).
- **No upstream configured** — never pushed to `origin`.
- **Not merged into main.**

**Working-tree state:** 9 untracked `session-state.json` files in `docs/session-sets/*/`. These appear to be hook-generated (the same auto-population behavior that just created Set 016's `session-state.json` after `mkdir`). They are NOT lost work — they are regenerable side-effects of the workspace-hook scanning session-set directories.

**Worktree ptr:** `.bare/worktrees/vba-symbol-resolution-session-1/gitdir` →
`C:/Users/denmi/source/repos/dabbler-access-harvester/.claude/worktrees/vba-symbol-resolution-session-1/.git`

So git sees this as a fully registered worktree, just at a non-standard path.

**Disposition options (operator picks one in proposal review):**

- **A.1 — Salvage the work.** Move worktree to canonical sibling location: `git worktree move .claude/worktrees/vba-symbol-resolution-session-1 vba-symbol-resolution-session-1`. Rebase branch onto current main if active development continues; otherwise leave as-is for archive.
- **A.2 — Merge & retire.** If the PoC work belongs in main: `cd main && git merge worktree-vba-symbol-resolution-session-1` (or cherry-pick the relevant commits), then `git worktree remove .claude/worktrees/vba-symbol-resolution-session-1` and `git branch -d worktree-vba-symbol-resolution-session-1`.
- **A.3 — Discard.** If the PoC was superseded (note: `main/docs/session-sets/` contains `vba-symbol-resolution-and-enrichment` — possibly the same work continued under a different slug): `git worktree remove --force` and `git branch -D` after operator confirmation that no commits are uniquely valuable.

**Origin hypothesis:** The worktree was created by an earlier session that placed worktrees under `.claude/worktrees/` rather than as siblings — possibly before the 2026-04-28 standardization on the flat-worktree layout, or by a tool that defaulted to a Claude-namespaced path. Either way, the canonical-sibling rule postdates this worktree's creation.

### Anomaly B — `docs/session-sets/workflow-package-pilot/`

**Type:** Stranded directory at container root (filesystem-only; no git registration).

**Contents:** Empty (`du -sh` reports 0 bytes; `ls -la` confirms only `.` and `..`).

**Disposition:** Safe to delete.

**Origin hypothesis:** Leftover from the legacy sibling-worktree → bare-repo migration, OR a never-populated session-set folder created by a tool that walked the wrong root and never had files written into it. The folder name `workflow-package-pilot` doesn't match any branch in the harvester repo's history (`git -C .bare branch -a`). No recovery value.

### Anomaly C — `tmp/feedback/`

**Type:** Stranded directory at container root (filesystem-only; no git registration).

**Contents:** Empty (`du -sh` reports 0 bytes; `ls -la` confirms only `.` and `..`).

**Disposition:** Safe to delete.

**Origin hypothesis:** Leftover scratch directory; `tmp/` and `feedback/` are common ad-hoc names. No recovery value.

## 5. Cross-cutting observations

### Canonical-violation classification

- **Non-canonical path for an otherwise-valid worktree** (Anomaly A): the worktree itself is fine; only its location is wrong. Fixable via `git worktree move`.
- **Container-root pollution with empty shells** (Anomalies B + C): the container has no business holding ANY top-level dirs other than `.bare/`, `.git`, and worktree subdirs. These are pure leftovers.

### What the canonical doc does NOT cover (gap)

The canonical `repo-worktree-layout.md` describes:
- The target layout
- The fresh-repo setup recipe
- The migration recipe (sibling-worktrees → bare-repo)
- Cleanup convention at session-set close (single worktree)
- Common gotchas

It does NOT cover:
1. **Periodic / drift-recovery cleanup** — what to do when stranded artifacts (Anomaly B/C) accumulate post-migration
2. **Worktree-at-non-canonical-path recovery** (Anomaly A) — `git worktree move` is the answer but the doc doesn't say so
3. **Reverse migration** — going FROM bare-repo + flat-worktree back TO sequential single-tree, when the multi-worktree overhead doesn't pay off
4. **Decision criteria** — when bare-repo + flat-worktree pays off vs sequential, per-repo

These four gaps are the substance of the consultation in `questions.md`.

### Hook-side-effect note

The auto-creation of `session-state.json` in any new session-set directory (observed when `mkdir 016-...` produced an immediate state file, and again as the 9 untracked files in the stranded worktree) is a workspace-hook behavior. Any cleanup that involves deleting session-set folders needs to account for this hook potentially racing the deletion.

## 6. Workflow-shape impact (the operator's stated concern)

> "harvester is a mess ... It is confusing to me. And perhaps there needs to be a very simple way to cleanup a worktree when you want to go back to a sequential workflow."

Two concrete observations from this audit that bear on that concern:

1. **Anomaly A is not catastrophic but it IS confusing.** Two worktrees registered, one nested in `.claude/`, branch names that don't match canonical naming (`worktree-vba-symbol-resolution-session-1` rather than `session-set/vba-symbol-resolution-session-1`) — a future agent or future-self has to read git output carefully to understand the topology. The fix is mechanical (`git worktree move` + maybe rename branch), but absent guidance the question "is this stranded or active?" requires investigation rather than glance-reading.
2. **Anomalies B+C are a clear sign of regression.** The container-root rule is explicit in the canonical doc, yet the harvester acquired two violations. Either the rule isn't being enforced (no lint / guardrail), or it's being violated by tooling that writes to the wrong cwd. Either way, the canonical doc lacks a "how to detect this regression early" recipe, which is the kind of guardrail any solo operator running multiple repos needs.

These observations frame the consultation: not "how do we clean up THIS mess once" but "how do we make the layout recoverable + self-validating + reversible."
