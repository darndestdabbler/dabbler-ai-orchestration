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
import { cpSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
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
  // Before the temp directory is made under it, not only inside the template
  // builder: a declared check runs with TEMP redirected to a scratch
  // directory of its own, so `ROOT` is a path that does not exist yet on the
  // first call in that process.
  pinGit();
  const target = mkdtempSync(join(ROOT, "walk-"));
  copyTemplate(templateFor(files, options.origin === true), target);
  return join(target, "repo");
}

// Building a repository costs a `git init`, a `git add`, a `git commit` and
// -- with an upstream -- a second init and a push: five or six processes,
// each paying creation and antivirus inspection on this host. A file that
// builds one per test paid that per test, and the packaging suite alone
// spent ninety seconds on it. One seed is built per distinct (files,
// origin) pair and every caller gets a COPY, which is a directory tree copy
// and no processes at all. The copy is private, so a test that commits into
// it cannot be seen by the next.
//
// The template's directory is a fresh temp name, never the process id: the
// temp root outlives the run, Windows reuses pids, and a worker that landed
// in a template an earlier process had built found the remote already
// added and failed before its first test.
const TEMPLATES = new Map<string, string>();

function templateFor(files: Record<string, string>, withOrigin: boolean): string {
  const key = JSON.stringify([withOrigin, files]);
  const known = TEMPLATES.get(key);
  if (known !== undefined) return known;
  pinGit();
  const target = mkdtempSync(join(ROOT, "template-"));
  const repo = join(target, "repo");
  mkdirSync(repo, { recursive: true });
  git(repo, "init", "-q");
  // A repository with no files is a legitimate seed -- it is what a project
  // looks like the moment before it is set up -- and `git commit` with
  // nothing staged fails, so there is nothing to commit.
  if (Object.keys(files).length > 0) {
    writeFiles(repo, files);
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "seed");
  }
  if (withOrigin) {
    git(target, "init", "-q", "--bare", join(target, "remote.git"));
    git(repo, "remote", "add", "origin", "../remote.git");
    git(repo, "push", "-q", "-u", "origin", "main");
  }
  TEMPLATES.set(key, target);
  return target;
}

/** A private copy of a template's `repo`, and of the remote it tracks. */
function copyTemplate(template: string, target: string): void {
  for (const name of ["repo", "remote.git"]) {
    const source = join(template, name);
    if (existsSync(source)) cpSync(source, join(target, name), { recursive: true });
  }
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
