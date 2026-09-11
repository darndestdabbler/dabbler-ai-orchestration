// `dabbler bootstrap` -- set a consumer project up to run the session
// workflow.
//
// **One effect reaches outside the project**, and it is kept deliberately:
// the `.gitignore` rewrite, because a tracked run ledger makes verified work
// look like it changed after verification.
//
// **Nothing here writes the operator's environment.** It used to persist
// `DABBLER_TRANSPORT` at user scope, and that variable outranks every config
// layer -- so a preference a bootstrap run could shadow was a preference that
// did nothing, which is a trap this repository has already paid for once. The
// variable is still READ, because a deliberate override typed into a shell is
// not the same thing as one written behind the operator's back, and
// `explainTransport` names the layer that decided so the shadowing is
// visible. `--transport` now writes the project's own machine-local overlay,
// which is the layer a machine's choice about a checkout belongs at.

import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  LOCAL_OVERRIDES_FILENAME,
  TRANSPORT_ENV_VAR,
  VALID_TRANSPORTS,
  loadConfig,
  writeConfigurationChoice,
} from "../config.ts";
import { freshnessWarnings } from "../discovery.ts";
import { SESSIONS_DIRNAME, ensureRoundRefspecs, repoRootFor } from "../evidence.ts";
import { haveCommonHistory, remoteDefaultBranch, repoRelativePath, runGit } from "../journal.ts";
import { raisePackagingDecisions, raiseRemoteDecision } from "../owedDecisions.ts";
import { MANIFEST_RELPATH } from "../modules.ts";
import { STATUS_IN_PROGRESS } from "../progress.ts";
import { readRawSessionState } from "../sessionState.ts";
import { writeProjection } from "../projection.ts";
import { commitBeforeDeclaring, undeclaredSessionInFlight } from "../writers.ts";
import {
  DECOMPOSITION_PROMPT,
  IGNORE_RULE,
  PLAN_PROMPT,
  declaresPackaging,
  detectEcosystems,
  detectPackaging,
  ensureCommitGuard,
  ensureGitignore,
  scaffoldBootstrapSessions,
  scaffoldModuleManifest,
  scaffoldProjectConfig,
  writeInstructionFiles,
  removeStopGate,
} from "../bootstrap/index.ts";
import { writeErr, writeOut } from "./output.ts";

const EXIT_OK = 0;
const EXIT_ERROR = 1;
const EXIT_USAGE = 2;

const CHOICES = [...VALID_TRANSPORTS].sort();

function usage(): string {
  return [
    "usage: dabbler bootstrap [-h] [--project-dir PROJECT_DIR]",
    "                        [--repo-name REPO_NAME] [--remote URL]",
    "                        [--print-plan-prompt]",
    "                        [--print-decomposition-prompt]",
    `                        [--transport {${CHOICES.join(",")}}]`,
    "",
    "options:",
    "  --project-dir PROJECT_DIR",
    "                        consumer project root (default: cwd)",
    "  --remote URL          where this project pushes: recorded as `origin`,",
    "                        and the branch is pushed with an upstream so it",
    "                        tracks. The close pushes and a focused checkout",
    "                        is cloned from the origin, so a project without",
    "                        one cannot close its first session. An existing",
    "                        remote is left exactly as it is.",
    "  --transport {" + CHOICES.join(",") + "}",
    `                        how a provider is reached from this checkout,`,
    `                        written to ${LOCAL_OVERRIDES_FILENAME}. Nothing`,
    "                        outside the project is touched: this used to be",
    `                        persisted as ${TRANSPORT_ENV_VAR}, which outranks`,
    "                        every config layer and so shadowed the very",
    "                        preference a later run tried to set. Omitted:",
    "                        the project's own configuration decides.",
    "",
  ].join("\n");
}

const VALUE_FLAGS = new Set(["--project-dir", "--repo-name", "--remote", "--transport"]);
const BARE_FLAGS = new Set(["--print-plan-prompt", "--print-decomposition-prompt"]);

