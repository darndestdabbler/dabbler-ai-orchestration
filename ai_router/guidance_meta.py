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
    <!-- lesson: id="L-064-3" added-set="030" last-used-set="064" status="active" scope="portable" -->

    - **Context:** ...

Design locks (Set 064 S1 audit, D2)
-----------------------------------

- **Serialization:** one HTML-comment line, the literal token ``lesson:``
  then ``key="value"`` pairs, double-quoted values, a fixed canonical
  field order, **omit-empty** (a field with no value is left out, not
  written as ``key=""``).
- **Fields:** ``id``, ``added-set``, ``last-used-set``, ``status``
  (``active|archived|promoted``), ``superseded-by``, ``encoded-in``,
  ``scope`` (``portable|repo-specific``). ``superseded-by`` and
  ``encoded-in`` are multi-value (comma-separated inside the quotes).
- **ID governance:** ``id = L-<set>-<seq>`` (e.g. ``L-064-1``), minted
  once and **permanent across heading renames**. On a merge the survivor
  keeps its id; absorbed entries get ``status="archived"`` +
  ``superseded-by="<survivor>"``. IDs are never regenerated casually.

This module is pure parsing/formatting + validation. It performs the
**surgical** ``last-used-set`` rewrite the D3 citation path
(:mod:`ai_router.cite_lessons`) depends on: it rewrites only the one
trailer line for a cited id and leaves every other byte of the file
untouched, so a citation lands as a one-line diff that ``git blame``
attributes to the commit that used the lesson.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

# --- field model -------------------------------------------------------------

# Canonical serialization order. Single-value fields plus the two
# multi-value fields (superseded-by, encoded-in). ``id`` and ``status``
# are always emitted; the rest are omit-empty.
SINGLE_FIELDS = ("id", "added-set", "last-used-set", "status", "scope")
MULTI_FIELDS = ("superseded-by", "encoded-in")
CANONICAL_ORDER = (
    "id",
    "added-set",
    "last-used-set",
    "status",
    "superseded-by",
    "encoded-in",
    "scope",
)

STATUS_VALUES = ("active", "archived", "promoted")
SCOPE_VALUES = ("portable", "repo-specific")

