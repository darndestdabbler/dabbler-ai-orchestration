// The command lines the lifecycle documents: `dabbler session`'s
// subcommands, `dabbler status` and `dabbler modules`.
//
// The parser's whole grammar is not the contract, the flags the lifecycle
// documents are -- so what is asserted here is that every documented flag
// reaches the function it names, and that a flag nobody documented is a
// usage error rather than a silent no-op. A misspelled `--not-releasable`
// that parsed as nothing would publish.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { modulesVerb } from "../src/cli/modules.ts";
import { HANDLERS } from "../src/cli/registry.ts";
import { sessionVerb } from "../src/cli/session.ts";
import { statusVerb } from "../src/cli/status.ts";
import { VERBS } from "../src/contracts/verbs.ts";
import { writeInstruction } from "../src/driver.ts";
import { capture } from "../src/output.ts";
import { readRawSessionState } from "../src/progress.ts";
import { registerSessionStart } from "../src/writers.ts";
import { makeAnsweredSandbox, tempDir } from "./support/answers.ts";

async function run(
  verb: () => Promise<number> | number,
): Promise<{ code: number; out: string; err: string }> {
  const collected = await capture(() => Promise.resolve(verb()));
  return { code: collected.value, out: collected.stdout, err: collected.stderr };
}

describe("dabbler session, the whole surface", () => {
  it("registers every subcommand the lifecycle documents", async () => {
    const result = await run(() => sessionVerb(["--help"]));
    for (const name of [
      "start",
      "decision",
      "declare",
      "plan",
      "close",
      "cancel",
      "restore",
      "migrate",
    ]) {
      assert.ok(result.out.includes(name), name);
    }
    assert.ok(!result.out.includes("not yet"));
  });

  it("refuses a subcommand that does not exist, and says so differently", async () => {
    const result = await run(() => sessionVerb(["clsoe"]));
    assert.equal(result.code, 2);
    assert.match(result.err, /is not a subcommand/);
  });

  it("answers --help on a SUBCOMMAND with that subcommand's own arguments", async () => {
    // `--help` was read by the option parser as a flag expecting a value, so
    // the one way to discover a subcommand's arguments was to run it bare and
    // read a refusal -- which names what is required and never what is
    // optional.
    for (const [subcommand, flag, expected] of [
      ["start", "--help", "--engine"],
      ["declare", "-h", "--releasable"],
      ["plan", "--help", "--max-rounds"],
    ] as const) {
      const result = await run(() => sessionVerb([subcommand, flag]));
      assert.equal(result.code, 0, subcommand);
      assert.ok(result.out.includes(expected), `${subcommand} ${expected}`);
      assert.ok(!result.err.includes("expected one argument"));
    }
  });

  it("runs the close read-only under --dry-run", async () => {
    const { sessionsDir } = makeAnsweredSandbox();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    const result = await run(() => sessionVerb(["close", "--dry-run", "--sessions-dir", sessionsDir]));
    assert.equal(result.code, 1);
    assert.match(result.out, /gates pass; nothing written\./);
    const record = (readRawSessionState(sessionsDir)?.["sessions"] as Record<string, unknown>[])[0];
    assert.equal(record?.["status"], "in-progress");
  });

  it("takes the session number for cancel as a positional", async () => {
    const { sessionsDir } = makeAnsweredSandbox();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    const result = await run(() =>
      sessionVerb(["cancel", "1", "--reason", "stop", "--force", "--sessions-dir", sessionsDir]),
    );
    assert.equal(result.code, 0);
    assert.match(result.out, /"status": "cancelled"/);
  });

  it("requires the reason a cancellation is recorded under", async () => {
    const { sessionsDir } = makeAnsweredSandbox();
    const result = await run(() => sessionVerb(["cancel", "1", "--sessions-dir", sessionsDir]));
    assert.equal(result.code, 2);
    assert.match(result.err, /--reason/);
  });

  it("refuses a session number that is not one, and requires the positional", async () => {
    const { sessionsDir } = makeAnsweredSandbox();
    const notANumber = await run(() => sessionVerb(["restore", "one", "--sessions-dir", sessionsDir]));
    assert.equal(notANumber.code, 2);
    assert.match(notANumber.err, /invalid int value/);

    const missing = await run(() => sessionVerb(["restore", "--sessions-dir", sessionsDir]));
    assert.equal(missing.code, 2);
    assert.match(missing.err, /session_number/);
  });

  it("takes the plan prose inline or from a file, and never both", async () => {
    const { sessionsDir } = makeAnsweredSandbox();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    const both = await run(() =>
      sessionVerb(["plan", "--body", "a", "--body-file", "b", "--sessions-dir", sessionsDir]),
    );
    assert.equal(both.code, 2);
    assert.match(both.err, /not allowed with argument --body/);

    const neither = await run(() => sessionVerb(["plan", "--sessions-dir", sessionsDir]));
    assert.equal(neither.code, 2);
    assert.match(neither.err, /one of the arguments --body --body-file/);

    const ok = await run(() =>
      sessionVerb(["plan", "--body", "The plan.", "--sessions-dir", sessionsDir]),
    );
    assert.equal(ok.code, 0);
    assert.match(readFileSync(join(sessionsDir, "project-work-plan.md"), "utf8"), /The plan\./);
  });

  it("requires the legacy directory a migration reads", async () => {
    const { sessionsDir } = makeAnsweredSandbox();
    const result = await run(() => sessionVerb(["migrate", "--sessions-dir", sessionsDir]));
    assert.equal(result.code, 2);
    assert.match(result.err, /legacy_set_dir/);
  });
});

