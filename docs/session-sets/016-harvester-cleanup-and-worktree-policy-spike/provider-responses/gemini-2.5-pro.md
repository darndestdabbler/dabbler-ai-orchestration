## Q1 — Cleanup sequence for the harvester anomalies

This sequence prioritizes safety and data preservation, bringing the repository back to a known-good canonical state for Option D.

### Disposition of Anomaly A Branch

The branch `worktree-vba-symbol-resolution-session-1` contains a "FEASIBLE" Proof of Concept. Discarding this work would be a mistake. The recommended disposition is to merge it into the worktree's target branch (`migrate/dabbler-ai-router-pip`) to preserve the findings and history, then retire the worktree and branch. A no-fast-forward merge (`--no-ff`) is recommended to create a merge commit, explicitly showing where the PoC was integrated.

### Cleanup Command Sequence

All commands are run from the repository root (`dabbler-access-harvester/`) unless specified otherwise.

1.  **Pre-flight Check:**
    -   Verify the current state.
    ```bash
    git status
    git worktree list
    git branch -avv
    ls -la
    ```
    -   Confirm that the output matches the described anomalies.

2.  **Handle Anomaly A (Non-canonical worktree):**
    -   **Pre-flight (check for untracked files):**
        ```bash
        # Preview what would be deleted.
        git -C .claude/worktrees/vba-symbol-resolution-session-1/ clean -fdn
        ```
    -   **Clean untracked files:** The `session-state.json` files are regenerable.
        ```bash
        git -C .claude/worktrees/vba-symbol-resolution-session-1/ clean -fd
        ```
    -   **Switch to main worktree:**
        ```bash
        cd main
        ```
    -   **Pre-flight (merge):** Ensure your current branch is correct (`migrate/dabbler-ai-router-pip`).
        ```bash
        git status
        ```
    -   **Merge the PoC branch:**
        ```bash
        git merge --no-ff --no-edit worktree-vba-symbol-resolution-session-1
        ```
        *   **If merge conflicts occur:** The process will pause. Resolve conflicts in your editor, then `git add .` and `git merge --continue`.
        *   **Rollback for merge:** If the merge is problematic, abort it with `git merge --abort`. The repository will be returned to the pre-merge state. Re-evaluate the PoC commits before trying again.
    -   **Return to repo root:**
        ```bash
        cd ..
        ```
    -   **Remove the worktree:**
        ```bash
        git worktree remove .claude/worktrees/vba-symbol-resolution-session-1
        ```
        *   **Note:** If git complains the worktree has untracked files you missed, use the `--force` flag after double-checking their value.
    -   **Delete the local branch:**
        ```bash
        git branch -d worktree-vba-symbol-resolution-session-1
        ```
        *   **Note:** `git branch -d` will fail if the branch is not fully merged. This is a safety check. If the merge was successful, this command will succeed.

3.  **Handle Anomalies B and C (Stranded empty directories):**
    -   **Pre-flight (confirm emptiness):**
        ```bash
        ls -la docs/session-sets/workflow-package-pilot/
        ls -la tmp/feedback/
        ```
        *   These commands should show no files.
    -   **Remove the directories:** Using `rmdir` is safest as it only works on empty directories.
        ```bash
        rmdir docs/session-sets/workflow-package-pilot/
        rmdir tmp/feedback/
        ```

4.  **Final Verification:**
    -   Run the pre-flight checks again to confirm the repository is clean and canonical.
    ```bash
    git worktree list
    ls -la
    ```
    -   The output should now show only the `.bare`, `.git`, and `main` entries, and the worktree list should only show `.bare` and `main`.

## Q2 — Compare the four named layout options (A / B / C / D)

### 1. Verification of Option C Hypothesis

Option C (Son-and-Daughter, `worktrees/` inside the main repo) is **not recommended** due to significant risks and usability problems.

