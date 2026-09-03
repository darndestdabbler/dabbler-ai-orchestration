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
// tag-driven workflow does the publishing with a credential this process
// never sees. There is no PAT here and no token; the only network call is
// the one `--verify-install` makes to ask what is actually served.
//
// **One artifact, since 2026-09-02.** There were two -- the router to npm
// and the extension to the Marketplace, in that order, because a Marketplace
// version whose npm half was missing is a broken half-release. npm is
// retired: the extension BUNDLES the router (`dist/dabbler.cjs` is the same
// command, and the terminal shim points at it), so `npm i -g` bought a CLI
// on a machine with no extension, which nothing here needs. In v1 the PyPI
// dependency was real, because a Python CLI had no other delivery route; the
// port removed it, and this verb stopped pretending otherwise.

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
    "  Tags the release the operator authorised: one tag, one artifact.",
    "  CI publishes from the tag; no credential is read or written here.",
    "",
    "options:",
    "  --dry-run                print what it would tag and stop",
    "  --verify-install         ask the Marketplace what it actually serves",
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

/** What the extension declares it takes from the router, or null. */
export function declaredRouterDependency(repoRoot: string): string | null {
  try {
    const doc = JSON.parse(
      readText(`${repoRoot}/tools/dabbler-ai-orchestration/package.json`),
    ) as { dependencies?: Record<string, string> };
    return doc.dependencies?.["dabbler-ai-router"] ?? null;
  } catch {
    return null;
  }
}

/** One version, or the sentence saying why this repository does not have one. */
export interface ReleaseVersion {
  readonly version: string | null;
  readonly reason: string;
}

/** What `version.json` declares, or null when it declares nothing usable. */
export function canonicalVersion(repoRoot: string): string | null {
  try {
    const doc = JSON.parse(readText(`${repoRoot}/version.json`)) as { version?: unknown };
    const declared = doc.version;
    return typeof declared === "string" && /^\d+\.\d+\.\d+(-[\w.]+)?$/.test(declared)
      ? declared
      : null;
  } catch {
    return null;
  }
}

/**
 * The repository's ONE version, and whether every manifest carries it.
 *
 * The router used to carry its own number and the extension another -- an
 * install showed router 2.0.0 beside extension 2.7.0, which is two things
 * where the operator has one. `version.json` is now the source and nothing
 * else is authored: `npm run stamp:version` writes it into both manifests,
 * the extension's dependency on the router, and the lock file.
 *
 * This asks whether that stamping is current, and `dabbler release` asks it
 * before it tags -- because a stale manifest is exactly the thing that would
 * otherwise become public as two artifacts nobody can say the version of.
 * The remedy is named rather than left to be worked out: three literals
 * hand-synchronised is the state this replaced.
 */
export function releaseVersion(repoRoot: string): ReleaseVersion {
  const canonical = canonicalVersion(repoRoot);
  if (canonical === null) {
    return {
      version: null,
      reason:
        "version.json does not declare a version, and it is the one file that " +
        "does: every manifest is stamped from it by `npm run stamp:version`",
    };
  }
  const stale: string[] = [];
  const router = packageVersion(repoRoot, "packages/router/package.json");
  const extension = packageVersion(
    repoRoot,
    "tools/dabbler-ai-orchestration/package.json",
  );
  if (router !== canonical) stale.push(`packages/router/package.json declares ${router}`);
  if (extension !== canonical) {
    stale.push(`tools/dabbler-ai-orchestration/package.json declares ${extension}`);
  }
  // Exactly, and it must be there. The extension BUNDLES the router, so a
  // dependency naming any other version is a Marketplace build wrapping
  // something else -- and a range that merely contains the number ("^2.0.0"
  // for 2.8.0, or 12.8.0 for 2.8.0) is not this version being named.
  const dependency = declaredRouterDependency(repoRoot);
  if (dependency !== canonical) {
    stale.push(
      `the extension depends on dabbler-ai-router ${dependency ?? "nothing"}`,
    );
  }
  if (stale.length > 0) {
    return {
      version: null,
      reason:
        `version.json declares ${canonical}, and ${stale.join("; ")}. ` +
        "Run `npm run stamp:version` -- the manifests are stamped from that " +
        "file, never edited beside it",
    };
  }
  return { version: canonical, reason: "" };
}

