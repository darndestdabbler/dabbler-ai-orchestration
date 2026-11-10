// `dabbler repo retrunk` -- make one branch this repository's trunk at origin.
//
// A host that creates the repository answers "which branch is the trunk"
// before the operator ever does, and the answer it gives is a setting nobody
// revisits. The framework already survives that -- `resolveTrunk` reads the
// answer rather than guessing it, and a checkout carrying no record is
// refused with the branch that does carry it named -- but surviving it left
// the operator holding a correct diagnosis and a manual git problem.
//
// This is the verb that does the git, so the engine never types it. Deleting
// a branch at a remote, and force-pushing over one, are exactly the acts this
// repository keeps on the record with a name against them: `--approve` names
// the person, and the record says which branches moved and what was run.
//
// No branch name is spelled here. Which branch carries the record and which
// one the host is pointing at are both read, never assumed.

import { repoRootFor, resolveTrunk, haveCommonHistory, remoteBranches, remoteDefaultBranch, runGit, nowIso, RUNS_DIRNAME } from "../journal.ts";
import { appendJsonl } from "../ledger.ts";
import { join } from "node:path";
import { writeErr, writeOut } from "./output.ts";

const EXIT_OK = 0;
const EXIT_REFUSED = 1;
const EXIT_USAGE = 2;

const COMMANDS = ["retrunk"] as const;

/** Where an approved change to the remote's branches is kept. */
export const RETRUNK_FILENAME = "retrunk.jsonl";

function usage(): string {
  return [
    "usage: dabbler repo [-h] {retrunk} --to BRANCH --approve WHO [--rewrite-history]",
    "",
    "  retrunk   make one branch this repository's trunk at origin",
    "",
    "options:",
    "  --to BRANCH          the branch that is to be the trunk; refused when this",
    "                       repository does not have it, locally or at origin",
    "  --approve WHO        the person authorising this, on the record; required,",
    "                       because a branch deleted at a remote is gone for",
    "                       everyone who clones it",
    "  --rewrite-history    acknowledge that the branch carrying the work will be",
    "                       force-pushed onto the target, which is a rewrite and",
    "                       not the same act as deleting an empty placeholder",
    "  --repo-root PATH     the repository; derived from the cwd when absent",
    "  -h, --help           show this message",
    "",
  ].join("\n");
}

export interface RetrunkOptions {
  /** The branch that is to be the trunk. */
  readonly to: string;
  /** The person authorising it; empty is a refusal, never a default. */
  readonly approver: string;
  /** Whether the operator has acknowledged a force-push over the target. */
  readonly rewriteHistory?: boolean;
  /**
   * Where each git command goes as it is run, so the operator watching the
   * Dabbler Terminal sees what was done to their remote rather than being
   * told afterwards that it went fine. Absent in a test, which reads the
   * commands off the outcome instead.
   */
  readonly say?: (line: string) => void;
}

export interface RetrunkOutcome {
  readonly refusal: string | null;
  /** Every git command run, in order, as it was run. */
  readonly commands: readonly string[];
  /** The branch that carried the work before anything moved. */
  readonly record: string | null;
  /** What origin called its default before anything moved. */
  readonly was: string | null;
  /** The branch deleted at origin, when one was. */
  readonly deleted: string | null;
  /**
   * What is left for a person, because git cannot do it: the host's own
   * setting for which branch is default. Null when nothing is outstanding.
   */
  readonly pending: string | null;
  /** True when the work was force-pushed onto the target. */
  readonly rewrote: boolean;
  /**
   * What could not be finished after the remote had already moved. Never a
   * refusal: the change stands and is on the record, and these are the
   * pieces left for the operator.
   */
  readonly outstanding: readonly string[];
}

function refused(message: string, commands: readonly string[] = []): RetrunkOutcome {
  return {
    refusal: message,
    commands,
    record: null,
    was: null,
    deleted: null,
    pending: null,
    rewrote: false,
    outstanding: [],
  };
}

