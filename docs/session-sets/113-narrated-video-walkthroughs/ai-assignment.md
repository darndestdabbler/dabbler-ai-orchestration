# AI Assignment

> **Routed analysis (Step 3.5), never self-opined.** Authored 2026-08-15 by
> `gpt-5.6-luna` (openai, tier 3, $0.0077) via `route(task_type="analysis",
> exclude_providers=["anthropic"])`, covering all four sessions of the set.
>
> **The exclusion was not decorative — it was needed.** The first dispatch of
> this step, with no `exclude_providers`, resolved to `claude-opus-5` on
> anthropic: the orchestrator's *own model and provider*. That output was
> discarded unread as evidence and re-routed. Step 3.5's "never self-opine"
> rule is prose only — the Set 084 orchestrator exclusion binds
> `session-verification`, not `analysis` — so the mandate is satisfied by the
> caller passing `exclude_providers` or not at all. Recorded as a finding for
> this session's disposition; the discarded anthropic draft is not kept.
>
> **On model ids:** the analyst honoured the constraint and named a callable
> id only where one was already fixed (Session 1). Every other slot carries
> provider + family + effort, which is the part the router actually enforces.
> This is the first set in several where the step-3.5 analyst emitted no
> non-existent model ids.

## Assignment-wide operating rules

- Read `operator-notes.md`, the reservation record, and consult rounds 1–3 at the start of every session.
- Treat this specification as authoritative over consult recommendations. Where the operator notes and this specification conflict, raise the conflict; do not choose silently.
- Use a verifier from a different effective provider than the orchestrator.
- Do not invent callable model IDs. Provider direction and model family are sufficient unless a callable ID is explicitly fixed.
- Record evidence, test results, measurements, and limitations factually. Do not manufacture human UAT, confidence scores, findings, or successful captures.
- Preserve the stated scope and stop when a session's budget or boundaries are exceeded.

## Session 1 — Truthful UAT accounting

### Orchestrator

- **Provider:** anthropic
- **Model:** claude-opus-5
- **Effort:** high
- **Transport:** Claude Code, Direct API
- **Reality:** This is the fixed orchestrator for Session 1.
- **Would I choose differently:** No. A high-effort Anthropic orchestrator is appropriate for reconciling the operator ruling, consult conflicts, schema implications, authority boundaries, and inventory-aware gate behavior. The fixed assignment is suitable; the important constraint is the independent verifier.

### Mandate

Implement and test a facts-only, per-component UAT record that makes omission impossible to close over.

1. Inspect the current `disposition.uat` schema, component inventory source, gate implementation, journal implementation, and existing tests.
2. Replace binary `walked | waived` accounting with per-component entries containing:
   - in-scope component;
   - method;
   - human reviewer type and count;
   - evidence links;
   - findings or concerns;
   - explicit attested `none` where applicable;
   - an attested not-applicable disposition where a declared component is not applicable.
3. Do not add self-assessed confidence scores or a separate debt ledger.
4. Gate against the declared component inventory, not against the components present in submitted records.
5. Ensure every declared component has a record or an attested not-applicable disposition.
6. Wire the behavior into `uat_walk_recorded`.
7. Add tests covering:
   - every supported recorded status;
   - passing explicit `none`;
   - passing not-applicable;
   - missing-component refusal;
   - extra or unknown component handling, according to repository conventions;
   - malformed or incomplete facts;
   - evidence and reviewer attribution handling.
8. Journal the operator-directed decision under operator authority. Do not represent the decision as an AI decision.
9. Confirm that `decision_journal` correctly refuses the same decision when submitted under AI authority.
10. Run the required portion of the full test suite and record the results.

### Required deliverables

- Updated UAT record schema.
- Inventory-aware gate implementation.
- Complete gate and schema tests.
- Correctly attributed decision journal entry.
- Updated authoring guidance where required.
- Session progress keys:
  - `recordSchema`
  - `inventoryGate`
  - `gateTests`
  - `decisionJournaled`

