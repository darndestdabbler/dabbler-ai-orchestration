import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import {
  CHANGE_WRITER_MODULE,
  ChangeWriterResult,
  CompletedSetTransitionDeps,
  DEDICATED_CONSEQUENCE_COPY,
  OUT_OF_BAND_CONSEQUENCE_COPY,
  applyCompletedSetTransition,
  buildChangeWriterArgs,
  buildConfirmationItems,
  buildModePickItems,
  parseChangeWriterOutput,
} from "../../commands/setupVerification";
import { SessionSet } from "../../types";

// Set 062 Session 2 (spec D3): the confirmation flow's decision
// surfaces are pure builders so they can be pinned without a VS Code
// host (the same split switchTier uses: the handler is thin glue, the
// pickable content is data). The host-side wiring (re-checks, the
// durable-record refusal, the rewrite + refresh) composes pieces that
// are each unit-tested: verificationModeRecordExists and
// rewriteSpecVerificationMode in verificationModeRewrite.test.ts, the
// ActionRegistry gate in actionRegistry.test.ts.

suite("setupVerification — mode QuickPick items (D3)", () => {
  test("offers exactly the two modes, dedicated first (the action's namesake)", () => {
    const items = buildModePickItems("out-of-band-or-none");
    assert.deepStrictEqual(
      items.map((i) => i.value),
      ["dedicated-sessions", "out-of-band-or-none"],
    );
  });

  test("annotates the current mode so the picker reads as a state view", () => {
    const fromA = buildModePickItems("out-of-band-or-none");
    assert.ok(
      fromA.find((i) => i.value === "out-of-band-or-none")!.description.endsWith("— current"),
      "current mode must be annotated",
    );
    assert.ok(
      !fromA.find((i) => i.value === "dedicated-sessions")!.description.includes("current"),
      "non-current mode must not claim to be current",
    );
    const fromB = buildModePickItems("dedicated-sessions");
    assert.ok(
      fromB.find((i) => i.value === "dedicated-sessions")!.description.endsWith("— current"),
    );
  });

  test("the dedicated-sessions item carries the one-way consequence copy naming the N/M+ growth", () => {
    const item = buildModePickItems("out-of-band-or-none")
      .find((i) => i.value === "dedicated-sessions")!;
    assert.strictEqual(item.detail, DEDICATED_CONSEQUENCE_COPY);
    assert.ok(/one-way/i.test(item.detail), "copy must say the transition is one-way");
    assert.ok(item.detail.includes("N/M+"), "copy must name the N/M+ growth (spec D3)");
  });

  test("the out-of-band item explains the default posture without 'unverified' language", () => {
    const item = buildModePickItems("dedicated-sessions")
      .find((i) => i.value === "out-of-band-or-none")!;
    assert.strictEqual(item.detail, OUT_OF_BAND_CONSEQUENCE_COPY);
    assert.ok(item.detail.includes("external-verification.md"));
    assert.ok(
      !/unverified/i.test(item.detail),
      "Mode A is a posture, not a deficiency — copy never says 'unverified' (spec D1)",
    );
  });
});

suite("setupVerification — confirmation step (D3)", () => {
  test("A->B confirmation names the target and carries the one-way consequence copy", () => {
    const items = buildConfirmationItems("dedicated-sessions");
    assert.strictEqual(items.length, 2);
    assert.strictEqual(items[0].label, "Switch to dedicated-sessions");
    assert.strictEqual(items[0].confirmed, true);
    assert.strictEqual(items[0].detail, DEDICATED_CONSEQUENCE_COPY);
  });

  test("B->A confirmation carries the out-of-band copy instead", () => {
    const items = buildConfirmationItems("out-of-band-or-none");
    assert.strictEqual(items[0].label, "Switch to out-of-band-or-none");
    assert.strictEqual(items[0].detail, OUT_OF_BAND_CONSEQUENCE_COPY);
  });

  test("Cancel is always offered and is the only non-confirming item", () => {
    for (const target of ["dedicated-sessions", "out-of-band-or-none"] as const) {
      const items = buildConfirmationItems(target);
      const cancels = items.filter((i) => !i.confirmed);
      assert.strictEqual(cancels.length, 1);
      assert.strictEqual(cancels[0].label, "Cancel");
    }
  });
});

