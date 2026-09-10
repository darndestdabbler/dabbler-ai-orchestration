// Step (f): who may publish, what actually runs, and what the record keeps.
//
// The pack and push commands are `node -e` scripts rather than a real build
// tool: the behaviours under test are how the framework spawns a command and
// what it does with the result, and a repository that shipped dotnet would be
// testing dotnet. The declaration's own rules need no repository and are
// asserted from literals.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";

import { canonicalPath, snapshotWorktreeTree } from "../src/journal.ts";
import {
  appendRound,
  packageOutputDir,
  packagingPath,
  readPackaging,
  validatePackaging,
} from "../src/ledger.ts";
import {
  OUTCOME_FAILED,
  OUTCOME_PUBLISHED,
  OUTCOME_REFUSED,
  PackagingConfigError,
  feedTakesCredential,
  loadDeclaration,
  loadTagRelease,
  packageSession,
  record,
  redact,
  runAsRecord,
  taggedCommit,
} from "../src/packaging.ts";
import { declareSessionTask, registerSessionStart } from "../src/writers.ts";
import { EARLIER_COMMIT, makeAnsweredSandbox, makeConfig } from "./support/answers.ts";

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

const FEED = "https://pkgs.dev.azure.test/org/_packaging/feed/nuget/v3/index.json";
const SECRET_ENV = "DABBLER_FEED_PAT_TEST";
const SECRET_VALUE = "pat-0123456789abcdef";

function packagingConfig(
  pushLog: string,
  options: { artifacts?: readonly string[]; packArgv?: readonly string[] } = {},
): Record<string, unknown> {
  const artifacts = options.artifacts ?? ["thing-1.0.nupkg"];
  return makeConfig({
    packaging: {
      pack: {
        argv: options.packArgv ?? [process.execPath, "-e", PACK_SRC, "{output}", ...artifacts],
      },
      push: {
        argv: [process.execPath, "-e", PUSH_SRC, pushLog, "{artifact}", "{feed}", "{secret}"],
        feed: FEED,
        secret: SECRET_ENV,
      },
    },
  });
}

function pushes(pushLog: string): Array<{ argv: string[]; env: string[] }> {
  return JSON.parse(readFileSync(pushLog, "utf8")) as Array<{ argv: string[]; env: string[] }>;
}

/** The `packaging` half of a config, so a test can break one field of it. */
function half(config: Record<string, unknown>, which: string): Record<string, unknown> {
  return (config["packaging"] as Record<string, Record<string, unknown>>)[which] as Record<
    string,
    unknown
  >;
}

/**
 * A session that may publish: declared releasable before the work, then
 * verified, and -- as git tells it -- committed, pushed and left with a
 * clean tree. `ahead` is how a test takes the push back.
 */
function publishable(): {
  repo: string;
  sessionsDir: string;
  pushLog: string;
  ahead: (count: number) => void;
} {
  const { repo, sessionsDir, ahead } = makeAnsweredSandbox({ "widget.py": "WIDGET = 1\n" });
  registerSessionStart(sessionsDir, 1, { engine: "claude-code", provider: "anthropic" });
  declareSessionTask(sessionsDir, { sessionNumber: 1, task: "ship the widget", releasable: true });
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
  return { repo, sessionsDir, pushLog: join(repo, "..", "pushes.json"), ahead };
}

beforeEach(() => {
  delete process.env["CI"];
  delete process.env[SECRET_ENV];
});

// --- The declaration ------------------------------------------------------------

