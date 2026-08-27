"""The machine-only run ledger: ``.dabbler/runs/<set>/s<N>/rounds.jsonl``
and, beside it, ``step-execution.jsonl`` (one row per step opened and one
per step closed), ``disputes.jsonl`` (one row per disputed finding) and
the ``critique/<change-id>/`` subtree of critique artifacts.

One row per completed verification round, appended only by the CLI
(``ai_router.verify``). The close gate reads it. There is no stamp and no
backstop: the record is trustworthy because nothing else writes it, and a
row that fails schema validation on read is a refusal, never a skip — a
hand-edited ledger blocks the close instead of passing it.

The directory is machine-side, not session work: ``ai_router.bootstrap``
writes the ``.dabbler/`` ignore rule into the consumer project, and the
evidence primitives exclude the directory from every tree snapshot and
diff regardless — a round record must never look like a change the
session made, since it is appended *after* the tree it describes. Raw
verifier output is saved beside the ledger for the operator who wants to
read it.
"""

from __future__ import annotations

import datetime
import json
import os
import re
import tempfile
from pathlib import Path
from typing import Optional

import jsonschema

_SCHEMAS_DIR = Path(__file__).parent / "schemas"
_schema_cache: dict = {}

# The router's machine-side directory. Everything beneath it is written
# by the router about the session, never by the session — see
# ``evidence.is_machine_state_path`` for the one predicate that says so.
MACHINE_DIRNAME = ".dabbler"
RUNS_DIRNAME = f"{MACHINE_DIRNAME}/runs"

# The set-dir files the lifecycle writes about a session rather than as
# part of one: the router writes the state and the activity log, the
# close writes the change log, and the sanctioned writers fold the two
# prose files out of the activity log. Declared once, because every module
# that has to tell the record from the work asks the same question -- what
# a close commits, what an evidence diff drops, what a covered-surface
# change ignores, and what a plan's file envelope may never declare.
# ``spec.md`` is deliberately absent: a session editing its own spec
# mid-flight is drift, not ceremony.
LIFECYCLE_WRITTEN_SET_FILES = (
    "session-state.json", "activity-log.json", "change-log.md",
    "decisions-log.md", "project-work-plan.md",
)

# Row types that end a session: no verification round may open after one,
# and a session carries at most one. ``adjudication`` is a third
# provider's judgment of the recorded disputes; ``remediated_at_cap`` is
# the cap terminal where every blocking finding was fixed and the cap left
# the fix unreviewed. ``waive`` is retired — no writer emits it — but
# historical ledgers carry it, so readers still recognize it as terminal.
ROW_ADJUDICATION = "adjudication"
ROW_REMEDIATED_AT_CAP = "remediated_at_cap"
ROW_WAIVE = "waive"
TERMINAL_ROW_TYPES = frozenset(
    {ROW_ADJUDICATION, ROW_REMEDIATED_AT_CAP, ROW_WAIVE}
)


class LedgerError(RuntimeError):
    """The ledger is unreadable or fails validation. Fail closed: the
    caller must treat the verification record as absent, never guess."""


def _schema(name: str) -> dict:
    if name not in _schema_cache:
        _schema_cache[name] = json.loads(
            (_SCHEMAS_DIR / name).read_text(encoding="utf-8")
        )
    return _schema_cache[name]


def session_run_dir(repo_root, set_slug: str, session_number: int) -> Path:
    return (
        Path(repo_root) / RUNS_DIRNAME / str(set_slug)
        / f"s{int(session_number)}"
    )


def rounds_path(repo_root, set_slug: str, session_number: int) -> Path:
    return session_run_dir(repo_root, set_slug, session_number) / "rounds.jsonl"


def raw_output_path(
    repo_root, set_slug: str, session_number: int, round_number: int
) -> Path:
    return session_run_dir(repo_root, set_slug, session_number) / (
        f"round-{int(round_number)}-verifier-output.md"
    )


def _validate(record: dict, schema_name: str, noun: str) -> dict:
    try:
        jsonschema.validate(record, _schema(schema_name))
    except jsonschema.ValidationError as exc:
        location = "/".join(str(p) for p in exc.absolute_path) or "(root)"
        raise LedgerError(
            f"{noun} record failed schema validation at {location}: "
            f"{exc.message}"
        ) from exc
    return record


