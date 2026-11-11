// The stand-in framework, in two modes.
//
// Mailbox (the comparison control): post tasks to the AI's inbox on a schedule
// and time each reply.
//   node framework.mjs --schedule 30,90,150 [--deadline 900] [--run <name>]
//
// Exchange: no process lives between requests. A request reads the persisted
// state, does the deterministic work its answer caused, prints exactly one JSON
// instruction on stdout and exits.
//   node framework.mjs request --exchange <id> --answers 0    the first request
//   node post.mjs --exchange <id> --answers <seq>             every later one
//   node framework.mjs watch                                  the Dabbler-style terminal
// Progress goes to state/events.jsonl and never to stdout.
import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { basename, join } from "node:path";

const arg = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at > 0 ? process.argv[at + 1] : fallback;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- exchange mode ------------------------------------------------------------
const STATE = "state";
const STATE_FILE = join(STATE, "exchange.json");
const EVENTS = join(STATE, "events.jsonl");
const LOCK = join(STATE, "exchange.lock");
const LOGS = join(STATE, "logs");

const REFUSED_LIVE = 3;
const REFUSED_ANSWER = 4;

let current = { exchange: null, answers: null };
const event = (name, extra = {}) =>
  appendFileSync(
    EVENTS,
    JSON.stringify({ event: name, at: new Date().toISOString(), pid: process.pid, exchange: current.exchange, ...extra }) + "\n",
  );

const config = () => JSON.parse(readFileSync(join(STATE, "config.json"), "utf8"));
const load = () =>
  existsSync(STATE_FILE)
    ? JSON.parse(readFileSync(STATE_FILE, "utf8"))
    : { stage: 1, nextSeq: 1, owed: null, answers: {}, phases: {}, responses: {}, review: null, done: false };
