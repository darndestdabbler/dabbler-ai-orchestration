import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  parsePrerequisites,
  readSessionSets,
} from "../../utils/fileSystem";
import { blockedByPrereqsBadge } from "../../providers/SessionSetsModel";
import { SessionSet, SessionState } from "../../types";

// Set 047 Session 5 — spec.md ``prerequisites`` field schema +
// `readSessionSets` derives `blockedByPrereqs` cross-reference.
// Tests cover (1) the parser shape, (2) `readSessionSets`'
// cross-reference pass, (3) the badge predicate.

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-prereq-test-"));
}

function writeSpec(setDir: string, body: string): void {
  fs.mkdirSync(setDir, { recursive: true });
  fs.writeFileSync(path.join(setDir, "spec.md"), body, "utf8");
}

function writeState(
  setDir: string,
  status: SessionState,
  totalSessions = 2,
): void {
  const sessions = [];
  for (let n = 1; n <= totalSessions; n++) {
    sessions.push({
      number: n,
      title: `S${n}`,
      status: status === "complete" ? "complete" : status === "in-progress" && n === 1 ? "in-progress" : "not-started",
      startedAt: null,
      completedAt: null,
      orchestrator: null,
      verificationVerdict: null,
    });
  }
  fs.writeFileSync(
    path.join(setDir, "session-state.json"),
    JSON.stringify(
      {
        schemaVersion: 4,
        sessionSetName: path.basename(setDir),
        status,
        sessions,
      },
      null,
      2,
    ),
    "utf8",
  );
}

function specWithPrereqs(totalSessions: number, prereqs: string): string {
  return [
    "# Test Set",
    "",
    "## Session Set Configuration",
    "",
    "```yaml",
    `totalSessions: ${totalSessions}`,
    "requiresUAT: false",
    "requiresE2E: false",
    prereqs,
    "```",
    "",
  ].join("\n");
}

