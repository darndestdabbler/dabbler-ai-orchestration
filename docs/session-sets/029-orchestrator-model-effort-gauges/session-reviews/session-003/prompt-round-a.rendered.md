# Set 029 Session 3 verification — Round A (writer + schema doc)

## Context

Set 029 ships an Orchestrator indicator webview view. v0.14.2 shipped
the Claude path live with a single global marker at
`~/.dabbler/current-orchestrator.json`. **Session 3** moves identity
to per-session-set markers at
`<workspace>/docs/session-sets/<slug>/.dabbler/orchestrator.json`,
fixing the cross-window contamination bug (three parallel VS Code
windows on three repos clobbered one global marker — memory
`project_consumer_repos`).

Session 3 was spec'd via the 2026-05-18 custom-tree-pivot audit
(GPT-5.4 + Gemini Pro consensus). Three operator decisions locked:
D1 packaging split (S3 identity-only + S4 custom-tree); D2 ambiguity
fail-closed (skip write when multiple in-progress sets); D3 orphan
fail-closed (no workspace-level marker on null resolution).

**Round A scope** (this round): the writer
(`scripts/write-orchestrator-marker.js`) + the marker schema doc
(`docs/orchestrator-marker-schema.md`). **Round B** (separate
script): the reader, SessionSetsModel extraction, and SessionSetsProvider
refactor. Splitting per memory `feedback_split_large_verification_bundles`
to stay under the 700 LOC bundle ceiling that gpt-5-4 timeouts at.

## What you're being asked to verify in Round A

Answer Q1–Q4 in order with **VERIFIED / MUST-FIX / SUGGEST** verdicts
plus 1–3 sentences of reasoning each.

### Q1. Walk-up resolver algorithm

`walkUpResolveSet(startCwd)` walks from cwd upward looking for a
`docs/session-sets/` directory. Inside that directory, it reads each
subdir's `session-state.json` and collects subdirs with
`status: "in-progress"`. Returns `{ workspaceRoot, slug, setDir }` on
exactly one match; returns `{ reason: ... }` otherwise.

Verify:
- Termination condition (`parent === current` after `path.dirname`)
  correctly handles Windows drive roots (`C:\`) and POSIX root (`/`).
- Existence check (`fs.statSync(candidate).isDirectory()`) correctly
  rejects a file named `session-sets` (no false positive on
  non-directory match).
- "Exactly one in-progress" enforces D2: `inProgress.length === 1` is
  the success branch; both 0 and >1 return reasons.
- The walk continues past intermediate directories that LACK
  `docs/session-sets/` (so a deeply-nested cwd still finds the
  workspace root). ✓ — confirm via the `parent = path.dirname(current)`
  loop step.

### Q2. Marker schema v3 + `sessionSetSlug` integrity field

The writer's `buildMarker()` adds `sessionSetSlug: resolution.slug`
at top level; `mergeEffort()` re-stamps the slug too.
`SCHEMA_VERSION = 3`.

Verify:
- Every write path (`session-start`, `manual`, `configured-default`,
  `user-prompt-submit` merge-effort) emits `sessionSetSlug` from the
  current resolution. ✓
- `mergeEffort()` overwrites `existing.sessionSetSlug` with the
  current `resolution.slug` rather than carrying the old one — so a
  marker that survives a cross-set boundary (operator switched
  in-progress sets mid-session) converges on the right slug. ✓
- `mergeEffort()` also bumps `schemaVersion` to `SCHEMA_VERSION`
  (3) so a marker that was somehow at v2 self-heals on the next
  effort merge. ✓
- The marker schema doc's "Field reference" table matches the
  shape `buildMarker()` actually emits.

### Q3. Fail-closed posture

On `walkUpResolveSet` returning a reason, the writer:
1. Appends a JSON entry to `~/.dabbler/orchestrator-writer.log` with
   `timestamp`, `writer`, `sessionSetSlug: null`, `proposed`, `reason`,
   `candidates` (ambiguous case), `cwd`.
2. Exits 0 — the hook chain doesn't see a non-zero return.

Verify against D2/D3:
- D2 ambiguity (`multiple-in-progress-sets`): write skipped, log
  carries `reason` + `candidates`. ✓
- D3 orphan (`no-in-progress-set` OR `no-docs-session-sets`): write
  skipped, log carries `reason`, no workspace-level orphan marker
  ever written. ✓

Confirm there is no code path where the writer could emit an orphan
marker — e.g., a workspace-level `.dabbler/` outside any session set,
or a fallback to the legacy global `~/.dabbler/current-orchestrator.json`
on resolver failure. Intent: **no orphan markers, ever.**

### Q4. `.gitignore` self-protection

The spec step 2 originally said: "Auto-patch existing repos
non-interactively on next workspace init (Gemini Pro must-fix)."
There is no `scripts/init-workflow.py` to auto-patch from — so the
implementation took two routes:

1. **Workspace-root patch (this repo only):** the canonical repo's
   `.gitignore` adds `docs/session-sets/*/.dabbler/`.
2. **Self-protecting `.gitignore` (every repo, automatic):**
   `ensurePerSetMarkerDir(perSetMarkerDir)` drops a `.gitignore`
   containing `*\n!.gitignore\n` into each per-set `.dabbler/` on
   first create. The `.gitignore` file itself IS tracked; everything
   else in the directory is ignored. Consumer repos inherit the
   protection on first marker-write without operator intervention.

Verify:
- The drop is idempotent (existence check before write). ✓
- The content `*\n!.gitignore\n` is the correct git pattern to
  ignore everything in the directory EXCEPT the .gitignore itself.
  (Git's "rule 5" — a negated pattern after a wildcard re-includes
  matched paths.) ✓
- Drop failure is non-fatal (try/catch in
  `ensurePerSetMarkerDir`) — the marker write proceeds even if the
  .gitignore drop fails.
- Does this fully satisfy the Gemini must-fix "auto-patch existing
  repos non-interactively on next workspace init"? The first
  writer fire IS the auto-patch trigger. Or is the missing
  workspace-root patch a hole that needs filling programmatically?

R9 risk: "If a workspace's `.gitignore` is not auto-patched,
per-set markers could be staged for commit by mistake." The
self-protect path eliminates that risk at the per-set directory
level. Is this sufficient mitigation in your assessment, or does
the workspace-root patch need to be added too?

---

## Final verdict (Round A)

Emit one summary line at the end:

`VERDICT: VERIFIED` if Q1–Q4 all pass without must-fix items
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

## File 2: docs/orchestrator-marker-schema.md

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

