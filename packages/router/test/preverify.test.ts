// The pre-verification stage: which tests a change makes necessary, the
// standard the command that runs them is held to, and what a recorded run
// proves.
//
// One file for `affected` and `test_evidence` because they are one claim
// asked twice -- the selector chooses, the record binds, and the policy is
// what joins them. Splitting them would put a refusal in one file and the
// rule it protects in another.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  SelectionResult,
  loadSelectionConfig,
  namesATest,
  selectTests,
  selectionTestRoots,
  declaresTests,
  targetedCommand,
  type SelectionConfig,
} from "../src/checks.ts";
import {
  classifyPreverifyCommand,
  preverifyGate,
  preverifyRecipe,
  remediationRecipe,
  runnableCommands,
} from "../src/affected.ts";
import {
  POLICY_ALL_TESTS_AFFECTED,
  POLICY_OPERATOR_OVERRIDE,
  POLICY_SUITE_WHOLE,
  POLICY_TARGETED,
  POLICY_VIOLATION,
  RecordError,
  STAGE_FINAL_FULL,
  STAGE_PREVERIFY_TARGETED,
  evaluateFreshness,
  loadSuitesChecked,
  readRecords,
  OUTCOME_NONE_SELECTED,
  POLICY_NONE_SELECTED,
  recordRun,
  runOfRecordRecipe,
  surfaceDigest,
  type SuiteSpec,
} from "../src/testEvidence.ts";
import { appendRound } from "../src/ledger.ts";
import { snapshotWorktreeTree } from "../src/journal.ts";
import { registerSessionStart } from "../src/writers.ts";
import { git, makeSeededRepo, removeTempDirs } from "./support/fixtures.ts";

afterAll(removeTempDirs);

// --- The selector ------------------------------------------------------------------

/** A miniature repository: source, tests, and one file under the test root
 * that is not itself a test. */
function tree(): string {
  return makeSeededRepo({
    "ai_router/engine.py": "VALUE = 1\n",
    "tests/test_engine.py": "X = 1\n",
    "tests/test_widget.py": "X = 1\n",
    "tests/test_smoke.py": "",
    "tests/helpers.py": "X = 1\n",
  });
}

const SELECTION: SelectionConfig = {
  scopes: [{ suite: "python", roots: ["tests"], glob: "test_*.py" }],
  smoke: ["tests/test_smoke.py"],
  repoWide: ["tests/conftest.py", "pytest.ini"],
  rules: [
    ["docs/", []],
    ["packages/router/router-config.yaml", ["tests/test_engine.py"]],
    ["ai_router/engine.py", ["tests/test_engine.py", "tests/test_widget.py"]],
  ],
};

describe("what the selector calls a test", () => {
  it("takes the repository's declaration rather than a naming convention", () => {
    // A helper that sits beside the tests is not one: treating it as mapped
    // would return clean targeted evidence for a change that can break every
    // test using it.
    const repo = tree();
    const changed = selectTests(repo, ["tests/test_engine.py"], SELECTION);
    expect(changed.testPaths).toEqual(["tests/test_engine.py"]);
    expect(changed.selected[0]?.reason).toBe("changed-test");
    expect(changed.risks).toEqual([]);

    const helper = selectTests(repo, ["tests/helpers.py"], SELECTION);
    expect(helper.unknownPaths).toEqual(["tests/helpers.py"]);
    expect(helper.testPaths).toEqual(["tests/test_smoke.py"]);
  });

  it("reaches a test from a source file only through a configured rule", () => {
    // No import graph and no naming convention: a source path reaches a test
    // because the repository declared that it does, and the record names the
    // path that did it.
    const result = selectTests(tree(), ["ai_router/engine.py"], SELECTION);
    expect(result.testPaths).toEqual(["tests/test_engine.py", "tests/test_widget.py"]);
    expect(result.selected.every((s) => s.reason === "configured-rule")).toBe(true);
    expect(result.selected.every((s) => s.selectedBy === "ai_router/engine.py")).toBe(true);
    // The unrelated smoke test is not pulled in by a mapped change.
    expect(result.testPaths).not.toContain("tests/test_smoke.py");
  });

  it("buys the smoke tests with uncertainty, never the suite", () => {
    const result = selectTests(tree(), ["scripts/deploy.rb"], SELECTION);
    expect(result.unknownPaths).toEqual(["scripts/deploy.rb"]);
    expect(result.risks[0]?.kind).toBe("selection_unknown");
    expect(result.testPaths).toEqual(["tests/test_smoke.py"]);
    expect(result.selected[0]?.reason).toBe("selection-unknown-smoke");
    expect(result.allTestsAffected).toBe(false);
  });

  it("reads an empty rule target as a mapping rather than an unknown", () => {
    const result = selectTests(tree(), ["docs/plan.md"], SELECTION);
    expect(result.testPaths).toEqual([]);
    expect(result.risks).toEqual([]);
    expect(result.allTestsAffected).toBe(false);
  });

  it("proves every test affected only from a declared repository-wide path", () => {
    const result = selectTests(tree(), ["tests/conftest.py"], SELECTION);
    expect(result.allTestsAffected).toBe(true);
    expect(result.allAffectedReason).toContain("conftest");
    // A source change that touches many tests still is not "all".
    expect(selectTests(tree(), ["ai_router/engine.py"], SELECTION).allTestsAffected).toBe(
      false,
    );
  });
});

