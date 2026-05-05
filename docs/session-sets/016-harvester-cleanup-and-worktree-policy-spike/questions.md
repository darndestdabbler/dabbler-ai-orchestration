# Cross-provider consultation prompt

> **Routing target:** GPT-5 (OpenAI) AND Gemini-2.5 Pro (Google), independently. Same prompt to both. No cross-pollination.
> **Format expected:** Structured response with the section headers requested below; markdown OK.

---

## System / context framing

You are a senior infrastructure engineer being consulted on a git
workflow problem. You are independently giving your best
recommendation; another engineer is being consulted in parallel and
their answer will be compared against yours. Disagree with the
prevailing approach if you have grounds to. Be specific — concrete
commands, paths, and edge cases beat vague principles.

The operator is a solo developer on Windows running 1–2 in-flight
"session sets" (logical units of work, each typically 1–4 sessions
long) at a time across three closely-related repositories. They
adopted a bare-repo + flat-worktree layout as a standard ~1 week ago
to solve a worktree-proliferation problem, but one repo has
accumulated cruft and the operator is questioning whether the
multi-worktree pattern is worth the complexity for their actual
usage.

## Background — the canonical layout (currently adopted, but under review)

The standard adopted on 2026-04-28 (1 week ago) is what we call below
**Option D — Subrepo-Level Sibling Worktrees**:

```
<container>/                # the project's only top-level dir; no source files at root
  .bare/                    # bare git repo
  .git                      # text file: "gitdir: ./.bare"
  main/                     # main worktree
  <session-set-slug>/       # one dir per active in-flight worktree, sibling of main/
```

Rules:
- The container has **no source files at top level** — every working tree is a subdirectory.
- Active session-set worktrees go as **siblings of `main/`**, named after the session-set slug.
- When a session set's last session merges, the worktree is removed and the branch is deleted (locally + remote).

Rationale at adoption time: the previous "sibling-worktree" pattern
(worktrees as top-level dirs in `~/source/repos/`) caused
proliferation — 9 concurrent worktrees of one repo plus a main = 10
sibling directories all named `<repo>-<slug>`. The bare-repo pattern
collapses each project to a single container.

**The operator is now reconsidering this choice.** Reflecting on the
proliferation problem in hindsight, the operator suggests that the
real issue wasn't the layout — it was the **lack of cleanup
discipline at session-set close**. With cleanup-on-close enforced,
several simpler layouts would also work, possibly better. The
operator has named four options for evaluation; please address each
by name in Question 2.

## The four layout options under evaluation

> **Naming convention used below:** `<repo>` is the repo folder name (e.g., `dabbler-access-harvester`); `<slug>` is the session-set slug (e.g., `parser-foundations`). All options assume `~/source/repos/` as the container directory.

### Option A — Repo-Level Sibling Worktrees

```
~/source/repos/
  <repo>/                   # main branch checked out here, the "real" repo folder, untouched whether you work sequentially or in parallel
  <repo>-<slug>/            # active worktree for session set <slug>
  <repo>-<slug2>/           # another active worktree if running multiple
```

- The repo folder at `~/source/repos/<repo>/` is the main checkout. **Main never moves**, regardless of whether the operator is doing sequential or parallel work.
- Worktrees appear as siblings IN `~/source/repos/`, prefixed with the repo name.
- Operator's argument: this is fine **as long as cleanup-on-close is enforced**. The original pain point (10 dirs hanging around forever) was a discipline failure, not a layout failure.

### Option B — Nephew-and-Niece Worktrees

```
~/source/repos/
  <repo>/                   # main, untouched
  <repo>-worktrees/         # sibling folder containing all worktrees for this repo
    <slug>/                 # one subfolder per active worktree, named exactly after the session-set slug
    <slug2>/
```

- Repo folder at `~/source/repos/<repo>/` is the main checkout, **never moves**.
- All worktrees collected under one sibling folder `<repo>-worktrees/`, with subfolders named after their session-set slugs.
- Operator's argument: nearly self-documenting for a human reading the directory listing — "oh, that's the worktrees folder, and these are the active session-set names."