interface Parsed {
  readonly projectDir: string;
  readonly repoName: string | null;
  readonly remote: string | null;
  readonly printPlanPrompt: boolean;
  readonly printDecompositionPrompt: boolean;
  readonly transport: string | null;
}

function parseArgs(argv: readonly string[]): Parsed | string {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] as string;
    const equals = token.indexOf("=");
    const name = equals === -1 ? token : token.slice(0, equals);
    if (BARE_FLAGS.has(name)) {
      if (equals !== -1) return `argument ${name}: ignored explicit argument`;
      flags.add(name);
      continue;
    }
    if (!VALUE_FLAGS.has(name)) return `unrecognized arguments: ${token}`;
    if (equals !== -1) {
      values.set(name, token.slice(equals + 1));
      continue;
    }
    const next = argv[index + 1];
    if (next === undefined) return `argument ${name}: expected one argument`;
    values.set(name, next);
    index += 1;
  }
  return {
    projectDir: values.get("--project-dir") ?? ".",
    repoName: values.get("--repo-name") ?? null,
    remote: values.get("--remote") ?? null,
    printPlanPrompt: flags.has("--print-plan-prompt"),
    printDecompositionPrompt: flags.has("--print-decomposition-prompt"),
    transport: values.get("--transport") ?? null,
  };
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * The transport an operator named, written where a machine's choice about a
 * CHECKOUT belongs: the project's own gitignored overlay.
 *
 * It used to be persisted as an environment variable at user scope, which
 * outranks every config layer -- so the one thing it reliably did was shadow
 * whatever a later `dabbler configure` set, silently, for every repository
 * on the machine. Nothing here touches the host now, and a run that names no
 * transport changes nothing at all.
 */
function applyTransportPreference(parsed: Parsed): void {
  if (parsed.transport === null) return;
  const written = writeConfigurationChoice(parsed.projectDir, {
    transport: parsed.transport,
  });
  for (const line of written.changed) writeOut(`bootstrap: ${line}\n`);
  writeOut(`bootstrap: written to ${written.path}\n`);
  const shadow = process.env[TRANSPORT_ENV_VAR];
  if (shadow) {
    writeOut(
      `bootstrap: ${TRANSPORT_ENV_VAR} is set to '${shadow}' in this ` +
        "environment and outranks the file, so it is what a session started " +
        "from here will use.\n",
    );
  }
}

