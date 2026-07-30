// Set 107 S1 — the pure core behind `Dabbler: Try a sample project`.
//
// The contract under test is proposal v3 §5's seven steps plus the §12.3
// corrections that this set exists to satisfy:
//   - a non-empty folder is refused BY NAME;
//   - a run that dies at step 5 leaves a folder the next run RESUMES rather
//     than refuses (the defect that would otherwise reject the project the
//     command just made);
//   - the baseline commit works on a machine with NO git identity, via a
//     REPOSITORY-LOCAL identity and never a global config write;
//   - step 5's failure text is a first-run experience: no traceback, and the
//     exact commands to finish by hand.

import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { FileOps } from "../../utils/aiRouterInstall";
import {
  LOCAL_ONLY_REL,
  SAMPLE_MARKER_REL,
  SAMPLE_STEPS,
  SAMPLE_STEP_PHRASE,
  SampleBundle,
  SampleGitOps,
  SampleMarker,
  SampleStep,
  buildSampleStarterLine,
  classifyTargetFolder,
  createSampleProject,
  describeError,
  describeInstallFailure,
  describeNonEmptyFolder,
  describeResumableSample,
  describeSuccess,
  loadSampleBundle,
  renderLocalOnlyMarker,
  renderManualInstallCommands,
  renderInstallFailureLog,
  renderedRelPath,
  resolveBundledSampleDir,
  sampleOwnedTopLevelEntries,
} from "../../utils/sampleProject";
import {
  GIT_MISSING_MESSAGE,
  MANUAL_COMMANDS_HEADING,
  PROXY_HINT,
  SAMPLE_PICKER_LABEL,
  SAMPLE_PICKER_TITLE,
  SAMPLE_PROGRESS,
  STARTER_LINE_COPIED,
} from "../../utils/sampleProject";
import { pickTargetFolder } from "../../commands/trySampleProject";

// ---------- in-memory filesystem ----------

interface MemFs {
  files: Map<string, string>;
  ops: FileOps;
  listDir: (abs: string) => string[];
  exists: (abs: string) => boolean;
  readFile: (abs: string) => string;
  removeRecursive: (abs: string) => void;
}

function makeMemFs(): MemFs {
  const files = new Map<string, string>();
  const norm = (p: string) => path.resolve(p).replace(/\\/g, "/");
  const exists = (p: string): boolean => {
    const n = norm(p);
    if (files.has(n)) return true;
    // A directory "exists" when anything lives under it.
    for (const k of files.keys()) if (k.startsWith(`${n}/`)) return true;
    return false;
  };
  const removeRecursive = (p: string): void => {
    const n = norm(p);
    for (const k of [...files.keys()]) {
      if (k === n || k.startsWith(`${n}/`)) files.delete(k);
    }
  };
  const ops: FileOps = {
    exists,
    readFile: (p) => {
      const v = files.get(norm(p));
      if (v === undefined) throw new Error(`ENOENT: ${p}`);
      return v;
    },
    writeFile: (p, c) => void files.set(norm(p), c),
    writeFileExclusive: (p, c) => {
      if (files.has(norm(p))) throw new Error(`EEXIST: ${p}`);
      files.set(norm(p), c);
    },
    mkdirp: () => {},
    copyDir: () => {},
    removeRecursive,
    mkdtemp: (prefix) => path.join(os.tmpdir(), `${prefix}mem`),
  };
  const listDir = (abs: string): string[] => {
    const n = norm(abs);
    const out = new Set<string>();
    for (const k of files.keys()) {
      if (!k.startsWith(`${n}/`)) continue;
      out.add(k.slice(n.length + 1).split("/")[0]);
    }
    return [...out];
  };
  return { files, ops, listDir, exists, readFile: ops.readFile, removeRecursive };
}

// ---------- the real, canonical bundle ----------

function canonicalSampleDir(): string {
  const extRoot = path.resolve(__dirname, "../../..");
  const candidates = [
    path.resolve(extRoot, "../../docs/templates/sample-project"),
    resolveBundledSampleDir(extRoot),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "bundle.json"))) return c;
  }
  throw new Error("Could not locate the sample-project bundle for tests.");
}

function listFilesRecursive(absDir: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, prefix: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), rel);
      else if (entry.isFile()) out.push(rel);
    }
  };
  walk(absDir, "");
  return out.sort();
}

