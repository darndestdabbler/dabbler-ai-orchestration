// Set 060 Session 1 — unit tests for the pure Getting Started
// completion-detection model (spec D3) and the dual-mode Explorer
// switch (D1/D5). The detection core takes an injected filesystem, so
// these tests drive it with an in-memory fake — no real directory tree,
// no VS Code host.
//
// Set 094: the form shrank to two sections. `detectCompletion` reports a
// single `structureBuilt` flag (the old plan / session-set steps retired),
// and `computeGettingStarted` no longer carries the environment probes
// (provider key / Python / Copilot CLI) — the System Status strip computes
// those independently — so the payload is `{ mode, structureBuilt, tierSeed,
// rootId, verificationModeSeed, transportProfileSeed }`.

import * as assert from "assert";
import * as path from "path";
import {
  DetectionFs,
  computeGettingStarted,
  detectCompletion,
  providerKeyPresent,
  selectExplorerMode,
} from "../../utils/gettingStartedDetection";

// ---- In-memory fake DetectionFs ----
//
// Backed by a set of absolute path strings. A path is a "directory" if
// any other recorded path is nested under it OR it is explicitly marked
// as a dir (recorded with a trailing-slash marker stripped). To keep
// the fixtures readable we record every file path and every directory
// path we care about; `dirs` is the explicit directory set.
class FakeFs implements DetectionFs {
  private files = new Set<string>();
  private dirs = new Set<string>();

  addFile(p: string): this {
    const n = path.normalize(p);
    this.files.add(n);
    // Register ancestor directories.
    let parent = path.dirname(n);
    while (parent && parent !== path.dirname(parent)) {
      this.dirs.add(parent);
      parent = path.dirname(parent);
    }
    return this;
  }

  addDir(p: string): this {
    const n = path.normalize(p);
    this.dirs.add(n);
    let parent = path.dirname(n);
    while (parent && parent !== path.dirname(parent)) {
      this.dirs.add(parent);
      parent = path.dirname(parent);
    }
    return this;
  }

  exists(p: string): boolean {
    const n = path.normalize(p);
    return this.files.has(n) || this.dirs.has(n);
  }

  isDirectory(p: string): boolean {
    return this.dirs.has(path.normalize(p));
  }

  readdir(p: string): string[] {
    const n = path.normalize(p);
    if (!this.dirs.has(n)) return [];
    const names = new Set<string>();
    for (const f of [...this.files, ...this.dirs]) {
      if (path.dirname(f) === n) names.add(path.basename(f));
    }
    return [...names];
  }
}

const ROOT = path.normalize("/repo");

// Build a fully-scaffolded Full-tier repo (Windows venv layout).
function fullyScaffolded(): FakeFs {
  return new FakeFs()
    .addDir(path.join(ROOT, ".venv", "Lib", "site-packages", "ai_router"))
    .addFile(path.join(ROOT, "CLAUDE.md"))
    .addFile(path.join(ROOT, "AGENTS.md"))
    .addFile(path.join(ROOT, "GEMINI.md"));
}

// The two-section-form payload shape (Set 094): every field except the two
// under test defaults to its quiet value, so a test overrides only what it
// asserts.
function payload(over: Partial<ReturnType<typeof computeGettingStarted>> = {}) {
  return {
    mode: "getting-started",
    structureBuilt: false,
    tierSeed: null,
    rootId: null,
    verificationModeSeed: null,
    transportProfileSeed: null,
    ...over,
  };
}

