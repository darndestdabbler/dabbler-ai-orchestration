// Set 094 Session 1 (spec D1 + adjudication A) — the shared "Open
// modules.yaml" flow that BOTH the Getting Started Define-modules button and
// the Work Explorer toolbar command drive. Exercises the create-if-absent /
// open matrix against real temp roots, and the never-overwrite guarantee for
// a present (valid or invalid) manifest.

import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  OpenModulesManifestUi,
  openModulesManifestFlow,
} from "../../commands/openModulesManifest";
import { MODULES_YAML_TEMPLATE } from "../../utils/moduleAuthoring";

function tmpRoot(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function manifestAbs(root: string): string {
  return path.join(root, "docs", "modules.yaml");
}

interface UiLog {
  infos: string[];
  errors: string[];
  opened: string[];
}

function makeUi(
  root: string | undefined,
  log: UiLog,
  over: Partial<OpenModulesManifestUi> = {},
): OpenModulesManifestUi {
  return {
    showInformationMessage: (m) => void log.infos.push(m),
    showErrorMessage: (m) => void log.errors.push(m),
    openFile: async (abs) => void log.opened.push(abs),
    workspaceRoot: () => root,
    ...over,
  };
}

function freshLog(): UiLog {
  return { infos: [], errors: [], opened: [] };
}

suite("openModulesManifestFlow (Set 094)", () => {
  test("absent manifest: creates it from the template, opens it, fires the SAVE toast", async () => {
    const root = tmpRoot("open-mod-absent-");
    const log = freshLog();
    try {
      const ok = await openModulesManifestFlow(makeUi(root, log));
      assert.strictEqual(ok, true);
      assert.strictEqual(
        fs.readFileSync(manifestAbs(root), "utf8"),
        MODULES_YAML_TEMPLATE,
        "created from the canonical template",
      );
      assert.deepStrictEqual(log.opened, [manifestAbs(root)], "opens the file");
      assert.strictEqual(log.infos.length, 1, "one created toast");
      assert.ok(log.infos[0].includes("Created"));
      assert.ok(/SAVE/.test(log.infos[0]), "the toast tells the human to SAVE");
      assert.strictEqual(log.errors.length, 0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("present (valid) manifest: opens it, never overwrites, NO created toast", async () => {
    const root = tmpRoot("open-mod-present-");
    const log = freshLog();
    const existing = "modules:\n  - slug: greeter\n    title: Greeter\n";
    try {
      fs.mkdirSync(path.join(root, "docs"), { recursive: true });
      fs.writeFileSync(manifestAbs(root), existing, "utf8");
      const ok = await openModulesManifestFlow(makeUi(root, log));
      assert.strictEqual(ok, true);
      assert.strictEqual(
        fs.readFileSync(manifestAbs(root), "utf8"),
        existing,
        "an existing manifest is never overwritten by open",
      );
      assert.deepStrictEqual(log.opened, [manifestAbs(root)]);
      assert.strictEqual(log.infos.length, 0, "no created toast for an existing file");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("present (INVALID) manifest: opens it untouched so the diagnostics strip can report it", async () => {
    const root = tmpRoot("open-mod-invalid-");
    const log = freshLog();
    const broken = "not a manifest at all\n";
    try {
      fs.mkdirSync(path.join(root, "docs"), { recursive: true });
      fs.writeFileSync(manifestAbs(root), broken, "utf8");
      const ok = await openModulesManifestFlow(makeUi(root, log));
      assert.strictEqual(ok, true);
      assert.strictEqual(
        fs.readFileSync(manifestAbs(root), "utf8"),
        broken,
        "an invalid manifest is opened, never auto-overwritten (guardrails own it)",
      );
      assert.deepStrictEqual(log.opened, [manifestAbs(root)]);
      assert.strictEqual(log.infos.length, 0);
      assert.strictEqual(log.errors.length, 0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("no workspace folder → error toast, returns false, opens nothing", async () => {
    const log = freshLog();
    const ok = await openModulesManifestFlow(makeUi(undefined, log));
    assert.strictEqual(ok, false);
    assert.strictEqual(log.errors.length, 1);
    assert.strictEqual(log.opened.length, 0);
  });

  test("an open failure degrades to a readable error, never an unhandled throw", async () => {
    const root = tmpRoot("open-mod-openfail-");
    const log = freshLog();
    try {
      const ok = await openModulesManifestFlow(
        makeUi(root, log, {
          openFile: async () => {
            throw new Error("cannot open");
          },
        }),
      );
      assert.strictEqual(ok, false);
      assert.strictEqual(log.errors.length, 1);
      assert.ok(log.errors[0].includes("Could not open"));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
