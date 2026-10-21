// The command lines the lifecycle documents: `dabbler session`'s
// subcommands and `dabbler status`.
//
// The parser's whole grammar is not the contract, the flags the lifecycle
// documents are -- so what is asserted here is that every documented flag
// reaches the function it names, and that a flag nobody documented is a
// usage error rather than a silent no-op. A misspelled `--not-releasable`
// that parsed as nothing would publish.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { depsVerb } from "../src/cli/deps.ts";
import { packagingVerb } from "../src/cli/packaging.ts";
import { HANDLERS } from "../src/cli/registry.ts";
import { authVerb } from "../src/cli/auth.ts";
import { sessionVerb } from "../src/cli/session.ts";
import { ENGINE_MARKERS, asAPersonsClick } from "../src/session.ts";
import { statusVerb } from "../src/cli/status.ts";
import { extensionAbove, versionVerb } from "../src/cli/version.ts";
import { VERBS } from "../src/contracts/verbs.ts";
import { GATE_FAIL_MARK, GATE_PASS_MARK } from "../src/gates.ts";
import { VERSION } from "../src/version.ts";
import { capture } from "../src/output.ts";
import { CREDENTIALS_FILENAME, setCredentialsPath, storeKind } from "../src/credentials.ts";
import { writePreferences } from "../src/preferences.ts";
import { readRawSessionState } from "../src/progress.ts";
import { declareSessionTask, registerSessionStart } from "../src/writers.ts";
import { makeAnsweredSandbox, tempDir } from "./support/answers.ts";

async function run(
  verb: () => Promise<number> | number,
): Promise<{ code: number; out: string; err: string }> {
  const collected = await capture(() => Promise.resolve(verb()));
  return { code: collected.value, out: collected.stdout, err: collected.stderr };
}

describe("dabbler packaging --dry-run", () => {
  it("exits 0 in a session that may not publish when the declaration loads, and says no gate was asked", async () => {
    // A rehearsal that exited 1 on releasability alone, one line under a
    // sentence saying every gate passed, could not be named by a plan check
    // in the sessions before the one that publishes -- which is every
    // session in which the declaration is written.
    const { repo, sessionsDir } = makeAnsweredSandbox();
    writeFileSync(
      join(repo, "dabbler.yaml"),
      [
        "schema_version: 1",
        "packaging:",
        "  pack:",
        '    argv: ["dotnet", "pack", "-c", "Release", "-o", "{output}"]',
        "  push:",
        '    argv: ["dotnet", "nuget", "push", "{artifact}", "--source", "{feed}"]',
        "    feed: /feeds/local",
        "",
      ].join("\n"),
      "utf8",
    );
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    declareSessionTask(sessionsDir, { sessionNumber: 1, task: "refactor only", releasable: false });
    const result = await run(() => packagingVerb(["--dry-run", "--sessions-dir", sessionsDir]));
    assert.equal(result.code, 0, result.err);
    assert.match(result.out, /No gate was asked/);
    assert.doesNotMatch(result.out, /Every gate the close reads passes/);
  });

  it("says what a rehearsal proved and what a real publish would meet, never `refused`, and no empty credential for a folder feed", async () => {
    // The sample's releasable session read `packaging: refused` under a
    // gate table and exit 0, and `Using the credential named ,` for a folder
    // feed that takes none. A rehearsal is not an attempt, so it does not
    // report an attempt's outcome.
    const { repo, sessionsDir } = makeAnsweredSandbox();
    writeFileSync(
      join(repo, "dabbler.yaml"),
      [
        "schema_version: 1",
        "packaging:",
        "  pack:",
        '    argv: ["dotnet", "pack", "-c", "Release", "-o", "{output}"]',
        "  push:",
        '    argv: ["dotnet", "nuget", "push", "{artifact}", "--source", "{feed}"]',
        "    feed: ../csv-parser-feed",
        "",
      ].join("\n"),
      "utf8",
    );
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    declareSessionTask(sessionsDir, { sessionNumber: 1, task: "ship it", releasable: true });
    const result = await run(() => packagingVerb(["--dry-run", "--sessions-dir", sessionsDir]));
    assert.equal(result.code, 0, result.err);
    assert.match(result.out, /No credential: the feed is a folder/);
    assert.match(result.out, /packaging: dry run: the declaration loads; \d+ gate\(s\) would refuse a real publish now/);
    assert.doesNotMatch(result.out, /packaging: refused/);
    assert.doesNotMatch(result.out, /credential named ,/);
  });
});

