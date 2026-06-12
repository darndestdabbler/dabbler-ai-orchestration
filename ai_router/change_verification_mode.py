"""CLI for the sanctioned Mode A -> Mode B transition (Set 062 D4).

``python -m ai_router.change_verification_mode <session-set-dir-or-slug>``
appends a superseding ``verification_mode_change`` record to the set's
``activity-log.json`` through the blessed writer
(:func:`ai_router.dedicated_verification.change_verification_mode`),
gated fail-loud: Lightweight tier; effective recorded mode
``out-of-band-or-none``; no typed sessions in the ledger; nothing in
flight; target ``dedicated-sessions`` only (A->B — B->A is refused).

The mode-resolution read path honors the latest record, so the Set 057
Q6 close-out gate, the seven-state derivation, and the cross-provider
validator all follow the transition. ``start_session --type …`` never
reads the mode (Set 062 S3 audit F2), so typed sessions work immediately
after the transition with no further change.

This CLI is the engine-agnostic entry point for Copilot / Codex / Gemini
flows that cannot import the Python helper, and the spawn target for the
extension's ``Set Up Dedicated Verification…`` action on completed
Mode-A rows.

Exit codes mirror ``start_session``: 0 = recorded, 2 = usage error,
3 = gate refusal (boundary violation). Output is ASCII-only per the
cp1252 console convention; ``--json`` emits one machine-readable object
on stdout for programmatic consumers.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Optional

try:
    from dedicated_verification import (  # type: ignore[import-not-found]
        VERIFICATION_MODES,
        change_verification_mode,
    )
except ImportError:  # pragma: no cover - import shim
    from .dedicated_verification import (  # type: ignore[no-redef]
        VERIFICATION_MODES,
        change_verification_mode,
    )

EXIT_OK = 0
EXIT_USAGE = 2
EXIT_BOUNDARY = 3

# The conventional session-sets root used to resolve a bare slug passed
# from a repo root (mirrors the docs' `<slug>` invocation shorthand).
_SESSION_SETS_REL = os.path.join("docs", "session-sets")


def resolve_session_set_dir(arg: str) -> Optional[str]:
    """Resolve the positional to a session-set directory path.

    Accepts either a path to the set directory (relative or absolute) or
    a bare slug resolved against ``docs/session-sets/<slug>`` under the
    current working directory. Returns ``None`` when neither resolves to
    an existing directory — the gate-level "is this a session set" check
    (spec.md presence, tier) stays in the writer.
    """
    if os.path.isdir(arg):
        return arg
    candidate = os.path.join(_SESSION_SETS_REL, arg)
    if os.path.isdir(candidate):
        return candidate
    return None


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="python -m ai_router.change_verification_mode",
        description=(
            "Record the sanctioned out-of-band-or-none -> dedicated-sessions "
            "verificationMode transition for a Lightweight session set "
            "(Set 062 D4 blessed writer)."
        ),
    )
    p.add_argument(
        "session_set",
        help=(
            "Path to the session-set directory, or a bare slug resolved "
            "against docs/session-sets/ under the current directory."
        ),
    )
    # Both modes are accepted at the argparse layer so a B->A attempt
    # reaches the writer and gets the canonical gate refusal (exit 3 with
    # the locked-rationale message) instead of an opaque usage error.
    p.add_argument(
        "--to",
        dest="target_mode",
        default="dedicated-sessions",
        choices=list(VERIFICATION_MODES),
        help=(
            "Target mode. Only dedicated-sessions is sanctioned (A->B); "
            "out-of-band-or-none is refused by the writer (B->A is never "
            "recorded). Default: dedicated-sessions."
        ),
    )
    p.add_argument(
        "--json",
        action="store_true",
        dest="json_output",
        help=(
            "Emit one machine-readable JSON object on stdout "
            "({ok, code, reason, record}) instead of prose."
        ),
    )
    return p


def main(argv: Optional[list] = None) -> int:
    args = build_parser().parse_args(argv)

    session_set_dir = resolve_session_set_dir(args.session_set)
    if session_set_dir is None:
        print(
            f"change_verification_mode: {args.session_set!r} is neither a "
            f"directory nor a slug under {_SESSION_SETS_REL}{os.sep}.",
            file=sys.stderr,
        )
        return EXIT_USAGE

    result = change_verification_mode(
        session_set_dir, target_mode=args.target_mode
    )

    if args.json_output:
        payload = {
            "ok": result.ok,
            "code": result.code,
            "reason": result.reason,
            "record": result.record,
        }
        print(json.dumps(payload, indent=2))
    elif result.ok:
        print(f"[dabbler] {result.reason}")
        print(
            "[dabbler] Align spec.md's verificationMode seed to "
            "dedicated-sessions so the Session Set Explorer (which reads "
            "the spec) matches the durable record."
        )
        print(
            "[dabbler] Next: run the dedicated verification session on a "
            "DIFFERENT engine: python -m ai_router.start_session "
            f"--session-set-dir {session_set_dir} --type verification "
            "--engine <other-engine> --provider <other-provider>"
        )
    else:
        print(
            f"change_verification_mode: refused ({result.code}) -- "
            f"{result.reason}",
            file=sys.stderr,
        )

    return EXIT_OK if result.ok else EXIT_BOUNDARY


if __name__ == "__main__":  # pragma: no cover - CLI shim
    raise SystemExit(main())
