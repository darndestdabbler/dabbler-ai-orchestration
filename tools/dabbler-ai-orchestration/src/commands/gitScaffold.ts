import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import simpleGit from "simple-git";
import {
  installAiRouter,
  FileOps,
  InstallSource,
  ProcessSpawner,
  ROUTER_CONFIG_REL,
} from "../utils/aiRouterInstall";
import { makeSpawner, makeFileOps } from "./installAiRouterCommands";
import { resolveExplicitPythonPath } from "../utils/pythonInterpreter";
import {
  BootstrapContext,
  TemplateBundle,
  Tier,
  buildSlug,
  loadTemplateBundle,
  renderConsumerBootstrap,
  renderStructureBootstrap,
  resolveBundledTemplateDir,
  structureOnlyContext,
  DEFAULT_VERIFICATION_MODE,
} from "../utils/consumerBootstrap";

// ---------- pure scaffolding core (tested without VS Code) ----------

export interface ScaffoldDeps {
  /** Absolute path to the consumer repo being scaffolded. */
  projectDir: string;
  ctx: BootstrapContext;
  bundle: TemplateBundle;
  fileOps: FileOps;
  /**
   * Install ``dabbler-ai-router`` into ``projectDir`` (venv + pip). Both
   * tiers install the package — Lightweight is router-off, not Python-off.
   * Returns an outcome; never throws (the scaffold's durable deliverable is
   * the rendered artifacts, so an install failure is surfaced, not fatal).
   */
  installRouter: () => Promise<{ ok: boolean; message: string }>;
  reportProgress?: (msg: string) => void;
  /**
   * Set 060 S2 (spec D5): render the structure artifacts only — engine
   * files + start-here.md, NO starter session set. The Getting Started
   * form path sets this; the legacy QuickPick flow (which prompts for a
   * starter set's title) leaves it unset.
   */
  structureOnly?: boolean;
}

export interface ScaffoldResult {
  written: string[];
  skipped: string[];
  installOk: boolean;
  installMessage: string;
  /** True when the Lightweight divergence removed a seeded router-config.yaml. */
  routerConfigRemoved: boolean;
}

/**
 * Render and write the consumer-bootstrap artifacts, then run the
 * tier-aware install. The artifacts are identical across tiers (engine
 * files, start-here.md, templated spec.md + session-state.json); the
 * ONLY divergence the design lock allows is router config — Full keeps
 * the ``ai_router/router-config.yaml`` the install seeds, Lightweight
 * does not (``tier: lightweight`` in the spec is the switch instead).
 *
 * Existing files are never clobbered — a path that already exists is
 * recorded in ``skipped`` and left untouched (a re-scaffold of a repo
 * that already has engine files is a no-op for those files).
 */
export async function scaffoldConsumerRepo(
  deps: ScaffoldDeps,
): Promise<ScaffoldResult> {
  const report = deps.reportProgress ?? (() => {});
  const { files } = deps.structureOnly
    ? renderStructureBootstrap(deps.bundle, deps.ctx)
    : renderConsumerBootstrap(deps.bundle, deps.ctx);

  const written: string[] = [];
  const skipped: string[] = [];
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(deps.projectDir, rel);
    if (deps.fileOps.exists(abs)) {
      skipped.push(rel);
      continue;
    }
    deps.fileOps.writeFile(abs, content); // writeFile mkdirps the parent
    written.push(rel);
  }

  report(
    deps.ctx.tier === "full"
      ? "Installing dabbler-ai-router (venv + router config)…"
      : "Installing dabbler-ai-router (venv; router stays off for Lightweight)…",
  );
  const install = await deps.installRouter();

  // Lightweight divergence: the install seeds ai_router/router-config.yaml
  // (it ships as package data). Lightweight is router-off — `tier:
  // lightweight` in the spec is the only switch, and no router config is
  // written on that path (Set 058 non-goal). Remove the seeded file so the
  // scaffold matches the design lock.
  let routerConfigRemoved = false;
  if (deps.ctx.tier === "lightweight") {
    const cfg = path.join(deps.projectDir, ROUTER_CONFIG_REL);
    if (deps.fileOps.exists(cfg)) {
      deps.fileOps.removeRecursive(cfg);
      routerConfigRemoved = true;
    }
  }

  return {
    written,
    skipped,
    installOk: install.ok,
    installMessage: install.message,
    routerConfigRemoved,
  };
}

// ---------- VS Code wiring ----------

async function pickDirectory(): Promise<string | undefined> {
  const picked = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: "Select project folder",
  });
  return picked?.[0]?.fsPath;
}

/** Narrow an untrusted value (e.g. a wizard command arg) to a Tier. */
export function asTier(value: unknown): Tier | undefined {
  return value === "full" || value === "lightweight" ? value : undefined;
}