describe("dabbler version", () => {
  it("prints the manifest's version, and the extension's only when one is above the package", async () => {
    const result = await run(() => versionVerb([]));
    assert.equal(result.code, 0);
    assert.equal(result.out.trim().split("\n")[0], `dabbler-ai-router ${VERSION}`);
    // A development checkout sits under no extension; the VSIX puts the
    // bundle under a manifest that declares `engines.vscode`.
    const extension = tempDir("ext-");
    writeFileSync(
      join(extension, "package.json"),
      JSON.stringify({ name: "some-extension", version: "9.9.9", engines: { vscode: "^1.90.0" } }),
      "utf8",
    );
    mkdirSync(join(extension, "dist"), { recursive: true });
    assert.deepEqual(extensionAbove(join(extension, "dist")), ["some-extension", "9.9.9"]);
    assert.equal(extensionAbove(tempDir("no-ext-")), null);
  });
});

describe("dabbler deps", () => {
  it("reads a package no repository of the solution declares as external, and says so", async () => {
    // What used to be a question per package is a fact the output states.
    const { sessionsDir } = makeAnsweredSandbox({
      "App.csproj":
        '<Project Sdk="Microsoft.NET.Sdk"><ItemGroup><PackageReference Include="Newtonsoft.Json" Version="13.0.1" /></ItemGroup></Project>\n',
    });
    const result = await run(() => depsVerb(["check", "--sessions-dir", sessionsDir]));
    assert.equal(result.code, 0, result.err);
    assert.match(result.out, /Newtonsoft\.Json.*read as external/);
  });

  it("says what the declaration is for, and that one repository needs none, where `show` finds none", async () => {
    // "declares no solution-dependencies.json" reads as a missing file to
    // someone who has never declared one, and the reply to a missing file is
    // to write it -- which is how a hand-authored declaration gets invented.
    const { sessionsDir } = makeAnsweredSandbox({
      "App.csproj": '<Project Sdk="Microsoft.NET.Sdk"></Project>\n',
    });
    const result = await run(() => depsVerb(["show", "--sessions-dir", sessionsDir]));
    assert.equal(result.code, 0, result.err);
    // The parser's side of it is unchanged: no declaration is still `null`.
    assert.equal(result.out.trim(), "null");
    assert.match(result.err, /PRODUCES a package/);
    assert.match(result.err, /entirely in this repository needs none/);
  });
});

