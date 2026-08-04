// Set 110 S1 spike. Throwaway. Answers, by running rather than by reading docs:
//   (a) does contributes.submenus from view/item/context give a real
//       hierarchical menu (including a second level of nesting)?
//   (b) does "group": "inline" render row actions acceptably as icons?
//   (c) does getChildren actually stay lazy across FOUR levels?
//   (d) do the operator's authored SVGs (width="16mm", viewBox 0 0 16 16,
//       hardcoded fills) scale into a 16px tree row and survive theming?
//
// Writes a machine-readable probe report so the answers are evidence, not
// recollection.

const vscode = require("vscode");
const fs = require("fs");
const path = require("path");

const REPO_MEDIA = "d:/Projects/dabbler-ai-orchestration/tools/dabbler-ai-orchestration/media";
const REPORT = process.env.SPIKE_REPORT_PATH || path.join(__dirname, "spike-report.json");

/** Every getChildren call, in order, with a timestamp. This is the lazy proof. */
const calls = [];
const log = (what, extra) =>
  calls.push({ at: new Date().toISOString(), what, ...(extra || {}) });

const icon = (name) => {
  const p = path.join(REPO_MEDIA, name);
  return fs.existsSync(p) ? vscode.Uri.file(p) : undefined;
};

// The worst-case row from the spec: five independent markers + fraction +
// kind badge, all simultaneously visible today.
const WORST_CASE = {
  name: "087-work-explorer-module-first-ux",
  fraction: "3/5",
  markers: [
    "schema-migration required (v3 -> v4)",
    "tier: lightweight (workspace is full)",
    "blocked by prerequisite: 086-copilot-seat-verification-integrity",
    "verification: WAIVED",
    "duplicate name across roots",
  ],
  kind: "decomposition",
};

function markdownTooltip(set) {
  const md = new vscode.MarkdownString(undefined, true);
  md.supportHtml = false;
  md.appendMarkdown(`**${set.name}**\n\n`);
  md.appendMarkdown(`Progress: \`${set.fraction}\`  ·  kind: \`${set.kind}\`\n\n`);
  md.appendMarkdown(`---\n\n`);
  for (const m of set.markers) md.appendMarkdown(`- $(warning) ${m}\n`);
  return md;
}

class SpikeProvider {
  constructor() {
    this._emitter = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._emitter.event;
  }

  getTreeItem(el) {
    return el.item;
  }

  // Needed so view.reveal() can drive expansion programmatically — which is
  // how this spike proves laziness without a human clicking triangles.
  getParent(el) {
    return el && el.parent ? el.parent : undefined;
  }

