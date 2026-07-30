// Set 107 S1: the pure core behind `Dabbler: Try a sample project`.
//
// The command creates a small, local, hostless sample project so a developer
// on their first 15 minutes with the product can watch an AI session change
// real code, see tests go green, and run the program -- without typing git,
// YAML, host configuration or governance settings (proposal v3 §5).
//
// Everything here is dependency-injected and free of `vscode`, so the Layer-2
// suite drives the whole seven-step contract -- including the forced step-5
// failure and the resume that follows it -- with no real subprocesses, no real
// git, and no real network. The VS Code wiring lives in
// `commands/trySampleProject.ts`.
//
// The canonical bundle is `docs/templates/sample-project/` at the repo root,
// copied into `dist/templates/sample-project/` by esbuild.js. It is the single
// source of truth shared by this command, by `docs/tutorials/hello-world.md`,
// and by the smoke test (proposal v3 §6) -- deliberately NOT a copy of a
// cold-start or UAT fixture, which are test artifacts rather than a
// user-facing contract.

import * as path from "path";
import { FileOps } from "./aiRouterInstall";

// ---------- the bundle ----------

/** Relative location of the bundle inside the packaged extension. */
export function resolveBundledSampleDir(extensionPath: string): string {
  return path.join(extensionPath, "dist", "templates", "sample-project");
}

/** The machine-readable half of `bundle.json`. */
export interface SampleBundleMeta {
  bundleVersion: number;
  sampleSetSlug: string;
  tier: string;
  programEntryPoint: string;
  testCommandArgs: string[];
  /**
   * How many tests the sample ships. Asserted by the smoke test against the
   * real `Ran N tests` output, both before and after the change -- so the
   * declared number is enforced by execution rather than trusted.
   */
  expectedTestCount: number;
  expectedProgramOutput: string[];
  /**
   * The function the sample deliberately ships WITHOUT -- the reason the suite
   * starts red and the thing the sample's task asks for. Modelled here (rather
   * than left as prose) so the "the sample starts red" claim is asserted
   * against `bundle.json` instead of a hand-copied literal.
   */
  missingFunction: string;
}

/** A loaded bundle: its metadata plus the tree to render, keyed by rel path. */
export interface SampleBundle {
  meta: SampleBundleMeta;
  /** Rendered-output relative path -> file content. Forward-slashed. */
  files: Record<string, string>;
}

/**
 * Translate a bundle-side filename to its rendered name. A basename beginning
 * `dot-` renders with a leading `.` instead, so a dotfile shipped in the
 * bundle (`.gitignore`) does not take effect inside THIS repository's
 * `docs/templates/` tree. Basename-only, applied at every depth.
 */
export function renderedBasename(name: string): string {
  return name.startsWith("dot-") ? `.${name.slice(4)}` : name;
}

/** Apply {@link renderedBasename} to every segment of a relative path. */
export function renderedRelPath(relPath: string): string {
  return relPath
    .split(/[\\/]/)
    .filter((s) => s.length > 0)
    .map(renderedBasename)
    .join("/");
}

/** The filesystem surface {@link loadSampleBundle} needs. */
export interface BundleReadIo {
  readFile: (absPath: string) => string;
  /** Relative paths of every FILE under `absDir`, at any depth. */
  listFilesRecursive: (absDir: string) => string[];
}

/**
 * Load the bundle from `bundleDir` (its `bundle.json` plus every file under
 * `files/`). Line endings are normalized to LF on read for the same reason
 * `loadTemplateBundle` does it: a CRLF checkout must not change the bytes the
 * sample renders, and the smoke test compares program output literally.
 *
 * Throws on a malformed or incomplete bundle -- a packaged extension that
 * cannot render the sample is a build defect, not a recoverable runtime state.
 */