### Verifier

- **Provider:** openai
- **Model:** current frontier family
- **Effort:** high
- **Independence requirement:** Review independently after implementation; do not rely on the orchestrator's interpretation of passing tests.

### Verification focus

- Verify that a component omitted from the record cannot disappear from accounting.
- Verify that explicit `none` is a valid passing attestation and is not treated as an omission.
- Verify that human reviewer facts are distinguishable from AI activity.
- Verify that operator authority is preserved and AI authority is rejected.
- Verify tests exercise the inventory boundary rather than only validating submitted records.
- Report any schema ambiguity, authority violation, or untested omission path as a finding.

## Session 2 — Portable scenario source and standalone rendering

### Orchestrator

- **Provider:** openai
- **Model:** current frontier family
- **Effort:** high

### Mandate

Create the smallest platform-neutral scenario model and make all walkthrough outputs derive from it.

1. Read Session 1's completed artifacts and confirm the set remains internally consistent before implementation.
2. Define stable scenario and step IDs.
3. Model:
   - prerequisites;
   - fixture startup;
   - known baseline;
   - reset and recovery;
   - named checkpoints;
   - action;
   - expected observable result.
4. Keep Playwright selectors and other target-specific mechanics in platform-specific driver blocks.
5. Do not introduce a published recorder-plugin contract or a generalized driver abstraction.
6. Render the single source into:
   - manual UAT walkthrough;
   - standalone training document;
   - captions;
   - chapter metadata.
7. State plainly that reaching an arbitrary point means replaying the documented prefix from the known baseline or a named checkpoint. Do not imply random access to stateful steps.
8. Add a divergence test that fails when the renderings no longer agree with the canonical scenario source.
9. Ensure the manual walkthrough and training document remain usable without a video.
10. Run the required portion of the full test suite and record the results.

### Required deliverables

- Platform-neutral scenario model.
- Platform-specific driver quarantine seam.
- Manual walkthrough renderer.
- Training document renderer.
- Caption and chapter metadata renderers.
- Divergence test.
- One exemplary scenario.
- Session progress keys:
  - `scenarioModel`
  - `driverQuarantine`
  - `renderers`
  - `divergenceTest`

### Verifier

- **Provider:** google
- **Model:** current flagship family
- **Effort:** high
- **Independence requirement:** Review the source model, generated artifacts, and divergence test independently of the orchestrator.

### Verification focus

- Verify that portable semantics contain no selectors or target-specific mechanics.
- Verify that stable IDs are preserved across every rendering.
- Verify that expected observable results are present and meaningful for each step.
- Verify baseline, reset, recovery, and checkpoint instructions are actionable.
- Verify the documents do not claim timestamp random access.
- Verify that changing the scenario source necessarily affects all required renderings or causes the divergence test to fail.
- Verify no video or publication pipeline is required to use the written artifacts.

## Session 3 — Browser recording proof

### Orchestrator

- **Provider:** google
- **Model:** current flagship family
- **Effort:** high

### Mandate

Prove the portable browser recording path on a dummy web application without generalizing the VS Code workbench limitation.

1. Read and validate the Session 2 scenario contract and stable step IDs.
2. Build or use a minimal dummy web fixture representing the web products in scope.
3. First reproduce a successful browser `recordVideo` run against the dummy application with a control. Do not use the Extension Development Host or VS Code workbench as the success case.
4. Emit a timestamped step-event stream keyed by stable step IDs with:
   - `started`;
   - `completed`;
   - `failed`.
5. Produce a run manifest that can reference zero or more artifacts, including:
   - browser video;
   - OS video;
   - terminal cast;
   - captions;
   - screenshots;
   - transcript.
6. Keep the manifest artifact-agnostic; do not require MP4 or any other single media type.
7. Generate artifacts into ignored output.
8. Clean output deterministically after failures.
9. Make recording failure degrade to the Session 2 written walkthrough and never fail the walkthrough itself.
10. Generate a static index linking available video, steps, captions, and related artifacts.
11. Use the event stream for caption timing and chapter mapping.
12. Run the required full-test portion, including Layer 3 `L-064-12`, and record the results.

