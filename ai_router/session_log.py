"""JSON-based session logging for session sets.

**The step-status vocabulary (Set 120 S1).** Until this set,
:meth:`SessionLog.log_step` accepted any string, and roughly 10% of the
step entries on disk carried a token no reader recognises: "done" was
spelled four ways (``complete`` / ``completed`` / ``done`` /
``complete-with-known-failures``), and prose up to ~1,500 characters had
been written into the status field. The consequence was visible --- Set
119 S2 wrote ``completed``, and the whole session rendered as
not-started with the ``<- here`` marker stranded on step 1, because
:mod:`ai_router.session_checklist` selects the first *non-terminal* row
and an unparseable row is never terminal.

The fix follows the Set 086 S1 pattern established for verification
verdicts: **readers stay lenient, the writer is strict.** Every reader
keeps tolerating whatever it finds on disk (history is a record, not a
bug to be crashed on); nothing that a reader cannot name may be written
from here on. The legal set is drawn from the canonical tokens already
in use --- it invents nothing:

    complete, in-progress, pending, blocked

**Why ``skipped`` is NOT in that set**, despite appearing once on disk
and being named in the Set 120 spec: no reader can name it. It has no
entry in ``session_checklist.STATUS_BOXES`` (so it renders ``[?]``, the
corrupt-data glyph) and neither ``session_checklist._mark_here`` nor the
Work Explorer's mirrored ``markHere`` counts it as terminal (so a skipped
step steals the current-step marker from real work). Admitting a token
the readers cannot name is precisely the defect this module exists to
prevent, so the vocabulary is the INTERSECTION of what was measured and
what the readers understand. Teaching both readers is a two-language
change that belongs with the extension carve; until then ``skipped`` is
refused with a message that says so (operator ruling, 2026-08-11).

Use :func:`require_step_status` at any writer that puts a ``status``
into an ``activity-log.json`` entry. The four sibling writers that do
their own read-modify-write of that file
(:mod:`ai_router.contract_gate`, :mod:`ai_router.path_aware_critique`,
:mod:`ai_router.dual_surface_verify`,
:mod:`ai_router.suggestion_disposition`) all route through it, so an
allowlist at one entry point is not silently bypassed at another
(L-069-1).
"""

import json
import os
from datetime import datetime
from typing import Optional


# ---------------------------------------------------------------------------
# The step-status vocabulary (Set 120 S1)
# ---------------------------------------------------------------------------

STEP_STATUS_COMPLETE = "complete"
STEP_STATUS_IN_PROGRESS = "in-progress"
STEP_STATUS_PENDING = "pending"
STEP_STATUS_BLOCKED = "blocked"

#: The legal set, in the order a step normally travels through it. Every
#: token here was measured in use across this repo's activity logs on
#: 2026-08-11 (2,417 / 31 / 55 / 3 occurrences respectively) **and** is
#: named by every reader --- see the module docstring for why ``skipped``,
#: which satisfies only the first half, is deliberately absent.
CANONICAL_STEP_STATUSES = (
    STEP_STATUS_PENDING,
    STEP_STATUS_IN_PROGRESS,
    STEP_STATUS_COMPLETE,
    STEP_STATUS_BLOCKED,
)

ALLOWED_STEP_STATUSES = frozenset(CANONICAL_STEP_STATUSES)

# Spellings a caller might reasonably reach for, mapped to what they
# meant. This is *only* used to make a refusal actionable --- nothing
# here is ever written to disk. Two sources, deliberately no third:
# the drift measured in the activity logs (``completed``, ``done``,
# ``complete-with-known-failures``), and the alias keys
# ``session_checklist.STATUS_BOXES`` already renders, since a reader
# tolerating a spelling is exactly why a writer would try it.
_STEP_STATUS_DRIFT_HINTS = {
    "completed": STEP_STATUS_COMPLETE,
    "done": STEP_STATUS_COMPLETE,
    "complete-with-known-failures": STEP_STATUS_COMPLETE,
    "in_progress": STEP_STATUS_IN_PROGRESS,
    "started": STEP_STATUS_IN_PROGRESS,
    "not-started": STEP_STATUS_PENDING,
    "failed": STEP_STATUS_BLOCKED,
}

# Tokens refused for a reason worth stating, rather than by falling
# through to "not in the legal set". A caller reaching for one of these
# is not making a typo, so the message explains the decision instead of
# suggesting a near-miss it did not mean.
_STEP_STATUS_REFUSAL_REASONS = {
    "skipped": (
        "'skipped' was considered and deliberately excluded (Set 120 S1, "
        "operator ruling 2026-08-11): no reader can name it. It has no "
        "box in session_checklist.STATUS_BOXES, so it renders as '[?]' "
        "-- the corrupt-data glyph -- and neither _mark_here nor the Work "
        "Explorer's mirrored markHere counts it as terminal, so a skipped "
        "step steals the current-step marker from real work. Record the "
        "skip in the step's DESCRIPTION until both readers learn the "
        "token."
    ),
}

