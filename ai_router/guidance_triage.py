"""Routed bulk-triage for over-budget guidance files (Set 064, D6).

The steady-state lifecycle (D1-D5, Set 064 S2) is forward-looking: it
records usage from the moment it ships and archives on
evidence as history accumulates. It is useless on **day one** for a repo
that is *already* over budget -- every existing lesson has no usage
history, so the disuse trigger would either evict everything or nothing.

This module is the one-time **backlog-remediation** tool the D6 recipe
calls for: it classifies every entry in an over-budget
``lessons-learned.md`` as ``keep-active`` | ``archive`` | ``promote`` |
``merge`` | ``drop`` via a single routed analysis pass, computes the
projected post-remediation size, and writes a proposed triage the
operator reviews before any move. **It never edits the target file** --
the output is a proposal; the operator (or a later harvester-side set)
applies it. Archive != delete (D6 non-goal).

Design (Set 064 S3)
-------------------

- **Permissive block extraction.** Real over-budget files predate the
  D2 trailer scheme and mix ``##`` and ``###`` lesson headings (the
  harvester's 158 KB file has 35 ``###`` lessons under ``##`` section
  headers plus ~29 ``##`` lessons synced from the canonical repo). The
  extractor splits on every heading in a configurable level range and
  lets the routed classifier mark structural/boilerplate blocks
  ``drop`` -- the helper stays dumb about what is a lesson; the routed
  analysis decides (delegation discipline: classification is reasoning).
- **The classification call is routed** (``task_type="analysis"``). The
  helper's deterministic surface -- extraction, projection, JSON
  parsing, rendering -- is pure and unit-tested with an injected
  ``route_fn``; tests never spend.
- **Persist routed output to UTF-8 before any console display** (the
  cp1252 lesson, L-064-3): every raw routed response is collected and
  written to ``--out`` before the rendered report is printed, so a
  cp1252 console can never lose the paid output mid-print. (Parsing is
  exception-safe and does not print, so it runs against the in-memory
  responses; the on-disk copy is the durable record.)
- **ASCII-only terminal output** (L-064-4).
- **Truncation-aware batching** (L-064-1): large files are classified in
  batches; a batch whose response looks truncated is split and retried.

The token estimate is the same ``ceil(chars / 4)`` proxy the reporter
uses (:func:`ai_router.guidance_config.estimate_tokens`), so the
projected size is directly comparable to the D5 ceiling.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass, field
from typing import Callable, Dict, List, Optional, Tuple

try:  # test convention: bare import; production: relative fallback
    from guidance_config import (  # type: ignore[import-not-found]
        GuidanceConfig,
        load_guidance_config,
    )
    from guidance_meta import LessonMeta, parse_trailer  # type: ignore[import-not-found]
except ImportError:
    from .guidance_config import (  # type: ignore[no-redef]
        GuidanceConfig,
        load_guidance_config,
    )
    from .guidance_meta import LessonMeta, parse_trailer  # type: ignore[no-redef]

# ``utils`` uses package-relative imports internally, so it cannot be
# imported by bare filename like the leaf modules above. Resolve it
# package-qualified, which works under both the test sys.path shim and a
# pip-installed package.
try:
    from .utils import detect_truncation  # type: ignore[no-redef]
except ImportError:  # pragma: no cover - bare-import (test) path
    from ai_router.utils import detect_truncation  # type: ignore[no-redef]


# --- classification vocabulary ----------------------------------------------

KEEP = "keep-active"
ARCHIVE = "archive"
PROMOTE = "promote"
MERGE = "merge"
DROP = "drop"
CLASSIFICATIONS = (KEEP, ARCHIVE, PROMOTE, MERGE, DROP)

# Blocks classified into one of these no longer occupy the active tier.
_REMOVED_FROM_ACTIVE = frozenset({ARCHIVE, MERGE, DROP})

# A promoted lesson collapses to a one-line pointer in the active tier.
# The existing promoted pointers in this repo's lessons-learned.md run
# ~400-600 chars (heading + trailer + 3-4 line pointer body); 500 is the
# midpoint estimate. Operator-tunable via --pointer-chars.
DEFAULT_POINTER_CHARS = 500

# Default classification batch size (entries per routed call). The
# harvester's ~64 entries fit one large-context call, but batching keeps
# any single response well under the output cap and bounds truncation
# blast radius.
DEFAULT_BATCH_SIZE = 25

# Per-block body excerpt cap in the prompt (chars). Most lessons are
# shorter; this bounds a pathological block without starving the
# classifier of supersession-detection context.
DEFAULT_EXCERPT_CHARS = 1400

# A heading line at the level range we treat as a triage block boundary.
_HEADING_RE = re.compile(r"^(?P<hashes>#{1,6})\s+(?P<title>.+?)\s*$")


# --- block extraction -------------------------------------------------------


@dataclass
class Block:
    """One heading-delimited section of a guidance file.

    ``char_size`` / ``byte_size`` measure the block's full text (heading
    line through the line before the next in-range heading), so summing
    survivors' ``char_size`` gives the projected retained size directly.
    ``meta`` is the parsed D2 trailer when the block already carries one
    (post-S2 files); ``None`` for the day-one no-trailer case.
    """

    index: int
    level: int
    title: str
    text: str
    char_size: int
    byte_size: int
    meta: Optional[LessonMeta] = None


@dataclass
class Extraction:
    """Result of splitting a file into preamble + triage blocks."""

    preamble: str
    preamble_char_size: int
    preamble_byte_size: int
    blocks: List[Block] = field(default_factory=list)


def _meta_for_block(block_lines: List[str]) -> Optional[LessonMeta]:
    """Find a D2 trailer in the lines immediately under a heading."""
    for ln in block_lines[1:]:
        if ln.strip() == "":
            continue
        return parse_trailer(ln)  # None when the first content line isn't a trailer
    return None


def extract_blocks(
    text: str, min_level: int = 2, max_level: int = 3
) -> Extraction:
    """Split *text* into a preamble and one :class:`Block` per heading.

    A block begins at any heading whose level is in ``[min_level,
    max_level]`` and runs until the next such heading (or EOF). Headings
    outside the range (e.g. the ``#`` file title, or ``####`` sub-points
    inside a lesson body) do **not** start a block, so a lesson's own
    deeper sub-headings stay part of its block. Everything before the
    first in-range heading is the preamble.
    """
    lines = text.split("\n")
    # Character offset of the start of each line in the ORIGINAL text. The
    # "+ 1" restores the "\n" that split() consumed, so slicing the
    # original text by these offsets is byte-exact: preamble + every block
    # text re-partition the file with NO dropped boundary newline. This is
    # what makes ``preamble_char_size + sum(b.char_size) == len(text)``
    # hold (verified by an invariant test) and keeps the projection
    # directly comparable to the source length / guidance_report.
    line_offsets: List[int] = []
    pos = 0
    for ln in lines:
        line_offsets.append(pos)
        pos += len(ln) + 1

    starts: List[Tuple[int, int, str]] = []  # (line_idx, level, title)
    for i, line in enumerate(lines):
        m = _HEADING_RE.match(line)
        if m is None:
            continue
        level = len(m.group("hashes"))
        if min_level <= level <= max_level:
            starts.append((i, level, m.group("title")))

    if not starts:
        return Extraction(
            preamble=text,
            preamble_char_size=len(text),
            preamble_byte_size=len(text.encode("utf-8")),
            blocks=[],
        )

    first = starts[0][0]
    preamble = text[: line_offsets[first]]
    blocks: List[Block] = []
    for n, (start_idx, level, title) in enumerate(starts):
        if n + 1 < len(starts):
            block_text = text[line_offsets[start_idx] : line_offsets[starts[n + 1][0]]]
            end_idx = starts[n + 1][0]
        else:
            block_text = text[line_offsets[start_idx] :]
            end_idx = len(lines)
        blocks.append(
            Block(
                index=n,
                level=level,
                title=title,
                text=block_text,
                char_size=len(block_text),
                byte_size=len(block_text.encode("utf-8")),
                meta=_meta_for_block(lines[start_idx:end_idx]),
            )
        )
    return Extraction(
        preamble=preamble,
        preamble_char_size=len(preamble),
        preamble_byte_size=len(preamble.encode("utf-8")),
        blocks=blocks,
    )


# --- reference graph (D5 "referenced by active guidance" signal) -------------


def _id_token_in(lesson_id: str, text: str) -> bool:
    """True iff *lesson_id* appears in *text* as a whole token.

    Word-boundary match (treating ``-`` and word chars as id characters)
    so ``L-064-1`` does not false-positive inside ``L-064-12``.
    """
    if not lesson_id or not text:
        return False
    pat = r"(?<![\w-])" + re.escape(lesson_id) + r"(?![\w-])"
    return re.search(pat, text) is not None


def build_reference_graph(
    blocks: List[Block], project_guidance_text: str = ""
) -> Dict[str, List[str]]:
    """Map each block id to the places its id is referenced (D5 guard).

    A lesson's id is "referenced by active guidance" when it appears in
    ``project-guidance.md`` or in another lesson's ``superseded-by`` /
    ``encoded-in``. Each reference is recorded by its **source**: the
    literal ``"project-guidance.md"`` or the source lesson's id (so
    :func:`flag_referenced_archives` can later discount references coming
    from blocks that are themselves being removed). Archiving a referenced
    lesson is not forbidden but must be **flagged** for the operator. On
    day-one no-trailer files no ids exist, so this returns ``{}`` (the very
    gap D6 exists to bridge). The ``project-guidance.md`` match is a
    whole-token match, not a raw substring, to avoid id-prefix
    false-positives.
    """
    ids = [b.meta.id for b in blocks if b.meta and b.meta.id]
    refs: Dict[str, List[str]] = {lid: [] for lid in ids}
    for lid in ids:
        if _id_token_in(lid, project_guidance_text):
            refs[lid].append("project-guidance.md")
    for b in blocks:
        if not b.meta or not b.meta.id:
            continue
        for target in tuple(b.meta.superseded_by) + tuple(b.meta.encoded_in):
            if target in refs and target != b.meta.id:
                refs[target].append(b.meta.id)
    return refs


# --- prompt construction -----------------------------------------------------

_PROMPT_HEADER = (
    "You are triaging a repository's append-only `lessons-learned.md` "
    "guidance file that has grown over budget. It is read into context at "
    "the start of EVERY AI-led session, so its size is a recurring token "
    "tax. Your job: classify each numbered block below into exactly one "
    "bucket so the file can be brought back under budget WITHOUT losing "
    "knowledge.\n\n"
    "Buckets:\n"
    "- keep-active: a live, still-relevant lesson that belongs in the "
    "always-loaded tier.\n"
    "- archive: a real lesson but no longer worth loading every session -- "
    "it is superseded, obsolete, its subsystem was retired, or it is "
    "already encoded into an automated test/lint/guard so the prose "
    "reminder is redundant. Archived entries are MOVED to a grep-able "
    "`lessons-archive.md`, never deleted.\n"
    "- promote: a lesson proven across multiple contexts that has become a "
    "durable rule -- it should move up to `project-guidance.md` "
    "(Convention/Principle) and collapse to a one-line pointer here.\n"
    "- merge: this block is a near-duplicate of, or fully subsumed by, "
    "another block; set merge_target to the index of the survivor it "
    "should fold into.\n"
    "- drop: this block is NOT a lesson at all -- boilerplate, a section "
    "header, a template, or a usage note. It carries no durable knowledge "
    "and can be removed.\n\n"
    "Rules:\n"
    "- Be conservative about archive/drop: when unsure whether a lesson is "
    "still live, prefer keep-active. The cost of one extra kept lesson is "
    "small; losing a rare-but-critical disaster lesson is not.\n"
    "- A rare lesson that fires once in many sets is STILL valuable -- do "
    "not archive purely for apparent disuse.\n"
    "- merge_target must reference a DIFFERENT block index that you are "
    "keeping (keep-active or promote), never another merge/archive/drop.\n"
    "- reason_code is a short slug: for archive use one of "
    "superseded|obsolete|encoded|subsystem-retired|disuse; for merge use "
    "duplicate|subsumed; for drop use boilerplate|section-header|template; "
    "for keep-active/promote use a short justification slug.\n\n"
    "Respond with ONLY a JSON array, one object per block, no prose before "
    "or after. Each object:\n"
    '{"index": <int>, "classification": '
    '"keep-active|archive|promote|merge|drop", "reason_code": "<slug>", '
    '"merge_target": <int|null>, "rationale": "<=240 chars", '
    '"confidence": "high|medium|low"}\n'
)


def _excerpt(block: Block, excerpt_chars: int) -> str:
    body = block.text
    if len(body) > excerpt_chars:
        return body[:excerpt_chars] + "\n...[truncated for triage]..."
    return body


def build_triage_prompt(
    blocks: List[Block],
    excerpt_chars: int = DEFAULT_EXCERPT_CHARS,
    usage: Optional[Dict[str, List[str]]] = None,
) -> str:
    """Build the routed classification prompt for *blocks*.

    *usage* is ``{id: [<set>-<session> labels, newest first]}`` from the
    guidance usage ledger (Set 121 S2). It replaces the old
    ``last-used-set`` scalar, which could not distinguish *used once, ten
    sets ago* from *used in every one of the last ten* — the two cases
    that warrant opposite triage verdicts, and therefore the two cases a
    classifier most needs told apart.
    """
    parts = [_PROMPT_HEADER, "\n--- BLOCKS ---\n"]
    uses_by_id = usage or {}
    for b in blocks:
        meta_note = ""
        if b.meta and b.meta.id:
            recent = uses_by_id.get(b.meta.id, [])
            uses_note = ",".join(recent) if recent else "(never recorded)"
            meta_note = (
                f" [existing meta: id={b.meta.id} status={b.meta.status}"
                f" recent-uses={len(recent)}: {uses_note}]"
            )
        parts.append(
            f"\n### BLOCK {b.index} (heading level {b.level}, "
            f"{b.char_size} chars){meta_note}\n"
            f"{_excerpt(b, excerpt_chars)}\n"
        )
    return "".join(parts)


# --- response parsing --------------------------------------------------------


@dataclass
class Classification:
    index: int
    classification: str
    reason_code: str = ""
    merge_target: Optional[int] = None
    rationale: str = ""
    confidence: str = ""


def _extract_json_array(raw: str) -> str:
    """Return the substring from the first '[' to the last ']' in *raw*.

    Tolerates a model that wraps the JSON in a ```json fence or adds
    stray prose despite instructions.
    """
    start = raw.find("[")
    end = raw.rfind("]")
    if start == -1 or end == -1 or end < start:
        raise ValueError("no JSON array found in routed response")
    return raw[start : end + 1]


def parse_triage_response(
    raw: str, valid_indices: Optional[frozenset] = None
) -> Tuple[List[Classification], List[str]]:
    """Parse a routed triage response into classifications + error strings.

    Returns ``(classifications, errors)``. Malformed individual entries
    are collected as errors and skipped; a totally unparseable response
    raises nothing here -- it surfaces as a single error and an empty
    list, so the caller can persist the raw output and report cleanly.
    """
    errors: List[str] = []
    try:
        arr = json.loads(_extract_json_array(raw))
    except (ValueError, json.JSONDecodeError) as exc:
        return [], [f"unparseable routed response: {exc}"]
    if not isinstance(arr, list):
        return [], ["routed response JSON is not an array"]

    out: List[Classification] = []
    seen: set = set()
    for i, item in enumerate(arr):
        if not isinstance(item, dict):
            errors.append(f"entry {i}: not an object")
            continue
        idx = item.get("index")
        if not isinstance(idx, int):
            errors.append(f"entry {i}: missing/invalid 'index'")
            continue
        if valid_indices is not None and idx not in valid_indices:
            errors.append(f"entry {i}: index {idx} out of range")
            continue
        if idx in seen:
            errors.append(f"index {idx}: duplicate classification (kept first)")
            continue
        cls = item.get("classification")
        if cls not in CLASSIFICATIONS:
            errors.append(f"index {idx}: invalid classification {cls!r}")
            continue
        mt = item.get("merge_target")
        if mt is not None and not isinstance(mt, int):
            errors.append(f"index {idx}: merge_target not an int (ignored)")
            mt = None
        if cls == MERGE:
            # A merge that names no valid, distinct target cannot be acted
            # on -- counting it as removed would make the projected savings
            # too optimistic. Reject it from the returned list so the block
            # falls through to "unclassified" and is retained conservatively.
            if mt is None:
                errors.append(
                    f"index {idx}: merge without a valid merge_target "
                    "(left unclassified -> retained)"
                )
                continue
            if mt == idx:
                errors.append(
                    f"index {idx}: merge_target points at itself "
                    "(left unclassified -> retained)"
                )
                continue
        seen.add(idx)
        out.append(
            Classification(
                index=idx,
                classification=cls,
                reason_code=str(item.get("reason_code", "")),
                merge_target=mt,
                rationale=str(item.get("rationale", "")),
                confidence=str(item.get("confidence", "")),
            )
        )
    return out, errors


# --- projection --------------------------------------------------------------


@dataclass
class Projection:
    current_chars: int
    current_tokens: int
    projected_chars: int
    projected_tokens: int
    ceiling_tokens: Optional[int]
    counts: Dict[str, int]
    kept_chars: int
    preamble_chars: int
    pointer_chars_total: int

    @property
    def over_ceiling_before(self) -> bool:
        return self.ceiling_tokens is not None and self.current_tokens > self.ceiling_tokens

    @property
    def over_ceiling_after(self) -> bool:
        return self.ceiling_tokens is not None and self.projected_tokens > self.ceiling_tokens


def _tokens_from_chars(n: int) -> int:
    """``ceil(n / 4)`` -- the estimate_tokens proxy applied to a char count.

    Equivalent to ``estimate_tokens("x" * n)`` without allocating the
    string; kept in lockstep with the reporter's heuristic.
    """
    import math

    return math.ceil(n / 4)


def project_size(
    extraction: Extraction,
    classifications: List[Classification],
    ceiling_tokens: Optional[int],
    pointer_chars: int = DEFAULT_POINTER_CHARS,
) -> Projection:
    """Project the post-remediation active-tier size.

    keep-active blocks retain their full size; promote blocks collapse to
    a ``pointer_chars`` pointer; archive and drop blocks leave the active
    tier entirely. A merge block leaves the active tier **only when its
    ``merge_target`` points at a surviving (keep-active / promote) block**
    -- a merge into a missing, out-of-range, or itself-removed target is
    retained rather than counted as saved. Unclassified blocks (the model
    omitted them) are conservatively retained at full size so the
    projection never *under*-counts what would remain.
    """
    by_index = {c.index: c for c in classifications}
    # Indices of blocks that REMAIN in the active tier after triage. A
    # merge can only remove a block if it folds into a *surviving* block;
    # this set is the authority for that (see the MERGE branch below).
    surviving = {
        b.index
        for b in extraction.blocks
        if (c := by_index.get(b.index)) is not None
        and c.classification in (KEEP, PROMOTE)
    }
    counts = {k: 0 for k in CLASSIFICATIONS}
    counts["unclassified"] = 0
    kept_chars = 0
    promote_count = 0
    for b in extraction.blocks:
        c = by_index.get(b.index)
        if c is None:
            counts["unclassified"] += 1
            kept_chars += b.char_size  # conservative: retain
            continue
        counts[c.classification] += 1
        if c.classification == KEEP:
            kept_chars += b.char_size
        elif c.classification == PROMOTE:
            promote_count += 1
        elif c.classification == MERGE:
            # A merge only removes the block when its target points at a
            # block that SURVIVES the triage. A target that is None,
            # out-of-range, or itself archived/dropped/merged cannot
            # absorb this block -- retain it rather than over-count the
            # savings. (parse_triage_response already rejects None/self;
            # this is the global authority that also catches out-of-range
            # and fold-into-a-removed-block.)
            if c.merge_target not in surviving:
                kept_chars += b.char_size
        # archive / valid-merge-into-survivor / drop contribute 0

    pointer_total = promote_count * pointer_chars
    current_chars = extraction.preamble_char_size + sum(
        b.char_size for b in extraction.blocks
    )
    projected_chars = extraction.preamble_char_size + kept_chars + pointer_total
    return Projection(
        current_chars=current_chars,
        current_tokens=_tokens_from_chars(current_chars),
        projected_chars=projected_chars,
        projected_tokens=_tokens_from_chars(projected_chars),
        ceiling_tokens=ceiling_tokens,
        counts=counts,
        kept_chars=kept_chars,
        preamble_chars=extraction.preamble_char_size,
        pointer_chars_total=pointer_total,
    )


# --- reference-conflict flags ------------------------------------------------


def flag_referenced_archives(
    extraction: Extraction,
    classifications: List[Classification],
    refs: Dict[str, List[str]],
) -> List[str]:
    """Return warnings for blocks proposed archive/merge/drop that are
    referenced by **surviving** active guidance (the D5 'do not silently
    archive a referenced lesson' guard). Empty on day-one no-id files.

    A reference is only a conflict when its source survives the triage:
    ``project-guidance.md`` always counts; a cross-lesson reference counts
    only when the *referring* block is itself kept (keep-active / promote /
    unclassified-and-retained). A reference coming from a block that is
    also being removed is not a real conflict.
    """
    by_index = {c.index: c for c in classifications}
    # ids of blocks that remain in the active tier after triage.
    surviving_ids = set()
    for b in extraction.blocks:
        if not (b.meta and b.meta.id):
            continue
        c = by_index.get(b.index)
        if c is None or c.classification in (KEEP, PROMOTE):
            surviving_ids.add(b.meta.id)

    flags: List[str] = []
    for b in extraction.blocks:
        if not (b.meta and b.meta.id):
            continue
        c = by_index.get(b.index)
        if c is None or c.classification not in _REMOVED_FROM_ACTIVE:
            continue
        live_refs = [
            src
            for src in (refs.get(b.meta.id) or [])
            if src == "project-guidance.md" or src in surviving_ids
        ]
        if live_refs:
            flags.append(
                f"BLOCK {b.index} ({b.meta.id}) proposed {c.classification} "
                f"but is referenced by: {', '.join(live_refs)}"
            )
    return flags


# --- rendering (ASCII-only) --------------------------------------------------


def _trunc(s: str, n: int) -> str:
    s = s.replace("\n", " ").strip()
    return s if len(s) <= n else s[: n - 3] + "..."


def _to_ascii(s: str) -> str:
    """Fold non-ASCII to ``?`` for safe printing to a cp1252 console.

    Real over-budget lesson titles carry em-dashes / arrows. The UTF-8
    report file preserves them; only the terminal copy is folded, so a
    Windows cp1252 console never crashes mid-print (L-064-4 / L-064-3).
    """
    return s.encode("ascii", "replace").decode("ascii")


def _safe_print(s: str) -> None:
    print(_to_ascii(s))


def render_report(
    extraction: Extraction,
    classifications: List[Classification],
    projection: Projection,
    flags: List[str],
    parse_errors: List[str],
    target_label: str,
) -> str:
    """Render the human-readable triage proposal (ASCII-only)."""
    by_index = {c.index: c for c in classifications}
    lines: List[str] = []
    lines.append(f"Guidance backlog triage proposal: {target_label}")
    lines.append("=" * 64)
    lines.append("")
    lines.append("Per-block classification (PROPOSED -- operator-reviewed):")
    lines.append("")
    header = f"{'IDX':>3}  {'LVL':>3}  {'CLASS':<11}  {'CONF':<6}  TITLE"
    lines.append(header)
    lines.append("-" * len(header))
    for b in extraction.blocks:
        c = by_index.get(b.index)
        cls = c.classification if c else "unclassified"
        conf = (c.confidence if c else "") or "-"
        tgt = ""
        if c and c.classification == MERGE and c.merge_target is not None:
            tgt = f" ->#{c.merge_target}"
        lines.append(
            f"{b.index:>3}  {b.level:>3}  {cls + tgt:<11}  {conf:<6}  "
            f"{_trunc(b.title, 60)}"
        )
    lines.append("")
    lines.append("Counts:")
    for k in (KEEP, PROMOTE, MERGE, ARCHIVE, DROP, "unclassified"):
        lines.append(f"  {k:<13} {projection.counts.get(k, 0)}")
    lines.append("")
    lines.append("Projected active-tier size:")
    lines.append(
        f"  current:   {projection.current_chars:>8} chars  "
        f"~{projection.current_tokens} tokens"
    )
    lines.append(
        f"  projected: {projection.projected_chars:>8} chars  "
        f"~{projection.projected_tokens} tokens"
    )
    if projection.ceiling_tokens is not None:
        before = "OVER" if projection.over_ceiling_before else "ok"
        after = "OVER" if projection.over_ceiling_after else "ok"
        pct = (
            round(100 * projection.projected_tokens / projection.ceiling_tokens)
            if projection.ceiling_tokens
            else 0
        )
        lines.append(
            f"  ceiling:   {projection.ceiling_tokens} tokens  "
            f"(before: {before}, after: {after} = {pct}% of ceiling)"
        )
    if projection.current_tokens:
        reduction = round(
            100 * (1 - projection.projected_tokens / projection.current_tokens)
        )
        lines.append(f"  reduction: ~{reduction}%")
    if flags:
        lines.append("")
        lines.append("FLAGGED (referenced-by-active-guidance conflicts):")
        for f in flags:
            lines.append(f"  ! {f}")
    if parse_errors:
        lines.append("")
        lines.append("PARSE NOTES (non-fatal):")
        for e in parse_errors:
            lines.append(f"  - {e}")
    lines.append("")
    lines.append(
        "NOTE: archive != delete (entries move to lessons-archive.md, "
        "grep-able). This is a PROPOSAL; no file was modified. The "
        "operator reviews and applies the moves."
    )
    return "\n".join(lines) + "\n"


# --- routed triage (batched, truncation-aware) -------------------------------


@dataclass
class TriageRun:
    classifications: List[Classification]
    parse_errors: List[str]
    raw_responses: List[str]
    total_cost_usd: float
    models_used: List[str]


def _route_batch(
    blocks: List[Block],
    route_fn: Callable[..., object],
    max_tier: int,
    excerpt_chars: int,
    session_set: Optional[str],
    raw_sink: List[str],
    errors: List[str],
    cost_acc: List[float],
    models: List[str],
    complexity_hint: Optional[int] = None,
    depth: int = 0,
    usage: Optional[Dict[str, List[str]]] = None,
) -> List[Classification]:
    """Classify *blocks* in one routed call, splitting on truncation.

    A response that ``route()`` flagged truncated (or that fails the
    syntactic-completeness heuristic) is retried by halving the batch,
    down to a single block, per the truncation lesson (L-064-1).
    """
    prompt = build_triage_prompt(blocks, excerpt_chars=excerpt_chars, usage=usage)
    rr = route_fn(
        content=prompt,
        task_type="analysis",
        max_tier=max_tier,
        session_set=session_set,
        complexity_hint=complexity_hint,
    )
    content = getattr(rr, "content", "") or ""
    raw_sink.append(content)
    cost_acc.append(float(getattr(rr, "total_cost_usd", 0.0) or 0.0))
    mn = getattr(rr, "model_name", "")
    if mn:
        models.append(mn)

    truncated = bool(getattr(rr, "truncated", False)) or detect_truncation(
        content, ""
    )
    if truncated and len(blocks) > 1 and depth < 8:
        mid = len(blocks) // 2
        left = _route_batch(
            blocks[:mid], route_fn, max_tier, excerpt_chars, session_set,
            raw_sink, errors, cost_acc, models, complexity_hint, depth + 1,
            usage,
        )
        right = _route_batch(
            blocks[mid:], route_fn, max_tier, excerpt_chars, session_set,
            raw_sink, errors, cost_acc, models, complexity_hint, depth + 1,
            usage,
        )
        return left + right

    valid = frozenset(b.index for b in blocks)
    cls, errs = parse_triage_response(content, valid_indices=valid)
    if truncated and len(blocks) == 1:
        errs.append(f"block {blocks[0].index}: response truncated even at batch size 1")
    errors.extend(errs)
    return cls


def run_triage(
    extraction: Extraction,
    route_fn: Optional[Callable[..., object]] = None,
    *,
    max_tier: int = 3,
    batch_size: int = DEFAULT_BATCH_SIZE,
    excerpt_chars: int = DEFAULT_EXCERPT_CHARS,
    session_set: Optional[str] = None,
    complexity_hint: Optional[int] = None,
    usage: Optional[Dict[str, List[str]]] = None,
) -> TriageRun:
    """Run the full routed triage over *extraction*'s blocks.

    *route_fn* defaults to :func:`ai_router.route`; tests inject a stub so
    no paid call happens. Blocks are classified in batches of
    *batch_size*; results are concatenated. *complexity_hint* is passed
    through to :func:`route` so an operator can bias model selection (e.g.
    force a tier-3 model for a high-stakes one-time backlog pass).
    *usage* is the guidance ledger's ``{id: [labels]}`` recency data,
    surfaced to the classifier in place of the retired scalar.
    """
    if route_fn is None:  # pragma: no cover - exercised via main(), not unit tests
        try:
            from . import route as _route  # type: ignore[no-redef]
        except ImportError:  # pragma: no cover
            import importlib

            _route = importlib.import_module("ai_router").route
        route_fn = _route

    raw_sink: List[str] = []
    errors: List[str] = []
    cost_acc: List[float] = []
    models: List[str] = []
    all_cls: List[Classification] = []
    blocks = extraction.blocks
    for start in range(0, len(blocks), max(1, batch_size)):
        batch = blocks[start : start + max(1, batch_size)]
        all_cls.extend(
            _route_batch(
                batch, route_fn, max_tier, excerpt_chars, session_set,
                raw_sink, errors, cost_acc, models, complexity_hint, 0, usage,
            )
        )
    # Note any blocks the model never classified.
    classified = {c.index for c in all_cls}
    for b in blocks:
        if b.index not in classified:
            errors.append(f"block {b.index}: no classification returned")
    return TriageRun(
        classifications=all_cls,
        parse_errors=errors,
        raw_responses=raw_sink,
        total_cost_usd=sum(cost_acc),
        models_used=sorted(set(models)),
    )


# --- CLI ---------------------------------------------------------------------


def _ledger_usage() -> Dict[str, List[str]]:
    """``{id: [<set>-<session> labels]}`` from the guidance usage ledger.

    Best-effort: a missing or unreadable ledger yields an empty mapping,
    and the prompt then says "(never recorded)" rather than failing the
    triage. Set 121 S2 replaced the ``last-used-set`` scalar this used to
    read.
    """
    try:
        try:
            from guidance_ledger import load_ledger  # type: ignore[import-not-found]
        except ImportError:
            from .guidance_ledger import load_ledger  # type: ignore[no-redef]
        ledger, _problems = load_ledger()
    except Exception:  # pragma: no cover - a ledger fault must not break triage
        return {}
    return {key: list(entry.uses) for key, entry in ledger.entries.items()}


def _load_router_config() -> Optional[dict]:
    try:  # pragma: no cover - config IO
        try:
            from config import load_config  # type: ignore[import-not-found]
        except ImportError:
            from .config import load_config  # type: ignore[no-redef]
        return load_config()
    except Exception:  # pragma: no cover - any config failure -> defaults
        return None


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="ai_router.guidance_triage",
        description=(
            "Routed bulk-triage for an over-budget lessons-learned.md "
            "(Set 064 D6). Produces a PROPOSED classification + projected "
            "post-remediation size. Never edits the target file."
        ),
    )
    parser.add_argument("--file", required=True, help="Path to the lessons file to triage.")
    parser.add_argument(
        "--out",
        default=None,
        help="Path to write the raw routed response(s) (UTF-8). "
        "Default: <file>.triage-raw.txt next to the report.",
    )
    parser.add_argument(
        "--report",
        default=None,
        help="Path to write the rendered ASCII report (UTF-8). "
        "Default: stdout only.",
    )
    parser.add_argument(
        "--project-guidance",
        default=None,
        help="Optional project-guidance.md path for the reference-graph guard.",
    )
    parser.add_argument("--min-level", type=int, default=2, help="Min heading level treated as a block (default 2).")
    parser.add_argument("--max-level", type=int, default=3, help="Max heading level treated as a block (default 3).")
    parser.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE)
    parser.add_argument("--max-tier", type=int, default=3)
    parser.add_argument(
        "--complexity-hint",
        type=int,
        default=None,
        help="Bias router model selection (1-100). A high value forces a "
        "tier-3 model -- recommended for a one-time backlog pass to avoid "
        "the tier-2 gemini-pro unbounded-thinking JSON trap.",
    )
    parser.add_argument("--pointer-chars", type=int, default=DEFAULT_POINTER_CHARS)
    parser.add_argument(
        "--excerpt-chars",
        type=int,
        default=DEFAULT_EXCERPT_CHARS,
        help="Per-block body excerpt cap sent to the classifier (default "
        f"{DEFAULT_EXCERPT_CHARS}). Raise it for fuller merge-detection "
        "context on a large one-time pass.",
    )
    parser.add_argument(
        "--ceiling-tokens",
        type=int,
        default=None,
        help="Override the active-tier ceiling (default: from router-config guidance block).",
    )
    parser.add_argument(
        "--session-set",
        default=None,
        help="Session-set slug/path passed through to routing metrics.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Extract + inventory blocks and print the size baseline WITHOUT routing (no spend).",
    )
    args = parser.parse_args(argv)

    try:
        with open(args.file, "r", encoding="utf-8") as f:
            text = f.read()
    except OSError as exc:
        print(f"ERROR: cannot read {args.file}: {exc}")
        return 1

    extraction = extract_blocks(text, min_level=args.min_level, max_level=args.max_level)
    if not extraction.blocks:
        print(f"ERROR: no headings at level {args.min_level}-{args.max_level} in {args.file}.")
        return 1

    cfg: GuidanceConfig = load_guidance_config(_load_router_config())
    ceiling = (
        args.ceiling_tokens
        if args.ceiling_tokens is not None
        else cfg.active_lessons_ceiling_tokens
    )
    target_label = os.path.basename(args.file)

    if args.dry_run:
        proj = project_size(extraction, [], ceiling, pointer_chars=args.pointer_chars)
        print(f"[dry-run] {target_label}: {len(extraction.blocks)} blocks, "
              f"{proj.current_chars} chars (~{proj.current_tokens} tokens), "
              f"ceiling {ceiling} tokens "
              f"({'OVER' if proj.over_ceiling_before else 'ok'}). No routing performed.")
        for b in extraction.blocks:
            _safe_print(f"  #{b.index:>3} L{b.level} {b.char_size:>6}ch  {_trunc(b.title, 64)}")
        return 0

    pg_text = ""
    if args.project_guidance:
        try:
            with open(args.project_guidance, "r", encoding="utf-8") as f:
                pg_text = f.read()
        except OSError:
            pg_text = ""

    run = run_triage(
        extraction,
        max_tier=args.max_tier,
        batch_size=args.batch_size,
        excerpt_chars=args.excerpt_chars,
        session_set=args.session_set,
        complexity_hint=args.complexity_hint,
        usage=_ledger_usage(),
    )

    # Persist raw routed output to UTF-8 FIRST (L-064-3), before any parse
    # or display can crash on a cp1252 console.
    out_path = args.out or (args.file + ".triage-raw.txt")
    try:
        with open(out_path, "w", encoding="utf-8") as f:
            for i, raw in enumerate(run.raw_responses):
                f.write(f"===== routed batch {i} =====\n{raw}\n\n")
        print(f"Wrote raw routed output: {out_path} ({len(run.raw_responses)} batch(es))")
    except OSError as exc:
        print(f"WARNING: could not write raw output to {out_path}: {exc}")

    refs = build_reference_graph(extraction.blocks, pg_text)
    flags = flag_referenced_archives(extraction, run.classifications, refs)
    proj = project_size(extraction, run.classifications, ceiling, pointer_chars=args.pointer_chars)
    report = render_report(
        extraction, run.classifications, proj, flags, run.parse_errors, target_label
    )

    if args.report:
        try:
            with open(args.report, "w", encoding="utf-8") as f:
                f.write(report)
            print(f"Wrote triage report: {args.report}")
        except OSError as exc:
            print(f"WARNING: could not write report to {args.report}: {exc}")

    # ASCII-only summary to stdout (the full report file is UTF-8).
    print("")
    _safe_print(report)
    if run.models_used:
        print(f"Models used: {', '.join(run.models_used)}  "
              f"Routed cost: ${run.total_cost_usd:.4f}")
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())


__all__ = [
    "KEEP",
    "ARCHIVE",
    "PROMOTE",
    "MERGE",
    "DROP",
    "CLASSIFICATIONS",
    "Block",
    "Extraction",
    "Classification",
    "Projection",
    "TriageRun",
    "extract_blocks",
    "build_reference_graph",
    "build_triage_prompt",
    "parse_triage_response",
    "project_size",
    "flag_referenced_archives",
    "render_report",
    "run_triage",
    "main",
]
