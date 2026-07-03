// Set 062 Session 4 (spec D6) — uat-matrix fixture pinning.
//
// Derives every committed row of test-fixtures/uat-matrix/ through the
// REAL readSessionSets scan and asserts the marker/action signals each
// row exists to demonstrate. This is what keeps the fixture matrix from
// silently rotting as schemas and predicates evolve: a change that
// alters any row's derived state fails here, and the fix is to update
// the fixture and this test together (then re-walk any affected UAT
// checklist rows).
//
// The generator (scripts/make-uat-workspace.js) is exercised too: the
// disposable copy must derive identically to the committed source.

import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { SessionSet } from "../../types";
import { applicableActions } from "../../providers/ActionRegistry";
import { resolveStartNextSessionPrompt } from "../../commands/copyPromptCommands";
import { readSessionSets } from "../../utils/fileSystem";

const EXT_ROOT = path.resolve(__dirname, "../../..");
const MATRIX_ROOT = path.join(EXT_ROOT, "test-fixtures", "uat-matrix");
const FULL_ROOT = path.join(MATRIX_ROOT, "hello-world-full");
const LW_ROOT = path.join(MATRIX_ROOT, "hello-world-lightweight");

// eslint-disable-next-line @typescript-eslint/no-var-requires
const generator = require("../../../scripts/make-uat-workspace.js") as {
  MATRIX_DIR: string;
  WORKSPACE_FILE: string;
  makeUatWorkspace: (targetParent?: string) => string;
  repoVenvInterpreter: () => string | null;
};

function byName(sets: SessionSet[]): Map<string, SessionSet> {
  return new Map(sets.map((s) => [s.name, s]));
}

function actionIds(set: SessionSet): string[] {
  return applicableActions(set, { uat: true, e2e: true }).map((a) => a.id);
}

suite("uat-matrix fixtures — hello-world-full (Set 062 S4)", () => {
  const sets = byName(readSessionSets(FULL_ROOT));

  test("all four fixture sets are discovered", () => {
    assert.deepStrictEqual(
      [...sets.keys()].sort(),
      [
        "001-hello-page",
        "002-style-the-greeting",
        "003-publish-the-page",
        "004-legacy-greeting-notes",
      ],
    );
  });

  test("001-hello-page is the Full-tier control row: 1/3 in flight, no markers", () => {
    const s = sets.get("001-hello-page")!;
    assert.strictEqual(s.config.tier, "full");
    assert.strictEqual(s.state, "in-progress");
    assert.strictEqual(s.totalSessions, 3);
    assert.strictEqual(s.sessionsCompleted, 1);
    assert.strictEqual(s.liveSession?.currentSession, 2);
    // Control: every Lightweight signal stays off.
    assert.strictEqual(s.verificationMarker, "");
    assert.strictEqual(s.plusFraction, false);
    assert.strictEqual(s.externalVerificationNoteExists, false);
    assert.strictEqual(s.completedVerification, null);
    assert.strictEqual(s.needsMigration, false);
    assert.strictEqual(s.blockedByPrereqs, false);
  });

  test("002-style-the-greeting is blocked by a REAL pending prerequisite", () => {
    const s = sets.get("002-style-the-greeting")!;
    assert.strictEqual(s.state, "not-started");
    assert.strictEqual(s.blockedByPrereqs, true);
    assert.deepStrictEqual(s.unsatisfiedPrereqs, [
      { slug: "001-hello-page", condition: "complete", targetState: "in-progress" },
    ]);
  });

  test("003-publish-the-page is blocked by an UNKNOWN prerequisite slug", () => {
    const s = sets.get("003-publish-the-page")!;
    assert.strictEqual(s.state, "not-started");
    assert.strictEqual(s.blockedByPrereqs, true);
    assert.deepStrictEqual(s.unsatisfiedPrereqs, [
      { slug: "099-cdn-rollout", condition: "complete", targetState: "unknown" },
    ]);
  });

  test("004-legacy-greeting-notes needs the v3 -> v4 migration (asterisk row)", () => {
    const s = sets.get("004-legacy-greeting-notes")!;
    assert.strictEqual(s.state, "complete");
    assert.strictEqual(s.needsMigration, true);
    assert.strictEqual(s.migrationTargetSchemaVersion, 4);
    assert.strictEqual(s.schemaVersionOnDisk, 3);
    assert.ok(actionIds(s).includes("dabblerSessionSets.migrateToV4"));
    assert.ok(!actionIds(s).includes("dabblerSessionSets.migrate"));
  });
});

