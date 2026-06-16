"""Set 066 — Path-Aware Critique policy surface + artifact contract.

This module ships the **tier-orthogonal** ``pathAwareCritique`` per-set
policy attribute and the saved **multi-provider critique artifact**
contract that backs it. The design source is the Set 065 proposal
(``docs/proposals/2026-06-14-verification-surface-empirics/proposal.md``
Candidate 1 + the unifying blast-radius rule in section 7) and its
2026-06-15 Erratum, which establishes that the close-out wiring is
**net-new** (the existing ``dedicated-sessions`` content-aware gate is
Lightweight-only and inert on Full tier) and that the feature is
**tier-orthogonal** — ``none | advisory | required`` on both tiers.

Two concerns live here:

1. The **policy attribute** ``pathAwareCritique: none | advisory |
   required`` — seeded in spec.md's Session Set Configuration block,
   recorded **once at set start** to ``activity-log.json`` (its own
   ``kind`` so it never collides with the Set-057 ``verification_mode``
   choice), and **immutable** after the first record. This deliberately
   mirrors the ``verificationMode`` machinery in
   :mod:`ai_router.dedicated_verification` (Set 057 Q5) so the two
   per-set attributes behave identically and an operator who knows one
   knows the other. The default when no record exists is ``none`` — the
   feature is strictly opt-in and a set that declares nothing pays no
   gate (preserving Full tier's walk-away promise).

2. The **saved critique artifact** (``path-aware-critique.json``) and its
   pure-Python :func:`validate_path_aware_critique_artifact`. The
   artifact records the operator-run multi-provider path-aware review
   (today GitHub Copilot driving GPT-5.4 + Gemini-Pro over the repo; the
   first-party tool-loop adapter is deferred to Set 067). The JSON Schema
   at ``docs/path-aware-critique.schema.json`` is the structural contract;
   the validator here is the **runtime** check the Set-066 S2 close-out
   gate calls — it is intentionally pure-Python (no ``jsonschema``, which
   is a test-only optional dependency) so ``close_session`` keeps working
   for every consumer that installs only the runtime deps.

The ``P_set = any(P_task)`` blast-radius predicate that *recommends* a
value for this attribute lives in :mod:`ai_router.blast_radius` (it
imports the value constants from here). All functions are
engine-agnostic: they read/write plain JSON and never require a Python
import from a Copilot/Codex/Gemini flow.
"""

from __future__ import annotations

import json
import os
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Union

try:  # package vs bare-import (mirrors the rest of ai_router)
    from .evidence_protocol import validate_finding_evidence
except ImportError:  # pragma: no cover - test/bare context
    from evidence_protocol import validate_finding_evidence  # type: ignore


# ---------------------------------------------------------------------------
# The pathAwareCritique policy attribute (Set 066 S1)
# ---------------------------------------------------------------------------

PATH_AWARE_CRITIQUE_NONE = "none"
PATH_AWARE_CRITIQUE_ADVISORY = "advisory"
PATH_AWARE_CRITIQUE_REQUIRED = "required"
PATH_AWARE_CRITIQUE_VALUES = (
    PATH_AWARE_CRITIQUE_NONE,
    PATH_AWARE_CRITIQUE_ADVISORY,
    PATH_AWARE_CRITIQUE_REQUIRED,
)
# Default when no durable record exists: opt-in, no gate. A set that
# declares nothing is treated as ``none`` — the Set 066 S2 close-out gate
# only fires on ``required``, so the default preserves current behavior on
# both tiers (Full tier's "walk away with no gate" promise).
DEFAULT_PATH_AWARE_CRITIQUE = PATH_AWARE_CRITIQUE_NONE
# The activity-log entry ``kind`` discriminator. Distinct from Set 057's
# ``verification_mode`` and Set 048's ``suggestion_disposition`` so the
# path-aware-critique choice never overloads either enum.
PATH_AWARE_CRITIQUE_ENTRY_KIND = "path_aware_critique"
# The kinds that carry a durable pathAwareCritique ``choice``. Kept as a
# tuple (like Set 057's verification-mode record kinds) so a future
# sanctioned-transition record kind can be added without changing the
# reader's "last valid entry of any record kind wins" rule. Only one kind
# exists today (Set 066 ships no A->B transition writer).
_PATH_AWARE_CRITIQUE_RECORD_KINDS = (PATH_AWARE_CRITIQUE_ENTRY_KIND,)


