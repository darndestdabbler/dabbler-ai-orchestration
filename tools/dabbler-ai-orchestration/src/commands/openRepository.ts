// Getting from one repository of a solution to another.
//
// This journey did not exist. The Solution Explorer contributed no context
// menu at all, so a developer who could SEE that `Dabbler.Csv.Model` is built
// by the repository beside them had no way to go there from the row saying
// so -- they went to the file manager and found it by name. Three commands
// close that, and the third is the one that always works: revealing a folder
// needs nothing of VS Code but the folder.
//
// Every one of them is offered only for a repository that is actually on this
// machine. A menu entry that fails when it is used costs more trust than a
// menu entry that is not there.

import * as vscode from "vscode";
import type { Router, RouterResult, RouterText } from "dabbler-ai-router";

import type { Projection, SolutionNode } from "../providers/solutionTreeModel.ts";
import { repositoryPathOf } from "../providers/solutionTreeModel.ts";

/** What a command receives: the tree's node, or nothing when run from the palette. */
export interface RepositoryTargetSource {
  readonly node?: SolutionNode;
  readonly projection?: Projection | null;
}

/**
 * The folder a command should act on, or the sentence explaining why none.
 *
 * Resolved through the tree model, so the path a command opens is the path
 * the row the operator clicked was describing. A command that recomputed it
 * would eventually disagree, and "Open Repository" opening a different
 * repository than the one named is worse than the command not existing.
 */
export function repositoryTarget(
  source: RepositoryTargetSource,
): { readonly path: string | null; readonly reason: string } {
  if (!source.node || !source.projection) {
    return {
      path: null,
      reason:
        "Pick a repository in the Solution Explorer first — this opens the " +
        "repository a row names, so it needs the row.",
    };
  }
  const path = repositoryPathOf(source.node, source.projection);
  if (path === null) {
    return {
      path: null,
      reason:
        "That repository is not on this machine. The solution graph is a " +
        "declaration about a solution, not about one laptop — clone it " +
        "beside this one and the row becomes navigable.",
    };
  }
  return { path, reason: "" };
}

async function act(
  source: RepositoryTargetSource,
  run: (uri: vscode.Uri) => Thenable<unknown>,
): Promise<void> {
  const target = repositoryTarget(source);
  if (target.path === null) {
    void vscode.window.showWarningMessage(target.reason);
    return;
  }
  await run(vscode.Uri.file(target.path));
}

/**
 * Open the producing repository, replacing this window.
 *
 * VS Code closes and reopens the window, which ends this extension host. That
 * is the ordinary cost of `openFolder` and the reason the new-window form
 * exists beside it: a developer comparing two repositories wants both.
 */
export function openRepository(source: RepositoryTargetSource): Promise<void> {
  return act(source, (uri) =>
    vscode.commands.executeCommand("vscode.openFolder", uri, false),
  );
}

/** Open it beside this one, keeping both. */
export function openRepositoryInNewWindow(
  source: RepositoryTargetSource,
): Promise<void> {
  return act(source, (uri) =>
    vscode.commands.executeCommand("vscode.openFolder", uri, true),
  );
}

/**
 * Show the folder in the operating system's file manager.
 *
 * The one that cannot fail for a reason inside VS Code, and the fallback the
 * plan named: whatever else is going on, a developer who can see the folder
 * can get to it.
 */
export function revealRepository(source: RepositoryTargetSource): Promise<void> {
  return act(source, (uri) => vscode.commands.executeCommand("revealFileInOS", uri));
}

/**
 * Generate a workspace over the whole solution and open it.
 *
 * Multi-root is a VS Code default rather than a limit, and the graph already
 * knows which folders belong together. The framework writes the file: it is
 * derived from the declarations, it carries paths only this machine has, and
 * asking a developer to author one by hand is asking them to maintain a
 * derived artifact.
 *
 * The window it opens replaces this one, which is what `openFolder` does and
 * the reason the operator is told before it happens rather than after.
 */
export async function openSolutionWorkspace(
  router: Pick<Router, "workspace">,
  repoRoot: string | undefined,
): Promise<void> {
  if (!repoRoot) {
    void vscode.window.showWarningMessage(
      "Open a repository first — a solution workspace is built from the " +
        "declarations in the one you have open.",
    );
    return;
  }
  const result = await router.workspace({ repoRoot });
  if (!result.ok) {
    void vscode.window.showWarningMessage(
      `Dabbler could not build the workspace: ${result.message ?? result.outcome}`,
    );
    return;
  }
  const file = workspaceFileIn(result.value.stdout ?? "");
  if (file === null) {
    // The router says what it did, including "there is nothing to build
    // here". Passing its own sentence through is better than inventing one.
    void vscode.window.showInformationMessage(
      (result.value.stdout ?? "").trim() ||
        "Nothing to open: this repository reaches no other repository here.",
    );
    return;
  }
  await vscode.commands.executeCommand(
    "vscode.openFolder",
    vscode.Uri.file(file),
    false,
  );
}

