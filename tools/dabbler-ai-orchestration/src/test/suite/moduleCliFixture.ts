// Set 122 Session 2: a synchronous module-lifecycle fixture builder for the
// Layer-2 suite.
//
// Several suites need a real, correctly-shaped module on disk — a manifest
// entry, a plan stub, and the two numbered lifecycle sets — as a FIXTURE
// for what they actually test (tree assembly, the prerequisite gate, the
// undeclared-stamp fallback). Before Set 122 S2 they built it by calling
// the TypeScript writers directly. Those writers are gone: `python -m
// ai_router.modules` is the one implementation.
//
// Building the fixture through the real CLI is strictly better than
// hand-writing the files, because a hand-written fixture encodes this
// file's guess about the manifest/spec shape, and a guess that drifts from
// the writer produces suites that pass against a shape nothing produces.

import * as cp from "child_process";
import * as path from "path";
import * as vscode from "vscode";

let cached: string | undefined;

/**
 * An interpreter that can `import ai_router`.
 *
 * Deliberately NOT skip-on-missing: a fixture builder that quietly degrades
 * would let every suite depending on it pass vacuously. The failure message
 * names the exact fix instead.
 */
export function fixturePython(): string {
  if (cached) return cached;
  const repoRoot = path.resolve(__dirname, "../../../../..");
  const candidates = [
    process.env.DABBLER_SMOKE_PYTHON,
    path.join(repoRoot, ".venv", "Scripts", "python.exe"),
    path.join(repoRoot, ".venv", "bin", "python"),
    "python",
    "python3",
  ].filter((c): c is string => !!c);
  for (const candidate of candidates) {
    const probe = cp.spawnSync(candidate, ["-c", "import ai_router"], {
      encoding: "utf8",
    });
    if (probe.status === 0) {
      cached = candidate;
      return candidate;
    }
  }
  throw new Error(
    "The module-lifecycle fixtures need a Python interpreter with " +
      "`ai_router` importable. Tried: " +
      candidates.join(", ") +
      ". Fix it with `.venv/Scripts/pip install -e .` from the repo root, or " +
      "point DABBLER_SMOKE_PYTHON at a suitable interpreter.",
  );
}

export interface ModuleFixture {
  slug: string;
  planSetSlug: string;
  decompositionSetSlug: string;
  planRel: string;
}

/** The stub's test-only configuration hooks (see `src/test/vscode-stub.js`). */
interface VscodeConfigStub {
  __setConfig(section: string, key: string, value: string): void;
  __clearConfig(): void;
}

/**
 * Point `dabblerSessionSets.pythonPath` at an interpreter that has
 * `ai_router`, for the enclosing suite only.
 *
 * Call this inside a `suite(...)` body when the code under test spawns a
 * router CLI through the PRODUCTION interpreter resolution. Test roots are
 * temp directories with no `.venv`, so resolution correctly falls through
 * to bare `python` — which on most machines cannot import `ai_router`, and
 * the flow would then report an install problem instead of doing the work.
 *
 * Scoped to the suite rather than set globally: `pythonInterpreter.test.ts`
 * asserts the bare-`python` fallback, and a process-wide override would
 * quietly invert what it proves.
 */
export function useFixturePython(): void {
  suiteSetup(() => {
    (vscode.workspace as unknown as VscodeConfigStub).__setConfig(
      "dabblerSessionSets",
      "pythonPath",
      fixturePython(),
    );
  });
  suiteTeardown(() => {
    (vscode.workspace as unknown as VscodeConfigStub).__clearConfig();
  });
}

/**
 * Create a module under *root* through the real CLI, returning the slugs it
 * minted. Throws with the CLI's own output on any non-zero exit — a fixture
 * that half-built itself must fail the test loudly, not quietly produce a
 * misleading arrangement of files.
 */
export function createModuleFixture(
  root: string,
  slug: string,
  title?: string,
): ModuleFixture {
  const args = [
    "-m",
    "ai_router.modules",
    "--repo-root",
    root,
    "--json",
    "create",
    "--slug",
    slug,
  ];
  if (title) args.push("--title", title);
  const run = cp.spawnSync(fixturePython(), args, {
    cwd: root,
    encoding: "utf8",
  });
  if (run.status !== 0) {
    throw new Error(
      `createModuleFixture(${slug}) exited ${run.status}: ` +
        `${(run.stderr || "").trim() || (run.stdout || "").trim()}`,
    );
  }
  const text = (run.stdout || "").trim();
  const payload = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  return {
    slug: payload.slug,
    planSetSlug: payload.planSetSlug,
    decompositionSetSlug: payload.decompositionSetSlug,
    planRel: payload.planRel,
  };
}