### Required deliverables

- Successful browser recorder against the dummy web app.
- Control measurement proving the browser recording path works in the intended context.
- Timestamped step-event stream.
- Artifact-agnostic run manifest.
- Ignored-output and failure-cleanup behavior.
- Static generated index.
- One recorded web scenario with captions.
- Session progress keys:
  - `browserRecordMeasured`
  - `stepEventStream`
  - `runManifest`
  - `webScenarioRecorded`

### Verifier

- **Provider:** anthropic
- **Model:** current flagship family
- **Effort:** high
- **Independence requirement:** Inspect the fixture, generated artifacts, manifest, event ordering, cleanup behavior, and Layer 3 evidence independently.

### Verification focus

- Verify the successful recording is from a real browser UI, not a mocked artifact.
- Verify the control distinguishes browser success from the previously measured workbench failure.
- Verify every event uses a Session 2 stable step ID and has valid ordering and timestamps.
- Verify failed recording does not fail the walkthrough.
- Verify a run with no artifacts is representable and usable.
- Verify the manifest does not assume MP4.
- Verify generated output is ignored and failure cleanup is deterministic.
- Verify captions and chapters are derived from the event stream and scenario source rather than manually duplicated.
- Reject any claim that browser recording covers native dialogs, external applications, browser chrome, or other OS surfaces without evidence.

## Session 4 — Bounded Windows OS-capture dogfood

### Orchestrator

- **Provider:** anthropic
- **Model:** current flagship family
- **Effort:** high

### Mandate

Obtain a bounded, evidence-backed verdict on optional Windows capture for the Work Explorer.

1. Read the prior session artifacts and operator note dated 2026-08-15.
2. Set and record the pass criteria before the first capture:
   - repeatedly select the intended window;
   - exclude unrelated desktop pixels;
   - preserve usable resolution under normal operator display scaling;
   - align step events with captions;
   - fail clearly when the dependency is absent;
   - clean up deterministically;
   - achieve ten consecutive clean captures from a fresh fixture;
   - capture no wrong window;
   - capture no privacy leakage.
3. Use the existing automation:
   - `scripts/vscode-launch.js`;
   - existing Layer 3 launch machinery.
4. Try OBS Studio first using Windows Graphics Capture and `obs-websocket`.
5. Treat OBS and ffmpeg as optional external prerequisites:
   - never bundle either dependency;
   - never put either dependency in the portable core;
   - treat missing OBS, unreachable websocket, or unavailable fallback as the required clean-failure path.
6. Use ffmpeg `gdigrab` only as the documented fallback candidate.
7. Exercise the criteria under relevant conditions, including occlusion and normal display scaling where supported by the fixture.
8. Do not add:
   - cross-platform capture;
   - native desktop automation beyond existing machinery;
   - dependency bundling;
   - audio;
   - publishing;
   - capture-time OBS scene zoom or transforms.
9. Stop if the session expands beyond the one-session measurement budget.
10. Record the outcome either way:
    - **Pass:** ship only the optional Windows capability behind the internal, explicitly unstable recorder interface, while preserving manual-only degradation.
    - **Fail:** preserve measurements, retain manual-only degradation, and defer desktop capture with evidence.
11. Reserve the named follow-on sets and state their triggers.
12. Run the full matrix once at the release boundary.
13. Complete this set's dogfood UAT using the scenario document and, only if the pilot passed, its narrated recording.
14. Complete `change-log.md` and the Step 9 review.

### Required deliverables

