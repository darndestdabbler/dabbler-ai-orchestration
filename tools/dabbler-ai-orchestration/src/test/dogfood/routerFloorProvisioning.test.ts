// Set 122 Session 3 — the provisioning dogfoods.
//
// L-079-3 is binding for any set shipping provisioning: at least one walk
// must begin from a FRESH EMPTY FOLDER with no pre-seeded config and
// assert the provisioned artifacts exist. This session ships provisioning
// (a version floor, an upgrade-capable install, a capability precondition
// and a retryable scaffold), so it owes that dogfood.
//
// WHY A LANE OF ITS OWN (`npm run test:dogfood`).
//
// The set declares `requiresUAT: false` and that flag is immutable, so
// these are SCRIPTED dogfoods, not operator walks. They need real venvs, a
// real network `pip install` and the real install code path — but nothing
// from the workbench, so an Electron launch would buy no coverage while
// inheriting the parallel-load flake recorded as residual S122-S2-R2.
// They are kept out of `test:unit` because that lane is a ~30-second
// hermetic suite and these are neither hermetic nor fast; a slow network
// test hidden inside it would quietly become the reason nobody runs it.
//
// WHAT IS REAL HERE (the point of a dogfood — no seams, no fakes):
//   - a genuinely empty temp folder per test;
//   - a real `python -m venv`;
//   - a real `pip install`, including a real download of the historical
//     0.34.0 wheel from PyPI for the upgrade scenario;
//   - the REAL `installAiRouter` entry point with the REAL spawner and
//     fileOps the extension ships;
//   - the REAL `probeRouterCapability` and the REAL scaffold gate.
//
// The vscode module is the shipped test stub (the same one `test:unit`
// uses). Nothing under test calls the VS Code API — `makeSpawner` and
// `makeFileOps` are plain child_process/fs wrappers that merely live in a
// module which imports vscode.
//
// The one deliberate substitution is `DABBLER_ROUTER_INSTALL_SPEC`, the
// harness-only override Session 2 added: the "new" router is THIS repo
// rather than the registry's, because a wheel cannot contain code that has
// not been published yet. That is exactly the split this set's spec
// mandates — the pre-release question ("does provisioning work?") is
// answered here, and the release question ("is the PUBLISHED wheel
// compatible?") is answered by the release ordering and carried as
// residual S122-S2-R3.

import * as assert from "assert";
import * as cp from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  MINIMUM_ROUTER_VERSION,
  PYPI_PACKAGE_NAME,
  compareReleaseVersions,
  installAiRouter,
  probeRouterCapability,
  venvPython,
} from "../../utils/aiRouterInstall";
import { makeFileOps, makeSpawner } from "../../commands/installAiRouterCommands";
import {
  decideDefaultModuleScaffold,
  describeDefaultModuleSkip,
  scaffoldDefaultModuleAndLifecycleSets,
} from "../../commands/gitScaffold";
import { classifyModulesManifest, ensureModulesManifest } from "../../utils/moduleAuthoring";
import { resolvePythonInterpreter } from "../../utils/pythonInterpreter";
import { readModulesManifest, listSessionSetDirNames } from "../../utils/fileSystem";
import { RunRouterCliDeps } from "../../utils/routerCli";

/** This repository's root — the "new" router these dogfoods install. */
function repoRoot(): string {
  return path.resolve(__dirname, "../../../../..");
}

/** A genuinely empty folder. No pre-seeded config, per L-079-3. */
function emptyProject(slug: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `dabbler-dogfood-${slug}-`));
}

function cleanup(dir: string | undefined): void {
  if (!dir) return;
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  } catch {
    // A locked venv on Windows must not fail an otherwise-green test.
  }
}

/** The interpreter that creates the venvs — this repo's own, when present. */
function hostPython(): string {
  const local = path.join(
    repoRoot(),
    ".venv",
    process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
  );
  return fs.existsSync(local) ? local : "python";
}