suite("gettingStartedDetection — detectCompletion (Set 060 S1, D3; Set 094 shrink)", () => {
  test("empty root → structureBuilt false", () => {
    assert.deepStrictEqual(detectCompletion(ROOT, new FakeFs()), {
      structureBuilt: false,
    });
  });

  test("fully scaffolded → structureBuilt true", () => {
    assert.deepStrictEqual(detectCompletion(ROOT, fullyScaffolded()), {
      structureBuilt: true,
    });
  });

  test("structureBuilt requires .venv AND router AND all three engine files", () => {
    // .venv + router present, but missing GEMINI.md → not built.
    const noGemini = new FakeFs()
      .addDir(path.join(ROOT, ".venv", "Lib", "site-packages", "ai_router"))
      .addFile(path.join(ROOT, "CLAUDE.md"))
      .addFile(path.join(ROOT, "AGENTS.md"));
    assert.strictEqual(detectCompletion(ROOT, noGemini).structureBuilt, false);

    // engine files present, .venv missing → not built.
    const noVenv = new FakeFs()
      .addFile(path.join(ROOT, "CLAUDE.md"))
      .addFile(path.join(ROOT, "AGENTS.md"))
      .addFile(path.join(ROOT, "GEMINI.md"));
    assert.strictEqual(detectCompletion(ROOT, noVenv).structureBuilt, false);

    // .venv exists but router not installed (no ai_router pkg) → not built.
    const noRouter = new FakeFs()
      .addDir(path.join(ROOT, ".venv", "Lib", "site-packages", "pyyaml"))
      .addFile(path.join(ROOT, "CLAUDE.md"))
      .addFile(path.join(ROOT, "AGENTS.md"))
      .addFile(path.join(ROOT, "GEMINI.md"));
    assert.strictEqual(detectCompletion(ROOT, noRouter).structureBuilt, false);
  });

  test("router importable proxy honors POSIX venv layout (.venv/lib/pythonX.Y/site-packages)", () => {
    const posix = new FakeFs()
      .addDir(path.join(ROOT, ".venv", "lib", "python3.12", "site-packages", "ai_router"))
      .addFile(path.join(ROOT, "CLAUDE.md"))
      .addFile(path.join(ROOT, "AGENTS.md"))
      .addFile(path.join(ROOT, "GEMINI.md"));
    assert.strictEqual(detectCompletion(ROOT, posix).structureBuilt, true);
  });

  test("S1 verifier Issue 2: a DIRECTORY named like an engine file does NOT green structureBuilt", () => {
    // A directory named CLAUDE.md (with the other two as real files +
    // venv/router present) must NOT green the Build section.
    const engineDir = new FakeFs()
      .addDir(path.join(ROOT, ".venv", "Lib", "site-packages", "ai_router"))
      .addDir(path.join(ROOT, "CLAUDE.md")) // directory, not a file
      .addFile(path.join(ROOT, "AGENTS.md"))
      .addFile(path.join(ROOT, "GEMINI.md"));
    assert.strictEqual(detectCompletion(ROOT, engineDir).structureBuilt, false);
  });
});

suite("gettingStartedDetection — selectExplorerMode (Set 060 S1, D1/D5)", () => {
  test("no folder open → no-folder (regardless of sets)", () => {
    assert.strictEqual(selectExplorerMode(false, false), "no-folder");
    assert.strictEqual(selectExplorerMode(false, true), "no-folder");
  });

  test("folder open, no sets → getting-started", () => {
    assert.strictEqual(selectExplorerMode(true, false), "getting-started");
  });

  test("folder open, ≥1 set → list", () => {
    assert.strictEqual(selectExplorerMode(true, true), "list");
  });
});

