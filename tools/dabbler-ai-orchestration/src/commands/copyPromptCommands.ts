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
    `Cross-provider review request (out-of-band verification).\n` +
    `\n` +
    `First read \`${CROSS_PROVIDER_VERIFICATION_REL_PATH}\` (repo root) — ` +
    `it carries the review stance, the verdict grammar, and the required ` +
    `output artifact. If that file is missing, use this fallback: review ` +
    `adversarially with a materiality bar, and record exactly one verdict ` +
    `token — VERIFIED, ISSUES_FOUND (findings tagged [Critical]/[Major]/` +
    `[Minor]), or WAIVED — <one-line reason>.`
  );
}

/**
 * The mandatory write-the-artifact close shared by the three Evaluate
 * prompts (Set 077 S4, A2): the reviewing engine itself writes the
 * verdict file — a verdict that exists only in the chat does not count
 * and the close-out gate will warn on it.
 *
 * A ``spec`` review runs BEFORE the work exists, so its round must
 * carry a parser-visible ``Scope: specification`` line — the close-out
 * gate deliberately refuses to read a spec-only verdict as evidence
 * the WORK was reviewed (S4 code-review finding: without the scope
 * marker, a pre-work spec review could silently satisfy the gate).
 */
function verificationArtifactClose(
  set: SessionSet,
  kind: ReviewKind,
): string {
  const artifactRel = relFromRoot(
    set.root,
    path.join(set.dir, "external-verification.md"),
  );
  const scopeLine =
    kind === "spec"
      ? ` Because this is a pre-work SPECIFICATION review, put the line ` +
        `\`Scope: specification\` directly under your round header — a ` +
        `spec-only verdict must not read as work verification.`
      : "";
  return (
    `Non-negotiable final step: YOU (the reviewing engine) must write ` +
    `your verdict as a new dated round section appended to ` +
    `\`${artifactRel}\` (UTF-8, append-only — never rewrite earlier ` +
    `rounds).${scopeLine} A verdict that exists only in this chat does ` +
    `not count.`
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
      "lightweight",
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

// Set 077 S5 (Feature 5, A9): the derived-state router behind the
// "Start Next Session" copy action. Exported + pure so Layer-2 tests
// drive it without the command plumbing. The status-bar message names
// WHAT was copied — an operator who expected a work prompt must see the
// reroute, not discover it mid-paste.
export function resolveStartNextSessionPrompt(set: SessionSet): {
  prompt: string;
  message: string;
} {
  if (set.workflowState === "awaiting-verification") {
    return {
      prompt: buildVerificationKickoffPrompt(set),
      message: `Copied: Verification kickoff (verification owed) for ${set.name}`,
    };
  }
  if (set.workflowState === "awaiting-remediation") {
    return {
      prompt: buildRemediationHandoffPrompt(set),
      message: `Copied: Remediation handoff (remediation owed) for ${set.name}`,
    };
  }
  return {
    prompt: buildStartNextSessionPrompt(set),
    message: `Copied: Start the next session of ${set.name}`,
  };
}

// Set 077 S5 (Feature 5, A9): the minimum dabbler-ai-router version the
// Mode-B guardrail + owed-state banner ship in. Surfaced in the typed
// Mode-B prompts so a mixed-version workspace (new extension, old
// router) fails LOUD where the work happens instead of silently
// skipping the start-time cross-provider refusal (critique M6).
export const MODE_B_MIN_ROUTER_VERSION = "0.27.0";

function modeBVersionLine(): string {
  return (
    `This flow expects dabbler-ai-router >= ${MODE_B_MIN_ROUTER_VERSION} ` +
    `(the start-time cross-provider guardrail and the owed-verification ` +
    `banner ship there). Check with \`python -m pip show dabbler-ai-router\` ` +
    `and upgrade first if older — an older router accepts a same-provider ` +
    `verification session silently and the close-out gate then refuses it.`
  );
}

// Set 062 Session 2 (spec D2), REWRITTEN Set 077 S5 (Feature 5 with A9):
// the dedicated-verification kickoff prompt for Lightweight
// `dedicated-sessions` sets, now pointer-style per the Feature-3
// standard — it points at the canonical Mode B procedure and names the
// required output, instead of inlining a six-step script that drifts
// from the doc it paraphrases. The one command line kept inline is the
// entry point itself (the M1 start-time guardrail fires there). The
// generic start-next-session prompt is deliberately NOT reused: the
// dedicated flow is typed-session + cross-provider, not a spec session,
// and the agent's own `start_session --type verification` is the only
// session creator (never hand-edit the state file).
export function buildVerificationKickoffPrompt(set: SessionSet): string {
  const slug = sanitizeSlugForPrompt(set.name);
  // The set-dir path is spliced into backtick-delimited command lines,
  // so it gets the same backtick defense as the slug.
  const setDirRel = sanitizeSlugForPrompt(relFromRoot(set.root, set.dir));
  const specRel = relFromRoot(set.root, set.specPath);
  const activityRel = relFromRoot(set.root, set.activityPath);
  const stateRel = relFromRoot(set.root, set.statePath);
  return (
    `Run the dedicated cross-provider verification round for the Lightweight\n` +
    `session set \`${slug}\` (verificationMode: dedicated-sessions).\n` +
    `\n` +
    `Authoritative procedure: docs/ai-led-session-workflow.md -> Step 6 ->\n` +
    `"Mode B — dedicated-sessions" (typed sessions, bounded rounds, hand-off\n` +
    `close). Follow it — do not improvise the flow from this prompt.\n` +
    `${modeBVersionLine()}\n` +
    `\n` +
    `You must differ from this set's work sessions by ENGINE or by model\n` +
    `PROVIDER (read the per-session \`orchestrator\` blocks in ${stateRel}).\n` +
    `Single-engine shop? Use a second chat with the model picker on another\n` +
    `provider, and declare it honestly via --provider — start_session\n` +
    `refuses a same-engine+same-provider verification at start.\n` +
    `\n` +
    `Open the typed session through the blessed writer (workspace venv);\n` +
    `never hand-edit the state file:\n` +
    `\`python -m ai_router.start_session --session-set-dir "${setDirRel}" --type verification --engine <your-engine> --provider <your-provider>\`\n` +
    `\n` +
    `Required output: review the completed work sessions against ${specRel}\n` +
    `and ${activityRel}, then record your verdict (VERIFIED / ISSUES_FOUND\n` +
    `with severities) on the session record; on findings, seed the\n` +
    `sN-issues.json envelope and chain the remediation hand-off — both per\n` +
    `the workflow doc's Mode B section.\n`
  );
}

// Set 077 S5 (Feature 5): the remediation handoff prompt — the copy
// action's target when a Mode-B set derives to `awaiting-remediation`
// (a verification round returned ISSUES_FOUND). Pointer-style like the
// kickoff above.
export function buildRemediationHandoffPrompt(set: SessionSet): string {
  const slug = sanitizeSlugForPrompt(set.name);
  const setDirRel = sanitizeSlugForPrompt(relFromRoot(set.root, set.dir));
  return (
    `Run the remediation round for the Lightweight session set \`${slug}\`\n` +
    `— its dedicated verification returned ISSUES_FOUND.\n` +
    `\n` +
    `Authoritative procedure: docs/ai-led-session-workflow.md -> Step 6 ->\n` +
    `"Mode B — dedicated-sessions" (remediate -> re-verify, bounded rounds).\n` +
    `${modeBVersionLine()}\n` +
    `\n` +
    `Read the LATEST sN-issues*.json findings envelope in ${setDirRel}.\n` +
    `If a remediation session is already in flight, resume it — do NOT\n` +
    `open another. Otherwise open it through the blessed writer\n` +
    `(workspace venv); never hand-edit the state file:\n` +
    `\`python -m ai_router.start_session --session-set-dir "${setDirRel}" --type remediation --engine <work-engine> --provider <work-provider>\`\n` +
    `\n` +
    `Required output: confirm each finding reproduces, resolve it, and\n` +
    `record a resolution_status on every issue in the envelope (the enum\n` +
    `and the human-stop rules are in the workflow doc); if anything was\n` +
    `fixed, hand off back to a re-verification round per the doc.\n`
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
        // Set 077 S5 (Feature 5, A9): auto-route by derived state. When
        // a Mode-B set owes its verification (or a remediation round),
        // "Start Next Session" yields the typed-session kickoff instead
        // of a work-session prompt — the owed state is one copy action
        // away, and a work prompt that start_session would refuse is
        // never handed out.
        const { prompt, message } = resolveStartNextSessionPrompt(item.set);
        await copyToClipboard(prompt, message);
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
