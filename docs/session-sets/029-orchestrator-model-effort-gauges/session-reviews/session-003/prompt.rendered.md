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


---

## File 1: scripts/write-orchestrator-marker.js

```javascript
#!/usr/bin/env node
// write-orchestrator-marker.js
//
// Shared marker-file writer for the orchestrator indicator gauges.
// Invoked from:
//   - Claude Code SessionStart hook (mode=session-start, payload via stdin)
//   - Claude Code UserPromptSubmit hook (mode=user-prompt-submit, payload via stdin)
//   - VS Code manual-override quickpick (mode=manual, payload via stdin)
//   - Codex config.toml watcher (mode=configured-default, payload via stdin)
//
// Set 029 Session 3 (schema v3, per-set identity): the canonical marker
// path is now per-session-set —
// `<workspace>/docs/session-sets/<slug>/.dabbler/orchestrator.json` — not
// the legacy global `~/.dabbler/current-orchestrator.json`. The writer
// resolves the active session set by walking up from `cwd` looking for a
// `docs/session-sets/` directory, then picking the single
// `status: "in-progress"` subdirectory. Fail-closed posture: if zero or
// more than one in-progress sets are resolvable (or no
// `docs/session-sets/` is reachable from cwd), the write is SKIPPED and
// the reason is appended to `~/.dabbler/orchestrator-writer.log`. No
// workspace-level orphan marker is created.
//
// Per Set 029 audit (audit-summary.md §"Marker file schema" + §"Multi-writer
// precedence" + §"Visual treatment by signalKind") + 2026-05-18
// custom-tree-pivot synthesis (D1/D2/D3 decisions). Locked design — do not
// re-litigate.

const fs = require("fs");
const os = require("os");
const path = require("path");

// Schema + behavior constants (locked by Set 029 Session 1 audit; schema
// bumped to v3 in Session 3 alongside the per-set identity move).
const SCHEMA_VERSION = 3;
const DEFAULT_STALENESS_MAX_SEC = 28800; // 8h
const PRECEDENCE = ["current", "manual", "last-observed", "configured-default"];
const RETRY_BACKOFFS_MS = [50, 200, 600, 1200]; // 4 retries after the initial attempt → 5 total

const DABBLER_HOME_DIR = path.join(os.homedir(), ".dabbler");
// Writer log stays under ~/.dabbler/ so a SINGLE log captures every
// writer attempt across every session set — including the
// fail-closed skips that have no per-set path to land under.
const WRITER_LOG_PATH = path.join(DABBLER_HOME_DIR, "orchestrator-writer.log");

// Per-set marker file is created under
// `<workspace>/docs/session-sets/<slug>/.dabbler/`. The .dabbler/
// directory carries a self-protecting .gitignore on first create so the
// marker file never gets staged for commit by accident — independent of
// whether the workspace's root .gitignore has been patched.
// `*\n!.gitignore\n` ignores everything in this directory EXCEPT the
// .gitignore itself, which IS tracked so a fresh clone of the workspace
// inherits the same self-protection without operator intervention.
const SELF_IGNORE_CONTENT = "*\n!.gitignore\n";

function ensureHomeDir() {
  fs.mkdirSync(DABBLER_HOME_DIR, { recursive: true });
}

// Ensure the per-set `.dabbler/` directory exists, and drop a
// self-protecting `.gitignore` if one isn't already present. Idempotent.
function ensurePerSetMarkerDir(perSetMarkerDir) {
  fs.mkdirSync(perSetMarkerDir, { recursive: true });
  const ignorePath = path.join(perSetMarkerDir, ".gitignore");
  if (!fs.existsSync(ignorePath)) {
    try {
      fs.writeFileSync(ignorePath, SELF_IGNORE_CONTENT, { encoding: "utf8" });
    } catch {
      // Best-effort: if the .gitignore drop fails, the marker write
      // should still proceed. The workspace's root .gitignore (if
      // patched) is the other line of defense.
    }
  }
}

function readStdinSync() {
  try {
    const data = fs.readFileSync(0, "utf8");
    return data;
  } catch {
    return "";
  }
}

function parseArgs(argv) {
  const out = {
    mode: null,
    writer: null,
    forceOverride: false,
    cwd: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--mode") {
      out.mode = argv[++i];
    } else if (a === "--writer") {
      out.writer = argv[++i];
    } else if (a === "--force-override") {
      out.forceOverride = true;
    } else if (a === "--cwd") {
      // Test seam: callers can pin the cwd explicitly so the walk-up
      // resolver doesn't accidentally pick up a real session-set from
      // the harness host's filesystem.
      out.cwd = argv[++i];
    }
  }
  return out;
}

function precedenceIndex(signalKind) {
  const idx = PRECEDENCE.indexOf(signalKind);
  return idx === -1 ? PRECEDENCE.length : idx; // unknown sorts last (weakest)
}

function appendWriterLog(entry) {
  try {
    ensureHomeDir();
    fs.appendFileSync(
      WRITER_LOG_PATH,
      JSON.stringify(entry) + "\n",
      { encoding: "utf8" },
    );
  } catch {
    // Logging is best-effort; never block a write on log-append failure.
  }
}

// ---------------------------------------------------------------------
// Walk-up resolver: locate the workspace's active session set.
//
// Algorithm (per spec.md S3 step 3):
//   current = cwd
//   while current != root_of_filesystem:
//     candidate = current/docs/session-sets
//     if directory_exists(candidate):
//       sets = readdir(candidate)
//       in_progress = [s for s in sets if status(s) == "in-progress"]
//       if len(in_progress) == 1: return that set
//       if len(in_progress) > 1:  return null  // fail closed (D2)
//       return null                            // no in-progress set
//     current = parent(current)
//   return null                                // no docs/session-sets/
//
// Returns { workspaceRoot, slug, setDir } on success, or
// { reason: "no-docs-session-sets" | "no-in-progress-set" |
//   "multiple-in-progress-sets" } on failure.
// ---------------------------------------------------------------------
function walkUpResolveSet(startCwd) {
  let current = path.resolve(startCwd);
  // path.parse(current).root gives "C:\\" or "/" depending on platform;
  // when current === root, parent === current and the loop terminates.
  while (true) {
    const candidate = path.join(current, "docs", "session-sets");
    let candidateIsDir = false;
    try {
      candidateIsDir = fs.statSync(candidate).isDirectory();
    } catch {
      candidateIsDir = false;
    }
    if (candidateIsDir) {
      let entries;
      try {
        entries = fs.readdirSync(candidate, { withFileTypes: true });
      } catch {
        return { reason: "no-docs-session-sets" };
      }
      const inProgress = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const statePath = path.join(candidate, entry.name, "session-state.json");
        let state;
        try {
          state = JSON.parse(fs.readFileSync(statePath, "utf8"));
        } catch {
          continue;
        }
        if (state && state.status === "in-progress") {
          inProgress.push(entry.name);
        }
      }
      if (inProgress.length === 1) {
        const slug = inProgress[0];
        return {
          workspaceRoot: current,
          slug,
          setDir: path.join(candidate, slug),
        };
      }
      if (inProgress.length === 0) {
        return { reason: "no-in-progress-set" };
      }
      return { reason: "multiple-in-progress-sets", candidates: inProgress };
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return { reason: "no-docs-session-sets" };
    }
    current = parent;
  }
}

// Tier classification: 6.4 normalized levels mapped to gauge zones.
// Used by the webview's gauge rendering. Stored in the marker so the
// webview doesn't need a provider×model lookup table on its side.
function classifyTier(provider, model) {
  if (!model) return "unknown";
  const m = model.toLowerCase();
  if (provider === "anthropic" || m.includes("claude")) {
    if (m.includes("opus")) return "flagship";
    if (m.includes("sonnet")) return "mid";
    if (m.includes("haiku")) return "low";
  }
  if (provider === "google" || m.includes("gemini")) {
    if (m.includes("pro")) return "flagship";
    if (m.includes("flash-2") || m.includes("flash 2") || m.includes("2.5")) return "mid";
    if (m.includes("flash")) return "low";
  }
  if (provider === "openai" || m.startsWith("o1") || m.startsWith("o3") || m.includes("gpt")) {
    if (m.startsWith("o1") || m.startsWith("o3") || m.includes("5") || m.includes("gpt-4o") && !m.includes("mini")) return "flagship";
    if (m.includes("mini")) return "low";
    return "mid";
  }
  if (provider === "github" || m.includes("copilot")) return "mid";
  return "unknown";
}

function deriveModelDisplayName(provider, model) {
  if (!model || model === "unknown") {
    return "(model unknown)";
  }
  const m = model;
  if (/^claude-opus-4-?7$/i.test(m)) return "Opus 4.7";
  if (/^claude-opus-4-?6$/i.test(m)) return "Opus 4.6";
  if (/^claude-sonnet-4-?6$/i.test(m)) return "Sonnet 4.6";
  if (/^claude-haiku-4-?5/i.test(m)) return "Haiku 4.5";
  if (/^claude-/i.test(m)) return m.replace(/^claude-/i, "").replace(/-/g, " ");
  return m;
}

function deriveProviderDisplayName(provider) {
  switch (provider) {
    case "anthropic": return "Claude";
    case "google":    return "Gemini";
    case "openai":    return "Codex";
    case "github":    return "Copilot";
    default:          return provider || "Orchestrator";
  }
}

function readExistingMarker(markerPath) {
  try {
    const raw = fs.readFileSync(markerPath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isStale(marker, nowMs) {
  if (!marker || !marker.updatedAt) return true;
  const ageSec = (nowMs - Date.parse(marker.updatedAt)) / 1000;
  const limit = typeof marker.stalenessMaxSec === "number"
    ? marker.stalenessMaxSec
    : DEFAULT_STALENESS_MAX_SEC;
  return ageSec > limit;
}

// Build the marker object from a payload. Per Set 029 audit Marker schema
// v3 (sessionSetSlug added as an integrity field).
function buildMarker(args, payload, nowIso, resolution) {
  const writer = args.writer || payload.writer || "unknown";

  // Mode → top-level signalKind / confidence defaults.
  let signalKind = payload.signalKind;
  let confidence = payload.confidence;

  if (args.mode === "session-start") {
    signalKind = signalKind || "current";
    confidence = confidence || "high";
  } else if (args.mode === "user-prompt-submit") {
    // merge-effort mode handled separately in main(); not a fresh top-level write.
  } else if (args.mode === "manual") {
    signalKind = signalKind || "manual";
    confidence = confidence || "high";
  } else if (args.mode === "configured-default") {
    signalKind = signalKind || "configured-default";
    confidence = confidence || "medium";
  } else {
    signalKind = signalKind || "current";
    confidence = confidence || "medium";
  }

  // Confidence-low producer rule (Set 029 audit §"Visual treatment by
  // signalKind"): when the model field is missing/null/unparseable on a
  // Claude SessionStart write, force low confidence + model=unknown.
  let provider = payload.provider || "anthropic";
  let model = payload.model;
  const modelMissing = !model || typeof model !== "string" || model.trim() === "" || /^unknown$/i.test(model);
  if (args.mode === "session-start" && modelMissing) {
    confidence = "low";
    model = "unknown";
  }
  if (!model) model = "unknown";

  const modelDisplayName = payload.modelDisplayName || deriveModelDisplayName(provider, model);
  const providerDisplayName = payload.providerDisplayName || deriveProviderDisplayName(provider);
  const tier = payload.tier || classifyTier(provider, model);

  const effortIn = payload.effort || {};
  let effort;
  if (args.mode === "session-start") {
    effort = {
      normalized: "medium",
      native: "default",
      thinking: false,
      signalKind: "current",
      confidence: confidence,
    };
  } else if (args.mode === "configured-default") {
    effort = {
      normalized: effortIn.normalized || "medium",
      native: effortIn.native || "default",
      thinking: effortIn.thinking === true,
      signalKind: "configured-default",
      confidence: effortIn.confidence || "medium",
    };
  } else if (args.mode === "manual") {
    effort = {
      normalized: effortIn.normalized || "medium",
      native: effortIn.native || effortIn.normalized || "medium",
      thinking: effortIn.thinking === true,
      signalKind: "manual",
      confidence: "high",
    };
  } else {
    effort = {
      normalized: effortIn.normalized || "medium",
      native: effortIn.native || "default",
      thinking: effortIn.thinking === true,
      signalKind: effortIn.signalKind || "current",
      confidence: effortIn.confidence || "high",
    };
  }
  if (effortIn.observedAt) effort.observedAt = effortIn.observedAt;

  return {
    schemaVersion: SCHEMA_VERSION,
    sessionSetSlug: resolution.slug,
    updatedAt: nowIso,
    writer,
    signalKind,
    confidence,
    provider,
    providerDisplayName,
    model,
    modelDisplayName,
    tier,
    effort,
    stalenessMaxSec: typeof payload.stalenessMaxSec === "number"
      ? payload.stalenessMaxSec
      : DEFAULT_STALENESS_MAX_SEC,
  };
}

// Merge an effort-only update onto an existing marker. Used by the
// UserPromptSubmit hook so a /think* observation can update effort
// without clobbering the model signal. Always re-stamps sessionSetSlug
// from the current resolution so a marker that survived a cross-set
// boundary (e.g., the operator switched in-progress sets mid-session)
// converges on the correct slug instead of carrying the prior one.
function mergeEffort(existing, payload, writer, nowIso, resolution) {
  const eIn = payload.effort || {};
  const merged = {
    ...existing,
    schemaVersion: SCHEMA_VERSION,
    sessionSetSlug: resolution.slug,
    updatedAt: nowIso,
    writer,
    effort: {
      ...existing.effort,
      normalized: eIn.normalized || existing.effort?.normalized || "medium",
      native: eIn.native || existing.effort?.native || "default",
      signalKind: eIn.signalKind || "last-observed",
      confidence: eIn.confidence || "high",
    },
  };
  if (eIn.observedAt) merged.effort.observedAt = eIn.observedAt;
  if (typeof eIn.thinking === "boolean") merged.effort.thinking = eIn.thinking;
  return merged;
}

function sleepSync(ms) {
  const buf = new SharedArrayBuffer(4);
  const view = new Int32Array(buf);
  Atomics.wait(view, 0, 0, ms);
}

// Per Set 029 audit §"Multi-writer precedence":
//   1. Read existing marker. Missing → write unconditionally.
//   2. If existing is stale → write unconditionally.
//   3. Re-read immediately before atomic write+rename. If proposed
//      signalKind precedence ≥ existing precedence → proceed.
//   4. Skip otherwise; log to orchestrator-writer.log.
function attemptWriteWithPrecedence(proposed, args, nowMs, markerPath) {
  const initial = readExistingMarker(markerPath);
  if (initial && !args.forceOverride && !isStale(initial, nowMs)) {
    const proposedRank = precedenceIndex(proposed.signalKind);
    const initialRank = precedenceIndex(initial.signalKind);
    if (proposedRank > initialRank) {
      appendWriterLog({
        timestamp: new Date(nowMs).toISOString(),
        writer: proposed.writer,
        sessionSetSlug: proposed.sessionSetSlug,
        proposed: proposed.signalKind,
        existing: initial.signalKind,
        reason: "weaker-than-existing",
      });
      return { written: false, reason: "weaker-than-existing" };
    }
  }

  const jsonText = JSON.stringify(proposed, null, 2) + "\n";
  const tmp = `${markerPath}.tmp.${process.pid}.${Math.floor(Math.random() * 1e9)}`;
  fs.writeFileSync(tmp, jsonText, { encoding: "utf8" });

  try {
    if (!args.forceOverride) {
      const latest = readExistingMarker(markerPath);
      if (latest && !isStale(latest, Date.now())) {
        const proposedRank = precedenceIndex(proposed.signalKind);
        const latestRank = precedenceIndex(latest.signalKind);
        if (proposedRank > latestRank) {
          try { fs.unlinkSync(tmp); } catch { /* best effort */ }
          appendWriterLog({
            timestamp: new Date().toISOString(),
            writer: proposed.writer,
            sessionSetSlug: proposed.sessionSetSlug,
            proposed: proposed.signalKind,
            existing: latest.signalKind,
            reason: "weaker-than-existing-on-reread",
          });
          return { written: false, reason: "weaker-than-existing-on-reread" };
        }
      }
    }

    fs.renameSync(tmp, markerPath);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* best effort */ }
    throw err;
  }
  return { written: true };
}

function runWithRetries(fn) {
  let lastErr = null;
  for (let attempt = 0; attempt < RETRY_BACKOFFS_MS.length + 1; attempt++) {
    try {
      return fn();
    } catch (err) {
      lastErr = err;
      if (attempt < RETRY_BACKOFFS_MS.length) {
        sleepSync(RETRY_BACKOFFS_MS[attempt]);
      }
    }
  }
  throw lastErr;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.mode) {
    process.stderr.write(
      "write-orchestrator-marker.js: --mode is required " +
      "(session-start | user-prompt-submit | manual | configured-default)\n",
    );
    process.exit(2);
  }

  let payload = {};
  const stdinRaw = readStdinSync();
  if (stdinRaw.trim().length > 0) {
    try {
      payload = JSON.parse(stdinRaw);
    } catch (err) {
      if (args.mode === "session-start") {
        payload = {};
      } else {
        process.stderr.write(
          `write-orchestrator-marker.js: stdin JSON parse failed (${err.message}); ` +
          `aborting in mode=${args.mode}\n`,
        );
        process.exit(3);
      }
    }
  }

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  // Per-mode payload normalization (unchanged from v2).
  if (args.mode === "session-start") {
    payload.provider = payload.provider || "anthropic";
    if (!args.writer) args.writer = "claude-code-session-start-hook";
  } else if (args.mode === "user-prompt-submit") {
    if (!args.writer) args.writer = "claude-code-user-prompt-submit-hook";
    const promptText = typeof payload.prompt === "string" ? payload.prompt : "";
    const trimmed = promptText.trimStart();
    let native = null;
    let normalized = null;
    if (/^\/ultrathink\b/i.test(trimmed)) { native = "/ultrathink"; normalized = "max"; }
    else if (/^\/megathink\b/i.test(trimmed)) { native = "/megathink"; normalized = "extra-high"; }
    else if (/^\/think\b/i.test(trimmed)) { native = "/think"; normalized = "high"; }
    if (!native) {
      process.exit(0);
    }
    payload.effort = {
      normalized,
      native,
      thinking: true,
      signalKind: "last-observed",
      confidence: "high",
      observedAt: nowIso,
    };
  } else if (args.mode === "manual") {
    if (!args.writer) args.writer = "manual-override";
  } else if (args.mode === "configured-default") {
    if (!args.writer) args.writer = "configured-default";
  }

  // Resolve the session set via walk-up from cwd. Claude hooks pass the
  // workspace cwd in their payload (`payload.cwd`); the manual-override
  // and config-watcher writers run inside the extension host and inherit
  // `process.cwd()`. `--cwd` lets the harness pin a deterministic root.
  const startCwd = args.cwd || (typeof payload.cwd === "string" ? payload.cwd : process.cwd());
  const resolution = walkUpResolveSet(startCwd);
  if (!resolution.slug) {
    // Fail-closed: log + skip. Exit 0 so the hook chain doesn't see a
    // non-zero exit on what is, semantically, a no-op.
    appendWriterLog({
      timestamp: nowIso,
      writer: args.writer || "unknown",
      sessionSetSlug: null,
      proposed: payload.signalKind || args.mode,
      existing: null,
      reason: resolution.reason,
      candidates: resolution.candidates || null,
      cwd: startCwd,
    });
    process.exit(0);
  }

  const perSetMarkerDir = path.join(resolution.setDir, ".dabbler");
  const markerPath = path.join(perSetMarkerDir, "orchestrator.json");

  try {
    ensurePerSetMarkerDir(perSetMarkerDir);
    runWithRetries(() => {
      if (args.mode === "user-prompt-submit") {
        const tmp = `${markerPath}.tmp.${process.pid}.${Math.floor(Math.random() * 1e9)}`;
        try {
          const latest = readExistingMarker(markerPath);
          let chosen;
          if (latest) {
            chosen = mergeEffort(latest, payload, args.writer, nowIso, resolution);
          } else {
            // Bootstrap: no marker exists. Create a Medium-default
            // Claude marker with the just-detected /think* effort.
            const bootstrap = buildMarker(
              { ...args, mode: "session-start" },
              { provider: "anthropic", model: "unknown", writer: args.writer },
              nowIso,
              resolution,
            );
            bootstrap.effort = {
              normalized: payload.effort.normalized,
              native: payload.effort.native,
              thinking: true,
              signalKind: "last-observed",
              confidence: "high",
              observedAt: nowIso,
            };
            chosen = bootstrap;
          }

          fs.writeFileSync(tmp, JSON.stringify(chosen, null, 2) + "\n", { encoding: "utf8" });
          fs.renameSync(tmp, markerPath);
        } catch (err) {
          try { fs.unlinkSync(tmp); } catch { /* best effort */ }
          throw err;
        }
        return { written: true };
      }
      const marker = buildMarker(args, payload, nowIso, resolution);
      return attemptWriteWithPrecedence(marker, args, nowMs, markerPath);
    });
  } catch (err) {
    process.stderr.write(
      `write-orchestrator-marker.js: write failed after retries (${err.message})\n`,
    );
    appendWriterLog({
      timestamp: nowIso,
      writer: args.writer || "unknown",
      sessionSetSlug: resolution.slug,
      proposed: payload.signalKind || args.mode,
      existing: null,
      reason: `write-failed-after-retries: ${err.message}`,
    });
    process.exit(4);
  }
  process.exit(0);
}

main();

```

