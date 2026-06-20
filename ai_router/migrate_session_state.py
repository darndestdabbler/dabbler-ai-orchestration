"""Bulk migrator: rewrite v2 ``session-state.json`` files into v3 shape.

Set 030 Session 4 deliverable. Two consumers will call into this
module:

1. The CLI ``python -m ai_router.migrate_session_state`` (this module's
   ``main()``). Bulk-walks ``docs/session-sets/*/session-state.json``
   under a scan root and migrates each in place (or dry-runs).
2. The VS Code extension's in-extension lazy migrator (Session 5 work).
   It will subprocess into this module per-set so both call paths share
   the same migration logic. ``migrate_one_set`` is the shared entry
   point.

Migration semantics
-------------------

The migrator is *inferential*, not strict. ``progress.synthesize_v3_from_v2``
is intentionally conservative — it defaults every session to
``not-started`` unless ``completedSessions[]`` lists the number — because
its job is to surface contradictions in v2 snapshots (per memory
``feedback_default_not_started_evidence_to_escalate``). The migrator's
job is different: it operates on *already-existing* v2 files where the
operator has already decided the set's semantics, and it has access to
stronger combined signals:

- ``status: "complete"`` **plus** ``lifecycleState: "closed"`` means the
  set is force-closed. Every session is complete (regardless of whether
  ``completedSessions[]`` was kept up to date — sets 007, 008, 011, 014
  etc. are closed without the array present).
- ``status: "complete"`` **plus** ``currentSession >= totalSessions``
  means the set ran to its planned end. Treat the same as force-closed.
- Otherwise: ``completedSessions[]`` is the authoritative count and we
  trust it. The single ``in-progress`` session (if any) is
  ``currentSession`` when the top-level status is ``in-progress`` and
  the number is not already in ``completedSessions[]``.

Dual-write per spec D5: the migrator writes BOTH the v3 ``sessions[]``
array AND the legacy triple (``currentSession`` / ``totalSessions`` /
``completedSessions``) derived from it. Set 030 does not drop legacy
emission. A future set may flip "stop writing legacy" once v3 readers
are confirmed across all three consumer repos.

Strategy values
---------------

- ``"regex"`` (default for the CLI). Use ``spec.md`` regex extraction
  for titles, falling back to ``"Session N"`` for headings that don't
  parse. Zero router cost. Deterministic.
- ``"generic"``. Use ``"Session N"`` labels even when regex would work.
  Useful for sets with intentionally malformed/missing specs where the
  operator wants neutral labels.
- ``"ai"``. Routes through ``ai_router.route()`` with
  ``task_type='spec-title-extraction'``. **Not implemented in Session 4
  (spec D7 / D14):** raises ``NotImplementedError`` pointing at the
  Session 5 wiring task. Reserved as a flag so consumer repos can
  start scripting against the strategy contract today.
- ``"interactive"`` (CLI-only). Prompts the operator at each set with
  a one-keystroke choice between regex, generic, and skip. Falls back
  to ``"regex"`` if stdin is not a TTY.
"""

from __future__ import annotations

import argparse
import dataclasses
import json
import os
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

try:
    from progress import (  # type: ignore[import-not-found]
        SCHEMA_VERSION_V3,
        SESSION_STATUS_COMPLETE,
        SESSION_STATUS_IN_PROGRESS,
        SESSION_STATUS_NOT_STARTED,
        LIFECYCLE_STATE_CLOSED,
        LIFECYCLE_STATE_WORK_IN_PROGRESS,
        SessionRecord,
        SessionStateInvariantError,
        canonicalize_status,
        extract_session_titles_from_spec,
        validate_invariants,
    )
except ImportError:
    from .progress import (  # type: ignore[no-redef]
        SCHEMA_VERSION_V3,
        SESSION_STATUS_COMPLETE,
        SESSION_STATUS_IN_PROGRESS,
        SESSION_STATUS_NOT_STARTED,
        LIFECYCLE_STATE_CLOSED,
        LIFECYCLE_STATE_WORK_IN_PROGRESS,
        SessionRecord,
        SessionStateInvariantError,
        canonicalize_status,
        extract_session_titles_from_spec,
        validate_invariants,
    )


SESSION_STATE_FILENAME = "session-state.json"
CANCELLED_MARKER_FILENAME = "CANCELLED.md"

STRATEGY_REGEX = "regex"
STRATEGY_GENERIC = "generic"
STRATEGY_AI = "ai"
STRATEGY_INTERACTIVE = "interactive"

STRATEGIES = (STRATEGY_REGEX, STRATEGY_GENERIC, STRATEGY_AI, STRATEGY_INTERACTIVE)

ACTION_MIGRATED = "migrated"
ACTION_SKIPPED_V3 = "skipped-v3"
ACTION_SKIPPED_NO_STATE = "skipped-no-state"
ACTION_SKIPPED_MALFORMED = "skipped-malformed"
ACTION_SKIPPED_OPERATOR = "skipped-operator"
ACTION_SKIPPED_FUTURE_SCHEMA = "skipped-future-schema"
ACTION_WOULD_VIOLATE = "would-violate"
# Set 030 Session 5: AI-strategy failure modes (per cross-provider audit
# 2026-05-17). Distinct codes per failure kind let the in-extension lazy
# migrator surface operator-actionable messages — "the model answered
# badly" reads differently from "your provider key is missing" and
# different again from "the spec has 4 sessions but the model returned
# 3 titles." Each maps to a no-write outcome; the migrator never writes
# a partial v3 file when AI resolution fails.
ACTION_FAILED_AI_NO_CREDS = "failed-ai-no-creds"
ACTION_FAILED_AI_PROVIDER_ERROR = "failed-ai-provider-error"
ACTION_FAILED_AI_BAD_OUTPUT = "failed-ai-bad-output"
ACTION_FAILED_AI_COUNT_MISMATCH = "failed-ai-count-mismatch"


class AiTitleResolutionError(Exception):
    """Base class for the AI-strategy failure exceptions.

    Each subclass maps to a distinct ``ACTION_FAILED_AI_*`` code so the
    in-extension migrator can render a kind-specific notification.
    """


class AiNoCredentialsError(AiTitleResolutionError):
    """Provider credentials not available (missing env var)."""


class AiProviderError(AiTitleResolutionError):
    """``ai_router.route()`` raised mid-call (rate limit, network, etc.)."""


class AiBadOutputError(AiTitleResolutionError):
    """Response content is not valid JSON or has the wrong shape."""


class AiCountMismatchError(AiTitleResolutionError):
    """Response had a different number of titles than spec.md requires."""


