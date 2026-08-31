#!/usr/bin/env node
// Build the operator onboarding deck.
//
//   node docs/onboarding/build-deck.mjs
//
// The deck is a committed artifact and this script is how it is made, so a
// later session re-cuts it from the source of truth instead of dragging
// boxes around a .pptx nobody can diff. Screens come from the two capture
// scripts beside this one; every command on a slide is copied from
// `docs/quick-start.md` or `docs/driving-a-session.md` rather than invented,
// because a deck that teaches a command the product does not have is worse
// than a deck with no commands at all.
//
// `SLIDES` below is the ONE statement of what the deck contains, in order.
// `verify-deck.mjs` imports it rather than repeating it: a manifest that
// exists twice is a slide count that disagrees with itself.

import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const require = createRequire(import.meta.url);
const PptxGenJS = require("pptxgenjs");

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DECK_PATH = path.join(HERE, "dabbler-onboarding.pptx");

// ---------------------------------------------------------------------------
// The look. Light, because a deck is read in a lit room and printed; the
// screenshots are dark and carry their own frame.
// ---------------------------------------------------------------------------

const INK = "1F2933";
const BODY = "3E4C59";
const MUTED = "7B8794";
const ACCENT = "0B7285";
const CODE_BG = "F1F3F5";
const SANS = "Segoe UI";
const MONO = "Consolas";

/** 16:9, ten inches by five and five eighths. */
const W = 10;
const H = 5.625;

// ---------------------------------------------------------------------------
// The manifest.
//
// `media` names files relative to this directory. A slide with none is a
// slide of words, and a slide's `layout` says how its parts are placed:
//
//   "text"        headline, bullets, an optional code block
//   "media-left"  the media stacked down the left, bullets on the right
// ---------------------------------------------------------------------------

