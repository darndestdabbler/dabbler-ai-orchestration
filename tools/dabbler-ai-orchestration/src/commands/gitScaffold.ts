import * as vscode from "vscode";
import * as path from "path";
import simpleGit from "simple-git";
import {
  installAiRouter,
  FileOps,
  InstallSource,
  ROUTER_CONFIG_REL,
} from "../utils/aiRouterInstall";
import { makeSpawner, makeFileOps } from "./installAiRouterCommands";
import { resolveExplicitPythonPath } from "../utils/pythonInterpreter";
import {
  BootstrapContext,
  TemplateBundle,
  Tier,
  loadTemplateBundle,
  renderConsumerBootstrap,
  renderStructureBootstrap,
  resolveBundledTemplateDir,
  structureOnlyContext,
} from "../utils/consumerBootstrap";
import { BudgetChoice, BudgetWriteOutcome, writeBudgetYaml } from "../utils/budgetYaml";

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
  /**
   * Set 063 S2 (spec D1): the form's budget / NTE pick. Written to
   * ``ai_router/budget.yaml`` at scaffold time on the FULL tier only —
   * Lightweight never writes the file (the Set 058 D3 divergence stays
   * the sole one). No-clobber: an existing budget.yaml is kept and the
   * skip reported via ``budgetOutcome``.
   */
  budget?: BudgetChoice;
  /** Timestamp source for the budget write (injectable for tests). */
  now?: Date;
}

export interface ScaffoldResult {
  written: string[];
  skipped: string[];
  installOk: boolean;
  installMessage: string;
  /** True when the Lightweight divergence removed a seeded router-config.yaml. */
  routerConfigRemoved: boolean;
  /** Budget-write outcome; null when no budget was provided or tier is Lightweight. */
  budgetOutcome: BudgetWriteOutcome | null;
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

  // Set 063 S2 (spec D1): the budget / NTE step's write — Full tier
  // only, no-clobber, post-migration shape (see utils/budgetYaml.ts).
  let budgetOutcome: ScaffoldResult["budgetOutcome"] = null;
  if (deps.budget && deps.ctx.tier === "full") {
    const r = writeBudgetYaml(deps.projectDir, deps.budget, deps.fileOps, deps.now);
    budgetOutcome = r.outcome;
  }

  return {
    written,
    skipped,
    installOk: install.ok,
    installMessage: install.message,
    routerConfigRemoved,
    budgetOutcome,
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

// Set 061 S3 (spec D4): exported so the `Switch Tier…` row action reuses
// this exact two-option copy; the optional placeholder lets that caller
// name the set being switched while this file's callers keep the default.
export async function promptTier(placeHolder?: string): Promise<Tier | undefined> {
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
      placeHolder: placeHolder ?? "Choose the tier for this project's first session set",
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
  // Set 060 S3 (spec S3 step 4): the Command-Palette entry converges on
  // the SAME no-prompt structure-only scaffold the Getting Started form
  // drives (D5). The legacy multi-prompt flow — title / purpose /
  // session-count input boxes (seeding a starter set), the git-init
  // confirmation modal, and the worktree opt-in modal — is retired:
  // session sets come from the form's decomposition prompt (D4), the
  // parallel checkbox + worktree note cover the worktree concept (D7),
  // and operator UAT rejected the prompt-chain dead-ends on 0.28.0.
  // The only prompt left is the tier QuickPick (the palette has no
  // radio); a wizard-style `{ tier }` arg still skips it.
  context.subscriptions.push(
    vscode.commands.registerCommand("dabbler.setupNewProject", async (arg?: { tier?: string }) => {
      // Folder: the open workspace folder, else a picker (same rule as
      // the form's buildStructure handler).
      const openRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const projectDir = openRoot ?? (await pickDirectory());
      if (!projectDir) return;

      // Tier: the single declarative switch. Honor a preselection
      // (programmatic callers); otherwise prompt.
      const tier = asTier(arg?.tier) ?? (await promptTier());
      if (!tier) return;

      await buildProjectStructureNoPrompt(context, projectDir, tier);

      // When we scaffolded a picked (not-open) folder, open it so the
      // Session Set Explorer's Getting Started form tracks the new root.
      if (!openRoot) {
        await vscode.commands.executeCommand(
          "vscode.openFolder",
          vscode.Uri.file(projectDir),
        );
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
 *
 * Set 063 S2 (spec D1): ``budget`` carries the form's Full-tier budget /
 * NTE pick; the scaffold writes ``ai_router/budget.yaml`` (no-clobber)
 * when present. The Command-Palette `setupNewProject` flow has no budget
 * input and leaves it unset — no file is written on that path.
 */
export async function buildProjectStructureNoPrompt(
  context: vscode.ExtensionContext,
  projectDir: string,
  tier: Tier,
  budget?: BudgetChoice,
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
        budget,
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

  // Set 063 S2 (spec D1): name the budget outcome so a kept existing
  // file is reported, not silent (the no-clobber "skip + report" rule).
  const budgetNote =
    result.budgetOutcome === "written"
      ? " Budget saved to ai_router/budget.yaml."
      : result.budgetOutcome === "skipped-exists"
        ? " Existing ai_router/budget.yaml kept (budget input not applied)."
        : "";
  const summary =
    `Project structure built (${tier} tier): ${result.written.length} file(s) written` +
    (result.skipped.length ? `, ${result.skipped.length} existing kept` : "") +
    `. ${result.installOk ? "ai-router installed." : `Router install needs attention: ${result.installMessage}`}` +
    budgetNote;
  if (result.installOk) {
    vscode.window.showInformationMessage(summary);
  } else {
    vscode.window.showWarningMessage(
      `${summary} You can finish the install later with "Dabbler: Install ai-router".`,
    );
  }
  return result;
}