*   **`git status` from main:** Yes, with `worktrees/` in `.gitignore`, `git status` will correctly ignore the nested worktrees as untracked content.
*   **`git clean -fdx`:** This is the primary deal-breaker. `git clean -fdx` is a common command to get a pristine working directory. The `-x` flag explicitly instructs git to remove ignored files. **Running this command from the main worktree root would permanently delete the `worktrees/` directory and all active work within it.** This is an unacceptable risk of data loss. The safe version is `git clean -fd`, but relying on the operator never to use the `-x` flag is fragile.
*   **IDE Indexers (VS Code):** This is highly problematic. VS Code's search, file watcher, and IntelliSense would likely become confused. It might index files in `worktrees/` as part of the main workspace, leading to duplicate search results and ambiguous "go to definition" behavior. While this can sometimes be mitigated by adding `worktrees/` to the IDE's exclusion settings, it's extra configuration that's easy to get wrong and adds cognitive overhead.
*   **Windows Concerns:** The deeper nesting exacerbates the potential for hitting `MAX_PATH` limits on Windows. While less of an issue with modern Windows versions, it's an unnecessary risk.

### 2. Ranking of Options for This Operator

1.  **Option B — Nephew-and-Niece:** **(Strongly Recommended)**. This option provides the best balance of organization, safety, and adherence to the operator's constraints. It satisfies the hard constraint that `~/source/repos/<repo>/` is the stable main worktree. It cleanly separates worktrees into a dedicated, logically-named folder (`<repo>-worktrees/`), preventing pollution of the top-level `~/source/repos/` directory. This structure is self-documenting and "glance-readable."
2.  **Option A — Repo-Level Sibling:** A viable but inferior alternative. Its simplicity is appealing, but it directly re-creates the "worktree proliferation" problem if cleanup discipline slips. With multiple active repos, the `~/source/repos/` directory becomes cluttered with interleaved main repos and worktrees (e.g., `repo1`, `repo1-slug`, `repo2`, `repo2-slug`). Option B provides superior organization.
3.  **Option D — Subrepo-Level Sibling (Current):** Not recommended. It violates the operator's explicit hard constraint by moving the `main` branch into a subdirectory. It introduces the complexity of a bare repository layout, which is overkill for the 1-2 concurrent session sets described. The cost of this pattern is paid even when doing simple sequential work.
4.  **Option C — Son-and-Daughter:** Not recommended. The risk of data loss via `git clean -fdx` and the high potential for IDE confusion make this option too hazardous for daily use.

### 3. When Each Option Is a Fit

*   **Option A:** A fit for projects where worktrees are used extremely rarely (e.g., once a year for a hotfix) and the operator wants zero setup.
*   **Option B:** The best fit for this operator's profile: regular but low-to-moderate use of worktrees (1-4 concurrent), working across several related repositories, and valuing a clean, predictable directory structure.
*   **Option C:** Never recommended due to the data loss risk.
*   **Option D:** Becomes worth considering only at a much larger scale, where a repository might have 5-10+ concurrent, long-running worktrees active at all times, or in a team environment where the bare repo is shared on a central server. It is not a fit for this solo operator's scale.

### 4. Migration Cost (from D to recommended B)

*   **Effort:** Low-to-Medium. For the three repositories, this is likely a 30-60 minute task of careful, manual operations.
*   **Risk:** Low, provided a backup is made first and the recipe in Question 3 is followed precisely. The core git data is never at risk until directories are explicitly deleted at the end of the process.

## Q3 — Migration recipe to your recommended option

This recipe migrates a repository from the current **Option D (Subrepo-Level Sibling)** to the recommended **Option B (Nephew-and-Niece)**. It assumes you have already performed the cleanup from Question 1.

This is a documented manual recipe. For a one-time migration on three repos, a script is overkill and less transparent.

### Step-by-Step Command Sequence

Let's assume we are migrating `dabbler-access-harvester` and it has one active worktree named `parser-foundations`.

