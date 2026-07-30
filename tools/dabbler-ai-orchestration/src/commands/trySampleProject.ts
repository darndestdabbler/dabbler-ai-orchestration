// Set 107 S1: VS Code wiring for `Dabbler: Try a sample project`.
//
// The seven-step contract (proposal v3 §5):
//   1. select or create an empty folder     <- here (pickTargetFolder)
//   2. render the versioned sample bundle   <- utils/sampleProject (core)
//   3. git init + baseline commit           <- core, via the git ops below
//   4. write the .dabbler/local-only marker <- core
//   5. create the .venv and install         <- core, via installAiRouter
//   6. open the folder                      <- here
//   7. surface the sample set's start action<- here, after the reload
//
// Steps 6 and 7 straddle a window reload: `vscode.openFolder` restarts the
// extension host, so step 7 cannot simply follow step 6 in one call. The
// landing is therefore recorded in `globalState` before the open and replayed
// by {@link showPendingSampleLanding} on the next activation.

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import simpleGit from "simple-git";
import { installAiRouter, venvPython } from "../utils/aiRouterInstall";
import { makeFileOps, makeSpawner } from "./installAiRouterCommands";
import {
  describeMissingPython,
  probePythonPresence,
  resolveExplicitPythonPath,
  resolveScaffoldBootstrapPython,
} from "../utils/pythonInterpreter";
import {
  GIT_MISSING_MESSAGE,
  INSTALL_FAILED_RETRY_ACTION,
  INSTALL_FAILED_SHOW_LOG_ACTION,
  REFUSE_NON_EMPTY_CANCEL,
  REFUSE_NON_EMPTY_RETRY,
  RESUME_ACTION,
  RESUME_CANCEL_ACTION,
  RESUME_START_OVER_ACTION,
  SAMPLE_PICKER_LABEL,
  SAMPLE_PICKER_TITLE,
  SAMPLE_PROGRESS,
  STARTER_LINE_COPIED,
  SUCCESS_NEXT_STEP_ACTION,
  SampleBundle,
  SampleGitOps,
  SampleProjectResult,
  SampleStep,
  buildSampleStarterLine,
  classifyTargetFolder,
  createSampleProject,
  describeError,
  describeInstallFailure,
  describeNonEmptyFolder,
  describeResumableSample,
  describeSuccess,
  loadSampleBundle,
  renderInstallFailureLog,
  renderManualInstallCommands,
  resolveBundledSampleDir,
  sampleOwnedTopLevelEntries,
} from "../utils/sampleProject";

/** `globalState` key carrying a landing across the `openFolder` reload. */
export const PENDING_SAMPLE_LANDING_KEY = "dabbler.pendingSampleLanding";

/** What {@link showPendingSampleLanding} needs to replay after the reload. */
export interface PendingSampleLanding {
  folder: string;
  slug: string;
}

// ---------- step 1: the folder ----------

/**
 * Resolve the folder to build into: ask, classify, and loop on a refusal.
 *
 * Returns the chosen folder plus the steps a previous attempt already
 * finished (empty for a fresh folder). Returns null when the operator
 * cancels at any point.
 */
