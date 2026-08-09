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
import {
  CROSS_PROVIDER_VERIFICATION_REL_PATH,
  loadTemplateBundle,
  renderCrossProviderVerification,
  resolveBundledTemplateDir,
  structureOnlyContext,
} from "../utils/consumerBootstrap";

interface SetItem extends vscode.TreeItem {
  set: SessionSet;
}

type ReviewKind = "spec" | "session" | "set";

const REVIEW_CRITERIA_DIRNAME = "review-criteria";

// Set 077 S4 (S1 bundle A Minor): ceiling on the embedded operator
// review-criteria text. The §3.9 carve-out embeds the file's content
// verbatim; an accidentally huge file (a pasted transcript, a binary
// renamed .md) would otherwise dominate the prompt and push the
// load-bearing instructions out of the reviewer's attention.
const REVIEW_CRITERIA_MAX_CHARS = 8000;

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
  // Set 077 S4: size guard — truncate an oversized criteria file rather
  // than letting it crowd out the prompt's load-bearing instructions.
  let body = content.trimEnd();
  if (body.length > REVIEW_CRITERIA_MAX_CHARS) {
    body =
      body.slice(0, REVIEW_CRITERIA_MAX_CHARS) +
      `\n\n[... truncated at ${REVIEW_CRITERIA_MAX_CHARS} characters — ` +
      `read docs/${REVIEW_CRITERIA_DIRNAME}/${kind}.md for the rest]`;
  }
  return `Operator review criteria (from docs/${REVIEW_CRITERIA_DIRNAME}/${kind}.md):\n\n${body}`;
}

/**
 * Pointer opener shared by the three Evaluate prompts (Set 077 S4,
 * Feature 3 — "prompts are pointers"). Names the canonical in-repo
 * instruction doc first and carries the one-line fallback for the
 * pathological missing-doc case (critique M2).
 */
function verificationPointerOpener(): string {
  return (
    `Cross-provider review request (advisory second opinion).\n` +
    `\n` +
    `First read \`${CROSS_PROVIDER_VERIFICATION_REL_PATH}\` (repo root) — ` +
    `it carries the review stance, the verdict grammar, and the required ` +
    `output shape. If that file is missing, use this fallback: review ` +
    `adversarially with a materiality bar, and record exactly one verdict ` +
    `token — VERIFIED, ISSUES_FOUND (findings tagged [Critical]/[Major]/` +
    `[Minor]), or WAIVED — <one-line reason>.`
  );
}

/**
 * The shared close for the three Evaluate prompts: the reviewing engine
 * reports its verdict in the instruction doc's fixed grammar.
 *
 * Set 112 S2: this used to MANDATE writing
 * `docs/session-sets/<slug>/external-verification.md`, on the claim that
 * the close-out gate read it. That was Mode A machinery — Session 1
 * deleted the parser and both Lightweight close gates — so the mandate
 * would now instruct operators to produce a file nothing reads, and
 * worse, imply an unverified close could be satisfied by it. These
 * prompts are an advisory second opinion; the routed `verify_session`
 * round is the verification of record (decisions.jsonl, S2).
 *
 * A ``spec`` review runs BEFORE the work exists, so its report must say
 * so — a pre-work plan review must never read as work verification.
 */
function verificationArtifactClose(
  set: SessionSet,
  kind: ReviewKind,
): string {
  void set;
  const scopeLine =
    kind === "spec"
      ? ` Because this is a pre-work SPECIFICATION review, include the line ` +
        `\`Scope: specification\` under your header — a spec-only verdict ` +
        `must not read as work verification.`
      : "";
  return (
    `Final step: report your verdict in the grammar that doc defines ` +
    `(one UPPERCASE token, findings tagged by severity).${scopeLine} This ` +
    `review is advisory — the session's verification of record is the ` +
    `router's own cross-provider round, which the close-out gate ` +
    `corroborates independently.`
  );
}

/**
 * Idempotently write/refresh the canonical cross-provider verification
 * doc into the workspace BEFORE a pointer prompt is emitted (Set 077
 * S4, critique M2). Consumer repos bootstrapped before Set 077 get the
 * doc on first use after upgrading the extension — no re-bootstrap.
 * The doc follows the start-here.md generated-never-hand-edited
 * pattern, so refreshing a stale copy to the bundled content is
 * correct by contract. Returns true when the doc is present (written
 * or already current); false on any failure — the prompt's fallback
 * line covers that case, so failures are non-fatal by design.
 */