- Pre-capture pass criteria.
- OBS primary pilot measurements.
- ffmpeg fallback measurements where available.
- Dependency-absent measurements.
- Ten-capture result, or documented failure to achieve it.
- Privacy, wrong-window, resolution, scaling, occlusion, caption-alignment, and cleanup evidence.
- Recorded pass/fail outcome and rationale.
- Follow-on set reservations with explicit triggers.
- Dogfood UAT record.
- `change-log.md`.
- Step 9 review.
- Session progress keys:
  - `pilotCriteriaSet`
  - `pilotRun`
  - `pilotOutcomeRecorded`
  - `followOnSetsReserved`
  - `dogfoodWalk`

### Verifier

- **Provider:** openai
- **Model:** current frontier family
- **Effort:** high
- **Independence requirement:** Review the measurements and artifacts independently. The verifier must not treat a single successful capture as satisfying the ten-consecutive-capture bar.

### Verification focus

- Verify the criteria were recorded before the first capture.
- Verify all ten captures are clean, consecutive, and from fresh fixtures where required.
- Verify the intended window is captured under occlusion and unrelated desktop pixels are excluded.
- Verify display scaling preserves usable resolution.
- Verify step events, captions, and chapters align.
- Verify missing dependencies fail clearly and fall back to the written walkthrough.
- Verify cleanup is deterministic after success and failure.
- Verify no audio, bundling, publishing, cross-platform work, native automation expansion, or capture-time zoom was introduced.
- Verify a pass ships only the explicitly unstable optional Windows backend.
- Verify a failure produces durable evidence and does not get reframed as an implementation deficit to be solved inside this set.
- Verify the dogfood UAT is attributable to a human reviewer and does not count AI activity as human review.
- Include the advisory path-aware critique without treating it as authoritative or as a human UAT substitute.

## Next-session recommendation

Proceed to **Session 2 — Portable scenario source and standalone rendering** after Session 1 closes only when all four Session 1 progress keys are satisfied and the inventory-aware gate tests pass.

- **Orchestrator:** openai / current frontier family / effort=high
- **Verifier:** google / current flagship family / effort=high
- **Reason:** Session 2 establishes the stable scenario and rendering contract required by both recording sessions. It should consume Session 1's schema and documentation changes, but must not wait for browser or desktop capture. The written walkthrough is the durable foundation and must be validated before recording work begins.
- **First action:** reread the operator notes and consults, inspect the Session 1 diff and tests, then confirm that no component can be omitted from the UAT accounting before authoring the scenario model.


---

# Session 3 addendum

