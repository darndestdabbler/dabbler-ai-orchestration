import * as assert from "assert";
import * as path from "path";
import * as vscode from "vscode";
import {
  venvInterpreterCandidate,
  detectWorkspaceVenvInterpreter,
  resolveExplicitPythonPath,
  resolvePythonInterpreter,
  findCommandOnPath,
  probePythonPresenceCore,
  resolveBootstrapPythonCore,
  interpreterResolves,
  describeMissingPython,
} from "../../utils/pythonInterpreter";

// The vscode stub's getConfiguration() has no inspect(); these helpers
// override it per-test with a controllable inspect, then restore.
type Inspected = {
  workspaceFolderValue?: string;
  workspaceValue?: string;
  globalValue?: string;
} | undefined;

let savedGetConfiguration: typeof vscode.workspace.getConfiguration;

function setPythonPathSetting(value: Inspected): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (vscode.workspace as any).getConfiguration = () => ({
    inspect: (key: string) => (key === "pythonPath" ? value : undefined),
    get: (_k: string, dflt: unknown) => dflt,
  });
}

const ROOT =
  process.platform === "win32" ? "C:\\ws\\repo" : "/ws/repo";

suite("pythonInterpreter — venvInterpreterCandidate", () => {
  test("points at the platform venv interpreter under <root>/.venv", () => {
    const got = venvInterpreterCandidate(ROOT);
    const expected =
      process.platform === "win32"
        ? path.join(ROOT, ".venv", "Scripts", "python.exe")
        : path.join(ROOT, ".venv", "bin", "python");
    assert.strictEqual(got, expected);
  });
});

suite("pythonInterpreter — detectWorkspaceVenvInterpreter", () => {
  const interp = venvInterpreterCandidate(ROOT);
  const cfg = path.join(ROOT, ".venv", "pyvenv.cfg");

  test("returns the interpreter when both pyvenv.cfg and the binary exist", () => {
    const exists = (p: string) => p === cfg || p === interp;
    assert.strictEqual(detectWorkspaceVenvInterpreter(ROOT, exists), interp);
  });

  test("returns null when pyvenv.cfg is missing (bare .venv folder)", () => {
    const exists = (p: string) => p === interp; // binary but no marker
    assert.strictEqual(detectWorkspaceVenvInterpreter(ROOT, exists), null);
  });

  test("returns null when the interpreter binary is missing", () => {
    const exists = (p: string) => p === cfg; // marker but no binary
    assert.strictEqual(detectWorkspaceVenvInterpreter(ROOT, exists), null);
  });

  test("returns null for an empty workspace root", () => {
    assert.strictEqual(detectWorkspaceVenvInterpreter("", () => true), null);
  });
});

suite("pythonInterpreter — resolvePythonInterpreter", () => {
  setup(() => {
    savedGetConfiguration = vscode.workspace.getConfiguration;
  });
  teardown(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (vscode.workspace as any).getConfiguration = savedGetConfiguration;
  });

  test("an explicit absolute pythonPath is returned as-is (no venv detect)", () => {
    const abs =
      process.platform === "win32" ? "D:\\py\\python.exe" : "/opt/py/python";
    setPythonPathSetting({ globalValue: abs });
    assert.strictEqual(
      resolvePythonInterpreter(ROOT, () => true),
      abs,
    );
  });

  test("an explicit relative pythonPath resolves against the workspace root", () => {
    setPythonPathSetting({ workspaceValue: path.join("envs", "py") });
    assert.strictEqual(
      resolvePythonInterpreter(ROOT, () => false),
      path.resolve(ROOT, "envs", "py"),
    );
  });

  test("an explicit bare command stays on PATH", () => {
    setPythonPathSetting({ globalValue: "python3" });
    assert.strictEqual(resolvePythonInterpreter(ROOT, () => false), "python3");
  });

  test("unset + a valid workspace venv auto-detects the venv interpreter", () => {
    setPythonPathSetting(undefined);
    const interp = venvInterpreterCandidate(ROOT);
    const cfg = path.join(ROOT, ".venv", "pyvenv.cfg");
    const exists = (p: string) => p === cfg || p === interp;
    assert.strictEqual(resolvePythonInterpreter(ROOT, exists), interp);
  });

  test("unset + no venv falls back to bare python", () => {
    setPythonPathSetting(undefined);
    assert.strictEqual(resolvePythonInterpreter(ROOT, () => false), "python");
  });

  test("an empty-string setting is treated as unset", () => {
    setPythonPathSetting({ globalValue: "   " });
    assert.strictEqual(resolvePythonInterpreter(ROOT, () => false), "python");
  });
});

