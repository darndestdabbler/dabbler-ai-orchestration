// `dabbler workspace` -- one VS Code window over every repository in the
// solution.
//
// Multi-root is a VS Code default rather than a limit, and the graph already
// knows which folders belong together. What was missing was anything that
// turned the second fact into the first.
//
// The file is DERIVED LOCAL STATE. It carries the sibling paths this machine
// has, and a tracked copy is wrong on the second machine that opens it --
// pointing at folders that are not there, or at folders that are there and
// are somebody else's checkout. It is written under `.dabbler/`, which is
// gitignored whole, so it cannot be committed by accident.

import { repoRootFor, resolveSessionsDir, SessionsRootNotFoundError } from "../evidence.ts";
import {
  SolutionDepsError,
  workspaceFilePath,
  workspaceFolders,
  writeWorkspaceFile,
} from "../solutionDeps.ts";
import { writeErr, writeOut } from "./output.ts";

const EXIT_OK = 0;
const EXIT_REFUSED = 1;
const EXIT_USAGE = 2;

function usage(): string {
  return [
    "usage: dabbler workspace [-h] [--sessions-dir SESSIONS_DIR] [--show] [--json]",
    "",
    "  Writes a VS Code workspace over every repository in this solution that",
    "  is on this machine, and prints its path.",
    "",
    "options:",
    "  --show                   print the folders and write nothing",
    "  --json                   answer with one JSON object: the file written (or",
    "                           null), the folders, and what was said",
    "  --sessions-dir PATH      the sessions root; derived from the cwd when absent",
    "  -h, --help               show this message",
    "",
  ].join("\n");
}

export function workspaceVerb(argv: string[]): Promise<number> {
  return Promise.resolve(run(argv));
}

function run(argv: string[]): number {
  if (argv.includes("-h") || argv.includes("--help")) {
    writeOut(usage());
    return EXIT_OK;
  }
  let sessionsDirArg: string | undefined;
  let show = false;
  let json = false;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--sessions-dir") {
      sessionsDirArg = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === "--show") {
      show = true;
      continue;
    }
    if (token === "--json") {
      json = true;
      continue;
    }
    writeErr(`${usage()}dabbler workspace: unrecognized arguments: ${token}\n`);
    return EXIT_USAGE;
  }

  let root: string | null;
  try {
    root = repoRootFor(resolveSessionsDir(sessionsDirArg));
  } catch (error) {
    if (!(error instanceof SessionsRootNotFoundError)) throw error;
    writeErr(`workspace: ${error.message}\n`);
    return EXIT_USAGE;
  }
  if (root === null) {
    writeErr("workspace: not inside a git repository\n");
    return EXIT_USAGE;
  }

  let folders;
  try {
    folders = workspaceFolders(root);
  } catch (error) {
    if (!(error instanceof SolutionDepsError)) throw error;
    writeErr(`workspace: refused -- ${error.message}\n`);
    return EXIT_REFUSED;
  }

  // What is said, said once: as the lines a person reads, or under --json as
  // fields beside them, so a caller never reads a path out of prose.
  const answer = (said: string, file: string | null): number => {
    if (!json) {
      writeOut(said);
      return EXIT_OK;
    }
    const shown = folders.map((folder) => ({ name: folder.name, path: folder.path }));
    writeOut(`${JSON.stringify({ file, folders: shown, said })}\n`);
    return EXIT_OK;
  };

  if (folders.length === 1) {
    // One folder is the window the developer already has. Writing a
    // workspace for it would be a button that appears to do nothing.
    return answer(
      "workspace: this repository reaches no other repository on this " +
        "machine, so a workspace over the solution would be the window you " +
        "already have. Declare an edge, or clone a sibling beside this one.\n",
      null,
    );
  }

  const rows = folders.map((folder) => `  ${folder.name.padEnd(24)} ${folder.path}\n`).join("");
  if (show) {
    return answer(`${rows}\n(nothing written; it would go to ${workspaceFilePath(root)})\n`, null);
  }

  const path = writeWorkspaceFile(root);
  return answer(
    `${rows}\nwrote ${path}\n` +
      "It is derived from the graph and lives under `.dabbler/`, which is " +
      "not tracked: it carries the paths THIS machine has, and a shared copy " +
      "would point at folders somebody else does not have. Regenerate it " +
      "whenever the solution changes.\n",
    path,
  );
}
