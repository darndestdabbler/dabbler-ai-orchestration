// Setting a consumer project up: the instruction fence, the ignore rule, the
// commit guard, the scaffolded declaration, and the transport preference.
//
// The scaffolded text itself is compared against the Python router in
// `differential.test.ts`; what is here is the decisions around it -- which
// branch runs, what is left alone, and what a second run does.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, afterEach, describe, expect, it } from "vitest";

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
  scaffoldSolutionManifest,
  scaffoldProjectConfig,
  writeInstructionFiles,
} from "../src/bootstrap/index.ts";
import { TRANSPORT_COPILOT_CLI, TRANSPORT_ENV_VAR } from "../src/config.ts";
import {
  initRepo,
  makeProject,
  makeSandboxRepo,
  makeTempDir,
  removeTempDirs,
} from "./support/fixtures.ts";
import { bootstrapVerb } from "../src/cli/bootstrap.ts";
import { load } from "../src/solution.ts";
import {
  ID_GIT_REMOTE,
  blockingDecisions,
  openDecisions,
  raiseRemoteDecision,
} from "../src/owedDecisions.ts";

afterAll(removeTempDirs);

const savedTransport = process.env[TRANSPORT_ENV_VAR];
afterEach(() => {
  if (savedTransport === undefined) delete process.env[TRANSPORT_ENV_VAR];
  else process.env[TRANSPORT_ENV_VAR] = savedTransport;
});

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
    expect(persistedScope(false, true, writer.write)).toBe(SCOPE_USER);
    expect(writer.asked).toEqual([false]);
  });

  it("writes machine scope when it was asked for and permitted", () => {
    const writer = writerThat(true);
    expect(persistedScope(true, true, writer.write)).toBe(SCOPE_MACHINE);
    expect(writer.asked).toEqual([true]);
  });

  it("falls back to user scope when machine scope was not permitted", () => {
    // The admin account is often a different user, and a preference that
    // landed for the operator beats one that landed nowhere.
    const writer = writerThat(true);
    expect(persistedScope(true, false, writer.write)).toBe(SCOPE_USER);
    expect(writer.asked).toEqual([false]);
  });

  it("falls back to user scope when the machine write itself fails", () => {
    const writer = writerThat(false, true);
    expect(persistedScope(true, true, writer.write)).toBe(SCOPE_USER);
    expect(writer.asked).toEqual([true, false]);
  });

  it("reports that nothing landed when every scope fails", () => {
    expect(persistedScope(true, true, writerThat(false, false).write)).toBeNull();
  });

  it("names a command the operator can run without another account", () => {
    // A hint that says "re-run elevated" is useless when the admin account
    // is a different user, so the hint is always the user-scope one.
    const hint = manualPersistHint("copilot-cli");
    expect(hint).toContain(TRANSPORT_ENV_VAR);
    expect(hint).toContain("copilot-cli");
    expect(hint.toLowerCase()).not.toContain("admin");
  });
});

describe("what the transport preference resolves to", () => {
  it("takes an explicit choice over everything else", () => {
    process.env[TRANSPORT_ENV_VAR] = "api";
    const [value, reason] = resolveBootstrapTransport(TRANSPORT_COPILOT_CLI);
    expect(value).toBe(TRANSPORT_COPILOT_CLI);
    expect(reason).toContain("--transport");
  });

  it("never overrides a preference already set", () => {
    // Detection is a fact about the machine; a choice already made is a fact
    // about the operator, and the second outranks the first.
    process.env[TRANSPORT_ENV_VAR] = "api";
    const [value, reason] = resolveBootstrapTransport(null);
    expect(value).toBeNull();
    expect(reason).toContain("already set to 'api'");
  });

  it("leaves the default alone when nothing is set and no seat answers", () => {
    // `detectCopilotSeat` shells out to a binary this machine may or may not
    // have. Either answer is legitimate here: what is asserted is that an
    // unset preference never comes back as anything but a seat or the
    // default, and never as a scope that was written.
    delete process.env[TRANSPORT_ENV_VAR];
    const [value, reason] = resolveBootstrapTransport(null);
    if (value === null) expect(reason).toContain("no Copilot seat detected");
    else {
      expect(value).toBe(TRANSPORT_COPILOT_CLI);
      expect(reason).toContain("detected a Copilot seat");
    }
  });
});

