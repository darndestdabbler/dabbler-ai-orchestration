"""Per-lesson metadata for the guidance-lifecycle scheme (Set 064, D2).

What this is
------------

`lessons-learned.md` (and its `lessons-archive.md` sibling) carry a
**per-lesson metadata trailer** so the steady-state lifecycle (Set 064)
can track usage, supersession, and archival on a per-entry basis without
a database. The trailer is an **HTML comment** placed immediately under
each `##` lesson heading, so it is invisible in rendered markdown,
grep-able from the shell, and human-editable:

    ## Persist Routed Output To Disk Before Display Or Logging
    <!-- lesson: id="L-064-3" added-set="030" scope="portable" -->

    - **Context:** ...

Design locks (Set 064 S1 audit, D2)
-----------------------------------

- **Serialization:** one HTML-comment line, the literal token ``lesson:``
  then ``key="value"`` pairs, double-quoted values, a fixed canonical
  field order, **omit-empty** (a field with no value is left out, not
  written as ``key=""``).
- **Fields:** ``id``, ``added-set``, ``status``
  (``active|archived|promoted``), ``superseded-by``, ``encoded-in``,
  ``scope`` (``portable|repo-specific``). ``superseded-by`` and
  ``encoded-in`` are multi-value (comma-separated inside the quotes).
  Usage (``last-used-set``) was **retired in Set 121 S2** — it lives in
  the guidance usage ledger now, not in a preload document.
- **ID governance:** ``id = L-<set>-<seq>`` (e.g. ``L-064-1``), minted
  once and **permanent across heading renames**. On a merge the survivor
  keeps its id; absorbed entries get ``status="archived"`` +
  ``superseded-by="<survivor>"``. IDs are never regenerated casually.

This module is pure parsing/formatting + validation.

**Set 121 S2 — usage metadata left this scheme.** The trailer used to
carry ``last-used-set``, and :mod:`ai_router.cite_lessons` performed a
surgical in-place rewrite of it at every close. That bookkeeping lived
*inside* a preload document, so every session paid to read the
accounting that decides what to prune, and the close-mandated rewrite of
a just-verified file needed its own freshness normalizer to stop the
close backstop buying a metered round for a metadata trailer. Usage now
lives in :mod:`ai_router.guidance_ledger` — a sidecar JSON read only at
prune time — and the trailer is back to being pure identity and
classification. The active tier keeps only what a human or orchestrator
must be able to cite: the ``id``.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

# --- field model -------------------------------------------------------------

# Canonical serialization order. Single-value fields plus the two
# multi-value fields (superseded-by, encoded-in). ``id`` is always
# emitted; the rest are omit-empty.
SINGLE_FIELDS = ("id", "added-set", "status", "scope")
MULTI_FIELDS = ("superseded-by", "encoded-in")
CANONICAL_ORDER = (
    "id",
    "added-set",
    "status",
    "superseded-by",
    "encoded-in",
    "scope",
)

STATUS_VALUES = ("active", "archived", "promoted")
SCOPE_VALUES = ("portable", "repo-specific")

# Retired by Set 121 S2. Kept as a named constant so a stale trailer is
# reported as retired rather than as a generic "unknown key", and so the
# one place that knows the field is gone is this module.
RETIRED_FIELDS = ("last-used-set",)

# id = a guidance-entry handle. ``L-<set>-<seq>`` is the lesson form
# (e.g. L-064-1, L-007-12); Set 121 S2 widened it because the ledger and
# the corpus scan are deliberately **agnostic about which document an
# entry lives in**, and ``project-guidance.md`` is the sink lessons are
# promoted into. Its entries take a two-segment form (``C-003``,
# ``G-001``) and a shipped check takes ``K-<set>-<seq>``. Still tight
# enough that a bare word or a sentence is malformed.
ID_RE = re.compile(r"^[A-Za-z]{1,4}-[A-Za-z0-9]+(?:-\d+)?$")

# A trailer line: optional leading whitespace, then <!-- lesson: ... -->.
_TRAILER_RE = re.compile(r"^\s*<!--\s*lesson:\s*(?P<body>.*?)\s*-->\s*$")
# key="value" pairs inside the trailer body. Values never contain a
# double quote (the scheme forbids it); everything else is allowed.
_PAIR_RE = re.compile(r'(?P<key>[A-Za-z0-9_-]+)="(?P<val>[^"]*)"')

# A level-2 markdown heading (the lesson boundary in these files).
_H2_RE = re.compile(r"^##\s+(?P<title>.+?)\s*$")


@dataclass
class LessonMeta:
    """Parsed contents of one lesson metadata trailer.

    Multi-value fields are tuples of stripped, non-empty tokens. Empty
    string / empty tuple means "field absent" and is omitted on format.
    """

    id: str = ""
    added_set: str = ""
    status: str = "active"
    superseded_by: Tuple[str, ...] = ()
    encoded_in: Tuple[str, ...] = ()
    scope: str = ""


def _split_multi(value: str) -> Tuple[str, ...]:
    return tuple(tok.strip() for tok in value.split(",") if tok.strip())


def parse_trailer(line: str) -> Optional[LessonMeta]:
    """Parse a single trailer line into a :class:`LessonMeta`, or ``None``.

    Returns ``None`` when *line* is not a ``<!-- lesson: ... -->`` trailer
    at all. A trailer with unknown keys still parses (unknown keys are
    ignored here and flagged by :func:`validate_meta`), so the parser is
    lenient and the validator is the gatekeeper. A bare
    ``<!-- lesson: id="L-079-1" -->`` — the Set 121 S2 minimal marker —
    parses to an active lesson with no bookkeeping, which is the whole
    point: identity in the document, accounting in the ledger.
    """
    m = _TRAILER_RE.match(line)
    if m is None:
        return None
    pairs = {pm.group("key"): pm.group("val") for pm in _PAIR_RE.finditer(m.group("body"))}
    return LessonMeta(
        id=pairs.get("id", "").strip(),
        added_set=pairs.get("added-set", "").strip(),
        status=pairs.get("status", "active").strip() or "active",
        superseded_by=_split_multi(pairs.get("superseded-by", "")),
        encoded_in=_split_multi(pairs.get("encoded-in", "")),
        scope=pairs.get("scope", "").strip(),
    )


def format_trailer(meta: LessonMeta) -> str:
    """Serialize *meta* into the canonical one-line trailer.

    Field order is fixed; ``id`` is always present; every other field is
    omitted when empty. ``status`` is omitted when it is the default
    ``active``, because the active tier is where active lessons live and
    restating it costs preload tokens to say nothing. The result
    round-trips through :func:`parse_trailer` to an equal
    :class:`LessonMeta`.
    """
    parts: List[str] = []
    status = meta.status or "active"
    values = {
        "id": meta.id,
        "added-set": meta.added_set,
        "status": "" if status == "active" else status,
        "superseded-by": ",".join(meta.superseded_by),
        "encoded-in": ",".join(meta.encoded_in),
        "scope": meta.scope,
    }
    always = {"id"}
    for key in CANONICAL_ORDER:
        val = values[key]
        if val == "" and key not in always:
            continue
        parts.append(f'{key}="{val}"')
    return "<!-- lesson: " + " ".join(parts) + " -->"


# --- document model ----------------------------------------------------------


@dataclass
class LessonEntry:
    """One ``##`` lesson in a guidance file, with its trailer (if any).

    ``heading_line`` / ``trailer_line`` are 0-based indices into the
    document's line list. ``trailer_line`` is ``None`` when the lesson has
    no metadata trailer yet (an un-migrated legacy lesson). ``meta`` is
    ``None`` in the same case.
    """

    title: str
    heading_line: int
    trailer_line: Optional[int]
    meta: Optional[LessonMeta]

    @property
    def lesson_id(self) -> str:
        return self.meta.id if self.meta else ""


def parse_document(text: str) -> List[LessonEntry]:
    """Return one :class:`LessonEntry` per ``##`` heading in *text*.

    A trailer is associated with a heading when it is the first non-blank
    line after the heading (blank lines between heading and trailer are
    tolerated). Any other content before a trailer means the lesson has no
    trailer. Only ``##`` (level-2) headings are lesson boundaries; deeper
    headings inside a lesson body are ignored.
    """
    lines = text.split("\n")
    entries: List[LessonEntry] = []
    for i, line in enumerate(lines):
        hm = _H2_RE.match(line)
        if hm is None:
            continue
        trailer_line: Optional[int] = None
        meta: Optional[LessonMeta] = None
        j = i + 1
        while j < len(lines):
            if lines[j].strip() == "":
                j += 1
                continue
            candidate = parse_trailer(lines[j])
            if candidate is not None:
                trailer_line = j
                meta = candidate
            break
        entries.append(
            LessonEntry(
                title=hm.group("title"),
                heading_line=i,
                trailer_line=trailer_line,
                meta=meta,
            )
        )
    return entries


def find_entry(text: str, lesson_id: str) -> Optional[LessonEntry]:
    """Return the entry whose trailer ``id`` equals *lesson_id*, or ``None``."""
    for entry in parse_document(text):
        if entry.meta is not None and entry.meta.id == lesson_id:
            return entry
    return None


def scan_entries(text: str) -> List[Tuple[int, LessonMeta]]:
    """Every marker in *text* as ``(0-based line index, meta)``.

    The validation counterpart to :func:`scan_ids`, and the reason
    :func:`validate_documents` no longer walks :func:`parse_document`: a
    heading-bound walk validates **zero** markers in a document whose
    entries are bullets under level-3 sections, and reports success for
    having checked nothing.
    """
    out: List[Tuple[int, LessonMeta]] = []
    for index, line in enumerate(text.split("\n")):
        meta = parse_trailer(line[:-1] if line.endswith("\r") else line)
        if meta is not None:
            out.append((index, meta))
    return out


def scan_ids(text: str) -> List[str]:
    """Every marker id in *text*, in order, regardless of heading structure.

    :func:`parse_document` associates a trailer with the ``##`` heading
    above it, which is right for ``lessons-learned.md`` — one lesson, one
    level-2 heading. It is wrong for ``project-guidance.md``, whose
    entries are bullets under level-3 sections: a heading-bound scan
    there returns **zero** ids while looking like it worked, and a corpus
    gate that silently examines nothing is indistinguishable from one
    that found nothing (L-112-1).

    So the corpus scan is structural about the marker, not about the
    document around it, which is what lets one mechanism serve both files
    and whatever a consumer repo shapes its guidance like.
    """
    out: List[str] = []
    for line in text.split("\n"):
        meta = parse_trailer(line[:-1] if line.endswith("\r") else line)
        if meta is not None and meta.id:
            out.append(meta.id)
    return out


def contains_id(text: str, entry_id: str) -> bool:
    """True when *entry_id* has a marker anywhere in *text*."""
    return entry_id in scan_ids(text)


def update_last_used(*_args: object, **_kwargs: object) -> None:
    """Retired in Set 121 S2. Usage is recorded in the guidance ledger.

    Kept as a loud stub rather than deleted outright: a consumer repo
    pinned to an older ``dabbler-ai-router`` may still call this, and a
    silent no-op would drop its usage signal on the floor while looking
    like it worked. Raising names the replacement.
    """
    raise NotImplementedError(
        "guidance_meta.update_last_used was retired in Set 121 S2. Usage "
        "metadata no longer lives in the preload documents; record it with "
        "ai_router.guidance_ledger.record_citation() (or the cite_lessons "
        "CLI, which now writes docs/planning/guidance-usage.json)."
    )


# --- validation --------------------------------------------------------------

_KNOWN_KEYS = set(SINGLE_FIELDS) | set(MULTI_FIELDS)


def validate_meta(meta: LessonMeta) -> List[str]:
    """Return a list of error strings for one :class:`LessonMeta` (empty = ok).

    Errors (hard): missing/malformed ``id``; ``status`` not in
    :data:`STATUS_VALUES`; ``scope`` set but not in :data:`SCOPE_VALUES`;
    an ``archived`` lesson with no ``superseded-by``/``encoded-in`` and no
    other archive justification is *not* an error here (archival rationale
    is operator-reviewed, D5). A recommended-but-missing ``added-set`` is
    a **warning**, returned by :func:`meta_warnings`, not an error —
    legacy lessons predate the scheme.
    """
    errors: List[str] = []
    if not meta.id:
        errors.append("missing required field: id")
    elif not ID_RE.match(meta.id):
        errors.append(
            f'id {meta.id!r} is malformed (expected L-<set>-<seq> for a '
            'lesson, e.g. "L-064-1", or a short handle such as "C-003")'
        )
    if meta.status not in STATUS_VALUES:
        allowed = ", ".join(STATUS_VALUES)
        errors.append(f"status {meta.status!r} not in: {allowed}")
    if meta.scope and meta.scope not in SCOPE_VALUES:
        allowed = ", ".join(SCOPE_VALUES)
        errors.append(f"scope {meta.scope!r} not in: {allowed}")
    return errors


def meta_warnings(meta: LessonMeta) -> List[str]:
    """Return non-fatal warnings for one :class:`LessonMeta`."""
    warns: List[str] = []
    if meta.status == "active":
        if not meta.added_set:
            warns.append(f"{meta.id or '(no id)'}: active lesson missing added-set")
    return warns


@dataclass
class DocValidation:
    """Aggregate validation outcome for one or more guidance documents."""

    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    ids: Tuple[str, ...] = ()

    @property
    def ok(self) -> bool:
        return not self.errors


def validate_documents(docs: List[Tuple[str, str]]) -> DocValidation:
    """Validate every marker across *docs* and enforce id uniqueness.

    *docs* is a list of ``(label, text)`` pairs (label is a filename used
    in messages). Rules:

    - every marker must pass :func:`validate_meta`;
    - a malformed marker line (parses as a lesson comment but yields no
      id) is reported;
    - each ``id`` must be unique across **all** documents (the active
      tier, the archive and ``project-guidance.md`` share one id
      namespace, D2 lock).

    Set 121 S2: this walks :func:`scan_entries`, not
    :func:`parse_document`. The heading-bound walk validated only markers
    sitting under a ``##`` heading, which is every lesson but **no**
    entry in ``project-guidance.md`` — whose entries are bullets under
    level-3 sections. The gate would have reported success for the very
    file the next session is admitting ids into, having checked none of
    them.
    """
    result = DocValidation()
    seen: dict = {}
    all_ids: List[str] = []
    for label, text in docs:
        lines = text.split("\n")
        for line_index, meta in scan_entries(text):
            line_ref = f"{label}:{line_index + 1}"
            for err in validate_meta(meta):
                result.errors.append(f"{line_ref}: {err}")
            result.warnings.extend(
                f"{line_ref}: {w}" for w in meta_warnings(meta)
            )
            lid = meta.id
            if lid:
                if lid in seen:
                    result.errors.append(
                        f"{line_ref}: duplicate id {lid!r} (also at {seen[lid]})"
                    )
                else:
                    seen[lid] = line_ref
                    all_ids.append(lid)
            # Surface unknown keys as a warning (lenient parser, strict report).
            raw = lines[line_index]
            for pm in _PAIR_RE.finditer(raw):
                key = pm.group("key")
                if key in RETIRED_FIELDS:
                    result.warnings.append(
                        f"{line_ref}: trailer key {key!r} was retired in Set "
                        "121 S2; usage lives in the guidance ledger "
                        "(docs/planning/guidance-usage.json). The value here "
                        "is stale and nothing writes it"
                    )
                elif key not in _KNOWN_KEYS:
                    result.warnings.append(
                        f"{line_ref}: unknown trailer key {key!r}"
                    )
    result.ids = tuple(all_ids)
    return result


__all__ = [
    "SINGLE_FIELDS",
    "MULTI_FIELDS",
    "CANONICAL_ORDER",
    "STATUS_VALUES",
    "SCOPE_VALUES",
    "RETIRED_FIELDS",
    "ID_RE",
    "LessonMeta",
    "LessonEntry",
    "DocValidation",
    "parse_trailer",
    "format_trailer",
    "parse_document",
    "find_entry",
    "scan_entries",
    "scan_ids",
    "contains_id",
    "update_last_used",
    "validate_meta",
    "meta_warnings",
    "validate_documents",
]