export async function bootstrapVerb(argv: string[]): Promise<number> {
  if (argv.includes("-h") || argv.includes("--help")) {
    writeOut(usage());
    return EXIT_OK;
  }
  const parsed = parseArgs(argv);
  if (typeof parsed === "string") {
    writeErr(`${usage()}dabbler bootstrap: error: ${parsed}\n`);
    return EXIT_USAGE;
  }
  if (
    parsed.transport !== null &&
    !(VALID_TRANSPORTS as readonly string[]).includes(parsed.transport)
  ) {
    writeErr(
      `dabbler bootstrap: argument --transport: invalid choice: ` +
        `'${parsed.transport}' (choose from ${CHOICES.map((c) => `'${c}'`).join(", ")})\n`,
    );
    return EXIT_USAGE;
  }

  if (parsed.printPlanPrompt) {
    writeOut(PLAN_PROMPT + "\n");
    return EXIT_OK;
  }
  if (parsed.printDecompositionPrompt) {
    writeOut(DECOMPOSITION_PROMPT + "\n");
    return EXIT_OK;
  }

  const project = parsed.projectDir;
  if (!isDirectory(project)) {
    writeErr(`bootstrap: not a directory: ${project}\n`);
    return EXIT_USAGE;
  }

  // A repository, before anything else. Everything after this needs one --
  // the commit guard lives under .git/hooks, the scaffold is committed at
  // the end, and every later verb hashes trees, commits and pushes -- and
  // a folder that has not been `git init`ed yet is the ordinary state of a
  // project on its first day. The extension's Set Up New Project already
  // initialises one; a plain-shell bootstrap left the operator to do it by
  // hand, after every verb had refused. The remote is still theirs: the
  // owed decision below asks for it once.
  if (repoRootFor(project) === null) {
    const init = runGit(project, ["init"]);
    if (init.code !== 0) {
      writeErr(
        `bootstrap: ${project} is not a git repository and \`git init\` failed ` +
          `(${init.stderr.trim() || "no output"}). The framework needs one for its ` +
          "tree hashes, its commit and its push; initialise it and run this again.\n",
      );
      return EXIT_ERROR;
    }
    writeOut(
      `bootstrap: initialised a git repository in ${project} -- the framework ` +
        "needs one for its tree hashes, its commit and its push. Add a remote " +
        "before the first close; `dabbler owed list` asks where it should push.\n",
    );
  }

  // Where this project pushes, when the caller was given it. Recorded here,
  // before the owed decision below reads whether this repository has a
  // remote; the PUSH waits until the scaffold is committed, because until
  // then there is nothing to push.
  const remote = parsed.remote === null ? null : addOrigin(project, parsed.remote.trim());
  if (remote !== null && remote.note) writeOut(`bootstrap: ${remote.note}\n`);
  if (remote !== null && remote.error) {
    writeErr(
      `bootstrap: could not record the remote (${remote.error}). The project is ` +
        "still set up; add it yourself before the first close, which pushes.\n",
    );
  }

  // Every path bootstrap itself writes, so it can commit exactly those and
  // nothing else. Sweeping the tree would fold whatever the operator had
  // open into a commit they did not write.
  const written: string[] = [];
  for (const path of writeInstructionFiles(project, parsed.repoName)) {
    writeOut(`bootstrap: wrote managed section in ${path}\n`);
    written.push(path);
  }
  if (ensureGitignore(project)) {
    const path = join(project, ".gitignore");
    writeOut(`bootstrap: added ${IGNORE_RULE} to ${path}\n`);
    written.push(path);
  }
  {
    // The Claude Code Stop hook the framework used to install is taken out
    // wherever the install ran: bootstrap knows only the host it runs
    // under (the CLAUDECODE marker), so it removes the entry there, and a
    // session registering under claude-code removes it for itself.
    const unhooked = process.env["CLAUDECODE"] ? removeStopGate(project) : null;
    if (unhooked !== null) {
      writeOut(`bootstrap: removed the stop gate from ${unhooked}\n`);
      written.push(unhooked);
    }
  }
  // Re-run on an existing clone, this is the migration: a clone made before
  // round refs existed carries neither refspec, and the fix only reaches the
  // machine a session moves to once its clone fetches them.
  if (repoRootFor(project)) {
    for (const entry of ensureRoundRefspecs(project)) {
      writeOut(
        `bootstrap: configured ${entry} so verification-round ` +
          "baselines travel with a push and a fetch\n",
      );
    }
  }
  const hook = ensureCommitGuard(project);
  if (hook !== null) {
    writeOut(`bootstrap: installed the step-execution commit guard at ${hook}\n`);
  }
  applyTransportPreference(parsed);

  const configPath = scaffoldProjectConfig(project);
  if (configPath !== null) written.push(configPath);
  if (configPath !== null) {
    const declared = detectEcosystems(project);
    writeOut(`bootstrap: scaffolded ${configPath}\n`);
    writeOut(
      "bootstrap: it declares " +
        (declared.length > 0
          ? declared.map((eco) => eco.key).join(", ") +
            " — check the command and narrow what each suite covers"
          : "no test suite, because nothing at the root of this " +
            "repository says how its tests run; declare one before the " +
            "first session that writes code") +
        "\n",
    );
  }
  // The same, for publishing. A repository whose build files say they are
  // meant to become a package has everything derivable already derived; what
  // it cannot derive is where the result goes, and asking that once at setup
  // is the difference between publishing and hand-authoring pack and push
  // argv before the first release.
  const packaging = detectPackaging(project);
  const packagingRoot = repoRootFor(project);
  if (packagingRoot !== null && !declaresPackaging(project)) {
    if (packaging.recipe !== null) {
      try {
        raisePackagingDecisions(packagingRoot, {
          ecosystem: packaging.recipe.key,
          packCommand: packaging.recipe.pack.join(" "),
        });
        writeOut(
          "bootstrap: this repository's build files say they are meant to be " +
            `published (${packaging.recipe.key}). Two questions are waiting in ` +
            "`dabbler owed list`: which feed, and the NAME of the credential. " +
            "Answer them and the packaging block is written for you.\n",
        );
      } catch {
        // A brief that cannot be written must not fail a bootstrap.
      }
    } else if (packaging.reason) {
      // Silence that explains itself. "No packaging block" and "no packaging
      // block BECAUSE your project files are below the root" are the same
      // outcome and not the same message, and only one of them can be acted
      // on.
      writeOut(`bootstrap: no packaging declared -- ${packaging.reason}\n`);
    }
  }

  // Asked at setup, where the answer is cheap, rather than at the close --
  // which is where it used to surface, as a printed `git push
  // --set-upstream` for a remote nobody had created.
  const repoRoot = repoRootFor(project);
  if (repoRoot !== null) {
    try {
      const raised = raiseRemoteDecision(repoRoot, {
        hasRemote: runGit(repoRoot, ["remote"]).stdout.trim() !== "",
      });
      if (raised !== null) {
        writeOut(
          "bootstrap: this repository has no remote. `dabbler owed list` " +
            "asks where it should push; answering settles it once.\n",
        );
      }
    } catch {
      // A brief that cannot be written must not fail a setup.
    }
  }

  // The Solution Explorer had nothing to render in a fresh project and no
  // way to say why. This is the manifest half -- one module, the
  // repository, so nothing module-shaped switches on; the welcome state is
  // the extension's, and the projection below is the third.
  const manifest = scaffoldModuleManifest(project);
  if (manifest !== null) {
    writeOut(`bootstrap: scaffolded ${manifest}
`);
    written.push(manifest);
    try {
      writeProjection(project);
    } catch {
      // A manifest that will not project is `modules show`'s to explain.
    }
  }

  const scaffolded = scaffoldBootstrapSessions(project);
  for (const path of scaffolded) {
    writeOut(`bootstrap: scaffolded ${path}\n`);
    written.push(path);
  }
  // It used to print "commit what this just wrote" — the framework asking
  // the operator to run a command it could run itself, about files it had
  // just written, knowing exactly why session 1 would be refused while they
  // sat uncommitted. It commits them, whether or not this run also
  // scaffolded the sessions: a re-run that only refreshes the guidance
  // leaves the same dirty tree behind, and the same session 1 refusal.
  //
  // Not while a session is in flight. That guard is written for a fresh
  // project, and session 94 met it mid-session: a regenerated AGENTS.md
  // went out as "Set up Dabbler", a commit outside the framework's own land
  // phase. With a session in flight the land's `git add -A` is what
  // commits these, and the step's report still passes -- the driver
  // compares trees, not commits.
  //
  // The one file bootstrap commits without having written it. The manifest
  // is the declaration the Solution Explorer renders and every session is
  // scoped by, and bootstrap writes it itself whenever it is absent -- so
  // the only way it is missing from `written` is that the operator declared
  // their modules BEFORE running set-up, which is the order both
  // walkthroughs teach. Left uncommitted it is precisely the tree that
  // refuses session 1, underneath a sentence from this command saying it
  // will not be.
  const adopted = manifest === null ? untrackedManifest(project) : null;
  const inFlight = sessionInFlight(project);
  const commit =
    inFlight === null
      ? commitOwnScaffold(project, adopted === null ? written : [...written, adopted])
      : { committed: false, reason: "" };
  if (inFlight !== null && written.length > 0) {
    // "Its land commits them" is true only AFTER the session has declared
    // its task; before that the declaration refuses a tree carrying
    // changes, and the operator is who commits them. One rule, in
    // writers.ts beside what a declaration is, because `owed answer`
    // writes into the same window and has to say the same thing.
    // Bootstrap still commits nothing itself: session 94's rule stands.
    const undeclared = undeclaredSessionInFlight(join(project, "docs", SESSIONS_DIRNAME));
    writeOut(
      `bootstrap: wrote ${written.length} file(s) and left them uncommitted: ` +
        (undeclared === null
          ? `session ${inFlight} is in flight, and its land is what commits them.\n`
          : `${commitBeforeDeclaring(undeclared, "them")}\n`),
    );
  } else if (commit.committed) {
    // The count is of what this command WROTE, and the manifest it adopted
    // is named rather than folded into it: a person reading "7 files" for a
    // run that wrote six has been told something false about the one file
    // that was theirs.
    writeOut(
      `bootstrap: committed ${written.length} file(s) it wrote` +
        (adopted === null ? "" : `, and the ${MANIFEST_RELPATH} it found untracked`) +
        "; the declaration a session makes comes before its work, so session 1 " +
        "would be refused while they sat uncommitted.\n",
    );
  } else if (commit.reason) {
    writeErr(
      `bootstrap: could not commit its own scaffold (${commit.reason}). ` +
        "Commit these files before session 1, which is refused while they " +
        "sit uncommitted.\n",
    );
  }
  // The upstream, once there is a commit to carry it. A rejected push is
  // reported and is not fatal: the remote is recorded either way, and a
  // half-configured remote an operator can finish beats a set-up that died
  // after writing the scaffold.
  if (remote !== null && remote.added) {
    const pushed = pushUpstream(project);
    if (pushed.error === "") {
      writeOut(
        `bootstrap: pushed ${pushed.branch} to origin and set it to track there, ` +
          "which is what the close's push and a focused checkout's clone both read.\n",
      );
      const mismatch = defaultBranchMismatch(project, pushed.branch);
      if (mismatch !== null) writeErr(mismatch);
    } else {
      writeErr(
        `bootstrap: origin is recorded, but the first push failed (${pushed.error}). ` +
          `Push it yourself once: git push -u origin ${pushed.branch || "<branch>"}\n`,
      );
    }
  }
  if (scaffolded.length > 0) {
    writeOut(
      'bootstrap: now tell your AI agent to "start the next ' +
        'session" — session 1 authors the project plan, then session 2 ' +
        "breaks it into numbered sessions. Session 1 will ask you what " +
        "the project is; the plan's substance is yours, and it does not " +
        "guess it.\n",
    );
  } else {
    writeOut(
      "bootstrap: a session plan already exists; scaffolding skipped " +
        "(instruction files refreshed only).\n",
    );
  }
  // The one place a record that was never made is worth mentioning: this is
  // where a project is set up, and this is the verb that owns it. `session
  // start` used to say it instead, at every start of every session, and
  // nothing in the framework ever answered it -- so the sentence stayed
  // there being scrolled past for the life of the repository.
  //
  // Said, not done: enumeration reads each vendor's models endpoint, and
  // bootstrap is run on machines with no keys, behind proxies and in tests.
  // A setup verb that fails, or hangs, because a provider is down would be
  // a worse defect than the one this replaces.
  for (const line of absentRecordNotices(project)) writeOut(`${line}\n`);
  return EXIT_OK;
}

