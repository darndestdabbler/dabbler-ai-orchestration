// Pre-verification: the policy that makes a targeted run evidence, judged
// from a selection and a command. The gate that stands in front of a round is
// walked in walk-git-states.test.ts, whose repository is real.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { classifyPreverifyCommand } from "../src/affected.ts";
import { selectTests, targetedCommand, type SelectionConfig } from "../src/checks.ts";
import {
  POLICY_ALL_TESTS_AFFECTED,
  POLICY_OPERATOR_OVERRIDE,
  POLICY_SUITE_WHOLE,
  POLICY_TARGETED,
  POLICY_VIOLATION,
} from "../src/testEvidence.ts";
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
  rules: [["docs/", []], ["ai_router/engine.py", ["tests/test_engine.py", "tests/test_widget.py"]]],
};

describe("what makes a pre-verification run evidence", () => {
  it("refuses the habitual full-suite command on an ordinary change and accepts the selector's own, node ids included", () => {
    // The whole stage exists for this line.
    const result = selectTests(tree(), ["ai_router/engine.py"], SELECTION);
    const bare = classifyPreverifyCommand("python -m pytest", result);
    assert.equal(bare.policy, POLICY_VIOLATION);
    assert.equal(bare.accepted, false);
    assert.deepEqual([...bare.missing].sort(), result.testPaths);
    assert.equal(classifyPreverifyCommand("python -m pytest tests/", result).policy, POLICY_VIOLATION);
    assert.equal(classifyPreverifyCommand(targetedCommand("python -m pytest", result), result).policy, POLICY_TARGETED);
    assert.equal(classifyPreverifyCommand("python -m pytest tests/test_engine.py::TestX::test_y tests/test_widget.py", result).policy, POLICY_TARGETED);
  });

  it("holds a runner that takes no file list to its own declared command and no other", () => {
    const result = selectTests(tree(), ["ai_router/engine.py"], SELECTION);
    assert.equal(targetedCommand("mvn -q test", result, { runsWhole: true }), "mvn -q test");
    const whole = classifyPreverifyCommand("mvn -q test", result, { runsWhole: true, declaredCommand: "mvn -q test" });
    assert.equal(whole.policy, POLICY_SUITE_WHOLE);
    assert.equal(whole.accepted, true);
    assert.equal(classifyPreverifyCommand("mvn -q test -DskipTests", result, { runsWhole: true, declaredCommand: "mvn -q test" }).policy, POLICY_VIOLATION);
  });

  it("carries the proof with a repository-wide exception, accepts an operator override only with a reason, and asks for no run where no test is affected", () => {
    const wide = selectTests(tree(), ["tests/conftest.py"], SELECTION);
    const proved = classifyPreverifyCommand("python -m pytest", wide);
    assert.equal(proved.policy, POLICY_ALL_TESTS_AFFECTED);
    assert.match(proved.reason, /conftest/);
    assert.equal(targetedCommand("python -m pytest", wide), "python -m pytest");
    const result = selectTests(tree(), ["ai_router/engine.py"], SELECTION);
    const given = classifyPreverifyCommand("python -m pytest", result, { overrideReason: "pytest plugin upgrade; selection is untrusted" });
    assert.equal(given.policy, POLICY_OPERATOR_OVERRIDE);
    assert.ok(given.reason.startsWith("pytest plugin upgrade"));
    assert.equal(classifyPreverifyCommand("python -m pytest", result, { overrideReason: "   " }).policy, POLICY_VIOLATION);
    const none = selectTests(tree(), ["docs/plan.md"], SELECTION);
    assert.equal(targetedCommand("python -m pytest", none), "");
    assert.equal(classifyPreverifyCommand("python -m pytest", none).policy, POLICY_VIOLATION);
  });
});

