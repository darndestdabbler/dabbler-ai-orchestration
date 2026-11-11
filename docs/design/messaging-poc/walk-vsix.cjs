// Walk one session through the installed VSIX, playing the operator with Playwright.
//
//   node walk-vsix.cjs --engine claude|copilot --vsix <file.vsix> --scratch <folder>
//                      --run <name> [--model <id>] [--scenario main|cancel|direct]
//                      [--deadline <seconds>]
//
// The walk stages its own disposable repository under <scratch>/<run>: a small
// TypeScript package with a real build and test, a local bare remote, `dabbler
// bootstrap` through the VSIX's OWN bundled router, a three-step releasable
// session and a pack-only handoff. It installs the one VSIX it is given into a
// fresh profile and starts the session from the Work Explorer row.
//
//   main    the whole session. The operator asks one question while the author
//           works and one while an answer command waits on a framework job,
//           sends one course correction, closes and reopens the Dabbler
//           Terminal during a job, and kills one chained `session report
//           --next` once its answer is durable and the run of record is running.
//   cancel  the operator asks the AI, in its chat, to cancel the session it is
//           working; the ledger, the tree, the git log and the remote are read after.
//   direct  no framework: the same engine is given the same three-step change in
//           one prompt, for the wall-time and AI-credit baseline.
//
// Everything it keeps -- walk.jsonl (every action, who took it, and whether a
// rule could have), the engine's own transcript, terminal text, screenshots, the
// run records, git log, remote refs and summary.json -- goes under
// <scratch>/<run>/results, never into a product tree. It copies no environment
// and no credential into any of it.
const cp = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

/** The program that lists processes, and the arguments before its script. Replaced only by the self-test. */
const LISTER = { program: "powershell", args: ["-NoProfile", "-Command"] };

const arg = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at > 0 ? process.argv[at + 1] : fallback;
};
const CHECKOUT = path.resolve(__dirname, "..", "..", "..");
const TOOLS = arg("--tools", undefined) ?? process.env.DABBLER_EXTENSION_DIR ?? path.join(CHECKOUT, "tools", "dabbler-ai-orchestration");
const { _electron } = require(path.join(TOOLS, "node_modules/@playwright/test"));
const launch = require(path.join(TOOLS, "scripts/vscode-launch.js"));

const engine = arg("--engine", "claude");
const LABEL = { claude: "Claude Code", copilot: "GitHub Copilot" }[engine];
const PROGRAM = { claude: "claude", copilot: "copilot" }[engine];
if (!LABEL) throw new Error(`unknown engine ${engine}`);
const scenario = arg("--scenario", "main");
if (!["main", "cancel", "direct"].includes(scenario)) throw new Error(`unknown scenario ${scenario}`);
const VSIX = path.resolve(arg("--vsix", ""));
const SCRATCH = path.resolve(arg("--scratch", ""));
const run = arg("--run", `${engine}-${scenario}`);
const model = arg("--model", "");
const deadline = Number(arg("--deadline", "2700"));

// --compare <a.vsix> <b.vsix>: whether two packages hold the same files with the same bytes.
// A VSIX is a zip, and two builds of one tree differ in the zip's own timestamps, so their
// checksums never match; what can be held is every entry's content. It is how the package a
// release pipeline built is tied to the one that was walked.
if (process.argv.includes("--compare")) {
  const tar = process.platform === "win32" ? path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe") : "tar";
  const entriesOf = (file) => {
    const into = fs.mkdtempSync(path.join(os.tmpdir(), "vsix-compare-"));
    const done = cp.spawnSync(tar, ["-xf", path.resolve(file), "-C", into], { encoding: "utf8" });
    if (done.status !== 0) throw new Error(`cannot read ${file}: ${done.stderr}`);
    const found = {};
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        // Names in one case: the packager writes `README.md` on one system and `readme.md` on another.
        else found[path.relative(into, full).replace(/\\/g, "/").toLowerCase()] = crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex");
      }
    };
    walk(into);
    fs.rmSync(into, { recursive: true, force: true });
    return found;
  };
  const at = process.argv.indexOf("--compare");
  const [left, right] = [entriesOf(process.argv[at + 1]), entriesOf(process.argv[at + 2])];
  const names = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  const differing = names.filter((name) => left[name] !== right[name]).map((name) => (left[name] === undefined ? `only in the second: ${name}` : right[name] === undefined ? `only in the first: ${name}` : `differs: ${name}`));
  process.stdout.write(`${JSON.stringify({ entries: names.length, same: differing.length === 0, differing }, null, 2)}\n`);
  process.exit(differing.length === 0 ? 0 : 1);
}

// --self-test-processes: the inspection behind "nothing left running", shown to see what it must and to
// fail when it cannot look -- with the program that lists processes replaced by one that is not there,
// and by one that runs and answers something that is not a listing.
if (process.argv.includes("--self-test-processes")) {
  // `leftBehind` is the listing the cleanup case rests on: it is what each of these is put through.
  const attempt = (name, lister) => {
    LISTER.program = lister.program;
    LISTER.args = lister.args;
    try {
      return { name, left: leftBehind(), failed: null };
    } catch (error) {
      return { name, left: null, failed: String(error.message ?? error).slice(0, 170) };
    }
  };
  const powershell = (before) => ({ program: "powershell", args: ["-NoProfile", "-Command", before] });
  const results = [
    attempt("the real listing", { program: "powershell", args: ["-NoProfile", "-Command"] }),
    attempt("a lister that is not installed", { program: "no-such-process-lister", args: [] }),
    attempt("a lister that answers something else", { program: process.execPath, args: ["-e", "console.log('not a listing')", "--"] }),
    // The provider fails without stopping the pipeline: an error record, then an empty collection.
    attempt("a process provider that writes an error and carries on", powershell("function Get-CimInstance { Write-Error 'the WMI provider failed' };")),
    // The provider answers, with nothing: exit 0 and a valid empty list, which cannot contain this walk.
    attempt("a process provider that returns nothing at all", powershell("function Get-CimInstance { };")),
  ];
  const ok = results[0].failed === null && Array.isArray(results[0].left) && results.slice(1).every((result) => result.failed !== null);
  process.stdout.write(`${JSON.stringify({ ok, results }, null, 2)}\n`);
  process.exit(ok ? 0 : 1);
}

// --self-test-interrupt: the course-correction judgment, put to the run it once misjudged and to one
// where the message never arrived.
if (process.argv.includes("--self-test-interrupt")) {
  const reason = "In your next step, begin src/greet.ts with the comment `// greetings are one line each`.";
  const replied = "interrupt: requested for session 001 (instruction 3); the driver ends the running invocation and re-invokes the engine with the reason.";
  const steps = (carrier) => [1, 2, 3, 4, 5].map((seq) => ({ seq, kind: seq === 5 ? "done" : "step", reasons: seq === carrier ? [`sent: ${reason}`] : null }));
  const results = [
    // `published-claude-main`: sent a second after instruction 3 was written, while the poll still held 2.
    { name: "filed against 3 while the poll had seen 2, carried by 4", expect: true, ...courseCorrection({ reason, afterSeq: 2, said: replied }, steps(4)) },
    { name: "filed against 3, carried by nothing", expect: false, ...courseCorrection({ reason, afterSeq: 2, said: replied }, steps(0)) },
    { name: "a reply that names no instruction", expect: false, ...courseCorrection({ reason, afterSeq: 2, said: "interrupt: refused" }, steps(4)) },
  ];
  const ok = results.every((result) => result.reflected === result.expect);
  process.stdout.write(`${JSON.stringify({ ok, results }, null, 2)}\n`);
  process.exit(ok ? 0 : 1);
}

if (!arg("--scratch", "")) throw new Error("--scratch <folder> is required: the walk stages its repository under it");
if (scenario !== "direct" && !fs.existsSync(VSIX)) throw new Error(`--vsix: no such file: ${VSIX}`);

const RUN_DIR = path.join(SCRATCH, run);
const MARKER = path.join(RUN_DIR, ".installed-walk-run");
const REPO = path.join(RUN_DIR, "repo");
const ORIGIN = path.join(RUN_DIR, "origin.git");
const STATE = path.join(RUN_DIR, "vscode");
const OUT = path.join(RUN_DIR, "results");
const SESSIONS = path.join(REPO, "docs", "sessions");
const SUITE_DELAY_SECONDS = 40;

