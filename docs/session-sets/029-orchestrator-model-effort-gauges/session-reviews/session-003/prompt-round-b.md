# Set 029 Session 3 verification — Round B (reader + model + provider + tests)

## Context

Set 029 Session 3 moves the orchestrator-marker identity from a single
global file to per-session-set markers under
`<workspace>/docs/session-sets/<slug>/.dabbler/orchestrator.json`.
**Round A** (already VERIFIED) covered the writer
(`scripts/write-orchestrator-marker.js`) and the marker schema doc.
**Round B** (this round) covers the reader-side changes, the data-layer
extraction, and the test rewrite.

Splitting per memory `feedback_split_large_verification_bundles` after
the all-in-one ~101k-char bundle hit gpt-5-4 429. Each round stays
under the ~700 LOC ceiling.

## What you're being asked to verify

Answer Q5–Q9 with **VERIFIED / MUST-FIX / SUGGEST** verdicts plus 1–3
sentences of reasoning each.

### Q5. Reader-side resolver + slug validation

The reader's `resolveActiveSet()` runs the same walk-up algorithm as
the writer (verified VERIFIED in Round A), rooted at
`vscode.workspace.workspaceFolders[0]`. Returns either
`{ kind: "resolved", resolved: { workspaceRoot, slug, setDir, markerPath } }`
or `{ kind: "unresolved", reason: ..., candidates?: [...] }`.

`computeState()` reads the marker file via `fs.readFileSync` (no async
delay between resolve and read — both are synchronous), then runs the
slug-integrity check:
```ts
if (marker.sessionSetSlug && marker.sessionSetSlug !== res.resolved.slug) {
  return { kind: "empty" };
}
```

Verify:
- The resolver returns `unresolved` on any failure path (no
  workspace, no `docs/session-sets/`, zero in-progress, multiple
  in-progress). `computeState()` translates `unresolved` to
  `{ kind: "empty" }`, which renders the existing empty-state CTA. ✓
- Slug validation is permissive on missing `sessionSetSlug`
  (treats absence as a v2-shape marker, which the spec step 8 says
  is "silently ignored" — but in the per-set path, no v2 writer
  would ever drop a marker there, so the permissive treatment is
  forward-compat for a hypothetical v4 marker that omits the field).
  Is the permissive treatment defensible, or should the slug check
  be strict (mandatory presence)?
- The slug check is `marker.sessionSetSlug && marker.sessionSetSlug !== res.resolved.slug`
  — note the truthiness guard catches `null` and `""` as well as
  `undefined`. Empty-string slug is treated as "no field" rather
  than "mismatch". Is that defensible?

### Q6. Watcher re-binding on session-set transitions

Two watchers:
1. **State watcher** (`SESSION_STATE_GLOB = "docs/session-sets/*/session-state.json"`)
   on the workspace folder. Fires on close-out flips, start_session,
   cancellation, restore — anything that changes a set's `status`.
   Trigger callback: `rebindMarkerWatcher()` + `scheduleRender()`.
2. **Marker watcher** on the resolved per-set marker file (absolute
   path). Re-bound whenever resolution changes.

`rebindMarkerWatcher()` is idempotent: if `nextPath === this.currentMarkerPath`
AND a watcher exists, returns early. Otherwise disposes the old
watcher and binds a fresh one rooted at `path.dirname(nextPath)`.

Verify:
- The state watcher uses
  `new vscode.RelativePattern(folders[0], SESSION_STATE_GLOB)` — this
  matches `docs/session-sets/*/session-state.json` paths within the
  first workspace folder. ✓
- The marker watcher uses
  `new vscode.RelativePattern(vscode.Uri.file(markerDir), "orchestrator.json")` —
  absolute base for cross-workspace-folder safety. ✓
- A close-out flip on the active set fires the state watcher, which
  re-resolves (now `unresolved`), disposes the old marker watcher,
  and re-renders to empty state. ✓
- A start_session on a new set fires the state watcher, which
  re-resolves to the new set's marker path, binds a fresh marker
  watcher there, and re-renders. ✓
- The poll backstop (`POLL_BACKSTOP_MS = 60_000`) calls both
  `rebindMarkerWatcher()` AND `scheduleRender()` so even a missed
  watcher event can't leave the gauge stuck on the wrong set. ✓

Edge case: what if `vscode.workspace.workspaceFolders` is empty at
`resolveWebviewView` time but populated later (operator opens a
folder after activating the side panel)? The state watcher is set
up once at `resolveWebviewView` time; if folders are empty then, no
state watcher is bound. The poll backstop re-runs
`rebindMarkerWatcher()` every 60s, which DOES re-resolve, but never
re-runs `setUpStateWatcher()`. Is this a hole?

### Q7. `SessionSetsModel` data-layer extraction

`src/providers/SessionSetsModel.ts` is a NEW file extracting:
- Pure helpers: `needsMigrationBadge`, `iconUriFor`,
  `isCurrentSessionInFlight`, `progressText`, `touchedDate`,
  `uatBadge`, `forceClosedBadge`, `modeBadge`
- Bucketing: `bucketSets(all)` returns
  `{ inProgress, notStarted, complete, cancelled }`
- Sorting: `sortBucket(subset, groupKey)` with the existing rules
  (in-progress / complete / cancelled by `lastTouched` desc;
  not-started by name asc)
