// Set 102 Session 2 — unit tests for the release commands
// (src/commands/gitRelease.ts): the pure validators/parsers (tag &
// branch ref-format validation, tag-ref-line parsing) and the three
// flows driven end-to-end through the injected process/UI seams —
// the MANDATORY, non-bypassable release-tag confirm; the
// hotfix-from-tag and rollback-to-tag mechanics; confirm-declined and
// dirty-tree refusals; and the graceful failure surfaces (tag exists,
// unresolved ref, no origin, push-failed-after-local-create) (spec
// Session 2 step 4).

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import {
  GitReleaseDeps,
  parseTagRefLines,
  refNameProblem,
  runCutReleaseTagFlow,
  runRollBackToTagFlow,
  runStartHotfixFromTagFlow,
} from "../../commands/gitRelease";
import { GitWorkflowUi, ProcessRunner, RunResult } from "../../commands/gitWorkflow";

// ---------- test doubles ----------

interface Call {
  file: string;
  args: string[];
}

function makeRunner(
  handlers: Array<[RegExp, Partial<RunResult>]>,
): { run: ProcessRunner; calls: Call[] } {
  const calls: Call[] = [];
  const run: ProcessRunner = async (file, args) => {
    calls.push({ file, args });
    const key = `${file} ${args.join(" ")}`;
    for (const [re, res] of handlers) {
      if (re.test(key)) return { code: 0, stdout: "", stderr: "", ...res };
    }
    return { code: 0, stdout: "", stderr: "" };
  };
  return { run, calls };
}

interface UiScript {
  root?: string;
  confirmAnswers?: boolean[];
  /** Value returned by showInputBox, keyed on the input's `title`. */
  inputByTitle?: Record<string, string>;
  /** Titles for which showInputBox returns undefined (user cancelled). */
  cancelInputTitles?: string[];
  quickPick?: (labels: string[]) => string | undefined;
}

function makeUi(script: UiScript) {
  const confirms: Array<{ message: string; detail: string; button: string }> = [];
  const errors: string[] = [];
  const infos: string[] = [];
  const warnings: string[] = [];
  const answers = [...(script.confirmAnswers ?? [true])];
  const ui: GitWorkflowUi = {
    confirm: async (message, detail, button) => {
      confirms.push({ message, detail, button });
      return answers.length ? (answers.shift() as boolean) : true;
    },
    showInputBox: (async (options?: { title?: string; value?: string }) => {
      const title = options?.title ?? "";
      if (script.cancelInputTitles?.includes(title)) return undefined;
      if (script.inputByTitle && title in script.inputByTitle) return script.inputByTitle[title];
      return options?.value ?? "";
    }) as never,
    showQuickPickLabels: async (labels) =>
      script.quickPick ? script.quickPick(labels.map((l) => l.label)) : labels[0]?.label,
    showInfo: (m) => infos.push(m),
    showWarning: (m) => warnings.push(m),
    showError: (m) => errors.push(m),
    openExternal: async () => {
      /* release flows never open a browser */
    },
    workspaceRoot: () => script.root ?? "/repo",
  };
  return { ui, confirms, errors, infos, warnings };
}

const TAGS_STDOUT = ["v1.2.0\tRelease 1.2.0", "v1.1.0\tRelease 1.1.0"].join("\n") + "\n";

// ---------- pure: refNameProblem ----------

suite("gitRelease — refNameProblem (tag & branch ref-format validation)", () => {
  for (const good of ["v1.2.0", "greeter-v0.1.0", "release/2026.07", "hotfix/v1.0.0", "rc1"]) {
    test(`accepts ${JSON.stringify(good)}`, () => {
      assert.strictEqual(refNameProblem(good, "tag"), null);
      assert.strictEqual(refNameProblem(good, "branch"), null);
    });
  }

  const bad: Array<[string, string]> = [
    ["", "empty"],
    ["-v1", "leading dash"],
    ["/v1", "leading slash"],
    ["v1/", "trailing slash"],
    ["v1//2", "double slash"],
    ["v1..2", "double dot"],
    ["v1@{0}", "@{"],
    ["@", "single @"],
    ["v1.", "trailing dot"],
    [".hidden", "segment starts with dot"],
    ["feat/.x", "later segment starts with dot"],
    ["v1.lock", ".lock suffix"],
    ["a b", "space"],
    ["v~1", "tilde"],
    ["v^1", "caret"],
    ["v:1", "colon"],
    ["v?1", "question mark"],
    ["v*1", "asterisk"],
    ["v[1", "open bracket"],
    ["back\\slash", "backslash"],
    ["vx", "control char"],
  ];
  for (const [name, why] of bad) {
    test(`rejects ${JSON.stringify(name)} (${why})`, () => {
      assert.notStrictEqual(refNameProblem(name, "tag"), null, `tag: ${why}`);
      assert.notStrictEqual(refNameProblem(name, "branch"), null, `branch: ${why}`);
    });
  }

  test("message names the kind", () => {
    assert.ok(refNameProblem("a b", "tag")!.includes("a tag name"));
    assert.ok(refNameProblem("a b", "branch")!.includes("a branch name"));
  });
});

