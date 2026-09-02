// The lifecycle's judgment half: the close and what it does after the
// gates, the two boundary reversals, the plan prose, the legacy migration,
// and the module manifest.
//
// The parity control runs these verbs against the corpus and compares the
// bytes. What is here is the states the corpus does not build -- a session
// already closed, a repository already migrated, a manifest with a typo in
// a key -- and the after-effects a comparison of two trees would show as
// agreement rather than as correctness: a close leaves a clean tree, and it
// leaves the lock uncommitted.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { platformNewlines, snapshotWorktreeTree } from "../src/journal.ts";
import { appendRound } from "../src/ledger.ts";
import {
  ManifestError,
  create,
  findEntry,
  loadEntries,
  loadManifest,
  parseEntries,
} from "../src/modules.ts";
import { readRawSessionState } from "../src/progress.ts";
import { gitAnswers } from "./support/gitAnswers.ts";
import {
  EXIT_BOUNDARY,
  EXIT_GATE_FAILED,
  EXIT_OK,
  EXIT_USAGE,
  cancel,
  close,
  migrate,
  plan,
  restore,
  start,
} from "../src/session.ts";
import { registerSessionStart } from "../src/writers.ts";
import {
  git,
  initRepo,
  makeSandboxRepo,
  makeTempDir,
  removeTempDirs,
} from "./support/fixtures.ts";

afterAll(removeTempDirs);
afterEach(() => vi.restoreAllMocks());

/** Everything the verb printed, so a refusal can be read rather than inferred. */
function captured(run: () => number): { code: number; out: string; err: string } {
  const out: string[] = [];
  const err: string[] = [];
  const collect = (sink: string[]) => (chunk: unknown) => {
    sink.push(String(chunk));
    return true;
  };
  vi.spyOn(process.stdout, "write").mockImplementation(collect(out));
  vi.spyOn(process.stderr, "write").mockImplementation(collect(err));
  try {
    return { code: run(), out: out.join(""), err: err.join("") };
  } finally {
    vi.restoreAllMocks();
  }
}

function closeReady(): { repo: string; sessionsDir: string } {
  const { repo, sessionsDir } = makeSandboxRepo();
  registerSessionStart(sessionsDir, 1, { engine: "claude-code", provider: "anthropic" });
  writeFileSync(join(repo, "src", "widget.py"), "def widget():\n    return 2\n", "utf8");
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "work");
  git(repo, "push", "-q");
  appendRound(repo, 1, {
    round: 1,
    verdict: "VERIFIED",
    blocking: false,
    verifier_model: "gpt-5-4",
    verifier_provider: "openai",
    findings: [],
    cost_usd: 0.05,
    completion_tree: snapshotWorktreeTree(repo),
    recorded_at: new Date().toISOString(),
  });
  return { repo, sessionsDir };
}

function porcelain(repo: string): string {
  return execFileSync("git", ["-C", repo, "status", "--porcelain", "-uall"], {
    encoding: "utf8",
  }).trim();
}

// --- close --------------------------------------------------------------------