const realBundle: SampleBundle = loadSampleBundle(canonicalSampleDir(), {
  readFile: (p) => fs.readFileSync(p, "utf8"),
  listFilesRecursive,
});

// ---------- git spy ----------

interface GitSpy extends SampleGitOps {
  calls: string[];
  identity: { name: string; email: string; scope: string } | null;
  available: boolean;
}

function makeGitSpy(overrides: Partial<GitSpy> = {}): GitSpy {
  const spy: GitSpy = {
    calls: [],
    identity: null,
    available: true,
    isAvailable: async () => spy.available,
    init: async (dir) => void spy.calls.push(`init:${dir}`),
    setLocalIdentity: async (dir, name, email) => {
      spy.identity = { name, email, scope: "local" };
      spy.calls.push(`identity:${dir}`);
    },
    commitAll: async (_dir, msg) => void spy.calls.push(`commit:${msg}`),
    ...overrides,
  };
  return spy;
}

const TARGET = path.resolve(os.tmpdir(), "dabbler-sample-test-target");

function baseDeps(mem: MemFs, git: GitSpy, install: () => Promise<{ ok: boolean; message: string; venvPath: string | null }>) {
  return {
    targetDir: TARGET,
    bundle: realBundle,
    fileOps: mem.ops,
    git,
    installRouter: install,
    nowIso: () => "2026-07-30T00:00:00.000Z",
  };
}

const okInstall = async () => ({
  ok: true,
  message: "Installed dabbler-ai-router.",
  venvPath: path.join(TARGET, ".venv"),
});

// ---------- the bundle itself ----------

