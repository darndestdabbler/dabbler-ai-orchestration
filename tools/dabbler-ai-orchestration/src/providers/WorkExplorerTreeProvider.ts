// The native TreeDataProvider for the Work Explorer.
//
// Deliberately thin: everything that decides WHAT a row says is the
// router's (`views/workExplorer.ts`, called in-process, the same rows
// `dabbler view work-explorer` prints); this class converts descriptors
// into TreeItems and owns the platform lifecycle — the change event, the
// async scan cache, getParent. Which menu item shows on a row is its
// `contextValue`, minted from the row's own actions.
//
// The laziness contract: nothing is computed until the view is visible;
// each level is computed only when its parent expands; a repository
// reports Collapsed, never Expanded. The scan (one projection
// subprocess per changed repository) is memoised per refresh
// generation.

import * as vscode from "vscode";
import {
  childrenOf,
  descriptorFor,
  repositoryNodes,
  type IconSpec,
  type RowDescriptor,
  type SessionsRepository,
  type WorkExplorerNode,
} from "dabbler-ai-router";
import { ScanResult, scanRepositories } from "../utils/fileSystem";
import { ProjectionCache } from "../utils/projection";

/** How long `refresh()` waits to merge a burst of calls into one repaint. */
export const REFRESH_WINDOW_MS = 250;

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
  /**
   * The roots the scan reads, set by whoever discovers them (`setRoots`).
   * A promise is accepted so the first scan waits for the first discovery
   * rather than painting an empty view.
   */
  private roots: Promise<readonly string[]> = Promise.resolve([]);
  /** Parent links, populated as children are served, so reveal() works. */
  private readonly parents = new WeakMap<object, WorkExplorerNode>();

  /**
   * Renders scan-level faults (failed projections) above the rows via
   * TreeView.message. `undefined` clears. The provider does not own the
   * view — extension.ts creates it and is the only place that can set
   * TreeView.message — so this is a callback.
   */
  private diagnostic: ((message: string | undefined) => void) | undefined;

  /** Told what the scan found, for the badge and the toast. See `onScan`. */
  private scanned: ((repositories: readonly SessionsRepository[]) => void) | undefined;

  constructor(private readonly extensionUri: vscode.Uri) {}

  public onDiagnostic(sink: (message: string | undefined) => void): void {
    this.diagnostic = sink;
  }

  /**
   * Every recompute, to whoever owns something outside the rows.
   *
   * The badge and the toast are both view-level, and the view belongs to
   * `extension.ts` -- the same reason `onDiagnostic` exists. Reported on
   * the clean recompute too, so a badge clears when the last decision is
   * answered.
   */
  public onScan(sink: (repositories: readonly SessionsRepository[]) => void): void {
    this.scanned = sink;
  }

  public dispose(): void {
    this.cancelPending();
    this.onDidChangeEmitter.dispose();
  }

  /** The repository roots the next scan reads. Does not repaint. */
  public setRoots(roots: readonly string[] | Promise<readonly string[]>): void {
    this.roots = Promise.resolve(roots);
  }

  /**
   * Invalidate the scan generation and repaint. The projection cache
   * survives — it is mtime-keyed, so unchanged repositories stay free —
   * unless `hard` (the explicit refresh command) clears it too.
   *
   * Calls inside `REFRESH_WINDOW_MS` of the first are one repaint: a
   * session start writes its records in a burst, and every watcher event
   * used to be a full scan of its own. `hard` repaints at once.
   */
  public refresh(hard = false): void {
    if (hard) {
      this.cancelPending();
      this.projectionCache.clear();
      this.repaint();
      return;
    }
    if (this.pending) return;
    this.pending = setTimeout(() => {
      this.pending = undefined;
      this.repaint();
    }, REFRESH_WINDOW_MS);
  }

  private pending: ReturnType<typeof setTimeout> | undefined;

  private cancelPending(): void {
    if (this.pending) clearTimeout(this.pending);
    this.pending = undefined;
  }

  private repaint(): void {
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
      this.scanned?.(scan.repositories);
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
      this.scanPromise = this.roots.then((roots) => scanRepositories(this.projectionCache, roots));
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
        : descriptor.collapsible === "expanded"
          ? vscode.TreeItemCollapsibleState.Expanded
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
    // A row that carries its own command carries its own argument with it,
    // which is how an attention row can be answered without the provider
    // knowing anything about decisions.
    if (descriptor.command) item.command = descriptor.command;
    if (node.kind === "repository") {
      // Activating a repository row opens the session plan.
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