/**
 * The tag an answer means. One, because there is one artifact.
 *
 * There were two until 2026-09-02, and an ORDER between them: the router to
 * npm first and the extension after, because the extension bundles the
 * router and a Marketplace version whose npm half was missing would be the
 * broken half-release. npm is retired -- the extension IS the distribution,
 * and `dist/dabbler.cjs` ships inside it -- so there is no half that can be
 * missing and nothing left to sequence.
 */
export function tagsFor(answer: string, version: string): string[] {
  if (answer === "release-candidate") return [`vsix-v${version}-rc1`];
  if (answer === "publish") return [`vsix-v${version}`];
  return [];
}

export function releaseVerb(argv: string[]): Promise<number> {
  return run(argv);
}

// Async only because the Marketplace check is a network read; every other
// path answers without awaiting anything.
async function run(argv: string[]): Promise<number> {
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

  // One version, asked once. Both tags, the brief and the install check are
  // built from it, so a repository whose halves disagree gets no further
  // than this sentence.
  const agreed = releaseVersion(root);
  if (agreed.version === null) {
    writeErr(`release: refused -- ${agreed.reason}.\n`);
    return EXIT_REFUSED;
  }
  const version = agreed.version;

  if (verifyInstall) return checkInstall(version);

  // Raised whether or not it is answered: the brief is how the operator finds
  // out there is something to decide.
  try {
    raisePublicationDecision(root, { version });
  } catch (error) {
    if (!(error instanceof OwedDecisionError)) throw error;
  }

  const answer = answerTo(root, ID_PUBLICATION);
  if (answer === null) {
    writeOut(
      `release: dabbler-ai-orchestration ${version} is built and unpublished.\n` +
        "Nothing is tagged: publishing is the one act here that cannot be " +
        "taken back, so it waits for an answer rather than a default. " +
        "`dabbler owed list` has the brief -- what ships, where, and what a " +
        "wrong answer costs -- and `dabbler owed answer --id " +
        `${ID_PUBLICATION} --choice <...>` +
        "` settles it. The framework does the tagging from there.\n",
    );
    return EXIT_OK;
  }

  const tags = tagsFor(answer, agreed.version);
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
    const already = runGit(root, ["tag", "--list", tag]).stdout.trim() === tag;
    if (already) {
      // Resumable. A run that pushed the router tag and then failed on the
      // extension must be able to finish: refusing on "the router tag
      // exists" would leave the recovery to somebody typing git commands,
      // which is the state this verb exists to end.
      writeOut(`release: ${tag} already exists; continuing from there\n`);
    } else {
      const made = runGit(root, ["tag", "-a", tag, "-m", `Release ${tag}`]);
      if (made.code !== 0) {
        writeErr(`release: refused -- could not create ${tag}: ${made.stderr}\n`);
        return EXIT_REFUSED;
      }
      const pushed = runGit(root, ["push", "origin", tag]);
      if (pushed.code !== 0) {
        // The local tag goes with it, so a retry is not refused by its own
        // half-finished attempt.
        runGit(root, ["tag", "-d", tag]);
        writeErr(`release: refused -- could not push ${tag}: ${pushed.stderr}\n`);
        return EXIT_REFUSED;
      }
      writeOut(`release: pushed ${tag}\n`);
    }
  }
  writeOut(
    "\nCI publishes from this tag, and the `marketplace` environment asks a " +
      "person to approve the job before it runs. `dabbler release " +
      "--verify-install` then asks the Marketplace what it actually serves, " +
      "which is the check that a green workflow and a published extension " +
      "are the same fact.\n",
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
 * The extension identity the Marketplace knows this product by.
 *
 * Publisher and name, exactly as `package.json` declares them, because that
 * pair is what a `vsix-v*` tag publishes and what an operator installs.
 */
export const MARKETPLACE_ID = "darndestdabbler.dabbler-ai-orchestration";

const MARKETPLACE_QUERY =
  "https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery";

/**
 * The versions the Marketplace says it serves, newest first, from its own
 * answer.
 *
 * Split out as a pure function so the SUITE can hold the parsing over a
 * canned payload while the check itself reaches the network: a test that
 * asked the Marketplace would be a test of the Marketplace.
 */
export function servedVersions(payload: unknown): string[] | null {
  const results = (payload as { results?: unknown[] })?.results;
  // Null and not an empty list: an answer this reader does not recognise
  // says nothing about what is published, and "the Marketplace serves no
  // version" is a claim. A changed schema would otherwise be reported as a
  // missing release, which is the wrong thing to tell somebody mid-release.
  if (!Array.isArray(results)) return null;
  const first = results[0];
  const extensions = (first as { extensions?: unknown[] })?.extensions;
  if (first !== undefined && !Array.isArray(extensions)) return null;
  const extension = Array.isArray(extensions) ? extensions[0] : undefined;
  const versions = (extension as { versions?: unknown[] })?.versions;
  // A query that matched no extension answers with no rows, and that IS
  // "serves nothing" rather than an unreadable answer.
  if (extension === undefined) return [];
  if (!Array.isArray(versions)) return null;
  return versions
    .map((entry) => (entry as { version?: unknown })?.version)
    .filter((version): version is string => typeof version === "string" && version !== "");
}

/**
 * Ask the Marketplace what it actually serves.
 *
 * The step that separates "CI went green" from "somebody can install this".
 * A workflow reporting success and a registry serving the version are
 * different facts, and set 133 found the gap between them once already: a
 * publish job stayed green while the package never reached one of its
 * registries. This asked npm until 2026-09-02; npm is retired, and the
 * Marketplace is the registry this product has.
 *
 * A read, and only a read. Failure to REACH the Marketplace is reported as
 * exactly that: a machine with no network has discovered nothing about what
 * is published, which is a different sentence from "the version is missing".
 */
export async function checkInstall(version: string): Promise<number> {
  let payload: unknown;
  try {
    const response = await fetch(MARKETPLACE_QUERY, {
      method: "POST",
      headers: {
        // The gallery API answers only to a version it knows; 3.0-preview.1
        // is what `vsce` itself asks for.
        Accept: "application/json;api-version=3.0-preview.1",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filters: [
          {
            criteria: [{ filterType: 7, value: MARKETPLACE_ID }],
            pageNumber: 1,
            pageSize: 1,
          },
        ],
        // 0x1 (versions) + 0x2 (files) is what a version listing needs; the
        // flags are a bitmask the gallery defines and `vsce` uses the same.
        flags: 0x1,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      writeOut(
        `release: the Marketplace answered ${response.status} for ` +
          `${MARKETPLACE_ID}, so nothing was learned about what it serves.\n`,
      );
      return EXIT_REFUSED;
    }
    payload = await response.json();
  } catch (error) {
    writeOut(
      "release: the Marketplace could not be reached, so nothing was learned " +
        `about what it serves: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return EXIT_REFUSED;
  }

  const served = servedVersions(payload);
  if (served === null) {
    // An answer this reader cannot make sense of establishes nothing about
    // what is published. Reporting it as "no version is served" would tell
    // an operator mid-release that their publish failed, on the evidence of
    // a schema change.
    writeOut(
      "release: the Marketplace answered in a shape this reader does not " +
        "recognise, so nothing was learned about what it serves. That is not " +
        "the same as it serving nothing.\n",
    );
    return EXIT_REFUSED;
  }
  if (served.length === 0) {
    writeOut(
      `release: the Marketplace serves no version of ${MARKETPLACE_ID}. If a ` +
        "publish workflow just ran, it either has not finished, is waiting " +
        "for the environment's approval, or went green without publishing -- " +
        "which has happened before, and is why this asks the Marketplace " +
        "rather than trusting a job status.\n",
    );
    return EXIT_REFUSED;
  }
  if (!served.includes(version)) {
    writeOut(
      `release: the Marketplace serves ${served[0]} for ${MARKETPLACE_ID}, and ` +
        `this repository builds ${version}. What is published is not what is ` +
        "here.\n",
    );
    return EXIT_REFUSED;
  }
  writeOut(
    `release: the Marketplace serves ${version} for ${MARKETPLACE_ID}. It is ` +
      "installable, and the CLI ships inside it.\n",
  );
  return EXIT_OK;
}