describe("reading the selection declaration", () => {
  const TWO_ECOSYSTEMS = {
    testing: {
      suites: [
        {
          name: "maven", command: "mvn -q test", covers: ["src/"],
          test_roots: ["src/test/java"], test_glob: "*Test.java",
        },
        {
          name: "dotnet", command: "dotnet test", covers: ["src/"],
          test_roots: ["test"], test_glob: "*Tests.cs",
        },
      ],
    },
  };

  it("reports a malformed rule rather than dropping it", () => {
    // A typo that removes a mapping turns real coverage into
    // selection_unknown, silently.
    const loaded = loadSelectionConfig({
      testing: {
        selection: { rules: [{ when: "ai_router/", selct: ["tests/test_a.py"] }] },
      },
    });
    expect(loaded.ok).toBe(false);
    expect(loaded.errors.some((error) => error.includes("select"))).toBe(true);
  });

  it("confines each suite's convention to that suite's roots", () => {
    // A repository that is Java and .NET at once has two test roots and two
    // globs; the .NET convention under the Java root is not a test, and
    // treating it as one would offer a verifier a write nothing would run.
    const selection = loadSelectionConfig(TWO_ECOSYSTEMS).config;
    expect(namesATest("src/test/java/AdderTest.java", selection)).toBe(true);
    expect(namesATest("test/AdderTests.cs", selection)).toBe(true);
    expect(namesATest("src/test/java/AdderTests.cs", selection)).toBe(false);
    expect(namesATest("src/main/java/Adder.java", selection)).toBe(false);
  });

  it("reads the suites' scopes with no mapping rules declared at all", () => {
    const selection = loadSelectionConfig(TWO_ECOSYSTEMS).config;
    expect(selection.rules).toEqual([]);
    expect(declaresTests(selection)).toBe(true);
    expect(selectionTestRoots(selection)).toEqual(["src/test/java", "test"]);
  });

  it("refuses a test root with no glob", () => {
    // It would make a test of every file under the root, including the
    // fixtures and helpers that live beside them.
    const loaded = loadSelectionConfig({
      testing: {
        suites: [{ name: "maven", command: "mvn -q test", test_roots: ["src/test/java"] }],
      },
    });
    expect(loaded.ok).toBe(false);
    expect(loaded.errors.some((error) => error.includes("test_glob"))).toBe(true);
  });

  it("refuses the retired repository-wide declaration by name", () => {
    // Left readable in testing.selection it would be a second answer to what
    // a test is, and the two would disagree the first time a repository ran
    // two ecosystems.
    const loaded = loadSelectionConfig({
      testing: {
        suites: [
          { name: "python", command: "pytest", test_roots: ["tests"], test_glob: "test_*.py" },
        ],
        selection: { test_roots: ["spec"], test_glob: "*_spec.py" },
      },
    });
    expect(loaded.ok).toBe(false);
    expect(loaded.errors.some((error) => error.includes("testing.suites"))).toBe(true);
  });

  it("gives a suite that runs no test files no scope at all", () => {
    // Saying nothing is how a repository says "this suite runs something that
    // is not a test file", and it must not be read as a root of "" that would
    // make a test of anything anywhere.
    const loaded = loadSelectionConfig({
      testing: { suites: [{ name: "smoke", command: "python smoke.py" }] },
    });
    expect(loaded.ok).toBe(true);
    expect(loaded.config.scopes).toEqual([]);
    expect(declaresTests(loaded.config)).toBe(false);
  });
});

