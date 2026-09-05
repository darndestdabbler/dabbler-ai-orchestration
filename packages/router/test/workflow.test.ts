// The step driver: folding state, treating a return as ordinary, and the
// three bounded loops.
//
// The three calls the driver makes out of itself -- a routed review, a run of
// the authored tests, a run of the declared suite -- arrive through
// `setWorkSources`, one named seam, because what this module decides is what
// it RECORDS and a test of that has no business arranging a model or a
// runner. Nothing is mocked.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { stringify as stringifyYaml } from "yaml";

import { workflowVerb } from "../src/cli/workflow.ts";
import { snapshotWorktreeTree } from "../src/journal.ts";
import { capture } from "../src/output.ts";
import { STEPS } from "../src/solution.ts";
import { digestText } from "../src/stepreview.ts";
import { readText } from "../src/textfile.ts";
import {
  VERDICT_ISSUES_FOUND,
  VERDICT_REMEDIATED_AT_CAP,
  VERDICT_VERIFIED,
} from "../src/verdict.ts";
import { setWorkSources, type WorkSources } from "../src/workflow/commands.ts";
import {
  EXIT_REFUSED,
  append,
  currentStep,
  fold,
  logPath,
  read,
  validateTransition,
  type TargetState,
  type WorkflowEvent,
} from "../src/workflow/log.ts";
import { project } from "../src/workflow/project.ts";
import { reviewCap, reviewTerminal, runCap, runTerminal, suiteTerminal } from "../src/workflow/terminal.ts";
import { seed, tempDir } from "./support/answers.ts";
import { git } from "./support/repo.ts";

/** One verb run, with everything it printed. */
async function run(argv: string[]): Promise<{ code: number; out: string; err: string }> {
  const collected = await capture(() => workflowVerb(argv));
  return { code: collected.value, out: collected.stdout, err: collected.stderr };
}

/**
 * Every `entered` event from the first step up to `step`. There is no
 * shortcut, which is the rule under test.
 */
function entriesThrough(target: string, step: string): WorkflowEvent[] {
  return STEPS.slice(0, STEPS.indexOf(step) + 1).map((s) => ({
    event: "entered",
    target,
    step: s,
  }));
}

function walkTo(root: string, target: string, step: string): void {
  for (const event of entriesThrough(target, step)) append(root, event);
}

function reviewed(target: string, step: string, over: Record<string, unknown> = {}): WorkflowEvent {
  return {
    event: "reviewed",
    target,
    step,
    verdict: "blocked",
    findings: [],
    artifactDigests: {},
    live: true,
    ...over,
  };
}

function authored(target: string, step: string, written = ["tests/test_value.py"]): WorkflowEvent {
  return { event: "tests-authored", target, step, written };
}

function ran(target: string, step: string, over: Record<string, unknown> = {}): WorkflowEvent {
  const green = Boolean(over["green"]);
  return {
    event: "tested",
    target,
    step,
    green,
    exitCode: green ? 0 : 3,
    treeDigest: null,
    postTreeDigest: null,
    ...over,
  };
}

function suiteRan(target: string, step: string, over: Record<string, unknown> = {}): WorkflowEvent {
  const green = Boolean(over["green"]);
  return {
    event: "suite-run",
    target,
    step,
    green,
    exitCode: green ? 0 : 1,
    treeDigest: null,
    postTreeDigest: null,
    ...over,
  };
}

const fakeReview: WorkSources["review"] = (options) =>
  Promise.resolve([
    {
      target: options.target,
      step: options.step,
      artifacts: [...options.artifactPaths],
      artifactDigests: {},
      reviewers: [
        {
          provider: "anthropic",
          model: "a",
          verdict: "VERIFIED",
          findings: [],
          blocking: false,
          blockingReason: "",
          simulated: false,
        },
        {
          provider: "openai",
          model: "o",
          verdict: "ISSUES_FOUND",
          findings: [{ severity: "Major", description: "boundary" }],
          blocking: true,
          blockingReason: "1 blocking finding(s)",
          simulated: false,
        },
      ],
    },
    ["raw one", "raw two"],
  ] as unknown as Awaited<ReturnType<WorkSources["review"]>>);

function checkRun(over: Record<string, unknown>): Record<string, unknown> {
  return {
    check: { name: "unit", argv: ["runner"], command: "", kind: "suite" },
    stage: "targeted",
    command: "runner",
    treeDigest: "t1",
    postTreeDigest: "t1",
    treeMutated: false,
    exitCode: 3,
    durationSeconds: 0.2,
    timedOut: false,
    outcome: "failed",
    selection: {},
    output: "E   assert 1 == 2",
    ...over,
  };
}

