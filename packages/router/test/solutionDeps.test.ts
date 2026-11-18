// The cross-repository graph, one edge-set per repository.
//
// What is worth pinning is the boundary this file holds: it declares the
// EDGE and never the pin, it reads build files without building them, and
// every disagreement it finds is reported rather than repaired.

import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";

import {
  DEPS_FILENAME,
  SolutionDepsError,
  UNREADABLE_ID,
  assembleSolution,
  declarablePath,
  declareProducerLocation,
  producedBySolution,
  scaffoldMember,
  loadDeps,
  locateProducer,
  readBuildReferences,
  reconcile,
  reconcileAcrossRepositories,
  sameRepository,
  workspaceFilePath,
  workspaceFolders,
  writeWorkspaceFile,
} from "../src/solutionDeps.ts";
import { GIT_INIT, gitAnswers, seed, tempDir } from "./support/answers.ts";

// Scaffolding a member is `git init` in a directory that is not yet a
// repository, and nothing else is asked of git here.
gitAnswers([GIT_INIT]);

function repoWith(files: Record<string, string>): string {
  const root = tempDir("deps-");
  seed(root, files);
  return root;
}

const DECLARED = JSON.stringify({
  schemaVersion: 1,
  solution: "csv-pipeline",
  consumes: [
    {
      id: "Dabbler.Csv.Model",
      kind: "nuget",
      producedBy: { id: "csv-model", remote: null, path: "../csv-model" },
      resolve: "feed",
    },
  ],
});

describe("the declaration", () => {
  it("carries the edge and never the pin", () => {
    const root = repoWith({ [DEPS_FILENAME]: DECLARED });
    const deps = loadDeps(root);
    assert.equal(deps?.consumes[0].producedBy.id, "csv-model");
    // The version is the build file's, read on every check rather than
    // copied: two homes for one fact is the drift this avoids.
    assert.ok(!(Object.keys(deps?.consumes[0] ?? {})).includes("version"));
  });

  it("refuses a file that is present and wrong, rather than reading it as empty", () => {
    // A repository that meant to declare its edges and mistyped one would
    // otherwise look exactly like one with no edges.
    const root = repoWith({ [DEPS_FILENAME]: '{"schemaVersion": 1}' });
    assert.throws(() => loadDeps(root), SolutionDepsError);
  });

  it("is absent rather than empty in a repository that stands alone", () => {
    assert.equal(loadDeps(repoWith({})), null);
  });

  it("reads an explicit null as nothing, not as the word", () => {
    // The schema allows `feed: null` -- it is how a declaration says this
    // edge names no source -- and `String(null)` turns that into a feed
    // called "null", which `check` then reports as a source nobody
    // registered. The two ways JSON says "nothing" have to read the same.
    //
    // `repositoryId` and the producer's `remote` and `path` go through the
    // same reading. Only `feed` and the producer's are reachable through
    // this door: the schema still requires `repositoryId` to be a non-empty
    // string when present, so an explicit null there is refused before the
    // reader sees it. It shares the reading so it cannot drift back if that
    // ever widens.
    const root = repoWith({
      [DEPS_FILENAME]: JSON.stringify({
        schemaVersion: 1,
        solution: "csv-pipeline",
        consumes: [
          {
            id: "Dabbler.Csv.Model",
            kind: "nuget",
            producedBy: { id: "csv-model", remote: null, path: null },
            resolve: "feed",
            feed: null,
          },
        ],
      }),
    });
    const deps = loadDeps(root);
    assert.equal(deps?.consumes[0].feed, null);
    assert.equal(deps?.consumes[0].producedBy.remote, null);
    assert.equal(deps?.consumes[0].producedBy.path, null);
    // Omitted entirely, which is the other way to say it.
    assert.equal(deps?.repositoryId, null);
  });
});

