"""Set 068 S5 - the contract-test / CDC gate (the deterministic verification floor).

This module ships the **contract-test / CDC gate**: a deterministic, per-set,
opt-in floor that confirms a set's **contract / falsifier tests** actually ran
and passed at set close, and that they **cover every probeable defect class the
set declares**, reserving the (expensive) path-aware agent for the **non-probeable
residual**. It operationalizes the layered defense the Set 068 S4 routed
keep/demote/retire decision named (``routed-fate-decision.md`` 3): the
deterministic floor carries the ~95%-probeable bulk Experiment A's H4 found
(``experiment-a-regrade.md``), and the agent is reserved for the residual.

The full design is pinned in
``docs/session-sets/068-cadence-study-and-contract-gate/contract-gate-design.md``
and the canonical schema/doc in ``docs/contract-gate.md`` +
``docs/contract-manifest.schema.json`` + ``docs/contract-floor-result.schema.json``.

Three concerns live here, mirroring the Set 066 path-aware-critique shape so an
operator who knows one knows the other:

1. The **policy attribute** ``contractGate: none | advisory | required`` - seeded
   in spec.md's Session Set Configuration block, recorded **once at set start** to
   ``activity-log.json`` (its own ``kind`` so it never collides with the Set 057
   ``verification_mode`` or Set 066 ``path_aware_critique`` choice), and
   **immutable** after the first record. Default ``none`` (strictly opt-in).

2. The **declaration + result artifacts** and their pure-Python validators:
   ``contract-manifest.json`` (the operator-declared contract command + the
   seeded/known defect classes and how they are covered) and
   ``contract-floor-result.json`` (the raw result of running the contract command
   in the Set 068 S1 ``run_test`` disposable-worktree cage). The validators are
   pure-Python (no ``jsonschema``, a test-only optional dep) so ``close_session``
   keeps working with only the runtime deps installed; the JSON Schemas are the
   parallel structural contract. Per L-066-1 the validators type-check the
   **optional** fields the schema constrains and guard ``int`` vs ``bool`` for
   ``schemaVersion``.

3. The floor **producer** :func:`produce_contract_floor` (drives the S1 cage and
   writes the result - the only metered/effectful path) and the close-out
   **validator** :func:`validate_contract_gate` (posture-agnostic; the
   ``close_session`` caller decides hard-block-vs-soft-warn from the level,
   exactly like the Set 066 gate).

All functions are engine-agnostic: they read/write plain JSON and never require a
Python import from a Copilot/Codex/Gemini flow. Only :func:`produce_contract_floor`
executes a subprocess (via the S1 cage); everything else is pure file I/O.
"""

from __future__ import annotations

import json
import os
import tempfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Sequence, Tuple, Union

try:  # package vs bare-import (mirrors the rest of ai_router)
    from .session_log import STEP_STATUS_COMPLETE, require_step_status
except ImportError:  # pragma: no cover - test/bare context
    from session_log import (  # type: ignore[no-redef]
        STEP_STATUS_COMPLETE,
        require_step_status,
    )


# ---------------------------------------------------------------------------
# The contractGate policy attribute (mirrors path_aware_critique)
# ---------------------------------------------------------------------------

CONTRACT_GATE_NONE = "none"
CONTRACT_GATE_ADVISORY = "advisory"
CONTRACT_GATE_REQUIRED = "required"
CONTRACT_GATE_VALUES = (
    CONTRACT_GATE_NONE,
    CONTRACT_GATE_ADVISORY,
    CONTRACT_GATE_REQUIRED,
)
# Default when no durable record exists: opt-in, no gate. A set that declares
# nothing is treated as ``none`` - the close-out gate only fires on
# ``advisory``/``required``, so the default preserves current behavior on both
# tiers (Full tier's "walk away with no gate" promise).
DEFAULT_CONTRACT_GATE = CONTRACT_GATE_NONE
# The activity-log entry ``kind`` discriminator. Distinct from Set 057's
# ``verification_mode`` and Set 066's ``path_aware_critique`` so the contractGate
# choice never overloads either enum.
CONTRACT_GATE_ENTRY_KIND = "contract_gate"
# The kinds that carry a durable contractGate ``choice``. Kept as a tuple (like
# the Set 066 record kinds) so a future sanctioned-transition record kind can be
# added without changing the reader's "last valid entry of any record kind wins"
# rule. Only one kind exists today.
_CONTRACT_GATE_RECORD_KINDS = (CONTRACT_GATE_ENTRY_KIND,)


def _now_iso_utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def _write_activity_log_atomic(log_path: Path, log: dict) -> None:
    """Atomic temp-file-rename write of ``activity-log.json``.

    Kept local so this module is self-contained (mirrors
    :func:`ai_router.path_aware_critique._write_activity_log_atomic`).
    """
    log_dir = log_path.parent
    fd, tmp_path = tempfile.mkstemp(suffix=".activity-log.tmp", dir=str(log_dir))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as tmp_f:
            json.dump(log, tmp_f, indent=2)
            tmp_f.write("\n")
        os.replace(tmp_path, log_path)
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


