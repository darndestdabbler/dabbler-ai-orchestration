// Set 102 Session 1 — dogfood harness for the git-workflow commands.
//
// NOT part of the CI suite glob (src/test/suite/**): this file runs REAL
// git against a scratch repo and is invoked explicitly:
//
//   npx mocha --require ts-node/register --require ./src/test/vscode-stub.js \
//     --ui tdd --timeout 120000 src/test/dogfood/gitWorkflow.dogfood.ts
//
// What it proves (the parts of the spec's dogfood that need no live
// host): the REAL defaultRunner + real git executing the full loop —
// push a session branch from a worktree (Open PR flow, CLI-absent
// degradation floor), simulate the host-side merge, then Finalize
// (pull --ff-only, worktree remove, branch -d, fetch --prune) and
// assert the local end-state. Host detection runs against a real
// github-shaped remote URL; the actual network push lands in a local
// bare repo via git's url.<base>.insteadOf rewrite.
//
// What it deliberately does NOT prove: a real `gh`/`az` PR creation —
// that is the operator-assisted live walk (armed UAT; Azure DevOps is
// the priority host).

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

const REMOTE_URL = "https://github.com/acme/dogfood-orders.git";

function sh(cwd: string, ...args: string[]): string {
  return cp
    .execFileSync("git", args, { cwd, encoding: "utf8", windowsHide: true })
    .trim();
}

function makeUi(root: string) {
  const infos: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const opened: string[] = [];
  const ui: GitWorkflowUi = {
    confirm: async () => true,
    showInputBox: (async () => "Dogfood PR title") as never,
    showQuickPickLabels: async (labels) => labels[0]?.label,
    showInfo: (m) => infos.push(m),
    showWarning: (m) => warnings.push(m),
    showError: (m) => errors.push(m),
    openExternal: async (url) => {
      opened.push(url);
    },
    workspaceRoot: () => root,
  };
  return { ui, infos, warnings, errors, opened };
}

suite("dogfood — git-workflow commands against a real scratch repo", function () {
  this.timeout(120000);

  let tmp: string;
  let bare: string;
  let primary: string;
  let worktree: string;

  suiteSetup(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-gitwf-"));
    bare = path.join(tmp, "remote.git");
    primary = path.join(tmp, "primary");
    worktree = path.join(tmp, "primary-worktrees", "102-x");

    cp.execFileSync("git", ["init", "--bare", "-b", "main", bare], { windowsHide: true });
    cp.execFileSync("git", ["clone", bare, primary], { windowsHide: true });
    sh(primary, "config", "user.email", "dogfood@example.com");
    sh(primary, "config", "user.name", "Dogfood");
    sh(primary, "checkout", "-b", "main");
    fs.writeFileSync(path.join(primary, "README.md"), "hello\n");
    sh(primary, "add", ".");
    sh(primary, "commit", "-m", "initial");
    sh(primary, "push", "-u", "origin", "main");
    sh(primary, "remote", "set-head", "origin", "-a");

    // Host-shaped remote URL; the actual bytes go to the local bare repo.
    sh(primary, "config", `url.${bare}.insteadOf`, REMOTE_URL);
    sh(primary, "remote", "set-url", "origin", REMOTE_URL);

    fs.mkdirSync(path.dirname(worktree), { recursive: true });
    sh(primary, "worktree", "add", worktree, "-b", "session-set/102-x");
    fs.writeFileSync(path.join(worktree, "feature.txt"), "the work\n");
    sh(worktree, "add", ".");
    sh(worktree, "commit", "-m", "session work");
  });

  suiteTeardown(() => {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* Windows file-lock stragglers are fine in a tmpdir */
    }
  });

  test("Open PR flow (CLI-absent floor): real push lands on the remote; create-PR page offered", async () => {
    const t = makeUi(worktree);
    await runOpenPrFlow({
      ui: t.ui,
      run: defaultRunner(),
      probeCli: (() => ({ present: false, resolved: null })) as never,
      hostSetting: () => "auto",
    });
    assert.deepStrictEqual(t.errors, [], `errors: ${t.errors.join("; ")}`);
    // The push actually landed in the "remote":
    const remoteSha = sh(bare, "rev-parse", "refs/heads/session-set/102-x");
    const localSha = sh(worktree, "rev-parse", "HEAD");
    assert.strictEqual(remoteSha, localSha);
    // The degradation floor offered the real create-PR page:
    assert.ok(
      t.opened[0].startsWith(
        "https://github.com/acme/dogfood-orders/compare/main...session-set%2F102-x",
      ),
      t.opened[0],
    );
    assert.ok(t.warnings.some((m) => m.includes("winget install GitHub.cli")));
  });

  test("Finalize flow: after the host-side merge, pull/remove/-d/prune leave the exact end-state", async () => {
    // Simulate the operator merging the PR on the host (ff to the branch tip).
    const mergedSha = sh(worktree, "rev-parse", "HEAD");
    sh(bare, "update-ref", "refs/heads/main", mergedSha);

    const t = makeUi(primary);
    await runFinalizeMergedSetFlow({ ui: t.ui, run: defaultRunner() });
    assert.deepStrictEqual(t.errors, [], `errors: ${t.errors.join("; ")}`);
    assert.ok(t.infos.some((m) => m.includes("finalized")), t.infos.join("; "));

    // End-state assertions (spec: "assert the local end-state"):
    assert.strictEqual(sh(primary, "rev-parse", "main"), mergedSha, "trunk fast-forwarded");
    assert.ok(!fs.existsSync(worktree), "worktree directory removed");
    assert.throws(
      () => sh(primary, "rev-parse", "--verify", "refs/heads/session-set/102-x"),
      /./,
      "session branch deleted",
    );
    const worktrees = sh(primary, "worktree", "list", "--porcelain");
    assert.ok(!worktrees.includes("102-x"), "worktree unregistered");
  });

  test("Finalize is safely re-runnable: a second run finds nothing and says so", async () => {
    const t = makeUi(primary);
    await runFinalizeMergedSetFlow({ ui: t.ui, run: defaultRunner() });
    assert.deepStrictEqual(t.errors, []);
    assert.ok(t.infos[0].includes("Nothing to finalize"));
  });
});
