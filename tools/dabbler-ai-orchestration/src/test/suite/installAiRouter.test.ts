import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  installAiRouter,
  updateAiRouter,
  isAiRouterNotInstalled,
  describeAiRouterImportFailure,
  deriveVenvFromPythonPath,
  resolveLatestReleaseTag,
  routerInstallRequirement,
  routerInstallSpec,
  venvPython,
  FileOps,
  InstallSource,
  ProcessSpawner,
  SpawnResult,
  PYPI_PACKAGE_NAME,
  PYPI_REQUIREMENT,
  MINIMUM_ROUTER_VERSION,
  ROUTER_CAPABILITY_PROBE_CODE,
  compareReleaseVersions,
  probeRouterCapability,
  READ_BUNDLED_ROUTER_CONFIG_CODE,
  ROUTER_CONFIG_REL,
  INSTALL_METHOD_REL,
  GITHUB_CHECKOUT_REL,
  REPO_URL,
} from "../../utils/aiRouterInstall";
import { writeFileExclusiveSync } from "../../utils/fileSystem";

// Standalone-mocha pattern: no electron host required. Each test wires up
// a sandbox workspace under os.tmpdir(), an in-process spawner that
// records the exact (cmd, args) it was called with, and a real-fs FileOps
// scoped to that sandbox so the directory copy / config preservation
// paths exercise the same code that ships.

function makeTmpWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-install-ws-"));
}

function realFileOps(): FileOps {
  return {
    exists: (p) => fs.existsSync(p),
    readFile: (p) => fs.readFileSync(p, "utf8"),
    writeFile: (p, c) => {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, c, "utf8");
    },
    writeFileExclusive: (p, c) => writeFileExclusiveSync(p, c),
    mkdirp: (p) => fs.mkdirSync(p, { recursive: true }),
    copyDir: (src, dst) => {
      fs.mkdirSync(dst, { recursive: true });
      for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, entry.name);
        const d = path.join(dst, entry.name);
        if (entry.isDirectory()) realFileOps().copyDir(s, d);
        else fs.copyFileSync(s, d);
      }
    },
    removeRecursive: (p) => {
      if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
    },
    mkdtemp: (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix)),
  };
}

interface SpawnCall {
  cmd: string;
  args: string[];
  cwd?: string;
}

function recordingSpawner(
  responses: Array<Partial<SpawnResult>> | ((call: SpawnCall) => Partial<SpawnResult>),
): { spawner: ProcessSpawner; calls: SpawnCall[] } {
  const calls: SpawnCall[] = [];
  let i = 0;
  const spawner: ProcessSpawner = async (cmd, args, opts) => {
    const call = { cmd, args: [...args], cwd: opts?.cwd };
    calls.push(call);
    const partial =
      typeof responses === "function" ? responses(call) : responses[i++] ?? { exitCode: 0, stdout: "", stderr: "" };
    return { exitCode: 0, stdout: "", stderr: "", ...partial } as SpawnResult;
  };
  return { spawner, calls };
}

function autoPrompts(opts: {
  source?: InstallSource;
  createVenv?: boolean;
  ref?: string | undefined;
} = {}) {
  return {
    pickSource: async () => opts.source ?? "pypi",
    confirmCreateVenv: async () => opts.createVenv ?? true,
    promptGitHubRef: async () => (opts.ref === undefined ? "" : opts.ref),
  };
}

function seedExistingVenv(workspaceRoot: string, name = ".venv"): string {
  const venv = path.join(workspaceRoot, name);
  // The detector only checks for the venv directory itself; the bin/Scripts
  // contents are exercised by the spawner stub, not by the test.
  fs.mkdirSync(venv, { recursive: true });
  return venv;
}

/**
 * Spawner factory for the GitHub install flow.
 *
 * Materializes a stub `ai_router/` payload inside the tmpdir on
 * `git clone`, satisfies `git ls-remote --tags` with a stable two-tag
 * payload, and resolves every other call as exit 0 — the round-2 flow
 * always issues `ls-remote` (resolve-latest-tag) when the user passes
 * an empty ref, so test stubs need to handle that call too.
 */
function gitHubSpawner(opts: {
  lsRemoteOutput?: string;
  /** Optional payload writer for the cloned tmpdir (defaults to a single __init__.py). */
  populateClone?: (tmpAbs: string) => void;
  /** Override per-call exit / stderr (e.g. force the editable install to fail). */
  override?: (call: SpawnCall) => Partial<SpawnResult> | undefined;
}) {
  const lsRemote =
    opts.lsRemoteOutput ??
    [
      "abc1230000000000000000000000000000000000\trefs/tags/v0.1.0",
      "def4560000000000000000000000000000000000\trefs/tags/v0.1.0-rc1",
    ].join("\n");
  return recordingSpawner((call) => {
    const o = opts.override?.(call);
    if (o) return o;
    if (call.cmd === "git" && call.args[0] === "ls-remote") {
      return { exitCode: 0, stdout: lsRemote };
    }
    if (call.cmd === "git" && call.args[0] === "clone") {
      const tmp = call.args[call.args.length - 1];
      if (opts.populateClone) {
        opts.populateClone(tmp);
      } else {
        fs.mkdirSync(path.join(tmp, "ai_router"), { recursive: true });
        fs.writeFileSync(path.join(tmp, "ai_router", "__init__.py"), "# stub\n");
      }
      return { exitCode: 0 };
    }
    return { exitCode: 0 };
  });
}

// ---------- isAiRouterNotInstalled ----------

suite("aiRouterInstall — isAiRouterNotInstalled detector", () => {
  test("matches the precise stderr line python -m emits", () => {
    const stderr =
      "/usr/bin/python: Error while finding module specification for 'ai_router.queue_status' (ModuleNotFoundError: No module named 'ai_router')";
    assert.strictEqual(isAiRouterNotInstalled(stderr), true);
  });

  test("matches a bare ModuleNotFoundError trace", () => {
    const stderr =
      "Traceback (most recent call last):\n  File ...\nModuleNotFoundError: No module named 'ai_router'";
    assert.strictEqual(isAiRouterNotInstalled(stderr), true);
  });

  test("matches the namespace-shadow runpy form (the consumer-repo bug)", () => {
    // When a config-only ai_router/ folder (no __init__.py) shadows as an
    // empty namespace package and the interpreter has no installed router,
    // `python -m ai_router.close_session` emits this unquoted, prefix-less
    // line. It must be recognized as an import failure, not a generic error.
    const stderr =
      "C:\\Python311\\python.exe: No module named ai_router.close_session";
    assert.strictEqual(isAiRouterNotInstalled(stderr), true);
  });

  test("does not match an unrelated submodule-shaped module name", () => {
    const stderr = "python: No module named ai_router_helpers.foo";
    assert.strictEqual(isAiRouterNotInstalled(stderr), false);
  });

  test("returns false for unrelated import errors", () => {
    const stderr = "ModuleNotFoundError: No module named 'pyyaml'";
    assert.strictEqual(isAiRouterNotInstalled(stderr), false);
  });

  test("returns false for a generic non-zero exit message", () => {
    const stderr = "queue_status: queue is empty\nExit 1";
    assert.strictEqual(isAiRouterNotInstalled(stderr), false);
  });

  test("returns false for empty stderr", () => {
    assert.strictEqual(isAiRouterNotInstalled(""), false);
  });
});

// ---------- describeAiRouterImportFailure ----------

suite("aiRouterInstall — describeAiRouterImportFailure message", () => {
  test("names the interpreter and states it is NOT a credentials problem", () => {
    const msg = describeAiRouterImportFailure("C:\\Python311\\python.exe");
    assert.ok(msg.includes("C:\\Python311\\python.exe"), "names the interpreter");
    assert.ok(/NOT missing API keys/.test(msg), "denies the missing-keys cause");
    assert.ok(/pip install dabbler-ai-router/.test(msg), "offers the install fix");
    assert.ok(/dabblerSessionSets\.pythonPath/.test(msg), "points at the setting");
  });

  test("appends an optional hint when provided", () => {
    const msg = describeAiRouterImportFailure("python", "exit 1");
    assert.ok(msg.endsWith("(exit 1)"));
  });
});

