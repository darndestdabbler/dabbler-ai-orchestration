// Set 110 Session 2 — the native `TreeDataProvider` for the Work
// Explorer, shipped ALONGSIDE the webview tree so the two can be
// compared before Session 3 switches over and deletes the old one.
//
// This file is deliberately thin. Everything that decides WHAT a row
// says lives in `workExplorerTreeModel.ts`, which imports no `vscode`
// and is therefore driveable from the Layer-2 suite; this class only
// converts those descriptors into real `TreeItem`s and owns the
// platform lifecycle (the change event, the scan cache, `getParent`).
//
// The laziness contract, proven by the Session 1 spike and re-asserted
// by `workExplorerTreeProvider.test.ts`:
//
//   * nothing is computed until the view becomes visible;
//   * each level is computed only when its parent is expanded;
//   * a session set reports `Collapsed`, never `Expanded`, so the
//     fourth level costs nothing on refresh.
//
// The scan itself (`readAllSessionSets`) is memoised per refresh, so
// expanding four modules does not re-scan the disk four times. That
// matters more here than in the webview: the webview scanned once and
// built everything; this provider is called back per expansion.

import * as vscode from "vscode";
import { SessionSet } from "../types";
import { readAllSessionSets } from "../utils/fileSystem";
import { ActionSupports } from "./ActionRegistry";
import { assembleVisibleModules, nodeModuleAssemblyIo } from "./moduleAssembly";
import { VisibleModule } from "./SessionSetsModel";
import {
  IconSpec,
  ModuleNode,
  RowDescriptor,
  WorkExplorerNode,
  childrenOf,
  descriptorFor,
  moduleNodes,
} from "./workExplorerTreeModel";
import { markFirstChildrenServed } from "../utils/startupTiming";

