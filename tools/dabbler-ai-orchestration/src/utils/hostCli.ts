// Set 102 Session 1: the host-CLI preflight — "will a `gh` (GitHub) or
// `az` (Azure DevOps) invocation plausibly resolve on this machine?".
//
// Sibling of `copilotCli.ts` and deliberately the same shape: an explicit
// settings override DECIDES ALONE (a configured-but-missing CLI is an
// operator error to surface, never silently bypassed); otherwise the bare
// command is looked up on PATH. Filesystem probe, not an execution probe —
// it cannot prove the CLI is authenticated, only that something plausibly
// runnable is installed. Auth-level failures surface through the command's
// spawn error paths with the same guidance text.
//
// win32 PATH nuance (differs from the copilot probe): `gh` ships as
// `gh.exe` (winget/MSI), but the Azure CLI's entrypoint is `az.cmd` —
// there is no az.exe on a standard install. Node's spawn refuses .cmd
// without a shell (the BatBadBut hardening), so the PROBE must find
// .cmd/.bat shapes too and the SPAWN layer (gitWorkflow.ts) runs
// .cmd targets through `cmd.exe /d /s /c` with conservatively validated
// args. The probe returns the resolved path so probe and spawn cannot
// disagree about which file runs.
//
// Never a hard failure: callers that get `present: false` degrade to the
// no-CLI floor (push + open the host's create-PR web page) plus the
// install guidance below — the operator is never stranded.

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { FileExists } from "./pythonInterpreter";
import { GitHostKind } from "./gitHost";

const realExists: FileExists = (p) => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};

/** Which CLI a host needs, with its settings override key. */
export function hostCliCommand(kind: GitHostKind): {
  command: string;
  settingKey: "ghCliPath" | "azCliPath";
} | null {
  if (kind === "github") return { command: "gh", settingKey: "ghCliPath" };
  if (kind === "azure-devops") return { command: "az", settingKey: "azCliPath" };
  return null;
}

export interface HostCliProbeResult {
  present: boolean;
  /**
   * Absolute path (or explicit bare command) the spawn layer should run.
   * Null when absent. May end in .cmd/.bat on win32 — the spawn layer
   * must route those through cmd.exe (see module comment).
   */
  resolved: string | null;
}

/**
 * PATH lookup that, on win32, probes the shapes Windows can actually
 * launch for a CLI: `<cmd>.exe`, `<cmd>.cmd`, `<cmd>.bat` (in PATHEXT
 * spirit but fixed — these are the only shapes gh/az ship as). POSIX
 * probes the bare name.
 */
export function findHostCliOnPath(
  cmd: string,
  env: Record<string, string | undefined> = process.env,
  fileExists: FileExists = realExists,
  platform: NodeJS.Platform = process.platform,
): string | null {
  const rawPath = env.PATH ?? env.Path ?? "";
  if (!rawPath) return null;
  const isWin = platform === "win32";
  const p = isWin ? path.win32 : path.posix;
  const dirs = rawPath.split(isWin ? ";" : ":").filter((d) => d.trim() !== "");
  const names = isWin ? [`${cmd}.exe`, `${cmd}.cmd`, `${cmd}.bat`] : [cmd];
  for (const dir of dirs) {
    for (const name of names) {
      const candidate = p.join(dir.trim(), name);
      if (fileExists(candidate)) return candidate;
    }
  }
  return null;
}

/**
 * Pure core of the host-CLI probe (env + fs + platform injected so the
 * Layer-2 suite pins the semantics without touching the real PATH).
 * Explicit setting decides alone; PATH otherwise.
 */
