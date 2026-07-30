ISSUES FOUND

- **Issue 1: An empty folder inside an existing repository is treated as the parent repository and can commit unrelated parent changes**
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** A developer invokes the command from an existing checkout and creates/selects an empty child folder for the sample—a common VS Code workflow. `git.checkIsRepo()` returns true because the child is inside the parent repository, so no nested repository is initialized. Subsequent `git add -A` and commits operate on the parent repository, potentially committing unrelated staged or working-tree changes. The sample also lacks its own repository, breaking its later lifecycle. This is probable because the picker accepts any empty directory and does not reject directories nested under repositories.
  - **Details:** **Violation:** The contract requires “`git init` + baseline commit” for the selected sample folder and a repository-local identity for that sample. **Impact:** The command can modify the identity and history of an unrelated repository, commit unrelated work, and leave the sample unusable as an independent Lightweight repository; this is merge-blocking data/workflow corruption. **Evidence:** `makeSampleGitOps.init` in `src/commands/trySampleProject.ts` calls `git.checkIsRepo()` and skips `git.init()` whenever it returns true. Git reports true from any descendant of a work tree. `setLocalIdentity` and `commitAll` then run from that descendant, with `git add -A` and `git commit` targeting the parent repository. The smoke test uses an OS temporary directory and does not cover this case. **Fix:** Initialize the target unconditionally—`git init` is idempotent—or verify that `git rev-parse --show-toplevel` resolves exactly to `targetDir`; add a real test using an empty child directory inside a parent repository and assert the parent remains untouched.

- **Issue 2: The canonical sample instructs every agent to record verification by another engine even though no such verification occurs**
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** On the normal sample path, the AI follows `AGENTS.md` and writes the exact supplied `disposition.json`. That file records `"verification_method": "manual-via-other-engine"`, although the workflow performs no second-engine review and explicitly tells the user that no second AI reviewed the work. Thus every completed sample records false verification provenance.
  - **Details:** **Violation:** The canonical user-facing contract must accurately describe the lifecycle it performs; the round’s rubric specifically treats a wrong claim shipped in this contract as blocking. **Impact:** The generated completion record falsely claims independent verification, misleading users and any audit or lifecycle tooling that consumes `disposition.json`. This occurs on the main path, not an edge case, and changes the merge decision because provenance integrity is part of the session contract. **Evidence:** `docs/templates/sample-project/files/AGENTS.md` requires the exact value `"verification_method": "manual-via-other-engine"` but contains no verification step and later says, “no second AI reviewed the work.” `sampleProjectSmoke.test.ts` likewise performs no second-engine review and writes the same value before successfully closing. **Fix:** Use the schema-supported value representing no verification, consistent with `verificationMode: out-of-band-or-none`, and update the canonical instructions and smoke test together.

#### NITS

- **Nit:** `createSampleProject` does not actually guarantee that marker-write failures are recoverable. The `writeMarker()` calls after successful render, git, and local-marker steps are outside their `try` blocks. A write failure can reject the command, leave a non-empty folder without a usable marker, and make retry refuse it. Catch these writes and surface a recovery path.

- **Nit:** A marker from another `bundleVersion` is classified as generic non-empty, so `pickTargetFolder` offers only **Choose Again** or **Cancel** despite the source comment claiming **Start Over** is the recovery path. Add a distinct stale-sample verdict that permits safe restart without permitting mixed-version resume.

- **Nit:** Marker validation only checks the version and that `completedSteps` is an array. A valid-JSON marker such as `{"completedSteps":["install"]}` causes installation to be skipped and can report success without a venv. Require `completedSteps` to be an exact prefix of `SAMPLE_STEPS` with only known, unique values.

- **Nit:** An all-steps-complete marker is presented as having stopped during installation because `nextStep` falls back to `"install"`, even though resume correctly skips every step. Give completed-but-not-cleaned-up markers a separate message.

- **Nit:** Every git-step exception is reported as “Git was not found.” Failures from `git init`, local configuration, hooks, filesystem restrictions, or commit execution therefore receive incorrect remediation. Preserve a distinct unavailable-git result and otherwise show the reduced actual error.

- **Nit:** The advertised `expectedTests` contract is not consumed by the smoke test. `SampleBundleMeta` omits it, while `sampleProjectSmoke.test.ts` hard-codes `Ran 2 tests` and never checks `beforeTheSession` or `afterTheSession`. Source and dist can remain synchronized while `bundle.json` silently disagrees with the executable sample. Add the metadata to the type and derive all count/status assertions from it.

- **Nit:** The test claiming the starter line matches the existing affordance only compares `buildSampleStarterLine` with another literal. It never calls the existing `buildStartNextSessionPrompt`, so the two implementations can drift silently. Reuse or directly compare against the canonical builder.

- **Nit:** `installRouter()` is awaited without a catch even though the core claims it “Never throws.” An unexpected spawn or filesystem exception escapes `createSampleProject` rather than becoming a traceback-free failed result. Wrap the call and reduce the error through `describeError`.

- **Nit:** Returned installation failure messages are inserted into the toast and log unchanged. The real adapter passes `outcome.message` directly, so the “never a raw traceback” invariant depends on an unenforced upstream assumption. Sanitize the returned message at the core boundary.

- **Nit:** The exact manual recovery commands are appended to an output channel that remains hidden unless the user selects **Show Log**. This weakens the requirement that failure immediately print the command. Automatically reveal the channel on installation failure or include the primary retry command directly in the visible message.

- **Nit:** Failure to remove the installer-created `ai_router/` directory is treated as successful. Because that directory is not ignored and is created after the last commit, a removal failure can leave a dirty tree that later fails close-out. Return a recoverable failure or commit/ignore the retained artifact.

- **Nit:** **Start Over** deletes entire owned top-level directories, not merely files written by the command. If a user adds a file under `hello/` or `docs/` while diagnosing a failed setup, it is deleted despite the comment promising that developer-added files are untouched. Detect unexpected paths before deletion or require explicit confirmation listing them.

- **Nit:** Step 6 does not inspect or catch failure from `vscode.openFolder`. A cancelled or failed open can leave the pending landing in global state without telling the user that the seven-step flow did not finish. Handle the command result/error and clear or retain the pending state with explicit remediation.