@dataclass(frozen=True)
class MigrationResult:
    """Outcome of attempting to migrate one set."""

    set_dir: str
    action: str
    reason: str = ""
    before: Optional[dict] = None
    after: Optional[dict] = None
    error: Optional[str] = None

    def is_change(self) -> bool:
        return self.action == ACTION_MIGRATED

    def to_dict(self) -> dict:
        return {
            "set_dir": self.set_dir,
            "action": self.action,
            "reason": self.reason,
            "before": self.before,
            "after": self.after,
            "error": self.error,
        }


def _strict_positive_int(v) -> bool:
    """Reject bool / float / str even when ``isinstance(x, int)`` is True."""
    return type(v) is int and v > 0


def _strip_legacy_completed(raw, total: int) -> List[int]:
    """Filter a legacy ``completedSessions`` value to in-range positive ints."""
    if not isinstance(raw, list):
        return []
    out: List[int] = []
    seen: set = set()
    for n in raw:
        if _strict_positive_int(n) and 1 <= n <= total and n not in seen:
            out.append(n)
            seen.add(n)
    out.sort()
    return out


def _resolve_total(state: dict, spec_titles: dict) -> int:
    """Pick the v3 ``totalSessions`` from the strongest available signal."""
    total_raw = state.get("totalSessions")
    candidates: List[int] = []
    if _strict_positive_int(total_raw):
        candidates.append(total_raw)
    if spec_titles:
        candidates.append(max(spec_titles.keys()))
    current_raw = state.get("currentSession")
    if _strict_positive_int(current_raw):
        candidates.append(current_raw)
    completed_raw = state.get("completedSessions") or []
    if isinstance(completed_raw, list):
        for n in completed_raw:
            if _strict_positive_int(n):
                candidates.append(n)
    return max(candidates) if candidates else 0


def _resolve_lifecycle_state(top_status: str, raw: Optional[str]) -> Optional[str]:
    """Normalize ``lifecycleState`` against the canonical top-level status.

    Conservative: keeps any non-empty value the operator wrote (after a
    sanity check against the top-level status). Only fills in obvious
    blanks — ``status: in-progress`` with ``lifecycleState: null`` gets
    ``"work_in_progress"``; ``status: complete`` with
    ``lifecycleState: null`` gets ``"closed"``.
    """
    if top_status == SESSION_STATUS_COMPLETE:
        return LIFECYCLE_STATE_CLOSED
    if top_status == "cancelled":
        # Cancelled sets are first-class top-level state but the
        # lifecycleState convention is ``closed`` (the marker file is
        # the operator-visible signal; rule 8 binds the field). Keep
        # whatever the operator wrote, defaulting to closed.
        return raw if isinstance(raw, str) and raw else LIFECYCLE_STATE_CLOSED
    if top_status == SESSION_STATUS_IN_PROGRESS:
        return raw if isinstance(raw, str) and raw else LIFECYCLE_STATE_WORK_IN_PROGRESS
    # not-started: keep the operator's explicit value (often ``null``)
    return raw


def _build_v3_sessions(
    state: dict,
    spec_titles: dict,
    *,
    total: int,
    use_generic_titles: bool,
) -> List[dict]:
    """Return the v3 ``sessions[]`` array derived from a v2 ``state`` dict.

    Inferential rules (see module docstring): force-promote every
    session to ``complete`` when the set is closed (``status: complete``
    plus ``lifecycleState: closed`` OR ``currentSession >= totalSessions``).
    Otherwise trust ``completedSessions[]`` for completion membership and
    promote ``currentSession`` to ``in-progress`` when the top-level
    status is ``in-progress``.
    """
    top_status = canonicalize_status(state.get("status"))
    lifecycle = state.get("lifecycleState")
    current_raw = state.get("currentSession")
    current_int = current_raw if _strict_positive_int(current_raw) else None
    # Round A fix: the alternative closed-signal disjunct must compare
    # against the LEGACY ``totalSessions`` field, not the resolved total.
    # If spec.md (or completedSessions[]) widened the total beyond the
    # legacy value, the operator's "I reached the last session" signal
    # was made against the old plan, not the widened one. Using resolved
    # total here meant a v2 file with status=complete, totalSessions=3,
    # currentSession=3, spec.md=4 sessions would fall out of the closed
    # branch (currentSession=3 < resolved=4) and into the all-not-started
    # else-branch — which then violates rule 7 (status=complete requires
    # every session complete). With this fix, the closed-signal fires
    # against legacy_total=3, every session in the resolved (=4) ledger
    # is force-promoted to complete, and rule 7 is satisfied.
    legacy_total_raw = state.get("totalSessions")
    legacy_total_int = (
        legacy_total_raw if _strict_positive_int(legacy_total_raw) else None
    )

    closed_signal = top_status == SESSION_STATUS_COMPLETE and (
        lifecycle == LIFECYCLE_STATE_CLOSED
        or (
            legacy_total_int is not None
            and current_int is not None
            and current_int >= legacy_total_int
        )
    )

    completed_legacy = _strip_legacy_completed(state.get("completedSessions"), total)

    if closed_signal:
        completed_set = set(range(1, total + 1))
    else:
        completed_set = set(completed_legacy)

    in_progress_number: Optional[int] = None
    if (
        top_status == SESSION_STATUS_IN_PROGRESS
        and current_int is not None
        and 1 <= current_int <= total
        and current_int not in completed_set
    ):
        in_progress_number = current_int

    sessions: List[dict] = []
    for n in range(1, total + 1):
        if use_generic_titles or n not in spec_titles:
            title = f"Session {n}"
        else:
            title = spec_titles[n]
        if in_progress_number is not None and n == in_progress_number:
            status = SESSION_STATUS_IN_PROGRESS
        elif n in completed_set:
            status = SESSION_STATUS_COMPLETE
        else:
            status = SESSION_STATUS_NOT_STARTED
        sessions.append({"number": n, "title": title, "status": status})
    return sessions


def _derive_legacy_triple(
    sessions: List[dict],
) -> Tuple[Optional[int], int, List[int]]:
    """Return ``(current, total, completed)`` derived from ``sessions[]``."""
    current: Optional[int] = None
    completed: List[int] = []
    for s in sessions:
        if s["status"] == SESSION_STATUS_IN_PROGRESS:
            current = s["number"]
        elif s["status"] == SESSION_STATUS_COMPLETE:
            completed.append(s["number"])
    completed.sort()
    return current, len(sessions), completed