export function probeHostCliCore(
  command: string,
  explicitSetting: string | undefined,
  workspaceRoot: string,
  env: Record<string, string | undefined> = process.env,
  fileExists: FileExists = realExists,
  platform: NodeJS.Platform = process.platform,
): HostCliProbeResult {
  const p = platform === "win32" ? path.win32 : path.posix;
  if (explicitSetting) {
    if (p.isAbsolute(explicitSetting)) {
      return fileExists(explicitSetting)
        ? { present: true, resolved: explicitSetting }
        : { present: false, resolved: null };
    }
    if (explicitSetting.includes("\\") || explicitSetting.includes("/")) {
      const abs = p.resolve(workspaceRoot, explicitSetting);
      return fileExists(abs)
        ? { present: true, resolved: abs }
        : { present: false, resolved: null };
    }
    const found = findHostCliOnPath(explicitSetting, env, fileExists, platform);
    return found
      ? { present: true, resolved: found }
      : { present: false, resolved: null };
  }
  const found = findHostCliOnPath(command, env, fileExists, platform);
  return found
    ? { present: true, resolved: found }
    : { present: false, resolved: null };
}

/**
 * Read the operator's explicit CLI-path setting (workspace-folder >
 * workspace > global; `inspect()` so the contributed default "" never
 * reads as an operator choice).
 */
function explicitCliPathSetting(key: "ghCliPath" | "azCliPath"): string | undefined {
  const inspected = vscode.workspace
    .getConfiguration("dabblerSessionSets")
    .inspect<string>(key);
  if (!inspected) return undefined;
  const value =
    inspected.workspaceFolderValue ??
    inspected.workspaceValue ??
    inspected.globalValue;
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? undefined : trimmed;
}

/** Host-facing probe for the CLI a host kind needs. */
export function probeHostCli(
  kind: GitHostKind,
  workspaceRoot: string,
  fileExists: FileExists = realExists,
): HostCliProbeResult {
  const cli = hostCliCommand(kind);
  if (!cli) return { present: false, resolved: null };
  return probeHostCliCore(
    cli.command,
    explicitCliPathSetting(cli.settingKey),
    workspaceRoot,
    process.env,
    fileExists,
    process.platform,
  );
}

// ---------- guidance text (the docs' per-host setup section mirrors ----------
// ---------- this verbatim — keep the two in sync when editing) ----------

/** Friendly install/auth guidance when a host's CLI is missing. */
export function describeMissingHostCli(kind: GitHostKind): string {
  if (kind === "github") {
    return (
      "The GitHub CLI (gh) was not found. To enable one-click PRs: " +
      "install it (winget install GitHub.cli), then sign in with " +
      "`gh auth login` (for GitHub Enterprise: `gh auth login --hostname " +
      "<your-ghe-host>`). If gh is installed somewhere unusual, point the " +
      "dabblerSessionSets.ghCliPath setting at it. Until then you can " +
      "push and open the PR from the browser page this command offers."
    );
  }
  if (kind === "azure-devops") {
    return (
      "The Azure CLI (az) was not found. To enable one-click PRs: " +
      "install it (winget install Microsoft.AzureCLI), add the DevOps " +
      "extension (az extension add --name azure-devops), then sign in " +
      "with `az login` (or set the AZURE_DEVOPS_EXT_PAT environment " +
      "variable to a Personal Access Token with Code Read & Write). If " +
      "az is installed somewhere unusual, point the " +
      "dabblerSessionSets.azCliPath setting at it. Until then you can " +
      "push and open the PR from the browser page this command offers."
    );
  }
  return (
    "This repo's origin remote was not recognized as GitHub or Azure " +
    "DevOps. If it is a GitHub Enterprise (or other) host, set the " +
    "dabblerSessionSets.gitHost setting to \"github\" or \"azure-devops\" " +
    "so the git-workflow commands know which CLI to use."
  );
}

/** One-line auth hint appended when a CLI call fails looking auth-shaped. */
export function describeHostCliAuthHint(kind: GitHostKind): string {
  if (kind === "github") {
    return "If this is an authentication problem, run `gh auth login` (add --hostname <host> for GitHub Enterprise) and retry.";
  }
  if (kind === "azure-devops") {
    return "If this is an authentication problem, run `az login` (or set AZURE_DEVOPS_EXT_PAT) and `az extension add --name azure-devops`, then retry.";
  }
  return "";
}
