// `dabbler workflow` -- the six-step driver's command line.
//
// Ten subcommands, one per step of the driver plus the two that move work
// between them. The usage text is laid out like a parser's because it is
// what a person reads when they mistype one.

import { ManifestError, STEP_TITLES, STEPS } from "../solution.ts";
import {
  append,
  EXIT_OK,
  EXIT_REFUSED,
  fold,
  read,
  WorkflowError,
} from "../workflow/log.ts";
import {
  type FixArgs,
  loopLabel,
  type ReviewArgs,
  runAuthorTests,
  runFix,
  runReview,
  runSuite,
  runTests,
  type TargetArgs,
  targetOf,
} from "../workflow/commands.ts";
import { project, tryWriteProjection } from "../workflow/project.ts";
import { dumps } from "../pythonJson.ts";
import { writeErr, writeOut } from "./output.ts";

const EXIT_USAGE = 2;

const SUBCOMMANDS = [
  "enter",
  "review",
  "approve",
  "author-tests",
  "test",
  "suite",
  "fix",
  "send-back",
  "contract-changed",
  "status",
] as const;

function usage(): string {
  return [
    "usage: dabbler workflow [-h]",
    "                        {enter,review,approve,author-tests,test,suite,fix,send-back,contract-changed,status}",
    "                        ...",
    "",
    "positional arguments:",
    "  {enter,review,approve,author-tests,test,suite,fix,send-back,contract-changed,status}",
    "    enter               begin a step",
    "    review              send this step's output to two vendors and record",
    "                        what they said",
    "    approve             record the developer's approval",
    "    author-tests        ask a verifier for this step's tests and write the",
    "                        ones the boundary allows",
    "    test                run the authored tests and record the exit code",
    "    suite               run the complete suite against the tree including",
    "                        the authored tests",
    "    fix                 one fix round for the failing suite, confined to",
    "                        the envelope",
    "    send-back           return work to an earlier step",
    "    contract-changed    a contract moved; name the consumers",
    "",
    "options:",
    "  -h, --help            show this help message and exit",
    "",
  ].join("\n");
}

interface Parsed {
  readonly cmd: string;
  readonly workspaceRoot: string;
  readonly component: string | null;
  readonly step: string | null;
  readonly artifact: string[];
  readonly authorProvider: string | null;
  readonly transport: string | null;
  readonly base: string;
  readonly toStep: string | null;
  readonly reason: string | null;
  readonly affects: string;
  readonly version: string | null;
  readonly needsApproval: boolean;
  readonly json: boolean;
}

class UsageError extends Error {}

/** Flags that take a value, mapped to the field they fill. */
const VALUED: Readonly<Record<string, keyof Parsed>> = {
  "--workspace-root": "workspaceRoot",
  "--component": "component",
  "--author-provider": "authorProvider",
  "--transport": "transport",
  "--base": "base",
  "--to": "toStep",
  "--reason": "reason",
  "--affects": "affects",
  "--version": "version",
};

