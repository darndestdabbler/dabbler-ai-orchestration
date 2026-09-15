// Drive one messaging-protocol run through a real VS Code terminal, playing
// the human operator with Playwright.
//   node drive-poc.cjs --engine claude|copilot --run <name> --schedule 90,210
//                      [--human "150:Are you still waiting?|260:..."] [--deadline 900]
// Writes results/<run>/: driver-log.jsonl, framework-log.jsonl, waiter-log.jsonl,
// terminal.txt and screenshots.
const cp = require("child_process");
const fs = require("fs");
const path = require("path");

const TOOLS = "D:/Projects/dabbler-ai-orchestration/tools/dabbler-ai-orchestration";
const { _electron } = require(path.join(TOOLS, "node_modules/@playwright/test"));
const launch = require(path.join(TOOLS, "scripts/vscode-launch.js"));

const arg = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at > 0 ? process.argv[at + 1] : fallback;
};
// A folder and a VS Code profile per run, so two engines can run side by side.
const REPO = arg("--repo", "C:/temp/s176-messaging-poc");
const VSCODE_STATE = arg("--vscode-state", "C:/temp/s176-poc-vscode");
const engine = arg("--engine", "claude");
const run = arg("--run", `${engine}-${Date.now()}`);
const schedule = arg("--schedule", "90");
const deadline = Number(arg("--deadline", "900"));
// Seconds after the framework starts at which to kill the armed waiter, to see
// whether the engine notices and re-arms it with nobody's help.
const kills = String(arg("--kill", ""))
  .split(",")
  .filter(Boolean)
  .map(Number);
const human = String(arg("--human", ""))
  .split("|")
  .filter(Boolean)
  .map((entry) => {
    const colon = entry.indexOf(":");
    return { at: Number(entry.slice(0, colon)), text: entry.slice(colon + 1) };
  });

const OUT = path.join(REPO, "results", run);
fs.mkdirSync(OUT, { recursive: true });
const t0 = Date.now();
const log = (event, extra = {}) =>
  fs.appendFileSync(
    path.join(OUT, "driver-log.jsonl"),
    JSON.stringify({ event, at: new Date().toISOString(), t: Math.round((Date.now() - t0) / 1000), ...extra }) + "\n",
  );

const OPENING = "Read AGENTS.md and begin: arm the waiter in the background, then end your turn.";
// No prompt on the command line: Copilot discarded `-i` in this terminal, and
// the opening is typed into the chat once the CLI is up, as a person would, for both.
const COMMAND = {
  claude: `claude --allowedTools "Bash(node:*)" "Write" "Edit" "Read"`,
  copilot: `copilot --allow-all`,
}[engine];
if (!COMMAND) throw new Error(`unknown engine ${engine}`);

/** The waiter processes this folder's runs have armed, from its own log. */
function waiterPids({ unfiredOnly = false } = {}) {
  const file = path.join(REPO, "mail", "waiter-log.jsonl");
  if (!fs.existsSync(file)) return [];
  const events = fs
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
  const ended = new Set(events.filter((e) => e.event !== "armed").map((e) => e.pid));
  return [...new Set(events.filter((e) => e.event === "armed" && (!unfiredOnly || !ended.has(e.pid))).map((e) => e.pid))];
}

function killPids(pids) {
  for (const pid of pids) {
    try {
      process.kill(pid);
    } catch {
      // Already gone.
    }
  }
}

/**
 * This folder's waiters and its stand-in framework, and nothing else on the
 * machine: another engine's run may be going beside this one. A framework left
 * from an earlier run would post its schedule into this run's inbox.
 */
function killWaiters() {
  killPids(waiterPids());
  const pidFile = path.join(REPO, "mail", "framework.pid");
  if (fs.existsSync(pidFile)) killPids([Number(fs.readFileSync(pidFile, "utf8"))]);
}

async function palette(page, command) {
  await page.keyboard.press("F1");
  const input = page.locator(".quick-input-widget input");
  await input.waitFor({ state: "visible", timeout: 10_000 });
  await input.fill(`>${command}`);
  await page.waitForTimeout(600);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(800);
}

async function typeIntoTerminal(page, text) {
  await palette(page, "Terminal: Focus Terminal");
  // Click into the terminal and let focus settle: typing straight after the
  // palette closes lost the first characters of a message.
  await page.locator(".terminal-wrapper.active .xterm-screen").first().click().catch(() => {});
  await page.waitForTimeout(1200);
  await page.keyboard.type(text, { delay: 15 });
  await page.waitForTimeout(300);
  await page.keyboard.press("Enter");
}

async function terminalText(app, page) {
  await palette(page, "Terminal: Focus Terminal");
  await palette(page, "Terminal: Select All");
  await palette(page, "Terminal: Copy Selection");
  const text = await app.evaluate(({ clipboard }) => clipboard.readText());
  // Clear the selection with the editor's command, never a key: Escape reaches
  // the CLI, and Claude Code's trust prompt reads it as "cancel" and exits.
  await palette(page, "Terminal: Clear Selection");
  return text;
}

/** The terminal's last non-empty line is PowerShell's own prompt: the CLI has exited. */
function engineGone(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return /^PS [A-Z]:\\/.test(lines[lines.length - 1] ?? "");
}

/**
 * Answer a folder-trust prompt with its first "Yes" option, whatever the
 * engine calls it: find the highlighted option and move to the yes one. A
 * blind Enter takes the highlighted default, which for Claude Code is "No, exit".
 */
