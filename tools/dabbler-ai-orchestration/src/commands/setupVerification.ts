// Set 062 Session 2 (spec D3): `Set Up Dedicated Verification…` row
// action — offered ONLY on not-started Lightweight sets at this
// session (the predicate widens to completed Mode-A sets in Session 3,
// where the transition runs through the new blessed Python writer).
// The ActionRegistry predicate gates the menu; this handler re-checks
// as defense in depth since the command is also palette-registered.
//
// On a not-started set no durable `verification_mode` activity-log
// record exists yet, so the spec-config seed is still the authority —
// the action rewrites the seed byte-preservingly via the pure helper
// in utils/verificationModeRewrite.ts (the `Switch Tier…` pattern),
// then refreshes. Both directions (A<->B) are legal here; B->A is
// never offered once any activity-log record exists (the Set 057
// capture is a one-way silent gate: after first record, a spec edit
// is ignored by Python but honored by the Explorer — silent drift —
// so the handler refuses the rewrite entirely in that case).
//
// The A->B pick carries an explicit confirmation step with one-way
// consequence copy naming the `N/M+` growth (spec D3 / the Gemini
// confirmation contribution in the design synthesis).

import * as vscode from "vscode";
import * as fs from "fs";
import { SessionSet, VerificationMode } from "../types";
import {
  inspectActivityLog,
  rewriteSpecVerificationMode,
} from "../utils/verificationModeRewrite";

interface SetItem {
  set?: SessionSet;
}

export interface ModePickItem {
  label: string;
  description: string;
  detail: string;
  value: VerificationMode;
}

// One-way consequence copy (spec D3): names the `N/M+` growth. Shared
// between the mode picker's detail line and the confirmation step so
// the operator reads the same consequence at both decision points.
export const DEDICATED_CONSEQUENCE_COPY =
  "One-way once the set starts: typed verification/remediation " +
  "sessions are appended at runtime, so the session count grows (the " +
  "N/M+ fraction) and the mode can no longer be switched back.";

export const OUT_OF_BAND_CONSEQUENCE_COPY =
  "Returns to the default posture: verification happens out of band " +
  "(copyable review prompts; the verdict is recorded by hand in " +
  "external-verification.md). No typed sessions are appended.";

// Pure item builder (unit-testable without a host). The current mode
// is annotated so the picker reads as a state view, not a wizard.
export function buildModePickItems(current: VerificationMode): ModePickItem[] {
  const annotate = (mode: VerificationMode, base: string): string =>
    mode === current ? `${base} — current` : base;
  return [
    {
      label: "Dedicated sessions",
      description: annotate(
        "dedicated-sessions",
        "Typed verification/remediation sessions on a different engine",
      ),
      detail: DEDICATED_CONSEQUENCE_COPY,
      value: "dedicated-sessions",
    },
    {
      label: "Out-of-band or none",
      description: annotate(
        "out-of-band-or-none",
        "Default — copyable review prompts, manual verdict note",
      ),
      detail: OUT_OF_BAND_CONSEQUENCE_COPY,
      value: "out-of-band-or-none",
    },
  ];
}

export interface ConfirmationItem {
  label: string;
  detail?: string;
  confirmed: boolean;
}

// Pure confirmation-step builder: the switch item carries the
// direction-specific consequence copy; "Cancel" is always offered.
export function buildConfirmationItems(target: VerificationMode): ConfirmationItem[] {
  return [
    {
      label: `Switch to ${target}`,
      detail:
        target === "dedicated-sessions"
          ? DEDICATED_CONSEQUENCE_COPY
          : OUT_OF_BAND_CONSEQUENCE_COPY,
      confirmed: true,
    },
    { label: "Cancel", confirmed: false },
  ];
}