describe("reading a build file without building it", () => {
  it("reads a package reference and its pin", () => {
    const root = repoWith({
      "src/app.csproj":
        '<Project><ItemGroup><PackageReference Include="Dabbler.Csv.Model" Version="1.2.0" /></ItemGroup></Project>',
    });
    const [ref] = readBuildReferences(root);
    assert.equal(ref.id, "Dabbler.Csv.Model");
    assert.equal(ref.version, "1.2.0");
  });

  it("reports a version only the build tool can resolve as unknown", () => {
    // Resolving `$(ModelVersion)` means running the build, and the framework
    // does not build. A false drift report costs more than a missing one.
    const root = repoWith({
      "src/app.csproj":
        '<Project><ItemGroup><PackageReference Include="Dabbler.Csv.Model" Version="$(ModelVersion)" /></ItemGroup></Project>',
    });
    assert.equal(readBuildReferences(root)[0].version, null);
  });

  it("reads a Maven dependency as group:artifact", () => {
    const root = repoWith({
      "pom.xml":
        "<project><dependencies><dependency><groupId>com.dabbler</groupId>" +
        "<artifactId>csv-model</artifactId><version>1.0.0</version>" +
        "</dependency></dependencies></project>",
    });
    const [ref] = readBuildReferences(root);
    assert.equal(ref.id, "com.dabbler:csv-model");
    assert.equal(ref.kind, "maven");
  });

  it("notices a project reference that climbs out of the repository", () => {
    const root = repoWith({
      "src/app.csproj":
        '<Project><ItemGroup><ProjectReference Include="..\\..\\csv-model\\model.csproj" /></ItemGroup></Project>',
    });
    assert.equal(readBuildReferences(root)[0].fromSource, true);
  });

  it("does not read build output", () => {
    const root = repoWith({
      "src/app.csproj": "<Project></Project>",
      "src/obj/generated.csproj":
        '<Project><ItemGroup><PackageReference Include="Ghost" Version="1" /></ItemGroup></Project>',
    });
    assert.equal(readBuildReferences(root).length, 0);
  });
});

describe("what the two readings disagree about", () => {
  const declared = {
    solution: "csv-pipeline",
    repositoryId: null,
    searchPaths: [".."],
    consumes: [
      {
        id: "Dabbler.Csv.Model",
        kind: "nuget",
        producedBy: { id: "csv-model", remote: null, path: null },
        resolve: "feed",
        feed: null,
      },
    ],
  };
  const ref = (over: Record<string, unknown> = {}) => ({
    id: "Dabbler.Csv.Model",
    version: "1.0.0",
    file: "src/app.csproj",
    kind: "nuget",
    fromSource: false,
    ...over,
  });

  it("names an edge nobody declared, which is the dangerous one", () => {
    // Nothing warns when the repository that builds it changes it.
    const found = reconcile(null, [ref()], new Set(["Dabbler.Csv.Model"]));
    assert.equal(found[0].kind, "referenced-but-not-declared");
  });

  it("says nothing about a third-party package", () => {
    assert.deepEqual(reconcile(null, [ref({ id: "Newtonsoft.Json" })], new Set()), []);
  });

  it("names a declaration that outlived its dependency", () => {
    const found = reconcile(declared, [], new Set(["Dabbler.Csv.Model"]));
    assert.deepEqual(found[0].kind, "declared-but-not-referenced");
  });

  it("reports an unreadable pin as neither agreed nor disputed", () => {
    const found = reconcile(declared, [ref({ version: null })], new Set());
    assert.equal(found[0].kind, "cannot-determine");
  });

  it("names one package pinned two ways", () => {
    const found = reconcile(
      declared,
      [ref(), ref({ version: "2.0.0", file: "src/other.csproj" })],
      new Set(),
    );
    assert.equal(found.some((f) => f.kind === "version-disagreement"), true);
  });

  it("names source resolution nothing sanctioned", () => {
    // A green build against a sibling checkout proves nothing about the
    // published package, so the record has to know it happened.
    const found = reconcile(declared, [ref({ fromSource: true })], new Set());
    assert.equal(found.some((f) => f.kind === "unsanctioned-source"), true);
  });

  it("stays quiet about source resolution that was declared", () => {
    const sanctioned = {
      ...declared,
      consumes: [{ ...declared.consumes[0], resolve: "source" }],
    };
    const found = reconcile(sanctioned, [ref({ fromSource: true })], new Set());
    assert.equal(found.some((f) => f.kind === "unsanctioned-source"), false);
  });
});

