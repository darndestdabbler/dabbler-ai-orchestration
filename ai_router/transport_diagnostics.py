"""Set 086 (Session 2): togglable, orchestrator-visible diagnostics for
Copilot-CLI transport failures.

Systemic hole #3 (Set 086 spec): :meth:`CopilotCliTransport.dispatch`
classifies every failure (``error_class``, ``raw_stderr``, ``argv``, the
auth-reprobe result) into a :class:`~ai_router.cli_transport.TransportResult`,
but on the ``route()`` / ``verify()`` path that detail was only ever partially
echoed into a raised error and never persisted -- so a dispatch failure could
be papered over. This module makes a failure (a) legible in a structured JSONL
diagnostics log gated by a config/env toggle, and (b) available as a compact
one-line summary the caller embeds in the operator-visible error it raises.

Design constraints:

- **The transport stays pure.** ``CopilotCliTransport`` performs no config
  reads and no file I/O beyond the subprocess it already spawns; every
  config/IO concern lives here, invoked at the single ``route()``-path choke
  point (:func:`ai_router._copilot_cli_dispatch`) that consumes the result.
- **No behavior change unless the toggle is on.** :func:`emit_diagnostics`
  is a no-op when the log is disabled, and the summary string
  (:func:`diagnostics_summary`) is pure -- no I/O, always safe to embed in an
  error message.
- **The prompt payload is never logged.** ``argv`` carries the full ``-p``
  prompt (the entire system+user text); :func:`redact_argv` replaces that one
  value with a length marker so the diagnostics log records the invocation
  shape (model, flags) without dumping the prompt to disk.
- **Fail-open on logging, never on the call.** A diagnostics-log write that
  fails (unwritable dir, encoding error) must never turn a transport failure
  into a *second*, masking failure -- the write is best-effort and its own
  failure is swallowed after one stderr note.
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Optional, Sequence

# Env overrides. The env var wins over config in both directions: an explicit
# truthy value force-enables even if config says off; an explicit falsy value
# force-disables even if config says on. Absent -> defer to config.
DIAGNOSTICS_ENV_VAR = "DABBLER_COPILOT_DIAGNOSTICS"
DIAGNOSTICS_LOG_ENV_VAR = "DABBLER_COPILOT_DIAGNOSTICS_LOG"

DEFAULT_LOG_PATH = "ai_router/copilot-transport-diagnostics.jsonl"

# Cap on the stderr tail persisted / summarized. A real auth failure's stderr
# is short; the cap guards against a pathological multi-megabyte stream.
_STDERR_TAIL_CAP = 2000
_SUMMARY_STDERR_CAP = 300

_TRUTHY = {"1", "true", "yes", "on"}
_FALSY = {"0", "false", "no", "off", ""}


def _diag_config(config: Optional[dict]) -> dict:
    """The ``transports.copilot-cli.diagnostics`` sub-block, or ``{}``.

    Tolerant of any missing/non-dict level so a partially-populated config
    never raises here (this runs on an already-failing path)."""
    if not isinstance(config, dict):
        return {}
    transports = config.get("transports")
    if not isinstance(transports, dict):
        return {}
    cli = transports.get("copilot-cli")
    if not isinstance(cli, dict):
        return {}
    diag = cli.get("diagnostics")
    return diag if isinstance(diag, dict) else {}


def diagnostics_enabled(
    config: Optional[dict], *, env: Optional[dict] = None
) -> bool:
    """Is the diagnostics log enabled? Env var wins over config both ways."""
    env = env if env is not None else os.environ
    raw = env.get(DIAGNOSTICS_ENV_VAR)
    if raw is not None:
        lowered = raw.strip().lower()
        if lowered in _TRUTHY:
            return True
        if lowered in _FALSY:
            return False
        # An unrecognized value is treated as "not a directive" -> config.
    return bool(_diag_config(config).get("enabled", False))


def resolve_log_path(
    config: Optional[dict], *, env: Optional[dict] = None
) -> Path:
    """The diagnostics log path: env override, else config, else the default."""
    env = env if env is not None else os.environ
    raw = env.get(DIAGNOSTICS_LOG_ENV_VAR)
    if raw and raw.strip():
        return Path(raw.strip())
    configured = _diag_config(config).get("log_path")
    if isinstance(configured, str) and configured.strip():
        return Path(configured.strip())
    return Path(DEFAULT_LOG_PATH)


def redact_argv(argv: Optional[Sequence[str]]) -> list:
    """Return a copy of ``argv`` with the ``-p`` prompt value replaced by a
    length marker. The invocation shape (binary, ``--model X``, flags) stays
    visible; the prompt payload never reaches the log."""
    if not argv:
        return []
    out: list = []
    skip_next = False
    for i, arg in enumerate(argv):
        if skip_next:
            length = len(arg) if isinstance(arg, str) else 0
            out.append(f"<prompt: {length} chars>")
            skip_next = False
            continue
        out.append(arg)
        if arg == "-p":
            skip_next = True
    return out


_PROMPT_REDACTION_MARKER = "<prompt redacted>"


def _prompt_from_argv(argv: Optional[Sequence[str]]) -> Optional[str]:
    """The `-p` prompt value in ``argv`` (the whole system+user text), or None."""
    if not argv:
        return None
    for i, arg in enumerate(argv):
        if arg == "-p" and i + 1 < len(argv):
            nxt = argv[i + 1]
            return nxt if isinstance(nxt, str) and nxt else None
    return None


def _scrub_prompt(text: str, prompt: Optional[str]) -> str:
    """Remove the exact prompt payload from ``text``.

    Round-2 verification finding: redacting the prompt in ``argv`` is not enough
    — the CLI can echo the prompt back into stderr, which would defeat the
    "prompt payload never reaches the log" guarantee. Any verbatim occurrence of
    the prompt in a diagnostics-bound string is replaced with a marker before it
    is persisted or embedded in a raised error."""
    if not text or not prompt:
        return text
    return text.replace(prompt, _PROMPT_REDACTION_MARKER)


def _coerce_str(value: object) -> str:
    """Best-effort string coercion that never raises. A non-string stderr
    (bytes, None, anything) must not blow up the diagnostics path (Round-3
    finding)."""
    if isinstance(value, str):
        return value
    if value is None:
        return ""
    try:
        return str(value)
    except Exception:  # noqa: BLE001 - diagnostics must never raise
        return ""


def _coerce_metadata(result: object) -> dict:
    """The result's ``transport_metadata`` as a dict, or ``{}`` for ANY
    non-dict (a truthy non-mapping like ``5`` would otherwise pass the old
    ``... or {}`` guard and then raise on ``.get``). Round-3 finding: the
    build/summary helpers are called directly from the raise sites, so a
    malformed result must degrade to an empty record, never mask the real
    transport failure."""
    md = getattr(result, "transport_metadata", None)
    return md if isinstance(md, dict) else {}


def _stderr_tail(
    raw_stderr: object, cap: int, *, prompt: Optional[str] = None
) -> str:
    text = _scrub_prompt(_coerce_str(raw_stderr).strip(), prompt)
    if len(text) > cap:
        return text[-cap:]
    return text


def build_record(
    result,
    *,
    context: Optional[dict] = None,
    now: Optional[Callable[[], datetime]] = None,
) -> dict:
    """Build the structured diagnostics record for one transport result.

    ``result`` is a :class:`~ai_router.cli_transport.TransportResult`; only its
    public reads are used, so a duck-typed stand-in works in tests."""
    now = now if now is not None else (lambda: datetime.now(timezone.utc))
    md = _coerce_metadata(result)
    prompt = _prompt_from_argv(md.get("argv"))
    return {
        "ts": now().isoformat(),
        "context": context or {},
        "ok": bool(getattr(result, "ok", False)),
        "error_class": md.get("error_class"),
        "exit_code": md.get("exit_code"),
        "retryable": md.get("retryable"),
        "reprobed": md.get("reprobed"),
        "reprobe_cli_version": md.get("reprobe_cli_version"),
        "reprobe_cli_alive": md.get("reprobe_cli_alive"),
        "partial_output_discarded": bool(
            getattr(result, "partial_output_discarded", False)
        ),
        "utf8_replacement_seen": md.get("utf8_replacement_seen"),
        "argv": redact_argv(md.get("argv")),
        # stderr is scrubbed of the exact prompt payload too (Round-2 finding):
        # argv redaction alone leaves a leak if the CLI echoes the prompt.
        "raw_stderr": _stderr_tail(
            getattr(result, "raw_stderr", ""), _STDERR_TAIL_CAP, prompt=prompt
        ),
    }


def diagnostics_summary(result, *, context: Optional[dict] = None) -> str:
    """A compact, single-line, side-effect-free summary a caller embeds in the
    operator-visible error it raises, so a dispatch failure is never invisible
    regardless of whether the diagnostics log is enabled."""
    md = _coerce_metadata(result)
    reprobed = bool(md.get("reprobed"))
    parts = [
        f"error_class={md.get('error_class')!r}",
        f"exit_code={md.get('exit_code')!r}",
        f"retryable={md.get('retryable')!r}",
        # Round-2 finding: always report reprobe STATUS, not only when it ran —
        # silence read as "not applicable" hid whether the auth-reprobe fired.
        f"reprobed={reprobed!r}",
    ]
    if reprobed:
        parts.append(f"reprobe_cli_alive={md.get('reprobe_cli_alive')!r}")
    parts.append(f"argv={redact_argv(md.get('argv'))!r}")
    tail = _stderr_tail(
        getattr(result, "raw_stderr", ""), _SUMMARY_STDERR_CAP,
        prompt=_prompt_from_argv(md.get("argv")),
    )
    if tail:
        parts.append(f"stderr_tail={tail!r}")
    prefix = ""
    if context:
        role = context.get("role")
        model = context.get("model_id")
        bits = [b for b in (role, model) if b]
        if bits:
            prefix = "[" + " ".join(str(b) for b in bits) + "] "
    return prefix + " ".join(parts)


def emit_diagnostics(
    result,
    *,
    config: Optional[dict],
    context: Optional[dict] = None,
    env: Optional[dict] = None,
    now: Optional[Callable[[], datetime]] = None,
    log_writer: Optional[Callable[[Path, str], None]] = None,
) -> Optional[dict]:
    """Append one diagnostics record to the gated JSONL log.

    Returns the record when the log is enabled and the write was attempted
    (so a caller/test can assert on it), or ``None`` when the toggle is off.
    The write is best-effort: an I/O failure is swallowed after a single
    stderr note so a diagnostics problem never masks the real transport
    failure. ``log_writer`` is injectable for tests so the real filesystem is
    never touched there."""
    if not diagnostics_enabled(config, env=env):
        return None
    # Build + serialize defensively FIRST. A diagnostics problem must never
    # mask the real transport failure, so a failure here (a duck-typed result
    # whose fields don't serialize, a non-JSON-able value that slipped into the
    # record) is swallowed with a stderr note and returns None rather than
    # escaping. (Round-1 verification finding: the earlier version only caught
    # OSError from the writer, so a build/serialize failure — or a non-OSError
    # writer failure — could still escape and replace the transport failure.)
    try:
        record = build_record(result, context=context, now=now)
        line = json.dumps(record, ensure_ascii=False)
    except Exception as exc:  # noqa: BLE001 - never mask the transport failure
        print(
            f"[dabbler] WARNING: could not build Copilot transport diagnostics "
            f"record: {exc}",
            file=sys.stderr,
        )
        return None
    # The write is best-effort: ANY failure (path resolution, an OSError, or a
    # fake writer raising something else) is swallowed after a single stderr
    # note. The record is still returned so a caller can surface it.
    try:
        path = resolve_log_path(config, env=env)
        writer = log_writer if log_writer is not None else _append_line
        writer(path, line)
    except Exception as exc:  # noqa: BLE001 - best-effort; broadened beyond OSError
        print(
            f"[dabbler] WARNING: could not write Copilot transport diagnostics: "
            f"{exc}",
            file=sys.stderr,
        )
    return record


def _append_line(path: Path, line: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8") as f:
        f.write(line + "\n")
