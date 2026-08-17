// The native TreeDataProvider for the Work Explorer.
//
// Deliberately thin: everything that decides WHAT a row says lives in
// workExplorerTreeModel.ts (which imports no vscode and is driveable
// from the unit suite); this class converts descriptors into TreeItems
// and owns the platform lifecycle — the change event, the async scan
// cache, getParent.
//
// The laziness contract: nothing is computed until the view is visible;
// each level is computed only when its parent expands; a set reports
// Collapsed, never Expanded. The scan (projection subprocess per
// changed set) is memoised per refresh generation, so expanding four
// modules does not re-project the workspace four times.

import * as vscode from "vscode";
import { SessionSet } from "../types";
import { ScanResult, scanAllSessionSets } from "../utils/fileSystem";
import { ProjectionCache } from "../utils/projection";
import {
  ManifestFault,
  assembleVisibleModules,
  nodeModuleAssemblyIo,
} from "./moduleAssembly";
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

export class WorkExplorerTreeProvider
  implements vscode.TreeDataProvider<WorkExplorerNode>, vscode.Disposable
{
  public static readonly viewType = "dabblerWorkExplorerTree";

  private readonly onDidChangeEmitter =
    new vscode.EventEmitter<WorkExplorerNode | undefined>();
  public readonly onDidChangeTreeData = this.onDidChangeEmitter.event;

  private readonly projectionCache = new ProjectionCache();
  /** Memoised scan for the current refresh generation. */
  private scanPromise: Promise<ScanResult> | null = null;
  private modulesCache: VisibleModule[] | null = null;
  /** Per-root last-known-good module trees, so an invalid manifest does not blank the view. */
  private readonly lastKnownGoodModules = new Map<string, readonly VisibleModule[]>();
  /** Parent links, populated as children are served, so reveal() works. */
  private readonly parents = new WeakMap<object, WorkExplorerNode>();

  /**
   * Renders scan-level faults (invalid manifest, failed projections)
   * above the rows via TreeView.message. `undefined` clears. The
   * provider does not own the view — extension.ts creates it and is the
   * only place that can set TreeView.message — so this is a callback.
   */
  private diagnostic: ((message: string | undefined) => void) | undefined;

  constructor(private readonly extensionUri: vscode.Uri) {}

  public onDiagnostic(sink: (message: string | undefined) => void): void {
    this.diagnostic = sink;
  }

  public dispose(): void {
    this.onDidChangeEmitter.dispose();
  }

  /**
   * Invalidate the scan generation and repaint. The projection cache
   * survives — it is mtime-keyed, so unchanged sets stay free — unless
   * `hard` (the explicit refresh command) clears it too.
   */
  public refresh(hard = false): void {
    if (hard) this.projectionCache.clear();
    this.scanPromise = null;
    this.modulesCache = null;
    this.onDidChangeEmitter.fire(undefined);
  }

  public getTreeItem(node: WorkExplorerNode): vscode.TreeItem {
    return this.toTreeItem(descriptorFor(node), node);
  }

  public async getChildren(node?: WorkExplorerNode): Promise<WorkExplorerNode[]> {
    // VS Code does not call this until the view is visible, and the
    // root call is the only async one — every deeper level is a pure
    // transform over data the scan already carried.
    if (!node) {
      return moduleNodes(await this.modules());
    }
    const children = childrenOf(node);
    for (const child of children) this.parents.set(child, node);
    return children;
  }

  /** Required for TreeView.reveal. Root modules have no parent. */
  public getParent(node: WorkExplorerNode): WorkExplorerNode | undefined {
    return this.parents.get(node);
  }

  // ----- internals -----

  private scan(): Promise<ScanResult> {
    if (!this.scanPromise) {
      this.scanPromise = scanAllSessionSets(this.projectionCache);
    }
    return this.scanPromise;
  }

  private async modules(): Promise<VisibleModule[]> {
    if (this.modulesCache) return this.modulesCache;
    const scan = await this.scan();
    const assembly = assembleVisibleModules(
      scan.sets,
      nodeModuleAssemblyIo(),
      this.lastKnownGoodModules,
    );
    this.modulesCache = assembly.modules;
    // Report on every recompute, INCLUDING the clean case — the message
    // has to disappear when the operator fixes the underlying fault.
    this.diagnostic?.(
      describeScanFaults(assembly.manifestFaults, scan),
    );
    return this.modulesCache;
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
    // Stable identity, so an expanded module survives a watcher tick
    // and the 30-second poll.
    item.id = descriptor.id;
    item.description = descriptor.description;
    item.contextValue = descriptor.contextValue;
    if (descriptor.tooltip !== undefined) {
      // supportThemeIcons so $(warning) renders as the glyph.
      item.tooltip = new vscode.MarkdownString(descriptor.tooltip, true);
    }
    if (descriptor.icon) item.iconPath = this.toIconPath(descriptor.icon);
    if (node.kind === "set") {
      // Activating a set row opens spec.md, and on a non-terminal row
      // also copies the start-next-session prompt.
      item.command = {
        command: "dabblerWorkExplorer.activateSet",
        title: "Open Spec",
        arguments: [node],
      };
    }
    if (node.kind === "session") {
      // The same spec.md, opened at this session's own block.
      item.command = {
        command: "dabblerWorkExplorer.activateSession",
        title: "Open Session Plan",
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
    // A {light, dark} PAIR, not one currentColor asset: VS Code paints
    // a TreeItem icon as a background-image with mask-image none, so
    // the SVG renders exactly as authored and inherits no colour from
    // the row. See media/status-icon-theming.md.
    return {
      light: vscode.Uri.joinPath(this.extensionUri, "media", "light", icon.slug),
      dark: vscode.Uri.joinPath(this.extensionUri, "media", "dark", icon.slug),
    };
  }
}

/**
 * The one-line TreeView.message for the scan's faults, or undefined when
 * there are none. Exported and pure so the unit suite can pin the
 * wording without a TreeView.
 */
export function describeScanFaults(
  faults: readonly ManifestFault[],
  scan: Pick<ScanResult, "projectionErrors">,
): string | undefined {
  const parts: string[] = [];
  for (const fault of faults) {
    const shown = fault.retainedLastKnownGood
      ? "Showing the last-known-good module tree."
      : "No prior valid module tree is available; showing recoverable fallback groups.";
    parts.push(`${fault.rootLabel}: ${fault.message} ${shown}`);
  }
  if (scan.projectionErrors.length > 0) {
    // One line however many sets failed: the likely cause is a single
    // missing interpreter/package, and per-set spam would bury the fix.
    parts.push(
      `${scan.projectionErrors.length} session set` +
        `${scan.projectionErrors.length === 1 ? "" : "s"} rendered without ` +
        `the router (statuses from file presence). Install it with ` +
        `"Dabbler: Install ai-router", then refresh. ` +
        `First error: ${scan.projectionErrors[0].error}`,
    );
  }
  return parts.length > 0 ? parts.join("  ") : undefined;
}

/** Narrow an untrusted command argument to a module node. */
export function asModuleNode(arg: unknown): ModuleNode | undefined {
  if (arg === null || typeof arg !== "object") return undefined;
  const node = arg as Partial<ModuleNode>;
  return node.kind === "module" && node.module ? (node as ModuleNode) : undefined;
}

/** Narrow an untrusted command argument to a set-bearing item. */
export function setOf(arg: unknown): SessionSet | undefined {
  if (arg === null || typeof arg !== "object") return undefined;
  const maybe = arg as { set?: SessionSet };
  return maybe.set;
}
