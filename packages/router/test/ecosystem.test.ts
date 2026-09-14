// The ecosystem seam: which ecosystem a module is, from what its roots
// contain, the refusals -- neither, both -- and the root build files a
// multi-module solution gets for .NET and for Maven.

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, it } from "node:test";

import { parse as parseYaml } from "yaml";

import { ensureRootFilesWithSuite } from "../src/bootstrap/detect.ts";
import { EcosystemError, ecosystemOf, ensureRootFiles, javaReleaseOf, setJavaSource } from "../src/ecosystem.ts";
import { type SolutionShape, dependencyOrder, parseEntries, impliedDeployables } from "../src/modules.ts";
import { runnableCommands } from "../src/affected.ts";
import { SelectionResult } from "../src/checks.ts";
import { loadSuitesChecked } from "../src/testEvidence.ts";
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
      { slug: "model", codeRoots: ["modules/model"] },
      { slug: "reports", codeRoots: ["modules/reports"] },
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
  });
});

describe("the Maven root files", () => {
  /** A two-module Maven solution: the model, and the reports depending on it in the same reactor. */
  function mavenSolution(): { root: string; shape: SolutionShape } {
    const root = tempDir("maven-");
    const parent = "  <parent>\n    <groupId>com.example</groupId>\n    <artifactId>solution-parent</artifactId>\n    <version>0.1.0-SNAPSHOT</version>\n    <relativePath>../../pom.xml</relativePath>\n  </parent>\n";
    seed(root, {
      "modules/model/pom.xml": `<project>\n${parent}  <artifactId>model</artifactId>\n</project>\n`,
      "modules/reports/pom.xml":
        `<project>\n${parent}  <artifactId>reports</artifactId>\n` +
        "  <dependencies>\n    <dependency>\n      <groupId>com.example</groupId>\n      <artifactId>model</artifactId>\n      <version>${project.version}</version>\n    </dependency>\n  </dependencies>\n</project>\n",
    });
    const entries = parseEntries({
      modules: [
        { slug: "model", codeRoots: ["modules/model"] },
        { slug: "reports", codeRoots: ["modules/reports"], dependsOn: ["model"] },
      ],
    });
    return { root, shape: { multi: true, implicit: false, modules: dependencyOrder(entries), deployables: impliedDeployables(entries) } };
  }

  it("lists the modules in the parent POM and declares no local repository, managed pin or deploy or flatten plugin", () => {
    const { root, shape } = mavenSolution();
    const written = ensureRootFiles(root, shape);
    assert.deepEqual(written?.written, ["pom.xml", ".gitignore"]);
    const pom = readFileSync(join(root, "pom.xml"), "utf8");
    assert.match(pom, /<groupId>com\.example<\/groupId>/);
    assert.match(pom, /<module>modules\/model<\/module>\s*<module>modules\/reports<\/module>/);
    for (const absent of [/<repositories>/, /<dependencyManagement>/, /maven-deploy-plugin/, /flatten-maven-plugin/, /\$\{revision\}/]) {
      assert.doesNotMatch(pom, absent);
    }
    assert.equal(existsSync(join(root, "packages")), false);
  });

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

  it("adds Maven's output to an ignore file somebody else already wrote, keeping what it says", () => {
    // Measured on the Java walkthrough: `dabbler bootstrap` writes .gitignore
    // before the second module is declared, so a write-once scaffold skipped
    // the file and the rule never appeared.
    const { root, shape } = mavenSolution();
    const bootstrapped = "# machine-side state\n.dabbler/\n";
    seed(root, { ".gitignore": bootstrapped });
    const first = ensureRootFiles(root, shape);
    // Somebody else's file that gained a line is CHANGED, not written:
    // bootstrap wrote it, and this scaffold does not claim it.
    assert.ok(first?.changed?.includes(".gitignore"), (first?.changed ?? []).join(", "));
    assert.ok(!first?.written.includes(".gitignore"));
    const ignore = readFileSync(join(root, ".gitignore"), "utf8");
    assert.match(ignore, /^target\/$/m);
    // Theirs is still there, and still first.
    assert.ok(ignore.startsWith(bootstrapped), ignore);
  });

  it("adds nothing the second time, and says the file was skipped", () => {
    const { root, shape } = mavenSolution();
    ensureRootFiles(root, shape);
    const written = readFileSync(join(root, ".gitignore"), "utf8");
    const second = ensureRootFiles(root, shape);
    assert.ok(second?.skipped.includes(".gitignore"), second?.skipped.join(", "));
    assert.equal(readFileSync(join(root, ".gitignore"), "utf8"), written);
  });
});

