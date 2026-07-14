// Set 102 Session 2 — dogfood harness for the release commands.
//
// NOT part of the CI suite glob (src/test/suite/**): this file runs REAL
// git against a scratch repo and is invoked explicitly:
//
//   npx mocha --require ts-node/register --require ./src/test/vscode-stub.js \
//     --ui tdd --timeout 120000 src/test/dogfood/gitRelease.dogfood.ts
//
// What it proves: the REAL defaultRunner + real git executing the exact
// Part-10 tutorial drills against a real repo + local bare "remote" —
//   1. Cut release tag: an ANNOTATED tag is created AND pushed to origin.
//   2. Start hotfix from tag: after main has moved on, the hotfix branch
//      is cut from the TAGGED commit (the deployed snapshot), NOT main's
//      tip — the invariant the tutorial stresses.
//   3. Roll back to tag: `git checkout <tag>` lands a detached HEAD at the
//      tagged commit (redeploy the previous tag, not git surgery).
//   4. The immutability guard: re-cutting an existing tag is refused
//      against real git (no churn on the remote).
//
// Everything here is pure git, so — unlike Session 1's Open-PR drill —
// there is no host CLI and no live-host walk to defer.

import * as assert from "assert";
import * as cp from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  GitWorkflowUi,
  defaultRunner,
} from "../../commands/gitWorkflow";
import {
  runCutReleaseTagFlow,
  runRollBackToTagFlow,
  runStartHotfixFromTagFlow,
} from "../../commands/gitRelease";

function sh(cwd: string, ...args: string[]): string {
  return cp
    .execFileSync("git", args, { cwd, encoding: "utf8", windowsHide: true })
    .trim();
}

function makeUi(root: string, inputByTitle: Record<string, string> = {}) {
  const infos: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const ui: GitWorkflowUi = {
    confirm: async () => true,
    showInputBox: (async (options?: { title?: string; value?: string }) => {
      const title = options?.title ?? "";
      if (title in inputByTitle) return inputByTitle[title];
      return options?.value ?? "";
    }) as never,
    showQuickPickLabels: async (labels) => labels[0]?.label,
    showInfo: (m) => infos.push(m),
    showWarning: (m) => warnings.push(m),
    showError: (m) => errors.push(m),
    openExternal: async () => {
      /* release flows never open a browser */
    },
    workspaceRoot: () => root,
  };
  return { ui, infos, warnings, errors };
}

suite("dogfood — release commands against a real scratch repo", function () {
  this.timeout(120000);

  let tmp: string;
  let bare: string;
  let primary: string;
  let taggedSha: string;

  suiteSetup(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-gitrel-"));
    bare = path.join(tmp, "remote.git");
    primary = path.join(tmp, "primary");

    cp.execFileSync("git", ["init", "--bare", "-b", "main", bare], { windowsHide: true });
    cp.execFileSync("git", ["clone", bare, primary], { windowsHide: true });
    sh(primary, "config", "user.email", "dogfood@example.com");
    sh(primary, "config", "user.name", "Dogfood");
    sh(primary, "checkout", "-b", "main");
    fs.writeFileSync(path.join(primary, "app.txt"), "v1\n");
    sh(primary, "add", ".");
    sh(primary, "commit", "-m", "release commit");
    sh(primary, "push", "-u", "origin", "main");
    sh(primary, "remote", "set-head", "origin", "-a");
    taggedSha = sh(primary, "rev-parse", "HEAD");
  });

  suiteTeardown(() => {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* Windows file-lock stragglers are fine in a tmpdir */
    }
  });

  test("Cut release tag: an annotated tag is created AND pushed to origin", async () => {
    const t = makeUi(primary, {
      "Release tag name": "v0.1.0",
      "Commit to tag": "HEAD",
      "Tag annotation message": "release 0.1.0",
    });
    await runCutReleaseTagFlow({ ui: t.ui, run: defaultRunner() });
    assert.deepStrictEqual(t.errors, [], t.errors.join("; "));

    // Local tag exists and is ANNOTATED (tutorial self-check: objecttype "tag").
    assert.strictEqual(sh(primary, "cat-file", "-t", "v0.1.0"), "tag", "annotated tag");
    assert.strictEqual(sh(primary, "rev-parse", "v0.1.0^{commit}"), taggedSha);
    // The tag actually landed on the "remote".
    assert.strictEqual(sh(bare, "rev-parse", "v0.1.0^{commit}"), taggedSha, "tag pushed to origin");
    assert.ok(t.infos.some((m) => m.includes("v0.1.0") && m.includes("pushed")));
  });

  test("Start hotfix from tag: branch is cut from the TAGGED commit, not main's advanced tip", async () => {
    // main moves on with unreleased work — the hotfix must NOT come from here.
    fs.writeFileSync(path.join(primary, "app.txt"), "v2 unreleased\n");
    sh(primary, "add", ".");
    sh(primary, "commit", "-m", "unreleased work on main");
    const mainTip = sh(primary, "rev-parse", "HEAD");
    assert.notStrictEqual(mainTip, taggedSha, "main advanced past the tag");

    const t = makeUi(primary, { "Hotfix branch name": "hotfix/v0.1.0" });
    await runStartHotfixFromTagFlow({ ui: t.ui, run: defaultRunner() });
    assert.deepStrictEqual(t.errors, [], t.errors.join("; "));

    assert.strictEqual(sh(primary, "rev-parse", "--abbrev-ref", "HEAD"), "hotfix/v0.1.0");
    assert.strictEqual(
      sh(primary, "rev-parse", "HEAD"),
      taggedSha,
      "hotfix branch tip is the tagged snapshot, not main",
    );
  });

  test("Roll back to tag: git checkout lands a detached HEAD at the tagged commit", async () => {
    sh(primary, "switch", "main"); // clean tree required by rollback
    const t = makeUi(primary);
    await runRollBackToTagFlow({ ui: t.ui, run: defaultRunner() });
    assert.deepStrictEqual(t.errors, [], t.errors.join("; "));

    assert.strictEqual(sh(primary, "rev-parse", "HEAD"), taggedSha, "HEAD is the tagged commit");
    // Detached HEAD: `symbolic-ref -q HEAD` exits non-zero.
    assert.throws(
      () => sh(primary, "symbolic-ref", "-q", "HEAD"),
      /./,
      "HEAD is detached at the tag",
    );
    assert.ok(t.infos.some((m) => m.includes("detached HEAD")));
  });

  test("Immutability guard: re-cutting an existing tag is refused against real git", async () => {
    const t = makeUi(primary, { "Release tag name": "v0.1.0" });
    await runCutReleaseTagFlow({ ui: t.ui, run: defaultRunner() });
    assert.ok(t.errors[0]?.includes("already exists"), t.errors.join("; "));
    // The tag on the remote is unchanged (single, still the original commit).
    assert.strictEqual(sh(bare, "rev-parse", "v0.1.0^{commit}"), taggedSha);
  });
});
