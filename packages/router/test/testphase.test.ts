// The tests phase: the verifier authors, the framework runs, and the exit
// code is the fact the loop reads.
//
// The routed call arrives through the router's own seam with scripted
// replies, so no module is replaced -- this is what the last `vi.mock` of
// route.ts was standing in for. The suite the framework runs is a real
// process, because "the exit code is the fact" is a claim about one.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { grantForTransport } from "../src/agency.ts";
import { checkRunGreen } from "../src/checks.ts";
import { readText } from "../src/textfile.ts";
import {
  PhaseError,
  author,
  authoringWritten,
  buildPrompt,
  runAuthored,
  suitesFor,
} from "../src/testphase.ts";
import { routeAnswers, type Reply, type RoutedCall } from "./support/answers.ts";
import { makeRepo } from "./support/repo.ts";

// Quoted, because this machine's Node lives under `C:/Program Files`. A
// targeted command is re-split with `shlexSplit`, which would otherwise take
// the space as an argument boundary and look for a program called
// `C:/Program`.
const INTERPRETER = `"${process.execPath.split("\\").join("/")}"`;

const A_TEST = `\`\`\`test-write path=tests/test_value.py
from app import VALUE


def test_the_value_is_one():
    assert VALUE == 1
\`\`\`
`;

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
function repo(): string {
  return makeRepo({
    "app.py": "VALUE = 1\n",
    "runner.js":
      "process.stdout.write(process.argv.slice(2).join(' '));\nprocess.exit(3);\n",
    ".gitignore": ".dabbler/\n",
    "tests/.keep": "",
  });
}

/** Script one reply from the router and record what it was asked. */
function scripted(
  replies: readonly Reply[],
  options: { honourExclusion?: boolean; transport?: string } = {},
): { calls: RoutedCall[]; restore: () => void } {
  const calls: RoutedCall[] = [];
  return { calls, restore: routeAnswers(replies, { ...options, calls }) };
}

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
    assert.match(prompt, /```test-write path=tests\/test_example\.py/);
    assert.match(prompt, /you must not say whether they pass/);
  });

  it("never lets the author of the code write its tests", async () => {
    const root = repo();
    const router = scripted([["openai", A_TEST]], { transport: "copilot-cli" });
    try {
      await author(root, "csv-demo", "plan", [join(root, "app.py")], config(), {
        authorProvider: "anthropic",
        transport: "copilot-cli",
      });
      assert.deepEqual(router.calls[0]?.exclude, ["anthropic"]);
    } finally {
      router.restore();
    }
  });

  it("refuses one vendor answering despite exclusion", async () => {
    // `route()` builds the offline candidate without consulting the
    // exclusion, so the guarantee has to be asserted at the answer too.
    const root = repo();
    const router = scripted([["anthropic", A_TEST]], {
      honourExclusion: false,
      transport: "copilot-cli",
    });
    try {
      await assert.rejects(
        () =>
          author(root, "csv-demo", "plan", [join(root, "app.py")], config(), {
            authorProvider: "anthropic",
            transport: "copilot-cli",
          }),
        /despite being excluded/,
      );
    } finally {
      router.restore();
    }
  });

  it("grants the write a review round withholds", async () => {
    // The one round that turns the write grant on, so the file has to land.
    const root = repo();
    const router = scripted([["openai", A_TEST]], { transport: "copilot-cli" });
    try {
      const [authoring] = await author(
        root,
        "csv-demo",
        "plan",
        [join(root, "app.py")],
        config(),
        { transport: "copilot-cli" },
      );
      assert.deepEqual(authoringWritten(authoring), ["tests/test_value.py"]);
      assert.match(readText(join(root, "tests", "test_value.py")), /^from app import VALUE/);
    } finally {
      router.restore();
    }
  });

  it("refuses a repository that declares no test root, up front", async () => {
    // Every write would be refused for want of a root, after the call that
    // produced them had already been paid for.
    const root = repo();
    const router = scripted([["openai", A_TEST]], { transport: "copilot-cli" });
    try {
      await assert.rejects(
        () =>
          author(
            root,
            "csv-demo",
            "plan",
            [join(root, "app.py")],
            config({ testing: { suites: [] } }),
            { transport: "copilot-cli" },
          ),
        /declares where its tests live/,
      );
      // Up front means before the call: nothing was asked for.
      assert.equal(router.calls.length, 0);
    } finally {
      router.restore();
    }
  });

  it("still authors tests on a transport with no tools", async () => {
    // The write costs no tool-use loop -- it is a fenced block in an ordinary
    // answer. Confining it to the seat would put a phase the lifecycle
    // requires out of reach of the config this package ships.
    const root = repo();
    const router = scripted([["openai", A_TEST]], { transport: "api" });
    try {
      const [authoring] = await author(
        root,
        "csv-demo",
        "plan",
        [join(root, "app.py")],
        config(),
        { transport: "api" },
      );
      assert.deepEqual(authoringWritten(authoring), ["tests/test_value.py"]);
      assert.ok(existsSync(join(root, "tests", "test_value.py")));
    } finally {
      router.restore();
    }
  });
});

describe("the framework runs them", () => {
  it("names the authored tests and reports the exit code", async () => {
    const root = repo();
    const runs = await runAuthored(root, config(), ["tests/test_value.py"]);
    assert.equal(runs.length, 1);
    assert.equal(runs[0]?.exitCode, 3);
    assert.equal(checkRunGreen(runs[0]), false);
    assert.ok(runs[0]?.output.trim().endsWith("tests/test_value.py"));
  });

  it("refuses a test no declared suite covers rather than running it", async () => {
    // A runner invented here would be a second implementation of what a
    // suite is, and a green from it would mean nothing.
    const root = repo();
    await assert.rejects(
      () => runAuthored(root, config(), ["elsewhere/test_stray.py"]),
      /no declared suite covers/,
    );
  });

  it("refuses running nothing", async () => {
    // A run of no tests exits zero, which is indistinguishable from a suite
    // that passed.
    const root = repo();
    await assert.rejects(() => runAuthored(root, config(), []), PhaseError);
  });

  it("sends each ecosystem's tests to its own runner", async () => {
    // Routing is by the suite's own test declaration, not by whichever suite
    // was declared first. A Java test handed to `dotnet test` would file a
    // result under a runner that never saw it, so one round is one run per
    // owning suite rather than one run for the lot.
    const root = repo();
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
    assert.deepEqual(
      suitesFor(two, paths).map(([check, owned]) => [check.name, [...owned]]),
      [
        ["maven", ["src/test/java/AdderTest.java"]],
        ["dotnet", ["test/AdderTests.cs"]],
      ],
    );
    const runs = await runAuthored(root, two, paths);
    assert.deepEqual(
      runs.map((run) => [run.check.name, run.command]),
      [
        ["maven", `${runner} src/test/java/AdderTest.java`],
        ["dotnet", `${runner} test/AdderTests.cs`],
      ],
    );
  });
});
