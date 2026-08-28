// The native TreeDataProvider for the Work Explorer.
//
// Deliberately thin: everything that decides WHAT a row says lives in
// workExplorerTreeModel.ts (which imports no vscode and is driveable
// from the unit suite); this class converts descriptors into TreeItems
// and owns the platform lifecycle — the change event, the async scan
// cache, getParent.
//
// The laziness contract: nothing is computed until the view is visible;
// each level is computed only when its parent expands; a repository
// reports Collapsed, never Expanded. The scan (one projection
// subprocess per changed repository) is memoised per refresh
// generation.

import * as vscode from "vscode";
import type { SessionsRepository } from "../utils/fileSystem";
import { ScanResult, scanRepositories } from "../utils/fileSystem";
import { ProjectionCache } from "../utils/projection";
import {
  IconSpec,
  RowDescriptor,
  WorkExplorerNode,
  childrenOf,
  descriptorFor,
  repositoryNodes,
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
  /** Parent links, populated as children are served, so reveal() works. */
  private readonly parents = new WeakMap<object, WorkExplorerNode>();

  /**
   * Renders scan-level faults (failed projections) above the rows via
   * TreeView.message. `undefined` clears. The provider does not own the
   * view — extension.ts creates it and is the only place that can set
   * TreeView.message — so this is a callback.
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
   * survives — it is mtime-keyed, so unchanged repositories stay free —
   * unless `hard` (the explicit refresh command) clears it too.
   */
  public refresh(hard = false): void {
    if (hard) this.projectionCache.clear();
    this.scanPromise = null;
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
      const scan = await this.scan();
      // Report on every recompute, INCLUDING the clean case — the
      // message has to disappear when the operator fixes the fault.
      this.diagnostic?.(describeScanFaults(scan));
      return repositoryNodes(scan.repositories);
    }
    const children = childrenOf(node);
    for (const child of children) this.parents.set(child, node);
    return children;
  }

  /** Required for TreeView.reveal. Repository rows have no parent. */
  public getParent(node: WorkExplorerNode): WorkExplorerNode | undefined {
    return this.parents.get(node);
  }

  // ----- internals -----

  private scan(): Promise<ScanResult> {
    if (!this.scanPromise) {
      this.scanPromise = scanRepositories(this.projectionCache);
    }
    return this.scanPromise;
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
    // Stable identity, so an expanded repository survives a watcher tick
    // and the 30-second poll.
    item.id = descriptor.id;
    item.description = descriptor.description;
    item.contextValue = descriptor.contextValue;
    if (descriptor.tooltip !== undefined) {
      // supportThemeIcons so $(warning) renders as the glyph.
      item.tooltip = new vscode.MarkdownString(descriptor.tooltip, true);
    }
    if (descriptor.icon) item.iconPath = this.toIconPath(descriptor.icon);
    if (node.kind === "repository") {
      // Activating a repository row opens the session plan, and while
      // work remains also copies the start-next-session prompt.
      item.command = {
        command: "dabblerWorkExplorer.activateRepository",
        title: "Open Session Plan",
        arguments: [node],
      };
    }
    if (node.kind === "session") {
      // The same session-plan.md, opened at this session's own block.
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
  scan: Pick<ScanResult, "projectionErrors">,
): string | undefined {
  const count = scan.projectionErrors.length;
  if (count === 0) return undefined;
  // One line however many repositories failed: the likely cause is a
  // single missing interpreter or package, and per-repository spam would
  // bury the fix.
  return (
    `${count} repositor${count === 1 ? "y" : "ies"} could not be read: the ` +
    `router did not run, so no sessions are shown. Install it with ` +
    `"Dabbler: Install ai-router", then refresh. ` +
    `First error: ${scan.projectionErrors[0].error}`
  );
}

/** Narrow an untrusted command argument to a repository-bearing item. */
export function repositoryOf(arg: unknown): SessionsRepository | undefined {
  if (arg === null || typeof arg !== "object") return undefined;
  const maybe = arg as { repository?: SessionsRepository };
  return maybe.repository;
}
