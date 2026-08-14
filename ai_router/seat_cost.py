"""Seat cost: what it costs to RUN a session, kept separate from what ``route()`` spends.

**Who uses this:** the orchestrator at Step 10 (reporting cost), and
``disposition.cost``, whose block this module produces
(:meth:`CostReport.to_cost_block`).
**See also:** ``ai_router/docs/seat-cost.md`` (the three measurements and
the separation rule -- read that first); ``metrics.py`` (routed-call cost,
which this module does **not** redefine).

---

The one rule this module exists to enforce
------------------------------------------
**A cost report must say which measurement it is showing, and must name
the components it could not measure.** There is no single "the cost of a
session" number, and every surface that has pretended otherwise has been
wrong in this repo:

- ``metrics.print_metrics_report()`` printed ``Total cost: $0.0000`` on a
  Copilot seat while every row it summed carried
  ``billed_usage_unavailable: true``. The flag was right there and the
  report ignored it. Set 130 S3 wired it.
- ``session_log.get_cost_summary()`` sums ``routedApiCalls[].costUsd`` and
  returns it under the key ``total_cost``. It is routed-call cost only --
  correct arithmetic, a label that overclaims. Off the close path; left as
  a named residual rather than renamed under a session that could not
  re-verify every caller.

So this module never returns a bare number. It returns a
:class:`CostReport` of separately-labelled :class:`ComponentCost` values,
and a total exists **only** when every component in it was measured.

Why the absent answer is never ``$0.00``
----------------------------------------
A cost reader that returns zero when it cannot measure is fail-open, and
it is *worse* than reporting nothing, because zero looks like a
measurement (L-112-1). Every failure path here is a **named status**
carrying a reason, and :attr:`ComponentCost.credits` is ``None`` -- not
``0.0`` -- whenever the number is not known:

``measured``
    Exact. Every requested conversation was found in the store.
``lower_bound``
    Some requested conversations were found and some were not, **or** the
    caller declared the measurement live. The number is real and known to
    be incomplete. See *A session cannot measure itself* below.
``unknown``
    Nothing to measure from: an empty id set, or not one requested id is
    known to the store. Never ``0.0``.
``unavailable``
    The component is real but no measurement source is reachable -- no
    store file, or an engine that keeps no local usage store at all.
``schema_unrecognized``
    The store is there and does not look like what this module was
    written against. It refuses rather than multiplying by a stale
    constant.
``not_applicable``
    The component **cannot exist** in this configuration and legitimately
    contributes zero -- e.g. ``routed_api`` on a run that dispatched no
    Direct-API calls. This is the only status that contributes ``0.0`` to
    a total, and it is the caller who declares it by passing no ids for a
    component it knows to be empty.

``unavailable`` vs ``not_applicable`` is the whole fail-open question in
two words. Claude Code and Gemini have no local usage store, so an
orchestrator-seat cost incurred there is ``unavailable`` (real, unseen),
never ``not_applicable`` (cannot exist). Getting that backwards would
report someone else's spend as zero.

Why the read mode is spelled out, and never ``immutable=1``
-----------------------------------------------------------
The store is WAL-mode and live -- the CLI writing it is usually the same
process tree asking this question. ``immutable=1`` is the obvious choice
for a read-only adapter and it **skips the WAL entirely**, returning a
plausible smaller number with no error. Measured at one instant on
2026-08-14: ``mode=ro`` saw 17,036 events and 168.0 credits for the live
conversation; ``mode=ro&immutable=1`` saw 17,035 and 156.5. That is a
silent 7% undercount wearing a correct-looking answer, which is exactly
the failure this module is built to refuse. :data:`_READ_URI_TEMPLATE` is
the only place a connection string is built, and
``test_seat_cost.py`` plants an uncheckpointed row to prove it.

A session cannot measure itself
-------------------------------
The turns that author the disposition, run the close and write the number
are not in the store when the number is read. Set 118 Session 1 recorded
4,266.6 credits at close; the same conversation reads 4,743.2 today -- a
10% undercount, and nothing was wrong except that it was early. Pass
``live=True`` (or name the live conversation via ``live_session_ids``) and
the component comes back ``lower_bound`` rather than ``measured``, so the
label carries what the arithmetic cannot.

Attribution is by id, never by clock
------------------------------------
This module takes an explicit component -> conversation-id mapping and
never guesses. A time window cannot attribute: the wall-clock window of
Set 118 Session 1 also contains 1,277.2 credits of Set 129's conversation
and two of Set 129's routed children. ``sessions.created_at`` is no help
either -- it sits seconds from ``updated_at`` on a conversation whose
events span five hours, so spans must come from
``assistant_usage_events.created_at`` if they are needed at all.

Set 130 Session 2 is what makes the mapping automatic (recording
``COPILOT_AGENT_SESSION_ID`` at registration and the routed child's
``sessionId`` on each metrics row), and Session 3's
:func:`session_conversation_ids` / :func:`measure_session` read exactly
those two records back. ``--session-set-dir`` on this module's CLI is that
path end to end; ``--self`` remains for a conversation nothing recorded.
"""

from __future__ import annotations

import argparse
import os
import sqlite3
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, Mapping, Optional, Sequence

# --- The unit -------------------------------------------------------------
# SUM(total_nano_aiu) / 1e9 = AI credits; credits / 100 = US dollars. The
# unit is INFERRED from an undocumented store and corroborated once, against
# an operator "/usage" screenshot taken mid-Set-118 (3,895 credits at the
# time of the screenshot, 4,266.6 at that session's close). Stated here
# rather than in a comment at a call site because it is the single
# assumption every number this module produces rests on.
NANO_AIU_PER_CREDIT = 1_000_000_000
CREDITS_PER_USD = 100.0