describe("dabbler status", () => {
  it("emits the projection as indented JSON, in one output mode", async () => {
    // `--json` is what the projection IS, not a switch between two shapes.
    const { sessionsDir } = makeAnsweredSandbox();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    const bare = await run(() => statusVerb(["--sessions-dir", sessionsDir]));
    assert.equal(bare.code, 0);
    const projection = JSON.parse(bare.out) as Record<string, unknown>;
    assert.equal(projection["schemaVersion"], 1);
    assert.equal((projection["sessions"] as unknown[]).length, 2);

    const flagged = await run(() => statusVerb(["--json", "--sessions-dir", sessionsDir]));
    const strip = (text: string): string =>
      text.replace(/"generatedAt": "[^"]*"/, '"generatedAt": "<ts>"');
    assert.equal(strip(flagged.out), strip(bare.out));
  });

  it("is the one name for the projection, and `progress` is not a verb", async () => {
    // `status` is what the operator was promised when the run core's own
    // `status` went away. It was an alias over `progress` for one session,
    // because the extension spawned `progress`; the extension calls a method
    // now, so the second name has nothing holding it up.
    assert.ok(!VERBS.map((spec) => spec.verb).includes("progress"));
    assert.equal(HANDLERS["progress"], undefined);
    assert.match((await run(() => statusVerb(["--help"]))).out, /usage: dabbler status/);
  });

  it("refuses a sessions root that is not a directory, and an argument it does not know", async () => {
    const absent = await run(() =>
      statusVerb(["--sessions-dir", join(tempDir("cli-"), "nowhere")]),
    );
    assert.equal(absent.code, 2);
    assert.match(absent.err, /not a directory/);

    const unknown = await run(() => statusVerb(["--sessions"]));
    assert.equal(unknown.code, 2);
    assert.match(unknown.err, /unrecognized argument/);
  });
});

describe("dabbler modules", () => {
  it("has one subcommand, because the manifest has one writer", async () => {
    const result = await run(() => modulesVerb(["list", tempDir("cli-")]));
    assert.equal(result.code, 2);
    assert.match(result.err, /is not a subcommand/);
  });

  it("passes the root positionally and collects each repeatable flag", async () => {
    const root = tempDir("cli-");
    const result = await run(() =>
      modulesVerb([
        "create",
        root,
        "--slug",
        "greeter",
        "--title",
        "Greeter",
        "--code-root",
        "src/greeter",
        "--code-root",
        "tests/greeter",
      ]),
    );
    assert.equal(result.code, 0);
    const manifest = readFileSync(join(root, "docs", "modules.yaml"), "utf8");
    assert.match(manifest, /src\/greeter/);
    assert.match(manifest, /tests\/greeter/);
  });

  it("requires the slug and the title, which the CLI does not default", async () => {
    const result = await run(() => modulesVerb(["create", tempDir("cli-")]));
    assert.equal(result.code, 2);
    assert.match(result.err, /--slug, --title/);
  });

  it("refuses a workspace root that is not a directory", async () => {
    const result = await run(() =>
      modulesVerb(["create", join(tempDir("cli-"), "nowhere"), "--slug", "a", "--title", "A"]),
    );
    assert.equal(result.code, 2);
    assert.match(result.err, /not a directory/);
  });
});