describe("closing a session", () => {
  it("flips the state, commits the bookkeeping and leaves a clean tree", () => {
    // The close held `.lifecycle.lock` while committing; sweeping the lock
    // into that commit left a tracked deletion behind after release, so
    // every close ended on a dirty tree.
    const { repo, sessionsDir } = closeReady();
    const result = captured(() => close(sessionsDir));
    expect(result.code).toBe(EXIT_OK);
    expect(result.out).toContain("closed (VERIFIED)");
    const committed = execFileSync(
      "git",
      ["-C", repo, "show", "--name-only", "--format=", "HEAD"],
      { encoding: "utf8" },
    );
    expect(committed).toContain("sessions.json");
    expect(committed).not.toContain(".lifecycle.lock");
    expect(porcelain(repo)).toBe("");
  });

  it("prints the rows and writes nothing under --dry-run", () => {
    const { repo, sessionsDir } = closeReady();
    const before = readFileSync(join(sessionsDir, "sessions.json"), "utf8");
    const result = captured(() => close(sessionsDir, { dryRun: true }));
    expect(result.code).toBe(EXIT_OK);
    // Seven since `published_when_releasable` joined them. The count is
    // asserted rather than the row list because what this test is about is
    // the dry run writing nothing; which gates exist is `gates.test.ts`.
    expect(result.out).toContain("7/7 gates pass; nothing written.");
    expect(readFileSync(join(sessionsDir, "sessions.json"), "utf8")).toBe(before);
    expect(porcelain(repo)).toBe("");
  });

  it("refuses at the gates and lands nothing", () => {
    const { repo, sessionsDir } = makeSandboxRepo();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    const result = captured(() => close(sessionsDir));
    expect(result.code).toBe(EXIT_GATE_FAILED);
    expect(result.err).toContain("gate(s) failed");
    const state = readRawSessionState(sessionsDir);
    expect((state?.["sessions"] as Record<string, unknown>[])[0]["status"]).toBe(
      "in-progress",
    );
    void repo;
  });

  it("refuses a second close, naming the status it found instead", () => {
    // The `already closed (noop)` branch reads a TOP-LEVEL `status`, which
    // no v5 record carries -- it is what a pre-collapse set wrote. A v5
    // repository with nothing in flight gets the boundary refusal, and the
    // status it reports is `None` because the key is genuinely absent.
    const { sessionsDir } = closeReady();
    captured(() => close(sessionsDir));
    const again = captured(() => close(sessionsDir));
    expect(again.code).toBe(EXIT_BOUNDARY);
    expect(again.err).toContain("no session is in flight");
    expect(again.err).toContain("(status=None)");
  });

  it("refuses a path that is not a directory before it takes the lock", () => {
    const result = captured(() => close(join(makeTempDir(), "nowhere")));
    expect(result.code).toBe(EXIT_USAGE);
    expect(result.err).toContain("not a directory");
  });
});

// --- cancel and restore -------------------------------------------------------

// Registration, cancellation, restoration and the plan prose are state
// writers: they read and write the ledger's files and ask git only where
// the writers' own guards do. Paths, seeded state and recorded answers
// serve; the close and migrate describes keep their real repositories
// because upstream, digests and history are their subject.
const SEED: Record<string, string> = {
  "docs/sessions/session-plan.md":
    "### Session 1 of 2: First things\n1. Register.\n2. **Build the widget.** Make it real.\n" +
    "3. Cross-provider verification.\n4. Close-out.\n\n" +
    "### Session 2 of 2: Second things\n1. Register.\n2. Polish it.\n",
  "dabbler.yaml":
    "schema_version: 1\n\ntesting:\n  suites:\n    - name: unit\n" +
    "      command: python -m pytest\n      expensive: true\n" +
    "      covers:\n        - src/\n        - tests/\n" +
    "      test_roots:\n        - tests\n      test_glob: \"test_*.py\"\n",
  "src/widget.py": "def widget():\n    return 1\n",
};

function makeStateDirs(): { repo: string; sessionsDir: string } {
  const repo = makeTempDir();
  for (const [rel, text] of Object.entries(SEED)) {
    const path = join(repo, ...rel.split("/"));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text, "utf8");
  }
  gitAnswers([
    [["rev-parse", "--show-toplevel"], { stdout: repo.split("\\").join("/") }],
    [["status", "--porcelain", "-uall"], { stdout: "" }],
    [["status", "--porcelain"], { stdout: "" }],
    [(args) => args[0] === "cat-file" && args[1] === "-e", { code: 0 }],
    [["commit-tree"], { stdout: "c".repeat(40) }],
    [["update-ref"], { code: 0 }],
  ]);
  return { repo, sessionsDir: join(repo, "docs", "sessions") };
}