suite("sampleProject — the canonical bundle (proposal v3 §6)", () => {
  test("loads with the metadata three consumers pin", () => {
    assert.strictEqual(typeof realBundle.meta.bundleVersion, "number");
    assert.strictEqual(realBundle.meta.sampleSetSlug, "001-add-a-shout");
    assert.strictEqual(realBundle.meta.tier, "lightweight");
    assert.strictEqual(realBundle.meta.programEntryPoint, "main.py");
    assert.deepStrictEqual(realBundle.meta.expectedProgramOutput, [
      "Hello, world!",
      "HELLO, WORLD!",
    ]);
  });

  test("renders the files the tutorial and the smoke test both name", () => {
    for (const rel of [
      "main.py",
      "test_greeting.py",
      "hello/__init__.py",
      "hello/greeting.py",
      "AGENTS.md",
      "CLAUDE.md",
      "GEMINI.md",
      "README.md",
      ".gitignore",
      "docs/session-sets/001-add-a-shout/spec.md",
      "docs/session-sets/001-add-a-shout/session-state.json",
    ]) {
      assert.ok(
        rel in realBundle.files,
        `bundle should render ${rel}; got ${Object.keys(realBundle.files).sort().join(", ")}`,
      );
    }
  });

  test("the `dot-` prefix rule renames only the basename, at any depth", () => {
    assert.strictEqual(renderedRelPath("dot-gitignore"), ".gitignore");
    assert.strictEqual(renderedRelPath("a/b/dot-env"), "a/b/.env");
    // The rule must not fire on a directory segment that merely contains it,
    // nor on an ordinary name.
    assert.strictEqual(renderedRelPath("adot-b/main.py"), "adot-b/main.py");
    assert.strictEqual(renderedRelPath("hello/greeting.py"), "hello/greeting.py");
    // And the bundle-side dotfile must NOT survive under its raw name.
    assert.ok(!("dot-gitignore" in realBundle.files));
  });

  test("the sample starts RED: the named function is absent but its test exists", () => {
    // Asserted against bundle.json's `missingFunction`, not a literal, so the
    // contract is the thing being enforced (S1 verification round 1, Major 4).
    const fn = realBundle.meta.missingFunction;
    // ABSENCE, of any definition shape — `def`, `async def`, or a
    // module-level binding. A bare /\bdef fn\b/ misses the latter two.
    const defined = new RegExp(
      `(^|\\n)\\s*(async\\s+)?def\\s+${fn}\\b|(^|\\n)\\s*${fn}\\s*=`,
    );
    assert.ok(
      !defined.test(realBundle.files["hello/greeting.py"]),
      `greeting.py must ship WITHOUT any definition of ${fn} — the red-to-green transition is the whole first-run experience`,
    );
    // PRESENCE: the test must CALL it. Third-provider adjudication
    // (gemini-2.5-pro) caught that a bare word-boundary match was already
    // satisfied by the module DOCSTRING, which mentions `shout` in prose — so
    // this check stayed green even with the failing test deleted outright,
    // and that failing test is the only reason the sample starts red.
    assert.ok(
      new RegExp(`greeting\\.${fn}\\s*\\(`).test(realBundle.files["test_greeting.py"]),
      `test_greeting.py must CALL greeting.${fn}(...), not merely mention it in prose`,
    );
    assert.ok(/def test_greet_says_hello/.test(realBundle.files["test_greeting.py"]));
  });

  test("the bundle's OWN rendered docs match bundle.json (no silent drift)", () => {
    // The Major the verifier raised: bundle.json was CALLED the single source
    // of truth while the same claims were duplicated as prose in the rendered
    // docs, where they could drift with nothing failing. Bind them.
    //
    // Scope, stated honestly (remediation cycle 2 -- the first version of this
    // test called itself "every prose copy of the contract" while checking
    // two files, which is the same over-claiming this finding is about):
    // this covers the documents the BUNDLE renders. The third consumer,
    // `docs/tutorials/hello-world.md`, does not describe this sample yet --
    // Session 2 authors it -- so there is nothing here to bind it to. Binding
    // it is named in that session's plan and in the bundle README.
    const { expectedProgramOutput, programEntryPoint, sampleSetSlug } =
      realBundle.meta;
    for (const rel of ["README.md", "AGENTS.md"]) {
      const text = realBundle.files[rel];
      for (const line of expectedProgramOutput) {
        assert.ok(
          text.includes(line),
          `${rel} must quote the expected program output line "${line}" exactly as bundle.json declares it`,
        );
      }
      assert.ok(
        text.includes(programEntryPoint),
        `${rel} must name the program entry point ${programEntryPoint}`,
      );
    }
    // The task set the command and the starter line both point at.
    const specRel = `docs/session-sets/${sampleSetSlug}/spec.md`;
    assert.ok(
      specRel in realBundle.files,
      "the declared sample set slug must be the one the bundle actually renders",
    );
    assert.ok(realBundle.files["AGENTS.md"].includes(sampleSetSlug));
    // Round 4: the shipped task text is contract-bearing prose too. A
    // maintainer who changes the exercise and updates bundle.json, the Python
    // files and the smoke test could still leave this spec describing the old
    // function -- and the reader would then follow a stale task and stay red.
    const spec = realBundle.files[specRel];
    assert.ok(
      spec.includes(realBundle.meta.missingFunction),
      `${specRel} must name the function bundle.json declares missing ` +
        `(${realBundle.meta.missingFunction}), or the shipped task goes stale silently`,
    );
    for (const line of expectedProgramOutput) {
      assert.ok(
        spec.includes(line),
        `${specRel} must quote the expected program output line "${line}"`,
      );
    }
    // And the test command the docs tell the reader to run.
    const testCmd = realBundle.meta.testCommandArgs.join(" ");
    for (const rel of ["README.md", "AGENTS.md"]) {
      assert.ok(
        realBundle.files[rel].includes(testCmd),
        `${rel} must show the declared test command "${testCmd}"`,
      );
    }
  });

  test("the disposition block AGENTS.md dictates is itself bound to the contract", () => {
    // Third-provider adjudication (gemini-2.5-pro), point 1: AGENTS.md hands
    // the agent a literal disposition.json whose `summary` and `files_changed`
    // are contract-bearing prose that nothing checked. Change the exercise and
    // that block goes stale while every other guard stays green.
    const agents = realBundle.files["AGENTS.md"];
    const block = /```json\s*(\{[\s\S]*?\})\s*```/.exec(agents);
    assert.ok(block, "AGENTS.md must contain a fenced JSON disposition block");
    const disposition = JSON.parse(block![1]) as {
      summary: string;
      files_changed: string[];
      verification_method: string;
    };
    // It must be valid JSON the agent can copy verbatim (parsed above), and
    // it must describe THIS exercise.
    assert.ok(
      disposition.summary.includes(realBundle.meta.missingFunction),
      `the dictated summary must name ${realBundle.meta.missingFunction}`,
    );
    assert.deepStrictEqual(
      disposition.files_changed,
      ["hello/greeting.py"],
      "the dictated files_changed must be the module the task actually edits",
    );
    // And that module is the one the contract says is missing the function.
    assert.ok(
      disposition.files_changed.every((f) => f in realBundle.files),
      "every file the dictated disposition names must exist in the bundle",
    );
  });

  test("the sample's completion record does not claim a review that never happened", () => {
    // S1 verification round 1, Majors 2+3: the sample previously told every
    // agent to write `manual-via-other-engine` into disposition.json while
    // telling the developer in the same breath that no second AI reviewed the
    // work. This repo has a whole incident history about exactly that class of
    // false provenance, and the sample is a TEACHING artifact.
    const agents = realBundle.files["AGENTS.md"];
    assert.ok(
      /"verification_method":\s*"skipped"/.test(agents),
      "the sample must record verification as skipped -- which is what actually happens",
    );
    assert.ok(
      !agents.includes("manual-via-other-engine"),
      "the sample must never claim another engine verified it",
    );
  });

  test("the resume marker is gitignored but the local-only marker is not", () => {
    // Found by the smoke test, not by reasoning: the resume marker is created
    // before step 3's `git add -A` and REMOVED on success, so a tracked marker
    // leaves a deleted-file dirt in the working tree and the reader's very
    // first close_session fails its working_tree_clean gate.
    const ignored = realBundle.files[".gitignore"];
    assert.ok(ignored.includes(SAMPLE_MARKER_REL.split("/").pop()!));
    assert.ok(ignored.includes(".dabbler/sample-in-progress.json"));
    assert.ok(
      !new RegExp(`^\\s*${LOCAL_ONLY_REL}\\s*$`, "m").test(ignored),
      "the local-only marker is the durable record and must stay tracked",
    );
  });

  test("the sample's task set is Lightweight and not-started", () => {
    const spec = realBundle.files["docs/session-sets/001-add-a-shout/spec.md"];
    assert.ok(/tier:\s*lightweight/.test(spec));
    const state = JSON.parse(
      realBundle.files["docs/session-sets/001-add-a-shout/session-state.json"],
    );
    assert.strictEqual(state.schemaVersion, 4);
    assert.strictEqual(state.status, "not-started");
    assert.strictEqual(state.sessionSetName, "001-add-a-shout");
  });

  test("the sample needs no dependency beyond dabbler-ai-router", () => {
    // Standard-library unittest on purpose: step 5 installs exactly one
    // package, so a sample whose tests needed pytest could never run.
    assert.ok(/import unittest/.test(realBundle.files["test_greeting.py"]));
    assert.ok(!/pytest/.test(realBundle.files["test_greeting.py"]));
    assert.deepStrictEqual(realBundle.meta.testCommandArgs, ["-m", "unittest"]);
  });

  test("the agent instructions carry the flags the lifecycle actually needs", () => {
    const agents = realBundle.files["AGENTS.md"];
    // Proven against a real walk in S1: without --no-router the sample would
    // demand provider keys, and without --accept-suggestions the close stops
    // on an interactive question the agent cannot answer.
    assert.ok(/--no-router/.test(agents));
    assert.ok(/--accept-suggestions/.test(agents));
    assert.ok(/start_session/.test(agents));
    assert.ok(/close_session/.test(agents));
  });
});