// Set 062 Session 3 (spec D3/D4): the completed-set path's spawn args
// and JSON-envelope parsing are pure so the blessed-writer invocation
// can be pinned without a host or a Python install. The host glue
// (spawn, inform-only failure branches, success-only seed rewrite +
// kickoff copy) composes these with the already-tested
// rewriteSpecVerificationMode and buildVerificationKickoffPrompt.

suite("setupVerification — blessed-writer invocation (S3, spec D3/D4)", () => {
  test("spawn args target the writer module with --json", () => {
    assert.deepStrictEqual(buildChangeWriterArgs("/repo/docs/session-sets/x"), [
      "-m",
      "ai_router.change_verification_mode",
      "/repo/docs/session-sets/x",
      "--json",
    ]);
  });

  test("the pinned module exists in ai_router (cross-language drift guard)", () => {
    // Tests run with cwd at the extension package root
    // (tools/dabbler-ai-orchestration) — the watcherInventory pattern.
    const moduleFile = path.resolve(
      process.cwd(),
      "..",
      "..",
      ...CHANGE_WRITER_MODULE.split("."),
    ) + ".py";
    assert.ok(
      fs.existsSync(moduleFile),
      `${CHANGE_WRITER_MODULE} does not resolve to ${moduleFile} — the ` +
        "extension's spawn target and the Python CLI have drifted",
    );
  });

  test("parses the writer's success envelope", () => {
    // Mirrors the exact shape `python -m ai_router.change_verification_mode
    // <dir> --json` prints on success (pinned by the Python suite's
    // TestCli.test_json_envelope).
    const stdout = JSON.stringify(
      {
        ok: true,
        code: "changed",
        reason:
          "verificationMode transition recorded: out-of-band-or-none -> dedicated-sessions.",
        record: { kind: "verification_mode_change", choice: "dedicated-sessions" },
      },
      null,
      2,
    );
    assert.deepStrictEqual(parseChangeWriterOutput(stdout), {
      ok: true,
      code: "changed",
      reason:
        "verificationMode transition recorded: out-of-band-or-none -> dedicated-sessions.",
    });
  });

  test("parses a gate-refusal envelope (refusals also emit JSON, exit 3)", () => {
    const stdout = JSON.stringify({
      ok: false,
      code: "refused-typed-session-exists",
      reason: "the ledger already carries typed session(s) (3).",
      record: null,
    });
    const parsed = parseChangeWriterOutput(stdout);
    assert.ok(parsed);
    assert.strictEqual(parsed.ok, false);
    assert.strictEqual(parsed.code, "refused-typed-session-exists");
  });

  test("returns null for non-envelope output so the caller falls back to stderr diagnosis", () => {
    for (const bad of [
      "",
      "not json",
      "[]",
      "42",
      JSON.stringify({ ok: "yes", code: "changed", reason: "x" }), // ok not boolean
      JSON.stringify({ ok: true, reason: "x" }), // code missing
      JSON.stringify({ ok: true, code: "changed" }), // reason missing
    ]) {
      assert.strictEqual(
        parseChangeWriterOutput(bad),
        null,
        `expected null for ${JSON.stringify(bad)}`,
      );
    }
  });

  test("tolerates banner noise being absent but not prefixed garbage (strict single-object stdout)", () => {
    // The writer prints ONLY the JSON object on stdout in --json mode
    // (advisories go to stderr), so a prefixed line means something is
    // wrong — fail to the stderr-diagnosis path rather than guessing.
    assert.strictEqual(
      parseChangeWriterOutput("[dabbler] noise\n{\"ok\":true}"),
      null,
    );
  });
});

// S062-S3-V1-002: the completed-set transition's full invocation /
// fallback matrix, pinned through injected deps — every branch's
// observable side effects (what was written, copied, toasted) assert
// the D3 lock: NOTHING changes unless the writer reported success, and
// the spec seed is aligned only AFTER the durable record exists.

