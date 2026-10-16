// The transcript: the tone grammar both renderers share, and the page one
// session's records become.
//
// What is asserted is what a reader would see -- that a verdict is green
// wherever it appears, that a runner's colour survives into the page, that
// a key never does, and that a session which left little behind SAYS so
// rather than rendering a tidy page about nothing.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";

import { transcriptVerb, parseTranscriptArgs } from "../src/cli/transcript.ts";
import { appendDriverEvent, writeRun } from "../src/driver.ts";
import { jobLogPath, jobStatusPath } from "../src/jobs.ts";
import { roundsPath } from "../src/ledger.ts";
import { capture } from "../src/output.ts";
import { TRANSCRIPTS_DIRNAME } from "../src/journal.ts";
import {
  TONES,
  ansiToHtml,
  fieldTone,
  lineTone,
  renderSessionTranscript,
  verdictTone,
} from "../src/transcript.ts";
import { gitAnswers, tempDir } from "./support/answers.ts";

const ESC = "\u001b";
const HEAD = "0123456789abcdef0123456789abcdef01234567";

function write(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, "utf8");
}

/** A repository whose session 5 left a full set of records behind. */
function repoWithASession(): string {
  const root = tempDir("transcript-");
  writeRun(root, 5, {
    schema_version: 1, session_number: 5, engine: "cli", phase: "close", seq: 4,
    invocations: 0, max_invocations: 24, accepted_steps: ["events", "renderer"],
    baseline_tree: null, stop: null,
    started_at: "2026-10-16T09:00:00-04:00", updated_at: "2026-10-16T09:40:00-04:00",
  });
  appendDriverEvent(root, 5, "phase", { phase: "verify" }, "work");
  appendDriverEvent(root, 5, "verify", { verdict: "VERIFIED" }, "verify");
  write(
    roundsPath(root, 5),
    `${JSON.stringify({
      round: 1, phase: "full", verdict: "VERIFIED", blocking: false, findings: [],
      reviewer_model: "gpt-5.6-sol", reviewer_provider: "openai", transport: "api",
      completion_tree: "abcdef1234567", recorded_at: "2026-10-16T09:30:00-04:00",
    })}\n`,
  );
  write(
    join(root, ".dabbler", "runs", "test-runs.jsonl"),
    `${JSON.stringify({
      suite: "typescript", command: "node scripts/suite.mjs container", outcome: "passed",
      surfaceDigest: "d1", recordedAt: "2026-10-16T09:35:00-04:00", stage: "final-full",
      sessionNumber: 5, durationSeconds: 41.2,
    })}\n${JSON.stringify({
      suite: "typescript", command: "somebody else's run", outcome: "passed",
      surfaceDigest: "d0", recordedAt: "2026-10-01T09:35:00-04:00", sessionNumber: 4,
    })}\n`,
  );
  return root;
}

function render(root: string, options: Parameters<typeof renderSessionTranscript>[2] = {}): string {
  const restore = gitAnswers([[["rev-parse", "HEAD"], { stdout: HEAD }]]);
  try {
    return renderSessionTranscript(root, 5, { renderedAt: "2026-10-16T10:00:00Z", ...options });
  } finally {
    restore();
  }
}

describe("what a line IS, which both renderers read", () => {
  it("greens only a clean verdict and warns one it does not recognise", () => {
    // Guessing "fine" about an unknown verdict is worst exactly where it is
    // most tempting: the token nobody has seen before.
    assert.equal(verdictTone("VERIFIED"), "good");
    assert.equal(verdictTone("issues_found"), "bad");
    assert.equal(verdictTone("SOMETHING_NEW"), "warn");
  });

  it("keys a value on the key, so a verdict is green wherever it sits", () => {
    assert.equal(fieldTone("anything", "verdict", "VERIFIED"), "good");
    assert.equal(fieldTone("job-finished", "exit", "0"), "good");
    assert.equal(fieldTone("job-finished", "exit", "1"), "bad");
    assert.equal(lineTone("tests", { outcome: "failed" }), "bad");
    assert.equal(lineTone("report-accepted"), "muted");
  });

  it("gives every tone a different colour in each theme", () => {
    // One colour in both themes is one colour unreadable in one of them,
    // which is the whole reason there are two palettes.
    for (const tone of ["milestone", "good", "warn", "bad", "muted"] as const) {
      assert.notEqual(TONES.dark[tone], TONES.light[tone]);
    }
  });
});

describe("a runner's colour on a page", () => {
  it("turns a foreground escape into a span and closes it on reset", () => {
    const html = ansiToHtml(`${ESC}[31mfailed${ESC}[0m ok`);
    assert.match(html, /<span style="color:#cd3131">failed<\/span> ok/);
  });

  it("escapes the text it carries, so a log cannot write markup into the page", () => {
    const html = ansiToHtml('<script>alert("x")</script> & more');
    assert.ok(!html.includes("<script>"), html);
    assert.match(html, /&lt;script&gt;/);
    assert.match(html, /&amp; more/);
  });

  it("drops what instructs a terminal and keeps what colours it", () => {
    // A cursor move means nothing on a page; printed raw it would be
    // mojibake in the middle of the one line the reader came for.
    const html = ansiToHtml(`${ESC}[2Kclean${ESC}]0;a title\u0007 line`);
    assert.equal(html, "clean line");
  });

  it("reads a 256-colour and a true-colour foreground", () => {
    assert.match(ansiToHtml(`${ESC}[38;5;196mred`), /color:rgb\(255,0,0\)/);
    assert.match(ansiToHtml(`${ESC}[38;2;1;2;3mx`), /color:rgb\(1,2,3\)/);
  });
});

