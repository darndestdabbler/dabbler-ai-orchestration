// Set 115 Session 2 — left-click a session, land on its plan.
//
// Three suites for the three halves of one click:
//
//   1. `locateSessionSection` — WHICH lines of `spec.md` are this
//      session's, the only genuinely new rule in the feature;
//   2. the `openFile` seam — WHETHER a section is asked for at all, and
//      what happens when the spec cannot answer;
//   3. `asSessionNode` — whether an untrusted command argument is a
//      session row.
//
// What is NOT here: the reveal itself (`showTextDocument` + `revealRange`)
// is VS Code behaviour, proven in a real host by
// `src/test/playwright/session-plan-reveal.spec.ts`. Asserting it against
// the stub would prove only that the stub was written to agree.

import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { locateSessionSection } from "../../providers/specSectionLocator";
import { sessionNumberOf, specSectionTargetFor } from "../../commands/openFile";
import { asSessionNode } from "../../commands/workExplorerTreeCommands";

const SPEC = [
  "# A Spec", // 0
  "", // 1
  "## Sessions", // 2
  "", // 3
  "### Session 1 of 3: The first one", // 4
  "", // 5
  "1. Register.", // 6
  "2. Do the thing.", // 7
  "", // 8
  "---", // 9
  "", // 10
  "### Session 2 of 3: The middle one", // 11
  "", // 12
  "1. Register.", // 13
  "", // 14
  "### Session 3 of 3: The last one", // 15
  "", // 16
  "1. Register.", // 17
  "", // 18
  "", // 19
].join("\n");