describe("the ignore rule", () => {
  it("creates the file with the rule when there is none", () => {
    const project = makeTempDir();
    expect(ensureGitignore(project)).toBe(true);
    expect(readFileSync(join(project, ".gitignore"), "utf8")).toContain(".dabbler/");
  });

  it("appends without disturbing what is already there", () => {
    const project = makeTempDir();
    writeFileSync(join(project, ".gitignore"), "node_modules/\n", "utf8");
    expect(ensureGitignore(project)).toBe(true);
    const text = readFileSync(join(project, ".gitignore"), "utf8");
    expect(text).toContain("node_modules/");
    expect(text).toContain(".dabbler/");
  });

  it("adds the rule once however many times it runs", () => {
    const project = makeTempDir();
    ensureGitignore(project);
    expect(ensureGitignore(project)).toBe(false);
    const text = readFileSync(join(project, ".gitignore"), "utf8");
    expect(text.split(".dabbler/").length - 1).toBe(1);
  });

  it("leaves an equivalent rule someone already wrote alone", () => {
    const project = makeTempDir();
    writeFileSync(join(project, ".gitignore"), ".dabbler\n", "utf8");
    expect(ensureGitignore(project)).toBe(false);
  });

  it("does not blunt a rule written to re-include something underneath", () => {
    // `.dabbler/*` governs the same directory but leaves the parent
    // traversable. Adding `.dabbler/` after it would exclude the parent
    // outright, and git cannot re-include through an excluded parent -- so
    // a ledger the project deliberately tracks would silently stop being
    // added.
    const project = makeTempDir();
    writeFileSync(
      join(project, ".gitignore"),
      ".dabbler/*\n!.dabbler/runs/\n",
      "utf8",
    );
    expect(ensureGitignore(project)).toBe(false);
    expect(readFileSync(join(project, ".gitignore"), "utf8")).not.toContain(
      "\n.dabbler/\n",
    );
  });
});

