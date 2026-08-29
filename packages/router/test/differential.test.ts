// Artifacts and answers no command line can reach, checked against the
// reference implementation directly.
//
// The parity control compares two routers at the command line. Three things
// this session lands are outside that: `step-execution.jsonl` is written by
// `verify step close`, whose green path needs an approved plan AND a passing
// control run on both copies; the agency record is a MEMBER of a round row
// rather than a file, so no shape carries one without a paid model call; and
// a verdict token's classification is a pure function nothing prints. Each is
// driven on both sides from one input, and the answers are compared.
//
// The interpreter is this repository's own venv, with no fallback to a PATH
// Python. That is a deliberate under-approximation: a machine with
// `ai_router` importable from some other Python SKIPS these silently. The
// vitest CI job installs no Python at all -- for the same reason the parity
// control is absent from it -- so the guard is what lets this file run there
// rather than a hole in it. On a developer machine the venv is where the
// router lives, so in practice it runs.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_READ_BUDGET,
  grantForTransport,
  recordForRound,
  recordRow,
} from "../src/agency.ts";
import { appendStepEvent, STEP_EVENT_CLOSED, STEP_SCHEMA_VERSION } from "../src/ledger.ts";
import { dumps } from "../src/pythonJson.ts";
import { classifyBlocking, parseVerificationResponse } from "../src/verdict.ts";
import { makeSeededRepo, makeTempDir } from "./support/fixtures.ts";

const repoRoot = join(import.meta.dirname, "..", "..", "..");
const interpreter = join(
  repoRoot,
  ".venv",
  process.platform === "win32" ? "Scripts" : "bin",
  process.platform === "win32" ? "python.exe" : "python",
);
const havePython = existsSync(interpreter);

/** One `python -c` against the reference implementation, or the reason not. */
function reference(source: readonly string[], args: readonly string[]): string {
  const result = spawnSync(
    interpreter,
    ["-c", source.join("\n"), ...args],
    { cwd: repoRoot, encoding: "utf8" },
  );
  expect(result.status, result.stderr).toBe(0);
  // Python's text-mode stdout translates on Windows; the comparison is over
  // the values, and the newline the host writes is not one of them.
  return result.stdout.split("\r\n").join("\n");
}

describe("the step-execution record, against the reference implementation", () => {
  it.runIf(havePython)("writes the same closed-step row from the same input", () => {
    // `verify step close` composes this row and hands it to the ledger. The
    // composition is what differs between two languages -- a dropped optional
    // key, a differently-ordered envelope list, a boolean written as a string
    // -- and the ledger's schema would accept several of those.
    const row = {
      schema_version: STEP_SCHEMA_VERSION,
      event: STEP_EVENT_CLOSED,
      recorded_at: "2026-01-01T00:00:00+00:00",
      session_number: 4,
      step_id: "build-the-widget",
      base_commit: "a".repeat(40),
      closed_tree: "b".repeat(40),
      envelope: {
        inside: ["src/widget.py", "tests/test_widget.py"],
        outside: [],
      },
      deterministic: [
        { kind: "lint", status: "pass", required: true, command: "ruff check", detail: "clean" },
        { kind: "tests", status: "not_applicable", required: false, detail: "no test" },
      ],
    };

    const ours = makeSeededRepo();
    appendStepEvent(ours, 4, row);
    const ourText = readFileSync(
      join(ours, ".dabbler", "runs", "s4", "step-execution.jsonl"),
      "utf8",
    );

    const theirs = makeSeededRepo();
    reference(
      [
        "import json, sys",
        "from ai_router.ledger import append_step_event",
        "append_step_event(sys.argv[2], 4, json.loads(sys.argv[1]))",
      ],
      [JSON.stringify(row), theirs],
    );
    const theirText = readFileSync(
      join(theirs, ".dabbler", "runs", "s4", "step-execution.jsonl"),
      "utf8",
    );
    expect(ourText).toBe(theirText);
  });
});

