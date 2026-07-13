import * as vscode from "vscode";
import * as cp from "child_process";
import * as os from "os";
import * as path from "path";
import simpleGit from "simple-git";
import {
  installAiRouter,
  FileOps,
  InstallOutcome,
  InstallSource,
  ROUTER_CONFIG_REL,
  venvPython,
} from "../utils/aiRouterInstall";
import { makeSpawner, makeFileOps } from "./installAiRouterCommands";
import { resolveCopilotCliBinary } from "../utils/copilotCli";
import {
  KillEffects,
  RefreshChildSpawner,
  SeatSetupOutcome,
  TransportProfile,
  clearCopilotSeatStatusMarker,
  currentUsername,
  deriveSeatId,
  deriveSeatLabel,
  describeSeatSetupOutcome,
  describeSkipInstallIncompleteHonesty,
  dispatchKill,
  performCopilotSeatSetup,
  rerunRefreshHint,
  spawnDetached,
  writeCopilotSeatStatusMarker,
} from "../utils/copilotSeatSetup";
import { providerKeyPresent } from "../utils/gettingStartedDetection";
import {
  describeMissingPython,
  probePythonPresence,
  resolveExplicitPythonPath,
  resolveScaffoldBootstrapPython,
} from "../utils/pythonInterpreter";
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
import { ensureModulesManifest } from "../utils/moduleAuthoring";
import {
  TIER_MARKER_REL,
  VERIFICATION_MODE_MARKER_REL,
  writeTierMarker,
  writeVerificationModeMarker,
} from "../utils/tierMarkerStore";
import { VerificationMode } from "../types";
import { makeUtf8ChunkDecoder } from "../utils/utf8ChunkDecoder";

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
   * skip reported via ``budgetOutcome``. Set 081 S1: callers gate this
   * on the Direct-API sub-choice — a Copilot-seat Build passes no
   * budget, so no budget.yaml is written on that path.
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

  // Set 094 (adjudication A): create docs/modules.yaml from the canonical
  // template on this EXPLICIT scaffold action (the Build project structure
  // button / the setupNewProject palette command — audited as the only
  // callers, never activation). ensureModulesManifest is the SOLE writer of
  // the manifest (it is deliberately NOT in the template bundle's static
  // file set), so there is one creator, skip-existing, both tiers. FileOps
  // structurally satisfies EnsureManifestIo (mkdirp + the O_EXCL
  // writeFileExclusive), so the scaffold's exclusive create is the SAME
  // symlink-safe primitive the interactive Open paths use — a dangling
  // manifest symlink fails EEXIST, never followed. Reported in
  // written/skipped so the scaffold summary count stays honest.
  const ensured = ensureModulesManifest(deps.projectDir, deps.fileOps);
  (ensured.created ? written : skipped).push(ensured.manifestRel);

  // Set 077 S2 (Feature 1, A1 + Critique-2 M1/M2): persist the operator's
  // choice as durable markers, written by the same path that shapes the
  // scaffold. Deliberately OUTSIDE the no-clobber loop above — the markers
  // are write-through caches of the latest sanctioned choice, so a
  // re-scaffold with a different tier updates them even though the
  // scaffold artifacts themselves are kept. The tier marker is
  // tier-agnostic by design and stays unconditional.
  writeTierMarker(deps.projectDir, deps.ctx.tier, deps.fileOps);
  written.push(TIER_MARKER_REL);
  // Set 082: the verification-mode marker is Lightweight-only — the mode
  // machinery is inert on Full, so a Full scaffold has no choice to
  // record and writes no marker. On Full the marker is neither written
  // nor deleted: a prior Lightweight pick survives a Full re-scaffold
  // untouched (the marker's write-through-cache semantics preserve the
  // latest *sanctioned* choice, and a tier round-trip back to
  // Lightweight should find it intact — the Set 081 "hiding never
  // clears" posture).
  if (deps.ctx.tier === "lightweight") {
    // Narrow, never cast (S2 review, Minor 4): an unrecognized
    // ctx.verificationMode would round-trip to null on read, silently
    // dropping the choice the marker exists to preserve. ctx values come
    // from internal callers, so normalize to the default rather than
    // throwing on a caller bug.
    const markerMode: VerificationMode =
      deps.ctx.verificationMode === "dedicated-sessions"
        ? "dedicated-sessions"
        : "out-of-band-or-none";
    writeVerificationModeMarker(deps.projectDir, markerMode, deps.fileOps);
    written.push(VERIFICATION_MODE_MARKER_REL);
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

/**
 * Narrow an untrusted value (e.g. a wizard command arg or a webview
 * message rider) to a Tier.
 *
 * Set 077 S2 (A11): case-insensitive, and FAIL-LOUD on unknown values —
 * the pre-077 exact-match narrowing let callers' `?? "full"` fallbacks
 * silently convert a typo'd or case-variant tier into a Full scaffold.
 * Absent input (undefined / null) still returns undefined so callers
 * can apply their documented defaults (the radio's checked default, the
 * palette's tier prompt); a PRESENT-but-unrecognized value throws. The
 * throw is confined to the scaffold/form narrowing paths, which catch
 * it early and operator-visibly (error toast / rejected form action) —
 * no close-path or Explorer reader consumes this function.
 */
export function asTier(value: unknown): Tier | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") {
    const v = value.toLowerCase();
    if (v === "full" || v === "lightweight") return v;
  }
  throw new Error(
    `Unrecognized tier value ${JSON.stringify(value)} — expected "full" or "lightweight".`,
  );
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
      // (programmatic callers); otherwise prompt. Set 077 S2 (A11): an
      // unrecognized preselection fails loud (error toast) instead of
      // silently scaffolding Full.
      let preselected: Tier | undefined;
      try {
        preselected = asTier(arg?.tier);
      } catch (err) {
        vscode.window.showErrorMessage(
          `Could not set up the project: ${err instanceof Error ? err.message : String(err)}`,
        );
        return;
      }
      const tier = preselected ?? (await promptTier());
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
 *
 * Set 077 S3 (Feature 2): ``verificationMode`` carries the form's
 * Lightweight verification-mode pick into the scaffold context (the
 * durable ``.dabbler/verification-mode`` marker + the templated docs).
 * Callers without a pick (the Command Palette) leave it unset and the
 * documented default applies.
 *
 * Set 079 S2 (Feature 1): ``transportProfile`` carries the form's
 * Full-tier seat-profile pick. On ``"copilot-cli"`` — and ONLY after the
 * existing scaffold sequence (venv → pip install → template render)
 * reports ``installOk`` (spec Sequencing, critique C2) — the guided
 * Copilot seat setup runs: a cancellable catalog refresh through the
 * scaffolded venv's own interpreter, then the ``transport.profile``
 * template write on ≥2 confirmed providers. Callers without a pick
 * (the Command Palette, Lightweight builds) leave it unset; ``"api"``
 * is a no-op — the seeded default already IS api.
 *
 * ``seams`` (S2 verification round 2): test-only injection points so the
 * Layer-2 suite drives THIS function — the real build path — and pins
 * the scaffold→seat-setup ordering, the venvPath threading, and the
 * install-failed skip branch without real subprocesses, git, or a
 * template bundle on disk. Production callers never pass it.
 */
