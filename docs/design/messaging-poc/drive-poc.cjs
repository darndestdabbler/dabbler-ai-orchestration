// Drive one messaging-protocol run through a real VS Code terminal, playing
// the human operator with Playwright.
//
// Mailbox (the comparison control):
//   node drive-poc.cjs --engine claude|copilot --run <name> --schedule 90,210
//                      [--human "150:Are you still waiting?|260:..."] [--deadline 900]
//   Writes results/<run>/: driver-log.jsonl, framework-log.jsonl, waiter-log.jsonl,
//   terminal.txt and screenshots.
//
// Exchange (the next-instruction proof):
//   node drive-poc.cjs --mode exchange --engine claude|copilot --run <name>
//                      --repo C:/temp/<scratch>/<run> [--deadline 1500] [--setup-only]
//   Builds the disposable repository at --repo itself, and writes
//   <scratch>/results/<run>/ beside it, so nothing it writes moves that tree.
const cp = require("child_process");
const fs = require("fs");
const path = require("path");

const arg = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at > 0 ? process.argv[at + 1] : fallback;
};

// The extension whose Playwright and launch helper the driver uses: --tools,
// then DABBLER_EXTENSION_DIR, then this file's own place in the repository. A
// copy run from a scratch folder has no repository around it and names one.
const TOOLS =
  arg("--tools", undefined) ??
  process.env.DABBLER_EXTENSION_DIR ??
  path.resolve(__dirname, "..", "..", "..", "tools", "dabbler-ai-orchestration");
const { _electron } = require(path.join(TOOLS, "node_modules/@playwright/test"));
const launch = require(path.join(TOOLS, "scripts/vscode-launch.js"));

// A folder and a VS Code profile per run, so two engines can run side by side.
const REPO = path.resolve(arg("--repo", process.cwd()));
const VSCODE_STATE = path.resolve(arg("--vscode-state", `${REPO}-vscode`));
const engine = arg("--engine", "claude");
const EXCHANGE = arg("--mode", "mailbox") === "exchange";
const run = arg("--run", `${engine}-${Date.now()}`);
const schedule = arg("--schedule", "90");
const deadline = Number(arg("--deadline", EXCHANGE ? "1500" : "900"));
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

const OUT = EXCHANGE ? path.join(path.dirname(REPO), "results", run) : path.join(REPO, "results", run);
fs.mkdirSync(OUT, { recursive: true });
const t0 = Date.now();
const log = (event, extra = {}) =>
  fs.appendFileSync(
    path.join(OUT, "driver-log.jsonl"),
    JSON.stringify({ event, at: new Date().toISOString(), t: Math.round((Date.now() - t0) / 1000), ...extra }) + "\n",
  );

const OPENING = EXCHANGE
  ? "Read AGENTS.md and begin: make the first request, then follow the protocol until the framework says done."
  : "Read AGENTS.md and begin: arm the waiter in the background, then end your turn.";