// ---------- deriveVenvFromPythonPath ----------

suite("aiRouterInstall — deriveVenvFromPythonPath", () => {
  test("returns the venv root for a Windows venv interpreter path", () => {
    const root = deriveVenvFromPythonPath("C:\\proj\\.venv\\Scripts\\python.exe");
    assert.ok(root, "expected a venv root");
    assert.match(String(root), /\.venv$/);
  });

  test("returns the venv root for a POSIX venv interpreter path", () => {
    const root = deriveVenvFromPythonPath("/proj/.venv/bin/python");
    assert.strictEqual(root, "/proj/.venv");
  });

  test("returns null for a bare command name", () => {
    assert.strictEqual(deriveVenvFromPythonPath("python"), null);
    assert.strictEqual(deriveVenvFromPythonPath("python3"), null);
  });

  test("returns null when the parent dir is not Scripts/ or bin/", () => {
    assert.strictEqual(deriveVenvFromPythonPath("/usr/local/bin-other/python"), null);
  });
});

// ---------- resolveLatestReleaseTag ----------

suite("aiRouterInstall — resolveLatestReleaseTag", () => {
  function deps(spawner: ProcessSpawner) {
    return {
      workspaceRoot: "/ws",
      pythonPath: "python",
      spawner,
      fileOps: realFileOps(),
      prompts: autoPrompts(),
    };
  }

  test("picks the highest semver tag and ignores pre-release suffixes", async () => {
    const { spawner } = recordingSpawner([
      {
        exitCode: 0,
        stdout: [
          "abc1\trefs/tags/v0.1.0",
          "def2\trefs/tags/v0.2.0",
          "fed3\trefs/tags/v0.2.0-rc1",
          "012a\trefs/tags/v0.10.1",
          "012b\trefs/tags/v0.9.99",
        ].join("\n"),
      },
    ]);
    const tag = await resolveLatestReleaseTag(deps(spawner));
    assert.strictEqual(tag, "v0.10.1");
  });

  test("returns null when ls-remote yields no release tags", async () => {
    const { spawner } = recordingSpawner([{ exitCode: 0, stdout: "abc1\trefs/tags/foo" }]);
    const tag = await resolveLatestReleaseTag(deps(spawner));
    assert.strictEqual(tag, null);
  });

  test("returns null when ls-remote exits non-zero", async () => {
    const { spawner } = recordingSpawner([{ exitCode: 128, stderr: "fatal: repository not found" }]);
    const tag = await resolveLatestReleaseTag(deps(spawner));
    assert.strictEqual(tag, null);
  });
});

// ---------- PyPI install path ----------

