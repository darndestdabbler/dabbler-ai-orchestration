# Design consult — gpt-5.5 (gpt-5.5)

> Requested pre-Session-1 on 2026-08-10. Prompt: `prompt.md`.
> Requested alias: `gpt-5-5`. Resolved: `gpt-5.5` (tier 0). Raw response follows verbatim.

---

**Recommendation: restructure Set 113.** Do not treat UAT as a binary requirement. Treat it as **mandatory UAT accounting**: every close must record what UAT happened, what did not, who did it, what components it covered, and the resulting confidence/debt. “No UAT happened” must be an explicit, attributable close record, not an absence.

### (a) Gate vs. UAT data tracking

Yes, the reframing is right — but do **not** remove the gate entirely. Replace the gate with a **record-completeness gate**, not a **verification-success gate**.

Close should require one of:

| Status | Meaning |
|---|---|
| `covered` | UAT happened and evidence exists |
| `thin` | Some UAT happened, but coverage/confidence is limited |
| `none` | No UAT happened, explicitly recorded |
| `waived` | Human explicitly waived UAT expectations |

That preserves the Set 111 lesson: UAT must not evaporate silently. The gate should block only when the UAT record is missing or internally inconsistent. It should not pretend UAT is all-or-nothing.

Cost: weaker enforcement than `requiresUAT: true`.  
Benefit: much more truthful operational data, fewer fake waivers, better debt tracking.

### (b) Balance functionality, UX, and complexity

Bias toward **boring evidence capture**, not a rich UAT platform.

Build the smallest loop that makes UAT pleasant:

1. Auto-stage the fixture.
2. Show/watch a short walkthrough if available.
3. Offer “repeat it yourself” from the same steps.
4. Record coverage, participants, confidence, and residual concerns.
5. Make missing UAT impossible to miss at close.

Cut anything that turns this into a custom training/video application. In particular, I would **defer synced replay windows**. They are attractive UX, but likely high complexity and fragile across app types. A simpler “pause video, launch fixture, continue manually” flow gives most of the value.

### (c) Portability

Make the UAT system **product-agnostic** and keep the VS Code extension as only one viewer.

The portable core should be:

- A neutral walkthrough spec: YAML/JSON.
- A neutral evidence model: component, risk, UAT mode, actor count/type, artifacts, confidence, debt.
- A CLI/runtime that can launch fixtures and render Markdown/manual steps.
- Optional adapters:
  - **Browser adapter first** for .NET, Java, JS, Python web apps.
  - **OS capture fallback** for Electron and non-web apps.
  - Manual-only mode always available.

For web apps, Playwright browser recording/traces are likely the best primary path. The VS Code/Electron `recordVideo` failure should not drive the whole architecture. It is a platform-specific failure, not evidence that all in-process recording is bad.

Do **not** make the VS Code workbench the center of the design. That would overfit Set 113 to orchestrator maintenance.

### (d) Documenting debt from thin UAT

Yes, document it — but at **component/session granularity**, not per step.

Each session should be able to leave records like:

- Component: Work Explorer tree rendering
- Risk: medium
- UAT performed: video watched by 1 developer
- Not performed: manual replay, business-user walkthrough
- Confidence: medium
- Debt: needs production/user confirmation of filtering and edge states
- Paydown trigger: first real use, bug report, future UI touch

This is valuable because thin UAT is not failure; it is **risk-shaped debt**. The cost is manageable if the schema is small and close tooling prompts for it. Do not create a parallel issue tracker.

### (e) Recommendations for Set 113

I would restructure Set 113 into three sessions:

1. **UAT evidence model and close accounting**  
   Replace binary `requiresUAT` semantics with required UAT records. Preserve explicit `none` / `waived` outcomes. Add component-level coverage, actor type/count, confidence, artifacts, and debt.

2. **Portable walkthrough source and manual rendering**  
   Build the one-source step format. Render manual walkthroughs first. Add drift tests. This gives immediate value even with no video.

3. **Recording exemplar with adapter boundary**  
   Build one browser-first recording path if feasible, plus OS/manual fallback. Use the VS Code extension only as the exemplar, not as the architectural center. Record one short walkthrough and dogfood the evidence flow.

I would **cut or defer** synced replay windows, voice synthesis, CI recording, a walkthrough library, and any Electron-specific recorder abstraction beyond what the exemplar needs.

The key change: Set 113 should stop being “make UAT required and nicer with videos” and become “make UAT coverage visible, attributable, pleasant when possible, and portable by default.”