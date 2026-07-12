// Set 060 Session 1: pure completion-detection model for the Getting
// Started form (spec D3) + the dual-mode Explorer switch (D1/D5).
//
// This module is intentionally VS Code-free: it takes a workspace root
// (absolute path) and an injected filesystem so it is fully unit-
// testable without a live extension host or a real directory tree. The
// host (CustomSessionSetsView) supplies the node-backed adapter
// (`nodeDetectionFs`); tests supply an in-memory fake.
//
// D3 — completion-detection rules (operator-locked 2026-06-10):
//   - Step 1 "Build project structure" complete (`structureBuilt`) =
//     `.venv` present AND `dabbler-ai-router` importable AND all three
//     engine files (CLAUDE.md / AGENTS.md / GEMINI.md) present.
//   - Step 2 "Import project-plan.md" complete (`planPresent`) =
//     `docs/planning/project-plan.md` exists.
//   - Step 3 "Build session sets" complete (`sessionSetsPresent`) =
//     at least one `docs/session-sets/NNN-* ` directory exists.
//
// "Importable" via a pure filesystem check: we cannot run a Python
// import from a pure TS predicate, so we use the strongest filesystem
// proxy available — an `ai_router` package directory under a
// `site-packages` inside `.venv`. This is the on-disk shape `pip
// install dabbler-ai-router` produces (the PyPI dist `dabbler-ai-router`
// imports as `ai_router`). It is a proxy, not a guarantee, but it
// matches what the scaffolder installs and what the cold-start chain
// expects.

import * as fs from "fs";
import * as path from "path";
import {
  ExplorerMode,
  GettingStartedPayload,
} from "../types/sessionSetsWebviewProtocol";

/**
 * The completion flag(s) for the Getting Started form. Set 094: the form
 * shrank to two sections (Build project structure + Define modules), so the
 * old step-2 `planPresent` and step-3 `sessionSetsPresent` flags are retired
 * — `structureBuilt` is the sole surviving completion signal (it still
 * greys/checks the Build section AND feeds the System Status strip's
 * `workspaceInitialized` computation). Kept as an interface (not a bare
 * boolean) so the field carries its D3 doc and future signals can join.
 */
export interface CompletionState {
  /** `.venv` + router importable + all three engine files. */
  structureBuilt: boolean;
}

/**
 * Minimal injected filesystem the detection model needs. Keeps the
 * core decoupled from node `fs` so tests pass an in-memory fake. All
 * three methods must be total — `isDirectory` / `readdir` on a missing
 * path return `false` / `[]` rather than throwing.
 */
export interface DetectionFs {
  /** True iff a file or directory exists at `p`. */
  exists(p: string): boolean;
  /** True iff `p` exists AND is a directory. */
  isDirectory(p: string): boolean;
  /** Entry names directly under `p`; `[]` when `p` is missing / not a dir. */
  readdir(p: string): string[];
}

// The three root-level engine instruction files the scaffolder writes.
const ENGINE_FILES = ["CLAUDE.md", "AGENTS.md", "GEMINI.md"];

/**
 * Filesystem proxy for "`dabbler-ai-router` importable": an `ai_router`
 * package directory exists under a `site-packages` inside `.venv`.
 * Covers both the Windows venv layout (`.venv/Lib/site-packages`) and
 * the POSIX layout (`.venv/lib/pythonX.Y/site-packages`). Returns false
 * when `.venv` itself is absent.
 */
function routerInstalled(root: string, fsi: DetectionFs): boolean {
  const venvDir = path.join(root, ".venv");
  if (!fsi.isDirectory(venvDir)) return false;
  const siteCandidates: string[] = [
    // Windows venv
    path.join(venvDir, "Lib", "site-packages"),
  ];
  // POSIX venv: .venv/lib/<pythonX.Y>/site-packages — the python
  // version directory name is not fixed, so enumerate.
  const libDir = path.join(venvDir, "lib");
  if (fsi.isDirectory(libDir)) {
    for (const entry of fsi.readdir(libDir)) {
      siteCandidates.push(path.join(libDir, entry, "site-packages"));
    }
  }
  return siteCandidates.some((sp) => fsi.isDirectory(path.join(sp, "ai_router")));
}

/**
 * True iff `p` exists AND is a regular file (not a directory). The
 * scaffold artifacts the completion checks key on are files; a directory
 * that happens to be named `CLAUDE.md` / `project-plan.md` must NOT
 * satisfy the step (S1 verifier Issue 2).
 */
function fileExists(p: string, fsi: DetectionFs): boolean {
  return fsi.exists(p) && !fsi.isDirectory(p);
}

/** True iff all three engine instruction files exist (as files) at the root. */
function engineFilesPresent(root: string, fsi: DetectionFs): boolean {
  return ENGINE_FILES.every((f) => fileExists(path.join(root, f), fsi));
}

/**
 * Compute the Build-section completion flag for `root`. Pure: depends only
 * on the injected `fsi`. Never throws — a missing root yields false. Set
 * 094: `planPresent` / `sessionSetsPresent` retired with the form's plan and
 * session-set steps.
 */
export function detectCompletion(root: string, fsi: DetectionFs): CompletionState {
  return {
    structureBuilt: routerInstalled(root, fsi) && engineFilesPresent(root, fsi),
  };
}

// ---------- D6 — provider-key validation (Set 060 Session 3) ----------

