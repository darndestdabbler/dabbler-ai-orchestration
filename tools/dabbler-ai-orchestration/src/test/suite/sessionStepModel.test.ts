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
  NOT_IN_FLIGHT,
  SessionFlightFacts,
  StepEntry,
  StepRow,
  activeStepIndex,
  buildStepRows,
  collapseByStepKey,
  effectiveStatusOf,
  glyphStatusOf,
  humanizeStepKey,
  isLoggedStep,
  parseSpecSteps,
  parseStepTexts,
  planMatchesSpec,
  sessionFlightFacts,
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
  /**
   * Set 127 S2: the case's `session-state.json`, when it declares one.
   * Python writes it to disk and `build_rows` reads it; here it goes
   * through `sessionFlightFacts`, which is the same function minus the
   * file read. ABSENT is a modelled case, not a gap.
   */
  sessionState?: unknown;
  entries: StepEntry[];
  expectedRows: Array<{
    stepNumber: number | null;
    stepKey: string;
    description: string;
    status: string;
    isPlanned: boolean;
    isActive: boolean;
    startedAt: string | null;
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
  isActive: row.isActive,
  startedAt: row.startedAt,
});

const flightOf = (c: ParityCase): SessionFlightFacts =>
  sessionFlightFacts(c.sessionState ?? null, c.sessionNumber);

const rowsFor = (c: ParityCase, flight = flightOf(c)): StepRow[] =>
  buildStepRows(
    c.entries,
    c.sessionNumber,
    parseSpecSteps(c.specMarkdown, c.sessionNumber),
    flight,
  );

suite("Set 114 S3 — cross-language parity with session_checklist.build_rows", () => {
  test("the corpus is reachable and non-empty", () => {
    // A path that silently resolves to nothing would make every parity
    // test below vacuously pass — the exact shape L-112-1 warns about.
    assert.ok(
      corpus.cases.length >= 23,
      `parity corpus at ${FIXTURE_PATH} has ${corpus.cases.length} cases`,
    );
  });

  test("the corpus actually exercises the derivation, in both directions", () => {
    // The corpus is shared, so this half must independently refuse a
    // corpus that has quietly lost the cases that make the parity claim
    // meaningful — a fixture whose cases can be deleted proves nothing
    // (L-112-1, applied to a fixture rather than a regex). The Python
    // half asserts the same thing in `test_the_corpus_pins_the_derivation
    // _in_both_directions`; neither language owns the corpus.
    const withState = corpus.cases.filter((c) => c.sessionState);
    assert.ok(withState.length >= 6, "no case models session-state.json");
    assert.ok(
      corpus.cases.some((c) => c.expectedRows.some((r) => r.isActive)),
      "no case derives an active step",
    );
    assert.ok(
      corpus.cases.some((c) => c.expectedRows.some((r) => r.startedAt !== null)),
      "no case derives a start time",
    );
    assert.ok(
      withState.some((c) => c.expectedRows.every((r) => !r.isActive)),
      "no case has the derivation armed and correctly standing down",
    );
    for (const c of corpus.cases) {
      assert.ok(
        c.expectedRows.filter((r) => r.isActive).length <= 1,
        `${c.name}: exactly one row per session may be derived in flight`,
      );
    }
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
      assert.deepStrictEqual(rowsFor(c).map(asPlain), c.expectedRows, c.why);
    });

    test(`no state file, no active step — ${c.name}`, () => {
      // Every case a second time with the state file withheld, whatever
      // it declares. `session-state.json` is the ONLY thing that can arm
      // the derivation, and a glyph on a session nobody said was in
      // flight is the failure the spec calls strictly worse than the
      // silence it replaced. The Python half runs the same sweep.
      const rows = rowsFor(c, NOT_IN_FLIGHT);
      assert.ok(
        rows.every((r) => !r.isActive),
        `${c.name}: derived an active step with no state file`,
      );
    });
  }
});