---

## File 2: src/providers/orchestratorIndicatorProvider.ts (full)

```typescript
// Orchestrator Indicator webview view provider.
//
// Renders two side-by-side semi-circle CSS gauges (Model + Effort)
// driven by the active session set's per-set marker file —
// `<workspace>/docs/session-sets/<slug>/.dabbler/orchestrator.json`
// (schema v3, Set 029 Session 3 custom-tree-pivot identity model). Per
// Set 029 audit (audit-summary.md §"Visual treatment by signalKind"
// REVISED 2026-05-18 + §Q6 stale-state policy + §"Multi-writer
// precedence") + 2026-05-18 custom-tree-pivot synthesis (per-set
// identity replaces the legacy global `~/.dabbler/current-orchestrator.json`).
//
// Height budget: ≤150px content (revised 2026-05-18 from the
// original ≤100px audit D3 after operator-on-device feedback that
// 100px was too small for legible labels and gauges). Container
// height cannot be guaranteed if the operator has dragged the
// divider — CSS uses overflow:auto so content scrolls if compressed
// (audit S3).
//
// Watching strategy: vscode.workspace.createFileSystemWatcher on the
// resolved per-set marker path PLUS a second watcher on the workspace's
// `docs/session-sets/**/session-state.json` files so the resolution
// re-runs when the active set transitions (e.g., on close-out of the
// current set or start of the next). A 60s poll backstops the watcher
// for the rare case where it misses an event under aggressive antivirus
// (per R5).

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { readAllSessionSets } from "../utils/fileSystem";

const DEFAULT_STALENESS_MAX_SEC = 28800; // 8h
const POLL_BACKSTOP_MS = 60_000;
const RENDER_DEBOUNCE_MS = 50;
const SESSION_STATE_GLOB = "docs/session-sets/*/session-state.json";

// Resolution of the active session set in the current workspace.
//
// Returns the slug + marker path on success, or a reason on failure
// (no workspace, no docs/session-sets/, no in-progress set, multiple
// in-progress sets). The renderer's empty-state path uses the
// failure reason to compose a diagnostic tooltip without leaking
// filesystem detail into the visible gauges.
interface ResolvedSet {
  workspaceRoot: string;
  slug: string;
  setDir: string;
  markerPath: string;
}
type SetResolution =
  | { kind: "resolved"; resolved: ResolvedSet }
  | { kind: "unresolved"; reason: "no-workspace" | "no-docs-session-sets" | "no-in-progress-set" | "multiple-in-progress-sets"; candidates?: string[] };

function resolveActiveSet(): SetResolution {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return { kind: "unresolved", reason: "no-workspace" };
  }
  // Walk the workspace folders in order; the FIRST folder with a
  // docs/session-sets/ directory is the canonical resolution root.
  // Multi-root workspaces with multiple session-set-bearing folders
  // are rare; when they exist, the canonical SessionSetsProvider's
  // discoverRoots() preserves the same ordering.
  for (const folder of folders) {
    const root = folder.uri.fsPath;
    const candidate = path.join(root, "docs", "session-sets");
    let candidateIsDir = false;
    try {
      candidateIsDir = fs.statSync(candidate).isDirectory();
    } catch {
      candidateIsDir = false;
    }
    if (!candidateIsDir) continue;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(candidate, { withFileTypes: true });
    } catch {
      continue;
    }
    const inProgress: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const statePath = path.join(candidate, entry.name, "session-state.json");
      let state: { status?: unknown } | null = null;
      try {
        state = JSON.parse(fs.readFileSync(statePath, "utf8"));
      } catch {
        continue;
      }
      if (state && (state as { status?: unknown }).status === "in-progress") {
        inProgress.push(entry.name);
      }
    }
    if (inProgress.length === 1) {
      const slug = inProgress[0];
      const setDir = path.join(candidate, slug);
      return {
        kind: "resolved",
        resolved: {
          workspaceRoot: root,
          slug,
          setDir,
          markerPath: path.join(setDir, ".dabbler", "orchestrator.json"),
        },
      };
    }
    if (inProgress.length === 0) {
      return { kind: "unresolved", reason: "no-in-progress-set" };
    }
    return { kind: "unresolved", reason: "multiple-in-progress-sets", candidates: inProgress };
  }
  return { kind: "unresolved", reason: "no-docs-session-sets" };
}

interface OrchestratorMarker {
  schemaVersion: number;
  // Schema v3 (Set 029 Session 3): identity field — the slug of the
  // session set this marker belongs to. Optional in the type so older
  // v2 markers (which lack the field) don't crash the parser; the
  // reader treats `undefined` as a permissive match.
  sessionSetSlug?: string;
  updatedAt: string;
  writer: string;
  signalKind: "current" | "configured-default" | "last-observed" | "manual";
  confidence: "high" | "medium" | "low";
  provider: string;
  providerDisplayName: string;
  model: string;
  modelDisplayName: string;
  tier: "low" | "mid" | "flagship" | "unknown";
  effort: {
    normalized: "low" | "medium" | "high" | "extra-high" | "max";
    native: string;
    thinking: boolean;
    signalKind: "current" | "configured-default" | "last-observed" | "manual";
    confidence: "high" | "medium" | "low";
    observedAt?: string;
  };
  stalenessMaxSec: number;
}

interface Recommendation {
  rawText: string;        // the full paragraph, for the tooltip
  providerName: string;   // e.g., "Claude"
  modelName: string;      // e.g., "Opus 4.7"
  effort: string;         // e.g., "high"
  sessionLabel: string;   // e.g., "Session 3 of 4"
  setName: string;        // e.g., "029-orchestrator-model-effort-gauges"
}

interface Mismatch {
  recommendation: Recommendation;  // the parsed ai-assignment.md entry, used to format the Suggested row
  reason: string;                  // tooltip text with axis-by-axis specifics
}

type RenderState =
  | { kind: "empty" }
  | { kind: "loaded"; marker: OrchestratorMarker; stale: boolean; ageSec: number; mismatch: Mismatch | null };

// Tier rank for the < / > than-suggested direction calculation.
// low<mid<flagship within any provider's ladder. flagship-of-Claude
// and flagship-of-Codex are treated as the same rank — providers are
// distinct but their tier ladders map onto a common 3-level scale.
function tierRank(tier: string | undefined): number {
  switch ((tier || "").toLowerCase()) {
    case "low":      return 0;
    case "mid":      return 1;
    case "flagship": return 2;
    default:         return -1;
  }
}

function effortRank(effort: string | undefined): number {
  switch ((effort || "").toLowerCase()) {
    case "low":        return 0;
    case "medium":     return 1;
    case "high":       return 2;
    case "extra-high": return 3;
    case "max":        return 4;
    default:           return -1;
  }
}

// File-scope twin of the class's fmtAge (kept lean so the capacity
// helper can call it without a class instance).
function fmtAgeStandalone(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "?";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

// Providers with at least one extra-capacity parameter (thinking,
// extended reasoning, etc.). The "thinking" clause in the model
// description is shown only for these. Codex/Copilot have no native
// extra-capacity parameter per audit Q3/Q4.
function providerHasExtraCapacity(provider: string): boolean {
  const p = (provider || "").toLowerCase();
  return p === "anthropic" || p === "google" || p.includes("claude") || p.includes("gemini");
}

// Compose the full "Actual Model" description from a marker. This
// is the canonical textual description shown in the model table.
// Future-proof: new capacity parameters (extended thinking, adaptive
// reasoning, etc.) become extra clauses appended here. No new UI
// elements needed.
function describeMarker(marker: OrchestratorMarker): string {
  const provider = marker.providerDisplayName || "";
  const modelIsUnknown = !marker.model || marker.model === "unknown";
  const modelText = modelIsUnknown ? "(model unknown)" : (marker.modelDisplayName || "");
  const effortText = effortDisplayNameStandalone(marker.effort.normalized).toLowerCase();

  // Configured-default is a parenthetical modifier on the model name.
  const modelClause = marker.signalKind === "configured-default"
    ? `${provider} ${modelText} (configured default)`
    : `${provider} ${modelText}`;

  let desc = `${modelClause}, ${effortText} effort`;

  // Thinking clause — only for providers that have the capability.
  if (providerHasExtraCapacity(marker.provider)) {
    const thinkingOn = marker.effort.thinking === true;
    if (thinkingOn && marker.effort.signalKind === "last-observed" && marker.effort.observedAt) {
      const ageSec = (Date.now() - Date.parse(marker.effort.observedAt)) / 1000;
      const native = marker.effort.native || "/think";
      desc += `, thinking on (last ${native} ${fmtAgeStandalone(ageSec)} ago)`;
    } else if (thinkingOn) {
      desc += `, thinking on`;
    } else {
      desc += `, thinking off`;
    }
  }

  return desc.trim().replace(/\s+/g, " ");
}

// Compose the suggested-model description from an ai-assignment.md
// recommendation. Format mirrors describeMarker() so the two table
// rows are visually parallel.
function describeRecommendation(rec: Recommendation): string {
  return `${rec.providerName} ${rec.modelName}, ${rec.effort.toLowerCase()} effort`.replace(/\s+/g, " ");
}

// File-scope twin of the class's effortDisplayName.
function effortDisplayNameStandalone(effort: string): string {
  switch (effort) {
    case "low":        return "Low";
    case "medium":     return "Medium";
    case "high":       return "High";
    case "extra-high": return "Extra-high";
    case "max":        return "Max";
    default:           return "Unknown";
  }
}

// Mirror the producer's classifyTier logic for parsing
// recommendation strings out of ai-assignment.md. The recommendation
// carries human-readable "Provider" + "Model" text (e.g., "Claude" +
// "Opus 4.7"); we classify those into the same low/mid/flagship
// buckets the marker uses, so the < / > direction is computed off a
// common rank scale.
function classifyRecommendationTier(providerName: string, modelName: string): string {
  const p = (providerName || "").toLowerCase();
  const m = (modelName || "").toLowerCase();
  if (p.includes("claude") || m.includes("claude")) {
    if (m.includes("opus")) return "flagship";
    if (m.includes("sonnet")) return "mid";
    if (m.includes("haiku")) return "low";
  }
  if (p.includes("gemini") || m.includes("gemini")) {
    if (m.includes("pro")) return "flagship";
    if (m.includes("flash 2") || m.includes("2.5")) return "mid";
    if (m.includes("flash")) return "low";
  }
  if (p.includes("codex") || p.includes("openai") || m.startsWith("gpt-") || m.includes("codex") || m.startsWith("o1") || m.startsWith("o3")) {
    if (m.includes("mini")) return "low";
    if (m.startsWith("o1") || m.startsWith("o3") || m.includes("5") || (m.includes("4o") && !m.includes("mini"))) return "flagship";
    return "mid";
  }
  if (p.includes("copilot") || m.includes("copilot")) return "mid";
  return "unknown";
}

export class OrchestratorIndicatorProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "dabblerOrchestratorIndicator";

  private view: vscode.WebviewView | undefined;
  // Two watchers: one on the resolved per-set marker file (binds when
  // a set is in-progress), and one on every workspace `session-state.json`
  // so the resolution re-runs when sets transition (start/close-out).
  private markerWatcherDisposable: vscode.Disposable | undefined;
  private stateWatcherDisposable: vscode.Disposable | undefined;
  private currentMarkerPath: string | null = null;
  private pollHandle: NodeJS.Timeout | undefined;
  private renderTimer: NodeJS.Timeout | undefined;

  constructor(private readonly extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "media")],
    };

    webviewView.webview.onDidReceiveMessage((msg) => {
      if (!msg || typeof msg !== "object") return;
      if (msg.command === "installHookClaudeCode") {
        vscode.commands.executeCommand("dabbler.installOrchestratorHook.claudeCode");
      } else if (msg.command === "setOrchestrator") {
        vscode.commands.executeCommand("dabbler.setOrchestrator");
      } else if (msg.command === "openWriterLog") {
        vscode.commands.executeCommand("dabbler.openOrchestratorWriterLog");
      }
    });

    webviewView.onDidDispose(() => {
      this.tearDownWatchers();
      this.view = undefined;
    });

    this.setUpStateWatcher();
    this.rebindMarkerWatcher();
    this.scheduleRender();
  }

  // Watcher on every workspace session-state.json file. Fires when the
  // active in-progress set changes (close-out flip, start_session,
  // cancellation, restore). On fire we re-run the resolver, re-bind the
  // marker watcher if the resolved path moved, and re-render.
  private setUpStateWatcher(): void {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) return;
    const pattern = new vscode.RelativePattern(folders[0], SESSION_STATE_GLOB);
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    const trigger = () => {
      this.rebindMarkerWatcher();
      this.scheduleRender();
    };
    watcher.onDidCreate(trigger);
    watcher.onDidChange(trigger);
    watcher.onDidDelete(trigger);
    this.stateWatcherDisposable = watcher;
  }

  // (Re-)bind the per-set marker watcher to the currently-resolved
  // marker path. Idempotent — if the resolved path hasn't changed, the
  // existing watcher is kept; if it has, the old watcher is disposed
  // and a fresh one is bound.
  private rebindMarkerWatcher(): void {
    const res = resolveActiveSet();
    const nextPath = res.kind === "resolved" ? res.resolved.markerPath : null;
    if (nextPath === this.currentMarkerPath && this.markerWatcherDisposable) {
      return;
    }
    this.markerWatcherDisposable?.dispose();
    this.markerWatcherDisposable = undefined;
    this.currentMarkerPath = nextPath;
    if (!nextPath) {
      this.ensurePollBackstop();
      return;
    }
    // Watch the file by name within its parent directory. The watcher
    // fires on create/change/delete regardless of whether the file
    // exists at the time the watcher is created — important because
    // the marker file may not be written until the first hook fire
    // after the per-set .dabbler/ directory is created.
    const markerDir = path.dirname(nextPath);
    const pattern = new vscode.RelativePattern(
      vscode.Uri.file(markerDir),
      "orchestrator.json",
    );
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    const trigger = () => this.scheduleRender();
    watcher.onDidCreate(trigger);
    watcher.onDidChange(trigger);
    watcher.onDidDelete(trigger);
    this.markerWatcherDisposable = watcher;
    this.ensurePollBackstop();
  }

  private ensurePollBackstop(): void {
    if (this.pollHandle) return;
    this.pollHandle = setInterval(() => {
      this.rebindMarkerWatcher();
      this.scheduleRender();
    }, POLL_BACKSTOP_MS);
  }

  private tearDownWatchers(): void {
    this.markerWatcherDisposable?.dispose();
    this.markerWatcherDisposable = undefined;
    this.stateWatcherDisposable?.dispose();
    this.stateWatcherDisposable = undefined;
    this.currentMarkerPath = null;
    if (this.pollHandle) {
      clearInterval(this.pollHandle);
      this.pollHandle = undefined;
    }
    if (this.renderTimer) {
      clearTimeout(this.renderTimer);
      this.renderTimer = undefined;
    }
  }

  private scheduleRender(): void {
    // Atomic writes on Windows can fire create+delete+create in quick
    // succession; debounce so we render once per coalesced burst.
    if (this.renderTimer) clearTimeout(this.renderTimer);
    this.renderTimer = setTimeout(() => this.render(), RENDER_DEBOUNCE_MS);
  }

  public render(): void {
    if (!this.view) return;
    const state = this.computeState();
    this.view.webview.html = this.renderHtml(state);
  }

  private computeState(): RenderState {
    const res = resolveActiveSet();
    if (res.kind === "unresolved") {
      // Fail-closed: surface the existing empty-state CTA. The reason
      // detail isn't displayed inline (the gauges stay simple) — it's
      // available via the writer-log command for diagnostics.
      return { kind: "empty" };
    }
    let raw: string;
    try {
      raw = fs.readFileSync(res.resolved.markerPath, "utf8");
    } catch {
      return { kind: "empty" };
    }
    let marker: OrchestratorMarker;
    try {
      marker = JSON.parse(raw) as OrchestratorMarker;
    } catch {
      return { kind: "empty" };
    }
    if (!marker || typeof marker !== "object" || !marker.signalKind) {
      return { kind: "empty" };
    }
    // Slug-integrity check (Set 029 Session 3 schema-v3 requirement):
    // a marker whose `sessionSetSlug` doesn't match the resolved set's
    // slug is treated as orphaned/stale (e.g., a marker file that
    // survived a slug rename or a cross-set copy-paste). Fall back to
    // the empty state rather than render data attached to the wrong work.
    if (marker.sessionSetSlug && marker.sessionSetSlug !== res.resolved.slug) {
      return { kind: "empty" };
    }
    const ageSec = (Date.now() - Date.parse(marker.updatedAt)) / 1000;
    const stalenessMaxSec =
      typeof marker.stalenessMaxSec === "number"
        ? marker.stalenessMaxSec
        : DEFAULT_STALENESS_MAX_SEC;
    const stale = ageSec > stalenessMaxSec;

    // Compute mismatch against the active session set's ai-assignment.md
    // recommendation. Operator-revised design 2026-05-18 round 2:
    // valence-neutral badge — surfaces the difference, doesn't judge it.
    // (Higher-than-recommended IS sometimes intentional — operator has
    // credits, or task is harder than the recommendation anticipated.)
    let mismatch: Mismatch | null = null;
    try {
      const rec = this.findActiveRecommendation();
      if (rec) {
        mismatch = this.computeMismatch(marker, rec);
      }
    } catch {
      // Defensive — recommendation reading is best-effort. Any error
      // (workspace not initialized, ai-assignment.md unparseable,
      // permissions) silently falls back to "no badge". The gauges
      // themselves keep working.
      mismatch = null;
    }
    return { kind: "loaded", marker, stale, ageSec, mismatch };
  }

  // Find the recommendation from the active session set's
  // ai-assignment.md. "Active" = the in-progress session set; "the
  // recommended session" = currentSession if non-null, else the
  // next-to-start (max(completedSessions) + 1) if any sessions
  // remain. If neither applies, returns null.
  private findActiveRecommendation(): Recommendation | null {
    let sets;
    try {
      sets = readAllSessionSets();
    } catch {
      return null;
    }
    // Prefer in-progress sets; among them, prefer one whose state file
    // says lifecycleState === "work_in_progress" (set 030 schema). We
    // don't have direct visibility into lifecycleState from SessionSet,
    // but the `state === "in-progress"` filter is close enough — the
    // SessionSet type's `state` field is derived from session-state.json.
    const inProgress = sets.filter((s) => s.state === "in-progress");
    if (inProgress.length === 0) return null;
    // If multiple in-progress sets, pick the most recently touched.
    inProgress.sort((a, b) => (b.lastTouched ?? "").localeCompare(a.lastTouched ?? ""));
    const set = inProgress[0];

    // Determine which session number's recommendation to compare against.
    const live = set.liveSession;
    let targetSession: number | null = null;
    if (live && typeof live.currentSession === "number") {
      targetSession = live.currentSession;
    } else if (
      live &&
      Array.isArray(live.completedSessions) &&
      typeof set.totalSessions === "number" &&
      live.completedSessions.length < set.totalSessions
    ) {
      const maxCompleted = live.completedSessions.length === 0
        ? 0
        : Math.max(...live.completedSessions);
      targetSession = maxCompleted + 1;
    }
    if (targetSession === null) return null;

    // Read + parse ai-assignment.md.
    let text: string;
    try {
      text = fs.readFileSync(set.aiAssignmentPath, "utf8");
    } catch {
      return null;
    }
    return this.extractRecommendation(text, targetSession, set.name);
  }

  // Parse ai-assignment.md to extract the recommendation for a
  // specific session number. Format (per the workflow doc § Step 3.5):
  //   ## Session N: <title>           (or "## Session N of M: <title>")
  //   ### Recommended orchestrator
  //   <Provider> <Model> @ effort=<level>. <Optional rationale...>
  //
  // We grep for the session heading, then for the next
  // "### Recommended orchestrator" within that block, then the next
  // non-blank paragraph. Defensive — returns null on any parse failure
  // rather than guessing.
  private extractRecommendation(
    text: string,
    sessionNumber: number,
    setName: string,
  ): Recommendation | null {
    const lines = text.split(/\r?\n/);
    const headingRe = new RegExp(
      `^##\\s+Session\\s+${sessionNumber}(?:\\s+of\\s+\\d+)?\\s*:\\s*(.*)$`,
      "i",
    );
    let sessionStartIdx = -1;
    let sessionTitle = "";
    for (let i = 0; i < lines.length; i++) {
      const m = headingRe.exec(lines[i]);
      if (m) {
        sessionStartIdx = i;
        sessionTitle = m[1].trim();
        break;
      }
    }
    if (sessionStartIdx === -1) return null;

    // Find the next ### Recommended orchestrator before the next ## block.
    let recHeadingIdx = -1;
    for (let i = sessionStartIdx + 1; i < lines.length; i++) {
      if (/^##\s+/.test(lines[i])) break; // next session block — stop
      if (/^###\s+Recommended\s+orchestrator/i.test(lines[i])) {
        recHeadingIdx = i;
        break;
      }
    }
    if (recHeadingIdx === -1) return null;

    // Find the next non-blank paragraph after the heading.
    let paragraphStart = -1;
    for (let i = recHeadingIdx + 1; i < lines.length; i++) {
      if (/^###\s+/.test(lines[i]) || /^##\s+/.test(lines[i])) break;
      if (lines[i].trim().length > 0) {
        paragraphStart = i;
        break;
      }
    }
    if (paragraphStart === -1) return null;

    // Read until blank line or next heading.
    const paragraphLines: string[] = [];
    for (let i = paragraphStart; i < lines.length; i++) {
      if (lines[i].trim().length === 0) break;
      if (/^###\s+/.test(lines[i]) || /^##\s+/.test(lines[i])) break;
      paragraphLines.push(lines[i]);
    }
    const paragraph = paragraphLines.join(" ").trim();

    // Parse "Provider Model @ effort=level."
    const recRe = /^([A-Z][A-Za-z]+)\s+([^@]+?)\s*@\s*effort\s*=\s*([a-z-]+)/i;
    const m = recRe.exec(paragraph);
    if (!m) return null;

    return {
      rawText: paragraph,
      providerName: m[1].trim(),
      modelName: m[2].trim().replace(/[.,;]+$/, ""),
      effort: m[3].trim().toLowerCase(),
      sessionLabel: `Session ${sessionNumber}: ${sessionTitle}`,
      setName,
    };
  }

  // Compare a marker to a recommendation. Returns a Mismatch with a
  // formatted "Suggested:" line if any axis differs, else null.
  //
  // Operator feedback 2026-05-18 round 4: replaced the directional
  // "< / > than suggested" badge with a yellow-bold-italic prose line
  // stating the actual recommendation. Rationale: shows the operator
  // exactly what was suggested (so they don't need to hover/think to
  // compute the diff), wraps gracefully on narrow panels, and feels
  // less visually heavy than a pill badge. Any axis mismatch
  // (provider OR model OR effort) triggers the suggestion line —
  // including cross-provider same-level cases (Codex active when
  // Claude was recommended is information worth surfacing, even if
  // the tier rank happens to match).
  private computeMismatch(marker: OrchestratorMarker, rec: Recommendation): Mismatch | null {
    const norm = (s: string) => String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

    const providerOk = norm(marker.providerDisplayName).includes(norm(rec.providerName)) ||
                       norm(rec.providerName).includes(norm(marker.providerDisplayName));
    const modelOk = norm(marker.modelDisplayName).includes(norm(rec.modelName)) ||
                    norm(rec.modelName).includes(norm(marker.modelDisplayName));
    const effortOk = norm(marker.effort.normalized) === norm(rec.effort);

    if (providerOk && modelOk && effortOk) return null;

    // Round 7: the recommendation itself rides on the Mismatch
    // object so the renderer can format the "Suggested" row of the
    // model table from it directly (describeRecommendation()).

    const diffs: string[] = [];
    if (!providerOk || !modelOk) {
      diffs.push(
        `model: actual "${marker.providerDisplayName} ${marker.modelDisplayName}", recommended "${rec.providerName} ${rec.modelName}"`,
      );
    }
    if (!effortOk) {
      diffs.push(`effort: actual "${marker.effort.normalized}", recommended "${rec.effort}"`);
    }
    if (!providerOk && diffs.length === 0) {
      diffs.push(`provider: actual "${marker.providerDisplayName}", recommended "${rec.providerName}"`);
    }

    return {
      recommendation: rec,
      reason:
        `Current orchestrator differs from ${rec.setName} ${rec.sessionLabel} recommendation. ` +
        diffs.join("; ") +
        ". This may be intentional (e.g., extra credits, task harder or simpler than anticipated) — " +
        `the Suggested row surfaces the recommendation; you decide. ` +
        `Switch via "Dabbler: Set Orchestrator Model & Effort".`,
    };
  }

  // ------- rendering helpers -------

  private renderHtml(state: RenderState): string {
    const cssUri = this.view!.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "orchestrator-indicator", "indicator.css"),
    );
    const nonce = String(Math.floor(Math.random() * 1e16));
    const csp =
      `default-src 'none'; ` +
      `style-src ${this.view!.webview.cspSource}; ` +
      `script-src 'nonce-${nonce}';`;

    const body = state.kind === "empty"
      ? this.renderEmpty()
      : this.renderLoaded(state.marker, state.stale, state.ageSec, state.mismatch);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <link rel="stylesheet" href="${cssUri}">
  <title>Orchestrator</title>
</head>
<body>
  <div class="container">${body}</div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.querySelectorAll('[data-command]').forEach((el) => {
      el.addEventListener('click', () => {
        vscode.postMessage({ command: el.getAttribute('data-command') });
      });
    });
  </script>
</body>
</html>`;
  }

  private renderEmpty(): string {
    return `<div class="empty-state">
  <div class="grey-gauges">
    <div class="gauge-svg-wrap">${this.renderGaugeSvg("unknown", "current", 0)}</div>
    <div class="gauge-svg-wrap">${this.renderGaugeSvg("unknown", "current", 0)}</div>
  </div>
  <span>No signal — </span><span class="install-cta" data-command="installHookClaudeCode">install hook</span>
</div>`;
  }

  private renderLoaded(marker: OrchestratorMarker, stale: boolean, ageSec: number, mismatch: Mismatch | null): string {
    const modelClasses = [
      "gauge-cell",
      `tier-${marker.tier || "unknown"}`,
      `signal-${marker.signalKind}`,
    ].join(" ");
    const effortClasses = [
      "gauge-cell",
      `effort-${marker.effort.normalized || "unknown"}`,
      `signal-${marker.effort.signalKind || "current"}`,
    ].join(" ");

    const modelNeedle = this.tierToNeedleAngle(marker.tier);
    const effortNeedle = this.effortToNeedleAngle(marker.effort.normalized);

    // Model sublabel — provider name + model name on one line, or
    // just provider name when model is unknown (the table below
    // carries the "(model unknown)" detail in the description).
    const modelIsUnknown = !marker.model || marker.model === "unknown";
    const modelSublabelText = modelIsUnknown
      ? this.escHtml(marker.providerDisplayName)
      : `${this.escHtml(marker.providerDisplayName)} ${this.escHtml(marker.modelDisplayName)}`;

    // Clock overlay (top-left of the gauge wrapper) — visual cue that
    // the gauge's signalKind is last-observed. The table description
    // also says "(last /think Xm ago)" — clock overlay is the
    // associated visual.
    const modelOverlay = marker.signalKind === "last-observed"
      ? `<span class="clock-overlay" title="last observed signal">⏱</span>`
      : "";
    const effortOverlay = marker.effort.signalKind === "last-observed"
      ? `<span class="clock-overlay" title="last observed signal">⏱</span>`
      : "";

    const modelTooltip = this.modelTooltip(marker);
    const effortTooltip = this.effortTooltip(marker);

    const staleClass = stale ? "stale" : "";
    const staleAnnotation = stale
      ? `<div class="last-updated">last updated ${this.fmtAge(ageSec)} ago — stale</div>`
      : `<div class="last-updated">updated ${this.fmtAge(ageSec)} ago</div>`;

    // Model description sections — vertical stack at the bottom.
    // Round 9: replaces the round-7 table. When no mismatch, only
    // the description is rendered (no header, no rule — avoids
    // redundant chrome). When a mismatch exists, both sections get
    // the full header + rule + description treatment.
    const actualDescription = describeMarker(marker);
    const actualSection = mismatch
      ? `<div class="model-section">
      <div class="model-section-header">Actual Model</div>
      <div class="model-section-text">${this.escHtml(actualDescription)}</div>
    </div>`
      : `<div class="model-section">
      <div class="model-section-text">${this.escHtml(actualDescription)}</div>
    </div>`;
    const suggestedSection = mismatch
      ? `<div class="model-section model-section-suggested" title="${this.escAttr(mismatch.reason)}">
      <div class="model-section-header">Suggested</div>
      <div class="model-section-text">${this.escHtml(describeRecommendation(mismatch.recommendation))}</div>
    </div>`
      : "";
    const modelSections = `<div class="model-sections">${actualSection}${suggestedSection}</div>`;

    return `<div class="gauges ${staleClass}">
  <div class="${modelClasses}" title="${this.escAttr(modelTooltip)}">
    <div class="gauge-svg-wrap">
      ${this.renderGaugeSvg(marker.tier, marker.signalKind, modelNeedle)}
      ${modelOverlay}
    </div>
    <div class="gauge-sublabel">${modelSublabelText}</div>
  </div>
  <div class="${effortClasses}" title="${this.escAttr(effortTooltip)}">
    <div class="gauge-svg-wrap">
      ${this.renderGaugeSvg(this.effortColorBucket(marker.effort.normalized), marker.effort.signalKind, effortNeedle)}
      ${effortOverlay}
    </div>
    <div class="gauge-sublabel">${this.escHtml(this.effortDisplayName(marker.effort.normalized))}</div>
  </div>
</div>
${staleAnnotation}
${modelSections}`;
  }

  private renderGaugeSvg(tier: string, signalKind: string, needleAngleDeg: number): string {
    // 70×38 semi-circle. cx=35, cy=35 puts the needle pivot at the
    // bottom-mid; the arc spans from leftmost (7,35) through top (35,7)
    // to rightmost (63,35). Needle origin is (35,35); rotating by
    // needleAngleDeg, where -90° points up (top center), -180° points
    // left (low zone), 0° points right (flagship zone).
    //
    // Round B verifier finding 2026-05-18 (Q4): the prior implementation
    // used a `180 + angle` adjustment that inverted the y-axis,
    // sending -90° DOWN instead of UP and pushing all needle/fill
    // endpoints below the visible viewBox. Corrected by using the angle
    // directly (no offset). In SVG, y increases downward, so for
    // `needleAngleDeg = -90` (intended: up), Math.sin(-90°) = -1, and
    // `cy + radius * (-1) = cy - radius` correctly places the endpoint
    // at (cx, cy-radius) = top-center.
    const cx = 35;
    const cy = 35;
    const radius = 28;
    const arcBg = `M${cx - radius},${cy} A${radius},${radius} 0 0 1 ${cx + radius},${cy}`;

    // Clamp the angle to the upper semicircle (-180..0). Compute the
    // fill arc's endpoint and the needle tip from that.
    const fillAngleDeg = Math.max(-180, Math.min(0, needleAngleDeg));
    const fillAngleRad = (fillAngleDeg * Math.PI) / 180;
    const fillEndX = cx + radius * Math.cos(fillAngleRad);
    const fillEndY = cy + radius * Math.sin(fillAngleRad);
    // All upper-semicircle arcs from leftmost (-180°) clockwise to any
    // angle in [-180, 0] traverse ≤180° → largeArc=0 always.
    const arcFill = `M${cx - radius},${cy} A${radius},${radius} 0 0 1 ${fillEndX.toFixed(2)},${fillEndY.toFixed(2)}`;

    const needleAngleRad = (needleAngleDeg * Math.PI) / 180;
    const needleLength = radius - 4;
    const needleTipX = cx + needleLength * Math.cos(needleAngleRad);
    const needleTipY = cy + needleLength * Math.sin(needleAngleRad);

    return `<svg class="gauge-svg" viewBox="0 0 70 38" data-tier="${this.escAttr(tier)}" data-signal="${this.escAttr(signalKind)}">
  <path class="gauge-arc-bg" d="${arcBg}" />
  <path class="gauge-arc-fill" d="${arcFill}" />
  <path class="gauge-rim" d="${arcBg}" />
  <line class="gauge-needle" x1="${cx}" y1="${cy}" x2="${needleTipX.toFixed(2)}" y2="${needleTipY.toFixed(2)}" />
  <circle class="gauge-needle-pivot" cx="${cx}" cy="${cy}" r="1.6" />
</svg>`;
  }

  private tierToNeedleAngle(tier: string): number {
    // -180° = leftmost (low), -90° = top-center, 0° = rightmost (flagship).
    switch (tier) {
      case "low":      return -150;
      case "mid":      return -90;
      case "flagship": return -30;
      case "unknown":  return -90;
      default:         return -90;
    }
  }

  private effortToNeedleAngle(effort: string): number {
    // 5-level effort scale where Medium is the operator-facing
    // "default" (audit D6). Place Medium at the gauge center (-90°)
    // so the default state reads as "neutral" (half-filled arc), and
    // spread the escalations Low / High / Extra-High / Max around it.
    // Operator feedback 2026-05-18: Medium at -120° rendered with a
    // too-short color arc that looked "low" against the Model gauge's
    // longer arc — re-centering Medium fixes the visual imbalance
    // while preserving the red→green polarity.
    switch (effort) {
      case "low":        return -150;
      case "medium":     return -90;
      case "high":       return -60;
      case "extra-high": return -35;
      case "max":        return -15;
      default:           return -90;
    }
  }

  private effortColorBucket(effort: string): string {
    // Reuse tier color classes for the effort gauge: map normalized
    // effort → tier-class for the stroke color.
    switch (effort) {
      case "low":        return "low";
      case "medium":     return "mid";
      case "high":       return "mid";
      case "extra-high": return "flagship";
      case "max":        return "flagship";
      default:           return "unknown";
    }
  }

  private effortDisplayName(effort: string): string {
    switch (effort) {
      case "low":        return "Low";
      case "medium":     return "Medium";
      case "high":       return "High";
      case "extra-high": return "Extra-High";
      case "max":        return "Max";
      default:           return "Unknown";
    }
  }

  private modelTooltip(marker: OrchestratorMarker): string {
    const conf = marker.confidence;
    switch (marker.signalKind) {
      case "current":
        return conf === "low"
          ? "live signal (low confidence — hook payload missing model)"
          : `live signal (${conf} confidence)`;
      case "configured-default":
        return "configured default (medium confidence — does not track runtime changes)";
      case "last-observed":
        return "last observed via /think (high confidence in detection, but may not reflect current message)";
      case "manual":
        return "set manually (high confidence)";
      default:
        return "";
    }
  }

  private effortTooltip(marker: OrchestratorMarker): string {
    const eSig = marker.effort.signalKind;
    if (eSig === "last-observed" && marker.effort.observedAt) {
      const age = this.fmtAge((Date.now() - Date.parse(marker.effort.observedAt)) / 1000);
      return `last observed ${age} ago via ${marker.effort.native || "/think"} (high confidence in detection, but may not reflect current message)`;
    }
    if (eSig === "configured-default") {
      return "configured default effort (medium confidence — does not track runtime changes)";
    }
    if (eSig === "manual") {
      return "set manually (high confidence)";
    }
    return `effort: ${this.effortDisplayName(marker.effort.normalized)} (${marker.effort.confidence} confidence)`;
  }

  private fmtAge(seconds: number): string {
    if (!isFinite(seconds) || seconds < 0) return "?";
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
    return `${Math.round(seconds / 86400)}d`;
  }

  private escHtml(s: string): string {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  private escAttr(s: string): string {
    return this.escHtml(s).replace(/"/g, "&quot;");
  }
}

```

---

## File 3: src/providers/SessionSetsModel.ts (new)

```typescript
import * as vscode from "vscode";
import { SessionSet, SessionState } from "../types";

// Set 029 Session 3: data-layer extraction from SessionSetsProvider so
// both the existing native `TreeView` (S3 ship) and the future custom
// webview tree (S4) can consume the same scan/bucket/sort/predicates
// without duplicating logic. The exported functions below are PURE —
// they take `SessionSet` records and return TreeItem chrome or text.
// The provider becomes a thin shim that calls into the model and the
// shared `fileSystem.readAllSessionSets()` scan.

// Set 030 Session 5: badge surfaced on any v2 (or broken-v3) state
// file. Tracked separately from the lifecycle-state badges so reviewers
// can see at a glance which sets still need a one-shot v3 migration
// even if they're otherwise healthy.
export function needsMigrationBadge(set: SessionSet): string {
  return set.needsMigration ? "(needs migration)" : "";
}

export const ICON_FILES: Record<SessionState, string> = {
  complete: "done.svg",
  "in-progress": "in-progress.svg",
  "not-started": "not-started.svg",
  cancelled: "cancelled.svg",
};

export function iconUriFor(
  extensionUri: vscode.Uri,
  state: SessionState,
): vscode.Uri | undefined {
  const file = ICON_FILES[state];
  return file ? vscode.Uri.joinPath(extensionUri, "media", file) : undefined;
}

// Set 030 Session 3: the v3 "in-flight" predicate is a direct read of
// the canonical `liveSession.currentSession` field, which `fileSystem.ts`
// populates from `readProgress` as the single in-progress session's
// number (or null when no session is in flight). v2's
// "currentSession not in completedSessions[]" predicate is gone — the
// v3 reader resolves the ambiguity at the source rather than letting
// it propagate into a downstream invariant check.
export function isCurrentSessionInFlight(set: SessionSet): boolean {
  return set.liveSession?.currentSession != null;
}

export function progressText(set: SessionSet): string {
  // Always show X/total. The earlier "X/X" shape on done sets assumed
  // completed === total, which masks bugs like a SET-level flip to
  // "complete" that fires before all sessions ran. Truthful display
  // surfaces the discrepancy at a glance.
  //
  // Set 022 Session 2 added two annotations to disambiguate the row.
  // Set 030 Session 3 renamed the terminal annotation to "Complete"
  // so the display vocabulary matches the JSON status glossary:
  //   * `N/N Complete` on complete rows — operator-facing "yes this
  //     really reached terminal state" cue.
  //   * `0/N · session 1 in flight` on rows where session N has
  //     started but not yet closed.
  const base = set.totalSessions && set.totalSessions > 0
    ? `${set.sessionsCompleted}/${set.totalSessions}`
    : set.sessionsCompleted > 0
      ? `${set.sessionsCompleted} complete`
      : "";

  if (set.state === "complete" && base) {
    return `${base} Complete`;
  }
  if (set.state === "in-progress" && isCurrentSessionInFlight(set)) {
    const n = set.liveSession?.currentSession;
    const annotation = `session ${n} in flight`;
    return base ? `${base} · ${annotation}` : annotation;
  }
  return base;
}

export function touchedDate(set: SessionSet): string {
  if (!set.lastTouched) return "";
  return new Date(set.lastTouched).toLocaleDateString("en-CA");
}

export function uatBadge(set: SessionSet): string {
  if (!set.config?.requiresUAT || !set.uatSummary) return "";
  if (set.uatSummary.pendingItems > 0) return `[UAT ${set.uatSummary.pendingItems}]`;
  if (set.uatSummary.totalItems > 0) return "[UAT done]";
  return "";
}

// Set 9 Session 3 (D-2 hard-scoping of ``--force``): the badge surfaces
// the rare case where a session set was closed via the hard-scoped
// ``--force`` bypass instead of the deterministic gate.
export function forceClosedBadge(set: SessionSet): string {
  return set.liveSession?.forceClosed === true ? "[FORCED]" : "";
}

// modeBadge kept as a no-op stub for existing imports / tests. Set 026
// Session 1 removed the outsource-last path; there is no longer any
// mode distinction to badge.
export function modeBadge(_set: SessionSet): string {
  return "";
}

// Bucket the scanned sets into the four lifecycle groups. The custom
// tree (S4) and the native tree (S3 ship) both consume this.
export interface BucketedSets {
  inProgress: SessionSet[];
  notStarted: SessionSet[];
  complete: SessionSet[];
  cancelled: SessionSet[];
}

export function bucketSets(all: SessionSet[]): BucketedSets {
  return {
    inProgress: all.filter((s) => s.state === "in-progress"),
    notStarted: all.filter((s) => s.state === "not-started"),
    complete: all.filter((s) => s.state === "complete"),
    cancelled: all.filter((s) => s.state === "cancelled"),
  };
}

// Sort within a bucket. In-progress / complete / cancelled rows sort by
// `lastTouched` desc (most recent first); not-started rows sort by name
// asc (operators usually want fresh-state rows in a stable order).
export function sortBucket(subset: SessionSet[], groupKey: SessionState): SessionSet[] {
  const out = subset.slice();
  if (groupKey === "not-started") {
    out.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    out.sort((a, b) => (b.lastTouched || "").localeCompare(a.lastTouched || ""));
  }
  return out;
}

```

---

## File 4: src/providers/SessionSetsProvider.ts (refactored)

```typescript
import * as vscode from "vscode";
import * as path from "path";
import { readAllSessionSets, discoverRoots } from "../utils/fileSystem";
import { SessionSet, SessionState } from "../types";
import { ScanState } from "./scanState";
import {
  bucketSets,
  forceClosedBadge,
  iconUriFor,
  isCurrentSessionInFlight,
  modeBadge,
  needsMigrationBadge,
  progressText,
  sortBucket,
  touchedDate,
  uatBadge,
} from "./SessionSetsModel";

// Set 029 Session 3: the data-layer extraction moved scan/bucket/sort
// helpers + the row-text predicates to `SessionSetsModel.ts`. This file
// is now a thin VS Code adapter — it owns the `TreeDataProvider`
// surface (refresh signaling, loading sentinel, TreeItem construction)
// and delegates every data decision to the model. The future custom
// webview tree (Set 029 S4) will consume the same model directly.
//
// Existing call sites (cancelTreeView.test.ts, forceClosedBadge.test.ts,
// sessionSetsProvider.test.ts) import named helpers from this file —
// the re-exports below preserve those imports verbatim.

export {
  forceClosedBadge,
  isCurrentSessionInFlight,
  modeBadge,
  needsMigrationBadge,
  progressText,
};

function folderTooltip(set: SessionSet): string {
  const roots = discoverRoots();
  const rel = path.relative(set.root, set.dir);
  return roots.length > 1 ? `${path.basename(set.root)} / ${rel}` : rel;
}

function contextValueFor(set: SessionSet): string {
  const parts = [`sessionSet:${set.state}`];
  if (set.config?.requiresUAT) parts.push("uat");
  if (set.config?.requiresE2E) parts.push("e2e");
  // Set 030 Session 5: append a `needs-migration` slug to the
  // contextValue when the set's state file is still v2.
  if (set.needsMigration) parts.push("needs-migration");
  return parts.join(":");
}

function liveSessionTooltipLines(set: SessionSet): string[] {
  if (!set.liveSession) return [];
  const ls = set.liveSession;
  const lines: string[] = [];
  if (typeof ls.currentSession === "number") {
    const total = set.totalSessions ? `/${set.totalSessions}` : "";
    const status = ls.status ? ` (${ls.status})` : "";
    lines.push(`Session: ${ls.currentSession}${total}${status}`);
  }
  if (ls.orchestrator) {
    const o = ls.orchestrator;
    const parts = [o.engine, o.model].filter(Boolean).join(" · ");
    const effort = o.effort && o.effort !== "unknown" ? ` @ effort=${o.effort}` : "";
    if (parts) lines.push(`Orchestrator: ${parts}${effort}`);
  }
  if (ls.verificationVerdict) {
    lines.push(`Verifier: ${ls.verificationVerdict}`);
  }
  if (ls.forceClosed === true) {
    lines.push(
      "Force-closed: gate bypassed via --force (incident recovery). " +
        "See closeout_force_used in session-events.jsonl for the operator's reason.",
    );
  }
  return lines;
}

function configTooltipLines(set: SessionSet): string[] {
  if (!set.config) return [];
  const flags: string[] = [];
  if (set.config.requiresUAT) flags.push("UAT");
  if (set.config.requiresE2E) flags.push("E2E");
  const lines: string[] = [];
  lines.push(`Gates: ${flags.length ? flags.join(" + ") : "none"}`);
  if (set.config.requiresUAT && set.uatSummary) {
    const u = set.uatSummary;
    if (u.totalItems > 0) {
      lines.push(`UAT items: ${u.pendingItems} pending / ${u.totalItems} total`);
    } else {
      lines.push("UAT checklist: not yet authored");
    }
  }
  return lines;
}

interface GroupItem extends vscode.TreeItem {
  contextValue: "group";
  groupKey: SessionState;
}

interface SetItem extends vscode.TreeItem {
  set: SessionSet;
}

export class SessionSetsProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    vscode.TreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  _cache: SessionSet[] | null = null;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly scanState?: ScanState,
  ) {
    this.scanState?.onDidChange(() => this._onDidChangeTreeData.fire());
  }

  refresh(): void {
    this._cache = null;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
    if (!vscode.workspace.workspaceFolders?.length) return [];

    if (!element && this.scanState?.phase === "loading") {
      return [this.makeLoadingSentinel()];
    }

    if (!this._cache) {
      this._cache = readAllSessionSets();
    }
    const all = this._cache;

    if (!element) {
      if (all.length === 0) {
        return [];
      }
      const buckets = bucketSets(all);
      const groups: GroupItem[] = [
        this.makeGroup("In Progress", "in-progress", buckets.inProgress.length),
        this.makeGroup("Not Started", "not-started", buckets.notStarted.length),
        this.makeGroup("Complete", "complete", buckets.complete.length),
      ];
      // Set 8: the Cancelled group only renders when ≥ 1 cancelled set
      // exists. A repo that never cancels a set should not see the group.
      if (buckets.cancelled.length > 0) {
        groups.push(this.makeGroup("Cancelled", "cancelled", buckets.cancelled.length));
      }
      return groups;
    }

    const group = element as GroupItem;
    if (group.contextValue === "group") {
      const buckets = bucketSets(all);
      let subset: SessionSet[];
      switch (group.groupKey) {
        case "in-progress": subset = buckets.inProgress; break;
        case "not-started": subset = buckets.notStarted; break;
        case "complete":    subset = buckets.complete;    break;
        case "cancelled":   subset = buckets.cancelled;   break;
      }
      return sortBucket(subset, group.groupKey).map((s) => this.makeSetItem(s));
    }

    return [];
  }

  // Set 030 Session 5: the loading sentinel shown while the
  // activation-time scan is in flight.
  private makeLoadingSentinel(): vscode.TreeItem {
    const item = new vscode.TreeItem(
      "Setting up your project…",
      vscode.TreeItemCollapsibleState.None,
    );
    item.description = "scanning session sets…";
    item.iconPath = vscode.Uri.joinPath(this.extensionUri, "media", "icon.svg");
    item.contextValue = "loading";
    item.tooltip =
      "Dabbler is scanning `docs/session-sets/` for session sets. " +
      "This usually completes within a frame; longer means a slow " +
      "filesystem or many sets to read.";
    return item;
  }

  private makeGroup(label: string, groupKey: SessionState, count: number): GroupItem {
    const item = new vscode.TreeItem(
      `${label}  (${count})`,
      count > 0
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.Collapsed,
    ) as GroupItem;
    item.iconPath = iconUriFor(this.extensionUri, groupKey);
    item.contextValue = "group";
    item.groupKey = groupKey;
    return item;
  }

  private makeSetItem(set: SessionSet): SetItem {
    const item = new vscode.TreeItem(
      set.name,
      vscode.TreeItemCollapsibleState.None,
    ) as SetItem;
    const bits = [
      progressText(set),
      touchedDate(set),
      modeBadge(set),
      uatBadge(set),
      forceClosedBadge(set),
      needsMigrationBadge(set),
    ].filter(Boolean);
    item.description = bits.join("  ·  ");
    item.tooltip = new vscode.MarkdownString(
      [
        `**${set.name}**`,
        `State: ${set.state}`,
        bits.length ? `Progress: ${bits.join(" · ")}` : null,
        ...configTooltipLines(set),
        ...liveSessionTooltipLines(set),
        `Folder: \`${folderTooltip(set)}\``,
      ]
        .filter(Boolean)
        .join("\n\n"),
    );
    item.contextValue = contextValueFor(set);
    item.set = set;
    item.iconPath = iconUriFor(this.extensionUri, set.state);
    item.command = {
      command: "dabblerSessionSets.openSpec",
      title: "Open Spec",
      arguments: [item],
    };
    return item;
  }
}

