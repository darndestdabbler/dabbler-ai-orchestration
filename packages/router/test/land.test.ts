// The atomic land: the judges the land and the close's module gates read,
// from facts alone, and the bundle record.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { existsSync } from "node:fs";

import {
  LandError,
  type LandFacts,
  bundleRecord,
  centralPins,
  judgeExposure,
  judgeLandReadiness,
  judgePins,
  packageReferencesOf,
  readBundleRecord,
  receiptCorrespondence,
  writeBundleRecord,
} from "../src/land.ts";
import { type SolutionShape, dependencyOrder, parseEntries } from "../src/modules.ts";
import { tempDir } from "./support/answers.ts";

const GREEN = { outcome: "passed", treeDigest: "tree-a", surfaceDigest: "surface-a", recordedAt: "2026-09-07T00:00:00Z" };

describe("the land", () => {
  it("refuses a tree that moved after a green run of record, naming the path, and lands the tree the run tested", () => {
    const moved: LandFacts = {
      treeNow: "tree-b",
      suites: [{ name: "persister-unit", latest: GREEN, surfaceNow: "surface-a" }],
      moved: ["modules/persister/src/CsvPersister/Store.cs"],
      modules: [],
    };
    const refusal = judgeLandReadiness(moved);
    assert.match(refusal ?? "", /the tree moved after persister-unit's run of record/);
    assert.match(refusal ?? "", /modules\/persister\/src\/CsvPersister\/Store\.cs/);

    // The same facts with the digest matching: nothing to refuse.
    assert.equal(judgeLandReadiness({ ...moved, treeNow: "tree-a", moved: [] }), null);

    // A red or missing run refuses too, and a stale surface says so; a
    // module whose package was built from source that moved refuses by name.
    assert.match(judgeLandReadiness({ ...moved, treeNow: "tree-a", suites: [{ name: "x", latest: null, surfaceNow: null }] }) ?? "", /x has no run of record/);
    assert.match(
      judgeLandReadiness({ ...moved, treeNow: "tree-a", suites: [{ name: "x", latest: { ...GREEN, surfaceDigest: "old" }, surfaceNow: "new" }] }) ?? "",
      /x is stale/,
    );
    assert.match(
      judgeLandReadiness({
        treeNow: "tree-a",
        suites: [],
        moved: [],
        modules: [
          {
            slug: "persister",
            package: "CsvPersister",
            record: { version: "0.1.0-dev.20260907.1.gabcdef0", sourceDigest: "src-1", contractDigest: null },
            sourceDigestNow: "src-2",
            contractDigestNow: null,
          },
        ],
      }) ?? "",
      /CsvPersister 0\.1\.0-dev\.20260907\.1\.gabcdef0 was built from a source of module 'persister' that moved/,
    );

    // The receipt carries this session's packages and nothing older.
    assert.deepEqual(
      receiptCorrespondence(
        [
          { package: "CsvModel", version: "0.1.0-dev.1", sourceDigest: "m1", contractDigest: "c1", session: 3 },
          { package: "CsvPersister", version: "0.1.0-dev.2", sourceDigest: "p2", contractDigest: null, session: 4 },
        ],
        4,
      ),
      [{ package: "CsvPersister", version: "0.1.0-dev.2", sourceDigest: "p2", contractDigest: null, record: "packages/CsvPersister.0.1.0-dev.2.json" }],
    );
  });
});

describe("the close's module gates", () => {
  it("pins_current passes a consumer on the candidate's pin, and names one left on an older pin and one pinning locally", () => {
    const props =
      "<Project>\n  <ItemGroup>\n" +
      '    <PackageVersion Include="CsvModel" Version="0.1.0-dev.20260907.2.gabc1234" />\n' +
      '    <PackageVersion Include="xunit.v3" Version="3.2.2" />\n' +
      "  </ItemGroup>\n</Project>\n";
    const pins = centralPins(props);
    assert.equal(pins.get("CsvModel"), "0.1.0-dev.20260907.2.gabc1234");
    // MSBuild takes metadata as child elements too, and the readers see both forms.
    assert.equal(
      centralPins('<Project><ItemGroup><PackageVersion Include="CsvModel"><Version>1.0.0</Version></PackageVersion></ItemGroup></Project>').get("CsvModel"),
      "1.0.0",
    );
    assert.deepEqual(
      packageReferencesOf("a.csproj", '<Project><ItemGroup><PackageReference Include="CsvModel"><VersionOverride>0.0.9</VersionOverride></PackageReference></ItemGroup></Project>'),
      [{ project: "a.csproj", packageId: "CsvModel", ownVersion: "0.0.9" }],
    );
    const candidate = { package: "CsvModel", version: "0.1.0-dev.20260907.2.gabc1234" };
    const clean = packageReferencesOf(
      "modules/persister/src/CsvPersister/CsvPersister.csproj",
      '<Project><ItemGroup><PackageReference Include="CsvModel" /><PackageReference Include="xunit.v3" /></ItemGroup></Project>',
    );
    assert.equal(judgePins({ candidates: [candidate], pins, references: clean }), null);

    // Left on an older pin: the central pin names a version that is not the candidate's.
    const older = centralPins(props.replace("0.1.0-dev.20260907.2.gabc1234", "0.1.0-dev.20260906.1.g0000000"));
    assert.match(judgePins({ candidates: [candidate], pins: older, references: clean }) ?? "", /CsvModel is pinned at 0\.1\.0-dev\.20260906\.1\.g0000000, and its candidate is/);

    // Pinning locally: a reference carrying its own version, named with its project.
    const local = packageReferencesOf(
      "modules/listener/src/Listener/Listener.csproj",
      '<Project><ItemGroup><PackageReference Include="CsvModel" VersionOverride="0.0.9" /></ItemGroup></Project>',
    );
    const refusal = judgePins({ candidates: [candidate], pins, references: [...clean, ...local] }) ?? "";
    assert.match(refusal, /modules\/listener\/src\/Listener\/Listener\.csproj references CsvModel with its own version 0\.0\.9/);
  });

  it("exposure_within_ceiling passes a clean manifest, and names bytes outside a grant and a path outside the scope", () => {
    const clean = {
      schema_version: 1 as const,
      session: 4,
      modules: ["persister"],
      phase: "close" as const,
      writtenAt: "2026-09-07T00:00:00Z",
      siblings: [{ slug: "model", bytes: 0, files: [] }],
      grants: [],
      outsideScope: [],
    };
    assert.equal(judgeExposure(clean), null);
    // Widened under a recorded grant: the bytes are signed for.
    assert.equal(
      judgeExposure({
        ...clean,
        siblings: [{ slug: "model", bytes: 512, files: ["modules/model/src/CsvModel/Person.cs"] }],
        grants: [{ sibling: "model", reason: "debugging the mapper", debug: true, grantedAt: "2026-09-07T00:00:00Z" }],
      }),
      null,
    );
    const leaking = judgeExposure({
      ...clean,
      siblings: [{ slug: "model", bytes: 512, files: ["modules/model/src/CsvModel/Person.cs"] }],
      outsideScope: ["README.md"],
    }) ?? "";
    assert.match(leaking, /module 'model' has 512 byte\(s\) of implementation in this checkout under no recorded grant/);
    assert.match(leaking, /1 path\(s\) changed outside the session's scope: README\.md/);
  });
});

describe("the bundle record", () => {
  it("records what an application ships from the pins and their records, and refuses a dev pin by name", () => {
    const entries = parseEntries({
      modules: [
        { slug: "model", kind: "shared-types", codeRoots: ["modules/model"], package: "CsvModel" },
        { slug: "persister", codeRoots: ["modules/persister"], dependsOn: ["model"], package: "CsvPersister" },
        { slug: "listener", kind: "application", codeRoots: ["modules/listener"], dependsOn: ["persister"] },
      ],
    });
    const shape: SolutionShape = { multi: true, implicit: false, modules: dependencyOrder(entries) };
    const listener = shape.modules.find((entry) => entry.slug === "listener")!;
    const records = [
      { package: "CsvModel", version: "1.2.0", sourceDigest: "m-120", contractDigest: "c-120", session: 9 },
      { package: "CsvPersister", version: "0.4.1", sourceDigest: "p-041", contractDigest: null, session: 10 },
    ];
    const released = centralPins(
      '<Project><ItemGroup><PackageVersion Include="CsvModel" Version="1.2.0" /><PackageVersion Include="CsvPersister" Version="0.4.1" /></ItemGroup></Project>',
    );
    // The application's version is the seam's reading of its project; the record takes it as a fact.
    const project = "2.0.0";
    const record = bundleRecord(shape, listener, released, records, project, {
      session: 12,
      baseCommit: "abc123",
      now: new Date("2026-09-07T12:00:00Z"),
    });
    // Transitive: the listener depends on the persister, which depends on the
    // model. The commit is the one it was built on; the landed one is the
    // receipt's to name.
    assert.deepEqual(record, {
      bundle: "listener",
      version: "2.0.0",
      baseCommit: "abc123",
      date: "2026-09-07",
      session: 12,
      dependencies: [
        { module: "model", package: "CsvModel", version: "1.2.0", digest: "m-120" },
        { module: "persister", package: "CsvPersister", version: "0.4.1", digest: "p-041" },
      ],
    });
    const root = tempDir("bundle-");
    assert.equal(writeBundleRecord(root, record), "release/listener/bundle.yaml");
    assert.ok(existsSync(`${root}/release/listener/bundle.yaml`));
    assert.deepEqual(readBundleRecord(root, "listener"), record);

    // A dev pin is not a release: refused by package and version.
    const dev = centralPins(
      '<Project><ItemGroup><PackageVersion Include="CsvModel" Version="1.2.0" /><PackageVersion Include="CsvPersister" Version="0.4.1-dev.20260907.3.gabc1234" /></ItemGroup></Project>',
    );
    assert.throws(
      () => bundleRecord(shape, listener, dev, records, project),
      (error: unknown) => error instanceof LandError && /CsvPersister is pinned at 0\.4\.1-dev\.20260907\.3\.gabc1234, a dev version/.test(error.message),
    );
    // Only an application ships.
    assert.throws(
      () => bundleRecord(shape, shape.modules[0]!, released, records, project),
      (error: unknown) => error instanceof LandError && /a bundle is what an application ships/.test(error.message),
    );
  });
});