/**
 * Make `to` the trunk at origin, and say what was done.
 *
 * Two shapes, and they are not the same act. When the target is already the
 * branch carrying the record, the other branch at origin is a placeholder and
 * removing it costs nothing. When the target is the placeholder, the work has
 * to become it -- over a history they do not share -- and that is a rewrite
 * the operator has to have been asked about by name.
 *
 * A branch at origin that shares history with the record is NOT a
 * placeholder, whatever the host calls it, and is left alone: this verb
 * exists to clear a branch a host created, not to tidy somebody's work away.
 */
export function retrunk(repoRoot: string, options: RetrunkOptions): RetrunkOutcome {
  const target = options.to;
  if (target === "") return refused("--to names no branch");
  if (options.approver === "") {
    return refused(
      "--approve is required: this deletes a branch at a remote, which is gone for " +
        "everyone who clones it, so the record carries who authorised it",
    );
  }
  if (runGit(repoRoot, ["remote", "get-url", "origin"]).code !== 0) {
    return refused("this repository has no origin, so there is no trunk at a remote to set");
  }
  // What origin has, now rather than at the last fetch: this verb decides
  // which branch is a placeholder from the remote-tracking refs, and a stale
  // one would have it delete a branch that is not there or miss one that is.
  runGit(repoRoot, ["fetch", "-q", "--prune", "origin"]);
  const atOrigin = remoteBranches(repoRoot);
  const local = runGit(repoRoot, ["rev-parse", "--verify", "--quiet", `refs/heads/${target}`]).code === 0;
  if (!local && !atOrigin.includes(target)) {
    return refused(
      `this repository has no branch '${target}'` +
        (atOrigin.length > 0 ? `; origin has ${atOrigin.join(", ")}` : " and origin has none"),
    );
  }
  const reading = resolveTrunk(repoRoot);
  if (reading.trunk === null) {
    return refused(`the branch carrying the record cannot be read: ${reading.refusal ?? "unknown"}`);
  }
  const record = reading.trunk;
  const was = remoteDefaultBranch(repoRoot);

  const commands: string[] = [];
  const run = (...args: string[]): { code: number; stderr: string } => {
    const command = `git ${args.join(" ")}`;
    commands.push(command);
    // Said before it is run, not after: the operator is watching a remote
    // being changed, and the line that matters most is the one for the
    // command that is about to hang or fail.
    options.say?.(command);
    const result = runGit(repoRoot, args);
    return { code: result.code, stderr: result.stderr };
  };

  if (target === record) {
    // The operator kept the branch that carries the work. Push it -- a
    // repository set up and never pushed still needs the upstream -- and
    // then, and only then, remove the branch the host left behind.
    const pushed = run("push", "-u", "origin", record);
    if (pushed.code !== 0) {
      return { ...refused(`pushing '${record}' to origin failed: ${pushed.stderr.trim()}`, commands) };
    }
    const others = remoteBranches(repoRoot).filter((branch) => branch !== record);
    const placeholders = others.filter(
      (branch) => haveCommonHistory(repoRoot, record, `origin/${branch}`) === false,
    );
    const kept = others.filter((branch) => !placeholders.includes(branch));
    // A remote refuses to delete the branch its own HEAD points at, and so
    // does every host that offers a default-branch setting -- which is the
    // whole shape of this trap: the branch cannot go until a person changes
    // that setting, and no git command changes it. So a delete that fails
    // for that reason is not a failure of the verb; it is the half of the
    // work that was always going to be the operator's, and saying so is
    // worth more than a refusal that undoes the half that succeeded.
    const deleted: string[] = [];
    for (const branch of placeholders) {
      if (branch === was) continue;
      const dropped = run("push", "origin", "--delete", branch);
      if (dropped.code !== 0) {
        return { ...refused(`deleting '${branch}' at origin failed: ${dropped.stderr.trim()}`, commands) };
      }
      deleted.push(branch);
    }
    const pending = was !== null && was !== target ? was : null;
    recordApproval(repoRoot, {
      to: target,
      was,
      record,
      deleted,
      kept,
      rewrote: false,
      approver: options.approver,
      commands,
    });
    return {
      refusal: null,
      commands,
      record,
      was,
      deleted: deleted[0] ?? null,
      pending,
      rewrote: false,
      outstanding: [],
    };
  }

  // The operator kept the host's answer, so the work has to become it.
  //
  // **Everything that can refuse, refuses before the first push.** What
  // makes this shape dangerous is that the remote moves first and the local
  // tidying follows: a check made afterwards is a refusal reported over a
  // remote that has already been rewritten, with nothing on the record
  // saying so. So the local branch name is taken here, where nothing has
  // happened yet, rather than at the rename below.
  if (local && target !== record) {
    return refused(
      `this repository already has a local branch '${target}', and '${record}' would have to ` +
        `take that name. Delete or rename the local '${target}' first -- checking it out to ` +
        "look at it is enough to leave one behind.",
    );
  }
  const shared = atOrigin.includes(target)
    ? haveCommonHistory(repoRoot, record, `origin/${target}`)
    : haveCommonHistory(repoRoot, record, target);
  if (options.rewriteHistory !== true) {
    if (shared !== true) {
      return refused(
        `'${target}' and '${record}' share no history, so making '${target}' the trunk means ` +
          `force-pushing '${record}' over it -- everything now on '${target}' would be gone. ` +
          "Pass --rewrite-history to approve that, or --to the branch that carries the work.",
      );
    }
    // Shared history is not safety: a target a team has moved on since has
    // commits the work does not, and forcing over it would discard them. So
    // an unacknowledged run pushes WITHOUT force and lets git refuse, which
    // is exactly what the operator was promised when they were offered this
    // answer -- and the refusal names what forcing would cost.
    const pushed = run("push", "origin", `${record}:${target}`);
    if (pushed.code !== 0) {
      return {
        ...refused(
          `'${target}' has commits '${record}' does not, so this is not a fast-forward and git ` +
            `refused it: ${pushed.stderr.trim()}. Merge them, or pass --rewrite-history to ` +
            `discard what is on '${target}'.`,
          commands,
        ),
      };
    }
    return finishRetrunk(repoRoot, { target, record, was, commands, rewrote: false, options });
  }
  const forced = run("push", "--force", "origin", `${record}:${target}`);
  if (forced.code !== 0) {
    return { ...refused(`force-pushing '${record}' onto '${target}' failed: ${forced.stderr.trim()}`, commands) };
  }
  return finishRetrunk(repoRoot, { target, record, was, commands, rewrote: true, options });
}