export const SLIDES = [
  {
    id: "what-is-it",
    title: "What is Dabbler AI Orchestration?",
    media: [],
    layout: "text",
    subtitle:
      "A VS Code extension that runs AI coding sessions to one lifecycle — and checks the work with a second provider before it lets the session close.",
    bullets: [
      "You keep your own AI CLI. The framework does not replace it, spawn it, or read your chat; it owns the list of what happens next.",
      "The extension bundles the router and puts the `dabbler` command on the integrated terminal's PATH. Inside VS Code there is nothing else to install.",
      "Needs VS Code 1.135 or newer and Node.js 22.18 or newer.",
      "Install it from the Marketplace once it is published. Until then, install the .vsix built from the repository:",
    ],
    code: [
      "code --install-extension dabbler-ai-orchestration.vsix",
      "",
      "# Outside VS Code — another editor, a bare shell, or VS Code's",
      "# Source Control panel, whose git does not inherit the terminal:",
      "npm i -g dabbler-ai-router",
    ],
    footnote: "github.com/darndestdabbler/dabbler-ai-orchestration",
  },
  {
    id: "why",
    title: "Why use Dabbler?",
    media: [],
    layout: "text",
    subtitle: "Four things you would otherwise have to remember to do, every session, forever.",
    bullets: [
      "Cross-provider verification runs itself. A different provider than the one that wrote the code reviews the diff, and a round that finds something buys another round. There is no flag to skip it.",
      "One lifecycle, every session: register, declare the work, do it, run the tests the change makes necessary, verify, run the complete suite as the run of record, close. The framework holds the list — the engine asks it what is next.",
      "A cross-repository view of what your repositories build and what they take from each other, with a consumer's pin shown against the producer's version when the two have drifted apart.",
      "A decision the framework cannot make arrives as one question with a recommendation and the consequence of each option — instead of an engine quietly choosing for you.",
    ],
  },
  {
    id: "explorer",
    title: "The AI Orchestration Explorer",
    media: ["media/solution-explorer.png", "media/work-explorer.png"],
    layout: "media-left",
    bullets: [
      "SOLUTION EXPLORER — what the project is built FROM.",
      "A component row carries its version and which of the six steps it has reached; Contract opens what it promises; Used by is derived from everyone else's declaration, never written by hand; Progress is the six steps.",
      "Clicking a component's Contract row opens the contract. Clicking a consumer under Used by opens that repository.",
      "",
      "WORK EXPLORER — the work itself.",
      "The repository row carries how many sessions are done and which one is in flight. Under it: rows for anything waiting on you, then the status buckets — In Progress open, the rest collapsed with their counts.",
      "A session's own rows are the six lifecycle phases. Each is done the moment the verb that IS that phase writes its record; nothing is ticked by hand.",
      "Clicking a session row opens its block in the session plan.",
    ],
  },
  {
    id: "start-copilot",
    title: "Getting started with Copilot",
    media: [],
    layout: "text",
    subtitle: "The shipped default: your GitHub Copilot seat, through the Copilot CLI.",
    bullets: [
      "You need VS Code 1.135+, Node.js 22.18+, a GitHub Copilot seat, and the Copilot CLI installed and signed in.",
      "Setup settles the transport when it finds a seat and remembers it for every new shell. Force it either way with DABBLER_TRANSPORT.",
      "Name the model on the first call, the one that registers the session: a seat's own label is not trusted, so identity resolves through the model registry.",
      "What it costs: driving from your own CLI has no invocation bound — your seat, your bill. Only the unattended mode spends on the framework's behalf: one premium request per invocation, bounded by driver.max_invocations in dabbler.yaml (default 24).",
    ],
    code: [
      "DABBLER_TRANSPORT=copilot-cli",
      "",
      "dabbler session next --sessions-dir docs/sessions \\",
      "    --engine copilot --provider openai --model gpt-5-6-luna",
    ],
  },
  {
    id: "start-claude-codex",
    title: "Getting started with Claude Code or Codex",
    media: [],
    layout: "text",
    subtitle: "Your own CLI, and direct provider accounts.",
    bullets: [
      "You need VS Code 1.135+, Node.js 22.18+, and Claude Code or Codex installed and signed in.",
      "Two providers at minimum. Verification is cross-provider by design — the reviewer is never the provider that wrote the code — so one key is not enough.",
      "The keys live in environment variables and nowhere else: never in dabbler.yaml, never in local-overrides.yaml, never in a file you might commit. Configuration names a credential; it never holds one.",
      "Set them where new shells inherit them — on Windows with setx or System Properties, elsewhere in your shell profile.",
    ],
    code: [
      "DABBLER_ANTHROPIC_API_KEY   Claude",
      "DABBLER_OPENAI_API_KEY      GPT",
      "DABBLER_GEMINI_API_KEY      Gemini",
      "",
      "dabbler session next --sessions-dir docs/sessions \\",
      "    --engine claude-code --provider anthropic",
    ],
  },
  {
    id: "project-setup",
    title: "Project setup",
    media: [],
    layout: "text",
    subtitle: "Once per repository, then two sessions that set the project up.",
    bullets: [
      "Run Set Up New Project from the Explorer, or the command below from your project root.",
      "It writes the managed instructions into AGENTS.md, with CLAUDE.md and GEMINI.md importing that one copy; adds .dabbler/ to .gitignore; scaffolds dabbler.yaml, solution.yaml and the first two sessions — and commits them, because a declaration is refused while the files it describes sit uncommitted.",
      "It may raise two questions it cannot answer for you: where this repository should push when it has no remote, and how its tests run when nothing at the root says. Each arrives as a row you answer.",
      "Then session 1 asks you what the project is and writes the project plan — it does not guess it from the folder name. Session 2 breaks that plan into the numbered sessions the repository runs.",
      "Never hand-author sessions.json. The first session start writes it from the plan.",
    ],
    code: ["dabbler bootstrap --project-dir ."],
  },
  {
    id: "driving",
    title: "Driving a session",
    media: ["media/terminals.png"],
    layout: "media-left",
    bullets: [
      "Start Session on the repository row asks which engine, then opens that engine's own CLI at the repository root — the opening sentence already in its arguments, or typed at its prompt for you to send.",
      "That sentence is the whole instruction: call `dabbler session next` and do what it says until it says `done`.",
      "The Dabbler terminal opens beside it: the phase the run moved to, the jobs it starts, and each job's output exactly as the runner wrote it.",
      "It never carries a line of engine chat. Chat in your CLI; work in the Dabbler terminal.",
      "Interrupting is your own CLI's Esc.",
      "",
      "dabbler [11:31:20] run-started session=001",
      "dabbler [11:31:22] instruction-issued seq=2 step=widget",
      "dabbler [11:31:30] job-started name=affected tests",
    ],
  },
  {
    id: "when-it-stops",
    title: "When it stops",
    media: ["media/stop.png"],
    layout: "media-left",
    bullets: [
      "A halt is raised as a decision: the toast offers the recommended answer, the row sits above the session buckets, the badge carries the count.",
      "Later records nothing — dismissing a toast is not a decision, and the row stays. Other… opens a picker whose items each say what follows.",
      "Nothing is lost. The phase, the accepted steps and any running job are on the record, and the same command resumes from there.",
      "Ask your engine for help and it follows the guide's protocol: read the framework's own account first, never the scrollback; verify the claim before acting; then work out whose it is to fix.",
      "For a second opinion, from a provider that is not the working engine's:",
      "",
      "dabbler triage --sessions-dir docs/sessions",
      "",
      "It answers engine-error, framework-defect or plan-defect, with the smallest amendment that would move the session.",
      "The engine alone does not know when it is stuck. That is why the framework is in the room.",
    ],
  },

  // --- A worked solution, as designed --------------------------------------
  //
  // Four repositories, declared and not built. Building them through the
  // lifecycle is its own set of sessions, and a deck of real screens of it
  // would follow that work rather than precede it — so the one screenshot
  // here is the real Solution Explorer over the real declaration, and
  // nothing else on these slides is a picture of a screen that exists.

  {
    id: "csv-solution",
    title: "A solution across four repositories",
    media: ["media/solution-explorer.png"],
    layout: "media-left",
    bullets: [
      "Each repository declares what it builds in its own solution.yaml: the component, its kind, its version, and which of the six steps it has reached.",
      "dependsOn is the only direction anyone writes. Used by is derived from everyone else's declaration — two directions kept by hand disagree eventually, and the disagreement is silent.",
      "csv-model sits under everything. csv-deserializer and csv-persistence each depend on it; csv-pipeline depends on all three.",
      "Drift is the producer's version held against the pin in the consumer's build file — read from the .csproj on every check, never copied. The row says which repository owns the upgrade.",
      "A pin a build file cannot express is reported as undetermined, never guessed: a false drift report costs more than a missing one, because someone acts on it.",
      "The screen is real; the four repositories are designed, not built.",
    ],
  },
  {
    id: "csv-model",
    title: "csv-model",
    media: [],
    layout: "text",
    subtitle: "A library. First Name, Last Name, Date of Birth — and nothing else.",
    bullets: [
      "Its contract: the shape of one record. It says what a date of birth means and what a missing name is; it says nothing about where a record came from or where it goes.",
      "It depends on nothing, which is what makes it the contract that costs the most to change: csv-deserializer populates it, csv-persistence stores it, and csv-pipeline holds all three.",
      "Its sessions live in its own repository under docs/sessions, numbered from 1. Session 1 asks the operator what the project is and writes the project plan; session 2 breaks that plan into the numbered sessions; the rest are the work.",
      "A change to the model is a version, and every consumer's pin is measured against it — so the Explorer shows who has not picked it up yet.",
    ],
  },
  {
    id: "csv-deserializer",
    title: "csv-deserializer",
    media: [],
    layout: "text",
    subtitle: "A library that fills csv-model from a CSV string or a stream.",
    bullets: [
      "Its contract: given CSV text or a stream, it yields models — and it says plainly what it does with a row it cannot read, because a row silently dropped is a defect nobody sees until the numbers are wrong.",
      "It depends on csv-model and on nothing else. csv-pipeline is what breaks when it changes.",
      "Planned in the order the six steps run: the contract first, then a stand-in that satisfies the contract and nothing more, then the real reader, then its failure vocabulary.",
      "It is built against csv-model's stand-in before csv-model is finished, which is what the stand-in step is for — the contracts have to compose before the code does.",
    ],
  },
  {
    id: "csv-persistence",
    title: "csv-persistence",
    media: [],
    layout: "text",
    subtitle: "A library that stores csv-model with Entity Framework Core, into SQLite.",
    bullets: [
      "Its contract: given a model, it persists it, and it says what happens when the same record arrives twice — the question every store has to answer out loud.",
      "It depends on csv-model and on nothing else. csv-pipeline is what breaks when it changes.",
      "Planned as: the schema and its migration, then the type a caller actually holds, then the round trip that proves a model written is the model read back.",
      "Its sessions are its own, in its own repository. Nothing about it is coordinated by hand with the other three — the declaration is what joins them.",
    ],
  },
  {
    id: "csv-pipeline",
    title: "csv-pipeline",
    media: [],
    layout: "text",
    subtitle: "The integration: a Quartz.NET-scheduled reader that puts the other three to work.",
    bullets: [
      "Its contract: on a schedule, it takes the files that have arrived in a directory, hands each to csv-deserializer, and gives what comes back to csv-persistence. It owns the schedule, the directory, and what happens to a file it has already read.",
      "It depends on all three, which is why it is declared kind: integration — it is the component that is the whole thing running.",
      "Planned last and finished last: the schedule, then the reader, then the end-to-end run on stand-ins alone. What that run proves is that the contracts compose; a gap it papers over is a contract that is wrong.",
      "Only then are the stand-ins replaced by the real libraries, one at a time.",
    ],
  },
  {
    id: "day-to-day",
    title: "The day-to-day loop across the four",
    media: [],
    layout: "text",
    subtitle: "One repository at a time, in dependency order, each with its own sessions.",
    bullets: [
      "Work happens in one repository at a time. You run the same command from that repository's root, and its sessions root is the one it derives from where you are standing.",
      "csv-model's contract changes: you work in csv-model, and its session closes with the new version out. Nothing else is touched in that session.",
      "The Solution Explorer then shows the consumers behind it — the drift row per repository, with the pin each one still carries. Each upgrade is its own session in the repository that owns the pin.",
      "Pick them up in dependency order: csv-model first; csv-deserializer and csv-persistence in either order; csv-pipeline last, because it is the one that proves the other three still compose.",
      "Nothing here is bookkeeping you maintain. The pins are read from the build files on every check, Used by is derived, and the Explorer is the join.",
    ],
    code: ["dabbler session next --sessions-dir docs/sessions"],
  },
];

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/** True for a bullet that is really a line of terminal output or a command. */
function isMonoLine(line) {
  return /^(dabbler|npm|node|code|git|DABBLER_)/.test(line.trim());
}

