// Step (f): who may publish, what actually runs, and what the record keeps.
//
// The pack and push commands are `node -e` scripts rather than a real build
// tool: the behaviours under test are how the framework spawns a command and
// what it does with the result, and a repository that shipped dotnet would be
// testing dotnet.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  OUTCOME_FAILED,
  OUTCOME_PUBLISHED,
  OUTCOME_REFUSED,
  PackagingConfigError,
  loadDeclaration,
  packageSession,
  redact,
  record,
  runAsRecord,
} from "../src/packaging.ts";
import { appendRound, packageOutputDir, packagingPath, readPackaging } from "../src/ledger.ts";
import { snapshotWorktreeTree } from "../src/journal.ts";
import { declareSessionTask, registerSessionStart } from "../src/writers.ts";
import { makeConfig, makeSandboxRepo, removeTempDirs } from "./support/fixtures.ts";

afterAll(removeTempDirs);

// Writes one file into whatever directory the framework hands it, named by
// the arguments after it.
const PACK_SRC =
  "const fs=require('fs'),p=require('path');" +
  "const out=process.argv[1];fs.mkdirSync(out,{recursive:true});" +
  "for(const n of process.argv.slice(2))fs.writeFileSync(p.join(out,n),'artifact');";

// Succeeds at its own job and leaves a build intermediate in the repository
// on the way past -- the ordinary shape of `dotnet pack` writing obj/ beside
// the code.
const DIRTY_PACK_SRC =
  "const fs=require('fs'),p=require('path');" +
  "const out=process.argv[1];fs.mkdirSync(out,{recursive:true});" +
  "fs.writeFileSync(p.join(out,'thing-1.0.nupkg'),'artifact');" +
  "fs.writeFileSync(process.argv[2],'intermediate');";

// Records the argv it received and the environment it was given, then echoes
// the credential back on stdout the way a chatty tool does.
const PUSH_SRC =
  "const fs=require('fs');const log=process.argv[1];" +
  "const rows=fs.existsSync(log)?JSON.parse(fs.readFileSync(log,'utf8')):[];" +
  "rows.push({argv:process.argv.slice(2),env:Object.keys(process.env).sort()});" +
  "fs.writeFileSync(log,JSON.stringify(rows));" +
  "console.log('pushing with token '+process.argv[4]);" +
  "process.exit(Number(process.env.CI||'0'));";

const FEED =
  "https://pkgs.dev.azure.test/org/_packaging/feed/nuget/v3/index.json";
const SECRET_ENV = "DABBLER_FEED_PAT_TEST";
const SECRET_VALUE = "pat-0123456789abcdef";

function git(repo: string, ...args: string[]): string {
  return execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.invalid",
      GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "test@example.invalid",
      GIT_CONFIG_NOSYSTEM: "1",
    },
  });
}

function packagingConfig(
  pushLog: string,
  options: { artifacts?: readonly string[]; packArgv?: readonly string[] } = {},
): Record<string, unknown> {
  const artifacts = options.artifacts ?? ["thing-1.0.nupkg"];
  return makeConfig({
    packaging: {
      pack: {
        argv: options.packArgv ?? [
          process.execPath, "-e", PACK_SRC, "{output}", ...artifacts,
        ],
      },
      push: {
        argv: [
          process.execPath, "-e", PUSH_SRC, pushLog,
          "{artifact}", "{feed}", "{secret}",
        ],
        feed: FEED,
        secret: SECRET_ENV,
      },
    },
  });
}

function pushes(pushLog: string): { argv: string[]; env: string[] }[] {
  return JSON.parse(readFileSync(pushLog, "utf8"));
}

/**
 * A session that may publish: declared releasable before the work, then
 * verified, committed, pushed and left with a clean tree.
 */
function publishable(): { repo: string; sessionsDir: string; pushLog: string } {
  const { repo, sessionsDir } = makeSandboxRepo();
  registerSessionStart(sessionsDir, 1, {
    engine: "claude-code",
    provider: "anthropic",
  });
  declareSessionTask(sessionsDir, {
    sessionNumber: 1,
    task: "ship the widget",
    releasable: true,
  });
  writeFileSync(join(repo, "widget.py"), "WIDGET = 1\n", "utf8");
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "work");
  git(repo, "push", "-q");
  appendRound(repo, 1, {
    round: 1,
    verdict: "VERIFIED",
    blocking: false,
    verifier_model: "gpt-5-4",
    verifier_provider: "openai",
    findings: [],
    completion_tree: snapshotWorktreeTree(repo),
    recorded_at: new Date().toISOString(),
  });
  process.env[SECRET_ENV] = SECRET_VALUE;
  return { repo, sessionsDir, pushLog: join(repo, "..", "pushes.json") };
}

