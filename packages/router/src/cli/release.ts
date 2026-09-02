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
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { repoRootFor, resolveSessionsDir, SessionsRootNotFoundError } from "../evidence.ts";
import { hiddenSpawn, runGit } from "../journal.ts";
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
 * The tags an answer means, in the order they must be pushed.
 *
 * Router first, always. The extension bundles the router, so a Marketplace
 * version whose npm half is missing is the broken half-release -- somebody
 * installs the extension, it cannot resolve what it wraps, and the failure
 * looks like the extension's.
 */
export function tagsFor(answer: string, version: string): string[] {
  if (answer === "release-candidate") return [`v${version}-rc1`];
  if (answer === "publish") return [`v${version}`, `vsix-v${version}`];
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

  // One version, asked once. Both tags, the brief and the install check are
  // built from it, so a repository whose halves disagree gets no further
  // than this sentence.
  const agreed = releaseVersion(root);
  if (agreed.version === null) {
    writeErr(`release: refused -- ${agreed.reason}.\n`);
    return EXIT_REFUSED;
  }
  const router = agreed.version;
  const extension = agreed.version;

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

    // The ORDER is a publication order, not a tagging order. Two
    // tag-triggered workflows start within seconds of each other and finish
    // whenever they finish -- the Marketplace one can win, or can succeed
    // while npm's fails -- and either leaves the immutable extension version
    // public without the router it wraps. So the extension tag is not pushed
    // until npm actually serves the router.
    if (tag.startsWith("vsix-")) continue;
    if (tags.some((other) => other.startsWith("vsix-"))) {
      writeOut(
        `release: waiting for npm to serve dabbler-ai-router@${router} before ` +
          "tagging the extension\n",
      );
      const served = awaitPublication(router);
      if (!served) {
        writeErr(
          `release: refused -- npm does not serve dabbler-ai-router@${router} ` +
            "yet, so the extension tag was NOT pushed. Nothing is lost: the " +
            "router tag is pushed and its workflow may still be running. Run " +
            "`dabbler release` again when it is green, and it continues from " +
            "here.\n",
        );
        return EXIT_REFUSED;
      }
      writeOut(`release: npm serves dabbler-ai-router@${router}\n`);
    }
  }
  writeOut(
    "\nCI publishes from these tags. `dabbler release --verify-install` " +
      "installs the unqualified package in a clean environment, which is the " +
      "check that a green workflow and a working `npm i` are the same fact.\n",
  );
  return EXIT_OK;
}

/**
 * Whether npm serves this version yet, waiting a bounded while for it.
 *
 * Publication is not instantaneous and a registry read is cheap, so this
 * polls rather than asking once and giving up. Bounded because a wait with no
 * end is a command that appears to hang: it gives up and says so, and the
 * verb is resumable from exactly there.
 */
function awaitPublication(version: string, attempts = 20, waitMs = 15_000): boolean {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (registryServes(version)) return true;
    if (attempt + 1 < attempts) sleep(waitMs);
  }
  return false;
}

/** Block this process for a while, with nothing else to do. */
function sleep(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
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
  // The UNQUALIFIED name, from an explicitly named public registry, into a
  // prefix and cache that exist only for this check. That is the whole
  // point: `npm view <pkg>@<version>` answers a question nobody asked --
  // metadata can be present while `latest` is unset, while a dependency does
  // not resolve, while an install script fails, or while the only registry
  // serving it is one this machine happens to have configured. The command
  // the operator will actually type is `npm i -g dabbler-ai-router`, so that
  // is the command that gets run.
  const prefix = mkdtempSync(join(tmpdir(), "dabbler-install-"));
  const cache = mkdtempSync(join(tmpdir(), "dabbler-cache-"));
  const install = spawnSync(
    "npm install --global dabbler-ai-router " +
      `--registry=${PUBLIC_REGISTRY} --prefix="${prefix}" --cache="${cache}" ` +
      "--no-audit --no-fund",
    hiddenSpawn({ encoding: "utf8" as const, shell: true, timeout: 300_000 }),
  );
  const noise = `${install.stdout ?? ""}${install.stderr ?? ""}`.trim();
  if (install.status !== 0) {
    if (/E404|not found/i.test(noise)) {
      writeOut(
        "release: the public registry does not serve dabbler-ai-router yet, " +
          "so `npm i -g dabbler-ai-router` still fails. If a release " +
          "workflow just ran, it either has not finished or went green " +
          "without publishing -- which has happened before, and is why this " +
          "installs rather than trusting a job status.\n",
      );
      return EXIT_REFUSED;
    }
    writeOut(
      `release: \`npm i -g dabbler-ai-router\` FAILED against the public ` +
        `registry:\n${noise || "no output"}\n`,
    );
    return EXIT_REFUSED;
  }

  // What actually landed, which is not necessarily what was asked for: an
  // unmoved `latest` serves an older version to a command naming none.
  const installed = installedVersion(prefix);
  if (installed === null) {
    writeOut(
      "release: the install reported success and no dabbler-ai-router is in " +
        `the prefix it installed into. That is a broken package, not a ` +
        `missing one:\n${noise || "no output"}\n`,
    );
    return EXIT_REFUSED;
  }
  if (installed !== version) {
    writeOut(
      `release: \`npm i -g dabbler-ai-router\` installs ${installed}, and this ` +
        `repository builds ${version}. The publish moved metadata without ` +
        "moving `latest`, so a new project still does not get this " +
        "version.\n",
    );
    return EXIT_REFUSED;
  }
  writeOut(
    `release: \`npm i -g dabbler-ai-router\` installs ${installed} from ` +
      `${PUBLIC_REGISTRY} in a clean environment. A new project can install ` +
      "it.\n",
  );
  return EXIT_OK;
}

/** npmjs.org by name, so a configured private mirror cannot answer for it. */
const PUBLIC_REGISTRY = "https://registry.npmjs.org/";

/** The version that actually landed in an install prefix, if one did. */
function installedVersion(prefix: string): string | null {
  for (const relative_ of [
    ["lib", "node_modules", "dabbler-ai-router", "package.json"],
    ["node_modules", "dabbler-ai-router", "package.json"],
  ]) {
    const path = join(prefix, ...relative_);
    if (!existsSync(path)) continue;
    try {
      const doc = JSON.parse(readText(path)) as { version?: string };
      if (typeof doc.version === "string") return doc.version;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Whether the public registry serves this version, asked once.
 *
 * A metadata read, used only to decide whether the extension tag may follow
 * the router's. It is deliberately NOT what `--verify-install` does: metadata
 * being present is a weaker fact than an install working, and the two
 * questions are different.
 */
function registryServes(version: string): boolean {
  if (!/^[0-9][0-9A-Za-z.+-]*$/.test(version)) return false;
  const probe = spawnSync(
    `npm view dabbler-ai-router@${version} version --registry=${PUBLIC_REGISTRY}`,
    hiddenSpawn({ encoding: "utf8" as const, shell: true, timeout: 60_000 }),
  );
  return probe.status === 0 && (probe.stdout ?? "").includes(version);
}
