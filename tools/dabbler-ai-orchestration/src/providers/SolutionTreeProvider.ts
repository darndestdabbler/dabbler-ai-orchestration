// The native TreeDataProvider for the Solution Explorer.
//
// Deliberately thin, matching WorkExplorerTreeProvider: everything deciding
// WHAT a row says lives in solutionTreeModel.ts, which imports no vscode and is
// driveable from the unit suite. This class converts descriptors into TreeItems
// and owns the platform lifecycle.
//
// It reads a projection written by the router (`projection.ts`, written by
// every command that moves a declaration); it never reads the module
// manifest itself.

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import {
  PROJECTION_RELPATH as PROJECTION_GLOB,
  PROJECTION_SOURCE_GLOBS,
  Projection,
  SolutionNode,
  childrenOf,
  contractTarget,
  descriptorFor,
  rootNodes,
} from "./solutionTreeModel";
import { reprojectSolution } from "../router/host";
import { chosenEngineIn } from "../commands/configurationCommands";

const PROJECTION_RELPATH = path.join(".dabbler", "solution", "projection.json");

/**
 * How long a burst of source events is allowed to settle.
 *
 * A re-derivation folds the event log and reads every member repository's
 * build files, so it is not something to run once per keystroke of an
 * editor's autosave. Short enough that the tree moves while the operator is
 * still looking at it, long enough that a save which touches four files is
 * one derivation.
 */
const SETTLE_MS = 300;

const TONE: Record<string, string> = {
  attention: "charts.yellow",
  done: "charts.green",
  muted: "disabledForeground",
  // The module a session is working in: the milestone blue the Dabbler
  // terminal says a lifecycle milestone in, so the two surfaces agree.
  milestone: "charts.blue",
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

  private settling: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly workspaceRoot: string | undefined) {
    if (!workspaceRoot) return;
    // The document itself: something rewrote it, so read it again.
    this.watch(PROJECTION_GLOB, () => this.refresh());
    // And the declarations it is derived from. A change to one of these
    // makes the projection stale without touching it, which is why the tree
    // spent a whole session showing what was true when the last declaration
    // was recorded: refreshing over a file nothing rewrote re-reads the
    // same bytes.
    for (const glob of PROJECTION_SOURCE_GLOBS) {
      this.watch(glob, () => this.rederive());
    }
    // A fresh clone of a repository that is already set up has every
    // declaration on disk but no projection yet -- nothing has touched a
    // manifest or a build file since the clone, so none of the watchers
    // above will ever fire. Derive once, now, rather than leaving the
    // welcome text standing over a repository the operator can already work
    // in.
    if (!fs.existsSync(path.join(workspaceRoot, PROJECTION_RELPATH))) {
      this.rederive();
    }
  }

  private watch(glob: string, onEvent: () => void): void {
    if (!this.workspaceRoot) return;
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(this.workspaceRoot, glob),
    );
    watcher.onDidChange(onEvent);
    watcher.onDidCreate(onEvent);
    watcher.onDidDelete(onEvent);
    this.watchers.push(watcher);
  }

  /**
   * Ask the router for a current projection, then render it.
   *
   * Debounced, and it refreshes whether or not the derivation changed the
   * file: an identical rewrite fires no watcher event, and a view that
   * refreshed only on one would sit on a cleared cache it never re-read.
   */
  private rederive(): void {
    if (!this.workspaceRoot) return;
    if (this.settling) clearTimeout(this.settling);
    this.settling = setTimeout(() => {
      this.settling = undefined;
      if (this.workspaceRoot) reprojectSolution(this.workspaceRoot);
      this.refresh();
    }, SETTLE_MS);
  }

  public refresh(): void {
    this.cached = undefined;
    this.onDidChangeEmitter.fire(undefined);
  }

  public dispose(): void {
    // A pending derivation outliving the window would write a projection
    // for a workspace nothing is showing any more.
    if (this.settling) clearTimeout(this.settling);
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

  /**
   * The projection a command should resolve a row against.
   *
   * Exposed so the navigation commands read the same document the rows were
   * rendered from. A command reading the file again could get a newer one,
   * and opening a different repository than the row named is worse than the
   * command not existing.
   */
  public currentProjection(): Projection | null {
    return this.projection() ?? null;
  }

  public getChildren(element?: SolutionNode): SolutionNode[] {
    const p = this.projection();
    if (!p) return [];
    return element ? childrenOf(element, p) : rootNodes();
  }

  /** The module the next session's plan names, from the Work Explorer's scan; null when none or not here. */
  private nextSessionModule: string | null = null;

  /** Told by the Work Explorer on every scan; the module row moves only when the answer does. */
  public setNextSessionModule(slug: string | null): void {
    if (slug === this.nextSessionModule) return;
    this.nextSessionModule = slug;
    this.onDidChangeEmitter.fire(undefined);
  }

  public getTreeItem(element: SolutionNode): vscode.TreeItem {
    const p = this.projection();
    if (!p) return new vscode.TreeItem("");
    const d = descriptorFor(element, p, {
      nextSessionModule: this.nextSessionModule,
      // Read at paint time rather than cached: it is a setting, and a
      // setting changed in the settings editor must not need a window
      // reload to reach the row that reports it.
      chosenEngine: chosenEngineIn(this.currentProjection()),
    });

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
    // A row whose whole purpose is one action runs it when it is clicked,
    // and takes the node so the handler knows which row it was.
    if (d.command) {
      item.command = { command: d.command, title: d.label, arguments: [element] };
    }
    if (element.kind === "contract" && d.contextValue === "dabblerContract") {
      const target = contractTarget(
        p.modules.find((m) => m.slug === element.slug),
      );
      // The folder is the router's finding; the notes page inside it is
      // what an editor can open, and only when it is there.
      if (target && this.workspaceRoot) {
        const file = path.join(this.workspaceRoot, target);
        if (fs.existsSync(file)) {
          item.command = {
            command: "vscode.open",
            title: "Open contract",
            // An editor tab, not a popup: this is the one row that serves
            // the module's consumers, and they read it beside their own
            // code.
            arguments: [vscode.Uri.file(file)],
          };
        }
      }
    }
    return item;
  }
}