describe("the agency record, against the reference implementation", () => {
  it.runIf(havePython)("folds the same round row out of the same metadata", () => {
    // The record is the `agency` MEMBER of a round row, not a file -- which
    // is why no CLI case can reach it and why the parity control's fourth
    // amendment, saying an agency comparison cannot exist before `verify`
    // lands, overstates what is true: what cannot exist is a FILE or a CLI
    // case. This comparison could have been written any time.
    const scope = ["src/widget.py"];
    // The shape the seat transport reports: `tool` names the operation and
    // `arguments` carries the target. Five calls reach five branches -- a
    // read inside the scope, a read outside it, a repository-wide search with
    // no path at all (counted out of scope on purpose, because a pattern
    // confined to nothing reviewed nothing), a listing, and a tool the grant
    // never named, which contributes no operation at all.
    const metadata = {
      tool_calls: [
        { tool: "view", arguments: { path: "src/widget.py" } },
        { tool: "view", arguments: { path: "../outside.py" } },
        { tool: "grep", arguments: { pattern: "widget" } },
        { tool: "glob", arguments: { path: "src" } },
        { tool: "not-a-granted-tool", arguments: { path: "src/widget.py" } },
      ],
    };

    const repo = makeSeededRepo({ "src/widget.py": "def widget():\n" });
    const grant = grantForTransport("copilot-cli", {
      scope,
      readBudget: DEFAULT_READ_BUDGET,
      allowWrite: false,
    });
    const ours = dumps(recordRow(recordForRound(repo, grant, metadata, [])), {
      indent: 2,
      sortKeys: true,
    });

    const theirs = reference(
      [
        "import json, sys",
        "from ai_router import agency",
        "grant = agency.grant_for_transport(",
        "    'copilot-cli', json.loads(sys.argv[2]), agency.DEFAULT_READ_BUDGET,",
        "    (), allow_write=False)",
        "record = agency.record_for_round(sys.argv[3], grant, json.loads(sys.argv[1]), [])",
        "sys.stdout.write(json.dumps(record.as_row(), indent=2, sort_keys=True))",
      ],
      [JSON.stringify(metadata), JSON.stringify(scope), repo],
    );
    expect(ours).toBe(theirs);
  });
});

describe("the verdict token, against the reference implementation", () => {
  // D168. `parseVerificationResponse` tests the head with
  // `startsWith("VERIFIED")`, so a look-alike classifies as VERIFIED. That is
  // faithful to Python and deliberately not fixed in the port: an improvement
  // on one side only is exactly the drift parity exists to catch. This
  // records the agreement rather than the behaviour, so that the day either
  // side tightens the token, the other is told.
  const responses = [
    "VERIFIED_NOT_REALLY\n\nThe head is not the token it resembles.\n",
    "VERIFIED\n\nNothing to report.\n",
    "**VERDICT: ISSUES FOUND**\n\nIssue 1: broken.\nSeverity: Critical\n",
    "ISSUES FOUND\n\nIssue 1: cosmetic.\nSeverity: Minor\n",
    "a response with no verdict token at all\n",
  ];

  it.runIf(havePython)("classifies a look-alike the same way on both sides", () => {
    const ours = responses.map((text) => {
      const [verdict, issues] = parseVerificationResponse(text);
      const classification = classifyBlocking(verdict, issues);
      return {
        verdict,
        blocking: classification.blocking,
        reason: classification.reason,
        severities: issues.map((issue) => issue.severity ?? null),
      };
    });

    const theirs = reference(
      [
        "import json, sys",
        "from ai_router.verdict import classify_blocking, parse_verification_response",
        "out = []",
        "for text in json.loads(sys.argv[1]):",
        "    verdict, issues = parse_verification_response(text)",
        "    c = classify_blocking(verdict, issues)",
        "    out.append({",
        "        'verdict': verdict, 'blocking': c.blocking, 'reason': c.reason,",
        "        'severities': [i.get('severity') for i in issues],",
        "    })",
        "sys.stdout.write(json.dumps(out, indent=2, sort_keys=True))",
      ],
      [JSON.stringify(responses)],
    );
    expect(dumps(ours, { indent: 2, sortKeys: true })).toBe(theirs);

    // And the look-alike is VERIFIED on both, which is the finding D168
    // records rather than a behaviour either side may quietly change.
    expect(ours[0]?.verdict).toBe("VERIFIED");
  });
});