```

---

## File 5: docs/orchestrator-marker-schema.md (new)

# Orchestrator Marker Schema

> **Authoritative reference** for the orchestrator marker file consumed by
> the Dabbler AI Orchestration "Orchestrator" indicator view. Companion
> to [`session-state-schema.md`](session-state-schema.md) (which
> documents `session-state.json`). Any writer or reader that touches
> the marker without consulting this doc has a high chance of
> producing the wrong-set-attachment or cross-window contamination
> failure modes Set 029 Session 3 was designed to prevent.

**Schema version:** **v3** (Set 029 Session 3, 2026-05-18 — per-session-set identity).

**Path:** `<workspace>/docs/session-sets/<slug>/.dabbler/orchestrator.json`.

**Writers:** Claude Code SessionStart + UserPromptSubmit hooks
(via `scripts/write-orchestrator-marker.js`), Codex
config-watcher (Set 029 S5), Gemini/Copilot manual-override commands
(Set 029 S5), and the universal manual-override quickpick.

**Reader:** the Orchestrator Indicator webview provider
(`src/providers/orchestratorIndicatorProvider.ts`).

---

## Why per-session-set, not global

The v2 schema (v0.14.2 preview) used a single global file at
`~/.dabbler/current-orchestrator.json`. Three parallel VS Code windows
on three different consumer repos (a common operator pattern — see
memory `project_consumer_repos`) all wrote to the same file and
clobbered each other's state. The v3 schema solves this by binding
identity to the active session set rather than the user's home
directory:

- Each session set has its own marker file under its own
  `.dabbler/` directory.
- The writer resolves which set to write under by walking up from
  `cwd` looking for `docs/session-sets/<slug>/session-state.json`
  with `status: "in-progress"`.
- The reader runs the same walk-up rooted at the workspace folder.

This means three parallel windows on three repos render their own
correct state without coordination.

---

## v3 marker schema

```json
{
  "schemaVersion": 3,
  "sessionSetSlug": "029-orchestrator-model-effort-gauges",
  "updatedAt": "2026-05-18T17:04:10.471Z",
  "writer": "claude-code-session-start-hook",
  "signalKind": "current",
  "confidence": "high",
  "provider": "anthropic",
  "providerDisplayName": "Claude",
  "model": "claude-opus-4-7",
  "modelDisplayName": "Opus 4.7",
  "tier": "flagship",
  "effort": {
    "normalized": "medium",
    "native": "default",
    "thinking": false,
    "signalKind": "current",
    "confidence": "high"
  },
  "stalenessMaxSec": 28800
}
```

### Field reference

| Field | Type | Purpose |
|---|---|---|
| `schemaVersion` | int | Always `3` for v3 markers. v2 markers (no `sessionSetSlug`) are silently ignored by the v3 reader. |
| `sessionSetSlug` | string | The slug of the session set this marker belongs to. The reader validates this matches the resolved set's slug before rendering; mismatch → empty state. Treated as an **integrity field**, not just metadata. |
| `updatedAt` | ISO-8601 | When the marker was last written. Used for staleness (`stalenessMaxSec`). |
| `writer` | string | Identifies the writer for the writer log: e.g., `claude-code-session-start-hook`, `manual-override`, `codex-config-watcher`. |
| `signalKind` | enum | One of `current`, `manual`, `last-observed`, `configured-default`. Drives the visual treatment matrix per audit-summary §"Visual treatment by signalKind". |
| `confidence` | enum | One of `high`, `medium`, `low`. Used by the tooltip copy. |
| `provider` | string | Provider id: `anthropic`, `google`, `openai`, `github`. |
| `providerDisplayName` | string | Human label: `Claude`, `Gemini`, `Codex`, `Copilot`. |
| `model` | string | Model id (raw, from hook payload). |
| `modelDisplayName` | string | Human label: `Opus 4.7`, `Sonnet 4.6`, etc. |
| `tier` | enum | `low`, `mid`, `flagship`, `unknown`. Drives the Model gauge's needle position. |
| `effort.normalized` | enum | `low`, `medium`, `high`, `extra-high`, `max`. Drives the Effort gauge's needle position. |
| `effort.native` | string | Provider-native effort token: `default`, `/think`, `/megathink`, `/ultrathink`, etc. |
| `effort.thinking` | bool | Binary thinking on/off; drives the LED beside the effort gauge. |
| `effort.signalKind` | enum | Same enum as top-level `signalKind`. The effort gauge can have a different signalKind than the model gauge (e.g., `current` model + `last-observed` effort). |
| `effort.confidence` | enum | Same enum as top-level `confidence`. |
| `effort.observedAt` | ISO-8601 | Optional. Set when `effort.signalKind === "last-observed"`; used to render "(last /think Xm ago)". |
| `stalenessMaxSec` | int | Maximum age before the gauge enters the stale state. Default `28800` (8h). |

---

## Walk-up resolver (writer + reader)

```text
function resolveSessionSet(startCwd):
  current = absolutePath(startCwd)
  while true:
    candidate = current + "/docs/session-sets"
    if isDirectory(candidate):
      sets = readdir(candidate, dirsOnly=True)
      in_progress = []
      for entry in sets:
        statePath = candidate + "/" + entry + "/session-state.json"
        try:
          state = json.load(statePath)
          if state.status == "in-progress":
            in_progress.append(entry)
        except: continue
      if len(in_progress) == 1:
        return { slug, setDir }  // happy path
      if len(in_progress) == 0:
        return { reason: "no-in-progress-set" }
      return { reason: "multiple-in-progress-sets", candidates: in_progress }
    parent = dirname(current)
    if parent == current:
      return { reason: "no-docs-session-sets" }
    current = parent