/** Written whole and renamed into place: a killed process leaves the old state or the new one. */
const save = (state) => {
  const tmp = `${STATE_FILE}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2) + "\n");
  renameSync(tmp, STATE_FILE);
};

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** One live exchange at a time. A lock whose owner is dead is taken by renaming it: one taker wins. */
function acquire() {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(LOCK, "wx");
      writeFileSync(fd, JSON.stringify({ pid: process.pid, ...current, at: new Date().toISOString() }));
      closeSync(fd);
      return { ok: true };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
    let holder = null;
    try {
      holder = JSON.parse(readFileSync(LOCK, "utf8"));
    } catch {
      // Being written or already taken: whoever holds it is live.
    }
    if (!holder || alive(holder.pid)) return { ok: false, holder };
    try {
      renameSync(LOCK, `${LOCK}.stale-${holder.pid}-${process.pid}`);
      event("stale-lock-taken", { from: holder });
    } catch {
      return { ok: false, holder };
    }
  }
  return { ok: false, holder: null };
}

const STAGE_STEPS = { 1: ["build", "test", "review", "hold", "commit"], 2: ["build", "test", "hold", "commit"], 3: ["commit"] };

function run(step, seq, command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  mkdirSync(LOGS, { recursive: true });
  writeFileSync(join(LOGS, `seq${seq}-${step}-${process.pid}.log`), `${result.stdout ?? ""}\n--- stderr ---\n${result.stderr ?? ""}`);
  return { exit: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}
const git = (...args) => spawnSync("git", args, { encoding: "utf8", windowsHide: true });

const STEP = {
  build: (seq) => run("build", seq, process.execPath, [config().tsc, "-p", "."]),
  test: (seq) => run("test", seq, process.execPath, ["--test", "dist/test/**/*.test.js"]),
  /** One real reviewer call over the staged diff; it may not write, and it answers one prescribed line. */
  review: (seq, state) => {
    git("add", "-A");
    const diff = git("diff", "--cached").stdout;
    const prompt = [
      "You are reviewing one small diff in a disposable repository. Use no tools and write nothing.",
      'Check one thing only: does test/slugify.test.ts contain a test case whose input is the empty string ""?',
      "Reply with exactly one line and nothing else. Either:",
      "FINDING: slugify has no test for the empty string",
      "or:",
      "CLEAN",
      "",
      "The diff:",
      diff,
    ].join("\n");
    const { router, reviewer } = config();
    const result = run("review", seq, process.execPath, [router, "agent", "prompt", "--engine", reviewer, "--permissions", "deny", "--cwd", process.cwd(), prompt]);
    const text = result.stdout
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter((e) => e && e.kind === "text" && e.role === "agent")
      .map((e) => e.text)
      .join("");
    const verdict = /FINDING/i.test(text) ? "finding" : /CLEAN/i.test(text) ? "clean" : "unparsed";
    state.review = { verdict, text: text.trim().slice(0, 400), reviewer, diffBytes: diff.length };
    return { ...result, detail: { reviewer, verdict, text: state.review.text } };
  },
  /** Stands in for a long check, so the run has a window to talk, kill and duplicate in. */
  hold: async (seq, state, phase) => {
    const seconds = config().holdSeconds[String(phase.stage)] ?? 30;
    for (let waited = 0; waited < seconds; waited += 5) {
      await sleep(5000);
      event("progress", { seq, step: "hold", waited: Math.min(waited + 5, seconds), of: seconds });
    }
    return { exit: 0 };
  },
  /** A commit is made once: a message already in the log means an earlier process made it. */
  commit: (seq, state, phase) => {
    const message = `stage ${phase.stage} (answer ${seq})`;
    if (git("log", "--format=%s").stdout.split("\n").includes(message)) return { exit: 0, detail: { commit: "already-made" } };
    git("add", "-A");
    if (git("diff", "--cached", "--quiet").status === 0) return { exit: 0, detail: { commit: "nothing-to-commit" } };
    const made = git("commit", "-m", message);
    return { exit: made.status, stderr: made.stderr, detail: { commit: "made", sha: git("rev-parse", "--short", "HEAD").stdout.trim() } };
  },
};

const ASK = {
  1: [
    "Create src/slugify.ts exporting `slugify(text: string): string`: lowercase the text, replace every run of",
    "characters that are not a-z or 0-9 with one hyphen, and strip hyphens from both ends.",
    "Create test/slugify.test.ts with node:test and node:assert/strict holding exactly these three cases:",
    '"Hello World" -> "hello-world"; "  Already--Slugged  " -> "already-slugged"; "C# & .NET!" -> "c-net".',
    "Create src/index.ts re-exporting slugify, with a doc comment above the export saying what the package is for.",
    'The project is ES modules under NodeNext: import with the .js extension ("../src/slugify.js").',
    "Do not build, test or commit; the framework does. Then answer.",
  ].join(" "),
  2: (state) =>
    state.review?.verdict === "finding"
      ? `The reviewer (${state.review.reviewer}) found: "${state.review.text}". Add that test case to test/slugify.test.ts -- slugify("") returns "" -- and change src/slugify.ts only if the case needs it. Then answer.`
      : `The reviewer (${state.review?.reviewer}) returned clean. Add a one-line JSDoc comment above slugify in src/slugify.ts saying what it does. Then answer.`,
  3: "Write work/summary.txt holding one sentence that says what was built in this session. Then answer.",
};
const REQUIRED = { 1: ["src/slugify.ts", "src/index.ts", "test/slugify.test.ts"], 2: ["src/slugify.ts", "test/slugify.test.ts"], 3: ["work/summary.txt"] };

function instruction(state, kind, extra = {}) {
  const seq = state.nextSeq++;
  const id = `${config().run}-x${seq}`;
  const ask = typeof ASK[state.stage] === "function" ? ASK[state.stage](state) : ASK[state.stage];
  const made = {
    kind,
    seq,
    ask: kind === "rejection" ? `The framework's ${extra.failed} failed. Fix what reasons says, then answer. The work owed is still: ${ask}` : ask,
    ...(extra.reasons ? { reasons: extra.reasons } : {}),
    answer_command: `node post.mjs --exchange ${id} --answers ${seq}`,
    how: "Start answer_command as a background command and end your turn; its output is your next instruction.",
  };
  state.owed = made;
  return made;
}

function deliver(state, response) {
  state.responses[current.exchange] = response;
  save(state);
  event(response.kind === "done" ? "done-issued" : "instruction-issued", { seq: response.seq, kind: response.kind, answers: current.answers });
  process.stdout.write(JSON.stringify(response) + "\n");
  return 0;
}