# A status is a token. Anything longer than this is prose that belongs in
# the description, and echoing it whole would bury the remediation.
_STATUS_ECHO_LIMIT = 60


class InvalidStepStatusError(ValueError):
    """Raised by a sanctioned writer asked to persist a step status outside
    the vocabulary. A ``ValueError`` subclass so existing ``except
    ValueError`` callers still catch it (mirrors
    :class:`ai_router.session_state.InvalidVerificationVerdictError`)."""


def _echo_status(status: object) -> str:
    """``repr`` of *status*, truncated so a prose blob stays readable."""
    text = repr(status)
    if len(text) <= _STATUS_ECHO_LIMIT:
        return text
    return f"{text[:_STATUS_ECHO_LIMIT]}... ({len(str(status))} chars)"


def is_valid_step_status(status: object) -> bool:
    """True iff *status* is EXACTLY one of :data:`CANONICAL_STEP_STATUSES`.

    Exact means exact: no case folding, no whitespace tolerance, no
    prefix match. The point of the vocabulary is that the field carries
    one spelling per meaning, so ``"Complete"`` and ``" complete"`` are
    refused at the writer even though every reader would render them ---
    a near-miss admitted here is a near-miss on disk forever.
    """
    return isinstance(status, str) and status in ALLOWED_STEP_STATUSES


def suggest_step_status(status: object) -> Optional[str]:
    """The canonical token *status* most likely meant, or ``None``.

    Advisory only: used to make a refusal message actionable. Never call
    this to normalize a value on the way to disk --- the writer refuses,
    it does not silently rewrite what the caller said.
    """
    if not isinstance(status, str):
        return None
    normalized = status.strip().lower()
    if normalized in ALLOWED_STEP_STATUSES:
        return normalized
    return _STEP_STATUS_DRIFT_HINTS.get(normalized)


def validate_step_status(status: object, *, field: str = "status") -> Optional[str]:
    """Return a remediation message when *status* is outside the
    vocabulary; ``None`` when it is exactly canonical.

    The message always names the legal set, so a caller that hits it
    learns the vocabulary from the failure itself.
    """
    if is_valid_step_status(status):
        return None

    allowed = ", ".join(f"'{t}'" for t in CANONICAL_STEP_STATUSES)
    echo = _echo_status(status)
    hint = suggest_step_status(status)
    hint_text = f" Did you mean '{hint}'?" if hint else ""

    if not isinstance(status, str):
        return (
            f"{field} {echo} is not a step status: it must be a string, "
            f"and EXACTLY one of the legal set ({allowed})."
        )
    if not status.strip():
        return (
            f"{field} {echo} is not a step status: an empty value renders "
            f"as '[?]', indistinguishable from corrupt data. Write EXACTLY "
            f"one of the legal set ({allowed})."
        )
    reason = _STEP_STATUS_REFUSAL_REASONS.get(status.strip().lower())
    if reason is not None:
        return (
            f"{field} {echo} is not a step status. The legal set is "
            f"({allowed}). {reason}"
        )
    if "\n" in status or len(status) > _STATUS_ECHO_LIMIT:
        return (
            f"{field} {echo} is prose, not a step status. The status field "
            f"carries EXACTLY one of the legal set ({allowed}); the "
            f"narrative belongs in the step's description."
        )
    return (
        f"{field} {echo} is not a step status. It must be EXACTLY one of "
        f"the legal set ({allowed}) --- a near-miss spelling is refused "
        f"too, because every reader of the activity log recognises only "
        f"these.{hint_text}"
    )


def require_step_status(status: object, *, field: str = "status") -> str:
    """Return *status* unchanged, or raise :class:`InvalidStepStatusError`.

    The single chokepoint every sanctioned activity-log writer calls.
    """
    message = validate_step_status(status, field=field)
    if message is not None:
        raise InvalidStepStatusError(message)
    return status  # type: ignore[return-value]