/**
 * What follows a push that has already changed the remote: the local branch
 * caught up with its new name, the old branch dropped at origin, and the
 * approval written.
 *
 * **Nothing here refuses.** The remote has moved; a refusal now would report
 * failure over a change that stands and leave no row saying who approved it.
 * So the record is written for what was actually done, and whatever could
 * not be finished is handed back as work outstanding.
 */
function finishRetrunk(
  repoRoot: string,
  context: {
    target: string;
    record: string;
    was: string | null;
    commands: string[];
    rewrote: boolean;
    options: RetrunkOptions;
  },
): RetrunkOutcome {
  const { target, record, was, commands, rewrote, options } = context;
  const run = (...args: string[]): number => {
    const command = `git ${args.join(" ")}`;
    commands.push(command);
    options.say?.(command);
    return runGit(repoRoot, args).code;
  };
  const outstanding: string[] = [];
  // The local branch follows, or the operator is left on a branch tracking a
  // ref that is about to stop existing.
  if (run("branch", "-m", record, target) === 0) {
    run("branch", "--set-upstream-to", `origin/${target}`, target);
  } else {
    outstanding.push(`the local '${record}' could not be renamed to '${target}'`);
  }
  // The branch origin's own HEAD names cannot go until a person moves that
  // setting, here as above.
  const deleted: string[] = [];
  if (record !== was) {
    if (run("push", "origin", "--delete", record) === 0) deleted.push(record);
    else outstanding.push(`'${record}' could not be deleted at origin`);
  }
  recordApproval(repoRoot, {
    to: target,
    was,
    record,
    deleted,
    kept: [],
    rewrote,
    approver: options.approver,
    commands,
  });
  const pending = was !== null && was !== target ? was : null;
  return {
    refusal: null,
    commands,
    record,
    was,
    deleted: deleted[0] ?? null,
    pending,
    rewrote,
    outstanding,
  };
}