def validate_round(record: dict) -> dict:
    return _validate(record, "rounds.schema.json", "round")


def validate_dispute(record: dict) -> dict:
    return _validate(record, "disputes.schema.json", "dispute")


def _read_jsonl(path: Path, validate) -> list[dict]:
    if not path.exists():
        return []
    records = []
    for line_no, line in enumerate(
        path.read_text(encoding="utf-8").splitlines(), start=1
    ):
        line = line.strip()
        if not line:
            continue
        try:
            record = json.loads(line)
        except json.JSONDecodeError as exc:
            raise LedgerError(
                f"{path} line {line_no} is not valid JSON: {exc}"
            ) from exc
        if not isinstance(record, dict):
            raise LedgerError(f"{path} line {line_no} is not an object")
        validate(record)
        records.append(record)
    return records


def read_rounds(repo_root, set_slug: str, session_number: int) -> list[dict]:
    """Every recorded round, ascending. Any unparseable or schema-invalid
    line raises :class:`LedgerError` — the ledger is machine-written, so a
    bad line is evidence of tampering or corruption, not noise to skip."""
    rounds = _read_jsonl(
        rounds_path(repo_root, set_slug, session_number), validate_round
    )
    rounds.sort(key=lambda r: r["round"])
    return rounds


def latest_round(repo_root, set_slug: str, session_number: int):
    rounds = read_rounds(repo_root, set_slug, session_number)
    return rounds[-1] if rounds else None


def append_round(
    repo_root, set_slug: str, session_number: int, record: dict
) -> dict:
    """Append one validated round row. Refuses a duplicate round number —
    rounds are immutable history, never rewritten."""
    validate_round(record)
    existing = read_rounds(repo_root, set_slug, session_number)
    if any(r["round"] == record["round"] for r in existing):
        raise LedgerError(
            f"round {record['round']} is already recorded for "
            f"{set_slug} s{session_number}; rounds are append-only and "
            "never overwritten"
        )
    path = rounds_path(repo_root, set_slug, session_number)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(record) + "\n")
    return record


def save_raw_output(
    repo_root, set_slug: str, session_number: int, round_number: int,
    content: str,
) -> Path:
    """Save the verifier's raw response before any parsing or display.
    ``newline=""`` keeps on-disk bytes identical to the response — no CRLF
    translation on Windows."""
    path = raw_output_path(repo_root, set_slug, session_number, round_number)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(content)
    return path


def next_round_number(repo_root, set_slug: str, session_number: int) -> int:
    rounds = read_rounds(repo_root, set_slug, session_number)
    return (rounds[-1]["round"] + 1) if rounds else 1


# --- step-execution.jsonl ----------------------------------------------------

STEP_EXECUTION_FILENAME = "step-execution.jsonl"

STEP_EVENT_OPENED = "opened"
STEP_EVENT_CLOSED = "closed"
STEP_SCHEMA_VERSION = 1


def step_execution_path(repo_root, set_slug: str, session_number: int) -> Path:
    return (
        session_run_dir(repo_root, set_slug, session_number)
        / STEP_EXECUTION_FILENAME
    )


def validate_step_event(record: dict) -> dict:
    return _validate(record, "step-execution.schema.json", "step execution")


def read_step_events(
    repo_root, set_slug: str, session_number: int
) -> list[dict]:
    return _read_jsonl(
        step_execution_path(repo_root, set_slug, session_number),
        validate_step_event,
    )


def append_step_event(
    repo_root, set_slug: str, session_number: int, record: dict
) -> dict:
    """Append one validated step row. Append-only like every other row
    here: a step's history is what happened, not what it should have."""
    validate_step_event(record)
    path = step_execution_path(repo_root, set_slug, session_number)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(record) + "\n")
    return record


def _open_step_in(events: list) -> Optional[dict]:
    """The last opened row with no closed row after it. One at a time is a
    property of this fold, not a count anybody maintains."""
    current = None
    for event in events:
        if event["event"] == STEP_EVENT_OPENED:
            current = event
        elif event["event"] == STEP_EVENT_CLOSED:
            current = None
    return current


