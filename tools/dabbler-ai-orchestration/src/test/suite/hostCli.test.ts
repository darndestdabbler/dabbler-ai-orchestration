// Set 102 Session 1 — unit tests for the host-CLI preflight
// (src/utils/hostCli.ts): the pure probe core (explicit setting decides
// alone; PATH otherwise), the win32 .exe/.cmd/.bat shapes (az ships as
// az.cmd — the shape the copilot probe deliberately does NOT find), and
// the host→CLI mapping.

import * as assert from "assert";
import { FileExists } from "../../utils/pythonInterpreter";
import {
  describeMissingHostCli,
  findHostCliOnPath,
  hostCliCommand,
  probeHostCliCore,
} from "../../utils/hostCli";

const WIN32_ROOT = "C:\\ws\\repo";
const POSIX_ROOT = "/ws/repo";

suite("hostCli — hostCliCommand", () => {
  test("github → gh with ghCliPath", () => {
    assert.deepStrictEqual(hostCliCommand("github"), {
      command: "gh",
      settingKey: "ghCliPath",
    });
  });
  test("azure-devops → az with azCliPath", () => {
    assert.deepStrictEqual(hostCliCommand("azure-devops"), {
      command: "az",
      settingKey: "azCliPath",
    });
  });
  test("unknown → null", () => {
    assert.strictEqual(hostCliCommand("unknown"), null);
  });
});

suite("hostCli — findHostCliOnPath (win32 shapes)", () => {
  const env = { Path: "C:\\tools;C:\\azure" };

  test("finds gh.exe", () => {
    const fileExists: FileExists = (f) => f === "C:\\tools\\gh.exe";
    assert.strictEqual(
      findHostCliOnPath("gh", env, fileExists, "win32"),
      "C:\\tools\\gh.exe",
    );
  });

  test("finds az.cmd when no .exe exists (the standard Azure CLI install)", () => {
    const fileExists: FileExists = (f) => f === "C:\\azure\\az.cmd";
    assert.strictEqual(
      findHostCliOnPath("az", env, fileExists, "win32"),
      "C:\\azure\\az.cmd",
    );
  });

  test(".exe wins over .cmd in the same dir", () => {
    const fileExists: FileExists = (f) =>
      f === "C:\\azure\\az.exe" || f === "C:\\azure\\az.cmd";
    assert.strictEqual(
      findHostCliOnPath("az", env, fileExists, "win32"),
      "C:\\azure\\az.exe",
    );
  });

  test("nothing on PATH → null", () => {
    assert.strictEqual(findHostCliOnPath("az", env, () => false, "win32"), null);
  });

  test("empty PATH → null", () => {
    assert.strictEqual(findHostCliOnPath("az", {}, () => true, "win32"), null);
  });
});

suite("hostCli — findHostCliOnPath (POSIX)", () => {
  test("bare name, no extension probing", () => {
    const env = { PATH: "/usr/bin:/usr/local/bin" };
    const fileExists: FileExists = (f) => f === "/usr/local/bin/az";
    assert.strictEqual(
      findHostCliOnPath("az", env, fileExists, "linux"),
      "/usr/local/bin/az",
    );
  });
});

suite("hostCli — probeHostCliCore", () => {
  test("no setting: PATH lookup resolves", () => {
    const env = { PATH: "/usr/bin" };
    const fileExists: FileExists = (f) => f === "/usr/bin/gh";
    assert.deepStrictEqual(
      probeHostCliCore("gh", undefined, POSIX_ROOT, env, fileExists, "linux"),
      { present: true, resolved: "/usr/bin/gh" },
    );
  });

  test("explicit absolute setting decides alone: present", () => {
    const fileExists: FileExists = (f) => f === "C:\\odd\\place\\az.cmd";
    assert.deepStrictEqual(
      probeHostCliCore(
        "az",
        "C:\\odd\\place\\az.cmd",
        WIN32_ROOT,
        { Path: "C:\\azure" },
        fileExists,
        "win32",
      ),
      { present: true, resolved: "C:\\odd\\place\\az.cmd" },
    );
  });

  test("explicit setting decides alone: a missing configured CLI is NOT bypassed to PATH", () => {
    // PATH would resolve az.cmd, but the operator's explicit setting is
    // broken — surface the operator error, never silently use PATH.
    const fileExists: FileExists = (f) => f === "C:\\azure\\az.cmd";
    assert.deepStrictEqual(
      probeHostCliCore(
        "az",
        "C:\\gone\\az.cmd",
        WIN32_ROOT,
        { Path: "C:\\azure" },
        fileExists,
        "win32",
      ),
      { present: false, resolved: null },
    );
  });

  test("workspace-relative setting resolves against the workspace root", () => {
    const fileExists: FileExists = (f) => f === "/ws/repo/tools/gh";
    assert.deepStrictEqual(
      probeHostCliCore("gh", "tools/gh", POSIX_ROOT, {}, fileExists, "linux"),
      { present: true, resolved: "/ws/repo/tools/gh" },
    );
  });

  test("bare-command setting goes through the PATH shapes", () => {
    const env = { Path: "C:\\custom" };
    const fileExists: FileExists = (f) => f === "C:\\custom\\mygh.exe";
    assert.deepStrictEqual(
      probeHostCliCore("gh", "mygh", WIN32_ROOT, env, fileExists, "win32"),
      { present: true, resolved: "C:\\custom\\mygh.exe" },
    );
  });
});

suite("hostCli — guidance text", () => {
  test("github guidance names winget, gh auth login, the GHE hostname variant, and the setting", () => {
    const t = describeMissingHostCli("github");
    for (const needle of [
      "winget install GitHub.cli",
      "gh auth login",
      "--hostname",
      "dabblerSessionSets.ghCliPath",
    ]) {
      assert.ok(t.includes(needle), `missing: ${needle}`);
    }
  });

  test("azure-devops guidance names winget, the devops extension, az login, the PAT env var, and the setting", () => {
    const t = describeMissingHostCli("azure-devops");
    for (const needle of [
      "winget install Microsoft.AzureCLI",
      "az extension add --name azure-devops",
      "az login",
      "AZURE_DEVOPS_EXT_PAT",
      "dabblerSessionSets.azCliPath",
    ]) {
      assert.ok(t.includes(needle), `missing: ${needle}`);
    }
  });

  test("unknown-host guidance points at the gitHost setting", () => {
    assert.ok(describeMissingHostCli("unknown").includes("dabblerSessionSets.gitHost"));
  });
});