describe("the declaration", () => {
  // A repository publishes because it said how. Nothing here is inferred
  // from a language nobody named.

  it("loads nothing for a repository that declares nothing", () => {
    assert.equal(loadDeclaration(makeConfig()), null);
    assert.equal(loadTagRelease(makeConfig()), null);
  });

  // The other kind of answer, and it is an answer rather than an absence: a
  // repository that releases by tag has no pack and no push to declare,
  // because the credential that publishes lives in CI and never here.
  it("reads a tag release, which declares no pack and no push", () => {
    const config = makeConfig({ packaging: { release: "tag" } });
    assert.deepEqual(loadTagRelease(config), { kind: "tag" });
    assert.equal(loadDeclaration(config), null);
  });

  // A block claiming both leaves the record unable to say which one it is
  // describing, and the record is the whole point of step (f).
  it("refuses a block that declares a tag release and a pack/push pair", () => {
    const config = makeConfig({
      packaging: { release: "tag", pack: { argv: ["true"] }, push: { argv: ["true"] } },
    });
    assert.throws(() => loadTagRelease(config), PackagingConfigError);
    assert.throws(() => loadDeclaration(config), PackagingConfigError);
  });

  it("refuses a release this framework does not know how to make", () => {
    const config = makeConfig({ packaging: { release: "npm" } });
    assert.throws(() => loadTagRelease(config), PackagingConfigError);
  });

  // Each placeholder is the framework's only route for one fact. A command
  // missing one takes that fact from somewhere the record cannot see -- an
  // ambient credential, a stale output directory, a feed the record names
  // but the command never used.
  for (const [step, placeholder] of [
    ["pack", "{output}"],
    ["push", "{artifact}"],
    ["push", "{feed}"],
    ["push", "{secret}"],
  ] as const) {
    it(`refuses a ${step} command that takes ${placeholder} from elsewhere`, () => {
      const config = packagingConfig("log.json");
      const block = half(config, step);
      block["argv"] = (block["argv"] as string[]).filter((token) => token !== placeholder);
      assert.throws(() => loadDeclaration(config), PackagingConfigError);
      assert.throws(() => loadDeclaration(config), new RegExp(placeholder.replace(/[{}]/g, "\\$&")));
    });
  }

  it("answers a module's own packaging block for its slug, and the root block for a slug without one", () => {
    // One feed declared once at the root; a module with its own feed says
    // so beside its slug under `modules:`. `{version}` is the pack's to
    // name, and a pack that names it says so on the declaration.
    const root = packagingConfig("log.json");
    const config = makeConfig({
      packaging: root["packaging"],
      modules: {
        persister: {
          packaging: {
            pack: { argv: ["dotnet", "pack", "modules/persister", "-o", "{output}", "-p:PackageVersion={version}"] },
            push: { argv: ["dotnet", "nuget", "push", "{artifact}", "--source", "{feed}"], feed: "D:\\feeds\\local" },
          },
        },
        model: {},
      },
    });
    const own = loadDeclaration(config, "persister");
    assert.deepEqual(own?.pack.argv.slice(0, 3), ["dotnet", "pack", "modules/persister"]);
    assert.equal(own?.pack.usesVersion, true);
    assert.equal(own?.push.feed, "D:\\feeds\\local");
    const inherited = loadDeclaration(config, "model");
    assert.deepEqual(inherited?.push.feed, FEED);
    assert.equal(inherited?.pack.usesVersion, false);
    assert.deepEqual(loadDeclaration(config, null)?.push.feed, FEED);
  });

  it("refuses a block that declares one half and not the other", () => {
    // A pack nobody pushes is a build, and a push with nothing to send is a
    // typo; neither is a publication, so neither is accepted alone.
    assert.throws(
      () => loadDeclaration(makeConfig({ packaging: { pack: { argv: ["x", "{output}"] } } })),
      /push must be a mapping/,
    );
  });

  it("refuses a push that names no feed and one that names no credential", () => {
    for (const [field, message] of [
      ["feed", /must name the feed/],
      ["secret", /must name the credential/],
    ] as const) {
      const config = packagingConfig("log.json");
      half(config, "push")[field] = "";
      assert.throws(() => loadDeclaration(config), message);
    }
  });

  it("refuses a timeout that is not a positive number", () => {
    for (const value of ["soon", 0, -1]) {
      const config = packagingConfig("log.json");
      half(config, "pack")["timeout_seconds"] = value;
      assert.throws(() => loadDeclaration(config), PackagingConfigError, String(value));
    }
  });
});

