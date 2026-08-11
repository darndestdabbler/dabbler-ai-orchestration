"""Step-status drift: the inventory command and the scoped migration.

Set 120 S1 made :meth:`ai_router.session_log.SessionLog.log_step` fail
closed on any token outside the vocabulary (``pending`` /
``in-progress`` / ``complete`` / ``blocked``). That stops *new* drift; it
does nothing about the entries already on disk, roughly 10% of which
carry a token no reader recognises. This module is Session 2: it
measures what is there, and executes the operator's ruling about it.

The two populations
-------------------

The drift is not one thing, and the ruling (operator, 2026-08-11,
recorded in ``docs/session-sets/120-strict-writer-and-one-projection/spec.md``
-> Session 2) treats the halves in opposite ways:

**Lossless synonyms** --- ``completed`` and ``done``. These are spelling
variants of ``complete`` inside a machine enum. Rewriting one is not
rewriting history: every reader that mis-renders ``completed`` is
mis-rendering a step that genuinely completed. They are **normalised**.

**Semantically loaded** --- an absent status, ``skipped``,
``complete-with-known-failures``, and the prose/JSON blobs someone wrote
into the status field. Normalising these would launder meaning:
``complete-with-known-failures`` is *not* ``complete``. They are **left
exactly as they are**, and Session 3's projection will render them as an
explicit ``unknown``, which is true.

Why the rewrite is byte-surgical
--------------------------------

The obvious implementation --- parse, mutate, ``json.dump`` --- is
wrong here, and measurably so. These files were written by several
tools over a year: 108 of 109 use CRLF, 39 end with a trailing newline
and 69 do not, and Set 028's log was written with
``ensure_ascii=False`` so it carries a literal ``->`` arrow that a
default re-serialize would escape to ``\\u2192``. A whole-file
re-serialize would therefore rewrite bytes in files it was asked not to
touch, and the ruling's own acceptance condition --- that the loaded
entries come out byte-identical --- could not be checked, because
everything would have moved.

So this module locates each ``"status": <string>`` member as a **span of
raw text** (:func:`scan_status_members`), cross-checks that the spans it
found correspond one-for-one with the entries the JSON parser sees, and
replaces only the spans whose token is a lossless synonym. Every other
byte in the file, including every loaded entry, is carried through
untouched by construction --- and :func:`migrate_text` asserts it rather
than assuming it.

Scope
-----

The default scan root is ``docs/session-sets``, but scope is **not left
to the default**. One further ``activity-log.json`` exists in this repo,
under ``tools/dabbler-ai-orchestration/test-fixtures/uat-matrix/``, and
it is out of scope: it is a pinned test fixture whose rendered rows
``uatMatrixFixtures.test.ts`` asserts against, not a record of a real
session, and touching it would pull the extension's test surface into a
set that declares ``requiresE2E: false`` and forbids extension changes
(standing decision 3). :data:`EXCLUDED_PATH_SEGMENTS` enforces that
structurally, so ``--scan .`` cannot reach it either; excluded files are
still *reported*, so the exclusion stays a visible decision rather than
an oversight.

The premise check is a precondition, not a companion
----------------------------------------------------

The write path refuses while any premise flag is unadjudicated. The
spec's instruction is "falsify the ruling's premise before acting on
it... if any does, stop and report" --- and a tool that documents that
ordering without enforcing it has not implemented it. Both the per-file
and the whole-scan entry points check, so neither the CLI nor a library
caller can rewrite a step that some other evidence says did not
complete.
"""

from __future__ import annotations

import argparse
import json
import os
import re
from dataclasses import dataclass, field
from typing import Iterable, Iterator, Optional

try:
    from session_log import CANONICAL_STEP_STATUSES, STEP_STATUS_COMPLETE
except ImportError:  # pragma: no cover - package-relative import
    from .session_log import CANONICAL_STEP_STATUSES, STEP_STATUS_COMPLETE


#: The two tokens the operator ruled losslessly renameable, and what they
#: mean. Nothing else is ever rewritten by this module. Keep this mapping
#: closed: widening it is a new operator decision, not a code change.
LOSSLESS_SYNONYMS = {
    "completed": STEP_STATUS_COMPLETE,
    "done": STEP_STATUS_COMPLETE,
}

KIND_CANONICAL = "canonical"
KIND_LOSSLESS = "lossless-synonym"
KIND_LOADED = "loaded"
KIND_ABSENT = "absent"