export async function exchange({ exchangeId, answers }) {
  mkdirSync(STATE, { recursive: true });
  current = { exchange: exchangeId, answers };
  const lock = acquire();
  if (!lock.ok) {
    event("request-refused", { answers, reason: "another exchange is live", holder: lock.holder });
    process.stderr.write(
      `refused: another exchange (pid ${lock.holder?.pid ?? "unknown"}) is live for this session and will deliver the next instruction to whoever started it. Nothing was accepted and nothing ran. Start nothing.\n`,
    );
    return REFUSED_LIVE;
  }
  let code = 1;
  try {
    const state = load();
    const resumed = Boolean(state.answers[answers]) && !state.responses[exchangeId];
    event("exchange-started", { answers, resumed });

    // A response this request already produced is collected, never produced again.
    if (state.responses[exchangeId]) {
      event("response-recollected", { answers, seq: state.responses[exchangeId].seq });
      process.stdout.write(JSON.stringify(state.responses[exchangeId]) + "\n");
      return (code = 0);
    }
    if (answers === 0) {
      if (state.owed) {
        event("response-recollected", { answers, seq: state.owed.seq });
        process.stdout.write(JSON.stringify(state.owed) + "\n");
        return (code = 0);
      }
      return (code = deliver(state, instruction(state, "step")));
    }

    if (!state.answers[answers]) {
      const refuse = (reason) => {
        event("answer-refused", { answers, reason, owed: state.owed?.seq ?? null });
        process.stderr.write(`refused: ${reason}. Nothing was accepted; instruction ${state.owed?.seq ?? "none"} is still owed, with the answer_command it named.\n`);
        return (code = REFUSED_ANSWER);
      };
      if (state.done || !state.owed) return refuse("no instruction is owed an answer");
      if (state.owed.seq !== answers || `${config().run}-x${answers}` !== exchangeId) return refuse(`this answers ${answers} under ${exchangeId}, and the instruction owed is ${state.owed.seq}`);
      const missing = REQUIRED[state.stage].filter((file) => !existsSync(file));
      if (missing.length) return refuse(`the work is not there: ${missing.join(", ")} missing`);
      state.answers[answers] = { acceptedAt: new Date().toISOString(), exchange: exchangeId, pid: process.pid, stage: state.stage };
      state.phases[answers] = { stage: state.stage, steps: STAGE_STEPS[state.stage].map((name) => ({ name, status: "pending", attempts: 0 })) };
      save(state);
      event("answer-accepted", { seq: answers, stage: state.stage });
    }

    // The answer is durable from here: whatever runs below resumes from the record.
    const phase = state.phases[answers];
    for (const step of phase.steps) {
      if (step.status === "done") continue;
      step.status = "running";
      step.attempts += 1;
      save(state);
      event("step-started", { seq: answers, step: step.name, attempt: step.attempts });
      const started = Date.now();
      const result = await STEP[step.name](answers, state, phase);
      step.exit = result.exit;
      if (result.exit !== 0) {
        step.status = "failed";
        event("step-done", { seq: answers, step: step.name, exit: result.exit, ms: Date.now() - started, ...(result.detail ?? {}) });
        if (step.name === "review" || step.name === "commit") {
          // A reviewer that cannot be reached is a person's stop; nothing here pretends otherwise.
          const stop = { kind: "stop", seq: state.nextSeq++, ask: `The framework's ${step.name} could not run (exit ${result.exit}). Stop and tell the person.`, reasons: [(result.stderr ?? "").slice(-600)] };
          state.owed = null;
          return (code = deliver(state, stop));
        }
        const reasons = [`${step.name} exit ${result.exit}`, `${result.stdout}\n${result.stderr}`.trim().slice(-1500)];
        return (code = deliver(state, instruction(state, "rejection", { failed: step.name, reasons })));
      }
      step.status = "done";
      save(state);
      event("step-done", { seq: answers, step: step.name, exit: 0, ms: Date.now() - started, ...(result.detail ?? {}) });
    }

    if (phase.stage === 3) {
      state.done = true;
      state.owed = null;
      return (code = deliver(state, { kind: "done", seq: state.nextSeq++, ask: "The session is over. Stop: run nothing further." }));
    }
    state.stage = phase.stage + 1;
    return (code = deliver(state, instruction(state, "step")));
  } finally {
    rmSync(LOCK, { force: true });
    event("exchange-exited", { answers, code });
  }
}

