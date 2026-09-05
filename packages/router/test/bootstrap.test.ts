// Setting a consumer project up: the instruction fence, the ignore rule, the
// commit guard, the scaffolded declaration, and the transport preference.
//
// Which branch runs, what is left alone, and what a second run does. The
// scope decision takes its writer as a parameter, so it is asserted from
// literals; the rest reads and writes files in a directory, and the two that
// commit need a repository.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import { bootstrapVerb } from "../src/cli/bootstrap.ts";
import {
  MANAGED_END,
  MANAGED_START,
  SCOPE_MACHINE,
  SCOPE_USER,
  detectEcosystems,
  ensureCommitGuard,
  ensureGitignore,
  manualPersistHint,
  persistedScope,
  renderProjectConfig,
  resolveBootstrapTransport,
  scaffoldBootstrapSessions,
  scaffoldProjectConfig,
  scaffoldSolutionManifest,
  writeInstructionFiles,
} from "../src/bootstrap/index.ts";
import { TRANSPORT_COPILOT_CLI, TRANSPORT_ENV_VAR } from "../src/config.ts";
import {
  ID_GIT_REMOTE,
  blockingDecisions,
  openDecisions,
  raiseRemoteDecision,
} from "../src/owedDecisions.ts";
import { load } from "../src/solution.ts";
import { seed, tempDir } from "./support/answers.ts";
import { gitOut, makeRepo, makeSandbox } from "./support/repo.ts";

const savedTransport = process.env[TRANSPORT_ENV_VAR];
afterEach(() => {
  if (savedTransport === undefined) delete process.env[TRANSPORT_ENV_VAR];
  else process.env[TRANSPORT_ENV_VAR] = savedTransport;
});

/** A bare git repository with nothing in it: a project the moment before setup. */
function emptyRepo(): string {
  return makeRepo({});
}

/** A writer that records what it was asked for and answers as told. */
function writerThat(...answers: boolean[]): {
  write: (machine: boolean) => boolean;
  asked: boolean[];
} {
  const asked: boolean[] = [];
  let index = 0;
  return {
    asked,
    write: (machine: boolean): boolean => {
      asked.push(machine);
      return answers[index++] ?? false;
    },
  };
}

describe("which scope the preference lands at", () => {
  it("writes user scope by default, without asking for elevation", () => {
    const writer = writerThat(true);
    assert.equal(persistedScope(false, true, writer.write), SCOPE_USER);
    assert.deepEqual(writer.asked, [false]);
  });

  it("writes machine scope when it was asked for and permitted", () => {
    const writer = writerThat(true);
    assert.equal(persistedScope(true, true, writer.write), SCOPE_MACHINE);
    assert.deepEqual(writer.asked, [true]);
  });

  it("falls back to user scope when machine scope was not permitted", () => {
    // The admin account is often a different user, and a preference that
    // landed for the operator beats one that landed nowhere.
    const writer = writerThat(true);
    assert.equal(persistedScope(true, false, writer.write), SCOPE_USER);
    assert.deepEqual(writer.asked, [false]);
  });

  it("falls back to user scope when the machine write itself fails", () => {
    const writer = writerThat(false, true);
    assert.equal(persistedScope(true, true, writer.write), SCOPE_USER);
    assert.deepEqual(writer.asked, [true, false]);
  });

  it("reports that nothing landed when every scope fails", () => {
    assert.equal(persistedScope(true, true, writerThat(false, false).write), null);
  });

  it("names a command the operator can run without another account", () => {
    // A hint that says "re-run elevated" is useless when the admin account
    // is a different user, so the hint is always the user-scope one.
    const hint = manualPersistHint("copilot-cli");
    assert.match(hint, new RegExp(TRANSPORT_ENV_VAR));
    assert.match(hint, /copilot-cli/);
    assert.ok(!hint.toLowerCase().includes("admin"));
  });
});