/** The approved act, on the machine-owned record: who, what moved, what ran. */
function recordApproval(
  repoRoot: string,
  row: {
    to: string;
    was: string | null;
    record: string;
    deleted: readonly string[];
    kept: readonly string[];
    rewrote: boolean;
    approver: string;
    commands: readonly string[];
  },
): void {
  appendJsonl(join(repoRoot, ...RUNS_DIRNAME.split("/"), RETRUNK_FILENAME), {
    at: nowIso(),
    event: "retrunk",
    to: row.to,
    was: row.was,
    carried_record: row.record,
    deleted_at_origin: [...row.deleted],
    kept_at_origin: [...row.kept],
    rewrote_history: row.rewrote,
    approver: row.approver,
    commands: [...row.commands],
  });
}

/**
 * The half of this that is a person's, written as an instruction rather than
 * a diagnosis.
 *
 * Which branch a remote calls default is a setting on the host, and there is
 * no git command for it -- not `push`, not `remote set-head`, which only
 * changes what this clone remembers. So the verb names the page and the
 * setting for the two hosts this framework is used against, and says why the
 * branch it could not delete is still there.
 */
function defaultBranchInstruction(target: string, placeholder: string): string {
  return (
    `retrunk: origin still calls '${placeholder}' its default branch, and no git command ` +
    `changes that -- it is a setting on the host, and it is yours to move:\n` +
    `  Azure DevOps  Repos > Branches, the '...' menu on '${target}' > Set as default branch\n` +
    `  GitHub        Settings > General > Default branch, the switch beside it > '${target}'\n` +
    `Then run this again to remove '${placeholder}', which the remote refuses while its own ` +
    "HEAD points there.\n"
  );
}

export function repoVerb(argv: string[]): Promise<number> {
  return Promise.resolve(run(argv));
}

function run(argv: string[]): number {
  let command: string | null = null;
  let to = "";
  let approver = "";
  let rewriteHistory = false;
  let repoRoot: string | null = null;

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i] as string;
    if (token === "-h" || token === "--help") {
      writeOut(usage());
      return EXIT_OK;
    }
    if (token === "--rewrite-history") {
      rewriteHistory = true;
    } else if (token === "--to" || token === "--approve" || token === "--repo-root") {
      const value = argv[i + 1];
      if (value === undefined) {
        writeErr(`${usage()}dabbler repo: error: argument ${token}: expected one argument\n`);
        return EXIT_USAGE;
      }
      if (token === "--to") to = value;
      else if (token === "--approve") approver = value;
      else repoRoot = value;
      i += 1;
    } else if (command === null && (COMMANDS as readonly string[]).includes(token)) {
      command = token;
    } else {
      writeErr(`${usage()}dabbler repo: error: unrecognized arguments: ${token}\n`);
      return EXIT_USAGE;
    }
  }
  if (command === null) {
    writeErr(`${usage()}dabbler repo: error: the following arguments are required: {retrunk}\n`);
    return EXIT_USAGE;
  }
  if (to === "") {
    writeErr(`${usage()}dabbler repo retrunk: error: the following arguments are required: --to\n`);
    return EXIT_USAGE;
  }
  const root = repoRootFor(repoRoot ?? process.cwd());
  if (root === null) {
    writeErr("refused: this is not a git repository, so it has no trunk to set\n");
    return EXIT_REFUSED;
  }
  const outcome = retrunk(root, {
    to,
    approver,
    rewriteHistory,
    say: (command) => writeOut(`retrunk: ${command}\n`),
  });
  if (outcome.refusal !== null) {
    writeErr(`refused: ${outcome.refusal}\n`);
    return EXIT_REFUSED;
  }
  writeOut(
    `retrunk: '${to}' carries the work at origin` +
      (outcome.deleted !== null ? `, and '${outcome.deleted}' is deleted there` : "") +
      (outcome.rewrote ? " (the work was force-pushed onto it)" : "") +
      `. Approved by ${approver}.\n`,
  );
  for (const left of outcome.outstanding) {
    writeErr(`retrunk: the remote is changed, but ${left}; finish it by hand.\n`);
  }
  if (outcome.pending !== null) writeErr(defaultBranchInstruction(to, outcome.pending));
  return EXIT_OK;
}
