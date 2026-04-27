// Dabbler Platform Session Sets — VS Code tree-view extension.
//
// Reads docs/session-sets/<slug>/{spec.md, session-state.json,
// activity-log.json, change-log.md, <slug>-uat-checklist.json} and
// renders a three-group tree: In Progress, Not Started, Done. State is
// derived from file presence, mirroring ai_router.find_active_session_set
// and ai_router.print_session_set_status. session-state.json is the
// earliest in-progress signal — written at the start of session 1
// (before any activity-log entry exists), so a freshly-started set
// shows as in-progress without waiting for the first commit.
//
// Platform-specific hardening (vs. the original harvester extension):
//   - Reads the Session Set Configuration block from spec.md
//     (`requiresUAT`, `requiresE2E`) and gates UAT/E2E features on
//     those flags. Sets that don't declare them behave like the
//     minimal harvester-style entry.
//   - For sets with requiresUAT: true, parses
//     `<slug>-uat-checklist.json` (best-effort), shows pending UAT
//     count in the tooltip, and shows a [UAT n] badge in the
//     description when pending > 0.
//   - Adds an "Open UAT Checklist" right-click command for UAT-bearing
//     sets.
//   - Adds a "Reveal Playwright Tests for This Set" command for sets
//     with requiresE2E: true. Searches tests/AcmeCoffeeOnline.Playwright
//     for files matching the slug or any E2ETestReference values from
//     the checklist.
//   - Adds a "Copy: Start next session — maxout Claude" trigger phrase
//     command for token-window override scenarios.
//
// Worktree auto-discovery: for every workspace folder that is a git repo,
// the extension also scans the `docs/session-sets/` tree of every other
// worktree of that repo (via `git worktree list --porcelain`). Multi-root
// precedence: when the same slug exists in multiple roots, the higher-
// state entry wins (done > in-progress > not-started); ties break on
// most-recent `lastTouched`.

const vscode = require("vscode");
const cp = require("child_process");
const fs = require("fs");
const path = require("path");

const SESSION_SETS_REL = path.join("docs", "session-sets");
// PLAYWRIGHT_REL is read from settings at call time; this fallback is
// used when the setting is absent or empty.
const PLAYWRIGHT_REL_DEFAULT = "tests";

function workspaceFolders() {
  return vscode.workspace.workspaceFolders || [];
}

function listGitWorktrees(cwd) {
  let out;
  try {
    out = cp.execFileSync("git", ["worktree", "list", "--porcelain"], {
      cwd,
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 1024 * 1024,
      timeout: 5000,
    });
  } catch (_) {
    return [];
  }
  const paths = [];
  for (const line of out.split(/\r?\n/)) {
    if (line.startsWith("worktree ")) {
      const wt = line.slice("worktree ".length).trim();
      if (wt) paths.push(path.resolve(wt));
    }
  }
  return paths;
}

function discoverRoots() {
  const seen = new Map();
  const order = [];
  const add = (p) => {
    if (!p) return;
    const canonical = path.resolve(p);
    const key = canonical.toLowerCase();
    if (seen.has(key)) return;
    if (!fs.existsSync(canonical)) return;
    seen.set(key, canonical);
    order.push(canonical);
  };
  for (const folder of workspaceFolders()) {
    add(folder.uri.fsPath);
  }
  for (const folder of workspaceFolders()) {
    for (const wt of listGitWorktrees(folder.uri.fsPath)) {
      add(wt);
    }
  }
  return order;
}

// Parse the Session Set Configuration block from a spec.md.
// Tolerant: returns { requiresUAT, requiresE2E, uatScope } with safe
// defaults (all falsy) when the block is missing or malformed.
function parseSessionSetConfig(specPath) {
  const config = {
    requiresUAT: false,
    requiresE2E: false,
    uatScope: "none",
  };
  if (!fs.existsSync(specPath)) return config;
  let text;
  try {
    text = fs.readFileSync(specPath, "utf8");
  } catch (_) {
    return config;
  }

  // Match a fenced yaml block under a "Session Set Configuration"
  // heading. Falls back to scanning a plain key:value block within the
  // first ~120 lines of the spec.
  const headingMatch = text.match(
    /##\s*Session Set Configuration[\s\S]*?```ya?ml\s*([\s\S]*?)```/i,
  );
  const block = headingMatch ? headingMatch[1] : text.slice(0, 4000);

  const flagRe = (key) =>
    new RegExp(`^\\s*${key}\\s*:\\s*(true|false)\\s*$`, "im");
  const stringRe = (key) =>
    new RegExp(`^\\s*${key}\\s*:\\s*([\\w-]+)\\s*$`, "im");

  const uat = block.match(flagRe("requiresUAT"));
  if (uat) config.requiresUAT = uat[1].toLowerCase() === "true";
  const e2e = block.match(flagRe("requiresE2E"));
  if (e2e) config.requiresE2E = e2e[1].toLowerCase() === "true";
  const scope = block.match(stringRe("uatScope"));
  if (scope) config.uatScope = scope[1];

  return config;
}

