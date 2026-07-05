// Set 079 Session 1 (Feature 1): the GitHub Copilot CLI presence probe.
//
// The Getting Started form's Full-tier seat-profile sub-choice (Set 078's
// `transport.profile: copilot-cli`) needs a step-1 pre-flight signal:
// "will a `copilot` invocation plausibly resolve on this machine?". This
// module is the sibling of `pythonInterpreter.ts`'s A10 Python probe and
// deliberately mirrors its shape — explicit setting → PATH, in that
// order, filesystem-only — so the probe and the eventual spawn cannot
// disagree.
//
// What the spawn actually is: the Session 2 wiring runs
// `python -m ai_router.copilot_catalog --refresh` from the scaffolded
// venv, and `copilot_catalog.py` invokes the CLI via
// `subprocess.run([binary, ...])` / `subprocess.Popen` with
// `shell=False` (`--binary` defaults to `"copilot"`; an explicit
// operator setting can ride through it). On Windows that means
// CreateProcess resolution, which is asymmetric — verified empirically
// on 2026-07-04 against this repo's venv Python:
//
//   - a BARE, extension-less token ("copilot") searches PATH appending
//     `.exe` ONLY — an npm `copilot.cmd`-only machine raises
//     FileNotFoundError. `findCommandOnPath` probes exactly
//     `<dir>/copilot.exe` on win32, so the PATH branch agrees.
//   - an EXPLICIT path that carries its extension (e.g.
//     `...\copilot.cmd`) executes fine — CreateProcess runs batch files
//     via an implicit cmd.exe when the extension is explicit (the
//     documented behavior behind the BatBadBut advisory). The explicit-
//     setting branch therefore probes plain file existence, no
//     extension filter, and still agrees with the spawn.
//
// Coupled limitation, deliberate (the probePythonPresenceCore posture):
// an npm-shim-only machine with NO explicit setting reads as MISSING
// even though a shell could run the shim, because the catalog's bare
// spawn could not. Those operators get the warning, whose remedies
// (install a native build, or point `dabblerSessionSets.copilotCliPath`
// at the shim/executable explicitly) both fix the spawn path too. Like
// the Python probe this is a filesystem probe, not an execution probe —
// it cannot prove the CLI runs or is authenticated, only that something
// plausibly runnable is installed. Execution-level failures surface
// through the Session 2/3 refresh error paths.

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { FileExists, findCommandOnPath } from "./pythonInterpreter";

/** The bare CLI command the catalog refresh spawns. */
export const COPILOT_CLI_COMMAND = "copilot";

// Same "regular FILE, not directory" bar as the Python probe: a
// directory-valued setting must not read as present.
const realExists: FileExists = (p) => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};

/**
 * Read the operator's explicitly-set `dabblerSessionSets.copilotCliPath`
 * (workspace-folder > workspace > global). Returns `undefined` when only
 * the contributed default is in effect — same `inspect()` rationale as
 * the pythonPath reader: `get()` cannot distinguish "operator set it"
 * from "the default fired".
 */
function explicitCopilotCliPathSetting(): string | undefined {
  const inspected = vscode.workspace
    .getConfiguration("dabblerSessionSets")
    .inspect<string>("copilotCliPath");
  if (!inspected) return undefined;
  const value =
    inspected.workspaceFolderValue ??
    inspected.workspaceValue ??
    inspected.globalValue;
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * Pure core of the Copilot CLI presence probe. True when one of:
 *   1. an explicit `copilotCliPath` setting resolves — an absolute path
 *      to an existing file, a workspace-relative path (contains a
 *      separator) resolving to an existing file, or a bare command found
 *      on PATH. An explicit setting DECIDES ALONE: a configured-but-
 *      missing CLI is an operator error to surface, never silently
 *      bypassed (the `resolveBootstrapPythonCore` posture). No extension
 *      filter here: an explicit path with its extension spelled out
 *      (even a `.cmd` shim) is executable by the catalog's `shell=False`
 *      spawn — CreateProcess runs batch files via an implicit cmd.exe
 *      when the extension is explicit;
 *   2. no explicit setting, and the bare `copilot` command is on PATH
 *      (`copilot.exe` on win32 — extension-less CreateProcess resolution
 *      appends `.exe` only, so that is the one shape the catalog's bare
 *      spawn could execute; `copilot` as-is on POSIX).
 *
 * Pure (env + fs + platform injected) so the Layer-2 suite pins the
 * semantics without touching the real PATH.
 */
export function probeCopilotCliPresenceCore(
  explicitSetting: string | undefined,
  workspaceRoot: string,
  env: Record<string, string | undefined> = process.env,
  fileExists: FileExists,
  platform: NodeJS.Platform = process.platform,
): boolean {
  const p = platform === "win32" ? path.win32 : path.posix;
  if (explicitSetting) {
    if (p.isAbsolute(explicitSetting)) return fileExists(explicitSetting);
    if (explicitSetting.includes("\\") || explicitSetting.includes("/")) {
      return fileExists(p.resolve(workspaceRoot, explicitSetting));
    }
    return (
      findCommandOnPath(explicitSetting, env, fileExists, platform) !== null
    );
  }
  return (
    findCommandOnPath(COPILOT_CLI_COMMAND, env, fileExists, platform) !== null
  );
}

/**
 * Host-facing probe: reads the operator's explicit
 * `dabblerSessionSets.copilotCliPath` (if any) and runs the pure core
 * against the real environment. Feeds the Getting Started form's
 * `copilotCliPresent` payload flag (the step-1 Copilot-missing warning).
 */
export function probeCopilotCliPresence(
  workspaceRoot: string,
  fileExists: FileExists = realExists,
): boolean {
  return probeCopilotCliPresenceCore(
    explicitCopilotCliPathSetting(),
    workspaceRoot,
    process.env,
    fileExists,
    process.platform,
  );
}

/**
 * Pure core of the `--binary` rider resolution (Set 079 S2): what an
 * explicit `copilotCliPath` setting should hand the catalog refresh so
 * the probe above and the refresh spawn resolve the SAME executable.
 * Path-shaped settings (absolute, or workspace-relative with a
 * separator) resolve to an ABSOLUTE path — the refresh spawns with
 * `cwd: projectDir`, so passing the pre-resolved absolute form keeps
 * the two surfaces agreeing byte-for-byte instead of relying on the
 * child's own cwd resolution. A bare command token passes through
 * as-is (the CLI's `subprocess` PATH resolution handles it, with the
 * documented `.exe`-only asymmetry the probe already encodes).
 * `undefined` when no explicit setting is in effect — the CLI's own
 * default (`copilot`) applies and no `--binary` flag is sent.
 */
export function resolveCopilotCliBinaryCore(
  explicitSetting: string | undefined,
  workspaceRoot: string,
  platform: NodeJS.Platform = process.platform,
): string | undefined {
  if (!explicitSetting) return undefined;
  const p = platform === "win32" ? path.win32 : path.posix;
  if (p.isAbsolute(explicitSetting)) return explicitSetting;
  if (explicitSetting.includes("\\") || explicitSetting.includes("/")) {
    return p.resolve(workspaceRoot, explicitSetting);
  }
  return explicitSetting;
}

/**
 * Host-facing `--binary` resolver: the operator's explicit
 * `dabblerSessionSets.copilotCliPath` (workspace-folder > workspace >
 * global), resolved through the pure core above.
 */
export function resolveCopilotCliBinary(
  workspaceRoot: string,
): string | undefined {
  return resolveCopilotCliBinaryCore(
    explicitCopilotCliPathSetting(),
    workspaceRoot,
    process.platform,
  );
}