#: Path segments that mark a tree as **test data rather than a record of
#: a real session**. An activity log under one of these is never
#: inventoried into the drift totals and never migrated, no matter what
#: ``--scan`` says.
#:
#: This is enforced structurally rather than left to the default scan
#: root, because a documented exclusion that only holds while nobody
#: passes ``--scan`` is not an exclusion --- it is a comment. The case
#: that forced it: ``tools/dabbler-ai-orchestration/test-fixtures/
#: uat-matrix/hello-world-full/.../activity-log.json`` carries two
#: ``completed`` tokens and is pinned by ``uatMatrixFixtures.test.ts``,
#: so ``--scan . --migrate --in-place`` would have rewritten an
#: extension test fixture from inside a Python-only history migration.
EXCLUDED_PATH_SEGMENTS = ("test-fixtures",)

#: A status member in the raw text. ``(?<!\\)`` keeps the scan off the
#: escaped ``\"status\"`` that would appear if someone quoted an entry
#: inside a description; the value pattern is a full JSON string, so a
#: prose blob with escapes and newlines is matched whole.
_STATUS_MEMBER_RE = re.compile(
    r'(?<!\\)"status"(\s*):(\s*)("(?:[^"\\]|\\.)*")',
    re.DOTALL,
)

SIGNAL_SESSION_NOT_COMPLETE = "session-not-complete"
SIGNAL_SUPERSEDED = "superseded-by-non-terminal"
SIGNAL_DESCRIPTION = "description-language"

#: Phrases in a step's own description that assert the STEP did not
#: finish. Deliberately phrase-level, not word-level: Set 120 S2 first
#: ran this with bare ``failed`` / ``failure`` / ``blocked`` / ``deferred``
#: in the list and read all 38 hits, every one of which was incidental
#: text --- ``0 failed`` in a suite count, ``test_failure_injection.py``
#: in a file list, ``deferred to Set 062`` as a scope note. A check that
#: cries wolf 38 times is a check nobody reads the 39th time, so the
#: word-level net was run once, read in full, and then narrowed to the
#: phrases that could only be talking about this step's own outcome.
_NEGATIVE_MARKERS = (
    "did not complete",
    "not completed",
    "could not complete",
    "unable to complete",
    "left incomplete",
    "remains incomplete",
    "is incomplete",
    "unfinished",
    "not finished",
    "abandoned",
    "aborted",
    "gave up",
    "stopped short",
    "cut short",
    "ran out of budget",
    "out of budget",
    "partially complete",
    "partially done",
    "only partially",
    "still failing",
    "left failing",
    "remains failing",
    "blocked on",
    "blocked by",
)

_STATUS_ECHO_LIMIT = 60


def classify_status(entry: dict) -> tuple[str, str]:
    """Return ``(kind, display_token)`` for one activity-log *entry*.

    ``display_token`` is safe to print: a prose blob or a non-string is
    summarised rather than echoed, so an inventory of 2,800 entries does
    not bury its own totals under a 1,500-character status field.
    """
    if "status" not in entry:
        return KIND_ABSENT, "<absent>"
    value = entry["status"]
    if not isinstance(value, str):
        return KIND_LOADED, f"<{type(value).__name__}>"
    if value in CANONICAL_STEP_STATUSES:
        return KIND_CANONICAL, value
    if value in LOSSLESS_SYNONYMS:
        return KIND_LOSSLESS, value
    if len(value) > _STATUS_ECHO_LIMIT or "\n" in value:
        return KIND_LOADED, f"<prose:{len(value)}>"
    return KIND_LOADED, value


@dataclass(frozen=True)
class Occurrence:
    """One entry's status, located both logically and in the raw text."""

    path: str
    set_slug: str
    entry_index: int
    session_number: object
    step_number: object
    step_key: str
    kind: str
    token: str
    #: ``None`` for an absent status: there is no span to point at.
    span: Optional[tuple[int, int]] = None

    @property
    def is_drift(self) -> bool:
        return self.kind != KIND_CANONICAL


@dataclass
class FileInventory:
    path: str
    set_slug: str
    entry_count: int = 0
    occurrences: list[Occurrence] = field(default_factory=list)
    #: Set when the raw scan and the parsed entries disagree, or the file
    #: cannot be read/parsed at all. A file with a problem is NEVER
    #: migrated --- an inventory that cannot explain a file has no
    #: business rewriting it.
    problem: Optional[str] = None
    #: Test data, not a record of a real session. Reported, never
    #: migrated. See :data:`EXCLUDED_PATH_SEGMENTS`.
    excluded: bool = False

    @property
    def drift(self) -> list[Occurrence]:
        return [o for o in self.occurrences if o.is_drift]

    @property
    def lossless(self) -> list[Occurrence]:
        return [o for o in self.occurrences if o.kind == KIND_LOSSLESS]

    @property
    def loaded(self) -> list[Occurrence]:
        return [o for o in self.occurrences if o.kind in (KIND_LOADED, KIND_ABSENT)]


