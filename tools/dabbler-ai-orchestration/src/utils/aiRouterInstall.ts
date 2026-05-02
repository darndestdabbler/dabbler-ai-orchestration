import * as path from "path";

/**
 * Pure-logic core for the ``Dabbler: Install ai-router`` /
 * ``Dabbler: Update ai-router`` commands.
 *
 * The VS Code wiring lives in ``commands/installAiRouterCommands.ts``;
 * everything here takes injected dependencies (process spawner, fs ops,
 * UI prompts) so the test suite can exercise the full PyPI / GitHub
 * branching, ``router-config.yaml`` preservation, and install-method
 * marker round-trip without spawning real subprocesses or touching the
 * real filesystem.
 *
 * Design follows the spec's risk note ("inject a ``processSpawner``
 * dependency into the command's helper functions, matching the existing
 * ``cancelLifecycleCommands.ts`` dependency-injection style"). The
 * dependency object is the only knob the test passes; production code
 * supplies real ``child_process.spawn`` and ``fs`` wrappers.
 */

export const PYPI_PACKAGE_NAME = "dabbler-ai-router";
export const REPO_URL = "https://github.com/darndestdabbler/dabbler-ai-orchestration.git";
export const ROUTER_CONFIG_REL = path.posix.join("ai_router", "router-config.yaml");
export const INSTALL_METHOD_REL = path.posix.join(".dabbler", "install-method");
/**
 * Persistent location for the GitHub-path sparse checkout. Editable
 * installs need a stable source tree on disk — installing from a tmpdir
 * that is then deleted leaves a dangling .egg-link pointing nowhere
 * (Round 1 verifier catch). Keep the checkout under ``.dabbler/`` so
 * it sits next to the install-method marker and is one obvious thing
 * for an operator to clean up if they ever want to.
 */
export const GITHUB_CHECKOUT_REL = path.posix.join(".dabbler", "ai-router-src");

export type InstallSource = "pypi" | "github";

export interface SpawnResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export interface ProcessSpawner {
  (
    cmd: string,
    args: string[],
    opts?: { cwd?: string; timeoutMs?: number },
  ): Promise<SpawnResult>;
}

export interface FileOps {
  exists: (absPath: string) => boolean;
  readFile: (absPath: string) => string;
  writeFile: (absPath: string, content: string) => void;
  mkdirp: (absPath: string) => void;
  /** Recursively copy a directory (overwrites destination contents). */
  copyDir: (srcAbs: string, dstAbs: string) => void;
  /** Recursively remove a path; no-op when missing. */
  removeRecursive: (absPath: string) => void;
  /** Make a unique temporary directory and return its absolute path. */
  mkdtemp: (prefix: string) => string;
}

export interface InstallPrompts {
  /**
   * Ask the operator which install source to use. Returns ``undefined``
   * when the prompt is dismissed; the caller treats that as "abort".
   */
  pickSource: (defaultSource: InstallSource) => Promise<InstallSource | undefined>;
  /** Ask whether to create a venv at the given absolute path. */
  confirmCreateVenv: (venvAbsPath: string) => Promise<boolean>;
  /**
   * Ask which git ref to check out for the GitHub path. Returns
   * ``undefined`` when the prompt is dismissed (treat as abort);
   * returns the empty string when the operator wants the default
   * (latest released tag — :func:`runGitHubInstall` resolves this via
   * ``git ls-remote --tags --refs``).
   */
  promptGitHubRef: (defaultRef: string) => Promise<string | undefined>;
}

export interface ProgressReporter {
  /** Free-form status line shown in the VS Code progress notification. */
  (message: string): void;
}

export interface InstallDeps {
  /** Workspace root (the directory that owns ``ai_router/``). */
  workspaceRoot: string;
  /** Configured Python interpreter path (e.g. ``"python"`` or ``".venv/Scripts/python.exe"``). */
  pythonPath: string;
  /**
   * Repo URL the GitHub fallback path clones from. Defaults to the
   * upstream when omitted; the install command threads
   * ``dabblerSessionSets.aiRouterRepoUrl`` through here so fork-trackers
   * can point the fallback at their fork without editing the
   * extension source.
   */
  repoUrl?: string;
  spawner: ProcessSpawner;
  fileOps: FileOps;
  prompts: InstallPrompts;
  /** Optional — defaults to a no-op. */
  reportProgress?: ProgressReporter;
}

