// Set 102 Session 2: the confirm-gated release commands — the operator's
// release gate and the two recovery drills, automated without removing the
// approval (spec: "remove keystrokes, not oversight").
//
//   - `Dabbler: Cut release tag` — create an annotated tag on a chosen ref
//     and push it to origin. The operator confirm is MANDATORY and
//     NON-BYPASSABLE: this is the release gate, not a convenience toggle
//     (constitution: pushing a tag is operator-approval-required, never
//     self-authorized). The confirm surfaces the exact tag, the resolved
//     commit (sha + subject), and both command lines for review.
//   - `Dabbler: Start hotfix from tag` — `git switch -c hotfix/<name> <tag>`:
//     branch a hotfix from a release tag (the deployed snapshot), never from
//     the trunk, so the fix is exactly what shipped plus the fix.
//   - `Dabbler: Roll back to tag` — `git checkout <tag>`: a rollback is
//     redeploying the previous tag (detached HEAD), not git surgery.
//
// This whole session is PURE GIT (tags, branches, refs), so it is
// host-agnostic by construction — no host adapter, no CLI preflight; the only
// host concern is keeping user-facing wording host-neutral. The commands
// encapsulate the exact Part-10 drills of docs/tutorials/module-team-hello-
// world.md so Session 3's re-cut can point the operator at them by name.
//
// Design rules carried from Set 102 S1 (do not re-litigate at runtime):
//   - every action is a THIN, AUDITABLE wrapper — the confirm dialog lists the
//     exact command lines and nothing else runs;
//   - anything touching the remote (the tag push) is operator-confirmed, never
//     self-authorized (an AI agent may invoke the command; the modal still
//     goes to the human);
//   - never lose work: rollback and hotfix refuse a dirty tree rather than
//     carrying uncommitted changes into a snapshot/branch they would pollute.

import * as vscode from "vscode";
import {
  GitWorkflowUi,
  ProcessRunner,
  RunResult,
  defaultRunner,
  defaultUi,
  detectTrunkBranch,
} from "./gitWorkflow";

// ---------- deps (same injectable seams as gitWorkflow) ----------

export interface GitReleaseDeps {
  ui: GitWorkflowUi;
  run: ProcessRunner;
}

// ---------- pure helpers (unit-tested without VS Code) ----------

export const HOTFIX_BRANCH_PREFIX = "hotfix/";

/** git-forbidden visible characters in a single ref path component. */
const REF_VISIBLE_UNSAFE = /[ ~^:?*[\\]/;

/**
 * Validate a tag or branch name against git's `check-ref-format` rules (the
 * subset that applies to a `refs/tags/<name>` or `refs/heads/<name>` where
 * <name> is one operator-typed value). Returns an operator-actionable message,
 * or null when the name is safe. `kind` is only for the message wording; the
 * rules are identical for tags and branches. git itself is the final
 * authority — its stderr is surfaced if anything here misses — but validating
 * up front gives a friendly message before anything runs.
 */
export function refNameProblem(name: string, kind: "tag" | "branch"): string | null {
  const label = `a ${kind} name`;
  if (name === "") return `${label} cannot be empty`;
  if (name.startsWith("-")) return `${label} cannot begin with '-' (it looks like a command-line flag)`;
  if (name.startsWith("/") || name.endsWith("/")) return `${label} cannot begin or end with '/'`;
  if (name.includes("//")) return `${label} cannot contain '//'`;
  if (name.includes("..")) return `${label} cannot contain '..'`;
  if (name.includes("@{")) return `${label} cannot contain '@{'`;
  if (name === "@") return `${label} cannot be a single '@'`;
  if (name.endsWith(".")) return `${label} cannot end with '.'`;
  for (const component of name.split("/")) {
    if (component === "") return `${label} cannot contain an empty path segment`;
    if (component.startsWith(".")) return `no path segment of ${label} may begin with '.'`;
    if (component.endsWith(".lock")) return `no path segment of ${label} may end with '.lock'`;
  }
  for (const ch of name) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return `${label} cannot contain control characters`;
  }
  const bad = REF_VISIBLE_UNSAFE.exec(name);
  if (bad) {
    const shown = bad[0] === " " ? "a space" : `'${bad[0]}'`;
    return `${label} cannot contain ${shown}`;
  }
  return null;
}

export interface TagInfo {
  name: string;
  /** The tag message subject (annotated) or commit subject (lightweight). */
  subject: string;
}

