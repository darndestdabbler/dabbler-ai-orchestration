// Set 102 Session 1 — unit tests for the git-workflow commands
// (src/commands/gitWorkflow.ts): the pure builders (gh/az argv, the
// cmd.exe wrapping with its conservative arg validation, PR-URL
// parsing), and the two flows driven end-to-end through injected
// process/UI seams — happy path on BOTH hosts, CLI-absent degradation,
// unknown-host guidance, confirm-declined, and dirty-tree refusal
// (spec Session 1 step 6).

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import {
  GitWorkflowDeps,
  GitWorkflowUi,
  ProcessRunner,
  RunResult,
  buildAzPrCreateArgs,
  buildGhPrCreateArgs,
  buildPrTemplate,
  cmdArgProblem,
  detectTrunkBranch,
  displayCommand,
  parseAzPrUrl,
  parseGhPrUrl,
  runFinalizeMergedSetFlow,
  runOpenPrFlow,
  toRunnableInvocation,
} from "../../commands/gitWorkflow";
import { GitHostInfo } from "../../utils/gitHost";

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
  inputValue?: string;
  quickPick?: (labels: string[]) => string | undefined;
}

function makeUi(script: UiScript) {
  const confirms: Array<{ message: string; detail: string; button: string }> = [];
  const errors: string[] = [];
  const infos: string[] = [];
  const warnings: string[] = [];
  const opened: string[] = [];
  const answers = [...(script.confirmAnswers ?? [true])];
  const ui: GitWorkflowUi = {
    confirm: async (message, detail, button) => {
      confirms.push({ message, detail, button });
      return answers.length ? (answers.shift() as boolean) : true;
    },
    showInputBox: (async () => script.inputValue ?? "Session set 102-x") as never,
    showQuickPickLabels: async (labels) =>
      script.quickPick
        ? script.quickPick(labels.map((l) => l.label))
        : labels[0]?.label,
    showInfo: (m) => infos.push(m),
    showWarning: (m) => warnings.push(m),
    showError: (m) => errors.push(m),
    openExternal: async (url) => {
      opened.push(url);
    },
    workspaceRoot: () => script.root ?? "/repo",
  };
  return { ui, confirms, errors, infos, warnings, opened };
}

const GITHUB_INFO: GitHostInfo = {
  kind: "github",
  host: "github.com",
  owner: "acme",
  repo: "orders",
};
const ADO_INFO: GitHostInfo = {
  kind: "azure-devops",
  host: "dev.azure.com",
  owner: "acme",
  project: "Platform",
  repo: "orders",
};

// ---------- pure builders ----------

suite("gitWorkflow — cmd-shim arg validation + wrapping", () => {
  test("plain args are safe", () => {
    assert.strictEqual(cmdArgProblem("session-set/102-x"), null);
    assert.strictEqual(cmdArgProblem("A title with spaces."), null);
  });

  for (const bad of ['"', "^", "&", "|", "<", ">", "%", "!", "\n"]) {
    test(`rejects ${JSON.stringify(bad)}`, () => {
      assert.notStrictEqual(cmdArgProblem(`title ${bad} tail`), null);
    });
  }

  test(".cmd on win32 wraps through cmd.exe /d /s /c with quoted args", () => {
    const inv = toRunnableInvocation(
      "C:\\azure\\az.cmd",
      ["repos", "pr", "create", "--title", "My title"],
      "win32",
    );
    assert.strictEqual(inv.file, "cmd.exe");
    assert.deepStrictEqual(inv.args.slice(0, 3), ["/d", "/s", "/c"]);
    assert.ok(inv.args[3].includes('"C:\\azure\\az.cmd" "repos" "pr" "create" "--title" "My title"'));
    assert.strictEqual(inv.windowsVerbatimArguments, true);
    assert.ok(inv.display.includes("az.cmd"));
  });

  test(".cmd wrapping throws on an unsafe arg BEFORE anything runs", () => {
    assert.throws(
      () => toRunnableInvocation("C:\\azure\\az.cmd", ["--title", "50% faster"], "win32"),
      /cannot be passed safely/,
    );
  });

  test(".exe on win32 passes through shell-free with no validation needed", () => {
    const inv = toRunnableInvocation("C:\\tools\\gh.exe", ["--title", "50% & more"], "win32");
    assert.strictEqual(inv.file, "C:\\tools\\gh.exe");
    assert.deepStrictEqual(inv.args, ["--title", "50% & more"]);
  });

  test("POSIX passes through as-is even for weird names", () => {
    const inv = toRunnableInvocation("/usr/bin/az", ["--title", "a|b"], "linux");
    assert.strictEqual(inv.file, "/usr/bin/az");
  });

  test("displayCommand quotes args with spaces", () => {
    assert.strictEqual(
      displayCommand("/usr/bin/gh", ["pr", "create", "--title", "Two words"]),
      'gh pr create --title "Two words"',
    );
  });
});