```

The writer reads `cwd` from `payload.cwd` (Claude SessionStart /
UserPromptSubmit hooks include it), or from `process.cwd()` otherwise.
A `--cwd` CLI flag pins the resolution root for tests.

The reader rooted at `vscode.workspace.workspaceFolders[0]` runs the
same algorithm; it iterates workspace folders in order to support
multi-root workspaces.

---

## Fail-closed posture

Any of the three failure cases — no `docs/session-sets/` reachable,
zero in-progress sets, or more than one — produces:

1. **Writer:** appends a JSON entry to
   `~/.dabbler/orchestrator-writer.log` containing `timestamp`,
   `writer`, `sessionSetSlug` (null), `proposed` (the proposed
   `signalKind` or mode), `reason` (one of `no-docs-session-sets`,
   `no-in-progress-set`, `multiple-in-progress-sets`,
   `weaker-than-existing`, `weaker-than-existing-on-reread`,
   `write-failed-after-retries: <err>`), `candidates` (array for
   the ambiguous case), and `cwd` (the resolved cwd). The writer
   does NOT write a marker file. Exits 0 (semantically a no-op).
2. **Reader:** surfaces the existing empty-state CTA (the same
   "No signal — install hook" path used when no marker file
   exists on the happy path).

No workspace-level orphan marker is ever created. The fail-closed
posture is what prevents "correct-looking data attached to the wrong
work" — the operator sees the empty state and can investigate via
the writer log (`Dabbler: Open Orchestrator Writer Log` command).

---

## `.gitignore` self-protection

On first write, the writer drops a `.gitignore` containing
`*\n!.gitignore\n` into the per-set `.dabbler/` directory. The
`.gitignore` itself IS tracked (so a fresh clone of the workspace
inherits the same protection); everything else in the directory is
ignored. The workspace's root `.gitignore` does NOT need to be
patched for the marker file to stay untracked. This canonical repo's
`.gitignore` also lists `docs/session-sets/*/.dabbler/` as
belt-and-suspenders.

---

## Multi-writer precedence (unchanged from v2)

Per the Set 029 audit §"Multi-writer precedence", the precedence
order is `current` > `manual` > `last-observed` > `configured-default`.
Writers read the existing marker, compare `signalKind` precedence,
re-read immediately before atomic rename to close the TOCTOU race,
and skip the write if the proposed signal is weaker. Skipped writes
are logged. Under v3 the contention surface is much smaller than v2
because each set has at most one Claude session in flight at a time;
the global-marker cross-window race is eliminated by the identity
model change, not by this mitigation.

---

## Windows atomic-write retry loop (unchanged from v2)

Atomic write-and-rename on Windows 11 intermittently throws
`PermissionError` when the VS Code file watcher is active on the
target. All writers implement a retry loop: **5 attempts = initial +
4 retries, 50/200/600/1200ms backoff between attempts, ~2050ms
total ceiling.** Shared helper in
`scripts/write-orchestrator-marker.js`.

---

## Migration from v2

There is no automatic migration. The v0.14.2 preview never shipped to
Marketplace, so no external consumer is affected. Operators who
installed the v0.14.2 Claude Code hook re-run `Dabbler: Install
Orchestrator Hook (Claude Code)` after upgrading to v0.15.0 to pick
up the new walk-up resolver. The installer is idempotent; the
helper-script path is unchanged. The legacy
`~/.dabbler/current-orchestrator.json` file is silently ignored — it
can be deleted at the operator's leisure.


---

## File 6: CHANGELOG.md ([0.15.0] section + unreleased)

# Changelog

All notable changes to Dabbler AI Orchestration are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

## [0.15.0] — 2026-05-18 (Set 029 Session 3 — per-session-set identity)

### Changed — orchestrator-marker identity model (BREAKING within the v0.14.2 preview)

- **Marker schema bumped to v3.** New top-level `sessionSetSlug` field
  carries the slug of the session set the marker belongs to. The
  reader validates `sessionSetSlug` against the resolved set before
  rendering; a mismatch falls back to the empty-state CTA (treats the
  marker as orphaned).
- **Per-session-set marker path.** Markers now live at
  `<workspace>/docs/session-sets/<slug>/.dabbler/orchestrator.json`
  instead of the legacy global `~/.dabbler/current-orchestrator.json`.
  Three parallel VS Code windows on three different consumer repos
  now render their own correct orchestrator state — the cross-window
  contamination bug from the v0.14.2 preview is eliminated.
- **Walk-up resolver in `scripts/write-orchestrator-marker.js`.** The
  writer walks up from `cwd` looking for `docs/session-sets/`, then
  scans subdirectories for the single set whose `session-state.json`
  reports `status: "in-progress"`. The reader runs the same algorithm
  rooted at the workspace folder.
- **Fail-closed posture.** When zero or more than one in-progress
  sets are resolvable (or no `docs/session-sets/` directory is reachable
  from `cwd`), the writer SKIPS the write and appends a diagnostic
  line to `~/.dabbler/orchestrator-writer.log` (which stays global so
  one log captures every writer attempt across every session set).
  No workspace-level orphan marker is created. The renderer surfaces
  its existing empty-state CTA on the same conditions.
- **Watcher re-binding on set transitions.** The indicator now watches
  every workspace `docs/session-sets/*/session-state.json` file in
  addition to the resolved per-set marker, so close-out flips and
  start_session events trigger an immediate re-resolution + re-render.
- **`.gitignore` self-protection.** On first write, the writer drops
  a `.gitignore` containing `*\n!.gitignore\n` into the per-set
  `.dabbler/` directory. The workspace's root `.gitignore` does not
  need to be patched for the marker file to stay untracked —
  consumer repos inherit the protection automatically. This canonical
  repo's `.gitignore` also lists `docs/session-sets/*/.dabbler/` as
  belt-and-suspenders.
- **`SessionSetsModel` data-layer extraction.** Pulled `progressText`,
  `isCurrentSessionInFlight`, `iconUriFor`, `needsMigrationBadge`,
  `forceClosedBadge`, `bucketSets`, `sortBucket`, and friends out of
  `SessionSetsProvider.ts` into `src/providers/SessionSetsModel.ts`.
  The provider is now a thin VS Code adapter; the model is the
  canonical home and is what the Set 029 S4 custom webview tree will
  consume. Existing callers continue to import from
  `SessionSetsProvider` via re-exports — no breakage.

### Removed

- **Legacy global marker path.** `~/.dabbler/current-orchestrator.json`
  is no longer read or written. Operators who installed the v0.14.2
  Claude Code hook must re-run `Dabbler: Install Orchestrator Hook
  (Claude Code)` to pick up the new walk-up resolver in the helper
  script (the installer is idempotent; helper-script path unchanged).
  Acceptable because v0.14.2 never shipped to Marketplace — no
  external consumer is affected.

### Known limitations

- **Wrong-set attachment (R8).** A stale `session-state.json` that
  lingers as `in-progress` after a forgotten close-out causes the
  walk-up resolver to attach the marker to the wrong work. Mitigation
  in this release: the indicator's hover tooltip surfaces the
  resolved set slug so the operator can spot the mismatch. Set 029 S4
  may add a small "attached to: \<slug\>" badge in the gauge frame.
- **`.gitignore` auto-patch (R9).** Workspaces that haven't been
  re-initialized still have their root `.gitignore` un-patched. The
  per-set `.dabbler/.gitignore` self-protection covers this case —
  the marker file stays untracked even without the root patch.

### Documentation

- **`docs/orchestrator-marker-schema.md`** — new file documenting the
  v3 marker shape, the per-set path, the walk-up resolver algorithm,
  the fail-closed posture, and the migration from the legacy v2
  global marker.

### Set 029 mid-set pivot (2026-05-18, S3 spec basis)

Cross-provider audit reshaped Set 029 from 4 → 6 sessions. Audit +
decisions:
[`docs/proposals/2026-05-18-custom-tree-pivot/`](../../docs/proposals/2026-05-18-custom-tree-pivot/)
(proposal.md, GPT-5.4 + Gemini Pro consensus, synthesis.md,
s3-spec-delta.md). The custom-tree pivot (replacing the native
`dabblerSessionSets` TreeView with a webview-rendered accordion that
embeds the gauges into each in-progress set's row) is S4 with its own
pre-session audit. Non-Claude provider detection is S5; README +
Marketplace publish is S6.


