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