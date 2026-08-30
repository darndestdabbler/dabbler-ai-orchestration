// The complete suite and the fix loop a red one opens: the envelope is the
// feature, and it is a boundary rather than a request.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  grantForTransport,
  WRITE_LABEL_FIX,
} from "../src/agency.ts";
import { checkRunGreen, type SelectionConfig } from "../src/checks.ts";
import { readText } from "../src/textfile.ts";
import { git, makeTempDir, removeTempDirs } from "./support/fixtures.ts";

afterAll(removeTempDirs);

// Quoted: see `testphase.test.ts` -- a targeted command is re-split, and this
// machine's Node lives under a path with a space in it.
const INTERPRETER = `"${process.execPath.split("\\").join("/")}"`;

const SELECTION: SelectionConfig = {
  scopes: [{ suite: "python", roots: ["tests"], glob: "test_*.py" }],
  smoke: [],
  repoWide: [],
  rules: [],
};

const RED =
  "rootdir: /work\n" +
  "configfile: pytest.ini\n" +
  "============ FAILURES ============\n" +
  "app.py:4: in add\n" +
  "    return a - b\n" +
  "E   assert 3 == 1\n" +
  "FAILED tests/test_add.py::test_adds - assert 3 == 1\n";

/** The router, replaced at the module boundary; see `stepreview.test.ts`. */
const state = vi.hoisted(() => ({
  body: "",
  provider: "anthropic",
  transport: "copilot-cli",
  simulated: false,
  calls: [] as Array<{ content: string; role: string }>,
}));

vi.mock("../src/route.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/route.ts")>();
  return {
    ...actual,
    route: (content: string, options: Record<string, unknown> = {}) => {
      state.calls.push({ content, role: String(options.role) });
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
  buildEnvelope,
  buildPrompt,
  envelopeAllows,
  envelopePaths,
  failures,
  fix,
  fixRefused,
  fixWritten,
  FixLoopError,
  implicatedPaths,
  observations,
  runSuite,
} = await import("../src/fixloop.ts");

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
 * A repository with one committed source file, one authored test, and a suite
 * that fails the way a runner does.
 */
function makeRepo(): string {
  const root = join(makeTempDir(), "work");
  mkdirSync(join(root, "tests"), { recursive: true });
  writeFileSync(join(root, "app.py"), "def add(a, b):\n    return a - b\n", "utf8");
  writeFileSync(
    join(root, "runner.js"),
    `process.stdout.write(${JSON.stringify(RED)});\nprocess.exit(1);\n`,
    "utf8",
  );
  writeFileSync(join(root, ".gitignore"), ".dabbler/\n", "utf8");
  writeFileSync(join(root, "pytest.ini"), "[pytest]\n", "utf8");
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "test@example.invalid");
  git(root, "config", "user.name", "Test");
  git(root, "config", "commit.gpgsign", "false");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "seed");
  // The session's own work, uncommitted: the half of the envelope git
  // measures. `notes.md` is the unrelated file every real session has in
  // flight beside the code.
  writeFileSync(
    join(root, "tests", "test_add.py"),
    "from app import add\n\n\ndef test_adds():\n    assert add(2, 1) == 3\n",
    "utf8",
  );
  writeFileSync(join(root, "notes.md"), "scratch\n", "utf8");
  return root;
}

function envelopeOf(repo: string) {
  return buildEnvelope(repo, "HEAD", RED, SELECTION);
}

async function runFix(repo: string, body: string) {
  state.body = body;
  return fix(repo, config(), {
    failing: failures(RED, SELECTION),
    output: RED,
    envelope: envelopeOf(repo),
    transport: "copilot-cli",
  });
}

beforeEach(() => {
  state.body = "";
  state.provider = "anthropic";
  state.transport = "copilot-cli";
  state.simulated = false;
  state.calls = [];
});

