// The session lifecycle's judgement half: which session a `start` may have
// and under whose identity, what a cancellation records and a restoration
// puts back, the plan prose, and the module manifest.
//
// Every rule here is a function of a record, so the tests hand it one. The
// three verbs that write go through the state directory with git answering
// from a table -- no checkout, no process. The close is the whole pipeline
// and belongs to walk-session.test.ts.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  ManifestError,
  consumersOf,
  create,
  dependenciesOf,
  deployablesOf,
  findEntry,
  impliedDeployables,
  loadEntries,
  loadManifest,
  moduleConfigs,
  parseDeployables,
  parseEntries,
  solutionShape,
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
  declare,
  plan,
  restore,
  start,
  type SequenceFacts,
} from "../src/session.ts";
import { readTaskDeclaration, registerSessionStart } from "../src/writers.ts";
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

  it("installs the Claude Code stop gate for a claude-code registration, and nothing for another engine", async () => {
    // The gate used to be installed only when BOOTSTRAP ran under Claude
    // Code, which is a fact about the shell that set the project up, not
    // about the engine that will run it: the extension's Set Up New Project
    // never installed it.
    const codex = stateDir();
    try {
      const registered = await run(() =>
        start(codex.sessionsDir, { engine: "codex", provider: "openai" }),
      );
      assert.equal(registered.code, EXIT_OK);
      assert.equal(existsSync(join(codex.repo, ".claude")), false);
    } finally {
      codex.restore();
    }
    const claude = stateDir();
    try {
      const registered = await run(() =>
        start(claude.sessionsDir, { engine: "claude-code", provider: "anthropic" }),
      );
      assert.equal(registered.code, EXIT_OK);
      const settings = JSON.parse(
        readFileSync(join(claude.repo, ".claude", "settings.json"), "utf8"),
      ) as { hooks: { Stop: unknown[] } };
      assert.match(JSON.stringify(settings.hooks.Stop), /session hook-stop/);
      assert.match(registered.out, /installed the stop gate/);
      // Registering again adds nothing: the hook is present, and the
      // settings file is the operator's.
      const again = await run(() =>
        start(claude.sessionsDir, { engine: "claude-code", provider: "anthropic" }),
      );
      assert.equal(again.code, EXIT_OK);
      assert.equal(
        (JSON.parse(readFileSync(join(claude.repo, ".claude", "settings.json"), "utf8")) as { hooks: { Stop: unknown[] } })
          .hooks.Stop.length,
        1,
      );
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

  it("holds a typed declaration's modules to the solution's shape, as the driven plan is held", async () => {
    // `session declare --module` could otherwise persist a module the plan
    // judge would refuse. This repository has no manifest: it is the one
    // module, and naming another is refused before anything is written.
    const state = stateDir();
    try {
      registerSessionStart(state.sessionsDir, 1, { engine: "claude-code" });
      const refused = await run(() =>
        declare(state.sessionsDir, { task: "Do it.", releasable: false, modules: ["ghost"] }),
      );
      assert.equal(refused.code, EXIT_USAGE);
      assert.match(refused.err, /names module 'ghost'.*single-module/);
      assert.equal(readTaskDeclaration(state.sessionsDir, 1), null);
      const accepted = await run(() =>
        declare(state.sessionsDir, { task: "Do it.", releasable: false }),
      );
      assert.equal(accepted.code, EXIT_OK);
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

  it("reads a declared deployables block, derives which deployables a module feeds, and implies one per application otherwise", () => {
    const entries = parseEntries({
      modules: [
        { slug: "core", kind: "library", package: "Core" },
        { slug: "api", kind: "application", dependsOn: ["core"] },
        { slug: "tool", kind: "application", dependsOn: ["core"] },
      ],
    });
    const deployables = parseDeployables(
      {
        deployables: [
          { slug: "edge", title: "Ingest service", kind: "service", from: ["api", "tool"], runtime: "container", publish: "acr" },
          // Legal, and the point of declaring during decomposition: named
          // while the modules that will feed it are still being argued over.
          { slug: "installer", kind: "cli", from: [] },
        ],
      },
      entries,
    );
    assert.deepEqual(
      deployables.map((one) => [one.slug, one.title, one.kind, one.runtime, one.publish, [...one.from], one.declared]),
      [
        ["edge", "Ingest service", "service", "container", "acr", ["api", "tool"], true],
        ["installer", "installer", "cli", null, null, [], true],
      ],
    );
    // Derived here and declarable nowhere, exactly as usedBy is.
    assert.deepEqual(deployablesOf(deployables, "api"), ["edge"]);
    assert.deepEqual(deployablesOf(deployables, "core"), []);
    // With no block, what a solution ships is what it shipped before the
    // block existed: one deployable per application module, named after it.
    const implied = impliedDeployables(entries);
    assert.deepEqual(implied.map((one) => [one.slug, [...one.from], one.declared]), [
      ["api", ["api"], false],
      ["tool", ["tool"], false],
    ]);
  });

  it("refuses a deployable's four bad shapes by name", () => {
    const entries = parseEntries({
      modules: [
        { slug: "core", kind: "library" },
        { slug: "api", kind: "application" },
      ],
    });
    assert.throws(
      () => parseDeployables({ deployables: [{ slug: "edge", form: ["api"] }] }, entries),
      /unknown key\(s\) form/,
    );
    assert.throws(
      () => parseDeployables({ deployables: [{ slug: "edge" }, { slug: "edge" }] }, entries),
      /duplicate deployable slug 'edge'/,
    );
    assert.throws(
      () => parseDeployables({ deployables: [{ slug: "edge", from: ["ghost"] }] }, entries),
      /'from' names 'ghost', which the manifest does not declare/,
    );
    // A library named here is a decomposition mistake: it reaches the
    // deployable as an application's dependency, not on its own.
    assert.throws(
      () => parseDeployables({ deployables: [{ slug: "edge", from: ["core"] }] }, entries),
      /'from' names 'core', a library; a deployable ships application modules/,
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

  it("parses the module vocabulary, defaults it, and refuses a cycle by name", () => {
    const [model, persister] = parseEntries({
      modules: [
        { slug: "model", kind: "shared-types", package: "CsvModel" },
        { slug: "persister", dependsOn: ["model"], package: "CsvPersister", contract: "designed" },
      ],
    });
    assert.equal(model?.kind, "shared-types");
    // A declared package is its own abstraction until somebody designs one.
    assert.equal(model?.contract, "package");
    assert.equal(persister?.kind, "library");
    assert.deepEqual(persister?.dependsOn, ["model"]);
    assert.equal(persister?.contract, "designed");
    // A module with no package has no seam to name a contract for.
    assert.equal(parseEntries({ modules: [{ slug: "app" }] })[0]?.contract, null);
    assert.throws(
      () => parseEntries({ modules: [{ slug: "a", kind: "service" }] }),
      /'kind' must be one of shared-types, library, application/,
    );
    assert.throws(
      () => parseEntries({ modules: [{ slug: "a", dependsOn: ["b"] }] }),
      /'a' depends on 'b', which the manifest does not declare/,
    );
    assert.throws(
      () =>
        parseEntries({
          modules: [
            { slug: "a", dependsOn: ["b"] },
            { slug: "b", dependsOn: ["c"] },
            { slug: "c", dependsOn: ["a"] },
          ],
        }),
      /cycle: a -> b -> c -> a/,
    );
  });

  it("derives who depends on a module transitively, in dependency order, and never reads it", () => {
    // Declared out of order on purpose: the derivation orders, the file
    // does not have to.
    const entries = parseEntries({
      modules: [
        { slug: "listener", kind: "application", dependsOn: ["deserializer", "persister"] },
        { slug: "persister", dependsOn: ["model"] },
        { slug: "deserializer", dependsOn: ["model"] },
        { slug: "model", kind: "shared-types" },
      ],
    });
    assert.deepEqual(consumersOf(entries, "model"), ["persister", "deserializer", "listener"]);
    assert.deepEqual(consumersOf(entries, "persister"), ["listener"]);
    assert.deepEqual(consumersOf(entries, "listener"), []);
    assert.deepEqual(dependenciesOf(entries, "listener"), ["model", "persister", "deserializer"]);
  });

  it("reads the per-module declarations of dabbler.yaml and refuses one for a module nobody declared", () => {
    const entries = parseEntries({
      modules: [{ slug: "model", package: "CsvModel" }, { slug: "persister", dependsOn: ["model"] }],
    });
    const configs = moduleConfigs(
      {
        modules: {
          persister: {
            sharedFiles: ["Directory.Packages.props", "packages/"],
            contract: { generate: ["dotnet", "genapi", "modules/persister"] },
          },
          model: { packaging: { pack: { argv: ["x", "{output}"] } } },
        },
      },
      entries,
    );
    assert.deepEqual(configs.get("persister")?.sharedFiles, ["Directory.Packages.props", "packages/"]);
    assert.deepEqual(configs.get("persister")?.contractGenerate, ["dotnet", "genapi", "modules/persister"]);
    assert.equal(configs.get("persister")?.packaging, null);
    assert.deepEqual(configs.get("model")?.sharedFiles, []);
    assert.ok(configs.get("model")?.packaging);
    // Nothing declared is the single-module state, and yields nothing.
    assert.equal(moduleConfigs({}, entries).size, 0);
    assert.throws(
      () => moduleConfigs({ modules: { ghost: {} } }, entries),
      /modules\.ghost names a module that docs\/modules\.yaml does not declare/,
    );
    assert.throws(
      () => moduleConfigs({ modules: { model: { feed: "x" } } }, entries),
      /modules\.model has unknown key\(s\) feed/,
    );
  });

  it("reads an absent manifest as one implicit module, one entry as single, and two as many", () => {
    const bare = tempDir("shape-");
    const implicit = solutionShape(bare);
    assert.equal(implicit.multi, false);
    assert.equal(implicit.implicit, true);
    assert.deepEqual(implicit.modules.map((m) => m.codeRoots), [["."]]);
    assert.equal(implicit.modules[0]?.kind, "application");

    const one = tempDir("shape-");
    seed(one, { "docs/modules.yaml": "modules:\n- slug: whole\n  codeRoots: ['.']\n" });
    const single = solutionShape(one);
    assert.equal(single.multi, false);
    assert.equal(single.implicit, false);
    assert.equal(single.modules[0]?.slug, "whole");

    const two = tempDir("shape-");
    seed(two, {
      "docs/modules.yaml":
        "modules:\n- slug: app\n  dependsOn: [lib]\n- slug: lib\n  package: Lib\n",
    });
    const many = solutionShape(two);
    assert.equal(many.multi, true);
    assert.deepEqual(many.modules.map((m) => m.slug), ["lib", "app"]);
  });
});
