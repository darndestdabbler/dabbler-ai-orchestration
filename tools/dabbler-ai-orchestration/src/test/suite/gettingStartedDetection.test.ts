// Set 060 Session 1 — unit tests for the pure Getting Started
// completion-detection model (spec D3) and the dual-mode Explorer
// switch (D1/D5). The detection core takes an injected filesystem, so
// these tests drive it with an in-memory fake — no real directory tree,
// no VS Code host.

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
    .addFile(path.join(ROOT, "GEMINI.md"))
    .addFile(path.join(ROOT, "docs", "planning", "project-plan.md"))
    .addDir(path.join(ROOT, "docs", "session-sets", "001-first-set"));
}

suite("gettingStartedDetection — detectCompletion (Set 060 S1, D3)", () => {
  test("empty root → all flags false", () => {
    const r = detectCompletion(ROOT, new FakeFs());
    assert.deepStrictEqual(r, {
      structureBuilt: false,
      planPresent: false,
      sessionSetsPresent: false,
    });
  });

  test("fully scaffolded → all flags true", () => {
    const r = detectCompletion(ROOT, fullyScaffolded());
    assert.deepStrictEqual(r, {
      structureBuilt: true,
      planPresent: true,
      sessionSetsPresent: true,
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

  test("planPresent keys exactly on docs/planning/project-plan.md", () => {
    const fs = new FakeFs().addFile(path.join(ROOT, "docs", "planning", "project-plan.md"));
    assert.strictEqual(detectCompletion(ROOT, fs).planPresent, true);

    // A differently-named plan does NOT satisfy the step.
    const wrong = new FakeFs().addFile(path.join(ROOT, "docs", "planning", "plan.md"));
    assert.strictEqual(detectCompletion(ROOT, wrong).planPresent, false);
  });

  test("S1 verifier Issue 2: a DIRECTORY named like a file does NOT satisfy a step", () => {
    // A directory named project-plan.md must NOT green step 2.
    const planDir = new FakeFs().addDir(
      path.join(ROOT, "docs", "planning", "project-plan.md"),
    );
    assert.strictEqual(detectCompletion(ROOT, planDir).planPresent, false);

    // A directory named CLAUDE.md (with the other two as real files +
    // venv/router present) must NOT green step 1.
    const engineDir = new FakeFs()
      .addDir(path.join(ROOT, ".venv", "Lib", "site-packages", "ai_router"))
      .addDir(path.join(ROOT, "CLAUDE.md")) // directory, not a file
      .addFile(path.join(ROOT, "AGENTS.md"))
      .addFile(path.join(ROOT, "GEMINI.md"));
    assert.strictEqual(detectCompletion(ROOT, engineDir).structureBuilt, false);
  });

  test("sessionSetsPresent requires a NNN- prefixed directory", () => {
    // A non-numbered session-set dir does NOT count.
    const bare = new FakeFs().addDir(path.join(ROOT, "docs", "session-sets", "my-set"));
    assert.strictEqual(detectCompletion(ROOT, bare).sessionSetsPresent, false);

    // A NNN- prefixed dir counts.
    const numbered = new FakeFs().addDir(path.join(ROOT, "docs", "session-sets", "060-redesign"));
    assert.strictEqual(detectCompletion(ROOT, numbered).sessionSetsPresent, true);

    // A NNN- prefixed *file* (not a dir) does NOT count.
    const file = new FakeFs().addFile(path.join(ROOT, "docs", "session-sets", "060-note.md"));
    assert.strictEqual(detectCompletion(ROOT, file).sessionSetsPresent, false);
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

suite("gettingStartedDetection — computeGettingStarted (Set 060 S1 host composition)", () => {
  test("no folder → no-folder mode, no probe (all flags false even if root would qualify)", () => {
    // Pass a fully-scaffolded fs + root, but hasFolder=false: the probe
    // must NOT run, and the flags report false.
    const p = computeGettingStarted(false, ROOT, false, fullyScaffolded());
    assert.deepStrictEqual(p, {
      mode: "no-folder",
      structureBuilt: false,
      planPresent: false,
      sessionSetsPresent: false,
      providerKeyPresent: false,
      tierSeed: null,
      rootId: null,
      verificationModeSeed: null,
      pythonPresent: true,
      copilotCliPresent: true,
      transportProfileSeed: null,
    });
  });

  test("list mode (sets exist) → no probe, all flags false", () => {
    // hasAnySets=true forces list mode; the form never renders, so the
    // flags are reported false and the (expensive) fs probe is skipped.
    const p = computeGettingStarted(true, ROOT, true, fullyScaffolded());
    assert.deepStrictEqual(p, {
      mode: "list",
      structureBuilt: false,
      planPresent: false,
      sessionSetsPresent: false,
      providerKeyPresent: false,
      tierSeed: null,
      rootId: null,
      verificationModeSeed: null,
      pythonPresent: true,
      copilotCliPresent: true,
      transportProfileSeed: null,
    });
  });

  test("getting-started mode → probe runs, flags reflect the root", () => {
    const p = computeGettingStarted(true, ROOT, false, fullyScaffolded());
    assert.deepStrictEqual(p, {
      mode: "getting-started",
      structureBuilt: true,
      planPresent: true,
      sessionSetsPresent: true,
      providerKeyPresent: false,
      tierSeed: null,
      rootId: ROOT,
      verificationModeSeed: null,
      pythonPresent: true,
      copilotCliPresent: true,
      transportProfileSeed: null,
    });
  });

  test("getting-started mode with an empty root → all flags false", () => {
    const p = computeGettingStarted(true, ROOT, false, new FakeFs());
    assert.deepStrictEqual(p, {
      mode: "getting-started",
      structureBuilt: false,
      planPresent: false,
      sessionSetsPresent: false,
      providerKeyPresent: false,
      tierSeed: null,
      rootId: ROOT,
      verificationModeSeed: null,
      pythonPresent: true,
      copilotCliPresent: true,
      transportProfileSeed: null,
    });
  });

  test("getting-started mode but undefined root → no probe, flags false", () => {
    const p = computeGettingStarted(true, undefined, false, fullyScaffolded());
    assert.deepStrictEqual(p, {
      mode: "getting-started",
      structureBuilt: false,
      planPresent: false,
      sessionSetsPresent: false,
      providerKeyPresent: false,
      tierSeed: null,
      rootId: null,
      verificationModeSeed: null,
      pythonPresent: true,
      copilotCliPresent: true,
      transportProfileSeed: null,
    });
  });
});

suite("gettingStartedDetection — providerKeyPresent (Set 060 S3, D6)", () => {
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

  test("computeGettingStarted carries the env signal into the payload (all modes)", () => {
    const withKey = { DABBLER_GEMINI_API_KEY: "g" };
    assert.strictEqual(
      computeGettingStarted(true, ROOT, false, new FakeFs(), withKey).providerKeyPresent,
      true,
    );
    // Mode-independent: the env lookup is free and only renders on the
    // form surface anyway.
    assert.strictEqual(
      computeGettingStarted(true, ROOT, true, new FakeFs(), withKey).providerKeyPresent,
      true,
    );
    // Omitted env param defaults to {} → false.
    assert.strictEqual(
      computeGettingStarted(true, ROOT, false, new FakeFs()).providerKeyPresent,
      false,
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
    const p = computeGettingStarted(true, ROOT, false, new FakeFs(), {}, (root) => {
      calls.push(root);
      return "lightweight";
    });
    assert.strictEqual(p.tierSeed, "lightweight");
    assert.deepStrictEqual(calls, [ROOT]);
  });

  test("resolver returning null carries null (rootId still rides)", () => {
    const p = computeGettingStarted(true, ROOT, false, new FakeFs(), {}, () => null);
    assert.strictEqual(p.tierSeed, null);
    // S077-S2-V1-001: the root identity ships whenever the form renders,
    // so the webview can scope its persisted state per root.
    assert.strictEqual(p.rootId, ROOT);
  });

  test("list mode never calls the resolver", () => {
    let called = false;
    const p = computeGettingStarted(true, ROOT, true, new FakeFs(), {}, () => {
      called = true;
      return "full";
    });
    assert.strictEqual(called, false);
    assert.strictEqual(p.tierSeed, null);
  });

  test("no-folder mode never calls the resolver", () => {
    let called = false;
    const p = computeGettingStarted(false, ROOT, false, new FakeFs(), {}, () => {
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

// ---------------------------------------------------------------------
// Set 077 Session 3 — the verification-mode seed + Python-presence
// probe thunks on computeGettingStarted: getting-started-mode-gated,
// quiet defaults everywhere else. Cases generated via routed
// test-generation (gemini-pro) and adapted.
// ---------------------------------------------------------------------

suite("computeGettingStarted — S3 thunks (mode seed + pythonPresent)", () => {
  function countingThunks() {
    const calls = { modeSeed: 0, python: 0 };
    return {
      calls,
      modeSeed: () => {
        calls.modeSeed++;
        return "dedicated-sessions" as const;
      },
      python: () => {
        calls.python++;
        return false;
      },
    };
  }

  test("getting-started mode: thunks run and their values flow through", () => {
    const t = countingThunks();
    const p = computeGettingStarted(
      true,
      ROOT,
      false,
      fullyScaffolded(),
      {},
      () => "lightweight",
      t.modeSeed,
      t.python,
    );
    assert.strictEqual(p.mode, "getting-started");
    assert.strictEqual(t.calls.modeSeed, 1);
    assert.strictEqual(t.calls.python, 1);
    assert.strictEqual(p.verificationModeSeed, "dedicated-sessions");
    assert.strictEqual(p.pythonPresent, false);
  });

  test("list mode: thunks never run; quiet defaults ship", () => {
    const t = countingThunks();
    const p = computeGettingStarted(
      true,
      ROOT,
      true,
      fullyScaffolded(),
      {},
      () => "lightweight",
      t.modeSeed,
      t.python,
    );
    assert.strictEqual(p.mode, "list");
    assert.strictEqual(t.calls.modeSeed, 0);
    assert.strictEqual(t.calls.python, 0);
    assert.strictEqual(p.verificationModeSeed, null);
    assert.strictEqual(p.pythonPresent, true);
  });

  test("no-folder mode: thunks never run; quiet defaults ship", () => {
    const t = countingThunks();
    const p = computeGettingStarted(
      false,
      undefined,
      false,
      fullyScaffolded(),
      {},
      () => "lightweight",
      t.modeSeed,
      t.python,
    );
    assert.strictEqual(p.mode, "no-folder");
    assert.strictEqual(t.calls.modeSeed, 0);
    assert.strictEqual(t.calls.python, 0);
    assert.strictEqual(p.verificationModeSeed, null);
    assert.strictEqual(p.pythonPresent, true);
  });

  test("omitted thunks yield the quiet defaults in getting-started mode", () => {
    const p = computeGettingStarted(true, ROOT, false, fullyScaffolded());
    assert.strictEqual(p.mode, "getting-started");
    assert.strictEqual(p.verificationModeSeed, null);
    assert.strictEqual(p.pythonPresent, true);
  });
});

// ---------------------------------------------------------------------
// Set 079 Session 1 — the Copilot-CLI presence probe + seat-profile
// seed thunks on computeGettingStarted: same getting-started-mode
// gating and quiet defaults as the S3 thunks above. Cases generated
// via routed test-generation (gemini-pro) and adapted.
// ---------------------------------------------------------------------

suite("computeGettingStarted — S079 thunks (copilotCliPresent + transportProfileSeed)", () => {
  function countingThunks() {
    const calls = { cli: 0, profileSeed: 0 };
    return {
      calls,
      cli: () => {
        calls.cli++;
        return false;
      },
      profileSeed: () => {
        calls.profileSeed++;
        return "copilot-cli" as const;
      },
    };
  }

  test("getting-started mode: thunks run and their values flow through", () => {
    const t = countingThunks();
    const p = computeGettingStarted(
      true,
      ROOT,
      false,
      fullyScaffolded(),
      {},
      undefined,
      undefined,
      undefined,
      t.cli,
      t.profileSeed,
    );
    assert.strictEqual(p.mode, "getting-started");
    assert.strictEqual(t.calls.cli, 1);
    assert.strictEqual(t.calls.profileSeed, 1);
    assert.strictEqual(p.copilotCliPresent, false);
    assert.strictEqual(p.transportProfileSeed, "copilot-cli");
  });

  test("list mode: thunks never run; quiet defaults ship", () => {
    const t = countingThunks();
    const p = computeGettingStarted(
      true,
      ROOT,
      true,
      fullyScaffolded(),
      {},
      undefined,
      undefined,
      undefined,
      t.cli,
      t.profileSeed,
    );
    assert.strictEqual(p.mode, "list");
    assert.strictEqual(t.calls.cli, 0);
    assert.strictEqual(t.calls.profileSeed, 0);
    assert.strictEqual(p.copilotCliPresent, true);
    assert.strictEqual(p.transportProfileSeed, null);
  });

  test("no-folder mode: thunks never run; quiet defaults ship", () => {
    const t = countingThunks();
    const p = computeGettingStarted(
      false,
      undefined,
      false,
      fullyScaffolded(),
      {},
      undefined,
      undefined,
      undefined,
      t.cli,
      t.profileSeed,
    );
    assert.strictEqual(p.mode, "no-folder");
    assert.strictEqual(t.calls.cli, 0);
    assert.strictEqual(t.calls.profileSeed, 0);
    assert.strictEqual(p.copilotCliPresent, true);
    assert.strictEqual(p.transportProfileSeed, null);
  });

  test("omitted thunks yield the quiet defaults in getting-started mode", () => {
    const p = computeGettingStarted(true, ROOT, false, fullyScaffolded());
    assert.strictEqual(p.mode, "getting-started");
    assert.strictEqual(p.copilotCliPresent, true);
    assert.strictEqual(p.transportProfileSeed, null);
  });
});