export async function pickTargetFolder(
  bundle: Pick<SampleBundle, "meta" | "files">,
  io: {
    showOpenDialog: () => Promise<string | undefined>;
    showWarning: (
      msg: string,
      ...actions: string[]
    ) => Promise<string | undefined>;
    exists: (p: string) => boolean;
    readFile: (p: string) => string;
    listDir: (p: string) => string[];
    removeRecursive: (p: string) => void;
  },
): Promise<{ folder: string; resumeFrom: SampleStep[] } | null> {
  // Bounded rather than `while (true)`: a misbehaving dialog stub (or a
  // future caller wiring it wrong) must not spin forever.
  for (let attempt = 0; attempt < 20; attempt++) {
    const folder = await io.showOpenDialog();
    if (!folder) return null;

    const verdict = classifyTargetFolder(folder, bundle.meta.bundleVersion, io);
    if (verdict.kind === "empty") return { folder, resumeFrom: [] };

    if (verdict.kind === "resumable") {
      const answer = await io.showWarning(
        describeResumableSample(folder, verdict.nextStep),
        RESUME_ACTION,
        RESUME_START_OVER_ACTION,
        RESUME_CANCEL_ACTION,
      );
      if (answer === RESUME_ACTION) {
        return { folder, resumeFrom: verdict.marker.completedSteps };
      }
      if (answer === RESUME_START_OVER_ACTION) {
        // Remove only what this command created, then rebuild from scratch.
        // The list is DERIVED from the bundle (plus `.dabbler` / `.git`), so
        // a stale file from a different bundle version cannot survive and a
        // hand-maintained list cannot fall behind. Anything the developer
        // added themselves is untouched: Start Over never eats work the
        // product did not write.
        for (const rel of sampleOwnedTopLevelEntries(bundle)) {
          io.removeRecursive(path.join(folder, rel));
        }
        return { folder, resumeFrom: [] };
      }
      return null;
    }

    // Someone else's non-empty folder: refuse by name, offer another.
    const answer = await io.showWarning(
      describeNonEmptyFolder(folder),
      REFUSE_NON_EMPTY_RETRY,
      REFUSE_NON_EMPTY_CANCEL,
    );
    if (answer !== REFUSE_NON_EMPTY_RETRY) return null;
  }
  return null;
}

// ---------- the real adapters ----------

/** Recursive file listing, relative to `absDir`, forward-slashed. */
export function listFilesRecursiveSync(absDir: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, prefix: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), rel);
      else if (entry.isFile()) out.push(rel);
    }
  };
  walk(absDir, "");
  return out.sort();
}

/**
 * The real git operations, repository-local only.
 *
 * `setLocalIdentity` writes `git config --local`, never `--global` (v3 §12.3):
 * the developer's machine may have no identity at all, and mutating their
 * global config to fix our sample would be an unacceptable side effect. The
 * repo-local write also means the developer's AI agent can commit here later
 * without configuring anything.
 */
export function makeSampleGitOps(): SampleGitOps {
  return {
    isAvailable: async () => {
      try {
        await simpleGit().raw(["--version"]);
        return true;
      } catch {
        return false;
      }
    },
    init: async (dir) => {
      // Set 107 S1 verification round 1 (Major 1): `checkIsRepo()` answers
      // "is this path INSIDE a repository", not "is this path a repository
      // root". A developer very commonly picks an empty child folder inside
      // an existing checkout (~/projects/their-repo/sample), and the old
      // check then reported true, skipped `git init`, and pointed every
      // later step at the PARENT repo -- writing our identity into their
      // repository's config and sweeping their unrelated work into our
      // `git add -A` commits. Test for a `.git` entry in THIS directory
      // instead: a nested repository is exactly what the sample wants, and
      // only a real re-run on the sample's own root should skip init.
      if (!fs.existsSync(path.join(dir, ".git"))) {
        await simpleGit(dir).init();
      }
    },
    setLocalIdentity: async (dir, name, email) => {
      const git = simpleGit(dir);
      await git.addConfig("user.name", name, false, "local");
      await git.addConfig("user.email", email, false, "local");
    },
    commitAll: async (dir, message) => {
      const git = simpleGit(dir);
      await git.add(["-A"]);
      const status = await git.status();
      if (status.staged.length === 0) return; // nothing to record
      await git.commit(message);
    },
  };
}

// ---------- steps 6-7: the landing ----------

/**
 * Replay the post-`openFolder` landing recorded before the reload: the
 * success toast whose button copies the sample set's starter line.
 *
 * Increment A deliberately exposes the EXISTING copy-the-starter-line
 * affordance rather than a new `Start work` command (v3 §12.2). The landing is
 * consumed (cleared) whether or not the operator presses the button, so it can
 * never re-fire on a later window open.
 */