describe("the instruction files", () => {
  it("writes three files, each with a managed section", () => {
    const project = makeTempDir();
    const written = writeInstructionFiles(project, "acme-app");
    expect(written.map((p) => p.split(/[\\/]/).pop())).toEqual([
      "AGENTS.md",
      "CLAUDE.md",
      "GEMINI.md",
    ]);
    for (const path of written) {
      const text = readFileSync(path, "utf8");
      expect(text).toContain(MANAGED_START);
      expect(text).toContain(MANAGED_END);
      // A fence an orchestrator loads every session is a budget, not just a
      // document. Counted as `str.splitlines()` counts, so the cap means the
      // same number on both sides of the port.
      expect(text.replace(/\n$/, "").split("\n").length).toBeLessThanOrEqual(150);
    }
  });

  it("puts the body in AGENTS.md alone and imports it from the others", () => {
    // Copilot loads all three at once and de-duplicates nothing, so exactly
    // one file may hold the body.
    const project = makeTempDir();
    writeInstructionFiles(project, "acme-app");
    const agents = readFileSync(join(project, "AGENTS.md"), "utf8");
    expect(agents).toContain("`acme-app`");
    expect(agents).toContain("dabbler session next");
    for (const name of ["CLAUDE.md", "GEMINI.md"]) {
      const text = readFileSync(join(project, name), "utf8");
      expect(text).toContain("@AGENTS.md");
      expect(text).not.toContain("dabbler session next");
    }
  });

  it("tells the engine to call the framework rather than typing the lifecycle out", () => {
    // The engine used to read nine numbered steps and execute them. It now
    // reads one verb, because a list an engine can follow is a list it will
    // follow whether or not the framework is already doing the work.
    const project = makeTempDir();
    writeInstructionFiles(project, "acme-app");
    const agents = readFileSync(join(project, "AGENTS.md"), "utf8");
    expect(agents).toContain("dabbler session next");
    for (const verb of [
      "session declare",
      "dabbler affected",
      "test-evidence record",
      "dabbler verify",
      "dabbler packaging",
      "session close",
    ]) {
      expect(agents).not.toContain(verb);
    }
    // What stays is what is still the engine's to honour.
    expect(agents).toContain("DABBLER_ANTHROPIC_API_KEY");
    expect(agents).toContain("never by hand");
  });

  it("says publishing is the framework's, and says which sessions it is true of", () => {
    // The sentence claimed publishing happened inside the framework's own
    // calls while nothing in the driven lifecycle called packaging, so a
    // csv-model orchestrator following it exactly waited for a step that
    // never came and the session shipped nothing. It is true now -- and
    // true only of a session that declared itself releasable, which is the
    // half an engine would otherwise have to infer.
    const project = makeTempDir();
    writeInstructionFiles(project, "acme-app");
    const agents = readFileSync(join(project, "AGENTS.md"), "utf8");
    expect(agents).toContain("releasable");
    expect(agents).toContain("not-releasable");
    // And what happens when it does not: the close refuses rather than
    // reporting a session that shipped when nothing was built.
    expect(agents.toLowerCase()).toContain("the close refuses");
  });

  it("tells every project the two things that corrupt work silently", () => {
    // Both were learned here and neither reached the body a project gets.
    // A csv-model session lost JSON backslash escapes to a Git Bash
    // heredoc and had to route around it, because the heredoc rule lived
    // only in THIS repository's hand-written Environment section; and a
    // report was refused for a tree that moved under its own check.
    //
    // Asserted by meaning rather than by wording: what matters is that the
    // engine is told to use its editing tools and to leave the tree alone
    // while a check runs, not the sentence either is said in.
    const project = makeTempDir();
    writeInstructionFiles(project, "acme-app");
    const agents = readFileSync(join(project, "AGENTS.md"), "utf8");
    expect(agents).toContain("heredoc");
    expect(agents.toLowerCase()).toContain("backslash");
    expect(agents).toContain("editing tools");
    expect(agents.toLowerCase()).toContain("working tree");
  });

  it("gives each engine its own tail", () => {
    const project = makeTempDir();
    writeInstructionFiles(project, "x");
    expect(readFileSync(join(project, "CLAUDE.md"), "utf8")).toContain("Claude Code");
    expect(readFileSync(join(project, "AGENTS.md"), "utf8")).toContain("Copilot");
    expect(readFileSync(join(project, "GEMINI.md"), "utf8")).toContain("Gemini CLI");
  });

  it("never touches user content outside the fence", () => {
    const project = makeTempDir();
    const target = join(project, "CLAUDE.md");
    writeFileSync(target, "# My own rules\nNever delete this line.\n", "utf8");
    writeInstructionFiles(project, "x");
    const text = readFileSync(target, "utf8");
    expect(text).toContain("Never delete this line.");
    expect(text).toContain(MANAGED_START);
  });

  it("replaces only the fence on a refresh", () => {
    const project = makeTempDir();
    const target = join(project, "AGENTS.md");
    writeInstructionFiles(project, "x");
    const first = readFileSync(target, "utf8");
    writeFileSync(target, `above\n\n${first}\nbelow\n`, "utf8");
    writeInstructionFiles(project, "x");
    const text = readFileSync(target, "utf8");
    expect(text.startsWith("above\n")).toBe(true);
    expect(text.trimEnd().endsWith("below")).toBe(true);
    expect(text.split(MANAGED_START).length - 1).toBe(1);
  });

  it("names the project after its directory when nothing else does", () => {
    const project = makeTempDir();
    writeInstructionFiles(project);
    const agents = readFileSync(join(project, "AGENTS.md"), "utf8");
    expect(agents).toContain(project.split(/[\\/]/).pop() as string);
  });
});

