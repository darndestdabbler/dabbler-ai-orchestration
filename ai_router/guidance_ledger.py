"""The guidance usage ledger — usage accounting that costs zero preload tokens.

Why this module exists (Set 121 S2)
-----------------------------------

Before this, every lesson carried its own bookkeeping *inline* in
``docs/planning/lessons-learned.md`` — a trailer holding ``added-set``,
``last-used-set``, ``status`` and ``scope``. That file is **preload**:
it is read at the start of every session, so the accounting that decides
what to prune was being paid for on every session that never pruned
anything. Measured at the start of Set 121 S2 the trailers cost ~75
tokens against a preload corpus pinned at 99% of its ceiling.

The accounting moves here, to a sidecar JSON read **only at prune time**.
The preload document keeps exactly one thing — the ``id`` — because that
is the handle a human or orchestrator cites; everything else is
machine bookkeeping and belongs in machine state.

What the ledger is
------------------

One compact record per guidance item, keyed by id::

    {
      "schemaVersion": 1,
      "entries": {
        "L-064-9": {"kind": "executable", "cost": "cheap", "uses": []},
        "C-003":   {"kind": "instruction", "uses": ["120-01", "119-03"]}
      }
    }

The executable's ring is empty on purpose: a check's uses are written
only by :func:`record_fire`, never by a citation.

**The ledger is keyed by id and agnostic about which document an entry
lives in.** ``kind`` says what the entry *is*, never where it sits. That
matters because ``project-guidance.md`` is the sink lessons are promoted
into, so it needs the identical mechanism; a lesson-specific ledger would
have guaranteed a rewrite one session later.

Four load-bearing properties (operator design, 2026-08-11)
----------------------------------------------------------

- **Sessions, not timestamps.** A repository may lie dormant for months;
  wall-clock decay would evict the whole corpus for the *project's*
  inactivity rather than the guidance's uselessness. The only question
  ever asked is *"used within the last N active sessions?"*
- **A bounded array, not a scalar.** ``last-used-set="120"`` cannot
  distinguish *used once, ten sets ago* from *used in every one of the
  last ten*, which warrant opposite pruning decisions.
  :data:`RING_CAPACITY` entries capture frequency; the cap keeps the file
  from growing without bound.
- **Entries are dash-separated STRINGS, never JSON numbers.** ``"120-02"``,
  not ``120.02``. A decimal is not merely risky to parse, it is
  *ambiguous to read*: ``120.10`` round-trips through a float to
  ``120.1``, which reads back as session **1** — a silent corruption of
  session 10. :func:`validate_ledger` refuses a numeric use outright.
- **Pruning is batched and operator-initiated.** This module has no
  evict path and never will: :func:`retention_report` *reports*
  candidates and stops. Eviction was never automatic and never
  mid-session — an orchestrator at 100% of a ceiling evicting prose under
  time pressure is the specific defect that broke the old scheme.

Ordering is APPEND order, never label order
-------------------------------------------

``uses`` is newest-first in the order uses were *recorded*, and the
retention window is built from the close-event timeline — never from
sorting the labels. Set numbers are **allocation** order, not execution
order (Set 121 S1 measured this: sets 115 and 118 were executed after
119). Sorting labels would silently mis-order the very history the
retention decision reads.

Writer discipline
-----------------

Machine-written state, so: JSON, **one sanctioned writer** (this module —
``decisions.jsonl`` and ``session-events.jsonl`` are the precedents), and
the same lock discipline as other append-only state, because two sessions
closing minutes apart is not hypothetical in this repo. The lock is
``close_lock.file_mutex`` — the package's single lock implementation.

A use is a CITATION for an instruction and a FIRE for an executable
---------------------------------------------------------------------

:func:`record_citation` refuses an executable and :func:`record_fire`
refuses an instruction, on purpose. Recording mere *execution* of a check
would be worthless — a check that runs in CI every session would look
permanently in use — so the only event an executable records is that it
**caught** something. Making that a type error rather than a convention
is what keeps a run from being filed as a fire.

ASCII-only output (Windows cp1252 consoles).
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import re
import sys
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

try:  # test convention: bare import; production: relative fallback
    from close_lock import file_mutex  # type: ignore[import-not-found]
    from guidance_config import GUIDANCE_RELDIR  # type: ignore[import-not-found]
except ImportError:
    from .close_lock import file_mutex  # type: ignore[no-redef]
    from .guidance_config import GUIDANCE_RELDIR  # type: ignore[no-redef]


# --- constants ---------------------------------------------------------------

LEDGER_FILENAME = "guidance-usage.json"
LEDGER_LOCK_SUFFIX = ".lock"
SCHEMA_VERSION = 1

#: Repo-relative POSIX path, the spelling used in ``cite_lessons``'s
#: ``CLOSE_MANDATED_WRITES`` literal. That declaration is read with
#: ``ast.literal_eval`` on the close path (no import, no side effects),
#: so the literal cannot reference this constant — the one thing a
#: literal can do wrong is drift from its source, and
#: ``test_close_mandated_writes.py`` asserts the two agree.
GUIDANCE_LEDGER_RELPATH = (
    GUIDANCE_RELDIR.replace("\\", "/") + "/" + LEDGER_FILENAME
)

#: Bounded ring buffer depth (operator design, 2026-08-11).
RING_CAPACITY = 10

#: What an entry IS, never where it sits.
KIND_INSTRUCTION = "instruction"
KIND_EXECUTABLE = "executable"
KINDS = (KIND_INSTRUCTION, KIND_EXECUTABLE)

#: Cost class for an executable. Cheap checks are free insurance that
#: never expires and need no usage record at all; expensive ones must
#: demonstrate they still catch something.
COST_CHEAP = "cheap"
COST_EXPENSIVE = "expensive"
COSTS = (COST_CHEAP, COST_EXPENSIVE)

#: ``<set>-<session>``: three-or-more digits, a dash, two-or-more digits.
#: Zero-padded so it still sorts correctly, and dash-separated so no
#: reader or writer is ever tempted to treat it as a float.
USE_LABEL_RE = re.compile(r"^\d{3,}-\d{2,}$")

#: Ids are not lesson-specific: ``L-064-9`` today, ``G-001`` once
#: project-guidance.md becomes addressable.
ENTRY_ID_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_-]*$")

_SET_DIR_RE = re.compile(r"^(\d{3,})-")


# --- labels ------------------------------------------------------------------


def use_label(set_number: object, session_number: object) -> str:
    """Build the canonical ``"<set>-<session>"`` label, zero-padded.

    ``use_label(120, 2) == "120-02"``. Accepts ints or strings; a string
    that is already a label is returned normalized. Raises
    :class:`ValueError` on anything that cannot be a label, because a
    silently mangled label is a silently mis-attributed use.
    """
    s = str(set_number).strip()
    n = str(session_number).strip()
    if not s.isdigit() or not n.isdigit():
        raise ValueError(
            f"use label needs numeric set/session, got {set_number!r}/{session_number!r}"
        )
    label = f"{int(s):03d}-{int(n):02d}"
    if not USE_LABEL_RE.match(label):  # pragma: no cover - unreachable by construction
        raise ValueError(f"built an invalid use label: {label!r}")
    return label


def parse_use_label(label: str) -> Tuple[int, int]:
    """Split a label back into ``(set_number, session_number)`` ints."""
    if not isinstance(label, str) or not USE_LABEL_RE.match(label):
        raise ValueError(f"not a use label: {label!r}")
    set_part, _, session_part = label.partition("-")
    return int(set_part), int(session_part)


# --- model -------------------------------------------------------------------


@dataclass
class LedgerEntry:
    """One guidance item's usage record."""

    kind: str = KIND_INSTRUCTION
    uses: List[str] = field(default_factory=list)
    cost: str = ""
    note: str = ""

    def to_dict(self) -> dict:
        out: dict = {"kind": self.kind}
        if self.cost:
            out["cost"] = self.cost
        out["uses"] = list(self.uses)
        if self.note:
            out["note"] = self.note
        return out


