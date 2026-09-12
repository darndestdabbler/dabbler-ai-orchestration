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
import {
  reprojectSolution,
  solutionConfiguration,
  userConfigurationDirs,
} from "../router/host";
import { chosenEngineIn } from "../commands/configurationCommands";

const PROJECTION_RELPATH = path.join(".dabbler", "solution", "solution.json");

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

/**
 * How long one configuration reading is reused.
 *
 * Its inputs -- the model catalog and this operator's preferences -- sit at
 * the USER level, outside every repository. They ARE watched, over an
 * absolute base, and that watcher is what causes a repaint; this window is
 * the second half, so a reading is current whenever a row asks for it even
 * where the event was missed. Re-reading is a few file reads with no network
 * and no process.
 *
 * Not zero: one repaint asks for many rows, and they must all describe the
 * same machine. Short enough that the next repaint after a command is a
 * fresh reading.
 */
export const CONFIGURATION_TTL_MS = 1_000;

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

  /** The last configuration reading and when it was taken; see CONFIGURATION_TTL_MS. */
  private configuration: { value: Projection["configuration"]; at: number } | undefined;

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
    // **And the user-level files a configuration is derived from.**
    //
    // The model catalog and this operator's preferences sit outside every
    // repository, so no workspace-relative glob reaches them -- which is
    // why a pane that watched only this workspace showed a configuration
    // nothing could ever invalidate: a `dabbler configure` or a catalog
    // refresh typed in a terminal reached it only when something unrelated
    // fired. A `RelativePattern` over an ABSOLUTE base does reach them, so
    // the answer is to watch them rather than to declare them unwatchable.
    //
    // `refresh` and not `rederive`: nothing about the module graph changed,
    // and the configuration is joined on at read.
    this.watchUserConfiguration();
    // Derive once at activation, WHATEVER is on disk.
    //
    // Not one of the six paths above is a configuration input: the model
    // catalog and this operator's preferences live at the user level, and
    // are watched separately, over an absolute base. Deriving
    // only over a MISSING file left a projection that exists and is wrong
    // standing until a manifest happened to move -- which is how the pane
    // spent a session rendering a file eight minutes old against a router
    // that had shipped both, and came right only when an operator typed a
    // configure command by hand. It is a disk read the router already does,
    // and it is what makes an extension upgrade show its own work.
    this.rederive();
  }

  private watch(glob: string, onEvent: () => void): void {
    if (!this.workspaceRoot) return;
    this.watchAt(this.workspaceRoot, glob, onEvent);
  }

  /**
   * A watcher over any base, which is what a user-level file needs.
   *
   * Wrapped in a try: a host that cannot build a watcher outside the
   * workspace must leave the tree working rather than fail activation, and
   * the pane then behaves exactly as it did before -- stale until something
   * else fires, which is a worse pane and not a broken one.
   */
  private watchAt(base: string, glob: string, onEvent: () => void): void {
    try {
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(vscode.Uri.file(base), glob),
      );
      watcher.onDidChange(onEvent);
      watcher.onDidCreate(onEvent);
      watcher.onDidDelete(onEvent);
      this.watchers.push(watcher);
    } catch {
      // Nothing to recover: the view still renders, and every other watcher
      // it has is unaffected.
    }
  }

  private watchUserConfiguration(): void {
    for (const dir of userConfigurationDirs()) {
      this.watchAt(dir, "*.json", () => this.refresh());
    }
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
    // A refresh is a caller saying something moved. The configuration's own
    // inputs are unwatchable, so this is the one moment it can be told.
    this.configuration = undefined;
    this.onDidChangeEmitter.fire(undefined);
  }

  public dispose(): void {
    // A pending derivation outliving the window would write a projection
    // for a workspace nothing is showing any more.
    if (this.settling) clearTimeout(this.settling);
    this.watchers.forEach((w) => w.dispose());
    this.onDidChangeEmitter.dispose();
  }

  /**
   * Read lazily; a missing or unreadable projection is an empty tree.
   *
   * **Two caches, because only one of them can be invalidated.** The module
   * graph comes off the disk and is invalidated by watchers over files in
   * this workspace. The configuration cannot be: its inputs -- the model
   * catalog, this operator's preferences -- live at the USER level, outside
   * every `RelativePattern` this window could build, so nothing here can
   * ever be told they moved. It is therefore joined on at read, inside a
   * short reuse window, rather than frozen into the document beside the
   * graph -- which made the freshness this split exists for last exactly
   * until the first read.
   */
  private projection(): Projection | undefined {
    if (!this.workspaceRoot) return undefined;
    if (!this.cached) {
      const file = path.join(this.workspaceRoot, PROJECTION_RELPATH);
      try {
        this.cached = JSON.parse(fs.readFileSync(file, "utf8")) as Projection;
      } catch {
        // No solution here yet, or it is mid-write. Either way the tree is
        // simply empty rather than an error the reader cannot act on.
        return undefined;
      }
    }
    return { ...this.cached, configuration: this.currentConfiguration() };
  }

  /**
   * The configuration as it is NOW, within a short reuse window.
   *
   * Held apart from `cached` deliberately. The module graph is invalidated
   * by watchers over files in this workspace; the configuration cannot be,
   * because the catalog and the preferences it derives from are at the user
   * level. Sharing one cache made the freshness this split exists for last
   * exactly until the first read.
   */
  private currentConfiguration(): Projection["configuration"] {
    const now = Date.now();
    if (this.configuration !== undefined && now - this.configuration.at < CONFIGURATION_TTL_MS) {
      return this.configuration.value;
    }
    const value = solutionConfiguration(
      this.workspaceRoot as string,
    ) as Projection["configuration"];
    this.configuration = { value, at: now };
    return value;
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
