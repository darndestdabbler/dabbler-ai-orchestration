// Set 102 Session 1: the confirm-gated git-workflow commands — the
// high-frequency mechanical toil of the trunk-based loop, automated
// without removing oversight (spec: "remove keystrokes, not oversight").
//
//   - `Dabbler: Open PR for this set` — push the current session branch
//     and create the PR via the host CLI (`gh pr create` on GitHub/GHE,
//     `az repos pr create` on Azure DevOps), confirm-gated, reporting
//     the PR URL. No-CLI degradation floor: push + open the host's
//     create-a-PR web page in the browser.
//   - `Dabbler: Finalize merged set` — after the operator merged on the
//     host: `git pull --ff-only` on the trunk, remove the set's
//     worktree, `git branch -d` the session branch, `git fetch --prune`.
//     Confirm-gated, idempotent (an absent target reports "already
//     done" and the flow continues).
//
// Design rules from the spec (do not re-litigate at runtime):
//   - every action is a THIN, AUDITABLE wrapper — the confirm dialog
//     lists the exact command lines, and nothing else runs;
//   - anything touching the remote is operator-confirmed, never
//     self-authorized (an AI agent may invoke the command; the modal
//     still goes to the human);
//   - dual-host (operator directive 2026-07-14): host specifics live in
//     utils/gitHost.ts + utils/hostCli.ts; everything here that is not
//     PR creation is pure git and identical on both hosts;
//   - never hard-fail on a missing CLI — degrade to the web-page floor
//     with friendly install guidance (utils/hostCli.ts).
//
// win32 spawn nuance: the Azure CLI entrypoint is `az.cmd`, which Node
// refuses to spawn shell-less (BatBadBut hardening, EINVAL). .cmd/.bat
// targets run through `cmd.exe /d /s /c "<quoted line>"` with
// windowsVerbatimArguments and CONSERVATIVELY VALIDATED args: any arg
// carrying a cmd metacharacter is refused up front with a clear message
// (PR titles are the only free text; the validator tells the operator
// exactly which characters to drop). `gh.exe` and POSIX spawns pass the
// args array shell-free and need no validation.

import * as vscode from "vscode";
import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";
import {
  GitHostInfo,
  adoOrganizationUrl,
  adoPrWebUrl,
  createPrWebUrl,
  gitHostSetting,
  resolveGitHostFromUrl,
} from "../utils/gitHost";
import {
  describeHostCliAuthHint,
  describeMissingHostCli,
  probeHostCli,
} from "../utils/hostCli";

// ---------- injectable process/UI seams ----------

export interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/** Shell-free process runner (execFile semantics). */
export type ProcessRunner = (
  file: string,
  args: string[],
  opts: { cwd: string; windowsVerbatimArguments?: boolean },
) => Promise<RunResult>;

export interface GitWorkflowUi {
  /** Modal confirm; resolves true only on the affirmative button. */
  confirm(message: string, detail: string, button: string): Promise<boolean>;
  showInputBox: typeof vscode.window.showInputBox;
  showQuickPickLabels(
    labels: { label: string; description?: string }[],
    placeHolder: string,
  ): Promise<string | undefined>;
  showInfo(message: string): void;
  showWarning(message: string): void;
  showError(message: string): void;
  openExternal(url: string): Promise<void>;
  workspaceRoot(): string | undefined;
}

export interface GitWorkflowDeps {
  ui: GitWorkflowUi;
  run: ProcessRunner;
  /** Host-CLI probe (injectable so tests pin CLI-absent degradation). */
  probeCli?: typeof probeHostCli;
  /** Settings override for the host kind (injectable for tests). */
  hostSetting?: () => ReturnType<typeof gitHostSetting>;
  fileExists?: (p: string) => boolean;
}

export function defaultRunner(): ProcessRunner {
  return (file, args, opts) =>
    new Promise((resolve) => {
      cp.execFile(
        file,
        args,
        {
          cwd: opts.cwd,
          windowsHide: true,
          maxBuffer: 4 * 1024 * 1024,
          timeout: 120_000,
          windowsVerbatimArguments: opts.windowsVerbatimArguments ?? false,
        },
        (err, stdout, stderr) => {
          const code =
            err && typeof (err as cp.ExecFileException).code === "number"
              ? ((err as cp.ExecFileException).code as number)
              : err
                ? 1
                : 0;
          resolve({ code, stdout: String(stdout), stderr: String(stderr) });
        },
      );
    });
}

