// `dabbler deps check|show` -- what this repository takes from its own
// solution, and where the declaration and the build files disagree.
//
// It reports and never repairs. Every disagreement here has a legitimate
// reading -- a dependency added this morning, a refactor that removed one, a
// pin deliberately held back -- and a tool that "fixed" them would be editing
// build files on a guess about which side was right.

import { repoRootFor, resolveSessionsDir, SessionsRootNotFoundError } from "../evidence.ts";
import { raiseOwnershipDecision } from "../owedDecisions.ts";
import {
  DEPS_FILENAME,
  UNREADABLE_ID,
  assembleSolution,
  producedBySolution,
  reconcileAcrossRepositories,
  SolutionDepsError,
  loadDeps,
  locateProducer,
  type BuildReference,
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
    // `null` and not an empty-looking document. A shape carrying
    // `solution: null` is not a valid declaration, and printing one invites
    // a reader to treat "declares nothing" as "declares no edges" -- which
    // are the same shape and not the same fact.
    if (deps === null) {
      writeErr(`deps: this repository declares no ${DEPS_FILENAME}\n`);
      writeOut("null\n");
      return EXIT_OK;
    }
    writeOut(`${dumps(deps, { indent: 2 })}\n`);
    return EXIT_OK;
  }

  // Read the build files even with no declaration: that is the ONBOARDING
  // path, and returning early there meant the ownership question was never
  // asked on the one run where it mattered.
  const members = assembleSolution(root);
  const self = members[0];
  const known = producedBySolution(members);
  const findings = [
    ...reconcile(deps, self.refs, known),
    ...reconcileAcrossRepositories(members, known),
  ];

  if (deps === null) {
    writeOut(
      `deps: this repository declares no ${DEPS_FILENAME}. ` +
        `${self.refs.length} direct dependenc(ies) were read from its build ` +
        "files; whether any of them is built by one of your own repositories " +
        "is not derivable from a build file.\n",
    );
    const raised = raiseOwnershipForUnclassified(root, self.refs, known);
    if (raised.length > 0) {
      writeOut(
        `deps: asked about ${raised.length} of them — ` +
          "`dabbler owed list` reads the questions.\n",
      );
    }
    // The findings are printed here too. An undeclared repository with a
    // ProjectReference reaching a sibling is the MOST likely unsanctioned
    // source case there is -- it is what someone does before they have
    // declared anything -- and computing that finding and returning without
    // it was the check staying quiet about the thing it exists to notice.
    reportFindings(findings);
    return EXIT_OK;
  }

  writeOut(`${deps.solution}: ${deps.consumes.length} declared edge(s)\n`);
  for (const edge of deps.consumes) {
    const where = locateProducer(root, edge.producedBy, deps.solution);
    // The warning prints beside a producer that WAS located: "we could not
    // confirm this is the right repository" is a different state from "this
    // is the right repository", and only one of them is allowed to be silent.
    const note = where.path === null ? where.reason : where.warning;
    writeOut(
      `  ${edge.id.padEnd(30)} from ${edge.producedBy.id} ` +
        `(${edge.resolve})${note ? ` — ${note}` : ""}\n`,
    );
  }
  for (const member of members.slice(1)) {
    if (member.reason) writeOut(`  ${member.id}: ${member.reason}\n`);
  }
  writeOut(
    `  ${self.refs.length} direct dependenc(ies) read from this repository's ` +
      "build files\n",
  );
  raiseOwnershipForUnclassified(root, self.refs, known);
  reportFindings(findings);
  return EXIT_OK;
}

/**
 * Ask, once per package, whether a dependency is one of ours.
 *
 * Only for packages nothing has classified yet: a declared edge is answered,
 * and a package already recorded external is not re-asked -- `raiseOwed` is
 * idempotent by id, which is what keeps this from becoming the per-session
 * re-ask the owed record exists to end.
 */
function raiseOwnershipForUnclassified(
  repoRoot: string,
  refs: readonly BuildReference[],
  known: ReadonlySet<string>,
): string[] {
  const asked: string[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    // An id the build tool alone can resolve is not a question anyone can
    // answer -- "is (unreadable) one of yours" has no useful answer.
    if (ref.id === UNREADABLE_ID || ref.fromSource) continue;
    if (known.has(ref.id) || seen.has(ref.id)) continue;
    seen.add(ref.id);
    try {
      const row = raiseOwnershipDecision(repoRoot, {
        packageId: ref.id,
        seenIn: ref.file,
      });
      if (row !== null) asked.push(ref.id);
    } catch {
      // A brief that cannot be written must not fail a read-only check.
    }
  }
  return asked;
}

/** The disagreements, or the sentence that says there are none. */
function reportFindings(findings: readonly { kind: string; detail: string }[]): void {
  if (findings.length === 0) {
    writeOut("  the declaration and the build files agree\n");
    return;
  }
  writeOut("\n");
  for (const finding of findings) {
    writeOut(`  ${finding.kind}: ${finding.detail}\n`);
  }
  writeOut(
    "\nReported, not repaired. Each of these has a legitimate reading, and " +
      "which side is right is not derivable from here.\n",
  );
}