// --- the Dabbler-style terminal: an observer over the persisted events ---------
const clock = (iso) => new Date(iso).toTimeString().slice(0, 8);
function line(e) {
  const who = e.exchange ? `[${e.exchange} pid ${e.pid}]` : `[pid ${e.pid}]`;
  const detail = Object.entries(e)
    .filter(([key]) => !["event", "at", "pid", "exchange", "holder", "from"].includes(key))
    .map(([key, value]) => `${key}=${typeof value === "string" ? value.replace(/\s+/g, " ").slice(0, 70) : JSON.stringify(value)}`)
    .join(" ");
  return `${clock(e.at)}  ${e.event.padEnd(20)} ${detail}\n${" ".repeat(10)}${who}`;
}
async function watch() {
  const parse = (text) => text.split("\n").filter(Boolean).map((row) => JSON.parse(row));
  const whole = existsSync(EVENTS) ? readFileSync(EVENTS, "utf8") : "";
  // Only whole lines: a writer may be halfway through the last one.
  const past = whole.slice(0, whole.lastIndexOf("\n") + 1);
  let read = Buffer.byteLength(past);
  const events = parse(past);
  process.stdout.write(`DABBLER-STYLE TERMINAL (observer, pid ${process.pid})\n`);
  for (const e of events) process.stdout.write(line(e) + "\n");
  const state = load();
  const running = Object.entries(state.phases).flatMap(([seq, phase]) => phase.steps.filter((s) => s.status === "running").map((s) => `${s.name} for answer ${seq}`));
  process.stdout.write(
    `-- reconstructed ${events.length} persisted events; stage ${state.stage}; ` +
      `${state.done ? "session done" : running.length ? `the framework owns the move (${running.join(", ")})` : state.owed ? `the author owes an answer to instruction ${state.owed.seq}` : "no request yet"} --\n`,
  );
  let ended = events.some((e) => e.event === "done-issued");
  while (!ended) {
    await sleep(500);
    if (!existsSync(EVENTS) || statSync(EVENTS).size <= read) continue;
    const all = readFileSync(EVENTS);
    const fresh = all.subarray(read).toString("utf8");
    const whole = fresh.slice(0, fresh.lastIndexOf("\n") + 1);
    read += Buffer.byteLength(whole);
    for (const e of parse(whole)) {
      process.stdout.write(line(e) + "\n");
      if (e.event === "exchange-exited" && load().done) ended = true;
    }
  }
  process.stdout.write("-- session done; the observer ends --\n");
}

// --- mailbox mode (the control) --------------------------------------------------
function mailbox() {
  const schedule = String(arg("--schedule", "30")).split(",").map(Number);
  const deadlineMs = Number(arg("--deadline", "900")) * 1000;
  const run = arg("--run", "run");
  const INBOX = join("mail", "to-ai");
  const REPLIES = join("mail", "to-framework");
  const LOG = join("mail", "framework-log.jsonl");
  mkdirSync(INBOX, { recursive: true });
  mkdirSync(REPLIES, { recursive: true });

  const log = (event, extra = {}) =>
    appendFileSync(LOG, JSON.stringify({ event, run, at: new Date().toISOString(), ...extra }) + "\n");

  const start = Date.now();
  const words = ["amber", "birch", "cobalt", "dune", "ember", "fjord", "garnet", "harbor", "indigo", "juniper"];
  const pending = new Map();
  log("started", { schedule });

  schedule.forEach((delay, index) => {
    setTimeout(() => {
      const id = `${run}-m${index + 1}`;
      const name = `${String(Date.now())}-${id}.json`;
      const word = words[index % words.length];
      const message = {
        id,
        from: "framework",
        at: new Date().toISOString(),
        task: `Create work/${id}.txt containing the single word ${word}, then reply with: node post.mjs ${id} done`,
      };
      writeFileSync(join(INBOX, name), JSON.stringify(message) + "\n");
      pending.set(id, { posted: Date.now(), word });
      log("posted", { id, file: name });
    }, delay * 1000);
  });

  const poll = setInterval(() => {
    for (const [id, entry] of pending) {
      const reply = join(REPLIES, `${id}.json`);
      if (!existsSync(reply)) continue;
      const work = join("work", `${id}.txt`);
      const wrote = existsSync(work) ? readFileSync(work, "utf8").trim() : null;
      log("replied", { id, latencyMs: Date.now() - entry.posted, workCorrect: wrote === entry.word });
      pending.delete(id);
    }
    const allPosted = Date.now() - start > Math.max(...schedule) * 1000 + 1000;
    if (allPosted && pending.size === 0) {
      log("finished", { elapsedMs: Date.now() - start });
      clearInterval(poll);
    } else if (Date.now() - start > deadlineMs) {
      log("deadline", { unanswered: [...pending.keys()] });
      clearInterval(poll);
    }
  }, 500);
}

if (basename(process.argv[1] ?? "") === "framework.mjs") {
  const verb = process.argv[2];
  if (verb === "request") process.exitCode = await exchange({ exchangeId: arg("--exchange", ""), answers: Number(arg("--answers", "0")) });
  else if (verb === "watch") await watch();
  else mailbox();
}
