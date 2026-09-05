// Pre-verification: the policy that makes a targeted run evidence, judged
// from a selection and a command, and the gate that stands in front of a
// round, walked over one repository whose change set git measures.
import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { classifyPreverifyCommand, preverifyGate } from "../src/affected.ts";
import { selectTests, targetedCommand, type SelectionConfig } from "../src/checks.ts";
import { appendRound } from "../src/ledger.ts";
import { snapshotWorktreeTree } from "../src/journal.ts";
import {
  POLICY_ALL_TESTS_AFFECTED,
  POLICY_OPERATOR_OVERRIDE,
  POLICY_SUITE_WHOLE,
  POLICY_TARGETED,
  POLICY_VIOLATION,
  loadSuitesChecked,
  recordRun,
  type SuiteSpec,
} from "../src/testEvidence.ts";
import { registerSessionStart } from "../src/writers.ts";
import { seed, tempDir } from "./support/answers.ts";
import { makeRepo, writeFiles } from "./support/repo.ts";

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

describe("the gate that stands in front of a verification round", () => {
  const CONFIG = {
    testing: {
      suites: [{ name: "python", command: "python -m pytest", covers: ["docs/"], expensive: true, test_roots: ["tests"], test_glob: "test_*.py" }],
      selection: { repo_wide: ["pyproject.toml"], rules: [{ when: "docs/", select: [] }, { when: "src/", select: ["tests/test_thing.py"] }] },
    },
  };
  // One repository, walked: the change set is what git measures against the
  // seed, so the milestones below build on each other.
  const repo = makeRepo({
    "docs/keep.md": "x\n",
    "docs/sessions/session-plan.md": "### Session 1 of 2: First\n1. Register.\n2. Build it.\n\n### Session 2 of 2: Second\n1. Register.\n",
  });
  const sessionsDir = join(repo, "docs", "sessions");

  it("walks one repository: an empty mapping skips evidence, an unmapped path blocks, a remediation is measured by the fix, and a suite asked for nothing is satisfied by the run it asked for", () => {
    // One test, because each part stands on the state the part before it
    // left: the change set is what git measures against the seed.
    //
    // -- skips evidence only for a declared empty mapping, and blocks on a
    // path nobody mapped even beside a mapped one. "Nothing is affected" and
    // "nobody knows what is affected" look identical from the selected-test
    // list and must never be treated alike.
    writeFileSync(join(repo, "docs", "notes.md"), "x\n", "utf8");
    assert.equal(preverifyGate(repo, sessionsDir, CONFIG).ok, true);
    mkdirSync(join(repo, "scripts"), { recursive: true });
    writeFileSync(join(repo, "scripts", "deploy.rb"), "x\n", "utf8");
    const blocked = preverifyGate(repo, sessionsDir, CONFIG);
    assert.equal(blocked.ok, false);
    assert.match(blocked.reason, /scripts\/deploy\.rb/);
    assert.equal(blocked.command, "");
    writeFiles(repo, { "src/app.py": "x = 1\n" });
    assert.match(preverifyGate(repo, sessionsDir, CONFIG).reason, /scripts\/deploy\.rb/);

    // -- measures a remediation by the fix rather than by the whole
    // session. A repository-wide edit buys one full run, at the round that
    // reviewed it; judging later rounds against HEAD would re-buy it every
    // time.
    rmSync(join(repo, "scripts"), { recursive: true, force: true });
    registerSessionStart(sessionsDir, 1, { engine: "claude-code", provider: "anthropic" });
    writeFileSync(join(repo, "pyproject.toml"), "[p]\n", "utf8");
    assert.equal(preverifyGate(repo, sessionsDir, CONFIG).command, "python -m pytest");
    appendRound(repo, 1, {
      round: 1, verdict: "ISSUES_FOUND", blocking: true, findings: [], recorded_at: "2026-08-19T18:00:00-04:00",
      verifier_model: "m", verifier_provider: "openai", completion_tree: snapshotWorktreeTree(repo) as string,
    });
    writeFileSync(join(repo, "src", "app.py"), "x = 2\n", "utf8");
    assert.equal(preverifyGate(repo, sessionsDir, CONFIG).command, "python -m pytest tests/test_thing.py");

    // -- asks a suite the selection named no test of for nothing, and is
    // satisfied by the run it asked for.
    const twoSuites = {
      testing: {
        suites: [
          { name: "python", command: "python -m pytest", covers: ["src/"], expensive: true, test_roots: ["tests"], test_glob: "test_*.py" },
          { name: "typescript", command: "vitest run", covers: ["src/"], expensive: true, test_roots: ["suite"], test_glob: "*.test.ts" },
        ],
        selection: { rules: [{ when: "src/app.py", select: ["tests/test_app.py"] }, { when: "docs/", select: [] }, { when: "pyproject.toml", select: [] }] },
      },
    };
    const asked = preverifyGate(repo, sessionsDir, twoSuites);
    assert.equal(asked.ok, false, asked.reason);
    assert.equal(asked.suite, "python");
    assert.equal(asked.command, "python -m pytest tests/test_app.py");
    const python = loadSuitesChecked(twoSuites).suites.find((s) => s.name === "python") as SuiteSpec;
    recordRun(sessionsDir, python, "passed", {
      stage: "preverify-targeted", durationSeconds: 1, command: "python -m pytest tests/test_app.py", policy: POLICY_TARGETED,
      policyReason: "named every selected test", selectedTests: [["tests/test_app.py", "configured-rule"]],
    });
    const satisfied = preverifyGate(repo, sessionsDir, twoSuites);
    assert.equal(satisfied.ok, true, satisfied.reason);
    assert.deepEqual(satisfied.accepted.map(([name]) => name), ["python"]);
  });
});
