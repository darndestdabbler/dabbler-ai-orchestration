#!/usr/bin/env node
// claude-session-start-invoker.js
//
// Set 033 Session 3 (H1: hooks become invokers, not writers).
//
// Successor to the retired `write-orchestrator-marker.js` script for the
// Claude Code SessionStart hook path. The previous script wrote the
// per-session-set `.dabbler/orchestrator.json` marker directly; per the
// audit-locked H1 verdict (proposal-addendum §9), hooks must NOT write
// the orchestrator block — they invoke the canonical writer
// (`python -m ai_router.start_session`) which writes
// `session-state.json` under the H3 hard-coordination rules.
//
// Behavior:
//   1. Read Claude Code's SessionStart hook payload from stdin (JSON).
//      The payload supplies `cwd` (the workspace path Claude is running
//      in) and `session_id` (the per-chat identifier the writer pins
//      to the H4 composite identity as of Set 036). Other fields are
//      ignored. The `session_id` is best-effort: if the field is
//      missing the invoker omits `--chat-session-id` and start_session
//      falls through to its tolerant-on-read branch (Set 036 S1).
//   2. Walk up from `cwd` to locate `docs/session-sets/`. Find the
//      single `status: "in-progress"` subdirectory.
//   3. If zero or multiple in-progress sets: silent no-op, exit 0.
//      (Same fail-closed posture as the retired writer.)
//   4. Read the in-progress set's existing `orchestrator` block. When
//      the existing holder is already `claude + anthropic` (per H4
//      identity), preserve its `model` + `effort` so the
//      same-holder re-attach (S1 writer behavior) bumps only
//      `lastActivityAt` without degrading the model/effort fields.
//   5. Spawn `python -m ai_router.start_session` with the resolved
//      args. The writer enforces H3 hard coordination: if a different
//      engine+provider holds the check-out, it exits 4 (conflict);
//      the shim writes a short note to stderr (visible in Claude Code's
//      hook log) and exits 0 so the hook chain isn't broken.
//
// Exit code is always 0 unless an unrecoverable internal error occurs
// (e.g., spawn fails entirely). This matches the retired writer's
// "best-effort, never block the hook chain" contract.
//
// Set 033 Session 5: when start_session exits with EXIT_CHECKOUT_CONFLICT
// (4 — H3 refusal because a different engine+provider holds the slot),
// the invoker writes a structured conflict record to
// `~/.dabbler/checkout-conflicts/<timestamp>-claude-<slug>.json`. The
// in-extension CheckoutPollService watches that directory and surfaces
// a non-blocking poll/force-override/dismiss prompt. The stderr log
// (existing behavior) remains for hook-log debuggability.
//
// No CLI arguments. The mode is implicit (this script is only attached
// to SessionStart). Future hook variants (e.g., UserPromptSubmit) can
// either ship their own thin shim or pass a `--mode` flag — the
// previous combined-helper pattern was retired with H1.

const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");

const CLAUDE_ENGINE = "claude";
const CLAUDE_PROVIDER = "anthropic";
const EXIT_CHECKOUT_CONFLICT = 4;
const CONFLICT_DIR = path.join(os.homedir(), ".dabbler", "checkout-conflicts");

