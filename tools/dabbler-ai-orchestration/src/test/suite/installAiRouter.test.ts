import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  installAiRouter,
  updateAiRouter,
  isAiRouterNotInstalled,
  deriveVenvFromPythonPath,
  resolveLatestReleaseTag,
  venvPython,
  FileOps,
  InstallSource,
  ProcessSpawner,
  SpawnResult,
  PYPI_PACKAGE_NAME,
  ROUTER_CONFIG_REL,
  INSTALL_METHOD_REL,
  GITHUB_CHECKOUT_REL,
  REPO_URL,
} from "../../utils/aiRouterInstall";
import {
  ProviderQueuesProvider,
  buildTreeItem as buildQueueTreeItem,
  parseFetchResult as parseQueueFetchResult,
} from "../../providers/ProviderQueuesProvider";
import {
  ProviderHeartbeatsProvider,
  buildTreeItem as buildHeartbeatTreeItem,
  parseFetchResult as parseHeartbeatFetchResult,
} from "../../providers/ProviderHeartbeatsProvider";

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
    assert.deepStrictEqual(calls[0].args, ["-m", "pip", "install", PYPI_PACKAGE_NAME]);
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
    assert.deepStrictEqual(calls[1].args, ["-m", "pip", "install", PYPI_PACKAGE_NAME]);
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

  test("update mode passes -U and reads the install-method marker as the default source", async () => {
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
    assert.deepStrictEqual(calls[0].args, ["-m", "pip", "install", "-U", PYPI_PACKAGE_NAME]);
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
    // pip install + the importlib.resources read = 2 calls.
    assert.strictEqual(calls.length, 2);
    assert.match(outcome.message, /Seeded ai_router\/router-config\.yaml/);
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
    // Only the pip install ran — no importlib.resources read.
    assert.strictEqual(calls.length, 1);
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
    // 4 spawn calls: ls-remote → clone → sparse-checkout → pip install -e <stable>
    assert.strictEqual(calls.length, 4);
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
    // 3 calls when an explicit ref is provided: clone → sparse-checkout → pip install -e
    // (ls-remote is skipped — no need to resolve "latest" when the user named it).
    assert.strictEqual(calls.length, 3);
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

// ---------- Provider graceful "not installed" path ----------

function fakeRun(over: Partial<{
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}> = {}) {
  return {
    stdout: "",
    stderr: "",
    exitCode: 0 as number | null,
    signal: null,
    timedOut: false,
    ...over,
  };
}

suite("ProviderQueuesProvider — graceful not-installed (parseFetchResult)", () => {
  test("returns reason=module_not_installed for the ai_router import error", () => {
    const r = parseQueueFetchResult(
      fakeRun({
        exitCode: 1,
        stderr:
          "Error while finding module specification for 'ai_router.queue_status' (ModuleNotFoundError: No module named 'ai_router')",
      }),
    );
    assert.strictEqual(r.ok, false);
    if (!r.ok) {
      assert.strictEqual(r.reason, "module_not_installed");
      assert.match(r.message, /not installed/);
    }
  });

  test("leaves reason undefined for unrelated non-zero exits", () => {
    const r = parseQueueFetchResult(fakeRun({ exitCode: 2, stderr: "RuntimeError: queue corrupt" }));
    assert.strictEqual(r.ok, false);
    if (!r.ok) {
      assert.strictEqual(r.reason, undefined);
      assert.match(r.message, /exited 2/);
    }
  });
});

suite("ProviderQueuesProvider — failure invalidates cache (no stale-data masking)", () => {
  test("a successful fetch followed by a module_not_installed failure renders notInstalled, not the cached payload", async () => {
    const successPayload = {
      providers: {
        anthropic: {
          queue_path: "/ws/provider-queues/anthropic/queue.db",
          queue_present: true,
          states: { new: 0 as number, claimed: 0, completed: 0, failed: 0, timed_out: 0 },
          messages: [] as Array<unknown>,
        },
      },
    };
    // Manual clock so both refreshes fall on opposite sides of the
    // 5s cache TTL. Each refresh advances the clock past CACHE_TTL_MS.
    let nowMs = 1_000_000;
    let call = 0;
    const provider = new ProviderQueuesProvider({
      getWorkspaceRoot: () => "/ws",
      now: () => nowMs,
      fetchPayload: async () => {
        call++;
        if (call === 1) return { ok: true, payload: successPayload as never };
        return {
          ok: false,
          message: "ai_router is not installed in the configured Python environment.",
          reason: "module_not_installed",
        };
      },
    });

    const first = await provider.getChildren();
    assert.ok(first.length > 0 && first[0].kind === "provider",
      "first refresh should surface the cached success payload");

    nowMs += 10_000; // advance past CACHE_TTL_MS so the next call refetches
    const second = await provider.getChildren();
    assert.strictEqual(second.length, 1);
    assert.strictEqual(second[0].kind, "notInstalled",
      "second refresh must surface notInstalled, not the cached success payload");
  });

  test("a successful fetch followed by an unrelated non-zero failure renders the red-error info node, not the cached payload", async () => {
    const successPayload = {
      providers: {
        anthropic: {
          queue_path: "/ws/provider-queues/anthropic/queue.db",
          queue_present: true,
          states: { new: 0 as number, claimed: 0, completed: 0, failed: 0, timed_out: 0 },
          messages: [] as Array<unknown>,
        },
      },
    };
    let nowMs = 1_000_000;
    let call = 0;
    const provider = new ProviderQueuesProvider({
      getWorkspaceRoot: () => "/ws",
      now: () => nowMs,
      fetchPayload: async () => {
        call++;
        if (call === 1) return { ok: true, payload: successPayload as never };
        return { ok: false, message: "queue_status exited 2 — RuntimeError: queue corrupt" };
      },
    });

    await provider.getChildren();
    nowMs += 10_000;
    const second = await provider.getChildren();
    assert.strictEqual(second.length, 1);
    assert.strictEqual(second[0].kind, "info");
    assert.strictEqual(
      (second[0] as { isError?: boolean }).isError,
      true,
    );
  });
});

suite("ProviderHeartbeatsProvider — failure invalidates cache (no stale-data masking)", () => {
  test("a successful fetch followed by a module_not_installed failure renders notInstalled, not the cached payload", async () => {
    const successPayload = {
      providers: {
        anthropic: {
          signal_path: "/ws/provider-queues/anthropic/capacity_signal.jsonl",
          signal_file_present: true,
          last_completion_at: "2026-04-30T14:00:00Z",
          minutes_since_last_completion: 12,
          completions_in_window: 3,
          tokens_in_window: 4231,
          lookback_minutes: 60,
          disclaimer: "obs only",
        },
      },
      disclaimer: "obs only",
    };
    let nowMs = 1_000_000;
    let call = 0;
    const provider = new ProviderHeartbeatsProvider({
      getWorkspaceRoot: () => "/ws",
      now: () => nowMs,
      getSettings: () => ({ lookbackMinutes: 60, silentWarningMinutes: 30 }),
      fetchPayload: async () => {
        call++;
        if (call === 1) return { ok: true, payload: successPayload as never };
        return {
          ok: false,
          message: "ai_router is not installed in the configured Python environment.",
          reason: "module_not_installed",
        };
      },
    });

    const first = await provider.getChildren();
    assert.ok(first.length > 0 && first[0].kind === "provider",
      "first refresh should surface the cached success payload");

    nowMs += 10_000;
    const second = await provider.getChildren();
    assert.strictEqual(second.length, 1);
    assert.strictEqual(second[0].kind, "notInstalled");
  });
});

suite("ProviderQueuesProvider — graceful not-installed tree-item rendering", () => {
  function makeNotInstalledProvider(): ProviderQueuesProvider {
    return new ProviderQueuesProvider({
      getWorkspaceRoot: () => "/ws",
      fetchPayload: async () => ({
        ok: false,
        message: "ai_router is not installed in the configured Python environment.",
        reason: "module_not_installed",
      }),
    });
  }

  test("module_not_installed surfaces a notInstalled root with a clickable child", async () => {
    const provider = makeNotInstalledProvider();
    const top = await provider.getChildren();
    assert.strictEqual(top.length, 1);
    assert.strictEqual(top[0].kind, "notInstalled");

    const children = await provider.getChildren(top[0]);
    assert.strictEqual(children.length, 1);
    assert.strictEqual(children[0].kind, "notInstalledAction");

    const actionItem = buildQueueTreeItem(children[0]);
    assert.strictEqual(actionItem.command?.command, "dabblerSessionSets.installAiRouter");
    assert.strictEqual(actionItem.contextValue, "queueInfo:notInstalledAction");
  });

  test("notInstalled root uses a neutral info icon (not the red error icon) and a distinct contextValue", async () => {
    const provider = makeNotInstalledProvider();
    const top = await provider.getChildren();
    const rootItem = buildQueueTreeItem(top[0]);
    assert.strictEqual(rootItem.contextValue, "queueInfo:notInstalled");
    // Distinguish from the existing error path (`queueInfo:error`); the
    // not-installed state is "configuration needed", not a bug.
    assert.notStrictEqual(rootItem.contextValue, "queueInfo:error");
  });

  test("unrelated non-zero exit still renders the existing red-error info node", async () => {
    const provider = new ProviderQueuesProvider({
      getWorkspaceRoot: () => "/ws",
      fetchPayload: async () => ({ ok: false, message: "queue_status exited 2 — RuntimeError: queue corrupt" }),
    });
    const top = await provider.getChildren();
    assert.strictEqual(top.length, 1);
    assert.strictEqual(top[0].kind, "info");
    const item = buildQueueTreeItem(top[0]);
    assert.strictEqual(item.contextValue, "queueInfo:error");
  });
});

suite("ProviderHeartbeatsProvider — graceful not-installed (parseFetchResult)", () => {
  test("returns reason=module_not_installed for the ai_router import error", () => {
    const r = parseHeartbeatFetchResult(
      fakeRun({
        exitCode: 1,
        stderr:
          "Error while finding module specification for 'ai_router.heartbeat_status' (ModuleNotFoundError: No module named 'ai_router')",
      }),
      60,
    );
    assert.strictEqual(r.ok, false);
    if (!r.ok) {
      assert.strictEqual(r.reason, "module_not_installed");
      assert.match(r.message, /not installed/);
    }
  });

  test("leaves reason undefined for unrelated non-zero exits", () => {
    const r = parseHeartbeatFetchResult(
      fakeRun({ exitCode: 2, stderr: "ConnectionRefusedError: signal file busy" }),
      60,
    );
    assert.strictEqual(r.ok, false);
    if (!r.ok) {
      assert.strictEqual(r.reason, undefined);
      assert.match(r.message, /exited 2/);
    }
  });
});

suite("ProviderHeartbeatsProvider — graceful not-installed tree-item rendering", () => {
  function makeNotInstalledProvider(): ProviderHeartbeatsProvider {
    return new ProviderHeartbeatsProvider({
      getWorkspaceRoot: () => "/ws",
      fetchPayload: async () => ({
        ok: false,
        message: "ai_router is not installed in the configured Python environment.",
        reason: "module_not_installed",
      }),
      getSettings: () => ({ lookbackMinutes: 60, silentWarningMinutes: 30 }),
    });
  }

  test("module_not_installed surfaces a notInstalled root with a clickable child", async () => {
    const provider = makeNotInstalledProvider();
    const top = await provider.getChildren();
    assert.strictEqual(top.length, 1);
    assert.strictEqual(top[0].kind, "notInstalled");

    const children = await provider.getChildren(top[0]);
    assert.strictEqual(children.length, 1);
    assert.strictEqual(children[0].kind, "notInstalledAction");

    const actionItem = buildHeartbeatTreeItem(children[0]);
    assert.strictEqual(actionItem.command?.command, "dabblerSessionSets.installAiRouter");
    assert.strictEqual(actionItem.contextValue, "heartbeatInfo:notInstalledAction");
  });

  test("notInstalled root uses a distinct contextValue from the red-error path", async () => {
    const provider = makeNotInstalledProvider();
    const top = await provider.getChildren();
    const rootItem = buildHeartbeatTreeItem(top[0]);
    assert.strictEqual(rootItem.contextValue, "heartbeatInfo:notInstalled");
    assert.notStrictEqual(rootItem.contextValue, "heartbeatInfo:error");
  });
});
