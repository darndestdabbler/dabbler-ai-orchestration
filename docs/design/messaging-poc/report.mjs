// One run's timeline and findings, from the harness's own logs and the
// engine's transcript.
//   node report.mjs <run> [--engine claude|copilot]
// An exchange run (the next-instruction proof) names where the driver put things:
//   node report.mjs <run> --mode exchange --repo <disposable repo> --out <scratch>/results/<run>
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

const run = process.argv[2];
const flag = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at > 0 ? process.argv[at + 1] : fallback;
};
const engine = flag("--engine", run.split("-")[0]);
const EXCHANGE = flag("--mode", "mailbox") === "exchange";
// The folder the engine ran in: its transcript is filed under that path.
const REPO = resolve(flag("--repo", process.cwd()));
const OUT = flag("--out", join("results", run));
const jsonl = (file) =>
  existsSync(file)
    ? readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line))
    : [];

const driver = jsonl(join(OUT, "driver-log.jsonl"));
const framework = jsonl(join(OUT, "framework-log.jsonl"));
const waiter = jsonl(join(OUT, "waiter-log.jsonl"));
const t0 = Date.parse(driver[0]?.at ?? new Date().toISOString());
const sec = (iso) => ((Date.parse(iso) - t0) / 1000).toFixed(1);
const rows = [];
const row = (at, source, what) => rows.push({ at, source, what });

for (const e of driver) row(e.at, "driver", e.event + (e.text ? `: ${e.text}` : ""));
for (const e of framework) row(e.at, "framework", `${e.event}${e.id ? ` ${e.id}` : ""}${e.latencyMs ? ` after ${(e.latencyMs / 1000).toFixed(1)} s` : ""}${e.workCorrect === false ? " WORK WRONG" : ""}`);
for (const e of waiter) row(e.at, "waiter", `${e.event} pid ${e.pid}${e.message ? ` ${e.message}` : ""}`);

// --- the engine's own record ------------------------------------------------
const transcript = [];
const transcriptFiles = [];
const sessionIds = [];
const billed = [];
if (engine === "claude") {
  // Claude Code names a project's transcript folder after its path, separators as dashes.
  const dir = join(homedir(), ".claude", "projects", REPO.replace(/[:\\/]/g, "-"));
  const files = existsSync(dir)
    ? readdirSync(dir).filter((f) => f.endsWith(".jsonl")).map((f) => join(dir, f)).filter((f) => statSync(f).mtimeMs >= t0)
    : [];
  for (const file of files) {
    transcriptFiles.push(file);
    for (const e of jsonl(file)) {
      if (!e.timestamp || Date.parse(e.timestamp) < t0) continue;
      if (e.type === "attachment" && e.attachment?.type === "queued_command" && e.attachment?.origin?.kind === "human") {
        // A message the person typed while a turn was running, absorbed into that turn.
        transcript.push({ at: e.timestamp, kind: "human", what: String(e.attachment.prompt ?? "") });
      } else if (e.type === "queue-operation" && String(e.content ?? "").includes("<task-notification>")) {
        const summary = /<summary>([^<]*)<\/summary>/.exec(e.content)?.[1] ?? "";
        transcript.push({ at: e.timestamp, kind: "notification", what: summary });
      } else if (e.type === "user" && e.message) {
        const content = e.message.content;
        const text = typeof content === "string" ? content : (content ?? []).filter((c) => c.type === "text").map((c) => c.text).join(" ");
        if (text && !e.toolUseResult && !text.startsWith("<")) transcript.push({ at: e.timestamp, kind: "human", what: text });
      } else if (e.type === "assistant" && e.message) {
        for (const c of e.message.content ?? []) {
          if (c.type === "text" && c.text.trim()) transcript.push({ at: e.timestamp, kind: "ai-text", what: c.text.trim() });
          if (c.type === "tool_use") {
            const command = c.input?.command ?? JSON.stringify(c.input ?? {});
            transcript.push({ at: e.timestamp, kind: c.input?.run_in_background ? "ai-background" : "ai-tool", what: `${c.name}: ${command}` });
          }
        }
      }
    }
  }
} else {
  // Copilot's own per-session event log: every event, briefly, until its shape is known.
  const states = join(homedir(), ".copilot", "session-state");
  for (const id of existsSync(states) ? readdirSync(states) : []) {
    const workspace = join(states, id, "workspace.yaml");
    const events = join(states, id, "events.jsonl");
    if (!existsSync(workspace) || !existsSync(events)) continue;
    const yaml = readFileSync(workspace, "utf8");
    const created = /created_at:\s*(\S+)/.exec(yaml)?.[1];
    const folder = basename(REPO);
    if (!yaml.includes(folder) || !created || Date.parse(created) < t0) continue;
    transcriptFiles.push(events);
    for (const e of jsonl(events)) {
      const data = e.data ?? {};
      if (e.type === "user.message") transcript.push({ at: e.timestamp, kind: "human", what: String(data.content ?? "") });
      else if (e.type === "assistant.message" && String(data.content ?? "").trim()) transcript.push({ at: e.timestamp, kind: "ai-text", what: String(data.content).trim() });
      else if (e.type === "tool.execution_start") {
        const args = data.arguments ?? {};
        const what = `${data.toolName}: ${args.command ?? args.shellId ?? JSON.stringify(args).slice(0, 120)}`;
        transcript.push({ at: e.timestamp, kind: args.mode === "async" ? "ai-background" : "ai-tool", what });
      } else if (e.type === "system.notification") {
        transcript.push({ at: e.timestamp, kind: "notification", what: `${data.kind?.type ?? "notice"}: ${data.kind?.description ?? ""}` });
      }
    }
    sessionIds.push(id);
  }
  // What the seat billed for this run's sessions, from its usage store.
  const { DatabaseSync } = process.getBuiltinModule("node:sqlite");
  const db = new DatabaseSync(join(homedir(), ".copilot", "session-store.db"), { readOnly: true });
  for (const id of sessionIds) {
    const usage = db.prepare("select count(*) calls, coalesce(sum(total_nano_aiu), 0) nano from assistant_usage_events where session_id = ?").get(id);
    billed.push(`session ${id.slice(0, 8)}: ${usage.calls} model calls, ${(Number(usage.nano) / 1e9).toFixed(2)} AI credits`);
  }
}
for (const e of transcript) row(e.at, engine, `${e.kind}: ${e.what.replace(/\s+/g, " ").slice(0, 150)}`);

