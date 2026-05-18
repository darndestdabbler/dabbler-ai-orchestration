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
// Writes ~/.dabbler/current-orchestrator.json atomically with multi-writer
// precedence and a Windows-file-watcher-aware retry loop.
//
// Per Set 029 audit (audit-summary.md §"Marker file schema" + §"Multi-writer
// precedence" + §"Visual treatment by signalKind"). Locked design — do not
// re-litigate.

const fs = require("fs");
const os = require("os");
const path = require("path");

// Schema + behavior constants (locked by Set 029 Session 1 audit).
const SCHEMA_VERSION = 2;
const DEFAULT_STALENESS_MAX_SEC = 28800; // 8h
const PRECEDENCE = ["current", "manual", "last-observed", "configured-default"];
const RETRY_BACKOFFS_MS = [50, 200, 600, 1200]; // 4 retries after the initial attempt → 5 total

const DABBLER_DIR = path.join(os.homedir(), ".dabbler");
const MARKER_PATH = path.join(DABBLER_DIR, "current-orchestrator.json");
const WRITER_LOG_PATH = path.join(DABBLER_DIR, "orchestrator-writer.log");

function ensureDir() {
  fs.mkdirSync(DABBLER_DIR, { recursive: true });
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
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--mode") {
      out.mode = argv[++i];
    } else if (a === "--writer") {
      out.writer = argv[++i];
    } else if (a === "--force-override") {
      out.forceOverride = true;
    }
  }
  return out;
}

function precedenceIndex(signalKind) {
  const idx = PRECEDENCE.indexOf(signalKind);
  return idx === -1 ? PRECEDENCE.length : idx; // unknown sorts last (weakest)
}

