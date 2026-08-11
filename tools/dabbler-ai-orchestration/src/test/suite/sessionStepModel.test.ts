// Set 114 Session 3 — the TypeScript half of the cross-language step-row
// parity gate, plus the unit coverage for the pieces the Explorer adds on
// top of the ported rule.
//
// The corpus is `ai_router/tests/fixtures/session-step-parity.json`, and
// `ai_router/tests/test_step_row_parity.py` asserts the same file against
// the real Python implementation. Read that fixture's `_readme` first: the
// whole point is that no single edit can diverge the two implementations
// without failing a test.
//
// Why a mirror exists at all is recorded in this set's `decisions.jsonl`
// and at the top of `providers/sessionStepModel.ts`. In short: a process
// spawn on the expand path of a tree that polls every 30 seconds, for a
// DISPLAY feature, was the worse trade — and `utils/migrateSessionState.ts`
// is the precedent for mirroring a Python module to remove exactly that
// coupling.

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import {
  StepEntry,
  StepRow,
  buildStepRows,
  collapseByStepKey,
  glyphStatusOf,
  humanizeStepKey,
  isLoggedStep,
  parseSpecSteps,
  parseStepTexts,
  planMatchesSpec,
  stepRowLabel,
} from "../../providers/sessionStepModel";

const FIXTURE_PATH = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "..",
  "ai_router",
  "tests",
  "fixtures",
  "session-step-parity.json",
);

interface ParityCase {
  name: string;
  why: string;
  sessionNumber: number;
  specMarkdown: string;
  expectedSpecSteps: string[];
  entries: StepEntry[];
  expectedRows: Array<{
    stepNumber: number | null;
    stepKey: string;
    description: string;
    status: string;
    isPlanned: boolean;
  }>;
}

const corpus: { cases: ParityCase[] } = JSON.parse(
  fs.readFileSync(FIXTURE_PATH, "utf-8"),
);

const asPlain = (row: StepRow) => ({
  stepNumber: row.stepNumber,
  stepKey: row.stepKey,
  description: row.description,
  status: row.status,
  isPlanned: row.isPlanned,
});

suite("Set 114 S3 — cross-language parity with session_checklist.build_rows", () => {
  test("the corpus is reachable and non-empty", () => {
    // A path that silently resolves to nothing would make every parity
    // test below vacuously pass — the exact shape L-112-1 warns about.
    assert.ok(
      corpus.cases.length >= 14,
      `parity corpus at ${FIXTURE_PATH} has ${corpus.cases.length} cases`,
    );
  });

  for (const c of corpus.cases) {
    test(`spec steps — ${c.name}`, () => {
      assert.deepStrictEqual(
        parseSpecSteps(c.specMarkdown, c.sessionNumber),
        c.expectedSpecSteps,
        c.why,
      );
    });

    test(`rows — ${c.name}`, () => {
      const rows = buildStepRows(
        c.entries,
        c.sessionNumber,
        parseSpecSteps(c.specMarkdown, c.sessionNumber),
      ).map(asPlain);
      assert.deepStrictEqual(rows, c.expectedRows, c.why);
    });
  }
});

