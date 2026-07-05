// Set 062 Sessions 2+3 (spec D3): `Set Up Dedicated Verification…` row
// action, phased by set state. The ActionRegistry predicate gates the
// menu; this handler re-checks as defense in depth since the command is
// also palette-registered.
//
// **Not-started** (Session 2): no durable `verification_mode`
// activity-log record exists yet, so the spec-config seed is still the
// authority — the action rewrites the seed byte-preservingly via the
// pure helper in utils/verificationModeRewrite.ts (the `Switch Tier…`
// pattern), then refreshes. Both directions (A<->B) are legal here;
// B->A is never offered once any activity-log record exists (the Set
// 057 capture is a one-way silent gate: after first record, a spec edit
// is ignored by Python but honored by the Explorer — silent drift — so
// the handler refuses the rewrite entirely in that case).
//
// **Complete Mode-A** (Session 3): the realistic "I finished the work,
// now I want it verified" case. The action invokes the blessed Python
// writer (`python -m ai_router.change_verification_mode <dir> --json`,
// the Set 050 upgradeOlderSets spawn precedent), which appends a gated
// `verification_mode_change` record — A->B ONLY. Only on writer success
// does the handler align the spec seed and copy the kickoff prompt; on
// writer refusal / missing venv-python / spawn failure it informs and
// changes NOTHING — no drift by construction (D3 lock).
//
// Both paths carry an explicit confirmation step with one-way
// consequence copy naming the `N/M+` growth (spec D3 / the Gemini
// confirmation contribution in the design synthesis).

import * as vscode from "vscode";
import * as cp from "child_process";
import * as fs from "fs";
import { SessionSet, VerificationMode } from "../types";
import {
  inspectActivityLog,
  rewriteSpecVerificationMode,
} from "../utils/verificationModeRewrite";
import {
  describeMissingPython,
  interpreterResolves,
  resolvePythonInterpreter,
} from "../utils/pythonInterpreter";
import {
  describeAiRouterImportFailure,
  isAiRouterNotInstalled,
} from "../utils/aiRouterInstall";
import { buildVerificationKickoffPrompt } from "./copyPromptCommands";
import { makeUtf8ChunkDecoder } from "../utils/utf8ChunkDecoder";

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

// ---------- Session 3: the blessed-writer path (complete Mode-A) ----------

// The writer's Python module path — pinned by a unit test against the
// real `ai_router/change_verification_mode.py` CLI.
export const CHANGE_WRITER_MODULE = "ai_router.change_verification_mode";

/** Spawn args for the blessed writer (pure; unit-testable). */
export function buildChangeWriterArgs(setDir: string): string[] {
  return ["-m", CHANGE_WRITER_MODULE, setDir, "--json"];
}

export interface ChangeWriterResult {
  ok: boolean;
  /** The writer's stable machine token ("changed" | "refused-*"), or a
   *  spawn-layer token ("spawn-error" | "router-not-installed" |
   *  "writer-error") when the writer never produced a JSON envelope. */
  code: string;
  reason: string;
}

/**
 * Parse the writer's `--json` envelope (pure; unit-testable). Returns
 * `null` when stdout is not a well-formed envelope — the caller then
 * falls back to stderr-based diagnosis. The writer emits the envelope
 * on BOTH success (exit 0) and gate refusal (exit 3), so a parseable
 * envelope always wins over the exit code.
 */
export function parseChangeWriterOutput(
  stdout: string,
): ChangeWriterResult | null {
  let data: unknown;
  try {
    data = JSON.parse(stdout.trim());
  } catch {
    return null;
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }
  const obj = data as { ok?: unknown; code?: unknown; reason?: unknown };
  if (
    typeof obj.ok !== "boolean" ||
    typeof obj.code !== "string" ||
    typeof obj.reason !== "string"
  ) {
    return null;
  }
  return { ok: obj.ok, code: obj.code, reason: obj.reason };
}

