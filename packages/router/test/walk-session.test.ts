// One session, driven from `next` to `done`.
//
// One repository, one plan, one step -- reported wrongly once and then
// rightly -- the framework's own long work waited on, verification over the
// offline transport's scripted answers, the land, the run of record and the
// close. Every transition is a milestone asserted in order, because what
// this file is for is the ORDER: each of the pieces has its own test, and
// what none of them can show is that the loop goes through them once, in
// this sequence, leaving the record it leaves.
//
// No engine binary, no vendor call, no hand-written record: the step
// answers come from the verbs an engine would run, and the verifier answers
// from files the config names.
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import { CONFIG_ENV_VAR } from "../src/config.ts";
import { sessionNext } from "../src/drive.ts";
import { readInstruction, readReport, readRun, readWorkPlan } from "../src/driver.ts";
import type { DriverInstruction } from "../src/generated/index.ts";
import { readRounds } from "../src/ledger.ts";
import { capture } from "../src/output.ts";
import { readSessionState } from "../src/progress.ts";
import { resetForTests as resetRouter } from "../src/route.ts";
import { resetForTests as resetRuntimeMode } from "../src/runtimeMode.ts";
import { EXIT_OK, planAmend, report } from "../src/session.ts";
import { readRecords } from "../src/testEvidence.ts";
import { readTaskDeclaration } from "../src/writers.ts";
import { makeConfig, seed, setProviderKeys, tempDir } from "./support/answers.ts";
import { gitOut, makeRepo } from "./support/repo.ts";

const NODE = process.execPath;
const WIDGET_V3 = "def widget():\n    return 3\n";
const VERIFIED = "VERIFIED\n\nThe widget is real.\n";

const SEED: Record<string, string> = {
  "docs/sessions/session-plan.md":
    "### Session 1 of 2: The widget\n1. Register.\n2. Make `widget()` return 2.\n" +
    "3. Verify; close.\n\n### Session 2 of 2: Later\n1. Polish.\n",
  "dabbler.yaml": "schema_version: 1\n",
  "src/widget.py": "def widget():\n    return 1\n",
  "tests/test_widget.py": "def test_widget():\n    assert True\n",
  // The suite: red while the widget says it is broken, green otherwise.
  "tests/run.mjs":
    "import { readFileSync } from 'node:fs';\n" +
    "const widget = readFileSync('src/widget.py', 'utf8');\n" +
    "process.exit(widget.includes('broken') ? 1 : 0);\n",
  ".gitignore": ".dabbler/\n",
};

const TESTING = {
  suites: [
    {
      name: "unit",
      command: "node tests/run.mjs",
      expensive: true,
      covers: ["src/", "tests/"],
      test_roots: ["tests"],
      test_glob: "test_*.py",
    },
  ],
  selection: {
    repo_wide: ["dabbler.yaml"],
    smoke: ["tests/test_widget.py"],
    rules: [{ when: "src/widget.py", select: ["tests/test_widget.py"] }],
  },
};

const PLAN = {
  task: "Make widget() return 2.",
  releasable: false,
  steps: [
    {
      id: "widget",
      ask: "Make widget() return 2.",
      files: ["src/widget.py"],
      checks: [
        {
          argv: [
            NODE,
            "-e",
            "process.exit(require('fs').readFileSync('src/widget.py','utf8').includes('return 2') ? 0 : 1)",
          ],
        },
      ],
    },
  ],
};

/** The verifier's scripted answers, and the transport that serves them. */
function configure(responses: readonly string[]): void {
  const dir = tempDir("responses-");
  const files: Record<string, string> = {};
  responses.forEach((text, index) => {
    files[`${String(index + 1).padStart(2, "0")}.md`] = text;
  });
  seed(dir, files);
  const configDir = tempDir("config-");
  seed(configDir, {
    "router-config.yaml": JSON.stringify(
      makeConfig({
        transports: { offline: { responses_dir: dir } },
        transport: { profile: "offline" },
        testing: TESTING,
      }),
    ),
  });
  process.env[CONFIG_ENV_VAR] = join(configDir, "router-config.yaml");
}

/** One `next`, and the instruction it printed on stdout. */
async function next(
  sessionsDir: string,
  options: { engine?: string; provider?: string } = {},
): Promise<{ code: number; instruction: DriverInstruction | null; err: string }> {
  const collected = await capture(() => sessionNext(sessionsDir, options));
  return {
    code: collected.value,
    err: collected.stderr,
    instruction:
      collected.stdout.trim() === ""
        ? null
        : (JSON.parse(collected.stdout) as DriverInstruction),
  };
}

