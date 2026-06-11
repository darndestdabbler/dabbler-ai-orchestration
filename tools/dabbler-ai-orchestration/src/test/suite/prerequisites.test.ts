import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  parsePrerequisites,
  readAllSessionSets,
  readSessionSets,
} from "../../utils/fileSystem";
import {
  BLOCKED_MARKER,
  blockedMarker,
  blockedTooltip,
} from "../../providers/SessionSetsModel";
import { SessionSet, SessionState } from "../../types";

// Set 047 Session 5 — spec.md ``prerequisites`` field schema +
// `readSessionSets` derives `blockedByPrereqs` cross-reference.
// Tests cover (1) the parser shape, (2) `readSessionSets`'
// cross-reference pass, (3) the marker + tooltip predicates.
//
// Set 061 Session 2 (spec D3): the cross-reference now also carries
// the full unsatisfied list (`unsatisfiedPrereqs`) so the blocked
// marker's tooltip can name each blocking prerequisite and its
// current state; the `[BLOCKED BY PREREQS]` description badge is
// retired in favor of the quiet marker (Set 050 asterisk pattern).

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
      // Set 061 S2 (D3): the derivation carries the unsatisfied list
      // (slug + condition + target state) for the marker's tooltip.
      assert.deepStrictEqual(blocked.unsatisfiedPrereqs, [
        { slug: "046-prereq", condition: "complete", targetState: "in-progress" },
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
      assert.deepStrictEqual(unblocked.unsatisfiedPrereqs, []);
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
      // Set 061 S2 (D3): the unknown target is named with the
      // "unknown" sentinel so the tooltip can say "check the slug".
      assert.deepStrictEqual(set.unsatisfiedPrereqs, [
        { slug: "999-does-not-exist", condition: "complete", targetState: "unknown" },
      ]);
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
      assert.deepStrictEqual(set.unsatisfiedPrereqs, []);
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
      // Set 061 S2 (D3): only the UNSATISFIED prereq is carried —
      // the satisfied one (044-done) does not appear in the list.
      assert.deepStrictEqual(set.unsatisfiedPrereqs, [
        { slug: "046-in-progress", condition: "complete", targetState: "in-progress" },
      ]);
    } finally {
      fs.rmSync(root, { recursive: true });
    }
  });

  test("cross-root: prereq satisfied by a set discovered in a different root (Set 061 S2)", () => {
    // Two workspace roots: the dependant lives in rootA; its prereq
    // lives — complete — in rootB. The merged readAllSessionSets()
    // pass must resolve it (the S5 Important-2 re-derivation), so the
    // dependant is NOT blocked even though a single-root scan of
    // rootA alone would read the slug as unknown.
    const rootA = setupRepo();
    const rootB = setupRepo();
    const vscode = require("vscode");
    const origFolders = vscode.workspace.workspaceFolders;
    try {
      writeSpec(
        setDir(rootA, "047-dependant"),
        specWithPrereqs(
          1,
          [
            "prerequisites:",
            "  - slug: 046-elsewhere",
            "    condition: complete",
          ].join("\n"),
        ),
      );
      writeState(setDir(rootA, "047-dependant"), "not-started", 1);
      writeSpec(setDir(rootB, "046-elsewhere"), specWithPrereqs(1, ""));
      writeState(setDir(rootB, "046-elsewhere"), "complete", 1);

      // Sanity: the single-root scan of rootA reads the slug as
      // unknown → blocked.
      const single = readSessionSets(rootA).find((s) => s.name === "047-dependant")!;
      assert.strictEqual(single.blockedByPrereqs, true);
      assert.strictEqual(single.unsatisfiedPrereqs[0].targetState, "unknown");

      vscode.workspace.workspaceFolders = [
        { uri: { fsPath: rootA }, name: "rootA", index: 0 },
        { uri: { fsPath: rootB }, name: "rootB", index: 1 },
      ];
      const merged = readAllSessionSets();
      const dep = merged.find((s) => s.name === "047-dependant")!;
      assert.strictEqual(dep.blockedByPrereqs, false);
      assert.deepStrictEqual(dep.unsatisfiedPrereqs, []);
    } finally {
      vscode.workspace.workspaceFolders = origFolders;
      fs.rmSync(rootA, { recursive: true });
      fs.rmSync(rootB, { recursive: true });
    }
  });
});

