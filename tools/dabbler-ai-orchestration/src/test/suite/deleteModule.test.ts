// Set 099 Session 2 (operator's adjudicated disposition rule): the
// `Delete Module…` flow — module pick + the two-step confirm enumerating
// the SAME classification the writer acts on, with an injected UI so the
// flow logic (manifest gating, confirm enumeration, reporting) is
// unit-testable under the vscode stub. The writer's classification,
// preflights, and transaction are covered in moduleAuthoring.test.ts.

import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { runDeleteModuleFlow, DeleteModuleUi } from "../../commands/deleteModule";
import { ModuleManifestEntry } from "../../types";

function tmpRoot(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
function writeManifest(root: string, text: string): void {
  const dir = path.join(root, "docs");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "modules.yaml"), text, "utf8");
}
const SPEC = (slug: string, kindLine?: string): string =>
  [
    "# Set",
    "## Session Set Configuration",
    "```yaml",
    `module: ${slug}`,
    ...(kindLine ? [kindLine] : []),
    "tier: full",
    "```",
    "",
  ].join("\n");

function makeSet(root: string, name: string, moduleSlug: string, kindLine?: string): string {
  const dir = path.join(root, "docs", "session-sets", name);
  fs.mkdirSync(dir, { recursive: true });
  const specAbs = path.join(dir, "spec.md");
  fs.writeFileSync(specAbs, SPEC(moduleSlug, kindLine), "utf8");
  return specAbs;
}

interface Log {
  infos: string[];
  errors: string[];
  confirms: { summary: string; detail: string }[];
}
function fresh(): Log {
  return { infos: [], errors: [], confirms: [] };
}
function makeUi(over: Partial<DeleteModuleUi>, log: Log, root: string): DeleteModuleUi {
  return {
    pickModule: async (entries: ModuleManifestEntry[]) => entries[0],
    confirm: async (summary, detail) => {
      log.confirms.push({ summary, detail });
      return true;
    },
    showInformationMessage: (m) => void log.infos.push(m),
    showErrorMessage: (m) => void log.errors.push(m),
    workspaceRoot: () => root,
    ...over,
  };
}

suite("runDeleteModuleFlow (Set 099 S2)", () => {
  test("deletes end-to-end and reports the actual disposition", async () => {
    const root = tmpRoot("deleteflow-ok-");
    try {
      writeManifest(root, "modules:\n  - slug: greeter\n    title: Greeter\n");
      const completeSpec = makeSet(root, "001-complete", "greeter");
      fs.writeFileSync(
        path.join(path.dirname(completeSpec), "session-state.json"),
        JSON.stringify({ schemaVersion: 4, status: "complete", sessions: [] }),
        "utf8",
      );
      makeSet(root, "002-notstarted", "greeter");
      const log = fresh();
      const ok = await runDeleteModuleFlow(makeUi({}, log, root));
      assert.strictEqual(ok, true);
      assert.strictEqual(log.errors.length, 0);
      // The confirm enumerated the actual classification.
      assert.match(log.confirms[0].detail, /001-complete/);
      assert.match(log.confirms[0].detail, /002-notstarted/);
      // Disk actually changed: manifest entry gone.
      const manifest = fs.readFileSync(path.join(root, "docs", "modules.yaml"), "utf8");
      assert.ok(!manifest.includes("slug: greeter"));
      // Completed set untouched; not-started set cancelled.
      assert.ok(fs.existsSync(completeSpec));
      assert.ok(
        fs.existsSync(
          path.join(root, "docs", "session-sets", "002-notstarted", "CANCELLED.md"),
        ),
      );
      assert.match(log.infos.join(" "), /Deleted module "greeter"/i);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("cancelling the module pick aborts with nothing written", async () => {
    const root = tmpRoot("deleteflow-cancel-");
    try {
      writeManifest(root, "modules:\n  - slug: greeter\n    title: Greeter\n");
      const before = fs.readFileSync(path.join(root, "docs", "modules.yaml"), "utf8");
      const log = fresh();
      const ok = await runDeleteModuleFlow(
        makeUi({ pickModule: async () => undefined }, log, root),
      );
      assert.strictEqual(ok, false);
      assert.strictEqual(
        fs.readFileSync(path.join(root, "docs", "modules.yaml"), "utf8"),
        before,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("declining the confirm leaves everything untouched", async () => {
    const root = tmpRoot("deleteflow-decline-");
    try {
      writeManifest(root, "modules:\n  - slug: greeter\n    title: Greeter\n");
      makeSet(root, "001-a", "greeter");
      const before = fs.readFileSync(path.join(root, "docs", "modules.yaml"), "utf8");
      const log = fresh();
      const ok = await runDeleteModuleFlow(makeUi({ confirm: async () => false }, log, root));
      assert.strictEqual(ok, false);
      assert.strictEqual(
        fs.readFileSync(path.join(root, "docs", "modules.yaml"), "utf8"),
        before,
      );
      assert.ok(fs.existsSync(path.join(root, "docs", "session-sets", "001-a")));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("surfaces a writer refusal (running session) as an error", async () => {
    const root = tmpRoot("deleteflow-refuse-");
    try {
      writeManifest(root, "modules:\n  - slug: greeter\n    title: Greeter\n");
      const specAbs = makeSet(root, "001-a", "greeter");
      fs.writeFileSync(
        path.join(path.dirname(specAbs), "session-state.json"),
        JSON.stringify({ schemaVersion: 4, status: "in-progress", sessions: [] }),
        "utf8",
      );
      const log = fresh();
      const ok = await runDeleteModuleFlow(makeUi({}, log, root));
      assert.strictEqual(ok, false);
      assert.match(log.errors.join(" "), /refused|running session/i);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("errors when no modules are declared", async () => {
    const root = tmpRoot("deleteflow-none-");
    try {
      writeManifest(root, "modules: []\n");
      const log = fresh();
      const ok = await runDeleteModuleFlow(makeUi({}, log, root));
      assert.strictEqual(ok, false);
      assert.match(log.infos.join(" "), /No modules are declared/i);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("an invalid manifest surfaces the invalid-manifest message", async () => {
    const root = tmpRoot("deleteflow-invalid-");
    try {
      writeManifest(root, "this: is not a modules list\n");
      const log = fresh();
      const ok = await runDeleteModuleFlow(makeUi({}, log, root));
      assert.strictEqual(ok, false);
      assert.match(log.errors.join(" "), /not a valid module manifest/i);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