function readExistingMarker() {
  try {
    const raw = fs.readFileSync(MARKER_PATH, "utf8");
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

function appendWriterLog(entry) {
  try {
    fs.appendFileSync(
      WRITER_LOG_PATH,
      JSON.stringify(entry) + "\n",
      { encoding: "utf8" },
    );
  } catch {
    // Logging is best-effort; never block a write on log-append failure.
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
    // Operator feedback 2026-05-18 round 3 (item 7): no provider
    // prefix in the modelDisplayName when the model is unknown — the
    // renderer puts the provider on its own line and "(model unknown)"
    // as a suffix line below, which avoids the "Claude Claude" duplicate
    // the prior prefix produced. The provider name is already carried
    // separately in providerDisplayName, so this field can be pure
    // suffix text.
    return "(model unknown)";
  }
  // Best-effort canonicalization. Marker writers can override by sending
  // `modelDisplayName` explicitly in the payload (the manual-override
  // quickpick does so).
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

// Build the marker object from a payload. Per Set 029 audit Marker schema v2.
function buildMarker(args, payload, nowIso) {
  const writer = args.writer || payload.writer || "unknown";

  // Mode → top-level signalKind / confidence defaults.
  let signalKind = payload.signalKind;
  let confidence = payload.confidence;

  if (args.mode === "session-start") {
    signalKind = signalKind || "current";
    confidence = confidence || "high";
  } else if (args.mode === "user-prompt-submit") {
    // merge-effort mode handled below; not a fresh top-level write.
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

  // Effort sub-object.
  const effortIn = payload.effort || {};
  let effort;
  if (args.mode === "session-start") {
    // SessionStart always resets effort to Medium / current (per Set 029
    // pre-implementation verification — /clear fires SessionStart AND
    // /clear represents a fresh-session boundary).
    effort = {
      normalized: "medium",
      native: "default",
      thinking: false,
      signalKind: "current",
      confidence: confidence, // mirror model confidence (low if model unknown)
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
// without clobbering the model signal.
function mergeEffort(existing, payload, writer, nowIso) {
  const eIn = payload.effort || {};
  const merged = {
    ...existing,
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

// Sleep helper for the retry loop.
function sleepSync(ms) {
  // Node's child_process.execSync is overkill; a busy-wait with hint at
  // the event loop via Atomics.wait on a SharedArrayBuffer is the
  // standard sync-sleep pattern. We don't need cross-realm safety here
  // because the script is short-lived; setTimeout would push us into
  // async land and complicate the retry loop.
  const buf = new SharedArrayBuffer(4);
  const view = new Int32Array(buf);
  Atomics.wait(view, 0, 0, ms);
}

// Atomic write: write to <target>.tmp.<pid>.<rand>, then rename onto target.
// On Windows, rename can throw EPERM/EBUSY when a file watcher has the
// target open; the retry loop wraps this.
function atomicWrite(target, jsonText) {
  const tmp = `${target}.tmp.${process.pid}.${Math.floor(Math.random() * 1e9)}`;
  fs.writeFileSync(tmp, jsonText, { encoding: "utf8" });
  try {
    fs.renameSync(tmp, target);
  } catch (err) {
    // Clean up tmp on failure so we don't leak junk under ~/.dabbler.
    try { fs.unlinkSync(tmp); } catch { /* best effort */ }
    throw err;
  }
}

// Per Set 029 audit §"Multi-writer precedence":
//   1. Read existing marker. Missing → write unconditionally.
//   2. If existing is stale → write unconditionally.
//   3. Re-read immediately before atomic write+rename. If proposed
//      signalKind precedence ≥ existing precedence → proceed.
//   4. Skip otherwise; log to orchestrator-writer.log.
//
// The two-read pattern (initial + re-read-before-rename) closes the
// TOCTOU race: another writer that lands between the initial decision
// and our rename will be caught by the re-read and we'll skip rather
// than clobber a now-stronger marker.
function attemptWriteWithPrecedence(proposed, args, nowMs) {
  ensureDir();

  // Read 1: initial decision pass.
  const initial = readExistingMarker();
  if (initial && !args.forceOverride && !isStale(initial, nowMs)) {
    const proposedRank = precedenceIndex(proposed.signalKind);
    const initialRank = precedenceIndex(initial.signalKind);
    if (proposedRank > initialRank) {
      appendWriterLog({
        timestamp: new Date(nowMs).toISOString(),
        writer: proposed.writer,
        proposed: proposed.signalKind,
        existing: initial.signalKind,
        reason: "weaker-than-existing",
      });
      return { written: false, reason: "weaker-than-existing" };
    }
  }

  // Write tmp file BEFORE the re-read so the rename is as close to the
  // re-read as possible — minimizes the residual race window.
  const jsonText = JSON.stringify(proposed, null, 2) + "\n";
  const tmp = `${MARKER_PATH}.tmp.${process.pid}.${Math.floor(Math.random() * 1e9)}`;
  fs.writeFileSync(tmp, jsonText, { encoding: "utf8" });

  try {
    // Read 2: re-read immediately before rename to catch a writer that
    // raced between Read 1 and now. Audit §"Multi-writer precedence"
    // step 3.
    if (!args.forceOverride) {
      const latest = readExistingMarker();
      if (latest && !isStale(latest, Date.now())) {
        const proposedRank = precedenceIndex(proposed.signalKind);
        const latestRank = precedenceIndex(latest.signalKind);
        if (proposedRank > latestRank) {
          // Concurrent writer landed a stronger marker after Read 1.
          // Skip our write; clean up the tmp file.
          try { fs.unlinkSync(tmp); } catch { /* best effort */ }
          appendWriterLog({
            timestamp: new Date().toISOString(),
            writer: proposed.writer,
            proposed: proposed.signalKind,
            existing: latest.signalKind,
            reason: "weaker-than-existing-on-reread",
          });
          return { written: false, reason: "weaker-than-existing-on-reread" };
        }
      }
    }

    fs.renameSync(tmp, MARKER_PATH);
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
      // Defensive parse — per R2 the hook payload format may drift.
      // Emit a confidence-low marker on session-start, abort on others.
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

  // Per-mode payload normalization. SessionStart's payload comes straight
  // from the Claude Code hook (session_id, transcript_path, cwd,
  // permission_mode, hook_event_name, source, model, optional agent_type).
  // UserPromptSubmit's payload adds `prompt` (the message text).
  if (args.mode === "session-start") {
    // Provider is fixed to anthropic for the Claude SessionStart hook.
    payload.provider = payload.provider || "anthropic";
    // payload.model comes through from the hook; trip the confidence-low
    // path inside buildMarker if absent.
    if (!args.writer) args.writer = "claude-code-session-start-hook";
  } else if (args.mode === "user-prompt-submit") {
    if (!args.writer) args.writer = "claude-code-user-prompt-submit-hook";
    // Extract /think* prefix from prompt; build the effort sub-object.
    const promptText = typeof payload.prompt === "string" ? payload.prompt : "";
    const trimmed = promptText.trimStart();
    let native = null;
    let normalized = null;
    if (/^\/ultrathink\b/i.test(trimmed)) { native = "/ultrathink"; normalized = "max"; }
    else if (/^\/megathink\b/i.test(trimmed)) { native = "/megathink"; normalized = "extra-high"; }
    else if (/^\/think\b/i.test(trimmed)) { native = "/think"; normalized = "high"; }
    if (!native) {
      // Not a /think* invocation — nothing to do. Exit cleanly so the
      // hook chain doesn't see a non-zero exit and complain.
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

  try {
    runWithRetries(() => {
      if (args.mode === "user-prompt-submit") {
        // Merge-effort path: preserve top-level, update effort only.
        // Per Round A/C verifier findings, the read MUST happen as
        // close to the rename as possible — the tmp file is written
        // AFTER the read so a concurrent writer landing between any
        // earlier-in-the-script work and the rename can't clobber a
        // fresher snapshot.
        const tmp = `${MARKER_PATH}.tmp.${process.pid}.${Math.floor(Math.random() * 1e9)}`;
        try {
          // Read immediately before write+rename. Build chosen from
          // this snapshot. If a concurrent writer lands AFTER this
          // read but BEFORE our rename, the writer's marker is the
          // one we'll clobber — but the residual window is just
          // writeFileSync + renameSync, which is microseconds in
          // practice and equivalent to the residual window in
          // attemptWriteWithPrecedence.
          const latest = readExistingMarker();
          let chosen;
          if (latest) {
            chosen = mergeEffort(latest, payload, args.writer, nowIso);
          } else {
            // Bootstrap: no marker exists. Create a Medium-default
            // Claude marker with the just-detected /think* effort.
            const bootstrap = buildMarker(
              { ...args, mode: "session-start" },
              { provider: "anthropic", model: "unknown", writer: args.writer },
              nowIso,
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
          fs.renameSync(tmp, MARKER_PATH);
        } catch (err) {
          try { fs.unlinkSync(tmp); } catch { /* best effort */ }
          throw err;
        }
        return { written: true };
      }
      const marker = buildMarker(args, payload, nowIso);
      return attemptWriteWithPrecedence(marker, args, nowMs);
    });
  } catch (err) {
    process.stderr.write(
      `write-orchestrator-marker.js: write failed after retries (${err.message})\n`,
    );
    appendWriterLog({
      timestamp: nowIso,
      writer: args.writer || "unknown",
      proposed: payload.signalKind || args.mode,
      existing: null,
      reason: `write-failed-after-retries: ${err.message}`,
    });
    process.exit(4);
  }
  process.exit(0);
}

main();