// No prompt on the command line: Copilot discarded `-i` in this terminal, and
// the opening is typed into the chat once the CLI is up, as a person would, for both.
const COMMAND = {
  claude: EXCHANGE
    ? `claude --permission-mode acceptEdits --allowedTools "Bash(node:*)" "PowerShell(node:*)" "Read" "Write" "Edit" "Glob" "Grep"`
    : `claude --allowedTools "Bash(node:*)" "Write" "Edit" "Read"`,
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

// The exchange run has two terminals, the AI's and the Dabbler-style one. The
// profile binds a key to each (see writeProfile), so focus never depends on
// which one was used last.
const FOCUS_KEY = { 1: "Control+Shift+F11", 2: "Control+Shift+F12" };
async function focusTerminal(page, index) {
  await palette(page, "Terminal: Focus Terminal");
  if (EXCHANGE) {
    await page.keyboard.press(FOCUS_KEY[index]);
    await page.waitForTimeout(500);
  }
}

async function typeIntoTerminal(page, text, index = 1) {
  await focusTerminal(page, index);
  // Click into the terminal and let focus settle: typing straight after the
  // palette closes lost the first characters of a message.
  await page.locator(".terminal-wrapper.active .xterm-screen").first().click().catch(() => {});
  await page.waitForTimeout(1200);
  await page.keyboard.type(text, { delay: 15 });
  await page.waitForTimeout(300);
  await page.keyboard.press("Enter");
}

async function terminalText(app, page, index = 1) {
  await focusTerminal(page, index);
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
    await focusTerminal(page, 1);
    const moves = yes - Math.max(current, 0);
    for (let i = 0; i < Math.abs(moves); i++) await page.keyboard.press(moves > 0 ? "ArrowDown" : "ArrowUp");
    await page.keyboard.press("Enter");
    log("trust-answered", { options, current, yes });
    await sleep(4000);
  }
  return "gave-up";
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- the exchange run's disposable repository ----------------------------------
const CHECKOUT = path.resolve(__dirname, "..", "..", "..");
const ROUTER = path.join(CHECKOUT, "packages", "router", "dist", "dabbler.cjs");
const MARKER = ".disposable-poc-repo";

function setupDisposable() {
  if (fs.existsSync(REPO)) {
    // Wipe only what an earlier run of this driver made.
    if (!fs.existsSync(path.join(REPO, MARKER))) throw new Error(`${REPO} exists and is not a disposable POC repository; it is not wiped`);
    fs.rmSync(REPO, { recursive: true, force: true });
  }
  fs.mkdirSync(path.join(REPO, "state"), { recursive: true });
  for (const name of ["framework.mjs", "post.mjs"]) fs.copyFileSync(path.join(__dirname, name), path.join(REPO, name));
  const protocol = fs.readFileSync(path.join(__dirname, "protocol-AGENTS.md"), "utf8");
  const section = /<!-- mode:exchange -->\r?\n([\s\S]*?)<!-- \/mode -->/.exec(protocol)[1];
  const write = (name, text) => fs.writeFileSync(path.join(REPO, name), text);
  write("AGENTS.md", section.replaceAll("{{RUN}}", run));
  write("CLAUDE.md", "@AGENTS.md\n");
  write(MARKER, "Made and wiped by docs/design/messaging-poc/drive-poc.cjs.\n");
  write(".gitignore", "state/\ndist/\nnode_modules/\n");
  write("package.json", JSON.stringify({ name: "next-instruction-poc", private: true, type: "module" }, null, 2) + "\n");
  write(
    "tsconfig.json",
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          strict: true,
          rootDir: ".",
          outDir: "dist",
          skipLibCheck: true,
          // The checkout's own compiler and node types: the disposable repository installs nothing.
          typeRoots: [path.join(CHECKOUT, "node_modules", "@types").replace(/\\/g, "/")],
          types: ["node"],
        },
        include: ["src", "test"],
      },
      null,
      2,
    ) + "\n",
  );
  const config = {
    run,
    author: engine,
    // Review is cross-engine: Copilot reads what Claude wrote, and Claude Code what Copilot wrote.
    reviewer: engine === "claude" ? "copilot" : "claude-code",
    router: ROUTER,
    tsc: path.join(CHECKOUT, "node_modules", "typescript", "bin", "tsc"),
    holdSeconds: { 1: Number(arg("--hold-a", "75")), 2: Number(arg("--hold-b", "90")) },
  };
  fs.writeFileSync(path.join(REPO, "state", "config.json"), JSON.stringify(config, null, 2) + "\n");
  const git = (...args) => {
    const done = cp.spawnSync("git", args, { cwd: REPO, encoding: "utf8" });
    if (done.status !== 0) throw new Error(`git ${args.join(" ")}: ${done.stderr}`);
  };
  git("init", "-b", "main");
  git("add", "-A");
  git("commit", "-m", "the disposable repository");
  return config;
}

