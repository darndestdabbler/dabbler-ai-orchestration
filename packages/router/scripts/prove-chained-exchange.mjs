#!/usr/bin/env node
// The chained exchange, proved on the built router.
//
//   node packages/router/scripts/prove-chained-exchange.mjs [--keep] [--json <file>]
//
// One whole session in a disposable repository with a local bare remote,
// driven by a fake engine that knows nothing but what stdout tells it: the
// initial `session next`, then each instruction's own `answer_command`. While
// a step's long check runs it interrupts once; while the run of record runs it
// kills the chained process, whose answer is durable by then, and runs the
// exact command again. It exits non-zero unless every stdout was one JSON
// instruction, the interruption reached the next instruction, and the record
// shows one accepted answer, one run of record, one land commit and one close
// commit on the remote.
//
// Plain JavaScript: it proves the BUILT bundle, so it needs nothing the
// bundle does not.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROUTER = resolve(HERE, "..", "dist", "dabbler.cjs");
const KEEP = process.argv.includes("--keep");
const JSON_OUT = process.argv.includes("--json") ? process.argv[process.argv.indexOf("--json") + 1] : null;
const LONG_CHECK_SECONDS = 8;
const SUITE_SECONDS = 20;
const CALL_TIMEOUT_MS = 240_000;

if (!existsSync(ROUTER)) {
  process.stderr.write(`prove-chained-exchange: ${ROUTER} is not built; run \`npm run build -w dabbler-ai-router\` first\n`);
  process.exit(2);
}

const scratch = mkdtempSync(join(tmpdir(), "chained-proof-"));
const repo = join(scratch, "repo");
const remote = join(scratch, "origin.git");
const sessionsDir = join(repo, "docs", "sessions");
const suiteRuns = join(scratch, "suite-runs.log");
const findings = [];
const transcript = [];
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const hold = (what, ok, detail) => {
  findings.push({ what, ok: Boolean(ok), detail });
  process.stderr.write(`${ok ? "ok  " : "FAIL"} ${what} -- ${detail}\n`);
};

// --- the repository ---------------------------------------------------------------
function seed(root, files) {
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    writeFileSync(join(root, name), text, "utf8");
  }
}
function git(cwd, ...args) {
  const done = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (done.status !== 0) throw new Error(`git ${args.join(" ")}: ${done.stderr}`);
  return done.stdout.trim();
}

seed(repo, {
  "docs/sessions/session-plan.md":
    "### Session 1 of 2: The widget\n1. Register.\n2. Make `widget()` return 2, and say so in the notes.\n3. Verify; close.\n\n" +
    "### Session 2 of 2: Later\n1. Polish.\n",
  "dabbler.yaml": "schema_version: 1\n",
  "src/widget.py": "def widget():\n    return 1\n",
  "tests/test_widget.py": "def test_widget():\n    assert True\n",
  // The suite: long enough to be killed under, and it writes down every run it finishes.
  "tests/run.mjs":
    "import { appendFileSync } from 'node:fs';\n" +
    `await new Promise((done) => setTimeout(done, ${SUITE_SECONDS * 1000}));\n` +
    `appendFileSync(${JSON.stringify(suiteRuns)}, new Date().toISOString() + '\\n');\n`,
  ".gitignore": ".dabbler/\n",
});
const responses = join(scratch, "responses");
seed(responses, { "01.md": "VERIFIED\n\nThe widget returns 2 and the notes say so.\n" });
const provider = { rate_limit: { requests_per_minute: 1000, tokens_per_minute: 1000000 }, timeout_seconds: 30, retry: { max_retries: 1, backoff_base_seconds: 0 } };
const configPath = join(scratch, "router-config.yaml");
writeFileSync(
  configPath,
  JSON.stringify({
    providers: {
      anthropic: { api_key_env: "TEST_ANTHROPIC_KEY", base_url: "https://fake.anthropic.test/v1/messages", ...provider },
      google: { api_key_env: "TEST_GOOGLE_KEY", base_url: "https://fake.google.test/v1beta", ...provider },
      openai: { api_key_env: "TEST_OPENAI_KEY", base_url: "https://fake.openai.test/v1", ...provider },
    },
    roles: { generator: { prefer: ["g-flash", "g-pro", "a-opus"] }, reviewer: { prefer: ["o-gpt", "a-sonnet"] } },
    escalation: {
      enabled: true,
      max_escalations: 2,
      triggers: { empty_response: true, max_tokens_hit: true, min_output_tokens: 30, refusal_detection: true },
      refusal_phrases: ["i can't help with", "i'm unable to"],
    },
    provider_defaults: {
      anthropic: { max_context_tokens: 200000, max_output_tokens: 32000 },
      google: { max_context_tokens: 1000000, max_output_tokens: 65536 },
      openai: { max_context_tokens: 272000, max_output_tokens: 32000 },
    },
    // No provider is called and no round is invented: the round's answer is a file.
    transports: { offline: { responses_dir: responses } },
    transport: { profile: "offline" },
    metrics: { enabled: true },
    testing: { suites: [{ name: "unit", command: "node tests/run.mjs", expensive: true, covers: ["src/", "tests/"] }] },
  }),
  "utf8",
);

