// The ecosystem seam: which ecosystem a module is, from what its roots
// contain, and the refusals -- neither, both, and Maven until session 108.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { EcosystemError, ecosystemNamed, ecosystemOf } from "../src/ecosystem.ts";
import { parseEntries } from "../src/modules.ts";
import { seed, tempDir } from "./support/answers.ts";

function solution(): { root: string; entries: ReturnType<typeof parseEntries> } {
  const root = tempDir("ecosystem-");
  seed(root, {
    "modules/model/src/CsvModel/CsvModel.csproj": "<Project />\n",
    "modules/model/src/CsvModel/Person.cs": "public sealed class Person {}\n",
    "modules/reports/pom.xml": "<project />\n",
    "modules/notes/README.md": "nothing buildable here\n",
    "modules/mixed/App.csproj": "<Project />\n",
    "modules/mixed/pom.xml": "<project />\n",
    // Build output is not a project file, wherever it sits.
    "modules/notes/bin/Debug/stale.csproj": "<Project />\n",
  });
  const entries = parseEntries({
    modules: [
      { slug: "model", codeRoots: ["modules/model"], package: "CsvModel" },
      { slug: "reports", codeRoots: ["modules/reports"], package: "com.example:reports" },
      { slug: "notes", codeRoots: ["modules/notes"] },
      { slug: "mixed", codeRoots: ["modules/mixed"] },
    ],
  });
  return { root, entries };
}

describe("the ecosystem seam", () => {
  it("chooses an ecosystem per module from its roots, and refuses a module with neither project file or both", () => {
    const { root, entries } = solution();
    const [model, reports, notes, mixed] = entries;
    assert.equal(ecosystemOf(root, model!).key, "dotnet");
    assert.equal(ecosystemOf(root, reports!).key, "maven");
    assert.throws(
      () => ecosystemOf(root, notes!),
      (error: unknown) =>
        error instanceof EcosystemError &&
        /module 'notes' has no project file .* a \.csproj or a solution file for \.NET, or a pom\.xml for Maven/.test(error.message),
    );
    assert.throws(() => ecosystemOf(root, mixed!), /module 'mixed' holds both/);
    // The seam's names follow the ecosystem, and the Maven side refuses by
    // name until its session, rather than guessing a shape.
    assert.deepEqual(
      [ecosystemNamed("dotnet").contractProjectNames("CsvPersister").abstractions, ecosystemNamed("dotnet").contractProjectNames("CsvPersister").contractTests],
      ["CsvPersister.Abstractions", "CsvPersister.ContractTests"],
    );
    assert.throws(() => ecosystemNamed("maven").contractProjectNames("com.example:reports"), /session 108/);
    assert.throws(() => ecosystemNamed("maven").readSurface(root, reports!, "reports"), /session 108/);
  });
});