# --- Components -----------------------------------------------------------
COMPONENT_ORCHESTRATOR_SEAT = "orchestrator_seat"
COMPONENT_ROUTED_SEAT = "routed_seat"
COMPONENT_ROUTED_API = "routed_api"

#: Declaration order, which is also render order.
COMPONENTS = (
    COMPONENT_ORCHESTRATOR_SEAT,
    COMPONENT_ROUTED_SEAT,
    COMPONENT_ROUTED_API,
)

COMPONENT_LABELS = {
    COMPONENT_ORCHESTRATOR_SEAT: "orchestrator seat (running the session)",
    COMPONENT_ROUTED_SEAT: "routed calls (Copilot CLI transport)",
    COMPONENT_ROUTED_API: "routed calls (Direct APIs, priced)",
}

# --- When the measurement was taken ---------------------------------------
#: Taken by the session that is closing, about itself. Its own closing turns
#: are not in the store yet, so such a figure is a FLOOR and never exact --
#: see *A session cannot measure itself* above. ``disposition.cost`` carries
#: this label so a later reader can tell a floor from a final number.
MEASURED_AT_CLOSE = "close"

#: Taken after the fact, about a session that has finished. Exact, provided
#: every conversation is in the store.
MEASURED_AT_RETROSPECTIVE = "retrospective"

MEASURED_AT_VALUES = (MEASURED_AT_CLOSE, MEASURED_AT_RETROSPECTIVE)

# --- Statuses -------------------------------------------------------------
STATUS_MEASURED = "measured"
STATUS_LOWER_BOUND = "lower_bound"
STATUS_UNKNOWN = "unknown"
STATUS_UNAVAILABLE = "unavailable"
STATUS_SCHEMA_UNRECOGNIZED = "schema_unrecognized"
STATUS_NOT_APPLICABLE = "not_applicable"

#: The whole closed vocabulary, in the order the doc's table lists it. This
#: tuple is the ONE definition: ``disposition.cost`` validates against it and
#: ``disposition.schema.json`` mirrors it, so a status can never mean one
#: thing here and another in the artifact that carries it (L-069-1).
STATUSES = (
    STATUS_MEASURED,
    STATUS_LOWER_BOUND,
    STATUS_UNKNOWN,
    STATUS_UNAVAILABLE,
    STATUS_SCHEMA_UNRECOGNIZED,
    STATUS_NOT_APPLICABLE,
)

#: Statuses that carry a number. Everything else has ``credits is None``.
NUMERIC_STATUSES = frozenset({STATUS_MEASURED, STATUS_LOWER_BOUND, STATUS_NOT_APPLICABLE})

#: The complement, named because it is what every anti-``$0.00`` rule keys
#: off: a component with one of these statuses carries ``credits: null``, and
#: a total containing one does not exist.
NON_NUMERIC_STATUSES = frozenset(STATUSES) - NUMERIC_STATUSES

# --- Store shape ----------------------------------------------------------
#: Schema versions this module has been read against. A store reporting
#: anything else is refused (``schema_unrecognized``) rather than assumed
#: compatible -- the columns are a private store's and can change without
#: notice.
SUPPORTED_SCHEMA_VERSIONS = (6,)

USAGE_TABLE = "assistant_usage_events"
SESSIONS_TABLE = "sessions"

#: The columns this module actually reads. Deliberately the minimum: a
#: store that grows columns stays supported, one that loses or renames any
#: of these does not.
REQUIRED_USAGE_COLUMNS = frozenset({"session_id", "total_nano_aiu"})

DEFAULT_STORE_RELPATH = Path(".copilot") / "session-store.db"

#: Engines that keep a local per-turn usage store. Everything else gets
#: ``unavailable``, never ``not_applicable`` -- see the module docstring.
ENGINES_WITH_USAGE_STORE = frozenset({"github-copilot", "copilot"})

#: The environment variable the Copilot CLI exports into every child
#: process, carrying the id of the conversation that spawned it.
SEAT_SESSION_ID_ENV = "COPILOT_AGENT_SESSION_ID"

# NEVER add "&immutable=1" here. See the module docstring: it skips the WAL
# and silently undercounts a live store.
_READ_URI_TEMPLATE = "file:{path}?mode=ro"

#: SQLite's default parameter ceiling is 999 on older builds; chunk well
#: under it so a caller with a long id list cannot trip a driver error.
_ID_CHUNK = 400


class StoreShapeError(Exception):
    """The store is present but is not shaped the way this module expects."""


class StoreUnavailableError(Exception):
    """No store file could be opened."""


@dataclass(frozen=True)
class StoreShape:
    """The result of looking at a store before trusting it."""

    ok: bool
    path: Optional[Path] = None
    schema_version: Optional[int] = None
    reason: Optional[str] = None

    def raise_if_bad(self) -> None:
        if self.ok:
            return
        if self.path is None:
            raise StoreUnavailableError(self.reason or "no store file")
        raise StoreShapeError(self.reason or "unrecognized store shape")


@dataclass(frozen=True)
class ComponentCost:
    """One separately-labelled component of a session's cost.

    ``credits`` and ``usd`` are ``None`` for every non-numeric status. They
    are never ``0.0`` to mean "we could not tell" -- that distinction is the
    entire point of this dataclass.
    """

    component: str
    status: str
    credits: Optional[float] = None
    event_count: int = 0
    session_ids: tuple = ()
    measured_session_ids: tuple = ()
    unmeasured_session_ids: tuple = ()
    reason: Optional[str] = None

    @property
    def usd(self) -> Optional[float]:
        if self.credits is None:
            return None
        return self.credits / CREDITS_PER_USD

    @property
    def is_numeric(self) -> bool:
        return self.status in NUMERIC_STATUSES

    @property
    def is_exact(self) -> bool:
        return self.status in (STATUS_MEASURED, STATUS_NOT_APPLICABLE)

    @property
    def label(self) -> str:
        return COMPONENT_LABELS.get(self.component, self.component)

    def to_dict(self) -> dict:
        return {
            "component": self.component,
            "status": self.status,
            "credits": self.credits,
            "usd": self.usd,
            "event_count": self.event_count,
            "session_ids": list(self.session_ids),
            "measured_session_ids": list(self.measured_session_ids),
            "unmeasured_session_ids": list(self.unmeasured_session_ids),
            "reason": self.reason,
        }


