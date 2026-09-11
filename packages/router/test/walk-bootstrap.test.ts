// The first day of a project, walked.
//
// One directory that has nothing but a git repository and the two build
// files a real project would already have. It is bootstrapped, and then
// every question the framework can answer about it is asked in the order a
// project meets them: what guidance the engines read, what git ignores, what
// guards a commit, what the repository says its tests are, what it says it
// publishes, what the Solution Explorer renders, and what a release would
// tag.
//
// Each of those has its own test elsewhere. What none of them can show is
// that ONE directory answers all of them, from nothing, in one pass -- which
// is what a person setting up a project actually does.
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  MANAGED_START,
  declaresPackaging,
  detectEcosystems,
  detectPackaging,
} from "../src/bootstrap/index.ts";
import { bootstrapVerb } from "../src/cli/bootstrap.ts";
import { sessionsDirFor } from "../src/evidence.ts";
import { materialWorktreeChanges } from "../src/gates.ts";
import { canonicalVersion, packageVersion, releaseVersion, tagsFor } from "../src/packaging.ts";
import { capture } from "../src/output.ts";
import { ID_GIT_REMOTE, openDecisions } from "../src/owedDecisions.ts";
import { solutionShape } from "../src/modules.ts";
import { CATALOG_FILENAME } from "../src/catalog.ts";
import { RECORD_CATALOG } from "../src/discovery.ts";
import { git, gitOut, makeRepo, scratchDir, writeFiles } from "./support/repo.ts";

/**
 * A .NET library that means to be published, and a Python suite beside it:
 * two ecosystems, so what is detected is a reading rather than a guess at
 * the one language a fixture happened to use.
 */
const PROJECT: Record<string, string> = {
  "Acme.Csv.csproj":
    "<Project><PropertyGroup><PackageId>Acme.Csv</PackageId>" +
    "<TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>",
  "pytest.ini": "[pytest]\n",
  "src/acme/__init__.py": "VALUE = 1\n",
  "README.md": "# acme-csv\n\nThe operator's own words, which nothing may touch.\n",
};

