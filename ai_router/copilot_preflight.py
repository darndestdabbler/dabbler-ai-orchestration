"""Set 086 (Session 1): Copilot-CLI auth-preflight.

Root cause this module prevents: a staff seat ran Full-tier sessions through
an **unauthenticated** Copilot CLI. Every verification dispatch failed at the
auth layer, and the orchestrator -- handed a required step it could not
mechanically perform -- confabulated a passing result (a made-up
``verificationVerdict``, hand-authored router-look-alike artifacts, a false
``verification_method: "api"``). The governing principle: *never hand an agent
a required step it cannot mechanically perform and then ask it to report the
result -- it will confabulate one.* This preflight makes a mis-authed seat
fail at session **start**, loudly, instead of at verification time, silently.

Three staged checks, cheapest-first, each classified through the transport's
existing ``error_class`` taxonomy (:mod:`ai_router.cli_transport`):

1. ``binary``     -- the ``copilot`` executable resolves on PATH.
2. ``credential`` -- a persisted credential directory (``~/.copilot``) exists.
   Its absence means ``copilot login`` was never run on this seat, so the
   billed live probe is skipped -- no point spending a premium request to
   confirm a certainty.
3. ``live-probe`` -- a minimal non-interactive dispatch actually
   authenticates. An ``auth-class`` result (or any non-ok class) blocks; only
   a clean OK passes.

Wired into :mod:`ai_router.start_session` for the copilot-cli seat (a
multi-provider engine): a failed preflight prints the exact remediation
(pointing at ``docs/copilot-seat-setup-checklist.md``) and blocks the session
from starting. The direct-API path (single-vendor engines) never runs this,
so it adds no cost or failure mode there.

The whole module is testable without ever touching the real CLI: ``which``,
the credential-dir path, and the transport ``spawner`` are all injectable, so
the pass/fail branches drive off a fake process exactly like
``test_cli_transport``.
"""

from __future__ import annotations

import argparse
import shutil
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Optional

try:
    from .cli_transport import (  # type: ignore[import-not-found]
        ERROR_CLASS_AUTH,
        ERROR_CLASS_INVALID_MODEL,
        CopilotCliTransport,
        Spawner,
        TransportResult,
        default_spawner,
    )
except ImportError:  # pragma: no cover - packaging fallback
    from ai_router.cli_transport import (  # type: ignore[no-redef]
        ERROR_CLASS_AUTH,
        ERROR_CLASS_INVALID_MODEL,
        CopilotCliTransport,
        Spawner,
        TransportResult,
        default_spawner,
    )

# The canonical staff runbook the remediation always points at.
CHECKLIST_DOC = "docs/copilot-seat-setup-checklist.md"

# Stage identifiers (also the value of PreflightResult.stage).
STAGE_BINARY = "binary"
STAGE_CREDENTIAL = "credential"
STAGE_LIVE_PROBE = "live-probe"

# Non-transport error classes this module adds on top of the transport
# taxonomy for the two pre-probe stages. Distinct string values so an
# operator (or a diagnostics log) can tell "CLI not installed" from
# "installed but never logged in" from a real dispatch auth failure.
ERROR_CLASS_BINARY_MISSING = "binary-missing"
ERROR_CLASS_CREDENTIAL_MISSING = "credential-missing"

# The probe model default matches Step 3 of the setup checklist. When the
# preflight is wired into start_session the seat's own --model is passed, so
# this default only applies to a bare `python -m ai_router.copilot_preflight`.
DEFAULT_PROBE_MODEL = "claude-sonnet-4.6"

# A deliberately trivial prompt: the point is to authenticate and get a clean
# non-interactive completion, not to do work. Kept short so the premium
# request it costs is as small as the CLI allows.
_PROBE_PROMPT = "Reply with the single word: OK"

_DEFAULT_CREDENTIAL_DIR = Path.home() / ".copilot"

# A which()-shaped callable (name -> resolved path or None), injectable so the
# binary stage is testable without depending on the host PATH.
WhichFn = Callable[[str], Optional[str]]


