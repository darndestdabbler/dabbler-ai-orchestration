// Set 108 Session 1, step 5: confirm the nine-module POC's four findings
// against the RUNNING PRODUCT, not just the model functions.
//
// The pre-set POC (`poc-nine-modules.ts`) fabricated `SessionSet` objects in
// memory and fed them to `computeVisibleModules`. That proves the grouping
// maths but skips everything a real team actually exercises: a `modules.yaml`
// the product parses itself, session-set directories the product discovers
// itself, and the payload the shipping webview host hands the renderer.
//
// This POC writes a real nine-module workspace to a temp directory and drives
// the whole shipping chain:
//
//   docs/modules.yaml on disk
//     -> classifyModulesManifest()   (the product's own parser)
//     -> readSessionSets()           (the product's own discovery)
//     -> computeVisibleModules()     (the product's own grouping)
//     -> buildVisibleModulePayloads() (what the renderer is handed since 092)
//
// Run:
//   npx mocha --require ts-node/register --require ./src/test/vscode-stub.js \
//             --ui tdd --timeout 120000 src/test/poc-nine-modules-ondisk.ts

import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  buildVisibleModulePayloads,
  computeVisibleModules,
} from "../providers/SessionSetsModel";
import { classifyModulesManifest } from "../utils/moduleAuthoring";
import { readSessionSets } from "../utils/fileSystem";
import { SessionSet } from "../types";

const MEMBERS = ["priya", "sam", "chen"];
const SERVICES = ["converter", "persistence", "watcher"];

/**
 * The two naming schemes S1 has to choose between, both expressed as a real
 * manifest. `version` is the pre-set POC's recommendation (slug carries a
 * version number); `person` puts the owner in the slug instead.
 */
type Scheme = "version" | "person";

interface Declared {
  slug: string;
  title: string;
  codeRoot: string;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Member-major, which is the ordering finding 3 says keeps people contiguous. */
function declare(scheme: Scheme): Declared[] {
  const out: Declared[] = [];
  MEMBERS.forEach((member, i) => {
    for (const service of SERVICES) {
      const v = i + 1;
      out.push(
        scheme === "version"
          ? {
              slug: `${service}-v${v}`,
              title: `${cap(service)} v${v} — ${cap(member)}`,
              codeRoot: `modules/${member}/${service}`,
            }
          : {
              slug: `${service}-${member}`,
              title: `${cap(service)} (${cap(member)})`,
              codeRoot: `modules/${member}/${service}`,
            },
      );
    }
  });
  return out;
}

function writeManifest(root: string, declared: readonly Declared[]): void {
  const lines = ["modules:"];
  for (const d of declared) {
    lines.push(`  - slug: ${d.slug}`);
    lines.push(`    title: ${d.title}`);
    lines.push(`    codeRoots: [${d.codeRoot}]`);
    lines.push(`    planPath: docs/modules/${d.slug}/project-plan.md`);
  }
  const abs = path.join(root, "docs", "modules.yaml");
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, lines.join("\n") + "\n", { encoding: "utf8" });
}

function writeSet(root: string, name: string, moduleSlug: string): void {
  const dir = path.join(root, "docs", "session-sets", name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "spec.md"),
    [
      `# ${name}`,
      "",
      "## Session Set Configuration",
      "",
      "```yaml",
      "tier: full",
      "requiresUAT: false",
      "requiresE2E: false",
      `module: ${moduleSlug}`,
      "```",
      "",
    ].join("\n"),
    { encoding: "utf8" },
  );
}

function makeWorkspace(scheme: Scheme, withSets: boolean): { root: string; declared: Declared[] } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `dabbler-108-${scheme}-`));
  const declared = declare(scheme);
  writeManifest(root, declared);
  if (withSets) {
    // The smallest realistic load per module: the two scaffolded lifecycle
    // sets plus one work set. A floor on the row count, not a worst case.
    for (const d of declared) {
      for (const suffix of ["plan", "decomposition", "build"]) {
        writeSet(root, `${d.slug}-${suffix}`, d.slug);
      }
    }
  }
  return { root, declared };
}

function renderPayloads(root: string) {
  const classification = classifyModulesManifest(root);
  const sets = readSessionSets(root);
  const modules = computeVisibleModules(classification, sets, {
    legacyRootPlanExists: false,
  });
  const payloads = buildVisibleModulePayloads(modules, (s: SessionSet) => ({
    name: s.name,
  }) as never);
  return { classification, sets, modules, payloads };
}