suite("aiRouterInstall — PyPI install (happy path)", () => {
  test("installs from PyPI in an existing venv and writes the install-method marker", async () => {
    const ws = makeTmpWorkspace();
    const venv = seedExistingVenv(ws);
    // Two calls: the pip install and the post-install
    // importlib.resources read used to materialize router-config.yaml.
    // The read returns empty stdout so the materialize branch falls
    // through cleanly — that is what happens when the bundled file
    // resolves to a path that doesn't exist (legacy 0.0.x installs).
    const { spawner, calls } = recordingSpawner([
      { exitCode: 0 },
      { exitCode: 0, stdout: "" },
    ]);

    const outcome = await installAiRouter({
      workspaceRoot: ws,
      pythonPath: "python",
      spawner,
      fileOps: realFileOps(),
      prompts: autoPrompts({ source: "pypi" }),
    });

    assert.strictEqual(outcome.ok, true, outcome.message);
    assert.strictEqual(outcome.source, "pypi");
    assert.strictEqual(outcome.venvPath, venv);
    assert.strictEqual(calls[0].cmd, venvPython(venv));
    // Set 122 S3: `--upgrade` and the pinned floor. Without BOTH, pip
    // reports an existing older install as already-satisfied and the
    // developer's venv keeps a router with no `ai_router.modules`.
    assert.deepStrictEqual(calls[0].args, [
      "-m",
      "pip",
      "install",
      "--upgrade",
      PYPI_REQUIREMENT,
    ]);
    // Marker file written
    const marker = path.join(ws, INSTALL_METHOD_REL);
    assert.ok(fs.existsSync(marker), "expected install-method marker to be written");
    assert.strictEqual(fs.readFileSync(marker, "utf8").trim(), "pypi");
    fs.rmSync(ws, { recursive: true, force: true });
  });

  test("offers to create .venv when no venv is detected and uses it on accept", async () => {
    const ws = makeTmpWorkspace();
    const { spawner, calls } = recordingSpawner((call) => {
      if (call.args[0] === "-m" && call.args[1] === "venv") {
        const target = call.args[2];
        fs.mkdirSync(target, { recursive: true });
        return { exitCode: 0 };
      }
      return { exitCode: 0 };
    });

    const outcome = await installAiRouter({
      workspaceRoot: ws,
      pythonPath: "python",
      spawner,
      fileOps: realFileOps(),
      prompts: autoPrompts({ source: "pypi", createVenv: true }),
    });

    assert.strictEqual(outcome.ok, true, outcome.message);
    assert.deepStrictEqual(calls[0].args, ["-m", "venv", path.join(ws, ".venv")]);
    assert.deepStrictEqual(calls[1].args, [
      "-m",
      "pip",
      "install",
      "--upgrade",
      PYPI_REQUIREMENT,
    ]);
    fs.rmSync(ws, { recursive: true, force: true });
  });

  test("aborts when no venv exists and the operator declines to create one", async () => {
    const ws = makeTmpWorkspace();
    const { spawner, calls } = recordingSpawner([]);

    const outcome = await installAiRouter({
      workspaceRoot: ws,
      pythonPath: "python",
      spawner,
      fileOps: realFileOps(),
      prompts: autoPrompts({ source: "pypi", createVenv: false }),
    });

    assert.strictEqual(outcome.ok, false);
    assert.match(outcome.message, /No venv found/);
    assert.strictEqual(calls.length, 0);
    fs.rmSync(ws, { recursive: true, force: true });
  });

  test("surfaces pip install failure with the captured tail of stderr", async () => {
    const ws = makeTmpWorkspace();
    seedExistingVenv(ws);
    const { spawner } = recordingSpawner([
      { exitCode: 1, stderr: "ERROR: Could not find a version that satisfies the requirement dabbler-ai-router\nERROR: No matching distribution found for dabbler-ai-router" },
    ]);

    const outcome = await installAiRouter({
      workspaceRoot: ws,
      pythonPath: "python",
      spawner,
      fileOps: realFileOps(),
      prompts: autoPrompts({ source: "pypi" }),
    });

    assert.strictEqual(outcome.ok, false);
    assert.match(outcome.message, /pip install failed/);
    assert.match(outcome.message, /No matching distribution/);
    fs.rmSync(ws, { recursive: true, force: true });
  });

  test("update mode force-refreshes PyPI installs and reads the install-method marker as the default source", async () => {
    const ws = makeTmpWorkspace();
    seedExistingVenv(ws);
    const marker = path.join(ws, INSTALL_METHOD_REL);
    fs.mkdirSync(path.dirname(marker), { recursive: true });
    fs.writeFileSync(marker, "pypi\n");

    let presentedDefault: InstallSource | null = null;
    const prompts = {
      pickSource: async (defaultSource: InstallSource) => {
        presentedDefault = defaultSource;
        return defaultSource;
      },
      confirmCreateVenv: async () => true,
      promptGitHubRef: async () => "",
    };
    const { spawner, calls } = recordingSpawner([{ exitCode: 0 }]);

    const outcome = await updateAiRouter({
      workspaceRoot: ws,
      pythonPath: "python",
      spawner,
      fileOps: realFileOps(),
      prompts,
    });

    assert.strictEqual(outcome.ok, true, outcome.message);
    assert.strictEqual(presentedDefault, "pypi");
    assert.deepStrictEqual(calls[0].args, [
      "-m",
      "pip",
      "install",
      "--upgrade",
      "--force-reinstall",
      "--no-cache-dir",
      PYPI_REQUIREMENT,
    ]);
    fs.rmSync(ws, { recursive: true, force: true });
  });

  test("seeds workspace ai_router/router-config.yaml from the installed package on a fresh PyPI install", async () => {
    const ws = makeTmpWorkspace();
    const venv = seedExistingVenv(ws);
    const seedYaml = "# bundled router-config defaults\ndefault_provider: anthropic\n";
    const { spawner, calls } = recordingSpawner((call) => {
      if (call.args[0] === "-m" && call.args[1] === "pip" && call.args[2] === "install") {
        return { exitCode: 0 };
      }
      // The post-install one-liner reads the bundled router-config.yaml
      // through importlib.resources and prints it to stdout. Shape the
      // test stub to match what the real venv-python would emit.
      if (call.args[0] === "-c" && call.args[1].includes("router-config.yaml")) {
        return { exitCode: 0, stdout: seedYaml };
      }
      return { exitCode: 0 };
    });

    const outcome = await installAiRouter({
      workspaceRoot: ws,
      pythonPath: "python",
      spawner,
      fileOps: realFileOps(),
      prompts: autoPrompts({ source: "pypi" }),
    });

    assert.strictEqual(outcome.ok, true, outcome.message);
    assert.strictEqual(outcome.routerConfigPreserved, true,
      "expected the materialized config to set routerConfigPreserved=true");
    const workspaceConfig = path.join(ws, ROUTER_CONFIG_REL);
    assert.ok(fs.existsSync(workspaceConfig));
    assert.strictEqual(fs.readFileSync(workspaceConfig, "utf8"), seedYaml);
    // pip install + the importlib.resources read + the Set 122 S3
    // capability probe = 3 calls.
    assert.strictEqual(calls.length, 3);
    assert.deepStrictEqual(calls[2].args, ["-c", ROUTER_CAPABILITY_PROBE_CODE]);
    assert.match(outcome.message, /Seeded ai_router\/router-config\.yaml/);
    fs.rmSync(ws, { recursive: true, force: true });
  });

  test("the config-seed one-liner emits RAW BYTES, never text-mode stdout (Set 079 UAT walk 4 cp1252 regression)", () => {
    // On Windows the child's stdout text layer defaults to cp1252
    // (pre-3.15 Python), and the bundled router-config.yaml carries
    // characters cp1252 cannot encode (e.g. U+2192 in comments). A
    // text-mode `sys.stdout.write(p.read_text(...))` raised
    // UnicodeEncodeError, exited non-zero, and the seed was silently
    // skipped — the guided Build then scaffolded a workspace with NO
    // ai_router/router-config.yaml, and the Copilot seat setup's config
    // write failed at the anchor lookup (Set 079 UAT walk 4). The raw
    // byte round-trip (read_bytes -> stdout.buffer.write, decoded utf8
    // by the spawner) never touches the console text encoding.
    assert.ok(
      READ_BUNDLED_ROUTER_CONFIG_CODE.includes("sys.stdout.buffer.write"),
      "one-liner must write to sys.stdout.buffer (bytes), not the text layer",
    );
    assert.ok(
      READ_BUNDLED_ROUTER_CONFIG_CODE.includes("read_bytes()"),
      "one-liner must read the package data as bytes",
    );
    assert.ok(
      !READ_BUNDLED_ROUTER_CONFIG_CODE.includes("read_text"),
      "text-mode read reintroduces an encode step on the cp1252 console",
    );
    assert.ok(
      !/sys\.stdout\.write\(/.test(READ_BUNDLED_ROUTER_CONFIG_CODE),
      "text-mode stdout write is the exact cp1252 crash this pin guards",
    );
  });

  test("a failed config-seed read is NAMED in the install message, never silent (Set 079 UAT walk 4)", async () => {
    const ws = makeTmpWorkspace();
    seedExistingVenv(ws);
    const { spawner } = recordingSpawner((call) => {
      if (call.args[0] === "-m" && call.args[1] === "pip" && call.args[2] === "install") {
        return { exitCode: 0 };
      }
      // The importlib.resources one-liner fails (the pre-fix cp1252
      // crash shape: non-zero exit, nothing usable on stdout).
      if (call.args[0] === "-c" && call.args[1].includes("router-config.yaml")) {
        return { exitCode: 1, stdout: "" };
      }
      return { exitCode: 0 };
    });

    const outcome = await installAiRouter({
      workspaceRoot: ws,
      pythonPath: "python",
      spawner,
      fileOps: realFileOps(),
      prompts: autoPrompts({ source: "pypi" }),
    });

    assert.strictEqual(outcome.ok, true, "install itself still succeeds");
    assert.strictEqual(outcome.routerConfigPreserved, false);
    assert.ok(!fs.existsSync(path.join(ws, ROUTER_CONFIG_REL)));
    assert.match(outcome.message, /Could not seed ai_router\/router-config\.yaml/);
    fs.rmSync(ws, { recursive: true, force: true });
  });

  test("PyPI install leaves an existing workspace router-config.yaml alone (operator-tuned values survive)", async () => {
    const ws = makeTmpWorkspace();
    seedExistingVenv(ws);
    const workspaceConfig = path.join(ws, ROUTER_CONFIG_REL);
    fs.mkdirSync(path.dirname(workspaceConfig), { recursive: true });
    fs.writeFileSync(workspaceConfig, "# operator-tuned\nfoo: bar\n");

    const { spawner, calls } = recordingSpawner((call) => {
      if (call.args[0] === "-m" && call.args[1] === "pip") return { exitCode: 0 };
      // If this gets called, the materialization branch ran when it
      // shouldn't have — we want the existing file untouched and
      // the importlib.resources call skipped entirely.
      if (call.args[0] === "-c") return { exitCode: 0, stdout: "# UPSTREAM\n" };
      return { exitCode: 0 };
    });

    const outcome = await installAiRouter({
      workspaceRoot: ws,
      pythonPath: "python",
      spawner,
      fileOps: realFileOps(),
      prompts: autoPrompts({ source: "pypi" }),
    });

    assert.strictEqual(outcome.ok, true, outcome.message);
    assert.strictEqual(outcome.routerConfigPreserved, false,
      "no materialization should occur when the file already exists");
    assert.match(fs.readFileSync(workspaceConfig, "utf8"), /operator-tuned/);
    assert.doesNotMatch(fs.readFileSync(workspaceConfig, "utf8"), /UPSTREAM/);
    // The pip install + the capability probe — no importlib.resources read.
    assert.strictEqual(calls.length, 2);
    assert.deepStrictEqual(calls[1].args, ["-c", ROUTER_CAPABILITY_PROBE_CODE]);
    fs.rmSync(ws, { recursive: true, force: true });
  });

  test("uses the venv derived from the configured pythonPath (with pyvenv.cfg marker) instead of hunting for .venv/", async () => {
    const ws = makeTmpWorkspace();
    // Pre-create a non-standard venv at .virtualenvs/myenv inside the
    // workspace; the configured pythonPath points inside it. The
    // pyvenv.cfg marker is what distinguishes a real venv from a
    // system interpreter that happens to live under a `bin/` dir
    // (e.g. /usr/bin/python3).
    const customVenv = path.join(ws, ".virtualenvs", "myenv");
    fs.mkdirSync(path.join(customVenv, process.platform === "win32" ? "Scripts" : "bin"), {
      recursive: true,
    });
    fs.writeFileSync(path.join(customVenv, "pyvenv.cfg"), "home = /usr\n");
    const customPython =
      process.platform === "win32"
        ? path.join(customVenv, "Scripts", "python.exe")
        : path.join(customVenv, "bin", "python");
    const { spawner, calls } = recordingSpawner([
      { exitCode: 0 },
      { exitCode: 0, stdout: "" },
    ]);

    const outcome = await installAiRouter({
      workspaceRoot: ws,
      pythonPath: customPython,
      spawner,
      fileOps: realFileOps(),
      prompts: autoPrompts({ source: "pypi" }),
    });

    assert.strictEqual(outcome.ok, true, outcome.message);
    assert.strictEqual(outcome.venvPath, customVenv,
      "expected the install command to use the venv that owns the configured pythonPath");
    // pip was invoked via that venv's python, not via the workspace `.venv/`.
    assert.strictEqual(calls[0].cmd, venvPython(customVenv));
    fs.rmSync(ws, { recursive: true, force: true });
  });

  test("creating a missing .venv when configured pythonPath points inside that nonexistent venv uses bare 'python' as bootstrap (no ENOENT)", async () => {
    // Round-5 verifier scenario: dabblerSessionSets.pythonPath is
    // resolved to ``<workspace>/.venv/Scripts/python.exe`` BUT
    // .venv/ doesn't exist yet. The previous implementation would
    // try to spawn that nonexistent interpreter for `-m venv .venv`,
    // ENOENT-ing instead of creating the venv.
    const ws = makeTmpWorkspace();
    const venvPyShape =
      process.platform === "win32"
        ? path.join(ws, ".venv", "Scripts", "python.exe")
        : path.join(ws, ".venv", "bin", "python");
    // Note: do NOT create venvPyShape on disk — that's the ENOENT case.
    let bootstrapCmd: string | null = null;
    const { spawner } = recordingSpawner((call) => {
      if (call.args[0] === "-m" && call.args[1] === "venv") {
        bootstrapCmd = call.cmd;
        const target = call.args[2];
        fs.mkdirSync(target, { recursive: true });
        return { exitCode: 0 };
      }
      return { exitCode: 0 };
    });

    const outcome = await installAiRouter({
      workspaceRoot: ws,
      pythonPath: venvPyShape,
      spawner,
      fileOps: realFileOps(),
      prompts: autoPrompts({ source: "pypi", createVenv: true }),
    });

    assert.strictEqual(outcome.ok, true, outcome.message);
    assert.strictEqual(bootstrapCmd, "python",
      "expected the bootstrap to fall back to bare 'python' rather than the nonexistent venv interpreter");
    fs.rmSync(ws, { recursive: true, force: true });
  });

  test("creating .venv with a real existing absolute interpreter (e.g. /usr/bin/python3 shape) honors that interpreter — no overcorrection to bare 'python'", async () => {
    // Round-6 verifier catch: the bootstrap fallback must only fire
    // for the actual ENOENT case (configured path doesn't exist), not
    // for every venv-shaped path. A legitimate system interpreter at
    // `/usr/bin/python3` (parent dir = `bin/`) must be used as-is.
    const ws = makeTmpWorkspace();
    const fakeUsrBinPython = path.join(ws, "fakeUsr", "bin", "python3");
    fs.mkdirSync(path.dirname(fakeUsrBinPython), { recursive: true });
    fs.writeFileSync(fakeUsrBinPython, "#!/usr/bin/env python3\n");
    let bootstrapCmd: string | null = null;
    const { spawner } = recordingSpawner((call) => {
      if (call.args[0] === "-m" && call.args[1] === "venv") {
        bootstrapCmd = call.cmd;
        const target = call.args[2];
        fs.mkdirSync(target, { recursive: true });
        return { exitCode: 0 };
      }
      return { exitCode: 0 };
    });

    const outcome = await installAiRouter({
      workspaceRoot: ws,
      pythonPath: fakeUsrBinPython,
      spawner,
      fileOps: realFileOps(),
      prompts: autoPrompts({ source: "pypi", createVenv: true }),
    });

    assert.strictEqual(outcome.ok, true, outcome.message);
    assert.strictEqual(bootstrapCmd, fakeUsrBinPython,
      "expected an existing system interpreter to be used as-is, not overridden by bare 'python'");
    fs.rmSync(ws, { recursive: true, force: true });
  });

  test("absolute system interpreter (e.g. /usr/bin/python3 shape) is NOT misidentified as a venv — falls through to workspace detection", async () => {
    const ws = makeTmpWorkspace();
    // Mimic /usr/bin/python3 by creating an absolute path inside the
    // sandbox that has the same shape (parent = bin/) but no
    // pyvenv.cfg marker at the grandparent. The deriveVenv path-shape
    // check would say "candidate = <workspace>/fakeUsr"; the
    // pyvenv.cfg marker check rejects it.
    const fakeUsr = path.join(ws, "fakeUsr");
    fs.mkdirSync(path.join(fakeUsr, "bin"), { recursive: true });
    const systemPython = path.join(fakeUsr, "bin", "python3");
    // Pre-create a workspace .venv/ so the install proceeds without
    // prompting to create one. If the misid bug were still present,
    // the install would silently use fakeUsr instead of this venv.
    const workspaceVenv = seedExistingVenv(ws);
    const { spawner, calls } = recordingSpawner([
      { exitCode: 0 },
      { exitCode: 0, stdout: "" },
    ]);

    const outcome = await installAiRouter({
      workspaceRoot: ws,
      pythonPath: systemPython,
      spawner,
      fileOps: realFileOps(),
      prompts: autoPrompts({ source: "pypi" }),
    });

    assert.strictEqual(outcome.ok, true, outcome.message);
    assert.strictEqual(outcome.venvPath, workspaceVenv,
      "expected fall-through to workspace .venv/ when the configured python path is not actually inside a venv");
    assert.strictEqual(calls[0].cmd, venvPython(workspaceVenv));
    fs.rmSync(ws, { recursive: true, force: true });
  });
});

// ---------- GitHub sparse-checkout install path ----------

suite("aiRouterInstall — GitHub install (happy path)", () => {
  test("resolves the latest released tag, sparse-clones, copies into a persistent location, and editable-installs that path", async () => {
    const ws = makeTmpWorkspace();
    const venv = seedExistingVenv(ws);

    const { spawner, calls } = gitHubSpawner({
      populateClone: (tmp) => {
        fs.mkdirSync(path.join(tmp, "ai_router"), { recursive: true });
        fs.writeFileSync(path.join(tmp, "ai_router", "__init__.py"), "# stub\n");
        fs.writeFileSync(path.join(tmp, "pyproject.toml"), "[project]\nname='dabbler-ai-router'\n");
      },
    });

    const outcome = await installAiRouter({
      workspaceRoot: ws,
      pythonPath: "python",
      spawner,
      fileOps: realFileOps(),
      prompts: autoPrompts({ source: "github", ref: "" }),
    });

    assert.strictEqual(outcome.ok, true, outcome.message);
    assert.strictEqual(outcome.source, "github");
    assert.strictEqual(outcome.resolvedRef, "v0.1.0",
      "expected the latest released tag to be resolved (v0.1.0 in the stub ls-remote payload)");
    // 5 spawn calls: ls-remote → clone → sparse-checkout → pip install -e
    // <stable> → the Set 122 S3 capability probe. The GitHub path is
    // probed too: an editable install of a stale checkout can miss the
    // capability just as easily as a registry install.
    assert.strictEqual(calls.length, 5);
    assert.deepStrictEqual(calls[4].args, ["-c", ROUTER_CAPABILITY_PROBE_CODE]);
    assert.strictEqual(calls[0].cmd, "git");
    assert.strictEqual(calls[0].args[0], "ls-remote");
    assert.strictEqual(calls[1].cmd, "git");
    assert.ok(calls[1].args.includes("clone"));
    assert.ok(calls[1].args.includes("--sparse"));
    const branchIdx = calls[1].args.indexOf("--branch");
    assert.strictEqual(calls[1].args[branchIdx + 1], "v0.1.0",
      "clone must check out the resolved latest tag, not the default branch");
    assert.strictEqual(calls[2].cmd, "git");
    assert.deepStrictEqual(calls[2].args.slice(-3), ["set", "ai_router", "pyproject.toml"]);
    assert.strictEqual(calls[3].cmd, venvPython(venv));
    // Editable install must point at the persistent .dabbler/ai-router-src/, NOT a tmpdir.
    const stableSrc = path.join(ws, GITHUB_CHECKOUT_REL);
    assert.deepStrictEqual(calls[3].args, ["-m", "pip", "install", "-e", stableSrc]);
    // Stable checkout exists on disk after install (so the .egg-link resolves).
    assert.ok(fs.existsSync(stableSrc), "expected the persistent sparse checkout to remain on disk");
    assert.ok(fs.existsSync(path.join(ws, "ai_router", "__init__.py")));
    assert.strictEqual(fs.readFileSync(path.join(ws, INSTALL_METHOD_REL), "utf8").trim(), "github");
    fs.rmSync(ws, { recursive: true, force: true });
  });

  test("preserves an existing router-config.yaml across the sparse-checkout copy", async () => {
    const ws = makeTmpWorkspace();
    seedExistingVenv(ws);
    const routerConfig = path.join(ws, ROUTER_CONFIG_REL);
    fs.mkdirSync(path.dirname(routerConfig), { recursive: true });
    fs.writeFileSync(routerConfig, "# operator-tuned, do not overwrite\nfoo: bar\n");

    const { spawner } = gitHubSpawner({
      populateClone: (tmp) => {
        fs.mkdirSync(path.join(tmp, "ai_router"), { recursive: true });
        fs.writeFileSync(
          path.join(tmp, "ai_router", "router-config.yaml"),
          "# UPSTREAM DEFAULT\n",
        );
      },
    });

    const outcome = await installAiRouter({
      workspaceRoot: ws,
      pythonPath: "python",
      spawner,
      fileOps: realFileOps(),
      prompts: autoPrompts({ source: "github", ref: "" }),
    });

    assert.strictEqual(outcome.ok, true, outcome.message);
    assert.strictEqual(outcome.routerConfigPreserved, true);
    const finalConfig = fs.readFileSync(routerConfig, "utf8");
    assert.match(finalConfig, /operator-tuned/);
    assert.doesNotMatch(finalConfig, /UPSTREAM DEFAULT/);
    fs.rmSync(ws, { recursive: true, force: true });
  });

  test("forwards a user-supplied git ref to git clone --branch (skips ls-remote)", async () => {
    const ws = makeTmpWorkspace();
    seedExistingVenv(ws);
    const { spawner, calls } = gitHubSpawner({});

    const outcome = await installAiRouter({
      workspaceRoot: ws,
      pythonPath: "python",
      spawner,
      fileOps: realFileOps(),
      prompts: autoPrompts({ source: "github", ref: "v0.1.0" }),
    });

    assert.strictEqual(outcome.ok, true, outcome.message);
    assert.strictEqual(outcome.resolvedRef, "v0.1.0");
    // 4 calls when an explicit ref is provided: clone → sparse-checkout →
    // pip install -e → capability probe (ls-remote is skipped — no need to
    // resolve "latest" when the user named it).
    assert.strictEqual(calls.length, 4);
    const cloneCall = calls[0];
    assert.strictEqual(cloneCall.cmd, "git");
    assert.strictEqual(cloneCall.args[0], "clone");
    const branchIdx = cloneCall.args.indexOf("--branch");
    assert.strictEqual(cloneCall.args[branchIdx + 1], "v0.1.0");
    fs.rmSync(ws, { recursive: true, force: true });
  });

  test("aborts when the operator dismisses the ref prompt with undefined", async () => {
    const ws = makeTmpWorkspace();
    seedExistingVenv(ws);
    const prompts = {
      pickSource: async (): Promise<InstallSource | undefined> => "github",
      confirmCreateVenv: async () => true,
      promptGitHubRef: async () => undefined,
    };
    const { spawner, calls } = recordingSpawner([]);

    const outcome = await installAiRouter({
      workspaceRoot: ws,
      pythonPath: "python",
      spawner,
      fileOps: realFileOps(),
      prompts,
    });

    assert.strictEqual(outcome.ok, false);
    assert.match(outcome.message, /no GitHub ref chosen/);
    assert.strictEqual(calls.length, 0);
    fs.rmSync(ws, { recursive: true, force: true });
  });

  test("falls back with an actionable message when ls-remote yields no release tags", async () => {
    const ws = makeTmpWorkspace();
    seedExistingVenv(ws);
    const { spawner, calls } = gitHubSpawner({
      lsRemoteOutput: "deadbeef\trefs/tags/some-non-release-tag\n",
    });

    const outcome = await installAiRouter({
      workspaceRoot: ws,
      pythonPath: "python",
      spawner,
      fileOps: realFileOps(),
      prompts: autoPrompts({ source: "github", ref: "" }),
    });

    assert.strictEqual(outcome.ok, false);
    assert.match(outcome.message, /Could not resolve the latest released tag/);
    // Only the ls-remote call ran — no clone attempted.
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].args[0], "ls-remote");
    fs.rmSync(ws, { recursive: true, force: true });
  });

  test("removes a stale workspace ai_router/ before copying the new sparse checkout (no ghost files)", async () => {
    const ws = makeTmpWorkspace();
    seedExistingVenv(ws);
    // Pre-seed the workspace ai_router/ with a file the upstream
    // version does NOT carry (the round-2 verifier's regression
    // scenario: an upgrade that drops a module).
    const ghost = path.join(ws, "ai_router", "deleted_in_upgrade.py");
    fs.mkdirSync(path.dirname(ghost), { recursive: true });
    fs.writeFileSync(ghost, "# this file should NOT survive the upgrade\n");

    const { spawner } = gitHubSpawner({
      populateClone: (tmp) => {
        // Upstream payload is a single __init__.py, no
        // deleted_in_upgrade.py.
        fs.mkdirSync(path.join(tmp, "ai_router"), { recursive: true });
        fs.writeFileSync(path.join(tmp, "ai_router", "__init__.py"), "# stub\n");
      },
    });

    const outcome = await installAiRouter({
      workspaceRoot: ws,
      pythonPath: "python",
      spawner,
      fileOps: realFileOps(),
      prompts: autoPrompts({ source: "github", ref: "" }),
    });

    assert.strictEqual(outcome.ok, true, outcome.message);
    assert.ok(!fs.existsSync(ghost),
      "stale file from previous install must be wiped by the upgrade");
    assert.ok(fs.existsSync(path.join(ws, "ai_router", "__init__.py")));
    fs.rmSync(ws, { recursive: true, force: true });
  });

  test("threads a configured repoUrl through both ls-remote and clone (fork support)", async () => {
    const ws = makeTmpWorkspace();
    seedExistingVenv(ws);
    const fork = "https://github.com/fork-author/dabbler-ai-orchestration.git";
    const { spawner, calls } = gitHubSpawner({});

    const outcome = await installAiRouter({
      workspaceRoot: ws,
      pythonPath: "python",
      repoUrl: fork,
      spawner,
      fileOps: realFileOps(),
      prompts: autoPrompts({ source: "github", ref: "" }),
    });

    assert.strictEqual(outcome.ok, true, outcome.message);
    const lsRemoteCall = calls.find((c) => c.cmd === "git" && c.args[0] === "ls-remote")!;
    assert.ok(lsRemoteCall.args.includes(fork),
      "ls-remote should query the configured fork URL, not the upstream default");
    const cloneCall = calls.find((c) => c.cmd === "git" && c.args[0] === "clone")!;
    assert.ok(cloneCall.args.includes(fork),
      "git clone should target the configured fork URL");
    fs.rmSync(ws, { recursive: true, force: true });
  });

  test("router-config.yaml survives a copyDir failure that occurs AFTER removing dstAiRouter (writeFile must mkdir parent)", async () => {
    // Round-3 verifier scenario: removeRecursive(dstAiRouter) succeeds,
    // then copyDir throws before recreating dstAiRouter. The stash
    // restore must still write the operator-tuned config back into
    // place — which means writeFile must create the parent dir.
    const ws = makeTmpWorkspace();
    seedExistingVenv(ws);
    const routerConfig = path.join(ws, ROUTER_CONFIG_REL);
    fs.mkdirSync(path.dirname(routerConfig), { recursive: true });
    const tunedContents = "# operator-tuned, must survive\nfoo: bar\n";
    fs.writeFileSync(routerConfig, tunedContents);

    const { spawner } = gitHubSpawner({
      populateClone: (tmp) => {
        fs.mkdirSync(path.join(tmp, "ai_router"), { recursive: true });
        fs.writeFileSync(path.join(tmp, "ai_router", "__init__.py"), "# stub\n");
      },
    });

    // FileOps where copyDir throws AFTER dstAiRouter has already been
    // wiped. Mirrors the "disk full mid-copy" / "EACCES on a moved-
    // aside dir" failure mode the verifier called out.
    const baseOps = realFileOps();
    let copyDirCount = 0;
    const aiRouterDst = path.join(ws, "ai_router");
    const failingFileOps: FileOps = {
      ...baseOps,
      copyDir: (src, dst) => {
        copyDirCount++;
        // First copy is .dabbler/ai-router-src (stable checkout) — let
        // it run. Second copy is workspace ai_router/, which the
        // verifier scenario assumes fails after removeRecursive(dst)
        // has already wiped the destination.
        if (dst === aiRouterDst) {
          throw new Error("simulated copyDir failure mid-flight");
        }
        baseOps.copyDir(src, dst);
      },
    };

    const outcome = await installAiRouter({
      workspaceRoot: ws,
      pythonPath: "python",
      spawner,
      fileOps: failingFileOps,
      prompts: autoPrompts({ source: "github", ref: "" }),
    });

    assert.strictEqual(outcome.ok, false);
    assert.match(outcome.message, /Failed to copy ai_router/);
    // The destination ai_router/ was wiped before the failing copy ran.
    // The stash restore must have used writeFile-with-mkdirp to put
    // the operator's tuned config back. Anything less is silent data
    // loss in this failure window.
    assert.ok(fs.existsSync(routerConfig),
      "operator-tuned router-config.yaml must survive even when copy fails after dstAiRouter is wiped");
    assert.strictEqual(fs.readFileSync(routerConfig, "utf8"), tunedContents);
    assert.strictEqual(outcome.routerConfigPreserved, true);
    assert.ok(copyDirCount >= 1, "expected at least one copyDir attempt");
    fs.rmSync(ws, { recursive: true, force: true });
  });

  test("install does NOT report success when stash restore fails after a successful copy (data-loss safeguard)", async () => {
    // Round-4 verifier scenario: copy + editable install both succeed,
    // but the writeFile that restores the stashed router-config.yaml
    // fails (e.g. EACCES on a read-only mount, disk full at exactly
    // that file). The previous implementation marked the stash
    // restored and returned ok=true, leaving the operator with the
    // upstream default file (or a missing file) and a green message.
    const ws = makeTmpWorkspace();
    seedExistingVenv(ws);
    const routerConfig = path.join(ws, ROUTER_CONFIG_REL);
    fs.mkdirSync(path.dirname(routerConfig), { recursive: true });
    fs.writeFileSync(routerConfig, "# operator-tuned\n");

    const { spawner } = gitHubSpawner({
      populateClone: (tmp) => {
        fs.mkdirSync(path.join(tmp, "ai_router"), { recursive: true });
        fs.writeFileSync(path.join(tmp, "ai_router", "__init__.py"), "# upstream\n");
        fs.writeFileSync(
          path.join(tmp, "ai_router", "router-config.yaml"),
          "# UPSTREAM DEFAULT\n",
        );
      },
    });

    const baseOps = realFileOps();
    const failingFileOps: FileOps = {
      ...baseOps,
      writeFile: (p, content) => {
        // Simulate a permission error specifically on the
        // router-config.yaml restore. All other writes (install-method
        // marker, etc.) flow through normally.
        if (p === routerConfig) {
          throw new Error("EACCES: simulated read-only mount");
        }
        baseOps.writeFile(p, content);
      },
    };

    const outcome = await installAiRouter({
      workspaceRoot: ws,
      pythonPath: "python",
      spawner,
      fileOps: failingFileOps,
      prompts: autoPrompts({ source: "github", ref: "" }),
    });

    assert.strictEqual(outcome.ok, false,
      "install must NOT report success when the operator's config could not be restored");
    assert.match(outcome.message, /Failed to restore operator-tuned ai_router\/router-config\.yaml/);
    assert.match(outcome.message, /EACCES/);
    assert.strictEqual(outcome.routerConfigPreserved, false);
    fs.rmSync(ws, { recursive: true, force: true });
  });

  test("router-config.yaml is restored when the editable install fails", async () => {
    const ws = makeTmpWorkspace();
    seedExistingVenv(ws);
    const routerConfig = path.join(ws, ROUTER_CONFIG_REL);
    fs.mkdirSync(path.dirname(routerConfig), { recursive: true });
    fs.writeFileSync(routerConfig, "# operator-tuned\n");

    const { spawner } = gitHubSpawner({
      populateClone: (tmp) => {
        fs.mkdirSync(path.join(tmp, "ai_router"), { recursive: true });
        fs.writeFileSync(
          path.join(tmp, "ai_router", "router-config.yaml"),
          "# UPSTREAM DEFAULT\n",
        );
      },
      override: (call) => {
        // Force the editable install to fail. The stash MUST be
        // restored regardless — this is the data-loss-edge-case test.
        if (call.cmd.endsWith("python") || call.cmd.endsWith("python.exe")) {
          if (call.args[0] === "-m" && call.args[1] === "pip" && call.args[2] === "install") {
            return {
              exitCode: 1,
              stderr: "ERROR: editable install bombed",
            };
          }
        }
        return undefined;
      },
    });

    const outcome = await installAiRouter({
      workspaceRoot: ws,
      pythonPath: "python",
      spawner,
      fileOps: realFileOps(),
      prompts: autoPrompts({ source: "github", ref: "" }),
    });

    assert.strictEqual(outcome.ok, false);
    assert.match(outcome.message, /pip install -e <sparse-checkout> failed/);
    // Despite the install failure, the operator's router-config.yaml is intact.
    assert.match(fs.readFileSync(routerConfig, "utf8"), /operator-tuned/);
    assert.strictEqual(outcome.routerConfigPreserved, true,
      "expected routerConfigPreserved=true even on install-step failure");
    fs.rmSync(ws, { recursive: true, force: true });
  });
});