def _now_iso_utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def _write_activity_log_atomic(log_path: Path, log: dict) -> None:
    """Atomic temp-file-rename write of ``activity-log.json``.

    Kept local so this module is self-contained (mirrors
    :func:`ai_router.dedicated_verification._write_activity_log_atomic`;
    both write the same activity-log.json shape).
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


def read_path_aware_critique(session_set_dir: Union[str, Path]) -> str:
    """Return the durable ``pathAwareCritique`` record, or the default.

    Walks ``activity-log.json`` for entries with
    ``kind == "path_aware_critique"`` (the Set 066 once-at-set-start
    capture) and returns the most recent valid ``choice`` — the last valid
    entry in file order wins. Returns :data:`DEFAULT_PATH_AWARE_CRITIQUE`
    (``none``) when no record exists or on any read error — the feature is
    opt-in, so "not recorded" means no gate.

    Note: an optional spec-config ``pathAwareCritique`` field seeds the
    once-at-set-start capture (Set 066 S1), but it is NOT the durable
    record — only the activity-log entry is. This reader intentionally
    consults the durable record only.
    """
    log_path = Path(session_set_dir) / "activity-log.json"
    if not log_path.exists():
        return DEFAULT_PATH_AWARE_CRITIQUE
    try:
        with log_path.open("r", encoding="utf-8") as f:
            log = json.load(f)
    except (OSError, json.JSONDecodeError, UnicodeError):
        # UnicodeError (invalid UTF-8 bytes) is a ValueError subclass but NOT a
        # json.JSONDecodeError, so without it an invalid-UTF-8 activity log would
        # escape this reader's never-raising contract and crash close-out - the
        # exact 0.22.x class Set 068 S5/S6 fixed in contract_gate but left latent
        # in this sibling (Set 069 S3 probe-template dogfood).
        return DEFAULT_PATH_AWARE_CRITIQUE
    chosen = DEFAULT_PATH_AWARE_CRITIQUE
    for entry in log.get("entries", []):
        if entry.get("kind") not in _PATH_AWARE_CRITIQUE_RECORD_KINDS:
            continue
        choice = entry.get("choice")
        if choice in PATH_AWARE_CRITIQUE_VALUES:
            chosen = choice
    return chosen


def read_spec_path_aware_critique(
    session_set_dir: Union[str, Path],
) -> Optional[str]:
    """Return the optional ``pathAwareCritique`` seed from spec.md config.

    Set 066 S1: a Session Set Configuration ``pathAwareCritique`` field may
    **seed** the once-at-set-start capture, but it is NOT the durable
    record. Returns the value when it is a recognized level, else ``None``
    (missing spec, no config block, no field, or an unknown value). Never
    raises — a malformed spec degrades to "no seed". Reuses the shared
    config-block extractor so the attribute is parsed exactly like ``tier``
    / ``verificationMode`` (no separate parser).
    """
    spec_path = Path(session_set_dir) / "spec.md"
    if not spec_path.is_file():
        return None
    try:
        text = spec_path.read_text(encoding="utf-8")
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
    block = _extract_session_set_configuration_block(text) or {}
    value = block.get("pathAwareCritique")
    if isinstance(value, str) and value in PATH_AWARE_CRITIQUE_VALUES:
        return value
    return None


def has_path_aware_critique_record(session_set_dir: Union[str, Path]) -> bool:
    """Return True iff a durable pathAwareCritique record already exists.

    Used by the start-of-set capture wiring to make recording idempotent:
    the seed-from-spec path records only when no durable choice exists yet,
    which is what enforces the once-at-set-start immutability.
    """
    log_path = Path(session_set_dir) / "activity-log.json"
    if not log_path.exists():
        return False
    try:
        with log_path.open("r", encoding="utf-8") as f:
            log = json.load(f)
    except (OSError, json.JSONDecodeError, UnicodeError):
        # Invalid UTF-8 (a UnicodeError, not a JSONDecodeError) must not raise
        # here either (Set 069 S3); an unreadable log means "no durable record".
        return False
    return any(
        entry.get("kind") in _PATH_AWARE_CRITIQUE_RECORD_KINDS
        and entry.get("choice") in PATH_AWARE_CRITIQUE_VALUES
        for entry in log.get("entries", [])
    )


def path_aware_critique_record_unreadable(
    session_set_dir: Union[str, Path],
) -> bool:
    """True iff ``activity-log.json`` EXISTS but cannot be parsed.

    Distinguishes "no durable record" (the file is absent, or present and
    parseable but carrying no ``path_aware_critique`` entry -> a legitimate
    ``none`` opt-out) from "the durable record is present but UNREADABLE" (the
    file exists but is corrupt / unparseable JSON). :func:`read_path_aware_critique`
    and :func:`has_path_aware_critique_record` both collapse the unreadable
    case to the default ``none`` / ``False`` so they never raise; on their own
    that means a corrupt activity log would let a set that opted into
    ``required`` close as if it had no gate -- a *silent* disarm. The Set 066
    close-out gate calls this to surface the unreadable case as a loud warning
    instead of silently skipping (GPT-5.4 path-aware critique, S3 dogfood).

    Returns ``False`` when the file is absent (the legitimate opt-out) or parses
    cleanly; ``True`` only when the file exists and JSON/IO parsing fails.
    """
    log_path = Path(session_set_dir) / "activity-log.json"
    if not log_path.exists():
        return False
    try:
        with log_path.open("r", encoding="utf-8") as f:
            json.load(f)
    except (OSError, json.JSONDecodeError, UnicodeError):
        # Invalid UTF-8 bytes (a UnicodeError, not a JSONDecodeError) make the log
        # unreadable -> surface it as the loud warning instead of letting it
        # escape and crash close-out (Set 069 S3); this is the close-out gate's
        # signal that a 'required' set's durable record cannot be read.
        return True
    return False


def resolve_and_record_path_aware_critique(
    session_set_dir: Union[str, Path],
    *,
    cli_choice: Optional[str] = None,
    session_number: int = 1,
) -> Optional[str]:
    """Capture the ``pathAwareCritique`` choice once at set start.

    Set 066 S1 wiring (the start_session caller). The choice is recorded
    **once at set start and is immutable thereafter** — allowing a later
    write would let a mid-set ``--path-aware-critique none`` silently
    disable the close-out gate after the set had already opted in to
    ``required``. Once any valid record exists this is a no-op (returns
    ``None``).

    On the first call (no record yet) the resolution precedence is:

    1. ``cli_choice`` (an explicit ``--path-aware-critique`` flag).
    2. The spec.md config ``pathAwareCritique`` seed.

    Records nothing (returns ``None``) when neither source yields a value —
    the feature stays strictly opt-in and the default ``none`` continues to
    apply implicitly. Creates a minimal ``activity-log.json`` if one does
    not exist yet (the durable record lives there). A bad ``cli_choice``
    always raises ``ValueError`` (even when a record already exists, so the
    validation surface is stable), but a missing activity log is created
    rather than raising.
    """
    if cli_choice is not None and cli_choice not in PATH_AWARE_CRITIQUE_VALUES:
        raise ValueError(
            f"unknown pathAwareCritique {cli_choice!r}; expected one of "
            f"{PATH_AWARE_CRITIQUE_VALUES}"
        )
    # Immutable after the first record (once at set start).
    if has_path_aware_critique_record(session_set_dir):
        return None
    chosen: Optional[str] = cli_choice
    if chosen is None:
        chosen = read_spec_path_aware_critique(session_set_dir)
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
    record_path_aware_critique(
        session_set_dir, chosen, session_number=session_number
    )
    return chosen


def record_path_aware_critique(
    session_set_dir: Union[str, Path],
    value: str,
    *,
    session_number: int = 1,
    step_number: Optional[int] = None,
) -> None:
    """Append a ``path_aware_critique`` entry to ``activity-log.json``.

    The durable record (Set 066 S1). Mirrors the Set-057
    ``record_verification_mode`` writer (atomic temp-file rename, UTC
    timestamp). Raises ``ValueError`` on an unknown value and
    ``FileNotFoundError`` if the activity log is missing (the set must have
    started first — this helper does not create the file).

    Exposed so the predicate/gate and the tests have a sanctioned writer
    and can build fixtures without hand-editing the activity log.
    """
    if value not in PATH_AWARE_CRITIQUE_VALUES:
        raise ValueError(
            f"unknown pathAwareCritique {value!r}; expected one of "
            f"{PATH_AWARE_CRITIQUE_VALUES}"
        )
    log_path = Path(session_set_dir) / "activity-log.json"
    if not log_path.exists():
        raise FileNotFoundError(
            f"activity-log.json not found at {log_path}; the session set "
            "must exist and have started before recording a "
            "pathAwareCritique"
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
    entry = {
        "sessionNumber": session_number,
        "stepNumber": step_number,
        "stepKey": f"session-{session_number:03d}/path-aware-critique",
        "dateTime": _now_iso_utc(),
        "description": f"Operator set pathAwareCritique: {value}.",
        "status": "complete",
        "routedApiCalls": [],
        "kind": PATH_AWARE_CRITIQUE_ENTRY_KIND,
        "choice": value,
    }
    entries.append(entry)
    _write_activity_log_atomic(log_path, log)


# ---------------------------------------------------------------------------
# The saved multi-provider critique artifact (Set 066 S1)
# ---------------------------------------------------------------------------

# The canonical saved-artifact filename. The Set-066 S2 close-out gate
# looks for this beside spec.md at the session-set root.
PATH_AWARE_CRITIQUE_ARTIFACT_FILENAME = "path-aware-critique.json"
# The top-level keys the JSON Schema permits (additionalProperties: false).
# The pure-Python validator enforces the same closed envelope so its
# accept-set matches the schema's exactly (the only intended difference is
# the distinct-provider semantic rule the schema cannot express).
_ALLOWED_TOP_LEVEL_KEYS = frozenset(
    {
        "schemaVersion",
        "sessionSetName",
        "pathAwareCritique",
        "critiquedAt",
        "blastRadius",
        "critiques",
    }
)
# The supported envelope schema version(s).
PATH_AWARE_CRITIQUE_ARTIFACT_SCHEMA_VERSIONS = (1,)
# Minimum distinct providers for a valid multi-provider artifact. The 010
# vs C3 split in the S1 bake-off proves a single provider is insufficient
# (the two catch-classes imply opposite single-provider fixes), so the
# load-bearing property is path-aware AND multi-provider.
_MIN_DISTINCT_PROVIDERS = 2

# Stable machine tokens returned in ``PathAwareCritiqueArtifactResult.code``.
ARTIFACT_VALID = "valid"
ARTIFACT_MISSING_FILE = "missing-file"
ARTIFACT_UNREADABLE = "unreadable"
ARTIFACT_NOT_AN_OBJECT = "not-an-object"
ARTIFACT_SCHEMA_INVALID = "schema-invalid"
ARTIFACT_SINGLE_PROVIDER = "single-provider"
ARTIFACT_TRIVIAL_CONTENT = "trivial-content"
# Set 069 S1: a finding tagged REPRODUCED without a valid falsifier transcript
# (or an unknown evidenceTier) makes the artifact invalid. The deep transcript
# rules (pristine replay, meta-oracle) live in ai_router.evidence_protocol.
ARTIFACT_INVALID_EVIDENCE = "invalid-evidence"


@dataclass(frozen=True)
class PathAwareCritiqueArtifactResult:
    """Outcome of :func:`validate_path_aware_critique_artifact`.

    ``ok`` is True only for a structurally-valid, multi-provider,
    content-non-trivial artifact. ``code`` is a stable machine token (one
    of the ``ARTIFACT_*`` constants) so the Set-066 S2 close-out gate and
    CLI/extension consumers can branch without string-matching the prose
    reasons. ``reasons`` carries human-readable, ASCII-only detail.
    """

    ok: bool
    code: str
    reasons: tuple
    providers: tuple
    critique_count: int
    findings_count: int
    # The artifact's own self-declared identity fields, populated on the
    # ``ok=True`` path so the close-out gate can confirm the artifact belongs
    # to *this* set and was produced under the recorded policy (a stale or
    # copied artifact from another set must not satisfy a ``required`` gate --
    # GPT-5.4 path-aware critique, S3 dogfood). ``None`` on every failure path.
    session_set_name: Optional[str] = None
    artifact_level: Optional[str] = None


def _critique_has_content(critique: dict) -> bool:
    """True iff a critique entry carries substantive (non-trivial) content.

    A critique is non-trivial when it has either a non-empty ``summary``
    string or at least one finding with a non-empty ``description``. A
    ``VERIFIED`` (clean) critique is still expected to carry a ``summary``
    saying what was reviewed — that is what keeps a two-provider stub of
    empty entries from satisfying the gate.
    """
    summary = critique.get("summary")
    if isinstance(summary, str) and summary.strip():
        return True
    findings = critique.get("findings")
    if isinstance(findings, list):
        for finding in findings:
            if (
                isinstance(finding, dict)
                and isinstance(finding.get("description"), str)
                and finding["description"].strip()
            ):
                return True
    return False


def _count_findings(critiques: List[dict]) -> int:
    total = 0
    for critique in critiques:
        findings = critique.get("findings")
        if isinstance(findings, list):
            total += sum(1 for f in findings if isinstance(f, dict))
    return total


def validate_path_aware_critique_artifact(
    artifact: Union[str, Path, dict],
) -> PathAwareCritiqueArtifactResult:
    """Validate a saved multi-provider path-aware critique artifact.

    Accepts either an already-loaded ``dict`` or a path to the artifact
    JSON file. This is the **runtime** validator the Set-066 S2 close-out
    gate calls; it is pure-Python (no ``jsonschema``) so it works wherever
    only the runtime dependencies are installed. The JSON Schema at
    ``docs/path-aware-critique.schema.json`` is the parallel structural
    contract (tested with ``jsonschema``); the shipped example fixture is
    checked against both so they cannot silently diverge.

    The contract enforced here (see ``docs/path-aware-critique-schema.md``):

    - top level is an object with ``schemaVersion`` (a supported version),
      a non-empty ``sessionSetName``, a ``pathAwareCritique`` level (one of
      :data:`PATH_AWARE_CRITIQUE_VALUES`), and a ``critiques`` array;
    - ``critiques`` has at least :data:`_MIN_DISTINCT_PROVIDERS` entries,
      each with a non-empty ``provider`` / ``model`` / ``verdict``;
    - the entries span at least :data:`_MIN_DISTINCT_PROVIDERS` **distinct**
      providers (multi-provider, not two passes of one provider);
    - every entry is content-non-trivial (a non-empty ``summary`` or at
      least one finding with a non-empty ``description``).

    Returns a :class:`PathAwareCritiqueArtifactResult`; never raises on a
    malformed or missing artifact (a missing file is ``missing-file``, bad
    JSON / IO is ``unreadable``) so the close-out gate can decide posture
    rather than crash.
    """
    if isinstance(artifact, (str, Path)):
        path = Path(artifact)
        if not path.exists():
            return PathAwareCritiqueArtifactResult(
                ok=False,
                code=ARTIFACT_MISSING_FILE,
                reasons=(f"artifact not found at {path}",),
                providers=(),
                critique_count=0,
                findings_count=0,
            )
        try:
            with path.open("r", encoding="utf-8") as f:
                data = json.load(f)
        except (OSError, json.JSONDecodeError, UnicodeError) as exc:
            # UnicodeError (invalid UTF-8 bytes) is a ValueError, NOT an OSError or
            # JSONDecodeError, so without it a malformed-bytes artifact would
            # escape this validator's never-raising contract and crash the
            # close-out gate - the same 0.22.x class fixed in contract_gate's
            # _load_json_artifact (Set 069 S3 probe-template dogfood found it
            # still latent here).
            return PathAwareCritiqueArtifactResult(
                ok=False,
                code=ARTIFACT_UNREADABLE,
                reasons=(f"could not read artifact JSON: {exc}",),
                providers=(),
                critique_count=0,
                findings_count=0,
            )
    else:
        data = artifact

    if not isinstance(data, dict):
        return PathAwareCritiqueArtifactResult(
            ok=False,
            code=ARTIFACT_NOT_AN_OBJECT,
            reasons=("artifact top level is not a JSON object",),
            providers=(),
            critique_count=0,
            findings_count=0,
        )

    reasons: List[str] = []
    # Set 069 S1: evidence-tier violations are collected separately so a
    # REPRODUCED-without-transcript finding surfaces as the actionable
    # ARTIFACT_INVALID_EVIDENCE code (after structural / single-provider /
    # trivial checks), not folded into the generic schema-invalid bucket.
    evidence_reasons: List[str] = []

    extra_keys = sorted(set(data) - _ALLOWED_TOP_LEVEL_KEYS)
    if extra_keys:
        reasons.append(f"unknown top-level key(s): {extra_keys}")

    version = data.get("schemaVersion")
    # Must be a true int (not a bool, not a float) to match the JSON Schema's
    # ``"type": "integer"``. Python evaluates ``1.0 in (1,)`` and ``True in
    # (1,)`` as truthy, so without an explicit type guard a float/bool
    # schemaVersion would pass the pure-Python validator while failing strict
    # JSON Schema evaluation -- a validator/schema parity gap (Gemini-Pro
    # path-aware critique, S3 dogfood).
    if (
        not isinstance(version, int)
        or isinstance(version, bool)
        or version not in PATH_AWARE_CRITIQUE_ARTIFACT_SCHEMA_VERSIONS
    ):
        reasons.append(
            f"schemaVersion {version!r} is not one of "
            f"{PATH_AWARE_CRITIQUE_ARTIFACT_SCHEMA_VERSIONS} (must be an integer)"
        )

    set_name = data.get("sessionSetName")
    if not (isinstance(set_name, str) and set_name.strip()):
        reasons.append("sessionSetName is missing or empty")

    level = data.get("pathAwareCritique")
    if level not in PATH_AWARE_CRITIQUE_VALUES:
        reasons.append(
            f"pathAwareCritique {level!r} is not one of "
            f"{PATH_AWARE_CRITIQUE_VALUES}"
        )

    # Optional top-level fields the JSON Schema constrains by type. The
    # pure-Python validator must reject the same wrong-typed values the schema
    # would, or a malformed artifact passes the runtime gate but fails strict
    # schema evaluation (Gemini-Pro path-aware critique, S3 dogfood). Only
    # checked when present (both fields are optional).
    critiqued_at = data.get("critiquedAt")
    if critiqued_at is not None and not (
        isinstance(critiqued_at, str) and critiqued_at.strip()
    ):
        reasons.append("critiquedAt, when present, must be a non-empty string")
    blast_radius = data.get("blastRadius")
    if blast_radius is not None and not isinstance(blast_radius, dict):
        reasons.append("blastRadius, when present, must be an object")

    critiques = data.get("critiques")
    if not isinstance(critiques, list) or not critiques:
        reasons.append("critiques is missing or not a non-empty array")
        return PathAwareCritiqueArtifactResult(
            ok=False,
            code=ARTIFACT_SCHEMA_INVALID,
            reasons=tuple(reasons),
            providers=(),
            critique_count=0,
            findings_count=0,
        )

    # Per-entry structural checks — these mirror the JSON Schema so the
    # Python validator's accept-set matches the schema's (minus the
    # distinct-provider rule, the one semantic constraint JSON Schema
    # cannot express).
    for i, critique in enumerate(critiques):
        if not isinstance(critique, dict):
            reasons.append(f"critiques[{i}] is not an object")
            continue
        for field in ("provider", "model", "verdict"):
            value = critique.get(field)
            if not (isinstance(value, str) and value.strip()):
                reasons.append(f"critiques[{i}].{field} is missing or empty")
        summary = critique.get("summary")
        if summary is not None and not isinstance(summary, str):
            reasons.append(f"critiques[{i}].summary must be a string")
        findings = critique.get("findings")
        if findings is not None:
            if not isinstance(findings, list):
                reasons.append(f"critiques[{i}].findings must be an array")
            else:
                for j, finding in enumerate(findings):
                    if not isinstance(finding, dict):
                        reasons.append(
                            f"critiques[{i}].findings[{j}] is not an object"
                        )
                        continue
                    desc = finding.get("description")
                    if not (isinstance(desc, str) and desc.strip()):
                        reasons.append(
                            f"critiques[{i}].findings[{j}].description is "
                            "missing or empty"
                        )
                    # severity / category are optional loose strings in the
                    # JSON Schema -- reject a wrong-typed value when present so
                    # the Python validator's accept-set matches the schema's
                    # (Gemini-Pro path-aware critique, S3 dogfood).
                    for opt in ("severity", "category"):
                        opt_val = finding.get(opt)
                        if opt_val is not None and not isinstance(opt_val, str):
                            reasons.append(
                                f"critiques[{i}].findings[{j}].{opt} must be "
                                "a string"
                            )
                    # Set 069 S1: evidence-tier rule. An untagged finding is
                    # ASSERTED (ok); a REPRODUCED finding is valid only with a
                    # falsifier transcript (pristine replay + meta-oracle).
                    ev = validate_finding_evidence(finding)
                    if not ev.ok:
                        evidence_reasons.extend(
                            f"critiques[{i}].findings[{j}]: {r}"
                            for r in ev.reasons
                        )

    providers = tuple(
        c["provider"].strip()
        for c in critiques
        if isinstance(c, dict)
        and isinstance(c.get("provider"), str)
        and c["provider"].strip()
    )
    distinct_providers = tuple(sorted(set(providers)))
    findings_count = _count_findings(
        [c for c in critiques if isinstance(c, dict)]
    )

    if len(critiques) < _MIN_DISTINCT_PROVIDERS:
        reasons.append(
            f"need at least {_MIN_DISTINCT_PROVIDERS} critique entries; "
            f"found {len(critiques)}"
        )

    # If structure is broken, report schema-invalid before the semantic
    # (single-provider / trivial) checks so the most actionable failure
    # surfaces first.
    if reasons:
        return PathAwareCritiqueArtifactResult(
            ok=False,
            code=ARTIFACT_SCHEMA_INVALID,
            reasons=tuple(reasons),
            providers=distinct_providers,
            critique_count=len(critiques),
            findings_count=findings_count,
        )

    if len(distinct_providers) < _MIN_DISTINCT_PROVIDERS:
        return PathAwareCritiqueArtifactResult(
            ok=False,
            code=ARTIFACT_SINGLE_PROVIDER,
            reasons=(
                "multi-provider requires at least "
                f"{_MIN_DISTINCT_PROVIDERS} distinct providers; found "
                f"{len(distinct_providers)}: {list(distinct_providers)}",
            ),
            providers=distinct_providers,
            critique_count=len(critiques),
            findings_count=findings_count,
        )

    trivial = [
        i for i, c in enumerate(critiques) if not _critique_has_content(c)
    ]
    if trivial:
        return PathAwareCritiqueArtifactResult(
            ok=False,
            code=ARTIFACT_TRIVIAL_CONTENT,
            reasons=(
                "every critique must carry a non-empty summary or at least "
                "one finding with a non-empty description; trivial entries: "
                f"{trivial}",
            ),
            providers=distinct_providers,
            critique_count=len(critiques),
            findings_count=findings_count,
        )

    # Set 069 S1: the evidence-tier rule is the deepest semantic check (after
    # structure / multi-provider / non-trivial). A finding tagged REPRODUCED
    # without a valid falsifier transcript invalidates the artifact, so the
    # close-out gate refuses a critique that *claims* a reproduction it cannot
    # back with a re-runnable transcript.
    if evidence_reasons:
        return PathAwareCritiqueArtifactResult(
            ok=False,
            code=ARTIFACT_INVALID_EVIDENCE,
            reasons=tuple(evidence_reasons),
            providers=distinct_providers,
            critique_count=len(critiques),
            findings_count=findings_count,
        )

    return PathAwareCritiqueArtifactResult(
        ok=True,
        code=ARTIFACT_VALID,
        reasons=(),
        providers=distinct_providers,
        critique_count=len(critiques),
        findings_count=findings_count,
        session_set_name=set_name,
        artifact_level=level,
    )


def find_path_aware_critique_artifact(
    session_set_dir: Union[str, Path],
) -> Optional[Path]:
    """Return the path to the set's critique artifact, or ``None``.

    Looks for :data:`PATH_AWARE_CRITIQUE_ARTIFACT_FILENAME` beside spec.md
    at the session-set root. The Set-066 S2 close-out gate uses this to
    locate the artifact before validating it.
    """
    candidate = Path(session_set_dir) / PATH_AWARE_CRITIQUE_ARTIFACT_FILENAME
    return candidate if candidate.is_file() else None


# ---------------------------------------------------------------------------
# Content-aware close-out gate (Set 066 S2)
# ---------------------------------------------------------------------------

# The one-line operator action the close-out gate prints when the artifact
# is missing or invalid. ASCII-only (project-guidance Code Style).
_GATE_CORRECTIVE = (
    "Produce a multi-provider path-aware critique and save it as "
    f"{PATH_AWARE_CRITIQUE_ARTIFACT_FILENAME} at the session-set root "
    "(>=2 distinct providers, each carrying a non-empty summary or at least "
    "one finding with a description; see docs/path-aware-critique-schema.md "
    "and the prompt template), then re-run close_session."
)


@dataclass(frozen=True)
class PathAwareCritiqueGateResult:
    """Outcome of :func:`validate_path_aware_critique_gate`.

    The Set-066 S2 close-out gate consumes this. ``level`` is the durable
    recorded policy (``none`` / ``advisory`` / ``required``). ``applicable``
    is False only when ``level == none`` (the gate is a no-op and ``ok`` is
    True). When applicable, ``ok`` reports whether a valid multi-provider
    critique artifact exists; ``reason`` explains the verdict (ASCII-only)
    and ``corrective`` carries the one-line operator action the gate prints
    when ``ok`` is False. ``artifact_result`` carries the underlying
    :class:`PathAwareCritiqueArtifactResult` when an artifact file was found
    and validated (``None`` when the artifact file was absent).

    The hard-block-vs-soft-warn **posture** is the *caller's* decision and
    depends on ``level``: ``required`` hard-blocks in an interactive TTY /
    soft-warns headless; ``advisory`` always soft-warns and never blocks.
    This validator is posture-agnostic — it reports only ok/not-ok, exactly
    like :func:`ai_router.dedicated_verification.validate_dedicated_verification`.
    """

    level: str
    applicable: bool
    ok: bool
    reason: str
    corrective: str = ""
    artifact_result: Optional[PathAwareCritiqueArtifactResult] = None


def validate_path_aware_critique_gate(
    session_set_dir: Union[str, Path],
) -> PathAwareCritiqueGateResult:
    """Confirm a valid multi-provider critique artifact for the recorded policy.

    The content-aware close-time validator backing the Set-066 S2 close-out
    gate. Reads the durable ``pathAwareCritique`` record
    (:func:`read_path_aware_critique`) and:

    - ``none`` -> ``applicable=False, ok=True`` (no-op);
    - ``advisory`` / ``required`` -> locates the saved
      :data:`PATH_AWARE_CRITIQUE_ARTIFACT_FILENAME` beside spec.md and runs
      :func:`validate_path_aware_critique_artifact`; ``ok`` is True iff a
      valid multi-provider, content-non-trivial artifact exists.

    Never raises (mirrors
    :func:`ai_router.dedicated_verification.validate_dedicated_verification`):
    a missing or unreadable artifact is reported as ``ok=False`` with a
    corrective, so the close-out gate decides posture rather than crashing.
    This function is **tier-orthogonal** — it consults only the
    tier-independent ``pathAwareCritique`` record, so it behaves identically
    on Full and Lightweight.
    """
    level = read_path_aware_critique(session_set_dir)
    if level == PATH_AWARE_CRITIQUE_NONE:
        return PathAwareCritiqueGateResult(
            level=level,
            applicable=False,
            ok=True,
            reason=(
                "pathAwareCritique is 'none'; no path-aware critique gate "
                "(no-op)."
            ),
        )

    artifact_path = find_path_aware_critique_artifact(session_set_dir)
    if artifact_path is None:
        return PathAwareCritiqueGateResult(
            level=level,
            applicable=True,
            ok=False,
            reason=(
                f"pathAwareCritique={level} but no "
                f"{PATH_AWARE_CRITIQUE_ARTIFACT_FILENAME} artifact was found "
                "at the session-set root."
            ),
            corrective=_GATE_CORRECTIVE,
            artifact_result=None,
        )

    result = validate_path_aware_critique_artifact(artifact_path)
    if result.ok:
        # Identity check: a structurally valid artifact must self-declare that
        # it covers THIS set and was produced under the recorded policy level.
        # Without this, a stale/copied artifact from another set (wrong
        # ``sessionSetName``) or one labelled with a different level satisfies
        # the gate for the wrong set (GPT-5.4 path-aware critique, S3 dogfood).
        # Resolve the path before taking ``.name`` so a non-canonical invocation
        # (``.``, a trailing slash, or a symlink alias) identifies the set by its
        # canonical basename -- matching how the Set 067 producer stamps
        # ``sessionSetName`` (it resolves first), so the two never disagree on a
        # non-canonical path (Set 067 S4 dogfood, finding 1).
        expected_name = Path(session_set_dir).resolve().name
        mismatches: List[str] = []
        if result.session_set_name != expected_name:
            mismatches.append(
                f"sessionSetName {result.session_set_name!r} does not match "
                f"this set {expected_name!r}"
            )
        if result.artifact_level != level:
            mismatches.append(
                f"pathAwareCritique {result.artifact_level!r} does not match "
                f"the recorded policy {level!r}"
            )
        if mismatches:
            return PathAwareCritiqueGateResult(
                level=level,
                applicable=True,
                ok=False,
                reason=(
                    f"pathAwareCritique={level} but the "
                    f"{PATH_AWARE_CRITIQUE_ARTIFACT_FILENAME} artifact does "
                    f"not match this set: {'; '.join(mismatches)}."
                ),
                corrective=_GATE_CORRECTIVE,
                artifact_result=result,
            )
        return PathAwareCritiqueGateResult(
            level=level,
            applicable=True,
            ok=True,
            reason=(
                "a valid multi-provider critique artifact exists "
                f"({len(result.providers)} distinct provider(s): "
                f"{list(result.providers)}; {result.findings_count} "
                "finding(s))."
            ),
            artifact_result=result,
        )

    return PathAwareCritiqueGateResult(
        level=level,
        applicable=True,
        ok=False,
        reason=(
            f"pathAwareCritique={level} but the "
            f"{PATH_AWARE_CRITIQUE_ARTIFACT_FILENAME} artifact is invalid "
            f"({result.code}): {'; '.join(result.reasons)}"
        ),
        corrective=_GATE_CORRECTIVE,
        artifact_result=result,
    )