async function setupVerification(set: SessionSet): Promise<void> {
  if (set.config.tier !== "lightweight") {
    vscode.window.showInformationMessage(
      `"${set.name}" is a Full-tier set — verificationMode governs Lightweight verification only (Full tier verifies through the router automatically).`
    );
    return;
  }
  if (set.state !== "not-started") {
    vscode.window.showInformationMessage(
      `"${set.name}" has already started — the verification-mode seed can only be rewritten on a not-started set.`
    );
    return;
  }

  // History guard (D3, verifier fix S062-S2-V1-001): the seed rewrite
  // is offered ONLY while no activity-log record of ANY kind exists —
  // a "not-started" set with history is drift, and once a
  // `verification_mode` capture (or any other record) is on disk the
  // spec seed is no longer the safe authority. A log the extension
  // cannot read or parse FAILS LOUD: refusing is cheap, rewriting a
  // seed whose history is uninspectable risks the exact silent
  // spec-vs-record drift D3 exists to prevent. Absence of the file is
  // the normal not-started state and is safe.
  if (fs.existsSync(set.activityPath)) {
    let activityLogText: string | null = null;
    try {
      activityLogText = fs.readFileSync(set.activityPath, "utf8");
    } catch {
      activityLogText = null;
    }
    const inspection =
      activityLogText === null ? "unreadable" : inspectActivityLog(activityLogText);
    if (inspection === "unreadable") {
      vscode.window.showErrorMessage(
        `Could not inspect "${set.name}"'s activity log (${set.activityPath}) — refusing to change the verification mode while the set's history is unreadable.`
      );
      return;
    }
    if (inspection === "has-records") {
      vscode.window.showInformationMessage(
        `"${set.name}" already has activity-log history — the verification-mode seed is no longer safely rewritable from here.`
      );
      return;
    }
  }

  const current = set.config.verificationMode;
  const picked = await vscode.window.showQuickPick(buildModePickItems(current), {
    placeHolder: `Verification mode for "${set.name}" (currently ${current})`,
    ignoreFocusOut: true,
  });
  if (!picked) return;
  const target = picked.value;

  // Confirm only when the effective mode actually changes; a same-mode
  // pick over a malformed scalar goes straight to the repair path (the
  // helper is the single decision authority — S061-S3-V1-002 pattern).
  if (target !== current) {
    const confirmation = await vscode.window.showQuickPick(
      buildConfirmationItems(target),
      { placeHolder: `Confirm verification-mode change for "${set.name}"` }
    );
    if (!confirmation?.confirmed) return;
  }

  let specText: string;
  try {
    specText = fs.readFileSync(set.specPath, "utf8");
  } catch {
    vscode.window.showErrorMessage(
      `Could not read ${set.specPath} — verification mode not changed.`
    );
    return;
  }

  const result = rewriteSpecVerificationMode(specText, target);
  if (result.outcome === "no-config-block") {
    vscode.window.showWarningMessage(
      `"${set.name}"'s spec.md has no Session Set Configuration block — add one (see the authoring guide) before changing the verification mode.`
    );
    return;
  }
  if (result.outcome === "already-target") {
    vscode.window.showInformationMessage(
      `"${set.name}" already uses ${target} verification.`
    );
    return;
  }
  try {
    fs.writeFileSync(set.specPath, result.text, "utf8");
  } catch {
    vscode.window.showErrorMessage(
      `Could not write ${set.specPath} — verification mode not changed.`
    );
    return;
  }
  void vscode.commands.executeCommand("dabblerSessionSets.refresh");
  vscode.window.showInformationMessage(
    result.previousMode === target
      ? `Repaired "${set.name}"'s malformed verificationMode declaration — now explicitly ${target}.`
      : `"${set.name}" verificationMode → ${target}.`
  );
}

export function registerSetupVerificationCommand(
  context: vscode.ExtensionContext
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "dabblerSessionSets.setupVerification",
      (item: SetItem) => {
        if (!item?.set) {
          vscode.window.showInformationMessage(
            "Set Up Dedicated Verification… is available from a not-started Lightweight session-set row's context menu."
          );
          return;
        }
        void setupVerification(item.set);
      }
    )
  );
}
