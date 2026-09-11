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
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { CATALOG_FILENAME, SOURCE_SEAT, catalogNow, setCatalogPath } from "../../src/catalog.ts";
import { setSeatSource } from "../../src/discovery.ts";
import { canonicalPath } from "../../src/journal.ts";

/**
 * The suite's temp root, in the name the framework will use for it.
 *
 * `canonicalPath` and not `tmpdir()`, and not plain `realpathSync` either.
 * On Windows the two can be different strings for one directory: a GitHub
 * runner's `TEMP` is `C:\Users\RUNNER~1\AppData\Local\Temp` -- the 8.3
 * short name, because `runneradmin` is longer than eight characters --
 * while every path the framework resolves comes back long. A test that
 * compares a path it built from this root against one the framework
 * printed then fails on CI and passes on any machine whose user name is
 * short enough, which is the worst shape a failure can have.
 *
 * This is the SAME rule the framework applies, deliberately: `journal.ts`
 * already carries it, its comment already names twelve consecutive red CI
 * runs, and only `realpathSync.native` expands a short name -- the plain
 * one leaves `RUNNER~1` exactly as it found it, which is a fix that looks
 * like a fix and changes nothing.
 */
const ROOT = join(canonicalPath(tmpdir()), "dabbler-router-tests");

/**
 * The run this process belongs to: the `node --test` that started it as a
 * worker, or the shell that ran the file alone. Every directory made under
 * the root carries it in its name, so the next run can tell whose each
 * entry is -- the workers of ONE run are separate processes sharing this
 * root for minutes, and a sweep that could not tell them apart would take
 * a template a slower worker is still copying from.
 */
const RUN = process.ppid;
const RUN_TAG = /-(\d+)-[A-Za-z0-9]{6}$/;
/**
 * The age past which an entry goes whatever its run: one whose name carries
 * no run (an older naming), or one whose run's pid some other process holds
 * now. An hour is longer than any run.
 */
const LEFTOVER_MS = 60 * 60 * 1000;
/** How long one process spends sweeping before it gets on with its tests. */
const SWEEP_BUDGET_MS = 2_000;
let swept = false;

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Whether an entry was left by a run that is over. */
function leftover(name: string, mtimeMs: number, cutoff: number): boolean {
  const tag = RUN_TAG.exec(name);
  if (tag === null) return mtimeMs < cutoff;
  const pid = Number(tag[1]);
  if (pid === RUN) return false;
  return !alive(pid) || mtimeMs < cutoff;
}

/**
 * The suite's temp root, swept once per process of what finished runs left
 * behind. Nothing else cleans it, and 17,000 entries had accumulated on the
 * operator's machine before this. Every worker sweeps for a bounded time
 * from a point of its own and ignores what it cannot remove -- an entry
 * another worker got to first, or one a lingering process still holds --
 * so a normal run's leavings go at the start of the next run and a backlog
 * goes over a few.
 */
function tempRoot(): string {
  mkdirSync(ROOT, { recursive: true });
  if (swept) return ROOT;
  swept = true;
  const cutoff = Date.now() - LEFTOVER_MS;
  const deadline = Date.now() + SWEEP_BUDGET_MS;
  let names: string[];
  try {
    names = readdirSync(ROOT);
  } catch {
    return ROOT;
  }
  const start = names.length === 0 ? 0 : process.pid % names.length;
  for (let index = 0; index < names.length && Date.now() < deadline; index += 1) {
    const name = names[(start + index) % names.length] as string;
    const path = join(ROOT, name);
    try {
      if (leftover(name, statSync(path).mtimeMs, cutoff)) rmSync(path, { recursive: true, force: true });
    } catch {
      // Gone already, or held by a process that outlived its run.
    }
  }
  return ROOT;
}

/** A fresh directory under the root, named for the run that made it. */
export function scratchDir(prefix: string): string {
  return mkdtempSync(join(tempRoot(), `${prefix}${RUN}-`));
}

// The model catalog is user-level, so its default path is the machine's own.
// Every worker that reaches this module gets one under the suite's temp root
// instead: a test that read the operator's catalog would pass here and fail
// on a machine with a different seat, and a test that WROTE it would edit
// the operator's record as a side effect of proving something else.
// `currentCatalogPath` refuses the machine's path under the test runner, so
// a worker that reaches the catalog without this arming fails with the
// reason rather than quietly writing home -- which is how the two suites
// that needed it were found.
setCatalogPath(join(scratchDir("catalog-"), CATALOG_FILENAME));

// And no worker opens the real seat. A session start refreshes the catalog
// for itself, through a path with no argument to pass a stand-in down, so a
// machine that happens to have the Copilot CLI installed would spawn it from
// a test about something else. This suite's machine has no seat unless a
// test says otherwise.
setSeatSource(() =>
  Promise.resolve({
    known: false,
    models: [],
    current_model_id: null,
    modes: [],
    reasoning_efforts: [],
    cli_version: null,
    read_at: catalogNow(),
    source: SOURCE_SEAT,
    reason: "this suite's machine has no seat",
  }),
);

const GIT_CONFIG =
  "[user]\n\tname = Dabbler Test\n\temail = test@example.invalid\n" +
  "[init]\n\tdefaultBranch = main\n" +
  "[core]\n\tautocrlf = false\n\tfsmonitor = false\n" +
  "[commit]\n\tgpgsign = false\n" +
  "[gc]\n\tauto = 0\n";

let pinned = false;

/**
 * Take git's third configuration channel away from the caller.
 *
 * `GIT_CONFIG_GLOBAL` and `GIT_CONFIG_NOSYSTEM` cover the files; they do not
 * cover `GIT_CONFIG_COUNT` with its `GIT_CONFIG_KEY_n`/`GIT_CONFIG_VALUE_n`
 * pairs, nor `GIT_CONFIG_PARAMETERS`, which git reports as coming from the
 * command line and which outrank every file. A parent process that sets one
 * -- an IDE or an agent harness injecting `safe.bareRepository=explicit` is
 * the measured case -- reaches straight past the pin, and eight tests that
 * write through a bare remote fail on a machine whose own git config is
 * empty. A suite that pins configuration at all has to pin this too, or its
 * result is a fact about whoever invoked it.
 */
function unpinInheritedGitConfig(): void {
  const count = Number.parseInt(process.env["GIT_CONFIG_COUNT"] ?? "", 10);
  for (let index = 0; index < (Number.isNaN(count) ? 0 : count); index += 1) {
    delete process.env[`GIT_CONFIG_KEY_${index}`];
    delete process.env[`GIT_CONFIG_VALUE_${index}`];
  }
  delete process.env["GIT_CONFIG_COUNT"];
  delete process.env["GIT_CONFIG_PARAMETERS"];
}

function pinGit(): void {
  if (pinned) return;
  const config = join(scratchDir("git-env-"), "gitconfig");
  writeFileSync(config, GIT_CONFIG, "utf8");
  process.env["GIT_CONFIG_GLOBAL"] = config;
  process.env["GIT_CONFIG_NOSYSTEM"] = "1";
  unpinInheritedGitConfig();
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
  const target = scratchDir("walk-");
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
  const target = scratchDir("template-");
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
