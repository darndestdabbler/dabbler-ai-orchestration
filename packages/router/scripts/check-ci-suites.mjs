// The CI workflows' check: no gate may name a runner or a script this
// repository does not have.
//
//   node packages/router/scripts/check-ci-suites.mjs
//
// It rides in the lint control (`workspace-check.ts`), beside the boundary,
// selection-map, suite-cost and shipped-docs checks, for the reason all five
// are there: a protection with no auditor is a protection with a date on it.
//
// **The incident is this file's whole justification.** Session 88 retired
// vitest and deleted its declaration. `.github/workflows/candidate-gate.yml`
// went on running `node node_modules/vitest/vitest.mjs run --root
// packages/router` as its step-level proof that the suite had run -- against
// a package that is in no manifest and no lockfile entry, so the step could
// not resolve its module and the gate could never go green. That gate is not
// decoration: `drive.ts` pushes `candidate/s<N>` at the tested SHA and waits
// twenty-five minutes for the gate to fast-forward the trunk, so the first
// session to land through it would have deadlocked on a command that was
// already impossible when it was written. Nothing could see it, because a
// suite tests behaviour and a YAML step is not behaviour -- it is only ever
// proved by running, and this gate had not run.
//
// THREE RULES. The first two are about existence rather than taste:
//
//   - A `node_modules/<package>/...` path a workflow names must belong to a
//     package some manifest in this workspace depends on. This is the rule
//     that would have caught vitest the day its declaration was deleted.
//   - An `npm run <script>` a workflow names must exist in the package.json
//     it would run in -- the root's, or the one `-w <workspace>` or
//     `--prefix <dir>` selects.
//
// **The third is session 154's, and it is the one that was missing.** This
// check could see that the runner a workflow names exists; it could not see
// that the runner a workflow names is not the runner the framework runs.
// `dabbler.yaml` declared the extension suite as `scripts/run-unit.mjs`,
// which armed the catalog seam, and the workflow ran the package's own `npm
// run test:unit`, which did not -- so CI was red for eleven consecutive runs
// while sessions 150, 151 and 152 each closed VERIFIED on a run of record
// taken through the other door. Nothing lied. The framework read the door it
// was told to read, and nothing held the two doors to each other.
//
// So every declared expensive suite must be run by some workflow step, and a
// step that runs a suite must run the declared command -- unless the
// difference is DECLARED, in `scripts/ci-suites.json`, with the reason it is
// deliberate. Declared rather than forbidden, because session 153 left a
// real one behind on purpose (a Podman container locally, windows-latest in
// CI, because that is what proves the platform) and a check that forbade
// every divergence would have been deleted by the next session that needed
// one. A declared divergence no workflow actually runs is refused too: the
// excuse must not outlive the difference it excuses.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { pathToFileURL } from "node:url";

import { parse } from "yaml";

const WORKFLOWS = ".github/workflows";
const CONFIG = "dabbler.yaml";
const DOORS = "scripts/ci-suites.json";
const MANIFESTS = [
  "package.json",
  "packages/router/package.json",
  "tools/dabbler-ai-orchestration/package.json",
];

/** Every package name any manifest in this workspace depends on. */
function declaredDependencies() {
  const names = new Set();
  for (const manifest of MANIFESTS) {
    if (!existsSync(manifest)) continue;
    const pkg = JSON.parse(readFileSync(manifest, "utf8"));
    for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
      for (const name of Object.keys(pkg[field] ?? {})) names.add(name);
    }
  }
  return names;
}

/** The scripts a package.json offers, by the workspace name and by its path. */
function scriptsByPackage() {
  const byName = new Map();
  const byPath = new Map();
  for (const manifest of MANIFESTS) {
    if (!existsSync(manifest)) continue;
    const pkg = JSON.parse(readFileSync(manifest, "utf8"));
    const scripts = new Set(Object.keys(pkg.scripts ?? {}));
    if (typeof pkg.name === "string") byName.set(pkg.name, scripts);
    byPath.set(manifest.replace(/\/?package\.json$/, "") || ".", scripts);
  }
  return { byName, byPath };
}

/**
 * Every command a workflow step runs, with where it was written.
 *
 * Parsed rather than matched out of the text: a `run:` block may be one line
 * or a folded several, and the comparison below is against a command, not
 * against a line of YAML that happens to contain one.
 */
export function workflowCommands(files, read) {
  const commands = [];
  for (const file of files) {
    const document = parse(read(file));
    for (const [job, body] of Object.entries(document?.jobs ?? {})) {
      for (const step of body?.steps ?? []) {
        if (typeof step?.run !== "string") continue;
        for (const line of step.run.split(/\r?\n/)) {
          const command = line.trim();
          if (command !== "") commands.push({ command, where: `${file} (${job})` });
        }
      }
    }
  }
  return commands;
}

/**
 * The doors, held to each other. Data in, failures out, nothing read.
 *
 *   suites    what `dabbler.yaml` declares: {name, command, expensive}
 *   declared  what `scripts/ci-suites.json` says stands for each in CI
 *   commands  what the workflows actually run: {command, where}
 *
 * Pure so `scripts/check-ci-divergence.mjs` can prove it against canned
 * inputs -- a control whose own rule has never been run against a case it
 * should refuse is a control nobody has checked.
 */
