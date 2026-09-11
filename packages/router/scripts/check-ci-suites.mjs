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
// TWO RULES, and both are about existence rather than taste:
//
//   - A `node_modules/<package>/...` path a workflow names must belong to a
//     package some manifest in this workspace depends on. This is the rule
//     that would have caught vitest the day its declaration was deleted.
//   - An `npm run <script>` a workflow names must exist in the package.json
//     it would run in -- the root's, or the one `-w <workspace>` or
//     `--prefix <dir>` selects.
//
// What it deliberately does NOT do is compare a workflow's command with
// `dabbler.yaml`'s declared suite command. They are allowed to differ: the
// declaration carries the concurrency and the preload the operator's machine
// needs, and CI runs the package's own `test:unit` door. A check that forced
// them equal would be a rule about style enforced on two files with
// different jobs, and the first session that needed them to differ would
// delete it.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";

const WORKFLOWS = ".github/workflows";
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

if (failures.length > 0) {
  process.stderr.write("check-ci-suites: a workflow names something this repository does not have\n");
  for (const failure of failures) process.stderr.write(`  ${failure}\n`);
  process.stderr.write(
    "\nA gate is only ever proved by running. Fix the command, or add the dependency the workflow needs.\n",
  );
  process.exit(1);
}

process.stdout.write(`check-ci-suites: ${workflows.length} workflow(s) checked, every runner and script present\n`);