// ---------- pure: parseTagRefLines ----------

suite("gitRelease — parseTagRefLines", () => {
  test("parses TAB-delimited name + subject, newest-first order preserved", () => {
    const tags = parseTagRefLines(TAGS_STDOUT);
    assert.deepStrictEqual(tags, [
      { name: "v1.2.0", subject: "Release 1.2.0" },
      { name: "v1.1.0", subject: "Release 1.1.0" },
    ]);
  });

  test("handles a name-only line (no subject) and skips blanks", () => {
    const tags = parseTagRefLines("v0.1.0\n\n  \nv0.0.1\tfirst\n");
    assert.deepStrictEqual(tags, [
      { name: "v0.1.0", subject: "" },
      { name: "v0.0.1", subject: "first" },
    ]);
  });

  test("keeps a subject that itself contains a tab", () => {
    const tags = parseTagRefLines("v1\tone\ttwo\n");
    assert.deepStrictEqual(tags, [{ name: "v1", subject: "one\ttwo" }]);
  });
});

// ---------- Cut release tag flow ----------

function cutReleaseDeps(
  opts: {
    ui?: UiScript;
    tagExists?: boolean;
    refResolves?: boolean;
    dirty?: boolean;
    noOrigin?: boolean;
    extraHandlers?: Array<[RegExp, Partial<RunResult>]>;
  } = {},
) {
  const uiBundle = makeUi(opts.ui ?? { inputByTitle: { "Release tag name": "v1.2.0" } });
  const { run, calls } = makeRunner([
    ...(opts.extraHandlers ?? []),
    [/^git remote get-url origin$/, opts.noOrigin ? { code: 1 } : { stdout: "https://github.com/acme/orders.git\n" }],
    [
      /^git rev-parse --verify --quiet refs\/tags\//,
      opts.tagExists ? { code: 0, stdout: "deadbeef\n" } : { code: 1 },
    ],
    [
      /^git log -1 --format=%h %s /,
      opts.refResolves === false ? { code: 1 } : { stdout: "abc1234 Release commit\n" },
    ],
    [/^git status --porcelain$/, { stdout: opts.dirty ? " M x.ts\n" : "" }],
  ]);
  const deps: GitReleaseDeps = { ui: uiBundle.ui, run };
  return { deps, calls, ...uiBundle };
}