describe("dabbler session, the whole surface", () => {
  it("registers every subcommand the lifecycle documents", async () => {
    const result = await run(() => sessionVerb(["--help"]));
    for (const name of [
      "start",
      "decision",
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

  it("takes the engine this machine chose when the flag names none, and says how to choose one", async () => {
    // The whole reason the choice is a file beside the catalog rather than
    // an editor setting: `session start` typed at a terminal could not read
    // a setting, so half a machine's configuration was invisible to the one
    // command that needs it. The flag still wins, because a person who typed
    // one meant it.
    writePreferences({ engine: "" });
    const unchosen = await run(() => sessionVerb(["start"]));
    assert.equal(unchosen.code, 2);
    assert.match(unchosen.err, /dabbler configure --engine/);

    // With a choice on the record the start gets past the engine argument
    // and refuses for the NEXT reason instead, which is what proves it read
    // the file rather than the flag.
    writePreferences({ engine: "claude-code" });
    const chosen = await run(() => sessionVerb(["start"]));
    assert.ok(!chosen.err.includes("required: --engine"), chosen.err);
    writePreferences({ engine: "" });
  });

  it("refuses a typed --approver and says the record already knows who is working", async () => {
    // The flag recorded a claim no gate read, and an engine typed its own
    // name into it. Refused rather than ignored: the parser takes any
    // `--flag value` pair, so a dropped flag would vanish in silence.
    const { sessionsDir } = makeAnsweredSandbox();
    const amend = await run(() =>
      sessionVerb([
        "plan", "amend", "--sessions-dir", sessionsDir,
        "--step", "x", "--reason", "r", "--approver", "me",
      ]),
    );
    assert.equal(amend.code, 2);
    assert.match(amend.err, /--approver is gone/);
    assert.match(amend.err, /session start/);
  });

  it("refuses --drop-non-goal beside a step or a round cap: one amendment per call", async () => {
    // Three amendments, and each carries its own reason: what a step is
    // measured against, how many reviews the tree may have, and what the
    // work is held to. Two in one call is a reason that covers neither.
    const { sessionsDir } = makeAnsweredSandbox();
    for (const other of [["--step", "x"], ["--max-rounds", "4"]]) {
      const amend = await run(() =>
        sessionVerb([
          "plan", "amend", "--sessions-dir", sessionsDir,
          "--drop-non-goal", "A second widget.", "--reason", "r", ...other,
        ]),
      );
      assert.equal(amend.code, 2, amend.err);
      assert.match(amend.err, /--drop-non-goal: not allowed with argument/);
      assert.match(amend.err, new RegExp(other[0]!));
    }
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
      ["plan", "--help", "--max-rounds"],
    ] as const) {
      const result = await run(() => sessionVerb([subcommand, flag]));
      assert.equal(result.code, 0, subcommand);
      assert.ok(result.out.includes(expected), `${subcommand} ${expected}`);
      assert.ok(!result.err.includes("expected one argument"));
    }
  });

  it("has no typed declare, and refuses the flags that are gone with the rule that replaced them", async () => {
    // A second door decided releasability by a rule of its own: the typed
    // verb shipped unless held, and a declaration made first beat the plan.
    // The accepted plan declares.
    const { sessionsDir } = makeAnsweredSandbox();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    const typed = await run(() => sessionVerb(["declare", "--sessions-dir", sessionsDir, "--task", "Do it."]));
    assert.equal(typed.code, 2);
    assert.match(typed.err, /'declare' is not a subcommand/);
    const gone = await run(() => sessionVerb(["close", "--dry-run", "--sessions-dir", sessionsDir, "--not-releasable"]));
    assert.equal(gone.code, 2);
    assert.match(gone.err, /--not-releasable: gone/);
    assert.match(gone.err, /hold-release/);
  });

  it("runs the close read-only under --dry-run", async () => {
    const { sessionsDir } = makeAnsweredSandbox();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    const result = await run(() => sessionVerb(["close", "--dry-run", "--sessions-dir", sessionsDir]));
    assert.equal(result.code, 1);
    assert.match(result.out, /gates pass; nothing written\./);
    // One bullet per gate, indented under the close's own sentences, in the
    // row `renderGateRow` gives every screen: the mark first, then the name.
    assert.match(result.out, new RegExp(`^ {4}[${GATE_PASS_MARK}${GATE_FAIL_MARK}] verification_clean`, "m"));
    const record = (readRawSessionState(sessionsDir)?.["sessions"] as Record<string, unknown>[])[0];
    assert.equal(record?.["status"], "in-progress");
  });

  it("takes the session number for cancel as a positional, and refuses a forced cancel from an engine", async () => {
    const { sessionsDir } = makeAnsweredSandbox();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    // Who is asking is read from the environment: a person's shell has
    // no marker, and the suite may itself be running under any of them.
    const saved = ENGINE_MARKERS.map((name) => [name, process.env[name]] as const);
    const restoreEnv = () => {
      for (const [key, value] of saved) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    };
    try {
      for (const name of ENGINE_MARKERS) delete process.env[name];
      process.env["DABBLER_DRIVEN"] = "1";
      const engine = await run(() =>
        sessionVerb(["cancel", "1", "--reason", "stop", "--force", "--sessions-dir", sessionsDir]),
      );
      assert.equal(engine.code, 3);
      assert.match(engine.err, /a person's verb, never the engine's/);
      delete process.env["DABBLER_DRIVEN"];
      // A person: the extension's click.
      const person = await run(() =>
        asAPersonsClick(() => sessionVerb(["cancel", "1", "--reason", "stop", "--force", "--sessions-dir", sessionsDir])),
      );
      assert.equal(person.code, 0);
      assert.match(person.out, /"status": "cancelled"/);
    } finally {
      restoreEnv();
    }
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

describe("dabbler auth", () => {
  it("names what it holds and never a value, and refuses a provider it cannot reach", async () => {
    setCredentialsPath(join(tempDir("auth-"), CREDENTIALS_FILENAME));
    const empty = await run(() => authVerb(["list"]));
    assert.equal(empty.code, 0, empty.err);
    assert.match(empty.out, /holds no credentials/);

    // A provider the distribution does not reach is a refusal before a
    // prompt, because asking someone for a key and then discarding it is
    // worse than not asking.
    const unknown = await run(() => authVerb(["set", "acme"]));
    assert.equal(unknown.code, 1);
    assert.match(unknown.err, /not a provider this distribution reaches/);

    const absent = await run(() => authVerb(["remove", "nothing-of-that-name"]));
    assert.equal(absent.code, 1);
    assert.match(absent.err, /holds no credential called/);
  });

  it("refuses a key typed as a name, and --from-env with nothing in the environment", async () => {
    setCredentialsPath(join(tempDir("auth-"), CREDENTIALS_FILENAME));
    // A key given as the NAME would be a key in the shell's history, which
    // is the one place this verb exists to keep it out of. It is refused
    // and it is not printed back.
    const key = "sk-ant-api03-159-DoNotEcho-7f3a9c2e";
    const pasted = await run(() => authVerb(["set", "anthropic", "--name", key]));
    assert.equal(pasted.code, 1);
    assert.match(pasted.err, /takes a NAME for the credential/);
    assert.ok(!pasted.err.includes(key), pasted.err);

    // And the convenience for a machine that has been working: take what is
    // already in the variable. With nothing there, it says which one.
    const held = process.env["DABBLER_ANTHROPIC_API_KEY"];
    delete process.env["DABBLER_ANTHROPIC_API_KEY"];
    try {
      const empty = await run(() => authVerb(["set", "anthropic", "--from-env"]));
      assert.equal(empty.code, 1);
      assert.match(empty.err, /DABBLER_ANTHROPIC_API_KEY is not set/);

      // And where there is no store at all, the refusal names the variable
      // BY NAME. "the provider's environment variable" makes somebody run a
      // second command to find out what to set, which is a refusal that has
      // not finished.
      const held = storeKind();
      if (held === null) {
        const refused = await run(() => authVerb(["set", "anthropic"]));
        assert.equal(refused.code, 1);
        assert.match(refused.err, /DABBLER_ANTHROPIC_API_KEY/);
      }
    } finally {
      if (held !== undefined) process.env["DABBLER_ANTHROPIC_API_KEY"] = held;
    }
  });
});

describe("the verb registry", () => {
  it("has a handler for every verb the table offers", () => {
    for (const spec of VERBS) {
      assert.equal(typeof HANDLERS[spec.verb], "function", spec.verb);
    }
  });
});

describe("dabbler session report --next", () => {
  it("prints one parseable instruction on stdout where the plain report prints its own confirmation", async () => {
    // The engine reads a chained answer's stdout as its next instruction, so
    // the report's human sentence cannot be on it; without --next it is where
    // it always was, for the loop and the people who read it.
    const plan = join(tempDir("plan-"), "plan.json");
    writeFileSync(
      plan,
      JSON.stringify({
        task: "Make the widget real.",
        non_goals: ["Anything the step does not name."],
        steps: [{ id: "widget", ask: "Make the widget real.", files: ["src/widget.py"], checks: [{ argv: [process.execPath, "-e", "0"] }] }],
      }),
      "utf8",
    );
    // One sandbox at a time: each answers for git while it is the newest.
    const begin = async (): Promise<{ sessionsDir: string; seq: number; answer_command: string }> => {
      const { sessionsDir } = makeAnsweredSandbox();
      const started = await run(() =>
        sessionVerb(["start", "--sessions-dir", sessionsDir, "--engine", "claude-code", "--provider", "anthropic"]),
      );
      assert.equal(started.code, 0, started.err);
      const asked = await run(() => sessionVerb(["next", "--sessions-dir", sessionsDir]));
      return { sessionsDir, ...(JSON.parse(asked.out) as { seq: number; answer_command: string }) };
    };

    const chained = await begin();
    assert.match(chained.answer_command, / --next /);
    const answered = await run(() =>
      sessionVerb(["report", "--sessions-dir", chained.sessionsDir, "--seq", String(chained.seq), "--next", "--answer-file", plan]),
    );
    assert.equal(answered.code, 0, answered.err);
    const following = JSON.parse(answered.out) as { kind: string; step_id: string; seq: number };
    assert.deepEqual([following.kind, following.step_id], ["step", "widget"]);
    assert.match(answered.err, /work plan/);

    const plain = await begin();
    const ordinary = await run(() =>
      sessionVerb(["report", "--sessions-dir", plain.sessionsDir, "--seq", String(plain.seq), "--answer-file", plan]),
    );
    assert.equal(ordinary.code, 0, ordinary.err);
    assert.match(ordinary.out, /^report: session 001 seq \d+ answered; work plan/);
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

