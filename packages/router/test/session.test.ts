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
  resetProjectRootCache,
} from "../src/config.ts";
import { writePreferences } from "../src/preferences.ts";
import { setSeatIdentity } from "../src/transports/copilot.ts";
import {
  SETTING_AUTHORING_MODEL,
  SETTING_REVIEWER_TRANSPORT,
  SETTING_TRANSPORT,
  writeSettings,
} from "../src/settings.ts";
import { readRawSessionState } from "../src/progress.ts";
import {
  EXIT_BOUNDARY,
  EXIT_OK,
  EXIT_USAGE,
  applyCancellation,
  applyRestoration,
  callerIsEngine,
  cancel,
  carryForward,
  configuredModelRefusal,
  identityClash,
  judgeCancellation,
  judgeRestoration,
  judgeStartBoundary,
  declare,
  plan,
  repairedPaths,
  restore,
  reviewingVehicleRefusal,
  setSessionUseReading,
  start,
  steppedOverLines,
  type SequenceFacts,
} from "../src/session.ts";
import { recordRepair, writeRun } from "../src/driver.ts";
import {
  readTaskDeclaration,
  recordAmendment,
  recordSessionVerification,
  registerSessionStart,
  releasabilityOf,
  sessionIsReleasable,
  workBegunRefusal,
} from "../src/writers.ts";
import { cleanRepoAnswers, gitAnswers, seed, tempDir } from "./support/answers.ts";
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

  it("says the next call is `session next`, and names neither the declaration nor the affected tests", async () => {
    // Both were the typed lifecycle's recipe, printed at the one moment an
    // engine had just read the managed body saying the framework does them.
    const state = stateDir();
    try {
      const registered = await run(() =>
        start(state.sessionsDir, { engine: "codex", provider: "openai" }),
      );
      assert.equal(registered.code, EXIT_OK);
      assert.match(registered.out, /dabbler session next --sessions-dir/);
      assert.doesNotMatch(registered.out, /declare|affected/);
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
    const ruling = judgeCancellation({ status: "cancelled" }, 1, true);
    assert.match(String(ruling.refusal), /already cancelled/);
  });

  it("refuses one in flight without --force", () => {
    assert.match(
      String(judgeCancellation({ status: "in-progress" }, 1, false).refusal),
      /is in flight/,
    );
    assert.equal(judgeCancellation({ status: "in-progress" }, 1, true).refusal, null);
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
    assert.equal(callerIsEngine({ DABBLER_DRIVEN: "1" }), true);
    assert.equal(callerIsEngine({ CLAUDECODE: "1" }), true);
    const state = stateDir();
    try {
      registerSessionStart(state.sessionsDir, 1, { engine: "claude-code" });
      const engine = await run(() => cancel(state.sessionsDir, 1, { reason: "wrong window", force: true, engine: true }));
      assert.equal(engine.code, EXIT_BOUNDARY);
      assert.match(engine.err, /a person's verb, never the engine's/);
      assert.equal(sessionOf(state.sessionsDir)["status"], "in-progress");
      const person = await run(() => cancel(state.sessionsDir, 1, { reason: "stop", force: true, engine: false }));
      assert.equal(person.code, EXIT_OK);
      assert.equal(sessionOf(state.sessionsDir)["status"], "cancelled");
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
});
