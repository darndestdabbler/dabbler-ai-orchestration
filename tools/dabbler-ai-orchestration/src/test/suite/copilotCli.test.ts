// Set 079 Session 1 — unit tests for the Copilot-CLI presence probe's
// pure core (src/utils/copilotCli.ts). The probe mirrors the A10 Python
// probe's shape: an explicit `dabblerSessionSets.copilotCliPath` setting
// DECIDES ALONE; otherwise the bare `copilot` command is looked up on
// PATH — probing exactly what the catalog module's `shell=False`
// subprocess could execute (`copilot.exe` on win32, `copilot` as-is on
// POSIX). Cases generated via routed test-generation (gemini-pro) and
// adapted.

import * as assert from "assert";
import * as path from "path";
import { probeCopilotCliPresenceCore } from "../../utils/copilotCli";
import { FileExists } from "../../utils/pythonInterpreter";

const POSIX_ROOT = "/ws/repo";
const WIN32_ROOT = "C:\\ws\\repo";

suite("copilotCli — probeCopilotCliPresenceCore (POSIX)", () => {
  const platform = "linux" as const;

  test("no setting: finds `copilot` on PATH", () => {
    const env = { PATH: "/usr/bin:/bin" };
    const fileExists: FileExists = (f) => f === "/usr/bin/copilot";
    assert.strictEqual(
      probeCopilotCliPresenceCore(undefined, POSIX_ROOT, env, fileExists, platform),
      true,
    );
  });

  test("no setting: false when nothing on PATH resolves", () => {
    const env = { PATH: "/usr/bin:/bin" };
    assert.strictEqual(
      probeCopilotCliPresenceCore(undefined, POSIX_ROOT, env, () => false, platform),
      false,
    );
  });

  test("no setting: false for empty PATH / empty env", () => {
    assert.strictEqual(
      probeCopilotCliPresenceCore(undefined, POSIX_ROOT, {}, () => true, platform),
      false,
    );
    assert.strictEqual(
      probeCopilotCliPresenceCore(
        undefined,
        POSIX_ROOT,
        { PATH: "" },
        () => true,
        platform,
      ),
      false,
    );
  });

  test("explicit absolute path decides alone: true for existing file", () => {
    const setting = "/opt/cli/copilot";
    const env = { PATH: "/usr/bin" };
    const fileExists: FileExists = (f) =>
      f === setting || f === "/usr/bin/copilot";
    assert.strictEqual(
      probeCopilotCliPresenceCore(setting, POSIX_ROOT, env, fileExists, platform),
      true,
    );
  });

  test("explicit absolute path decides alone: MISSING file is false even with a PATH copilot", () => {
    // A configured-but-missing CLI is an operator error to surface —
    // never silently bypassed for the PATH fallback.
    const setting = "/opt/cli/copilot-missing";
    const env = { PATH: "/usr/bin" };
    const fileExists: FileExists = (f) => f === "/usr/bin/copilot";
    assert.strictEqual(
      probeCopilotCliPresenceCore(setting, POSIX_ROOT, env, fileExists, platform),
      false,
    );
  });

  test("explicit workspace-relative path resolves against the root", () => {
    const setting = "tools/copilot";
    const resolved = path.posix.resolve(POSIX_ROOT, setting);
    const fileExists: FileExists = (f) => f === resolved;
    assert.strictEqual(
      probeCopilotCliPresenceCore(setting, POSIX_ROOT, {}, fileExists, platform),
      true,
    );
  });

  test("explicit bare command name is looked up on PATH", () => {
    const setting = "gh-copilot";
    const env = { PATH: "/opt/bin" };
    const fileExists: FileExists = (f) => f === "/opt/bin/gh-copilot";
    assert.strictEqual(
      probeCopilotCliPresenceCore(setting, POSIX_ROOT, env, fileExists, platform),
      true,
    );
  });
});

