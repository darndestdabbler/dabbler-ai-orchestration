// The command lines session 31 makes real: `dabbler session`'s five
// remaining subcommands, `dabbler progress` and `dabbler modules`.
//
// Argparse's whole grammar is not the contract, the flags the lifecycle
// documents are -- so what is asserted here is that every documented flag
// reaches the function it names, and that a flag nobody documented is a
// usage error rather than a silent no-op. A misspelled `--not-releasable`
// that parsed as nothing would publish.

import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { modulesVerb } from "../src/cli/modules.ts";
import { statusVerb } from "../src/cli/status.ts";
import { HANDLERS } from "../src/cli/registry.ts";
import { VERBS } from "../src/contracts/verbs.ts";
import { sessionVerb } from "../src/cli/session.ts";
import { readRawSessionState } from "../src/progress.ts";
import { registerSessionStart } from "../src/writers.ts";
import { makeSandboxRepo, makeTempDir, removeTempDirs } from "./support/fixtures.ts";

afterAll(removeTempDirs);
afterEach(() => vi.restoreAllMocks());

async function captured(
  run: () => Promise<number>,
): Promise<{ code: number; out: string; err: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const collect = (sink: string[]) => (chunk: unknown) => {
    sink.push(String(chunk));
    return true;
  };
  vi.spyOn(process.stdout, "write").mockImplementation(collect(out));
  vi.spyOn(process.stderr, "write").mockImplementation(collect(err));
  try {
    return { code: await run(), out: out.join(""), err: err.join("") };
  } finally {
    vi.restoreAllMocks();
  }
}

describe("dabbler session, the whole surface", () => {
  it("registers every subcommand the Python command line has", async () => {
    const result = await captured(() => sessionVerb(["--help"]));
    for (const name of [
      "start",
      "log",
      "decision",
      "declare",
      "plan",
      "close",
      "cancel",
      "restore",
      "migrate",
    ]) {
      expect(result.out).toContain(name);
    }
    expect(result.out).not.toContain("not yet");
  });

  it("refuses a subcommand that does not exist, and says so differently", async () => {
    const result = await captured(() => sessionVerb(["clsoe"]));
    expect(result.code).toBe(2);
    expect(result.err).toContain("is not a subcommand");
  });

  it("runs the close read-only under --dry-run", async () => {
    const { sessionsDir } = makeSandboxRepo();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    const result = await captured(() =>
      sessionVerb(["close", "--dry-run", "--sessions-dir", sessionsDir]),
    );
    expect(result.code).toBe(1);
    expect(result.out).toContain("gates pass; nothing written.");
    const record = (readRawSessionState(sessionsDir)?.["sessions"] as Record<
      string,
      unknown
    >[])[0];
    expect(record["status"]).toBe("in-progress");
  });

  it("takes the session number for cancel as a positional, as argparse does", async () => {
    const { sessionsDir } = makeSandboxRepo();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    const result = await captured(() =>
      sessionVerb([
        "cancel", "1", "--reason", "stop", "--force", "--sessions-dir", sessionsDir,
      ]),
    );
    expect(result.code).toBe(0);
    expect(result.out).toContain('"status": "cancelled"');
  });

  it("requires the reason a cancellation is recorded under", async () => {
    const { sessionsDir } = makeSandboxRepo();
    const result = await captured(() =>
      sessionVerb(["cancel", "1", "--sessions-dir", sessionsDir]),
    );
    expect(result.code).toBe(2);
    expect(result.err).toContain("--reason");
  });

  it("refuses a session number that is not one", async () => {
    const { sessionsDir } = makeSandboxRepo();
    const result = await captured(() =>
      sessionVerb(["restore", "one", "--sessions-dir", sessionsDir]),
    );
    expect(result.code).toBe(2);
    expect(result.err).toContain("invalid int value");
  });

  it("requires the positional a restore acts on", async () => {
    const { sessionsDir } = makeSandboxRepo();
    const result = await captured(() =>
      sessionVerb(["restore", "--sessions-dir", sessionsDir]),
    );
    expect(result.code).toBe(2);
    expect(result.err).toContain("session_number");
  });

  it("takes the plan prose inline or from a file, and never both", async () => {
    const { sessionsDir } = makeSandboxRepo();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    const both = await captured(() =>
      sessionVerb([
        "plan", "--body", "a", "--body-file", "b", "--sessions-dir", sessionsDir,
      ]),
    );
    expect(both.code).toBe(2);
    expect(both.err).toContain("not allowed with argument --body");

    const neither = await captured(() =>
      sessionVerb(["plan", "--sessions-dir", sessionsDir]),
    );
    expect(neither.code).toBe(2);
    expect(neither.err).toContain("one of the arguments --body --body-file");

    const ok = await captured(() =>
      sessionVerb(["plan", "--body", "The plan.", "--sessions-dir", sessionsDir]),
    );
    expect(ok.code).toBe(0);
    expect(readFileSync(join(sessionsDir, "project-work-plan.md"), "utf8")).toContain(
      "The plan.",
    );
  });

  it("requires the legacy directory a migration reads", async () => {
    const { sessionsDir } = makeSandboxRepo();
    const result = await captured(() =>
      sessionVerb(["migrate", "--sessions-dir", sessionsDir]),
    );
    expect(result.code).toBe(2);
    expect(result.err).toContain("legacy_set_dir");
  });
});