@dataclass
class Ledger:
    """The whole ledger: schema version plus id -> :class:`LedgerEntry`."""

    schema_version: int = SCHEMA_VERSION
    entries: Dict[str, LedgerEntry] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "schemaVersion": self.schema_version,
            "entries": {
                key: self.entries[key].to_dict() for key in sorted(self.entries)
            },
        }


# --- paths -------------------------------------------------------------------


def ledger_path(repo_root: Optional[str] = None) -> str:
    """Absolute path to the ledger for *repo_root* (default: cwd)."""
    root = repo_root if repo_root is not None else os.getcwd()
    return os.path.join(root, GUIDANCE_RELDIR, LEDGER_FILENAME)


def lock_path_for(path: str) -> str:
    return path + LEDGER_LOCK_SUFFIX


# --- read --------------------------------------------------------------------


def parse_ledger(data: object) -> Tuple[Ledger, List[str]]:
    """Build a :class:`Ledger` from parsed JSON, plus a list of problems.

    Lenient parser, strict reporter — the same split
    :mod:`ai_router.guidance_meta` uses. A malformed record is reported
    and preserved as faithfully as possible rather than dropped, so a
    typo can never silently remove an entry from the retention report.
    """
    problems: List[str] = []
    if not isinstance(data, dict):
        return Ledger(), ["ledger root is not a JSON object"]

    version = data.get("schemaVersion", SCHEMA_VERSION)
    if not isinstance(version, int) or isinstance(version, bool):
        problems.append(f"schemaVersion is not an integer: {version!r}")
        version = SCHEMA_VERSION
    elif version > SCHEMA_VERSION:
        problems.append(
            f"ledger schemaVersion {version} is newer than this reader "
            f"(supports {SCHEMA_VERSION}); refusing to guess its shape"
        )

    raw_entries = data.get("entries")
    if raw_entries is None:
        return Ledger(schema_version=version), problems
    if not isinstance(raw_entries, dict):
        problems.append("entries is not a JSON object")
        return Ledger(schema_version=version), problems

    entries: Dict[str, LedgerEntry] = {}
    for key, value in raw_entries.items():
        if not ENTRY_ID_RE.match(str(key)):
            problems.append(f"{key!r}: not a valid guidance id")
        if not isinstance(value, dict):
            problems.append(f"{key}: record is not a JSON object")
            continue
        kind = value.get("kind")
        if kind not in KINDS:
            problems.append(
                f"{key}: kind {kind!r} not in {KINDS}"
            )
            kind = kind if isinstance(kind, str) else KIND_INSTRUCTION
        cost = value.get("cost", "")
        if cost and cost not in COSTS:
            problems.append(f"{key}: cost {cost!r} not in {COSTS}")
        if kind == KIND_EXECUTABLE and not cost:
            problems.append(
                f"{key}: executable entries must declare a cost "
                f"({COST_CHEAP} or {COST_EXPENSIVE}) - the retention rule "
                "for a check is chosen by its cost"
            )
        raw_uses = value.get("uses", [])
        uses: List[str] = []
        if not isinstance(raw_uses, list):
            problems.append(f"{key}: uses is not a list")
            raw_uses = []
        for item in raw_uses:
            if not isinstance(item, str):
                problems.append(
                    f"{key}: use {item!r} is a JSON {type(item).__name__}, not a "
                    'string. Uses are dash-separated strings ("120-10"); a '
                    "decimal round-trips 120.10 to 120.1 and silently reads "
                    "back as session 1"
                )
                continue
            if not USE_LABEL_RE.match(item):
                problems.append(
                    f"{key}: use {item!r} is not a <set>-<session> label"
                )
                continue
            uses.append(item)
        if len(uses) > RING_CAPACITY:
            problems.append(
                f"{key}: {len(uses)} uses exceeds the ring capacity of "
                f"{RING_CAPACITY}"
            )
        note = value.get("note", "")
        entries[str(key)] = LedgerEntry(
            kind=str(kind),
            uses=uses,
            cost=str(cost) if isinstance(cost, str) else "",
            note=str(note) if isinstance(note, str) else "",
        )
    return Ledger(schema_version=version, entries=entries), problems


