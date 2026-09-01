// The tests phase: the verifier authors, the framework runs, and the exit
// code is the fact the loop reads.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { grantForTransport } from "../src/agency.ts";
import { checkRunGreen } from "../src/checks.ts";
import { git, makeTempDir, removeTempDirs } from "./support/fixtures.ts";
import { readText } from "../src/textfile.ts";

afterAll(removeTempDirs);

// Quoted, because this machine's Node lives under `C:/Program Files`. A
// targeted command is re-split with `shlexSplit`, which would otherwise take
// the space as an argument boundary and look for a program called `C:/Program`.
const INTERPRETER = `"${process.execPath.split("\\").join("/")}"`;

const A_TEST = `\`\`\`test-write path=tests/test_value.py
from app import VALUE


def test_the_value_is_one():
    assert VALUE == 1
\`\`\`
`;

/** The router, replaced at the module boundary; see `stepreview.test.ts`. */
const state = vi.hoisted(() => ({
  provider: "openai",
  body: "",
  honourExclusion: true,
  transport: "copilot-cli",
  simulated: false,
  calls: [] as Array<{ content: string; role: string; exclude: string[] }>,
}));

vi.mock("../src/route.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/route.ts")>();
  return {
    ...actual,
    route: (content: string, options: Record<string, unknown> = {}) => {
      const exclude = (options.excludeProviders as string[]) ?? [];
      state.calls.push({
        content,
        role: String(options.role),
        exclude: [...exclude],
      });
      if (state.honourExclusion && exclude.includes(state.provider)) {
        throw new actual.NoCandidateError(`${state.provider} is excluded`);
      }
      return Promise.resolve({
        content: state.body,
        model_name: `${state.provider}-model`,
        model_id: "x",
        provider: state.provider,
        input_tokens: 1,
        output_tokens: 1,
        escalated: false,
        escalation_history: [],
        elapsed_seconds: 0.1,
        transport: state.transport,
        truncated: false,
        transport_session_id: null,
        served_model_id: null,
        metadata: state.simulated ? { simulated: true } : {},
      });
    },
  };
});

const {
  author,
  authoringWritten,
  buildPrompt,
  PhaseError,
  runAuthored,
  suitesFor,
} = await import("../src/testphase.ts");

function config(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    run_policy: { check_timeout_seconds: 60 },
    testing: {
      suites: [
        {
          name: "unit",
          argv: [INTERPRETER, "runner.js"],
          covers: ["app.py", "tests/"],
          test_roots: ["tests"],
          test_glob: "test_*.py",
        },
      ],
    },
    ...overrides,
  };
}

/**
 * A repository that declares where its tests live and one suite that runs
 * them. The suite echoes what it was asked to run and fails, so a run is
 * legible without a real test framework in the sandbox.
 */
function makeRepo(): string {
  const root = join(makeTempDir(), "work");
  mkdirSync(join(root, "tests"), { recursive: true });
  writeFileSync(join(root, "app.py"), "VALUE = 1\n", "utf8");
  writeFileSync(
    join(root, "runner.js"),
    "process.stdout.write(process.argv.slice(2).join(' '));\nprocess.exit(3);\n",
    "utf8",
  );
  writeFileSync(join(root, ".gitignore"), ".dabbler/\n", "utf8");
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "test@example.invalid");
  git(root, "config", "user.name", "Test");
  git(root, "config", "commit.gpgsign", "false");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "seed");
  return root;
}

beforeEach(() => {
  state.provider = "openai";
  state.body = A_TEST;
  state.honourExclusion = true;
  state.transport = "copilot-cli";
  state.simulated = false;
  state.calls = [];
});

