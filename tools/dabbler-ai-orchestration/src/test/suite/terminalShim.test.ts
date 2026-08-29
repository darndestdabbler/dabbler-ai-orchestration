// The launchers that put `dabbler` on the terminal's PATH.
//
// The PATH change itself belongs to VS Code and is asserted through the
// environment-variable collection the extension is handed; what is checked
// here is the part that is ours -- the launchers, and that they name the
// editor's own Node rather than an interpreter the project must supply.

import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  cmdLauncherText,
  installTerminalShim,
  launchers,
  resolveRouterCli,
  shLauncherText,
} from "../../router/terminalShim";

suite("the terminal shim", () => {
  test("runs the bundled CLI on the editor's own Node", () => {
    // This is the whole zero-install claim in one line: the interpreter is
    // the editor the operator already launched.
    for (const text of [
      cmdLauncherText("C:\\Code\\Code.exe", "C:\\ext\\dist\\dabbler.cjs"),
      shLauncherText("C:\\Code\\Code.exe", "C:\\ext\\dist\\dabbler.cjs"),
    ]) {
      assert.ok(text.includes("ELECTRON_RUN_AS_NODE=1"));
      assert.ok(text.toLowerCase().includes("code.exe"));
      assert.ok(text.includes("dabbler.cjs"));
      assert.ok(!text.includes("python"));
    }
  });

  test("passes its arguments through and returns the CLI's exit code", () => {
    // A launcher that swallowed the exit code would make every refusal look
    // like a success to whatever ran it -- including the pre-commit guard,
    // whose whole job is to act on one specific exit code.
    const cmd = cmdLauncherText("node.exe", "cli.cjs");
    assert.ok(cmd.includes("%*"));
    assert.ok(cmd.includes("exit /b %ERRORLEVEL%"));
    // `setlocal`, so a shell that runs `dabbler` does not silently acquire
    // ELECTRON_RUN_AS_NODE for everything after it.
    assert.ok(cmd.includes("setlocal"));

    const sh = shLauncherText("node", "cli.cjs");
    assert.ok(sh.includes('"$@"'));
    assert.ok(sh.startsWith("#!/bin/sh"));
    assert.ok(sh.includes("exec "));
  });

  test("gives Windows a POSIX launcher as well as a .cmd", () => {
    // The `.cmd` is what `cmd.exe` and PowerShell find by a bare name, via
    // PATHEXT. The extensionless one is what the pre-commit guard needs: it
    // is a `#!/bin/sh` script run by the shell git ships, and that shell does
    // not consult PATHEXT -- with only the `.cmd` present it reports "command
    // not found" on every commit and lets all of them through.
    const written = launchers("node.exe", "cli.cjs");
    const names = Object.keys(written).sort();
    assert.deepStrictEqual(
      names,
      process.platform === "win32" ? ["dabbler", "dabbler.cmd"] : ["dabbler"],
    );
  });

  test("spells Windows paths with forward slashes in the POSIX launcher", () => {
    // MSYS resolves a forward-slash path; a backslash inside double quotes
    // is an escape there, so `C:\ext\node.exe` would arrive mangled.
    const sh = shLauncherText("C:\\Code\\Code.exe", "C:\\ext\\cli.cjs");
    assert.ok(sh.includes("C:/Code/Code.exe"));
    assert.ok(!sh.includes("\\"));
  });

  test("writes the launchers and prepends their directory to PATH", () => {
    // Asserted rather than skipped past: the extension declares the router
    // as a dependency, so a run where it does not resolve is a broken
    // install, and a test that returned early there would report a pass for
    // a shim it never wrote.
    assert.ok(resolveRouterCli() !== null, "the router package must resolve");
    const storage = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-shim-"));
    const prepended: { variable: string; value: string }[] = [];
    let cleared = false;
    const context = {
      globalStorageUri: { fsPath: storage },
      environmentVariableCollection: {
        description: "",
        clear: (): void => {
          cleared = true;
        },
        prepend: (variable: string, value: string): void => {
          prepended.push({ variable, value });
        },
      },
    } as unknown as Parameters<typeof installTerminalShim>[0];

    const directory = installTerminalShim(context);
    assert.ok(directory !== null);
    for (const name of Object.keys(launchers("node", "cli.cjs"))) {
      assert.ok(fs.existsSync(path.join(directory as string, name)), name);
    }
    // Cleared first, so an extension directory that moved under an update
    // does not leave the old one ahead of the new one on PATH.
    assert.strictEqual(cleared, true);
    assert.strictEqual(prepended.length, 1);
    assert.strictEqual(prepended[0]?.variable, "PATH");
    assert.ok(prepended[0]?.value.startsWith(directory as string));
    fs.rmSync(storage, { recursive: true, force: true });
  });
});
