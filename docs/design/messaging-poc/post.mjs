// The AI's answer to the framework.
//
// Mailbox (the control): drop a reply and exit.
//   node post.mjs <message id> <text...>
//
// Exchange: the answer command. It submits the answer, stays alive while the
// framework does the work the answer caused, prints exactly one JSON
// instruction (or `done`) on stdout, and exits. Run again after a kill it
// collects the response already produced or resumes the unfinished work; the
// answer is accepted once.
//   node post.mjs --exchange <id> --answers <seq>
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const flag = (name) => {
  const at = process.argv.indexOf(name);
  return at > 0 ? process.argv[at + 1] : undefined;
};

if (flag("--exchange") !== undefined) {
  const answers = Number(flag("--answers"));
  if (!Number.isInteger(answers) || answers < 1) {
    process.stderr.write("usage: node post.mjs --exchange <id> --answers <seq>\n");
    process.exit(2);
  }
  const { exchange } = await import("./framework.mjs");
  process.exitCode = await exchange({ exchangeId: flag("--exchange"), answers });
} else {
  const [id, ...words] = process.argv.slice(2);
  if (!id) {
    process.stderr.write("usage: node post.mjs <message id> <text...>\n");
    process.exit(2);
  }
  const outbox = join("mail", "to-framework");
  mkdirSync(outbox, { recursive: true });
  writeFileSync(join(outbox, `${id}.json`), JSON.stringify({ id, text: words.join(" "), at: new Date().toISOString() }) + "\n");
  process.stdout.write(`posted ${id}\n`);
}
