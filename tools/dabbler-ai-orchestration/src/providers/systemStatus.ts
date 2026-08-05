// Set 110 Session 3 — the System Status payload, extracted from
// `CustomSessionSetsView.buildSystemStatus` so that BOTH the webview that
// renders it and the extension host that decides whether that webview should
// exist at all can compute it from one implementation.
//
// Why the host needs it. After this session the setup/status webview is
// contributed with a `when` clause, so it appears only when it has something
// to say — a repo with sets and a healthy environment gets its full panel
// height back for the tree, which is the operator's standing complaint about
// this Explorer. But a view hidden by a `when` clause is never RESOLVED, so
// its own provider cannot be what decides whether it should appear. The
// decision has to be made outside it, which is what this module is for.
//
// The obvious way to do that would have been to re-implement the fault rules
// in TypeScript. This repo has a written convention against exactly that
// shape (`project-guidance.md`: a validator mirroring a schema must hold
// parity in both directions, and the two drift apart silently). So the rules
// are NOT reimplemented: the host loads the very same
// `media/session-sets-tree/systemStatusHtml.js` the webview loads, and asks
// it whether it would render anything. One source of truth, no parity test
// needed, because there is only one implementation.
//
// The load is a runtime `createRequire` against the extension's own install
// directory rather than a bundled import, deliberately: `media/` already
// ships in the .vsix (the webview references it), esbuild never sees the
// path, and there is exactly one copy of the rules on disk.

import { createRequire } from "module";
import * as path from "path";
import * as vscode from "vscode";
import { SystemStatusPayload } from "../types/sessionSetsWebviewProtocol";
import { detectCompletion, nodeDetectionFs, providerKeyPresent } from "../utils/gettingStartedDetection";
import { probePythonPresence } from "../utils/pythonInterpreter";
import { probeCopilotCliPresence } from "../utils/copilotCli";
import {
  deriveCopilotSeatChosenUnconfirmed,
  readCopilotSeatStatusMarker,
  readTransportProfile,
  rerunRefreshHint,
} from "../utils/copilotSeatSetup";
import { resolveDurableTier } from "../utils/tierMarkerStore";

/**
 * Build the status payload for the first workspace folder.
 *
 * `manifestFaults` is deliberately NOT a parameter any more. Set 110 S3 moved
 * the invalid-manifest diagnostic to `TreeView.message`, which sits directly
 * above the stale tree it explains; carrying it here as well would have been
 * two renderings of one fault, which then need to agree. The strip's subject
 * is the ENVIRONMENT — Python, provider keys, the Copilot CLI — not
 * repository content.
 */
export function buildSystemStatus(hasAnySets: boolean): SystemStatusPayload {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) {
    // No folder open: every probe is vacuously fine, and the Getting Started
    // surface's own no-folder call-to-action is what the operator needs.
    return {
      workspaceOpen: false,
      workspaceInitialized: true,
      providerKeyPresent: true,
      pythonPresent: true,
      copilotCliPresent: true,
      tier: "full",
      transportProfile: "api",
      copilotSeatChosenUnconfirmed: false,
      copilotSeatRerunHint: "",
      manifestFaults: [],
    };
  }
  // Set 097 (spec D1): read the durable transport profile ONCE and reuse it
  // for both the payload field and the unconfirmed-seat derivation.
  const durableTransportProfile = readTransportProfile(root);
  return {
    workspaceOpen: true,
    // Set 092 S2 (UAT Walk 4): a workspace that already has session sets is
    // initialized by construction — the sets could not have been authored
    // without a working setup — so `hasAnySets` alone clears the fault. The
    // `structureBuilt` scaffold proxy is only consulted before the first set,
    // where it is the right signal; it under-reports an editable
    // `pip install -e .` (this repo), and that false negative must never
    // surface a workspace-init fault on a working repo.
    workspaceInitialized:
      hasAnySets || detectCompletion(root, nodeDetectionFs).structureBuilt,
    providerKeyPresent: providerKeyPresent(process.env),
    pythonPresent: probePythonPresence(root),
    copilotCliPresent: probeCopilotCliPresence(root),
    tier: resolveDurableTier(root)?.tier ?? "full",
    transportProfile: durableTransportProfile ?? "api",
    copilotSeatChosenUnconfirmed: deriveCopilotSeatChosenUnconfirmed(
      readCopilotSeatStatusMarker(root),
      durableTransportProfile,
    ),
    copilotSeatRerunHint: rerunRefreshHint(),
    manifestFaults: [],
  };
}

type StatusRenderer = {
  renderSystemStatus(status: unknown, controls: unknown): string;
};

let cachedRenderer: StatusRenderer | null | undefined;

/**
 * Load the webview's own status renderer into the host process.
 *
 * Returns `null` if it cannot be loaded — a packaging fault, not an operator
 * fault. Callers treat that as "assume setup is needed", so the pane appears
 * and the operator can see the surface rather than silently losing it. Fail
 * toward VISIBLE: the whole point of the gate is that a fault is never
 * invisible.
 */
function statusRenderer(extensionPath: string): StatusRenderer | null {
  if (cachedRenderer !== undefined) return cachedRenderer;
  try {
    const requireFromExtension = createRequire(
      path.join(extensionPath, "package.json"),
    );
    cachedRenderer = requireFromExtension(
      "./media/session-sets-tree/systemStatusHtml.js",
    ) as StatusRenderer;
  } catch (err) {
    console.warn(
      "[dabbler-ai-orchestration] could not load systemStatusHtml.js in the host; " +
        "the Setup & Status view will be shown unconditionally.",
      err,
    );
    cachedRenderer = null;
  }
  return cachedRenderer;
}

/** Test seam: drop the memoised renderer so a fixture can re-resolve it. */
export function resetStatusRendererCache(): void {
  cachedRenderer = undefined;
}

/**
 * Whether the setup/status view has anything to say.
 *
 * True when there is no folder open (the no-folder call-to-action), when the
 * workspace has no session sets yet (the Getting Started form), or when the
 * environment has at least one fault.
 *
 * The fault question is answered by asking the real renderer whether it would
 * emit anything, using the DURABLE tier/profile — which is exactly what the
 * webview passes in list mode. The webview's other mode passes live form
 * state instead, but that mode only ever runs when there are no sets, where
 * this function has already returned true, so the live-state path can never
 * change the answer.
 */
export function isSetupNeeded(
  extensionPath: string,
  hasAnySets: boolean,
): boolean {
  const status = buildSystemStatus(hasAnySets);
  if (!status.workspaceOpen) return true;
  if (!hasAnySets) return true;
  const renderer = statusRenderer(extensionPath);
  if (!renderer) return true;
  try {
    return (
      renderer.renderSystemStatus(status, {
        tier: status.tier,
        transportProfile: status.transportProfile,
      }) !== ""
    );
  } catch (err) {
    console.warn(
      "[dabbler-ai-orchestration] systemStatusHtml.renderSystemStatus threw in the host; " +
        "showing the Setup & Status view.",
      err,
    );
    return true;
  }
}
