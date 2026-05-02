import * as cp from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import {
  installAiRouter,
  updateAiRouter,
  FileOps,
  InstallSource,
  ProcessSpawner,
  ROUTER_CONFIG_REL,
} from "../utils/aiRouterInstall";

/**
 * VS Code wiring for the ``Dabbler: Install ai-router`` and
 * ``Dabbler: Update ai-router`` commands.
 *
 * Pure logic lives in :mod:`utils/aiRouterInstall`; this module provides
 * the ``vscode.window`` prompts, the ``cp.spawn`` adapter, and the ``fs``
 * adapter, then surfaces the outcome through ``showInformationMessage``
 * /``showErrorMessage``.
 */

export function registerInstallAiRouterCommands(
  context: vscode.ExtensionContext,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("dabblerSessionSets.installAiRouter", async () => {
      await runInstallFlow("install");
    }),
    vscode.commands.registerCommand("dabblerSessionSets.updateAiRouter", async () => {
      await runInstallFlow("update");
    }),
  );
}

async function runInstallFlow(mode: "install" | "update"): Promise<void> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) {
    vscode.window.showErrorMessage(
      "Open a workspace folder before running Dabbler: Install ai-router.",
    );
    return;
  }
  const pythonPath = resolvePythonPath(root);
  const repoUrl = resolveAiRouterRepoUrl();

  const outcome = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: mode === "update" ? "Updating ai_router…" : "Installing ai_router…",
      cancellable: false,
    },
    async (progress) => {
      const deps = {
        workspaceRoot: root,
        pythonPath,
        repoUrl,
        spawner: makeSpawner(),
        fileOps: makeFileOps(),
        prompts: makePrompts(),
        reportProgress: (msg: string) => progress.report({ message: msg }),
      };
      return mode === "update"
        ? await updateAiRouter(deps)
        : await installAiRouter(deps);
    },
  );

  if (!outcome.ok) {
    vscode.window.showErrorMessage(outcome.message);
    return;
  }
  vscode.window.showInformationMessage(outcome.message);
  // After a successful install, open router-config.yaml so the operator
  // can tune it for their project. The follow-up toast ("Tune ...") is
  // a separate notification so the operator gets a distinct call-to-
  // action even if the install message scrolls off-screen quickly.
  const routerConfig = path.join(root, ROUTER_CONFIG_REL);
  if (fs.existsSync(routerConfig)) {
    try {
      const doc = await vscode.workspace.openTextDocument(routerConfig);
      await vscode.window.showTextDocument(doc, { preview: false });
      vscode.window.showInformationMessage(
        "Tune router-config.yaml for your project — per-task-type effort, the cost guard, and delegation.always_route_task_types live here.",
      );
    } catch {
      // intentional: opening the editor is a courtesy, not a failure mode
    }
  }
}

function resolveAiRouterRepoUrl(): string | undefined {
  // Returns ``undefined`` when unset so the installer falls through to
  // its default ``REPO_URL`` constant — keeps the explicit-default
  // value in one place (the install module).
  const cfg = vscode.workspace.getConfiguration("dabblerSessionSets");
  const raw = (cfg.get<string>("aiRouterRepoUrl") ?? "").trim();
  return raw === "" ? undefined : raw;
}

function resolvePythonPath(workspaceRoot: string): string {
  // Per spec: install command reads ``dabblerSessionSets.pythonPath``
  // (separate from the per-view ``dabblerProviderQueues.pythonPath`` so
  // the views and the install command can target different interpreters
  // if a workspace ever needs to). Falls back to the queue setting for
  // backward compatibility with workspaces that only set that one, then
  // to bare ``"python"`` on PATH.
  //
  // Use ``inspect()`` to distinguish "operator explicitly set it" from
  // "the contributed default fired" — `getConfiguration().get()` can't
  // tell the difference, so a naive `?? next` chain would never reach
  // the fallback. Round-6 verifier catch.
  const raw = (
    explicitConfigValue("dabblerSessionSets", "pythonPath") ??
    explicitConfigValue("dabblerProviderQueues", "pythonPath") ??
    "python"
  ).trim();
  if (!raw) return "python";
  if (path.isAbsolute(raw)) return raw;
  if (raw.includes(path.sep) || raw.includes("/")) {
    return path.resolve(workspaceRoot, raw);
  }
  return raw;
}

/**
 * Read a configuration value only if the operator has actually set it
 * (workspace-folder, workspace, or global scope). Returns ``undefined``
 * when only the contributed default is in effect, so callers can fall
 * through to the next setting.
 */
