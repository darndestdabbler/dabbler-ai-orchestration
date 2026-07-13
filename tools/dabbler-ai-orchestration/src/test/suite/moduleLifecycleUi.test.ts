// Set 100 Session 1 — the flattened module tree's kind-aware rows and
// the prerequisite badge as the plan gate (module-lifecycle
// simplification verdict; spec: docs/session-sets/100-work-explorer-
// module-lifecycle-ui/spec.md).
//
// Covers the spec's Step-5 list:
//   - kind badge model functions (pure, shared by host + tests);
//   - kind surfaces end-to-end from disk (scan → SessionSet.kind →
//     badge), including the Set 098 warn-and-degrade posture;
//   - the state matrix at the payload layer: module with no sets /
//     kind sets only / mixed; pseudo-module; fallback groups;
//   - the blocked marker (existing Set 061 machinery) carrying the
//     retired `blocked-until-plan` signal on a scaffolded decomposition
//     set whose plan set is incomplete — and clearing when the plan
//     set completes;
//   - host wiring source scan (house pattern — buildRow is private).

import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  BLOCKED_MARKER,
  blockedMarker,
  blockedTooltip,
  buildVisibleModulePayloads,
  computeVisibleModules,
  kindBadge,
  kindTooltip,
} from "../../providers/SessionSetsModel";
import {
  classifyModulesManifest,
  scaffoldModuleLifecycleSets,
} from "../../utils/moduleAuthoring";
import { readSessionSets } from "../../utils/fileSystem";
import { ModuleManifestEntry, SessionSet, SessionState } from "../../types";
import { RowPayload } from "../../types/sessionSetsWebviewProtocol";

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
  };
}

function makeTmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function entry(slug: string, title?: string): ModuleManifestEntry {
  return { slug, title: title ?? slug, codeRoots: [], planPath: null, touches: [] };
}

function writeManifest(root: string, slugs: string[]): void {
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "docs", "modules.yaml"),
    "modules:\n" + slugs.map((s) => `  - slug: ${s}\n`).join(""),
    "utf8",
  );
}

function writeSet(
  root: string,
  name: string,
  opts: { module?: string; kind?: string } = {},
): void {
  const dir = path.join(root, "docs", "session-sets", name);
  fs.mkdirSync(dir, { recursive: true });
  const moduleLine = opts.module ? `module: ${opts.module}\n` : "";
  const kindLine = opts.kind ? `kind: ${opts.kind}\n` : "";
  fs.writeFileSync(
    path.join(dir, "spec.md"),
    `# ${name}\n\n## Session Set Configuration\n\`\`\`yaml\n` +
      `tier: full\nrequiresUAT: false\nrequiresE2E: false\n` +
      `${moduleLine}${kindLine}\`\`\`\n`,
    "utf8",
  );
}

/** A v4 state file marking every session of the set `status`. */
function writeState(setDir: string, status: SessionState, totalSessions = 1): void {
  const sessions = [];
  for (let n = 1; n <= totalSessions; n++) {
    sessions.push({
      number: n,
      title: `S${n}`,
      status: status === "complete" ? "complete" : "not-started",
      startedAt: null,
      completedAt: null,
      orchestrator: null,
      verificationVerdict: null,
    });
  }
  fs.writeFileSync(
    path.join(setDir, "session-state.json"),
    JSON.stringify(
      {
        schemaVersion: 4,
        sessionSetName: path.basename(setDir),
        status,
        sessions,
      },
      null,
      2,
    ),
    "utf8",
  );
}

suite("Set 100 S1 — kind badge model functions", () => {
  test("kindBadge is empty on an ordinary work set and the kind verbatim on lifecycle sets", () => {
    assert.strictEqual(kindBadge(fakeSet()), "");
    assert.strictEqual(kindBadge(fakeSet({ kind: "plan" })), "plan");
    assert.strictEqual(kindBadge(fakeSet({ kind: "decomposition" })), "decomposition");
  });

  test("kindTooltip explains each lifecycle kind and stays empty otherwise", () => {
    assert.strictEqual(kindTooltip(fakeSet()), "");
    assert.ok(kindTooltip(fakeSet({ kind: "plan" })).includes("project plan"));
    assert.ok(
      kindTooltip(fakeSet({ kind: "decomposition" })).includes("session sets"),
    );
  });
});

