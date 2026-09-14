// A session in a solution whose projects have no root build files yet,
// walked end to end: the framework writes the root build files before the
// work is verified, the run of record runs every expensive suite, and the
// session lands and closes with the files the framework wrote.
// The suites are scripted programs; the verifier is the offline transport's
// scripted answer, as walk-session's is.
//
// A walkthrough, because the thing under test is the run-of-record phase
// standing on a real repository and real jobs.

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { after, describe, it } from "node:test";

import { CONFIG_ENV_VAR } from "../src/config.ts";
import { sessionNext } from "../src/drive.ts";
import type { DriverInstruction } from "../src/generated/index.ts";
import { capture } from "../src/output.ts";
import { resetForTests as resetRouter } from "../src/route.ts";
import { resetForTests as resetRuntimeMode } from "../src/runtimeMode.ts";
import { EXIT_OK, report, start } from "../src/session.ts";
import { makeConfig, seed, setProviderKeys, tempDir } from "./support/answers.ts";
import { gitOut, makeRepo } from "./support/repo.ts";

const NODE = process.execPath;
const VERIFIED = "VERIFIED\n\nThe store is real.\n";

const SEED: Record<string, string> = {
  "docs/sessions/session-plan.md":
    "### Session 1 of 2: The store\n1. Register.\n2. Make the store real.\n3. Verify; close.\n\n" +
    "### Session 2 of 2: Later\n1. Polish.\n",
  "global.json": "{}\n",
  "modules/model/src/CsvModel/CsvModel.csproj": "<Project><PropertyGroup><Version>0.1.0</Version></PropertyGroup></Project>\n",
  "modules/model/src/CsvModel/Person.cs": "public sealed class Person {}\n",
  "modules/persister/src/CsvPersister/CsvPersister.csproj":
    '<Project><ItemGroup><ProjectReference Include="../../../model/src/CsvModel/CsvModel.csproj" /></ItemGroup></Project>\n',
  "modules/persister/src/CsvPersister/Store.cs": "public sealed class Store { public int Count => 0; }\n",
  // Each suite appends its name: which ran, and in what order, is the record.
  "tests/run.mjs":
    "import { appendFileSync } from 'node:fs';\n" +
    "appendFileSync('tests/ran.log', process.argv[2] + '\\n');\n" +
    "process.exit(0);\n",
  ".gitignore": ".dabbler/\ntests/ran.log\n",
};

const TESTING = {
  suites: [
    {
      name: "model-unit",
      command: `node tests/run.mjs model-unit`,
      expensive: true,
      covers: ["modules/model/"],
    },
    {
      name: "persister-unit",
      command: `node tests/run.mjs persister-unit`,
      expensive: true,
      covers: ["modules/persister/", "tests/"],
    },
  ],
  selection: { repo_wide: ["dabbler.yaml"], smoke: [], rules: [] },
};

const PLAN = {
  task: "Make the store real.",
  hold_release: "the walk ships nothing",
  non_goals: ["Anything the step does not name."],
  steps: [
    {
      id: "store",
      ask: "Make the store real.",
      files: ["modules/persister/src/CsvPersister/Store.cs"],
      checks: [{ argv: [NODE, "-e", "process.exit(0)"] }],
    },
  ],
};

// The repository's own declaration lives in its dabbler.yaml, where the
// close's gates read it; JSON is YAML.
const DABBLER_YAML = JSON.stringify({ schema_version: 1, testing: TESTING }, null, 2);

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
        // The same declaration the repository carries, for the driver run
        // in this process, which reads its configuration where it stands.
        testing: TESTING,
      }),
    ),
  });
  process.env[CONFIG_ENV_VAR] = join(configDir, "router-config.yaml");
}

async function next(sessionsDir: string): Promise<{ code: number; instruction: DriverInstruction | null; err: string }> {
  const collected = await capture(() => sessionNext(sessionsDir, {}));
  return {
    code: collected.value,
    err: collected.stderr,
    instruction: collected.stdout.trim() === "" ? null : (JSON.parse(collected.stdout) as DriverInstruction),
  };
}

