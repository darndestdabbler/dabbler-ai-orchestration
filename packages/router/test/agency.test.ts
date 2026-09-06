// The verifier's surface: what it is granted, what it is told, what it did,
// whether what it saw was what was on disk, and its one write. Files in a
// temp directory where a path has to exist; no git, no process.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  DEFAULT_READ_BUDGET,
  FIDELITY_TRANSFORMED,
  FIDELITY_UNVERIFIED,
  FIDELITY_VERBATIM,
  MODE_NONE,
  MODE_TOOLS,
  WRITE_ACCEPTED,
  WRITE_LABEL_FIX,
  WRITE_LABEL_TEST,
  WRITE_REFUSED,
  applyWrites,
  briefing,
  declaredDependencies,
  grantForTransport,
  readFidelity,
  recordForRound,
  recordRow,
  sessionScope,
  summaryLine,
} from "../src/agency.ts";
import { seed, tempDir } from "./support/answers.ts";

const scopes = [{ suite: "unit", roots: ["tests/"], glob: "test_*.py" }];

describe("the agency grant", () => {
  it("grants the read tools only on the seat, and the write on either", () => {
    const seat = grantForTransport("copilot-cli", { scope: ["src/a.py"], allowWrite: true });
    assert.equal(seat.mode, MODE_TOOLS);
    assert.equal(seat.readBudget, DEFAULT_READ_BUDGET);
    const api = grantForTransport("api", { scope: ["src/a.py"], allowWrite: true });
    assert.equal(api.mode, MODE_NONE);
    assert.deepEqual(api.scope, []);
    assert.equal(api.readBudget, 0);
  });

  it("describes nothing it did not grant, and never quotes a credential-shaped example", () => {
    // The seat's scrubber also runs over its own serialised event stream: a
    // bearer-header literal in this text came back as JSON it had broken.
    const readOnly = briefing(grantForTransport("copilot-cli", { scope: ["src/a.py"] }));
    assert.match(readOnly, /no other tools and no way to change anything/);
    assert.doesNotMatch(readOnly, /Your one write/);
    assert.doesNotMatch(readOnly, /Bearer/);
    const noTools = briefing(grantForTransport("api", { allowWrite: true, testScopes: scopes }));
    assert.match(noTools, /You have no tools on this transport/);
    assert.match(noTools, /Your one write/);
  });

  it("shows an example path this repository's own declaration would accept, and lists an envelope rather than describing it", () => {
    assert.match(briefing(grantForTransport("copilot-cli", { allowWrite: true, testScopes: scopes })), /path=tests\/test_example\.py/);
    const text = briefing(grantForTransport("copilot-cli", { allowWrite: true, writeEnvelope: ["src/a.py", "src/b.py"], writeLabel: WRITE_LABEL_FIX }));
    assert.ok(text.includes("- `src/a.py`") && text.includes("```fix-write path=src/a.py"));
  });
});

describe("scope", () => {
  it("takes the changed files, what they import first-order, and the spec directory", () => {
    const repo = tempDir();
    seed(repo, { "pkg/a.py": "from . import b\nimport json\n", "pkg/b.py": "from . import c\n", "pkg/c.py": "x = 1\n" });
    mkdirSync(join(repo, "docs", "sessions"), { recursive: true });
    assert.deepEqual(sessionScope(repo, join(repo, "docs", "sessions"), ["pkg/a.py"]), ["docs/sessions", "pkg/a.py", "pkg/b.py"]);
    assert.deepEqual([...declaredDependencies(repo, ["pkg/a.py"])], ["pkg/b.py"]);
    assert.deepEqual(sessionScope(repo, null, ["pkg/c.py"]), ["pkg/c.py"]);
  });
});

describe("what the round did", () => {
  const grant = grantForTransport("copilot-cli", { scope: ["src"], readBudget: 1 });

  it("records an unconfined search as out of scope, a read past the budget, and one outside the scope", () => {
    const search = recordForRound("/nowhere", grant, { tool_calls: [{ tool: "grep", arguments: { pattern: "api_key" } }] });
    assert.equal(search.operations[0].inScope, false);
    assert.match(String(search.operations[0].detail), /unconfined/);
    const row = recordRow(
      recordForRound("/nowhere", grant, {
        tool_calls: [{ tool: "view", arguments: { path: "src/a.py" } }, { tool: "view", arguments: { path: "elsewhere/b.py" } }],
      }),
    );
    assert.equal(row["reads"], 2);
    assert.equal(row["over_budget"], 1);
    assert.equal(row["out_of_scope"], 1);
  });

  it("says out loud that a round with no tools is not equivalent to one with them, and that a granted surface went unused", () => {
    const none = recordForRound("/nowhere", grantForTransport("api"), {});
    assert.match(String(recordRow(none)["reason"]), /could not look at the tree/);
    assert.match(summaryLine(none), /could not look at the tree/);
    assert.match(summaryLine(recordForRound("/nowhere", grant, { tool_calls: [] })), /looked at nothing it was granted/);
  });

  it("ignores a tool that is not part of the surface", () => {
    assert.deepEqual(recordForRound("/nowhere", grant, { tool_calls: [{ tool: "shell", arguments: { path: "src/a.py" } }] }).operations, []);
  });
});