const MANIFEST = `
solution:
  name: csv-demo
  title: CSV walkthrough
components:
  - name: csv-model
  - name: csv-parser
    dependsOn: [csv-model]
  - name: csv-app
    kind: integration
    dependsOn: [csv-parser]
`;

function makeRoot(): string {
  const root = tempDir("workflow-");
  seed(root, { "solution.yaml": MANIFEST });
  return root;
}

/**
 * The workspace as a real repository. Whether a failing run has been answered
 * is decided by comparing tree ids, so the loops' terminal states need a tree
 * to compare.
 */
function makeGitRoot(): string {
  const root = makeRoot();
  git(root, "init", "-q");
  return root;
}

/**
 * A workspace that says what its tests are. The router package declares no
 * repository's tests -- that moved to each repository's own tracked
 * `dabbler.yaml` -- so a workspace that never said has nothing to read.
 */
function makeDeclaringRoot(): string {
  const root = makeGitRoot();
  writeFileSync(
    join(root, "dabbler.yaml"),
    stringifyYaml({
      schema_version: 1,
      testing: {
        suites: [
          {
            name: "python",
            command: "python -m pytest",
            covers: ["tests/"],
            test_roots: ["tests"],
            test_glob: "test_*.py",
          },
        ],
      },
    }),
    "utf8",
  );
  return root;
}

function stateOf(events: WorkflowEvent[], target = "a"): TargetState {
  return fold(events).get(target) as TargetState;
}

function componentOf(root: string, name: string): Record<string, unknown> {
  return (project(root).components as Array<Record<string, unknown>>).find(
    (component) => component["name"] === name,
  ) as Record<string, unknown>;
}

// --- The log -------------------------------------------------------------------

describe("the log", () => {
  it("refuses an unknown event", () => {
    assert.throws(() => append(makeRoot(), { event: "invented" }), /unknown event/);
  });

  it("appends rather than replaces", () => {
    const root = makeRoot();
    append(root, { event: "entered", target: "csv-parser", step: "plan" });
    append(root, { event: "entered", target: "csv-parser", step: "decompose" });
    assert.equal(read(root).length, 2);
  });

  it("reports a corrupt line with its position", () => {
    const root = makeRoot();
    append(root, { event: "entered", target: "x", step: "plan" });
    const path = logPath(root);
    writeFileSync(path, `${readText(path)}{not json\n`, "utf8");
    assert.throws(() => read(root), /:2/);
  });
});

describe("the fold", () => {
  it("lets the latest step win", () => {
    assert.equal(
      stateOf([
        { event: "entered", target: "a", step: "plan" },
        { event: "entered", target: "a", step: "decompose" },
      ]).step,
      "decompose",
    );
  });

  it("puts a blocking review back with the author", () => {
    assert.equal(
      stateOf([{ event: "reviewed", target: "a", verdict: "blocked" }]).waitingOn,
      "author",
    );
  });

  it("waits on the developer for a review needing approval, and clears on approval", () => {
    const gated: WorkflowEvent[] = [
      { event: "reviewed", target: "a", verdict: "clear", needsApproval: true },
    ];
    assert.equal(stateOf(gated).waitingOn, "developer");
    assert.equal(stateOf([...gated, { event: "approved", target: "a" }]).waitingOn, null);
  });

  it("moves the step backwards on a return, counts it, and clears any approval", () => {
    const state = stateOf([
      ...entriesThrough("a", "integration"),
      { event: "returned", target: "a", toStep: "contracts", reason: "boundary wrong" },
    ]);
    assert.equal(state.step, "contracts");
    assert.equal(state.returns, 1);

    const cleared = stateOf([
      ...entriesThrough("a", "decompose"),
      { event: "reviewed", target: "a", step: "decompose", verdict: "clear" },
      { event: "approved", target: "a" },
      { event: "returned", target: "a", toStep: "plan", reason: "x" },
    ]);
    assert.equal(cleared.approved, false);
  });
});

