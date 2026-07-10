// Typed message protocol between the extension host
// (CustomSessionSetsView in the extension process) and the webview
// client.js running inside the Session Sets webview. Per S4 audit
// GPT-5.4 M3: every render message carries a monotonic `version`
// field; the webview drops out-of-order messages so stale watcher
// ticks or polling backstops cannot repaint over fresh state.
//
// Layering:
//   - HostToWebview = host → webview (render + ui-only state changes)
//   - WebviewToHost = webview → host (activation + command requests)
//
// Snapshot messages (RowsSnapshot, ScanStateChanged) carry a
// monotonic version that the host increments on every fire. Narrow
// event messages (FocusMoved) do NOT carry a version — they're
// UI-only and never overwrite snapshot data.

// ----- Common -----

export type ScanState = "loading" | "ready";

// Row payload — what the webview needs to render one tree row.
// Derived from SessionSet + the SessionSetsModel helpers; the host
// runs the model functions once per snapshot and ships only the
// strings + flags the webview needs.
//
// Set 049 S4 (rip-out): Set 045's `harvestSignals` + `conflicts`
// fields are retired. The orchestrator-rendering surface in the
// Session Set Explorer reverts to its pre-Set-045 shape — no
// harvest-record badges (W / N / M / B), no coordination-conflict
// pills. Per Non-goal 2, the Python-side log-harvest infrastructure
// (joiner CLI + parsers) and the writer-bypass detector (D3) survive
// independently; only the Explorer rendering of those signals is
// removed here.
export interface RowPayload {
  slug: string;
  name: string;
  state: "in-progress" | "not-started" | "complete" | "cancelled";
  // Set 034: progress fraction moved out of `description` into its own
  // right-aligned bold colored list-icon column on the left side of
  // the row. Always non-empty when totalSessions > 0; may be "" only
  // when the set has no totalSessions on disk yet.
  fraction: string;                // e.g. "3/6", "0/4", "3/3", "2/3+" (Set 061 D1)
  // Set 061 Session 1 (spec D1): hover text for the fraction column.
  // Non-empty ONLY when the fraction carries the `+` suffix (a
  // Lightweight dedicated-sessions set whose typed verification
  // session has not been appended yet); explains why the denominator
  // can still grow. The webview sets it as the fraction span's
  // `title` attribute when present.
  fractionTooltip: string;
  description: string;             // remaining description after fraction extraction (e.g. "session 4 in flight  ·  2026-05-18")
  contextValue: string;            // for ActionRegistry membership tests (e.g., "sessionSet:in-progress:uat")
  iconSlug: string;                // "in-progress.svg" / "done.svg" / etc.
  needsMigration: boolean;
  // Set 050 S4 (Explorer UX revision): the unobtrusive asterisk that
  // replaces the old "(needs migration)" description label. `marker` is
  // "*" on sub-current sets (else ""); `tooltip` is the hover text
  // ("Ran under schema v<N>"). The webview renders the marker next to
  // the row name with the tooltip as its `title` attribute.
  migrationMarker: string;
  migrationTooltip: string;
  // Set 061 Session 1 (spec D2): the quiet "lw" marker + tooltip on
  // Lightweight rows (Set 050 asterisk pattern — de-emphasized
  // foreground, help cursor). Empty on Full rows (the default and the
  // majority; marking the exception keeps rows quiet).
  tierMarker: string;
  tierTooltip: string;
  // Set 061 Session 2 (spec D3): the quiet blocked-by-prerequisites
  // marker + tooltip that replace the Set 047 `[BLOCKED BY PREREQS]`
  // description badge. `blockedMarker` is a single theme-safe glyph on
  // blocked non-terminal rows (else ""); `blockedTooltip` names EACH
  // unsatisfied prerequisite with its current state ("unknown set —
  // check the slug" for unresolvable slugs). Same rendering pattern as
  // the migration / tier markers above.
  blockedMarker: string;
  blockedTooltip: string;
  // Set 062 Session 1 (spec D1): the quiet verification-posture marker
  // (`v?` on completed Mode-A Lightweight rows with no out-of-band
  // note; `v+` on Mode-B rows whose work is done but whose dedicated
  // verification is owed or in flight) + its state-specific tooltip.
  // Empty on every other row (no positive "verified" badge — absence
  // is the signal). Unlike the markers above, the webview wires a
  // click on this marker to the existing `showRowContextMenu` message
  // (the same QuickPick the row's right-click opens) — the marker is
  // an action surface, never a mutation path.
  verificationMarker: string;
  verificationTooltip: string;
  // Set 034: the per-row orchestrator-tracking accordion is retired.
  // These fields remain on the protocol so older host/webview pairings
  // stay structurally compatible, but the host always emits null and
  // the webview never renders an accordion body.
  accordionHtml: string | null;
  accordionUpdatedAt: string | null;
}

