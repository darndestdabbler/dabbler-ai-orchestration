// `dabbler release` -- the one act in this framework that cannot be taken
// back, and therefore the one the operator alone authorises.
//
// A version pushed to a public registry is downloadable by everyone from that
// moment. npm refuses `unpublish` after 72 hours and treats it as a courtesy
// before that; a Marketplace version slot is never reusable. So this verb
// does not decide. It states what would ship and what a wrong answer costs,
// waits for an answer, and then does the typing -- because the operator
// deciding is not the same as the operator running a command, and every
// command a rule can determine belongs to the framework.
//
// **What it never does:** publish. It pushes an annotated tag, and CI's
// existing tag-driven workflows do the publishing with credentials this
// process never sees. There is no PAT here, no registry token, and no
// network call to a registry.

import { spawnSync } from "node:child_process";

import { repoRootFor, resolveSessionsDir, SessionsRootNotFoundError } from "../evidence.ts";
import { runGit } from "../journal.ts";
import {
  ID_PUBLICATION,
  OwedDecisionError,
  currentDecisions,
  raisePublicationDecision,
} from "../owedDecisions.ts";
import { readText } from "../textfile.ts";
import { writeErr, writeOut } from "./output.ts";

const EXIT_OK = 0;
const EXIT_REFUSED = 1;
const EXIT_USAGE = 2;

function usage(): string {
  return [
    "usage: dabbler release [-h] [--sessions-dir SESSIONS_DIR]",
    "                       [--dry-run] [--verify-install]",
    "",
    "  Tags the release the operator authorised, router before extension.",
    "  CI publishes from the tag; no credential is read or written here.",
    "",
    "options:",
    "  --dry-run                print what it would tag and stop",
    "  --verify-install         ask the public registry what it actually serves",
    "  --sessions-dir PATH      the sessions root; derived from the cwd when absent",
    "  -h, --help               show this message",
    "",
  ].join("\n");
}

/** The version a workspace package declares. */
export function packageVersion(repoRoot: string, relPath: string): string | null {
  try {
    const doc = JSON.parse(readText(`${repoRoot}/${relPath}`)) as { version?: string };
    return typeof doc.version === "string" ? doc.version : null;
  } catch {
    return null;
  }
}

/**
 * The tags an answer means, in the order they must be pushed.
 *
 * Router first, always. The extension bundles the router, so a Marketplace
 * version whose npm half is missing is the broken half-release -- somebody
 * installs the extension, it cannot resolve what it wraps, and the failure
 * looks like the extension's.
 */
export function tagsFor(
  answer: string,
  versions: { readonly router: string; readonly extension: string },
): string[] {
  if (answer === "release-candidate") return [`v${versions.router}-rc1`];
  if (answer === "publish") {
    return [`v${versions.router}`, `vsix-v${versions.extension}`];
  }
  return [];
}

export function releaseVerb(argv: string[]): Promise<number> {
  return Promise.resolve(run(argv));
}