describe("the commit guard", () => {
  it("installs a hook that invokes the router by name", () => {
    // There is no interpreter to bake in: a consumer repository is not
    // required to contain the thing that guards it.
    const project = makeProject();
    const hook = ensureCommitGuard(project);
    expect(hook).not.toBeNull();
    const text = readFileSync(hook as string, "utf8");
    expect(text).toContain("dabbler verify step guard-commit");
    expect(text).not.toContain("python");
  });

  it("writes nothing the second time", () => {
    const project = makeProject();
    ensureCommitGuard(project);
    expect(ensureCommitGuard(project)).toBeNull();
  });

  it("never clobbers a hook it did not write", () => {
    // A project's own pre-commit checks are not ours to delete, and a guard
    // that silently ate them would be worse than no guard.
    const project = makeProject();
    const path = join(project, ".git", "hooks", "pre-commit");
    mkdirSync(join(project, ".git", "hooks"), { recursive: true });
    writeFileSync(path, "#!/bin/sh\nmake lint\n", "utf8");
    expect(ensureCommitGuard(project)).toBeNull();
    expect(readFileSync(path, "utf8")).toContain("make lint");
  });

  it("declines a directory that is not a repository", () => {
    expect(ensureCommitGuard(makeTempDir())).toBeNull();
  });
});

describe("the scaffolded setup sessions", () => {
  it("writes two numbered sessions into a project with no plan", () => {
    const project = makeTempDir();
    const written = scaffoldBootstrapSessions(project);
    expect(written).toHaveLength(1);
    const text = readFileSync(written[0] as string, "utf8");
    expect(text).toContain("### Session 1:");
    expect(text).toContain("### Session 2:");
    expect(text).toContain("Do NOT hand-author `sessions.json`");
  });

  it("never overwrites a plan the repository already has", () => {
    // A repository that already has a plan has its own numbering and its own
    // history.
    const project = makeTempDir();
    const dir = join(project, "docs", "sessions");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "session-plan.md"), "# Ours\n", "utf8");
    expect(scaffoldBootstrapSessions(project)).toEqual([]);
    expect(readFileSync(join(dir, "session-plan.md"), "utf8")).toBe("# Ours\n");
  });
});

