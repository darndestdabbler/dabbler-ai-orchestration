ISSUES FOUND

- **Issue 1: URL-encoded Azure DevOps project/repository names are not decoded before reuse**
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** An Azure DevOps user clones a repository whose project or repository name contains spaces, producing an origin such as `https://dev.azure.com/acme/My%20Project/_git/My%20Repo`. This is a common ADO naming pattern, especially on the session’s priority host. The command passes literal `My%20Project` to `az --project` and constructs browser URLs containing `My%2520Project`, so both CLI PR creation and the required browser fallback can fail.
  - **Details:**
    - **Violation:** The task requires parsing ADO org/project/repo coordinates and providing working PR creation and CLI-absent fallback on Azure DevOps.
    - **Impact:** A common class of ADO repositories cannot use the one-click path, and the fallback URL is also malformed. That materially breaks the primary-host objective.
    - **Evidence:** `gitHost.ts` stores path segments without `decodeURIComponent`; `gitHost.test.ts` explicitly asserts that `"My%20Project"` remains encoded. `buildAzPrCreateArgs()` then passes `info.project` directly to `--project`, while `createPrWebUrl()` and `adoPrWebUrl()` call `encodeURIComponent` again, turning `%20` into `%2520`.
    - **Location:** `src/utils/gitHost.ts` — `splitRemote()`, `classifyRemoteUrl()`, `createPrWebUrl()`, and `adoPrWebUrl()`; incorrect expectation in `src/test/suite/gitHost.test.ts`.
    - **Fix:** Safely decode each path segment during parsing, rejecting malformed percent escapes, retain decoded logical coordinates, and encode them exactly once when constructing web URLs. Add tests for encoded project and repository names across CLI arguments and both ADO URL builders.

### NITS

- **Nit:** The required Azure CLI preflight is incomplete. `src/utils/hostCli.ts` only checks whether an `az` file exists; it does not detect whether the required `azure-devops` extension is installed or whether `az`/`gh` is authenticated. A fresh ADO user with base Azure CLI installed gets a successful preflight and confirmation, followed by a failed PR command. The browser fallback limits the impact, but this does not implement the promised “`az` + the `azure-devops` extension” and “not authenticated” preflight. Add injected probes for extension availability and authentication status.

- **Nit:** `runFinalizeMergedSetFlow()` treats every branched linked worktree as a session worktree:
  ```ts
  const sessionWorktrees = worktrees.filter((w) => w.branch);
  ```
  It should filter for `w.branch?.startsWith(SESSION_BRANCH_PREFIX)`. Otherwise an unrelated linked worktree can be selected and removed; `git branch -d` protects committed history but runs only after the worktree has already been removed.

- **Nit:** Detached linked worktrees are silently excluded by the same filter. The later detached-HEAD error is effectively unreachable for them, and finalize can report nothing to do or delete a local branch without removing the detached worktree. Detect and report matching detached/stale worktrees explicitly.

- **Nit:** The Azure DevOps fallback URL uses bare branch names for `sourceRef` and `targetRef`. ADO create-PR links conventionally require full `refs/heads/...` values; otherwise branch preselection may fail and the operator must select branches manually. Update `createPrWebUrl()` and its tests to use encoded full refs.

- **Nit:** `classifyRemoteUrl()` claims case-insensitive recognition, but `_git` is located with case-sensitive `segments.indexOf("_git")`. Normalize only the structural segment for comparison while preserving project and repository casing.

- **Nit:** Finalize rejects a workspace opened at a repository subdirectory because it compares the workspace folder directly with `primaryRoot()`. Such a folder is reported as being “inside a worktree” even when it is merely a subdirectory of the primary checkout. Resolve the repository top level with `git rev-parse --show-toplevel` before making the primary-checkout comparison.