// --- the exchange run: criteria, each with the evidence it rests on ---------------
if (EXCHANGE) {
  const events = jsonl(join(OUT, "events.jsonl"));
  for (const e of events) {
    const detail = ["seq", "answers", "step", "attempt", "exit", "code", "kind", "resumed", "verdict", "commit", "reason"]
      .filter((key) => e[key] !== undefined)
      .map((key) => `${key}=${e[key]}`)
      .join(" ");
    row(e.at, "framework", `${e.event} [${e.exchange} pid ${e.pid}] ${detail}`);
  }
  rows.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  const of = (name, where = () => true) => events.filter((e) => e.event === name && where(e));
  const first = (name, where) => of(name, where)[0];
  const ms = (e) => (e ? Date.parse(e.at) : NaN);
  const commands = transcript.filter((e) => e.kind === "ai-tool" || e.kind === "ai-background");
  const answersRun = commands.filter((e) => /post\.mjs\s+--exchange/.test(e.what));
  const requestsRun = commands.filter((e) => /framework\.mjs\s+request/.test(e.what));
  const accepted = of("answer-accepted");
  const issued = [...of("instruction-issued"), ...of("done-issued")];
  const done = first("done-issued");
  const criteria = [];
  const check = (name, pass, evidence) => criteria.push({ name, pass: Boolean(pass), evidence });

  check(
    "1. the instruction was requested once, from a short-lived process",
    requestsRun.length === 1 && of("exchange-started", (e) => e.answers === 0).length === 1 && of("exchange-exited", (e) => e.answers === 0 && e.code === 0).length === 1,
    `the AI ran the first request ${requestsRun.length} time(s); the framework saw ${of("exchange-started", (e) => e.answers === 0).length} first request(s), which exited ${of("exchange-exited", (e) => e.answers === 0).map((e) => e.code).join(",")}`,
  );
  const stages = accepted.map((e) => e.stage);
  check(
    "2. the authoring work was done: three stages accepted, each once",
    [1, 2, 3].every((stage) => stages.filter((s) => s === stage).length === 1) && new Set(accepted.map((e) => e.seq)).size === accepted.length,
    `accepted sequence numbers ${accepted.map((e) => `${e.seq} (stage ${e.stage})`).join(", ") || "none"}; refused answers ${of("answer-refused").length}; rejections issued ${of("instruction-issued", (e) => e.kind === "rejection").length}`,
  );
  check(
    "3. every answer was one background command",
    answersRun.length > 0 && answersRun.every((e) => e.kind === "ai-background"),
    `${answersRun.filter((e) => e.kind === "ai-background").length} of ${answersRun.length} answer commands started in the background: ${answersRun.map((e) => e.what.replace(/^[^:]*: /, "").slice(0, 60)).join(" | ")}`,
  );

  const questions = driver.filter((e) => e.event === "human");
  const window = {
    q1: [ms(first("instruction-issued", (e) => e.seq === 1)), ms(first("answer-accepted", (e) => e.seq === 1)), "the author working on instruction 1"],
    q2: [ms(first("answer-accepted", (e) => e.seq === 1)), ms(first("instruction-issued", (e) => e.answers === 1)), "answer command 1 waiting on the framework"],
  };
  for (const said of questions) {
    const [from, to, during] = window[said.name] ?? [];
    const heard = transcript.find((e) => e.kind === "human" && e.what.includes(said.text.slice(0, 24)));
    const answer = heard ? transcript.find((e) => e.kind === "ai-text" && Date.parse(e.at) >= Date.parse(heard.at)) : undefined;
    const inside = Date.parse(said.at) > from && Date.parse(said.at) < to;
    check(
      `4. the person's question ${said.name} landed during ${during}, and the same AI answered it`,
      inside && heard && answer,
      `typed ${sec(said.at)} s, window ${((from - t0) / 1000).toFixed(1)}-${((to - t0) / 1000).toFixed(1)} s; recorded by the engine=${Boolean(heard)}; answered ${answer ? `${sec(answer.at)} s: "${answer.what.replace(/\s+/g, " ").slice(0, 160)}"` : "NEVER"}`,
    );
  }
  check("4. both questions were asked", questions.length === 2, `${questions.length} asked`);
  check(
    "4. the outstanding instruction survived both questions",
    accepted.some((e) => e.seq === 1) && issued.some((e) => e.answers === 1),
    `answer 1 accepted ${sec(first("answer-accepted", (e) => e.seq === 1)?.at ?? driver[0].at)} s, after q1; instruction 2 delivered ${sec(first("instruction-issued", (e) => e.answers === 1)?.at ?? driver[0].at)} s, after q2`,
  );

  // The next instruction came out of the answer command itself.
  const nextFromAnswer = issued.filter((e) => e.answers >= 1);
  const afterAnswer = commands.filter(
    (e) => !/post\.mjs\s+--exchange/.test(e.what) && accepted.some((a) => Date.parse(e.at) > ms(a) && Date.parse(e.at) < ms(issued.find((i) => i.answers === a.seq) ?? done)),
  );
  check(
    "5. each next instruction came from the answer command, with no waiter, second request or poll",
    nextFromAnswer.length >= 3 && !commands.some((e) => /wait-inbox|session wait|\bsleep\b|Start-Sleep/i.test(e.what)) && requestsRun.length === 1,
    `${nextFromAnswer.length} responses delivered on an answer command's stdout (${nextFromAnswer.map((e) => `answer ${e.answers} -> ${e.kind ?? "done"} ${e.seq}`).join(", ")}); ` +
      `waiter/sleep commands: ${commands.filter((e) => /wait-inbox|session wait|\bsleep\b|Start-Sleep/i.test(e.what)).length}; ` +
      `other tool calls while an answer command was live: ${afterAnswer.length}${afterAnswer.length ? ` (${afterAnswer.map((e) => e.what.slice(0, 50)).join(" | ")})` : ""}`,
  );

  const killed = driver.find((e) => e.event === "exchange-killed");
  const resumedRun = killed ? first("exchange-started", (e) => e.exchange === killed.exchange && e.pid !== killed.pid && ms(e) > Date.parse(killed.at) - 2000) : undefined;
  const stepsOf = (seq, step) => ({ started: of("step-started", (e) => e.seq === seq && e.step === step).length, done: of("step-done", (e) => e.seq === seq && e.step === step && e.exit === 0).length });
  const killSeq = killed ? Number(String(killed.exchange).split("-x").pop()) : null;
  const once = killed ? ["build", "test", "review", "commit"].map((step) => `${step} ${stepsOf(killSeq, step).started}/${stepsOf(killSeq, step).done}`) : [];
  check(
    "6. a killed answer command, run again, accepted nothing twice and repeated no completed side effect",
    killed?.dead && resumedRun?.resumed === true && of("answer-accepted", (e) => e.seq === killSeq).length === 1 && ["build", "test", "review", "commit"].every((step) => stepsOf(killSeq, step).started === 1 && stepsOf(killSeq, step).done === 1),
    killed
      ? `pid ${killed.pid} killed ${sec(killed.at)} s (dead=${killed.dead}) during hold; the same command came back as pid ${resumedRun?.pid ?? "NEVER"} ${resumedRun ? `${sec(resumedRun.at)} s, resumed=${resumedRun.resumed}` : ""}; ` +
        `answer ${killSeq} accepted ${of("answer-accepted", (e) => e.seq === killSeq).length} time(s); started/completed: ${once.join(", ")}; the interrupted hold ran ${stepsOf(killSeq, "hold").started} times`
      : "no kill was made",
  );

  const duplicate = driver.find((e) => e.event === "duplicate-request");
  const dupSeq = duplicate ? Number(/--answers (\d+)/.exec(duplicate.command)?.[1]) : null;
  check(
    "7. a duplicate of a live request got one explicit refusal and duplicated nothing",
    duplicate?.exit === 3 && duplicate.stdout === "" && of("request-refused").length === 1 && of("answer-accepted", (e) => e.seq === dupSeq).length === 1 && ["build", "test", "commit"].every((step) => stepsOf(dupSeq, step).started === 1),
    duplicate
      ? `\`${duplicate.command}\` run beside the live one: exit ${duplicate.exit}, stdout ${JSON.stringify(duplicate.stdout)}, stderr "${duplicate.stderr.trim().slice(0, 110)}"; ` +
        `answer ${dupSeq} accepted ${of("answer-accepted", (e) => e.seq === dupSeq).length} time(s); build/test/commit started ${["build", "test", "commit"].map((s) => stepsOf(dupSeq, s).started).join("/")}`
      : "no duplicate was attempted",
  );

  const reopened = driver.find((e) => e.event === "watch-terminal-reopened");
  check(
    "8. the Dabbler-style terminal, closed and reopened during a framework phase, rebuilt progress from persisted events",
    reopened && Number(reopened.reconstructed) > 0 && Number(reopened.reconstructed) <= reopened.eventsOnDisk && reopened.stillWorking,
    reopened ? `reopened ${sec(reopened.at)} s with the framework still in its phase=${reopened.stillWorking}; it replayed ${reopened.reconstructed} events of ${reopened.eventsOnDisk} on disk by the time it was read (watch-reopened.txt)` : "never reopened",
  );

  const count = (step) => `${of("step-started", (e) => e.step === step).length} started, ${of("step-done", (e) => e.step === step && e.exit === 0).length} completed`;
  const gitLog = existsSync(join(OUT, "git-log.txt")) ? readFileSync(join(OUT, "git-log.txt"), "utf8").split("\n").filter(Boolean) : [];
  const stageCommits = gitLog.filter((l) => /stage \d \(answer \d+\)/.test(l));
  check(
    "9. one reviewer call, one build and one test per phase, one commit per stage",
    of("step-started", (e) => e.step === "review").length === 1 && of("step-done", (e) => e.step === "review" && e.exit === 0).length === 1 && stageCommits.length === 3 && new Set(stageCommits.map((l) => l.split(" ").slice(2).join(" "))).size === 3,
    `reviewer: ${count("review")} (${first("step-done", (e) => e.step === "review")?.reviewer}: ${first("step-done", (e) => e.step === "review")?.verdict}); build: ${count("build")}; test: ${count("test")}; commits: ${stageCommits.length} (${stageCommits.map((l) => l.split(" ")[0]).join(", ")})`,
  );

  const atEnd = driver.find((e) => e.event === "processes-at-end")?.processes ?? null;
  const afterClose = driver.find((e) => e.event === "processes-after-close")?.processes ?? null;
  // Reading a finished background command's output is how `done` reaches the AI, not something it ran:
  // what counts after done is a shell command. Anything else it did is still listed.
  const isShell = (e) => /^(PowerShell|Bash|powershell|bash|shell): /.test(e.what);
  const afterDone = done ? commands.filter((e) => Date.parse(e.at) > ms(done) + 1000) : [];
  const late = afterDone.filter(isShell);
  const approvals = driver.filter((e) => e.event === "operator-approved-tool").length;
  check(
    "10. done was reached with no waiter, no Resume, no daemon and no acknowledgement from the person",
    done && atEnd && atEnd.length === 0 && afterClose && afterClose.length === 0 && late.length === 0 && approvals === 0 && driver.filter((e) => e.event === "timeout").length === 0,
    `done issued ${done ? `${sec(done.at)} s as sequence ${done.seq}` : "NEVER"}; framework processes 25 s after done: ${atEnd ? atEnd.length : "unread"}${atEnd?.length ? ` (${atEnd.join(" ; ")})` : ""}; after the editor closed: ${afterClose ? afterClose.length : "unread"}; ` +
      `shell commands after done: ${late.length}${late.length ? ` (${late.map((e) => e.what.slice(0, 60)).join(" | ")})` : ""}; other tool calls after done: ${afterDone.length - late.length}${afterDone.length - late.length ? ` (${afterDone.filter((e) => !isShell(e)).map((e) => e.what.replace(/\\\\/g, "\\").slice(0, 110)).join(" | ")})` : ""}; tool approvals by the driver: ${approvals}; driver timeouts: ${driver.filter((e) => e.event === "timeout").map((e) => e.label).join(", ") || "none"}; ` +
      `the driver typed: the engine's command, its folder-trust answer, the opening sentence and the two questions`,
  );

  const proven = criteria.every((c) => c.pass);
  const exits = of("exchange-exited").map((e) => `${e.exchange}:${e.code}`);
  const childExits = of("step-done").map((e) => `${e.step}@${e.seq}:${e.exit}`);
  const summary = {
    run,
    engine,
    proven,
    versions: driver.find((e) => e.event === "versions"),
    repository: driver.find((e) => e.event === "disposable-repository"),
    startedAt: driver[0]?.at,
    endedAt: driver[driver.length - 1]?.at,
    transcripts: transcriptFiles,
    acceptedSequenceNumbers: accepted.map((e) => e.seq),
    exchangeExits: exits,
    childExits,
    criteria,
    billed,
  };
  writeFileSync(join(OUT, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  const text = [
    `# ${run} (${engine}) -- ${proven ? "PROVEN" : "NOT PROVEN"}`,
    "",
    "## Criteria",
    ...criteria.map((c) => `- ${c.pass ? "PASS" : "FAIL"} -- ${c.name}\n  - ${c.evidence}`),
    "",
    `Exchange process exits: ${exits.join(", ")}`,
    `Framework child exits: ${childExits.join(", ")}`,
    `Engine transcripts: ${transcriptFiles.join(", ") || "none found"}`,
    ...billed,
    "",
    "## Timeline (seconds from launch)",
    ...rows.map((r) => `${sec(r.at).padStart(7)}  ${r.source.padEnd(9)}  ${r.what}`),
    "",
  ].join("\n");
  writeFileSync(join(OUT, "report.md"), text);
  process.stdout.write(text.split("## Timeline")[0]);
  process.exit(0);
}

// --- findings -----------------------------------------------------------------
rows.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
const armedAt = (iso) => {
  let armed = false;
  for (const e of waiter) {
    if (Date.parse(e.at) > Date.parse(iso)) break;
    armed = e.event === "armed";
  }
  return armed;
};
const findings = [];
for (const post of framework.filter((e) => e.event === "posted")) {
  const fired = waiter.find((e) => e.event === "fired" && e.message === post.file);
  const replied = framework.find((e) => e.event === "replied" && e.id === post.id);
  findings.push(
    `${post.id}: waiter armed when posted=${armedAt(post.at)}; fired ${fired ? `${((Date.parse(fired.at) - Date.parse(post.at)) / 1000).toFixed(1)} s` : "NEVER"}; ` +
      `reply ${replied ? `${(replied.latencyMs / 1000).toFixed(1)} s, work correct=${replied.workCorrect}` : "NEVER"}`,
  );
}
for (const said of driver.filter((e) => e.event === "human")) {
  // The driver logs after typing; the transcript records the message itself.
  const heard = transcript.find((e) => (e.kind === "human" || e.kind === "turn-user") && e.what.includes(said.text.slice(0, 20)));
  const answer = heard ? transcript.find((e) => (e.kind === "ai-text" || e.kind === "turn-ai") && Date.parse(e.at) >= Date.parse(heard.at)) : undefined;
  findings.push(
    `human "${said.text}": waiter armed=${armedAt(said.at)}; recorded=${Boolean(heard)}; ` +
      `answered ${answer ? `${((Date.parse(answer.at) - Date.parse(heard.at)) / 1000).toFixed(1)} s: "${answer.what.replace(/\s+/g, " ").slice(0, 120)}"` : "NEVER"}`,
  );
}
// What the first model call after each wake cost: a jump means the prompt cache
// expired during the wait before it.
if (engine === "copilot" && sessionIds.length) {
  const { DatabaseSync } = process.getBuiltinModule("node:sqlite");
  const db = new DatabaseSync(join(homedir(), ".copilot", "session-store.db"), { readOnly: true });
  for (const fire of waiter.filter((e) => e.event === "fired" || e.event === "timed-out")) {
    const armed = waiter.filter((e) => e.event === "armed" && Date.parse(e.at) < Date.parse(fire.at)).pop();
    const first = sessionIds
      .map((id) => db.prepare("select created_at, total_nano_aiu from assistant_usage_events where session_id = ? and created_at > ? order by created_at limit 1").get(id, fire.at))
      .find(Boolean);
    if (!first || !armed) continue;
    findings.push(
      `wake after ${((Date.parse(fire.at) - Date.parse(armed.at)) / 1000).toFixed(0)} s waiting (${fire.event}): first call ${(Number(first.total_nano_aiu) / 1e9).toFixed(2)} credits`,
    );
  }
}
for (const kill of driver.filter((e) => e.event === "waiter-killed")) {
  const rearmed = waiter.find((e) => e.event === "armed" && Date.parse(e.at) > Date.parse(kill.at));
  // The driver logs a kill once the kill has returned; the engine's notice can be stamped just before that.
  const noticed = transcript.find((e) => e.kind === "notification" && Date.parse(e.at) >= Date.parse(kill.at) - 5000);
  findings.push(
    `waiter killed at ${kill.atSec} s: engine notified ${noticed ? `${((Date.parse(noticed.at) - Date.parse(kill.at)) / 1000).toFixed(1)} s ("${noticed.what.slice(0, 80)}")` : "NEVER"}; ` +
      `re-armed ${rearmed ? `${((Date.parse(rearmed.at) - Date.parse(kill.at)) / 1000).toFixed(1)} s later` : "NEVER"}`,
  );
}
// The longest idle stretch: from a waiter being armed to the next message being
// posted. Anything the engine did in it is what waiting cost.
let idle = null;
for (const post of framework.filter((e) => e.event === "posted")) {
  const armed = waiter.filter((e) => e.event === "armed" && Date.parse(e.at) < Date.parse(post.at)).pop();
  if (!armed) continue;
  const span = Date.parse(post.at) - Date.parse(armed.at);
  if (!idle || span > idle.span) idle = { from: armed.at, to: post.at, span };
}
if (idle) {
  const inside = (iso) => Date.parse(iso) > Date.parse(idle.from) + 2000 && Date.parse(iso) < Date.parse(idle.to);
  const acted = transcript.filter((e) => e.kind.startsWith("ai-") && inside(e.at)).length;
  let calls = "n/a";
  if (engine === "copilot" && sessionIds.length) {
    const { DatabaseSync } = process.getBuiltinModule("node:sqlite");
    const db = new DatabaseSync(join(homedir(), ".copilot", "session-store.db"), { readOnly: true });
    calls = sessionIds
      // The same 2 s margin as the action count: the arming turn's own last call lands just after the waiter starts.
      .map((id) => db.prepare("select count(*) n from assistant_usage_events where session_id = ? and created_at > ? and created_at < ?").get(id, new Date(Date.parse(idle.from) + 2000).toISOString(), idle.to).n)
      .reduce((a, b) => a + Number(b), 0);
  }
  findings.push(`longest idle wait: ${(idle.span / 1000).toFixed(0)} s with a waiter armed; AI actions during it: ${acted}; model calls during it: ${calls}`);
}
const backgrounds = transcript.filter((e) => e.kind === "ai-background" && e.what.includes("wait-inbox")).length;
const foregrounds = transcript.filter((e) => e.kind === "ai-tool" && e.what.includes("wait-inbox")).length;
const notifications = transcript.filter((e) => e.kind === "notification").length;
findings.push(`waiter calls: ${backgrounds} in the background, ${foregrounds} in the foreground; wake-up notifications: ${notifications}`);
findings.push(...billed);

const text = [
  `# ${run} (${engine})`,
  "",
  "## Findings",
  ...findings.map((f) => `- ${f}`),
  "",
  "## Timeline (seconds from launch)",
  ...rows.map((r) => `${sec(r.at).padStart(7)}  ${r.source.padEnd(9)}  ${r.what}`),
  "",
].join("\n");
writeFileSync(join(OUT, "report.md"), text);
process.stdout.write(text);