export function loadSampleBundle(
  bundleDir: string,
  io: BundleReadIo,
): SampleBundle {
  const metaRaw = io.readFile(path.join(bundleDir, "bundle.json"));
  const meta = JSON.parse(metaRaw) as SampleBundleMeta;
  // Every field is required, because every field is load-bearing: the command
  // reads the slug, the smoke test reads the program/test expectations, and
  // Session 2's tutorial quotes them. A missing field is a build defect.
  for (const key of [
    "bundleVersion",
    "sampleSetSlug",
    "tier",
    "programEntryPoint",
    "testCommandArgs",
    "expectedTestCount",
    "expectedProgramOutput",
    "missingFunction",
  ] as const) {
    if (meta[key] === undefined || meta[key] === null) {
      throw new Error(`sample bundle: bundle.json is missing "${key}"`);
    }
  }
  const filesDir = path.join(bundleDir, "files");
  const files: Record<string, string> = {};
  for (const rel of io.listFilesRecursive(filesDir)) {
    const content = io.readFile(path.join(filesDir, rel)).replace(/\r\n/g, "\n");
    files[renderedRelPath(rel)] = content;
  }
  if (Object.keys(files).length === 0) {
    throw new Error(`sample bundle: no files found under ${filesDir}`);
  }
  return { meta, files };
}

// ---------- the seven-step contract ----------

/**
 * The steps the CORE owns. Step 1 (choose the folder) is decided by the VS
 * Code layer before the core runs, and steps 6-7 (open the folder, surface the
 * start affordance) are wiring the core cannot perform. The core's job is
 * exactly the part that can fail destructively and must therefore be
 * resumable.
 */
export type SampleStep = "render" | "git" | "marker" | "install";

export const SAMPLE_STEPS: SampleStep[] = ["render", "git", "marker", "install"];

/**
 * Plain-language name of each step, used in the resume prompt ("the last
 * attempt stopped while {step}"). Written for a stranger: no product jargon,
 * no step numbers the reader never saw.
 */
export const SAMPLE_STEP_PHRASE: Record<SampleStep, string> = {
  render: "creating the sample files",
  git: "setting up version history for the folder",
  marker: "recording that this project is local only",
  install: "creating the .venv folder and installing dabbler-ai-router",
};

/** Relative path of the resume marker this command writes and removes. */
export const SAMPLE_MARKER_REL = ".dabbler/sample-in-progress.json";
/** Relative path of the sanctioned local-only marker (ai_router contract). */
export const LOCAL_ONLY_REL = ".dabbler/local-only";
/**
 * Directory the PyPI install seeds `router-config.yaml` into. Removed after a
 * successful install on this Lightweight sample -- see the step-5 comment.
 */
export const SEEDED_ROUTER_DIR = "ai_router";

/** The resume marker's on-disk shape. */
export interface SampleMarker {
  bundleVersion: number;
  /** Steps finished so far, in {@link SAMPLE_STEPS} order. */
  completedSteps: SampleStep[];
  startedAt: string;
}

/**
 * The banner + audit note written into `.dabbler/local-only`.
 *
 * `ai_router.gate_checks.is_local_only` reads the marker's PRESENCE only and
 * never parses its contents (documented in `ai_router/local_only.py`), so this
 * body is free-form context for a human who opens the file. It deliberately
 * mirrors the banner `local_only.py --enable` writes, and names this command
 * as the writer, because at step 4 there is no venv yet to run the Python CLI
 * in -- step 5 is what creates it.
 */
export function renderLocalOnlyMarker(nowIso: string): string {
  return (
    "# .dabbler/local-only -- this repository is deliberately remote-less.\n" +
    "# The close-out push gate (ai_router.gate_checks.check_pushed_to_remote)\n" +
    "# passes-with-note instead of failing on the missing upstream, but ONLY\n" +
    "# while no git remote is configured. See ai_router/docs/close-out.md.\n" +
    `enabled_at: ${nowIso}\n` +
    "enabled_by: Dabbler: Try a sample project\n" +
    "reason: The Dabbler sample project is local only by design -- no git " +
    "host account, no remote repository.\n"
  );
}

/**
 * The top-level entries "Start Over" may delete: every top-level segment the
 * bundle itself renders, plus the two directories the command creates on its
 * own (`.dabbler` for the markers, `.git` for the repo it inits).
 *
 * Derived from the bundle rather than hand-listed, so a bundle that grows a
 * new top-level directory cannot leave a stale copy of it behind. Everything
 * NOT in this set is the developer's own, and Start Over never touches it.
 */
