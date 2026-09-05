// The step commands' deterministic pass and the commit guard: what a step
// owes before it closes, judged from the declarations and the change set.
// A seeded directory stands in for the checkout; git answers from a table.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { RouterConfig } from "../src/config.ts";
import { EXIT_OK } from "../src/session.ts";
import { runStepGuardCommit, stepDeterministicFacts } from "../src/verify/steps.ts";
import { gitAnswers, seed, tempDir } from "./support/answers.ts";

const CONFIG = {
  testing: {
    suites: [{ name: "unit", command: "python -m pytest", covers: ["src/"], expensive: true, test_roots: ["tests"], test_glob: "test_*.py" }],
    selection: { rules: [{ when: "docs/", select: [] }] },
  },
} as unknown as RouterConfig;

describe("a step's deterministic facts", () => {
  it("refuses to run on declarations it cannot read, naming every error", () => {
    const broken = { testing: { suites: {}, controls: "no" } } as unknown as RouterConfig;
    const facts = stepDeterministicFacts(tempDir(), broken, ["src/a.py"]);
    assert.deepEqual(facts.controls, []);
    assert.ok(facts.errors.includes("testing.suites must be a list") && facts.errors.includes("testing.controls must be a list"));
  });

  it("records each undeclared control as not applicable, and a suite whose tests the step's paths reach nothing of as not applicable too", () => {
    const repo = tempDir();
    seed(repo, { "docs/notes.md": "x\n", "tests/test_a.py": "x\n" });
    const facts = stepDeterministicFacts(repo, CONFIG, ["docs/notes.md"]);
    assert.deepEqual(facts.errors, []);
    const rows = facts.controls.map((fact) => [fact.kind, fact.status]);
    assert.deepEqual(rows.slice(0, 4), [["compile", "not_applicable"], ["typecheck", "not_applicable"], ["lint", "not_applicable"], ["analyzer", "not_applicable"]]);
    const tests = facts.controls.find((fact) => fact.kind === "tests");
    assert.equal(tests?.status, "not_applicable");
    assert.match(String(tests?.detail), /this step's paths map to no test/);
  });
});

describe("the commit guard", () => {
  it("lets a commit through outside a repository entirely, and where no step is open", () => {
    const outside = gitAnswers([[() => true, { code: 128, stderr: "not a git repository" }]]);
    try {
      assert.equal(runStepGuardCommit(tempDir()), EXIT_OK);
    } finally {
      outside();
    }
    const repo = tempDir();
    const inside = gitAnswers([[["rev-parse", "--show-toplevel"], { stdout: repo.split("\\").join("/") }]]);
    try {
      assert.equal(runStepGuardCommit(repo), EXIT_OK);
    } finally {
      inside();
    }
  });
});