export function doorFailures(suites, declared, commands) {
  const failures = [];
  const ran = new Map(commands.map((entry) => [entry.command, entry.where]));
  const byName = new Map(declared.map((entry) => [entry.suite, entry]));

  for (const entry of declared) {
    if (!suites.some((suite) => suite.name === entry.suite)) {
      failures.push(
        `scripts/ci-suites.json names the suite '${entry.suite}', which dabbler.yaml does not declare`,
      );
    }
    if (!ran.has(entry.workflow_command)) {
      failures.push(
        `scripts/ci-suites.json says '${entry.suite}' is run in CI by \`${entry.workflow_command}\`, ` +
          "which no workflow step runs",
      );
    }
  }

  for (const suite of suites) {
    if (!suite.expensive) continue;
    const entry = byName.get(suite.name);
    if (entry === undefined) {
      failures.push(
        `dabbler.yaml declares the expensive suite '${suite.name}' and no workflow is declared to run it. ` +
          "Name the workflow command in scripts/ci-suites.json, or say why CI does not prove this suite",
      );
      continue;
    }
    const same = entry.workflow_command === suite.command;
    const reason = typeof entry.reason === "string" ? entry.reason.trim() : "";
    if (!same && reason === "") {
      failures.push(
        `'${suite.name}' runs \`${suite.command}\` for the framework and \`${entry.workflow_command}\` ` +
          "in CI, and nothing says why. A difference is legal where it is declared: give it a reason in " +
          "scripts/ci-suites.json, or make the two doors one command",
      );
    }
    if (same && reason !== "") {
      failures.push(
        `'${suite.name}' runs the same command either way, so the reason in scripts/ci-suites.json ` +
          "excuses a difference that is not there",
      );
    }
  }
  return failures;
}

function main() {
const dependencies = declaredDependencies();
const { byName, byPath } = scriptsByPackage();
const failures = [];

const workflows = existsSync(WORKFLOWS)
  ? readdirSync(WORKFLOWS).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
  : [];

for (const file of workflows) {
  const path = join(WORKFLOWS, file).split(sep).join("/");
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    const where = `${path}:${index + 1}`;
    // A comment is prose about the workflow, not a command it runs. The
    // incident's own explanation names the retired runner, and a check that
    // failed on the explanation would be uncorrectable.
    if (/^\s*#/.test(line)) return;

    for (const match of line.matchAll(/node_modules\/((?:@[^/\s'"]+\/)?[^/\s'"]+)\//g)) {
      const name = match[1];
      if (!dependencies.has(name)) {
        failures.push(
          `${where}: names node_modules/${name}/, but no manifest in this workspace depends on '${name}'`,
        );
      }
    }

    const run = line.match(/npm\s+run\s+([A-Za-z0-9:_-]+)/);
    if (!run) return;
    const script = run[1];
    const workspace = line.match(/-w\s+([^\s|&;]+)/);
    const prefix = line.match(/--prefix\s+([^\s|&;]+)/);
    let scripts;
    let owner;
    if (workspace) {
      scripts = byName.get(workspace[1]);
      owner = `workspace '${workspace[1]}'`;
      if (!scripts) {
        failures.push(`${where}: names -w ${workspace[1]}, which is no package in this workspace`);
        return;
      }
    } else if (prefix) {
      scripts = byPath.get(prefix[1].replace(/\/$/, ""));
      owner = `package at '${prefix[1]}'`;
      if (!scripts) {
        failures.push(`${where}: names --prefix ${prefix[1]}, which holds no package.json this check knows`);
        return;
      }
    } else {
      // With no workspace named, the script is the one the step's own
      // working directory offers, and this check cannot see that directory
      // without parsing the workflow. It accepts the script if ANY manifest
      // offers it, which still catches a name no package has at all.
      const offered = [...byPath.values()].some((set) => set.has(script));
      if (!offered) {
        failures.push(`${where}: runs 'npm run ${script}', a script no package.json in this workspace offers`);
      }
      return;
    }
    if (!scripts.has(script)) {
      failures.push(`${where}: runs 'npm run ${script}' in ${owner}, which offers no such script`);
    }
  });
}

// And the third rule: the doors this repository declares, held to the doors
// its gates run.
const paths = workflows.map((file) => join(WORKFLOWS, file).split(sep).join("/"));
const suites = (parse(readFileSync(CONFIG, "utf8"))?.testing?.suites ?? []).map((suite) => ({
  name: suite.name,
  command: suite.command,
  expensive: suite.expensive === true,
}));
const declared = JSON.parse(readFileSync(DOORS, "utf8")).suites ?? [];
failures.push(
  ...doorFailures(suites, declared, workflowCommands(paths, (file) => readFileSync(file, "utf8"))),
);

if (failures.length > 0) {
  process.stderr.write("check-ci-suites: a gate and the suite it stands for do not agree\n");
  for (const failure of failures) process.stderr.write(`  ${failure}\n`);
  process.stderr.write(
    "\nA gate is only ever proved by running. Fix the command, add the dependency the workflow needs, " +
      `or declare the difference in ${DOORS} with the reason it is deliberate.\n`,
  );
  process.exit(1);
}

process.stdout.write(
  `check-ci-suites: ${workflows.length} workflow(s) checked, every runner and script present, ` +
    `${suites.filter((suite) => suite.expensive).length} expensive suite(s) run by a declared gate\n`,
);
}

// Only when run, never when imported: `check-ci-divergence.mjs` proves the
// rule above against canned inputs, and a check that ran the repository's own
// files on import would make that proof depend on the repository passing.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