describe("the root build files", () => {
  it("name the solution after the directory when the root is given as `.`", () => {
    // `dabbler modules create .` wrote `..slnx`: the name was taken from the
    // argument as typed, and `.` has no name of its own.
    const root = tempDir("dot-");
    seed(root, { "modules/model/src/CsvModel/CsvModel.csproj": "<Project />\n" });
    const shape = {
      multi: true,
      implicit: false,
      modules: ["model", "persister"].map((slug) => ({ slug, codeRoots: [`modules/${slug}`], dependsOn: [] })),
    } as unknown as Parameters<typeof ensureRootFiles>[1];
    const previous = process.cwd();
    process.chdir(root);
    try {
      const written = ensureRootFiles(".", shape);
      assert.ok(written?.written.includes(`${basename(root)}.slnx`), written?.written.join(", "));
    } finally {
      process.chdir(previous);
    }
    assert.ok(!readdirSync(root).includes("..slnx"), readdirSync(root).join(", "));
  });

  it("appear with the second module, hold no packages source and no central pin file, are never rewritten, and never appear for one", () => {
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
    // Two: the three files and the ignore rules, from the ecosystem of the
    // first module that holds a project file; the empty folder decides nothing.
    const second = ensureRootFiles(root, entries(["persister", "model"]));
    assert.deepEqual(second?.written, [
      "Directory.Build.props",
      "Directory.Build.targets",
      `${basename(root)}.slnx`,
      ".gitignore",
    ]);
    for (const absent of ["nuget.config", "Directory.Packages.props", "packages"]) {
      assert.equal(existsSync(join(root, absent)), false, absent);
    }
    assert.match(readFileSync(join(root, `${basename(root)}.slnx`), "utf8"), /<Project Path="modules\/model\/src\/CsvModel\/CsvModel\.csproj" \/>/);
    // A third entry rewrites nothing: an edited props file stays edited.
    writeFileSync(join(root, "Directory.Build.props"), "<Project><!-- mine --></Project>\n", "utf8");
    const third = ensureRootFiles(root, entries(["persister", "model", "listener"]));
    assert.deepEqual(third?.written, []);
    assert.equal(third?.skipped.length, 4);
    assert.match(readFileSync(join(root, "Directory.Build.props"), "utf8"), /mine/);
    // Two modules that are still empty folders: the files wait, and say so.
    const bare = tempDir("roots-");
    seed(bare, { "modules/a/README.md": "\n", "modules/b/README.md": "\n" });
    const waiting = ensureRootFiles(bare, entries(["a", "b"]));
    assert.deepEqual(waiting?.written, []);
    assert.match(waiting?.notes[0] ?? "", /wait for the first one that does/);
  });

  it("adds MSBuild's output to the ignore file bootstrap wrote, keeping what it says", () => {
    const bootstrapped = "# machine-side state\n.dabbler/\n";
    const root = tempDir("dotnet-roots-");
    seed(root, {
      ".gitignore": bootstrapped,
      "modules/model/src/CsvModel/CsvModel.csproj": "<Project />\n",
      "modules/persister/README.md": "an empty module folder, no project yet\n",
    });
    const shape = {
      multi: true,
      implicit: false,
      modules: ["model", "persister"].map((slug) => ({ slug, codeRoots: [`modules/${slug}`], dependsOn: [] })),
    } as unknown as Parameters<typeof ensureRootFiles>[1];
    const first = ensureRootFiles(root, shape);
    // Bootstrap's file, which gained two lines: changed, not written.
    assert.ok(first?.changed?.includes(".gitignore"), (first?.changed ?? []).join(", "));
    assert.ok(!first?.written.includes(".gitignore"));
    const ignore = readFileSync(join(root, ".gitignore"), "utf8");
    assert.match(ignore, /^bin\/$/m);
    assert.match(ignore, /^obj\/$/m);
    // Theirs is still there, and still first.
    assert.ok(ignore.startsWith(bootstrapped), ignore);
  });

  it("declares the ecosystem's suite the moment the ecosystem is known, and never a second one", () => {
    // Bootstrap ran before any project file existed and honestly declared
    // no suite; nothing came back to it, so the run of record had no
    // command while `affected` printed a passing rule one line above "no
    // suite is declared".
    const root = tempDir("suite-");
    seed(root, {
      "dabbler.yaml": "testing:\n  selection:\n    rules: []\n",
      "modules/model/pom.xml": "<project />\n",
      "modules/reports/pom.xml": "<project />\n",
    });
    const shape = {
      multi: true,
      implicit: false,
      modules: ["model", "reports"].map((slug) => ({ slug, codeRoots: [`modules/${slug}`], dependsOn: [] })),
    } as unknown as Parameters<typeof ensureRootFiles>[1];
    const first = ensureRootFilesWithSuite(root, shape);
    assert.ok(first?.changed?.includes("dabbler.yaml"), (first?.changed ?? []).join(", "));
    assert.match(readFileSync(join(root, "dabbler.yaml"), "utf8"), /- name: maven/);

    // And `affected` now names a command rather than the declaration to make.
    const suites = loadSuitesChecked(parseYaml(readFileSync(join(root, "dabbler.yaml"), "utf8"))).suites;
    const reached = new SelectionResult({
      suites: [{ name: "maven", reason: "the module changed", selectedBy: "modules/model", module: "model" }],
    });
    assert.deepEqual(runnableCommands(suites, reached, suites.length), ["mvn -q test"]);

    // A suite already declared is left as it is: a second call adds none.
    const second = ensureRootFilesWithSuite(root, shape);
    assert.ok(second?.skipped.includes("dabbler.yaml"), second?.skipped.join(", "));
    assert.equal(loadSuitesChecked(parseYaml(readFileSync(join(root, "dabbler.yaml"), "utf8"))).suites.length, 1);

    // And the .NET side declares its suite in the same call, because the
    // same call gave it a root to declare it against. `dotnet test` resolves
    // the project or solution in the directory it runs in, and a solution
    // whose projects all live under modules/ used to have none there
    // (MSB1003): the root files are written FIRST and the detector asked
    // second, so the .slnx this call wrote is what the detector finds.
    const dotnet = tempDir("suite-");
    seed(dotnet, {
      "modules/model/src/CsvModel/CsvModel.csproj": "<Project />\n",
      "modules/store/src/Store/Store.csproj": "<Project />\n",
    });
    const written = ensureRootFilesWithSuite(dotnet, {
      ...shape,
      modules: ["model", "store"].map((slug) => ({ slug, codeRoots: [`modules/${slug}`], dependsOn: [] })),
    } as unknown as Parameters<typeof ensureRootFilesWithSuite>[1]);
    const slnx = readdirSync(dotnet).find((name) => name.endsWith(".slnx"));
    assert.ok(slnx, readdirSync(dotnet).join(", "));
    const solution = readFileSync(join(dotnet, slnx as string), "utf8");
    assert.match(solution, /<Project Path="modules\/model\/src\/CsvModel\/CsvModel\.csproj" \/>/);
    assert.match(solution, /<Project Path="modules\/store\/src\/Store\/Store\.csproj" \/>/);
    // The SDK floor is where the operator meets it: a solution file their
    // SDK cannot open is worse than none.
    assert.match(written?.notes.join(" | ") ?? "", /9\.0\.200/);
    // And the suite is declared, not deferred with a note about why not.
    assert.ok(written?.written.includes("dabbler.yaml"), written?.written.join(", "));
    assert.match(readFileSync(join(dotnet, "dabbler.yaml"), "utf8"), /- name: dotnet/);
    assert.ok(!/no test suite is declared/.test(written?.notes.join(" | ") ?? ""));
  });
});