/**
 * Parse the TAB-delimited output of
 * `git for-each-ref --format=%(refname:short)\t%(contents:subject) refs/tags`.
 * Robust to subjects that themselves contain tabs (everything after the first
 * TAB is the subject) and to blank lines.
 */
export function parseTagRefLines(stdout: string): TagInfo[] {
  const out: TagInfo[] = [];
  for (const raw of stdout.split(/\r?\n/)) {
    if (raw.trim() === "") continue;
    const tab = raw.indexOf("\t");
    if (tab === -1) {
      out.push({ name: raw.trim(), subject: "" });
    } else {
      out.push({ name: raw.slice(0, tab).trim(), subject: raw.slice(tab + 1).trim() });
    }
  }
  return out;
}

// ---------- git plumbing (shell-free, host-agnostic) ----------

async function git(run: ProcessRunner, cwd: string, ...args: string[]): Promise<RunResult> {
  return run("git", args, { cwd });
}

async function gitLine(run: ProcessRunner, cwd: string, ...args: string[]): Promise<string | null> {
  const r = await git(run, cwd, ...args);
  if (r.code !== 0) return null;
  const line = r.stdout.split(/\r?\n/).find((l) => l.trim() !== "");
  return line ? line.trim() : null;
}

async function isDirty(run: ProcessRunner, cwd: string): Promise<boolean> {
  const r = await git(run, cwd, "status", "--porcelain");
  return r.code === 0 ? r.stdout.trim() !== "" : true;
}

/** True when a full ref (e.g. refs/tags/v1 or refs/heads/x) already resolves. */
async function refExists(run: ProcessRunner, cwd: string, fullRef: string): Promise<boolean> {
  const r = await git(run, cwd, "rev-parse", "--verify", "--quiet", fullRef);
  return r.code === 0;
}

interface CommitInfo {
  sha: string;
  subject: string;
}

/** Resolve a ref to its short sha + subject, or null when it does not resolve. */
async function resolveCommit(
  run: ProcessRunner,
  cwd: string,
  ref: string,
): Promise<CommitInfo | null> {
  const r = await git(run, cwd, "log", "-1", "--format=%h %s", ref);
  if (r.code !== 0) return null;
  const line = r.stdout.split(/\r?\n/).find((l) => l.trim() !== "");
  if (!line) return null;
  const t = line.trim();
  const idx = t.indexOf(" ");
  return idx === -1 ? { sha: t, subject: "" } : { sha: t.slice(0, idx), subject: t.slice(idx + 1) };
}

/**
 * All tags, newest-created first, with their subjects for the picker.
 * Returns null when the underlying git call FAILS (e.g. the workspace is not a
 * git repository) — distinct from an empty array, which means "the repo has no
 * tags." Conflating the two would make hotfix/rollback report "No tags — cut
 * one first" from a non-repo folder (S2 verification nit).
 */
async function listTags(run: ProcessRunner, cwd: string): Promise<TagInfo[] | null> {
  const r = await git(
    run,
    cwd,
    "for-each-ref",
    "--sort=-creatordate",
    "--format=%(refname:short)\t%(contents:subject)",
    "refs/tags",
  );
  if (r.code !== 0) return null;
  return parseTagRefLines(r.stdout);
}

async function pickTag(
  ui: GitWorkflowUi,
  tags: TagInfo[],
  placeHolder: string,
): Promise<string | undefined> {
  return ui.showQuickPickLabels(
    tags.map((t) => ({ label: t.name, description: t.subject || undefined })),
    placeHolder,
  );
}

// ---------- Cut release tag flow ----------

