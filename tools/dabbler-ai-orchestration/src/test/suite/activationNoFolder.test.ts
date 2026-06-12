// Set 059 — regression test for the operator-found 0.28.0 defect:
// `activate()` returned early when no workspace folder was open, leaving the
// webview view provider AND every command unregistered (Session Sets view
// hung; "Set up a new project" / "Get Started" silently no-op'd) in exactly
// the case those commands exist for. This test drives the REAL activate() with
// no folder and asserts the bootstrap surface still registers.

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
  let providerRegistered: boolean;
  let origRegisterCommand: typeof vscode.commands.registerCommand;
  let origRegisterProvider: typeof vscode.window.registerWebviewViewProvider;
  let origFolders: readonly vscode.WorkspaceFolder[] | undefined;
  let activated: vscode.ExtensionContext[];
  let capturedProvider: vscode.WebviewViewProvider | undefined;
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
    providerRegistered = false;
    activated = [];
    capturedProvider = undefined;
    executed = [];
    origRegisterCommand = vscode.commands.registerCommand;
    origRegisterProvider = vscode.window.registerWebviewViewProvider;
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
    (vscode.window as { registerWebviewViewProvider: unknown }).registerWebviewViewProvider =
      (_id: string, provider: vscode.WebviewViewProvider) => {
        providerRegistered = true;
        capturedProvider = provider;
        return { dispose() {} };
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
    (vscode.window as { registerWebviewViewProvider: unknown }).registerWebviewViewProvider =
      origRegisterProvider;
    (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = origFolders;
  });

  test("registers the Session Sets view provider even with no folder", () => {
    activateTracked();
    assert.ok(
      providerRegistered,
      "the webview view provider must register so the view does not hang",
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

  test("the registered view renders (no folder) instead of hanging", () => {
    activateTracked();
    assert.ok(capturedProvider, "provider should have been captured at registration");

    // Resolve the view the way VS Code would, with a minimal fake WebviewView,
    // and assert it produces real HTML synchronously — proving the empty-state
    // view renders rather than throwing / hanging when no folder is open.
    let html = "";
    const fakeWebviewView = {
      webview: {
        options: {},
        cspSource: "vscode-resource:",
        asWebviewUri: (u: vscode.Uri) => u,
        onDidReceiveMessage: () => ({ dispose() {} }),
        postMessage: () => Promise.resolve(true),
        set html(v: string) {
          html = v;
        },
        get html() {
          return html;
        },
      },
      onDidDispose: () => ({ dispose() {} }),
    } as unknown as vscode.WebviewView;

    assert.doesNotThrow(() =>
      capturedProvider!.resolveWebviewView(
        fakeWebviewView,
        {} as vscode.WebviewViewResolveContext,
        {} as vscode.CancellationToken,
      ),
    );
    assert.ok(html.includes("<!DOCTYPE html"), "the view must render an HTML shell, not hang");
  });

  test("does NOT auto-open the Get Started wizard in a fresh no-folder window", () => {
    activateTracked();
    // Onboarding auto-`getStarted` is reserved for an opened workspace; in a
    // bare no-folder window it must stay quiet (workspaceState does not persist
    // there, so otherwise it would pop on every launch). The view's Getting
    // Started surface and the Command Palette remain the entry points.
    assert.ok(
      !executed.includes("dabbler.getStarted"),
      `onboarding should not auto-fire getStarted with no folder; executed: ${executed.join(", ")}`,
    );
  });
});
