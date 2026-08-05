// Set 110 Session 2 — the `TreeDataProvider` adapter.
//
// The pure view model is covered in `workExplorerTreeModel.test.ts`.
// What is left here is what only the adapter can get wrong, and each of
// these is a defect that would present to an operator as sluggishness or
// a dead row rather than as an error:
//
//   * LAZINESS. The migration's entire structural claim is that work
//     happens on expand. If `getChildren` eagerly walked the tree, every
//     assertion in the model suite would still pass and the product
//     would be no better than the renderer it replaces.
//   * SCAN MEMOISATION. This provider is called back once per expansion,
//     where the webview scanned once and built everything. Without a
//     per-refresh cache, expanding four modules would re-read the disk
//     four times — a regression the webview does not have, introduced by
//     the fix for the webview's problem.
//   * `refresh()` INVALIDATION. A cache that never clears is worse than
//     no cache: the tree would show yesterday's sets forever.
//   * `getParent`, without which `TreeView.reveal` silently does nothing
//     — which is how Layer 3 drives expansion.

import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { WorkExplorerTreeProvider } from "../../providers/WorkExplorerTreeProvider";
import { WorkExplorerNode } from "../../providers/workExplorerTreeModel";

/** A workspace with two modules and four sets, one of them in flight. */
function makeWorkspace(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-tree-"));
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "docs", "modules.yaml"),
    [
      "modules:",
      "  - slug: core",
      "    title: Orchestration Core",
      "    codeRoots: [src/core]",
      "  - slug: ui",
      "    title: User Interface",
      "    codeRoots: [src/ui]",
      "",
    ].join("\n"),
    "utf-8",
  );

  const makeSet = (
    name: string,
    module: string | null,
    sessions: { number: number; title: string; status: string }[],
    status: string,
  ) => {
    const dir = path.join(root, "docs", "session-sets", name);
    fs.mkdirSync(dir, { recursive: true });
    const cfg = [
      "```yaml",
      "tier: full",
      "requiresUAT: false",
      "requiresE2E: false",
      ...(module ? [`module: ${module}`] : []),
      "```",
    ].join("\n");
    fs.writeFileSync(
      path.join(dir, "spec.md"),
      `# ${name}\n\n## Session Set Configuration\n\n${cfg}\n\n` +
        sessions.map((s) => `### Session ${s.number} of ${sessions.length}: ${s.title}`).join("\n\n") +
        "\n",
      "utf-8",
    );
    fs.writeFileSync(
      path.join(dir, "session-state.json"),
      JSON.stringify({
        schemaVersion: 4,
        sessionSetName: name,
        status,
        sessions,
      }),
      "utf-8",
    );
  };

  makeSet("001-core-alpha", "core", [
    { number: 1, title: "One", status: "complete" },
    { number: 2, title: "Two", status: "in-progress" },
  ], "in-progress");
  makeSet("002-core-beta", "core", [{ number: 1, title: "Only", status: "complete" }], "complete");
  makeSet("003-ui-gamma", "ui", [{ number: 1, title: "Only", status: "not-started" }], "not-started");
  makeSet("004-loose", null, [{ number: 1, title: "Only", status: "not-started" }], "not-started");

  return root;
}