// Best-effort parse of <slug>-uat-checklist.json. Returns
// { totalItems, pendingItems, e2eRefs[] } or null if unreadable.
function parseUatChecklist(checklistPath) {
  if (!fs.existsSync(checklistPath)) return null;
  let data;
  try {
    data = JSON.parse(fs.readFileSync(checklistPath, "utf8"));
  } catch (_) {
    return null;
  }
  // Schema is checklist-editor-shaped. Walk leniently.
  const items = [];
  const collect = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const v of node) collect(v);
      return;
    }
    // Treat any object with a "Result" / "Verifications" / "Steps" as
    // a checklist item or container. The checklist-editor schema
    // distinguishes Sections (containers) from Items (leaves with a
    // Result field) — we match leaves.
    if (node.Result !== undefined || node.result !== undefined) {
      items.push(node);
    }
    for (const v of Object.values(node)) collect(v);
  };
  collect(data);

  const e2eRefs = new Set();
  let pending = 0;
  for (const it of items) {
    const r = it.Result ?? it.result ?? "";
    if (r === "" || r === null || /^pending$/i.test(String(r))) pending++;
    const ref = it.E2ETestReference || it.e2eTestReference;
    if (ref) e2eRefs.add(String(ref));
  }

  return {
    totalItems: items.length,
    pendingItems: pending,
    e2eRefs: Array.from(e2eRefs),
  };
}

function readSessionSets(root) {
  const sessionSetsDir = path.join(root, SESSION_SETS_REL);
  if (!fs.existsSync(sessionSetsDir)) return [];
  const entries = fs.readdirSync(sessionSetsDir, { withFileTypes: true });
  const sets = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith("_")) continue; // skip _archived/
    const dir = path.join(sessionSetsDir, entry.name);
    const specPath = path.join(dir, "spec.md");
    if (!fs.existsSync(specPath)) continue;

    const activityPath = path.join(dir, "activity-log.json");
    const changeLogPath = path.join(dir, "change-log.md");
    const statePath = path.join(dir, "session-state.json");
    const aiAssignmentPath = path.join(dir, "ai-assignment.md");
    const uatChecklistPath = path.join(dir, `${entry.name}-uat-checklist.json`);

    let state;
    if (fs.existsSync(changeLogPath)) state = "done";
    else if (fs.existsSync(activityPath) || fs.existsSync(statePath)) state = "in-progress";
    else state = "not-started";

    let totalSessions = null;
    let sessionsCompleted = 0;
    let lastTouched = null;
    let liveSession = null;

    if (fs.existsSync(activityPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(activityPath, "utf8"));
        if (typeof data.totalSessions === "number") {
          totalSessions = data.totalSessions;
        }
        const completedSet = new Set();
        for (const e of data.entries || []) {
          if (typeof e.sessionNumber === "number") {
            completedSet.add(e.sessionNumber);
          }
          if (e.dateTime && (!lastTouched || e.dateTime > lastTouched)) {
            lastTouched = e.dateTime;
          }
        }
        sessionsCompleted = completedSet.size;
      } catch (err) {
        // ignore
      }
    }

    if (fs.existsSync(statePath)) {
      try {
        const sd = JSON.parse(fs.readFileSync(statePath, "utf8"));
        if (totalSessions === null && typeof sd.totalSessions === "number") {
          totalSessions = sd.totalSessions;
        }
        const stateTouched = sd.completedAt || sd.startedAt;
        if (stateTouched && (!lastTouched || stateTouched > lastTouched)) {
          lastTouched = stateTouched;
        }
        liveSession = {
          currentSession: sd.currentSession,
          status: sd.status,
          orchestrator: sd.orchestrator || null,
          startedAt: sd.startedAt || null,
          completedAt: sd.completedAt || null,
          verificationVerdict: sd.verificationVerdict || null,
        };
      } catch (err) {
        // ignore
      }
    }

    const config = parseSessionSetConfig(specPath);
    const uatSummary = config.requiresUAT
      ? parseUatChecklist(uatChecklistPath)
      : null;

    sets.push({
      name: entry.name,
      dir,
      specPath,
      activityPath,
      changeLogPath,
      statePath,
      aiAssignmentPath,
      uatChecklistPath,
      state,
      totalSessions,
      sessionsCompleted,
      lastTouched,
      liveSession,
      config,
      uatSummary,
      root,
    });
  }
  return sets;
}