suite("gettingStartedDetection — computeGettingStarted (Set 094 payload)", () => {
  test("no folder → no-folder mode, no probe (structureBuilt false even if root would qualify)", () => {
    // Pass a fully-scaffolded fs + root, but hasFolder=false: the probe
    // must NOT run, and the flag reports false.
    const p = computeGettingStarted(false, ROOT, false, fullyScaffolded());
    assert.deepStrictEqual(p, payload({ mode: "no-folder" }));
  });

  test("list mode (sets exist) → no probe, structureBuilt false", () => {
    const p = computeGettingStarted(true, ROOT, true, fullyScaffolded());
    assert.deepStrictEqual(p, payload({ mode: "list" }));
  });

  test("getting-started mode → probe runs, structureBuilt reflects the root, rootId ships", () => {
    const p = computeGettingStarted(true, ROOT, false, fullyScaffolded());
    assert.deepStrictEqual(
      p,
      payload({ mode: "getting-started", structureBuilt: true, rootId: ROOT }),
    );
  });

  test("getting-started mode with an empty root → structureBuilt false, rootId still ships", () => {
    const p = computeGettingStarted(true, ROOT, false, new FakeFs());
    assert.deepStrictEqual(
      p,
      payload({ mode: "getting-started", rootId: ROOT }),
    );
  });

  test("getting-started mode but undefined root → no probe, rootId null", () => {
    const p = computeGettingStarted(true, undefined, false, fullyScaffolded());
    assert.deepStrictEqual(p, payload({ mode: "getting-started" }));
  });
});

suite("gettingStartedDetection — providerKeyPresent (Set 060 S3, D6)", () => {
  // The predicate is retained (buildSystemStatus + the scaffold seat-setup
  // consume it) even though the two-section form payload no longer carries
  // its result.
  test("empty env → false", () => {
    assert.strictEqual(providerKeyPresent({}), false);
  });

  test("any ONE provider key satisfies the predicate", () => {
    assert.strictEqual(providerKeyPresent({ DABBLER_ANTHROPIC_API_KEY: "sk-a" }), true);
    assert.strictEqual(providerKeyPresent({ DABBLER_OPENAI_API_KEY: "sk-o" }), true);
    assert.strictEqual(providerKeyPresent({ DABBLER_GEMINI_API_KEY: "g-key" }), true);
  });

  test("empty / whitespace-only values count as absent (cannot authenticate)", () => {
    assert.strictEqual(providerKeyPresent({ DABBLER_ANTHROPIC_API_KEY: "" }), false);
    assert.strictEqual(providerKeyPresent({ DABBLER_OPENAI_API_KEY: "   " }), false);
    assert.strictEqual(
      providerKeyPresent({ DABBLER_GEMINI_API_KEY: undefined as unknown as string }),
      false,
    );
  });

  test("non-provider variables are ignored", () => {
    assert.strictEqual(
      providerKeyPresent({ PATH: "/usr/bin", PUSHOVER_API_KEY: "p" }),
      false,
    );
  });

  test("a real key alongside blanks still satisfies", () => {
    assert.strictEqual(
      providerKeyPresent({ DABBLER_ANTHROPIC_API_KEY: " ", DABBLER_OPENAI_API_KEY: "sk-o" }),
      true,
    );
  });
});

// Set 077 Session 2 (Feature 1, A1): the durable tier seed rides the
// payload so the webview can re-seed the form's tier radio after a
// teardown. The resolver is a thunk gated on getting-started mode —
// the one mode that renders the form — so list/no-folder snapshots
// never pay the marker probe.
suite("gettingStartedDetection — tierSeed (Set 077 S2)", () => {
  test("getting-started mode calls the resolver and carries its value", () => {
    const calls: string[] = [];
    const p = computeGettingStarted(true, ROOT, false, new FakeFs(), (root) => {
      calls.push(root);
      return "lightweight";
    });
    assert.strictEqual(p.tierSeed, "lightweight");
    assert.deepStrictEqual(calls, [ROOT]);
  });

  test("resolver returning null carries null (rootId still rides)", () => {
    const p = computeGettingStarted(true, ROOT, false, new FakeFs(), () => null);
    assert.strictEqual(p.tierSeed, null);
    // S077-S2-V1-001: the root identity ships whenever the form renders,
    // so the webview can scope its persisted state per root.
    assert.strictEqual(p.rootId, ROOT);
  });

  test("list mode never calls the resolver", () => {
    let called = false;
    const p = computeGettingStarted(true, ROOT, true, new FakeFs(), () => {
      called = true;
      return "full";
    });
    assert.strictEqual(called, false);
    assert.strictEqual(p.tierSeed, null);
  });

  test("no-folder mode never calls the resolver", () => {
    let called = false;
    const p = computeGettingStarted(false, ROOT, false, new FakeFs(), () => {
      called = true;
      return "full";
    });
    assert.strictEqual(called, false);
    assert.strictEqual(p.tierSeed, null);
  });

  test("resolver omitted (legacy callers) yields null", () => {
    const p = computeGettingStarted(true, ROOT, false, new FakeFs());
    assert.strictEqual(p.tierSeed, null);
  });
});

