// The runner's conditions, reproduced on this machine.
//
// A bare CI runner differs from a developer's machine in more than one way,
// and this suite has been quietly assuming otherwise. Two of those
// differences have now made `Test` red for thirteen consecutive runs while
// everything passed here, so both are supplied on demand:
//
// **The temp directory is spelled two ways.** The Windows runner's
// `os.tmpdir()` is the 8.3 short name (`C:\Users\RUNNER~1\...`) while `git
// rev-parse --show-toplevel` answers with the long one, so every comparison
// of the two decided containment wrongly. A directory alias -- a junction on
// Windows, a symlink elsewhere -- reproduces exactly that: `TEMP` and `TMP`
// point at the alias, and git answers with the real path.
//
// **There is no git identity, and no ambient git configuration at all.**
// `GIT_CONFIG_GLOBAL` and `GIT_CONFIG_SYSTEM` point at files that do not
// exist, which is git's own way of saying "read no configuration but the
// repository's own". A fixture that borrows the developer's `user.email`
// passes for a reason it never stated, and the framework's own commit --
// the driver's land phase -- then fails on the runner with *please tell me
// who you are*.
//
// It is a control rather than a test because it runs the suite: what it
// proves is that the OTHER tests still pass under these conditions, and a
// test that spawns the suite it belongs to would be a suite that runs
// itself.
//
//     node packages/router/scripts/aliased-temp-suite.mjs [suite ...]

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The suites whose CI failures were this bug, when the caller names none. */
const DEFAULT_SUITES = ["record.test", "projection.test", "gates.test"];

const SUITES = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_SUITES;

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const real = mkdtempSync(join(tmpdir(), "dabbler-aliased-"));
const alias = `${real}-alias`;

let code = 1;
try {
  mkdirSync(real, { recursive: true });
  symlinkSync(real, alias, process.platform === "win32" ? "junction" : "dir");
  process.stdout.write(
    `aliased-temp: TEMP=${alias}\n` +
      `              which the filesystem also calls ${real}\n` +
      "              and no git configuration but each repository's own\n" +
      `              suites: ${SUITES.join(" ")}\n`,
  );
  // This node, running vitest's own entry point. Not `npx`: its Windows
  // form is a `.cmd`, which `spawnSync` refuses outright (EINVAL) unless it
  // is given a shell, and this control has no business opening one.
  const run = spawnSync(
    process.execPath,
    [
      join(repoRoot, "node_modules", "vitest", "vitest.mjs"),
      "run",
      "--root",
      "packages/router",
      ...SUITES,
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        // The fixtures' `os.tmpdir()` is the alias, and git answers with
        // the real path for every repository they create.
        TEMP: alias,
        TMP: alias,
        TMPDIR: alias,
        // A file that does not exist is how git is told to read no
        // configuration but the repository's own -- so no identity, no
        // `core.autocrlf`, nothing this machine happens to have set.
        GIT_CONFIG_GLOBAL: join(alias, "no-such-gitconfig"),
        GIT_CONFIG_SYSTEM: join(alias, "no-such-gitconfig"),
        // And no GUESSED identity either, which is the difference between
        // this machine and the runner: git will invent `user@hostname` when
        // it can, and on the runner it cannot, so a fixture that declares
        // no identity fails there and passes here. `user.useConfigOnly`
        // makes git refuse to guess, which is the runner's answer.
        GIT_CONFIG_COUNT: "1",
        GIT_CONFIG_KEY_0: "user.useConfigOnly",
        GIT_CONFIG_VALUE_0: "true",
      },
      stdio: "inherit",
      windowsHide: true,
    },
  );
  code = run.status ?? 1;
  process.stdout.write(
    code === 0
      ? "aliased-temp: the suites pass with the temp directory spelled two ways\n"
      : `aliased-temp: FAILED (exit ${code}) -- a path comparison is deciding on\n` +
        "              the spelling it was handed rather than the canonical one\n",
  );
} finally {
  // Both, and never the real directory through the alias: removing a
  // junction's target through the junction is how a temp cleanup becomes a
  // data loss.
  rmSync(alias, { recursive: true, force: true });
  rmSync(real, { recursive: true, force: true });
}

// `exitCode` rather than `exit()`: exiting while stdout is still draining is
// what crashed `check:types` on a runner with libuv's `UV_HANDLE_CLOSING`
// assertion, after it had printed that everything passed.
process.exitCode = code;
