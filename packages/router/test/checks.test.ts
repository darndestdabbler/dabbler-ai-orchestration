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
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  CheckConfigError,
  STAGE_TARGETED,
  coversAny,
  displayCommand,
  execute,
  fnmatchCase,
  loadChecks,
  makeCheck,
  matchingPrefixes,
  normaliseRel,
  plan,
  shlexSplit,
} from "../src/checks.ts";
import { snapshotWorktreeTree } from "../src/journal.ts";
import { makeSeededRepo, removeTempDirs } from "./support/fixtures.ts";

afterAll(removeTempDirs);

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

// --- Planning ---------------------------------------------------------------------

describe("planning the targeted stage", () => {
  const CONFIG = {
    testing: {
      suites: [
        {
          name: "unit", command: "pytest", covers: ["src/", "tests/"],
          test_roots: ["tests"], test_glob: "test_*.py",
        },
      ],
      controls: [{ name: "lint", kind: "lint", argv: ["ruff"], covers: ["src/"] }],
      selection: {
        rules: [{ when: "src/widget.py", select: ["tests/test_widget.py"] }],
      },
    },
  };

  it("narrows the suite to the selected tests and runs the control whole", () => {
    // A control has no subset form to be asked for: it covers the path or it
    // does not run at all.
    const repo = makeSeededRepo({
      "src/widget.py": "x = 1\n",
      "tests/test_widget.py": "assert True\n",
    });
    const base = execFileSync("git", ["rev-parse", "HEAD^{tree}"], {
      cwd: repo,
      encoding: "utf8",
    }).trim();
    writeFileSync(join(repo, "src", "widget.py"), "x = 2\n", "utf8");
    const tree = snapshotWorktreeTree(repo) as string;

    const planned = plan(repo, CONFIG, {
      stage: STAGE_TARGETED,
      treeDigest: tree,
      baseCommit: base,
    });
    expect(planned.changedPaths).toEqual(["src/widget.py"]);
    expect(planned.checks.map(([check, command]) => [check.name, command])).toEqual([
      ["unit", "pytest tests/test_widget.py"],
      ["lint", "ruff"],
    ]);
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
  });

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