/**
 * A NON-venv interpreter, for the `pythonPath` handed to the install.
 *
 * This is load-bearing, and getting it wrong made an earlier draft of this
 * file prove nothing. `ensureVenv` deliberately honours a venv-shaped
 * `pythonPath` — an operator who pointed `dabblerSessionSets.pythonPath`
 * at their own venv has already chosen it, and the install must not
 * overrule them. So passing {@link hostPython} here (this repo's `.venv`)
 * made every scenario provision into the REPO's venv instead of the temp
 * project: the cold-start assertions then passed because the repo's venv
 * already had `ai_router`, which is a vacuous pass, and the upgrade
 * scenario failed for the honest reason that the project's venv was never
 * touched.
 *
 * Resolving the BASE interpreter (`sys.base_prefix`) gives a real,
 * existing, non-venv interpreter without depending on whatever `python`
 * happens to be on PATH.
 */
function basePython(): string {
  const res = cp.spawnSync(
    hostPython(),
    [
      "-c",
      "import sys, os\n" +
        "print(os.path.join(sys.base_prefix, 'python.exe' if os.name == 'nt' else 'bin/python'))",
    ],
    { encoding: "utf8" },
  );
  const resolved = (res.stdout ?? "").trim();
  return resolved && fs.existsSync(resolved) ? resolved : "python";
}

/** Ask an interpreter for the installed distribution version, or null. */
function installedVersion(pythonPath: string): string | null {
  const res = cp.spawnSync(
    pythonPath,
    [
      "-c",
      "from importlib.metadata import version, PackageNotFoundError\n" +
        "try:\n" +
        `    print(version(${JSON.stringify(PYPI_PACKAGE_NAME)}))\n` +
        "except PackageNotFoundError:\n" +
        "    print('')",
    ],
    { encoding: "utf8" },
  );
  const out = (res.stdout ?? "").trim();
  return out === "" ? null : out;
}

/** Can this interpreter run what the launchers run? */
function canImportModules(pythonPath: string): boolean {
  const res = cp.spawnSync(pythonPath, ["-c", "import ai_router.modules"], {
    encoding: "utf8",
  });
  return res.status === 0;
}

function nonInteractivePrompts() {
  return {
    pickSource: async () => "pypi" as const,
    confirmCreateVenv: async () => true,
    promptGitHubRef: async () => "",
  };
}

/**
 * Run the REAL install against `projectDir`, resolving the router from
 * `installSpec`. `DABBLER_ROUTER_INSTALL_SPEC` is read from the process
 * environment by `routerInstallSpec`, so it is set around the call and
 * restored afterwards.
 */
async function realInstall(projectDir: string, installSpec: string) {
  const prior = process.env.DABBLER_ROUTER_INSTALL_SPEC;
  process.env.DABBLER_ROUTER_INSTALL_SPEC = installSpec;
  try {
    const outcome = await installAiRouter({
      workspaceRoot: projectDir,
      pythonPath: basePython(),
      // Set 122 S3 (round 3, Major 2): the PRODUCTION handoff, verbatim.
      // `buildProjectStructureNoPrompt` and the install command both pass
      // exactly this thunk, so the dogfood exercises the same resolution
      // the real cold start does — including the timing. Omitting it (as
      // an earlier draft did) let the lane stay green while the real setup
      // path probed a stale bare `python`.
      resolveLauncherPython: () => resolvePythonInterpreter(projectDir),
      spawner: makeSpawner(),
      fileOps: makeFileOps(),
      prompts: nonInteractivePrompts(),
    });
    // The guard that makes a vacuous pass impossible. If the install ever
    // provisions somewhere other than this temp project, every assertion
    // downstream is measuring a venv the test did not create — which is
    // exactly the defect that hid here once already.
    if (outcome.venvPath !== null) {
      assert.ok(
        path.resolve(outcome.venvPath).startsWith(path.resolve(projectDir) + path.sep),
        `install provisioned OUTSIDE the temp project: ${outcome.venvPath} is not under ${projectDir}`,
      );
    }
    return outcome;
  } finally {
    if (prior === undefined) delete process.env.DABBLER_ROUTER_INSTALL_SPEC;
    else process.env.DABBLER_ROUTER_INSTALL_SPEC = prior;
  }
}

