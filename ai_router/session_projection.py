"""The session progress projection — one computation, one serialized answer.

**Who uses this:** ``close_session`` (writes it), the orchestrator and the
Work Explorer (read it), and ``python -m ai_router.session_projection``.
**See also:** ``ai_router/session_checklist.py`` (the row computation this
serializes); ``docs/session-progress-schema.md`` (the file's shape);
``ai_router/session_log.py`` (the strict writer whose vocabulary this
projects).

---

Why this exists (Set 120 S3)
----------------------------
The step ledger rendered wrong because the derivation existed **twice** —
~1,680 lines of Python against ~1,830 of TypeScript, guarded by a parity
test that exists only to check the two agree. A parity test is a tax on
duplication. Set 120's first two sessions made the writer strict and
normalised the drift already on disk; this session computes the answer
**once** and writes it down, so a later set can delete one of the two
implementations rather than keep proving they match.

The computation is deliberately **not** re-implemented here.
:func:`ai_router.session_checklist.build_rows` stays the one Python
derivation of which rows exist and what they say; this module adds the
things a *projection* owes that a renderer does not:

* a normalized ``state`` per step (the four canonical tokens, plus the
  explicit ``unknown`` below) alongside the raw token as written;
* the counts, and the current/remaining split;
* the states absence used to hide (below);
* serialization, with an input digest so staleness is **detectable**.

The states absence used to hide
-------------------------------
Three of them, and each replaces a silence:

``unknown``
    A step whose status token no reader can name — the 15 semantically
    loaded entries Set 120 S2 deliberately preserved (``skipped``,
    ``complete-with-known-failures``, prose blobs, and entries with no
    ``status`` field at all). The renderer already showed these as
    ``[?]``; the projection now *says* ``unknown`` rather than leaving a
    consumer to infer it from a glyph.

``unreadable``
    ``activity-log.json`` exists but does not parse. Before this, that
    rendered as an empty session — indistinguishable from a session that
    logged nothing. "No work" and "cannot read the evidence" are opposite
    facts and both reviewers of Set 115 named the conflation
    independently. The projection carries ``evidence: "unreadable"``
    beside ``evidence: "absent"`` and ``evidence: "read"``.

``stale``
    The projection is a **cache, never a source**. It records the SHA-256
    of every input it derived from, so a reader can always ask whether it
    still describes them (:func:`projection_state`). A cache that cannot
    be checked against its own inputs is a second source of truth wearing
    a disguise; this one refuses to become that. ``--check`` exits 3 on
    stale, and ``--write`` regenerates.

Derived and regenerable
-----------------------
Every serialized projection carries ``"derived": true`` and the exact
command that rebuilds it. Nothing reads it as authority: the inputs it
names are the authority, and this file is what they compute to.

Freshness (why the write happens at close)
------------------------------------------
Regenerating mid-session would rewrite a file inside the session-set
directory after a verification round stamped it — staling the round and
sending the close backstop into a fresh metered round, the failure Sets
111 S2, 112 S3 and 114 S1 each paid for. So the sanctioned write is at
**close**, and this module declares it through the Set 119 S3
``CLOSE_MANDATED_WRITES`` mechanism rather than by adding a filename to a
list in :mod:`ai_router.verification_stamp` (which would fix the instance
and leave the class alive — L-069-1). ``--write`` remains available for an
operator or a consumer that wants the file now.

No ``<- here``
--------------
The projection names ``current`` as the steps whose status **is**
``in-progress`` — a fact the ledger carries directly since Set 120 S1 made
the writer strict. It infers nothing. The old ``<- here`` marker picked
exactly one row by rule, which is why it pointed confidently at step 1 of
Set 119 S2 when the data was bad, and why it could not represent two steps
in flight. It was removed in this same pass (operator ruling, 2026-08-11).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from datetime import datetime
from typing import Dict, List, Optional, Sequence

try:
    from . import session_checklist  # type: ignore[import-not-found]
except ImportError:  # pragma: no cover - direct-script fallback
    import session_checklist  # type: ignore[no-redef]

try:
    from .session_log import CANONICAL_STEP_STATUSES  # type: ignore[import-not-found]
except ImportError:  # pragma: no cover - direct-script fallback
    from session_log import CANONICAL_STEP_STATUSES  # type: ignore[no-redef]


#: The serialized projection, beside the artifacts it derives from.
PROJECTION_FILENAME = "session-progress.json"

#: Bumped when the shape changes incompatibly. Readers that find a higher
#: version than they know must treat the file as unreadable rather than
#: guess — the same posture the projection itself takes towards its inputs.
PROJECTION_SCHEMA_VERSION = 1

REGENERATE_COMMAND = (
    "python -m ai_router.session_projection --session-set-dir <dir> --write"
)

# --- The step states -------------------------------------------------------
#
# The four canonical tokens come from the writer's vocabulary (Set 120 S1)
# and are imported rather than re-spelled, so a fifth token admitted there
# is admitted here with nothing to edit (L-069-1).

#: A status token no reader can name. NOT a writer token — nothing may be
#: logged as ``unknown``; this is what the projection SAYS about a token
#: it found on disk and cannot map. It is deliberately outside
#: ``session_log.CANONICAL_STEP_STATUSES`` for that reason.
STEP_STATE_UNKNOWN = "unknown"

#: Terminal states: a step in one of these needs nothing further. Only
#: ``complete`` — a ``blocked`` step is stopped, not finished, and the
#: lenient ``done`` spelling has already normalized to ``complete`` by the
#: time anything is compared against this.
_TERMINAL_STATES = frozenset({"complete"})

# The read-side leniency, DERIVED rather than re-spelled (L-069-1). Two
# tables that both answer "what does this token mean" is the defect class
# this whole set exists to close, so the projection asks the renderer's
# own ``STATUS_BOXES``: a token maps to whichever canonical token shares
# its box glyph. ``done`` and ``complete`` both render ``[x]``, so ``done``
# projects to ``complete``; ``started`` and ``in_progress`` both render
# ``[~]``, so both project to ``in-progress``. The projection therefore
# cannot recognise a token the renderer does not, nor miss one it does,
# and teaching the renderer a new spelling teaches this with nothing here
# to edit.
_BOX_TO_STATE = {
    session_checklist.STATUS_BOXES[token]: token
    for token in CANONICAL_STEP_STATUSES
    if token in session_checklist.STATUS_BOXES
}

# --- The evidence states ---------------------------------------------------

#: ``activity-log.json`` parsed and its entries were read.
EVIDENCE_READ = "read"
#: ``activity-log.json`` is not there at all.
EVIDENCE_ABSENT = "absent"
#: ``activity-log.json`` is there and could not be parsed. The state that
#: makes "no work" and "cannot read the evidence" distinguishable.
EVIDENCE_UNREADABLE = "unreadable"

# --- The projection's own states -------------------------------------------

PROJECTION_FRESH = "fresh"
PROJECTION_STALE = "stale"
PROJECTION_ABSENT = "absent"
PROJECTION_UNREADABLE = "unreadable"

#: The files a projection derives from, in the order they are digested.
INPUT_FILENAMES = ("activity-log.json", "session-state.json", "spec.md")


# Set 119 S3's declaration mechanism: the writer names its own
# close-mandated output, and verification_stamp DISCOVERS it without
# importing this module. Whole-file, because the projection is close
# output end to end — every byte of it is derived from inputs that bind
# the work diff on their own, so exempting it removes nothing from what a
# verification round reviews.
CLOSE_MANDATED_WRITES = (
    {
        # Literal, not PROJECTION_FILENAME: verification_stamp reads this
        # declaration with ast.literal_eval and WITHOUT importing the
        # module, so a name reference here fails closed (it did, on the
        # first run of this code) rather than silently exempting nothing.
        "path": "session-progress.json",
        "scope": "set",
        "bound": "whole-file",
        "reason": (
            "close_session regenerates the derived session-progress "
            "projection after flipping the state snapshot; it is a pure "
            "function of activity-log.json, session-state.json and "
            "spec.md, each of which binds the diff on its own"
        ),
    },
)


# ---------------------------------------------------------------------------
# The step-level projection
# ---------------------------------------------------------------------------


def normalize_step_state(status: object) -> str:
    """The projected state for a raw *status* token as found on disk.

    Readers stay lenient (standing decision 1): a historical ``done`` is
    still read as ``complete``. Anything the renderer would show as
    ``[?]`` — including an absent or empty status — projects to
    :data:`STEP_STATE_UNKNOWN`, which is the whole point of step 3: an
    unnameable token becomes an explicit state rather than a glyph a
    consumer has to interpret.

    Note the deliberate absence of a ``.strip()``: the renderer looks up
    ``str(status).lower()`` verbatim, so ``" complete"`` is ``[?]`` there
    and must be ``unknown`` here. Being kinder than the renderer would
    reintroduce, in the projection, exactly the disagreement between two
    readers that this set exists to end.
    """
    box = session_checklist.STATUS_BOXES.get(str(status or "").lower())
    return _BOX_TO_STATE.get(box, STEP_STATE_UNKNOWN)


def _step_from_row(row: "session_checklist.ChecklistRow") -> Dict[str, object]:
    """One projected step.

    Carries the raw token **and** the normalized state, deliberately. The
    raw value is the record — Set 120 S2 preserved 15 loaded tokens
    precisely so they would keep saying what they said — and the state is
    what a consumer renders. Collapsing the two would launder exactly the
    entries that were protected from laundering.
    """
    state = normalize_step_state(row.status)
    return {
        "stepNumber": row.step_number,
        "stepKey": row.step_key,
        "description": row.description,
        "status": str(row.status or ""),
        "state": state,
        "box": session_checklist.STATUS_BOXES.get(
            str(row.status).lower(), session_checklist.UNKNOWN_BOX
        ),
        "isPlanned": bool(row.is_planned),
        "isTerminal": state in _TERMINAL_STATES,
    }


def _counts(steps: Sequence[dict]) -> Dict[str, int]:
    """Per-state totals, with every state present even at zero.

    An absent key and a zero are different claims to a consumer that does
    ``counts.get(state, 0)`` — and only one of them is true. Every state
    the projection can produce is always listed.
    """
    tally = {state: 0 for state in (*CANONICAL_STEP_STATUSES, STEP_STATE_UNKNOWN)}
    for step in steps:
        state = str(step.get("state") or STEP_STATE_UNKNOWN)
        tally[state] = tally.get(state, 0) + 1
    tally["total"] = len(steps)
    return tally


def _session_numbers(session_set_dir: str) -> List[int]:
    """Every session number this set has evidence for, ascending.

    The union of what ``session-state.json`` plans and what
    ``activity-log.json`` records, because either can be ahead: a
    registered session has a state row before it logs anything, and a
    ledger from before the v4 state file may have rows the snapshot never
    listed. A projection that showed only one side would hide the other.
    """
    numbers: set = set()
    state = session_checklist.read_session_state(session_set_dir)
    if isinstance(state, dict):
        for entry in state.get("sessions") or []:
            if not isinstance(entry, dict):
                continue
            number = entry.get("number")
            if isinstance(number, int) and not isinstance(number, bool):
                numbers.add(number)
    log = session_checklist.read_activity_log(session_set_dir)
    entries = (log or {}).get("entries")
    if isinstance(entries, list):
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            number = entry.get("sessionNumber")
            if isinstance(number, int) and not isinstance(number, bool):
                numbers.add(number)
    return sorted(numbers)


def evidence_state(session_set_dir: str) -> str:
    """Whether the step evidence was read, is absent, or is unreadable.

    The distinction step 3 exists for. :func:`session_checklist
    .read_activity_log` returns ``None`` for both "not there" and "there
    but corrupt", which is exactly how an unreadable ledger came to render
    as an empty session row; this asks the two questions separately.
    """
    path = os.path.join(session_set_dir, "activity-log.json")
    if not os.path.isfile(path):
        return EVIDENCE_ABSENT
    return (
        EVIDENCE_READ
        if session_checklist.read_activity_log(session_set_dir) is not None
        else EVIDENCE_UNREADABLE
    )


def _session_status(session_set_dir: str, number: int) -> Optional[str]:
    """The SET-level status recorded for session *number*, if any.

    ``session-state.json`` is the single source of truth for session
    progress, so the projection reports what it says rather than deriving
    a session status from the steps. A session whose steps are all
    complete but which never closed is not complete, and saying otherwise
    here would be the mixed-mode drift the constitution forbids.
    """
    state = session_checklist.read_session_state(session_set_dir)
    if not isinstance(state, dict):
        return None
    for entry in state.get("sessions") or []:
        if isinstance(entry, dict) and entry.get("number") == number:
            status = entry.get("status")
            return str(status) if isinstance(status, str) else None
    return None


def project_session(session_set_dir: str, session_number: int) -> Dict[str, object]:
    """The projection for one session: steps, states, current, remaining.

    ``current`` is every step whose state is ``in-progress`` — read, not
    inferred. It is a LIST because two steps can genuinely be in flight,
    which the removed single-valued ``<- here`` marker could not
    represent, and because zero is a real answer (nothing started yet, or
    everything finished) that a single value had to fake.
    """
    rows = session_checklist.build_rows(session_set_dir, session_number)
    steps = [_step_from_row(row) for row in rows]
    return {
        "number": session_number,
        "status": _session_status(session_set_dir, session_number),
        "evidence": evidence_state(session_set_dir),
        "steps": steps,
        "counts": _counts(steps),
        "current": [s["stepKey"] for s in steps if s["state"] == "in-progress"],
        "remaining": [s["stepKey"] for s in steps if not s["isTerminal"]],
    }


# ---------------------------------------------------------------------------
# Serialization — the cache, and the digest that keeps it honest
# ---------------------------------------------------------------------------


def _digest(path: str) -> Optional[str]:
    """SHA-256 of *path*'s bytes, or ``None`` when it is not there.

    Bytes, not parsed content: the question is "did this input change",
    and a reformat that changes no values still changes what a consumer
    reading the raw file sees. ``None`` is recorded rather than omitted,
    so "this input was absent when the projection was built" is a
    positive claim that a later appearance contradicts.
    """
    try:
        with open(path, "rb") as fh:
            return hashlib.sha256(fh.read()).hexdigest()
    except OSError:
        return None


def input_digests(session_set_dir: str) -> Dict[str, Optional[str]]:
    """The digest of every input a projection of *session_set_dir* derives from."""
    return {
        name: _digest(os.path.join(session_set_dir, name))
        for name in INPUT_FILENAMES
    }


def _orphan_entries(session_set_dir: str) -> int:
    """Ledger entries no session can claim, and every reader hides today.

    An entry with no integer ``sessionNumber`` is filtered out by
    :func:`session_checklist.build_rows` — which is correct, since it
    belongs to no session — and is therefore rendered by nothing, in
    either language. That is a fourth thing absence hides, alongside
    ``unknown`` / ``unreadable`` / ``stale``: four such entries sit in Set
    028's log today (the absent-``status`` population Set 120 S2
    deliberately preserved), and nothing has ever said so.

    Reported as a COUNT at the top level rather than as rows, deliberately:
    inventing rows for entries that name no session would put the
    projection at odds with the renderer it must reproduce, and the
    parity proof would be the thing that broke. The count is beside the
    rows, not among them.
    """
    log = session_checklist.read_activity_log(session_set_dir)
    entries = (log or {}).get("entries")
    if not isinstance(entries, list):
        return 0
    return sum(
        1
        for e in entries
        if isinstance(e, dict)
        and not (
            isinstance(e.get("sessionNumber"), int)
            and not isinstance(e.get("sessionNumber"), bool)
        )
    )


def build_projection(session_set_dir: str) -> Dict[str, object]:
    """The whole projection for a session set, as a plain dict.

    Pure: reads, computes, returns. Nothing here writes, so a consumer
    that only wants the answer — the Work Explorer, a test, an
    orchestrator mid-session — cannot stale a verification stamp by
    asking for it.
    """
    return {
        "schemaVersion": PROJECTION_SCHEMA_VERSION,
        "derived": True,
        "regenerateWith": REGENERATE_COMMAND,
        "generatedAt": datetime.now().astimezone().isoformat(),
        "sessionSetDir": os.path.basename(os.path.normpath(session_set_dir)),
        "inputs": input_digests(session_set_dir),
        "orphanEntries": _orphan_entries(session_set_dir),
        "sessions": [
            project_session(session_set_dir, number)
            for number in _session_numbers(session_set_dir)
        ],
    }


def projection_path(session_set_dir: str) -> str:
    return os.path.join(session_set_dir, PROJECTION_FILENAME)


def read_projection(session_set_dir: str) -> Optional[dict]:
    """The serialized projection, or ``None`` when absent or unreadable.

    A projection whose ``schemaVersion`` this code does not know reads as
    ``None`` too. Guessing at an unknown shape is how a cache becomes a
    source: the honest answer is "regenerate it".
    """
    try:
        with open(projection_path(session_set_dir), "r", encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(data, dict):
        return None
    version = data.get("schemaVersion")
    if not isinstance(version, int) or version > PROJECTION_SCHEMA_VERSION:
        return None
    return data


def write_projection(session_set_dir: str) -> Optional[str]:
    """Serialize the projection beside its inputs; return the path written.

    Returns ``None`` on an I/O failure and never raises. This runs on the
    close path, and a derived cache that cannot be written must not take
    down a close that has already passed every gate — but the caller
    surfaces the skip by name (L-079-1: a fail-open branch around I/O
    must NAME the skip in operator-facing output).
    """
    payload = build_projection(session_set_dir)
    try:
        with open(
            projection_path(session_set_dir), "w", encoding="utf-8", newline="\n"
        ) as fh:
            json.dump(payload, fh, indent=2, ensure_ascii=True)
            fh.write("\n")
    except OSError:
        return None
    return projection_path(session_set_dir)


def projection_state(session_set_dir: str) -> str:
    """Is the serialized projection ``fresh``, ``stale``, absent or unreadable?

    The check that makes this a cache rather than a second source of
    truth. Every input's digest is compared with what the file recorded;
    any difference — including an input that has appeared or vanished
    since — is ``stale``.
    """
    data = read_projection(session_set_dir)
    if data is None:
        return (
            PROJECTION_UNREADABLE
            if os.path.isfile(projection_path(session_set_dir))
            else PROJECTION_ABSENT
        )
    recorded = data.get("inputs")
    if not isinstance(recorded, dict):
        return PROJECTION_STALE
    live = input_digests(session_set_dir)
    if set(recorded) != set(live):
        return PROJECTION_STALE
    return (
        PROJECTION_FRESH
        if all(recorded.get(k) == live[k] for k in live)
        else PROJECTION_STALE
    )


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="session_projection",
        description=(
            "Compute the session progress projection: one Python answer "
            "for a session set's steps, their states, what is in flight "
            "and what remains. Derived and regenerable -- a cache, never "
            "a source."
        ),
    )
    p.add_argument(
        "--session-set-dir",
        required=True,
        help="Session-set directory to project.",
    )
    p.add_argument(
        "--write",
        action="store_true",
        help=f"Serialize to {PROJECTION_FILENAME} beside the inputs.",
    )
    p.add_argument(
        "--check",
        action="store_true",
        help=(
            "Report whether the serialized projection still matches its "
            "inputs. Exit 0 fresh, 3 stale/absent/unreadable."
        ),
    )
    return p


def run(argv: Optional[Sequence[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    set_dir = args.session_set_dir
    if not os.path.isdir(set_dir):
        print(
            f"session_projection: not a directory: {set_dir}", file=sys.stderr
        )
        return 2

    if args.check:
        state = projection_state(set_dir)
        print(f"{PROJECTION_FILENAME}: {state}")
        if state != PROJECTION_FRESH:
            print(f"regenerate with: {REGENERATE_COMMAND}", file=sys.stderr)
            return 3
        return 0

    if args.write:
        written = write_projection(set_dir)
        if written is None:
            print(
                f"session_projection: could not write "
                f"{projection_path(set_dir)}; the projection was NOT "
                f"serialized",
                file=sys.stderr,
            )
            return 1
        print(f"wrote {written}")
        return 0

    print(json.dumps(build_projection(set_dir), indent=2, ensure_ascii=True))
    return 0


def main(argv: Optional[Sequence[str]] = None) -> int:
    return run(argv)


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())


__all__ = [
    "CLOSE_MANDATED_WRITES",
    "EVIDENCE_ABSENT",
    "EVIDENCE_READ",
    "EVIDENCE_UNREADABLE",
    "INPUT_FILENAMES",
    "PROJECTION_ABSENT",
    "PROJECTION_FILENAME",
    "PROJECTION_FRESH",
    "PROJECTION_SCHEMA_VERSION",
    "PROJECTION_STALE",
    "PROJECTION_UNREADABLE",
    "REGENERATE_COMMAND",
    "STEP_STATE_UNKNOWN",
    "build_projection",
    "evidence_state",
    "input_digests",
    "normalize_step_state",
    "project_session",
    "projection_path",
    "projection_state",
    "read_projection",
    "write_projection",
]
