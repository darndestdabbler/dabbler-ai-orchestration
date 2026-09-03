// The router the extension holds after the cutover.
//
// What the extension's own suite used to assert -- that a verb is asked with
// the arguments it declares -- is asserted here instead, and against a real
// repository rather than a captured argv. That is the point of the cutover:
// there is no argv, so "the right command was built" stops being a claim
// anything can check and "the record moved" starts being one.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  InProcessRouter,
  commandLineFor,
  createInProcessRouter,
  quoteForDisplay,
  type RouterEcho,
} from "../src/inProcess.ts";
import { capture, writeErr, writeOut } from "../src/output.ts";
import {
  CLASS_VALUE_TRADEOFF,
  foldOwed,
  openDecisions,
  raiseOwed,
  readOwed,
} from "../src/owedDecisions.ts";
import { standIn, workingDirectory } from "../src/workdir.ts";
import { makeSandbox } from "./support/repo.ts";

/** An echo that keeps what it was told, in order. */
function recordingEcho(): { echo: RouterEcho; lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    echo: {
      running: (line) => lines.push(`run: ${line}`),
      wrote: (output) => lines.push(`out: ${output.trim()}`),
    },
  };
}

describe("where the router is standing", () => {
  it("answers the process until a call says otherwise, and again after", async () => {
    const outside = workingDirectory();
    const elsewhere = import.meta.dirname;
    assert.equal(await standIn(elsewhere, () => Promise.resolve(workingDirectory())), elsewhere);
    assert.equal(workingDirectory(), outside);
  });

  it("restores the answer even when the call throws", async () => {
    const outside = workingDirectory();
    await assert.rejects(
      () =>
        standIn(import.meta.dirname, () => {
          throw new Error("boom");
        }),
      /boom/,
    );
    assert.equal(workingDirectory(), outside);
  });

  it("refuses to nest rather than resolve half a call's paths elsewhere", async () => {
    await assert.rejects(
      () =>
        standIn(import.meta.dirname, () =>
          standIn(import.meta.dirname, () => Promise.resolve(1)),
        ),
      /already standing in/,
    );
  });
});

describe("what a verb writes, collected", () => {
  it("collects both streams separately and lets the value through", async () => {
    const collected = await capture(() => {
      writeOut("to stdout\n");
      writeErr("to stderr\n");
      return Promise.resolve(7);
    });
    assert.equal(collected.value, 7);
    assert.equal(collected.stdout.trim(), "to stdout");
    assert.equal(collected.stderr.trim(), "to stderr");
  });

  it("refuses to nest rather than interleave two verbs into one buffer", async () => {
    await assert.rejects(
      () => capture(() => capture(() => Promise.resolve(1))),
      /already being captured/,
    );
  });
});