def open_step(repo_root, set_slug: str, session_number: int):
    """The step this session has in flight, or ``None``."""
    return _open_step_in(read_step_events(repo_root, set_slug, session_number))


def closed_step_ids(repo_root, set_slug: str, session_number: int) -> list:
    """The steps this session has already executed, in the order they
    closed. A step is executed once; re-opening one would put a second
    commit and a second review against the same declared envelope."""
    return [
        event["step_id"]
        for event in read_step_events(repo_root, set_slug, session_number)
        if event["event"] == STEP_EVENT_CLOSED
    ]


def last_closed_tree(repo_root, set_slug: str, session_number: int):
    """The worktree snapshot the session's most recent step closed on, or
    ``None`` before the first close.

    This is where the next step's change set starts. A closed step's work
    stays in the working tree until the session commits, so measuring the
    next step against the commit it opened on would charge it for its
    predecessor's files. Measuring against the snapshot instead charges it
    for exactly what changed since -- including a second edit to a file an
    earlier step created, which is the open step's work and nobody
    else's."""
    trees = [
        event.get("closed_tree")
        for event in read_step_events(repo_root, set_slug, session_number)
        if event["event"] == STEP_EVENT_CLOSED
    ]
    return trees[-1] if trees else None


def open_steps_in_repo(repo_root) -> list[dict]:
    """Every step open anywhere in this repository.

    The question a commit guard asks. It is answered from the execution
    record alone because a hook gets no arguments and must not have to
    resolve which session is active to know whether a step is in flight:
    each row names its own set and session.
    """
    runs = Path(repo_root) / RUNS_DIRNAME
    if not runs.is_dir():
        return []
    open_rows = []
    for path in sorted(runs.glob(f"*/s*/{STEP_EXECUTION_FILENAME}")):
        row = _open_step_in(_read_jsonl(path, validate_step_event))
        if row is not None:
            open_rows.append(row)
    return open_rows


# --- disputes.jsonl ----------------------------------------------------------

def disputes_path(repo_root, set_slug: str, session_number: int) -> Path:
    return (
        session_run_dir(repo_root, set_slug, session_number)
        / "disputes.jsonl"
    )


def read_disputes(repo_root, set_slug: str, session_number: int) -> list[dict]:
    return _read_jsonl(
        disputes_path(repo_root, set_slug, session_number), validate_dispute
    )


def append_dispute(
    repo_root, set_slug: str, session_number: int, record: dict
) -> dict:
    """Append one validated dispute row. One dispute per finding, ever —
    a dispute is immutable, and re-arguing a judged point is the loop this
    channel exists to end."""
    validate_dispute(record)
    existing = read_disputes(repo_root, set_slug, session_number)
    if any(
        d["round"] == record["round"]
        and d["finding_index"] == record["finding_index"]
        for d in existing
    ):
        raise LedgerError(
            f"finding {record['finding_index']} of round {record['round']} "
            f"is already disputed for {set_slug} s{session_number}; disputes "
            "are immutable and a finding is disputed at most once"
        )
    path = disputes_path(repo_root, set_slug, session_number)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(record) + "\n")
    return record


# --- critique/<change-id>/ ---------------------------------------------------
#
# The frozen layout, one directory per reviewed change:
#
#   .dabbler/runs/<set>/s<N>/critique/<change-id>/
#       review-run.json  g0-summary.json  review-claims.json  checks.json
#       worker-results.jsonl  dispositions.jsonl  audits.jsonl
#
# Every surface here is machine-only: validate against the frozen schema
# first, then atomic-replace or append. A record that fails validation is
# never partially written and never best-effort skipped — it is refused and
# a copy is quarantined beside the subtree, so the rejected payload survives
# for diagnosis without ever being mistaken for the record.

CRITIQUE_DIRNAME = "critique"
QUARANTINE_DIRNAME = "quarantine"