suite("Set 108 S1 — nine modules through the shipping render path, on disk", () => {
  const created: string[] = [];

  suiteTeardown(() => {
    for (const root of created) {
      try {
        fs.rmSync(root, { recursive: true, force: true });
      } catch {
        /* a temp dir that outlives the run is not a test failure */
      }
    }
  });

  test("finding 1 — the product parses its own manifest and renders nine declared rows", () => {
    const { root } = makeWorkspace("version", true);
    created.push(root);
    const { classification, sets, modules, payloads } = renderPayloads(root);

    assert.strictEqual(classification.kind, "present", "the product must parse the manifest it was given");
    assert.strictEqual(sets.length, 27, "the product should discover all 27 session-set directories itself");
    assert.strictEqual(modules.length, 9, "nine module groups");
    assert.ok(modules.every((m) => m.kind === "declared"), "none may fall back");
    assert.ok(modules.every((m) => m.warning === null), "none may carry a warning");
    assert.strictEqual(payloads.length, 9, "the renderer is handed nine module payloads");
    assert.ok(
      payloads.every((p) => p.buckets.reduce((n, b) => n + b.rows.length, 0) === 3),
      "each module payload carries its three sets",
    );

    console.log("\n" + "=".repeat(72));
    console.log("RUNNING PRODUCT — nine modules, real manifest, real set discovery");
    console.log("=".repeat(72));
    for (const p of payloads) {
      const rows = p.buckets.reduce((n, b) => n + b.rows.length, 0);
      console.log(`▾ ${p.title}   [${p.kind}]  slug=${p.slug}  ${rows} sets`);
    }
    console.log(`\n-- 9 top-level rows collapsed --`);
  });

  test("finding 2 — grouping is exactly one level deep; there is no per-member tier", () => {
    const { root } = makeWorkspace("version", true);
    created.push(root);
    const { payloads } = renderPayloads(root);

    // A module payload's only children are status buckets, and a bucket's only
    // children are rows. If a per-member sub-tree were possible, a payload
    // would have to be able to contain another payload. It cannot.
    for (const p of payloads) {
      assert.ok(Array.isArray(p.buckets), "a module's children are buckets");
      for (const b of p.buckets) {
        assert.ok(Array.isArray(b.rows), "a bucket's children are rows");
        for (const r of b.rows as unknown[]) {
          assert.ok(
            !(r as { buckets?: unknown }).buckets,
            "a row must not itself contain module buckets — that would be a second tier",
          );
        }
      }
    }
    assert.strictEqual(
      payloads.filter((p) => MEMBERS.some((m) => p.slug === m)).length,
      0,
      "no member appears as a module group of its own",
    );
  });

  test("finding 3 — manifest order wins over alphabetical, so members stay contiguous", () => {
    const { root, declared } = makeWorkspace("person", true);
    created.push(root);
    const { payloads } = renderPayloads(root);

    assert.deepStrictEqual(
      payloads.map((p) => p.slug),
      declared.map((d) => d.slug),
      "render order must follow the manifest",
    );

    const alphabetical = [...declared.map((d) => d.slug)].sort();
    assert.notDeepStrictEqual(
      payloads.map((p) => p.slug),
      alphabetical,
      "the fixture must actually distinguish manifest order from alphabetical, " +
        "or this assertion proves nothing",
    );

    // Each member's three modules occupy one contiguous run.
    for (const member of MEMBERS) {
      const positions = payloads
        .map((p, i) => ({ i, mine: p.slug.endsWith(`-${member}`) }))
        .filter((x) => x.mine)
        .map((x) => x.i);
      assert.strictEqual(positions.length, 3, `${member} owns three modules`);
      assert.strictEqual(
        positions[2] - positions[0],
        2,
        `${member}'s three modules must be contiguous, got ${JSON.stringify(positions)}`,
      );
    }
  });

  test("finding 4 — day one: nine declared modules, zero sets, no warnings", () => {
    const { root } = makeWorkspace("version", false);
    created.push(root);
    const { sets, modules, payloads } = renderPayloads(root);

    assert.strictEqual(sets.length, 0, "no session sets exist yet");
    assert.strictEqual(modules.length, 9, "all nine still render");
    assert.ok(modules.every((m) => m.sets.length === 0));
    assert.ok(modules.every((m) => m.warning === null), "empty is a healthy state");
    assert.ok(
      payloads.every((p) => p.buckets.every((b) => b.rows.length === 0)),
      "every bucket is empty, and that is fine",
    );

    console.log("\n" + "=".repeat(72));
    console.log("RUNNING PRODUCT — day one, manifest written, nobody has started");
    console.log("=".repeat(72));
    for (const p of payloads) console.log(`▾ ${p.title}   [${p.kind}]  0 sets`);
  });

  test("naming — a per-member slug collides under the version scheme only if versions repeat", () => {
    // The routed step-3.5 analyst claimed `converter-v1` collides across
    // members. It does not, PROVIDED each member draws a distinct version
    // number — which is itself the cost of that scheme. Both facts are load-
    // bearing for S1's ruling, so both are pinned here.
    const versionSlugs = declare("version").map((d) => d.slug);
    assert.strictEqual(new Set(versionSlugs).size, 9, "distinct versions keep slugs unique");

    const personSlugs = declare("person").map((d) => d.slug);
    assert.strictEqual(new Set(personSlugs).size, 9, "owner-in-slug is unique with no allocation");

    // The failure the analyst actually described: everybody picks v1.
    const everyoneIsV1 = MEMBERS.flatMap(() => SERVICES.map((s) => `${s}-v1`));
    assert.strictEqual(
      new Set(everyoneIsV1).size,
      3,
      "if members do not coordinate version numbers, nine declarations collapse to three slugs",
    );
  });
});