suite("gitRelease — Cut release tag flow", () => {
  test("happy path: mandatory confirm lists both commands; tag -a then push origin; info reports", async () => {
    const t = cutReleaseDeps();
    await runCutReleaseTagFlow(t.deps);
    assert.deepStrictEqual(t.errors, []);
    assert.strictEqual(t.confirms.length, 1, "exactly one confirm — the release gate");
    const gate = t.confirms[0];
    assert.strictEqual(gate.button, "Create + push tag");
    // The tag is pinned to the RESOLVED sha (abc1234 from the mock), not the
    // mutable ref, and the displayed command matches what runs.
    assert.ok(gate.detail.includes('git tag -a v1.2.0 abc1234 -m "v1.2.0"'));
    assert.ok(gate.detail.includes("git push origin v1.2.0"));
    assert.ok(gate.detail.includes("resolved from HEAD"));
    const gitCalls = t.calls.filter((c) => c.file === "git").map((c) => c.args.join(" "));
    const tagIdx = gitCalls.findIndex((a) => a.startsWith("tag -a v1.2.0 abc1234 -m"));
    const pushIdx = gitCalls.indexOf("push origin v1.2.0");
    assert.ok(tagIdx >= 0, "git tag -a ran against the resolved sha");
    assert.ok(pushIdx > tagIdx, "push ran after the local tag create");
    assert.ok(t.infos.some((m) => m.includes("v1.2.0") && m.includes("pushed")));
  });

  test("confirm declined: NOTHING is created or pushed (the gate is non-bypassable)", async () => {
    const t = cutReleaseDeps({ ui: { inputByTitle: { "Release tag name": "v1.2.0" }, confirmAnswers: [false] } });
    await runCutReleaseTagFlow(t.deps);
    assert.ok(!t.calls.some((c) => c.args[0] === "tag"), "no local tag created");
    assert.ok(!t.calls.some((c) => c.args[0] === "push"), "no push");
    assert.deepStrictEqual(t.infos, []);
  });

  test("invalid tag name: refused up front, nothing runs", async () => {
    const t = cutReleaseDeps({ ui: { inputByTitle: { "Release tag name": "bad name" } } });
    await runCutReleaseTagFlow(t.deps);
    assert.ok(t.errors[0].includes("Invalid tag name"));
    assert.ok(!t.calls.some((c) => c.args[0] === "tag" || c.args[0] === "push"));
  });

  test("tag already exists: refused as immutable, no create", async () => {
    const t = cutReleaseDeps({ tagExists: true });
    await runCutReleaseTagFlow(t.deps);
    assert.ok(t.errors[0].includes("already exists"));
    assert.ok(t.errors[0].includes("immutable"));
    assert.ok(!t.calls.some((c) => c.args[0] === "tag" && c.args[1] === "-a"));
  });

  test("ref does not resolve: clear error, no create", async () => {
    const t = cutReleaseDeps({
      refResolves: false,
      ui: { inputByTitle: { "Release tag name": "v1.2.0", "Commit to tag": "nope" } },
    });
    await runCutReleaseTagFlow(t.deps);
    assert.ok(t.errors[0].includes("Could not resolve"));
    assert.ok(!t.calls.some((c) => c.args[0] === "tag" && c.args[1] === "-a"));
  });

  test("custom ref is resolved to a sha and reported as such; the tag pins the sha", async () => {
    const t = cutReleaseDeps({
      ui: { inputByTitle: { "Release tag name": "v1.2.0", "Commit to tag": "hotfix/x" } },
    });
    await runCutReleaseTagFlow(t.deps);
    assert.deepStrictEqual(t.errors, []);
    assert.ok(t.confirms[0].detail.includes("git tag -a v1.2.0 abc1234 -m"));
    assert.ok(t.confirms[0].detail.includes("resolved from hotfix/x"));
    assert.ok(
      t.calls.some((c) => c.file === "git" && c.args.join(" ").startsWith("tag -a v1.2.0 abc1234 -m")),
    );
    // The mutable ref is never handed to `git tag`.
    assert.ok(!t.calls.some((c) => c.args.join(" ").startsWith("tag -a v1.2.0 hotfix/x")));
  });

  test("no origin remote: refused before anything runs", async () => {
    const t = cutReleaseDeps({ noOrigin: true });
    await runCutReleaseTagFlow(t.deps);
    assert.ok(t.errors[0].includes("origin"));
    assert.ok(!t.calls.some((c) => c.args[0] === "tag" || c.args[0] === "push"));
  });

  test("push fails: local tag kept, error gives retry + delete recovery", async () => {
    const t = cutReleaseDeps({
      extraHandlers: [[/^git push origin /, { code: 1, stderr: "remote: rejected\n" }]],
    });
    await runCutReleaseTagFlow(t.deps);
    assert.ok(t.calls.some((c) => c.file === "git" && c.args[0] === "tag" && c.args[1] === "-a"), "local tag was created");
    assert.ok(t.errors[0].includes("created locally"));
    assert.ok(t.errors[0].includes("remote: rejected"));
    assert.ok(t.errors[0].includes("git push origin v1.2.0"));
    assert.ok(t.errors[0].includes("git tag -d v1.2.0"));
  });

  test("dirty tree: the confirm discloses uncommitted changes are NOT in the tag; still proceeds", async () => {
    const t = cutReleaseDeps({ dirty: true });
    await runCutReleaseTagFlow(t.deps);
    assert.deepStrictEqual(t.errors, []);
    assert.ok(t.confirms[0].detail.includes("NOT part of the tagged commit"));
    assert.ok(t.calls.some((c) => c.args.join(" ").startsWith("tag -a v1.2.0")));
  });

  test("tag-name input cancelled: silent no-op", async () => {
    const t = cutReleaseDeps({ ui: { cancelInputTitles: ["Release tag name"] } });
    await runCutReleaseTagFlow(t.deps);
    assert.deepStrictEqual(t.errors, []);
    assert.deepStrictEqual(t.infos, []);
    assert.ok(!t.calls.some((c) => c.args[0] === "tag"));
  });
});