// Host glue: spawn the blessed writer and normalize every failure shape
// into a ChangeWriterResult (the upgradeOlderSets runMigrator pattern).
// Never throws — missing python, missing router, and writer refusals
// all resolve so the caller's inform-and-change-nothing branch is one
// `if (!result.ok)`.
function runChangeWriter(
  pythonPath: string,
  setDir: string,
  cwd: string,
): Promise<ChangeWriterResult> {
  // Set 077 S3 (A10 family, S1 bundle A hardening): pre-check the
  // interpreter before spawning. A missing base Python resolves to the
  // same inform-and-change-nothing branch as a spawn error, but with the
  // friendly missing-Python explainer instead of a raw ENOENT message.
  if (!interpreterResolves(pythonPath)) {
    return Promise.resolve({
      ok: false,
      code: "python-not-found",
      reason: describeMissingPython("Set Up Dedicated Verification"),
    });
  }
  return new Promise((resolve) => {
    const child = cp.spawn(pythonPath, buildChangeWriterArgs(setDir), {
      cwd,
      windowsHide: true,
    });
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
        code: "spawn-error",
        reason:
          `could not spawn Python (${err.message}) — install Python / create ` +
          "the workspace .venv, or set dabblerSessionSets.pythonPath.",
      });
    });
    child.on("close", (exitCode: number | null) => {
      if (spawnErrored) return;
      stdout += outDec.end();
      stderr += errDec.end();
      const parsed = parseChangeWriterOutput(stdout);
      if (parsed) {
        resolve(parsed);
        return;
      }
      if (isAiRouterNotInstalled(stderr)) {
        resolve({
          ok: false,
          code: "router-not-installed",
          reason: describeAiRouterImportFailure(pythonPath),
        });
        return;
      }
      resolve({
        ok: false,
        code: "writer-error",
        reason: (stderr.trim() || stdout.trim() || `exit ${exitCode}`).slice(
          0,
          400,
        ),
      });
    });
  });
}

// Injectable dependencies for the completed-set transition so every
// invocation/fallback branch is unit-testable without a host or a
// Python install (S062-S3-V1-002): the tests assert observable side
// effects (what was written, copied, toasted) per branch.
export interface CompletedSetTransitionDeps {
  runWriter: (
    pythonPath: string,
    setDir: string,
    cwd: string,
  ) => Promise<ChangeWriterResult>;
  readFile: (path: string) => string;
  writeFile: (path: string, text: string) => void;
  copyToClipboard: (text: string) => Promise<void>;
  showInfo: (msg: string) => void;
  showWarning: (msg: string) => void;
  showError: (msg: string) => void;
  refresh: () => void;
}

export type CompletedSetTransitionOutcome =
  // Writer recorded the transition; seed aligned; prompt copied.
  | "changed"
  // Writer recorded the transition; prompt copied; spec-seed alignment
  // failed (surfaced as a warning naming the manual fix).
  | "changed-seed-misaligned"
  // A writer gate refused — expected outcome, nothing touched.
  | "refused"
  // The writer never ran (missing python / router / garbled output) —
  // operational error, nothing touched.
  | "writer-unavailable";

/**
 * The D3-locked completed-set transition, post-confirmation: blessed
 * writer first; ONLY on writer success align the spec seed + copy the
 * kickoff prompt + toast. On any failure: inform, change nothing — no
 * drift by construction. Exported with injected deps so the failure
 * matrix is pinned by unit tests.
 */