@dataclass
class Inventory:
    files: list[FileInventory] = field(default_factory=list)

    @property
    def counted_files(self) -> list[FileInventory]:
        """Files whose entries count toward the drift totals: everything
        that is a record of a real session."""
        return [f for f in self.files if not f.excluded]

    @property
    def excluded_files(self) -> list[FileInventory]:
        return [f for f in self.files if f.excluded]

    @property
    def drifted_files(self) -> list[FileInventory]:
        return [f for f in self.counted_files if f.drift]

    @property
    def entry_count(self) -> int:
        return sum(f.entry_count for f in self.counted_files)

    @property
    def occurrences(self) -> list[Occurrence]:
        return [o for f in self.counted_files for o in f.occurrences]

    def token_counts(self) -> dict[str, int]:
        counts: dict[str, int] = {}
        for occ in self.occurrences:
            counts[occ.token] = counts.get(occ.token, 0) + 1
        return dict(sorted(counts.items(), key=lambda kv: (-kv[1], kv[0])))

    def population_counts(self) -> dict[str, int]:
        counts = {KIND_CANONICAL: 0, KIND_LOSSLESS: 0, KIND_LOADED: 0, KIND_ABSENT: 0}
        for occ in self.occurrences:
            counts[occ.kind] += 1
        return counts

    @property
    def problems(self) -> list[FileInventory]:
        return [f for f in self.counted_files if f.problem]


# ---------------------------------------------------------------------------
# Raw-text scanning.
# ---------------------------------------------------------------------------


def scan_status_members(text: str) -> list[tuple[int, int, object]]:
    """Every ``"status": <json-string>`` member in *text*, in file order.

    Returns ``(start, end, decoded_value)`` triples where the span covers
    the whole member --- key, colon, and value --- so a replacement can
    rebuild it while preserving the original inter-token whitespace.
    """
    found: list[tuple[int, int, object]] = []
    for match in _STATUS_MEMBER_RE.finditer(text):
        try:
            value = json.loads(match.group(3))
        except ValueError:  # pragma: no cover - the group is a JSON string
            continue
        found.append((match.start(), match.end(), value))
    return found


def _rebuild_member(text: str, span: tuple[int, int], new_value: str) -> str:
    match = _STATUS_MEMBER_RE.match(text, span[0])
    assert match is not None and match.end() == span[1]
    return f'"status"{match.group(1)}:{match.group(2)}{json.dumps(new_value)}'


# ---------------------------------------------------------------------------
# Inventory.
# ---------------------------------------------------------------------------


def _set_slug(path: str) -> str:
    return os.path.basename(os.path.dirname(os.path.abspath(path)))


def is_excluded_path(path: str) -> bool:
    """True when *path* lies under a tree that is test data rather than a
    record of a real session.

    Checked on path **segments**, not a substring, so a legitimate set
    slug that merely contains the word cannot be swept up by accident.
    """
    parts = os.path.abspath(path).replace("\\", "/").split("/")
    return any(segment in parts for segment in EXCLUDED_PATH_SEGMENTS)


def read_file_inventory(path: str) -> FileInventory:
    """Inventory one ``activity-log.json``.

    The raw spans and the parsed entries are cross-checked: the Nth
    string-valued status the text scan found must be the Nth
    string-valued status the parser sees, and the totals must agree. A
    disagreement means the scan does not understand the file, which is
    recorded as a ``problem`` and disqualifies the file from migration.
    """
    inv = FileInventory(path=path, set_slug=_set_slug(path))
    inv.excluded = is_excluded_path(path)
    try:
        raw = open(path, "rb").read().decode("utf-8")
    except (OSError, UnicodeDecodeError) as exc:
        inv.problem = f"unreadable: {exc}"
        return inv
    try:
        data = json.loads(raw)
    except ValueError as exc:
        inv.problem = f"unparseable: {exc}"
        return inv
    entries = data.get("entries") if isinstance(data, dict) else None
    if not isinstance(entries, list):
        inv.problem = "no entries[] array"
        return inv

    inv.entry_count = len(entries)
    spans = scan_status_members(raw)
    string_statuses = [
        (i, e) for i, e in enumerate(entries)
        if isinstance(e, dict) and isinstance(e.get("status"), str)
    ]
    if len(spans) != len(string_statuses):
        inv.problem = (
            f"raw scan found {len(spans)} status member(s) but the parser "
            f"sees {len(string_statuses)} string-valued status field(s); "
            "refusing to rewrite a file the scan does not explain"
        )
        return inv

    spans_by_entry: dict[int, tuple[int, int]] = {}
    for (start, end, value), (index, entry) in zip(spans, string_statuses):
        if value != entry["status"]:
            inv.problem = (
                f"raw scan and parser disagree at entry {index}: scan read "
                f"{value!r:.40}, parser read {entry['status']!r:.40}"
            )
            return inv
        spans_by_entry[index] = (start, end)

    for index, entry in enumerate(entries):
        if not isinstance(entry, dict):
            inv.problem = f"entry {index} is not an object"
            return inv
        kind, token = classify_status(entry)
        inv.occurrences.append(
            Occurrence(
                path=path,
                set_slug=inv.set_slug,
                entry_index=index,
                session_number=entry.get("sessionNumber"),
                step_number=entry.get("stepNumber"),
                step_key=str(entry.get("stepKey", "")),
                kind=kind,
                token=token,
                span=spans_by_entry.get(index),
            )
        )
    return inv


