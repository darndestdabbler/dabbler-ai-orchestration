// Committed immutable packages: the dev version as a function of tree, date
// and records; the one central pin; the correspondence record beside each
// package.

import assert from "node:assert/strict";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  PackagesError,
  baseVersionOf,
  devVersion,
  packModule,
  newRecord,
  packagesUnderLfs,
  pinPackageVersion,
  readRecords,
  writeRecord,
} from "../src/packages.ts";
import { packagesCeiling, solutionShape } from "../src/modules.ts";
import { seed, tempDir } from "./support/answers.ts";

/** NuGet's ordering of two prerelease versions, enough for `-dev.` labels. */
function precedes(a: string, b: string): boolean {
  const [ra, pa = ""] = a.split("-");
  const [rb, pb = ""] = b.split("-");
  if (ra !== rb) return ra < rb;
  const xs = pa.split(".");
  const ys = pb.split(".");
  for (let i = 0; i < Math.max(xs.length, ys.length); i += 1) {
    const x = xs[i];
    const y = ys[i];
    if (x === undefined) return true;
    if (y === undefined) return false;
    const nx = /^\d+$/.test(x) ? Number(x) : null;
    const ny = /^\d+$/.test(y) ? Number(y) : null;
    if (nx !== null && ny !== null) {
      if (nx !== ny) return nx < ny;
    } else if (nx !== null) {
      return true;
    } else if (ny !== null) {
      return false;
    } else if (x !== y) {
      return x < y;
    }
  }
  return false;
}

describe("the dev version", () => {
  it("is a function of the tree, the date and the records: one version per tree, the next number for a moved tree, sorting after", () => {
    const day = new Date("2026-09-06T21:00:00Z");
    const first = devVersion("CsvModel", "0.1.0", day, "a1b2c3d4e5f6", []);
    assert.equal(first, "0.1.0-dev.20260906.1.ga1b2c3d");
    const records = [newRecord({ package: "CsvModel", version: first, sourceDigest: "a1b2c3d4e5f6", contractDigest: null, session: 3, baseCommit: "abc" })];
    // The same tree again is the same version, not a new number.
    assert.equal(devVersion("CsvModel", "0.1.0", day, "a1b2c3d4e5f6", records), first);
    // A moved tree takes the next number for the day and sorts after.
    const moved = devVersion("CsvModel", "0.1.0", day, "ffffff0000", records);
    assert.equal(moved, "0.1.0-dev.20260906.2.gffffff0");
    assert.ok(precedes(first, moved));
    // A digest that would sort BEFORE as hex still sorts after by number.
    assert.ok(precedes(first, devVersion("CsvModel", "0.1.0", day, "0000000abc", records)));
    // Another package's records do not count; another day starts at 1.
    assert.equal(devVersion("CsvPersister", "0.1.0", day, "ffffff0000", records), "0.1.0-dev.20260906.1.gffffff0");
    assert.equal(devVersion("CsvModel", "0.1.0", new Date("2026-09-07T01:00:00Z"), "ffffff0000", records), "0.1.0-dev.20260907.1.gffffff0");
    // The base comes from the project, stripped of any prerelease it carries.
    assert.equal(baseVersionOf("<Project><PropertyGroup><Version>1.3.0-dev.1</Version></PropertyGroup></Project>"), "1.3.0");
    assert.equal(baseVersionOf("<Project><PropertyGroup><VersionPrefix>2.0.0</VersionPrefix></PropertyGroup></Project>"), "2.0.0");
    assert.equal(baseVersionOf("<Project />"), "0.1.0");
  });
});

