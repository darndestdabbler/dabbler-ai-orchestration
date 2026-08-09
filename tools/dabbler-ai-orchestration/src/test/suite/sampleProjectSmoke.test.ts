// Set 107 S1 step 8 — the sample project's executable acceptance floor.
//
// Proposal v3 §6/§8: render the bundle, start the zero-budget lifecycle, run
// the sample's tests, and assert the expected program output. Everything the
// tutorial (Session 2) and the stopwatch walk (Session 3) will claim about the
// sample is asserted here first, against `bundle.json` rather than against
// hand-copied literals, so a sample that drifts fails the build instead of
// failing a reader on their first fifteen minutes.
//
// What is real here: the render, git init, the repo-local identity, the
// baseline commits, the `.dabbler/local-only` marker, `start_session`, the
// unittest run before AND after the change, the program's stdout, and
// `close_session`. What is stubbed: only step 5's `pip install`, because the
// interpreter this test already runs under has `ai_router` importable and a
// network install would make the acceptance floor flaky for no added signal.
//
// L-079-3: this walk begins from a genuinely EMPTY directory, never a
// pre-seeded fixture -- provisioning code is exactly where silent fail-open
// paths hide.

import * as assert from "assert";
import * as cp from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  LOCAL_ONLY_REL,
  SAMPLE_MARKER_REL,
  SampleBundle,
  createSampleProject,
  loadSampleBundle,
  resolveBundledSampleDir,
} from "../../utils/sampleProject";
import {
  listFilesRecursiveSync,
  makeSampleGitOps,
} from "../../commands/trySampleProject";
import { makeFileOps } from "../../commands/installAiRouterCommands";

// ---------- locating the pieces ----------

function canonicalSampleDir(): string {
  const extRoot = path.resolve(__dirname, "../../..");
  for (const c of [
    path.resolve(extRoot, "../../docs/templates/sample-project"),
    resolveBundledSampleDir(extRoot),
  ]) {
    if (fs.existsSync(path.join(c, "bundle.json"))) return c;
  }
  throw new Error("Could not locate the sample-project bundle for the smoke test.");
}

/**
 * An interpreter that can `import ai_router`.
 *
 * Deliberately NOT skip-on-missing: a smoke test that quietly skips is worse
 * than none, because the sample would rot invisibly (L-064-12). The failure
 * message names the exact fix instead.
 */
function resolveSmokePython(): string {
  const repoRoot = path.resolve(__dirname, "../../../../..");
  const candidates = [
    process.env.DABBLER_SMOKE_PYTHON,
    path.join(repoRoot, ".venv", "Scripts", "python.exe"),
    path.join(repoRoot, ".venv", "bin", "python"),
    "python",
    "python3",
  ].filter((c): c is string => !!c);

  for (const candidate of candidates) {
    const probe = cp.spawnSync(candidate, ["-c", "import ai_router"], {
      encoding: "utf8",
    });
    if (probe.status === 0) return candidate;
  }
  throw new Error(
    "The sample-project smoke test needs a Python interpreter with " +
      "`ai_router` importable. Tried: " +
      candidates.join(", ") +
      ". Fix it with `.venv/Scripts/pip install -e .` from the repo root, or " +
      "point DABBLER_SMOKE_PYTHON at a suitable interpreter.",
  );
}

interface Run {
  code: number | null;
  stdout: string;
  stderr: string;
}

