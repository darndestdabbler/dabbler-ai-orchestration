// The declared-check grammar and the executor.
//
// Ported from `test_runcore_checks.py`, which drives `checks` rather than
// the run core it is named for -- the run core is retired and never ported
// (D130), so the half of that file which drove it has no subject here. What
// survives is what `checks` itself answers: how a declaration is refused,
// what a path prefix means, and what a spawned process is allowed to see.
//
// The selector's own behaviour lives in `preverify.test.ts`, beside the
// policy that reads it.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

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
import { makeSeededRepo, makeTempDir, removeTempDirs } from "./support/fixtures.ts";

afterAll(removeTempDirs);

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

// --- The path grammar ------------------------------------------------------------

describe("what a declared prefix covers", () => {
  it("anchors at a path boundary rather than at a character", () => {
    expect(matchingPrefixes("a/tests/x.py", ["a/tests/"])).toEqual(["a/tests/"]);
    expect(matchingPrefixes("a/tests_helper.py", ["a/tests/"])).toEqual([]);
  });

  it("keeps the leading dot of a dotfile prefix", () => {
    // A character-set strip of "./" would eat the dot of ".github/" and the
    // rule would silently stop covering CI.
    expect(matchingPrefixes(".github/workflows/ci.yml", [".github/"])).toEqual([
      ".github/",
    ]);
  });

  it("reads a whole-repository prefix as covering everything", () => {
    expect(matchingPrefixes("anything/at/all.py", [""])).toEqual([""]);
    expect(normaliseRel(".")).toBe("");
  });

  it("reads a Windows separator as the same path", () => {
    expect(matchingPrefixes("a\\win\\path.py", ["a/win/"])).toEqual(["a/win/"]);
  });
});

describe("matching a test-file glob", () => {
  it("is case-sensitive on every platform", () => {
    // Selection is evidence, and evidence that depends on which filesystem
    // produced it proves nothing.
    expect(fnmatchCase("test_a.py", "test_*.py")).toBe(true);
    expect(fnmatchCase("TEST_A.PY", "test_*.py")).toBe(false);
  });

  it("reads a character class the way fnmatch does", () => {
    expect(fnmatchCase("a1.ts", "a[0-9].ts")).toBe(true);
    expect(fnmatchCase("ax.ts", "a[!0-9].ts")).toBe(true);
    expect(fnmatchCase("a1.ts", "a[!0-9].ts")).toBe(false);
  });
});

describe("splitting a declared command string", () => {
  it("keeps a quoted argument whole", () => {
    expect(shlexSplit('run --root "a b" x')).toEqual(["run", "--root", "a b", "x"]);
    expect(shlexSplit("a\\ b")).toEqual(["a b"]);
  });

  it("refuses an unterminated quote rather than guessing where it ends", () => {
    // Python raises here too, and the one caller falls back to a whitespace
    // split -- a silent rewrite of the command would run something the
    // record does not name.
    expect(() => shlexSplit('run "unterminated')).toThrow();
  });
});

// --- Declarations -------------------------------------------------------------------