// Only a folder an earlier walk made is wiped.
if (fs.existsSync(RUN_DIR)) {
  if (!fs.existsSync(MARKER)) throw new Error(`${RUN_DIR} exists and is not a walk's own folder; it is not wiped`);
  fs.rmSync(RUN_DIR, { recursive: true, force: true });
}
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(MARKER, "Made and wiped by docs/design/messaging-poc/walk-vsix.cjs.\n");

const WALK_LOG = path.join(OUT, "walk.jsonl");
const t0 = Date.now();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** One line per action: `actor` took it, and `deterministic` says whether a rule could have. */
const log = (actor, action, deterministic, detail = {}) =>
  fs.appendFileSync(
    WALK_LOG,
    JSON.stringify({ at: new Date().toISOString(), t: Math.round((Date.now() - t0) / 1000), actor, action, deterministic, ...detail }) + "\n",
  );
const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};
const jsonl = (file) =>
  fs.existsSync(file)
    ? fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean)
    : [];
const git = (cwd, ...args) => {
  const done = cp.spawnSync("git", args, { cwd, encoding: "utf8" });
  return { code: done.status, out: `${done.stdout ?? ""}`.trim(), err: `${done.stderr ?? ""}`.trim() };
};
/** A read the acceptance rests on: git's failure is thrown, never read as "nothing there". */
const gitRead = (cwd, ...args) => {
  const done = git(cwd, ...args);
  if (done.code !== 0) throw new Error(`git ${args.join(" ")} failed (exit ${done.code}): ${done.err.slice(0, 200)}`);
  return done.out;
};
/** A record the acceptance rests on: absent is empty, and unreadable is an error. */
const rowsOf = (file) => (fs.existsSync(file) ? fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line)) : []);
const must = (cwd, ...args) => {
  const done = git(cwd, ...args);
  if (done.code !== 0) throw new Error(`git ${args.join(" ")}: ${done.err}`);
  return done.out;
};

// --- the disposable repository ---------------------------------------------------
const TSC = path.join(CHECKOUT, "node_modules", "typescript", "bin", "tsc").replace(/\\/g, "/");
const THREE_STEPS =
  "1. `greet(name)` in `src/greet.ts` returns `Hello, <name>.` for a name and `Hello.` for an empty one.\n" +
  "2. Add `shout(name)` to the same file: the greeting in capitals, ending with `!` instead of `.`.\n" +
  "3. Add `farewell(name)`, `Goodbye, <name>.`, and export all three from `src/index.ts`.\n";

function seed(files) {
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(REPO, name)), { recursive: true });
    fs.writeFileSync(path.join(REPO, name), text, "utf8");
  }
}

function stage(router) {
  seed({
    "README.md": "# greeter\n\nA small TypeScript package. `node scripts/check.mjs` builds it and runs its tests.\n",
    "package.json": JSON.stringify({ name: "greeter", version: "0.1.0", private: true, type: "module", scripts: { test: "node scripts/check.mjs" } }, null, 2) + "\n",
    "tsconfig.json":
      JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", strict: true, rootDir: ".", outDir: "dist", skipLibCheck: true,
            // The checkout's own compiler and node types: the disposable repository installs nothing.
            typeRoots: [path.join(CHECKOUT, "node_modules", "@types").replace(/\\/g, "/")],
            types: ["node"],
          },
          include: ["src", "test"],
        },
        null,
        2,
      ) + "\n",
    "src/greet.ts": "export function greet(name: string): string {\n  return `Hello, ${name}.`;\n}\n",
    "test/greet.test.ts":
      'import assert from "node:assert/strict";\nimport { test } from "node:test";\n\nimport { greet } from "../src/greet.js";\n\n' +
      'test("greets by name", () => {\n  assert.equal(greet("Ada"), "Hello, Ada.");\n});\n',
    // The real build and the real tests, as one argv a check can name.
    "scripts/check.mjs":
      'import { spawnSync } from "node:child_process";\n' +
      `const build = spawnSync(process.execPath, [${JSON.stringify(TSC)}, "-p", "."], { stdio: "inherit" });\n` +
      "if (build.status !== 0) process.exit(build.status ?? 1);\n" +
      'const tests = spawnSync(process.execPath, ["--test", "dist/test/**/*.test.js"], { stdio: "inherit" });\n' +
      "process.exit(tests.status ?? 1);\n",
    // The declared suite: the same check after a wait, so the run of record is a long framework job.
    "scripts/suite.mjs":
      'import { spawnSync } from "node:child_process";\n' +
      `await new Promise((done) => setTimeout(done, ${SUITE_DELAY_SECONDS * 1000}));\n` +
      'process.exit(spawnSync(process.execPath, ["scripts/check.mjs"], { stdio: "inherit" }).status ?? 1);\n',
    // The handoff: what was built, packed into the folder the framework names.
    "scripts/pack.mjs":
      'import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";\nimport { join } from "node:path";\nimport { gzipSync } from "node:zlib";\n' +
      'const out = process.argv[2];\nmkdirSync(out, { recursive: true });\n' +
      'const files = Object.fromEntries(readdirSync("dist/src").map((name) => [name, readFileSync(join("dist/src", name), "utf8")]));\n' +
      'writeFileSync(join(out, "greeter-0.1.0.tgz"), gzipSync(JSON.stringify(files)));\n',
    ".gitignore": "dist/\nnode_modules/\n",
  });
  must(REPO, "init", "-q", "-b", "master");
  must(REPO, "config", "user.email", "walk@example.test");
  must(REPO, "config", "user.name", "Installed walk");
  must(REPO, "add", "-A");
  must(REPO, "commit", "-q", "-m", "A greeter");
  must(RUN_DIR, "init", "-q", "--bare", ORIGIN);
  if (scenario === "direct") return;

  const booted = cp.spawnSync(process.execPath, [router, "bootstrap", "--project-dir", REPO, "--remote", ORIGIN, "--transport", "copilot-cli"], { cwd: REPO, encoding: "utf8" });
  log("harness", "bootstrap", false, { exit: booted.status, said: `${booted.stdout}${booted.stderr}`.trim().split("\n").slice(-3) });
  if (booted.status !== 0) throw new Error(`bootstrap failed: ${booted.stderr}`);
  seed({
    "dabbler.yaml":
      "schema_version: 1\n\ntesting:\n  suites:\n    - name: node\n      command: node scripts/suite.mjs\n      expensive: true\n" +
      '      covers:\n        - "."\n      runs_whole: true\n      test_roots:\n        - "test"\n      test_glob: "*.test.ts"\n\n' +
      'packaging:\n  pack:\n    argv: ["node", "scripts/pack.mjs", "{output}"]\n',
    "docs/sessions/session-plan.md":
      "# Session plan\n\n## Sessions\n\n### Session 1 of 1: Three greetings\n\nScope: whole repository\n\n" +
      "**What.** Three small steps, in this order, each with its test in `test/greet.test.ts`:\n\n" + THREE_STEPS +
      "\nThe project is TypeScript, ES modules under NodeNext: an import carries the `.js` extension. " +
      "`node scripts/check.mjs` builds it and runs the tests; use exactly that argv as each step's check.\n\n" +
      "**Releasable.** Yes, a patch: the handoff artifact is packed by this repository's `packaging.pack`.\n",
    ".vscode/settings.json":
      JSON.stringify({ "dabbler.transport": "copilot-cli", "dabbler.reviewerTransport": "copilot-cli", "dabbler.release": "ship-by-default" }, null, 2) + "\n",
  });
  must(REPO, "add", "-A");
  must(REPO, "commit", "-q", "-m", "One session: three greetings");
  must(REPO, "push", "-q", "origin", "master");
}

// --- the editor -----------------------------------------------------------------------
async function palette(page, command) {
  await page.keyboard.press("F1");
  const input = page.locator(".quick-input-widget input");
  await input.waitFor({ state: "visible", timeout: 10_000 });
  await input.fill(`>${command}`);
  await page.waitForTimeout(600);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(800);
}

/** An editor-area terminal's tab, clicked into. False where there is no such tab. */
async function focusTab(page, label) {
  const tab = page.locator(".tabs-container .tab").filter({ has: page.locator(".label-name", { hasText: label }) }).first();
  if (!(await tab.isVisible().catch(() => false))) return false;
  await tab.click({ timeout: 10_000 });
  await page.waitForTimeout(500);
  const group = page.locator(".editor-group-container").filter({ has: tab });
  await group.locator(".xterm-screen").first().click().catch(() => {});
  await page.waitForTimeout(800);
  return true;
}

