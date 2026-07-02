// Copyable-review-prompt commands (Set 048 spec §3.2 + §3.3 L5).
//
// Four commands write a single path-reference prompt to the clipboard:
//
//   dabbler.copySpecReviewPrompt            (always enabled)
//   dabbler.copySessionAccomplishmentsPrompt (>=1 completed session)
//   dabbler.copySetAccomplishmentsPrompt    (set status === "complete")
//   dabbler.copyStartNextSessionPrompt      (non-terminal rows)
//
// L1: prompts MUST reference file paths from repo root, NEVER embed
// file contents. This module computes paths via `path.relative(set.root, …)`
// and lists them in the prompt body. L1 applies to the SESSION-SET
// ARTIFACTS being reviewed (spec.md, activity-log.json, change-log.md)
// — the things the reviewer evaluates.
//
// §3.9 carve-out: `docs/review-criteria/<kind>.md` is the documented
// exception. Those files are operator-authored META-INSTRUCTIONS about
// how to review (not the artifact under review). §3.9 explicitly says
// the "file's content is embedded into the prompt's 'optional review
// criteria' slot." Embedding short customizable reviewer instructions
// is the intended UX — the operator wrote the file to be spliced into
// every prompt.

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { SessionSet } from "../types";

interface SetItem extends vscode.TreeItem {
  set: SessionSet;
}

type ReviewKind = "spec" | "session" | "set";

const REVIEW_CRITERIA_DIRNAME = "review-criteria";

interface BuildContext {
  readReviewCriteria: (root: string, kind: ReviewKind) => string | null;
  fileExists: (filePath: string) => boolean;
}

const defaultBuildContext: BuildContext = {
  readReviewCriteria: defaultReadReviewCriteria,
  fileExists: defaultFileExists,
};

function defaultFileExists(filePath: string): boolean {
  // fs.existsSync never throws — it swallows errors and returns false.
  return fs.existsSync(filePath);
}

