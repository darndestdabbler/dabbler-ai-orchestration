# Set 029 Session 3 verification — per-session-set identity (schema v3)

## Context

Set 029 ships an "Orchestrator" webview view (Claude Code path live as
of v0.14.2) showing two side-by-side gauges driven by a marker file.
**Session 3** retires v0.14.2's global `~/.dabbler/current-orchestrator.json`
and replaces it with per-session-set markers at
`<workspace>/docs/session-sets/<slug>/.dabbler/orchestrator.json`. The
correctness defect being fixed: three parallel VS Code windows on
three different consumer repos all wrote to one global file and
clobbered each other's state (memory `project_consumer_repos`).

Session 3 was spec'd via the 2026-05-18 custom-tree-pivot audit (see
`docs/proposals/2026-05-18-custom-tree-pivot/`). GPT-5.4 + Gemini Pro
consensus locked three operator decisions: D1 packaging split
(identity-only S3 + custom-tree S4); D2 ambiguity fail-closed (skip
the write when multiple in-progress sets resolve); D3 orphan
fail-closed (no workspace-level marker on null resolution).

## What you're being asked to verify

This is a **single-round verification** covering the S3 deliverables.
Bundle keeps under ~1200 LOC: the writer (newly per-set), the reader
(per-set resolver + watcher rebinding + slug validation), the
`SessionSetsModel` data-layer extraction, and a summary of the
Playwright scenarios. Please answer Q1–Q9 in order with VERIFIED /
MUST-FIX / SUGGEST verdicts plus 1–3 sentences of reasoning.

The complete spec for Session 3 lives in
`docs/session-sets/029-orchestrator-model-effort-gauges/spec.md`
Session 3 section (steps 1–10, Creates, Touches, Ends-with, Progress
keys). The synthesis with operator decisions D1–D3 is in
`docs/proposals/2026-05-18-custom-tree-pivot/synthesis.md`.

---

### Q1. Walk-up resolver algorithm (writer)

The writer's `walkUpResolveSet(startCwd)` walks from cwd upward
looking for a `docs/session-sets/` directory. Inside that directory,
it reads each subdir's `session-state.json` and collects subdirs with
`status: "in-progress"`. Returns `{ workspaceRoot, slug, setDir }` on
exactly one match; returns `{ reason: ... }` otherwise.