beforeEach(() => {
  delete process.env["CI"];
  delete process.env[SECRET_ENV];
});

describe("the declaration", () => {
  // A repository publishes because it said how. Nothing here is inferred
  // from a language nobody named.

  it("loads nothing for a repository that declares nothing", () => {
    expect(loadDeclaration(makeConfig())).toBeNull();
  });

  // Each placeholder is the framework's only route for one fact. A command
  // missing one takes that fact from somewhere the record cannot see -- an
  // ambient credential, a stale output directory, a feed the record names
  // but the command never used.
  it.each([
    ["pack", "{output}"],
    ["push", "{artifact}"],
    ["push", "{feed}"],
    ["push", "{secret}"],
  ])("refuses a %s command that takes %s from elsewhere", (half, drop) => {
    const config = packagingConfig("log.json");
    const block = (config["packaging"] as Record<string, Record<string, unknown>>)[
      half
    ] as Record<string, unknown>;
    block["argv"] = (block["argv"] as string[]).filter((a) => a !== drop);
    expect(() => loadDeclaration(config)).toThrow(PackagingConfigError);
    expect(() => loadDeclaration(config)).toThrow(drop);
  });

  it("refuses a block that declares one half and not the other", () => {
    // A pack nobody pushes is a build, and a push with nothing to send is a
    // typo; neither is a publication, so neither is accepted alone.
    const config = makeConfig({ packaging: { pack: { argv: ["x", "{output}"] } } });
    expect(() => loadDeclaration(config)).toThrow(/push must be a mapping/);
  });

  it("refuses a push that names no feed and one that names no credential", () => {
    for (const [field, message] of [
      ["feed", /must name the feed/],
      ["secret", /must name the credential/],
    ] as const) {
      const config = packagingConfig("log.json");
      const push = (config["packaging"] as Record<string, Record<string, unknown>>)[
        "push"
      ] as Record<string, unknown>;
      push[field] = "";
      expect(() => loadDeclaration(config)).toThrow(message);
    }
  });

  it("refuses a timeout that is not a positive number", () => {
    for (const value of ["soon", 0, -1]) {
      const config = packagingConfig("log.json");
      const pack = (config["packaging"] as Record<string, Record<string, unknown>>)[
        "pack"
      ] as Record<string, unknown>;
      pack["timeout_seconds"] = value;
      expect(() => loadDeclaration(config)).toThrow(PackagingConfigError);
    }
  });
});

describe("who may publish", () => {
  // Step (a) decides, step (f) reads. The order is the point: a session that
  // declares after the work is a model choosing in hindsight.

  // Two shapes of the same answer: a session that declared `no`, and one
  // that never declared at all. `sessionIsReleasable` fails closed, so the
  // absent declaration is a refusal rather than an unknown.
  it.each([["never declared", null], ["declared no", false]])(
    "refuses a session that %s",
    (_label, declaration) => {
      const { repo, sessionsDir } = makeSandboxRepo();
      const pushLog = join(repo, "..", "pushes.json");
      registerSessionStart(sessionsDir, 1, {
        engine: "claude-code",
        provider: "anthropic",
      });
      if (declaration !== null) {
        declareSessionTask(sessionsDir, {
          sessionNumber: 1,
          task: "refactor only",
          releasable: declaration,
        });
      }
      const run = packageSession(sessionsDir, {
        config: packagingConfig(pushLog),
      });
      expect(run.outcome).toBe(OUTCOME_REFUSED);
      expect(run.releasable).toBe(false);
      expect(run.refusal).toContain("releasable");
      expect(existsSync(pushLog)).toBe(false);
    },
  );

  it("refuses a releasable session in a repository with no feed", () => {
    const { sessionsDir } = publishable();
    const run = packageSession(sessionsDir, { config: makeConfig() });
    expect(run.outcome).toBe(OUTCOME_REFUSED);
    expect(run.refusal).toContain("publishes nothing");
  });

  it("proves the order by the gates, not by the command sequence", () => {
    // Step (f) runs after (e). "After" means the evidence exists, so work
    // left unpushed refuses the publication rather than shipping a tree the
    // remote has never seen.
    const { repo, sessionsDir, pushLog } = publishable();
    writeFileSync(join(repo, "widget.py"), "WIDGET = 2\n", "utf8");
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "more work");
    const run = packageSession(sessionsDir, { config: packagingConfig(pushLog) });
    expect(run.outcome).toBe(OUTCOME_REFUSED);
    expect(run.refusal).toContain("pushed_to_remote");
    expect(existsSync(pushLog)).toBe(false);
  });

  it("refuses a missing credential before anything is built", () => {
    const { repo, sessionsDir, pushLog } = publishable();
    delete process.env[SECRET_ENV];
    const run = packageSession(sessionsDir, { config: packagingConfig(pushLog) });
    expect(run.outcome).toBe(OUTCOME_REFUSED);
    expect(run.refusal).toContain(SECRET_ENV);
    expect(existsSync(packageOutputDir(repo, 1))).toBe(false);
  });
});

