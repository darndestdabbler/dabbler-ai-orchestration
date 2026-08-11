VERIFIED — I checked the plan obligations against the actual changed source, command contributions, parser reuse, tests, and generated bundle presence. The session-row activation, section locator, degradation behavior, and coverage are wired as claimed, with no Critical/Major defects found.

**NITS**

- **Nit:** The fallback “opens at the top” is only strict when `spec.md` is not already open; the no-reveal path uses `vscode.open`, so an already-open editor may keep its prior scroll. Low-impact and already aligned with the existing set-row behavior.