REVIEW_RUN_FILENAME = "review-run.json"
G0_SUMMARY_FILENAME = "g0-summary.json"
REVIEW_CLAIMS_FILENAME = "review-claims.json"
REVIEW_CLAIMS_TWIN_FILENAME = "review-claims.md"
CHECKS_FILENAME = "checks.json"
WORKER_RESULTS_FILENAME = "worker-results.jsonl"
DISPOSITIONS_FILENAME = "dispositions.jsonl"
AUDITS_FILENAME = "audits.jsonl"

# A change-id is a digest, so it is lowercase hex and nothing else. The
# constraint is a path guard as much as a format one: a value that is not a
# digest never becomes a directory name.
_CHANGE_ID_RE = re.compile(r"^[0-9a-f]{7,64}$")


def _require_change_id(change_id) -> str:
    if not isinstance(change_id, str) or not _CHANGE_ID_RE.match(change_id):
        raise LedgerError(
            f"change-id {change_id!r} is not a derived digest (7-64 lowercase "
            "hex characters). It is computed from the reviewed tree by "
            "python -m ai_router.verify prepare; it is never supplied."
        )
    return change_id


def critique_root(repo_root, set_slug: str, session_number: int) -> Path:
    return (
        session_run_dir(repo_root, set_slug, session_number)
        / CRITIQUE_DIRNAME
    )


def critique_dir(
    repo_root, set_slug: str, session_number: int, change_id: str
) -> Path:
    return (
        critique_root(repo_root, set_slug, session_number)
        / _require_change_id(change_id)
    )


def critique_path(
    repo_root, set_slug: str, session_number: int, change_id: str,
    filename: str,
) -> Path:
    return critique_dir(repo_root, set_slug, session_number, change_id) / filename


def validate_review_run(record: dict) -> dict:
    return _validate(record, "review-run.schema.json", "review run")


def validate_review_claims(record: dict) -> dict:
    return _validate(record, "review-claims.schema.json", "review claims")


def validate_check(record: dict) -> dict:
    return _validate(record, "check-ir.schema.json", "check")


def validate_worker_result(record: dict) -> dict:
    return _validate(record, "worker-results.schema.json", "worker result")


def validate_disposition(record: dict) -> dict:
    return _validate(record, "dispositions.schema.json", "disposition")


def quarantine_dir(repo_root, set_slug: str, session_number: int) -> Path:
    """Beside the per-change subtree, never inside it: the frozen layout
    lists seven files and a rejected payload is none of them."""
    return (
        critique_root(repo_root, set_slug, session_number)
        / QUARANTINE_DIRNAME
    )


def _quarantine(
    repo_root, set_slug: str, session_number: int, noun: str, record,
    reason: str,
) -> Optional[Path]:
    directory = quarantine_dir(repo_root, set_slug, session_number)
    stamp = (
        datetime.datetime.now(datetime.timezone.utc)
        .strftime("%Y%m%dT%H%M%S%fZ")
    )
    slug = re.sub(r"[^a-z0-9]+", "-", noun.lower()).strip("-") or "record"
    path = directory / f"{slug}-{stamp}.json"
    try:
        directory.mkdir(parents=True, exist_ok=True)
        payload = {"kind": noun, "reason": reason, "record": record}
        with open(path, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, default=str)
            f.write("\n")
    except (OSError, TypeError, ValueError):
        return None
    return path


def _validated_or_quarantined(
    repo_root, set_slug: str, session_number: int, record, validate, noun: str,
):
    """Validate before anything is written. On failure the record is
    refused *and* preserved: a rejected payload that is silently dropped
    leaves an operator with a refusal message and no way to see what was
    rejected, which is how a bad writer gets blamed on a bad reader."""
    try:
        return validate(record)
    except LedgerError as exc:
        path = _quarantine(
            repo_root, set_slug, session_number, noun, record, str(exc)
        )
        where = f" A copy is quarantined at {path}." if path else ""
        raise LedgerError(
            f"{exc} Nothing was written to the run directory.{where}"
        ) from exc