// ---------- Start hotfix from tag flow ----------

function hotfixDeps(
  opts: {
    ui?: UiScript;
    noTags?: boolean;
    dirty?: boolean;
    branchExists?: boolean;
    extraHandlers?: Array<[RegExp, Partial<RunResult>]>;
  } = {},
) {
  const uiBundle = makeUi(opts.ui ?? {});
  const { run, calls } = makeRunner([
    ...(opts.extraHandlers ?? []),
    [/^git for-each-ref .* refs\/tags$/, { stdout: opts.noTags ? "" : TAGS_STDOUT }],
    [/^git status --porcelain$/, { stdout: opts.dirty ? " M x.ts\n" : "" }],
    [
      /^git rev-parse --verify --quiet refs\/heads\//,
      opts.branchExists ? { code: 0, stdout: "sha\n" } : { code: 1 },
    ],
  ]);
  const deps: GitReleaseDeps = { ui: uiBundle.ui, run };
  return { deps, calls, ...uiBundle };
}

suite("gitRelease — Start hotfix from tag flow", () => {
  test("happy path: pick tag → confirm shows switch -c → branch cut from the tag", async () => {
    const t = hotfixDeps();
    await runStartHotfixFromTagFlow(t.deps);
    assert.deepStrictEqual(t.errors, []);
    const gate = t.confirms[0];
    assert.strictEqual(gate.button, "Create hotfix branch");
    assert.ok(gate.detail.includes("git switch -c hotfix/v1.2.0 v1.2.0"));
    assert.ok(gate.detail.includes("never from the trunk"));
    assert.ok(
      t.calls.some((c) => c.file === "git" && c.args.join(" ") === "switch -c hotfix/v1.2.0 v1.2.0"),
    );
    assert.ok(t.infos.some((m) => m.includes("hotfix/v1.2.0")));
  });

  test("no tags: honest info, nothing runs", async () => {
    const t = hotfixDeps({ noTags: true });
    await runStartHotfixFromTagFlow(t.deps);
    assert.ok(t.infos[0].includes("No tags"));
    assert.ok(!t.calls.some((c) => c.args[0] === "switch"));
  });

  test("git enumeration fails (not a repo): error, NOT a misleading 'no tags'", async () => {
    const t = hotfixDeps({
      extraHandlers: [[/for-each-ref/, { code: 128, stderr: "not a git repository\n" }]],
    });
    await runStartHotfixFromTagFlow(t.deps);
    assert.ok(t.errors[0].includes("git repository"));
    assert.deepStrictEqual(t.infos, []);
    assert.ok(!t.calls.some((c) => c.args[0] === "switch"));
  });

  test("dirty tree: refused so the branch is exactly the tagged snapshot", async () => {
    const t = hotfixDeps({ dirty: true });
    await runStartHotfixFromTagFlow(t.deps);
    assert.ok(t.errors[0].includes("uncommitted changes"));
    assert.ok(!t.calls.some((c) => c.args[0] === "switch"));
  });

  test("branch already exists: refused, no switch", async () => {
    const t = hotfixDeps({ branchExists: true });
    await runStartHotfixFromTagFlow(t.deps);
    assert.ok(t.errors[0].includes("already exists"));
    assert.ok(!t.calls.some((c) => c.args[0] === "switch"));
  });

  test("invalid branch name: refused", async () => {
    const t = hotfixDeps({ ui: { inputByTitle: { "Hotfix branch name": "bad name" } } });
    await runStartHotfixFromTagFlow(t.deps);
    assert.ok(t.errors[0].includes("Invalid branch name"));
    assert.ok(!t.calls.some((c) => c.args[0] === "switch"));
  });

  test("confirm declined: no branch created", async () => {
    const t = hotfixDeps({ ui: { confirmAnswers: [false] } });
    await runStartHotfixFromTagFlow(t.deps);
    assert.ok(!t.calls.some((c) => c.args[0] === "switch"));
    assert.deepStrictEqual(t.infos, []);
  });
});

