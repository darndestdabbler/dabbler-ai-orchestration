# Design consult, round 2 — gemini-3.1-pro-preview (gemini-3.1-pro-preview)

> Requested pre-Session-1 on 2026-08-10. Prompt: `prompt-round-2.md`.
> Requested alias: `gemini-3-1-pro`. Resolved: `gemini-3.1-pro-preview`. Carried its own round-1 answer plus the cross-read as context. Raw response follows verbatim.

---

### 2. NEW QUESTION 1 — Agent-performed UAT

**Is agent-performed UAT a real category, or is it just E2E testing with better marketing?**
It is E2E testing with better marketing, bolstered by LLM heuristics. UAT’s defining property is a human judging fit for purpose, feeling UX friction, and interpreting business value. An agent does not experience friction or confusion; it merely parses state.

**What is it good at and what is it structurally blind to?**
It is good at exhaustive path traversal, verifying accessibility labels, checking semantic state changes, and catching obvious visual clipping (if equipped with vision). It is structurally blind to awkward workflows, nonsensical business logic (if the logic technically executes without error), confusing terminology, and the holistic "feel" of a feature.

**The sycophancy problem.**
To defeat sycophancy, you cannot just ask "is this correct?". You must use adversarial framing ("Act as a hostile auditor"), completely blind the agent to the implementation code and diff (providing only the running app and acceptance criteria), and force a quota ("You must find at least 3 UX frictions"). Anything less is theatre and will result in the agent congratulating the orchestrator.

**Does it depend on the solution platform?**
Heavily. Web apps expose a rich DOM that agents can easily parse and interact with. Desktop apps, Electron, and CLI apps require brittle accessibility tree hooks, OCR, or coordinate-based clicking. The capability degrades sharply to near-zero outside the browser.

**What is the honest confidence claim?**
It sits at the low-to-medium end of the scale. It is marginally better than standard E2E assertions because it can use vision/heuristics, but it does *not* stack with human UAT. It is a subset of E2E, not a replacement for human judgment.

**What would you actually build?**
**Nothing.** I refuse it on the complexity budget. Building a reliable, UI-driving, adversarial agent is an entirely different product (Set 114 or beyond). Set 113 must remain focused on capturing human UAT. 

### 3. NEW QUESTION 2 — Dual-purpose videos (UAT + Training)

**Does the dual purpose change your round-1 recommendation on OS-level capture?**
No, it explicitly reinforces my refusal. Committing brittle, platform-specific `ffmpeg` recordings to a repository under the guise of "durable training material" is a massive trap.

**Are UAT evidence and training material actually the same artifact?**
Absolutely not. They are fundamentally opposed. UAT evidence is point-in-time, disposable, low-polish proof that a specific change works. Training material is durable, high-polish, generic, and rots the moment the UI changes. Conflating them means you get terrible training videos (full of UAT-specific edge-case testing) and bloated UAT processes (because operators feel pressured to make the video "training quality").

**If a recording must be replayable as training material at any time, what does that impose?**
It imposes binary storage bloat in Git, severe versioning rot (the UI changes, the video lies, users get confused), and an ongoing media-management maintenance burden. The complexity budget cannot afford this.

**Is there a design that gets the dual purpose nearly free?**
Yes. **The single source of truth is the authored, machine-readable step list.** 
The step list renders into two things:
1.  A manual markdown checklist (for UAT and text-based training).
2.  An automated script that drives Playwright to record a disposable video *on demand*. 

Because the video is generated from the step list, it can be regenerated automatically when the UI changes. You don't commit the video; you commit the step list.

**Reconcile it with the operator's condition in §1.2.**
The human-authored step list perfectly satisfies "very clear, step-by-step instructions to get to any point in the video." These steps are rendered alongside the video (or in place of it, if video generation fails/is unsupported). They serve as the manual UAT guide and the canonical training document.

### 4. Revisit — one line each

*   **OS-level capture:** Refuse outright; the dual-purpose argument proves it is a binary-storage and maintenance trap.
*   **Which platform the exemplar is built against:** A dummy web app; standardize on the 95% use case where Playwright `recordVideo` works flawlessly, and treat the VS Code extension as the degradation case.
*   **Session structure for Set 113:** 
    *   **Session 1:** Define the step-list schema and build the manual markdown renderer (delivering the durable training/UAT artifact immediately).
    *   **Session 2:** Build the Playwright web-video recorder (delivering the disposable UAT evidence).
    *   **Session 3:** Build the Side-by-Side viewer UX and wire the `disposition.uat` gate.