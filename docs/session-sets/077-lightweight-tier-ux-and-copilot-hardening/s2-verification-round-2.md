- **Issue** → **None; S077-S2-V1-001 is correctly remediated.** Persisted form state is now scoped by `rootId`, cross-root state is discarded before restore/seed, and a mid-life root switch re-runs restore for the new root.  
  **Location** → `tools/dabbler-ai-orchestration/media/session-sets-tree/client.js` (`lastSeedRootId` reseed path), `tools/dabbler-ai-orchestration/media/session-sets-tree/gettingStartedHtml.js` (`restoreGsState(..., rootId)` discard-on-root-mismatch), `src/utils/gettingStartedDetection.ts` / `src/types/sessionSetsWebviewProtocol.ts` (`rootId` payload plumbing).  
  **Fix** → None.

- **Issue** → **S077-S2-V1-002 is not completely remediated.** The new `lastSeed`/`tierDirty` logic is correct inside `restoreGsState`, but `client.js` only calls `restoreGsState` when `rootId` changes. Same-root durable seed changes while the webview stays alive are still ignored, so sanctioned marker changes and “caught up” dirty clears do not run for the current root.  
  **Location** → `tools/dabbler-ai-orchestration/media/session-sets-tree/client.js`:
  ```js
  if (gs.mode === "getting-started" && lastSeedRootId !== gs.rootId) {
    lastSeedRootId = gs.rootId;
    gsState = gsHtml.restoreGsState(gsState, gs.tierSeed, gs.rootId);
    persistGsState();
  }
  ```
  **Fix** → Re-apply `restoreGsState` for same-root getting-started snapshots when the incoming seed context changes, not just when `rootId` changes. Simplest safe fix: call `restoreGsState(gsState, gs.tierSeed, gs.rootId)` on every getting-started snapshot and persist only if the returned state changed. Equivalent alternative: track the last applied `(rootId, tierSeed)` tuple and re-run restore whenever either element differs.