def load_ledger(
    repo_root: Optional[str] = None, *, path: Optional[str] = None
) -> Tuple[Ledger, List[str]]:
    """Load the ledger from disk. A missing file is an empty ledger, not an error."""
    target = path or ledger_path(repo_root)
    if not os.path.isfile(target):
        return Ledger(), []
    try:
        with open(target, "r", encoding="utf-8") as handle:
            data = json.load(handle)
    except (OSError, ValueError) as exc:
        return Ledger(), [f"could not read {target}: {exc}"]
    return parse_ledger(data)


def validate_ledger(
    repo_root: Optional[str] = None, *, path: Optional[str] = None
) -> List[str]:
    """Return the ledger's problems (empty list = valid)."""
    _, problems = load_ledger(repo_root, path=path)
    return problems


# --- write (the sanctioned writer) -------------------------------------------


def _write_atomic(target: str, ledger: Ledger) -> None:
    os.makedirs(os.path.dirname(target), exist_ok=True)
    tmp = target + ".tmp"
    payload = json.dumps(ledger.to_dict(), indent=2, ensure_ascii=False) + "\n"
    with open(tmp, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(payload)
        handle.flush()
        try:
            os.fsync(handle.fileno())
        except OSError:
            pass
    os.replace(tmp, target)


def push_use(entry: LedgerEntry, label: str) -> bool:
    """Push *label* onto *entry*'s ring, newest-first. Return True if changed.

    Idempotent: a label already at the front is a no-op, and a label
    present deeper in the ring moves to the front rather than being
    duplicated. Truncates to :data:`RING_CAPACITY`.
    """
    if not USE_LABEL_RE.match(label):
        raise ValueError(f"not a use label: {label!r}")
    if entry.uses[:1] == [label] and len(entry.uses) <= RING_CAPACITY:
        return False
    remaining = [u for u in entry.uses if u != label]
    entry.uses = ([label] + remaining)[:RING_CAPACITY]
    return True


def _record(
    ids: Sequence[str],
    label: str,
    kind: str,
    *,
    repo_root: Optional[str] = None,
    path: Optional[str] = None,
    cost: str = "",
    create_missing: bool = True,
    timeout_seconds: float = 30.0,
) -> Dict[str, str]:
    """Record one use of each id. Returns ``{id: outcome}``.

    Outcomes: ``recorded``, ``unchanged``, ``unknown`` (not in the ledger
    and *create_missing* is False), ``kind-mismatch``.
    """
    target = path or ledger_path(repo_root)
    outcomes: Dict[str, str] = {}
    with file_mutex(lock_path_for(target), timeout_seconds=timeout_seconds):
        ledger, _problems = load_ledger(path=target)
        changed = False
        for entry_id in ids:
            if not ENTRY_ID_RE.match(entry_id):
                outcomes[entry_id] = "invalid-id"
                continue
            entry = ledger.entries.get(entry_id)
            if entry is None:
                if not create_missing:
                    outcomes[entry_id] = "unknown"
                    continue
                entry = LedgerEntry(kind=kind, cost=cost)
                ledger.entries[entry_id] = entry
            elif entry.kind != kind:
                outcomes[entry_id] = "kind-mismatch"
                continue
            if cost and not entry.cost:
                entry.cost = cost
                changed = True
            if push_use(entry, label):
                changed = True
                outcomes[entry_id] = "recorded"
            else:
                outcomes[entry_id] = "unchanged"
        if changed:
            _write_atomic(target, ledger)
    return outcomes


def record_citation(
    ids: Sequence[str],
    *,
    set_number: object,
    session_number: object,
    repo_root: Optional[str] = None,
    path: Optional[str] = None,
    timeout_seconds: float = 30.0,
) -> Dict[str, str]:
    """Record that *ids* (instruction lines) were cited by one session.

    Refuses an id already recorded as an ``executable``: a check does not
    get credit for being mentioned, only for firing.
    """
    return _record(
        ids,
        use_label(set_number, session_number),
        KIND_INSTRUCTION,
        repo_root=repo_root,
        path=path,
        timeout_seconds=timeout_seconds,
    )


def record_fire(
    ids: Sequence[str],
    *,
    set_number: object,
    session_number: object,
    cost: str = COST_EXPENSIVE,
    repo_root: Optional[str] = None,
    path: Optional[str] = None,
    timeout_seconds: float = 30.0,
) -> Dict[str, str]:
    """Record that *ids* (executable checks) CAUGHT something in one session.

    The recorded event is a **fire**, never a run. A check that executes
    in CI every session would look permanently in use, which is precisely
    the signal that would make the retention rule worthless.
    """
    if cost not in COSTS:
        raise ValueError(f"cost {cost!r} not in {COSTS}")
    return _record(
        ids,
        use_label(set_number, session_number),
        KIND_EXECUTABLE,
        repo_root=repo_root,
        path=path,
        cost=cost,
        timeout_seconds=timeout_seconds,
    )


def upsert_entry(
    entry_id: str,
    *,
    kind: str,
    cost: str = "",
    note: str = "",
    uses: Optional[Iterable[str]] = None,
    repo_root: Optional[str] = None,
    path: Optional[str] = None,
    timeout_seconds: float = 30.0,
) -> str:
    """Create or update one entry's classification (not its usage).

    The registration seam: an entry must exist in the ledger to be
    governed by a retention rule, and a check has to declare its cost
    before the rule for it can be chosen.
    """
    if kind not in KINDS:
        raise ValueError(f"kind {kind!r} not in {KINDS}")
    if cost and cost not in COSTS:
        raise ValueError(f"cost {cost!r} not in {COSTS}")
    if kind == KIND_EXECUTABLE and not cost:
        raise ValueError(
            "an executable entry must declare a cost: the retention rule "
            "for a check is chosen by its cost"
        )
    if not ENTRY_ID_RE.match(entry_id):
        raise ValueError(f"not a valid guidance id: {entry_id!r}")
    target = path or ledger_path(repo_root)
    with file_mutex(lock_path_for(target), timeout_seconds=timeout_seconds):
        ledger, _problems = load_ledger(path=target)
        entry = ledger.entries.get(entry_id)
        outcome = "updated" if entry is not None else "created"
        if entry is None:
            entry = LedgerEntry(kind=kind)
            ledger.entries[entry_id] = entry
        elif entry.kind != kind and entry.uses:
            # A use of one kind is NOT a use of the other. Citation labels
            # inherited by a check would be read by retention_report as
            # FIRES, so an expensive check that had never caught anything
            # would be retained on the strength of having once been prose
            # somebody mentioned. The history is not lost -- it stays in
            # the close events the backfill replays, and in the archived
            # lesson text -- but it does not transfer.
            outcome = "reclassified"
            entry.uses = []
        entry.kind = kind
        entry.cost = cost
        entry.note = note
        if uses is not None:
            entry.uses = []
            for label in uses:
                push_use(entry, label)
            entry.uses = entry.uses[:RING_CAPACITY]
        _write_atomic(target, ledger)
    return outcome


# --- the active-session timeline ---------------------------------------------


def _parse_timestamp(value: object) -> Optional[datetime]:
    if not isinstance(value, str) or not value.strip():
        return None
    text = value.strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return None
    return parsed


def active_session_timeline(
    repo_root: Optional[str] = None, *, session_sets_dir: Optional[str] = None
) -> List[str]:
    """Every closed session, newest first, as ``<set>-<session>`` labels.

    Built from ``closeout_succeeded`` events across the session-set
    ledgers and ordered by **timestamp**, not by set number. Set numbers
    are allocation order: Set 121 S1 measured sets 115 and 118 executing
    *after* 119, so a set-number sort would put a session in the
    retention window that had not run yet.

    This is the denominator for *"used within the last N active
    sessions?"* — the reason retention is measured in sessions and never
    in elapsed time. A repository dormant for a month has the same
    timeline it had a month ago, so its guidance survives the calendar.
    """
    root = repo_root if repo_root is not None else os.getcwd()
    base = session_sets_dir or os.path.join(root, "docs", "session-sets")
    seen: Dict[str, datetime] = {}
    pattern = os.path.join(base, "*", "session-events.jsonl")
    for events_file in sorted(glob.glob(pattern)):
        set_dir = os.path.basename(os.path.dirname(events_file))
        match = _SET_DIR_RE.match(set_dir)
        if match is None:
            continue
        set_number = match.group(1)
        try:
            with open(events_file, "r", encoding="utf-8") as handle:
                lines = handle.readlines()
        except OSError:
            continue
        for line in lines:
            line = line.strip()
            if not line:
                continue
            try:
                event = json.loads(line)
            except ValueError:
                continue
            if not isinstance(event, dict):
                continue
            kind = event.get("event_type") or event.get("event")
            if kind != "closeout_succeeded":
                continue
            session = event.get("session_number", event.get("session"))
            stamp = _parse_timestamp(event.get("timestamp"))
            if session is None or stamp is None:
                continue
            try:
                label = use_label(set_number, session)
            except ValueError:
                continue
            previous = seen.get(label)
            if previous is None or stamp < previous:
                # A session closed more than once (a repaired close) is
                # ONE active session; its first success is when it ran.
                seen[label] = stamp
    ordered = sorted(seen.items(), key=lambda kv: (kv[1], kv[0]), reverse=True)
    return [label for label, _stamp in ordered]


def active_set_timeline(timeline: Sequence[str]) -> List[str]:
    """Distinct set numbers from a session timeline, newest first."""
    out: List[str] = []
    for label in timeline:
        set_part = label.partition("-")[0]
        if set_part not in out:
            out.append(set_part)
    return out


# --- retention (report only; there is deliberately no evict path) ------------

RETAIN = "retain"
CANDIDATE = "prune-candidate"
UNUSED = "never-used"
PERMANENT = "permanent"
NOT_IN_CORPUS = "not-in-corpus"
UNREGISTERED = "unregistered"


def corpus_ids(repo_root: Optional[str] = None) -> List[str]:
    """Ids currently living in the LIVE guidance corpus (active tier only).

    The ledger is a permanent record and keeps an id's history after the
    entry is archived; retention only governs what is still being read at
    session start. Without this scoping every archived lesson would
    resurface as a prune candidate forever — a report nobody can act on.

    Markers are found **anywhere in the document**, not only under a
    level-2 heading. ``project-guidance.md`` is the sink lessons are
    promoted into and its entries are bullets under level-3 sections, so
    a heading-bound scan would silently see zero of them — and silently
    seeing zero is how a corpus gate passes having examined nothing.
    """
    try:
        from .guidance_config import (  # type: ignore[import-not-found]
            LESSONS_ACTIVE,
            PROJECT_GUIDANCE,
            discover_guidance_files,
        )
        from .guidance_meta import scan_ids  # type: ignore[import-not-found]
    except ImportError:  # pragma: no cover - bare-import test convention
        from guidance_config import (  # type: ignore[no-redef]
            LESSONS_ACTIVE,
            PROJECT_GUIDANCE,
            discover_guidance_files,
        )
        from guidance_meta import scan_ids  # type: ignore[no-redef]

    found = discover_guidance_files(repo_root)
    ids: List[str] = []
    for name in (LESSONS_ACTIVE, PROJECT_GUIDANCE):
        path = found.get(name)
        if not path:
            continue
        try:
            with open(path, "r", encoding="utf-8") as handle:
                text = handle.read()
        except OSError:
            continue
        ids.extend(scan_ids(text))
    return ids


@dataclass
class RetentionVerdict:
    entry_id: str
    kind: str
    cost: str
    status: str
    reason: str
    last_use: str = ""
    uses_in_window: int = 0


def retention_report(
    ledger: Ledger,
    *,
    session_timeline: Sequence[str],
    instruction_window_sessions: int,
    check_window_sets: int,
    governed_ids: Optional[Iterable[str]] = None,
) -> List[RetentionVerdict]:
    """Classify every entry against its retention rule. Reports; never evicts.

    Two rules, split by artifact type, because one *"unused in N sets ->
    drop"* rule fails for preventive gates: a gate that never fires is
    indistinguishable from a useless one, which is exactly what L-112-1
    warns about.

    - **instruction** — retained when it was cited within the last
      *instruction_window_sessions* **active sessions**.
    - **executable, cheap** — retained permanently. Under a second,
      deterministic, no routed call: free insurance that never expires,
      so it needs no usage record at all.
    - **executable, expensive** — a routed call, or over ten seconds. It
      must have **fired** within the last *check_window_sets* sets.

    *governed_ids*, when given, is the LIVE corpus and drives the report
    in **both** directions. An instruction line that no longer appears
    there is reported as :data:`NOT_IN_CORPUS` history; and a live id
    with **no ledger entry at all** is reported as :data:`UNREGISTERED`
    rather than passing unseen. The second direction is the load-bearing
    one: iterating the ledger alone would make a brand-new instruction
    line — the exact case the anti-rebloat mechanism exists to govern —
    invisible to both the report and the cap, so the gate could pass
    while the corpus had already outgrown its evidence-backed limit.

    Executables are always governed: encoding a lesson is precisely what
    archives its prose, so scoping a check by corpus membership would
    exempt every check the moment it did its job.

    A verdict of :data:`CANDIDATE` makes an entry eligible for an
    operator's batched review. It is not an eviction and this module has
    no way to perform one.
    """
    window_sessions = set(session_timeline[:max(instruction_window_sessions, 0)])
    set_timeline = active_set_timeline(session_timeline)
    window_sets = set(set_timeline[:max(check_window_sets, 0)])
    governed = set(governed_ids) if governed_ids is not None else None
    verdicts: List[RetentionVerdict] = []
    for entry_id in sorted(ledger.entries):
        entry = ledger.entries[entry_id]
        last_use = entry.uses[0] if entry.uses else ""
        if (
            governed is not None
            and entry.kind == KIND_INSTRUCTION
            and entry_id not in governed
        ):
            verdicts.append(
                RetentionVerdict(
                    entry_id=entry_id,
                    kind=entry.kind,
                    cost=entry.cost,
                    status=NOT_IN_CORPUS,
                    reason=(
                        "history only: the instruction line is not in the "
                        "live guidance corpus, so no retention rule governs it"
                    ),
                    last_use=last_use,
                )
            )
            continue
        if entry.kind == KIND_EXECUTABLE and entry.cost == COST_CHEAP:
            verdicts.append(
                RetentionVerdict(
                    entry_id=entry_id,
                    kind=entry.kind,
                    cost=entry.cost,
                    status=PERMANENT,
                    reason=(
                        "cheap check: free insurance that never expires; no "
                        "usage record required"
                    ),
                    last_use=last_use,
                )
            )
            continue
        if entry.kind == KIND_EXECUTABLE:
            hits = [u for u in entry.uses if u.partition("-")[0] in window_sets]
            if hits:
                status, reason = RETAIN, (
                    f"expensive check fired {len(hits)} time(s) within the "
                    f"last {check_window_sets} set(s)"
                )
            elif not entry.uses:
                status, reason = UNUSED, (
                    "expensive check has never been recorded firing; a check "
                    "that never fires is indistinguishable from a useless one"
                )
            else:
                status, reason = CANDIDATE, (
                    f"expensive check last fired at {last_use}, outside the "
                    f"last {check_window_sets} set(s)"
                )
            verdicts.append(
                RetentionVerdict(
                    entry_id=entry_id,
                    kind=entry.kind,
                    cost=entry.cost,
                    status=status,
                    reason=reason,
                    last_use=last_use,
                    uses_in_window=len(hits),
                )
            )
            continue
        hits = [u for u in entry.uses if u in window_sessions]
        if hits:
            status, reason = RETAIN, (
                f"cited in {len(hits)} of the last {instruction_window_sessions} "
                "active session(s)"
            )
        elif not entry.uses:
            status, reason = UNUSED, "never cited"
        else:
            status, reason = CANDIDATE, (
                f"last cited at {last_use}, outside the last "
                f"{instruction_window_sessions} active session(s)"
            )
        verdicts.append(
            RetentionVerdict(
                entry_id=entry_id,
                kind=entry.kind,
                cost=entry.cost,
                status=status,
                reason=reason,
                last_use=last_use,
                uses_in_window=len(hits),
            )
        )
    # The other direction: a live id the ledger has never heard of. It is
    # an instruction line by construction (it is prose in a guidance
    # document), it has no usage, and it MUST count against the cap --
    # otherwise the anti-rebloat gate passes on a corpus it cannot see.
    for entry_id in sorted(governed or ()):
        if entry_id in ledger.entries:
            continue
        verdicts.append(
            RetentionVerdict(
                entry_id=entry_id,
                kind=KIND_INSTRUCTION,
                cost="",
                status=UNREGISTERED,
                reason=(
                    "in the live corpus but absent from the ledger: no usage "
                    "can accrue for it, so it can never be judged. Register "
                    "it (guidance_ledger register) or cite it"
                ),
            )
        )
    return verdicts


def governed_instruction_ids(
    ledger: Ledger, governed_ids: Optional[Iterable[str]] = None
) -> List[str]:
    """Every live instruction line, whether or not the ledger knows it.

    The cap counts the CORPUS, not the ledger. An unregistered live entry
    is still an instruction line an orchestrator has to hold in mind.
    """
    if governed_ids is None:
        return sorted(
            key
            for key, entry in ledger.entries.items()
            if entry.kind == KIND_INSTRUCTION
        )
    out = set()
    for entry_id in governed_ids:
        entry = ledger.entries.get(entry_id)
        if entry is None or entry.kind == KIND_INSTRUCTION:
            out.add(entry_id)
    return sorted(out)


def instruction_count(ledger: Ledger, governed_ids: Optional[Iterable[str]] = None) -> int:
    """How many instruction lines the LIVE corpus currently carries."""
    return len(governed_instruction_ids(ledger, governed_ids))


# --- backfill ----------------------------------------------------------------


def harvest_citation_history(
    repo_root: Optional[str] = None, *, session_sets_dir: Optional[str] = None
) -> Dict[str, List[str]]:
    """``{id: [labels newest-first]}`` from every session's close event.

    ``close_session`` has recorded ``disposition.lessons_cited`` into
    ``session-events.jsonl`` since Set 064, so the repo already holds
    per-**session** citation history. That is strictly better than the
    ``last-used-set`` scalar this ledger replaces: the scalar could not
    distinguish *used once, ten sets ago* from *used in every one of the
    last ten*, and the events ledger can.

    Ordered by close timestamp (execution order), so the ring buffer is
    built the same way :func:`active_session_timeline` is and for the
    same reason.
    """
    root = repo_root if repo_root is not None else os.getcwd()
    base = session_sets_dir or os.path.join(root, "docs", "session-sets")
    events: List[Tuple[datetime, str, List[str]]] = []
    pattern = os.path.join(base, "*", "session-events.jsonl")
    for events_file in sorted(glob.glob(pattern)):
        set_dir = os.path.basename(os.path.dirname(events_file))
        match = _SET_DIR_RE.match(set_dir)
        if match is None:
            continue
        set_number = match.group(1)
        try:
            with open(events_file, "r", encoding="utf-8") as handle:
                lines = handle.readlines()
        except OSError:
            continue
        for line in lines:
            line = line.strip()
            if not line:
                continue
            try:
                event = json.loads(line)
            except ValueError:
                continue
            if not isinstance(event, dict):
                continue
            cited = event.get("lessons_cited")
            if not isinstance(cited, list) or not cited:
                continue
            session = event.get("session_number", event.get("session"))
            stamp = _parse_timestamp(event.get("timestamp"))
            if session is None or stamp is None:
                continue
            try:
                label = use_label(set_number, session)
            except ValueError:
                continue
            ids = [str(i).strip() for i in cited if str(i).strip()]
            events.append((stamp, label, ids))
    events.sort(key=lambda row: (row[0], row[1]))
    # Replayed oldest-event-first so push_use's move-to-front leaves each
    # ring in true recency order.
    history: Dict[str, List[str]] = {}
    for _stamp, label, ids in events:
        for entry_id in ids:
            if not ENTRY_ID_RE.match(entry_id):
                continue
            entry = LedgerEntry(kind=KIND_INSTRUCTION, uses=history.get(entry_id, []))
            push_use(entry, label)
            history[entry_id] = entry.uses
    return history


def backfill(
    repo_root: Optional[str] = None,
    *,
    path: Optional[str] = None,
    session_sets_dir: Optional[str] = None,
    kinds: Optional[Dict[str, Tuple[str, str]]] = None,
    timeout_seconds: float = 30.0,
) -> Dict[str, int]:
    """Seed the ledger from the repo's recorded citation history.

    Idempotent: re-running rebuilds the same rings from the same events.
    *kinds* optionally overrides ``{id: (kind, cost)}`` for entries that
    are executables rather than instruction lines.
    """
    target = path or ledger_path(repo_root)
    overrides = kinds or {}
    history = harvest_citation_history(repo_root, session_sets_dir=session_sets_dir)
    added = 0
    updated = 0
    with file_mutex(lock_path_for(target), timeout_seconds=timeout_seconds):
        ledger, _problems = load_ledger(path=target)
        for entry_id, uses in sorted(history.items()):
            kind, cost = overrides.get(entry_id, (KIND_INSTRUCTION, ""))
            entry = ledger.entries.get(entry_id)
            if entry is None:
                if kind == KIND_EXECUTABLE:
                    # Citation history is not fire history. A check's ring
                    # is populated only by record_fire().
                    ledger.entries[entry_id] = LedgerEntry(kind=kind, cost=cost)
                else:
                    ledger.entries[entry_id] = LedgerEntry(
                        kind=kind, cost=cost, uses=list(uses)[:RING_CAPACITY]
                    )
                added += 1
                continue
            if entry.kind == KIND_EXECUTABLE:
                # Same rule on the update path: replaying the migration
                # over a registered check must not hand it citation labels
                # that retention_report would read as recent fires.
                continue
            merged = LedgerEntry(kind=entry.kind, cost=entry.cost, uses=list(entry.uses))
            for label in reversed(list(uses)[:RING_CAPACITY]):
                push_use(merged, label)
            if merged.uses != entry.uses:
                entry.uses = merged.uses
                updated += 1
        for entry_id, (kind, cost) in overrides.items():
            entry = ledger.entries.get(entry_id)
            if entry is None:
                ledger.entries[entry_id] = LedgerEntry(kind=kind, cost=cost)
                added += 1
            else:
                if entry.kind != kind and entry.uses:
                    entry.uses = []
                entry.kind = kind
                entry.cost = cost
        _write_atomic(target, ledger)
    return {"added": added, "updated": updated, "ids": len(history)}


# --- CLI ---------------------------------------------------------------------


def _print(text: str) -> None:
    try:
        print(text)
    except UnicodeEncodeError:  # pragma: no cover - cp1252 console fallback
        print(text.encode("ascii", "replace").decode("ascii"))


def _load_retention_config(repo_root: Optional[str]) -> Tuple[int, int, int]:
    """``(instruction_window_sessions, check_window_sets, instruction_line_cap)``."""
    try:
        from . import config as _config  # type: ignore[import-not-found]
    except ImportError:  # pragma: no cover - bare-import test convention
        try:
            import config as _config  # type: ignore[no-redef]
        except ImportError:
            return DEFAULT_INSTRUCTION_WINDOW_SESSIONS, DEFAULT_CHECK_WINDOW_SETS, DEFAULT_INSTRUCTION_LINE_CAP
    try:
        loaded = _config.load_config()
    except Exception:  # pragma: no cover - a config error must not break a report
        return DEFAULT_INSTRUCTION_WINDOW_SESSIONS, DEFAULT_CHECK_WINDOW_SETS, DEFAULT_INSTRUCTION_LINE_CAP
    return retention_settings(loaded)


#: Derived, not inherited (Set 121 S2 Step 5). Proposal 5.3 proposed
#: "N = 10 sets" and the sequencing note flagged it as proposed-not-
#: measured. Measured over 694 intra-lesson gaps across 345 recorded
#: active sessions: median 1, p90 5, p95 10, **p99 30.2**, max 51. A
#: window of 30 active sessions therefore keeps 99% of genuinely
#: recurring guidance through its quiet stretches. At this repo's
#: measured 2.88 sessions per set that is ~10.4 sets, so 5.3's number
#: survives measurement -- but only after the UNIT is corrected to the
#: one the operator mandated (active sessions, never elapsed time).
DEFAULT_INSTRUCTION_WINDOW_SESSIONS = 30

#: The check window is in SETS, per the Session 2 plan. There is no fire
#: history to derive it from -- the ledger records the first fire after
#: this session -- so this is an honest default rather than a fabricated
#: derivation: it reuses the operator-set ``disuse_window_sets`` of 20
#: that Set 064 already blessed, so the repo carries ONE disuse horizon
#: rather than two that drift.
DEFAULT_CHECK_WINDOW_SETS = 20

#: Peak distinct ids cited in ANY trailing window across 345 sessions:
#: 20 at W=30, 21 at W=40-51, **22** at W=60-80. The working set has
#: never exceeded 22, so that is the measured ceiling and 5.3's proposed
#: 20 is very close to it. The Session-2 blind spot (`project-guidance.md`
#: carried no ids, so its ~24 entries contributed nothing) was closed by
#: Set 121 S3, which admitted them, and by S4, which collapsed six that
#: duplicated the constitution -- leaving a live corpus of 21, back under
#: the measured peak, so 22 is an evidence-backed cap again rather than a
#: restatement of the corpus size.
DEFAULT_INSTRUCTION_LINE_CAP = 22


def retention_settings(config: Optional[dict]) -> Tuple[int, int, int]:
    """Read the ``guidance.retention`` block, fully defaulted."""
    block: object = None
    if isinstance(config, dict):
        guidance = config.get("guidance")
        if isinstance(guidance, dict):
            block = guidance.get("retention")

    def _pick(key: str, default: int) -> int:
        if isinstance(block, dict):
            value = block.get(key)
            if isinstance(value, int) and not isinstance(value, bool) and value > 0:
                return value
        return default

    return (
        _pick("instruction_window_sessions", DEFAULT_INSTRUCTION_WINDOW_SESSIONS),
        _pick("check_window_sets", DEFAULT_CHECK_WINDOW_SETS),
        _pick("instruction_line_cap", DEFAULT_INSTRUCTION_LINE_CAP),
    )


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="ai_router.guidance_ledger",
        description=(
            "The guidance usage ledger: usage accounting held in machine "
            "state instead of in the preload corpus. Reports retention "
            "candidates; it has no evict path, because pruning is a batched "
            "pass the operator initiates, never automatic and never "
            "mid-session."
        ),
    )
    parser.add_argument("--repo-root", default=None, help="Repo root (default: cwd).")
    # The same flag on every subcommand, so both `--repo-root X validate`
    # and `validate --repo-root X` work. SUPPRESS keeps the subparser's
    # absent value from clobbering one given before the subcommand.
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument(
        "--repo-root", default=argparse.SUPPRESS, help="Repo root (default: cwd)."
    )
    sub = parser.add_subparsers(dest="command")

    p_report = sub.add_parser(
        "report", help="Retention report (read-only).", parents=[common]
    )
    p_report.add_argument("--window-sessions", type=int, default=None)
    p_report.add_argument("--window-sets", type=int, default=None)

    p_cite = sub.add_parser(
        "cite", help="Record a citation of instruction line(s).", parents=[common]
    )
    p_cite.add_argument("--set", dest="set_number", required=True)
    p_cite.add_argument("--session", dest="session_number", required=True)
    p_cite.add_argument("ids", nargs="+")

    p_fire = sub.add_parser(
        "fire",
        help="Record that an expensive check CAUGHT something.",
        parents=[common],
    )
    p_fire.add_argument("--set", dest="set_number", required=True)
    p_fire.add_argument("--session", dest="session_number", required=True)
    p_fire.add_argument("--cost", default=COST_EXPENSIVE, choices=list(COSTS))
    p_fire.add_argument("ids", nargs="+")

    p_register = sub.add_parser(
        "register", help="Create/update an entry's kind+cost.", parents=[common]
    )
    p_register.add_argument("entry_id")
    p_register.add_argument("--kind", required=True, choices=list(KINDS))
    p_register.add_argument("--cost", default="", choices=[""] + list(COSTS))
    p_register.add_argument("--note", default="")

    sub.add_parser(
        "validate",
        help="Validate the ledger file; non-zero if invalid.",
        parents=[common],
    )

    sub.add_parser(
        "backfill",
        help="Seed the ledger from recorded close-event citation history.",
        parents=[common],
    )

    args = parser.parse_args(argv)
    command = args.command or "report"
    target = ledger_path(args.repo_root)

    if command == "backfill":
        stats = backfill(args.repo_root, path=target)
        _print(
            f"backfill: {stats['ids']} id(s) in history; {stats['added']} added, "
            f"{stats['updated']} ring(s) updated -> {target}"
        )
        return 0

    if command == "validate":
        problems = validate_ledger(path=target)
        if not problems:
            _print(f"OK: {target} is valid.")
            return 0
        _print(f"INVALID: {len(problems)} problem(s) in {target}:")
        for problem in problems:
            _print(f"  - {problem}")
        return 1

    if command == "cite":
        outcomes = record_citation(
            args.ids,
            set_number=args.set_number,
            session_number=args.session_number,
            path=target,
        )
        return _print_outcomes(outcomes)

    if command == "fire":
        outcomes = record_fire(
            args.ids,
            set_number=args.set_number,
            session_number=args.session_number,
            cost=args.cost,
            path=target,
        )
        return _print_outcomes(outcomes)

    if command == "register":
        outcome = upsert_entry(
            args.entry_id,
            kind=args.kind,
            cost=args.cost,
            note=args.note,
            path=target,
        )
        _print(f"[{outcome}] {args.entry_id} kind={args.kind} cost={args.cost or '-'}")
        return 0

    # report
    ledger, problems = load_ledger(path=target)
    win_sessions, win_sets, cap = _load_retention_config(args.repo_root)
    if args.window_sessions:
        win_sessions = args.window_sessions
    if args.window_sets:
        win_sets = args.window_sets
    timeline = active_session_timeline(args.repo_root)
    governed = corpus_ids(args.repo_root)
    verdicts = retention_report(
        ledger,
        session_timeline=timeline,
        instruction_window_sessions=win_sessions,
        check_window_sets=win_sets,
        governed_ids=governed,
    )
    _print(f"Guidance usage ledger: {target}")
    _print(
        f"  {len(ledger.entries)} entr(ies), {len(governed)} governed by the live "
        f"corpus; {len(timeline)} active sessions on record"
    )
    _print(
        f"  window = last {win_sessions} active session(s) for instruction lines, "
        f"last {win_sets} set(s) for expensive checks"
    )
    if problems:
        _print(f"  {len(problems)} problem(s):")
        for problem in problems:
            _print(f"    - {problem}")
    _print("")
    for verdict in verdicts:
        if verdict.status == NOT_IN_CORPUS:
            continue
        _print(
            f"  [{verdict.status:<15}] {verdict.entry_id:<12} "
            f"{verdict.kind}/{verdict.cost or '-'}  {verdict.reason}"
        )
    history_only = [v for v in verdicts if v.status == NOT_IN_CORPUS]
    if history_only:
        _print(
            f"  ({len(history_only)} archived id(s) carry history only and are "
            "not governed)"
        )
    lines = instruction_count(ledger, governed)
    unregistered = [v for v in verdicts if v.status == UNREGISTERED]
    _print("")
    _print(f"  instruction lines in the live corpus: {lines} / cap {cap}")
    over_cap = lines > cap
    if over_cap:
        _print(
            f"  OVER CAP by {lines - cap}: admitting another instruction line "
            "requires removing one, or re-deriving the cap against the "
            "enlarged corpus. The cap is evidence, not a constant to inherit."
        )
    if unregistered:
        _print(
            f"  {len(unregistered)} live id(s) are absent from the ledger and "
            "can never accrue usage until registered or cited."
        )
    candidates = [v for v in verdicts if v.status in (CANDIDATE, UNUSED)]
    if candidates:
        _print("")
        _print(
            f"  {len(candidates)} retention candidate(s) for the operator's "
            "batched prune review. Nothing is evicted by this tool."
        )
    # Unregistered ids are SURFACED and COUNTED, but they do not fail the
    # command: a repo that has not cited anything yet has no ledger at
    # all, which is the normal starting state and not a defect. A gate
    # that refuses every fresh repo guards nothing. The failing
    # conditions are a malformed ledger and a corpus over its cap.
    return 1 if (problems or over_cap) else 0