export interface BuildStructureSeams {
  probePython?: typeof probePythonPresence;
  gitInit?: (projectDir: string) => Promise<void>;
  loadBundle?: () => TemplateBundle;
  /**
   * Replaces the whole withProgress scaffold step (render + install).
   * Set 081 S1: receives the EFFECTIVE budget (undefined under the
   * copilot-cli profile) so Layer-2 tests can assert the caller
   * condition without running the real install.
   */
  runScaffold?: (
    ctx: BootstrapContext,
    bundle: TemplateBundle,
    pythonPath: string,
    budget?: BudgetChoice,
  ) => Promise<{ result: ScaffoldResult; installOutcome: InstallOutcome | null }>;
  seatSetup?: typeof runCopilotSeatSetupWithProgress;
  showWarning?: (msg: string) => void;
  showInfo?: (msg: string) => void;
  /**
   * Set 097 (spec D1, extended after S1 discovery Majors 1-2): keep the
   * durable "chose Copilot" marker in sync with THIS build's explicit
   * Full-tier pick. `chosen: true` writes "unconfirmed" (the pick is
   * copilot-cli, before the attempt's outcome is known); `chosen: false`
   * clears a stale marker (the pick is explicitly "api" — an operator who
   * rebuilds choosing Direct API has abandoned an earlier unconfirmed
   * Copilot attempt, and the note must not revive forever with no
   * dismissal path). Never invoked for Lightweight builds or callers that
   * pass no `transportProfile` at all (the legacy Command Palette flow) —
   * neither is an explicit answer to the Copilot question, so neither
   * writes nor clears. Production default is the real writer/clearer;
   * Layer-2 tests inject a capture instead of touching disk.
   */
  recordSeatChoice?: (projectDir: string, chosen: boolean) => void;
}