describe("the command a selection sanctions", () => {
  it("offers the declaration to make where no suite is declared", () => {
    // `python -m pytest` used to be printed here, which in a Java repository
    // is a command nobody declared and the run of record would have cited it.
    const lines = runnableCommands([], new SelectionResult());
    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain("pytest");
    expect(lines[0]).toContain("testing.suites");
  });

  it("says a declared suite is not expensive rather than saying none is declared", () => {
    // The csv-model trial met this: a valid `testing.suites` entry without
    // `expensive: true`, and `dabbler affected` answering that no suite was
    // declared. The caller filters on `expensive` before this is reached, so
    // the empty list arrives looking identical either way -- and an operator
    // told their suite does not exist goes to write one that is already in
    // the file. `declared` is the count before the filter, and it is the
    // only thing that tells the two apart.
    const lines = runnableCommands([], new SelectionResult(), 1);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("expensive");
    expect(lines[0]).not.toContain("no suite is declared");
  });
});

// --- The pre-verification policy --------------------------------------------------

describe("what makes a pre-verification run evidence", () => {
  it("refuses the habitual full-suite command on an ordinary change", () => {
    // The whole stage exists for this line.
    const result = selectTests(tree(), ["ai_router/engine.py"], SELECTION);
    const sanctioned = targetedCommand("python -m pytest", result);

    const bare = classifyPreverifyCommand("python -m pytest", result);
    expect(bare.policy).toBe(POLICY_VIOLATION);
    expect(bare.accepted).toBe(false);
    expect([...bare.missing].sort()).toEqual(result.testPaths);

    // Nor does pointing the runner at the directory they live in.
    expect(classifyPreverifyCommand("python -m pytest tests/", result).policy).toBe(
      POLICY_VIOLATION,
    );

    // The selector's own command passes, node ids included.
    expect(classifyPreverifyCommand(sanctioned, result).policy).toBe(POLICY_TARGETED);
    expect(
      classifyPreverifyCommand(
        "python -m pytest tests/test_engine.py::TestX::test_y tests/test_widget.py",
        result,
      ).policy,
    ).toBe(POLICY_TARGETED);
  });

  it("holds a runner that takes no file list to its own declared command", () => {
    // `mvn -q test <file>` reads the path as a lifecycle argument and `dotnet
    // test` wants a project, so appending the selected files would emit a
    // command nobody can run under a policy name claiming it proved something.
    const result = selectTests(tree(), ["ai_router/engine.py"], SELECTION);
    expect(targetedCommand("mvn -q test", result, { runsWhole: true })).toBe("mvn -q test");

    const whole = classifyPreverifyCommand("mvn -q test", result, {
      runsWhole: true,
      declaredCommand: "mvn -q test",
    });
    expect(whole.policy).toBe(POLICY_SUITE_WHOLE);
    expect(whole.accepted).toBe(true);

    // It sanctions that command and no other: `runs_whole` is a statement
    // about the runner, not permission to run anything.
    expect(
      classifyPreverifyCommand("mvn -q test -DskipTests", result, {
        runsWhole: true,
        declaredCommand: "mvn -q test",
      }).policy,
    ).toBe(POLICY_VIOLATION);
  });

  it("carries the proof with a repository-wide exception rather than asserting it", () => {
    const result = selectTests(tree(), ["tests/conftest.py"], SELECTION);
    const proved = classifyPreverifyCommand("python -m pytest", result);
    expect(proved.policy).toBe(POLICY_ALL_TESTS_AFFECTED);
    expect(proved.accepted).toBe(true);
    expect(proved.reason).toContain("conftest");
    expect(targetedCommand("python -m pytest", result)).toBe("python -m pytest");
  });

  it("accepts an operator override only with a reason to audit", () => {
    const result = selectTests(tree(), ["ai_router/engine.py"], SELECTION);
    const given = classifyPreverifyCommand("python -m pytest", result, {
      overrideReason: "pytest plugin upgrade; selection is untrusted",
    });
    expect(given.policy).toBe(POLICY_OPERATOR_OVERRIDE);
    expect(given.reason.startsWith("pytest plugin upgrade")).toBe(true);

    expect(
      classifyPreverifyCommand("python -m pytest", result, { overrideReason: "   " }).policy,
    ).toBe(POLICY_VIOLATION);
  });

  it("asks for no run where the change is declared to affect no test", () => {
    // Zero selected tests is the most ordinary change there is. If it
    // sanctioned the bare suite command, the policy would recommend the one
    // run it exists to refuse.
    const result = selectTests(tree(), ["docs/plan.md"], SELECTION);
    expect(result.allTestsAffected).toBe(false);
    expect(result.testPaths).toEqual([]);
    expect(targetedCommand("python -m pytest", result)).toBe("");
    expect(classifyPreverifyCommand("python -m pytest", result).policy).toBe(
      POLICY_VIOLATION,
    );
  });
});