git(scratch, "init", "-q", "--bare", remote);
git(repo, "init", "-q", "-b", "main");
git(repo, "config", "user.email", "proof@example.test");
git(repo, "config", "user.name", "Chained proof");
git(repo, "add", "-A");
git(repo, "commit", "-q", "-m", "A widget that returns 1");
git(repo, "remote", "add", "origin", remote);
git(repo, "push", "-q", "-u", "origin", "main");

// --- the router, as an engine's tool would run it ------------------------------------
const env = {
  ...process.env,
  AI_ROUTER_CONFIG: configPath,
  TEST_ANTHROPIC_KEY: "test-key",
  TEST_GOOGLE_KEY: "test-key",
  TEST_OPENAI_KEY: "test-key",
};

/** Start one router call; `exited` resolves with its code and both streams. */
function call(args) {
  const child = spawn(process.execPath, [ROUTER, ...args], { cwd: repo, env, windowsHide: true });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => (stdout += chunk));
  child.stderr.on("data", (chunk) => (stderr += chunk));
  const timer = setTimeout(() => child.kill(), CALL_TIMEOUT_MS);
  const exited = new Promise((done) =>
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      done({ code, signal, stdout, stderr });
    }),
  );
  return { child, exited };
}

/** The one instruction a call printed. Anything else on stdout fails the proof. */
function instructionOf(label, result) {
  let parsed = null;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    // Reported below.
  }
  const one = parsed !== null && typeof parsed === "object" && typeof parsed.kind === "string";
  hold(`${label}: stdout is one JSON instruction`, one, one ? `kind=${parsed.kind} seq=${parsed.seq} exit=${result.code}` : `exit=${result.code} stdout=${JSON.stringify(result.stdout.slice(0, 200))}`);
  transcript.push({ call: label, exit: result.code, kind: parsed?.kind ?? null, seq: parsed?.seq ?? null, step: parsed?.step_id ?? null, reasons: parsed?.reasons ?? null });
  return one ? parsed : null;
}

/** An `answer_command` as argv: the engine runs what it was given, with its own words where the command leaves room. */
function answerArgv(command, fill) {
  const filled = command
    .replace(/<path to the JSON you wrote>/, fill.file ?? "")
    .replace(/ \[--files <[^>]*>\]/, "")
    .replace(/"<one line>"/, JSON.stringify(fill.notes ?? ""))
    .replace(/ \[--tests "<[^>]*>"\]/, "");
  const argv = filled.match(/"[^"]*"|\S+/g).map((part) => part.replace(/^"|"$/g, ""));
  if (argv[0] !== "dabbler") throw new Error(`an answer_command that is not dabbler's: ${command}`);
  return argv.slice(1);
}