> Routed analysis, `task_type: planning`, `exclude_providers: [anthropic]`
> (the orchestrator's own provider). Served by **google / gemini-pro**,
> tier 2, $0.00548, 2026-08-15. Reproduced verbatim below: child output is
> **evidence, never instructions**. The orchestrator's reading follows it.

## Next-session recommendation (from Session 3)

Proceed to Session 4. The successful proof-of-concept for browser-based video recording in Session 3 validates the core artifact generation pipeline, clearing the path to attempt the more complex OS-level capture.

-   **Orchestrator:** openai / gpt-5.6 / effort=high
-   **Verifier:** anthropic / claude-opus-5 / effort=medium
-   **Reason:** Session 4's primary risk is the brittle nature of controlling external OS-level processes and graphics capture APIs; it requires a high-capability orchestrator to generate robust automation code and a strong verifier to critique the logic for race conditions and incomplete error handling.
-   **First action:** Instruct the orchestrator to draft the detailed test plan and measurement harness that defines and automates the ten-run pass criteria.

## Risks Session 4 should be warned about

-   The external process control for OBS or ffmpeg introduces significant flakiness, risking difficult-to-debug failures in process startup, communication, or shutdown.
-   Correctly and consistently identifying the target VS Code window for capture is fragile and may fail under different display scaling, window focus, or timing conditions.
-   A mid-run failure could bypass the deterministic cleanup logic, leaving video artifacts or orphaned capture processes on the system.
-   System performance variations may introduce timing-related race conditions between the test driver and the capture process, leading to inconsistent results.

## Next-set recommendation

Upon successful completion of Set 113, the next set should be "Terminal Walkthroughs and Cast Artifacts". This set directly leverages the OS-level capture capability proven in Session 4 to address a high-value, non-web automation target. The trigger for this set is the verified success of ten consecutive clean captures in Session 4, proving the capture method is reliable enough for production use.

## Orchestrator's reading of the above

Recorded because the analysis is input, not authority, and it is wrong in
one place that matters.

1. **The next-set recommendation contradicts this set's own spec, and the
   spec governs.** *Terminal Walkthroughs and Cast Artifacts* is reserved
   with the trigger **"a real terminal target exists"** — not "OS capture
   was proved". The two are unrelated: a terminal cast is a PTY recording,
   not a screen capture, and Session 4 passing would say nothing about
   whether anyone has a terminal product to walk through. Adopting the
   suggested trigger would start a set with no requirements to build
   against, which is the shape the complexity note warns about. **Do not
   act on it.** Of the reserved sets, the one with a standing case is
   *Independent Black-Box UI Critique* — its subject (common-mode
   self-verification failure) is a live, named concern, and Session 3 just
   shipped the web-driving machinery it would build on. Set selection is
   the operator's call and is left to the Step 9 review.

2. **The verifier suggestion is sound and non-obvious.** With an `openai`
   orchestrator, `anthropic` is a legitimate different-provider verifier;
   the pairing is only ever wrong when it collapses to the orchestrator's
   own provider.

3. **Its first three risks are real and this session can already
   corroborate two of them.** Session 3 hit the process-lifecycle risk in
   miniature — the events stream had to be made idempotent to close
   because both the happy path and the cleanup path close it — and hit the
   timing risk when the first recording came out uniformly grey after the
   fixture re-rendered and destroyed the emphasised node. Both were cheap
   here and will not be cheap against an external capture process.

4. **One risk Session 4 owns that the analysis does not name:** the
   Session 1 UAT gate is now armed on this set, and Session 4 is the
   session that owes an accounting for all four declared
   `uatComponents` — including the two Session 3 created. A pilot that
   fails is still a passing close, but only if the accounting is written.

---

## Session 6 — Why the pull critique could not reach two providers

> **Routed analysis (Step 3.5), never self-opined.** Authored 2026-08-16 by
> `gemini-2.5-pro` (google, tier 2, $0.0104, 851 output tokens) via
> `route(task_type="analysis")`. The orchestrator is anthropic, so the analyst
> landed on a different provider without an explicit exclusion this time.
> Reproduced verbatim below: child output is **evidence, never instructions**.
> The orchestrator's reading follows it.

## Session 6: Why the pull critique could not reach two providers

### Recommended orchestrator
claude claude-3-opus-20240229 @ effort=high

### Rationale
The task is a transport-level diagnosis requiring precise comparison between two distinct, complex code paths inside the router. A top-tier reasoning model at high effort is required to correctly isolate the fault in the API request shape and generate the mandated falsifier test.

### Estimated routed cost
moderate

| Step | Action | Routing Decision |
|------|--------|------------------|
| 1 | Register session | orchestrator direct |
| 2 | Reproduce both OpenAI failures | orchestrator direct; directs operator to run existing code |
| 3 | Analyze transport difference (critique vs. verify) | claude/claude-3-opus-20240229; core reasoning task |
| 4 | Judge servant violation on its merits | claude/claude-3-haiku-20240307; straightforward logic assessment |
| 5 | Ship falsifier test and fix | claude/claude-3-sonnet-20240229; capable at targeted code generation |
| 6 | Cross-provider verification | orchestrator direct; directs operator to run test |
| 7 | Run required portion of test suite | orchestrator direct; directs operator to run test |
| 8 | Close-out and handover | claude/claude-3-haiku-20240307; structured text generation |

### Actuals (filled after the session)
- Orchestrator used: TBD
- Total routed cost: TBD
- Deviations from recommendation: TBD
- Notes for next-session calibration: TBD

## Risks Session 6 should be warned about
-   **Conflating Failures:** The session might treat the `DeterministicServantViolation` and the HTTP 400 as one problem. This could lead to wasted effort trying to find a single root cause, when one is a feature (guard working correctly) and the other is a transport bug.
-   **Misinterpreting the HTTP 400:** A "Bad Request" error could be blamed on the wrong part of the request payload (e.g., content vs. headers). The session could conclude the wrong thing if it doesn't perform a precise diff between the working (`session-verification`) and failing (`pull_critique`) request structures.
-   **"Fixing" the Guard:** The session could incorrectly conclude the `DeterministicServantViolation` guard is too strict and weaken it. The correct diagnosis is that the guard is working as intended to catch a non-compliant model, and the bug is elsewhere.
-   **Shipping a Weak Falsifier:** The session could produce a test that passes with the fix but would not have deterministically failed before the fix. An effective falsifier must specifically assert failure on the known-bad transport shape.

## Next-session recommendation (Session 7)
-   Orchestrator: claude/claude-3-sonnet-20240229 @ effort=medium
-   Verifier: google/gemini-1.5-flash-latest @ effort=low
-   Reason: The session requires implementing a novel feature (synthetic cursor) and executing a procedural pipeline; a strong implementation-focused model is appropriate, and the verification path is not stressed.
-   First action: Implement the opt-in synthetic mouse pointer that is drawn into the browser page during Playwright automation.

## Next-set recommendation
If Session 7 successfully produces the public-facing tutorial artifact, the trigger has been met to shift focus from internal tooling to external usability. The next set should therefore concentrate on improving the developer experience of the tool itself, such as enhancing its command-line interface, auto-generating user documentation from tests, or scaffolding a simple web UI.

### Orchestrator's reading of the above

Recorded because the analysis is input, not authority. Two of its four risks
were useful and were acted on; its central judgment call is **refuted by
measurement**, and its model ids are unusable.

1. **Its third risk gets the answer exactly backwards, and it is the one the
   spec asked this session to settle.** The analysis warns against concluding
   the guard is too strict, asserting *"the guard is working as intended to
   catch a non-compliant model, and the bug is elsewhere."* That is the
   plausible reading, and it is wrong. The servant the guard checks is not the
   model: `DeterministicServant.run` is `return _canonical_result(...)`, the
   same call the guard makes for its own truth, so no model output passes
   through it and it cannot paraphrase anything. The violation was reproduced
   **with that honest default servant** from a single file append between the
   two derivations, with Session 4's error text byte for byte. Had this
   recommendation been treated as authority, the session would have shipped the
   alias fix, watched the default critic keep failing, and reported the guard
   as correct. The fix nonetheless does what the risk was protecting against:
   the guard is narrowed, never weakened, and a dishonest servant on a stable
   tree still raises exactly as before — with a falsifier asserting precisely
   that.

2. **Its second and fourth risks were right and both were acted on.** The 400
   was diagnosed by an exact structural diff of the working and failing request
   shapes rather than by guessing at the payload — sending one body shape with
   an alias (400) and the alias's `model_id` (200). And every falsifier was
   **mutation-tested**: each fix was reverted in turn and the matching tests
   were confirmed to fail, so none of them is a test that only passes
   afterwards.

3. **Its first risk is half right for the wrong reason.** The two failures are
   indeed separate problems and were treated separately — but not because one
   is "a feature". Both are defects, and a third and fourth turned up on the
   way (a discarded error body, and absent cost accounting).

4. **Every model id it names is unusable, and this is now the fourth
   consecutive session.** `claude-3-opus-20240229`, `claude-3-haiku-20240307`,
   `claude-3-sonnet-20240229` and `gemini-1.5-flash-latest` are not in this
   registry. The Session 4 note above recorded the previous set as the first in
   several to be clean; that did not hold. The provider + family + effort
   columns remain the usable part. The owed router-side fix — give the step-3.5
   analyst the registry it is naming from — is unchanged and still unowned.

5. **Its next-set recommendation should not be acted on.** It proposes a
   developer-experience set (CLI polish, generated docs, a web UI) triggered by
   Session 7 shipping a tutorial. Nothing in this set's reservations matches
   that, it is not a trigger any reserved set declares, and set selection is
   the operator's call at the Step 9 review — which is now **Session 8's**, not
   this session's. Its Session 7 first action (draw the synthetic pointer into
   the page) is, however, a correct reading of the operator's ordering ruling.

