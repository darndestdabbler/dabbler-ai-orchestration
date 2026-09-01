// The router the extension holds after the cutover.
//
// What the extension's own suite used to assert -- that a verb is asked
// with the arguments it declares -- is asserted here instead, and against a
// real repository rather than a captured argv. That is the point of the
// cutover: there is no argv, so "the right command was built" stops being
// a claim anything can check and "the record moved" starts being one.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, afterAll } from "vitest";

import { capture } from "../src/cli/output.ts";
import {
  InProcessRouter,
  commandLineFor,
  createInProcessRouter,
  quoteForDisplay,
  type RouterEcho,
} from "../src/inProcess.ts";
import {
  CLASS_VALUE_TRADEOFF,
  foldOwed,
  openDecisions,
  raiseOwed,
  readOwed,
} from "../src/owedDecisions.ts";
import { standIn, workingDirectory } from "../src/workdir.ts";
import { makeSandboxRepo, removeTempDirs } from "./support/fixtures.ts";

afterAll(removeTempDirs);

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
    const inside = await standIn(__dirname, async () => workingDirectory());
    expect(inside).toBe(__dirname);
    expect(workingDirectory()).toBe(outside);
  });

  it("restores the answer even when the call throws", async () => {
    const outside = workingDirectory();
    await expect(
      standIn(__dirname, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(workingDirectory()).toBe(outside);
  });

  it("refuses to nest rather than resolve half a call's paths elsewhere", async () => {
    await expect(
      standIn(__dirname, () => standIn(__dirname, async () => 1)),
    ).rejects.toThrow(/already standing in/);
  });
});

describe("what a verb writes, collected", () => {
  it("collects both streams separately and lets the value through", async () => {
    const collected = await capture(async () => {
      const { writeErr, writeOut } = await import("../src/cli/output.ts");
      writeOut("to stdout\n");
      writeErr("to stderr\n");
      return 7;
    });
    expect(collected.value).toBe(7);
    expect(collected.stdout.trim()).toBe("to stdout");
    expect(collected.stderr.trim()).toBe("to stderr");
  });

  it("refuses to nest rather than interleave two verbs into one buffer", async () => {
    await expect(
      capture(() => capture(async () => 1)),
    ).rejects.toThrow(/already being captured/);
  });
});

