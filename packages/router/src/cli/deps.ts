// `dabbler deps check|show` -- what this repository takes from its own
// solution, and where the declaration and the build files disagree.
//
// It reports and never repairs. Every disagreement here has a legitimate
// reading -- a dependency added this morning, a refactor that removed one, a
// pin deliberately held back -- and a tool that "fixed" them would be editing
// build files on a guess about which side was right.
//
// `locate`, `clone` and `scaffold` are the exception, and they are not
// repairs: each one writes what a PERSON just said about where a repository
// lives, or creates one they asked for. Nothing here guesses -- the
// difference between the two is who supplied the fact.

import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { repoRootFor, resolveSessionsDir, SessionsRootNotFoundError } from "../evidence.ts";
import { workingDirectory } from "../workdir.ts";
import {
  ID_FEED_SOURCE,
  currentDecisions,
  raiseFeedDecision,
  raiseOwnershipDecision,
} from "../owedDecisions.ts";
import {
  ResolutionError,
  configuredFeeds,
  declareFeed,
  localSourceCandidates,
  reconcileResolution,
  restoreFromSource,
  sourceModeActive,
  switchToSource,
} from "../resolution.ts";
import {
  DEFAULT_SEARCH_PATHS,
  DEPS_FILENAME,
  UNREADABLE_ID,
  assembleSolution,
  cloneMember,
  declarablePath,
  declareProducerLocation,
  producedBySolution,
  reconcileAcrossRepositories,
  scaffoldMember,
  SolutionDepsError,
  loadDeps,
  locateProducer,
  type BuildReference,
  reconcile,
} from "../solutionDeps.ts";
import { dumps } from "../pythonJson.ts";
import { tryWriteProjection } from "../workflow/project.ts";
import { writeErr, writeOut } from "./output.ts";

const EXIT_OK = 0;
const EXIT_REFUSED = 1;
const EXIT_USAGE = 2;

const COMMANDS = [
  "check",
  "show",
  "feeds",
  "source",
  "restore",
  "locate",
  "clone",
  "scaffold",
] as const;