export async function runCutReleaseTagFlow(deps: GitReleaseDeps): Promise<void> {
  const { ui, run } = deps;
  const root = ui.workspaceRoot();
  if (!root) {
    ui.showError("No workspace folder is open.");
    return;
  }

  const originUrl = await gitLine(run, root, "remote", "get-url", "origin");
  if (!originUrl) {
    ui.showError(
      "This workspace has no `origin` remote (or is not a git repository) — a release tag is created and pushed to origin. Add one with: git remote add origin <url>.",
    );
    return;
  }

  const rawName = await ui.showInputBox({
    title: "Release tag name",
    prompt: "Annotated tag to cut, e.g. v1.2.0 (or greeter-v0.1.0 for a per-module tag).",
    ignoreFocusOut: true,
    validateInput: (v) => refNameProblem(v.trim(), "tag") ?? undefined,
  });
  if (rawName === undefined) return;
  const tag = rawName.trim();
  const nameProblem = refNameProblem(tag, "tag");
  if (nameProblem) {
    ui.showError(`Invalid tag name: ${nameProblem}.`);
    return;
  }
  if (await refExists(run, root, `refs/tags/${tag}`)) {
    ui.showError(
      `Tag '${tag}' already exists. Pushed release tags are immutable by convention — choose a new version, or delete the old tag first (git tag -d ${tag}) if it was never pushed.`,
    );
    return;
  }

  const rawRef = await ui.showInputBox({
    title: "Commit to tag",
    value: "HEAD",
    prompt: "The commit/branch/tag to place this release tag on (default HEAD = the current commit).",
    ignoreFocusOut: true,
  });
  if (rawRef === undefined) return;
  const ref = rawRef.trim() || "HEAD";
  const commit = await resolveCommit(run, root, ref);
  if (!commit) {
    ui.showError(`Could not resolve '${ref}' to a commit — check the ref and try again.`);
    return;
  }

  const rawMessage = await ui.showInputBox({
    title: "Tag annotation message",
    value: tag,
    prompt: "Message stored in the annotated tag (defaults to the tag name).",
    ignoreFocusOut: true,
  });
  if (rawMessage === undefined) return;
  const message = rawMessage.trim() || tag;

  const dirtyNote = (await isDirty(run, root))
    ? "\n\nNote: the working tree has uncommitted changes — they are NOT part of the tagged commit."
    : "";

  // The release gate: always presented, never bypassable. Local commits are
  // autonomous; a tag PUSH touches the remote, so the human confirms.
  //
  // Pin the tag to the RESOLVED commit sha, not the ref: `ref` (e.g. HEAD or a
  // branch) is mutable, so re-passing it to `git tag` could tag a different
  // commit than the one reviewed if it advanced while the modal was open (S2
  // verification nit). The displayed command matches what runs (both use the
  // sha), keeping the wrapper thin and auditable.
  const confirmed = await ui.confirm(
    `Cut and push release tag '${tag}'?`,
    `This creates an annotated tag and PUSHES it to origin — a release action:\n\n` +
      `  git tag -a ${tag} ${commit.sha} -m "${message}"\n` +
      `  git push origin ${tag}\n\n` +
      `Tagging ${commit.sha}${commit.subject ? ` "${commit.subject}"` : ""} (resolved from ${ref}).\n` +
      `A pushed tag is immutable by convention — review the tag and commit above before confirming.` +
      dirtyNote,
    "Create + push tag",
  );
  if (!confirmed) return;

  const created = await git(run, root, "tag", "-a", tag, commit.sha, "-m", message);
  if (created.code !== 0) {
    ui.showError(`git tag failed:\n${(created.stderr || created.stdout).trim()}`);
    return;
  }

  const pushed = await git(run, root, "push", "origin", tag);
  if (pushed.code !== 0) {
    ui.showError(
      `The tag '${tag}' was created locally but the push failed:\n${(pushed.stderr || pushed.stdout).trim()}\n\n` +
        `Retry the push with: git push origin ${tag}\n` +
        `Or remove the local tag with: git tag -d ${tag}`,
    );
    return;
  }

  ui.showInfo(
    `Release tag '${tag}' created and pushed to origin (${commit.sha}${commit.subject ? ` "${commit.subject}"` : ""}).`,
  );
}

// ---------- Start hotfix from tag flow ----------