/**
 * The discovery records this project has never made, if any.
 *
 * `projectDir` is the project bootstrap was TOLD to act on, and both the
 * config's layers and the record's path are read for it. Neither was, and
 * the one line this function prints then named the working directory's
 * `.dabbler` while every other line of the same run named the project
 * (D264) -- a reader sent to a file that was never going to be there.
 *
 * Best-effort and silent on failure: a configuration this cannot read is
 * not a reason to fail a setup, and there is nothing here a project needs
 * in order to run a session.
 */
function absentRecordNotices(projectDir: string): string[] {
  try {
    const config = loadConfig(undefined, projectDir);
    const stale = freshnessWarnings(config, Date.now(), true);
    const existing = new Set(freshnessWarnings(config, Date.now(), false));
    return stale.filter((line) => !existing.has(line));
  } catch {
    return [];
  }
}

/**
 * The number of the session in flight under this project's sessions root,
 * or null: no ledger, no usable ledger, or nothing in progress.
 */
function sessionInFlight(projectDir: string): number | null {
  let state: Record<string, unknown> | null;
  try {
    state = readRawSessionState(join(projectDir, "docs", SESSIONS_DIRNAME));
  } catch {
    return null;
  }
  const rows = Array.isArray(state?.["sessions"])
    ? (state?.["sessions"] as Array<Record<string, unknown>>)
    : [];
  const open = rows.find((row) => row["status"] === STATUS_IN_PROGRESS);
  if (open === undefined) return null;
  const number = Number(open["number"]);
  return Number.isInteger(number) ? number : null;
}