const STATE_RANK = { "done": 2, "in-progress": 1, "not-started": 0 };

function readAllSessionSets() {
  const merged = new Map();
  for (const root of discoverRoots()) {
    for (const set of readSessionSets(root)) {
      const prior = merged.get(set.name);
      if (!prior) {
        merged.set(set.name, set);
        continue;
      }
      const newRank = STATE_RANK[set.state] ?? -1;
      const priorRank = STATE_RANK[prior.state] ?? -1;
      if (newRank > priorRank) {
        merged.set(set.name, set);
      } else if (newRank === priorRank) {
        const newer = (set.lastTouched || "") > (prior.lastTouched || "");
        if (newer) merged.set(set.name, set);
      }
    }
  }
  return Array.from(merged.values());
}

function progressText(set) {
  if (set.state === "done") {
    // Done sets show actual sessions run as both numerator and denominator.
    // totalSessions is a planning estimate and may exceed sessionsCompleted
    // when optional buffer sessions are not needed.
    return set.sessionsCompleted > 0
      ? `${set.sessionsCompleted}/${set.sessionsCompleted}`
      : "";
  }
  if (set.totalSessions && set.totalSessions > 0) {
    return `${set.sessionsCompleted}/${set.totalSessions}`;
  }
  if (set.sessionsCompleted > 0) {
    return `${set.sessionsCompleted} done`;
  }
  return "";
}

function touchedDate(set) {
  if (!set.lastTouched) return "";
  return new Date(set.lastTouched).toLocaleDateString("en-CA");
}

function uatBadge(set) {
  if (!set.config || !set.config.requiresUAT) return "";
  if (!set.uatSummary) return "";
  if (set.uatSummary.pendingItems > 0) {
    return `[UAT ${set.uatSummary.pendingItems}]`;
  }
  if (set.uatSummary.totalItems > 0) {
    return "[UAT done]";
  }
  return "";
}

const ICON_FILES = {
  "done": "done.svg",
  "in-progress": "in-progress.svg",
  "not-started": "not-started.svg",
};

function iconUriFor(extensionUri, state) {
  const file = ICON_FILES[state];
  if (!file) return undefined;
  return vscode.Uri.joinPath(extensionUri, "media", file);
}

class SessionSetsProvider {
  constructor(extensionUri) {
    this.extensionUri = extensionUri;
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this._cache = null;
  }

  refresh() {
    this._cache = null;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element) {
    return element;
  }

  getChildren(element) {
    if (workspaceFolders().length === 0) return [];

    if (!this._cache) {
      this._cache = readAllSessionSets();
    }
    const all = this._cache;

    if (!element) {
      const inProgress = all.filter((s) => s.state === "in-progress");
      const notStarted = all.filter((s) => s.state === "not-started");
      const done = all.filter((s) => s.state === "done");

      return [
        makeGroup(this.extensionUri, "In Progress", "in-progress", inProgress.length),
        makeGroup(this.extensionUri, "Not Started", "not-started", notStarted.length),
        makeGroup(this.extensionUri, "Done", "done", done.length),
      ];
    }

    if (element.contextValue === "group") {
      let subset = all.filter((s) => s.state === element.groupKey);
      if (element.groupKey === "in-progress" || element.groupKey === "done") {
        subset.sort((a, b) =>
          (b.lastTouched || "").localeCompare(a.lastTouched || ""),
        );
      } else {
        subset.sort((a, b) => a.name.localeCompare(b.name));
      }
      return subset.map((s) => makeSetItem(this.extensionUri, s));
    }

    return [];
  }
}

