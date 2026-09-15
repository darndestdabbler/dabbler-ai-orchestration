// Walk one session through the VSIX, playing the operator with Playwright.
//   node walk-vsix.cjs --engine claude|copilot --vsix <file.vsix> --repo <scratch repo>
//                      --run <name> [--model <id>] [--deadline <seconds>]
//                      [--human "wait:<text>|turn:<text>|<seconds>:<text>"]
// `wait:` is typed once the session reaches verification (the AI is waiting on
// the framework), `turn:` 20 s after the first work step is issued (the AI is
// working), and `<seconds>:` that long after Start.
// Writes results/<run>/ beside the repository: walk.jsonl (every action, who
// took it and whether it was deterministic), screenshots and terminal text.
const cp = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const arg = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at > 0 ? process.argv[at + 1] : fallback;
};
const TOOLS =
  arg("--tools", undefined) ??
  process.env.DABBLER_EXTENSION_DIR ??
  path.resolve(__dirname, "..", "..", "..", "tools", "dabbler-ai-orchestration");
const { _electron } = require(path.join(TOOLS, "node_modules/@playwright/test"));
const launch = require(path.join(TOOLS, "scripts/vscode-launch.js"));

const engine = arg("--engine", "claude");
const LABEL = { claude: "Claude Code", copilot: "GitHub Copilot" }[engine];
if (!LABEL) throw new Error(`unknown engine ${engine}`);
const VSIX = path.resolve(arg("--vsix", ""));
const REPO = path.resolve(arg("--repo", process.cwd()));
const run = arg("--run", `${engine}-walk`);
const model = arg("--model", "");
const deadline = Number(arg("--deadline", "2400"));
const human = String(arg("--human", ""))
  .split("|")
  .filter(Boolean)
  .map((entry) => {
    const colon = entry.indexOf(":");
    return { when: entry.slice(0, colon), text: entry.slice(colon + 1), done: false };
  });

const STATE = `${REPO}-vscode`;
const OUT = path.join(`${REPO}-results`, run);
fs.mkdirSync(OUT, { recursive: true });
// One walk per log: a rerun under the same name keeps the last one beside it, never mixed in.
const WALK_LOG = path.join(OUT, "walk.jsonl");
if (fs.existsSync(WALK_LOG)) {
  let attempt = 1;
  while (fs.existsSync(path.join(OUT, `walk-attempt${attempt}.jsonl`))) attempt += 1;
  fs.renameSync(WALK_LOG, path.join(OUT, `walk-attempt${attempt}.jsonl`));
}
const t0 = Date.now();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** One line per action: `actor` took it, and `deterministic` says whether a rule could have. */
const log = (actor, action, deterministic, detail = {}) =>
  fs.appendFileSync(
    WALK_LOG,
    JSON.stringify({ at: new Date().toISOString(), t: Math.round((Date.now() - t0) / 1000), actor, action, deterministic, ...detail }) + "\n",
  );

async function palette(page, command) {
  await page.keyboard.press("F1");
  const input = page.locator(".quick-input-widget input");
  await input.waitFor({ state: "visible", timeout: 10_000 });
  await input.fill(`>${command}`);
  await page.waitForTimeout(600);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(800);
}

/** The engine's terminal, clicked into: Start opens it as an editor tab. */
async function focusEngine(page) {
  // The tab shows the process's title (`claude`, `copilot`) as often as the terminal's name.
  const program = { claude: "claude", copilot: "copilot" }[engine];
  const tab = page
    .locator(".tabs-container .tab")
    .filter({ has: page.locator(".label-name", { hasText: new RegExp(`^\\s*(${LABEL}|${program})\\s*$`, "i") }) })
    .first();
  await tab.click({ timeout: 10_000 });
  await page.waitForTimeout(500);
  const group = page.locator(".editor-group-container").filter({ has: tab });
  await group.locator(".xterm-screen").first().click().catch(() => {});
  await page.waitForTimeout(800);
}

async function terminalText(app, page) {
  await focusEngine(page);
  await palette(page, "Terminal: Select All");
  await palette(page, "Terminal: Copy Selection");
  const text = await app.evaluate(({ clipboard }) => clipboard.readText());
  // Never Escape: the CLI receives it. The editor's own command clears the selection.
  await palette(page, "Terminal: Clear Selection");
  return text;
}

async function typeIntoEngine(page, text) {
  await focusEngine(page);
  await page.keyboard.type(text, { delay: 15 });
  await page.waitForTimeout(300);
  await page.keyboard.press("Enter");
}

