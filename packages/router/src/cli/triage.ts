// `dabbler triage` -- a second opinion on a stopped session.
//
// Engine-facing. An engine that is stuck runs it and reads the answer; the
// unattended loop calls the same function on a deadlock-class stop. Nothing
// in the Work Explorer presses it, because triage spends a provider call
// and a button that spends one is a button somebody presses to see what it
// does.
//
// It prints and it writes nothing. The classification is an opinion, and an
// opinion that quietly landed on the record would be indistinguishable from
// a finding the framework stands behind.

import { SessionsRootNotFoundError, resolveSessionsDir } from "../evidence.ts";
import { IdentityResolutionError } from "../identity.ts";
import { dumps } from "../pythonJson.ts";
import { RouterError } from "../route.ts";
import { TriageError, triage } from "../triage.ts";
import { writeErr, writeOut } from "./output.ts";

const EXIT_OK = 0;
const EXIT_USAGE = 2;
const EXIT_BOUNDARY = 3;
const EXIT_CALL_FAILED = 4;

function usage(): string {
  return [
    "usage: dabbler triage [-h] [--sessions-dir SESSIONS_DIR] [--session SESSION]",
    "                      [--provider PROVIDER] [--transport TRANSPORT] [--json]",
    "",
    "Ask a provider that is not the working engine's to classify a stopped session:",
    "engine-error, framework-defect or plan-defect, with the minimal amendment and one",
    "recommendation. It reads the record and writes nothing.",
    "",
    "options:",
    "  -h, --help            show this help message and exit",
    "  --sessions-dir SESSIONS_DIR",
    "                        the repository's sessions root; derived from the",
    "                        working directory when omitted",
    "  --session SESSION     the session to triage; the one in flight when omitted",
    "  --provider PROVIDER   exclude this provider as well as the working engine's,",
    "                        which is how a second rung asks somebody new",
    "  --transport TRANSPORT override the resolved transport for this call",
    "  --json                emit the answer as JSON",
    "",
  ].join("\n");
}

export async function triageVerb(argv: string[]): Promise<number> {
  let sessionsDirArg: string | undefined;
  let session: number | null = null;
  let provider: string | null = null;
  let transport: string | null = null;
  let json = false;

  const value = (token: string, index: number, name: string): string | null => {
    if (token.startsWith(`${name}=`)) return token.slice(name.length + 1);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) return null;
    return next;
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] as string;
    if (token === "--help" || token === "-h") {
      writeOut(usage());
      return EXIT_OK;
    }
    if (token === "--json") {
      json = true;
      continue;
    }
    const named = ["--sessions-dir", "--session", "--provider", "--transport"].find(
      (name) => token === name || token.startsWith(`${name}=`),
    );
    if (named === undefined) {
      writeErr(`dabbler triage: unrecognized argument: ${token}\n\n${usage()}`);
      return EXIT_USAGE;
    }
    const raw = value(token, index, named);
    if (raw === null) {
      writeErr(`dabbler triage: argument ${named}: expected one argument\n`);
      return EXIT_USAGE;
    }
    if (!token.includes("=")) index += 1;
    if (named === "--sessions-dir") sessionsDirArg = raw;
    if (named === "--provider") provider = raw;
    if (named === "--transport") transport = raw;
    if (named === "--session") {
      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed < 1) {
        writeErr(`dabbler triage: argument --session: not a session number: ${raw}\n`);
        return EXIT_USAGE;
      }
      session = parsed;
    }
  }

  let sessionsDir: string;
  try {
    sessionsDir = resolveSessionsDir(sessionsDirArg);
  } catch (error) {
    if (!(error instanceof SessionsRootNotFoundError)) throw error;
    writeErr(`triage: ${error.message}\n`);
    return EXIT_USAGE;
  }

  let outcome;
  try {
    outcome = await triage(sessionsDir, {
      sessionNumber: session,
      alsoExclude: provider === null ? [] : [provider],
      transport,
    });
  } catch (error) {
    if (error instanceof TriageError || error instanceof IdentityResolutionError) {
      writeErr(`triage: ${error.message}\n`);
      return EXIT_BOUNDARY;
    }
    if (error instanceof RouterError) {
      writeErr(
        `triage: the routed call failed: ${error.message}\n` +
          "Nothing was written. The stop is unchanged and still says what it said.\n",
      );
      return EXIT_CALL_FAILED;
    }
    throw error;
  }

  if (json) {
    writeOut(
      dumps(
        {
          classification: outcome.answer.classification,
          reasoning: outcome.answer.reasoning,
          recommendation: outcome.answer.recommendation,
          amendment: outcome.answer.amendment ?? null,
          adviser: outcome.adviser,
          excluded: outcome.excluded,
          simulated: outcome.simulated,
        },
        { indent: 2 },
      ) + "\n",
    );
    return EXIT_OK;
  }

  const amendment = outcome.answer.amendment ?? null;
  const lines = [
    `triage: ${outcome.answer.classification}`,
    `  adviser: ${outcome.adviser.model} (${outcome.adviser.provider}); excluded ${outcome.excluded.join(", ")}` +
      (outcome.simulated ? " -- SIMULATED, served by a script rather than a vendor" : ""),
    "",
    outcome.answer.reasoning,
    "",
  ];
  if (amendment !== null) {
    lines.push(
      `  minimal amendment to step '${amendment.step_id}': ${amendment.reason}`,
      amendment.relaxes_a_gate
        ? "  IT RELAXES A GATE. The framework will not apply it; a person decides, on the record."
        : "  It relaxes no gate. The framework still applies nothing -- a person decides.",
      "",
    );
  }
  lines.push(`  recommendation: ${outcome.answer.recommendation}`, "");
  writeOut(lines.join("\n"));
  return EXIT_OK;
}