describe("the verb registry", () => {
  it("has a handler for every verb the table offers", () => {
    for (const spec of VERBS) {
      assert.equal(typeof HANDLERS[spec.verb], "function", spec.verb);
    }
  });
});

describe("dabbler session run", () => {
  it("refuses when no session is in flight, naming the registration it needs", async () => {
    const { sessionsDir } = makeAnsweredSandbox();
    const result = await run(() => sessionVerb(["run", "--sessions-dir", sessionsDir]));
    assert.notEqual(result.code, 0);
    assert.match(result.err, /no session is in flight/);
    // `start`, not `next`: registration left `next` in session 90, so a
    // refusal that still named `next` would send the operator to a verb
    // that now refuses them back.
    assert.match(result.err, /session start/);
  });
});

describe("dabbler session hook-stop", () => {
  it("blocks the settle while a step instruction is outstanding, in the RUN sentence", async () => {
    const { repo, sessionsDir } = makeAnsweredSandbox();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    writeInstruction(repo, 1, {
      schema_version: 1,
      seq: 3,
      session_number: 1,
      issued_at: new Date().toISOString(),
      kind: "step",
      step_id: "widget",
      ask: "do the widget",
      answer_schema: "driver-report.schema.json",
      answer_command: "dabbler session report --seq 3",
    });
    const result = await run(() => sessionVerb(["hook-stop", "--sessions-dir", sessionsDir]));
    assert.equal(result.code, 0);
    const decision = JSON.parse(result.out) as Record<string, string>;
    assert.equal(decision["decision"], "block");
    assert.match(String(decision["reason"]), /RUN the shell command/);
    assert.match(String(decision["reason"]), /seq 3/);
  });

  it("stays silent when nothing is owed, because it fires on every stop", async () => {
    const { sessionsDir } = makeAnsweredSandbox();
    const result = await run(() => sessionVerb(["hook-stop", "--sessions-dir", sessionsDir]));
    assert.equal(result.code, 0);
    assert.equal(result.out, "");
  });

  it("holds the turn once a wait is past due, in the same RUN sentence", async () => {
    // The one instruction that asks the engine to carry an obligation across
    // the end of its turn was the one with no enforcement: session 91's job
    // finished with its exit code on disk and the session sat idle for three
    // hours because nothing made the next call.
    const { repo, sessionsDir } = makeAnsweredSandbox();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    writeInstruction(repo, 1, {
      schema_version: 1,
      seq: 4,
      session_number: 1,
      issued_at: new Date(Date.now() - 120_000).toISOString(),
      kind: "wait",
      retry_after_seconds: 60,
      log: ".dabbler/runs/s1/driver/jobs/verification.log",
      answer_command: "dabbler session next",
    });
    const result = await run(() => sessionVerb(["hook-stop", "--sessions-dir", sessionsDir]));
    assert.equal(result.code, 0);
    const decision = JSON.parse(result.out) as Record<string, string>;
    assert.equal(decision["decision"], "block");
    assert.match(String(decision["reason"]), /wait \(seq 4\) was due \d+s ago/);
    assert.match(String(decision["reason"]), /RUN the shell command/);
  });

  it("lets the turn end while a wait is not yet due, and says when it is", async () => {
    const { repo, sessionsDir } = makeAnsweredSandbox();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    writeInstruction(repo, 1, {
      schema_version: 1,
      seq: 4,
      session_number: 1,
      issued_at: new Date().toISOString(),
      kind: "wait",
      retry_after_seconds: 600,
      log: ".dabbler/runs/s1/driver/jobs/verification.log",
      answer_command: "dabbler session next",
    });
    const result = await run(() => sessionVerb(["hook-stop", "--sessions-dir", sessionsDir]));
    assert.equal(result.code, 0);
    const note = JSON.parse(result.out) as Record<string, string>;
    assert.equal(note["decision"], undefined);
    assert.match(String(note["systemMessage"]), /due in \d+s/);
    assert.match(String(note["systemMessage"]), /dabbler session next/);
  });
});
