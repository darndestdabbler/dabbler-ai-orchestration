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

/** Everything listening for a theme change, so `__setColorTheme` can fire. */
const themeListeners = [];

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
  // Set 077 S1: ConfigEditorPanel.createOrShow reads ViewColumn.One at
  // call time; without the enum the panel-lifecycle test dies on a
  // TypeError before reaching its assertions.
  ViewColumn: { One: 1, Two: 2, Three: 3, Active: -1, Beside: -2 },
  // Set 079 S2: the Copilot seat-setup progress wrapper reads
  // ProgressLocation and constructs vscode.Disposable teardown hooks.
  ProgressLocation: { SourceControl: 1, Window: 10, Notification: 15 },
  StatusBarAlignment: { Left: 1, Right: 2 },
  Disposable: class Disposable {
    constructor(fn) { this._fn = fn; this._disposed = false; }
    dispose() {
      if (this._disposed) return;
      this._disposed = true;
      if (typeof this._fn === "function") this._fn();
    }
  },
  CancellationTokenSource: class CancellationTokenSource {
    constructor() {
      const listeners = [];
      this.token = {
        isCancellationRequested: false,
        onCancellationRequested: (cb) => {
          listeners.push(cb);
          return { dispose: () => {} };
        },
      };
      this._listeners = listeners;
    }
    cancel() {
      this.token.isCancellationRequested = true;
      for (const cb of this._listeners) cb();
    }
    dispose() {}
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
  // The editor's own numbering: 1 light, 2 dark, 3 high-contrast (dark),
  // 4 high-contrast light.
  ColorThemeKind: { Light: 1, Dark: 2, HighContrast: 3, HighContrastLight: 4 },
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
    // A few suites need an operator-set value. Keyed `<section>.<key>`;
    // empty by default, so every existing test still sees a workspace with
    // no operator-set values.
    const configOverrides = new Map();
    const ws = {
      workspaceFolders: undefined,
      getConfiguration: (section) => ({
        get: (k, dflt) => {
          const key = `${section}.${k}`;
          return configOverrides.has(key) ? configOverrides.get(key) : dflt;
        },
        // Set 079 S2: the copilotCliPath reader distinguishes "operator
        // set it" from "default fired" via inspect(); the stub models a
        // workspace with no operator-set values unless one is set below.
        inspect: (k) => {
          const key = `${section}.${k}`;
          return configOverrides.has(key)
            ? { globalValue: configOverrides.get(key) }
            : undefined;
        },
      }),
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
      // Set 122 S2: test-only hooks for the override map above. Not part
      // of the VS Code API — named with the stub's `__` prefix convention
      // so a production import of one is obvious on sight.
      __setConfig: (section, key, value) =>
        configOverrides.set(`${section}.${key}`, value),
      __clearConfig: () => configOverrides.clear(),
    };
    return ws;
  })(),
  window: {
    showInformationMessage: async () => undefined,
    showErrorMessage: async () => undefined,
    showWarningMessage: async () => undefined,
    showInputBox: async () => undefined,
    showQuickPick: async () => undefined,
    // Set 079 S2: runs the task immediately with a no-op progress and a
    // never-cancelled token — the seat-setup wrapper's default UI path.
    withProgress: (_opts, task) =>
      task(
        { report: () => {} },
        {
          isCancellationRequested: false,
          onCancellationRequested: () => ({ dispose: () => {} }),
        },
      ),
    createTreeView: () => ({ dispose: () => {} }),
    // Session 62: Start opens the person's own CLI in a terminal rather
    // than spawning a driver, so what the editor was ASKED to open is the
    // behaviour -- the shell path, its arguments, the directory, and
    // anything typed at its prompt without being sent.
    createTerminal: (options) => {
      const terminal = {
        options,
        // A Pseudoterminal terminal is opened by the editor, which is what
        // starts the pty. The stub does the same so a test drives the real
        // lifecycle rather than poking at internals.
        pty: options && options.pty,
        shown: 0,
        // Counted because "the one it replaced is gone" is a behaviour: a
        // terminal that cannot be moved has to be disposed to be replaced,
        // and one left behind would accumulate per session.
        disposed: 0,
        sent: [],
        show: () => {
          terminal.shown += 1;
        },
        sendText: (text, addNewLine) => terminal.sent.push({ text, addNewLine }),
        dispose: () => {
          terminal.disposed += 1;
          if (terminal.pty && terminal.pty.close) terminal.pty.close();
        },
      };
      if (terminal.pty && terminal.pty.open) terminal.pty.open();
      vscodeStub.window.__terminals.push(terminal);
      return terminal;
    },
    /** Every terminal created, in order. Test-only, hence the `__` prefix. */
    __terminals: [],
    // Session 62: the Dabbler terminal paints its band from the editor's
    // theme kind and re-reads it when the theme changes, so both the value
    // and the event have to exist here.
    activeColorTheme: { kind: 2 },
    onDidChangeActiveColorTheme: (listener) => {
      themeListeners.push(listener);
      return {
        dispose: () => {
          const at = themeListeners.indexOf(listener);
          if (at >= 0) themeListeners.splice(at, 1);
        },
      };
    },
    /** Switch the theme and notify, as the editor would. Test-only. */
    __setColorTheme: (kind) => {
      vscodeStub.window.activeColorTheme = { kind };
      for (const listener of [...themeListeners]) listener({ kind });
    },
    createStatusBarItem: () => ({
      text: "",
      tooltip: "",
      command: undefined,
      show: () => {},
      hide: () => {},
      dispose: () => {},
    }),
    registerTreeDataProvider: () => ({ dispose: () => {} }),
    // Set 122 S2: the router-CLI launcher echoes every command it runs to a
    // shared output channel BEFORE spawning. The channel is created lazily
    // on first use, so any flow that shells out to the router reaches this.
    // Lines are retained on the fake so a test can assert what was echoed.
    // The second argument is a language id (a grammar to colour the channel
    // by) or `{ log: true }`. Only the string form is recorded: a test that
    // asserts the id has to be able to tell "created plain" from "created
    // under a language", and `{ log: true }` is neither.
    createOutputChannel: (name, languageIdOrOptions) => {
      const lines = [];
      return {
        name,
        languageId:
          typeof languageIdOrOptions === "string" ? languageIdOrOptions : undefined,
        lines,
        appendLine: (line) => lines.push(line),
        append: (text) => lines.push(text),
        show: () => {},
        hide: () => {},
        clear: () => {
          lines.length = 0;
        },
        replace: () => {},
        dispose: () => {},
      };
    },
    // Set 059: the extension registers its Session Sets surface as a webview
    // VIEW (registerWebviewViewProvider), not a TreeDataProvider. The
    // activation regression test (activationNoFolder.test.ts) drives the real
    // activate() to prove commands + the view provider register even with no
    // workspace folder open; without this symbol activate() would throw before
    // reaching the command registrations.
    registerWebviewViewProvider: () => ({ dispose: () => {} }),
    // Set 077 S1: minimal WebviewPanel fake for the ConfigEditorPanel
    // lifecycle test — settable webview.html, message/dispose hooks, and
    // a dispose() that fires onDidDispose so currentPanel clears.
    createWebviewPanel: () => {
      const disposeHandlers = [];
      return {
        webview: {
          html: "",
          cspSource: "vscode-resource:",
          onDidReceiveMessage: () => ({ dispose: () => {} }),
          postMessage: async () => true,
          asWebviewUri: (uri) => uri,
        },
        reveal: () => {},
        onDidDispose: (fn) => {
          disposeHandlers.push(fn);
          return { dispose: () => {} };
        },
        dispose: () => { for (const fn of disposeHandlers) fn(); },
      };
    },
  },
  commands: {
    registerCommand: () => ({ dispose: () => {} }),
    executeCommand: async () => undefined,
  },
  extensions: {
    // Set 029 Session 5 — detectOrchestrators imports vscode.extensions
    // at module load. Tests that want to simulate a present/absent
    // extension can mutate `__installedExtensions` before requiring
    // the module under test; the default empty set models "no
    // orchestrator extensions installed".
    __installedExtensions: new Set(),
    getExtension(id) {
      return this.__installedExtensions.has(id) ? { id } : undefined;
    },
  },
  env: {
    clipboard: { writeText: async () => undefined },
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
