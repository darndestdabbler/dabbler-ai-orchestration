"""JSON CLI shim around the Python e2e fixture helpers.

The TypeScript tree-provider harness (Session 3) needs to drive the same
fixture operations from Node — spawning a fresh tmpdir-scoped git repo,
running real ``start_session`` / ``close_session`` CLIs, building sibling
worktrees, etc. Re-implementing all of that in TypeScript would duplicate
~770 LOC of fixtures.py and risk drift between the Python and TS sides.

Instead this module exposes the fixture API as a JSON-over-stdout CLI:

    python -m ai_router.tests.e2e.harness_cli make-set \\
        --tmp-path <dir> --slug <name> --total-sessions <N> ...

Each command emits a single JSON object to stdout. Errors are emitted as
``{"error": "<message>"}`` with a non-zero exit. The TS harness parses
the JSON and continues.

The shim deliberately calls fixtures.py functions, not the production
modules directly — keeping a single authoritative implementation of the
fixture shape (git layout, spec template, etc.) under the Python tests.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def _setup_paths() -> None:
    """Put ``ai_router/`` and ``ai_router/tests/e2e/`` on ``sys.path``.

    Mirrors what the parent conftest fixtures do — needed because this
    module is invoked as a top-level script from the TS subprocess, not
    via pytest, so conftest's path mutations don't apply. fixtures.py
    uses bare imports (``from disposition import ...``) that require
    ``ai_router/`` on the path; tests under the e2e dir do
    ``from fixtures import ...`` which requires the e2e dir itself.
    """
    e2e_dir = Path(__file__).resolve().parent
    ai_router_dir = e2e_dir.parents[1]
    repo_root = ai_router_dir.parent
    for p in (str(e2e_dir), str(ai_router_dir), str(repo_root)):
        if p not in sys.path:
            sys.path.insert(0, p)


_setup_paths()


import fixtures  # noqa: E402  pylint:disable=wrong-import-position


def _emit(payload: dict) -> None:
    """Print *payload* as a single JSON object to stdout and flush."""
    sys.stdout.write(json.dumps(payload))
    sys.stdout.write("\n")
    sys.stdout.flush()


def _load_handle(args: argparse.Namespace) -> fixtures.HarnessHandle:
    """Reconstruct a HarnessHandle from the explicit per-call args.

    The TS side stores the handle's data after ``make-set`` and passes
    it back on every subsequent call. Reconstruction is trivial because
    the handle is a pure dataclass with no live resources — every git
    operation is re-derived from ``repo_root`` on demand.
    """
    return fixtures.HarnessHandle(
        repo_root=Path(args.repo_root),
        set_dir=Path(args.set_dir),
        bare_remote=Path(args.bare_remote),
        slug=args.slug,
        total_sessions=args.total_sessions,
        engine=args.engine,
        model=args.model,
        provider=args.provider,
        effort=args.effort,
    )


def _add_handle_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--repo-root", required=True)
    parser.add_argument("--set-dir", required=True)
    parser.add_argument("--bare-remote", required=True)
    parser.add_argument("--slug", required=True)
    parser.add_argument("--total-sessions", type=int, required=True)
    parser.add_argument("--engine", default="claude-code")
    parser.add_argument("--model", default="claude-opus-4-7")
    parser.add_argument("--provider", default="anthropic")
    parser.add_argument("--effort", default="high")


def _handle_to_dict(h: fixtures.HarnessHandle) -> dict:
    return {
        "repo_root": str(h.repo_root),
        "set_dir": str(h.set_dir),
        "bare_remote": str(h.bare_remote),
        "slug": h.slug,
        "total_sessions": h.total_sessions,
        "engine": h.engine,
        "model": h.model,
        "provider": h.provider,
        "effort": h.effort,
    }


def cmd_make_set(args: argparse.Namespace) -> int:
    handle = fixtures.make_session_set(
        Path(args.tmp_path),
        args.slug,
        args.total_sessions,
        engine=args.engine,
        model=args.model,
        provider=args.provider,
        effort=args.effort,
    )
    _emit(_handle_to_dict(handle))
    return 0


def cmd_start(args: argparse.Namespace) -> int:
    handle = _load_handle(args)
    fixtures.drive_start_session(handle, args.session_number, commit=True)
    _emit({"ok": True})
    return 0


def cmd_make_activity(args: argparse.Namespace) -> int:
    handle = _load_handle(args)
    fixtures.make_activity_log_entry(
        handle,
        args.session_number,
        description=args.description,
        commit=True,
    )
    _emit({"ok": True})
    return 0


def cmd_make_disposition(args: argparse.Namespace) -> int:
    handle = _load_handle(args)
    fixtures.make_disposition(
        handle,
        args.session_number,
        is_final=args.is_final,
        status=args.status,
        commit=True,
    )
    _emit({"ok": True})
    return 0


def cmd_make_change_log(args: argparse.Namespace) -> int:
    handle = _load_handle(args)
    fixtures.make_change_log(
        handle,
        summary=args.summary,
        final_session_number=args.final_session_number,
        commit=True,
    )
    _emit({"ok": True})
    return 0


def cmd_close(args: argparse.Namespace) -> int:
    handle = _load_handle(args)
    proc = fixtures.drive_close_session(
        handle,
        args.session_number,
        force=args.force,
        inject_force_env=args.inject_force_env,
    )
    _emit({
        "exit": proc.returncode,
        "stdout": proc.stdout,
        "stderr": proc.stderr,
    })
    return 0


def cmd_cancel(args: argparse.Namespace) -> int:
    handle = _load_handle(args)
    fixtures.cancel_set(handle, reason=args.reason, commit=True)
    _emit({"ok": True})
    return 0


def cmd_restore(args: argparse.Namespace) -> int:
    handle = _load_handle(args)
    fixtures.restore_set(handle, reason=args.reason, commit=True)
    _emit({"ok": True})
    return 0


def cmd_make_additional_set(args: argparse.Namespace) -> int:
    base = _load_handle(args)
    new_handle = fixtures.make_additional_set(
        base,
        args.new_slug,
        args.new_total_sessions,
    )
    _emit(_handle_to_dict(new_handle))
    return 0


def cmd_make_sibling_worktree(args: argparse.Namespace) -> int:
    handle = _load_handle(args)
    wt_path = fixtures.make_sibling_worktree(handle, args.wt_slug)
    _emit({"worktree_path": str(wt_path)})
    return 0


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="harness_cli")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("make-set")
    p.add_argument("--tmp-path", required=True)
    p.add_argument("--slug", required=True)
    p.add_argument("--total-sessions", type=int, required=True)
    p.add_argument("--engine", default="claude-code")
    p.add_argument("--model", default="claude-opus-4-7")
    p.add_argument("--provider", default="anthropic")
    p.add_argument("--effort", default="high")
    p.set_defaults(func=cmd_make_set)

    p = sub.add_parser("start")
    _add_handle_args(p)
    p.add_argument("--session-number", type=int, required=True)
    p.set_defaults(func=cmd_start)

    p = sub.add_parser("make-activity")
    _add_handle_args(p)
    p.add_argument("--session-number", type=int, required=True)
    p.add_argument("--description", default="harness work step")
    p.set_defaults(func=cmd_make_activity)

    p = sub.add_parser("make-disposition")
    _add_handle_args(p)
    p.add_argument("--session-number", type=int, required=True)
    p.add_argument("--is-final", action="store_true")
    p.add_argument("--status", default="completed")
    p.set_defaults(func=cmd_make_disposition)

    p = sub.add_parser("make-change-log")
    _add_handle_args(p)
    p.add_argument("--summary", default="harness session set close-out")
    p.add_argument("--final-session-number", type=int, default=None)
    p.set_defaults(func=cmd_make_change_log)

    p = sub.add_parser("close")
    _add_handle_args(p)
    p.add_argument("--session-number", type=int, required=True)
    p.add_argument("--force", action="store_true")
    p.add_argument(
        "--inject-force-env",
        dest="inject_force_env",
        action="store_true",
        default=True,
    )
    p.add_argument(
        "--no-inject-force-env",
        dest="inject_force_env",
        action="store_false",
    )
    p.set_defaults(func=cmd_close)

    p = sub.add_parser("cancel")
    _add_handle_args(p)
    p.add_argument("--reason", default="")
    p.set_defaults(func=cmd_cancel)

    p = sub.add_parser("restore")
    _add_handle_args(p)
    p.add_argument("--reason", default="")
    p.set_defaults(func=cmd_restore)

    p = sub.add_parser("make-additional-set")
    _add_handle_args(p)
    p.add_argument("--new-slug", required=True)
    p.add_argument("--new-total-sessions", type=int, required=True)
    p.set_defaults(func=cmd_make_additional_set)

    p = sub.add_parser("make-sibling-worktree")
    _add_handle_args(p)
    p.add_argument("--wt-slug", required=True)
    p.set_defaults(func=cmd_make_sibling_worktree)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except Exception as exc:  # pragma: no cover  CLI-shim error path
        _emit({"error": f"{type(exc).__name__}: {exc}"})
        return 2


if __name__ == "__main__":
    sys.exit(main())
