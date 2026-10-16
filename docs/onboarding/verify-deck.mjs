#!/usr/bin/env node
// Hold the built deck to what the build script says it is.
//
//   node docs/onboarding/verify-deck.mjs [--min-slides N]
//
// This is the deck's one test. It lives here rather than in a suite for a
// reason that is a declaration and not an oversight: `docs/` is mapped to
// no test suite in dabbler.yaml, because documentation is not the router's
// behaviour and a router test that asserted on a slide would be a test in
// the wrong repository's language. So the deck's proof is a script, and it
// runs as this step's own check.
//
// Four assertions, each one a way the deck has actually gone wrong before
// it was written down:
//
//   1. the deck has exactly the slides the manifest declares
//   2. every screenshot the manifest names is really embedded in the file
//      (compared by content, because pptxgenjs renames media on the way in)
//   3. no slide names a decision by its id without saying what it is
//   4. every command on a slide can be copied and run -- no ellipsis
//      standing in for the part you actually needed
//
// It opens the .pptx with the JSZip that pptxgenjs already depends on, so
// it adds no dependency of its own.

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { SLIDES, DECK_PATH } from "./build-deck.mjs";

const require = createRequire(import.meta.url);
const JSZip = require("jszip");

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** `--min-slides N`: an independent floor, so the manifest cannot shrink quietly. */
function minSlides(argv) {
  const at = argv.indexOf("--min-slides");
  if (at < 0) return 0;
  const value = Number(argv[at + 1]);
  if (!Number.isFinite(value)) throw new Error("--min-slides needs a number");
  return value;
}

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

/**
 * The text of each slide, paragraph by paragraph.
 *
 * A paragraph is what a reader sees as a line, so the command rules below
 * are applied to the same units a person reads.
 */
function slideLines(xml) {
  const lines = [];
  for (const paragraph of xml.split("</a:p>")) {
    const runs = [...paragraph.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => m[1]);
    if (runs.length === 0) continue;
    const text = runs
      .join("")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
    if (text.trim() !== "") lines.push(text);
  }
  return lines;
}

async function main() {
  const failures = [];
  const floor = minSlides(process.argv);

  if (!fs.existsSync(DECK_PATH)) {
    throw new Error(`no deck at ${DECK_PATH}; run: node docs/onboarding/build-deck.mjs`);
  }
  const zip = await JSZip.loadAsync(fs.readFileSync(DECK_PATH));
  const names = Object.keys(zip.files);

  // 1. The slide count is the manifest's length.
  const slideFiles = names
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  if (slideFiles.length !== SLIDES.length) {
    failures.push(
      `the deck has ${slideFiles.length} slide(s) and the manifest declares ${SLIDES.length}`,
    );
  }
  if (slideFiles.length < floor) {
    failures.push(`the deck has ${slideFiles.length} slide(s); --min-slides asked for ${floor}`);
  }

  // 2. Every screenshot the manifest names is embedded, compared by content:
  //    pptxgenjs renames media to image1.png and so on, so a name check
  //    would pass on a deck carrying somebody else's picture.
  const embedded = new Set();
  for (const name of names.filter((n) => n.startsWith("ppt/media/"))) {
    embedded.add(sha256(await zip.files[name].async("nodebuffer")));
  }
  for (const spec of SLIDES) {
    for (const rel of spec.media || []) {
      const file = path.join(HERE, rel);
      if (!fs.existsSync(file)) {
        failures.push(`slide '${spec.id}' names ${rel}, which does not exist`);
        continue;
      }
      if (!embedded.has(sha256(fs.readFileSync(file)))) {
        failures.push(`slide '${spec.id}' names ${rel}, which is not embedded in the deck`);
      }
    }
  }

  // 3 and 4, over the text the slides actually carry.
  for (let i = 0; i < slideFiles.length; i += 1) {
    const xml = await zip.files[slideFiles[i]].async("string");
    const where = `slide ${i + 1} (${SLIDES[i]?.id ?? "?"})`;
    for (const line of slideLines(xml)) {
      // A decision id is meaningless to a reader who has never seen the
      // log. Naming one is allowed; naming one and walking away is not.
      for (const match of line.matchAll(/\bD\d{2,4}\b/g)) {
        const after = line.slice(match.index + match[0].length, match.index + match[0].length + 4);
        if (!/^\s*[—:,(-]/.test(after)) {
          failures.push(`${where}: names ${match[0]} without saying what it is: "${line.trim()}"`);
        }
      }
      // Every command is copy-pasteable, which is three separate ways of
      // going wrong and not one. An ellipsis is the part the reader needed
      // and did not get. A trailing backslash is a continuation that is not
      // syntax in PowerShell, where half this audience will paste it. And a
      // bare `VAR=value` on a line of its own is not exported to the next
      // process in a POSIX shell and is not syntax at all in PowerShell —
      // it reads like a command and is not one.
      const isCommand = /^\s*(dabbler|npm|node|code|git)\s/.test(line);
      if (isCommand && /(…|\.\.\.)/.test(line)) {
        failures.push(`${where}: command carries an ellipsis: "${line.trim()}"`);
      }
      if (isCommand && /\\\s*$/.test(line)) {
        failures.push(
          `${where}: command ends in a backslash continuation, which PowerShell will not run: ` +
            `"${line.trim()}"`,
        );
      }
      if (/^\s*[A-Z][A-Z0-9_]*=\S/.test(line)) {
        failures.push(
          `${where}: "${line.trim()}" reads as a command but is a bare assignment; ` +
            "say `export VAR=value` or `$env:VAR = \"value\"` and say which shell",
        );
      }
    }
  }

  if (failures.length > 0) {
    for (const failure of failures) console.error(`deck: ${failure}`);
    process.exitCode = 1;
    return;
  }
  // Says what it checked, and no more than that. "Every command is
  // copy-pasteable" is a claim about shells this script does not run; what
  // it can stand behind is the three ways a command line has actually been
  // wrong on these slides.
  console.log(
    `deck: ${slideFiles.length} slide(s), every named screenshot embedded, no bare ` +
      "decision id, and no command line with an ellipsis, a backslash continuation " +
      "or a bare assignment.",
  );
}

await main();