suite("Set 100 S1 — kind surfaces end-to-end from disk", () => {
  test("scan → SessionSet.kind → badge; an unknown kind degrades badge-less (Set 098 posture)", () => {
    const root = makeTmpDir("dabbler-kindscan-");
    try {
      writeSet(root, "001-work");
      writeSet(root, "002-plan", { kind: "plan" });
      writeSet(root, "003-decomp", { kind: "decomposition" });
      writeSet(root, "004-bogus", { kind: "no-such-kind" });
      const byName = new Map(readSessionSets(root).map((s) => [s.name, s]));
      assert.strictEqual(kindBadge(byName.get("001-work")!), "");
      assert.strictEqual(kindBadge(byName.get("002-plan")!), "plan");
      assert.strictEqual(kindBadge(byName.get("003-decomp")!), "decomposition");
      // Declared-but-unknown kind warned at scan time and degrades to an
      // ordinary work set — no badge, no refusal.
      assert.strictEqual(byName.get("004-bogus")!.kind, undefined);
      assert.strictEqual(kindBadge(byName.get("004-bogus")!), "");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

// The spec's Step-5 state matrix, at the payload layer: each module kind
// ships its buckets DIRECTLY (no child-state fields), and the rows the
// stub builds carry the right badge for every mix of kind/work sets.
suite("Set 100 S1 — state matrix: no sets / kind sets only / mixed; pseudo; fallback", () => {
  const rowFor = (set: SessionSet): RowPayload =>
    ({ slug: set.name, kindBadge: kindBadge(set) } as unknown as RowPayload);

  test("scan → payload matrix with kind badges in place", () => {
    const root = makeTmpDir("dabbler-kindmatrix-");
    try {
      writeManifest(root, ["greeter", "clock", "empty-module"]);
      // greeter: kind sets ONLY (the fresh-module shape Add-module scaffolds).
      writeSet(root, "001-greeter-plan", { module: "greeter", kind: "plan" });
      writeSet(root, "002-greeter-decomposition", {
        module: "greeter",
        kind: "decomposition",
      });
      // clock: MIXED — a lifecycle set beside ordinary work sets.
      writeSet(root, "003-clock-plan", { module: "clock", kind: "plan" });
      writeSet(root, "004-clock-work", { module: "clock" });
      // empty-module: declared, zero sets.
      // fallback: an undeclared stamp; pseudo: an unstamped work set.
      writeSet(root, "005-typo", { module: "not-in-manifest" });
      writeSet(root, "006-loose");

      const payloads = buildVisibleModulePayloads(
        computeVisibleModules(classifyModulesManifest(root), readSessionSets(root), {
          legacyRootPlanExists: false,
        }),
        rowFor,
      );
      const byTitle = new Map(payloads.map((p) => [p.title, p]));
      assert.deepStrictEqual(
        payloads.map((p) => p.title),
        ["greeter", "clock", "empty-module", "not-in-manifest", "Unassigned"],
      );

      const badges = (title: string): Array<[string, string]> =>
        byTitle
          .get(title)!
          .buckets.flatMap((b) => b.rows.map((r) => [r.slug, r.kindBadge] as [string, string]));

      // Kind sets only: both rows badged with their kind.
      assert.deepStrictEqual(badges("greeter"), [
        ["001-greeter-plan", "plan"],
        ["002-greeter-decomposition", "decomposition"],
      ]);
      // Mixed: the lifecycle row is badged, the work row is not.
      assert.deepStrictEqual(badges("clock"), [
        ["003-clock-plan", "plan"],
        ["004-clock-work", ""],
      ]);
      // No sets: the three default buckets ship empty (the landing zone).
      assert.deepStrictEqual(
        byTitle.get("empty-module")!.buckets.map((b) => [b.key, b.count]),
        [
          ["in-progress", 0],
          ["not-started", 0],
          ["complete", 0],
        ],
      );
      // Fallback and pseudo groups keep their rows, badge-less.
      assert.deepStrictEqual(badges("not-in-manifest"), [["005-typo", ""]]);
      assert.deepStrictEqual(badges("Unassigned"), [["006-loose", ""]]);
      // No payload carries the retired child-state fields.
      for (const p of payloads) {
        assert.ok(!("plan" in p) && !("sessionSets" in p), `${p.title}: retired field leaked`);
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

// The retired `blocked-until-plan` module state's signal now rides the
// scaffolded decomposition set's prerequisite blocked marker (Set 061
// machinery, pre-linked by Set 098's template).
suite("Set 100 S1 — prerequisite badge carries the plan gate", () => {
  test("a scaffolded decomposition set is blocked while its plan set is incomplete, and unblocks when it completes", () => {
    const root = makeTmpDir("dabbler-plangate-");
    try {
      writeManifest(root, ["greeter"]);
      const result = scaffoldModuleLifecycleSets(root, entry("greeter", "Greeter"));

      let byName = new Map(readSessionSets(root).map((s) => [s.name, s]));
      const decomp = byName.get(result.decompositionSlug)!;
      assert.strictEqual(decomp.kind, "decomposition");
      assert.strictEqual(decomp.blockedByPrereqs, true);
      assert.strictEqual(blockedMarker(decomp), BLOCKED_MARKER);
      // Exact-string pin: the UAT walk quotes this tooltip verbatim, so
      // the full wording is contractual, not just the slug substring.
      assert.strictEqual(
        blockedTooltip(decomp),
        `Blocked by prerequisites: ${result.planSlug} (not started) — all must complete first.`,
      );
      // The plan set itself is first in line — never blocked.
      const plan = byName.get(result.planSlug)!;
      assert.strictEqual(plan.kind, "plan");
      assert.strictEqual(blockedMarker(plan), "");

      // Completing the plan set clears the gate on the next scan.
      writeState(
        path.join(root, "docs", "session-sets", result.planSlug),
        "complete",
      );
      byName = new Map(readSessionSets(root).map((s) => [s.name, s]));
      const unblocked = byName.get(result.decompositionSlug)!;
      assert.strictEqual(unblocked.blockedByPrereqs, false);
      assert.strictEqual(blockedMarker(unblocked), "");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

// House pattern (the host class is not importable from the unit
// harness): pin the buildRow wiring by source scan.
suite("Set 100 S1 — host ships the kind badge on the row payload", () => {
  const extRoot = path.resolve(__dirname, "..", "..", "..");

  test("buildRow ships kindBadge/kindTooltip through the shared model functions", () => {
    const view = fs.readFileSync(
      path.join(extRoot, "src", "providers", "CustomSessionSetsView.ts"),
      "utf8",
    );
    assert.ok(view.includes("kindBadge: kindBadge(set)"));
    assert.ok(view.includes("kindTooltip: kindTooltip(set)"));
    // The retired 093 planExists resolution must not survive on the host.
    assert.ok(!view.includes("planExists"));
  });
});