export async function buildProjectStructureNoPrompt(
  context: vscode.ExtensionContext,
  projectDir: string,
  tier: Tier,
  budget?: BudgetChoice,
  verificationMode?: VerificationMode,
  transportProfile?: TransportProfile,
  seams: BuildStructureSeams = {},
): Promise<ScaffoldResult | undefined> {
  // Set 077 S3 (A10, Critique-2 M7): the Python pre-flight is the FIRST,
  // side-effect-free step — it runs before git init, the marker writes,
  // and the template rendering, so a missing base interpreter fails
  // friendly and leaves NO setup artifacts behind (instead of the venv
  // creation dying later with `spawn python ENOENT` buried in a warning
  // summary after the durable writes already landed).
  if (!(seams.probePython ?? probePythonPresence)(projectDir)) {
    vscode.window.showErrorMessage(
      describeMissingPython("Build project structure"),
    );
    return undefined;
  }

  // git init, silently when needed. The folder is the operator's chosen
  // project folder and the repo-layout standard expects a git repo;
  // surfacing a modal here would re-create the dead-end flow UAT
  // rejected on 0.28.0. checkIsRepo failures fall through to init.
  try {
    if (seams.gitInit) {
      await seams.gitInit(projectDir);
    } else {
      const git = simpleGit(projectDir);
      const isRepo = await git.checkIsRepo().catch(() => false);
      if (!isRepo) await git.init();
    }
  } catch (err) {
    // Non-fatal: the durable deliverable is the rendered artifacts.
    console.warn("[gettingStarted] git init failed — continuing scaffold", err);
  }

  let bundle: TemplateBundle;
  try {
    bundle = seams.loadBundle
      ? seams.loadBundle()
      : loadTemplateBundle(resolveBundledTemplateDir(context.extensionPath));
  } catch (err) {
    vscode.window.showErrorMessage(
      `Could not load the consumer-bootstrap template bundle: ${err instanceof Error ? err.message : String(err)}`,
    );
    return undefined;
  }

  const ctx = structureOnlyContext(
    path.basename(projectDir),
    tier,
    isoDate(),
    verificationMode,
  );
  // Set 081 S1: a Copilot-seat Build writes no budget.yaml — the budget
  // governs metered provider-API verification spend, which the
  // copilot-cli profile excludes by design (docs/concepts/tier-model.md),
  // and absence has documented compat defaults (docs/budget-yaml-schema.md).
  // Caller-side condition only: writeBudgetYaml itself is unchanged, and
  // the action handler already drops the rider (this is the last line of
  // defense for direct callers of this function).
  const effectiveBudget =
    transportProfile === "copilot-cli" ? undefined : budget;
  // S3 verification round 1 (Major 1): spawn the SAME interpreter the
  // pre-flight validated — on a python3-only POSIX host the probe
  // passes on `python3`, so the bootstrap must invoke `python3`, not
  // the legacy bare-`python` default (which would recreate the exact
  // post-durable-write ENOENT the pre-flight exists to prevent). The
  // legacy resolver remains only as a race fallback (interpreter
  // removed between probe and spawn) — ensureVenv still fails loud.
  const pythonPath =
    resolveScaffoldBootstrapPython(projectDir) ??
    resolveExplicitPythonPath(projectDir);
  // Set 079 S2: the scaffold step returns the install outcome alongside
  // the result so the Copilot seat setup below can reuse the SAME venv
  // the install exercised (its `venvPath`), instead of re-deriving an
  // interpreter. The whole step sits behind the `runScaffold` seam so
  // Layer-2 tests can drive the real build path without real
  // subprocesses (S2 verification round 2).
  const runScaffold: NonNullable<BuildStructureSeams["runScaffold"]> =
    seams.runScaffold ??
    (async (scaffoldCtx, scaffoldBundle, scaffoldPython, scaffoldBudget) => {
      let installOutcome: InstallOutcome | null = null;
      const scaffolded = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Building project structure…",
          cancellable: false,
        },
        async (progress) =>
          scaffoldConsumerRepo({
            projectDir,
            ctx: scaffoldCtx,
            bundle: scaffoldBundle,
            fileOps: makeFileOps(),
            structureOnly: true,
            budget: scaffoldBudget,
            reportProgress: (m) => progress.report({ message: m }),
            installRouter: async () => {
              installOutcome = await installAiRouter({
                workspaceRoot: projectDir,
                pythonPath: scaffoldPython,
                spawner: makeSpawner(),
                fileOps: makeFileOps(),
                prompts: makeScaffoldInstallPrompts(),
                reportProgress: (m) => progress.report({ message: m }),
              });
              return installOutcome;
            },
          }),
      );
      return { result: scaffolded, installOutcome };
    });
  const { result, installOutcome } = await runScaffold(
    ctx,
    bundle,
    pythonPath,
    effectiveBudget,
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
  const showInfo =
    seams.showInfo ?? ((m: string) => void vscode.window.showInformationMessage(m));
  const showWarning =
    seams.showWarning ?? ((m: string) => void vscode.window.showWarningMessage(m));
  if (result.installOk) {
    showInfo(summary);
  } else {
    showWarning(
      `${summary} You can finish the install later with "Dabbler: Install ai-router".`,
    );
  }

  // ---------- Set 079 S2 (Feature 1): the Copilot seat setup ----------
  // Runs strictly AFTER the scaffold sequence above (venv → pip install →
  // template render) and only when it succeeded — the refresh imports
  // `ai_router` from the scaffolded venv, so it cannot be a pre-flight
  // (spec Sequencing, critique C2). Awaited HERE, before the caller's
  // possible `vscode.openFolder` (which reloads the extension host and
  // would kill a still-running refresh mid-probe).
  const venvPath = installOutcome?.venvPath ?? null;
  const seatDecision = decideCopilotSeatSetup(
    tier,
    transportProfile,
    result.installOk,
    venvPath,
  );
  // Set 097 (spec D1, extended after S1 discovery Majors 1-2): record THIS
  // build's explicit Full-tier pick durably BEFORE dispatching. "run" and
  // "skip-install-incomplete" both mean "the operator chose Copilot" — the
  // persistent System Status note must survive an attempt that never even
  // reaches the refresh (no venv to run it in). An explicit "api" pick
  // means the operator abandoned (or never made) that choice this time —
  // clear a stale marker so a note from an earlier unconfirmed attempt
  // cannot revive forever. Lightweight builds and callers with no
  // transportProfile at all (the legacy Command Palette flow) answer
  // neither question, so neither writes nor clears.
  const recordSeatChoice =
    seams.recordSeatChoice ??
    ((dir: string, chosen: boolean) => {
      const ops = makeFileOps();
      if (chosen) writeCopilotSeatStatusMarker(dir, ops);
      else clearCopilotSeatStatusMarker(dir, ops);
    });
  if (tier === "full" && transportProfile === "copilot-cli") {
    recordSeatChoice(projectDir, true);
  } else if (tier === "full" && transportProfile === "api") {
    recordSeatChoice(projectDir, false);
  }
  switch (seatDecision) {
    case "run":
      await (seams.seatSetup ?? runCopilotSeatSetupWithProgress)(
        context,
        projectDir,
        venvPath!,
      );
      break;
    case "skip-install-incomplete":
      // Honest state, not a silent skip: the operator chose the Copilot
      // seat but the scaffold's install step failed, so the refresh has
      // no venv to run in. router-config.yaml (if seeded) keeps `api`.
      // The S3 honesty suffix applies the same two-honest-states rule as
      // every other failure branch (critique C3): keyless operators are
      // told the router is not functional, never implied-working `api`.
      showWarning(
        "Copilot seat setup was skipped because the ai-router install did " +
          "not complete — the seat setup runs inside the scaffolded .venv. " +
          "Finish the install (\"Dabbler: Install ai-router\"), then " +
          rerunRefreshHint() +
          ". " +
          describeSkipInstallIncompleteHonesty(providerKeyPresent(process.env)),
      );
      break;
    case "skip-not-selected":
      break;
  }
  return result;
}