function withTmpDir(fn: (dir: string) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-s115-s2-"));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

suite("Set 115 S2 — locateSessionSection", () => {
  test("a section starts at its own heading", () => {
    assert.strictEqual(locateSessionSection(SPEC, 2)?.startLine, 11);
    assert.strictEqual(locateSessionSection(SPEC, 1)?.startLine, 4);
  });

  test("a section ends on content, not on the gap before the next heading", () => {
    // The `---` rule between sessions belongs to session 1's block; the
    // blank line after it does not. Ending the range on whitespace would
    // make the revealed block look like it trails off.
    assert.deepStrictEqual(locateSessionSection(SPEC, 1), { startLine: 4, endLine: 9 });
    assert.deepStrictEqual(locateSessionSection(SPEC, 2), { startLine: 11, endLine: 13 });
  });

  test("the last section runs to the end of the file", () => {
    assert.deepStrictEqual(locateSessionSection(SPEC, 3), { startLine: 15, endLine: 17 });
  });

  test("a legacy heading with no `of N` is still a section", () => {
    // Older consumer-repo specs write `### Session 1: Title`. The
    // extension's shared heading regex tolerates it, so the reveal must
    // too — the alternative is a click that silently does nothing on
    // exactly the repos that have the least tooling.
    const legacy = ["### Session 1: Only", "", "1. Register.", ""].join("\n");
    assert.deepStrictEqual(locateSessionSection(legacy, 1), { startLine: 0, endLine: 2 });
  });

  test("a heading inside a fenced sample is not a section", () => {
    // The falsifier for the fence rule (L-112-1): the authoring guide's
    // own template is a fenced block full of session headings, and a
    // locator that matched them would open a spec at its documentation
    // sample instead of at the operator's session.
    const fenced = [
      "# Guide", // 0
      "", // 1
      "```markdown", // 2
      "### Session 1 of 1: A SAMPLE, not a session", // 3
      "```", // 4
      "", // 5
      "### Session 1 of 1: The real one", // 6
      "", // 7
      "1. Register.", // 8
    ].join("\n");
    assert.deepStrictEqual(locateSessionSection(fenced, 1), { startLine: 6, endLine: 8 });
  });

  test("a duplicate heading resolves to the first, like the Python extractor", () => {
    const dupe = [
      "### Session 1 of 1: First copy", // 0
      "", // 1
      "1. Register.", // 2
      "", // 3
      "### Session 1 of 1: Second copy", // 4
      "", // 5
      "1. Register.", // 6
    ].join("\n");
    assert.deepStrictEqual(locateSessionSection(dupe, 1), { startLine: 0, endLine: 2 });
  });

  test("CRLF line endings locate the same lines", () => {
    const crlf = SPEC.replace(/\n/g, "\r\n");
    assert.deepStrictEqual(locateSessionSection(crlf, 2), { startLine: 11, endLine: 13 });
  });

  test("null — never a throw — for every spec that cannot answer", () => {
    // Each of these is a real on-disk shape, and each one degrades to
    // "open spec.md at the top" rather than to an error dialog.
    assert.strictEqual(locateSessionSection(SPEC, 4), null, "session not in the spec");
    assert.strictEqual(locateSessionSection("", 1), null, "empty spec");
    assert.strictEqual(
      locateSessionSection("# A spec with prose and no session headings\n", 1),
      null,
    );
    assert.strictEqual(
      locateSessionSection("## Session 1 of 1: Wrong heading level\n", 1),
      null,
    );
    assert.strictEqual(locateSessionSection(SPEC, 1.5), null, "non-integer");
    assert.strictEqual(
      locateSessionSection(undefined as unknown as string, 1),
      null,
      "unreadable spec text",
    );
  });
});

suite("Set 115 S2 — the openFile seam", () => {
  test("only a session node asks for a section", () => {
    assert.strictEqual(sessionNumberOf({ kind: "session", session: { number: 3 } }), 3);
    assert.strictEqual(sessionNumberOf({ kind: "set", set: { name: "s" } }), undefined);
    assert.strictEqual(sessionNumberOf(undefined), undefined, "palette invocation");
    assert.strictEqual(sessionNumberOf(null), undefined);
    assert.strictEqual(sessionNumberOf("session"), undefined);
  });

  test("a session number that is not a positive integer asks for nothing", () => {
    // Fails CLOSED on a hand-edited or migrated state file: the operator
    // gets the top of the real spec, never a reveal computed from junk.
    for (const number of ["3", 0, -1, 2.5, NaN, null, undefined]) {
      assert.strictEqual(
        sessionNumberOf({ kind: "session", session: { number } }),
        undefined,
        `number ${String(number)} should not resolve`,
      );
    }
  });

  test("a session row resolves to its own lines of its own spec", () => {
    withTmpDir((dir) => {
      const specPath = path.join(dir, "spec.md");
      fs.writeFileSync(specPath, SPEC, "utf-8");
      assert.deepStrictEqual(specSectionTargetFor(specPath, 2), {
        startLine: 11,
        endLine: 13,
      });
    });
  });

  test("every unanswerable case degrades to the top of the file", () => {
    withTmpDir((dir) => {
      const specPath = path.join(dir, "spec.md");
      fs.writeFileSync(specPath, SPEC, "utf-8");
      // No session asked for — the set row's own left-click.
      assert.strictEqual(specSectionTargetFor(specPath, undefined), undefined);
      // A session the spec does not declare (a ledger ahead of its spec).
      assert.strictEqual(specSectionTargetFor(specPath, 9), undefined);
      // No spec path at all, and a path that is not there.
      assert.strictEqual(specSectionTargetFor(undefined, 2), undefined);
      assert.strictEqual(
        specSectionTargetFor(path.join(dir, "no-such-spec.md"), 2),
        undefined,
      );
      // A directory where a file should be: `readFileSync` throws EISDIR,
      // and the click must still end up showing the operator something.
      assert.strictEqual(specSectionTargetFor(dir, 2), undefined);
    });
  });
});

suite("Set 115 S2 — session-row narrowing", () => {
  test("a session node needs both its set and its session record", () => {
    const set = { name: "115-x" };
    const session = { number: 2, title: "Left-click a session", status: "not-started" };
    assert.ok(asSessionNode({ kind: "session", set, session }));
    assert.strictEqual(asSessionNode({ kind: "session", set }), undefined);
    assert.strictEqual(asSessionNode({ kind: "session", session }), undefined);
    assert.strictEqual(asSessionNode({ kind: "set", set }), undefined);
    assert.strictEqual(asSessionNode({ kind: "step", set, session }), undefined);
    assert.strictEqual(asSessionNode(undefined), undefined);
    assert.strictEqual(asSessionNode(null), undefined);
    assert.strictEqual(asSessionNode(42), undefined);
  });
});