suite("pythonInterpreter — resolveExplicitPythonPath (installer bootstrap)", () => {
  setup(() => {
    savedGetConfiguration = vscode.workspace.getConfiguration;
  });
  teardown(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (vscode.workspace as any).getConfiguration = savedGetConfiguration;
  });

  test("returns the explicit setting when present", () => {
    setPythonPathSetting({ workspaceFolderValue: "python3.11" });
    assert.strictEqual(resolveExplicitPythonPath(ROOT), "python3.11");
  });

  test("falls back to bare python and never auto-detects a venv", () => {
    // Even with a fully-present venv on disk, the installer bootstrap must
    // NOT resolve to it (that would defeat a fresh install).
    setPythonPathSetting(undefined);
    assert.strictEqual(resolveExplicitPythonPath(ROOT), "python");
  });
});

// ---------------------------------------------------------------------
// Set 077 Session 3 (A10) — the Python-presence probe family. All path
// semantics follow the `platform` PARAMETER (win32 fixtures use "\\" +
// ";", POSIX fixtures "/" + ":"), so every case is pinned identically on
// every CI OS. Cases generated via routed test-generation (gemini-pro)
// and adapted.
// ---------------------------------------------------------------------

suite("pythonInterpreter — findCommandOnPath (Set 077 S3)", () => {
  const files = new Set([
    "/usr/bin/python3",
    "/usr/local/bin/python",
    "C:\\Python39\\python.exe",
    "C:\\Users\\test\\AppData\\Local\\Microsoft\\WindowsApps\\python.exe",
    "C:\\bin\\custom.exe",
  ]);
  const fileExists = (p: string) => files.has(p);

  test("finds a command on a POSIX PATH", () => {
    const got = findCommandOnPath(
      "python",
      { PATH: "/usr/bin:/usr/local/bin" },
      fileExists,
      "linux",
    );
    assert.strictEqual(got, "/usr/local/bin/python");
  });

  test("appends .exe for a bare command on a win32 PATH", () => {
    const got = findCommandOnPath(
      "python",
      { PATH: "C:\\Windows;C:\\Python39" },
      fileExists,
      "win32",
    );
    assert.strictEqual(got, "C:\\Python39\\python.exe");
  });

  test("probes a command that already has an extension verbatim (win32)", () => {
    const got = findCommandOnPath(
      "custom.exe",
      { PATH: "C:\\bin" },
      fileExists,
      "win32",
    );
    assert.strictEqual(got, "C:\\bin\\custom.exe");
  });

  test("skips the Microsoft Store WindowsApps alias entry (win32)", () => {
    const got = findCommandOnPath(
      "python",
      {
        PATH:
          "C:\\Users\\test\\AppData\\Local\\Microsoft\\WindowsApps;C:\\Python39",
      },
      fileExists,
      "win32",
    );
    assert.strictEqual(got, "C:\\Python39\\python.exe");
  });

  test("WindowsApps alias alone yields null (the Store stub is not Python)", () => {
    const got = findCommandOnPath(
      "python",
      { PATH: "C:\\Users\\test\\AppData\\Local\\Microsoft\\WindowsApps" },
      fileExists,
      "win32",
    );
    assert.strictEqual(got, null);
  });

  test("returns null when the command is not on PATH", () => {
    assert.strictEqual(
      findCommandOnPath("nonexistent", { PATH: "/usr/bin" }, fileExists, "linux"),
      null,
    );
  });

  test("returns null for an empty or missing PATH", () => {
    assert.strictEqual(
      findCommandOnPath("python", { PATH: "" }, fileExists, "linux"),
      null,
    );
    assert.strictEqual(findCommandOnPath("python", {}, fileExists, "linux"), null);
  });
});

