// Verifier-response parsing and blocking classification.
//
// The parser is structural, never prose-scanning: a verdict token at the head
// of the response, `Issue N:` blocks with per-field tolerant parses, and a
// `NITS` section parsed on the same terms. Nothing a verifier wrote is ever
// discarded: a NITS finding is recorded as `minor` and tagged
// `section: nits`, and a NITS finding that declares a blocking severity keeps
// it -- the section is a formatting convention, not a severity. Every
// ambiguity fails closed -- an unrecognizable verdict is ISSUES_FOUND, an
// ISSUES_FOUND body with no parseable block becomes one unknown-severity
// issue, and an unrecognized severity blocks. Severity may not be laundered by
// misspelling.
//
// The severity vocabulary is closed at the writer: `critical` / `major` /
// `minor` only. Anything else normalizes to `major` (blocking-preserving) with
// the raw token kept on the finding for the reader.

export const VERDICT_VERIFIED = "VERIFIED";
export const VERDICT_ISSUES_FOUND = "ISSUES_FOUND";
export const VERDICT_REMEDIATED_AT_CAP = "REMEDIATED_AT_CAP";

/**
 * The closed allowlist for any verdict a writer persists (session-state's
 * verificationVerdict, the rounds ledger). Every token here is produced by the
 * loop; there is no verdict a person can type.
 *
 * REMEDIATED_AT_CAP is not a waiver and must never be read as one. A waiver
 * accepted work over a finding that still stood; this is the opposite --
 * every blocking finding was fixed and the cap left the repair unreviewed.
 * WAIVED is retired from this allowlist, so no writer can emit it again; the
 * record schemas still READ it, because historical rows carry it and a retired
 * token must not make the machine's own record unreadable.
 */
export const SESSION_VERDICTS: ReadonlySet<string> = new Set([
  VERDICT_VERIFIED,
  VERDICT_ISSUES_FOUND,
  VERDICT_REMEDIATED_AT_CAP,
]);

/**
 * How each terminal state of a review loop reads to a person. Keyed by the
 * closed vocabulary and nothing else: a fourth state would have to be added to
 * SESSION_VERDICTS first, which is the point. Every loop and every view that
 * names a terminal state reads it here, so two views cannot describe the same
 * record in two vocabularies.
 */
export const TERMINAL_HEADLINES: Readonly<Record<string, string>> = {
  [VERDICT_VERIFIED]: "verified",
  [VERDICT_ISSUES_FOUND]: "unresolved at the cap",
  [VERDICT_REMEDIATED_AT_CAP]: "remediated at the cap",
};

export const SEVERITIES = ["critical", "major", "minor"] as const;
export const BLOCKING_SEVERITIES: ReadonlySet<string> = new Set([
  "critical",
  "major",
]);

/** A finding, as the parser records it. Fields appear only when declared. */
export interface Finding {
  description: string;
  raw?: string;
  category?: string;
  severity?: string;
  failureScenario?: string;
  evidencePaths?: string[];
  section?: string;
  [field: string]: unknown;
}

// --- Parsing ------------------------------------------------------------------