suite("gitWorkflow — PR command builders and URL parsers", () => {
  test("gh argv shape", () => {
    assert.deepStrictEqual(
      buildGhPrCreateArgs("session-set/102-x", "main", "T", "B1\nB2"),
      ["pr", "create", "--head", "session-set/102-x", "--base", "main", "--title", "T", "--body", "B1\nB2"],
    );
  });

  test("az argv derives org/project/repo from the parsed remote (no az defaults needed)", () => {
    const args = buildAzPrCreateArgs(ADO_INFO, "session-set/102-x", "main", "T", ["L1", "L2"]);
    assert.ok(args);
    const joined = args!.join(" ");
    assert.ok(joined.includes("--organization https://dev.azure.com/acme"));
    assert.ok(joined.includes("--project Platform"));
    assert.ok(joined.includes("--repository orders"));
    assert.ok(joined.includes("--source-branch session-set/102-x"));
    assert.ok(joined.includes("--target-branch main"));
    assert.ok(joined.includes("--description L1 L2"));
    assert.ok(joined.includes("--output json"));
  });

  test("az argv is null without a project (never a malformed command)", () => {
    assert.strictEqual(
      buildAzPrCreateArgs(GITHUB_INFO, "b", "main", "T", []),
      null,
    );
  });

  test("gh URL parse takes the last https URL in stdout", () => {
    assert.strictEqual(
      parseGhPrUrl("Creating pull request...\nhttps://github.com/acme/orders/pull/7\n"),
      "https://github.com/acme/orders/pull/7",
    );
    assert.strictEqual(parseGhPrUrl("no url here"), null);
  });

  test("az URL parse builds the web URL from pullRequestId", () => {
    assert.strictEqual(
      parseAzPrUrl('{"pullRequestId": 42, "status": "active"}', ADO_INFO),
      "https://dev.azure.com/acme/Platform/_git/orders/pullrequest/42",
    );
    assert.strictEqual(parseAzPrUrl("not json", ADO_INFO), null);
    assert.strictEqual(parseAzPrUrl('{"pullRequestId": "42"}', ADO_INFO), null);
  });

  test("PR template links the session set for session-set/* branches", () => {
    const t = buildPrTemplate("session-set/102-git-workflow-automation");
    assert.strictEqual(t.title, "Session set 102-git-workflow-automation");
    assert.ok(t.bodyLines[0].includes("docs/session-sets/102-git-workflow-automation/"));
    const other = buildPrTemplate("hotfix/thing");
    assert.strictEqual(other.title, "hotfix/thing");
  });
});

suite("gitWorkflow — detectTrunkBranch", () => {
  test("origin/HEAD wins", async () => {
    const { run } = makeRunner([
      [/symbolic-ref --short refs\/remotes\/origin\/HEAD/, { stdout: "origin/trunk\n" }],
    ]);
    assert.strictEqual(await detectTrunkBranch(run, "/repo"), "trunk");
  });

  test("falls back to local main, then master", async () => {
    const { run } = makeRunner([
      [/symbolic-ref/, { code: 1 }],
      [/show-ref --verify --quiet refs\/heads\/main/, { code: 1 }],
      [/show-ref --verify --quiet refs\/heads\/master/, { code: 0 }],
    ]);
    assert.strictEqual(await detectTrunkBranch(run, "/repo"), "master");
  });
});

// ---------- Open PR flow ----------

function openPrDeps(
  remote: string,
  branch: string,
  opts: {
    ui?: UiScript;
    probe?: { present: boolean; resolved: string | null };
    extraHandlers?: Array<[RegExp, Partial<RunResult>]>;
    dirty?: boolean;
  } = {},
) {
  const uiBundle = makeUi(opts.ui ?? {});
  const { run, calls } = makeRunner([
    ...(opts.extraHandlers ?? []),
    [/^git (config --get remote\.origin\.url|remote get-url origin)$/, { stdout: `${remote}\n` }],
    [/^git rev-parse --abbrev-ref HEAD$/, { stdout: `${branch}\n` }],
    [/symbolic-ref --short refs\/remotes\/origin\/HEAD/, { stdout: "origin/main\n" }],
    [/^git status --porcelain$/, { stdout: opts.dirty ? " M x.ts\n" : "" }],
  ]);
  const deps: GitWorkflowDeps = {
    ui: uiBundle.ui,
    run,
    probeCli: (() =>
      opts.probe ?? { present: true, resolved: "/usr/bin/gh" }) as never,
    hostSetting: () => "auto",
    fileExists: () => true,
  };
  return { deps, calls, ...uiBundle };
}

