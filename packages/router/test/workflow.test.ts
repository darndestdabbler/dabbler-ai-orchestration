// The step driver: folding state, and treating a return as ordinary.

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { stringify as stringifyYaml } from "yaml";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { snapshotWorktreeTree } from "../src/journal.ts";
import { STEPS } from "../src/solution.ts";
import { digestText } from "../src/stepreview.ts";
import { readText } from "../src/textfile.ts";
import {
  VERDICT_ISSUES_FOUND,
  VERDICT_REMEDIATED_AT_CAP,
  VERDICT_VERIFIED,
} from "../src/verdict.ts";
import type { TargetState, WorkflowEvent } from "../src/workflow/log.ts";
import { captured, git, makeTempDir, removeTempDirs } from "./support/fixtures.ts";

afterAll(removeTempDirs);

/**
 * The three modules the driver calls, replaced.
 *
 * What is under test here is what the driver records, not what a model or a
 * runner says, so each stands in with a fixed answer.
 */
const fake = vi.hoisted(() => ({
  review: null as unknown,
  runAuthored: null as unknown,
  runSuite: null as unknown,
}));

vi.mock("../src/stepreview.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/stepreview.ts")>();
  return {
    ...actual,
    review: (options: { target: string; step: string; artifactPaths: string[] }) =>
      fake.review
        ? (fake.review as (o: unknown) => unknown)(options)
        : actual.review(options),
  };
});

vi.mock("../src/testphase.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/testphase.ts")>();
  return {
    ...actual,
    runAuthored: (root: string, config: unknown, paths: string[]) =>
      fake.runAuthored
        ? (fake.runAuthored as (...a: unknown[]) => unknown)(root, config, paths)
        : actual.runAuthored(root, config as Record<string, unknown>, paths),
  };
});

vi.mock("../src/fixloop.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/fixloop.ts")>();
  return {
    ...actual,
    runSuite: (root: string, config: unknown, paths: string[]) =>
      fake.runSuite
        ? (fake.runSuite as (...a: unknown[]) => unknown)(root, config, paths)
        : actual.runSuite(root, config as Record<string, unknown>, paths),
  };
});

const { workflowVerb } = await import("../src/cli/workflow.ts");
const {
  append,
  currentStep,
  EXIT_REFUSED,
  fold,
  logPath,
  read,
  validateTransition,
} = await import("../src/workflow/log.ts");
const { project } = await import("../src/workflow/project.ts");
const { reviewCap, reviewTerminal, runCap, runTerminal, suiteTerminal } =
  await import("../src/workflow/terminal.ts");

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

