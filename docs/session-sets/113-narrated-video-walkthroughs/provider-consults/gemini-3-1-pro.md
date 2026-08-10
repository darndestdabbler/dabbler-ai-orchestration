# Design consult — gemini-3.1-pro-preview (gemini-3.1-pro-preview)

> Requested pre-Session-1 on 2026-08-10. Prompt: `prompt.md`.
> Requested alias: `gemini-3-1-pro`. Resolved: `gemini-3.1-pro-preview` (tier 0). Raw response follows verbatim.

---

Here is the direct, design-focused consult on Set 113, addressing the operator’s notes and the framework's constraints.

### (a) Reframing: Gate vs. Tracking
**The reframing is correct, but removing the gate is a mistake.** If UAT is not a required gate, it will silently evaporate again. 

**Recommendation:** Keep the close gate, but change its shape. The gate should no longer demand "you must walk this." Instead, it must demand an explicit, attributable accounting of UAT confidence. The gate passes if `disposition.uat` contains a structured array of component-level UAT decisions (e.g., `component: "auth", method: "watched_video", users: 1`). 
Critically, `method: "none"` is a valid payload that passes the gate. This forces the human to explicitly sign off on zero UAT, avoiding impasses while accurately recording the resulting technical debt. 

### (b) Balance: Functionality vs. UX vs. Complexity
The operator's desire for a "synced window" (launching a new application window synced to the video's paused state) is a **fatal complexity trap.** You cannot generically inject state into arbitrary .NET/Java/Python web apps or desktop apps based on a video timestamp. 

**Recommendation:** Refuse the "synced window" feature completely. To balance UX and complexity, provide a **Side-by-Side Viewer**. Render a simple HTML page or Markdown preview containing the video on the left, and the generated manual step checklist on the right. The user pauses the video and executes the steps in *their own persistent app window* (Path A). This requires zero application-state injection and costs almost nothing to build, while delivering 90% of the UX value.

### (c) Portability (Web vs. Non-Web vs. Extension)
The orchestrator's unverified reading is correct: `ffmpeg` OS-level capture is incredibly brittle, platform-specific, and ruins the complexity budget. 

**Recommendation:** Standardize exclusively on Playwright's native `recordVideo` for all web-based consumer applications (the 95% use case). It is reliable, isolated, and headless-friendly. 
For VS Code extensions (like this repo) and non-web desktop apps, **do not record video**. Fall back gracefully to generating only the manual walkthrough script from the single source of truth. Attempting to build cross-platform OS desktop capture for a minority edge case violates your complexity budget.

### (d) Documenting Technical Debt
**Yes, it should be documented, but strictly as machine-readable state, not a manual ledger.** 

**Recommendation:** Do not create a separate "Tech Debt" markdown file that requires human maintenance. Instead, the UAT tracking data mandated in (a) lives forever in the session's `session-state.json`. If a component ships with `method: "none"`, the debt is intrinsically documented. Future AI sessions (or a simple aggregate script) can query the session states to warn the operator: *"You are modifying the Auth component; note that it was shipped in Session X with zero UAT."*

### (e) Recommendations for Set 113 Structure
I recommend aggressively pruning Set 113 to protect the complexity budget. 

**Refuse to build:** OS-level `ffmpeg` capture, and mid-walkthrough "synced window" state injection.

**Revised Set 113 Structure:**

*   **Session 1: The One-Source Engine (Web-First).** Define the step-list schema. Write the renderer that takes this schema and outputs a Playwright script (with `recordVideo` enabled for web targets) and a markdown manual checklist. Test this against a dummy web app, *not* the VS Code extension.
*   **Session 2: The Viewer & The Gate.** Build the side-by-side UX (embed the video next to the checklist). Update the `disposition.uat` schema to require component-level tracking (`video`, `manual`, or `none`) and wire this into the existing close gate.
*   **Session 3: Dogfood & Document.** Apply the manual-only degradation to this repo (the VS Code extension). Document the authoring flow for downstream web-app repos, explicitly noting that video UAT is a web-first feature.