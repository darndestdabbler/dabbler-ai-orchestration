// Set 063 S2 — unit matrix for the pure-TS budget.yaml writer behind
// the Getting Started form's Full-tier budget / NTE step (spec D1).
//
// The matrix the S1 design lock requires: amounts across all four mode
// bands, $0 with each zero-rule method, invalid-input narrowing,
// Lightweight-never-writes, no-clobber, and the shape checks against
// the audited readers — the config editor's BUDGET_SCHEMA (validated
// directly via validateBatch) and a TS twin of the
// `migrate_router_config._migrate_budget` no-op property (post-
// migration keys only: `scope` not `threshold_scope`, no `period`,
// `warn_at_percent` already present).

import * as assert from "assert";
import * as path from "path";
import { parse as parseYaml } from "yaml";
import {
  BUDGET_YAML_REL,
  asBudgetUsd,
  asZeroBudgetMethod,
  deriveBudgetMode,
  localIsoTimestamp,
  renderBudgetYaml,
  resolveVerificationMethod,
  writeBudgetYaml,
} from "../../utils/budgetYaml";
import { validateBatch } from "../../configEditor/schemaValidator";
import { FileOps } from "../../utils/aiRouterInstall";
import { scaffoldConsumerRepo } from "../../commands/gitScaffold";
import {
  TemplateBundle,
  loadTemplateBundle,
  resolveBundledTemplateDir,
  structureOnlyContext,
} from "../../utils/consumerBootstrap";
import * as fs from "fs";

const FIXED_NOW = new Date(2026, 5, 12, 14, 30, 0); // 2026-06-12T14:30:00 local

// ---------- mode bands (docs/budget-yaml-schema.md mode table) ----------

suite("deriveBudgetMode — the four documented bands", () => {
  test("0 → zero-budget", () => {
    assert.strictEqual(deriveBudgetMode(0), "zero-budget");
  });
  test(">0 and <20 → limited-budget", () => {
    for (const v of [0.01, 1, 10, 19.99]) {
      assert.strictEqual(deriveBudgetMode(v), "limited-budget", String(v));
    }
  });
  test("20–99 → middle-tier", () => {
    for (const v of [20, 50, 99, 99.99]) {
      assert.strictEqual(deriveBudgetMode(v), "middle-tier", String(v));
    }
  });
  test("100+ → ample-budget", () => {
    for (const v of [100, 250, 10000]) {
      assert.strictEqual(deriveBudgetMode(v), "ample-budget", String(v));
    }
  });
});

// ---------- untrusted-rider narrowing ----------

suite("asBudgetUsd / asZeroBudgetMethod — host-side narrowing", () => {
  test("accepts finite numbers >= 0", () => {
    for (const v of [0, 0.5, 25, 100]) {
      assert.strictEqual(asBudgetUsd(v), v);
    }
  });
  test("rejects negatives, non-numbers, NaN, Infinity", () => {
    for (const v of [-1, -0.01, "25", null, undefined, NaN, Infinity, {}, true]) {
      assert.strictEqual(asBudgetUsd(v), undefined, String(v));
    }
  });
  test("zero-method narrows to the two-value enum only", () => {
    assert.strictEqual(
      asZeroBudgetMethod("manual-via-other-engine"),
      "manual-via-other-engine",
    );
    assert.strictEqual(asZeroBudgetMethod("skipped"), "skipped");
    for (const v of ["api", "SKIPPED", "", 0, null, undefined]) {
      assert.strictEqual(asZeroBudgetMethod(v), undefined, String(v));
    }
  });
});

suite("resolveVerificationMethod", () => {
  test("> 0 always resolves to api (zero-rule rider ignored)", () => {
    assert.strictEqual(resolveVerificationMethod(25, undefined), "api");
    assert.strictEqual(resolveVerificationMethod(25, "skipped"), "api");
  });
  test("$0 resolves to the operator's pick — never a silent default", () => {
    assert.strictEqual(
      resolveVerificationMethod(0, "manual-via-other-engine"),
      "manual-via-other-engine",
    );
    assert.strictEqual(resolveVerificationMethod(0, "skipped"), "skipped");
    assert.strictEqual(resolveVerificationMethod(0, undefined), undefined);
  });
});

// ---------- emitted shape vs the audited readers ----------

