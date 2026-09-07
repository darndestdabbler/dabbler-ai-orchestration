// The ecosystem seam: which ecosystem a module is, from what its roots
// contain, the refusals -- neither, both -- and the Maven side beside the
// .NET one.

import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { pathToFileURL } from "node:url";

import { EcosystemError, ecosystemNamed, ecosystemOf, ensureRootFiles, javaReleaseOf, layDebugGrants, setJavaSource } from "../src/ecosystem.ts";
import { type SolutionShape, dependencyOrder, parseEntries, impliedDeployables } from "../src/modules.ts";
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
    // The seam's names follow the ecosystem: .NET's dotted projects, Maven's
    // hyphenated modules; and a Maven package is groupId:artifactId.
    assert.deepEqual(
      [ecosystemNamed("dotnet").contractProjectNames("CsvPersister").abstractions, ecosystemNamed("dotnet").contractProjectNames("CsvPersister").contractTests],
      ["CsvPersister.Abstractions", "CsvPersister.ContractTests"],
    );
    assert.deepEqual(
      [ecosystemNamed("maven").contractProjectNames("com.example:reports").abstractions, ecosystemNamed("maven").contractProjectNames("com.example:reports").contractTests],
      ["reports-api", "reports-contract-tests"],
    );
    assert.throws(
      () => ecosystemNamed("maven").packagedArtifact("reports", "1.0.0"),
      (error: unknown) => error instanceof EcosystemError && /a Maven module's package is groupId:artifactId/.test(error.message),
    );
  });
});