suite("uat-matrix fixtures — hello-world-lightweight (Set 062 S4)", () => {
  const sets = byName(readSessionSets(LW_ROOT));

  test("all seven fixture sets are discovered", () => {
    assert.deepStrictEqual(
      [...sets.keys()].sort(),
      [
        "001-greet-the-world",
        "002-greet-quietly",
        "003-greet-with-note",
        "004-add-a-farewell",
        "005-shout-the-greeting",
        "006-whisper-mode",
        "007-echo-the-greeting",
      ],
    );
  });

  test("001 Mode A not-started: no marker; Switch Tier + Set Up Dedicated Verification offered", () => {
    const s = sets.get("001-greet-the-world")!;
    assert.strictEqual(s.config.tier, "lightweight");
    assert.strictEqual(s.config.verificationMode, "out-of-band-or-none");
    assert.strictEqual(s.state, "not-started");
    assert.strictEqual(s.verificationMarker, "");
    assert.strictEqual(s.plusFraction, false);
    const ids = actionIds(s);
    assert.ok(ids.includes("dabblerSessionSets.switchTier"));
    assert.ok(ids.includes("dabblerSessionSets.setupVerification"));
    // No durable record can exist — the fixture ships no activity log.
    assert.strictEqual(
      fs.existsSync(path.join(s.dir, "activity-log.json")),
      false,
    );
  });

  test("002 Mode A complete without note: v? + note action + completed-set setup path", () => {
    const s = sets.get("002-greet-quietly")!;
    assert.strictEqual(s.state, "complete");
    assert.strictEqual(s.verificationMarker, "v?");
    assert.strictEqual(s.externalVerificationNoteExists, false);
    assert.strictEqual(s.completedVerification, null);
    const ids = actionIds(s);
    assert.ok(ids.includes("dabbler.openExternalVerificationDoc"));
    assert.ok(ids.includes("dabblerSessionSets.setupVerification"));
    assert.ok(!ids.includes("dabblerSessionSets.switchTier"));
  });

  test("003 Mode A complete with note: marker suppressed (quiet is success)", () => {
    const s = sets.get("003-greet-with-note")!;
    assert.strictEqual(s.state, "complete");
    assert.strictEqual(s.verificationMarker, "");
    assert.strictEqual(s.externalVerificationNoteExists, true);
    assert.ok(!actionIds(s).includes("dabbler.openExternalVerificationDoc"));
  });

  test("004 Mode B mid-work: 1/2 with the + suffix, no v+ yet", () => {
    const s = sets.get("004-add-a-farewell")!;
    assert.strictEqual(s.config.verificationMode, "dedicated-sessions");
    assert.strictEqual(s.state, "in-progress");
    assert.strictEqual(s.totalSessions, 2);
    assert.strictEqual(s.sessionsCompleted, 1);
    assert.strictEqual(s.plusFraction, true);
    assert.strictEqual(s.verificationMarker, "");
    assert.ok(actionIds(s).includes("dabbler.copyVerificationKickoffPrompt"));
  });

  test("005 Mode B work-complete: 2/2 with the + suffix AND v+ (verification owed)", () => {
    const s = sets.get("005-shout-the-greeting")!;
    assert.strictEqual(s.state, "in-progress");
    // The awaiting-verification window deliberately fails invariant
    // rule 6 (all sessions complete while the set stays in-progress),
    // so the counts come from the documented session-events.jsonl
    // fallback — the fixture pins that degradation path.
    assert.strictEqual(s.totalSessions, 2);
    assert.strictEqual(s.sessionsCompleted, 2);
    assert.strictEqual(s.plusFraction, true);
    assert.strictEqual(s.verificationMarker, "v+");
    assert.ok(actionIds(s).includes("dabbler.copyVerificationKickoffPrompt"));
  });

  test("007 Mode B remediation in flight: remediation owed; Start Next Session reroutes (Set 077 S6)", () => {
    const s = sets.get("007-echo-the-greeting")!;
    assert.strictEqual(s.config.verificationMode, "dedicated-sessions");
    assert.strictEqual(s.state, "in-progress");
    assert.strictEqual(s.totalSessions, 4);
    assert.strictEqual(s.sessionsCompleted, 3);
    // A typed session already grew the denominator, so the
    // can-still-grow `+` suffix is gone (the 006 rule).
    assert.strictEqual(s.plusFraction, false);
    assert.strictEqual(s.workflowState, "awaiting-remediation");
    const routed = resolveStartNextSessionPrompt(s);
    assert.ok(routed.message.includes("remediation owed"));
    assert.ok(routed.prompt !== `Start the next session of \`${s.name}\`.`);
  });

  test("006 Mode B verified: quiet, 3/3 runtime-grown count, verdict surfaced", () => {
    const s = sets.get("006-whisper-mode")!;
    assert.strictEqual(s.state, "complete");
    assert.strictEqual(s.totalSessions, 3);
    assert.strictEqual(s.sessionsCompleted, 3);
    assert.strictEqual(s.plusFraction, false);
    assert.strictEqual(s.verificationMarker, "");
    assert.deepStrictEqual(s.completedVerification, {
      sessionNumber: 3,
      verdict: "VERIFIED",
    });
    assert.ok(!actionIds(s).includes("dabbler.copyVerificationKickoffPrompt"));
  });
});