describe("refusing a broken check declaration at load", () => {
  const suite = { name: "unit", command: "x", covers: [] };
  const declare = (control: Record<string, unknown>): unknown => ({
    testing: { suites: [suite], controls: [control] },
  });

  it("refuses a control that declares no way to run", () => {
    // Refused at load, with the declaration's own error type: a check nobody
    // can run and a check nobody declared must never look the same.
    const broken = (): unknown => loadChecks(declare({ name: "a", kind: "lint", covers: [] }));
    expect(broken).toThrow(CheckConfigError);
    expect(broken).toThrow(/neither/);
  });

  it("refuses a control that declares two ways to run", () => {
    expect(() =>
      loadChecks(declare({ name: "a", kind: "lint", command: "x", argv: ["y"], covers: [] })),
    ).toThrow(/both/);
  });

  it("refuses a kind outside the closed set", () => {
    expect(() =>
      loadChecks(declare({ name: "a", kind: "nope", argv: ["y"], covers: [] })),
    ).toThrow(/kind/);
  });

  it("refuses a name already taken by a suite", () => {
    expect(() =>
      loadChecks(declare({ name: "unit", kind: "lint", argv: ["y"], covers: [] })),
    ).toThrow(/twice/);
  });

  it("refuses a glob in covers, which is a prefix rule wearing a wildcard", () => {
    expect(() =>
      loadChecks({
        testing: { suites: [{ name: "unit", command: "x", covers: ["src/**/*.py"] }] },
      }),
    ).toThrow(/glob/);
  });

  it("refuses an unknown key rather than dropping it", () => {
    // A silently dropped `expensive: true` is a suite the freshness gate
    // stops asking about.
    expect(() =>
      loadChecks({
        testing: { suites: [{ name: "unit", command: "x", covers: [], expencive: true }] },
      }),
    ).toThrow(/unknown key/);
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
    expect(checks.map((check) => check.required)).toEqual([true, true, false]);
    expect(displayCommand(checks[1]!)).toBe("ruff");
  });
});

describe("which changed paths a check covers", () => {
  it("reads a trailing slash as a prefix and everything else as an exact file", () => {
    const check = makeCheck({ name: "unit", covers: ["src/", "pytest.ini"] });
    expect(coversAny(check, ["src/deep/a.py"])).toBe(true);
    expect(coversAny(check, ["pytest.ini"])).toBe(true);
    expect(coversAny(check, ["source/a.py"])).toBe(false);
    // An exact entry is not a prefix: `pytest.ini.bak` is a different file.
    expect(coversAny(check, ["pytest.ini.bak"])).toBe(false);
  });
});

// --- Execution ----------------------------------------------------------------------

describe("running a declared check", () => {
  /** A script the check can run through either spawn branch. */
  function withScript(repo: string, body: string): string {
    const path = join(repo, "probe.cjs");
    writeFileSync(path, body, "utf8");
    return path;
  }

  const options = (repo: string): {
    stage: string;
    treeDigest: string;
    timeoutSeconds: number;
  } => ({
    stage: STAGE_TARGETED,
    treeDigest: snapshotWorktreeTree(repo) as string,
    timeoutSeconds: 60,
  });

  it("hands the child an allowlist, never the environment it was launched with", async () => {
    // The sentinel: a check command is repository configuration running on
    // the operator's machine, and it must not be handed the operator's keys.
    // Both spawn branches build the environment; neither inherits one.
    const repo = makeSeededRepo();
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
        expect(run.exitCode, run.output).toBe(0);
        const child = JSON.parse(readFileSync(out, "utf8")) as Record<string, string>;
        expect(JSON.stringify(child)).not.toContain("planted-sentinel");
        for (const name of Object.keys(planted)) {
          if (name === "TEMP") continue;
          expect(child).not.toHaveProperty(name);
        }
        // TEMP is redirected to a scratch directory of the check's own, not
        // passed through, so a check reads neither the parent's temp
        // contents nor leaves anything there for the next one.
        expect(child["TEMP"]).not.toBe(planted.TEMP);
        expect(child["TEMP"]).toContain("dabbler-check-");
        expect(child["TMP"]).toBe(child["TEMP"]);
        // It is an allowlist, not a scrub: the toolchain still finds itself.
        expect(child["PATH"]).toBeTruthy();
      }
    } finally {
      for (const name of Object.keys(planted)) delete process.env[name];
    }
    // Vitest's default 5 s, against a body that seeds a git repository and
    // then spawns Node TWICE -- once per spawn branch, because both build
    // the environment and both must be checked. It runs in ~1.3 s alone and
    // has timed out under full-suite parallel load on Windows, which made
    // the whole suite flaky for a reason that is arithmetic rather than a
    // defect. The budget is raised here, on the one test that earns it,
    // rather than globally where it would hide a genuine hang.
  }, 30_000);

  it("fails a check that changed the tree it was measuring", async () => {
    const repo = makeSeededRepo();
    const script = withScript(
      repo,
      "require('fs').writeFileSync(process.argv[2], 'mutated\\n');\n",
    );
    const check = makeCheck({
      name: "mutator",
      argv: [process.execPath, script, join(repo, "a.txt")],
    });
    const run = await execute(repo, check, displayCommand(check), options(repo));
    expect(run.exitCode).toBe(0);
    expect(run.treeMutated).toBe(true);
    expect(run.outcome).toBe("failed");
  });

  it("kills a check that outruns its timeout and records no exit code", async () => {
    const repo = makeSeededRepo();
    const script = withScript(repo, "setTimeout(() => {}, 60000);\n");
    const check = makeCheck({ name: "sleeper", argv: [process.execPath, script] });
    const run = await execute(repo, check, displayCommand(check), {
      ...options(repo),
      timeoutSeconds: 1,
    });
    expect(run.timedOut).toBe(true);
    expect(run.exitCode).toBeNull();
    expect(run.outcome).toBe("failed");
  });

  it("names an over-long command line rather than reporting it as unknown", async () => {
    // Measured, not guessed: Node answers ENAMETOOLONG here (libuv's mapping
    // of ERROR_FILENAME_EXCED_RANGE), and POSIX answers E2BIG -- the same OS
    // errors the Python transport classifier reads. The failure spent a year
    // wearing the generic-unknown mask.
    const repo = makeSeededRepo();
    const check = makeCheck({
      name: "oversized",
      argv: [process.execPath, "-e", "0", "x".repeat(200000)],
    });
    const run = await execute(repo, check, displayCommand(check), options(repo));
    expect(run.outcome).toBe("failed");
    expect(run.output).toContain("argv-too-large");
  });

  it("collects what the child wrote to both of its streams", async () => {
    const repo = makeSeededRepo();
    const script = withScript(
      repo,
      "process.stdout.write('out\\n'); process.stderr.write('err\\n');\n",
    );
    const check = makeCheck({ name: "talker", argv: [process.execPath, script] });
    const run = await execute(repo, check, displayCommand(check), options(repo));
    expect(run.output).toContain("out");
    expect(run.output).toContain("err");
    expect(run.outcome).toBe("passed");
  });
});