// One `validateTransition` on both sides of the log. The writer refuses to
// record an impossible move and the reader refuses to replay one, so a
// hand-edited file cannot become history.
describe("record authority", () => {
  it("refuses a skipped step, and entering backwards", () => {
    assert.throws(
      () =>
        fold([
          { event: "entered", target: "a", step: "plan" },
          { event: "entered", target: "a", step: "mocks" },
        ]),
      /steps are entered in order/,
    );
    assert.throws(
      () => fold([...entriesThrough("a", "contracts"), { event: "entered", target: "a", step: "plan" }]),
      /send-back/,
    );
  });

  it("refuses a return that does not move back", () => {
    assert.throws(
      () =>
        fold([
          ...entriesThrough("a", "contracts"),
          { event: "returned", target: "a", toStep: "mocks", reason: "forwards, dressed as a return" },
        ]),
      /moves work backwards/,
    );
  });

  it("refuses an approval outside an approval step, or with no live review", () => {
    assert.throws(
      () =>
        fold([
          ...entriesThrough("a", "mocks"),
          { event: "reviewed", target: "a", step: "mocks", verdict: "clear" },
          { event: "approved", target: "a" },
        ]),
      /not a step a developer/,
    );
    assert.throws(
      () =>
        fold([
          { event: "entered", target: "a", step: "plan" },
          { event: "approved", target: "a" },
        ]),
      /nothing live has been/,
    );
  });

  it("refuses an event about another step", () => {
    assert.throws(
      () =>
        fold([
          ...entriesThrough("a", "decompose"),
          { event: "reviewed", target: "a", step: "plan", verdict: "clear" },
        ]),
      /work is at/,
    );
  });

  it("refuses a log that opens partway through", () => {
    // A target with no history has entered nothing, so a first event naming a
    // later step records an arrival with no journey.
    assert.throws(
      () => validateTransition(null, { event: "entered", target: "a", step: "build" }),
      /cannot begin at/,
    );
  });

  it("refuses a hand-written line when the log is read", () => {
    const root = makeRoot();
    append(root, { event: "entered", target: "csv-model", step: "plan" });
    const path = logPath(root);
    writeFileSync(
      path,
      `${readText(path)}${JSON.stringify({
        event: "entered",
        target: "csv-model",
        step: "build",
        at: "2026-01-01T00:00:00+00:00",
      })}\n`,
      "utf8",
    );
    assert.throws(() => fold(read(root)), /steps are entered in order/);
  });
});

describe("a scripted review is not a live one", () => {
  it("does not count a simulated review as reviewed", () => {
    // The flag was recorded and never read, so a response served from a file
    // cleared the same gate two vendors clear.
    const state = stateOf([
      { event: "entered", target: "a", step: "plan" },
      { event: "reviewed", target: "a", step: "plan", verdict: "clear", simulated: true },
    ]);
    assert.equal(state.reviewed, false);
  });
});

// Five real review rounds on one plan document produced four Major findings
// every time, each round's findings genuinely new. A gate the reviewers can
// hold shut forever is not a gate.
describe("the approval gate outranks the block", () => {
  it("still reaches the developer on a blocked approval step", () => {
    const state = stateOf([
      { event: "entered", target: "a", step: "plan" },
      { event: "reviewed", target: "a", step: "plan", verdict: "blocked", needsApproval: true },
    ]);
    assert.equal(state.waitingOn, "developer");
  });

  it("sends a blocked step with no gate back to the author", () => {
    const state = stateOf([
      ...entriesThrough("a", "mocks"),
      { event: "reviewed", target: "a", step: "mocks", verdict: "blocked", needsApproval: false },
    ]);
    assert.equal(state.waitingOn, "author");
  });

  it("records that an approval overrode open findings", async () => {
    const root = makeRoot();
    append(root, { event: "entered", target: "csv-model", step: "plan" });
    append(root, {
      event: "reviewed",
      target: "csv-model",
      step: "plan",
      verdict: "blocked",
      needsApproval: true,
      findings: [{ severity: "major" }, { severity: "major" }],
    });
    const { out } = await run(["approve", "--component", "csv-model", "--workspace-root", root]);
    assert.equal(read(root).at(-1)?.["overFindings"], 2);
    assert.match(out, /stay on the record/);
  });
});

// --- The projection -------------------------------------------------------------

