// The transcript: the tone grammar both renderers share, and the page one
// session's records become.
//
// What is asserted is what a reader would see -- that a verdict is green
// wherever it appears, that a runner's colour survives into the page, that
// a key never does, and that a session which left little behind SAYS so
// rather than rendering a tidy page about nothing.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";

import { transcriptVerb, parseTranscriptArgs } from "../src/cli/transcript.ts";
import { appendDriverEvent, driverDir, writeRun, writeWorkPlan } from "../src/driver.ts";
import { jobLogPath, jobStatusPath } from "../src/jobs.ts";
import { roundsPath } from "../src/ledger.ts";
import { capture } from "../src/output.ts";
import { TRANSCRIPTS_DIRNAME } from "../src/journal.ts";
import {
  TONES,
  ansiToHtml,
  fieldTone,
  humanizeStepKey,
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

function render(
  root: string,
  options: Parameters<typeof renderSessionTranscript>[2] = {},
  origin: { stdout?: string; code?: number } = { code: 2 },
): string {
  const restore = gitAnswers([
    [["rev-parse", "HEAD"], { stdout: HEAD }],
    [["remote", "get-url", "origin"], origin],
  ]);
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
  });

  it("lays out the work plan: task, one row per step with its ask, files, checks and acceptance, then non-goals", () => {
    const root = repoWithASession();
    writeWorkPlan(root, 5, {
      schema_version: 1, session_number: 5, task: "Render the **plan**.", recorded_at: "2026-10-16T09:01:00-04:00",
      non_goals: ["Any script on the page"],
      steps: [
        { id: "events", ask: "Write `events.jsonl`.", files: ["src/a.ts", "src/a.test.ts"], checks: [{ argv: ["node", "--test", "a"] }] },
        { id: "unused-step", ask: "Never reached.", files: ["src/z.ts"], checks: [{ argv: ["npm", "test"] }] },
      ],
    });
    const html = render(root);
    const plan = html.slice(html.indexOf("<h2>Work Plan</h2>"), html.indexOf("<h2>", html.indexOf("<h2>Work Plan</h2>") + 1));
    assert.match(plan, /<p>Render the <strong>plan<\/strong>\.<\/p>/);
    assert.match(
      plan,
      /<td>Events<\/td><td><p>Write <code>events\.jsonl<\/code>\.<\/p><\/td><td><span class="mono">src\/a\.ts<\/span><br><span class="mono">src\/a\.test\.ts<\/span><\/td><td><code>node --test a<\/code><\/td><td>yes<\/td>/,
    );
    assert.match(plan, /<td>Unused step<\/td><td><p>Never reached\.<\/p><\/td>.*<code>npm test<\/code><\/td><td>no<\/td>/);
    assert.match(plan, /<ul><li>Any script on the page<\/li><\/ul>/);
    assert.ok(!html.includes("Steps accepted"), "acceptance is the table's last column");
    assert.ok(!html.includes("<li>a work plan</li>"), "a session with a plan is not missing one");
  });

  it("humanizeStepKey turns kebab and snake case into a sentence word", () => {
    assert.equal(humanizeStepKey("verify-changes"), "Verify changes");
    assert.equal(humanizeStepKey("run_tests"), "Run tests");
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

  it("counts a run's tests from its own log, carried or not, and leaves a log with no summary blank", () => {
    const root = repoWithASession();
    const job = "run of record: typescript";
    // The row is stamped by the child, the end by the runner that reaped it:
    // the latest row reads the log even recorded 2 ms after the job's end.
    write(jobStatusPath(root, 5, job), JSON.stringify({
      exit: 0, started_at: "2026-10-16T13:34:00.000Z", ended_at: "2026-10-16T13:34:59.998Z",
    }));
    write(jobLogPath(root, 5, job), "1..392\n# tests 1344\n# pass 1329\n# fail 0\n# cancelled 0\n# skipped 15\n");
    appendFileSync(join(root, ".dabbler", "runs", "test-runs.jsonl"), `${JSON.stringify({
      suite: "typescript", command: "node scripts/suite.mjs container", outcome: "failed",
      surfaceDigest: "d1", recordedAt: "2026-10-16T09:34:30-04:00", stage: "final-full",
      sessionNumber: 5, durationSeconds: 7,
    })}\n`);
    const counted = render(root);
    assert.ok(!counted.includes("# pass 1329"), "a passing run's bytes are not carried");
    assert.match(counted, /41s<\/td><td>1329<\/td><td>0<\/td><td>15<\/td>/);
    assert.match(counted, /7s<\/td><td><\/td><td><\/td><td><\/td>/, "an earlier row borrows the later numbers");

    write(jobLogPath(root, 5, job), "error TS2304: Cannot find name 'x'.\n");
    assert.match(render(root), /41s<\/td><td><\/td><td><\/td><td><\/td>/);
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

  it("answers each finding in its round's row, opening only a round still owed a fix", () => {
    // A count says there were issues; only the subtable says what became of them.
    const root = repoWithASession();
    const key = "sk-ant-notarealkey-fedcba9876543210";
    const round = (number: number, verdict: string, findings: unknown[]): string =>
      JSON.stringify({
        round: number, phase: "full", verdict, blocking: verdict === "ISSUES_FOUND", findings,
        reviewer_model: "gpt-5.6-sol", reviewer_provider: "openai", transport: "api",
        completion_tree: "abcdef1234567", recorded_at: "2026-10-16T09:30:00-04:00",
        ...(number > 1 ? { previous_tree: "abcdef1234567" } : {}),
      });
    write(
      roundsPath(root, 5),
      `${round(1, "ISSUES_FOUND", [
        { severity: "major", blocking: true, description: "the close <skips> the gate" },
        { severity: "major", blocking: true, description: `a key leaked: ${key}` },
      ])}\n${round(2, "VERIFIED", [{ severity: "minor", blocking: false, description: "a word" }])}\n`,
    );
    appendDriverEvent(root, 5, "dispositions-accepted", {
      round: 1, fix: [0], reject: [1],
      answers: [{ finding: 0, action: "fix" }, { finding: 1, action: "reject", reason: "out of scope" }],
    }, "dispositions");
    appendDriverEvent(root, 5, "report-accepted", {
      seq: 3, step: "fix-round-1", files: ["src/close.ts"], notes: "the close runs the gate",
    }, "fix");

    const previous = process.env["DABBLER_ANTHROPIC_API_KEY"];
    process.env["DABBLER_ANTHROPIC_API_KEY"] = key;
    try {
      const html = render(root);
      assert.match(html, /<details open><summary>2 findings<\/summary>/);
      assert.match(html, /<details><summary>1 finding<\/summary>/);
      assert.match(html, /<span class="bad">blocking<\/span><\/td><td>the close &lt;skips&gt; the gate/);
      assert.match(html, /fixed — the close runs the gate — \(src\/close\.ts\)/);
      assert.match(html, /disputed — out of scope/);
      assert.match(html, /a word<\/td><td>not answered/);
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

  it("puts the landed commit over the work plan and each step's reported files in its row, linked only where the host is known", () => {
    // A reader who wants the diff had to find the commit in the change log
    // and open it by hand. The hash stays in text: a link lasts as long as
    // its host, the hash as long as the clone.
    const root = repoWithASession();
    const step = (id: string, files: string[]) => ({ id, ask: id, files, checks: [{ argv: ["node", "-v"] }] });
    writeWorkPlan(root, 5, {
      schema_version: 1, session_number: 5, task: "t", recorded_at: "2026-10-16T09:01:00-04:00",
      steps: [step("events", ["src/declared.ts"]), step("renderer", ["src/b.ts"])],
    });
    appendDriverEvent(root, 5, "report-accepted", { step: "events", files: ["src/a.ts"] }, "work");
    appendDriverEvent(root, 5, "report-accepted", { step: "renderer", files: ["src/b.ts", "test/b.test.ts"] }, "work");
    appendDriverEvent(root, 5, "landed", { commit: HEAD }, "land");

    const linked = render(root, {}, { stdout: "https://github.com/owner/repo.git" });
    assert.ok(!linked.includes("<h2>Files</h2>"), "the files are the work plan's");
    assert.match(linked, new RegExp(`<p>Landed <a href="https://github\\.com/owner/repo/commit/${HEAD}"><code>${HEAD}</code></a>\\.</p>\\n<table>`));
    const diff = createHash("sha256").update("src/a.ts").digest("hex");
    assert.ok(
      linked.includes(`<td>Events</td><td><p>events</p></td><td><a href="https://github.com/owner/repo/commit/${HEAD}#diff-${diff}">`),
      "a GitHub file link opens that file's diff on the commit page",
    );
    assert.ok(!linked.includes("src/declared.ts"), "a step that reported shows what it reported");
    assert.match(linked, /<td>Renderer<\/td><td><p>renderer<\/p><\/td><td><a href="[^"]+"><span class="mono">src\/b\.ts<\/span><\/a><br><a href="[^"]+"><span class="mono">test\/b\.test\.ts/);
    assert.ok(!linked.includes("files each step declared"), "a session with an event log says nothing more");

    const plain = render(root, {}, { stdout: "https://example.org/somewhere/repo.git" });
    assert.match(plain, new RegExp(`Landed <code>${HEAD}</code>`));
    assert.match(plain, /test\/b\.test\.ts/);
    assert.ok(!/<a href/.test(plain), "an unknown host gets no link");
  });

  it("opens with the session's own section of the plan, formatted, and no other session's", () => {
    const root = repoWithASession();
    const sessionsDir = join(root, "docs", "sessions");
    write(
      join(sessionsDir, "session-plan.md"),
      "# Plan\n\n### Session 5 of 6: The renderer\n\n**Why.** Read `run.json` --\nand say so.\n\n" +
        "- one <b>item</b>\n- two\n\n### Session 6 of 6: Not this one\n\nLater work.\n",
    );
    const html = render(root, { sessionsDir });
    assert.match(html, /<h2>Session Plan<\/h2>\n<h3>Session 5 of 6: The renderer<\/h3>/);
    assert.match(html, /<p><strong>Why\.<\/strong> Read <code>run\.json<\/code> -- and say so\.<\/p>/);
    assert.match(html, /<ul><li>one &lt;b&gt;item&lt;\/b&gt;<\/li><li>two<\/li><\/ul>/);
    assert.ok(!html.includes("Later work"), "the next session's section leaked in");
    assert.ok(!html.includes("section of the session plan"), "a named session is not absent");
  });

  it("lists the plan section as absent for a session the plan does not name", () => {
    const root = repoWithASession();
    const sessionsDir = join(root, "docs", "sessions");
    write(join(sessionsDir, "session-plan.md"), "### Session 6 of 6: Another\n\nLater work.\n");
    const html = render(root, { sessionsDir });
    assert.match(html, /<li>its section of the session plan<\/li>/);
    assert.ok(!html.includes("Session Plan</h2>"), "no section for a session the plan does not name");
  });

  it("shows an older session's declared files under the receipt's commit where there is no event log", () => {
    // Every session recorded before 3.22.0 has no events.jsonl, and its
    // plan and gate receipt still say what each step declared and where it landed.
    const root = tempDir("transcript-");
    writeRun(root, 5, {
      schema_version: 1, session_number: 5, engine: "cli", phase: "close", seq: 4,
      invocations: 0, max_invocations: 24, accepted_steps: ["events", "renderer"],
      baseline_tree: null, stop: null,
      started_at: "2026-10-16T09:00:00-04:00", updated_at: "2026-10-16T09:40:00-04:00",
    });
    const step = (id: string, files: string[]) => ({ id, ask: id, files, checks: [{ argv: ["node", "-v"] }] });
    writeWorkPlan(root, 5, {
      schema_version: 1, session_number: 5, task: "t", recorded_at: "2026-10-16T09:01:00-04:00",
      steps: [step("events", ["src/a.ts"]), step("abandoned", ["src/gone.ts"]), step("renderer", ["src/b.ts"])],
    });
    write(join(driverDir(root, 5), "gate-receipt.json"), JSON.stringify({ landed_sha: HEAD }));

    const html = render(root, {}, { stdout: "https://github.com/owner/repo.git" });
    assert.match(
      html,
      new RegExp(`<p>Landed <a href="https://github\\.com/owner/repo/commit/${HEAD}"><code>${HEAD}</code></a>\\.</p>\\n<p>[^<]*files are what each step declared`),
    );
    assert.match(html, /<td>Events<\/td><td><p>events<\/p><\/td><td><a href="[^"]+#diff-[0-9a-f]{64}"><span class="mono">src\/a\.ts/);
    assert.match(html, /<td>Abandoned<\/td>.*src\/gone\.ts<\/span><\/a><\/td>.*<td>no<\/td>/);
    assert.ok(html.indexOf("src/a.ts") < html.indexOf("src/b.ts"), "files are in step order");
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
      [["remote"], { code: 2 }],
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
      [["remote"], { code: 2 }],
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
