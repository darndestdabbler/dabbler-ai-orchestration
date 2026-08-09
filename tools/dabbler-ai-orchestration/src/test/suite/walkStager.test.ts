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
  WALK_COMPANION_PATH: string;
  electronEnv: (
    extra?: Record<string, string>,
    sourceEnv?: Record<string, string | undefined>,
    platform?: string,
  ) => Record<string, string>;
  resolveCodeExecutable: (
    versionDir: string,
    platform: string,
    io: {
      exists: (p: string) => boolean;
      isDirectory: (p: string) => boolean;
      readdir: (p: string) => string[];
    },
  ) => string | null;
  findCodeBinary: (testRoot?: string) => string;
  launchArgs: (opts?: Record<string, unknown>) => string[];
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const stager = require("../../../scripts/stage-walk.js") as {
  parseArgs: (argv: string[]) => {
    keep: boolean;
    walkDoc: string | null;
    workspace: string | null;
    empty: boolean;
  };
  makeEmptyWorkspace: (targetParent?: string) => string;
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
      assert.strictEqual(a.empty, false);
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

    test("--empty is read", () => {
      assert.strictEqual(stager.parseArgs(["--empty"]).empty, true);
    });
  });

  suite("the empty workspace (Set 112 S3)", () => {
    // The Getting Started form renders only while a workspace has no
    // materialized session set, so the default fixture -- which ships four
    // -- can never show it. Without this mode the onboarding surface is
    // unwalkable, which is the surface Set 112 changed.
    test("derives zero session sets, which is what shows the form", () => {
      const parent = fs.mkdtempSync(path.join(os.tmpdir(), "walk-empty-"));
      try {
        const project = stager.makeEmptyWorkspace(parent);
        assert.strictEqual(readSessionSets(project).length, 0);
      } finally {
        fs.rmSync(parent, { recursive: true, force: true });
      }
    });

    test("is a real folder with content, not a bare temp directory", () => {
      // An empty folder and a project are different windows to look at;
      // the operator should judge the one a new adopter actually opens.
      const parent = fs.mkdtempSync(path.join(os.tmpdir(), "walk-empty-"));
      try {
        const project = stager.makeEmptyWorkspace(parent);
        assert.ok(fs.statSync(project).isDirectory());
        assert.ok(fs.existsSync(path.join(project, "README.md")));
        assert.ok(!fs.existsSync(path.join(project, "docs", "session-sets")));
      } finally {
        fs.rmSync(parent, { recursive: true, force: true });
      }
    });

    test("its parent is disposable, so cleanup removes the whole staging dir", () => {
      // main() deletes path.dirname(workspacePath); the project must
      // therefore sit INSIDE the mkdtemp dir, or cleanup would either miss
      // it or reach outside the staging area.
      const parent = fs.mkdtempSync(path.join(os.tmpdir(), "walk-empty-"));
      try {
        const project = stager.makeEmptyWorkspace(parent);
        const staging = path.dirname(project);
        assert.notStrictEqual(path.resolve(staging), path.resolve(parent));
        assert.strictEqual(path.resolve(path.dirname(staging)), path.resolve(parent));
      } finally {
        fs.rmSync(parent, { recursive: true, force: true });
      }
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

  suite("the walk actually starts itself", () => {
    test("the stager loads the walk companion as a second dev extension", () => {
      const src = fs.readFileSync(
        path.join(EXTENSION_ROOT, "scripts", "stage-walk.js"),
        "utf8",
      );
      assert.ok(
        src.includes("developmentPaths: [WALK_COMPANION_PATH]"),
        "the stager must load the companion; without it nothing activates " +
          "at startup and the walk opens on the file Explorer",
      );
    });

    test("launchArgs emits one --extensionDevelopmentPath per extension", () => {
      const argv = launch.launchArgs({
        extensionRoot: "/ext",
        userDataDir: "/tmp/ud",
        extensionsDir: "/tmp/ed",
        workspacePath: "/tmp/ws/x.code-workspace",
        developmentPaths: ["/ext/scripts/walk-companion"],
      });
      const devPaths = argv.filter((a) =>
        a.startsWith("--extensionDevelopmentPath="),
      );
      assert.deepStrictEqual(devPaths, [
        "--extensionDevelopmentPath=/ext",
        "--extensionDevelopmentPath=/ext/scripts/walk-companion",
      ]);
    });

    test("the companion activates at startup, not on view visibility", () => {
      // This is the whole defect in one assertion. The product extension
      // declares no explicit activation events and contributes views, so it
      // activates when the Dabbler view becomes VISIBLE. A reveal living
      // inside it waits on the event it is supposed to cause.
      const manifest = JSON.parse(
        fs.readFileSync(
          path.join(launch.WALK_COMPANION_PATH, "package.json"),
          "utf8",
        ),
      ) as { activationEvents: string[]; main: string };
      assert.deepStrictEqual(manifest.activationEvents, ["onStartupFinished"]);
      assert.ok(
        fs.existsSync(
          path.join(launch.WALK_COMPANION_PATH, manifest.main.replace("./", "")),
        ),
        "the companion manifest must point at a file that exists",
      );
    });

    test("the companion reveals this extension's view container", () => {
      const companion = require(
        path.join(launch.WALK_COMPANION_PATH, "extension.js"),
      ) as { CONTAINER: string };
      const pkg = JSON.parse(
        fs.readFileSync(path.join(EXTENSION_ROOT, "package.json"), "utf8"),
      ) as { contributes: { viewsContainers: { activitybar: { id: string }[] } } };
      const ids = pkg.contributes.viewsContainers.activitybar.map((c) => c.id);
      assert.ok(
        ids.some((id) => companion.CONTAINER === `workbench.view.extension.${id}`),
        `companion reveals ${companion.CONTAINER}, which is not a container ` +
          `this extension contributes (${ids.join(", ")})`,
      );
    });

    test("the product extension carries no walk-specific code", () => {
      const src = fs.readFileSync(
        path.join(EXTENSION_ROOT, "src", "extension.ts"),
        "utf8",
      );
      assert.ok(
        !src.includes("process.env.DABBLER_WALK"),
        "a reveal gated inside activate() cannot fire at startup; it belongs " +
          "in the walk companion",
      );
    });

    test("the companion is excluded from the VSIX", () => {
      const ignore = fs.readFileSync(
        path.join(EXTENSION_ROOT, ".vscodeignore"),
        "utf8",
      );
      assert.ok(
        ignore.split(/\r?\n/).includes("scripts/**"),
        "scripts/** must stay ignored or the dev-only companion ships",
      );
    });
  });

  suite("the child environment is an allowlist, not an inheritance", () => {
    const polluted = {
      PATH: "/usr/bin",
      ELECTRON_RUN_AS_NODE: "1",
      VSCODE_IPC_HOOK_CLI: "/tmp/sock",
      VSCODE_PID: "1234",
      SOME_SECRET_TOKEN: "shh",
    };

    test("VS Code's own IPC variables are not inherited", () => {
      const env = launch.electronEnv({}, polluted, "linux");
      for (const banned of [
        "ELECTRON_RUN_AS_NODE",
        "VSCODE_IPC_HOOK_CLI",
        "VSCODE_PID",
      ]) {
        assert.ok(
          !(banned in env),
          `${banned} leaked into the walk environment; a walk started from ` +
            "VS Code's integrated terminal would parse args instead of opening",
        );
      }
    });

    test("unknown variables are excluded by default, not by blocklist", () => {
      const env = launch.electronEnv({}, polluted, "linux");
      assert.ok(!("SOME_SECRET_TOKEN" in env));
      assert.strictEqual(env.PATH, "/usr/bin");
    });

    test("launch-specific extras are applied after filtering", () => {
      const env = launch.electronEnv({ DABBLER_WALK_MARKER: "/tmp/m" }, polluted, "linux");
      assert.strictEqual(env.DABBLER_WALK_MARKER, "/tmp/m");
    });

    test("the stager uses the allowlist rather than spreading process.env", () => {
      const src = fs.readFileSync(
        path.join(EXTENSION_ROOT, "scripts", "stage-walk.js"),
        "utf8",
      );
      // Match the CODE, not the comment that explains why the code is gone.
      assert.ok(
        !/env:\s*\{\s*\.\.\.process\.env/.test(src),
        "stage-walk.js still spreads the parent environment into the child",
      );
      assert.ok(src.includes("env: electronEnv("));
    });
  });

  suite("binary discovery is shared with the Playwright harness", () => {
    const fakeIo = (tree: Record<string, string[]>) => ({
      exists: (p: string) => p in tree || Object.keys(tree).some((k) => k === p),
      isDirectory: (p: string) => p in tree,
      readdir: (p: string) => tree[p] ?? [],
    });

    test("a macOS .app bundle cache resolves", () => {
      // The regression that shipped: the stager's first resolver only looked
      // at <versionDir>/Contents/MacOS/Electron and missed the standard
      // @vscode/test-electron macOS layout the harness already handled, so
      // `npm run walk` threw "No VS Code binary found" on every Mac.
      const dir = path.join("/c", "vscode-darwin-arm64-1.132.0");
      const bundle = path.join(dir, "Visual Studio Code.app");
      const macOs = path.join(bundle, "Contents", "MacOS");
      const io = fakeIo({
        [dir]: ["Visual Studio Code.app"],
        [macOs]: ["Electron"],
      });
      assert.strictEqual(
        launch.resolveCodeExecutable(dir, "darwin", io)?.replace(/\\/g, "/"),
        path.join(macOs, "Electron").replace(/\\/g, "/"),
      );
    });

    test("electronLaunch.ts delegates rather than keeping a second copy", () => {
      const harness = fs.readFileSync(HARNESS_SRC, "utf8");
      assert.ok(
        harness.includes('require("../../../scripts/vscode-launch.js")'),
        "two implementations of 'which Code binary' is how the macOS bug " +
          "got in; the harness must delegate to the shared module",
      );
      assert.ok(
        !harness.includes("const _DARWIN_EXEC_PREFERENCE"),
        "the darwin preference list must live in exactly one file",
      );
    });
  });
});