/** The profile's key for each terminal, and the rule that the editor, not the shell, reads them. */
function writeProfile() {
  const user = path.join(VSCODE_STATE, "user", "User");
  fs.mkdirSync(user, { recursive: true });
  const commands = ["workbench.action.terminal.focusAtIndex1", "workbench.action.terminal.focusAtIndex2"];
  fs.writeFileSync(
    path.join(user, "keybindings.json"),
    JSON.stringify([
      { key: "ctrl+shift+f11", command: commands[0] },
      { key: "ctrl+shift+f12", command: commands[1] },
    ]),
  );
  fs.writeFileSync(path.join(user, "settings.json"), JSON.stringify({ "terminal.integrated.commandsToSkipShell": commands }));
}

const jsonl = (file) =>
  fs.existsSync(file)
    ? fs
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
        .filter(Boolean)
    : [];
const exchangeEvents = () => jsonl(path.join(REPO, "state", "events.jsonl"));

/** Every node process on the machine running the stand-in framework's two scripts. */
function frameworkProcesses() {
  const script =
    "Get-CimInstance Win32_Process -Filter \"name='node.exe'\" | Where-Object { $_.CommandLine -match 'framework\\.mjs|post\\.mjs' } | ForEach-Object { \"$($_.ProcessId) $($_.CommandLine)\" }";
  const out = cp.spawnSync("powershell", ["-NoProfile", "-Command", script], { encoding: "utf8" });
  return (out.stdout ?? "").split(/\r?\n/).filter(Boolean);
}

const version = (command) => (cp.spawnSync(command, { shell: true, encoding: "utf8" }).stdout ?? "").trim().split(/\r?\n/)[0];