suite("gitWorkflow — Open PR flow", () => {
  test("GitHub happy path: confirm shows both commands; push then gh pr create; URL reported + opened", async () => {
    const t = openPrDeps("https://github.com/acme/orders.git", "session-set/102-x", {
      extraHandlers: [
        [/gh pr create/, { stdout: "https://github.com/acme/orders/pull/7\n" }],
      ],
    });
    await runOpenPrFlow(t.deps);
    assert.deepStrictEqual(t.errors, []);
    const gate = t.confirms.find((c) => c.button === "Push + create PR");
    assert.ok(gate, "the push/PR confirm gate fired");
    assert.ok(gate!.detail.includes("git push -u origin session-set/102-x"));
    assert.ok(gate!.detail.includes("pr create"));
    assert.ok(t.calls.some((c) => c.file === "git" && c.args[0] === "push"));
    const ghCall = t.calls.find((c) => c.file === "/usr/bin/gh");
    assert.ok(ghCall, "gh was invoked");
    assert.deepStrictEqual(ghCall!.args.slice(0, 2), ["pr", "create"]);
    assert.ok(t.infos.some((m) => m.includes("pull/7")));
    assert.deepStrictEqual(t.opened, ["https://github.com/acme/orders/pull/7"]);
  });

  test("Azure DevOps happy path: az repos pr create with derived coordinates; PR URL from JSON id", async () => {
    const t = openPrDeps(
      "https://dev.azure.com/acme/Platform/_git/orders",
      "session-set/102-x",
      {
        probe: { present: true, resolved: "/usr/bin/az" },
        extraHandlers: [
          [/az repos pr create/, { stdout: '{"pullRequestId": 42}\n' }],
        ],
      },
    );
    await runOpenPrFlow(t.deps);
    assert.deepStrictEqual(t.errors, []);
    const azCall = t.calls.find((c) => c.file === "/usr/bin/az");
    assert.ok(azCall, "az was invoked");
    const joined = azCall!.args.join(" ");
    assert.ok(joined.includes("--organization https://dev.azure.com/acme"));
    assert.ok(joined.includes("--project Platform"));
    assert.ok(
      t.infos.some((m) =>
        m.includes("https://dev.azure.com/acme/Platform/_git/orders/pullrequest/42"),
      ),
    );
  });

  test("CLI absent: push still runs, browser create-PR page opens, install guidance shown (never a hard failure)", async () => {
    const t = openPrDeps(
      "https://dev.azure.com/acme/Platform/_git/orders",
      "session-set/102-x",
      { probe: { present: false, resolved: null } },
    );
    await runOpenPrFlow(t.deps);
    assert.deepStrictEqual(t.errors, []);
    assert.ok(t.calls.some((c) => c.file === "git" && c.args[0] === "push"));
    assert.ok(t.opened[0].includes("/pullrequestcreate?sourceRef=session-set%2F102-x"));
    assert.ok(t.warnings.some((m) => m.includes("winget install Microsoft.AzureCLI")));
  });

  test("confirm declined: nothing touches the remote", async () => {
    const t = openPrDeps("https://github.com/acme/orders.git", "session-set/102-x", {
      ui: { confirmAnswers: [false] },
    });
    await runOpenPrFlow(t.deps);
    assert.ok(!t.calls.some((c) => c.args[0] === "push"), "no push ran");
    assert.deepStrictEqual(t.opened, []);
  });

  test("unknown host: guidance names the gitHost setting; no push", async () => {
    const t = openPrDeps("https://ghe.example.corp/acme/orders.git", "session-set/102-x");
    await runOpenPrFlow(t.deps);
    assert.ok(t.errors[0].includes("dabblerSessionSets.gitHost"));
    assert.ok(!t.calls.some((c) => c.args[0] === "push"));
  });

  test("on the trunk: refused", async () => {
    const t = openPrDeps("https://github.com/acme/orders.git", "main");
    await runOpenPrFlow(t.deps);
    assert.ok(t.errors[0].includes("trunk"));
  });

  test("dirty tree: warned first; declining stops before anything runs", async () => {
    const t = openPrDeps("https://github.com/acme/orders.git", "session-set/102-x", {
      dirty: true,
      ui: { confirmAnswers: [false] },
    });
    await runOpenPrFlow(t.deps);
    assert.strictEqual(t.confirms[0].message, "Uncommitted changes");
    assert.ok(!t.calls.some((c) => c.args[0] === "push"));
  });

  test("push failure surfaces stderr and stops (no PR attempt)", async () => {
    const t = openPrDeps("https://github.com/acme/orders.git", "session-set/102-x", {
      extraHandlers: [[/^git push -u origin/, { code: 1, stderr: "remote: denied\n" }]],
    });
    await runOpenPrFlow(t.deps);
    assert.ok(t.errors[0].includes("remote: denied"));
    assert.ok(!t.calls.some((c) => c.file === "/usr/bin/gh"));
  });

  test("PR-command failure degrades to the browser page with an auth hint", async () => {
    const t = openPrDeps("https://github.com/acme/orders.git", "session-set/102-x", {
      extraHandlers: [[/gh pr create/, { code: 1, stderr: "HTTP 401" }]],
    });
    await runOpenPrFlow(t.deps);
    assert.ok(t.errors[0].includes("HTTP 401"));
    assert.ok(t.errors[0].includes("gh auth login"));
    assert.ok(t.opened[0].includes("/compare/"));
  });
});

