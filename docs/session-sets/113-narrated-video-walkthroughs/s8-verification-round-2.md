ISSUES FOUND

**Issue 1:** The gdigrab gate approves any waiver before checking what the waiver actually covers.
- **Category:** Correctness
- **Severity:** Major
- **Evidence paths:** `tools/dabbler-ai-orchestration/scripts/record-vscode-walkthrough.js:1114-1187`, `docs/session-sets/113-narrated-video-walkthroughs/s8-operator-waiver.json:19-52`, `docs/session-sets/113-narrated-video-walkthroughs/spec.md:674-679`
- **Failure scenario:** A Session 9 or later re-measurement records an unwaived gdigrab failure such as C2/C5/C6, but the committed `s8-operator-waiver.json` still exists. `captureApproval("gdigrab")` returns approved solely because `waivedBy` and `attestation` are present, so recording proceeds even though the waiver explicitly does **not** waive C1-C6 or C7’s no-audio/single-source clauses. This is probable because the waiver is now persistent gate state and the backend is immediately reused by Session 9.
- **Acceptance criterion:** `JUDGMENT - captureApproval only approves gdigrab when the requested backend and criteria digest match, every unwaived criterion/clause is met by the measurement, and every remaining unmet criterion/clause is explicitly covered by the waiver.`
- **Details:** Violation: the spec says a new backend “does not silently unlock” the gate and waiver is “Not the orchestrator’s call”; the waiver says “Nothing in C1-C6 is waived.” Impact: a safety/publication gate can open on unwaived failures, changing the merge/use decision. Evidence: `captureApproval` returns approved at lines 1153-1161 before evaluating `evaluation.verdict` or `evaluation.unmet`.

**Issue 2:** C5 is marked measured even though missing ffmpeg/ffprobe are not run through the walkthrough recorder.
- **Category:** Completeness
- **Severity:** Major
- **Evidence paths:** `docs/session-sets/113-narrated-video-walkthroughs/s4-pilot-criteria.json:65-78`, `tools/dabbler-ai-orchestration/scripts/measure-gdigrab-capture.js:545-620`, `tools/dabbler-ai-orchestration/scripts/measure-gdigrab-capture.js:819-860`, `docs/session-sets/113-narrated-video-walkthroughs/s8-gdigrab-capture-measurement.json:1126-1174`
- **Failure scenario:** On a fresh workstation missing ffmpeg or ffprobe, the recorder path could fail before writing a manifest or preserving the no-video walkthrough, but the C5 pass would not catch it because those variants only call `GdigrabCaptureSession.prepareHost()`. Missing ffmpeg/ffprobe is a probable real-user state because the session prerequisites explicitly require installing them.
- **Acceptance criterion:** `JUDGMENT - Each missing-dependency C5 variant is exercised through the real recorder entry path and the artifact/evaluator require that variant to show a named failure, manifestWritten=true, walkthroughStillCompleted=true, and zero video artifacts.`
- **Details:** Violation: C5’s claim is “Every way the dependency can be missing produces a named failure, and the walkthrough still completes without a video.” Impact: the backend can be declared measured against all seven criteria while the common missing-dependency UX is only half-tested. Evidence: the ffmpeg/ffprobe variants construct `GdigrabCaptureSession` and call `prepareHost()` directly; the artifact variants contain `threw/kind/message/videoArtifacts` but not per-variant `manifestWritten` or `walkthroughStillCompleted`.

**NITS**
- **Nit:** `measure-pointer-visibility.js` reports “every probed target” for any passed pointer run, but the current artifact has only 1 passed probe and 5 indecisive probes. The lower-level counts expose the truth, so this is wording/summary overconfidence rather than a blocking defect.