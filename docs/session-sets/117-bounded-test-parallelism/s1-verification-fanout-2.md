ISSUES FOUND

- **Issue 1: The experiment does not re-test the previously failing configuration under controlled conditions**
  - **Category:** Completeness
  - **Severity:** Major
  - **Failure scenario:** Sessions 2 and 3 use the DENICI result to select a worker policy that is then run on the smaller 14-core work machine. Because that machine was never rerun with the final isolation change, the original failures or contention can recur there. This is probable because the documentation says sessions run on both machines and identifies the smaller host as the binding constraint.
  - **Acceptance criterion:** JUDGMENT - Evidence records a final-isolation rerun of the previously failing worker configuration on the same 14-core host, and every ceiling claim is bounded by the highest worker count actually demonstrated safe.
  - **Details:**
    - **Violation:** The plan says, “The hypothesis this session exists to settle: **the failures and the poor speedup have one cause, and it is shared state, not CPU**” and directs, “**Re-run the 8-worker configuration that previously failed.**”
    - **Impact:** A reasonable reviewer cannot accept the central causal and ceiling deliverable when hardware and isolation changed simultaneously. This directly affects the downstream worker-setting decision.
    - **Evidence:** The prior failures were measured on the 14-core / 31.5 GB work machine, while this sweep ran on DENICI with 20 CPUs / 63.8 GB. The report itself admits: “**Two things changed at once — full per-launch isolation, and a machine with 6 more cores and twice the RAM — so this does not by itself prove the isolation fixed the 14-core failures.**” It nevertheless says the ceiling is “**above 12**,” although no count above 12 was tested.
    - **Correct answer:** The current data establishes only observed DENICI behavior through 12 workers. The original causal hypothesis remains unresolved until the final isolation is tested on the host where the original failure occurred.

- **Issue 2: The race-vs-contention verdict asserts causal conclusions the observations do not support**
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** Session 2 follows the explicit recommendation to exclude `vsix-first-run-walkthrough` from its green-run control on the assumption that it is independent of isolation and load. A load-sensitive synchronization defect or an isolation-induced pip failure is then hidden, allowing an unsafe worker setting to pass the acceptance control. This is probable because the test failed in two of four w=8 runs and the report explicitly instructs Session 2 to exclude it or treat it as an unrelated flake.
  - **Acceptance criterion:** JUDGMENT - The report either supplies mode-specific controlled evidence and logs proving each causal exclusion and failure-rate estimate, or rewrites those conclusions as unresolved hypotheses without directing Session 2 to discount the failures.
  - **Details:**
    - **Violation:** Step 4 requires a defensible “**race-vs-contention verdict**” and precise recording. Instead, the report states “**NOT CPU contention**,” “**NOT shared state**,” “**NOT parallelism at all**,” and calls Mode 2 “**network-bound**.”
    - **Impact:** These unsupported exclusions change how downstream sessions interpret failures and whether their three-green-run control is meaningful.
    - **Evidence:** The failure observed alone was Mode 2, while both w=8 failures of Mode 1 were different UI-timeout failures. A Mode 2 isolation failure cannot disprove load sensitivity of Mode 1. Zero failures in only three w=12 runs does not statistically refute a load-related failure, and worker count does not prove the relevant F1 action experienced greater instantaneous load. No pre/post controlled isolation comparison or failure logs establish that the 300-second Mode 2 timeout was caused by PyPI rather than extension behavior, pip configuration, or the newly empty HOME/APPDATA. The claimed “roughly a 1-in-4 rate at any worker count” is derived by pooling heterogeneous worker counts and two distinct failure modes.
    - **Correct answer:** Record the observed counts and modes, but classify their causes as unresolved without controlled mode-specific evidence.

## NITS

- **Nit:** Issue → Launch failures leak all newly created state directories, and an activity-bar timeout can also leave the launched application inaccessible to caller cleanup. Location → `electronLaunch.ts`, resource creation through `_electron.launch()` and `.activitybar.waitFor()`. Fix → Wrap acquisition and startup in failure cleanup that closes any created app and removes `userDataDir`, `extensionsDir`, and `state.root`.

- **Nit:** Issue → Callers can silently defeat the promised isolation because `extraEnv` is spread after `state.env`. Location → `electronLaunch.ts`, `_electronEnv({ ...state.env, ...(extraEnv || {}) })`. Fix → Apply `state.env` last or reject `APPDATA`, `LOCALAPPDATA`, `HOME`, and `USERPROFILE` in `extraEnv`.

- **Nit:** Issue → The HOME-isolation risk analysis considers git but overlooks pip, despite the documented walkthrough running a real pip installation. User pip proxy, index, certificate, or authentication configuration commonly resides under HOME or APPDATA and is hidden by this change. Location → `decisions.jsonl` HOME/USERPROFILE decision and `s1-worker-sweep-DENICI.txt` Mode 2 analysis. Fix → Make the pip invocation self-contained or explicitly document and validate the required pip environment/configuration.

- **Nit:** Issue → The containment test can accept paths outside the root when they merely share its string prefix. Location → `launchStateIsolation.test.ts`, `path.resolve(p).startsWith(path.resolve(root))`. Fix → Use `path.relative(root, p)` and reject absolute results or results beginning with `..`.

- **Nit:** Issue → The “staged walk workspace is still readable” test does not exercise `stage-walk.js`, the scoped child environment, or a launched extension; it only calls `readSessionSets` on a fixture deliberately placed under the temporary root. Location → Final suite in `launchStateIsolation.test.ts`. Fix → Test the actual staging/environment composition through an injectable launch seam or rename the test so it does not claim end-to-end coverage.

- **Nit:** Issue → The Windows layout comment says it mirrors the real profile layout, but it creates `<root>/Roaming` and `<root>/Local`, not `<root>/AppData/Roaming` and `<root>/AppData/Local`. Location → `vscode-launch.js`, `makeLaunchStateDirs`. Fix → Correct the comment or create the stated layout.

- **Nit:** Issue → “Every other Layer 3 test passed in every run” is inaccurate because `real-host-baseline` was excluded from all sweep runs. Location → `s1-conventions.md`, suite baseline. Fix → Say every other included test passed, or explicitly name the excluded test in that claim.