// Set 077 Session 2 (Feature 1, A1/A11 + Critique-2 M1/M2): the durable
// tier-choice marker store.
//
// The Getting Started tier radio is volatile webview state — it dies on
// webview teardown, so every downstream consumer that trusted it
// (decomposition prompt, form re-render, scaffold summary) silently
// reverted to Full after a reload (the Set 076-era "chose Lightweight,
// extension still says Full" leak). This module gives the operator's
// choice a durable home:
//
//   `.dabbler/tier`               — one word, `full` | `lightweight`
//   `.dabbler/verification-mode`  — one word, `dedicated-sessions` |
//                                   `out-of-band-or-none` (Critique-2 M1:
//                                   the three-way Getting Started choice's
//                                   second dimension, so Set 077 S3 lands
//                                   on a stable two-field contract)
//
// Both files are UTF-8, no BOM, single word + trailing newline — the
// `.dabbler/install-method` marker convention. They are WRITE-THROUGH
// CACHES of the operator's latest sanctioned choice (Critique-2 M2):
// every sanctioned tier-changing path (the scaffold, `Switch Tier…`)
// updates them in the same write, so they cannot drift from a sanctioned
// switch. Manual spec edits are covered by the Explorer's tier-mismatch
// advisory instead (SessionSetsModel / tierLegibility).
//
// Read precedence for "the tier" (shared by the form + prompt paths, per
// the Feature 1 contract): marker → router-config inference → volatile
// UI state. `resolveDurableTier` owns the first two rungs; callers apply
// `?? <volatile>` for the last. Readers are TOLERANT (unknown / missing
// values read as null — a corrupt marker must not take the Explorer
// down); the fail-loud narrowing lives at the scaffold/form boundary
// (`asTier` in gitScaffold.ts), where the operator can still fix it.
//
// VS Code-free by design (the tierRewrite.ts pattern): filesystem access
// goes through the injected `FileOps` subset so the Layer-2 suite covers
// the precedence contract without touching the real disk.

import * as fs from "fs";
import * as path from "path";
import {
  INSTALL_METHOD_REL,
  ROUTER_CONFIG_REL,
} from "./aiRouterInstall";
import { Tier } from "./consumerBootstrap";
import { VerificationMode } from "../types";

/** Relative path of the durable tier marker. */
export const TIER_MARKER_REL = path.posix.join(".dabbler", "tier");

/** Relative path of the durable verification-mode marker (Critique-2 M1). */
export const VERIFICATION_MODE_MARKER_REL = path.posix.join(
  ".dabbler",
  "verification-mode",
);

/**
 * The `FileOps` subset the marker store needs. Structurally satisfied by
 * the full `aiRouterInstall.FileOps` (so scaffold callers pass their
 * existing ops object) and by the node-backed default below.
 */
export interface MarkerFileOps {
  exists(absPath: string): boolean;
  readFile(absPath: string): string;
  writeFile(absPath: string, content: string): void;
  mkdirp(absPath: string): void;
}

/** Node-`fs`-backed ops for reader call sites (Explorer scan, prompts). */
export const nodeMarkerFileOps: MarkerFileOps = {
  exists(p: string): boolean {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  },
  readFile(p: string): string {
    return fs.readFileSync(p, "utf8");
  },
  writeFile(p: string, content: string): void {
    fs.writeFileSync(p, content, "utf8");
  },
  mkdirp(p: string): void {
    fs.mkdirSync(p, { recursive: true });
  },
};

/** Read one single-word marker file; null when missing / unreadable. */
function readMarkerWord(
  root: string,
  rel: string,
  ops: MarkerFileOps,
): string | null {
  const abs = path.join(root, rel);
  if (!ops.exists(abs)) return null;
  try {
    return ops.readFile(abs).trim().toLowerCase();
  } catch {
    return null;
  }
}

/** Write one single-word marker file (word + trailing newline, UTF-8). */
function writeMarkerWord(
  root: string,
  rel: string,
  word: string,
  ops: MarkerFileOps,
): void {
  const abs = path.join(root, rel);
  ops.mkdirp(path.dirname(abs));
  ops.writeFile(abs, `${word}\n`);
}

/**
 * Read `.dabbler/tier`. Tolerant: missing file, unreadable file, or an
 * unrecognized word all read as null (callers fall through the
 * precedence chain). Case-insensitive on read; writes are canonical
 * lowercase.
 */
export function readTierMarker(
  root: string,
  ops: MarkerFileOps = nodeMarkerFileOps,
): Tier | null {
  const word = readMarkerWord(root, TIER_MARKER_REL, ops);
  return word === "full" || word === "lightweight" ? word : null;
}

/** Write-through `.dabbler/tier` with the operator's sanctioned choice. */
export function writeTierMarker(
  root: string,
  tier: Tier,
  ops: MarkerFileOps = nodeMarkerFileOps,
): void {
  writeMarkerWord(root, TIER_MARKER_REL, tier, ops);
}

/** Read `.dabbler/verification-mode`; same tolerant contract as the tier. */
export function readVerificationModeMarker(
  root: string,
  ops: MarkerFileOps = nodeMarkerFileOps,
): VerificationMode | null {
  const word = readMarkerWord(root, VERIFICATION_MODE_MARKER_REL, ops);
  return word === "dedicated-sessions" || word === "out-of-band-or-none"
    ? word
    : null;
}

/** Write-through `.dabbler/verification-mode`. */
export function writeVerificationModeMarker(
  root: string,
  mode: VerificationMode,
  ops: MarkerFileOps = nodeMarkerFileOps,
): void {
  writeMarkerWord(root, VERIFICATION_MODE_MARKER_REL, mode, ops);
}

/** Where a resolved durable tier came from (feeds truthful prompt copy). */
export type DurableTierSource = "marker" | "inference";

export interface DurableTier {
  tier: Tier;
  source: DurableTierSource;
}

/**
 * Resolve the workspace's durable tier: the marker first, then — only
 * when there is scaffold/install evidence (`.dabbler/install-method`,
 * written by every tier's router install, so a pre-0.34 scaffold that
 * never wrote a tier marker still resolves) — the Set 058 divergence
 * inference: `ai_router/router-config.yaml` present ⇒ full, absent ⇒
 * lightweight. Null when the workspace carries no durable signal at all
 * (e.g. a fresh, never-scaffolded folder) — the caller falls back to
 * volatile UI state or an explicit "nothing is recorded" posture, never
 * to a silent Full default.
 */
export function resolveDurableTier(
  root: string,
  ops: MarkerFileOps = nodeMarkerFileOps,
): DurableTier | null {
  const marker = readTierMarker(root, ops);
  if (marker !== null) return { tier: marker, source: "marker" };
  if (!ops.exists(path.join(root, INSTALL_METHOD_REL))) return null;
  return {
    tier: ops.exists(path.join(root, ROUTER_CONFIG_REL)) ? "full" : "lightweight",
    source: "inference",
  };
}

/**
 * Derive the consumer-repo root from a set's `spec.md` path
 * (`<root>/docs/session-sets/<slug>/spec.md`). The Set 077 A11 fix for
 * `Switch Tier…`: the guardrail probe and the marker write-through must
 * anchor on the SAME root the spec write targets — probing a separately
 * carried `set.root` field can diverge from the written path after a
 * cross-root dedup-merge.
 */
export function repoRootForSpecPath(specPath: string): string {
  return path.resolve(path.dirname(specPath), "..", "..", "..");
}