// --- The gate ----------------------------------------------------------------------

describe("the gate that stands in front of a verification round", () => {
  const CONFIG = {
    testing: {
      suites: [
        {
          name: "python", command: "python -m pytest", covers: ["docs/"],
          expensive: true, test_roots: ["tests"], test_glob: "test_*.py",
        },
      ],
      selection: {
        repo_wide: ["pyproject.toml"],
        rules: [
          { when: "docs/", select: [] },
          { when: "src/", select: ["tests/test_thing.py"] },
        ],
      },
    },
  };

  function sandbox(): { repo: string; sessionsDir: string } {
    const repo = makeSeededRepo({
      "docs/keep.md": "x\n",
      "docs/sessions/session-plan.md":
        "### Session 1 of 2: First\n1. Register.\n2. Build it.\n\n" +
        "### Session 2 of 2: Second\n1. Register.\n",
    });
    return { repo, sessionsDir: join(repo, "docs", "sessions") };
  }

  it("skips evidence only for a declared empty mapping", () => {
    // "Nothing is affected" and "nobody knows what is affected" look identical
    // from the selected-test list and must never be treated alike: the second
    // is the state the whole stage exists to surface.
    const { repo, sessionsDir } = sandbox();
    writeFileSync(join(repo, "docs", "notes.md"), "x\n", "utf8");
    expect(preverifyGate(repo, sessionsDir, CONFIG).ok).toBe(true);

    mkdirSync(join(repo, "scripts"), { recursive: true });
    writeFileSync(join(repo, "scripts", "deploy.rb"), "x\n", "utf8");
    const blocked = preverifyGate(repo, sessionsDir, CONFIG);
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toContain("scripts/deploy.rb");
    // No command is offered, because none would measure anything.
    expect(blocked.command).toBe("");

    // A mapped path alongside it does not cover for it: tests chosen for one
    // file say nothing about the file nothing chose tests for.
    mkdirSync(join(repo, "src"), { recursive: true });
    writeFileSync(join(repo, "src", "app.py"), "x = 1\n", "utf8");
    expect(preverifyGate(repo, sessionsDir, CONFIG).reason).toContain("scripts/deploy.rb");
  });

  it("measures a remediation by the fix rather than by the whole session", () => {
    // A repository-wide edit buys one full run, at the round that reviewed it.
    // Judging later rounds against HEAD would re-buy it every time, which is
    // how this stage would end up prescribing the very run it exists to delete.
    const { repo, sessionsDir } = sandbox();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code", provider: "anthropic" });
    writeFileSync(join(repo, "pyproject.toml"), "[p]\n", "utf8");
    expect(preverifyGate(repo, sessionsDir, CONFIG).command).toBe("python -m pytest");

    appendRound(repo, 1, {
      round: 1, verdict: "ISSUES_FOUND", blocking: true, findings: [],
      recorded_at: "2026-08-19T18:00:00-04:00", verifier_model: "m",
      verifier_provider: "openai", completion_tree: snapshotWorktreeTree(repo) as string,
    });
    mkdirSync(join(repo, "src"), { recursive: true });
    writeFileSync(join(repo, "src", "app.py"), "x = 1\n", "utf8");

    expect(preverifyGate(repo, sessionsDir, CONFIG).command).toBe(
      "python -m pytest tests/test_thing.py",
    );
  });

  it("asks a suite the selection named no test of for nothing", () => {
    // Not leniency: the alternative is unsatisfiable, because an empty
    // selection yields an empty targeted command and a preverify record must
    // name the command that ran.
    const twoSuites = {
      testing: {
        suites: [
          {
            name: "python", command: "python -m pytest", covers: ["src/"],
            expensive: true, test_roots: ["tests"], test_glob: "test_*.py",
          },
          {
            name: "typescript", command: "vitest run", covers: ["src/"],
            expensive: true, test_roots: ["suite"], test_glob: "*.test.ts",
          },
        ],
        selection: { rules: [{ when: "src/app.py", select: ["tests/test_app.py"] }] },
      },
    };
    const { repo, sessionsDir } = sandbox();
    mkdirSync(join(repo, "src"), { recursive: true });
    writeFileSync(join(repo, "src", "app.py"), "x = 1\n", "utf8");

    const asked = preverifyGate(repo, sessionsDir, twoSuites);
    expect(asked.ok).toBe(false);
    expect(asked.suite).toBe("python");
    expect(asked.command).toBe("python -m pytest tests/test_app.py");

    const python = loadSuitesChecked(twoSuites).suites.find((s) => s.name === "python");
    recordRun(sessionsDir, python as SuiteSpec, "passed", {
      stage: STAGE_PREVERIFY_TARGETED,
      durationSeconds: 1.0,
      command: "python -m pytest tests/test_app.py",
      policy: POLICY_TARGETED,
      policyReason: "named every selected test",
      selectedTests: [["tests/test_app.py", "configured-rule"]],
    });

    const satisfied = preverifyGate(repo, sessionsDir, twoSuites);
    expect(satisfied.ok).toBe(true);
    expect(satisfied.accepted.map(([name]) => name)).toEqual(["python"]);
  });
});