suite("copilotCli — probeCopilotCliPresenceCore (win32)", () => {
  const platform = "win32" as const;

  test("no setting: finds `copilot.exe` on PATH", () => {
    const env = { PATH: "C:\\Tools\\CopilotCLI" };
    const fileExists: FileExists = (f) =>
      f === "C:\\Tools\\CopilotCLI\\copilot.exe";
    assert.strictEqual(
      probeCopilotCliPresenceCore(undefined, WIN32_ROOT, env, fileExists, platform),
      true,
    );
  });

  test("no setting: an npm-shim-only machine (`copilot.cmd`) reads as MISSING", () => {
    // The catalog module spawns the CLI via subprocess with shell=False:
    // CreateProcess resolution of a BARE, extension-less token appends
    // `.exe` only, so a `.cmd`-only PATH raises FileNotFoundError
    // (verified empirically, 2026-07-04). The probe must agree with the
    // spawn, not with what a shell could run.
    const env = { PATH: "C:\\Users\\test\\npm" };
    const fileExists: FileExists = (f) =>
      f === "C:\\Users\\test\\npm\\copilot.cmd";
    assert.strictEqual(
      probeCopilotCliPresenceCore(undefined, WIN32_ROOT, env, fileExists, platform),
      false,
    );
  });

  test("explicit absolute path to a `.cmd` shim reads as PRESENT (deliberate)", () => {
    // Asymmetry with the bare-PATH case above, pinned on purpose: an
    // explicit path that spells out its extension IS executable by the
    // catalog's shell=False spawn — CreateProcess runs batch files via
    // an implicit cmd.exe when the extension is explicit (the BatBadBut
    // behavior; verified empirically against this repo's venv Python,
    // 2026-07-04). Rejecting it would false-negative machines where the
    // spawn genuinely works. (Code-review verifier round 1 proposed the
    // opposite rule; adjudicated with the empirical run.)
    const setting = "C:\\Users\\test\\npm\\copilot.cmd";
    const fileExists: FileExists = (f) => f === setting;
    assert.strictEqual(
      probeCopilotCliPresenceCore(setting, WIN32_ROOT, {}, fileExists, platform),
      true,
    );
  });

  test("explicit absolute path decides alone: true for an existing .exe", () => {
    const setting = "D:\\tools\\copilot.exe";
    const env = { PATH: "C:\\some\\other" };
    const fileExists: FileExists = (f) =>
      f === setting || f === "C:\\some\\other\\copilot.exe";
    assert.strictEqual(
      probeCopilotCliPresenceCore(setting, WIN32_ROOT, env, fileExists, platform),
      true,
    );
  });

  test("explicit absolute path decides alone: false for a missing file", () => {
    const setting = "D:\\tools\\copilot.exe";
    const env = { PATH: "C:\\Tools\\CopilotCLI" };
    const fileExists: FileExists = (f) =>
      f === "C:\\Tools\\CopilotCLI\\copilot.exe";
    assert.strictEqual(
      probeCopilotCliPresenceCore(setting, WIN32_ROOT, env, fileExists, platform),
      false,
    );
  });

  test("explicit relative path (with separator) resolves against the root", () => {
    const setting = "bin\\copilot.exe";
    const resolved = path.win32.resolve(WIN32_ROOT, setting);
    const fileExists: FileExists = (f) => f === resolved;
    assert.strictEqual(
      probeCopilotCliPresenceCore(setting, WIN32_ROOT, {}, fileExists, platform),
      true,
    );
  });

  test("explicit bare command name is looked up on PATH (probes .exe)", () => {
    const setting = "gh-copilot";
    const env = { PATH: "C:\\custom\\bin" };
    const fileExists: FileExists = (f) =>
      f === "C:\\custom\\bin\\gh-copilot.exe";
    assert.strictEqual(
      probeCopilotCliPresenceCore(setting, WIN32_ROOT, env, fileExists, platform),
      true,
    );
  });
});
