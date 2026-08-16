ISSUES FOUND

- **Issue 1:** The VS Code pointer path is knowingly wired to a black-frame backend and its required artifact proof fails.
  - **Category:** Correctness / Completeness
  - **Severity:** Major
  - **Evidence paths:** `tools/dabbler-ai-orchestration/scripts/obs-capture.js`, `tools/dabbler-ai-orchestration/scripts/record-vscode-walkthrough.js`, `tools/dabbler-ai-orchestration/scripts/pointer.js`, `docs/session-sets/113-narrated-video-walkthroughs/s7-pointer-visibility-vscode.json`, `docs/session-sets/113-narrated-video-walkthroughs/s7-cursor-capture-backends.json`
  - **Failure scenario:** Every VS Code run requesting `physicalPointer` sets `needCursorVisible`, which unconditionally selects BitBlt. The committed backend measurement says BitBlt black-frames Electron, and the committed visibility result is `FAIL`. This is the main VS Code recording path, so cursor-enabled recordings will probably contain unusable frames or no visible pointer rather than the promised workbench-plus-pointer.
  - **Acceptance criterion:** `JUDGMENT - A recording made through the supported VS Code recorder must show both a real non-development-host VS Code window and the moving pointer at every click target, its feature-off control must fail the same pixel check, and pointer/backend unavailability must prevent an apparently successful cursor-enabled recording.`
  - **Details:** **Violation:** The plan requires the physical pointer to be visible in recorded frames and ends with “every recording this framework makes shows a pointer that moves.” **Impact:** The primary Windows recording path cannot produce the promised tutorial artifact; merging it would bless a mode already measured to fail. **Evidence:** `ObsCaptureSession.configure()` selects `CAPTURE_METHOD_BITBLT` whenever `needCursorVisible` is true; `record-vscode-walkthrough.js` sets that option for both pointer and control runs; the backend report records `windowPresent: false` for BitBlt; and the VS Code visibility artifact records zero passed probes and verdict `FAIL`. The correct result is a supported, fully evaluated backend or equivalent capture method that produces both window and cursor, with cursor-enabled runs failing closed when that cannot be achieved.

- **Issue 2:** The pointer visibility checker can pass without proving that a cursor is visible at every click.
  - **Category:** Correctness / False Positive
  - **Severity:** Major
  - **Evidence paths:** `tools/dabbler-ai-orchestration/scripts/check-pointer-visible.js`, `tools/dabbler-ai-orchestration/scripts/record-vscode-walkthrough.js`, `docs/session-sets/113-narrated-video-walkthroughs/s7-pointer-visibility-vscode.json`
  - **Failure scenario:** Moving the real pointer over a typical VS Code tree row changes hover backgrounds or reveals row actions even when the capture backend omits the cursor. The checker only asks whether “something” changed in the target crop while one unrelated control crop stayed still, so ordinary hover rendering can satisfy the cursor test. It also returns `PASSED` when any probe passes and the remaining probes are `indecisive`; nearby successive targets are common, and the committed VS Code run already produced two indecisive probes.
  - **Acceptance criterion:** `JUDGMENT - A cursor-hidden recording in which real mouse movement causes target hover changes must fail the visibility check, and an overall pass must require affirmative cursor evidence for every synthesized click rather than allowing indecisive probes.`
  - **Details:** **Violation:** The required proof is that “a pointer is visible in the recorded frames near the target’s bounding box at the moment of the click,” not merely that target pixels changed. **Impact:** The falsifier can certify a cursor-free recording, undermining the session’s load-bearing artifact proof. This is probable because hover effects are normal on interactive controls and repeated nearby targets already occur in the supplied scenario. **Evidence:** The pass branch tests only `targetChanged >= 0.03` and a static top-left control; its detail explicitly says “something appeared.” Final verdict logic allows `passed > 0`, `failed == 0`, and arbitrarily many `indecisive` probes to pass. The correct instrument must identify cursor-shaped/moving evidence or use a differential design that excludes hover changes, and it must not treat unverified clicks as successful.