export interface InstallOutcome {
  ok: boolean;
  /** Operator-facing message. */
  message: string;
  /** Source actually used (null when the operator aborted before picking). */
  source: InstallSource | null;
  /** Absolute path to the venv exercised. */
  venvPath: string | null;
  /** True when an existing ``router-config.yaml`` was stashed and restored. */
  routerConfigPreserved: boolean;
  /**
   * For the GitHub path: which ref was actually checked out (null for
   * PyPI / aborts). Useful for the success message and for tests that
   * want to assert the latest-tag resolution worked.
   */
  resolvedRef?: string | null;
}

const DEFAULT_GITHUB_REF = "<latest released tag>";
/** Matches release tags of the form ``vMAJOR.MINOR.PATCH`` (no pre-release suffix). */
const RELEASE_TAG_RE = /^v(\d+)\.(\d+)\.(\d+)$/;

// ---------- Module-not-installed detection (shared with the provider views) ----------

/**
 * Detects the precise stderr signature ``python -m ai_router.<x>`` emits when
 * ``ai_router`` is not on ``sys.path``. This must match exactly the messages
 * that ``runpy`` / ``python -m`` produce for that case so the providers can
 * surface a "Click here to install" tree-item instead of the existing red
 * error. False positives would mask real bugs; false negatives would surface
 * a less-useful error to first-time users.
 */
