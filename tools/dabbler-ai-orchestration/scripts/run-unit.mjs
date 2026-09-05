// The extension's mocha suite, as argv.
//
// `npm run test:unit` is the door CI and `dabbler.yaml` use, and it stays
// exactly as it is. This is a second door, for the one caller that cannot
// use the first: a work plan's check is argv spawned with NO shell, and on
// Windows `npm` is a `.cmd` shim that argv cannot reach. Without this a
// step that changes only extension sources has no mechanical check, which
// is a step the driver would close on the engine's word.
//
// Two things it must do that a bare mocha argv cannot. It runs from the
// extension package's own directory, because `ts-node/register` resolves
// its `tsconfig.json` from the working directory and the repository root's
// is not the extension's -- pointed at the wrong one, every spec fails to
// compile on `suite` and `test` being undeclared. And it finds that
// directory from its own location rather than from where it was invoked,
// so the caller may name it from anywhere.
//
// Spec paths are relative to the extension package, matching what
// `test:unit` writes in package.json. With none it runs the whole suite.

import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const specs = process.argv.slice(2);

const result = spawnSync(
  process.execPath,
  [
    join(packageRoot, "node_modules", "mocha", "bin", "mocha.js"),
    "--require",
    "ts-node/register",
    "--require",
    "./src/test/vscode-stub.js",
    "--ui",
    "tdd",
    "--timeout",
    "120000",
    ...(specs.length > 0 ? specs : ["src/test/suite/**/*.test.ts"]),
  ],
  { cwd: packageRoot, stdio: "inherit" },
);

// A signal is not an exit code, and a run that was killed did not pass.
process.exit(result.status ?? 1);