// The provider keys the Full tier can route through. Any ONE of them
// present satisfies D6 (the router needs at least one provider).
const PROVIDER_KEY_VARS = [
  "DABBLER_ANTHROPIC_API_KEY",
  "DABBLER_OPENAI_API_KEY",
  "DABBLER_GEMINI_API_KEY",
] as const;

/**
 * D6 predicate: true iff at least one provider API key is set to a
 * non-blank value in `env`.
 *
 * The host passes `process.env`, which covers BOTH Windows System and
 * User environment variables: the VS Code extension host inherits the
 * merged System+User environment captured when VS Code launched. That
 * launch-time capture is also why the D6 warning tells the operator to
 * **reload the window** after setting a key — a variable set after
 * launch (System or User) is invisible to `process.env` until the
 * window reloads. A whitespace-only value counts as absent: it cannot
 * authenticate, so treating it as present would suppress the warning
 * exactly when the operator needs it.
 */
export function providerKeyPresent(
  env: Record<string, string | undefined>,
): boolean {
  return PROVIDER_KEY_VARS.some((k) => {
    const v = env[k];
    return typeof v === "string" && v.trim().length > 0;
  });
}

/**
 * D1/D5 dual-mode switch. The Session Set Explorer renders:
 *   - "no-folder"        when no workspace folder is open;
 *   - "getting-started"  when a folder is open but it has no session sets;
 *   - "list"             when ≥1 session set exists (today's behavior).
 *
 * `hasAnySets` is the merged-across-roots count signal the Explorer
 * already computes, so a set discovered in any worktree flips the mode
 * to "list".
 */
export function selectExplorerMode(hasFolder: boolean, hasAnySets: boolean): ExplorerMode {
  if (!hasFolder) return "no-folder";
  return hasAnySets ? "list" : "getting-started";
}

/**
 * Compose the `GettingStartedPayload` the webview consumes from the host's
 * observable inputs. Pure (fs injected) so the host stays a thin adapter
 * and the composition — including the optimization that the fs probe runs
 * ONLY in "getting-started" mode — is unit-testable.
 *
 * `root` is the detection root (the first open workspace folder, per D5);
 * `hasAnySets` is the merged-across-roots count signal (which includes
 * worktrees) that flips the mode to "list". In any mode other than
 * "getting-started" the completion flag reports false and no probe runs.
 *
 * Set 094: the environment/probe inputs that fed the OLD form warnings
 * (`env` provider-key check, `resolvePythonPresent`, `resolveCopilotCliPresent`)
 * are gone — Set 092 S2 moved those faults to the System Status strip, which
 * computes them independently (`buildSystemStatus`), so the payload copies
 * were dead. The two-section form needs only the tier / verification-mode /
 * seat-profile seeds below.
 *
 * `resolveTierSeed` (Set 077 S2, A1) resolves the workspace's durable tier
 * (the `.dabbler/tier` marker → router-config inference chain). Injected as
 * a thunk — it runs ONLY in "getting-started" mode, the one mode that renders
 * the form the seed feeds. `resolveVerificationModeSeed` (Set 077 S3)
 * resolves the durable `.dabbler/verification-mode` marker the same way (no
 * inference rung — marker or null). `resolveTransportProfileSeed` (Set 079)
 * resolves the durable Full-tier seat-profile seed. All three are
 * getting-started-mode-gated; hosts that omit a thunk get null.
 */
export function computeGettingStarted(
  hasFolder: boolean,
  root: string | undefined,
  hasAnySets: boolean,
  fsi: DetectionFs,
  resolveTierSeed?: (root: string) => "full" | "lightweight" | null,
  resolveVerificationModeSeed?: (
    root: string,
  ) => "dedicated-sessions" | "out-of-band-or-none" | null,
  resolveTransportProfileSeed?: (root: string) => "api" | "copilot-cli" | null,
): GettingStartedPayload {
  const mode = selectExplorerMode(hasFolder, hasAnySets);
  const completion =
    mode === "getting-started" && root
      ? detectCompletion(root, fsi)
      : { structureBuilt: false };
  const tierSeed =
    mode === "getting-started" && root && resolveTierSeed
      ? resolveTierSeed(root)
      : null;
  const verificationModeSeed =
    mode === "getting-started" && root && resolveVerificationModeSeed
      ? resolveVerificationModeSeed(root)
      : null;
  const transportProfileSeed =
    mode === "getting-started" && root && resolveTransportProfileSeed
      ? resolveTransportProfileSeed(root)
      : null;
  // S077-S2-V1-001: the root the form (and seed) belongs to, so the
  // webview can scope its persisted state per root.
  const rootId = mode === "getting-started" && root ? root : null;
  return {
    mode,
    ...completion,
    tierSeed,
    rootId,
    verificationModeSeed,
    transportProfileSeed,
  };
}

/**
 * Node-`fs`-backed `DetectionFs` adapter for the live extension host.
 * Kept here (not in the VS Code layer) because it depends only on node
 * `fs`, never on `vscode` — the module stays host-free and testable.
 * Every method is total: missing paths yield `false` / `[]` instead of
 * throwing, so the detection model never needs its own try/catch.
 */
export const nodeDetectionFs: DetectionFs = {
  exists(p: string): boolean {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  },
  isDirectory(p: string): boolean {
    try {
      return fs.statSync(p).isDirectory();
    } catch {
      return false;
    }
  },
  readdir(p: string): string[] {
    try {
      return fs.readdirSync(p);
    } catch {
      return [];
    }
  },
};