@dataclass(frozen=True)
class CostReport:
    """A component-separated cost report.

    There is no unconditional total. :attr:`total_credits` is ``None``
    whenever any component failed to measure, because a total that quietly
    drops an unmeasured component is the same fail-open defect as returning
    ``$0.00`` -- one addition further along.
    """

    components: tuple = ()
    store_path: Optional[str] = None
    schema_version: Optional[int] = None

    def get(self, component: str) -> Optional[ComponentCost]:
        for item in self.components:
            if item.component == component:
                return item
        return None

    @property
    def unmeasured(self) -> tuple:
        """Components carrying no number, in declaration order."""
        return tuple(c for c in self.components if not c.is_numeric)

    @property
    def is_complete(self) -> bool:
        """True when every component is exact -- the only case with a total."""
        return bool(self.components) and all(c.is_exact for c in self.components)

    @property
    def is_lower_bound(self) -> bool:
        """True when every component carries a number but at least one is partial."""
        return (
            bool(self.components)
            and all(c.is_numeric for c in self.components)
            and not self.is_complete
        )

    @property
    def total_credits(self) -> Optional[float]:
        if not self.components or self.unmeasured:
            return None
        return sum(c.credits or 0.0 for c in self.components)

    @property
    def total_usd(self) -> Optional[float]:
        total = self.total_credits
        if total is None:
            return None
        return total / CREDITS_PER_USD

    @property
    def total_status(self) -> str:
        """How a renderer must label the total: exact, a floor, or absent."""
        if self.is_complete:
            return STATUS_MEASURED
        if self.is_lower_bound:
            return STATUS_LOWER_BOUND
        return STATUS_UNKNOWN

    def to_dict(self) -> dict:
        return {
            "store_path": self.store_path,
            "schema_version": self.schema_version,
            "components": [c.to_dict() for c in self.components],
            "total_status": self.total_status,
            "total_credits": self.total_credits,
            "total_usd": self.total_usd,
            "unmeasured": [c.component for c in self.unmeasured],
        }

    def to_cost_block(self, measured_at: str) -> dict:
        """Render this report as the ``disposition.cost`` block.

        Two deliberate differences from :meth:`to_dict`:

        * ``store_path`` is **dropped**. It is an absolute path on one
          operator's machine and the disposition is a committed artifact;
          ``metrics.py`` learned the same lesson when mixed absolute
          ``session_set`` values leaked machine paths into the log.
          ``store_schema_version`` is what a later reader actually needs.
        * ``measured_at`` is **added**, because the number's meaning depends
          on it: a figure taken at close is a floor (T5), and nothing in the
          arithmetic says so.

        Raises ``ValueError`` on an unknown *measured_at* -- the vocabulary
        is closed, and a label nobody can interpret does this field's only
        job worse than no label.
        """
        if measured_at not in MEASURED_AT_VALUES:
            raise ValueError(
                f"measured_at must be one of {list(MEASURED_AT_VALUES)} "
                f"(got {measured_at!r})"
            )
        block = self.to_dict()
        block.pop("store_path", None)
        block["store_schema_version"] = block.pop("schema_version", None)
        block["measured_at"] = measured_at
        return block


# --------------------------------------------------------------------------
# Resolving and validating the store
# --------------------------------------------------------------------------


def resolve_store_path(
    explicit: Optional[str] = None,
    *,
    home: Optional[str] = None,
) -> Optional[Path]:
    """Locate the local usage store, or ``None`` if there is not one.

    ``explicit`` wins; otherwise ``<home>/.copilot/session-store.db``. A
    path that does not exist resolves to ``None`` rather than to a Path
    that will fail later -- callers branch on presence, not on open errors.
    """
    if explicit:
        candidate = Path(explicit).expanduser()
        return candidate if candidate.is_file() else None
    base = Path(home).expanduser() if home else Path.home()
    candidate = base / DEFAULT_STORE_RELPATH
    return candidate if candidate.is_file() else None


def _connect(path: Path) -> sqlite3.Connection:
    # mode=ro and NOTHING else. See the module docstring on immutable=1.
    uri = _READ_URI_TEMPLATE.format(path=path.as_posix())
    return sqlite3.connect(uri, uri=True)


