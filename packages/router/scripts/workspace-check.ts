// The typecheck and lint controls, over every TypeScript package at once.
//
//     node packages/router/scripts/run-ts.mjs \
//         packages/router/scripts/workspace-check.ts <typecheck|lint>
//
// One control per kind is all `facts` admits, and this repository has two
// TypeScript packages, so one command has to answer for both. It calls the
// tools by their own entry points rather than through npm: a declared
// control is run as argv with no shell, and `npm` is a shim script on
// Windows that argv cannot reach.
//
// Every package is checked even after one fails, because a control that
// stopped at the first red would hide the second.

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = join(PACKAGE_ROOT, "..", "..");

const TSC = join(REPO_ROOT, "node_modules", "typescript", "bin", "tsc");
const ESLINT = join(REPO_ROOT, "node_modules", "eslint", "bin", "eslint.js");

interface Package {
  readonly name: string;
  readonly dir: string;
  /** What ESLint is pointed at, relative to `dir`. */
  readonly lintTargets: readonly string[];
  readonly lintExtensions: string;
}

const PACKAGES: readonly Package[] = [
  {
    name: "packages/router",
    dir: join(REPO_ROOT, "packages", "router"),
    lintTargets: ["src", "scripts", "test", "build.mjs"],
    lintExtensions: ".ts,.mjs",
  },
  {
    name: "tools/dabbler-ai-orchestration",
    dir: join(REPO_ROOT, "tools", "dabbler-ai-orchestration"),
    lintTargets: ["src"],
    lintExtensions: ".ts",
  },
];

function run(args: string[], cwd: string): number {
  const proc = spawnSync(process.execPath, args, { cwd, stdio: "inherit" });
  if (proc.error) {
    process.stderr.write(`workspace-check: ${proc.error.message}\n`);
    return 2;
  }
  return proc.status ?? 1;
}

function typecheck(): number {
  let worst = 0;
  for (const pkg of PACKAGES) {
    const code = run([TSC, "--noEmit", "-p", pkg.dir], REPO_ROOT);
    if (code !== 0) {
      process.stderr.write(`workspace-check: tsc failed in ${pkg.name}\n`);
      worst = Math.max(worst, code);
    }
  }
  return worst;
}

function lint(): number {
  let worst = 0;
  for (const pkg of PACKAGES) {
    const code = run(
      [ESLINT, ...pkg.lintTargets, "--ext", pkg.lintExtensions],
      pkg.dir,
    );
    if (code !== 0) {
      process.stderr.write(`workspace-check: eslint failed in ${pkg.name}\n`);
      worst = Math.max(worst, code);
    }
  }
  return worst;
}

const mode = process.argv[2];
if (mode === "typecheck") process.exitCode = typecheck();
else if (mode === "lint") process.exitCode = lint();
else {
  process.stderr.write("workspace-check: expected 'typecheck' or 'lint'\n");
  process.exitCode = 2;
}
