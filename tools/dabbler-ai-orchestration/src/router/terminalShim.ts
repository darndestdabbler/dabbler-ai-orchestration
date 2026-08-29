// `dabbler` on the integrated terminal's PATH, with nothing installed.
//
// The router is a Node program, and VS Code already has a Node: the
// extension host is Electron, and `ELECTRON_RUN_AS_NODE=1` makes
// `process.execPath` behave as one. So a project needs no Python, no venv,
// no global npm install and no toolchain of any kind for an orchestrator to
// type `dabbler session start` in the terminal VS Code opened for it -- the
// interpreter is the editor the operator already launched.
//
// What is written is a two-line launcher per platform into the extension's
// own global storage, and what is set is one `prepend` on the terminal
// environment collection. VS Code persists that collection and applies it to
// terminals created afterwards, which is why the description matters: the
// operator sees, in the terminal's own UI, that this extension changed PATH.
//
// Outside VS Code the answer is `npm i -g dabbler-ai-router`, which puts the
// same command on PATH through the package's `bin`. Both routes run the same
// `dist/dabbler.cjs`.
//
// **What this does not reach.** The environment collection applies to
// terminals, and only to terminals. A commit made from the Source Control
// panel runs git in the extension host's own environment, where `dabbler` is
// not on PATH -- so the pre-commit guard `bootstrap` installs cannot resolve
// it and exits non-blocking, which is the direction it fails in by design
// but is still a guard that is not guarding. A global install is what closes
// that, and it is what the managed instruction fence tells the operator to
// do for anywhere that is not a VS Code terminal.

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

/** What the shim launcher is called, without an extension. */
const COMMAND_NAME = "dabbler";

/**
 * The bundled CLI entry point, or null when the router package cannot be
 * resolved.
 *
 * `require.resolve` answers with the package's `main` (`dist/index.cjs`);
 * the command sits beside it. Resolving the package rather than reaching
 * for a path keeps this correct under a workspace symlink and under a
 * packaged VSIX, which are different layouts.
 */
export function resolveRouterCli(): string | null {
  try {
    const main = require.resolve("dabbler-ai-router");
    const candidate = path.join(path.dirname(main), "dabbler.cjs");
    return fs.existsSync(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

/**
 * The `cmd.exe` launcher. `setlocal` keeps `ELECTRON_RUN_AS_NODE` inside it,
 * so a shell that runs `dabbler` does not silently acquire the variable for
 * everything after.
 *
 * It caps a single invocation at cmd.exe's line length, which no verb
 * approaches -- the router's arguments are flags and paths, never prose.
 */
export function cmdLauncherText(execPath: string, cliPath: string): string {
  return [
    "@echo off",
    "setlocal",
    'set "ELECTRON_RUN_AS_NODE=1"',
    `"${execPath}" "${cliPath}" %*`,
    "exit /b %ERRORLEVEL%",
    "",
  ].join("\r\n");
}

/** The POSIX-shell launcher, with forward slashes so MSYS resolves them. */
export function shLauncherText(execPath: string, cliPath: string): string {
  const posix = (value: string): string => value.split("\\").join("/");
  return [
    "#!/bin/sh",
    `ELECTRON_RUN_AS_NODE=1 exec "${posix(execPath)}" "${posix(cliPath)}" "$@"`,
    "",
  ].join("\n");
}

/**
 * Every launcher this platform needs, by filename.
 *
 * Windows needs **both**, and the second one is not a nicety. PATH lookup in
 * `cmd.exe` and PowerShell consults `PATHEXT`, so the command has to be
 * `dabbler.cmd` to be found by a bare name. But the pre-commit guard that
 * `bootstrap` installs is a `#!/bin/sh` script run by the POSIX shell git
 * ships, and that shell does not consult `PATHEXT` -- it looks for a file
 * named exactly `dabbler` and finds nothing. A Windows machine with only the
 * `.cmd` therefore has a commit guard that reports "command not found" on
 * every commit and lets all of them through.
 *
 * This is how npm's own global shims are shaped, and for the same reason.
 */
export function launchers(
  execPath: string,
  cliPath: string,
): Record<string, string> {
  if (process.platform === "win32") {
    return {
      [`${COMMAND_NAME}.cmd`]: cmdLauncherText(execPath, cliPath),
      [COMMAND_NAME]: shLauncherText(execPath, cliPath),
    };
  }
  return { [COMMAND_NAME]: shLauncherText(execPath, cliPath) };
}

/**
 * Write the launcher and prepend its directory to the terminal PATH.
 *
 * Returns the directory that was added, or null when there was nothing to
 * add -- a router that cannot be resolved, or a storage directory that
 * cannot be written. Neither is fatal: the extension's own router calls do
 * not go through the shim, so a failure here costs the terminal convenience
 * and nothing else.
 */
export function installTerminalShim(
  context: vscode.ExtensionContext,
): string | null {
  const cli = resolveRouterCli();
  if (cli === null) return null;

  const directory = path.join(context.globalStorageUri.fsPath, "bin");
  try {
    fs.mkdirSync(directory, { recursive: true });
    // Rewritten every activation rather than only when absent: the two paths
    // baked in are the editor's install location and the extension's version
    // directory, and both move under an update. A stale launcher would point
    // at a VS Code that is no longer there.
    for (const [name, text] of Object.entries(launchers(process.execPath, cli))) {
      const launcher = path.join(directory, name);
      fs.writeFileSync(launcher, text, "utf8");
      if (!name.endsWith(".cmd")) fs.chmodSync(launcher, 0o755);
    }
  } catch {
    return null;
  }

  const collection = context.environmentVariableCollection;
  collection.description = "Puts `dabbler` on PATH for this workspace's terminals.";
  // `clear` first so a version that moved does not leave the old directory
  // ahead of the new one on PATH.
  collection.clear();
  collection.prepend("PATH", directory + path.delimiter, {
    applyAtProcessCreation: true,
    applyAtShellIntegration: true,
  });
  return directory;
}
