// The UAT walkthroughs' check: three registers per step, real buttons, and
// no manual commit inside the bootstrap step.
//
// The two walkthroughs are instruments rather than prose (session 130, and
// `docs/design/command-ownership.md` for why). Each numbered step says what
// the framework already did, what the operator does in the UI, and what that
// runs underneath -- or says which of the three is absent and why, in the
// operator's terms. A document that drops a register, or names a button that
// does not exist, or tells the reader to commit what bootstrap has already
// committed, is a document that has drifted back into shell.
//
// Nothing here reads the documents' meaning. It holds three shapes:
//
//   1. Every `## Step N` section carries each register's marker, or that
//      register's absence marker with a reason naming framework, UI or
//      person. `--registers` only: a document that is not a step-by-step
//      walkthrough is checked for 2 and 3 alone.
//   2. Every command title the document claims is one the extension
//      contributes: the bold spans on a `**You —**` line, and every
//      `Dabbler: <Title>` anywhere in the text.
//   3. The section that runs `dabbler bootstrap` does not also run `git
//      commit`. Bootstrap commits what it wrote and says so; a commit there
//      is either dead text or, worse, the reader's cue to believe the
//      framework did not. What a later step writes -- the manifest, the plan
//      -- is that step's to commit, and is not what this refuses.
//
//   node packages/router/scripts/check-uat-registers.mjs [--registers] <markdown file>...
//   node packages/router/scripts/check-uat-registers.mjs --self-test
//
// Run from the repository root: the extension manifest is read from there.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MANIFEST = "tools/dabbler-ai-orchestration/package.json";

/** The three registers, and the form each takes when it is absent. */
const REGISTERS = [
  { key: "framework", present: "**Framework —**", absent: "**No framework register —**", bucket: true },
  { key: "ui", present: "**You —**", absent: "**No UI register —**", bucket: true },
  // The third register's absence is a fact about the operation -- there is no
  // Dabbler command -- not a question of whose the gap is, so it is answered
  // with a reason and not with a bucket.
  { key: "underneath", present: "**Underneath —**", absent: "**No command underneath —**", bucket: false },
];

/**
 * A missing first or second register is a gap, and a gap is reported in the
 * operator's own vocabulary: lifecycle-timed and constant is the framework's,
 * constant but optional is the UI's, judgement is a person's and no gap.
 */
const BUCKET_WORDS = ["framework", "UI", "person", "judgement"];