export interface BucketPayload {
  key: "in-progress" | "not-started" | "complete" | "cancelled";
  label: string;                   // "In Progress"
  count: number;
  rows: RowPayload[];
}

// Set 087 Session 2: one module group of the Explorer's module →
// status-bucket → row tier (recommendation §3.4/§5). `slug` is the
// docs/modules.yaml machine identity — `""` for the implicit module
// (sets with no validated `module:` attribution). `title` is the
// manifest display title — `""` for the implicit module, which is
// definitionally unlabeled; the webview applies a quiet fallback label
// only when labeled modules coexist (routed ruling Q1, saved raw at
// docs/session-sets/087-.../s2-explorer-render-architecture.json).
// `module` is a GROUPING attribute, never identity: `RowPayload.slug`,
// every action message, and `findSetBySlug` stay keyed on the
// globally-unique set name, unchanged on purpose.
export interface ModulePayload {
  slug: string;
  title: string;
  buckets: BucketPayload[];
}

// Set 060 Session 1: the three dual-mode surfaces the Session Set
// Explorer can render (spec D1/D5). "no-folder" → an "open or create a
// folder" CTA; "getting-started" → the interactive setup form; "list"
// → today's bucketed session-set list. This union is the host/webview
// contract, so it lives in the protocol; `selectExplorerMode` in
// `utils/gettingStartedDetection.ts` is its sole producer.
export type ExplorerMode = "no-folder" | "getting-started" | "list";

// Set 060 Session 1: drives the dual-mode Getting Started surface. The
// host computes `mode` from (folder open?, any sets?) and the three D3
// completion flags from the workspace root. The webview renders the
// surface for `mode`; the three booleans grey/check the form's steps
// (live state lives ONLY in the form, per D2). The flags are only
// meaningful in "getting-started" mode (in "list" mode the list shows
// instead; in "no-folder" mode there is no root to inspect).
export interface GettingStartedPayload {
  mode: ExplorerMode;
  structureBuilt: boolean;      // D3 step 1
  planPresent: boolean;         // D3 step 2
  sessionSetsPresent: boolean;  // D3 step 3
  // Set 060 Session 3 (spec D6): true iff at least one provider API key
  // (DABBLER_ANTHROPIC_API_KEY / DABBLER_OPENAI_API_KEY /
  // DABBLER_GEMINI_API_KEY) is present in
  // the extension host's environment. When false AND the form's tier
  // radio is on Full, the webview renders the "set a key + reload
  // window" warning under the Build button. Computed host-side from
  // `process.env` (which merges Windows System + User vars at launch).
  providerKeyPresent: boolean;
  // Set 077 Session 2 (Feature 1, A1): the workspace's durable tier
  // resolution — the `.dabbler/tier` marker first, then the
  // router-config inference (see utils/tierMarkerStore.ts) — or null
  // when the workspace carries no durable signal. The webview applies
  // it ONCE per script load, before the first form paint, so a webview
  // teardown/reload can never re-check the Full radio over a scaffolded
  // Lightweight choice. Only populated in "getting-started" mode (the
  // one mode that renders the form); null otherwise.
  tierSeed: "full" | "lightweight" | null;
  // Set 077 S2 (verification round 1, S077-S2-V1-001): the detection
  // root the seed (and the whole form) belongs to. The webview persists
  // it alongside gsState and discards persisted state whose root
  // differs, so form state from one repo can never bleed into another
  // when the same webview survives a root switch. Same gating as
  // tierSeed: populated only in "getting-started" mode.
  rootId: string | null;
  // Set 077 S3 (Feature 2): the durable verification-mode seed — the
  // `.dabbler/verification-mode` marker (no inference rung; absence is
  // null). Seeds the Lightweight-only verification-mode radios with the
  // same (rootId, seed) application semantics as tierSeed. Populated
  // only in "getting-started" mode.
  verificationModeSeed: "dedicated-sessions" | "out-of-band-or-none" | null;
  // Set 077 S3 (A10): the host's Python-presence probe — false when no
  // interpreter resolves (no explicit pythonPath setting, no workspace
  // venv, nothing usable on PATH). Drives the prominent step-1 warning;
  // tier-independent (Lightweight is router-off, not Python-off).
  // Probed only in "getting-started" mode (true elsewhere — the value
  // renders nowhere else, and true keeps the warning quiet).
  pythonPresent: boolean;
  // Set 079 S1 (Feature 1): the host's Copilot-CLI presence probe —
  // false when no `copilot` executable resolves (no explicit
  // copilotCliPath setting, nothing usable on PATH). Drives the step-1
  // Copilot-missing warning, which shows only while the Full-tier
  // Copilot seat sub-choice is selected. Probed only in
  // "getting-started" mode (true elsewhere — same quiet default as
  // pythonPresent).
  copilotCliPresent: boolean;
  // Set 079 S1 (Feature 1): the durable seat-profile seed for the
  // Full-tier sub-choice radios ("api" = direct provider keys, the
  // default; "copilot-cli" = Set 078's Copilot seat profile). Same
  // (rootId, seed) application semantics as tierSeed /
  // verificationModeSeed. Null until Session 2 wires the durable
  // source (the scaffold's transport.profile write); populated only in
  // "getting-started" mode.
  transportProfileSeed: "api" | "copilot-cli" | null;
}