def _migrate_state_dict(
    state: dict,
    spec_md_path: Path,
    *,
    use_generic_titles: bool,
    titles_override: Optional[Dict[int, str]] = None,
) -> Tuple[dict, List[dict]]:
    """Return ``(migrated_state_dict, sessions_array)``. Pure function.

    Validates the resulting array against the 8 v3 invariants before
    returning. Raises :class:`SessionStateInvariantError` if the
    inference produced an invalid shape — callers translate that into
    an ``ACTION_WOULD_VIOLATE`` result.

    ``titles_override`` (Set 030 Session 5): when provided, replaces
    the spec.md regex titles entirely. Used by the AI strategy after
    :func:`_resolve_titles_via_ai` produces a validated title list.
    The override is preferred for both ``total`` resolution AND the
    per-session title lookup; ``use_generic_titles`` is forced to
    False so the lookup actually consults the override map.
    """
    spec_titles = {n: t for n, t in extract_session_titles_from_spec(spec_md_path)}
    title_source = titles_override if titles_override is not None else spec_titles
    # When AI titles are supplied, they are the authoritative count
    # signal — _resolve_total picks max(spec_titles.keys()), so we
    # must pass the AI title map there too.
    total = _resolve_total(state, title_source)
    if total < 1:
        raise SessionStateInvariantError(
            1,
            "cannot determine totalSessions: no spec.md headings, no "
            "legacy totalSessions, no completedSessions, no currentSession",
        )

    sessions = _build_v3_sessions(
        state,
        title_source,
        total=total,
        # The override is the explicit-titles path; "generic" would
        # ignore it. When the caller provides an override they want
        # those titles, period.
        use_generic_titles=use_generic_titles and titles_override is None,
    )

    top_status_raw = state.get("status")
    top_status = canonicalize_status(top_status_raw)
    lifecycle_state = _resolve_lifecycle_state(top_status or "", state.get("lifecycleState"))

    # Convert to records for validation (the validator API takes records).
    records = [
        SessionRecord(number=s["number"], title=s["title"], status=s["status"])
        for s in sessions
    ]
    validate_invariants(records, top_status=top_status, lifecycle_state=lifecycle_state)

    current, derived_total, completed = _derive_legacy_triple(sessions)

    out = dict(state)
    out["schemaVersion"] = SCHEMA_VERSION_V3
    out["sessions"] = sessions
    if top_status is not None and top_status != top_status_raw:
        out["status"] = top_status
    if lifecycle_state is not None or "lifecycleState" in out:
        out["lifecycleState"] = lifecycle_state
    out["currentSession"] = current
    out["totalSessions"] = derived_total
    out["completedSessions"] = completed
    return out, sessions


def _probe_env_var_scopes(var_name: str) -> Dict[str, bool]:
    """Probe Process, User, and (on Windows) Machine scopes for ``var_name``.

    Returns a dict ``{"process": bool, "user": bool, "machine": bool}``
    indicating where the variable is set. On non-Windows platforms,
    User and Machine scopes are mapped to Process scope (Linux/macOS
    don't have the same persistent-scope distinction; what
    ``os.environ`` sees is the canonical answer).

    The Windows-specific path reads the registry via ``winreg`` because
    Python's ``os.environ`` is a snapshot taken at process launch and
    won't see User/Machine vars set AFTER Python started. This is the
    exact failure mode that motivated this probe: an operator sets
    DABBLER_ANTHROPIC_API_KEY in System Properties -> Environment Variables
    (User scope), but Python was already running, so ``os.getenv``
    returns None and ai_router raises "Missing environment variable."
    The operator's intuition ("I set the key") is correct; the process
    inheritance is the problem.

    Defensive: any winreg/os errors degrade to "scope not visible to
    this probe," so the probe never raises. The caller treats absent
    scopes as "no signal" rather than "absent."
    """
    out: Dict[str, bool] = {
        "process": bool(os.environ.get(var_name)),
        "user": False,
        "machine": False,
    }

    if sys.platform != "win32":
        # On Linux/macOS the persistent scopes don't exist as a
        # separate registry; what's in os.environ is canonical. Mirror
        # the process result so the caller's logic is platform-agnostic.
        out["user"] = out["process"]
        out["machine"] = out["process"]
        return out

    try:
        import winreg  # type: ignore[import-not-found]
    except ImportError:
        return out

    def _read(hive, subkey: str) -> bool:
        try:
            with winreg.OpenKey(hive, subkey) as key:
                value, _type = winreg.QueryValueEx(key, var_name)
                return isinstance(value, str) and len(value) > 0
        except (OSError, FileNotFoundError):
            return False

    out["user"] = _read(winreg.HKEY_CURRENT_USER, r"Environment")
    out["machine"] = _read(
        winreg.HKEY_LOCAL_MACHINE,
        r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment",
    )
    return out


def _augment_no_creds_reason(underlying_error: str) -> str:
    """Augment the no-creds reason with scope-probe diagnostics.

    Parses the underlying error text for tokens that look like Dabbler
    provider env-var names (``DABBLER_ANTHROPIC_API_KEY``,
    ``DABBLER_GEMINI_API_KEY``, ``DABBLER_OPENAI_API_KEY``). For each one found, probes
    Process / User / Machine scopes and, if the var is set in a
    persistent scope but NOT inherited by this Python process,
    appends an inheritance-trap note so the operator sees the right
    next step ("restart your shell" rather than "set the key").

    Returns the augmented text. If no candidate env-var names are
    found in the error, returns the empty string.
    """
    import re

    # Anchored on Dabbler's provider env-var convention: all-uppercase,
    # underscore-separated, ends with _API_KEY. Two-letter min prefix
    # to avoid catching bare "API_KEY".
    candidates = sorted(set(re.findall(r"[A-Z][A-Z_]+_API_KEY", underlying_error)))
    if not candidates:
        return ""

    lines: List[str] = []
    for var in candidates:
        scopes = _probe_env_var_scopes(var)
        if scopes["process"]:
            # Process sees it; ai_router's error text is suspicious —
            # maybe an empty-string value or whitespace-only? Surface
            # this state so the operator can investigate.
            lines.append(
                f"  - {var}: SET in this Python process, but ai_router "
                f"reported it missing - value may be empty/whitespace."
            )
        elif scopes["user"] or scopes["machine"]:
            scope_label = (
                "User" if scopes["user"] and not scopes["machine"]
                else "Machine" if scopes["machine"] and not scopes["user"]
                else "User AND Machine"
            )
            lines.append(
                f"  - {var}: set in {scope_label} scope but NOT inherited "
                f"by this Python process. The process was likely started "
                f"BEFORE the env var was added. Restart your shell (or "
                f"VS Code), or set the var ephemerally for this session: "
                f"`$env:{var} = '...'` (PowerShell) / "
                f"`export {var}=...` (bash)."
            )
        else:
            lines.append(
                f"  - {var}: not set in Process, User, or Machine scope."
            )

    return "Env-var scope probe:\n" + "\n".join(lines)