describe("dabbler status", () => {
  it("emits the projection as indented JSON", async () => {
    const { sessionsDir } = makeSandboxRepo();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    const result = await captured(() => statusVerb(["--sessions-dir", sessionsDir]));
    expect(result.code).toBe(0);
    const projection = JSON.parse(result.out) as Record<string, unknown>;
    expect(projection["schemaVersion"]).toBe(1);
    expect((projection["sessions"] as unknown[]).length).toBe(2);
  });

  it("treats --json as the one output mode rather than as a switch", async () => {
    const { sessionsDir } = makeSandboxRepo();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    const bare = await captured(() => statusVerb(["--sessions-dir", sessionsDir]));
    const flagged = await captured(() =>
      statusVerb(["--json", "--sessions-dir", sessionsDir]),
    );
    const strip = (text: string): string =>
      text.replace(/"generatedAt": "[^"]*"/, '"generatedAt": "<ts>"');
    expect(strip(flagged.out)).toBe(strip(bare.out));
  });

  it("is the one name for the projection, and `progress` is not a verb", async () => {
    // `status` is what D88 and D130 promised the operator when the run
    // core's own `status` went away. It was an alias over `progress` for one
    // session, because the extension spawned `progress`; the extension calls
    // a method now, so the second name has nothing holding it up.
    expect(VERBS.map((spec) => spec.verb)).not.toContain("progress");
    expect(HANDLERS["progress"]).toBeUndefined();
    const help = await captured(() => statusVerb(["--help"]));
    expect(help.out).toContain("usage: dabbler status");
  });

  it("refuses a sessions root that is not a directory", async () => {
    const result = await captured(() =>
      statusVerb(["--sessions-dir", join(makeTempDir(), "nowhere")]),
    );
    expect(result.code).toBe(2);
    expect(result.err).toContain("not a directory");
  });

  it("refuses an argument it does not know rather than ignoring it", async () => {
    const result = await captured(() => statusVerb(["--sessions"]));
    expect(result.code).toBe(2);
    expect(result.err).toContain("unrecognized argument");
  });
});

describe("dabbler modules", () => {
  it("has one subcommand, because the manifest has one writer", async () => {
    const result = await captured(() => modulesVerb(["list", makeTempDir()]));
    expect(result.code).toBe(2);
    expect(result.err).toContain("is not a subcommand");
  });

  it("passes the root positionally and collects each repeatable flag", async () => {
    const root = makeTempDir();
    mkdirSync(join(root, "docs"), { recursive: true });
    const result = await captured(() =>
      modulesVerb([
        "create", root,
        "--slug", "greeter",
        "--title", "Greeter",
        "--code-root", "src/greeter",
        "--code-root", "tests/greeter",
      ]),
    );
    expect(result.code).toBe(0);
    const manifest = readFileSync(join(root, "docs", "modules.yaml"), "utf8");
    expect(manifest).toContain("src/greeter");
    expect(manifest).toContain("tests/greeter");
  });

  it("requires the slug and the title, which the CLI does not default", async () => {
    const result = await captured(() => modulesVerb(["create", makeTempDir()]));
    expect(result.code).toBe(2);
    expect(result.err).toContain("--slug, --title");
  });

  it("refuses a workspace root that is not a directory", async () => {
    const result = await captured(() =>
      modulesVerb([
        "create", join(makeTempDir(), "nowhere"), "--slug", "a", "--title", "A",
      ]),
    );
    expect(result.code).toBe(2);
    expect(result.err).toContain("not a directory");
  });
});

describe("the verb registry", () => {
  it("has a handler for every verb the table offers", () => {
    for (const spec of VERBS) {
      expect(typeof HANDLERS[spec.verb], spec.verb).toBe("function");
    }
  });
});