// ---------- step 1: folder classification ----------

suite("sampleProject — step 1, the folder verdict", () => {
  test("an empty (or absent) folder is accepted", () => {
    const mem = makeMemFs();
    assert.deepStrictEqual(classifyTargetFolder(TARGET, 1, mem), { kind: "empty" });
  });

  test("someone else's non-empty folder is refused", () => {
    const mem = makeMemFs();
    mem.ops.writeFile(path.join(TARGET, "my-notes.txt"), "mine");
    assert.strictEqual(classifyTargetFolder(TARGET, 1, mem).kind, "non-empty");
  });

  test("a folder carrying OUR marker is resumable, at the first unfinished step", () => {
    const mem = makeMemFs();
    const marker: SampleMarker = {
      bundleVersion: 1,
      completedSteps: ["render", "git", "marker"],
      startedAt: "2026-07-30T00:00:00.000Z",
    };
    mem.ops.writeFile(path.join(TARGET, SAMPLE_MARKER_REL), JSON.stringify(marker));
    mem.ops.writeFile(path.join(TARGET, "main.py"), "x");
    const verdict = classifyTargetFolder(TARGET, 1, mem);
    assert.strictEqual(verdict.kind, "resumable");
    if (verdict.kind !== "resumable") return;
    assert.strictEqual(verdict.nextStep, "install");
  });

  test("a marker from a DIFFERENT bundle version is not resumable", () => {
    const mem = makeMemFs();
    mem.ops.writeFile(
      path.join(TARGET, SAMPLE_MARKER_REL),
      JSON.stringify({ bundleVersion: 99, completedSteps: ["render"], startedAt: "" }),
    );
    // Mixing two extension versions' file sets is worse than starting over.
    assert.strictEqual(classifyTargetFolder(TARGET, 1, mem).kind, "non-empty");
  });

  test("a corrupt marker is not resumable", () => {
    const mem = makeMemFs();
    mem.ops.writeFile(path.join(TARGET, SAMPLE_MARKER_REL), "{ not json");
    assert.strictEqual(classifyTargetFolder(TARGET, 1, mem).kind, "non-empty");
  });

  test("an all-steps-done marker resumes idempotently instead of refusing", () => {
    const mem = makeMemFs();
    mem.ops.writeFile(
      path.join(TARGET, SAMPLE_MARKER_REL),
      JSON.stringify({ bundleVersion: 1, completedSteps: [...SAMPLE_STEPS], startedAt: "" }),
    );
    const verdict = classifyTargetFolder(TARGET, 1, mem);
    assert.strictEqual(verdict.kind, "resumable");
  });
});

