// The shipped pages' check: no page a stranger reads may name a runtime,
// a command or a unit of work this product does not have.
//
//   node packages/router/scripts/check-shipped-docs.mjs
//
// It rides in the lint control (`workspace-check.ts`), beside the boundary,
// selection-map and suite-cost checks, for the reason all four are there: a
// protection with no auditor is a protection with a date on it.
//
// **The incident is this file's whole justification, and it is not a
// hypothetical.** Session 36 deleted the Python implementation. The
// Marketplace page went on requiring "Python 3.11+ on PATH", telling
// readers to `pip install dabbler-ai-router`, describing the extension as
// "a pure renderer of `python -m ai_router.progress --json`" and offering
// an operator a `waive` the router now refuses by name -- for a hundred
// sessions, until session 137, and every one of those sessions was a
// chance for a person to install a runtime nothing uses. Nothing in the
// suite could see it, because a suite tests behaviour and this is prose.
//
// TWO RULES, and the difference between them matters:
//
//   - RETIRED names a thing that does not exist anywhere in the product.
//     It is banned on every shipped page, with no exception.
//   - UNTESTED names a thing that exists and has never been exercised. It
//     is allowed to appear, and only where the same neighbourhood says so
//     -- "undocumented, not unsupported" (D268). It is checked on the
//     pages a reader is TAUGHT from, not on the reference documents that
//     describe the adapters the code actually carries.
//
// The record is never read here. The decisions log, the framework
// specification, the session plan and the status archive all say what was
// once true and must go on saying it; a check that reached them would be
// asking a history to be current.

import { existsSync, readFileSync } from "node:fs";

/** Pages a stranger reads. Nothing under docs/sessions/ is ever one. */
const SHIPPED = [
  "README.md",
  "tools/dabbler-ai-orchestration/README.md",
  "tools/dabbler-ai-orchestration/CHANGELOG.md",
  "tools/dabbler-ai-orchestration/media/walkthrough-setup.md",
  "tools/dabbler-ai-orchestration/media/walkthrough-session.md",
  "tools/dabbler-ai-orchestration/media/walkthrough-owed.md",
  "docs/quick-start.md",
  "docs/driving-a-session.md",
];

/** The Marketplace listing text, which is prose that happens to live in JSON. */
const MANIFEST = "tools/dabbler-ai-orchestration/package.json";

/**
 * Gone from the product, and so from every shipped page.
 *
 * Each entry says the incident that put it here, because a ban whose
 * reason is not written down is a ban the next session deletes.
 */
const RETIRED = [
  [
    /\bai_router\b/i,
    "the Python package, deleted in session 36; the equivalent is `dabbler <verb>`",
  ],
  [
    /\bpip install\b/i,
    "there is nothing to pip-install: the router ships inside the extension",
  ],
  // No blanket ban on `python -m`: a consumer's own suite may well be
  // `python -m pytest`, and the quick start declares one as an example.
  // What is banned is this repository's deleted module, above.
  [
    /\bpython\s*3\.\d+\+/i,
    "the Marketplace page required Python 3.11+ for a hundred sessions after the Python was deleted",
  ],
  [
    /\.venv\b/,
    "setup creates no virtual environment; the router runs on the editor's own Node",
  ],
  [
    /\bsession[ -]sets?\b/i,
    "session sets were retired: sessions are numbered directly in the repository under one sessions root",
  ],
];

/**
 * Named only where the same neighbourhood says what is true of it.
 *
 * A flat ban would be wrong for both of these. `waiver` has to be sayable
 * in order to say there isn't one -- the whole correction is the sentence
 * *there is no waiver* -- so what is banned is the word standing alone,
 * offering an operator an exit that `verify waive` refuses by name. And
 * `codex` is an engine the router accepts and nothing has ever driven, so
 * it may be named where the page says so (D268).
 */
const QUALIFIED = [
  [
    /\bwaiv(e|er|ing|ed)\b/i,
    /\bno waiver\b|\bnot a waiver\b|\brefus(e|ed|es)\b|\bretired\b|\bcannot\b/i,
    "`verify waive` is refused by name: a waiver may be mentioned only where the page says it does not exist",
  ],
  [/\bcodex\b/i, /\buntested\b/i, "D268: undocumented, not unsupported"],
];

/** A model id like `gpt-5.3-codex` is a vendor's name for a model, not this product's engine. */
const MODEL_ID = /gpt-[\w.-]*codex/i;

/** How far from a mention the qualifying word may stand: this line and the three after it. */
const NEIGHBOURHOOD = 4;

const failures = [];

function judge(label, text) {
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const [pattern, why] of RETIRED) {
      if (pattern.test(line)) failures.push(`${label}:${index + 1}: ${why}\n      ${line.trim()}`);
    }
    for (const [pattern, qualifier, why] of QUALIFIED) {
      if (!pattern.test(line) || MODEL_ID.test(line)) continue;
      if (qualifier.test(lines.slice(index, index + NEIGHBOURHOOD).join(" "))) continue;
      failures.push(`${label}:${index + 1}: ${why}\n      ${line.trim()}`);
    }
  });
}

/**
 * A changelog is two documents in one file, and only the first is shipped
 * advice. Above the first `## [version]` heading is what a reader is told
 * to DO -- and it told them to run `python -m ai_router.changelog` against
 * an implementation deleted a hundred sessions ago. Below it, every
 * version section is a record of what that release actually contained, in
 * the vocabulary of its own day; correcting those would be rewriting the
 * history rather than the instruction.
 */
function shippedPart(page, text) {
  if (!page.endsWith("CHANGELOG.md")) return text;
  const released = text.search(/^## \[/m);
  return released === -1 ? text : text.slice(0, released);
}

for (const page of SHIPPED) {
  if (!existsSync(page)) {
    failures.push(`${page}: shipped page is missing -- this list names the pages a stranger reads`);
    continue;
  }
  judge(page, shippedPart(page, readFileSync(page, "utf8")));
}

// The listing text only. The rest of the manifest is ids, commands and
// versions, and `dabblerSessionSets*` ids are deliberately unchanged --
// an id is a stored key and renaming one loses an operator's activity-bar
// position, which is why this reads two fields rather than the file.
const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
judge(
  `${MANIFEST} (description)`,
  typeof manifest.description === "string" ? manifest.description : "",
);
judge(`${MANIFEST} (keywords)`, (manifest.keywords ?? []).join("\n"));

if (failures.length > 0) {
  process.stderr.write("check-shipped-docs: a shipped page names something this product does not have:\n");
  for (const failure of failures) process.stderr.write(`  ${failure}\n`);
  process.stderr.write(
    "\nThese are the pages a stranger reads. Correct the page -- never the check, and never a record under docs/sessions/.\n",
  );
  process.exit(1);
}

process.stdout.write(
  `check-shipped-docs: ${SHIPPED.length} page(s) and the Marketplace listing text name nothing retired.\n`,
);