describe("the deterministic-facts row, against the reference implementation", () => {
  it.runIf(havePython)("appends the same sorted-key line from the same record", () => {
    // `facts` writes one line per collection with `sort_keys=True`, and a
    // reader parses each line on its own. The row is composed from a
    // dataclass on one side and an object on the other; the bytes are the
    // contract.
    const scratch = makeTempDir();
    mkdirSync(scratch, { recursive: true });

    const controls = [
      { kind: "compile", status: "not_applicable", required: false, detail: "none" },
      { kind: "lint", status: "pass", required: true, command: "ruff", detail: "clean" },
    ];
    const changed = { "src/widget.py": 3, "tests/test_widget.py": 1 };
    const ours = dumps(
      {
        recordedAt: "2026-01-01T00:00:00+00:00",
        controls,
        changedLines: changed,
        sessionNumber: 4,
        round: 2,
      },
      { sortKeys: true },
    );

    const theirs = reference(
      [
        "import json, sys",
        "from ai_router.facts import ControlFact, FactRecord",
        "facts = tuple(",
        "    ControlFact(c['kind'], c['status'], c.get('command', ''),",
        "                c['required'], c.get('detail', ''))",
        "    for c in json.loads(sys.argv[1]))",
        "record = FactRecord(",
        "    controls=facts,",
        "    changed={p: tuple(range(n)) for p, n in json.loads(sys.argv[2]).items()},",
        "    session_number=4, round_number=2,",
        "    recorded_at='2026-01-01T00:00:00+00:00')",
        "sys.stdout.write(json.dumps(record.to_dict(), sort_keys=True))",
      ],
      [JSON.stringify(controls), JSON.stringify(changed)],
    );
    expect(ours).toBe(theirs);
  });
});

describe("the bootstrap scaffold, against the reference implementation", () => {
  // The parity control runs `bootstrap` on the `fresh` shape, which already
  // carries a plan and a `dabbler.yaml` -- so the refresh path is compared
  // and the SCAFFOLD path, the one a consumer project actually takes, is
  // not. Reaching it from the control would need a sixth corpus shape, and
  // a shape is built twice on every round of every session from here; the
  // two files it would add are not in the compared set either. So the branch
  // is driven directly on both sides instead, which is what this file is for.

  /** Both routers' bootstrap over one empty directory each. */
  function scaffoldBothWays(ecosystem: Record<string, string>): {
    ours: Record<string, string>;
    theirs: Record<string, string>;
  } {
    const read = (root: string): Record<string, string> => {
      const files: Record<string, string> = {};
      for (const rel of [
        "dabbler.yaml",
        "docs/sessions/session-plan.md",
        "AGENTS.md",
        "CLAUDE.md",
        "GEMINI.md",
        ".gitignore",
      ]) {
        const path = join(root, ...rel.split("/"));
        files[rel] = existsSync(path) ? readFileSync(path, "utf8") : "(absent)";
      }
      return files;
    };
    const seed = (root: string): void => {
      mkdirSync(root, { recursive: true });
      for (const [rel, text] of Object.entries(ecosystem)) {
        const path = join(root, ...rel.split("/"));
        mkdirSync(join(path, ".."), { recursive: true });
        writeFileSync(path, text, "utf8");
      }
    };
    const base = makeTempDir();
    const mine = join(base, "ts");
    const theirs = join(base, "py");
    seed(mine);
    seed(theirs);

    const ranTs = spawnSync(
      process.execPath,
      [
        join(repoRoot, "packages", "router", "dist", "dabbler.cjs"),
        "bootstrap",
        "--project-dir", mine,
        "--repo-name", "acme-app",
        "--no-transport-detect",
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );
    expect(ranTs.status, ranTs.stderr).toBe(0);

    const ranPy = spawnSync(
      interpreter,
      [
        "-m", "ai_router.bootstrap",
        "--project-dir", theirs,
        "--repo-name", "acme-app",
        "--no-transport-detect",
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );
    expect(ranPy.status, ranPy.stderr).toBe(0);

    return { ours: read(mine), theirs: read(theirs) };
  }

  it.runIf(havePython)(
    "writes the same files into a project that has nothing",
    () => {
      // No build file at all: the `no suites` declaration, which is a
      // declaration rather than an omission, plus the two setup sessions.
      const { ours, theirs } = scaffoldBothWays({});
      expect(ours).toEqual(theirs);
      expect(ours["docs/sessions/session-plan.md"]).toContain("### Session 1:");
      expect(ours["dabbler.yaml"]).toContain("No suite is declared");
    },
  );

  it.runIf(havePython)(
    "declares the same suite for each ecosystem it detects",
    () => {
      // Two ecosystems at once is the case `testing.suites` was made plural
      // for, and the committed wrapper is the entry point the repository
      // already chose.
      const { ours, theirs } = scaffoldBothWays({
        "pytest.ini": "[pytest]\n",
        "pom.xml": "<project/>\n",
        "mvnw": "#!/bin/sh\n",
        "package.json": JSON.stringify({ scripts: { test: "vitest run" } }),
      });
      expect(ours).toEqual(theirs);
      expect(ours["dabbler.yaml"]).toContain("./mvnw -q test");
      expect(ours["dabbler.yaml"]).toContain("name: node");
    },
  );
});