export function sampleOwnedTopLevelEntries(
  bundle: Pick<SampleBundle, "files">,
): string[] {
  const owned = new Set<string>([".dabbler", ".git"]);
  for (const rel of Object.keys(bundle.files)) {
    const top = rel.split("/")[0];
    if (top) owned.add(top);
  }
  return [...owned].sort();
}

// ---------- folder classification (step 1) ----------

export type FolderVerdict =
  | { kind: "empty" }
  | { kind: "resumable"; marker: SampleMarker; nextStep: SampleStep }
  | { kind: "non-empty" };

/** The filesystem surface {@link classifyTargetFolder} needs. */
export interface FolderClassifyIo {
  exists: (absPath: string) => boolean;
  readFile: (absPath: string) => string;
  /** Entry names directly inside `absDir` (files and directories). */
  listDir: (absDir: string) => string[];
}

/**
 * Decide what the chosen folder is: empty (proceed), carrying THIS command's
 * own resume marker (offer to pick up where it stopped), or someone else's
 * non-empty folder (refuse by name).
 *
 * This is the v3 §12.3 defect made testable. Step 5 fails AFTER steps 2-4 have
 * rendered files and created a repo, so without this classification a retry
 * hits step 1's empty-folder refusal and rejects the project it just made. A
 * marker whose `bundleVersion` does not match the installed bundle is NOT
 * resumable -- the half-rendered tree came from a different extension version,
 * so resuming it would mix two file sets. It reads as `non-empty`, and the
 * operator's "Start Over" is the honest path.
 */
export function classifyTargetFolder(
  targetDir: string,
  bundleVersion: number,
  io: FolderClassifyIo,
): FolderVerdict {
  const markerAbs = path.join(targetDir, SAMPLE_MARKER_REL);
  if (io.exists(markerAbs)) {
    let marker: SampleMarker | null = null;
    try {
      marker = JSON.parse(io.readFile(markerAbs)) as SampleMarker;
    } catch {
      marker = null;
    }
    if (
      marker &&
      marker.bundleVersion === bundleVersion &&
      Array.isArray(marker.completedSteps)
    ) {
      const next = SAMPLE_STEPS.find(
        (s) => !marker!.completedSteps.includes(s),
      );
      // Every step already done but the marker survived: the previous run
      // died between its last step and the marker cleanup. Nothing is left
      // to redo, so resume from the final step (idempotent) rather than
      // refusing a folder that is, in fact, a finished sample.
      return {
        kind: "resumable",
        marker,
        nextStep: next ?? SAMPLE_STEPS[SAMPLE_STEPS.length - 1],
      };
    }
    return { kind: "non-empty" };
  }
  const entries = io.exists(targetDir) ? io.listDir(targetDir) : [];
  return entries.length === 0 ? { kind: "empty" } : { kind: "non-empty" };
}

// ---------- the core run ----------

/** The git operations the core needs. Repo-local only -- never global. */
export interface SampleGitOps {
  /** True when a usable `git` is on PATH. */
  isAvailable: () => Promise<boolean>;
  init: (dir: string) => Promise<void>;
  /**
   * Set `user.name` / `user.email` in the repository's OWN config
   * (`git config --local`). v3 §12.3: the baseline commit fails on a machine
   * with no identity, which is exactly the true cold start this targets.
   * Repository-local -- not a per-command `-c` override -- because the
   * developer's AI agent commits in this repo later too, and it must inherit
   * a working identity without the developer configuring one.
   */
  setLocalIdentity: (dir: string, name: string, email: string) => Promise<void>;
  commitAll: (dir: string, message: string) => Promise<void>;
}

export interface SampleInstallOutcome {
  ok: boolean;
  /** Already shortened to one line by the caller; never a raw traceback. */
  message: string;
  venvPath: string | null;
}

export interface SampleProjectDeps {
  targetDir: string;
  bundle: SampleBundle;
  fileOps: FileOps;
  git: SampleGitOps;
  /** Create the `.venv` and install `dabbler-ai-router`. Must never throw. */
  installRouter: () => Promise<SampleInstallOutcome>;
  reportProgress?: (msg: string) => void;
  /** Injectable clock (ISO-8601 string). */
  nowIso?: () => string;
  /**
   * Steps already finished by a previous attempt, from the resume marker.
   * Omitted for a fresh folder.
   */
  resumeFrom?: SampleStep[];
}