describe("finding the repository that builds a package", () => {
  it("reports a sibling nobody has cloned, rather than failing", () => {
    // The graph is a declaration about a solution, not about one laptop.
    const root = repoWith({});
    const where = locateProducer(root, {
      id: "csv-model",
      remote: null,
      path: "../csv-model",
    });
    assert.equal(where.path, null);
    assert.match(String(where.reason), /not on this machine/);
  });

  it("reports a producer that declares no local path at all", () => {
    const where = locateProducer(repoWith({}), {
      id: "csv-model",
      remote: "https://example.invalid/csv-model.git",
      path: null,
    });
    assert.equal(where.path, null);
    assert.match(String(where.reason), /no local path/);
  });
});

describe("reading a manifest structurally rather than by pattern", () => {
  it("does not count a managed version as a dependency", () => {
    // `<dependencyManagement>` says what a version WOULD be if this project
    // took the dependency. Counting it is how a pom that manages fifty
    // versions reports fifty edges it does not have.
    const root = repoWith({
      "pom.xml":
        "<project><dependencyManagement><dependencies><dependency>" +
        "<groupId>com.other</groupId><artifactId>managed</artifactId>" +
        "<version>9.9.9</version></dependency></dependencies>" +
        "</dependencyManagement><dependencies><dependency>" +
        "<groupId>com.dabbler</groupId><artifactId>csv-model</artifactId>" +
        "<version>1.0.0</version></dependency></dependencies></project>",
    });
    const refs = readBuildReferences(root);
    assert.equal(refs.length, 1);
    assert.equal(refs[0].id, "com.dabbler:csv-model");
  });

  it("reports a half-known Maven id rather than joining on the artifact alone", () => {
    // `${project.groupId}:csv-model` would join against nothing and read as
    // an undeclared edge, which is a false drift report.
    const root = repoWith({
      "pom.xml":
        "<project><dependencies><dependency>" +
        "<groupId>${project.groupId}</groupId><artifactId>csv-model</artifactId>" +
        "</dependency></dependencies></project>",
    });
    assert.equal(readBuildReferences(root)[0].id, UNREADABLE_ID);
  });

  it("reports an unreadable package id rather than dropping the reference", () => {
    // A dropped reference is an edge the graph does not know exists.
    const root = repoWith({
      "src/app.csproj":
        '<Project><ItemGroup><PackageReference Include="$(ModelPackage)" Version="1.0.0" /></ItemGroup></Project>',
    });
    assert.equal(readBuildReferences(root)[0].id, UNREADABLE_ID);
  });

  it("refuses a manifest it cannot parse rather than reading it as empty", () => {
    // An empty reading produces `declared-but-not-referenced` against every
    // edge: false drift out of a parse failure.
    const root = repoWith({ "src/app.csproj": "<Project><ItemGroup></Project>" });
    assert.throws(() => readBuildReferences(root), SolutionDepsError);
  });
});

describe("the solution, assembled", () => {
  it("finds an undeclared edge, which one repository alone cannot", () => {
    // `known` used to be built from the DECLARED ids, which made
    // referenced-but-not-declared unreachable: a declared id is not an
    // undeclared one. The producers a declaration names are what widen it.
    const model = repoWith({
      "solution-dependencies.json": JSON.stringify({
        schemaVersion: 1,
        solution: "csv-pipeline",
        consumes: [],
      }),
    });
    mkdirSync(join(model, ".git"), { recursive: true });
    const app = repoWith({
      "solution-dependencies.json": JSON.stringify({
        schemaVersion: 1,
        solution: "csv-pipeline",
        consumes: [
          {
            id: "Dabbler.Csv.Model",
            kind: "nuget",
            producedBy: { id: "csv-model", remote: null, path: model },
            resolve: "feed",
          },
        ],
      }),
      "src/app.csproj":
        '<Project><ItemGroup>' +
        '<PackageReference Include="Dabbler.Csv.Model" Version="1.0.0" />' +
        '<PackageReference Include="Newtonsoft.Json" Version="13.0.0" />' +
        "</ItemGroup></Project>",
    });
    const members = assembleSolution(app);
    const known = producedBySolution(members);
    assert.equal(known.has("Dabbler.Csv.Model"), true);
    // The third-party one is not the solution's, and is never asked about.
    assert.equal(known.has("Newtonsoft.Json"), false);
  });

  it("keeps an unreachable sibling as a reported member", () => {
    const app = repoWith({
      "solution-dependencies.json": JSON.stringify({
        schemaVersion: 1,
        solution: "csv-pipeline",
        consumes: [
          {
            id: "Dabbler.Csv.Model",
            kind: "nuget",
            producedBy: { id: "csv-model", remote: null, path: "../nowhere" },
            resolve: "feed",
          },
        ],
      }),
    });
    const unreachable = assembleSolution(app).find((member) => member.id === "csv-model");
    assert.equal(unreachable?.root, null);
    assert.match(String(unreachable?.reason), /not on this machine/);
  });
});

