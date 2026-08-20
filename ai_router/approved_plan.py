"""The approved plan: a machine-owned, schema-validated, hashed artifact
for one session's own steps, under
``.dabbler/runs/<set>/s<N>/approved-plan.json``.

A plan is written and rewritten freely before approval. ``approve_plan``
binds a hash into the record, computed over every field except
``amendments``; after that, ``read_plan`` recomputes the same hash on
every read and refuses a plan whose core content no longer matches it.
Appending an amendment never touches a core field, so it never disturbs
the hash -- which is what makes "the only legal change is an appended
amendment" a structural fact instead of a policy nobody checks.

Risk flags are never declared by a step's own author. They are derived
here, mechanically, from the file envelope and (for the
integration-module flag) the repository's own module manifest
(``docs/modules.yaml``, read through ``ai_router.modules``) -- a step
does not get to say its own work is low-risk.
"""

from __future__ import annotations

import datetime
import json
import os
import re
import tempfile
import time
from pathlib import Path
from typing import Optional

import jsonschema

from .evidence import hash_bytes
from .ledger import session_run_dir

_SCHEMA_PATH = Path(__file__).parent / "schemas" / "approved-plan.schema.json"
_schema_cache: Optional[dict] = None

SCHEMA_VERSION = 1
PLAN_FILENAME = "approved-plan.json"

RISK_PUBLIC_INTERFACE = "public-interface"
RISK_INTEGRATION_MODULE = "integration-module"
RISK_SENSITIVE_PATH = "sensitive-path"
RISK_DEPENDENCY_CHANGE = "dependency-change"

# Paths whose mere presence in an envelope is sensitive regardless of what
# module they belong to: the router's own machine state, its schemas, and
# the config/lockfiles that decide what a session is allowed to do.
_SENSITIVE_PREFIXES = (".dabbler/", "ai_router/schemas/")
_SENSITIVE_BASENAMES = (
    "router-config.yaml", "local-overrides.yaml", "copilot-catalog.lock",
    "session-state.json",
)
_DEPENDENCY_BASENAMES = (
    "pyproject.toml", "requirements.txt", "package.json", "package-lock.json",
    "poetry.lock", "setup.py", "setup.cfg",
)
# A file directly in the package root is a CLI entrypoint
# (`python -m ai_router.<name>`) -- the framework's public surface.
_TOP_LEVEL_MODULE_RE = re.compile(r"^ai_router/[^/]+\.py$")


class PlanIntegrityError(RuntimeError):
    """The plan's core content does not match its bound hash: an edit
    happened that was not an appended amendment."""


class PlanImmutableError(RuntimeError):
    """A caller tried to rewrite an approved plan's core content instead
    of appending an amendment."""


def _schema() -> dict:
    global _schema_cache
    if _schema_cache is None:
        _schema_cache = json.loads(_SCHEMA_PATH.read_text(encoding="utf-8"))
    return _schema_cache


def _normalize_path(path: str) -> str:
    return str(path).replace("\\", "/").lstrip("/")


def plan_path(repo_root, set_slug: str, session_number: int) -> Path:
    return session_run_dir(repo_root, set_slug, session_number) / PLAN_FILENAME


def _validate_schema(plan: dict) -> None:
    try:
        jsonschema.validate(plan, _schema())
    except jsonschema.ValidationError as exc:
        location = "/".join(str(p) for p in exc.absolute_path) or "(root)"
        raise ValueError(
            f"approved-plan.json failed schema validation at {location}: "
            f"{exc.message}"
        ) from exc
    seen = set()
    for step in plan.get("steps") or []:
        step_id = step.get("step_id")
        if step_id in seen:
            raise ValueError(
                f"approved-plan.json: duplicate step_id {step_id!r} -- a "
                "step_id must be unique within its session"
            )
        seen.add(step_id)


# --- Hashing and immutability -------------------------------------------

_CORE_FIELDS = (
    "schema_version", "session_set", "session_number", "session_slug",
    "steps", "approved",
)
_WRITES_LEDGER_FILENAME = "approved-plan-writes.jsonl"


def _core_bytes(plan: dict) -> bytes:
    core = {k: plan[k] for k in _CORE_FIELDS if k in plan}
    return json.dumps(core, sort_keys=True, separators=(",", ":")).encode(
        "utf-8"
    )