function makeGroup(extensionUri, label, groupKey, count) {
  const item = new vscode.TreeItem(
    `${label}  (${count})`,
    count > 0
      ? vscode.TreeItemCollapsibleState.Expanded
      : vscode.TreeItemCollapsibleState.Collapsed,
  );
  item.iconPath = iconUriFor(extensionUri, groupKey);
  item.contextValue = "group";
  item.groupKey = groupKey;
  return item;
}

function liveSessionTooltipLines(set) {
  if (!set.liveSession) return [];
  const ls = set.liveSession;
  const lines = [];
  if (typeof ls.currentSession === "number") {
    const total = set.totalSessions ? `/${set.totalSessions}` : "";
    const status = ls.status ? ` (${ls.status})` : "";
    lines.push(`Session: ${ls.currentSession}${total}${status}`);
  }
  if (ls.orchestrator) {
    const o = ls.orchestrator;
    const parts = [o.engine, o.model].filter(Boolean).join(" · ");
    const effort = o.effort && o.effort !== "unknown" ? ` @ effort=${o.effort}` : "";
    if (parts) lines.push(`Orchestrator: ${parts}${effort}`);
  }
  if (ls.verificationVerdict) {
    lines.push(`Verifier: ${ls.verificationVerdict}`);
  }
  return lines;
}

function configTooltipLines(set) {
  if (!set.config) return [];
  const flags = [];
  if (set.config.requiresUAT) flags.push("UAT");
  if (set.config.requiresE2E) flags.push("E2E");
  const lines = [];
  lines.push(`Gates: ${flags.length ? flags.join(" + ") : "none (no UAT/E2E)"}`);
  if (set.config.requiresUAT && set.uatSummary) {
    const u = set.uatSummary;
    if (u.totalItems > 0) {
      lines.push(`UAT items: ${u.pendingItems} pending / ${u.totalItems} total`);
    } else {
      lines.push("UAT checklist: not yet authored");
    }
  }
  return lines;
}

function folderTooltip(set) {
  const roots = discoverRoots();
  const rel = path.relative(set.root, set.dir);
  if (roots.length > 1) {
    return `${path.basename(set.root)} / ${rel}`;
  }
  return rel;
}

function contextValueFor(set) {
  // Compose a context value that menu `when` clauses can match against,
  // e.g. `sessionSet:in-progress:uat:e2e`.
  const parts = [`sessionSet:${set.state}`];
  if (set.config && set.config.requiresUAT) parts.push("uat");
  if (set.config && set.config.requiresE2E) parts.push("e2e");
  return parts.join(":");
}

function makeSetItem(extensionUri, set) {
  const item = new vscode.TreeItem(
    set.name,
    vscode.TreeItemCollapsibleState.None,
  );
  const bits = [progressText(set), touchedDate(set), uatBadge(set)].filter(Boolean);
  item.description = bits.join("  ·  ");
  item.tooltip = new vscode.MarkdownString(
    [
      `**${set.name}**`,
      `State: ${set.state}`,
      bits.length ? `Progress: ${bits.join(" · ")}` : null,
      ...configTooltipLines(set),
      ...liveSessionTooltipLines(set),
      `Folder: \`${folderTooltip(set)}\``,
    ]
      .filter(Boolean)
      .join("\n\n"),
  );
  item.contextValue = contextValueFor(set);
  item.set = set;
  item.iconPath = iconUriFor(extensionUri, set.state);
  item.command = {
    command: "dabblerSessionSets.openSpec",
    title: "Open Spec",
    arguments: [item],
  };
  return item;
}