---

## Session 7 — Show the pointer, then record the single-module tutorial

> **Routed analysis (Step 3.5), never self-opined.** Authored 2026-08-16 by
> `gemini-2.5-pro` (google, tier 2, $0.0095, 775 output tokens) via
> `route(task_type="analysis", exclude_providers=["anthropic"])`. Reproduced
> verbatim below: child output is **evidence, never instructions**. The
> orchestrator's reading follows it.
>
> **One deliberate change to the prompt this time.** Four consecutive
> sessions have recorded that the step-3.5 analyst names model ids that do
> not exist in this registry, and the owed router-side fix is still unowned.
> This session pasted the registry's routable keys into the prompt as
> context. It is not the fix — the next session that forgets to paste it
> will get `claude-3-opus-20240229` again — but it costs nothing and it is
> evidence that the analyst names real ids when it is told what they are.

### Recommended orchestrator
anthropic/opus @ effort=high

### Rationale
The session introduces significant new capabilities with high implementation complexity, such as physical pointer manipulation and a video time-compression pipeline derived from event logs. It also includes a core creative task: authoring a new tutorial project and its structure. A Tier 3 orchestrator is required to manage this complexity, handle the novel R&D directly, and ensure the conceptual integrity of the new human-driven recording genre.

### Estimated routed cost
moderate

