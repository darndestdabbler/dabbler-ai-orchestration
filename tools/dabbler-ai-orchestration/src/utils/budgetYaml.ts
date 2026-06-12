// Set 063 Session 2 (spec D1): the pure-TypeScript budget.yaml writer
// behind the Getting Started form's Full-tier budget / NTE step.
//
// The emitted shape is the POST-migration contract locked in the Set 063
// S1 audit (s1-audit.md §2.4): `scope` (not the legacy `threshold_scope`),
// `warn_at_percent: 80` (the migrator's own injected default), `mode`
// derived from the documented threshold→mode bands, and an explicit
// `verification_nte_usd` so no reader needs the defaults-to-threshold
// rule. Emitting that shape makes `migrate_router_config.py`'s
// `_migrate_budget` a no-op and passes the config editor's BUDGET_SCHEMA
// verbatim — the three readers the S1 audit identified.
//
// There is no Python writer to shell to (the retired chat-side bootstrap
// flow was the only prior writer), so this module is the file's first and
// only extension-side writer — the same pure-TS-twin pattern as
// migrateSessionStateV4.ts.

import * as path from "path";
import { FileOps } from "./aiRouterInstall";

/** Relative path of the budget file inside a consumer repo. */
export const BUDGET_YAML_REL = path.join("ai_router", "budget.yaml");

/** The two operator picks for a $0 budget (workflow doc zero-budget tier). */
export type ZeroBudgetMethod = "manual-via-other-engine" | "skipped";

export type VerificationMethod = "api" | ZeroBudgetMethod;

/** The narrowed, validated budget rider the form's Build action carries. */
export interface BudgetChoice {
  thresholdUsd: number;
  /** Required when thresholdUsd === 0; ignored otherwise. */
  zeroMethod?: ZeroBudgetMethod;
}

/**
 * The documented `threshold_usd` → `mode` mapping
 * (docs/adoption-bootstrap.md mode-band table, relocating to
 * docs/budget-yaml-schema.md in S3): 0 → zero-budget; >0 and <20 →
 * limited-budget; 20–99 → middle-tier; 100+ → ample-budget.
 */
export function deriveBudgetMode(thresholdUsd: number): string {
  if (thresholdUsd === 0) return "zero-budget";
  if (thresholdUsd < 20) return "limited-budget";
  if (thresholdUsd < 100) return "middle-tier";
  return "ample-budget";
}

/** Narrow an untrusted webview rider to a finite dollar amount >= 0. */
export function asBudgetUsd(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

/** Narrow an untrusted webview rider to a ZeroBudgetMethod. */
export function asZeroBudgetMethod(value: unknown): ZeroBudgetMethod | undefined {
  return value === "manual-via-other-engine" || value === "skipped"
    ? value
    : undefined;
}

/**
 * Resolve the `verification_method` the file records. Values > 0 always
 * write `"api"` (the rider is ignored — there is no zero-rule to pick).
 * A $0 budget requires the operator's explicit pick (D1 lock: no silent
 * default); without one the choice is unresolved and the caller must
 * not write the file.
 */
export function resolveVerificationMethod(
  thresholdUsd: number,
  zeroMethod: ZeroBudgetMethod | undefined,
): VerificationMethod | undefined {
  if (thresholdUsd > 0) return "api";
  return zeroMethod;
}

/**
 * Local-time ISO-8601 with offset, second precision — the same
 * `±HH:MM`-suffixed shape the rest of the workflow's writers emit
 * (e.g. "2026-06-12T14:30:00-04:00").
 */
export function localIsoTimestamp(d: Date = new Date()): string {
  const pad = (n: number) => String(Math.abs(n)).padStart(2, "0");
  const offMin = -d.getTimezoneOffset();
  const sign = offMin >= 0 ? "+" : "-";
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.floor(Math.abs(offMin) / 60))}:${pad(Math.abs(offMin) % 60)}`
  );
}

/**
 * Render the budget.yaml content in the audited post-migration shape
 * (s1-audit.md §2.4). Field order and quoting follow this repo's own
 * live ai_router/budget.yaml. No `threshold_scope`, no `period`; `notes`
 * is omitted (the form does not collect it).
 */
export function renderBudgetYaml(opts: {
  thresholdUsd: number;
  verificationMethod: VerificationMethod;
  setAt: string;
}): string {
  return [
    "# Project verification budget — written by the Dabbler Getting Started form.",
    "# Used by the workflow for spend reporting and threshold monitoring.",
    `threshold_usd: ${opts.thresholdUsd}`,
    "scope: per-project",
    `mode: "${deriveBudgetMode(opts.thresholdUsd)}"`,
    `verification_method: "${opts.verificationMethod}"`,
    `verification_nte_usd: ${opts.thresholdUsd}`,
    `set_at: "${opts.setAt}"`,
    'set_by: "getting-started-form"',
    "warn_at_percent: 80",
    "",
  ].join("\n");
}

export type BudgetWriteOutcome =
  | "written"
  | "skipped-exists"     // no-clobber: an ai_router/budget.yaml already exists
  | "skipped-unresolved"; // $0 with no zero-rule pick — never write a silent default

/**
 * Write ``<projectDir>/ai_router/budget.yaml`` in the §2.4 shape.
 * Never clobbers an existing file (the scaffold's skip-existing
 * convention); never writes when a $0 budget has no operator-picked
 * verification rule.
 */
export function writeBudgetYaml(
  projectDir: string,
  budget: BudgetChoice,
  fileOps: FileOps,
  now: Date = new Date(),
): { outcome: BudgetWriteOutcome; relPath: string } {
  const relPath = BUDGET_YAML_REL;
  const method = resolveVerificationMethod(budget.thresholdUsd, budget.zeroMethod);
  if (!method) return { outcome: "skipped-unresolved", relPath };
  const abs = path.join(projectDir, relPath);
  if (fileOps.exists(abs)) return { outcome: "skipped-exists", relPath };
  fileOps.writeFile(
    abs,
    renderBudgetYaml({
      thresholdUsd: budget.thresholdUsd,
      verificationMethod: method,
      setAt: localIsoTimestamp(now),
    }),
  );
  return { outcome: "written", relPath };
}
