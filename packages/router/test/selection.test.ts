// The test selector: what the repository declares a test to be, how a change
// reaches a test, and which commands a selection sanctions. A seeded
// directory stands in for the checkout; no git. The policy that makes a
// targeted run evidence is preverify.test.ts.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { runnableCommands } from "../src/affected.ts";
import {
  SelectionResult,
  declaresTests,
  loadSelectionConfig,
  namesATest,
  selectTests,
  selectionTestRoots,
  targetedCommand,
  type SelectionConfig,
} from "../src/checks.ts";
import { seed, tempDir } from "./support/answers.ts";

function tree(): string {
  const repo = tempDir();
  seed(repo, { "ai_router/engine.py": "VALUE = 1\n", "tests/test_engine.py": "X = 1\n", "tests/test_widget.py": "X = 1\n", "tests/test_smoke.py": "", "tests/helpers.py": "X = 1\n" });
  return repo;
}

const SELECTION: SelectionConfig = {
  scopes: [{ suite: "python", roots: ["tests"], glob: "test_*.py", testName: "test_{name}.py" }],
  smoke: ["tests/test_smoke.py"],
};

describe("what the selector calls a test", () => {
  it("takes the repository's declaration rather than a naming convention", () => {
    // A helper that sits beside the tests is not one: treating it as mapped
    // would return clean targeted evidence for a change that can break
    // every test using it.
    const repo = tree();
    const changed = selectTests(repo, ["tests/test_engine.py"], SELECTION);
    assert.deepEqual(changed.testPaths, ["tests/test_engine.py"]);
    assert.equal(changed.selected[0]?.reason, "changed-test");
    const helper = selectTests(repo, ["tests/helpers.py"], SELECTION);
    assert.deepEqual(helper.unknownPaths, ["tests/helpers.py"]);
    assert.deepEqual(helper.testPaths, ["tests/test_smoke.py"]);
  });

  it("selects the tests named after a changed .cs, .java and .ts file from each suite's own roots, and buys the smoke tests for a source file with none", () => {
    const repo = tempDir();
    seed(repo, {
      "src/Csv/CsvSerializer.cs": "class CsvSerializer {}\n",
      "tests/Csv.Tests/CsvSerializerTests.cs": "class CsvSerializerTests {}\n",
      "src/main/java/csv/Adder.java": "class Adder {}\n",
      "src/test/java/csv/AdderTest.java": "class AdderTest {}\n",
      "packages/router/src/checks.ts": "export {};\n",
      "packages/router/test/checks.test.ts": "export {};\n",
      "packages/router/src/drive.ts": "export {};\n",
      "packages/router/test/schema.test.ts": "export {};\n",
    });
    const selection: SelectionConfig = {
      scopes: [
        { suite: "dotnet", roots: ["tests"], glob: "*Tests.cs", testName: "{name}Tests.cs" },
        { suite: "maven", roots: ["src/test/java"], glob: "*Test.java", testName: "{name}Test.java" },
        { suite: "typescript", roots: ["packages/router/test"], glob: "*.test.ts", testName: "{name}.test.ts" },
      ],
      smoke: ["packages/router/test/schema.test.ts"],
    };
    const named = selectTests(repo, ["src/Csv/CsvSerializer.cs", "src/main/java/csv/Adder.java", "packages/router/src/checks.ts", "README.md"], selection);
    assert.deepEqual(
      named.selected.map((entry) => [entry.path, entry.reason, entry.selectedBy, entry.suite]),
      [
        ["packages/router/test/checks.test.ts", "named-test", "packages/router/src/checks.ts", "typescript"],
        ["src/test/java/csv/AdderTest.java", "named-test", "src/main/java/csv/Adder.java", "maven"],
        ["tests/Csv.Tests/CsvSerializerTests.cs", "named-test", "src/Csv/CsvSerializer.cs", "dotnet"],
      ],
    );
    assert.deepEqual(named.risks, []);
    const unnamed = selectTests(repo, ["packages/router/src/drive.ts"], selection);
    assert.deepEqual(unnamed.unknownPaths, ["packages/router/src/drive.ts"]);
    assert.deepEqual(unnamed.testPaths, ["packages/router/test/schema.test.ts"]);
  });

  it("maps the file the framework installed at registration to nothing, rather than to nobody", () => {
    // `session start` edits the hook file (removing the Stop hook an earlier
    // framework installed) before anything could name a test for it;
    // reporting it as selection_unknown told every claude-code session its
    // first change set was unmapped.
    const installed = selectTests(tree(), [".claude/settings.json"], SELECTION);
    assert.deepEqual(installed.unknownPaths, []);
    assert.deepEqual(installed.risks, []);
    assert.deepEqual(installed.testPaths, []);
  });
});

