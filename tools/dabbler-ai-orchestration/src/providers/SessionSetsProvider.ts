import * as vscode from "vscode";
import * as path from "path";
import { readAllSessionSets, discoverRoots } from "../utils/fileSystem";
import { SessionSet, SessionState } from "../types";

const ICON_FILES: Record<SessionState, string> = {
  done: "done.svg",
  "in-progress": "in-progress.svg",
  "not-started": "not-started.svg",
};

function iconUriFor(
  extensionUri: vscode.Uri,
  state: SessionState
): vscode.Uri | undefined {
  const file = ICON_FILES[state];
  return file ? vscode.Uri.joinPath(extensionUri, "media", file) : undefined;
}

function progressText(set: SessionSet): string {
  if (set.state === "done") {
    return set.sessionsCompleted > 0
      ? `${set.sessionsCompleted}/${set.sessionsCompleted}`
      : "";
  }
  if (set.totalSessions && set.totalSessions > 0) {
    return `${set.sessionsCompleted}/${set.totalSessions}`;
  }
  return set.sessionsCompleted > 0 ? `${set.sessionsCompleted} done` : "";
}

function touchedDate(set: SessionSet): string {
  if (!set.lastTouched) return "";
  return new Date(set.lastTouched).toLocaleDateString("en-CA");
}

function uatBadge(set: SessionSet): string {
  if (!set.config?.requiresUAT || !set.uatSummary) return "";
  if (set.uatSummary.pendingItems > 0) return `[UAT ${set.uatSummary.pendingItems}]`;
  if (set.uatSummary.totalItems > 0) return "[UAT done]";
  return "";
}

// Outsource-first vs. outsource-last is a routing choice that lives in
// each spec.md's `Session Set Configuration` block. The badge surfaces it
// on the session-set tree row so the operator can tell at a glance which
// path a set's verifications take without opening the spec.
export function modeBadge(set: SessionSet): string {
  const mode = set.config?.outsourceMode;
  if (mode === "last") return "[LAST]";
  if (mode === "first") return "[FIRST]";
  return "";
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
  return lines;
}

function configTooltipLines(set: SessionSet): string[] {
  if (!set.config) return [];
  const flags: string[] = [];
  if (set.config.requiresUAT) flags.push("UAT");
  if (set.config.requiresE2E) flags.push("E2E");
  const lines: string[] = [];
  lines.push(`Gates: ${flags.length ? flags.join(" + ") : "none"}`);
  if (set.config.outsourceMode) {
    lines.push(`Mode: outsource-${set.config.outsourceMode}`);
  }
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

function folderTooltip(set: SessionSet): string {
  const roots = discoverRoots();
  const rel = path.relative(set.root, set.dir);
  return roots.length > 1 ? `${path.basename(set.root)} / ${rel}` : rel;
}

function contextValueFor(set: SessionSet): string {
  const parts = [`sessionSet:${set.state}`];
  if (set.config?.requiresUAT) parts.push("uat");
  if (set.config?.requiresE2E) parts.push("e2e");
  return parts.join(":");
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

  constructor(private readonly extensionUri: vscode.Uri) {}

  refresh(): void {
    this._cache = null;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
    if (!vscode.workspace.workspaceFolders?.length) return [];

    if (!this._cache) {
      this._cache = readAllSessionSets();
    }
    const all = this._cache;

    if (!element) {
      const inProgress = all.filter((s) => s.state === "in-progress");
      const notStarted = all.filter((s) => s.state === "not-started");
      const done = all.filter((s) => s.state === "done");
      return [
        this.makeGroup("In Progress", "in-progress", inProgress.length),
        this.makeGroup("Not Started", "not-started", notStarted.length),
        this.makeGroup("Done", "done", done.length),
      ];
    }

    const group = element as GroupItem;
    if (group.contextValue === "group") {
      const subset = all.filter((s) => s.state === group.groupKey);
      if (group.groupKey === "in-progress" || group.groupKey === "done") {
        subset.sort((a, b) =>
          (b.lastTouched || "").localeCompare(a.lastTouched || "")
        );
      } else {
        subset.sort((a, b) => a.name.localeCompare(b.name));
      }
      return subset.map((s) => this.makeSetItem(s));
    }

    return [];
  }

  private makeGroup(label: string, groupKey: SessionState, count: number): GroupItem {
    const item = new vscode.TreeItem(
      `${label}  (${count})`,
      count > 0
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.Collapsed
    ) as GroupItem;
    item.iconPath = iconUriFor(this.extensionUri, groupKey);
    item.contextValue = "group";
    item.groupKey = groupKey;
    return item;
  }

  private makeSetItem(set: SessionSet): SetItem {
    const item = new vscode.TreeItem(
      set.name,
      vscode.TreeItemCollapsibleState.None
    ) as SetItem;
    const bits = [progressText(set), touchedDate(set), modeBadge(set), uatBadge(set)].filter(Boolean);
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
        .join("\n\n")
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
