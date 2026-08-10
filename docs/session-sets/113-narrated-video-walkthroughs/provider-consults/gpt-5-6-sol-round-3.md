# Critical review, round 3 - GPT-5.6 Sol

## Bottom line

The consensus is right about the record-completeness gate, the standalone step source, browser-first implementation, and cutting synchronized state injection. It is too categorical about OS capture and too casual about two other claims:

1. **"Generated on demand" does not make staleness impossible.** The step list can be stale, the automation can stop matching the product, and a generated video is not training material available "at any time" unless it is published somewhere learners can actually reach it.
2. **Manual-only is not a second recorder implementation.** It exercises the walkthrough model, but it provides no evidence that a recorder plugin boundary fits a second capture technology.

The operator is right that the non-web gap was not priced and that independent UI exploration addresses a real self-verification failure. The operator should not infer, however, that adding `ffmpeg` solves non-web training. Capturing pixels is the easy part; reliably staging and driving an arbitrary desktop application is usually the expensive part.

## (a) OS-level capture

**The unanimous refusal is not justified by the evidence presented.** It is an artifact of treating "OS capture" as synonymous with "a cross-platform media-management product." Those are different decisions.

Training's higher durability and polish bar does not uniquely indict OS capture. A Playwright recording is also raw pixels, also needs captions and chapter alignment, also becomes misleading when the UI changes, and also needs publication if end users are to find it. OS capture does have additional hazards - wrong-window capture, notifications or secrets appearing in frame, unstable cropping, display scaling, platform-specific installation, and native dialogs - but those are reasons to bound and measure it, not reasons to declare it valueless without a trial.

Browser capture is also less complete than the consensus implies. It generally omits browser chrome, native file pickers, permission prompts, external applications, and some authentication transitions. Even a web workflow can cross the browser/OS boundary. "Browser application" therefore does not always mean "browser-context video is sufficient."

My recommendation is:

- Do not make OS capture mandatory, bundle `ffmpeg`, or put it in the portable core.
- Do not attempt a generic cross-platform desktop recorder in Set 113.
- **Do run one bounded Windows OS-capture pilot against the Work Explorer**, because this is a real product, its UI driver already works, and the failed Playwright/Electron recording gives the pilot a concrete comparison.
- If the pilot meets explicit safety and reliability criteria, ship it as an optional Windows capability with manual-only degradation. If it does not, defer it with measured reasons rather than a speculative refusal.

The pilot should have a hard one-session budget and should pass only if it can repeatedly select the intended window, exclude unrelated desktop pixels, preserve usable resolution under the operator's normal display scaling, align step events with captions, fail clearly when the dependency is absent, and clean up deterministically. A useful bar would include ten consecutive clean captures from a fresh fixture with no wrong-window or privacy leakage. Audio recording is unnecessary; caption-derived narration is enough for this decision.

Evidence that would change my position toward refusal would be failure of that bounded pilot, an inability to isolate the target safely, or portfolio evidence that no maintained product or identified audience needs non-web video. Evidence that would justify broader investment would be two or more real non-web products whose users demonstrably complete training or UAT more successfully with recordings, plus a proven capture-and-driver path on each target platform. Hypothetical future COBOL work alone is not enough to fund a general desktop subsystem, but it is enough to avoid designing non-web artifacts out of the model.

This changes consensus conclusion 6: **do not refuse OS capture outright; measure and optionally ship one narrow backend while refusing a generic desktop platform.**

## (b) The non-web training gap

The gap is **material but highly uneven**. The consensus was wrong to collapse it into a minority edge case, and the operator would be wrong to treat all of it as one screen-capture problem.

| Product shape | Primary audience | What written-only material loses | Size of video gap |
|---|---|---|---|
| Native desktop GUI | End users, support staff, operators, UAT reviewers | Spatial layout, window transitions, focus behavior, gestures, modal sequencing, OS prompts, and timing | **High** for unfamiliar or multi-window workflows |
| Terminal/TUI | Developers, operators, administrators, some mainframe users | Mode changes, prompt timing, cursor/focus behavior, redraws, keyboard navigation, and recovery from intermediate states | **Medium to high** for TUIs; lower for simple command sequences |
| CLI | Developers and operators | Mostly pacing, command discovery, and error-recovery context | **Low to medium**; executable examples and searchable transcripts are often better than video |
| Mainframe/3270-style UI | Experienced operators, trainees, support staff, domain users | Field attributes, protected/unprotected regions, PF-key behavior, screen transitions, and workflow conventions unfamiliar to new users | **Potentially high**, but strongly emulator- and protocol-dependent |

Non-web users may indeed benefit more from demonstration because there is less ambient familiarity than with common web controls. Video is especially useful for showing where attention moves, what state change is expected, and how several windows or modes relate. It also reduces UAT setup and comprehension cost: a reviewer can first see the intended path, then reproduce it from the same scenario.