function explicitConfigValue(section: string, key: string): string | undefined {
  const cfg = vscode.workspace.getConfiguration(section);
  const inspected = cfg.inspect<string>(key);
  if (!inspected) return undefined;
  return (
    inspected.workspaceFolderValue ??
    inspected.workspaceValue ??
    inspected.globalValue ??
    undefined
  );
}

function makeSpawner(): ProcessSpawner {
  return (cmd, args, opts) =>
    new Promise((resolve) => {
      const child = cp.spawn(cmd, args, {
        cwd: opts?.cwd,
        env: process.env,
        windowsHide: true,
      });
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      const timer = opts?.timeoutMs
        ? setTimeout(() => {
            timedOut = true;
            child.kill();
          }, opts.timeoutMs)
        : null;
      child.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });
      child.on("error", (err: Error) => {
        if (timer) clearTimeout(timer);
        resolve({
          exitCode: null,
          stdout,
          stderr: stderr + (stderr ? "\n" : "") + `spawn error: ${err.message}`,
        });
      });
      child.on("close", (code: number | null) => {
        if (timer) clearTimeout(timer);
        if (timedOut) {
          resolve({
            exitCode: code ?? -1,
            stdout,
            stderr: stderr + (stderr ? "\n" : "") + "process killed by timeout",
          });
        } else {
          resolve({ exitCode: code, stdout, stderr });
        }
      });
    });
}

function makeFileOps(): FileOps {
  return {
    exists: (p) => fs.existsSync(p),
    readFile: (p) => fs.readFileSync(p, "utf8"),
    // Always ensure the parent directory exists before writing. The
    // GitHub-fallback flow can momentarily leave the destination
    // ai_router/ directory missing (between `removeRecursive(dst)` and
    // a partial `copyDir` failure), and the stash-restore path writes
    // the operator-tuned router-config.yaml inside that directory. The
    // cost of an always-on mkdirp is one extra syscall per write; the
    // cost of dropping it is silent data loss in a narrow but real
    // failure window. Round-3 verifier catch.
    writeFile: (p, content) => {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, content, "utf8");
    },
    mkdirp: (p) => fs.mkdirSync(p, { recursive: true }),
    copyDir: (src, dst) => copyDirSync(src, dst),
    removeRecursive: (p) => {
      if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
    },
    mkdtemp: (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix)),
  };
}

function copyDirSync(src: string, dst: string): void {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(s, d);
    } else if (entry.isSymbolicLink()) {
      const target = fs.readlinkSync(s);
      fs.symlinkSync(target, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

function makePrompts() {
  return {
    pickSource: async (defaultSource: InstallSource): Promise<InstallSource | undefined> => {
      const items: (vscode.QuickPickItem & { value: InstallSource })[] = [
        {
          label: "Install from PyPI (recommended)",
          description: "pip install dabbler-ai-router",
          detail: "Default. Pulls the latest released version from the Python Package Index.",
          value: "pypi",
        },
        {
          label: "Install from GitHub (fallback)",
          description: "git sparse-checkout of ai_router/",
          detail: "Use for offline workspaces, pre-release testing, or forks. Preserves any existing router-config.yaml.",
          value: "github",
        },
      ];
      // Move the default to the top so Enter accepts it — VS Code's
      // QuickPick doesn't honor a preselected index across invocations,
      // and reordering is the closest equivalent.
      items.sort((a, b) => (a.value === defaultSource ? -1 : b.value === defaultSource ? 1 : 0));
      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: "Choose how to install ai_router",
        ignoreFocusOut: true,
      });
      return picked?.value;
    },
    confirmCreateVenv: async (venvAbsPath: string): Promise<boolean> => {
      const choice = await vscode.window.showInformationMessage(
        `No venv found in this workspace. Create one at ${venvAbsPath}?`,
        { modal: true, detail: "ai_router needs a Python environment to install into. The recommended location is .venv at the workspace root." },
        "Create venv",
        "Cancel",
      );
      return choice === "Create venv";
    },
    promptGitHubRef: async (defaultRef: string): Promise<string | undefined> => {
      const ref = await vscode.window.showInputBox({
        prompt: "Git ref for the sparse checkout (tag or branch). Leave blank for the latest released tag.",
        placeHolder: defaultRef,
        ignoreFocusOut: true,
      });
      // Distinguish "dismissed" (undefined) from "accepted blank" (""):
      // both are valid for the caller — empty string means "use the
      // latest released tag" (resolved via git ls-remote), undefined
      // means "abort". Pass through.
      return ref;
    },
  };
}
