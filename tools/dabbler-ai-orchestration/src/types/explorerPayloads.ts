// The row / bucket / module payload shapes the Work Explorer renders.
//
// Set 123 S3: this file was `sessionSetsWebviewProtocol.ts`, the typed
// message protocol between the extension host and the Session Sets webview
// client. That webview is deleted -- the Work Explorer is a native
// `TreeView` and setup now resolves in the terminal via
// `python -m ai_router.verify_type` -- so every message type went with it:
// `HostToWebview`, `WebviewToHost`, `RowsSnapshotMsg`, `ScanStateChangedMsg`,
// `SnapshotPayload`, `GettingStartedPayload`, `SystemStatusPayload`,
// `GettingStartedActionMsg`, `ManifestFaultPayload` and the `ScanState`
// rider. Nothing posts a message anywhere any more.
//
// What survives is the part that was never about a webview: the pure
// row/bucket/module payload shapes `providers/SessionSetsModel.ts` builds
// and `providers/workExplorerTreeModel.ts` consumes. They are kept as an
// intermediate representation on purpose -- the model stays VS Code-free and
// unit-testable, and the tree provider turns these into `TreeItem`s.
//
// The file is RENAMED rather than left in place with a stale name: a module
// called "WebviewProtocol" in an extension with no webview is exactly the
// stale echo the repo's consistency rule exists to prevent.

// Row payload — what the tree needs to render one set row.
// Derived from SessionSet + the SessionSetsModel helpers; the tree
// provider runs the model functions once per recompute and reads only
// the strings + flags a `TreeItem` can carry.
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
  fraction: string;                // e.g. "3/6", "0/4", "3/3"
  description: string;             // remaining description after fraction extraction (e.g. "session 4 in flight  ·  2026-05-18")
  contextValue: string;            // for ActionRegistry membership tests (e.g., "sessionSet:in-progress:uat")
  iconSlug: string;                // "in-progress.svg" / "done.svg" / etc.
  needsMigration: boolean;
  // Set 050 S4 (Explorer UX revision): the unobtrusive asterisk that
  // replaces the old "(needs migration)" description label. `marker` is
  // "*" on sub-current sets (else ""); `tooltip` is the hover text
  // ("Ran under schema v<N>"). The tree renders the marker next to
  // the row name with the tooltip on the `TreeItem`.
  migrationMarker: string;
  migrationTooltip: string;
  // Set 061 Session 2 (spec D3): the quiet blocked-by-prerequisites
  // marker + tooltip that replace the Set 047 `[BLOCKED BY PREREQS]`
  // description badge. `blockedMarker` is a single theme-safe glyph on
  // blocked non-terminal rows (else ""); `blockedTooltip` names EACH
  // unsatisfied prerequisite with its current state ("unknown set —
  // check the slug" for unresolvable slugs). Same rendering pattern as
  // the migration marker above.
  blockedMarker: string;
  blockedTooltip: string;
  // Set 092 Session 1: the one winner retained for a duplicate global
  // session-set name fails loud in the tree. Empty strings keep the
  // unique-name path visually unchanged.
  duplicateNameBadge: string;
  duplicateNameTooltip: string;
  // Set 100 Session 1: the kind-aware row badge (verdict: "a
  // `kind: plan|decomposition` set row gets a small distinguishing
  // icon/badge and keeps normal row behavior — no new node types, no
  // new states, presentation only"). `kindBadge` is the validated
  // `SessionSet.kind` value verbatim ("plan" / "decomposition") or ""
  // on every ordinary work set — the same empty-means-absent contract
  // as the markers above; `kindTooltip` explains what the lifecycle
  // set is for. The tree renders a quiet chip after the row name.
  kindBadge: string;
  kindTooltip: string;
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
// definitionally unlabeled; the tree applies a quiet fallback label
// only when labeled modules coexist (routed ruling Q1, saved raw at
// docs/session-sets/087-.../s2-explorer-render-architecture.json).
// `module` is a GROUPING attribute, never identity: `RowPayload.slug`,
// every action message, and `findSetBySlug` stay keyed on the
// globally-unique set name, unchanged on purpose.
export interface ModulePayload {
  slug: string;
  title: string;
  // Set 092 Session 1: semantic renderer inputs from computeVisibleModules.
  // Optional only for compatibility with pre-092 fixture payloads.
  kind?: "declared" | "fallback" | "pseudo";
  warning?:
    | { code: "manifest-missing" }
    | { code: "manifest-invalid" }
    | { code: "unstamped-sets" }
    | { code: "undeclared-slug"; rawSlug: string }
    | null;
  // Set 100 Session 1: the 093-era `plan` / `sessionSets` child-state
  // fields are RETIRED with the persistent `Plan` / `Session sets`
  // semantic child nodes they drove — with plan and decomposition living
  // as kind-typed session sets (Set 098), the checklist IS the bucket
  // content, so the status buckets nest directly under the module row
  // (module aria-level 1, bucket 2, row 3). The `blocked-until-plan`
  // state retired with them: the scaffolded decomposition set's
  // prerequisite blocked-marker (existing Set 061 machinery, pre-linked
  // by Set 098's template) carries that signal on the row itself. The
  // never-hide-work guarantee now rests entirely on the tree model's
  // TERMINAL row-rendering gate (the bucket's emptiness is decided from
  // the actual rows array, never the display count).
  buckets: BucketPayload[];
}