def _build_ai_title_prompt(spec_text: str, expected_count: int) -> str:
    """Render the system+user prompt for ``task_type='spec-title-extraction'``.

    Kept as a small pure helper so unit tests can assert the prompt
    shape without invoking the router. The shape is:

      * Ask explicitly for JSON, no preamble.
      * State the expected count to make a count-mismatch error
        attributable to the model rather than to ambiguity in the spec.
      * Emit each record as ``{"number": <int>, "title": <str>}`` so
        the response matches v3's ``sessions[]`` entry shape.

    Including the entire spec.md is OK at gemini-flash pricing — the
    longest specs in this repo run ~700 lines.
    """
    return (
        "You are extracting session titles from a Dabbler AI workflow "
        "spec.md to seed a v3 session-state.json migration. Read the "
        f"spec below and return EXACTLY {expected_count} session "
        "records as a JSON array of {\"number\": int, \"title\": str} "
        "objects.\n\n"
        "Rules:\n"
        "  * Return JSON ONLY. No preamble, no markdown fence, no\n"
        "    trailing commentary.\n"
        "  * The array MUST have exactly "
        f"{expected_count} entries, with `number` running 1..{expected_count}.\n"
        "  * Each `title` should be a short human-friendly label "
        "(under 80 chars), distilled from the spec's session "
        "headings or section descriptions.\n\n"
        "spec.md content:\n\n"
        f"{spec_text}\n"
    )


def _resolve_titles_via_ai(
    spec_md_path: Path,
    expected_count: int,
) -> Dict[int, str]:
    """Resolve session titles via ``ai_router.route()``.

    Returns ``{session_number: title}`` for ``1..expected_count`` on
    success. Raises one of the :class:`AiTitleResolutionError`
    subclasses on failure so :func:`migrate_one_set` can map the
    failure kind to the right ``ACTION_FAILED_AI_*`` code.

    The RouteResult is dumped to JSON via ``dataclasses.asdict`` +
    ``json.dumps`` before any attribute access (per memory
    ``feedback_ai_router_route_result_handling`` — wrappers have
    crashed during attribute access in the past). The ``content``
    field is read from the dumped dict, not the dataclass directly.

    Failure mapping:
      * ``RuntimeError`` containing "API key" / "credentials" /
        "auth" — :class:`AiNoCredentialsError`.
      * Any other ``RuntimeError`` / ``ConnectionError`` /
        ``TimeoutError`` from ``route()`` — :class:`AiProviderError`.
      * JSON parse failure or non-list shape —
        :class:`AiBadOutputError`.
      * Title array length != ``expected_count``, or any record
        missing the required keys —
        :class:`AiCountMismatchError` / :class:`AiBadOutputError`.
    """
    # Read spec.md content. If it's missing, we still let the AI try
    # — the prompt explicitly states the count, and a model can
    # generate plausible "Session 1, 2, …" titles from the slug
    # alone. Empty file is fine; the model receives the empty
    # context and falls back to generic-style output.
    #
    # Round B fix: an OSError reading spec.md is a LOCAL input failure
    # — the AI never gets called. Letting the OSError propagate (rather
    # than wrapping in AiBadOutputError) lets migrate_one_set's
    # STRATEGY_AI branch route it through ACTION_SKIPPED_MALFORMED,
    # which is the correct kind. AiBadOutputError specifically means
    # "the model returned something we couldn't use," which would be
    # misleading when no model call ever happened.
    spec_text = spec_md_path.read_text(encoding="utf-8") if spec_md_path.is_file() else ""

    # Deferred import: keeps the migrator's import lightweight when
    # only regex/generic strategies are used. ai_router's top-level
    # __init__ loads router-config.yaml on first call, which is
    # expensive on cold starts.
    #
    # Round A fix #2: an ``ImportError`` here means the package isn't
    # installed; the operator action is "install dabbler-ai-router,"
    # not "set an API key." Route through AiProviderError so the
    # extension's notification points at the install-ai-router command
    # rather than the env-var configuration page.
    try:
        from ai_router import route as _route  # type: ignore[no-redef]
    except ImportError as exc:
        raise AiProviderError(
            f"ai_router module not importable ({exc}); the "
            f"`dabbler-ai-router` package is not installed in the active "
            f"environment. Run `Dabbler: Install ai-router` from the "
            f"command palette (or `pip install dabbler-ai-router` "
            f"manually) and retry."
        ) from exc

    prompt = _build_ai_title_prompt(spec_text, expected_count)

    try:
        result = _route(content=prompt, task_type="spec-title-extraction")
    except Exception as exc:  # noqa: BLE001 — route() can raise provider-specific exceptions
        # Round A fix #1: classify provider exceptions narrowly. Common
        # transient failures (rate limit, quota, network) often mention
        # the API key or credentials in their human-readable text
        # without actually meaning "your credential is invalid." Order
        # the matchers so quota/rate-limit/server tokens are checked
        # FIRST and route to AiProviderError, even when the message
        # also mentions credentials. Only after those negative
        # screens do we accept the narrow "missing or invalid
        # auth credential" reading.
        msg = str(exc).lower()
        rate_limit_or_transient = (
            "rate limit", "rate-limit", "ratelimit",
            "429", "quota", "resource exhausted", "resource_exhausted",
            "timeout", "timed out", "connection",
            "503", "service unavailable", "internal server error", "500",
        )
        if any(token in msg for token in rate_limit_or_transient):
            raise AiProviderError(f"ai_router.route() failed: {exc}") from exc

        # Narrow no-creds matchers — explicit "missing API key" or
        # "invalid API key" phrasings + the canonical HTTP 401 /
        # unauthorized tokens. Bare "credential" alone is too broad
        # (Round A: "renewing credentials, please retry" misclassified)
        # so the matcher requires "credential" to be combined with an
        # invalid/missing qualifier.
        #
        # `"missing environment variable"` is added because that's the
        # exact phrasing emitted by ai_router's own providers (see
        # ai_router/providers.py: "Missing environment variable
        # DABBLER_ANTHROPIC_API_KEY for Anthropic"). Without it, the migrator
        # would receive ai_router's most common missing-credential
        # error and route it through AiProviderError instead of
        # AiNoCredentialsError.
        no_creds_phrases = (
            "missing environment variable",  # ai_router's own phrasing
            "missing api key", "no api key", "invalid api key",
            "missing api_key", "no api_key", "invalid api_key",
            "missing apikey", "no apikey", "invalid apikey",
            "missing credential", "no credential", "invalid credential",
            "authentication failed", "authentication error",
            "unauthorized", "http 401", "401 unauthorized", "401 error",
            "not authenticated",
            "api_key is not set", "api key is not set",
            "apikey is not set",
        )
        if any(phrase in msg for phrase in no_creds_phrases):
            # Operator add-on: before declaring "missing credentials,"
            # probe User + Machine env-var scopes. On Windows the
            # inheritance-trap is real — the var IS set persistently,
            # but Python launched before the change. Augmenting the
            # reason with scope-probe results tells the operator the
            # right next step (restart the shell vs set the key).
            scope_note = _augment_no_creds_reason(str(exc))
            base = (
                f"provider credentials not available: {exc}. Set the "
                f"appropriate provider API key env var "
                f"(DABBLER_ANTHROPIC_API_KEY, DABBLER_OPENAI_API_KEY, "
                f"DABBLER_GEMINI_API_KEY) "
                f"and retry."
            )
            full_reason = base + ("\n\n" + scope_note if scope_note else "")
            raise AiNoCredentialsError(full_reason) from exc

        raise AiProviderError(f"ai_router.route() failed: {exc}") from exc

    # Per memory feedback_ai_router_route_result_handling: dump the
    # RouteResult to JSON BEFORE any attribute access. If the
    # wrapper crashes on serialization, we catch it as a bad-output
    # error instead of letting the exception bubble through
    # migrate_one_set as a raw traceback.
    try:
        result_payload = json.loads(json.dumps(dataclasses.asdict(result)))
    except Exception as exc:  # noqa: BLE001
        raise AiBadOutputError(
            f"could not serialize RouteResult ({type(result).__name__}): {exc}"
        ) from exc

    # Round A fix #3: every AiBadOutputError carries the first 200
    # chars of the model output so the operator can see WHAT the
    # model returned. Snippet helper handles the missing/non-string
    # cases too.
    raw_content = result_payload.get("content")
    snippet = (
        raw_content[:200] if isinstance(raw_content, str) else repr(raw_content)
    )

    if result_payload.get("truncated"):
        # Truncation means the model ran out of output tokens; the
        # response body is almost certainly an incomplete JSON
        # fragment. Surface this as bad-output with the truncation
        # cause spelled out — the operator's next step is usually
        # to bump max_output_tokens on the gemini-flash entry in
        # router-config.yaml.
        raise AiBadOutputError(
            "RouteResult.truncated=True — the model output was cut "
            "off mid-response (max_output_tokens reached). Increase "
            "the limit for gemini-flash in router-config.yaml or "
            f"retry with a shorter spec. First 200 chars: {snippet!r}"
        )

    content = result_payload.get("content")
    if not isinstance(content, str) or not content.strip():
        raise AiBadOutputError(
            "RouteResult.content is missing or empty; the model "
            f"returned no usable text. First 200 chars: {snippet!r}"
        )

    # Strip a possible Markdown code fence (``` … ```), which some
    # providers wrap around JSON despite the prompt instruction.
    text = content.strip()
    if text.startswith("```"):
        # Drop the opening fence (with optional language tag) and the
        # closing fence.
        lines = text.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as exc:
        raise AiBadOutputError(
            f"could not parse model output as JSON: {exc}. "
            f"First 200 chars of output: {text[:200]!r}"
        ) from exc

    if not isinstance(parsed, list):
        raise AiBadOutputError(
            f"expected a JSON array, got {type(parsed).__name__}. "
            f"First 200 chars: {text[:200]!r}"
        )

    if len(parsed) != expected_count:
        raise AiCountMismatchError(
            f"model returned {len(parsed)} title(s) but the spec "
            f"requires exactly {expected_count}. The migrator will "
            f"not silently truncate or pad; rerun with --strategy "
            f"regex or hand-edit spec.md to match."
        )

    titles: Dict[int, str] = {}
    for i, record in enumerate(parsed, start=1):
        # Round A fix #3: every per-entry AiBadOutputError carries the
        # first 200 chars of the parsed text so the operator can see
        # exactly which response shape was rejected.
        if not isinstance(record, dict):
            raise AiBadOutputError(
                f"array entry {i} is {type(record).__name__}, "
                f"expected an object with 'number' and 'title'. "
                f"First 200 chars of output: {text[:200]!r}"
            )
        number = record.get("number")
        title = record.get("title")
        if not isinstance(number, int) or number != i:
            raise AiBadOutputError(
                f"array entry {i} has number={number!r} (expected {i}). "
                f"The model's 'number' field must run 1..N in order. "
                f"First 200 chars of output: {text[:200]!r}"
            )
        if not isinstance(title, str) or not title.strip():
            raise AiBadOutputError(
                f"array entry {i} has title={title!r} (expected "
                f"non-empty string). First 200 chars of output: "
                f"{text[:200]!r}"
            )
        titles[number] = title.strip()
    return titles