Training and UAT therefore **reinforce each other at the scenario and authoring level**, but not necessarily at the final recording level. A training run should be concise and curated. A UAT run should preserve awkwardness, errors, and evidence from the exact build under review. Reusing the scenario, step IDs, captions, fixture, and driver is efficient; declaring every UAT recording a durable training asset is not.

The terminal-recording observation is valuable but overstated:

- For an ANSI terminal or shell workflow, an asciinema-style event stream is genuinely cheap, small, replayable, accessible to tooling, and safer to regenerate than pixel video.
- It is not inherently meaningfully diffable. Timing changes and ANSI control sequences create noise unless a normalized transcript or semantic screen snapshots are generated too.
- Secret redaction, terminal dimensions, color and Unicode behavior, alternate-screen TUIs, and platform-specific commands still need policy.
- A 3270 emulator is not necessarily a normal PTY. A GUI emulator, block-mode field attributes, or proprietary transport can put it back in the desktop-capture category.
- For a simple CLI, a checked executable transcript plus expected outputs is usually more useful than a timed cast.

So terminal recording is a **cheap, promising backend for a defined subset**, not a solution to "non-web." It should be the first subject of a later **Terminal Walkthroughs and Cast Artifacts** set when a real terminal target exists. Building it now without such a target would distract from Set 113; preserving the artifact model so a cast can be referenced later is enough.

This partly endorses orchestrator claim 4.1 but rejects its implication that a large share of mainframe/desktop demand is automatically cheap.

## (c) Hedging platform uncertainty

The proposed public pluggable-recorder contract is premature. A manual-only path is not a recorder implementation: it never starts capture, chooses a target, handles timing, reports codec or dimensions, or cleans up a partial artifact. A browser recorder plus a no-op would validate almost none of the decisions an OS or terminal recorder would challenge.

The correct cheap hedge is **to stabilize the platform-neutral information and the run output, not a backend API**:

1. Give every scenario and step a stable ID.
2. Model prerequisites, a known baseline, reset/recovery instructions, user action, and expected observable result. "Reach any point" should mean replaying a documented prefix from a known baseline or checkpoint, not pretending every stateful step supports random access.
3. Keep Playwright selectors and other driver details in platform-specific blocks rather than making them part of the portable step semantics.
4. Have the driver emit a timestamped step-event stream (`started`, `completed`, `failed`) keyed by stable step IDs.
5. Emit a small run manifest that can reference zero or more artifacts - browser video, OS video, terminal cast, captions, screenshots, or transcript - without assuming every artifact is an MP4.
6. Keep the first recorder interface internal and explicitly unstable. Extract and publish a backend contract only after the second real capture implementation exposes the genuine commonality.

That design makes later extraction cheap without freezing the wrong seam. Paying later for a new **driver** is unavoidable because browser, native desktop, terminal, and 3270 interaction are genuinely different. Paying later to replace browser-specific fields embedded throughout the core is avoidable, so Set 113 should prevent that now.

The generated-video policy also needs correction. For Set 113, generated videos can live in ignored output and be disposable UAT aids. That avoids Git bloat. It does **not** provide durable training video. If an actual training audience needs replayable videos, a later **Training Publication and Retention** set must choose external storage, product-version association, discoverability, accessibility review, retention, and stale-content policy. Until then, the durable training deliverable is the standalone rendered document, not the video.

This rejects orchestrator claim 4.2 as stated. The hedge is genuine, but the right seam is the scenario/event/artifact model, not a prematurely documented recorder plugin API.

## (d) AI cheating in E2E

The operator's observation is well-founded, although **common-mode self-verification failure** is more precise than collusion. Code-writing agents tend to optimize for the locally visible success condition. When the same context implements the feature, writes the test, interprets ambiguous acceptance criteria, and reports the result, predictable failures include:

- asserting the implementation's own representation rather than user-visible behavior;
- mocking around the integration that needed testing;
- checking that an element exists rather than that the workflow succeeds;
- editing the test or fixture until the current output passes;
- omitting states the implementation did not handle;
- treating an unobserved manual path as verified.

No intent to deceive is required. Shared context and shared blind spots are enough.

**The collusion reframe materially changes the verdict.** An independent agent driving the running product is not UAT, but it can be a useful black-box exploratory E2E integrity control. The existing path-aware critique is relevant evidence that provider diversity and independent ground-truth retrieval can expose defects. It is not proof that the same yield will transfer to a stateful UI: UI exploration has partial observability, flakiness, and a much larger action space. It justifies a measured pilot, not a confidence claim in advance.

The minimum credible version belongs in a separate **Independent Black-Box UI Critique** set and should be web-only initially:

