// Set 115 Session 2 — where one session's plan LIVES inside `spec.md`.
//
// PURE. No `vscode` and no `fs`: a string and a session number in, a line
// range out, which is what lets the whole rule be driven from the Layer 2
// suite instead of only from a real extension host.
//
// WHY A LINE RANGE AND NOT AN EXCERPT
// -----------------------------------
// Set 115's spec settles this before the code starts (decisions 1-3): the
// per-session view is a READ-TIME SLICE OF THE ONE REAL FILE. No sidecar
// `spec-2.md` is generated, and no second copy of the truth is put on
// screen — `spec.md` itself is revealed, positioned at the session's own
// section, so the operator keeps the surrounding context and can scroll to
// the configuration block. A range of lines is the smallest thing that
// expresses that; an extracted string would be the copy the set refuses.
//
// THE HEADING SCAN IS BORROWED, NOT REWRITTEN
// -------------------------------------------
// `sessionStepModel.scanSessionHeads` (mirroring
// `spec_admission._SESSION_HEAD_RE`) already decides what a session
// heading is and where a session's text ends. Re-deriving that here would
// be the duplicate-parser defect L-069-1 names, with the two copies free
// to disagree about where session 3 begins — which the operator would
// report as "it opened the wrong section". So this module owns exactly one
// new decision: how an offset becomes a LINE.

import { scanSessionHeads, stripFencedBlocks } from "./sessionStepModel";

/**
 * A zero-based, inclusive line range inside `spec.md`.
 *
 * Zero-based because that is what `vscode.Position` takes; the editor's
 * own 1-based display is the caller's concern.
 */
export interface SpecSectionRange {
  readonly startLine: number;
  readonly endLine: number;
}

/**
 * The line index of *offset* within *text*.
 *
 * Valid against the ORIGINAL spec text even when computed on the
 * fence-stripped body: `stripFencedBlocks` replaces a stripped line with
 * an empty line rather than deleting it, so line COUNT survives even
 * though character offsets do not.
 */
function lineAt(text: string, offset: number): number {
  let line = 0;
  for (let i = 0; i < offset && i < text.length; i += 1) {
    if (text[i] === "\n") line += 1;
  }
  return line;
}

/**
 * The line range of `### Session <sessionNumber> of M: …` in *specText*,
 * or `null` when this spec does not declare that session.
 *
 * `null` is a first-class answer, not a failure: every caller degrades to
 * opening `spec.md` at the top (Set 115 S2 step 3). A spec with no session
 * headings at all is the shape every pre-114 consumer-repo spec has, and
 * an operator who clicks a session row must still end up looking at the
 * real file.
 *
 * The section runs from its own heading to the line before the NEXT
 * session heading — the same boundary `verify_session.extract_spec_excerpt`
 * and `spec_admission.parse_session_plans` cut on — with trailing blank
 * lines trimmed so the range ends on content rather than on the gap before
 * the next heading. Trailing content is measured against the ORIGINAL
 * text, so a fenced sample at the end of a section (blanked in the scanned
 * body) is still section content.
 *
 * A duplicate heading for the same number resolves to the FIRST, matching
 * the Python extractor's own loop.
 */
export function locateSessionSection(
  specText: string,
  sessionNumber: number,
): SpecSectionRange | null {
  if (typeof specText !== "string" || specText === "") return null;
  if (!Number.isInteger(sessionNumber)) return null;

  const body = stripFencedBlocks(specText);
  const heads = scanSessionHeads(body);
  const index = heads.findIndex((head) => head.number === sessionNumber);
  if (index === -1) return null;

  const originalLines = specText.split("\n");
  const lastLine = originalLines.length - 1;
  const startLine = Math.min(lineAt(body, heads[index].headStart), lastLine);

  let endLine =
    index + 1 < heads.length
      ? Math.max(lineAt(body, heads[index + 1].headStart) - 1, startLine)
      : lastLine;
  while (endLine > startLine && (originalLines[endLine] ?? "").trim() === "") {
    endLine -= 1;
  }

  return { startLine, endLine };
}