Verify:
- The walk-up termination condition (`parent === current`) correctly
  handles Windows drive roots (`C:\`) and POSIX root (`/`).
- The candidate test (`fs.statSync(candidate).isDirectory()`) is the
  right shape for the existence check (vs. `existsSync`, which would
  also accept a file named `session-sets`).
- The "exactly one in-progress" check is `inProgress.length === 1`
  (not `>= 1`), enforcing D2 fail-closed on >1.
- The reader's `resolveActiveSet()` runs the SAME algorithm rooted at
  `vscode.workspace.workspaceFolders[0]`, iterating workspace folders
  in order for multi-root parity.

### Q2. Marker schema v3 field (`sessionSetSlug`)

The writer's `buildMarker()` adds `sessionSetSlug: resolution.slug`
at the top level. `mergeEffort()` (for `/think*` updates) also
re-stamps `sessionSetSlug` from the current resolution so a marker
that survives across a session-set boundary converges on the correct
slug rather than carrying the old one.

The reader treats slug mismatch as `kind: "empty"` (falls through to
the empty-state CTA). The `OrchestratorMarker` TypeScript interface
declares `sessionSetSlug?: string` (optional) so v2 markers without
the field don't crash the parser — but the v3 reader **only**
renders when either the field is absent OR matches the resolved slug.

Verify the validation expression in the reader:
```ts
if (marker.sessionSetSlug && marker.sessionSetSlug !== res.resolved.slug) {
  return { kind: "empty" };
}
```

Is this correct? Specifically, should a marker WITHOUT
`sessionSetSlug` (legacy v2 shape) render or fall back? The spec
step 8 says "Pre-existing `~/.dabbler/current-orchestrator.json` is
silently ignored by the new reader." The new reader reads from
per-set paths only, so a legacy v2 marker can ONLY appear in the
per-set location if a future v2-shaped writer drops it there — which
shouldn't happen post-0.15.0. The permissive treatment is meant for
forward-compat with a future v4 marker that drops the field. Is
that defensible, or should the slug check be mandatory (strict)?

### Q3. Fail-closed posture (writer)

On `walkUpResolveSet` returning a reason instead of a slug, the
writer:
1. Appends a JSON entry to `~/.dabbler/orchestrator-writer.log` with
   `timestamp`, `writer`, `sessionSetSlug: null`, `proposed`, `reason`,
   `candidates` (for the ambiguous case), `cwd`.
2. Exits 0 (so the hook chain doesn't see a non-zero return).

The reader, on the same `unresolved` paths, returns
`{ kind: "empty" }` and renders its existing empty-state CTA.

Verify this matches D2/D3:
- D2 ambiguity → skip write, log to writer-log, no marker file
  created. Reader sees no marker → empty state. ✓
- D3 orphan (no in-progress set OR cwd outside any `docs/session-sets/`)
  → skip write, log to writer-log, no workspace-level orphan marker
  created. Reader sees no resolution → empty state. ✓

Is there any case where the writer might emit an orphan marker
(e.g., a workspace-level `.dabbler/` outside any session set)? The
intent is **no orphan markers ever**.

### Q4. `.gitignore` self-protection vs. workspace-root patch

The spec step 2 originally said: "Auto-patch existing repos
non-interactively on next workspace init (Gemini Pro must-fix)."
There is no `scripts/init-workflow.py` to auto-patch from — so the
implementation took two routes:

1. **Workspace-root patch (this repo only):** the canonical repo's
   `.gitignore` adds `docs/session-sets/*/.dabbler/` as
   belt-and-suspenders.
2. **Self-protecting `.gitignore` (every repo, automatic):** the
   writer drops a `.gitignore` containing `*\n!.gitignore\n` into
   each per-set `.dabbler/` directory on first create. The
   `.gitignore` file itself IS tracked; everything else in the
   directory is ignored. Consumer repos inherit the protection on
   first marker-write without any operator intervention.

Verify this satisfies the Gemini must-fix "auto-patch existing
repos non-interactively on next workspace init":
- Yes, because the first writer fire (which IS the auto-patch
  trigger) lands the self-protect file as a side effect.
- No, because the workspace-root `.gitignore` itself is not patched
  — only the per-set directory is.

Operator concern (R9): "If a workspace's `.gitignore` is not
auto-patched, per-set markers could be staged for commit by
mistake." The self-protect path mitigates this AT the per-set
directory level. Is this sufficient mitigation, or does the
workspace-root patch need to be added programmatically too?

### Q5. Watcher re-binding on set transitions

The reader uses TWO file-system watchers:
1. **State watcher** on `docs/session-sets/*/session-state.json`
   (workspace-relative). Fires on close-out flips, start_session,
   cancellation, restore.
2. **Marker watcher** on the resolved per-set marker file
   (absolute path). Re-bound whenever resolution changes.

`rebindMarkerWatcher()` compares `nextPath` to
`this.currentMarkerPath`; if unchanged AND a watcher exists,
returns early (idempotent). If changed, disposes the old watcher
and binds a fresh one.

Verify:
- State watcher trigger calls `rebindMarkerWatcher()` then
  `scheduleRender()`. ✓
- A close-out flip on the active in-progress set fires the state
  watcher, which re-resolves (now finds no in-progress set →
  `unresolved`), drops the old marker watcher, and renders empty
  state. ✓
- A start_session on a different set fires the state watcher,
  which re-resolves to the new set's marker path, binds a fresh
  watcher there, and renders the new state. ✓

Edge case: two simultaneous transitions (close session A + start
session B). The state-watcher trigger fires twice; the resolver
runs after both files are settled (most platforms batch events).
Is the rebinding logic robust to this?

### Q6. `SessionSetsModel` extraction faithfulness

`src/providers/SessionSetsModel.ts` is a NEW file containing:
- `needsMigrationBadge`, `iconUriFor`, `isCurrentSessionInFlight`,
  `progressText`, `touchedDate`, `uatBadge`, `forceClosedBadge`,
  `modeBadge` (pure helpers; no VS Code state)
- `bucketSets(all)` returning `{ inProgress, notStarted, complete, cancelled }`
- `sortBucket(subset, groupKey)` with the existing sort rules
  (in-progress / complete / cancelled by `lastTouched` desc;
  not-started by name asc)
- `ICON_FILES` map

`SessionSetsProvider` re-imports these and re-exports
`forceClosedBadge`, `isCurrentSessionInFlight`, `modeBadge`,
`needsMigrationBadge`, `progressText` so existing callers
(`cancelTreeView.test.ts`, `forceClosedBadge.test.ts`,
`sessionSetsProvider.test.ts`) continue to import from the same
module path without breakage.

The Layer-2 test
`src/test/suite/sessionSetsProvider.test.ts` was repointed to
import directly from `SessionSetsModel` to track the canonical
home.

Verify:
- The extracted helpers are byte-for-byte equivalent to the
  pre-extraction inline definitions (no behavioral drift). ✓
- The provider's `getChildren()` correctly delegates bucket/sort
  decisions to `bucketSets` + `sortBucket` rather than inlining
  the filter+sort. ✓
- The future custom webview tree (Set 029 S4) can consume the
  same `SessionSetsModel` exports without further refactor. ✓

### Q7. Playwright coverage

12 scenarios total (A–L). New for S3:
- I: mismatched `sessionSetSlug` → reader falls back to empty state
- J: helper-script ambiguous (2 in-progress sets) → write skipped,
  log entry with `reason: "multiple-in-progress-sets"` + `candidates`
- K: helper-script writes to per-set path on single in-progress set,
  verifies schema v3, slug match, AND self-protect `.gitignore`
  presence + content (`*\n!.gitignore\n`)
- L: helper-script invoked outside any `docs/session-sets/` → skip,
  log entry with `reason: "no-docs-session-sets"`, no legacy global
  marker created

Existing A–H scenarios were updated to:
- seed markers at per-set path (writes inside `seed.set_dir`)
- call `startSession(seed, 1)` before launching VS Code so the seed
  set is `in-progress` (otherwise the resolver returns `no-in-progress-set`)
- declare `schemaVersion: 3` and `sessionSetSlug: seed.slug` in the
  marker objects

Scenario H (helper-precedence) now exercises the per-set path; the
final assertion verifies the marker landed under `seed.set_dir/.dabbler/`,
NOT under `fakeHome/.dabbler/current-orchestrator.json` (the
legacy v2 path is explicitly checked to NOT exist).

Verify coverage is sufficient for the S3 spec's step 9 acceptance:
- "Two in-progress sets in one workspace → writer skips,
  orchestrator-writer.log carries the ambiguity entry, indicator
  shows empty-state CTA." → Scenario J (writer skip + log) + the
  empty-state path is exercised by Scenarios G/I (reader side
  returns empty). The combined coverage is split across helper +
  reader scenarios — is that adequate or does an end-to-end
  ambiguous-resolution-with-VS-Code-launch scenario need to be added?
- "Single in-progress set → writer writes to `<set>/.dabbler/orchestrator.json`,
  indicator renders the gauges." → Scenario K (writer) + Scenarios
  A–F (reader). ✓
- "Schema-v3 marker with mismatched `sessionSetSlug` → reader
  falls back to empty state and logs." → Scenario I covers the
  empty-state fallback; the reader does NOT currently emit a log
  entry on slug mismatch (the spec text says "logs", but the
  implementation falls silent). Is this gap a must-fix?
- "`cwd` outside any `docs/session-sets/` directory → writer
  skips, no orphan marker written." → Scenario L. ✓

### Q8. Version bump rationale (0.14.2 → 0.15.0, not 0.14.3)

Spec D9 (Q9 in the synthesis) locked **minor bump 0.15.0** as
consensus between Gemini + GPT-5.4, on the rationale that the
identity model change is breaking for any consumer that was
relying on the v0.14.2 preview's global marker path (and the
schema v2 shape). v0.14.2 never shipped to Marketplace, so no
external consumer is affected — but the spec explicitly chose
the minor bump for the schema-version audit trail.

Verify this is right per semver intent (preview-only, but
semver-honest), or should it be 0.14.3 (patch) since no external
consumer was ever affected?

### Q9. CHANGELOG accuracy + spec faithfulness

The CHANGELOG [0.15.0] section claims:
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

Verify the CHANGELOG matches the implementation. Specifically:
- "Watcher re-binding on set transitions" — implemented via the
  state-watcher pattern. ✓
- "Re-run `Dabbler: Install Orchestrator Hook (Claude Code)` after
  upgrade" — the installer is unchanged; the helper-script path
  resolution is internal. Is the operator-facing copy honest?
  (The hook entry in `~/.claude/settings.json` is unchanged; what
  changes is the resolver behavior INSIDE the helper.)

Any drift between CHANGELOG, marker-schema doc, and implementation
that needs cleanup before close-out?

---

## Final verdict

Please emit one summary line at the end:

`VERDICT: VERIFIED` if Q1–Q9 all pass without must-fix items
`VERDICT: MUST-FIX (<count>)` if any Q has a must-fix
`VERDICT: SUGGEST (<count>)` if no must-fix but ≥1 suggest items

Followed by a 2–3-sentence overall summary.