export function ensureCrossProviderVerificationDoc(
  extensionPath: string,
  root: string,
): boolean {
  try {
    const bundle = loadTemplateBundle(resolveBundledTemplateDir(extensionPath));
    const ctx = structureOnlyContext(
      path.basename(root),
      new Date().toISOString().slice(0, 10),
    );
    const rendered = renderCrossProviderVerification(bundle, ctx);
    const target = path.join(
      root,
      ...CROSS_PROVIDER_VERIFICATION_REL_PATH.split("/"),
    );
    let existing: string | null = null;
    try {
      existing = fs.readFileSync(target, "utf8");
    } catch {
      existing = null;
    }
    if (existing !== null && existing.replace(/\r\n/g, "\n") === rendered) {
      return true;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, rendered, { encoding: "utf8" });
    return true;
  } catch {
    return false;
  }
}

export function buildSpecReviewPrompt(
  set: SessionSet,
  ctx: BuildContext = defaultBuildContext,
): string {
  const specRel = relFromRoot(set.root, set.specPath);
  const opener = verificationPointerOpener();
  const instructions =
    `Scope: review the session-set specification for scope clarity,\n` +
    `feasibility, and internal consistency. Flag any session whose stated\n` +
    `scope cannot realistically be completed by one orchestrator in a\n` +
    `single sitting, or whose deliverables are ambiguous. Note whether the\n` +
    `prerequisites and non-goals are explicit.`;
  const files = `Files to read (relative to repo root):\n  - ${specRel}`;
  const trailer = reviewCriteriaTrailer(set.root, "spec", ctx);
  const close = verificationArtifactClose(set, "spec");
  return `${opener}\n\n${instructions}\n\n${files}\n\n${trailer}\n\n${close}\n`;
}

export function buildSessionAccomplishmentsPrompt(
  set: SessionSet,
  ctx: BuildContext = defaultBuildContext,
): string {
  const activityRel = relFromRoot(set.root, set.activityPath);
  const changeLogPresent = ctx.fileExists(set.changeLogPath);
  const changeLogRel = relFromRoot(set.root, set.changeLogPath);
  const specRel = relFromRoot(set.root, set.specPath);
  const opener = verificationPointerOpener();
  const instructions =
    `Scope: review the most recent session of this set against its\n` +
    `declared scope. Read the spec for the session's promised\n` +
    `deliverables, then cross-check against the activity log entries and\n` +
    `any change-log additions. Flag scope creep, missing deliverables, or\n` +
    `commits that look unrelated to the stated session goal.`;
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
  const close = verificationArtifactClose(set, "session");
  return `${opener}\n\n${instructions}\n\n${files}\n\n${gitCommands}\n\n${trailer}\n\n${close}\n`;
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
  const opener = verificationPointerOpener();
  const instructions =
    `Scope: review the entire completed session set against its declared\n` +
    `scope. Confirm every promised deliverable shipped, flag any non-goals\n` +
    `that crept into scope, and assess whether the set's stated outcome\n` +
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
  const close = verificationArtifactClose(set, "set");
  return `${opener}\n\n${instructions}\n\n${files}\n\n${gitCommands}\n\n${trailer}\n\n${close}\n`;
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
        // Set 077 S4 (critique M2): the pointer prompt must never
        // dangle — refresh the canonical doc into the workspace first.
        ensureCrossProviderVerificationDoc(
          context.extensionPath,
          item.set.root,
        );
        const prompt = buildSpecReviewPrompt(item.set);
        await copyToClipboard(prompt, `Copied: Spec-review prompt for ${item.set.name}`);
      },
    ),
    vscode.commands.registerCommand(
      "dabbler.copySessionAccomplishmentsPrompt",
      async (item: SetItem) => {
        if (!item?.set) return;
        ensureCrossProviderVerificationDoc(
          context.extensionPath,
          item.set.root,
        );
        const prompt = buildSessionAccomplishmentsPrompt(item.set);
        await copyToClipboard(prompt, `Copied: Session-accomplishments prompt for ${item.set.name}`);
      },
    ),
    vscode.commands.registerCommand(
      "dabbler.copySetAccomplishmentsPrompt",
      async (item: SetItem) => {
        if (!item?.set) return;
        ensureCrossProviderVerificationDoc(
          context.extensionPath,
          item.set.root,
        );
        const prompt = buildSetAccomplishmentsPrompt(item.set);
        await copyToClipboard(prompt, `Copied: Set-accomplishments prompt for ${item.set.name}`);
      },
    ),
    vscode.commands.registerCommand(
      "dabbler.copyStartNextSessionPrompt",
      async (item: SetItem) => {
        if (!item?.set) return;
        const prompt = buildStartNextSessionPrompt(item.set);
        await copyToClipboard(
          prompt,
          `Copied: Start the next session of ${item.set.name}`,
        );
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
  );
}

export const __forTests = {
  defaultBuildContext,
  defaultFileExists,
  defaultReadReviewCriteria,
  relFromRoot,
  reviewCriteriaTrailer,
};