@dataclass(frozen=True)
class PreflightResult:
    """The outcome of a preflight run.

    ``ok`` is the single load-bearing field for callers that only gate on
    pass/fail; ``stage`` / ``error_class`` / ``message`` / ``details`` exist so
    start_session and a diagnostics log can surface *why* a seat was blocked.
    """

    ok: bool
    stage: str
    error_class: Optional[str]
    message: str
    details: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "ok": self.ok,
            "stage": self.stage,
            "error_class": self.error_class,
            "message": self.message,
            "details": self.details,
        }


def _binary_remediation(binary: str) -> str:
    return (
        f"Copilot-seat preflight FAILED at the binary stage: the {binary!r} "
        "CLI does not resolve on PATH. Install it (Step 1 of "
        f"{CHECKLIST_DOC}):\n"
        "    npm install -g @github/copilot\n"
        "then confirm with `copilot --version`. This seat cannot start a "
        "session until the CLI is installed -- a session it could never "
        "honestly verify."
    )


def _credential_remediation(credential_dir: Path) -> str:
    return (
        "Copilot-seat preflight FAILED at the credential stage: no persisted "
        f"credential directory at {str(credential_dir)!r}, so `copilot login` "
        "was never run on this seat. Log in once (Step 2 of "
        f"{CHECKLIST_DOC}):\n"
        "    copilot login --host SUBDOMAIN.ghe.com\n"
        "Use the tenant account that holds your Copilot license. Session "
        "start is blocked until a real credential exists -- an unauthenticated "
        "seat is exactly the failure that made an orchestrator confabulate a "
        "verification result."
    )


def _live_probe_remediation(result: TransportResult) -> str:
    error_class = result.transport_metadata.get("error_class")
    stderr_tail = (result.raw_stderr or "").strip()
    if len(stderr_tail) > 500:
        stderr_tail = stderr_tail[-500:]

    if error_class == ERROR_CLASS_AUTH:
        head = (
            "Copilot-seat preflight FAILED at the live-probe stage with an "
            "AUTH-class error: the CLI is installed and a credential dir "
            "exists, but a real non-interactive completion did not "
            "authenticate. The most common cause is a login against the wrong "
            "host (github.com instead of your tenant), or no Copilot license "
            "on the tenant. Re-run login against the correct host (Step 2 of "
            f"{CHECKLIST_DOC}):\n"
            "    copilot login --host SUBDOMAIN.ghe.com\n"
            "and unset any stray GH_TOKEN / GITHUB_TOKEN that may be shadowing "
            "the persisted login."
        )
    elif error_class == ERROR_CLASS_INVALID_MODEL:
        head = (
            "Copilot-seat preflight FAILED at the live-probe stage: the probe "
            "model is not available on this seat's plan. Run `copilot` "
            "interactively and check `/models` for the exact available ids "
            f"(Troubleshooting in {CHECKLIST_DOC}). This is a model-selection "
            "problem, not necessarily an auth problem -- but the seat still "
            "cannot verify until a valid model resolves."
        )
    else:
        head = (
            "Copilot-seat preflight FAILED at the live-probe stage "
            f"(error_class={error_class!r}): a real non-interactive completion "
            "did not succeed, so this seat cannot be trusted to run a "
            f"verifiable session. See Troubleshooting in {CHECKLIST_DOC}."
        )

    if stderr_tail:
        head += f"\n  CLI stderr (tail): {stderr_tail}"
    if result.transport_metadata.get("reprobed"):
        head += (
            "\n  Diagnostic --version re-probe: "
            + (
                "the CLI itself responded, so the auth failure is credential/"
                "host-specific, not a dead CLI."
                if result.transport_metadata.get("reprobe_cli_alive")
                else "the CLI did not even respond to --version; the whole "
                "CLI/auth stack looks down."
            )
        )
    return head


