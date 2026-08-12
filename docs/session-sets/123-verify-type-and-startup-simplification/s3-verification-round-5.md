ISSUES FOUND

Fix verdict: L1 Open Module Plan backing restored -- fix-accepted  
Fix verdict: L2 -- duplicate-of L1  
Fix verdict: L3 live docs retired setup surfaces -- fix-rejected  
Fix verdict: L4 Copilot seat setup profile-fallback messaging -- fix-accepted  
Fix verdict: L5 quick-start budget scaffold claim -- fix-accepted

- **Issue 1:** The extension-local README still directs users to the retired Getting Started form for provider setup.
  - **Category:** Completeness
  - **Severity:** Major
  - **Evidence paths:** `tools/dabbler-ai-orchestration/README.md:24-34`, `tools/dabbler-ai-orchestration/package.json:53-60`, `tools/dabbler-ai-orchestration/src/extension.ts:18-23`
  - **Failure scenario:** A typical new user reads the Marketplace/extension README before setup. It still says the Copilot path is “Install the Copilot CLI and sign in; the form configures the rest” and that “The Getting Started form asks which one you want,” but the current extension contributes only the native Work Explorer view and `dabbler.getStarted` opens static instructions. That user will look for, or rely on, a setup form that no longer exists instead of running `Dabbler: Set Up New Project`, `verify_type`, and `Dabbler: Set Up Copilot Seat`.
  - **Acceptance criterion:** JUDGMENT - The extension-local README’s provider/setup section no longer says a Getting Started form configures or asks provider setup, and instead points to the surviving setup flow.
  - **Details:** **Violation:** the remediation needed to close L3’s live-doc sweep for retired setup/config/prompt surfaces. **Impact:** this is the extension’s front-door documentation, so stale setup instructions materially impair onboarding. **Evidence:** the README still names the deleted form while the manifest/code show the webview form is retired and `getStarted` is documentation-only; the correct guidance is the Set Up New Project + `ai_router.verify_type` + Set Up Copilot Seat path.

NITS

- **Nit:** `tools/dabbler-ai-orchestration/src/commands/copilotSeatSetupCommand.ts:52-54` still says to run “Build project structure” from the “Getting Started form” when `.venv` is missing; this is secondary to the rejected L3 doc fix but should be cleaned up with the same wording pass.