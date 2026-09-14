// A module session's run of record, walked end to end over a two-module
// repository whose modules reference each other as projects: only the suites
// the impact plan reached run, the framework writes the root build files the
// solution lacked before the work is verified, the session lands and closes
// with no candidate job, and the close gate demands the reached suites and no
// other.
// The suites are scripted programs; the verifier is the offline transport's
// scripted answer, as walk-session's is.
//
// A walkthrough, because the thing under test is the run-of-record phase
// standing on a real repository and real jobs.

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { after, describe, it } from "node:test";

import { CONFIG_ENV_VAR, loadConfig } from "../src/config.ts";
import { sessionNext } from "../src/drive.ts";
import { judgeFreshness } from "../src/gates.ts";
import type { DriverInstruction } from "../src/generated/index.ts";
import { demandedByPlan, readImpactPlan } from "../src/impact.ts";
import { solutionShape } from "../src/modules.ts";
import { capture } from "../src/output.ts";
import { resetForTests as resetRouter } from "../src/route.ts";
import { resetForTests as resetRuntimeMode } from "../src/runtimeMode.ts";
import { EXIT_OK, report, start } from "../src/session.ts";
import { TEST_RUNS_FILENAME, evaluateFreshness, loadSuitesChecked } from "../src/testEvidence.ts";
import { makeConfig, seed, setProviderKeys, tempDir } from "./support/answers.ts";
import { gitOut, makeRepo } from "./support/repo.ts";

const NODE = process.execPath;
const VERIFIED = "VERIFIED\n\nThe store is real.\n";

const MANIFEST = [
  "modules:",
  "- slug: model",
  "  kind: shared-types",
  "  codeRoots:",
  "  - modules/model",
  "- slug: persister",
  "  dependsOn:",
  "  - model",
  "  codeRoots:",
  "  - modules/persister",
  "",
].join("\n");

const SEED: Record<string, string> = {
  "docs/modules.yaml": MANIFEST,
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

// The scripted suites live under `tests/`, a root-level directory no
// module's roots hold; each module declares it shared.
const SHARED = { sharedFiles: ["tests/run.mjs"] };

const TESTING = {
  suites: [
    {
      name: "model-unit",
      module: "model",
      role: "unit",
      command: `node tests/run.mjs model-unit`,
      expensive: true,
      covers: ["modules/model/"],
      test_roots: ["modules/model/tests"],
      test_glob: "*.Tests.cs",
    },
    {
      name: "persister-unit",
      module: "persister",
      role: "unit",
      command: `node tests/run.mjs persister-unit`,
      expensive: true,
      covers: ["modules/persister/"],
      test_roots: ["modules/persister/tests"],
      test_glob: "*.Tests.cs",
    },
    {
      name: "persister-against-model",
      module: "persister",
      role: "consumer-contract",
      against: "model",
      command: `node tests/run.mjs persister-against-model`,
      expensive: true,
      covers: ["modules/persister/"],
      test_roots: ["modules/persister/tests"],
      test_glob: "*.Compatibility.cs",
    },
  ],
  selection: { repo_wide: ["dabbler.yaml"], smoke: [], rules: [] },
};

const PLAN = {
  task: "Make the store real.",
  hold_release: "the walk ships nothing",
  non_goals: ["Anything the step does not name."],
  modules: ["persister"],
  steps: [
    {
      id: "store",
      ask: "Make the store real.",
      files: ["modules/persister/src/CsvPersister/Store.cs"],
      checks: [{ argv: [NODE, "-e", "process.exit(0)"] }],
    },
  ],
};

// The repository's own declaration -- its suites and its modules' shared
// files -- lives in its dabbler.yaml, where the close's gates read it; JSON
// is YAML.
const DABBLER_YAML = JSON.stringify(
  {
    schema_version: 1,
    testing: TESTING,
    modules: { model: SHARED, persister: SHARED },
  },
  null,
  2,
);

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
        modules: { model: SHARED, persister: SHARED },
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

describe("a module session's run of record", () => {
  it("writes the root build files before the round, runs the suites the plan reached and no other, and lands and closes with no candidate job", async () => {
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

    // The run of record ran and nothing was packed before it: a sibling is
    // its project, so there is no candidate and no packages folder.
    assert.ok(log.includes("job-started name=run of record: persister-unit"), "persister's unit suite ran");
    assert.doesNotMatch(log, /job-started name=candidate/);
    assert.equal(existsSync(join(repo, "packages")), false);
    assert.match(log, /run-of-record-skipped suite=model-unit/);

    // Only the reached suite ran: the persister's own. The model's did not,
    // and the compatibility suite against the model did not either, because
    // the model did not change.
    assert.deepEqual(readFileSync(join(repo, "tests", "ran.log"), "utf8").trim().split("\n"), ["persister-unit"]);

    const impact = readImpactPlan(repo, 1);
    assert.deepEqual(impact?.changedModules, ["persister"]);
    assert.deepEqual(impact?.suites.map((suite) => suite.name), ["persister-unit"]);

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

  it("the gate demands the reached suites and no other: green with the model's suite unrecorded, red by name once the persister's record is gone", () => {
    const suites = loadSuitesChecked(loadConfig(undefined, repo), { shape: solutionShape(repo) }).suites;
    const plan = readImpactPlan(repo, 1);
    assert.ok(plan !== null);
    const verdicts = evaluateFreshness(sessions, null, suites);
    // Without the plan, the model's suite is demanded and has no record.
    assert.match(judgeFreshness(verdicts)[1], /model-unit/);
    // Under the plan, only what the plan reached is demanded, and it is green.
    assert.deepEqual(judgeFreshness(demandedByPlan(verdicts, plan)), [true, ""]);

    // Take the persister's own record away: the plan's demand is refused by name.
    const records = join(repo, ".dabbler", "runs", TEST_RUNS_FILENAME);
    const kept = readFileSync(records, "utf8")
      .split(/\r?\n/)
      .filter((line) => line.trim() !== "" && !line.includes('"suite": "persister-unit"') && !line.includes('"suite":"persister-unit"'));
    writeFileSync(records, `${kept.join("\n")}\n`, "utf8");
    const [passed, reason] = judgeFreshness(demandedByPlan(evaluateFreshness(sessions, null, suites), plan));
    assert.equal(passed, false);
    assert.match(reason, /persister-unit/);
    assert.doesNotMatch(reason, /model-unit/);
  });
});
