**VERIFIED** — I checked the Session 2 plan obligations against the actual source, package contributions, changelog entry, generated extension bundle, unit coverage, and focused Playwright host behavior. The session-node command is wired through the existing `openSpec` path, the locator shares the step-parser heading scan, degradation opens the real spec, and the focused Layer 2/Layer 3 checks pass.

**NITS**

- **Nit:** The “opens at the top” degradation claim is only directly proven for a fresh editor. The fallback path uses `vscode.open` without an explicit selection, so if `spec.md` is already open and scrolled elsewhere, the exact top-of-file reset is not enforced by this code path; impact is recoverable and limited to unlocatable sections.