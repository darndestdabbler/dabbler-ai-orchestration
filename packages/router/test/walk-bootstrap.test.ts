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
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  MANAGED_START,
  declaresPackaging,
  detectEcosystems,
  detectPackaging,
} from "../src/bootstrap/index.ts";
import { bootstrapVerb } from "../src/cli/bootstrap.ts";
import { canonicalVersion, packageVersion, releaseVersion, tagsFor } from "../src/cli/release.ts";
import { capture } from "../src/output.ts";
import { ID_GIT_REMOTE, openDecisions } from "../src/owedDecisions.ts";
import { load as loadSolution } from "../src/solution.ts";
import { gitOut, makeRepo } from "./support/repo.ts";

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
  it("answers every question the framework can ask, from nothing, in one pass", async () => {
    const repo = makeRepo(PROJECT, { origin: true });
    const milestones: string[] = [];

    // --- before: the project is a repository and nothing else --------------
    assert.ok(!existsSync(join(repo, "AGENTS.md")));
    assert.ok(!existsSync(join(repo, ".gitignore")));
    assert.ok(!existsSync(join(repo, "dabbler.yaml")));
    assert.ok(!existsSync(join(repo, "solution.yaml")));
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
    // repository IS a one-component solution.
    const solution = loadSolution(repo);
    assert.equal(solution.components.length, 1);
    assert.equal(solution.components[0]?.kind, "integration");
    assert.ok(existsSync(join(repo, ".dabbler", "solution", "projection.json")));
    milestones.push("the Explorer has something to render");

    // --- what the framework is waiting on a person for ---------------------
    // This repository has an upstream, so the remote question is not asked.
    assert.ok(!openDecisions(repo).map((row) => String(row["id"])).includes(ID_GIT_REMOTE));
    milestones.push("nothing is owed that the repository already answered");

    // --- what setup left in git --------------------------------------------
    // It commits its own files and only those: the operator's README was
    // already committed, and nothing of theirs is staged.
    assert.equal(gitOut(repo, "status", "--porcelain", "-uall").trim(), "");
    assert.equal(gitOut(repo, "log", "-1", "--format=%s").trim(), "Set up Dabbler");
    const committed = gitOut(repo, "show", "--name-only", "--format=", "HEAD");
    assert.match(committed, /AGENTS\.md/);
    assert.ok(!committed.includes("README.md"));
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
});