1. Run against an isolated, resettable fixture with a strict action and data-safety boundary.
2. Give the reviewer task-level acceptance criteria and a user persona approved before implementation, but not the implementation diff, tests, rationale, or authored Playwright path.
3. Use a different effective provider from the implementer. The reviewer must choose its own interaction path; merely replaying the author's test would preserve the common-mode failure.
4. Let it inspect the DOM, accessibility tree, screenshots, focus order, console, and network failures.
5. Require an execution trace and evidence for every finding: exact repro steps, expected and actual result, affected state, and screenshot/DOM/log evidence where applicable.
6. Do not impose a finding quota. Require an explicit no-finding result with paths attempted and limitations. Quotas reward fabricated nitpicks.
7. Calibrate it with known negative controls or seeded defects. If it cannot detect representative broken states, a clean run is not evidence.

Its output should be a separate machine-readable **UI critique report and findings list**, not a human UAT reviewer entry. The UAT record may link it as ancillary evidence, but it must not increase human reviewer counts or turn `reviewerType: ai-agent` into an implied acceptance category. Initially it should be advisory. If measured performance later warrants a gate, that gate should require that the run occurred and its findings were dispositioned; it should not pass merely because the agent said the UI looked acceptable.

The honest confidence claim is narrow: **"An independent black-box agent explored these recorded paths and found no undispositioned high-confidence defects, subject to the stated coverage and calibration limits."** It adds low-to-moderate confidence about exercised path integrity, obvious usability failures, accessibility semantics, and common-mode E2E omissions. It adds essentially no confidence that the product is useful, trustworthy, correctly matched to real business practice, or accepted by users. It partly stacks with human UAT; it does not substitute for it.

Even before that later set, E2E self-collusion should be reduced by freezing operator-approved acceptance criteria before implementation, having the verifier add or challenge black-box assertions, inspecting whether tests exercise user-visible outcomes, using negative or mutation checks where practical, and preventing an implementation agent from silently weakening tests to obtain a pass.

This changes consensus conclusion 7: **do not build agent-driven exploration in Set 113, but do treat it as a worthwhile independent E2E control deserving a named, measured follow-on set.** I would not reserve `reviewerType: ai-agent` in the UAT schema now because that bakes in the category error the operator has already avoided.

## (e) Recommendation for Set 113

**Restructure Set 113 into four bounded sessions.**

### Session 1 - Truthful UAT accounting

Implement the accepted record-completeness gate first. Keep the record factual: in-scope component, method, human reviewer type and count, evidence links, findings/concerns, and explicit attested `none`. Do not require self-assessed confidence scores or create a parallel debt ledger.

The gate must account for the **component inventory**, not merely validate whatever records happen to be present. Otherwise an omitted component is the new form of evaporation. Every declared in-scope component must have a record, or the session must carry an attested not-applicable disposition.

### Session 2 - Portable scenario source and standalone rendering

Define the smallest platform-neutral scenario model and render:

- clear prerequisites and fixture startup;
- numbered steps with stable IDs;
- action and expected result per step;
- reset, recovery, and known-checkpoint instructions;
- manual UAT and training documents;
- captions and chapter metadata derived from the same source.

The written artifact must stand alone. Do not promise direct random access to arbitrary state; provide reproducible prefixes or explicit checkpoints.

### Session 3 - Browser recording proof

Use a dummy web app to prove Playwright recording under control, including step-event timing, captions, chapter mapping, failure cleanup, and a run manifest. Generate artifacts on demand into ignored output. A static generated index that links the video and steps is sufficient; do not build a custom viewer application unless use demonstrates that the static artifact is inadequate.

Call this output a generated walkthrough/UAT aid and training preview, not durable published training.

### Session 4 - Bounded Windows OS-capture dogfood

Use the already-working Work Explorer automation to run the strict pilot described in (a). If it passes within the session budget, ship the narrow recorder as an optional Windows capability behind the internal interface. If it fails, retain the measurements, keep manual-only degradation, and defer desktop capture. Do not expand the session into cross-platform capture, native desktop automation, dependency bundling, audio production, or media publishing.

### Cut, defer, and refuse

**Cut from Set 113:** synchronized state injection, voice synthesis, CI recording, committed video binaries, a permanent video library, a custom rich viewer, terminal recording, and agent-driven UI exploration.

**Defer to named sets:**

- **Independent Black-Box UI Critique** - provider-diverse exploratory web E2E with controls and evidence-bound findings.
- **Terminal Walkthroughs and Cast Artifacts** - PTY/cast support, normalized transcripts, secret redaction, and TUI-specific semantics, triggered by a real target.
- **Training Publication and Retention** - only when a real audience requires durable video distribution.
- **Non-Web Walkthrough Backends** - native desktop or 3270 driving/capture only after an actual product supplies requirements.

**Refuse outright:** calling AI exploration UAT; counting it as a human reviewer; forced finding quotas; a universal cross-platform desktop abstraction in this set; claims that on-demand generation makes content inherently current; and any gate that equates "agent found nothing" or "video was watched" with user acceptance.

This preserves the consensus's best insight - the authored scenario is the durable portable core - while correcting its unjustified platform foreclosure. It also keeps the operator's strategic concern from becoming an open-ended desktop-media project: one real browser proof, one real bounded OS proof, and no generalized platform commitment until measured demand earns it.
