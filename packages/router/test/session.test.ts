// The session lifecycle's judgement half: which session a `start` may have
// and under whose identity, what a cancellation records and a restoration
// puts back, the plan prose, and the module manifest.
//
// Every rule here is a function of a record, so the tests hand it one. The
// three verbs that write go through the state directory with git answering
// from a table -- no checkout, no process. The close is the whole pipeline
// and belongs to walk-session.test.ts.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  ManifestError,
  create,
  findEntry,
  loadEntries,
  loadManifest,
  parseEntries,
} from "../src/modules.ts";
import { capture } from "../src/output.ts";
import { platformNewlines } from "../src/journal.ts";
import { readRawSessionState } from "../src/progress.ts";
import {
  EXIT_BOUNDARY,
  EXIT_OK,
  EXIT_USAGE,
  applyCancellation,
  applyRestoration,
  cancel,
  carryForward,
  identityClash,
  judgeCancellation,
  judgeRestoration,
  judgeStartBoundary,
  plan,
  restore,
  start,
  type SequenceFacts,
} from "../src/session.ts";
import { registerSessionStart } from "../src/writers.ts";
import { cleanRepoAnswers, seed, tempDir } from "./support/answers.ts";

/** One verb's exit code and everything it wrote, so a refusal can be read. */
async function run(verb: () => number): Promise<{ code: number; out: string; err: string }> {
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

describe("registering a session", () => {
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

describe("cancelling and restoring through the verb", () => {
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

// --- The module manifest ------------------------------------------------------

describe("the module manifest", () => {
  it("reads an absent file, and a bare `modules:`, as the designed empty state", () => {
    const root = tempDir("manifest-");
    assert.deepEqual(loadEntries(root), []);
    seed(root, { "docs/modules.yaml": "modules:\n" });
    assert.deepEqual(loadEntries(root), []);
  });

  it("refuses a document that is not a mapping", () => {
    const root = tempDir("manifest-");
    seed(root, { "docs/modules.yaml": "- one\n- two\n" });
    assert.throws(() => loadEntries(root), ManifestError);
  });

  it("rejects an unknown key rather than ignoring it", () => {
    // A misspelled `codeRoot` that was silently dropped would leave the
    // module bounded by something other than what was written.
    assert.throws(
      () => parseEntries({ modules: [{ slug: "a", codeRoot: ["src"] }] }),
      /unknown key\(s\) codeRoot/,
    );
  });

  it("rejects a mistyped list field and a duplicate slug", () => {
    assert.throws(
      () => parseEntries({ modules: [{ slug: "a", codeRoots: "src" }] }),
      /must be a list of strings/,
    );
    assert.throws(
      () => parseEntries({ modules: [{ slug: "a" }, { slug: "a" }] }),
      /duplicate slug 'a'/,
    );
  });

  it("defaults the title to the slug and drops an empty plan path", () => {
    const [entry] = parseEntries({ modules: [{ slug: "a", title: "  ", planPath: " " }] });
    assert.equal(entry?.title, "a");
    assert.equal(entry?.planPath, null);
  });

  it("appends an entry, echoes it, and keeps the file loadable", async () => {
    const root = tempDir("manifest-");
    const result = await run(() =>
      create(root, "greeter", "Greeter", {
        planPath: "docs/modules/greeter.md",
        codeRoots: ["src/greeter"],
        specSections: ["docs/reference.md#greeting"],
      }),
    );
    assert.equal(result.code, EXIT_OK);
    assert.match(result.out, /"slug": "greeter"/);
    const entries = loadEntries(root);
    assert.equal(entries.length, 1);
    assert.deepEqual(entries[0]?.codeRoots, ["src/greeter"]);
    assert.deepEqual(entries[0]?.specSections, ["docs/reference.md#greeting"]);
    // And answers for a slug it does not declare rather than guessing.
    assert.equal(findEntry(root, "greeter")?.title, "Greeter");
    assert.equal(findEntry(root, "absent"), null);
    assert.equal(findEntry(root, ""), null);
  });

  it("omits a scope field nobody supplied rather than writing an empty list", async () => {
    const root = tempDir("manifest-");
    await run(() => create(root, "bare", "Bare"));
    const doc = loadManifest(join(root, "docs", "modules.yaml"));
    assert.deepEqual(Object.keys((doc["modules"] as Record<string, unknown>[])[0]!), [
      "slug",
      "title",
    ]);
    // LF on every platform, because the file is committed.
    assert.ok(!readFileSync(join(root, "docs", "modules.yaml"), "utf8").includes("\r\n"));
  });

  it("refuses a slug the manifest already declares, and one it cannot parse", async () => {
    const root = tempDir("manifest-");
    await run(() => create(root, "greeter", "Greeter"));
    const again = await run(() => create(root, "greeter", "Again"));
    assert.equal(again.code, 1);
    assert.match(again.err, /already exists/);

    const broken = tempDir("manifest-");
    mkdirSync(join(broken, "docs"), { recursive: true });
    writeFileSync(join(broken, "docs", "modules.yaml"), "modules:\n- slug: [\n", "utf8");
    const refused = await run(() => create(broken, "greeter", "Greeter"));
    assert.equal(refused.code, 1);
    assert.match(refused.err, /modules create: refused/);
  });
});
