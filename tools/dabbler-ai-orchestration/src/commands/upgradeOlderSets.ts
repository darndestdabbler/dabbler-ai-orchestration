/**
 * "Upgrade older session sets" — Set 050 S4 (Feature 2 / Explorer UX
 * revision), the single repo-level bulk action that replaces the old
 * per-row "(needs migration)" nag (operator non-goal: "Old schema is
 * acceptable; no per-row obligation").
 *
 * Surfaced as a title-bar icon on the Session Sets view, enabled only
 * when at least one set is on a sub-current schema (the
 * `dabblerSessionSets.hasSubCurrentSets` context key, set during the
 * scan). Clicking it runs the corrected THREE-migrator chain in
 * sequence, in-place, across every set under each workspace root's
 * docs/session-sets:
 *
 *   1. migrate_session_state              (v2 -> v3)
 *   2. migrate_lightweight_to_canonical_v4 (non-canonical / missing -> v4)
 *   3. migrate_v3_to_v4                    (v3 -> v4)
 *
 * The S2 empirical correction (memory + check_migrations CHAIN NOTE): a
 * genuine v2 file is skipped by BOTH the lightweight and v3->v4
 * migrators, so the v2->v3 step (migrate_session_state) is required and
 * must run first. Each step is idempotent / skips inapplicable files, so
 * the sequence safely upgrades any drifted set and no-ops on clean ones.
 *
 * This bulk path shells out to Python (the heavier, deliberate operator
 * action genuinely needs all three migrators, and only the v3->v4 step
 * has an in-process TS twin). The per-row single-set "Migrate to v4"
 * command remains in-process for routerless Lightweight repos.
 */
import * as vscode from "vscode";
import * as cp from "child_process";
import * as path from "path";
import * as fs from "fs";
import { discoverRoots } from "../utils/fileSystem";
import { resolvePythonInterpreter } from "../utils/pythonInterpreter";
import { makeUtf8ChunkDecoder } from "../utils/utf8ChunkDecoder";
import {
  isAiRouterNotInstalled,
  describeAiRouterImportFailure,
} from "../utils/aiRouterInstall";

interface CommandDeps {
  refreshView: () => void;
}

// The ordered bulk-upgrade chain. Exported as a constant so a unit test
// can pin the order + module names against the Python
// BULK_UPGRADE_MIGRATOR_IDS without launching VS Code.
export const BULK_UPGRADE_MODULES: readonly string[] = [
  "ai_router.migrate_session_state",
  "ai_router.migrate_lightweight_to_canonical_v4",
  "ai_router.migrate_v3_to_v4",
];

const SESSION_SETS_REL = path.join("docs", "session-sets");

function runMigrator(
  pythonPath: string,
  module: string,
  cwd: string,
): Promise<{ ok: boolean; module: string; detail: string }> {
  return new Promise((resolve) => {
    const args = [
      "-m",
      module,
      "--scan",
      SESSION_SETS_REL,
      "--in-place",
      "--json",
    ];
    const child = cp.spawn(pythonPath, args, { cwd, windowsHide: true });
    let stdout = "";
    let stderr = "";
    let spawnErrored = false;
    // Streaming-safe decode (S5 verification R3): chunk boundaries can
    // split multibyte UTF-8; StringDecoder carries the partial bytes.
    const outDec = makeUtf8ChunkDecoder();
    const errDec = makeUtf8ChunkDecoder();
    child.stdout?.on("data", (c: Buffer) => (stdout += outDec.write(c)));
    child.stderr?.on("data", (c: Buffer) => (stderr += errDec.write(c)));
    child.on("error", (err: Error) => {
      spawnErrored = true;
      resolve({
        ok: false,
        module,
        detail: `could not spawn Python (${err.message})`,
      });
    });
    child.on("close", (code: number | null) => {
      if (spawnErrored) return;
      stdout += outDec.end();
      stderr += errDec.end();
      if (code === 0) {
        resolve({ ok: true, module, detail: summarizeJson(stdout) });
      } else if (isAiRouterNotInstalled(stderr)) {
        resolve({
          ok: false,
          module,
          detail: describeAiRouterImportFailure(pythonPath),
        });
      } else {
        resolve({
          ok: false,
          module,
          detail: (stderr.trim() || stdout.trim() || `exit ${code}`).slice(0, 400),
        });
      }
    });
  });
}

// Best-effort one-line summary from a migrator's --json output. The
// three migrators emit slightly different shapes; fall back to a generic
// "ran" when the count isn't parseable.
function summarizeJson(stdout: string): string {
  try {
    const data = JSON.parse(stdout.trim());
    const results = Array.isArray(data?.results) ? data.results : [];
    const migrated = results.filter((r: { action?: string }) =>
      typeof r?.action === "string" ? r.action.startsWith("migrated") : false,
    ).length;
    return `${migrated} migrated, ${results.length} scanned`;
  } catch {
    return "ran";
  }
}

export function registerUpgradeOlderSetsCommand(
  context: vscode.ExtensionContext,
  deps: CommandDeps,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "dabblerSessionSets.upgradeOlderSets",
      async () => {
        const roots = discoverRoots().filter((r) =>
          fs.existsSync(path.join(r, SESSION_SETS_REL)),
        );
        if (roots.length === 0) {
          vscode.window.showInformationMessage(
            "No docs/session-sets directory found in the workspace — nothing to upgrade.",
          );
          return;
        }

        const confirm = await vscode.window.showInformationMessage(
          "Upgrade all older session sets to the current schema? This runs " +
            "the three schema migrators in sequence, in-place, across every " +
            "set. Each migrator writes a backup alongside any file it " +
            "rewrites and is a no-op on already-current sets.",
          { modal: true },
          "Upgrade",
        );
        if (confirm !== "Upgrade") return;

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Upgrading older session sets…",
            cancellable: false,
          },
          async (progress) => {
            const failures: string[] = [];
            const summaries: string[] = [];
            for (const root of roots) {
              // Resolve per-root: each workspace root may carry its own
              // `.venv`, and venv auto-detection keys off the root.
              const pythonPath = resolvePythonInterpreter(root);
              for (const module of BULK_UPGRADE_MODULES) {
                progress.report({ message: `${path.basename(root)}: ${module}` });
                const res = await runMigrator(pythonPath, module, root);
                if (res.ok) {
                  summaries.push(`${module}: ${res.detail}`);
                } else {
                  failures.push(`${module} — ${res.detail}`);
                }
              }
            }
            deps.refreshView();
            if (failures.length === 0) {
              vscode.window.showInformationMessage(
                `Session sets upgraded. ${summaries.join("; ")}. ` +
                  "The tree refreshes shortly; the schema markers clear on the next read.",
              );
            } else {
              vscode.window.showErrorMessage(
                `Bulk upgrade hit ${failures.length} error(s): ${failures.join(
                  " | ",
                )}. ` +
                  "If Python / dabbler-ai-router isn't installed, set " +
                  "dabblerSessionSets.pythonPath to a venv with the router, or run " +
                  "the migrator chain manually from the repo root.",
              );
            }
          },
        );
      },
    ),
  );
}