function addChrome(slide, index) {
  slide.background = { color: "FFFFFF" };
  slide.addShape("rect", { x: 0, y: 0, w: W, h: 0.06, fill: { color: ACCENT } });
  slide.addText("Dabbler AI Orchestration", {
    x: 0.45, y: H - 0.42, w: 5, h: 0.3,
    fontSize: 9, fontFace: SANS, color: MUTED,
  });
  slide.addText(String(index + 1), {
    x: W - 0.95, y: H - 0.42, w: 0.5, h: 0.3,
    fontSize: 9, fontFace: SANS, color: MUTED, align: "right",
  });
}

function addHeading(slide, spec) {
  slide.addText(spec.title, {
    x: 0.45, y: 0.28, w: W - 0.9, h: 0.5,
    fontSize: 26, bold: true, fontFace: SANS, color: INK,
  });
  let y = 0.92;
  if (spec.subtitle) {
    slide.addText(spec.subtitle, {
      x: 0.45, y, w: W - 0.9, h: 0.45,
      fontSize: 12, fontFace: SANS, color: ACCENT, valign: "top",
    });
    y += 0.62;
  }
  return y;
}

/** Bullets, with blank entries as spacers and command lines set in mono. */
function addBullets(slide, lines, box, fontSize) {
  const runs = lines.map((line) => {
    if (line.trim() === "") {
      return { text: " ", options: { fontSize: 6, breakLine: true, bullet: false } };
    }
    if (isMonoLine(line)) {
      return {
        text: line,
        options: {
          fontSize: fontSize - 1, fontFace: MONO, color: INK,
          bullet: false, breakLine: true, paraSpaceAfter: 2,
        },
      };
    }
    const heading = /^[A-Z][A-Z ]+—/.test(line);
    return {
      text: line,
      options: {
        fontSize, fontFace: SANS, color: heading ? INK : BODY, bold: heading,
        bullet: heading ? false : { characterCode: "2022" },
        breakLine: true, paraSpaceAfter: 6,
      },
    };
  });
  // `shrink` is the safety net, not the plan: the copy is written to fit,
  // and this is what keeps a sentence that grew by a word from being
  // silently clipped at the bottom of a slide nobody re-read.
  slide.addText(runs, { ...box, valign: "top", fit: "shrink" });
}

