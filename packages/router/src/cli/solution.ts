// `dabbler solution show|check` -- read the manifest, and nothing else.

import {
  asDict,
  EXIT_OK,
  EXIT_REFUSED,
  load,
  ManifestError,
  STEP_TITLES,
} from "../solution.ts";
import { dumps } from "../pythonJson.ts";
import { writeErr, writeOut } from "./output.ts";

const EXIT_USAGE = 2;

const COMMANDS = ["show", "check"] as const;

function usage(): string {
  return [
    "usage: dabbler solution [-h] [--workspace-root WORKSPACE_ROOT]",
    "                        {show,check}",
    "",
    "positional arguments:",
    "  {show,check}",
    "",
    "options:",
    "  -h, --help            show this help message and exit",
    "  --workspace-root WORKSPACE_ROOT",
    "",
  ].join("\n");
}

export function solutionVerb(argv: string[]): Promise<number> {
  return Promise.resolve(run(argv));
}

function run(argv: string[]): number {
  let command: string | null = null;
  let workspaceRoot = ".";

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "-h" || token === "--help") {
      writeOut(usage());
      return EXIT_OK;
    }
    if (token === "--workspace-root") {
      const value = argv[i + 1];
      if (value === undefined) {
        writeErr(
          `${usage()}dabbler solution: error: argument --workspace-root: ` +
            "expected one argument\n",
        );
        return EXIT_USAGE;
      }
      workspaceRoot = value;
      i += 1;
    } else if (command === null && !token.startsWith("-")) {
      command = token;
    } else {
      writeErr(
        `${usage()}dabbler solution: error: unrecognized arguments: ${token}\n`,
      );
      return EXIT_USAGE;
    }
  }

  if (command === null) {
    writeErr(
      `${usage()}dabbler solution: error: the following arguments are ` +
        "required: command\n",
    );
    return EXIT_USAGE;
  }
  if (!(COMMANDS as readonly string[]).includes(command)) {
    writeErr(
      `${usage()}dabbler solution: error: argument command: invalid choice: ` +
        `'${command}' (choose from ${COMMANDS.map((c) => `'${c}'`).join(", ")})\n`,
    );
    return EXIT_USAGE;
  }

  let solution;
  try {
    solution = load(workspaceRoot);
  } catch (error) {
    if (error instanceof ManifestError) {
      writeErr(`refused: ${error.message}\n`);
      return EXIT_REFUSED;
    }
    throw error;
  }

  if (command === "show") {
    writeOut(`${dumps(asDict(solution), { indent: 2 })}\n`);
    return EXIT_OK;
  }

  // This command reads the manifest and nothing else. It printed the declared
  // step in the same shape `workflow status` prints live progress, so the two
  // disagreed on screen with nothing to say which was which -- a reader spent
  // twelve steps trying to work out who was lying.
  writeOut(`${solution.title} (${solution.name})\n`);
  writeOut("  the manifest is valid\n");
  writeOut(`  ${solution.components.length} components, no cycles\n`);
  for (const c of solution.components) {
    const used = c.usedBy.length > 0 ? c.usedBy.join(", ") : "nothing yet";
    writeOut(
      `    ${c.name.padEnd(22)} ${c.kind.padEnd(12)} used by: ${used}\n`,
    );
  }
  writeOut(
    `  declared starting step: ${STEP_TITLES[solution.step]}. This is where ` +
      "the manifest says work begins,\n",
  );
  writeOut(
    "  not where it has got to. For that, run " +
      "`dabbler workflow status`.\n",
  );
  return EXIT_OK;
}