// --- The messages ---------------------------------------------------------------------

describe("every message that asks for evidence", () => {
  it("names the run and the record it must be followed by", () => {
    const text = preverifyRecipe(
      "docs/sessions", "python", "python -m pytest tests/test_thing.py",
    );
    expect(text).toContain("python -m pytest tests/test_thing.py");
    expect(text).toContain("--stage preverify-targeted");
    expect(text).toContain("--suite python");
  });

  it("routes a remediation back through the selector rather than quoting it", () => {
    // A blocking round that said only "re-run verify" would earn a refusal at
    // the gate: the fix moved the surfaces, so the evidence the round was
    // opened on no longer answers for them.
    const text = remediationRecipe("docs/sessions", "python");
    expect(text).toContain("dabbler affected");
    expect(text).toContain("--stage preverify-targeted");
    expect(text).toContain("dabbler verify");
  });

  it("names the complete run, its record and the push before a close", () => {
    // A verified session is not a closeable one, and a message that stopped
    // at "verified" is how a close gets attempted two steps early.
    const text = runOfRecordRecipe("docs/sessions", "python", "python -m pytest");
    expect(text).toContain("python -m pytest");
    expect(text).toContain(`--stage ${STAGE_FINAL_FULL}`);
    expect(text).toContain("git push");
    expect(text).toContain("dabbler session close");
  });
});

// --- Surface digests -------------------------------------------------------------------