function parseArgs(argv: readonly string[]): Parsed {
  const cmd = argv[0];
  if (cmd === undefined || cmd === "-h" || cmd === "--help") {
    if (cmd === undefined) {
      throw new UsageError(
        "dabbler workflow: error: the following arguments are required: cmd",
      );
    }
    throw new UsageError("");
  }
  if (!(SUBCOMMANDS as readonly string[]).includes(cmd)) {
    throw new UsageError(
      `dabbler workflow: error: argument cmd: invalid choice: '${cmd}' ` +
        `(choose from ${SUBCOMMANDS.map((c) => `'${c}'`).join(", ")})`,
    );
  }

  const parsed: Record<string, unknown> = {
    cmd,
    workspaceRoot: ".",
    component: null,
    step: null,
    artifact: [] as string[],
    authorProvider: null,
    transport: null,
    base: "HEAD",
    toStep: null,
    reason: null,
    affects: "",
    version: null,
    needsApproval: false,
    json: false,
  };

  const rest = argv.slice(1);
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (token === "--artifact") {
      const value = rest[i + 1];
      if (value === undefined) {
        throw new UsageError(
          "dabbler workflow: error: argument --artifact: expected one argument",
        );
      }
      (parsed.artifact as string[]).push(value);
      i += 1;
    } else if (token === "--needs-approval") {
      parsed.needsApproval = true;
    } else if (token === "--json") {
      parsed.json = true;
    } else if (token in VALUED) {
      const value = rest[i + 1];
      if (value === undefined) {
        throw new UsageError(
          `dabbler workflow: error: argument ${token}: expected one argument`,
        );
      }
      parsed[VALUED[token]] = value;
      i += 1;
    } else if (token.startsWith("-")) {
      throw new UsageError(
        `dabbler workflow ${cmd}: error: unrecognized arguments: ${token}`,
      );
    } else if (cmd === "enter" && parsed.step === null) {
      parsed.step = token;
    } else {
      throw new UsageError(
        `dabbler workflow ${cmd}: error: unrecognized arguments: ${token}`,
      );
    }
  }

  if (cmd === "enter") {
    if (parsed.step === null) {
      throw new UsageError(
        "dabbler workflow enter: error: the following arguments are " +
          "required: step",
      );
    }
    if (!STEPS.includes(parsed.step as string)) {
      throw new UsageError(
        `dabbler workflow enter: error: argument step: invalid choice: ` +
          `'${String(parsed.step)}' (choose from ` +
          `${STEPS.map((s) => `'${s}'`).join(", ")})`,
      );
    }
  }
  if ((cmd === "review" || cmd === "author-tests") && (parsed.artifact as string[]).length === 0) {
    throw new UsageError(
      `dabbler workflow ${cmd}: error: the following arguments are ` +
        "required: --artifact",
    );
  }
  if (cmd === "send-back") {
    for (const [flag, field] of [["--to", "toStep"], ["--reason", "reason"]] as const) {
      if (parsed[field] === null) {
        throw new UsageError(
          "dabbler workflow send-back: error: the following arguments are " +
            `required: ${flag}`,
        );
      }
    }
    if (!STEPS.includes(parsed.toStep as string)) {
      throw new UsageError(
        "dabbler workflow send-back: error: argument --to: invalid choice: " +
          `'${String(parsed.toStep)}' (choose from ` +
          `${STEPS.map((s) => `'${s}'`).join(", ")})`,
      );
    }
  }
  if (cmd === "contract-changed" && parsed.version === null) {
    throw new UsageError(
      "dabbler workflow contract-changed: error: the following arguments " +
        "are required: --version",
    );
  }

  return parsed as unknown as Parsed;
}

function splitAffects(affects: string): string[] {
  return affects
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x);
}

function printStatus(root: string, asJson: boolean): number {
  const doc = project(root);
  if (asJson) {
    writeOut(`${dumps(doc, { indent: 2 })}\n`);
    return EXIT_OK;
  }
  const head = doc.solution as Record<string, unknown>;
  writeOut(
    `${String(head.title)} — step ${String(head.stepNumber)}/` +
      `${String(head.stepCount)}: ${String(head.stepTitle)}\n`,
  );
  writeOut(`  review ${loopLabel(head)}\n`);
  writeOut(`  tests  ${loopLabel(head, "test")}\n`);
  writeOut(
    `  suite  ${loopLabel(head, "suite")}, ${String(head.fixRounds)} fix round(s)\n`,
  );
  for (const comp of doc.components as Array<Record<string, unknown>>) {
    let flag = "";
    if (comp.waitingOn === "developer") {
      flag = "  ← needs you";
    } else if (comp.waitingOn === "author") {
      flag = "  ← back with the author";
    }
    flag += `  [review ${loopLabel(comp)}]`;
    flag += `  [tests ${loopLabel(comp, "test")}]`;
    const loops = comp.returns ? `  (${String(comp.returns)} sent back)` : "";
    writeOut(
      `  ${String(comp.name).padEnd(20)} ${String(comp.stepNumber)}/6 ` +
        `${String(comp.stepTitle).padEnd(34)}${loops}${flag}\n`,
    );
  }
  const needsYou = doc.needsYou as string[];
  if (needsYou.length > 0) {
    writeOut(`\nWaiting on you: ${needsYou.join(", ")}\n`);
  }
  return EXIT_OK;
}

