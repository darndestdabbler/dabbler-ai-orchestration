"""Seat-local catalog lockfile for the Copilot CLI transport (Set 078 S2).

Full schema + rationale: ``docs/session-sets/078-copilot-cli-hybrid-tier/
s1-design-adjudication.md`` Section 1 (routed, ``task_type: architecture``).
That document is a v1-era session artifact and is never edited, so it still
spells the probe sample ``premium_request_weight``; the v2 rename and the
reason for it are recorded on :class:`ModelEntry` below, which wins.

The GitHub Copilot CLI has no discovery/list-models command and no
first-party ``provider`` field (S1 finding): a model's underlying provider is
inferable only from its name prefix (``claude-*``/``gpt-*``/``gemini-*``),
and whether a given model is actually enabled on a given seat is discoverable
only by invoking it and checking for success — the identical generic error
covers both a genuinely-invalid name and a policy-blocked one. This module
therefore treats the lockfile as **seat-scoped, empirically-probed truth**,
never a global or assumed catalog:

- :func:`infer_provider` derives provider from the name-prefix convention.
- :func:`discover_catalog` probes every model in :data:`KNOWN_MODEL_UNIVERSE`
  against the live CLI (via :mod:`ai_router.cli_transport`) and records
  per-seat, per-model ``enablement``.
- :func:`load_lockfile` / :func:`write_lockfile` read/write the TOML lock.
  The lockfile schema this module reads and writes is a deliberately
  restricted TOML subset (one flat ``[meta]`` table plus repeated flat
  ``[[models]]`` tables, scalar values only) — this module is the lockfile's
  only writer, so a small hand-rolled reader/writer avoids adding a TOML
  library dependency to the base package for one optional transport.
  Schema v2 (Set 131) renamed the probe sample ``premium_request_weight``
  to ``probe_premium_requests``; v1 files still load. **No field in this
  lockfile is a price, a rate, or a cost signal** — see
  :class:`ModelEntry`; real spend is read from the seat store by
  ``ai_router/seat_cost.py``.
- :func:`validate_catalog` runs the four fail-closed rules every routed
  dispatch must check before using a lock (version drift, missing
  provenance, same-provider-only, seat mismatch) and returns a result
  object rather than raising, so a caller can react to "fails closed" as a
  data state (e.g. "verification unavailable") instead of catching an
  exception.

CLI usage::

    python -m ai_router.copilot_catalog --refresh \\
        --seat-id op-personal-a1b2c3 --seat-label operator-personal
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Sequence

try:  # package vs bare-import (mirrors the rest of ai_router)
    from .cli_transport import CopilotCliTransport
except ImportError:  # pragma: no cover - test/bare context
    from cli_transport import CopilotCliTransport  # type: ignore[import-not-found]


DEFAULT_LOCKFILE_PATH = "ai_router/copilot-catalog.lock"
DEFAULT_CLI_NAME = "GitHub Copilot CLI"

# Lockfile schema version this module writes. v1 (Set 078) spelled the probe
# sample ``premium_request_weight``; v2 (Set 131) renamed it to
# ``probe_premium_requests`` because the old name asserted a rate the value
# never was — see :class:`ModelEntry`. Both shapes still load: the key below
# is read as a fallback, and neither reader branches on the version, so an
# older ai_router reading a v2 lock simply finds the field absent, which is
# the correct fail-closed direction (absent means unknown).
#
# ``discover_catalog()`` is the only stamper of this constant. ``dumps()``
# is a faithful serializer and round-trips whatever ``meta`` it is handed,
# so a hand-rolled load-then-write migration would emit v2 field names under
# a v1 label; no such path exists in this repo (``main()`` always writes a
# freshly discovered catalog), and a migration that ever gets written must
# restamp the version itself.
LOCKFILE_SCHEMA_VERSION = 2
_LEGACY_PROBE_PREMIUM_KEY = "premium_request_weight"

ENABLEMENT_CONFIRMED = "confirmed"
ENABLEMENT_UNCONFIRMED = "unconfirmed"
ENABLEMENT_BLOCKED = "blocked"
VALID_ENABLEMENT = frozenset(
    {ENABLEMENT_CONFIRMED, ENABLEMENT_UNCONFIRMED, ENABLEMENT_BLOCKED}
)

KNOWN_PROVIDERS = frozenset({"anthropic", "openai", "google"})

_PROVIDER_PREFIXES = (
    ("claude", "anthropic"),
    ("gpt", "openai"),
    ("gemini", "google"),
)

# S1's documented static universe of model IDs the CLI's `model` setting
# accepts (`copilot help config`, CLI v1.0.68). No discovery/list-models
# command exists, so this is the probe candidate set for `--refresh`. Update
# this list when a newer CLI documents additional/removed model ids.
KNOWN_MODEL_UNIVERSE: tuple[str, ...] = (
    "claude-sonnet-4.6", "claude-sonnet-4.5", "claude-haiku-4.5",
    "claude-fable-5", "claude-opus-4.8", "claude-opus-4.7",
    "claude-opus-4.6", "claude-opus-4.6-fast", "claude-opus-4.5",
    "gpt-5.5", "gpt-5.4", "gpt-5.3-codex", "gpt-5.2-codex", "gpt-5.2",
    "gpt-5.4-mini", "gpt-5-mini",
    "gemini-3.1-pro-preview", "gemini-3.5-flash",
)

_DEFAULT_PROBE_PROMPT = "Reply with the single word OK and nothing else."


def infer_provider(model_id: str) -> tuple[str, str]:
    """Derive ``(provider, provider_source)`` from the model-id prefix.

    No first-party provenance field exists (S1 finding) — provider is always
    derived from this naming convention, never asserted from the CLI.
    Returns ``("", "name-prefix-heuristic")`` when no known prefix matches.
    """
    for prefix, provider in _PROVIDER_PREFIXES:
        if model_id.startswith(prefix):
            return provider, "name-prefix-heuristic"
    return "", "name-prefix-heuristic"


# ---------------------------------------------------------------------------
# Data shapes
# ---------------------------------------------------------------------------


@dataclass
class ModelEntry:
    id: str
    provider: str = ""
    provider_source: str = "name-prefix-heuristic"
    enablement: str = ENABLEMENT_UNCONFIRMED
    confirmed_at: Optional[str] = None
    confirmed_on_cli_version: Optional[str] = None
    # NOT A PRICE. NOT A RATE. NOT A COST SIGNAL. See Set 131.
    #
    # This is the premium-request count the CLI reported for the ONE short
    # probe call that confirmed the model — per-call consumption, not the
    # model's multiplier. Set 078 shipped it as `premium_request_weight`,
    # and that name was the defect: "weight" reads as a rate and the value
    # is a sample. Set 131 renamed it; `_LEGACY_PROBE_PREMIUM_KEY` keeps
    # v1 lockfiles readable, because the measurement is real — only its
    # name and its use were wrong.
    #
    # Measured against the seat store on 2026-08-14, the probe disagrees
    # with the authoritative `request_multiplier` for the ENTIRE OpenAI
    # family:
    #
    #     gpt-5.5        probes 0   bills 7.5
    #     gpt-5.4        probes 0   bills 1.0
    #     gpt-5.3-codex  probes 0   bills 1.0
    #     gpt-5.4-mini   probes 0   bills 0.33
    #
    # A selector reading this field as "cheapest" would pick gpt-5.5
    # believing it free and pay the second-highest multiplier on the seat.
    # The Anthropic and Google entries happen to agree, which is exactly
    # what makes the field look trustworthy.
    #
    # It would not be a cost signal even if every number agreed. A
    # fractional multiplier cannot survive the int coercion in
    # discover_catalog() (0.33 and 7.5 both land as None), and the CREDIT
    # axis (`total_nano_aiu`) is decoupled from the premium-request axis:
    # at matched context claude-opus-5 (multiplier 15.0) and gpt-5.5 (7.5)
    # cost the same per inference. "Fix the OpenAI numbers" is therefore
    # not a repair that makes this field usable for selection.
    #
    # None means UNKNOWN, never free (L-112-1) — claude-haiku-4.5 was
    # never probed and still bills 0.33. For real spend, read the seat
    # store through ai_router/seat_cost.py.
    probe_premium_requests: Optional[int] = None
    echoed_model: Optional[str] = None


@dataclass
class CatalogMeta:
    schema_version: int
    cli_name: str
    cli_version: str
    cli_version_pin_required: bool
    seat_id: str
    seat_label: str
    source: str
    probed_at: str
    account_login_sha256: Optional[str] = None
    probe_host_os: Optional[str] = None


@dataclass
class Catalog:
    meta: CatalogMeta
    models: list = field(default_factory=list)

    def confirmed_models(self) -> list:
        return [m for m in self.models if m.enablement == ENABLEMENT_CONFIRMED]


@dataclass(frozen=True)
class CatalogValidationResult:
    """Result of :func:`validate_catalog`. Truthy iff no rule failed."""

    ok: bool
    reasons: tuple = ()

    def __bool__(self) -> bool:
        return self.ok


def validate_catalog(
    catalog: Catalog, *, live_cli_version: str, live_seat_id: str
) -> CatalogValidationResult:
    """Run the four fail-closed rules (design lock Section 1) against a
    loaded catalog. Never raises — callers branch on ``.ok``/``.reasons``.
    """
    reasons: list = []

    if (
        catalog.meta.cli_version_pin_required
        and live_cli_version != catalog.meta.cli_version
    ):
        reasons.append(
            f"CLI version drift: lock pinned to {catalog.meta.cli_version!r}, "
            f"live CLI reports {live_cli_version!r}"
        )

    if live_seat_id != catalog.meta.seat_id:
        reasons.append(
            f"Seat mismatch: lock probed on seat {catalog.meta.seat_id!r}, "
            f"running config asserts seat {live_seat_id!r}"
        )

    confirmed = catalog.confirmed_models()
    for entry in confirmed:
        if not entry.provider or entry.provider not in KNOWN_PROVIDERS:
            reasons.append(
                f"Missing/unknown provenance on confirmed entry {entry.id!r}: "
                f"provider={entry.provider!r}"
            )

    distinct_providers = {
        e.provider for e in confirmed if e.provider in KNOWN_PROVIDERS
    }
    if len(distinct_providers) < 2:
        reasons.append(
            "Same-provider-only catalog: confirmed entries resolve to "
            f"{sorted(distinct_providers)} (need >= 2 distinct providers)"
        )

    return CatalogValidationResult(ok=not reasons, reasons=tuple(reasons))


# ---------------------------------------------------------------------------
# Lockfile IO — a deliberately restricted TOML subset (flat scalars only;
# see module docstring for why this avoids a new dependency).
# ---------------------------------------------------------------------------


def _toml_escape_str(s: str) -> str:
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def _toml_value(value) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, str):
        return _toml_escape_str(value)
    raise TypeError(f"Unsupported lockfile value type: {type(value).__name__}")


def _write_table(lines: list, data: dict) -> None:
    for key, val in data.items():
        if val is None:
            continue
        lines.append(f"{key} = {_toml_value(val)}")


def dumps(catalog: Catalog) -> str:
    lines: list = ["[meta]"]
    _write_table(lines, asdict(catalog.meta))
    for entry in catalog.models:
        lines.append("")
        lines.append("[[models]]")
        _write_table(lines, asdict(entry))
    return "\n".join(lines) + "\n"


def write_lockfile(path, catalog: Catalog) -> None:
    Path(path).write_text(dumps(catalog), encoding="utf-8")


_KEY_VALUE_RE = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$")


def _parse_scalar(raw: str):
    raw = raw.strip()
    if raw == "true":
        return True
    if raw == "false":
        return False
    if len(raw) >= 2 and raw.startswith('"') and raw.endswith('"'):
        return raw[1:-1].replace('\\"', '"').replace("\\\\", "\\")
    try:
        return int(raw)
    except ValueError:
        raise ValueError(f"Unparseable lockfile scalar: {raw!r}") from None


def loads(text: str) -> Catalog:
    meta_dict: dict = {}
    model_dicts: list = []
    current: Optional[dict] = None

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line == "[meta]":
            current = meta_dict
            continue
        if line == "[[models]]":
            current = {}
            model_dicts.append(current)
            continue
        match = _KEY_VALUE_RE.match(line)
        if not match:
            raise ValueError(f"Unparseable lockfile line: {raw_line!r}")
        if current is None:
            raise ValueError(
                f"Key-value line before any table header: {raw_line!r}"
            )
        key, raw_value = match.groups()
        current[key] = _parse_scalar(raw_value)

    if not meta_dict:
        raise ValueError("Lockfile has no [meta] table")
    for required in ("cli_name", "cli_version", "seat_id"):
        if required not in meta_dict:
            raise ValueError(f"Lockfile [meta] is missing required key {required!r}")

    meta = CatalogMeta(
        schema_version=int(meta_dict.get("schema_version", 1)),
        cli_name=meta_dict["cli_name"],
        cli_version=meta_dict["cli_version"],
        cli_version_pin_required=bool(
            meta_dict.get("cli_version_pin_required", True)
        ),
        seat_id=meta_dict["seat_id"],
        seat_label=meta_dict.get("seat_label", ""),
        source=meta_dict.get("source", "empirical-probe"),
        probed_at=meta_dict.get("probed_at", ""),
        account_login_sha256=meta_dict.get("account_login_sha256"),
        probe_host_os=meta_dict.get("probe_host_os"),
    )
    entries = [
        ModelEntry(
            id=md["id"],
            provider=md.get("provider", ""),
            provider_source=md.get("provider_source", "name-prefix-heuristic"),
            enablement=md.get("enablement", ENABLEMENT_UNCONFIRMED),
            confirmed_at=md.get("confirmed_at"),
            confirmed_on_cli_version=md.get("confirmed_on_cli_version"),
            # v1 lockfiles carry the pre-Set-131 key; read it rather than
            # silently dropping a real measurement on upgrade. Absent under
            # both names stays None, which is UNKNOWN and never "free".
            probe_premium_requests=md.get(
                "probe_premium_requests", md.get(_LEGACY_PROBE_PREMIUM_KEY)
            ),
            echoed_model=md.get("echoed_model"),
        )
        for md in model_dicts
    ]
    return Catalog(meta=meta, models=entries)


def load_lockfile(path) -> Catalog:
    text = Path(path).read_text(encoding="utf-8")
    return loads(text)


# ---------------------------------------------------------------------------
# Discovery — probes the real CLI. Never exercised by the test suite against
# a real binary; tests inject a fake transport (Feature 1 Standards).
# ---------------------------------------------------------------------------


def get_cli_version(*, binary: str = "copilot") -> Optional[str]:
    try:
        result = subprocess.run(
            [binary, "--version"], capture_output=True, text=True, timeout=30,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if result.returncode != 0:
        return None
    stripped = result.stdout.strip()
    if not stripped:
        return None
    # S4 live-dogfood finding: the real CLI's ``--version`` banner is two
    # lines ("GitHub Copilot CLI 1.0.68.\nRun 'copilot update' ..."), not the
    # single clean token every fake-spawner test fixture assumed. The raw
    # multi-line string, stored verbatim as `cli_version`, produced a
    # literal unescaped newline inside a quoted TOML value that the module's
    # own loader could not parse back (round-trip failure caught by
    # discovering against the real seat). Only the first line is the actual
    # version banner; keep it, drop the update-nag trailer line.
    return stripped.splitlines()[0].strip() or None


def discover_catalog(
    *,
    seat_id: str,
    seat_label: str,
    probed_at: str,
    binary: str = "copilot",
    transport: Optional[CopilotCliTransport] = None,
    model_universe: Sequence[str] = KNOWN_MODEL_UNIVERSE,
    probe_prompt: str = _DEFAULT_PROBE_PROMPT,
    cli_version: Optional[str] = None,
) -> Catalog:
    """Probe every candidate model in *model_universe* and build a
    seat-scoped :class:`Catalog`.

    Each candidate is dispatched with a trivial prompt; a successful
    dispatch (``.ok``) marks the entry ``confirmed`` (provider from the
    prefix convention, ``confirmed_on_cli_version``/``echoed_model``
    recorded from the response); a failed dispatch marks it
    ``unconfirmed`` — a genuinely-invalid name and a policy-blocked one
    produce the identical error shape (S1 finding), so enablement is
    strictly empirical, never assumed.

    ``transport`` defaults to a real :class:`CopilotCliTransport` (which
    spawns the real CLI); tests pass one built with a fake spawner instead.
    ``cli_version`` defaults to a live ``--version`` probe; tests pin it
    explicitly to avoid shelling out.
    """
    transport = transport or CopilotCliTransport(binary=binary)
    resolved_version = cli_version if cli_version is not None else (
        get_cli_version(binary=binary) or "unknown"
    )

    entries: list = []
    for model_id in model_universe:
        provider, provider_source = infer_provider(model_id)
        result = transport.dispatch(
            model_id=model_id, system_prompt="", user_message=probe_prompt,
        )
        if result.ok:
            # transport_metadata is an open diagnostic dict (cli_transport.py
            # does not strictly type every key in it), but
            # ModelEntry.probe_premium_requests is a typed Optional[int]
            # that write_lockfile()'s hand-rolled TOML serializer must be
            # able to render. A wrong-shaped premiumRequests (a float, a
            # list, a dict -- round-4 verification finding) would otherwise
            # cross that boundary untyped and crash `--refresh` inside
            # _toml_value, which only supports bool/int/str. Coerce any
            # non-plain-int value to None here, at the boundary, rather
            # than trusting the transport layer's opaque metadata.
            #
            # Set 131: None here means UNKNOWN, never "free". The coercion
            # is correct and stays -- but note it is also why a fractional
            # rate (0.33, 7.5) could never land in this field even if the
            # CLI reported one, which is one of the reasons it must not be
            # read as a price. See ModelEntry.probe_premium_requests.
            raw_probe_premium = result.transport_metadata.get("premium_requests")
            probe_premium_requests = (
                raw_probe_premium
                if isinstance(raw_probe_premium, int)
                and not isinstance(raw_probe_premium, bool)
                else None
            )
            entries.append(ModelEntry(
                id=model_id,
                provider=provider,
                provider_source=provider_source,
                enablement=ENABLEMENT_CONFIRMED,
                confirmed_at=probed_at,
                confirmed_on_cli_version=resolved_version,
                probe_premium_requests=probe_premium_requests,
                echoed_model=result.transport_metadata.get("echoed_model"),
            ))
        else:
            entries.append(ModelEntry(
                id=model_id,
                provider=provider,
                provider_source=provider_source,
                enablement=ENABLEMENT_UNCONFIRMED,
            ))

    meta = CatalogMeta(
        schema_version=LOCKFILE_SCHEMA_VERSION,
        cli_name=DEFAULT_CLI_NAME,
        cli_version=resolved_version,
        cli_version_pin_required=True,
        seat_id=seat_id,
        seat_label=seat_label,
        source="empirical-probe",
        probed_at=probed_at,
    )
    return Catalog(meta=meta, models=entries)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Probe the installed GitHub Copilot CLI's static model universe "
            "on this seat and write a seat-scoped catalog lockfile."
        )
    )
    parser.add_argument(
        "--refresh", action="store_true", required=True,
        help="Probe every known model id and (re)write the lockfile.",
    )
    parser.add_argument(
        "--seat-id", required=True,
        help="Operator-assigned stable seat label, e.g. 'op-personal-a1b2c3'.",
    )
    parser.add_argument(
        "--seat-label", default="",
        help="Human label, e.g. 'operator-personal' or 'target-team'.",
    )
    parser.add_argument("--binary", default="copilot")
    parser.add_argument("--out", default=DEFAULT_LOCKFILE_PATH)
    args = parser.parse_args(argv)

    catalog = discover_catalog(
        seat_id=args.seat_id,
        seat_label=args.seat_label,
        probed_at=_utc_now_iso(),
        binary=args.binary,
    )
    write_lockfile(args.out, catalog)

    confirmed = catalog.confirmed_models()
    providers = sorted({e.provider for e in confirmed if e.provider})
    print(
        f"Wrote {args.out}: {len(confirmed)}/{len(catalog.models)} models "
        f"confirmed, providers={providers}"
    )
    if len(providers) < 2:
        print(
            "WARNING: fewer than 2 distinct providers confirmed on this "
            "seat -- routed dispatch will fail closed under the "
            "copilot-cli profile.",
            file=sys.stderr,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