describe("the projection", () => {
  it("joins the manifest to live state", () => {
    const root = makeRoot();
    walkTo(root, "csv-parser", "mocks");
    const parser = componentOf(root, "csv-parser");
    assert.equal(parser["stepNumber"], 4);
    assert.deepEqual(parser["usedBy"], ["csv-app"]);
  });

  it("lists everything waiting on the developer", () => {
    const root = makeRoot();
    append(root, { event: "reviewed", target: "csv-model", verdict: "clear", needsApproval: true });
    assert.deepEqual(project(root).needsYou, ["csv-model"]);
  });

  it("refuses a missing manifest", () => {
    assert.throws(() => project(tempDir("workflow-")), /no solution manifest/);
  });

  it("says nothing about other repositories when none is declared", () => {
    // The manifest gains no vocabulary for an external component, so a
    // repository that declares no dependencies has no external rows -- not an
    // empty guess derived from what it builds.
    assert.deepEqual(project(makeRoot()).external, []);
  });

  it("derives an external row from the dependency file and the build file", () => {
    const root = makeRoot();
    seed(root, {
      "solution-dependencies.json": JSON.stringify({
        schemaVersion: 1,
        solution: "csv-pipeline",
        consumes: [
          {
            id: "Dabbler.Csv.Model",
            kind: "nuget",
            producedBy: { id: "csv-model", remote: null, path: "../nowhere" },
            resolve: "feed",
          },
        ],
      }),
      "src/app.csproj":
        '<Project><ItemGroup><PackageReference Include="Dabbler.Csv.Model" ' +
        'Version="1.0.0" /></ItemGroup></Project>',
    });
    const [row] = project(root).external as Array<Record<string, unknown>>;
    assert.equal(row?.["id"], "Dabbler.Csv.Model");
    assert.equal(row?.["producedBy"], "csv-model");
    // Read from the build file on every projection rather than copied into
    // the declaration: two homes for one fact is the drift this avoids.
    assert.equal(row?.["pinned"], "1.0.0");
  });

  it("reports a producer nobody has cloned rather than omitting the row", () => {
    // The graph is a declaration about a solution, not about one laptop, and
    // a row that vanished would read as an edge that does not exist.
    const root = makeRoot();
    seed(root, {
      "solution-dependencies.json": JSON.stringify({
        schemaVersion: 1,
        solution: "csv-pipeline",
        consumes: [
          {
            id: "Dabbler.Csv.Model",
            kind: "nuget",
            producedBy: { id: "csv-model", remote: null, path: "../nowhere" },
            resolve: "feed",
          },
        ],
      }),
    });
    const [row] = project(root).external as Array<Record<string, unknown>>;
    assert.equal(row?.["root"], null);
    assert.match(String(row?.["reason"]), /not on this machine/);
  });

  it("projects an edge a SIBLING owns, which this repository cannot know alone", () => {
    // A consumes from B, and B's own declaration names C. Both are
    // owner-specific facts in two files, and reading only this repository's
    // edges shows A->B and loses C. Nothing is copied between declarations to
    // make it work.
    const parent = tempDir("solution-");
    const b = join(parent, "csv-model");
    mkdirSync(join(b, ".git"), { recursive: true });
    seed(b, {
      "src/model.csproj":
        '<Project><ItemGroup><PackageReference Include="Dabbler.Csv.Core" ' +
        'Version="0.8.1" /></ItemGroup></Project>',
      "solution-dependencies.json": JSON.stringify({
        schemaVersion: 1,
        solution: "csv-pipeline",
        repositoryId: "csv-model",
        consumes: [
          {
            id: "Dabbler.Csv.Core",
            kind: "nuget",
            producedBy: { id: "csv-core", remote: null, path: null },
            resolve: "feed",
          },
        ],
      }),
    });

    const a = makeRoot();
    seed(a, {
      "solution-dependencies.json": JSON.stringify({
        schemaVersion: 1,
        solution: "csv-pipeline",
        repositoryId: "csv-app",
        searchPaths: [parent],
        consumes: [
          {
            id: "Dabbler.Csv.Model",
            kind: "nuget",
            producedBy: { id: "csv-model", remote: null, path: b },
            resolve: "feed",
          },
        ],
      }),
    });
    const rows = project(a).external as Array<Record<string, unknown>>;
    const ids = rows.map((row) => String(row["id"]));
    assert.ok(ids.includes("Dabbler.Csv.Model"));
    assert.ok(ids.includes("Dabbler.Csv.Core"));
    // Derived from who declares what, and stated in no file. And it keeps ITS
    // pin, which belongs to the sibling that consumes it: a recovered edge
    // rendered without the version is the row's own point missing.
    const core = rows.find((row) => row["id"] === "Dabbler.Csv.Core");
    assert.deepEqual(core?.["usedBy"], ["csv-model"]);
    assert.deepEqual(core?.["pins"], [
      { repository: "csv-model", version: "0.8.1", drift: null, driftKind: null },
    ]);
  });
});

