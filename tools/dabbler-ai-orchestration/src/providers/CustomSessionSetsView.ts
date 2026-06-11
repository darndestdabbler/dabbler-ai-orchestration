// Custom-tree WebviewViewProvider for `dabblerSessionSets`. Set 029
// Session 4 ship — replaces the v0.15.0 native TreeView. Consumes:
//   - SessionSetsModel (pure scan/bucket/sort/text helpers)
//   - inProgressSetsService (listInProgressSets + ai-assignment recommendation)
//   - ActionRegistry (typed action-applicability predicates per row)
//   - suppressionState (manual-collapse persistence reducer)
//   - ScanState (loading/ready phase from extension.ts)
//   - sessionSetsWebviewProtocol (typed messages with monotonic version)
//
// Per S4 audit GPT-5.4 M4: this file owns lifecycle + message
// protocol + snapshot serialization. It does NOT own kbd nav (that's
// in media/session-sets-tree/client.js). Gauge rendering historically
// lived in OrchestratorAccordion — Set 034 retired the per-row
// accordion at the render surface (`accordionHtml` ships as `null` on
// every row); Set 036 Session 6 deleted the OrchestratorAccordion +
// detectOrchestrators source modules entirely.
//
// Per S4 audit GPT-5.4 M3: every render message carries a monotonic
// version. Out-of-order messages are dropped by the webview client.
//
// Set 033 Session 2: per H2, the `.dabbler/orchestrator.json` per-set
// marker is retired. The `orchestrator` block on session-state.json
// (Set 033 Session 1 schema) is the canonical record. The single-
// active-set ambiguity banner is gone — multi-in-progress is the
// supported case. Set 034 then retired the on-screen accordion that
// would have rendered the block; each in-progress row now ships
// name / fraction / description only.

import * as vscode from "vscode";
import { readAllSessionSets } from "../utils/fileSystem";
import { SessionSet } from "../types";
import { ScanState } from "./scanState";
import {
  bucketSets,
  blockedByPrereqsBadge,
  forceClosedBadge,
  fractionTooltip,
  ICON_FILES,
  isCurrentSessionInFlight,
  migrationMarker,
  migrationTooltip,
  sortBucket,
  tierMarker,
  tierTooltip,
  touchedDate,
  uatBadge,
} from "./SessionSetsModel";
// Set 034: the per-row orchestrator-tracking accordion (gauges + model
// description) is retired from the UI. Set 036 Session 6 deleted the
// OrchestratorAccordion + detectOrchestrators source modules. The
// in-progress ordering helper survives in inProgressSetsService.
import { listInProgressSets } from "./inProgressSetsService";
import {
  ActionSupports,
  RowAction,
  categorizedActions,
} from "./ActionRegistry";
import {
  buildSubmenuItems,
  buildTopLevelItems,
  planLeftClickActivation,
} from "./rowMenuHelpers";
import {
  SuppressionState,
  clearSuppression,
  prune,
  suppress,
} from "./suppressionState";
import {
  BucketPayload,
  GettingStartedPayload,
  HostToWebview,
  RowPayload,
  ScanState as ProtocolScanState,
  SnapshotPayload,
  WebviewToHost,
} from "../types/sessionSetsWebviewProtocol";
// Set 060 Session 1: dual-mode Getting Started detection (spec D1/D3/D5).
import {
  computeGettingStarted,
  nodeDetectionFs,
} from "../utils/gettingStartedDetection";
// Set 060 Session 2: the form's action handlers (D4/D5/D7).
import {
  GettingStartedHandlers,
  makeGettingStartedHandlers,
  routeGettingStartedAction,
} from "../commands/gettingStartedActions";
// Set 060 Session 3 (D8): the static instructions doc opener.
import { openGettingStartedDoc } from "../commands/gettingStartedDoc";

const SUPPRESSION_KEY = "dabbler.sessionSets.suppressedExpand";
const RENDER_DEBOUNCE_MS = 50;