// ---------- aborts ----------

suite("aiRouterInstall — early aborts", () => {
  test("returns ok=false when the operator dismisses the source pick", async () => {
    const ws = makeTmpWorkspace();
    seedExistingVenv(ws);
    const prompts = {
      pickSource: async (): Promise<InstallSource | undefined> => undefined,
      confirmCreateVenv: async () => true,
      promptGitHubRef: async () => "",
    };
    const { spawner, calls } = recordingSpawner([]);

    const outcome = await installAiRouter({
      workspaceRoot: ws,
      pythonPath: "python",
      spawner,
      fileOps: realFileOps(),
      prompts,
    });

    assert.strictEqual(outcome.ok, false);
    assert.match(outcome.message, /no source chosen/);
    assert.strictEqual(calls.length, 0);
    fs.rmSync(ws, { recursive: true, force: true });
  });
});

// ---------- install-method marker ----------

suite("aiRouterInstall — install-method marker round-trip", () => {
  test("malformed marker is ignored (defaults back to PyPI)", async () => {
    const ws = makeTmpWorkspace();
    seedExistingVenv(ws);
    const marker = path.join(ws, INSTALL_METHOD_REL);
    fs.mkdirSync(path.dirname(marker), { recursive: true });
    fs.writeFileSync(marker, "this-is-not-a-valid-source\n");

    let presentedDefault: InstallSource | null = null;
    const prompts = {
      pickSource: async (defaultSource: InstallSource) => {
        presentedDefault = defaultSource;
        return defaultSource;
      },
      confirmCreateVenv: async () => true,
      promptGitHubRef: async () => "",
    };
    const { spawner } = recordingSpawner([{ exitCode: 0 }]);

    const outcome = await updateAiRouter({
      workspaceRoot: ws,
      pythonPath: "python",
      spawner,
      fileOps: realFileOps(),
      prompts,
    });

    assert.strictEqual(outcome.ok, true);
    assert.strictEqual(presentedDefault, "pypi",
      "expected unknown marker contents to fall through to the PyPI default");
    fs.rmSync(ws, { recursive: true, force: true });
  });
});


