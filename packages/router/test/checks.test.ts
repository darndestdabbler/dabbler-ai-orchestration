// The declared-check grammar and the executor: how a declaration is refused,
// what a path prefix means, and what a spawned process is allowed to see.
//
// The grammar is a function of strings and is asserted from literals. The
// executor is not: what a child process inherits, what a timeout does to it
// and what a tree kill reaches are claims about real processes, so those
// tests spawn Node. The selector that decides WHICH checks run is
// selection.test.ts, beside the policy in preverify.test.ts.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  CheckConfigError,
  STAGE_TARGETED,
  coversAny,
  displayCommand,
  endLiveChildren,
  execute,
  fnmatchCase,
  loadChecks,
  makeCheck,
  matchingPrefixes,
  normaliseRel,
  resolveProgram,
  shlexSplit,
  spawnOptionsFor,
  spawnProgram,
  treeKillCommand,
} from "../src/checks.ts";
import { hiddenSpawn, snapshotWorktreeTree } from "../src/journal.ts";
import { makeAnsweredRepo, tempDir } from "./support/answers.ts";

const onWindows = process.platform === "win32";

/** The file's content once it exists, or a loud failure. */
async function waitForFile(path: string): Promise<string> {
  const deadline = Date.now() + 20_000;
  for (;;) {
    if (existsSync(path)) return readFileSync(path, "utf8");
    if (Date.now() > deadline) throw new Error(`${path} never appeared`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

/** Whether the pid is dead, allowing the OS a moment to finish the kill. */
async function gone(pid: number): Promise<boolean> {
  const deadline = Date.now() + 10_000;
  for (;;) {
    try {
      process.kill(pid, 0);
    } catch {
      return true;
    }
    if (Date.now() > deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

// --- The path grammar ---------------------------------------------------------

describe("what a declared prefix covers", () => {
  it("anchors at a path boundary rather than at a character", () => {
    assert.deepEqual(matchingPrefixes("a/tests/x.py", ["a/tests/"]), ["a/tests/"]);
    assert.deepEqual(matchingPrefixes("a/tests_helper.py", ["a/tests/"]), []);
  });

  it("keeps the leading dot of a dotfile prefix", () => {
    // A character-set strip of "./" would eat the dot of ".github/" and the
    // rule would silently stop covering CI.
    assert.deepEqual(matchingPrefixes(".github/workflows/ci.yml", [".github/"]), [".github/"]);
  });

  it("reads a whole-repository prefix as covering everything", () => {
    assert.deepEqual(matchingPrefixes("anything/at/all.py", [""]), [""]);
    assert.equal(normaliseRel("."), "");
  });

  it("reads a Windows separator as the same path", () => {
    assert.deepEqual(matchingPrefixes("a\\win\\path.py", ["a/win/"]), ["a/win/"]);
  });
});

describe("matching a test-file glob", () => {
  it("is case-sensitive on every platform", () => {
    // Selection is evidence, and evidence that depends on which filesystem
    // produced it proves nothing.
    assert.equal(fnmatchCase("test_a.py", "test_*.py"), true);
    assert.equal(fnmatchCase("TEST_A.PY", "test_*.py"), false);
  });

  it("reads a character class the way fnmatch does", () => {
    assert.equal(fnmatchCase("a1.ts", "a[0-9].ts"), true);
    assert.equal(fnmatchCase("ax.ts", "a[!0-9].ts"), true);
    assert.equal(fnmatchCase("a1.ts", "a[!0-9].ts"), false);
  });
});

describe("splitting a declared command string", () => {
  it("keeps a quoted argument whole", () => {
    assert.deepEqual(shlexSplit('run --root "a b" x'), ["run", "--root", "a b", "x"]);
    assert.deepEqual(shlexSplit("a\\ b"), ["a b"]);
  });

  it("refuses an unterminated quote rather than guessing where it ends", () => {
    // The one caller falls back to a whitespace split -- a silent rewrite of
    // the command would run something the record does not name.
    assert.throws(() => shlexSplit('run "unterminated'));
  });
});

// --- Declarations -------------------------------------------------------------

describe("refusing a broken check declaration at load", () => {
  const suite = { name: "unit", command: "x", covers: [] };
  const declare = (control: Record<string, unknown>): unknown => ({
    testing: { suites: [suite], controls: [control] },
  });

  it("refuses a control that declares no way to run, or two", () => {
    // Refused at load, with the declaration's own error type: a check nobody
    // can run and a check nobody declared must never look the same.
    assert.throws(
      () => loadChecks(declare({ name: "a", kind: "lint", covers: [] })),
      CheckConfigError,
    );
    assert.throws(() => loadChecks(declare({ name: "a", kind: "lint", covers: [] })), /neither/);
    assert.throws(
      () => loadChecks(declare({ name: "a", kind: "lint", command: "x", argv: ["y"], covers: [] })),
      /both/,
    );
  });

  it("refuses a kind outside the closed set, and a name a suite already has", () => {
    assert.throws(
      () => loadChecks(declare({ name: "a", kind: "nope", argv: ["y"], covers: [] })),
      /kind/,
    );
    assert.throws(
      () => loadChecks(declare({ name: "unit", kind: "lint", argv: ["y"], covers: [] })),
      /twice/,
    );
  });

  it("refuses a glob in covers, which is a prefix rule wearing a wildcard", () => {
    assert.throws(
      () =>
        loadChecks({
          testing: { suites: [{ name: "unit", command: "x", covers: ["src/**/*.py"] }] },
        }),
      /glob/,
    );
  });

  it("refuses an unknown key rather than dropping it", () => {
    // A silently dropped `expensive: true` is a suite the freshness gate
    // stops asking about.
    assert.throws(
      () =>
        loadChecks({
          testing: { suites: [{ name: "unit", command: "x", covers: [], expencive: true }] },
        }),
      /unknown key/,
    );
  });

  it("reads a suite as always required and a control as required by default", () => {
    const checks = loadChecks({
      testing: {
        suites: [{ name: "unit", command: "pytest", covers: ["src/"] }],
        controls: [
          { name: "lint", kind: "lint", argv: ["ruff"], covers: ["src/"] },
          { name: "types", kind: "typecheck", argv: ["mypy"], required: false, covers: [] },
        ],
      },
    });
    assert.deepEqual(
      checks.map((check) => check.required),
      [true, true, false],
    );
    assert.equal(displayCommand(checks[1]!), "ruff");
  });
});

describe("which changed paths a check covers", () => {
  it("reads a trailing slash as a prefix and everything else as an exact file", () => {
    const check = makeCheck({ name: "unit", covers: ["src/", "pytest.ini"] });
    assert.equal(coversAny(check, ["src/deep/a.py"]), true);
    assert.equal(coversAny(check, ["pytest.ini"]), true);
    assert.equal(coversAny(check, ["source/a.py"]), false);
    // An exact entry is not a prefix: `pytest.ini.bak` is a different file.
    assert.equal(coversAny(check, ["pytest.ini.bak"]), false);
  });
});

// --- Execution ----------------------------------------------------------------

/** A directory answering as a repository with one tracked file, which is all the executor needs. */
function seededRepo(): string {
  return makeAnsweredRepo({ "a.txt": "one\n" }).repo;
}

function options(repo: string): { stage: string; treeDigest: string; timeoutSeconds: number } {
  return {
    stage: STAGE_TARGETED,
    treeDigest: snapshotWorktreeTree(repo) as string,
    timeoutSeconds: 60,
  };
}

/** A script the check can run through either spawn branch. */
function withScript(repo: string, body: string): string {
  const path = join(repo, "probe.cjs");
  writeFileSync(path, body, "utf8");
  return path;
}

describe("running a declared check", () => {
  it("hands the child an allowlist, never the environment it was launched with", async () => {
    // The sentinel: a check command is repository configuration running on
    // the operator's machine, and it must not be handed the operator's keys.
    // Both spawn branches build the environment; neither inherits one.
    const repo = seededRepo();
    const script = withScript(
      repo,
      "require('fs').writeFileSync(process.argv[2], JSON.stringify(process.env));\n",
    );
    const parentTemp = join(repo, "parent-temp");
    mkdirSync(parentTemp, { recursive: true });
    const planted = {
      DABBLER_ANTHROPIC_API_KEY: "sk-planted-sentinel",
      GITHUB_TOKEN: "ghp-planted-sentinel",
      HTTPS_PROXY: "http://user:pw@proxy.invalid:8080",
      _JAVA_OPTIONS: "-javaagent:/tmp/evil.jar",
      TEMP: parentTemp,
    };
    Object.assign(process.env, planted);
    try {
      for (const shell of [false, true]) {
        const out = join(repo, `env-${String(shell)}.json`);
        const argv = [process.execPath, script, out];
        const check = makeCheck({
          name: "env-probe",
          command: shell ? argv.map((token) => `"${token}"`).join(" ") : "",
          argv: shell ? [] : argv,
        });
        const run = await execute(repo, check, displayCommand(check), options(repo));
        assert.equal(run.exitCode, 0, run.output);
        const child = JSON.parse(readFileSync(out, "utf8")) as Record<string, string>;
        assert.ok(!JSON.stringify(child).includes("planted-sentinel"));
        for (const name of Object.keys(planted)) {
          if (name === "TEMP") continue;
          assert.ok(!Object.hasOwn(child, name), name);
        }
        // TEMP is redirected to a scratch directory of the check's own, not
        // passed through, so a check reads neither the parent's temp
        // contents nor leaves anything there for the next one.
        assert.notEqual(child["TEMP"], planted.TEMP);
        assert.match(String(child["TEMP"]), /dabbler-check-/);
        assert.equal(child["TMP"], child["TEMP"]);
        // It is an allowlist, not a scrub: the toolchain still finds itself.
        assert.ok(child["PATH"]);
      }
    } finally {
      for (const name of Object.keys(planted)) delete process.env[name];
    }
  });

  it("fails a check that changed the tree it was measuring", async () => {
    const repo = seededRepo();
    const script = withScript(repo, "require('fs').writeFileSync(process.argv[2], 'mutated\\n');\n");
    const check = makeCheck({
      name: "mutator",
      argv: [process.execPath, script, join(repo, "a.txt")],
    });
    const run = await execute(repo, check, displayCommand(check), options(repo));
    assert.equal(run.exitCode, 0);
    assert.equal(run.treeMutated, true);
    assert.equal(run.outcome, "failed");
  });

  it("kills a check that outruns its timeout and records no exit code", async () => {
    const repo = seededRepo();
    const script = withScript(repo, "setTimeout(() => {}, 60000);\n");
    const check = makeCheck({ name: "sleeper", argv: [process.execPath, script] });
    const run = await execute(repo, check, displayCommand(check), {
      ...options(repo),
      timeoutSeconds: 1,
    });
    assert.equal(run.timedOut, true);
    assert.equal(run.exitCode, null);
    assert.equal(run.outcome, "failed");
  });

  it("names an over-long command line rather than reporting it as unknown", async () => {
    // Measured, not guessed: Node answers ENAMETOOLONG here (libuv's mapping
    // of ERROR_FILENAME_EXCED_RANGE), and POSIX answers E2BIG. The failure
    // spent a year wearing the generic-unknown mask.
    const repo = seededRepo();
    const check = makeCheck({
      name: "oversized",
      argv: [process.execPath, "-e", "0", "x".repeat(200000)],
    });
    const run = await execute(repo, check, displayCommand(check), options(repo));
    assert.equal(run.outcome, "failed");
    assert.match(run.output, /argv-too-large/);
  });

  it("collects what the child wrote to both of its streams", async () => {
    const repo = seededRepo();
    const script = withScript(
      repo,
      "process.stdout.write('out\\n'); process.stderr.write('err\\n');\n",
    );
    const check = makeCheck({ name: "talker", argv: [process.execPath, script] });
    const run = await execute(repo, check, displayCommand(check), options(repo));
    assert.match(run.output, /out/);
    assert.match(run.output, /err/);
    assert.equal(run.outcome, "passed");
  });
});

// --- Which program a name means -----------------------------------------------

describe("finding the program a name means", () => {
  // Windows only: everywhere else the name IS the program and there is
  // nothing to resolve.

  /** A PATH of two directories, and what each holds. */
  function pathWith(first: string[], second: string[]): [string, string] {
    const root = tempDir("path-");
    const one = join(root, "one");
    const two = join(root, "two");
    for (const [directory, names] of [
      [one, first],
      [two, second],
    ] as const) {
      mkdirSync(directory, { recursive: true });
      for (const name of names) writeFileSync(join(directory, name), "", "utf8");
    }
    return [one, two];
  }

  function withPath<T>(directories: string[], body: () => T): T {
    const previous = process.env["PATH"];
    const previousExt = process.env["PATHEXT"];
    process.env["PATH"] = directories.join(";");
    process.env["PATHEXT"] = ".COM;.EXE;.BAT;.CMD";
    try {
      return body();
    } finally {
      if (previous === undefined) delete process.env["PATH"];
      else process.env["PATH"] = previous;
      if (previousExt === undefined) delete process.env["PATHEXT"];
      else process.env["PATHEXT"] = previousExt;
    }
  }

  it("prefers an executable to a shim ahead of it on PATH", { skip: !onWindows }, () => {
    // Not cmd's rule -- cmd takes the first hit in the first directory -- but
    // neither caller is a shell. Both spawn without one, and that is
    // `CreateProcess`, which appends `.exe` and never considers `.cmd`.
    //
    // The cost of getting it wrong is not cosmetic: a shim has to be
    // interpreted by `cmd.exe`, whose command line stops at 8,191 characters
    // where `CreateProcess` allows 32,767 -- and the seat transport only
    // switches to its temp-file handoff at 24,000, so everything between
    // those two numbers would fail before the CLI ran.
    const [one, two] = pathWith(["tool.cmd"], ["tool.exe"]);
    withPath([one, two], () => {
      const resolved = resolveProgram("tool");
      assert.equal(resolved.path, join(two, "tool.EXE"));
      assert.equal(resolved.isBatch, false);
    });
  });

  it("falls back to the shim when that is all there is", { skip: !onWindows }, () => {
    // Then `cmd.exe` is what can run it: `CreateProcess` special-cases a
    // batch file by launching `cmd /c` around it.
    const [one] = pathWith(["tool.cmd"], []);
    withPath([one], () => {
      const resolved = resolveProgram("tool");
      assert.equal(resolved.path, join(one, "tool.CMD"));
      assert.equal(resolved.isBatch, true);
    });
  });

  it("reaches a shim whose path holds a space", { skip: !onWindows }, async () => {
    // `npm` ships as `C:\Program Files\nodejs\npm.cmd`, so this is the
    // ordinary case. Quoting the path alone is not enough: `cmd /s` strips
    // the outer quote pair of the whole line, which takes the ones around
    // the path with it and cuts the program at the space.
    const directory = join(tempDir("path-"), "Program Files");
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "tool.cmd"), "@echo reached %1\r\n", "utf8");
    const child = withPath([directory], () =>
      spawnProgram(["tool", "an argument"], { stdio: ["ignore", "pipe", "pipe"] }),
    );
    let seen = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      seen += chunk.toString();
    });
    const code = await new Promise<number | null>((resolve) => child.on("close", resolve));
    assert.equal(code, 0);
    assert.match(seen, /reached/);
  });
});

describe("what a session started, a session ends", () => {
  it("ends every child it started that is still running, tree and all", async () => {
    // The trees left on the operator's machine were never the direct child
    // -- they were what the suite command, the engine or the seat had forked
    // under it, so ending the registry's children must reach the grandchild.
    const pidFile = join(tempDir("children-"), "grandchild.pid");
    const child = spawnProgram(
      [
        process.execPath,
        "-e",
        "const { spawn } = require('node:child_process');" +
          "const g = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });" +
          "require('node:fs').writeFileSync(process.argv[1], String(g.pid));" +
          "setInterval(() => {}, 1000);",
        pidFile,
      ],
      { stdio: "ignore" },
    );
    const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
    const grandchild = Number(await waitForFile(pidFile));

    assert.ok(endLiveChildren() >= 1);
    await closed;
    assert.equal(await gone(grandchild), true);
    // Idempotent: the registry forgot them, and nothing is ended twice --
    // the OS reuses pids.
    assert.equal(endLiveChildren(), 0);
  });

  it("hides the console window of the tree kill itself", () => {
    // The last visible window: `taskkill` is a console program, and the
    // engine's interrupt fallback reaches it often enough that a session
    // driven from the extension host flashed it in front of the operator
    // every time an invocation was ended.
    const kill = treeKillCommand(4242);
    assert.deepEqual(kill.argv, ["taskkill", "/F", "/T", "/PID", "4242"]);
    assert.equal(kill.options.windowsHide, true);
  });

  it("hides the console window on every path a check is reached by", () => {
    // The extension host has no console of its own, so a console child gets
    // a window -- and Windows gives it the foreground, which took the
    // operator's caret out of whatever they were typing every time a
    // declared check ran.
    for (const mode of ["shell", "argv"] as const) {
      assert.equal(spawnOptionsFor({ cwd: "." }, mode).windowsHide, true);
    }
    // One answer, in one place: `spawnOptionsFor` composes `hiddenSpawn`
    // rather than restating it, so the checks path and the four `spawnSync`
    // sites -- git above all -- cannot drift into disagreeing.
    assert.equal(hiddenSpawn({ cwd: "." }).windowsHide, true);
    assert.equal(hiddenSpawn({ cwd: "." }).cwd, ".");
    // And the one thing the two modes disagree about is still theirs: an
    // argv never gets a shell, because which branch runs is
    // `resolveProgram`'s to decide.
    assert.equal(spawnOptionsFor({}, "shell").shell, true);
    assert.equal(spawnOptionsFor({}, "argv").shell, false);
  });
});
