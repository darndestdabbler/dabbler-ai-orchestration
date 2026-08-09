"""Session-start CLI — the "state first, work second" boundary writer.

Set 022 made session-set lifecycle transitions visible and clean. The
orchestrator runs this CLI **before any other work in a session** so
``session-state.json`` and ``session-events.jsonl`` declare "session N
is in flight" on disk the moment work begins. The Session Set
Explorer tree view bucket-flips the set from Not Started (or "between
sessions") to In Progress within the watcher's debounce.

Companion writer to :mod:`ai_router.close_session`. Both share
:func:`session_state.compute_effective_completed_sessions` as the
single source of truth for "how many sessions are closed."

CLI shape::

    python -m ai_router.start_session --session-set-dir <path> \\
        --engine claude [--session-number N] [--model X] \\
        [--effort medium] [--provider anthropic] \\
        [--total-sessions N]

Behavior:

- ``--session-number`` is optional. When absent, the CLI infers the
  next session via ``compute_effective_completed_sessions(dir)``:
  ``max(closed) + 1``, or ``1`` for a not-started set.
- **``--total-sessions`` is optional (Set 046 Session 2).** When
  absent, the writer resolves the session plan size from the
  existing ``session-state.json``'s ``totalSessions`` field (if any),
  falling back to the spec.md Session Set Configuration block's
  ``totalSessions`` field, and finally to ``null``. A ``null``
  result writes a **plan-less in-progress** snapshot — no
  ``sessions[]`` ledger, ``totalSessions: null``,
  ``currentSession`` set, ``completedSessions: []`` — so the
  Session Set Explorer renders ``0/?`` per Set 046's deliverable
  (a). Pass ``--total-sessions N`` to lock the count explicitly,
  or declare ``totalSessions: N`` in spec.md's configuration block.
- **Idempotent.** Re-running for the same session N when N is already
  the in-flight session (``currentSession == N`` and N not in
  ``completedSessions[]``) is a no-op. The underlying
  :func:`session_state.register_session_start` dedupes the
  ``work_started`` event in the ledger as well, so re-running across
  a re-entered orchestrator (e.g., after a context reset) is safe.
- **Refuses to skip.** Asking for session N+1 while session N is still
  open (``currentSession == N`` and N not in ``completedSessions[]``,
  with N != N+1) exits non-zero. The operator must close N first.
  This is the boundary the v0.13.11 defensive guards are *recovering
  from*; making the writer refuse the bad input is the prevention
  layer.

- **Per-set lifecycle lock.** Both ``start_session`` and
  ``close_session`` acquire the same ``<set-dir>/.lifecycle.lock``
  for the duration of their read/check/write window so a hybrid
  migration (one orchestrator opening a new session while another
  is in mid-close-out) never interleaves writes. ``start_session``
  polls for up to 30s before giving up; close_session fails
  immediately on contention (its existing contract).

- **Set 049: coordination layer retired.** The H3 + H4 hard
  coordination check shipped in Set 033 + refined in Set 036
  (``engine + provider + chatSessionId`` composite holder identity,
  ``checkedOutAt`` / ``lastActivityAt`` timestamps, takeover modal /
  TTY prompt, force-override audit log on handoff) has been removed
  from this CLI. The ``--chat-session-id`` flag is still accepted
  (T2 accept-with-warning) for backward compatibility with consumer-
  repo invokers that may pass it, but the value is ignored and the
  writer no longer treats the prior orchestrator block as a check-out
  record. See ``docs/session-sets/049-orchestrator-coordination-removal/spec.md``.

Exit codes:

- ``0`` — success (or idempotent no-op).
- ``2`` — usage error (bad args, missing session set directory).
- ``3`` — boundary violation (request to advance while a session is
  still open, re-open of a closed session, or skip-ahead).
- ``5`` — lock contention: the per-set lifecycle lock is held by a
  live peer and could not be acquired within the configured timeout
  (default 30s).

The CLI never makes routed LLM calls — it only writes state and emits
events. Safe to invoke under any budget / cost regime.
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

try:
    from progress import (  # type: ignore[import-not-found]
        SessionStateInvariantError,
        read_progress,
    )
    from session_state import (  # type: ignore[import-not-found]
        compute_effective_completed_sessions,
        read_session_state,
        register_session_start,
    )
    from close_lock import (  # type: ignore[import-not-found]
        DEFAULT_ACQUIRE_TIMEOUT_SECONDS,
        LockContention,
        acquire_lock_with_timeout,
        release_lock,
    )
    from resolve_set import (  # type: ignore[import-not-found]
        SetResolutionError,
        resolve_session_set_dir,
    )
    from check_migrations import summarize_drift  # type: ignore[import-not-found]
    from guidance_report import summarize_overhead  # type: ignore[import-not-found]
except ImportError:
    from .progress import (  # type: ignore[no-redef]
        SessionStateInvariantError,
        read_progress,
    )
    from .session_state import (  # type: ignore[no-redef]
        compute_effective_completed_sessions,
        read_session_state,
        register_session_start,
    )
    from .close_lock import (  # type: ignore[no-redef]
        DEFAULT_ACQUIRE_TIMEOUT_SECONDS,
        LockContention,
        acquire_lock_with_timeout,
        release_lock,
    )
    from .resolve_set import (  # type: ignore[no-redef]
        SetResolutionError,
        resolve_session_set_dir,
    )
    from .check_migrations import summarize_drift  # type: ignore[no-redef]
    from .guidance_report import summarize_overhead  # type: ignore[no-redef]

# Set 048 modules must never be bare-imported in production code (the
# test_production_imports guard): the bare form only resolves under the
# test conftest's sys.path shim and raises ModuleNotFoundError under
# pip-install. Relative-first with a package-absolute fallback, matching
# the other Set 048 module consumers.
try:
    from .runtime_mode import is_no_router_mode  # type: ignore[import-not-found]
except ImportError:
    from ai_router.runtime_mode import is_no_router_mode  # type: ignore[no-redef]


EXIT_OK = 0
EXIT_USAGE = 2
EXIT_BOUNDARY = 3
EXIT_LOCK_CONTENTION = 5

# Set 049 (T5): the orchestrator-writer audit log survives the
# coordination rip-out as a generic "start_session ran" record. The
# Set 033 / Set 036 force-override audit-trail semantic is gone (no
# refusal => no force-override), but the file + appender remain so a
# post-hoc forensic walk can answer "which orchestrator most recently
# claimed this set?" without consulting the snapshot. The file is
# best-effort observability — a write failure never blocks the
# session-start write. Revisit in a future stability set if it proves
# dead.
ORCHESTRATOR_WRITER_LOG = os.path.expanduser(
    "~/.dabbler/orchestrator-writer.log"
)


def _run_copilot_preflight_or_block(
    args, *, run_live_probe: bool
) -> Optional[int]:
    """Set 086 S1: gate session start on a mis-authed Copilot-CLI seat.

    Only the copilot-cli seat (a multi-provider engine) runs this — the
    direct-API path has no CLI to preflight, so single-vendor engines return
    immediately with no cost or new failure mode. Under ``--no-router``
    (zero metered calls) it also no-ops: there is no routed dispatch to
    protect, so spending a billed live probe would be wrong.

    Returns an exit code to STOP session start (the preflight failed and
    printed its remediation), or ``None`` to proceed. The preflight is the
    prevention layer for the root cause of Set 086: an unauthenticated seat
    that starts a session it can never honestly verify, then confabulates a
    result. Fail-closed by construction — an unexpected internal error blocks
    rather than waves the seat through.
    """
    engine = getattr(args, "engine", None)
    try:
        try:
            from .orchestrator_identity import (  # type: ignore[import-not-found]
                is_multi_provider_engine,
            )
        except ImportError:
            from ai_router.orchestrator_identity import (  # type: ignore[no-redef]
                is_multi_provider_engine,
            )
        multi = is_multi_provider_engine(engine)
    except Exception:
        # Fail CLOSED where it matters (Round-1 finding): if the identity
        # helper cannot be resolved, do NOT wave a possibly-copilot seat
        # through — fall back to the known multi-provider seat labels so a
        # copilot seat still gets preflighted. A direct-API engine is still
        # correctly single-vendor, so the common path is unaffected.
        multi = str(engine or "").strip().lower() in {"github-copilot", "copilot"}

    if not multi:
        return None
    if is_no_router_mode():
        return None

    try:
        try:
            from .copilot_preflight import run_preflight  # type: ignore[import-not-found]
        except ImportError:
            from ai_router.copilot_preflight import run_preflight  # type: ignore[no-redef]
        result = run_preflight(
            # Pass the seat's real model through; run_preflight falls back to
            # its own default if it is somehow absent (Round-6 finding: never
            # coerce to "" and probe an empty --model). In the normal flow a
            # copilot seat always has a validated --model — a multi-provider
            # engine without one is already refused by
            # _refuse_unresolvable_identity above, before this runs.
            model=getattr(args, "model", None),
            run_live_probe=run_live_probe,
        )
    except Exception as exc:  # noqa: BLE001 - fail closed on a preflight bug
        print(
            "start_session: refused -- Copilot-seat auth-preflight could not "
            f"run ({type(exc).__name__}: {exc}). Fail-closed: an "
            "unauthenticated seat is the Set 086 root cause. Fix the "
            "preflight or the seat setup (docs/copilot-seat-setup-checklist.md) "
            "before starting a session.",
            file=sys.stderr,
        )
        return EXIT_BOUNDARY

    if result.ok:
        return None
    print(result.message, file=sys.stderr)
    return EXIT_BOUNDARY


def _build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="start_session",
        description=(
            "Boundary write that marks session N of a session set as "
            "in flight. Run before any other work in the session. "
            "Companion to close_session: every session's first call "
            "is start_session; every session's last call is "
            "close_session."
        ),
    )
    p.add_argument(
        "--session-set-dir",
        required=True,
        help=(
            "Path to the session-set directory "
            "(e.g. docs/session-sets/022-active-lifecycle-management)."
        ),
    )
    p.add_argument(
        "--session-number",
        type=int,
        default=None,
        help=(
            "Session number to mark in flight. Inferred from "
            "completedSessions[] when omitted: max(closed)+1, or 1 "
            "for a not-started set."
        ),
    )
    p.add_argument(
        "--engine",
        required=True,
        help=(
            "Orchestrator engine name (e.g. claude, gpt-5-4, "
            "gemini-pro)."
        ),
    )
    p.add_argument(
        "--model",
        default=None,
        help=(
            "Orchestrator model id (e.g. claude-opus-4-7). Set 049: "
            "optional for single-vendor engines. Callers that cannot "
            "authoritatively declare a model omit the flag and the "
            "writer drops the key from the orchestrator block per the "
            "P2 omit-null contract. Set 084 (F1): REQUIRED for "
            "multi-provider engines (github-copilot / copilot) and "
            "validated against the model registry — a Copilot seat's "
            "identity is the underlying model, never the seat label."
        ),
    )
    p.add_argument(
        "--effort",
        default=None,
        help=(
            "Orchestrator effort level: low, medium, high, fast, or "
            "normal. Set 049: now optional with no ``unknown`` "
            "fallback. Callers that cannot authoritatively declare "
            "an effort omit the flag and the writer drops the key."
        ),
    )
    p.add_argument(
        "--provider",
        default=None,
        help=(
            "Orchestrator provider name (e.g. anthropic, openai, "
            "google). Optional. Set 084 (F1): for identity purposes "
            "this is a seat DESCRIPTOR only — the effective provider "
            "is always derived by registry lookup on --model; the "
            "label is the explicit second choice for single-vendor "
            "engines that recorded no model."
        ),
    )
    p.add_argument(
        "--chat-session-id",
        default=None,
        help=(
            "Set 049 (T2): accepted but ignored. The Set 036 "
            "chatSessionId composite identity is retired along with "
            "the rest of the coordination layer; this flag stays in "
            "the CLI definition so consumer-repo invokers with older "
            "code can keep passing it without erroring. A one-line "
            "deprecation note is written to stderr on each invocation "
            "that supplies the flag."
        ),
    )
    p.add_argument(
        "--total-sessions",
        type=int,
        default=None,
        help=(
            "Total number of sessions in this set (Set 046 Session "
            "2). When omitted, the writer resolves the total from "
            "the existing state file, then spec.md's configuration "
            "block, and writes a plan-less in-progress snapshot "
            "(``totalSessions: null``, no ``sessions[]`` ledger) if "
            "neither yields a value. Plan-less snapshots render as "
            "``0/?`` in the Session Set Explorer per Set 046 "
            "deliverable (a). Pass this flag to lock the count "
            "explicitly without editing spec.md."
        ),
    )
    p.add_argument(
        "--path-aware-critique",
        dest="path_aware_critique",
        default=None,
        choices=["none", "advisory", "required"],
        help=(
            "Set 066 (S1): record the tier-orthogonal pathAwareCritique "
            "policy once at set start. ``required`` arms the Set-066 "
            "close-out gate (a valid multi-provider critique artifact must "
            "exist before a set-terminal close); ``advisory`` warns but "
            "never blocks; ``none`` (the default) is no gate. When omitted, "
            "the writer seeds the choice from spec.md's Session Set "
            "Configuration ``pathAwareCritique`` field if present (recorded "
            "only when no choice exists yet); otherwise nothing is recorded "
            "and the default ``none`` applies implicitly. The durable record "
            "is an activity-log.json entry every later step reads; it is "
            "immutable after the first record."
        ),
    )
    p.add_argument(
        "--contract-gate",
        dest="contract_gate",
        default=None,
        choices=["none", "advisory", "required"],
        help=(
            "Set 070 (S1): record the contractGate policy once at set start, "
            "the same way --path-aware-critique already does. ``required`` arms "
            "the Set-068 contract-test/CDC close-out gate (a valid contract-floor "
            "result must exist before a set-terminal close); ``advisory`` warns "
            "but never blocks; ``none`` (the default) is no gate. When omitted, "
            "the writer seeds the choice from spec.md's Session Set Configuration "
            "``contractGate`` field if present (recorded only when no choice "
            "exists yet); otherwise nothing is recorded and the default ``none`` "
            "applies implicitly. The durable record is an activity-log.json entry "
            "every later step reads; it is immutable after the first record. "
            "Before Set 070 the contractGate seed was NOT captured at set start "
            "(unlike pathAwareCritique), so the Set 069 contractGate close-out "
            "gate silently no-op'd; this flag + the seed capture close that gap."
        ),
    )
    # Set 048 Session 2: --no-router mode flag. Highest precedence
    # source for runtime_mode.resolve_no_router_mode (CLI flag > env
    # var DABBLER_NO_ROUTER > spec.md tier field > default full mode).
    # Under --no-router, the start_session writer behaves identically
    # (the state-file flip and orchestrator block make no routed calls);
    # the flag is plumbed through to the resolver so downstream
    # verification calls in close_session can short-circuit.
    p.add_argument(
        "--no-router",
        action="store_true",
        dest="no_router",
        help=(
            "Suppress routed API calls for this invocation (CI / "
            "hermetic test affordance): no LLM dispatch, no routed "
            "verification. Highest-precedence source, above the "
            "DABBLER_NO_ROUTER env var."
        ),
    )
    return p


def _capture_path_aware_critique(
    session_set_dir: str,
    session_number: int,
    cli_choice: Optional[str],
) -> None:
    """Set 066 (S1): record the pathAwareCritique policy once at set start.

    Best-effort: delegates to
    :func:`path_aware_critique.resolve_and_record_path_aware_critique`
    (CLI choice wins; otherwise the spec.md seed is recorded only when no
    durable record exists yet). A bad explicit ``--path-aware-critique`` is
    already rejected by argparse ``choices``; any other failure here must
    never block the session-start write, so it is swallowed.
    """
    try:
        try:
            from path_aware_critique import (  # type: ignore[import-not-found]
                resolve_and_record_path_aware_critique,
            )
        except ImportError:
            from .path_aware_critique import (  # type: ignore[no-redef]
                resolve_and_record_path_aware_critique,
            )
        resolve_and_record_path_aware_critique(
            session_set_dir,
            cli_choice=cli_choice,
            session_number=session_number,
        )
    except Exception:
        pass


def _capture_contract_gate(
    session_set_dir: str,
    session_number: int,
    cli_choice: Optional[str],
) -> None:
    """Set 070 (S1): record the contractGate policy once at set start.

    Best-effort: delegates to
    :func:`contract_gate.resolve_and_record_contract_gate` (CLI choice wins;
    otherwise the spec.md ``contractGate`` seed is recorded only when no durable
    record exists yet). This closes the Set 069 S6 gap where the contractGate
    seed -- unlike ``pathAwareCritique`` -- was never captured at set start, so
    the contractGate close-out gate silently no-op'd. A bad explicit
    ``--contract-gate`` is already rejected by argparse ``choices``; any other
    failure here must never block the session-start write, so it is swallowed.
    """
    try:
        try:
            from contract_gate import (  # type: ignore[import-not-found]
                resolve_and_record_contract_gate,
            )
        except ImportError:
            from .contract_gate import (  # type: ignore[no-redef]
                resolve_and_record_contract_gate,
            )
        resolve_and_record_contract_gate(
            session_set_dir,
            cli_choice=cli_choice,
            session_number=session_number,
        )
    except Exception:
        pass


def _refuse_unresolvable_identity(args: argparse.Namespace) -> Optional[str]:
    """Set 084 (F1): the start-time identity boundary.

    Returns the refusal message (caller exits non-zero) when:

    - the engine is multi-provider (``github-copilot`` / ``copilot``)
      and ``--model`` was not supplied — the seat label alone is never
      an identity; or
    - the engine is multi-provider and the supplied ``--model`` does
      not resolve in the model registry — an unresolvable model would
      fail closed at every downstream consumer (the close gate,
      verifier exclusion), so it is refused here, where the operator
      can still fix it.

    - ANY engine supplied a ``--model`` that does not resolve in the
      registry (R2 remediation I-084-S1-4: the spec's "validates any
      supplied model against the registry" is engine-independent — a
      typoed model on a single-vendor engine must fail loud at the
      boundary, not silently defer identity to the free-text label).

    Single-vendor engines keep ``--model`` optional (the provider field
    is the explicit second choice when NO model was supplied). When a
    supplied model resolves to a provider that CONTRADICTS the declared
    ``--provider``, a stderr advisory notes that the model wins at use
    time — the label is a seat descriptor, not an identity (never a
    refusal: the label stays useful for humans).
    """
    try:
        try:
            from .orchestrator_identity import (
                is_multi_provider_engine,
                resolve_model_provider,
            )
        except ImportError:
            from ai_router.orchestrator_identity import (  # type: ignore[no-redef]
                is_multi_provider_engine,
                resolve_model_provider,
            )
    except Exception:
        return None  # validation must never add a failure mode of its own

    engine = getattr(args, "engine", None)
    model = getattr(args, "model", None)
    provider = getattr(args, "provider", None)
    multi = is_multi_provider_engine(engine)

    if multi and (not isinstance(model, str) or not model.strip()):
        return (
            f"refused -- engine {engine!r} is a multi-provider seat; its "
            "identity is the underlying model, resolved through the model "
            "registry, never the seat label (Set 084 F1). Re-run with "
            "--model <registry-known model id>, e.g. --model "
            "claude-sonnet-4.6."
        )

    resolved = resolve_model_provider(model) if model else None

    model_supplied = isinstance(model, str) and bool(model.strip())
    if model_supplied and resolved is None:
        # Engine-independent (I-084-S1-4): a supplied model that resolves
        # nowhere must fail loud HERE — persisting it would make every
        # downstream identity consumer either fail closed (multi-provider)
        # or silently defer to the free-text label (single-vendor), and
        # the label is a descriptor, not an identity.
        return (
            f"refused -- --model {model!r} does not resolve in the model "
            "registry (router-config.yaml models: keys/model_ids or the "
            "Copilot CLI model universe), so it cannot serve as an "
            "identity (Set 084 F1). Pass a registry-known --model"
            + (
                ""
                if multi
                else ", or omit --model to record engine+provider only"
            )
            + ". To register a new orchestrator model, add a disabled "
            "entry (is_enabled: false) under models: in "
            "router-config.yaml."
        )

    if (
        resolved is not None
        and isinstance(provider, str)
        and provider.strip()
        and provider.strip().lower() != resolved
    ):
        print(
            f"start_session: NOTE -- --provider {provider!r} is recorded "
            f"as the seat label only; the model {model!r} resolves to "
            f"{resolved!r} and the registry-resolved provider wins at "
            "every identity consumer (Set 084 F1).",
            file=sys.stderr,
        )
    return None


def _log_session_start(
    session_set_dir: str,
    session_number: int,
    engine: str,
    provider: Optional[str],
) -> None:
    """Append a "start_session ran" entry to ``~/.dabbler/orchestrator-writer.log``.

    Best-effort: directory creation and write are wrapped in a broad
    except so a permissions or disk-full failure does not block the
    session-start write. The state file remains the source of truth;
    the writer log is an observability surface.

    Set 049 (T5): this log file used to record force-override audit
    trail entries on coordination handoff. With the H3/H4 coordination
    layer retired, the log gains a simpler "start_session ran"
    semantic: one line per invocation, parseable by ``awk`` / ``rg``
    without further structure, so a post-hoc forensic walk can answer
    "which orchestrator most recently claimed this set?" without
    consulting the snapshot.
    """
    try:
        os.makedirs(os.path.dirname(ORCHESTRATOR_WRITER_LOG), exist_ok=True)
        ts = datetime.now().astimezone().isoformat()
        set_name = os.path.basename(session_set_dir.rstrip("/\\"))
        provider_label = provider or "<unspecified>"
        line = (
            f"{ts} start_session "
            f"session-set={set_name} "
            f"session={session_number} "
            f"orchestrator={engine}+{provider_label}\n"
        )
        with open(ORCHESTRATOR_WRITER_LOG, "a", encoding="utf-8") as f:
            f.write(line)
    except Exception:
        pass


def _infer_next_session(session_set_dir: str) -> int:
    """Return the next session number to start.

    ``max(closed) + 1`` when the set has any closed sessions;
    ``1`` for a not-started set. Reads via
    :func:`compute_effective_completed_sessions` so legacy sets
    without ``completedSessions[]`` are handled correctly (the helper
    falls back to the events ledger).
    """
    closed = compute_effective_completed_sessions(session_set_dir)
    if closed:
        return max(closed) + 1
    return 1


def _warn_chat_session_id_ignored() -> None:
    """T2 deprecation notice: one stderr line per --chat-session-id supply.

    Emitted from :func:`run` whenever the caller passes a non-empty
    ``--chat-session-id``. The line is the canonical contract for
    backward-compatible consumers: argparse accepts the flag, the
    writer ignores the value, and stderr carries a single grep-able
    indicator that a now-vestigial path is being exercised.
    """
    sys.stderr.write(
        "start_session: --chat-session-id is no longer used (Set 049); "
        "ignoring\n"
    )


def run(args: argparse.Namespace) -> int:
    """Execute the start_session boundary write. Returns exit code.

    Wraps :func:`session_state.register_session_start` with:

    1. Session-number inference (when ``--session-number`` is absent).
    2. Idempotency check (skip the write when the requested session is
       already the in-flight session).
    3. Boundary enforcement (refuse to advance past an open session).
    4. Per-set lifecycle lock acquisition (Set 036 Q5) around the
       read/check/write window.

    Set 049 retired the H3 + H4 hard-coordination refusal path that
    previously fired on a chatSessionId / engine+provider mismatch.

    Separated from :func:`main` so tests can call ``run`` with a
    namespace built from :func:`_build_arg_parser` without needing
    to capture stdout/stderr from argparse error exits.
    """
    # Set 050 S4 (Feature 2): --session-set-dir accepts a bare number
    # ("50" / "050") as a handle that resolves to the full slug within
    # the active repo's docs/session-sets. A path value (the pre-Set-050
    # contract) passes through unchanged. Resolution happens before the
    # isdir check so a number that resolves to a real dir proceeds, and
    # an unresolvable number reports the resolver's helpful error
    # (available numbers / --next) rather than a bare "not found".
    try:
        session_set_dir = resolve_session_set_dir(args.session_set_dir)
    except SetResolutionError as exc:
        print(f"start_session: {exc}", file=sys.stderr)
        return EXIT_USAGE
    # Keep args in sync so _run_under_lock (which re-reads args) sees the
    # resolved path.
    args.session_set_dir = session_set_dir
    if not os.path.isdir(session_set_dir):
        print(
            f"start_session: session-set directory not found: "
            f"{session_set_dir}",
            file=sys.stderr,
        )
        return EXIT_USAGE

    # T2 accept-with-warning: emit a one-line stderr deprecation note
    # when the caller supplies --chat-session-id, regardless of
    # whether the value is meaningful. Empty string is intentional too
    # — a consumer-repo invoker that always passes the flag should
    # still see the notice so the deprecation eventually surfaces.
    if getattr(args, "chat_session_id", None) is not None:
        _warn_chat_session_id_ignored()

    # Set 084 (F1) boundary enforcement: a multi-provider engine's
    # identity is the underlying model resolved through the registry,
    # so it cannot start without one. Runs before the lifecycle lock
    # (pure validation, no state read) and covers every writer path —
    # work, typed, and handoff sessions alike (L-069-1).
    identity_refusal = _refuse_unresolvable_identity(args)
    if identity_refusal is not None:
        print(f"start_session: {identity_refusal}", file=sys.stderr)
        return EXIT_USAGE

    # Acquire the per-set lifecycle lock around the entire
    # read/check/write window. The lock serializes against any
    # concurrent close_session on the same set (which now holds the
    # same lock) so a hybrid migration never interleaves writes. The
    # timeout-poll variant gives a small (default 30s) blocking window
    # so a brief race against an in-progress close-out resolves
    # cleanly without an operator-visible failure.
    try:
        lock_handle = acquire_lock_with_timeout(
            session_set_dir,
            timeout_seconds=DEFAULT_ACQUIRE_TIMEOUT_SECONDS,
            worker_id=f"start_session/{os.getpid()}",
        )
    except LockContention as exc:
        print(
            f"start_session: refused -- lifecycle lock contention: "
            f"{exc}",
            file=sys.stderr,
        )
        return EXIT_LOCK_CONTENTION

    try:
        return _run_under_lock(args)
    finally:
        try:
            release_lock(lock_handle)
        except OSError:
            pass


def _refuse_removed_tier(session_set_dir: str) -> Optional[int]:
    """Set 112: refuse a spec that still declares the removed tier.

    Returns ``EXIT_BOUNDARY`` after printing the migration one-liner, or
    ``None`` to proceed. Placed before every write so the refusal is the
    FIRST thing a stranded Lightweight consumer sees.
    """
    try:
        try:
            from .spec_config import (  # type: ignore[import-not-found]
                LightweightTierRemovedError,
                refuse_if_lightweight,
            )
        except ImportError:
            from ai_router.spec_config import (  # type: ignore[no-redef]
                LightweightTierRemovedError,
                refuse_if_lightweight,
            )
    except Exception:  # noqa: BLE001 — a broken install has its own errors
        return None
    try:
        refuse_if_lightweight(session_set_dir)
    except LightweightTierRemovedError as exc:
        print(f"start_session: refused -- {exc}", file=sys.stderr)
        return EXIT_BOUNDARY
    return None


def _run_under_lock(args: argparse.Namespace) -> int:
    """The original boundary + write flow, executed with the per-set
    lifecycle lock already held by the caller.

    Split out so tests that want to assert the lock's external
    behavior can inspect :func:`run` while tests that pre-acquire the
    lock (e.g., to simulate close_session holding it) can drive the
    inner flow directly.
    """
    session_set_dir = args.session_set_dir

    # Set 112: the removed-tier boundary refusal, BEFORE any read of the
    # ledger and before every write. A stranded Lightweight consumer meets
    # the migration one-liner on the first command they run, not an
    # unrelated close-out error three steps later.
    refusal = _refuse_removed_tier(session_set_dir)
    if refusal is not None:
        return refusal

    state = read_session_state(session_set_dir) or {}
    closed = compute_effective_completed_sessions(session_set_dir)
    closed_set = set(closed)

    # Set 030 Session 3: route progress reads through the v3 helper.
    # ``read_progress`` branches v2/v3 internally; on a brand-new set
    # (empty state) or a v2 file whose synthesizer trips an invariant,
    # we fall through with view=None and skip the in-flight check.
    # ``compute_effective_completed_sessions`` remains the source of
    # truth for the closed set (v2-compat carve-out per D13) so this
    # migration does not touch the boundary-enforcement math.
    spec_md_path = os.path.join(session_set_dir, "spec.md")
    try:
        view = read_progress(state, spec_md_path) if state else None
    except (SessionStateInvariantError, TypeError, ValueError):
        view = None
    current = view.current_session if view is not None else None
    current_in_flight = current is not None

    requested = args.session_number
    if requested is None:
        if current_in_flight:
            # The previous session never closed — resuming, not
            # starting fresh. Idempotently re-emit the work_started
            # event (register_session_start dedupes) and refresh the
            # snapshot's startedAt window for the still-in-flight
            # session.
            requested = current
        else:
            requested = (max(closed) + 1) if closed else 1

    if not isinstance(requested, int) or requested < 1:
        print(
            f"start_session: --session-number must be a positive int "
            f"(got {requested!r})",
            file=sys.stderr,
        )
        return EXIT_USAGE

    # Boundary enforcement: if a session is in flight and the caller
    # asked for a different (later) session, refuse. The operator
    # needs to close the in-flight session first. The exception is
    # "ask for the same session that's already in flight" — that's
    # idempotent resume, handled by register_session_start's event-
    # ledger dedupe.
    if current_in_flight and requested != current:
        print(
            f"start_session: refused -- session {current} is still "
            f"in flight (currentSession={current}, "
            f"completedSessions={sorted(closed_set)}). Close "
            f"session {current} via close_session before starting "
            f"session {requested}.",
            file=sys.stderr,
        )
        return EXIT_BOUNDARY

    # Boundary enforcement: refuse to "re-open" a session that's
    # already in completedSessions[]. close_session is the writer
    # for the closed-set; re-opening a closed session via
    # start_session would be a snapshot regression the extension
    # would surface as drift.
    if requested in closed_set:
        print(
            f"start_session: refused -- session {requested} is already "
            f"closed (in completedSessions{sorted(closed_set)}). "
            f"start_session does not re-open closed sessions.",
            file=sys.stderr,
        )
        return EXIT_BOUNDARY

    # Boundary enforcement: refuse to skip ahead. When no session is
    # in flight, the only legitimate next session is
    # max(closed_set, default=0) + 1. Asking for, say, session 5 on
    # a fresh set creates a gap that the protocol does not model —
    # the extension's "in flight" predicate and the
    # compute_effective_completed_sessions fallback both assume
    # contiguous closure. The exception is the in-flight idempotent
    # path above (already handled): a re-entry asking for the
    # current in-flight session is fine.
    if not current_in_flight:
        expected_next = (max(closed_set) + 1) if closed_set else 1
        if requested != expected_next:
            print(
                f"start_session: refused -- requested session "
                f"{requested} is not the next sequential session "
                f"(expected {expected_next}; "
                f"completedSessions={sorted(closed_set)}). "
                f"start_session does not skip ahead; close the "
                f"intervening sessions first.",
                file=sys.stderr,
            )
            return EXIT_BOUNDARY

    # Set 049: H3/H4 hard-coordination refusal removed. The writer no
    # longer treats the prior orchestrator block as a check-out
    # record. Per the audit-locked premises (P1 4-field block, P2
    # omit-null, P3 chatSessionId / checkedOutAt / lastActivityAt
    # dropped), every start_session call simply rewrites the
    # orchestrator block to reflect the current caller. Concurrent
    # writes against the same set are serialized via the per-set
    # lifecycle lock acquired in :func:`run`.

    # Set 030 Session 3: derive total via the v3 view when available;
    # ``register_session_start`` tolerates None and falls back to its
    # own resolution chain (caller-supplied -> existing state -> spec).
    #
    # Set 046 Session 2: ``--total-sessions`` on the CLI is the
    # caller-supplied value when present. The v3-view fallback
    # protects the common "re-start an in-flight session" case
    # (totalSessions already populated from a prior write) and is
    # the path that lets the writer's existing-state fallback do
    # the right thing without changing register_session_start's
    # resolution chain.
    cli_total = getattr(args, "total_sessions", None)
    if isinstance(cli_total, int) and cli_total > 0:
        total_sessions = cli_total
    else:
        total_sessions = (
            view.total_sessions if view is not None and view.total_sessions > 0 else None
        )

    # Set 086 S1: auth-preflight for the Copilot-CLI seat, BEFORE any state
    # is written. A mis-authed seat is blocked here rather than allowed to
    # start a session it could never honestly verify. The live probe runs on
    # EVERY start, including an idempotent re-entry (Round-2 finding): repo
    # state ("a session is in flight") is not proof the seat is STILL
    # authenticated — a login that lapsed, changed host, or lost its license
    # between the fresh start and a re-entry must be caught, and one small
    # premium request is cheap next to a seat that confabulates verification.
    # No-op for the direct-API path and under --no-router (see the helper).
    preflight_block = _run_copilot_preflight_or_block(args, run_live_probe=True)
    if preflight_block is not None:
        return preflight_block

    register_session_start(
        session_set=session_set_dir,
        session_number=requested,
        total_sessions=total_sessions,
        orchestrator_engine=args.engine,
        orchestrator_model=args.model,
        orchestrator_effort=args.effort,
        orchestrator_provider=args.provider,
    )

    # Set 066 (S1): capture the pathAwareCritique policy
    # once at set start (CLI flag wins; spec.md seed recorded only when no
    # record exists yet). Best-effort — never blocks the boundary write.
    _capture_path_aware_critique(
        session_set_dir, requested, getattr(args, "path_aware_critique", None)
    )

    # Set 070 (S1): capture the contractGate policy once at set start (CLI flag
    # wins; spec.md seed recorded only when no record exists yet). Closes the
    # Set 069 S6 gap where the contractGate seed was never captured here, so the
    # contractGate close-out gate silently no-op'd. Best-effort -- never blocks
    # the boundary write.
    _capture_contract_gate(
        session_set_dir, requested, getattr(args, "contract_gate", None)
    )

    # Set 049 (T5): best-effort observability log so a post-hoc
    # forensic walk can identify the most recent claimant without
    # the snapshot.
    _log_session_start(
        session_set_dir=session_set_dir,
        session_number=requested,
        engine=args.engine,
        provider=args.provider,
    )

    # Set 083 Session 3: Step-6 affordance. Verification is
    # not implicit and not skippable — the Set 068 routed-gate SKIP path
    # is retired (operator decision after the 2026-07-06 UAT incident);
    # the orchestrator must run the verify_session CLI before
    # close_session on every session. This is advisory-only,
    # stderr-only, and fail-open like the drift advisory below. It stays
    # quiet under --no-router, where no routed call can be made anyway.
    try:
        if not is_no_router_mode():
            # Venv-qualified on purpose: a bare `python` often resolves
            # to a system interpreter without ai_router (or with a stale
            # PyPI version) — the exact skew behind the 2026-07-06 UAT
            # failure. Matches gate_checks._verify_session_command.
            interp = (
                ".venv/Scripts/python.exe"
                if os.name == "nt"
                else ".venv/bin/python"
            )
            print(
                "[dabbler] Verification is mandatory on Full tier (no "
                f"skip): run `{interp} -m ai_router.verify_session "
                "--session-set-dir <this-set>` before close_session.",
                file=sys.stderr,
            )
    except Exception:
        pass

    # Set 053: schema-drift advisory riding the session lifecycle. Because
    # every orchestrator (Claude, Copilot, Codex, human) runs start_session
    # at every boundary on every host, this reaches everyone without an
    # editor hook, CI job, or git hook. Scan the sibling sets under this
    # set's parent dir. Non-blocking + fail-open (summarize_drift swallows
    # its own errors and returns None); printed to stderr so it never
    # pollutes machine-readable stdout. A drift warning must NEVER change
    # start_session's exit status.
    try:
        drift_line = summarize_drift(os.path.dirname(os.path.abspath(session_set_dir)))
        if drift_line:
            print(drift_line, file=sys.stderr)
        # Set 064 D5 backstop: soft over-ceiling advisory for the
        # guidance files. Same non-blocking, fail-open, stderr-only
        # posture as the drift advisory; never changes exit status.
        overhead_line = summarize_overhead()
        if overhead_line:
            print(overhead_line, file=sys.stderr)
    except Exception:
        pass

    return EXIT_OK


def main(argv: Optional[list[str]] = None) -> int:
    parser = _build_arg_parser()
    args = parser.parse_args(argv)
    # Set 048 Session 2: resolve --no-router mode at entry-point start
    # so downstream code (verification calls in close_session, lazy
    # imports in route/verify) can read the cached resolution. Side-
    # effect: emits a log.info line noting the source that won.
    #
    # Set 048 S5 UAT fix: relative import resolves under pip-install
    # mode. The original bare `from runtime_mode import …` worked under
    # the test sys.path shim but silently no-op'd in production because
    # the try/except swallowed the ModuleNotFoundError — `--no-router`
    # was a no-op for every pip-installed consumer.
    try:
        from .runtime_mode import resolve_no_router_mode

        resolve_no_router_mode(
            cli_flag=bool(getattr(args, "no_router", False)),
            session_set_dir=Path(args.session_set_dir)
            if getattr(args, "session_set_dir", None)
            else None,
        )
    except Exception:  # noqa: BLE001
        # Runtime-mode resolution must never block start_session; full-tier
        # default is the safe fallback if anything goes wrong here.
        pass
    return run(args)


if __name__ == "__main__":
    sys.exit(main())
