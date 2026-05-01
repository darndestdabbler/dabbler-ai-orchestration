"""JSON-based session logging for session sets."""

import json
import os
from datetime import datetime
from typing import Optional


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
            with open(self.log_path) as f:
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
        """Append a step entry to the activity log."""
        entry = {
            "sessionNumber": session_number,
            "stepNumber": step_number,
            "stepKey": step_key,
            "dateTime": datetime.now().astimezone().isoformat(),
            "description": description,
            "status": status,
            "routedApiCalls": api_calls or []
        }
        self._data["entries"].append(entry)
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
        with open(self.log_path, "w") as f:
            json.dump(self._data, f, indent=2)
