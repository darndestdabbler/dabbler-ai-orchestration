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
box and the step's description. The row for the step currently in flight
is marked ``<- here``. That marker is the whole point: a checklist that
shows only what is done answers half the question.

Status boxes are ASCII (``[x]`` / ``[~]`` / ``[ ]`` / ``[!]``) because
this prints to a console whose text layer is ``cp1252`` on Windows —
the standing rule in ``project-guidance.md`` -> Code Style, and the
lesson class L-079-1 covers what happens when it is ignored.

What it does NOT do
-------------------
It renders **logged** steps, not planned ones. A step the orchestrator
never logged does not appear, because inventing rows from the spec would
produce a checklist that disagrees with the record — and the record is
what close-out gates on. If the checklist looks short, the fix is to
call ``log_step``, not to change this renderer.

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
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional, Sequence

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

HERE_MARKER = "<- here"


@dataclass(frozen=True)
class ChecklistRow:
    step_number: Optional[int]
    step_key: str
    description: str
    status: str
    is_here: bool

    @property
    def box(self) -> str:
        return STATUS_BOXES.get(str(self.status).lower(), UNKNOWN_BOX)


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


def build_rows(
    session_set_dir: str, session_number: int
) -> List[ChecklistRow]:
    """Rows for *session_number*, in first-logged order.

    ``activity-log.json`` is an append-only audit trail, so a step that is
    logged ``in-progress`` and later logged ``complete`` appears twice.
    Rendering both would duplicate the row AND strand the ``<- here``
    marker on the stale entry, which is exactly the wrong answer to "where
    is this session". So entries are **collapsed by ``stepKey``, keeping
    the latest**, at the position the step first appeared — the ledger
    stays append-only (nothing is rewritten), and the checklist shows the
    current truth.

    Steps logged with no ``stepKey`` cannot be collapsed and are kept
    individually; two anonymous steps are two steps.

    The "here" row is the first surviving row whose status is not
    terminal. If every step is finished, the LAST row is marked — a
    session whose steps are all complete is sitting at its final step.
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

    order: List[str] = []
    latest: dict = {}
    anonymous = 0
    for e in mine:
        key = str(e.get("stepKey") or "").strip()
        if not key:
            anonymous += 1
            key = f"\0anon-{anonymous}"
        if key not in latest:
            order.append(key)
        latest[key] = e
    collapsed = [latest[k] for k in order]

    terminal = {"complete", "done"}
    here_index = len(collapsed) - 1
    for i, e in enumerate(collapsed):
        if str(e.get("status", "")).lower() not in terminal:
            here_index = i
            break

    rows: List[ChecklistRow] = []
    for i, e in enumerate(collapsed):
        step_number = e.get("stepNumber")
        rows.append(
            ChecklistRow(
                step_number=(
                    step_number
                    if isinstance(step_number, int)
                    and not isinstance(step_number, bool)
                    else None
                ),
                step_key=str(e.get("stepKey") or ""),
                description=str(e.get("description") or ""),
                status=str(e.get("status") or ""),
                is_here=(i == here_index),
            )
        )
    return rows


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
        suffix = f"  {HERE_MARKER}" if row.is_here else ""
        lines.append(f" {row.box} {text}{suffix}")
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
        if row.is_here:
            text = f"**{text}** {HERE_MARKER}"
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
    session, how many steps were shown, and which step carried the
    ``<- here`` marker — the three facts that distinguish "the operator
    was shown where this session is" from "a file was touched".

    Returns the record written, or ``None`` when the append failed. The
    failure is deliberately non-fatal: a locked or read-only ledger must
    not deny the operator the checklist they asked for. Callers surface
    the skip by name (L-079-1: a fail-open branch around I/O must NAME
    the skip in operator-facing output) — silence here would be the
    invisible omission this whole mechanism exists to end.
    """
    here = next((r for r in rows if r.is_here), None)
    record = {
        "sessionNumber": session_number,
        "postedAt": datetime.now().astimezone().isoformat(),
        "stepCount": len(rows),
        "surface": surface,
    }
    if here is not None:
        record["hereStepKey"] = here.step_key
        if here.step_number is not None:
            record["hereStepNumber"] = here.step_number
        record["hereStatus"] = here.status
    try:
        with open(
            posts_path(session_set_dir), "a", encoding="utf-8", newline="\n"
        ) as fh:
            fh.write(json.dumps(record, ensure_ascii=True) + "\n")
    except OSError:
        return None
    return record


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
    "HERE_MARKER",
    "POSTS_FILENAME",
    "SURFACE_MARKDOWN",
    "SURFACE_TEXT",
    "ChecklistRow",
    "build_rows",
    "current_session_number",
    "posts_path",
    "read_activity_log",
    "read_posts",
    "record_post",
    "render",
    "render_markdown",
    "main",
    "run",
]