def find_active_session_set(base_dir: str = "docs/session-sets") -> str:
    """
    Auto-detect the active session set directory under *base_dir*.

    Detection rules (in priority order):

    1. **In-progress** — ``status == "in-progress"`` in ``session-state.json``.
       If exactly one such set exists, return it.

    2. **Not-started** — ``status == "not-started"`` in
       ``session-state.json``. If exactly one in-progress candidate was found
       (rule 1), ignore not-started ones. If zero in-progress, and exactly one
       not-started, return it.

    The function reads each candidate's ``status`` via :func:`read_status`,
    which lazy-synthesizes ``session-state.json`` for any folder with a
    ``spec.md`` but no state file (Set 7 invariant).

    Raises ``SystemExit`` with a descriptive message if the result is ambiguous
    (multiple in-progress, or multiple not-started with no in-progress) or if no
    candidate is found.

    Args:
        base_dir: Path to the directory that contains session set subfolders.
                  Defaults to ``docs/session-sets``.

    Returns:
        The path of the single active session set directory.
    """
    # Lazy import: session_state imports session_events which would form a
    # cycle through some test paths if pulled in at module load.
    try:
        from session_state import read_status  # type: ignore[import-not-found]
    except ImportError:
        from .session_state import read_status  # type: ignore[no-redef]

    if not os.path.isdir(base_dir):
        raise SystemExit(
            f"Session-sets directory not found: {base_dir!r}\n"
            "Create it and add a session set subfolder with spec.md."
        )

    in_progress: list[str] = []
    not_started: list[str] = []

    for name in sorted(os.listdir(base_dir)):
        path = os.path.join(base_dir, name)
        if not os.path.isdir(path):
            continue

        if not os.path.isfile(os.path.join(path, "spec.md")):
            continue  # not a recognised session set directory

        status = read_status(path)
        if status == "in-progress":
            in_progress.append(path)
        elif status == "not-started":
            not_started.append(path)
        # "complete" / "cancelled" / unknown → skip

    if len(in_progress) == 1:
        return in_progress[0]

    if len(in_progress) > 1:
        listing = "\n".join(f"  - {p}" for p in in_progress)
        raise SystemExit(
            f"Multiple in-progress session sets found:\n{listing}\n\n"
            "Set the 'Active Session Set Override' in your orchestrator's "
            "instruction file (CLAUDE.md, AGENTS.md, or GEMINI.md) to "
            "specify which one."
        )

    # No in-progress — check not-started
    if len(not_started) == 1:
        return not_started[0]

    if len(not_started) > 1:
        listing = "\n".join(f"  - {p}" for p in not_started)
        raise SystemExit(
            f"Multiple unstarted session sets found:\n{listing}\n\n"
            "Set the 'Active Session Set Override' in your orchestrator's "
            "instruction file (CLAUDE.md, AGENTS.md, or GEMINI.md) to "
            "specify which one to start."
        )

    raise SystemExit(
        "No active session set found under "
        f"{base_dir!r}.\nAll session sets appear to be complete, "
        "or no session set with a spec.md exists."
    )