/**
 * Actually create the default module, through the REAL Python-backed
 * scaffold, using the interpreter this project's setup provisioned.
 *
 * Set 122 S3 verification round 1, Majors 2 and 4: asserting that the
 * GATE says "scaffold" is not the same claim as "a fresh setup produces
 * the default module". Only running the real thing proves the
 * install-to-launcher handoff works end to end — and it is precisely the
 * integration the interpreter-divergence finding said could break while
 * every gate-level assertion stayed green.
 */
async function realDefaultModuleScaffold(projectDir: string, venvPy: string) {
  // Production resolves the interpreter per call via
  // `resolvePythonInterpreter`; by this point the venv exists, so that is
  // what it returns. Assert the two agree rather than injecting a value
  // production would never use (round 3, Major 2).
  const resolved = resolvePythonInterpreter(projectDir);
  assert.strictEqual(
    resolved,
    venvPy,
    "the launcher resolution must land on the venv setup created",
  );
  const cliDeps: RunRouterCliDeps = {
    resolveInterpreter: () => resolvePythonInterpreter(projectDir),
    echo: { append: () => undefined, reveal: () => undefined },
  };
  return scaffoldDefaultModuleAndLifecycleSets(projectDir, cliDeps);
}

/** The declared module slugs, read back from the manifest on disk. */
function declaredSlugs(projectDir: string): string[] {
  return (readModulesManifest(projectDir) ?? []).map((m) => String(m.slug));
}

