// The AI's reply to the framework.
//   node post.mjs <message id> <text...>
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [id, ...words] = process.argv.slice(2);
if (!id) {
  process.stderr.write("usage: node post.mjs <message id> <text...>\n");
  process.exit(2);
}
const outbox = join("mail", "to-framework");
mkdirSync(outbox, { recursive: true });
writeFileSync(join(outbox, `${id}.json`), JSON.stringify({ id, text: words.join(" "), at: new Date().toISOString() }) + "\n");
process.stdout.write(`posted ${id}\n`);