def migrate_one_set(
    set_dir: str,
    *,
    strategy: str = STRATEGY_REGEX,
    dry_run: bool = True,
) -> MigrationResult:
    """Migrate one session-set directory's ``session-state.json`` to v3.

    Idempotent: a v3 file is returned as ``ACTION_SKIPPED_V3`` without
    touching disk. A missing or malformed state file is reported with
    a skip action and a human-readable reason.

    Shared with the in-extension lazy migrator (Session 5). The
    extension calls this via Python subprocess from
    ``tools/dabbler-ai-orchestration/src/...``. The contract is: this
    function never raises for a "file isn't there / file is broken"
    case — those become structured result records that the caller can
    surface in the UI.

    The CLI's ``--strategy interactive`` value is resolved upstream
    (in :func:`main`) into either ``regex`` or ``generic`` before
    calling here, so this function only sees the three deterministic
    strategies (``regex``, ``generic``, ``ai``).
    """
    if strategy not in STRATEGIES:
        raise ValueError(
            f"unknown strategy {strategy!r}; expected one of {STRATEGIES}"
        )
    if strategy == STRATEGY_INTERACTIVE:
        # The CLI resolves interactive into regex/generic before calling
        # in; library callers passing INTERACTIVE directly get the safe
        # default. We could refuse instead, but the extension's lazy
        # migrator (Session 5) will pass a deterministic strategy chosen
        # via the quickpick — and a hypothetical script that copy-pastes
        # the CLI flag verbatim shouldn't crash.
        strategy = STRATEGY_REGEX

    state_path = os.path.join(set_dir, SESSION_STATE_FILENAME)
    if not os.path.isfile(state_path):
        return MigrationResult(
            set_dir=set_dir,
            action=ACTION_SKIPPED_NO_STATE,
            reason=f"{SESSION_STATE_FILENAME} not found",
        )

    try:
        with open(state_path, "r", encoding="utf-8") as f:
            state = json.load(f)
    except (OSError, json.JSONDecodeError) as exc:
        return MigrationResult(
            set_dir=set_dir,
            action=ACTION_SKIPPED_MALFORMED,
            reason=f"failed to parse: {exc}",
            error=str(exc),
        )

    if not isinstance(state, dict):
        return MigrationResult(
            set_dir=set_dir,
            action=ACTION_SKIPPED_MALFORMED,
            reason=f"top-level JSON is {type(state).__name__}, expected object",
        )

    schema_version = state.get("schemaVersion")
    # Round A fix: refuse to run the v2→v3 migration on any file whose
    # schemaVersion is already v3 or higher. Exact v3 with sessions[] is
    # the idempotent skip case. Exact v3 without sessions[] is a corrupt
    # v3 shape (must NOT be reinterpreted as v2 and rewritten). Any
    # schemaVersion > 3 belongs to a future schema this migrator does not
    # know about; downgrading it by treating its fields as v2 would
    # silently corrupt state.
    if isinstance(schema_version, int) and schema_version > SCHEMA_VERSION_V3:
        return MigrationResult(
            set_dir=set_dir,
            action=ACTION_SKIPPED_FUTURE_SCHEMA,
            reason=(
                f"schemaVersion={schema_version} is newer than this migrator "
                f"(v{SCHEMA_VERSION_V3}); refusing to downgrade. Upgrade the "
                "migrator or hand-edit the file."
            ),
            before=state,
        )
    if schema_version == SCHEMA_VERSION_V3:
        if isinstance(state.get("sessions"), list):
            return MigrationResult(
                set_dir=set_dir,
                action=ACTION_SKIPPED_V3,
                reason="already v3 (sessions[] present)",
                before=state,
                after=state,
            )
        # Self-identified v3 but missing/broken sessions[] — refuse to
        # rewrite by re-running v2 inference (which would treat the
        # missing array as a default-not-started signal and obliterate
        # any operator intent recorded by the v3 writer that produced
        # this file).
        return MigrationResult(
            set_dir=set_dir,
            action=ACTION_SKIPPED_MALFORMED,
            reason=(
                "schemaVersion=3 but sessions[] is missing or not a list; "
                "this is a broken v3 file, not a v2 file. Hand-repair or "
                "restore from git."
            ),
            before=state,
        )

    spec_md_path = Path(set_dir) / "spec.md"
    use_generic = strategy == STRATEGY_GENERIC

    titles_override: Optional[Dict[int, str]] = None
    if strategy == STRATEGY_AI:
        # Resolve the expected count once from existing signals
        # (legacy fields + regex titles) so the AI prompt can state
        # an exact target. If even this fails, the file genuinely
        # has nothing to work with — fall through with a count of 0
        # and let the helper return AiBadOutputError on the
        # mismatch, which is the right operator-facing message.
        regex_spec_titles = {
            n: t for n, t in extract_session_titles_from_spec(spec_md_path)
        }
        expected_count = _resolve_total(state, regex_spec_titles)
        if expected_count < 1:
            return MigrationResult(
                set_dir=set_dir,
                action=ACTION_FAILED_AI_BAD_OUTPUT,
                reason=(
                    "cannot determine target session count from state file "
                    "or spec.md; AI strategy needs a numeric anchor. "
                    "Hand-edit spec.md to include `### Session 1 of N: ...` "
                    "headings or use --strategy generic."
                ),
                before=state,
            )
        try:
            titles_override = _resolve_titles_via_ai(spec_md_path, expected_count)
        except AiNoCredentialsError as exc:
            return MigrationResult(
                set_dir=set_dir,
                action=ACTION_FAILED_AI_NO_CREDS,
                reason=str(exc),
                before=state,
                error=str(exc),
            )
        except AiProviderError as exc:
            return MigrationResult(
                set_dir=set_dir,
                action=ACTION_FAILED_AI_PROVIDER_ERROR,
                reason=str(exc),
                before=state,
                error=str(exc),
            )
        except AiCountMismatchError as exc:
            return MigrationResult(
                set_dir=set_dir,
                action=ACTION_FAILED_AI_COUNT_MISMATCH,
                reason=str(exc),
                before=state,
                error=str(exc),
            )
        except AiBadOutputError as exc:
            return MigrationResult(
                set_dir=set_dir,
                action=ACTION_FAILED_AI_BAD_OUTPUT,
                reason=str(exc),
                before=state,
                error=str(exc),
            )
        except OSError as exc:
            # Round B fix: an OSError reading spec.md is a LOCAL input
            # failure, NOT an AI-output failure. Mapping it to
            # ACTION_SKIPPED_MALFORMED preserves the operator's
            # mental model: "your file is broken" stays separate from
            # "the model answered badly." See Round B verifier finding
            # 2026-05-17 for the rationale.
            return MigrationResult(
                set_dir=set_dir,
                action=ACTION_SKIPPED_MALFORMED,
                reason=f"could not read spec.md for AI strategy: {exc}",
                before=state,
                error=str(exc),
            )

    try:
        new_state, _sessions = _migrate_state_dict(
            state,
            spec_md_path,
            use_generic_titles=use_generic,
            titles_override=titles_override,
        )
    except SessionStateInvariantError as exc:
        return MigrationResult(
            set_dir=set_dir,
            action=ACTION_WOULD_VIOLATE,
            reason=str(exc),
            before=state,
            error=str(exc),
        )
    except (ValueError, TypeError) as exc:
        return MigrationResult(
            set_dir=set_dir,
            action=ACTION_SKIPPED_MALFORMED,
            reason=f"unexpected migration error: {exc}",
            before=state,
            error=str(exc),
        )

    if not dry_run:
        _atomic_write_json(state_path, new_state)

    if strategy == STRATEGY_AI:
        reason = "v2 → v3 (AI-refined titles)"
    elif use_generic:
        reason = "v2 → v3 (generic titles)"
    else:
        reason = "v2 → v3 (regex titles)"
    return MigrationResult(
        set_dir=set_dir,
        action=ACTION_MIGRATED,
        reason=reason,
        before=state,
        after=new_state,
    )