suite("Set 061 / S2 — blockedMarker + blockedTooltip (D3)", () => {
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
      unsatisfiedPrereqs: [],
      plusFraction: false,
      externalVerificationNoteExists: false,
      completedVerification: null,
      verificationMarker: "",
      ...over,
    };
  }

  const ONE_UNSATISFIED = [
    { slug: "045-log-harvest", condition: "complete" as const, targetState: "in-progress" as const },
  ];

  test("renders the marker when unsatisfied prereqs exist on a non-terminal row", () => {
    for (const state of ["not-started", "in-progress"] as SessionState[]) {
      assert.strictEqual(
        blockedMarker(fakeSet({ state, blockedByPrereqs: true, unsatisfiedPrereqs: ONE_UNSATISFIED })),
        BLOCKED_MARKER,
      );
    }
  });

  test("suppresses the marker on complete/cancelled rows (terminal suppression unchanged)", () => {
    for (const state of ["complete", "cancelled"] as SessionState[]) {
      assert.strictEqual(
        blockedMarker(fakeSet({ state, blockedByPrereqs: true, unsatisfiedPrereqs: ONE_UNSATISFIED })),
        "",
      );
      assert.strictEqual(
        blockedTooltip(fakeSet({ state, blockedByPrereqs: true, unsatisfiedPrereqs: ONE_UNSATISFIED })),
        "",
      );
    }
  });

  test("renders nothing when no prereq is unsatisfied", () => {
    assert.strictEqual(blockedMarker(fakeSet()), "");
    assert.strictEqual(blockedTooltip(fakeSet()), "");
  });

  test("marker is a text-presentation glyph, not the all-caps badge", () => {
    // The Set 047 badge text is retired — the marker is a single
    // chain glyph with U+FE0E so themes render it as text, not emoji.
    assert.strictEqual(BLOCKED_MARKER, "⛓︎");
    assert.ok(!BLOCKED_MARKER.includes("BLOCKED"));
  });

  test("tooltip names each unsatisfied prerequisite with its current state", () => {
    const set = fakeSet({
      state: "not-started",
      blockedByPrereqs: true,
      unsatisfiedPrereqs: [
        { slug: "045-log-harvest", condition: "complete", targetState: "in-progress" },
        { slug: "047-state-file-schema-v4-audit", condition: "complete", targetState: "not-started" },
      ],
    });
    assert.strictEqual(
      blockedTooltip(set),
      "Blocked by prerequisites: 045-log-harvest (in progress), " +
        "047-state-file-schema-v4-audit (not started) — all must complete first.",
    );
  });

  test("tooltip explains unknown-slug prereqs (typos stay blocking AND self-explanatory)", () => {
    const set = fakeSet({
      state: "in-progress",
      blockedByPrereqs: true,
      unsatisfiedPrereqs: [
        { slug: "999-typo", condition: "complete", targetState: "unknown" },
      ],
    });
    assert.strictEqual(
      blockedTooltip(set),
      "Blocked by prerequisites: 999-typo (unknown set — check the slug) — all must complete first.",
    );
  });
});

suite("Set 061 / S2 — [BLOCKED BY PREREQS] badge retired (D3)", () => {
  // The all-caps description badge must not survive anywhere in the
  // shipped Explorer surface: not in the model helpers, not in the
  // host's RowPayload assembly, not in the webview renderer. A source
  // scan keeps the retirement honest without depending on private
  // functions.
  test("badge literal is gone from the model, view, and webview client", () => {
    const extRoot = path.resolve(__dirname, "..", "..", "..");
    const shippedSources = [
      path.join(extRoot, "src", "providers", "SessionSetsModel.ts"),
      path.join(extRoot, "src", "providers", "CustomSessionSetsView.ts"),
      path.join(extRoot, "media", "session-sets-tree", "client.js"),
    ];
    for (const file of shippedSources) {
      const text = fs.readFileSync(file, "utf8");
      assert.ok(
        !text.includes("[BLOCKED BY PREREQS]"),
        `badge literal still present in ${path.basename(file)}`,
      );
    }
  });
});