export async function runStartHotfixFromTagFlow(deps: GitReleaseDeps): Promise<void> {
  const { ui, run } = deps;
  const root = ui.workspaceRoot();
  if (!root) {
    ui.showError("No workspace folder is open.");
    return;
  }

  const tags = await listTags(run, root);
  if (tags === null) {
    ui.showError(
      "Could not read tags — is this folder inside a git repository? Open your repo and try again.",
    );
    return;
  }
  if (tags.length === 0) {
    ui.showInfo(
      "No tags yet — a hotfix branches from a release tag. Cut one first with `Dabbler: Cut release tag`.",
    );
    return;
  }

  // A hotfix must branch from the pristine tagged snapshot ("exactly what
  // shipped"), so refuse a dirty tree rather than carrying local edits onto
  // the new branch.
  if (await isDirty(run, root)) {
    ui.showError(
      "The working tree has uncommitted changes — start the hotfix from a clean tree so the branch is exactly the tagged snapshot. Commit or stash first.",
    );
    return;
  }

  const tag = await pickTag(ui, tags, "Which release tag is the hotfix based on?");
  if (!tag) return;

  const rawName = await ui.showInputBox({
    title: "Hotfix branch name",
    value: `${HOTFIX_BRANCH_PREFIX}${tag}`,
    prompt: "Name for the hotfix branch cut from the tag.",
    ignoreFocusOut: true,
    validateInput: (v) => refNameProblem(v.trim(), "branch") ?? undefined,
  });
  if (rawName === undefined) return;
  const branch = rawName.trim();
  const nameProblem = refNameProblem(branch, "branch");
  if (nameProblem) {
    ui.showError(`Invalid branch name: ${nameProblem}.`);
    return;
  }
  if (await refExists(run, root, `refs/heads/${branch}`)) {
    ui.showError(`Branch '${branch}' already exists — choose a different hotfix branch name.`);
    return;
  }

  const confirmed = await ui.confirm(
    `Start hotfix branch '${branch}' from '${tag}'?`,
    `This creates a local hotfix branch from the release tag '${tag}' (the deployed snapshot) — never from the trunk, which may hold unreleased work:\n\n` +
      `  git switch -c ${branch} ${tag}\n\n` +
      `After this: make the fix, commit, push and open a PR, validate the full suite locally, then cut the next release tag on the hotfix commit.`,
    "Create hotfix branch",
  );
  if (!confirmed) return;

  const switched = await git(run, root, "switch", "-c", branch, tag);
  if (switched.code !== 0) {
    ui.showError(`git switch -c failed:\n${(switched.stderr || switched.stdout).trim()}`);
    return;
  }

  ui.showInfo(
    `On hotfix branch '${branch}', based on the '${tag}' snapshot. Next: make the fix, commit, push + PR, validate the full suite, then cut the next release tag on the hotfix commit.`,
  );
}

// ---------- Roll back to tag flow ----------

export async function runRollBackToTagFlow(deps: GitReleaseDeps): Promise<void> {
  const { ui, run } = deps;
  const root = ui.workspaceRoot();
  if (!root) {
    ui.showError("No workspace folder is open.");
    return;
  }

  const tags = await listTags(run, root);
  if (tags === null) {
    ui.showError(
      "Could not read tags — is this folder inside a git repository? Open your repo and try again.",
    );
    return;
  }
  if (tags.length === 0) {
    ui.showInfo(
      "No tags to roll back to — a rollback redeploys a previous release tag. Cut one first with `Dabbler: Cut release tag`.",
    );
    return;
  }

  // Rollback = redeploy the EXACT tagged snapshot; a dirty tree would pollute
  // it (checkout carries or conflicts), so refuse rather than warn.
  if (await isDirty(run, root)) {
    ui.showError(
      "The working tree has uncommitted changes — a rollback redeploys the exact tagged snapshot. Commit or stash first.",
    );
    return;
  }

  const tag = await pickTag(ui, tags, "Which release tag do you want to roll back to?");
  if (!tag) return;

  const commit = await resolveCommit(run, root, tag);
  const trunk = await detectTrunkBranch(run, root);

  const confirmed = await ui.confirm(
    `Roll back to '${tag}'?`,
    `This checks out the release tag '${tag}' so you can run / redeploy exactly that snapshot — a rollback is redeploying the previous tag, not git surgery. You will be on a DETACHED HEAD:\n\n` +
      `  git checkout ${tag}\n\n` +
      `Rolling back to ${commit ? `${commit.sha}${commit.subject ? ` "${commit.subject}"` : ""}` : tag}.\n` +
      `Return to the trunk afterward with: git switch ${trunk}`,
    "Check out tag",
  );
  if (!confirmed) return;

  const checkedOut = await git(run, root, "checkout", tag);
  if (checkedOut.code !== 0) {
    ui.showError(`git checkout failed:\n${(checkedOut.stderr || checkedOut.stdout).trim()}`);
    return;
  }

  ui.showInfo(
    `Rolled back to '${tag}'${commit ? ` (${commit.sha})` : ""} — detached HEAD at the tagged snapshot. Run / redeploy from here. Return to the trunk with: git switch ${trunk}.`,
  );
}

// ---------- registration ----------

export function registerGitReleaseCommands(context: vscode.ExtensionContext): void {
  const deps = (): GitReleaseDeps => ({ ui: defaultUi(), run: defaultRunner() });
  context.subscriptions.push(
    vscode.commands.registerCommand("dabbler.cutReleaseTag", async () => {
      await runCutReleaseTagFlow(deps());
    }),
    vscode.commands.registerCommand("dabbler.startHotfixFromTag", async () => {
      await runStartHotfixFromTagFlow(deps());
    }),
    vscode.commands.registerCommand("dabbler.rollBackToTag", async () => {
      await runRollBackToTagFlow(deps());
    }),
  );
}