/** The engine's terminal: Start opens it as an editor tab; the direct run has it in the panel. */
async function focusEngine(page) {
  // The tab shows the process's title (`claude`, `copilot`) as often as the terminal's name.
  if (await focusTab(page, new RegExp(`^\\s*(${LABEL}|${PROGRAM})\\b`, "i"))) return;
  await palette(page, "Terminal: Focus Terminal");
  await page.locator(".terminal-wrapper.active .xterm-screen").first().click().catch(() => {});
  await page.waitForTimeout(800);
}

async function copyTerminal(app, page) {
  await palette(page, "Terminal: Select All");
  await palette(page, "Terminal: Copy Selection");
  const text = await app.evaluate(({ clipboard }) => clipboard.readText());
  // Never Escape: the CLI receives it. The editor's own command clears the selection.
  await palette(page, "Terminal: Clear Selection");
  return text;
}
async function engineText(app, page) {
  await focusEngine(page);
  return copyTerminal(app, page);
}
async function dabblerText(app, page) {
  if (!(await focusTab(page, /^\s*Dabbler\b/))) return null;
  return copyTerminal(app, page);
}

async function typeIntoEngine(page, text) {
  await focusEngine(page);
  await page.keyboard.type(text, { delay: 12 });
  await page.waitForTimeout(300);
  await page.keyboard.press("Enter");
}

/** A numbered prompt at the bottom of Claude's screen: move to the option wanted and take it. */
async function answerPrompt(page, text, pick) {
  const tail = text.split(/\r?\n/).filter((line) => line.trim()).slice(-14);
  // Numbered (`❯ 1. Yes`) or not (`❯ No, exit` above `Yes, I trust this folder`).
  const options = tail.filter((line) => /^\s*(?:[❯>›]\s*)?(?:\d+[.)]\s+\S|(?:yes|no)\b)/i.test(line));
  if (options.length < 2) return null;
  const wanted = pick(options);
  if (wanted < 0) return null;
  const current = Math.max(options.findIndex((line) => /^\s*[❯>›]/.test(line)), 0);
  await focusEngine(page);
  for (let i = 0; i < Math.abs(wanted - current); i++) await page.keyboard.press(wanted > current ? "ArrowDown" : "ArrowUp");
  await page.keyboard.press("Enter");
  return { question: tail.find((line) => /\?\s*$/.test(line.trim())) ?? "", chose: options[wanted].trim() };
}

// --- the engine's own record ------------------------------------------------------------
function engineLogFile() {
  const candidates =
    engine === "copilot"
      ? (() => {
          const root = path.join(os.homedir(), ".copilot", "session-state");
          return (fs.existsSync(root) ? fs.readdirSync(root) : []).map((dir) => path.join(root, dir, "events.jsonl"));
        })()
      : (() => {
          const root = path.join(os.homedir(), ".claude", "projects", REPO.replace(/[^A-Za-z0-9]/g, "-"));
          return (fs.existsSync(root) ? fs.readdirSync(root) : []).filter((name) => name.endsWith(".jsonl")).map((name) => path.join(root, name));
        })();
  let best = null;
  for (const file of candidates) {
    try {
      const stat = fs.statSync(file);
      if (stat.mtimeMs < t0) continue;
      if (engine === "copilot") {
        // Copilot's session folder names its workspace beside the events.
        const workspace = path.join(path.dirname(file), "workspace.yaml");
        const where = fs.existsSync(workspace) ? fs.readFileSync(workspace, "utf8") : fs.readFileSync(file, "utf8").slice(0, 4000);
        if (!where.includes(run)) continue;
      }
      if (!best || stat.mtimeMs > best.mtime) best = { file, mtime: stat.mtimeMs };
    } catch {
      // Not a session record.
    }
  }
  return best ? best.file : null;
}
const engineEvents = () => (engineLogFile() ? jsonl(engineLogFile()) : []);

/** What the AI said and ran, in one shape for both engines. */
function transcript() {
  const rows = [];
  for (const e of engineEvents()) {
    if (engine === "claude") {
      if (e.type === "attachment" && e.attachment?.type === "queued_command") rows.push({ at: e.timestamp, kind: "human", what: String(e.attachment.prompt ?? "") });
      else if (e.type === "queue-operation" && String(e.content ?? "").includes("<task-notification>")) rows.push({ at: e.timestamp, kind: "notification", what: /<summary>([^<]*)<\/summary>/.exec(e.content)?.[1] ?? "" });
      else if (e.type === "user" && e.message && !e.toolUseResult) {
        const content = e.message.content;
        const text = typeof content === "string" ? content : (content ?? []).filter((c) => c.type === "text").map((c) => c.text).join(" ");
        if (text && !text.startsWith("<")) rows.push({ at: e.timestamp, kind: "human", what: text });
      } else if (e.type === "assistant" && e.message) {
        for (const c of e.message.content ?? []) {
          if (c.type === "text" && c.text.trim()) rows.push({ at: e.timestamp, kind: "ai-text", what: c.text.trim() });
          if (c.type === "tool_use") rows.push({ at: e.timestamp, kind: c.input?.run_in_background ? "ai-background" : "ai-tool", tool: c.name, what: String(c.input?.command ?? JSON.stringify(c.input ?? {})) });
        }
      }
    } else {
      const data = e.data ?? {};
      if (e.type === "user.message") rows.push({ at: e.timestamp, kind: "human", what: String(data.content ?? "") });
      else if (e.type === "assistant.message" && String(data.content ?? "").trim()) rows.push({ at: e.timestamp, kind: "ai-text", what: String(data.content).trim() });
      else if (e.type === "system.notification") rows.push({ at: e.timestamp, kind: "notification", what: `${data.kind?.type ?? "notice"}: ${data.kind?.description ?? ""}` });
      else if (e.type === "tool.execution_start") {
        const args = data.arguments ?? {};
        rows.push({ at: e.timestamp, kind: args.mode === "async" ? "ai-background" : "ai-tool", tool: data.toolName, what: String(args.command ?? args.shellId ?? JSON.stringify(args).slice(0, 200)) });
      }
    }
  }
  return rows;
}