// ---------- Roll back to tag flow ----------

function rollbackDeps(
  opts: {
    ui?: UiScript;
    noTags?: boolean;
    dirty?: boolean;
    extraHandlers?: Array<[RegExp, Partial<RunResult>]>;
  } = {},
) {
  const uiBundle = makeUi(opts.ui ?? {});
  const { run, calls } = makeRunner([
    ...(opts.extraHandlers ?? []),
    [/^git for-each-ref .* refs\/tags$/, { stdout: opts.noTags ? "" : TAGS_STDOUT }],
    [/^git status --porcelain$/, { stdout: opts.dirty ? " M x.ts\n" : "" }],
    [/^git log -1 --format=%h %s /, { stdout: "abc1234 Release 1.2.0\n" }],
    [/symbolic-ref --short refs\/remotes\/origin\/HEAD/, { stdout: "origin/main\n" }],
  ]);
  const deps: GitReleaseDeps = { ui: uiBundle.ui, run };
  return { deps, calls, ...uiBundle };
}

suite("gitRelease — Roll back to tag flow", () => {
  test("happy path: confirm explains detached-HEAD redeploy + return-to-trunk; checks out the tag", async () => {
    const t = rollbackDeps();
    await runRollBackToTagFlow(t.deps);
    assert.deepStrictEqual(t.errors, []);
    const gate = t.confirms[0];
    assert.strictEqual(gate.button, "Check out tag");
    assert.ok(gate.detail.includes("git checkout v1.2.0"));
    assert.ok(gate.detail.includes("DETACHED HEAD"));
    assert.ok(gate.detail.includes("git switch main"));
    assert.ok(t.calls.some((c) => c.file === "git" && c.args.join(" ") === "checkout v1.2.0"));
    assert.ok(t.infos.some((m) => m.includes("detached HEAD") && m.includes("git switch main")));
  });

  test("no tags: honest info, nothing runs", async () => {
    const t = rollbackDeps({ noTags: true });
    await runRollBackToTagFlow(t.deps);
    assert.ok(t.infos[0].includes("No tags"));
    assert.ok(!t.calls.some((c) => c.args[0] === "checkout"));
  });

  test("git enumeration fails (not a repo): error, NOT a misleading 'no tags'", async () => {
    const t = rollbackDeps({
      extraHandlers: [[/for-each-ref/, { code: 128, stderr: "not a git repository\n" }]],
    });
    await runRollBackToTagFlow(t.deps);
    assert.ok(t.errors[0].includes("git repository"));
    assert.deepStrictEqual(t.infos, []);
    assert.ok(!t.calls.some((c) => c.args[0] === "checkout"));
  });

  test("dirty tree: refused (rollback redeploys the exact snapshot)", async () => {
    const t = rollbackDeps({ dirty: true });
    await runRollBackToTagFlow(t.deps);
    assert.ok(t.errors[0].includes("uncommitted changes"));
    assert.ok(!t.calls.some((c) => c.args[0] === "checkout"));
  });

  test("confirm declined: no checkout", async () => {
    const t = rollbackDeps({ ui: { confirmAnswers: [false] } });
    await runRollBackToTagFlow(t.deps);
    assert.ok(!t.calls.some((c) => c.args[0] === "checkout"));
    assert.deepStrictEqual(t.infos, []);
  });

  test("checkout failure surfaces stderr", async () => {
    const t = rollbackDeps({
      extraHandlers: [[/^git checkout /, { code: 1, stderr: "error: pathspec did not match\n" }]],
    });
    await runRollBackToTagFlow(t.deps);
    assert.ok(t.errors[0].includes("pathspec did not match"));
  });
});

// ---------- command-surface pin (Layer 2) ----------

suite("gitRelease — package.json command surface", () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../../../package.json"), "utf8"),
  ) as { contributes: { commands: Array<{ command: string; title: string }> } };

  test("the three release commands are contributed", () => {
    const byId = new Map(pkg.contributes.commands.map((c) => [c.command, c.title]));
    assert.strictEqual(byId.get("dabbler.cutReleaseTag"), "Cut release tag");
    assert.strictEqual(byId.get("dabbler.startHotfixFromTag"), "Start hotfix from tag");
    assert.strictEqual(byId.get("dabbler.rollBackToTag"), "Roll back to tag");
  });
});
