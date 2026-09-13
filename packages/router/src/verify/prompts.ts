// Everything a round or an adjudication SAYS, assembled here and nowhere
// else.
//
// A verifier reads prose, and the prose is the product: the prior-round
// block, the disputed finding with its rebuttal, the cited passage from the
// repository's own record, the task block a round opens with, and the
// adjudicator's brief. None of it decides anything -- the decisions are in
// `rounds`, `disputes` and `steps` -- which is exactly why it is separable,
// and why every string here is compared byte for byte against its Python
// twin.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { briefing, type AgencyGrant } from "../agency.ts";
import { SESSION_PLAN_FILENAME } from "../evidence.ts";
import { extractSpecExcerpt } from "../session.ts";
import type { Row } from "../ledger.ts";
import { dumps } from "../pythonJson.ts";

export function specExcerpt(sessionsDir: string, sessionNumber: number): string {
  let text: string;
  try {
    text = readFileSync(join(sessionsDir, SESSION_PLAN_FILENAME), "utf8");
  } catch {
    return "(session plan unavailable)";
  }
  return extractSpecExcerpt(text, sessionNumber);
}

export const DISPUTE_EVIDENCE_INLINE_CAP = 16 * 1024;

const EVIDENCE_RANGE = /^(.*?):(\d+)(?:-(\d+))?$/;

export interface EvidenceRange {
  readonly path: string;
  readonly start: number | null;
  readonly end: number | null;
}

/**
 * `(path, start, end)` from `path[:START[-END]]`; a bare path is
 * `(path, null, null)`. The range is how a citation stays *relevant* inside
 * a large file instead of hoping the passage lands in a prefix.
 */
export function splitEvidenceRange(token: string): EvidenceRange {
  const match = EVIDENCE_RANGE.exec(token);
  if (!match) return { path: token, start: null, end: null };
  const start = Number.parseInt(match[2] as string, 10);
  const end = match[3] ? Number.parseInt(match[3], 10) : start;
  return { path: match[1] as string, start, end };
}

/**
 * The cited content, fenced -- a rebuttal argues from the record, so the
 * record rides along. A line-range cite renders exactly that passage; a
 * whole-file cite is capped, and the truncation names the range syntax
 * instead of silently dropping the tail. A path missing at render time is
 * said so, never silently dropped.
 */
export function citedEvidenceLines(
  repoRoot: string | null,
  cite: string,
): string[] {
  const { path: relPath, start, end } = splitEvidenceRange(cite);
  const full = join(repoRoot ?? "", ...relPath.split("/"));
  let raw: Buffer;
  try {
    raw = readFileSync(full);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return [`  - Cited evidence \`${cite}\`: (missing at render time)`];
    }
    return [`  - Cited evidence \`${cite}\`: (unreadable as UTF-8)`];
  }
  let text = raw.toString("utf8");
  // Node substitutes U+FFFD where Python's decode raises; a file that does
  // not round-trip was not UTF-8, and the message says so as Python's does.
  if (!Buffer.from(text, "utf8").equals(raw)) {
    return [`  - Cited evidence \`${cite}\`: (unreadable as UTF-8)`];
  }
  if (start !== null && end !== null) {
    const allLines = splitLines(text);
    const excerpt = allLines.slice(start - 1, end).join("\n");
    if (excerpt === "") {
      return [
        `  - Cited evidence \`${cite}\`: (the file has only ` +
          `${allLines.length} line(s); the cited range is empty)`,
      ];
    }
    const label = `\`${relPath}\` lines ${start}-${Math.min(end, allLines.length)}`;
    return [`  - Cited evidence ${label}:`, "", "```", excerpt, "```", ""];
  }
  if ([...text].length > DISPUTE_EVIDENCE_INLINE_CAP) {
    text =
      [...text].slice(0, DISPUTE_EVIDENCE_INLINE_CAP).join("") +
      "\n... (truncated at the inline cap; cite " +
      `\`${relPath}:START-END\` to include a later passage)`;
  }
  return [`  - Cited evidence \`${relPath}\`:`, "", "```", text, "```", ""];
}

/**
 * The line terminators Python's `str.splitlines` recognises beyond `\n`,
 * `\r` and `\r\n`: file/group/record separators, NEL, and the two Unicode
 * separators. Built from code points rather than written as escapes so the
 * set is legible as a list and this file carries no control bytes of its own.
 */