// --- The command line -----------------------------------------------------------

describe("the command line", () => {
  it("records what the reviewers actually said, and files each reply verbatim", async () => {
    // The verdict comes back from the readers; there is no longer a way to
    // hand one in on the command line. And a summary is not a record: a
    // finding that exists only as someone's paraphrase cannot be re-read.
    const root = makeRoot();
    walkTo(root, "csv-model", "contracts");
    const restore = setWorkSources({ review: fakeReview });
    try {
      seed(root, { "contract.yaml": "calls: []\n" });
      const { code } = await run([
        "review",
        "--artifact",
        join(root, "contract.yaml"),
        "--component",
        "csv-model",
        "--workspace-root",
        root,
      ]);
      assert.equal(code, 0);
      const event = read(root).at(-1) as WorkflowEvent;
      assert.equal(event["event"], "reviewed");
      assert.equal(event["step"], "contracts");
      assert.equal(event["verdict"], "blocked");
      assert.deepEqual(
        (event["reviewers"] as Array<Record<string, unknown>>).map((r) => r["provider"]),
        ["anthropic", "openai"],
      );
      const dir = join(root, ".dabbler", "solution", "reviews");
      assert.deepEqual(
        readdirSync(dir)
          .sort()
          .map((name) => readText(join(dir, name))),
        ["raw one", "raw two"],
      );
    } finally {
      restore();
    }
  });

  it("refuses to review work that has not begun", () => {
    assert.throws(() => currentStep(makeRoot(), "csv-model"), /has not entered a step/);
  });

  it("names the affected components on a send-back", async () => {
    const root = makeRoot();
    walkTo(root, "csv-model", "integration");
    const { out } = await run([
      "send-back",
      "--to",
      "contracts",
      "--reason",
      "boundary wrong",
      "--affects",
      "csv-parser,csv-app",
      "--component",
      "csv-model",
      "--workspace-root",
      root,
    ]);
    assert.match(out, /csv-parser, csv-app/);
  });

  it("reports who is waited on", async () => {
    const root = makeRoot();
    append(root, {
      event: "reviewed",
      target: "csv-model",
      step: "plan",
      verdict: "clear",
      needsApproval: true,
    });
    assert.match((await run(["status", "--workspace-root", root])).out, /needs you/);
  });
});

// --- The three bounded loops ----------------------------------------------------

