// Mocha --require shim that registers a synchronous in-process stub for
// the `vscode` API surface used by the extension's source modules at
// import time. The full extension test harness (./runTests.ts) launches
// an electron VS Code that satisfies these symbols natively. When the
// electron harness is unavailable (Windows host without GUI Code.exe or
// CI without the test-electron sandbox flags), this stub lets the
// vscode-importing test files load and exercise their pure-logic
// assertions.
//
// Only the small subset actually touched at import / static call time
// is implemented. Tests that need real VS Code behavior (showing a
// dialog, registering a tree view) should run in the electron harness;
// tests that exercise data shape / sorting / context value can run
// here.

const Module = require("module");

const vscodeStub = {
  Uri: {
    file: (p) => ({ fsPath: p, scheme: "file", path: p }),
    joinPath: (uri, ...parts) => {
      const path = require("path");
      return { fsPath: path.join(uri.fsPath, ...parts), scheme: "file" };
    },
  },
  RelativePattern: class RelativePattern {
    constructor(base, pattern) { this.base = base; this.pattern = pattern; }
  },
  EventEmitter: class EventEmitter {
    constructor() { this._listeners = []; }
    get event() { return (l) => { this._listeners.push(l); return { dispose: () => {} }; }; }
    fire(arg) { for (const l of this._listeners) l(arg); }
    dispose() { this._listeners = []; }
  },
  TreeItem: class TreeItem {
    constructor(label, collapsibleState) {
      this.label = label;
      this.collapsibleState = collapsibleState;
    }
  },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  MarkdownString: class MarkdownString { constructor(s) { this.value = s; } },
  ThemeIcon: class ThemeIcon { constructor(id) { this.id = id; } },
  workspace: (() => {
    // Set 027 Session 3: e2e tree-provider tests mutate workspace
    // folders to point at fixture session sets, then build a
    // SessionSetsProvider and assert on `getChildren()`. Under
    // test-electron VS Code provides the real API; under the stub we
    // synthesize a minimal but behavior-correct version of
    // `updateWorkspaceFolders` so the same tests can run via
    // `mocha --require ts-node/register --require vscode-stub.js`
    // without launching Electron. The synchronous mutation +
    // listener-fire pattern matches what test-electron observes in
    // practice (the change is visible immediately after the call
    // returns).
    const folderListeners = [];
    const ws = {
      workspaceFolders: undefined,
      getConfiguration: () => ({ get: (_k, dflt) => dflt }),
      onDidChangeConfiguration: () => ({ dispose: () => {} }),
      onDidChangeWorkspaceFolders: (cb) => {
        folderListeners.push(cb);
        return {
          dispose: () => {
            const i = folderListeners.indexOf(cb);
            if (i >= 0) folderListeners.splice(i, 1);
          },
        };
      },
      updateWorkspaceFolders: (start, deleteCount, ...toAdd) => {
        // Verifier (Set 027 Session 3 Round C): emit normalized
        // WorkspaceFolder objects in `event.added` so consumers see
        // the same shape under the stub as under real VS Code (where
        // `event.added[i].name` and `.index` are populated). Fire
        // listeners asynchronously (queueMicrotask) to mirror real
        // VS Code's deferred event delivery — sync firing here hides
        // ordering bugs that would only reproduce under
        // @vscode/test-electron.
        const current = ws.workspaceFolders ? [...ws.workspaceFolders] : [];
        const normalized = toAdd.map((f, i) => ({
          uri: f.uri,
          name: f.name || (f.uri && f.uri.fsPath ? f.uri.fsPath : `folder-${i}`),
          index: start + i,
        }));
        const removed = current.splice(start, deleteCount, ...normalized);
        ws.workspaceFolders = current.length > 0 ? current : undefined;
        const event = { added: normalized, removed };
        const listenersSnapshot = [...folderListeners];
        queueMicrotask(() => {
          for (const l of listenersSnapshot) {
            try { l(event); } catch { /* swallow */ }
          }
        });
        return true;
      },
      createFileSystemWatcher: () => ({
        onDidCreate: () => ({ dispose: () => {} }),
        onDidDelete: () => ({ dispose: () => {} }),
        onDidChange: () => ({ dispose: () => {} }),
        dispose: () => {},
      }),
    };
    return ws;
  })(),
  window: {
    showInformationMessage: async () => undefined,
    showErrorMessage: async () => undefined,
    showInputBox: async () => undefined,
    showQuickPick: async () => undefined,
    createTreeView: () => ({ dispose: () => {} }),
    registerTreeDataProvider: () => ({ dispose: () => {} }),
  },
  commands: {
    registerCommand: () => ({ dispose: () => {} }),
    executeCommand: async () => undefined,
  },
};

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === "vscode") return "vscode-stub";
  return originalResolve.call(this, request, parent, ...rest);
};

require.cache["vscode-stub"] = {
  id: "vscode-stub",
  filename: "vscode-stub",
  loaded: true,
  exports: vscodeStub,
};