describe("digesting the surfaces a suite covers", () => {
  it("tracks content rather than modification time", () => {
    // A checkout, a stash pop and a no-op save all rewrite mtimes without
    // changing content, and both error directions are unacceptable in a gate.
    const repo = makeSeededRepo();
    const first = surfaceDigest(repo, [""]);
    const later = new Date(Date.now() + 60_000);
    utimesSync(join(repo, "a.txt"), later, later);
    expect(surfaceDigest(repo, [""])).toBe(first);
    writeFileSync(join(repo, "a.txt"), "two\n", "utf8");
    expect(surfaceDigest(repo, [""])).not.toBe(first);
  });

  it("leaves the run ledger out of the whole-tree digest", () => {
    // A final-full record binds to this digest and is then written into
    // `.dabbler/runs/` itself. Counting the ledger would make the digest wrong
    // the instant it was stored, so the freshness gate could never pass -- and
    // a source edit must still move it, or the gate would stop meaning
    // anything.
    const repo = makeSeededRepo();
    const ledger = join(repo, ".dabbler", "runs");
    mkdirSync(ledger, { recursive: true });
    writeFileSync(join(ledger, "test-runs.jsonl"), "{}\n", "utf8");
    const first = surfaceDigest(repo, [""]);

    writeFileSync(join(ledger, "test-runs.jsonl"), '{}\n{"a": 1}\n', "utf8");
    expect(surfaceDigest(repo, [""])).toBe(first);

    writeFileSync(join(repo, "a.txt"), "changed\n", "utf8");
    expect(surfaceDigest(repo, [""])).not.toBe(first);
  });

  it("moves once for a deletion, and not again when the deletion is committed", () => {
    // `ls-files` names a tracked file that has been deleted but not yet
    // committed, so an unreadable path used to contribute a marker line that
    // left the digest the moment the commit landed. No file's content changed
    // across that commit, but the freshness gate saw a different tree and
    // demanded a whole suite run to prove nothing had happened. Two sessions
    // paid for it before D170 fixed it.
    const repo = makeSeededRepo({ "a.txt": "one\n", "b.txt": "two\n" });
    const before = surfaceDigest(repo, [""]);
    unlinkSync(join(repo, "b.txt"));
    const afterDelete = surfaceDigest(repo, [""]);
    expect(afterDelete).not.toBe(before);
    git(repo, "commit", "-q", "-a", "-m", "drop b", "--no-gpg-sign");
    expect(surfaceDigest(repo, [""])).toBe(afterDelete);
  });

  it("leaves the session's own bookkeeping out of its covered surfaces", () => {
    // They change during a session by definition; counting them would make
    // every session stale its own run of record.
    const repo = makeSeededRepo({ "docs/sessions/session-plan.md": "# plan\n" });
    const sessionsDir = join(repo, "docs", "sessions");
    const first = surfaceDigest(repo, [""], { sessionsDir });
    writeFileSync(join(sessionsDir, "sessions.json"), '{"sessions": []}', "utf8");
    expect(surfaceDigest(repo, [""], { sessionsDir })).toBe(first);
    // The plan is deliberately NOT bookkeeping: editing the plan the session
    // is running against still stales its run.
    writeFileSync(join(sessionsDir, "session-plan.md"), "# plan\n\n1. More.\n", "utf8");
    expect(surfaceDigest(repo, [""], { sessionsDir })).not.toBe(first);
  });
});

// --- The record ----------------------------------------------------------------------

