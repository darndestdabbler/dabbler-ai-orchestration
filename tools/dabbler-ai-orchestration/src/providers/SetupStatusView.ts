// Set 110 Session 3 — the surfaces that could not go native.
//
// This file REPLACES `CustomSessionSetsView.ts` (977 lines), which owned the
// hand-rolled tree AND the Getting Started form AND the System Status strip
// in one webview. The tree is now a native `TreeView`; what is left here is
// everything a `TreeItem` cannot host:
//
//   - the Getting Started form — a radio group (provider access), a
//     validated numeric budget input, and buttons that
//     post typed messages to the host. `contributes.viewsWelcome` renders
//     markdown with command links, not a form, so it could not take this on.
//   - the System Status strip — the environment faults (workspace
//     initialization, Python, provider key, Copilot CLI, unconfirmed seat).
//
// The view id is UNCHANGED (`dabblerSessionSets`) on purpose: it is what a
// user's saved panel layout keys on, and renaming it would silently reset
// everyone's sidebar. Its contributed NAME and presence rule both changed —
// it is "Setup & Status", stacked above the tree, and contributed with
// `when: dabblerSessionSets.setupNeeded` so it is absent entirely on a
// healthy repo. See `providers/systemStatus.ts` for how that key is decided
// and why it fails toward visible.
//
// What went with the old file, and is not re-created here:
//
//   - `buildModules` / `buildRow` / `contextValueFor` / `descriptionFor` /
//     `fractionFor` — the row payload builders. The native tree derives all
//     of this in `workExplorerTreeModel.ts`.
//   - the `showRowContextMenu` / `showModuleContextMenu` QuickPick menus and
//     the `COMMAND_ALLOWLIST` that guarded the `activateRow` dispatch. VS
//     Code renders the real menu from `contributes.submenus` now, and the
//     host-side allowlist existed only because a webview is an untrusted
//     message source. There is no webview→host command dispatch left to
//     guard; removing the surface is a stronger guarantee than allowlisting
//     it.
//   - `toggleRow` / the whole `suppressionState` reducer and its
//     `workspaceState` key. VS Code keys expansion on `TreeItem.id`.
//   - `moduleAction` / `narrowModuleAction` dispatch. Module actions are
//     `contextValue`-gated menu entries invoking real commands.
//
// The `manifestFaults` field is likewise NOT computed here. Set 110 S3 moved
// the invalid-manifest diagnostic to `TreeView.message`, directly above the
// tree it explains — one channel, not two.

import * as crypto from "crypto";
import * as vscode from "vscode";
import { readAllSessionSets } from "../utils/fileSystem";
import { SessionSet } from "../types";
import { ScanState } from "./scanState";
import { buildSystemStatus } from "./systemStatus";
// Set 110 S2: host-side startup buckets (Session 1's assigned residual).
import {
  markWebviewResolveEnd,
  markWebviewResolveStart,
} from "../utils/startupTiming";
import {
  GettingStartedPayload,
  HostToWebview,
  ScanState as ProtocolScanState,
  SnapshotPayload,
} from "../types/sessionSetsWebviewProtocol";
// Set 060 Session 1: dual-mode Getting Started detection (spec D1/D3/D5).
import {
  computeGettingStarted,
  nodeDetectionFs,
} from "../utils/gettingStartedDetection";
// Set 079 S2: the durable seed the form restores from.
import { readTransportProfile } from "../utils/copilotSeatSetup";
// Set 060 Session 2: the form's action handlers (D4/D5/D7).
import {
  GettingStartedHandlers,
  makeGettingStartedHandlers,
  routeGettingStartedAction,
} from "../commands/gettingStartedActions";
// Set 060 Session 3 (D8): the static instructions doc opener.
import { openGettingStartedDoc } from "../commands/gettingStartedDoc";

const RENDER_DEBOUNCE_MS = 50;