suite("renderBudgetYaml — the §2.4 post-migration contract shape", () => {
  function emit(thresholdUsd: number, method: "api" | "manual-via-other-engine" | "skipped") {
    return parseYaml(
      renderBudgetYaml({
        thresholdUsd,
        verificationMethod: method,
        setAt: localIsoTimestamp(FIXED_NOW),
      }),
    ) as Record<string, unknown>;
  }

  test("emits exactly the contract fields with the derived mode", () => {
    const doc = emit(25, "api");
    assert.deepStrictEqual(
      Object.keys(doc).sort(),
      [
        "mode",
        "scope",
        "set_at",
        "set_by",
        "threshold_usd",
        "verification_method",
        "verification_nte_usd",
        "warn_at_percent",
      ].sort(),
    );
    assert.strictEqual(doc.threshold_usd, 25);
    assert.strictEqual(doc.scope, "per-project");
    assert.strictEqual(doc.mode, "middle-tier");
    assert.strictEqual(doc.verification_method, "api");
    assert.strictEqual(doc.verification_nte_usd, 25);
    assert.strictEqual(doc.set_by, "getting-started-form");
    assert.strictEqual(doc.warn_at_percent, 80);
  });

  test("$0 with each operator pick records the pick + zero-budget mode", () => {
    for (const method of ["manual-via-other-engine", "skipped"] as const) {
      const doc = emit(0, method);
      assert.strictEqual(doc.threshold_usd, 0);
      assert.strictEqual(doc.mode, "zero-budget");
      assert.strictEqual(doc.verification_method, method);
      assert.strictEqual(doc.verification_nte_usd, 0);
    }
  });

  test("every band's emission passes the config editor BUDGET_SCHEMA", () => {
    for (const v of [0, 5, 20, 99, 100, 12.5]) {
      const doc = emit(v, v === 0 ? "skipped" : "api");
      const result = validateBatch({
        routerConfig: null,
        budget: doc,
        localOverrides: null,
      });
      assert.deepStrictEqual(result.errors, [], `threshold ${v}`);
      assert.strictEqual(result.valid, true, `threshold ${v}`);
    }
  });

  test("TS twin of the _migrate_budget no-op: post-migration keys only", () => {
    const doc = emit(25, "api");
    // The migrator rewrites `threshold_scope` → `scope` (+ optional
    // `period` for legacy monthly) and injects `warn_at_percent` when
    // absent. The emitted shape gives it nothing to do.
    assert.ok(!("threshold_scope" in doc), "must not emit the pre-migration scope key");
    assert.ok(!("period" in doc), "must not emit the legacy monthly period key");
    assert.ok("scope" in doc, "post-migration scope key required");
    assert.strictEqual(doc.warn_at_percent, 80, "migrator default pre-applied");
    assert.ok(!("notes" in doc), "the form collects no notes");
  });
});

suite("localIsoTimestamp", () => {
  test("ISO-8601 local with ±HH:MM offset, second precision", () => {
    const stamp = localIsoTimestamp(FIXED_NOW);
    assert.match(stamp, /^2026-06-12T14:30:00[+-]\d{2}:\d{2}$/);
  });
});

// ---------- writer: no-clobber + unresolved-$0 refusal ----------

/** Minimal in-memory FileOps over a normalized-path map. */
function memFileOps(seed: Record<string, string> = {}): {
  ops: FileOps;
  store: Map<string, string>;
} {
  const store = new Map<string, string>();
  const norm = (p: string) => p.replace(/\\/g, "/");
  for (const [k, v] of Object.entries(seed)) store.set(norm(k), v);
  const ops: FileOps = {
    exists: (p) => store.has(norm(p)),
    readFile: (p) => store.get(norm(p)) ?? "",
    writeFile: (p, c) => void store.set(norm(p), c),
    writeFileExclusive: (p, c) => {
      const k = norm(p);
      if (store.has(k)) {
        const e: NodeJS.ErrnoException = new Error(`EEXIST: ${p} exists`);
        e.code = "EEXIST";
        throw e;
      }
      store.set(k, c);
    },
    mkdirp: () => {},
    copyDir: () => {},
    removeRecursive: (p) => void store.delete(norm(p)),
    mkdtemp: (prefix) => `/tmp/${prefix}0`,
  };
  return { ops, store };
}

const PROJECT = "/repo";
const budgetPath = path.join(PROJECT, BUDGET_YAML_REL).replace(/\\/g, "/");

