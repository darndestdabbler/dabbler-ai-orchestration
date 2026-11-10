**A. Shape:** 
The shape is right. It elegantly unifies plan changes and error handling into a single `propose` verb, satisfying the "no over-engineering" directive. However, I would remove the strict requirement for a *modal* dialog. Modals steal focus and disrupt developer flow. Use a persistent, highly visible, but non-blocking UI element (like a dedicated side-panel view) instead.

**B. Verified steps:** 
Yes, allow it. Agile means requirements change, and early decisions often need revisiting. Modifying a verified step should simply revert its status to "unverified" and automatically trigger a re-review. This honors the flexibility directive while keeping the audit record honest and safe.

**C. Blocking:** 
Block only the dependent steps. If the AI can safely work on an unrelated step while waiting for approval, let it keep moving. For unattended runs, if the proposal blocks the critical path, the session should pause and flag for human review rather than hanging the entire loop or failing outright.

**D. Who originates a hold:** 
The AI must be able to propose it. Directive 2 demands a way out of every impasse. If the AI realizes a package feed is missing, it shouldn't just fail blindly; it should propose the hold. The original risk was the AI *unilaterally* dropping releases to escape hard work. Because this new proposal mechanism strictly requires human approval, that risk is entirely neutralized. The human remains the gatekeeper.

**E. Rejection risk:** 
Interruption fatigue. If developers are constantly bombarded by focus-stealing modals while trying to think or type, they will either blindly click "Approve" just to make the box go away (defeating the security of the gate) or abandon the framework entirely. Avoid this by using a sticky "Review Proposals" pane in VS Code that clearly badges when attention is needed, rather than a screen-locking modal.

**One recommendation:** 
Treat the proposal system like a lightweight pull request for the session plan. When the AI proposes a change, show the developer a clear, visual "diff" of what is changing (e.g., SQLite -> H2, steps 3-4 rewritten) alongside the reason. If the human can understand the blast radius at a glance, they will trust the system, make informed decisions, and approve changes quickly without friction.
