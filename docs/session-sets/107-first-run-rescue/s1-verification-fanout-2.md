ISSUES FOUND

**Issue 1:** The sample instructs every user to record a verification that never happened
- **Category:** Correctness
- **Severity:** Major
- **Failure scenario:** Every developer completing the sample as instructed writes `"verification_method": "manual-via-other-engine"` despite no other engine reviewing the work. This is probable because `AGENTS.md` mandates the exact disposition and the smoke test reproduces it. The resulting audit record falsely claims cross-engine verification.
- **Details:**
  - **Violation:** The sample is explicitly configured as `verificationMode: out-of-band-or-none` and says, “no second AI reviewed the work,” yet its required disposition claims `manual-via-other-engine`.
  - **Impact:** The canonical first-run sample teaches users to create a false verification record. This is a wrong claim in the user-facing contract and would change a reasonable merge decision.
  - **Evidence:** `docs/templates/sample-project/files/AGENTS.md` supplies the false value verbatim, then says no second AI reviewed the work. `sampleProjectSmoke.test.ts` writes the same value with empty verification message IDs and performs no independent review.
  - **Location:** `docs/templates/sample-project/files/AGENTS.md`; `tools/dabbler-ai-orchestration/src/test/suite/sampleProjectSmoke.test.ts`
  - **Fix:** Use the repository-supported value representing no verification, and update the smoke test accordingly; alternatively, perform and record a real independent verification.

**Issue 2:** `bundle.json` is not actually the enforced single source of truth claimed by the bundle
- **Category:** Completeness / False Positive
- **Severity:** Major
- **Failure scenario:** During a routine sample change, a maintainer adds or changes tests, updates the smoke test’s hard-coded expectations to make CI pass, but misses `bundle.json` or one of the several rendered documents containing duplicated counts and output. CI then passes while Session 2’s tutorial or the rendered sample gives new users incorrect instructions. This is probable over normal maintenance because the TypeScript metadata model does not even expose `expectedTests`, and the same claims are duplicated across multiple files.
- **Details:**
  - **Violation:** The work claims that `bundle.json` is “the machine-readable contract” and that “the smoke test reads its expectations from there, so a drifting sample fails the build.” The task specifically requires a canonical bundle consumed by the command, tutorial, and smoke test.
  - **Impact:** The acceptance floor does not enforce the central canonical-contract invariant. Incorrect test counts or instructions can ship into the first-run experience despite a green smoke test.
  - **Evidence:** `SampleBundleMeta` omits `expectedTests` entirely. The smoke test hard-codes `/Ran 2 tests/`, merely checks a nonzero pre-change exit, and never reads `beforeTheSession`, `afterTheSession`, or `notPassing`. Rendered `AGENTS.md`, `README.md`, `spec.md`, `main.py`, and test comments independently hard-code test counts and expected output without consistency checks.
  - **Location:** `docs/templates/sample-project/bundle.json`; `docs/templates/sample-project/files/**`; `tools/dabbler-ai-orchestration/src/utils/sampleProject.ts`; `tools/dabbler-ai-orchestration/src/test/suite/sampleProjectSmoke.test.ts`
  - **Fix:** Model and validate `expectedTests`, drive all smoke assertions from it, and either render duplicated user-facing claims from metadata or add tests that parse and verify every rendered claim against the metadata and actual behavior.

### NITS

- **Nit:** A marker from another `bundleVersion` is classified as ordinary non-empty content, but the UI offers only **Choose Again** or **Cancel**. The documented “Start Over” recovery is unavailable, so an interrupted sample cannot be reused after an extension bundle-version change.  
  **Location:** `classifyTargetFolder` and `pickTargetFolder`  
  **Fix:** Return a distinct incompatible-sample verdict and offer a safe Start Over path.

- **Nit:** Marker writes after successful render, git, and local-only steps occur outside their surrounding `try` blocks. A marker-write failure therefore rejects `createSampleProject` despite its “Never throws” contract and leaves a non-empty, potentially unresumable folder.  
  **Location:** `createSampleProject`, calls to `writeMarker()` after `done.add(...)`  
  **Fix:** Treat marker persistence as part of each step’s guarded operation and return an actionable failure.

- **Nit:** Successful installation is never persisted to the marker before cleanup. If marker removal fails, the surviving marker still records only `render`, `git`, and `marker`, so the next run unnecessarily repeats installation rather than taking the implemented all-steps-complete path.  
  **Location:** `createSampleProject`, install completion and marker cleanup  
  **Fix:** Write the marker after adding `install`, then remove it.

- **Nit:** Every failure in the git step is reported as “Git was not found,” including failures from initialization, local configuration, signing, hooks, or commit execution after availability already succeeded.  
  **Location:** `reportSampleFailure`  
  **Fix:** Reserve `GIT_MISSING_MESSAGE` for the availability failure and surface the sanitized actual reason for other git failures.

- **Nit:** **Start Over** does not remove `.venv` or the generated `ai_router` directory, even though step 5 can create them before failing. A corrupt partial environment can therefore survive an operation presented as a fresh start.  
  **Location:** `sampleOwnedTopLevelEntries`  
  **Fix:** Include all command-owned installation artifacts, especially `.venv` and conditionally generated router files.

- **Nit:** **Start Over** removes whole bundle-owned top-level directories. Files a developer added beneath `hello/`, `docs/`, or `.dabbler/` are deleted despite the code comment promising that developer-added work is untouched.  
  **Location:** `pickTargetFolder` Start Over branch  
  **Fix:** Delete only known generated paths or explicitly warn that Start Over resets the entire generated project.

- **Nit:** Step 6 is not failure-reported. A rejection from `globalState.update` or `vscode.openFolder` escapes the command without the required loud, recoverable explanation.  
  **Location:** `runTrySampleProject` after successful core creation  
  **Fix:** Catch landing/open failures and show an actionable message that includes the completed folder path.

- **Nit:** Step 7 duplicates the existing starter prompt rather than invoking or importing the existing affordance. Its test compares the duplicate against another literal, so the two implementations can drift silently.  
  **Location:** `buildSampleStarterLine` and its unit test  
  **Fix:** Reuse the existing prompt builder or execute the existing copy command.

- **Nit:** The rendered README gives both platforms’ test commands but only the Windows command for running `main.py`. macOS/Linux users following the manual section must infer the missing command.  
  **Location:** `docs/templates/sample-project/files/README.md`  
  **Fix:** Add `.venv/bin/python main.py` alongside the Windows command.