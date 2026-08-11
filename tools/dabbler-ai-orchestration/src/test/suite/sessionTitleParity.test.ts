import * as assert from "assert";
import * as fs from "fs";
import { createRequire } from "module";
import * as os from "os";
import * as path from "path";

import {
  healGenericTitles,
  healTitle,
  isGenericTitle,
  needsTitleHeal,
  normalizeToV4Shape,
} from "../../utils/progress";
import { inferStateInMemory, readStatus } from "../../utils/sessionState";
import { readSessionSets } from "../../utils/fileSystem";

// Set 115 S1 — the TypeScript half of the cross-language title-parity
// gate.
//
// See ai_router/tests/fixtures/session-title-parity.json (the corpus,
// whose _readme explains the mechanism) and
// ai_router/tests/test_session_title_parity.py (the Python half).
//
// Two implementations resolve a session's title, and they disagreed:
// this side hardcoded `Session ${n}` in a module that had already
// computed the spec's title map. Because resolution puts the stored
// ledger first, whichever writer reached disk first made its answer
// permanent — which is why every set in the Explorer showed generic
// labels. Neither language owns the corpus: change one side alone and
// its own suite fails; change the corpus alone and both fail.

type TitleCase = {
  name: string;
  storedTitle: unknown;
  number: number;
  specTitles: Record<string, string>;
  expected: string | null;
  isGeneric: boolean;
};

const CORPUS_PATH = path.resolve(
  __dirname,
  "../../../../../ai_router/tests/fixtures/session-title-parity.json",
);

function loadCorpus(): {
  cases: TitleCase[];
  specFixture: {
    specMd: string;
    storedTitles: string[];
    expectedTitles: string[];
    expectedFromEmpty: string[];
  };
} {
  return JSON.parse(fs.readFileSync(CORPUS_PATH, "utf8"));
}

function specTitleMapOf(c: TitleCase): Map<number, string> {
  const m = new Map<number, string>();
  for (const [k, v] of Object.entries(c.specTitles)) m.set(parseInt(k, 10), v);
  return m;
}

function makeTmpSet(specMd: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-title-parity-"));
  const dir = path.join(root, "115-fixture");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "spec.md"), specMd, "utf8");
  return dir;
}