def check_store_shape(path: Optional[Path]) -> StoreShape:
    """Look at the store BEFORE trusting a single number out of it.

    Checks, in order: the file is openable; ``schema_version`` reports a
    version this module has been read against; the usage table exists; the
    columns actually read are present. Any failure names itself.
    """
    if path is None:
        return StoreShape(ok=False, reason="no local usage store found")
    try:
        conn = _connect(path)
    except sqlite3.Error as exc:
        return StoreShape(ok=False, reason=f"store could not be opened: {exc}")
    try:
        try:
            row = conn.execute("SELECT version FROM schema_version").fetchone()
        except sqlite3.Error:
            # Older/other stores may not carry the column name we expect.
            try:
                row = conn.execute("SELECT * FROM schema_version").fetchone()
            except sqlite3.Error as exc:
                return StoreShape(
                    ok=False, path=path,
                    reason=f"store has no readable schema_version: {exc}",
                )
        version = None
        if row is not None and len(row) >= 1:
            try:
                version = int(row[0])
            except (TypeError, ValueError):
                version = None
        if version is None:
            return StoreShape(
                ok=False, path=path,
                reason="store reported no usable schema_version",
            )
        if version not in SUPPORTED_SCHEMA_VERSIONS:
            supported = ", ".join(str(v) for v in SUPPORTED_SCHEMA_VERSIONS)
            return StoreShape(
                ok=False, path=path, schema_version=version,
                reason=(
                    f"store schema_version {version} is not one this reader "
                    f"has been verified against ({supported}); refusing to "
                    "price against a shape it may no longer have"
                ),
            )
        try:
            columns = {
                r[1] for r in conn.execute(f"PRAGMA table_info({USAGE_TABLE})")
            }
        except sqlite3.Error as exc:
            return StoreShape(
                ok=False, path=path, schema_version=version,
                reason=f"store has no readable {USAGE_TABLE}: {exc}",
            )
        if not columns:
            return StoreShape(
                ok=False, path=path, schema_version=version,
                reason=f"store has no {USAGE_TABLE} table",
            )
        missing = REQUIRED_USAGE_COLUMNS - columns
        if missing:
            return StoreShape(
                ok=False, path=path, schema_version=version,
                reason=(
                    f"{USAGE_TABLE} is missing column(s) "
                    f"{', '.join(sorted(missing))}"
                ),
            )
        return StoreShape(ok=True, path=path, schema_version=version)
    finally:
        conn.close()


# --------------------------------------------------------------------------
# Measuring
# --------------------------------------------------------------------------


def engine_has_usage_store(engine: Optional[str]) -> bool:
    """True for engines that keep a local per-turn usage store.

    A false answer is ``unavailable``, never ``not_applicable``: the cost
    is real on those engines, it just cannot be seen from here.
    """
    if not engine:
        return False
    return engine.strip().lower() in ENGINES_WITH_USAGE_STORE


def _chunks(items: Sequence[str], size: int) -> Iterable[Sequence[str]]:
    for start in range(0, len(items), size):
        yield items[start:start + size]


def _sum_by_session(conn: sqlite3.Connection, ids: Sequence[str]) -> tuple[dict, set]:
    """Return per-id (nano, events) sums and the set of ids the store knows.

    "Knows" deliberately includes a conversation present in ``sessions``
    with no usage rows at all: that is a genuine zero, not an absence, and
    conflating the two would let a real 0 read as ``unknown``.
    """
    sums: dict = {}
    known: set = set()
    for chunk in _chunks(list(ids), _ID_CHUNK):
        marks = ",".join("?" for _ in chunk)
        rows = conn.execute(
            f"SELECT session_id, COALESCE(SUM(total_nano_aiu), 0), COUNT(*) "
            f"FROM {USAGE_TABLE} WHERE session_id IN ({marks}) "
            f"GROUP BY session_id",
            tuple(chunk),
        ).fetchall()
        for session_id, nano, count in rows:
            sums[session_id] = (int(nano or 0), int(count or 0))
            known.add(session_id)
        try:
            present = conn.execute(
                f"SELECT id FROM {SESSIONS_TABLE} WHERE id IN ({marks})",
                tuple(chunk),
            ).fetchall()
        except sqlite3.Error:
            present = []
        for (session_id,) in present:
            known.add(session_id)
    return sums, known


def _normalize_ids(value) -> tuple:
    if value is None:
        return ()
    if isinstance(value, str):
        value = [value]
    seen: list = []
    for item in value:
        if item is None:
            continue
        text = str(item).strip()
        if text and text not in seen:
            seen.append(text)
    return tuple(seen)


def _failed_component(component: str, status: str, ids: tuple, reason: str) -> ComponentCost:
    return ComponentCost(
        component=component, status=status, credits=None,
        session_ids=ids, unmeasured_session_ids=ids, reason=reason,
    )