describe("who a session in flight belongs to", () => {
  /** A session in flight, registered by one engine. */
  function inFlight(): { repo: string; sessionsDir: string } {
    const made = makeStateDirs();
    registerSessionStart(made.sessionsDir, 1, {
      engine: "claude-code",
      provider: "anthropic",
    });
    return made;
  }

  it("continues silently when the identity asked for is the one on the record", () => {
    // The ordinary case, and the one the pull depends on: `dabbler session
    // next --engine ...` called again in the same session re-registers it,
    // and must not become a refusal.
    const { sessionsDir } = inFlight();
    const again = (): number =>
      captured(() => start(sessionsDir, { engine: "claude-code", provider: "anthropic" })).code;
    // Twice, because a pull sends the identity on every registering call and
    // an idempotent path has to stay idempotent.
    expect(again()).toBe(EXIT_OK);
    expect(again()).toBe(EXIT_OK);
    const record = readRawSessionState(sessionsDir)!;
    const session = (record["sessions"] as Record<string, unknown>[])[0]!;
    expect(session["orchestrator"]).toMatchObject({
      engine: "claude-code",
      provider: "anthropic",
    });
  });

  it("keeps a field the continuing call did not state instead of erasing it", () => {
    // The other half of "an omitted value is not stated", and the half the
    // guard alone got wrong: it let the omission THROUGH, and
    // `registerSessionStart` then assigned the orchestrator block whole
    // from what it was given. `buildOrchestratorBlock` drops what it is not
    // given, so a seat's session continued without `--model` passed the
    // guard and lost the model it was registered with -- the record then
    // saying a seat ran the session with no seat.
    const { sessionsDir } = makeStateDirs();
    registerSessionStart(sessionsDir, 1, {
      engine: "copilot",
      provider: "openai",
      model: "gpt-5-6-luna",
      effort: "high",
    });
    const kept = captured(() =>
      start(sessionsDir, { engine: "copilot", provider: "openai" }),
    );
    expect(kept.code).toBe(EXIT_OK);
    const record = readRawSessionState(sessionsDir)!;
    const session = (record["sessions"] as Record<string, unknown>[])[0]!;
    expect(session["orchestrator"]).toMatchObject({
      engine: "copilot",
      provider: "openai",
      model: "gpt-5-6-luna",
      effort: "high",
    });
  });

  it("refuses to re-register the session in flight under a different engine", () => {
    // Start Session pressed a second time and a different engine picked.
    // `registerSessionStart` rewrites the orchestrator block whole, so this
    // used to succeed silently -- and the ledger then said the session was
    // run by an engine that ran only part of it.
    const { sessionsDir } = inFlight();
    const other = captured(() =>
      start(sessionsDir, { engine: "codex", provider: "openai" }),
    );
    expect(other.code).toBe(EXIT_BOUNDARY);
    expect(other.err).toContain("claude-code");
    expect(other.err).toContain("codex");
    // The record is what it was: a refusal that half-wrote the identity
    // would be worse than the overwrite it replaces.
    const record = readRawSessionState(sessionsDir)!;
    const session = (record["sessions"] as Record<string, unknown>[])[0]!;
    expect(session["orchestrator"]).toMatchObject({ engine: "claude-code" });
  });
});

describe("cancelling a session", () => {
  it("refuses one in flight without --force", () => {
    const { sessionsDir } = makeStateDirs();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    const result = captured(() => cancel(sessionsDir, 1, { reason: "stop" }));
    expect(result.code).toBe(EXIT_BOUNDARY);
    expect(result.err).toContain("is in flight");
  });

  it("keeps the status it had, so a restore has something to go back to", () => {
    const { sessionsDir } = makeStateDirs();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    const result = captured(() =>
      cancel(sessionsDir, 1, { reason: "stop", force: true }),
    );
    expect(result.code).toBe(EXIT_OK);
    expect(result.out).toBe(platformNewlines('{"session": 1, "status": "cancelled"}\n'));
    const record = (readRawSessionState(sessionsDir)?.["sessions"] as Record<
      string,
      unknown
    >[])[0];
    expect(record["status"]).toBe("cancelled");
    expect(record["preCancelStatus"]).toBe("in-progress");
    expect(record["cancelledReason"]).toBe("stop");
    expect(typeof record["cancelledAt"]).toBe("string");
  });

  it("refuses a second cancellation of the same session", () => {
    const { sessionsDir } = makeStateDirs();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    captured(() => cancel(sessionsDir, 1, { reason: "stop", force: true }));
    const again = captured(() => cancel(sessionsDir, 1, { reason: "again", force: true }));
    expect(again.code).toBe(EXIT_BOUNDARY);
    expect(again.err).toContain("already cancelled");
  });

  it("refuses a session number the record does not carry", () => {
    const { sessionsDir } = makeStateDirs();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    const result = captured(() => cancel(sessionsDir, 9, { reason: "stop" }));
    expect(result.code).toBe(EXIT_USAGE);
    expect(result.err).toContain("no session 009 on record");
  });
});