describe("the publication", () => {
  it("packs once and pushes once per artifact", () => {
    const { repo, sessionsDir, pushLog } = publishable();
    const run = packageSession(sessionsDir, {
      config: packagingConfig(pushLog, {
        artifacts: ["a-1.0.nupkg", "b-1.0.nupkg"],
      }),
    });
    expect(run.outcome, run.refusal).toBe(OUTCOME_PUBLISHED);
    expect(run.artifacts).toEqual(["a-1.0.nupkg", "b-1.0.nupkg"]);
    expect(pushes(pushLog).map((row) => row.argv[0])).toEqual(
      run.artifacts.map((name) => join(packageOutputDir(repo, 1), name)),
    );
    expect(run.steps.map((s) => s.step)).toEqual(["pack", "push", "push"]);
    expect(run.treeDigest).toBe(snapshotWorktreeTree(repo));
  });

  it("writes into the run directory and leaves the tree alone", () => {
    // The tree that was verified stays the tree that was verified, and the
    // artifacts land where the record can name them.
    const { repo, sessionsDir, pushLog } = publishable();
    packageSession(sessionsDir, { config: packagingConfig(pushLog) });
    expect(existsSync(join(packageOutputDir(repo, 1), "thing-1.0.nupkg"))).toBe(true);
    expect(git(repo, "status", "--porcelain").trim()).toBe("");
  });

  it("does not publish a stale artifact from a previous run", () => {
    const { repo, sessionsDir, pushLog } = publishable();
    const output = packageOutputDir(repo, 1);
    mkdirSync(output, { recursive: true });
    writeFileSync(join(output, "last-week-9.9.nupkg"), "old", "utf8");
    const run = packageSession(sessionsDir, { config: packagingConfig(pushLog) });
    expect(run.artifacts).toEqual(["thing-1.0.nupkg"]);
    expect(existsSync(join(output, "last-week-9.9.nupkg"))).toBe(false);
  });

  it("refuses a pack that produced nothing rather than reporting published", () => {
    const { sessionsDir, pushLog } = publishable();
    const run = packageSession(sessionsDir, {
      config: packagingConfig(pushLog, { artifacts: [] }),
    });
    expect(run.outcome).toBe(OUTCOME_REFUSED);
    expect(run.refusal).toContain("nothing to push");
    expect(existsSync(pushLog)).toBe(false);
  });

  it("publishes nothing from a pack that dirtied the repository", () => {
    // A build that leaves intermediates behind has produced artifacts from a
    // tree nobody verified. The exit code says it worked; the tree says the
    // result is not about the code that was reviewed, and the tree wins --
    // the same rule a check that mutates its own subject gets.
    const { repo, sessionsDir, pushLog } = publishable();
    const run = packageSession(sessionsDir, {
      config: packagingConfig(pushLog, {
        packArgv: [
          process.execPath, "-e", DIRTY_PACK_SRC, "{output}",
          join(repo, "obj.log"),
        ],
      }),
    });
    expect(run.outcome).toBe(OUTCOME_FAILED);
    expect(run.treeMutated).toBe(true);
    expect(run.postTreeDigest).not.toBe(run.treeDigest);
    expect(existsSync(pushLog)).toBe(false);
  });

  it("stops the release at the first rejected push", () => {
    // A feed holding half a release beside a record claiming it published is
    // worse than a failure that stopped where it stopped. CI is on the
    // child-environment allowlist, so the stub exits on it.
    process.env["CI"] = "1";
    const { sessionsDir, pushLog } = publishable();
    const run = packageSession(sessionsDir, {
      config: packagingConfig(pushLog, {
        artifacts: ["a-1.0.nupkg", "b-1.0.nupkg"],
      }),
    });
    expect(run.outcome).toBe(OUTCOME_FAILED);
    expect(run.steps.map((s) => s.step)).toEqual(["pack", "push"]);
    expect(pushes(pushLog)).toHaveLength(1);
  });

  it("records a command that could not start as a failed step", () => {
    // "dotnet is not installed on this machine" belongs in the record beside
    // the command that needed it, not as a crash.
    const { sessionsDir, pushLog } = publishable();
    const run = packageSession(sessionsDir, {
      config: packagingConfig(pushLog, {
        packArgv: ["definitely-not-a-program-here", "{output}"],
      }),
    });
    expect(run.outcome).toBe(OUTCOME_FAILED);
    expect(run.steps[0]?.exitCode).toBeNull();
    expect(run.steps[0]?.output).toContain("could not start");
  });
});