function run(exe: string, args: string[], cwd: string): Run {
  const r = cp.spawnSync(exe, args, { cwd, encoding: "utf8" });
  return { code: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/** Split stdout into non-empty trimmed lines, newline-agnostic. */
function outputLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

// ---------- the walk ----------

suite("sampleProject — smoke: the sample really goes red to green (v3 §8)", function () {
  // Real subprocesses on Windows: generous, but the whole walk is seconds.
  this.timeout(180_000);

  let target = "";
  let python = "";
  let bundle: SampleBundle;

  suiteSetup(() => {
    python = resolveSmokePython();
    bundle = loadSampleBundle(canonicalSampleDir(), {
      readFile: (p) => fs.readFileSync(p, "utf8"),
      listFilesRecursive: listFilesRecursiveSync,
    });
    // A genuinely empty directory -- the true cold start, not a fixture.
    target = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-sample-smoke-"));
    assert.deepStrictEqual(fs.readdirSync(target), []);
  });

  suiteTeardown(() => {
    if (target && fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true });
    }
  });

  test("steps 2-5 build a real, committed, local-only repo", async () => {
    const result = await createSampleProject({
      targetDir: target,
      bundle,
      fileOps: makeFileOps(),
      git: makeSampleGitOps(),
      // Step 5 only: the interpreter already has ai_router, and a live pip
      // install would add network flake without adding coverage.
      installRouter: async () => ({
        ok: true,
        message: "install stubbed for the smoke test",
        venvPath: null,
      }),
    });

    assert.strictEqual(result.ok, true, result.failureReason ?? "");
    assert.ok(fs.existsSync(path.join(target, "main.py")));
    assert.ok(fs.existsSync(path.join(target, LOCAL_ONLY_REL)));
    assert.ok(
      !fs.existsSync(path.join(target, SAMPLE_MARKER_REL)),
      "a complete run leaves no resume marker",
    );

    // The repo really is a repo, with a working tree the close-out gate will
    // find clean, and an identity that came from the repository's own config.
    const status = run("git", ["status", "--porcelain"], target);
    assert.strictEqual(status.code, 0);
    assert.strictEqual(status.stdout.trim(), "", "the baseline must be committed");
    const email = run("git", ["config", "--local", "user.email"], target);
    assert.strictEqual(email.stdout.trim(), "sample@dabbler.local");
  });

  test("an empty folder INSIDE an existing repo gets its own repo, not the parent's", async () => {
    // S1 verification round 1, Major 1. `checkIsRepo()` answers "is this path
    // inside a repository", so an empty child folder of an existing checkout
    // -- a very common pick -- reported true, skipped `git init`, and pointed
    // every later step at the PARENT: our identity written into the
    // developer's real repo config, and their unrelated work swept into our
    // `git add -A` commit. Driven with REAL git, because the whole defect was
    // a real-git behavior an in-memory fake cannot reproduce.
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-sample-parent-"));
    try {
      run("git", ["init"], parent);
      run("git", ["config", "user.email", "parent@example.com"], parent);
      run("git", ["config", "user.name", "Parent Dev"], parent);
      fs.writeFileSync(path.join(parent, "their-work.txt"), "precious\n", "utf8");
      run("git", ["add", "-A"], parent);
      run("git", ["commit", "-m", "parent baseline"], parent);
      // Their uncommitted work-in-progress, which must survive untouched.
      fs.writeFileSync(path.join(parent, "their-work.txt"), "uncommitted edit\n", "utf8");

      const child = path.join(parent, "sample");
      fs.mkdirSync(child);
      const result = await createSampleProject({
        targetDir: child,
        bundle,
        fileOps: makeFileOps(),
        git: makeSampleGitOps(),
        installRouter: async () => ({ ok: true, message: "stubbed", venvPath: null }),
      });
      assert.strictEqual(result.ok, true, result.failureReason ?? "");

      // The child is its own repository root.
      assert.ok(
        fs.existsSync(path.join(child, ".git")),
        "the sample folder must become its own git repository",
      );
      // The parent's identity is untouched.
      assert.strictEqual(
        run("git", ["config", "--local", "user.email"], parent).stdout.trim(),
        "parent@example.com",
        "the developer's own repository config must never be rewritten",
      );
      // The parent's uncommitted work is still uncommitted, and unstaged.
      const parentStatus = run("git", ["status", "--porcelain"], parent).stdout;
      assert.ok(
        /their-work\.txt/.test(parentStatus),
        `the parent's work must NOT have been committed by us; status was: ${parentStatus}`,
      );
      assert.strictEqual(
        run("git", ["log", "--oneline"], parent).stdout.trim().split(/\r?\n/).length,
        1,
        "the parent repository must still have exactly its own one commit",
      );
    } finally {
      fs.rmSync(parent, { recursive: true, force: true });
    }
  });

  test("the sample starts RED, with an error that points at the task", () => {
    const before = run(python, bundle.meta.testCommandArgs, target);
    assert.notStrictEqual(before.code, 0, "the sample must start with a failing test");
    // The declared count is ENFORCED against the real runner output, not
    // trusted (S1 remediation cycle 2): a sample that grows or loses a test
    // without updating bundle.json fails here.
    assert.ok(
      new RegExp(`Ran ${bundle.meta.expectedTestCount} tests?`).test(before.stderr),
      `bundle.json declares ${bundle.meta.expectedTestCount} tests; runner said: ${before.stderr}`,
    );
    assert.ok(
      new RegExp(`has no attribute '${bundle.meta.missingFunction}'`).test(
        before.stderr,
      ),
      "the failure must name the missing function, so a stranger knows what to do",
    );
  });

  test("the lifecycle registers the session", () => {
    const setDir = `docs/session-sets/${bundle.meta.sampleSetSlug}`;
    const started = run(
      python,
      [
        "-m",
        "ai_router.start_session",
        "--session-set-dir",
        setDir,
        "--engine",
        "smoke-test",
        "--no-router",
      ],
      target,
    );
    assert.strictEqual(
      started.code,
      0,
      `start_session failed: ${started.stderr || started.stdout}`,
    );
    const state = JSON.parse(
      fs.readFileSync(path.join(target, setDir, "session-state.json"), "utf8"),
    );
    assert.strictEqual(state.status, "in-progress");
    assert.strictEqual(state.sessions[0].status, "in-progress");
  });

  test("the change turns it GREEN and the program prints the contracted lines", () => {
    // The change the sample's own spec asks for. Written here rather than
    // shipped as an answer key: a second copy of the solution in the bundle
    // would be a second hand-maintained tree, which v3 §6 rules out. The
    // shape is pinned by the test the bundle already ships.
    const greeting = path.join(target, "hello", "greeting.py");
    fs.appendFileSync(
      greeting,
      '\n\ndef shout(name: str) -> str:\n    """Return the same greeting, in capital letters."""\n    return greet(name).upper()\n',
      "utf8",
    );

    const after = run(python, bundle.meta.testCommandArgs, target);
    assert.strictEqual(
      after.code,
      0,
      `tests should pass after the change: ${after.stderr}`,
    );
    assert.ok(/\bOK\b/.test(after.stderr), `expected OK; got: ${after.stderr}`);
    // Round 5 nit: the docs claimed the declared count was checked "before AND
    // after"; only the before-assertion had actually landed. Binding both is
    // what makes the claim true -- and it catches a change that makes the
    // suite pass by REMOVING the failing test rather than implementing it.
    assert.ok(
      new RegExp(`Ran ${bundle.meta.expectedTestCount} tests?`).test(after.stderr),
      `bundle.json declares ${bundle.meta.expectedTestCount} tests; after the change the runner said: ${after.stderr}`,
    );

    const program = run(python, [bundle.meta.programEntryPoint], target);
    assert.strictEqual(program.code, 0, program.stderr);
    assert.deepStrictEqual(
      outputLines(program.stdout),
      bundle.meta.expectedProgramOutput,
      "the program output IS the tutorial's promise -- it must match bundle.json",
    );
  });

  test("close_session closes cleanly on the local-only repo", () => {
    const setDir = `docs/session-sets/${bundle.meta.sampleSetSlug}`;
    const setAbs = path.join(target, setDir);
    fs.writeFileSync(
      path.join(setAbs, "disposition.json"),
      JSON.stringify(
        {
          status: "completed",
          summary:
            "Added the shout function to hello/greeting.py so both tests pass and main.py prints both lines.",
          // The honest token: no second engine reviews this sample, so the
          // record must not claim one did (S1 verification round 1, Major 2).
          verification_method: "skipped",
          files_changed: ["hello/greeting.py"],
          verification_message_ids: [],
          next_orchestrator: null,
          blockers: [],
        },
        null,
        2,
      ),
      "utf8",
    );
    fs.writeFileSync(
      path.join(setAbs, "change-log.md"),
      "# Change log\n\nAdded `shout` to `hello/greeting.py`.\n",
      "utf8",
    );
    fs.writeFileSync(
      path.join(setAbs, "activity-log.json"),
      JSON.stringify({ entries: [{ sessionNumber: 1, kind: "sample_smoke" }] }, null, 2),
      "utf8",
    );
    assert.strictEqual(run("git", ["add", "-A"], target).code, 0);
    assert.strictEqual(
      run("git", ["commit", "-m", "Add the shout greeting"], target).code,
      0,
      "the repo-local identity must let a later commit succeed with no global config",
    );

    const closed = run(
      python,
      [
        "-m",
        "ai_router.close_session",
        "--session-set-dir",
        setDir,
        "--no-router",
        "--accept-suggestions",
      ],
      target,
    );
    assert.strictEqual(
      closed.code,
      0,
      `close_session failed: ${closed.stderr || closed.stdout}`,
    );
    // The `.dabbler/local-only` marker is what makes the push gate pass on a
    // repo that will never have a remote.
    assert.ok(
      /\[PASS\] pushed_to_remote/.test(closed.stdout),
      `the local-only marker must waive the push gate: ${closed.stdout}`,
    );
    const state = JSON.parse(
      fs.readFileSync(path.join(setAbs, "session-state.json"), "utf8"),
    );
    assert.strictEqual(state.status, "complete");
  });
});
