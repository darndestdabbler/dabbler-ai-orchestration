"""The machine-only run ledger: ``.dabbler/runs/<set>/s<N>/rounds.jsonl``.

One row per completed verification round, appended only by the CLI
(``ai_router.verify``). The close gate reads it. There is no stamp and no
backstop: the record is trustworthy because nothing else writes it, and a
row that fails schema validation on read is a refusal, never a skip — a
hand-edited ledger blocks the close instead of passing it.

The directory lives outside the git working tree (``.dabbler/`` is
gitignored), so round artifacts never dirty the tree or explode the set
directory. Raw verifier output is saved beside the ledger for the operator
who wants to read it.
"""

from __future__ import annotations

import json
from pathlib import Path

import jsonschema

_SCHEMA_PATH = Path(__file__).parent / "schemas" / "rounds.schema.json"
_schema_cache: dict | None = None

RUNS_DIRNAME = ".dabbler/runs"


class LedgerError(RuntimeError):
    """The ledger is unreadable or fails validation. Fail closed: the
    caller must treat the verification record as absent, never guess."""


def _schema() -> dict:
    global _schema_cache
    if _schema_cache is None:
        _schema_cache = json.loads(_SCHEMA_PATH.read_text(encoding="utf-8"))
    return _schema_cache


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


def validate_round(record: dict) -> dict:
    try:
        jsonschema.validate(record, _schema())
    except jsonschema.ValidationError as exc:
        location = "/".join(str(p) for p in exc.absolute_path) or "(root)"
        raise LedgerError(
            f"round record failed schema validation at {location}: "
            f"{exc.message}"
        ) from exc
    return record


def read_rounds(repo_root, set_slug: str, session_number: int) -> list[dict]:
    """Every recorded round, ascending. Any unparseable or schema-invalid
    line raises :class:`LedgerError` — the ledger is machine-written, so a
    bad line is evidence of tampering or corruption, not noise to skip."""
    path = rounds_path(repo_root, set_slug, session_number)
    if not path.exists():
        return []
    rounds = []
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
        validate_round(record)
        rounds.append(record)
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
