// The cross-repository graph, one edge-set per repository.
//
// What is worth pinning is the boundary this file holds: it declares the
// EDGE and never the pin, it reads build files without building them, and
// every disagreement it finds is reported rather than repaired.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  DEPS_FILENAME,
  SolutionDepsError,
  UNREADABLE_ID,
  assembleSolution,
  producedBySolution,
  loadDeps,
  locateProducer,
  readBuildReferences,
  reconcile,
} from "../src/solutionDeps.ts";
import { makeTempDir, removeTempDirs } from "./support/fixtures.ts";

afterAll(removeTempDirs);

function repoWith(files: Record<string, string>): string {
  const root = makeTempDir();
  for (const [rel, text] of Object.entries(files)) {
    const path = join(root, ...rel.split("/"));
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, text, "utf8");
  }
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
    expect(deps?.consumes[0].producedBy.id).toBe("csv-model");
    // The version is the build file's, read on every check rather than
    // copied: two homes for one fact is the drift this avoids.
    expect(Object.keys(deps?.consumes[0] ?? {})).not.toContain("version");
  });

  it("refuses a file that is present and wrong, rather than reading it as empty", () => {
    // A repository that meant to declare its edges and mistyped one would
    // otherwise look exactly like one with no edges.
    const root = repoWith({ [DEPS_FILENAME]: '{"schemaVersion": 1}' });
    expect(() => loadDeps(root)).toThrow(SolutionDepsError);
  });

  it("is absent rather than empty in a repository that stands alone", () => {
    expect(loadDeps(repoWith({}))).toBeNull();
  });
});

describe("reading a build file without building it", () => {
  it("reads a package reference and its pin", () => {
    const root = repoWith({
      "src/app.csproj":
        '<Project><ItemGroup><PackageReference Include="Dabbler.Csv.Model" Version="1.2.0" /></ItemGroup></Project>',
    });
    const [ref] = readBuildReferences(root);
    expect(ref.id).toBe("Dabbler.Csv.Model");
    expect(ref.version).toBe("1.2.0");
  });

  it("reports a version only the build tool can resolve as unknown", () => {
    // Resolving `$(ModelVersion)` means running the build, and the framework
    // does not build. A false drift report costs more than a missing one.
    const root = repoWith({
      "src/app.csproj":
        '<Project><ItemGroup><PackageReference Include="Dabbler.Csv.Model" Version="$(ModelVersion)" /></ItemGroup></Project>',
    });
    expect(readBuildReferences(root)[0].version).toBeNull();
  });

  it("reads a Maven dependency as group:artifact", () => {
    const root = repoWith({
      "pom.xml":
        "<project><dependencies><dependency><groupId>com.dabbler</groupId>" +
        "<artifactId>csv-model</artifactId><version>1.0.0</version>" +
        "</dependency></dependencies></project>",
    });
    const [ref] = readBuildReferences(root);
    expect(ref.id).toBe("com.dabbler:csv-model");
    expect(ref.kind).toBe("maven");
  });

  it("notices a project reference that climbs out of the repository", () => {
    const root = repoWith({
      "src/app.csproj":
        '<Project><ItemGroup><ProjectReference Include="..\\..\\csv-model\\model.csproj" /></ItemGroup></Project>',
    });
    expect(readBuildReferences(root)[0].fromSource).toBe(true);
  });

  it("does not read build output", () => {
    const root = repoWith({
      "src/app.csproj": "<Project></Project>",
      "src/obj/generated.csproj":
        '<Project><ItemGroup><PackageReference Include="Ghost" Version="1" /></ItemGroup></Project>',
    });
    expect(readBuildReferences(root)).toHaveLength(0);
  });
});

describe("what the two readings disagree about", () => {
  const declared = {
    solution: "csv-pipeline",
    consumes: [
      {
        id: "Dabbler.Csv.Model",
        kind: "nuget",
        producedBy: { id: "csv-model", remote: null, path: null },
        resolve: "feed",
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
    expect(found[0].kind).toBe("referenced-but-not-declared");
  });

  it("says nothing about a third-party package", () => {
    expect(reconcile(null, [ref({ id: "Newtonsoft.Json" })], new Set())).toEqual([]);
  });

  it("names a declaration that outlived its dependency", () => {
    const found = reconcile(declared, [], new Set(["Dabbler.Csv.Model"]));
    expect(found[0].kind).toBe("declared-but-not-referenced");
  });

  it("reports an unreadable pin as neither agreed nor disputed", () => {
    const found = reconcile(declared, [ref({ version: null })], new Set());
    expect(found[0].kind).toBe("cannot-determine");
  });

  it("names one package pinned two ways", () => {
    const found = reconcile(
      declared,
      [ref(), ref({ version: "2.0.0", file: "src/other.csproj" })],
      new Set(),
    );
    expect(found.some((f) => f.kind === "version-disagreement")).toBe(true);
  });

  it("names source resolution nothing sanctioned", () => {
    // A green build against a sibling checkout proves nothing about the
    // published package, so the record has to know it happened.
    const found = reconcile(declared, [ref({ fromSource: true })], new Set());
    expect(found.some((f) => f.kind === "unsanctioned-source")).toBe(true);
  });

  it("stays quiet about source resolution that was declared", () => {
    const sanctioned = {
      ...declared,
      consumes: [{ ...declared.consumes[0], resolve: "source" }],
    };
    const found = reconcile(sanctioned, [ref({ fromSource: true })], new Set());
    expect(found.some((f) => f.kind === "unsanctioned-source")).toBe(false);
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
    expect(where.path).toBeNull();
    expect(where.reason).toContain("not on this machine");
  });

  it("reports a producer that declares no local path at all", () => {
    const where = locateProducer(repoWith({}), {
      id: "csv-model",
      remote: "https://example.invalid/csv-model.git",
      path: null,
    });
    expect(where.path).toBeNull();
    expect(where.reason).toContain("no local path");
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
    expect(refs).toHaveLength(1);
    expect(refs[0].id).toBe("com.dabbler:csv-model");
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
    expect(readBuildReferences(root)[0].id).toBe(UNREADABLE_ID);
  });

  it("reports an unreadable package id rather than dropping the reference", () => {
    // A dropped reference is an edge the graph does not know exists.
    const root = repoWith({
      "src/app.csproj":
        '<Project><ItemGroup><PackageReference Include="$(ModelPackage)" Version="1.0.0" /></ItemGroup></Project>',
    });
    expect(readBuildReferences(root)[0].id).toBe(UNREADABLE_ID);
  });

  it("refuses a manifest it cannot parse rather than reading it as empty", () => {
    // An empty reading produces `declared-but-not-referenced` against every
    // edge: false drift out of a parse failure.
    const root = repoWith({ "src/app.csproj": "<Project><ItemGroup></Project>" });
    expect(() => readBuildReferences(root)).toThrow(SolutionDepsError);
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
    expect(known.has("Dabbler.Csv.Model")).toBe(true);
    // The third-party one is not the solution's, and is never asked about.
    expect(known.has("Newtonsoft.Json")).toBe(false);
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
    const members = assembleSolution(app);
    expect(members).toHaveLength(2);
    expect(members[1].root).toBeNull();
    expect(members[1].reason).toContain("not on this machine");
  });
});
