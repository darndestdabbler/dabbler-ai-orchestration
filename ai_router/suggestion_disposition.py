"""Reader and writer helpers for ``suggestion_disposition`` activity-log entries.

Set 048 Session 2 §3.4: when a spec declares ``requiresUAT: "suggested"``
or ``requiresE2E: "suggested"`` AND the session has UX scope, the AI
orchestrator (Claude Code / Codex / etc.) prompts the operator at
session start:

  "E2E tests, UAT checklist, both, or neither?"

The operator's choice is recorded ONCE in the session set's
``activity-log.json`` as an entry with ``kind: suggestion_disposition``
and a ``choice`` field carrying one of the four answers. This module
provides read + write helpers for that record so:

  * The AI orchestrator (Claude Code etc.) can write the entry via
    ``record_suggestion_disposition()``.
  * Future close-out code (Set 048 S3+) can read the recorded
    choice via ``read_suggestion_disposition_for_session()`` to
    decide whether UAT/E2E close-out gates fire.

**Scope note:** the *runtime gate* that USES the recorded disposition
to block close-out under `requires_uat == "suggested"` is deferred to
Set 048 Session 3 (where the AI-orchestrator question is wired and
documented in ``docs/ai-led-session-workflow.md``). Adding the gate
in S2 would touch close-out behavior for Full-tier sessions in a way
the audit did not scope. S3 owns both the AI-orchestrator question
flow AND the close-out-side gate that consumes the recorded
disposition.

The entry shape (mirrors the existing activity-log schema):

  {
    "sessionNumber": <int>,
    "stepNumber": <int>,
    "stepKey": "session-NNN/suggestion-disposition",
    "dateTime": "<ISO-8601 timestamp>",
    "description": "Operator answered the UAT/E2E suggested-state prompt: <choice>.",
    "status": "complete",
    "routedApiCalls": [],
    "kind": "suggestion_disposition",
    "choice": "e2e" | "uat" | "both" | "neither"
  }

The ``kind`` field is the canonical discriminator the reader matches
on; it's an additive field that does not break the existing
activity-log schema readers.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, Optional

SuggestionChoice = Literal["e2e", "uat", "both", "neither"]

VALID_CHOICES = ("e2e", "uat", "both", "neither")

ENTRY_KIND = "suggestion_disposition"


def record_suggestion_disposition(
    session_set_dir: str | Path,
    session_number: int,
    choice: SuggestionChoice,
    *,
    step_number: Optional[int] = None,
) -> None:
    """Append a ``suggestion_disposition`` entry to ``activity-log.json``.

    Writes the canonical entry shape above. If ``step_number`` is None,
    it's inferred as ``max(existing steps for this session) + 1``,
    falling back to ``1`` if no entries exist yet.

    Raises ``ValueError`` on unknown choice. Raises
    ``FileNotFoundError`` if the activity-log file is missing
    (callers create it via the normal session lifecycle; this helper
    does not create the file from scratch).
    """
    if choice not in VALID_CHOICES:
        raise ValueError(
            f"unknown suggestion choice {choice!r}; "
            f"expected one of {VALID_CHOICES}"
        )

    log_path = Path(session_set_dir) / "activity-log.json"
    if not log_path.exists():
        raise FileNotFoundError(
            f"activity-log.json not found at {log_path}; "
            "the session set must exist + have started before recording "
            "a suggestion disposition"
        )

    with log_path.open("r", encoding="utf-8") as f:
        log = json.load(f)

    entries = log.setdefault("entries", [])

    if step_number is None:
        step_number = (
            max(
                (
                    int(e.get("stepNumber", 0))
                    for e in entries
                    if e.get("sessionNumber") == session_number
                ),
                default=0,
            )
            + 1
        )

    timestamp = datetime.now(timezone.utc).astimezone().isoformat()

    entry = {
        "sessionNumber": session_number,
        "stepNumber": step_number,
        "stepKey": f"session-{session_number:03d}/suggestion-disposition",
        "dateTime": timestamp,
        "description": (
            f"Operator answered the UAT/E2E suggested-state prompt: "
            f"{choice}."
        ),
        "status": "complete",
        "routedApiCalls": [],
        "kind": ENTRY_KIND,
        "choice": choice,
    }
    entries.append(entry)

    with log_path.open("w", encoding="utf-8") as f:
        json.dump(log, f, indent=2)
        f.write("\n")


def read_suggestion_disposition_for_session(
    session_set_dir: str | Path,
    session_number: int,
) -> Optional[SuggestionChoice]:
    """Return the operator's recorded UAT/E2E choice, or None if not recorded.

    Walks ``activity-log.json`` looking for entries with
    ``kind == "suggestion_disposition"`` AND
    ``sessionNumber == session_number``. Returns the LAST matching
    ``choice`` value (most-recent decision wins if the operator answered
    more than once for the same session). Returns ``None`` when no
    matching entry exists — callers treat this as "operator did not
    answer," which the close-out gate's downstream logic must handle
    (Set 048 S3 will define that behavior).

    Returns None on any read error (missing file, malformed JSON,
    unknown choice value); never raises. Callers that need to
    distinguish "not recorded" from "read failure" should layer a
    direct file-existence check on top.
    """
    log_path = Path(session_set_dir) / "activity-log.json"
    if not log_path.exists():
        return None
    try:
        with log_path.open("r", encoding="utf-8") as f:
            log = json.load(f)
    except (OSError, json.JSONDecodeError):
        return None

    last_choice: Optional[SuggestionChoice] = None
    for entry in log.get("entries", []):
        if entry.get("kind") != ENTRY_KIND:
            continue
        if entry.get("sessionNumber") != session_number:
            continue
        choice = entry.get("choice")
        if choice in VALID_CHOICES:
            last_choice = choice  # type: ignore[assignment]
    return last_choice


__all__ = [
    "ENTRY_KIND",
    "VALID_CHOICES",
    "SuggestionChoice",
    "read_suggestion_disposition_for_session",
    "record_suggestion_disposition",
]