describe("recording a run", () => {
  const SUITE: SuiteSpec = {
    name: "pytest", command: "pytest", covers: [""], expensive: true, runsWhole: false,
  };

  function sandbox(): { repo: string; sessionsDir: string } {
    const repo = makeSeededRepo({ "widget.py": "W = 0\n" });
    const sessionsDir = join(repo, "docs", "sessions");
    mkdirSync(sessionsDir, { recursive: true });
    return { repo, sessionsDir };
  }

  it("is strict at the write boundary about what it is handed", () => {
    const { repo, sessionsDir } = sandbox();
    const attempt = (fields: Record<string, unknown>): unknown =>
      recordRun(sessionsDir, SUITE, String(fields["outcome"]), {
        stage: String(fields["stage"]),
        durationSeconds: fields["durationSeconds"],
        repoRoot: repo,
      });
    expect(() => attempt({ outcome: "green", stage: "final-full", durationSeconds: 1 })).toThrow(
      RecordError,
    );
    expect(() => attempt({ outcome: "passed", stage: "final-full", durationSeconds: 0 })).toThrow(
      RecordError,
    );
    expect(() => attempt({ outcome: "passed", stage: "smoke", durationSeconds: 1 })).toThrow(
      RecordError,
    );
    // Honesty beats silence: a red run is recorded, not refused.
    const record = attempt({
      outcome: "failed", stage: "final-full", durationSeconds: 2.5,
    }) as { outcome: string };
    expect(record.outcome).toBe("failed");
  });

  it("records that the selector ran and chose nothing, without claiming a run", () => {
    // The three outcomes before this one are all claims about a suite that
    // RAN, so a docs-only change had nothing honest to write: `passed`
    // asserts a green run that never happened, and recording nothing leaves
    // the ledger silent about a step that did happen.
    const { repo, sessionsDir } = sandbox();
    const record = recordRun(sessionsDir, SUITE, OUTCOME_NONE_SELECTED, {
      stage: STAGE_PREVERIFY_TARGETED,
      durationSeconds: 0.1,
      policy: POLICY_NONE_SELECTED,
      repoRoot: repo,
    }) as { outcome: string; command: string };
    expect(record.outcome).toBe(OUTCOME_NONE_SELECTED);
    expect(record.command).toBe("");
  });

  it("refuses a none-selected record that names a command", () => {
    const { repo, sessionsDir } = sandbox();
    expect(() =>
      recordRun(sessionsDir, SUITE, OUTCOME_NONE_SELECTED, {
        stage: STAGE_PREVERIFY_TARGETED,
        durationSeconds: 0.1,
        policy: POLICY_NONE_SELECTED,
        command: "pytest",
        repoRoot: repo,
      }),
    ).toThrow(RecordError);
  });

  it("refuses none-selected as a run of record, which cannot be a run that did not happen", () => {
    const { repo, sessionsDir } = sandbox();
    expect(() =>
      recordRun(sessionsDir, SUITE, OUTCOME_NONE_SELECTED, {
        stage: STAGE_FINAL_FULL, durationSeconds: 0.1, repoRoot: repo,
      }),
    ).toThrow(RecordError);
  });

  it("requires a targeted record to name its command and its policy", () => {
    // The command is the evidence, so it cannot be optional; and the
    // vocabulary that judges it cannot leak onto the run of record, which is
    // the whole suite by definition.
    const { repo, sessionsDir } = sandbox();
    expect(() =>
      recordRun(sessionsDir, SUITE, "passed", {
        stage: STAGE_PREVERIFY_TARGETED, durationSeconds: 1.0,
        policy: POLICY_TARGETED, repoRoot: repo,
      }),
    ).toThrow(RecordError);
    expect(() =>
      recordRun(sessionsDir, SUITE, "passed", {
        stage: STAGE_PREVERIFY_TARGETED, durationSeconds: 1.0,
        command: "pytest tests/test_widget.py", repoRoot: repo,
      }),
    ).toThrow(RecordError);
    expect(() =>
      recordRun(sessionsDir, SUITE, "passed", {
        stage: STAGE_FINAL_FULL, durationSeconds: 1.0,
        policy: POLICY_TARGETED, repoRoot: repo,
      }),
    ).toThrow(RecordError);

    recordRun(sessionsDir, SUITE, "passed", {
      stage: STAGE_PREVERIFY_TARGETED, durationSeconds: 1.0,
      command: "pytest tests/test_widget.py", policy: POLICY_TARGETED,
      policyReason: "names all 1 selected",
      selectedTests: [["tests/test_widget.py", "module-ownership"]],
      repoRoot: repo,
    });
    const stored = readRecords(repo).at(-1);
    expect(stored?.command).toBe("pytest tests/test_widget.py");
    expect(stored?.policy).toBe(POLICY_TARGETED);
    expect(stored?.selectedTests).toEqual([["tests/test_widget.py", "module-ownership"]]);
  });

  it("writes the duration as the float it is", () => {
    // `1` written `1` rather than `1.0` is a byte the two routers disagree on
    // in the first row either of them appends.
    const { repo, sessionsDir } = sandbox();
    recordRun(sessionsDir, SUITE, "passed", {
      stage: STAGE_FINAL_FULL, durationSeconds: 42, repoRoot: repo,
    });
    const line = readFileSync(
      join(repo, ".dabbler", "runs", "test-runs.jsonl"), "utf8",
    ).trim();
    expect(line).toContain('"durationSeconds": 42.0');
  });

  it("drops a stage and a policy it does not recognise when reading back", () => {
    // An unrecognised stage must not be mistaken for `final-full` downstream,
    // and an unknown policy token is no exception at all.
    const { repo } = sandbox();
    const path = join(repo, ".dabbler", "runs", "test-runs.jsonl");
    mkdirSync(join(repo, ".dabbler", "runs"), { recursive: true });
    writeFileSync(
      path,
      '{"suite": "pytest", "surfaceDigest": "d", "stage": "invented", "policy": "mine"}\n' +
        "not json at all\n",
      "utf8",
    );
    const records = readRecords(repo);
    expect(records).toHaveLength(1);
    expect(records[0]?.stage).toBe("");
    expect(records[0]?.policy).toBe("");
  });

  it("reports every suite declaration error while still loading the suite", () => {
    // The gate must block on errors: "no expensive suites declared" and
    // "every declared suite was a typo and got silently dropped" must never
    // be indistinguishable.
    const loaded = loadSuitesChecked({
      testing: {
        suites: [{ name: "s", command: "c", covers: ["."], expencive: true }],
      },
    });
    expect(loaded.errors.length).toBeGreaterThan(0);
    expect(loaded.suites).toHaveLength(1);
  });
});

