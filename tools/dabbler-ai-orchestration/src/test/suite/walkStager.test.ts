// Set 111 S4 — the walk stager, and its parity with the Layer 3 harness.
//
// The stager exists so a guided-look UAT starts itself. Its value depends
// on launching the SAME window the Playwright suite exercises: if the two
// drift, the operator renders judgment on a configuration no test ever saw.
// `scripts/vscode-launch.js` is the single definition of the isolation
// flags; this suite pins the Playwright harness against it, so adding a
// flag in one place and not the other fails here rather than silently.

import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
// A local TS import keeps this file on the CommonJS load path under
// ts-node, which is what makes the `require` calls below legal — without
// it mocha resolves the file through the ESM loader and every `require`
// is a ReferenceError. `readSessionSets` is also genuinely used, to prove
// the staged fixture workspace is one the extension can actually read.
import { readSessionSets } from "../../utils/fileSystem";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const launch = require("../../../scripts/vscode-launch.js") as {
  EXTENSION_ROOT: string;
  ISOLATION_FLAGS: string[];
  findCodeBinary: (testRoot?: string) => string;
  launchArgs: (opts?: Record<string, unknown>) => string[];
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const stager = require("../../../scripts/stage-walk.js") as {
  parseArgs: (argv: string[]) => {
    keep: boolean;
    walkDoc: string | null;
    workspace: string | null;
  };
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const generator = require("../../../scripts/make-uat-workspace.js") as {
  makeUatWorkspace: (targetParent?: string) => string;
};

const EXTENSION_ROOT = path.resolve(__dirname, "..", "..", "..");
const HARNESS_SRC = path.join(
  EXTENSION_ROOT,
  "src",
  "test",
  "playwright",
  "electronLaunch.ts",
);

suite("walk stager", () => {
  suite("launch-arg parity with the Playwright harness", () => {
    test("every isolation flag is used by electronLaunch.ts too", () => {
      const harness = fs.readFileSync(HARNESS_SRC, "utf8");
      for (const flag of launch.ISOLATION_FLAGS) {
        assert.ok(
          harness.includes(`"${flag}"`),
          `electronLaunch.ts does not pass ${flag}; the walk would launch a ` +
            "window the Playwright suite never exercises",
        );
      }
    });

    test("the harness passes no isolation flag the stager omits", () => {
      // The reverse direction: a flag added to the harness alone would
      // mean the SUITE runs isolated and the WALK does not.
      const harness = fs.readFileSync(HARNESS_SRC, "utf8");
      const inLaunchCall = harness.slice(
        harness.indexOf("_electron.launch("),
        harness.indexOf("workspacePath,\n    ],"),
      );
      const found = [...inLaunchCall.matchAll(/"(--[a-z-]+)"/g)].map((m) => m[1]);
      for (const flag of found) {
        assert.ok(
          launch.ISOLATION_FLAGS.includes(flag),
          `electronLaunch.ts passes ${flag} but scripts/vscode-launch.js ` +
            "does not; the staged walk would be less isolated than the suite",
        );
      }
      assert.ok(found.length > 0, "expected to find flags in the launch call");
    });
  });

  suite("launchArgs", () => {
    const base = {
      extensionRoot: "/ext",
      userDataDir: "/tmp/ud",
      extensionsDir: "/tmp/ed",
      workspacePath: "/tmp/ws/x.code-workspace",
    };

    test("puts the workspace path last", () => {
      const argv = launch.launchArgs(base);
      assert.strictEqual(argv[argv.length - 1], base.workspacePath);
    });

    test("isolates the profile and the extensions dir", () => {
      const argv = launch.launchArgs(base);
      assert.ok(argv.includes("--user-data-dir=/tmp/ud"));
      assert.ok(argv.includes("--extensions-dir=/tmp/ed"));
      assert.ok(argv.includes("--extensionDevelopmentPath=/ext"));
    });

    test("carries every isolation flag", () => {
      const argv = launch.launchArgs(base);
      for (const flag of launch.ISOLATION_FLAGS) {
        assert.ok(argv.includes(flag), `missing ${flag}`);
      }
    });

    test("inserts extraArgs before the workspace path", () => {
      const argv = launch.launchArgs({ ...base, extraArgs: ["/tmp/walk.md"] });
      assert.ok(argv.indexOf("/tmp/walk.md") < argv.indexOf(base.workspacePath));
    });

    test("refuses an incomplete request rather than launching unisolated", () => {
      assert.throws(() => launch.launchArgs({ workspacePath: "/x" }));
      assert.throws(() => launch.launchArgs({}));
      assert.throws(() => launch.launchArgs());
    });
  });

  suite("findCodeBinary", () => {
    test("prefers the newest cached archive by numeric version", () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "vsc-probe-"));
      try {
        // 1.99.0 sorts ahead of 1.120.0 lexically — the gotcha this
        // comparator exists to avoid.
        for (const v of ["vscode-win32-archive-1.99.0", "vscode-win32-archive-1.120.0"]) {
          fs.mkdirSync(path.join(root, v), { recursive: true });
          fs.writeFileSync(path.join(root, v, "Code.exe"), "");
        }
        const found = launch.findCodeBinary(root);
        assert.ok(
          found.includes("1.120.0"),
          `expected the 1.120.0 archive, got ${found}`,
        );
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });

    test("throws (never falls back to a system install) when nothing is cached", () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "vsc-empty-"));
      const saved = process.env.VSCODE_BIN;
      delete process.env.VSCODE_BIN;
      try {
        assert.throws(() => launch.findCodeBinary(root), /No VS Code binary/);
      } finally {
        if (saved !== undefined) process.env.VSCODE_BIN = saved;
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  });

  suite("argument parsing", () => {
    test("defaults to a fresh, disposable workspace", () => {
      const a = stager.parseArgs([]);
      assert.strictEqual(a.keep, false);
      assert.strictEqual(a.workspace, null);
      assert.strictEqual(a.walkDoc, null);
    });

    test("--keep, --walk-doc and --workspace are read", () => {
      const a = stager.parseArgs([
        "--keep",
        "--walk-doc", "docs/walk.md",
        "--workspace", "/tmp/x.code-workspace",
      ]);
      assert.strictEqual(a.keep, true);
      assert.strictEqual(a.walkDoc, "docs/walk.md");
      assert.strictEqual(a.workspace, "/tmp/x.code-workspace");
    });
  });

  suite("the staged workspace is one the extension can read", () => {
    test("the generated fixture yields session sets", () => {
      // The whole point of the stager is that the operator lands on
      // something worth looking at. A workspace the extension derives
      // zero sets from would open on an empty tree and waste the walk.
      const parent = fs.mkdtempSync(path.join(os.tmpdir(), "walk-ws-"));
      try {
        const workspacePath = generator.makeUatWorkspace(parent);
        const ws = JSON.parse(fs.readFileSync(workspacePath, "utf8")) as {
          folders: { path: string }[];
        };
        const root = path.dirname(workspacePath);
        let total = 0;
        for (const folder of ws.folders) {
          total += readSessionSets(path.resolve(root, folder.path)).length;
        }
        assert.ok(
          total > 0,
          "the staged fixture workspace derives no session sets; the walk " +
            "would open on an empty Work Explorer",
        );
      } finally {
        fs.rmSync(parent, { recursive: true, force: true });
      }
    });
  });

  suite("the auto-reveal is gated", () => {    test("extension.ts reveals the view only under DABBLER_WALK", () => {
      const src = fs.readFileSync(
        path.join(EXTENSION_ROOT, "src", "extension.ts"),
        "utf8",
      );
      assert.ok(
        src.includes('process.env.DABBLER_WALK === "1"'),
        "the reveal must be gated on DABBLER_WALK",
      );
      assert.ok(
        src.includes("workbench.view.extension.dabblerSessionSetsContainer"),
        "the reveal must target this extension's view container",
      );
    });

    test("only the stager sets DABBLER_WALK", () => {
      const stagerSrc = fs.readFileSync(
        path.join(EXTENSION_ROOT, "scripts", "stage-walk.js"),
        "utf8",
      );
      assert.ok(stagerSrc.includes("DABBLER_WALK"));
    });
  });
});
