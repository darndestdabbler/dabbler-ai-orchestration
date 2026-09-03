// The fix loop a red suite opens: the envelope is the feature, and it is a
// boundary rather than a request. Files in a temp directory; the model is
// the scripted router; the suite run and the git-measured envelope are
// walked in walk-verify.test.ts.
import assert from "node:assert/strict";
import { symlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";

import { WRITE_LABEL_FIX, grantForTransport } from "../src/agency.ts";
import type { SelectionConfig } from "../src/checks.ts";
import {
  FixLoopError,
  buildPrompt,
  envelopeAllows,
  envelopePaths,
  failures,
  fix,
  fixRefused,
  fixWritten,
  implicatedPaths,
  observations,
} from "../src/fixloop.ts";
import { readText } from "../src/textfile.ts";
import { routeAnswers, seed, tempDir, type RoutedCall } from "./support/answers.ts";

const SELECTION: SelectionConfig = { scopes: [{ suite: "python", roots: ["tests"], glob: "test_*.py" }], smoke: [], repoWide: [], rules: [] };

const RED =
  "rootdir: /work\nconfigfile: pytest.ini\n============ FAILURES ============\n" +
  "app.py:4: in add\n    return a - b\nE   assert 3 == 1\nFAILED tests/test_add.py::test_adds - assert 3 == 1\n";

const CONFIG = {
  run_policy: { check_timeout_seconds: 60 },
  testing: { suites: [{ name: "unit", command: "node runner.js", covers: ["app.py", "tests/"], test_roots: ["tests"], test_glob: "test_*.py" }] },
};

function makeRepo(): string {
  const root = join(tempDir(), "work");
  seed(root, {
    "app.py": "def add(a, b):\n    return a - b\n",
    "runner.js": "process.exit(1);\n",
    "pytest.ini": "[pytest]\n",
    "tests/test_add.py": "from app import add\n\n\ndef test_adds():\n    assert add(2, 1) == 3\n",
    "notes.md": "scratch\n",
  });
  return root;
}

const envelope = { sessionPaths: ["tests/test_add.py", "notes.md"], implicated: ["app.py"] };

async function runFix(repo: string, body: string, calls: RoutedCall[] = []) {
  const restore = routeAnswers([["anthropic", body]], { calls, transport: "copilot-cli" });
  try {
    return await fix(repo, CONFIG, { failing: failures(RED, SELECTION), output: RED, envelope, transport: "copilot-cli" });
  } finally {
    restore();
  }
}

describe("what the run said", () => {
  it("reads a failure as a declared test path beside a word meaning failed, and not a test merely mentioned", () => {
    assert.deepEqual(failures(RED, SELECTION).map((f) => [f.name, f.path]), [["tests/test_add.py::test_adds", "tests/test_add.py"]]);
    assert.deepEqual(failures("tests/test_add.py::test_adds PASSED\n", SELECTION), []);
  });
});

describe("the envelope", () => {
  it("lets a traceback frame implicate the file it points at, however the runner spells the path", () => {
    const repo = makeRepo();
    const posixAbs = repo.split("\\").join("/");
    for (const frame of ['File "app.py", line 4, in add', `File "${posixAbs}/app.py", line 4, in add`, `File "${join(repo, "app.py")}", line 4, in add`, `${posixAbs}/app.py:4: in add`]) {
      assert.deepEqual(implicatedPaths(repo, `${frame}\n`), ["app.py"], frame);
    }
  });

  it("implicates a file whose path carries a tilde, as every short name does", () => {
    // `C:\Users\RUNNER~1\...` is what Windows hands a process whose temp
    // path has an 8.3 short form -- every CI runner and no developer's machine.
    const repo = makeRepo();
    const alias = join(dirname(repo), "SHORT~1");
    symlinkSync(repo, alias, process.platform === "win32" ? "junction" : "dir");
    const aliasPosix = alias.split("\\").join("/");
    assert.deepEqual(implicatedPaths(repo, `File "${aliasPosix}/app.py", line 4, in add\n`), ["app.py"]);
    assert.deepEqual(implicatedPaths(repo, `${aliasPosix}/app.py:4: in add\n`), ["app.py"]);
  });

  it("does not implicate a file the runner merely mentions, nor one outside the repository", () => {
    const repo = makeRepo();
    assert.ok(!envelopePaths(envelope).includes("pytest.ini"));
    assert.equal(envelopeAllows(envelope, "pytest.ini"), false);
    assert.equal(envelopeAllows(envelope, "app.py"), true);
    assert.deepEqual(implicatedPaths(repo, "/usr/lib/python3/site-packages/pytest/main.py:11: in run\n"), []);
  });

  it("refuses a write outside the envelope before bytes are written, lands one inside, and ignores a block under another round's label", async () => {
    const repo = makeRepo();
    const [outside] = await runFix(repo, "```fix-write path=runner.js\nprocess.exit(0);\n```\n");
    assert.deepEqual(fixWritten(outside), []);
    assert.deepEqual(fixRefused(outside), ["runner.js"]);
    assert.match(String(outside.writes[0]?.reason), /outside the envelope/);
    assert.ok(!readText(join(repo, "runner.js")).includes("process.exit(0);\n"));
    const [inside] = await runFix(repo, "```fix-write path=app.py\ndef add(a, b):\n    return a + b\n```\n");
    assert.deepEqual(fixWritten(inside), ["app.py"]);
    assert.ok(readText(join(repo, "app.py")).endsWith("return a + b\n"));
    const [ignored] = await runFix(repo, "```test-write path=tests/test_add.py\ndef test_adds():\n    assert True\n```\n");
    assert.deepEqual(ignored.writes, []);
  });
});

describe("the fix round", () => {
  it("is shown the failures, the output and the envelope, and asks for no findings", () => {
    const grant = grantForTransport("copilot-cli", { scope: ["app.py"], readBudget: 40, allowWrite: true, writeEnvelope: ["app.py"], writeLabel: WRITE_LABEL_FIX });
    const prompt = buildPrompt(failures(RED, SELECTION), RED, [["app.py", "def add(a, b):\n    return a - b\n"]], { sessionPaths: [], implicated: ["app.py"] }, grant);
    assert.ok(prompt.includes("`tests/test_add.py::test_adds`") && prompt.includes("```fix-write path=app.py") && prompt.includes("No findings are wanted"));
  });

  it("does not exclude the author from repairing its own code, and lets it read the implicated files and not the rest of the diff", async () => {
    const calls: RoutedCall[] = [];
    await runFix(makeRepo(), "nothing to write here\n", calls);
    assert.equal(calls[0]?.role, "generator");
    assert.deepEqual(calls[0]?.exclude, []);
    const scope = calls[0]?.content.split("**Scope**")[1]?.split("**Budget**")[0] ?? "";
    assert.ok(scope.includes("app.py") && !scope.includes("notes.md"));
    assert.equal(envelopeAllows(envelope, "notes.md"), true);
  });

  it("refuses a round with no named failure", async () => {
    await assert.rejects(fix(makeRepo(), CONFIG, { failing: [], output: "", envelope }), FixLoopError);
  });

  it("records an unrelated observation and acts on nothing else, stopping at the next heading", async () => {
    const [round] = await runFix(makeRepo(), "```fix-write path=app.py\ndef add(a, b):\n    return a + b\n```\n\n## OBSERVATIONS\n\n- `runner.js` swallows stderr.\n");
    assert.deepEqual(round.observations, ["`runner.js` swallows stderr."]);
    assert.deepEqual(fixWritten(round), ["app.py"]);
    assert.deepEqual(observations("## OBSERVATIONS\n\n- one\n\n## Something else\n\n- two\n"), ["one"]);
  });
});