function run(argv: string[]): number {
  if (argv.includes("-h") || argv.includes("--help")) {
    writeOut(usage());
    return EXIT_OK;
  }
  let sessionsDirArg: string | undefined;
  let dryRun = false;
  let verifyInstall = false;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--sessions-dir") {
      sessionsDirArg = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (token === "--verify-install") {
      verifyInstall = true;
      continue;
    }
    writeErr(`${usage()}dabbler release: unrecognized arguments: ${token}\n`);
    return EXIT_USAGE;
  }

  let root: string | null;
  try {
    root = repoRootFor(resolveSessionsDir(sessionsDirArg));
  } catch (error) {
    if (!(error instanceof SessionsRootNotFoundError)) throw error;
    writeErr(`release: ${error.message}\n`);
    return EXIT_USAGE;
  }
  if (root === null) {
    writeErr("release: not inside a git repository\n");
    return EXIT_USAGE;
  }

  const router = packageVersion(root, "packages/router/package.json");
  const extension = packageVersion(root, "tools/dabbler-ai-orchestration/package.json");
  if (router === null || extension === null) {
    writeErr(
      "release: this repository does not declare both a router and an " +
        "extension version, so there is nothing here to tag.\n",
    );
    return EXIT_REFUSED;
  }

  if (verifyInstall) return checkInstall(router);

  // Raised whether or not it is answered: the brief is how the operator finds
  // out there is something to decide.
  try {
    raisePublicationDecision(root, {
      routerVersion: router,
      extensionVersion: extension,
    });
  } catch (error) {
    if (!(error instanceof OwedDecisionError)) throw error;
  }

  const answer = answerTo(root, ID_PUBLICATION);
  if (answer === null) {
    writeOut(
      `release: dabbler-ai-router ${router} and dabbler-ai-orchestration ` +
        `${extension} are built and unpublished.\n` +
        "Nothing is tagged: publishing is the one act here that cannot be " +
        "taken back, so it waits for an answer rather than a default. " +
        "`dabbler owed list` has the brief -- what ships, where, and what a " +
        "wrong answer costs -- and `dabbler owed answer --id " +
        `${ID_PUBLICATION} --choice <...>` +
        "` settles it. The framework does the tagging from there.\n",
    );
    return EXIT_OK;
  }

  const tags = tagsFor(answer, { router, extension });
  if (tags.length === 0) {
    writeOut(
      `release: answered '${answer}', so nothing is tagged and nothing is ` +
        "published.\n",
    );
    return EXIT_OK;
  }

  writeOut(`release: '${answer}' means, in order:\n`);
  for (const tag of tags) writeOut(`  ${tag}\n`);
  if (dryRun) {
    writeOut("\n(--dry-run: nothing was tagged or pushed)\n");
    return EXIT_OK;
  }

  // The tree must be exactly what was verified. A tag naming a commit that
  // is not what the suite ran against is a release of something nobody
  // tested, and it is the release that is hardest to reason about later.
  const dirty = runGit(root, ["status", "--porcelain"]);
  if (dirty.code !== 0 || dirty.stdout.trim() !== "") {
    writeErr(
      "release: refused -- the working tree is not clean, so a tag here " +
        "would name a commit that is not what was verified. Nothing was " +
        "tagged.\n",
    );
    return EXIT_REFUSED;
  }

  for (const tag of tags) {
    const existing = runGit(root, ["tag", "--list", tag]);
    if (existing.code === 0 && existing.stdout.trim() === tag) {
      writeErr(
        `release: refused -- ${tag} already exists, and a version slot is ` +
          "never reusable. Nothing further was pushed.\n",
      );
      return EXIT_REFUSED;
    }
    const made = runGit(root, ["tag", "-a", tag, "-m", `Release ${tag}`]);
    if (made.code !== 0) {
      writeErr(`release: refused -- could not create ${tag}: ${made.stderr}\n`);
      return EXIT_REFUSED;
    }
    const pushed = runGit(root, ["push", "origin", tag]);
    if (pushed.code !== 0) {
      // The local tag is removed so a retry is not refused by its own
      // half-finished attempt.
      runGit(root, ["tag", "-d", tag]);
      writeErr(`release: refused -- could not push ${tag}: ${pushed.stderr}\n`);
      return EXIT_REFUSED;
    }
    writeOut(`release: pushed ${tag}\n`);
  }
  writeOut(
    "\nCI publishes from these tags. Watch the release workflow; when it is " +
      "green, `dabbler release --verify-install` is the check that the " +
      "registry actually serves it.\n",
  );
  return EXIT_OK;
}

/** The operator's answer to a decision, when they have given one. */
function answerTo(repoRoot: string, id: string): string | null {
  for (const row of currentDecisions(repoRoot)) {
    if (String(row["id"]) !== id) continue;
    const answer = row["answer"];
    return typeof answer === "string" && answer ? answer : null;
  }
  return null;
}

/**
 * Ask the public registry what it actually serves.
 *
 * The step that separates "CI went green" from "a new project can install
 * this". A workflow reporting success and a registry serving the version are
 * different facts, and set 133 already found the gap between them once: a
 * publish job stayed green while the package never reached one of its two
 * registries.
 *
 * A read, and only a read -- `npm view` fetches metadata and installs
 * nothing. Failure is REPORTED rather than thrown: a machine with no network
 * has not discovered anything about the registry, and saying so is different
 * from saying the version is missing.
 */
export function checkInstall(version: string): number {
  // A shell, because Node refuses to spawn a `.cmd` without one -- and ONE
  // command string rather than a shell plus arguments, which is the form
  // that concatenates unescaped. The only interpolated value is a version
  // read from package.json, and it is checked against a version's own shape
  // first: a string that is not one never reaches a command line.
  if (!/^[0-9][0-9A-Za-z.+-]*$/.test(version)) {
    writeErr(`release: '${version}' is not a version, so nothing was asked.
`);
    return EXIT_REFUSED;
  }
  const probe = spawnSync(
    `npm view dabbler-ai-router@${version} version --json`,
    { encoding: "utf8", shell: true, timeout: 60_000 },
  );
  const stdout = (probe.stdout ?? "").trim();
  if (probe.status === 0 && stdout.includes(version)) {
    writeOut(
      `release: the registry serves dabbler-ai-router@${version}. ` +
        "`npm i -g dabbler-ai-router` gets it.\n",
    );
    return EXIT_OK;
  }
  const detail = ((probe.stderr ?? "") + stdout).trim();
  if (/E404|not found|is not in this registry/i.test(detail)) {
    writeOut(
      `release: the registry does not serve dabbler-ai-router@${version} ` +
        "yet. If a release workflow just ran, it either has not finished or " +
        "went green without publishing -- which has happened before, and is " +
        "exactly why this check exists rather than trusting the job status.\n",
    );
    return EXIT_REFUSED;
  }
  writeOut(
    "release: could not reach the registry, which says nothing about " +
      `whether ${version} is published: ${detail || "no output"}\n`,
  );
  return EXIT_REFUSED;
}
