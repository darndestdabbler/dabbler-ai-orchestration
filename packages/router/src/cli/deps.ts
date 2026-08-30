// `dabbler deps check|show` -- what this repository takes from its own
// solution, and where the declaration and the build files disagree.
//
// It reports and never repairs. Every disagreement here has a legitimate
// reading -- a dependency added this morning, a refactor that removed one, a
// pin deliberately held back -- and a tool that "fixed" them would be editing
// build files on a guess about which side was right.

import { repoRootFor, resolveSessionsDir, SessionsRootNotFoundError } from "../evidence.ts";
import {
  DEPS_FILENAME,
  SolutionDepsError,
  loadDeps,
  locateProducer,
  readBuildReferences,
  reconcile,
} from "../solutionDeps.ts";
import { dumps } from "../pythonJson.ts";
import { writeErr, writeOut } from "./output.ts";

const EXIT_OK = 0;
const EXIT_REFUSED = 1;
const EXIT_USAGE = 2;

const COMMANDS = ["check", "show"] as const;

function usage(): string {
  return [
    "usage: dabbler deps [-h] [--sessions-dir SESSIONS_DIR] {check,show}",
    "",
    "  check     compare the declaration against the build files",
    "  show      print the declared edges as JSON",
    "",
    "options:",
    "  --sessions-dir PATH      the sessions root; derived from the cwd when absent",
    "  -h, --help               show this message",
    "",
  ].join("\n");
}

export function depsVerb(argv: string[]): Promise<number> {
  return Promise.resolve(run(argv));
}

function run(argv: string[]): number {
  if (argv.length === 0 || argv.includes("-h") || argv.includes("--help")) {
    writeOut(usage());
    return argv.length === 0 ? EXIT_USAGE : EXIT_OK;
  }
  let command: string | null = null;
  let sessionsDirArg: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--sessions-dir") {
      sessionsDirArg = argv[index + 1];
      index += 1;
      continue;
    }
    if (!token.startsWith("--") && command === null) {
      command = token;
      continue;
    }
    writeErr(`${usage()}dabbler deps: unrecognized arguments: ${token}\n`);
    return EXIT_USAGE;
  }
  if (command === null || !(COMMANDS as readonly string[]).includes(command)) {
    writeErr(
      `${usage()}dabbler deps: invalid choice: '${command ?? ""}' ` +
        `(choose from ${COMMANDS.map((c) => `'${c}'`).join(", ")})\n`,
    );
    return EXIT_USAGE;
  }

  let root: string | null;
  try {
    root = repoRootFor(resolveSessionsDir(sessionsDirArg));
  } catch (error) {
    if (!(error instanceof SessionsRootNotFoundError)) throw error;
    writeErr(`deps: ${error.message}\n`);
    return EXIT_USAGE;
  }
  if (root === null) {
    writeErr("deps: not inside a git repository\n");
    return EXIT_USAGE;
  }

  let deps;
  try {
    deps = loadDeps(root);
  } catch (error) {
    if (!(error instanceof SolutionDepsError)) throw error;
    writeErr(`deps: refused -- ${error.message}\n`);
    return EXIT_REFUSED;
  }

  if (command === "show") {
    writeOut(`${dumps(deps ?? { solution: null, consumes: [] }, { indent: 2 })}\n`);
    return EXIT_OK;
  }

  if (deps === null) {
    writeOut(
      `deps: this repository declares no ${DEPS_FILENAME}, so it takes ` +
        "nothing from a solution as far as the record knows. That is a " +
        "legitimate state for a repository that stands alone.\n",
    );
    return EXIT_OK;
  }

  const refs = readBuildReferences(root);
  // What the SOLUTION produces is what makes an undeclared reference
  // interesting, and this repository knows only what it declares. Assembling
  // the full set across repositories is session 47's; until then the
  // declared ids are the honest bound, and the check says so rather than
  // implying it looked wider.
  const known = new Set(deps.consumes.map((edge) => edge.id));
  const findings = reconcile(deps, refs, known);

  writeOut(`${deps.solution}: ${deps.consumes.length} declared edge(s)\n`);
  for (const edge of deps.consumes) {
    const where = locateProducer(root, edge.producedBy);
    writeOut(
      `  ${edge.id.padEnd(30)} from ${edge.producedBy.id} ` +
        `(${edge.resolve})${where.path ? "" : ` — ${where.reason}`}\n`,
    );
  }
  writeOut(
    `  ${refs.length} direct dependenc(ies) read from this repository's ` +
      "build files\n",
  );
  if (findings.length === 0) {
    writeOut("  the declaration and the build files agree\n");
    return EXIT_OK;
  }
  writeOut("\n");
  for (const finding of findings) {
    writeOut(`  ${finding.kind}: ${finding.detail}\n`);
  }
  writeOut(
    "\nReported, not repaired. Each of these has a legitimate reading, and " +
      "which side is right is not derivable from here.\n",
  );
  return EXIT_OK;
}
