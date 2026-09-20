// The stand-in framework: post tasks to the AI's inbox on a schedule and time
// each reply.
//   node framework.mjs --schedule 30,90,150 [--deadline 900] [--run <name>]
// Delays are seconds from start. Events go to mail/framework-log.jsonl.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const arg = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at > 0 ? process.argv[at + 1] : fallback;
};
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