describe("a feed that takes no credential", () => {
  // csv-model, 2026-09-01: a folder-based NuGet source needs no PAT --
  // `dotnet nuget push … --api-key x` to a directory ignores the key -- but
  // the declaration demanded one anyway, so the operator declared
  // DABBLER_FEED_PAT and exported a placeholder value for a folder on their
  // own disk. The redactor then blanked that word wherever it appeared in
  // captured output, which is the second bite: pick a natural word and watch
  // every occurrence of it vanish from the transcript.

  it("knows a path on disk from a feed on the network, and is unsure in the repository's favour", () => {
    for (const local of [
      "D:/Projects/dabbler-local-feed",
      "C:\\feeds\\local",
      "file:///d/feeds/local",
      "/var/feeds/local",
      "\\\\build\\artifacts",
      "./feed",
      "../shared-feed",
      // Drive-relative, and plainly relative: both name a directory, and
      // neither was recognised until the verifier asked why not.
      "C:feeds\\local",
      "feeds/local",
      "feeds\\local",
    ]) {
      assert.equal(feedTakesCredential(local), false, local);
    }
    for (const remote of [
      "https://pkgs.dev.azure.test/org/_packaging/feed/nuget/v3/index.json",
      "http://nuget.internal/v3/index.json",
      // Ambiguous, and therefore treated as needing one: the only way to
      // drop the requirement is to name something unmistakably local.
      "internal-feed",
      "",
    ]) {
      assert.equal(feedTakesCredential(remote), true, remote);
    }
  });

  it("loads a folder feed with no secret and no {secret} placeholder", () => {
    const config = packagingConfig("log.json");
    const push = half(config, "push");
    push["feed"] = "D:/Projects/dabbler-local-feed";
    delete push["secret"];
    push["argv"] = (push["argv"] as string[]).filter((token) => token !== "{secret}");
    assert.equal(loadDeclaration(config)?.push.secret, "");
  });

  it("still refuses an http feed that names no credential", () => {
    // The requirement is dropped for a folder and for nothing else.
    const config = packagingConfig("log.json");
    delete half(config, "push")["secret"];
    assert.throws(() => loadDeclaration(config), /must name the credential/);
  });
});

// --- Who may publish ------------------------------------------------------------

describe("who may publish", () => {
  // Step (a) decides, step (f) reads. The order is the point: a session that
  // declares after the work is a model choosing in hindsight.

  // Two shapes of the same answer: a session that declared `no`, and one
  // that never declared at all. The read fails closed, so the absent
  // declaration is a refusal rather than an unknown.
  for (const [label, declaration] of [
    ["never declared", null],
    ["declared no", false],
  ] as const) {
    it(`refuses a session that ${label}`, () => {
      const { repo, sessionsDir } = makeAnsweredSandbox();
      const pushLog = join(repo, "..", "pushes.json");
      registerSessionStart(sessionsDir, 1, { engine: "claude-code", provider: "anthropic" });
      if (declaration !== null) {
        declareSessionTask(sessionsDir, {
          sessionNumber: 1,
          task: "refactor only",
          releasable: declaration,
        });
      }
      const run = packageSession(sessionsDir, { config: packagingConfig(pushLog) });
      assert.equal(run.outcome, OUTCOME_REFUSED);
      assert.equal(run.releasable, false);
      assert.match(String(run.refusal), /releasable/);
      assert.equal(existsSync(pushLog), false);
    });
  }

  it("refuses a releasable session in a repository with no feed", () => {
    const { sessionsDir } = publishable();
    const run = packageSession(sessionsDir, { config: makeConfig() });
    assert.equal(run.outcome, OUTCOME_REFUSED);
    assert.match(String(run.refusal), /publishes nothing/);
  });

  it("proves the order by the gates, not by the command sequence", () => {
    // Step (f) runs after (e). "After" means the evidence exists, so work
    // left unpushed refuses the publication rather than shipping a tree the
    // remote has never seen.
    const { sessionsDir, pushLog, ahead } = publishable();
    ahead(1);
    const run = packageSession(sessionsDir, { config: packagingConfig(pushLog) });
    assert.equal(run.outcome, OUTCOME_REFUSED);
    assert.match(String(run.refusal), /pushed_to_remote/);
    assert.equal(existsSync(pushLog), false);
  });

  it("refuses a missing credential before anything is built", () => {
    const { repo, sessionsDir, pushLog } = publishable();
    delete process.env[SECRET_ENV];
    const run = packageSession(sessionsDir, { config: packagingConfig(pushLog) });
    assert.equal(run.outcome, OUTCOME_REFUSED);
    assert.match(String(run.refusal), new RegExp(SECRET_ENV));
    assert.equal(existsSync(packageOutputDir(repo, 1)), false);
  });
});