async function promptTier(): Promise<Tier | undefined> {
  const picked = await vscode.window.showQuickPick(
    [
      {
        label: "Full",
        description: "AI router + automatic cross-provider verification",
        detail:
          "Routed reasoning, metered API calls, router-config.yaml. The default.",
        value: "full" as Tier,
      },
      {
        label: "Lightweight",
        description: "Router off — zero metered API calls",
        detail:
          "Same Python lifecycle, state handling, and close-out as Full. Router-off, NOT Python-off: still gets .venv + dabbler-ai-router. Verification is out-of-band or dedicated sessions.",
        value: "lightweight" as Tier,
      },
    ],
    {
      placeHolder: "Choose the tier for this project's first session set",
      ignoreFocusOut: true,
    },
  );
  return picked?.value;
}

/** Today's date as ``YYYY-MM-DD`` in local time. */
function isoDate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function registerGitScaffoldCommand(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("dabbler.setupNewProject", async (arg?: { tier?: string }) => {
      // Set 059: the Get Started wizard forwards the tier the operator already
      // picked. When present and valid we skip the redundant tier prompt below;
      // when absent (Command Palette invocation) we prompt as before.
      const preselectedTier = asTier(arg?.tier);

      // Step 1: pick folder
      const projectDir = await pickDirectory();
      if (!projectDir) return;

      // Step 2: git init (skip if already a repo)
      const git = simpleGit(projectDir);
      const isRepo = await git.checkIsRepo().catch(() => false);
      if (!isRepo) {
        const confirm = await vscode.window.showWarningMessage(
          `Initialize a new git repository in ${path.basename(projectDir)}?`,
          { modal: true },
          "Initialize"
        );
        if (confirm !== "Initialize") return;
        await git.init();
        vscode.window.showInformationMessage("Git repository initialized.");
      }

      // Step 3: choose tier (the single declarative switch). Honor the
      // wizard's preselection when provided; otherwise prompt.
      const tier = preselectedTier ?? (await promptTier());
      if (!tier) return;

      // Step 4: gather the first session set's details. Tier is per-set, so
      // the scaffold seeds one starter set whose spec.md carries `tier:`.
      const setTitle = (
        await vscode.window.showInputBox({
          prompt: "Title for the first session set",
          placeHolder: "e.g. User authentication",
          ignoreFocusOut: true,
          validateInput: (v) =>
            v.trim().length === 0 ? "A title is required." : undefined,
        })
      )?.trim();
      if (!setTitle) return;

      const purpose =
        (
          await vscode.window.showInputBox({
            prompt: "One-sentence purpose of this session set",
            placeHolder: "e.g. Add email + password sign-in.",
            ignoreFocusOut: true,
          })
        )?.trim() || "<one-sentence purpose>";

      const totalRaw = await vscode.window.showInputBox({
        prompt: "How many sessions in this set?",
        value: "3",
        ignoreFocusOut: true,
        validateInput: (v) =>
          /^[1-9]\d*$/.test(v.trim()) ? undefined : "Enter a positive integer.",
      });
      if (totalRaw === undefined) return;
      const totalSessions = parseInt(totalRaw.trim(), 10);

      const ctx: BootstrapContext = {
        repoName: path.basename(projectDir),
        setTitle,
        purpose,
        slug: buildSlug(1, setTitle),
        created: isoDate(),
        tier,
        verificationMode: DEFAULT_VERIFICATION_MODE,
        totalSessions,
      };

      // Step 5: load the bundled template set and scaffold artifacts +
      // tier-aware install, all under one progress notification.
      let bundle: TemplateBundle;
      try {
        bundle = loadTemplateBundle(resolveBundledTemplateDir(context.extensionPath));
      } catch (err) {
        vscode.window.showErrorMessage(
          `Could not load the consumer-bootstrap template bundle: ${err instanceof Error ? err.message : String(err)}`,
        );
        return;
      }

      const pythonPath = resolveExplicitPythonPath(projectDir);
      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Scaffolding project…",
          cancellable: false,
        },
        async (progress) =>
          scaffoldConsumerRepo({
            projectDir,
            ctx,
            bundle,
            fileOps: makeFileOps(),
            reportProgress: (m) => progress.report({ message: m }),
            installRouter: () =>
              installAiRouter({
                workspaceRoot: projectDir,
                pythonPath,
                spawner: makeSpawner(),
                fileOps: makeFileOps(),
                prompts: makeScaffoldInstallPrompts(),
                reportProgress: (m) => progress.report({ message: m }),
              }),
          }),
      );

      const summary =
        `Scaffolded ${result.written.length} file(s)` +
        (result.skipped.length ? `, skipped ${result.skipped.length} existing` : "") +
        `. ${result.installOk ? "ai-router installed." : `Router install needs attention: ${result.installMessage}`}`;
      if (result.installOk) {
        vscode.window.showInformationMessage(summary);
      } else {
        vscode.window.showWarningMessage(
          `${summary} You can finish the install later with "Dabbler: Install ai-router".`,
        );
      }

      // Step 6: worktree opt-in (unchanged).
      const worktreeAnswer = await vscode.window.showInformationMessage(
        "Set up git worktrees for parallel session sets? (Recommended for large projects)",
        { modal: true },
        "Yes — set up worktrees",
        "No — keep it simple"
      );

      if (worktreeAnswer === "Yes — set up worktrees") {
        try {
          // Need at least one commit before adding worktrees
          const status = await git.status();
          if (status.files.length > 0 || !(await git.log().catch(() => null))) {
            await git.commit("init", { "--allow-empty": null });
          }
          const worktreesDir = path.join(projectDir, "worktrees");
          if (!fs.existsSync(worktreesDir)) fs.mkdirSync(worktreesDir, { recursive: true });
          await git.raw(["worktree", "add", path.join(worktreesDir, "main"), "HEAD"]);
          vscode.window.showInformationMessage(
            "Worktrees set up. Work from worktrees/main/ for parallel sessions."
          );
        } catch (err) {
          vscode.window.showWarningMessage(
            `Worktree setup skipped: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }

      // Step 7: open folder. The cold-start chain lives in
      // docs/dabbler/start-here.md — once the folder is open the operator
      // (or their orchestrator) just runs "start the next session".
      const openFolder = await vscode.window.showInformationMessage(
        `Project scaffolded (${tier} tier). Open the folder, then tell your AI orchestrator "start the next session" — docs/dabbler/start-here.md drives the rest.`,
        "Open Folder"
      );
      if (openFolder === "Open Folder") {
        vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(projectDir));
      } else {
        vscode.commands.executeCommand("dabbler.getStarted");
      }
    })
  );
}

/**
 * Non-interactive install prompts for the scaffold path: the operator has
 * already committed to setting up a project, so default to PyPI, auto-
 * accept venv creation, and use the latest released tag. (The standalone
 * ``Dabbler: Install ai-router`` command keeps the full interactive
 * prompts for the explicit re-install / fork-tracking cases.)
 */
function makeScaffoldInstallPrompts() {
  return {
    pickSource: async (): Promise<InstallSource> => "pypi",
    confirmCreateVenv: async (): Promise<boolean> => true,
    promptGitHubRef: async (): Promise<string> => "",
  };
}

// ---------- Set 060 S2: no-prompt Getting Started entry (spec D5) ----------

/**
 * Build the project structure into ``projectDir`` with NO interactive
 * prompts (Set 060 S2, spec D5): no folder picker (the caller resolves
 * the open workspace folder, or runs the folder fallback first), no
 * git-init confirmation modal (clicking "Build project structure" IS the
 * consent — the scaffold's whole job is to set the folder up), no
 * session-set title / purpose / count prompts (no starter set is seeded;
 * step 3's decomposition prompt creates the real sets), and no worktree
 * opt-in modal (the parallel checkbox + the S3 worktree note cover that
 * concept on the new surface).
 *
 * Tier comes from the form's Full/Lightweight radio. Both tiers get the
 * venv + ``dabbler-ai-router`` install; Lightweight removes the seeded
 * router config (the Set 058 sole divergence) via the shared
 * {@link scaffoldConsumerRepo} path.
 */
export async function buildProjectStructureNoPrompt(
  context: vscode.ExtensionContext,
  projectDir: string,
  tier: Tier,
): Promise<ScaffoldResult | undefined> {
  // git init, silently when needed. The folder is the operator's chosen
  // project folder and the repo-layout standard expects a git repo;
  // surfacing a modal here would re-create the dead-end flow UAT
  // rejected on 0.28.0. checkIsRepo failures fall through to init.
  try {
    const git = simpleGit(projectDir);
    const isRepo = await git.checkIsRepo().catch(() => false);
    if (!isRepo) await git.init();
  } catch (err) {
    // Non-fatal: the durable deliverable is the rendered artifacts.
    console.warn("[gettingStarted] git init failed — continuing scaffold", err);
  }

  let bundle: TemplateBundle;
  try {
    bundle = loadTemplateBundle(resolveBundledTemplateDir(context.extensionPath));
  } catch (err) {
    vscode.window.showErrorMessage(
      `Could not load the consumer-bootstrap template bundle: ${err instanceof Error ? err.message : String(err)}`,
    );
    return undefined;
  }

  const ctx = structureOnlyContext(path.basename(projectDir), tier, isoDate());
  const pythonPath = resolveExplicitPythonPath(projectDir);
  const result = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Building project structure…",
      cancellable: false,
    },
    async (progress) =>
      scaffoldConsumerRepo({
        projectDir,
        ctx,
        bundle,
        fileOps: makeFileOps(),
        structureOnly: true,
        reportProgress: (m) => progress.report({ message: m }),
        installRouter: () =>
          installAiRouter({
            workspaceRoot: projectDir,
            pythonPath,
            spawner: makeSpawner(),
            fileOps: makeFileOps(),
            prompts: makeScaffoldInstallPrompts(),
            reportProgress: (m) => progress.report({ message: m }),
          }),
      }),
  );

  const summary =
    `Project structure built (${tier} tier): ${result.written.length} file(s) written` +
    (result.skipped.length ? `, ${result.skipped.length} existing kept` : "") +
    `. ${result.installOk ? "ai-router installed." : `Router install needs attention: ${result.installMessage}`}`;
  if (result.installOk) {
    vscode.window.showInformationMessage(summary);
  } else {
    vscode.window.showWarningMessage(
      `${summary} You can finish the install later with "Dabbler: Install ai-router".`,
    );
  }
  return result;
}