describe("read fidelity", () => {
  it("marks a shown line that is not the disk line it claims to be", () => {
    const repo = tempDir();
    writeFileSync(join(repo, "a.py"), 'key = f"Bearer {api_key}"\n', "utf8");
    assert.equal(readFidelity(repo, "a.py", { content: '1. key = f"Bearer {api_key}"' })[0], FIDELITY_VERBATIM);
    const [transformed, detail] = readFidelity(repo, "a.py", { content: '1. key = f"******"' });
    assert.equal(transformed, FIDELITY_TRANSFORMED);
    assert.match(String(detail), /line 1 was shown as/);
  });

  it("says unverified rather than clean when there is nothing to compare, and does not slander a ranged read", () => {
    const repo = tempDir();
    assert.equal(readFidelity(repo, "gone.py", { content: "1. x" })[0], FIDELITY_UNVERIFIED);
    writeFileSync(join(repo, "a.py"), "one\ntwo\nthree\n", "utf8");
    assert.equal(readFidelity(repo, "a.py", { content: "no numbers here" })[0], FIDELITY_UNVERIFIED);
    assert.equal(readFidelity(repo, "a.py", { content: "3. three" })[0], FIDELITY_VERBATIM);
  });
});

describe("the one write", () => {
  const writingGrant = (overrides: Record<string, unknown> = {}) =>
    grantForTransport("copilot-cli", { allowWrite: true, testScopes: scopes, ...overrides });

  it("writes the file the block describes and reports what it did", () => {
    const repo = tempDir();
    const [write] = applyWrites(repo, writingGrant(), "```test-write path=tests/test_new.py\nassert True\n```\n");
    assert.equal(write.outcome, WRITE_ACCEPTED);
    assert.equal(write.action, "created");
    assert.equal(readFileSync(join(repo, "tests", "test_new.py"), "utf8"), "assert True\n");
  });

  it("refuses a path outside the declared test locations, a traversal out, and every write when none was granted", () => {
    const repo = tempDir();
    const [outside] = applyWrites(repo, writingGrant(), "```test-write path=src/widget.py\nx = 1\n```\n");
    assert.equal(outside.outcome, WRITE_REFUSED);
    assert.match(String(outside.reason), /outside the declared test locations/);
    assert.equal(existsSync(join(repo, "src", "widget.py")), false);
    assert.match(String(applyWrites(repo, writingGrant(), "```test-write path=../escape.py\nx = 1\n```\n")[0].reason), /outside the repository/);
    assert.match(
      String(applyWrites(repo, grantForTransport("copilot-cli", { testScopes: scopes }), "```test-write path=tests/test_new.py\nassert True\n```\n")[0].reason),
      /granted no write operation/,
    );
    assert.match(
      String(applyWrites(repo, grantForTransport("copilot-cli", { allowWrite: true }), "```test-write path=tests/test_a.py\nassert True\n```\n")[0].reason),
      /declares no test root/,
    );
  });

  it("refuses an empty body, which is a deletion wearing a write's name", () => {
    const repo = tempDir();
    seed(repo, { "tests/test_old.py": "assert True\n" });
    const [write] = applyWrites(repo, writingGrant(), "```test-write path=tests/test_old.py\n\n```\n");
    assert.equal(write.reason, "the block carried no content");
    assert.equal(readFileSync(join(repo, "tests", "test_old.py"), "utf8"), "assert True\n");
  });

  it("confines an envelope round to the envelope, and ignores a block under another round's label", () => {
    const repo = tempDir();
    const grant = writingGrant({ writeEnvelope: ["src/widget.py"], writeLabel: WRITE_LABEL_FIX });
    assert.equal(applyWrites(repo, grant, "```fix-write path=src/widget.py\nx = 1\n```\n")[0].outcome, WRITE_ACCEPTED);
    assert.match(String(applyWrites(repo, grant, "```fix-write path=tests/test_a.py\nx = 1\n```\n")[0].reason), /outside the envelope/);
    assert.deepEqual(applyWrites(repo, writingGrant({ writeLabel: WRITE_LABEL_TEST }), "```fix-write path=tests/test_new.py\nassert True\n```\n"), []);
  });

  it("reports a malformed block rather than dropping it, and lets a test file carry a fence of its own", () => {
    const repo = tempDir();
    assert.match(String(applyWrites(repo, writingGrant(), "```test-write\nassert True\n```\n")[0].reason), /named no path/);
    assert.match(String(applyWrites(repo, writingGrant(), "```test-write path=tests/test_a.py\nassert True\n")[0].reason), /never closed/);
    const [fenced] = applyWrites(repo, writingGrant(), "````test-write path=tests/test_doc.py\nTEXT = '''\n```\n'''\n````\n");
    assert.equal(fenced.outcome, WRITE_ACCEPTED);
    assert.ok(readFileSync(join(repo, "tests", "test_doc.py"), "utf8").includes("```"));
  });
});