describe("a repository the executor never touches", () => {
  it("leaves the real index alone across a run", async () => {
    const repo = makeSeededRepo();
    writeFileSync(join(repo, "untracked.txt"), "x\n", "utf8");
    const check = makeCheck({ name: "noop", argv: [process.execPath, "-e", "0"] });
    await execute(repo, check, displayCommand(check), {
      stage: STAGE_TARGETED,
      treeDigest: snapshotWorktreeTree(repo) as string,
      timeoutSeconds: 60,
    });
    const status = execFileSync("git", ["status", "--porcelain"], {
      cwd: repo,
      encoding: "utf8",
    });
    expect(status).toContain("?? untracked.txt");
  });
});

describe("finding the program a name means", () => {
  // Windows only: everywhere else the name IS the program and there is
  // nothing to resolve.
  const onWindows = process.platform === "win32";

  /** A PATH of two directories, and what each holds. */
  function pathWith(first: string[], second: string[]): [string, string] {
    const root = makeTempDir();
    const one = join(root, "one");
    const two = join(root, "two");
    for (const [directory, names] of [[one, first], [two, second]] as const) {
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

  it.runIf(onWindows)("prefers an executable to a shim ahead of it on PATH", () => {
    // Not cmd's rule -- cmd takes the first hit in the first directory -- but
    // neither caller is a shell. Both spawn without one, and that is
    // `CreateProcess`, which appends `.exe` and never considers `.cmd`. It is
    // also what Python's `subprocess` reaches from the same PATH, so this is
    // what stops the two routers running different programs.
    //
    // The cost of getting it wrong is not cosmetic: a shim has to be
    // interpreted by `cmd.exe`, whose command line stops at 8,191 characters
    // where `CreateProcess` allows 32,767 -- and the seat transport only
    // switches to its temp-file handoff at 24,000, so everything between
    // those two numbers would fail before the CLI ran.
    const [one, two] = pathWith(["tool.cmd"], ["tool.exe"]);
    withPath([one, two], () => {
      const resolved = resolveProgram("tool");
      expect(resolved.path).toBe(join(two, "tool.EXE"));
      expect(resolved.isBatch).toBe(false);
    });
  });

  it.runIf(onWindows)("falls back to the shim when that is all there is", () => {
    // Then `cmd.exe` is what can run it, and Python pays the same
    // interpretation for the same file -- `CreateProcess` special-cases a
    // batch file by launching `cmd /c` around it.
    const [one, two] = pathWith(["tool.cmd"], []);
    withPath([one, two], () => {
      const resolved = resolveProgram("tool");
      expect(resolved.path).toBe(join(one, "tool.CMD"));
      expect(resolved.isBatch).toBe(true);
    });
  });

  it.runIf(onWindows)("reaches a shim whose path holds a space", async () => {
    // `npm` ships as `C:\Program Files\nodejs\npm.cmd`, so this is the
    // ordinary case and not an exotic one. Quoting the path alone is not
    // enough: `cmd /s` strips the outer quote pair of the whole line, which
    // takes the ones around the path with it and cuts the program at the
    // space.
    const directory = join(makeTempDir(), "Program Files");
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
    expect(code).toBe(0);
    expect(seen).toContain("reached");
  });

  it("ends every child it started that is still running, tree and all", async () => {
    // What a session starts, a session ends. The child forks a grandchild
    // and reports its pid, then both idle forever; ending the registry's
    // children must reach the grandchild too, because the trees left on the
    // operator's machine were never the direct child -- they were what the
    // suite command, the engine or the seat had forked under it.
    const pidFile = join(makeTempDir(), "grandchild.pid");
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

    expect(endLiveChildren()).toBeGreaterThanOrEqual(1);

    await closed;
    expect(await gone(grandchild)).toBe(true);
    // Idempotent: the registry forgot them, and nothing is ended twice --
    // the OS reuses pids.
    expect(endLiveChildren()).toBe(0);
  });

  it("hides the console window of the tree kill itself", () => {
    // The last visible window: `taskkill` is a console program, and the
    // engine's interrupt fallback reaches it often enough that a session
    // driven from the extension host flashed it in front of the operator
    // every time an invocation was ended.
    const kill = treeKillCommand(4242);
    expect(kill.argv).toEqual(["taskkill", "/F", "/T", "/PID", "4242"]);
    expect(kill.options.windowsHide).toBe(true);
  });

  it("hides the console window on every path a check is reached by", () => {
    // The extension host has no console of its own, so a console child gets
    // a window -- and Windows gives it the foreground, which took the
    // operator's caret out of whatever they were typing every time a
    // declared check ran. Both modes, because a repository declares its
    // suite either way: `command` is a shell string, `argv` is the batch
    // shim and the plain executable alike, and the shim is the one that
    // reaches `cmd.exe` and would otherwise be the loudest.
    for (const mode of ["shell", "argv"] as const) {
      expect(spawnOptionsFor({ cwd: "." }, mode).windowsHide).toBe(true);
    }
    // One answer, in one place. `spawnOptionsFor` composes `hiddenSpawn`
    // rather than restating it, so the checks path and the four `spawnSync`
    // sites -- git above all -- cannot drift into disagreeing about what
    // this router does to a child process on Windows.
    expect(hiddenSpawn({ cwd: "." }).windowsHide).toBe(true);
    expect(hiddenSpawn({ cwd: "." }).cwd).toBe(".");
    // And the one thing the two modes disagree about is still theirs to
    // disagree about: an argv never gets a shell, because which branch runs
    // is `resolveProgram`'s to decide.
    expect(spawnOptionsFor({}, "shell").shell).toBe(true);
    expect(spawnOptionsFor({}, "argv").shell).toBe(false);
  });
});
