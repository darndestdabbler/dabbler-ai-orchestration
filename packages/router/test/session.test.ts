// The session lifecycle's judgement half: which session a `start` may have
// and under whose identity, what a cancellation records and a restoration
// puts back, and the plan prose.
//
// Every rule here is a function of a record, so the tests hand it one. The
// three verbs that write go through the state directory with git answering
// from a table -- no checkout, no process. The close is the whole pipeline
// and belongs to walk-session.test.ts.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { capture } from "../src/output.ts";
import { platformNewlines } from "../src/journal.ts";
import { checkPublishedWhenReleasable } from "../src/gates.ts";
import { appendPackaging } from "../src/ledger.ts";
import {
  SOURCE_API,
  SOURCE_SEAT,
  TRANSPORT_API,
  TRANSPORT_SEAT,
  writeBlock,
  type CatalogModel,
} from "../src/catalog.ts";
import {
  TRANSPORT_COPILOT_CLI,
  TRANSPORT_OFFLINE,
  loadConfig,
  withSessionReviewers,
  withSessionVehicle,
  resetProjectRootCache,
} from "../src/config.ts";
import { writePreferences } from "../src/preferences.ts";
import { setSeatIdentity } from "../src/transports/copilot.ts";
import {
  SETTING_AUTHORING_MODEL,
  SETTING_REVIEWER_MODEL,
  SETTING_REVIEWER_TRANSPORT,
  SETTING_TRANSPORT,
  settingValue,
  writeSettings,
} from "../src/settings.ts";
import { readRawSessionState } from "../src/progress.ts";
import {
  EXIT_BOUNDARY,
  EXIT_OK,
  EXIT_USAGE,
  ENGINE_MARKERS,
  applyCancellation,
  applyRestoration,
  asAPersonsClick,
  callerIsEngine,
  cancel,
  carryForward,
  close,
  configuredModelRefusal,
  identityClash,
  judgeCancellation,
  judgeRestoration,
  judgeStartBoundary,
  declare,
  holdRelease,
  interrupt,
  personIsPresent,
  plan,
  repairedPaths,
  report,
  restore,
  reviewingVehicleRefusal,
  setSessionUseReading,
  start,
  steppedOverLines,
  type SequenceFacts,
} from "../src/session.ts";
import { loopPath, readInstruction, readReport, recordRepair, writeInstruction, writeRun } from "../src/driver.ts";
import {
  amendmentEntries,
  readTaskDeclaration,
  recordAmendment,
  recordSessionVerification,
  registerSessionStart,
  releasabilityOf,
  sessionIsReleasable,
  workBegunRefusal,
} from "../src/writers.ts";
import { cleanRepoAnswers, gitAnswers, makeAnsweredSandbox, seed, tempDir } from "./support/answers.ts";
import { SESSION_USE_STAND_IN } from "./support/repo.ts";

/** One verb's exit code and everything it wrote, so a refusal can be read. */
async function run(
  verb: () => number | Promise<number>,
): Promise<{ code: number; out: string; err: string }> {
  const collected = await capture(() => Promise.resolve(verb()));
  return { code: collected.value, out: collected.stdout, err: collected.stderr };
}

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

/** A state directory the writers can use, with git answering from a table. */
function stateDir(): { repo: string; sessionsDir: string; restore: () => void } {
  const repo = tempDir("state-");
  seed(repo, SEED);
  return {
    repo,
    sessionsDir: join(repo, "docs", "sessions"),
    restore: cleanRepoAnswers(repo),
  };
}

function sessionOf(sessionsDir: string, index = 0): Record<string, unknown> {
  const record = readRawSessionState(sessionsDir)!;
  return (record["sessions"] as Record<string, unknown>[])[index]!;
}

// --- Which session a start may have -------------------------------------------