export interface SampleProjectResult {
  ok: boolean;
  /** Rendered relative paths written this run (empty on a resume past render). */
  written: string[];
  /** The step that did not finish, or null when everything succeeded. */
  failedStep: SampleStep | null;
  /** One-line reason, already free of tracebacks. */
  failureReason: string | null;
  /** Steps finished across this run AND any previous attempt. */
  completedSteps: SampleStep[];
  venvPath: string | null;
}

const IDENTITY_NAME = "Dabbler Sample";
const IDENTITY_EMAIL = "sample@dabbler.local";
const BASELINE_COMMIT = "The Dabbler sample project";
const MARKER_COMMIT = "Record that this project is local only";

/**
 * Run steps 2-5 of the contract against `targetDir`, resuming past any step
 * the previous attempt already finished.
 *
 * Never throws: every failure is reported as `{ok: false, failedStep, ...}` so
 * the caller can compose an actionable, traceback-free message (v3 §12.4). The
 * resume marker is refreshed after EVERY completed step and removed only on
 * full success -- so an interrupted run always leaves a folder the next
 * attempt recognises rather than one it refuses.
 */
export async function createSampleProject(
  deps: SampleProjectDeps,
): Promise<SampleProjectResult> {
  const report = deps.reportProgress ?? (() => {});
  const nowIso = deps.nowIso ?? (() => new Date().toISOString());
  const done = new Set<SampleStep>(deps.resumeFrom ?? []);
  const written: string[] = [];
  let venvPath: string | null = null;
  const startedAt = nowIso();

  const writeMarker = (): void => {
    const marker: SampleMarker = {
      bundleVersion: deps.bundle.meta.bundleVersion,
      completedSteps: SAMPLE_STEPS.filter((s) => done.has(s)),
      startedAt,
    };
    deps.fileOps.writeFile(
      path.join(deps.targetDir, SAMPLE_MARKER_REL),
      `${JSON.stringify(marker, null, 2)}\n`,
    );
  };
  const fail = (step: SampleStep, reason: string): SampleProjectResult => {
    // Persist progress before returning, so the failing step is exactly the
    // step the next attempt resumes from.
    try {
      writeMarker();
    } catch {
      // A marker write that fails leaves the folder non-empty and
      // unresumable. That is worse UX but never data loss, and the caller's
      // message already tells the operator the folder is theirs to inspect.
    }
    return {
      ok: false,
      written,
      failedStep: step,
      failureReason: reason,
      completedSteps: SAMPLE_STEPS.filter((s) => done.has(s)),
      venvPath,
    };
  };

  // --- step 2: render the bundle -------------------------------------
  if (!done.has("render")) {
    report(SAMPLE_PROGRESS.render);
    try {
      for (const [rel, content] of Object.entries(deps.bundle.files)) {
        deps.fileOps.writeFile(path.join(deps.targetDir, rel), content);
        written.push(rel);
      }
    } catch (err) {
      return fail("render", describeError(err));
    }
    done.add("render");
    writeMarker();
  }

  // --- step 3: git init + repo-local identity + baseline commit -------
  if (!done.has("git")) {
    report(SAMPLE_PROGRESS.git);
    if (!(await deps.git.isAvailable())) {
      return fail("git", "git was not found on PATH");
    }
    try {
      await deps.git.init(deps.targetDir);
      await deps.git.setLocalIdentity(
        deps.targetDir,
        IDENTITY_NAME,
        IDENTITY_EMAIL,
      );
      await deps.git.commitAll(deps.targetDir, BASELINE_COMMIT);
    } catch (err) {
      return fail("git", describeError(err));
    }
    done.add("git");
    writeMarker();
  }

  // --- step 4: the sanctioned local-only marker -----------------------
  if (!done.has("marker")) {
    report(SAMPLE_PROGRESS.marker);
    try {
      deps.fileOps.writeFile(
        path.join(deps.targetDir, LOCAL_ONLY_REL),
        renderLocalOnlyMarker(nowIso()),
      );
      // Its own commit rather than an amend: the contract orders the
      // baseline commit before this marker, and close-out's
      // working_tree_clean gate must find nothing uncommitted afterwards.
      await deps.git.commitAll(deps.targetDir, MARKER_COMMIT);
    } catch (err) {
      return fail("marker", describeError(err));
    }
    done.add("marker");
    writeMarker();
  }

  // --- step 5: the venv + dabbler-ai-router --------------------------
  // The step that breaks on a corporate network, VPN or proxy, and the first
  // thing many developers will ever see this product do (v3 §12.4). It is
  // also the reason the whole run has to be resumable: everything above it
  // has already written to the folder by the time it fails.
  if (!done.has("install")) {
    report(SAMPLE_PROGRESS.install);
    const outcome = await deps.installRouter();
    venvPath = outcome.venvPath;
    if (!outcome.ok) {
      return fail("install", outcome.message);
    }
    // The Lightweight divergence, same rule the Getting Started scaffold
    // applies: the PyPI install seeds `ai_router/router-config.yaml` into the
    // workspace (it ships as package data), and the sample is Lightweight --
    // router-OFF, no provider keys, no metered spend. Leaving the config
    // behind would put a directory full of routing configuration into a
    // project whose whole promise is that it is tiny, which is the cognitive
    // load this command exists to remove. The bundle renders nothing under
    // `ai_router/`, so the entire directory is our own byproduct and safe to
    // drop -- guarded on exactly that, so a future bundle that DOES ship
    // something there keeps it.
    if (!Object.keys(deps.bundle.files).some((rel) => rel.startsWith(`${SEEDED_ROUTER_DIR}/`))) {
      try {
        deps.fileOps.removeRecursive(path.join(deps.targetDir, SEEDED_ROUTER_DIR));
      } catch {
        // Non-fatal: an undeleted config is clutter, never a broken sample.
      }
    }
    done.add("install");
  }

  // Full success: retire the resume marker. `.dabbler/local-only` stays --
  // it is the durable record the close-out push gate reads.
  try {
    deps.fileOps.removeRecursive(path.join(deps.targetDir, SAMPLE_MARKER_REL));
  } catch {
    // Non-fatal: a leftover marker only means the next run on this folder
    // offers to resume a sample that is already complete, which is
    // idempotent (see classifyTargetFolder's all-steps-done branch).
  }

  return {
    ok: true,
    written,
    failedStep: null,
    failureReason: null,
    completedSteps: [...SAMPLE_STEPS],
    venvPath,
  };
}