- **Issue 3:** The required human-driven long-form capture harness was not built.
  - **Category:** Completeness
  - **Severity:** Major
  - **Evidence paths:** `tools/dabbler-ai-orchestration/scripts/record-vscode-walkthrough.js`, `tools/dabbler-ai-orchestration/scripts/measure-pointer-visibility.js`, `tools/dabbler-ai-orchestration/scripts/measure-cursor-capture-backends.js`, `docs/tutorials/single-module-walkthrough.md`
  - **Failure scenario:** An operator beginning a real shipped-product session has no harness that starts recording a normal VS Code window, waits while the human works, stops around session boundaries, and names the file by set/session. The only changed VS Code recorder still launches an Extension Development Host, creates a UAT workspace, and executes authored scenario mechanics, so a typical operator cannot make the required long-form recording without manually assembling unsupported commands.
  - **Acceptance criterion:** `JUDGMENT - The tree contains and documents an opt-in start/stop harness for a human-driven session in a normal VS Code window, names one recording by set and session, and demonstrably does not write lifecycle state or drive the orchestrator.`
  - **Details:** **Violation:** Step 3 requires capture “around a real session in a real VS Code window, not the Extension Development Host,” with the driver explicitly being a person. **Impact:** The core genre change has not been implemented, so the tutorial cannot be recorded through the framework. **Evidence:** `record-vscode-walkthrough.js` remains a Playwright scenario driver using `--extensionDevelopmentPath` and a generated UAT workspace; the new measurement scripts are expressly measurements rather than recorders. The correct fix is a separate observational human-session harness, not another scenario wrapper.

- **Issue 4:** The speed-ramp algorithm does not derive waiting intervals; it treats every unmarked gap as waiting.
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `ai_router/speed_ramp.py`, `ai_router/tests/test_speed_ramp.py`, `docs/tutorials/single-module-walkthrough.md`
  - **Failure scenario:** During the intended human-driven tutorial, the operator reads, types, reviews AI output, or edits a plan between sparse lifecycle timestamps. `build_segments()` preserves only a three-second pad around each point mark and compresses the rest by up to 40×. Those active stretches are therefore likely to be sped through even though something happened, materially damaging the tutorial.
  - **Acceptance criterion:** `JUDGMENT - Given a representative human session record containing active intervals between lifecycle events, the generated plan must preserve those intervals at 1x and compress only intervals whose event semantics establish that the session was waiting.`
  - **Details:** **Violation:** The plan says waiting is “derivable” from the framework record and commands “never compress an interval where something happened.” **Impact:** The main tutorial workflow can compress the human work viewers need to see; manual advice to inspect the plan does not satisfy the promised derivation or invariant. **Evidence:** `build_segments()` constructs six-second keep regions around timestamp points and `_quiet_segments()` labels every remaining gap “nothing was recorded,” without interpreting start/end event types or activity durations. The tutorial itself admits that a person reading looks exactly like a running suite. The correct implementation must derive intervals from event semantics or collect explicit activity/wait boundaries rather than infer waiting solely from timestamp absence.

- **Issue 5:** The single-module tutorial deliverable is only a proposed outline; the project, generated walkthrough source, recordings, ramp plans, and per-video completion evidence are absent.
  - **Category:** Completeness
  - **Severity:** Major
  - **Evidence paths:** `docs/tutorials/single-module-walkthrough.md`, `tools/dabbler-ai-orchestration/scripts/record-vscode-walkthrough.js`, `tools/dabbler-ai-orchestration/scripts/record-web-walkthrough.js`, `ai_router/speed_ramp.py`
  - **Failure scenario:** A user following the promised tutorial finds a document explicitly marked “not yet recorded,” no purpose-built `unit-converter` project/session sets, and no videos showing real AI-assisted planning and decomposition. Because the complete diff contains no recordings or ramp-plan artifacts, the session’s principal watchable deliverable does not exist.
  - **Acceptance criterion:** `JUDGMENT - The purpose-built one-module project and three session sets exist; the written walkthrough is rendered from its Session 2 scenario source; every declared session has a named recording showing the required real AI/human lifecycle; each raw session satisfies the approximately fifteen-minute sizing rule; and each watchable output has a reviewable per-segment ramp plan and human publication-safety record.`
  - **Details:** **Violation:** Step 4 requires authoring **and recording** the tutorial, showing AI helping author and decompose the plan, while the `Creates` and `Ends with` clauses require one watchable video per session with waiting compressed and compression stated. **Impact:** The main user-facing objective is wholly unavailable, which necessarily changes the merge decision. **Evidence:** The walkthrough says “Recording status: not yet recorded” and “What the recordings are waiting on”; no video, toy-project, three-set scenario source, or tutorial ramp-plan artifact appears in the supplied complete diff. The document is hand-authored rather than shown as a render from Session 2 scenario source. The correct result is the actual reproducible tutorial artifact set, not instructions for producing it later.