async function exchangeRun(app, page) {
  const started = Date.now();
  let lastLook = 0;
  /** Claude Code's screen can be read: a permission prompt is approved as an operator would, and logged as one. */
  const look = async () => {
    if (engine !== "claude" || Date.now() - lastLook < 20_000) return;
    lastLook = Date.now();
    const text = await terminalText(app, page, 1);
    const tail = text.split(/\r?\n/).filter((line) => line.trim()).slice(-14);
    if (engineGone(text)) log("engine-exited", { when: "during the run" });
    if (/Do you want to/i.test(tail.join("\n"))) {
      await focusTerminal(page, 1);
      await page.keyboard.press("Enter");
      log("operator-approved-tool", { tail });
    }
  };
  const until = async (label, pred, seconds, { looking = true } = {}) => {
    const end = Math.min(Date.now() + seconds * 1000, started + deadline * 1000);
    while (Date.now() < end) {
      const found = exchangeEvents().find(pred);
      if (found) {
        log("reached", { label });
        return found;
      }
      if (looking) await look();
      await sleep(looking ? 500 : 100);
    }
    log("timeout", { label, seconds });
    return null;
  };
  const say = async (name, text, { settled = false } = {}) => {
    // An author can finish a small step in five seconds. Where nothing has moved focus since the
    // opening was typed, the question goes straight in rather than after a refocus that takes longer.
    if (settled) {
      await page.keyboard.type(text, { delay: 8 });
      await page.waitForTimeout(200);
      await page.keyboard.press("Enter");
    } else await typeIntoTerminal(page, text, 1);
    log("human", { name, text });
    await sleep(15_000);
    await page.screenshot({ path: path.join(OUT, `human-${name}.png`) });
  };

  // 1. The first instruction arrives; the person speaks while the author works on it.
  if (!(await until("instruction 1 issued", (e) => e.event === "instruction-issued" && e.seq === 1, 240, { looking: false }))) return "no first instruction";
  await say("q1", "Quick question while you work: which instruction sequence number are you working on right now? One sentence, then carry on.", { settled: true });

  // 2. The answer is accepted; the person speaks while the answer command waits on the framework.
  const accepted = await until("answer 1 accepted", (e) => e.event === "answer-accepted" && e.seq === 1, 420);
  if (!accepted) return "answer 1 never accepted";
  await say("q2", "While that runs: is your answer command still running in the background, and what happens when it exits? One sentence, and leave it running.");

  // 3. Kill that answer command once its answer, its build, its test and its review are all
  //    durable; the author is told nothing, and the same command has to come back by its hand.
  const holding = await until("phase A holding", (e) => e.event === "step-started" && e.seq === 1 && e.step === "hold", 300);
  if (!holding) return "phase A never reached its hold";
  const live = exchangeEvents().filter((e) => e.event === "exchange-started" && e.answers === 1).pop();
  killPids([live.pid]);
  await sleep(1000);
  let dead = false;
  try {
    process.kill(live.pid, 0);
  } catch {
    dead = true;
  }
  log("exchange-killed", { pid: live.pid, exchange: live.exchange, dead });
  const back = await until("answer command 1 run again", (e) => e.event === "exchange-started" && e.answers === 1 && e.pid !== live.pid, 300);
  if (!back) return "the killed answer command was never run again";

  // 4. The second phase: a duplicate of the live request, then the Dabbler-style terminal
  //    closed and reopened while the framework still works.
  if (!(await until("instruction 2 issued", (e) => e.event === "instruction-issued" && e.answers === 1, 300))) return "no second instruction";
  const holdingB = await until("phase B holding", (e) => e.event === "step-started" && e.seq >= 2 && e.step === "hold", 600);
  if (!holdingB) return "phase B never reached its hold";
  const owed = JSON.parse(fs.readFileSync(path.join(REPO, "state", "exchange.json"), "utf8")).owed;
  const duplicate = cp.spawnSync(process.execPath, owed.answer_command.split(" ").slice(1), { cwd: REPO, encoding: "utf8" });
  log("duplicate-request", { command: owed.answer_command, exit: duplicate.status, stdout: duplicate.stdout, stderr: duplicate.stderr });

  fs.writeFileSync(path.join(OUT, "watch-before-close.txt"), await terminalText(app, page, 2));
  await focusTerminal(page, 2);
  await palette(page, "Terminal: Kill the Active Terminal Instance");
  log("watch-terminal-closed", { processes: frameworkProcesses() });
  await sleep(8000);
  await palette(page, "Terminal: Create New Terminal");
  await page.waitForTimeout(4000);
  await typeIntoTerminal(page, "node framework.mjs watch", 2);
  await sleep(5000);
  const reopened = await terminalText(app, page, 2);
  fs.writeFileSync(path.join(OUT, "watch-reopened.txt"), reopened);
  await page.screenshot({ path: path.join(OUT, "watch-reopened.png") });
  log("watch-terminal-reopened", {
    reconstructed: /reconstructed (\d+) persisted events/.exec(reopened)?.[1] ?? null,
    eventsOnDisk: exchangeEvents().length,
    stillWorking: !exchangeEvents().some((e) => e.event === "step-done" && e.seq === holdingB.seq && e.step === "hold"),
  });
  await focusTerminal(page, 1);

  // 5. To the end, with nobody's help.
  if (!(await until("done issued", (e) => e.event === "done-issued", 900))) return "done never issued";
  return "done";
}

