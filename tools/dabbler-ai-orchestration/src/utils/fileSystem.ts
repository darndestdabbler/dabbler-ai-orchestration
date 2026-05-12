import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { listGitWorktrees } from "./git";
import { readStatus } from "./sessionState";
import { isCancelled } from "./cancelLifecycle";
import {
  SessionSet,
  SessionState,
  SessionSetConfig,
  UatSummary,
  LiveSession,
} from "../types";

export const SESSION_SETS_REL = path.join("docs", "session-sets");
export const PLAYWRIGHT_REL_DEFAULT = "tests";

// Cancelled sets sort below all other groups in the merge logic — Set 8
// keeps cancelled state as the lowest precedence so a set that exists in
// two roots (one cancelled, one active) prefers the active copy when
// dedup-merging. Within a single root the file-presence rule still wins
// because readSessionSets has already resolved each entry's state.
const STATE_RANK: Record<SessionState, number> = {
  done: 3,
  "in-progress": 2,
  "not-started": 1,
  cancelled: 0,
};

export function discoverRoots(): string[] {
  const seen = new Map<string, string>();
  const order: string[] = [];
  const add = (p: string | undefined) => {
    if (!p) return;
    const canonical = path.resolve(p);
    const key = canonical.toLowerCase();
    if (seen.has(key) || !fs.existsSync(canonical)) return;
    seen.set(key, canonical);
    order.push(canonical);
  };
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    add(folder.uri.fsPath);
  }
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    for (const wt of listGitWorktrees(folder.uri.fsPath)) {
      add(wt);
    }
  }
  return order;
}

// Detect the stale "status=complete with currentSession < totalSessions"
// shape that pre-0.2.1 ai_router (and any manual edit) could leave on
// disk between sessions. Returns true iff the snapshot makes both
// session numbers available and the count says more sessions remain.
// On any read/parse failure, returns false — trust the canonical
// status field rather than second-guessing on garbled input.
export function isMidSetComplete(statePath: string): boolean {
  if (!fs.existsSync(statePath)) return false;
  try {
    const sd = JSON.parse(fs.readFileSync(statePath, "utf8")) as {
      currentSession?: number;
      totalSessions?: number;
    };
    return (
      typeof sd.currentSession === "number" &&
      typeof sd.totalSessions === "number" &&
      sd.currentSession < sd.totalSessions
    );
  } catch {
    return false;
  }
}

export function parseSessionSetConfig(specPath: string): SessionSetConfig {
  const config: SessionSetConfig = {
    requiresUAT: false,
    requiresE2E: false,
    uatScope: "none",
    outsourceMode: null,
  };
  if (!fs.existsSync(specPath)) return config;
  let text: string;
  try {
    text = fs.readFileSync(specPath, "utf8");
  } catch {
    return config;
  }
  const headingMatch = text.match(
    /##\s*Session Set Configuration[\s\S]*?```ya?ml\s*([\s\S]*?)```/i
  );
  // When the canonical `## Session Set Configuration` heading is absent,
  // fall back to scanning the entire spec rather than just the first 4000
  // chars. The line-anchored regexes below (e.g.,
  // `^\s*requiresUAT:\s*(true|false)\s*$`) are specific enough that false
  // positives in prose are very unlikely; a 4000-byte cap was needlessly
  // narrow and missed real declarations in specs that put the config
  // yaml block under a non-canonical heading like `## UAT scope`.
  const block = headingMatch ? headingMatch[1] : text;
  const flagRe = (key: string) =>
    new RegExp(`^\\s*${key}\\s*:\\s*(true|false)\\s*$`, "im");
  const stringRe = (key: string) =>
    new RegExp(`^\\s*${key}\\s*:\\s*([\\w-]+)\\s*$`, "im");

  const uat = block.match(flagRe("requiresUAT"));
  if (uat) config.requiresUAT = uat[1].toLowerCase() === "true";
  const e2e = block.match(flagRe("requiresE2E"));
  if (e2e) config.requiresE2E = e2e[1].toLowerCase() === "true";
  const scope = block.match(stringRe("uatScope"));
  if (scope) config.uatScope = scope[1];
  const mode = block.match(stringRe("outsourceMode"));
  if (mode) {
    const v = mode[1].toLowerCase();
    if (v === "first" || v === "last") config.outsourceMode = v;
  }
  return config;
}

