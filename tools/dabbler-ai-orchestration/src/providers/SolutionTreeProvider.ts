// The native TreeDataProvider for the Solution Explorer.
//
// Deliberately thin, matching WorkExplorerTreeProvider: everything deciding
// WHAT a row says lives in solutionTreeModel.ts, which imports no vscode and is
// driveable from the unit suite. This class converts descriptors into TreeItems
// and owns the platform lifecycle.
//
// It reads a projection written by `python -m ai_router.workflow`; it never
// folds the event log itself.

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import {
  Projection,
  SolutionNode,
  childrenOf,
  contractTarget,
  descriptorFor,
  rootNodes,
} from "./solutionTreeModel";

const PROJECTION_RELPATH = path.join(".dabbler", "solution", "projection.json");

const TONE: Record<string, string> = {
  attention: "charts.yellow",
  done: "charts.green",
  muted: "disabledForeground",
};

export class SolutionTreeProvider
  implements vscode.TreeDataProvider<SolutionNode>, vscode.Disposable
{
  public static readonly viewType = "dabblerSolutionTree";

  private readonly onDidChangeEmitter =
    new vscode.EventEmitter<SolutionNode | undefined>();
  public readonly onDidChangeTreeData = this.onDidChangeEmitter.event;

  private readonly watchers: vscode.FileSystemWatcher[] = [];
  private cached: Projection | undefined;

  constructor(private readonly workspaceRoot: string | undefined) {
    if (!workspaceRoot) return;
    const pattern = new vscode.RelativePattern(
      workspaceRoot,
      ".dabbler/solution/projection.json",
    );
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    watcher.onDidChange(() => this.refresh());
    watcher.onDidCreate(() => this.refresh());
    watcher.onDidDelete(() => this.refresh());
    this.watchers.push(watcher);
  }

  public refresh(): void {
    this.cached = undefined;
    this.onDidChangeEmitter.fire(undefined);
  }

  public dispose(): void {
    this.watchers.forEach((w) => w.dispose());
    this.onDidChangeEmitter.dispose();
  }

  /** Read lazily; a missing or unreadable projection is an empty tree. */
  private projection(): Projection | undefined {
    if (this.cached) return this.cached;
    if (!this.workspaceRoot) return undefined;
    const file = path.join(this.workspaceRoot, PROJECTION_RELPATH);
    try {
      this.cached = JSON.parse(fs.readFileSync(file, "utf8")) as Projection;
    } catch {
      // No solution here yet, or it is mid-write. Either way the tree is
      // simply empty rather than an error the reader cannot act on.
      return undefined;
    }
    return this.cached;
  }

  public getChildren(element?: SolutionNode): SolutionNode[] {
    const p = this.projection();
    if (!p) return [];
    return element ? childrenOf(element, p) : rootNodes();
  }

  public getTreeItem(element: SolutionNode): vscode.TreeItem {
    const p = this.projection();
    if (!p) return new vscode.TreeItem("");
    const d = descriptorFor(element, p);

    const item = new vscode.TreeItem(
      d.label,
      d.expandable
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );
    item.id = d.id;
    item.description = d.description;
    item.tooltip = d.tooltip;
    item.contextValue = d.contextValue;
    if (d.icon) {
      item.iconPath = new vscode.ThemeIcon(
        d.icon.id,
        d.icon.tone ? new vscode.ThemeColor(TONE[d.icon.tone]) : undefined,
      );
    }
    if (element.kind === "contract" && d.contextValue === "dabblerContract") {
      const target = contractTarget(
        p.components.find((c) => c.name === element.name),
      );
      if (target && this.workspaceRoot) {
        item.command = {
          command: "vscode.open",
          title: "Open contract",
          // An editor tab, not a popup: this is the one row that serves the
          // component's consumers, and they read it beside their own code.
          arguments: [
            vscode.Uri.file(path.join(this.workspaceRoot, target)),
          ],
        };
      }
    }
    return item;
  }
}