describe("checking that a producer is the repository it claims to be", () => {
  it("reports a checkout that belongs to a different solution", () => {
    // A path is the most fragile of the three ways a producer is named: it
    // survives neither a move nor a second clone. Accepting any directory
    // with a `.git` in it means reconciling against the wrong repository
    // and reporting its versions as this solution's.
    const other = repoWith({
      [DEPS_FILENAME]: JSON.stringify({
        schemaVersion: 1,
        solution: "something-else",
        consumes: [],
      }),
    });
    mkdirSync(join(other, ".git"), { recursive: true });
    const where = locateProducer(
      repoWith({}),
      { id: "csv-model", remote: null, path: other },
      "csv-pipeline",
    );
    assert.equal(where.path, null);
    assert.match(String(where.reason), /something-else/);
  });

  it("calls an SSH and an HTTPS URL for one repository the same repository", () => {
    // A check that called them different would refuse every team that uses
    // both, which is most of them.
    assert.equal(
      sameRepository("git@example.com:acme/csv-model.git", "https://example.com/acme/csv-model"),
      true,
    );
    assert.equal(
      sameRepository("https://example.com/acme/csv-model", "https://example.com/acme/other"),
      false,
    );
  });
});

describe("two dependencies in one manifest", () => {
  it("reads each one's own coordinates", () => {
    // Matching a child to its parent by PATH makes every sibling
    // `<dependency>` indistinguishable, so a pom with two of them reported
    // the first one twice -- a phantom version disagreement against a
    // package the second never named.
    const root = repoWith({
      "pom.xml":
        "<project><dependencies>" +
        "<dependency><groupId>com.dabbler</groupId><artifactId>csv-model</artifactId>" +
        "<version>1.0.0</version></dependency>" +
        "<dependency><groupId>com.dabbler</groupId><artifactId>csv-writer</artifactId>" +
        "<version>2.0.0</version></dependency>" +
        "</dependencies></project>",
    });
    const refs = readBuildReferences(root);
    assert.deepEqual(refs.map((entry) => entry.id), [
      "com.dabbler:csv-model",
      "com.dabbler:csv-writer",
    ]);
    assert.deepEqual(refs.map((ref) => ref.version), ["1.0.0", "2.0.0"]);
  });
});