def measure(
    components: Mapping[str, Sequence[str]],
    *,
    store_path: Optional[str] = None,
    home: Optional[str] = None,
    engine: Optional[str] = None,
    live_session_ids: Optional[Sequence[str]] = None,
    not_applicable: Optional[Sequence[str]] = None,
) -> CostReport:
    """Price an explicit component -> conversation-id mapping.

    ``components`` maps a component name to the store conversation ids that
    belong to it. Ids are never guessed and never derived from a clock.

    ``not_applicable`` names components the caller knows cannot exist in
    this configuration (e.g. ``routed_api`` on a pure Copilot seat); those
    contribute an honest ``0.0``. Naming a component in **neither** mapping
    leaves it out of the report entirely, which is different again from
    both -- a report only speaks about what it was asked about.

    ``live_session_ids`` names conversations still in flight, whose closing
    turns are not in the store yet; any component containing one comes back
    ``lower_bound``.
    """
    requested = {
        name: _normalize_ids(ids) for name, ids in (components or {}).items()
    }
    na = set(not_applicable or ())
    for name in na:
        requested.setdefault(name, ())
    live = set(_normalize_ids(live_session_ids))

    ordered = [c for c in COMPONENTS if c in requested]
    ordered += [c for c in requested if c not in COMPONENTS]

    def _all_failed(status: str, reason: str) -> CostReport:
        built = []
        for name in ordered:
            if name in na and not requested[name]:
                built.append(ComponentCost(
                    component=name, status=STATUS_NOT_APPLICABLE, credits=0.0,
                    reason="declared not applicable by the caller",
                ))
                continue
            built.append(_failed_component(name, status, requested[name], reason))
        return CostReport(components=tuple(built))

    if engine is not None and not engine_has_usage_store(engine):
        return _all_failed(
            STATUS_UNAVAILABLE,
            f"engine '{engine}' keeps no local usage store; this cost is "
            "real but cannot be measured from here",
        )

    path = resolve_store_path(store_path, home=home)
    shape = check_store_shape(path)
    if not shape.ok:
        status = (
            STATUS_UNAVAILABLE if shape.path is None else STATUS_SCHEMA_UNRECOGNIZED
        )
        return _all_failed(status, shape.reason or "store unusable")

    assert shape.path is not None
    conn = _connect(shape.path)
    try:
        built = []
        for name in ordered:
            ids = requested[name]
            if not ids:
                if name in na:
                    built.append(ComponentCost(
                        component=name, status=STATUS_NOT_APPLICABLE, credits=0.0,
                        reason="declared not applicable by the caller",
                    ))
                else:
                    built.append(ComponentCost(
                        component=name, status=STATUS_UNKNOWN, credits=None,
                        reason=(
                            "no conversation ids supplied; nothing to measure "
                            "(this is not zero)"
                        ),
                    ))
                continue

            sums, known = _sum_by_session(conn, ids)
            measured = tuple(i for i in ids if i in known)
            unmeasured = tuple(i for i in ids if i not in known)

            if not measured:
                built.append(ComponentCost(
                    component=name, status=STATUS_UNKNOWN, credits=None,
                    session_ids=ids, unmeasured_session_ids=unmeasured,
                    reason=(
                        "the store has never heard of any supplied conversation "
                        "id; absent is not zero"
                    ),
                ))
                continue

            nano = sum(sums.get(i, (0, 0))[0] for i in measured)
            events = sum(sums.get(i, (0, 0))[1] for i in measured)
            credits = nano / NANO_AIU_PER_CREDIT

            reason = None
            status = STATUS_MEASURED
            if unmeasured:
                status = STATUS_LOWER_BOUND
                reason = (
                    f"{len(unmeasured)} of {len(ids)} conversation(s) are not in "
                    "the store; the number below is a floor"
                )
            elif live & set(ids):
                status = STATUS_LOWER_BOUND
                reason = (
                    "a conversation in this component is still in flight; its "
                    "closing turns are not in the store yet, so this is a floor"
                )

            built.append(ComponentCost(
                component=name, status=status, credits=credits,
                event_count=events, session_ids=ids,
                measured_session_ids=measured, unmeasured_session_ids=unmeasured,
                reason=reason,
            ))
        return CostReport(
            components=tuple(built),
            store_path=str(shape.path),
            schema_version=shape.schema_version,
        )
    finally:
        conn.close()


def seat_session_id_from_env(env: Optional[Mapping[str, str]] = None) -> Optional[str]:
    """The orchestrator's own conversation id, or ``None`` off a seat."""
    source = os.environ if env is None else env
    value = (source.get(SEAT_SESSION_ID_ENV) or "").strip()
    return value or None


# --------------------------------------------------------------------------
# Assembling one workflow session's ids from what Set 130 Session 2 records
# --------------------------------------------------------------------------


def _session_entry(state: object, session_number: Optional[int]) -> Optional[dict]:
    """The v4 ``sessions[]`` entry for *session_number*, or the in-flight one."""
    if not isinstance(state, dict):
        return None
    entries = [e for e in (state.get("sessions") or []) if isinstance(e, dict)]
    if session_number is not None:
        for entry in entries:
            if entry.get("number") == session_number:
                return entry
        return None
    for entry in entries:
        if entry.get("status") == "in-progress":
            return entry
    for entry in reversed(entries):
        if entry.get("status") == "complete":
            return entry
    return None