def discover_activity_logs(scan_root: str) -> list[str]:
    """Every ``activity-log.json`` under *scan_root*, sorted."""
    found: list[str] = []
    for dirpath, dirnames, filenames in os.walk(scan_root):
        dirnames[:] = [
            d for d in dirnames if d not in (".git", "node_modules", ".venv")
        ]
        if "activity-log.json" in filenames:
            found.append(os.path.join(dirpath, "activity-log.json"))
    return sorted(found)


def inventory(scan_root: str, *, only: Iterable[str] = ()) -> Inventory:
    """Inventory every activity log under *scan_root*."""
    wanted = set(only)
    inv = Inventory()
    for path in discover_activity_logs(scan_root):
        if wanted and _set_slug(path) not in wanted:
            continue
        inv.files.append(read_file_inventory(path))
    return inv


# ---------------------------------------------------------------------------
# The premise check (spec Session 2, step 3).
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class PremiseFlag:
    occurrence: Occurrence
    signal: str
    reason: str
    excerpt: str

    @property
    def adjudication(self) -> Optional[str]:
        return _ADJUDICATED.get(
            (self.occurrence.set_slug, self.occurrence.session_number,
             self.occurrence.step_key, self.signal)
        )


#: Flags read and settled during Set 120 S2, with why. A check that stays
#: permanently red is a check nobody reads, so a flag that has been read
#: is recorded here rather than left to fire forever --- and an
#: occurrence that is NOT in this table still exits non-zero, which is
#: the whole point: the day a new counter-example appears, the command
#: says so instead of blending into a familiar red.
_ADJUDICATED = {
    ("061-explorer-ux-polish", 4, "session-004/deferral-close", SIGNAL_DESCRIPTION): (
        "Read 2026-08-11 (Set 120 S2). The phrase 'cut short' describes "
        "the SET, not this step: the operator deferred Set 061's UAT and "
        "0.30.0 release into Set 062, and this step's own job -- record "
        "the deferral and write change-log.md -- was done. The session "
        "closed complete with a VERIFIED cross-provider verdict. "
        "'completed' here means 'complete'."
    ),
}


#: A step status that says the step is still open. Used by the
#: superseded-by check below.
_NON_TERMINAL = ("pending", "in-progress", "blocked")