### Option C — Son-and-Daughter-Level Worktrees

```
~/source/repos/
  <repo>/                   # main branch checked out here
    .git/
    .gitignore              # contains: worktrees/
    worktrees/              # gitignored subfolder of the main repo
      <slug>/               # one subfolder per active worktree
      <slug2>/
```

- Repo folder at `~/source/repos/<repo>/` is the main checkout, **never moves**.
- Worktrees live in `worktrees/` AS A SUBDIRECTORY of the main repo, with `worktrees/` listed in `.gitignore`.
- Operator's hypothesis: with `worktrees/` in `.gitignore`, the main repo doesn't see its own worktrees as untracked content — same logical organization as Nephew-and-Niece but contained inside the repo.
- **Operator wants the providers to validate the technical feasibility specifically.** Are there subtle git behaviors (`git clean -fdx`, IDE indexers, `git status` ignoring nested `.git` files, etc.) that would make this fail in unexpected ways?

### Option D — Subrepo-Level Sibling Worktrees (current standard, under review)

```
~/source/repos/
  <repo>/                   # the container — formerly held main, now empty at top level
    .bare/                  # bare git repo (real git data lives here)
    .git                    # pointer file: "gitdir: ./.bare"
    main/                   # main is now a subdirectory of the container
    <slug>/                 # worktrees as siblings of main/
```

- Adopted as canonical 2026-04-28.
- Critique by the operator: this **moves main into a subdirectory** the moment you adopt the pattern. Going from sequential to parallel re-organizes the repo. Going from no-worktrees to worktrees re-organizes the repo. The cost of the pattern is paid even when you're not using parallelism.
- Tends to accumulate junk at the container root if discipline slips (the harvester case).

## The mess we are diagnosing (an instance of Option D gone wrong)

Repository: `dabbler-access-harvester`. Observed state:

```
dabbler-access-harvester/
  .bare/                                                    # ✓ canonical
  .git                                                      # ✓ canonical (gitdir: ./.bare)
  main/                                                     # ✓ canonical, branch: migrate/dabbler-ai-router-pip
  .claude/worktrees/vba-symbol-resolution-session-1/        # ✗ Anomaly A — non-canonical worktree path
  docs/session-sets/workflow-package-pilot/                 # ✗ Anomaly B — empty stranded dir at container root
  tmp/feedback/                                             # ✗ Anomaly C — empty stranded dir at container root
```

`git worktree list`:

```
.bare                                              (bare)
.claude/worktrees/vba-symbol-resolution-session-1  8ccabf0 [worktree-vba-symbol-resolution-session-1]
main                                               bfe54d0 [migrate/dabbler-ai-router-pip]
```

### Per-anomaly state

**Anomaly A — `.claude/worktrees/vba-symbol-resolution-session-1/`:**
- Live registered worktree (git worktree list shows it).
- Branch: `worktree-vba-symbol-resolution-session-1`, HEAD `8ccabf0`.
- 3 commits unique to this branch (a "Session 1 PoC" with verdict "FEASIBLE").
- 5+ commits behind `main`.
- No upstream — never pushed.
- Not merged into main.
- Working tree has 9 untracked `session-state.json` files that are auto-generated by a hook every time the workspace is opened — they are regenerable side-effects, not lost work.

**Anomaly B — `docs/session-sets/workflow-package-pilot/`:**
- Filesystem-only directory at container root.
- Completely empty (`du -sh` = 0 bytes).
- No git registration. No matching branch in repo history.
- Origin: likely leftover from the pre-bare-repo migration or a never-populated tool output.

**Anomaly C — `tmp/feedback/`:**
- Filesystem-only directory at container root.
- Completely empty.
- No git registration.

### What the canonical doc doesn't cover (gaps)