// ---------------------------------------------------------------------------
// Set 122 S2 — which requirement the install resolves
// ---------------------------------------------------------------------------

suite("aiRouterInstall — routerInstallSpec / routerInstallRequirement", () => {
  const neverADir = () => false;
  const alwaysADir = () => true;

  test("production installs the published package pinned to the version floor", () => {
    // Set 122 S3: the floor is what makes an existing older install
    // UNSATISFIED, so `pip install --upgrade` actually moves it instead of
    // reporting already-satisfied. A bare package name is the regression.
    assert.strictEqual(routerInstallSpec({}), PYPI_REQUIREMENT);
    assert.strictEqual(PYPI_REQUIREMENT, `dabbler-ai-router>=${MINIMUM_ROUTER_VERSION}`);
    assert.deepStrictEqual(routerInstallRequirement({}, neverADir), [
      PYPI_REQUIREMENT,
    ]);
  });

  test("the floor is declared in exactly one place", () => {
    // L-069-1: two independently-maintained version constants is the drift
    // defect this repo keeps re-finding. The requirement string must be
    // DERIVED from the floor, not a second copy that happens to agree —
    // this fails the moment someone hard-codes a version beside it.
    assert.ok(
      PYPI_REQUIREMENT.endsWith(`>=${MINIMUM_ROUTER_VERSION}`),
      `PYPI_REQUIREMENT (${PYPI_REQUIREMENT}) must derive from MINIMUM_ROUTER_VERSION (${MINIMUM_ROUTER_VERSION})`,
    );
    assert.ok(
      PYPI_REQUIREMENT.startsWith(`${PYPI_PACKAGE_NAME}>`),
      `PYPI_REQUIREMENT (${PYPI_REQUIREMENT}) must derive from PYPI_PACKAGE_NAME (${PYPI_PACKAGE_NAME})`,
    );
  });

  test("an unset or blank override is not an override", () => {
    // A blank env var is the shape a harness leaves behind when it cleans
    // up badly; treating it as a requirement would make pip install "".
    for (const value of [undefined, "", "   "]) {
      assert.strictEqual(
        routerInstallSpec({ DABBLER_ROUTER_INSTALL_SPEC: value }),
        PYPI_REQUIREMENT,
        JSON.stringify(value),
      );
    }
  });

  test("a local source tree is installed EDITABLE", () => {
    // Not a style preference. Without `-e`, PEP 517 copies the whole
    // directory into a build sandbox first, and for a repo carrying
    // node_modules/ and .git/ that turned a 9-second install into one that
    // had not finished 20 minutes later. This is the falsifier for that.
    assert.deepStrictEqual(
      routerInstallRequirement(
        { DABBLER_ROUTER_INSTALL_SPEC: "C:\\repo" },
        alwaysADir,
      ),
      ["-e", "C:\\repo"],
    );
  });

  test("a non-directory override is passed through verbatim", () => {
    // e.g. a pinned version or a wheel URL — nothing to build in place.
    assert.deepStrictEqual(
      routerInstallRequirement(
        { DABBLER_ROUTER_INSTALL_SPEC: "dabbler-ai-router==1.0.0" },
        neverADir,
      ),
      ["dabbler-ai-router==1.0.0"],
    );
  });

  test("the package name is never turned editable, even if a like-named dir exists", () => {
    // A `dabbler-ai-router/` folder in the cwd must not silently convert a
    // registry install into an editable one.
    assert.deepStrictEqual(routerInstallRequirement({}, alwaysADir), [
      PYPI_REQUIREMENT,
    ]);
  });
});