suite("sampleProject — step 1 wiring: refuse, retry, resume", () => {
  function pickIo(mem: MemFs, folders: (string | undefined)[], answers: (string | undefined)[]) {
    const shown: string[] = [];
    let f = 0;
    let a = 0;
    return {
      shown,
      io: {
        showOpenDialog: async () => folders[f++],
        showWarning: async (msg: string) => {
          shown.push(msg);
          return answers[a++];
        },
        exists: mem.exists,
        readFile: mem.readFile,
        listDir: mem.listDir,
        removeRecursive: mem.removeRecursive,
      },
    };
  }

  test("names the refused folder, then accepts the operator's second pick", async () => {
    const mem = makeMemFs();
    const busy = path.resolve(os.tmpdir(), "busy-folder");
    mem.ops.writeFile(path.join(busy, "notes.txt"), "x");
    const { shown, io } = pickIo(mem, [busy, TARGET], ["Choose Again"]);
    const picked = await pickTargetFolder(realBundle, io);
    assert.deepStrictEqual(picked, { folder: TARGET, resumeFrom: [] });
    assert.ok(shown[0].includes(busy), "the refusal must name the folder");
  });

  test("Cancel on the refusal returns null (no folder is touched)", async () => {
    const mem = makeMemFs();
    mem.ops.writeFile(path.join(TARGET, "notes.txt"), "x");
    const { io } = pickIo(mem, [TARGET], ["Cancel"]);
    assert.strictEqual(await pickTargetFolder(realBundle, io), null);
  });

  test("Resume carries the previous attempt's completed steps forward", async () => {
    const mem = makeMemFs();
    mem.ops.writeFile(
      path.join(TARGET, SAMPLE_MARKER_REL),
      JSON.stringify({ bundleVersion: 1, completedSteps: ["render", "git"], startedAt: "" }),
    );
    const { shown, io } = pickIo(mem, [TARGET], ["Resume"]);
    const picked = await pickTargetFolder(realBundle, io);
    assert.deepStrictEqual(picked, { folder: TARGET, resumeFrom: ["render", "git"] });
    assert.ok(
      shown[0].includes(SAMPLE_STEP_PHRASE.marker),
      "the resume prompt must name the step that did not finish, in plain words",
    );
  });

  test("Start Over clears what WE created and keeps the operator's own files", async () => {
    const mem = makeMemFs();
    mem.ops.writeFile(
      path.join(TARGET, SAMPLE_MARKER_REL),
      JSON.stringify({ bundleVersion: 1, completedSteps: ["render"], startedAt: "" }),
    );
    mem.ops.writeFile(path.join(TARGET, "hello/greeting.py"), "ours");
    mem.ops.writeFile(path.join(TARGET, "my-notes.txt"), "theirs");
    mem.ops.writeFile(path.join(TARGET, "main.py"), "ours");
    const { io } = pickIo(mem, [TARGET], ["Start Over"]);
    const picked = await pickTargetFolder(realBundle, io);
    assert.deepStrictEqual(picked, { folder: TARGET, resumeFrom: [] });
    assert.ok(!mem.exists(path.join(TARGET, SAMPLE_MARKER_REL)));
    assert.ok(!mem.exists(path.join(TARGET, "hello/greeting.py")));
    assert.ok(
      !mem.exists(path.join(TARGET, "main.py")),
      "every top-level entry the bundle owns must be cleared, not just some",
    );
    assert.ok(
      mem.exists(path.join(TARGET, "my-notes.txt")),
      "Start Over must never delete files the product did not write",
    );
  });

  test("the Start Over removal list is DERIVED from the bundle, never hand-listed", () => {
    // A hand-maintained list silently falls behind when the bundle grows a
    // new top-level entry, leaving a stale file that Start Over promised to
    // clear. Deriving it makes that impossible by construction.
    const owned = sampleOwnedTopLevelEntries(realBundle);
    for (const rel of Object.keys(realBundle.files)) {
      assert.ok(
        owned.includes(rel.split("/")[0]),
        `${rel} is rendered by the bundle but not owned by Start Over`,
      );
    }
    // Plus the two directories the command creates itself.
    assert.ok(owned.includes(".dabbler"));
    assert.ok(owned.includes(".git"));
  });
});

