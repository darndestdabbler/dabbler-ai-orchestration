import * as assert from "assert";
import * as path from "path";
import * as vscode from "vscode";
import {
  venvInterpreterCandidate,
  detectWorkspaceVenvInterpreter,
  resolveExplicitPythonPath,
  resolvePythonInterpreter,
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