def run_preflight(
    *,
    model: str = DEFAULT_PROBE_MODEL,
    binary: str = "copilot",
    spawner: Spawner = default_spawner,
    which: Optional[WhichFn] = None,
    credential_dir: Optional[Path] = None,
    run_live_probe: bool = True,
) -> PreflightResult:
    """Run the staged auth-preflight and return a classified result.

    ``run_live_probe=False`` stops after the two free checks (binary +
    credential) without spending a premium request. This is the explicit
    ``--no-live-probe`` operator affordance for a quick offline sanity check;
    ``start_session`` does NOT use it (Round-2 finding: repo state is not
    proof of current seat auth, so every start probes live). A bare CLI run
    always probes.

    ``which`` defaults to :func:`shutil.which` resolved at call time (not at
    import), so a caller monkeypatching ``copilot_preflight.shutil.which``
    (or passing an explicit callable) takes effect.

    A missing/blank ``model`` falls back to :data:`DEFAULT_PROBE_MODEL` (Round-6
    finding): a caller that has no model to hand must never probe against an
    empty ``--model``, which would fail dispatch and mis-block a valid seat.
    """
    if not (isinstance(model, str) and model.strip()):
        model = DEFAULT_PROBE_MODEL
    which = which if which is not None else shutil.which
    resolved = which(binary)
    if not resolved:
        return PreflightResult(
            ok=False,
            stage=STAGE_BINARY,
            error_class=ERROR_CLASS_BINARY_MISSING,
            message=_binary_remediation(binary),
            details={"binary": binary},
        )

    cred_dir = credential_dir if credential_dir is not None else _DEFAULT_CREDENTIAL_DIR
    if not cred_dir.is_dir():
        return PreflightResult(
            ok=False,
            stage=STAGE_CREDENTIAL,
            error_class=ERROR_CLASS_CREDENTIAL_MISSING,
            message=_credential_remediation(cred_dir),
            details={"credential_dir": str(cred_dir), "binary_path": resolved},
        )

    if not run_live_probe:
        return PreflightResult(
            ok=True,
            stage=STAGE_CREDENTIAL,
            error_class=None,
            message=(
                "Copilot-seat preflight passed the binary + credential checks "
                "(live probe skipped on re-entry)."
            ),
            details={"credential_dir": str(cred_dir), "binary_path": resolved},
        )

    transport = CopilotCliTransport(binary=binary, spawner=spawner)
    result = transport.dispatch(
        model_id=model, system_prompt="", user_message=_PROBE_PROMPT
    )
    if result.ok:
        return PreflightResult(
            ok=True,
            stage=STAGE_LIVE_PROBE,
            error_class=None,
            message=(
                "Copilot-seat preflight OK: CLI present, credential present, "
                f"and a live probe authenticated (model={model!r})."
            ),
            details={
                "credential_dir": str(cred_dir),
                "binary_path": resolved,
                "model": model,
                "session_id": result.transport_metadata.get("session_id"),
                "premium_requests": result.transport_metadata.get("premium_requests"),
            },
        )

    return PreflightResult(
        ok=False,
        stage=STAGE_LIVE_PROBE,
        error_class=result.transport_metadata.get("error_class"),
        message=_live_probe_remediation(result),
        details={
            "credential_dir": str(cred_dir),
            "binary_path": resolved,
            "model": model,
            "raw_stderr": result.raw_stderr,
            "argv": result.transport_metadata.get("argv"),
            "exit_code": result.transport_metadata.get("exit_code"),
            "reprobed": result.transport_metadata.get("reprobed"),
            "reprobe_cli_alive": result.transport_metadata.get("reprobe_cli_alive"),
        },
    )


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m ai_router.copilot_preflight",
        description=(
            "Auth-preflight for a Copilot-CLI seat: confirm the CLI is "
            "installed, a credential exists, and a live probe authenticates "
            "before a session is trusted. Exit 0 = OK, non-zero = blocked."
        ),
    )
    parser.add_argument(
        "--model",
        default=DEFAULT_PROBE_MODEL,
        help=(
            "Model id for the live probe (default: %(default)s). Use a model "
            "available on this seat's plan; check `copilot` /models if unsure."
        ),
    )
    parser.add_argument(
        "--binary",
        default="copilot",
        help="Copilot CLI executable name (default: %(default)s).",
    )
    parser.add_argument(
        "--no-live-probe",
        action="store_true",
        help=(
            "Run only the free binary + credential checks; do not spend a "
            "premium request on the live probe."
        ),
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit the machine-readable PreflightResult as JSON on stdout.",
    )
    return parser


def main(argv: Optional[list] = None) -> int:
    parser = build_arg_parser()
    args = parser.parse_args(argv)

    result = run_preflight(
        model=args.model,
        binary=args.binary,
        run_live_probe=not args.no_live_probe,
    )

    if args.json:
        import json

        print(json.dumps(result.to_dict(), indent=2))
    else:
        stream = sys.stdout if result.ok else sys.stderr
        print(result.message, file=stream)

    return 0 if result.ok else 1


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
