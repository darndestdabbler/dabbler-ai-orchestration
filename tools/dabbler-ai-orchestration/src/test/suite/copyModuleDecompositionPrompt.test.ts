// Set 094 Session 2 (spec D6 / verdict amendment 8) — the module-decomposition
// copy-prompt flow. Exercises the FOURTH ensure-write site (create-if-absent,
// skip-existing, never-overwrite-invalid) against real temp roots, the
// pointer-style prompt content + invariants, the plan-present/absent no-dangle
// gating, and the ensure-before-copy ordering (a failed clipboard still leaves
// the manifest created, and no-workspace copies nothing).

import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  CopyModuleDecompositionPromptUi,
  buildModuleDecompositionPrompt,
  runCopyModuleDecompositionPromptFlow,
} from "../../commands/copyModuleDecompositionPrompt";
import { MODULES_YAML_TEMPLATE } from "../../utils/moduleAuthoring";

function tmpRoot(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function manifestAbs(root: string): string {
  return path.join(root, "docs", "modules.yaml");
}

function writePlan(root: string): void {
  const planAbs = path.join(root, "docs", "planning", "project-plan.md");
  fs.mkdirSync(path.dirname(planAbs), { recursive: true });
  fs.writeFileSync(planAbs, "# Project plan\n", "utf8");
}

interface UiLog {
  infos: string[];
  errors: string[];
  copied: string[];
}

function makeUi(
  root: string | undefined,
  log: UiLog,
  over: Partial<CopyModuleDecompositionPromptUi> = {},
): CopyModuleDecompositionPromptUi {
  return {
    workspaceRoot: () => root,
    fileExists: (abs) => fs.existsSync(abs),
    copyToClipboard: async (text) => void log.copied.push(text),
    showInformationMessage: (m) => void log.infos.push(m),
    showErrorMessage: (m) => void log.errors.push(m),
    ...over,
  };
}

function freshLog(): UiLog {
  return { infos: [], errors: [], copied: [] };
}

// ---------- the pure builder ----------

suite("buildModuleDecompositionPrompt (Set 094 S2, D6)", () => {
  test("states the hard invariants (globally-unique names; module = grouping)", () => {
    const p = buildModuleDecompositionPrompt(true);
    assert.ok(/globally unique/i.test(p), "names globally unique");
    assert.ok(/grouping attribute, never/i.test(p), "module is grouping, not identity");
    // The manifest fields the AI must emit.
    for (const field of ["slug", "title", "codeRoots", "planPath", "touches"]) {
      assert.ok(p.includes(field), `mentions ${field}`);
    }
  });

  test("is pointer-style — references docs/modules.yaml, never embeds template contents", () => {
    const p = buildModuleDecompositionPrompt(true);
    assert.ok(p.includes("docs/modules.yaml"), "references the manifest path");
    // It must NOT paste the whole canonical template body in.
    assert.ok(
      !p.includes("# docs/modules.yaml — the module manifest"),
      "does not embed the template header block",
    );
  });

  test("plan-present references the project plan path", () => {
    const p = buildModuleDecompositionPrompt(true);
    assert.ok(p.includes("docs/planning/project-plan.md"));
    assert.ok(/read that file/i.test(p));
  });

  test("plan-absent does NOT dangle a missing-plan pointer", () => {
    const p = buildModuleDecompositionPrompt(false);
    // Still names the path (to say it is absent), but never instructs a read
    // of a file that does not exist.
    assert.ok(/there is no[\s\S]*yet/i.test(p), "states the plan is absent");
    assert.ok(p.includes("project-plan.md"), "names the absent plan path");
    assert.ok(!/read that file/i.test(p), "no read instruction for an absent plan");
  });
});

// ---------- the flow (ensure-write + copy) ----------

suite("runCopyModuleDecompositionPromptFlow (Set 094 S2, D6)", () => {
  test("absent manifest: creates it from the canonical template (4th ensure-write site), copies the prompt", async () => {
    const root = tmpRoot("d6-absent-");
    const log = freshLog();
    try {
      const ok = await runCopyModuleDecompositionPromptFlow(makeUi(root, log));
      assert.strictEqual(ok, true);
      assert.strictEqual(
        fs.readFileSync(manifestAbs(root), "utf8"),
        MODULES_YAML_TEMPLATE,
        "created from the canonical template",
      );
      assert.strictEqual(log.copied.length, 1, "one prompt copied");
      assert.ok(log.copied[0].includes("docs/modules.yaml"), "the copied prompt points at the just-ensured manifest");
      assert.strictEqual(log.infos.length, 1);
      assert.ok(log.infos[0].includes("Created"), "created wording");
      assert.ok(/SAVE/.test(log.infos[0]));
      assert.strictEqual(log.errors.length, 0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("present (valid) manifest: never overwrites, copies the prompt, NO created wording", async () => {
    const root = tmpRoot("d6-present-");
    const log = freshLog();
    const existing = "modules:\n  - slug: greeter\n    title: Greeter\n";
    try {
      fs.mkdirSync(path.join(root, "docs"), { recursive: true });
      fs.writeFileSync(manifestAbs(root), existing, "utf8");
      const ok = await runCopyModuleDecompositionPromptFlow(makeUi(root, log));
      assert.strictEqual(ok, true);
      assert.strictEqual(
        fs.readFileSync(manifestAbs(root), "utf8"),
        existing,
        "an existing manifest is never overwritten",
      );
      assert.strictEqual(log.copied.length, 1);
      assert.strictEqual(log.infos.length, 1);
      assert.ok(!log.infos[0].includes("Created"), "no created wording for an existing file");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("present (INVALID) manifest: left untouched (guardrails own it), still copies the prompt", async () => {
    const root = tmpRoot("d6-invalid-");
    const log = freshLog();
    const broken = "not a manifest at all\n";
    try {
      fs.mkdirSync(path.join(root, "docs"), { recursive: true });
      fs.writeFileSync(manifestAbs(root), broken, "utf8");
      const ok = await runCopyModuleDecompositionPromptFlow(makeUi(root, log));
      assert.strictEqual(ok, true);
      assert.strictEqual(
        fs.readFileSync(manifestAbs(root), "utf8"),
        broken,
        "an invalid manifest is never auto-overwritten",
      );
      assert.strictEqual(log.copied.length, 1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("plan present in the workspace → the copied prompt references the plan", async () => {
    const root = tmpRoot("d6-plan-");
    const log = freshLog();
    try {
      writePlan(root);
      await runCopyModuleDecompositionPromptFlow(makeUi(root, log));
      assert.ok(log.copied[0].includes("docs/planning/project-plan.md"));
      assert.ok(/read that file/i.test(log.copied[0]));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("no workspace folder → error, returns false, copies nothing, writes nothing", async () => {
    const log = freshLog();
    const ok = await runCopyModuleDecompositionPromptFlow(makeUi(undefined, log));
    assert.strictEqual(ok, false);
    assert.strictEqual(log.errors.length, 1);
    assert.strictEqual(log.copied.length, 0);
  });

  test("ensure runs BEFORE copy: a clipboard failure still leaves the manifest created", async () => {
    const root = tmpRoot("d6-copyfail-");
    const log = freshLog();
    try {
      const ok = await runCopyModuleDecompositionPromptFlow(
        makeUi(root, log, {
          copyToClipboard: async () => {
            throw new Error("clipboard denied");
          },
        }),
      );
      assert.strictEqual(ok, false);
      assert.strictEqual(log.errors.length, 1);
      assert.ok(log.errors[0].includes("Failed to copy"));
      // The ensure ran first — the manifest exists even though the copy failed.
      assert.ok(fs.existsSync(manifestAbs(root)), "ensure ran before the copy");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
