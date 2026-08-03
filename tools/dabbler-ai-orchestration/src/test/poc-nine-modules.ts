// POC for Set 108's open risk: does the Work Explorer's module grouping stay
// legible at three members x three modules?
//
// This drives the SHIPPING functions (computeVisibleModules / bucketSets), not a
// reimplementation, so what it prints is what the renderer would be handed.
// Run:
//   npx mocha --require ts-node/register --require ./src/test/vscode-stub.js \
//             --ui tdd --timeout 120000 src/test/poc-nine-modules.ts

import * as assert from "assert";
import {
  bucketSets,
  computeVisibleModules,
  VisibleModule,
} from "../providers/SessionSetsModel";
import { ModulesManifestClassification } from "../utils/moduleAuthoring";
import { ModuleManifestEntry, SessionSet, SessionState } from "../types";

function fakeSet(over: Partial<SessionSet> = {}): SessionSet {
  return {
    name: "x",
    module: null,
    moduleTitle: null,
    moduleOrder: null,
    dir: "/x",
    specPath: "/x/spec.md",
    activityPath: "/x/activity-log.json",
    changeLogPath: "/x/change-log.md",
    statePath: "/x/session-state.json",
    aiAssignmentPath: "/x/ai-assignment.md",
    uatChecklistPath: "/x/x-uat-checklist.json",
    state: "not-started",
    totalSessions: null,
    sessionsCompleted: 0,
    lastTouched: null,
    liveSession: null,
    config: {
      requiresUAT: false,
      requiresE2E: false,
      uatScope: "none",
      tier: "full",
      verificationMode: "out-of-band-or-none",
      module: null,
    },
    uatSummary: null,
    root: "/x",
    needsMigration: false,
    migrationTargetSchemaVersion: null,
    schemaVersionOnDisk: null,
    prerequisites: null,
    blockedByPrereqs: false,
    unsatisfiedPrereqs: [],
    plusFraction: false,
    externalVerificationNoteExists: false,
    completedVerification: null,
    verificationMarker: "",
    workspaceTierMarker: null,
    ...over,
  } as SessionSet;
}

function stamped(name: string, raw: string, state: SessionState, over: Partial<SessionSet> = {}): SessionSet {
  const base = fakeSet({ name, state, ...over });
  return { ...base, config: { ...base.config, module: raw } };
}

function entry(slug: string, title: string, order: number): ModuleManifestEntry {
  return {
    slug,
    title,
    codeRoots: [`modules/${slug}`],
    planPath: `docs/modules/${slug}/project-plan.md`,
    touches: [],
    ...({ moduleOrder: order } as Partial<ModuleManifestEntry>),
  } as ModuleManifestEntry;
}

const MEMBERS = ["priya", "sam", "chen"];
const SERVICES = ["converter", "persistence", "watcher"];

/**
 * Candidate naming schemes S1 has to choose between.
 * `hybrid` keeps the durable slug version-scoped while the *title* — which is
 * what the tree actually renders — names the owner.
 */
type Scheme = "person" | "version" | "hybrid";