// ---------- steps 2-5 ----------

suite("sampleProject — the happy path (steps 2-5)", () => {
  test("renders, inits, marks local-only, installs, and retires the resume marker", async () => {
    const mem = makeMemFs();
    const git = makeGitSpy();
    const progress: string[] = [];
    const result = await createSampleProject({
      ...baseDeps(mem, git, okInstall),
      reportProgress: (m) => progress.push(m),
    });

    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.completedSteps, SAMPLE_STEPS);
    assert.ok(mem.exists(path.join(TARGET, "main.py")));
    assert.ok(mem.exists(path.join(TARGET, LOCAL_ONLY_REL)));
    assert.ok(
      !mem.exists(path.join(TARGET, SAMPLE_MARKER_REL)),
      "a fully successful run leaves no resume marker behind",
    );
    // Two commits, in contract order: the bundle, then the local-only marker.
    assert.deepStrictEqual(
      git.calls.filter((c) => c.startsWith("commit:")),
      ["commit:The Dabbler sample project", "commit:Record that this project is local only"],
    );
    assert.deepStrictEqual(progress, [
      SAMPLE_PROGRESS.render,
      SAMPLE_PROGRESS.git,
      SAMPLE_PROGRESS.marker,
      SAMPLE_PROGRESS.install,
    ]);
  });

  test("the git identity is REPOSITORY-LOCAL and never global (v3 §12.3)", async () => {
    const mem = makeMemFs();
    const git = makeGitSpy();
    await createSampleProject(baseDeps(mem, git, okInstall));
    assert.deepStrictEqual(git.identity, {
      name: "Dabbler Sample",
      email: "sample@dabbler.local",
      scope: "local",
    });
    // The identity is set BEFORE the baseline commit — the whole point is a
    // machine with no user.email configured at all.
    const identityAt = git.calls.indexOf(`identity:${TARGET}`);
    const commitAt = git.calls.indexOf("commit:The Dabbler sample project");
    assert.ok(identityAt >= 0 && commitAt > identityAt);
  });

  test("the local-only marker matches the ai_router contract path and shape", async () => {
    const mem = makeMemFs();
    await createSampleProject(baseDeps(mem, makeGitSpy(), okInstall));
    const body = mem.readFile(path.join(TARGET, LOCAL_ONLY_REL));
    assert.strictEqual(LOCAL_ONLY_REL, ".dabbler/local-only");
    assert.ok(body.startsWith("# .dabbler/local-only --"));
    assert.ok(/enabled_by: Dabbler: Try a sample project/.test(body));
    assert.ok(/enabled_at: 2026-07-30T00:00:00\.000Z/.test(body));
    // ASCII-only: this file is read on a Windows cp1252 console.
    assert.ok(/^[\x20-\x7e\n]*$/.test(renderLocalOnlyMarker("x")));
  });

  test("the Lightweight divergence: the seeded router config does not survive", async () => {
    // The PyPI install seeds ai_router/router-config.yaml as package data.
    // The sample is Lightweight -- router OFF -- so a project whose whole
    // promise is that it is tiny must not ship a routing-configuration
    // directory. Same rule the Getting Started scaffold already applies.
    const mem = makeMemFs();
    const result = await createSampleProject(
      baseDeps(mem, makeGitSpy(), async () => {
        mem.ops.writeFile(
          path.join(TARGET, "ai_router", "router-config.yaml"),
          "models: {}\n",
        );
        return {
          ok: true,
          message: "Installed dabbler-ai-router.",
          venvPath: path.join(TARGET, ".venv"),
        };
      }),
    );
    assert.strictEqual(result.ok, true);
    assert.ok(
      !mem.exists(path.join(TARGET, "ai_router")),
      "a Lightweight sample must not carry a seeded router config",
    );
    // The sample itself is untouched.
    assert.ok(mem.exists(path.join(TARGET, "main.py")));
  });

  test("a missing git stops at step 3 without pretending to continue", async () => {
    const mem = makeMemFs();
    const git = makeGitSpy({ available: false });
    const result = await createSampleProject(baseDeps(mem, git, okInstall));
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.failedStep, "git");
    assert.ok(!mem.exists(path.join(TARGET, LOCAL_ONLY_REL)));
  });
});

