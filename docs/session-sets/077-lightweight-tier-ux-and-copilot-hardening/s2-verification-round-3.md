- **Issue** → **S077-S2-V1-002 is closed.** Same-root durable-seed changes are now detected while the webview stays alive.
- **Location** → `tools/dabbler-ai-orchestration/media/session-sets-tree/client.js`
  - sentinel lifetime vars near `persistGsState()`:
    - `let lastSeedRootId = { unseeded: true };`
    - `let lastSeedValue = { unseeded: true };`
  - render seed block:
    - `if (gs.mode === "getting-started" && (lastSeedRootId !== gs.rootId || lastSeedValue !== gs.tierSeed)) { ... }`
- **Fix** → The gate now keys on the last-applied **`(rootId, tierSeed)` tuple**, not `rootId` alone. That means:
  - first getting-started snapshot always seeds (sentinels force first-run),
  - **same `rootId` + changed `tierSeed`** triggers `gsHtml.restoreGsState(gsState, gs.tierSeed, gs.rootId)` and `persistGsState()`,
  - identical `(rootId, tierSeed)` watcher ticks do **not** re-run.

**Verdict:** verified; the residual described in round 2 is remediated by this change.