function buildModules(scheme: Scheme): ModuleManifestEntry[] {
  const out: ModuleManifestEntry[] = [];
  let order = 0;
  MEMBERS.forEach((member, memberIndex) => {
    SERVICES.forEach((service) => {
      const v = memberIndex + 1;
      const slug =
        scheme === "person" ? `${service}-${member}` : `${service}-v${v}`;
      const title =
        scheme === "person"
          ? `${cap(service)} (${cap(member)})`
          : scheme === "version"
            ? `${cap(service)} v${v}`
            : `${cap(service)} v${v} — ${cap(member)}`;
      out.push(entry(slug, title, order++));
    });
  });
  return out;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Each module carries the two scaffolded lifecycle sets plus one work set —
 * the smallest realistic load, so this is a floor on the row count, not a
 * worst case.
 */
function buildSets(entries: ModuleManifestEntry[]): SessionSet[] {
  const sets: SessionSet[] = [];
  entries.forEach((e, i) => {
    // Vary state so every status bucket is exercised somewhere.
    const workState: SessionState =
      i % 3 === 0 ? "complete" : i % 3 === 1 ? "in-progress" : "not-started";
    sets.push(stamped(`${e.slug}-plan`, e.slug, "complete"));
    sets.push(stamped(`${e.slug}-decomposition`, e.slug, "complete"));
    sets.push(stamped(`${e.slug}-build`, e.slug, workState));
  });
  return sets;
}

function render(scheme: Scheme): { lines: string[]; rows: number } {
  const entries = buildModules(scheme);
  const classification: ModulesManifestClassification = {
    kind: "present",
    entries,
  };
  const sets = buildSets(entries);

  const modules: VisibleModule[] = computeVisibleModules(classification, sets, {
    legacyRootPlanExists: false,
  });

  const lines: string[] = [];
  let rows = 0;

  for (const m of modules) {
    lines.push(`▾ ${m.displayName}   [${m.kind}]${m.warning ? "  ⚠ " + m.warning.code : ""}`);
    rows++;
    const buckets = bucketSets([...m.sets]) as unknown as Record<string, SessionSet[]>;
    for (const [bucketName, bucketSetsList] of Object.entries(buckets)) {
      if (!Array.isArray(bucketSetsList) || bucketSetsList.length === 0) continue;
      lines.push(`    ▾ ${bucketName} (${bucketSetsList.length})`);
      rows++;
      for (const s of bucketSetsList) {
        lines.push(`        • ${s.name}`);
        rows++;
      }
    }
  }
  return { lines, rows };
}

suite("POC — Work Explorer at three members x three modules", () => {
  test("day one: nine declared modules with no sets yet still render", () => {
    // What the team sees the moment the manifest is written, before anyone runs
    // a session. An empty tree here would be a bad first impression.
    const entries = buildModules("hybrid");
    const modules = computeVisibleModules({ kind: "present", entries }, [], {
      legacyRootPlanExists: false,
    });
    console.log(`\n${"=".repeat(72)}\nDAY ONE — manifest written, no sets yet\n${"=".repeat(72)}`);
    for (const m of modules) {
      console.log(`▾ ${m.displayName}   [${m.kind}] ${m.sets.length} sets`);
    }
    assert.strictEqual(modules.length, 9, "all nine should render with zero sets");
    assert.ok(modules.every((m) => m.sets.length === 0));
    assert.ok(modules.every((m) => m.warning === null), "empty is healthy, not a warning");
  });

  test("renders nine modules and reports the shape", () => {
    for (const scheme of ["person", "version", "hybrid"] as Scheme[]) {
      const { lines, rows } = render(scheme);
      console.log(`\n${"=".repeat(72)}`);
      console.log(`NAMING SCHEME: ${scheme}`);
      console.log("=".repeat(72));
      console.log(lines.join("\n"));
      console.log(
        `\n-- ${scheme}: 9 modules, ${rows} rows fully expanded, ` +
          `${lines.filter((l) => l.startsWith("▾")).length} top-level rows collapsed --`,
      );
    }
  });

  test("all nine declared modules are visible and none is a fallback", () => {
    const entries = buildModules("version");
    const modules = computeVisibleModules(
      { kind: "present", entries },
      buildSets(entries),
      { legacyRootPlanExists: false },
    );
    assert.strictEqual(modules.length, 9, "expected exactly nine module groups");
    assert.ok(
      modules.every((m) => m.kind === "declared"),
      "every module should be declared, none a fallback",
    );
    assert.ok(
      modules.every((m) => m.sets.length === 3),
      "every module should carry its three sets",
    );
    assert.ok(
      modules.every((m) => m.warning === null),
      "no module should carry a warning",
    );
  });

  test("manifest order is preserved, so members stay contiguous", () => {
    const entries = buildModules("person");
    const modules = computeVisibleModules(
      { kind: "present", entries },
      buildSets(entries),
      { legacyRootPlanExists: false },
    );
    assert.deepStrictEqual(
      modules.map((m) => m.slug),
      entries.map((e) => e.slug),
      "module order should follow the manifest, not sort alphabetically",
    );
  });
});
