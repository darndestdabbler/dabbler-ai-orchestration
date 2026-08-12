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
import { readSessionSets } from "../../utils/fileSystem";
import { effectiveStatusOf, glyphStatusOf } from "../../providers/sessionStepModel";
import {
  sessionNodes,
  stepDescriptor,
  stepNodes,
  stepStartLabel,
} from "../../providers/workExplorerTreeModel";

const EXT_ROOT = path.resolve(__dirname, "../../..");
const MATRIX_ROOT = path.join(EXT_ROOT, "test-fixtures", "uat-matrix");
const FULL_ROOT = path.join(MATRIX_ROOT, "hello-world-full");

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

  test("001-hello-page is the control row: 1/3 in flight", () => {
    const s = sets.get("001-hello-page")!;
    assert.strictEqual(s.state, "in-progress");
    assert.strictEqual(s.totalSessions, 3);
    assert.strictEqual(s.sessionsCompleted, 1);
    assert.strictEqual(s.liveSession?.currentSession, 2);
    assert.strictEqual(s.needsMigration, false);
    assert.strictEqual(s.blockedByPrereqs, false);
  });

  test("001-hello-page is the row the Set 127 guided look is walked on", () => {
    // The walk (`s2-uat-walk.md`) asks the operator to look at one thing:
    // a finished step, the step the session is DERIVED to be on, and an
    // unstarted one below it — the last carrying no time at all. An
    // instruction nothing checks is an instruction not known to be
    // followable (project-guidance: UAT is pre-verified by automation),
    // so the fixture's own rows are pinned here, through the real scan
    // and the real row builder.
    const s = sets.get("001-hello-page")!;
    const node = { kind: "set", set: s } as const;
    const session = sessionNodes(node).find((n) => n.session.number === 2)!;
    const rows = stepNodes(session).map((n) => n.row);
    assert.deepStrictEqual(
      rows.map((r) => [glyphStatusOf(effectiveStatusOf(r)), r.isActive, r.startedAt]),
      [
        ["complete", false, "2026-06-01T11:00:00-04:00"],
        ["in-progress", true, "2026-06-01T11:30:00-04:00"],
        ["not-started", false, null],
      ],
    );
    // Derived, not recorded: nothing on disk says `in-progress`, which is
    // the whole claim of Set 127 and the reason this row is worth walking.
    assert.strictEqual(rows[1].status, "pending");
    // And the same three rows agree with the Python checklist, which the
    // cross-language corpus proves case by case.
    assert.deepStrictEqual(
      stepNodes(session).map((n) => stepDescriptor(n).description),
      [
        stepStartLabel("2026-06-01T11:00:00-04:00"),
        stepStartLabel("2026-06-01T11:30:00-04:00"),
        undefined,
      ],
    );
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

suite("uat-matrix generator (Set 062 S4)", () => {
  test("the committed matrix carries the workspace file naming its project", () => {
    const ws = JSON.parse(
      fs.readFileSync(path.join(MATRIX_ROOT, generator.WORKSPACE_FILE), "utf8"),
    ) as { folders: Array<{ path: string }> };
    assert.deepStrictEqual(
      ws.folders.map((f) => f.path).sort(),
      ["hello-world-full"],
    );
  });

  test("the disposable copy derives identically to the committed source", () => {
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-uat-gen-test-"));
    try {
      const workspacePath = generator.makeUatWorkspace(sandbox);
      assert.ok(fs.existsSync(workspacePath));
      const dest = path.dirname(workspacePath);
      const copied = readSessionSets(path.join(dest, "hello-world-full"));
      const source = readSessionSets(FULL_ROOT);
      const signal = (s: SessionSet) => ({
        name: s.name,
        state: s.state,
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