export async function workflowVerb(argv: string[]): Promise<number> {
  let args: Parsed;
  try {
    args = parseArgs(argv);
  } catch (error) {
    if (error instanceof UsageError) {
      if (!error.message) {
        writeOut(usage());
        return EXIT_OK;
      }
      writeErr(`${usage()}${error.message}\n`);
      return EXIT_USAGE;
    }
    throw error;
  }

  const root = args.workspaceRoot;
  const targetArgs: TargetArgs = {
    component: args.component,
    workspaceRoot: root,
  };

  try {
    if (args.cmd === "status") return printStatus(root, args.json);

    if (args.cmd === "enter") {
      append(root, {
        event: "entered",
        scope: args.component ? "component" : "solution",
        target: targetOf(targetArgs),
        step: args.step,
      });
      writeOut(`${targetOf(targetArgs)} → ${STEP_TITLES[args.step as string]}\n`);
    } else if (args.cmd === "review") {
      return await runReview(
        { ...targetArgs, artifact: args.artifact, authorProvider: args.authorProvider, transport: args.transport } satisfies ReviewArgs,
        root,
      );
    } else if (args.cmd === "author-tests") {
      return await runAuthorTests(
        { ...targetArgs, artifact: args.artifact, authorProvider: args.authorProvider, transport: args.transport } satisfies ReviewArgs,
        root,
      );
    } else if (args.cmd === "test") {
      return await runTests(targetArgs, root);
    } else if (args.cmd === "suite") {
      return await runSuite(targetArgs, root);
    } else if (args.cmd === "fix") {
      return await runFix(
        { ...targetArgs, base: args.base, transport: args.transport } satisfies FixArgs,
        root,
      );
    } else if (args.cmd === "approve") {
      const openFindings = (fold(read(root)).get(targetOf(targetArgs))?.findings ??
        []) as unknown[];
      append(root, {
        event: "approved",
        target: targetOf(targetArgs),
        by: "developer",
        // Kept, not erased: an approval that overrode live objections must be
        // legible later as having done so.
        overFindings: openFindings.length,
      });
      writeOut(`${targetOf(targetArgs)} approved\n`);
      if (openFindings.length > 0) {
        writeOut(
          `  over ${openFindings.length} open finding(s), which stay on the ` +
            "record\n",
        );
      }
    } else if (args.cmd === "send-back") {
      const affects = splitAffects(args.affects);
      append(root, {
        event: "returned",
        target: targetOf(targetArgs),
        toStep: args.toStep,
        reason: args.reason,
        affects,
      });
      writeOut(
        `${targetOf(targetArgs)} sent back to ` +
          `${STEP_TITLES[args.toStep as string]}: ${String(args.reason)}\n`,
      );
      if (affects.length > 0) writeOut(`  affected: ${affects.join(", ")}\n`);
    } else if (args.cmd === "contract-changed") {
      const affects = splitAffects(args.affects);
      append(root, {
        event: "contract-changed",
        target: targetOf(targetArgs),
        version: args.version,
        affects,
        needsApproval: args.needsApproval,
      });
      writeOut(`${targetOf(targetArgs)} contract → ${String(args.version)}\n`);
      writeOut(
        `  affected: ${affects.length > 0 ? affects.join(", ") : "nobody"}\n`,
      );
    }
    // The event is recorded either way; a manifest problem must not swallow
    // it. `status` will surface the manifest error plainly.
    tryWriteProjection(root);
  } catch (error) {
    if (error instanceof WorkflowError || error instanceof ManifestError) {
      writeErr(`refused: ${error.message}\n`);
      return EXIT_REFUSED;
    }
    throw error;
  }
  return EXIT_OK;
}
