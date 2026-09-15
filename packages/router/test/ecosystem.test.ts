// The root build files a solution of several projects gets, for .NET and for
// Maven, from its project graph: when they appear, what they hold, and that
// they are never rewritten.

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, it } from "node:test";

import { ensureRootFiles, ignoreBuildOutput, javaReleaseOf, setJavaSource } from "../src/ecosystem.ts";
import { readProjectGraph } from "../src/projectGraph.ts";
import { seed, tempDir } from "./support/answers.ts";

describe("the Maven root files", () => {
  /** Two Maven modules and no parent POM yet: the model, and the reports depending on it. */
  function mavenSolution(): string {
    const root = tempDir("maven-");
    const parent = "  <parent>\n    <groupId>com.example</groupId>\n    <artifactId>solution-parent</artifactId>\n    <version>0.1.0-SNAPSHOT</version>\n    <relativePath>../../pom.xml</relativePath>\n  </parent>\n";
    seed(root, {
      "modules/model/pom.xml": `<project>\n${parent}  <artifactId>model</artifactId>\n</project>\n`,
      "modules/reports/pom.xml":
        `<project>\n${parent}  <artifactId>reports</artifactId>\n` +
        "  <dependencies>\n    <dependency>\n      <groupId>com.example</groupId>\n      <artifactId>model</artifactId>\n      <version>${project.version}</version>\n    </dependency>\n  </dependencies>\n</project>\n",
    });
    return root;
  }

  it("lists the modules in the parent POM and declares no local repository, managed pin or deploy or flatten plugin", () => {
    const root = mavenSolution();
    const written = ensureRootFiles(root, readProjectGraph(root));
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
    const root = mavenSolution();
    const restore = setJavaSource(() => 'openjdk version "17.0.9" 2023-10-17 LTS\n');
    try {
      const result = ensureRootFiles(root, readProjectGraph(root));
      assert.match(readFileSync(join(root, "pom.xml"), "utf8"), /<maven\.compiler\.release>17<\/maven\.compiler\.release>/);
      assert.ok(result?.notes.some((note) => /targets Java 17, the JDK that scaffolded it/.test(note)), result?.notes.join(" | "));
    } finally {
      restore();
    }
  });

  it("takes the stated default, and names it as one, when no JDK answers", () => {
    const root = mavenSolution();
    const restore = setJavaSource(() => null);
    try {
      const result = ensureRootFiles(root, readProjectGraph(root));
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
    // before the modules exist, so a write-once scaffold skipped the file and
    // the rule never appeared.
    const root = mavenSolution();
    const bootstrapped = "# machine-side state\n.dabbler/\n";
    seed(root, { ".gitignore": bootstrapped });
    const first = ensureRootFiles(root, readProjectGraph(root));
    // Somebody else's file that gained a line is CHANGED, not written:
    // bootstrap wrote it, and this scaffold does not claim it.
    assert.ok(first?.changed?.includes(".gitignore"), (first?.changed ?? []).join(", "));
    assert.ok(!first?.written.includes(".gitignore"));
    const ignore = readFileSync(join(root, ".gitignore"), "utf8");
    assert.match(ignore, /^target\/$/m);
    // Theirs is still there, and still first.
    assert.ok(ignore.startsWith(bootstrapped), ignore);
  });

  it("writes nothing once the root has its parent POM", () => {
    const root = mavenSolution();
    ensureRootFiles(root, readProjectGraph(root));
    const pom = readFileSync(join(root, "pom.xml"), "utf8");
    const ignore = readFileSync(join(root, ".gitignore"), "utf8");
    assert.equal(ensureRootFiles(root, readProjectGraph(root)), null);
    assert.equal(readFileSync(join(root, "pom.xml"), "utf8"), pom);
    assert.equal(readFileSync(join(root, ".gitignore"), "utf8"), ignore);
  });
});

describe("the root build files", () => {
  it("name the solution after the directory when the root is given as `.`", () => {
    // `dabbler modules create .` wrote `..slnx`: the name was taken from the
    // argument as typed, and `.` has no name of its own.
    const root = tempDir("dot-");
    seed(root, {
      "modules/model/src/CsvModel/CsvModel.csproj": "<Project />\n",
      "modules/persister/src/CsvPersister/CsvPersister.csproj": "<Project />\n",
    });
    const previous = process.cwd();
    process.chdir(root);
    try {
      const written = ensureRootFiles(".", readProjectGraph("."));
      assert.ok(written?.written.includes(`${basename(root)}.slnx`), written?.written.join(", "));
    } finally {
      process.chdir(previous);
    }
    assert.ok(!readdirSync(root).includes("..slnx"), readdirSync(root).join(", "));
  });

  it("appear with the second project, hold no packages source and no central pin file, are never rewritten, and never appear for one", () => {
    const root = tempDir("roots-");
    seed(root, { "modules/model/src/CsvModel/CsvModel.csproj": "<Project />\n" });
    // One project: nothing, because it builds from its own folder.
    assert.equal(ensureRootFiles(root, readProjectGraph(root)), null);
    // Two: the three files and the ignore rules.
    seed(root, { "modules/persister/src/CsvPersister/CsvPersister.csproj": "<Project />\n" });
    const second = ensureRootFiles(root, readProjectGraph(root));
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
    // A third project rewrites nothing: the root has its solution file, and an
    // edited props file stays edited.
    writeFileSync(join(root, "Directory.Build.props"), "<Project><!-- mine --></Project>\n", "utf8");
    seed(root, { "modules/listener/src/Listener/Listener.csproj": "<Project />\n" });
    assert.equal(ensureRootFiles(root, readProjectGraph(root)), null);
    assert.match(readFileSync(join(root, "Directory.Build.props"), "utf8"), /mine/);
  });

  it("adds MSBuild's output to the ignore file bootstrap wrote, keeping what it says", () => {
    const bootstrapped = "# machine-side state\n.dabbler/\n";
    const root = tempDir("dotnet-roots-");
    seed(root, {
      ".gitignore": bootstrapped,
      "modules/model/src/CsvModel/CsvModel.csproj": "<Project />\n",
      "modules/persister/src/CsvPersister/CsvPersister.csproj": "<Project />\n",
    });
    const first = ensureRootFiles(root, readProjectGraph(root));
    // Bootstrap's file, which gained two lines: changed, not written.
    assert.ok(first?.changed?.includes(".gitignore"), (first?.changed ?? []).join(", "));
    assert.ok(!first?.written.includes(".gitignore"));
    const ignore = readFileSync(join(root, ".gitignore"), "utf8");
    assert.match(ignore, /^bin\/$/m);
    assert.match(ignore, /^obj\/$/m);
    // Theirs is still there, and still first.
    assert.ok(ignore.startsWith(bootstrapped), ignore);
  });
});

describe("the build output a step's check writes", () => {
  it("is ignored where the parent POM already exists, which writes no root files", () => {
    // The walk's reactor: a developer's own parent POM, so the first
    // `mvn test` a check ran wrote target/ and nothing had ignored it.
    const root = tempDir("maven-");
    seed(root, {
      "pom.xml":
        "<project>\n  <groupId>com.example</groupId>\n  <artifactId>greeting-parent</artifactId>\n" +
        "  <packaging>pom</packaging>\n  <modules>\n    <module>greeting-lib</module>\n    <module>greeting-app</module>\n  </modules>\n</project>\n",
      "greeting-lib/pom.xml": "<project>\n  <artifactId>greeting-lib</artifactId>\n</project>\n",
      "greeting-app/pom.xml": "<project>\n  <artifactId>greeting-app</artifactId>\n</project>\n",
    });
    const graph = readProjectGraph(root);
    assert.equal(ensureRootFiles(root, graph), null);
    assert.deepEqual(ignoreBuildOutput(root, graph), [".gitignore"]);
    assert.match(readFileSync(join(root, ".gitignore"), "utf8"), /^target\/$/m);
    assert.deepEqual(ignoreBuildOutput(root, graph), []);
  });
});
