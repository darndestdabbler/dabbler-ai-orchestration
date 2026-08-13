"""Step-level progress checklist for the session in flight (Set 111 S4).

**Who uses this:** the orchestrator, at every transitional boundary of a
session — and any operator who wants to know where an in-flight session
actually is. ``python -m ai_router.session_checklist`` prints it.
**See also:** ``session_log.SessionLog.log_step`` (the writer whose
entries this renders); ``progress.print_session_set_status`` (the
SET-level surface this complements); ``gate_checks.check_checklist_posted``
(the close gate that reads the post ledger this module writes).

---

Why this exists
---------------
The framework had a good **set**-level surface (the Work Explorer tree,
``print_session_set_status``) and **no step**-level surface. Once a
session was in flight the operator could not see where in the process it
was — even though ``activity-log.json``'s ``log_step`` entries are
exactly that data, written as the session runs and rendered nowhere
(recorded as an open item by Set 111 S3, directed into the orchestrator
by the operator during S4).

A session is a long conversation. "Where are we?" is the question an
operator asks most, and before this the honest answer was "scroll up".

The rendering contract
----------------------
One row per step, in the order the steps were logged, each with a status
box and the step's description.

**There is no ``<- here`` marker** (removed by operator ruling,
2026-08-11, Set 120 S3). It was a single-valued *inference* — "the first
unfinished row is where we are" — and Set 119 S2 showed what that costs
when the data is bad: four unparseable statuses made step 1 the first
non-terminal row, so the marker pointed confidently at a step that had
finished hours earlier. Since Set 120 S1 the writer is strict and the
``in-progress`` token carries the fact directly, so nothing needs to be
inferred; and because the fact is per-row rather than per-session, two
steps may be in flight at once, which a single marker could not
represent. What is in flight is now read from the boxes: ``[~]``.

Status boxes are ASCII (``[x]`` / ``[~]`` / ``[ ]`` / ``[!]``) because
this prints to a console whose text layer is ``cp1252`` on Windows —
the standing rule in ``project-guidance.md`` -> Code Style, and the
lesson class L-079-1 covers what happens when it is ignored.

What it does NOT do
-------------------
It renders **the ledger**, and only the ledger. It never invents a row
from ``spec.md`` at render time, because a checklist that disagrees with
``activity-log.json`` undermines the file close-out gates on. Planned
rows do appear — but only because ``start_session`` wrote them *into the
ledger* as ``pending`` entries, so the renderer still has exactly one
rule (see "The forward half" below). If the checklist looks short, the
fix is to call ``log_step``, not to change this renderer.

The renderer is the recorder (Set 114 S1)
-----------------------------------------
A close gate cannot observe a chat window, so Set 111 S4's obligation to
post at every transition was prose — and that session, which wrote the
obligation, posted **once** in many hours across dozens of transitions.
Nothing noticed, because nothing could.

So producing the checklist is what records that it was produced: every
CLI render appends one line to ``checklist-posts.jsonl`` beside the
activity log (:func:`record_post`), and ``gate_checks
.check_checklist_posted`` compares those lines against the transitions
the session's own records show. The record proves a render happened, not
that a human read it — an acceptable floor, because it converts an
invisible omission into a visible one.

The ledger is a **sibling** file rather than a new ``activity-log.json``
entry kind for two reasons: an entry would be rendered by
:func:`build_rows` itself, making the checklist's content a function of
how many times it had been shown, and it would satisfy the existing
``activity_log_entry`` gate for a session that logged no real step at
all. ``test-runs.jsonl`` is the same record-then-gate shape.

Recording is deliberately confined to the CLI path: :func:`build_rows`
and :func:`render` stay pure, so a caller that only wants the rows (the
Work Explorer, a test) does not write to disk.

The forward half — a plan in the ledger (Set 114 S2)
----------------------------------------------------
Rendering only logged steps answered half the question: an operator
could see what was done and not what was coming. Set 111 S4 decided
**against** synthesizing plan rows at render time, because a checklist
that disagrees with ``activity-log.json`` undermines the file close-out
gates on. That decision stands. The forward view is achieved the way
that reasoning allows: ``start_session`` writes the session's spec steps
**into the ledger** as ``pending`` entries (:func:`seed_session_plan`),
so the renderer still has exactly one rule — render the record.

Seeded entries carry ``kind: "plan-step"``. Everything downstream keys
off that marker:

* :func:`build_rows` reconciles them against reality — plan order owns
  each row's **position**, the matching logged step owns its **status
  and description**, an unplanned step still appears (appended), and a
  planned step nobody executed stays visibly ``[ ]``.
* ``gate_checks.check_activity_log_entry`` ignores them, so a session
  that logged no real work cannot satisfy that gate on the strength of
  a plan the writer seeded for it.

Seeding happens **once** per session and is never re-applied: the ledger
stays append-only, an idempotent re-registration writes nothing, and no
mid-session write can stale a verification evidence stamp.

The middle frame, DERIVED (Set 127 S1)
--------------------------------------
Between the two writers above there was no way to say *"this step is
running right now"*: ``seed_session_plan`` writes ``pending`` and
``log_step`` writes ``complete`` **after** the step finishes, so the
``in-progress`` token the boxes have always been able to render was
almost never on disk — the checklist could not distinguish "step 5 has
not been started" from "step 5 has been running for forty minutes".

Set 127 fills that gap by **derivation, never by a new writer**
(journalled decision, ``127-…/decisions.jsonl``). Two facts are computed
from rows this module already reads, and **nothing is written to disk to
make either true**:

* :attr:`ChecklistRow.is_active` — the session's active step. The first
  seeded plan row nothing has logged against, in a session
  ``session-state.json`` reports as in flight, **and only when the record
  is otherwise silent**: any row already carrying ``[~]`` or ``[!]``
  means the ledger has answered "where is this session" itself, and a
  derivation that added a second ``[~]`` beside it would be the
  two-current-rows defect the removed ``<- here`` marker used to produce.
* :attr:`ChecklistRow.started_at` — when a row's step started, which is
  the previous row's **completion** (or the session's ``startedAt`` for
  the first row). Nothing records a start, so this is a wall-clock proxy
  that includes any gap between steps; that is the honest reading of
  "how long is this taking". A row that has not started carries ``None``,
  because a seeded row's own ``dateTime`` is *registration* time and
  rendering it as a start would be a fresh wrong signal.

Both are **display-only**: no exit code moves, the ``log_step``
vocabulary is unchanged, and no gate reads them. The raw ``status`` stays
exactly as written — :attr:`ChecklistRow.effective_status` is what the
box is drawn from, so the record and what the operator sees are never
confused for one another.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass, replace
from datetime import datetime
from typing import List, NamedTuple, Optional, Sequence, Tuple

try:
    from .session_state import read_session_state  # type: ignore[import-not-found]
except ImportError:  # pragma: no cover - direct-script fallback
    from session_state import read_session_state  # type: ignore[no-redef]


# The post ledger: one JSON line per render, append-only, never rewritten.
# Named in verification_stamp.WORK_DIFF_SET_BOOKKEEPING (freshness-exempt:
# a post is a record ABOUT work whose substance binds the digest on its
# own) and in EVIDENCE_VISIBLE_BOOKKEEPING (it stays in the verifier's
# evidence bundle — freshness-exemption and evidence-exclusion are
# different questions, Set 111 S3).
POSTS_FILENAME = "checklist-posts.jsonl"

# Rendering surfaces, recorded so the ledger says which shape was shown.
SURFACE_TEXT = "text"
SURFACE_MARKDOWN = "markdown"

# The marker on a seeded plan entry (Set 114 S2). ``log_step`` writes no
# ``kind`` at all, so the presence of this value is what distinguishes
# "the spec said this session would do X" from "the session did X".
PLAN_STEP_KIND = "plan-step"

# The status a seeded step carries until something real supersedes it.
PLAN_STEP_STATUS = "pending"

# Longest slug a derived plan ``stepKey`` may reach, in words and chars.
# The key is the checklist's LABEL (see :func:`_humanize`), so it has to
# read as a short phrase; the full spec text stays in the description
# behind ``--verbose``.
_PLAN_KEY_MAX_WORDS = 6
_PLAN_KEY_MAX_CHARS = 48


# Status token -> box glyph. ASCII only (cp1252 console, L-079-1).
STATUS_BOXES = {
    "complete": "[x]",
    "done": "[x]",
    "in-progress": "[~]",
    "in_progress": "[~]",
    "started": "[~]",
    "pending": "[ ]",
    "not-started": "[ ]",
    "blocked": "[!]",
    "failed": "[!]",
}
UNKNOWN_BOX = "[?]"

# The one spelling of "this step is in flight", used by the post ledger
# so that question is answered from the same table the rows are boxed
# from rather than by a second list of tokens (L-069-1).
IN_PROGRESS_BOX = "[~]"

# The box a step nothing has started renders as, and the box a step that
# stopped renders as. Named because Set 127 S1's derivation asks two
# questions of them — "is this row eligible to be the active step" and
# "has the record already said where this session is" — and asking them
# with bare literals would be a second table of tokens.
NOT_STARTED_BOX = "[ ]"
STOPPED_BOX = "[!]"

# The canonical token for a step in flight. Written by ``log_step`` when
# an orchestrator logs one, and the token a DERIVED active step presents
# through :attr:`ChecklistRow.effective_status`. Kept beside the box it
# maps to; ``test_the_in_progress_status_and_box_stay_in_step`` pins the
# pair so a rename of either cannot silently split them.
IN_PROGRESS_STATUS = "in-progress"

# Which status tokens mean "nothing has started this yet", derived from
# the box table rather than re-spelled (L-069-1): a token the renderer
# boxes as ``[ ]`` is one this module may derive an active step onto, and
# teaching the renderer a new spelling teaches this with nothing to edit.
# An UNRECOGNISED token is deliberately absent from the set — it boxes
# ``[?]``, and the five legacy prose-in-``status`` rows must not be read
# as evidence of anything, in either direction.
_UNSTARTED_STATUSES = frozenset(
    token for token, box in STATUS_BOXES.items() if box == NOT_STARTED_BOX
)

# The boxes that mean the RECORD has already answered "where is this
# session": a step in flight, or one that stopped. Either way there is no
# silence for the derivation to fill.
_RECORD_ANSWERS_BOXES = frozenset({IN_PROGRESS_BOX, STOPPED_BOX})


@dataclass(frozen=True)
class ChecklistRow:
    step_number: Optional[int]
    step_key: str
    description: str
    status: str
    # Set 114 S2: True when this row is still only a PLAN — a step the
    # spec promised that nothing has logged yet. Defaults to False so
    # every existing construction (and consumer-repo caller) is
    # unchanged.
    is_planned: bool = False
    # Set 127 S1, DERIVED — never read from disk, never written to it.
    # True on the one row a session is currently working (see the module
    # docstring, "The middle frame"). The row's ``status`` is left exactly
    # as the ledger wrote it; only :attr:`effective_status` moves.
    is_active: bool = False
    # Set 127 S1, DERIVED. When this row's step started, as an ISO-8601
    # string taken from the PREVIOUS row's completion (or the session's
    # ``startedAt`` for the first row). ``None`` means "has not started"
    # or "cannot be derived" — never a guess, and never this row's own
    # seeded registration timestamp.
    started_at: Optional[str] = None

    @property
    def effective_status(self) -> str:
        """What this row SAYS it is, record first, derivation second.

        A derived active step has no token of its own on disk — deriving
        it is the whole point — so this is where ``in-progress`` appears
        for it. ``status`` stays the record; every display surface reads
        this. The two are separate so a consumer can always see that the
        ledger said ``pending`` and the tree drew ``[~]``, and why.
        """
        return IN_PROGRESS_STATUS if self.is_active else self.status

    @property
    def box(self) -> str:
        return STATUS_BOXES.get(str(self.effective_status).lower(), UNKNOWN_BOX)


def _ascii_safe(text: str) -> str:
    """Down-convert *text* for a cp1252 console (L-079-1).

    Step descriptions are authored prose and routinely carry em dashes
    and smart quotes; printing them raw is a latent crash on Windows.
    """
    for src, dst in (
        ("\u2014", "-"), ("\u2013", "-"), ("\u2018", "'"), ("\u2019", "'"),
        ("\u201c", '"'), ("\u201d", '"'), ("\u2026", "..."), ("\u00a0", " "),
    ):
        text = text.replace(src, dst)
    return text.encode("ascii", "replace").decode("ascii")


def read_activity_log(session_set_dir: str) -> Optional[dict]:
    path = os.path.join(session_set_dir, "activity-log.json")
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


def current_session_number(session_set_dir: str) -> Optional[int]:
    """The session in flight, else the most recently closed one.

    Reads ``session-state.json`` — the single source of truth for
    progress — and never infers from file presence.
    """
    state = read_session_state(session_set_dir)
    if not isinstance(state, dict):
        return None
    sessions = state.get("sessions")
    if not isinstance(sessions, list):
        return None
    closed: List[int] = []
    for s in sessions:
        if not isinstance(s, dict):
            continue
        number = s.get("number")
        if not isinstance(number, int) or isinstance(number, bool):
            continue
        if s.get("status") == "in-progress":
            return number
        if s.get("status") == "complete":
            closed.append(number)
    return max(closed) if closed else None


def session_flight_facts(
    session_set_dir: str, session_number: int
) -> Tuple[bool, Optional[str]]:
    """``(is this session in flight, when did it start)`` for *session_number*.

    Read from ``session-state.json`` — the single source of truth for
    session progress — and from nothing else. File presence is never a
    state signal, and this function never writes.

    Returned as one call rather than two because both answers come from
    the same record and a caller that read them separately could see a
    session start between the two reads. ``(False, None)`` is the answer
    for an absent, unreadable or silent state file: no derivation, which
    is the status quo the whole module had before Set 127.

    **The plan-less carve-out** (a set whose plan is not yet committed
    writes a v4 file with no ``sessions[]`` array and a top-level
    ``status`` / ``startedAt`` instead) contributes its ``startedAt`` and
    **nothing else**. That is deliberately asymmetric: the file has one
    start and no per-session ledger to attribute it to, so using it as a
    session start is the best evidence there is, while claiming a session
    is in flight from a top-level flag would be attributing a *current
    step* to a session number the file never names. Nothing is lost by
    the refusal — a plan-less set has no ``### Session N`` headings, so
    ``seed_session_plan`` writes no plan rows and there is no candidate
    row to derive in the first place.
    """
    state = read_session_state(session_set_dir)
    if not isinstance(state, dict):
        return False, None
    sessions = state.get("sessions")
    # Absent OR empty: the reader shim normalises the carve-out's missing
    # array to ``[]`` and leaves the top-level passthroughs beside it, so
    # "no per-session ledger" is the one condition, spelled once.
    if not isinstance(sessions, list) or not sessions:
        return False, _iso_or_none(state.get("startedAt"))
    for entry in sessions:
        if not isinstance(entry, dict):
            continue
        number = entry.get("number")
        if not isinstance(number, int) or isinstance(number, bool):
            continue
        if number != session_number:
            continue
        return (
            entry.get("status") == "in-progress",
            _iso_or_none(entry.get("startedAt")),
        )
    return False, None


def _iso_or_none(value: object) -> Optional[str]:
    """*value* when it is a non-empty timestamp string, else ``None``.

    ``startedAt`` is explicitly nullable in the schema, and a hand-edited
    state file can hold anything at all. One coercion, used at both read
    sites, so the two cannot answer differently (L-069-1).
    """
    return value if isinstance(value, str) and value.strip() else None


def _collapse_by_step_key(entries: Sequence[dict]) -> List[dict]:
    """Collapse *entries* by ``stepKey``, keeping the latest in first place.

    ``activity-log.json`` is an append-only audit trail, so a step that is
    logged ``in-progress`` and later logged ``complete`` appears twice.
    Rendering both would duplicate the row AND show the stale status
    beside the current one — with the ``[~]`` box still claiming the step
    is in flight after it finished, which is exactly the wrong answer to
    "where is this session". So entries are collapsed by ``stepKey``,
    keeping the latest, at the position the step first appeared — the
    ledger stays append-only (nothing is rewritten), and the checklist
    shows the current truth.

    Steps logged with no ``stepKey`` cannot be collapsed and are kept
    individually; two anonymous steps are two steps.
    """
    order: List[str] = []
    latest: dict = {}
    anonymous = 0
    for e in entries:
        key = str(e.get("stepKey") or "").strip()
        if not key:
            anonymous += 1
            key = f"\0anon-{anonymous}"
        if key not in latest:
            order.append(key)
        latest[key] = e
    return [latest[k] for k in order]


def _step_number_of(entry: dict) -> Optional[int]:
    value = entry.get("stepNumber")
    if isinstance(value, int) and not isinstance(value, bool):
        return value
    return None


def is_logged_step(entry: object) -> bool:
    """True when *entry* is a step the orchestrator logged.

    The one spelling of the distinction this module and its gates both
    depend on: ``SessionLog.log_step`` writes no ``kind`` at all, so an
    entry that carries one was written by machinery, not by the session
    doing work — the seeded plan itself, a ``path_aware_critique`` or
    ``contract_gate`` policy record, a ``dual_surface_mode`` choice, a
    ``suggestion_disposition``. Those are records *about* a session, and
    several of them are written at registration, before any work exists.

    Set 114 S2 round 1: the first cut of the gate filters excluded only
    ``kind == "plan-step"`` while :func:`_reconcile` already excluded
    every ``kind``. Both discovery lenses found the same consequence
    independently — a set with ``pathAwareCritique`` configured could
    satisfy ``check_activity_log_entry`` at registration. One predicate,
    used everywhere, is what stops the two rules drifting again
    (L-069-1).
    """
    if not isinstance(entry, dict):
        return False
    return not str(entry.get("kind") or "").strip()


def _row_from_entry(entry: dict, *, is_planned: bool) -> ChecklistRow:
    return ChecklistRow(
        step_number=_step_number_of(entry),
        step_key=str(entry.get("stepKey") or ""),
        description=str(entry.get("description") or ""),
        status=str(entry.get("status") or ""),
        is_planned=is_planned,
    )


def _completion_of(entry: dict) -> Optional[str]:
    """When the step this entry describes finished, if it is a step at all.

    ``log_step`` stamps ``dateTime`` as it writes, and it writes **after**
    the step is done, so an ordinary entry's timestamp is that step's
    completion. It is the only start-time evidence the ledger contains:
    the next row's start is this row's completion.

    Guarded by :func:`is_logged_step`, the module's one predicate for
    "work the session did", because two other kinds of entry carry a
    ``dateTime`` and neither is a completion:

    * a seeded ``plan-step`` row, whose stamp is *registration* time —
      the moment the whole plan was written, identical across every row
      of the session. Treating it as a completion would hand every
      unstarted step a start time (operator ruling 3, 2026-08-12).
    * a bookkeeping record (``path_aware_critique``, ``contract_gate``,
      ``dual_surface_mode``, ``suggestion_disposition``), which is a
      record *about* the session written by machinery, usually at
      registration. It renders as a row — Set 111 S4 settled that — but
      it is not work, which is exactly why it may not claim a planned row
      either. A row whose predecessor is one of these therefore starts at
      an unknown time, not at the moment a policy was recorded.

    **The status is deliberately not consulted** (Set 127 S1 round 2's
    adjudicated-minor residual, settled in S2). What advances the chain is
    the entry EXISTING: ``log_step`` writes when the orchestrator records
    the step, so its stamp is the last known moment of that step's
    activity and the best available lower bound for the row below it.
    Gating on a *recognised terminal* token instead would make the start
    times depend on the status vocabulary, which this module refuses to
    trust in either direction — ``completed`` is one of the 15
    non-canonical tokens Set 120 S2 preserved and boxes ``[?]``, so every
    legacy set spelling it that way would silently lose its start times.
    The shape the residual worried about cannot mislead: a row that says
    ``in-progress`` makes the record the answer, so no planned row below
    it is ever derived active, and a planned row that is not active
    carries no time at all.
    """
    if not is_logged_step(entry):
        return None
    value = str(entry.get("dateTime") or "").strip()
    return value or None


class _RowEvidence(NamedTuple):
    """One row plus the two facts the derivation needs about its entry.

    Private, and deliberately not folded into :class:`ChecklistRow`:
    ``completion`` and ``is_step`` are inputs to a derivation, not things
    a consumer renders, and a row model that carried a completion would
    invite a surface to draw an end time the operator ruled against.
    """

    row: ChecklistRow
    #: This step's completion, or ``None`` when the entry is not a step
    #: that finished (:func:`_completion_of`).
    completion: Optional[str]
    #: True when the entry is work the session logged, rather than a
    #: seeded plan row or a bookkeeping record about the session.
    is_step: bool

    @property
    def is_step_row(self) -> bool:
        """True when this row stands for a STEP — done, or merely planned.

        The distinction that matters to the start-time chain. A planned
        row is a step nobody has finished, so it BREAKS the chain: the
        row after it starts at an unknown time. A bookkeeping record is
        not a step at all, so it is TRANSPARENT: the row after it starts
        when the previous real step finished, not when a policy was
        written down.
        """
        return self.is_step or self.row.is_planned


def _evidence(entry: dict, *, is_planned: bool) -> "_RowEvidence":
    return _RowEvidence(
        row=_row_from_entry(entry, is_planned=is_planned),
        completion=_completion_of(entry),
        is_step=is_logged_step(entry),
    )


def _reconcile(
    plan: Sequence[dict], real: Sequence[dict], *, allow_ordinal: bool = True
) -> List["_RowEvidence"]:
    """Merge the seeded plan with what the session actually logged.

    The rule, in one line: **the plan owns each row's position, the
    logged step owns its content.**

    Claims are made in **two passes, identity before ordinal**:

    1. Every logged step whose ``stepKey`` equals a planned key claims
       that row. A key match is an assertion of identity and cannot be
       wrong.
    2. Each remaining logged step claims the still-unclaimed planned row
       with the same ``stepNumber`` — **only when *allow_ordinal***.

    That second pass is an *inference*, not an identity: it reads
    "logged step 2" as "planned step 2". It is what keeps the common
    case clean, because an orchestrator's own step keys are prose-free
    handles that rarely equal the slug the seeder derived from the
    spec's sentence. It is also unsound the moment the plan moves under
    it — and the caller, not this function, decides whether it has.

    Rounds 2 and 3 are why. Insert a step into the spec mid-session and
    log under the spec's **new** numbers, and an ordinal-only pass
    cascades: the inserted step claims the old step 2's row, the old
    step 2 claims the old step 3's row, and the last planned step
    vanishes from the checklist — a planned step nobody executed,
    silently dropped, which the spec forbids in both directions. Round
    2's fix (identity first) only rescued the case where the shifted
    step's key happened to equal a seeded slug; round 3 rejected it by
    logging under an ordinary key, and was right to.

    There is no structural signal inside the ledger that separates the
    two situations — "five logged steps, five planned rows, each number
    used once" is the shape of both. The signal is outside it, in
    ``spec.md`` (:func:`plan_matches_spec`), which is why the decision
    is the caller's.

    Only ordinary ``log_step`` entries can claim (:func:`is_logged_step`):
    an entry carrying a ``kind`` is bookkeeping the writer emitted, not
    work the session did, and it must not mark a planned step done.

    Nothing is dropped in either direction. A planned step nobody logged
    stays a ``[ ]`` row with the spec's own words; a logged step the plan
    did not predict is appended after the plan, in first-logged order, so
    it is visible without displacing a planned row it never corresponded
    to. One planned row is claimed at most once — a second logged step
    that shares a ``stepNumber`` is real work too, and appends.

    Returns one :class:`_RowEvidence` per row (Set 127 S1): the row as it
    will render, beside the timestamp the NEXT row's start is derived
    from and whether this row is a step at all. An unclaimed planned row
    contributes neither, because a plan row's ``dateTime`` is
    registration time rather than a completion (:func:`_completion_of`).
    """
    evidence: List[_RowEvidence] = [
        _evidence(e, is_planned=True) for e in plan
    ]
    by_number: dict = {}
    by_key: dict = {}
    for index, entry in enumerate(plan):
        number = _step_number_of(entry)
        if number is not None:
            by_number.setdefault(number, index)
        key = str(entry.get("stepKey") or "").strip()
        if key:
            by_key.setdefault(key, index)

    claims: dict = {}
    claimed: set = set()

    def _claim(lookup: dict, value: object, position: int) -> None:
        target = lookup.get(value)
        if target is None or target in claimed:
            return
        claimed.add(target)
        claims[position] = target

    for position, entry in enumerate(real):
        if not is_logged_step(entry):
            continue
        _claim(by_key, str(entry.get("stepKey") or "").strip(), position)
    if allow_ordinal:
        for position, entry in enumerate(real):
            if position in claims or not is_logged_step(entry):
                continue
            _claim(by_number, _step_number_of(entry), position)

    for position, target in claims.items():
        evidence[target] = _evidence(real[position], is_planned=False)
    extra = [
        _evidence(entry, is_planned=False)
        for position, entry in enumerate(real)
        if position not in claims
    ]
    return evidence + extra


# Set 120 S3 removed ``_mark_here`` here (operator ruling, 2026-08-11).
# It computed the single ``<- here`` row by rule -- first unfinished
# logged step, else first unfinished planned row, else the last row --
# and every one of those branches is an inference the ledger no longer
# needs anyone to make. See this module's docstring, "The rendering
# contract", for why. Nothing replaced it: what is in flight is the
# ``in-progress`` status the strict writer guarantees, read straight off
# the row.
#
# Set 127 S1 is NOT that marker returning. ``_active_step_index`` fires
# only where the record is SILENT — it never overrides a logged status,
# it stands down entirely the moment any row says ``[~]`` or ``[!]``, and
# it produces nothing at all in a session ``session-state.json`` does not
# report as in flight. The marker's failure was that it always named
# exactly one row, including when it had no idea; this names at most one,
# and prefers naming none.


def _active_step_index(rows: Sequence[ChecklistRow]) -> Optional[int]:
    """Which row a session in flight is currently working, if any.

    The rule, in one line: **the first seeded plan row nothing has logged
    against, and only while the record is otherwise silent.**

    Two guards, both of them the difference between "no signal" and "a
    wrong signal":

    1. **The record wins outright.** If any row already boxes ``[~]`` or
       ``[!]`` — a logged ``in-progress``, a ``blocked``, a ``failed`` —
       the ledger has answered "where is this session" itself, and this
       returns ``None``. Deriving a second ``[~]`` beside a logged one is
       precisely the two-current-rows defect the removed ``<- here``
       marker produced, and the parity corpus pins the shape of it
       (``in-flight-is-the-logged-step-not-an-earlier-pending-plan-row``).
    2. **An unrecognised token is evidence of nothing.** Eligibility asks
       for a token the renderer boxes ``[ ]``, not merely for the absence
       of a real one, so the five legacy prose-in-``status`` rows neither
       become the active step nor let a later row become it by looking
       finished. They box ``[?]``, and ``[?]`` is a question, not an
       answer.

    Callers pass rows that carry no derivation yet, so ``row.box`` here is
    the record's own box.
    """
    if any(row.box in _RECORD_ANSWERS_BOXES for row in rows):
        return None
    for index, row in enumerate(rows):
        if row.is_planned and str(row.status).lower() in _UNSTARTED_STATUSES:
            return index
    return None


def _derive_progress(
    evidence: Sequence["_RowEvidence"],
    *,
    in_flight: bool,
    session_started_at: Optional[str],
) -> List[ChecklistRow]:
    """Add the two derived facts to *evidence*'s rows (Set 127 S1).

    Pure: rows in, rows out, nothing read and nothing written. The two
    facts are deliberately computed together in one pass, because they
    answer one question between them — *where is this session, and since
    when* — and a second pass over the same rows would be a second place
    for the answers to disagree.

    **The active step** is derived only for a session in flight
    (:func:`_active_step_index`). A closed session derives nothing: a
    ``[~]`` on a session that finished last month is a worse answer than
    the silence it replaced, because an operator would have a reason to
    believe it.

    **The start time** is derived for every row that has started, in
    flight or not — the question "when did step 3 start" is as good on a
    session that closed months ago as on the live one. A row has started
    when it is a logged step, or when it is the derived active step; a
    seeded plan row nobody reached and a bookkeeping record about the
    session are neither, and carry no time at all. Each started row's
    start is **the previous step's** completion, seeded with the
    session's own ``startedAt`` for the first row — a bookkeeping row
    between two steps is stepped over rather than treated as one
    (:attr:`_RowEvidence.is_step_row`). A gap between two steps is
    therefore *inside* the elapsed time, which is the honest reading of
    "how long has this been running", and a row whose predecessor is a
    step that never completed carries ``None`` rather than a borrowed
    timestamp from further up.
    """
    rows = [item.row for item in evidence]
    active = _active_step_index(rows) if in_flight else None

    derived: List[ChecklistRow] = []
    previous_completion = session_started_at
    for index, item in enumerate(evidence):
        is_active = index == active
        has_started = is_active or item.is_step
        derived.append(
            replace(
                item.row,
                is_active=is_active,
                started_at=previous_completion if has_started else None,
            )
        )
        if item.is_step_row:
            previous_completion = item.completion
    return derived


def build_rows(
    session_set_dir: str, session_number: int
) -> List[ChecklistRow]:
    """Rows for *session_number*: the plan, reconciled against reality.

    Two sources, one record. Entries seeded by ``start_session``
    (``kind: "plan-step"``) supply the forward view — what this session
    said it would do — and ordinary ``log_step`` entries supply what it
    has actually done. :func:`_reconcile` merges them.

    **This is the one Python derivation of a session's step rows** (Set
    120 S3). ``ai_router.session_projection`` serializes what this
    returns rather than recomputing it, so the projection cannot disagree
    with the checklist: there is no second implementation to drift.

    The spec is consulted for exactly one thing (:func:`plan_matches_spec`):
    whether the plan still says what it said at registration. It never
    contributes a row — Set 111 S4's rule that the renderer renders the
    record is untouched. It decides only whether the ordinal half of
    reconciliation is trustworthy, because "logged step 2 is planned
    step 2" is false the moment the plan is renumbered under it.

    A set with no seeded plan (every set that started before Set 114 S2,
    and any spec whose steps do not parse) renders exactly as it did
    before: the logged steps, collapsed by ``stepKey``, in first-logged
    order.

    Set 127 S1 adds the two derived fields (:func:`_derive_progress`) as
    the last thing that happens to every row, on both paths, so a legacy
    set with no plan gets its start times and a planned set gets both.
    Nothing about which rows exist, or what the ledger says they say,
    changes.

    Set 128 S1 removes one class of row that never was a step. A
    gate-policy record (``path_aware_critique``, ``contract_gate``,
    ``dual_surface_mode``, ``suggestion_disposition``) is machinery's
    record ABOUT the session, written at registration before any work
    exists, and it was rendered here as a ``complete`` row in the step
    list. The operator read exactly what it said: *"why would the
    path-aware critique occur so early?"* — a stage that runs once at the
    END of a set, shown with a done glyph minutes after registration. It
    is real, it is already in the ledger the close gates read, and it is
    not a step; the step list now renders only steps
    (:func:`is_logged_step`), which is the same predicate that already
    decided such an entry may not CLAIM a planned row.
    """
    log = read_activity_log(session_set_dir)
    if log is None:
        return []
    entries = log.get("entries")
    if not isinstance(entries, list):
        return []

    mine = [
        e for e in entries
        if isinstance(e, dict) and e.get("sessionNumber") == session_number
    ]
    if not mine:
        return []

    plan = _collapse_by_step_key(
        [e for e in mine if e.get("kind") == PLAN_STEP_KIND]
    )
    # A step list renders steps. An entry carrying a `kind` other than
    # `plan-step` is a gate-policy or bookkeeping record ABOUT the
    # session -- written by machinery at registration, before any work
    # exists -- and showing it here put a `complete` glyph on a stage
    # that had not run (Set 128 S1). `is_logged_step` is the predicate
    # that already refused it a planned row; it now also decides whether
    # it is a row at all, so the two answers cannot diverge.
    real = _collapse_by_step_key([e for e in mine if is_logged_step(e)])
    if not plan:
        evidence = [_evidence(e, is_planned=False) for e in real]
    else:
        evidence = _reconcile(
            plan,
            real,
            allow_ordinal=plan_matches_spec(
                session_set_dir, session_number, plan
            ),
        )
    in_flight, started_at = session_flight_facts(session_set_dir, session_number)
    return _derive_progress(
        evidence, in_flight=in_flight, session_started_at=started_at
    )


def _humanize(step_key: str) -> str:
    """``test-run-policy`` -> ``Test run policy``.

    The step key is the short, stable handle the orchestrator already
    supplies; descriptions are audit-trail prose written for close-out
    review and routinely run to several sentences. A checklist whose rows
    wrap is not a checklist, so the key is the label and the description
    is available behind ``--verbose``.
    """
    text = _ascii_safe(step_key).replace("_", " ").replace("-", " ").strip()
    if not text:
        return ""
    return text[0].upper() + text[1:]


def _summarize(
    description: str, step_key: str, width: int, *, verbose: bool = False
) -> str:
    """One short line for the row.

    Prefers the humanized step key. Falls back to the description's first
    clause when a step was logged with no key at all.
    """
    if not verbose:
        label = _humanize(step_key)
        if label:
            return label if len(label) <= width else label[: width - 3] + "..."

    text = _ascii_safe(description).strip()
    if not text:
        text = _humanize(step_key)
    for sep in (". ", "; ", " -- "):
        idx = text.find(sep)
        if 0 < idx <= width:
            text = text[:idx]
            break
    if len(text) > width:
        text = text[: width - 3].rstrip() + "..."
    return text


def render(
    rows: Sequence[ChecklistRow],
    session_number: int,
    *,
    width: int = 58,
    title: Optional[str] = None,
    verbose: bool = False,
) -> str:
    """Render *rows* as a plain-text checklist block."""
    heading = title or f"Session {session_number} step"
    if not rows:
        return (
            f"{heading}\n"
            f"  (no steps logged yet - call SessionLog.log_step as the "
            f"session runs)"
        )
    lines = [heading, "-" * (len(heading) + 2)]
    for row in rows:
        text = _summarize(row.description, row.step_key, width, verbose=verbose)
        lines.append(f" {row.box} {text}")
    return "\n".join(lines)


def render_markdown(
    rows: Sequence[ChecklistRow],
    session_number: int,
    *,
    width: int = 58,
    verbose: bool = False,
) -> str:
    """Render *rows* as a Markdown table (for a chat/PR surface)."""
    heading = f"Session {session_number} step"
    if not rows:
        return f"| | {heading} |\n| :--- | :--- |\n| | _(no steps logged yet)_ |"
    lines = [f"| | {heading} |", "| :--- | :--- |"]
    for row in rows:
        text = _summarize(row.description, row.step_key, width, verbose=verbose)
        lines.append(f"| {row.box} | {text} |")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# The post ledger — rendering the checklist is what records that it was
# rendered (Set 114 S1)
# ---------------------------------------------------------------------------


def posts_path(session_set_dir: str) -> str:
    """Path of the per-set checklist-post ledger."""
    return os.path.join(session_set_dir, POSTS_FILENAME)


def read_posts(
    session_set_dir: str, session_number: Optional[int] = None
) -> List[dict]:
    """Every post record, oldest first, filtered to *session_number*.

    Tolerant by construction, exactly like ``verify_session
    .read_round_ledger``: an absent, unreadable, or partly-written file
    yields the records that ARE parseable rather than raising. A ledger
    is bookkeeping — a truncated last line (a crash mid-append) must not
    take down the close, and the gate that reads this fails on
    *insufficient* posts, which a dropped line can only make stricter.
    """
    records: List[dict] = []
    try:
        with open(posts_path(session_set_dir), "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    record = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if not isinstance(record, dict):
                    continue
                if session_number is not None:
                    if record.get("sessionNumber") != session_number:
                        continue
                records.append(record)
    except OSError:
        return records
    return records


def record_post(
    session_set_dir: str,
    session_number: int,
    rows: Sequence[ChecklistRow],
    *,
    surface: str = SURFACE_TEXT,
) -> Optional[dict]:
    """Append one post record for a render that just happened.

    Records what the spec asks a post to prove: **when**, for which
    session, how many steps were shown, and which steps were in
    flight — the facts that distinguish "the operator was shown where
    this session is" from "a file was touched".

    Set 120 S3 replaced the single ``hereStepKey`` / ``hereStepNumber`` /
    ``hereStatus`` triple with ``inProgressStepKeys``, a LIST, when the
    ``<- here`` marker was removed by operator ruling. The old fields
    recorded a rule's output; this records a fact the ledger already
    carries. Empty is a real and common answer — at the start-of-session
    post nothing has been marked ``in-progress`` yet — so the key is
    always present rather than omitted, and an empty list means "nothing
    in flight", not "not recorded".

    Returns the record written, or ``None`` when the append failed. The
    failure is deliberately non-fatal: a locked or read-only ledger must
    not deny the operator the checklist they asked for. Callers surface
    the skip by name (L-079-1: a fail-open branch around I/O must NAME
    the skip in operator-facing output) — silence here would be the
    invisible omission this whole mechanism exists to end.

    Set 127 S1: ``inProgressStepKeys`` is read from each row's own ``box``
    rather than from its raw ``status``, so a DERIVED active step is
    recorded too. The record's job is to say what the operator was shown,
    and the render they were shown draws ``[~]`` on that row; a ledger
    line claiming nothing was in flight would contradict the output it
    exists to attest. No gate reads this field — ``check_checklist_posted``
    reads only ``postedAt`` — so the derived state stays display-only.
    """
    record = {
        "sessionNumber": session_number,
        "postedAt": datetime.now().astimezone().isoformat(),
        "stepCount": len(rows),
        "surface": surface,
        "inProgressStepKeys": [
            r.step_key for r in rows if r.box == IN_PROGRESS_BOX
        ],
    }
    try:
        with open(
            posts_path(session_set_dir), "a", encoding="utf-8", newline="\n"
        ) as fh:
            fh.write(json.dumps(record, ensure_ascii=True) + "\n")
    except OSError:
        return None
    return record


# ---------------------------------------------------------------------------
# The forward half — seeding the plan into the ledger (Set 114 S2)
# ---------------------------------------------------------------------------


def plan_step_key(step_text: str, ordinal: int) -> str:
    """A short, stable ``stepKey`` slug for one spec step.

    The key is what the checklist prints as the row's label (the
    description is authored prose written for close-out review and runs
    to several sentences), so it is built from the step's opening
    phrase — normally the bold lead the authoring guide asks for:
    ``**Seed the plan at session start.** ...`` becomes
    ``seed-the-plan-at-session-start``.

    Falls back to ``step-<ordinal>`` when a step has no usable words at
    all, so every seeded entry has a key and the collapse rule never
    sees an anonymous plan row.
    """
    text = _ascii_safe(step_text)
    text = text.replace("*", " ").replace("`", " ").replace("_", " ")
    # The lead sentence / clause: the phrase that names the step.
    for sep in (". ", ": ", "; ", ".", ":", ";"):
        idx = text.find(sep)
        if idx > 0:
            text = text[:idx]
            break
    words = [w for w in re.split(r"[^0-9A-Za-z]+", text.lower()) if w]
    slug = "-".join(words[:_PLAN_KEY_MAX_WORDS])[:_PLAN_KEY_MAX_CHARS]
    slug = slug.strip("-")
    return slug or f"step-{ordinal}"


def read_spec_steps(
    session_set_dir: str, session_number: int, *, spec_path: Optional[str] = None
) -> List[str]:
    """The spec's step texts for *session_number*, or ``[]``.

    Delegates to :mod:`ai_router.spec_admission`, which already parses
    these step lists to enforce the session-size cap. Reusing it is
    deliberate: a second parser for the same list is the duplicate-parser
    defect this repo repeats most (L-069-1), and two parsers that
    disagree would mean the size a spec is admitted at is not the plan
    the operator is shown.

    Returns ``[]`` — never raises — when the spec is missing, unreadable,
    carries no ``### Session N`` headings, or names no steps for this
    session. Seeding is then a no-op and the checklist behaves exactly as
    it did before the plan existed.
    """
    path = spec_path or os.path.join(session_set_dir, "spec.md")
    try:
        try:
            from .spec_admission import (  # type: ignore[import-not-found]
                parse_session_plans,
            )
        except ImportError:
            from spec_admission import (  # type: ignore[no-redef]
                parse_session_plans,
            )
        with open(path, "r", encoding="utf-8") as fh:
            text = fh.read()
        for plan in parse_session_plans(text):
            if plan.number == session_number:
                return [s for s in plan.steps if s.strip()]
    except (OSError, ImportError, ValueError):
        return []
    return []


def plan_matches_spec(
    session_set_dir: str,
    session_number: int,
    plan: Sequence[dict],
    *,
    spec_path: Optional[str] = None,
) -> bool:
    """True when ``spec.md`` still says what the seeded *plan* recorded.

    The one question the renderer asks the spec, and it is never
    answered with a row: **has the plan moved since registration?**

    It matters because ordinal reconciliation — "logged step 2 is
    planned step 2" — is sound only while the numbers the orchestrator
    logs are the numbers the plan was seeded with. Insert a step into
    the spec mid-session and that stops being true, and an ordinal claim
    then quietly relabels a planned row and evicts the last one (rounds
    2 and 3). Inside the ledger the two situations are indistinguishable:
    "N logged steps, N planned rows, each number used once" is the shape
    of both. Here, they are trivially distinguishable.

    Conservative in every failure direction — a missing, unreadable, or
    newly-unparseable spec answers **False**, which costs only the
    ordinal convenience (unmatched steps append; nothing is evicted).
    Losing a row is the failure that matters; showing one twice is not.

    Comparison is on the step **text**, because that is what the seeder
    stored verbatim in ``description``. Reordering, insertion, deletion
    and rewording all register; whitespace normalisation does not,
    because both sides come from the same parser.
    """
    seeded = [str(e.get("description") or "") for e in plan]
    current = read_spec_steps(
        session_set_dir, session_number, spec_path=spec_path
    )
    if not current:
        return False
    return seeded == current


def has_seeded_plan(session_set_dir: str, session_number: int) -> bool:
    """True when *session_number* already has plan entries in the ledger."""
    log = read_activity_log(session_set_dir)
    entries = (log or {}).get("entries")
    if not isinstance(entries, list):
        return False
    return any(
        isinstance(e, dict)
        and e.get("sessionNumber") == session_number
        and e.get("kind") == PLAN_STEP_KIND
        for e in entries
    )


def seed_session_plan(
    session_set_dir: str,
    session_number: int,
    *,
    spec_path: Optional[str] = None,
    total_sessions: int = 0,
) -> List[dict]:
    """Write this session's spec steps into the ledger as pending entries.

    Called once by ``start_session``, after the state write. Returns the
    entries appended — empty when there was nothing to seed, which
    covers every no-op case: a spec with no parseable steps, a session
    the spec does not describe, an unreadable activity log, and a
    re-registration of a session that was already seeded.

    **Seeded once, never re-seeded.** The plan is a snapshot of what the
    session set out to do. Re-seeding on every re-registration would
    write to ``activity-log.json`` mid-session — the freshness risk this
    set's spec names explicitly (Set 111 S4 lost a round to exactly that
    with ``cite_lessons``) — and would let the plan mutate under an
    operator who read it an hour ago. A spec edited mid-flight therefore
    shows its new work when that work is *logged*, as an unplanned row.

    Nothing here may raise into ``start_session``: a plan is an
    affordance, and failing the boundary write over one would be a far
    worse trade than starting without a forward view.
    """
    if has_seeded_plan(session_set_dir, session_number):
        return []
    steps = read_spec_steps(
        session_set_dir, session_number, spec_path=spec_path
    )
    if not steps:
        return []

    used: set = set()
    now = datetime.now().astimezone().isoformat()
    written: List[dict] = []
    for ordinal, text in enumerate(steps, start=1):
        key = plan_step_key(text, ordinal)
        if key in used:
            key = f"{key}-{ordinal}"
        used.add(key)
        written.append(
            {
                "sessionNumber": session_number,
                "stepNumber": ordinal,
                "stepKey": key,
                "dateTime": now,
                "description": text,
                "status": PLAN_STEP_STATUS,
                "kind": PLAN_STEP_KIND,
            }
        )

    try:
        try:
            from .session_log import SessionLog  # type: ignore[import-not-found]
        except ImportError:
            from session_log import SessionLog  # type: ignore[no-redef]
        log = SessionLog(session_set_dir, total_sessions=total_sessions)
        for entry in written:
            log.append_entry(entry)
    except (OSError, ValueError, KeyError, TypeError, ImportError):
        return []
    return written


#: The plan step every session's spec opens with, and the one step whose
#: completion is not a judgement call.
REGISTER_STEP_KEY = "register"

#: Statuses that already mean "done". ``complete`` is the only token
#: ``log_step`` will accept today (Set 120 S1 made it fail closed), but Set
#: 120 S2 deliberately left the historical synonyms on disk rather than
#: rewriting entries it was asked not to touch -- so a reader must still
#: recognise them.
_COMPLETE_TOKENS = frozenset({"complete", "completed", "done"})


def complete_register_step(
    session_set_dir: str,
    session_number: int,
    *,
    description: Optional[str] = None,
    total_sessions: int = 0,
) -> bool:
    """Log this session's ``register`` step complete. Returns True if it wrote.

    Why this exists (Set 122 S2, operator-directed)
    -----------------------------------------------

    ``start_session`` **is** the registration. A ``register`` row it seeds
    as ``pending`` is therefore a checklist that is wrong the instant it is
    written, and it stays wrong until an orchestrator remembers to log a
    step it did not perform -- the framework did. Every session paid that
    tax, and the evidence that it is a real tax rather than a theoretical
    one is in the ledger: Set 122 Session 1 logged four of its seven steps
    "retroactively at close-out", ``register`` among them.

    This closes the one case that needs no judgement. It deliberately does
    NOT touch any other step: those describe work only the orchestrator can
    know it finished, and a writer that guessed at them would replace an
    honestly-empty checklist with a confidently-wrong one.

    Idempotent, because ``start_session`` is: a second registration after a
    context reset finds the step already terminal and writes nothing.

    Never raises into ``start_session``. A checklist is an affordance; the
    boundary write is not, and failing the latter over the former would be
    the wrong trade.
    """
    try:
        log_data = read_activity_log(session_set_dir)
        entries = (log_data or {}).get("entries")
        if not isinstance(entries, list):
            return False

        planned: Optional[dict] = None
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            if entry.get("sessionNumber") != session_number:
                continue
            if entry.get("stepKey") != REGISTER_STEP_KEY:
                continue
            if entry.get("kind") == PLAN_STEP_KIND:
                planned = entry
                continue
            status = entry.get("status")
            if isinstance(status, str) and status.strip().lower() in _COMPLETE_TOKENS:
                # Already logged complete -- by a previous registration, or
                # by an orchestrator doing it the long way round. The legacy
                # synonyms are honoured because Set 120 S2 deliberately left
                # already-written ones on disk.
                return False
        if planned is None:
            # A spec whose session does not open with a `register` step.
            # Nothing to complete, and nothing to invent.
            return False

        try:
            from .session_log import (  # type: ignore[import-not-found]
                STEP_STATUS_COMPLETE,
                SessionLog,
            )
        except ImportError:
            from session_log import (  # type: ignore[no-redef]
                STEP_STATUS_COMPLETE,
                SessionLog,
            )
        step_number = planned.get("stepNumber")
        if not isinstance(step_number, int):
            return False
        SessionLog(session_set_dir, total_sessions=total_sessions).log_step(
            session_number,
            step_number,
            REGISTER_STEP_KEY,
            description or f"Registered session {session_number}.",
            STEP_STATUS_COMPLETE,
        )
        return True
    except (OSError, ValueError, KeyError, TypeError, ImportError):
        return False


def _resolve_set_dir(explicit: Optional[str]) -> Optional[str]:
    if explicit:
        return explicit
    base = os.path.join("docs", "session-sets")
    if not os.path.isdir(base):
        return None
    for name in sorted(os.listdir(base), reverse=True):
        candidate = os.path.join(base, name)
        state = os.path.join(candidate, "session-state.json")
        if not os.path.isfile(state):
            continue
        try:
            with open(state, "r", encoding="utf-8") as fh:
                if json.load(fh).get("status") == "in-progress":
                    return candidate
        except (OSError, json.JSONDecodeError):
            continue
    return None


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="session_checklist",
        description=(
            "Print the step-level checklist for the session in flight. "
            "Post it at every transitional boundary so the operator can "
            "see where the session is without scrolling."
        ),
    )
    p.add_argument(
        "--session-set-dir",
        default=None,
        help="Session-set directory (default: the in-progress set).",
    )
    p.add_argument(
        "--session-number",
        type=int,
        default=None,
        help="Session to render (default: the one in flight).",
    )
    p.add_argument(
        "--markdown",
        action="store_true",
        help="Render a Markdown table instead of plain text.",
    )
    p.add_argument(
        "--width", type=int, default=58, help="Max description width."
    )
    p.add_argument(
        "--verbose",
        action="store_true",
        help="Use the logged description instead of the short step label.",
    )
    p.add_argument(
        "--no-record",
        action="store_true",
        help=(
            "Render without appending to %s. For scripted or repeated "
            "reads only -- an orchestrator's transitional post must be "
            "recorded, and the close gate reads that record."
        )
        % POSTS_FILENAME,
    )
    return p


def run(argv: Optional[Sequence[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    set_dir = _resolve_set_dir(args.session_set_dir)
    if set_dir is None:
        print(
            "session_checklist: no in-progress session set found; pass "
            "--session-set-dir",
            file=sys.stderr,
        )
        return 2
    number = args.session_number or current_session_number(set_dir)
    if number is None:
        print(
            f"session_checklist: could not resolve a session number in "
            f"{set_dir}",
            file=sys.stderr,
        )
        return 2
    rows = build_rows(set_dir, number)
    if args.markdown:
        print(
            render_markdown(
                rows, number, width=args.width, verbose=args.verbose
            )
        )
    else:
        print(render(rows, number, width=args.width, verbose=args.verbose))

    # The render is the record. Do it AFTER the output so a ledger
    # problem can never cost the operator the checklist itself.
    if not args.no_record:
        surface = SURFACE_MARKDOWN if args.markdown else SURFACE_TEXT
        if record_post(set_dir, number, rows, surface=surface) is None:
            print(
                f"session_checklist: could not append to "
                f"{posts_path(set_dir)}; this post is NOT recorded and the "
                f"close gate will not count it.",
                file=sys.stderr,
            )
    return 0


def main(argv: Optional[Sequence[str]] = None) -> int:
    return main_impl(argv)


def main_impl(argv: Optional[Sequence[str]] = None) -> int:
    return run(argv)


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())


__all__ = [
    "STATUS_BOXES",
    "IN_PROGRESS_BOX",
    "IN_PROGRESS_STATUS",
    "NOT_STARTED_BOX",
    "STOPPED_BOX",
    "UNKNOWN_BOX",
    "PLAN_STEP_KIND",
    "PLAN_STEP_STATUS",
    "POSTS_FILENAME",
    "SURFACE_MARKDOWN",
    "SURFACE_TEXT",
    "ChecklistRow",
    "build_rows",
    "current_session_number",
    "has_seeded_plan",
    "is_logged_step",
    "plan_step_key",
    "plan_matches_spec",
    "posts_path",
    "read_activity_log",
    "read_posts",
    "read_spec_steps",
    "record_post",
    "render",
    "render_markdown",
    "seed_session_plan",
    "session_flight_facts",
    "main",
    "run",
]