def _atomic_write_json(path: str, data: dict) -> None:
    """Write ``data`` to ``path`` via unique tempfile + os.replace.

    Atomic on POSIX and on Windows for same-volume replaces; the
    migrator never crosses volumes (the temp file is created in the
    same directory as the target).

    Round A fix: use ``tempfile.mkstemp`` with a per-invocation unique
    suffix so concurrent migrator runs cannot collide on a fixed
    ``.{basename}.tmp`` path. The earlier implementation also left a
    half-written temp file behind if ``json.dump`` or ``f.write`` raised
    (disk full mid-write, etc.). The ``try/finally`` ensures the temp
    is unlinked on any failure path BEFORE ``os.replace``; after a
    successful replace, the original temp filename no longer exists.
    """
    directory = os.path.dirname(path) or "."
    basename = os.path.basename(path)
    # mkstemp creates the file atomically with mode 0600 and returns a
    # raw file descriptor + the absolute path. We close the fd
    # immediately and reopen via the standard open() so the text-mode
    # write semantics (newline translation off via encoding="utf-8")
    # match the historical write behavior.
    fd, tmp_path = tempfile.mkstemp(
        prefix=f".{basename}.",
        suffix=".tmp",
        dir=directory,
    )
    os.close(fd)
    try:
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
            f.write("\n")
        os.replace(tmp_path, path)
    except BaseException:
        # Best-effort cleanup. If the temp file is still on disk (the
        # failure happened before os.replace consumed it), unlink it.
        # Suppress secondary errors so the original exception
        # propagates with its original cause.
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