## NITS

- **Nit:** `collect_marks()` silently ignores malformed JSON on every line of `session-events.jsonl`, although the comment justifies this only for a half-written final line. An interior corrupt line can hide activity and cause unsafe compression. Limit tolerance to the final unterminated line or report skipped records.  
  **Location:** `ai_router/speed_ramp.py`

- **Nit:** `build_segments()` removes every segment at or below 50 ms after rounding, which can leave untiled source gaps even though the tests claim the entire recording is preserved. Preserve tiny segments or merge them into an adjacent segment.  
  **Location:** `ai_router/speed_ramp.py`

- **Nit:** `apply_plan()` does not verify that the input video’s duration or identity matches the plan. Applying a valid plan to the wrong recording can silently produce a misleading edit. Record and validate source duration and preferably a file fingerprint.  
  **Location:** `ai_router/speed_ramp.py`

- **Nit:** Timestamp and numeric CLI errors such as malformed ISO-8601 values escape as `ValueError` because `main()` catches only `SpeedRampError`; negative pad/rate/threshold values are also not validated. Convert these to actionable `SpeedRampError` refusals.  
  **Location:** `ai_router/speed_ramp.py`

- **Nit:** The visibility checker derives recording start offset as `last event time - video duration`, which is valid only if the last event coincides exactly with the final video frame. The VS Code artifact already has a video longer than the last event and therefore clamps the estimate to zero. Use an explicit recording-start anchor written by the recorder.  
  **Location:** `tools/dabbler-ai-orchestration/scripts/check-pointer-visible.js`, `docs/session-sets/113-narrated-video-walkthroughs/s7-pointer-visibility-vscode.json`

- **Nit:** Mixed-DPI calibration still begins by multiplying the absolute `window.screenX/screenY` by the current display DPR and has no implemented retry, despite comments claiming that mixed-scale monitors are handled and that a bad estimate merely costs a retry. This can disable the pointer on secondary monitors. Derive physical display origin correctly or probe/retry from OS window bounds.  
  **Location:** `tools/dabbler-ai-orchestration/scripts/pointer.js`

- **Nit:** The web implementation adds an independent pointer-injection lifecycle instead of extending `applyEmphasis`, contrary to the stated “rather than adding a second mechanism” constraint. It also cannot guarantee visibility over browser top-layer elements such as native dialogs. Integrate the element/style lifecycle with the existing emphasis injection and cover top-layer targets.  
  **Location:** `tools/dabbler-ai-orchestration/scripts/pointer.js`, `tools/dabbler-ai-orchestration/scripts/record-web-walkthrough.js`

- **Nit:** The publication checklist has no completed per-video human records, and its suggested JSON outcome does not preserve confirmation of each required checklist item. Its advice that a reviewer may “scrub” a long video can also skip transient toasts or secrets. Add item-level attestations and require complete temporal review when recordings exist.  
  **Location:** `docs/walkthroughs/publication-safety-checklist.md`

- **Nit:** The changelog claims successful real-data planning and end-to-end ffmpeg application, but no corresponding real ramp plan or application report is present in the supplied diff. Commit the claimed evidence or qualify the statement.  
  **Location:** `ai_router/changelog.d/0017-set-113-s7-speed-ramp.md`