// ---------- the v3 §12.3 defect: forced step-5 failure, then resume ----------

suite("sampleProject — a failed install is resumable, not a dead end (v3 §12.3)", () => {
  test("step 5 fails: the folder keeps a marker naming install as the next step", async () => {
    const mem = makeMemFs();
    const git = makeGitSpy();
    const result = await createSampleProject(
      baseDeps(mem, git, async () => ({
        ok: false,
        message: "pip install failed: could not reach https://pypi.org",
        venvPath: null,
      })),
    );

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.failedStep, "install");
    assert.deepStrictEqual(result.completedSteps, ["render", "git", "marker"]);
    // Everything before step 5 IS on disk — which is exactly why a naive
    // retry would hit the empty-folder refusal.
    assert.ok(mem.exists(path.join(TARGET, "main.py")));
    assert.ok(mem.exists(path.join(TARGET, LOCAL_ONLY_REL)));

    const marker = JSON.parse(
      mem.readFile(path.join(TARGET, SAMPLE_MARKER_REL)),
    ) as SampleMarker;
    assert.deepStrictEqual(marker.completedSteps, ["render", "git", "marker"]);

    // ...and the folder now classifies as resumable rather than refused.
    const verdict = classifyTargetFolder(TARGET, realBundle.meta.bundleVersion, mem);
    assert.strictEqual(verdict.kind, "resumable");
    if (verdict.kind !== "resumable") return;
    assert.strictEqual(verdict.nextStep, "install");
  });

  test("re-running on the same folder retries ONLY the install and succeeds", async () => {
    const mem = makeMemFs();
    const git = makeGitSpy();
    let installAttempts = 0;
    const flakyInstall = async () => {
      installAttempts += 1;
      return installAttempts === 1
        ? { ok: false, message: "pip install failed: proxy refused", venvPath: null }
        : { ok: true, message: "Installed dabbler-ai-router.", venvPath: path.join(TARGET, ".venv") };
    };

    const first = await createSampleProject(baseDeps(mem, git, flakyInstall));
    assert.strictEqual(first.ok, false);

    const verdict = classifyTargetFolder(TARGET, realBundle.meta.bundleVersion, mem);
    assert.strictEqual(verdict.kind, "resumable");
    if (verdict.kind !== "resumable") return;

    const gitAfterFirst = git.calls.length;
    const second = await createSampleProject({
      ...baseDeps(mem, git, flakyInstall),
      resumeFrom: verdict.marker.completedSteps,
    });

    assert.strictEqual(second.ok, true);
    assert.strictEqual(installAttempts, 2);
    assert.deepStrictEqual(second.written, [], "a resume re-renders nothing");
    assert.strictEqual(
      git.calls.length,
      gitAfterFirst,
      "a resume past step 4 must not re-init or re-commit",
    );
    assert.ok(
      !mem.exists(path.join(TARGET, SAMPLE_MARKER_REL)),
      "the successful resume retires the marker",
    );
  });
});

// ---------- step 5's failure text is a first-run experience (v3 §12.4) ----------

