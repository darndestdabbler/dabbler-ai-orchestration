"""Turns CSV text into records and rejections.

Owns the file format and nothing about what a person is: every field rule comes
from csv-model, and the header is checked against csv-model.FIELDS rather than
against a list repeated here.
"""

from dataclasses import dataclass, field
from pathlib import Path

from components.csv_model.src.model import (FIELDS, InvalidField,
                                            PersonRecord, check_field)

_BOM = "﻿"
DELIMITER = ","


class BadHeader(Exception):
    """The one fatal outcome. A caller handed an empty result could not tell
    a wrong file from an empty one."""


class BadEncoding(Exception):
    pass


@dataclass(frozen=True)
class Rejection:
    line: int
    raw: str
    reason: str


@dataclass(frozen=True)
class Reading:
    records: list = field(default_factory=list)
    rejections: list = field(default_factory=list)
    blank_lines: int = 0
    header_line: int = 1


def read_people(path):
    try:
        text = Path(path).read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        raise BadEncoding(f"not valid UTF-8 at byte {exc.start}") from exc
    if text.startswith(_BOM):
        text = text[len(_BOM):]

    lines = text.splitlines()
    records, rejections, blanks = [], [], 0
    header_at = None

    for number, raw in enumerate(lines, start=1):
        if not raw.strip():
            blanks += 1
            continue
        if header_at is None:
            header_at = number
            found = [c.strip() for c in raw.split(DELIMITER)]
            if tuple(found) != FIELDS:
                raise BadHeader("found: " + ", ".join(found))
            continue
        cells = raw.split(DELIMITER)
        if len(cells) != len(FIELDS):
            rejections.append(Rejection(
                number, raw,
                f"expected {len(FIELDS)} fields, found {len(cells)}"))
            continue
        try:
            values = [check_field(f, c) for f, c in zip(FIELDS, cells)]
        except InvalidField as exc:
            rejections.append(Rejection(number, raw, exc.reason))
            continue
        records.append(PersonRecord(*values))

    if header_at is None:
        raise BadHeader("found: nothing — the file has no header line")
    return Reading(records, rejections, blank_lines=blanks,
                   header_line=header_at)