describe("the hand-off", () => {
  it("asks for files and refuses a claim about them", () => {
    // The split is the whole feature: a verifier that reports on the tests it
    // wrote is scoring its own work, and the result stops being a fact the
    // loop can branch on.
    const grant = grantForTransport("copilot-cli", {
      scope: ["app.py"],
      readBudget: 40,
      testScopes: [{ suite: "python", roots: ["tests"], glob: "test_*.py" }],
      allowWrite: true,
    });
    const prompt = buildPrompt("csv-demo", "plan", [["app.py", "VALUE = 1\n"]], grant);
    expect(prompt).toContain("```test-write path=tests/test_example.py");
    expect(prompt).toContain("you must not say whether they pass");
  });

  it("never lets the author of the code write its tests", async () => {
    const repo = makeRepo();
    await author(repo, "csv-demo", "plan", [join(repo, "app.py")], config(), {
      authorProvider: "anthropic",
      transport: "copilot-cli",
    });
    expect(state.calls[0]?.exclude).toEqual(["anthropic"]);
  });

  it("refuses one vendor answering despite exclusion", async () => {
    // `route()` builds the offline candidate without consulting the
    // exclusion, so the guarantee has to be asserted at the answer too.
    const repo = makeRepo();
    state.provider = "anthropic";
    state.honourExclusion = false;
    await expect(
      author(repo, "csv-demo", "plan", [join(repo, "app.py")], config(), {
        authorProvider: "anthropic",
        transport: "copilot-cli",
      }),
    ).rejects.toThrow(/despite being excluded/);
  });

  it("grants the write a review round withholds", async () => {
    // Session 7 built the boundary and left the grant off everywhere. This is
    // the one round that turns it on, so the file has to land.
    const repo = makeRepo();
    const [authoring] = await author(
      repo,
      "csv-demo",
      "plan",
      [join(repo, "app.py")],
      config(),
      { transport: "copilot-cli" },
    );
    expect(authoringWritten(authoring)).toEqual(["tests/test_value.py"]);
    expect(readText(join(repo, "tests", "test_value.py"))).toMatch(
      /^from app import VALUE/,
    );
  });

  it("refuses a repository that declares no test root, up front", async () => {
    // Every write would be refused for want of a root, after the call that
    // produced them had already been paid for.
    const repo = makeRepo();
    await expect(
      author(
        repo,
        "csv-demo",
        "plan",
        [join(repo, "app.py")],
        config({ testing: { suites: [] } }),
        { transport: "copilot-cli" },
      ),
    ).rejects.toThrow(/declares where its tests live/);
  });

  it("still authors tests on a transport with no tools", async () => {
    // The write costs no tool-use loop -- it is a fenced block in an ordinary
    // answer. Confining it to the seat would put a phase the lifecycle
    // requires out of reach of the config this package ships.
    const repo = makeRepo();
    state.transport = "api";
    const [authoring] = await author(
      repo,
      "csv-demo",
      "plan",
      [join(repo, "app.py")],
      config(),
      { transport: "api" },
    );
    expect(authoringWritten(authoring)).toEqual(["tests/test_value.py"]);
    expect(existsSync(join(repo, "tests", "test_value.py"))).toBe(true);
  });
});

describe("the framework runs them", () => {
  it("names the authored tests and reports the exit code", async () => {
    const repo = makeRepo();
    const runs = await runAuthored(repo, config(), ["tests/test_value.py"]);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.exitCode).toBe(3);
    expect(checkRunGreen(runs[0])).toBe(false);
    expect(runs[0]?.output.trim().endsWith("tests/test_value.py")).toBe(true);
  });

  it("refuses a test no declared suite covers rather than running it", async () => {
    // A runner invented here would be a second implementation of what a suite
    // is, and a green from it would mean nothing.
    const repo = makeRepo();
    await expect(
      runAuthored(repo, config(), ["elsewhere/test_stray.py"]),
    ).rejects.toThrow(/no declared suite covers/);
  });

  it("sends each ecosystem's tests to its own runner", async () => {
    // Routing is by the suite's own test declaration, not by whichever suite
    // was declared first. A Java test handed to `dotnet test` would file a
    // result under a runner that never saw it, so one round is one run per
    // owning suite rather than one run for the lot.
    const repo = makeRepo();
    const runner = `${INTERPRETER} runner.js`;
    const two = config({
      testing: {
        suites: [
          {
            name: "maven",
            command: runner,
            covers: ["src/"],
            test_roots: ["src/test/java"],
            test_glob: "*Test.java",
          },
          {
            name: "dotnet",
            command: runner,
            covers: ["src/"],
            test_roots: ["test"],
            test_glob: "*Tests.cs",
          },
        ],
      },
    });
    const paths = ["test/AdderTests.cs", "src/test/java/AdderTest.java"];
    expect(suitesFor(two, paths).map(([c, p]) => [c.name, [...p]])).toEqual([
      ["maven", ["src/test/java/AdderTest.java"]],
      ["dotnet", ["test/AdderTests.cs"]],
    ]);
    const runs = await runAuthored(repo, two, paths);
    expect(runs.map((r) => [r.check.name, r.command])).toEqual([
      ["maven", `${runner} src/test/java/AdderTest.java`],
      ["dotnet", `${runner} test/AdderTests.cs`],
    ]);
    // Two real subprocesses, which is the claim: one run per owning suite.
    // Under the whole suite's parallelism that outruns the 5 s default.
  }, 30_000);

  it("refuses running nothing", async () => {
    // A run of no tests exits zero, which is indistinguishable from a suite
    // that passed.
    const repo = makeRepo();
    await expect(runAuthored(repo, config(), [])).rejects.toBeInstanceOf(PhaseError);
  });
});