export async function applyCompletedSetTransition(
  set: SessionSet,
  pythonPath: string,
  deps: CompletedSetTransitionDeps,
): Promise<CompletedSetTransitionOutcome> {
  const result = await deps.runWriter(pythonPath, set.dir, set.root);

  if (!result.ok) {
    // Inform and change NOTHING (D3 lock). Gate refusals are expected
    // outcomes — informational; spawn / router / writer errors are
    // operational problems — errors.
    if (result.code.startsWith("refused-")) {
      deps.showInfo(
        `Verification mode not changed (${result.code}): ${result.reason}`,
      );
      return "refused";
    }
    deps.showError(
      `Verification mode not changed — the blessed writer did not run (${result.code}): ${result.reason}`,
    );
    return "writer-unavailable";
  }

  // Writer success: the durable record now governs Python. Align the
  // spec seed so the Explorer (which reads the spec) matches; a seed
  // failure here is surfaced but does not undo the recorded transition.
  let seedAligned = false;
  try {
    const specText = deps.readFile(set.specPath);
    const rewrite = rewriteSpecVerificationMode(specText, "dedicated-sessions");
    if (rewrite.outcome === "already-target") {
      seedAligned = true;
    } else if (rewrite.outcome === "rewritten") {
      deps.writeFile(set.specPath, rewrite.text);
      seedAligned = true;
    }
  } catch {
    seedAligned = false;
  }

  await deps.copyToClipboard(buildVerificationKickoffPrompt(set));
  deps.refresh();
  if (seedAligned) {
    deps.showInfo(
      "verificationMode → dedicated-sessions. Kickoff prompt copied — paste it to your AI agent.",
    );
    return "changed";
  }
  deps.showWarning(
    "verificationMode → dedicated-sessions (recorded), but spec.md's seed could not be updated — set `verificationMode: dedicated-sessions` in the Session Set Configuration block by hand so the Explorer matches the record. Kickoff prompt copied.",
  );
  return "changed-seed-misaligned";
}

// Host glue: real dependencies for the production command path.
function realCompletedSetDeps(): CompletedSetTransitionDeps {
  return {
    runWriter: runChangeWriter,
    readFile: (p) => fs.readFileSync(p, "utf8"),
    writeFile: (p, text) => fs.writeFileSync(p, text, "utf8"),
    copyToClipboard: (text) => Promise.resolve(vscode.env.clipboard.writeText(text)),
    showInfo: (m) => void vscode.window.showInformationMessage(m),
    showWarning: (m) => void vscode.window.showWarningMessage(m),
    showError: (m) => void vscode.window.showErrorMessage(m),
    refresh: () =>
      void vscode.commands.executeCommand("dabblerSessionSets.refresh"),
  };
}

// The confirmation wrapper: A->B is the only direction on a completed
// set (B->A is never offered once any record exists; the writer refuses
// it regardless), so the flow goes straight to the explicit
// confirmation step, then hands off to the testable core above.
async function setupVerificationOnCompletedSet(set: SessionSet): Promise<void> {
  const confirmation = await vscode.window.showQuickPick(
    buildConfirmationItems("dedicated-sessions"),
    {
      placeHolder: `Enable dedicated verification for "${set.name}"? The transition is recorded by the blessed writer.`,
      ignoreFocusOut: true,
    }
  );
  if (!confirmation?.confirmed) return;

  await applyCompletedSetTransition(
    set,
    resolvePythonInterpreter(set.root),
    realCompletedSetDeps(),
  );
}

// ---------- the state-dispatching handler ----------

async function setupVerification(set: SessionSet): Promise<void> {
  if (set.config.tier !== "lightweight") {
    vscode.window.showInformationMessage(
      `"${set.name}" is a Full-tier set — verificationMode governs Lightweight verification only (Full tier verifies through the router automatically).`
    );
    return;
  }
  if (set.state === "complete") {
    if (set.config.verificationMode === "dedicated-sessions") {
      vscode.window.showInformationMessage(
        `"${set.name}" already uses dedicated-sessions verification — use the Verification Kickoff prompt to hand the typed flow to an agent.`
      );
      return;
    }
    await setupVerificationOnCompletedSet(set);
    return;
  }
  if (set.state !== "not-started") {
    vscode.window.showInformationMessage(
      `"${set.name}" is ${set.state} — dedicated verification is set up on a not-started set (seed rewrite) or a completed set (recorded transition). In-flight sets are excluded deliberately.`
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
            "Set Up Dedicated Verification… is available from a not-started or completed Lightweight session-set row's context menu."
          );
          return;
        }
        void setupVerification(item.set);
      }
    )
  );
}
