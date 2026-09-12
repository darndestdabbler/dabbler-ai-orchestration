import * as assert from "assert";
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

  test("a projection already on disk is re-derived, because nothing can watch what it is derived from", async () => {
    // The inverse of what this asserted until now, and the reason is the
    // defect the old behaviour had: the catalog and this operator's
    // preferences live at the USER level, where a workspace watcher cannot
    // reach them at all, so a projection that exists and is wrong stood
    // until a manifest happened to move. A stale file that looks exactly
    // like a current one is what an operator reads as the pane lying.
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
    // catalog and this operator's preferences, both at the USER level, where
    // no `RelativePattern` this window could build reaches them. A block
    // sitting in the file would therefore be a reading nothing can ever
    // invalidate -- and, since any router may have written it, a reading
    // this extension cannot vouch for (D276).
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
