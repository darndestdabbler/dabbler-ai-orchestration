// Run one TypeScript entry point on the host's own Node, with no
// transpiler in between: Node strips the types itself from 22.18 on.
//
// The version guard is the point. A declared control that meets an older
// Node must exit 2 -- "could not run", recorded as `unknown` -- because a
// SyntaxError would exit 1 and be read as a finding the tool never made.
//
// Plain JavaScript deliberately: this file is what runs before anything
// can strip types, so it cannot be TypeScript itself.

import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const CANNOT_RUN = 2;
const MINIMUM = [22, 18];

function tooOld(version) {
  const [major, minor] = version.split(".").map((part) => Number.parseInt(part, 10));
  if (major > MINIMUM[0]) return false;
  if (major < MINIMUM[0]) return true;
  return minor < MINIMUM[1];
}

const entry = process.argv[2];
if (!entry) {
  process.stderr.write("run-ts: an entry point is required\n");
  process.exit(CANNOT_RUN);
}

if (tooOld(process.versions.node)) {
  process.stderr.write(
    `run-ts: node ${process.versions.node} cannot run TypeScript directly; ` +
      `${MINIMUM.join(".")} or later is required\n`,
  );
  process.exit(CANNOT_RUN);
}

// The entry point is this runner's argument, not the script's. Drop it so
// the script reads the argv a caller actually typed.
process.argv.splice(2, 1);

try {
  await import(pathToFileURL(resolve(process.cwd(), entry)).href);
} catch (error) {
  process.stderr.write(`run-ts: ${entry} could not be loaded: ${error?.message ?? error}\n`);
  process.exit(CANNOT_RUN);
}