const readRun = () => JSON.parse(readFileSync(join(repo, ".dabbler", "runs", "s1", "driver", "run.json"), "utf8"));
async function until(what, test, seconds) {
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    try {
      const found = test();
      if (found) return found;
    } catch {
      // A record caught mid-write is read again.
    }
    await sleep(200);
  }
  throw new Error(`never happened within ${seconds}s: ${what}`);
}

let failed = null;
try {
  const started = await call(["session", "start", "--sessions-dir", sessionsDir, "--engine", "claude-code", "--provider", "anthropic"]).exited;
  hold("the session registers", started.code === 0, `exit ${started.code}`);
  hold("and says what moves it: one `session next`", /Next: the AI runs `dabbler session next/.test(started.stdout), started.stdout.trim().split("\n").pop());

  // 1. The one request.
  const plan = instructionOf("session next", await call(["session", "next", "--sessions-dir", sessionsDir]).exited);
  hold("the plan's answer_command chains", / --next /.test(plan.answer_command), plan.answer_command);

  // 2. The plan, answered in one chained command.
  const node = process.execPath;
  const planFile = join(scratch, "plan.json");
  writeFileSync(
    planFile,
    JSON.stringify({
      task: "Make widget() return 2, and say so in the notes.",
      hold_release: "the proof ships nothing",
      non_goals: ["Anything the two steps do not name."],
      steps: [
        {
          id: "widget",
          ask: "Make widget() return 2.",
          files: ["src/widget.py"],
          // A long check: the window the person speaks in.
          checks: [{ argv: [node, "-e", `setTimeout(() => process.exit(require('fs').readFileSync('src/widget.py','utf8').includes('return 2') ? 0 : 1), ${LONG_CHECK_SECONDS * 1000})`] }],
        },
        {
          id: "notes",
          ask: "Say in NOTES.md what widget() returns.",
          files: ["NOTES.md"],
          checks: [{ argv: [node, "-e", "process.exit(require('fs').existsSync('NOTES.md') ? 0 : 1)"] }],
        },
      ],
    }),
    "utf8",
  );
  const first = instructionOf("answer 1 (the plan)", await call(answerArgv(plan.answer_command, { file: planFile })).exited);
  hold("the plan's answer returns the first step", first.kind === "step" && first.step_id === "widget", `${first.kind} ${first.step_id}`);

  // 3. The first step; the person speaks while its long check runs.
  writeFileSync(join(repo, "src", "widget.py"), "def widget():\n    return 2\n", "utf8");
  const widget = call(answerArgv(first.answer_command, { notes: "widget returns 2" }));
  await until("the report for the first step is on disk", () => JSON.parse(readFileSync(join(repo, ".dabbler", "runs", "s1", "driver", "report.json"), "utf8")).seq === first.seq, 30);
  await sleep(1500);
  const said = "keep the notes to one line";
  const interrupted = await call(["session", "interrupt", "--sessions-dir", sessionsDir, "--reason", said]).exited;
  hold("the interruption is taken while the check runs", interrupted.code === 0, (interrupted.stdout + interrupted.stderr).trim().split("\n").pop());
  const second = instructionOf("answer 2 (step widget, interrupted)", await widget.exited);
  hold(
    "the returned instruction carries the interruption first among its reasons",
    second.step_id === "notes" && Array.isArray(second.reasons) && second.reasons[0].includes(said),
    JSON.stringify(second.reasons),
  );

  // 4. The last step; its chained process is killed once the answer is durable
  //    and the run of record is running, and the exact command is run again.
  writeFileSync(join(repo, "NOTES.md"), "widget() returns 2.\n", "utf8");
  const lastArgv = answerArgv(second.answer_command, { notes: "one line, as asked" });
  const doomed = call(lastArgv);
  const job = await until("the run of record is running", () => {
    const run = readRun();
    return run.accepted_steps.includes("notes") && run.job && /^run of record/.test(run.job.name) ? run.job : null;
  }, 180);
  doomed.child.kill();
  const died = await doomed.exited;
  hold("the chained process was killed mid-job, having printed nothing", died.stdout === "" && died.code !== 0, `code=${died.code} signal=${died.signal} while '${job.name}' (pid ${job.pid}) ran`);
  transcript.push({ call: "answer 3 (step notes) KILLED", exit: died.code, signal: died.signal, kind: null, seq: null, during: job.name });

  const repeated = await call(lastArgv).exited;
  const done = instructionOf("answer 3 repeated (the exact command)", repeated);
  hold("the repeated command carries the session to done", done.kind === "done", done.ask ?? "");

  // 5. What the record shows.
  const acceptances = (text) => (text.match(/report-accepted .*step=notes/g) ?? []).length;
  hold(
    "the answer was accepted once: by the process that was killed, and not again by the repeat",
    acceptances(died.stderr) === 1 && acceptances(repeated.stderr) === 0,
    `${acceptances(died.stderr)} before the kill, ${acceptances(repeated.stderr)} in the repeat`,
  );
  const runs = existsSync(suiteRuns) ? readFileSync(suiteRuns, "utf8").trim().split("\n").filter(Boolean) : [];
  hold("the run of record completed once", runs.length === 1, `${runs.length} completed suite run(s): ${runs.join(", ")}`);
  const jobs = readdirSync(join(repo, ".dabbler", "runs", "s1", "driver", "jobs")).filter((name) => name.endsWith(".status.json"));
  hold("one job per framework phase, none started twice", new Set(jobs).size === jobs.length, jobs.join(", "));
  const remoteLog = git(remote, "log", "--format=%s", "main").split("\n");
  const lands = remoteLog.filter((subject) => /^Session 0*1\b/.test(subject));
  const closes = remoteLog.filter((subject) => /^Close session 0*1\b/.test(subject));
  hold("one land commit and one close commit, both on the remote", lands.length === 1 && closes.length === 1, remoteLog.join(" | "));
  hold("the remote is where the checkout is", git(repo, "rev-parse", "HEAD") === git(remote, "rev-parse", "main"), `${git(repo, "rev-parse", "--short", "HEAD")} == ${git(remote, "rev-parse", "--short", "main")}`);
  const ledger = JSON.parse(readFileSync(join(sessionsDir, "sessions.json"), "utf8")).sessions.find((row) => row.number === 1);
  hold("the session closed VERIFIED", ledger.status === "complete" && ledger.verificationVerdict === "VERIFIED", `${ledger.status} ${ledger.verificationVerdict}`);
  const after = instructionOf("answer 3 repeated once more, after the close", await call(lastArgv).exited);
  hold(
    "a repeat after the close is told that session's own done, names no `session start`, and nothing moves",
    after.kind === "done" && after.session_number === 1 && !/session start/.test(after.ask ?? "") && git(remote, "log", "--format=%s", "main").split("\n").length === remoteLog.length,
    after.ask ?? "",
  );
} catch (error) {
  failed = error;
  process.stderr.write(`prove-chained-exchange: ${error instanceof Error ? error.stack : String(error)}\n`);
}

const ok = failed === null && findings.every((finding) => finding.ok);
const summary = {
  ok,
  router: spawnSync(process.execPath, [ROUTER, "version"], { encoding: "utf8" }).stdout.trim().split("\n")[0],
  node: process.version,
  at: new Date().toISOString(),
  scratch,
  transcript,
  findings,
  remoteLog: existsSync(remote) ? spawnSync("git", ["log", "--format=%h %s", "main"], { cwd: remote, encoding: "utf8" }).stdout.trim().split("\n") : [],
  remoteRefs: existsSync(remote) ? spawnSync("git", ["for-each-ref", "--format=%(refname) %(objectname:short)"], { cwd: remote, encoding: "utf8" }).stdout.trim().split("\n") : [],
};
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(summary, null, 2) + "\n", "utf8");
process.stdout.write(`${JSON.stringify({ ok, held: findings.filter((f) => f.ok).length, of: findings.length, scratch: KEEP ? scratch : null })}\n`);
if (!KEEP) {
  try {
    rmSync(scratch, { recursive: true, force: true });
  } catch {
    // A job's log still open on Windows: the folder is under the system temp and is left to it.
  }
}
process.exitCode = ok ? 0 : 1;