describe("the pack", () => {
  /** The persister with three packable projects and a test project, the model beside it. */
  function solution(): { root: string; shape: ReturnType<typeof solutionShape> } {
    const root = tempDir("pack-");
    seed(root, {
      "docs/modules.yaml": [
        "modules:",
        "- slug: model",
        "  package: CsvModel",
        "  codeRoots: [modules/model]",
        "- slug: persister",
        "  package: CsvPersister",
        "  contract: designed",
        "  dependsOn: [model]",
        "  codeRoots: [modules/persister]",
        "",
      ].join("\n"),
      "Directory.Packages.props": '<Project>\n  <ItemGroup Label="Modules">\n    <PackageVersion Include="CsvModel" Version="0.1.0-dev.20260901.1.gaaaaaaa" />\n  </ItemGroup>\n</Project>\n',
      "nuget.config": '<configuration>\n  <packageSources>\n    <add key="modules" value="packages" />\n  </packageSources>\n</configuration>\n',
      "modules/model/src/CsvModel/Consumer.txt": "the model consumes nothing\n",
      "modules/model/src/CsvModel/CsvModel.csproj": "<Project Sdk=\"Microsoft.NET.Sdk\" />\n",
      "modules/persister/src/CsvPersister/CsvPersister.csproj": "<Project Sdk=\"Microsoft.NET.Sdk\"><PropertyGroup><Version>0.2.0</Version></PropertyGroup></Project>\n",
      "modules/persister/src/CsvPersister.Abstractions/CsvPersister.Abstractions.csproj": "<Project Sdk=\"Microsoft.NET.Sdk\" />\n",
      "modules/persister/src/CsvPersister.ContractTests/CsvPersister.ContractTests.csproj": "<Project Sdk=\"Microsoft.NET.Sdk\"><PropertyGroup><PackageId>CsvPersister.ContractTests</PackageId><IsPackable>true</IsPackable></PropertyGroup></Project>\n",
      "modules/persister/tests/CsvPersister.Tests/CsvPersister.Tests.csproj": "<Project Sdk=\"Microsoft.NET.Sdk\"><PropertyGroup><IsPackable>false</IsPackable></PropertyGroup></Project>\n",
      "modules/persister/contract/README.md": "# CsvPersister\n",
    });
    return { root, shape: solutionShape(root) };
  }

  /** A `dotnet pack` that leaves the package its argv names, and remembers the argv. */
  function scriptedDotnet(calls: string[][]) {
    return (argv: readonly string[], cwd: string): { code: number; output: string } => {
      calls.push([...argv]);
      const project = argv[2] as string;
      const output = argv[argv.indexOf("-o") + 1] as string;
      const version = (argv.find((a) => a.startsWith("-p:PackageVersion=")) ?? "").slice("-p:PackageVersion=".length);
      const id = project.split("/").pop()!.replace(/\.csproj$/, "");
      mkdirSync(output, { recursive: true });
      writeFileSync(join(output, `${id}.${version}.nupkg`), "bytes", "utf8");
      return { code: 0, output: `packed ${id} in ${cwd}` };
    };
  }

  it("packs every packable project under one version, pins each and records each, from a scripted dotnet", () => {
    const { root, shape } = solution();
    const calls: string[][] = [];
    const result = packModule(root, shape, "persister", {
      session: 103,
      now: new Date("2026-09-06T21:00:00Z"),
      runPack: scriptedDotnet(calls),
      digestOf: (covers) => (covers[0]?.includes("contract") ? "c0ffee00" : "d1d1d1d1d1"),
      baseCommit: "deadbeef",
    });
    // One version for the three, from the implementation's base.
    assert.equal(result.version, "0.2.0-dev.20260906.1.gd1d1d1d");
    assert.deepEqual(result.artifacts, [
      "packages/CsvPersister.0.2.0-dev.20260906.1.gd1d1d1d.nupkg",
      "packages/CsvPersister.Abstractions.0.2.0-dev.20260906.1.gd1d1d1d.nupkg",
      "packages/CsvPersister.ContractTests.0.2.0-dev.20260906.1.gd1d1d1d.nupkg",
    ]);
    // The test project was never packed; each target got the ecosystem's argv.
    assert.equal(calls.length, 3);
    assert.ok(calls.every((argv) => argv[0] === "dotnet" && argv[1] === "pack" && argv.includes("-p:PackageVersion=0.2.0-dev.20260906.1.gd1d1d1d")));
    assert.ok(!calls.some((argv) => String(argv[2]).endsWith("CsvPersister.Tests.csproj")));
    // Pinned centrally, the existing pin kept, and recorded with the base commit.
    const props = readFileSync(join(root, "Directory.Packages.props"), "utf8");
    for (const id of ["CsvPersister", "CsvPersister.Abstractions", "CsvPersister.ContractTests"]) {
      assert.match(props, new RegExp(`<PackageVersion Include="${id.replace(/\\./g, "\\\\.")}" Version="0\\.2\\.0-dev\\.20260906\\.1\\.gd1d1d1d" />`));
    }
    assert.match(props, /CsvModel" Version="0\.1\.0-dev\.20260901\.1\.gaaaaaaa"/);
    const records = readRecords(root);
    assert.equal(records.length, 3);
    assert.ok(records.every((r) => r.sourceDigest === "d1d1d1d1d1" && r.contractDigest === "c0ffee00" && r.baseCommit === "deadbeef" && r.session === 103));
    // The same tree again is the same version, and no new number.
    const again = packModule(root, shape, "persister", { now: new Date("2026-09-06T22:00:00Z"), runPack: scriptedDotnet([]), digestOf: () => "d1d1d1d1d1", baseCommit: "deadbeef" });
    assert.equal(again.version, result.version);
    // What a consumer's restore reads, all agreeing: the feed nuget.config
    // names is packages/, the pin names the version, and the artifact of
    // that version is in the feed under the id the pin names. (The real
    // restore, `dotnet restore` of the POC's consumer against a pack made
    // here, is the step's own check.)
    const feed = /<add key="modules" value="([^"]+)" \/>/.exec(readFileSync(join(root, "nuget.config"), "utf8"))?.[1];
    assert.equal(feed, "packages");
    const pinned = /<PackageVersion Include="CsvPersister" Version="([^"]+)" \/>/.exec(props)?.[1];
    assert.equal(pinned, result.version);
    assert.ok(readdirSync(join(root, feed!)).includes(`CsvPersister.${pinned}.nupkg`));
    // A declared pack runs once with the version, and one that cannot take
    // the version is refused by name rather than passed over.
    const declaredCalls: string[][] = [];
    const declared = {
      modules: { persister: { packaging: { pack: { argv: ["pack-it", "{output}", "{version}"] }, push: { argv: ["push-it", "{artifact}", "{feed}"], feed: "D:\\feed" } } } },
    };
    const runDeclared = (argv: readonly string[]): { code: number; output: string } => {
      declaredCalls.push([...argv]);
      for (const id of ["CsvPersister", "CsvPersister.Abstractions", "CsvPersister.ContractTests"]) {
        writeFileSync(join(argv[1] as string, `${id}.${argv[2]}.nupkg`), "bytes", "utf8");
      }
      return { code: 0, output: "" };
    };
    const own = packModule(root, shape, "persister", { config: declared, runPack: runDeclared, digestOf: () => "eeeeeeeeee", baseCommit: null, now: new Date("2026-09-06T23:00:00Z") });
    assert.equal(declaredCalls.length, 1);
    assert.equal(declaredCalls[0]?.[2], own.version);
    const versionless = { modules: { persister: { packaging: { pack: { argv: ["pack-it", "{output}"] }, push: declared.modules.persister.packaging.push } } } };
    assert.throws(
      () => packModule(root, shape, "persister", { config: versionless, runPack: runDeclared, digestOf: () => "abababab", baseCommit: null }),
      /declared pack for module 'persister' does not name \{version\}/,
    );
  });

  it("refuses a package over the ceiling unless the feed is under LFS, naming both ways out and leaving no pin or record", () => {
    const { root, shape } = solution();
    const config = { modules: { packages: { ceilingBytes: 1 } } };
    const options = { runPack: scriptedDotnet([]), digestOf: () => "d1d1d1d1d1", baseCommit: null, config };
    assert.throws(
      () => packModule(root, shape, "persister", options),
      (error: unknown) =>
        error instanceof PackagesError &&
        /over the ceiling of 1 for a committed package/.test(error.message) &&
        /ceilingBytes/.test(error.message) &&
        /filter=lfs/.test(error.message),
    );
    assert.doesNotMatch(readFileSync(join(root, "Directory.Packages.props"), "utf8"), /CsvPersister/);
    assert.deepEqual(readRecords(root), []);
    assert.equal(readdirSync(join(root, "packages")).filter((name) => name.endsWith(".nupkg")).length, 0);
    // Under LFS the same package is accepted at the same ceiling.
    writeFileSync(join(root, "packages", ".gitattributes"), "*.nupkg filter=lfs diff=lfs merge=lfs -text\n", "utf8");
    assert.equal(packModule(root, shape, "persister", options).artifacts.length, 3);
    // The ceiling is read from the configuration and refused when it is not a number.
    assert.equal(packagesCeiling({}), 5 * 1024 * 1024);
    assert.throws(() => packagesCeiling({ modules: { packages: { ceilingBytes: "big" } } }), /positive integer/);
  });

  it("refuses a module whose source is not on this disk, naming the grant, and a single-module solution", () => {
    const { root, shape } = solution();
    rmSync(join(root, "modules", "model"), { recursive: true, force: true });
    assert.throws(
      () => packModule(root, shape, "model", { runPack: scriptedDotnet([]), digestOf: () => "x", baseCommit: null }),
      (error: unknown) => error instanceof PackagesError && /module 'model' is not on this disk .* `dabbler module grant model --reason/.test(error.message),
    );
    const single = { ...shape, multi: false };
    assert.throws(() => packModule(root, single, "persister", { digestOf: () => "x" }), /single-module solution/);
  });
});

describe("the central pin and the record", () => {
  it("replaces the one pin in place, adds a missing one, refuses a conditioned or duplicated one, and round-trips the record", () => {
    const props = [
      "<Project>",
      "  <PropertyGroup>",
      "    <ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally>",
      "  </PropertyGroup>",
      '  <ItemGroup Label="Modules">',
      '    <PackageVersion Include="CsvModel" Version="0.1.0-dev.20260906.1.ga1b2c3d" />',
      "  </ItemGroup>",
      '  <ItemGroup Label="Testing">',
      '    <PackageVersion Include="xunit.v3" Version="3.2.2" />',
      "  </ItemGroup>",
      "</Project>",
      "",
    ].join("\n");
    const pinned = pinPackageVersion(props, "CsvModel", "0.1.0-dev.20260906.2.gffffff0");
    assert.match(pinned, /<PackageVersion Include="CsvModel" Version="0\.1\.0-dev\.20260906\.2\.gffffff0" \/>/);
    assert.doesNotMatch(pinned, /ga1b2c3d/);
    // Everything around the pin is as it was.
    assert.equal(pinned.split("\n").length, props.split("\n").length);
    assert.match(pinned, /xunit\.v3" Version="3\.2\.2"/);
    // A missing pin lands under the Modules group.
    const added = pinPackageVersion(props, "CsvPersister", "0.1.0-dev.20260906.1.g1234567");
    assert.match(added, /Label="Modules">\n {4}<PackageVersion Include="CsvPersister" Version="0\.1\.0-dev\.20260906\.1\.g1234567" \/>/);
    // Conditioned and duplicated pins are refused by name.
    assert.throws(
      () => pinPackageVersion(props.replace('Include="CsvModel"', 'Include="CsvModel" Condition="\'$(Debug)\' == \'true\'"'), "CsvModel", "1"),
      (error: unknown) => error instanceof PackagesError && /pins 'CsvModel' under a Condition/.test(error.message),
    );
    assert.throws(
      () => pinPackageVersion(props.replace('<ItemGroup Label="Testing">', '<ItemGroup Label="Testing">\n    <PackageVersion Include="CsvModel" Version="9" />'), "CsvModel", "1"),
      /pins 'CsvModel' 2 times/,
    );

    const root = tempDir("packages-");
    mkdirSync(join(root, "packages"), { recursive: true });
    const record = newRecord({ package: "CsvModel", version: "0.1.0-dev.20260906.1.ga1b2c3d", sourceDigest: "a1b2c3d4", contractDigest: "c0ffee", session: 103, baseCommit: "deadbeef" });
    const path = writeRecord(root, record);
    assert.ok(path.endsWith("CsvModel.0.1.0-dev.20260906.1.ga1b2c3d.json"));
    // A package file and a stray json are not records.
    writeFileSync(join(root, "packages", "CsvModel.0.1.0-dev.20260906.1.ga1b2c3d.nupkg"), "bytes", "utf8");
    writeFileSync(join(root, "packages", "notes.json"), '{"hello": 1}', "utf8");
    assert.deepEqual(readRecords(root), [record]);
    assert.equal(packagesUnderLfs(root), false);
    writeFileSync(join(root, "packages", ".gitattributes"), "*.nupkg filter=lfs diff=lfs merge=lfs -text\n", "utf8");
    assert.equal(packagesUnderLfs(root), true);
  });
});