/** A numbered prompt at the bottom of Claude's screen: move to the option wanted and take it. */
async function answerPrompt(app, page, text, pick) {
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

/**
 * The engine's own record of this walk: Copilot's newest events.jsonl that names
 * the repository, or Claude's newest transcript in the repository's project folder.
 */
function engineLogFile() {
  const candidates =
    engine === "copilot"
      ? (() => {
          const root = path.join(os.homedir(), ".copilot", "session-state");
          return (fs.existsSync(root) ? fs.readdirSync(root) : []).map((dir) => path.join(root, dir, "events.jsonl"));
        })()
      : (() => {
          const root = path.join(os.homedir(), ".claude", "projects", REPO.replace(/[:\\/]/g, "-"));
          return (fs.existsSync(root) ? fs.readdirSync(root) : []).filter((name) => name.endsWith(".jsonl")).map((name) => path.join(root, name));
        })();
  let best = null;
  for (const file of candidates) {
    try {
      const stat = fs.statSync(file);
      if (stat.mtimeMs < t0) continue;
      if (engine === "copilot" && !fs.readFileSync(file, "utf8").slice(0, 4000).includes(path.basename(REPO))) continue;
      if (!best || stat.mtimeMs > best.mtime) best = { file, mtime: stat.mtimeMs };
    } catch {
      // Not a session record.
    }
  }
  return best ? best.file : null;
}

/**
 * What the AI ran is counted from the engine's own record, so the record is kept
 * with the walk -- under this attempt's start time, so a rerun keeps the last one's.
 */
function keepEngineLog() {
  const engineLog = engineLogFile();
  const stamp = new Date(t0).toISOString().replace(/[:.]/g, "-");
  if (engineLog) fs.copyFileSync(engineLog, path.join(OUT, `${engine}-${stamp}-${path.basename(engineLog)}`));
  log("harness", "engine-log-kept", false, { from: engineLog });
}

function copilotEvents() {
  const file = engineLogFile();
  if (!file) return [];
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/** The driver dir of the newest session run in the repository. */
function driverDir() {
  const runs = path.join(REPO, ".dabbler", "runs");
  const numbers = (fs.existsSync(runs) ? fs.readdirSync(runs) : [])
    .map((name) => /^s(\d+)$/.exec(name))
    .filter(Boolean)
    .map((match) => Number(match[1]));
  return numbers.length ? path.join(runs, `s${Math.max(...numbers)}`, "driver") : null;
}

let app = null;
let page = null;
(async () => {
  // A fresh profile, extensions folder and AppData per walk; HOME stays real so the CLIs find their logins.
  fs.rmSync(STATE, { recursive: true, force: true });
  const appData = { APPDATA: path.join(STATE, "AppData", "Roaming"), LOCALAPPDATA: path.join(STATE, "AppData", "Local") };
  for (const dir of Object.values(appData)) fs.mkdirSync(dir, { recursive: true });
  const keys = Object.fromEntries(Object.entries(process.env).filter(([name]) => name.startsWith("DABBLER_")));
  const env = launch.electronEnv({ ...keys, ...appData });
  const code = launch.findCodeBinary();
  const install = cp.spawnSync(
    path.join(path.dirname(code), "bin", "code.cmd"),
    ["--install-extension", VSIX, "--force", `--extensions-dir=${STATE}/ext`, `--user-data-dir=${STATE}/user`],
    { env, shell: true, encoding: "utf8" },
  );
  log("harness", "install-vsix", false, { exit: install.status, out: `${install.stdout}${install.stderr}`.trim().slice(-300) });

  app = await _electron.launch({
    executablePath: code,
    args: [`--user-data-dir=${STATE}/user`, `--extensions-dir=${STATE}/ext`, ...launch.ISOLATION_FLAGS, REPO],
    env,
    timeout: 60_000,
  });
  page = await app.firstWindow();
  await page.locator(".activitybar").waitFor({ state: "visible", timeout: 60_000 });
  await sleep(4000);
  log("harness", "launched", false, { engine, vsix: path.basename(VSIX) });

  // Start Session, from the repository's row, as a person does.
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
  const entry = menu.locator(".action-label").filter({ hasText: "Start Session" }).first();
  if (!(await entry.isVisible().catch(() => false))) {
    await page.screenshot({ path: path.join(OUT, "no-start.png") });
    log("harness", "no-start-session-entry", false, { row: await row.innerText(), menu: await menu.innerText() });
    throw new Error("the repository row offers no Start Session");
  }
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
  const started = Date.now();
  await sleep(15_000);
  await page.screenshot({ path: path.join(OUT, "started.png") });

  let lastPhase = null;
  let lastSeq = null;
  let firstWorkAt = null;
  const said = new Set();
  const answered = new Set();
  let copilotSubmitted = false;
  let lastScreen = 0;

  while (Date.now() - started < deadline * 1000) {
    // What the editor told the operator.
    for (const text of await page.locator(".notification-list-item-message").allInnerTexts().catch(() => [])) {
      if (!said.has(text)) {
        said.add(text);
        log("editor", "notification", false, { text });
      }
    }

    // Where the framework is.
    const dir = driverDir();
    const runRecord = dir ? readJson(path.join(dir, "run.json")) : null;
    const instruction = dir ? readJson(path.join(dir, "instruction.json")) : null;
    if (runRecord && runRecord.phase !== lastPhase) {
      lastPhase = runRecord.phase;
      log("framework", "phase", false, { phase: lastPhase, stop: runRecord.stop ?? null });
    }
    if (instruction && instruction.seq !== lastSeq) {
      lastSeq = instruction.seq;
      log("framework", "instruction", false, { seq: instruction.seq, kind: instruction.kind, step: instruction.step_id ?? null });
      if (firstWorkAt === null && instruction.kind === "step" && instruction.step_id !== "plan") firstWorkAt = Date.now();
    }
    if (runRecord && runRecord.phase === "complete") break;

    // The engine's prompts, answered the way an operator would.
    if (engine === "claude") {
      const text = await terminalText(app, page);
      if (Date.now() - lastScreen > 30_000) {
        // What the harness read, so a prompt it did not recognise can be seen afterwards.
        lastScreen = Date.now();
        log("harness", "screen", false, { tail: text.split(/\r?\n/).filter((line) => line.trim()).slice(-12) });
        await page.screenshot({ path: path.join(OUT, "latest.png") });
      }
      if (/Quick safety check|trust this folder|Do you trust|trust the files|Yes, proceed/i.test(text.split(/\r?\n/).slice(-14).join("\n"))) {
        const answer = await answerPrompt(app, page, text, (options) => options.findIndex((line) => /\byes\b/i.test(line)));
        if (answer) log("operator", "answer-trust-prompt", false, { permissions: true, ...answer });
      } else if (/Do you want to/i.test(text.split(/\r?\n/).slice(-14).join("\n"))) {
        const answer = await answerPrompt(app, page, text, (options) => {
          const always = options.findIndex((line) => /don.t ask again/i.test(line));
          return always >= 0 ? always : options.findIndex((line) => /\byes\b/i.test(line));
        });
        if (answer) log("operator", "approve-tool", true, answer);
      }
    } else {
      const events = copilotEvents();
      if (!copilotSubmitted) {
        if (events.some((event) => event.type === "user.message")) copilotSubmitted = true;
        else {
          // Start typed the sentence at the prompt and left it for Enter. Copilot draws on the
          // alternate screen, so whether this Enter submits the sentence or answers a
          // folder-trust prompt cannot be read; the screenshot is the evidence of which.
          await focusEngine(page);
          const shot = `enter-${Math.round((Date.now() - t0) / 1000)}.png`;
          await page.screenshot({ path: path.join(OUT, shot) });
          await page.keyboard.press("Enter");
          // Which it was is read from Copilot's record: a submitted sentence arrives as a
          // user message within seconds, and an answered trust prompt is followed by nothing.
          let submitted = false;
          for (let look = 0; look < 16 && !submitted; look++) {
            await sleep(500);
            submitted = copilotEvents().some((event) => event.type === "user.message");
          }
          if (submitted) {
            copilotSubmitted = true;
            log("operator", "press-enter-on-typed-sentence", true, { screenshot: shot });
          } else {
            log("operator", "answer-trust-prompt", false, { permissions: true, screenshot: shot, evidence: "no user message followed" });
          }
        }
      }
      const completed = new Set(events.filter((e) => e.type === "permission.completed").map((e) => e.data?.requestId));
      for (const request of events.filter((e) => e.type === "permission.requested")) {
        const id = request.data?.requestId;
        if (completed.has(id) || answered.has(id)) continue;
        answered.add(id);
        await focusEngine(page);
        await page.keyboard.press("Enter");
        log("operator", "approve-tool", true, { intention: request.data?.permissionRequest?.intention ?? "" });
      }
    }

    // The operator's questions.
    for (const turn of human) {
      if (turn.done) continue;
      const due =
        turn.when === "wait" ? lastPhase === "verify" :
        turn.when === "turn" ? firstWorkAt !== null && Date.now() - firstWorkAt > 20_000 :
        Date.now() - started > Number(turn.when) * 1000;
      if (!due) continue;
      turn.done = true;
      await typeIntoEngine(page, turn.text);
      log("operator", "question", false, { when: turn.when, text: turn.text, phase: lastPhase });
      await sleep(20_000);
      await page.screenshot({ path: path.join(OUT, `question-${turn.when}.png`) });
    }
    await sleep(5000);
  }

  log("harness", lastPhase === "complete" ? "session-complete" : "deadline", false, { phase: lastPhase, seconds: Math.round((Date.now() - started) / 1000) });
  await page.screenshot({ path: path.join(OUT, "end.png") });
  if (engine === "claude") fs.writeFileSync(path.join(OUT, "terminal.txt"), await terminalText(app, page));
  keepEngineLog();
  await app.close().catch(() => {});
  log("harness", "done", false);
})().catch(async (error) => {
  log("harness", "error", false, { message: String(error && error.stack ? error.stack : error) });
  console.error(error);
  if (page) {
    await page.screenshot({ path: path.join(OUT, "error.png") }).catch(() => {});
    const notifications = await page.locator(".notification-list-item-message").allInnerTexts().catch(() => []);
    log("harness", "error-context", false, { notifications });
  }
  try {
    keepEngineLog();
  } catch {
    // The walk has already failed; a missing record is said by its absence.
  }
  if (app) await app.close().catch(() => {});
  process.exit(1);
});