describe("what a repository declares about its tests", () => {
  it("gives each detected ecosystem its own suite", () => {
    const project = makeTempDir();
    writeFileSync(join(project, "pytest.ini"), "[pytest]\n", "utf8");
    writeFileSync(join(project, "pom.xml"), "<project/>\n", "utf8");
    const config = renderProjectConfig(detectEcosystems(project));
    expect(config).toContain("name: python");
    expect(config).toContain("name: maven");
    expect(config).toContain("runs_whole: true");
  });

  it("declares nothing from a build file that declares no test command", () => {
    // `pyproject.toml` says this is a Python project; it says nothing about
    // how the tests run, and plenty of them use unittest or nox.
    const project = makeTempDir();
    writeFileSync(join(project, "pyproject.toml"), "[project]\nname='x'\n", "utf8");
    expect(detectEcosystems(project)).toEqual([]);
  });

  it("declares nothing from a script that exists in order to fail", () => {
    // `npm init` writes the placeholder, and a repository that has not
    // replaced it has said the opposite of "my tests run this way".
    const project = makeTempDir();
    writeFileSync(
      join(project, "package.json"),
      JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }),
      "utf8",
    );
    expect(detectEcosystems(project)).toEqual([]);
  });

  it("survives a manifest that parses but does not conform", () => {
    // A shape error must leave node undetected rather than end the whole
    // bootstrap.
    const project = makeTempDir();
    writeFileSync(join(project, "package.json"), '{"scripts": "not a map"}', "utf8");
    expect(detectEcosystems(project)).toEqual([]);
  });

  it("declares nothing for a build file below the root", () => {
    // A suite declares a command and no working directory, so
    // `service/pom.xml` has no runnable line to become.
    const project = makeTempDir();
    mkdirSync(join(project, "service"), { recursive: true });
    writeFileSync(join(project, "service", "pom.xml"), "<project/>\n", "utf8");
    expect(detectEcosystems(project)).toEqual([]);
  });

  it("uses the committed wrapper as the entry point it was committed to be", () => {
    // `gradle test` on a machine that has only `gradlew` fails for a reason
    // the repository already solved.
    const project = makeTempDir();
    writeFileSync(join(project, "build.gradle"), "", "utf8");
    expect(detectEcosystems(project)[0]?.command).toBe("gradle test");
    writeFileSync(join(project, "gradlew"), "#!/bin/sh\n", "utf8");
    expect(detectEcosystems(project)[0]?.command).toBe("./gradlew test");
  });

  it("maps every path rather than none", () => {
    // A path no rule covers is `selection_unknown`, and pre-verification
    // fails closed. The only honest starting mapping is repository-wide.
    const project = makeTempDir();
    writeFileSync(join(project, "pytest.ini"), "[pytest]\n", "utf8");
    expect(renderProjectConfig(detectEcosystems(project))).toContain("repo_wide");
  });

  it("declares no suite for a repository that says nothing", () => {
    // That is a declaration, not an omission.
    const config = renderProjectConfig([]);
    expect(config).toContain("No suite is declared");
    // The block it shows is an example, and every line of it is commented:
    // a scaffold that emitted a live `testing:` key here would hand the
    // repository a suite it never declared.
    expect(config.split("\n").filter((l) => l.startsWith("testing:"))).toEqual([]);
  });

  it("never overwrites a declaration the repository already made", () => {
    const project = makeTempDir();
    writeFileSync(join(project, "dabbler.yaml"), "schema_version: 1\n", "utf8");
    expect(scaffoldProjectConfig(project)).toBeNull();
    expect(readFileSync(join(project, "dabbler.yaml"), "utf8")).toBe(
      "schema_version: 1\n",
    );
  });

  it("declares .NET from a solution or project file at the root", () => {
    const project = makeTempDir();
    writeFileSync(join(project, "Acme.csproj"), "<Project/>\n", "utf8");
    expect(detectEcosystems(project)[0]?.key).toBe("dotnet");
  });
});

describe("the round-ref migration", () => {
  it("teaches an existing clone to fetch and push round baselines", () => {
    // A clone made before round refs existed carries neither refspec, and
    // the fix only reaches the machine a session moves to once its clone
    // fetches them -- so re-running bootstrap is the migration.
    const target = makeTempDir();
    const repo = join(target, "repo");
    const remote = join(target, "remote.git");
    execFileSync("git", ["init", "-q", "--bare", remote], { stdio: "ignore" });
    initRepo(repo, "-b", "main");
    execFileSync("git", ["-C", repo, "remote", "add", "origin", remote], {
      stdio: "ignore",
    });

    const ran = execFileSync(
      process.execPath,
      [
        join(import.meta.dirname, "..", "dist", "dabbler.cjs"),
        "bootstrap",
        "--project-dir", repo,
        "--no-transport-detect",
      ],
      { encoding: "utf8" },
    );
    expect(ran).toContain("baselines travel with a push and a fetch");
    const config = execFileSync("git", ["-C", repo, "config", "--get-all", "remote.origin.fetch"], {
      encoding: "utf8",
    });
    expect(config).toContain("refs/dabbler/rounds");
    expect(existsSync(join(repo, "AGENTS.md"))).toBe(true);
  });
});