describe("the in-process router", () => {
  it("answers the projection as a value, with no text in between", async () => {
    const { repo, sessionsDir } = makeSandbox();
    const result = await createInProcessRouter().progress({ repoRoot: repo, sessionsDir });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.sessions.length, 2);
    assert.equal(result.value.repository.currentSession, null);
  });

  it("derives the sessions root from the repository when the caller names none", async () => {
    const { repo } = makeSandbox();
    const result = await createInProcessRouter().progress({ repoRoot: repo });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.sessions.length, 2);
  });

  it("registers a session, and the record on disk is what moved", async () => {
    const { repo, sessionsDir } = makeSandbox();
    const result = await createInProcessRouter().session.start({
      repoRoot: repo,
      sessionsDir,
      engine: "claude-code",
      provider: "anthropic",
    });
    assert.equal(result.ok, true);
    const state = JSON.parse(readFileSync(join(sessionsDir, "sessions.json"), "utf8")) as {
      sessions: Array<Record<string, Record<string, unknown>>>;
    };
    assert.equal(state.sessions[0]!["status"], "in-progress");
    assert.equal(state.sessions[0]!["orchestrator"]!["engine"], "claude-code");
  });

  it("places a repository the Explorer cannot reach, and the declaration is what moved", async () => {
    // The extension calls these rather than editing the tracked declaration
    // itself: two writers for one file drift, and only one of them can be
    // schema-checked on the way out.
    const { repo, sessionsDir } = makeSandbox({
      "solution-dependencies.json": JSON.stringify({
        schemaVersion: 1,
        solution: "csv-pipeline",
        repositoryId: "csv-app",
        consumes: [
          {
            id: "Dabbler.Csv.Model",
            kind: "nuget",
            producedBy: { id: "csv-model", remote: null, path: null },
            resolve: "feed",
          },
          {
            id: "Dabbler.Csv.Report",
            kind: "nuget",
            producedBy: { id: "csv-report", remote: null, path: null },
            resolve: "feed",
          },
        ],
      }),
    });
    const declaration = join(repo, "solution-dependencies.json");
    const router = createInProcessRouter();

    const located = await router.deps.locate({
      repoRoot: repo,
      sessionsDir,
      repository: "csv-model",
      remote: "git@github.com:dabbler/csv-model.git",
    });
    assert.equal(located.ok, true);
    const declared = JSON.parse(readFileSync(declaration, "utf8")) as {
      consumes: Array<{ producedBy: Record<string, unknown> }>;
    };
    assert.equal(
      declared.consumes[0]!.producedBy["remote"],
      "git@github.com:dabbler/csv-model.git",
    );

    // The shell: membership and nothing else, which is what puts a
    // repository nothing depends on into the graph at all.
    const made = await router.deps.scaffold({
      repoRoot: repo,
      sessionsDir,
      repository: "csv-cli",
      path: "../csv-cli",
    });
    assert.equal(made.ok, true);
    const shell = JSON.parse(
      readFileSync(join(repo, "..", "csv-cli", "solution-dependencies.json"), "utf8"),
    ) as Record<string, unknown>;
    assert.equal(shell["solution"], "csv-pipeline");
    assert.equal(shell["repositoryId"], "csv-cli");
    assert.deepEqual(shell["consumes"], []);

    // And a refusal arrives as the contract's outcome, in the verb's own
    // words rather than a sentence the caller invented. Nothing is cloned
    // here: a producer nobody has named a remote for is refused before git
    // is reached, which is also why this test touches no network.
    const cannot = await router.deps.clone({
      repoRoot: repo,
      sessionsDir,
      repository: "csv-report",
    });
    assert.equal(cannot.ok, false);
    assert.match(cannot.ok === false ? cannot.message : "", /declares no remote/);
  });

  it("turns a verb's refusal into the contract's outcome, with its own words", async () => {
    const { repo, sessionsDir } = makeSandbox();
    const router = createInProcessRouter();
    await router.session.start({
      repoRoot: repo,
      sessionsDir,
      engine: "claude-code",
      provider: "anthropic",
    });
    // A session in flight cannot be cancelled without --force, and the verb
    // says so; the router reports the verb's sentence, not one of its own.
    const result = await router.session.cancel({
      repoRoot: repo,
      sessionsDir,
      sessionNumber: 1,
      reason: "changed my mind",
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.outcome, "refused");
    assert.equal(result.exitCode, 3);
    assert.match(result.message, /in flight|--force/);
  });

  it("bootstraps a project, which is the whole of first-run now", async () => {
    const { repo } = makeSandbox();
    const result = await createInProcessRouter().bootstrap({ projectDir: repo });
    assert.equal(result.ok, true);
    assert.ok(existsSync(join(repo, "AGENTS.md")));
  });

  it("settles an owed decision, and the ledger is what says so", async () => {
    const { repo, sessionsDir } = makeSandbox();
    raiseOwed(repo, {
      id: "driver-stop-s1",
      decisionClass: CLASS_VALUE_TRADEOFF,
      question: "Session 001 stopped (budget). Run it again, or cancel it?",
      determined: "the loop met driver.max_invocations (1)",
      options: [
        { label: "Run `next` again", consequence: "It resumes from the phase it stopped in." },
        { label: "Cancel the session", consequence: "It ends with a reason on the record." },
      ],
      recommendation: "Run `next` again",
    });

    const result = await createInProcessRouter().owed.answer({
      repoRoot: repo,
      sessionsDir,
      id: "driver-stop-s1",
      choice: "Run `next` again",
      note: "answered from the Work Explorer",
    });

    assert.equal(result.ok, true);
    // Answered, and therefore no longer owed -- which is the half the
    // surface that raised it reads back.
    assert.deepEqual(openDecisions(repo), []);
    const settled = foldOwed(readOwed(repo)).get("driver-stop-s1");
    assert.equal(settled?.["event"], "answered");
    assert.equal(settled?.["answer"], "Run `next` again");
    assert.equal(settled?.["note"], "answered from the Work Explorer");
  });

  it("reads the last round of a session, or null when it has none", async () => {
    const { repo } = makeSandbox();
    const result = await createInProcessRouter().ledger.latestRound({
      repoRoot: repo,
      sessionNumber: 1,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value, null);
  });

  it("reports a read it cannot vouch for as an answer, not a rejected promise", async () => {
    // Every typed read opens a machine-owned file, and every one of them
    // fails the same way: a ledger line that will not parse, a plan whose
    // bytes no sanctioned write accounts for, a sessions root that is not
    // there. Each is something the caller has to SHOW.
    const { repo } = makeSandbox();
    const runDir = join(repo, ".dabbler", "runs", "s1");
    mkdirSync(runDir, { recursive: true });
    writeFileSync(
      join(runDir, "approved-plan.json"),
      JSON.stringify({ schema_version: 1, session_number: 1, steps: [] }),
      "utf8",
    );
    const result = await createInProcessRouter().approvedPlan.read({
      repoRoot: repo,
      sessionNumber: 1,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.outcome, "failed");
    assert.match(result.message, /failed schema validation/);
  });

  it("shows the operator the line they could have typed, and what came back", async () => {
    const { repo, sessionsDir } = makeSandbox();
    const { echo, lines } = recordingEcho();
    await createInProcessRouter({ echo }).session.start({
      repoRoot: repo,
      sessionsDir,
      engine: "claude-code",
      provider: "anthropic",
    });
    assert.match(String(lines[0]), /dabbler session start --engine claude-code/);
    assert.ok(String(lines[0]).includes(quoteForDisplay(sessionsDir)));
    assert.match(String(lines[1]), /registered/);
  });

  it("keeps a polled read out of the command log", async () => {
    const { repo, sessionsDir } = makeSandbox();
    const { echo, lines } = recordingEcho();
    await createInProcessRouter({ echo }).progress({ repoRoot: repo, sessionsDir });
    assert.deepEqual(lines, []);
  });

  it("serializes concurrent calls rather than letting them share a buffer", async () => {
    const { repo, sessionsDir } = makeSandbox();
    const router = createInProcessRouter();
    const answers = await Promise.all([
      router.progress({ repoRoot: repo, sessionsDir }),
      router.affected({ repoRoot: repo, sessionsDir }),
      router.progress({ repoRoot: repo, sessionsDir }),
    ]);
    for (const answer of answers) assert.equal(answer.ok, true);
  });

  it("keeps answering after a call rejects, rather than wedging the queue", async () => {
    const { repo, sessionsDir } = makeSandbox();
    const router = new InProcessRouter();
    await assert.rejects(() => router.runVerb("nonesuch", [], repo), /no verb/);
    const result = await router.progress({ repoRoot: repo, sessionsDir });
    assert.equal(result.ok, true);
  });
});

describe("the line an operator could type", () => {
  it("names the verb and its arguments, and quotes what a shell would split", () => {
    assert.equal(commandLineFor("session", ["close", "--dry-run"]), "dabbler session close --dry-run");
    assert.equal(
      commandLineFor("session", ["cancel", "3", "--reason", "no time"]),
      'dabbler session cancel 3 --reason "no time"',
    );
  });

  it("escapes with PowerShell's backtick, because a Windows path ends in one", () => {
    assert.equal(quoteForDisplay('say "hi"'), '"say `"hi`""');
    assert.equal(quoteForDisplay(""), '""');
  });
});
