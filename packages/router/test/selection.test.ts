// The test selector: what the repository declares a test to be, how a change
// reaches a test, and which commands a selection sanctions. A seeded
// directory stands in for the checkout; no git. The policy that makes a
// targeted run evidence, and the gate, are preverify.test.ts.
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
  type ModuleSelection,
  type SelectionConfig,
} from "../src/checks.ts";
import { seed, tempDir } from "./support/answers.ts";

function tree(): string {
  const repo = tempDir();
  seed(repo, { "ai_router/engine.py": "VALUE = 1\n", "tests/test_engine.py": "X = 1\n", "tests/test_widget.py": "X = 1\n", "tests/test_smoke.py": "", "tests/helpers.py": "X = 1\n" });
  return repo;
}

const SELECTION: SelectionConfig = {
  scopes: [{ suite: "python", roots: ["tests"], glob: "test_*.py" }],
  smoke: ["tests/test_smoke.py"],
  repoWide: ["tests/conftest.py", "pytest.ini"],
  rules: [["docs/", []], ["packages/router/router-config.yaml", ["tests/test_engine.py"]], ["ai_router/engine.py", ["tests/test_engine.py", "tests/test_widget.py"]]],
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

  it("reaches a test from a source file only through a configured rule, naming the path that did it", () => {
    const result = selectTests(tree(), ["ai_router/engine.py"], SELECTION);
    assert.deepEqual(result.testPaths, ["tests/test_engine.py", "tests/test_widget.py"]);
    assert.ok(result.selected.every((s) => s.reason === "configured-rule" && s.selectedBy === "ai_router/engine.py"));
    assert.equal(result.allTestsAffected, false);
  });

  it("buys the smoke tests with uncertainty, reads an empty rule target as a mapping, and proves every test affected only from a declared repository-wide path", () => {
    const unknown = selectTests(tree(), ["scripts/deploy.rb"], SELECTION);
    assert.deepEqual(unknown.unknownPaths, ["scripts/deploy.rb"]);
    assert.equal(unknown.risks[0]?.kind, "selection_unknown");
    assert.deepEqual(unknown.testPaths, ["tests/test_smoke.py"]);
    const mapped = selectTests(tree(), ["docs/plan.md"], SELECTION);
    assert.deepEqual(mapped.testPaths, []);
    assert.deepEqual(mapped.risks, []);
    const wide = selectTests(tree(), ["tests/conftest.py"], SELECTION);
    assert.equal(wide.allTestsAffected, true);
    assert.match(String(wide.allAffectedReason), /conftest/);
  });

  it("maps the file the framework installed at registration to nothing, rather than to nobody", () => {
    // `session start` writes the stop hook before any rule could name it;
    // reporting it as selection_unknown told every claude-code session its
    // first change set was unmapped.
    const installed = selectTests(tree(), [".claude/settings.json"], SELECTION);
    assert.deepEqual(installed.unknownPaths, []);
    assert.deepEqual(installed.risks, []);
    assert.deepEqual(installed.testPaths, []);
  });
});