export async function showPendingSampleLanding(
  context: vscode.ExtensionContext,
  io: {
    openFolders: string[];
    showInfo: (msg: string, ...actions: string[]) => Promise<string | undefined>;
    copyToClipboard: (text: string) => Promise<void>;
    setStatus: (msg: string) => void;
  },
): Promise<boolean> {
  const pending = context.globalState.get<PendingSampleLanding>(
    PENDING_SAMPLE_LANDING_KEY,
  );
  if (!pending) return false;
  // Only fire in the window that actually opened the sample. A landing
  // recorded for folder A must not greet someone who opened folder B.
  const matches = io.openFolders.some(
    (f) => path.resolve(f) === path.resolve(pending.folder),
  );
  if (!matches) return false;

  await context.globalState.update(PENDING_SAMPLE_LANDING_KEY, undefined);
  const answer = await io.showInfo(describeSuccess(), SUCCESS_NEXT_STEP_ACTION);
  if (answer === SUCCESS_NEXT_STEP_ACTION) {
    await io.copyToClipboard(buildSampleStarterLine(pending.slug));
    io.setStatus(STARTER_LINE_COPIED);
  }
  return true;
}

// ---------- the command ----------

export function registerTrySampleProjectCommand(
  context: vscode.ExtensionContext,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("dabbler.trySampleProject", async () => {
      await runTrySampleProject(context);
    }),
  );
  // Steps 6-7 land here on the activation that follows `openFolder`.
  void showPendingSampleLanding(context, {
    openFolders: (vscode.workspace.workspaceFolders ?? []).map(
      (f) => f.uri.fsPath,
    ),
    showInfo: (msg, ...actions) =>
      Promise.resolve(vscode.window.showInformationMessage(msg, ...actions)),
    copyToClipboard: (text) => Promise.resolve(vscode.env.clipboard.writeText(text)),
    setStatus: (msg) => vscode.window.setStatusBarMessage(msg, 5000),
  });
}

/**
 * One reused output channel for the whole extension host. Creating a fresh
 * channel per failure would leave an undisposed channel (and a duplicate entry
 * in the Output dropdown) behind on every retry.
 */
let sampleChannel: vscode.OutputChannel | undefined;
function sampleOutputChannel(): vscode.OutputChannel {
  if (!sampleChannel) {
    sampleChannel = vscode.window.createOutputChannel("Dabbler: Sample Project");
  }
  return sampleChannel;
}

