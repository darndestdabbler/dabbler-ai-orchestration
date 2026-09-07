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
  FIDELITY_NOT_FRAMED,
  FIDELITY_UNREADABLE,
  OP_HANDOFF,
  REFUSED_DETAIL,
  applyWrites,
  briefing,
  declaredDependencies,
  grantForTransport,
  moduleScope,
  readFidelity,
  recordForRound,
  recordRow,
  sessionScope,
  summaryLine,
} from "../src/agency.ts";
import { dependencyOrder, parseEntries } from "../src/modules.ts";
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

  it("in the module form takes the module's roots, its and its dependency's contract folders, the root files and the sessions directory, and nothing of the sibling's source", () => {
    const repo = tempDir();
    seed(repo, {
      "global.json": "{}\n",
      "Directory.Packages.props": "<Project />\n",
      "Pipeline.sln": "",
      "modules/model/src/CsvModel/Person.cs": "public sealed class Person {}\n",
      "modules/model/contract/README.md": "# CsvModel\n",
      "modules/persister/src/CsvPersister/Store.cs": "public sealed class Store {}\n",
      "build/common.props": "<Project />\n",
    });
    mkdirSync(join(repo, "docs", "sessions"), { recursive: true });
    const entries = parseEntries({
      modules: [
        { slug: "model", codeRoots: ["modules/model"], package: "CsvModel" },
        { slug: "persister", codeRoots: ["modules/persister"], dependsOn: ["model"], package: "CsvPersister" },
      ],
    });
    const shape = { multi: true, implicit: false, modules: dependencyOrder(entries) };
    const scope = moduleScope(repo, join(repo, "docs", "sessions"), shape, ["persister"], new Map([["persister", ["build/common.props"]]]));
    assert.deepEqual(scope, [
      "Directory.Packages.props",
      "Pipeline.sln",
      "build/common.props",
      "docs/sessions",
      "global.json",
      "modules/model/contract",
      "modules/persister",
      "modules/persister/contract",
    ]);
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

  it("records an out-of-scope read the checkout could not deliver as refused, and a delivered one as out of scope only", () => {
    // The wall is the disk: in a focused clone the sibling's implementation
    // is absent. A read of it finds no file and is refused; a read of an
    // out-of-scope file that IS on disk was delivered, and says so.
    const repo = tempDir();
    seed(repo, { "src/a.py": "x = 1\n", "elsewhere/present.py": "y = 2\n" });
    const record = recordForRound(repo, grantForTransport("copilot-cli", { scope: ["src"], readBudget: 10 }), {
      tool_calls: [
        { tool: "view", arguments: { path: "modules/model/src/CsvModel/Person.cs" }, result: { content: "" } },
        { tool: "view", arguments: { path: "elsewhere/present.py" }, result: { content: "1. y = 2" } },
        { tool: "view", arguments: { path: "src/a.py" }, result: { content: "1. x = 1" } },
      ],
    });
    assert.deepEqual(
      record.operations.map((operation) => [operation.inScope, operation.refused === true]),
      [
        [false, true],
        [false, false],
        [true, false],
      ],
    );
    assert.equal(record.operations[0]?.detail, REFUSED_DETAIL);
    const row = recordRow(record);
    assert.equal(row["out_of_scope"], 2);
    assert.equal(row["refused_reads"], 1);
    assert.deepEqual(
      (row["operations"] as Record<string, unknown>[]).map((operation) => operation["refused"] ?? false),
      [true, false, false],
    );
  });

  it("records a read of the transport's own handoff file as plumbing: neither a read nor an excursion", () => {
    // The Copilot CLI transport tells the model to read its payload file
    // first, and one csv-model round spent 9 of 22 calls doing so -- each
    // recorded as an out-of-scope read graded unverified.
    const handoff = "C:/Users/someone/AppData/Local/Temp/dabbler-copilot-handoff-25a322cdaa712f31.txt";
    const record = recordForRound("/nowhere", grant, {
      tool_calls: [
        { tool: "view", arguments: { path: handoff }, result: { content: "task text" } },
        { tool: "view", arguments: { path: handoff }, result: { content: "task text" } },
      ],
    });
    assert.deepEqual(record.operations.map((operation) => [operation.kind, operation.inScope, operation.fidelity]), [
      [OP_HANDOFF, true, null],
      [OP_HANDOFF, true, null],
    ]);
    const row = recordRow(record);
    assert.equal(row["reads"], 0);
    assert.equal(row["out_of_scope"], 0);
    assert.equal(row["over_budget"], 0);
    assert.match(summaryLine(record), /2 read\(s\) of the transport's own handoff file/);
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
  // The shape Copilot CLI 1.0.83's `view` returns (docs/copilot-cli-walkthrough.md):
  // `content` is the file's text, and `detailedContent` a unified diff of
  // the file against itself whose hunk header numbers the lines.
  const viewed = (lines: string[], from = 1) => ({
    content: lines.join("\n"),
    detailedContent:
      "\ndiff --git a/x b/x\nindex 0000000..0000000 100644\n--- a/x\n+++ b/x\n" +
      `@@ -${from},${lines.length} +${from},${lines.length} @@\n` +
      lines.map((line) => ` ${line}`).join("\n") +
      "\n",
  });

  it("marks a shown line that is not the disk line it claims to be", () => {
    const repo = tempDir();
    writeFileSync(join(repo, "a.py"), 'key = f"Bearer {api_key}"\n', "utf8");
    assert.equal(readFidelity(repo, "a.py", viewed(['key = f"Bearer {api_key}"']))[0], FIDELITY_VERBATIM);
    const [transformed, detail] = readFidelity(repo, "a.py", viewed(['key = f"******"']));
    assert.equal(transformed, FIDELITY_TRANSFORMED);
    assert.match(String(detail), /line 1 was shown as/);
  });

  it("reads the disk before the framing: a path that is not a file is recorded as that, not as a transport with no line numbers", () => {
    // The verifier guessed `git.ts`; the round said the view tool returns no
    // line numbers on this transport, which was the wrong reason.
    const repo = tempDir();
    const [fidelity, detail] = readFidelity(repo, "guessed.ts", { content: "x\n" });
    assert.equal(fidelity, FIDELITY_UNVERIFIED);
    assert.equal(detail, FIDELITY_UNREADABLE);
  });

  it("records a view of a directory as the listing it is", () => {
    // csv-model's session 6 round: a `view` of `docs/sessions`, recorded as
    // a read that "could not be read as text here".
    const repo = tempDir();
    mkdirSync(join(repo, "docs", "sessions"), { recursive: true });
    const grant = grantForTransport("copilot-cli", { scope: ["docs/sessions"] });
    const record = recordForRound(repo, grant, {
      tool_calls: [{ tool: "view", arguments: { path: "docs/sessions" }, result: { content: "a\nb\n" } }],
    });
    assert.equal(record.operations[0]?.kind, "list");
    assert.equal(record.operations[0]?.inScope, true);
    assert.equal(record.operations[0]?.fidelity, null);
  });

  it("says when a shown line is the disk line cut short, rather than shown as something else", () => {
    const repo = tempDir();
    const long = "x".repeat(300);
    writeFileSync(join(repo, "notes.md"), `${long}\n`, "utf8");
    const [fidelity, detail] = readFidelity(repo, "notes.md", viewed([long.slice(0, 120)]));
    assert.equal(fidelity, FIDELITY_TRANSFORMED);
    assert.match(String(detail), /cut short by the tool at 120 of 300/);
  });

  it("says unverified rather than clean when there is nothing to compare, and does not slander a ranged read", () => {
    const repo = tempDir();
    assert.equal(readFidelity(repo, "gone.py", viewed(["x"]))[0], FIDELITY_UNVERIFIED);
    writeFileSync(join(repo, "a.py"), "one\ntwo\nthree\n", "utf8");
    assert.equal(readFidelity(repo, "a.py", viewed(["three"], 3))[0], FIDELITY_VERBATIM);
  });

  it("takes the line numbers from the tool's framing, never from a line that starts with a digit, and says once per round when there is no framing", () => {
    // csv-model's session plan opens `1. Register.` and was graded
    // transformed by a regex that read the markdown list as line numbers;
    // the same transport, given no diff, is not measurable -- and that is
    // one fact about the round, not one unverified read per file.
    const repo = tempDir();
    const grant = grantForTransport("copilot-cli", { scope: ["plan.md"] });
    writeFileSync(join(repo, "plan.md"), "1. Register.\n2. Build it.\n", "utf8");
    const framed = readFidelity(repo, "plan.md", viewed(["1. Register.", "2. Build it."]));
    assert.equal(framed[0], FIDELITY_VERBATIM);
    const [unframed, detail] = readFidelity(repo, "plan.md", { content: "1. Register.\n2. Build it.\n" });
    assert.equal(unframed, FIDELITY_UNVERIFIED);
    assert.equal(detail, FIDELITY_NOT_FRAMED);
    const unmeasurable = recordRow(
      recordForRound(repo, grant, {
        tool_calls: [{ tool: "view", arguments: { path: "plan.md" }, result: { content: "1. Register.\n2. Build it.\n" } }],
      }),
    );
    assert.equal(unmeasurable["fidelity_measurable"], false);
    const measurable = recordRow(
      recordForRound(repo, grant, {
        tool_calls: [{ tool: "view", arguments: { path: "plan.md" }, result: viewed(["1. Register.", "2. Build it."]) }],
      }),
    );
    assert.equal(measurable["fidelity_measurable"], true);
    assert.equal("fidelity_measurable" in recordRow(recordForRound(repo, grant, { tool_calls: [] })), false);
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