/** What the engine's own record says the run cost: Copilot bills AI credits; Claude Code reports tokens. */
function engineCost() {
  const file = engineLogFile();
  if (!file) return null;
  if (engine === "copilot") {
    try {
      const { DatabaseSync } = process.getBuiltinModule("node:sqlite");
      const db = new DatabaseSync(path.join(os.homedir(), ".copilot", "session-store.db"), { readOnly: true });
      const id = path.basename(path.dirname(file));
      const usage = db.prepare("select count(*) calls, coalesce(sum(total_nano_aiu), 0) nano from assistant_usage_events where session_id = ?").get(id);
      return { unit: "AI credits", session: id, modelCalls: Number(usage.calls), credits: Number((Number(usage.nano) / 1e9).toFixed(2)) };
    } catch (error) {
      return { unit: "AI credits", error: String(error) };
    }
  }
  let output = 0;
  let input = 0;
  let calls = 0;
  const seen = new Set();
  for (const e of jsonl(file)) {
    const usage = e.type === "assistant" ? e.message?.usage : null;
    if (!usage || seen.has(e.message.id)) continue;
    seen.add(e.message.id);
    calls += 1;
    output += usage.output_tokens ?? 0;
    input += (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
  }
  return { unit: "tokens", modelCalls: calls, inputTokens: input, outputTokens: output };
}

// --- the machine --------------------------------------------------------------------------
/** Processes whose command line names this run: its router, its jobs, its engine. */
function processes(pattern, { all = false } = {}) {
  // As JSON: a shell's command line can hold newlines, and a line-per-process listing breaks on one.
  // `Stop` makes every error a terminating one, and the trap turns it into a non-zero exit: a WMI
  // provider that fails quietly would otherwise leave an empty collection, printed as a valid `[]`.
  const script =
    "$ErrorActionPreference = 'Stop'; trap { [Console]::Error.WriteLine($_); exit 3 }; " +
    "@(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object { $_.CommandLine -and $_.CommandLine -match $env:WALK_PATTERN } | " +
    "ForEach-Object { [pscustomobject]@{ pid = $_.ProcessId; name = $_.Name; command = $_.CommandLine } }) | ConvertTo-Json -Compress";
  const done = cp.spawnSync(LISTER.program, [...LISTER.args, script], { encoding: "utf8", env: { ...process.env, WALK_PATTERN: pattern } });
  // An inspection that did not run is not an empty list: a query that failed, or answered
  // something that is not the listing, says nothing about what is running.
  if (done.error || done.status !== 0) throw new Error(`the process listing failed (exit ${done.status}): ${String(done.error ?? done.stderr ?? "").trim().slice(0, 300)}`);
  let parsed;
  try {
    parsed = JSON.parse((done.stdout ?? "").trim() || "[]");
  } catch {
    throw new Error(`the process listing answered something that is not a listing: ${String(done.stdout).trim().slice(0, 200)}`);
  }
  const rows = (Array.isArray(parsed) ? parsed : [parsed]).map((row) => ({ pid: Number(row.pid), name: String(row.name), command: String(row.command) }));
  if (rows.some((row) => !Number.isInteger(row.pid) || row.pid <= 0)) throw new Error("the process listing held a row with no process id");
  return rows.filter((row) => all || (row.pid !== process.pid && !/walk-vsix\.cjs|WALK_PATTERN/.test(row.command)));
}

/**
 * The positive control: the same listing, asked for THIS walk, has to find this walk. An
 * inspector that cannot see a process known to be running cannot say that none is left.
 */
function inspectorSeesThisWalk() {
  return processes("walk-vsix\\.cjs", { all: true }).some((row) => row.pid === process.pid);
}

/**
 * What still names this run, from ONE listing that also had to return this walk's own process: a
 * listing that ran and saw nothing at all is a listing that failed, however it exited.
 */
function leftBehind() {
  const mine = escapeRegex(`${path.basename(SCRATCH)}\\${run}\\`) + "|" + escapeRegex(`${path.basename(SCRATCH)}/${run}/`);
  const rows = processes(`${mine}|walk-vsix\\.cjs`, { all: true });
  if (!rows.some((row) => row.pid === process.pid)) throw new Error("the listing that says what is left did not contain this walk's own process, so it says nothing");
  const ofThisRun = new RegExp(mine, "i");
  return rows
    .filter((row) => row.pid !== process.pid && ofThisRun.test(row.command) && !/walk-vsix\.cjs|WALK_PATTERN/.test(row.command) && canBeLeftBehind(row.name))
    .map((row) => `${row.pid} ${row.name} ${row.command.replace(/\s+/g, " ").slice(0, 200)}`);
}

/** A look the walk takes as it goes: where the listing fails, that look sees nothing and the next one looks again. */
function glance(pattern) {
  try {
    return processes(pattern);
  } catch (error) {
    log("harness", "process-listing-failed", false, { message: String(error.message ?? error) });
    return null;
  }
}

/** The programs a walk can leave behind: a router or a job, a test, a package, an engine, git. Never a shell that merely names the run. */
function canBeLeftBehind(name) {
  return /^(code|node|claude|copilot|git|tar|npm)(\.exe|\.cmd)?$/i.test(name);
}
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * What the package holds that a package may not: a record of somebody's machine, a transcript,
 * a run ledger, a scratch or test repository, a key. A VSIX is a zip, which `tar` lists.
 */
function packageContents() {
  // Windows' own tar reads a zip; the one a Git shell puts first on PATH does not.
  const tar = process.platform === "win32" ? path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe") : "tar";
  const listed = cp.spawnSync(tar, ["-tf", VSIX], { encoding: "utf8" });
  const entries = (listed.stdout ?? "").split(/\r?\n/).filter(Boolean);
  const stray = entries.filter((entry) => /\.jsonl$|\.dabbler\/|(^|\/)(results|transcripts?|scratch|messaging-poc)\/|\.pem$|\.key$|\.env$|credential/i.test(entry));
  return { entries: entries.length, stray };
}

/**
 * The live chained answers of THIS walk: the shim runs the editor's own executable over the
 * router bundled in this walk's extensions folder, so the folder is what tells them from anyone else's.
 */
function chainedExchanges() {
  const mine = (command) => command.toLowerCase().replace(/\//g, "\\").includes(STATE.toLowerCase());
  // The router itself, never the shells that wrap it: their command lines carry the same words.
  return (glance("dabbler\\.cjs.*session\\s+report.*--next") ?? []).filter((p) => mine(p.command) && /^(code|node)(\.exe)?$/i.test(p.name));
}

/**
 * Whether a course correction arrived on the next instruction. "Next" is counted from the instruction
 * the FRAMEWORK says the interrupt was filed against -- its reply names it -- and never from the last
 * one this walk's poll had seen: an engine that answers a step in seconds puts a new instruction
 * between the two. A reply that names none judges nothing.
 */
function courseCorrection(interrupt, instructions) {
  const named = /\(instruction (\d+)\)/.exec(interrupt.said ?? "");
  const filedAgainst = named ? Number(named[1]) : null;
  const next = filedAgainst === null ? null : instructions.find((seen) => seen.seq > filedAgainst) ?? null;
  return {
    filedAgainst,
    nextInstruction: next ? { seq: next.seq, kind: next.kind, reasons: next.reasons } : null,
    reflected: Boolean(next?.reasons?.some((reason) => reason.includes(interrupt.reason.slice(0, 30)))),
  };
}

function driverDir() {
  const runs = path.join(REPO, ".dabbler", "runs");
  const numbers = (fs.existsSync(runs) ? fs.readdirSync(runs) : []).map((name) => /^s(\d+)$/.exec(name)).filter(Boolean).map((match) => Number(match[1]));
  return numbers.length ? path.join(runs, `s${Math.max(...numbers)}`, "driver") : null;
}
const ledgerRow = () => (readJson(path.join(SESSIONS, "sessions.json"))?.sessions ?? []).find((row) => row.number === 1) ?? null;

let app = null;
let page = null;
const state = { instructions: [], questions: [], notes: {} };

async function launchEditor() {
  const appData = { APPDATA: path.join(STATE, "AppData", "Roaming"), LOCALAPPDATA: path.join(STATE, "AppData", "Local") };
  for (const dir of Object.values(appData)) fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(STATE, "user", "User"), { recursive: true });
  // The walk closes the Dabbler Terminal's tab on purpose, and answers no dialog about it.
  fs.writeFileSync(path.join(STATE, "user", "User", "settings.json"), JSON.stringify({ "terminal.integrated.confirmOnKill": "never", "terminal.integrated.confirmOnExit": "never" }));
  // The reviewers' keys reach the window as they do a person's; nothing of them is written down.
  const keys = Object.fromEntries(Object.entries(process.env).filter(([name]) => name.startsWith("DABBLER_")));
  const env = launch.electronEnv({ ...keys, ...appData });
  const code = launch.findCodeBinary();
  let router = null;
  if (scenario !== "direct") {
    const install = cp.spawnSync(path.join(path.dirname(code), "bin", "code.cmd"), ["--install-extension", VSIX, "--force", `--extensions-dir=${STATE}/ext`, `--user-data-dir=${STATE}/user`], { env, shell: true, encoding: "utf8" });
    log("harness", "install-vsix", false, { exit: install.status, vsix: path.basename(VSIX), sha256: crypto.createHash("sha256").update(fs.readFileSync(VSIX)).digest("hex") });
    const installed = fs.readdirSync(path.join(STATE, "ext")).find((name) => /dabbler-ai-orchestration/.test(name));
    router = path.join(STATE, "ext", installed, "dist", "dabbler.cjs");
    state.notes.extension = installed;
    state.notes.router = (cp.spawnSync(process.execPath, [router, "version"], { encoding: "utf8" }).stdout ?? "").trim().split("\n")[0];
  }
  stage(router);
  app = await _electron.launch({ executablePath: code, args: [`--user-data-dir=${STATE}/user`, `--extensions-dir=${STATE}/ext`, ...launch.ISOLATION_FLAGS, REPO], env, timeout: 60_000 });
  page = await app.firstWindow();
  await page.locator(".activitybar").waitFor({ state: "visible", timeout: 60_000 });
  await sleep(4000);
  log("harness", "launched", false, { engine, scenario, vscode: path.basename(path.dirname(code)) });
  return router;
}

async function startSession() {
  const explorer = page.locator('.pane-header[aria-label^="Work Explorer"]');
  if (!(await explorer.first().isVisible().catch(() => false))) {
    await page.locator('.activitybar .action-label[aria-label*="Dabbler"]').first().click();
    await sleep(1500);
  }
  // The Work Explorer's own row: the Solution Explorer shows a row by the same name.
  const pane = page.locator(".pane").filter({ has: page.locator('.pane-header[aria-label^="Work Explorer"]') }).first();
  const row = pane.locator(".monaco-list-row").filter({ hasText: path.basename(REPO) }).first();
  await row.waitFor({ state: "visible", timeout: 60_000 });
  await row.click({ button: "right" });
  const menu = page.locator(".context-view .monaco-menu");
  await menu.waitFor({ state: "visible", timeout: 10_000 });
  const offered = await menu.innerText();
  state.notes.menu = offered.split("\n").map((line) => line.trim()).filter(Boolean);
  const entry = menu.locator(".action-label").filter({ hasText: "Start Session" }).first();
  if (!(await entry.isVisible().catch(() => false))) throw new Error(`the repository row offers no Start Session: ${offered}`);
  // A click can leave the menu open with the entry only highlighted; the keyboard takes it.
  await entry.hover();
  await page.keyboard.press("Enter");
  log("operator", "start-session", false);
  const pick = page.locator(".quick-input-widget input");
  await pick.waitFor({ state: "visible", timeout: 60_000 });
  await pick.fill(LABEL);
  await sleep(500);
  await page.keyboard.press("Enter");
  log("operator", "pick-engine", false, { engine: LABEL });
  await sleep(1500);
  await pick.fill(model);
  await page.keyboard.press("Enter");
  log("operator", "enter-model", false, { model });
}

/** The engine's own prompts, answered the way an operator would, and logged as theirs. */
const prompts = { copilotSubmitted: false, answered: new Set(), lastScreen: 0 };
async function answerEnginePrompts() {
  if (engine === "claude") {
    const text = await engineText(app, page);
    const tail = text.split(/\r?\n/).slice(-14).join("\n");
    if (Date.now() - prompts.lastScreen > 45_000) {
      prompts.lastScreen = Date.now();
      log("harness", "screen", false, { tail: text.split(/\r?\n/).filter((line) => line.trim()).slice(-10) });
    }
    if (/Quick safety check|trust this folder|Do you trust|trust the files|Yes, proceed/i.test(tail)) {
      const answer = await answerPrompt(page, text, (options) => options.findIndex((line) => /\byes\b/i.test(line)));
      if (answer) log("operator", "answer-trust-prompt", false, { permissions: true, ...answer });
    } else if (/Do you want to/i.test(tail)) {
      const answer = await answerPrompt(page, text, (options) => {
        const always = options.findIndex((line) => /don.t ask again/i.test(line));
        return always >= 0 ? always : options.findIndex((line) => /\byes\b/i.test(line));
      });
      if (answer) log("operator", "approve-tool", true, answer);
    }
    return;
  }
  const events = engineEvents();
  if (!prompts.copilotSubmitted) {
    if (events.some((event) => event.type === "user.message")) prompts.copilotSubmitted = true;
    else {
      // Copilot draws on the alternate screen, so its folder-trust prompt cannot be read: the
      // screenshot is the evidence, and a user message following within seconds says which it was.
      await focusEngine(page);
      const shot = `enter-${Math.round((Date.now() - t0) / 1000)}.png`;
      await page.screenshot({ path: path.join(OUT, shot) });
      await page.keyboard.press("Enter");
      log("operator", "answer-trust-prompt-or-submit", false, { permissions: true, screenshot: shot });
      await sleep(4000);
    }
  }
  const completed = new Set(events.filter((e) => e.type === "permission.completed").map((e) => e.data?.requestId));
  for (const request of events.filter((e) => e.type === "permission.requested")) {
    const id = request.data?.requestId;
    if (completed.has(id) || prompts.answered.has(id)) continue;
    prompts.answered.add(id);
    await focusEngine(page);
    await page.keyboard.press("Enter");
    log("operator", "approve-tool", true, { intention: request.data?.permissionRequest?.intention ?? "" });
  }
}

/** Whether Copilot is showing a permission dialog: a person answers that before they say anything else. */
function copilotPromptPending() {
  if (engine !== "copilot") return false;
  const events = engineEvents();
  const completed = new Set(events.filter((e) => e.type === "permission.completed").map((e) => e.data?.requestId));
  return events.some((e) => e.type === "permission.requested" && !completed.has(e.data?.requestId));
}

async function ask(name, text) {
  // Keystrokes typed over a permission dialog answer the dialog, and the question is never said.
  for (let tries = 0; tries < 20 && copilotPromptPending(); tries++) {
    await answerEnginePrompts();
    await sleep(1500);
  }
  if (engine !== "copilot") await typeIntoEngine(page, text);
  else {
    // Launched as Start launches it, Copilot asks before every tool, and keys pressed while it asks
    // go to the dialog. So the question is typed in one burst in the quiet just after a dialog is
    // answered, and Copilot's own record says whether it was heard. Text left sitting in the box
    // by an Enter a dialog took is sent with another Enter, never typed twice.
    // Pasted, not typed: a paste reaches the CLI as one write, so a dialog that opens takes all of
    // it or none of it, and never the middle of a sentence -- which once turned "cancel this
    // session, run <command>" into a request with no command in it.
    const heard = () => engineEvents().some((e) => e.type === "user.message" && String(e.data?.content ?? "").includes(text.slice(0, 24)) && String(e.data?.content ?? "").includes(text.slice(-24)));
    // And pasted in the quiet just after a dialog is answered -- the tool it allowed is running
    // and the next dialog is seconds away -- with the editor's own paste key, which takes a
    // fraction of the time the command palette does.
    await app.evaluate(({ clipboard }, said) => clipboard.writeText(said), text);
    for (let tries = 0; tries < 40 && !heard(); tries++) {
      await focusEngine(page);
      if (copilotPromptPending()) {
        await page.keyboard.press("Enter");
        log("operator", "approve-tool", true, { intention: "(answered on the way to a question)" });
        await page.waitForTimeout(250);
      }
      // The paste key is the quick one and has carried every short question; a longer message
      // with quotes in it was only ever delivered by the editor's own paste command. So they alternate.
      if (tries % 2 === 0) await page.keyboard.press("Control+V");
      else await palette(page, "Terminal: Paste into Active Terminal");
      await page.waitForTimeout(150);
      await page.keyboard.press("Enter");
      for (let waited = 0; waited < 4 && !heard(); waited++) await sleep(1000);
    }
    if (!heard()) log("harness", "question-not-heard", false, { name });
  }
  state.questions.push({ name, text, at: new Date().toISOString(), phase: readJson(path.join(driverDir() ?? "", "run.json"))?.phase ?? null });
  log("operator", "question", false, { name, text });
  await sleep(15_000);
  await page.screenshot({ path: path.join(OUT, `question-${name}.png`) });
}

/** The framework's records, read once per look, and every instruction logged as it appears. */
function look() {
  const dir = driverDir();
  const runRecord = dir ? readJson(path.join(dir, "run.json")) : null;
  const instruction = dir ? readJson(path.join(dir, "instruction.json")) : null;
  if (instruction && !state.instructions.some((seen) => seen.seq === instruction.seq)) {
    state.instructions.push({ seq: instruction.seq, kind: instruction.kind, step: instruction.step_id ?? null, round: instruction.round ?? null, reasons: instruction.reasons ?? null, chained: / --next\b/.test(instruction.answer_command ?? ""), at: new Date().toISOString() });
    log("framework", "instruction", false, { seq: instruction.seq, kind: instruction.kind, step: instruction.step_id ?? null, reasons: instruction.reasons ?? null });
  }
  if (runRecord && runRecord.phase !== state.phase) {
    state.phase = runRecord.phase;
    log("framework", "phase", false, { phase: runRecord.phase, stop: runRecord.stop ?? null });
  }
  return { runRecord, instruction, row: ledgerRow() };
}

async function mainScenario(router) {
  const started = Date.now();
  const done = { q1: false, q2: false, interrupt: false, reopen: false, kill: false };
  const CORRECTION = "In your next step, begin src/greet.ts with the comment `// greetings are one line each`.";
  while (Date.now() - started < deadline * 1000) {
    const { runRecord, row } = look();
    if (row && row.status === "complete") return "closed";
    if (runRecord?.stop) return `stopped: ${runRecord.stop.kind} -- ${runRecord.stop.reason}`;
    // Start launched the CLI with the opening sentence as its argument: no such process, no author.
    const engines = glance("Run .dabbler session next");
    // Only a listing that ran can say the CLI is gone.
    if (state.instructions.length > 0 && engines !== null && engines.length === 0) return "the engine's CLI is no longer running";
    const work = state.instructions.filter((seen) => seen.kind === "step" && seen.step !== "plan");

    // The kill comes first in a look: its window is one framework job.
    if (!done.kill && runRecord?.job && /^run of record/.test(runRecord.job.name)) {
      const target = chainedExchanges()[0];
      if (target) {
        done.kill = true;
        try { process.kill(target.pid); } catch { /* already gone */ }
        state.kill = { at: new Date().toISOString(), pid: target.pid, command: target.command.replace(/^.*dabbler\.cjs"?\s*/, "dabbler "), during: runRecord.job.name, acceptedSteps: [...(runRecord.accepted_steps ?? [])], seq: runRecord.seq };
        log("saboteur", "kill-chained-exchange", false, state.kill);
      }
    }
    if (state.kill && !state.kill.repeatedAt) {
      const again = chainedExchanges().filter((p) => p.pid !== state.kill.pid);
      if (again.length > 0) {
        state.kill.repeatedAt = new Date().toISOString();
        state.kill.repeatedPid = again[0].pid;
        state.kill.repeatedCommand = again[0].command.replace(/^.*dabbler\.cjs"?\s*/, "dabbler ");
        log("engine", "repeated-the-killed-command", false, { pid: again[0].pid, afterMs: Date.parse(state.kill.repeatedAt) - Date.parse(state.kill.at) });
      }
    }

    await answerEnginePrompts();

    if (!done.interrupt && work.length >= 1) {
      // As soon as the first step is out: a small session's later steps go by in seconds, and
      // a correction sent after the last one has no instruction left to travel with.
      done.interrupt = true;
      const sent = cp.spawnSync(process.execPath, [router, "session", "interrupt", "--sessions-dir", SESSIONS, "--reason", CORRECTION], { cwd: REPO, encoding: "utf8" });
      state.interrupt = { at: new Date().toISOString(), reason: CORRECTION, exit: sent.status, afterSeq: work[0].seq, said: `${sent.stdout}${sent.stderr}`.trim().split("\n").pop() };
      log("operator", "session-interrupt", false, state.interrupt);
    } else if (!done.q1 && work.length >= 1 && Date.now() - Date.parse(work[0].at) > 6000) {
      done.q1 = true;
      await ask("while-the-author-works", "Quick question while you work: which step are you on, in one sentence? Then carry on.");
    } else if (!done.q2 && runRecord?.phase === "verify" && runRecord.job) {
      done.q2 = true;
      await ask("while-an-answer-waits", "While the framework works: is your answer command still running, and what happens when it exits? One sentence, and leave it running.");
    } else if (done.q2 && !done.reopen && runRecord?.job) {
      done.reopen = true;
      const before = await dabblerText(app, page);
      fs.writeFileSync(path.join(OUT, "dabbler-before-close.txt"), before ?? "(no Dabbler Terminal tab was found)");
      if (before !== null) {
        // The tab itself, by its own close gesture: `View: Close Editor` closes whichever editor the
        // palette hands focus back to, and the first walk closed the AI's terminal with it.
        const tabs = page.locator(".tabs-container .tab");
        await tabs.filter({ has: page.locator(".label-name", { hasText: /^\s*Dabbler\b/ }) }).first().click({ button: "middle" });
        await sleep(1500);
        const closedDuring = readJson(path.join(driverDir(), "run.json"))?.job?.name ?? null;
        const left = await tabs.locator(".label-name").allInnerTexts();
        log("operator", "close-dabbler-terminal", false, { during: closedDuring, tabsLeft: left });
        if (left.some((name) => /^\s*Dabbler\b/.test(name)) || !left.some((name) => new RegExp(`^\\s*(${LABEL}|${PROGRAM})\\b`, "i").test(name))) {
          throw new Error(`closing the Dabbler Terminal left these tabs: ${left.join(" | ")}`);
        }
        await sleep(8000);
        await palette(page, "Dabbler: Show Framework Terminal");
        await sleep(6000);
        const after = await dabblerText(app, page);
        fs.writeFileSync(path.join(OUT, "dabbler-after-reopen.txt"), after ?? "(the Dabbler Terminal did not come back)");
        await page.screenshot({ path: path.join(OUT, "dabbler-reopened.png") });
        const record = readJson(path.join(driverDir(), "run.json"));
        state.reopen = { closedDuring, reopenedDuring: record?.job?.name ?? null, phaseThen: record?.phase ?? null, cameBack: after !== null, saysPhase: after !== null && record?.phase ? after.includes(record.phase) : false };
        log("operator", "reopen-dabbler-terminal", false, state.reopen);
      }
    }
    await sleep(3000);
  }
  return "deadline";
}

async function cancelScenario() {
  const started = Date.now();
  let asked = false;
  const REASON = "the operator wants a different approach";
  while (Date.now() - started < deadline * 1000) {
    const { runRecord, row } = look();
    if (row && row.status === "cancelled") {
      // What stands now, and again a minute later: nothing may follow a cancellation.
      const at = { head: gitRead(REPO, "rev-parse", "HEAD"), remote: gitRead(ORIGIN, "rev-parse", "master"), tree: gitRead(REPO, "status", "--porcelain") };
      await sleep(60_000);
      state.cancel = {
        reasonAsked: REASON, reasonRecorded: row.cancelledReason ?? null, before: state.cancelBefore ?? null,
        treeAfter: gitRead(REPO, "status", "--porcelain").split("\n").filter(Boolean),
        treeBefore: at.tree.split("\n").filter(Boolean),
        headMovedAfterCancel: gitRead(REPO, "rev-parse", "HEAD") !== at.head,
        remoteMovedAfterCancel: gitRead(ORIGIN, "rev-parse", "master") !== at.remote,
        // Both histories: a land that was committed and never pushed is a land.
        landCommits: [gitRead(ORIGIN, "log", "--format=%s", "master"), gitRead(REPO, "log", "--format=%s")].join("\n").split("\n").filter((subject) => /^Session 0*1\b/.test(subject)).length,
        tags: gitRead(REPO, "tag").split("\n").filter(Boolean),
        packagingRows: rowsOf(path.join(REPO, ".dabbler", "runs", "s1", "packaging.jsonl")).length,
      };
      return "cancelled";
    }
    if (row && row.status === "complete") return "closed before it could be cancelled";
    await answerEnginePrompts();
    const work = state.instructions.filter((seen) => seen.kind === "step" && seen.step !== "plan");
    if (!asked && work.length >= 1 && Date.now() - Date.parse(work[0].at) > 20_000) {
      asked = true;
      state.cancelBefore = { tree: git(REPO, "status", "--porcelain").out.split("\n").filter(Boolean), phase: runRecord?.phase ?? null };
      await ask("cancel", `Stop the work and cancel this session now: I want a different approach. Run \`dabbler session cancel 1 --reason "${REASON}"\`, leave every file as it is, and then stop.`);
    }
    await sleep(3000);
  }
  return "deadline";
}

async function directScenario() {
  await palette(page, "Terminal: Create New Terminal");
  await sleep(4000);
  await page.keyboard.type(`${PROGRAM}${model ? ` --model ${model}` : ""}`, { delay: 12 });
  await page.keyboard.press("Enter");
  log("operator", "start-engine", false);
  await sleep(12_000);
  for (let i = 0; i < 4; i++) {
    await answerEnginePrompts();
    await sleep(3000);
  }
  const PROMPT =
    "In this TypeScript package (ES modules under NodeNext, so imports carry the .js extension), make these three changes in order, each with its test in test/greet.test.ts: " +
    THREE_STEPS.replace(/\n/g, " ") + "Run `node scripts/check.mjs` to build and test, and stop when it passes.";
  const typedAt = Date.now();
  await typeIntoEngine(page, PROMPT);
  log("operator", "direct-prompt", false, { text: PROMPT });
  while (Date.now() - typedAt < deadline * 1000) {
    await answerEnginePrompts();
    const index = path.join(REPO, "src", "index.ts");
    const greet = fs.existsSync(path.join(REPO, "src", "greet.ts")) ? fs.readFileSync(path.join(REPO, "src", "greet.ts"), "utf8") : "";
    if (fs.existsSync(index) && /shout/.test(greet) && /farewell/.test(greet)) {
      const check = cp.spawnSync(process.execPath, ["scripts/check.mjs"], { cwd: REPO, encoding: "utf8" });
      if (check.status === 0) {
        state.direct = { wallSeconds: Math.round((Date.now() - typedAt) / 1000) };
        // The engine's turn ends on its own; its cost is read once it has.
        await sleep(25_000);
        return "done";
      }
    }
    await sleep(5000);
  }
  return "deadline";
}

function summarize(outcome, startedAt) {
  const rows = transcript();
  const commands = rows.filter((row) => row.kind === "ai-tool" || row.kind === "ai-background");
  const shell = commands.filter((row) => /dabbler(\.cmd|\.exe)?\s+session\b|dabbler\.cjs"?\s+session\b/.test(row.what));
  const reports = shell.filter((row) => /session\s+report\b/.test(row.what));
  const dir = driverDir();
  const runRecord = dir ? readJson(path.join(dir, "run.json")) : null;
  const rounds = jsonl(path.join(REPO, ".dabbler", "runs", "s1", "rounds.jsonl"));
  const jobs = dir && fs.existsSync(path.join(dir, "jobs")) ? fs.readdirSync(path.join(dir, "jobs")).filter((name) => name.endsWith(".status.json")) : [];
  const remoteLog = git(ORIGIN, "log", "--format=%h %s", "master").out.split("\n").filter(Boolean);
  const questions = state.questions.map((said) => {
    const heard = rows.find((row) => row.kind === "human" && row.what.includes(said.text.slice(0, 24)));
    const answer = heard ? rows.find((row) => row.kind === "ai-text" && Date.parse(row.at) >= Date.parse(heard.at)) : null;
    return { ...said, recordedByTheEngine: Boolean(heard), answer: answer ? answer.what.replace(/\s+/g, " ").slice(0, 240) : null };
  });
  const corrected = state.interrupt ? courseCorrection(state.interrupt, state.instructions) : null;
  const dabblerAfter = fs.existsSync(path.join(OUT, "dabbler-after-reopen.txt")) ? fs.readFileSync(path.join(OUT, "dabbler-after-reopen.txt"), "utf8") : "";
  const dabblerEnd = fs.existsSync(path.join(OUT, "dabbler-end.txt")) ? fs.readFileSync(path.join(OUT, "dabbler-end.txt"), "utf8") : "";
  const actions = jsonl(WALK_LOG);
  return {
    run, engine, scenario, model, outcome,
    vsix: scenario === "direct" ? null : { file: path.basename(VSIX), sha256: crypto.createHash("sha256").update(fs.readFileSync(VSIX)).digest("hex"), contents: packageContents() },
    versions: { ...state.notes, engine: (cp.spawnSync(`${PROGRAM} --version`, { shell: true, encoding: "utf8" }).stdout ?? "").trim().split(/\r?\n/)[0], node: process.version },
    startedAt: new Date(startedAt).toISOString(), endedAt: new Date().toISOString(), wallSeconds: Math.round((Date.now() - startedAt) / 1000),
    cost: engineCost(),
    instructions: state.instructions,
    engineCommands: {
      sessionNext: shell.filter((row) => /session\s+next\b/.test(row.what)).length,
      sessionWait: shell.filter((row) => /session\s+wait\b/.test(row.what)).length,
      mailboxLoop: commands.filter((row) => /--mailbox/.test(row.what)).length,
      reports: reports.length,
      reportsChained: reports.filter((row) => /--next\b/.test(row.what)).length,
      reportsInBackground: reports.filter((row) => row.kind === "ai-background").length,
      // A sleep is a wait, and reading the framework's records more than once is a watch. One read
      // is a look -- an engine whose command was killed may look once to see why -- and is counted apart.
      recordReads: commands.filter((row) => /run\.json|instruction\.json/i.test(row.what)).length,
      sleepsOrPolls:
        commands.filter((row) => /\bsleep\b|Start-Sleep/i.test(row.what)).length +
        (commands.filter((row) => /run\.json|instruction\.json/i.test(row.what)).length > 1 ? commands.filter((row) => /run\.json|instruction\.json/i.test(row.what)).length : 0),
      all: shell.map((row) => `${row.kind === "ai-background" ? "[bg] " : ""}${row.what.replace(/\s+/g, " ").slice(0, 160)}`),
    },
    questions,
    interrupt: state.interrupt ? { ...state.interrupt, ...corrected } : null,
    // Rebuilt: the reopened terminal holds the session's banner, a phase line and who is waited on, from the record.
    reopen: state.reopen ? { ...state.reopen, rebuilt: /SESSION \d+/.test(dabblerAfter) && /\bphase\b/.test(dabblerAfter) && /waiting-on/.test(dabblerAfter) } : null,
    dabblerTerminal: {
      linesRead: [dabblerAfter, dabblerEnd].join("\n").split(/\r?\n/).filter((line) => line.trim()).length,
      linesBeginningDabblerBracket: [dabblerAfter, dabblerEnd].join("\n").split(/\r?\n/).filter((line) => /^\s*dabbler \[/.test(line)).length,
    },
    kill: state.kill ?? null,
    cancel: state.cancel ?? null,
    direct: state.direct ?? null,
    record: scenario === "direct" ? null : {
      ledger: ledgerRow() ? { status: ledgerRow().status, verdict: ledgerRow().verificationVerdict ?? null, cancelledReason: ledgerRow().cancelledReason ?? null } : null,
      acceptedSteps: runRecord?.accepted_steps ?? [],
      rounds: rounds.map((round) => ({ round: round.round, verdict: round.verdict ?? round.outcome ?? null })),
      frameworkJobs: jobs,
      packagingRows: jsonl(path.join(REPO, ".dabbler", "runs", "s1", "packaging.jsonl")).map((entry) => entry.outcome ?? entry.event ?? "row"),
      landCommits: remoteLog.filter((line) => /^\w+ Session 0*1\b/.test(line)).length,
      lastCommit: git(REPO, "log", "-1", "--format=%s").out,
      reviewerConversations: reviewerConversations(),
      remoteLog,
      remoteIsHead: git(REPO, "rev-parse", "HEAD").out === git(ORIGIN, "rev-parse", "master").out,
      tags: git(REPO, "tag").out.split("\n").filter(Boolean),
    },
    operatorActions: { total: actions.filter((row) => row.actor === "operator").length, deterministic: actions.filter((row) => row.actor === "operator" && row.deterministic).map((row) => row.action) },
    processesLeft: state.processesLeft ?? null,
    processesInspected: state.processesInspected === true,
    processesError: state.processesError ?? null,
    evidence: OUT,
  };
}

/**
 * The acceptance cases of a scenario, each judged from the run's own summary. A walk that does
 * not meet every one of them FAILS: the artifacts of a run that hit its deadline, lost a question
 * or never saw its command repeated look exactly like evidence, and must never pass for it.
 */
function accept(s) {
  const cases = [];
  const hold = (name, pass, evidence) => cases.push({ case: name, pass: Boolean(pass), evidence: String(evidence) });
  hold(
    "nothing left running, by an inspection that ran and could see this walk",
    s.processesInspected === true && Array.isArray(s.processesLeft) && s.processesLeft.length === 0,
    s.processesInspected === true ? JSON.stringify(s.processesLeft) : `not inspected: ${s.processesError}`,
  );
  if (s.scenario === "direct") {
    hold("the change was made and its check passed", s.outcome === "done" && s.direct && s.direct.wallSeconds > 0, `${s.outcome}, ${JSON.stringify(s.direct)}`);
    hold("its cost was read from the engine's own record", s.cost && !s.cost.error, JSON.stringify(s.cost));
    return cases;
  }
  hold("the package holds nothing of anybody's machine", s.vsix.contents.entries > 0 && s.vsix.contents.stray.length === 0, `${s.vsix.contents.entries} entries, stray: ${JSON.stringify(s.vsix.contents.stray)}`);
  const c = s.engineCommands;
  if (s.scenario === "cancel") {
    const k = s.cancel ?? {};
    // A porcelain line is two status columns and a path; the first line of a trimmed listing has lost a column.
    const named = (line) => line.trim().split(/\s+/).pop();
    const work = (k.before?.tree ?? []).filter((line) => !/docs\/sessions\//.test(line)).map(named);
    hold("the session is cancelled", s.outcome === "cancelled" && s.record.ledger?.status === "cancelled", `${s.outcome}, ledger ${s.record.ledger?.status}`);
    hold("the reason is on the record", k.reasonRecorded === k.reasonAsked && Boolean(k.reasonAsked), `asked "${k.reasonAsked}", recorded "${k.reasonRecorded}"`);
    hold("the AI cancelled its own session, without force", c.all.some((said) => /session cancel 1 --reason/.test(said)) && !c.all.some((said) => /cancel[^|]*--force/.test(said)), c.all.filter((said) => /cancel/.test(said)).join(" | "));
    hold("the author's files are as they were", work.length > 0 && work.every((file) => (k.treeAfter ?? []).some((line) => named(line) === file)), `before ${JSON.stringify(work)}, a minute after ${JSON.stringify(k.treeAfter)}`);
    hold("nothing was landed, pushed, tagged or packaged", k.landCommits === 0 && k.remoteMovedAfterCancel === false && (k.tags ?? []).length === 0 && k.packagingRows === 0 && /Cancel session/.test(s.record.lastCommit ?? ""), `lands ${k.landCommits}, remote moved ${k.remoteMovedAfterCancel}, tags ${JSON.stringify(k.tags)}, packaging ${k.packagingRows}, last commit "${s.record.lastCommit}"`);
    return cases;
  }
  const asked = s.instructions.filter((seen) => seen.kind !== "done");
  const [q1, q2] = s.questions;
  hold("the session closed VERIFIED", s.outcome === "closed" && s.record.ledger?.status === "complete" && s.record.ledger?.verdict === "VERIFIED", `${s.outcome}, ${JSON.stringify(s.record.ledger)}`);
  hold("the instruction was asked for once", c.sessionNext === 1, `session next run ${c.sessionNext} time(s)`);
  hold("every answer was a chained background command", c.reports > 0 && c.reportsChained === c.reports && c.reportsInBackground === c.reports, `${c.reports} reports, ${c.reportsChained} chained, ${c.reportsInBackground} in the background`);
  hold("no waiter, mailbox loop, sleep or poll", c.sessionWait === 0 && c.mailboxLoop === 0 && c.sleepsOrPolls === 0, `wait ${c.sessionWait}, mailbox ${c.mailboxLoop}, sleeps or polls ${c.sleepsOrPolls}`);
  hold("every instruction named a chained answer", asked.length >= 4 && asked.every((seen) => seen.chained), asked.map((seen) => `${seen.seq}:${seen.chained}`).join(" "));
  hold("a question while the author worked was heard and answered", q1 && q1.phase === "work" && q1.recordedByTheEngine && q1.answer, JSON.stringify(q1 ?? null));
  hold("a question while an answer waited on a job was heard and answered", q2 && /verify|run-of-record/.test(q2.phase ?? "") && q2.recordedByTheEngine && q2.answer && q2.answer !== q1?.answer, JSON.stringify(q2 ?? null));
  hold("the course correction arrived on the next instruction", s.interrupt?.reflected === true, JSON.stringify(s.interrupt?.nextInstruction ?? null));
  hold("the Dabbler Terminal came back and rebuilt the session", s.reopen?.cameBack === true && s.reopen.rebuilt === true, JSON.stringify(s.reopen ?? null));
  hold("every framework line reads one way", s.dabblerTerminal.linesBeginningDabblerBracket === 0 && s.dabblerTerminal.linesRead > 0, JSON.stringify(s.dabblerTerminal));
  hold("the killed exchange was repeated by the engine, as the same command", Boolean(s.kill?.repeatedAt) && s.kill.command === s.kill.repeatedCommand, JSON.stringify({ at: s.kill?.at, repeatedAt: s.kill?.repeatedAt, during: s.kill?.during }));
  const r = s.record;
  hold("everything happened once", new Set(r.acceptedSteps).size === r.acceptedSteps.length && r.acceptedSteps.length >= 3 && r.landCommits === 1 && r.packagingRows.length === 1 && r.remoteIsHead && new Set(r.frameworkJobs).size === r.frameworkJobs.length && r.reviewerConversations === r.rounds.length, `steps ${r.acceptedSteps.length}, lands ${r.landCommits}, packages ${r.packagingRows.length}, remote is HEAD ${r.remoteIsHead}, rounds ${r.rounds.length}, reviewer conversations ${r.reviewerConversations}`);
  return cases;
}

/** The Copilot conversations opened in this run's repository that are not the author's: the reviewer's, one per round. */
function reviewerConversations() {
  const root = path.join(os.homedir(), ".copilot", "session-state");
  const author = engine === "copilot" && engineLogFile() ? path.basename(path.dirname(engineLogFile())) : null;
  let count = 0;
  for (const id of fs.existsSync(root) ? fs.readdirSync(root) : []) {
    const workspace = path.join(root, id, "workspace.yaml");
    if (id === author || !fs.existsSync(workspace)) continue;
    if (new RegExp(`${escapeRegex(path.basename(SCRATCH))}[\\\\/]+${escapeRegex(run)}[\\\\/]`).test(fs.readFileSync(workspace, "utf8"))) count += 1;
  }
  return count;
}

(async () => {
  const startedAt = Date.now();
  const router = await launchEditor();
  if (scenario !== "direct") await startSession();
  // The records are read several times a second, apart from the walk's own pace: reading the AI's
  // screen takes seconds, and a small step's instruction can come and go inside one reading.
  const watching = scenario === "direct" ? null : setInterval(() => { try { look(); } catch { /* a record mid-write is read again */ } }, 400);
  await sleep(scenario === "direct" ? 1000 : 15_000);
  await page.screenshot({ path: path.join(OUT, "started.png") });
  const outcome = scenario === "main" ? await mainScenario(router) : scenario === "cancel" ? await cancelScenario() : await directScenario();
  log("harness", "outcome", false, { outcome, seconds: Math.round((Date.now() - startedAt) / 1000) });
  // One more look, for the instruction that ended it.
  await sleep(3000);
  if (watching !== null) clearInterval(watching);

  // The author's last turn ends on its own; then what is on the screens is kept.
  await sleep(20_000);
  await page.screenshot({ path: path.join(OUT, "end.png") });
  if (engine === "claude") fs.writeFileSync(path.join(OUT, "engine-terminal.txt"), await engineText(app, page));
  if (scenario !== "direct") fs.writeFileSync(path.join(OUT, "dabbler-end.txt"), (await dabblerText(app, page)) ?? "(no Dabbler Terminal tab)");
  const transcriptFile = engineLogFile();
  if (transcriptFile) fs.copyFileSync(transcriptFile, path.join(OUT, `${engine}-${path.basename(transcriptFile)}`));
  await typeIntoEngine(page, "/exit").catch(() => {});
  await sleep(4000);
  await app.close().catch(() => {});
  await sleep(5000);
  // Whatever still names this run after the editor closed: a router, a job, a test, an engine.
  // The one listing that may not fail quietly: with no inspection there is no finding, and the case fails.
  try {
    state.processesLeft = leftBehind();
    state.processesInspected = true;
  } catch (error) {
    state.processesLeft = null;
    state.processesInspected = false;
    state.processesError = String(error.message ?? error);
  }
  log("harness", "processes-left", false, { inspected: state.processesInspected, processes: state.processesLeft, error: state.processesError ?? null });
  if (scenario !== "direct") {
    const dir = driverDir();
    if (dir) fs.cpSync(path.dirname(dir), path.join(OUT, "run-records"), { recursive: true });
    fs.copyFileSync(path.join(SESSIONS, "sessions.json"), path.join(OUT, "sessions.json"));
  }
  fs.writeFileSync(path.join(OUT, "git-log.txt"), `${git(REPO, "log", "--format=%h %cI %s").out}\n\n-- origin --\n${git(ORIGIN, "log", "--format=%h %cI %s", "master").out}\n${git(ORIGIN, "for-each-ref", "--format=%(refname) %(objectname:short)").out}\n`);
  const summary = summarize(outcome, startedAt);
  summary.acceptance = accept(summary);
  summary.accepted = summary.acceptance.every((held) => held.pass);
  fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  log("harness", "done", false, { accepted: summary.accepted });
  for (const held of summary.acceptance) process.stderr.write(`${held.pass ? "ok  " : "FAIL"} ${held.case} -- ${held.evidence.slice(0, 300)}\n`);
  process.stdout.write(`${JSON.stringify({ run, outcome, accepted: summary.accepted, summary: path.join(OUT, "summary.json") })}\n`);
  // Fail closed: a run that did not meet every case is not evidence, whatever it left on disk.
  process.exitCode = summary.accepted ? 0 : 1;
})().catch(async (error) => {
  log("harness", "error", false, { message: String(error && error.stack ? error.stack : error) });
  console.error(error);
  if (page) {
    await page.screenshot({ path: path.join(OUT, "error.png") }).catch(() => {});
    log("harness", "error-context", false, { notifications: await page.locator(".notification-list-item-message").allInnerTexts().catch(() => []) });
  }
  if (app) await app.close().catch(() => {});
  process.exit(1);
});