// `workflow review` had no bound, so an unattended run kept calling two
// vendors for as long as anything invoked it. The loop now stops by itself and
// lands on one of three terminal states, and no part of that waits for a
// person or can be typed by one.
describe("the review loop is bounded", () => {
  it("counts only a round that reached a vendor", () => {
    // The bound exists to stop the loop spending on vendors, so a round
    // served from a script spent nothing to bound.
    const state = stateOf([
      { event: "entered", target: "a", step: "plan" },
      reviewed("a", "plan", { live: false }),
      reviewed("a", "plan"),
    ]);
    assert.equal(state.reviewRounds, 1);
  });

  it("opens a new loop when the work moves", () => {
    // Rounds spent on what a step produced are not spent against the step the
    // work is sent back to.
    const state = stateOf([
      ...entriesThrough("a", "decompose"),
      reviewed("a", "decompose"),
      { event: "returned", target: "a", toStep: "plan", reason: "boundary wrong" },
    ]);
    assert.equal(state.reviewRounds, 0);
    assert.equal(state.lastLiveReview, null);
  });

  it("changes nothing when the same step is re-entered", () => {
    // `enter <the step it is already in>` moves nothing, so it is inert.
    // Zeroing the count there would buy another full set of vendor rounds on
    // work that has not changed step; clearing the review instead left the
    // step refused by `approve` for having no live review and refused by
    // `review` for having closed its loop -- twice refused, for opposite
    // reasons.
    const events: WorkflowEvent[] = [
      { event: "entered", target: "a", step: "plan" },
      reviewed("a", "plan", { verdict: "clear", needsApproval: true }),
    ];
    const after = stateOf([...events, { event: "entered", target: "a", step: "plan" }]);
    assert.deepEqual(
      [after.reviewRounds, after.reviewed, after.waitingOn],
      [stateOf(events).reviewRounds, true, "developer"],
    );
    assert.equal(after.reviewRounds, 1);
  });

  it("takes the bound from the workspace, not the process directory", () => {
    // `--workspace-root` and `project(root)` are first-class entry points.
    // Reading the overlay from wherever the process happens to sit would
    // enforce one repository's cap against another's.
    const root = makeGitRoot();
    seed(root, {
      "local-overrides.yaml": stringifyYaml({ verification: { settings: { max_rounds: 1 } } }),
    });
    const elsewhere = tempDir("elsewhere-");
    const previous = process.cwd();
    process.chdir(elsewhere);
    try {
      assert.equal(reviewCap(root), 1);
    } finally {
      process.chdir(previous);
    }
  });

  it("refuses a further round at the cap and names the way out", async () => {
    const root = makeRoot();
    walkTo(root, "csv-model", "contracts");
    seed(root, { "contract.yaml": "calls: []\n" });
    const restore = setWorkSources({ review: fakeReview });
    try {
      const argv = [
        "review",
        "--artifact",
        join(root, "contract.yaml"),
        "--component",
        "csv-model",
        "--workspace-root",
        root,
      ];
      for (let round = 0; round < reviewCap(root); round += 1) {
        assert.equal((await run(argv)).code, 0);
      }
      const refused = await run(argv);
      assert.equal(refused.code, EXIT_REFUSED);
      assert.match(refused.err, /send-back/);
      assert.match(refused.err, /Nobody is asked/);
    } finally {
      restore();
    }
  });

  it("closes the loop as verified when a round has no blocking finding", () => {
    // The early stop. Minor findings are recorded and open no further round
    // -- prose review has no bottom, which is what the severity vocabulary is
    // for.
    const root = makeRoot();
    const state = stateOf([
      { event: "entered", target: "a", step: "plan" },
      reviewed("a", "plan", {
        verdict: "clear",
        findings: [{ severity: "minor", description: "casing" }],
      }),
    ]);
    assert.equal(reviewTerminal(root, state, 3), VERDICT_VERIFIED);
  });

  it("calls a fix at the cited site remediated at the cap", () => {
    // Not a waiver: nothing was accepted over a finding that still stood, and
    // what is unproved is the repair rather than the complaint.
    const root = makeRoot();
    seed(root, { "plan.md": "# rewritten after the finding\n" });
    const state = stateOf([
      { event: "entered", target: "a", step: "plan" },
      reviewed("a", "plan", {
        findings: [{ severity: "major", description: "boundary", evidencePaths: ["plan.md"] }],
        artifactDigests: { "plan.md": digestText("# as the round read it\n") },
      }),
    ]);
    assert.equal(reviewTerminal(root, state, 1), VERDICT_REMEDIATED_AT_CAP);
  });

  it("calls an untouched cited site unresolved", () => {
    const root = makeRoot();
    const text = "# exactly as the round read it\n";
    seed(root, { "plan.md": text });
    const state = stateOf([
      { event: "entered", target: "a", step: "plan" },
      reviewed("a", "plan", {
        findings: [{ severity: "major", description: "boundary", evidencePaths: ["plan.md"] }],
        artifactDigests: { "plan.md": digestText(text) },
      }),
    ]);
    assert.equal(reviewTerminal(root, state, 1), VERDICT_ISSUES_FOUND);
  });

  it("cannot call a blocked round naming no finding remediated", () => {
    // Fail closed. Nothing to have fixed is not the same as nothing left to
    // fix, and an unreadable round must not be the cheapest way out.
    const root = makeRoot();
    const state = stateOf([
      { event: "entered", target: "a", step: "plan" },
      reviewed("a", "plan", { findings: [] }),
    ]);
    assert.equal(reviewTerminal(root, state, 1), VERDICT_ISSUES_FOUND);
  });

  it("carries the loop position in the projection", () => {
    // The router decides whether the loop has finished; the extension is
    // handed the answer rather than the events.
    const root = makeRoot();
    append(root, { event: "entered", target: "csv-model", step: "plan" });
    append(root, reviewed("csv-model", "plan"));
    const model = componentOf(root, "csv-model");
    assert.equal(model["reviewRounds"], 1);
    assert.equal(model["reviewCap"], reviewCap(root));
  });
});

