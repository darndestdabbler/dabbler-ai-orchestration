/**
 * Set 030 Session 5 — in-extension lazy migrator for v2 → v3
 * session-state.json.
 *
 * The bulk migrator (Session 4) ships as a CLI under
 * `python -m ai_router.migrate_session_state`. This command is the
 * single-set front door operators reach via the tree-view context
 * menu on any row flagged "(needs migration)". The subprocess
 * invocation pattern matches the config editor's notification-test
 * path (cp.spawn with windowsHide + env inheritance).
 *
 * Strategy quickpick → CLI flag mapping:
 *   "Use spec.md headings"       → --strategy regex  (default)
 *   "Use AI to refine titles"    → --strategy ai     (Session 5 wires this)
 *   "Use generic labels"         → --strategy generic
 *
 * Both call paths (this command + the bulk CLI) call into the same
 * `migrate_one_set` Python entry point, so the migration semantics
 * are identical regardless of where the operator triggers it.
 *
 * Failure handling: the Python migrator never raises for "file isn't
 * there / file is broken" cases — those come back as structured
 * MigrationResult records (ACTION_SKIPPED_MALFORMED etc.). The
 * command surfaces the result's reason in a notification so the
 * operator can decide whether to hand-repair, run --dry-run, or
 * file an issue.
 *
 * Why no `simulateProcess` injection point: the install-ai-router
 * command splits spawning into a `ProcessSpawner` interface so the
 * Mocha stub harness can drive it deterministically. This command's
 * unit tests live in Playwright (Layer 3), which uses a real Electron
 * process and a real Python — no need for a spawner abstraction.
 */
import * as vscode from "vscode";
import * as cp from "child_process";
import * as path from "path";
import { SessionSet } from "../types";

interface CommandDeps {
  refreshView: () => void;
}

type Strategy = "regex" | "generic" | "ai";

interface StrategyChoice extends vscode.QuickPickItem {
  strategy: Strategy;
  costNote?: string;
}

const STRATEGY_CHOICES: StrategyChoice[] = [
  {
    label: "$(symbol-text)  Use spec.md headings",
    description: "Regex extraction · deterministic · zero cost",
    detail:
      "Reads `### Session K of N: <title>` headings from spec.md. " +
      "Recommended for normal session sets.",
    strategy: "regex",
  },
  {
    label: "$(sparkle)  Use AI to refine titles",
    description: "Routes via ai_router · ~$0.05 / spec · confirm before running",
    detail:
      "Use when spec.md headings are malformed, missing, or you want " +
      "the AI to summarize long headings into ledger-friendly titles. " +
      "Costs are billed against your provider keys.",
    strategy: "ai",
    costNote:
      "AI title extraction will route through ai_router with " +
      "task_type='spec-title-extraction'. Estimated cost: ~$0.05 per spec. " +
      "Continue?",
  },
  {
    label: "$(symbol-numeric)  Use generic labels",
    description: "Fallback · 'Session 001', 'Session 002', …",
    detail:
      "Use when spec.md is intentionally missing or you want neutral, " +
      "stable labels independent of heading drift.",
    strategy: "generic",
  },
];

export function registerMigrateSetCommand(
  context: vscode.ExtensionContext,
  deps: CommandDeps,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "dabblerSessionSets.migrate",
      async (treeItem?: { set?: SessionSet }) => {
        const set = treeItem?.set;
        if (!set) {
          vscode.window.showErrorMessage(
            "Migrate to v3 schema must be invoked from a session-set row " +
              "in the Session Sets view. Right-click a row marked " +
              "'(needs migration)' to use this command.",
          );
          return;
        }
        if (!set.needsMigration) {
          vscode.window.showInformationMessage(
            `${set.name} is already on schema v3 — nothing to migrate.`,
          );
          return;
        }

        const choice = await vscode.window.showQuickPick(STRATEGY_CHOICES, {
          title: `Migrate ${set.name} to v3 schema`,
          placeHolder: "Choose how session titles should be derived",
          ignoreFocusOut: true,
        });
        if (!choice) return; // Cancelled — silent no-op per VS Code convention.

        if (choice.costNote) {
          const confirm = await vscode.window.showWarningMessage(
            choice.costNote,
            { modal: true },
            "Run AI extraction",
          );
          if (confirm !== "Run AI extraction") return;
        }

        await runMigrator(set, choice.strategy, deps);
      },
    ),
  );
}

/**
 * Resolve the python interpreter the same way `installAiRouterCommands`
 * does — explicit config first (workspace folder > workspace > global),
 * then bare "python" on PATH. Inline-duplicated here rather than
 * imported to keep this command's surface independent of the install
 * helper's; the resolution logic is three lines and stable.
 */
function resolvePythonPath(): string {
  const cfg = vscode.workspace.getConfiguration("dabblerSessionSets");
  const inspected = cfg.inspect<string>("pythonPath");
  const explicit =
    inspected?.workspaceFolderValue ??
    inspected?.workspaceValue ??
    inspected?.globalValue;
  return (typeof explicit === "string" && explicit.trim()) || "python";
}

interface MigratorJsonResult {
  scan_root: string;
  strategy: string;
  dry_run: boolean;
  counts: {
    migrated: number;
    skipped_v3: number;
    skipped_no_state: number;
    skipped_malformed: number;
    skipped_operator: number;
    skipped_future_schema: number;
    would_violate: number;
    total: number;
  };
  results: Array<{
    set_dir: string;
    action: string;
    reason?: string;
    error?: string | null;
  }>;
  note?: string;
}