/**
 * Record `origin`, or say why it was left alone.
 *
 * An existing remote is never rewritten. It is the operator's statement of
 * where this repository lives, and set-up is not where that changes -- a
 * command that silently repointed `origin` would move a project's pushes
 * somewhere nobody chose.
 */
function addOrigin(
  projectDir: string,
  url: string,
): { readonly added: boolean; readonly note: string; readonly error: string } {
  if (url === "") return { added: false, note: "", error: "" };
  const root = repoRootFor(projectDir);
  if (root === null) return { added: false, note: "", error: "not inside a git repository" };
  const existing = runGit(root, ["remote"]).stdout.trim();
  if (existing !== "") {
    return {
      added: false,
      note: `this repository already has a remote (${existing.split("\n")[0]}), left as it is`,
      error: "",
    };
  }
  const added = runGit(root, ["remote", "add", "origin", url]);
  if (added.code !== 0) {
    return { added: false, note: "", error: added.stderr.trim() || "git remote add failed" };
  }
  return { added: true, note: `recorded origin ${url}`, error: "" };
}

/** Push the checked-out branch with an upstream, so a bare `git push` works after. */
function pushUpstream(projectDir: string): { readonly branch: string; readonly error: string } {
  const root = repoRootFor(projectDir);
  if (root === null) return { branch: "", error: "not inside a git repository" };
  const branch = runGit(root, ["symbolic-ref", "--short", "HEAD"]).stdout.trim();
  if (branch === "") return { branch: "", error: "no branch is checked out" };
  const pushed = runGit(root, ["push", "-u", "origin", branch]);
  return {
    branch,
    error: pushed.code === 0 ? "" : pushed.stderr.trim() || "git push failed",
  };
}

