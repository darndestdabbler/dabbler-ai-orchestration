// The impact plan: what a change reaches in a multi-module solution, and
// what a single-module solution owes regardless.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { REACH_CONSUMER_CONTRACT, REACH_MODULE_CHANGED, REACH_REPOSITORY_WIDE, REACH_REQUIRED, REACH_SHARED_TYPES, planImpact } from "../src/impact.ts";
import { type SolutionShape, dependencyOrder, implicitModule, parseEntries, impliedDeployables } from "../src/modules.ts";

function threeModules(): SolutionShape {
  const entries = parseEntries({
    modules: [
      { slug: "model", kind: "shared-types", codeRoots: ["modules/model"], package: "CsvModel" },
      { slug: "persister", codeRoots: ["modules/persister"], dependsOn: ["model"], package: "CsvPersister" },
      { slug: "listener", kind: "application", codeRoots: ["modules/listener"], dependsOn: ["persister"] },
    ],
  });
  return { multi: true, implicit: false, modules: dependencyOrder(entries), deployables: impliedDeployables(entries) };
}

const SUITES = [
  { name: "model-unit", module: "model", role: "unit", expensive: true },
  { name: "persister-unit", module: "persister", role: "unit", expensive: true },
  { name: "persister-contract", module: "persister", role: "provider-contract", expensive: true },
  { name: "persister-against-model", module: "persister", role: "consumer-contract", against: "model", expensive: true },
  { name: "listener-unit", module: "listener", role: "unit", expensive: true },
  { name: "listener-against-persister", module: "listener", role: "consumer-contract", against: "persister", expensive: true },
  { name: "lint", module: null, expensive: false },
];

describe("the impact plan", () => {
  it("reaches a changed module's own suites and its consumers' contract suites against it, and names it the candidate", () => {
    const plan = planImpact(threeModules(), SUITES, ["modules/persister/src/Store.cs"]);
    assert.equal(plan.multi, true);
    assert.deepEqual(plan.changedModules, ["persister"]);
    assert.deepEqual(
      plan.suites.map((suite) => [suite.name, suite.reason, suite.via]),
      [
        ["persister-unit", REACH_MODULE_CHANGED, "persister"],
        ["persister-contract", REACH_MODULE_CHANGED, "persister"],
        ["listener-against-persister", REACH_CONSUMER_CONTRACT, "persister"],
      ],
    );
    assert.deepEqual(plan.candidates, ["persister"]);
    assert.deepEqual(plan.unowned, []);
  });

  it("reaches every consumer whole when a shared-types module changed, says which paths nothing owns, and plans every required suite for a single-module solution", () => {
    const plan = planImpact(
      threeModules(),
      SUITES,
      ["modules/model/src/Person.cs", "README.md"],
      new Map([["persister", ["Directory.Packages.props"]]]),
    );
    assert.deepEqual(plan.changedModules, ["model"]);
    // The sharper reason is recorded: the persister's compatibility suite
    // against the model is a consumer-contract suite, and shared-types is
    // the reason for the suites only a shared type could have reached.
    assert.deepEqual(
      plan.suites.map((suite) => [suite.name, suite.reason]),
      [
        ["model-unit", REACH_MODULE_CHANGED],
        ["persister-against-model", REACH_CONSUMER_CONTRACT],
        ["persister-unit", REACH_SHARED_TYPES],
        ["persister-contract", REACH_SHARED_TYPES],
        ["listener-unit", REACH_SHARED_TYPES],
        ["listener-against-persister", REACH_SHARED_TYPES],
      ],
    );
    assert.deepEqual(plan.candidates, ["model"]);
    assert.deepEqual(plan.unowned, ["README.md"]);
    // A shared file is every naming module's change.
    assert.deepEqual(
      planImpact(threeModules(), SUITES, ["Directory.Packages.props"], new Map([["persister", ["Directory.Packages.props"]]])).changedModules,
      ["persister"],
    );

    const single: SolutionShape = { multi: false, implicit: true, modules: [implicitModule("D:/ws/csv-model")], deployables: [] };
    const own = planImpact(single, [
      { name: "unit", expensive: true },
      { name: "slow", expensive: true, requiredForClose: false },
      { name: "lint", expensive: false },
    ], ["src/anything.py"]);
    assert.equal(own.multi, false);
    assert.deepEqual(own.suites.map((suite) => [suite.name, suite.reason]), [["unit", REACH_REQUIRED]]);
    assert.deepEqual(own.candidates, []);
    assert.deepEqual(own.unowned, []);
  });

  it("reaches a suite that names no module from any change, and still not another module's own", () => {
    // Measured on the Java walk: the maven suite `dabbler bootstrap`
    // scaffolds covers "." and names no module, so a module session's plan
    // reached nothing, the driver skipped the run of record, and the close
    // asked for freshness of nothing at all.
    const suites = [...SUITES, { name: "maven", module: null, expensive: true }];
    const plan = planImpact(threeModules(), suites, ["modules/persister/src/Store.cs"]);
    assert.deepEqual(
      plan.suites.filter((suite) => suite.module === null).map((suite) => [suite.name, suite.reason, suite.via]),
      [["maven", REACH_REPOSITORY_WIDE, ""]],
    );
    // A suite that names a module is still reached only through it.
    assert.ok(!plan.suites.some((suite) => suite.name === "model-unit"));
    // And a suite nobody would run as a run of record is still not planned.
    assert.ok(!plan.suites.some((suite) => suite.name === "lint"));
  });
});
