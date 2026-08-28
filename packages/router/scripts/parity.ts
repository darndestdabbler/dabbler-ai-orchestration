// The parity control, by hand or through `facts`.
//
//     npm run parity                     the control: 0 identical, 1 drift, 2 could not run
//     npm run parity -- --build <shape>  build one corpus shape and leave it on disk
//     npm run parity -- --self-check <s> build it twice and compare the two
//
// The second form is how a shape's builder is exercised before any verb
// needs it. It is not the control and never answers for it.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { compareCopies } from "../src/parity/compare.ts";
import { CorpusError, SHAPES, buildShape } from "../src/parity/corpus.ts";
import {
  EXIT_CANNOT_RUN,
  EXIT_DRIFT,
  resolveRouters,
  runParity,
} from "../src/parity/run.ts";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function buildOnly(name: string, target: string): number {
  const routers = resolveRouters(PACKAGE_ROOT);
  const repo = buildShape(name, target, { interpreter: routers.interpreter });
  process.stdout.write(`parity: built the '${name}' shape at ${repo}\n`);
  return 0;
}

/**
 * Two independent builds of one shape, compared to each other.
 *
 * Whatever the two routers later disagree about, they must not disagree
 * about this: two runs of the same builder differ only in their root and
 * their timestamps, which is exactly what the two normalizations erase. A
 * builder that fails this is non-deterministic, and every parity run it
 * feeds would be flaky for a reason no diff would explain.
 */
function selfCheck(name: string): number {
  const routers = resolveRouters(PACKAGE_ROOT);
  const context = { interpreter: routers.interpreter };
  const workspace = mkdtempSync(join(tmpdir(), "dabbler-parity-self-"));
  try {
    const left = buildShape(name, join(workspace, "a"), context);
    const right = buildShape(name, join(workspace, "b"), context);
    const result = compareCopies(left, right);
    if (result.differences.length === 0) {
      process.stdout.write(
        `parity: '${name}' builds identically twice over ${result.compared} path(s)\n`,
      );
      return 0;
    }
    for (const difference of result.differences) {
      process.stderr.write(
        difference.kind === "content"
          ? `${difference.diff}\n`
          : `${difference.path} (${difference.kind})\n`,
      );
    }
    process.stderr.write(
      `parity: '${name}' is not deterministic: ${result.differences.length} path(s) differ\n`,
    );
    return EXIT_DRIFT;
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

function listShapes(): number {
  for (const shape of SHAPES) {
    const state = shape.build ? "built" : `from session ${shape.neededFromSession}`;
    process.stdout.write(`  ${shape.name.padEnd(14)} ${shape.summary}  (${state})\n`);
  }
  return 0;
}

function main(argv: string[]): number {
  try {
    if (argv[0] === "--shapes") return listShapes();
    if (argv[0] === "--self-check") {
      const name = argv[1];
      if (!name) {
        process.stderr.write("parity: --self-check needs a shape name\n");
        return EXIT_CANNOT_RUN;
      }
      return selfCheck(name);
    }
    if (argv[0] === "--build") {
      const name = argv[1];
      if (!name) {
        process.stderr.write("parity: --build needs a shape name\n");
        return EXIT_CANNOT_RUN;
      }
      // Outside the repository by default: a corpus is never a working tree.
      const target = resolve(argv[2] ?? join(tmpdir(), "dabbler-parity", name));
      return buildOnly(name, target);
    }
    const report = runParity(PACKAGE_ROOT);
    const stream = report.exitCode === 0 ? process.stdout : process.stderr;
    for (const line of report.lines) stream.write(`${line}\n`);
    return report.exitCode;
  } catch (error) {
    const message = error instanceof CorpusError || error instanceof Error
      ? error.message
      : String(error);
    process.stderr.write(`parity: could not run -- ${message}\n`);
    return EXIT_CANNOT_RUN;
  }
}

process.exitCode = main(process.argv.slice(2));