// Set 077 S3 / Set 079 — the verification-mode + seat-profile seed thunks:
// getting-started-mode-gated, null everywhere else. (Set 094: the
// Python-presence + Copilot-CLI probes these suites used to also exercise
// left computeGettingStarted; the System Status strip owns them now.)
suite("computeGettingStarted — seed thunks (verificationMode + transportProfile)", () => {
  function countingThunks() {
    const calls = { modeSeed: 0, profileSeed: 0 };
    return {
      calls,
      modeSeed: () => {
        calls.modeSeed++;
        return "dedicated-sessions" as const;
      },
      profileSeed: () => {
        calls.profileSeed++;
        return "copilot-cli" as const;
      },
    };
  }

  test("getting-started mode: both seeds run and flow through", () => {
    const t = countingThunks();
    const p = computeGettingStarted(
      true,
      ROOT,
      false,
      fullyScaffolded(),
      () => "lightweight",
      t.modeSeed,
      t.profileSeed,
    );
    assert.strictEqual(p.mode, "getting-started");
    assert.strictEqual(t.calls.modeSeed, 1);
    assert.strictEqual(t.calls.profileSeed, 1);
    assert.strictEqual(p.verificationModeSeed, "dedicated-sessions");
    assert.strictEqual(p.transportProfileSeed, "copilot-cli");
  });

  test("list mode: seed thunks never run; nulls ship", () => {
    const t = countingThunks();
    const p = computeGettingStarted(
      true,
      ROOT,
      true,
      fullyScaffolded(),
      () => "lightweight",
      t.modeSeed,
      t.profileSeed,
    );
    assert.strictEqual(p.mode, "list");
    assert.strictEqual(t.calls.modeSeed, 0);
    assert.strictEqual(t.calls.profileSeed, 0);
    assert.strictEqual(p.verificationModeSeed, null);
    assert.strictEqual(p.transportProfileSeed, null);
  });

  test("no-folder mode: seed thunks never run; nulls ship", () => {
    const t = countingThunks();
    const p = computeGettingStarted(
      false,
      undefined,
      false,
      fullyScaffolded(),
      () => "lightweight",
      t.modeSeed,
      t.profileSeed,
    );
    assert.strictEqual(p.mode, "no-folder");
    assert.strictEqual(t.calls.modeSeed, 0);
    assert.strictEqual(t.calls.profileSeed, 0);
    assert.strictEqual(p.verificationModeSeed, null);
    assert.strictEqual(p.transportProfileSeed, null);
  });

  test("omitted thunks yield null in getting-started mode", () => {
    const p = computeGettingStarted(true, ROOT, false, fullyScaffolded());
    assert.strictEqual(p.mode, "getting-started");
    assert.strictEqual(p.verificationModeSeed, null);
    assert.strictEqual(p.transportProfileSeed, null);
  });

  test("regression: the tier seed still applies alongside the other seeds", () => {
    const p = computeGettingStarted(
      true,
      ROOT,
      false,
      fullyScaffolded(),
      () => "lightweight",
      () => "dedicated-sessions",
      () => "copilot-cli",
    );
    assert.strictEqual(p.tierSeed, "lightweight");
    assert.strictEqual(p.verificationModeSeed, "dedicated-sessions");
    assert.strictEqual(p.transportProfileSeed, "copilot-cli");
  });
});