function fakeCompletedSet(): SessionSet {
  return {
    name: "062-fixture",
    dir: "/repo/docs/session-sets/062-fixture",
    specPath: "/repo/docs/session-sets/062-fixture/spec.md",
    activityPath: "/repo/docs/session-sets/062-fixture/activity-log.json",
    changeLogPath: "/repo/docs/session-sets/062-fixture/change-log.md",
    statePath: "/repo/docs/session-sets/062-fixture/session-state.json",
    aiAssignmentPath: "/repo/docs/session-sets/062-fixture/ai-assignment.md",
    uatChecklistPath: "/repo/docs/session-sets/062-fixture/x-uat-checklist.json",
    state: "complete",
    totalSessions: 2,
    sessionsCompleted: 2,
    lastTouched: null,
    liveSession: null,
    config: {
      requiresUAT: false,
      requiresE2E: false,
      uatScope: "none",
      tier: "lightweight",
      verificationMode: "out-of-band-or-none",
    },
    uatSummary: null,
    root: "/repo",
    needsMigration: false,
    migrationTargetSchemaVersion: null,
    schemaVersionOnDisk: null,
    prerequisites: null,
    blockedByPrereqs: false,
    unsatisfiedPrereqs: [],
    plusFraction: false,
    externalVerificationNoteExists: false,
    completedVerification: null,
    verificationMarker: "v?",
    workspaceTierMarker: null,
  };
}

interface DepsLog {
  deps: CompletedSetTransitionDeps;
  reads: string[];
  writes: Array<{ path: string; text: string }>;
  clipboard: string[];
  infos: string[];
  warnings: string[];
  errors: string[];
  refreshes: number;
  writerCalls: Array<{ pythonPath: string; setDir: string; cwd: string }>;
}

function loggingDeps(
  writerResult: ChangeWriterResult,
  opts: { specText?: string; readThrows?: boolean } = {},
): DepsLog {
  const log: DepsLog = {
    deps: undefined as unknown as CompletedSetTransitionDeps,
    reads: [],
    writes: [],
    clipboard: [],
    infos: [],
    warnings: [],
    errors: [],
    refreshes: 0,
    writerCalls: [],
  };
  log.deps = {
    runWriter: (pythonPath, setDir, cwd) => {
      log.writerCalls.push({ pythonPath, setDir, cwd });
      return Promise.resolve(writerResult);
    },
    readFile: (p) => {
      log.reads.push(p);
      if (opts.readThrows) throw new Error("EACCES");
      return (
        opts.specText ??
        "## Session Set Configuration\n\n```yaml\ntier: lightweight\nverificationMode: out-of-band-or-none\n```\n"
      );
    },
    writeFile: (p, text) => void log.writes.push({ path: p, text }),
    copyToClipboard: (text) => {
      log.clipboard.push(text);
      return Promise.resolve();
    },
    showInfo: (m) => void log.infos.push(m),
    showWarning: (m) => void log.warnings.push(m),
    showError: (m) => void log.errors.push(m),
    refresh: () => void log.refreshes++,
  };
  return log;
}