suite("writeBudgetYaml — write discipline", () => {
  test("writes ai_router/budget.yaml when absent", () => {
    const { ops, store } = memFileOps();
    const r = writeBudgetYaml(PROJECT, { thresholdUsd: 25 }, ops, FIXED_NOW);
    assert.strictEqual(r.outcome, "written");
    const doc = parseYaml(store.get(budgetPath) ?? "") as Record<string, unknown>;
    assert.strictEqual(doc.threshold_usd, 25);
    assert.strictEqual(doc.verification_method, "api");
  });

  test("never clobbers an existing budget.yaml (skip + report)", () => {
    const { ops, store } = memFileOps({ [budgetPath]: "threshold_usd: 99\n" });
    const r = writeBudgetYaml(PROJECT, { thresholdUsd: 25 }, ops, FIXED_NOW);
    assert.strictEqual(r.outcome, "skipped-exists");
    assert.strictEqual(store.get(budgetPath), "threshold_usd: 99\n");
  });

  test("$0 with no zero-rule pick refuses to write (no silent default)", () => {
    const { ops, store } = memFileOps();
    const r = writeBudgetYaml(PROJECT, { thresholdUsd: 0 }, ops, FIXED_NOW);
    assert.strictEqual(r.outcome, "skipped-unresolved");
    assert.ok(!store.has(budgetPath));
  });
});

// ---------- scaffold integration: tier gate + outcome reporting ----------

function canonicalBundleDir(): string {
  const extRoot = path.resolve(__dirname, "../../..");
  const candidates = [
    path.resolve(extRoot, "../../docs/templates/consumer-bootstrap"),
    resolveBundledTemplateDir(extRoot),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "spec.md.template"))) return c;
  }
  throw new Error("Could not locate the consumer-bootstrap bundle for tests.");
}
const bundle: TemplateBundle = loadTemplateBundle(canonicalBundleDir());

suite("scaffoldConsumerRepo — budget write (Set 063 S2, spec D1)", () => {
  test("Full tier with a budget writes budget.yaml at scaffold time", async () => {
    const { ops, store } = memFileOps();
    const result = await scaffoldConsumerRepo({
      projectDir: PROJECT,
      ctx: structureOnlyContext("repo", "full", "2026-06-12"),
      bundle,
      fileOps: ops,
      structureOnly: true,
      budget: { thresholdUsd: 25 },
      now: FIXED_NOW,
      installRouter: async () => ({ ok: true, message: "installed" }),
    });
    assert.strictEqual(result.budgetOutcome, "written");
    const doc = parseYaml(store.get(budgetPath) ?? "") as Record<string, unknown>;
    assert.strictEqual(doc.threshold_usd, 25);
    assert.strictEqual(doc.mode, "middle-tier");
  });

  test("Lightweight NEVER writes budget.yaml, even when a budget rider arrives", async () => {
    const { ops, store } = memFileOps();
    const result = await scaffoldConsumerRepo({
      projectDir: PROJECT,
      ctx: structureOnlyContext("repo", "lightweight", "2026-06-12"),
      bundle,
      fileOps: ops,
      structureOnly: true,
      budget: { thresholdUsd: 25 },
      now: FIXED_NOW,
      installRouter: async () => ({ ok: true, message: "installed" }),
    });
    assert.strictEqual(result.budgetOutcome, null);
    assert.ok(!store.has(budgetPath), "Lightweight must not write budget.yaml");
  });

  test("Full tier without a budget writes nothing (palette path)", async () => {
    const { ops, store } = memFileOps();
    const result = await scaffoldConsumerRepo({
      projectDir: PROJECT,
      ctx: structureOnlyContext("repo", "full", "2026-06-12"),
      bundle,
      fileOps: ops,
      structureOnly: true,
      installRouter: async () => ({ ok: true, message: "installed" }),
    });
    assert.strictEqual(result.budgetOutcome, null);
    assert.ok(!store.has(budgetPath));
  });

  test("existing budget.yaml is kept and the skip is reported", async () => {
    const { ops, store } = memFileOps({ [budgetPath]: "threshold_usd: 99\n" });
    const result = await scaffoldConsumerRepo({
      projectDir: PROJECT,
      ctx: structureOnlyContext("repo", "full", "2026-06-12"),
      bundle,
      fileOps: ops,
      structureOnly: true,
      budget: { thresholdUsd: 25 },
      now: FIXED_NOW,
      installRouter: async () => ({ ok: true, message: "installed" }),
    });
    assert.strictEqual(result.budgetOutcome, "skipped-exists");
    assert.strictEqual(store.get(budgetPath), "threshold_usd: 99\n");
  });
});