describe("what the transport preference resolves to", () => {
  it("takes an explicit choice over everything else", () => {
    process.env[TRANSPORT_ENV_VAR] = "api";
    const [value, reason] = resolveBootstrapTransport(TRANSPORT_COPILOT_CLI);
    assert.equal(value, TRANSPORT_COPILOT_CLI);
    assert.match(reason, /--transport/);
  });

  it("never overrides a preference already set", () => {
    // Detection is a fact about the machine; a choice already made is a fact
    // about the operator, and the second outranks the first.
    process.env[TRANSPORT_ENV_VAR] = "api";
    const [value, reason] = resolveBootstrapTransport(null);
    assert.equal(value, null);
    assert.match(reason, /already set to 'api'/);
  });

  it("leaves the default alone when nothing is set and no seat answers", () => {
    // The seat probe shells out to a binary this machine may or may not
    // have. Either answer is legitimate: what is asserted is that an unset
    // preference never comes back as anything but a seat or the default.
    delete process.env[TRANSPORT_ENV_VAR];
    const [value, reason] = resolveBootstrapTransport(null);
    if (value === null) assert.match(reason, /no Copilot seat detected/);
    else {
      assert.equal(value, TRANSPORT_COPILOT_CLI);
      assert.match(reason, /detected a Copilot seat/);
    }
  });
});