suite("Set 122 S3 — provisioning dogfoods (real venv, real pip)", () => {
  test("cold start: a clean project with no .venv finishes setup with ai_router.modules importable", async () => {
    // Scenario (a) from the spec, at the level the spec asks for: assert
    // the PROVISIONED ARTIFACT exists, not that a command returned zero.
    const projectDir = emptyProject("coldstart");
    try {
      assert.strictEqual(
        fs.existsSync(path.join(projectDir, ".venv")),
        false,
        "the walk must start from a genuinely empty folder",
      );

      const outcome = await realInstall(projectDir, repoRoot());

      assert.strictEqual(outcome.ok, true, outcome.message);
      assert.ok(outcome.venvPath, "setup must create a venv");
      assert.strictEqual(
        path.resolve(outcome.venvPath as string),
        path.resolve(path.join(projectDir, ".venv")),
        "setup must create the venv inside the project it was pointed at",
      );
      const venvPy = venvPython(outcome.venvPath as string);
      assert.ok(fs.existsSync(venvPy), `expected an interpreter at ${venvPy}`);

      // The capability, from the interpreter the launchers will actually
      // use — the whole point of the precondition (L-125-1). Asserting the
      // INTERPRETER, not just the verdict, is what pins the round-3 fix:
      // a stale resolution would name bare `python` here.
      assert.strictEqual(
        outcome.capability?.ok,
        true,
        JSON.stringify(outcome.capability),
      );
      assert.strictEqual(
        outcome.capability?.interpreter,
        venvPy,
        "the production handoff must probe the venv this setup created, not a stale bare python",
      );
      assert.strictEqual(canImportModules(venvPy), true);

      const version = installedVersion(venvPy);
      assert.ok(version, "the installed distribution must report a version");
      assert.ok(
        (compareReleaseVersions(version as string, MINIMUM_ROUTER_VERSION) ?? -1) >= 0,
        `installed ${version}, floor ${MINIMUM_ROUTER_VERSION}`,
      );

      // ...and the default module is really created, by the real
      // Python-backed scaffold, running in the venv setup just built.
      // Asserting the GATE alone would not prove the promised outcome
      // (round 1, Majors 2 and 4).
      ensureModulesManifest(projectDir, makeFileOps());
      assert.strictEqual(
        decideDefaultModuleScaffold(classifyModulesManifest(projectDir), outcome.ok),
        "scaffold",
      );

      const scaffolded = await realDefaultModuleScaffold(projectDir, venvPy);
      assert.strictEqual(scaffolded.ran, true, scaffolded.note);
      assert.deepStrictEqual(
        declaredSlugs(projectDir),
        ["default"],
        "a fresh setup must declare exactly the default module",
      );
      // The two lifecycle sets the scaffold promises, on disk.
      const setDirs = listSessionSetDirNames(projectDir);
      assert.strictEqual(
        setDirs.length,
        2,
        `expected the plan + decomposition sets, got ${JSON.stringify(setDirs)}`,
      );
      for (const slug of [scaffolded.planSlug, scaffolded.decompositionSlug]) {
        assert.ok(slug, "the scaffold must name both lifecycle sets");
        assert.ok(
          fs.existsSync(path.join(projectDir, "docs", "session-sets", slug as string, "spec.md")),
          `expected a spec.md for ${slug}`,
        );
      }

      // Re-running the gate now correctly declines: the module exists.
      assert.strictEqual(
        decideDefaultModuleScaffold(classifyModulesManifest(projectDir), outcome.ok),
        "skip-modules-declared",
      );
    } finally {
      cleanup(projectDir);
    }
  });

  test("upgrade: a .venv holding dabbler-ai-router==0.34.0 is upgraded to a compatible release", async () => {
    // Scenario (b), and the concrete regression this session exists to
    // prevent. 0.34.0 is the real wheel that was live on PyPI when Session
    // 2 made the extension depend on `ai_router.modules` — a wheel that
    // does NOT contain it. Before this session the setup install was a
    // plain `pip install`, which reports an existing 0.34.0 as
    // already-satisfied, so every existing project would take the
    // Marketplace update and then fail every module command.
    const projectDir = emptyProject("upgrade");
    try {
      const venvPath = path.join(projectDir, ".venv");
      const created = cp.spawnSync(hostPython(), ["-m", "venv", venvPath], {
        encoding: "utf8",
      });
      assert.strictEqual(created.status, 0, created.stderr);
      const venvPy = venvPython(venvPath);

      // Seed the OLD wheel, for real, from the registry.
      const seeded = cp.spawnSync(
        venvPy,
        ["-m", "pip", "install", `${PYPI_PACKAGE_NAME}==0.34.0`],
        { encoding: "utf8", timeout: 300_000 },
      );
      assert.strictEqual(seeded.status, 0, seeded.stderr || seeded.stdout);

      // The premise must hold, or the test proves nothing: this venv
      // really is the broken shape — package present, capability absent.
      assert.strictEqual(installedVersion(venvPy), "0.34.0");
      assert.strictEqual(
        canImportModules(venvPy),
        false,
        "0.34.0 must NOT provide ai_router.modules, or this scenario is vacuous",
      );

      // Now run setup exactly as a developer would after taking the update.
      const outcome = await realInstall(projectDir, repoRoot());

      assert.strictEqual(outcome.ok, true, outcome.message);
      assert.strictEqual(
        outcome.capability?.ok,
        true,
        JSON.stringify(outcome.capability),
      );
      assert.strictEqual(canImportModules(venvPy), true);

      const after = installedVersion(venvPy);
      assert.notStrictEqual(after, "0.34.0", "the old wheel must not survive setup");
      assert.ok(
        (compareReleaseVersions(after as string, MINIMUM_ROUTER_VERSION) ?? -1) >= 0,
        `upgraded to ${after}, floor ${MINIMUM_ROUTER_VERSION}`,
      );
    } finally {
      cleanup(projectDir);
    }
  });

  test("failure path: an unavailable install attempts no module mutation, and a re-run recovers", async () => {
    // The spec's third assertion, and the retryability fix. Two claims:
    //   1. an install that cannot produce a usable router never reaches
    //      the Python-backed module scaffold;
    //   2. re-running setup after that failure succeeds WITHOUT deleting
    //      the docs/modules.yaml the failed attempt already created.
    //
    // The install is failed the honest way — pointed at a requirement that
    // cannot resolve — so this exercises the real failure branch rather
    // than a stubbed one.
    const projectDir = emptyProject("retry");
    try {
      const unresolvable = `${PYPI_PACKAGE_NAME}-does-not-exist==999.999.999`;
      const failed = await realInstall(projectDir, unresolvable);
      assert.strictEqual(failed.ok, false, "an unresolvable requirement must fail");

      // The manifest lands during the scaffold, BEFORE the install runs —
      // which is exactly why gating on "did this call create it?" made the
      // failure unrecoverable.
      ensureModulesManifest(projectDir, makeFileOps());
      const manifest = path.join(projectDir, "docs", "modules.yaml");
      assert.ok(fs.existsSync(manifest));

      // Claim 1: no Python-backed mutation is attempted.
      const blocked = decideDefaultModuleScaffold(
        classifyModulesManifest(projectDir),
        failed.ok,
      );
      assert.strictEqual(blocked, "skip-router-unavailable");
      assert.ok(describeDefaultModuleSkip(blocked).includes("do NOT need to delete"));

      // Claim 2: the retry recovers, with the manifest left exactly where
      // the failed attempt put it. This is the assertion that fails
      // against the pre-Set-122-S3 gate.
      const before = fs.readFileSync(manifest, "utf8");
      const retry = await realInstall(projectDir, repoRoot());
      assert.strictEqual(retry.ok, true, retry.message);
      assert.strictEqual(retry.capability?.ok, true);

      assert.ok(
        fs.existsSync(manifest),
        "the retry must not require deleting the manifest",
      );
      assert.strictEqual(fs.readFileSync(manifest, "utf8"), before);
      assert.strictEqual(
        decideDefaultModuleScaffold(classifyModulesManifest(projectDir), retry.ok),
        "scaffold",
      );

      // And the recovery really produces the module — the whole point of
      // the retryability fix, proven by doing it rather than by asking the
      // gate (round 1, Majors 2 and 4).
      const scaffolded = await realDefaultModuleScaffold(
        projectDir,
        venvPython(retry.venvPath as string),
      );
      assert.strictEqual(scaffolded.ran, true, scaffolded.note);
      assert.deepStrictEqual(declaredSlugs(projectDir), ["default"]);
      assert.strictEqual(listSessionSetDirNames(projectDir).length, 2);
    } finally {
      cleanup(projectDir);
    }
  });

  test("the probe answers for the venv it is given, not for the host interpreter", async () => {
    // Cheap but load-bearing: an empty venv with no router at all must
    // probe as not-importable. If the probe leaked to the host
    // interpreter — which in this repo DOES have ai_router — it would
    // report success for a venv that cannot run a single module command,
    // and every other assertion here would be measuring the wrong thing.
    const projectDir = emptyProject("isolation");
    try {
      const venvPath = path.join(projectDir, ".venv");
      const created = cp.spawnSync(hostPython(), ["-m", "venv", venvPath], {
        encoding: "utf8",
      });
      assert.strictEqual(created.status, 0, created.stderr);

      const probe = await probeRouterCapability(makeSpawner(), venvPython(venvPath));
      assert.strictEqual(probe.ok, false);
      assert.strictEqual(probe.reason, "not-importable");

      // And the host interpreter this suite runs on genuinely does have
      // it, so the assertion above is a real discrimination rather than a
      // universally-true statement.
      //
      // This premise is PROVISIONED, not assumed (round 2): the CI job
      // installs this checkout with `pip install -e .` before running the
      // lane, exactly as the sample-project smoke job does, and a local
      // run uses the repo's own `.venv`. If it ever fails, the fix is that
      // step — not weakening the assertion.
      assert.strictEqual(
        canImportModules(hostPython()),
        true,
        `the host interpreter (${hostPython()}) must be able to import ai_router.modules ` +
          "for the venv-isolation check above to discriminate. Locally: create the repo " +
          "root .venv and `pip install -e .`. In CI: the provisioning-dogfood job's " +
          "'Install ai_router into the host interpreter' step.",
      );
    } finally {
      cleanup(projectDir);
    }
  });
});
