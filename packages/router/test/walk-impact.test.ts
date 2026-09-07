// A module session's run of record, walked end to end over a two-module
// repository: the candidate is packed before any suite runs, only the suites
// the impact plan reached run, and the close gate demands those and no
// other. The suites and the pack are scripted programs; the verifier is the
// offline transport's scripted answer, as walk-session's is.
//
// A walkthrough, because the thing under test is the run-of-record phase
// standing on a real repository, a real clone and real jobs.

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import { defaultClonePath } from "../src/checkout.ts";
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
import { makeRepo } from "./support/repo.ts";

const NODE = process.execPath;
const VERIFIED = "VERIFIED\n\nThe store is real.\n";

const MANIFEST = [
  "modules:",
  "- slug: model",
  "  kind: shared-types",
  "  package: CsvModel",
  "  codeRoots:",
  "  - modules/model",
  "- slug: persister",
  "  package: CsvPersister",
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
  // The root build files a multi-module solution has once its second
  // module was declared (session 103): the candidate moves a pin in them,
  // never makes them.
  "nuget.config":
    '<?xml version="1.0" encoding="utf-8"?>\n<configuration>\n  <packageSources>\n' +
    '    <add key="modules" value="packages" />\n  </packageSources>\n</configuration>\n',
  "Directory.Packages.props":
    "<Project>\n  <PropertyGroup>\n    <ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally>\n" +
    '  </PropertyGroup>\n  <ItemGroup Label="Modules">\n    <PackageVersion Include="CsvModel" Version="0.1.0" />\n' +
    "  </ItemGroup>\n</Project>\n",
  "Directory.Build.props": "<Project />\n",
  "Directory.Build.targets": "<Project />\n",
  "packages/.gitattributes": "# *.nupkg filter=lfs diff=lfs merge=lfs -text\n",
  "packages/README.md": "# packages\n",
  "packages/CsvModel.0.1.0.nupkg": "stands in for the model's package\n",
  "modules/model/src/CsvModel/CsvModel.csproj": "<Project><PropertyGroup><Version>0.1.0</Version></PropertyGroup></Project>\n",
  "modules/model/src/CsvModel/Person.cs": "public sealed class Person {}\n",
  "modules/model/contract/README.md": "# CsvModel\n",
  "modules/persister/src/CsvPersister/CsvPersister.csproj": "<Project><PropertyGroup><Version>0.1.0</Version></PropertyGroup></Project>\n",
  "modules/persister/src/CsvPersister/Store.cs": "public sealed class Store { public int Count => 0; }\n",
  "modules/persister/contract/README.md": "# CsvPersister\n",
  // Each suite appends its name: which ran, and in what order, is the record.
  "tests/run.mjs":
    "import { appendFileSync } from 'node:fs';\n" +
    "appendFileSync('tests/ran.log', process.argv[2] + '\\n');\n" +
    "process.exit(0);\n",
  // The scripted pack: the artifact the framework expects, and nothing else.
  "tests/pack.mjs":
    "import { writeFileSync } from 'node:fs';\n" +
    "import { join } from 'node:path';\n" +
    "const [output, version, id] = process.argv.slice(2);\n" +
    "writeFileSync(join(output, id + '.' + version + '.nupkg'), 'package bytes\\n');\n",
  ".gitignore": ".dabbler/\ntests/ran.log\n",
};

// The scripted suites and pack live under `tests/`, a root-level directory
// that no module's cone holds by itself; each module declares them shared,
// which is what puts the folder in its focused checkout.
function packaging(id: string): Record<string, unknown> {
  return {
    sharedFiles: ["tests/run.mjs", "tests/pack.mjs"],
    packaging: {
      pack: { argv: [NODE, "tests/pack.mjs", "{output}", "{version}", id] },
      push: {
        argv: [NODE, "-e", "process.exit(1)", "{artifact}", "{feed}", "{secret}"],
        feed: "https://feed.example.invalid/v3/index.json",
        secret: "DABBLER_TEST_FEED_PAT",
      },
    },
  };
}

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
  releasable: false,
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