suite("Set 114 S3 — the row-builder primitives", () => {
  test("a `kind`-bearing entry is not a logged step", () => {
    assert.strictEqual(isLoggedStep({ stepKey: "a" }), true);
    assert.strictEqual(isLoggedStep({ stepKey: "a", kind: "" }), true);
    assert.strictEqual(isLoggedStep({ stepKey: "a", kind: "  " }), true);
    assert.strictEqual(isLoggedStep({ stepKey: "a", kind: "plan-step" }), false);
    assert.strictEqual(
      isLoggedStep({ stepKey: "a", kind: "path_aware_critique" }),
      false,
    );
    assert.strictEqual(isLoggedStep(undefined), false);
  });

  test("a FALSY NON-STRING `kind` is no kind at all — Python's coercion, exactly", () => {
    // The end-of-set path-aware critique (gpt-5.5) found the mirror
    // diverging here: Python reads `kind` with `str(x or "")`, so `0` and
    // `false` are absent; a `??`-based read turned them into "0" / "false"
    // and silently reclassified a real logged step as bookkeeping, which
    // forbade it from claiming its planned row. This assertion is what
    // makes that regression impossible to reintroduce quietly.
    for (const kind of [0, false, null, undefined, NaN] as unknown[]) {
      assert.strictEqual(
        isLoggedStep({ stepKey: "a", kind } as never),
        true,
        `kind=${String(kind)} should read as "no kind"`,
      );
    }
    // A TRUTHY non-string is still a kind — it is not empty in Python either.
    assert.strictEqual(isLoggedStep({ stepKey: "a", kind: 1 } as never), false);
  });

  test("an array is not an entry", () => {
    // `typeof [] === "object"` in JavaScript, so without the explicit
    // guard an array reads as a keyless — therefore logged — step, where
    // Python's `isinstance(entry, dict)` rejects it outright.
    assert.strictEqual(isLoggedStep([] as never), false);
    assert.deepStrictEqual(
      buildStepRows([[] as never, null as never], 1, []),
      [],
    );
  });

  test("collapse keeps the latest entry at the first position", () => {
    const collapsed = collapseByStepKey([
      { stepKey: "a", status: "in-progress" },
      { stepKey: "b", status: "pending" },
      { stepKey: "a", status: "complete" },
    ]);
    assert.deepStrictEqual(
      collapsed.map((e) => [e.stepKey, e.status]),
      [
        ["a", "complete"],
        ["b", "pending"],
      ],
    );
  });

  test("planMatchesSpec is false whenever the spec yields nothing", () => {
    // Conservative in every failure direction: a missing, unreadable or
    // unparseable spec costs only the ordinal convenience.
    assert.strictEqual(planMatchesSpec([], []), false);
    assert.strictEqual(planMatchesSpec([{ description: "Register." }], []), false);
  });

  test("planMatchesSpec compares the step TEXT, in order", () => {
    const plan = [{ description: "Register." }, { description: "Build it." }];
    assert.strictEqual(planMatchesSpec(plan, ["Register.", "Build it."]), true);
    assert.strictEqual(planMatchesSpec(plan, ["Build it.", "Register."]), false);
    assert.strictEqual(
      planMatchesSpec(plan, ["Register.", "Build it.", "Extra."]),
      false,
    );
  });

  test("a step's continuation lines stay with it; a column-0 trailer does not", () => {
    // This is the rule that keeps `**Creates:**` / `**Touches:**` out of
    // the last step's text — and the one whose Python original lost the
    // first step of every session to an off-by-one in its span slicing.
    const steps = parseStepTexts(
      "\n1. First step.\n   Its continuation.\n2. Second step.\n\n**Creates:** a thing\n",
    );
    assert.deepStrictEqual(steps, [
      "First step. Its continuation.",
      "Second step.",
    ]);
  });

  test("a nested list item is not a top-level step", () => {
    const steps = parseStepTexts("\n1. Top.\n    1. Nested, four spaces in.\n2. Also top.\n");
    assert.deepStrictEqual(steps, ["Top. 1. Nested, four spaces in.", "Also top."]);
  });

  test("a spec that names no such session yields no steps", () => {
    const spec = "### Session 1 of 2: A\n\n1. Only session one.\n";
    assert.deepStrictEqual(parseSpecSteps(spec, 2), []);
  });

  test("repeated parses do not leak regex state", () => {
    // Module-level /g regexes carry `lastIndex`; a missing reset makes the
    // SECOND call return nothing, which would read as "this set has no
    // plan" for every set after the first in a scan.
    const spec = "### Session 1 of 1: A\n\n1. Register.\n2. Build it.\n";
    const first = parseSpecSteps(spec, 1);
    const second = parseSpecSteps(spec, 1);
    assert.deepStrictEqual(second, first);
    assert.deepStrictEqual(first, ["Register.", "Build it."]);
  });
});

suite("Set 114 S3 — how a row renders", () => {
  test("the label is the humanized key", () => {
    assert.strictEqual(humanizeStepKey("test-run-policy"), "Test run policy");
    assert.strictEqual(humanizeStepKey("plan_seeding"), "Plan seeding");
    assert.strictEqual(humanizeStepKey(""), "");
  });

  test("a keyless step falls back to the description's first clause", () => {
    const row: StepRow = {
      stepNumber: 1,
      stepKey: "",
      description: "Wired the tree. Then ran the suite, which took a while.",
      status: "complete",
      isPlanned: false,
    };
    assert.strictEqual(stepRowLabel(row), "Wired the tree.");
  });

  test("a step with neither key nor description still has a label", () => {
    // An empty tree row is indistinguishable from a rendering bug.
    const row: StepRow = {
      stepNumber: null,
      stepKey: "",
      description: "",
      status: "pending",
      isPlanned: true,
    };
    assert.strictEqual(stepRowLabel(row), "(unnamed step)");
  });

  test("status tokens map onto the four authored lifecycle glyphs", () => {
    assert.strictEqual(glyphStatusOf("complete"), "complete");
    assert.strictEqual(glyphStatusOf("done"), "complete");
    assert.strictEqual(glyphStatusOf("in-progress"), "in-progress");
    assert.strictEqual(glyphStatusOf("in_progress"), "in-progress");
    assert.strictEqual(glyphStatusOf("started"), "in-progress");
    assert.strictEqual(glyphStatusOf("pending"), "not-started");
    assert.strictEqual(glyphStatusOf("not-started"), "not-started");
    assert.strictEqual(glyphStatusOf("blocked"), "cancelled");
    assert.strictEqual(glyphStatusOf("failed"), "cancelled");
  });

  test("an unrecognized status does not claim progress it cannot see", () => {
    // The CLI renders `[?]`; the tree has no such asset, and inventing
    // "complete" for an unknown token would be the confabulated-verdict
    // failure Set 086 ruled out in the set-row icon slot.
    assert.strictEqual(glyphStatusOf("whatever"), "not-started");
    assert.strictEqual(glyphStatusOf(""), "not-started");
  });
});