/**
 * Reduce any thrown value to one operator-facing line. Never a stack trace:
 * step 5's failure text is a first-run experience, and a raw traceback is the
 * exact thing v3 §12.4 rules out.
 */
export function describeError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !isStackFrame(l));
  return lines.slice(-2).join(" / ") || "no further detail available";
}

/**
 * True for the noise lines of a stack trace in either language: Node's
 * `at <fn> (<file>:<line>)` frames, Python's `Traceback (most recent call
 * last):` header and its `File "...", line N, in <fn>` frames, and the
 * source-echo line that follows a Python frame.
 */
function isStackFrame(line: string): boolean {
  if (line === "Traceback (most recent call last):") return true;
  if (/^at\s/.test(line)) return true;
  if (/^File ".*", line \d+/.test(line)) return true;
  // The `^^^^` caret line Python prints under the offending expression.
  if (/^\^+$/.test(line)) return true;
  return false;
}

// ---------- the user-facing strings ----------
//
// Set 107 S1 step 2b: routed (`task_type=documentation`, gemini-2.5-pro,
// anthropic excluded) and saved raw at
// `docs/session-sets/107-first-run-rescue/s1-first-run-strings.json`. The
// routed round's own auto-verification returned a Major against
// `installFailed.message` -- it omitted the required "nothing was lost"
// reassurance -- which is folded in below.
//
// House rules these strings are held to: ASCII only (a Windows cp1252 console
// must be able to encode every character); written for a stranger at a low
// reading level; no product jargon the reader has not been taught yet; and the
// shortest string that does the job, because cognitive load IS the defect this
// set exists to fix.

export const SAMPLE_PICKER_LABEL = "Create Sample Project";
export const SAMPLE_PICKER_TITLE = "Select an Empty Folder for the Sample Project";