describe("the Maven side of the seam", () => {
  /** A two-module Maven solution: the model as one jar, the reports as an aggregator of a core and an api. */
  function mavenSolution(): { root: string; shape: SolutionShape } {
    const root = tempDir("maven-");
    const parent = (relativePath: string): string =>
      `  <parent>\n    <groupId>com.example</groupId>\n    <artifactId>solution-parent</artifactId>\n    <version>\${revision}</version>\n    <relativePath>${relativePath}</relativePath>\n  </parent>\n`;
    seed(root, {
      "modules/model/pom.xml": `<project>\n${parent("../../pom.xml")}  <artifactId>model</artifactId>\n  <dependencies>\n  </dependencies>\n</project>\n`,
      "modules/reports/pom.xml": `<project>\n${parent("../../pom.xml")}  <artifactId>reports-parent</artifactId>\n  <packaging>pom</packaging>\n  <modules>\n    <module>reports-core</module>\n    <module>reports-api</module>\n  </modules>\n</project>\n`,
      "modules/reports/reports-core/pom.xml":
        "<project>\n  <parent>\n    <groupId>com.example</groupId>\n    <artifactId>reports-parent</artifactId>\n    <version>${revision}</version>\n  </parent>\n  <artifactId>reports</artifactId>\n" +
        "  <dependencies>\n    <dependency>\n      <groupId>com.example</groupId>\n      <artifactId>model</artifactId>\n    </dependency>\n    <dependency>\n      <groupId>org.junit.jupiter</groupId>\n      <artifactId>junit-jupiter</artifactId>\n      <version>5.13.4</version>\n      <scope>test</scope>\n    </dependency>\n  </dependencies>\n</project>\n",
      "modules/reports/reports-api/pom.xml":
        "<project>\n  <parent>\n    <groupId>com.example</groupId>\n    <artifactId>reports-parent</artifactId>\n    <version>${revision}</version>\n  </parent>\n  <artifactId>reports-api</artifactId>\n</project>\n",
    });
    const entries = parseEntries({
      modules: [
        { slug: "model", codeRoots: ["modules/model"], package: "com.example:model" },
        { slug: "reports", codeRoots: ["modules/reports"], package: "com.example:reports", dependsOn: ["model"] },
      ],
    });
    return { root, shape: { multi: true, implicit: false, modules: dependencyOrder(entries), deployables: impliedDeployables(entries) } };
  }

  it("targets the release of the JDK that scaffolded it, and says so", () => {
    // A constant 21 here failed every build on a machine whose JDK was
    // older, on a line the developer had to find and edit first.
    const { root, shape } = mavenSolution();
    const restore = setJavaSource(() => 'openjdk version "17.0.9" 2023-10-17 LTS\n');
    try {
      const result = ensureRootFiles(root, shape);
      assert.match(readFileSync(join(root, "pom.xml"), "utf8"), /<maven\.compiler\.release>17<\/maven\.compiler\.release>/);
      assert.ok(result?.notes.some((note) => /targets Java 17, the JDK that scaffolded it/.test(note)), result?.notes.join(" | "));
    } finally {
      restore();
    }
  });

  it("takes the stated default, and names it as one, when no JDK answers", () => {
    const { root, shape } = mavenSolution();
    const restore = setJavaSource(() => null);
    try {
      const result = ensureRootFiles(root, shape);
      assert.match(readFileSync(join(root, "pom.xml"), "utf8"), /<maven\.compiler\.release>17<\/maven\.compiler\.release>/);
      assert.ok(result?.notes.some((note) => /the stated default/.test(note)), result?.notes.join(" | "));
    } finally {
      restore();
    }
    // The 1.x scheme every JDK before 9 printed, and a line nobody recognises.
    assert.equal(javaReleaseOf('java version "1.8.0_392"'), 8);
    assert.equal(javaReleaseOf("no java here"), null);
  });

  it("ignores Maven's own output, which lands inside the module it built, and leaves an existing ignore file alone", () => {
    // Measured on the Java walk: mvn writes modules/<slug>/target/ and
    // .flattened-pom.xml under the module's own code roots, so the source
    // digest moved with the build and the same source packed to a new dev
    // version every time.
    const { root, shape } = mavenSolution();
    ensureRootFiles(root, shape);
    const ignore = readFileSync(join(root, ".gitignore"), "utf8");
    assert.match(ignore, /^target\/$/m);
    assert.match(ignore, /^\.flattened-pom\.xml$/m);

    const own = mavenSolution();
    const theirs = "# ours\nbuild/\n";
    seed(own.root, { ".gitignore": theirs });
    const second = ensureRootFiles(own.root, own.shape);
    assert.ok(second?.skipped.includes(".gitignore"), second?.skipped.join(", "));
    assert.equal(readFileSync(join(own.root, ".gitignore"), "utf8"), theirs);
  });

  it("lays the root files, packs one reactor per module into the file repository under the dev version, and manages the one pin in the parent POM", () => {
    const { root, shape } = mavenSolution();
    const maven = ecosystemNamed("maven");
    const written = ensureRootFiles(root, shape);
    assert.deepEqual(written?.written, ["pom.xml", "packages/.gitattributes", "packages/README.md", ".gitignore"]);
    const pom = readFileSync(join(root, "pom.xml"), "utf8");
    // The parent lists the modules, takes the CI-friendly revision, declares
    // the committed file repository and manages the deploy and flatten plugins.
    assert.match(pom, /<module>modules\/model<\/module>\s*<module>modules\/reports<\/module>/);
    assert.match(pom, /<version>\$\{revision\}<\/version>/);
    assert.match(pom, /<revision>0\.1\.0-SNAPSHOT<\/revision>/);
    assert.match(pom, /<url>file:\/\/\/\$\{maven\.multiModuleProjectDirectory\}\/packages<\/url>/);
    assert.match(pom, /maven-deploy-plugin/);
    assert.match(pom, /flatten-maven-plugin/);
    assert.match(readFileSync(join(root, "packages/.gitattributes"), "utf8"), /# \*\.jar filter=lfs/);

    // The module's packable projects are its jars, built through its aggregator in one command.
    const reports = shape.modules.find((entry) => entry.slug === "reports")!;
    const targets = maven.packableProjects(root, reports);
    assert.deepEqual(targets, [
      { project: "modules/reports/reports-api/pom.xml", packageId: "com.example:reports-api", via: "modules/reports/pom.xml" },
      { project: "modules/reports/reports-core/pom.xml", packageId: "com.example:reports", via: "modules/reports/pom.xml" },
    ]);
    const version = "0.1.0-dev.20260907.1.gabc1234";
    const output = join(root, "packages");
    assert.deepEqual(maven.packArgv("modules/reports/pom.xml", output, version), [
      "mvn", "-B", "-f", "modules/reports/pom.xml", "-DskipTests", `-Drevision=${version}`,
      `-DaltDeploymentRepository=modules::${pathToFileURL(output).href}`, "deploy",
    ]);
    // The artifact lands in repository layout; the base version resolves
    // through ${revision} up to the root's property.
    assert.equal(maven.packagedArtifact("com.example:reports", version), `com/example/reports/${version}/reports-${version}.jar`);
    assert.equal(maven.baseVersion(root, "modules/reports/reports-core/pom.xml"), "0.1.0");

    // One managed dependency per id in the parent POM, replaced in place.
    maven.writeCentralPin(root, "com.example:model", "0.1.0-dev.20260907.1.g1111111");
    maven.writeCentralPin(root, "com.example:model", "0.1.0-dev.20260907.2.g2222222");
    assert.equal(maven.centralPins(root).get("com.example:model"), "0.1.0-dev.20260907.2.g2222222");
    assert.equal((readFileSync(join(root, "pom.xml"), "utf8").match(/<artifactId>model<\/artifactId>/g) ?? []).length, 1);
    // A consumer's dependency takes the managed version; one carrying its own is a fact the gate names.
    assert.deepEqual(maven.packageReferences(root, "modules/reports/reports-core/pom.xml"), [
      { project: "modules/reports/reports-core/pom.xml", packageId: "com.example:model", ownVersion: null },
      { project: "modules/reports/reports-core/pom.xml", packageId: "org.junit.jupiter:junit-jupiter", ownVersion: "5.13.4" },
    ]);
    // The focused checkout's convenience file names the module's own POM.
    assert.equal(maven.convenienceFile(root, reports, maven.projectFiles(root, reports)), ".mvn/maven.config");
    assert.equal(readFileSync(join(root, ".mvn/maven.config"), "utf8"), "-f\nmodules/reports/pom.xml\n");
  });

  it("reads a public declaration with its Javadoc from the api module and skips what is not public", () => {
    const { root, shape } = mavenSolution();
    seed(root, {
      "modules/reports/reports-api/src/main/java/com/example/reports/api/Reports.java": [
        "package com.example.reports.api;",
        "",
        "/**",
        " * What reports promises.",
        " * @since 1.0",
        " */",
        "public interface Reports {",
        "    /** Renders one report by name. */",
        "    String render(String name);",
        "",
        "    /** Renders with the default name; part of the promise, though it says default and not public. */",
        "    default String render() { return render(\"default\"); }",
        "",
        "    /** The empty reports; a static factory is public too, and its body is not. */",
        "    static Reports none() {",
        "        String empty = \"\";",
        "        return name -> empty;",
        "    }",
        "",
        "    private String hidden() { return \"\"; }",
        "}",
        "",
      ].join("\n"),
      "modules/reports/reports-api/src/main/java/com/example/reports/api/ReportName.java": [
        "package com.example.reports.api;",
        "",
        "/** A report's name, validated once. */",
        "public final class ReportName {",
        "    private final String value;",
        "",
        "    /** Wraps a name. */",
        "    public ReportName(String value) { this.value = value; }",
        "",
        "    @Override",
        "    public String toString() { return value; }",
        "}",
        "",
      ].join("\n"),
      "modules/reports/reports-core/src/main/java/com/example/reports/HtmlReports.java":
        "package com.example.reports;\n\n/** The implementation, which is not the surface. */\npublic final class HtmlReports implements com.example.reports.api.Reports {\n}\n",
    });
    const reports = shape.modules.find((entry) => entry.slug === "reports")!;
    const surface = ecosystemNamed("maven").readSurface(root, reports, "com.example:reports");
    assert.deepEqual(
      surface.map((entry) => [entry.declaration, entry.summary]),
      [
        ["public final class ReportName", "A report's name, validated once."],
        ["public ReportName(String value)", "Wraps a name."],
        ["public String toString()", ""],
        ["public interface Reports", "What reports promises."],
        ["String render(String name)", "Renders one report by name."],
        ["default String render()", "Renders with the default name; part of the promise, though it says default and not public."],
        ["static Reports none()", "The empty reports; a static factory is public too, and its body is not."],
      ],
    );
    assert.ok(surface.every((entry) => entry.file.startsWith("modules/reports/reports-api/")));
  });

  it("packs a Maven sibling under a debugging grant through the pack handed in and lays no overlay, where .NET lays the overlay and packs nothing", () => {
    const root = tempDir("grants-");
    seed(root, {
      "modules/model/pom.xml": "<project>\n  <groupId>com.example</groupId>\n  <artifactId>model</artifactId>\n  <version>1.0.0</version>\n</project>\n",
      "modules/persister/src/CsvPersister/CsvPersister.csproj": "<Project />\n",
    });
    const entries = parseEntries({
      modules: [
        { slug: "model", codeRoots: ["modules/model"], package: "com.example:model" },
        { slug: "persister", codeRoots: ["modules/persister"], package: "CsvPersister" },
      ],
    });
    const shape: SolutionShape = { multi: true, implicit: false, modules: dependencyOrder(entries), deployables: impliedDeployables(entries) };
    const [model, persister] = shape.modules;
    const packed: string[] = [];
    const overlay = join(root, ".dabbler/overlay.targets");

    layDebugGrants(root, shape, [model!], model!, (slug) => packed.push(slug));
    assert.deepEqual(packed, ["model"]);
    assert.equal(existsSync(overlay), false);
    assert.throws(() => layDebugGrants(root, shape, [model!], model!, null), /no pack was handed in/);

    layDebugGrants(root, shape, [model!, persister!], persister!, (slug) => packed.push(slug));
    assert.deepEqual(packed, ["model"]);
    assert.match(readFileSync(overlay, "utf8"), /PackageReference Remove="CsvPersister"/);
    // A revoke regenerates from what remains: nothing, so no overlay.
    layDebugGrants(root, shape, [], null, null);
    assert.equal(existsSync(overlay), false);
  });
});

describe("the root build files", () => {
  it("appear with the second module, are never rewritten, and never appear for one", () => {
    const root = tempDir("roots-");
    seed(root, {
      "modules/model/src/CsvModel/CsvModel.csproj": "<Project />\n",
      "modules/persister/README.md": "an empty module folder, no project yet\n",
    });
    const entries = (slugs: string[]) =>
      ({
        multi: slugs.length > 1,
        implicit: false,
        modules: slugs.map((slug) => ({ slug, codeRoots: [`modules/${slug}`], dependsOn: [] })),
      }) as unknown as Parameters<typeof ensureRootFiles>[1];
    // One module: nothing, ever.
    assert.equal(ensureRootFiles(root, entries(["model"])), null);
    // Two: the six files, from the ecosystem of the first module that holds
    // a project file; the empty folder does not decide anything.
    const second = ensureRootFiles(root, entries(["persister", "model"]));
    assert.deepEqual(second?.written, [
      "nuget.config",
      "Directory.Packages.props",
      "Directory.Build.props",
      "Directory.Build.targets",
      "packages/.gitattributes",
      "packages/README.md",
    ]);
    assert.match(readFileSync(join(root, "nuget.config"), "utf8"), /value="packages"/);
    assert.match(readFileSync(join(root, "Directory.Build.targets"), "utf8"), /\.dabbler\/overlay\.targets/);
    assert.match(readFileSync(join(root, "Directory.Build.props"), "utf8"), /EnableSourceLink Condition="'\$\(DABBLER_DRIVEN\)' != ''">false/);
    // A third entry rewrites nothing: an edited props file stays edited.
    writeFileSync(join(root, "Directory.Packages.props"), "<Project><!-- mine --></Project>\n", "utf8");
    const third = ensureRootFiles(root, entries(["persister", "model", "listener"]));
    assert.deepEqual(third?.written, []);
    assert.equal(third?.skipped.length, 6);
    assert.match(readFileSync(join(root, "Directory.Packages.props"), "utf8"), /mine/);
    // Two modules that are still empty folders: the files wait, and say so.
    const bare = tempDir("roots-");
    seed(bare, { "modules/a/README.md": "\n", "modules/b/README.md": "\n" });
    const waiting = ensureRootFiles(bare, entries(["a", "b"]));
    assert.deepEqual(waiting?.written, []);
    assert.match(waiting?.notes[0] ?? "", /wait for the first one that does/);
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