suite("pythonInterpreter — probePythonPresenceCore (Set 077 S3)", () => {
  // Root + venv fixtures use the RUNNING platform's shapes because the
  // venv rung (detectWorkspaceVenvInterpreter) is process-platform-
  // locked; both interpreter layouts are present so the rung resolves
  // everywhere.
  const root = process.platform === "win32" ? "C:\\proj" : "/proj";
  const venvFiles = new Set([
    path.join(root, ".venv", "pyvenv.cfg"),
    path.join(root, ".venv", "bin", "python"),
    path.join(root, ".venv", "Scripts", "python.exe"),
  ]);

  test("explicit absolute path: the exists check decides", () => {
    const files = new Set(["/abs/python"]);
    assert.strictEqual(
      probePythonPresenceCore("/abs/python", root, {}, (p) => files.has(p), "linux"),
      true,
    );
    assert.strictEqual(
      probePythonPresenceCore("/abs/missing", root, {}, (p) => files.has(p), "linux"),
      false,
    );
  });

  test("explicit bare command: the PATH scan decides", () => {
    const files = new Set(["C:\\Python39\\py3.exe"]);
    assert.strictEqual(
      probePythonPresenceCore(
        "py3",
        root,
        { PATH: "C:\\Python39" },
        (p) => files.has(p),
        "win32",
      ),
      true,
    );
    assert.strictEqual(
      probePythonPresenceCore(
        "py3",
        root,
        { PATH: "C:\\Other" },
        (p) => files.has(p),
        "win32",
      ),
      false,
    );
  });

  test("no explicit setting + valid workspace venv → present", () => {
    assert.strictEqual(
      probePythonPresenceCore(undefined, root, {}, (p) => venvFiles.has(p)),
      true,
    );
  });

  test("no explicit setting, no venv: PATH scan for python3/python (POSIX)", () => {
    assert.strictEqual(
      probePythonPresenceCore(
        undefined,
        root,
        { PATH: "/usr/bin" },
        (p) => p === "/usr/bin/python3",
        "linux",
      ),
      true,
    );
  });

  test("no explicit setting, no venv: PATH scan for python.exe (win32)", () => {
    assert.strictEqual(
      probePythonPresenceCore(
        undefined,
        root,
        { PATH: "C:\\Python39" },
        (p) => p === "C:\\Python39\\python.exe",
        "win32",
      ),
      true,
    );
  });

  test("nothing anywhere → false", () => {
    assert.strictEqual(
      probePythonPresenceCore(undefined, root, { PATH: "/usr/bin" }, () => false, "linux"),
      false,
    );
  });
});

suite("pythonInterpreter — interpreterResolves (Set 077 S3)", () => {
  const files = new Set(["/usr/bin/python3", "C:\\Python39\\python.exe"]);
  const fileExists = (p: string) => files.has(p);

  test("an existing absolute path resolves", () => {
    assert.strictEqual(
      interpreterResolves("/usr/bin/python3", {}, fileExists, "linux"),
      true,
    );
  });

  test("a missing absolute path does not resolve", () => {
    assert.strictEqual(
      interpreterResolves("/no/such/python", {}, fileExists, "linux"),
      false,
    );
  });

  test("a bare command resolves iff it is on PATH", () => {
    assert.strictEqual(
      interpreterResolves("python", { PATH: "C:\\Python39" }, fileExists, "win32"),
      true,
    );
    assert.strictEqual(
      interpreterResolves("python", { PATH: "C:\\Windows" }, fileExists, "win32"),
      false,
    );
  });

  test("an empty path never resolves", () => {
    assert.strictEqual(interpreterResolves("", {}, fileExists, "linux"), false);
  });
});