def compute_plan_hash(plan: dict) -> str:
    """The hash bound into an approved plan: every field except
    ``amendments`` (and the hash/timestamp fields the approval itself
    writes). Appending an amendment can never change this value."""
    return hash_bytes(_core_bytes(plan))


def _full_content_hash(plan: dict) -> str:
    return hash_bytes(
        json.dumps(plan, sort_keys=True, separators=(",", ":")).encode(
            "utf-8"
        )
    )


def _writes_ledger_path(run_dir) -> Path:
    return Path(run_dir) / _WRITES_LEDGER_FILENAME


def _record_write(run_dir, plan: dict) -> None:
    """Append the whole-file content hash of what was just written. This
    is what makes an out-of-band edit, delete, or reorder of an *existing*
    amendment detectable: ``plan_hash`` alone only proves the core is
    untouched, and the core deliberately excludes ``amendments`` so that
    field can grow. A true append always advances this ledger together
    with the file; nothing else does."""
    path = _writes_ledger_path(run_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps({"hash": _full_content_hash(plan)}) + "\n")


def _last_recorded_write_hash(run_dir) -> Optional[str]:
    try:
        lines = _writes_ledger_path(run_dir).read_text(
            encoding="utf-8"
        ).splitlines()
    except OSError:
        return None
    for line in reversed(lines):
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(row, dict) and isinstance(row.get("hash"), str):
            return row["hash"]
    return None


def _atomic_write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=path.name + ".", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)
            f.write("\n")
        for attempt in range(3):
            try:
                os.replace(tmp, path)
                return
            except PermissionError:
                if attempt == 2:
                    raise
                time.sleep(0.05)
    finally:
        if os.path.exists(tmp):
            try:
                os.unlink(tmp)
            except OSError:
                pass


def _write(run_dir, plan: dict) -> None:
    """The one place a plan's bytes reach disk: atomic replace, then the
    write recorded to the ledger that read_plan checks."""
    _atomic_write_json(Path(run_dir) / PLAN_FILENAME, plan)
    _record_write(run_dir, plan)


def new_plan(
    session_set: str, session_number: int, session_slug: str, steps: list
) -> dict:
    """A fresh, unapproved plan -- valid to write repeatedly until
    ``approve_plan`` is called on it. Each step's ``risk_flags`` may be
    left empty here: ``write_plan`` derives and overwrites it, since a
    supervisor does not declare its own risk."""
    return {
        "schema_version": SCHEMA_VERSION,
        "session_set": session_set,
        "session_number": session_number,
        "session_slug": session_slug,
        "steps": steps,
        "approved": False,
        "amendments": [],
    }


def write_plan(run_dir, plan: dict, workspace_root=None) -> dict:
    """Validate and atomically replace the plan. Every step's
    ``risk_flags`` is recomputed from its ``file_envelope`` (and, for
    integration-module, *workspace_root*'s manifest) and overwrites
    whatever the caller supplied -- a step's own author never gets the
    last word on its own risk. Refused once the plan on disk is approved:
    ``append_amendment`` is the only legal change after that point."""
    plan = json.loads(json.dumps(plan))  # deep copy, caller's dict untouched
    for step in plan.get("steps") or []:
        step["risk_flags"] = derive_risk_flags(
            step.get("file_envelope") or [], workspace_root
        )
    _validate_schema(plan)
    path = Path(run_dir) / PLAN_FILENAME
    if path.exists():
        existing = read_plan(run_dir)
        if existing.get("approved"):
            raise PlanImmutableError(
                f"{path} is already approved; only append_amendment may "
                "change it further"
            )
    _write(run_dir, plan)
    return plan


def read_plan(run_dir) -> dict:
    """The plan, schema-validated. A plan whose current full-file content
    is not backed by a sanctioned write -- including a hand-written file
    that was never through ``write_plan`` at all, where the ledger is
    simply absent -- fails closed with :class:`PlanIntegrityError`, the
    same way every other machine-owned artifact under the run directory
    does. This also catches an edit, deletion, or reorder of an
    *existing* amendment, since only a true append advances the ledger."""
    path = Path(run_dir) / PLAN_FILENAME
    raw = json.loads(path.read_text(encoding="utf-8"))
    _validate_schema(raw)
    last_written = _last_recorded_write_hash(run_dir)
    if last_written is None or _full_content_hash(raw) != last_written:
        raise PlanIntegrityError(
            f"{path}: content is not backed by a sanctioned write -- "
            "it is hand-written, copied, or was edited outside "
            "write_plan/approve_plan/append_amendment"
        )
    if raw.get("approved"):
        expected = raw.get("plan_hash")
        actual = compute_plan_hash(raw)
        if expected != actual:
            raise PlanIntegrityError(
                f"{path}: approved plan's content does not match its bound "
                "plan_hash -- it was edited outside an appended amendment"
            )
    return raw