export function isAiRouterNotInstalled(stderr: string): boolean {
  if (!stderr) return false;
  if (/ModuleNotFoundError:\s*No module named ['"]ai_router['"]/.test(stderr)) return true;
  // ``python -m ai_router.foo`` on a missing module emits:
  //   "Error while finding module specification for 'ai_router.foo'
  //    (ModuleNotFoundError: No module named 'ai_router')"
  // The ModuleNotFoundError check above already covers the parenthetical;
  // the leading "Error while finding module specification" is matched as a
  // belt-and-braces fallback in case the bundled error formatter changes.
  if (
    /Error while finding module specification for ['"]ai_router\./.test(stderr) &&
    /No module named ['"]ai_router['"]/.test(stderr)
  ) {
    return true;
  }
  return false;
}

// ---------- Public entry points ----------

/**
 * Install ``ai_router`` into the workspace.
 *
 * Returns an :class:`InstallOutcome` describing what happened. Never throws
 * for spawn / fs failures — the outcome carries an operator-facing
 * ``message`` instead, mirroring the pattern in ``runPythonModule`` so the
 * UI can surface results uniformly.
 */
export async function installAiRouter(deps: InstallDeps): Promise<InstallOutcome> {
  return doInstall(deps, { mode: "install" });
}

/**
 * Update ``ai_router`` in the workspace.
 *
 * Reads the install-method marker written by a prior install. PyPI installs
 * use ``pip install -U``; GitHub installs re-pull the sparse-checkout. When
 * no marker is present, falls back to a fresh install flow.
 */
export async function updateAiRouter(deps: InstallDeps): Promise<InstallOutcome> {
  return doInstall(deps, { mode: "update" });
}

// ---------- Core flow ----------

interface DoInstallOpts {
  mode: "install" | "update";
}

async function doInstall(deps: InstallDeps, opts: DoInstallOpts): Promise<InstallOutcome> {
  const report = deps.reportProgress ?? (() => {});

  // 1) Decide install source.
  let priorSource: InstallSource | null = null;
  if (opts.mode === "update") {
    priorSource = readInstallMethodMarker(deps);
  }
  const defaultSource: InstallSource = priorSource ?? "pypi";
  const source = await deps.prompts.pickSource(defaultSource);
  if (!source) {
    return {
      ok: false,
      message: "Install cancelled (no source chosen).",
      source: null,
      venvPath: null,
      routerConfigPreserved: false,
    };
  }

  // 2) Resolve / offer-to-create venv. Both paths need a venv because the
  //    PyPI path runs `pip install` and the GitHub path runs `pip install
  //    -e <persistent-checkout>` against the sparse-checked-out tree.
  const venvResult = await ensureVenv(deps);
  if (!venvResult.ok) {
    return {
      ok: false,
      message: venvResult.message,
      source,
      venvPath: null,
      routerConfigPreserved: false,
    };
  }
  const venvPath = venvResult.venvPath;

  if (source === "pypi") {
    return await runPyPiInstall(deps, { venvPath, mode: opts.mode, report });
  }
  return await runGitHubInstall(deps, { venvPath, report });
}

// ---------- venv detection / creation ----------

interface VenvResult {
  ok: true;
  venvPath: string;
  message: string;
}
interface VenvFailure {
  ok: false;
  message: string;
  venvPath: null;
}

async function ensureVenv(deps: InstallDeps): Promise<VenvResult | VenvFailure> {
  // First, see if the configured pythonPath itself lives inside a venv —
  // an operator who pointed `dabblerSessionSets.pythonPath` at
  // `<somewhere>/.venv/Scripts/python.exe` has already chosen the venv,
  // and we should not overrule them by hunting for `.venv/` at the
  // workspace root. The candidate-from-path is path-shape-only; the
  // ``pyvenv.cfg`` marker check below is what distinguishes a real
  // venv from a system interpreter at e.g. `/usr/bin/python3` whose
  // parent dir happens to be ``bin/``.
  const fromPythonPath = deriveVenvFromPythonPath(deps.pythonPath);
  if (
    fromPythonPath &&
    deps.fileOps.exists(fromPythonPath) &&
    deps.fileOps.exists(path.join(fromPythonPath, "pyvenv.cfg"))
  ) {
    return {
      ok: true,
      venvPath: fromPythonPath,
      message: `Using venv from configured pythonPath: ${fromPythonPath}`,
    };
  }
  const candidate = findExistingVenv(deps);
  if (candidate) {
    return { ok: true, venvPath: candidate, message: `Using existing venv at ${candidate}` };
  }
  const target = path.join(deps.workspaceRoot, ".venv");
  const create = await deps.prompts.confirmCreateVenv(target);
  if (!create) {
    return {
      ok: false,
      message:
        "No venv found at .venv/ or venv/. Install cancelled — create a venv first or accept the prompt to create .venv.",
      venvPath: null,
    };
  }
  // Choose a bootstrap interpreter for the `-m venv` call. The fix-
  // worthy case is the *ENOENT* one: the configured pythonPath has
  // venv shape AND points at a path that doesn't exist on disk yet
  // (e.g. ``.venv/Scripts/python.exe`` before ``.venv`` is created).
  // Spawning it would ENOENT instead of creating the venv. Fall back
  // to bare ``"python"`` from PATH for that case only. When the
  // configured interpreter exists (e.g. ``/usr/bin/python3``), we
  // honor it — the operator picked that Python version intentionally
  // and bootstrapping with bare ``"python"`` could pick up Python 2,
  // a different version, or nothing at all on PATH.
  const venvShaped = deriveVenvFromPythonPath(deps.pythonPath) !== null;
  const interpreterExists = path.isAbsolute(deps.pythonPath)
    ? deps.fileOps.exists(deps.pythonPath)
    : true; // bare commands rely on PATH; treat as "exists" and let spawn fail loudly if not
  const bootstrap =
    venvShaped && !interpreterExists ? "python" : deps.pythonPath;
  const result = await deps.spawner(bootstrap, ["-m", "venv", target], {
    cwd: deps.workspaceRoot,
    timeoutMs: 60_000,
  });
  if (result.exitCode !== 0) {
    return {
      ok: false,
      message: `Failed to create venv at ${target} (using bootstrap '${bootstrap}'): ${oneLine(result.stderr || result.stdout) || `exit ${result.exitCode}`}`,
      venvPath: null,
    };
  }
  return { ok: true, venvPath: target, message: `Created venv at ${target}` };
}

function findExistingVenv(deps: InstallDeps): string | null {
  for (const rel of [".venv", "venv"]) {
    const abs = path.join(deps.workspaceRoot, rel);
    if (deps.fileOps.exists(abs)) return abs;
  }
  return null;
}

/**
 * Path-shape candidate for a venv root inferred from ``pythonPath``.
 *
 * Returns the grandparent directory when the immediate parent is
 * ``Scripts/`` or ``bin/`` (the two layouts ``python -m venv`` writes).
 * **The candidate is not validated here** — ``/usr/bin/python3`` would
 * yield ``/usr``, which is a system path, not a venv. Callers MUST
 * confirm the candidate by checking for a ``pyvenv.cfg`` marker (the
 * standard signature of a virtual environment) before treating the
 * candidate as the install target. ``ensureVenv`` does this.
 */
export function deriveVenvFromPythonPath(pythonPath: string): string | null {
  if (!pythonPath || !path.isAbsolute(pythonPath)) return null;
  const parent = path.basename(path.dirname(pythonPath));
  if (parent === "Scripts" || parent === "bin") {
    return path.dirname(path.dirname(pythonPath));
  }
  return null;
}

/**
 * Resolve the venv's pip executable (or the venv's python, if pip is not
 * present as a top-level shim — falls back to ``<python> -m pip``).
 *
 * Returns absolute paths; production code passes them straight to the
 * spawner.
 */
export function venvPython(venvPath: string): string {
  // Windows venvs put executables under Scripts/; POSIX under bin/.
  // Both layouts ship a ``python`` shim by name.
  const candidates =
    process.platform === "win32"
      ? [path.join(venvPath, "Scripts", "python.exe"), path.join(venvPath, "Scripts", "python")]
      : [path.join(venvPath, "bin", "python"), path.join(venvPath, "bin", "python3")];
  return candidates[0];
}

// ---------- PyPI path ----------

interface PyPiOpts {
  venvPath: string;
  mode: "install" | "update";
  report: ProgressReporter;
}

async function runPyPiInstall(
  deps: InstallDeps,
  opts: PyPiOpts,
): Promise<InstallOutcome> {
  opts.report(
    opts.mode === "update"
      ? `Upgrading ${PYPI_PACKAGE_NAME} from PyPI…`
      : `Installing ${PYPI_PACKAGE_NAME} from PyPI…`,
  );
  const pipArgs =
    opts.mode === "update"
      ? ["-m", "pip", "install", "-U", PYPI_PACKAGE_NAME]
      : ["-m", "pip", "install", PYPI_PACKAGE_NAME];
  const venvPy = venvPython(opts.venvPath);
  const result = await deps.spawner(venvPy, pipArgs, {
    cwd: deps.workspaceRoot,
    timeoutMs: 300_000,
  });
  if (result.exitCode !== 0) {
    return {
      ok: false,
      message: `pip install failed: ${oneLine(result.stderr || result.stdout) || `exit ${result.exitCode}`}`,
      source: "pypi",
      venvPath: opts.venvPath,
      routerConfigPreserved: false,
    };
  }
  // Materialize ``ai_router/router-config.yaml`` into the workspace if
  // it isn't already there. The PyPI install puts the file under
  // ``<venv>/.../site-packages/ai_router/router-config.yaml`` (it ships
  // as package data), but the rest of the workflow — and the post-
  // install editor-open / tuning toast — assumes the workspace owns a
  // local copy that the operator edits without touching site-packages.
  // An *existing* local copy is left untouched.
  let materialized = false;
  const workspaceConfig = path.join(deps.workspaceRoot, ROUTER_CONFIG_REL);
  if (!deps.fileOps.exists(workspaceConfig)) {
    const seed = await readBundledRouterConfig(deps, venvPy);
    if (seed !== null) {
      try {
        deps.fileOps.mkdirp(path.dirname(workspaceConfig));
        deps.fileOps.writeFile(workspaceConfig, seed);
        materialized = true;
      } catch {
        // Non-fatal: the install succeeded, the file copy didn't. The
        // operator can re-run or copy by hand. The success message
        // below still surfaces "installed".
      }
    }
  }
  writeInstallMethodMarker(deps, "pypi");
  return {
    ok: true,
    message:
      opts.mode === "update"
        ? `Upgraded ${PYPI_PACKAGE_NAME} in ${opts.venvPath}.${materialized ? " Seeded ai_router/router-config.yaml from the installed package." : ""}`
        : `Installed ${PYPI_PACKAGE_NAME} into ${opts.venvPath}.${materialized ? " Seeded ai_router/router-config.yaml from the installed package." : ""}`,
    source: "pypi",
    venvPath: opts.venvPath,
    routerConfigPreserved: materialized,
  };
}

/**
 * Read the bundled ``router-config.yaml`` out of the freshly-installed
 * ``ai_router`` package. Shells out to the venv's Python with a
 * one-liner that resolves the package's data file via
 * ``importlib.resources``; on any failure (path doesn't exist, the
 * package was installed without its package data, the spawn failed)
 * returns ``null`` so the caller can fall through gracefully without
 * derailing the install.
 */
async function readBundledRouterConfig(
  deps: InstallDeps,
  venvPy: string,
): Promise<string | null> {
  const code =
    "from importlib.resources import files; " +
    "p = files('ai_router').joinpath('router-config.yaml'); " +
    "import sys; sys.stdout.write(p.read_text(encoding='utf-8'))";
  const result = await deps.spawner(venvPy, ["-c", code], {
    cwd: deps.workspaceRoot,
    timeoutMs: 30_000,
  });
  if (result.exitCode !== 0 || !result.stdout) return null;
  return result.stdout;
}

// ---------- GitHub sparse-checkout path ----------

interface GitHubOpts {
  venvPath: string;
  report: ProgressReporter;
}

/**
 * Resolve the latest released tag (``vMAJOR.MINOR.PATCH``) from the
 * remote. Returns the highest semver tag, or ``null`` if the remote has
 * no release tags or the ls-remote call fails. Pre-release suffixes
 * (``-rc1``, etc.) are filtered out — this is the *released* tag.
 */
export async function resolveLatestReleaseTag(
  deps: InstallDeps,
): Promise<string | null> {
  const repo = deps.repoUrl ?? REPO_URL;
  const result = await deps.spawner(
    "git",
    ["ls-remote", "--tags", "--refs", repo],
    { cwd: deps.workspaceRoot, timeoutMs: 60_000 },
  );
  if (result.exitCode !== 0) return null;
  const tags: Array<{ raw: string; sortable: [number, number, number] }> = [];
  for (const line of result.stdout.split(/\r?\n/)) {
    const m = /^[0-9a-f]+\s+refs\/tags\/(.+)$/.exec(line.trim());
    if (!m) continue;
    const tag = m[1];
    const sm = RELEASE_TAG_RE.exec(tag);
    if (!sm) continue;
    tags.push({
      raw: tag,
      sortable: [Number(sm[1]), Number(sm[2]), Number(sm[3])],
    });
  }
  if (tags.length === 0) return null;
  tags.sort((a, b) => {
    for (let i = 0; i < 3; i++) {
      if (a.sortable[i] !== b.sortable[i]) return b.sortable[i] - a.sortable[i];
    }
    return 0;
  });
  return tags[0].raw;
}

async function runGitHubInstall(
  deps: InstallDeps,
  opts: GitHubOpts,
): Promise<InstallOutcome> {
  // Ask up-front for the ref. Empty string ⇒ caller wants the latest
  // released tag (resolved below); undefined ⇒ caller dismissed the
  // prompt, treat as abort.
  const userRef = await deps.prompts.promptGitHubRef(DEFAULT_GITHUB_REF);
  if (userRef === undefined) {
    return {
      ok: false,
      message: "Install cancelled (no GitHub ref chosen).",
      source: "github",
      venvPath: opts.venvPath,
      routerConfigPreserved: false,
      resolvedRef: null,
    };
  }
  const explicitRef =
    userRef.trim() === "" || userRef === DEFAULT_GITHUB_REF ? null : userRef;

  let refToUse: string | null = explicitRef;
  if (refToUse === null) {
    opts.report("Resolving latest released tag…");
    refToUse = await resolveLatestReleaseTag(deps);
    if (refToUse === null) {
      return {
        ok: false,
        message:
          "Could not resolve the latest released tag from the remote. Re-run and supply a tag/branch explicitly.",
        source: "github",
        venvPath: opts.venvPath,
        routerConfigPreserved: false,
        resolvedRef: null,
      };
    }
  }

  // 1) Stash router-config.yaml if it exists. The stash is in-memory
  //    because the file is small UTF-8 text. The restore happens in the
  //    outer try/finally below so a copyDir / writeFile failure can't
  //    leave the operator's tuned config lost (Round 1 verifier catch).
  const routerConfigAbs = path.join(deps.workspaceRoot, ROUTER_CONFIG_REL);
  let stashedConfig: string | null = null;
  if (deps.fileOps.exists(routerConfigAbs)) {
    stashedConfig = deps.fileOps.readFile(routerConfigAbs);
  }
  let preserved = false;
  let lastRestoreError: string | null = null;
  /**
   * Attempt to restore the stashed router-config.yaml. Idempotent and
   * retry-safe: returns ``true`` once the stash has been written
   * back to disk (or there was nothing to restore in the first place),
   * ``false`` on failure. Does NOT mark itself "done" on failure —
   * that's the round-4 bug — so the outer-finally retry can re-attempt
   * after the named-failure branches give it another chance.
   */
  const restoreStash = (): boolean => {
    if (stashedConfig === null) return true;
    if (preserved) return true;
    try {
      deps.fileOps.writeFile(routerConfigAbs, stashedConfig);
      preserved = true;
      lastRestoreError = null;
      return true;
    } catch (err) {
      lastRestoreError = err instanceof Error ? err.message : String(err);
      return false;
    }
  };
  /**
   * Wraps an outcome before returning so the install never reports
   * ``ok: true`` while the operator's tuned router-config.yaml is
   * unrestored. Round-4 verifier catch: the previous restoreStash
   * implementation could swallow a write failure on the success path
   * and leave the workspace with the upstream default file (or a
   * missing file), while the user saw a green install message.
   */
  const finalize = (outcome: InstallOutcome): InstallOutcome => {
    if (stashedConfig !== null && !preserved) {
      return {
        ...outcome,
        ok: false,
        message: `Failed to restore operator-tuned ai_router/router-config.yaml after install (${lastRestoreError ?? "unknown error"}). The install changes have been applied but your tuned config was not put back. Check the workspace's ai_router/router-config.yaml before continuing.`,
        routerConfigPreserved: false,
      };
    }
    return outcome;
  };

  // 2) Sparse-clone into a temp dir.
  const repo = deps.repoUrl ?? REPO_URL;
  opts.report(`Sparse-cloning ${repo}…`);
  const tmp = deps.fileOps.mkdtemp("dabbler-ai-router-install-");
  try {
    const cloneArgs = ["clone", "--depth", "1", "--filter=blob:none", "--sparse"];
    cloneArgs.push("--branch", refToUse);
    cloneArgs.push(repo, tmp);
    const cloneResult = await deps.spawner("git", cloneArgs, {
      cwd: deps.workspaceRoot,
      timeoutMs: 300_000,
    });
    if (cloneResult.exitCode !== 0) {
      restoreStash();
      return finalize({
        ok: false,
        message: `git clone failed: ${oneLine(cloneResult.stderr || cloneResult.stdout) || `exit ${cloneResult.exitCode}`}`,
        source: "github",
        venvPath: opts.venvPath,
        routerConfigPreserved: preserved,
        resolvedRef: refToUse,
      });
    }

    opts.report("Configuring sparse-checkout…");
    const sparseResult = await deps.spawner(
      "git",
      ["-C", tmp, "sparse-checkout", "set", "ai_router", "pyproject.toml"],
      { cwd: deps.workspaceRoot, timeoutMs: 60_000 },
    );
    if (sparseResult.exitCode !== 0) {
      restoreStash();
      return finalize({
        ok: false,
        message: `git sparse-checkout failed: ${oneLine(sparseResult.stderr || sparseResult.stdout) || `exit ${sparseResult.exitCode}`}`,
        source: "github",
        venvPath: opts.venvPath,
        routerConfigPreserved: preserved,
        resolvedRef: refToUse,
      });
    }

    // 3) Copy the sparse-checkout into the workspace at a stable
    //    location (.dabbler/ai-router-src/) AND the legacy
    //    ai_router/ position. The stable location is what the
    //    editable install points at — installing from a tmpdir that
    //    we then delete leaves a dangling .egg-link (Round 1 verifier
    //    catch). The workspace ai_router/ copy is the operator-facing
    //    location for fork-trackers who want to edit the source.
    const stableSrc = path.join(deps.workspaceRoot, GITHUB_CHECKOUT_REL);
    const dstAiRouter = path.join(deps.workspaceRoot, "ai_router");
    opts.report("Copying sparse-checkout into the workspace…");
    try {
      deps.fileOps.removeRecursive(stableSrc);
      deps.fileOps.copyDir(tmp, stableSrc);
      // Wipe the destination ai_router/ before copying so files that
      // existed in an older ref but are gone in the new one don't
      // linger as ghosts. Round-2 verifier catch: copyDir overwrites
      // colliding files but never deletes; an upgrade from v0.9.0 to
      // v1.0.0 that drops a module would leave the dropped module
      // behind without this. The stashed router-config.yaml is
      // restored below, so this temporary wipe is safe.
      deps.fileOps.removeRecursive(dstAiRouter);
      deps.fileOps.copyDir(path.join(stableSrc, "ai_router"), dstAiRouter);
    } catch (err) {
      // restoreStash() runs in the outer finally too, but we want it
      // to happen *before* we return so the outcome reflects the
      // current state of the file.
      restoreStash();
      return finalize({
        ok: false,
        message: `Failed to copy ai_router/ into the workspace: ${err instanceof Error ? err.message : String(err)}`,
        source: "github",
        venvPath: opts.venvPath,
        routerConfigPreserved: preserved,
        resolvedRef: refToUse,
      });
    }

    // 4) Restore the stashed router-config.yaml *before* the editable
    //    install — the install doesn't touch the config, but having
    //    the file in its final state before the install completes is
    //    cleaner if the operator inspects the workspace mid-flow.
    restoreStash();

    // 5) Editable install of the persistent checkout so verifier
    //    scripts (`import ai_router`) work and the source tree is
    //    something the operator can edit-and-reload.
    opts.report("Installing the sparse-checked-out tree (editable)…");
    const pipResult = await deps.spawner(
      venvPython(opts.venvPath),
      ["-m", "pip", "install", "-e", stableSrc],
      { cwd: deps.workspaceRoot, timeoutMs: 300_000 },
    );
    if (pipResult.exitCode !== 0) {
      return finalize({
        ok: false,
        message: `pip install -e <sparse-checkout> failed: ${oneLine(pipResult.stderr || pipResult.stdout) || `exit ${pipResult.exitCode}`}`,
        source: "github",
        venvPath: opts.venvPath,
        routerConfigPreserved: preserved,
        resolvedRef: refToUse,
      });
    }

    writeInstallMethodMarker(deps, "github");
    return finalize({
      ok: true,
      message: `Installed ai_router from GitHub (${refToUse})${preserved ? " — preserved existing router-config.yaml" : ""}.`,
      source: "github",
      venvPath: opts.venvPath,
      routerConfigPreserved: preserved,
      resolvedRef: refToUse,
    });
  } finally {
    // Belt-and-braces: if any path above fell out without restoring
    // the stash, do it now. (Idempotent — when `preserved` is already
    // true, this is a no-op; when an earlier attempt failed, this
    // gives it a second crack now that any in-flight error has
    // unwound.) The actual data-loss safeguard sits in `finalize()`,
    // which downgrades ok=true outcomes to ok=false if the config
    // ultimately stayed unrestored.
    restoreStash();
    // Clean up the sparse-checkout tmpdir whether the install
    // succeeded or failed — the editable install resolves to
    // `.dabbler/ai-router-src/` (under the workspace), not the tmp.
    try {
      deps.fileOps.removeRecursive(tmp);
    } catch {
      // intentional swallow — the operator already has the
      // success/failure outcome above and the tmpdir is non-load-
      // bearing.
    }
  }
}

// ---------- install-method marker ----------

function readInstallMethodMarker(deps: InstallDeps): InstallSource | null {
  const markerAbs = path.join(deps.workspaceRoot, INSTALL_METHOD_REL);
  if (!deps.fileOps.exists(markerAbs)) return null;
  const raw = deps.fileOps.readFile(markerAbs).trim();
  if (raw === "pypi" || raw === "github") return raw;
  return null;
}

function writeInstallMethodMarker(deps: InstallDeps, source: InstallSource): void {
  const markerAbs = path.join(deps.workspaceRoot, INSTALL_METHOD_REL);
  const markerDir = path.dirname(markerAbs);
  deps.fileOps.mkdirp(markerDir);
  // Single line + trailing newline so the file diffs cleanly if a future
  // version ever embeds extra metadata.
  deps.fileOps.writeFile(markerAbs, `${source}\n`);
}

// ---------- helpers ----------

function oneLine(s: string): string {
  // Trim and collapse to the last few non-empty lines so the operator-facing
  // message reads cleanly even when pip / git emits a stack trace.
  const trimmed = (s || "").trim();
  if (!trimmed) return "";
  const lastLines = trimmed.split(/\r?\n/).filter(Boolean).slice(-2).join(" / ");
  return lastLines;
}