// --- The publication ------------------------------------------------------------

describe("a release that is a tag", () => {
  // Session 137 landed its work, wrote its release notes, and then could not
  // publish: this repository releases from a tag-driven workflow whose
  // credential is not on any developer's machine, so it declares no pack and
  // no push -- and the publish phase read that as "nothing to publish" while
  // `published_when_releasable` demanded a run. A repository has to be able
  // to SAY that its release is a tag.
  const RELEASING = "3.1.4";

  /** A publishable sandbox whose manifests all carry one stamped version. */
  function taggable(routerVersion = RELEASING): ReturnType<typeof makeAnsweredSandbox> {
    const sandbox = makeAnsweredSandbox({
      "version.json": `{"version": "${RELEASING}"}\n`,
      "packages/router/package.json": `{"version": "${routerVersion}"}\n`,
      "tools/dabbler-ai-orchestration/package.json":
        `{"version": "${RELEASING}", "dependencies": {"dabbler-ai-router": "${RELEASING}"}}\n`,
    });
    registerSessionStart(sandbox.sessionsDir, 1, {
      engine: "claude-code",
      provider: "anthropic",
    });
    declareSessionTask(sandbox.sessionsDir, {
      sessionNumber: 1,
      task: "ship it",
      releasable: true,
    });
    appendRound(sandbox.repo, 1, {
      round: 1,
      verdict: "VERIFIED",
      blocking: false,
      verifier_model: "gpt-5-4",
      verifier_provider: "openai",
      findings: [],
      completion_tree: snapshotWorktreeTree(sandbox.repo),
      recorded_at: new Date().toISOString(),
    });
    return sandbox;
  }

  const TAG_CONFIG = () => makeConfig({ packaging: { release: "tag" } });

  it("refuses, and names the verb, while the tag is not on origin", () => {
    const { sessionsDir, restore } = taggable();
    try {
      const run = packageSession(sessionsDir, { config: TAG_CONFIG() });
      assert.equal(run.outcome, OUTCOME_REFUSED);
      assert.match(String(run.refusal), new RegExp(`vsix-v${RELEASING}`));
      assert.match(String(run.refusal), /dabbler release/);
    } finally {
      restore();
    }
  });

  it("records published once origin carries the tag at the commit this session landed", () => {
    const { sessionsDir, remoteTag, restore } = taggable();
    try {
      remoteTag(`vsix-v${RELEASING}`);
      const run = packageSession(sessionsDir, { config: TAG_CONFIG() });
      assert.equal(run.outcome, OUTCOME_PUBLISHED);
      // The tag IS the artifact: it is what CI consumed and what a served
      // version can be traced back to.
      assert.deepEqual(run.artifacts, [`vsix-v${RELEASING}`]);
    } finally {
      restore();
    }
  });

  // The name is not the evidence. A session whose version bump was missed
  // declares a version that was already released FROM AN EARLIER COMMIT --
  // an ordinary release mistake -- and matching on the name alone would file
  // a `published` row for work CI never saw, which is the one claim
  // `published_when_releasable` exists to make impossible.
  it("refuses a tag that names an earlier commit than the one this session landed", () => {
    const { sessionsDir, remoteTag, landedSince, restore } = taggable();
    try {
      remoteTag(`vsix-v${RELEASING}`, EARLIER_COMMIT);
      landedSince(EARLIER_COMMIT, ["packages/router/src/packaging.ts"]);
      const run = packageSession(sessionsDir, { config: TAG_CONFIG() });
      assert.equal(run.outcome, OUTCOME_REFUSED);
      assert.match(String(run.refusal), /released that commit, not this one/);
      assert.match(String(run.refusal), /stamp:version/);
      // The refusal names what shipped-and-changed, rather than prescribing
      // a bump for every reason a tag might not be HEAD.
      assert.match(String(run.refusal), /packages\/router\/src\/packaging\.ts/);
    } finally {
      restore();
    }
  });

  // `dabbler release` is a person's act placed by hand, and the land writes
  // the session's verification bookkeeping AFTER it -- so HEAD moves past
  // the tag by a commit the framework itself made, carrying nothing that
  // ships. Session 137 published 2.0.16 to the Marketplace and could then
  // never record it: eight lines of `change-log.md` and `sessions.json`
  // stood in the way, and the only remedy offered was a version bump that
  // would have shipped a new number for an artifact already built.
  it("records published when only the lifecycle's own bookkeeping followed the tag", () => {
    const { sessionsDir, remoteTag, landedSince, restore } = taggable();
    try {
      remoteTag(`vsix-v${RELEASING}`, EARLIER_COMMIT);
      landedSince(EARLIER_COMMIT, [
        "docs/sessions/change-log.md",
        "docs/sessions/sessions.json",
      ]);
      const run = packageSession(sessionsDir, { config: TAG_CONFIG() });
      assert.equal(run.outcome, OUTCOME_PUBLISHED, String(run.refusal));
      assert.deepEqual(run.artifacts, [`vsix-v${RELEASING}`]);
      // And the row it becomes is one the ledger will take. Asserting the
      // outcome alone is what let 2.0.16 and 2.0.17 reach the Marketplace
      // and be recorded as neither: `packageSession` answered `published`
      // and the append then refused the row for want of `steps`, which a
      // tag release has none of because no command runs in this process.
      assert.doesNotThrow(() => validatePackaging(runAsRecord(run)));
      assert.deepEqual(runAsRecord(run)["steps"], []);
    } finally {
      restore();
    }
  });

  // Ancestry is what keeps round 3's finding answered once equality is
  // relaxed: a tag off this history is not an earlier state of this work,
  // however little appears to have changed since it.
  it("refuses a tag on a commit this work never passed through", () => {
    const { sessionsDir, remoteTag, restore } = taggable();
    try {
      remoteTag(`vsix-v${RELEASING}`, EARLIER_COMMIT);
      const run = packageSession(sessionsDir, { config: TAG_CONFIG() });
      assert.equal(run.outcome, OUTCOME_REFUSED);
      assert.match(String(run.refusal), /not an ancestor of HEAD/);
    } finally {
      restore();
    }
  });

  // An annotated tag -- the kind `dabbler release` makes -- answers on two
  // lines, and only the peeled one is a commit. A reader that took the first
  // would compare a tag object to HEAD and refuse every real release.
  it("reads the commit off an annotated tag's peeled ref", () => {
    const answer = [
      `${"f0f0f0f0".repeat(5)}\trefs/tags/vsix-v1.0.0`,
      `${EARLIER_COMMIT}\trefs/tags/vsix-v1.0.0^{}`,
    ].join("\n");
    assert.equal(taggedCommit(answer, "vsix-v1.0.0"), EARLIER_COMMIT);
    // A lightweight tag answers on one line, which already is the commit.
    assert.equal(
      taggedCommit(`${EARLIER_COMMIT}\trefs/tags/vsix-v1.0.0`, "vsix-v1.0.0"),
      EARLIER_COMMIT,
    );
    assert.equal(taggedCommit("", "vsix-v1.0.0"), null);
  });

  // There is one version and a tag names it, so a repository whose manifests
  // disagree has no version to tag. It is refused before origin is asked at
  // all: the alternative is a tag that names one of two numbers.
  it("refuses when the manifests do not agree on a version", () => {
    const { sessionsDir, remoteTag, restore } = taggable("9.9.9");
    try {
      remoteTag(`vsix-v${RELEASING}`);
      const run = packageSession(sessionsDir, { config: TAG_CONFIG() });
      assert.equal(run.outcome, OUTCOME_REFUSED);
      assert.match(String(run.refusal), /stamp:version/);
    } finally {
      restore();
    }
  });
});