/**
 * The sequencing gate as a pure decision (S2 verification Major: the
 * "refresh runs only after a successful scaffold/install" rule must be
 * pinned by Layer-2 tests, not just implied by call order). Inputs are
 * exactly the completed scaffold's observable outcome, so by
 * construction the seat setup cannot be decided — let alone run —
 * before the scaffold sequence has finished:
 *   - Copilot not selected (any tier, `api`, or no profile) → nothing runs;
 *   - selected but the install failed or produced no venv → the honest
 *     skip warning (the refresh has no interpreter to run in);
 *   - selected and the install succeeded → run the guided seat setup.
 */
export function decideCopilotSeatSetup(
  tier: Tier,
  transportProfile: TransportProfile | undefined,
  installOk: boolean,
  venvPath: string | null | undefined,
): "run" | "skip-not-selected" | "skip-install-incomplete" {
  if (tier !== "full" || transportProfile !== "copilot-cli") {
    return "skip-not-selected";
  }
  if (!installOk || !venvPath) return "skip-install-incomplete";
  return "run";
}

/** The child subset the real kill effects need. */
interface KillableChild {
  pid?: number;
  kill(): unknown;
}

/** The spawn subset {@link makeRealKillEffects} needs — returns a handle
 * whose async `error` event is the only signal a missing/blocked taskkill
 * gives (it does NOT throw synchronously). */