const EXTRA_LINE_TERMINATORS = [
  0x0b, 0x0c, 0x1c, 0x1d, 0x1e, 0x85, 0x2028, 0x2029,
].map((point) => String.fromCharCode(point));

const LINE_BOUNDARY = new RegExp(
  `\\r\\n|[\\n\\r${EXTRA_LINE_TERMINATORS.join("")}]`,
);

/**
 * Python's `str.splitlines`, which splits on more than `\n` and drops a
 * single trailing terminator. A line-range cite is numbered by it, so a
 * naive `split("\n")` would number a CRLF file's passages differently.
 */
export function splitLines(text: string): string[] {
  if (text === "") return [];
  const lines = text.split(LINE_BOUNDARY);
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}


export interface DisputeSplit {
  /** Keyed `"<round>:<findingIndex>"`. */
  readonly pending: Map<string, Row>;
  readonly settled: Map<string, number>;
}

function disputeKey(round: unknown, findingIndex: unknown): string {
  return `${String(round)}:${String(findingIndex)}`;
}

/**
 * `(pending, settledRoundByKey)`: a dispute is PENDING until a round
 * recorded after its filing has presented it; that round's own findings then
 * carry the outcome (re-raised = upheld, absent = withdrawn), so
 * re-presenting the rebuttal would re-litigate a settled point -- the loop
 * this channel exists to end.
 */
export function splitDisputes(
  rounds: readonly Row[],
  disputes: readonly Row[] | null,
): DisputeSplit {
  const pending = new Map<string, Row>();
  const settled = new Map<string, number>();
  for (const dispute of disputes ?? []) {
    const key = disputeKey(dispute["round"], dispute["finding_index"]);
    const later = rounds
      .filter((row) => Number(row["round"]) > Number(dispute["filed_after_round"]))
      .map((row) => Number(row["round"]));
    if (later.length > 0) {
      settled.set(key, Math.min(...later));
    } else {
      pending.set(key, dispute);
    }
  }
  return { pending, settled };
}

function findingsOf(row: Row): Row[] {
  const findings = row["findings"];
  return Array.isArray(findings) ? (findings as Row[]) : [];
}

/**
 * Prior rounds' findings, blocking ones marked unresolved -- a re-raised
 * unresolved point is not resurrection; a new finding must be a new defect
 * within the fix delta. A disputed finding carries the orchestrator's
 * rebuttal beside it exactly once, so a scope dispute converges instead of
 * being re-raised forever.
 */
export function priorFindingsBlock(
  rounds: readonly Row[],
  disputes: readonly Row[] | null = null,
  repoRoot: string | null = null,
): string {
  if (rounds.length === 0) return "";
  const { pending, settled } = splitDisputes(rounds, disputes ?? []);
  const lines: string[] = [
    "#### Prior-round findings (auto-assembled from the run ledger)",
    "",
    "Findings from this session's prior verification rounds. New " +
      "findings must be NEW defects within the fix delta. Re-evaluate " +
      "each unresolved finding: if it persists, RE-RAISE it; if the " +
      "remediation resolves it, say so.",
    "",
  ];
  if (pending.size > 0) {
    lines.splice(
      2,
      0,
      "A finding marked DISPUTED carries the orchestrator's rebuttal " +
        "and its cited evidence directly beside it. Do not simply " +
        "re-raise a disputed finding: engage the rebuttal — UPHOLD the " +
        "finding with reasons that address the cited evidence, or " +
        "WITHDRAW it. A withdrawn finding no longer counts as " +
        "unresolved.",
      "",
    );
  }
  for (const row of rounds) {
    const findings = findingsOf(row);
    lines.push(
      `**Round ${String(row["round"])}** — ${String(row["verdict"])}, ` +
        `${findings.length} finding(s)`,
    );
    findings.forEach((finding, index) => {
      const severity = finding["severity"] ?? "major";
      const description = sliceCodePoints(String(finding["description"] ?? ""), 700);
      const key = disputeKey(row["round"], index);
      const dispute = pending.get(key);
      const marker = dispute ? " [DISPUTED]" : "";
      lines.push(`- [${String(severity)}]${marker} ${description}`);
      const scenario = finding["failureScenario"];
      if (scenario) {
        lines.push(`  - Failure scenario: ${sliceCodePoints(String(scenario), 300)}`);
      }
      if (dispute) {
        lines.push(
          "  - Orchestrator's rebuttal (grounds): " + String(dispute["grounds"]),
        );
        for (const cite of (dispute["evidence_paths"] as string[]) ?? []) {
          lines.push(...citedEvidenceLines(repoRoot, cite));
        }
      } else if (settled.has(key)) {
        lines.push(
          `  - (disputed; the rebuttal was presented in round ` +
            `${String(settled.get(key))} and is settled by that round's ` +
            "findings — do not re-adjudicate it here)",
        );
      }
    });
    lines.push("");
  }
  return lines.join("\n");
}