describe("a solution whose repositories are not side by side", () => {
  /** A repository under `parent`, with a `.git` and a declaration. */
  function member(
    parent: string,
    name: string,
    doc: Record<string, unknown>,
    version: string | null,
  ): string {
    const root = join(parent, name);
    mkdirSync(join(root, ".git"), { recursive: true });
    writeFileSync(
      join(root, DEPS_FILENAME),
      JSON.stringify({ schemaVersion: 1, ...doc }),
      "utf8",
    );
    if (version !== null) {
      mkdirSync(join(root, "src"), { recursive: true });
      writeFileSync(
        join(root, "src", "app.csproj"),
        '<Project><ItemGroup><PackageReference Include="Dabbler.Csv.Model" ' +
          `Version="${version}" /></ItemGroup></Project>`,
        "utf8",
      );
    }
    return root;
  }

  const consumes = [
    {
      id: "Dabbler.Csv.Model",
      kind: "nuget",
      producedBy: { id: "csv-model", remote: null, path: null },
      resolve: "feed",
    },
  ];

  it("reaches a consumer in another directory that a search path names", () => {
    // Edges name PRODUCERS, so following them alone never reaches the other
    // repository consuming the same package -- and that is the disagreement
    // that costs an upgrade. A CI job that scatters its checkouts says where
    // they are rather than being guessed at.
    const here = tempDir("deps-");
    const elsewhere = tempDir("deps-");
    member(elsewhere, "consumer-b", { solution: "csv-pipeline", consumes }, "2.0.0");
    const app = member(
      here,
      "consumer-a",
      { solution: "csv-pipeline", searchPaths: ["..", elsewhere], consumes },
      "1.0.0",
    );

    const members = assembleSolution(app);
    const found = reconcileAcrossRepositories(members, producedBySolution(members));
    assert.deepEqual(found.some((f) => f.kind === "version-disagreement"), true);
  });

  it("counts two checkouts of one repository as one member", () => {
    // A stale clone beside a fresh one is one repository on two branches.
    // Counting it twice invents a version disagreement nobody has.
    const parent = tempDir("deps-");
    member(
      parent,
      "csv-app-old",
      { solution: "csv-pipeline", repositoryId: "csv-app", consumes },
      "1.0.0",
    );
    const app = member(
      parent,
      "csv-app",
      { solution: "csv-pipeline", repositoryId: "csv-app", consumes },
      "2.0.0",
    );
    const members = assembleSolution(app);
    const found = reconcileAcrossRepositories(members, producedBySolution(members));
    assert.equal(found.some((f) => f.kind === "duplicate-checkout"), true);
    assert.equal(found.some((f) => f.kind === "version-disagreement"), false);
  });

  it("refuses a producer whose repository says it is something else", () => {
    const parent = tempDir("deps-");
    const other = member(
      parent,
      "not-the-model",
      { solution: "csv-pipeline", repositoryId: "csv-writer", consumes: [] },
      null,
    );
    const where = locateProducer(
      tempDir("deps-"),
      { id: "csv-model", remote: null, path: other },
      "csv-pipeline",
    );
    assert.equal(where.path, null);
    assert.match(String(where.reason), /csv-writer/);
  });

  it("reads a producer that states no id, and says the identity is unconfirmed", () => {
    // Unconfirmable is not the same as wrong. Refusing here would make the
    // field required in everything but name.
    const parent = tempDir("deps-");
    const other = member(parent, "csv-model", { solution: "csv-pipeline", consumes: [] }, null);
    const where = locateProducer(
      tempDir("deps-"),
      { id: "csv-model", remote: null, path: other },
      "csv-pipeline",
    );
    assert.notEqual(where.path, null);
    assert.match(String(where.warning), /repositoryId/);
  });
});

describe("a manifest that is valid XML and not the shape this expects", () => {
  it("reads single-quoted attributes rather than skipping the element", () => {
    // Skipping would report a repository as having no dependencies, which is
    // a silent wrong answer where the whole design is to fail loud.
    const root = repoWith({
      "src/app.csproj":
        "<Project><ItemGroup><PackageReference Include='Dabbler.Csv.Model' " +
        "Version='1.2.0' /></ItemGroup></Project>",
    });
    const [ref] = readBuildReferences(root);
    assert.equal(ref.id, "Dabbler.Csv.Model");
    assert.equal(ref.version, "1.2.0");
  });

  it("finds a build file deeper than a fixed depth would reach", () => {
    // A depth limit is a silent omission: a .csproj five directories down is
    // a dependency the graph does not know exists.
    const root = repoWith({
      "a/b/c/d/e/f/deep.csproj":
        '<Project><ItemGroup><PackageReference Include="Deep" Version="1.0.0" /></ItemGroup></Project>',
    });
    assert.deepEqual(readBuildReferences(root).map((entry) => entry.id), ["Deep"]);
  });
});

