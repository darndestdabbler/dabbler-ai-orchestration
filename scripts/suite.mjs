#!/usr/bin/env node
// The two doors into this repository's router suite.
//
//   node scripts/suite.mjs container [test paths...]
//   node scripts/suite.mjs host      [test paths...]
//
// `container` runs the platform-independent tests in a CPU-bounded Podman
// container, which is where nearly all of them belong: 360 seconds on this
// Windows host against 17.7 seconds there, and the cost is not the clock but
// the keyboard -- six minutes of relentless spawning on the scheduler the
// editor shares leaves the operator typing one character every two or three
// seconds. `host` runs the few that prove something about Windows and cannot
// be proved anywhere else.
//
// Both are declared as suites in `dabbler.yaml` and both are the run of
// record. `docs/design/suite-runners.md` carries the measurement, says why CI
// stays on `windows-latest`, and names every test that is on the host.
//
// Plain JavaScript, like `run-ts.mjs`: this runs the suite, so it cannot need
// the suite's toolchain to start.

import { spawn, spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IMAGE = "dabbler-suite:local";
const TEST_ROOT = "packages/router/test";
const MEMBERSHIP = join(ROOT, "scripts", "suite-membership.json");

/**
 * The three dependency volumes. They hold Linux `node_modules` and are
 * mounted OVER the three directories the bind mount exposes, so the
 * operator's Windows `node_modules` is never read and never written -- the
 * two trees are different builds of the same dependencies and sharing one
 * would corrupt both.
 */
const VOLUMES = [
  { name: "dabbler-nm-root", mount: "/repo/node_modules" },
  { name: "dabbler-nm-router", mount: "/repo/packages/router/node_modules" },
  { name: "dabbler-nm-ext", mount: "/repo/tools/dabbler-ai-orchestration/node_modules" },
];

/** What npm writes when it has installed this workspace. See `ensureVolumes`. */
const MARKER = "/repo/node_modules/.package-lock.json";

/**
 * What runs, in both doors, so the two cannot drift into running the suite
 * differently. `--test-concurrency=4` is D246 and is a different protection
 * from the container: it bounds the workers inside whichever machine is
 * running them. The `--import` preload is `no-git.ts`, which fails a worker
 * that spawns git outside the walkthroughs and names the test file.
 */
const NODE_TEST = [
  "--test",
  "--test-concurrency=4",
  // TAP, asked for rather than inherited. `node --test` picks its reporter
  // from whether stdout is a terminal, and the two doors run different Node
  // versions -- the host answered `spec` here even through a pipe, which
  // carries no `failureType`, so the cancelled-test guard below was reading a
  // format that cannot say a test was cancelled. A guard that silently sees
  // nothing is the defect it exists to catch.
  "--test-reporter=tap",
  "--import",
  "./packages/router/test/support/no-git.ts",
];

/**
 * The host-only test files, by repository-relative path, from the manifest
 * that carries the reason each one is there. Exported so
 * `check-suite-membership.mjs` reads the same list the runner runs: two
 * readings of which tests are where is how a suite quietly stops proving
 * something.
 */
export function hostOnly() {
  const manifest = JSON.parse(readFileSync(MEMBERSHIP, "utf8"));
  return manifest.host_only.map((entry) => entry.file);
}

/** Every router test file, in the one spelling the rest of this file uses. */
export function allTests() {
  return readdirSync(join(ROOT, TEST_ROOT), { recursive: true })
    .map((name) => `${TEST_ROOT}/${String(name).split("\\").join("/")}`)
    .filter((path) => path.endsWith(".test.ts"))
    .sort();
}

/** Paths as the selector appends them, in the one spelling to compare in. */
function normalize(path) {
  return path.split("\\").join("/").replace(/^\.\//, "");
}

/**
 * Which door a test file belongs to.
 *
 * Both suites declare the same `test_roots`, because both draw from the same
 * directory, so the selector offers each of them every changed test file --
 * and a runner that simply ran what it was handed would run `copilot.test.ts`
 * in the container, where it hangs. Each runner takes its own and says out
 * loud which paths it declined and to which suite they went, because a
 * silently dropped test is the failure this whole split exists to prevent.
 */
function partition(mode, paths) {
  const host = new Set(hostOnly().map(normalize));
  const mine = [];
  const theirs = [];
  for (const path of paths) {
    const owned = host.has(normalize(path)) === (mode === "host");
    (owned ? mine : theirs).push(path);
  }
  return { mine, theirs };
}

/** Exit 2 is "could not run", the spelling `run-ts.mjs` already uses here. */
const CANNOT_RUN = 2;

function note(message) {
  process.stderr.write(`suite: ${message}\n`);
}

/** A stop a developer can act on: what refused, and the command that fixes it. */
function stop(what, remedy) {
  process.stderr.write(`suite: ${what}\n`);
  process.stderr.write(`suite: ${remedy}\n`);
  process.exit(CANNOT_RUN);
}

function podman(args, stdio = "pipe") {
  return spawnSync("podman", args, { cwd: ROOT, stdio, encoding: "utf8" });
}

/**
 * Podman answering, or a stop that names it.
 *
 * Never a fall back to the host. A runner that quietly ran somewhere else
 * would be the same defect as a runner that reads a cancelled test as a pass:
 * the suite would still be green and would have stopped proving what it says
 * it proves.
 */
function requirePodman() {
  const probe = podman(["info", "--format", "{{.Host.Arch}}"]);
  if (probe.error && probe.error.code === "ENOENT") {
    stop(
      "podman is not on PATH, and the container suite has no other door.",
      "Install Podman Desktop, or run the host suite instead: node scripts/suite.mjs host",
    );
  }
  if (probe.status !== 0) {
    stop(
      "podman is installed but its machine is not answering.",
      "Start it: podman machine start",
    );
  }
}

/** The image, built from the Containerfile beside `dabbler.yaml` on first use. */
function ensureImage() {
  if (podman(["image", "exists", IMAGE]).status === 0) return;
  note(`building ${IMAGE} from Containerfile (first run only)`);
  const built = podman(
    ["build", "--tag", IMAGE, "--file", join(ROOT, "Containerfile"), ROOT],
    "inherit",
  );
  if (built.status !== 0) {
    stop(
      `podman could not build ${IMAGE} from Containerfile.`,
      "Read the build output above; it is podman's own account of what failed.",
    );
  }
}

function mountArgs() {
  const args = ["--volume", `${ROOT}:/repo`];
  for (const volume of VOLUMES) {
    args.push("--volume", `${volume.name}:${volume.mount}`);
  }
  return args;
}

/**
 * The dependency volumes, populated.
 *
 * An empty volume is populated rather than run against. `node --test` over a
 * tree with no `node_modules` does not fail loudly -- it reports the tests it
 * could load, which is a suite with nothing in it reading as a suite that
 * passed.
 *
 * `--ignore-scripts` is the point of care: `npm ci` would otherwise run the
 * router's `prepare`, which builds `packages/router/dist` -- and `dist` is on
 * the bind mount, so the container would overwrite the operator's own build
 * with a Linux one. Nothing the tests do needs a lifecycle script; the tests
 * read TypeScript sources directly, which Node strips itself.
 */
function ensureVolumes() {
  for (const volume of VOLUMES) {
    if (podman(["volume", "exists", volume.name]).status === 0) continue;
    note(`creating dependency volume ${volume.name}`);
    if (podman(["volume", "create", volume.name]).status !== 0) {
      stop(
        `podman could not create the dependency volume ${volume.name}.`,
        `Inspect it: podman volume inspect ${volume.name}`,
      );
    }
  }

  // npm's own record of the install it did, and not directory emptiness: this
  // is one workspace install across three volumes, and npm hoists the
  // router's dependencies to the root, so `packages/router/node_modules` is
  // LEGITIMATELY empty afterwards. Read as "empty means unpopulated", that
  // volume asks for a fresh `npm ci` on every single run, forever.
  const populate =
    `if [ ! -e ${MARKER} ]; then ` +
    'echo "suite: the dependency volumes carry no install; npm ci into them" >&2; ' +
    "npm ci --ignore-scripts; " +
    "fi";
  const result = podman(
    ["run", "--rm", ...mountArgs(), "--workdir", "/repo", IMAGE, "sh", "-c", populate],
    "inherit",
  );
  if (result.status !== 0) {
    stop(
      "the dependency volumes could not be populated.",
      "Read npm's output above; the volumes are podman's, and `podman volume rm dabbler-nm-root dabbler-nm-router dabbler-nm-ext` starts them over.",
    );
  }
}

// --- A cancelled test is not a pass -------------------------------------------
//
// `node --test` counts a cancelled test outside `# fail`. A file whose tests
// hang reports `# fail 0` with thirty-two of them `cancelledByParent`, and a
// runner reading the failure count calls that green -- having silently
// stopped proving whatever those tests proved. That is not hypothetical: it
// is `copilot.test.ts` on Linux, which is why one file is on the host.

/**
 * The cancelled tests in a TAP stream, each with the file it came from.
 *
 * Exported because `check-cancelled-guard.mjs` proves it against a canned
 * stream: a guard nobody exercises is a guard that can fail silently, which
 * is the defect it exists to catch.
 */
export function scanCancelled(tap) {
  const cancelled = [];
  let pending = null;
  for (const raw of String(tap).split(/\r?\n/)) {
    const line = raw.trim();
    const failed = /^not ok\s+\d+\s+-\s+(.*)$/.exec(line);
    if (failed !== null) {
      pending = { name: failed[1].trim(), file: null, type: null, cancelled: false };
      continue;
    }
    if (pending === null) continue;
    if (line === "...") {
      if (pending.cancelled) cancelled.push(pending);
      pending = null;
      continue;
    }
    const where = /^location:\s*'(.*?)(?::\d+)*'$/.exec(line);
    if (where !== null && pending.file === null) {
      // The container says `/repo/...`; the host says the path it was given.
      pending.file = where[1].replace(/^\/repo\//, "");
    }
    const kind = /^type:\s*'(\w+)'$/.exec(line);
    if (kind !== null) pending.type = kind[1];
    if (/^failureType:\s*'cancelledByParent'$/.test(line)) pending.cancelled = true;
  }
  return cancelled;
}

/** What `# cancelled N` said, or 0 where the stream carried no summary. */
export function cancelledCount(tap) {
  const summary = /^# cancelled (\d+)$/m.exec(String(tap));
  return summary === null ? 0 : Number(summary[1]);
}

/**
 * The verdict on a finished run: the child's own status, unless the run
 * carried a cancelled test and the child was about to call that a pass.
 */
export function verdict(tap, status) {
  const entries = scanCancelled(tap);
  const counted = cancelledCount(tap);
  if (entries.length === 0 && counted === 0) return { status, cancelled: [], counted: 0 };
  return { status: status === 0 ? 1 : status, cancelled: entries, counted };
}

/**
 * Say what stopped being proved, by name and by file. Exported with
 * `verdict`, because a guard that decided correctly and printed nothing
 * useful would leave the next reader with a red run and no name in it.
 */
export function announceCancelled({ cancelled, counted }) {
  if (cancelled.length === 0 && counted === 0) return;
  note(
    `${counted || cancelled.length} test(s) were CANCELLED and did not run. ` +
      "node --test counts these outside `# fail`, so a run read by its failure " +
      "count would call this green while it had stopped proving them:",
  );
  const tests = cancelled.filter((entry) => entry.type !== "suite");
  for (const entry of tests.length > 0 ? tests : cancelled) {
    note(`  ${entry.file ?? "(file not stated)"} :: ${entry.name}`);
  }
  if (cancelled.length === 0) {
    note("  the summary counted them; the stream named none, which is itself worth reading.");
  }
}

/**
 * Run a child, stream its output through untouched, and watch the TAP for
 * cancelled tests. Untouched matters: this output is the run of record, and a
 * runner that rewrote it would be recording its own account of the run rather
 * than the run.
 */
function runWatched(program, argv) {
  return new Promise((done) => {
    const child = spawn(program, argv, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
    let tap = "";
    child.stdout.on("data", (chunk) => {
      tap += chunk.toString();
      process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => process.stderr.write(chunk));
    child.on("error", (error) => {
      process.stderr.write(`suite: ${error.message}\n`);
      done(CANNOT_RUN);
    });
    child.on("close", (status) => {
      const outcome = verdict(tap, status ?? CANNOT_RUN);
      announceCancelled(outcome);
      done(outcome.status);
    });
  });
}

function runContainer(tests) {
  requirePodman();
  ensureImage();
  ensureVolumes();
  const argv = [
    "run",
    "--rm",
    // An init as PID 1, and it is not hygiene -- it is what makes two tests
    // true. The suite kills a grandchild and then asks whether it is gone;
    // an orphan whose parent has died is reparented to PID 1, and a PID 1
    // that does not reap leaves it a zombie, which `process.kill(pid, 0)`
    // answers for exactly as it answers for a live process. Without this the
    // tests read a reaped tree as a tree that survived.
    "--init",
    // Four cores, which is what keeps the box the operator's while the run of
    // record runs. The container is not faster because it has more; it is
    // faster because a spawn inside it is eight and a half times cheaper.
    "--cpus",
    "4",
    ...mountArgs(),
    "--workdir",
    "/repo",
    IMAGE,
    "node",
    ...NODE_TEST,
    ...tests,
  ];
  return runWatched("podman", argv);
}

function runHost(tests) {
  return runWatched(process.execPath, [...NODE_TEST, ...tests]);
}

function main(argv) {
  const mode = argv[0];
  const asked = argv.slice(1);
  if (mode !== "container" && mode !== "host") {
    stop(
      `unknown mode ${mode === undefined ? "(none given)" : `'${mode}'`}.`,
      "Usage: node scripts/suite.mjs <container|host> [test paths...]",
    );
  }
  const other = mode === "container" ? "host" : "container";
  const { mine, theirs } = partition(mode, asked.length > 0 ? asked : allTests());
  for (const path of theirs) {
    note(`declined ${path}: it is the ${other} suite's, and runs there`);
  }
  if (mine.length === 0) {
    // Green, and said out loud. Every file the selector offered belongs to
    // the other door, which is an honest empty run -- unlike a suite that
    // found no tests, which this runner never reports as a pass.
    note(`nothing for the ${mode} suite among the ${asked.length} path(s) offered`);
    return 0;
  }
  return mode === "container" ? runContainer(mine) : runHost(mine);
}

// Only when run, never when imported: `check-suite-membership.mjs` and
// `check-cancelled-guard.mjs` read this file's exports, so that the list the
// checks hold to and the scanner they prove are the ones the runner uses.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(await main(process.argv.slice(2)));
}