suite("Set 047 / S5 — parsePrerequisites", () => {
  test("returns null when field is absent", () => {
    const dir = makeTmpDir();
    try {
      const set = path.join(dir, "047-set");
      writeSpec(set, specWithPrereqs(2, ""));
      const result = parsePrerequisites(path.join(set, "spec.md"));
      assert.strictEqual(result, null);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  test("returns empty array when field is `prerequisites: []`", () => {
    const dir = makeTmpDir();
    try {
      const set = path.join(dir, "047-set");
      writeSpec(set, specWithPrereqs(2, "prerequisites: []"));
      const result = parsePrerequisites(path.join(set, "spec.md"));
      assert.deepStrictEqual(result, []);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  test("parses canonical list form", () => {
    const dir = makeTmpDir();
    try {
      const set = path.join(dir, "047-set");
      writeSpec(
        set,
        specWithPrereqs(
          2,
          [
            "prerequisites:",
            "  - slug: 046-other-set",
            "    condition: complete",
            "  - slug: 044-another-set",
            "    condition: complete",
          ].join("\n"),
        ),
      );
      const result = parsePrerequisites(path.join(set, "spec.md"));
      assert.deepStrictEqual(result, [
        { slug: "046-other-set", condition: "complete" },
        { slug: "044-another-set", condition: "complete" },
      ]);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  test("drops entries missing slug or with unknown condition", () => {
    const dir = makeTmpDir();
    try {
      const set = path.join(dir, "047-set");
      writeSpec(
        set,
        specWithPrereqs(
          2,
          [
            "prerequisites:",
            "  - slug: 046-good",
            "    condition: complete",
            "  - condition: complete", // no slug — drop
            "  - slug: 044-bad-cond",
            "    condition: started", // unknown — drop
          ].join("\n"),
        ),
      );
      const result = parsePrerequisites(path.join(set, "spec.md"));
      assert.deepStrictEqual(result, [
        { slug: "046-good", condition: "complete" },
      ]);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  test("strips YAML inline comments from slug and condition values (S5 verifier Important-1)", () => {
    const dir = makeTmpDir();
    try {
      const set = path.join(dir, "047-set");
      writeSpec(
        set,
        specWithPrereqs(
          2,
          [
            "prerequisites:",
            "  - slug: 046-with-comment # earlier set",
            "    condition: complete # canonical",
          ].join("\n"),
        ),
      );
      const result = parsePrerequisites(path.join(set, "spec.md"));
      assert.deepStrictEqual(result, [
        { slug: "046-with-comment", condition: "complete" },
      ]);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  test("drops entry when condition is present-but-unparseable, not silently default (S5 verifier Important-1)", () => {
    const dir = makeTmpDir();
    try {
      const set = path.join(dir, "047-set");
      writeSpec(
        set,
        specWithPrereqs(
          2,
          [
            "prerequisites:",
            "  - slug: 046-bad-cond",
            "    condition: started # not in enum",
            "  - slug: 044-good",
            "    condition: complete",
          ].join("\n"),
        ),
      );
      const result = parsePrerequisites(path.join(set, "spec.md"));
      assert.deepStrictEqual(result, [
        { slug: "044-good", condition: "complete" },
      ]);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  test("defaults condition to 'complete' when omitted", () => {
    const dir = makeTmpDir();
    try {
      const set = path.join(dir, "047-set");
      writeSpec(
        set,
        specWithPrereqs(
          2,
          [
            "prerequisites:",
            "  - slug: 046-bare",
          ].join("\n"),
        ),
      );
      const result = parsePrerequisites(path.join(set, "spec.md"));
      assert.deepStrictEqual(result, [
        { slug: "046-bare", condition: "complete" },
      ]);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });
});

suite("Set 047 / S5 — readSessionSets cross-reference derivation", () => {
  function setupRepo(): string {
    const root = makeTmpDir();
    fs.mkdirSync(path.join(root, "docs", "session-sets"), { recursive: true });
    return root;
  }

  function setDir(root: string, slug: string): string {
    return path.join(root, "docs", "session-sets", slug);
  }

  test("blockedByPrereqs=true when prereq target is in-progress", () => {
    const root = setupRepo();
    try {
      // 046 is in-progress; 047 declares it as prereq → blocked.
      writeSpec(setDir(root, "046-prereq"), specWithPrereqs(1, ""));
      writeState(setDir(root, "046-prereq"), "in-progress", 1);
      writeSpec(
        setDir(root, "047-blocked"),
        specWithPrereqs(
          2,
          [
            "prerequisites:",
            "  - slug: 046-prereq",
            "    condition: complete",
          ].join("\n"),
        ),
      );
      writeState(setDir(root, "047-blocked"), "not-started", 2);
      const sets = readSessionSets(root);
      const blocked = sets.find((s) => s.name === "047-blocked")!;
      const prereqSet = sets.find((s) => s.name === "046-prereq")!;
      assert.strictEqual(prereqSet.state, "in-progress");
      assert.strictEqual(blocked.blockedByPrereqs, true);
      assert.deepStrictEqual(blocked.prerequisites, [
        { slug: "046-prereq", condition: "complete" },
      ]);
    } finally {
      fs.rmSync(root, { recursive: true });
    }
  });

  test("blockedByPrereqs=false when prereq target is complete", () => {
    const root = setupRepo();
    try {
      writeSpec(setDir(root, "046-done"), specWithPrereqs(1, ""));
      writeState(setDir(root, "046-done"), "complete", 1);
      writeSpec(
        setDir(root, "047-unblocked"),
        specWithPrereqs(
          1,
          [
            "prerequisites:",
            "  - slug: 046-done",
            "    condition: complete",
          ].join("\n"),
        ),
      );
      writeState(setDir(root, "047-unblocked"), "not-started", 1);
      const sets = readSessionSets(root);
      const unblocked = sets.find((s) => s.name === "047-unblocked")!;
      assert.strictEqual(unblocked.blockedByPrereqs, false);
    } finally {
      fs.rmSync(root, { recursive: true });
    }
  });

  test("blockedByPrereqs=true when prereq slug doesn't resolve (typo / missing set)", () => {
    const root = setupRepo();
    try {
      writeSpec(
        setDir(root, "047-typo"),
        specWithPrereqs(
          1,
          [
            "prerequisites:",
            "  - slug: 999-does-not-exist",
            "    condition: complete",
          ].join("\n"),
        ),
      );
      writeState(setDir(root, "047-typo"), "not-started", 1);
      const sets = readSessionSets(root);
      const set = sets.find((s) => s.name === "047-typo")!;
      // A missing-target slug keeps the row blocked — a silent unblock
      // on typo would mask the very dependency error the field is for.
      assert.strictEqual(set.blockedByPrereqs, true);
    } finally {
      fs.rmSync(root, { recursive: true });
    }
  });

  test("blockedByPrereqs=false when no prerequisites field is declared", () => {
    const root = setupRepo();
    try {
      writeSpec(setDir(root, "047-standalone"), specWithPrereqs(1, ""));
      writeState(setDir(root, "047-standalone"), "not-started", 1);
      const sets = readSessionSets(root);
      const set = sets.find((s) => s.name === "047-standalone")!;
      assert.strictEqual(set.prerequisites, null);
      assert.strictEqual(set.blockedByPrereqs, false);
    } finally {
      fs.rmSync(root, { recursive: true });
    }
  });

  test("blockedByPrereqs respects multiple prereqs (ANY unsatisfied → blocked)", () => {
    const root = setupRepo();
    try {
      writeSpec(setDir(root, "044-done"), specWithPrereqs(1, ""));
      writeState(setDir(root, "044-done"), "complete", 1);
      writeSpec(setDir(root, "046-in-progress"), specWithPrereqs(1, ""));
      writeState(setDir(root, "046-in-progress"), "in-progress", 1);
      writeSpec(
        setDir(root, "047-multi"),
        specWithPrereqs(
          1,
          [
            "prerequisites:",
            "  - slug: 044-done",
            "    condition: complete",
            "  - slug: 046-in-progress",
            "    condition: complete",
          ].join("\n"),
        ),
      );
      writeState(setDir(root, "047-multi"), "not-started", 1);
      const sets = readSessionSets(root);
      const set = sets.find((s) => s.name === "047-multi")!;
      assert.strictEqual(set.blockedByPrereqs, true);
    } finally {
      fs.rmSync(root, { recursive: true });
    }
  });
});

suite("Set 047 / S5 — blockedByPrereqsBadge", () => {
  function fakeSet(over: Partial<SessionSet> = {}): SessionSet {
    return {
      name: "x",
      dir: "/x",
      specPath: "/x/spec.md",
      activityPath: "/x/activity-log.json",
      changeLogPath: "/x/change-log.md",
      statePath: "/x/session-state.json",
      aiAssignmentPath: "/x/ai-assignment.md",
      uatChecklistPath: "/x/x-uat-checklist.json",
      state: "not-started",
      totalSessions: null,
      sessionsCompleted: 0,
      lastTouched: null,
      liveSession: null,
      config: { requiresUAT: false, requiresE2E: false, uatScope: "none", tier: "full", verificationMode: "out-of-band-or-none" },
      uatSummary: null,
      root: "/x",
      needsMigration: false,
      migrationTargetSchemaVersion: null,
      schemaVersionOnDisk: null,
      prerequisites: null,
      blockedByPrereqs: false,
      plusFraction: false,
      ...over,
    };
  }

  test("renders the badge when blockedByPrereqs=true on a non-terminal row", () => {
    assert.strictEqual(
      blockedByPrereqsBadge(fakeSet({ state: "not-started", blockedByPrereqs: true })),
      "[BLOCKED BY PREREQS]",
    );
    assert.strictEqual(
      blockedByPrereqsBadge(fakeSet({ state: "in-progress", blockedByPrereqs: true })),
      "[BLOCKED BY PREREQS]",
    );
  });

  test("suppresses the badge on complete/cancelled rows (no longer actionable)", () => {
    assert.strictEqual(
      blockedByPrereqsBadge(fakeSet({ state: "complete", blockedByPrereqs: true })),
      "",
    );
    assert.strictEqual(
      blockedByPrereqsBadge(fakeSet({ state: "cancelled", blockedByPrereqs: true })),
      "",
    );
  });

  test("renders nothing when blockedByPrereqs=false", () => {
    assert.strictEqual(
      blockedByPrereqsBadge(fakeSet({ blockedByPrereqs: false })),
      "",
    );
  });
});