/**
 * The warning for a repository whose host disagrees with its operator about
 * which branch is the trunk, or null when they agree.
 *
 * This is the earliest the mismatch can be seen: the branch has just been
 * pushed, so the host's answer and the operator's are both known for the
 * first time, and every later reader of them -- the close's push, a focused
 * checkout's clone -- inherits whichever is wrong. A host that initialised
 * the repository with a README holds a branch that shares no history with
 * anything here, and saying so is the difference between a fix now and a
 * clone that silently arrives holding one file.
 */
function defaultBranchMismatch(projectDir: string, pushedBranch: string): string | null {
  const root = repoRootFor(projectDir);
  if (root === null || pushedBranch === "") return null;
  const hosted = remoteDefaultBranch(root);
  if (hosted === null || hosted === pushedBranch) return null;
  const fetched = runGit(root, ["fetch", "-q", "origin", hosted]);
  const unrelated =
    fetched.code === 0 ? haveCommonHistory(root, "HEAD", "FETCH_HEAD") === false : null;
  // The situation, then the choice, then the command for each answer. It
  // used to stop after the situation, which left a correct diagnosis and a
  // manual git problem in the same breath -- and the operator holding both.
  //
  // Both answers are offered because the framework does not know which one
  // is wanted: which branch a repository's trunk is, is the operator's to
  // say, and a framework that picked would be spelling a branch name for
  // them. They are NOT the same act, and the text has to say so -- one
  // deletes a branch a host created, the other rewrites the branch the work
  // is on over a history it does not share, and a prompt that offered them
  // as equals would be collecting consent for something it had not
  // described.
  return (
    `bootstrap: origin's default branch is '${hosted}', but this project is on '${pushedBranch}'` +
    (unrelated === true
      ? ` and the two share no history -- '${hosted}' is a placeholder the host created, not an earlier state of this work`
      : "") +
    `. A focused checkout clones origin's default, so it would arrive on '${hosted}'.\n` +
    "bootstrap: which branch is this repository's trunk? Both answers are yours to make, " +
    "and they are not the same act:\n" +
    `  '${pushedBranch}' -- the branch your work is on. It stays, and '${hosted}' is deleted ` +
    "at origin; nothing of yours moves.\n" +
    `    dabbler repo retrunk --to ${pushedBranch} --approve "<your name>"\n` +
    `  '${hosted}' -- the branch the host named. '${pushedBranch}' has to become it, ` +
    (unrelated === true
      ? `and because the two share no history that is a FORCE-PUSH: everything now on '${hosted}' is gone.\n` +
        `    dabbler repo retrunk --to ${hosted} --approve "<your name>" --rewrite-history\n`
      : `which git will refuse unless it fast-forwards -- if '${hosted}' has moved since, ` +
        "nothing is pushed until you have merged it or approved discarding it.\n" +
        `    dabbler repo retrunk --to ${hosted} --approve "<your name>"\n`) +
    "bootstrap: either way, which branch is default is a setting on the host and no git " +
    "command changes it; the verb prints where to move it.\n"
  );
}