1.  **Preparation and Backup (CRITICAL):**
    -   Close all IDEs and text editors that have the repository open to prevent file locks.
    -   Navigate to the parent directory: `cd ~/source/repos`.
    -   Create a full backup of the current repository structure:
        ```bash
        tar -czf harvester-backup-pre-migration.tar.gz dabbler-access-harvester
        ```
    -   **Rollback Plan:** If anything goes wrong, you can delete the partially migrated folders and restore from this backup: `rm -rf dabbler-access-harvester && tar -xzf harvester-backup-pre-migration.tar.gz`.

2.  **Begin Migration:**
    -   Navigate into the repository container:
        ```bash
        cd dabbler-access-harvester
        ```

3.  **Restructure to a Standard (Non-Bare) Repo:**
    -   Move the main worktree's contents to a temporary location:
        ```bash
        # Create a temporary directory one level up
        mkdir ../harvester-main-temp
        # Move all files (including dotfiles) from main/ into the temp dir
        mv main/* main/.* ../harvester-main-temp/ 2>/dev/null || true
        rmdir main
        ```
    -   Convert the bare `.bare` repo into a standard `.git` directory:
        ```bash
        rm .git  # This is just the pointer file
        mv .bare .git
        ```
    -   Unset the `bare` flag in the git config:
        ```bash
        git config --unset core.bare
        ```
        *   Git commands will now work as if this were a normal repository.

4.  **Populate the Main Worktree:**
    -   Move the files from the temporary location into the current directory (which is now the main worktree root):
        ```bash
        mv ../harvester-main-temp/* ../harvester-main-temp/.* . 2>/dev/null || true
        rmdir ../harvester-main-temp
        ```
    -   **Verification:** Run `git status`. It should show your main branch is clean. The `~/source/repos/dabbler-access-harvester/` directory is now a standard git repository and the main worktree, fulfilling the operator's primary constraint.

5.  **Relocate In-Flight Worktrees:**
    -   **Pre-flight:** Check the registered path of the existing worktree.
        ```bash
        git worktree list
        # Example output might show a path like:
        # /c/Users/dev/source/repos/dabbler-access-harvester                bfe54d0 [migrate/dabbler-ai-router-pip]
        # /c/Users/dev/source/repos/dabbler-access-harvester/parser-foundations 123abcd [parser-foundations]
        ```
    -   Create the new container for worktrees:
        ```bash
        mkdir ../dabbler-access-harvester-worktrees
        ```
    -   Move the existing worktree to its new canonical location. Use the path that `git worktree list` showed you.
        ```bash
        # Usage: git worktree move <current-name-or-path> <new-path>
        git worktree move parser-foundations ../dabbler-access-harvester-worktrees/parser-foundations
        ```
        *   This command safely updates git's internal records and moves the directory. The worktree remains usable.

6.  **Final Verification and Cleanup:**
    -   Check the final state:
        ```bash
        # Should now show the main repo and the relocated worktree
        git worktree list
        # Should show clean worktrees and the new worktree container
        ls -la ..
        ```
    -   Update your IDE workspace files. Open VS Code in `~/source/repos/dabbler-access-harvester/` for `main` and in `~/source/repos/dabbler-access-harvester-worktrees/parser-foundations/` for the other session set.
    -   Once you have confirmed everything works, you can delete the backup tarball.

Repeat this process for the other two repositories.

## Q4 — Regression guardrails

These guardrails will help maintain the health of the recommended **Option B** layout.

1.  **Lint / Health-Check Script:**
    -   **Implementation:** A Python script, e.g., `~/dev-tools/check_repo_layout.py`. It can be run manually or as a pre-commit hook on a shared-config repo if one exists.
    -   **Functionality:** Takes a repo name as an argument (`<repo>`).
        1.  Checks that `~/source/repos/<repo>/.git` is a directory (not a file).
        2.  Parses the output of `git -C ~/source/repos/<repo> worktree list`.
        3.  For every worktree path listed (besides the main one), it verifies the path starts with the absolute path of `~/source/repos/<repo>-worktrees/`.
        4.  Flags any directories in `~/source/repos/` matching `<repo>-*` that are NOT `<repo>-worktrees` as potential stray worktrees (from the old Option A pattern).
    -   **Complexity:** Low. ~50 lines of Python using the `subprocess` module.