describe("one session's transcript", () => {
  it("is a self-contained page: no script, no network, both palettes, and a stamp", () => {
    const html = render(repoWithASession());
    assert.match(html, /^<!doctype html>/);
    assert.ok(!/<script/i.test(html), "a transcript must run nothing");
    assert.ok(!/https?:\/\//.test(html), "a transcript must fetch nothing");
    assert.match(html, /@media \(prefers-color-scheme: dark\)/);
    assert.match(html, new RegExp(TONES.light.good));
    assert.match(html, new RegExp(TONES.dark.good));
    // Who made it, from what, and when -- so a reader knows what they hold.
    assert.match(html, /dabbler-ai-router \d+\.\d+\.\d+/);
    assert.match(html, new RegExp(HEAD));
    assert.match(html, /2026-10-16T10:00:00Z/);
  });

  it("quotes the framework's own lines and paints them by the shared grammar", () => {
    const html = render(repoWithASession());
    assert.match(html, /<span class="milestone">phase<\/span>/);
    assert.match(html, /<span class="good">VERIFIED<\/span>/);
    // The clock the terminal prints, not the full instant the row carries.
    assert.match(html, /<span class="at">\[\d\d:\d\d:\d\d\]<\/span>/);
  });

  it("carries the rounds, this session's test runs, and no other session's", () => {
    const html = render(repoWithASession());
    assert.match(html, /gpt-5\.6-sol/);
    assert.match(html, /node scripts\/suite\.mjs container/);
    assert.ok(!html.includes("somebody else&#39;s run"), "another session's run leaked in");
    assert.ok(!html.includes("somebody else's run"), "another session's run leaked in");
    assert.match(html, /events<\/code>/);
  });

  it("says what a session left none of rather than quietly omitting it", () => {
    // A session with no verification round and a session whose ledger is
    // gone look identical from outside. An omission tells the reader the
    // first when it might be the second.
    const html = render(tempDir("transcript-bare-"));
    assert.match(html, /This session left no/);
    assert.match(html, /run record/);
    assert.match(html, /verification round/);
  });

  it("carries a failed job's bytes by default and a passing job's only on request", () => {
    const root = repoWithASession();
    write(jobLogPath(root, 5, "close"), "it refused, and here is why\n");
    write(jobStatusPath(root, 5, "close"), JSON.stringify({ exit: 1 }));
    write(jobLogPath(root, 5, "run of record"), "ten thousand green lines\n");
    write(jobStatusPath(root, 5, "run of record"), JSON.stringify({ exit: 0 }));
    write(jobLogPath(root, 5, "publish"), "");
    write(jobStatusPath(root, 5, "publish"), JSON.stringify({ exit: 1 }));

    const outline = render(root);
    assert.match(outline, /it refused, and here is why/);
    assert.ok(!outline.includes("ten thousand green lines"), "a green run is megabytes saying so");
    // A job left out says so and how to get it; an empty log is not "left out".
    assert.match(outline, /passed -- output not carried; dabbler transcript --full carries it/);
    assert.match(outline, /publish<\/strong> exit .*\(no output\)/);

    const full = render(root, { jobs: "all" });
    assert.match(full, /ten thousand green lines/);
  });

  it("scrubs a provider key out of a job's bytes before it is written down", () => {
    // D278 found three keys in plaintext in a job log. A transcript is the
    // one record of a run that is COMMITTED, so it scrubs before it writes.
    const root = repoWithASession();
    const key = "sk-ant-notarealkey-0123456789abcdef";
    write(jobLogPath(root, 5, "close"), `authorization: Bearer ${key}\n`);
    write(jobStatusPath(root, 5, "close"), JSON.stringify({ exit: 1 }));

    const previous = process.env["DABBLER_ANTHROPIC_API_KEY"];
    process.env["DABBLER_ANTHROPIC_API_KEY"] = key;
    try {
      const html = render(root);
      assert.ok(!html.includes(key), "a provider key reached the page");
      assert.match(html, /authorization: Bearer/);
    } finally {
      if (previous === undefined) delete process.env["DABBLER_ANTHROPIC_API_KEY"];
      else process.env["DABBLER_ANTHROPIC_API_KEY"] = previous;
    }
  });

  it("lists what a round found, in recorded order, scrubbed of keys", () => {
    // A count says there were issues; only the descriptions say what they were.
    const root = repoWithASession();
    const key = "sk-ant-notarealkey-fedcba9876543210";
    write(
      roundsPath(root, 5),
      `${JSON.stringify({
        round: 1, phase: "full", verdict: "ISSUES_FOUND", blocking: true,
        findings: [
          { severity: "major", blocking: true, description: "the close <skips> the gate" },
          { severity: "minor", blocking: false, description: `a key leaked: ${key}` },
        ],
        reviewer_model: "gpt-5.6-sol", reviewer_provider: "openai", transport: "api",
        completion_tree: "abcdef1234567", recorded_at: "2026-10-16T09:30:00-04:00",
      })}\n`,
    );

    const previous = process.env["DABBLER_ANTHROPIC_API_KEY"];
    process.env["DABBLER_ANTHROPIC_API_KEY"] = key;
    try {
      const html = render(root);
      assert.match(html, /Round 1 found/);
      assert.match(html, /major<\/strong> <span class="bad">blocking<\/span> the close &lt;skips&gt; the gate/);
      assert.match(html, /minor<\/strong> a key leaked:/);
      assert.ok(html.indexOf("major<") < html.indexOf("minor<"), "findings out of recorded order");
      assert.ok(!html.includes(key), "a provider key reached the page");
    } finally {
      if (previous === undefined) delete process.env["DABBLER_ANTHROPIC_API_KEY"];
      else process.env["DABBLER_ANTHROPIC_API_KEY"] = previous;
    }
  });

  it("shows the stop where there is one", () => {
    const root = repoWithASession();
    writeRun(root, 5, {
      schema_version: 1, session_number: 5, engine: "cli", phase: "close", seq: 4,
      invocations: 0, max_invocations: 24, accepted_steps: [], baseline_tree: null,
      stop: { kind: "close", reason: "the close refused: a gate was red", at: "2026-10-16T09:50:00-04:00" },
      started_at: "2026-10-16T09:00:00-04:00", updated_at: "2026-10-16T09:50:00-04:00",
    });
    const html = render(root);
    assert.match(html, /class="stop"/);
    assert.match(html, /the close refused: a gate was red/);
  });
});

describe("the arguments `dabbler transcript` takes", () => {
  it("takes one session as a range of one, and a range as itself", () => {
    assert.deepEqual(parseTranscriptArgs(["--from", "7"]), {
      from: 7, to: 7, jobs: "failed", out: undefined, commit: false, sessionsDir: undefined,
    });
    const range = parseTranscriptArgs(["--from", "7", "--to", "9", "--full", "--commit"]);
    assert.deepEqual(range, {
      from: 7, to: 9, jobs: "all", out: undefined, commit: true, sessionsDir: undefined,
    });
  });

  it("refuses a range that runs backwards rather than rendering nothing", () => {
    // Rendering nothing exits zero and prints a blank, which reads as
    // success to the person who mistyped the pair.
    assert.match(String(parseTranscriptArgs(["--from", "9", "--to", "7"])), /before --from 9/);
  });

  it("refuses a missing or unreadable session number, and an unknown flag", () => {
    assert.match(String(parseTranscriptArgs([])), /--from names the first session/);
    assert.match(String(parseTranscriptArgs(["--from", "zero"])), /takes a session number/);
    assert.match(String(parseTranscriptArgs(["--from", "0"])), /takes a session number/);
    assert.match(String(parseTranscriptArgs(["--from", "1", "--out"])), /takes a path/);
    assert.match(String(parseTranscriptArgs(["--from", "1", "--deep"])), /unrecognized/);
  });
});

describe("the verb over records on disk", () => {
  it("writes one page per session in the range, into the default directory", async () => {
    const root = repoWithASession();
    const restore = gitAnswers([
      [["rev-parse", "--show-toplevel"], { stdout: root }],
      [["rev-parse", "HEAD"], { stdout: HEAD }],
    ]);
    try {
      const run = await capture(() =>
        transcriptVerb(["--from", "5", "--to", "6", "--sessions-dir", join(root, "docs", "sessions")]),
      );
      assert.equal(run.value, 0);
      for (const session of ["005", "006"]) {
        const path = join(root, TRANSCRIPTS_DIRNAME, `session-${session}.html`);
        assert.ok(existsSync(path), `session ${session} has no page`);
      }
      assert.match(run.stdout, /session 5 -> /);
    } finally {
      restore();
    }
  });

  it("leaves a page that already exists exactly as it is, and says so", async () => {
    // A page on disk was rendered against a tree that is no longer HEAD and
    // is stamped with that tree. Replacing it quietly would describe one
    // session under another session's stamp.
    const root = repoWithASession();
    const out = join(root, "elsewhere");
    const path = join(out, "session-005.html");
    write(path, "<!doctype html><p>the one that was there</p>");
    const restore = gitAnswers([
      [["rev-parse", "--show-toplevel"], { stdout: root }],
      [["rev-parse", "HEAD"], { stdout: HEAD }],
    ]);
    try {
      const run = await capture(() =>
        transcriptVerb([
          "--from", "5", "--out", out, "--sessions-dir", join(root, "docs", "sessions"),
        ]),
      );
      assert.equal(run.value, 0);
      assert.match(readFileSync(path, "utf8"), /the one that was there/);
      assert.match(run.stdout, /already has one/);
      assert.match(run.stdout, /nothing written/);
    } finally {
      restore();
    }
  });
});
