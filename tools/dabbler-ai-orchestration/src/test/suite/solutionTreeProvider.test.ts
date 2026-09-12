import * as assert from "assert";
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { SolutionTreeProvider, CONFIGURATION_TTL_MS } from "../../providers/SolutionTreeProvider";
import { rootNodes } from "../../providers/solutionTreeModel";
import { makeTempDir, rmrf, writeFileTree } from "./helpers";

/** How long past the provider's own SETTLE_MS a background derivation is given to land. */
const PAST_SETTLE_MS = 800;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

suite("SolutionTreeProvider: derives at startup", () => {
  let root: string;
  let provider: SolutionTreeProvider | undefined;

  setup(() => (root = makeTempDir("dabbler-solexp-")));
  teardown(() => {
    provider?.dispose();
    provider = undefined;
    rmrf(root);
  });

  test("a fresh clone with a manifest but no projection derives one without any watcher event", async () => {
    writeFileTree(root, {
      "docs/modules.yaml":
        "modules:\n  - slug: model\n    title: Model\n  - slug: app\n    title: App\n    dependsOn: [model]\n",
    });
    const projectionFile = path.join(root, ".dabbler", "solution", "solution.json");
    assert.ok(!fs.existsSync(projectionFile), "precondition: no projection yet");

    provider = new SolutionTreeProvider(root);
    // Nothing touches a watcher: the constructor itself is what must derive.
    await sleep(PAST_SETTLE_MS);

    assert.ok(fs.existsSync(projectionFile), "projection was never derived");
    const projection = provider.currentProjection();
    assert.ok(projection, "provider read no projection back");
    assert.strictEqual(projection!.modules.length, 2);
    assert.deepStrictEqual(
      projection!.modules.map((m) => m.slug),
      ["model", "app"],
    );
    // The welcome text is what NO_MODULES_YET renders over; a derived,
    // populated projection must offer real root rows instead.
    assert.ok(rootNodes().length > 0);
  });

  test("a projection already on disk is re-derived, because a stale one looks current", async () => {
    // The inverse of what this asserted until session 155, and the reason is
    // the defect the old behaviour had: deriving only over a MISSING file
    // left a projection that exists and is wrong standing until a manifest
    // happened to move. A stale file that looks exactly like a current one
    // is what an operator reads as the pane lying.
    const projectionFile = path.join(root, ".dabbler", "solution", "solution.json");
    fs.mkdirSync(path.dirname(projectionFile), { recursive: true });
    const stale = {
      solution: { name: "x", title: "x", multi: false, implicit: true, moduleCount: 1 },
      modules: [],
    };
    fs.writeFileSync(projectionFile, JSON.stringify(stale), "utf8");
    writeFileTree(root, {
      "docs/modules.yaml": "modules:\n  - slug: model\n    title: Model\n",
    });

    provider = new SolutionTreeProvider(root);
    await sleep(PAST_SETTLE_MS);

    // Not the bytes this test wrote: the manifest that was already there
    // when the window opened is what the pane renders.
    assert.notStrictEqual(fs.readFileSync(projectionFile, "utf8"), JSON.stringify(stale));
    assert.deepStrictEqual(
      provider.currentProjection()?.modules.map((m) => m.slug),
      ["model"],
    );
  });

  test("the configuration is asked for at read, never taken from the file", async () => {
    // The solution document carries the module graph and nothing about what
    // a session would be run with: configuration is derived from the model
    // catalog and this operator's preferences, both at the USER level and
    // outside every repository. A block sitting in the file would be a
    // reading no workspace source can invalidate -- and, since any router
    // may have written it, a reading this extension cannot vouch for (D276).
    // What DOES invalidate it is the watcher over those files, which the
    // test below holds the provider to.
    const projectionFile = path.join(root, ".dabbler", "solution", "solution.json");
    fs.mkdirSync(path.dirname(projectionFile), { recursive: true });
    fs.writeFileSync(
      projectionFile,
      JSON.stringify({
        solution: { name: "x", title: "x", multi: false, implicit: true, moduleCount: 1 },
        modules: [],
        configuration: { engines: { chosen: "an-engine-no-router-would-name" } },
      }),
      "utf8",
    );
    writeFileTree(root, {
      "docs/modules.yaml": "modules:\n  - slug: model\n    title: Model\n",
    });

    provider = new SolutionTreeProvider(root);
    await sleep(PAST_SETTLE_MS);

    const configuration = provider.currentProjection()?.configuration;
    assert.ok(configuration, "the provider rendered no configuration at all");
    assert.notStrictEqual(
      configuration.engines?.chosen,
      "an-engine-no-router-would-name",
      "the file's block was rendered, so a stale reading can still reach the pane",
    );
  });

  test("watches the user-level directory and repaints when it moves", async () => {
    // The TTL alone is not enough and that is the point: a value that is
    // fresh WHEN ASKED is not a pane that updates, because VS Code has no
    // reason to ask again. Something has to fire a tree-data change, and
    // nothing in this workspace ever can -- the catalog and the preferences
    // are outside every repository. A `RelativePattern` over an absolute
    // base reaches them, so they are watched rather than declared unwatchable.
    // The stub's hooks where this suite runs through the stub, and nothing
    // where it does not: under a real VS Code host `workspace` is the real
    // API and has neither, so calling them unconditionally would crash the
    // test instead of running it. The watchers are then real, and the
    // assertion below falls back to what any host can show -- that the
    // reading is current and the tree was told.
    const stub = vscode.workspace as unknown as {
      __watchers?: () => { base: string | null; pattern: string; onChange: (() => void)[] }[];
      __clearWatchers?: () => unknown;
    };
    const stubbed = typeof stub.__watchers === "function";
    if (stubbed) stub.__clearWatchers?.();
    writeFileTree(root, {
      "docs/modules.yaml": "modules:\n  - slug: model\n    title: Model\n",
    });
    provider = new SolutionTreeProvider(root);
    await sleep(PAST_SETTLE_MS);

    const preferences = process.env.DABBLER_PREFERENCES_PATH as string;
    const userDir = path.dirname(preferences);
    const watching = stubbed
      ? (stub.__watchers as () => { base: string | null; onChange: (() => void)[] }[])().filter(
          (entry) => entry.base !== null && path.resolve(entry.base) === path.resolve(userDir),
        )
      : [];
    if (stubbed) {
      assert.ok(watching.length > 0, "nothing watches the user-level configuration directory");
    }

    let repainted = false;
    provider.onDidChangeTreeData(() => (repainted = true));
    fs.mkdirSync(userDir, { recursive: true });
    fs.writeFileSync(
      preferences,
      JSON.stringify({
        schema_version: 1,
        written_by: "test",
        written_at: "2026-09-12T00:00:00Z",
        engine: "codex",
      }),
      "utf8",
    );
    // Fire what the stub recorded; a real host fires its own, and is given
    // the time to.
    for (const handler of watching.flatMap((entry) => entry.onChange)) handler();
    if (!stubbed) await sleep(PAST_SETTLE_MS);

    assert.ok(repainted, "the tree was never told to repaint");
    assert.strictEqual(provider.currentProjection()?.configuration?.engines?.chosen, "codex");
    fs.rmSync(preferences, { force: true });
  });

  test("re-reads the configuration when nothing in the workspace moved", async () => {
    // The inputs are at the USER level, so no watcher here can ever say they
    // changed -- which means a configuration frozen beside the module graph
    // is stale from the first read until something unrelated happens. A
    // `dabbler configure` or a catalog refresh typed in a terminal has to
    // reach the pane, and this is the only thing that makes it.
    writeFileTree(root, {
      "docs/modules.yaml": "modules:\n  - slug: model\n    title: Model\n",
    });
    provider = new SolutionTreeProvider(root);
    await sleep(PAST_SETTLE_MS);
    const before = provider.currentProjection()?.configuration?.engines?.chosen;

    // The preference this machine chose, written the way a terminal writes
    // it: the user-level file itself, with nothing in the workspace touched.
    // The runner points that path at a temp file, so this writes nothing of
    // the operator's.
    const preferences = process.env.DABBLER_PREFERENCES_PATH as string;
    fs.mkdirSync(path.dirname(preferences), { recursive: true });
    fs.writeFileSync(
      preferences,
      JSON.stringify({
        schema_version: 1,
        written_by: "test",
        written_at: "2026-09-12T00:00:00Z",
        engine: "codex",
      }),
      "utf8",
    );
    await sleep(CONFIGURATION_TTL_MS + 50);

    const after = provider.currentProjection()?.configuration?.engines?.chosen;
    assert.strictEqual(after, "codex", `was ${String(before)}, then ${String(after)}`);
    fs.rmSync(preferences, { force: true });
  });
});