suite("Set 115 S1 — session-title parity corpus", () => {
  const { cases, specFixture } = loadCorpus();

  test("the corpus is non-trivial (guards a silently-emptied fixture)", () => {
    assert.ok(cases.length >= 10, `expected >=10 cases, got ${cases.length}`);
  });

  for (const c of cases) {
    test(`healTitle: ${c.name}`, () => {
      assert.strictEqual(
        healTitle(c.storedTitle, c.number, specTitleMapOf(c)),
        c.expected,
      );
    });

    test(`isGenericTitle: ${c.name}`, () => {
      assert.strictEqual(isGenericTitle(c.storedTitle, c.number), c.isGeneric);
    });
  }

  test("healGenericTitles applies the rule across an array", () => {
    const sessions = [
      { number: 1, title: "Session 1", status: "complete" },
      { number: 2, title: "A title the operator wrote", status: "complete" },
      { number: 3, title: "Session 3", status: "not-started" },
    ];
    const specTitles = new Map([
      [1, "First"],
      [2, "Second"],
      [3, "Third"],
    ]);
    assert.strictEqual(healGenericTitles(sessions, specTitles), 2);
    assert.deepStrictEqual(
      sessions.map((s) => s.title),
      ["First", "A title the operator wrote", "Third"],
    );
  });

  test("needsTitleHeal is the cheap precheck", () => {
    // The reader consults this BEFORE reading spec.md, so a healthy set
    // costs no extra disk read on the tree scan.
    assert.strictEqual(needsTitleHeal([{ number: 1, title: "Real title" }]), false);
    assert.strictEqual(needsTitleHeal([{ number: 1, title: "Session 1" }]), true);
    assert.strictEqual(needsTitleHeal([{ number: 1, title: null }]), true);
    // Malformed entries are the invariant validators' complaint, not
    // this helper's: they must not provoke a spec read on their own.
    assert.strictEqual(needsTitleHeal([{ title: "Session 1" }]), false);
  });

  test("synthesis resolves titles from spec.md when there is no prior ledger", () => {
    const dir = makeTmpSet(specFixture.specMd);
    try {
      const state = inferStateInMemory(dir);
      const sessions = state.sessions as Array<Record<string, unknown>>;
      assert.deepStrictEqual(
        sessions.map((s) => s.title),
        specFixture.expectedFromEmpty,
      );
    } finally {
      fs.rmSync(path.dirname(dir), { recursive: true, force: true });
    }
  });

  test("the read view heals a sticky-generic ledger without rewriting it", () => {
    // A closed set gets no further boundary write, so the read view is
    // the only place its generic labels can heal — and it must heal
    // WITHOUT touching the file (no migration script; closed history is
    // a record).
    const dir = makeTmpSet(specFixture.specMd);
    try {
      const state = {
        schemaVersion: 4,
        sessionSetName: "115-fixture",
        status: "complete",
        sessions: specFixture.storedTitles.map((title, i) => ({
          number: i + 1,
          title,
          status: "complete",
        })),
      };
      const statePath = path.join(dir, "session-state.json");
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");
      const before = fs.readFileSync(statePath, "utf8");

      const view = normalizeToV4Shape(state, path.join(dir, "spec.md"));

      assert.deepStrictEqual(
        (view.sessions as Array<Record<string, unknown>>).map((s) => s.title),
        specFixture.expectedTitles,
      );
      assert.strictEqual(
        fs.readFileSync(statePath, "utf8"),
        before,
        "the read must not write",
      );
    } finally {
      fs.rmSync(path.dirname(dir), { recursive: true, force: true });
    }
  });

  test("the read view leaves a healthy ledger alone", () => {
    const dir = makeTmpSet(specFixture.specMd);
    try {
      const view = normalizeToV4Shape(
        {
          schemaVersion: 4,
          sessionSetName: "115-fixture",
          status: "complete",
          sessions: [
            { number: 1, title: "Something else entirely", status: "complete" },
          ],
        },
        path.join(dir, "spec.md"),
      );
      assert.strictEqual(
        (view.sessions as Array<Record<string, unknown>>)[0].title,
        "Something else entirely",
      );
    } finally {
      fs.rmSync(path.dirname(dir), { recursive: true, force: true });
    }
  });

  test("a missing spec degrades to the stored label rather than throwing", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-title-nospec-"));
    try {
      const view = normalizeToV4Shape(
        {
          schemaVersion: 4,
          sessionSetName: "no-spec",
          status: "not-started",
          sessions: [{ number: 1, title: "Session 1", status: "not-started" }],
        },
        path.join(root, "spec.md"),
      );
      assert.strictEqual(
        (view.sessions as Array<Record<string, unknown>>)[0].title,
        "Session 1",
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

suite("Set 115 S1 — the scan reads each spec.md at most once per set", () => {
  // Round-1 finding (Major, both discovery lenses): the absent-state path
  // re-derived the same synthesis twice per set, and each derivation read
  // `spec.md` twice — once for the title map and once for totalSessions.
  // The spec's own step 2 says "No new file read — if the change adds
  // one, it is the wrong change", so this counts them.
  function countSpecReads(root: string, run: () => void): number {
    // The `import * as fs` namespace is frozen under ts-node, so reach
    // the live CommonJS module object the production code actually
    // calls into.
    const liveFs = createRequire(__filename)("fs") as {
      readFileSync: typeof fs.readFileSync;
    };
    const realRead = liveFs.readFileSync;
    let count = 0;
    liveFs.readFileSync = ((p: fs.PathOrFileDescriptor, ...rest: unknown[]) => {
      if (typeof p === "string" && p.endsWith(`${path.sep}spec.md`)) count += 1;
      return (realRead as (...a: unknown[]) => unknown)(p, ...rest);
    }) as typeof fs.readFileSync;
    try {
      run();
    } finally {
      liveFs.readFileSync = realRead;
    }
    void root;
    return count;
  }

  function makeRepo(specMd: string, extra?: (dir: string) => void): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-specreads-"));
    const dir = path.join(root, "docs", "session-sets", "115-fixture");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "spec.md"), specMd, "utf8");
    extra?.(dir);
    return root;
  }

  const SPEC_WITH_HEADINGS =
    "# Fixture\n\n### Session 1 of 2: First\n\nBody.\n\n### Session 2 of 2: Second\n\nBody.\n";

  test("a spec-only set: one synthesis, one spec.md read", () => {
    const root = makeRepo(SPEC_WITH_HEADINGS);
    try {
      const reads = countSpecReads(root, () => {
        const sets = readSessionSets(root);
        assert.strictEqual(sets.length, 1);
        assert.deepStrictEqual(
          (sets[0].sessions ?? []).map((s) => s.title),
          ["First", "Second"],
        );
      });
      // `parseSessionSetConfig` and `parsePrerequisites` each read the
      // spec — pre-existing, unchanged by this session. What must not
      // grow is the synthesis: one read, not the four the round-1
      // finding measured.
      assert.ok(
        reads <= 3,
        `spec.md read ${reads} times for one spec-only set; the synthesis must read it once`,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("a set WITH a healthy state file never reads spec.md for titles", () => {
    const root = makeRepo(SPEC_WITH_HEADINGS, (dir) => {
      fs.writeFileSync(
        path.join(dir, "session-state.json"),
        JSON.stringify({
          schemaVersion: 4,
          sessionSetName: "115-fixture",
          status: "complete",
          sessions: [
            { number: 1, title: "First", status: "complete" },
            { number: 2, title: "Second", status: "complete" },
          ],
        }),
        "utf8",
      );
    });
    try {
      const reads = countSpecReads(root, () => readSessionSets(root));
      assert.ok(
        reads <= 2,
        `spec.md read ${reads} times for a healthy set; the heal must add none`,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

suite("Set 115 S1 — an EMPTY activity log is not evidence of progress", () => {
  // Round-2 finding (Major): the modern authoring flow creates
  // `{"entries": []}` up front. The router treats that as not-started
  // (`_activity_log_has_entries`, Set 077 S4 / A12); the extension
  // treated mere file presence as in-progress, so every freshly-authored
  // set showed as in flight in the Explorer.
  function setWithLog(contents: string): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-emptylog-"));
    const dir = path.join(root, "115-fixture");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "spec.md"),
      "# Fixture\n\n### Session 1 of 2: First\n\n### Session 2 of 2: Second\n",
      "utf8",
    );
    fs.writeFileSync(path.join(dir, "activity-log.json"), contents, "utf8");
    return dir;
  }

  test('{"entries": []} reads as not-started', () => {
    const dir = setWithLog(JSON.stringify({ entries: [] }));
    try {
      assert.strictEqual(inferStateInMemory(dir).status, "not-started");
      assert.strictEqual(readStatus(dir), "not-started");
    } finally {
      fs.rmSync(path.dirname(dir), { recursive: true, force: true });
    }
  });

  test("a bare empty list reads as not-started", () => {
    const dir = setWithLog("[]");
    try {
      assert.strictEqual(inferStateInMemory(dir).status, "not-started");
    } finally {
      fs.rmSync(path.dirname(dir), { recursive: true, force: true });
    }
  });

  test("a log WITH entries still reads as in-progress", () => {
    const dir = setWithLog(
      JSON.stringify({
        entries: [{ sessionNumber: 1, dateTime: "2026-01-01T00:00:00-04:00" }],
      }),
    );
    try {
      const state = inferStateInMemory(dir);
      assert.strictEqual(state.status, "in-progress");
      const sessions = state.sessions as Array<Record<string, unknown>>;
      assert.strictEqual(sessions[0].startedAt, "2026-01-01T00:00:00-04:00");
    } finally {
      fs.rmSync(path.dirname(dir), { recursive: true, force: true });
    }
  });

  test("an unreadable log keeps the conservative in-progress inference", () => {
    const dir = setWithLog("{ not json");
    try {
      assert.strictEqual(inferStateInMemory(dir).status, "in-progress");
    } finally {
      fs.rmSync(path.dirname(dir), { recursive: true, force: true });
    }
  });

  test("an unexpected shape keeps the conservative in-progress inference", () => {
    const dir = setWithLog(JSON.stringify({ entries: "nope" }));
    try {
      assert.strictEqual(inferStateInMemory(dir).status, "in-progress");
    } finally {
      fs.rmSync(path.dirname(dir), { recursive: true, force: true });
    }
  });
});