(async () => {
  if (EXCHANGE) {
    const config = setupDisposable();
    log("disposable-repository", { repo: REPO, ...config });
    log("versions", {
      router: version(`node "${ROUTER}" version`),
      claude: version("claude --version"),
      copilot: version("copilot --version"),
      node: process.version,
      vscode: path.basename(path.dirname(launch.findCodeBinary())),
    });
    if (process.argv.includes("--setup-only")) return;
  } else {
    killWaiters();
    // The waiter's timeout for this run: a keep-alive when set, the default otherwise.
    const waiterConfig = path.join(REPO, "waiter.config.json");
    const waiterTimeout = arg("--waiter-timeout", "");
    if (waiterTimeout) fs.writeFileSync(waiterConfig, JSON.stringify({ timeoutSeconds: Number(waiterTimeout) }) + "\n");
    else fs.rmSync(waiterConfig, { force: true });
    log("waiter-timeout", { seconds: waiterTimeout || "default (3600)" });
    for (const dir of ["mail", "work"]) fs.rmSync(path.join(REPO, dir), { recursive: true, force: true });
    fs.mkdirSync(path.join(REPO, "work"), { recursive: true });
  }
  // A fresh profile every run: a reused one restores the last run's terminals,
  // and the driver would type into one terminal and read another.
  fs.rmSync(path.join(VSCODE_STATE, "user"), { recursive: true, force: true });
  if (EXCHANGE) writeProfile();

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
  if (EXCHANGE && engine === "copilot") {
    // Copilot draws on the alternate screen, so its trust prompt cannot be read. Its
    // highlighted default is "Yes, proceed"; the screenshot above is the evidence.
    await focusTerminal(page, 1);
    await page.keyboard.press("Enter");
    log("trust", { outcome: "enter-pressed-unread", screenshot: "startup.png" });
  } else {
    log("trust", { outcome: await acceptTrust(app, page) });
  }
  await sleep(8000);
  const started = await terminalText(app, page);
  if (engineGone(started)) {
    fs.writeFileSync(path.join(OUT, "terminal.txt"), started);
    log("engine-exited", { when: "after trust" });
    await app.close();
    process.exit(1);
  }

  if (EXCHANGE) {
    // The Dabbler-style terminal is the second one; the AI's stays the first.
    await palette(page, "Terminal: Create New Terminal");
    await page.waitForTimeout(4000);
    await typeIntoTerminal(page, "node framework.mjs watch", 2);
    await sleep(3000);
    const watching = await terminalText(app, page, 2);
    log("watch-terminal-opened", { isTheObserver: watching.includes("DABBLER-STYLE TERMINAL") });
    await page.screenshot({ path: path.join(OUT, "two-terminals.png") });
  }

  await typeIntoTerminal(page, OPENING);
  log("opening-typed", { text: OPENING });

  if (EXCHANGE) {
    const outcome = await exchangeRun(app, page).catch((error) => `driver error: ${error && error.stack ? error.stack : error}`);
    log("exchange-outcome", { outcome });
    // The author's last turn ends on its own; then what is left running is read before anything is closed.
    await sleep(25_000);
    log("processes-at-end", { processes: frameworkProcesses() });
    await page.screenshot({ path: path.join(OUT, "end.png") });
    fs.writeFileSync(path.join(OUT, "terminal.txt"), await terminalText(app, page, 1));
    fs.writeFileSync(path.join(OUT, "watch-end.txt"), await terminalText(app, page, 2));
    log("captured");
    await typeIntoTerminal(page, "/exit", 1);
    await sleep(5000);
    await app.close();
    await sleep(3000);
    log("processes-after-close", { processes: frameworkProcesses() });
    const state = path.join(REPO, "state");
    for (const name of ["events.jsonl", "exchange.json", "config.json"]) {
      if (fs.existsSync(path.join(state, name))) fs.copyFileSync(path.join(state, name), path.join(OUT, name));
    }
    if (fs.existsSync(path.join(state, "logs"))) fs.cpSync(path.join(state, "logs"), path.join(OUT, "logs"), { recursive: true });
    fs.writeFileSync(path.join(OUT, "git-log.txt"), cp.spawnSync("git", ["log", "--format=%h %cI %s"], { cwd: REPO, encoding: "utf8" }).stdout);
    fs.writeFileSync(path.join(OUT, "git-status.txt"), cp.spawnSync("git", ["status", "--short"], { cwd: REPO, encoding: "utf8" }).stdout);
    log("done");
    return;
  }

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
