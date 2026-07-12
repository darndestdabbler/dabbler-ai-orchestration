// Set 093 Session 2 (verdict amendment 2): the `Assign legacy sets to
// module…` flow — target/set pickers + the format-preserving stamp, with an
// injected UI so the flow logic (manifest gating, candidate filtering,
// reporting) is unit-testable under the vscode stub. The writer's guards
// themselves are covered in moduleAuthoring.test.ts.

import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { runAssignLegacySetsFlow, AssignLegacyUi } from "../../commands/assignLegacySets";
import { ModuleManifestEntry, SessionSet } from "../../types";

function tmpRoot(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
function writeManifest(root: string, text: string): void {
  const dir = path.join(root, "docs");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "modules.yaml"), text, "utf8");
}
const SPEC = [
  "# Set",
  "",
  "## Session Set Configuration",
  "",
  "```yaml",
  "tier: full",
  "```",
  "",
  "## Sessions",
  "",
].join("\n");

function fakeSet(root: string, name: string, rawModule: string | null): SessionSet {
  const dir = path.join(root, "docs", "session-sets", name);
  fs.mkdirSync(dir, { recursive: true });
  const specPath = path.join(dir, "spec.md");
  const body = rawModule
    ? SPEC.replace("```yaml\n", `\`\`\`yaml\nmodule: ${rawModule}\n`)
    : SPEC;
  fs.writeFileSync(specPath, body, "utf8");
  return {
    name,
    specPath,
    root,
    config: { module: rawModule } as SessionSet["config"],
  } as SessionSet;
}

interface Log {
  infos: string[];
  errors: string[];
}
function makeUi(
  over: Partial<AssignLegacyUi>,
  log: Log,
): AssignLegacyUi {
  return {
    pickTargetModule: async (entries) => entries[0],
    pickSets: async (candidates) => candidates,
    showInformationMessage: (m) => void log.infos.push(m),
    showErrorMessage: (m) => void log.errors.push(m),
    workspaceRoot: () => undefined,
    readSets: () => [],
    ...over,
  };
}
function fresh(): Log {
  return { infos: [], errors: [] };
}

suite("assignLegacySets flow (Set 093 S2)", () => {
  test("stamps the chosen unassigned sets and reports success", async () => {
    const root = tmpRoot("assignflow-ok-");
    const log = fresh();
    try {
      writeManifest(root, "modules:\n  - slug: greeter\n    title: Greeter\n");
      const a = fakeSet(root, "001-a", null);
      const b = fakeSet(root, "002-b", null);
      const changed = await runAssignLegacySetsFlow(
        makeUi({ workspaceRoot: () => root, readSets: () => [a, b] }, log),
      );
      assert.strictEqual(changed, true);
      assert.strictEqual(log.errors.length, 0);
      assert.ok(fs.readFileSync(a.specPath, "utf8").includes("module: greeter"));
      assert.ok(fs.readFileSync(b.specPath, "utf8").includes("module: greeter"));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("candidates are ONLY unstamped sets under the primary root", async () => {
    const root = tmpRoot("assignflow-cand-");
    const other = tmpRoot("assignflow-other-");
    const log = fresh();
    let offered: string[] = [];
    try {
      writeManifest(root, "modules:\n  - slug: greeter\n    title: Greeter\n");
      const unassigned = fakeSet(root, "001-a", null);
      const stamped = fakeSet(root, "002-b", "greeter"); // already stamped
      const foreign = fakeSet(other, "003-c", null); // different root
      foreign.root = other;
      await runAssignLegacySetsFlow(
        makeUi(
          {
            workspaceRoot: () => root,
            readSets: () => [unassigned, stamped, foreign],
            pickSets: async (candidates) => {
              offered = candidates.map((c) => c.name);
              return []; // cancel — we only inspect the candidate list
            },
          },
          log,
        ),
      );
      assert.deepStrictEqual(offered, ["001-a"]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(other, { recursive: true, force: true });
    }
  });

  test("no declared modules → info, nothing written", async () => {
    const root = tmpRoot("assignflow-nomod-");
    const log = fresh();
    try {
      writeManifest(root, "modules: []\n");
      const a = fakeSet(root, "001-a", null);
      const changed = await runAssignLegacySetsFlow(
        makeUi({ workspaceRoot: () => root, readSets: () => [a] }, log),
      );
      assert.strictEqual(changed, false);
      assert.strictEqual(log.infos.length, 1);
      assert.ok(log.infos[0].includes("New Module"));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("no unassigned candidates → info, nothing written", async () => {
    const root = tmpRoot("assignflow-nocand-");
    const log = fresh();
    try {
      writeManifest(root, "modules:\n  - slug: greeter\n    title: Greeter\n");
      const stamped = fakeSet(root, "001-a", "greeter");
      const changed = await runAssignLegacySetsFlow(
        makeUi({ workspaceRoot: () => root, readSets: () => [stamped] }, log),
      );
      assert.strictEqual(changed, false);
      assert.ok(log.infos[0].includes("No unassigned"));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("cancelling the module pick writes nothing", async () => {
    const root = tmpRoot("assignflow-cancel-");
    const log = fresh();
    try {
      writeManifest(root, "modules:\n  - slug: greeter\n    title: Greeter\n");
      const a = fakeSet(root, "001-a", null);
      const changed = await runAssignLegacySetsFlow(
        makeUi(
          {
            workspaceRoot: () => root,
            readSets: () => [a],
            pickTargetModule: async () => undefined,
          },
          log,
        ),
      );
      assert.strictEqual(changed, false);
      assert.ok(!fs.readFileSync(a.specPath, "utf8").includes("module:"));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("invalid manifest → error, nothing written", async () => {
    const root = tmpRoot("assignflow-invalid-");
    const log = fresh();
    try {
      writeManifest(root, "just a string\n");
      const a = fakeSet(root, "001-a", null);
      const changed = await runAssignLegacySetsFlow(
        makeUi({ workspaceRoot: () => root, readSets: () => [a] }, log),
      );
      assert.strictEqual(changed, false);
      assert.strictEqual(log.errors.length, 1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