def session_conversation_ids(
    session_set_dir: str,
    session_number: Optional[int] = None,
    *,
    include_self: bool = False,
    env: Optional[Mapping[str, str]] = None,
    metrics_config: Optional[dict] = None,
    metrics_records: Optional[Sequence[dict]] = None,
) -> dict:
    """Gather one workflow session's conversation ids from the repo's records.

    This is the join Sets 130 S1 and S2 exist to make possible, and it reads
    only what a **sanctioned writer** put on disk:

    * ``orchestrator_seat`` <- ``session-state.json``'s per-session
      ``orchestrator.seatSessionIds`` (written by ``start_session``,
      accumulating across context resets).
    * ``routed_seat`` <- ``router-metrics.jsonl``'s ``transport_session_id``
      on the rows belonging to this set and session number.

    Nothing here guesses, and nothing here uses a clock: a wall-clock window
    around one session contains other sessions' conversations, so a
    time-based reconstruction bills them to the wrong set (see the module
    docstring). An id that was never recorded stays missing, which downstream
    becomes ``unknown`` or ``lower_bound`` -- never a zero.

    ``include_self`` adds the calling process's own conversation
    (``COPILOT_AGENT_SESSION_ID``) to ``orchestrator_seat``. Set it when
    measuring live at close: the conversation running the close is the one
    conversation guaranteed to be mid-flight, and if a context reset started
    it without a re-register it is not in ``seatSessionIds`` at all.

    Returns ``{"orchestrator_seat": [...], "routed_seat": [...],
    "live": [...]}`` -- ``live`` naming the ids whose closing turns are not
    in the store yet.
    """
    state_path = Path(session_set_dir) / "session-state.json"
    state: object = None
    if state_path.is_file():
        try:
            import json as _json

            state = _json.loads(state_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            state = None

    entry = _session_entry(state, session_number)
    orchestrator = ()
    if isinstance(entry, dict):
        block = entry.get("orchestrator")
        if isinstance(block, dict):
            orchestrator = _normalize_ids(block.get("seatSessionIds"))

    live: list = []
    if include_self:
        own = seat_session_id_from_env(env)
        if own:
            live.append(own)
            if own not in orchestrator:
                orchestrator = orchestrator + (own,)

    number = session_number
    if number is None and isinstance(entry, dict) and isinstance(entry.get("number"), int):
        number = entry["number"]

    try:
        from .metrics import (  # type: ignore[import-not-found]
            load_metrics,
            priced_and_unpriced,
            transport_session_ids,
        )
    except ImportError:  # pragma: no cover - bare/test context
        from metrics import (  # type: ignore[no-redef]
            load_metrics,
            priced_and_unpriced,
            transport_session_ids,
        )

    records = (
        list(metrics_records)
        if metrics_records is not None
        else load_metrics(metrics_config or {})
    )
    routed = transport_session_ids(
        session_set_dir,
        number,
        config=metrics_config,
        records=records,
    )

    # Whether this session dispatched any Direct-API routed call, read off
    # the same log rather than asked of the caller. A flag would be a claim
    # about the transport; this is the record of what the transport did.
    try:
        from .metrics import _session_set_name  # type: ignore[import-not-found]
    except ImportError:  # pragma: no cover - bare/test context
        from metrics import _session_set_name  # type: ignore[no-redef]
    wanted = _session_set_name(session_set_dir)
    session_rows = [
        r for r in records
        if isinstance(r, dict)
        and _session_set_name(r.get("session_set")) == wanted
        and (number is None or r.get("session_number") == number)
    ]
    priced_rows, unpriced_rows = priced_and_unpriced(session_rows)
    priced_api_calls = len(priced_rows)
    seat_calls = len(unpriced_rows)

    return {
        COMPONENT_ORCHESTRATOR_SEAT: list(orchestrator),
        COMPONENT_ROUTED_SEAT: list(routed),
        "live": live,
        "priced_api_calls": priced_api_calls,
        "seat_calls": seat_calls,
    }


def measure_session(
    session_set_dir: str,
    session_number: Optional[int] = None,
    *,
    live: bool = True,
    engine: Optional[str] = None,
    store_path: Optional[str] = None,
    home: Optional[str] = None,
    env: Optional[Mapping[str, str]] = None,
    metrics_config: Optional[dict] = None,
    metrics_records: Optional[Sequence[dict]] = None,
    routed_api_not_applicable: Optional[bool] = None,
) -> CostReport:
    """Price one workflow session from its own recorded ids.

    The whole chain in one call: gather (:func:`session_conversation_ids`),
    then price (:func:`measure`). ``live=True`` is the close-time reading
    and marks the calling conversation in-flight, so the component comes
    back ``lower_bound`` rather than claiming an exactness a session cannot
    have about itself (T5). ``live=False`` is the retrospective reading.

    ``routed_api_not_applicable`` defaults to ``None``, meaning **derive it
    from the record**, and ``routed_seat`` is always derived the same way.
    The log says whether a call happened; the ids say whether it can be
    priced. So: no call dispatched → ``not_applicable``, an honest zero
    that lets a total exist. Calls dispatched with no ids captured →
    ``unknown``, because that spend is real. Fewer ids than calls →
    ``lower_bound``. A session that made priced Direct-API calls gets
    ``unavailable`` with a reason: that cost is real and authoritative, and
    it is denominated in dollars in ``router-metrics.jsonl`` while
    everything here is denominated in AI credits. Adding it would be a unit
    error, and claiming ``not_applicable`` for it would report someone's
    spend as zero.

    Deriving rather than taking a flag is the module's own rule applied to
    itself: attribution comes from records. ``True``/``False`` remain
    available for a caller who knows better than the log.
    """
    ids = session_conversation_ids(
        session_set_dir,
        session_number,
        include_self=live,
        env=env,
        metrics_config=metrics_config,
        metrics_records=metrics_records,
    )
    seat_calls = ids["seat_calls"]
    routed_ids = ids[COMPONENT_ROUTED_SEAT]

    components = {COMPONENT_ORCHESTRATOR_SEAT: ids[COMPONENT_ORCHESTRATOR_SEAT]}
    not_applicable = []

    # Both routed components resolve the same way: the log says whether the
    # call happened, the ids say whether it can be priced. "No call was
    # dispatched" is an honest zero; "calls happened and their ids were
    # never captured" is UNKNOWN. Deciding either from a flag would be a
    # claim about the transport instead of a record of what it did.
    if routed_ids or seat_calls:
        components[COMPONENT_ROUTED_SEAT] = routed_ids
    else:
        not_applicable.append(COMPONENT_ROUTED_SEAT)

    if routed_api_not_applicable is None:
        routed_api_not_applicable = ids["priced_api_calls"] == 0
    if routed_api_not_applicable:
        not_applicable.append(COMPONENT_ROUTED_API)
    else:
        components[COMPONENT_ROUTED_API] = []

    report = measure(
        components,
        store_path=store_path,
        home=home,
        engine=engine,
        live_session_ids=ids["live"],
        not_applicable=not_applicable,
    )

    rebuilt = []
    for item in report.components:
        if (
            item.component == COMPONENT_ROUTED_API
            and not routed_api_not_applicable
            and not item.is_numeric
        ):
            # Real, authoritative elsewhere, and denominated in dollars
            # while everything here is denominated in AI credits. Saying so
            # beats the bare "no ids supplied", which reads as an omission.
            rebuilt.append(ComponentCost(
                component=item.component,
                status=STATUS_UNAVAILABLE,
                credits=None,
                reason=(
                    f"{ids['priced_api_calls']} Direct-API call(s) are "
                    "recorded for this session; their cost is authoritative "
                    "in router-metrics.jsonl (cost_usd, in dollars) and is "
                    "not restated here in AI credits"
                ),
            ))
        elif (
            item.component == COMPONENT_ROUTED_SEAT
            and item.status == STATUS_MEASURED
            and seat_calls > len(item.measured_session_ids)
        ):
            # Priced every id we hold, and the log says there were more
            # calls than ids. measure() cannot see that -- it only knows
            # about ids it was handed -- so the floor has to be declared
            # here or a partial capture would read as a complete count.
            rebuilt.append(ComponentCost(
                component=item.component,
                status=STATUS_LOWER_BOUND,
                credits=item.credits,
                event_count=item.event_count,
                session_ids=item.session_ids,
                measured_session_ids=item.measured_session_ids,
                unmeasured_session_ids=item.unmeasured_session_ids,
                reason=(
                    f"{seat_calls} routed call(s) are recorded for this "
                    f"session and only {len(item.measured_session_ids)} "
                    "carry a conversation id (rows written before Set 130 "
                    "Session 2 carry none); the number below is a floor"
                ),
            ))
        elif (
            item.component == COMPONENT_ROUTED_SEAT
            and item.status == STATUS_UNKNOWN
            and seat_calls
        ):
            rebuilt.append(ComponentCost(
                component=item.component,
                status=STATUS_UNKNOWN,
                credits=None,
                session_ids=item.session_ids,
                unmeasured_session_ids=item.unmeasured_session_ids,
                reason=(
                    f"{seat_calls} routed call(s) are recorded for this "
                    "session and none carries a conversation id; the spend "
                    "is real and cannot be attributed (this is not zero)"
                ),
            ))
        else:
            rebuilt.append(item)
    return CostReport(
        components=tuple(rebuilt),
        store_path=report.store_path,
        schema_version=report.schema_version,
    )


# --------------------------------------------------------------------------
# Rendering (ASCII only -- project-guidance Code Style)
# --------------------------------------------------------------------------


def format_report(report: CostReport) -> str:
    """Render a component-separated report. Never prints a bare total."""
    lines = []
    lines.append("Session cost, by component")
    lines.append("=" * 62)
    if report.store_path:
        lines.append(f"store:  {report.store_path} (schema v{report.schema_version})")
    lines.append("")
    lines.append(f"  {'component':<40} {'credits':>10} {'USD':>9}")
    lines.append(f"  {'-' * 40} {'-' * 10} {'-' * 9}")
    for item in report.components:
        if item.credits is None:
            credits_text, usd_text = "-", "-"
        else:
            credits_text = f"{item.credits:,.1f}"
            usd_text = f"${item.usd:,.2f}"
        lines.append(f"  {item.label:<40} {credits_text:>10} {usd_text:>9}")
        marker = {
            STATUS_MEASURED: "measured",
            STATUS_LOWER_BOUND: "LOWER BOUND",
            STATUS_UNKNOWN: "UNKNOWN",
            STATUS_UNAVAILABLE: "UNAVAILABLE",
            STATUS_SCHEMA_UNRECOGNIZED: "SCHEMA UNRECOGNIZED",
            STATUS_NOT_APPLICABLE: "not applicable",
        }.get(item.status, item.status)
        detail = f"    [{marker}]"
        if item.event_count:
            detail += f" {item.event_count} turn(s)"
        lines.append(detail)
        if item.reason:
            lines.append(f"      {item.reason}")
    lines.append("")
    if report.total_credits is None:
        lines.append("  TOTAL: not available -- these component(s) were not measured:")
        for item in report.unmeasured:
            lines.append(f"    - {item.label}: {item.status}")
        lines.append(
            "  A total that dropped them would report unmeasured spend as zero."
        )
    else:
        prefix = "TOTAL" if report.is_complete else "TOTAL (LOWER BOUND)"
        lines.append(
            f"  {prefix}: {report.total_credits:,.1f} credits "
            f"= ${report.total_usd:,.2f}"
        )
        if report.is_lower_bound:
            lines.append(
                "  At least one component is a floor; the true figure is higher."
            )
    return "\n".join(lines)


def format_cost_block(block: object) -> list:
    """Render a ``disposition.cost`` block as ASCII lines.

    Takes the serialized block rather than a :class:`CostReport` so every
    consumer of the recorded artifact -- the close-out output today, any
    later reader -- renders the same record the same way, instead of each
    growing its own opinion about how to display an unknown (L-069-1).

    **Rendering is driven by ``status``, never by the presence of a
    number.** A block that reaches this function has been on disk, where a
    hand edit or an older producer can leave ``status: "unknown"`` beside
    ``credits: 0.0``. Deciding from ``credits is not None`` would print
    ``$0.00`` for that component -- the exact plausible wrong number this
    module exists to refuse, arriving through the one door the authoring
    validator does not guard. The status wins: a non-numeric component
    renders as unmeasured whatever number is sitting next to it, and a
    report containing one has no total regardless of what ``total_credits``
    claims.
    """
    if not isinstance(block, dict):
        return ["cost block is malformed; nothing can be reported from it"]
    lines: list = []
    measured_at = block.get("measured_at")
    if measured_at == MEASURED_AT_CLOSE:
        lines.append(
            "measured at close -- a floor: this session's closing turns are "
            "not in the store yet"
        )
    elif measured_at == MEASURED_AT_RETROSPECTIVE:
        lines.append("measured retrospectively")
    unmeasured: list = []
    for item in block.get("components") or []:
        if not isinstance(item, dict):
            lines.append("a component entry is malformed: UNKNOWN")
            unmeasured.append("(malformed entry)")
            continue
        name = item.get("component")
        label = COMPONENT_LABELS.get(name, str(name))
        status = str(item.get("status"))
        credits = item.get("credits")
        numeric = status in NUMERIC_STATUSES and isinstance(credits, (int, float))
        if not numeric:
            lines.append(f"{label}: {status.upper()}")
            unmeasured.append(str(name))
            if status in NUMERIC_STATUSES:
                lines.append(
                    "  status claims a number and none is recorded; refusing "
                    "to report a figure this block does not carry"
                )
            elif credits is not None:
                lines.append(
                    f"  a number ({credits!r}) is recorded beside a status "
                    "that means it was not measured; the status wins"
                )
        else:
            usd = item.get("usd")
            usd_text = (
                f"${usd:,.2f}" if isinstance(usd, (int, float))
                else f"${credits / CREDITS_PER_USD:,.2f}"
            )
            lines.append(
                f"{label}: {credits:,.1f} credits = {usd_text} [{status}]"
            )
        reason = item.get("reason")
        if reason:
            lines.append(f"  {reason}")
    total_credits = block.get("total_credits")
    if unmeasured or not isinstance(total_credits, (int, float)):
        declared = [str(c) for c in (block.get("unmeasured") or [])]
        named = unmeasured or declared
        lines.append(
            "TOTAL: not available -- not measured: "
            + (", ".join(named) if named else "see above")
        )
        lines.append(
            "  a total dropping them would report unmeasured spend as zero"
        )
    else:
        total_usd = block.get("total_usd")
        usd_text = (
            f"${total_usd:,.2f}" if isinstance(total_usd, (int, float))
            else f"${total_credits / CREDITS_PER_USD:,.2f}"
        )
        prefix = (
            "TOTAL"
            if block.get("total_status") == STATUS_MEASURED
            else "TOTAL (LOWER BOUND)"
        )
        lines.append(f"{prefix}: {total_credits:,.1f} credits = {usd_text}")
    return lines


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="seat_cost",
        description=(
            "Report a session's cost separated into orchestrator-seat cost "
            "and routed-call cost. Attribution is by conversation id, never "
            "by clock. An unmeasured component reports UNKNOWN, never $0.00."
        ),
    )
    parser.add_argument(
        "--orchestrator", action="append", default=[], metavar="ID",
        help=(
            "A store conversation id for the orchestrator running the "
            "session. Repeatable: a context reset starts a new conversation "
            "on the same workflow session."
        ),
    )
    parser.add_argument(
        "--self", dest="use_self", action="store_true",
        help=(
            f"Add this process's own orchestrator conversation, read from "
            f"{SEAT_SESSION_ID_ENV}. Implies the measurement is live, so the "
            "component reports a LOWER BOUND."
        ),
    )
    parser.add_argument(
        "--routed", action="append", default=[], metavar="ID",
        help="A store conversation id for a routed call dispatched via the Copilot CLI.",
    )
    parser.add_argument(
        "--live", action="append", default=[], metavar="ID",
        help="Mark a conversation as still in flight (forces LOWER BOUND).",
    )
    parser.add_argument(
        "--no-api-calls", action="store_true",
        help=(
            "Declare that this session dispatched no Direct-API routed calls, "
            "so that component contributes an honest zero instead of UNKNOWN. "
            "Not needed with --session-set-dir, which derives the same answer "
            "from the recorded metrics rows."
        ),
    )
    parser.add_argument(
        "--session-set-dir", default=None, metavar="DIR",
        help=(
            "Price a whole workflow session from the ids the repo already "
            "recorded: orchestrator conversations from session-state.json's "
            "orchestrator.seatSessionIds, routed children from "
            "router-metrics.jsonl's transport_session_id. Mutually exclusive "
            "with the explicit --orchestrator/--routed form."
        ),
    )
    parser.add_argument(
        "--session-number", type=int, default=None, metavar="N",
        help="Which session of the set (default: the in-flight one).",
    )
    parser.add_argument(
        "--retrospective", action="store_true",
        help=(
            "Measure a FINISHED session. Without this the reading is live "
            "and reports a LOWER BOUND, because a session's closing turns "
            "are not in the store while it is still closing."
        ),
    )
    parser.add_argument(
        "--cost-block", action="store_true",
        help=(
            "Emit the disposition.cost block (JSON) instead of a table -- "
            "what a close-out pastes into disposition.json."
        ),
    )
    parser.add_argument("--store-path", default=None, help="Override the store location.")
    parser.add_argument("--engine", default=None, help="Orchestrator engine (gates the read).")
    parser.add_argument("--json", action="store_true", help="Emit JSON instead of a table.")
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = _build_parser().parse_args(argv)

    if args.session_set_dir:
        if args.orchestrator or args.routed or args.use_self:
            print(
                "[dabbler] --session-set-dir gathers the ids itself; do not "
                "also pass --orchestrator/--routed/--self.",
                file=sys.stderr,
            )
            return 2
        report = measure_session(
            args.session_set_dir,
            args.session_number,
            live=not args.retrospective,
            engine=args.engine,
            store_path=args.store_path,
            routed_api_not_applicable=True if args.no_api_calls else None,
        )
    else:
        orchestrator = list(args.orchestrator)
        live = list(args.live)
        if args.use_self:
            own = seat_session_id_from_env()
            if own is None:
                print(
                    f"[dabbler] --self needs {SEAT_SESSION_ID_ENV} in the "
                    "environment; this does not look like a Copilot CLI seat.",
                    file=sys.stderr,
                )
                return 2
            orchestrator.append(own)
            live.append(own)

        components = {
            COMPONENT_ORCHESTRATOR_SEAT: orchestrator,
            COMPONENT_ROUTED_SEAT: list(args.routed),
        }
        not_applicable = [COMPONENT_ROUTED_API] if args.no_api_calls else []
        if not args.no_api_calls:
            components[COMPONENT_ROUTED_API] = []

        report = measure(
            components,
            store_path=args.store_path,
            engine=args.engine,
            live_session_ids=live,
            not_applicable=not_applicable,
        )

    import json as _json

    if args.cost_block:
        measured_at = (
            MEASURED_AT_RETROSPECTIVE if args.retrospective else MEASURED_AT_CLOSE
        )
        print(_json.dumps(report.to_cost_block(measured_at), indent=2))
    elif args.json:
        print(_json.dumps(report.to_dict(), indent=2))
    else:
        print(format_report(report))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