describe("the module form", () => {
  // The CSV pipeline: a shared model, two libraries on it, one application
  // on all three. Suites per module, with the listener's compatibility
  // suites against the two libraries it consumes.
  const shape = {
    multi: true,
    implicit: false,
    modules: [
      { slug: "model", codeRoots: ["modules/model"], dependsOn: [] },
      { slug: "deserializer", codeRoots: ["modules/deserializer"], dependsOn: ["model"] },
      { slug: "persister", codeRoots: ["modules/persister"], dependsOn: ["model"] },
      { slug: "listener", codeRoots: ["modules/listener"], dependsOn: ["model", "deserializer", "persister"] },
    ],
  } as unknown as ModuleSelection["shape"];
  const suites: ModuleSelection["suites"] = [
    { name: "model-unit", module: "model", role: "unit" },
    { name: "deserializer-unit", module: "deserializer", role: "unit" },
    { name: "deserializer-provider", module: "deserializer", role: "provider-contract" },
    { name: "persister-unit", module: "persister", role: "unit" },
    { name: "persister-provider", module: "persister", role: "provider-contract" },
    { name: "listener-unit", module: "listener", role: "unit" },
    { name: "listener-vs-persister", module: "listener", role: "consumer-contract", against: "persister" },
    { name: "listener-vs-deserializer", module: "listener", role: "consumer-contract", against: "deserializer" },
    { name: "integration", module: "listener", role: "unit" },
  ];
  const context: ModuleSelection = {
    shape,
    suites,
    sharedFiles: new Map([["persister", ["Directory.Packages.props"]]]),
  };
  const config: SelectionConfig = { scopes: [], smoke: ["tests/test_smoke.py"], repoWide: [], rules: [] };

  it("selects a changed module's suites whole and its transitive consumers' contract suites against it, and nothing else", () => {
    const result = selectTests(tree(), ["modules/persister/src/Persister.cs"], config, context);
    assert.deepEqual(result.modules, ["persister"]);
    assert.deepEqual(
      result.suites.map((s) => [s.name, s.reason]),
      [
        ["persister-unit", "module-changed"],
        ["persister-provider", "module-changed"],
        ["listener-vs-persister", "consumer-contract"],
      ],
    );
    // No file-form tests and no unknown path: the module owns it.
    assert.deepEqual(result.testPaths, []);
    assert.deepEqual(result.risks, []);
    // A shared file is the module's change too; a path in no module still
    // falls through to the rules and then to selection_unknown.
    assert.deepEqual(selectTests(tree(), ["Directory.Packages.props"], config, context).modules, ["persister"]);
    const stray = selectTests(tree(), ["scripts/deploy.rb"], config, context);
    assert.deepEqual(stray.unknownPaths, ["scripts/deploy.rb"]);
    assert.deepEqual(stray.suites, []);
    // The shared-types module at the bottom reaches every consumer's
    // contract suite against it -- here none declares one against the
    // model, so its own suite is the whole of it -- and the modules reached
    // are listed in dependency order.
    const model = selectTests(tree(), ["modules/model/Person.cs", "modules/listener/Job.cs"], config, context);
    assert.deepEqual(model.modules, ["model", "listener"]);
    // A single-module context is the file form unchanged.
    const single = selectTests(tree(), ["modules/persister/x.cs"], config, { ...context, shape: { ...shape, multi: false } });
    assert.deepEqual(single.suites, []);
    assert.deepEqual(single.unknownPaths, ["modules/persister/x.cs"]);
  });

  it("lets a rule select a module, which expands to that module's suites", () => {
    const loaded = loadSelectionConfig({
      testing: {
        selection: {
          rules: [{ when: "shared/schema.json", select: [{ module: "deserializer" }, "tests/test_smoke.py"] }],
        },
      },
    });
    assert.equal(loaded.ok, true, loaded.errors.join("; "));
    assert.deepEqual(loaded.config.rules, [["shared/schema.json", ["tests/test_smoke.py"], ["deserializer"]]]);
    const result = selectTests(tree(), ["shared/schema.json"], loaded.config, context);
    assert.deepEqual(result.modules, ["deserializer"]);
    assert.deepEqual(
      result.suites.map((s) => [s.name, s.reason, s.selectedBy]),
      [
        ["deserializer-unit", "configured-rule", "shared/schema.json"],
        ["deserializer-provider", "configured-rule", "shared/schema.json"],
        ["listener-vs-deserializer", "consumer-contract", "shared/schema.json"],
      ],
    );
    assert.deepEqual(result.testPaths, ["tests/test_smoke.py"]);
    assert.match(
      loadSelectionConfig({ testing: { selection: { rules: [{ when: "x", select: [{ modul: "a" }] }] } } }).errors[0] ?? "",
      /must be a list of test paths or \{module: <slug>\} entries/,
    );
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

  it("reports a malformed rule rather than dropping it, refuses a test root with no glob, and refuses the retired repository-wide declaration by name", () => {
    const rule = loadSelectionConfig({ testing: { selection: { rules: [{ when: "ai_router/", selct: ["tests/test_a.py"] }] } } });
    assert.equal(rule.ok, false);
    assert.ok(rule.errors.some((error) => error.includes("select")));
    const noGlob = loadSelectionConfig({ testing: { suites: [{ name: "maven", command: "mvn -q test", test_roots: ["src/test/java"] }] } });
    assert.ok(!noGlob.ok && noGlob.errors.some((error) => error.includes("test_glob")));
    const retired = loadSelectionConfig({ testing: { suites: [{ name: "python", command: "pytest", test_roots: ["tests"], test_glob: "test_*.py" }], selection: { test_roots: ["spec"], test_glob: "*_spec.py" } } });
    assert.ok(!retired.ok && retired.errors.some((error) => error.includes("testing.suites")));
  });

  it("confines each suite's convention to that suite's roots, reads the scopes with no rules declared, and gives a suite that runs no test files no scope", () => {
    const selection = loadSelectionConfig(TWO_ECOSYSTEMS).config;
    assert.equal(namesATest("src/test/java/AdderTest.java", selection), true);
    assert.equal(namesATest("test/AdderTests.cs", selection), true);
    assert.equal(namesATest("src/test/java/AdderTests.cs", selection), false);
    assert.equal(namesATest("src/main/java/Adder.java", selection), false);
    assert.deepEqual(selection.rules, []);
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
});