// --- Freshness -------------------------------------------------------------------------

describe("what a run of record has to be", () => {
  const SUITE: SuiteSpec = {
    name: "pytest", command: "pytest", covers: [""], expensive: true, runsWhole: false,
  };

  function sandbox(): { repo: string; sessionsDir: string } {
    const repo = makeSeededRepo({ "widget.py": "W = 0\n" });
    const sessionsDir = join(repo, "docs", "sessions");
    mkdirSync(sessionsDir, { recursive: true });
    return { repo, sessionsDir };
  }

  const only = (repo: string, sessionsDir: string): { passed: boolean; reason: string } =>
    evaluateFreshness(sessionsDir, null, [SUITE], { repoRoot: repo })[0] as {
      passed: boolean;
      reason: string;
    };

  it("never accepts a targeted run in place of the complete one", () => {
    const { repo, sessionsDir } = sandbox();
    recordRun(sessionsDir, SUITE, "passed", {
      stage: STAGE_PREVERIFY_TARGETED, durationSeconds: 1.0,
      command: "pytest tests/test_widget.py", policy: POLICY_TARGETED, repoRoot: repo,
    });
    const before = only(repo, sessionsDir);
    expect(before.passed).toBe(false);
    expect(before.reason).toContain(STAGE_PREVERIFY_TARGETED);

    recordRun(sessionsDir, SUITE, "passed", {
      stage: STAGE_FINAL_FULL, durationSeconds: 1.0, repoRoot: repo,
    });
    expect(only(repo, sessionsDir).passed).toBe(true);
  });

  it("binds a complete run to the tree it ran against", () => {
    const { repo, sessionsDir } = sandbox();
    recordRun(sessionsDir, SUITE, "passed", {
      stage: STAGE_FINAL_FULL, durationSeconds: 1.0, repoRoot: repo,
    });
    expect(only(repo, sessionsDir).passed).toBe(true);
    writeFileSync(join(repo, "widget.py"), "W = 1\n", "utf8");
    expect(only(repo, sessionsDir).passed).toBe(false);
  });

  it("asks nothing of a suite whose surfaces the session never touched", () => {
    const { repo, sessionsDir } = sandbox();
    const verdict = evaluateFreshness(sessionsDir, [], [SUITE], { repoRoot: repo })[0];
    expect(verdict?.required).toBe(false);
    expect(verdict?.passed).toBe(true);
  });

  it("refuses a fresh record whose outcome was red", () => {
    const { repo, sessionsDir } = sandbox();
    recordRun(sessionsDir, SUITE, "failed", {
      stage: STAGE_FINAL_FULL, durationSeconds: 1.0, repoRoot: repo,
    });
    const verdict = only(repo, sessionsDir);
    expect(verdict.passed).toBe(false);
    expect(verdict.reason).toContain("outcome");
  });
});

// --- A real repository, both routers ------------------------------------------------------

describe("the selector against a checkout", () => {
  it("names a test that exists and drops one that was deleted", () => {
    // Presence is what keeps a deleted test out of the command -- naming it
    // would fail the very run it was meant to prove.
    const repo = tree();
    unlinkSync(join(repo, "tests", "test_widget.py"));
    const result = selectTests(repo, ["tests/test_widget.py"], SELECTION);
    expect(result.testPaths).toEqual(["tests/test_smoke.py"]);
    expect(result.unknownPaths).toEqual(["tests/test_widget.py"]);
    // The repository still holds the rest, so nothing else moved.
    expect(
      execFileSync("git", ["ls-files"], { cwd: repo, encoding: "utf8" }),
    ).toContain("tests/test_engine.py");
  });
});