describe("the ignore rule", () => {
  it("creates the file with the rule when there is none", () => {
    const project = tempDir("bootstrap-");
    assert.equal(ensureGitignore(project), true);
    assert.match(readFileSync(join(project, ".gitignore"), "utf8"), /\.dabbler\//);
  });

  it("appends without disturbing what is already there", () => {
    const project = tempDir("bootstrap-");
    seed(project, { ".gitignore": "node_modules/\n" });
    assert.equal(ensureGitignore(project), true);
    const text = readFileSync(join(project, ".gitignore"), "utf8");
    assert.match(text, /node_modules\//);
    assert.match(text, /\.dabbler\//);
  });

  it("adds the rule once however many times it runs", () => {
    const project = tempDir("bootstrap-");
    ensureGitignore(project);
    assert.equal(ensureGitignore(project), false);
    const text = readFileSync(join(project, ".gitignore"), "utf8");
    assert.equal(text.split(".dabbler/").length - 1, 1);
  });

  it("leaves an equivalent rule someone already wrote alone", () => {
    const project = tempDir("bootstrap-");
    seed(project, { ".gitignore": ".dabbler\n" });
    assert.equal(ensureGitignore(project), false);
  });

  it("does not blunt a rule written to re-include something underneath", () => {
    // `.dabbler/*` governs the same directory but leaves the parent
    // traversable. Adding `.dabbler/` after it would exclude the parent
    // outright, and git cannot re-include through an excluded parent -- so a
    // ledger the project deliberately tracks would silently stop being added.
    const project = tempDir("bootstrap-");
    seed(project, { ".gitignore": ".dabbler/*\n!.dabbler/runs/\n" });
    assert.equal(ensureGitignore(project), false);
    assert.ok(!readFileSync(join(project, ".gitignore"), "utf8").includes("\n.dabbler/\n"));
  });
});

describe("the instruction files", () => {
  it("writes three files, each with a managed section inside its budget", () => {
    const project = tempDir("bootstrap-");
    const written = writeInstructionFiles(project, "acme-app");
    assert.deepEqual(
      written.map((path) => path.split(/[\\/]/).pop()),
      ["AGENTS.md", "CLAUDE.md", "GEMINI.md"],
    );
    for (const path of written) {
      const text = readFileSync(path, "utf8");
      assert.match(text, new RegExp(MANAGED_START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(text, new RegExp(MANAGED_END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      // A fence an orchestrator loads every session is a budget, not just a
      // document.
      assert.ok(text.replace(/\n$/, "").split("\n").length <= 150, path);
    }
  });

  it("puts the body in AGENTS.md alone and imports it from the others", () => {
    // Copilot loads all three at once and de-duplicates nothing, so exactly
    // one file may hold the body.
    const project = tempDir("bootstrap-");
    writeInstructionFiles(project, "acme-app");
    const agents = readFileSync(join(project, "AGENTS.md"), "utf8");
    assert.match(agents, /`acme-app`/);
    assert.match(agents, /dabbler session next/);
    for (const name of ["CLAUDE.md", "GEMINI.md"]) {
      const text = readFileSync(join(project, name), "utf8");
      assert.match(text, /@AGENTS\.md/);
      assert.ok(!text.includes("dabbler session next"));
    }
  });

  it("tells the engine to call the framework rather than typing the lifecycle out", () => {
    // The engine used to read nine numbered steps and execute them. It now
    // reads one verb, because a list an engine can follow is a list it will
    // follow whether or not the framework is already doing the work.
    const project = tempDir("bootstrap-");
    writeInstructionFiles(project, "acme-app");
    const agents = readFileSync(join(project, "AGENTS.md"), "utf8");
    assert.match(agents, /dabbler session next/);
    for (const verb of [
      "session declare",
      "dabbler affected",
      "test-evidence record",
      "dabbler verify",
      "dabbler packaging",
      "session close",
    ]) {
      assert.ok(!agents.includes(verb), verb);
    }
    // What stays is what is still the engine's to honour.
    assert.match(agents, /DABBLER_ANTHROPIC_API_KEY/);
    assert.match(agents, /never by hand/);
  });

  it("says publishing is the framework's, and says which sessions it is true of", () => {
    // The sentence claimed publishing happened inside the framework's own
    // calls while nothing in the driven lifecycle called packaging, so a
    // csv-model orchestrator following it exactly waited for a step that
    // never came and the session shipped nothing.
    const project = tempDir("bootstrap-");
    writeInstructionFiles(project, "acme-app");
    const agents = readFileSync(join(project, "AGENTS.md"), "utf8");
    assert.match(agents, /releasable/);
    assert.match(agents, /not-releasable/);
    assert.match(agents.toLowerCase(), /the close refuses/);
  });

  it("tells every project the two things that corrupt work silently", () => {
    // Both were learned here and neither reached the body a project gets: a
    // csv-model session lost JSON backslash escapes to a Git Bash heredoc,
    // and a report was refused for a tree that moved under its own check.
    // Asserted by meaning rather than by wording.
    const project = tempDir("bootstrap-");
    writeInstructionFiles(project, "acme-app");
    const agents = readFileSync(join(project, "AGENTS.md"), "utf8");
    assert.match(agents, /heredoc/);
    assert.match(agents.toLowerCase(), /backslash/);
    assert.match(agents, /editing tools/);
    assert.match(agents.toLowerCase(), /working tree/);
  });

  it("gives each engine its own tail", () => {
    const project = tempDir("bootstrap-");
    writeInstructionFiles(project, "x");
    assert.match(readFileSync(join(project, "CLAUDE.md"), "utf8"), /Claude Code/);
    assert.match(readFileSync(join(project, "AGENTS.md"), "utf8"), /Copilot/);
    assert.match(readFileSync(join(project, "GEMINI.md"), "utf8"), /Gemini CLI/);
  });

  it("never touches user content outside the fence, and replaces only the fence", () => {
    const project = tempDir("bootstrap-");
    const mine = join(project, "CLAUDE.md");
    seed(project, { "CLAUDE.md": "# My own rules\nNever delete this line.\n" });
    writeInstructionFiles(project, "x");
    assert.match(readFileSync(mine, "utf8"), /Never delete this line\./);

    const target = join(project, "AGENTS.md");
    const first = readFileSync(target, "utf8");
    writeFileSync(target, `above\n\n${first}\nbelow\n`, "utf8");
    writeInstructionFiles(project, "x");
    const text = readFileSync(target, "utf8");
    assert.ok(text.startsWith("above\n"));
    assert.ok(text.trimEnd().endsWith("below"));
    assert.equal(text.split(MANAGED_START).length - 1, 1);
  });

  it("names the project after its directory when nothing else does", () => {
    const project = tempDir("bootstrap-");
    writeInstructionFiles(project);
    assert.match(
      readFileSync(join(project, "AGENTS.md"), "utf8"),
      new RegExp(project.split(/[\\/]/).pop() as string),
    );
  });
});

describe("the commit guard", () => {
  it("installs a hook that invokes the router by name, once", () => {
    // There is no interpreter to bake in: a consumer repository is not
    // required to contain the thing that guards it.
    const project = emptyRepo();
    const hook = ensureCommitGuard(project);
    assert.notEqual(hook, null);
    const text = readFileSync(hook as string, "utf8");
    assert.match(text, /dabbler verify step guard-commit/);
    assert.ok(!text.includes("python"));
    assert.equal(ensureCommitGuard(project), null);
  });

  it("never clobbers a hook it did not write", () => {
    // A project's own pre-commit checks are not ours to delete, and a guard
    // that silently ate them would be worse than no guard.
    const project = emptyRepo();
    const path = join(project, ".git", "hooks", "pre-commit");
    mkdirSync(join(project, ".git", "hooks"), { recursive: true });
    writeFileSync(path, "#!/bin/sh\nmake lint\n", "utf8");
    assert.equal(ensureCommitGuard(project), null);
    assert.match(readFileSync(path, "utf8"), /make lint/);
  });

  it("declines a directory that is not a repository", () => {
    assert.equal(ensureCommitGuard(tempDir("bootstrap-")), null);
  });
});

describe("the scaffolded setup sessions", () => {
  it("writes two numbered sessions into a project with no plan", () => {
    const project = tempDir("bootstrap-");
    const written = scaffoldBootstrapSessions(project);
    assert.equal(written.length, 1);
    const text = readFileSync(written[0] as string, "utf8");
    assert.match(text, /### Session 1:/);
    assert.match(text, /### Session 2:/);
    assert.match(text, /Do NOT hand-author `sessions\.json`/);
  });

  it("never overwrites a plan the repository already has", () => {
    // A repository that already has a plan has its own numbering and its own
    // history.
    const project = tempDir("bootstrap-");
    seed(project, { "docs/sessions/session-plan.md": "# Ours\n" });
    assert.deepEqual(scaffoldBootstrapSessions(project), []);
    assert.equal(
      readFileSync(join(project, "docs", "sessions", "session-plan.md"), "utf8"),
      "# Ours\n",
    );
  });
});

describe("what a repository declares about its tests", () => {
  it("gives each detected ecosystem its own suite", () => {
    const project = tempDir("bootstrap-");
    seed(project, { "pytest.ini": "[pytest]\n", "pom.xml": "<project/>\n" });
    const config = renderProjectConfig(detectEcosystems(project));
    assert.match(config, /name: python/);
    assert.match(config, /name: maven/);
    assert.match(config, /runs_whole: true/);
  });

  it("declares nothing from a build file that declares no test command", () => {
    // `pyproject.toml` says this is a Python project; it says nothing about
    // how the tests run, and plenty of them use unittest or nox.
    const project = tempDir("bootstrap-");
    seed(project, { "pyproject.toml": "[project]\nname='x'\n" });
    assert.deepEqual(detectEcosystems(project), []);
  });

  it("declares nothing from a script that exists in order to fail", () => {
    // `npm init` writes the placeholder, and a repository that has not
    // replaced it has said the opposite of "my tests run this way".
    const project = tempDir("bootstrap-");
    seed(project, {
      "package.json": JSON.stringify({
        scripts: { test: 'echo "Error: no test specified" && exit 1' },
      }),
    });
    assert.deepEqual(detectEcosystems(project), []);
  });

  it("survives a manifest that parses but does not conform", () => {
    // A shape error must leave node undetected rather than end the whole
    // bootstrap.
    const project = tempDir("bootstrap-");
    seed(project, { "package.json": '{"scripts": "not a map"}' });
    assert.deepEqual(detectEcosystems(project), []);
  });

  it("declares nothing for a build file below the root", () => {
    // A suite declares a command and no working directory, so
    // `service/pom.xml` has no runnable line to become.
    const project = tempDir("bootstrap-");
    seed(project, { "service/pom.xml": "<project/>\n" });
    assert.deepEqual(detectEcosystems(project), []);
  });

  it("uses the committed wrapper as the entry point it was committed to be", () => {
    // `gradle test` on a machine that has only `gradlew` fails for a reason
    // the repository already solved.
    const project = tempDir("bootstrap-");
    seed(project, { "build.gradle": "" });
    assert.equal(detectEcosystems(project)[0]?.command, "gradle test");
    seed(project, { gradlew: "#!/bin/sh\n" });
    assert.equal(detectEcosystems(project)[0]?.command, "./gradlew test");
  });

  it("maps every path rather than none", () => {
    // A path no rule covers is `selection_unknown`, and pre-verification
    // fails closed. The only honest starting mapping is repository-wide.
    const project = tempDir("bootstrap-");
    seed(project, { "pytest.ini": "[pytest]\n" });
    assert.match(renderProjectConfig(detectEcosystems(project)), /repo_wide/);
  });

  it("declares no suite for a repository that says nothing", () => {
    // That is a declaration, not an omission. The block it shows is an
    // example, and every line of it is commented: a scaffold that emitted a
    // live `testing:` key would hand the repository a suite it never
    // declared.
    const config = renderProjectConfig([]);
    assert.match(config, /No suite is declared/);
    assert.deepEqual(
      config.split("\n").filter((line) => line.startsWith("testing:")),
      [],
    );
  });

  it("never overwrites a declaration the repository already made", () => {
    const project = tempDir("bootstrap-");
    seed(project, { "dabbler.yaml": "schema_version: 1\n" });
    assert.equal(scaffoldProjectConfig(project), null);
    assert.equal(readFileSync(join(project, "dabbler.yaml"), "utf8"), "schema_version: 1\n");
  });

  it("declares .NET from a solution or project file at the root", () => {
    const project = tempDir("bootstrap-");
    seed(project, { "Acme.csproj": "<Project/>\n" });
    assert.equal(detectEcosystems(project)[0]?.key, "dotnet");
  });
});

describe("what setup does about the operator's typing", () => {
  it("commits the files it wrote, and only those", async () => {
    // It used to print "commit what this just wrote" -- the framework asking
    // the operator to run a command it could run, about files it had just
    // written, knowing session 1 would be refused while they sat there.
    const { repo } = makeSandbox();
    writeFileSync(join(repo, "mine.txt"), "the operator's own work\n", "utf8");
    await bootstrapVerb(["--project-dir", repo, "--no-transport-detect"]);
    const status = gitOut(repo, "status", "--porcelain", "-uall");
    // The operator's file is untouched; setup's own are committed.
    assert.match(status, /mine\.txt/);
    assert.ok(!status.includes("AGENTS.md"));
    assert.equal(gitOut(repo, "log", "-1", "--format=%s").trim(), "Set up Dabbler");
  });

  it("asks where the repository pushes rather than printing a push command", async () => {
    // The close used to print `git push --set-upstream <remote> main` for a
    // remote nobody had created.
    const repo = emptyRepo();
    await bootstrapVerb(["--project-dir", repo, "--no-transport-detect"]);
    assert.ok(openDecisions(repo).map((row) => String(row["id"])).includes(ID_GIT_REMOTE));
  });

  it("does not ask a repository that already has a remote, and never holds the close", () => {
    // Staying local is a real answer, so the question is advisory.
    const { repo } = makeSandbox();
    assert.equal(raiseRemoteDecision(repo, { hasRemote: true }), null);
    const local = emptyRepo();
    assert.equal(raiseRemoteDecision(local, { hasRemote: false })?.["severity"], "advisory");
    assert.equal(blockingDecisions(local).length, 0);
  });
});

describe("what the Solution Explorer has to render", () => {
  it("scaffolds a one-component manifest, which is what a fresh repo IS", () => {
    // The view was empty in every new project and explained nothing. Three
    // things caused that and none was a missing writer; this is the manifest
    // half.
    const repo = emptyRepo();
    assert.equal(scaffoldSolutionManifest(repo), join(repo, "solution.yaml"));
    const solution = load(repo);
    assert.equal(solution.components.length, 1);
    assert.equal(solution.components[0]?.kind, "integration");
  });

  it("leaves a manifest the project already wrote alone", () => {
    const repo = emptyRepo();
    writeFileSync(join(repo, "solution.yaml"), "# mine\n", "utf8");
    assert.equal(scaffoldSolutionManifest(repo), null);
    assert.equal(readFileSync(join(repo, "solution.yaml"), "utf8"), "# mine\n");
  });

  it("writes the first projection, so the tree has content before any verb", async () => {
    const repo = emptyRepo();
    await bootstrapVerb(["--project-dir", repo, "--no-transport-detect"]);
    assert.ok(existsSync(join(repo, ".dabbler", "solution", "projection.json")));
  });
});

describe("the round-ref migration", () => {
  it("teaches an existing clone to fetch and push round baselines", async () => {
    // A clone made before round refs existed carries neither refspec, and the
    // fix only reaches the machine a session moves to once its clone fetches
    // them -- so re-running bootstrap is the migration.
    const { repo } = makeSandbox();
    // The refspec is absent before, which is what makes the assertion after
    // it a claim about this call rather than about the fixture.
    assert.ok(
      !gitOut(repo, "config", "--get-all", "remote.origin.fetch").includes("dabbler/rounds"),
    );
    await bootstrapVerb(["--project-dir", repo, "--no-transport-detect"]);
    assert.match(
      gitOut(repo, "config", "--get-all", "remote.origin.fetch"),
      /refs\/dabbler\/rounds/,
    );
    assert.ok(existsSync(join(repo, "AGENTS.md")));
  });
});