describe("reading the selection declaration", () => {
  const TWO_ECOSYSTEMS = {
    testing: {
      suites: [
        { name: "maven", command: "mvn -q test", covers: ["src/"], test_roots: ["src/test/java"], test_glob: "*Test.java" },
        { name: "dotnet", command: "dotnet test", covers: ["src/"], test_roots: ["test"], test_glob: "*Tests.cs" },
      ],
    },
  };

  it("reads the retired hand-written maps without refusing them, refuses a test root with no glob and a test name with no {name}, and refuses the retired repository-wide test_roots by name", () => {
    const maps = loadSelectionConfig({ testing: { selection: { repo_wide: ["."], rules: [{ when: "ai_router/", select: ["tests/test_a.py"] }] } } });
    assert.equal(maps.ok, true);
    assert.deepEqual(maps.config, { scopes: [], smoke: [] });
    const noGlob = loadSelectionConfig({ testing: { suites: [{ name: "maven", command: "mvn -q test", test_roots: ["src/test/java"] }] } });
    assert.ok(!noGlob.ok && noGlob.errors.some((error) => error.includes("test_glob")));
    const fixedName = loadSelectionConfig({ testing: { suites: [{ name: "maven", command: "mvn -q test", test_roots: ["src/test/java"], test_glob: "*Test.java", test_name: "AllTest.java" }] } });
    assert.ok(!fixedName.ok && fixedName.errors.some((error) => error.includes("{name}")));
    const retired = loadSelectionConfig({ testing: { suites: [{ name: "python", command: "pytest", test_roots: ["tests"], test_glob: "test_*.py" }], selection: { test_roots: ["spec"], test_glob: "*_spec.py" } } });
    assert.ok(!retired.ok && retired.errors.some((error) => error.includes("testing.suites")));
  });

  it("confines each suite's convention to that suite's roots, and gives a suite that runs no test files no scope", () => {
    const selection = loadSelectionConfig(TWO_ECOSYSTEMS).config;
    assert.equal(namesATest("src/test/java/AdderTest.java", selection), true);
    assert.equal(namesATest("test/AdderTests.cs", selection), true);
    assert.equal(namesATest("src/test/java/AdderTests.cs", selection), false);
    assert.equal(namesATest("src/main/java/Adder.java", selection), false);
    assert.equal(declaresTests(selection), true);
    assert.deepEqual(selectionTestRoots(selection), ["src/test/java", "test"]);
    const smoke = loadSelectionConfig({ testing: { suites: [{ name: "smoke", command: "python smoke.py" }] } });
    assert.ok(smoke.ok);
    assert.deepEqual(smoke.config.scopes, []);
    assert.equal(declaresTests(smoke.config), false);
  });
});

describe("the command a selection sanctions", () => {
  it("offers the declaration to make where no suite is declared, and says a declared suite is not expensive rather than that none is declared", () => {
    const none = runnableCommands([], new SelectionResult());
    assert.equal(none.length, 1);
    assert.ok(!none[0].includes("pytest") && none[0].includes("testing.suites"));
    const cheap = runnableCommands([], new SelectionResult(), 1);
    assert.ok(cheap[0].includes("expensive") && !cheap[0].includes("no suite is declared"));
  });

  it("renders a suite's selection command from the selected paths or their names, quoting what a shell would split", () => {
    const result = new SelectionResult({
      selected: [
        { path: "tests/Csv.Tests/CsvSerializerTests.cs", reason: "named-test", selectedBy: "src/Csv/CsvSerializer.cs", suite: "dotnet" },
        { path: "tests/Csv.Tests/CsvReaderTests.cs", reason: "named-test", selectedBy: "src/Csv/CsvReader.cs", suite: "dotnet" },
      ],
    });
    assert.equal(
      targetedCommand("dotnet test", result, { select: "dotnet test --filter {names}", selectSeparator: "|" }),
      'dotnet test --filter "CsvReaderTests|CsvSerializerTests"',
    );
    assert.equal(
      targetedCommand("mvn -q test", result, { select: "mvn -q test -Dtest={names}" }),
      "mvn -q test -Dtest=CsvReaderTests,CsvSerializerTests",
    );
    assert.equal(
      targetedCommand("node run.mjs", result, { select: "node run.mjs {paths}" }),
      "node run.mjs tests/Csv.Tests/CsvReaderTests.cs tests/Csv.Tests/CsvSerializerTests.cs",
    );
    assert.equal(targetedCommand("dotnet test", new SelectionResult(), { select: "dotnet test --filter {names}" }), "");
  });
});
