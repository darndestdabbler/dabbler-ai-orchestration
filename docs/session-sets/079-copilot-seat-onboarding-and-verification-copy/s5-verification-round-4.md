- **S5-V-003: RESOLVED**

  **Evidence:** every previously identified spawner sink in the diff now decodes via `makeUtf8ChunkDecoder().write(...)` instead of per-chunk `chunk.toString("utf8")`, and the buffered tail is flushed with `end()` on the terminal path that hands output to the caller/parser:

  - `installAiRouterCommands.makeSpawner`:
    - `stdout`/`stderr` now accumulate `outDec.write(chunk)` / `errDec.write(chunk)`.
    - `flush()` appends `outDec.end()` / `errDec.end()`.
    - `flush()` runs on both `error` and `close` before resolving.
  - `gitScaffold.makeRefreshChildSpawner`:
    - streaming callbacks now receive `outDec.write(chunk)` / `errDec.write(chunk)`.
    - `flush()` sends any remaining tail to `onStdout`/`onStderr` before `onClose`.
  - `setupVerification.runChangeWriter`:
    - accumulation now uses decoders.
    - `stdout += outDec.end()` / `stderr += errDec.end()` happens before parse on `close`.
  - `upgradeOlderSets.runMigrator`:
    - same accumulation + close-flush pattern before result handling.
  - `ConfigEditorPanel` test-notification spawn:
    - same accumulation + close-flush pattern before `JSON.parse`.

  This is the correct fix for the Round-3 Major: `StringDecoder` preserves incomplete UTF-8 sequences across chunk boundaries, so a split multibyte code point is reassembled instead of corrupted. The new unit suite described also directly covers:
  - split multibyte reassembly,
  - the old per-chunk corruption behavior,
  - `end()` surfacing dangling partials as `U+FFFD`,
  - ASCII passthrough.

- **New Critical/Major defects introduced by the fix: none found**

  **Checked regressions:**
  - **Lost flushed tail on normal completion:** not present. Every updated sink flushes before its final consumer step (`resolve`, `parse`, or `onClose`).
  - **Double-counted output:** not present. The only place that can see both `error` and `close` is `installAiRouterCommands.makeSpawner`; calling `end()` twice does not re-emit buffered bytes, and the Promise is already resolved on the first terminal path.
  - **Changed error-path payload at Critical/Major severity:** not present. `installAiRouterCommands` now correctly flushes on `error`, which is the only shown site that resolves there. The other updated `error` handlers are spawn-failure paths; no new Critical/Major corruption/drop is introduced in their reachable output contract.

**VERIFIED**