suite("Set 127 S2 — the derivation, in the mirror", () => {
  test("the flight facts read the per-session ledger, not the top level", () => {
    const state = {
      status: "in-progress",
      startedAt: "2026-08-10T08:00:00-04:00",
      sessions: [
        { number: 1, status: "complete", startedAt: "2026-08-10T09:00:00-04:00" },
        { number: 2, status: "in-progress", startedAt: "2026-08-10T11:00:00-04:00" },
      ],
    };
    assert.deepStrictEqual(sessionFlightFacts(state, 2), {
      inFlight: true,
      startedAt: "2026-08-10T11:00:00-04:00",
    });
    // Session 1 is closed: it keeps its start (the start-time question is
    // as good on a closed session) and claims nothing about being current.
    assert.deepStrictEqual(sessionFlightFacts(state, 1), {
      inFlight: false,
      startedAt: "2026-08-10T09:00:00-04:00",
    });
    // A session the ledger does not name at all knows nothing — and does
    // NOT fall back to the top-level `startedAt`, which belongs to
    // whichever session the file last touched.
    assert.deepStrictEqual(sessionFlightFacts(state, 3), NOT_IN_FLIGHT);
  });

  test("the plan-less carve-out contributes a start and never a flight claim", () => {
    // A set whose plan is not yet committed writes a v4 file with no
    // `sessions[]` and a top-level status/startedAt instead. It names no
    // session number, so it cannot attach a CURRENT STEP to one — but its
    // start is the best evidence there is for the first row.
    const carveout = {
      status: "in-progress",
      startedAt: "2026-08-10T08:30:00-04:00",
      sessions: [],
    };
    assert.deepStrictEqual(sessionFlightFacts(carveout, 1), {
      inFlight: false,
      startedAt: "2026-08-10T08:30:00-04:00",
    });
    // An absent array reads identically to an empty one — Python's reader
    // shim normalises the one into the other, so this half must not treat
    // them differently.
    assert.deepStrictEqual(
      sessionFlightFacts({ status: "in-progress", startedAt: "x" }, 1),
      { inFlight: false, startedAt: "x" },
    );
  });

  test("an unreadable or nonsense state file derives nothing", () => {
    // The reader hands back whatever `JSON.parse` produced, so every one
    // of these is reachable from a hand-edited file. None may throw, and
    // none may claim a session is in flight.
    for (const state of [null, undefined, [], "in-progress", 42, true]) {
      assert.deepStrictEqual(
        sessionFlightFacts(state as unknown, 1),
        NOT_IN_FLIGHT,
        `state=${JSON.stringify(state)}`,
      );
    }
    // A blank or non-string `startedAt` is no timestamp at all, not the
    // literal string it happens to hold.
    for (const startedAt of ["", "   ", 0, false, {}]) {
      assert.strictEqual(
        sessionFlightFacts({ sessions: [{ number: 1, status: "in-progress", startedAt }] }, 1)
          .startedAt,
        null,
        `startedAt=${JSON.stringify(startedAt)}`,
      );
    }
    // A non-integer session number cannot match, mirroring Python's
    // `isinstance(number, int) and not isinstance(number, bool)`.
    assert.deepStrictEqual(
      sessionFlightFacts({ sessions: [{ number: 1.0001, status: "in-progress" }] }, 1),
      NOT_IN_FLIGHT,
    );
  });

  test("the derivation stands down the moment the record answers", () => {
    // The rule that stops two rows claiming to be current — the exact
    // defect the removed `<- here` marker produced. Asserted directly on
    // the predicate as well as through the corpus, because this is the
    // one thing the spec says must not regress.
    const planned = (status: string): StepRow => ({
      stepNumber: 1,
      stepKey: "a",
      description: "",
      status,
      isPlanned: true,
      isActive: false,
      startedAt: null,
    });
    const rows = (...statuses: string[]) => statuses.map(planned);
    assert.strictEqual(activeStepIndex(rows("pending", "pending")), 0);
    assert.strictEqual(activeStepIndex(rows("pending", "in-progress")), null);
    assert.strictEqual(activeStepIndex(rows("pending", "blocked")), null);
    assert.strictEqual(activeStepIndex(rows("pending", "failed")), null);
    // `complete` is not an ANSWER to "where is this session" — a finished
    // step says where it is not — so the derivation stays armed.
    assert.strictEqual(activeStepIndex(rows("complete", "pending")), 1);
  });

  test("an unrecognised status token is evidence of nothing, in either direction", () => {
    // The trap this mirror could most easily fall into: `glyphStatusOf`
    // FALLS BACK to `not-started` for a token it does not know, where the
    // CLI boxes it `[?]`. Eligibility asks the token table directly, so a
    // legacy prose-in-`status` row is skipped rather than claimed — and
    // it does not stop the rule either, because `[?]` is a question, not
    // an answer.
    const planned = (status: string): StepRow => ({
      stepNumber: null,
      stepKey: "a",
      description: "",
      status,
      isPlanned: true,
      isActive: false,
      startedAt: null,
    });
    assert.strictEqual(glyphStatusOf("Ran the suite; 349 passed"), "not-started");
    assert.strictEqual(
      activeStepIndex([planned("Ran the suite; 349 passed"), planned("pending")]),
      1,
    );
    // A LOGGED row is never eligible whatever its token says: only a
    // seeded plan row can be derived active.
    assert.strictEqual(
      activeStepIndex([{ ...planned("pending"), isPlanned: false }]),
      null,
    );
  });

  test("the effective status is the record first and the derivation second", () => {
    const row: StepRow = {
      stepNumber: 2,
      stepKey: "build-it",
      description: "",
      status: "pending",
      isPlanned: true,
      isActive: false,
      startedAt: null,
    };
    // The record's own token, untouched, when nothing is derived...
    assert.strictEqual(effectiveStatusOf(row), "pending");
    assert.strictEqual(glyphStatusOf(effectiveStatusOf(row)), "not-started");
    // ...and the derived token when it is. `status` NEVER moves: a
    // consumer can always see that the ledger said `pending` and the tree
    // drew the in-progress glyph, and why.
    const active = { ...row, isActive: true };
    assert.strictEqual(active.status, "pending");
    assert.strictEqual(effectiveStatusOf(active), "in-progress");
    assert.strictEqual(glyphStatusOf(effectiveStatusOf(active)), "in-progress");
  });

  test("a start time is never invented for a row that has not started", () => {
    // Operator ruling 3: a seeded plan row's `dateTime` is REGISTRATION
    // time — identical across every row of the session — so rendering it
    // as a start would be a fresh wrong signal of exactly the kind this
    // set exists to remove. Every seeded row here carries the same stamp
    // and only the row that actually started may show a time.
    const seeded = (n: number, key: string): StepEntry => ({
      sessionNumber: 1,
      stepNumber: n,
      stepKey: key,
      description: `Step ${n}.`,
      status: "pending",
      kind: "plan-step",
      dateTime: "2026-08-10T09:00:00-04:00",
    });
    const rows = buildStepRows(
      [seeded(1, "one"), seeded(2, "two"), seeded(3, "three")],
      1,
      [],
      { inFlight: true, startedAt: "2026-08-10T09:00:00-04:00" },
    );
    assert.deepStrictEqual(
      rows.map((r) => [r.isActive, r.startedAt]),
      [
        [true, "2026-08-10T09:00:00-04:00"],
        [false, null],
        [false, null],
      ],
    );
  });
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

  test("a gate-policy record is not a step row (Set 128 S1)", () => {
    // The operator's report: a `path_aware_critique` record written at
    // REGISTRATION rendered with a done glyph in the step list, so the
    // panel said a stage that runs once at the END of a set had already
    // happened — minutes after the session began. A step list renders
    // steps; the record stays in the ledger the close gates read.
    const entries = [
      { sessionNumber: 1, stepNumber: 1, stepKey: "register", status: "complete" },
      {
        sessionNumber: 1,
        stepNumber: 1,
        stepKey: "session-001/path-aware-critique",
        status: "complete",
        kind: "path_aware_critique",
      },
    ];
    assert.deepStrictEqual(
      buildStepRows(entries, 1, []).map((r) => r.stepKey),
      ["register"],
    );
  });

  test("EVERY bookkeeping kind is excluded, not just the one that was reported", () => {
    // L-069-1: a bug is a bug CLASS. `path_aware_critique` is the kind the
    // operator happened to see, because it is the one 50 sets carry; the
    // other three are the same shape and would land the same way the next
    // time a set arms them.
    for (const kind of [
      "path_aware_critique",
      "contract_gate",
      "dual_surface_mode",
      "suggestion_disposition",
    ]) {
      const rows = buildStepRows(
        [
          { sessionNumber: 1, stepKey: "work", status: "complete" },
          { sessionNumber: 1, stepKey: `policy-${kind}`, status: "complete", kind },
        ],
        1,
        [],
      );
      assert.deepStrictEqual(rows.map((r) => r.stepKey), ["work"], kind);
    }
  });

  test("a session whose ONLY entries are policy records renders no steps", () => {
    // The honest answer is an empty step list, not a list of things that
    // are not steps.
    const rows = buildStepRows(
      [
        {
          sessionNumber: 1,
          stepKey: "session-001/path-aware-critique",
          status: "complete",
          kind: "path_aware_critique",
        },
      ],
      1,
      [],
    );
    assert.deepStrictEqual(rows, []);
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
      isActive: false,
      startedAt: null,
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
      isActive: false,
      startedAt: null,
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
