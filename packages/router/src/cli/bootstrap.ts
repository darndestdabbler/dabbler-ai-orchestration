// `dabbler bootstrap` -- set a consumer project up to run the session
// workflow.
//
// Two of its effects reach outside the project and are kept deliberately: the
// `.gitignore` rewrite, because a tracked run ledger makes verified work look
// like it changed after verification; and the durable `DABBLER_TRANSPORT`
// preference, because the transport belongs to the operator's account rather
// than to any one repository. `--no-transport-detect` is how a caller that
// must not touch the host opts out of the second.

import { statSync } from "node:fs";
import { join } from "node:path";

import { TRANSPORT_ENV_VAR, VALID_TRANSPORTS } from "../config.ts";
import { ensureRoundRefspecs, repoRootFor } from "../evidence.ts";
import {
  DECOMPOSITION_PROMPT,
  IGNORE_RULE,
  PLAN_PROMPT,
  SCOPE_USER,
  detectEcosystems,
  ensureCommitGuard,
  ensureGitignore,
  manualPersistHint,
  persistTransportPreference,
  resolveBootstrapTransport,
  scaffoldBootstrapSessions,
  scaffoldProjectConfig,
  writeInstructionFiles,
} from "../bootstrap/index.ts";
import { writeErr, writeOut } from "./output.ts";

const EXIT_OK = 0;
const EXIT_USAGE = 2;

const CHOICES = [...VALID_TRANSPORTS].sort();

function usage(): string {
  return [
    "usage: dabbler bootstrap [-h] [--project-dir PROJECT_DIR]",
    "                        [--repo-name REPO_NAME] [--print-plan-prompt]",
    "                        [--print-decomposition-prompt]",
    `                        [--transport {${CHOICES.join(",")}}]`,
    "                        [--no-transport-detect] [--machine-scope]",
    "",
    "options:",
    "  --project-dir PROJECT_DIR",
    "                        consumer project root (default: cwd)",
    "  --transport {" + CHOICES.join(",") + "}",
    "                        remember this transport in the persistent",
    `                        ${TRANSPORT_ENV_VAR} environment variable.`,
    "                        Omitted: an existing preference is kept,",
    "                        otherwise a detected Copilot seat sets it",
    "                        automatically.",
    "  --no-transport-detect",
    "                        do not touch the transport preference at all",
    "  --machine-scope       persist the transport preference for every",
    "                        account on the machine instead of this one.",
    "                        Requires elevation, and is the wrong choice",
    "                        when the admin account is a different user.",
    "",
  ].join("\n");
}

const VALUE_FLAGS = new Set(["--project-dir", "--repo-name", "--transport"]);
const BARE_FLAGS = new Set([
  "--print-plan-prompt",
  "--print-decomposition-prompt",
  "--no-transport-detect",
  "--machine-scope",
]);

interface Parsed {
  readonly projectDir: string;
  readonly repoName: string | null;
  readonly printPlanPrompt: boolean;
  readonly printDecompositionPrompt: boolean;
  readonly transport: string | null;
  readonly noTransportDetect: boolean;
  readonly machineScope: boolean;
}

function parseArgs(argv: readonly string[]): Parsed | string {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] as string;
    const equals = token.indexOf("=");
    const name = equals === -1 ? token : token.slice(0, equals);
    if (BARE_FLAGS.has(name)) {
      if (equals !== -1) return `argument ${name}: ignored explicit argument`;
      flags.add(name);
      continue;
    }
    if (!VALUE_FLAGS.has(name)) return `unrecognized arguments: ${token}`;
    if (equals !== -1) {
      values.set(name, token.slice(equals + 1));
      continue;
    }
    const next = argv[index + 1];
    if (next === undefined) return `argument ${name}: expected one argument`;
    values.set(name, next);
    index += 1;
  }
  return {
    projectDir: values.get("--project-dir") ?? ".",
    repoName: values.get("--repo-name") ?? null,
    printPlanPrompt: flags.has("--print-plan-prompt"),
    printDecompositionPrompt: flags.has("--print-decomposition-prompt"),
    transport: values.get("--transport") ?? null,
    noTransportDetect: flags.has("--no-transport-detect"),
    machineScope: flags.has("--machine-scope"),
  };
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function applyTransportPreference(parsed: Parsed): void {
  const [value, reason] = resolveBootstrapTransport(parsed.transport);
  if (value === null) {
    writeOut(`bootstrap: transport unchanged — ${reason}\n`);
    return;
  }
  const scope = persistTransportPreference(value, {
    machine: parsed.machineScope,
  });
  if (scope !== null) {
    const downgrade =
      parsed.machineScope && scope === SCOPE_USER
        ? " (machine scope was requested but unavailable, so this " +
          "applies to your account only)"
        : "";
    writeOut(
      `bootstrap: ${reason}; persisted ${TRANSPORT_ENV_VAR}=` +
        `${value} at ${scope} scope${downgrade} (open a new ` +
        "terminal to pick it up)\n",
    );
    return;
  }
  writeErr(
    `bootstrap: ${reason}, but ${TRANSPORT_ENV_VAR} could not ` +
      `be written at ${SCOPE_USER} scope either. Set it ` +
      `yourself: ${manualPersistHint(value)}\n`,
  );
}