function usage(): string {
  return [
    "usage: dabbler deps [-h] [--sessions-dir SESSIONS_DIR]",
    "                    {check,show,feeds,source,restore,locate,clone,scaffold}",
    "                    [--package ID] [--repository ID] [--path DIR] [--remote URL] [--apply]",
    "",
    "  check     compare the declaration against the build files",
    "  show      print the declared edges as JSON",
    "  feeds     what this machine has configured, against what is declared",
    "  source    resolve one dependency from a sibling checkout, reversibly",
    "  restore   put a source-resolved reference back exactly",
    "  locate    say where a producing repository is: a local folder, a remote, or both",
    "  clone     clone a producer's declared remote and record where it landed",
    "  scaffold  create a repository that declares only its membership in this solution",
    "",
    "options:",
    "  --package ID             the package `source` and `restore` act on",
    "  --repository ID          the producing repository `locate`, `clone` and",
    "                           `scaffold` act on -- the `producedBy` id, not a path",
    "  --path DIR               where that repository is, or where to create it",
    "  --remote URL             its remote, which survives a move and a second clone",
    "  --apply                  write an answered feed decision into this repository",
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
  let packageId: string | null = null;
  let repositoryId: string | null = null;
  let pathArg: string | null = null;
  let remoteArg: string | null = null;
  let apply = false;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--sessions-dir") {
      sessionsDirArg = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === "--package") {
      packageId = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (token === "--repository") {
      repositoryId = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (token === "--path" || token === "--into") {
      pathArg = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (token === "--remote") {
      remoteArg = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (token === "--apply") {
      apply = true;
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
    // The sessions root when there is one, and the working directory when
    // there is not. `deps` is about the SOLUTION and not about a session:
    // asking git from `docs/sessions` in a repository that has never run one
    // answers "not inside a git repository", which is both wrong and the
    // most confusing thing to say to somebody standing in their repository
    // -- and a repository `deps scaffold` has just created is exactly that.
    const sessionsDir = resolveSessionsDir(sessionsDirArg);
    root = repoRootFor(existsSync(sessionsDir) ? sessionsDir : workingDirectory());
  } catch (error) {
    if (!(error instanceof SessionsRootNotFoundError)) throw error;
    writeErr(`deps: ${error.message}\n`);
    return EXIT_USAGE;
  }
  if (root === null) {
    writeErr("deps: not inside a git repository\n");
    return EXIT_USAGE;
  }

  if (command === "locate" || command === "clone" || command === "scaffold") {
    if (repositoryId === null) {
      writeErr(`deps ${command}: --repository is required\n`);
      return EXIT_USAGE;
    }
    try {
      const code =
        command === "locate"
          ? locate(root, repositoryId, pathArg, remoteArg)
          : command === "clone"
            ? clone(root, repositoryId, pathArg)
            : scaffold(root, repositoryId, pathArg);
      // The projection is derived from the declaration that just changed,
      // and it is written on workflow events and nowhere else. Without this
      // the Explorer row the operator just acted on keeps saying the thing
      // they acted on -- which reads as the command having done nothing.
      if (code === EXIT_OK) tryWriteProjection(root);
      return code;
    } catch (error) {
      if (!(error instanceof SolutionDepsError)) throw error;
      writeErr(`deps ${command}: refused -- ${error.message}\n`);
      return EXIT_REFUSED;
    }
  }

  if (command === "feeds") return feeds(root, apply);
  if (command === "source" || command === "restore") {
    if (command === "source" && packageId === null) {
      writeErr("deps source: --package is required\n");
      return EXIT_USAGE;
    }
    return command === "source" ? toSource(root, packageId as string) : fromSource(root, packageId);
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
    ...reconcileResolution(members, configuredFeeds(root)),
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
 * Where the solution's other repositories are put on this machine.
 *
 * The first declared search path, because that is the first place the
 * assembly looks: a clone that landed anywhere else would be a checkout the
 * graph cannot see, which is the state these three verbs exist to end.
 */
function memberHome(repoRoot: string, deps: { searchPaths: readonly string[] } | null): string {
  const paths = deps?.searchPaths ?? DEFAULT_SEARCH_PATHS;
  return resolve(repoRoot, paths[0] ?? "..");
}

/** The declaration this repository must have before any of the three can write. */
function ownDeclaration(repoRoot: string): NonNullable<ReturnType<typeof loadDeps>> {
  const deps = loadDeps(repoRoot);
  if (deps === null) {
    throw new SolutionDepsError(
      `this repository declares no ${DEPS_FILENAME}; there is no solution here to place ` +
        "a repository in",
    );
  }
  return deps;
}

/**
 * Say where a producing repository is: a folder on this machine, a remote, or
 * both.
 *
 * The Explorer's absent row had no action at all, so the only way to answer
 * "where does this live" was to edit a tracked declaration by hand. Both
 * fields are optional and neither is verified against the world -- a remote
 * that is not reachable and a path that is not a checkout are REPORTED
 * states, and refusing them here would refuse the ordinary case of writing
 * down where something is going to be.
 */
function locate(
  repoRoot: string,
  repositoryId: string,
  pathArg: string | null,
  remoteArg: string | null,
): number {
  if (pathArg === null && remoteArg === null) {
    writeErr("deps locate: one of --path or --remote is required\n");
    return EXIT_USAGE;
  }
  let declaredPath: string | undefined;
  if (pathArg !== null) {
    const full = resolve(repoRoot, pathArg);
    if (!existsSync(full) || !statSync(full).isDirectory()) {
      writeErr(`deps locate: ${full} is not a directory on this machine\n`);
      return EXIT_REFUSED;
    }
    declaredPath = declarablePath(repoRoot, full);
  }
  declareProducerLocation(repoRoot, repositoryId, {
    ...(declaredPath === undefined ? {} : { path: declaredPath }),
    ...(remoteArg === null ? {} : { remote: remoteArg }),
  });
  const said = [
    declaredPath === undefined ? null : `at ${declaredPath} on this machine`,
    remoteArg === null ? null : `with the remote ${remoteArg}`,
  ].filter((part): part is string => part !== null);
  writeOut(
    `deps locate: ${repositoryId} is now declared ${said.join(" and ")}; ` +
      `${DEPS_FILENAME} carries it and nothing else does.\n`,
  );
  return EXIT_OK;
}

/** Clone a producer's declared remote, and record where it landed. */
function clone(repoRoot: string, repositoryId: string, into: string | null): number {
  const deps = ownDeclaration(repoRoot);
  const edge = deps.consumes.find((entry) => entry.producedBy.id === repositoryId);
  if (edge === undefined) {
    writeErr(`deps clone: no declared edge is produced by '${repositoryId}'\n`);
    return EXIT_REFUSED;
  }
  if (!edge.producedBy.remote) {
    writeErr(
      `deps clone: ${repositoryId} declares no remote. \`dabbler deps locate ` +
        `--repository ${repositoryId} --remote <url>\` says where it lives first.\n`,
    );
    return EXIT_REFUSED;
  }
  const where = locateProducer(repoRoot, edge.producedBy, deps.solution);
  if (where.path !== null) {
    writeErr(
      `deps clone: ${repositoryId} is already at ${where.path}; a second clone of one ` +
        "repository is one member on two branches, which is how a stale checkout " +
        "invents a version disagreement nobody has.\n",
    );
    return EXIT_REFUSED;
  }
  const target =
    into === null
      ? join(memberHome(repoRoot, deps), repositoryId)
      : resolve(repoRoot, into);
  const cloned = cloneMember(repoRoot, edge.producedBy.remote, target);
  const declared = declarablePath(repoRoot, cloned);
  declareProducerLocation(repoRoot, repositoryId, { path: declared });
  writeOut(
    `deps clone: ${repositoryId} cloned to ${cloned}, and ${DEPS_FILENAME} now declares ` +
      `it at ${declared}.\n`,
  );
  return EXIT_OK;
}

/**
 * Create a repository that declares only its membership in this solution.
 *
 * The answer to "once I completed the CSV model, I didn't know what to do
 * next": a multi-repository plan scaffolds the repositories it will need, so
 * finishing one leaves the next VISIBLE instead of leaving the operator to
 * remember it. What the shell carries is membership and nothing else -- it
 * appears in the graph because it says which solution it belongs to, which
 * is a claim only that repository is entitled to make.
 */
function scaffold(repoRoot: string, repositoryId: string, pathArg: string | null): number {
  const deps = ownDeclaration(repoRoot);
  const target =
    pathArg === null
      ? join(memberHome(repoRoot, deps), repositoryId)
      : resolve(repoRoot, pathArg);
  const created = scaffoldMember(target, deps.solution, repositoryId);
  // Only when this repository already declares an edge to it. A scaffold
  // does not invent a dependency: what this repository takes is read from
  // its build files and declared by whoever added the edge.
  const declared = deps.consumes.some((entry) => entry.producedBy.id === repositoryId);
  if (declared) declareProducerLocation(repoRoot, repositoryId, { path: declarablePath(repoRoot, created) });
  writeOut(
    `deps scaffold: ${created} now declares that it is ${repositoryId} in ` +
      `'${deps.solution}', and nothing else` +
      (declared ? `; this repository's edge to it points there.` : ".") +
      "\n",
  );
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

/**
 * What this machine has configured, and what the declaration expects of it.
 *
 * Reading is not writing. The user-level configuration is inspected so the
 * operator can be told what is already there; only the repository-scoped file
 * is ever written, and only as the execution of an answered decision.
 */
function feeds(root: string, apply: boolean): number {
  const deps = loadDeps(root);
  const configured = configuredFeeds(root);
  writeOut(`${configured.length} package source(s) configured\n`);
  for (const feed of configured) {
    const state = feed.unusable ? `unusable: ${feed.unusable}` : feed.enabled ? "enabled" : "disabled";
    writeOut(`  ${feed.key.padEnd(24)} ${feed.value}  (${state})\n`);
  }

  const wanted = new Map<string, string>();
  for (const edge of deps?.consumes ?? []) {
    if (edge.feed && !wanted.has(edge.feed)) wanted.set(edge.feed, edge.id);
  }
  if (wanted.size === 0) {
    writeOut(`\n${DEPS_FILENAME} names no feed, so there is nothing to reconcile.\n`);
    return EXIT_OK;
  }

  let unresolved = 0;
  for (const [feed, packageId] of wanted) {
    const found = configured.find((candidate) => candidate.key === feed);
    if (found && found.enabled && !found.unusable) {
      writeOut(`\n'${feed}' serves ${packageId} from ${found.value}\n`);
      continue;
    }
    unresolved += 1;
    const answer = answeredFeed(root, feed);
    if (answer === null) {
      // Asked, not guessed. What is behind a feed name is a URL or a
      // directory on this machine, and picking one wrong sends a restore at
      // somebody else's server.
      const raised = raiseFeedDecision(root, {
        feed,
        packageId,
        candidates: localSourceCandidates(root),
      });
      writeOut(
        `\n'${feed}' is not a package source on this machine` +
          (raised === null ? " (already asked)" : "") +
          " — `dabbler owed list` reads the question.\n",
      );
      continue;
    }
    if (!apply) {
      writeOut(
        `\n'${feed}' was answered: ${answer}. ` +
          "`dabbler deps feeds --apply` writes it into this repository.\n",
      );
      continue;
    }
    // The execution of the answer, not a second asking. The operator decided;
    // the framework does the typing, which is the whole point of asking.
    try {
      const path = declareFeed(root, { key: feed, value: answer });
      writeOut(`\nwrote '${feed}' = ${answer} to ${path}\n`);
      unresolved -= 1;
    } catch (error) {
      writeErr(
        `deps: could not declare '${feed}': ${
          error instanceof Error ? error.message : String(error)
        }\n`,
      );
    }
  }
  return unresolved === 0 ? EXIT_OK : EXIT_OK;
}

/** The operator's answer to a feed question, when they have given one. */
function answeredFeed(root: string, feed: string): string | null {
  for (const row of currentDecisions(root)) {
    if (String(row["id"]) !== `${ID_FEED_SOURCE}:${feed}`) continue;
    const answer = row["answer"];
    if (typeof answer !== "string" || !answer) return null;
    return answer === "leave it unconfigured" ? null : answer;
  }
  return null;
}

/**
 * Step into a dependency's source, reversibly.
 *
 * This is what git submodules were being considered for, and it delivers the
 * same thing without changing what git tracks: the producer is already on
 * this machine as a sibling checkout, and the reference points at it for as
 * long as the debugging lasts. The record makes it impossible to forget --
 * the run of record, packaging and the close all refuse until it is put back.
 */
function toSource(root: string, packageId: string): number {
  const deps = loadDeps(root);
  const edge = (deps?.consumes ?? []).find((candidate) => candidate.id === packageId);
  if (edge === undefined) {
    writeErr(
      `deps: ${DEPS_FILENAME} declares no edge for ${packageId}. Source mode ` +
        "switches a declared edge; an undeclared reference has no producer to " +
        "point at.\n",
    );
    return EXIT_REFUSED;
  }
  if (edge.kind !== "nuget") {
    // Maven's mechanism is install-to-local-repository, which is a build.
    writeErr(
      `deps: source mode is .NET only. Maven resolves a sibling by installing ` +
        "it into the local repository, and that is a build -- which this " +
        "framework declares and checks but never runs.\n",
    );
    return EXIT_REFUSED;
  }
  const where = locateProducer(root, edge.producedBy, deps?.solution ?? null);
  if (where.path === null) {
    writeErr(`deps: ${where.reason}\n`);
    return EXIT_REFUSED;
  }
  try {
    const swap = switchToSource(root, { packageId, producerRoot: where.path });
    writeOut(
      `${packageId} now resolves from source: ${swap.file} points at ` +
        `${swap.producerProject}\n` +
        "The original reference is recorded. The run of record, packaging and " +
        "the close refuse until `dabbler deps restore --package " +
        `${packageId}` +
        "` puts it back.\n",
    );
    return EXIT_OK;
  } catch (error) {
    if (!(error instanceof ResolutionError)) throw error;
    writeErr(`deps: refused -- ${error.message}\n`);
    return EXIT_REFUSED;
  }
}

/** Put a reference back exactly, or say why it cannot be. */
function fromSource(root: string, packageId: string | null): number {
  const active = sourceModeActive(root);
  if (active.length === 0) {
    writeOut("nothing is resolving from source\n");
    return EXIT_OK;
  }
  const wanted = packageId === null ? active.map((swap) => swap.packageId) : [packageId];
  let failed = 0;
  for (const id of wanted) {
    try {
      const swap = restoreFromSource(root, id);
      writeOut(`${id} restored in ${swap.file}\n`);
    } catch (error) {
      if (!(error instanceof ResolutionError)) throw error;
      failed += 1;
      writeErr(`deps: ${error.message}\n`);
    }
  }
  return failed === 0 ? EXIT_OK : EXIT_REFUSED;
}