  getChildren(el) {
    const C = vscode.TreeItemCollapsibleState;

    if (!el) {
      log("getChildren(root)");
      return ["Orchestration Core", "Access Harvester", "(unassigned)"].map((name, i) => {
        const item = new vscode.TreeItem(name, C.Collapsed);
        item.contextValue = i === 2 ? "module-pseudo" : "module-normal";
        item.description = i === 2 ? "3 sets" : `${4 + i} sets`;
        item.iconPath = new vscode.ThemeIcon(i === 2 ? "circle-outline" : "folder");
        item.tooltip = `${name} — module row; four inline actions live here today`;
        return { kind: "module", name, item, parent: undefined };
      });
    }

    if (el.kind === "module") {
      log("getChildren(module)", { module: el.name });
      return ["In Progress", "Not Started", "Complete"].map((b) => {
        const item = new vscode.TreeItem(b, C.Collapsed);
        item.contextValue = "bucket";
        // Operator ask 3, second reading: a count on the group header row.
        item.description = b === "In Progress" ? "1 set" : b === "Complete" ? "12 sets" : "2 sets";
        return { kind: "bucket", name: b, module: el.name, item, parent: el };
      });
    }

    if (el.kind === "bucket") {
      log("getChildren(bucket)", { module: el.module, bucket: el.name });
      const rows = [];

      // The worst-case row, mapped per the spec's table.
      const worst = new vscode.TreeItem(WORST_CASE.name, C.Collapsed);
      worst.description = WORST_CASE.fraction; // Set 034 column -> dimmed text
      // Finding 4: "the single most severe marker" needs a PRECEDENCE RULE and
      // a distinct glyph per state, or a blocked/migration-required set renders
      // as a generic in-progress dot and the warning survives only on hover.
      // Precedence, most severe first:
      //   blocked > schema-migration > verification-failed/waived > tier-mismatch
      //   > duplicate-name > plain run state
      worst.iconPath = new vscode.ThemeIcon(
        "error",
        new vscode.ThemeColor("problemsErrorIcon.foreground"),
      ); // blocked-by-prerequisite wins
      worst.tooltip = markdownTooltip(WORST_CASE); // the other four markers
      worst.contextValue = "set-inprogress-blocked-migration";
      rows.push({ kind: "set", name: WORST_CASE.name, item: worst, parent: el });

      // Second severity, so precedence is visible rather than asserted.
      const migrating = new vscode.TreeItem("086-copilot-seat-verification-integrity", C.Collapsed);
      migrating.iconPath = new vscode.ThemeIcon(
        "warning",
        new vscode.ThemeColor("problemsWarningIcon.foreground"),
      ); // schema-migration required
      migrating.tooltip = new vscode.MarkdownString("**086** — schema migration v3 -> v4 required");
      migrating.contextValue = "set-migration-required";
      rows.push({ kind: "set", name: "086", item: migrating, parent: el });

      // A benign row, for contrast at a glance.
      const calm = new vscode.TreeItem("108-three-module-pipeline-tutorial", C.Collapsed);
      calm.description = "4/4";
      calm.iconPath = icon("done.svg");
      calm.tooltip = new vscode.MarkdownString("**108** — complete, VERIFIED");
      calm.contextValue = "set-complete";
      rows.push({ kind: "set", name: "108", item: calm, parent: el });

      // A ThemeIcon row, to compare theme-tracking against the authored SVGs.
      const themed = new vscode.TreeItem("109-model-registry-and-pricing-truth", C.Collapsed);
      themed.description = "4/4";
      themed.iconPath = new vscode.ThemeIcon("pass-filled");
      themed.contextValue = "set-complete";
      rows.push({ kind: "set", name: "109", item: themed, parent: el });

      return rows;
    }

    if (el.kind === "set") {
      // Operator ask 1: the fourth level. In the product these come from
      // ProgressView.sessions, already in memory — no disk read.
      log("getChildren(set) -- FOURTH LEVEL", { set: el.name });
      const statuses = [
        ["Session 1", "done.svg", "complete"],
        ["Session 2", "done.svg", "complete"],
        ["Session 3", "in-progress.svg", "in-progress"],
        ["Session 4", "not-started.svg", "not-started"],
        ["Session 5", "cancelled.svg", "cancelled"],
      ];
      return statuses.map(([title, svg, status]) => {
        const item = new vscode.TreeItem(title, vscode.TreeItemCollapsibleState.None);
        item.iconPath = icon(svg);
        item.description = status === "in-progress" ? "in flight" : "";
        item.contextValue = `session-${status}`;
        item.tooltip = `${title} — ${status}`;
        return { kind: "session", name: title, item, parent: el };
      });
    }

    return [];
  }
}

