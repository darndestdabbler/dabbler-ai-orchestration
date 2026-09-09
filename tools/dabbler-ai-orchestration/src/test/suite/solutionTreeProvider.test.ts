import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { SolutionTreeProvider } from "../../providers/SolutionTreeProvider";
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
    const projectionFile = path.join(root, ".dabbler", "solution", "projection.json");
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

  test("a projection already on disk is left standing, not re-derived", async () => {
    const projectionFile = path.join(root, ".dabbler", "solution", "projection.json");
    fs.mkdirSync(path.dirname(projectionFile), { recursive: true });
    const handWritten = {
      solution: { name: "x", title: "x", multi: false, implicit: true, moduleCount: 1 },
      modules: [],
    };
    fs.writeFileSync(projectionFile, JSON.stringify(handWritten), "utf8");

    provider = new SolutionTreeProvider(root);
    await sleep(PAST_SETTLE_MS);

    // Untouched: still exactly the bytes this test wrote, because the
    // constructor found a projection already there and derived nothing.
    assert.strictEqual(fs.readFileSync(projectionFile, "utf8"), JSON.stringify(handWritten));
  });
});
