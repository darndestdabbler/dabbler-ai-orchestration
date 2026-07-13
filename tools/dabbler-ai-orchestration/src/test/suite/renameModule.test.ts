// Set 099 Session 1 (verdict decision 1): the `Rename Module…` flow — module
// pick + new slug/title prompts + the two-step confirm, with an injected UI so
// the flow logic (manifest gating, change detection, confirm enumeration,
// reporting) is unit-testable under the vscode stub. The writer's preflights
// and transaction are covered in moduleAuthoring.test.ts.

import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { runRenameModuleFlow, RenameModuleUi } from "../../commands/renameModule";
import { ModuleManifestEntry, SessionSet } from "../../types";

function tmpRoot(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
function writeManifest(root: string, text: string): void {
  const dir = path.join(root, "docs");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "modules.yaml"), text, "utf8");
}
const SPEC = (slug: string): string =>
  [
    "# Set",
    "## Session Set Configuration",
    "```yaml",
    `module: ${slug}`,
    "tier: full",
    "```",
    "",
  ].join("\n");

function makeSet(root: string, name: string, moduleSlug: string): SessionSet {
  const dir = path.join(root, "docs", "session-sets", name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "spec.md"), SPEC(moduleSlug), "utf8");
  return {
    name,
    root,
    config: { module: moduleSlug } as SessionSet["config"],
  } as SessionSet;
}

interface Log {
  infos: string[];
  errors: string[];
  confirms: { summary: string; detail: string }[];
}
function fresh(): Log {
  return { infos: [], errors: [], confirms: [] };
}
function makeUi(over: Partial<RenameModuleUi>, log: Log, root: string): RenameModuleUi {
  return {
    pickModule: async (entries: ModuleManifestEntry[]) => entries[0],
    promptNewSlug: async () => "welcomer",
    promptNewTitle: async (current: string) => current,
    confirm: async (summary, detail) => {
      log.confirms.push({ summary, detail });
      return true;
    },
    showInformationMessage: (m) => void log.infos.push(m),
    showErrorMessage: (m) => void log.errors.push(m),
    workspaceRoot: () => root,
    readSets: () => [],
    ...over,
  };
}