suite("pythonInterpreter — describeMissingPython (Set 077 S3)", () => {
  test("names the action and carries every remedy", () => {
    const msg = describeMissingPython("Build project structure");
    assert.ok(msg.includes("Build project structure"));
    assert.ok(msg.includes("python.org"));
    assert.ok(msg.includes("PATH"));
    assert.ok(msg.includes("Microsoft Store"));
    assert.ok(msg.includes("dabblerSessionSets.pythonPath"));
    assert.ok(msg.includes("reload"));
    assert.ok(msg.includes("NOT"), "must break the missing-keys mis-diagnosis");
  });
});

suite("pythonInterpreter — directory is not an interpreter (S3 review, verifier Major)", () => {
  // A `dabblerSessionSets.pythonPath` pointing at an existing DIRECTORY
  // (`C:/Python311` instead of `.../python.exe`) must FAIL the probe —
  // the default exists-check requires a regular file, so the pre-flight
  // blocks before any durable write instead of git-initing and dying at
  // the spawn. Pinned against the REAL default predicate (no injected
  // fileExists) using a real temp directory.
  test("an existing directory-valued explicit path fails the probe and interpreterResolves", () => {
    const os = require("os") as typeof import("os");
    const fsr = require("fs") as typeof import("fs");
    const dir = fsr.mkdtempSync(path.join(os.tmpdir(), "dabbler-pydir-"));
    try {
      assert.strictEqual(
        probePythonPresenceCore(dir, dir, { PATH: "" }),
        false,
        "a directory must not satisfy the probe",
      );
      assert.strictEqual(
        interpreterResolves(dir, { PATH: "" }),
        false,
        "a directory must not resolve as an interpreter",
      );
      // And a real FILE at the same spot still passes.
      const fake = path.join(dir, "python.exe");
      fsr.writeFileSync(fake, "", "utf8");
      assert.strictEqual(probePythonPresenceCore(fake, dir, { PATH: "" }), true);
      assert.strictEqual(interpreterResolves(fake, { PATH: "" }), true);
    } finally {
      fsr.rmSync(dir, { recursive: true, force: true });
    }
  });
});

suite("pythonInterpreter — resolveBootstrapPythonCore (S3 verification R1, Major 1)", () => {
  test("python3-only POSIX host: probe passes AND the bootstrap resolves python3", () => {
    // The Major-1 scenario: PATH has python3 but no bare python. The
    // pre-flight and the spawn must agree — the probe reports present
    // and the bootstrap resolution names the interpreter that is
    // actually there, never the legacy bare "python".
    const fileExists = (p: string) => p === "/usr/bin/python3";
    const env = { PATH: "/usr/bin" };
    assert.strictEqual(
      resolveBootstrapPythonCore(undefined, "/proj", env, fileExists, "linux"),
      "python3",
    );
    assert.strictEqual(
      probePythonPresenceCore(undefined, "/proj", env, fileExists, "linux"),
      true,
    );
  });

  test("python-only POSIX host resolves bare python", () => {
    const fileExists = (p: string) => p === "/usr/bin/python";
    assert.strictEqual(
      resolveBootstrapPythonCore(undefined, "/proj", { PATH: "/usr/bin" }, fileExists, "linux"),
      "python",
    );
  });

  test("win32 never resolves python3 (the spawn paths never use it)", () => {
    const fileExists = (p: string) => p.endsWith("python3.exe");
    assert.strictEqual(
      resolveBootstrapPythonCore(undefined, "C:/proj", { PATH: "C:/py" }, fileExists, "win32"),
      null,
    );
  });

  test("an explicit setting decides alone: valid resolves, missing yields null", () => {
    const fileExists = (p: string) => p === "/opt/py/python";
    assert.strictEqual(
      resolveBootstrapPythonCore("/opt/py/python", "/proj", {}, fileExists, "linux"),
      "/opt/py/python",
    );
    assert.strictEqual(
      resolveBootstrapPythonCore("/opt/py/missing", "/proj", { PATH: "/usr/bin" }, () => false, "linux"),
      null,
    );
  });

  test("nothing on PATH, no setting → null (the pre-flight refuses)", () => {
    assert.strictEqual(
      resolveBootstrapPythonCore(undefined, "/proj", { PATH: "/usr/bin" }, () => false, "linux"),
      null,
    );
  });
});
