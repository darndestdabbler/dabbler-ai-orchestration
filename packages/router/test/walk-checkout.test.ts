// One module's focused checkout, made over a real bare origin: the cone on
// disk, the sibling's source neither on disk nor in the object store, the
// files written at the clone's root and kept out of its tracked set, and a
// reset that narrows a widened cone again.
//
// A walkthrough, because the thing under test IS git's partial clone and
// sparse checkout; a scripted git would test the script.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";

import { CLAUDE_LOCAL_SETTINGS, openModule } from "../src/checkout.ts";
import { solutionShape } from "../src/modules.ts";
import { git, gitOut, makeRepo, scratchDir } from "./support/repo.ts";

const MANIFEST = [
  "modules:",
  "- slug: model",
  "  package: CsvModel",
  "  codeRoots:",
  "  - modules/model",
  "- slug: persister",
  "  package: CsvPersister",
  "  dependsOn:",
  "  - model",
  "  codeRoots:",
  "  - modules/persister",
  "",
].join("\n");

const repo = makeRepo(
  {
    "docs/modules.yaml": MANIFEST,
    "docs/sessions/session-plan.md": "# plan\n",
    "global.json": "{}\n",
    "Directory.Packages.props": "<Project />\n",
    "nuget.config": "<configuration />\n",
    "modules/model/src/CsvModel/CsvModel.csproj": "<Project />\n",
    "modules/model/src/CsvModel/Person.cs": "public sealed class Person {}\n",
    "modules/model/contract/README.md": "# CsvModel\n",
    "modules/persister/src/CsvPersister/CsvPersister.csproj": "<Project />\n",
    "modules/persister/tests/CsvPersister.Tests/CsvPersister.Tests.csproj": "<Project />\n",
    "packages/CsvModel.0.1.0.nupkg": "stands in for the package\n",
  },
  { origin: true },
);
// The origin honours --filter, as GitHub and Azure DevOps do; a bare
// repository does not until told to.
git(join(dirname(repo), "remote.git"), "config", "uploadpack.allowFilter", "true");

describe("a module opened in its focused checkout", () => {
  it("holds the cone and the root files, not the sibling's source or its blobs; writes and excludes its root files; and a reset narrows a widened cone again", () => {
    const clone = join(scratchDir("focused-"), "repo.persister");
    const shape = solutionShape(repo);
    const opened = openModule(repo, shape, "persister", { clonePath: clone });

    assert.equal(opened.path, clone);
    assert.equal(opened.branch, "main");
    assert.equal(opened.trunk, "main");
    assert.equal(opened.reset, false);
    assert.deepEqual(opened.cone, ["docs", "modules/model/contract", "modules/persister", "packages"]);
    assert.equal(opened.convenienceFile, "persister.slnx");
    assert.equal(opened.filtered, true, opened.notes.join("; "));

    // On disk: the module, the record, the feed, the sibling's contract and
    // the root files that ride with every cone.
    for (const present of [
      "modules/persister/src/CsvPersister/CsvPersister.csproj",
      "modules/persister/tests/CsvPersister.Tests/CsvPersister.Tests.csproj",
      "modules/model/contract/README.md",
      "packages/CsvModel.0.1.0.nupkg",
      "docs/modules.yaml",
      "docs/sessions/session-plan.md",
      "global.json",
      "Directory.Packages.props",
      "nuget.config",
    ]) {
      assert.ok(existsSync(join(clone, ...present.split("/"))), `${present} is in the checkout`);
    }
    // The sibling's implementation is not on disk, and its blob is not in
    // the local object store either: the wall is the disk.
    assert.equal(existsSync(join(clone, "modules", "model", "src")), false);
    const person = gitOut(repo, "rev-parse", "HEAD:modules/model/src/CsvModel/Person.cs");
    const missing = gitOut(clone, "rev-list", "--objects", "--missing=print", "HEAD")
      .split("\n")
      .filter((line) => line.startsWith("?"))
      .map((line) => line.slice(1));
    assert.ok(missing.includes(person), "the sibling's blob is absent from the object store");

    // The convenience file lists the module's projects, tests included; the
    // engine's block is set; both are excluded in the clone's own exclude
    // file, so the clone is clean.
    assert.deepEqual(
      readFileSync(join(clone, "persister.slnx"), "utf8").match(/Path="([^"]+)"/g),
      [
        'Path="modules/persister/src/CsvPersister/CsvPersister.csproj"',
        'Path="modules/persister/tests/CsvPersister.Tests/CsvPersister.Tests.csproj"',
      ],
    );
    const settings = JSON.parse(readFileSync(join(clone, ...CLAUDE_LOCAL_SETTINGS.split("/")), "utf8")) as {
      permissions: { blockReadsOutsideWorkingDirectories: boolean };
    };
    assert.equal(settings.permissions.blockReadsOutsideWorkingDirectories, true);
    const exclude = readFileSync(join(clone, ".git", "info", "exclude"), "utf8");
    assert.match(exclude, /^\/\.claude\/settings\.local\.json$/m);
    assert.match(exclude, /^\/persister\.slnx$/m);
    assert.equal(gitOut(clone, "status", "--porcelain"), "");

    // Widened by hand (what a grant does), then reset onto a session branch:
    // the cone is narrow again and the branch is the one asked for.
    git(clone, "sparse-checkout", "add", "modules/model/src");
    assert.ok(existsSync(join(clone, "modules", "model", "src", "CsvModel", "Person.cs")));
    const reset = openModule(repo, shape, "persister", { clonePath: clone, reset: true, branch: "session/5" });
    assert.equal(reset.reset, true);
    assert.equal(reset.branch, "session/5");
    assert.equal(gitOut(clone, "symbolic-ref", "--short", "HEAD"), "session/5");
    assert.equal(existsSync(join(clone, "modules", "model", "src")), false);
    assert.deepEqual(
      gitOut(clone, "sparse-checkout", "list").split("\n").sort(),
      ["docs", "modules/model/contract", "modules/persister", "packages"],
    );
    assert.equal(gitOut(clone, "status", "--porcelain"), "");
  });
});