describe("restoring a cancelled session", () => {
  it("puts back the status the session actually carried", () => {
    const { sessionsDir } = makeStateDirs();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    captured(() => cancel(sessionsDir, 1, { reason: "stop", force: true }));
    const result = captured(() => restore(sessionsDir, 1, { reason: "resumed" }));
    expect(result.code).toBe(EXIT_OK);
    expect(result.out).toBe(platformNewlines('{"session": 1, "status": "in-progress"}\n'));
    const record = (readRawSessionState(sessionsDir)?.["sessions"] as Record<
      string,
      unknown
    >[])[0];
    expect(record["status"]).toBe("in-progress");
    expect("preCancelStatus" in record).toBe(false);
    expect("cancelledReason" in record).toBe(false);
    expect("cancelledAt" in record).toBe(false);
    expect(record["restoredReason"]).toBe("resumed");
  });

  it("falls back to not-started when the record kept no prior status", () => {
    const { sessionsDir } = makeStateDirs();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    captured(() => cancel(sessionsDir, 1, { reason: "stop", force: true }));
    const path = join(sessionsDir, "sessions.json");
    const state = JSON.parse(readFileSync(path, "utf8")) as {
      sessions: Record<string, unknown>[];
    };
    delete state.sessions[0]["preCancelStatus"];
    writeFileSync(path, JSON.stringify(state, null, 2), "utf8");
    const result = captured(() => restore(sessionsDir, 1));
    expect(result.out).toBe(platformNewlines('{"session": 1, "status": "not-started"}\n'));
  });

  it("refuses a session that was never cancelled", () => {
    const { sessionsDir } = makeStateDirs();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    const result = captured(() => restore(sessionsDir, 1));
    expect(result.code).toBe(EXIT_BOUNDARY);
    expect(result.err).toContain("nothing to restore");
  });
});

// --- plan ---------------------------------------------------------------------

describe("recording the plan prose", () => {
  it("renders the work plan around the prose it was handed", () => {
    const { sessionsDir } = makeStateDirs();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    const result = captured(() => plan(sessionsDir, { body: "Two sessions, then stop." }));
    expect(result.code).toBe(EXIT_OK);
    const rendered = readFileSync(join(sessionsDir, "project-work-plan.md"), "utf8");
    expect(rendered).toContain("Two sessions, then stop.");
  });

  it("refuses when neither the prose nor a file carrying it was given", () => {
    const { sessionsDir } = makeStateDirs();
    const result = captured(() => plan(sessionsDir, {}));
    expect(result.code).toBe(EXIT_USAGE);
    expect(result.err).toContain("inline or from a file");
  });
});

// --- migrate ------------------------------------------------------------------

/** A pre-v5 set-scoped directory, of the shape the migration is for. */
function legacySet(repo: string): string {
  const legacy = join(repo, "docs", "session-sets", "001-first");
  mkdirSync(legacy, { recursive: true });
  writeFileSync(
    join(legacy, "session-state.json"),
    JSON.stringify({
      schemaVersion: 4,
      status: "complete",
      sessions: [
        { number: 1, title: "First", status: "complete", completedAt: "2026-01-01T00:00:00Z" },
        { number: 2, title: "Second", status: "not-started" },
      ],
    }),
    "utf8",
  );
  writeFileSync(join(legacy, "spec.md"), "### Session 1 of 2: First\n", "utf8");
  writeFileSync(join(legacy, "decisions-log.md"), "# Decisions\n", "utf8");
  return legacy;
}