def discover_session_sets(scan_root: str) -> List[str]:
    """Find candidate session-set directories under ``scan_root``.

    A "candidate" is any directory directly under ``scan_root`` that
    contains a ``session-state.json`` file. The scan root itself is
    typically ``docs/session-sets`` but the CLI accepts any path so
    consumer repos can run the migrator against their own layouts.
    """
    if not os.path.isdir(scan_root):
        return []
    out: List[str] = []
    for name in sorted(os.listdir(scan_root)):
        path = os.path.join(scan_root, name)
        if not os.path.isdir(path):
            continue
        if os.path.isfile(os.path.join(path, SESSION_STATE_FILENAME)):
            out.append(path)
    return out


def migrate_all(
    scan_root: str,
    *,
    strategy: str = STRATEGY_REGEX,
    dry_run: bool = True,
    set_filter: Optional[Iterable[str]] = None,
) -> List[MigrationResult]:
    """Migrate every session set under ``scan_root``.

    ``set_filter``, if provided, restricts the migration to set-dir
    basenames whose name appears in the iterable — useful for the
    extension's per-set migrate command (Session 5) which passes a
    single set name.
    """
    candidates = discover_session_sets(scan_root)
    if set_filter is not None:
        filter_set = set(set_filter)
        candidates = [p for p in candidates if os.path.basename(p) in filter_set]
    results: List[MigrationResult] = []
    for set_dir in candidates:
        results.append(migrate_one_set(set_dir, strategy=strategy, dry_run=dry_run))
    return results


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _default_scan_root() -> str:
    """Best-effort default for ``--scan`` when run from a workspace root."""
    candidate = os.path.join(os.getcwd(), "docs", "session-sets")
    return candidate if os.path.isdir(candidate) else os.getcwd()


def _print_result_line(r: MigrationResult, *, verbose: bool) -> None:
    """One-line summary per result; verbose mode dumps before/after JSON."""
    name = os.path.basename(r.set_dir) or r.set_dir
    if r.action == ACTION_MIGRATED:
        sessions_summary = ""
        if r.after and isinstance(r.after.get("sessions"), list):
            sessions = r.after["sessions"]
            complete = sum(1 for s in sessions if s.get("status") == SESSION_STATUS_COMPLETE)
            in_progress = sum(1 for s in sessions if s.get("status") == SESSION_STATUS_IN_PROGRESS)
            not_started = sum(1 for s in sessions if s.get("status") == SESSION_STATUS_NOT_STARTED)
            sessions_summary = (
                f"  ({complete} complete, {in_progress} in-progress, "
                f"{not_started} not-started)"
            )
        print(f"  [migrated]    {name}{sessions_summary}")
    elif r.action == ACTION_SKIPPED_V3:
        print(f"  [skip:v3]     {name}  (already v3)")
    elif r.action == ACTION_SKIPPED_NO_STATE:
        print(f"  [skip:nostate]{name}  ({r.reason})")
    elif r.action == ACTION_SKIPPED_MALFORMED:
        print(f"  [skip:bad]    {name}  ({r.reason})")
    elif r.action == ACTION_SKIPPED_OPERATOR:
        print(f"  [skip:user]   {name}  ({r.reason})")
    elif r.action == ACTION_SKIPPED_FUTURE_SCHEMA:
        print(f"  [skip:future] {name}  ({r.reason})")
    elif r.action == ACTION_WOULD_VIOLATE:
        print(f"  [WOULD-VIOLATE] {name}  ({r.reason})")
    else:
        print(f"  [unknown:{r.action}] {name}  ({r.reason})")

    if verbose and r.action == ACTION_MIGRATED:
        print("    --- before (v2):")
        for line in json.dumps(r.before, indent=2).splitlines():
            print(f"    {line}")
        print("    --- after (v3 dual-write):")
        for line in json.dumps(r.after, indent=2).splitlines():
            print(f"    {line}")