export class WorkExplorerTreeProvider
  implements vscode.TreeDataProvider<WorkExplorerNode>, vscode.Disposable
{
  public static readonly viewType = "dabblerWorkExplorerTree";

  private readonly onDidChangeEmitter =
    new vscode.EventEmitter<WorkExplorerNode | undefined>();
  public readonly onDidChangeTreeData = this.onDidChangeEmitter.event;

  /** Memoised scan for the current refresh generation; cleared by `refresh()`. */
  private scanCache: SessionSet[] | null = null;
  private modulesCache: VisibleModule[] | null = null;
  private supportsCache: ActionSupports | null = null;
  /** Per-root last-known-good module trees, so an invalid manifest does not blank the view. */
  private readonly lastKnownGoodModules = new Map<string, readonly VisibleModule[]>();
  /** Parent links, populated as children are served, so `reveal()` works. */
  private readonly parents = new WeakMap<object, WorkExplorerNode>();

  constructor(private readonly extensionUri: vscode.Uri) {}

  public dispose(): void {
    this.onDidChangeEmitter.dispose();
  }

  /**
   * Invalidate everything and repaint. Fired by the same watcher /
   * poll pipeline that drives the webview, so both surfaces update
   * together while they coexist.
   */
  public refresh(): void {
    this.scanCache = null;
    this.modulesCache = null;
    this.supportsCache = null;
    this.onDidChangeEmitter.fire(undefined);
  }

  public getTreeItem(node: WorkExplorerNode): vscode.TreeItem {
    return this.toTreeItem(descriptorFor(node, this.supports()), node);
  }

  public getChildren(node?: WorkExplorerNode): WorkExplorerNode[] {
    // VS Code does not call this at all until the view is visible —
    // the property the webview never had, since its watcher rebuilt the
    // whole tree regardless of visibility.
    if (!node) {
      const roots = moduleNodes(this.modules());
      markFirstChildrenServed(roots.length);
      return roots;
    }
    const children = childrenOf(node);
    for (const child of children) this.parents.set(child, node);
    return children;
  }

  /**
   * Required for `TreeView.reveal`. Root modules have no parent; every
   * other node's parent was recorded when it was served.
   */
  public getParent(node: WorkExplorerNode): WorkExplorerNode | undefined {
    return this.parents.get(node);
  }

  // ----- internals -----

  private sets(): SessionSet[] {
    if (!this.scanCache) this.scanCache = readAllSessionSets();
    return this.scanCache;
  }

  private modules(): VisibleModule[] {
    if (!this.modulesCache) {
      this.modulesCache = assembleVisibleModules(
        this.sets(),
        nodeModuleAssemblyIo(),
        this.lastKnownGoodModules,
      ).modules;
    }
    return this.modulesCache;
  }

  /**
   * The UAT / E2E support flags the action registry gates on. Derived
   * the same way `CustomSessionSetsView.readSupports` derives them —
   * VS Code's contextKeyService is not readable, so both surfaces
   * re-derive from configuration plus the scanned sets.
   */
  private supports(): ActionSupports {
    if (this.supportsCache) return this.supportsCache;
    const cfg = vscode.workspace.getConfiguration("dabblerSessionSets");
    const uatPref = cfg.get<string>("uatSupport.enabled", "auto");
    const e2ePref = cfg.get<string>("e2eSupport.enabled", "auto");
    const all = this.sets();
    this.supportsCache = {
      uat: uatPref === "always" || (uatPref === "auto" && all.some((s) => s.config?.requiresUAT)),
      e2e: e2ePref === "always" || (e2ePref === "auto" && all.some((s) => s.config?.requiresE2E)),
    };
    return this.supportsCache;
  }

  private toTreeItem(
    descriptor: RowDescriptor,
    node: WorkExplorerNode,
  ): vscode.TreeItem {
    const item = new vscode.TreeItem(
      descriptor.label,
      descriptor.collapsible === "collapsed"
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );
    // Stable identity, so an expanded module survives a watcher tick and
    // the 30-second poll. Without it VS Code derives an id from the
    // label, and bucket labels repeat under every module. See the note
    // on `RowDescriptor.id`.
    item.id = descriptor.id;
    item.description = descriptor.description;
    item.contextValue = descriptor.contextValue;
    if (descriptor.tooltip !== undefined) {
      // `supportThemeIcons` so `$(warning)` inside a tooltip renders as
      // the glyph rather than as literal text.
      const md = new vscode.MarkdownString(descriptor.tooltip, true);
      item.tooltip = md;
    }
    if (descriptor.icon) item.iconPath = this.toIconPath(descriptor.icon);
    if (node.kind === "set") {
      // Preserve the webview's L5 left-click behaviour: activating a set
      // row opens spec.md, and on a non-terminal row also copies the
      // start-next-session prompt. Retiring that quietly would be a
      // regression the operator would feel every session.
      item.command = {
        command: "dabblerWorkExplorer.activateSet",
        title: "Open Spec",
        arguments: [node],
      };
    }
    return item;
  }

  private toIconPath(
    icon: IconSpec,
  ): vscode.ThemeIcon | { light: vscode.Uri; dark: vscode.Uri } {
    if (icon.kind === "theme") {
      return icon.color
        ? new vscode.ThemeIcon(icon.id, new vscode.ThemeColor(icon.color))
        : new vscode.ThemeIcon(icon.id);
    }
    // Set 110 S2: the operator's authored status glyphs, resolved per
    // theme from `media/light/` and `media/dark/` (the folder layout the
    // operator asked for mid-session).
    //
    // A {light, dark} PAIR, not one `currentColor` asset.
    // `icon-render-mechanism.spec.ts` measured a real extension host and
    // found VS Code paints a TreeItem icon as a `background-image` with
    // `mask-image: none` — the SVG renders exactly as authored and
    // inherits no colour from the row. Both Session 1 and the step-3.5
    // analyst recommended `currentColor`, reasoning from the activity-bar
    // mark, which VS Code renders through a different mechanism entirely.
    // See `media/status-icon-theming.md`.
    return {
      light: vscode.Uri.joinPath(this.extensionUri, "media", "light", icon.slug),
      dark: vscode.Uri.joinPath(this.extensionUri, "media", "dark", icon.slug),
    };
  }
}

/** Narrow an untrusted command argument to a module node. */
export function asModuleNode(arg: unknown): ModuleNode | undefined {
  if (arg === null || typeof arg !== "object") return undefined;
  const node = arg as Partial<ModuleNode>;
  return node.kind === "module" && node.module ? (node as ModuleNode) : undefined;
}