function activate(context) {
  const provider = new SpikeProvider();
  const view = vscode.window.createTreeView("spikeTree", {
    treeDataProvider: provider,
    showCollapseAll: true,
  });
  context.subscriptions.push(view);

  view.message = "TreeView.message renders here, above the tree.";
  view.badge = { value: 7, tooltip: "7 sets in progress" };

  for (const id of [
    "spike.newSession", "spike.openSpec", "spike.newSet", "spike.refresh",
    "spike.rename", "spike.delete",
    "spike.planCreate", "spike.planImport", "spike.planRegen",
    "spike.verifyRun", "spike.verifyMode",
  ]) {
    context.subscriptions.push(
      vscode.commands.registerCommand(id, (node) => {
        log("command", { id, on: node && node.name });
        vscode.window.showInformationMessage(`${id} on ${(node && node.name) || "(no node)"}`);
        writeReport();
      }),
    );
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("spike.probe", async () => {
      await writeReport();
      vscode.window.showInformationMessage(`Spike report written: ${REPORT}`);
    }),
  );

  async function writeReport() {
    const all = await vscode.commands.getCommands(true);
    const svgFacts = {};
    for (const f of ["not-started.svg", "in-progress.svg", "done.svg", "cancelled.svg"]) {
      const p = path.join(REPO_MEDIA, f);
      if (!fs.existsSync(p)) { svgFacts[f] = { present: false }; continue; }
      const text = fs.readFileSync(p, "utf8");
      svgFacts[f] = {
        present: true,
        width: (text.match(/width="([^"]+)"/) || [])[1] || null,
        height: (text.match(/height="([^"]+)"/) || [])[1] || null,
        viewBox: (text.match(/viewBox="([^"]+)"/) || [])[1] || null,
        hardcodedFills: [...new Set(text.match(/#[0-9a-fA-F]{6}/g) || [])],
        usesCurrentColor: text.includes("currentColor"),
      };
    }
    const report = {
      spike: "Set 110 S1 — submenus + group:inline + lazy getChildren + operator icons",
      vscodeVersion: vscode.version,
      generatedAt: new Date().toISOString(),
      commandsRegistered: [
        "spike.planCreate", "spike.planImport", "spike.planRegen",
        "spike.verifyRun", "spike.verifyMode",
      ].map((id) => ({ id, present: all.includes(id) })),
      getChildrenCalls: calls,
      lazinessNote:
        "A call for a node's children appears ONLY after that node is expanded. " +
        "If getChildren(set) rows are absent until you expand a set, the fourth " +
        "level costs nothing on refresh — the property the whole migration wants.",
      operatorIconFacts: svgFacts,
      manualChecklistForOperator: [
        "Right-click 'Orchestration Core' -> is there a 'Plan' SUBMENU that opens a second level?",
        "Inside 'Plan' -> is there a further 'Deeper Still' submenu (two levels of nesting)?",
        "Hover a module row -> do the two inline icons (+ and go-to-file) render as ICONS, right-aligned, without covering the label?",
        "Narrow the panel to its minimum -> do the inline icons still fit, and is the module name still readable?",
        "Right-click '(unassigned)' -> does it correctly show FEWER items (no Plan submenu, no Rename/Delete)?",
        "Compare the '109' row (ThemeIcon pass-filled) against the '108' row (authored done.svg) in BOTH light and dark themes.",
        "Expand a set row -> do the five session rows appear with the operator's own status icons at a legible size?",
        "Look at the worst-case row '087-...' -> the dimmed 3/5 is the fraction; hover it for the other four markers. Is that enough at a glance?",
      ],
    };
    fs.writeFileSync(REPORT, JSON.stringify(report, null, 2), "utf8");
    return report;
  }

  // Staged driver: snapshot the call log at each stage so laziness is
  // demonstrated as a TRACE, not asserted. Each stage records what VS Code
  // had asked for BEFORE the next expansion was requested.
  const stages = [];
  const snapshot = (name) =>
    stages.push({ stage: name, callsSoFar: calls.map((c) => c.what) });

  setTimeout(async () => {
    snapshot("after activation, view never opened");
    await vscode.commands.executeCommand("spikeTree.focus");
    await new Promise((r) => setTimeout(r, 1200));
    snapshot("after view made visible (root only)");

    const roots = await provider.getChildren(undefined);
    await view.reveal(roots[0], { expand: 1, select: false, focus: false });
    await new Promise((r) => setTimeout(r, 800));
    snapshot("after expanding module 1");

    const buckets = await provider.getChildren(roots[0]);
    await view.reveal(buckets[0], { expand: 1, select: false, focus: false });
    await new Promise((r) => setTimeout(r, 800));
    snapshot("after expanding bucket 1");

    const sets = await provider.getChildren(buckets[0]);
    await view.reveal(sets[0], { expand: 1, select: false, focus: false });
    await new Promise((r) => setTimeout(r, 800));
    snapshot("after expanding set 1 (fourth level)");

    // Width sweep: the default sidebar hid `description` entirely for
    // realistic (long) set names. Widen in steps so the finding can be
    // stated as a WIDTH THRESHOLD rather than a single anecdote.
    fs.writeFileSync(path.join(__dirname, "..", "width-stage-default.marker"), "ready", "utf8");
    await new Promise((r) => setTimeout(r, 9000));
    for (let i = 0; i < 14; i++) {
      await vscode.commands.executeCommand("workbench.action.decreaseViewSize");
      await new Promise((r) => setTimeout(r, 120));
    }
    fs.writeFileSync(path.join(__dirname, "..", "width-stage-wide.marker"), "ready", "utf8");
    await new Promise((r) => setTimeout(r, 9000));
    for (let i = 0; i < 8; i++) {
      await vscode.commands.executeCommand("workbench.action.decreaseViewSize");
      await new Promise((r) => setTimeout(r, 120));
    }
    fs.writeFileSync(path.join(__dirname, "..", "width-stage-widest.marker"), "ready", "utf8");

    const rep = await writeReport();
    fs.writeFileSync(
      REPORT.replace(/\.json$/, "-stages.json"),
      JSON.stringify({ stages, totalCalls: rep.getChildrenCalls.length }, null, 2),
      "utf8",
    );
  }, 1500);
}

function deactivate() {}

module.exports = { activate, deactivate };