/**
 * Which repository a row is about, for the verbs that write the declaration.
 *
 * The producer's id and never a path: a path is the thing that is missing.
 * Resolved through the tree model for the same reason `repositoryPathOf` is
 * -- one place decides what the row the operator clicked was describing.
 */
export function repositoryIdOf(node: SolutionNode, p: Projection): string | null {
  if (node.kind === "member") return node.id;
  if (node.kind !== "external") return null;
  return (p.external ?? []).find((e) => e.id === node.id)?.producedBy ?? null;
}

/** What every writing command needs: the repository, and where to run. */
function actOn(
  source: RepositoryTargetSource,
): { readonly repository: string; readonly repoRoot: string } | null {
  const repoRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const repository =
    source.node && source.projection ? repositoryIdOf(source.node, source.projection) : null;
  if (!repoRoot || !repository) {
    void vscode.window.showWarningMessage(
      "Pick a repository in the Solution Explorer first — this writes where a " +
        "repository lives into the declaration, so it needs the row and the " +
        "repository that declares it.",
    );
    return null;
  }
  return { repository, repoRoot };
}

/**
 * Run one writing verb and say what came back.
 *
 * The router's own sentence, never a rewritten one: it is the sentence that
 * knows why -- a remote nobody declared, a directory that is already there,
 * a second checkout of one repository -- and paraphrasing it here would be a
 * second explanation that drifts from the refusal it describes.
 */
async function write(
  run: () => Promise<RouterResult<RouterText>>,
  refresh: () => void,
): Promise<void> {
  const result = await run();
  if (!result.ok) {
    void vscode.window.showWarningMessage(
      (result.message ?? result.outcome).trim() || "Dabbler refused that.",
    );
    return;
  }
  void vscode.window.showInformationMessage(
    (result.value.stdout ?? "").trim() || "Done.",
  );
  refresh();
}

/** Say where a repository lives, when the declaration names no remote. */
export async function identifyRemote(
  router: Pick<Router, "deps">,
  source: RepositoryTargetSource,
  refresh: () => void,
): Promise<void> {
  const target = actOn(source);
  if (!target) return;
  const remote = await vscode.window.showInputBox({
    title: `Where is ${target.repository}?`,
    prompt:
      "The remote URL. It is the one way of naming a repository that survives " +
      "a move and a second clone, so it is what the declaration keeps.",
    placeHolder: "git@github.com:you/your-repository.git",
  });
  if (!remote) return;
  await write(
    () =>
      router.deps.locate({
        repoRoot: target.repoRoot,
        repository: target.repository,
        remote,
      }),
    refresh,
  );
}

/** Point at a checkout that is already on this machine. */
export async function locateRepository(
  router: Pick<Router, "deps">,
  source: RepositoryTargetSource,
  refresh: () => void,
): Promise<void> {
  const target = actOn(source);
  if (!target) return;
  const picked = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: `This is ${target.repository}`,
    title: `Where is ${target.repository} on this machine?`,
  });
  const folder = picked?.[0]?.fsPath;
  if (!folder) return;
  await write(
    () =>
      router.deps.locate({
        repoRoot: target.repoRoot,
        repository: target.repository,
        path: folder,
      }),
    refresh,
  );
}

/**
 * Clone the remote the declaration already names.
 *
 * Offered only on a row that HAS one. A clone command on a repository nobody
 * has named a remote for is a menu entry that fails when it is used.
 */
export async function cloneRepository(
  router: Pick<Router, "deps">,
  source: RepositoryTargetSource,
  refresh: () => void,
): Promise<void> {
  const target = actOn(source);
  if (!target) return;
  await write(
    () => router.deps.clone({ repoRoot: target.repoRoot, repository: target.repository }),
    refresh,
  );
}

/**
 * Create the repository, here, now, with nothing in it but its membership.
 *
 * The other half of "nobody has said where this lives": sometimes the answer
 * is that it does not exist yet. A shell declares which solution it is in
 * and nothing else, which is what puts it in the Explorer beside the ones
 * that do exist.
 */
export async function createRepository(
  router: Pick<Router, "deps">,
  source: RepositoryTargetSource,
  refresh: () => void,
): Promise<void> {
  const target = actOn(source);
  if (!target) return;
  const confirmed = await vscode.window.showInformationMessage(
    `Create ${target.repository} beside this repository?`,
    { modal: true, detail: "It will declare which solution it is in, and nothing else." },
    "Create",
  );
  if (confirmed !== "Create") return;
  await write(
    () => router.deps.scaffold({ repoRoot: target.repoRoot, repository: target.repository }),
    refresh,
  );
}

/**
 * The workspace file the router reported writing, or null when it wrote none.
 *
 * The path comes from the router's own answer and is never recomputed here.
 * A second derivation would eventually disagree with the first, and opening a
 * workspace other than the one just written is the kind of near-miss nobody
 * debugs quickly.
 */
export function workspaceFileIn(stdout: string): string | null {
  const found = /^wrote (.+\.code-workspace)\s*$/m.exec(stdout);
  return found ? found[1].trim() : null;
}