async function answer(sessionsDir: string, seq: number, body: unknown): Promise<number> {
  const path = join(tempDir("answer-"), "answer.json");
  writeFileSync(path, JSON.stringify(body), "utf8");
  return (await capture(() => Promise.resolve(report(sessionsDir, { seq, answerFile: path })))).value;
}

after(() => {
  delete process.env[CONFIG_ENV_VAR];
  resetRouter();
  resetRuntimeMode();
});

const repo = makeRepo({ ...SEED, "dabbler.yaml": `${DABBLER_YAML}\n` }, { origin: true });
const sessions = join(repo, "docs", "sessions");

describe("a session in a solution with no root build files", () => {
  it("writes the root build files before the round, runs every expensive suite, and lands and closes", async () => {
    setProviderKeys();
    resetRouter();
    resetRuntimeMode();
    configure([VERIFIED]);

    const started = await capture(() =>
      Promise.resolve(start(sessions, { engine: "claude-code", provider: "anthropic" })),
    );
    assert.equal(started.value, EXIT_OK, started.stderr);

    const plan = await next(sessions);
    assert.equal(plan.instruction?.step_id, "plan", plan.err);
    assert.equal(await answer(sessions, plan.instruction?.seq ?? 0, PLAN), EXIT_OK);
    const step = await next(sessions);
    assert.equal(step.instruction?.step_id, "store", `${step.err}\n${JSON.stringify(step.instruction, null, 1)}`);
    writeFileSync(
      join(repo, "modules", "persister", "src", "CsvPersister", "Store.cs"),
      "public sealed class Store { public int Count => 1; }\n",
      "utf8",
    );
    const reported = await capture(() =>
      Promise.resolve(
        report(sessions, {
          seq: step.instruction?.seq ?? 0,
          stepId: "store",
          status: "done",
          files: ["modules/persister/src/CsvPersister/Store.cs"],
          testsRun: null,
          notes: "walked",
        }),
      ),
    );
    assert.equal(reported.value, EXIT_OK, reported.stderr);

    // The framework works; a call is a poll, on a clock. `done` is the
    // session landed and closed.
    const trail: string[] = [];
    const deadline = Date.now() + 180_000;
    let instruction: DriverInstruction | null = null;
    for (;;) {
      const move = await next(sessions);
      trail.push(move.err);
      instruction = move.instruction;
      if (instruction === null) {
        // The framework's own jobs say why they stopped; the walk shows them.
        const jobs = join(repo, ".dabbler", "runs", "s1", "driver", "jobs");
        const logs = existsSync(jobs)
          ? readdirSync(jobs)
              .filter((name) => name.endsWith(".log"))
              .map((name) => `--- ${name}\n${readFileSync(join(jobs, name), "utf8").split("\n").slice(-15).join("\n")}`)
              .join("\n")
          : "";
        assert.fail(`next printed no instruction (exit ${move.code}); stderr:\n${move.err}\n${logs}`);
      }
      if (instruction.kind === "done") break;
      if (instruction.kind === "wait") {
        if (Date.now() > deadline) assert.fail("the framework's own jobs never finished");
        await new Promise((resolve) => setTimeout(resolve, 100));
        continue;
      }
      assert.fail(`the framework asked for ${instruction.kind} ${String(instruction.step_id)} after the step was done`);
    }
    const log = trail.join("");

    // Every expensive suite ran as the run of record, in the order declared,
    // whichever project the change was in.
    assert.doesNotMatch(log, /run-of-record-skipped/);
    assert.deepEqual(readFileSync(join(repo, "tests", "ran.log"), "utf8").trim().split("\n"), ["model-unit", "persister-unit"]);

    // The solution had no root build files: the framework wrote them before
    // the round, and they landed with the work.
    assert.match(log, /root-files/);
    const solution = `${basename(repo)}.slnx`;
    assert.match(readFileSync(join(repo, solution), "utf8"), /modules\/persister\/src\/CsvPersister\/CsvPersister\.csproj/);
    assert.match(readFileSync(join(repo, ".gitignore"), "utf8"), /^bin\/$/m);
    assert.deepEqual(
      gitOut(repo, "ls-files", solution, "Directory.Build.props", "Directory.Build.targets").split("\n").filter(Boolean).sort(),
      ["Directory.Build.props", "Directory.Build.targets", solution].sort(),
    );
  });
});
