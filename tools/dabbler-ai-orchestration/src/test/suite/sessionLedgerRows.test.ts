// Set 110 Session 2 — the fourth tree level's data source.
//
// Operator ask 1 (2026-08-04) adds a session level under each set. The
// operator note argued it is cheap because "the session data is already
// in memory", and it very nearly was: `readSessionSets` parses and
// NORMALISES the `sessions[]` ledger to derive `plusFraction`,
// `completedVerification` and `verificationMarker`, and then discards
// it. `normalizeLedgerSessions` retains it, so the fourth level costs
// no additional read and stays off the startup path S1 measured.
//
// The tolerance rules matter more than they look. A malformed ledger
// must degrade to "fewer session rows", never to "this set does not
// render" — the Explorer's standing rule is never to hide work.

import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { normalizeLedgerSessions, readSessionSets } from "../../utils/fileSystem";

suite("Set 110 S2 — ledger normalisation for the session level", () => {
  test("well-formed entries pass through with their titles", () => {
    assert.deepStrictEqual(
      normalizeLedgerSessions([
        { number: 1, title: "Decide and measure", status: "complete" },
        { number: 2, title: "The TreeDataProvider", status: "in-progress" },
      ]),
      [
        { number: 1, title: "Decide and measure", status: "complete" },
        { number: 2, title: "The TreeDataProvider", status: "in-progress" },
      ],
    );
  });

  test("a missing or blank title falls back to the writer's own label", () => {
    assert.deepStrictEqual(
      normalizeLedgerSessions([
        { number: 3, status: "not-started" },
        { number: 4, title: "   ", status: "not-started" },
      ]),
      [
        { number: 3, title: "Session 3", status: "not-started" },
        { number: 4, title: "Session 4", status: "not-started" },
      ],
    );
  });

  test("all four session statuses survive, including cancelled", () => {
    // `media/cancelled.svg` exists and the fourth status is real in the
    // schema; whether a SESSION ever reaches it in practice is a
    // separate question the operator notes raise, but the reader must
    // not silently drop one if it does.
    const out = normalizeLedgerSessions([
      { number: 1, title: "a", status: "not-started" },
      { number: 2, title: "b", status: "in-progress" },
      { number: 3, title: "c", status: "complete" },
      { number: 4, title: "d", status: "cancelled" },
    ]);
    assert.deepStrictEqual(out.map((s) => s.status), [
      "not-started",
      "in-progress",
      "complete",
      "cancelled",
    ]);
  });

  test("malformed entries are dropped one at a time, never the whole set", () => {
    const out = normalizeLedgerSessions([
      { number: 1, title: "keep", status: "complete" },
      null,
      "not an object",
      { title: "no number", status: "complete" },
      { number: 1.5, title: "fractional", status: "complete" },
      { number: "2", title: "stringly typed", status: "complete" },
      { number: 3, title: "unknown status", status: "abandoned" },
      { number: 4, title: "also keep", status: "not-started" },
    ]);
    assert.deepStrictEqual(out.map((s) => s.title), ["keep", "also keep"]);
  });

  test("non-positive session numbers are rejected — they cannot be real rows", () => {
    // Session numbers are 1-indexed everywhere in the workflow, so zero
    // and negatives are corruption rather than an unusual-but-valid
    // ledger. They would also produce nonsense row ids.
    assert.deepStrictEqual(
      normalizeLedgerSessions([
        { number: 0, title: "zeroth", status: "complete" },
        { number: -1, title: "negative", status: "complete" },
        { number: 1, title: "real", status: "complete" },
      ]).map((s) => s.title),
      ["real"],
    );
  });

  test("a DUPLICATE session number keeps the first and drops the rest", () => {
    // The fourth level's `TreeItem.id` is `session:<set>/<number>`, and
    // VS Code keys selection and expansion state on that id — two rows
    // sharing one number would share one identity and move together.
    // First-wins is deterministic; dropping both would hide work.
    // (Verification round 1 nit, raised by both fan-out calls.)
    const out = normalizeLedgerSessions([
      { number: 1, title: "first wins", status: "complete" },
      { number: 1, title: "shadow", status: "in-progress" },
      { number: 2, title: "unaffected", status: "not-started" },
    ]);
    assert.deepStrictEqual(out.map((s) => [s.number, s.title]), [
      [1, "first wins"],
      [2, "unaffected"],
    ]);
  });

  test("titles are stored trimmed, not merely trim-tested", () => {
    assert.deepStrictEqual(
      normalizeLedgerSessions([
        { number: 1, title: "  Padded Title  ", status: "complete" },
      ]),
      [{ number: 1, title: "Padded Title", status: "complete" }],
    );
  });

  test("a non-array ledger reads as no sessions rather than throwing", () => {
    for (const raw of [null, undefined, {}, "sessions", 7, true]) {
      assert.deepStrictEqual(normalizeLedgerSessions(raw), []);
    }
  });

  test("`true` is not accepted as session number 1", () => {
    // `typeof true === "boolean"` so the guard already holds, but the
    // repo has a standing convention about int-vs-bool confusion in
    // validators (project-guidance.md -> Code Style), and a test is
    // cheaper than re-deriving the argument later.
    assert.deepStrictEqual(normalizeLedgerSessions([{ number: true, status: "complete" }]), []);
  });
});

suite("Set 110 S2 — the scan carries the ledger onto SessionSet", () => {
  test("readSessionSets populates `sessions` from the state file it already read", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-ledger-"));
    try {
      const dir = path.join(root, "docs", "session-sets", "042-example");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, "spec.md"),
        "# 042\n\n### Session 1 of 2: One\n### Session 2 of 2: Two\n",
        "utf-8",
      );
      fs.writeFileSync(
        path.join(dir, "session-state.json"),
        JSON.stringify({
          schemaVersion: 4,
          sessionSetName: "042-example",
          status: "in-progress",
          sessions: [
            { number: 1, title: "One", status: "complete" },
            { number: 2, title: "Two", status: "in-progress" },
          ],
        }),
        "utf-8",
      );

      const sets = readSessionSets(root);
      assert.strictEqual(sets.length, 1);
      assert.deepStrictEqual(
        (sets[0].sessions ?? []).map((s) => [s.number, s.title, s.status]),
        [
          [1, "One", "complete"],
          [2, "Two", "in-progress"],
        ],
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("a spec-only set shows its PLANNED sessions, via the existing lazy synthesis", () => {
    // A folder with `spec.md` and no `session-state.json` is lazily
    // synthesized to a not-started state file by `ensureSessionStateFile`
    // — pre-existing behaviour this session did not add. The consequence
    // for the fourth level is a good one and worth pinning: a set that
    // has never been started still lists the sessions its spec plans,
    // all `not-started`, rather than rendering as a bare leaf.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-ledger-"));
    try {
      const dir = path.join(root, "docs", "session-sets", "043-planned");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, "spec.md"),
        "# 043\n\n### Session 1 of 2: First\n\n### Session 2 of 2: Second\n",
        "utf-8",
      );
      const sets = readSessionSets(root);
      assert.strictEqual(sets.length, 1);
      const sessions = sets[0].sessions ?? [];
      assert.strictEqual(sessions.length, 2);
      assert.ok(sessions.every((s) => s.status === "not-started"));
      assert.deepStrictEqual(sessions.map((s) => s.number), [1, 2]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