def _atomic_write_json(path: Path, payload) -> Path:
    """Replace whole-file artifacts in one step, so a reader never sees a
    half-written record."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=path.name + ".", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)
            f.write("\n")
        os.replace(tmp, path)
        tmp = None
    finally:
        if tmp is not None and os.path.exists(tmp):
            try:
                os.unlink(tmp)
            except OSError:
                pass
    return path


def _read_json(path: Path, validate, noun: str):
    if not path.exists():
        return None
    try:
        record = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise LedgerError(f"{path} is not valid JSON: {exc}") from exc
    except OSError as exc:
        raise LedgerError(f"{path} is unreadable: {exc}") from exc
    if not isinstance(record, (dict, list)):
        raise LedgerError(f"{path} does not hold a {noun} record")
    return validate(record)


# --- review-run.json ---------------------------------------------------------

def review_run_path(
    repo_root, set_slug: str, session_number: int, change_id: str
) -> Path:
    return critique_path(
        repo_root, set_slug, session_number, change_id, REVIEW_RUN_FILENAME
    )


def read_review_run(
    repo_root, set_slug: str, session_number: int, change_id: str
) -> Optional[dict]:
    return _read_json(
        review_run_path(repo_root, set_slug, session_number, change_id),
        validate_review_run, "review run",
    )


def read_review_runs(repo_root, set_slug: str, session_number: int) -> list:
    """Every review run recorded for the session, oldest first. A directory
    that holds no readable review run is not a review run."""
    root = critique_root(repo_root, set_slug, session_number)
    if not root.is_dir():
        return []
    runs = []
    for child in sorted(root.iterdir()):
        if not child.is_dir() or child.name == QUARANTINE_DIRNAME:
            continue
        record = _read_json(
            child / REVIEW_RUN_FILENAME, validate_review_run, "review run"
        )
        if record is not None:
            runs.append(record)
    runs.sort(key=lambda r: (r["opened_at"], r["change_id"]))
    return runs


def write_review_run(
    repo_root, set_slug: str, session_number: int, record: dict
) -> Path:
    """Atomic-replace the run record. Attempts are append-only: a write
    that shortens or rewrites an earlier attempt is refused, because a
    remediation's whole point is that the prior attempt's evidence stays
    exactly as it was recorded."""
    _validated_or_quarantined(
        repo_root, set_slug, session_number, record, validate_review_run,
        "review run",
    )
    change_id = _require_change_id(record["change_id"])
    path = review_run_path(repo_root, set_slug, session_number, change_id)
    existing = read_review_run(repo_root, set_slug, session_number, change_id)
    if existing is not None:
        prior = existing["attempts"]
        proposed = record["attempts"]
        if len(proposed) < len(prior) or proposed[:len(prior)] != prior:
            raise LedgerError(
                f"review run {change_id} already records "
                f"{len(prior)} attempt(s); attempts are append-only and a "
                "recorded attempt is never rewritten. A remediation adds a "
                "linked attempt."
            )
    return _atomic_write_json(path, record)


# --- review-claims.json ------------------------------------------------------

def review_claims_path(
    repo_root, set_slug: str, session_number: int, change_id: str
) -> Path:
    return critique_path(
        repo_root, set_slug, session_number, change_id, REVIEW_CLAIMS_FILENAME
    )


def review_claims_twin_path(
    repo_root, set_slug: str, session_number: int, change_id: str
) -> Path:
    """The human-readable rendering. Decorative by construction: no reader
    in this package opens it, and deleting it changes no behavior."""
    return critique_path(
        repo_root, set_slug, session_number, change_id,
        REVIEW_CLAIMS_TWIN_FILENAME,
    )


def read_review_claims(
    repo_root, set_slug: str, session_number: int, change_id: str
) -> Optional[dict]:
    return _read_json(
        review_claims_path(repo_root, set_slug, session_number, change_id),
        validate_review_claims, "review claims",
    )


def write_review_claims(
    repo_root, set_slug: str, session_number: int, record: dict
) -> Path:
    screen_review_claims(repo_root, set_slug, session_number, record)
    return _atomic_write_json(
        review_claims_path(
            repo_root, set_slug, session_number, record["change_id"]
        ),
        record,
    )


def screen_review_claims(
    repo_root, set_slug: str, session_number: int, record: dict
) -> dict:
    """The writer's own check, without the write. A caller that must not
    move machine state until author input is known-good gets the identical
    refusal and the identical quarantine copy — pre-checking through a
    plain validator instead would drop the rejected payload on the floor."""
    return _validated_or_quarantined(
        repo_root, set_slug, session_number, record, validate_review_claims,
        "review claims",
    )


def write_review_claims_twin(
    repo_root, set_slug: str, session_number: int, change_id: str, text: str
) -> Path:
    path = review_claims_twin_path(
        repo_root, set_slug, session_number, change_id
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return path


# --- checks.json -------------------------------------------------------------

def checks_path(
    repo_root, set_slug: str, session_number: int, change_id: str
) -> Path:
    return critique_path(
        repo_root, set_slug, session_number, change_id, CHECKS_FILENAME
    )


def read_checks(
    repo_root, set_slug: str, session_number: int, change_id: str
) -> list:
    def _validate_all(records):
        if not isinstance(records, list):
            raise LedgerError("checks.json does not hold a list of checks")
        for record in records:
            validate_check(record)
        return records

    records = _read_json(
        checks_path(repo_root, set_slug, session_number, change_id),
        _validate_all, "checks",
    )
    return records or []


def write_checks(
    repo_root, set_slug: str, session_number: int, change_id: str,
    records: list,
) -> Path:
    for record in records:
        _validated_or_quarantined(
            repo_root, set_slug, session_number, record, validate_check,
            "check",
        )
    return _atomic_write_json(
        checks_path(repo_root, set_slug, session_number, change_id),
        list(records),
    )


# --- worker-results.jsonl and dispositions.jsonl -----------------------------

def worker_results_path(
    repo_root, set_slug: str, session_number: int, change_id: str
) -> Path:
    return critique_path(
        repo_root, set_slug, session_number, change_id,
        WORKER_RESULTS_FILENAME,
    )


def dispositions_path(
    repo_root, set_slug: str, session_number: int, change_id: str
) -> Path:
    return critique_path(
        repo_root, set_slug, session_number, change_id, DISPOSITIONS_FILENAME
    )


def audits_path(
    repo_root, set_slug: str, session_number: int, change_id: str
) -> Path:
    return critique_path(
        repo_root, set_slug, session_number, change_id, AUDITS_FILENAME
    )


def _append_validated(
    repo_root, set_slug: str, session_number: int, record: dict, validate,
    noun: str, path_for, precheck=None,
) -> dict:
    _validated_or_quarantined(
        repo_root, set_slug, session_number, record, validate, noun
    )
    if precheck is not None:
        precheck(record)
    path = path_for(repo_root, set_slug, session_number, record["change_id"])
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(record) + "\n")
    return record


def read_worker_results(
    repo_root, set_slug: str, session_number: int, change_id: str
) -> list:
    return _read_jsonl(
        worker_results_path(repo_root, set_slug, session_number, change_id),
        validate_worker_result,
    )


def append_worker_result(
    repo_root, set_slug: str, session_number: int, record: dict
) -> dict:
    """One result per check per attempt. A second row for a check already
    decided in this attempt is not an append, it is a supersession — and a
    superseded ``blocked`` is exactly how "we ran it again with more
    context" turns into a pass. A remediation records a new attempt."""

    def _one_result_per_attempt(row: dict) -> None:
        for prior in read_worker_results(
            repo_root, set_slug, session_number, row["change_id"]
        ):
            if (prior["check_id"], prior["attempt"]) == (
                row["check_id"], row["attempt"]
            ):
                raise LedgerError(
                    f"check {prior['check_id']} already has a "
                    f"{prior['result']!r} result for attempt "
                    f"{prior['attempt']}; worker results are append-only and "
                    "a recorded result is never superseded within an attempt."
                )

    return _append_validated(
        repo_root, set_slug, session_number, record, validate_worker_result,
        "worker result", worker_results_path,
        precheck=_one_result_per_attempt,
    )


def read_dispositions(
    repo_root, set_slug: str, session_number: int, change_id: str
) -> list:
    return _read_jsonl(
        dispositions_path(repo_root, set_slug, session_number, change_id),
        validate_disposition,
    )


def append_disposition(
    repo_root, set_slug: str, session_number: int, record: dict
) -> dict:
    return _append_validated(
        repo_root, set_slug, session_number, record, validate_disposition,
        "disposition", dispositions_path,
    )