suite("uat-matrix generator (Set 062 S4)", () => {
  test("the committed matrix carries the workspace file naming both projects", () => {
    const ws = JSON.parse(
      fs.readFileSync(path.join(MATRIX_ROOT, generator.WORKSPACE_FILE), "utf8"),
    ) as { folders: Array<{ path: string }> };
    assert.deepStrictEqual(
      ws.folders.map((f) => f.path).sort(),
      ["hello-world-full", "hello-world-lightweight"],
    );
  });

  test("the disposable copy derives identically to the committed source", () => {
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-uat-gen-test-"));
    try {
      const workspacePath = generator.makeUatWorkspace(sandbox);
      assert.ok(fs.existsSync(workspacePath));
      const dest = path.dirname(workspacePath);
      const copied = readSessionSets(path.join(dest, "hello-world-lightweight"));
      const source = readSessionSets(LW_ROOT);
      const signal = (s: SessionSet) => ({
        name: s.name,
        state: s.state,
        marker: s.verificationMarker,
        plus: s.plusFraction,
        total: s.totalSessions,
        done: s.sessionsCompleted,
      });
      assert.deepStrictEqual(
        copied.map(signal).sort((a, b) => a.name.localeCompare(b.name)),
        source.map(signal).sort((a, b) => a.name.localeCompare(b.name)),
      );
    } finally {
      fs.rmSync(sandbox, { recursive: true, force: true });
    }
  });

  test("the generated copy pins pythonPath to the repo venv when one exists (Set 062 S5)", () => {
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-uat-gen-test-"));
    try {
      const workspacePath = generator.makeUatWorkspace(sandbox);
      const generated = JSON.parse(fs.readFileSync(workspacePath, "utf8")) as {
        settings?: Record<string, unknown>;
      };
      const committed = JSON.parse(
        fs.readFileSync(path.join(MATRIX_ROOT, generator.WORKSPACE_FILE), "utf8"),
      ) as { settings?: Record<string, unknown> };
      // The committed fixture must never carry a machine-specific path.
      assert.strictEqual(
        committed.settings?.["dabblerSessionSets.pythonPath"],
        undefined,
      );
      const interp = generator.repoVenvInterpreter();
      if (interp) {
        assert.strictEqual(
          generated.settings?.["dabblerSessionSets.pythonPath"],
          interp,
        );
      } else {
        assert.strictEqual(
          generated.settings?.["dabblerSessionSets.pythonPath"],
          undefined,
        );
      }
    } finally {
      fs.rmSync(sandbox, { recursive: true, force: true });
    }
  });
});