function defaultReadReviewCriteria(root: string, kind: ReviewKind): string | null {
  const candidate = path.join(root, "docs", REVIEW_CRITERIA_DIRNAME, `${kind}.md`);
  try {
    if (!fs.existsSync(candidate)) return null;
    const text = fs.readFileSync(candidate, "utf8");
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

function relFromRoot(root: string, abs: string): string {
  return path.relative(root, abs).split(path.sep).join("/");
}

function reviewCriteriaTrailer(
  root: string,
  kind: ReviewKind,
  ctx: BuildContext,
): string {
  const content = ctx.readReviewCriteria(root, kind);
  if (content === null) {
    const hintPath = `docs/${REVIEW_CRITERIA_DIRNAME}/${kind}.md`;
    return (
      `Operator review criteria (optional override):\n` +
      `  No \`${hintPath}\` present. Default review instructions above apply.\n` +
      `  Create \`${hintPath}\` to embed repo-specific criteria here.`
    );
  }
  return `Operator review criteria (from docs/${REVIEW_CRITERIA_DIRNAME}/${kind}.md):\n\n${content.trimEnd()}`;
}

export function buildSpecReviewPrompt(
  set: SessionSet,
  ctx: BuildContext = defaultBuildContext,
): string {
  const specRel = relFromRoot(set.root, set.specPath);
  const instructions =
    `Review the session-set specification for scope clarity, feasibility,\n` +
    `and internal consistency. Flag any session whose stated scope cannot\n` +
    `realistically be completed by one orchestrator in a single sitting, or\n` +
    `whose deliverables are ambiguous. Note whether the prerequisites and\n` +
    `non-goals are explicit.`;
  const files = `Files to read (relative to repo root):\n  - ${specRel}`;
  const trailer = reviewCriteriaTrailer(set.root, "spec", ctx);
  return `${instructions}\n\n${files}\n\n${trailer}\n`;
}

export function buildSessionAccomplishmentsPrompt(
  set: SessionSet,
  ctx: BuildContext = defaultBuildContext,
): string {
  const activityRel = relFromRoot(set.root, set.activityPath);
  const changeLogPresent = ctx.fileExists(set.changeLogPath);
  const changeLogRel = relFromRoot(set.root, set.changeLogPath);
  const specRel = relFromRoot(set.root, set.specPath);
  const instructions =
    `Review the most recent session of this set against its declared scope.\n` +
    `Read the spec for the session's promised deliverables, then cross-check\n` +
    `against the activity log entries and any change-log additions. Flag\n` +
    `scope creep, missing deliverables, or commits that look unrelated to\n` +
    `the stated session goal.`;
  const fileLines: string[] = [`  - ${specRel}`, `  - ${activityRel}`];
  if (changeLogPresent) {
    fileLines.push(`  - ${changeLogRel}`);
  }
  const files = `Files to read (relative to repo root):\n${fileLines.join("\n")}`;
  const gitCommands =
    `Git commands to run for the most recent session's diff and commit log\n` +
    `(substitute the previous session's commit SHA or tag for \`<prev-session-ref>\`):\n` +
    `  - \`git log --oneline <prev-session-ref>..HEAD\`\n` +
    `  - \`git diff <prev-session-ref>..HEAD\``;
  const trailer = reviewCriteriaTrailer(set.root, "session", ctx);
  return `${instructions}\n\n${files}\n\n${gitCommands}\n\n${trailer}\n`;
}

export function buildSetAccomplishmentsPrompt(
  set: SessionSet,
  ctx: BuildContext = defaultBuildContext,
): string {
  // Spec §3.2 lists paths for set-accomplishments as ONLY
  // `<slug>/change-log.md` + the set's commit-range git command.
  // activity-log.json is intentionally omitted at the set level: set
  // retrospectives assess outcomes (spec vs change-log + commit
  // history), not per-session detail. Use the session-accomplishments
  // prompt when activity-log evidence is needed.
  const changeLogPresent = ctx.fileExists(set.changeLogPath);
  const changeLogRel = relFromRoot(set.root, set.changeLogPath);
  const specRel = relFromRoot(set.root, set.specPath);
  const instructions =
    `Review the entire completed session set against its declared scope.\n` +
    `Confirm every promised deliverable shipped, flag any non-goals that\n` +
    `crept into scope, and assess whether the set's stated outcome\n` +
    `(version bump, doc revision, registry release) was actually achieved.`;
  const fileLines: string[] = [`  - ${specRel}`];
  if (changeLogPresent) {
    fileLines.push(`  - ${changeLogRel}`);
  }
  const files = `Files to read (relative to repo root):\n${fileLines.join("\n")}`;
  const gitCommands =
    `Git commands to run for the set's full diff and commit log\n` +
    `(substitute the set's first commit SHA or tag for \`<set-start-ref>\`):\n` +
    `  - \`git log --oneline <set-start-ref>..HEAD\`\n` +
    `  - \`git diff <set-start-ref>..HEAD\``;
  const trailer = reviewCriteriaTrailer(set.root, "set", ctx);
  return `${instructions}\n\n${files}\n\n${gitCommands}\n\n${trailer}\n`;
}

// Defense-in-depth: a backtick inside the slug would break the
// backtick-delimited L5 template literal payload. Session-set slugs
// are filesystem directory names (Windows disallows backticks in
// filenames; POSIX permits them but it would be a weird choice), so
// the sanitize is unlikely to fire in practice — but the cost is
// trivial and the failure mode (malformed markdown) is silent.
export function sanitizeSlugForPrompt(slug: string): string {
  return slug.replace(/`/g, "'");
}

export function buildStartNextSessionPrompt(set: SessionSet): string {
  return `Start the next session of \`${sanitizeSlugForPrompt(set.name)}\`.`;
}

// Set 062 Session 2 (spec D2): the dedicated-verification kickoff
// prompt for Lightweight `dedicated-sessions` sets. Pointer-style per
// L1 — references the workflow doc's Mode B section and the blessed
// `start_session --type …` CLI surface; embeds NO doc bodies or rule
// text that could go stale. The generic start-next-session prompt is
// deliberately NOT reused: the dedicated flow is typed-session +
// different-engine, not a spec session. The prompt never instructs the
// UI (or the operator) to append sessions by hand — the agent's own
// `start_session --type verification` is the only session creator.
export function buildVerificationKickoffPrompt(set: SessionSet): string {
  const slug = sanitizeSlugForPrompt(set.name);
  // The set-dir path is spliced into backtick-delimited command lines,
  // so it gets the same backtick defense as the slug.
  const setDirRel = sanitizeSlugForPrompt(relFromRoot(set.root, set.dir));
  const specRel = relFromRoot(set.root, set.specPath);
  const activityRel = relFromRoot(set.root, set.activityPath);
  const stateRel = relFromRoot(set.root, set.statePath);
  return (
    `Run the dedicated cross-provider verification flow for the Lightweight\n` +
    `session set \`${slug}\` (verificationMode: dedicated-sessions).\n` +
    `\n` +
    `1. Read the "Mode B — dedicated-sessions" part of Step 6 in\n` +
    `   docs/ai-led-session-workflow.md — it is the authoritative procedure\n` +
    `   for typed verification/remediation sessions, including the\n` +
    `   bounded-round rules and the hand-off close.\n` +
    `2. Confirm you are a DIFFERENT engine from the one that ran this set's\n` +
    `   work sessions: read the per-session \`orchestrator\` blocks in\n` +
    `   ${stateRel}. Cross-provider review is the point; the close-out gate\n` +
    `   enforces it.\n` +
    `3. Open the typed verification session through the blessed writer\n` +
    `   (never hand-edit the state file), running Python through the\n` +
    `   workspace venv:\n` +
    `   \`python -m ai_router.start_session --session-set-dir "${setDirRel}" --type verification --engine <your-engine> --provider <your-provider>\`\n` +
    `4. Review the completed work sessions against the spec and the\n` +
    `   activity log, then record the verdict per the workflow doc.\n` +
    `   Files to read (relative to repo root):\n` +
    `     - ${specRel}\n` +
    `     - ${activityRel}\n` +
    `     - ${stateRel}\n` +
    `5. If findings require remediation, seed the structured findings\n` +
    `   envelope and chain the hand-off close in one atomic write:\n` +
    `   \`python -m ai_router.start_session --session-set-dir "${setDirRel}" --type remediation --handoff --handoff-verdict ISSUES_FOUND --engine <work-engine> --provider <work-provider>\`\n` +
    `6. Follow the workflow doc's bounded-round rules for any further\n` +
    `   verify/remediate rounds and for when to stop to a human.\n`
  );
}

// Set 049 S1 hygiene: parallel-session variant. The
// `dabblerSessionSets.copyStartCommand.parallel` command in
// copyCommand.ts already builds this text but is not surfaced in the
// right-click submenu. This helper + its registration below give the
// context menu a "Start New Parallel Session" entry that uses the
// same path-reference convention as the non-parallel variant.
export function buildStartNextParallelSessionPrompt(set: SessionSet): string {
  return `Start the next parallel session of \`${sanitizeSlugForPrompt(set.name)}\`.`;
}

async function copyToClipboard(text: string, statusMessage: string): Promise<void> {
  try {
    await vscode.env.clipboard.writeText(text);
    vscode.window.setStatusBarMessage(statusMessage, 4000);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    vscode.window.showWarningMessage(`Failed to copy to clipboard: ${detail}`);
  }
}

export function registerCopyPromptCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "dabbler.copySpecReviewPrompt",
      async (item: SetItem) => {
        if (!item?.set) return;
        const prompt = buildSpecReviewPrompt(item.set);
        await copyToClipboard(prompt, `Copied: Spec-review prompt for ${item.set.name}`);
      },
    ),
    vscode.commands.registerCommand(
      "dabbler.copySessionAccomplishmentsPrompt",
      async (item: SetItem) => {
        if (!item?.set) return;
        const prompt = buildSessionAccomplishmentsPrompt(item.set);
        await copyToClipboard(prompt, `Copied: Session-accomplishments prompt for ${item.set.name}`);
      },
    ),
    vscode.commands.registerCommand(
      "dabbler.copySetAccomplishmentsPrompt",
      async (item: SetItem) => {
        if (!item?.set) return;
        const prompt = buildSetAccomplishmentsPrompt(item.set);
        await copyToClipboard(prompt, `Copied: Set-accomplishments prompt for ${item.set.name}`);
      },
    ),
    vscode.commands.registerCommand(
      "dabbler.copyStartNextSessionPrompt",
      async (item: SetItem) => {
        if (!item?.set) return;
        const prompt = buildStartNextSessionPrompt(item.set);
        await copyToClipboard(prompt, `Copied: Start the next session of ${item.set.name}`);
      },
    ),
    vscode.commands.registerCommand(
      "dabbler.copyStartNextParallelSessionPrompt",
      async (item: SetItem) => {
        if (!item?.set) return;
        const prompt = buildStartNextParallelSessionPrompt(item.set);
        await copyToClipboard(prompt, `Copied: Start the next parallel session of ${item.set.name}`);
      },
    ),
    vscode.commands.registerCommand(
      "dabbler.copyVerificationKickoffPrompt",
      async (item: SetItem) => {
        if (!item?.set) return;
        const prompt = buildVerificationKickoffPrompt(item.set);
        await copyToClipboard(prompt, `Copied: Verification kickoff prompt for ${item.set.name}`);
      },
    ),
  );
}

export const __forTests = {
  defaultBuildContext,
  defaultFileExists,
  defaultReadReviewCriteria,
  relFromRoot,
  reviewCriteriaTrailer,
};