function addCode(slide, lines, box) {
  slide.addShape("rect", { ...box, fill: { color: CODE_BG }, line: { color: CODE_BG } });
  slide.addShape("rect", { x: box.x, y: box.y, w: 0.04, h: box.h, fill: { color: ACCENT } });
  slide.addText(lines.join("\n"), {
    x: box.x + 0.18, y: box.y + 0.08, w: box.w - 0.3, h: box.h - 0.16,
    fontSize: 11, fontFace: MONO, color: INK, valign: "top",
  });
}

/** The rendered size of an image, fitted into a box without distorting it. */
function fit(file, maxW, maxH) {
  const { width, height } = pngSize(file);
  const scale = Math.min(maxW / width, maxH / height);
  return { w: width * scale, h: height * scale };
}

function pngSize(file) {
  const buffer = fs.readFileSync(file);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function renderTextSlide(slide, spec) {
  const top = addHeading(slide, spec);
  const codeHeight = spec.code ? 0.28 + spec.code.length * 0.19 : 0;
  const bulletHeight = H - 0.75 - top - (codeHeight ? codeHeight + 0.25 : 0);
  addBullets(slide, spec.bullets || [], { x: 0.45, y: top, w: W - 0.9, h: bulletHeight }, 13);
  if (spec.code) {
    addCode(slide, spec.code, {
      x: 0.45, y: H - 0.62 - codeHeight, w: W - 0.9, h: codeHeight,
    });
  }
  if (spec.footnote) {
    slide.addText(spec.footnote, {
      x: 4.2, y: H - 0.42, w: W - 5.1, h: 0.3,
      fontSize: 9, fontFace: MONO, color: MUTED, align: "right",
    });
  }
}

function renderMediaLeftSlide(slide, spec, dir) {
  const top = addHeading(slide, spec);
  // One screenshot gets a wide column, because a single image is bound by
  // the column's width and would otherwise leave an inch of empty slide
  // under it. Two stacked are bound by height, and a wider column buys
  // them nothing while costing the bullets beside them.
  const columnW = spec.media.length > 1 ? 4.25 : 4.9;
  const available = H - 0.62 - top;
  const files = spec.media.map((rel) => path.join(dir, rel));
  const gap = 0.18;
  const each = (available - gap * (files.length - 1)) / files.length;
  let y = top;
  for (const file of files) {
    const size = fit(file, columnW, each);
    slide.addImage({
      path: file,
      x: 0.45 + (columnW - size.w) / 2,
      y,
      w: size.w,
      h: size.h,
      // A thin frame so a dark screenshot does not bleed into the slide.
      rounding: false,
    });
    y += each + gap;
  }
  addBullets(
    slide,
    spec.bullets || [],
    { x: 0.45 + columnW + 0.35, y: top, w: W - (0.45 + columnW + 0.35) - 0.45, h: available },
    10.5,
  );
}

/**
 * The .pptx, with everything that is not its content taken out of it.
 *
 * pptxgenjs stamps the moment of the build into `docProps/core.xml` and
 * into every zip entry's date, so two builds of identical slides produce
 * different bytes. For a COMMITTED artifact that is a defect twice over:
 * the diff says the deck changed when it did not, and a step's check that
 * rebuilds it registers as a check that changed the tree — which the
 * framework refuses, correctly, because a check must not edit what it is
 * checking.
 *
 * So the timestamps are pinned and the archive is re-emitted in the order
 * pptxgenjs produced it. Same slides in, same bytes out.
 */
async function deterministicPackage(pptx) {
  const JSZip = require("jszip");
  const EPOCH = "2020-01-01T00:00:00Z";
  const stamped = await JSZip.loadAsync(await pptx.write({ outputType: "nodebuffer" }));

  const names = Object.keys(stamped.files).filter((name) => !stamped.files[name].dir);
  const out = new JSZip();
  for (const name of names) {
    let content = await stamped.files[name].async("nodebuffer");
    if (name === "docProps/core.xml") {
      content = Buffer.from(
        content
          .toString("utf8")
          .replace(/(<dcterms:created[^>]*>)[^<]*(<\/dcterms:created>)/, `$1${EPOCH}$2`)
          .replace(/(<dcterms:modified[^>]*>)[^<]*(<\/dcterms:modified>)/, `$1${EPOCH}$2`),
        "utf8",
      );
    }
    out.file(name, content, { date: new Date(EPOCH), createFolders: false });
  }
  return out.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
    streamFiles: false,
  });
}

