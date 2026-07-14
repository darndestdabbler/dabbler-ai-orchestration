// Set 102 Session 1 — LIVE GitHub dogfood for the git-workflow commands
// (the spec step-7 walk: open a REAL PR on a scratch GitHub repo, merge
// it, run finalize, assert the local end-state).
//
// Deliberately double-gated: not in the CI suite glob, AND it skips
// unless DABBLER_LIVE_DOGFOOD=1 — it creates a real private repo named
// dabbler-s102-dogfood-scratch on the authenticated gh account and
// opens/merges a real PR there. Run explicitly:
//
//   DABBLER_LIVE_DOGFOOD=1 npx mocha --require ts-node/register \
//     --require ./src/test/vscode-stub.js --ui tdd --timeout 300000 \
//     src/test/dogfood/gitWorkflow.live.dogfood.ts
//
// Requires: gh installed and `gh auth status` logged in with repo scope.
// The scratch repo is NOT auto-deleted (gh tokens usually lack the
// delete_repo scope); the teardown attempts it and otherwise prints the
// one-line cleanup command for the operator.
//
// The Azure DevOps twin of this walk is the armed operator UAT
// (102-git-workflow-automation-uat-checklist.json, Walks 1-2).

import * as assert from "assert";
import * as cp from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  GitWorkflowUi,
  defaultRunner,
  runFinalizeMergedSetFlow,
  runOpenPrFlow,
} from "../../commands/gitWorkflow";

const LIVE = process.env.DABBLER_LIVE_DOGFOOD === "1";
const REPO_NAME = "dabbler-s102-dogfood-scratch";

function run(cwd: string, file: string, args: string[]): string {
  return cp
    .execFileSync(file, args, {
      cwd,
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
    })
    .trim();
}

function makeUi(root: string) {
  const infos: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const opened: string[] = [];
  const ui: GitWorkflowUi = {
    confirm: async () => true, // the spec's dogfood pre-authorizes this scratch-repo walk
    showInputBox: (async () => "Set 102 S1 live dogfood PR") as never,
    showQuickPickLabels: async (labels) => labels[0]?.label,
    showInfo: (m) => infos.push(m),
    showWarning: (m) => warnings.push(m),
    showError: (m) => errors.push(m),
    openExternal: async (url) => {
      opened.push(url); // never actually launch a browser from the harness
    },
    workspaceRoot: () => root,
  };
  return { ui, infos, warnings, errors, opened };
}

(LIVE ? suite : suite.skip)(
  "LIVE dogfood — real GitHub PR round-trip on a scratch repo",
  function () {
    this.timeout(300000);

    let tmp: string;
    let primary: string;
    let worktree: string;
    let owner: string;
    let prUrl: string | null = null;

    suiteSetup(() => {
      tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-live-"));
      owner = run(tmp, "gh", ["api", "user", "--jq", ".login"]);
      // Fresh scratch repo; a leftover from an aborted run fails fast
      // here (create refuses to overwrite) — delete or rename it first.
      run(tmp, "gh", [
        "repo",
        "create",
        REPO_NAME,
        "--private",
        "--add-readme",
        "--clone",
      ]);
      primary = path.join(tmp, REPO_NAME);
      run(primary, "git", ["config", "user.email", "dogfood@example.com"]);
      run(primary, "git", ["config", "user.name", "Dabbler Dogfood"]);
      worktree = path.join(tmp, `${REPO_NAME}-worktrees`, "s102-live");
      fs.mkdirSync(path.dirname(worktree), { recursive: true });
      run(primary, "git", [
        "worktree",
        "add",
        worktree,
        "-b",
        "session-set/s102-live",
      ]);
      fs.writeFileSync(path.join(worktree, "live-dogfood.txt"), "the work\n");
      run(worktree, "git", ["add", "."]);
      run(worktree, "git", ["commit", "-m", "live dogfood work"]);
    });

    suiteTeardown(() => {
      try {
        fs.rmSync(tmp, { recursive: true, force: true });
      } catch {
        /* tmpdir stragglers are fine */
      }
      try {
        run(os.tmpdir(), "gh", ["repo", "delete", `${owner}/${REPO_NAME}`, "--yes"]);
        console.log(`[live-dogfood] scratch repo ${owner}/${REPO_NAME} deleted.`);
      } catch {
        console.log(
          `[live-dogfood] NOTE: could not delete the scratch repo (token ` +
            `lacks delete_repo scope?). Clean up with: gh repo delete ` +
            `${owner}/${REPO_NAME} --yes`,
        );
      }
    });

    test("Open PR flow creates a REAL pull request via gh and reports its URL", async () => {
      const t = makeUi(worktree);
      await runOpenPrFlow({
        ui: t.ui,
        run: defaultRunner(),
        // Bare "gh": resolved by CreateProcess to gh.exe on PATH — the
        // same binary `gh auth status` just validated. Injected (rather
        // than the settings-reading probe) only to keep the vscode stub
        // out of the live path.
        probeCli: (() => ({ present: true, resolved: "gh" })) as never,
        hostSetting: () => "auto",
      });
      assert.deepStrictEqual(t.errors, [], `errors: ${t.errors.join("; ")}`);
      const info = t.infos.find((m) => m.includes("PR created: "));
      assert.ok(info, `no PR-created info among: ${t.infos.join("; ")}`);
      prUrl = info!.replace("PR created: ", "").trim();
      assert.ok(
        new RegExp(`^https://github\\.com/${owner}/${REPO_NAME}/pull/\\d+$`).test(
          prUrl,
        ),
        prUrl,
      );
      const state = run(primary, "gh", [
        "pr",
        "view",
        prUrl,
        "--json",
        "state",
        "--jq",
        ".state",
      ]);
      assert.strictEqual(state, "OPEN");
      console.log(`[live-dogfood] real PR opened: ${prUrl}`);
    });

    test("after a REAL merge on GitHub, Finalize leaves the exact end-state", async () => {
      assert.ok(prUrl, "PR URL from the previous test");
      run(primary, "gh", ["pr", "merge", prUrl!, "--merge"]);

      const t = makeUi(primary);
      await runFinalizeMergedSetFlow({ ui: t.ui, run: defaultRunner() });
      assert.deepStrictEqual(t.errors, [], `errors: ${t.errors.join("; ")}`);
      assert.ok(t.infos.some((m) => m.includes("finalized")), t.infos.join("; "));

      const localMain = run(primary, "git", ["rev-parse", "main"]);
      const remoteMain = run(primary, "git", ["rev-parse", "origin/main"]);
      assert.strictEqual(localMain, remoteMain, "trunk fast-forwarded to the merge");
      assert.ok(!fs.existsSync(worktree), "worktree directory removed");
      assert.throws(
        () => run(primary, "git", ["rev-parse", "--verify", "refs/heads/session-set/s102-live"]),
        /./,
        "session branch deleted",
      );
      const state = run(primary, "gh", [
        "pr",
        "view",
        prUrl!,
        "--json",
        "state",
        "--jq",
        ".state",
      ]);
      assert.strictEqual(state, "MERGED");
      console.log(`[live-dogfood] merged + finalized; main=${localMain}`);
    });
  },
);
