"""The restricted-TOML record format both discovery paths write.

Two records exist — the seat catalog (empirical probe) and the direct-API
enumeration — and §5.b of the framework spec says they are the same record
shape: what exists, what was confirmed, and when. That is only true if one
piece of code renders both, so the renderer, the writer stamp, the content
digest and the hand-edit verdict live here rather than in either record's
module.

The format is deliberately small: one flat table then repeated flat tables,
holding scalars and flat arrays of strings. Nothing nested, so writing needs
no TOML library and the file stays legible to an operator who must never have
to edit it. Reading is stdlib ``tomllib``, which accepts far more than this
subset writes; a key this writer cannot render must be coerced where it
arrived from rather than admitted here.

**Unknown is written by omission.** An absent key and a null key are the same
fact and TOML has only the first, so a value a vendor stopped reporting drops
out of the file instead of becoming a placeholder that later reads as a
measurement.
"""

from __future__ import annotations

import hashlib
import math
import time
from pathlib import Path

PROVENANCE_MACHINE_WRITTEN = "machine-written"
PROVENANCE_HAND_EDITED = "hand-edited"
PROVENANCE_UNSTAMPED = "unstamped"

_TOML_STRING_ESCAPES = {
    "\\": "\\\\", '"': '\\"', "\n": "\\n", "\r": "\\r", "\t": "\\t",
}


def render_string(value: str) -> str:
    out = []
    for char in value:
        escaped = _TOML_STRING_ESCAPES.get(char)
        if escaped is not None:
            out.append(escaped)
        elif ord(char) < 0x20 or ord(char) == 0x7F:
            raise ValueError(
                f"catalog value contains an unrenderable control character "
                f"{char!r}"
            )
        else:
            out.append(char)
    return '"' + "".join(out) + '"'


def render_value(key: str, value) -> str:
    # bool first: it is an int subclass, and `true` must not render as `1`.
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        # repr is the shortest text that reads back as the same float, so a
        # sample survives a rewrite unchanged and the content digest holds.
        if not math.isfinite(value):
            raise ValueError(
                f"catalog key {key!r} holds a non-finite number, which is not "
                "a measurement of anything"
            )
        return repr(value)
    if isinstance(value, str):
        return render_string(value)
    if isinstance(value, (list, tuple)):
        if not all(isinstance(item, str) for item in value):
            raise ValueError(
                f"catalog key {key!r} holds an array the lockfile cannot "
                "represent: arrays are flat arrays of strings"
            )
        body = "".join(f"    {render_string(item)},\n" for item in value)
        return "[\n" + body + "]"
    raise ValueError(
        f"catalog key {key!r} holds a value the lockfile cannot represent: "
        f"{value!r} ({type(value).__name__}). Coerce it where it arrived "
        "from — a value the writer cannot render must never reach the writer."
    )


def set_or_drop(mapping: dict, key: str, value) -> None:
    """An absent key and a null key are the same fact, and TOML has only the
    first: unknown is written by omission, never by a placeholder."""
    if value is None:
        mapping.pop(key, None)
    else:
        mapping[key] = value


def render_table(header: str, mapping: dict) -> str:
    lines = [header]
    lines.extend(
        f"{key} = {render_value(key, value)}" for key, value in mapping.items()
    )
    return "\n".join(lines)


def render_document(tables) -> str:
    """``(header, mapping)`` pairs rendered as the whole file text."""
    return "\n\n".join(
        render_table(header, mapping) for header, mapping in tables
    ) + "\n"


def write_document(path, text: str) -> None:
    """Write record text with LF endings on every platform: the digest covers
    the bytes, so a CRLF rewrite on Windows would convict a clean file.

    The parent directory is created, because a record whose home does not
    exist yet is the first-run case rather than an error — the writer is the
    only sanctioned way to produce these files, so a missing directory here
    would mean the record simply cannot be made.
    """
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8", newline="\n")


def digest_text(text: str) -> str:
    return "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest()


def utc_now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def writer_id(module: str) -> str:
    from . import __version__

    return f"{module} {__version__}"


def provenance(
    *, stored_digest, recomputed_digest, written_by, written_at
) -> str:
    """How a record came to hold what it holds.

    A stamp stripped of its digest reads as hand-edited, not as unstamped:
    removing the line that would convict is itself the edit. A file carrying
    no stamp at all is merely older than the writer.

    Detection, not enforcement: an operator may still edit a record, but the
    record will say they did, and the value it carries is empirical or it is
    nothing. The digest covers rendered content and not the file's mtime,
    because these files are committed and every checkout rewrites mtime — a
    guard that fires on the innocent case teaches people to ignore it.
    """
    if not (stored_digest or written_by or written_at):
        return PROVENANCE_UNSTAMPED
    if stored_digest and stored_digest == recomputed_digest:
        return PROVENANCE_MACHINE_WRITTEN
    return PROVENANCE_HAND_EDITED