/** Python slices a str by code point; `String.slice` counts UTF-16 units. */
export function sliceCodePoints(text: string, limit: number): string {
  const points = [...text];
  return points.length <= limit ? text : points.slice(0, limit).join("");
}

export function buildTaskBlock(
  sessionsDir: string,
  sessionNumber: number,
  roundNumber: number,
  priorRounds: readonly Row[],
  disputes: readonly Row[] | null = null,
  repoRoot: string | null = null,
  grant: AgencyGrant | null = null,
): string {
  const parts: string[] = [];
  const prior = priorFindingsBlock(priorRounds, disputes, repoRoot);
  if (prior) parts.push(prior);
  parts.push(
    `Session ${sessionNumber} of the active session set (verification ` +
      `round ${roundNumber}). This is a **pre-close** review. The ` +
      "session's plan, verbatim:\n\n" +
      specExcerpt(sessionsDir, sessionNumber),
  );
  const brief = grant !== null ? briefing(grant) : "";
  if (brief) parts.push(brief);
  return parts.join("\n\n");
}

/** One disputed finding, as the adjudicator's brief presents it. */
export interface DisputedFinding {
  readonly round: number;
  readonly index: number;
  readonly finding: Row;
  readonly dispute: Row;
}

/**
 * The adjudicator judges each dispute -- UPHOLD or OVERRULE -- and may not
 * raise new findings: it judges the dispute, it does not re-review the
 * world. Per dispute: the finding verbatim, the rebuttal verbatim, the cited
 * evidence content, and the current fix-delta ride along.
 */
export function adjudicationPrompt(
  disputed: readonly DisputedFinding[],
  fixDelta: string,
  repoRoot: string | null,
): string {
  const lines: string[] = [
    "You are the ADJUDICATOR for a verification session that reached " +
      "its round cap with disputed blocking findings. Two parties are " +
      "deadlocked: the verifier maintains each finding below; the " +
      "orchestrator has recorded an evidence-backed dispute against " +
      "each. Your task is to judge each dispute on its merits.",
    "",
    "You may NOT raise new findings. You are judging the disputes; " +
      "you are not re-reviewing the work.",
    "",
  ];
  disputed.forEach((entry, position) => {
    lines.push(
      `#### Dispute ${position + 1} — round ${entry.round}, ` +
        `finding ${entry.index}`,
    );
    lines.push("");
    // The complete stored finding record, never a projection -- a partial
    // rendering hands the adjudicator a one-sided record (the dispute rides
    // in full) and can clear a valid finding.
    lines.push(
      "The finding, verbatim (the complete recorded row):",
      "",
      "```json",
      pythonIndentedJson(entry.finding),
      "```",
      "",
    );
    lines.push(
      "The orchestrator's dispute, verbatim (grounds): " +
        String(entry.dispute["grounds"]),
    );
    for (const cite of (entry.dispute["evidence_paths"] as string[]) ?? []) {
      lines.push(...citedEvidenceLines(repoRoot, cite));
    }
    lines.push("");
  });
  lines.push(
    "#### The current fix-delta (last verified snapshot -> current " +
      "working tree)",
    "",
    "```diff",
    fixDelta || "(no changes since the last round)",
    "```",
    "",
    "#### Required output",
    "",
    "For each dispute, exactly one judgment line, nothing else " + "decides the outcome. " +
      "The verb is about the FINDING: UPHOLD keeps the finding standing, so " +
      "the dispute fails; OVERRULE clears the finding, so the dispute " +
      "succeeds.",
    "",
    "Dispute N: UPHOLD — reasons that address the cited evidence (the finding stands)",
    "Dispute N: OVERRULE — reasons (the finding is cleared)",
    "",
    "A dispute you do not clearly judge leaves its finding UPHELD.",
  );
  return lines.join("\n");
}

/**
 * `json.dumps(finding, indent=2)` -- insertion order, not sorted, because
 * the adjudicator is shown the row as it was recorded.
 */
function pythonIndentedJson(value: unknown): string {
  return dumps(value, { indent: 2 });
}
