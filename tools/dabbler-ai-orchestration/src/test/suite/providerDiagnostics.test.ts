import * as assert from "assert";
import { describeScanFaults } from "../../providers/WorkExplorerTreeProvider";
import {
  findCommandOnPath,
  resolvePythonInterpreter,
  venvInterpreterCandidate,
} from "../../utils/pythonInterpreter";

suite("WorkExplorerTreeProvider: scan diagnostics", () => {
  test("a clean scan clears the message", () => {
    assert.strictEqual(describeScanFaults([], { projectionErrors: [] }), undefined);
  });

  test("failed projections collapse to one line naming the install remedy", () => {
    const message = describeScanFaults([], {
      projectionErrors: [
        { setDir: "a", error: "No module named ai_router.progress" },
        { setDir: "b", error: "No module named ai_router.progress" },
      ],
    })!;
    assert.ok(message.includes("2 session sets"));
    assert.ok(message.includes("Install ai-router"));
    assert.ok(!message.includes("setDir"));
  });

  test("a manifest fault names the root and whether last-known-good is showing", () => {
    const message = describeScanFaults(
      [{ rootLabel: "myrepo", message: "docs/modules.yaml is invalid.", retainedLastKnownGood: true }],
      { projectionErrors: [] },
    )!;
    assert.ok(message.includes("myrepo"));
    assert.ok(message.includes("last-known-good"));
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
