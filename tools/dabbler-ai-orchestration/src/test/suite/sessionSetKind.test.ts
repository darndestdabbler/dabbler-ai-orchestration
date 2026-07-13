// Set 098 Session 1 — the optional `kind: plan | decomposition` spec
// config field (module-lifecycle verdict decisions 5–6).
//
// Covers the spec's Step-5 parse matrix — absent / plan / decomposition
// / unknown value / malformed — at both layers:
//   - parseSessionSetConfig: RAW capture only (the `module` posture);
//     a scalar the stringRe shape cannot match reads as absent.
//   - readSessionSets: validation against the two-member enum with the
//     warn-and-degrade posture (Set 091) — an unknown value warns and
//     the row reads as an ordinary work set, never a refusal — plus the
//     round-trip assertion that `kind` surfaces on the SessionSet
//     object. No rendering change is asserted here: Set 100 owns
//     kind-aware rows.

import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  parseSessionSetConfig,
  readSessionSets,
} from "../../utils/fileSystem";

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-kind-test-"));
}

// Mirrors modulesManifest.test.ts::writeSet, with `kindLine` taking the
// place of the module line: a raw yaml line so malformed shapes can be
// injected verbatim.
function writeSet(
  root: string,
  name: string,
  opts: { kindLine?: string } = {},
): string {
  const dir = path.join(root, "docs", "session-sets", name);
  fs.mkdirSync(dir, { recursive: true });
  const kindLine = opts.kindLine ? `${opts.kindLine}\n` : "";
  fs.writeFileSync(
    path.join(dir, "spec.md"),
    `# ${name}\n\n## Session Set Configuration\n\`\`\`yaml\n` +
      `tier: full\nrequiresUAT: false\nrequiresE2E: false\n${kindLine}\`\`\`\n`,
  );
  fs.writeFileSync(
    path.join(dir, "session-state.json"),
    JSON.stringify({
      schemaVersion: 4,
      sessionSetName: name,
      status: "not-started",
      sessions: [
        {
          number: 1,
          title: "Session 1",
          status: "not-started",
          startedAt: null,
          completedAt: null,
          orchestrator: null,
          verificationVerdict: null,
        },
      ],
    }),
  );
  return dir;
}