def _session_statuses(activity_log_path: str) -> dict:
    """``{session_number: status}`` from the set's ``session-state.json``.

    Returns ``{}`` when there is no readable state file --- absence is
    not evidence of anything, and the other two signals still apply.
    """
    set_dir = os.path.dirname(activity_log_path)
    state_path = os.path.join(set_dir, "session-state.json")
    try:
        state = json.load(open(state_path, encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    try:
        from progress import normalize_to_v4_shape  # type: ignore[import-not-found]
    except ImportError:
        from .progress import normalize_to_v4_shape  # type: ignore[no-redef]
    from pathlib import Path

    try:
        view = normalize_to_v4_shape(state, Path(set_dir) / "spec.md")
    except Exception:  # pragma: no cover - a broken state file is not our bug
        return {}
    statuses = {}
    for session in view.get("sessions") or []:
        if isinstance(session, dict) and "number" in session:
            statuses[session["number"]] = session.get("status")
    return statuses


def check_premise(scan_root: str, *, only: Iterable[str] = ()) -> list[PremiseFlag]:
    """Falsify the ruling's premise: that ``completed`` and ``done`` are
    *pure* synonyms for ``complete`` wherever they appear.

    Looks for the counter-example --- an occurrence sitting on a step
    that some other evidence shows did not actually complete --- through
    three independent signals:

    ``session-not-complete``
        The owning session is not recorded complete in the set's
        ``session-state.json``. A step claiming completion inside a
        session that never closed is the strongest available structural
        contradiction.

    ``superseded-by-non-terminal``
        The same session's same step is logged **again later** as
        ``pending`` / ``in-progress`` / ``blocked``. The later entry is
        the set's own statement that the earlier "completed" did not
        hold.

    ``description-language``
        The step's own description asserts it did not finish.

    This **flags for reading**; it never decides, and it never excludes
    an entry from migration on its own. A flag is a reason to stop and
    report, per the spec: the operator ruled on a lossless rename, not
    on a judgement call about outcomes.
    """
    flags: list[PremiseFlag] = []
    for file_inv in inventory(scan_root, only=only).counted_files:
        if file_inv.problem:
            continue
        try:
            entries = json.load(open(file_inv.path, encoding="utf-8"))["entries"]
        except (OSError, ValueError, KeyError, TypeError):  # pragma: no cover
            continue
        if not file_inv.lossless:
            continue
        session_statuses = _session_statuses(file_inv.path)

        later_non_terminal: dict[tuple, list[int]] = {}
        for index, entry in enumerate(entries):
            if entry.get("status") in _NON_TERMINAL:
                key = (entry.get("sessionNumber"), entry.get("stepKey"))
                later_non_terminal.setdefault(key, []).append(index)

        for occ in file_inv.lossless:
            description = str(entries[occ.entry_index].get("description", ""))

            session_status = session_statuses.get(occ.session_number)
            if session_statuses and session_status != "complete":
                flags.append(PremiseFlag(
                    occurrence=occ,
                    signal=SIGNAL_SESSION_NOT_COMPLETE,
                    reason=f"session {occ.session_number} status={session_status!r}",
                    excerpt=description[:220],
                ))

            key = (occ.session_number, entries[occ.entry_index].get("stepKey"))
            reopened = [i for i in later_non_terminal.get(key, []) if i > occ.entry_index]
            if reopened:
                flags.append(PremiseFlag(
                    occurrence=occ,
                    signal=SIGNAL_SUPERSEDED,
                    reason=(
                        f"re-logged at entry {reopened[0]} as "
                        f"{entries[reopened[0]].get('status')!r}"
                    ),
                    excerpt=str(entries[reopened[0]].get("description", ""))[:220],
                ))

            lowered = description.lower()
            hits = [m for m in _NEGATIVE_MARKERS if m in lowered]
            if hits:
                first = min(lowered.index(m) for m in hits)
                flags.append(PremiseFlag(
                    occurrence=occ,
                    signal=SIGNAL_DESCRIPTION,
                    reason=", ".join(sorted(hits)),
                    excerpt=description[max(0, first - 90):first + 150],
                ))
    return flags


# ---------------------------------------------------------------------------
# Migration.
# ---------------------------------------------------------------------------


@dataclass
class MigrationResult:
    path: str
    set_slug: str
    rewritten: int = 0
    preserved: int = 0
    changed: bool = False
    written: bool = False
    problem: Optional[str] = None
    excluded: bool = False


def premise_blockers(scan_root: str, *, only: Iterable[str] = ()) -> list[PremiseFlag]:
    """Every premise flag that has **not** been read and settled.

    The migration's precondition. Empty means the ruling's premise
    survived falsification over this scan.
    """
    return [f for f in check_premise(scan_root, only=only) if f.adjudication is None]


def _premise_refusal(flags: list[PremiseFlag]) -> str:
    listing = "; ".join(
        f"{f.occurrence.set_slug} session {f.occurrence.session_number} "
        f"step {f.occurrence.step_number} [{f.signal}]"
        for f in flags[:5]
    )
    more = f" (+{len(flags) - 5} more)" if len(flags) > 5 else ""
    return (
        f"refused: {len(flags)} unadjudicated premise flag(s) -- {listing}{more}. "
        "The ruling authorises a LOSSLESS rename, not a judgement call about "
        "outcomes, so the write path stops rather than laundering a step some "
        "other evidence says did not complete. Run --check-premise, read every "
        "flag, and either correct the record or record the reading before "
        "migrating."
    )


def migrate_text(raw: str, file_inv: FileInventory) -> tuple[str, int]:
    """Return ``(new_text, rewritten_count)`` for one file's raw text.

    Replaces only the spans of lossless synonyms, right to left so
    earlier offsets stay valid. Then **proves** the result rather than
    trusting it:

    1. Every byte outside the replaced spans is unchanged --- which is
       what makes "the loaded entries are byte-identical" a checked fact
       and not a hope.
    2. The re-parsed document equals the original with exactly those
       statuses renamed, so nothing else in the JSON moved.

    Either check failing raises ``AssertionError``: a migration that
    cannot prove its own restraint must not reach disk.
    """
    targets = [o for o in file_inv.lossless if o.span is not None]
    if not targets:
        return raw, 0

    new_text = raw
    for occ in sorted(targets, key=lambda o: o.span[0], reverse=True):
        start, end = occ.span
        replacement = _rebuild_member(raw, occ.span, LOSSLESS_SYNONYMS[occ.token])
        new_text = new_text[:start] + replacement + new_text[end:]

    _assert_only_spans_changed(raw, new_text, targets)
    _assert_only_statuses_renamed(raw, new_text, targets)
    return new_text, len(targets)


def _assert_only_spans_changed(raw: str, new_text: str, targets: list[Occurrence]) -> None:
    """Byte-level restraint: strip the replaced spans out of both texts
    and what remains must be identical."""
    ordered = sorted(targets, key=lambda o: o.span[0])
    kept_before: list[str] = []
    kept_after: list[str] = []
    cursor_before = 0
    cursor_after = 0
    delta = 0
    for occ in ordered:
        start, end = occ.span
        replacement = _rebuild_member(raw, occ.span, LOSSLESS_SYNONYMS[occ.token])
        kept_before.append(raw[cursor_before:start])
        kept_after.append(new_text[cursor_after:start + delta])
        cursor_before = end
        cursor_after = start + delta + len(replacement)
        delta += len(replacement) - (end - start)
    kept_before.append(raw[cursor_before:])
    kept_after.append(new_text[cursor_after:])
    assert kept_before == kept_after, (
        "migration changed bytes outside the status members it was asked "
        "to rewrite"
    )


def _assert_only_statuses_renamed(raw: str, new_text: str, targets: list[Occurrence]) -> None:
    """Semantic restraint: the new document must equal the old one with
    exactly the targeted statuses renamed, and nothing else."""
    before = json.loads(raw)
    after = json.loads(new_text)
    expected = json.loads(raw)
    for occ in targets:
        expected["entries"][occ.entry_index]["status"] = LOSSLESS_SYNONYMS[occ.token]
    assert after == expected, "migration changed more than the ruled statuses"
    assert len(after["entries"]) == len(before["entries"])


def migrate_file(
    path: str, *, in_place: bool = False, premise_checked: bool = False
) -> MigrationResult:
    """Normalise the lossless synonyms in one activity log.

    **The premise check is a precondition, not a companion command.**
    The spec's instruction is "falsify the ruling's premise before acting
    on it... if any does, stop and report", and a tool that documents
    that ordering without enforcing it has not implemented it: the next
    caller runs ``--migrate --in-place`` on drifted history and launders
    exactly the outcome the check exists to protect. So this refuses
    unless the premise is clean for its own set. *premise_checked* lets
    :func:`migrate_all` prove it once for the whole scan instead of
    re-deriving it per file; it is not a bypass.

    Idempotent: a file with no lossless synonyms left is not written at
    all, so a second run reports ``rewritten=0`` and touches nothing.
    """
    file_inv = read_file_inventory(path)
    result = MigrationResult(
        path=path, set_slug=file_inv.set_slug, excluded=file_inv.excluded
    )
    if file_inv.excluded:
        result.problem = (
            "excluded: test data, not a record of a real session "
            f"(matched {EXCLUDED_PATH_SEGMENTS!r} in its path)"
        )
        return result
    if file_inv.problem:
        result.problem = file_inv.problem
        return result
    if not premise_checked:
        flags = premise_blockers(os.path.dirname(os.path.abspath(path)))
        if flags:
            result.problem = _premise_refusal(flags)
            return result
    result.preserved = len(file_inv.loaded)
    raw = open(path, "rb").read().decode("utf-8")
    try:
        new_text, rewritten = migrate_text(raw, file_inv)
    except AssertionError as exc:
        result.problem = f"refused: {exc}"
        return result
    result.rewritten = rewritten
    result.changed = rewritten > 0
    if result.changed and in_place:
        with open(path, "wb") as handle:
            handle.write(new_text.encode("utf-8"))
        result.written = True
    return result


def migrate_all(
    scan_root: str, *, in_place: bool = False, only: Iterable[str] = ()
) -> list[MigrationResult]:
    """Migrate every activity log under *scan_root*.

    Fails closed on the scan as a whole: one unadjudicated premise flag
    anywhere refuses the entire run and writes nothing, because the
    ruling was given for a population that was falsified as lossless, and
    a partially-falsified population is not that population.
    """
    wanted = set(only)
    paths = [
        p for p in discover_activity_logs(scan_root)
        if not wanted or _set_slug(p) in wanted
    ]
    flags = premise_blockers(scan_root, only=only)
    if flags:
        refusal = _premise_refusal(flags)
        return [
            MigrationResult(
                path=p,
                set_slug=_set_slug(p),
                problem=refusal,
                excluded=is_excluded_path(p),
            )
            for p in paths
        ]
    return [migrate_file(p, in_place=in_place, premise_checked=True) for p in paths]


# ---------------------------------------------------------------------------
# CLI.
# ---------------------------------------------------------------------------


def _default_scan_root() -> str:
    return "docs/session-sets" if os.path.isdir("docs/session-sets") else "."


def _print_inventory(inv: Inventory, *, verbose: bool) -> None:
    pops = inv.population_counts()
    drift_total = pops[KIND_LOSSLESS] + pops[KIND_LOADED] + pops[KIND_ABSENT]
    print(f"Activity logs scanned : {len(inv.counted_files)}")
    print(f"Step entries          : {inv.entry_count}")
    print(f"Files carrying drift  : {len(inv.drifted_files)}")
    pct = (100.0 * drift_total / inv.entry_count) if inv.entry_count else 0.0
    print(f"Drifted entries       : {drift_total} ({pct:.1f}%)")
    print(f"  lossless synonyms   : {pops[KIND_LOSSLESS]}  (migrated)")
    print(f"  semantically loaded : {pops[KIND_LOADED] + pops[KIND_ABSENT]}  (preserved)")
    print()
    print("Token counts")
    print("------------")
    for token, count in inv.token_counts().items():
        kind = next(o.kind for o in inv.occurrences if o.token == token)
        note = {
            KIND_CANONICAL: "canonical",
            KIND_LOSSLESS: "drift - lossless",
            KIND_LOADED: "drift - loaded",
            KIND_ABSENT: "drift - loaded",
        }[kind]
        print(f"  {token:<34} {count:>5}  {note}")
    if inv.drifted_files:
        print()
        print("Per file")
        print("--------")
        for file_inv in inv.drifted_files:
            tokens: dict[str, int] = {}
            for occ in file_inv.drift:
                tokens[occ.token] = tokens.get(occ.token, 0) + 1
            summary = ", ".join(f"{t}={c}" for t, c in sorted(tokens.items()))
            print(f"  {file_inv.set_slug:<48} {summary}")
            if verbose:
                for occ in file_inv.drift:
                    print(
                        f"      session {occ.session_number} step "
                        f"{occ.step_number} [{occ.step_key}] -> {occ.token}"
                    )
    if inv.excluded_files:
        print()
        print("Excluded -- test data, never counted and never migrated")
        for file_inv in inv.excluded_files:
            drifted = sum(1 for o in file_inv.occurrences if o.is_drift)
            print(
                f"  {file_inv.path.replace(os.sep, '/')} "
                f"({drifted} drifted entr{'y' if drifted == 1 else 'ies'})"
            )
    if inv.problems:
        print()
        print("Files the scan could not explain (never migrated)")
        for file_inv in inv.problems:
            print(f"  {file_inv.path}: {file_inv.problem}")


def _inventory_payload(inv: Inventory) -> dict:
    return {
        "filesScanned": len(inv.counted_files),
        "entryCount": inv.entry_count,
        "driftedFiles": len(inv.drifted_files),
        "excludedFiles": [
            f.path.replace(os.sep, "/") for f in inv.excluded_files
        ],
        "populations": inv.population_counts(),
        "tokenCounts": inv.token_counts(),
        "files": [
            {
                "path": f.path.replace(os.sep, "/"),
                "setSlug": f.set_slug,
                "entryCount": f.entry_count,
                "problem": f.problem,
                "drift": [
                    {
                        "entryIndex": o.entry_index,
                        "sessionNumber": o.session_number,
                        "stepNumber": o.step_number,
                        "stepKey": o.step_key,
                        "kind": o.kind,
                        "token": o.token,
                    }
                    for o in f.drift
                ],
            }
            for f in inv.counted_files
            if f.drift or f.problem
        ],
    }


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="step_status_drift",
        description=(
            "Inventory step-status drift across activity logs, and execute "
            "the Set 120 ruling: normalise the lossless synonyms "
            "('completed', 'done') to 'complete' and leave every "
            "semantically loaded entry untouched."
        ),
    )
    parser.add_argument(
        "--scan",
        default=_default_scan_root(),
        help=(
            "Directory under which to find activity-log.json files. "
            "Default: ./docs/session-sets when present, else '.'."
        ),
    )
    parser.add_argument(
        "--only",
        action="append",
        default=[],
        metavar="SET_SLUG",
        help="Restrict to one or more session-set basenames. Repeatable.",
    )
    parser.add_argument(
        "--check-premise",
        action="store_true",
        help=(
            "Report every 'completed'/'done' step whose own description "
            "argues it did not complete. Exit 2 if any is found: the "
            "ruling covers a lossless rename only."
        ),
    )
    parser.add_argument(
        "--migrate",
        action="store_true",
        help=(
            "Plan the migration (dry run). Combine with --in-place to write. "
            "Refuses while any premise flag is unadjudicated, and never "
            "touches an excluded test-fixture tree whatever --scan says."
        ),
    )
    parser.add_argument(
        "--in-place",
        action="store_true",
        help="With --migrate, write the normalised files.",
    )
    parser.add_argument("--json", action="store_true", help="Machine-readable output.")
    parser.add_argument("--verbose", "-v", action="store_true", help="Per-entry detail.")
    args = parser.parse_args(argv)

    if args.in_place and not args.migrate:
        parser.error("--in-place has no meaning without --migrate")

    if args.check_premise:
        flags = check_premise(args.scan, only=args.only)
        open_flags = [f for f in flags if f.adjudication is None]
        if args.json:
            print(json.dumps(
                [
                    {
                        "path": f.occurrence.path.replace(os.sep, "/"),
                        "setSlug": f.occurrence.set_slug,
                        "sessionNumber": f.occurrence.session_number,
                        "stepNumber": f.occurrence.step_number,
                        "stepKey": f.occurrence.step_key,
                        "token": f.occurrence.token,
                        "signal": f.signal,
                        "reason": f.reason,
                        "excerpt": f.excerpt,
                        "adjudication": f.adjudication,
                    }
                    for f in flags
                ],
                indent=2,
            ))
        else:
            print(
                "Premise: 'completed' and 'done' are pure synonyms for "
                "'complete' wherever they appear."
            )
            print(
                f"Counter-evidence: {len(flags)} flag(s), "
                f"{len(open_flags)} unadjudicated."
            )
            for signal in (
                SIGNAL_SESSION_NOT_COMPLETE,
                SIGNAL_SUPERSEDED,
                SIGNAL_DESCRIPTION,
            ):
                count = sum(1 for f in flags if f.signal == signal)
                print(f"  {signal:<28} {count}")
            for flag in flags:
                occ = flag.occurrence
                print()
                verdict = "SETTLED" if flag.adjudication else "OPEN"
                print(
                    f"  [{verdict}] [{flag.signal}] {occ.set_slug} session "
                    f"{occ.session_number} step {occ.step_number} "
                    f"[{occ.step_key}] -> {occ.token}"
                )
                print(f"    {flag.reason}")
                print(f"    ...{' '.join(flag.excerpt.split())[:200]}...")
                if flag.adjudication:
                    print(f"    settled: {flag.adjudication}")
            if not open_flags:
                print()
                print(
                    "The premise stands: no unadjudicated evidence that any "
                    "'completed'/'done' step failed to complete."
                )
        return 2 if open_flags else 0

    if args.migrate:
        results = migrate_all(args.scan, in_place=args.in_place, only=args.only)
        touched = [r for r in results if r.changed]
        excluded = [r for r in results if r.excluded]
        problems = [r for r in results if r.problem and not r.excluded]
        if args.json:
            print(json.dumps(
                {
                    "inPlace": args.in_place,
                    "filesScanned": len(results) - len(excluded),
                    "filesChanged": len(touched),
                    "filesExcluded": len(excluded),
                    "entriesRewritten": sum(r.rewritten for r in touched),
                    "entriesPreserved": sum(r.preserved for r in results),
                    "results": [
                        {
                            "path": r.path.replace(os.sep, "/"),
                            "setSlug": r.set_slug,
                            "rewritten": r.rewritten,
                            "preserved": r.preserved,
                            "written": r.written,
                            "excluded": r.excluded,
                            "problem": r.problem,
                        }
                        for r in results
                        if r.changed or r.problem or r.preserved
                    ],
                },
                indent=2,
            ))
        else:
            mode = "APPLIED" if args.in_place else "DRY RUN (no writes)"
            print(f"Migration {mode}")
            print(f"  files scanned    : {len(results) - len(excluded)}")
            print(f"  files changed    : {len(touched)}")
            print(f"  entries rewritten: {sum(r.rewritten for r in touched)}")
            print(f"  entries preserved: {sum(r.preserved for r in results)}")
            if excluded:
                print(f"  files excluded   : {len(excluded)} (test data)")
            for r in touched:
                print(f"    {r.set_slug:<48} {r.rewritten} -> 'complete'")
            for r in problems:
                print(f"  PROBLEM {r.set_slug}: {r.problem}")
        return 1 if problems else 0

    inv = inventory(args.scan, only=args.only)
    if args.json:
        print(json.dumps(_inventory_payload(inv), indent=2))
    else:
        _print_inventory(inv, verbose=args.verbose)
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