describe("a project on its first day", () => {
  it("initialises the repository it needs when the folder has none, and commits its scaffold into it", async () => {
    // A folder that has not been `git init`ed is the ordinary state of a
    // project on its first day; three trial runs did the init by hand after
    // every verb had refused with a flag that could not help.
    const folder = scratchDir("fresh-");
    writeFiles(folder, { "README.md": PROJECT["README.md"]! });
    git(folder, "--version"); // pins the suite's git identity for the child
    assert.ok(!existsSync(join(folder, ".git")));

    const setup = await capture(() =>
      bootstrapVerb(["--project-dir", folder, "--no-transport-detect"]),
    );
    assert.equal(setup.value, 0, setup.stderr);
    assert.match(setup.stdout, /initialised a git repository/);
    assert.match(setup.stdout, /remote/);
    assert.ok(existsSync(join(folder, ".git")));
    assert.match(gitOut(folder, "log", "--oneline"), /Set up Dabbler/);
    assert.equal(gitOut(folder, "status", "--porcelain", "--", "AGENTS.md"), "");
  });

  it("answers every question the framework can ask, from nothing, in one pass", async () => {
    const repo = makeRepo(PROJECT, { origin: true });
    const milestones: string[] = [];

    // --- before: the project is a repository and nothing else --------------
    assert.ok(!existsSync(join(repo, "AGENTS.md")));
    assert.ok(!existsSync(join(repo, ".gitignore")));
    assert.ok(!existsSync(join(repo, "dabbler.yaml")));
    assert.ok(!existsSync(join(repo, "docs", "modules.yaml")));
    // A clone made before round refs existed carries neither refspec; the
    // assertion after setup is then a claim about setup and not the fixture.
    assert.ok(
      !gitOut(repo, "config", "--get-all", "remote.origin.fetch").includes("dabbler/rounds"),
    );
    // And the operator has work of their own in progress, uncommitted.
    writeFileSync(join(repo, "mine.txt"), "the operator's own work\n", "utf8");
    milestones.push("nothing yet");

    // --- the bootstrap ------------------------------------------------------
    const setup = await capture(() =>
      bootstrapVerb(["--project-dir", repo, "--no-transport-detect"]),
    );
    assert.equal(setup.value, 0, setup.stderr);
    milestones.push("bootstrapped");

    // --- what the engines read ---------------------------------------------
    // One body, in AGENTS.md, imported by the other two: Copilot loads all
    // three at once and de-duplicates nothing.
    for (const name of ["AGENTS.md", "CLAUDE.md", "GEMINI.md"]) {
      assert.ok(existsSync(join(repo, name)), name);
      assert.ok(readFileSync(join(repo, name), "utf8").includes(MANAGED_START), name);
    }
    const agents = readFileSync(join(repo, "AGENTS.md"), "utf8");
    assert.match(agents, /dabbler session next/);
    for (const name of ["CLAUDE.md", "GEMINI.md"]) {
      assert.match(readFileSync(join(repo, name), "utf8"), /@AGENTS\.md/);
    }
    // And the operator's own file is exactly as they left it.
    assert.equal(
      readFileSync(join(repo, "README.md"), "utf8"),
      PROJECT["README.md"],
    );
    milestones.push("the engines have one body to read");

    // --- what git ignores, and what guards a commit ------------------------
    assert.match(readFileSync(join(repo, ".gitignore"), "utf8"), /\.dabbler\//);
    const hook = join(repo, ".git", "hooks", "pre-commit");
    assert.ok(existsSync(hook));
    assert.match(readFileSync(hook, "utf8"), /dabbler verify step guard-commit/);
    milestones.push("the machine's own files are ignored and commits are guarded");

    // --- what the repository says its tests are ----------------------------
    // Read from the build files that were already there, both of them.
    const ecosystems = detectEcosystems(repo).map((found) => found.key);
    assert.ok(ecosystems.includes("dotnet"), ecosystems.join(","));
    assert.ok(ecosystems.includes("python"), ecosystems.join(","));
    const declared = readFileSync(join(repo, "dabbler.yaml"), "utf8");
    assert.match(declared, /name: python/);
    // Every path is mapped, because a path no rule covers is
    // `selection_unknown` and pre-verification fails closed.
    assert.match(declared, /repo_wide/);
    milestones.push("its suites are declared from what it holds");

    // --- what it says it publishes -----------------------------------------
    // The .csproj declares package metadata, so there IS a recipe -- and it
    // is not written into the declaration, because which feed and which
    // credential is the operator's to say.
    const publishing = detectPackaging(repo);
    assert.equal(publishing.recipe?.key, "dotnet");
    assert.ok(publishing.recipe?.pack.includes("{output}"));
    assert.equal(declaresPackaging(repo), false);
    milestones.push("what it would publish is readable, and undeclared");

    // --- what the Solution Explorer renders --------------------------------
    // The view was empty in every new project and explained nothing. A fresh
    // repository IS a one-module solution, and one module is the shape in
    // which nothing module-shaped switches on.
    const shape = solutionShape(repo);
    assert.equal(shape.multi, false);
    assert.equal(shape.modules.length, 1);
    assert.equal(shape.modules[0]?.kind, "application");
    assert.ok(existsSync(join(repo, ".dabbler", "solution", "projection.json")));
    milestones.push("the Explorer has something to render");

    // --- what the framework is waiting on a person for ---------------------
    // This repository has an upstream, so the remote question is not asked.
    assert.ok(!openDecisions(repo).map((row) => String(row["id"])).includes(ID_GIT_REMOTE));
    milestones.push("nothing is owed that the repository already answered");

    // --- what setup left in git --------------------------------------------
    // It commits its own files and only those: the operator's README was
    // already committed, their work in progress is still theirs and
    // untracked, and nothing of theirs is staged. It used to print "commit
    // what this just wrote" -- asking the operator to run a command it
    // could run, knowing session 1 would be refused while the files sat.
    assert.equal(gitOut(repo, "status", "--porcelain", "-uall").trim(), "?? mine.txt");
    assert.equal(gitOut(repo, "log", "-1", "--format=%s").trim(), "Set up Dabbler");
    const committed = gitOut(repo, "show", "--name-only", "--format=", "HEAD");
    assert.match(committed, /AGENTS\.md/);
    assert.ok(!committed.includes("README.md"));
    assert.ok(!committed.includes("mine.txt"));
    // And the clone is taught to fetch and push round baselines: re-running
    // setup is the migration for a clone made before round refs existed.
    assert.match(
      gitOut(repo, "config", "--get-all", "remote.origin.fetch"),
      /refs\/dabbler\/rounds/,
    );
    milestones.push("setup committed its own work");

    // --- what a release would tag ------------------------------------------
    // Nothing here is a release: the project declares no version, so there
    // is no version to tag and the reason says so rather than inventing one.
    const planned = releaseVersion(repo);
    assert.equal(planned.version, null);
    assert.notEqual(planned.reason, "");
    assert.equal(packageVersion(repo, "package.json"), null);
    assert.equal(canonicalVersion(repo), null);
    // And an answer nobody gave tags nothing at all.
    assert.deepEqual(tagsFor("not yet", "2.0.0"), []);
    milestones.push("a release names nothing, because nothing declares a version");

    assert.deepEqual(milestones, [
      "nothing yet",
      "bootstrapped",
      "the engines have one body to read",
      "the machine's own files are ignored and commits are guarded",
      "its suites are declared from what it holds",
      "what it would publish is readable, and undeclared",
      "the Explorer has something to render",
      "nothing is owed that the repository already answered",
      "setup committed its own work",
      "a release names nothing, because nothing declares a version",
    ]);
  });

  it("commits the modules manifest the operator declared before running it", async () => {
    // The order both walkthroughs teach: declare the modules, then set the
    // project up. The manifest is on disk and untracked when bootstrap
    // runs, so it is in nothing bootstrap wrote -- and session 1 is then
    // refused by the very tree this command has just called clean.
    const repo = makeRepo(PROJECT, { origin: true });
    writeFiles(repo, {
      "docs/modules.yaml":
        "modules:\n- slug: acme-csv\n  title: acme-csv\n  kind: application\n  codeRoots:\n  - '.'\n",
    });
    assert.equal(
      gitOut(repo, "status", "--porcelain", "--", "docs/modules.yaml").trim(),
      "?? docs/modules.yaml",
    );

    const setup = await capture(() =>
      bootstrapVerb(["--project-dir", repo, "--no-transport-detect"]),
    );
    assert.equal(setup.value, 0, setup.stderr);

    assert.match(gitOut(repo, "show", "--name-only", "--format=", "HEAD"), /docs\/modules\.yaml/);
    // And the sentence it prints about session 1 is true of the tree it is
    // standing in, which is the whole of what was wrong.
    assert.deepEqual(materialWorktreeChanges(sessionsDirFor(repo)).paths, []);
  });

  it("records the remote it is given and leaves the branch tracking it", async () => {
    // The one parameter the framework cannot determine. Nothing in the UI
    // asked for it, and the close's push, the close's pull-forward and
    // every focused clone all read it.
    const folder = scratchDir("remote-");
    writeFiles(folder, { "README.md": PROJECT["README.md"]! });
    const bare = join(scratchDir("bare-"), "origin.git");
    git(folder, "--version"); // pins the suite's git identity for the children
    git(folder, "init", "-q", "--bare", bare);

    const setup = await capture(() =>
      bootstrapVerb(["--project-dir", folder, "--no-transport-detect", "--remote", bare]),
    );
    assert.equal(setup.value, 0, setup.stderr);

    assert.equal(gitOut(folder, "remote", "get-url", "origin"), bare);
    const branch = gitOut(folder, "symbolic-ref", "--short", "HEAD");
    assert.equal(gitOut(folder, "rev-parse", "--abbrev-ref", `${branch}@{upstream}`), `origin/${branch}`);
    assert.equal(gitOut(bare, "rev-parse", `refs/heads/${branch}`), gitOut(folder, "rev-parse", "HEAD"));
  });

  it("puts the choice of trunk to the operator when the host's default is not the branch it just pushed", async () => {
    // The earliest this is visible: the host's answer and the operator's are
    // both known for the first time. A repository initialised on one branch
    // and filled on another leaves a default nobody re-points, and every
    // later reader of it -- the close's push, a focused clone -- inherits it.
    const folder = scratchDir("default-");
    writeFiles(folder, { "README.md": PROJECT["README.md"]! });
    const bare = join(scratchDir("bare-default-"), "origin.git");
    git(folder, "--version");
    git(folder, "init", "-q", "--bare", bare);
    // The host holds a branch of its own and calls it the default.
    const seed = scratchDir("seed-");
    writeFiles(seed, { "README.md": "# placeholder\n" });
    git(seed, "init", "-q", "-b", "placeholder");
    git(seed, "add", "-A");
    git(seed, "commit", "-q", "-m", "Added README.md");
    git(seed, "push", "-q", bare, "placeholder");
    git(bare, "symbolic-ref", "HEAD", "refs/heads/placeholder");

    const setup = await capture(() =>
      bootstrapVerb(["--project-dir", folder, "--no-transport-detect", "--remote", bare]),
    );
    assert.equal(setup.value, 0, setup.stderr);

    const branch = gitOut(folder, "symbolic-ref", "--short", "HEAD");
    assert.match(setup.stderr, /origin's default branch is 'placeholder'/);
    assert.match(setup.stderr, new RegExp(`this project is on '${branch}'`));
    // The two were never one history.
    assert.match(setup.stderr, /share no history/);
    // BOTH answers are offered, each with the command that carries it out:
    // which branch is the trunk is the operator's to say, and a framework
    // that picked would be spelling a branch name on their behalf.
    assert.match(setup.stderr, new RegExp(`retrunk --to ${branch} --approve`));
    assert.match(setup.stderr, /retrunk --to placeholder --approve/);
    // And they are not the same act: keeping the host's branch means the
    // work is force-pushed over it, which the prompt names rather than
    // leaving the operator to discover once approved.
    assert.match(setup.stderr, /FORCE-PUSH/);
    assert.match(setup.stderr, /--rewrite-history/);
  });

  it("names this machine's own catalog in the discovery line, and no project's", async () => {
    // D264 was this line naming the working directory's `.dabbler` on a
    // `--project-dir` run, reporting on a folder the command had been told
    // not to act on. The defect cannot recur: a catalog is a reading of the
    // MACHINE -- its seat, its keys -- and has no project directory to take
    // the wrong one of.
    const repo = makeRepo(PROJECT, { origin: true });

    const setup = await capture(() =>
      bootstrapVerb(["--project-dir", repo, "--no-transport-detect"]),
    );
    assert.equal(setup.value, 0, setup.stderr);

    const line = setup.stdout
      .split(/\r?\n/)
      .find((each) => each.startsWith(`discovery: ${RECORD_CATALOG}:`));
    assert.ok(line !== undefined, `no api-enumeration line in:\n${setup.stdout}`);
    assert.ok(line.includes(CATALOG_FILENAME), `the line names no catalog: ${line}`);
    assert.ok(!line.includes(join(repo, ".dabbler")), line);
    assert.ok(!line.includes(join(process.cwd(), ".dabbler")), line);
  });
});