export function parseUatChecklist(checklistPath: string): UatSummary | null {
  if (!fs.existsSync(checklistPath)) return null;
  let data: unknown;
  try {
    data = JSON.parse(fs.readFileSync(checklistPath, "utf8"));
  } catch {
    return null;
  }
  const items: Record<string, unknown>[] = [];
  const collect = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { for (const v of node) collect(v); return; }
    const obj = node as Record<string, unknown>;
    if (obj["Result"] !== undefined || obj["result"] !== undefined) {
      items.push(obj);
    }
    for (const v of Object.values(obj)) collect(v);
  };
  collect(data);

  const e2eRefs = new Set<string>();
  let pending = 0;
  for (const it of items) {
    const r = (it["Result"] ?? it["result"] ?? "") as string;
    if (r === "" || r === null || /^pending$/i.test(String(r))) pending++;
    const ref = it["E2ETestReference"] || it["e2eTestReference"];
    if (ref) e2eRefs.add(String(ref));
  }
  return { totalItems: items.length, pendingItems: pending, e2eRefs: Array.from(e2eRefs) };
}

export function readSessionSets(root: string): SessionSet[] {
  const sessionSetsDir = path.join(root, SESSION_SETS_REL);
  if (!fs.existsSync(sessionSetsDir)) return [];
  const entries = fs.readdirSync(sessionSetsDir, { withFileTypes: true });
  const sets: SessionSet[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith("_")) continue;
    const dir = path.join(sessionSetsDir, entry.name);
    const specPath = path.join(dir, "spec.md");
    if (!fs.existsSync(specPath)) continue;

    const activityPath = path.join(dir, "activity-log.json");
    const changeLogPath = path.join(dir, "change-log.md");
    const statePath = path.join(dir, "session-state.json");
    const aiAssignmentPath = path.join(dir, "ai-assignment.md");
    const uatChecklistPath = path.join(dir, `${entry.name}-uat-checklist.json`);

    // Set 8: CANCELLED.md presence is the canonical (and only) signal
    // for the cancelled tree state. The spec's detection-rules table in
    // `docs/session-sets/008-cancelled-session-set-status/spec.md` makes
    // the file-presence check the first gate so a partially-completed
    // set that has been cancelled mid-stream renders as Cancelled rather
    // than Done. Once a set is restored, its `RESTORED.md` is "purely
    // an audit artifact" (spec § Detection rules) and the set falls
    // back to whichever of done/in-progress/not-started its other
    // files indicate. The cancelLifecycle helpers keep
    // session-state.json's `status` in lockstep with the markdown file,
    // so we do not consult `status === "cancelled"` as a separate
    // signal — operator manual edits resolve via the file-presence
    // path, matching the spec's "filename presence is what matters"
    // rule.
    let state: SessionState;
    if (isCancelled(dir)) {
      state = "cancelled";
    } else {
      const status = readStatus(dir);
      if (status === "complete") {
        // Defensive: a status of "complete" with currentSession <
        // totalSessions is a stale mid-set close-out — written either
        // by ai_router < 0.2.1 (which flipped to complete after every
        // session), a manual edit, or a snapshot a consumer repo
        // hasn't refreshed yet. Treat as in-progress so the set
        // doesn't briefly show Done in the window between sessions.
        state = isMidSetComplete(statePath) ? "in-progress" : "done";
      } else if (status === "in-progress") {
        state = "in-progress";
      } else {
        state = "not-started";
      }
    }

    let totalSessions: number | null = null;
    let sessionsCompleted = 0;
    let lastTouched: string | null = null;
    let liveSession: LiveSession | null = null;

    if (fs.existsSync(activityPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(activityPath, "utf8")) as {
          totalSessions?: number;
          entries?: Array<{ sessionNumber?: number; dateTime?: string }>;
        };
        if (typeof data.totalSessions === "number") totalSessions = data.totalSessions;
        const completedSet = new Set<number>();
        for (const e of data.entries ?? []) {
          if (typeof e.sessionNumber === "number") completedSet.add(e.sessionNumber);
          if (e.dateTime && (!lastTouched || e.dateTime > lastTouched)) lastTouched = e.dateTime;
        }
        sessionsCompleted = completedSet.size;
      } catch { /* ignore */ }
    }

    if (fs.existsSync(statePath)) {
      try {
        const sd = JSON.parse(fs.readFileSync(statePath, "utf8")) as {
          totalSessions?: number;
          completedSessions?: number[];
          completedAt?: string;
          startedAt?: string;
          currentSession?: number;
          status?: string;
          orchestrator?: { engine?: string; model?: string; effort?: string };
          verificationVerdict?: string;
          forceClosed?: boolean;
        };
        if (totalSessions === null && typeof sd.totalSessions === "number") {
          totalSessions = sd.totalSessions;
        }
        const stateTouched = sd.completedAt || sd.startedAt;
        if (stateTouched && (!lastTouched || stateTouched > lastTouched)) lastTouched = stateTouched;
        liveSession = {
          currentSession: sd.currentSession ?? null,
          status: sd.status ?? null,
          orchestrator: sd.orchestrator ?? null,
          startedAt: sd.startedAt ?? null,
          completedAt: sd.completedAt ?? null,
          verificationVerdict: sd.verificationVerdict ?? null,
          forceClosed: sd.forceClosed ?? null,
        };
        // sessionsCompleted priority (highest first):
        //  1. session-state.json `completedSessions` array — authoritative
        //     under schema v2. Hand-maintained on Lightweight tier;
        //     written by ai_router on Full tier.
        //  2. activity-log.json unique sessionNumbers (set above).
        //  3. Derived from status + currentSession when neither exists.
        //     - status="complete" => all sessions done; count = totalSessions.
        //     - status="in-progress" with currentSession>1 => assume the
        //       current session is in progress, so currentSession-1 are
        //       done. This can be off by one when the latest session is
        //       itself complete and the set is still open; only used when
        //       no more precise signal is available.
        if (Array.isArray(sd.completedSessions)) {
          sessionsCompleted = sd.completedSessions.length;
        } else if (sessionsCompleted === 0) {
          if (sd.status === "complete" && typeof totalSessions === "number") {
            sessionsCompleted = totalSessions;
          } else if (typeof sd.currentSession === "number" && sd.currentSession > 1) {
            sessionsCompleted = sd.currentSession - 1;
          }
        }
      } catch { /* ignore */ }
    }

    const config = parseSessionSetConfig(specPath);
    const uatSummary = config.requiresUAT ? parseUatChecklist(uatChecklistPath) : null;

    sets.push({
      name: entry.name,
      dir,
      specPath,
      activityPath,
      changeLogPath,
      statePath,
      aiAssignmentPath,
      uatChecklistPath,
      state,
      totalSessions,
      sessionsCompleted,
      lastTouched,
      liveSession,
      config,
      uatSummary,
      root,
    });
  }
  // Diagnostic: one-line summary in the dev console showing how the
  // extension bucketed each root. Useful for spotting UI/cache bugs vs.
  // state-derivation bugs without needing a breakpoint.
  if (sets.length > 0) {
    const counts = sets.reduce(
      (acc, s) => {
        acc[s.state] = (acc[s.state] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
    console.log(
      `[dabbler-ai-orchestration] readSessionSets(${path.basename(root)}): ` +
        `${sets.length} set(s) — ` +
        `done=${counts.done ?? 0}, ` +
        `in-progress=${counts["in-progress"] ?? 0}, ` +
        `not-started=${counts["not-started"] ?? 0}, ` +
        `cancelled=${counts.cancelled ?? 0}`,
    );
  }
  return sets;
}

export function readAllSessionSets(): SessionSet[] {
  const merged = new Map<string, SessionSet>();
  for (const root of discoverRoots()) {
    for (const set of readSessionSets(root)) {
      const prior = merged.get(set.name);
      if (!prior) { merged.set(set.name, set); continue; }
      const newRank = STATE_RANK[set.state] ?? -1;
      const priorRank = STATE_RANK[prior.state] ?? -1;
      if (newRank > priorRank) {
        merged.set(set.name, set);
      } else if (newRank === priorRank) {
        if ((set.lastTouched || "") > (prior.lastTouched || "")) merged.set(set.name, set);
      }
    }
  }
  return Array.from(merged.values());
}