1. **Drift-recovery / periodic cleanup** — what to do about stranded empty top-level dirs.
2. **Worktree-at-non-canonical-path recovery** — `git worktree move` is presumably the answer but the doc doesn't say so.
3. **Reverse migration** — going from bare-repo + flat-worktree BACK to sequential single-tree, when the multi-worktree pattern doesn't pay off.
4. **Decision criteria** — when bare-repo + flat-worktree pays off vs sequential, per-repo.

## Operator's stated frustration

> "harvester is a mess ... It is confusing to me. And perhaps there needs to be a very simple way to cleanup a worktree when you want to go back to a sequential workflow. Let's do a spike session where we ask for some ideas from GPT and Gemini regarding the best way to manage files moving forward. I want to get this right."

The operator is a solo developer who values:
- Glance-readable repo state (no investigation required to understand topology).
- Reversible decisions (an off-ramp from a pattern that didn't pay off).
- Self-validating layouts (something catches drift before it becomes "a mess").
- Minimal ceremony for the small-scale case (1 session set in flight at a time).

## Five questions

Please answer each in its own section, in order. Be concrete and specific.

### Question 1 — Safest cleanup sequence for THIS harvester state

Given the three anomalies above, what is the safest ordered
sequence of git + filesystem operations to bring the harvester back
to canonical state? Specifically:

- What is the right disposition for Anomaly A's branch (3 unmerged
  commits with a PoC)? Discuss the options (move worktree to
  canonical sibling path, merge & retire, discard) and which you'd
  recommend by default.
- Specific git commands to execute, in order.
- Pre-flight checks that should happen before each destructive step.
- What rollback looks like if something goes wrong mid-cleanup.

### Question 2 — Compare the four named layout options

Evaluate Options A (Repo-Level Sibling), B (Nephew-and-Niece),
C (Son-and-Daughter), and D (Subrepo-Level Sibling — current
standard) for this operator's profile:

- Solo Windows developer.
- 3 closely-related repos (`dabbler-access-harvester`,
  `dabbler-platform`, `dabbler-homehealthcare-accessdb`).
- Typically 1–2 in-flight session sets at a time per repo,
  sometimes 0, occasionally 3 briefly.
- IDE = VS Code, one workspace per repo.
- Working assumption from the operator: **main branch lives at
  `~/source/repos/<repo>/` and never moves**, regardless of
  whether they're doing sequential or parallel work that day. This
  is a hard constraint.

For your answer:

1. **Verify the operator's hypothesis about Option C.** Is putting
   `worktrees/` inside the main repo with `worktrees/` in
   `.gitignore` actually safe? Specifically address:
   - Does `git status` from the main worktree correctly ignore the
     nested worktrees? (yes, but confirm.)
   - Does `git clean -fdx` from the main worktree honor the
     `.gitignore` and leave the nested worktrees alone? Or does the
     `-x` (also clean ignored) flag nuke them? What is the safe
     command shape?
   - Do IDE indexers (VS Code's file watcher, search index) treat
     nested worktrees correctly, or do they double-index because
     the nested `.git` is a file-pointer rather than a real git dir?
   - Are there cross-platform concerns specific to Windows (file
     locking, path-length limits with deeper nesting)?
2. **Rank the four options for this operator's profile.** Be
   willing to disagree with the recently-adopted Option D. The
   operator is explicitly inviting that.
3. **Identify when each option is a fit.** "Option D becomes
   worth-it when the operator routinely runs N+ concurrent worktrees
   per repo" — fill in N. If your answer is "never for this
   operator's scale," say so.
4. **Migration cost.** Going from current Option D to your
   recommended option in `dabbler-access-harvester` — rough effort
   and risk. (Detailed recipe is Question 3.)

### Question 3 — Migration / "deactivate worktree mode" recipe

For whichever option you recommend in Question 2, provide a recipe
for migrating `dabbler-access-harvester` (currently in Option D,
plus the Anomaly A/B/C mess) to that target option.

**If your recommendation IS Option D:** the recipe is mostly the
Anomaly A cleanup from Question 1, plus regression guardrails
(Question 4). Note this and don't repeat yourself.

**If your recommendation is A, B, or C:** provide:

- Step-by-step command sequence for the migration.
- How to handle in-flight worktrees mid-migration (the operator may
  have an active worktree they want to keep working in after the
  switch — minimize the time the worktree is unusable).
- How to handle the bare-repo's local-only state (config, hooks,
  stashes, refspec customizations) when collapsing the bare-repo
  back into a normal `.git/`.
