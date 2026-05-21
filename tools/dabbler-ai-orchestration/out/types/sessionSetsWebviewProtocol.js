"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
//# sourceMappingURL=sessionSetsWebviewProtocol.js.map