def approve_plan(run_dir) -> dict:
    """Bind a hash into the plan and mark it immutable. Refused if the
    plan is already approved -- re-approving is not a legal operation,
    only appending an amendment is."""
    plan = read_plan(run_dir)
    if plan.get("approved"):
        raise PlanImmutableError(f"{run_dir}: plan is already approved")

    plan["approved"] = True
    plan["approved_at"] = datetime.datetime.now().astimezone().isoformat()
    plan["plan_hash"] = compute_plan_hash(plan)
    _validate_schema(plan)
    _write(run_dir, plan)
    return plan


def append_amendment(
    run_dir, *, step_id: str, reason: str, changed_fields=None
) -> dict:
    """Append one amendment row. Legal only against an approved plan and
    only for a ``step_id`` the plan actually declares; never touches a
    core field, so the plan's ``plan_hash`` never moves -- but the write
    ledger advances, which is what lets ``read_plan`` tell a true append
    apart from a rewritten history."""
    plan = read_plan(run_dir)
    if not plan.get("approved"):
        raise PlanImmutableError(
            f"{run_dir}: cannot amend a plan that has not been approved"
        )
    if not any(s.get("step_id") == step_id for s in plan.get("steps") or []):
        raise ValueError(
            f"{run_dir}: step_id {step_id!r} is not declared in this plan"
        )
    amendment = {
        "recorded_at": datetime.datetime.now().astimezone().isoformat(),
        "step_id": step_id,
        "reason": reason,
    }
    if changed_fields:
        amendment["changed_fields"] = list(changed_fields)
    plan.setdefault("amendments", []).append(amendment)
    _validate_schema(plan)
    _write(run_dir, plan)
    return plan


# --- Risk flags ----------------------------------------------------------

def _is_sensitive_path(path: str) -> bool:
    normalized = _normalize_path(path)
    if any(normalized.startswith(p) for p in _SENSITIVE_PREFIXES):
        return True
    return os.path.basename(normalized) in _SENSITIVE_BASENAMES


def _is_dependency_path(path: str) -> bool:
    return os.path.basename(_normalize_path(path)) in _DEPENDENCY_BASENAMES


def _is_public_interface_path(path: str) -> bool:
    normalized = _normalize_path(path)
    return bool(_TOP_LEVEL_MODULE_RE.match(normalized))


def _touches_integration_module(path: str, workspace_root) -> bool:
    from . import modules

    if workspace_root is None:
        return False
    try:
        entries = modules.load_entries(workspace_root)
    except ValueError:
        return False
    normalized = _normalize_path(path)
    for entry in entries:
        if not entry.touches:
            continue
        for root in entry.code_roots:
            root_norm = _normalize_path(root).rstrip("/") + "/"
            if (
                normalized.startswith(root_norm)
                or normalized == _normalize_path(root)
            ):
                return True
    return False


def derive_risk_flags(file_envelope, workspace_root=None) -> list:
    """Risk flags derived mechanically from *file_envelope* (repo-relative
    paths) and, for the integration-module flag, the repository manifest
    at *workspace_root*. Order is fixed so the result is stable."""
    flags = set()
    for path in file_envelope:
        if _is_public_interface_path(path):
            flags.add(RISK_PUBLIC_INTERFACE)
        if _is_sensitive_path(path):
            flags.add(RISK_SENSITIVE_PATH)
        if _is_dependency_path(path):
            flags.add(RISK_DEPENDENCY_CHANGE)
        if _touches_integration_module(path, workspace_root):
            flags.add(RISK_INTEGRATION_MODULE)
    order = (
        RISK_PUBLIC_INTERFACE, RISK_INTEGRATION_MODULE, RISK_SENSITIVE_PATH,
        RISK_DEPENDENCY_CHANGE,
    )
    return [f for f in order if f in flags]
