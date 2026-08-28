import * as assert from "assert";
import { describeScanFaults } from "../../providers/WorkExplorerTreeProvider";
import {
  findCommandOnPath,
  resolvePythonInterpreter,
  venvInterpreterCandidate,
} from "../../router/pythonInterpreter";

suite("WorkExplorerTreeProvider: scan diagnostics", () => {
  test("a clean scan clears the message", () => {
    assert.strictEqual(describeScanFaults({ projectionErrors: [] }), undefined);
  });

  test("failed projections collapse to one line naming the install remedy", () => {
    const message = describeScanFaults({
      projectionErrors: [
        { root: "D:/a", error: "No module named ai_router.progress" },
        { root: "D:/b", error: "No module named ai_router.progress" },
      ],
    })!;
    assert.ok(message.includes("2 repositories"));
    assert.ok(message.includes("Install ai-router"));
    assert.ok(message.includes("No module named ai_router.progress"));
  });
});

suite("pythonInterpreter", () => {
  test("venv candidate is platform-shaped", () => {
    const candidate = venvInterpreterCandidate("D:\\ws");
    if (process.platform === "win32") {
      assert.ok(candidate.endsWith("python.exe"));
      assert.ok(candidate.includes(".venv"));
    } else {
      assert.ok(candidate.endsWith("python"));
    }
  });

  test("resolution prefers the workspace venv when it exists, else bare python", () => {
    const withVenv = resolvePythonInterpreter("D:\\ws", () => true);
    assert.ok(withVenv.includes(".venv"));
    const without = resolvePythonInterpreter("D:\\ws", () => false);
    assert.strictEqual(without, "python");
  });

  test("findCommandOnPath skips the WindowsApps store alias", () => {
    const dir =
      process.platform === "win32"
        ? "C:\\Users\\x\\AppData\\Local\\Microsoft\\WindowsApps"
        : "/opt/WindowsApps";
    const found = findCommandOnPath(
      "python",
      { PATH: dir },
      () => true,
    );
    if (process.platform === "win32") {
      assert.ok(found == null, `store alias must not count as present: ${found}`);
    } else {
      assert.ok(found);
    }
  });
});
