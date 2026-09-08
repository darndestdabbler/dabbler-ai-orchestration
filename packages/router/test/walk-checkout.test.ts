// One module's focused checkout, made over a real bare origin: the cone on
// disk, the sibling's source neither on disk nor in the object store, the
// files written at the clone's root and kept out of its tracked set, and a
// reset that narrows a widened cone again.
//
// A walkthrough, because the thing under test IS git's partial clone and
// sparse checkout; a scripted git would test the script.

import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";

import { CLAUDE_LOCAL_SETTINGS, defaultClonePath, openModule, readModuleSessionMarker } from "../src/checkout.ts";
import { sessionNext } from "../src/drive.ts";
import {
  ExposureError,
  raiseGrantDecision,
  readExposure,
  readGrants,
  revokeGrant,
  settleAnsweredGrants,
} from "../src/exposure.ts";
import { answerOwed } from "../src/owedDecisions.ts";
import { solutionShape } from "../src/modules.ts";
import { capture } from "../src/output.ts";
import { EXIT_OK, start } from "../src/session.ts";
import { readRawSessionState } from "../src/sessionState.ts";
import { setProviderKeys } from "./support/answers.ts";
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
    "docs/sessions/session-plan.md":
      "### Session 1 of 2: Persist things\n1. Register.\n2. **Store a person.** Make it real.\n\n" +
      "### Session 2 of 2: More things\n1. Register.\n2. Polish it.\n",
    "dabbler.yaml": "schema_version: 1\n",
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

describe("a session started on a module", () => {
  it("registers in the module's fresh clone with the checkout on its row and a zero-exposure manifest, and a next from the full checkout is refused naming the clone", async () => {
    setProviderKeys();
    const sessionsDir = join(repo, "docs", "sessions");
    const started = await capture(() =>
      Promise.resolve(start(sessionsDir, { engine: "claude-code", provider: "anthropic", module: "persister" })),
    );
    assert.equal(started.value, EXIT_OK, started.stderr);
    const clone = defaultClonePath(repo, "persister", null);
    assert.ok(existsSync(join(clone, "modules", "persister")), "the clone was made beside the repository");
    assert.equal(existsSync(join(clone, "modules", "model", "src")), false);
    assert.match(started.stdout, /registered .* in module 'persister's focused checkout/);
    assert.match(started.stdout, new RegExp(`Next: dabbler session next --sessions-dir .*repo\\.persister`));

    // The record is the clone's: session 1 is in flight there, with the
    // checkout on its row, and the full checkout's ledger is untouched.
    const ledger = readRawSessionState(join(clone, "docs", "sessions"));
    const row = (ledger?.["sessions"] as Record<string, unknown>[]).find((entry) => entry["number"] === 1);
    assert.equal(row?.["status"], "in-progress");
    assert.deepEqual(row?.["checkout"], { module: "persister", path: clone });
    assert.equal(readRawSessionState(sessionsDir), null);

    // The wall, measured at the start: nothing of the model's implementation.
    const exposure = readExposure(clone, 1);
    assert.equal(exposure?.phase, "start");
    assert.deepEqual(exposure?.siblings, [{ slug: "model", bytes: 0, files: [] }]);
    assert.deepEqual(exposure?.grants, []);

    // The full checkout knows where the session went, and refuses to run it here.
    assert.equal(readModuleSessionMarker(repo)?.path, clone);
    const refused = await capture(() => sessionNext(sessionsDir, {}));
    assert.notEqual(refused.value, EXIT_OK);
    assert.match(refused.stderr, /works in module 'persister's focused checkout at/);
    assert.match(refused.stderr, /run it there/);
  });
});

describe("a grant, and its revoke", () => {
  const clone = defaultClonePath(repo, "persister", null);

  it("answered grant, widens the clone to the sibling's source, lays the overlay where nothing tracks it, and records the bytes and the reason", () => {
    const shape = solutionShape(clone);
    const decision = raiseGrantDecision(clone, shape, 1, "model", "debugging the mapper", true);
    assert.equal(decision, "module-grant:model");
    // Raised, not applied: the request alone changes nothing on disk.
    assert.equal(existsSync(join(clone, "modules", "model", "src")), false);
    assert.deepEqual(settleAnsweredGrants(clone, shape, 1), { applied: [], denied: [], open: [decision] });

    answerOwed(clone, decision, "grant", 1);
    const settled = settleAnsweredGrants(clone, shape, 1);
    assert.equal(settled.applied.length, 1);
    assert.equal(settled.applied[0]?.sibling, "model");
    assert.ok(existsSync(join(clone, "modules", "model", "src", "CsvModel", "Person.cs")));
    const overlay = readFileSync(join(clone, ".dabbler", "overlay.targets"), "utf8");
    assert.match(overlay, /<PackageReference Remove="CsvModel" \/>/);
    assert.match(overlay, /<ProjectReference Include="\$\(MSBuildThisFileDirectory\)\.\.\/modules\/model\/src\/CsvModel\/CsvModel\.csproj" \/>/);
    // The overlay is machine state under .dabbler/, excluded in the clone;
    // what status shows is the session's own registration (its ledger and
    // the engine's stop gate), never the overlay.
    assert.doesNotMatch(gitOut(clone, "status", "--porcelain"), /\.dabbler|overlay/);
    const exposure = readExposure(clone, 1);
    assert.ok((exposure?.siblings[0]?.bytes ?? 0) > 0);
    // The sibling's SOURCE, which is what the grant widened the cone for.
    // Its project file is not exposure: cone mode puts one in every
    // focused checkout, granted or not, and a manifest naming an artifact
    // is what the contract folder already says out loud.
    assert.deepEqual(exposure?.siblings[0]?.files, ["modules/model/src/CsvModel/Person.cs"]);
    assert.equal(exposure?.grants[0]?.reason, "debugging the mapper");
    assert.equal(exposure?.grants[0]?.debug, true);
    // Settled once: a second look applies nothing again.
    assert.deepEqual(settleAnsweredGrants(clone, shape, 1), { applied: [], denied: [], open: [] });
  });

  it("refuses to revoke while the sibling's roots hold a change, and once it is discarded narrows the cone again and records it", () => {
    const shape = solutionShape(clone);
    const person = join(clone, "modules", "model", "src", "CsvModel", "Person.cs");
    writeFileSync(person, "public sealed class Person { public string Name = \"\"; }\n", "utf8");
    assert.throws(
      () => revokeGrant(clone, shape, 1, "model"),
      (error: unknown) => error instanceof ExposureError && /roots hold 1 change/.test(error.message),
    );
    git(clone, "checkout", "--", "modules/model");
    revokeGrant(clone, shape, 1, "model");
    assert.equal(existsSync(join(clone, "modules", "model", "src")), false);
    assert.equal(existsSync(join(clone, ".dabbler", "overlay.targets")), false);
    assert.deepEqual(
      gitOut(clone, "sparse-checkout", "list").split("\n").sort(),
      ["docs", "modules/model/contract", "modules/persister", "packages"],
    );
    const exposure = readExposure(clone, 1);
    assert.deepEqual(exposure?.grants, []);
    assert.deepEqual(exposure?.siblings, [{ slug: "model", bytes: 0, files: [] }]);
    assert.deepEqual(
      readGrants(clone, 1).map((row) => row.event),
      ["requested", "granted", "revoked"],
    );
  });
});