// The verifier authors the tests, the framework runs them, and what the loop
// reads is an exit code rather than an opinion. The bound and the three
// terminal states are the review loop's, on the same terms.
describe("the tests loop is bounded", () => {
  it("refuses a run with nothing authored, at the record", () => {
    // A run of the author's own tests filed as this phase would prove the one
    // thing the split exists to stop it proving.
    const root = makeRoot();
    append(root, { event: "entered", target: "a", step: "plan" });
    assert.throws(() => append(root, ran("a", "plan")), /no test has been authored/);
  });

  it("closes the loop as verified on a green run", () => {
    // There is no early stop to make: a passing suite is already the cheapest
    // ending there is.
    const root = makeRoot();
    const state = stateOf([
      { event: "entered", target: "a", step: "plan" },
      authored("a", "plan"),
      ran("a", "plan", { green: true }),
    ]);
    assert.equal(runTerminal(root, state, 7), VERDICT_VERIFIED);
  });

  it("calls an unmoved tree at the cap unresolved and a moved one remediated", () => {
    // Nothing done about the failure proves nothing by stopping; a repair is
    // not a waiver, and what is unproved is the repair rather than the
    // complaint.
    const root = makeGitRoot();
    const tree = snapshotWorktreeTree(root);
    const state = stateOf([
      { event: "entered", target: "a", step: "plan" },
      authored("a", "plan"),
      ran("a", "plan", { treeDigest: tree, postTreeDigest: tree }),
    ]);
    assert.equal(runTerminal(root, state, 1), VERDICT_ISSUES_FOUND);
    writeFileSync(join(root, "fix.py"), "VALUE = 2\n", "utf8");
    assert.equal(runTerminal(root, state, 1), VERDICT_REMEDIATED_AT_CAP);
  });

  it("does not let a run that dirtied the tree call that a repair", () => {
    // The comparison is against the tree the run LEFT, not the one it was
    // measuring. A suite with a side effect is already failed evidence and
    // must not also be the cheapest way out of an unresolved loop.
    const root = makeGitRoot();
    const state = stateOf([
      { event: "entered", target: "a", step: "plan" },
      authored("a", "plan"),
      ran("a", "plan", {
        treeDigest: "the-tree-it-measured",
        treeMutated: true,
        postTreeDigest: snapshotWorktreeTree(root),
      }),
    ]);
    assert.equal(runTerminal(root, state, 1), VERDICT_ISSUES_FOUND);
  });

  it("opens a new tests loop when the work moves", () => {
    // Tests authored against what a step produced answer for that step.
    // Carried forward, they would run yesterday's proof against today's code
    // and the result would be read as this step's.
    const state = stateOf([
      ...entriesThrough("a", "decompose"),
      authored("a", "decompose"),
      { event: "returned", target: "a", toStep: "plan", reason: "boundary wrong" },
    ]);
    assert.deepEqual(state.testsAuthored, []);
    assert.equal(state.testRounds, 0);
  });

  it("records the exit code rather than a claim", async () => {
    // The framework's half of the split. Nothing here asks anyone how it went.
    const root = makeRoot();
    append(root, { event: "entered", target: "csv-model", step: "plan" });
    append(root, authored("csv-model", "plan"));
    const restore = setWorkSources({
      runAuthored: ((_root: string, _config: unknown, paths: string[]) =>
        Promise.resolve([
          checkRun({ command: `runner ${paths.join(" ")}` }),
        ])) as unknown as WorkSources["runAuthored"],
    });
    try {
      const { code, out } = await run([
        "test",
        "--component",
        "csv-model",
        "--workspace-root",
        root,
      ]);
      assert.equal(code, 0);
      const event = read(root).at(-1) as WorkflowEvent;
      assert.equal(event["event"], "tested");
      assert.deepEqual([event["exitCode"], event["green"]], [3, false]);
      assert.match(out, /back with the author/);
    } finally {
      restore();
    }
  });

  it("carries the tests loop position in the projection", () => {
    const root = makeRoot();
    append(root, { event: "entered", target: "csv-model", step: "plan" });
    append(root, authored("csv-model", "plan"));
    append(root, ran("csv-model", "plan", { green: true }));
    const model = componentOf(root, "csv-model");
    assert.equal(model["testRounds"], 1);
    assert.equal(model["testCap"], runCap(root));
    assert.equal(model["testTerminal"], VERDICT_VERIFIED);
  });
});

