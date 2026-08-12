// Set 059 — regression test for the operator-found 0.28.0 defect:
// `activate()` returned early when no workspace folder was open, leaving the
// view provider AND every command unregistered (the Dabbler view
// hung; "Set up a new project" / "Get Started" silently no-op'd) in exactly
// the case those commands exist for. This test drives the REAL activate() with
// no folder and asserts the bootstrap surface still registers.
//
// Set 123 S3: the surface that must survive a folder-less activation is the
// native `TreeView` — the webview this file used to capture is deleted. The
// regression is unchanged in substance (activation must not bail early), so
// the assertions follow the surface rather than retiring with it: a tree that
// is never created hangs exactly like a webview provider that never
// registered, and `getChildren` must answer rather than throw when there is
// no folder to scan.

import * as assert from "assert";
import * as path from "path";
import * as vscode from "vscode";
import { activate } from "../../extension";

const EXT_ROOT = path.resolve(__dirname, "../../..");

/** Minimal ExtensionContext sufficient for activate() under the stub. */
function fakeContext(): vscode.ExtensionContext {
  const ws = new Map<string, unknown>();
  return {
    subscriptions: [],
    extensionPath: EXT_ROOT,
    extensionUri: vscode.Uri.file(EXT_ROOT),
    workspaceState: {
      get: (k: string, d?: unknown) => (ws.has(k) ? ws.get(k) : d),
      update: (k: string, v: unknown) => {
        ws.set(k, v);
        return Promise.resolve();
      },
      keys: () => [...ws.keys()],
    },
  } as unknown as vscode.ExtensionContext;
}

suite("activation — no workspace folder open (Set 059 regression)", () => {
  let registered: string[];
  let treeCreated: boolean;
  let origRegisterCommand: typeof vscode.commands.registerCommand;
  let origCreateTreeView: typeof vscode.window.createTreeView;
  let origFolders: readonly vscode.WorkspaceFolder[] | undefined;
  let activated: vscode.ExtensionContext[];
  let capturedTreeProvider: vscode.TreeDataProvider<unknown> | undefined;
  let executed: string[];
  let origExecuteCommand: typeof vscode.commands.executeCommand;

  /** Activate and remember the context so teardown can dispose it. */
  function activateTracked(): vscode.ExtensionContext {
    const ctx = fakeContext();
    activated.push(ctx);
    activate(ctx);
    return ctx;
  }

  setup(() => {
    registered = [];
    treeCreated = false;
    activated = [];
    capturedTreeProvider = undefined;
    executed = [];
    origRegisterCommand = vscode.commands.registerCommand;
    origCreateTreeView = vscode.window.createTreeView;
    origExecuteCommand = vscode.commands.executeCommand;
    origFolders = vscode.workspace.workspaceFolders;

    // The defect's trigger condition: NO folder open.
    (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = undefined;
    (vscode.commands as { registerCommand: unknown }).registerCommand = (
      id: string,
    ) => {
      registered.push(id);
      return { dispose() {} };
    };
    (vscode.window as { createTreeView: unknown }).createTreeView = (
      _id: string,
      opts: { treeDataProvider: vscode.TreeDataProvider<unknown> },
    ) => {
      treeCreated = true;
      capturedTreeProvider = opts.treeDataProvider;
      return { dispose() {}, message: "" };
    };
    (vscode.commands as { executeCommand: unknown }).executeCommand = (cmd: string) => {
      executed.push(cmd);
      return Promise.resolve(undefined);
    };
  });

  teardown(() => {
    (vscode.commands as { executeCommand: unknown }).executeCommand = origExecuteCommand;
    // Dispose every subscription activate() pushed — critically this clears
    // the 30s poll setInterval, so the test process's event loop drains and
    // mocha can exit instead of hanging on the live timer.
    for (const ctx of activated) {
      for (const sub of ctx.subscriptions) {
        try {
          sub.dispose();
        } catch {
          /* best-effort cleanup */
        }
      }
    }
    (vscode.commands as { registerCommand: unknown }).registerCommand = origRegisterCommand;
    (vscode.window as { createTreeView: unknown }).createTreeView = origCreateTreeView;
    (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = origFolders;
  });

  test("creates the Work Explorer tree even with no folder", () => {
    activateTracked();
    assert.ok(
      treeCreated,
      "the tree view must be created so the Dabbler view does not hang",
    );
  });

  test("registers the bootstrap commands (setup + get-started) with no folder", () => {
    activateTracked();
    assert.ok(
      registered.includes("dabbler.setupNewProject"),
      "dabbler.setupNewProject must register so 'Set up a new project' works from a fresh window",
    );
    assert.ok(
      registered.includes("dabbler.getStarted"),
      "dabbler.getStarted must register so the wizard opens from a fresh window",
    );
  });

  test("registers a broad command surface (activation did not bail early)", () => {
    activateTracked();
    // A spot-check that activation reached the feature-command block rather
    // than returning early — the exact failure mode of the 0.28.0 defect.
    assert.ok(
      registered.length >= 10,
      `expected many commands registered, got ${registered.length}: ${registered.join(", ")}`,
    );
  });

  test("the created tree serves roots (no folder) instead of hanging", async () => {
    activateTracked();
    assert.ok(capturedTreeProvider, "provider should have been captured at createTreeView");

    // Ask for roots the way VS Code would. With no folder there is nothing to
    // scan, so the correct answer is an EMPTY list — the failure this guards
    // is a throw or a hang, either of which leaves the view spinning forever.
    const roots = await capturedTreeProvider!.getChildren(undefined);
    assert.ok(Array.isArray(roots), "getChildren must return a list, not throw");
  });

  test("does NOT auto-open the Get Started doc in a fresh no-folder window", () => {
    activateTracked();
    // Onboarding auto-`getStarted` is reserved for an opened workspace; in a
    // bare no-folder window it must stay quiet (workspaceState does not persist
    // there, so otherwise it would pop on every launch). The Command Palette
    // remains the entry point.
    assert.ok(
      !executed.includes("dabbler.getStarted"),
      `onboarding should not auto-fire getStarted with no folder; executed: ${executed.join(", ")}`,
    );
  });
});