// The repository's own declaration -- its suites and its modules' packaging --
// lives in its dabbler.yaml, where the close's gates read it; JSON is YAML.
const DABBLER_YAML = JSON.stringify(
  {
    schema_version: 1,
    testing: TESTING,
    modules: { model: packaging("CsvModel"), persister: packaging("CsvPersister") },
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
        modules: { model: packaging("CsvModel"), persister: packaging("CsvPersister") },
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
const clone = defaultClonePath(repo, "persister", null);
const cloneSessions = join(clone, "docs", "sessions");

describe("a module session's run of record", () => {
  it("packs the changed module's candidate before any suite, runs the suites the plan reached and no other", async () => {
    setProviderKeys();
    delete process.env["DABBLER_TRANSPORT"];
    resetRouter();
    resetRuntimeMode();
    configure([VERIFIED]);

    const started = await capture(() =>
      Promise.resolve(start(join(repo, "docs", "sessions"), { engine: "claude-code", provider: "anthropic", module: "persister" })),
    );
    assert.equal(started.value, EXIT_OK, started.stderr);
    assert.ok(existsSync(join(clone, "modules", "persister")));

    const plan = await next(cloneSessions);
    assert.equal(plan.instruction?.step_id, "plan", plan.err);
    assert.equal(await answer(cloneSessions, plan.instruction?.seq ?? 0, PLAN), EXIT_OK);
    const step = await next(cloneSessions);
    assert.equal(step.instruction?.step_id, "store", `${step.err}\n${JSON.stringify(step.instruction, null, 1)}`);
    writeFileSync(
      join(clone, "modules", "persister", "src", "CsvPersister", "Store.cs"),
      "public sealed class Store { public int Count => 1; }\n",
      "utf8",
    );
    const reported = await capture(() =>
      Promise.resolve(
        report(cloneSessions, {
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

    // The framework works; a call is a poll, on a clock.
    const trail: string[] = [];
    const deadline = Date.now() + 180_000;
    let instruction: DriverInstruction | null = null;
    for (;;) {
      const move = await next(cloneSessions);
      trail.push(move.err);
      instruction = move.instruction;
      if (instruction === null) {
        // The framework's own jobs say why they stopped; the walk shows them.
        const jobs = join(clone, ".dabbler", "runs", "s1", "driver", "jobs");
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

    // The candidate job started before the run of record's first suite.
    const candidateAt = log.indexOf("job-started name=candidate: persister");
    const suiteAt = log.indexOf("job-started name=run of record: persister-unit");
    assert.ok(candidateAt >= 0, "the candidate job ran");
    assert.ok(suiteAt >= 0, "persister's unit suite ran");
    assert.ok(candidateAt < suiteAt, "the candidate came first");
    assert.match(log, /run-of-record-skipped suite=model-unit/);

    // Only the reached suite ran: the persister's own. The model's did not,
    // and the compatibility suite against the model did not either, because
    // the model did not change.
    assert.deepEqual(readFileSync(join(clone, "tests", "ran.log"), "utf8").trim().split("\n"), ["persister-unit"]);

    // The candidate: packed, pinned, recorded, and the plan beside the run.
    const packages = readdirSync(join(clone, "packages"));
    assert.ok(packages.some((name) => /^CsvPersister\.0\.1\.0-dev\.\d{8}\.1\.g[0-9a-f]{7}\.nupkg$/.test(name)), packages.join(", "));
    assert.match(readFileSync(join(clone, "Directory.Packages.props"), "utf8"), /Include="CsvPersister" Version="0\.1\.0-dev\./);
    const impact = readImpactPlan(clone, 1);
    assert.deepEqual(impact?.changedModules, ["persister"]);
    assert.deepEqual(impact?.candidates, ["persister"]);
    assert.deepEqual(impact?.suites.map((suite) => suite.name), ["persister-unit"]);
  });

  it("the gate demands the reached suites and no other: green with the model's suite unrecorded, red by name once the persister's record is gone", () => {
    const suites = loadSuitesChecked(loadConfig(undefined, clone), { shape: solutionShape(clone) }).suites;
    const plan = readImpactPlan(clone, 1);
    assert.ok(plan !== null);
    const verdicts = evaluateFreshness(cloneSessions, null, suites);
    // Without the plan, the model's suite is demanded and has no record.
    assert.match(judgeFreshness(verdicts)[1], /model-unit/);
    // Under the plan, only what the plan reached is demanded, and it is green.
    assert.deepEqual(judgeFreshness(demandedByPlan(verdicts, plan)), [true, ""]);

    // Take the persister's own record away: the plan's demand is refused by name.
    const records = join(clone, ".dabbler", "runs", TEST_RUNS_FILENAME);
    const kept = readFileSync(records, "utf8")
      .split(/\r?\n/)
      .filter((line) => line.trim() !== "" && !line.includes('"suite": "persister-unit"') && !line.includes('"suite":"persister-unit"'));
    writeFileSync(records, `${kept.join("\n")}\n`, "utf8");
    const [passed, reason] = judgeFreshness(demandedByPlan(evaluateFreshness(cloneSessions, null, suites), plan));
    assert.equal(passed, false);
    assert.match(reason, /persister-unit/);
    assert.doesNotMatch(reason, /model-unit/);
  });
});
