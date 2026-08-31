// Consumer-project bootstrap: orchestrator instruction files, the `.dabbler/`
// ignore rule, the repository's own `dabbler.yaml`, and the two setup sessions
// that plan the project and break the plan into the rest.
//
// Into a project with no session plan at all, bootstrap scaffolds sessions 1
// and 2 -- author or import the project plan, then break it into numbered
// sessions. They are ordinary sessions and run the ordinary lifecycle
// (register, work, cross-provider verification, close); neither is an approval
// gate, because what makes them safe is being verified hardest, not being
// parked in front of a person. A project that already has a plan keeps its
// numbering and its history; scaffolding is skipped.
//
// Beside them goes `dabbler.yaml`, and it is the piece without which the
// scaffold is unrunnable: `test-evidence` refuses a suite the repository never
// declared, so a project handed a lifecycle with nowhere to declare one cannot
// reach step 4 of it.
//
// Bootstrap also writes the `.dabbler/` rule into the project's `.gitignore`.
// That directory is the router's machine-side record, and every round lands
// there *after* the tree snapshot it describes -- so a tracked ledger presents
// itself to the close gate as work done after verification, and no number of
// re-verifications can clear it.
//
// The last piece of setup is the `pre-commit` guard that refuses a manual
// commit while a plan step is open. It belongs here rather than at step open:
// the guard has to exist in the clone before the first step does, and a guard
// installed by the thing it guards is installed too late.

