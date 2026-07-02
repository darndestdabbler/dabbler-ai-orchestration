// Set 061 Session 3 (spec D4): `Switch Tier…` row action — offered ONLY
// on not-started sets (the ActionRegistry predicate gates the menu; this
// handler re-checks as defense in depth since the command is also
// palette-registered). The action rewrites the `tier:` value in the
// set's spec.md Session Set Configuration block via the pure
// byte-preserving helper in utils/tierRewrite.ts, then refreshes the
// view. Switching to Full WARNS (never blocks) when no provider key is
// visible or the router config is absent (spec D4 guardrails).
//
// Mid-set switching is deliberately unsupported: the Set 057
// `verificationMode` capture is immutable after first record and
// per-session verification semantics differ between tiers; `--no-router`
// remains the per-session operational escape hatch.

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { SessionSet } from "../types";
import { promptTier } from "./gitScaffold";
import {
  ROUTER_CONFIG_REL,
  rewriteSpecTier,
  switchToFullWarnings,
} from "../utils/tierRewrite";
import {
  repoRootForSpecPath,
  writeTierMarker,
} from "../utils/tierMarkerStore";

interface SetItem {
  set?: SessionSet;
}

async function switchTier(set: SessionSet): Promise<void> {
  if (set.state !== "not-started") {
    vscode.window.showInformationMessage(
      `"${set.name}" has already started — tier can only be switched on a not-started set. (Per-session escape hatch: --no-router.)`
    );
    return;
  }

  const current = set.config.tier;
  const target = await promptTier(
    `Switch "${set.name}" tier (currently ${current})`
  );
  if (!target) return;
  // No early same-tier return here: the rewrite helper is the single
  // decision authority (verifier S061-S3-V1-002). A same-tier pick over
  // a malformed scalar (e.g. `tier: ful`, which the parser defaults to
  // "full") still rewrites — repairing the typo to the canonical value.

  let specText: string;
  try {
    specText = fs.readFileSync(set.specPath, "utf8");
  } catch {
    vscode.window.showErrorMessage(
      `Could not read ${set.specPath} — tier not switched.`
    );
    return;
  }

  const result = rewriteSpecTier(specText, target);
  if (result.outcome === "no-config-block") {
    vscode.window.showWarningMessage(
      `"${set.name}"'s spec.md has no Session Set Configuration block — add one (see the authoring guide) before switching tier.`
    );
    return;
  }
  if (result.outcome === "already-target") {
    vscode.window.showInformationMessage(
      `"${set.name}" is already on the ${target} tier.`
    );
    return;
  }
  try {
    fs.writeFileSync(set.specPath, result.text, "utf8");
  } catch {
    vscode.window.showErrorMessage(
      `Could not write ${set.specPath} — tier not switched.`
    );
    return;
  }
  // Set 077 S2 (A11 + Critique-2 M2): everything downstream of the spec
  // write anchors on the root derived FROM the written path — the
  // pre-077 guardrail probed the separately carried `set.root` while
  // writing `set.specPath`, a coupling that can diverge after a
  // cross-root dedup-merge.
  const setRoot = repoRootForSpecPath(set.specPath);
  // Write-through the durable tier marker so a sanctioned switch can
  // never leave `.dabbler/tier` stale (the marker is a cache of the
  // latest sanctioned choice, not a one-shot scaffold seed). Non-fatal:
  // the spec IS switched at this point; a marker-write failure only
  // costs the advisory freshness, so warn instead of unwinding.
  try {
    writeTierMarker(setRoot, target);
  } catch (err) {
    console.warn(
      `[switchTier] tier marker write-through failed for ${setRoot}`,
      err,
    );
  }
  void vscode.commands.executeCommand("dabblerSessionSets.refresh");
  vscode.window.showInformationMessage(
    result.previousTier === target
      ? `Repaired "${set.name}"'s malformed tier declaration — now explicitly ${target}.`
      : `Switched "${set.name}" to the ${target} tier.`
  );

  // D4 guardrails — inform-only, shown after the switch is applied.
  if (target === "full") {
    const routerConfigExists = fs.existsSync(
      path.join(setRoot, ROUTER_CONFIG_REL)
    );
    for (const warning of switchToFullWarnings(routerConfigExists, process.env)) {
      vscode.window.showWarningMessage(warning);
    }
  }
}

export function registerSwitchTierCommand(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "dabblerSessionSets.switchTier",
      (item: SetItem) => {
        if (!item?.set) {
          vscode.window.showInformationMessage(
            "Switch Tier… is available from a not-started session-set row's context menu."
          );
          return;
        }
        void switchTier(item.set);
      }
    )
  );
}