export type TaskkillSpawn = (
  cmd: string,
  args: string[],
  opts: { windowsHide: boolean },
) => { on(event: "error", cb: (err: Error) => void): unknown };

/**
 * The REAL {@link KillEffects} for a spawned refresh child — exported so
 * the Layer-2 suite can pin the async taskkill-error fallback (S3
 * verification round 1) by injecting a fake spawn.
 */
export function makeRealKillEffects(
  child: KillableChild,
  spawnFn: TaskkillSpawn = (cmd, args, opts) => cp.spawn(cmd, args, opts),
): KillEffects {
  return {
    taskkillTree: (pid) => {
      const tk = spawnFn("taskkill", ["/pid", String(pid), "/T", "/F"], {
        windowsHide: true,
      });
      // spawn reports a missing/blocked taskkill via the async `error`
      // event, not a sync throw (S3 review finding 3) — fall back to the
      // plain kill from there.
      tk.on("error", () => child.kill());
    },
    signalGroup: (pid) => process.kill(-pid, "SIGTERM"),
    plainKill: () => child.kill(),
  };
}

/** Real `child_process.spawn` adapter for the refresh runner. */
function makeRefreshChildSpawner(): RefreshChildSpawner {
  return (cmd, args, opts, callbacks) => {
    const child = cp.spawn(cmd, args, {
      cwd: opts.cwd,
      env: process.env,
      windowsHide: true,
      // POSIX: run the child as its own process-group leader so a cancel
      // can signal the whole group — python AND its in-flight `copilot`
      // grandchild (S3, the named S2 residual). win32 stays undetached;
      // taskkill /T walks the tree without it.
      detached: spawnDetached(process.platform),
    });
    // Streaming-safe decode (S5 verification R3): a pipe boundary can
    // split a multibyte UTF-8 sequence across `data` chunks; per-chunk
    // toString("utf8") would corrupt it. StringDecoder carries the
    // partial bytes to the next chunk; flush any dangling remainder to
    // the callbacks before the close event.
    const outDec = makeUtf8ChunkDecoder();
    const errDec = makeUtf8ChunkDecoder();
    child.stdout?.on("data", (chunk: Buffer) =>
      callbacks.onStdout(outDec.write(chunk)),
    );
    child.stderr?.on("data", (chunk: Buffer) =>
      callbacks.onStderr(errDec.write(chunk)),
    );
    const flush = () => {
      const outTail = outDec.end();
      if (outTail) callbacks.onStdout(outTail);
      const errTail = errDec.end();
      if (errTail) callbacks.onStderr(errTail);
    };
    child.on("error", (err: Error) => callbacks.onError(err));
    child.on("close", (code: number | null) => {
      flush();
      callbacks.onClose(code);
    });
    return {
      kill: () => {
        // S2 review Minor 3 + S3 residual: the refresh's python child
        // spawns the `copilot` binary as a grandchild; a plain kill()
        // signals only the interpreter and orphans the in-flight probe.
        // Kill the whole tree — taskkill /T on win32, process-group
        // signal on POSIX (the child is its own group leader, above).
        // The dispatch itself is the pinned `dispatchKill`; the effects
        // come from the pinned factory above.
        dispatchKill(process.platform, child.pid, makeRealKillEffects(child));
      },
    };
  };
}