function reviewed(
  target: string,
  step: string,
  over: Record<string, unknown> = {},
): WorkflowEvent {
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

function authored(
  target: string,
  step: string,
  written: string[] = ["tests/test_value.py"],
): WorkflowEvent {
  return { event: "tests-authored", target, step, written };
}

function ran(
  target: string,
  step: string,
  over: Record<string, unknown> = {},
): WorkflowEvent {
  const green = Boolean(over.green);
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

function suiteRan(
  target: string,
  step: string,
  over: Record<string, unknown> = {},
): WorkflowEvent {
  const green = Boolean(over.green);
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

function fakeReview(options: { target: string; step: string; artifactPaths: string[] }) {
  return Promise.resolve([
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
  ]);
}

function checkRun(over: Record<string, unknown>) {
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
  const root = makeTempDir();
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "solution.yaml"), MANIFEST, "utf8");
  return root;
}

/**
 * The workspace as a real repository. Whether a failing run has been answered
 * is decided by comparing tree ids, so the tests loop's terminal states need
 * a tree to compare.
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

beforeEach(() => {
  fake.review = null;
  fake.runAuthored = null;
  fake.runSuite = null;
});

describe("the log", () => {
  it("refuses an unknown event", () => {
    expect(() => append(makeRoot(), { event: "invented" })).toThrow(/unknown event/);
  });

  it("appends rather than replaces", () => {
    const root = makeRoot();
    append(root, { event: "entered", target: "csv-parser", step: "plan" });
    append(root, { event: "entered", target: "csv-parser", step: "decompose" });
    expect(read(root)).toHaveLength(2);
  });

  it("reports a corrupt line with its position", () => {
    const root = makeRoot();
    append(root, { event: "entered", target: "x", step: "plan" });
    const path = logPath(root);
    writeFileSync(path, `${readText(path)}{not json\n`, "utf8");
    expect(() => read(root)).toThrow(/:2/);
  });
});

describe("the fold", () => {
  it("lets the latest step win", () => {
    const state = stateOf([
      { event: "entered", target: "a", step: "plan" },
      { event: "entered", target: "a", step: "decompose" },
    ]);
    expect(state.step).toBe("decompose");
  });

  it("puts a blocking review back with the author", () => {
    expect(
      stateOf([{ event: "reviewed", target: "a", verdict: "blocked" }]).waitingOn,
    ).toBe("author");
  });

  it("waits on the developer for a review needing approval", () => {
    expect(
      stateOf([
        { event: "reviewed", target: "a", verdict: "clear", needsApproval: true },
      ]).waitingOn,
    ).toBe("developer");
  });

  it("clears the wait on approval", () => {
    expect(
      stateOf([
        { event: "reviewed", target: "a", verdict: "clear", needsApproval: true },
        { event: "approved", target: "a" },
      ]).waitingOn,
    ).toBeNull();
  });

  it("moves the step backwards on a return, and counts it", () => {
    const state = stateOf([
      ...entriesThrough("a", "integration"),
      {
        event: "returned",
        target: "a",
        toStep: "contracts",
        reason: "boundary wrong",
      },
    ]);
    expect(state.step).toBe("contracts");
    expect(state.returns).toBe(1);
  });

  it("clears any earlier approval on a return", () => {
    const state = stateOf([
      ...entriesThrough("a", "decompose"),
      { event: "reviewed", target: "a", step: "decompose", verdict: "clear" },
      { event: "approved", target: "a" },
      { event: "returned", target: "a", toStep: "plan", reason: "x" },
    ]);
    expect(state.approved).toBe(false);
  });
});

// One `validateTransition` on both sides of the log. The writer refuses to
// record an impossible move and the reader refuses to replay one, so a
// hand-edited file cannot become history.
describe("record authority", () => {
  it("refuses a skipped step", () => {
    expect(() =>
      fold([
        { event: "entered", target: "a", step: "plan" },
        { event: "entered", target: "a", step: "mocks" },
      ]),
    ).toThrow(/steps are entered in order/);
  });

  it("refuses entering backwards and names send-back", () => {
    expect(() =>
      fold([
        ...entriesThrough("a", "contracts"),
        { event: "entered", target: "a", step: "plan" },
      ]),
    ).toThrow(/send-back/);
  });

  it("refuses a return that does not move back", () => {
    expect(() =>
      fold([
        ...entriesThrough("a", "contracts"),
        {
          event: "returned",
          target: "a",
          toStep: "mocks",
          reason: "forwards, dressed as a return",
        },
      ]),
    ).toThrow(/moves work backwards/);
  });

  it("refuses an approval outside an approval step", () => {
    expect(() =>
      fold([
        ...entriesThrough("a", "mocks"),
        { event: "reviewed", target: "a", step: "mocks", verdict: "clear" },
        { event: "approved", target: "a" },
      ]),
    ).toThrow(/not a step a developer/);
  });

  it("refuses an approval with no live review", () => {
    expect(() =>
      fold([
        { event: "entered", target: "a", step: "plan" },
        { event: "approved", target: "a" },
      ]),
    ).toThrow(/nothing live has been/);
  });

  it("refuses an event about another step", () => {
    expect(() =>
      fold([
        ...entriesThrough("a", "decompose"),
        { event: "reviewed", target: "a", step: "plan", verdict: "clear" },
      ]),
    ).toThrow(/work is at/);
  });

  it("refuses a log that opens partway through", () => {
    // A target with no history has entered nothing, so a first event naming a
    // later step records an arrival with no journey.
    expect(() =>
      validateTransition(null, { event: "entered", target: "a", step: "build" }),
    ).toThrow(/cannot begin at/);
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
    expect(() => fold(read(root))).toThrow(/steps are entered in order/);
  });
});

describe("a scripted review is not a live one", () => {
  it("does not count a simulated review as reviewed", () => {
    // The flag was recorded and never read, so a response served from a file
    // cleared the same gate two vendors clear.
    const state = stateOf([
      { event: "entered", target: "a", step: "plan" },
      {
        event: "reviewed",
        target: "a",
        step: "plan",
        verdict: "clear",
        simulated: true,
      },
    ]);
    expect(state.reviewed).toBe(false);
  });
});

// Five real review rounds on one plan document produced four Major findings
// every time, each round's findings genuinely new. A gate the reviewers can
// hold shut forever is not a gate.
describe("the approval gate outranks the block", () => {
  it("still reaches the developer on a blocked approval step", () => {
    const state = stateOf([
      { event: "entered", target: "a", step: "plan" },
      {
        event: "reviewed",
        target: "a",
        step: "plan",
        verdict: "blocked",
        needsApproval: true,
      },
    ]);
    expect(state.waitingOn).toBe("developer");
  });

  it("sends a blocked step with no gate back to the author", () => {
    const state = stateOf([
      ...entriesThrough("a", "mocks"),
      {
        event: "reviewed",
        target: "a",
        step: "mocks",
        verdict: "blocked",
        needsApproval: false,
      },
    ]);
    expect(state.waitingOn).toBe("author");
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
    const { out } = await captured(() =>
      workflowVerb(["approve", "--component", "csv-model", "--workspace-root", root]),
    );
    expect(read(root).at(-1)?.overFindings).toBe(2);
    expect(out).toContain("stay on the record");
  });
});

describe("the projection", () => {
  it("joins the manifest to live state", () => {
    const root = makeRoot();
    walkTo(root, "csv-parser", "mocks");
    const doc = project(root);
    const parser = (doc.components as Array<Record<string, unknown>>).find(
      (c) => c.name === "csv-parser",
    );
    expect(parser?.stepNumber).toBe(4);
    expect(parser?.usedBy).toEqual(["csv-app"]);
  });

  it("lists everything waiting on the developer", () => {
    const root = makeRoot();
    append(root, {
      event: "reviewed",
      target: "csv-model",
      verdict: "clear",
      needsApproval: true,
    });
    expect(project(root).needsYou).toEqual(["csv-model"]);
  });

  it("refuses a missing manifest", () => {
    expect(() => project(makeTempDir())).toThrow(/no solution manifest/);
  });
});

describe("the command line", () => {
  it("records what the reviewers actually said", async () => {
    // The verdict comes back from the readers. There is no longer a way to
    // hand one in on the command line.
    const root = makeRoot();
    walkTo(root, "csv-model", "contracts");
    fake.review = fakeReview;
    const art = join(root, "contract.yaml");
    writeFileSync(art, "calls: []\n", "utf8");
    const { code } = await captured(() =>
      workflowVerb([
        "review",
        "--artifact",
        art,
        "--component",
        "csv-model",
        "--workspace-root",
        root,
      ]),
    );
    expect(code).toBe(0);
    const event = read(root).at(-1) as WorkflowEvent;
    expect(event.event).toBe("reviewed");
    expect(event.step).toBe("contracts");
    expect(event.verdict).toBe("blocked");
    expect(
      (event.reviewers as Array<Record<string, unknown>>).map((r) => r.provider),
    ).toEqual(["anthropic", "openai"]);
  });

  it("files each reply verbatim", async () => {
    // A summary is not a record: a finding that exists only as someone's
    // paraphrase cannot be re-read.
    const root = makeRoot();
    append(root, { event: "entered", target: "csv-model", step: "plan" });
    fake.review = fakeReview;
    const art = join(root, "plan.md");
    writeFileSync(art, "# plan\n", "utf8");
    await captured(() =>
      workflowVerb([
        "review",
        "--artifact",
        art,
        "--component",
        "csv-model",
        "--workspace-root",
        root,
      ]),
    );
    const dir = join(root, ".dabbler", "solution", "reviews");
    const filed = readdirSync(dir).sort();
    expect(filed.map((name) => readText(join(dir, name)))).toEqual([
      "raw one",
      "raw two",
    ]);
  });

  it("refuses to review work that has not begun", () => {
    expect(() => currentStep(makeRoot(), "csv-model")).toThrow(
      /has not entered a step/,
    );
  });

  it("names the affected components on a send-back", async () => {
    const root = makeRoot();
    walkTo(root, "csv-model", "integration");
    const { out } = await captured(() =>
      workflowVerb([
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
      ]),
    );
    expect(out).toContain("csv-parser, csv-app");
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
    const { out } = await captured(() =>
      workflowVerb(["status", "--workspace-root", root]),
    );
    expect(out).toContain("needs you");
  });
});

// `workflow review` had no bound, so an unattended run kept calling two
// vendors for as long as anything invoked it. The loop now stops by itself
// and lands on one of the three terminal states, and no part of that waits
// for a person or can be typed by one.
describe("the review loop is bounded", () => {
  it("counts only a round that reached a vendor", () => {
    // The bound exists to stop the loop spending on vendors, so a round
    // served from a script spent nothing to bound.
    const state = stateOf([
      { event: "entered", target: "a", step: "plan" },
      reviewed("a", "plan", { live: false }),
      reviewed("a", "plan"),
    ]);
    expect(state.reviewRounds).toBe(1);
  });

  it("opens a new loop when the work moves", () => {
    // Rounds spent on what a step produced are not spent against the step the
    // work is sent back to.
    const state = stateOf([
      ...entriesThrough("a", "decompose"),
      reviewed("a", "decompose"),
      { event: "returned", target: "a", toStep: "plan", reason: "boundary wrong" },
    ]);
    expect(state.reviewRounds).toBe(0);
    expect(state.lastLiveReview).toBeNull();
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
    const before = stateOf(events);
    const after = stateOf([...events, { event: "entered", target: "a", step: "plan" }]);
    expect(after.reviewRounds).toBe(1);
    expect(before.reviewRounds).toBe(1);
    expect(after.reviewed).toBe(true);
    expect(before.reviewed).toBe(true);
    expect(after.waitingOn).toBe("developer");
    expect(before.waitingOn).toBe("developer");
  });

  it("takes the bound from the workspace, not the process directory", () => {
    // `--workspace-root` and `project(root)` are first-class entry points.
    // Reading the overlay from wherever the process happens to sit would
    // enforce one repository's cap against another's.
    const root = makeGitRoot();
    writeFileSync(
      join(root, "local-overrides.yaml"),
      stringifyYaml({ verification: { settings: { max_rounds: 1 } } }),
      "utf8",
    );
    const elsewhere = makeTempDir();
    mkdirSync(elsewhere, { recursive: true });
    const previous = process.cwd();
    process.chdir(elsewhere);
    try {
      expect(reviewCap(root)).toBe(1);
    } finally {
      process.chdir(previous);
    }
  });

  it("refuses a further round at the cap and names the way out", async () => {
    const root = makeRoot();
    walkTo(root, "csv-model", "contracts");
    fake.review = fakeReview;
    const art = join(root, "contract.yaml");
    writeFileSync(art, "calls: []\n", "utf8");
    const argv = [
      "review",
      "--artifact",
      art,
      "--component",
      "csv-model",
      "--workspace-root",
      root,
    ];
    for (let i = 0; i < reviewCap(root); i += 1) {
      expect((await captured(() => workflowVerb(argv))).code).toBe(0);
    }
    const { code, err } = await captured(() => workflowVerb(argv));
    expect(code).toBe(EXIT_REFUSED);
    expect(err).toContain("send-back");
    expect(err).toContain("Nobody is asked");
  });

  it("closes the loop as verified when a round has no blocking finding", () => {
    // The early stop. Minor findings are recorded and open no further round --
    // prose review has no bottom, which is what the severity vocabulary is for.
    const root = makeRoot();
    const state = stateOf([
      { event: "entered", target: "a", step: "plan" },
      reviewed("a", "plan", {
        verdict: "clear",
        findings: [{ severity: "minor", description: "casing" }],
      }),
    ]);
    expect(reviewTerminal(root, state, 3)).toBe(VERDICT_VERIFIED);
  });

  it("calls a fix at the cited site remediated at the cap", () => {
    // Not a waiver: nothing was accepted over a finding that still stood, and
    // what is unproved is the repair rather than the complaint.
    const root = makeRoot();
    writeFileSync(join(root, "plan.md"), "# rewritten after the finding\n", "utf8");
    const state = stateOf([
      { event: "entered", target: "a", step: "plan" },
      reviewed("a", "plan", {
        findings: [
          { severity: "major", description: "boundary", evidencePaths: ["plan.md"] },
        ],
        artifactDigests: { "plan.md": digestText("# as the round read it\n") },
      }),
    ]);
    expect(reviewTerminal(root, state, 1)).toBe(VERDICT_REMEDIATED_AT_CAP);
  });

  it("calls an untouched cited site unresolved", () => {
    const root = makeRoot();
    const text = "# exactly as the round read it\n";
    writeFileSync(join(root, "plan.md"), text, "utf8");
    const state = stateOf([
      { event: "entered", target: "a", step: "plan" },
      reviewed("a", "plan", {
        findings: [
          { severity: "major", description: "boundary", evidencePaths: ["plan.md"] },
        ],
        artifactDigests: { "plan.md": digestText(text) },
      }),
    ]);
    expect(reviewTerminal(root, state, 1)).toBe(VERDICT_ISSUES_FOUND);
  });

  it("cannot call a blocked round naming no finding remediated", () => {
    // Fail closed. Nothing to have fixed is not the same as nothing left to
    // fix, and an unreadable round must not be the cheapest way out.
    const root = makeRoot();
    const state = stateOf([
      { event: "entered", target: "a", step: "plan" },
      reviewed("a", "plan", { findings: [] }),
    ]);
    expect(reviewTerminal(root, state, 1)).toBe(VERDICT_ISSUES_FOUND);
  });

  it("carries the loop position in the projection", () => {
    // The router decides whether the loop has finished; the extension is
    // handed the answer rather than the events.
    const root = makeRoot();
    append(root, { event: "entered", target: "csv-model", step: "plan" });
    append(root, reviewed("csv-model", "plan"));
    const model = (project(root).components as Array<Record<string, unknown>>).find(
      (c) => c.name === "csv-model",
    );
    expect(model?.reviewRounds).toBe(1);
    expect(model?.reviewCap).toBe(reviewCap(root));
  });
});

// Spec 3.c.ii: the verifier authors the tests, the framework runs them, and
// what the loop reads is an exit code rather than an opinion. The bound and
// the three terminal states are the review loop's, on the same terms.
describe("the tests loop is bounded", () => {
  it("refuses a run with nothing authored, at the record", () => {
    // A run of the author's own tests filed as this phase would prove the one
    // thing the split exists to stop it proving.
    const root = makeRoot();
    append(root, { event: "entered", target: "a", step: "plan" });
    expect(() => append(root, ran("a", "plan"))).toThrow(/no test has been authored/);
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
    expect(runTerminal(root, state, 7)).toBe(VERDICT_VERIFIED);
  });

  it("calls an unmoved tree at the cap unresolved", () => {
    // Nothing was done about the failure, so nothing is proved by stopping.
    const root = makeGitRoot();
    const tree = snapshotWorktreeTree(root);
    const state = stateOf([
      { event: "entered", target: "a", step: "plan" },
      authored("a", "plan"),
      ran("a", "plan", { treeDigest: tree, postTreeDigest: tree }),
    ]);
    expect(runTerminal(root, state, 1)).toBe(VERDICT_ISSUES_FOUND);
  });

  it("calls a moved tree at the cap remediated", () => {
    // Not a waiver: no failure was accepted, and what is unproved is the
    // repair rather than the complaint.
    const root = makeGitRoot();
    const measured = snapshotWorktreeTree(root);
    const state = stateOf([
      { event: "entered", target: "a", step: "plan" },
      authored("a", "plan"),
      ran("a", "plan", { treeDigest: measured, postTreeDigest: measured }),
    ]);
    writeFileSync(join(root, "fix.py"), "VALUE = 2\n", "utf8");
    expect(runTerminal(root, state, 1)).toBe(VERDICT_REMEDIATED_AT_CAP);
  });

  it("does not let a run that dirtied the tree call that a repair", () => {
    // The comparison is against the tree the run left, not the one it was
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
    expect(runTerminal(root, state, 1)).toBe(VERDICT_ISSUES_FOUND);
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
    expect(state.testsAuthored).toEqual([]);
    expect(state.testRounds).toBe(0);
  });

  it("records the exit code rather than a claim", async () => {
    // The framework's half of the split. Nothing here asks anyone how it went.
    const root = makeRoot();
    append(root, { event: "entered", target: "csv-model", step: "plan" });
    append(root, authored("csv-model", "plan"));
    fake.runAuthored = (_root: string, _config: unknown, paths: string[]) =>
      Promise.resolve([
        checkRun({ command: `runner ${paths.join(" ")}` }),
      ]);
    const { code, out } = await captured(() =>
      workflowVerb(["test", "--component", "csv-model", "--workspace-root", root]),
    );
    expect(code).toBe(0);
    const event = read(root).at(-1) as WorkflowEvent;
    expect(event.event).toBe("tested");
    expect([event.exitCode, event.green]).toEqual([3, false]);
    expect(out).toContain("back with the author");
  });

  it("carries the tests loop position in the projection", () => {
    const root = makeRoot();
    append(root, { event: "entered", target: "csv-model", step: "plan" });
    append(root, authored("csv-model", "plan"));
    append(root, ran("csv-model", "plan", { green: true }));
    const model = (project(root).components as Array<Record<string, unknown>>).find(
      (c) => c.name === "csv-model",
    );
    expect(model?.testRounds).toBe(1);
    expect(model?.testCap).toBe(runCap(root));
    expect(model?.testTerminal).toBe(VERDICT_VERIFIED);
  });
});

// Spec 3.d: the complete suite against the tree including the authored tests,
// and a red run opening a fix loop whose scope the framework holds rather
// than requests.
describe("the suite loop and its fix round", () => {
  it("refuses a suite run before anything was authored", () => {
    // It would be the suite as it stood before the verifier read anything,
    // filed as the run that included what it wrote.
    const root = makeRoot();
    append(root, { event: "entered", target: "a", step: "plan" });
    expect(() => append(root, suiteRan("a", "plan"))).toThrow(
      /no test has been authored/,
    );
  });

  it("refuses a fix round with no failing run behind it", () => {
    // Without a named failure the round is a model invited to revise whatever
    // it notices.
    const root = makeRoot();
    append(root, { event: "entered", target: "a", step: "plan" });
    append(root, authored("a", "plan"));
    append(root, suiteRan("a", "plan", { green: true }));
    expect(() =>
      append(root, { event: "fixed", target: "a", step: "plan" }),
    ).toThrow(/no failing suite run/);
  });

  it("ends the suite loop on the tests loop's own terms", () => {
    // Section 3.d ends "same cap and same ending as c.ii", so it is the same
    // decision on a different run.
    const root = makeGitRoot();
    const tree = snapshotWorktreeTree(root);
    const state = stateOf([
      { event: "entered", target: "a", step: "plan" },
      authored("a", "plan"),
      suiteRan("a", "plan", { treeDigest: tree, postTreeDigest: tree }),
    ]);
    expect(suiteTerminal(root, state, 1)).toBe(VERDICT_ISSUES_FOUND);
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
    expect([state.suiteRounds, state.fixRounds]).toEqual([0, 0]);
  });

  it("records which tests the run named", async () => {
    // The fix round is scoped to these and nothing else, so what the run
    // named is on the record rather than re-derived later.
    const root = makeDeclaringRoot();
    append(root, { event: "entered", target: "csv-model", step: "plan" });
    append(root, authored("csv-model", "plan"));
    fake.runSuite = () =>
      Promise.resolve([
        checkRun({
          stage: "final-full",
          exitCode: 1,
          durationSeconds: 0.4,
          output: "FAILED tests/test_value.py::test_it - assert 1 == 2\n",
        }),
      ]);
    const { code } = await captured(() =>
      workflowVerb(["suite", "--component", "csv-model", "--workspace-root", root]),
    );
    expect(code).toBe(0);
    const event = read(root).at(-1) as WorkflowEvent;
    expect(event.event).toBe("suite-run");
    expect(
      (event.failures as Array<Record<string, unknown>>).map((f) => f.name),
    ).toEqual(["tests/test_value.py::test_it"]);
  });

  it("carries the suite position and the fix count in the projection", () => {
    // Two different questions: how close the loop came to its bound, and how
    // much repair the step needed to get there.
    const root = makeRoot();
    append(root, { event: "entered", target: "csv-model", step: "plan" });
    append(root, authored("csv-model", "plan"));
    append(root, suiteRan("csv-model", "plan"));
    append(root, { event: "fixed", target: "csv-model", step: "plan" });
    const model = (project(root).components as Array<Record<string, unknown>>).find(
      (c) => c.name === "csv-model",
    );
    expect([model?.suiteRounds, model?.fixRounds]).toEqual([1, 1]);
    expect(model?.suiteCap).toBe(runCap(root));
  });
});

describe("the projection file", () => {
  it("is published by a mutating command", async () => {
    const root = makeRoot();
    walkTo(root, "csv-parser", "contracts");
    await captured(() =>
      workflowVerb([
        "enter",
        "mocks",
        "--component",
        "csv-parser",
        "--workspace-root",
        root,
      ]),
    );
    const path = join(root, ".dabbler", "solution", "projection.json");
    expect(existsSync(path)).toBe(true);
    const doc = JSON.parse(readText(path)) as Record<string, unknown>;
    const parser = (doc.components as Array<Record<string, unknown>>).find(
      (c) => c.name === "csv-parser",
    );
    expect(parser?.stepTitle).toBe("Build stand-ins");
  });

  it("keeps the event when the manifest cannot be projected", async () => {
    // The record is the point. A broken manifest must not eat an event.
    const root = makeTempDir();
    mkdirSync(root, { recursive: true });
    const { code } = await captured(() =>
      workflowVerb(["enter", "plan", "--workspace-root", root]),
    );
    expect(code).toBe(0);
    expect(read(root)).toHaveLength(1);
  });
});