function findPlaywrightTests(set) {
  // Search for tests matching either E2ETestReference values from the
  // checklist or any file mentioning the slug. Returns an array of
  // absolute paths.
  const cfg = vscode.workspace.getConfiguration("dabblerSessionSets");
  const testDirRel = cfg.get("e2e.testDirectory", PLAYWRIGHT_REL_DEFAULT) || PLAYWRIGHT_REL_DEFAULT;
  const candidates = new Set();
  const playwrightDir = path.join(set.root, testDirRel);
  if (!fs.existsSync(playwrightDir)) return [];

  const slugTokens = set.name.split("-").filter((s) => s.length >= 3);
  const testRefs = (set.uatSummary && set.uatSummary.e2eRefs) || [];

  // Walk the playwright dir (depth-limited) and match.
  const walk = (dir, depth) => {
    if (depth > 4) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "bin" || e.name === "obj" || e.name === "node_modules") continue;
        walk(p, depth + 1);
        continue;
      }
      if (!/\.(cs|ts|js)$/.test(e.name)) continue;
      const lowerName = e.name.toLowerCase();
      // Slug token match on filename.
      if (slugTokens.some((t) => lowerName.includes(t.toLowerCase()))) {
        candidates.add(p);
        continue;
      }
      // Test-reference match by reading file content (cheap; tests are small).
      if (testRefs.length > 0) {
        try {
          const txt = fs.readFileSync(p, "utf8");
          for (const ref of testRefs) {
            // Match by short method name (last segment of fully-qualified ref).
            const short = String(ref).split(".").pop();
            if (short && txt.includes(short)) {
              candidates.add(p);
              break;
            }
          }
        } catch (_) {
          // ignore
        }
      }
    }
  };
  walk(playwrightDir, 0);
  return Array.from(candidates).sort();
}

function evaluateSupportContextKeys(allSets) {
  // Read user settings: auto | always | never. In "auto" mode the
  // context key is true iff at least one spec in the workspace
  // declares the corresponding flag. In "always" / "never" the user's
  // preference wins outright.
  const cfg = vscode.workspace.getConfiguration("dabblerSessionSets");
  const uatPref = cfg.get("uatSupport.enabled", "auto");
  const e2ePref = cfg.get("e2eSupport.enabled", "auto");

  const anyUat = allSets.some((s) => s.config && s.config.requiresUAT);
  const anyE2e = allSets.some((s) => s.config && s.config.requiresE2E);

  const uatActive = uatPref === "always" || (uatPref === "auto" && anyUat);
  const e2eActive = e2ePref === "always" || (e2ePref === "auto" && anyE2e);

  vscode.commands.executeCommand(
    "setContext",
    "dabblerSessionSets.uatSupportActive",
    uatActive,
  );
  vscode.commands.executeCommand(
    "setContext",
    "dabblerSessionSets.e2eSupportActive",
    e2eActive,
  );
}