def _read_activity_entries(
    log_path: Path,
) -> Tuple[List[dict], bool]:
    """Load ``activity-log.json`` and return ``(entries, malformed)``.

    ``entries`` is the list of dict entries (non-dict entries are skipped for
    tolerant reading; possibly empty). ``malformed`` is True iff the file EXISTS
    but is corrupt in a way that could HIDE a durable record: it is unparseable
    (JSON / IO / invalid-UTF-8 error), the top level is not an object,
    ``entries`` is present but not a list, OR ``entries`` contains any non-dict
    element (a durable record that decayed into a non-dict would otherwise vanish
    with no signal). A missing file, or a parseable object whose ``entries`` is a
    list of dicts (even empty), is NOT malformed.

    This is the shared shape-guard the policy readers use so a corrupt-but-
    JSON-parseable log (e.g. top-level ``[]``, ``{"entries": "x"}``,
    ``{"entries": ["junk"]}``, or invalid UTF-8 bytes) can never raise past the
    readers' "never raises" contract, and is surfaced loudly by
    :func:`contract_gate_record_unreadable` instead of silently disarming a
    ``required`` gate (gpt-5-4 S5 verification rounds 1-2, Major). ``UnicodeError``
    is caught explicitly: it is a ``ValueError`` subclass but NOT a
    ``json.JSONDecodeError``, so invalid UTF-8 bytes would otherwise escape.
    """
    if not log_path.exists():
        return [], False
    try:
        with log_path.open("r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, UnicodeError, json.JSONDecodeError):
        return [], True
    if not isinstance(data, dict):
        return [], True
    entries = data.get("entries", [])
    if not isinstance(entries, list):
        return [], True
    dict_entries = [e for e in entries if isinstance(e, dict)]
    # Any non-dict element is structural corruption for this durable-record
    # format: keep reads tolerant (scan the dicts) but flag it so the unreadable
    # check warns and the writer refuses (gpt-5-4 S5 verification R2, Major 2).
    malformed = len(dict_entries) != len(entries)
    return dict_entries, malformed


def read_contract_gate(session_set_dir: Union[str, Path]) -> str:
    """Return the durable ``contractGate`` record, or the default.

    Walks ``activity-log.json`` for entries with ``kind == "contract_gate"``
    (the once-at-set-start capture) and returns the most recent valid ``choice``
    - the last valid entry in file order wins. Returns
    :data:`DEFAULT_CONTRACT_GATE` (``none``) when no record exists or on any read
    error (including a malformed-but-parseable log shape) - the feature is opt-in,
    so "not recorded" means no gate, and this reader NEVER raises.

    Note: an optional spec-config ``contractGate`` field seeds the once-at-set-
    start capture, but it is NOT the durable record - only the activity-log entry
    is. This reader intentionally consults the durable record only.
    """
    log_path = Path(session_set_dir) / "activity-log.json"
    entries, _malformed = _read_activity_entries(log_path)
    chosen = DEFAULT_CONTRACT_GATE
    for entry in entries:
        if entry.get("kind") not in _CONTRACT_GATE_RECORD_KINDS:
            continue
        choice = entry.get("choice")
        if choice in CONTRACT_GATE_VALUES:
            chosen = choice
    return chosen


def read_spec_contract_gate(
    session_set_dir: Union[str, Path],
) -> Optional[str]:
    """Return the optional ``contractGate`` seed from spec.md config.

    A Session Set Configuration ``contractGate`` field may **seed** the
    once-at-set-start capture, but it is NOT the durable record. Returns the
    value when it is a recognized level, else ``None``. Never raises - a
    malformed spec degrades to "no seed". Reuses the shared config-block
    extractor so the attribute is parsed exactly like ``tier`` /
    ``pathAwareCritique`` (no separate parser).
    """
    spec_path = Path(session_set_dir) / "spec.md"
    if not spec_path.is_file():
        return None
    try:
        spec_path.read_text(encoding="utf-8")
    except OSError:
        return None
    try:
        from session_state import (  # type: ignore[import-not-found]
            _extract_session_set_configuration_block,
        )
    except ImportError:  # pragma: no cover - import shim
        from .session_state import (  # type: ignore[no-redef]
            _extract_session_set_configuration_block,
        )
    text = spec_path.read_text(encoding="utf-8")
    block = _extract_session_set_configuration_block(text) or {}
    value = block.get("contractGate")
    if isinstance(value, str) and value in CONTRACT_GATE_VALUES:
        return value
    return None


def has_contract_gate_record(session_set_dir: Union[str, Path]) -> bool:
    """Return True iff a durable contractGate record already exists.

    Used by the start-of-set capture wiring to make recording idempotent: the
    seed-from-spec path records only when no durable choice exists yet, which is
    what enforces the once-at-set-start immutability.
    """
    log_path = Path(session_set_dir) / "activity-log.json"
    entries, _malformed = _read_activity_entries(log_path)
    return any(
        entry.get("kind") in _CONTRACT_GATE_RECORD_KINDS
        and entry.get("choice") in CONTRACT_GATE_VALUES
        for entry in entries
    )


def contract_gate_record_unreadable(
    session_set_dir: Union[str, Path],
) -> bool:
    """True iff ``activity-log.json`` EXISTS but cannot be parsed.

    Distinguishes "no durable record" (absent, or present-and-parseable but
    carrying no ``contract_gate`` entry -> a legitimate ``none`` opt-out) from
    "the durable record is present but UNREADABLE" (the file exists but is corrupt
    JSON). :func:`read_contract_gate` collapses the unreadable case to the default
    ``none`` so it never raises; on its own that means a corrupt activity log
    would let a set that opted into ``required`` close as if it had no gate - a
    *silent* disarm. The close-out gate calls this to surface the unreadable case
    as a loud warning instead of silently skipping (mirrors the Set 066 S3
    dogfood fix). Returns ``False`` when the file is absent or parses cleanly into
    a well-shaped log; ``True`` when the file exists and parsing fails (JSON / IO /
    invalid UTF-8) OR the parsed shape is structurally invalid in a way that could
    hide a record (top level not an object, ``entries`` not a list, or ``entries``
    contains a non-dict element) - a corrupt-but-parseable log must NOT silently
    disarm a ``required`` gate (gpt-5-4 S5 verification rounds 1-2, Major).
    """
    log_path = Path(session_set_dir) / "activity-log.json"
    _entries, malformed = _read_activity_entries(log_path)
    return malformed


def record_contract_gate(
    session_set_dir: Union[str, Path],
    value: str,
    *,
    session_number: int = 1,
    step_number: Optional[int] = None,
) -> None:
    """Append a ``contract_gate`` entry to ``activity-log.json``.

    The durable record. Mirrors :func:`ai_router.path_aware_critique.
    record_path_aware_critique` (atomic temp-file rename, UTC timestamp). Raises
    ``ValueError`` on an unknown value and ``FileNotFoundError`` if the activity
    log is missing (the set must have started first - this helper does not create
    the file). Exposed so the gate/producer and the tests have a sanctioned
    writer and can build fixtures without hand-editing the activity log.
    """
    if value not in CONTRACT_GATE_VALUES:
        raise ValueError(
            f"unknown contractGate {value!r}; expected one of "
            f"{CONTRACT_GATE_VALUES}"
        )
    log_path = Path(session_set_dir) / "activity-log.json"
    if not log_path.exists():
        raise FileNotFoundError(
            f"activity-log.json not found at {log_path}; the session set must "
            "exist and have started before recording a contractGate"
        )
    with log_path.open("r", encoding="utf-8") as f:
        log = json.load(f)
    # Shape-guard the sanctioned writer too: a malformed-but-parseable log
    # (top level not an object, or ``entries`` not a list) must fail with a
    # controlled error, not an AttributeError on ``.setdefault`` /
    # ``max(... e.get ...)`` (gpt-5-4 S5 verification, Major).
    if not isinstance(log, dict):
        raise ValueError(
            f"activity-log.json at {log_path} is not a JSON object; cannot "
            "record a contractGate into a malformed log."
        )
    entries = log.setdefault("entries", [])
    if not isinstance(entries, list):
        raise ValueError(
            f"activity-log.json at {log_path} has a non-list 'entries'; cannot "
            "record a contractGate into a malformed log."
        )
    if any(not isinstance(e, dict) for e in entries):
        raise ValueError(
            f"activity-log.json at {log_path} has a non-dict entry; cannot "
            "record a contractGate into a corrupt log (gpt-5-4 S5 R2)."
        )
    if step_number is None:
        step_number = (
            max(
                (
                    int(e.get("stepNumber", 0))
                    for e in entries
                    if isinstance(e, dict)
                    and e.get("sessionNumber") == session_number
                ),
                default=0,
            )
            + 1
        )
    entry = {
        "sessionNumber": session_number,
        "stepNumber": step_number,
        "stepKey": f"session-{session_number:03d}/contract-gate",
        "dateTime": _now_iso_utc(),
        "description": f"Operator set contractGate: {value}.",
        "status": require_step_status(STEP_STATUS_COMPLETE),
        "kind": CONTRACT_GATE_ENTRY_KIND,
        "choice": value,
    }
    entries.append(entry)
    _write_activity_log_atomic(log_path, log)


def resolve_and_record_contract_gate(
    session_set_dir: Union[str, Path],
    *,
    cli_choice: Optional[str] = None,
    session_number: int = 1,
) -> Optional[str]:
    """Capture the ``contractGate`` choice once at set start.

    The start_session caller. The choice is recorded **once at set start and is
    immutable thereafter** - allowing a later write would let a mid-set
    ``--contract-gate none`` silently disable the close-out gate after the set had
    already opted in to ``required``. Once any valid record exists this is a no-op
    (returns ``None``).

    On the first call (no record yet) the resolution precedence is:
    1. ``cli_choice`` (an explicit ``--contract-gate`` flag).
    2. The spec.md config ``contractGate`` seed.

    Records nothing (returns ``None``) when neither source yields a value - the
    feature stays strictly opt-in and the default ``none`` continues to apply
    implicitly. Creates a minimal ``activity-log.json`` if one does not exist yet.
    A bad ``cli_choice`` always raises ``ValueError`` (even when a record already
    exists, so the validation surface is stable), but a missing activity log is
    created rather than raising.
    """
    if cli_choice is not None and cli_choice not in CONTRACT_GATE_VALUES:
        raise ValueError(
            f"unknown contractGate {cli_choice!r}; expected one of "
            f"{CONTRACT_GATE_VALUES}"
        )
    if has_contract_gate_record(session_set_dir):
        return None
    chosen: Optional[str] = cli_choice
    if chosen is None:
        chosen = read_spec_contract_gate(session_set_dir)
    if chosen is None:
        return None

    log_path = Path(session_set_dir) / "activity-log.json"
    if not log_path.exists():
        set_name = Path(session_set_dir).name
        minimal = {
            "sessionSetName": set_name,
            "createdDate": _now_iso_utc(),
            "totalSessions": 0,
            "entries": [],
        }
        with log_path.open("w", encoding="utf-8") as f:
            json.dump(minimal, f, indent=2)
            f.write("\n")
    record_contract_gate(session_set_dir, chosen, session_number=session_number)
    return chosen


# ---------------------------------------------------------------------------
# Artifact filenames + schema constants
# ---------------------------------------------------------------------------

CONTRACT_MANIFEST_FILENAME = "contract-manifest.json"
CONTRACT_FLOOR_RESULT_FILENAME = "contract-floor-result.json"
# Supported envelope schema version(s) for both artifacts.
CONTRACT_ARTIFACT_SCHEMA_VERSIONS = (1,)

# Closed envelope key-sets (additionalProperties: false in the JSON Schemas).
_MANIFEST_TOP_LEVEL_KEYS = frozenset(
    {
        "schemaVersion",
        "sessionSetName",
        "contractGate",
        "command",
        "defectClasses",
        "notes",
    }
)
_DEFECT_CLASS_KEYS = frozenset(
    {"id", "description", "probeable", "coveredBy"}
)
_FLOOR_RESULT_TOP_LEVEL_KEYS = frozenset(
    {
        "schemaVersion",
        "sessionSetName",
        "contractGate",
        "ref",
        "command",
        "ran",
        "passed",
        "exitCode",
        "timedOut",
        "wallSeconds",
        "worktreeCreated",
        "worktreeRemoved",
        "producedAt",
        "output",
    }
)

# Stable machine tokens (artifact validation).
ARTIFACT_VALID = "valid"
ARTIFACT_MISSING_FILE = "missing-file"
ARTIFACT_UNREADABLE = "unreadable"
ARTIFACT_NOT_AN_OBJECT = "not-an-object"
ARTIFACT_SCHEMA_INVALID = "schema-invalid"


# ---------------------------------------------------------------------------
# Manifest validation
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ContractManifestResult:
    """Outcome of :func:`validate_contract_manifest`.

    ``ok`` is True only for a structurally-valid manifest with at least one
    defect class. ``code`` is a stable machine token (one of the ``ARTIFACT_*``
    constants). ``reasons`` carries human-readable, ASCII-only detail. The
    identity/coverage fields are populated on the ``ok=True`` path so the
    close-out gate can confirm the manifest belongs to *this* set and compute the
    probeable-coverage / non-probeable-residual split without re-parsing.
    """

    ok: bool
    code: str
    reasons: Tuple[str, ...]
    session_set_name: Optional[str] = None
    gate_level: Optional[str] = None
    command: Tuple[str, ...] = ()
    probeable_total: int = 0
    probeable_covered: int = 0
    uncovered_probeable_ids: Tuple[str, ...] = ()
    residual_ids: Tuple[str, ...] = ()


def _is_nonempty_str(value) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_str_argv(value) -> bool:
    return (
        isinstance(value, list)
        and len(value) > 0
        and all(_is_nonempty_str(item) for item in value)
    )


def _load_json_artifact(
    artifact: Union[str, Path, dict],
) -> Tuple[Optional[dict], Optional[str], Optional[str]]:
    """Load an artifact dict; return ``(data, code, reason)``.

    ``(dict, None, None)`` on success. On failure ``data`` is None and
    ``(code, reason)`` name the failure (missing-file / unreadable /
    not-an-object). Accepts an already-loaded dict (returned as-is).
    """
    if isinstance(artifact, (str, Path)):
        path = Path(artifact)
        if not path.exists():
            return None, ARTIFACT_MISSING_FILE, f"artifact not found at {path}"
        try:
            with path.open("r", encoding="utf-8") as f:
                data = json.load(f)
        except (OSError, json.JSONDecodeError, UnicodeError) as exc:
            # UnicodeError (invalid UTF-8 bytes) is a ValueError, NOT an OSError
            # or JSONDecodeError, so it would otherwise escape the validators'
            # never-raising contract and crash close-out (Set 068 S6 whole-set
            # critique, GPT-5.4, Major; same class as the S5 activity-log fix).
            return None, ARTIFACT_UNREADABLE, f"could not read artifact JSON: {exc}"
    else:
        data = artifact
    if not isinstance(data, dict):
        return None, ARTIFACT_NOT_AN_OBJECT, "artifact top level is not a JSON object"
    return data, None, None


def _check_schema_version_and_identity(
    data: dict, reasons: List[str]
) -> Tuple[Optional[str], Optional[str], Tuple[str, ...]]:
    """Shared schemaVersion + sessionSetName + contractGate + command checks.

    Appends any problems to ``reasons`` and returns
    ``(session_set_name, gate_level, command)`` (best-effort; values are returned
    even when malformed so callers can still surface them).
    """
    version = data.get("schemaVersion")
    # Must be a true int (not bool, not float) to match the JSON Schema's
    # ``"type": "integer"``; ``1.0 in (1,)`` and ``True in (1,)`` are truthy in
    # Python, so without an explicit guard a float/bool version passes the
    # pure-Python validator while failing strict JSON Schema evaluation (L-066-1).
    if (
        not isinstance(version, int)
        or isinstance(version, bool)
        or version not in CONTRACT_ARTIFACT_SCHEMA_VERSIONS
    ):
        reasons.append(
            f"schemaVersion {version!r} is not one of "
            f"{CONTRACT_ARTIFACT_SCHEMA_VERSIONS} (must be an integer)"
        )
    set_name = data.get("sessionSetName")
    if not _is_nonempty_str(set_name):
        reasons.append("sessionSetName is missing or empty")
    level = data.get("contractGate")
    if level not in CONTRACT_GATE_VALUES:
        reasons.append(
            f"contractGate {level!r} is not one of {CONTRACT_GATE_VALUES}"
        )
    command = data.get("command")
    if not _is_str_argv(command):
        reasons.append(
            "command is missing or not a non-empty array of non-empty strings"
        )
    cmd_tuple = (
        tuple(str(c) for c in command) if isinstance(command, list) else ()
    )
    name = set_name if isinstance(set_name, str) else None
    lvl = level if isinstance(level, str) else None
    return name, lvl, cmd_tuple


def validate_contract_manifest(
    artifact: Union[str, Path, dict],
) -> ContractManifestResult:
    """Validate a ``contract-manifest.json`` declaration.

    Accepts an already-loaded ``dict`` or a path. Pure-Python (no ``jsonschema``)
    so it runs wherever only the runtime deps are installed; the JSON Schema at
    ``docs/contract-manifest.schema.json`` is the parallel structural contract.

    Enforced (see ``docs/contract-gate.md``):
    - top level is an object with ``schemaVersion`` (a supported int), a non-empty
      ``sessionSetName``, a ``contractGate`` level, and a non-empty ``command``
      argv (list of non-empty strings);
    - ``defectClasses`` is a non-empty array; each entry has a non-empty ``id``
      and ``description``, a boolean ``probeable``, and a ``coveredBy`` array of
      non-empty strings; ids are unique;
    - a ``probeable: true`` class MUST name at least one ``coveredBy`` test (the
      floor must carry it) - an uncovered probeable class is a schema-valid but
      gate-failing manifest (reported via ``uncovered_probeable_ids``, NOT a
      structural error).

    Never raises; returns a :class:`ContractManifestResult`.
    """
    data, code, reason = _load_json_artifact(artifact)
    if data is None:
        return ContractManifestResult(
            ok=False, code=code or ARTIFACT_UNREADABLE, reasons=(reason or "",)
        )

    reasons: List[str] = []
    extra = sorted(set(data) - _MANIFEST_TOP_LEVEL_KEYS)
    if extra:
        reasons.append(f"unknown top-level key(s): {extra}")

    set_name, level, command = _check_schema_version_and_identity(data, reasons)

    notes = data.get("notes")
    if notes is not None and not isinstance(notes, str):
        reasons.append("notes, when present, must be a string")

    defect_classes = data.get("defectClasses")
    if not isinstance(defect_classes, list) or not defect_classes:
        reasons.append("defectClasses is missing or not a non-empty array")
        return ContractManifestResult(
            ok=False,
            code=ARTIFACT_SCHEMA_INVALID,
            reasons=tuple(reasons),
            session_set_name=set_name,
            gate_level=level,
            command=command,
        )

    seen_ids: set = set()
    probeable_total = 0
    probeable_covered = 0
    uncovered_probeable: List[str] = []
    residual: List[str] = []
    for i, dc in enumerate(defect_classes):
        if not isinstance(dc, dict):
            reasons.append(f"defectClasses[{i}] is not an object")
            continue
        extra_dc = sorted(set(dc) - _DEFECT_CLASS_KEYS)
        if extra_dc:
            reasons.append(f"defectClasses[{i}] unknown key(s): {extra_dc}")
        dc_id = dc.get("id")
        if not _is_nonempty_str(dc_id):
            reasons.append(f"defectClasses[{i}].id is missing or empty")
        elif dc_id in seen_ids:
            reasons.append(f"defectClasses[{i}].id {dc_id!r} is a duplicate")
        else:
            seen_ids.add(dc_id)
        if not _is_nonempty_str(dc.get("description")):
            reasons.append(
                f"defectClasses[{i}].description is missing or empty"
            )
        probeable = dc.get("probeable")
        if not isinstance(probeable, bool):
            reasons.append(
                f"defectClasses[{i}].probeable must be a boolean"
            )
        covered_by = dc.get("coveredBy")
        # ``coveredBy`` is optional only for a non-probeable class (residual);
        # when present it must be an array of non-empty strings. An empty list is
        # valid structurally (the probeable-coverage rule below decides the gate).
        if covered_by is None:
            covered_by = []
        if not isinstance(covered_by, list) or not all(
            _is_nonempty_str(c) for c in covered_by
        ):
            reasons.append(
                f"defectClasses[{i}].coveredBy must be an array of non-empty "
                "strings"
            )
            covered_by = []

        label = dc_id if _is_nonempty_str(dc_id) else f"index-{i}"
        if probeable is True:
            probeable_total += 1
            if covered_by:
                probeable_covered += 1
            else:
                uncovered_probeable.append(label)
        elif probeable is False:
            residual.append(label)

    if reasons:
        return ContractManifestResult(
            ok=False,
            code=ARTIFACT_SCHEMA_INVALID,
            reasons=tuple(reasons),
            session_set_name=set_name,
            gate_level=level,
            command=command,
            probeable_total=probeable_total,
            probeable_covered=probeable_covered,
            uncovered_probeable_ids=tuple(uncovered_probeable),
            residual_ids=tuple(residual),
        )

    return ContractManifestResult(
        ok=True,
        code=ARTIFACT_VALID,
        reasons=(),
        session_set_name=set_name,
        gate_level=level,
        command=command,
        probeable_total=probeable_total,
        probeable_covered=probeable_covered,
        uncovered_probeable_ids=tuple(uncovered_probeable),
        residual_ids=tuple(residual),
    )


# ---------------------------------------------------------------------------
# Floor-result validation
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ContractFloorResultValidation:
    """Outcome of :func:`validate_contract_floor_result`.

    ``ok`` is True only for a structurally-valid result. ``passed`` echoes the
    recorded floor pass/fail (``ran`` and ``exitCode == 0`` and not ``timedOut``
    and the worktree was torn down) so the gate can branch on it without
    re-deriving. Identity fields are populated on the ``ok=True`` path.
    """

    ok: bool
    code: str
    reasons: Tuple[str, ...]
    passed: bool = False
    session_set_name: Optional[str] = None
    gate_level: Optional[str] = None
    command: Tuple[str, ...] = ()
    exit_code: Optional[int] = None
    timed_out: bool = False


def validate_contract_floor_result(
    artifact: Union[str, Path, dict],
) -> ContractFloorResultValidation:
    """Validate a ``contract-floor-result.json`` artifact.

    Pure-Python; the JSON Schema at ``docs/contract-floor-result.schema.json`` is
    the parallel structural contract. Enforced: ``schemaVersion`` (supported int),
    non-empty ``sessionSetName`` / ``contractGate`` / ``command`` argv, boolean
    ``ran`` / ``passed`` / ``timedOut`` / ``worktreeCreated`` / ``worktreeRemoved``,
    and an ``exitCode`` that is an int or null. The derived ``passed`` flag is the
    floor pass criterion: ``ran`` AND ``exitCode == 0`` AND not ``timedOut`` AND
    ``worktreeRemoved`` (a leaked/timed-out/failed/non-run result is NOT a floor)
    - and it must AGREE with the recorded ``passed`` field (a mismatch is a
    tampered/incoherent result and fails validation).
    """
    data, code, reason = _load_json_artifact(artifact)
    if data is None:
        return ContractFloorResultValidation(
            ok=False, code=code or ARTIFACT_UNREADABLE, reasons=(reason or "",)
        )

    reasons: List[str] = []
    extra = sorted(set(data) - _FLOOR_RESULT_TOP_LEVEL_KEYS)
    if extra:
        reasons.append(f"unknown top-level key(s): {extra}")

    set_name, level, command = _check_schema_version_and_identity(data, reasons)

    for bool_field in (
        "ran",
        "passed",
        "timedOut",
        "worktreeCreated",
        "worktreeRemoved",
    ):
        if not isinstance(data.get(bool_field), bool):
            reasons.append(f"{bool_field} must be a boolean")

    exit_code = data.get("exitCode")
    if exit_code is not None and (
        not isinstance(exit_code, int) or isinstance(exit_code, bool)
    ):
        reasons.append("exitCode must be an integer or null")

    ref = data.get("ref")
    if ref is not None and not _is_nonempty_str(ref):
        reasons.append("ref, when present, must be a non-empty string")
    for opt_num in ("wallSeconds",):
        val = data.get(opt_num)
        if val is not None and (
            isinstance(val, bool) or not isinstance(val, (int, float))
        ):
            reasons.append(f"{opt_num}, when present, must be a number")
    for opt_str in ("producedAt", "output"):
        val = data.get(opt_str)
        if val is not None and not isinstance(val, str):
            reasons.append(f"{opt_str}, when present, must be a string")

    if reasons:
        return ContractFloorResultValidation(
            ok=False,
            code=ARTIFACT_SCHEMA_INVALID,
            reasons=tuple(reasons),
            session_set_name=set_name,
            gate_level=level,
            command=command,
        )

    ran = bool(data.get("ran"))
    timed_out = bool(data.get("timedOut"))
    worktree_removed = bool(data.get("worktreeRemoved"))
    derived_passed = (
        ran and exit_code == 0 and not timed_out and worktree_removed
    )
    recorded_passed = bool(data.get("passed"))
    if derived_passed != recorded_passed:
        return ContractFloorResultValidation(
            ok=False,
            code=ARTIFACT_SCHEMA_INVALID,
            reasons=(
                "recorded 'passed' does not agree with the floor pass criterion "
                f"(ran={ran}, exitCode={exit_code!r}, timedOut={timed_out}, "
                f"worktreeRemoved={worktree_removed} => passed should be "
                f"{derived_passed}, but the artifact records {recorded_passed})",
            ),
            session_set_name=set_name,
            gate_level=level,
            command=command,
            exit_code=exit_code if isinstance(exit_code, int) else None,
            timed_out=timed_out,
        )

    return ContractFloorResultValidation(
        ok=True,
        code=ARTIFACT_VALID,
        reasons=(),
        passed=derived_passed,
        session_set_name=set_name,
        gate_level=level,
        command=command,
        exit_code=exit_code if isinstance(exit_code, int) else None,
        timed_out=timed_out,
    )


def find_contract_manifest(
    session_set_dir: Union[str, Path],
) -> Optional[Path]:
    """Return the path to the set's contract manifest, or ``None``."""
    candidate = Path(session_set_dir) / CONTRACT_MANIFEST_FILENAME
    return candidate if candidate.is_file() else None


def find_contract_floor_result(
    session_set_dir: Union[str, Path],
) -> Optional[Path]:
    """Return the path to the set's floor-result artifact, or ``None``."""
    candidate = Path(session_set_dir) / CONTRACT_FLOOR_RESULT_FILENAME
    return candidate if candidate.is_file() else None


# ---------------------------------------------------------------------------
# The floor producer (the only effectful path - drives the Set 068 S1 cage)
# ---------------------------------------------------------------------------


class ContractGateError(Exception):
    """A producer-side failure (no manifest, unreadable, not a git repo)."""


@dataclass
class ProduceFloorResult:
    """Outcome of :func:`produce_contract_floor`."""

    ok: bool
    result_path: Optional[str]
    passed: bool
    reasons: List[str] = field(default_factory=list)
    raw: Optional[dict] = None


def produce_contract_floor(
    session_set_dir: Union[str, Path],
    *,
    repo_root: Union[str, Path],
    ref: str = "HEAD",
    caps=None,
    config: Optional[dict] = None,
) -> ProduceFloorResult:
    """Run the manifest's contract command in the S1 cage and write the result.

    The effectful producer (mirrors ``pull_critique.produce_path_aware_critique``
    for the path-aware gate). Reads + validates ``contract-manifest.json``, runs
    its ``command`` in a disposable, detached git worktree of ``repo_root`` at
    ``ref`` via :func:`ai_router.run_test_sandbox.run_test_in_cage` (crash-safe,
    capped, raw result - never summarized), and writes
    ``contract-floor-result.json`` beside the manifest.

    ``caps`` (a :class:`RunTestCaps`) bounds the run; when omitted it is sourced
    from ``config`` via :func:`run_test_caps_from_config` (the router-config
    ``pull_verifier.run_test.caps`` block), falling back to the cage defaults.

    Raises :class:`ContractGateError` for a missing/invalid manifest (the producer
    cannot run without a valid declaration). A command that fails/times out is NOT
    an error here - it is recorded faithfully (``passed=False``); the close-out
    gate decides what a non-passing floor means.
    """
    set_dir = Path(session_set_dir)
    manifest_path = find_contract_manifest(set_dir)
    if manifest_path is None:
        raise ContractGateError(
            f"no {CONTRACT_MANIFEST_FILENAME} found at {set_dir}; declare the "
            "contract command + defect classes before producing the floor."
        )
    manifest = validate_contract_manifest(manifest_path)
    if not manifest.ok:
        raise ContractGateError(
            f"{CONTRACT_MANIFEST_FILENAME} is invalid ({manifest.code}): "
            f"{'; '.join(manifest.reasons)}"
        )

    try:
        from run_test_sandbox import (  # type: ignore[import-not-found]
            run_test_in_cage,
            run_test_caps_from_config,
        )
    except ImportError:  # pragma: no cover - import shim
        from .run_test_sandbox import (  # type: ignore[no-redef]
            run_test_in_cage,
            run_test_caps_from_config,
        )

    if caps is None:
        caps = run_test_caps_from_config(config)

    run = run_test_in_cage(
        repo_root, ref, list(manifest.command), caps=caps
    )

    floor: dict = {
        "schemaVersion": 1,
        "sessionSetName": manifest.session_set_name,
        "contractGate": manifest.gate_level,
        "ref": ref,
        "command": list(manifest.command),
        "ran": run.ran,
        "passed": run.passed and run.worktree_removed,
        "exitCode": run.exit_code,
        "timedOut": run.timed_out,
        "wallSeconds": round(run.wall_seconds, 2),
        "worktreeCreated": run.worktree_created,
        "worktreeRemoved": run.worktree_removed,
        "producedAt": _now_iso_utc(),
        "output": run.output if run.output else (run.error or ""),
    }
    result_path = set_dir / CONTRACT_FLOOR_RESULT_FILENAME
    with result_path.open("w", encoding="utf-8") as f:
        json.dump(floor, f, indent=2)
        f.write("\n")

    reasons: List[str] = []
    if run.error:
        reasons.append(f"cage error: {run.error}")
    if run.ran and not run.worktree_removed:
        reasons.append("disposable worktree teardown did not complete (leak)")
    if run.timed_out:
        reasons.append("contract command timed out")
    return ProduceFloorResult(
        ok=floor["passed"],
        result_path=str(result_path),
        passed=bool(floor["passed"]),
        reasons=reasons,
        raw=floor,
    )


# ---------------------------------------------------------------------------
# The close-out gate (posture-agnostic; mirrors the Set 066 path-aware gate)
# ---------------------------------------------------------------------------

_GATE_CORRECTIVE = (
    "Declare the contract command + defect classes in "
    f"{CONTRACT_MANIFEST_FILENAME}, then run the floor with "
    "`python -m ai_router.contract_gate run --session-set-dir <dir> "
    "--repo-root <repo>` so a passing "
    f"{CONTRACT_FLOOR_RESULT_FILENAME} exists, and re-run close_session. Every "
    "probeable defect class must name at least one covering contract test; "
    "non-probeable classes are reserved for the path-aware critique. See "
    "docs/contract-gate.md."
)


@dataclass(frozen=True)
class ContractGateResult:
    """Outcome of :func:`validate_contract_gate`.

    ``level`` is the durable recorded policy. ``applicable`` is False only when
    ``level == none`` (no-op, ``ok=True``). When applicable, ``ok`` reports
    whether a valid manifest + a passing, identity-matched floor result exist AND
    every probeable defect class is covered. ``reason`` explains the verdict
    (ASCII-only); ``corrective`` carries the one-line operator action when ``ok``
    is False. ``residual_ids`` lists the non-probeable defect classes reserved for
    the path-aware agent (reported even on the ``ok=True`` path). The
    hard-block-vs-soft-warn posture is the CALLER's decision (Set 066 model):
    ``required`` hard-blocks TTY / soft-warns headless; ``advisory`` always
    soft-warns; ``none`` skips. This validator is posture-agnostic and never
    raises.
    """

    level: str
    applicable: bool
    ok: bool
    reason: str
    corrective: str = ""
    residual_ids: Tuple[str, ...] = ()
    manifest_result: Optional[ContractManifestResult] = None
    floor_result: Optional[ContractFloorResultValidation] = None


def validate_contract_gate(
    session_set_dir: Union[str, Path],
) -> ContractGateResult:
    """Confirm a passing, coverage-complete contract floor for the recorded policy.

    Reads the durable ``contractGate`` record and:
    - ``none`` -> ``applicable=False, ok=True`` (no-op);
    - ``advisory`` / ``required`` -> validates the manifest + the floor result and
      the probeable-coverage rule.

    The gate is ``ok`` iff ALL hold:
    1. a valid ``contract-manifest.json`` whose ``sessionSetName`` / ``contractGate``
       match this set (identity check - a stale/copied manifest must not satisfy
       the gate, mirroring the Set 066 S3 dogfood fix);
    2. every ``probeable: true`` defect class names >=1 covering test;
    3. a valid ``contract-floor-result.json`` whose ``sessionSetName`` matches this
       set and whose ``command`` matches the manifest's (the floor that ran is the
       floor that was declared);
    4. that floor **passed** (``ran`` and ``exitCode == 0``, not ``timedOut``,
       worktree torn down).

    Never raises - a missing/unreadable artifact is reported as ``ok=False`` with
    a corrective, so the close-out gate decides posture rather than crashing.
    Tier-orthogonal (consults only the tier-independent ``contractGate`` record).
    """
    level = read_contract_gate(session_set_dir)
    if level == CONTRACT_GATE_NONE:
        return ContractGateResult(
            level=level,
            applicable=False,
            ok=True,
            reason="contractGate is 'none'; no contract-test gate (no-op).",
        )

    expected_name = Path(session_set_dir).resolve().name

    manifest_path = find_contract_manifest(session_set_dir)
    if manifest_path is None:
        return ContractGateResult(
            level=level,
            applicable=True,
            ok=False,
            reason=(
                f"contractGate={level} but no {CONTRACT_MANIFEST_FILENAME} "
                "manifest was found at the session-set root."
            ),
            corrective=_GATE_CORRECTIVE,
        )
    manifest = validate_contract_manifest(manifest_path)
    if not manifest.ok:
        return ContractGateResult(
            level=level,
            applicable=True,
            ok=False,
            reason=(
                f"contractGate={level} but {CONTRACT_MANIFEST_FILENAME} is "
                f"invalid ({manifest.code}): {'; '.join(manifest.reasons)}"
            ),
            corrective=_GATE_CORRECTIVE,
            manifest_result=manifest,
        )

    # Manifest identity check.
    mismatches: List[str] = []
    if manifest.session_set_name != expected_name:
        mismatches.append(
            f"manifest sessionSetName {manifest.session_set_name!r} does not "
            f"match this set {expected_name!r}"
        )
    if manifest.gate_level != level:
        mismatches.append(
            f"manifest contractGate {manifest.gate_level!r} does not match the "
            f"recorded policy {level!r}"
        )
    if mismatches:
        return ContractGateResult(
            level=level,
            applicable=True,
            ok=False,
            reason=(
                f"contractGate={level} but the {CONTRACT_MANIFEST_FILENAME} "
                f"does not match this set: {'; '.join(mismatches)}."
            ),
            corrective=_GATE_CORRECTIVE,
            manifest_result=manifest,
            residual_ids=manifest.residual_ids,
        )

    # Coverage rule: every probeable class must be covered.
    if manifest.uncovered_probeable_ids:
        return ContractGateResult(
            level=level,
            applicable=True,
            ok=False,
            reason=(
                f"contractGate={level} but probeable defect class(es) name no "
                "covering contract test (the floor does not carry them): "
                f"{list(manifest.uncovered_probeable_ids)}. Add a contract test "
                "or mark the class non-probeable (agent-reserved)."
            ),
            corrective=_GATE_CORRECTIVE,
            manifest_result=manifest,
            residual_ids=manifest.residual_ids,
        )

    # Floor result.
    floor_path = find_contract_floor_result(session_set_dir)
    if floor_path is None:
        return ContractGateResult(
            level=level,
            applicable=True,
            ok=False,
            reason=(
                f"contractGate={level} but no {CONTRACT_FLOOR_RESULT_FILENAME} "
                "was found (the contract floor has not been run). "
                "Run the producer."
            ),
            corrective=_GATE_CORRECTIVE,
            manifest_result=manifest,
            residual_ids=manifest.residual_ids,
        )
    floor = validate_contract_floor_result(floor_path)
    if not floor.ok:
        return ContractGateResult(
            level=level,
            applicable=True,
            ok=False,
            reason=(
                f"contractGate={level} but {CONTRACT_FLOOR_RESULT_FILENAME} is "
                f"invalid ({floor.code}): {'; '.join(floor.reasons)}"
            ),
            corrective=_GATE_CORRECTIVE,
            manifest_result=manifest,
            floor_result=floor,
            residual_ids=manifest.residual_ids,
        )

    floor_mismatches: List[str] = []
    if floor.session_set_name != expected_name:
        floor_mismatches.append(
            f"floor-result sessionSetName {floor.session_set_name!r} does not "
            f"match this set {expected_name!r}"
        )
    if floor.command != manifest.command:
        floor_mismatches.append(
            "floor-result command does not match the manifest command "
            f"({list(floor.command)} != {list(manifest.command)})"
        )
    if floor_mismatches:
        return ContractGateResult(
            level=level,
            applicable=True,
            ok=False,
            reason=(
                f"contractGate={level} but the {CONTRACT_FLOOR_RESULT_FILENAME} "
                f"does not match this set/manifest: {'; '.join(floor_mismatches)}."
            ),
            corrective=_GATE_CORRECTIVE,
            manifest_result=manifest,
            floor_result=floor,
            residual_ids=manifest.residual_ids,
        )

    if not floor.passed:
        return ContractGateResult(
            level=level,
            applicable=True,
            ok=False,
            reason=(
                f"contractGate={level} but the contract floor did not pass "
                f"(exitCode={floor.exit_code!r}, timedOut={floor.timed_out}). "
                "A failing/timed-out/leaked floor is not a deterministic floor."
            ),
            corrective=_GATE_CORRECTIVE,
            manifest_result=manifest,
            floor_result=floor,
            residual_ids=manifest.residual_ids,
        )

    residual_note = (
        f" {len(manifest.residual_ids)} non-probeable class(es) reserved for "
        f"the path-aware critique: {list(manifest.residual_ids)}."
        if manifest.residual_ids
        else " no non-probeable residual."
    )
    return ContractGateResult(
        level=level,
        applicable=True,
        ok=True,
        reason=(
            "a passing contract floor covers all "
            f"{manifest.probeable_total} probeable defect class(es)."
            + residual_note
        ),
        manifest_result=manifest,
        floor_result=floor,
        residual_ids=manifest.residual_ids,
    )


# ---------------------------------------------------------------------------
# CLI: python -m ai_router.contract_gate {run,validate}
# ---------------------------------------------------------------------------


def _load_config_best_effort() -> Optional[dict]:
    try:
        from config import load_config  # type: ignore[import-not-found]
    except ImportError:  # pragma: no cover - import shim
        try:
            from .config import load_config  # type: ignore[no-redef]
        except Exception:  # pragma: no cover
            return None
    try:
        return load_config()
    except Exception:  # pragma: no cover - config is optional for caps
        return None


def main(argv: Optional[Sequence[str]] = None) -> int:
    """CLI entry point. Returns an exit code; never calls ``sys.exit``.

    ``run`` produces the floor (drives the S1 cage); ``validate`` runs the
    close-out gate validator and prints the verdict. ASCII-only output.
    """
    import argparse

    parser = argparse.ArgumentParser(
        prog="python -m ai_router.contract_gate",
        description=(
            "Contract-test / CDC gate (Set 068 S5): the deterministic "
            "verification floor."
        ),
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_run = sub.add_parser(
        "run", help="run the manifest's contract command in the S1 cage"
    )
    p_run.add_argument("--session-set-dir", required=True)
    p_run.add_argument(
        "--repo-root",
        required=True,
        help="the git repo the cage checks out a disposable worktree from",
    )
    p_run.add_argument("--ref", default="HEAD")

    p_val = sub.add_parser(
        "validate", help="run the close-out gate validator and print the verdict"
    )
    p_val.add_argument("--session-set-dir", required=True)

    args = parser.parse_args(argv)

    if args.cmd == "run":
        try:
            res = produce_contract_floor(
                args.session_set_dir,
                repo_root=args.repo_root,
                ref=args.ref,
                config=_load_config_best_effort(),
            )
        except ContractGateError as exc:
            print(f"ERROR: {exc}")
            return 2
        status = "PASSED" if res.passed else "did NOT pass"
        print(f"[{'x' if res.passed else ' '}] contract floor {status}")
        print(f"    wrote {res.result_path}")
        for r in res.reasons:
            print(f"    note: {r}")
        return 0 if res.passed else 1

    # validate
    result = validate_contract_gate(args.session_set_dir)
    mark = "x" if result.ok else " "
    print(f"[{mark}] contractGate={result.level}: {result.reason}")
    if not result.ok and result.corrective:
        print(f"    -> {result.corrective}")
    if result.applicable and not result.ok:
        return 1
    return 0


__all__ = [
    "CONTRACT_GATE_NONE",
    "CONTRACT_GATE_ADVISORY",
    "CONTRACT_GATE_REQUIRED",
    "CONTRACT_GATE_VALUES",
    "DEFAULT_CONTRACT_GATE",
    "CONTRACT_GATE_ENTRY_KIND",
    "CONTRACT_MANIFEST_FILENAME",
    "CONTRACT_FLOOR_RESULT_FILENAME",
    "CONTRACT_ARTIFACT_SCHEMA_VERSIONS",
    "ARTIFACT_VALID",
    "ARTIFACT_MISSING_FILE",
    "ARTIFACT_UNREADABLE",
    "ARTIFACT_NOT_AN_OBJECT",
    "ARTIFACT_SCHEMA_INVALID",
    "ContractManifestResult",
    "ContractFloorResultValidation",
    "ContractGateResult",
    "ProduceFloorResult",
    "ContractGateError",
    "read_contract_gate",
    "read_spec_contract_gate",
    "has_contract_gate_record",
    "contract_gate_record_unreadable",
    "record_contract_gate",
    "resolve_and_record_contract_gate",
    "validate_contract_manifest",
    "validate_contract_floor_result",
    "find_contract_manifest",
    "find_contract_floor_result",
    "produce_contract_floor",
    "validate_contract_gate",
    "main",
]


if __name__ == "__main__":  # pragma: no cover - CLI entry
    import sys

    raise SystemExit(main(sys.argv[1:]))