// Set 048 S3 — internal discriminated union for the two-step QuickPick.
type TopLevelChoice =
  | { kind: "openFile" }
  | { kind: "copyEval" }
  | { kind: "action"; action: RowAction };

// Allowlist for executeCommand dispatch ORIGINATING IN THE WEBVIEW
// (i.e., messages the webview posts and the host then forwards to
// `vscode.commands.executeCommand`). Defense-in-depth: even if a
// malicious string slipped through the typed protocol, only these
// commands fire.
//
// Set 048 S3 (spec §3.3 + L3) rebuilt the right-click menu on
// `vscode.window.showQuickPick`. QuickPick selections execute via
// `executeRowAction` → `vscode.commands.executeCommand` directly,
// which does NOT pass through this allowlist (the host-side picker
// is fully trusted). So the allowlist now governs ONLY the L5
// left-click `activateRow` path. Any new webview→host dispatch
// channel introduced later MUST add its allowed command ids here
// explicitly — adding a code path that bypasses this set undoes the
// defense-in-depth guarantee.
const COMMAND_ALLOWLIST: ReadonlySet<string> = new Set([
  "dabblerSessionSets.openSpec",
]);

function contextValueFor(set: SessionSet): string {
  const parts = [`sessionSet:${set.state}`];
  if (set.config?.requiresUAT) parts.push("uat");
  if (set.config?.requiresE2E) parts.push("e2e");
  if (set.needsMigration) parts.push("needs-migration");
  if (set.blockedByPrereqs && set.state !== "complete" && set.state !== "cancelled") {
    parts.push("blocked-by-prereqs");
  }
  return parts.join(":");
}

// Set 034: row description drops the fraction prefix (which now lives
// in the right-aligned fraction list-icon column) and the trailing
// "Complete" word. For in-progress rows: just "session N in flight".
// For not-started / complete / cancelled rows: empty (the fraction
// IS the signal). UAT / force-closed / touched-date badges still tack
// on if present.
//
// Set 050 S4: the "(needs migration)" badge is removed from the
// description entirely — it now renders as an unobtrusive asterisk next
// to the row name (see migrationMarker / migrationTooltip on RowPayload)
// rather than as an intrusive trailing label.
function descriptionFor(set: SessionSet): string {
  const bits: string[] = [];
  if (set.state === "in-progress" && set.liveSession?.currentSession != null) {
    bits.push(`session ${set.liveSession.currentSession} in flight`);
  }
  const extras = [
    touchedDate(set),
    uatBadge(set),
    forceClosedBadge(set),
    blockedByPrereqsBadge(set),
  ].filter(Boolean);
  bits.push(...extras);
  return bits.join("  ·  ");
}

// Set 034: right-aligned bold colored progress fraction now lives in
// its own list-icon column. Compute once here instead of embedding in
// the description string.
//
// Set 036: a session set without a known totalSessions count (spec.md
// hasn't been written yet, or has been written but doesn't enumerate
// sessions — see session-set 046 for the canonical example) gets a
// "?" denominator instead of an empty fraction. The operator's
// directive was that every row in the Session Set Explorer must carry
// a fraction so a not-yet-spec'd set doesn't render visually identical
// to a malformed row.
// Set 061 Session 1 (spec D1): a Lightweight dedicated-sessions set
// whose typed verification session has not been appended yet renders a
// `+` suffix ("2/3+") warning that the denominator can still grow. The
// "?" denominator branch skips the suffix — an unknown denominator
// already communicates the uncertainty the `+` exists to add.
function fractionFor(set: SessionSet): string {
  if (set.totalSessions && set.totalSessions > 0) {
    const plus = set.plusFraction ? "+" : "";
    return `${set.sessionsCompleted}/${set.totalSessions}${plus}`;
  }
  return `${set.sessionsCompleted}/?`;
}

export class CustomSessionSetsView implements vscode.WebviewViewProvider, vscode.Disposable {
  public static readonly viewType = "dabblerSessionSets";