describe("the sibling a declaration cannot name", () => {
  it("reaches a second consumer of the same package", () => {
    // Edges point consumer to producer, so walking them alone never reaches
    // the OTHER repository that depends on the same thing -- and two
    // consumers pinning one package differently is the disagreement that
    // costs an upgrade.
    const parent = tempDir("deps-");
    const write = (name: string, files: Record<string, string>): string => {
      const root = join(parent, name);
      for (const [rel, text] of Object.entries(files)) {
        const path = join(root, ...rel.split("/"));
        mkdirSync(join(path, ".."), { recursive: true });
        writeFileSync(path, text, "utf8");
      }
      mkdirSync(join(root, ".git"), { recursive: true });
      return root;
    };
    const declaring = (version: string) => ({
      [DEPS_FILENAME]: JSON.stringify({
        schemaVersion: 1,
        solution: "csv-pipeline",
        consumes: [
          {
            id: "Dabbler.Csv.Model",
            kind: "nuget",
            producedBy: { id: "csv-model", remote: null, path: null },
            resolve: "feed",
          },
        ],
      }),
      "src/app.csproj":
        '<Project><ItemGroup><PackageReference Include="Dabbler.Csv.Model" ' +
        `Version="${version}" /></ItemGroup></Project>`,
    });
    write("consumer-b", declaring("2.0.0"));
    const app = write("consumer-a", declaring("1.0.0"));

    const members = assembleSolution(app);
    const found = reconcileAcrossRepositories(members, producedBySolution(members));
    assert.equal(found.some((finding) => finding.kind === "version-disagreement"), true);
  });
});

describe("saying where a repository is", () => {
  it("writes the location a person supplied onto every edge that names it", () => {
    const root = repoWith({ [DEPS_FILENAME]: DECLARED });
    const sibling = tempDir("deps-");

    const after = declareProducerLocation(root, "csv-model", {
      path: declarablePath(root, sibling),
      remote: "git@github.com:dabbler/csv-model.git",
    });
    assert.equal(after.consumes[0].producedBy.remote, "git@github.com:dabbler/csv-model.git");
    // Read back through the loader, so what is asserted is a document the
    // reader accepts rather than the object the writer built.
    assert.equal(loadDeps(root)?.consumes[0].producedBy.path, 
      declarablePath(root, sibling),
    );

    // An id no edge declares is a refusal: writing it would put a producer
    // in the graph that nothing consumes.
    assert.throws(
      () => declareProducerLocation(root, "nobody", { path: "../nobody" }),
      SolutionDepsError,
    );
  });

  it("scaffolds a repository that declares only its membership", () => {
    // The answer to "I finished the model and did not know what was next":
    // the next repository is visible before it has any content, and it is
    // visible because it says which solution it is in -- one home, owned by
    // the repository it describes.
    const parent = tempDir("deps-");
    const created = scaffoldMember(join(parent, "csv-cli"), "csv-pipeline", "csv-cli");
    const shell = loadDeps(created);
    assert.equal(shell?.solution, "csv-pipeline");
    assert.equal(shell?.repositoryId, "csv-cli");
    assert.deepEqual(shell?.consumes, []);
    assert.equal(existsSync(join(created, ".git")), true);

    // Never over a declaration somebody already made.
    assert.throws(() => scaffoldMember(created, "csv-pipeline", "csv-cli"), SolutionDepsError);
  });

  it("brings a scaffolded member into the graph with nothing depending on it", () => {
    // The upstream direction, without a second declared one. Nothing
    // consumes this repository and nothing declares it as a producer; it is
    // in the solution because it says it is.
    const parent = tempDir("deps-");
    const app = join(parent, "app");
    mkdirSync(join(app, ".git"), { recursive: true });
    writeFileSync(
      join(app, DEPS_FILENAME),
      JSON.stringify({
        schemaVersion: 1,
        solution: "csv-pipeline",
        repositoryId: "app",
        consumes: [],
      }),
      "utf8",
    );
    scaffoldMember(join(parent, "csv-cli"), "csv-pipeline", "csv-cli");

    assert.ok(assembleSolution(app).map((member) => member.id).includes("csv-cli"));
  });
});

// --- One VS Code window over the whole solution ---------------------------------
//
// The property worth pinning is that the file is DERIVED and LOCAL: it is
// regenerated from the graph rather than merged, it lives where nothing
// tracks it, and it carries only folders that are actually on this machine.

/** A repository under `parent`, declaring the solution and its edges. */
function windowMember(
  parent: string,
  name: string,
  consumes: unknown[],
  extra: Record<string, unknown> = {},
): string {
  const root = join(parent, name);
  mkdirSync(join(root, ".git"), { recursive: true });
  seed(root, {
    [DEPS_FILENAME]: JSON.stringify({
      schemaVersion: 1,
      solution: "csv-pipeline",
      repositoryId: name,
      consumes,
      ...extra,
    }),
  });
  return root;
}

