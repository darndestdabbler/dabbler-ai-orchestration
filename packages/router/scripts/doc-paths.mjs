// A design document's check: every repository path it names exists.
//
// A path is any backticked token that contains a slash and a file
// extension, read relative to the repository root (the directory this
// script is run from). A document that names a seam by path is making a
// claim about this tree, and the claim is checked here rather than trusted;
// a token that is not a path in this repository is not backticked as one.
//
//   node packages/router/scripts/doc-paths.mjs docs/design/<page>.md

import { existsSync, readFileSync } from "node:fs";

const [, , ...documents] = process.argv;
if (documents.length === 0) {
  process.stderr.write("usage: node packages/router/scripts/doc-paths.mjs <markdown file>...\n");
  process.exit(2);
}

let checked = 0;
const missing = [];
for (const document of documents) {
  const text = readFileSync(document, "utf8");
  for (const match of text.matchAll(/`([^`\s]+)`/g)) {
    const token = match[1];
    if (!token.includes("/") || !/\.[A-Za-z0-9]+$/.test(token)) continue;
    if (/^(https?:|file:)/.test(token)) continue;
    checked += 1;
    if (!existsSync(token)) missing.push(`${document}: ${token}`);
  }
}
if (missing.length > 0) {
  process.stderr.write(`doc-paths: ${missing.length} path(s) named do not exist:\n  ${missing.join("\n  ")}\n`);
  process.exit(1);
}
process.stdout.write(`doc-paths: ${checked} path(s) named across ${documents.length} document(s), all present\n`);