export async function build(outFile = DECK_PATH) {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  pptx.author = "Dabbler AI Orchestration";
  pptx.title = "Dabbler AI Orchestration — operator onboarding";

  SLIDES.forEach((spec, index) => {
    const slide = pptx.addSlide();
    addChrome(slide, index);
    if (spec.layout === "media-left") renderMediaLeftSlide(slide, spec, HERE);
    else renderTextSlide(slide, spec);
  });

  fs.writeFileSync(outFile, await deterministicPackage(pptx));
  console.log(`wrote ${path.basename(outFile)} (${SLIDES.length} slides)`);
  return outFile;
}

/**
 * `--check`: build into a temporary directory and throw the result away.
 *
 * A step's check must not change the tree — the framework refuses one that
 * does, and rightly: a check that edits what it is checking cannot tell
 * you whether the thing was already right. Building the committed deck is
 * exactly such a change, so the runnable proof that this script still
 * works is a build nobody keeps.
 */
async function buildToScratch() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deck-check-"));
  try {
    const out = path.join(dir, "deck.pptx");
    await build(out);
    const { size } = fs.statSync(out);
    if (size < 10_000) throw new Error(`the built deck is only ${size} bytes`);
    console.log(`build-deck --check: ${SLIDES.length} slide(s), ${size} bytes, discarded`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  }
}

const invokedDirectly =
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) {
  if (process.argv.includes("--check")) await buildToScratch();
  else await build();
}