async function acceptTrust(app, page) {
  const deadline = Date.now() + 40_000;
  while (Date.now() < deadline) {
    const text = await terminalText(app, page);
    // Only a prompt at the bottom of the screen is showing; one in the
    // scrollback was answered or cancelled already.
    const tail = text.split(/\r?\n/).filter((line) => line.trim()).slice(-8);
    if (!tail.some((line) => /\b(yes|no)\b/i.test(line)) || engineGone(text)) return "no-prompt";
    const options = tail
      .map((line) => line.replace(/\s+$/, ""))
      .filter((line) => /^\s*(?:[❯>›]\s*)?(?:\d+[.)]\s*)?(yes|no)\b/i.test(line));
    const current = options.findIndex((line) => /^\s*[❯>›]/.test(line));
    const yes = options.findIndex((line) => /\byes\b/i.test(line));
    if (yes < 0) {
      await sleep(2000);
      continue;
    }
    await palette(page, "Terminal: Focus Terminal");
    const moves = yes - Math.max(current, 0);
    for (let i = 0; i < Math.abs(moves); i++) await page.keyboard.press(moves > 0 ? "ArrowDown" : "ArrowUp");
    await page.keyboard.press("Enter");
    log("trust-answered", { options, current, yes });
    await sleep(4000);
  }
  return "gave-up";
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  killWaiters();
  // The waiter's timeout for this run: a keep-alive when set, the default otherwise.
  const waiterConfig = path.join(REPO, "waiter.config.json");
  const waiterTimeout = arg("--waiter-timeout", "");
  if (waiterTimeout) fs.writeFileSync(waiterConfig, JSON.stringify({ timeoutSeconds: Number(waiterTimeout) }) + "\n");
  else fs.rmSync(waiterConfig, { force: true });
  log("waiter-timeout", { seconds: waiterTimeout || "default (3600)" });
  for (const dir of ["mail", "work"]) fs.rmSync(path.join(REPO, dir), { recursive: true, force: true });
  // A fresh profile every run: a reused one restores the last run's terminals,
  // and the driver would type into one terminal and read another.
  fs.rmSync(path.join(VSCODE_STATE, "user"), { recursive: true, force: true });
  fs.mkdirSync(path.join(REPO, "work"), { recursive: true });

  const app = await _electron.launch({
    executablePath: launch.findCodeBinary(),
    args: [
      `--user-data-dir=${VSCODE_STATE}/user`,
      `--extensions-dir=${VSCODE_STATE}/ext`,
      ...launch.ISOLATION_FLAGS,
      REPO,
    ],
    env: launch.electronEnv(),
    timeout: 60_000,
  });
  const page = await app.firstWindow();
  await page.waitForTimeout(5000);
  log("launched", { engine, command: COMMAND });

  // Exactly one terminal, the one this run types into and reads.
  await palette(page, "Terminal: Kill All Terminals");
  await page.waitForTimeout(1500);
  await palette(page, "Terminal: Create New Terminal");
  await page.waitForTimeout(4000);
  await typeIntoTerminal(page, COMMAND);
  log("engine-started");
  // A first run in a folder asks whether to trust it. The screenshot shows the
  // prompt as drawn, whichever screen buffer the CLI uses.
  await sleep(10_000);
  await page.screenshot({ path: path.join(OUT, "startup.png") });
  log("trust", { outcome: await acceptTrust(app, page) });
  await sleep(8000);
  const started = await terminalText(app, page);
  if (engineGone(started)) {
    fs.writeFileSync(path.join(OUT, "terminal.txt"), started);
    log("engine-exited", { when: "after trust" });
    await app.close();
    process.exit(1);
  }

  await typeIntoTerminal(page, OPENING);
  log("opening-typed", { text: OPENING });
  await sleep(20_000);
  await page.screenshot({ path: path.join(OUT, "opened.png") });

  const framework = cp.spawn(process.execPath, ["framework.mjs", "--schedule", schedule, "--deadline", String(deadline), "--run", run], {
    cwd: REPO,
    stdio: "ignore",
  });
  const frameworkStart = Date.now();
  let frameworkDone = false;
  framework.on("exit", () => {
    frameworkDone = true;
    log("framework-exited");
  });
  fs.writeFileSync(path.join(REPO, "mail", "framework.pid"), String(framework.pid));
  log("framework-started", { schedule });
  for (const at of kills) {
    setTimeout(() => {
      const armed = waiterPids({ unfiredOnly: true });
      killPids(armed);
      log("waiter-killed", { atSec: at, pids: armed });
    }, at * 1000);
  }

  for (const turn of [...human].sort((a, b) => a.at - b.at)) {
    // Check the CLI before waiting for the moment, not after: the check takes
    // seconds, and a question meant to land mid-turn arrived after the turn.
    const before = await terminalText(app, page);
    if (engineGone(before)) {
      log("engine-exited", { when: `before the human turn at ${turn.at} s` });
      break;
    }
    const wait = frameworkStart + turn.at * 1000 - Date.now();
    if (wait > 0) await sleep(wait);
    await typeIntoTerminal(page, turn.text);
    log("human", { atSec: turn.at, text: turn.text });
    await sleep(20_000);
    await page.screenshot({ path: path.join(OUT, `human-${turn.at}.png`) });
  }

  while (!frameworkDone && Date.now() - frameworkStart < (deadline + 30) * 1000) await sleep(2000);
  await sleep(20_000);
  await page.screenshot({ path: path.join(OUT, "end.png") });
  fs.writeFileSync(path.join(OUT, "terminal.txt"), await terminalText(app, page));
  log("captured");

  await typeIntoTerminal(page, "/exit");
  await sleep(5000);
  await app.close();
  killWaiters();
  for (const name of ["framework-log.jsonl", "waiter-log.jsonl"]) {
    const source = path.join(REPO, "mail", name);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(OUT, name));
  }
  log("done");
})().catch((error) => {
  log("error", { message: String(error && error.stack ? error.stack : error) });
  console.error(error);
  killWaiters();
  process.exit(1);
});