// The complete suite against the tree including the authored tests, and a red
// run opening a fix loop whose scope the framework holds rather than requests.
describe("the suite loop and its fix round", () => {
  it("refuses a suite run before anything was authored", () => {
    // It would be the suite as it stood before the verifier read anything,
    // filed as the run that included what it wrote.
    const root = makeRoot();
    append(root, { event: "entered", target: "a", step: "plan" });
    assert.throws(() => append(root, suiteRan("a", "plan")), /no test has been authored/);
  });

  it("refuses a fix round with no failing run behind it", () => {
    // Without a named failure the round is a model invited to revise whatever
    // it notices.
    const root = makeRoot();
    append(root, { event: "entered", target: "a", step: "plan" });
    append(root, authored("a", "plan"));
    append(root, suiteRan("a", "plan", { green: true }));
    assert.throws(
      () => append(root, { event: "fixed", target: "a", step: "plan" }),
      /no failing suite run/,
    );
  });

  it("ends the suite loop on the tests loop's own terms", () => {
    // The spec ends "same cap and same ending", so it is the same decision on
    // a different run.
    const root = makeGitRoot();
    const tree = snapshotWorktreeTree(root);
    const state = stateOf([
      { event: "entered", target: "a", step: "plan" },
      authored("a", "plan"),
      suiteRan("a", "plan", { treeDigest: tree, postTreeDigest: tree }),
    ]);
    assert.equal(suiteTerminal(root, state, 1), VERDICT_ISSUES_FOUND);
  });

  it("opens a new suite loop when the work moves", () => {
    // The suite loop runs the tests the step authored, so it goes back to
    // zero wherever they do.
    const state = stateOf([
      ...entriesThrough("a", "decompose"),
      authored("a", "decompose"),
      suiteRan("a", "decompose"),
      { event: "fixed", target: "a", step: "decompose" },
      { event: "returned", target: "a", toStep: "plan", reason: "boundary wrong" },
    ]);
    assert.deepEqual([state.suiteRounds, state.fixRounds], [0, 0]);
  });

  it("records which tests the run named", async () => {
    // The fix round is scoped to these and nothing else, so what the run
    // named is on the record rather than re-derived later.
    const root = makeDeclaringRoot();
    append(root, { event: "entered", target: "csv-model", step: "plan" });
    append(root, authored("csv-model", "plan"));
    const restore = setWorkSources({
      runSuite: (() =>
        Promise.resolve([
          checkRun({
            stage: "final-full",
            exitCode: 1,
            durationSeconds: 0.4,
            output: "FAILED tests/test_value.py::test_it - assert 1 == 2\n",
          }),
        ])) as unknown as WorkSources["runSuite"],
    });
    try {
      const { code } = await run(["suite", "--component", "csv-model", "--workspace-root", root]);
      assert.equal(code, 0);
      const event = read(root).at(-1) as WorkflowEvent;
      assert.equal(event["event"], "suite-run");
      assert.deepEqual(
        (event["failures"] as Array<Record<string, unknown>>).map((f) => f["name"]),
        ["tests/test_value.py::test_it"],
      );
    } finally {
      restore();
    }
  });

  it("carries the suite position and the fix count in the projection", () => {
    // Two different questions: how close the loop came to its bound, and how
    // much repair the step needed to get there.
    const root = makeRoot();
    append(root, { event: "entered", target: "csv-model", step: "plan" });
    append(root, authored("csv-model", "plan"));
    append(root, suiteRan("csv-model", "plan"));
    append(root, { event: "fixed", target: "csv-model", step: "plan" });
    const model = componentOf(root, "csv-model");
    assert.deepEqual([model["suiteRounds"], model["fixRounds"]], [1, 1]);
    assert.equal(model["suiteCap"], runCap(root));
  });
});

describe("the projection file", () => {
  it("is published by a mutating command", async () => {
    const root = makeRoot();
    walkTo(root, "csv-parser", "contracts");
    await run(["enter", "mocks", "--component", "csv-parser", "--workspace-root", root]);
    const path = join(root, ".dabbler", "solution", "projection.json");
    assert.ok(existsSync(path));
    const doc = JSON.parse(readText(path)) as { components: Array<Record<string, unknown>> };
    const parser = doc.components.find((component) => component["name"] === "csv-parser");
    assert.equal(parser?.["stepTitle"], "Build stand-ins");
  });

  it("keeps the event when the manifest cannot be projected", async () => {
    // The record is the point. A broken manifest must not eat an event.
    const root = tempDir("workflow-");
    const { code } = await run(["enter", "plan", "--workspace-root", root]);
    assert.equal(code, 0);
    assert.equal(read(root).length, 1);
  });
});