async function runTrySampleProject(
  context: vscode.ExtensionContext,
): Promise<void> {
  // The bundle is loaded FIRST: a packaged extension that cannot render the
  // sample must say so before it asks the operator to pick a folder.
  let bundle: SampleBundle;
  try {
    bundle = loadSampleBundle(resolveBundledSampleDir(context.extensionPath), {
      readFile: (p) => fs.readFileSync(p, "utf8"),
      listFilesRecursive: listFilesRecursiveSync,
    });
  } catch (err) {
    vscode.window.showErrorMessage(
      `The sample project could not be loaded from the installed extension: ${describeError(err)}`,
    );
    return;
  }

  const picked = await pickTargetFolder(bundle, {
    showOpenDialog: async () => {
      const chosen = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: SAMPLE_PICKER_LABEL,
        title: SAMPLE_PICKER_TITLE,
      });
      return chosen?.[0]?.fsPath;
    },
    showWarning: (msg, ...actions) =>
      Promise.resolve(vscode.window.showWarningMessage(msg, ...actions)),
    exists: (p) => fs.existsSync(p),
    readFile: (p) => fs.readFileSync(p, "utf8"),
    listDir: (p) => fs.readdirSync(p),
    removeRecursive: (p) => {
      if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
    },
  });
  if (!picked) return;
  const { folder, resumeFrom } = picked;

  // Python pre-flight BEFORE any durable write (the Set 077 A10 rule): a
  // missing base interpreter must fail friendly and leave no half-made
  // project behind.
  if (!probePythonPresence(folder)) {
    vscode.window.showErrorMessage(
      describeMissingPython("Try a sample project"),
    );
    return;
  }
  const bootstrapPython =
    resolveScaffoldBootstrapPython(folder) ?? resolveExplicitPythonPath(folder);

  const result = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Creating your sample project...",
      cancellable: false,
    },
    async (progress) =>
      createSampleProject({
        targetDir: folder,
        bundle,
        fileOps: makeFileOps(),
        git: makeSampleGitOps(),
        resumeFrom,
        reportProgress: (m) => progress.report({ message: m }),
        installRouter: async () => {
          const outcome = await installAiRouter({
            workspaceRoot: folder,
            pythonPath: bootstrapPython,
            spawner: makeSpawner(),
            fileOps: makeFileOps(),
            prompts: {
              // No prompts: choosing "Try a sample project" IS the consent.
              pickSource: async () => "pypi",
              confirmCreateVenv: async () => true,
              promptGitHubRef: async () => "",
            },
            reportProgress: (m) => progress.report({ message: m }),
          });
          return {
            ok: outcome.ok,
            message: outcome.message,
            venvPath: outcome.venvPath,
          };
        },
      }),
  );

  if (!result.ok) {
    await reportSampleFailure(folder, bootstrapPython, result);
    return;
  }

  // Step 6 + the handoff to step 7. Record the landing BEFORE opening: the
  // open reloads the extension host, so anything after it in this function
  // is not guaranteed to run.
  await context.globalState.update(PENDING_SAMPLE_LANDING_KEY, {
    folder,
    slug: bundle.meta.sampleSetSlug,
  } satisfies PendingSampleLanding);
  const alreadyOpen = (vscode.workspace.workspaceFolders ?? []).some(
    (f) => path.resolve(f.uri.fsPath) === path.resolve(folder),
  );
  if (alreadyOpen) {
    // No reload will happen, so replay the landing inline.
    await showPendingSampleLanding(context, {
      openFolders: [folder],
      showInfo: (msg, ...actions) =>
        Promise.resolve(vscode.window.showInformationMessage(msg, ...actions)),
      copyToClipboard: (text) =>
        Promise.resolve(vscode.env.clipboard.writeText(text)),
      setStatus: (msg) => vscode.window.setStatusBarMessage(msg, 5000),
    });
    return;
  }
  await vscode.commands.executeCommand(
    "vscode.openFolder",
    vscode.Uri.file(folder),
  );
}

/**
 * Surface a failed run without a traceback (v3 §12.4). The toast leads with
 * the reassurance and the resume path; the output channel carries the exact
 * commands, with real absolute paths, that finish the job by hand.
 */
async function reportSampleFailure(
  folder: string,
  bootstrapPython: string,
  result: SampleProjectResult,
): Promise<void> {
  const reason = result.failureReason ?? "no further detail available";

  if (result.failedStep === "git") {
    vscode.window.showErrorMessage(GIT_MISSING_MESSAGE);
    return;
  }
  if (result.failedStep !== "install") {
    vscode.window.showErrorMessage(
      `The sample project could not be created in '${folder}': ${reason}`,
    );
    return;
  }

  const channel = sampleOutputChannel();
  channel.appendLine(
    renderInstallFailureLog(
      folder,
      reason,
      renderManualInstallCommands(
        folder,
        bootstrapPython,
        venvPython(path.join(folder, ".venv")),
      ),
    ),
  );
  const answer = await vscode.window.showWarningMessage(
    describeInstallFailure(folder, reason),
    INSTALL_FAILED_SHOW_LOG_ACTION,
    INSTALL_FAILED_RETRY_ACTION,
  );
  if (answer === INSTALL_FAILED_SHOW_LOG_ACTION) {
    channel.show(true);
  } else if (answer === INSTALL_FAILED_RETRY_ACTION) {
    await vscode.commands.executeCommand("dabbler.trySampleProject");
  }
}