- Edge cases / gotchas (Windows file locks, IDE workspace files
  pinning the old container path, build outputs with absolute paths,
  stale worktree refs in `.bare/worktrees/`).
- Whether the migration should be a script or a documented manual
  recipe — defend your choice.
- **Rollback plan.** If the migration fails partway through, what
  state is the operator in and how do they get back to working?

### Question 4 — Guardrails to prevent regression

Whichever layout option ends up canonical, drift will happen. What
guardrails catch it early? Specifically:

- A lint / pre-commit-style check that runs on the chosen layout.
- A periodic cleanup-suggestion command (operator runs it weekly,
  it reports "your repo has these anomalies and here's the safe
  disposition for each").
- Conventions or tooling defaults that make it harder to write the
  wrong thing in the first place (e.g., tooling that auto-creates
  paths under `.claude/` should be configured to use the canonical
  sibling pattern instead).
- Documentation additions to the canonical layout doc.

For each guardrail you propose, name the implementation surface
(shell script, Python module under `ai_router/utils.py`, git hook,
etc.) and its rough complexity.

### Question 5 — Safe-way-out for cancelled parallel session sets

The single biggest worry the operator has about running parallel
work in worktrees is: **what happens when a parallel session set is
cancelled mid-flight?** They want a SAFE WAY OUT. Their working
hypothesis on the policy:

> "Default to merging what was committed already, but give the human
> the ability to override and discard. The human always makes the
> final call."

Design the cancel-and-cleanup workflow. Specifically:

1. **Decision tree.** When the operator cancels a session set,
   what questions should the tool ask, and in what order? Examples:
   "branch has N unmerged commits — merge them, archive them as a
   patch file, or discard?", "branch has uncommitted changes — stash,
   commit, or discard?", "branch was pushed to remote — also delete
   remote branch?".
2. **Default behavior (the "I'm panicking, just do the safe thing"
   path).** If the operator hits enter past every prompt, what
   happens? Defend the choice — what's the lowest-regret default?
3. **What "merge what was committed" actually means** — is it a
   `git merge --no-ff worktree-branch`? A `git cherry-pick`? Or
   something more conservative like just creating a patch file
   archived under `docs/cancelled-sessions/`?
4. **Integration surface.** This needs to be a single command the
   operator can run. Suggest a name and CLI shape (it'll likely
   live as `python -m ai_router.cancel_session` or similar). What
   flags? What output?
5. **Failure modes.** What can go wrong with this workflow, and
   how does the tool fail safely? (Examples: merge conflict during
   cancel-merge; push fails because remote moved; stash apply fails
   later; operator cancels the cancel mid-prompt.)

The deliverable here is a *spec*, not a finished implementation —
but the spec needs to be complete enough that someone could build
it without further design work.

---

## Output format you should follow

Six sections, in order:

```
## Q1 — Cleanup sequence for the harvester anomalies
[your answer]

## Q2 — Compare the four named layout options (A / B / C / D)
[your answer; rank them and recommend one]

## Q3 — Migration recipe to your recommended option
[your answer]

## Q4 — Regression guardrails
[your answer]

## Q5 — Cancel-and-cleanup safe-way-out
[your answer]

## Caveats / things you'd want to know before being more confident
[anything you couldn't determine from the prompt that would change your answer]
```

The "caveats" section is required — this is a spike, and the
operator wants to know where your answer is conjecture vs grounded.