describe("the credential", () => {
  it("reaches the command and no environment", () => {
    // The PAT is substituted into one argv element. The child's environment
    // is the allowlist, so neither the credential nor the operator's other
    // secrets are inherited.
    process.env["DABBLER_ANTHROPIC_API_KEY"] = "sk-should-not-travel";
    try {
      const { sessionsDir, pushLog } = publishable();
      const run = packageSession(sessionsDir, { config: packagingConfig(pushLog) });
      expect(run.outcome, run.refusal).toBe(OUTCOME_PUBLISHED);
      const row = pushes(pushLog)[0] as { argv: string[]; env: string[] };
      expect(row.argv[2]).toBe(SECRET_VALUE);
      expect(row.env).not.toContain(SECRET_ENV);
      expect(row.env).not.toContain("DABBLER_ANTHROPIC_API_KEY");
    } finally {
      delete process.env["DABBLER_ANTHROPIC_API_KEY"];
    }
  });

  it("keeps the placeholder in the record and scrubs the output", () => {
    // A credential that reaches a log has leaked whether or not it reached an
    // environment, so the recorded command still says `{secret}` and the
    // tool's own echo of it is scrubbed.
    const { sessionsDir, pushLog } = publishable();
    const run = packageSession(sessionsDir, { config: packagingConfig(pushLog) });
    const pushStep = run.steps[run.steps.length - 1];
    expect(pushStep?.command).toContain("{secret}");
    expect(pushStep?.output).toContain("pushing with token {secret}");
    expect(JSON.stringify(runAsRecord(run))).not.toContain(SECRET_VALUE);
  });

  it("leaves a credential too short to scrub in the output as itself", () => {
    // A one- or two-character "secret" would match inside ordinary words and
    // turn the record into redaction confetti. A credential that short is a
    // misconfiguration the record should show plainly.
    expect(redact("a short pat", "short")).toBe("a short pat");
    expect(redact(`echo ${SECRET_VALUE}`, SECRET_VALUE)).toBe("echo {secret}");
  });
});

describe("the record", () => {
  it("appends refusals and publications to one validated ledger", () => {
    // A record holding only the successes cannot be read as a history of
    // what was released, so a refusal files beside a publication.
    const { repo, sessionsDir, pushLog } = publishable();
    delete process.env[SECRET_ENV];
    record(sessionsDir, packageSession(sessionsDir, { config: packagingConfig(pushLog) }));
    process.env[SECRET_ENV] = SECRET_VALUE;
    record(sessionsDir, packageSession(sessionsDir, { config: packagingConfig(pushLog) }));
    const rows = readPackaging(repo, 1);
    expect(rows.map((r) => r["outcome"])).toEqual([
      OUTCOME_REFUSED,
      OUTCOME_PUBLISHED,
    ]);
    expect(rows[rows.length - 1]?.["feed"]).toBe(FEED);
    expect(rows[rows.length - 1]?.["secret_name"]).toBe(SECRET_ENV);
  });

  it("shows the gates and runs nothing for a dry run", () => {
    const { repo, sessionsDir, pushLog } = publishable();
    const run = packageSession(sessionsDir, {
      config: packagingConfig(pushLog),
      dryRun: true,
    });
    expect(run.ready).toBe(true);
    expect(run.gates.map((g) => g.passed)).toEqual([
      true, true, true, true, true, true,
    ]);
    expect(existsSync(pushLog)).toBe(false);
    expect(existsSync(packagingPath(repo, 1))).toBe(false);
  });

  it("refuses to file a dry run", () => {
    // A rehearsal is not an attempt, and a ledger that carried them could not
    // be read as a history of what was released.
    const { sessionsDir, pushLog } = publishable();
    const run = packageSession(sessionsDir, {
      config: packagingConfig(pushLog),
      dryRun: true,
    });
    expect(() => record(sessionsDir, run)).toThrow(/nothing to file/);
  });
});