export async function bootstrapVerb(argv: string[]): Promise<number> {
  if (argv.includes("-h") || argv.includes("--help")) {
    writeOut(usage());
    return EXIT_OK;
  }
  const parsed = parseArgs(argv);
  if (typeof parsed === "string") {
    writeErr(`${usage()}dabbler bootstrap: error: ${parsed}\n`);
    return EXIT_USAGE;
  }
  if (
    parsed.transport !== null &&
    !(VALID_TRANSPORTS as readonly string[]).includes(parsed.transport)
  ) {
    writeErr(
      `dabbler bootstrap: argument --transport: invalid choice: ` +
        `'${parsed.transport}' (choose from ${CHOICES.map((c) => `'${c}'`).join(", ")})\n`,
    );
    return EXIT_USAGE;
  }

  if (parsed.printPlanPrompt) {
    writeOut(PLAN_PROMPT + "\n");
    return EXIT_OK;
  }
  if (parsed.printDecompositionPrompt) {
    writeOut(DECOMPOSITION_PROMPT + "\n");
    return EXIT_OK;
  }

  const project = parsed.projectDir;
  if (!isDirectory(project)) {
    writeErr(`bootstrap: not a directory: ${project}\n`);
    return EXIT_USAGE;
  }

  for (const path of writeInstructionFiles(project, parsed.repoName)) {
    writeOut(`bootstrap: wrote managed section in ${path}\n`);
  }
  if (ensureGitignore(project)) {
    writeOut(
      `bootstrap: added ${IGNORE_RULE} to ${join(project, ".gitignore")}\n`,
    );
  }
  // Re-run on an existing clone, this is the migration: a clone made before
  // round refs existed carries neither refspec, and the fix only reaches the
  // machine a session moves to once its clone fetches them.
  if (repoRootFor(project)) {
    for (const entry of ensureRoundRefspecs(project)) {
      writeOut(
        `bootstrap: configured ${entry} so verification-round ` +
          "baselines travel with a push and a fetch\n",
      );
    }
  }
  const hook = ensureCommitGuard(project);
  if (hook !== null) {
    writeOut(`bootstrap: installed the step-execution commit guard at ${hook}\n`);
  }
  if (!parsed.noTransportDetect) applyTransportPreference(parsed);

  const configPath = scaffoldProjectConfig(project);
  if (configPath !== null) {
    const declared = detectEcosystems(project);
    writeOut(`bootstrap: scaffolded ${configPath}\n`);
    writeOut(
      "bootstrap: it declares " +
        (declared.length > 0
          ? declared.map((eco) => eco.key).join(", ") +
            " — check the command and narrow what each suite covers"
          : "no test suite, because nothing at the root of this " +
            "repository says how its tests run; declare one before the " +
            "first session that writes code") +
        "\n",
    );
  }
  const scaffolded = scaffoldBootstrapSessions(project);
  for (const path of scaffolded) {
    writeOut(`bootstrap: scaffolded ${path}\n`);
  }
  if (scaffolded.length > 0) {
    writeOut(
      "bootstrap: commit what this just wrote — the declaration a " +
        "session makes comes before its work, so session 1 is refused " +
        "while setup's own files sit uncommitted in the tree.\n",
    );
    writeOut(
      'bootstrap: then tell your AI agent to "start the next ' +
        'session" — session 1 authors the project plan, then session 2 ' +
        "breaks it into numbered sessions. Neither waits on anyone.\n",
    );
  } else {
    writeOut(
      "bootstrap: a session plan already exists; scaffolding skipped " +
        "(instruction files refreshed only).\n",
    );
  }
  return EXIT_OK;
}