describe("the boundary a start has to clear", () => {
  function facts(overrides: Partial<SequenceFacts> = {}): SequenceFacts {
    return {
      current: null,
      completed: [],
      cancelled: new Set<number>(),
      requested: null,
      ...overrides,
    };
  }

  it("takes the next sequential session when the caller names none", () => {
    assert.equal(judgeStartBoundary(facts()).requested, 1);
    assert.equal(judgeStartBoundary(facts({ completed: [1, 2] })).requested, 3);
  });

  it("takes the session in flight when one is, so a second start continues it", () => {
    // The ordinary way a pull continues: `session next --engine ...` called
    // again in the same session re-registers it.
    const ruling = judgeStartBoundary(facts({ current: 4, completed: [1, 2, 3] }));
    assert.deepEqual([ruling.requested, ruling.refusal], [4, null]);
  });

  it("refuses another session while one is in flight", () => {
    const ruling = judgeStartBoundary(facts({ current: 2, requested: 3, completed: [1] }));
    assert.match(String(ruling.refusal), /session 002 is still in flight/);
    assert.equal(ruling.exitCode, EXIT_BOUNDARY);
  });

  it("never re-opens a closed session", () => {
    const ruling = judgeStartBoundary(facts({ completed: [1, 2], requested: 1 }));
    assert.match(String(ruling.refusal), /already closed/);
  });

  it("refuses to start a cancelled session, naming the verb that undoes it", () => {
    // Starting it would erase the cancellation and the reason somebody
    // recorded for it.
    const ruling = judgeStartBoundary(facts({ cancelled: new Set([1]), requested: 1 }));
    assert.match(String(ruling.refusal), /dabbler session restore 1/);
  });

  it("steps over a cancelled session rather than leaving a hole", () => {
    // Cancelled work is settled, so "next" is the first session still
    // available to run rather than one past the highest closed number.
    assert.equal(
      judgeStartBoundary(facts({ completed: [1], cancelled: new Set([2, 3]) })).requested,
      4,
    );
  });

  it("refuses one out of sequence, naming the one it expected", () => {
    const ruling = judgeStartBoundary(facts({ completed: [1], requested: 5 }));
    assert.match(String(ruling.refusal), /not the next sequential session \(expected 2/);
  });
});

// --- Whose session it is ------------------------------------------------------

describe("the identity a session in flight was registered under", () => {
  const asking = (overrides: Record<string, unknown> = {}) => ({
    engine: "claude-code",
    provider: null,
    model: null,
    effort: null,
    ...overrides,
  });
  const recorded = (block: Record<string, unknown> | null): Record<string, unknown> | null =>
    block === null ? null : { orchestrator: block };

  it("says nothing when the call agrees with the record", () => {
    assert.equal(
      identityClash(recorded({ engine: "claude-code", provider: "anthropic" }), asking()),
      null,
    );
  });

  it("refuses a value that contradicts the record", () => {
    // Start pressed a second time with a different engine picked: the block
    // is rewritten whole, so the ledger would then say this session was run
    // by an engine that ran only part of it.
    const clash = identityClash(
      recorded({ engine: "claude-code" }),
      asking({ engine: "codex" }),
    );
    assert.match(String(clash), /registered with engine 'claude-code', not 'codex'/);
  });

  it("reads an omission on either side as not stated, never as a difference", () => {
    // A seat's identity resolves only with a model, so continuing without
    // repeating `--model` has to be a continuation.
    assert.equal(
      identityClash(recorded({ engine: "copilot", model: "gpt-5-6-luna" }), asking({ engine: "copilot" })),
      null,
    );
  });

  it("ignores effort, which is a dial on the same worker", () => {
    assert.equal(
      identityClash(
        recorded({ engine: "copilot", effort: "high" }),
        asking({ engine: "copilot", effort: "low" }),
      ),
      null,
    );
  });

  it("keeps a field the continuing call did not state instead of erasing it", () => {
    // The half the guard alone got wrong: it let the omission THROUGH, and
    // the write then assigned the block whole from what it was given -- so a
    // seat's session continued without `--model` lost the model it was
    // registered with, the record then saying a seat ran it with no seat.
    const kept = carryForward(
      recorded({ engine: "copilot", provider: "openai", model: "gpt-5-6-luna", effort: "high" }),
      asking({ engine: "copilot", provider: "openai" }),
    );
    assert.deepEqual(kept, {
      engine: "copilot",
      provider: "openai",
      model: "gpt-5-6-luna",
      effort: "high",
    });
  });

  it("takes what the call states over what the record holds", () => {
    const stated = carryForward(
      recorded({ engine: "copilot", model: "old" }),
      asking({ engine: "copilot", model: "new" }),
    );
    assert.equal(stated.model, "new");
  });
});

describe("what a start refuses before a session exists", () => {
  it("refuses Gemini CLI as an engine, names the ones that remain, and writes nothing", async () => {
    const state = stateDir();
    try {
      const refused = await run(() =>
        start(state.sessionsDir, { engine: "gemini", provider: "google" }),
      );
      assert.equal(refused.code, EXIT_USAGE);
      assert.match(refused.err, /Gemini CLI is no longer a supported engine/);
      assert.match(refused.err, /claude-code or copilot/);
      assert.match(refused.err, /Google models still review/);
      assert.equal(readRawSessionState(state.sessionsDir), null);
    } finally {
      state.restore();
    }
  });

  it("refuses a tree that already carries work, in the declaration's own words", async () => {
    // The sample's session 1 registered over a change, answered its plan,
    // and was paused inside the same `next` when the declaration refused the
    // tree -- a condition fully known at `start`. So `start` asks the same
    // question, with the same sentence, before any work and before the pull.
    const state = stateDir();
    const dirty = gitAnswers([
      [["rev-parse", "--show-toplevel"], { stdout: state.repo.split("\\").join("/") }],
      [["status", "--porcelain"], { stdout: "?? .vscode/launch.json\n" }],
    ]);
    try {
      const refused = await run(() =>
        start(state.sessionsDir, { engine: "claude-code", provider: "anthropic" }),
      );
      assert.notEqual(refused.code, EXIT_OK);
      assert.ok(refused.err.includes(`start: refused -- ${workBegunRefusal(1, [".vscode/launch.json"])}`), refused.err);
      assert.match(refused.err, /--commit-changes .*--undo-changes/);
      assert.equal(readRawSessionState(state.sessionsDir), null);
    } finally {
      dirty();
      state.restore();
    }
  });

  it("commits and pushes the uncommitted changes with --commit-changes, then registers", async () => {
    const state = stateDir();
    const calls: string[][] = [];
    let committed = false;
    const answers = cleanRepoAnswers(state.repo, [
      [(args) => { calls.push([...args]); return false; }, {}],
      [["status", "--porcelain"], () => ({ stdout: committed ? "" : " M src/widget.py\n?? notes.txt\n" })],
      [["commit"], () => { committed = true; return { code: 0 }; }],
      [["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], { stdout: "origin/main" }],
      [["push"], { code: 0 }],
    ]);
    try {
      const started = await run(() =>
        start(state.sessionsDir, { engine: "claude-code", provider: "anthropic", commitChanges: true }),
      );
      assert.equal(started.code, EXIT_OK, started.err);
      assert.ok(calls.some((args) => args.join(" ") === "add -- src/widget.py notes.txt"), JSON.stringify(calls));
      assert.ok(calls.some((args) => args[0] === "commit" && /before session 1 started/.test(String(args[2]))));
      assert.ok(calls.some((args) => args[0] === "push"));
      assert.equal(sessionOf(state.sessionsDir)["status"], "in-progress");
    } finally {
      answers();
      state.restore();
    }
  });

  it("undoes the uncommitted changes with --undo-changes, keeping a copy outside the repository, then registers", async () => {
    const state = stateDir();
    seed(state.repo, { "src/widget.py": "def widget():\n    return 2\n", "notes.txt": "keep me\n" });
    const calls: string[][] = [];
    const answers = cleanRepoAnswers(state.repo, [
      [(args) => { calls.push([...args]); return false; }, {}],
      [["status", "--porcelain"], () => ({ stdout: existsSync(join(state.repo, "notes.txt")) ? " M src/widget.py\n?? notes.txt\n" : "" })],
      [["cat-file", "-e", "HEAD:src/widget.py"], { code: 0 }],
      [["cat-file", "-e"], { code: 128 }],
      [["checkout", "HEAD", "--"], { code: 0 }],
    ]);
    try {
      const started = await run(() =>
        start(state.sessionsDir, { engine: "claude-code", provider: "anthropic", undoChanges: true }),
      );
      assert.equal(started.code, EXIT_OK, started.err);
      const folder = /a copy of each file is in (.+)$/m.exec(started.out)?.[1] ?? "";
      assert.ok(folder !== "" && !folder.startsWith(state.repo), started.out);
      assert.equal(readFileSync(join(folder, "notes.txt"), "utf8"), "keep me\n");
      assert.equal(readFileSync(join(folder, "src", "widget.py"), "utf8"), "def widget():\n    return 2\n");
      assert.equal(existsSync(join(state.repo, "notes.txt")), false);
      assert.ok(calls.some((args) => args.join(" ") === "checkout HEAD -- src/widget.py"), JSON.stringify(calls));
      assert.equal(sessionOf(state.sessionsDir)["status"], "in-progress");
    } finally {
      answers();
      state.restore();
    }
  });

  it("registers with the settings file the pane wrote the only change in the tree", async () => {
    // The tutorial's session 5 was refused over the one line the
    // Configuration pane had just written, and `dabbler configure` -- the
    // command another refusal named -- writes the same file.
    const state = stateDir();
    const settings = cleanRepoAnswers(state.repo, [
      [["status", "--porcelain"], { stdout: " M .vscode/settings.json\n" }],
    ]);
    try {
      const registered = await run(() =>
        start(state.sessionsDir, { engine: "claude-code", provider: "anthropic" }),
      );
      assert.equal(registered.code, EXIT_OK, registered.err);
      assert.equal(readRawSessionState(state.sessionsDir) === null, false);
    } finally {
      settings();
      state.restore();
    }
  });

  it("says in one line when the origin does not answer, and registers anyway", async () => {
    // The tutorial's origin was a hosting page's address, and the push at
    // the land was the first thing to meet it -- after all the work. With an
    // upstream set, the pull is not attempted against it either.
    const state = stateDir();
    const unanswered = cleanRepoAnswers(state.repo, [
      [["remote", "get-url", "origin"], { stdout: "https://dev.azure.com/org/project/_settings/repositories?repo=abc" }],
      [["ls-remote", "--heads", "origin"], { code: 128, stderr: "fatal: unable to update url base from redirection" }],
      [["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], { stdout: "origin/main" }],
      [["pull"], { code: 1, stderr: "fatal: unable to update url base from redirection" }],
    ]);
    try {
      const started = await run(() =>
        start(state.sessionsDir, { engine: "claude-code", provider: "anthropic" }),
      );
      assert.equal(started.code, EXIT_OK, started.err);
      // Exactly one line about the remote: the origin's, and no pull line
      // after it, whatever words a pull line would use.
      const lines = started.out.split("\n").filter((line) => /origin|remote|pull/i.test(line));
      assert.equal(lines.length, 1, started.out);
      assert.match(lines[0] ?? "", /did not answer as a git remote \(fatal: unable to update url base from redirection\)/);
      assert.match(lines[0] ?? "", /git remote set-url origin/);
      assert.equal(sessionOf(state.sessionsDir)["status"], "in-progress");
    } finally {
      unanswered();
      state.restore();
    }
  });

  it("starts on a machine vehicle it cannot reach when the reviewing vehicle does not use it", async () => {
    // Authoring runs through the engine's own CLI and the reviewers resolve
    // their own vehicle, so the machine value decides nothing for this
    // session unless it is also the reviewing one.
    const state = stateDir();
    setSessionUseReading((config, checkout, _engine, provider) =>
      reviewingVehicleRefusal(config, checkout, provider),
    );
    try {
      writeSettings(state.repo, {
        [SETTING_TRANSPORT]: TRANSPORT_COPILOT_CLI,
        [SETTING_REVIEWER_TRANSPORT]: TRANSPORT_OFFLINE,
      });
      resetProjectRootCache();
      const started = await run(() =>
        start(state.sessionsDir, { engine: "claude-code", provider: "anthropic" }),
      );
      assert.equal(started.code, EXIT_OK, started.err);
      assert.ok(!started.err.includes("copilot-cli"), started.err);
    } finally {
      setSessionUseReading(SESSION_USE_STAND_IN);
      resetProjectRootCache();
      state.restore();
    }
  });

  it("starts with the vehicle and reviewer the START names, where the repository's saved reviewer could not review this author", async () => {
    // Through `start` itself, every check in its order. The saved reviewer is
    // the worst case -- the authoring model itself, on the direct API -- and
    // the start names the seat and a reviewer only the seat lists.
    const state = stateDir();
    // Exactly these two keys and no third: a catalog block is believed only
    // for the key set it was read with, and a suite that left the developer's
    // own third key in place would judge nothing and pass.
    const every = ["DABBLER_ANTHROPIC_API_KEY", "DABBLER_OPENAI_API_KEY", "DABBLER_GEMINI_API_KEY"];
    const held = every.map((name) => [name, process.env[name]] as const);
    for (const name of every) delete process.env[name];
    for (const name of every.slice(0, 2)) process.env[name] = "k";
    const seat = { host: "https://github.com", login: "someone" };
    const model = (id: string, provider: string): CatalogModel => ({
      id,
      provider,
      provider_source: "vendor-endpoint",
      display_name: id,
      enabled: true,
      price_category: null,
      cost: null,
      listed_at: "2026-09-11T00:00:00Z",
    });
    setSessionUseReading((config, checkout, _engine, provider) => reviewingVehicleRefusal(config, checkout, provider));
    try {
      setSeatIdentity(seat);
      writeBlock(TRANSPORT_API, {
        refreshed_at: "2026-09-11T00:00:00Z",
        source: SOURCE_API,
        scope: { providers: ["anthropic", "openai"] },
        models: [model("claude-opus-5", "anthropic"), model("gpt-5.6-sol", "openai")],
        retired: [],
      });
      writeBlock(TRANSPORT_SEAT, {
        refreshed_at: "2026-09-11T00:00:00Z",
        source: SOURCE_SEAT,
        scope: { seat_host: seat.host, seat_login: seat.login },
        models: [model("gpt-5.6-luna", "openai")],
        retired: [],
      });
      writeSettings(state.repo, {
        [SETTING_REVIEWER_TRANSPORT]: TRANSPORT_API,
        [SETTING_REVIEWER_MODEL]: "claude-opus-5",
      });
      resetProjectRootCache();
      const author = { engine: "claude-code", provider: "anthropic", model: "claude-opus-5", refresh: async () => [] };

      // As the repository is saved, this author cannot be reviewed: refused.
      const refused = await run(() => start(state.sessionsDir, author));
      assert.notEqual(refused.code, EXIT_OK);

      // With the vehicle and the reviewer the start names, it registers, and
      // the session's row carries them -- the repository's settings untouched.
      const started = await run(() =>
        start(state.sessionsDir, { ...author, reviewerTransport: TRANSPORT_COPILOT_CLI, reviewerModel: "gpt-5.6-luna" }),
      );
      assert.equal(started.code, EXIT_OK, started.err);
      const row = sessionOf(state.sessionsDir);
      assert.equal(row["reviewerTransport"], TRANSPORT_COPILOT_CLI);
      assert.equal(row["reviewerModel"], "gpt-5.6-luna");
      assert.equal(settingValue(state.repo, SETTING_REVIEWER_MODEL), "claude-opus-5");

      // **A continuation names none of them, and that is "not stated".**
      // Re-registering the session in flight is how a pull carries on: it is
      // judged on what the session's START named, not on the repository's
      // saved reviewer it never used, and its row keeps what it carried.
      const continued = await run(() => start(state.sessionsDir, author));
      assert.equal(continued.code, EXIT_OK, continued.err);
      const after = sessionOf(state.sessionsDir);
      assert.equal(after["reviewerTransport"], TRANSPORT_COPILOT_CLI);
      assert.equal(after["reviewerModel"], "gpt-5.6-luna");
    } finally {
      setSeatIdentity(null);
      setSessionUseReading(SESSION_USE_STAND_IN);
      resetProjectRootCache();
      for (const [name, value] of held) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
      state.restore();
    }
  });

  it("reads the catalog before any check that can refuse", async () => {
    // A machine that had never read its catalog refused a seat's model the
    // refresh would have recorded, and told the operator to run it by hand.
    const state = stateDir();
    setSessionUseReading((config, checkout, _engine, provider) =>
      reviewingVehicleRefusal(config, checkout, provider),
    );
    try {
      writeSettings(state.repo, { [SETTING_REVIEWER_TRANSPORT]: TRANSPORT_COPILOT_CLI });
      resetProjectRootCache();
      let refreshed = false;
      const refused = await run(() =>
        start(state.sessionsDir, {
          engine: "claude-code",
          provider: "anthropic",
          refresh: async () => {
            refreshed = true;
            return [];
          },
        }),
      );
      assert.notEqual(refused.code, EXIT_OK);
      assert.equal(refreshed, true);
    } finally {
      setSessionUseReading(SESSION_USE_STAND_IN);
      resetProjectRootCache();
      state.restore();
    }
  });

  it("takes the authoring model this checkout chose when the call names none", async () => {
    // The other half of the same rule: a setting no reader consumes is a
    // control that reports success and changes nothing.
    const state = stateDir();
    try {
      writeSettings(state.repo, { [SETTING_AUTHORING_MODEL]: "claude-opus-5" });
      resetProjectRootCache();
      const started = await run(() =>
        start(state.sessionsDir, { engine: "claude-code", provider: "anthropic" }),
      );
      assert.equal(started.code, EXIT_OK, started.err);
      assert.equal(
        (sessionOf(state.sessionsDir)["orchestrator"] as Record<string, unknown>)["model"],
        "claude-opus-5",
      );
    } finally {
      resetProjectRootCache();
      state.restore();
    }
  });
});

describe("why a start cannot reach its reviewer, and only the ways forward that fix it", () => {
  const KEYS = ["DABBLER_ANTHROPIC_API_KEY", "DABBLER_OPENAI_API_KEY", "DABBLER_GEMINI_API_KEY"];
  const SEAT = { host: "https://github.com", login: "someone" };

  function row(id: string, provider: string): CatalogModel {
    return {
      id,
      provider,
      provider_source: "vendor-endpoint",
      display_name: id,
      enabled: true,
      price_category: null,
      cost: null,
      listed_at: "2026-09-11T00:00:00Z",
    };
  }

  /** A checkout whose reviewing vehicle is `vehicle`, with only these keys set. */
  function checkout(vehicle: string, keys: string[]): { root: string; restore: () => void } {
    const root = tempDir("reviewer-stop-");
    const held = KEYS.map((name) => [name, process.env[name]] as const);
    for (const name of KEYS) delete process.env[name];
    for (const name of keys) process.env[name] = "k";
    const ungit = gitAnswers([[["rev-parse", "--show-toplevel"], { stdout: root.split("\\").join("/") }]]);
    writeSettings(root, { [SETTING_REVIEWER_TRANSPORT]: vehicle });
    resetProjectRootCache();
    return {
      root,
      restore: () => {
        writePreferences({ role: "reviewer", selected: "" });
        ungit();
        resetProjectRootCache();
        for (const [name, value] of held) {
          if (value === undefined) delete process.env[name];
          else process.env[name] = value;
        }
      },
    };
  }

  it("offers another vendor on either side for a vendor conflict, and no key or vehicle", () => {
    const { root, restore } = checkout(TRANSPORT_API, ["DABBLER_OPENAI_API_KEY"]);
    try {
      writeBlock(TRANSPORT_API, {
        refreshed_at: "2026-09-11T00:00:00Z",
        source: SOURCE_API,
        scope: { providers: ["openai"] },
        models: [row("gpt-5.6-sol", "openai")],
        retired: [],
      });
      writePreferences({ role: "reviewer", selected: "gpt-5.6-sol" });
      const refusal = String(reviewingVehicleRefusal(loadConfig(undefined, root), root, "openai").refusal);
      assert.match(refusal, /never from the author's vendor/);
      assert.match(refusal, /--reviewer-model/);
      assert.match(refusal, /--authoring-model/);
      assert.doesNotMatch(refusal, /auth set|--reviewer-transport|transport\.profile|\['/);
    } finally {
      restore();
    }
  });

  it("tells a seat never read from a seat that lists nothing, and offers signing in only for the first", () => {
    const { root, restore } = checkout(TRANSPORT_COPILOT_CLI, []);
    try {
      setSeatIdentity(SEAT);
      writeBlock(TRANSPORT_SEAT, {
        refreshed_at: "2026-09-11T00:00:00Z",
        source: SOURCE_SEAT,
        scope: { seat_host: SEAT.host, seat_login: SEAT.login },
        models: [],
        retired: [],
      });
      const empty = String(reviewingVehicleRefusal(loadConfig(undefined, root), root, "anthropic").refusal);
      assert.match(empty, /lists no model/);
      // A block recorded for another seat is a seat this machine has not read.
      setSeatIdentity({ host: SEAT.host, login: "someone-else" });
      const unread = String(reviewingVehicleRefusal(loadConfig(undefined, root), root, "anthropic").refusal);
      assert.match(unread, /has not read/);
      assert.match(unread, /dabbler discovery refresh/);
      assert.match(unread, /copilot login/);
      assert.doesNotMatch(unread, /auth set|--reviewer-model/);
      assert.notEqual(empty, unread);
    } finally {
      setSeatIdentity(null);
      restore();
    }
  });

  it("says which reason keeps a chosen reviewer off its list", () => {
    const { root, restore } = checkout(TRANSPORT_API, ["DABBLER_ANTHROPIC_API_KEY", "DABBLER_OPENAI_API_KEY"]);
    try {
      writeBlock(TRANSPORT_API, {
        refreshed_at: "2026-09-11T00:00:00Z",
        source: SOURCE_API,
        scope: { providers: ["anthropic", "openai"] },
        models: [row("claude-opus-5", "anthropic"), row("gpt-5.6-terra", "openai")],
        retired: [],
      });
      writePreferences({ role: "reviewer", selected: "claude-opus-5" });
      assert.match(
        String(configuredModelRefusal(root, "claude-opus-5", "claude-code")),
        /the authoring model itself/,
      );
      writePreferences({ role: "reviewer", selected: "no-such-model" });
      assert.match(
        String(configuredModelRefusal(root, "claude-opus-5", "claude-code")),
        /vehicle does not list it/,
      );
    } finally {
      restore();
    }
  });

  it("judges a start on the reviewing vehicle IT names, whose list is where its reviewers were chosen from", () => {
    // The reviewers a session is started with are picked from a vehicle's
    // list. Judged on the repository's saved vehicle instead, a reviewer only
    // the seat lists is "not listed" -- refused for being chosen correctly.
    const { root, restore } = checkout(TRANSPORT_API, ["DABBLER_ANTHROPIC_API_KEY", "DABBLER_OPENAI_API_KEY"]);
    try {
      setSeatIdentity(SEAT);
      writeBlock(TRANSPORT_API, {
        refreshed_at: "2026-09-11T00:00:00Z",
        source: SOURCE_API,
        scope: { providers: ["anthropic", "openai"] },
        models: [row("claude-haiku-4.5", "anthropic"), row("gpt-5.6-sol", "openai")],
        retired: [],
      });
      writeBlock(TRANSPORT_SEAT, {
        refreshed_at: "2026-09-11T00:00:00Z",
        source: SOURCE_SEAT,
        scope: { seat_host: SEAT.host, seat_login: SEAT.login },
        models: [row("gpt-5.6-luna", "openai")],
        retired: [],
      });
      const named = withSessionReviewers(loadConfig(undefined, root), { reviewer: "gpt-5.6-luna" });
      // On the repository's own vehicle, the direct API, nothing lists it.
      assert.match(String(reviewingVehicleRefusal(named, root, "anthropic").refusal), /reviewing vehicle 'api'/);
      // On the vehicle the start names, the seat, it is the seat's own model.
      assert.equal(reviewingVehicleRefusal(withSessionVehicle(named, TRANSPORT_COPILOT_CLI), root, "anthropic").refusal, null);
    } finally {
      setSeatIdentity(null);
      restore();
    }
  });

  it("judges the reviewers THIS start names, the auxiliary included, over the repository's saved ones", () => {
    // The operator started one session with a Claude author in a repository
    // whose saved Primary Reviewer is Claude's, and was refused with no way
    // to name another for that session. And a one-session author and primary
    // routinely land on the saved auxiliary's vendor, which nothing said
    // until the first dispute.
    const { root, restore } = checkout(TRANSPORT_API, [
      "DABBLER_ANTHROPIC_API_KEY",
      "DABBLER_OPENAI_API_KEY",
      "DABBLER_GEMINI_API_KEY",
    ]);
    try {
      writeBlock(TRANSPORT_API, {
        refreshed_at: "2026-09-11T00:00:00Z",
        source: SOURCE_API,
        scope: { providers: ["anthropic", "google", "openai"] },
        models: [
          row("claude-haiku-4.5", "anthropic"),
          row("gpt-5.6-terra", "openai"),
          row("gpt-5.6-sol", "openai"),
          row("gemini-3.8-flash", "google"),
        ],
        retired: [],
      });
      writePreferences({ role: "reviewer", selected: "claude-haiku-4.5" });
      const config = loadConfig(undefined, root);
      const refusalFor = (named: Record<string, string>): string | null =>
        reviewingVehicleRefusal(withSessionReviewers(config, named), root, "anthropic").refusal;

      // The saved reviewer is the author's vendor: refused, as it always was.
      assert.match(String(refusalFor({})), /never from the author's vendor/);
      // A primary named for this session is the one judged.
      assert.equal(refusalFor({ reviewer: "gpt-5.6-terra" }), null);
      assert.match(String(refusalFor({ reviewer: "claude-haiku-4.5" })), /never from the author's vendor/);
      // A named auxiliary is judged at the start: a third vendor passes, the
      // named primary's and the author's are refused AS the auxiliary.
      assert.equal(refusalFor({ reviewer: "gpt-5.6-terra", "auxiliary-reviewer": "gemini-3.8-flash" }), null);
      for (const taken of ["gpt-5.6-sol", "claude-haiku-4.5"]) {
        const refused = String(refusalFor({ reviewer: "gpt-5.6-terra", "auxiliary-reviewer": taken }));
        assert.match(refused, /^the Auxiliary Reviewer cannot be reached/, refused);
        assert.match(refused, /third voice/, refused);
      }

      // **An auxiliary NOBODY named is not judged at a start, whatever is
      // saved.** A machine that reaches two vendors has no third voice for any
      // session, and every ordinary start there registers: the auxiliary is
      // resolved, and refused, at a dispute. So a start that names a primary
      // and no auxiliary registers too -- with the repository's saved
      // auxiliary on the author's vendor, and again on the named primary's.
      for (const saved of ["claude-haiku-4.5", "gpt-5.6-sol"]) {
        writePreferences({ role: "auxiliary-reviewer", selected: saved });
        const unnamed = withSessionReviewers(loadConfig(undefined, root), { reviewer: "gpt-5.6-terra" });
        assert.equal(reviewingVehicleRefusal(unnamed, root, "anthropic").refusal, null, saved);
        // The same saved auxiliary, NAMED for the session, is what is refused.
        assert.match(String(refusalFor({ reviewer: "gpt-5.6-terra", "auxiliary-reviewer": saved })), /third voice/);
      }
    } finally {
      writePreferences({ role: "reviewer", selected: "" });
      writePreferences({ role: "auxiliary-reviewer", selected: "" });
      restore();
    }
  });

  it("reads a chosen reviewer by the model it names, whichever spelling of it the list uses", () => {
    // The operator picked a vendor's dated id on a machine whose list spells
    // the same model its own way. The pane, `configuration explain` and the
    // dispatch all took it; the start alone compared the strings.
    const { root, restore } = checkout(TRANSPORT_API, ["DABBLER_ANTHROPIC_API_KEY", "DABBLER_OPENAI_API_KEY"]);
    try {
      writeBlock(TRANSPORT_API, {
        refreshed_at: "2026-09-11T00:00:00Z",
        source: SOURCE_API,
        scope: { providers: ["anthropic", "openai"] },
        models: [row("claude-haiku-4.5", "anthropic"), row("gpt-5.6-terra", "openai")],
        retired: [],
      });
      writePreferences({ role: "reviewer", selected: "claude-haiku-4-5-20251001" });
      assert.equal(configuredModelRefusal(root, "gpt-5.6-terra", "codex"), null);
      // A model no spelling of which is listed is still refused.
      writePreferences({ role: "reviewer", selected: "claude-haiku-9-20251001" });
      assert.match(String(configuredModelRefusal(root, "gpt-5.6-terra", "codex")), /does not list it/);
    } finally {
      restore();
    }
  });
});

describe("registering a session", () => {
  it("moves an earlier run's record for the same number under superseded-runs, and names it", async () => {
    // A reset or a renumbering reuses a number, and the loop took the old
    // completed run over as the new session's.
    const state = stateDir();
    seed(state.repo, {
      ".dabbler/runs/s1/driver/run.json": '{"phase": "complete"}\n',
      ".dabbler/runs/s1/rounds.jsonl": "{}\n",
    });
    try {
      const started = await run(() =>
        start(state.sessionsDir, { engine: "claude-code", provider: "anthropic" }),
      );
      assert.equal(started.code, EXIT_OK, started.err);
      const folder = /record for session \d+ was moved to (.+)$/m.exec(started.out)?.[1] ?? "";
      assert.ok(folder.startsWith(join(state.repo, ".dabbler", "superseded-runs", "s1-")), started.out);
      assert.equal(readFileSync(join(folder, "driver", "run.json"), "utf8"), '{"phase": "complete"}\n');
      assert.equal(existsSync(join(state.repo, ".dabbler", "runs", "s1")), false);
    } finally {
      state.restore();
    }
  });

  it("continues silently under the identity on the record, twice over", async () => {
    // A pull sends the identity on every registering call, and an idempotent
    // path has to stay idempotent.
    const state = stateDir();
    try {
      registerSessionStart(state.sessionsDir, 1, {
        engine: "claude-code",
        provider: "anthropic",
      });
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const again = await run(() =>
          start(state.sessionsDir, { engine: "claude-code", provider: "anthropic" }),
        );
        assert.equal(again.code, EXIT_OK);
      }
      assert.deepEqual(sessionOf(state.sessionsDir)["orchestrator"], {
        engine: "claude-code",
        provider: "anthropic",
        identityProvenance: "direct",
      });
    } finally {
      state.restore();
    }
  });

  it("refuses a different engine and leaves the record exactly as it was", async () => {
    // A refusal that half-wrote the identity would be worse than the
    // overwrite it replaces.
    const state = stateDir();
    try {
      registerSessionStart(state.sessionsDir, 1, {
        engine: "claude-code",
        provider: "anthropic",
      });
      const other = await run(() =>
        start(state.sessionsDir, { engine: "codex", provider: "openai" }),
      );
      assert.equal(other.code, EXIT_BOUNDARY);
      assert.match(other.err, /claude-code/);
      assert.match(other.err, /codex/);
      assert.deepEqual(sessionOf(state.sessionsDir)["orchestrator"], {
        engine: "claude-code",
        provider: "anthropic",
        identityProvenance: "direct",
      });
    } finally {
      state.restore();
    }
  });

  it("records an undocumented engine exactly as it was given", async () => {
    // Session 137 took `codex` out of every engine list a reader picks from
    // and left the name working: the documents say untested, not
    // unsupported. Refusing it would strand whoever is already mid-plan on
    // it for no gain, and the identity machinery does not care which name it
    // stores -- so the one thing that must hold is that the ledger says what
    // it was told, with no substitution and no silent promotion.
    const state = stateDir();
    try {
      const registered = await run(() =>
        start(state.sessionsDir, { engine: "codex", provider: "openai" }),
      );
      assert.equal(registered.code, EXIT_OK);
      assert.deepEqual(sessionOf(state.sessionsDir)["orchestrator"], {
        engine: "codex",
        provider: "openai",
        identityProvenance: "direct",
      });
    } finally {
      state.restore();
    }
  });

  it("says what drives a session next -- the loop, then the waiter -- and never `session next`, the declaration or the affected tests", async () => {
    // The declaration and the affected tests were the typed lifecycle's
    // recipe, printed at the one moment an engine had just read the managed
    // body saying the framework does them. `session next` was worse: under a
    // live loop it takes the lease and ends it.
    const state = stateDir();
    try {
      const registered = await run(() =>
        start(state.sessionsDir, { engine: "codex", provider: "openai" }),
      );
      assert.equal(registered.code, EXIT_OK);
      assert.match(registered.out, /Next: the AI runs `dabbler session next --sessions-dir/);
      assert.match(registered.out, /`answer_command`.*background/);
      assert.doesNotMatch(registered.out, /session wait|run --mailbox|declare|affected/);
    } finally {
      state.restore();
    }
  });

  it("names each declaration nothing reads any more, and registers anyway", async () => {
    const state = stateDir();
    try {
      seed(state.repo, {
        "docs/modules.yaml": "modules:\n- slug: model\n",
        "dabbler.yaml":
          "schema_version: 1\ntesting:\n  suites:\n  - name: unit\n    command: npm test\n    covers: ['.']\n    expensive: true\n    module: model\n" +
          "  selection:\n    repo_wide: ['.']\n" +
          "modules:\n  model:\n    sharedFiles: [build.props]\n",
      });
      resetProjectRootCache();
      const registered = await run(() => start(state.sessionsDir, { engine: "codex", provider: "openai" }));
      assert.equal(registered.code, EXIT_OK, registered.err);
      assert.match(registered.out, /docs\/modules\.yaml is no longer read/);
      assert.match(registered.out, /sharedFiles in dabbler\.yaml is no longer read/);
      assert.match(registered.out, /module and against in dabbler\.yaml are no longer read/);
      assert.match(registered.out, /testing\.selection rules and repo_wide in dabbler\.yaml are no longer read/);
    } finally {
      state.restore();
      resetProjectRootCache();
    }
  });

  it("removes the Stop hook an earlier framework installed, leaves another hook alone, and installs none", async () => {
    // Every repository where a Claude Code session ever registered carries
    // the entry, and a hook whose verb no longer exists exits 2 -- a block
    // on every end of turn. The removal runs where the install ran; a
    // registration under another engine touches nothing.
    const stale = {
      hooks: {
        Stop: [
          { hooks: [{ type: "command", command: "dabbler session hook-stop --sessions-dir docs/sessions" }] },
          { hooks: [{ type: "command", command: "echo the operator's own" }] },
        ],
        PreToolUse: [{ hooks: [{ type: "command", command: "echo keep" }] }],
      },
      theme: "dark",
    };
    const codex = stateDir();
    try {
      mkdirSync(join(codex.repo, ".claude"), { recursive: true });
      writeFileSync(join(codex.repo, ".claude", "settings.json"), JSON.stringify(stale), "utf8");
      const registered = await run(() =>
        start(codex.sessionsDir, { engine: "codex", provider: "openai" }),
      );
      assert.equal(registered.code, EXIT_OK);
      assert.deepEqual(JSON.parse(readFileSync(join(codex.repo, ".claude", "settings.json"), "utf8")), stale);
    } finally {
      codex.restore();
    }
    const claude = stateDir();
    try {
      mkdirSync(join(claude.repo, ".claude"), { recursive: true });
      writeFileSync(join(claude.repo, ".claude", "settings.json"), JSON.stringify(stale), "utf8");
      const registered = await run(() =>
        start(claude.sessionsDir, { engine: "claude-code", provider: "anthropic" }),
      );
      assert.equal(registered.code, EXIT_OK);
      assert.match(registered.out, /removed the stop gate from/);
      // On the row, so the declaration gate exempts this edit and no other.
      assert.equal((sessionOf(claude.sessionsDir)["orchestrator"] as Record<string, unknown>)["hookRemoved"], true);
      const settings = JSON.parse(readFileSync(join(claude.repo, ".claude", "settings.json"), "utf8"));
      // Only the framework's entry went; the operator's hooks and keys are as written.
      assert.deepEqual(settings, {
        hooks: {
          Stop: [{ hooks: [{ type: "command", command: "echo the operator's own" }] }],
          PreToolUse: stale.hooks.PreToolUse,
        },
        theme: "dark",
      });
      // Registering again writes nothing: there is nothing left to remove.
      const again = await run(() =>
        start(claude.sessionsDir, { engine: "claude-code", provider: "anthropic" }),
      );
      assert.equal(again.code, EXIT_OK);
      assert.doesNotMatch(again.out, /stop gate/);
      // And a repository that never had the entry gets no file at all.
      const fresh = stateDir();
      try {
        await run(() => start(fresh.sessionsDir, { engine: "claude-code", provider: "anthropic" }));
        assert.equal(existsSync(join(fresh.repo, ".claude")), false);
      } finally {
        fresh.restore();
      }
    } finally {
      claude.restore();
    }
  });
});

// --- Cancel and restore -------------------------------------------------------

describe("what a cancellation is allowed to say", () => {
  it("refuses one already cancelled", () => {
    const ruling = judgeCancellation({ status: "cancelled" }, 1);
    assert.match(String(ruling.refusal), /already cancelled/);
  });

  it("lets the author cancel the session in flight by number, with a reason and no --force, and leaves the tree alone", async () => {
    // Session 213 made every in-flight cancel a forced one, and a forced one a
    // person's: an author whose session should not go on had no verb for it.
    const state = stateDir();
    try {
      registerSessionStart(state.sessionsDir, 1, { engine: "claude-code" });
      const unfinished = join(state.repo, "half-written.txt");
      writeFileSync(unfinished, "work in progress\n", "utf8");

      // Another session's number -- the mistake an engine makes -- is refused,
      // and that session's record is as it was. A person may still cancel it.
      const other = await run(() => cancel(state.sessionsDir, 2, { reason: "wrong number", engine: true }));
      assert.equal(other.code, EXIT_BOUNDARY);
      assert.match(other.err, /session 002 is not the session in flight \(001 is\)/);
      assert.equal(sessionOf(state.sessionsDir, 1)["status"], "not-started");
      assert.equal(sessionOf(state.sessionsDir, 1)["cancelledReason"], undefined);

      const result = await run(() => cancel(state.sessionsDir, 1, { reason: "the plan names a file that does not exist", engine: true }));
      assert.equal(result.code, EXIT_OK, result.err);
      assert.equal(sessionOf(state.sessionsDir)["status"], "cancelled");
      assert.equal(sessionOf(state.sessionsDir)["cancelledReason"], "the plan names a file that does not exist");
      assert.equal(readFileSync(unfinished, "utf8"), "work in progress\n");
    } finally {
      state.restore();
    }
  });

  it("keeps the status it had, so a restore has something to go back to", () => {
    const record: Record<string, unknown> = { status: "in-progress" };
    applyCancellation(record, "stop", "2026-09-03T00:00:00Z");
    assert.deepEqual(record, {
      status: "cancelled",
      preCancelStatus: "in-progress",
      cancelledReason: "stop",
      cancelledAt: "2026-09-03T00:00:00Z",
    });
  });

  it("keeps no prior status that a restore could not put back", () => {
    const record: Record<string, unknown> = { status: "something-else" };
    applyCancellation(record, "stop", "2026-09-03T00:00:00Z");
    assert.ok(!("preCancelStatus" in record));
  });
});

describe("what a restoration puts back", () => {
  it("refuses a session that was never cancelled", () => {
    assert.match(
      String(judgeRestoration({ status: "in-progress" }, 1).refusal),
      /nothing to restore/,
    );
    assert.equal(judgeRestoration({ status: "cancelled" }, 1).refusal, null);
  });

  it("puts back the status the session actually carried, and clears the rest", () => {
    const record: Record<string, unknown> = {
      status: "cancelled",
      preCancelStatus: "in-progress",
      cancelledReason: "stop",
      cancelledAt: "2026-09-03T00:00:00Z",
    };
    assert.equal(applyRestoration(record, "resumed"), "in-progress");
    assert.deepEqual(record, { status: "in-progress", restoredReason: "resumed" });
  });

  it("falls back to not-started when the record kept no prior status", () => {
    const record: Record<string, unknown> = { status: "cancelled" };
    assert.equal(applyRestoration(record, ""), "not-started");
    assert.ok(!("restoredReason" in record));
  });
});

describe("a repair made while the run was stopped", () => {
  it("lists only the repaired files, never the framework's bookkeeping", () => {
    // The proof of 2026-09-08: seven paths for a two-file repair.
    const state = stateDir();
    try {
      const repaired = repairedPaths(state.repo, state.sessionsDir, [
        "src/widget.ts",
        "tests/widget.test.ts",
        ".dabbler/runs/s1/driver/run.json",
        ".dabbler/scratch/plan.json",
        "docs/sessions/sessions.json",
        "docs/sessions/activity-log.json",
        ".claude/settings.json",
      ]);
      assert.deepEqual(repaired, ["src/widget.ts", "tests/widget.test.ts"]);
    } finally {
      state.restore();
    }
  });
});

describe("cancelling and restoring through the verb", () => {
  it("refuses an engine's forced cancel by name and writes nothing, and takes a person's", async () => {
    // The proof of 2026-09-08: the AI cancelled its own registration with
    // --force and drove another folder's session from the wrong window.
    assert.equal(callerIsEngine({}), false);
    // Every engine, not one: the measured markers and the framework's own. A
    // person's own COPILOT_* variable is not a marker.
    for (const name of ENGINE_MARKERS) assert.equal(callerIsEngine({ [name]: "1" }), true, name);
    assert.deepEqual(
      ["CLAUDECODE", "COPILOT_CLI", "COPILOT_AGENT_SESSION_ID", "DABBLER_ENGINE_TERMINAL"].filter(
        (name) => !ENGINE_MARKERS.includes(name),
      ),
      [],
    );
    assert.equal(callerIsEngine({ COPILOT_OTEL_FILE_EXPORTER_PATH: "C:/logs" }), false);
    const state = stateDir();
    try {
      registerSessionStart(state.sessionsDir, 1, { engine: "claude-code" });
      const engine = await run(() => cancel(state.sessionsDir, 1, { reason: "wrong window", force: true, engine: true }));
      assert.equal(engine.code, EXIT_BOUNDARY);
      assert.match(engine.err, /a person's verb, never the engine's/);
      // And it says the engine's own way: walked on the installed extension, an
      // engine told only to report `blocked` paused a session it had been asked to cancel.
      assert.match(engine.err, /yours to cancel without it: `dabbler session cancel <its number> --reason/);
      assert.doesNotMatch(engine.err, /Report the step blocked/);
      assert.equal(sessionOf(state.sessionsDir)["status"], "in-progress");
      const person = await run(() => cancel(state.sessionsDir, 1, { reason: "stop", force: true, engine: false }));
      assert.equal(person.code, EXIT_OK);
      assert.equal(sessionOf(state.sessionsDir)["status"], "cancelled");
    } finally {
      state.restore();
    }
  });

  it("refuses an engine's forced close in the same words and writes nothing", async () => {
    // The beta of 2026-09-20 ended with uncommitted code by an engine's own
    // hand: a forced close skips the working-tree gate and closes the plan.
    const state = stateDir();
    try {
      registerSessionStart(state.sessionsDir, 1, { engine: "copilot" });
      const before = readFileSync(join(state.sessionsDir, "sessions.json"), "utf8");
      const engine = await run(() => close(state.sessionsDir, { forced: true, engine: true }));
      assert.equal(engine.code, EXIT_BOUNDARY);
      assert.match(engine.err, /`session close --force` is a person's verb, never the engine's/);
      assert.match(engine.err, /Report the step blocked/);
      assert.equal(readFileSync(join(state.sessionsDir, "sessions.json"), "utf8"), before);
    } finally {
      state.restore();
    }
  });

  it("finds a person where there is a click or an interactive terminal, and nowhere else", async () => {
    // What is THERE, not what is absent: a list of engine markers cannot
    // cover an engine nobody has measured, and an AI's tool shell -- whoever
    // made it -- runs its commands with no terminal.
    assert.equal(personIsPresent({}, true), true);
    assert.equal(personIsPresent({}, false), false);
    // A known engine is an engine even where its tool gives it a terminal.
    for (const name of ENGINE_MARKERS) assert.equal(personIsPresent({ [name]: "1" }, true), false, name);
    // A click is a person, whatever the editor's own environment carries.
    assert.equal(await asAPersonsClick(() => personIsPresent({ CLAUDECODE: "1" }, false)), true);
    assert.equal(personIsPresent({}, false), false);
  });

  it("refuses an engine at each of a person's three verbs in one sentence, the verb and what it does apart", async () => {
    // One sentence, so an AI is told the same thing -- and the same thing to
    // do instead -- wherever it reaches for a verb that is not its own.
    const state = stateDir();
    try {
      registerSessionStart(state.sessionsDir, 1, { engine: "codex" });
      const refusals = [
        await run(() => cancel(state.sessionsDir, 1, { reason: "x", force: true, engine: true })),
        await run(() => close(state.sessionsDir, { forced: true, engine: true })),
        await run(() => holdRelease(state.sessionsDir, { reason: "x", engine: true })),
      ];
      const verbs = ["cancel --force", "close --force", "hold-release"];
      for (const [index, refusal] of refusals.entries()) {
        assert.equal(refusal.code, EXIT_BOUNDARY, verbs[index]);
        assert.ok(
          refusal.err.includes(`refused -- \`session ${verbs[index]}\` is a person's verb, never the engine's: it `),
          refusal.err,
        );
        assert.ok(refusal.err.includes(", and that judgement is not the engine's to make. "), refusal.err);
        // What to do instead is the one part that differs: an engine has a
        // cancel of its own, and no close or hold of its own.
        assert.ok(
          refusal.err.includes(
            index === 0 ? "yours to cancel without it: `dabbler session cancel <its number>" : "Report the step blocked and say why; a person ",
          ),
          refusal.err,
        );
      }
      assert.equal(sessionOf(state.sessionsDir)["status"], "in-progress");
    } finally {
      state.restore();
    }
  });

  it("writes the cancellation and answers with the status", async () => {
    const state = stateDir();
    try {
      registerSessionStart(state.sessionsDir, 1, { engine: "claude-code" });
      const result = await run(() =>
        cancel(state.sessionsDir, 1, { reason: "stop", force: true }),
      );
      assert.equal(result.code, EXIT_OK);
      assert.equal(result.out, platformNewlines('{"session": 1, "status": "cancelled"}\n'));
      const record = sessionOf(state.sessionsDir);
      assert.equal(record["status"], "cancelled");
      assert.equal(record["cancelledReason"], "stop");

      const back = await run(() => restore(state.sessionsDir, 1, { reason: "resumed" }));
      assert.equal(back.out, platformNewlines('{"session": 1, "status": "in-progress"}\n'));
      assert.equal(sessionOf(state.sessionsDir)["status"], "in-progress");
    } finally {
      state.restore();
    }
  });

  it("commits the framework's own three files under its message, and leaves every other change uncommitted", async () => {
    const repo = tempDir("cancel-commit-");
    seed(repo, {
      ...SEED,
      "docs/sessions/project-work-plan.md": "# Work plan\n",
      "docs/sessions/activity-log.json": '{ "entries": [] }\n',
    });
    const sessionsDir = join(repo, "docs", "sessions");
    const calls: string[][] = [];
    const recorded = (answer: { stdout?: string; code?: number }) => (args: readonly string[]) => {
      calls.push([...args]);
      return answer;
    };
    const restoreGit = cleanRepoAnswers(repo, [
      // The three framework files are changed, and so is src/widget.py.
      [
        (args) => args[0] === "status" && args.includes("--"),
        recorded({
          stdout:
            " M docs/sessions/activity-log.json\n M docs/sessions/project-work-plan.md\n?? docs/sessions/sessions.json\n",
        }),
      ],
      [(args) => ["add", "commit", "push", "stash", "checkout", "reset", "restore"].includes(args[0]!), recorded({})],
    ]);
    try {
      registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
      writeFileSync(join(repo, "src", "widget.py"), "def widget():\n    return 2\n", "utf8");

      const result = await run(() => cancel(sessionsDir, 1, { reason: "stop", force: true }));
      assert.equal(result.code, EXIT_OK, result.err);

      const named = (args: readonly string[]): string[] =>
        args.slice(args.indexOf("--") + 1).map((path) => path.split("\\").join("/").split("/").slice(-1)[0]!).sort();
      const THREE = ["activity-log.json", "project-work-plan.md", "sessions.json"];
      const commit = calls.find((args) => args[0] === "commit");
      assert.ok(commit, JSON.stringify(calls));
      assert.equal(commit[commit.indexOf("-m") + 1], "Cancel session 1 of sessions");
      // By pathspec, so nothing else staged rides along.
      assert.deepEqual(named(commit), THREE);
      assert.deepEqual(named(calls.find((args) => args[0] === "add")!), THREE);
      // The unrelated change is never named, and nothing is pushed or unwound.
      assert.ok(!calls.some((args) => args.some((arg) => arg.includes("widget.py"))), JSON.stringify(calls));
      assert.deepEqual(calls.map((args) => args[0]), ["status", "add", "commit"]);
      assert.equal(readFileSync(join(repo, "src", "widget.py"), "utf8"), "def widget():\n    return 2\n");
    } finally {
      restoreGit();
    }
  });

  it("refuses a session number the record does not carry", async () => {
    const state = stateDir();
    try {
      registerSessionStart(state.sessionsDir, 1, { engine: "claude-code" });
      const result = await run(() => cancel(state.sessionsDir, 9, { reason: "stop" }));
      assert.equal(result.code, EXIT_USAGE);
      assert.match(result.err, /no session 009 on record/);
    } finally {
      state.restore();
    }
  });
});

// --- The plan prose -----------------------------------------------------------

describe("recording the plan prose", () => {
  it("renders the work plan around the prose it was handed", async () => {
    const state = stateDir();
    try {
      registerSessionStart(state.sessionsDir, 1, { engine: "claude-code" });
      const result = await run(() =>
        plan(state.sessionsDir, { body: "Two sessions, then stop." }),
      );
      assert.equal(result.code, EXIT_OK);
      assert.match(
        readFileSync(join(state.sessionsDir, "project-work-plan.md"), "utf8"),
        /Two sessions, then stop\./,
      );
    } finally {
      state.restore();
    }
  });

  it("refuses when neither the prose nor a file carrying it was given", async () => {
    const state = stateDir();
    try {
      const result = await run(() => plan(state.sessionsDir, {}));
      assert.equal(result.code, EXIT_USAGE);
      assert.match(result.err, /inline or from a file/);
    } finally {
      state.restore();
    }
  });
});

// --- A row the focused checkout wrote ----------------------------------------

describe("a ledger row the retired focused checkout wrote", () => {
  it("is still read: a row carrying its checkout declares like any other", async () => {
    const state = stateDir();
    try {
      registerSessionStart(state.sessionsDir, 1, { engine: "claude-code" });
      const path = join(state.sessionsDir, "sessions.json");
      const raw = JSON.parse(readFileSync(path, "utf8")) as { sessions: Record<string, unknown>[] };
      raw.sessions[0]!["checkout"] = { module: "persister", path: join(state.repo, "..", "repo.persister") };
      writeFileSync(path, JSON.stringify(raw, null, 2), "utf8");
      const declared = await run(() => declare(state.sessionsDir, { task: "Do it.", releasable: false }));
      assert.equal(declared.code, EXIT_OK, declared.err);
      assert.notEqual(readTaskDeclaration(state.sessionsDir, 1), null);
    } finally {
      state.restore();
    }
  });
});

// --- A report that answers an instruction already replaced -----------------------

describe("a report that answers an instruction already replaced", () => {
  it("names the waiter under a live loop, and `session next` only where no loop is driving", async () => {
    // A stale seq is ordinary under a loop: an operator's Send re-issues the
    // instruction while the AI works. The refusal used to send its reader to
    // `session next`, which takes the live loop's lease and ends it.
    const state = stateDir();
    try {
      registerSessionStart(state.sessionsDir, 1, { engine: "claude-code" });
      writeInstruction(state.repo, 1, {
        schema_version: 1, seq: 5, kind: "step", session_number: 1,
        issued_at: "2026-09-20T10:00:00-04:00", step_id: "widget", ask: "Make the widget real.",
        answer_schema: "driver-report.schema.json",
        answer_command: "dabbler session report --seq 5 --step widget ...",
      });
      const stale = { seq: 4, stepId: "widget", status: "done", notes: "made it real" };

      const alone = await run(() => report(state.sessionsDir, stale));
      assert.equal(alone.code, EXIT_BOUNDARY);
      assert.match(alone.err, /outstanding instruction is 5 and this report answers 4/);
      assert.match(alone.err, /`dabbler session next`/);

      mkdirSync(join(state.repo, ".dabbler", "runs", "s1", "driver"), { recursive: true });
      writeFileSync(loopPath(state.repo, 1), JSON.stringify({ pid: 1, at: new Date().toISOString() }));
      const driven = await run(() => report(state.sessionsDir, stale));
      assert.equal(driven.code, EXIT_BOUNDARY);
      assert.match(driven.err, /Run `dabbler session wait` again and answer what it prints/);
      assert.doesNotMatch(driven.err, /session next/);
    } finally {
      state.restore();
    }
  });
});

describe("a chained report (`--next`) that is not the answer owed", () => {
  it("takes nothing for an instruction already behind and lets the caller ask, and still refuses one that was never issued", async () => {
    // A chained command repeated after its process died names an instruction
    // the run is past. Refusing it left the AI with no instruction at all.
    const state = stateDir();
    try {
      registerSessionStart(state.sessionsDir, 1, { engine: "claude-code" });
      writeInstruction(state.repo, 1, {
        schema_version: 1, seq: 5, kind: "step", session_number: 1,
        issued_at: "2026-09-20T10:00:00-04:00", step_id: "widget", ask: "Make the widget real.",
        answer_schema: "driver-report.schema.json",
        answer_command: "dabbler session report --seq 5 --next --step widget ...",
      });
      const answer = { stepId: "widget", status: "done", notes: "made it real", chained: true };

      const repeated = await run(() => report(state.sessionsDir, { ...answer, seq: 4 }));
      assert.equal(repeated.code, EXIT_OK, repeated.err);
      assert.match(repeated.err, /nothing is accepted twice/);
      assert.equal(readReport(state.repo, 1), null);

      // Malformed, or ahead of anything issued: refused, and 5 is still owed.
      const ahead = await run(() => report(state.sessionsDir, { ...answer, seq: 6 }));
      assert.equal(ahead.code, EXIT_BOUNDARY);
      const malformed = await run(() => report(state.sessionsDir, { ...answer, seq: 5, status: "finished" }));
      assert.notEqual(malformed.code, EXIT_OK);
      assert.equal(readReport(state.repo, 1), null);
      assert.equal(readInstruction(state.repo, 1)?.seq, 5);
    } finally {
      state.restore();
    }
  });
});

describe("a report that arrives after its session was cancelled", () => {
  it("is told what the session's own done said, and is never told to start a session", async () => {
    // Found by failure injection in session 213: an AI still working when a
    // person cancelled answered, and was told to "Run `session start` first"
    // -- an invitation, to a loop, to start a session nobody asked for. With
    // an earlier session on the ledger the answer was aimed at THAT one.
    const state = stateDir();
    try {
      registerSessionStart(state.sessionsDir, 1, { engine: "claude-code" });
      writeInstruction(state.repo, 1, {
        schema_version: 1, seq: 3, kind: "done", session_number: 1,
        issued_at: "2026-09-20T10:00:00-04:00",
        ask: "Session 001 was cancelled by a person, who said: wrong repository. Stop, and tell the operator.",
      });
      await run(() => cancel(state.sessionsDir, 1, { reason: "wrong repository", force: true, engine: false }));
      const late = await run(() =>
        report(state.sessionsDir, { seq: 2, stepId: "widget", status: "done", notes: "made it real" }),
      );
      assert.equal(late.code, EXIT_BOUNDARY);
      assert.match(late.err, /no session is in flight/);
      assert.match(late.err, /was cancelled by a person, who said: wrong repository/);
      assert.doesNotMatch(late.err, /session start/);
    } finally {
      state.restore();
    }
  });
});

// --- What a declaration holds ------------------------------------------------------

describe("what the loop's declaration records about a release", () => {
  it("ships where packaging is declared, and holds in its own words where none is", async () => {
    // The loop is the one caller, and it hands in what `releaseOfPlan` decided
    // under the checkout's setting. What `declare` adds is the one fact a plan
    // cannot know: a repository that declares no packaging has nothing to
    // publish, whatever the plan proposed.
    const ships = makeAnsweredSandbox({ "dabbler.yaml": "schema_version: 1\npackaging:\n  release: tag\n" });
    registerSessionStart(ships.sessionsDir, 1, { engine: "claude-code" });
    const shipsResult = await run(() => declare(ships.sessionsDir, { task: "Do it.", releasable: true }));
    assert.equal(shipsResult.code, EXIT_OK, shipsResult.err);
    assert.match(shipsResult.out, /releasable=yes/);

    const bare = makeAnsweredSandbox();
    registerSessionStart(bare.sessionsDir, 1, { engine: "claude-code" });
    const nothing = await run(() => declare(bare.sessionsDir, { task: "Do it.", releasable: true }));
    assert.equal(nothing.code, EXIT_OK, nothing.err);
    assert.match(nothing.out, /releasable=no; held: this repository declares no packaging/);
  });
});

// --- What the close says was stepped over ----------------------------------------

describe("what the close says was stepped over", () => {
  it("is one line per repair and per amendment with its reason, and nothing for a session with neither", () => {
    // Nobody is asked about a repair or an amendment any more, so the close
    // is where a person reads that they happened -- from the record, and
    // from nothing new.
    const state = stateDir();
    try {
      registerSessionStart(state.sessionsDir, 1, { engine: "claude-code" });
      assert.deepEqual(steppedOverLines(state.repo, state.sessionsDir, 1), []);

      writeRun(state.repo, 1, {
        schema_version: 1,
        session_number: 1,
        engine: "claude-code",
        phase: "work",
        seq: 2,
        invocations: 0,
        max_invocations: 24,
        accepted_steps: [] as string[],
        baseline_tree: null,
        stop: { kind: "engine", reason: "it fell over", class: "first", step_id: "widget", at: "2026-09-13T10:00:00-04:00" },
        started_at: "2026-09-13T09:00:00-04:00",
        updated_at: "2026-09-13T10:00:00-04:00",
      });
      recordRepair(state.repo, 1, {
        reason: "restored the deleted fixture",
        by: "the operator",
        paths: ["tests/fixture.json"],
        baselineTree: "0123456789abcdef0123456789abcdef01234567",
        recordedAt: "2026-09-13T10:05:00-04:00",
      });
      recordAmendment(state.sessionsDir, {
        sessionNumber: 1,
        what: "step 'widget': its checks",
        reason: "the check named the value the plan guessed",
        by: "claude-code (anthropic)",
      });
      const lines = steppedOverLines(state.repo, state.sessionsDir, 1);
      assert.equal(lines.length, 2);
      assert.match(lines[0] ?? "", /^close: repaired outside a step: restored the deleted fixture \(the operator; 1 path\(s\)\)$/);
      assert.match(lines[1] ?? "", /^close: amended step 'widget': its checks: the check named the value the plan guessed \(claude-code \(anthropic\)\)$/);
      // Another session's record says nothing about this one.
      assert.deepEqual(steppedOverLines(state.repo, state.sessionsDir, 2), []);
    } finally {
      state.restore();
    }
  });
});

// --- What becomes of a message sent with `session interrupt` ----------------------

describe("what `session interrupt` says becomes of a message", () => {
  /** A driven session at `phase`, and what the verb said about a message sent to it. */
  async function said(phase: "work" | "verify", loopDriving = false): Promise<string> {
    const state = stateDir();
    try {
      registerSessionStart(state.sessionsDir, 1, { engine: "claude-code" });
      writeRun(state.repo, 1, {
        schema_version: 1,
        session_number: 1,
        engine: "claude-code",
        phase,
        seq: 3,
        invocations: 0,
        max_invocations: 24,
        accepted_steps: [] as string[],
        baseline_tree: null,
        stop: null,
        started_at: "2026-09-13T09:00:00-04:00",
        updated_at: "2026-09-13T10:00:00-04:00",
      });
      if (loopDriving) {
        mkdirSync(join(state.repo, ".dabbler", "runs", "s1", "driver"), { recursive: true });
        writeFileSync(loopPath(state.repo, 1), JSON.stringify({ pid: 1, at: new Date().toISOString() }));
      }
      const result = await run(() => interrupt(state.sessionsDir, { reason: "begin with a comment" }));
      assert.equal(result.code, EXIT_OK, result.err);
      // Whatever it says, it names the instruction the message was filed against.
      assert.match(result.out, /instruction 3/);
      return result.out;
    } finally {
      state.restore();
    }
  }

  it("with a step still owed, that it arrives with the next instruction and ends nothing", async () => {
    const out = await said("work");
    assert.match(out, /next instruction/);
    assert.doesNotMatch(out, /re-invokes|never read/);
  });

  it("with every step answered, that it may never be read and where to say it instead", async () => {
    const out = await said("verify");
    assert.match(out, /never read/);
    assert.match(out, /chat/);
    assert.doesNotMatch(out, /re-invokes/);
  });

  it("under the fallback loop, that the loop ends the invocation and re-invokes the engine", async () => {
    assert.match(await said("work", true), /re-invokes/);
  });
});

// --- Withdrawing a declared releasability ---------------------------------------

describe("a session that publishes nothing", () => {
  it("is held by its declaration or by its verdict, and the gate says which", async () => {
    // A session ships unless held, and it publishes only what verified: a
    // cap terminal ships nothing and the close reads as held, not shipped.
    const held = stateDir();
    try {
      registerSessionStart(held.sessionsDir, 1, { engine: "claude-code" });
      const declared = await run(() =>
        declare(held.sessionsDir, { task: "Do it.", releasable: false, holdReason: "session 2 lands the consumer" }),
      );
      assert.equal(declared.code, EXIT_OK);
      assert.equal(sessionIsReleasable(held.sessionsDir, 1), false);
      assert.match(String(releasabilityOf(held.sessionsDir, 1).hold), /held by its declaration: session 2/);
      const gate = checkPublishedWhenReleasable(held.sessionsDir);
      assert.equal(gate[0], true);
      assert.match(gate[1], /held by its declaration/);
    } finally {
      held.restore();
    }
    const capped = stateDir();
    try {
      registerSessionStart(capped.sessionsDir, 1, { engine: "claude-code" });
      const yaml = join(capped.repo, "dabbler.yaml");
      writeFileSync(yaml, readFileSync(yaml, "utf8") + "\npackaging:\n  release: tag\n");
      await run(() => declare(capped.sessionsDir, { task: "Ship it.", releasable: true }));
      recordSessionVerification(capped.sessionsDir, 1, "REMEDIATED_AT_CAP");
      assert.equal(sessionIsReleasable(capped.sessionsDir, 1), false);
      const gate = checkPublishedWhenReleasable(capped.sessionsDir);
      assert.equal(gate[0], true);
      assert.match(gate[1], /held by its verdict: the last verification round said REMEDIATED_AT_CAP/);
      recordSessionVerification(capped.sessionsDir, 1, "VERIFIED");
      assert.equal(sessionIsReleasable(capped.sessionsDir, 1), true);
      assert.equal(checkPublishedWhenReleasable(capped.sessionsDir)[0], false);
    } finally {
      capped.restore();
    }
  });

  it("is held by a person's hold-release, which an engine and a published session are refused", async () => {
    // A release that cannot succeed left a session two exits, publish or
    // cancel. The hold is the third: VERIFIED and releasable, it closes as held.
    const state = stateDir();
    try {
      registerSessionStart(state.sessionsDir, 1, { engine: "claude-code" });
      const yaml = join(state.repo, "dabbler.yaml");
      writeFileSync(yaml, readFileSync(yaml, "utf8") + "\npackaging:\n  release: tag\n");
      await run(() => declare(state.sessionsDir, { task: "Ship it.", releasable: true }));
      recordSessionVerification(state.sessionsDir, 1, "VERIFIED");
      assert.equal(sessionIsReleasable(state.sessionsDir, 1), true);

      const engine = await run(() => holdRelease(state.sessionsDir, { reason: "no feed yet", engine: true }));
      assert.equal(engine.code, EXIT_BOUNDARY);
      assert.match(engine.err, /a person's verb, never the engine's/);
      assert.equal(sessionIsReleasable(state.sessionsDir, 1), true);

      const held = await run(() => holdRelease(state.sessionsDir, { reason: "the feed's credential is not issued yet" }));
      assert.equal(held.code, EXIT_OK, held.err);
      assert.equal(sessionIsReleasable(state.sessionsDir, 1), false);
      const gate = checkPublishedWhenReleasable(state.sessionsDir);
      assert.equal(gate[0], true);
      assert.match(gate[1], /held by the operator: the feed's credential is not issued yet/);
      // Said once: a second hold changes nothing and is not a second entry.
      const again = await run(() => holdRelease(state.sessionsDir, { reason: "another reason" }));
      assert.equal(again.code, EXIT_OK);
      assert.match(again.out, /already held by the operator: the feed's credential/);
      assert.equal(amendmentEntries(state.sessionsDir, 1).length, 1);
    } finally {
      state.restore();
    }

    const published = stateDir();
    try {
      registerSessionStart(published.sessionsDir, 1, { engine: "claude-code" });
      appendPackaging(published.repo, 1, {
        recorded_at: "2026-01-01T00:00:00+00:00", session_number: 1, releasable: true,
        outcome: "published", tree_mutated: false, feed: "internal",
        secret_name: "FEED_PAT", steps: [], artifacts: ["widget-1.0.0.tgz"],
      });
      const late = await run(() => holdRelease(published.sessionsDir, { reason: "too late" }));
      assert.equal(late.code, EXIT_BOUNDARY);
      assert.match(late.err, /has already published/);
      assert.deepEqual(amendmentEntries(published.sessionsDir, 1), []);
    } finally {
      published.restore();
    }
  });
});