// ---------------------------------------------------------------------------
// Set 122 S3 — the capability precondition.
//
// pip's exit code says a wheel was placed on disk. It does NOT say the
// interpreter the launcher will use can `import ai_router.modules`
// (L-125-1: compare what a transport CAN DO, not what it returns), and
// provisioning is exactly where a silent fail-open hides (L-079-3). Every
// test below is a falsifier for one way this could quietly pass.
// ---------------------------------------------------------------------------

suite("aiRouterInstall — compareReleaseVersions", () => {
  test("orders releases numerically, not lexically", () => {
    // The lexical trap: "0.34.0" > "1.0.0" as strings. A string compare
    // here would accept exactly the wheel this session exists to reject.
    assert.ok((compareReleaseVersions("0.34.0", "1.0.0") ?? 0) < 0);
    assert.ok((compareReleaseVersions("1.0.0", "0.34.0") ?? 0) > 0);
    assert.strictEqual(compareReleaseVersions("1.0.0", "1.0.0"), 0);
    assert.ok((compareReleaseVersions("1.0.1", "1.0.0") ?? 0) > 0);
    assert.ok((compareReleaseVersions("2.0", "1.9.9") ?? 0) > 0);
  });

  test("a missing segment reads as zero, not as absent", () => {
    assert.strictEqual(compareReleaseVersions("1.0", "1.0.0"), 0);
    assert.ok((compareReleaseVersions("1.0", "1.0.1") ?? 0) < 0);
  });

  test("a pre-release of the floor still meets the floor", () => {
    // The import probe is the real gate: a developer on 1.0.0rc1 HAS
    // ai_router.modules, so refusing them would be a false negative.
    assert.strictEqual(compareReleaseVersions("1.0.0rc1", "1.0.0"), 0);
    assert.strictEqual(compareReleaseVersions("1.0.0.dev3+local", "1.0.0"), 0);
  });

  test("declines to judge an unparseable version rather than guessing", () => {
    assert.strictEqual(compareReleaseVersions("unknown", "1.0.0"), null);
    assert.strictEqual(compareReleaseVersions("1.0.0", ""), null);
  });
});