const STEP_HEADING = /^##\s+Step\s+([0-9]+[a-z]?)\b/;
const BOLD_SPAN = /\*\*([^*]+)\*\*/g;
/** A line that continues the one before it rather than starting something. */
const STARTS_SOMETHING = /^(\s*[-*+]\s|\s{0,3}#{1,6}\s|\s*\||\s*```)/;

/**
 * `Dabbler: Start Session` and `Start Session` both name the same button.
 *
 * The palette shows `category: title`; the tree row and the prose show the
 * title alone, and a document is free to write either.
 */
function contributedTitles(root) {
  const manifest = JSON.parse(readFileSync(join(root, MANIFEST), "utf8"));
  const titles = new Set();
  for (const command of manifest.contributes?.commands ?? []) {
    const title = String(command.title ?? "").trim();
    if (title === "") continue;
    titles.add(title);
    const category = String(command.category ?? "").trim();
    if (category !== "") titles.add(`${category}: ${title}`);
  }
  return titles;
}

/** `## ` sections, in order, each with the line its heading is on. */
function sections(text) {
  const lines = text.split(/\r?\n/);
  const found = [];
  let current = null;
  for (const [index, line] of lines.entries()) {
    if (/^##\s/.test(line)) {
      if (current) found.push(current);
      current = { heading: line, line: index + 1, body: [] };
    } else if (current) {
      current.body.push(line);
    }
  }
  if (current) found.push(current);
  return found;
}

/**
 * The document as logical lines: a bullet or paragraph joined with the lines
 * that continue it, keeping the line number it started on.
 *
 * Markdown wraps, and a register that wraps is one register. Reading raw
 * lines would let a command title be split over two of them and let an
 * absence's reason be judged on its first half.
 */
function logicalLines(text) {
  const raw = text.split(/\r?\n/);
  const out = [];
  let current = null;
  for (const [index, line] of raw.entries()) {
    if (line.trim() === "") {
      current = null;
      continue;
    }
    if (current !== null && !STARTS_SOMETHING.test(line)) {
      current.text += ` ${line.trim()}`;
      continue;
    }
    current = { line: index + 1, text: line.trim() };
    out.push(current);
  }
  return out;
}

function boldSpans(text) {
  return [...text.matchAll(BOLD_SPAN)].map((match) => match[1].replace(/\s+/g, " ").trim());
}

/** Rule 1: every numbered step carries three registers, present or answered. */
function checkRegisters(document, text, problems) {
  let steps = 0;
  for (const section of sections(text)) {
    const step = STEP_HEADING.exec(section.heading);
    if (!step) continue;
    steps += 1;
    const body = section.body.join("\n");
    const logical = logicalLines(body);
    for (const register of REGISTERS) {
      if (body.includes(register.present)) continue;
      const absence = logical.find((entry) => entry.text.includes(register.absent));
      if (absence === undefined) {
        problems.push(
          `${document}:${section.line}: step ${step[1]} carries neither ` +
            `${register.present} nor ${register.absent}`,
        );
        continue;
      }
      const at = absence.text.indexOf(register.absent);
      const reason = absence.text.slice(at + register.absent.length).trim();
      if (reason === "") {
        problems.push(
          `${document}:${section.line}: step ${step[1]} states ${register.absent} with no reason`,
        );
      } else if (register.bucket && !BUCKET_WORDS.some((word) => reason.includes(word))) {
        problems.push(
          `${document}:${section.line}: step ${step[1]}'s ${register.absent} names no bucket ` +
            `(one of ${BUCKET_WORDS.join(", ")}): ${reason}`,
        );
      }
    }
  }
  if (steps === 0) problems.push(`${document}: --registers was asked for and the document has no '## Step N' section`);
  return steps;
}

/** Rule 2: every button the document names is one the extension contributes. */
function checkCommandTitles(document, text, titles, problems) {
  let claimed = 0;
  const uiMarker = REGISTERS[1].present;
  for (const entry of logicalLines(text)) {
    const onUiLine = entry.text.includes(uiMarker);
    for (const span of boldSpans(entry.text)) {
      // A `**You —**` line says the button and the answers, so every bold
      // span on it is a claimed title; elsewhere only the palette form is.
      const claimsTitle = span.startsWith("Dabbler: ") || (onUiLine && !/^You\b/.test(span));
      if (!claimsTitle) continue;
      claimed += 1;
      if (!titles.has(span)) {
        problems.push(`${document}:${entry.line}: no contributed command is titled "${span}"`);
      }
    }
  }
  return claimed;
}

/** Rule 3: the bootstrap step does not also tell the reader to commit. */
function checkBootstrapCommit(document, text, problems) {
  for (const section of sections(text)) {
    const body = section.body;
    if (!body.some((line) => line.includes("dabbler bootstrap"))) continue;
    for (const [offset, line] of body.entries()) {
      if (/^git commit\b/.test(line.trim())) {
        problems.push(
          `${document}:${section.line + offset + 1}: a manual commit in the section that runs ` +
            "`dabbler bootstrap`; bootstrap commits what it wrote and says so",
        );
      }
    }
  }
}

function checkDocument(root, document, withRegisters, titles) {
  const text = readFileSync(join(root, document), "utf8");
  const problems = [];
  const steps = withRegisters ? checkRegisters(document, text, problems) : 0;
  const claimed = checkCommandTitles(document, text, titles, problems);
  checkBootstrapCommit(document, text, problems);
  return { problems, steps, claimed };
}

// --- the self-test ----------------------------------------------------------
//
// Six documents: each rule refused once and passed once. The scratch folder
// goes whatever happens, and the manifest read is the real one, so a rename
// in `contributes.commands` fails this too.

const GOOD_STEP = [
  "# A walkthrough",
  "",
  "## Step 1 — Do the thing",
  "",
  "- **Framework —** at registration, the ledger row is written.",
  "- **You —** **Start Focused Session** on the module row.",
  "- **Underneath —** `dabbler module open model`.",
  "",
].join("\n");

const SELF_TESTS = [
  {
    name: "a step missing a register is refused",
    registers: true,
    text: GOOD_STEP.replace("- **Underneath —** `dabbler module open model`.\n", ""),
    expect: "carries neither",
  },
  {
    name: "a gap with no bucket is refused",
    registers: true,
    text: GOOD_STEP.replace(
      "- **You —** **Start Focused Session** on the module row.",
      "- **No UI register —** nothing offers it.",
    ),
    expect: "names no bucket",
  },
  {
    name: "a third-register absence needs a reason and not a bucket",
    registers: true,
    text: GOOD_STEP.replace(
      "- **Underneath —** `dabbler module open model`.",
      "- **No command underneath —** nothing runs here.",
    ),
    expect: null,
  },
  {
    name: "an absence with no reason at all is refused",
    registers: true,
    text: GOOD_STEP.replace(
      "- **Underneath —** `dabbler module open model`.",
      "- **No command underneath —**",
    ),
    expect: "with no reason",
  },
  {
    name: "a button that does not exist is refused",
    registers: true,
    text: GOOD_STEP.replace("**Start Focused Session**", "**Start Module Session**"),
    expect: "no contributed command is titled",
  },
  {
    name: "a manual commit in the bootstrap section is refused",
    registers: false,
    text: ["## Step 2b — Set up", "", "```", "dabbler bootstrap", "git commit -m \"x\"", "```", ""].join("\n"),
    expect: "a manual commit in the section",
  },
  { name: "three registers pass", registers: true, text: GOOD_STEP, expect: null },
  {
    name: "an answered absence passes",
    registers: true,
    text: GOOD_STEP.replace(
      "- **You —** **Start Focused Session** on the module row.",
      "- **No UI register —** writing the POM is a person's judgement.",
    ),
    expect: null,
  },
];

function selfTest(root) {
  const titles = contributedTitles(root);
  const scratch = mkdtempSync(join(tmpdir(), "uat-check-"));
  const failures = [];
  try {
    for (const [index, test] of SELF_TESTS.entries()) {
      const file = join(scratch, `case-${index}.md`);
      writeFileSync(file, test.text, "utf8");
      const { problems } = checkDocument(scratch, `case-${index}.md`, test.registers, titles);
      const joined = problems.join("\n");
      if (test.expect === null) {
        if (problems.length > 0) failures.push(`${test.name}: refused with\n  ${joined}`);
      } else if (!joined.includes(test.expect)) {
        failures.push(`${test.name}: expected a refusal containing "${test.expect}", got\n  ${joined || "(none)"}`);
      }
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  if (failures.length > 0) {
    process.stderr.write(`check-uat-registers --self-test: ${failures.length} case(s) wrong:\n  ${failures.join("\n  ")}\n`);
    process.exit(1);
  }
  process.stdout.write(
    `check-uat-registers: self-test passed, ${SELF_TESTS.length} case(s) over ${titles.size} contributed title(s)\n`,
  );
}

// --- entry ------------------------------------------------------------------

const argv = process.argv.slice(2);
const root = process.cwd();

if (argv.includes("--self-test")) {
  selfTest(root);
} else {
  const withRegisters = argv.includes("--registers");
  const documents = argv.filter((arg) => !arg.startsWith("--"));
  if (documents.length === 0) {
    process.stderr.write(
      "usage: node packages/router/scripts/check-uat-registers.mjs [--registers] <markdown file>...\n" +
        "       node packages/router/scripts/check-uat-registers.mjs --self-test\n",
    );
    process.exit(2);
  }
  const problems = [];
  let steps = 0;
  let claimed = 0;
  for (const document of documents) {
    const result = checkDocument(root, document, withRegisters, contributedTitles(root));
    problems.push(...result.problems);
    steps += result.steps;
    claimed += result.claimed;
  }
  if (problems.length > 0) {
    process.stderr.write(`check-uat-registers: ${problems.length} problem(s):\n  ${problems.join("\n  ")}\n`);
    process.exit(1);
  }
  process.stdout.write(
    `check-uat-registers: ${documents.length} document(s), ${steps} numbered step(s) ` +
      `in three registers, ${claimed} command title(s) named, no commit inside a bootstrap step\n`,
  );
}