describe("the .NET contract scaffold", () => {
  /** The POC's shape: the persister with an implementation and a test project, central pins at the root. */
  function persister(): { root: string; entries: ReturnType<typeof parseEntries> } {
    const root = tempDir("scaffold-");
    seed(root, {
      "Directory.Build.props": "<Project>\n  <PropertyGroup>\n    <TargetFramework>net10.0</TargetFramework>\n  </PropertyGroup>\n</Project>\n",
      "Directory.Packages.props": "<Project>\n  <PropertyGroup>\n    <ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally>\n  </PropertyGroup>\n  <ItemGroup>\n    <PackageVersion Include=\"CsvModel\" Version=\"0.1.0-dev.1\" />\n    <PackageVersion Include=\"xunit.v3\" Version=\"3.2.2\" />\n  </ItemGroup>\n</Project>\n",
      "modules/persister/src/CsvPersister/CsvPersister.csproj": "<Project Sdk=\"Microsoft.NET.Sdk\">\n</Project>\n",
      "modules/persister/tests/CsvPersister.Tests/CsvPersister.Tests.csproj": "<Project Sdk=\"Microsoft.NET.Sdk\">\n  <ItemGroup>\n    <ProjectReference Include=\"../../src/CsvPersister/CsvPersister.csproj\" />\n  </ItemGroup>\n</Project>\n",
      "modules/model/src/CsvModel/CsvModel.csproj": "<Project />\n",
    });
    const entries = parseEntries({
      modules: [
        { slug: "model", codeRoots: ["modules/model"], package: "CsvModel" },
        { slug: "persister", codeRoots: ["modules/persister"], package: "CsvPersister", contract: "designed", dependsOn: ["model"] },
      ],
    });
    return { root, entries };
  }

  it("writes the abstractions, the contract tests, the wiring into the implementation's tests and the notes page, and refuses to overwrite", () => {
    const { root, entries } = persister();
    const entry = entries[1]!;
    const first = ecosystemOf(root, entry).scaffoldContract(root, entry, null);
    assert.deepEqual(first.written, [
      "modules/persister/src/CsvPersister.Abstractions/CsvPersister.Abstractions.csproj",
      "modules/persister/src/CsvPersister.Abstractions/ICsvPersister.cs",
      "Directory.Packages.props",
      "modules/persister/src/CsvPersister.ContractTests/CsvPersister.ContractTests.csproj",
      "modules/persister/src/CsvPersister.ContractTests/CsvPersisterContractTests.cs",
      "modules/persister/tests/CsvPersister.Tests/CsvPersister.Tests.csproj",
      "modules/persister/tests/CsvPersister.Tests/ImplementationContractTests.cs",
      "modules/persister/contract/README.md",
    ]);
    // The contract-test library is not a test project and ships as a package;
    // the implementation's tests inherit it through a project reference.
    const contractTests = readFileSync(join(root, "modules/persister/src/CsvPersister.ContractTests/CsvPersister.ContractTests.csproj"), "utf8");
    assert.match(contractTests, /<OutputType>Library<\/OutputType>/);
    assert.match(contractTests, /<PackageReference Include="xunit\.v3\.extensibility\.core" \/>/);
    assert.doesNotMatch(contractTests, /<TargetFramework>/);
    const tests = readFileSync(join(root, "modules/persister/tests/CsvPersister.Tests/CsvPersister.Tests.csproj"), "utf8");
    assert.match(tests, /ProjectReference Include="\.\.\/\.\.\/src\/CsvPersister\.ContractTests\/CsvPersister\.ContractTests\.csproj"/);
    // The pins the new references need were added centrally.
    assert.match(readFileSync(join(root, "Directory.Packages.props"), "utf8"), /PackageVersion Include="xunit\.v3\.extensibility\.core" Version="3\.2\.2"/);
    assert.match(readFileSync(join(root, "modules/persister/contract/README.md"), "utf8"), /## Not promised/);
    // Run again: nothing is rewritten, everything is kept.
    const again = ecosystemOf(root, entry).scaffoldContract(root, entry, null);
    assert.deepEqual(again.written, []);
    assert.ok(again.skipped.includes("modules/persister/contract/README.md"));
    assert.ok(again.skipped.includes("modules/persister/tests/CsvPersister.Tests/CsvPersister.Tests.csproj"));
  });

  it("scaffolds a compatibility suite against the provider's package and never its source", () => {
    const { root, entries } = persister();
    const [model, entry] = entries;
    const result = ecosystemOf(root, entry!).scaffoldContract(root, entry!, model!);
    const csprojPath = "modules/persister/contract/CsvModel.Compatibility/CsvModel.Compatibility.csproj";
    assert.ok(result.written.includes(csprojPath));
    const csproj = readFileSync(join(root, csprojPath), "utf8");
    assert.match(csproj, /<PackageReference Include="CsvModel" \/>/);
    assert.doesNotMatch(csproj, /Version="0\.1\.0/);
    assert.doesNotMatch(csproj, /ProjectReference/);
    assert.match(readFileSync(join(root, "modules/persister/contract/CsvModel.Compatibility/CsvModelCompatibility.cs"), "utf8"), /\[Fact\]/);
  });
});
