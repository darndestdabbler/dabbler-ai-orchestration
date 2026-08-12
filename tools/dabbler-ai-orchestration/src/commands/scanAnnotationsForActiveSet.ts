/**
 * `dabbler.scanAnnotationsForActiveSet` — walk the workspace for
 * `@dabbler:outsource-review("...")` annotations and append new findings
 * to the active session set's decision-review queue.
 *
 * Pure helpers live in `./annotationScanner` and `./decisionReviewQueue`
 * so the scanning / dedup / toggle logic can be unit-tested without the
 * @vscode/test-electron harness. This file is the vscode-surface wiring
 * only.
 */
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import {
  Annotation,
  deduplicateAnnotations,
} from "../utils/annotationParser";
import { readYamlFile } from "../utils/yamlReadWrite";
import { readAllSessionSets } from "../utils/fileSystem";
import {
  QUEUE_FILENAME,
  appendQueueEntry,
  findActiveSessionSetDir,
} from "./decisionReviewQueue";
import {
  SCAN_GLOB,
  SCAN_EXCLUDE_GLOB,
  scanFilesForAnnotations,
  loadHonorAnnotationsToggle,
  loadExistingQueueEntries,
} from "./annotationScanner";

function defaultReadYaml(absPath: string): Record<string, unknown> | null {
  if (!fs.existsSync(absPath)) return null;
  try {
    const result = readYamlFile(absPath);
    if (result === null) return null;
    const json = result.doc.toJSON();
    if (json == null || typeof json !== "object" || Array.isArray(json)) return null;
    return json as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function registerScanAnnotationsForActiveSet(
  context: vscode.ExtensionContext,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "dabbler.scanAnnotationsForActiveSet",
      async () => {
        const all = readAllSessionSets();
        const activeDir = findActiveSessionSetDir(() => all);
        if (!activeDir) {
          vscode.window.showInformationMessage(
            "No active session set to scan against. Start a session set first.",
          );
          return;
        }

        const activeSet = all.find((s) => s.dir === activeDir);
        const workspaceRoot =
          activeSet?.root ?? path.dirname(path.dirname(activeDir));

        if (!loadHonorAnnotationsToggle(workspaceRoot, defaultReadYaml)) {
          vscode.window.showInformationMessage(
            "Annotation scanning is disabled for this project " +
              "(local-overrides.yaml → decision_review.honor_annotations: false). " +
              "No queue entries appended.",
          );
          return;
        }

        const uris = await vscode.workspace.findFiles(
          new vscode.RelativePattern(workspaceRoot, SCAN_GLOB),
          new vscode.RelativePattern(workspaceRoot, SCAN_EXCLUDE_GLOB),
        );
        const filePaths = uris.map((u) => u.fsPath);

        const annotations: Annotation[] = scanFilesForAnnotations(
          filePaths,
          workspaceRoot,
        );
        const existing = loadExistingQueueEntries(activeDir);
        const fresh = deduplicateAnnotations(annotations, existing);

        if (fresh.length === 0) {
          const msg =
            annotations.length === 0
              ? "No `@dabbler:outsource-review` annotations found in workspace."
              : `All ${annotations.length} annotation(s) already in the queue — nothing new appended.`;
          vscode.window.showInformationMessage(msg);
          return;
        }

        try {
          for (const ann of fresh) {
            appendQueueEntry(activeDir, ann);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(
            `Failed to append annotation(s) to queue: ${msg}`,
          );
          return;
        }

        const slug = path.basename(activeDir);
        vscode.window.showInformationMessage(
          `Appended ${fresh.length} new annotation(s) to ${slug}/${QUEUE_FILENAME}.`,
        );
      },
    ),
  );
}