suite("aiRouterInstall — probeRouterCapability", () => {
  test("probes the CAPABILITY MODULE with the venv interpreter it was given", () => {
    // The probe body must import the module the launchers actually run.
    // A probe that imported plain `ai_router` would pass against the very
    // 0.34.0 wheel that has no `ai_router.modules`.
    assert.ok(
      ROUTER_CAPABILITY_PROBE_CODE.includes("ai_router.modules"),
      ROUTER_CAPABILITY_PROBE_CODE,
    );
  });

  test("a clean import at or above the floor passes", async () => {
    const seen: Array<{ cmd: string; args: string[] }> = [];
    const probe = await probeRouterCapability(
      async (cmd, args) => {
        seen.push({ cmd, args: [...args] });
        return { exitCode: 0, stdout: MINIMUM_ROUTER_VERSION, stderr: "" };
      },
      "/ws/.venv/bin/python",
    );
    assert.strictEqual(probe.ok, true, probe.message);
    assert.strictEqual(probe.reason, "ok");
    assert.strictEqual(probe.version, MINIMUM_ROUTER_VERSION);
    assert.strictEqual(seen[0].cmd, "/ws/.venv/bin/python");
    assert.deepStrictEqual(seen[0].args, ["-c", ROUTER_CAPABILITY_PROBE_CODE]);
  });

  test("FALSIFIER: a non-importable module fails even though pip exited 0", async () => {
    const probe = await probeRouterCapability(
      async () => ({
        exitCode: 1,
        stdout: "",
        stderr: "ModuleNotFoundError: No module named 'ai_router.modules'",
      }),
      "/ws/.venv/bin/python",
    );
    assert.strictEqual(probe.ok, false);
    assert.strictEqual(probe.reason, "not-importable");
    // The message must break the "missing API keys" mis-diagnosis.
    assert.ok(/interpreter \/ installation problem/.test(probe.message), probe.message);
  });

  test("FALSIFIER: the exact 0.34.0 regression is refused by version, not just by import", async () => {
    // The concrete failure this session prevents. Suppose a future wheel
    // ships `ai_router.modules` but predates the floor — the import
    // succeeds and only the floor catches it.
    const probe = await probeRouterCapability(
      async () => ({ exitCode: 0, stdout: "0.34.0", stderr: "" }),
      "/ws/.venv/bin/python",
    );
    assert.strictEqual(probe.ok, false);
    assert.strictEqual(probe.reason, "below-floor");
    assert.strictEqual(probe.version, "0.34.0");
    assert.ok(probe.message.includes(MINIMUM_ROUTER_VERSION), probe.message);
    assert.ok(/Update ai-router/.test(probe.message), probe.message);
  });

  test("FALSIFIER: a spawn that throws is a FAILED probe, never a pass", async () => {
    // No fail-open branch: "could not confirm" and "is missing" lead to
    // the same operator action and neither may read as success.
    const probe = await probeRouterCapability(
      async () => {
        throw new Error("ENOENT: interpreter vanished");
      },
      "/ws/.venv/bin/python",
    );
    assert.strictEqual(probe.ok, false);
    assert.strictEqual(probe.reason, "probe-failed");
    assert.ok(probe.message.includes("ENOENT"), probe.message);
  });

  test("an undeterminable version does NOT fail a capability that imported cleanly", async () => {
    // A failed metadata lookup is not a failed capability. Treating it as
    // one would refuse working installs (e.g. an editable checkout with no
    // distribution metadata) — the false-positive mirror of the above.
    const probe = await probeRouterCapability(
      async () => ({ exitCode: 0, stdout: "", stderr: "" }),
      "/ws/.venv/bin/python",
    );
    assert.strictEqual(probe.ok, true, probe.message);
    assert.strictEqual(probe.version, null);
  });
});