  private view: vscode.WebviewView | undefined;
  private version = 0;
  private renderTimer: NodeJS.Timeout | undefined;
  private cache: SessionSet[] | null = null;
  private welcomeHtml: string;
  // Set 060 Session 2: bound once at construction; injectable for tests.
  private readonly gettingStartedHandlers: GettingStartedHandlers;
  // Set 060 Session 3 (D8): the static instructions doc auto-opens
  // ONCE per extension session, the first time a snapshot ships a
  // non-"list" Getting Started surface. One-shot so watcher ticks and
  // post-action refreshes don't re-steal editor focus; the
  // dabbler.getStarted command re-opens it explicitly any time.
  private instructionsOpened = false;
  private readonly openInstructions: () => void | Promise<void>;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly scanState: ScanState,
    gettingStartedHandlers?: GettingStartedHandlers,
    openInstructions?: () => void | Promise<void>,
  ) {
    this.welcomeHtml = this.loadWelcomeHtmlFromPackageJson();
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
    this.view = webviewView;
    const webview = webviewView.webview;
    webview.options = {
      enableScripts: true,
      enableCommandUris: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "media")],
    };
    webview.onDidReceiveMessage((msg: WebviewToHost) => this.onMessage(msg));
    webviewView.onDidDispose(() => {
      this.view = undefined;
    });
    webview.html = this.renderShell();
    // First snapshot fires after the ready handshake from client.js
    // (see onMessage("ready") below).
  }

  // ----- Message dispatch (webview → host) -----

  private onMessage(msg: WebviewToHost): void {
    if (!msg || typeof msg !== "object") return;
    switch (msg.type) {
      case "ready":
        this.postSuppressionEcho();
        this.scheduleRender();
        return;
      case "executeCommand":
        this.dispatchCommand(msg.commandId, msg.args);
        return;
      case "showRowContextMenu":
        void this.showContextMenu(msg.slug);
        return;
      case "toggleRow":
        this.handleToggle(msg.slug, msg.expanded, msg.accordionUpdatedAt);
        return;
      case "activateRow":
        // Set 048 S3 (spec §3.3, L5): left-click ALWAYS opens spec.md
        // (preserved S4 default). On non-terminal rows the activation
        // ALSO writes "Start the next session of `<slug>`." to the
        // clipboard and shows a one-line info toast, so the high-
        // frequency starting-shortcut surfaces without a separate
        // affordance. Terminal-state rows (complete/cancelled) skip
        // the clipboard write and toast — spec.md opens only.
        void this.handleActivateRow(msg.slug);
        return;
      case "gettingStartedAction":
        // Set 060 Session 2: the Getting Started form's buttons. The
        // router narrows the untrusted action/tier/parallel riders;
        // after a handler runs, refresh the snapshot so the form's live
        // completion state repaints immediately (the D3-inputs watcher
        // remains the backstop for out-of-form work).
        void routeGettingStartedAction(msg, this.gettingStartedHandlers)
          .then((handled) => {
            if (handled) this.refresh();
          })
          .catch((err) => {
            console.warn("[CustomSessionSetsView] Getting Started action failed", err);
            this.refresh();
          });
        return;
    }
  }

  private async handleActivateRow(slug: string): Promise<void> {
    const set = this.findSetBySlug(slug);
    if (!set) return;
    const plan = planLeftClickActivation(set.name, set.state);
    this.dispatchCommand(plan.openCommand.commandId, [{ set }]);
    if (!plan.clipboardWrite) return;
    try {
      await vscode.env.clipboard.writeText(plan.clipboardWrite.text);
      vscode.window.showInformationMessage(plan.clipboardWrite.toast);
    } catch (err) {
      console.warn(`[CustomSessionSetsView] left-click clipboard write failed for "${slug}"`, err);
    }
  }

  private dispatchCommand(commandId: string, args?: unknown[]): void {
    if (!COMMAND_ALLOWLIST.has(commandId)) {
      console.warn(`[CustomSessionSetsView] rejected command "${commandId}" — not in allowlist`);
      return;
    }
    void vscode.commands.executeCommand(commandId, ...(args ?? []));
  }

  // Set 048 S3 (spec §3.3, audit Bias 3 flip): the Set 034 cursor-
  // anchored HTML popup is retired. The right-click menu is rebuilt
  // on `vscode.window.showQuickPick` as a two-step flow:
  //
  //   Level 1 → top-level items:
  //     - "Open File ▸"   (if any openFile entries are applicable)
  //     - "Copy Prompt ▸" (if any copyEval entries are applicable; was
  //       "Copy Eval ▸" through Set 048; relabeled Set 049 S1)
  //     - each flat action as its own item
  //
  //   Level 2 → submenu items for the chosen "▸" branch. Escape /
  //   dismiss cancels the second-level pick and is treated as "no
  //   selection" (the operator returns to whatever they were doing).
  //
  // Native QuickPick handles click-outside, Escape, and focus-loss
  // (L4 close-on-blur is a free byproduct) and respects theme +
  // accessibility settings.
  private async showContextMenu(
    slug: string,
    opts?: { showQuickPick?: typeof vscode.window.showQuickPick },
  ): Promise<void> {
    const set = this.findSetBySlug(slug);
    if (!set) return;
    const supports: ActionSupports = await this.readSupports();
    const categorized = categorizedActions(set, supports);
    const totalActions = categorized.openFile.length + categorized.copyEval.length + categorized.flat.length;
    if (totalActions === 0) return;

    const showQuickPick = opts?.showQuickPick ?? vscode.window.showQuickPick;
    const topLevelChoice = await this.pickTopLevel(categorized, set.name, showQuickPick);
    if (!topLevelChoice) return;

    if (topLevelChoice.kind === "action") {
      this.executeRowAction(topLevelChoice.action, set);
      return;
    }
    const submenu = topLevelChoice.kind === "openFile" ? categorized.openFile : categorized.copyEval;
    const placeHolder = topLevelChoice.kind === "openFile"
      ? `Open File — ${set.name}`
      : `Copy Prompt — ${set.name}`;
    const submenuChoice = await this.pickSubmenu(submenu, placeHolder, showQuickPick);
    if (!submenuChoice) return;
    this.executeRowAction(submenuChoice, set);
  }

  private async pickTopLevel(
    categorized: ReturnType<typeof categorizedActions>,
    slug: string,
    showQuickPick: typeof vscode.window.showQuickPick,
  ): Promise<TopLevelChoice | undefined> {
    const items = buildTopLevelItems(categorized);
    const picked = await showQuickPick(items, { placeHolder: slug, matchOnDescription: false });
    if (!picked) return undefined;
    if (picked.dabblerKind === "action" && picked.action) {
      return { kind: "action", action: picked.action };
    }
    return { kind: picked.dabblerKind === "openFile" ? "openFile" : "copyEval" };
  }

  private async pickSubmenu(
    submenu: RowAction[],
    placeHolder: string,
    showQuickPick: typeof vscode.window.showQuickPick,
  ): Promise<RowAction | undefined> {
    const items = buildSubmenuItems(submenu);
    const picked = await showQuickPick(items, { placeHolder });
    return picked?.action;
  }

  private executeRowAction(action: RowAction, set: SessionSet): void {
    void vscode.commands.executeCommand(action.id, { set });
  }

  private async readSupports(): Promise<ActionSupports> {
    // Context keys live in vscode's contextKeyService which is not
    // directly readable; we re-derive from the configuration +
    // cached sets the same way evaluateSupportContextKeys does.
    const cfg = vscode.workspace.getConfiguration("dabblerSessionSets");
    const uatPref = cfg.get<string>("uatSupport.enabled", "auto");
    const e2ePref = cfg.get<string>("e2eSupport.enabled", "auto");
    const all = this.cache ?? readAllSessionSets();
    const anyUat = all.some((s) => s.config?.requiresUAT);
    const anyE2e = all.some((s) => s.config?.requiresE2E);
    return {
      uat: uatPref === "always" || (uatPref === "auto" && anyUat),
      e2e: e2ePref === "always" || (e2ePref === "auto" && anyE2e),
    };
  }

  private findSetBySlug(slug: string): SessionSet | undefined {
    const all = this.cache ?? readAllSessionSets();
    return all.find((s) => s.name === slug);
  }

  // ----- Suppression state -----

  private getSuppression(): SuppressionState {
    return this.context.workspaceState.get<SuppressionState>(SUPPRESSION_KEY, {});
  }

  private async setSuppression(next: SuppressionState): Promise<void> {
    await this.context.workspaceState.update(SUPPRESSION_KEY, next);
  }

  private handleToggle(slug: string, expanded: boolean, accordionUpdatedAt: string | null): void {
    const current = this.getSuppression();
    if (expanded) {
      // Operator manually expanded — clear suppression for this slug.
      const next = clearSuppression(current, slug);
      if (next !== current) {
        void this.setSuppression(next);
        this.postSuppressionEcho();
      }
    } else if (accordionUpdatedAt) {
      // Operator manually collapsed — suppress for this occurrence only.
      const next = suppress(current, slug, accordionUpdatedAt);
      void this.setSuppression(next);
      this.postSuppressionEcho();
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
    if (!this.cache) {
      this.cache = readAllSessionSets();
    }
    const all = this.cache;

    // Prune suppression for slugs that no longer exist.
    const visibleSlugs = new Set(all.map((s) => s.name));
    const current = this.getSuppression();
    const pruned = prune(current, visibleSlugs);
    if (pruned !== current) {
      void this.setSuppression(pruned);
    }

    // Set 033 Session 2: every in-progress row gets its own accordion.
    // Compute the per-row RenderState lazily inside buildRow via the
    // orchestrator block on the set's session-state.json. The empty-
    // state CTA is shared across in-progress rows that have no
    // orchestrator block yet (e.g., a pre-Set-033 in-flight set, or
    // a freshly-started set that hasn't run start_session yet).
    const payload: SnapshotPayload = {
      buckets: this.buildBuckets(all),
      hasAnySets: all.length > 0,
      welcomeHtml: this.welcomeHtml,
      gettingStarted: this.buildGettingStarted(all),
    };

    // D8 (Set 060 S3): the first time the Explorer shows a Getting
    // Started surface (no-folder CTA or the form), open the static
    // instructions doc beside it — once per extension session.
    if (payload.gettingStarted?.mode !== "list" && !this.instructionsOpened) {
      this.instructionsOpened = true;
      void Promise.resolve(this.openInstructions()).catch((err) =>
        console.warn("[CustomSessionSetsView] instructions open failed", err),
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
    // A scan-state flip to "ready" also warrants a fresh row snapshot.
    if (this.scanState.phase === "ready") {
      this.scheduleRender();
    }
  }

  private postSuppressionEcho(): void {
    if (!this.view) return;
    this.version++;
    const msg: HostToWebview = {
      type: "suppressionEcho",
      version: this.version,
      suppressed: this.getSuppression(),
    };
    this.view.webview.postMessage(msg);
  }

  private toProtocolScanState(): ProtocolScanState {
    return this.scanState.phase === "loading" ? "loading" : "ready";
  }

  // Set 060 Session 1 (spec D1/D3/D5): compute the dual-mode Getting
  // Started payload. The mode is derived from (is a folder open?, does
  // any root carry a session set?). Completion detection only runs in
  // the one mode where the form renders — "getting-started" (a folder
  // is open but it has no session sets) — so the no-folder and list
  // surfaces pay nothing for the fs probe. The detection root is the
  // first workspace folder (D5: "build into the open workspace
  // folder"); the across-roots `hasAnySets` signal (which includes
  // worktrees) still drives the list-mode flip.
  //
  // S1 verifier Issue 1 (dispositioned — intentional design): the
  // getting-started -> list flip is keyed on `hasAnySets` (a MATERIALIZED
  // set, which `readAllSessionSets` only counts once `spec.md` is
  // present), NOT on the looser D3-step-3 "a NNN- directory exists"
  // probe. This is deliberate and consistent on three fronts: (1) D1
  // defines "a session set" as the existing Explorer notion — a row the
  // list can actually render, which requires spec.md; (2) the file
  // watcher fires on `docs/session-sets/**/{spec.md,...}`, so the refresh
  // that drives the flip happens exactly when a renderable set lands, not
  // on a bare directory; (3) flipping to "list" on a bare NNN- directory
  // would render an EMPTY list (no spec.md => no row), worse UX than
  // keeping the form. The form's step-3 indicator still uses the D3
  // dir-probe per the operator-locked spec; in the happy path (the
  // decomposition writes the dir WITH spec.md) both signals flip
  // together. Do not "consolidate" these onto the bare-dir probe.
  private buildGettingStarted(all: SessionSet[]): GettingStartedPayload {
    const folders = vscode.workspace.workspaceFolders ?? [];
    return computeGettingStarted(
      folders.length > 0,
      folders[0]?.uri.fsPath,
      all.length > 0,
      nodeDetectionFs,
      // D6 (Set 060 S3): process.env is the extension host's merged
      // Windows System + User environment, captured at launch — hence
      // the warning's "reload the window" instruction.
      process.env,
    );
  }

  private buildBuckets(all: SessionSet[]): BucketPayload[] {
    const buckets = bucketSets(all);
    const inProgressOrdered = listInProgressSets(buckets.inProgress);
    const groups: BucketPayload[] = [
      this.buildBucket("in-progress", "In Progress", inProgressOrdered),
      this.buildBucket("not-started", "Not Started", buckets.notStarted),
      this.buildBucket("complete", "Complete", buckets.complete),
    ];
    if (buckets.cancelled.length > 0) {
      groups.push(this.buildBucket("cancelled", "Cancelled", buckets.cancelled));
    }
    return groups;
  }

  private buildBucket(
    key: BucketPayload["key"],
    label: string,
    subset: SessionSet[],
  ): BucketPayload {
    const sorted = key === "in-progress" ? subset : sortBucket(subset, key);
    const rows = sorted.map((set) => this.buildRow(set));
    return { key, label, count: subset.length, rows };
  }

  private buildRow(set: SessionSet): RowPayload {
    // Set 034: the per-row accordion is GONE. Operator feedback
    // 2026-05-21 (mid-Set-034 Session 1) — the gauges and the
    // orchestrator-info text below them read as more authoritative
    // than the underlying signal warrants: the adapter rendered
    // every check-out as a live high-confidence signal regardless of
    // how stale it actually was, effort tracking via /think_* slash
    // commands was retired in Set 033 H2 (no longer observed), and
    // for orchestrators without a hook path (Copilot, Gemini, Codex
    // post-Set-036-S3) the gauge area was either empty or whatever
    // the last manual checkout claimed. Rather than try to honestly
    // caveat all of that visually, retire the entire
    // orchestrator-tracking display surface until a future set
    // delivers a real signal. Rows now show just name + fraction +
    // description.
    //
    // Net effect: accordionHtml is null on every row; client.js no
    // longer renders any accordion body. The `orchestrator` block on
    // session-state.json continues to be written by start_session /
    // close_session (the check-out semantics still serve coordination
    // and audit-log purposes); only the UI surface retires.
    // Set 061 S1 (D1): the tooltip ships only when the rendered
    // fraction actually carries the `+` suffix (the "?"-denominator
    // branch suppresses the suffix even when plusFraction is true).
    const fraction = fractionFor(set);
    return {
      slug: set.name,
      name: set.name,
      state: set.state,
      fraction,
      fractionTooltip: fraction.endsWith("+") ? fractionTooltip(set) : "",
      description: descriptionFor(set),
      contextValue: contextValueFor(set),
      iconSlug: ICON_FILES[set.state] ?? "",
      needsMigration: set.needsMigration,
      // Set 050 S4: unobtrusive asterisk + tooltip replacing the old
      // "(needs migration)" description label.
      migrationMarker: migrationMarker(set),
      migrationTooltip: migrationTooltip(set),
      // Set 061 S1 (D2): quiet "lw" marker + tooltip on Lightweight rows.
      tierMarker: tierMarker(set),
      tierTooltip: tierTooltip(set),
      accordionHtml: null,
      accordionUpdatedAt: null,
    };
  }

  // ----- Welcome HTML extraction -----

  // Parse package.json `viewsWelcome` contribution for our view id
  // and convert the contents markdown to an HTML fragment the
  // webview can render. Keeps the package.json declaration as the
  // single source of truth (per S4 Q3 = a, GPT M4 cleanliness).
  private loadWelcomeHtmlFromPackageJson(): string {
    try {
      const pkgPath = vscode.Uri.joinPath(this.context.extensionUri, "package.json").fsPath;
      const fs = require("fs") as typeof import("fs");
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      const entries: Array<{ view?: string; contents?: string }> = pkg?.contributes?.viewsWelcome ?? [];
      const ours = entries.find((e) => e.view === CustomSessionSetsView.viewType);
      if (!ours?.contents) return this.escHtml("No welcome content available.");
      return this.renderWelcomeMarkdown(ours.contents);
    } catch {
      return this.escHtml("No welcome content available.");
    }
  }

  // Minimal markdown → HTML for the viewsWelcome contents. Supports
  // paragraphs (separated by \n) and the two link forms the actual
  // entry uses: `[label](command:foo)` and `[label](https://...)`.
  // Stays narrow on purpose — we control the source string in
  // package.json, so we don't need a full markdown parser.
  private renderWelcomeMarkdown(src: string): string {
    const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g;
    const paragraphs = src.split(/\n+/);
    const out = paragraphs.map((p) => {
      const escapedTextWithPlaceholders = this.escHtml(p);
      // Re-find link patterns in the ESCAPED text since escHtml
      // doesn't touch `[`, `]`, `(`, `)`.
      const withLinks = escapedTextWithPlaceholders.replace(linkRe, (_m, label, href) => {
        const safeHref = this.escAttr(href);
        const safeLabel = this.escHtml(label);
        return `<a href="${safeHref}">${safeLabel}</a>`;
      });
      return `<p>${withLinks}</p>`;
    });
    return out.join("\n");
  }

  // ----- Webview shell HTML -----

  // The host-side webview HTML only sets up the document chrome +
  // CSP + the empty <main> the client.js mounts into. Snapshot
  // messages drive all subsequent rendering — keeps the protocol
  // single-source-of-truth and avoids host/webview state divergence.
  private renderShell(): string {
    if (!this.view) return "";
    const webview = this.view.webview;
    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "session-sets-tree", "tree.css"),
    );
    const jsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "session-sets-tree", "client.js"),
    );
    // Set 060 S3: the Getting Started HTML builders live in their own
    // UMD-lite module (unit-testable from mocha). Loaded BEFORE
    // client.js so the `DabblerGettingStartedHtml` global exists when
    // client.js captures it.
    const gsHtmlUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "session-sets-tree", "gettingStartedHtml.js"),
    );
    const nonce = String(Math.floor(Math.random() * 1e16));
    // Set 034 + Set 036 S6: the per-row accordion that injected inline
    // SVG via innerHTML is gone. Only the tree shell (rows + bucket
    // headers + context menu) renders now, but the CSP keeps
    // `'unsafe-inline'` for style-src in case future shell content
    // re-introduces inline styles before the next CSP review.
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
  <title>Session Sets</title>
</head>
<body>
  <main id="root" role="presentation"></main>
  <script nonce="${nonce}" src="${gsHtmlUri}"></script>
  <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
  }

  // ----- Local escape helpers (welcome path; renderShell only) -----

  private escHtml(s: string): string {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  private escAttr(s: string): string {
    return this.escHtml(s).replace(/"/g, "&quot;");
  }
}

// Silence the unused-import warning for `isCurrentSessionInFlight`
// without removing it — kept as a re-export for any test that
// imports the predicate via this module path.
export { isCurrentSessionInFlight };