// ---------- Finalize flow ----------

const WORKTREE_PORCELAIN = [
  "worktree /repo",
  "HEAD 1111111111111111111111111111111111111111",
  "branch refs/heads/main",
  "",
  "worktree /repo-worktrees/102-x",
  "HEAD 2222222222222222222222222222222222222222",
  "branch refs/heads/session-set/102-x",
  "",
].join("\n");

function finalizeDeps(opts: {
  ui?: UiScript;
  extraHandlers?: Array<[RegExp, Partial<RunResult>]>;
  worktreeExists?: boolean;
  porcelain?: string;
  currentBranch?: string;
  dirty?: boolean;
} = {}) {
  const uiBundle = makeUi(opts.ui ?? { root: "/repo" });
  const { run, calls } = makeRunner([
    ...(opts.extraHandlers ?? []),
    [/rev-parse --path-format=absolute --git-common-dir/, { stdout: "/repo/.git\n" }],
    [/^git worktree list --porcelain$/, { stdout: opts.porcelain ?? WORKTREE_PORCELAIN }],
    [/symbolic-ref --short refs\/remotes\/origin\/HEAD/, { stdout: "origin/main\n" }],
    [/^git rev-parse --abbrev-ref HEAD$/, { stdout: `${opts.currentBranch ?? "main"}\n` }],
    [/^git status --porcelain$/, { stdout: opts.dirty ? " M x.ts\n" : "" }],
    [/show-ref --verify --quiet refs\/heads\/session-set\/102-x/, { code: 0 }],
  ]);
  const deps: GitWorkflowDeps = {
    ui: uiBundle.ui,
    run,
    fileExists: () => opts.worktreeExists ?? true,
  };
  return { deps, calls, ...uiBundle };
}