describe("the in-process router", () => {
  it("answers the projection as a value, with no text in between", async () => {
    const { repo, sessionsDir } = makeSandboxRepo();
    const router = createInProcessRouter();
    const result = await router.progress({ repoRoot: repo, sessionsDir });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sessions).toHaveLength(2);
    expect(result.value.repository.currentSession).toBeNull();
  });

  it("derives the sessions root from the repository when the caller names none", async () => {
    const { repo } = makeSandboxRepo();
    const result = await createInProcessRouter().progress({ repoRoot: repo });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sessions).toHaveLength(2);
  });

  it("registers a session, and the record on disk is what moved", async () => {
    const { repo, sessionsDir } = makeSandboxRepo();
    const router = createInProcessRouter();
    const result = await router.session.start({
      repoRoot: repo,
      sessionsDir,
      engine: "claude-code",
      provider: "anthropic",
    });
    expect(result.ok).toBe(true);
    const state = JSON.parse(
      readFileSync(join(sessionsDir, "sessions.json"), "utf8"),
    );
    expect(state.sessions[0].status).toBe("in-progress");
    expect(state.sessions[0].orchestrator.engine).toBe("claude-code");
  });

  it("places a repository the Explorer cannot reach, and the declaration is what moved", async () => {
    // The extension calls these rather than editing the tracked declaration
    // itself: two writers for one file drift, and only one of them can be
    // schema-checked on the way out.
    const { repo, sessionsDir } = makeSandboxRepo();
    const declaration = join(repo, "solution-dependencies.json");
    writeFileSync(
      declaration,
      JSON.stringify({
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
      "utf8",
    );
    const router = createInProcessRouter();

    const located = await router.deps.locate({
      repoRoot: repo,
      sessionsDir,
      repository: "csv-model",
      remote: "git@github.com:dabbler/csv-model.git",
    });
    expect(located.ok).toBe(true);
    expect(JSON.parse(readFileSync(declaration, "utf8")).consumes[0].producedBy).toMatchObject({
      remote: "git@github.com:dabbler/csv-model.git",
    });

    // The shell: membership and nothing else, which is what puts a
    // repository nothing depends on into the graph at all.
    const made = await router.deps.scaffold({
      repoRoot: repo,
      sessionsDir,
      repository: "csv-cli",
      path: "../csv-cli",
    });
    expect(made.ok).toBe(true);
    const shell = JSON.parse(
      readFileSync(join(repo, "..", "csv-cli", "solution-dependencies.json"), "utf8"),
    );
    expect(shell).toMatchObject({ solution: "csv-pipeline", repositoryId: "csv-cli", consumes: [] });

    // And a refusal arrives as the contract's outcome, in the verb's own
    // words rather than a sentence the caller invented. Nothing is cloned
    // here: a producer nobody has named a remote for is refused before git
    // is reached, which is also why this test touches no network.
    const cannot = await router.deps.clone({
      repoRoot: repo,
      sessionsDir,
      repository: "csv-report",
    });
    expect(cannot.ok).toBe(false);
    expect(cannot.ok === false ? cannot.message : "").toContain("declares no remote");
  });

  it("turns a verb's refusal into the contract's outcome, with its own words", async () => {
    const { repo, sessionsDir } = makeSandboxRepo();
    const router = createInProcessRouter();
    await router.session.start({
      repoRoot: repo,
      sessionsDir,
      engine: "claude-code",
      provider: "anthropic",
    });
    // A session in flight cannot be cancelled without --force, and the
    // verb says so; the router reports the verb's sentence, not one of
    // its own.
    const result = await router.session.cancel({
      repoRoot: repo,
      sessionsDir,
      sessionNumber: 1,
      reason: "changed my mind",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.outcome).toBe("refused");
    expect(result.exitCode).toBe(3);
    expect(result.message).toMatch(/in flight|--force/);
  });

  it("bootstraps a project, which is the whole of first-run now", async () => {
    const { repo } = makeSandboxRepo();
    const result = await createInProcessRouter().bootstrap({ projectDir: repo });
    expect(result.ok).toBe(true);
    expect(existsSync(join(repo, "AGENTS.md"))).toBe(true);
  });

  it("settles an owed decision, and the ledger is what says so", async () => {
    const { repo, sessionsDir } = makeSandboxRepo();
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

    expect(result.ok).toBe(true);
    // Answered, and therefore no longer owed -- which is the half the
    // surface that raised it reads back.
    expect(openDecisions(repo)).toEqual([]);
    const settled = foldOwed(readOwed(repo)).get("driver-stop-s1");
    expect(settled).toMatchObject({
      event: "answered",
      answer: "Run `next` again",
      note: "answered from the Work Explorer",
    });
  });

  it("reads the last round of a session, or null when it has none", async () => {
    const { repo } = makeSandboxRepo();
    const result = await createInProcessRouter().ledger.latestRound({
      repoRoot: repo,
      sessionNumber: 1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBeNull();
  });

  it("reports a read it cannot vouch for as an answer, not a rejected promise", async () => {
    const { repo } = makeSandboxRepo();
    const runDir = join(repo, ".dabbler", "runs", "s1");
    const { mkdirSync } = await import("node:fs");
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
    // Every typed read opens a machine-owned file, and every one of them
    // fails the same way: a ledger line that will not parse, a plan whose
    // bytes no sanctioned write accounts for, a sessions root that is not
    // there. Each is something the caller has to SHOW.
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.outcome).toBe("failed");
    expect(result.message).toMatch(/failed schema validation/);
  });

  it("shows the operator the line they could have typed, and what came back", async () => {
    const { repo, sessionsDir } = makeSandboxRepo();
    const { echo, lines } = recordingEcho();
    await createInProcessRouter({ echo }).session.start({
      repoRoot: repo,
      sessionsDir,
      engine: "claude-code",
      provider: "anthropic",
    });
    expect(lines[0]).toContain("dabbler session start --engine claude-code");
    expect(lines[0]).toContain(quoteForDisplay(sessionsDir));
    expect(lines[1]).toContain("registered");
  });

  it("keeps a polled read out of the command log", async () => {
    const { repo, sessionsDir } = makeSandboxRepo();
    const { echo, lines } = recordingEcho();
    await createInProcessRouter({ echo }).progress({ repoRoot: repo, sessionsDir });
    expect(lines).toEqual([]);
  });

  it("serializes concurrent calls rather than letting them share a buffer", async () => {
    const { repo, sessionsDir } = makeSandboxRepo();
    const router = createInProcessRouter();
    const answers = await Promise.all([
      router.progress({ repoRoot: repo, sessionsDir }),
      router.affected({ repoRoot: repo, sessionsDir }),
      router.progress({ repoRoot: repo, sessionsDir }),
    ]);
    for (const answer of answers) expect(answer.ok).toBe(true);
  });

  it("keeps answering after a call rejects, rather than wedging the queue", async () => {
    const { repo, sessionsDir } = makeSandboxRepo();
    const router = new InProcessRouter();
    await expect(router.runVerb("nonesuch", [], repo)).rejects.toThrow(/no verb/);
    const result = await router.progress({ repoRoot: repo, sessionsDir });
    expect(result.ok).toBe(true);
  });
});

describe("the line an operator could type", () => {
  it("names the verb and its arguments, and quotes what a shell would split", () => {
    expect(commandLineFor("session", ["close", "--dry-run"])).toBe(
      "dabbler session close --dry-run",
    );
    expect(commandLineFor("session", ["cancel", "3", "--reason", "no time"])).toBe(
      'dabbler session cancel 3 --reason "no time"',
    );
  });

  it("escapes with PowerShell's backtick, because a Windows path ends in one", () => {
    expect(quoteForDisplay('say "hi"')).toBe('"say `"hi`""');
    expect(quoteForDisplay("")).toBe('""');
  });
});