describe("migrating a set-scoped repository", () => {
  it("carries the sessions and the files forward once", () => {
    const target = makeTempDir();
    const repo = join(target, "repo");
    mkdirSync(join(repo, "docs", "sessions"), { recursive: true });
    initRepo(repo, "-b", "main");
    const legacy = legacySet(repo);
    const sessionsDir = join(repo, "docs", "sessions");
    const result = captured(() => migrate(legacy, sessionsDir));
    expect(result.code).toBe(EXIT_OK);
    expect(result.out).toContain('"sessions": 2');
    const state = readRawSessionState(sessionsDir);
    expect(state?.["schemaVersion"]).toBe(5);
    expect((state?.["sessions"] as Record<string, unknown>[])[0]["title"]).toBe("First");
    expect(existsSync(join(sessionsDir, "session-plan.md"))).toBe(true);
    expect(existsSync(join(sessionsDir, "decisions-log.md"))).toBe(true);
  });

  it("reports what would move and writes nothing under --dry-run", () => {
    const target = makeTempDir();
    const repo = join(target, "repo");
    mkdirSync(join(repo, "docs", "sessions"), { recursive: true });
    git(repo, "init", "-q", "-b", "main");
    const legacy = legacySet(repo);
    const sessionsDir = join(repo, "docs", "sessions");
    const result = captured(() => migrate(legacy, sessionsDir, { dryRun: true }));
    expect(result.code).toBe(EXIT_OK);
    expect(result.out).toContain("session-plan.md");
    expect(readRawSessionState(sessionsDir)).toBeNull();
  });

  it("refuses a second migration, which would renumber closed work", () => {
    const target = makeTempDir();
    const repo = join(target, "repo");
    mkdirSync(join(repo, "docs", "sessions"), { recursive: true });
    git(repo, "init", "-q", "-b", "main");
    const legacy = legacySet(repo);
    const sessionsDir = join(repo, "docs", "sessions");
    captured(() => migrate(legacy, sessionsDir));
    const again = captured(() => migrate(legacy, sessionsDir));
    expect(again.code).toBe(EXIT_BOUNDARY);
    expect(again.err).toContain("already carries a session record");
  });

  it("refuses a directory that carries no legacy state at all", () => {
    const { sessionsDir } = makeSandboxRepo();
    const result = captured(() => migrate(makeTempDir(), sessionsDir));
    expect(result.code).toBe(EXIT_USAGE);
    expect(result.err).toContain("no session-state.json");
  });

  it("cancels every open session when the set itself was cancelled", () => {
    // The set said this work would not run, and after the collapse there is
    // nowhere but the session to say so.
    const target = makeTempDir();
    const repo = join(target, "repo");
    mkdirSync(join(repo, "docs", "sessions"), { recursive: true });
    git(repo, "init", "-q", "-b", "main");
    const legacy = join(repo, "docs", "session-sets", "002-stopped");
    mkdirSync(legacy, { recursive: true });
    writeFileSync(
      join(legacy, "session-state.json"),
      JSON.stringify({
        schemaVersion: 4,
        status: "cancelled",
        sessions: [
          { number: 1, title: "Ran", status: "complete" },
          { number: 2, title: "Did not", status: "not-started" },
        ],
      }),
      "utf8",
    );
    const sessionsDir = join(repo, "docs", "sessions");
    expect(captured(() => migrate(legacy, sessionsDir)).code).toBe(EXIT_OK);
    const sessions = readRawSessionState(sessionsDir)?.["sessions"] as Record<
      string,
      unknown
    >[];
    expect(sessions[0]["status"]).toBe("complete");
    expect(sessions[1]["status"]).toBe("cancelled");
    expect(sessions[1]["preCancelStatus"]).toBe("not-started");
  });
});

// --- the module manifest ------------------------------------------------------