/**
 * Injectable seams for {@link runCopilotSeatSetupWithProgress} — the
 * Layer-2 suite pins the VS Code-layer contract (progress options,
 * venv-interpreter reuse, subscriptions hygiene, per-outcome messaging)
 * through these without a live extension host (S2 verification Major).
 * Production callers omit them and get the real vscode surfaces.
 */
export interface SeatSetupProgressSeams {
  withProgress?: <T>(
    opts: { location: vscode.ProgressLocation; title: string; cancellable: boolean },
    task: (
      progress: { report(v: { message?: string }): void },
      token: vscode.CancellationToken,
    ) => Promise<T>,
  ) => Thenable<T>;
  perform?: typeof performCopilotSeatSetup;
  spawn?: RefreshChildSpawner;
  showInfo?: (msg: string) => void;
  showWarning?: (msg: string) => void;
}

/**
 * VS Code layer over {@link performCopilotSeatSetup}: the cancellable
 * progress notification (INDETERMINATE — the refresh prints nothing
 * until its final summary line, so per-model progress is not parseable;
 * the critique-m2 fallback, decision recorded in copilotSeatSetup.ts),
 * the teardown disposal hook in `context.subscriptions`, and the
 * per-outcome operator messaging.
 */
export async function runCopilotSeatSetupWithProgress(
  context: vscode.ExtensionContext,
  projectDir: string,
  venvPath: string,
  seams: SeatSetupProgressSeams = {},
): Promise<SeatSetupOutcome> {
  const withProgress =
    seams.withProgress ??
    (vscode.window.withProgress.bind(vscode.window) as NonNullable<
      SeatSetupProgressSeams["withProgress"]
    >);
  const perform = seams.perform ?? performCopilotSeatSetup;
  const showInfo =
    seams.showInfo ?? ((m: string) => void vscode.window.showInformationMessage(m));
  const showWarning =
    seams.showWarning ?? ((m: string) => void vscode.window.showWarningMessage(m));

  const seatId = deriveSeatId(os.hostname(), currentUsername());
  const seatLabel = deriveSeatLabel(projectDir);
  const outcome = await withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title:
        "Setting up the Copilot seat — probing the seat's models (about 1–2 minutes)…",
      cancellable: true,
    },
    (_progress, token) =>
      perform({
        venvPythonPath: venvPython(venvPath),
        projectDir,
        seatId,
        seatLabel,
        explicitBinary: resolveCopilotCliBinary(projectDir),
        spawn: seams.spawn ?? makeRefreshChildSpawner(),
        fileOps: makeFileOps(),
        cancellation: token,
        registerDisposal: (dispose) => {
          const d = new vscode.Disposable(dispose);
          context.subscriptions.push(d);
          return {
            // S2 review Minor 4: also splice the Disposable back out of
            // context.subscriptions when the run settles, so repeated
            // builds do not accumulate dead entries for the host's
            // lifetime.
            dispose: () => {
              d.dispose();
              const i = context.subscriptions.indexOf(d);
              if (i >= 0) context.subscriptions.splice(i, 1);
            },
          };
        },
      }),
  );

  // S3 (critique C3 — the corrected failure UX): every outcome message is
  // composed by the pure `describeSeatSetupOutcome`, keyed on the SAME
  // `DABBLER_*` presence probe the Full-tier inline key warning uses —
  // `api` is only ever presented as working when a key actually exists.
  const msg = describeSeatSetupOutcome(
    outcome,
    providerKeyPresent(process.env),
    rerunRefreshHint(),
  );
  (msg.level === "info" ? showInfo : showWarning)(msg.message);
  return outcome;
}