suite("sampleProject — the install failure message", () => {
  test("reassures first, names only what failed, and points at the resume", () => {
    const msg = describeInstallFailure("C:\\work\\sample", "pip install failed: proxy refused");
    assert.ok(/created successfully and nothing was lost/.test(msg));
    assert.ok(/Only the Python package install did not finish/.test(msg));
    assert.ok(/pick up where it stopped/.test(msg));
    assert.ok(msg.includes("C:\\work\\sample"));
  });

  test("gives the exact commands, with real absolute paths", () => {
    const cmds = renderManualInstallCommands(
      "C:\\work\\sample",
      "C:\\Python312\\python.exe",
      "C:\\work\\sample\\.venv\\Scripts\\python.exe",
    );
    assert.deepStrictEqual(cmds, [
      'cd "C:\\work\\sample"',
      '"C:\\Python312\\python.exe" -m venv .venv',
      '"C:\\work\\sample\\.venv\\Scripts\\python.exe" -m pip install dabbler-ai-router',
    ]);
    const log = renderInstallFailureLog("C:\\work\\sample", "proxy refused", cmds);
    assert.ok(log.includes(MANUAL_COMMANDS_HEADING));
    assert.ok(log.includes(PROXY_HINT));
    assert.ok(/HTTPS_PROXY/.test(log), "the proxy escape hatch must be named");
    for (const c of cmds) assert.ok(log.includes(c));
  });

  test("never surfaces a traceback (v3 §12.4)", () => {
    const traceback = [
      "Traceback (most recent call last):",
      '  File "<string>", line 1, in <module>',
      "    at somewhere",
      "ConnectionError: HTTPSConnectionPool(host='pypi.org', port=443)",
    ].join("\n");
    const reduced = describeError(new Error(traceback));
    assert.ok(!reduced.includes("Traceback"));
    assert.ok(!reduced.includes("File \"<string>\""));
    assert.ok(reduced.includes("ConnectionError"));
    assert.ok(!reduced.includes("\n"), "the reduced reason must be one line");
  });

  test("an empty/unknown error still yields something sayable", () => {
    assert.strictEqual(describeError(new Error("")), "no further detail available");
  });
});

// ---------- the strings themselves ----------

suite("sampleProject — the user-facing strings", () => {
  const allStrings = [
    SAMPLE_PICKER_LABEL,
    SAMPLE_PICKER_TITLE,
    ...Object.values(SAMPLE_PROGRESS),
    describeNonEmptyFolder("C:\\x"),
    describeResumableSample("C:\\x", "install"),
    GIT_MISSING_MESSAGE,
    describeInstallFailure("C:\\x", "y"),
    MANUAL_COMMANDS_HEADING,
    PROXY_HINT,
    describeSuccess(),
    STARTER_LINE_COPIED,
    ...Object.values(SAMPLE_STEP_PHRASE),
  ];

  test("are ASCII-only, so a Windows cp1252 console can encode them", () => {
    for (const s of allStrings) {
      const bad = [...s].filter((ch) => ch.charCodeAt(0) > 126 || ch.charCodeAt(0) < 32);
      assert.deepStrictEqual(
        bad,
        [],
        `non-ASCII character(s) ${JSON.stringify(bad)} in: ${s}`,
      );
    }
  });

  test("use no product jargon the first-run reader has not been taught", () => {
    // The set exists because staff called the product too complicated. These
    // words all presume a concept the reader has not met yet.
    const banned = [
      "scaffold",
      "bootstrap",
      "provision",
      "orchestrator",
      "worktree",
      "session set",
      "branch protection",
      "consumer repo",
      "tier",
    ];
    for (const s of allStrings) {
      for (const word of banned) {
        assert.ok(
          !s.toLowerCase().includes(word),
          `"${word}" leaked into a first-run string: ${s}`,
        );
      }
    }
  });

  test("the starter line matches the shipped copy affordance exactly (v3 §12.2)", () => {
    // Increment A exposes the EXISTING affordance rather than inventing a
    // second one, so this must stay byte-identical to
    // buildStartNextSessionPrompt's output for the same slug.
    assert.strictEqual(
      buildSampleStarterLine("001-add-a-shout"),
      "Start the next session of `001-add-a-shout`.",
    );
  });

  test("the git-missing message says where to get git", () => {
    assert.ok(GIT_MISSING_MESSAGE.includes("https://git-scm.com/downloads"));
  });
});