function readStdinSync() {
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function parsePayload(raw) {
  if (!raw || !raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// Walk up from `startCwd` looking for `docs/session-sets/`. Return the
// resolved in-progress set as { workspaceRoot, slug, setDir }, or
// { reason } on failure. Matches the resolver semantic that the
// retired marker writer used (single in-progress required; fail-closed).
function walkUpResolveSet(startCwd) {
  let current = path.resolve(startCwd);
  while (true) {
    const candidate = path.join(current, "docs", "session-sets");
    let exists = false;
    try {
      exists = fs.statSync(candidate).isDirectory();
    } catch {
      // not present at this level; fall through to parent
    }
    if (exists) {
      let entries;
      try {
        entries = fs.readdirSync(candidate, { withFileTypes: true });
      } catch {
        return { reason: "session-sets-unreadable" };
      }
      const inProgress = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const statePath = path.join(candidate, entry.name, "session-state.json");
        try {
          const raw = fs.readFileSync(statePath, "utf8");
          const state = JSON.parse(raw);
          if (state && state.status === "in-progress") {
            inProgress.push({ slug: entry.name, setDir: path.join(candidate, entry.name), state });
          }
        } catch {
          // skip — unreadable / missing / invalid JSON
        }
      }
      if (inProgress.length === 1) {
        return {
          workspaceRoot: current,
          slug: inProgress[0].slug,
          setDir: inProgress[0].setDir,
          state: inProgress[0].state,
        };
      }
      if (inProgress.length === 0) return { reason: "no-in-progress-set" };
      return { reason: "multiple-in-progress-sets" };
    }
    const parent = path.dirname(current);
    if (parent === current) return { reason: "no-docs-session-sets" };
    current = parent;
  }
}

// Set 036 Session 2 (Round B Medium fix): the H4 composite identity
// now includes chatSessionId, so "same holder" preservation must
// gate on the full triple, not just engine + provider. A new Claude
// chat (different chatSessionId) is no longer the same holder as a
// previously-recorded Claude chat — preserving its model/effort
// would surface a stale-attribution gauge in the explorer.
//
// Tolerant branches (mirroring start_session.py's H3 predicate):
//   - prior state's chatSessionId key absent (pre-Set-036 writer) or
//     value null (Set 036+ writer with no ID at write time) →
//     treated as a match for any caller-supplied chatSessionId,
//     since the writer's first new write will populate the field
//     strictly.
//   - prior state's chatSessionId present and string-equal to the
//     caller's chatSessionId → match.
//   - prior state's chatSessionId present and not equal → mismatch;
//     return null and let start_session record fresh model/effort.
function preserveExistingClaude(state, callerChatSessionId) {
  const o = state && state.orchestrator;
  if (!o) return null;
  if (o.engine !== CLAUDE_ENGINE) return null;
  if (o.provider !== CLAUDE_PROVIDER) return null;
  const priorHasKey = Object.prototype.hasOwnProperty.call(o, "chatSessionId");
  const priorChatSessionId = priorHasKey ? o.chatSessionId : null;
  const chatSessionIdMatches =
    !priorHasKey
    || priorChatSessionId === null
    || priorChatSessionId === callerChatSessionId;
  if (!chatSessionIdMatches) return null;
  return {
    model: typeof o.model === "string" && o.model.length > 0 ? o.model : "unknown",
    effort: typeof o.effort === "string" && o.effort.length > 0 ? o.effort : "unknown",
  };
}

// Set 036 Session 2: pull the per-chat session_id off the SessionStart
// payload and validate it before forwarding. Claude Code's hook payload
// schema names the field `session_id`; the audit (proposal-addendum §Q1)
// confirmed it as the per-chat identity source. The validation is
// deliberately narrow — non-string / empty / whitespace-only values are
// silently dropped and start_session falls through to its tolerant-on-
// read branch rather than the field being written as garbage. A schema
// drift in Claude Code's payload (R2 in the spec) shows up here as a
// missing field and degrades gracefully.
function extractSessionId(payload) {
  if (!payload || typeof payload !== "object") return null;
  const raw = payload.session_id;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  return trimmed;
}

function spawnStartSession(setDir, model, effort, chatSessionId) {
  // No `--force`: the SessionStart hook never overrides an existing
  // different-holder check-out (that's the operator's explicit decision
  // via "Release Check-Out" or `start_session --force` on the CLI).
  // If a conflict arises, start_session exits 4; we surface the stderr
  // to Claude Code's hook log and continue.
  const args = [
    "-m", "ai_router.start_session",
    "--session-set-dir", setDir,
    "--engine", CLAUDE_ENGINE,
    "--provider", CLAUDE_PROVIDER,
    "--model", model,
    "--effort", effort,
  ];
  // Set 036 Session 2: forward the per-chat identifier when the
  // SessionStart payload supplied one. Omitted entirely when null —
  // start_session's `_resolve_chat_session_id` then falls back to the
  // CHAT_SESSION_ID env var or None, matching the manual / fallback
  // flow for non-Claude orchestrators.
  if (typeof chatSessionId === "string" && chatSessionId.length > 0) {
    args.push("--chat-session-id", chatSessionId);
  }
  // Inherit env (PATH must reach a python interpreter with
  // dabbler-ai-router importable). No working-directory override:
  // start_session takes the session-set dir as an absolute arg.
  return cp.spawnSync("python", args, {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });
}

// Emit a structured conflict record so the in-extension
// CheckoutPollService can surface a poll/force-override/dismiss prompt.
// Best-effort: any failure here is swallowed (the stderr log path still
// fires below, so the operator retains the existing visibility).
function emitConflictRecord(resolution, model, effort, chatSessionId) {
  try {
    fs.mkdirSync(CONFLICT_DIR, { recursive: true });
    const state = resolution.state || {};
    const existing = state.orchestrator || {};
    const record = {
      schemaVersion: 1,
      detectedAt: new Date().toISOString(),
      source: "claude-invoker",
      sessionSetPath: resolution.setDir,
      sessionSetSlug: resolution.slug,
      sessionNumber: typeof state.currentSession === "number"
        ? state.currentSession
        : null,
      heldByEngine: typeof existing.engine === "string" ? existing.engine : "",
      heldByProvider: typeof existing.provider === "string" ? existing.provider : "",
      heldByModel: typeof existing.model === "string" ? existing.model : null,
      heldByChatSessionId: typeof existing.chatSessionId === "string"
        ? existing.chatSessionId
        : null,
      checkedOutAt: typeof existing.checkedOutAt === "string"
        ? existing.checkedOutAt
        : null,
      wouldBeHolderEngine: CLAUDE_ENGINE,
      wouldBeHolderProvider: CLAUDE_PROVIDER,
      wouldBeHolderModel: typeof model === "string" ? model : null,
      wouldBeHolderEffort: typeof effort === "string" ? effort : null,
      wouldBeHolderChatSessionId: typeof chatSessionId === "string" && chatSessionId.length > 0
        ? chatSessionId
        : null,
    };
    // Filename: timestamp + source + slug so concurrent writers
    // (multiple Claude windows or one Claude + one Codex) don't
    // collide. ISO timestamp is filesystem-safe after replacing ':'.
    const stamp = record.detectedAt.replace(/:/g, "-");
    const filename = `${stamp}-claude-${resolution.slug}.json`;
    const filePath = path.join(CONFLICT_DIR, filename);
    fs.writeFileSync(filePath, JSON.stringify(record) + "\n", "utf8");
  } catch {
    // Sentinel emission is best-effort; the stderr log carries the
    // same information for the hook-log debugger.
  }
}

function main() {
  const payload = parsePayload(readStdinSync());
  const startCwd = (typeof payload.cwd === "string" && payload.cwd)
    ? payload.cwd
    : process.cwd();

  const resolution = walkUpResolveSet(startCwd);
  if (!resolution.slug) {
    // Fail-closed (no in-progress set, or ambiguous, or no
    // docs/session-sets/ on the walk-up). Silent exit 0 — the hook
    // chain continues; nothing for us to claim.
    process.exit(0);
  }

  // Set 036 Session 2: extract the per-chat session_id off the
  // SessionStart payload. Best-effort — a missing or malformed value
  // becomes null and start_session falls through to its tolerant
  // legacy branch. The extraction runs BEFORE preserveExistingClaude
  // so the latter can fold chatSessionId into the H4 identity check
  // (Round B Medium fix: model/effort preservation must gate on the
  // full triple, not just engine + provider).
  const chatSessionId = extractSessionId(payload);

  // Round B Low fix: surface a stderr signal on payload-schema drift
  // (R2 in the spec). The fallback path still works, but the hook log
  // gets a clear one-line indicator that the per-chat ID was absent
  // so an operator triaging "why is takeover detection imprecise"
  // can correlate against payload changes in Claude Code releases.
  if (chatSessionId === null) {
    process.stderr.write(
      "claude-session-start-invoker: no usable session_id in "
      + "SessionStart payload; falling back to env/None\n",
    );
  }

  const preserved = preserveExistingClaude(resolution.state, chatSessionId);
  // SessionStart has no model signal in its payload; default to the
  // last-recorded model when claude already holds the slot AND the
  // chatSessionId composite matches (preserveExistingClaude enforces
  // the full H4 triple as of Round B), else "unknown" (S1 writer
  // accepts it; H4 identity is what matters).
  const model = preserved ? preserved.model : "unknown";
  const effort = preserved ? preserved.effort : "unknown";

  const result = spawnStartSession(
    resolution.setDir,
    model,
    effort,
    chatSessionId,
  );

  if (result.error) {
    // spawnSync failure (python not on PATH, etc.). Surface to stderr
    // for the hook log, exit 0 so we don't break Claude's hook chain.
    process.stderr.write(
      `claude-session-start-invoker: spawn failed: ${result.error.message}\n`,
    );
    process.exit(0);
  }

  if (result.status !== 0) {
    // EXIT_CHECKOUT_CONFLICT (4) is the H3 refusal — write the
    // structured conflict record (S5) AND log to stderr for the
    // hook-log debugger. Any other non-zero (boundary violations,
    // usage errors) only surfaces to stderr; the writer is the
    // source of truth for state, the hook is best-effort notification.
    //
    // Set 046 mid-Session-2 hotfix: with hard-coordination
    // enforcement opt-in (default off), start_session almost never
    // returns EXIT_CHECKOUT_CONFLICT in practice. Belt-and-suspenders
    // we still only emit a conflict record when enforcement is on,
    // so a future code path that incidentally routes through exit-4
    // doesn't resurrect the operator-blocking toast.
    const enforcementOn = (() => {
      const v = process.env.DABBLER_ENFORCE_CHECKOUT_COORDINATION;
      if (typeof v !== "string") return false;
      return ["1", "true", "yes", "on"].includes(v.trim().toLowerCase());
    })();
    if (result.status === EXIT_CHECKOUT_CONFLICT && enforcementOn) {
      emitConflictRecord(resolution, model, effort, chatSessionId);
    }
    if (result.stderr) {
      process.stderr.write(
        `claude-session-start-invoker: start_session exit ${result.status}:\n${result.stderr}`,
      );
    } else {
      process.stderr.write(
        `claude-session-start-invoker: start_session exit ${result.status}\n`,
      );
    }
    process.exit(0);
  }

  process.exit(0);
}

// Module exports for Layer-2 unit tests. When the file is invoked as
// a script (the SessionStart hook path), `require.main === module` is
// true and main() runs. When the file is `require()`-ed from a test,
// only the helpers are exposed and the main() flow is skipped so the
// test can drive `extractSessionId` against fixture payloads without
// firing the hook side effects.
if (require.main === module) {
  main();
} else {
  module.exports = { extractSessionId, parsePayload, preserveExistingClaude };
}
