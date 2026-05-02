"""``heartbeat_status`` — observational summary of provider capacity signals.

Set 5 / Session 1. Companion to :mod:`queue_status`. The VS Code
extension's ``Provider Heartbeats`` tree view shells out here rather
than reading ``capacity_signal.jsonl`` directly. The reasons mirror
``queue_status``: the file format lives in :mod:`capacity` and a
second TypeScript reader would either duplicate or drift from it.

Framing — read this before extending the module
------------------------------------------------
Every output of this module is **backward-looking**. It answers two
narrow questions per provider:

    1. When did this provider last produce a completion? (liveness)
    2. How much has it produced over the last N minutes? (utilization)

It does NOT predict remaining subscription window, throttle risk, or
rate-limit headroom. The cross-provider review of the v1 plan rejected
predictive framings for exactly this reason — see Set 005 spec, Risks
section, "Heartbeat misuse". Every payload this module emits carries
a ``_disclaimer`` field so the extension's tree-view footer can echo
the framing back at users.

Invocation::

    python -m ai_router.heartbeat_status                          # human text
    python -m ai_router.heartbeat_status --format json            # extension consumer
    python -m ai_router.heartbeat_status --provider anthropic     # filter
    python -m ai_router.heartbeat_status --lookback-minutes 30    # narrower window

Output schema (``--format json``)::

    {
      "providers": {
        "<name>": {
          "signal_path": "<absolute path>",
          "signal_file_present": bool,
          "last_completion_at": "<ISO-8601>" | null,
          "minutes_since_last_completion": int | null,
          "completions_in_last_60min": int,
          "tokens_in_last_60min": int,
          "lookback_minutes": int,
          "_disclaimer": "Observational only; ..."
        }
      },
      "_disclaimer": "Observational only; ..."
    }

The disclaimer is duplicated at the top level so a consumer that
only renders one provider still sees it without iterating into the
provider dict.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Iterable, List, Optional

if __name__ == "__main__" and __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent))

try:
    from capacity import (  # type: ignore[import-not-found]
        CAPACITY_SIGNAL_FILENAME,
        DEFAULT_LOOKBACK_MINUTES,
        read_capacity_summary,
    )
    from queue_db import DEFAULT_BASE_DIR  # type: ignore[import-not-found]
except ImportError:
    from .capacity import (  # type: ignore[no-redef]
        CAPACITY_SIGNAL_FILENAME,
        DEFAULT_LOOKBACK_MINUTES,
        read_capacity_summary,
    )
    from .queue_db import DEFAULT_BASE_DIR  # type: ignore[no-redef]


DISCLAIMER = (
    "Observational only; subscription windows are not introspectable. "
    "Use as a heartbeat signal, not as routing or capacity guidance."
)


def _discover_providers(base_dir: Path) -> List[str]:
    """Return providers that have a capacity_signal.jsonl on disk.

    The heartbeat view is signal-only: a provider that has a
    ``queue.db`` but has never had a daemon run is not interesting
    here (it has no liveness data to report). The queue view covers
    that case.
    """
    if not base_dir.is_dir():
        return []
    out: List[str] = []
    for entry in sorted(base_dir.iterdir()):
        if not entry.is_dir():
            continue
        if (entry / CAPACITY_SIGNAL_FILENAME).is_file():
            out.append(entry.name)
    return out


def collect_status(
    *,
    base_dir: Path,
    provider_filter: Optional[str] = None,
    lookback_minutes: int = DEFAULT_LOOKBACK_MINUTES,
) -> dict:
    """Build the JSON payload the VS Code extension consumes.

    Field naming maps the :class:`CapacitySummary` fields to
    extension-friendly names:

      * ``time_since_last_seconds`` -> ``minutes_since_last_completion``
        (rounded down, ``None`` preserved)
      * ``completions_in_window`` -> ``completions_in_last_<N>min``
      * ``tokens_in_window`` -> ``tokens_in_last_<N>min``

    The N is whatever ``lookback_minutes`` was — usually 60 — so the
    extension's tree label can use the literal field name without
    pulling the lookback value out of the payload.
    """
    if lookback_minutes <= 0:
        raise ValueError(
            f"lookback_minutes must be positive (got {lookback_minutes!r})"
        )

    providers = _discover_providers(base_dir)
    if provider_filter is not None:
        # Same shape as queue_status: surface a typo'd or
        # not-yet-active provider with signal_file_present=false
        # rather than producing an empty result. read_capacity_summary
        # tolerates a missing file and returns the right shape.
        providers = [provider_filter]

    out_providers: dict[str, dict] = {}
    for provider in providers:
        signal_path = base_dir / provider / CAPACITY_SIGNAL_FILENAME
        summary = read_capacity_summary(
            provider,
            lookback_minutes=lookback_minutes,
            base_dir=str(base_dir),
        )
        if summary.time_since_last_seconds is None:
            minutes_since: Optional[int] = None
        else:
            minutes_since = int(summary.time_since_last_seconds // 60)

        # Field names embed the lookback value so the extension's tree
        # label can read e.g. ``completions_in_last_60min`` directly.
        n = lookback_minutes
        out_providers[provider] = {
            "signal_path": str(signal_path),
            "signal_file_present": summary.signal_file_present,
            "last_completion_at": summary.last_completion_at,
            "minutes_since_last_completion": minutes_since,
            f"completions_in_last_{n}min": summary.completions_in_window,
            f"tokens_in_last_{n}min": summary.tokens_in_window,
            "lookback_minutes": summary.lookback_minutes,
            "_disclaimer": DISCLAIMER,
        }

    return {
        "providers": out_providers,
        "_disclaimer": DISCLAIMER,
    }


# ---------- CLI ----------


def _format_minutes(m: Optional[int]) -> str:
    if m is None:
        return "never"
    if m < 60:
        return f"{m}m"
    h, rem = divmod(m, 60)
    return f"{h}h {rem}m"


def _print_text(payload: dict, lookback_minutes: int, out=sys.stdout) -> None:
    providers = payload.get("providers", {})
    if not providers:
        print("(no provider capacity signals found)", file=out)
        print(f"  {DISCLAIMER}", file=out)
        return
    print(
        f"== Provider heartbeats (lookback: {lookback_minutes} min) ==",
        file=out,
    )
    for name, info in providers.items():
        if not info.get("signal_file_present"):
            print(f"  {name:12s} (no capacity_signal.jsonl yet)", file=out)
            continue
        # Derive the embedded-N field names from the payload itself so a
        # mismatch between the function's lookback_minutes argument and
        # the payload's actual lookback can never produce silent zeros.
        n = info.get("lookback_minutes", lookback_minutes)
        since = _format_minutes(info.get("minutes_since_last_completion"))
        completions = info.get(f"completions_in_last_{n}min", 0)
        tokens = info.get(f"tokens_in_last_{n}min", 0)
        last = info.get("last_completion_at") or "-"
        print(
            f"  {name:12s} last seen {since} ago "
            f"({last}); {completions} completions / "
            f"{tokens} tokens in last {n}m",
            file=out,
        )
    print("", file=out)
    print(f"  {DISCLAIMER}", file=out)


def _build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="heartbeat_status",
        description=(
            "Observational summary of provider capacity signals. "
            "Backward-looking only: reports when each provider last "
            "produced work and how much over the lookback window. "
            "Does NOT predict remaining capacity or throttle risk."
        ),
    )
    p.add_argument(
        "--workspace",
        default=None,
        help=(
            "Workspace root. The capacity-signal base dir is "
            "<workspace>/provider-queues. Defaults to the current "
            "working directory."
        ),
    )
    p.add_argument(
        "--base-dir",
        default=None,
        help=(
            "Override the base dir directly. Takes precedence over "
            f"--workspace. Default: <workspace>/{DEFAULT_BASE_DIR}."
        ),
    )
    p.add_argument(
        "--provider",
        default=None,
        help="Limit output to one provider.",
    )
    p.add_argument(
        "--lookback-minutes",
        type=int,
        default=DEFAULT_LOOKBACK_MINUTES,
        help=(
            f"Window size for completion/token counts "
            f"(default: {DEFAULT_LOOKBACK_MINUTES})."
        ),
    )
    p.add_argument(
        "--format",
        choices=("text", "json"),
        default="text",
        help="Output format. The extension uses --format json.",
    )
    return p


def _resolve_base_dir(args: argparse.Namespace) -> Path:
    if args.base_dir:
        return Path(args.base_dir).resolve()
    workspace = Path(args.workspace) if args.workspace else Path.cwd()
    return (workspace / DEFAULT_BASE_DIR).resolve()


def main(argv: Optional[Iterable[str]] = None) -> int:
    parser = _build_arg_parser()
    args = parser.parse_args(list(argv) if argv is not None else None)
    base_dir = _resolve_base_dir(args)

    payload = collect_status(
        base_dir=base_dir,
        provider_filter=args.provider,
        lookback_minutes=args.lookback_minutes,
    )

    if args.format == "json":
        print(json.dumps(payload, sort_keys=True))
    else:
        _print_text(payload, args.lookback_minutes)
    return 0


if __name__ == "__main__":  # pragma: no cover — exercised via subprocess
    raise SystemExit(main())