suite("gitWorkflow — Finalize merged set flow", () => {
  test("happy path: pull → worktree remove → branch -d → fetch --prune, in order, all listed in the confirm", async () => {
    const t = finalizeDeps();
    await runFinalizeMergedSetFlow(t.deps);
    assert.deepStrictEqual(t.errors, []);
    const gate = t.confirms.find((c) => c.button === "Finalize");
    assert.ok(gate);
    for (const line of [
      "git pull --ff-only",
      "git worktree remove /repo-worktrees/102-x",
      "git branch -d session-set/102-x",
      "git fetch --prune",
    ]) {
      assert.ok(gate!.detail.includes(line), `confirm lists: ${line}`);
    }
    const order = t.calls
      .filter((c) => c.file === "git")
      .map((c) => c.args.join(" "))
      .filter((a) =>
        /^(pull --ff-only|worktree remove|branch -d|fetch --prune)/.test(a),
      );
    assert.deepStrictEqual(order, [
      "pull --ff-only",
      "worktree remove /repo-worktrees/102-x",
      "branch -d session-set/102-x",
      "fetch --prune",
    ]);
    assert.ok(t.infos.some((m) => m.includes("finalized")));
  });

  test("idempotent re-run: gone worktree prunes, gone branch reports already-deleted, flow completes", async () => {
    const t = finalizeDeps({
      worktreeExists: false,
      extraHandlers: [
        [/show-ref --verify --quiet refs\/heads\/session-set\/102-x/, { code: 1 }],
      ],
    });
    await runFinalizeMergedSetFlow(t.deps);
    assert.deepStrictEqual(t.errors, []);
    assert.ok(t.calls.some((c) => c.args.join(" ") === "worktree prune"));
    assert.ok(!t.calls.some((c) => c.args[0] === "branch"), "no branch -d attempted");
    assert.ok(t.infos.some((m) => m.includes("already")));
  });

  test("dirty tree: refused before any step", async () => {
    const t = finalizeDeps({ dirty: true });
    await runFinalizeMergedSetFlow(t.deps);
    assert.ok(t.errors[0].includes("dirty tree"));
    assert.ok(!t.calls.some((c) => c.args.join(" ") === "pull --ff-only"));
  });

  test("not on the trunk: refused with checkout guidance", async () => {
    const t = finalizeDeps({ currentBranch: "session-set/other" });
    await runFinalizeMergedSetFlow(t.deps);
    assert.ok(t.errors[0].includes("not the trunk"));
  });

  test("run from inside a linked worktree: refused, pointed at the main checkout", async () => {
    const t = finalizeDeps({ ui: { root: "/repo-worktrees/102-x" } });
    await runFinalizeMergedSetFlow(t.deps);
    assert.ok(t.errors[0].includes("main checkout"));
  });

  test("confirm declined: nothing runs", async () => {
    const t = finalizeDeps({ ui: { root: "/repo", confirmAnswers: [false] } });
    await runFinalizeMergedSetFlow(t.deps);
    assert.ok(!t.calls.some((c) => c.args.join(" ") === "pull --ff-only"));
    assert.deepStrictEqual(t.infos, []);
  });

  test("unmerged branch: -d failure stops the flow with the never-force message and re-run hint", async () => {
    const t = finalizeDeps({
      extraHandlers: [
        [/^git branch -d /, { code: 1, stderr: "error: the branch is not fully merged\n" }],
      ],
    });
    await runFinalizeMergedSetFlow(t.deps);
    assert.ok(t.errors[0].includes("not fully merged"));
    assert.ok(t.errors[0].includes("re-run"));
    assert.ok(!t.calls.some((c) => c.args.join(" ") === "fetch --prune"));
  });

  test("no worktrees, no session branches: honest nothing-to-do info", async () => {
    const t = finalizeDeps({
      porcelain: "worktree /repo\nHEAD 111\nbranch refs/heads/main\n",
      extraHandlers: [[/for-each-ref/, { stdout: "" }]],
    });
    await runFinalizeMergedSetFlow(t.deps);
    assert.ok(t.infos[0].includes("Nothing to finalize"));
  });

  test("no worktree but a merged session branch exists: branch-only cleanup path", async () => {
    const t = finalizeDeps({
      porcelain: "worktree /repo\nHEAD 111\nbranch refs/heads/main\n",
      extraHandlers: [
        [/for-each-ref/, { stdout: "session-set/102-x\n" }],
      ],
    });
    await runFinalizeMergedSetFlow(t.deps);
    assert.deepStrictEqual(t.errors, []);
    assert.ok(t.calls.some((c) => c.args.join(" ") === "branch -d session-set/102-x"));
    assert.ok(!t.calls.some((c) => c.args[0] === "worktree" && c.args[1] === "remove"));
  });
});

// ---------- command-surface pin (Layer 2) ----------

suite("gitWorkflow — package.json command surface", () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../../../package.json"), "utf8"),
  ) as {
    contributes: {
      commands: Array<{ command: string; title: string }>;
      configuration: { properties: Record<string, unknown> };
    };
  };

  test("both commands are contributed", () => {
    const ids = pkg.contributes.commands.map((c) => c.command);
    assert.ok(ids.includes("dabbler.openPrForSet"));
    assert.ok(ids.includes("dabbler.finalizeMergedSet"));
  });

  test("the dual-host settings are contributed", () => {
    const props = pkg.contributes.configuration.properties;
    for (const key of [
      "dabblerSessionSets.gitHost",
      "dabblerSessionSets.ghCliPath",
      "dabblerSessionSets.azCliPath",
    ]) {
      assert.ok(key in props, `missing setting: ${key}`);
    }
    const gitHost = props["dabblerSessionSets.gitHost"] as { enum: string[]; default: string };
    assert.deepStrictEqual(gitHost.enum, ["auto", "github", "azure-devops"]);
    assert.strictEqual(gitHost.default, "auto");
  });
});