export class SetupStatusView
  implements vscode.WebviewViewProvider, vscode.Disposable
{
  /** Unchanged from the pre-110 webview — a user's saved layout keys on it. */
  public static readonly viewType = "dabblerSessionSets";

  private view: vscode.WebviewView | undefined;
  private version = 0;
  private renderTimer: NodeJS.Timeout | undefined;
  private cache: SessionSet[] | null = null;
  // Set 060 Session 2: bound once at construction; injectable for tests.
  private readonly gettingStartedHandlers: GettingStartedHandlers;
  // Set 060 Session 3 (D8): the static instructions doc auto-opens ONCE per
  // extension session, the first time a snapshot ships a non-"list" Getting
  // Started surface. One-shot so watcher ticks and post-action refreshes do
  // not re-steal editor focus; `dabbler.getStarted` re-opens it any time.
  private instructionsOpened = false;
  private readonly openInstructions: () => void | Promise<void>;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly scanState: ScanState,
    gettingStartedHandlers?: GettingStartedHandlers,
    openInstructions?: () => void | Promise<void>,
  ) {
    this.gettingStartedHandlers =
      gettingStartedHandlers ?? makeGettingStartedHandlers(context);
    this.openInstructions =
      openInstructions ?? (() => openGettingStartedDoc(context));
    this.context.subscriptions.push(
      this.scanState.onDidChange(() => this.postScanState()),
    );
  }

  public dispose(): void {
    if (this.renderTimer) {
      clearTimeout(this.renderTimer);
      this.renderTimer = undefined;
    }
  }

  public refresh(): void {
    this.cache = null;
    this.scheduleRender();
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    // Set 110 S2: the `resolveWebviewView()` startup bucket, measured inside
    // a real extension host so Session 4 can compare like with like.
    markWebviewResolveStart();
    this.view = webviewView;
    const webview = webviewView.webview;
    webview.options = {
      enableScripts: true,
      enableCommandUris: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, "media"),
      ],
    };
    webview.onDidReceiveMessage((msg) => this.onMessage(msg));
    webviewView.onDidDispose(() => {
      this.view = undefined;
    });
    webview.html = this.renderShell();
    // The first snapshot fires after the ready handshake from client.js.
    markWebviewResolveEnd();
  }

  // ----- Message dispatch (webview -> host) -----
  //
  // Two messages, down from eight. Everything the tree needed is gone with
  // the tree, and with it the `executeCommand` channel that had to be
  // allowlisted.

  private onMessage(msg: unknown): void {
    if (!msg || typeof msg !== "object") return;
    const type = (msg as { type?: unknown }).type;
    if (type === "ready") {
      this.scheduleRender();
      return;
    }
    if (type === "gettingStartedAction") {
      // Set 060 Session 2: the form's buttons. The router narrows the
      // untrusted action / seat-profile / budget riders; after a handler runs,
      // refresh so the form's live completion state repaints immediately.
      void routeGettingStartedAction(
        msg as Parameters<typeof routeGettingStartedAction>[0],
        this.gettingStartedHandlers,
      )
        .then((handled) => {
          if (handled) this.refresh();
        })
        .catch((err) => {
          console.warn("[SetupStatusView] Getting Started action failed", err);
          this.refresh();
        });
    }
  }

  // ----- Render scheduling + snapshot fire -----

  private scheduleRender(): void {
    if (this.renderTimer) clearTimeout(this.renderTimer);
    this.renderTimer = setTimeout(() => this.postSnapshot(), RENDER_DEBOUNCE_MS);
  }

  private postSnapshot(): void {
    if (!this.view) return;
    this.version++;
    if (!this.cache) this.cache = readAllSessionSets();
    const all = this.cache;

    const payload: SnapshotPayload = {
      hasAnySets: all.length > 0,
      gettingStarted: this.buildGettingStarted(all),
      systemStatus: buildSystemStatus(all.length > 0),
    };

    // D8 (Set 060 S3): the first time a Getting Started surface shows, open
    // the static instructions doc beside it — once per extension session.
    if (payload.gettingStarted.mode !== "list" && !this.instructionsOpened) {
      this.instructionsOpened = true;
      void Promise.resolve(this.openInstructions()).catch((err) =>
        console.warn("[SetupStatusView] instructions open failed", err),
      );
    }

    const msg: HostToWebview = {
      type: "rowsSnapshot",
      version: this.version,
      scanState: this.toProtocolScanState(),
      payload,
    };
    this.view.webview.postMessage(msg);
  }

  private postScanState(): void {
    if (!this.view) return;
    this.version++;
    const msg: HostToWebview = {
      type: "scanStateChanged",
      version: this.version,
      state: this.toProtocolScanState(),
    };
    this.view.webview.postMessage(msg);
    if (this.scanState.phase === "ready") this.scheduleRender();
  }

  private toProtocolScanState(): ProtocolScanState {
    return this.scanState.phase === "loading" ? "loading" : "ready";
  }

  // Set 060 Session 1 (spec D1/D3/D5): the dual-mode Getting Started
  // payload. The mode derives from (is a folder open?, does any root carry a
  // session set?). Completion detection runs only in "getting-started" mode,
  // so the no-folder and list surfaces pay nothing for the fs probe.
  //
  // S1 verifier Issue 1 (dispositioned — intentional): the
  // getting-started -> list flip keys on `hasAnySets` (a MATERIALIZED set,
  // which `readAllSessionSets` only counts once `spec.md` is present), NOT on
  // the looser "a NNN- directory exists" probe. Flipping on a bare directory
  // would render an empty list. Do not consolidate these onto the bare-dir
  // probe.
  private buildGettingStarted(all: SessionSet[]): GettingStartedPayload {
    const folders = vscode.workspace.workspaceFolders ?? [];
    return computeGettingStarted(
      folders.length > 0,
      folders[0]?.uri.fsPath,
      all.length > 0,
      nodeDetectionFs,
      (root) => readTransportProfile(root),
    );
  }

  // ----- Webview shell HTML -----

  private renderShell(): string {
    if (!this.view) return "";
    const webview = this.view.webview;
    const asset = (...parts: string[]) =>
      webview.asWebviewUri(
        vscode.Uri.joinPath(this.context.extensionUri, ...parts),
      );
    const cssUri = asset("media", "session-sets-tree", "tree.css");
    const jsUri = asset("media", "session-sets-tree", "client.js");
    const gsHtmlUri = asset("media", "session-sets-tree", "gettingStartedHtml.js");
    const statusHtmlUri = asset("media", "session-sets-tree", "systemStatusHtml.js");
    // Set 077 S1: CSP nonces must come from a CSPRNG — `Math.random()` is
    // predictable, which voids the script-src nonce guarantee.
    const nonce = crypto.randomBytes(16).toString("hex");
    const csp =
      `default-src 'none'; ` +
      `style-src ${webview.cspSource} 'unsafe-inline'; ` +
      `script-src 'nonce-${nonce}';`;
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <link rel="stylesheet" href="${cssUri}">
  <title>Setup &amp; Status</title>
</head>
<body>
  <main id="root" role="presentation"></main>
  <script nonce="${nonce}" src="${gsHtmlUri}"></script>
  <script nonce="${nonce}" src="${statusHtmlUri}"></script>
  <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
  }
}