2.  **Periodic Cleanup-Suggestion Command:**
    -   **Implementation:** An interactive mode for the linter script, e.g., `check_repo_layout.py --interactive <repo>`.
    -   **Functionality:** It runs the lint checks and, for each failure, suggests a remediation command.
        -   *Anomaly:* Worktree at non-canonical path `/path/to/stray/worktree`.
        -   *Suggestion:* `git worktree move /path/to/stray/worktree ~/source/repos/<repo>-worktrees/<slug>`
        -   *Anomaly:* Merged local branch `feature/foo` with no associated worktree.
        -   *Suggestion:* `git branch -d feature/foo`
        -   *Anomaly:* Stranded directory `~/source/repos/<repo>-worktrees/old-slug` not registered in `git worktree list`.
        -   *Suggestion:* `rm -rf ~/source/repos/<repo>-worktrees/old-slug` after manual inspection.
    -   **Complexity:** Medium. Requires more sophisticated parsing of git output and constructing user-facing strings.

3.  **Tooling and Convention Defaults:**
    -   **Implementation:** The most effective guardrail is prevention. The operator mentioned worktrees being created under `.claude/`. This implies an automated tool.
    -   **Action:** Find the configuration for this tool. Update its "new worktree path" or "output directory" template to follow the canonical Option B structure. The template should resolve to `~/source/repos/<repo>-worktrees/<session-slug>`.
    -   **Complexity:** Low, assuming the tool is configurable.

4.  **Documentation Additions:**
    -   **Implementation:** Update the project's canonical layout documentation (`README.md` or similar).
    -   **Content:**
        -   A clear visual diagram of the Option B layout.
        -   The precise command to create a new worktree: `git worktree add ../<repo>-worktrees/<slug> <branch-to-create>`.
        -   The precise command to remove a worktree: `git worktree remove ../<repo>-worktrees/<slug> && git branch -d <branch-name>`.
        -   Instructions on when and how to run the `check_repo_layout.py` script.

## Q5 — Cancel-and-cleanup safe-way-out

This is a specification for a robust, interactive command-line tool to safely decommission a worktree and its associated branch when a session set is cancelled.

### 1. Decision Tree

The tool guides the operator through a series of questions, proceeding from least to most destructive.

1.  **Identify Target:** The tool is invoked on a specific worktree (e.g., by running it from within that directory, or passing the path as an argument).
2.  **Check for Uncommitted Changes:** Run `git status --porcelain`.
    -   If the output is non-empty:
        > `You have uncommitted changes in this worktree. What should be done?`
        > `(S)tash changes for later`
        > `(D)iscard all changes (destructive)`
        > `(A)bort cancellation`
        > `[S/d/a]?`
3.  **Check for Unmerged/Unpushed Commits:** Run `git log @{u}..HEAD` (if remote tracking branch exists) or `git log main..HEAD` (using `main` as the default base).
    -   If commits exist:
        > `This worktree's branch '<branch-name>' has N unmerged commits. What should be done with this work?`
        > `(P)reserve as a patch file (safest)`
        > `(M)erge into 'main' (may cause conflicts)`
        > `(D)iscard commits (destructive)`
        > `(A)bort cancellation`
        > `[P/m/d/a]?`
4.  **Check for Remote Branch:** Run `git branch -r --contains <branch-name>`.
    -   If a remote branch exists:
        > `A remote branch named '<branch-name>' exists on 'origin'. Delete it?`
        > `(Y)es, delete the remote branch`
        > `(N)o, leave the remote branch`
        > `[y/N]?`

### 2. Default Behavior (The "Safe Path")

If the operator accepts the default for every prompt (by pressing Enter), the following actions occur:

1.  **Uncommitted changes:** **Stash**. A stash is created with a descriptive message like `Stash from cancelled session: <slug> on <date>`. This is completely reversible (`git stash pop`) and prevents data loss.
2.  **Unmerged commits:** **Preserve as a patch file**. The tool runs `git format-patch main --stdout > ~/source/repos/<repo>/docs/cancelled-sessions/<slug>-<date>.patch`. This creates a perfect, restorable record of the commits without altering the main branch history. It is the lowest-regret action.
3.  **Remote branch:** **No**. Do not delete the remote branch. Deleting remote branches can be disruptive and is better handled in a separate, deliberate cleanup process. The default should be to leave it alone.

### 3. What "Merge what was committed" Means

When the operator explicitly selects `(M)erge`, the tool should:

1.  Attempt a non-fast-forward merge to create an explicit merge commit: `git merge --no-ff --no-edit <branch-name>`.
2.  **Crucially, if the merge fails with a conflict**, the tool must:
    -   Immediately and automatically run `git merge --abort`.
    -   Print a clear message: `Merge failed due to conflicts. The merge has been aborted, and your repository is unchanged. Please resolve the conflicts manually and then re-run this command, or choose another option like creating a patch file.`
    -   Exit gracefully, leaving the worktree and branch intact.

### 4. Integration Surface

*   **Name:** `devtool session cancel`
*   **CLI Shape:** `devtool session cancel [<path-to-worktree>]`
    -   If `<path-to-worktree>` is omitted, it operates on the current working directory.
*   **Flags:**
    -   `-y, --yes`: Automatically accept all safe defaults (Stash, Patch, No remote delete). The "panic button."
    -   `--discard-all`: A high-risk override that discards all local changes and commits without prompting. Requires a confirmation step (e.g., re-typing the slug).
    -   `--target-branch <branch>`: Specify a branch other than `main` to merge into or create a patch against.
*   **Output:** Clear, step-by-step logging of actions.
    ```
    $ devtool session cancel
    > Checking worktree at '~/source/repos/dabbler-harvester-worktrees/parser-foundations'...
    > Found uncommitted changes. Stashing... [OK: Created stash@{0}]
    > Found 3 unmerged commits. Creating patch file... [OK: Saved to docs/cancelled-sessions/parser-foundations-2026-05-05.patch]
    > Removing worktree... [OK]
    > Deleting local branch 'parser-foundations'... [OK]
    > Session 'parser-foundations' has been safely cancelled and archived.
    ```

### 5. Failure Modes

*   **Merge Conflict:** Handled as described above by aborting the merge and exiting. The state is safe and unchanged.
*   **Permissions Error:** If `git worktree remove` fails due to a file lock or permissions, the tool should report the underlying error from git and exit, leaving the worktree and branch in place for manual remediation.
*   **User Cancellation (Ctrl+C):** The script should trap the interrupt signal. It should print a message like "Cancellation aborted by user. Repository state has not been fully cleaned." and exit immediately. It must not be left in a half-merged state. The safest design is for each step (stash, merge, remove) to be atomic.

## Caveats / things you'd want to know before being more confident

*   **Operator's Constraint:** My strong recommendation for Option B hinges on the operator's stated hard constraint that `~/source/repos/<repo>/` must be the stable, main worktree. If this constraint were relaxed, Option D (the current bare-repo standard) could be a reasonable choice, and the recommendation would shift to cleaning it up and building better guardrails for it.
*   **IDE Behavior:** My assessment of IDE problems with Option C is based on extensive experience, but a definitive test would involve creating a PoC repo with that structure and observing VS Code's behavior directly with the operator's specific extensions installed.
*   **Tooling Integration:** The recommendations for guardrails and cleanup tooling assume the existence of a place to put shared scripts (`~/dev-tools/` or a utils package). The exact implementation surface would depend on the operator's existing development environment. The `.claude/` directory implies a specific tool; knowing what that tool is and how it's configured would allow for a more precise recommendation.