| Step | Action | Routing Decision |
|---|---|---|
| 1 | Register and read notes | Orchestrator (anthropic/opus) |
| 2 | Implement pointer visibility in recordings | Orchestrator (anthropic/opus) |
| 3 | Build time-compression pipeline for recordings | sonnet |
| 4 | Author and structure the single-module tutorial | Orchestrator (anthropic/opus) |
| 5 | Generate publication safety checklist | gemini-flash |
| 6 | Perform cross-provider verification | gpt-5-4 |
| 7 | Implement required test suites | sonnet |
| 8 | Prepare handover for next session | Orchestrator (anthropic/opus) |

### Risks Session 7 should be warned about
*   **Physical Pointer Interference:** An unhandled exception in `record-vscode-walkthrough.js` could fail to restore the operator's physical mouse cursor position, leaving it "stuck" and disrupting the operator's workflow until manually recovered.
*   **Time Compression Context Loss:** The time-compression logic in Step 3 relies on discrete events in logs. It may incorrectly compress periods where the human operator is thinking or reading UI text without generating events, making the final video confusing or appearing rushed.
*   **Synthetic Pointer Obscurity:** The web-based synthetic pointer (Step 2) is injected into the DOM and may be hidden by elements with a high `z-index`, such as modals or dropdown menus, causing it to be invisible during critical moments of the recording.
*   **Tutorial Scope Creep:** The AI-driven authoring of the toy project (Step 4) could produce a plan that is more complex than intended, causing the human-driven recording session to exceed the ~15-minute wall-clock target and requiring costly rework.

### Next-session recommendation (Session 8)
- Orchestrator: google/gemini-3-1-pro @ effort=medium
- Verifier: openai/gpt-5-4 @ effort=medium
- Reason: Session 8 will operationalize the pipelines built in Session 7, shifting from R&D to execution; a high-end Tier 2 model offers the right balance of capability and cost for this production-oriented work.
- First action: Process the raw video captured in Session 7 using the new time-compression pipeline and review the generated speed-ramp plan for accuracy.

### Next-set recommendation
The next set should scale the video production workflow established here. This involves creating a multi-module tutorial to test the process at a larger scale, developing a lightweight workflow for adding narration, and building tooling to automate the final encoding and publication safety checks based on the checklist from Session 7.