suite("runRenameModuleFlow (Set 099 S1)", () => {
  test("renames slug end-to-end and reports success", async () => {
    const root = tmpRoot("renameflow-ok-");
    try {
      writeManifest(root, "modules:\n  - slug: greeter\n    title: Greeter\n");
      const set = makeSet(root, "001-a", "greeter");
      const log = fresh();
      const ok = await runRenameModuleFlow(
        makeUi({ readSets: () => [set] }, log, root),
      );
      assert.strictEqual(ok, true);
      assert.strictEqual(log.errors.length, 0);
      // The confirm enumerated the affected set.
      assert.match(log.confirms[0].detail, /001-a/);
      // Disk actually changed.
      const manifest = fs.readFileSync(path.join(root, "docs", "modules.yaml"), "utf8");
      assert.ok(manifest.includes("slug: welcomer"));
      const spec = fs.readFileSync(
        path.join(root, "docs", "session-sets", "001-a", "spec.md"),
        "utf8",
      );
      assert.ok(spec.includes("module: welcomer"));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("cancelling the module pick aborts with nothing written", async () => {
    const root = tmpRoot("renameflow-cancel-");
    try {
      writeManifest(root, "modules:\n  - slug: greeter\n    title: Greeter\n");
      const before = fs.readFileSync(path.join(root, "docs", "modules.yaml"), "utf8");
      const log = fresh();
      const ok = await runRenameModuleFlow(
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
    const root = tmpRoot("renameflow-decline-");
    try {
      writeManifest(root, "modules:\n  - slug: greeter\n    title: Greeter\n");
      const before = fs.readFileSync(path.join(root, "docs", "modules.yaml"), "utf8");
      const log = fresh();
      const ok = await runRenameModuleFlow(
        makeUi({ confirm: async () => false }, log, root),
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

  test("no-change (slug and title unchanged) reports and returns false", async () => {
    const root = tmpRoot("renameflow-nochange-");
    try {
      writeManifest(root, "modules:\n  - slug: greeter\n    title: Greeter\n");
      const log = fresh();
      const ok = await runRenameModuleFlow(
        makeUi(
          { promptNewSlug: async () => "greeter", promptNewTitle: async () => "Greeter" },
          log,
          root,
        ),
      );
      assert.strictEqual(ok, false);
      assert.match(log.infos.join(" "), /Nothing to change/i);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("surfaces a writer refusal (running session) as an error", async () => {
    const root = tmpRoot("renameflow-refuse-");
    try {
      writeManifest(root, "modules:\n  - slug: greeter\n    title: Greeter\n");
      makeSet(root, "001-a", "greeter");
      fs.writeFileSync(
        path.join(root, "docs", "session-sets", "001-a", "session-state.json"),
        JSON.stringify({ schemaVersion: 4, status: "in-progress", sessions: [] }),
        "utf8",
      );
      const log = fresh();
      const ok = await runRenameModuleFlow(makeUi({}, log, root));
      assert.strictEqual(ok, false);
      assert.match(log.errors.join(" "), /refused|running session/i);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("errors when no modules are declared", async () => {
    const root = tmpRoot("renameflow-none-");
    try {
      writeManifest(root, "modules: []\n");
      const log = fresh();
      const ok = await runRenameModuleFlow(makeUi({}, log, root));
      assert.strictEqual(ok, false);
      assert.match(log.infos.join(" "), /No modules are declared/i);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

// Set 100 Session 2 (explicit-target seam): a row/context invocation
// carries its module directly, so the QuickPick is skipped entirely — this
// is the "targeting parity" contract (row/context resolve identically to
// the palette's own pick, minus the interactive step).
suite("runRenameModuleFlow — preselectedSlug (Set 100 S2)", () => {
  test("a preselected slug skips pickModule and renames that module", async () => {
    const root = tmpRoot("renameflow-preselect-ok-");
    try {
      writeManifest(
        root,
        "modules:\n  - slug: greeter\n    title: Greeter\n  - slug: clock\n    title: Clock\n",
      );
      const log = fresh();
      const ok = await runRenameModuleFlow(
        makeUi(
          {
            pickModule: async () => {
              throw new Error("pickModule must not be called with a preselected slug");
            },
          },
          log,
          root,
        ),
        { preselectedSlug: "clock" },
      );
      assert.strictEqual(ok, true);
      const manifest = fs.readFileSync(path.join(root, "docs", "modules.yaml"), "utf8");
      assert.ok(manifest.includes("slug: welcomer"));
      assert.ok(manifest.includes("slug: greeter"), "the OTHER module is untouched");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("a stale preselected slug fails loud — never falls back to the picker", async () => {
    const root = tmpRoot("renameflow-preselect-stale-");
    try {
      writeManifest(root, "modules:\n  - slug: greeter\n    title: Greeter\n");
      const before = fs.readFileSync(path.join(root, "docs", "modules.yaml"), "utf8");
      const log = fresh();
      const ok = await runRenameModuleFlow(
        makeUi(
          {
            pickModule: async () => {
              throw new Error("pickModule must not be called with a preselected slug");
            },
          },
          log,
          root,
        ),
        { preselectedSlug: "removed-module" },
      );
      assert.strictEqual(ok, false);
      assert.match(log.errors.join(" "), /removed-module.*no longer declared/i);
      assert.strictEqual(
        fs.readFileSync(path.join(root, "docs", "modules.yaml"), "utf8"),
        before,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("palette path (no opts) still uses pickModule", async () => {
    const root = tmpRoot("renameflow-palette-");
    try {
      writeManifest(root, "modules:\n  - slug: greeter\n    title: Greeter\n");
      const log = fresh();
      let picked = false;
      const ok = await runRenameModuleFlow(
        makeUi(
          {
            pickModule: async (entries) => {
              picked = true;
              return entries[0];
            },
          },
          log,
          root,
        ),
      );
      assert.strictEqual(ok, true);
      assert.strictEqual(picked, true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