suite("Set 098 — parseSessionSetConfig kind key", () => {
  test("absent kind reads as undefined (every pre-098 spec)", () => {
    const dir = makeTmpDir();
    const specPath = path.join(dir, "spec.md");
    try {
      fs.writeFileSync(
        specPath,
        "## Session Set Configuration\n```yaml\nrequiresUAT: false\n```",
      );
      assert.strictEqual(parseSessionSetConfig(specPath).kind, undefined);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  test("parses kind: plan and kind: decomposition", () => {
    const dir = makeTmpDir();
    const specPath = path.join(dir, "spec.md");
    try {
      fs.writeFileSync(
        specPath,
        "## Session Set Configuration\n```yaml\nkind: plan\n```",
      );
      assert.strictEqual(parseSessionSetConfig(specPath).kind, "plan");
      fs.writeFileSync(
        specPath,
        "## Session Set Configuration\n```yaml\nkind: decomposition\n```",
      );
      assert.strictEqual(
        parseSessionSetConfig(specPath).kind,
        "decomposition",
      );
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  test("accepts quoted values and trailing comments", () => {
    const dir = makeTmpDir();
    const specPath = path.join(dir, "spec.md");
    try {
      fs.writeFileSync(
        specPath,
        '## Session Set Configuration\n```yaml\nkind: "plan"  # lifecycle\n```',
      );
      assert.strictEqual(parseSessionSetConfig(specPath).kind, "plan");
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  test("unknown value is captured RAW (validation is the caller's job)", () => {
    const dir = makeTmpDir();
    const specPath = path.join(dir, "spec.md");
    try {
      fs.writeFileSync(
        specPath,
        "## Session Set Configuration\n```yaml\nkind: blueprint\n```",
      );
      assert.strictEqual(parseSessionSetConfig(specPath).kind, "blueprint");
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  test("malformed values the scalar shape cannot match read as absent", () => {
    const dir = makeTmpDir();
    const specPath = path.join(dir, "spec.md");
    try {
      // Flow list — not a scalar.
      fs.writeFileSync(
        specPath,
        "## Session Set Configuration\n```yaml\nkind: [plan, decomposition]\n```",
      );
      assert.strictEqual(parseSessionSetConfig(specPath).kind, undefined);
      // Empty value.
      fs.writeFileSync(
        specPath,
        "## Session Set Configuration\n```yaml\nkind:\n```",
      );
      assert.strictEqual(parseSessionSetConfig(specPath).kind, undefined);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });
});

suite("Set 098 — kind validation on readSessionSets", () => {
  test("kind: plan round-trips onto the SessionSet object", () => {
    const root = makeTmpDir();
    try {
      writeSet(root, "201-billing-plan", { kindLine: "kind: plan" });
      const sets = readSessionSets(root);
      assert.strictEqual(sets[0].kind, "plan");
      assert.strictEqual(sets[0].config.kind, "plan");
    } finally {
      fs.rmSync(root, { recursive: true });
    }
  });

  test("kind: decomposition round-trips onto the SessionSet object", () => {
    const root = makeTmpDir();
    try {
      writeSet(root, "202-billing-decomposition", {
        kindLine: "kind: decomposition",
      });
      const sets = readSessionSets(root);
      assert.strictEqual(sets[0].kind, "decomposition");
      assert.strictEqual(sets[0].config.kind, "decomposition");
    } finally {
      fs.rmSync(root, { recursive: true });
    }
  });

  test("absent kind stays undefined end-to-end (ordinary work set)", () => {
    const root = makeTmpDir();
    try {
      writeSet(root, "203-ordinary-work-set");
      const sets = readSessionSets(root);
      assert.strictEqual(sets[0].kind, undefined);
      assert.strictEqual(sets[0].config.kind, undefined);
    } finally {
      fs.rmSync(root, { recursive: true });
    }
  });

  test("unknown value warns and degrades to an ordinary work set, keeping the raw value", () => {
    const root = makeTmpDir();
    const origWarn = console.warn;
    const warnings: string[] = [];
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    };
    try {
      writeSet(root, "204-typo-kind", { kindLine: "kind: blueprint" });
      const sets = readSessionSets(root);
      assert.strictEqual(sets[0].kind, undefined, "degrades, never refuses");
      assert.strictEqual(
        sets[0].config.kind,
        "blueprint",
        "raw declared value survives for later diagnostic surfacing",
      );
      assert.strictEqual(
        warnings.filter((w) => w.includes("not a known set kind")).length,
        1,
        "exactly one warn for the unknown value",
      );
    } finally {
      console.warn = origWarn;
      fs.rmSync(root, { recursive: true });
    }
  });

  test("validation is case-tolerant, matching tier / verificationMode", () => {
    const root = makeTmpDir();
    try {
      writeSet(root, "205-case-kind", { kindLine: "kind: PLAN" });
      const sets = readSessionSets(root);
      assert.strictEqual(sets[0].kind, "plan");
      assert.strictEqual(sets[0].config.kind, "PLAN", "raw stays as authored");
    } finally {
      fs.rmSync(root, { recursive: true });
    }
  });

  test("malformed value reads as absent: no kind, no warning", () => {
    const root = makeTmpDir();
    const origWarn = console.warn;
    const warnings: string[] = [];
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    };
    try {
      writeSet(root, "206-malformed-kind", {
        kindLine: "kind: [plan, decomposition]",
      });
      const sets = readSessionSets(root);
      assert.strictEqual(sets[0].kind, undefined);
      assert.strictEqual(sets[0].config.kind, undefined);
      assert.strictEqual(
        warnings.filter((w) => w.includes("not a known set kind")).length,
        0,
        "an unmatchable shape is absent, not unknown — no warn",
      );
    } finally {
      console.warn = origWarn;
      fs.rmSync(root, { recursive: true });
    }
  });
});