# id = L-<set>-<seq>; <set> is alphanumeric (set number, zero-padded, or a
# short legacy token); <seq> is a positive integer. e.g. L-064-1, L-007-12.
ID_RE = re.compile(r"^L-[A-Za-z0-9]+-\d+$")

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
    last_used_set: str = ""
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
    lenient and the validator is the gatekeeper.
    """
    m = _TRAILER_RE.match(line)
    if m is None:
        return None
    pairs = {pm.group("key"): pm.group("val") for pm in _PAIR_RE.finditer(m.group("body"))}
    return LessonMeta(
        id=pairs.get("id", "").strip(),
        added_set=pairs.get("added-set", "").strip(),
        last_used_set=pairs.get("last-used-set", "").strip(),
        status=pairs.get("status", "active").strip() or "active",
        superseded_by=_split_multi(pairs.get("superseded-by", "")),
        encoded_in=_split_multi(pairs.get("encoded-in", "")),
        scope=pairs.get("scope", "").strip(),
    )


def format_trailer(meta: LessonMeta) -> str:
    """Serialize *meta* into the canonical one-line trailer.

    Field order is fixed; ``id`` and ``status`` are always present; every
    other field is omitted when empty. The result round-trips through
    :func:`parse_trailer` to an equal :class:`LessonMeta`.
    """
    parts: List[str] = []
    values = {
        "id": meta.id,
        "added-set": meta.added_set,
        "last-used-set": meta.last_used_set,
        "status": meta.status or "active",
        "superseded-by": ",".join(meta.superseded_by),
        "encoded-in": ",".join(meta.encoded_in),
        "scope": meta.scope,
    }
    always = {"id", "status"}
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


def update_last_used(
    text: str, lesson_id: str, set_label: str
) -> Tuple[Optional[str], Optional[LessonMeta]]:
    """Rewrite *lesson_id*'s ``last-used-set`` to *set_label* in *text*.

    Returns ``(new_text, updated_meta)``. When the id is not present, or
    is present but already records *set_label* as its ``last-used-set``,
    ``new_text`` reflects the (possibly unchanged) document and
    ``updated_meta`` is the entry's meta — except when the id is absent
    entirely, where both elements are ``None``.

    The rewrite is surgical: only the single trailer line changes; line
    endings and every other byte are preserved. A lesson that has a
    heading but **no** trailer yet cannot be cited (there is nowhere to
    record usage); that case returns ``(None, None)`` so the caller can
    warn distinctly from "unknown id".
    """
    # Preserve the document's newline style by splitting on "\n" and
    # rejoining the same way; "\r\n" survives because the "\r" stays on
    # each element.
    lines = text.split("\n")
    for entry in parse_document(text):
        if entry.meta is None or entry.meta.id != lesson_id:
            continue
        if entry.trailer_line is None:
            return None, None
        meta = entry.meta
        new_meta = LessonMeta(
            id=meta.id,
            added_set=meta.added_set,
            last_used_set=set_label,
            status=meta.status,
            superseded_by=meta.superseded_by,
            encoded_in=meta.encoded_in,
            scope=meta.scope,
        )
        # Preserve any trailing "\r" the split left on the line.
        suffix = "\r" if lines[entry.trailer_line].endswith("\r") else ""
        # Preserve leading indentation of the original trailer line.
        original = lines[entry.trailer_line]
        indent = original[: len(original) - len(original.lstrip())]
        lines[entry.trailer_line] = indent + format_trailer(new_meta) + suffix
        return "\n".join(lines), new_meta
    return None, None


# --- validation --------------------------------------------------------------

_KNOWN_KEYS = set(SINGLE_FIELDS) | set(MULTI_FIELDS)


def validate_meta(meta: LessonMeta) -> List[str]:
    """Return a list of error strings for one :class:`LessonMeta` (empty = ok).

    Errors (hard): missing/malformed ``id``; ``status`` not in
    :data:`STATUS_VALUES`; ``scope`` set but not in :data:`SCOPE_VALUES`;
    an ``archived`` lesson with no ``superseded-by``/``encoded-in`` and no
    other archive justification is *not* an error here (archival rationale
    is operator-reviewed, D5). Recommended-but-missing fields
    (``added-set`` / ``last-used-set``) are **warnings**, returned by
    :func:`meta_warnings`, not errors — legacy lessons predate the scheme.
    """
    errors: List[str] = []
    if not meta.id:
        errors.append("missing required field: id")
    elif not ID_RE.match(meta.id):
        errors.append(
            f'id {meta.id!r} is malformed (expected L-<set>-<seq>, e.g. "L-064-1")'
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
    """Validate trailers across *docs* and enforce cross-file id uniqueness.

    *docs* is a list of ``(label, text)`` pairs (label is a filename used
    in messages). Rules:

    - every present trailer must pass :func:`validate_meta`;
    - a malformed trailer line under a ``##`` heading (parses as a comment
      but yields no id) is reported;
    - each ``id`` must be unique across **all** documents (active +
      archive share one id namespace, D2 lock).
    """
    result = DocValidation()
    seen: dict = {}
    all_ids: List[str] = []
    for label, text in docs:
        for entry in parse_document(text):
            if entry.meta is None:
                continue
            line_ref = f"{label}:{(entry.trailer_line or entry.heading_line) + 1}"
            for err in validate_meta(entry.meta):
                result.errors.append(f"{line_ref}: {err}")
            result.warnings.extend(
                f"{line_ref}: {w}" for w in meta_warnings(entry.meta)
            )
            lid = entry.meta.id
            if lid:
                if lid in seen:
                    result.errors.append(
                        f"{line_ref}: duplicate id {lid!r} (also at {seen[lid]})"
                    )
                else:
                    seen[lid] = line_ref
                    all_ids.append(lid)
            # Surface unknown keys as a warning (lenient parser, strict report).
            raw = text.split("\n")[entry.trailer_line] if entry.trailer_line is not None else ""
            for pm in _PAIR_RE.finditer(raw):
                if pm.group("key") not in _KNOWN_KEYS:
                    result.warnings.append(
                        f"{line_ref}: unknown trailer key {pm.group('key')!r}"
                    )
    result.ids = tuple(all_ids)
    return result


__all__ = [
    "SINGLE_FIELDS",
    "MULTI_FIELDS",
    "CANONICAL_ORDER",
    "STATUS_VALUES",
    "SCOPE_VALUES",
    "ID_RE",
    "LessonMeta",
    "LessonEntry",
    "DocValidation",
    "parse_trailer",
    "format_trailer",
    "parse_document",
    "find_entry",
    "update_last_used",
    "validate_meta",
    "meta_warnings",
    "validate_documents",
]