function defaultUi(): GitWorkflowUi {
  return {
    confirm: async (message, detail, button) => {
      const picked = await vscode.window.showWarningMessage(
        message,
        { modal: true, detail },
        button,
      );
      return picked === button;
    },
    showInputBox: vscode.window.showInputBox,
    showQuickPickLabels: (labels, placeHolder) =>
      Promise.resolve(
        vscode.window
          .showQuickPick(labels, { placeHolder, ignoreFocusOut: true })
          .then((p) => p?.label),
      ),
    showInfo: (m) => void vscode.window.showInformationMessage(m),
    showWarning: (m) => void vscode.window.showWarningMessage(m),
    showError: (m) => void vscode.window.showErrorMessage(m),
    openExternal: async (url) => {
      await vscode.env.openExternal(vscode.Uri.parse(url));
    },
    workspaceRoot: () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
  };
}

// ---------- pure helpers (unit-tested without VS Code) ----------

export const SESSION_BRANCH_PREFIX = "session-set/";

/** Characters cmd.exe could reinterpret — refused in .cmd-path args. */
const CMD_UNSAFE = /[\r\n"^&|<>%!]/;

/**
 * Validate an argument destined for a `cmd.exe /c`-wrapped .cmd spawn.
 * Returns an operator-actionable message, or null when safe.
 */
export function cmdArgProblem(arg: string): string | null {
  const m = CMD_UNSAFE.exec(arg);
  if (!m) return null;
  return (
    `contains ${JSON.stringify(m[0])}, which cannot be passed safely ` +
    `through the Azure CLI's .cmd entrypoint on Windows — remove ` +
    `characters ${'" ^ & | < > % !'} and line breaks, or install a ` +
    `native az executable`
  );
}

export interface CliInvocation {
  file: string;
  args: string[];
  windowsVerbatimArguments?: boolean;
  /** The logical command line shown in the confirm dialog. */
  display: string;
}

/** Human-readable display form (quotes args with spaces). */
export function displayCommand(file: string, args: string[]): string {
  const show = (s: string) => (/[\s"]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s);
  return [show(path.basename(file)), ...args.map(show)].join(" ");
}

/**
 * Wrap an invocation for its runtime shape: .cmd/.bat targets on win32
 * go through `cmd.exe /d /s /c` with each PRE-VALIDATED arg quoted;
 * everything else spawns shell-free as-is. Throws on an unsafe arg —
 * callers surface the message, nothing has run yet.
 */
export function toRunnableInvocation(
  file: string,
  args: string[],
  platform: NodeJS.Platform = process.platform,
): CliInvocation {
  const display = displayCommand(file, args);
  const isCmdShim =
    platform === "win32" && /\.(cmd|bat)$/i.test(file);
  if (!isCmdShim) {
    return { file, args, display };
  }
  for (const a of args) {
    const problem = cmdArgProblem(a);
    if (problem) {
      throw new Error(`Argument ${JSON.stringify(a)} ${problem}.`);
    }
  }
  const line = [file, ...args].map((a) => `"${a}"`).join(" ");
  return {
    file: "cmd.exe",
    args: ["/d", "/s", "/c", `"${line}"`],
    windowsVerbatimArguments: true,
    display,
  };
}

/** `gh pr create` argv (gh infers the host from the repo's remote). */
export function buildGhPrCreateArgs(
  branch: string,
  targetBranch: string,
  title: string,
  body: string,
): string[] {
  return [
    "pr",
    "create",
    "--head",
    branch,
    "--base",
    targetBranch,
    "--title",
    title,
    "--body",
    body,
  ];
}

/**
 * `az repos pr create` argv. Org/project/repo come from the parsed
 * remote — no `az devops configure --defaults` required (spec). The
 * multi-line body rides `--description`'s repeated-token form (one
 * token per line) so no newline ever crosses the .cmd boundary.
 */
export function buildAzPrCreateArgs(
  info: GitHostInfo,
  branch: string,
  targetBranch: string,
  title: string,
  bodyLines: string[],
): string[] | null {
  const org = adoOrganizationUrl(info);
  if (!org || !info.project) return null;
  return [
    "repos",
    "pr",
    "create",
    "--organization",
    org,
    "--project",
    info.project,
    "--repository",
    info.repo,
    "--source-branch",
    branch,
    "--target-branch",
    targetBranch,
    "--title",
    title,
    "--description",
    ...(bodyLines.length ? bodyLines : [""]),
    "--output",
    "json",
  ];
}

/** Last https URL in gh's stdout — the created PR's URL. */
export function parseGhPrUrl(stdout: string): string | null {
  const matches = stdout.match(/https:\/\/\S+/g);
  return matches && matches.length ? matches[matches.length - 1].trim() : null;
}

/** PR web URL from `az repos pr create --output json`. */
export function parseAzPrUrl(stdout: string, info: GitHostInfo): string | null {
  try {
    const parsed = JSON.parse(stdout) as { pullRequestId?: unknown };
    const id = parsed.pullRequestId;
    if (typeof id === "number" && Number.isFinite(id)) {
      return adoPrWebUrl(info, id);
    }
  } catch {
    /* fall through */
  }
  return null;
}

/** Templated PR title/body linking the session set (spec step 4). */
export function buildPrTemplate(branch: string): {
  title: string;
  bodyLines: string[];
} {
  const slug = branch.startsWith(SESSION_BRANCH_PREFIX)
    ? branch.slice(SESSION_BRANCH_PREFIX.length)
    : null;
  const title = slug ? `Session set ${slug}` : branch;
  const bodyLines = [
    slug
      ? `Session-set branch for docs/session-sets/${slug}/ (spec, state, and per-session artifacts live there).`
      : `Branch ${branch}.`,
    "Opened by the Dabbler AI Orchestration git-workflow command (operator-confirmed).",
  ];
  return { title, bodyLines };
}

// ---------- git plumbing (shell-free, host-agnostic) ----------

async function git(
  run: ProcessRunner,
  cwd: string,
  ...args: string[]
): Promise<RunResult> {
  return run("git", args, { cwd });
}

async function gitLine(
  run: ProcessRunner,
  cwd: string,
  ...args: string[]
): Promise<string | null> {
  const r = await git(run, cwd, ...args);
  if (r.code !== 0) return null;
  const line = r.stdout.split(/\r?\n/).find((l) => l.trim() !== "");
  return line ? line.trim() : null;
}

/** Trunk = origin's HEAD branch, falling back to local main/master. */
export async function detectTrunkBranch(
  run: ProcessRunner,
  cwd: string,
): Promise<string> {
  const head = await gitLine(
    run,
    cwd,
    "symbolic-ref",
    "--short",
    "refs/remotes/origin/HEAD",
  );
  if (head && head.startsWith("origin/")) return head.slice("origin/".length);
  for (const candidate of ["main", "master"]) {
    const r = await git(run, cwd, "show-ref", "--verify", "--quiet", `refs/heads/${candidate}`);
    if (r.code === 0) return candidate;
  }
  return "main";
}

async function isDirty(run: ProcessRunner, cwd: string): Promise<boolean> {
  const r = await git(run, cwd, "status", "--porcelain");
  return r.code === 0 ? r.stdout.trim() !== "" : true;
}

/**
 * Primary (main-checkout) root: parent of the COMMON git dir. In a
 * linked worktree the common dir lives under the primary checkout, so
 * this resolves the same root from either place.
 */
async function primaryRoot(run: ProcessRunner, cwd: string): Promise<string | null> {
  const common = await gitLine(
    run,
    cwd,
    "rev-parse",
    "--path-format=absolute",
    "--git-common-dir",
  );
  if (!common) return null;
  return path.dirname(common);
}

interface WorktreeEntry {
  path: string;
  branch: string | null;
}

async function listLinkedWorktrees(
  run: ProcessRunner,
  cwd: string,
): Promise<WorktreeEntry[]> {
  const r = await git(run, cwd, "worktree", "list", "--porcelain");
  if (r.code !== 0) return [];
  const entries: WorktreeEntry[] = [];
  let current: WorktreeEntry | null = null;
  for (const line of r.stdout.split(/\r?\n/)) {
    if (line.startsWith("worktree ")) {
      if (current) entries.push(current);
      current = { path: line.slice("worktree ".length).trim(), branch: null };
    } else if (line.startsWith("branch ") && current) {
      current.branch = line
        .slice("branch ".length)
        .trim()
        .replace(/^refs\/heads\//, "");
    }
  }
  if (current) entries.push(current);
  // First entry is the primary checkout; linked worktrees follow.
  return entries.slice(1);
}

// ---------- Open PR flow ----------

export async function runOpenPrFlow(deps: GitWorkflowDeps): Promise<void> {
  const { ui, run } = deps;
  const root = ui.workspaceRoot();
  if (!root) {
    ui.showError("No workspace folder is open.");
    return;
  }

  // Host detection reads the CONFIGURED origin URL (`git config`), not
  // `git remote get-url`, which expands url.<base>.insteadOf rewrites —
  // an operator using insteadOf (mirror/cache setups) points transport
  // at the mirror while the logical host stays the real one, and it is
  // the logical host that decides gh-vs-az. get-url remains the
  // fallback for exotic configs where remote.origin.url is unset.
  const remoteUrl =
    (await gitLine(run, root, "config", "--get", "remote.origin.url")) ??
    (await gitLine(run, root, "remote", "get-url", "origin"));
  if (!remoteUrl) {
    ui.showError(
      "This workspace has no `origin` remote — add one (git remote add origin <url>) before opening a PR.",
    );
    return;
  }
  const setting = (deps.hostSetting ?? gitHostSetting)();
  const info = resolveGitHostFromUrl(remoteUrl, setting);
  if (info.kind === "unknown") {
    ui.showError(describeMissingHostCli("unknown"));
    return;
  }

  const branch = await gitLine(run, root, "rev-parse", "--abbrev-ref", "HEAD");
  if (!branch || branch === "HEAD") {
    ui.showError("Could not resolve the current branch (detached HEAD?).");
    return;
  }
  const trunk = await detectTrunkBranch(run, root);
  if (branch === trunk) {
    ui.showError(
      `You are on the trunk (${trunk}) — open PRs from a session branch (${SESSION_BRANCH_PREFIX}<slug>).`,
    );
    return;
  }

  if (await isDirty(run, root)) {
    const proceed = await ui.confirm(
      "Uncommitted changes",
      "The working tree has uncommitted changes; they will NOT be part of the pushed branch or the PR. Continue anyway?",
      "Continue",
    );
    if (!proceed) return;
  }

  const template = buildPrTemplate(branch);
  const title = await ui.showInputBox({
    title: "PR title",
    value: template.title,
    prompt: "Title for the pull request.",
    ignoreFocusOut: true,
  });
  if (title === undefined || title.trim() === "") return;

  // Resolve the host CLI now so the confirm dialog shows exactly what
  // will run — CLI path or the web-page degradation floor.
  const probe = (deps.probeCli ?? probeHostCli)(info.kind, root, deps.fileExists);
  const pushDisplay = `git push -u origin ${branch}`;

  let cliInvocation: CliInvocation | null = null;
  let cliProblem: string | null = null;
  if (probe.present && probe.resolved) {
    const args =
      info.kind === "github"
        ? buildGhPrCreateArgs(branch, trunk, title.trim(), template.bodyLines.join("\n"))
        : buildAzPrCreateArgs(info, branch, trunk, title.trim(), template.bodyLines);
    if (!args) {
      cliProblem = describeMissingHostCli("unknown");
    } else {
      try {
        cliInvocation = toRunnableInvocation(probe.resolved, args);
      } catch (err) {
        cliProblem = err instanceof Error ? err.message : String(err);
      }
    }
  }
  if (cliProblem) {
    ui.showError(`Cannot build the PR command: ${cliProblem}`);
    return;
  }

  const webUrl = createPrWebUrl(info, branch, trunk);
  const planLines = cliInvocation
    ? [pushDisplay, cliInvocation.display]
    : [pushDisplay, `(no ${info.kind === "github" ? "gh" : "az"} CLI found — the browser create-PR page will open instead)`];
  const confirmed = await ui.confirm(
    "Push this branch and open a PR?",
    `This will run:\n\n${planLines.map((l) => `  ${l}`).join("\n")}\n\nTarget: ${info.kind} (${info.host}), base branch ${trunk}.`,
    "Push + create PR",
  );
  if (!confirmed) return;

  const push = await git(run, root, "push", "-u", "origin", branch);
  if (push.code !== 0) {
    ui.showError(
      `git push failed:\n${(push.stderr || push.stdout).trim()}`,
    );
    return;
  }

  if (!cliInvocation) {
    // Degradation floor: push done (pure git), finish in the browser.
    if (webUrl) await ui.openExternal(webUrl);
    ui.showWarning(
      `Branch pushed. ${describeMissingHostCli(info.kind)}`,
    );
    return;
  }

  const created = await run(cliInvocation.file, cliInvocation.args, {
    cwd: root,
    windowsVerbatimArguments: cliInvocation.windowsVerbatimArguments,
  });
  if (created.code !== 0) {
    const errText = (created.stderr || created.stdout).trim();
    ui.showError(
      `The PR command failed:\n${errText}\n\n${describeHostCliAuthHint(info.kind)}\nYou can finish in the browser: ${webUrl ?? "(no URL derivable)"}`,
    );
    if (webUrl) await ui.openExternal(webUrl);
    return;
  }

  const prUrl =
    info.kind === "github"
      ? parseGhPrUrl(created.stdout)
      : parseAzPrUrl(created.stdout, info);
  if (prUrl) {
    ui.showInfo(`PR created: ${prUrl}`);
    await ui.openExternal(prUrl);
  } else {
    ui.showInfo(
      "PR created (the CLI returned no parseable URL — check the host's web UI).",
    );
  }
}

// ---------- Finalize merged set flow ----------

interface FinalizeStep {
  display: string;
  /** Runs the step; returns a short outcome note. */
  exec: () => Promise<string>;
}

export async function runFinalizeMergedSetFlow(deps: GitWorkflowDeps): Promise<void> {
  const { ui, run } = deps;
  const root = ui.workspaceRoot();
  if (!root) {
    ui.showError("No workspace folder is open.");
    return;
  }

  const primary = await primaryRoot(run, root);
  if (!primary) {
    ui.showError("This workspace is not inside a git repository.");
    return;
  }
  // Compare CHECKOUT toplevels, not the workspace folder itself (S1
  // round-1 nit): a workspace opened at a subdirectory of the main
  // checkout is still the main checkout; only a LINKED worktree (whose
  // toplevel differs from the primary root) must be refused, because
  // the worktree it sits in cannot remove itself.
  const toplevel = await gitLine(run, root, "rev-parse", "--show-toplevel");
  if (!toplevel || path.resolve(toplevel) !== path.resolve(primary)) {
    ui.showError(
      `Finalize runs from the main checkout (${primary}), not from inside a worktree — open the main checkout and re-run, so the worktree you are in can be removed.`,
    );
    return;
  }

  // Pick the session branch to finalize: linked worktrees first, then
  // merged local session branches (covers the no-worktree flow).
  // Only session-set/* worktrees are candidates (S1 round-1 nit): an
  // unrelated linked worktree must never be offered for removal by a
  // command named "Finalize merged set".
  const worktrees = await listLinkedWorktrees(run, primary);
  const sessionWorktrees = worktrees.filter((w) =>
    w.branch?.startsWith(SESSION_BRANCH_PREFIX),
  );
  let chosenBranch: string | null = null;
  let chosenWorktree: WorktreeEntry | null = null;
  if (sessionWorktrees.length === 1) {
    chosenWorktree = sessionWorktrees[0];
    chosenBranch = sessionWorktrees[0].branch;
  } else if (sessionWorktrees.length > 1) {
    const picked = await ui.showQuickPickLabels(
      sessionWorktrees.map((w) => ({
        label: w.branch as string,
        description: w.path,
      })),
      "Which merged set should be finalized?",
    );
    if (!picked) return;
    chosenWorktree = sessionWorktrees.find((w) => w.branch === picked) ?? null;
    chosenBranch = picked;
  } else {
    const branches = await git(
      run,
      primary,
      "for-each-ref",
      "--format=%(refname:short)",
      `refs/heads/${SESSION_BRANCH_PREFIX}*`,
    );
    const candidates =
      branches.code === 0
        ? branches.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
        : [];
    if (candidates.length === 0) {
      ui.showInfo(
        "Nothing to finalize: no linked worktrees and no local session-set/* branches. (Already finalized? This command is safely re-runnable.)",
      );
      return;
    }
    chosenBranch =
      candidates.length === 1
        ? candidates[0]
        : (await ui.showQuickPickLabels(
            candidates.map((b) => ({ label: b })),
            "Which merged session branch should be cleaned up?",
          )) ?? null;
    if (!chosenBranch) return;
  }

  if (!chosenBranch) {
    ui.showError(
      "Could not resolve which session branch to finalize (the worktree reports no branch — detached HEAD?).",
    );
    return;
  }

  const trunk = await detectTrunkBranch(run, primary);
  const currentBranch = await gitLine(run, primary, "rev-parse", "--abbrev-ref", "HEAD");
  if (currentBranch !== trunk) {
    ui.showError(
      `The main checkout is on '${currentBranch ?? "?"}', not the trunk ('${trunk}'). Check out the trunk first (git checkout ${trunk}) — finalize pulls the merged trunk with --ff-only.`,
    );
    return;
  }
  if (await isDirty(run, primary)) {
    ui.showError(
      "The main checkout has uncommitted changes — finalize refuses to run cleanup on a dirty tree. Commit or stash first.",
    );
    return;
  }

  const steps: FinalizeStep[] = [];
  steps.push({
    display: `git pull --ff-only`,
    exec: async () => {
      const r = await git(run, primary, "pull", "--ff-only");
      if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim());
      return "trunk fast-forwarded";
    },
  });
  if (chosenWorktree) {
    const wtPath = chosenWorktree.path;
    steps.push({
      display: `git worktree remove ${wtPath}`,
      exec: async () => {
        const exists = (deps.fileExists ?? ((p: string) => fs.existsSync(p)))(wtPath);
        if (!exists) {
          const prune = await git(run, primary, "worktree", "prune");
          return prune.code === 0
            ? "worktree already gone (pruned stale registration)"
            : "worktree already gone";
        }
        const r = await git(run, primary, "worktree", "remove", wtPath);
        if (r.code !== 0) {
          throw new Error(
            `${(r.stderr || r.stdout).trim()}\n(A worktree with uncommitted work is never force-removed — resolve it, or use python -m ai_router.cancel_session for the messy path.)`,
          );
        }
        return "worktree removed";
      },
    });
  }
  const branchToDelete = chosenBranch;
  steps.push({
    display: `git branch -d ${branchToDelete}`,
    exec: async () => {
      const exists = await git(
        run,
        primary,
        "show-ref",
        "--verify",
        "--quiet",
        `refs/heads/${branchToDelete}`,
      );
      if (exists.code !== 0) return "branch already deleted";
      const r = await git(run, primary, "branch", "-d", branchToDelete);
      if (r.code !== 0) {
        throw new Error(
          `${(r.stderr || r.stdout).trim()}\n(git refuses -d on an unmerged branch — was the PR actually merged? Nothing is force-deleted.)`,
        );
      }
      return "local branch deleted";
    },
  });
  steps.push({
    display: `git fetch --prune`,
    exec: async () => {
      const r = await git(run, primary, "fetch", "--prune");
      if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim());
      return "remote-tracking refs pruned";
    },
  });

  const confirmed = await ui.confirm(
    `Finalize merged set '${branchToDelete}'?`,
    `Run AFTER the PR is merged on the host. This will run, in order:\n\n${steps
      .map((s) => `  ${s.display}`)
      .join("\n")}\n\nEach step is idempotent; an already-done step is skipped. Branch deletion uses -d (never -D), so an unmerged branch refuses rather than losing work.`,
    "Finalize",
  );
  if (!confirmed) return;

  const notes: string[] = [];
  for (const step of steps) {
    try {
      const note = await step.exec();
      notes.push(`${step.display} — ${note}`);
    } catch (err) {
      ui.showError(
        `Finalize stopped at '${step.display}':\n${err instanceof Error ? err.message : String(err)}\n\nCompleted so far:\n${notes.join("\n") || "(nothing)"}\n\nFix the cause and re-run — completed steps skip themselves.`,
      );
      return;
    }
  }
  ui.showInfo(`Merged set finalized.\n${notes.join("\n")}`);
}

// ---------- registration ----------

export function registerGitWorkflowCommands(
  context: vscode.ExtensionContext,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("dabbler.openPrForSet", async () => {
      await runOpenPrFlow({ ui: defaultUi(), run: defaultRunner() });
    }),
    vscode.commands.registerCommand("dabbler.finalizeMergedSet", async () => {
      await runFinalizeMergedSetFlow({ ui: defaultUi(), run: defaultRunner() });
    }),
  );
}