import { chmodSync, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

import { SESSIONS_DIRNAME, SESSION_PLAN_FILENAME } from "../evidence.ts";
import { readText } from "../textfile.ts";
import { EXIT_BLOCKING } from "../verify/errors.ts";
import {
  AGENTS_TAIL,
  BOOTSTRAP_PLAN,
  CLAUDE_TAIL,
  GEMINI_TAIL,
  HOOK_MARKER,
  IGNORE_RULE,
  IMPORT_LINE,
  MANAGED_END,
  MANAGED_START,
  PRE_COMMIT_HOOK,
  SHARED_BODY,
} from "./templates.ts";

import { MANIFEST_RELPATH } from "../solution.ts";

export * from "./templates.ts";
export * from "./detect.ts";
export * from "./env.ts";

/**
 * Scaffold the two setup sessions into a repository that has no session plan
 * at all; return the written path.
 *
 * A repository that already has a plan has its own numbering and its own
 * history, so nothing is written and nothing is ever overwritten.
 */
export function scaffoldBootstrapSessions(projectDir: string): string[] {
  const root = join(projectDir, "docs", SESSIONS_DIRNAME);
  const plan = join(root, SESSION_PLAN_FILENAME);
  if (existsSync(plan)) return [];
  mkdirSync(root, { recursive: true });
  writeFileSync(plan, BOOTSTRAP_PLAN, "utf8");
  return [plan];
}

/**
 * Ensure the consumer project ignores the router's machine-side `.dabbler/`
 * directory; return true when the rule was added.
 *
 * The run ledger is appended *after* the tree snapshot each round describes. A
 * tracked ledger therefore reports itself as work done after verification, and
 * the close gate correctly refuses -- so the ignore rule is part of setup, not
 * a convention the operator is trusted to know. Existing content is preserved;
 * the rule is added once and never duplicated.
 */
export function ensureGitignore(projectDir: string): boolean {
  const path = join(projectDir, ".gitignore");
  let existing = "";
  try {
    existing = readText(path);
  } catch {
    existing = "";
  }
  const target = IGNORE_RULE.replace(/\/+$/, "");
  for (const line of splitLines(existing)) {
    // `.dabbler/*` governs the same directory as `.dabbler/`, and a
    // repository that wrote it that way did so to re-include something
    // underneath. Adding the blunter rule after it would exclude the parent
    // directory outright, and git cannot re-include through an excluded
    // parent -- the ledger a project deliberately tracks would silently stop
    // being added.
    let stripped = line.trim();
    if (stripped.endsWith("/*")) stripped = stripped.slice(0, -2);
    stripped = stripped.replace(/\/+$/, "");
    if (stripped === target || stripped === "*") return false;
  }
  let block =
    existing.trim() === ""
      ? ""
      : existing.endsWith("\n")
        ? existing
        : existing + "\n";
  if (block) block += "\n";
  block +=
    "# Dabbler router machine-side state: the run ledger records each\n" +
    "# verification round after the tree it describes, so committing it\n" +
    "# makes verified work look like it changed post-verification.\n" +
    `${IGNORE_RULE}\n`;
  try {
    writeFileSync(path, block, "utf8");
  } catch {
    return false;
  }
  return true;
}

/** `str.splitlines()`: no trailing empty element for a final newline. */
function splitLines(text: string): string[] {
  if (text === "") return [];
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/**
 * Install the pre-commit guard that refuses a manual commit while a step is
 * open; return the hook path when it was written.
 *
 * An existing hook this function did not write is never clobbered -- a
 * project's own pre-commit checks are not ours to delete, and a guard that
 * silently ate them would be worse than no guard.
 *
 * The guard invokes the router by name and lets PATH resolve it. There is no
 * interpreter to bake in: the router ships as one command, and a consumer
 * repository is not required to contain the thing that guards it. A machine
 * where the name does not resolve exits non-blocking, which is the same
 * direction every other non-verdict failure takes.
 */
export function ensureCommitGuard(projectDir: string): string | null {
  const hooks = join(projectDir, ".git", "hooks");
  if (!isDirectory(join(projectDir, ".git"))) return null;
  const path = join(hooks, "pre-commit");
  let existing = "";
  try {
    existing = readText(path);
  } catch {
    existing = "";
  }
  if (existing && !existing.includes(HOOK_MARKER)) return null;
  const content = PRE_COMMIT_HOOK.replace("{marker}", HOOK_MARKER).replace(
    /\{blocking\}/g,
    String(EXIT_BLOCKING),
  );
  if (existing === content) return null;
  try {
    mkdirSync(hooks, { recursive: true });
    writeFileSync(path, content, "utf8");
    chmodSync(path, 0o755);
  } catch {
    return null;
  }
  return path;
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * The managed section replaced in place, or appended after existing user
 * content. User text outside the fence is never modified.
 *
 * `body` defaults to the shared managed body; the importing files pass the
 * one-line `@AGENTS.md` directive instead, so the body exists in exactly one
 * file.
 */
export function renderEngineFile(
  existing: string,
  repoName: string,
  tail: string,
  body?: string | null,
): string {
  const renderedBody =
    body === undefined || body === null
      ? replaceAll(SHARED_BODY, "{repo_name}", repoName)
      : body.replace(/\n+$/, "") + "\n";
  const managed =
    `${MANAGED_START}\n` +
    renderedBody +
    "\n---\n\n" +
    tail +
    `\n${MANAGED_END}\n`;
  if (existing.includes(MANAGED_START) && existing.includes(MANAGED_END)) {
    const startAt = existing.indexOf(MANAGED_START);
    const head = existing.slice(0, startAt);
    const rest = existing.slice(startAt + MANAGED_START.length);
    const endAt = rest.indexOf(MANAGED_END);
    const tailText = endAt === -1 ? "" : rest.slice(endAt + MANAGED_END.length);
    return head + managed.replace(/\n+$/, "") + tailText;
  }
  if (existing.trim() !== "") {
    return existing.replace(/\n+$/, "") + "\n\n" + managed;
  }
  return managed;
}

function replaceAll(text: string, needle: string, value: string): string {
  return text.split(needle).join(value);
}

/**
 * Write the three engine files. `AGENTS.md` carries the body; `CLAUDE.md` and
 * `GEMINI.md` import it.
 *
 * All three are written because no engine reads all three: Codex and Copilot
 * read `AGENTS.md`, Claude Code reads only `CLAUDE.md`, and Gemini CLI reads
 * only `GEMINI.md` unless its `context.fileName` is reconfigured. Copilot
 * reads every one of them and de-duplicates nothing, so only one may carry the
 * body.
 */
export function writeInstructionFiles(
  projectDir: string,
  repoName?: string | null,
): string[] {
  const name = repoName || basename(resolve(projectDir));
  const written: string[] = [];
  for (const [filename, tail, body] of [
    ["AGENTS.md", AGENTS_TAIL, null],
    ["CLAUDE.md", CLAUDE_TAIL, IMPORT_LINE],
    ["GEMINI.md", GEMINI_TAIL, IMPORT_LINE],
  ] as const) {
    const path = join(projectDir, filename);
    let existing = "";
    try {
      existing = readText(path);
    } catch {
      existing = "";
    }
    writeFileSync(path, renderEngineFile(existing, name, tail, body), "utf8");
    written.push(path);
  }
  return written;
}

/**
 * The one-component solution a fresh repository is, written so the Solution
 * Explorer has something true to show from the first minute.
 *
 * The view was empty in every new project and explained nothing, which is
 * `csv-model`'s item 4. Three things caused that and none of them was a
 * missing writer: nothing scaffolded a manifest, no extension-facing path
 * triggered a projection write, and the view had no welcome state. This is
 * the first.
 *
 * One component, named for the repository, at step 1. It is a real
 * declaration rather than a placeholder -- a repository that has not been
 * decomposed yet IS one component -- so the first thing an operator does to
 * it is split it, not delete it.
 */
export function scaffoldSolutionManifest(projectDir: string): string | null {
  const path = join(projectDir, MANIFEST_RELPATH);
  if (existsSync(path)) return null;
  const name = basename(resolve(projectDir)) || "solution";
  const text = [
    "# What this project is built FROM, as opposed to the work of building",
    "# it. The Solution Explorer renders this joined to live state.",
    "#",
    "# One component to start with, because a repository nobody has",
    "# decomposed yet IS one component. Step 2 of the six-step workflow is",
    "# where it becomes several; until then this is true rather than a",
    "# placeholder.",
    "#",
    "# `dependsOn` is the only direction anyone writes. Who depends on a",
    "# component is derived from it -- two directions kept by hand disagree",
    "# eventually, and the disagreement is silent.",
    "solution:",
    `  name: ${name}`,
    `  title: ${name}`,
    "  step: plan",
    "",
    "components:",
    `  - name: ${name}`,
    "    kind: integration",
    `    title: ${name}`,
    "    step: plan",
    "",
  ].join("\n");
  try {
    writeFileSync(path, text, "utf8");
  } catch {
    return null;
  }
  return path;
}