def _print_outcomes(outcomes: Dict[str, str]) -> int:
    bad = 0
    for entry_id, outcome in outcomes.items():
        _print(f"  [{outcome}] {entry_id}")
        if outcome in ("kind-mismatch", "invalid-id", "unknown"):
            bad += 1
    return 1 if bad else 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())


__all__ = [
    "LEDGER_FILENAME",
    "GUIDANCE_LEDGER_RELPATH",
    "SCHEMA_VERSION",
    "RING_CAPACITY",
    "KIND_INSTRUCTION",
    "KIND_EXECUTABLE",
    "KINDS",
    "COST_CHEAP",
    "COST_EXPENSIVE",
    "COSTS",
    "USE_LABEL_RE",
    "ENTRY_ID_RE",
    "RETAIN",
    "CANDIDATE",
    "UNUSED",
    "PERMANENT",
    "NOT_IN_CORPUS",
    "UNREGISTERED",
    "DEFAULT_INSTRUCTION_WINDOW_SESSIONS",
    "DEFAULT_CHECK_WINDOW_SETS",
    "DEFAULT_INSTRUCTION_LINE_CAP",
    "LedgerEntry",
    "Ledger",
    "RetentionVerdict",
    "use_label",
    "parse_use_label",
    "ledger_path",
    "lock_path_for",
    "parse_ledger",
    "load_ledger",
    "validate_ledger",
    "push_use",
    "record_citation",
    "record_fire",
    "upsert_entry",
    "active_session_timeline",
    "active_set_timeline",
    "corpus_ids",
    "retention_report",
    "governed_instruction_ids",
    "instruction_count",
    "harvest_citation_history",
    "backfill",
    "retention_settings",
    "main",
]
