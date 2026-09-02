// The runner's condition, reproduced on this machine.
//
// Twelve consecutive CI runs were red for one reason, and the suite was
// green here throughout: the Windows runner's `os.tmpdir()` is the 8.3 short
// name (`C:\Users\RUNNER~1\...`) while `git rev-parse --show-toplevel`
// answers with the long one, so every comparison of the two spellings
// decided containment wrongly -- and this machine's temp path has no short
// form, so nothing here ever disagreed.
//
// A directory alias supplies the same disagreement on demand: a junction on
// Windows, a symlink elsewhere. `TEMP` and `TMP` point at it, so the
// fixtures build their repositories under a path git spells differently,
// which is the runner's condition and not an imitation of it.
//
// It is a control rather than a test because it runs the suite: what it
// proves is that the OTHER tests still pass under the aliased spelling, and
// a test that spawns the suite it belongs to would be a suite that runs
// itself.

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The suites whose CI failures were this bug, and nothing beyond them. */
const SUITES = ["record.test", "projection.test", "gates.test"];

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const real = mkdtempSync(join(tmpdir(), "dabbler-aliased-"));
const alias = `${real}-alias`;

let code = 1;
try {
  mkdirSync(real, { recursive: true });
  symlinkSync(real, alias, process.platform === "win32" ? "junction" : "dir");
  process.stdout.write(
    `aliased-temp: TEMP=${alias}\n` +
      `              which the filesystem also calls ${real}\n`,
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
      // The whole point: the fixtures' `os.tmpdir()` is the alias, and git
      // will answer with the real path for every repository they create.
      env: { ...process.env, TEMP: alias, TMP: alias, TMPDIR: alias },
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

process.exit(code);
