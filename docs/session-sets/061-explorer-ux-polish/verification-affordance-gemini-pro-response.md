# Verification-affordance design consult — Gemini Pro response

> **Source:** `ai_router.query(model="gemini-pro")` (gemini-2.5-pro), task_type=architecture, reasoning_effort high.
> **Prompt:** [verification-affordance-design-brief.md](verification-affordance-design-brief.md)
> **Date:** 2026-06-11 (Set 061 S4 decision consult). **Routed cost:** ~$0.0155.
> Raw model output, unedited (per the project rule that verifier/consult output is saved verbatim).
> GPT-5.4's counterpart is being gathered out-of-band via VS Code Chat (the API path timed out 4x).

---

### 1. The Affordance

-   **What:** A de-emphasized, clickable icon-marker. Use the VS Code Codicon `question` (`?` in a circle).
-   **Placement:** Inline with other markers, placed to the right of the `N/M` progress fraction. It is not an action that appears on hover, but a persistent (yet quiet) marker that also serves as an action target.
-   **Tooltip:** "Verification not configured. Click to enable dedicated verification sessions for this set." This frames it as an optional enhancement, not a deficiency.

### 2. States

The verification status for a Lightweight set is derived from `spec.md#verificationMode` and the session ledger. There is no new persisted state.

-   **State 1: Verification Undecided**
    -   **Affordance:** `(?)` icon.
    -   **Derivation:** `tier: lightweight` AND `verificationMode: out-of-band-or-none` AND (`status: in-progress` OR `status: work-complete`). This state represents the opportunity to opt-in.
-   **State 2: Verification Pending**
    -   **Affordance:** `beaker` icon (`🧪`). The `N/M` fraction simultaneously displays as `N/M+`.
    -   **Derivation:** `tier: lightweight` AND `verificationMode: dedicated-sessions` AND work sessions are complete AND no session with `type: verification` exists in the ledger.
-   **State 3: Verified**
    -   **Affordance:** `check` icon (`✓`).
    -   **Derivation:** `tier: lightweight` AND `verificationMode: dedicated-sessions` AND a session with `type: verification` exists and is `completed`.
-   **State 4: Default / Not Applicable**
    -   **Affordance:** No icon.
    -   **Derivation:** All other cases, including:
        -   The set is `not-started`.
        -   The set is `Full` tier.
        -   The set is `Lightweight`, `mode: out-of-band-or-none`, and the work is complete. The system correctly shows no marker, respecting the user's choice to handle verification out-of-band or skip it. **The system cannot and should not attempt to represent out-of-band verification status.**

### 3. The Toggle

The `(?)` marker acts as a one-way toggle from `verificationMode` A to B.

-   **Activation:** The user clicks the `(?)` icon on a `Lightweight` set that is `in-progress` or `work-complete`.
-   **Constraint Reconciliation:** This requires relaxing the "immutable after first record" rule for this specific, additive-only change. Flipping the mode post-start is permitted because it only appends new, distinctly typed sessions; it does not alter the semantics of completed work sessions.
-   **Action Flow:**
    1.  On click, show a non-blocking modal confirmation: `"Enable dedicated verification sessions? This will permanently update the session set's specification to require verification sessions. This action cannot be undone."` with `[Enable]` and `[Cancel]` buttons.
    2.  On confirmation, the extension rewrites `spec.md` to set `verificationMode: dedicated-sessions`.
    3.  The tree view immediately re-renders. The `(?)` icon is replaced by the `beaker` (`🧪`) icon, and the progress fraction changes from `N/M` to `N/M+`.
-   This action **only** changes the spec. It does not yet create the sessions.

### 4. Helping the User Instruct an AI Agent

The goal is to bridge the gap between enabling verification and executing it.

-   **Mechanism:** A new action in the session set's right-click context menu.
-   **Action Label:** `Generate Verification Sessions...`
-   **Availability:** The action is only visible and enabled if the set is in the **Verification Pending** state (`Lightweight`, `dedicated-sessions` mode, `work-complete`, no `verification` session exists).
-   **Execution:**
    1.  Clicking the action opens a new Dabbler AI chat panel.
    2.  The chat input is pre-filled with a precise, ready-to-send prompt for the "blessed writer" agent.
    3.  **Prompt Template:** `As the blessed writer, append a `type: verification` session to the ledger for session set '${set.id}'. The verification should assess the output of the completed work sessions against the original specification.`
    4.  The user simply has to press Enter in the chat panel to dispatch the request to the AI.

### 5. Scope & Risk

-   **Scope:** This is a single, cohesive feature comprising three parts: a state indicator, a mode-change action, and an agent-handoff mechanism. They should be designed and shipped together to provide a complete workflow.
-   **Risks & Mitigations:**
    -   **Risk:** Misleading "unverified" signal on Mode A sets.
        -   **Mitigation:** The `(?)` icon and its tooltip are framed as an *optional upgrade* ("Verification not configured. Click to enable..."), not a warning or error. A completed Mode A set correctly shows no marker at all.
    -   **Risk:** Implying automatic verification.
        -   **Mitigation:** The multi-step flow (click `?` -> confirm -> right-click -> send chat) makes it clear that the user is initiating a series of explicit requests, not triggering an automatic process.
    -   **Risk:** Breaking state immutability.
        -   **Mitigation:** The decision to allow this specific A→B mode change must be documented as a deliberate exception. The change is safe because it is purely additive—appending new work without invalidating prior session records.

### Bottom-line Recommendation

Ship this feature. The proposed design provides a discoverable, low-friction path for users to opt into on-platform verification for Lightweight sets, fulfilling the operator's intent. It respects the "quiet" design ethos by using contextual, de-emphasized markers while managing key risks through precise UI text and a clear, multi-step user-driven workflow.