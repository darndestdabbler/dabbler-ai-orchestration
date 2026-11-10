// The AI's background waiter: check the inbox folder twice a second (a local
// file check, no model call) until a message newer than the cursor appears,
// advance the cursor, print the message, and exit. The exit is what wakes the
// AI. The cursor moves when the message is printed, so a waiter re-armed after a
// lost step skips it; the framework's own waiter (session 177) consumes nothing.
//   node wait-inbox.mjs [--timeout <seconds>]
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MAIL = "mail";
const INBOX = join(MAIL, "to-ai");
const CURSOR = join(MAIL, ".ai-cursor");
const LOG = join(MAIL, "waiter-log.jsonl");
const at = process.argv.indexOf("--timeout");
// A run can shorten the wait (a keep-alive) through waiter.config.json; an
// explicit --timeout still wins, and no file means the one-hour default.
const configured = existsSync("waiter.config.json")
  ? Number(JSON.parse(readFileSync("waiter.config.json", "utf8")).timeoutSeconds)
  : NaN;
const timeoutMs = (at > 0 ? Number(process.argv[at + 1]) : Number.isFinite(configured) ? configured : 3600) * 1000;

mkdirSync(INBOX, { recursive: true });
const log = (event, extra = {}) =>
  appendFileSync(LOG, JSON.stringify({ event, pid: process.pid, at: new Date().toISOString(), ...extra }) + "\n");

const cursor = existsSync(CURSOR) ? readFileSync(CURSOR, "utf8").trim() : "";
const started = Date.now();
log("armed", { cursor });

const tick = () => {
  const next = readdirSync(INBOX).filter((name) => name.endsWith(".json") && name > cursor).sort()[0];
  if (next !== undefined) {
    writeFileSync(CURSOR, next);
    const body = readFileSync(join(INBOX, next), "utf8");
    log("fired", { message: next, waitedMs: Date.now() - started });
    process.stdout.write(`MESSAGE ${body.trim()}\n`);
    process.exit(0);
  }
  if (Date.now() - started > timeoutMs) {
    log("timed-out", { waitedMs: Date.now() - started });
    process.stdout.write(`NO MESSAGE after ${Math.round(timeoutMs / 1000)} s; re-arm the waiter in the background\n`);
    process.exit(0);
  }
  setTimeout(tick, 500);
};
tick();
