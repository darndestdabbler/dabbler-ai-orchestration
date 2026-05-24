REJECTED

- **Issue** â†’ The layout for conflict pills uses a hard-coded pixel indent to align with content on the row above, which is brittle and will break if font sizes change.
  - **Location** â†’ `tools/dabbler-ai-orchestration/media/session-sets-tree/tree.css`
  - **Fix** â†’ Define CSS custom properties for the width and margin of the `.row-fraction` column. Use `calc()` with these variables to compute the `padding-left` for `.conflict-pills`, ensuring the indent remains aligned with the column above it regardless of root font size.
    ```css
    /* In .row-fraction rule */
    --row-fraction-width: 3em;
    --row-fraction-margin-right: 12px;
    width: var(--row-fraction-width);
    margin-right: var(--row-fraction-margin-right);

    /* In .conflict-pills rule */
    padding-left: calc(var(--row-fraction-width) + var(--row-fraction-margin-right));
    ```

- **Issue** â†’ If the `dabbler-ai-router` Python package is not installed, the harvest signals (badges and conflicts) silently fail to appear. This is poor user experience; the failure should be surfaced.
  - **Location** â†’ `tools/dabbler-ai-orchestration/src/providers/HarvestService.ts`
  - **Fix** â†’ In `spawnJson`, detect `ENOENT` errors on spawn or specific stderr messages indicating a `ModuleNotFoundError`. Propagate this specific failure condition back through `fetch()`. The `HarvestService` should then trigger a one-time `vscode.window.showWarningMessage` with instructions to `pip install dabbler-ai-router`. Cache the "missing dependency" state to avoid showing the toast on every refresh.

### Recommended Improvements

- **Issue** â†’ Subprocess failure logs are missing the workspace context, making debugging harder.
  - **Location** â†’ `tools/dabbler-ai-orchestration/src/providers/HarvestService.ts` (`spawnJson` function)
  - **Fix** â†’ Include the `cwd` parameter in the `console.warn` message on non-zero exit code to provide full context.

- **Issue** â†’ `HarvestService` is instantiated per-view, which will lead to redundant subprocess calls and cache fragmentation if another view is added.
  - **Location** â†’ `tools/dabbler-ai-orchestration/src/providers/CustomSessionSetsView.ts`
  - **Fix** â†’ Refactor `HarvestService` into a singleton managed by the extension context. Views should retrieve the shared instance instead of creating their own.

- **Issue** â†’ The writer-bypass detector silently skips sets that lack an events ledger, leaving the operator unaware that a key correctness check is not running.
  - **Location** â†’ `ai_router/joiner/conflicts.py` (and consuming CLI/service)
  - **Fix** â†’ When the events ledger is missing for a set that has a state file, emit a `low` severity conflict report of a new kind (e.g., `missing-events-ledger`), informing the operator that bypass detection is inactive for that set.

- **Issue** â†’ A new contributor is likely to run Playwright tests incorrectly, leading to frustration from testing a stale extension bundle.
  - **Location** â†’ Project documentation.
  - **Fix** â†’ Add a section to `CONTRIBUTING.md` that explicitly warns contributors to use `npm run test:playwright` instead of `npx playwright test`, and explain why the wrapper script is necessary.