- `ICON_FILES` map

`SessionSetsProvider` re-imports these and re-exports a subset
(`forceClosedBadge`, `isCurrentSessionInFlight`, `modeBadge`,
`needsMigrationBadge`, `progressText`) so callers that import from
the provider module continue to work without breakage:
- `cancelTreeView.test.ts` (no specific helper imports listed)
- `forceClosedBadge.test.ts` imports `forceClosedBadge`
- `sessionSetsProvider.test.ts` (Layer-2) was REPOINTED to import
  directly from `SessionSetsModel` to track the canonical home

Verify:
- All helper bodies are byte-for-byte equivalent to the
  pre-extraction inline definitions (no behavioral drift). The
  in-flight predicate, progress text, badge logic, bucket+sort
  rules all match what was in the provider before. ✓
- `getChildren()` correctly delegates to `bucketSets` + `sortBucket`
  rather than inlining the filter+sort. ✓
- The Cancelled-group-only-renders-when-non-empty rule (`if
  (buckets.cancelled.length > 0)` before pushing the group) is
  preserved. ✓
- The loading sentinel + scan-state gating + welcome-view trigger
  (`return [];` when `all.length === 0`) are preserved unchanged. ✓
- The future custom webview tree (Set 029 S4) can consume the same
  exports without further refactor.

### Q8. Playwright coverage

12 scenarios total (A–L). New for S3:
- **I**: mismatched `sessionSetSlug` → reader falls back to empty state
- **J**: helper-script ambiguous (2 in-progress sets) → write skipped,
  log entry with `reason: "multiple-in-progress-sets"` + `candidates`
- **K**: helper-script writes to per-set path on single in-progress
  set; verifies schema v3, slug match, AND self-protect `.gitignore`
  presence + content (`*` + `!.gitignore`)
- **L**: helper-script invoked outside any `docs/session-sets/` →
  skip, log entry with `reason: "no-docs-session-sets"`, no legacy
  global marker

Existing A–H scenarios were updated to:
- seed markers at per-set path (writes inside `seed.set_dir`)
- call `startSession(seed, 1)` so the seed set is `in-progress`
  (otherwise the resolver returns `no-in-progress-set`)
- declare `schemaVersion: 3` and `sessionSetSlug: seed.slug`

Scenario H (helper-precedence) now exercises the per-set path; the
final assertion verifies the marker landed under
`seed.set_dir/.dabbler/`, NOT under the legacy global path
(explicitly checked to NOT exist).

Verify coverage is sufficient for the S3 spec's step 9 acceptance:
- "Two in-progress sets in one workspace → writer skips,
  orchestrator-writer.log carries the ambiguity entry, indicator
  shows empty-state CTA." → Scenario J (writer + log) + Scenario G/I
  (reader empty state). Coverage is split across helper + reader
  scenarios — adequate or does an end-to-end ambiguous-with-VS-Code
  launch scenario need to be added?
- "Schema-v3 marker with mismatched `sessionSetSlug` → reader falls
  back to empty state and logs." → Scenario I covers the empty-state
  fallback; the reader does NOT currently emit a log entry on slug
  mismatch (the spec text says "logs", but the implementation falls
  silent). Is this gap a must-fix?
- "`cwd` outside any `docs/session-sets/` directory → writer skips,
  no orphan marker written." → Scenario L. ✓
- "Single in-progress set → writer writes to per-set path,
  indicator renders the gauges." → Scenario K (writer) + A–F
  (reader). ✓

### Q9. CHANGELOG + version bump

Version 0.14.2 → 0.15.0 (minor). v0.14.2 never shipped to
Marketplace; no external consumer is affected. The minor bump is
the audit consensus (Q9 in synthesis) because the schema/identity
change would be breaking IF anyone had been depending on v0.14.2's
preview shape.

CHANGELOG [0.15.0] section claims:
- Marker schema v3 with `sessionSetSlug` integrity field
- Per-set marker path; legacy global retired
- Walk-up resolver in writer + reader (same algorithm)
- Fail-closed (skip + log) on zero/many in-progress sets and
  no-docs-session-sets reachable
- Watcher re-binding on set transitions
- `.gitignore` self-protection in the per-set `.dabbler/` directory
- `SessionSetsModel` data-layer extraction
- Two known limitations: R8 wrong-set attachment, R9 gitignore
  not auto-patched at workspace-root

Verify:
- CHANGELOG accuracy against the implementation. Any drift?
- "Re-run `Dabbler: Install Orchestrator Hook (Claude Code)` after
  upgrade" — the installer is unchanged; the helper-script path
  resolution is internal. Is the operator-facing copy honest? (The
  hook entry in `~/.claude/settings.json` is unchanged; what
  changes is the resolver behavior INSIDE the helper.)
- Is 0.15.0 the right bump per semver intent, or should it be
  0.14.3 (patch) since no external consumer was ever affected?

---

## Final verdict (Round B)

Emit one summary line at the end:

`VERDICT: VERIFIED` if Q5–Q9 all pass without must-fix items
`VERDICT: MUST-FIX (<count>)` if any Q has a must-fix
`VERDICT: SUGGEST (<count>)` if no must-fix but ≥1 suggest items

Followed by a 2–3-sentence overall summary.