const WINDOW_EDGE = {
  id: "Dabbler.Csv.Model",
  kind: "nuget",
  producedBy: { id: "csv-model", remote: null, path: "../csv-model" },
  resolve: "feed",
};

describe("the workspace over a solution", () => {
  /** What VS Code would open, resolved the way VS Code resolves it. */
  function opens(repoRoot: string): string[] {
    const base = dirname(workspaceFilePath(repoRoot));
    return workspaceFolders(repoRoot).map((folder) => resolve(base, folder.path));
  }

  it("carries this repository first and its siblings after", () => {
    // This one is the window the developer already has. Resolved from the
    // FILE's directory, which is where VS Code resolves a folder path from:
    // computed from the repository root instead, `"."` opens `.dabbler` and
    // the sibling lands inside this repository.
    const parent = tempDir("window-");
    const model = windowMember(parent, "csv-model", []);
    const app = windowMember(parent, "csv-app", [WINDOW_EDGE]);
    assert.ok(workspaceFolders(app).map((folder) => folder.name).includes("csv-model"));
    assert.deepEqual(opens(app), [resolve(app), resolve(model)]);
  });

  it("omits a repository nobody has cloned rather than adding a broken row", () => {
    // VS Code renders a missing folder as an error, and a window that opens
    // with three errors in it teaches people to distrust the button.
    const parent = tempDir("window-");
    const app = windowMember(parent, "csv-app", [
      { ...WINDOW_EDGE, producedBy: { id: "csv-model", remote: null, path: "../nowhere" } },
    ]);
    assert.equal(workspaceFolders(app).length, 1);
  });

  it("lives where nothing tracks it", () => {
    // It carries the paths THIS machine has. A tracked copy is wrong on the
    // second machine that opens it -- pointing at folders that are not
    // there, or at folders that are somebody else's checkout.
    assert.match(workspaceFilePath(tempDir("window-")), /\.dabbler/);
  });

  it("uses a relative path, so moving the whole set keeps it working", () => {
    const parent = tempDir("window-");
    const model = windowMember(parent, "csv-model", []);
    const app = windowMember(parent, "csv-app", [WINDOW_EDGE]);
    const sibling = workspaceFolders(app).find((folder) => folder.name === "csv-model");
    assert.equal(sibling?.path, "../../csv-model");
    assert.equal(
      resolve(dirname(workspaceFilePath(app)), sibling?.path as string),
      resolve(model),
    );
  });

  it("writes a document VS Code can open", () => {
    const parent = tempDir("window-");
    windowMember(parent, "csv-model", []);
    const app = windowMember(parent, "csv-app", [WINDOW_EDGE]);
    const path = writeWorkspaceFile(app);
    assert.ok(existsSync(path));
    const doc = JSON.parse(readFileSync(path, "utf8")) as {
      folders: Array<{ name: string; path: string }>;
      settings: Record<string, unknown>;
    };
    assert.equal(doc.folders.length, 2);
    // Says of itself that it is generated, so nobody keeps preferences in a
    // file that is rewritten whenever the graph changes.
    assert.equal(doc.settings["dabbler.generated"], true);
  });

  it("regenerates rather than merges, so a departed repository leaves", () => {
    // A merge would preserve a folder whose repository has left the
    // solution, which is the one thing a derived file must not do.
    const parent = tempDir("window-");
    windowMember(parent, "csv-model", []);
    const app = windowMember(parent, "csv-app", [WINDOW_EDGE]);
    writeWorkspaceFile(app);
    seed(app, {
      [DEPS_FILENAME]: JSON.stringify({
        schemaVersion: 1,
        solution: "csv-pipeline",
        repositoryId: "csv-app",
        searchPaths: [],
        consumes: [],
      }),
    });
    const doc = JSON.parse(readFileSync(writeWorkspaceFile(app), "utf8")) as {
      folders: Array<{ name: string }>;
    };
    assert.deepEqual(doc.folders.map((folder) => folder.name), ["csv-app"]);
  });

  it("is a window of one for a repository that reaches nothing", () => {
    assert.equal(workspaceFolders(tempDir("window-")).length, 1);
  });
});