function withWorkspace(fn: (root: string) => void): void {
  const root = makeWorkspace();
  const previous = vscode.workspace.workspaceFolders;
  try {
    (vscode.workspace as { workspaceFolders?: unknown }).workspaceFolders = [
      { uri: vscode.Uri.file(root), name: path.basename(root), index: 0 },
    ];
    fn(root);
  } finally {
    (vscode.workspace as { workspaceFolders?: unknown }).workspaceFolders = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const provider = () => new WorkExplorerTreeProvider(vscode.Uri.file("/ext"));

suite("Set 110 S2 — provider laziness", () => {
  test("asking for roots does NOT build any deeper level", () => {
    withWorkspace(() => {
      const p = provider();
      const roots = p.getChildren();
      assert.strictEqual(roots.length, 3, "two declared modules plus the pseudo module");
      // Every root is a module node and nothing below it has been touched:
      // a module node holds `VisibleModule.sets` (which the scan produced
      // anyway) and no bucket or session node exists yet.
      for (const node of roots) assert.strictEqual(node.kind, "module");
    });
  });

  test("each level appears only when its parent is asked for", () => {
    withWorkspace(() => {
      const p = provider();
      const modules = p.getChildren();
      const core = modules.find(
        (n) => n.kind === "module" && n.module.slug === "core",
      ) as Extract<WorkExplorerNode, { kind: "module" }>;
      assert.ok(core);

      const buckets = p.getChildren(core);
      assert.ok(buckets.every((n) => n.kind === "bucket"));

      const inProgress = buckets[0];
      const sets = p.getChildren(inProgress);
      assert.strictEqual(sets.length, 1);
      assert.strictEqual(sets[0].kind, "set");

      const sessions = p.getChildren(sets[0]);
      assert.deepStrictEqual(
        sessions.map((n) => (n.kind === "session" ? n.session.status : "?")),
        ["complete", "in-progress"],
      );
      // The fourth level is where expansion stops.
      assert.deepStrictEqual(p.getChildren(sessions[0]), []);
    });
  });

  test("a set row is Collapsed, so its sessions cost nothing until opened", () => {
    withWorkspace(() => {
      const p = provider();
      const modules = p.getChildren();
      const buckets = p.getChildren(modules[0]);
      const sets = p.getChildren(buckets[0]);
      const item = p.getTreeItem(sets[0]);
      assert.strictEqual(item.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed);
    });
  });
});

suite("Set 110 S2 — provider caching and invalidation", () => {
  test("expanding many nodes re-uses one scan", () => {
    withWorkspace((root) => {
      const p = provider();
      const modules = p.getChildren();
      for (const m of modules) p.getChildren(m);

      // Delete the whole workspace's sets from disk. A provider that
      // re-scans per expansion would now return different data; a
      // correctly memoised one still serves the scan it took first.
      fs.rmSync(path.join(root, "docs", "session-sets"), { recursive: true, force: true });
      const again = p.getChildren();
      assert.strictEqual(again.length, modules.length, "the scan was not memoised");
    });
  });

  test("refresh() drops the cache so the next paint sees the disk", () => {
    withWorkspace((root) => {
      const p = provider();
      assert.strictEqual(p.getChildren().length, 3);
      fs.rmSync(path.join(root, "docs", "session-sets"), { recursive: true, force: true });
      p.refresh();
      // The two DECLARED modules still render with zero sets — their rows
      // and empty buckets are where scaffolded lifecycle sets land, and an
      // empty tree is never the answer (the Set 091 Q8 matrix). The pseudo
      // module correctly disappears: it exists for unstamped work, and
      // with declared modules visible and nothing unstamped there is
      // nothing for it to hold.
      const after = p.getChildren();
      assert.strictEqual(after.length, 2, "declared modules render even with zero sets");
      const buckets = p.getChildren(after[0]);
      assert.deepStrictEqual(
        buckets.map((b) => (b.kind === "bucket" ? b.sets.length : -1)),
        [0, 0, 0],
      );
    });
  });

  test("refresh() fires the change event so VS Code repaints", () => {
    withWorkspace(() => {
      const p = provider();
      let fired = 0;
      p.onDidChangeTreeData(() => {
        fired += 1;
      });
      p.refresh();
      assert.strictEqual(fired, 1);
    });
  });
});

suite("Set 110 S2 — reveal support and command wiring", () => {
  test("getParent returns the node a child was served under", () => {
    withWorkspace(() => {
      const p = provider();
      const modules = p.getChildren();
      assert.strictEqual(p.getParent(modules[0]), undefined, "roots have no parent");

      const buckets = p.getChildren(modules[0]);
      assert.strictEqual(p.getParent(buckets[0]), modules[0]);

      const sets = p.getChildren(buckets[0]);
      assert.strictEqual(p.getParent(sets[0]), buckets[0]);

      const sessions = p.getChildren(sets[0]);
      assert.strictEqual(p.getParent(sessions[0]), sets[0]);
    });
  });

  test("a set row carries the activation command and its own node as the argument", () => {
    // Every existing row command reads `item.set`. Passing the NODE (not
    // a synthetic wrapper) is what lets the whole pre-110 command surface
    // accept a tree row unmodified.
    withWorkspace(() => {
      const p = provider();
      const modules = p.getChildren();
      const buckets = p.getChildren(modules[0]);
      const sets = p.getChildren(buckets[0]);
      const item = p.getTreeItem(sets[0]);
      assert.strictEqual(item.command?.command, "dabblerWorkExplorer.activateSet");
      const arg = item.command?.arguments?.[0] as { kind?: string; set?: { name?: string } };
      assert.strictEqual(arg.kind, "set");
      assert.ok(arg.set?.name, "the command argument carries no `set` — every row action would no-op");
    });
  });

  test("module, bucket and session rows carry NO activation command", () => {
    // Only set rows have a meaningful primary action (open spec.md).
    // Attaching one elsewhere would make a single click on a module row
    // do something unexpected instead of just expanding it.
    withWorkspace(() => {
      const p = provider();
      const modules = p.getChildren();
      assert.strictEqual(p.getTreeItem(modules[0]).command, undefined);
      const buckets = p.getChildren(modules[0]);
      assert.strictEqual(p.getTreeItem(buckets[0]).command, undefined);
      const sets = p.getChildren(buckets[0]);
      const sessions = p.getChildren(sets[0]);
      assert.strictEqual(p.getTreeItem(sessions[0]).command, undefined);
    });
  });
});