export interface SnapshotPayload {
  // Set 087 Session 2: the module tier replaces the top-level bucket
  // list as the snapshot's single rendering source (routed ruling Q2 —
  // host and webview always ship together in one VSIX, so the
  // pre-087 `buckets: BucketPayload[]` field is REMOVED rather than
  // duplicated; a redundant copy would only invite divergence).
  // Ordering contract: manifest file order, implicit module last. A
  // no-manifest / all-implicit workspace ships exactly one implicit
  // ModulePayload (slug "", title "") whose buckets the webview renders
  // as today's two-level view, byte-identical (routed ruling Q4).
  modules: ModulePayload[];
  hasAnySets: boolean;
  // Set 060 Session 1: the dual-mode Getting Started state. Set 063 S2
  // (spec D2): REQUIRED — the field's pre-Set-060 optionality (and the
  // `welcomeHtml` fallback it gated) modeled hosts that no longer exist,
  // and leaving it optional kept a dead webview welcome branch revivable
  // by a host-side regression. `computeGettingStarted` is total (always
  // returns a mode), so the host can always populate it.
  gettingStarted: GettingStartedPayload;
}

// ----- Host → Webview -----

export interface RowsSnapshotMsg {
  type: "rowsSnapshot";
  version: number;                 // monotonic; webview drops older versions
  scanState: ScanState;
  payload: SnapshotPayload;
}

export interface ScanStateChangedMsg {
  type: "scanStateChanged";
  version: number;
  state: ScanState;
}

// Suppression-state echo: host tells webview which rows are currently
// suppressed (from workspaceState) so the initial paint matches.
export interface SuppressionEchoMsg {
  type: "suppressionEcho";
  version: number;
  suppressed: Record<string, string>;  // slug → accordion.updatedAt
}

// Set 048 S3 (spec §3.3, Bias 3 flip): the Set 034 cursor-anchored
// HTML popup is retired. The right-click context menu is rebuilt on
// `vscode.window.showQuickPick` (two-step submenu pattern); the
// `RenderContextMenuMsg` host→webview message and the
// `ExecuteRowCommandMsg` webview→host message were removed because
// the QuickPick lives entirely in the extension host.

export type HostToWebview =
  | RowsSnapshotMsg
  | ScanStateChangedMsg
  | SuppressionEchoMsg;

// ----- Webview → Host -----

// Generic command dispatch — webview asks host to run a registered
// vscode command. Used for all 14 row-context actions and the three
// indicator-action buttons (install-hook / set-orchestrator /
// open-writer-log). Host validates the commandId against an allowlist
// before calling executeCommand (defense-in-depth against a malicious
// webview).
export interface ExecuteCommandMsg {
  type: "executeCommand";
  commandId: string;
  args?: unknown[];
}