async function runMigrator(
  set: SessionSet,
  strategy: Strategy,
  deps: CommandDeps,
): Promise<void> {
  const python = resolvePythonPath();
  // `--scan` walks `<scan-root>/*/session-state.json`, so we point it
  // at the parent `docs/session-sets/` directory and use `--only` to
  // restrict the run to this set's basename. This matches the same
  // CLI path operators use for bulk migrations — no special
  // "single-set" subcommand needed.
  const scanRoot = path.dirname(set.dir);
  const args = [
    "-m",
    "ai_router.migrate_session_state",
    "--scan",
    scanRoot,
    "--only",
    path.basename(set.dir),
    "--strategy",
    strategy,
    "--in-place",
    "--json",
  ];

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Migrating ${set.name} to v3 schema (${strategy})…`,
      cancellable: false,
    },
    async () => {
      const result = await spawnMigrator(python, args, set.root);
      handleMigrationResult(set, strategy, result, deps);
    },
  );
}

interface SpawnResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  spawnError: string | null;
}

function spawnMigrator(
  python: string,
  args: string[],
  cwd: string,
): Promise<SpawnResult> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let spawnError: string | null = null;
    const child = cp.spawn(python, args, {
      cwd,
      env: process.env,
      windowsHide: true,
    });
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err: Error) => {
      spawnError = err.message;
      resolve({ exitCode: null, stdout, stderr, spawnError });
    });
    child.on("close", (code: number | null) => {
      if (spawnError) return;
      resolve({ exitCode: code, stdout, stderr, spawnError });
    });
  });
}

function handleMigrationResult(
  set: SessionSet,
  strategy: Strategy,
  result: SpawnResult,
  deps: CommandDeps,
): void {
  if (result.spawnError) {
    vscode.window.showErrorMessage(
      `Migration failed — could not spawn Python (${result.spawnError}). ` +
        "Configure `dabblerSessionSets.pythonPath` in Settings to point at " +
        "your Python interpreter, or install ai-router via " +
        "`Dabbler: Install ai-router`.",
    );
    return;
  }

  let parsed: MigratorJsonResult | null = null;
  try {
    parsed = JSON.parse(result.stdout.trim()) as MigratorJsonResult;
  } catch {
    parsed = null;
  }

  if (!parsed || !parsed.results.length) {
    const detail =
      result.stderr.trim() ||
      result.stdout.trim() ||
      `exit code ${result.exitCode ?? "unknown"}`;
    vscode.window.showErrorMessage(
      `Migration of ${set.name} returned unexpected output: ${detail}`,
    );
    return;
  }

  const r = parsed.results[0];
  if (r.action === "migrated") {
    vscode.window.showInformationMessage(
      `${set.name} migrated to v3 schema (${strategy}). ` +
        "The tree will refresh shortly; the (needs migration) badge clears " +
        "on the next read.",
    );
    deps.refreshView();
    return;
  }
  if (r.action === "skipped-v3") {
    vscode.window.showInformationMessage(
      `${set.name} is already v3 — no changes written.`,
    );
    deps.refreshView();
    return;
  }
  if (r.action === "would-violate") {
    vscode.window.showWarningMessage(
      `Migration of ${set.name} stopped: the resulting v3 file would ` +
        `violate schema invariants. Reason: ${r.reason ?? "(no detail)"}. ` +
        "Run `python -m ai_router.migrate_session_state --scan <dir> " +
        "--only <set> --strategy generic` to see the dry-run diff, " +
        "or hand-repair the state file before retrying.",
    );
    return;
  }
  // Set 030 Session 5: AI-strategy failures get kind-specific
  // messaging per the cross-provider audit (2026-05-17). Each error
  // class has a distinct operator-actionable next step:
  if (r.action === "failed-ai-no-creds") {
    vscode.window.showErrorMessage(
      `AI title extraction unavailable: ${r.reason ?? "no provider credentials"}. ` +
        "Set the appropriate API key env var (ANTHROPIC_API_KEY, OPENAI_API_KEY, " +
        "GOOGLE_API_KEY) and retry, or pick the “Use spec.md headings” / " +
        "“Use generic labels” strategy to migrate without routing.",
    );
    return;
  }
  if (r.action === "failed-ai-provider-error") {
    vscode.window.showErrorMessage(
      `AI title extraction failed: ${r.reason ?? "provider error"}. ` +
        "Common causes: transient network failure, provider rate limit, " +
        "or quota exhausted. Retry in a few minutes, or fall back to the " +
        "regex/generic strategy.",
    );
    return;
  }
  if (r.action === "failed-ai-bad-output") {
    vscode.window.showErrorMessage(
      `AI returned an unusable response — your state file is unchanged. ` +
        `Detail: ${r.reason ?? "(no detail)"}. ` +
        "Retry once (model output is non-deterministic) or fall back to " +
        "“Use spec.md headings” for a deterministic path.",
    );
    return;
  }
  if (r.action === "failed-ai-count-mismatch") {
    vscode.window.showErrorMessage(
      `AI returned the wrong number of titles — your state file is ` +
        `unchanged. Detail: ${r.reason ?? "(no detail)"}. ` +
        "Either edit spec.md so the model can see the intended session " +
        "count, or use “Use spec.md headings” / “Use generic labels” " +
        "instead.",
    );
    return;
  }
  // skipped-malformed / skipped-no-state / skipped-future-schema / skipped-operator
  vscode.window.showWarningMessage(
    `Migration of ${set.name} skipped (${r.action}): ${r.reason ?? "(no detail)"}.`,
  );
}
