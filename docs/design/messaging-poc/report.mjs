// One run's timeline and findings, from the harness's own logs and the
// engine's transcript.
//   node report.mjs <run> [--engine claude|copilot]
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const run = process.argv[2];
const engineAt = process.argv.indexOf("--engine");
const engine = engineAt > 0 ? process.argv[engineAt + 1] : run.split("-")[0];
const OUT = join("results", run);
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
const sessionIds = [];
const billed = [];
if (engine === "claude") {
  // Claude Code names a project's transcript folder after its path, separators as dashes.
  const dir = join(homedir(), ".claude", "projects", process.cwd().replace(/[:\\/]/g, "-"));
  const files = existsSync(dir)
    ? readdirSync(dir).filter((f) => f.endsWith(".jsonl")).map((f) => join(dir, f)).filter((f) => statSync(f).mtimeMs >= t0)
    : [];
  for (const file of files) {
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
    const folder = process.cwd().split(/[\\/]/).pop();
    if (!yaml.includes(folder) || !created || Date.parse(created) < t0) continue;
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