class SessionLog:
    """Manages the activity log and file structure for a session set."""

    def __init__(self, session_set_dir: str, total_sessions: int = 0):
        """
        Args:
            session_set_dir: Path to the session set folder,
                e.g., "docs/session-sets/dabbler-filtergrid-enhancements"
            total_sessions: Total sessions in the plan (used on creation)
        """
        self.session_set_dir = session_set_dir
        self.log_path = os.path.join(session_set_dir, "activity-log.json")
        self.reviews_dir = os.path.join(session_set_dir, "session-reviews")
        self.issues_dir = os.path.join(session_set_dir, "issue-logs")
        self._data = None

        if os.path.exists(self.log_path):
            with open(self.log_path, encoding="utf-8") as f:
                self._data = json.load(f)
        else:
            name = os.path.basename(session_set_dir)
            self._data = {
                "sessionSetName": name,
                "createdDate": datetime.now().astimezone().isoformat(),
                "totalSessions": total_sessions,
                "entries": []
            }
            os.makedirs(session_set_dir, exist_ok=True)
            os.makedirs(self.reviews_dir, exist_ok=True)
            os.makedirs(self.issues_dir, exist_ok=True)
            self._save()

    @property
    def total_sessions(self) -> int:
        return self._data.get("totalSessions", 0)

    @total_sessions.setter
    def total_sessions(self, value: int):
        self._data["totalSessions"] = value
        self._save()

    def get_next_session_number(self) -> int:
        """Determine the next session to execute."""
        completed = set()
        for entry in self._data["entries"]:
            completed.add(entry["sessionNumber"])

        # A session is complete if it has entries AND a review file
        verified = set()
        for s in completed:
            review_path = os.path.join(
                self.reviews_dir, f"session-{s:03d}.md"
            )
            if os.path.exists(review_path):
                verified.add(s)

        if not verified:
            return 1
        return max(verified) + 1

    def get_last_completed_session(self) -> int:
        """Return the highest completed session number, or 0."""
        return self.get_next_session_number() - 1

    def log_step(self, session_number: int, step_number: int,
                 step_key: str, description: str, status: str,
                 api_calls: list[dict] | None = None):
        """Append a step entry to the activity log.

        Raises :class:`InvalidStepStatusError` when *status* is outside
        the vocabulary (Set 120 S1). This is the strict half of "readers
        lenient, writer strict": nothing a reader cannot name reaches
        disk from here on.
        """
        require_step_status(status)
        entry = {
            "sessionNumber": session_number,
            "stepNumber": step_number,
            "stepKey": step_key,
            "dateTime": datetime.now().astimezone().isoformat(),
            "description": description,
            "status": status,
        }
        # Only carry routedApiCalls when there are calls to record. The
        # canonical source of routed-call cost is router-metrics.jsonl
        # (written by record_call); an always-empty [] here read as
        # "no routed calls happened" when in fact none were ever logged
        # to this field. Omitting the key keeps the absence honest;
        # readers (get_cost_summary, session_events) already tolerate it.
        if api_calls:
            entry["routedApiCalls"] = api_calls
        self._data["entries"].append(entry)
        self._save()

    def append_entry(self, entry: dict):
        """Append a pre-built entry to the activity log.

        Set 114 S2. ``log_step`` builds the entry for the orchestrator's
        own steps and stamps ``dateTime`` itself; a seeded plan step
        (``kind: "plan-step"``) needs to carry a ``kind`` and share one
        timestamp across the whole plan, so it is built by its writer and
        appended here. Routing it through this class keeps
        ``activity-log.json`` with a single writer rather than a fourth
        hand-rolled copy of the read-modify-write.

        Raises ``ValueError`` on anything that is not a dict carrying a
        ``sessionNumber`` — a malformed entry poisons every reader of the
        log, so it is refused at the writer rather than discovered later.

        Set 120 S1: a ``status``, **when present**, must be in the step
        vocabulary. Absence is not refused here — this method also
        carries bookkeeping entries, and "no status recorded" is a
        different problem from "a status no reader can name" (Session 3
        gives absence its own explicit state).
        """
        if not isinstance(entry, dict):
            raise ValueError(f"activity-log entry must be a dict, got {type(entry)}")
        if "sessionNumber" not in entry:
            raise ValueError("activity-log entry must carry a sessionNumber")
        if "status" in entry:
            require_step_status(entry["status"], field="entry['status']")
        self._data["entries"].append(dict(entry))
        self._save()

    def save_session_review(self, session_number: int,
                            review_text: str, round_number: int = 1):
        """Save or append the verifier's raw output."""
        path = os.path.join(
            self.reviews_dir, f"session-{session_number:03d}.md"
        )
        if round_number == 1:
            content = f"# Verification Round 1\n\n{review_text}\n"
        else:
            content = (f"\n---\n\n"
                       f"# Verification Round {round_number}\n\n"
                       f"{review_text}\n")
        mode = "a" if round_number > 1 else "w"
        with open(path, mode, encoding='utf-8') as f:
            f.write(content)

    def save_issue_log(self, session_number: int, issues: list[dict]):
        """Save the structured issue log for a session."""
        path = os.path.join(
            self.issues_dir, f"session-{session_number:03d}.json"
        )
        with open(path, "w") as f:
            json.dump(issues, f, indent=2)

    def get_entries_for_session(self, session_number: int) -> list[dict]:
        """Return all activity log entries for a given session."""
        return [e for e in self._data["entries"]
                if e["sessionNumber"] == session_number]

    def get_cost_summary(self) -> dict:
        """Aggregate cost data from all entries."""
        total_cost = 0.0
        total_calls = 0
        by_model = {}
        for entry in self._data["entries"]:
            for call in entry.get("routedApiCalls", []):
                total_calls += 1
                cost = call.get("costUsd", 0)
                total_cost += cost
                model = call["model"]
                if model not in by_model:
                    by_model[model] = {"calls": 0, "cost": 0.0}
                by_model[model]["calls"] += 1
                by_model[model]["cost"] += cost
        return {
            "total_calls": total_calls,
            "total_cost": total_cost,
            "by_model": by_model,
            "sessions_completed": self.get_last_completed_session(),
            "sessions_remaining": (
                self.total_sessions - self.get_last_completed_session()
            )
        }

    def _save(self):
        # encoding pinned (L-079-1): the platform default is cp1252 on
        # Windows, and this file is read and written by several modules.
        with open(self.log_path, "w", encoding="utf-8") as f:
            json.dump(self._data, f, indent=2)