describe("what the run said", () => {
  it("runs the suite whole against the tree with the authored tests", async () => {
    // Targeting it here would be a smaller claim wearing the same name: this
    // stage is the complete suite by definition.
    const repo = makeRepo();
    const runs = await runSuite(repo, config(), ["tests/test_add.py"]);
    expect(runs.map((r) => r.command)).toEqual([`${INTERPRETER} runner.js`]);
    expect(checkRunGreen(runs[0])).toBe(false);
  });

  it("refuses a suite run before any test was authored", async () => {
    // It would be the suite as it stood before the verifier read anything,
    // recorded as the run that included what it wrote.
    const repo = makeRepo();
    await expect(runSuite(repo, config(), [])).rejects.toThrow(
      /no authored test to include/,
    );
  });

  it("reads a failure as a declared test path beside a word meaning failed", () => {
    expect(failures(RED, SELECTION).map((f) => [f.name, f.path])).toEqual([
      ["tests/test_add.py::test_adds", "tests/test_add.py"],
    ]);
  });

  it("does not treat a test merely mentioned as a failure", () => {
    // Every line of a verbose run names a test. Without the marker the parser
    // would implicate the whole suite in one test's failure.
    expect(failures("tests/test_add.py::test_adds PASSED\n", SELECTION)).toEqual([]);
  });
});

describe("the envelope", () => {
  it("is the session diff plus the files the failures implicate", () => {
    const repo = makeRepo();
    const envelope = envelopeOf(repo);
    expect(envelope.sessionPaths).toContain("tests/test_add.py");
    expect(envelope.implicated).toContain("app.py");
    expect(envelopeAllows(envelope, "app.py")).toBe(true);
  });

  it("lets a traceback frame implicate the file it points at", () => {
    // Runners spell a position several ways, and a path several more --
    // relative, POSIX-absolute, drive-lettered. Recognising one of them would
    // leave the broken source file outside the envelope on an ordinary
    // failure.
    const repo = makeRepo();
    const posixAbs = repo.split("\\").join("/");
    for (const frame of [
      'File "app.py", line 4, in add',
      `File "${posixAbs}/app.py", line 4, in add`,
      `File "${join(repo, "app.py")}", line 4, in add`,
      `${posixAbs}/app.py:4: in add`,
    ]) {
      expect(implicatedPaths(repo, `${frame}\n`), frame).toEqual(["app.py"]);
    }
  });

  it("does not implicate a file the runner merely mentions", () => {
    // A runner prints its own configuration beside the failures. Taking that
    // as implicated would let a fix round reroute the run instead of
    // repairing the code.
    const repo = makeRepo();
    const envelope = envelopeOf(repo);
    expect(envelopePaths(envelope)).not.toContain("pytest.ini");
    expect(envelopeAllows(envelope, "pytest.ini")).toBe(false);
  });

  it("drops a path the output names that is not in the repository", () => {
    // A vendored frame in a traceback must not put site-packages in the
    // envelope.
    const repo = makeRepo();
    expect(
      implicatedPaths(repo, "/usr/lib/python3/site-packages/pytest/main.py:11: in run\n"),
    ).toEqual([]);
  });

  it("refuses a diff git cannot answer rather than reading it as empty", () => {
    // An empty envelope refuses every write and reads afterwards as a model
    // that proposed nothing.
    const repo = makeRepo();
    expect(() => buildEnvelope(repo, "0".repeat(40), RED, SELECTION)).toThrow(
      /unmeasurable session diff/,
    );
  });

  it("refuses a write outside the envelope before bytes are written", async () => {
    // The whole feature: rejected by the framework, not requested against by
    // the prompt.
    const repo = makeRepo();
    const [round] = await runFix(
      repo,
      "```fix-write path=runner.js\nprocess.exit(0);\n```\n",
    );
    expect(fixWritten(round)).toEqual([]);
    expect(fixRefused(round)).toEqual(["runner.js"]);
    expect(round.writes[0]?.reason).toContain("outside the envelope");
    expect(readText(join(repo, "runner.js"))).not.toContain("process.exit(0);\n");
  });

  it("lands a write inside the envelope", async () => {
    const repo = makeRepo();
    const [round] = await runFix(
      repo,
      "```fix-write path=app.py\ndef add(a, b):\n    return a + b\n```\n",
    );
    expect(fixWritten(round)).toEqual(["app.py"]);
    expect(readText(join(repo, "app.py")).endsWith("return a + b\n")).toBe(true);
  });

  it("does not honour a test-write block as a fix round's write", async () => {
    // Two rounds with different jobs get different labels, so a block lifted
    // out of the tests phase is not silently honoured here.
    const repo = makeRepo();
    const [round] = await runFix(
      repo,
      "```test-write path=tests/test_add.py\ndef test_adds():\n    assert True\n```\n",
    );
    expect(round.writes).toEqual([]);
    expect(readText(join(repo, "tests", "test_add.py"))).not.toContain("assert True");
  });
});