function activate(context) {
  if (workspaceFolders().length === 0) return;

  const provider = new SessionSetsProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("dabblerSessionSets", provider),
  );

  // Evaluate workspace-scoped context keys for UAT/E2E command gating.
  // Re-runs every time the tree data is refreshed (file change,
  // settings change, manual refresh, 30s poll).
  const evaluateContextKeys = () => {
    evaluateSupportContextKeys(provider._cache || readAllSessionSets());
  };
  // Wire into refresh: every time the cache is invalidated, recompute
  // context keys after the next read.
  const originalRefresh = provider.refresh.bind(provider);
  provider.refresh = () => {
    originalRefresh();
    setImmediate(evaluateContextKeys);
  };
  evaluateContextKeys();

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration("dabblerSessionSets.uatSupport.enabled") ||
        e.affectsConfiguration("dabblerSessionSets.e2eSupport.enabled")
      ) {
        evaluateContextKeys();
      }
    }),
  );

  let watcherSubs = [];
  let boundRoots = new Set();

  function bindWatchers() {
    const roots = discoverRoots();
    const want = new Set(roots.map((r) => r.toLowerCase()));
    if (
      want.size === boundRoots.size &&
      [...want].every((r) => boundRoots.has(r))
    ) {
      return;
    }
    for (const sub of watcherSubs) sub.dispose();
    watcherSubs = [];
    boundRoots = want;
    for (const root of roots) {
      const sessionSetsAbs = path.join(root, SESSION_SETS_REL);
      if (!fs.existsSync(sessionSetsAbs)) continue;
      const pattern = new vscode.RelativePattern(
        sessionSetsAbs,
        "**/{spec.md,session-state.json,activity-log.json,change-log.md,*-uat-checklist.json}",
      );
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);
      const onEvent = () => provider.refresh();
      watcher.onDidCreate(onEvent);
      watcher.onDidDelete(onEvent);
      watcher.onDidChange(onEvent);
      watcherSubs.push(watcher);
      context.subscriptions.push(watcher);
    }
  }

  const refreshAll = () => {
    bindWatchers();
    provider.refresh();
  };

  bindWatchers();

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(refreshAll),
  );

  const pollHandle = setInterval(refreshAll, 30000);
  context.subscriptions.push({ dispose: () => clearInterval(pollHandle) });

  context.subscriptions.push(
    vscode.commands.registerCommand("dabblerSessionSets.refresh", refreshAll),
  );

  const openIfExists = (p, label) => {
    if (!p || !fs.existsSync(p)) {
      vscode.window.showInformationMessage(
        `${label || "File"} does not exist yet: ${p ? path.basename(p) : "<unknown>"}`,
      );
      return;
    }
    vscode.commands.executeCommand("vscode.open", vscode.Uri.file(p));
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("dabblerSessionSets.openSpec", (item) =>
      openIfExists(item && item.set && item.set.specPath, "Spec"),
    ),
    vscode.commands.registerCommand("dabblerSessionSets.openActivityLog", (item) =>
      openIfExists(item && item.set && item.set.activityPath, "Activity log"),
    ),
    vscode.commands.registerCommand("dabblerSessionSets.openChangeLog", (item) =>
      openIfExists(item && item.set && item.set.changeLogPath, "Change log"),
    ),
    vscode.commands.registerCommand("dabblerSessionSets.openAiAssignment", (item) =>
      openIfExists(item && item.set && item.set.aiAssignmentPath, "AI assignment"),
    ),
    vscode.commands.registerCommand("dabblerSessionSets.openUatChecklist", (item) =>
      openIfExists(item && item.set && item.set.uatChecklistPath, "UAT checklist"),
    ),
    vscode.commands.registerCommand("dabblerSessionSets.openFolder", (item) => {
      if (!item || !item.set) return;
      vscode.commands.executeCommand(
        "revealInExplorer",
        vscode.Uri.file(item.set.dir),
      );
    }),
    vscode.commands.registerCommand(
      "dabblerSessionSets.revealPlaywrightTests",
      async (item) => {
        if (!item || !item.set) return;
        const tests = findPlaywrightTests(item.set);
        if (tests.length === 0) {
          const cfg2 = vscode.workspace.getConfiguration("dabblerSessionSets");
          const testDirRel2 = cfg2.get("e2e.testDirectory", PLAYWRIGHT_REL_DEFAULT) || PLAYWRIGHT_REL_DEFAULT;
          vscode.window.showInformationMessage(
            `No Playwright tests found for "${item.set.name}". Search root: ${testDirRel2}`,
          );
          return;
        }
        if (tests.length === 1) {
          vscode.commands.executeCommand("vscode.open", vscode.Uri.file(tests[0]));
          return;
        }
        const picked = await vscode.window.showQuickPick(
          tests.map((p) => ({
            label: path.basename(p),
            description: path.relative(item.set.root, p),
            absolute: p,
          })),
          { placeHolder: `Playwright tests matching "${item.set.name}"` },
        );
        if (picked) {
          vscode.commands.executeCommand("vscode.open", vscode.Uri.file(picked.absolute));
        }
      },
    ),
  );

  // --- Clipboard helpers for "start next session" prompts ---

  const copy = async (text, label) => {
    await vscode.env.clipboard.writeText(text);
    vscode.window.setStatusBarMessage(`Copied: ${label}`, 4000);
  };

  // The clipboard text intentionally stays terse. Each phrase's
  // semantics live in docs/ai-led-session-workflow.md → Trigger
  // Phrases. The optional `— maxout <engine>` suffix lets the human
  // override token-window-budget routing for this session;
  // session-verification still routes cross-provider regardless.
  const startCommandPresets = {
    default: (slug) => `Start the next session of \`${slug}\`.`,
    parallel: (slug) => `Start the next parallel session of \`${slug}\`.`,
    maxoutClaude: (slug) =>
      `Start the next session of \`${slug}\`. — maxout Claude`,
  };

  const presetLabels = {
    default: "start next session",
    parallel: "start next parallel session",
    maxoutClaude: "start next session — maxout Claude",
  };

  for (const [key, builder] of Object.entries(startCommandPresets)) {
    context.subscriptions.push(
      vscode.commands.registerCommand(
        `dabblerSessionSets.copyStartCommand.${key}`,
        async (item) => {
          if (!item || !item.set) return;
          await copy(builder(item.set.name), presetLabels[key]);
        },
      ),
    );
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("dabblerSessionSets.copySlug", async (item) => {
      if (!item || !item.set) return;
      await copy(item.set.name, "slug");
    }),
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