suite("setupVerification — completed-set transition matrix (S062-S3-V1-002)", () => {
  test("writer gate refusal: informs with the code, touches NOTHING (D3 no-drift lock)", async () => {
    const log = loggingDeps({
      ok: false,
      code: "refused-typed-session-exists",
      reason: "the ledger already carries typed session(s) (3).",
    });
    const outcome = await applyCompletedSetTransition(
      fakeCompletedSet(),
      "python",
      log.deps,
    );
    assert.strictEqual(outcome, "refused");
    assert.strictEqual(log.infos.length, 1);
    assert.ok(log.infos[0].includes("refused-typed-session-exists"));
    assert.deepStrictEqual(log.reads, [], "spec must not be read on refusal");
    assert.deepStrictEqual(log.writes, [], "spec must not be written on refusal");
    assert.deepStrictEqual(log.clipboard, [], "no prompt copy on refusal");
    assert.strictEqual(log.refreshes, 0);
    assert.strictEqual(log.errors.length, 0, "a gate refusal is not an error");
  });

  test("spawn failure (missing python): errors, touches NOTHING", async () => {
    const log = loggingDeps({
      ok: false,
      code: "spawn-error",
      reason: "could not spawn Python (ENOENT)",
    });
    const outcome = await applyCompletedSetTransition(
      fakeCompletedSet(),
      "python",
      log.deps,
    );
    assert.strictEqual(outcome, "writer-unavailable");
    assert.strictEqual(log.errors.length, 1);
    assert.deepStrictEqual(log.writes, []);
    assert.deepStrictEqual(log.clipboard, []);
    assert.strictEqual(log.refreshes, 0);
  });

  test("router-not-installed: errors, touches NOTHING", async () => {
    const log = loggingDeps({
      ok: false,
      code: "router-not-installed",
      reason: "dabbler-ai-router is not installed for python",
    });
    const outcome = await applyCompletedSetTransition(
      fakeCompletedSet(),
      "python",
      log.deps,
    );
    assert.strictEqual(outcome, "writer-unavailable");
    assert.strictEqual(log.errors.length, 1);
    assert.deepStrictEqual(log.writes, []);
    assert.deepStrictEqual(log.clipboard, []);
  });

  test("writer success: aligns the seed, copies the kickoff prompt, refreshes, locked toast", async () => {
    const set = fakeCompletedSet();
    const log = loggingDeps({ ok: true, code: "changed", reason: "recorded" });
    const outcome = await applyCompletedSetTransition(set, "python", log.deps);
    assert.strictEqual(outcome, "changed");
    // The writer ran against the set dir from the set's root.
    assert.deepStrictEqual(log.writerCalls, [
      { pythonPath: "python", setDir: set.dir, cwd: set.root },
    ]);
    // Seed aligned to dedicated-sessions, byte-preserving rewrite.
    assert.strictEqual(log.writes.length, 1);
    assert.strictEqual(log.writes[0].path, set.specPath);
    assert.ok(log.writes[0].text.includes("verificationMode: dedicated-sessions"));
    // Kickoff prompt on the clipboard names the set.
    assert.strictEqual(log.clipboard.length, 1);
    assert.ok(log.clipboard[0].includes(set.name));
    assert.strictEqual(log.refreshes, 1);
    // The D3-locked toast copy.
    assert.deepStrictEqual(log.infos, [
      "verificationMode → dedicated-sessions. Kickoff prompt copied — paste it to your AI agent.",
    ]);
    assert.strictEqual(log.warnings.length, 0);
  });

  test("writer success + unreadable spec: warns with the manual fix, still copies the prompt", async () => {
    const set = fakeCompletedSet();
    const log = loggingDeps(
      { ok: true, code: "changed", reason: "recorded" },
      { readThrows: true },
    );
    const outcome = await applyCompletedSetTransition(set, "python", log.deps);
    assert.strictEqual(outcome, "changed-seed-misaligned");
    assert.deepStrictEqual(log.writes, []);
    assert.strictEqual(log.clipboard.length, 1, "prompt still copied — the record is durable");
    assert.strictEqual(log.warnings.length, 1);
    assert.ok(log.warnings[0].includes("verificationMode: dedicated-sessions"));
    assert.strictEqual(log.refreshes, 1);
  });

  test("writer success + spec already dedicated-sessions: no rewrite needed, success toast", async () => {
    const set = fakeCompletedSet();
    const log = loggingDeps(
      { ok: true, code: "changed", reason: "recorded" },
      {
        specText:
          "## Session Set Configuration\n\n```yaml\ntier: lightweight\nverificationMode: dedicated-sessions\n```\n",
      },
    );
    const outcome = await applyCompletedSetTransition(set, "python", log.deps);
    assert.strictEqual(outcome, "changed");
    assert.deepStrictEqual(log.writes, [], "already-target needs no write");
    assert.strictEqual(log.clipboard.length, 1);
    assert.strictEqual(log.infos.length, 1);
  });
});