/**
 * The modules manifest, when it is on disk and git has never seen it.
 *
 * Untracked is the whole test. A tracked manifest carrying uncommitted
 * edits is the operator's own change to their own declaration, and the rule
 * below holds for it exactly as it holds for a source file: bootstrap
 * commits what it wrote, plus this one declaration when nothing else ever
 * will, and never somebody's work.
 */
function untrackedManifest(projectDir: string): string | null {
  const path = join(projectDir, MANIFEST_RELPATH);
  if (!existsSync(path)) return null;
  const root = repoRootFor(projectDir);
  if (root === null) return null;
  const status = runGit(root, ["status", "--porcelain", "--", repoRelativePath(root, path)]);
  if (status.code !== 0) return null;
  return status.stdout.split("\n").some((line) => line.startsWith("??")) ? path : null;
}

/**
 * Commit the paths handed to it, and only those.
 *
 * Named paths rather than `git add -A`: setup runs in a directory the
 * operator may already have work in, and folding that into a commit they did
 * not write is worse than leaving the scaffold uncommitted.
 *
 * Every failure is reported and none is fatal. A repository with no committer
 * identity, or a hook that refuses, is a thing an operator can fix -- and a
 * bootstrap that died at the commit would leave the files written and the
 * project half set up, which is the state this whole session exists to stop
 * handing people.
 */
function commitOwnScaffold(
  projectDir: string,
  paths: readonly string[],
): { readonly committed: boolean; readonly reason: string } {
  if (paths.length === 0) return { committed: false, reason: "" };
  const root = repoRootFor(projectDir);
  if (root === null) {
    return { committed: false, reason: "not inside a git repository" };
  }
  // Canonical on both sides: git answers with its own spelling of the root
  // and these paths are the caller's, so a repository reached through an
  // alias -- a junction, a short name, a mapped drive -- staged nothing and
  // reported the scaffold already committed.
  const relative = paths.map((path) => repoRelativePath(root, path));
  const added = runGit(root, ["add", "--", ...relative]);
  if (added.code !== 0) {
    return { committed: false, reason: added.stderr.trim() || "git add failed" };
  }
  // Nothing staged means the files were already committed -- a re-run on an
  // existing project, which is the ordinary case and not a failure.
  if (runGit(root, ["diff", "--cached", "--quiet", "--", ...relative]).code === 0) {
    return { committed: false, reason: "" };
  }
  const committed = runGit(root, [
    "commit",
    "-m",
    "Set up Dabbler\n\nWritten and committed by `dabbler bootstrap`: the managed guidance, the\nignore rule for the router's machine state, the project's own declaration,\nand the two setup sessions. Session 1 is refused while these sit\nuncommitted, so the command that wrote them commits them.",
    "--",
    ...relative,
  ]);
  if (committed.code !== 0) {
    return {
      committed: false,
      reason: committed.stderr.trim() || "git commit failed",
    };
  }
  return { committed: true, reason: "" };
}
