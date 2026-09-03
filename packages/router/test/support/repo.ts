// The one repository a walkthrough builds.
//
// A walkthrough test file builds ONE repository, walks it through its states
// in order and asserts at each milestone -- so this is the whole of what
// the rebuilt suite needs from disk: a directory, `git init`, a seed
// commit, and a bare origin when the walk needs an upstream. The git
// configuration is pinned for the process (identity, default branch, line
// endings, signing, gc), and it is pinned in `process.env` rather than only
// on this file's own calls, because the framework under test reads
// `process.env` when it spawns git.

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const ROOT = join(tmpdir(), "dabbler-router-tests");

const GIT_CONFIG =
  "[user]\n\tname = Dabbler Test\n\temail = test@example.invalid\n" +
  "[init]\n\tdefaultBranch = main\n" +
  "[core]\n\tautocrlf = false\n\tfsmonitor = false\n" +
  "[commit]\n\tgpgsign = false\n" +
  "[gc]\n\tauto = 0\n";

let pinned = false;

function pinGit(): void {
  if (pinned) return;
  mkdirSync(ROOT, { recursive: true });
  const config = join(mkdtempSync(join(ROOT, "git-env-")), "gitconfig");
  writeFileSync(config, GIT_CONFIG, "utf8");
  process.env["GIT_CONFIG_GLOBAL"] = config;
  process.env["GIT_CONFIG_NOSYSTEM"] = "1";
  pinned = true;
}

/** Run git in `repo`; throws on a non-zero exit. */
export function git(repo: string, ...args: string[]): void {
  pinGit();
  execFileSync("git", args, { cwd: repo, stdio: "ignore", windowsHide: true });
}

/** Run git in `repo` and return what it printed, trailing newline dropped. */
export function gitOut(repo: string, ...args: string[]): string {
  pinGit();
  return execFileSync("git", args, { cwd: repo, encoding: "utf8", windowsHide: true }).replace(/\n$/, "");
}

/** Write files under `root`, creating directories as needed. */
export function writeFiles(root: string, files: Record<string, string>): void {
  for (const [rel, text] of Object.entries(files)) {
    const path = join(root, ...rel.split("/"));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text, "utf8");
  }
}

/**
 * A repository with `files` committed on `main`, and when `origin` is asked
 * for, a bare remote beside it that `main` tracks. Returns the checkout.
 */
export function makeRepo(files: Record<string, string>, options: { origin?: boolean } = {}): string {
  pinGit();
  const target = mkdtempSync(join(ROOT, "walk-"));
  const repo = join(target, "repo");
  mkdirSync(repo);
  git(repo, "init", "-q");
  writeFiles(repo, files);
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "seed");
  if (options.origin) {
    git(target, "init", "-q", "--bare", join(target, "remote.git"));
    git(repo, "remote", "add", "origin", "../remote.git");
    git(repo, "push", "-q", "-u", "origin", "main");
  }
  return repo;
}

/**
 * The seed a walkthrough works over: a session plan of two, one suite with
 * its selection rules, one source file and the test that covers it.
 */
export const SANDBOX_SEED: Record<string, string> = {
  "docs/sessions/session-plan.md":
    "### Session 1 of 2: First things\n1. Register.\n2. **Build the widget.** Make it real.\n" +
    "3. Cross-provider verification.\n4. Close-out.\n\n" +
    "### Session 2 of 2: Second things\n1. Register.\n2. Polish it.\n",
  "dabbler.yaml":
    "schema_version: 1\n\ntesting:\n  suites:\n    - name: unit\n" +
    "      command: python -m pytest\n      expensive: true\n" +
    "      covers:\n        - src/\n        - tests/\n" +
    "      test_roots:\n        - tests\n      test_glob: \"test_*.py\"\n\n" +
    "  selection:\n    repo_wide:\n      - dabbler.yaml\n" +
    "    smoke:\n      - tests/test_widget.py\n    rules:\n" +
    "      - when: src/widget.py\n        select:\n          - tests/test_widget.py\n",
  "src/widget.py": "def widget():\n    return 1\n",
  "tests/test_widget.py": "def test_widget():\n    assert True\n",
  ".gitignore": ".dabbler/\n",
};

/** That seed as a repository with an upstream, and where its sessions live. */
export function makeSandbox(
  extra: Record<string, string> = {},
): { repo: string; sessionsDir: string } {
  const repo = makeRepo({ ...SANDBOX_SEED, ...extra }, { origin: true });
  return { repo, sessionsDir: join(repo, "docs", "sessions") };
}