def _interactive_choose_strategy(set_dir: str) -> Optional[str]:
    """Prompt the operator for a per-set strategy. ``None`` means skip.

    Falls back to ``"regex"`` when stdin is not a TTY — keeps the CLI
    scriptable without making ``--strategy interactive`` blow up in CI.
    """
    if not sys.stdin.isatty():
        return STRATEGY_REGEX
    name = os.path.basename(set_dir)
    while True:
        prompt = (
            f"\n  {name}\n"
            "    [r]egex titles (default)  "
            "[g]eneric labels  "
            "[s]kip this set  "
            "[q]uit: "
        )
        sys.stdout.write(prompt)
        sys.stdout.flush()
        try:
            answer = sys.stdin.readline().strip().lower()
        except (EOFError, KeyboardInterrupt):
            return None
        if answer in ("", "r", "regex"):
            return STRATEGY_REGEX
        if answer in ("g", "generic"):
            return STRATEGY_GENERIC
        if answer in ("s", "skip"):
            return None
        if answer in ("q", "quit"):
            sys.stdout.write("    quitting\n")
            sys.exit(0)
        sys.stdout.write(f"    unknown choice {answer!r}; try again\n")


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="ai_router.migrate_session_state",
        description=(
            "Bulk-migrate session-state.json files from v2 to v3 "
            "(dual-write shape per spec D5). Idempotent: files already "
            "in v3 are skipped. Default mode is dry-run."
        ),
    )
    parser.add_argument(
        "--scan",
        default=_default_scan_root(),
        help=(
            "Directory under which to find session sets. Default: "
            "./docs/session-sets when present, else the current directory."
        ),
    )
    parser.add_argument(
        "--in-place",
        action="store_true",
        help="Write migrated state files. Default is dry-run (no writes).",
    )
    parser.add_argument(
        "--strategy",
        choices=STRATEGIES,
        default=STRATEGY_INTERACTIVE,
        help=(
            "Title-extraction strategy. 'regex' uses spec.md headings "
            "(deterministic, free). 'generic' uses 'Session N' labels. "
            "'ai' is reserved for Session 5 (raises NotImplementedError "
            "in Session 4). 'interactive' (default) prompts per set."
        ),
    )
    parser.add_argument(
        "--only",
        action="append",
        default=[],
        metavar="SET_NAME",
        help=(
            "Restrict migration to one or more session-set directory "
            "basenames (e.g., --only 011-readme-polish). May be repeated."
        ),
    )
    parser.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        help="Dump before/after JSON for each migrated set.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit machine-readable JSON results instead of human text.",
    )
    args = parser.parse_args(argv)

    scan_root = args.scan
    candidates = discover_session_sets(scan_root)
    if args.only:
        only_set = set(args.only)
        candidates = [p for p in candidates if os.path.basename(p) in only_set]

    if not candidates:
        msg = f"no session sets found under {scan_root!r}"
        if args.json:
            print(json.dumps({
                "scan_root": scan_root,
                "strategy": args.strategy,
                "dry_run": not args.in_place,
                "counts": {
                    "migrated": 0,
                    "skipped_v3": 0,
                    "skipped_no_state": 0,
                    "skipped_malformed": 0,
                    "skipped_operator": 0,
                    "skipped_future_schema": 0,
                    "would_violate": 0,
                    "total": 0,
                },
                "results": [],
                "note": msg,
            }))
        else:
            print(msg)
        return 0

    results: List[MigrationResult] = []
    dry_run = not args.in_place

    if not args.json:
        mode = "DRY RUN" if dry_run else "IN-PLACE"
        print(f"\n  Bulk migrator [{mode}] - scan root: {scan_root}")
        print(f"  Strategy: {args.strategy}\n")

    for set_dir in candidates:
        if args.strategy == STRATEGY_INTERACTIVE:
            chosen = _interactive_choose_strategy(set_dir)
            if chosen is None:
                results.append(
                    MigrationResult(
                        set_dir=set_dir,
                        action=ACTION_SKIPPED_OPERATOR,
                        reason="operator chose to skip",
                    )
                )
                if not args.json:
                    _print_result_line(results[-1], verbose=False)
                continue
            r = migrate_one_set(set_dir, strategy=chosen, dry_run=dry_run)
        else:
            r = migrate_one_set(set_dir, strategy=args.strategy, dry_run=dry_run)
        results.append(r)
        if not args.json:
            _print_result_line(r, verbose=args.verbose)

    counts = {
        "migrated": sum(1 for r in results if r.action == ACTION_MIGRATED),
        "skipped_v3": sum(1 for r in results if r.action == ACTION_SKIPPED_V3),
        "skipped_no_state": sum(1 for r in results if r.action == ACTION_SKIPPED_NO_STATE),
        "skipped_malformed": sum(1 for r in results if r.action == ACTION_SKIPPED_MALFORMED),
        "skipped_operator": sum(1 for r in results if r.action == ACTION_SKIPPED_OPERATOR),
        "skipped_future_schema": sum(1 for r in results if r.action == ACTION_SKIPPED_FUTURE_SCHEMA),
        "would_violate": sum(1 for r in results if r.action == ACTION_WOULD_VIOLATE),
        # Set 030 Session 5: AI-strategy outcomes counted distinctly so
        # `--strategy ai --json` callers (incl. the in-extension migrator)
        # can render kind-specific summaries when a bulk run fans out.
        "failed_ai_no_creds": sum(1 for r in results if r.action == ACTION_FAILED_AI_NO_CREDS),
        "failed_ai_provider_error": sum(1 for r in results if r.action == ACTION_FAILED_AI_PROVIDER_ERROR),
        "failed_ai_bad_output": sum(1 for r in results if r.action == ACTION_FAILED_AI_BAD_OUTPUT),
        "failed_ai_count_mismatch": sum(1 for r in results if r.action == ACTION_FAILED_AI_COUNT_MISMATCH),
        "total": len(results),
    }

    if args.json:
        print(json.dumps(
            {
                "scan_root": scan_root,
                "strategy": args.strategy,
                "dry_run": dry_run,
                "counts": counts,
                "results": [r.to_dict() for r in results],
            },
            indent=2,
        ))
    else:
        print()
        print(
            f"  Summary: {counts['migrated']} migrated, "
            f"{counts['skipped_v3']} already v3, "
            f"{counts['skipped_operator']} skipped by operator, "
            f"{counts['skipped_no_state']} no state file, "
            f"{counts['skipped_malformed']} malformed, "
            f"{counts['would_violate']} would-violate."
        )
        if dry_run and counts["migrated"]:
            print("  (dry run; rerun with --in-place to write changes)")

    # Exit 1 if any set would violate; 0 otherwise. Callers (CI, scripts)
    # see a non-zero exit when an automated migration cannot be completed
    # cleanly. Operator-driven skips don't count as failures.
    return 1 if counts["would_violate"] else 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())


__all__ = [
    "SESSION_STATE_FILENAME",
    "STRATEGY_REGEX",
    "STRATEGY_GENERIC",
    "STRATEGY_AI",
    "STRATEGY_INTERACTIVE",
    "STRATEGIES",
    "ACTION_MIGRATED",
    "ACTION_SKIPPED_V3",
    "ACTION_SKIPPED_NO_STATE",
    "ACTION_SKIPPED_MALFORMED",
    "ACTION_SKIPPED_OPERATOR",
    "ACTION_SKIPPED_FUTURE_SCHEMA",
    "ACTION_WOULD_VIOLATE",
    "ACTION_FAILED_AI_NO_CREDS",
    "ACTION_FAILED_AI_PROVIDER_ERROR",
    "ACTION_FAILED_AI_BAD_OUTPUT",
    "ACTION_FAILED_AI_COUNT_MISMATCH",
    "AiTitleResolutionError",
    "AiNoCredentialsError",
    "AiProviderError",
    "AiBadOutputError",
    "AiCountMismatchError",
    "MigrationResult",
    "migrate_one_set",
    "migrate_all",
    "discover_session_sets",
    "main",
]