suite("aiRouterInstall — the probe gates the install outcome", () => {
  function venvWorkspace(): { ws: string; venv: string } {
    const ws = makeTmpWorkspace();
    const venv = path.join(ws, ".venv");
    fs.mkdirSync(venv, { recursive: true });
    return { ws, venv };
  }

  test("FALSIFIER: pip succeeds but the module is unimportable — the install reports FAILURE", async () => {
    // The whole point. Before this session an install like this returned
    // ok:true, the scaffold shelled out to a CLI that was not there, and
    // the developer learned about it one failing module command at a time.
    const { ws } = venvWorkspace();
    const outcome = await installAiRouter({
      workspaceRoot: ws,
      pythonPath: "python",
      spawner: async (_cmd, args) => {
        const isProbe = args[0] === "-c" && args[1] === ROUTER_CAPABILITY_PROBE_CODE;
        return isProbe
          ? {
              exitCode: 1,
              stdout: "",
              stderr: "ModuleNotFoundError: No module named 'ai_router.modules'",
            }
          : { exitCode: 0, stdout: "", stderr: "" };
      },
      fileOps: realFileOps(),
      prompts: autoPrompts({ source: "pypi" }),
    });
    assert.strictEqual(outcome.ok, false, outcome.message);
    assert.strictEqual(outcome.capability?.ok, false);
    assert.strictEqual(outcome.capability?.reason, "not-importable");
    fs.rmSync(ws, { recursive: true, force: true });
  });

  test("a capable install carries the probe result and stays ok", async () => {
    const { ws } = venvWorkspace();
    const outcome = await installAiRouter({
      workspaceRoot: ws,
      pythonPath: "python",
      spawner: async (_cmd, args) =>
        args[0] === "-c" && args[1] === ROUTER_CAPABILITY_PROBE_CODE
          ? { exitCode: 0, stdout: MINIMUM_ROUTER_VERSION, stderr: "" }
          : { exitCode: 0, stdout: "", stderr: "" },
      fileOps: realFileOps(),
      prompts: autoPrompts({ source: "pypi" }),
    });
    assert.strictEqual(outcome.ok, true, outcome.message);
    assert.strictEqual(outcome.capability?.ok, true);
    assert.strictEqual(outcome.capability?.version, MINIMUM_ROUTER_VERSION);
    fs.rmSync(ws, { recursive: true, force: true });
  });

  test("the probe runs against the VENV interpreter, not the configured pythonPath", async () => {
    // `pythonPath` may be a bare `python` on PATH — the documented cause
    // of the "No module named ai_router" mis-diagnosis. Probing it instead
    // of the venv would answer a question nobody asked.
    const { ws, venv } = venvWorkspace();
    const probeCmds: string[] = [];
    await installAiRouter({
      workspaceRoot: ws,
      pythonPath: "python",
      spawner: async (cmd, args) => {
        if (args[0] === "-c" && args[1] === ROUTER_CAPABILITY_PROBE_CODE) {
          probeCmds.push(cmd);
        }
        return { exitCode: 0, stdout: "", stderr: "" };
      },
      fileOps: realFileOps(),
      prompts: autoPrompts({ source: "pypi" }),
    });
    assert.deepStrictEqual(probeCmds, [venvPython(venv)]);
    fs.rmSync(ws, { recursive: true, force: true });
  });

  test("FALSIFIER: the probe follows the LAUNCHER interpreter when it diverges from the venv", async () => {
    // Set 122 S3 verification round 1, Majors 1 and 3. `ensureVenv` only
    // honours a venv-shaped `pythonPath`, so an operator who points
    // `dabblerSessionSets.pythonPath` at a base interpreter — a supported
    // configuration — gets the router installed into `<ws>/.venv` while
    // every module command resolves the base interpreter. Probing only the
    // venv would report success for a setup in which every single module
    // command fails.
    const { ws } = venvWorkspace();
    const launcher = "C:\\Python311\\python.exe";
    const probeCmds: string[] = [];
    const outcome = await installAiRouter({
      workspaceRoot: ws,
      pythonPath: "python",
      resolveLauncherPython: () => launcher,
      spawner: async (cmd, args) => {
        if (args[0] === "-c" && args[1] === ROUTER_CAPABILITY_PROBE_CODE) {
          probeCmds.push(cmd);
          // The launcher's interpreter does NOT have the router.
          return {
            exitCode: 1,
            stdout: "",
            stderr: "ModuleNotFoundError: No module named 'ai_router'",
          };
        }
        return { exitCode: 0, stdout: "", stderr: "" };
      },
      fileOps: realFileOps(),
      prompts: autoPrompts({ source: "pypi" }),
    });
    assert.deepStrictEqual(
      probeCmds,
      [launcher],
      "the probe must ask the interpreter the launchers will use",
    );
    assert.strictEqual(
      outcome.ok,
      false,
      "an install whose launcher interpreter cannot import the router is not a success",
    );
    assert.strictEqual(outcome.capability?.reason, "not-importable");
    assert.strictEqual(outcome.capability?.interpreter, launcher);
    fs.rmSync(ws, { recursive: true, force: true });
  });

  test("FALSIFIER: the launcher interpreter is resolved AFTER the venv exists, not before", async () => {
    // Set 122 S3 verification round 3, Major 1 — a defect introduced by
    // the round-1 fix and caught before it shipped.
    //
    // On the MAIN cold-start path there is no explicit `pythonPath` and no
    // `.venv`, so `resolvePythonInterpreter` answers bare `python` BEFORE
    // the install and the newly-created `.venv` AFTER it. Capturing that
    // answer eagerly made setup probe bare `python` — which on a normal
    // machine has no router — and report a perfectly good install as
    // failed, skipping default-module creation.
    //
    // The resolver is therefore a thunk, and this pins WHEN it is called:
    // the venv must already exist at resolution time.
    const ws = makeTmpWorkspace(); // no .venv — the fresh-project shape
    const venv = path.join(ws, ".venv");
    let venvExistedAtResolveTime = false;
    const probeCmds: string[] = [];
    const outcome = await installAiRouter({
      workspaceRoot: ws,
      pythonPath: "python",
      resolveLauncherPython: () => {
        // Exactly what `resolvePythonInterpreter` does with no explicit
        // setting: the workspace venv if it is there, else bare `python`.
        venvExistedAtResolveTime = fs.existsSync(venv);
        return venvExistedAtResolveTime ? venvPython(venv) : "python";
      },
      spawner: async (cmd, args) => {
        if (args[0] === "-m" && args[1] === "venv") {
          fs.mkdirSync(args[2], { recursive: true });
          return { exitCode: 0, stdout: "", stderr: "" };
        }
        if (args[0] === "-c" && args[1] === ROUTER_CAPABILITY_PROBE_CODE) {
          probeCmds.push(cmd);
          // Only the venv has the router; bare `python` does not.
          return cmd === venvPython(venv)
            ? { exitCode: 0, stdout: MINIMUM_ROUTER_VERSION, stderr: "" }
            : {
                exitCode: 1,
                stdout: "",
                stderr: "ModuleNotFoundError: No module named 'ai_router'",
              };
        }
        return { exitCode: 0, stdout: "", stderr: "" };
      },
      fileOps: realFileOps(),
      prompts: autoPrompts({ source: "pypi", createVenv: true }),
    });
    assert.strictEqual(
      venvExistedAtResolveTime,
      true,
      "the launcher interpreter must be resolved after the venv is created",
    );
    assert.deepStrictEqual(probeCmds, [venvPython(venv)]);
    assert.strictEqual(
      outcome.ok,
      true,
      `a normal cold start must not report failure: ${outcome.message}`,
    );
    fs.rmSync(ws, { recursive: true, force: true });
  });
});
