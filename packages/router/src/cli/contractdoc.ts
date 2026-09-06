// `dabbler contractdoc` -- render a contract, to stdout or to a file.

import { writeFileSync } from "node:fs";

import {
  ContractError,
  EXIT_OK,
  EXIT_REFUSED,
  load,
  render,
} from "../contractdoc.ts";
import { platformNewlines } from "../journal.ts";
import { load as loadSolution, type Solution } from "../solution.ts";
import { writeErr, writeOut } from "./output.ts";

const EXIT_USAGE = 2;

function usage(): string {
  return [
    "usage: dabbler contractdoc [-h] [--workspace-root WORKSPACE_ROOT] [-o OUT]",
    "                           contract",
    "",
    "positional arguments:",
    "  contract              path to a contract.yaml",
    "",
    "options:",
    "  -h, --help            show this help message and exit",
    "  --workspace-root WORKSPACE_ROOT",
    "                        read solution.yaml from here for the diagram",
    "  -o OUT, --out OUT     write here instead of stdout",
    "",
  ].join("\n");
}

export function contractdocVerb(argv: string[]): Promise<number> {
  return Promise.resolve(run(argv));
}

function run(argv: string[]): number {
  let contract: string | null = null;
  let workspaceRoot = ".";
  let out: string | null = null;

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "-h" || token === "--help") {
      writeOut(usage());
      return EXIT_OK;
    }
    if (token === "--workspace-root" || token === "-o" || token === "--out") {
      const value = argv[i + 1];
      if (value === undefined) {
        writeErr(
          `${usage()}dabbler contractdoc: error: argument ${token}: ` +
            "expected one argument\n",
        );
        return EXIT_USAGE;
      }
      if (token === "--workspace-root") workspaceRoot = value;
      else out = value;
      i += 1;
    } else if (contract === null && !token.startsWith("-")) {
      contract = token;
    } else {
      writeErr(
        `${usage()}dabbler contractdoc: error: unrecognized arguments: ${token}\n`,
      );
      return EXIT_USAGE;
    }
  }

  if (contract === null) {
    writeErr(
      `${usage()}dabbler contractdoc: error: the following arguments are ` +
        "required: contract\n",
    );
    return EXIT_USAGE;
  }

  let document;
  try {
    document = load(contract);
  } catch (error) {
    if (error instanceof ContractError) {
      writeErr(`refused: ${error.message}\n`);
      return EXIT_REFUSED;
    }
    throw error;
  }

  // The diagram is a bonus; a missing manifest is not fatal.
  let solution: Solution | null = null;
  try {
    solution = loadSolution(workspaceRoot);
  } catch {
    solution = null;
  }

  const text = render(document, solution);
  if (out !== null) {
    writeFileSync(out, platformNewlines(text), { encoding: "utf8" });
    writeOut(`wrote ${out}\n`);
  } else {
    // `sys.stdout.write`, not `print`: the rendered document ends with its own
    // newline and a second one would be a blank line the file does not have.
    writeOut(text);
  }
  return EXIT_OK;
}