describe("the module manifest", () => {
  it("reads an absent file as the designed empty state", () => {
    const root = makeTempDir();
    expect(loadEntries(root)).toEqual([]);
  });

  it("reads a bare `modules:` as an empty list rather than a fault", () => {
    const root = makeTempDir();
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "docs", "modules.yaml"), "modules:\n", "utf8");
    expect(loadEntries(root)).toEqual([]);
  });

  it("refuses a document that is not a mapping", () => {
    const root = makeTempDir();
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "docs", "modules.yaml"), "- one\n- two\n", "utf8");
    expect(() => loadEntries(root)).toThrow(ManifestError);
  });

  it("rejects an unknown key rather than ignoring it", () => {
    // A misspelled `codeRoot` that was silently dropped would leave the
    // module bounded by something other than what was written.
    expect(() =>
      parseEntries({ modules: [{ slug: "a", codeRoot: ["src"] }] }),
    ).toThrow(/unknown key\(s\) codeRoot/);
  });

  it("rejects a mistyped list field", () => {
    expect(() => parseEntries({ modules: [{ slug: "a", codeRoots: "src" }] })).toThrow(
      /must be a list of strings/,
    );
  });

  it("rejects a duplicate slug", () => {
    expect(() =>
      parseEntries({ modules: [{ slug: "a" }, { slug: "a" }] }),
    ).toThrow(/duplicate slug 'a'/);
  });

  it("defaults the title to the slug and drops an empty plan path", () => {
    const [entry] = parseEntries({ modules: [{ slug: "a", title: "  ", planPath: " " }] });
    expect(entry.title).toBe("a");
    expect(entry.planPath).toBeNull();
  });

  it("appends an entry, echoes it, and keeps the file loadable", () => {
    const root = makeTempDir();
    const result = captured(() =>
      create(root, "greeter", "Greeter", {
        planPath: "docs/modules/greeter.md",
        codeRoots: ["src/greeter"],
        specSections: ["docs/reference.md#greeting"],
      }),
    );
    expect(result.code).toBe(EXIT_OK);
    expect(result.out).toContain('"slug": "greeter"');
    const entries = loadEntries(root);
    expect(entries).toHaveLength(1);
    expect(entries[0].codeRoots).toEqual(["src/greeter"]);
    expect(entries[0].specSections).toEqual(["docs/reference.md#greeting"]);
  });

  it("omits a scope field nobody supplied rather than writing an empty list", () => {
    const root = makeTempDir();
    captured(() => create(root, "bare", "Bare"));
    const doc = loadManifest(join(root, "docs", "modules.yaml"));
    expect(Object.keys((doc["modules"] as Record<string, unknown>[])[0])).toEqual([
      "slug",
      "title",
    ]);
  });

  it("refuses a slug the manifest already declares", () => {
    const root = makeTempDir();
    captured(() => create(root, "greeter", "Greeter"));
    const again = captured(() => create(root, "greeter", "Again"));
    expect(again.code).toBe(1);
    expect(again.err).toContain("already exists");
  });

  it("refuses to append to a manifest that does not parse", () => {
    const root = makeTempDir();
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "docs", "modules.yaml"), "modules:\n- slug: [\n", "utf8");
    const result = captured(() => create(root, "greeter", "Greeter"));
    expect(result.code).toBe(1);
    expect(result.err).toContain("modules create: refused");
  });

  it("answers null for a slug the manifest does not declare", () => {
    const root = makeTempDir();
    captured(() => create(root, "greeter", "Greeter"));
    expect(findEntry(root, "greeter")?.title).toBe("Greeter");
    expect(findEntry(root, "absent")).toBeNull();
    expect(findEntry(root, "")).toBeNull();
  });

  it("writes the manifest with LF endings on every platform", () => {
    const root = makeTempDir();
    captured(() => create(root, "greeter", "Greeter"));
    const raw = readFileSync(join(root, "docs", "modules.yaml"), "utf8");
    expect(raw).not.toContain("\r\n");
  });
});
