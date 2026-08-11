**VERIFIED** — I checked the session-row command wiring, `openSpec` reuse, locator/parser sharing, package contribution, generated `dist` presence, and the Set 115 S2 unit slice. I found no Critical/Major defects in the implementation or coverage.

#### NITS

- **Nit:** The missing/malformed-heading degradation path uses plain `vscode.open`; if `spec.md` is already open and scrolled elsewhere, VS Code may preserve that view instead of forcing line 1. This is recoverable and still opens the real file, so it is non-blocking.