// Right-click / Shift+F10 / Context Menu key on a row → open
// QuickPick. Host computes applicable actions from ActionRegistry
// and shows the picker.
export interface ShowRowContextMenuMsg {
  type: "showRowContextMenu";
  slug: string;
}

// Operator manually collapsed / expanded a row. Host updates
// workspaceState (suppress / clear) and may re-fire a SuppressionEcho.
// `accordionUpdatedAt` carries the suppression-key value from the
// row's accordion (orchestrator.lastActivityAt) so suppression
// ages naturally when the orchestrator block changes.
export interface ToggleRowMsg {
  type: "toggleRow";
  slug: string;
  expanded: boolean;
  accordionUpdatedAt: string | null;
}

// Operator activated a row (Enter / Space / double-click). Defaults
// to openSpec per S4 step 3 (M3 primary-activation rule). Host can
// extend later (e.g., open accordion + spec in split view).
export interface ActivateRowMsg {
  type: "activateRow";
  slug: string;
}

// Webview is ready and wants the initial snapshot.
export interface ReadyMsg {
  type: "ready";
}

// Set 060 Session 2: the five Getting Started form actions. The webview
// posts one of these when the operator clicks a `data-gs-action` button;
// the host validates the action id against this closed set, runs the
// handler (see commands/gettingStartedActions.ts), and refreshes the
// snapshot so the form's live completion state repaints. This channel is
// separate from `executeCommand` on purpose — the actions carry typed
// form state (tier / parallel) rather than a command id, so the
// COMMAND_ALLOWLIST defense-in-depth contract is untouched.
export type GettingStartedActionId =
  | "open-folder"          // no-folder surface: showOpenDialog -> vscode.openFolder
  | "build-structure"      // step 1: no-prompt structure-only scaffold (D5)
  | "import-plan"          // step 2: file picker -> docs/planning/project-plan.md
  | "copy-plan-prompt"     // step 2 alt: copy the plan-authoring prompt
  | "new-module"           // step 2 opt (Set 087 S3): docs/modules.yaml entry + plan stub
  | "build-session-sets";  // step 3: copy the decomposition prompt (D4)

export interface GettingStartedActionMsg {
  type: "gettingStartedAction";
  action: GettingStartedActionId;
  // Form state riders. `tier` rides build-structure (the Full/Lightweight
  // radio) AND — since Set 060 S4 — build-session-sets, where it steers
  // the copied decomposition prompt's exemplars/guidance to the
  // operator's tier. `parallel` rides build-session-sets (the "create
  // parallel session sets where possible" checkbox, D7). All riders are
  // untrusted webview input — the host narrows them before use.
  tier?: "full" | "lightweight";
  parallel?: boolean;
  // Set 063 S2 (spec D1): the budget / NTE step's riders on
  // build-structure, Full tier only (the webview omits both on
  // Lightweight). `budgetUsd` is the validated dollar amount (>= 0);
  // `zeroBudgetMethod` is the operator's required zero-rule pick, sent
  // only when budgetUsd === 0. Host narrowing lives in
  // utils/budgetYaml.ts (asBudgetUsd / asZeroBudgetMethod).
  budgetUsd?: number;
  zeroBudgetMethod?: "manual-via-other-engine" | "skipped";
  // Set 077 S3 (Feature 2): the Lightweight verification-mode pick.
  // Rides build-structure (seeds the durable `.dabbler/verification-mode`
  // marker + the scaffold context) and build-session-sets (steers the
  // decomposition prompt's exemplar). The webview omits it on Full (the
  // field is inert there); untrusted — the host narrows before use.
  verificationMode?: "dedicated-sessions" | "out-of-band-or-none";
  // Set 079 S2 (Feature 1): the Full-tier seat-profile pick. Rides
  // build-structure only — on "copilot-cli" the host runs the guided
  // Copilot seat setup (catalog refresh + transport.profile write) after
  // the scaffold succeeds. The webview omits it on Lightweight (the
  // sub-choice block is not rendered there); untrusted — the host
  // narrows before use (absent defaults to "api", the seeded default).
  transportProfile?: "api" | "copilot-cli";
}

export type WebviewToHost =
  | ExecuteCommandMsg
  | ShowRowContextMenuMsg
  | ToggleRowMsg
  | ActivateRowMsg
  | ReadyMsg
  | GettingStartedActionMsg;