describe("the publication", () => {
  it("packs once and pushes once per artifact, into the run directory", () => {
    const { repo, sessionsDir, pushLog } = publishable();
    const run = packageSession(sessionsDir, {
      config: packagingConfig(pushLog, { artifacts: ["a-1.0.nupkg", "b-1.0.nupkg"] }),
    });
    assert.equal(run.outcome, OUTCOME_PUBLISHED, String(run.refusal));
    assert.deepEqual(run.artifacts, ["a-1.0.nupkg", "b-1.0.nupkg"]);
    // The same files, compared as the filesystem names them: the push is
    // handed the path the framework resolved, and a fixture that reached its
    // repository through an alias spells the same directory another way.
    assert.deepEqual(
      pushes(pushLog).map((row) => canonicalPath(row.argv[0] as string)),
      run.artifacts.map((name) => canonicalPath(join(packageOutputDir(repo, 1), name))),
    );
    assert.deepEqual(
      run.steps.map((step) => step.step),
      ["pack", "push", "push"],
    );
    // The tree that was verified stays the tree that was verified.
    assert.equal(run.treeDigest, snapshotWorktreeTree(repo));
  });

  it("does not publish a stale artifact from a previous run", () => {
    const { repo, sessionsDir, pushLog } = publishable();
    const output = packageOutputDir(repo, 1);
    mkdirSync(output, { recursive: true });
    writeFileSync(join(output, "last-week-9.9.nupkg"), "old", "utf8");
    const run = packageSession(sessionsDir, { config: packagingConfig(pushLog) });
    assert.deepEqual(run.artifacts, ["thing-1.0.nupkg"]);
    assert.equal(existsSync(join(output, "last-week-9.9.nupkg")), false);
  });

  it("refuses a pack that produced nothing rather than reporting published", () => {
    const { sessionsDir, pushLog } = publishable();
    const run = packageSession(sessionsDir, {
      config: packagingConfig(pushLog, { artifacts: [] }),
    });
    assert.equal(run.outcome, OUTCOME_REFUSED);
    assert.match(String(run.refusal), /nothing to push/);
    assert.equal(existsSync(pushLog), false);
  });

  it("publishes nothing from a pack that dirtied the repository", () => {
    // A build that leaves intermediates behind has produced artifacts from a
    // tree nobody verified. The exit code says it worked; the tree says the
    // result is not about the code that was reviewed, and the tree wins --
    // the same rule a check that mutates its own subject gets.
    const { repo, sessionsDir, pushLog } = publishable();
    const run = packageSession(sessionsDir, {
      config: packagingConfig(pushLog, {
        packArgv: [process.execPath, "-e", DIRTY_PACK_SRC, "{output}", join(repo, "obj.log")],
      }),
    });
    assert.equal(run.outcome, OUTCOME_FAILED);
    assert.equal(run.treeMutated, true);
    assert.notEqual(run.postTreeDigest, run.treeDigest);
    assert.equal(existsSync(pushLog), false);
  });

  it("stops the release at the first rejected push", () => {
    // A feed holding half a release beside a record claiming it published is
    // worse than a failure that stopped where it stopped. CI is on the
    // child-environment allowlist, so the stub exits on it.
    process.env["CI"] = "1";
    const { sessionsDir, pushLog } = publishable();
    const run = packageSession(sessionsDir, {
      config: packagingConfig(pushLog, { artifacts: ["a-1.0.nupkg", "b-1.0.nupkg"] }),
    });
    assert.equal(run.outcome, OUTCOME_FAILED);
    assert.deepEqual(
      run.steps.map((step) => step.step),
      ["pack", "push"],
    );
    assert.equal(pushes(pushLog).length, 1);
  });

  it("records a command that could not start as a failed step", () => {
    // "dotnet is not installed on this machine" belongs in the record beside
    // the command that needed it, not as a crash.
    const { sessionsDir, pushLog } = publishable();
    const run = packageSession(sessionsDir, {
      config: packagingConfig(pushLog, { packArgv: ["definitely-not-a-program-here", "{output}"] }),
    });
    assert.equal(run.outcome, OUTCOME_FAILED);
    assert.equal(run.steps[0]?.exitCode, null);
    assert.match(String(run.steps[0]?.output), /could not start/);
  });
});

