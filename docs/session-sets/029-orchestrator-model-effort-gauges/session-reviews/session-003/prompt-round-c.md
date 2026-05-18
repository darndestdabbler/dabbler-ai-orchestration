# Set 029 Session 3 verification — Round C (Round-B MUST-FIX confirmation)

## Context

Round A (writer + schema doc) VERIFIED clean.
Round B (reader + model + provider) returned MUST-FIX (3):
- **Q5:** slug validation truthiness bug (`marker.sessionSetSlug && ...`
  let null / empty-string through as "absent" instead of "mismatch")
- **Q6:** state watcher never binds if `workspaceFolders` is empty at
  `resolveWebviewView` time
- **Q8:** spec says reader "logs" on slug mismatch; implementation
  was falling silent

Round C re-verifies that the three fixes were applied correctly. The
suggest item ("end-to-end ambiguous test launching VS Code with two
in-progress sets") is deferred to S4 — the helper-side scenario J
already exercises the writer behavior, and the reader's
empty-state-on-unresolved is covered by scenarios G + I.

Per memory `feedback_split_large_verification_bundles`, this round
bundles ONLY the reader source (the file all three fixes touch).
Pinned to gemini-pro to dodge the gpt-5-4 429s observed earlier.

## What you're being asked to verify

For each of the three fixes, answer with **VERIFIED / MUST-FIX /
SUGGEST**. The Round-B suggest (no end-to-end ambiguous test) is
acknowledged as deferred; do not re-flag it.

### F1. Q5 fix — stricter slug-presence check

The slug-validation expression in `computeState()` changed from:

```ts
if (marker.sessionSetSlug && marker.sessionSetSlug !== res.resolved.slug) {
  return { kind: "empty" };
}
```

to:

```ts
if (marker.sessionSetSlug !== undefined && marker.sessionSetSlug !== res.resolved.slug) {
  this.getOutputChannel().appendLine(`...`); // F3 logging
  return { kind: "empty" };
}
```

Verify:
- The `!== undefined` guard correctly treats `null`, `""`, and any
  truthy non-matching string as MISMATCH (→ empty state, fail closed).
- Only an actually-omitted `sessionSetSlug` field (literally
  `undefined` at property-access time) passes through — the
  forward-compat path for a hypothetical v4 marker that drops the
  field.
- An empty-string slug `""` no longer leaks the "absent" semantics:
  with the old guard `"" && ...` short-circuited; the new guard
  `"" !== undefined && ...` passes the first check and proceeds to
  the mismatch comparison, which correctly returns true (`"" !==
  "real-slug"`) and routes to empty state.

### F2. Q6 fix — `onDidChangeWorkspaceFolders` listener

A new instance field `workspaceFoldersListener: vscode.Disposable | undefined`
was added. `resolveWebviewView()` now subscribes to
`vscode.workspace.onDidChangeWorkspaceFolders`. The callback
disposes the stale state watcher, re-runs `setUpStateWatcher()`,
re-runs `rebindMarkerWatcher()`, and schedules a render.

`tearDownWatchers()` now also disposes the
`workspaceFoldersListener`.

Verify:
- The listener is wired BEFORE the initial `setUpStateWatcher()` call
  so that even if a folder opens during the synchronous tail of
  `resolveWebviewView`, the listener catches it.
- The callback's order (dispose → setUp → rebind → render) is right:
  the state watcher MUST be recreated before `rebindMarkerWatcher`
  computes a new resolution against the new folder set.
- Disposal is leak-free: `tearDownWatchers()` covers the listener,
  and `tearDownWatchers()` is called from the view's `onDidDispose`
  handler.
- Edge case: an operator opens then closes a folder. The listener
  fires on both events; on close, `workspaceFolders` is empty,
  `setUpStateWatcher()` early-returns (its guard:
  `if (!folders || folders.length === 0) return;`), and the marker
  watcher rebinds to null. The render shows empty state. ✓

### F3. Q8 fix — slug-mismatch log to output channel

A lazy `getOutputChannel()` helper creates an output channel
"Dabbler Orchestrator Indicator" on first use. The slug-mismatch
branch in `computeState()` now appends a timestamped line with the
mismatched slug, the resolved slug, and the resolved marker path
before returning `{ kind: "empty" }`.

Verify:
- Channel creation is lazy: installations that never hit slug
  mismatch don't get a spurious output-channel entry.
- The log line carries enough detail to diagnose: timestamp,
  marker file path, both slugs (the marker's claimed slug, the
  reader's resolved slug). The `String(...)` wrapper around
  `marker.sessionSetSlug` is correct for cases where the value is
  `null` (which prints as `"null"` rather than crashing).
- The log is purely informational — operators can find it via VS
  Code's "Output" pane, dropdown set to "Dabbler Orchestrator
  Indicator". No popup, no toast, no console.error (which would
  surface in the extension host log indiscriminately).

---

## Final verdict (Round C)

Emit one summary line at the end:

`VERDICT: VERIFIED` if F1–F3 all pass without must-fix items
`VERDICT: MUST-FIX (<count>)` if any F has a must-fix
`VERDICT: SUGGEST (<count>)` if no must-fix but ≥1 suggest items

Followed by a 2–3-sentence overall summary.