const VERDICT_PREFIX = /^[\s*_#>-]*VERDICT\s*[:.-]?\s*/;
const MARKDOWN_NOISE = /^[\s*_#>-]+/;
const ISSUES_HEADER =
  /^[\s*_#>-]*(?:VERDICT\s*[:.-]?\s*)?\*?\*?ISSUES?[\s_]*FOUND\*?\*?\s*[-:.]?\s*/;
const NITS_SECTION = /^\s*#{0,6}\s*\*{0,2}NITS\b.*$/im;

// Line-anchored, horizontal whitespace only, trailing ':' or '.' required --
// keeps mid-prose "the issue template" from opening a block.
// The trailing `\*{0,2}` closes `**Issue 1:**` -- bold that wraps the colon
// rather than sitting inside it, which would otherwise open every recorded
// description with a stray `**`.
const ISSUE_MARKER =
  "^[ \\t]*[-*>#]*[ \\t]*\\*{0,2}Issue\\b[ \\t]*\\d*\\*{0,2}[ \\t]*[:.][ \\t]*\\*{0,2}[ \\t]*";
const ISSUE_BLOCKS = new RegExp(
  // `(?![\s\S])` is Python's `\Z`, the end of the string. Under the `m` flag
  // `$` is the end of every LINE, and every block would stop at its first
  // newline.
  `${ISSUE_MARKER}([\\s\\S]*?)(?=${ISSUE_MARKER}|(?![\\s\\S]))`,
  "gim",
);

// NITS bodies are usually a bullet or numbered list, not `Issue N:` blocks.
const BULLET_LINE = /^[ \t]*(?:[-*+•]|\d+[.)])[ \t]+(.*)$/;

const CATEGORY = /Category[\s*:.\-_]*([^\n*]+)/i;
const SEVERITY = /Severity[\s*:.\-_]*(Critical|Major|Minor)/i;
const FAILURE_SCENARIO = /Failure[\s*_-]*scenario[\s*:.\-_]*([^\n]+)/i;
const EVIDENCE_PATHS = /Evidence[\s*_-]*paths?[\s*:.\-_]*([^\n]+)/i;

/**
 * `[verdict, issues]`: the verdict is exactly VERIFIED or ISSUES_FOUND.
 *
 * Fail-closed on both branches: a head that is not VERIFIED is ISSUES_FOUND,
 * and a VERIFIED response still surfaces any structured blocking issue block
 * it carries -- a contradictory token never hides a finding the same response
 * spelled out.
 */
export function parseVerificationResponse(
  response: string | null | undefined,
): [string, Finding[]] {
  const text = response ?? "";
  let head = text.toUpperCase().trim().replace(VERDICT_PREFIX, "");
  head = head.replace(MARKDOWN_NOISE, "");

  if (head.startsWith("VERIFIED")) {
    return [VERDICT_VERIFIED, parseAllFindings(text, true)];
  }

  const body = text.trim().replace(ISSUES_HEADER, "");
  let issues = parseAllFindings(body);
  if (issues.length === 0) {
    const stripped = body.trim();
    issues = [
      {
        description: stripped || "(unparseable verifier response)",
        category: "unknown",
        severity: "unknown",
      },
    ];
  }
  return [VERDICT_ISSUES_FOUND, issues];
}

/** `[body, nits]`. The NITS heading itself belongs to neither half. */
function splitNitsSection(text: string): [string, string] {
  const match = NITS_SECTION.exec(text);
  if (!match) return [text, ""];
  const start = match.index;
  return [text.slice(0, start), text.slice(start + match[0].length)];
}

/**
 * Every finding the response carries, from both sections.
 *
 * Recording a finding and blocking on one are separate decisions -- this
 * function only records. `classifyBlocking` partitions afterwards.
 *
 * `salvageBody` is set on the VERIFIED branch, where an unstructured body
 * would otherwise parse to nothing at all: the ISSUES_FOUND branch has a
 * catch-all for unparseable text and VERIFIED had none, so a verifier that
 * described a defect in prose and still wrote VERIFIED left no record of it.
 */
function parseAllFindings(text: string, salvageBody = false): Finding[] {
  const [body, nits] = splitNitsSection(text);
  let findings = parseIssueBlocks(body);
  for (const issue of findings) issue.section = "body";
  if (findings.length === 0 && salvageBody) findings = salvageBodyBullets(body);
  for (const issue of parseNitsFindings(nits)) findings.push(issue);
  return findings;
}

/**
 * Bullets in a VERIFIED response that carries no `Issue N:` block.
 *
 * A verifier that spells a concern out in a bullet and still writes VERIFIED
 * has written a finding. Defaulted to `minor` unless the bullet declares a
 * severity, so a summary bullet costs one row in the record and never blocks,
 * while a real concern survives to be read.
 *
 * Prose carrying no bullet at all is still not recovered as a finding; the
 * complete response is preserved by `raw_output_ref`.
 */
function salvageBodyBullets(body: string): Finding[] {
  const issues: Finding[] = [];
  for (const line of bulletLines(body)) {
    const issue = issueFromText(line, line);
    issue.section = "body";
    if (issue.severity === undefined) issue.severity = "minor";
    issues.push(issue);
  }
  return issues;
}

/**
 * NITS findings, tagged and defaulted to `minor`.
 *
 * Verifiers rarely use `Issue N:` form under NITS, so structured blocks are
 * tried first and a bullet/numbered list second; a section that is neither is
 * recorded whole rather than dropped. An explicit blocking severity survives
 * -- filing a major finding under NITS does not launder it.
 */
function parseNitsFindings(nits: string): Finding[] {
  if (nits.trim() === "") return [];
  let issues = parseIssueBlocks(nits);
  if (issues.length === 0) {
    issues = bulletLines(nits).map((line) => issueFromText(line, line));
  }
  if (issues.length === 0) {
    const whole = nits.trim();
    issues = [issueFromText(whole, whole.slice(0, 500))];
  }
  for (const issue of issues) {
    issue.section = "nits";
    if (issue.severity === undefined) issue.severity = "minor";
  }
  return issues;
}

function bulletLines(text: string): string[] {
  const lines: string[] = [];
  for (const raw of text.split(/\r\n|[\n\r]/)) {
    const match = BULLET_LINE.exec(raw);
    if (match && match[1].trim() !== "") lines.push(match[1].trim());
  }
  return lines;
}

/**
 * One finding from a span of text, carrying whatever fields it declares.
 *
 * Every path that records a finding goes through here. A declared severity is
 * read wherever the finding is written -- an `Issue N:` block, a NITS bullet, a
 * bullet under a VERIFIED head -- because a severity that is only honoured in
 * one shape is a laundering route into the other shapes.
 */
function issueFromText(block: string, description: string): Finding {
  const issue: Finding = { description, raw: block };
  const category = CATEGORY.exec(block);
  if (category) issue.category = category[1].trim();
  const severity = SEVERITY.exec(block);
  if (severity) issue.severity = severity[1].trim().toLowerCase();
  const scenario = FAILURE_SCENARIO.exec(block);
  if (scenario) issue.failureScenario = scenario[1].trim();
  const paths = EVIDENCE_PATHS.exec(block);
  if (paths) {
    const parsed = parseEvidencePaths(paths[1]);
    if (parsed.length > 0) issue.evidencePaths = parsed;
  }
  return issue;
}

function parseIssueBlocks(text: string): Finding[] {
  const issues: Finding[] = [];
  ISSUE_BLOCKS.lastIndex = 0;
  for (const match of text.matchAll(ISSUE_BLOCKS)) {
    const block = match[1].trim();
    const description =
      block === "" ? "" : (block.split(/\r\n|[\n\r]/)[0] ?? "").trim();
    if (description === "") continue;
    issues.push(issueFromText(block, description));
  }
  return issues;
}

function parseEvidencePaths(raw: string): string[] {
  const paths: string[] = [];
  for (const token of raw.trim().split(/[,;\s]+/)) {
    const normalized = normalizeEvidencePath(token);
    if (normalized) paths.push(normalized);
  }
  return paths;
}

/**
 * Strip markdown/backtick wrapping, a trailing `:<line>` suffix, and normalize
 * separators to forward slashes.
 */
export function normalizeEvidencePath(token: string): string {
  let cleaned = strip(token.trim(), "`*_()[]<>\"'").replace(/\\/g, "/");
  cleaned = cleaned.replace(/:\d+(?:-\d+)?$/, "");
  return strip(cleaned, "`*_ ");
}

/** Python's `str.strip(chars)`: both ends, any of the given characters. */
function strip(text: string, characters: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && characters.includes(text[start] as string)) start += 1;
  while (end > start && characters.includes(text[end - 1] as string)) end -= 1;
  return text.slice(start, end);
}

// --- Adjudication parsing -----------------------------------------------------

export const OUTCOME_UPHELD = "UPHELD";
export const OUTCOME_OVERRULED = "OVERRULED";

// One judgment line per dispute: `Dispute N: UPHOLD — reasons` (or OVERRULE).
// Both verb and past-participle forms are accepted; anything else is no
// judgment at all.
const ADJUDICATION_LINE =
  /^[\s*_#>-]*Dispute\s*(\d+)\s*[:.-]?\s*\*{0,2}(UPHOLD|UPHELD|OVERRULE|OVERRULED)\b\*{0,2}\s*[-—:.,]*\s*(.*)$/gim;

export interface Adjudication {
  readonly outcome: string;
  readonly reasons: string;
}

/**
 * One outcome per dispute, 1-based positional. Fail-closed on every ambiguity:
 * a dispute with no parseable judgment, or judged more than once with
 * disagreeing verdicts, is UPHELD -- an adjudicator that did not clearly
 * overrule a finding has not overruled it.
 */
export function parseAdjudicationResponse(
  response: string | null | undefined,
  disputeCount: number,
): Adjudication[] {
  const judged = new Map<number, Adjudication>();
  ADJUDICATION_LINE.lastIndex = 0;
  for (const match of (response ?? "").matchAll(ADJUDICATION_LINE)) {
    const number = Number.parseInt(match[1] as string, 10);
    const verb = (match[2] as string).toUpperCase();
    let outcome = verb.startsWith("OVERRULE") ? OUTCOME_OVERRULED : OUTCOME_UPHELD;
    let reasons = (match[3] ?? "").trim().slice(0, 1000);
    if (outcome === OUTCOME_OVERRULED && reasons === "") {
      // A judgment is UPHOLD-or-OVERRULE *with reasons*; a bare overrule
      // clears a blocking finding on no argument at all.
      outcome = OUTCOME_UPHELD;
      reasons = "(overrule without reasons — fail closed as UPHELD)";
    }
    const prior = judged.get(number);
    if (prior !== undefined && prior.outcome !== outcome) {
      judged.set(number, {
        outcome: OUTCOME_UPHELD,
        reasons: "(contradictory judgments — fail closed as UPHELD)",
      });
      continue;
    }
    if (prior === undefined) judged.set(number, { outcome, reasons });
  }
  const outcomes: Adjudication[] = [];
  for (let number = 1; number <= disputeCount; number += 1) {
    outcomes.push(
      judged.get(number) ?? {
        outcome: OUTCOME_UPHELD,
        reasons: "(no parseable judgment — fail closed as UPHELD)",
      },
    );
  }
  return outcomes;
}

// --- Severity and blocking ----------------------------------------------------

/**
 * The closed vocabulary, enforced wherever a finding is persisted. An unknown
 * or missing token normalizes to `major` -- blocking is preserved, the
 * vocabulary stays closed.
 */
export function normalizeSeverity(raw: unknown): string {
  const token = String(raw ?? "")
    .trim()
    .toLowerCase();
  return (SEVERITIES as readonly string[]).includes(token) ? token : "major";
}

/**
 * Blocking unless the severity is exactly `minor`. Missing or unrecognized
 * severity blocks (anti-laundering).
 *
 * Severity is the only input, because it is the only one the verifier cannot
 * quietly choose for itself. Findings citing only documentation prose used to
 * be capped non-blocking here, which handed a verifier a self-exemption: the
 * same author picks the severity *and* the evidence paths, so a finding it did
 * not want to hold up the work needed only a `.md` citation to stop counting.
 */
export function isBlockingIssue(issue: Finding): boolean {
  return (
    String(issue.severity ?? "")
      .trim()
      .toLowerCase() !== "minor"
  );
}

/**
 * The findings a fix delta cannot be shown to have answered.
 *
 * This is the whole bar on "remediated at the cap", and it is deliberately
 * per-finding: a changed tree says only that *something* moved, and landing
 * unreviewed work on that would be the retired waiver wearing a machine's
 * name. A finding is shown remediated when the delta touches a path the
 * finding itself cited -- the one claim a machine can check without a
 * reviewer.
 *
 * A finding citing no evidence path can never be shown remediated, and that is
 * correct rather than harsh: there is no site to check, so there is nothing to
 * prove, and the honest outcome is unresolved.
 */
export function unremediatedFindings(
  findings: readonly Finding[] | null | undefined,
  changedPaths: readonly string[],
): Finding[] {
  const touched = new Set(
    changedPaths.map((path) => strip(String(path).replace(/\\/g, "/"), "/")),
  );
  const unshown: Finding[] = [];
  for (const issue of findings ?? []) {
    const cited = (issue.evidencePaths ?? []).map((path) =>
      strip(normalizeEvidencePath(path), "/"),
    );
    const answered = cited.some((path) => path !== "" && deltaTouches(path, touched));
    if (!answered) unshown.push(issue);
  }
  return unshown;
}

/** A cited file, or a cited directory holding a changed file. */
function deltaTouches(cited: string, touched: ReadonlySet<string>): boolean {
  const prefix = cited + "/";
  for (const path of touched) {
    if (path === cited || path.startsWith(prefix)) return true;
  }
  return false;
}

export interface BlockingClassification {
  readonly blocking: boolean;
  readonly reason: string;
  readonly blockingIssues: Finding[];
  readonly nitIssues: Finding[];
}

/**
 * Severity-derived, not token-derived: any blocking finding blocks even under
 * a VERIFIED token; a findings-free non-VERIFIED verdict blocks
 * conservatively.
 */
export function classifyBlocking(
  verdict: string,
  issues: readonly Finding[] | null | undefined,
): BlockingClassification {
  const blockingIssues: Finding[] = [];
  const nits: Finding[] = [];
  for (const issue of issues ?? []) {
    if (isBlockingIssue(issue)) blockingIssues.push(issue);
    else nits.push(issue);
  }

  if (blockingIssues.length > 0) {
    return {
      blocking: true,
      reason: `${blockingIssues.length} blocking finding(s)`,
      blockingIssues,
      nitIssues: nits,
    };
  }
  if ((issues ?? []).length > 0) {
    return {
      blocking: false,
      reason: "findings present but all minor",
      blockingIssues: [],
      nitIssues: nits,
    };
  }
  if (verdict === VERDICT_VERIFIED) {
    return {
      blocking: false,
      reason: "verified, no findings",
      blockingIssues: [],
      nitIssues: [],
    };
  }
  return {
    blocking: true,
    reason: `verdict '${verdict}' with no parseable findings (fail closed)`,
    blockingIssues: [],
    nitIssues: [],
  };
}

/**
 * The session-state writer's exact-allowlist check. A confabulated token (v1
 * incident: `manual-override-development`) or an invented prefix look-alike
 * can never persist.
 */
export function validateSessionVerdict(verdict: unknown): string {
  const token = String(verdict ?? "").trim();
  if (!SESSION_VERDICTS.has(token)) {
    const shown =
      verdict === null || verdict === undefined ? "None" : `'${String(verdict)}'`;
    throw new Error(
      `verdict ${shown} is not in the closed vocabulary ` +
        `[${[...SESSION_VERDICTS]
          .sort()
          .map((allowed) => `'${allowed}'`)
          .join(", ")}]`,
    );
  }
  return token;
}