// --- The credential -------------------------------------------------------------

describe("the credential", () => {
  it("reaches the command and no environment", () => {
    // The PAT is substituted into one argv element. The child's environment
    // is the allowlist, so neither the credential nor the operator's other
    // secrets are inherited.
    process.env["DABBLER_ANTHROPIC_API_KEY"] = "sk-should-not-travel";
    try {
      const { sessionsDir, pushLog } = publishable();
      const run = packageSession(sessionsDir, { config: packagingConfig(pushLog) });
      assert.equal(run.outcome, OUTCOME_PUBLISHED, String(run.refusal));
      const row = pushes(pushLog)[0]!;
      assert.equal(row.argv[2], SECRET_VALUE);
      assert.ok(!row.env.includes(SECRET_ENV));
      assert.ok(!row.env.includes("DABBLER_ANTHROPIC_API_KEY"));
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
    assert.match(String(pushStep?.command), /\{secret\}/);
    assert.match(String(pushStep?.output), /pushing with token \{secret\}/);
    assert.ok(!JSON.stringify(runAsRecord(run)).includes(SECRET_VALUE));
  });

  it("leaves a credential too short to scrub in the output as itself", () => {
    // A one- or two-character "secret" would match inside ordinary words and
    // turn the record into redaction confetti. A credential that short is a
    // misconfiguration the record should show plainly.
    assert.equal(redact("a short pat", "short"), "a short pat");
    assert.equal(redact(`echo ${SECRET_VALUE}`, SECRET_VALUE), "echo {secret}");
  });
});

// --- The record -----------------------------------------------------------------

describe("the record", () => {
  it("appends refusals and publications to one validated ledger", () => {
    // A record holding only the successes cannot be read as a history of what
    // was released, so a refusal files beside a publication.
    const { repo, sessionsDir, pushLog } = publishable();
    delete process.env[SECRET_ENV];
    record(sessionsDir, packageSession(sessionsDir, { config: packagingConfig(pushLog) }));
    process.env[SECRET_ENV] = SECRET_VALUE;
    record(sessionsDir, packageSession(sessionsDir, { config: packagingConfig(pushLog) }));
    const rows = readPackaging(repo, 1);
    assert.deepEqual(
      rows.map((row) => row["outcome"]),
      [OUTCOME_REFUSED, OUTCOME_PUBLISHED],
    );
    assert.equal(rows[rows.length - 1]?.["feed"], FEED);
    assert.equal(rows[rows.length - 1]?.["secret_name"], SECRET_ENV);
  });

  it("shows the gates, runs nothing, and refuses to file a dry run", () => {
    // A rehearsal is not an attempt, and a ledger that carried them could not
    // be read as a history of what was released.
    const { repo, sessionsDir, pushLog } = publishable();
    const run = packageSession(sessionsDir, {
      config: packagingConfig(pushLog),
      dryRun: true,
    });
    assert.equal(run.ready, true);
    // Every close gate but published_when_releasable, which the rehearsal
    // leaves unasked: eight since the pins and the exposure joined them.
    assert.deepEqual(
      run.gates.map((gate) => gate.passed),
      [true, true, true, true, true, true, true, true],
    );
    assert.equal(existsSync(pushLog), false);
    assert.equal(existsSync(packagingPath(repo, 1)), false);
    assert.throws(() => record(sessionsDir, run), /nothing to file/);
  });
});