/** The verb an engine runs to answer a plan instruction. */
async function answerPlan(sessionsDir: string, seq: number, body: unknown): Promise<number> {
  const path = join(tempDir("answer-"), "answer.json");
  writeFileSync(path, JSON.stringify(body), "utf8");
  return (await capture(() => Promise.resolve(report(sessionsDir, { seq, answerFile: path }))))
    .value;
}

/** The verb an engine runs to answer a step instruction. */
async function answerStep(
  sessionsDir: string,
  seq: number,
  stepId: string,
  files: readonly string[],
): Promise<{ code: number; err: string }> {
  const collected = await capture(() =>
    Promise.resolve(
      report(sessionsDir, {
        seq,
        stepId,
        status: "done",
        files,
        testsRun: null,
        notes: "walked",
      }),
    ),
  );
  return { code: collected.value, err: collected.stderr };
}

after(() => {
  delete process.env[CONFIG_ENV_VAR];
  resetRouter();
  resetRuntimeMode();
});

describe("one session, walked from next to done", () => {
  it("goes through every phase once, in order, and leaves the record each one owns", async () => {
    setProviderKeys();
    delete process.env["DABBLER_TRANSPORT"];
    resetRouter();
    resetRuntimeMode();
    const repo = makeRepo(SEED, { origin: true });
    const sessionsDir = join(repo, "docs", "sessions");
    configure([VERIFIED]);

    const milestones: string[] = [];

    // --- the first call registers, and asks for a plan ------------------------
    const plan = await next(sessionsDir, { engine: "claude-code", provider: "anthropic" });
    assert.equal(plan.code, EXIT_OK);
    assert.equal(plan.instruction?.kind, "step");
    assert.equal(plan.instruction?.step_id, "plan");
    // The session's own text reaches the engine, so the plan is of THIS work.
    assert.match(String(plan.instruction?.ask), /Make `widget\(\)` return 2\./);
    // Stdout is the instruction and nothing else -- a parser reads it -- and
    // everything the verbs said on the way is on stderr, where the person is.
    assert.match(plan.err, /dabbler \[/);
    assert.equal(readRun(repo, 1)?.phase, "plan");
    milestones.push("registered and asked to plan");

    assert.equal(await answerPlan(sessionsDir, plan.instruction?.seq ?? 0, PLAN), EXIT_OK);

    // --- the plan is accepted, declared, and becomes the step ----------------
    const step = await next(sessionsDir);
    assert.equal(step.instruction?.step_id, "widget");
    assert.equal(readRun(repo, 1)?.phase, "steps");
    // Accepting a plan declares the session's task: the record says what this
    // session is for before any of it is done.
    assert.equal(readTaskDeclaration(sessionsDir, 1)?.["task"], PLAN.task);
    milestones.push("planned and declared");

    // --- a report that names what the tree did not move is refused -----------
    const wrong = await answerStep(sessionsDir, step.instruction?.seq ?? 0, "widget", [
      "src/widget.py",
    ]);
    assert.equal(wrong.code, EXIT_OK, "the verb writes it; the driver judges it");
    const rejection = await next(sessionsDir);
    assert.equal(rejection.instruction?.kind, "rejection");
    assert.match(
      String(rejection.instruction?.reasons?.join(" ")),
      /files-changed-unchanged/,
    );
    milestones.push("refused a report the tree does not bear out");

    // --- work the step's own check refuses ----------------------------------
    // The step is done, honestly reported, and the check the plan declared
    // says no. That is the gate on the work rather than on the report.
    writeFileSync(join(repo, "src", "widget.py"), WIDGET_V3, "utf8");
    const checked = await answerStep(sessionsDir, rejection.instruction?.seq ?? 0, "widget", [
      "src/widget.py",
    ]);
    assert.equal(checked.code, EXIT_OK);
    const refusedCheck = await next(sessionsDir);
    assert.equal(refusedCheck.instruction?.kind, "rejection");
    assert.match(String(refusedCheck.instruction?.reasons?.join(" ")), /check-failed/);
    milestones.push("refused the work its own check rejects");

    // --- the step is amended, and the NEXT judgement uses the amendment -----
    // The check was wrong, not the work. A step is re-read from the plan
    // before it is judged again, so an amendment moves what the next
    // judgement measures against -- without it the step would be judged
    // forever against the definition it was refused under, and the same
    // report would be refused again for the same reason.
    const checksFile = join(tempDir("amend-"), "checks.json");
    writeFileSync(
      checksFile,
      JSON.stringify([
        {
          argv: [
            NODE,
            "-e",
            "process.exit(require('fs').readFileSync('src/widget.py','utf8').includes('return 3') ? 0 : 1)",
          ],
        },
      ]),
      "utf8",
    );
    const amended = await capture(() =>
      Promise.resolve(
        planAmend(sessionsDir, {
          stepId: "widget",
          files: null,
          checksFile,
          maxRounds: null,
          reason: "the check named the value the plan guessed, not the one the work needs",
          approver: "the walkthrough",
        }),
      ),
    );
    assert.equal(amended.value, EXIT_OK, amended.stderr);
    assert.deepEqual(readWorkPlan(repo, 1)?.steps[0]?.checks[0]?.argv.slice(-1), [
      "process.exit(require('fs').readFileSync('src/widget.py','utf8').includes('return 3') ? 0 : 1)",
    ]);
    milestones.push("amended the step it was refused under");

    // --- the same report, now accepted, because the definition moved --------
    const right = await answerStep(
      sessionsDir,
      refusedCheck.instruction?.seq ?? 0,
      "widget",
      ["src/widget.py"],
    );
    assert.equal(right.code, EXIT_OK);
    assert.equal(readReport(repo, 1)?.step_id, "widget");
    milestones.push("reported the step it did");

    // --- from here the framework works, and a call is a poll ----------------
    let instruction: DriverInstruction | null = null;
    for (let call = 0; call < 60; call += 1) {
      const move = await next(sessionsDir);
      instruction = move.instruction;
      if (instruction === null) break;
      if (instruction.kind === "done") break;
      if (instruction.kind === "wait") {
        // A wait owes nothing but another call: no answer, no sleep held.
        assert.ok(Number(instruction.retry_after_seconds) > 0);
        if (!milestones.includes("waited on the framework's own job")) {
          milestones.push("waited on the framework's own job");
        }
        continue;
      }
      assert.fail(
        `the framework asked for ${instruction.kind} ${String(instruction.step_id)} after the step was done`,
      );
    }
    assert.equal(instruction?.kind, "done");
    milestones.push("done");

    // --- and what each phase left behind ------------------------------------
    // Verification: one round, recorded by the verifier and nobody else.
    const rounds = readRounds(repo, 1);
    assert.equal(rounds.length, 1);
    assert.equal(rounds[0]?.["verdict"], "VERIFIED");

    // The run of record: the complete suite, over the verified tree.
    const records = readRecords(repo);
    assert.ok(records.some((row) => String(row.stage) === "final-full"));

    // The land: the work is committed, the tree is clean, and the branch is
    // ahead of nothing -- it was pushed.
    assert.match(readFileSync(join(repo, "src", "widget.py"), "utf8"), /return 3/);
    assert.equal(gitOut(repo, "status", "--porcelain").trim(), "");
    assert.equal(gitOut(repo, "rev-list", "--count", "@{upstream}..HEAD").trim(), "0");

    // The close: the session is complete, and its verdict is on the record.
    const state = readSessionState(sessionsDir);
    const session = ((state?.["sessions"] ?? []) as Array<Record<string, unknown>>).find(
      (row) => row["number"] === 1,
    );
    assert.equal(session?.["status"], "complete");
    assert.equal(session?.["verificationVerdict"], "VERIFIED");

    // Nothing is outstanding: the conversation is closed, and the last
    // instruction names no answer because there is none to give.
    assert.equal(readInstruction(repo, 1)?.kind, "done");
    assert.equal(readInstruction(repo, 1)?.answer_command, undefined);
    assert.ok(existsSync(join(repo, ".dabbler", "runs", "s1", "driver", "run.json")));

    assert.deepEqual(milestones, [
      "registered and asked to plan",
      "planned and declared",
      "refused a report the tree does not bear out",
      "refused the work its own check rejects",
      "amended the step it was refused under",
      "reported the step it did",
      "waited on the framework's own job",
      "done",
    ]);
  });
});