export const SAMPLE_PROGRESS: Record<SampleStep | "open", string> = {
  render: "Creating sample files...",
  git: "Setting up version history...",
  marker: "Recording that this project is local only...",
  install: "Installing Python packages...",
  open: "Opening project folder...",
};

export const REFUSE_NON_EMPTY_RETRY = "Choose Again";
export const REFUSE_NON_EMPTY_CANCEL = "Cancel";

export function describeNonEmptyFolder(folder: string): string {
  return (
    `The folder '${folder}' must be empty. This prevents overwriting your ` +
    `files. Please choose a different folder.`
  );
}

export const RESUME_ACTION = "Resume";
export const RESUME_START_OVER_ACTION = "Start Over";
export const RESUME_CANCEL_ACTION = "Cancel";

export function describeResumableSample(
  folder: string,
  nextStep: SampleStep,
): string {
  return (
    `The sample project in '${folder}' is incomplete. The last attempt ` +
    `stopped while ${SAMPLE_STEP_PHRASE[nextStep]}. Do you want to resume ` +
    `or start over?`
  );
}

export const GIT_MISSING_MESSAGE =
  "Git was not found on your system. The sample project needs Git to keep a " +
  "history of your changes. Install it from https://git-scm.com/downloads " +
  "and then run 'Dabbler: Try a sample project' again.";

export const INSTALL_FAILED_SHOW_LOG_ACTION = "Show Log";
export const INSTALL_FAILED_RETRY_ACTION = "Retry Install";
export const MANUAL_COMMANDS_HEADING =
  "To finish installing by hand, run these commands in a terminal:";
export const PROXY_HINT =
  "If you are on a corporate network or VPN, you may need to set the " +
  "HTTPS_PROXY environment variable, or add a --proxy option to the pip " +
  "command above.";

/**
 * The toast shown when step 5 fails. Leads with the reassurance -- the folder
 * is fine and nothing was lost -- because the reader's real question is "did I
 * just break something", and an unanswered one is what makes people abandon a
 * tutorial. The exact commands go to the output channel, which the toast's
 * "Show Log" button opens.
 */
export function describeInstallFailure(folder: string, reason: string): string {
  return (
    `The sample project in '${folder}' was created successfully and nothing ` +
    `was lost. Only the Python package install did not finish: ${reason}. ` +
    `Run 'Dabbler: Try a sample project' on the same folder to pick up where ` +
    `it stopped.`
  );
}

/**
 * The exact commands the developer can run themselves, with real absolute
 * paths -- v3 §12.4's requirement that step 5's failure "must immediately
 * output the exact terminal command they need to run manually". Composed here
 * (rather than in the toast) so the Layer-2 suite pins the real paths.
 */
export function renderManualInstallCommands(
  targetDir: string,
  bootstrapPython: string,
  venvPythonPath: string,
): string[] {
  return [
    `cd "${targetDir}"`,
    `"${bootstrapPython}" -m venv .venv`,
    `"${venvPythonPath}" -m pip install dabbler-ai-router`,
  ];
}

/** The whole output-channel block for a step-5 failure. */
export function renderInstallFailureLog(
  folder: string,
  reason: string,
  commands: string[],
): string {
  return [
    describeInstallFailure(folder, reason),
    "",
    MANUAL_COMMANDS_HEADING,
    ...commands.map((c) => `  ${c}`),
    "",
    PROXY_HINT,
  ].join("\n");
}

export const SUCCESS_NEXT_STEP_ACTION = "Copy Starter Prompt";

export function describeSuccess(): string {
  return (
    "Your sample project is ready. To start the first AI task, copy the " +
    "starter prompt and paste it into your AI chat."
  );
}

export const STARTER_LINE_COPIED =
  "Copied to clipboard. Paste it into your AI chat to begin.";

/**
 * The starter line itself. Deliberately identical to what
 * `dabbler.copyStartNextSessionPrompt` produces for the same set -- increment A
 * exposes the EXISTING affordance rather than inventing a second one
 * (v3 §12.2), so the two must never drift.
 */
export function buildSampleStarterLine(slug: string): string {
  return `Start the next session of \`${slug}\`.`;
}