describe("what setup does about the operator's typing", () => {
  it("commits the files it wrote, and only those", async () => {
    // It used to print "commit what this just wrote" -- the framework asking
    // the operator to run a command it could run, about files it had just
    // written, knowing session 1 would be refused while they sat there.
    const { repo, sessionsDir } = makeSandboxRepo();
    void sessionsDir;
    writeFileSync(join(repo, "mine.txt"), "the operator's own work\n", "utf8");
    await bootstrapVerb(["--project-dir", repo, "--no-transport-detect"]);
    const status = execFileSync("git", ["status", "--porcelain", "-uall"], {
      cwd: repo,
      encoding: "utf8",
    });
    // The operator's file is untouched; setup's own are committed.
    expect(status).toContain("mine.txt");
    expect(status).not.toContain("AGENTS.md");
    const subject = execFileSync("git", ["log", "-1", "--format=%s"], {
      cwd: repo,
      encoding: "utf8",
    });
    expect(subject.trim()).toBe("Set up Dabbler");
  });

  it("asks where the repository pushes rather than printing a push command", async () => {
    // csv-model item 2's other half: the close printed `git push
    // --set-upstream <remote> main` for a remote nobody had created.
    const repo = makeProject();
    initRepo(repo, "-b", "main");
    execFileSync("git", ["config", "user.email", "t@t"], { cwd: repo });
    execFileSync("git", ["config", "user.name", "t"], { cwd: repo });
    await bootstrapVerb(["--project-dir", repo, "--no-transport-detect"]);
    const owed = openDecisions(repo).map((row) => String(row["id"]));
    expect(owed).toContain(ID_GIT_REMOTE);
  });
});

describe("the remote question", () => {
  it("is not asked of a repository that already has a remote", () => {
    const { repo } = makeSandboxRepo();
    expect(raiseRemoteDecision(repo, { hasRemote: true })).toBeNull();
  });

  it("does not hold the close, because staying local is a real answer", () => {
    const { repo } = makeSandboxRepo();
    const row = raiseRemoteDecision(repo, { hasRemote: false });
    expect(row?.["severity"]).toBe("advisory");
    expect(blockingDecisions(repo)).toHaveLength(0);
  });
});

describe("what the Solution Explorer has to render", () => {
  it("scaffolds a one-component manifest, which is what a fresh repo IS", () => {
    // The view was empty in every new project and explained nothing --
    // csv-model item 4. Three things caused that and none was a missing
    // writer; this is the manifest half.
    const repo = makeProject();
    initRepo(repo, "-b", "main");
    execFileSync("git", ["config", "user.email", "t@t"], { cwd: repo });
    execFileSync("git", ["config", "user.name", "t"], { cwd: repo });
    expect(scaffoldSolutionManifest(repo)).toBe(join(repo, "solution.yaml"));
    const solution = load(repo);
    expect(solution.components).toHaveLength(1);
    expect(solution.components[0].kind).toBe("integration");
  });

  it("leaves a manifest the project already wrote alone", () => {
    const repo = makeProject();
    writeFileSync(join(repo, "solution.yaml"), "# mine\n", "utf8");
    expect(scaffoldSolutionManifest(repo)).toBeNull();
    expect(readFileSync(join(repo, "solution.yaml"), "utf8")).toBe("# mine\n");
  });

  it("writes the first projection, so the tree has content before any verb", async () => {
    const repo = makeProject();
    initRepo(repo, "-b", "main");
    execFileSync("git", ["config", "user.email", "t@t"], { cwd: repo });
    execFileSync("git", ["config", "user.name", "t"], { cwd: repo });
    await bootstrapVerb(["--project-dir", repo, "--no-transport-detect"]);
    expect(existsSync(join(repo, ".dabbler", "solution", "projection.json"))).toBe(
      true,
    );
  });
});