describe("the fix round", () => {
  it("is shown the failures, the output and the envelope", () => {
    const grant = grantForTransport("copilot-cli", {
      scope: ["app.py"],
      readBudget: 40,
      allowWrite: true,
      writeEnvelope: ["app.py"],
      writeLabel: WRITE_LABEL_FIX,
    });
    const prompt = buildPrompt(
      failures(RED, SELECTION),
      RED,
      [["app.py", "def add(a, b):\n    return a - b\n"]],
      { sessionPaths: [], implicated: ["app.py"] },
      grant,
    );
    expect(prompt).toContain("`tests/test_add.py::test_adds`");
    expect(prompt).toContain("```fix-write path=app.py");
    expect(prompt).toContain("No findings are wanted");
  });

  it("does not exclude the author from repairing its own code", async () => {
    // The exclusion that makes a review cross-vendor is exactly wrong here: a
    // second vendor would be answering for work it has not seen.
    const repo = makeRepo();
    await runFix(repo, "```fix-write path=app.py\nx = 1\n```\n");
    expect(state.calls[0]?.role).toBe("generator");
  });

  it("may read the implicated files and not the rest of the diff", async () => {
    // The write envelope is wider than the read surface on purpose: a fix may
    // need to land in a file the session already changed, and is still not
    // invited to look at one the failures do not implicate.
    const repo = makeRepo();
    const envelope = envelopeOf(repo);
    await runFix(repo, "nothing to write here\n");
    const content = state.calls[0]?.content ?? "";
    const scope = content.split("**Scope**")[1]?.split("**Budget**")[0] ?? "";
    expect(scope).toContain("app.py");
    expect(scope).not.toContain("notes.md");
    expect(envelopeAllows(envelope, "notes.md")).toBe(true);
  });

  it("refuses a round with no named failure", async () => {
    // A fix round with nothing to answer is a model invited to revise
    // whatever it notices.
    const repo = makeRepo();
    await expect(
      fix(repo, config(), { failing: [], output: "", envelope: envelopeOf(repo) }),
    ).rejects.toBeInstanceOf(FixLoopError);
  });

  it("records an unrelated observation and acts on nothing else", async () => {
    // Recorded because an erased finding leaves nothing anyone can overrule;
    // acted on by nobody because this round answers a failure.
    const repo = makeRepo();
    const [round] = await runFix(
      repo,
      "```fix-write path=app.py\ndef add(a, b):\n    return a + b\n```\n" +
        "\n## OBSERVATIONS\n\n" +
        "- `runner.js` swallows stderr.\n",
    );
    expect(round.observations).toEqual(["`runner.js` swallows stderr."]);
    expect(fixWritten(round)).toEqual(["app.py"]);
  });

  it("stops observations at the next heading", () => {
    const text = "## OBSERVATIONS\n\n- one\n\n## Something else\n\n- two\n";
    expect(observations(text)).toEqual(["one"]);
  });
});
