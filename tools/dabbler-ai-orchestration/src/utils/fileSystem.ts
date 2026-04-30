import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { listGitWorktrees } from "./git";
import {
  SessionSet,
  SessionState,
  SessionSetConfig,
  UatSummary,
  LiveSession,
} from "../types";

export const SESSION_SETS_REL = path.join("docs", "session-sets");
export const PLAYWRIGHT_REL_DEFAULT = "tests";

const STATE_RANK: Record<SessionState, number> = {
  done: 2,
  "in-progress": 1,
  "not-started": 0,
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

export function parseSessionSetConfig(specPath: string): SessionSetConfig {
  // outsourceMode defaults to "first" — matches the AI router's documented
  // backward-compat default when the spec omits the field.
  const config: SessionSetConfig = {
    requiresUAT: false,
    requiresE2E: false,
    uatScope: "none",
    outsourceMode: "first",
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
  const block = headingMatch ? headingMatch[1] : text.slice(0, 4000);
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

    let state: SessionState;
    if (fs.existsSync(changeLogPath)) state = "done";
    else if (fs.existsSync(activityPath) || fs.existsSync(statePath)) state = "in-progress";
    else state = "not-started";

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
          completedAt?: string;
          startedAt?: string;
          currentSession?: number;
          status?: string;
          orchestrator?: { engine?: string; model?: string; effort?: string };
          verificationVerdict?: string;
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
        };
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
