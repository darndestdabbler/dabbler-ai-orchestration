// Set 110 Session 2: the visible-module assembly, extracted verbatim
// from `CustomSessionSetsView.buildModules` so the shipping webview and
// the new native `TreeDataProvider` compute the SAME module list from
// one implementation.
//
// The extraction is deliberate rather than incidental. Session 2 ships
// the native tree ALONGSIDE the webview so the two can be compared
// (spec, Session 2 step 5); two independent copies of "which modules
// are visible, in what order, with which faults" would make that
// comparison meaningless the first time one copy drifted. Session 3
// deletes the webview caller; this module survives it.
//
// Everything filesystem- or workspace-shaped is injected through
// {@link ModuleAssemblyIo}, so the assembly is Layer-2 testable without
// launching VS Code — which the private method it replaces was not.

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import {
  LEGACY_ROOT_PLAN_REL,
  ModulesManifestClassification,
  classifyModulesManifest,
} from "../utils/moduleAuthoring";
import { SessionSet } from "../types";
import {
  VisibleModule,
  chooseRenderableModuleSnapshot,
  computeVisibleModules,
  mergeVisibleModules,
} from "./SessionSetsModel";

/** One operator-facing manifest fault, keyed by the root that raised it. */
export interface ManifestFault {
  rootLabel: string;
  message: string;
  retainedLastKnownGood: boolean;
}

/**
 * The host-shaped facts the assembly needs. Injected so the pure
 * ordering / merging / last-known-good logic can be driven from tests.
 */
export interface ModuleAssemblyIo {
  /** Open workspace folder paths. Session-set roots are unioned in by the caller's data. */
  workspaceRoots(): string[];
  /** Classify `<root>/docs/modules.yaml` (absent / present / invalid). */
  classify(root: string): ModulesManifestClassification;
  /** Whether `<root>/docs/planning/project-plan.md` exists. */
  legacyRootPlanExists(root: string): boolean;
  /** `path.basename`, injected only so tests need no path shims. */
  rootLabel(root: string): string;
}

export interface ModuleAssembly {
  modules: VisibleModule[];
  manifestFaults: ManifestFault[];
}

/**
 * The real host's {@link ModuleAssemblyIo} — open workspace folders,
 * on-disk manifest classification, and the legacy root-plan probe.
 * The only impure part of the assembly, isolated here so the logic
 * above stays driveable from fixtures.
 */
export function nodeModuleAssemblyIo(): ModuleAssemblyIo {
  return {
    workspaceRoots: () =>
      (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath),
    classify: (root) => classifyModulesManifest(root),
    // Set 100 S1: the 093-era per-module plan-existence resolution retired
    // with the persistent `Plan` child node it fed. This probe stays — it
    // drives pseudo-module VISIBILITY (the legacy root plan keeps the
    // pseudo-module rendered even when every set is stamped).
    legacyRootPlanExists: (root) =>
      fs.existsSync(path.join(root, LEGACY_ROOT_PLAN_REL)),
    rootLabel: (root) => path.basename(root),
  };
}

export const INVALID_MANIFEST_MESSAGE =
  "docs/modules.yaml is invalid (expected a YAML mapping with a modules list). " +
  "Fix the file by hand; Work Explorer never overwrites it.";

/**
 * Compute the ordered visible-module list across every discovered root,
 * plus the manifest faults the System Status strip reports.
 *
 * `lastKnownGood` is caller-owned mutable state (one entry per root):
 * an INVALID manifest keeps rendering the previous good tree rather
 * than blanking the view, and this function updates the map for every
 * root whose manifest is not invalid. Callers that want no retention
 * (tests, one-shot reads) pass a fresh `Map`.
 */
export function assembleVisibleModules(
  allSets: SessionSet[],
  io: ModuleAssemblyIo,
  lastKnownGood: Map<string, readonly VisibleModule[]>,
): ModuleAssembly {
  const roots = new Set(io.workspaceRoots());
  for (const set of allSets) roots.add(set.root);

  const manifestFaults: ManifestFault[] = [];
  const byRoot = Array.from(roots).map((root) => {
    const classification = io.classify(root);
    const current = computeVisibleModules(
      classification,
      allSets.filter((set) => set.root === root),
      { legacyRootPlanExists: io.legacyRootPlanExists(root) },
    );
    const selected = chooseRenderableModuleSnapshot(
      classification,
      current,
      lastKnownGood.get(root),
    );
    if (classification.kind === "invalid") {
      manifestFaults.push({
        rootLabel: io.rootLabel(root),
        message: INVALID_MANIFEST_MESSAGE,
        retainedLastKnownGood: selected.retainedLastKnownGood,
      });
    } else {
      lastKnownGood.set(root, current);
    }
    return selected.modules;
  });

  return { modules: mergeVisibleModules(byRoot), manifestFaults };
}
