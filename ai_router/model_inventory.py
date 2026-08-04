"""Provider model enumeration and the registry drift gate (Set 109 S1).

The router's model registry (``router-config.yaml`` -> ``models:``) is a
hand-maintained mapping from a local ALIAS (``gpt-5-6``) to a provider plus the
``model_id`` string actually put on the wire (``gpt-5.6``). Nothing checked that
those wire strings were ids the provider actually offers, and one of them was
not: OpenAI lists ``gpt-5.6-luna`` / ``gpt-5.6-sol`` / ``gpt-5.6-terra`` and no
bare ``gpt-5.6``. The bare id silently resolved to the most expensive variant,
so every cost this repo reported for that entry was half the truth. This module
is the falsifier for that entire class:

- :func:`refresh_inventory` probes each provider's model-list endpoint and
  writes :data:`DEFAULT_LOCKFILE_PATH`, a per-provider snapshot of the ids on
  offer plus the timestamp each was probed at.
- :func:`check_registry` compares every configured ``model_id`` against that
  snapshot and **fails on any miss, with no carve-out**. It reads two local
  files and **never touches the network** — session start must not pay three
  round-trips, and CI must be deterministic.

The report separates a *routable* miss (an id that can be put on the wire) from
an *identity-only* one (a record of what an orchestrator IS, never routed to),
because they differ in urgency. They do not differ in the exit code. An earlier
draft let an identity-only miss pass with a note; the close backstop was right
that this makes exit 0 certify something untrue the moment the routable
specimen is corrected, and a known-tolerated miss is precisely the silent hole
this module exists to close.

The lockfile is JSON rather than the restricted-TOML subset
``copilot_catalog.py`` hand-rolls. That module's format exists to avoid adding
a TOML dependency for a per-model attribute table; ``json`` is stdlib, and the
payload here is three lists of opaque id strings, so the hand-rolled serializer
would be cost without benefit. It is deliberately NOT listed in
``pyproject.toml``'s ``package-data`` (same call as ``copilot-catalog.lock``):
which ids an account is offered is account-scoped, and shipping one operator's
snapshot in the wheel would hand consumers stale data that looks authoritative.

**The gate is deliberately unwired.** Nothing calls ``--check`` automatically.
The repository's own registry FAILS it today (that is the point — the failing
entry is the specimen), and Session 4 of Set 109 is what fixes the registry.
Wiring it into ``ai_router/scripts/drift_guard.py`` — whose test suite asserts
the real repository passes every check — would turn the committed suite red on
the day this lands. It is wired after S4, not before.

CLI usage::

    python -m ai_router.model_inventory --refresh
    python -m ai_router.model_inventory --check
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional, Sequence

import httpx

try:  # package vs bare-import (mirrors the rest of ai_router)
    from .config import load_config
    from .secret_resolver import resolve_secret
except ImportError:  # pragma: no cover - test/bare context
    from config import load_config  # type: ignore[import-not-found]
    from secret_resolver import resolve_secret  # type: ignore[import-not-found]


SCHEMA_VERSION = 1

_THIS_DIR = Path(__file__).resolve().parent
DEFAULT_LOCKFILE_PATH = _THIS_DIR / "model-inventory.lock"

#: Providers whose model list this module knows how to enumerate. A registry
#: entry naming any other provider is REPORTED as unenumerable rather than
#: silently skipped — an unchecked entry is exactly the hole this module exists
#: to close.
ENUMERATED_PROVIDERS: tuple[str, ...] = ("anthropic", "google", "openai")

#: Days after which a provider's snapshot earns a staleness warning. Matches
#: the registry's existing ``metadata.review_frequency_days: 30`` pricing
#: cadence rather than inventing a second number. Provider catalogs move on the
#: order of weeks; a tighter threshold would warn permanently, which is how a
#: warning stops being read.
STALENESS_THRESHOLD_DAYS = 30

EXIT_OK = 0
EXIT_DRIFT = 1
EXIT_FATAL = 2

_HTTP_TIMEOUT_SECONDS = 60.0

#: Anthropic's list endpoint caps ``limit`` at 1000; both other providers
#: accept an equivalent page size. Pagination is still implemented — a cap that
#: happens to exceed today's catalog is not the same as no pagination.
_PAGE_SIZE = 1000


class InventoryError(RuntimeError):
    """A provider could not be enumerated, or the lockfile is unusable."""


# ---------------------------------------------------------------------------
# Endpoint resolution
#
# The list endpoints are derived from the SAME ``providers.<name>.base_url``
# the completion calls use, so a proxied deployment stays consistent without a
# second set of config keys to keep in sync. The three base URLs are not
# uniformly shaped (Anthropic's points at the messages endpoint; the other two
# at an API root), which is why this is a function rather than an f-string at
# each call site.
# ---------------------------------------------------------------------------


def list_endpoint(provider: str, provider_cfg: dict) -> str:
    """Return the model-list URL for *provider* (no API key embedded)."""
    if provider == "anthropic":
        base = provider_cfg.get(
            "base_url", "https://api.anthropic.com/v1/messages"
        ).rstrip("/")
        if base.endswith("/messages"):
            base = base[: -len("/messages")]
        return f"{base}/models"
    if provider == "google":
        base = provider_cfg.get(
            "base_url", "https://generativelanguage.googleapis.com/v1beta"
        ).rstrip("/")
        return f"{base}/models"
    if provider == "openai":
        base = provider_cfg.get("base_url", "https://api.openai.com/v1").rstrip("/")
        return f"{base}/models"
    raise InventoryError(f"No enumeration endpoint known for provider {provider!r}")


# ---------------------------------------------------------------------------
# Response parsing — pure functions over one decoded page. Each returns
# ``(ids, next_cursor)``; ``next_cursor`` is None on the last page.
# ---------------------------------------------------------------------------


def parse_openai_page(payload: dict) -> tuple[list[str], Optional[str]]:
    """Parse ``GET /v1/models``: ``{"object": "list", "data": [{"id": ...}]}``.

    OpenAI returns the whole catalog in one response and exposes no cursor, so
    the second element is always ``None``.
    """
    data = payload.get("data")
    if not isinstance(data, list):
        raise InventoryError(
            "OpenAI model list has no 'data' array "
            f"(top-level keys: {sorted(payload)})"
        )
    return [str(m["id"]) for m in data if isinstance(m, dict) and m.get("id")], None


def parse_anthropic_page(payload: dict) -> tuple[list[str], Optional[str]]:
    """Parse ``GET /v1/models``: cursor-paginated via ``has_more``/``last_id``."""
    data = payload.get("data")
    if not isinstance(data, list):
        raise InventoryError(
            "Anthropic model list has no 'data' array "
            f"(top-level keys: {sorted(payload)})"
        )
    ids = [str(m["id"]) for m in data if isinstance(m, dict) and m.get("id")]
    cursor = payload.get("last_id") if payload.get("has_more") else None
    return ids, (str(cursor) if cursor else None)


def parse_google_page(payload: dict) -> tuple[list[str], Optional[str]]:
    """Parse ``GET /v1beta/models``: ``{"models": [{"name": "models/<id>"}]}``.

    The ``models/`` prefix is stripped HERE, at write time, so the lockfile
    holds exactly the strings ``router-config.yaml`` puts on the wire and the
    drift check stays a plain set membership test with no consumer-side
    normalization to forget.
    """
    models = payload.get("models")
    if not isinstance(models, list):
        raise InventoryError(
            "Google model list has no 'models' array "
            f"(top-level keys: {sorted(payload)})"
        )
    ids = []
    for entry in models:
        if not isinstance(entry, dict):
            continue
        name = entry.get("name")
        if not name:
            continue
        name = str(name)
        ids.append(name[len("models/"):] if name.startswith("models/") else name)
    token = payload.get("nextPageToken")
    return ids, (str(token) if token else None)


# ---------------------------------------------------------------------------
# Live probes. ``client`` is injectable so the test suite can drive these with
# ``httpx.MockTransport`` and never open a socket.
# ---------------------------------------------------------------------------


_SECRET_QUERY_PARAM_RE = re.compile(r"([?&](?:key|api_key|access_token)=)[^&\s]+")


def redact_secret(text: str, secret: Optional[str] = None) -> str:
    """Scrub credentials out of a string bound for operator-visible output.

    Two passes, deliberately: the literal *secret* value wherever it appears
    (which catches it in a header dump, a URL, or a provider's own echo), and
    any credential-shaped query parameter (which catches a key this call site
    does not happen to hold). Diagnostics are printed to stderr and land in
    terminal history and CI logs, so this runs on the failure path before the
    message is ever constructed -- not at the print.
    """
    if secret:
        text = text.replace(secret, "<redacted>")
    return _SECRET_QUERY_PARAM_RE.sub(r"\1<redacted>", text)


def _get_json(client: httpx.Client, url: str, *, headers: Optional[dict] = None,
              params: Optional[dict] = None) -> dict:
    response = client.get(url, headers=headers or {}, params=params or {})
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, dict):
        raise InventoryError(f"{url} returned a non-object JSON body")
    return payload


def fetch_openai(client: httpx.Client, *, endpoint: str, api_key: str) -> list[str]:
    payload = _get_json(
        client, endpoint, headers={"Authorization": f"Bearer {api_key}"}
    )
    ids, _ = parse_openai_page(payload)
    return ids


def fetch_anthropic(
    client: httpx.Client, *, endpoint: str, api_key: str,
    api_version: str = "2023-06-01",
) -> list[str]:
    headers = {"x-api-key": api_key, "anthropic-version": api_version}
    params: dict = {"limit": _PAGE_SIZE}
    collected: list[str] = []
    seen_cursors: set[str] = set()
    while True:
        payload = _get_json(client, endpoint, headers=headers, params=params)
        ids, cursor = parse_anthropic_page(payload)
        collected.extend(ids)
        if not cursor or cursor in seen_cursors:
            # A repeated cursor means the server is looping; stop rather than
            # spin forever building a list with duplicates in it.
            return collected
        seen_cursors.add(cursor)
        params = {"limit": _PAGE_SIZE, "after_id": cursor}


def fetch_google(client: httpx.Client, *, endpoint: str, api_key: str) -> list[str]:
    # The key goes in the ``x-goog-api-key`` HEADER, never the query string.
    # httpx renders the full request URL into HTTPStatusError, and this
    # module's failure path prints that message to stderr -- a `?key=` param
    # would put a live credential into terminal history and CI logs on any
    # routine 401/429/5xx.
    headers = {"x-goog-api-key": api_key}
    params: dict = {"pageSize": _PAGE_SIZE}
    collected: list[str] = []
    seen_tokens: set[str] = set()
    while True:
        payload = _get_json(client, endpoint, headers=headers, params=params)
        ids, token = parse_google_page(payload)
        collected.extend(ids)
        if not token or token in seen_tokens:
            return collected
        seen_tokens.add(token)
        params = {"pageSize": _PAGE_SIZE, "pageToken": token}


_FETCHERS = {
    "anthropic": fetch_anthropic,
    "google": fetch_google,
    "openai": fetch_openai,
}


def probe_provider(
    provider: str, config: dict, *, client: Optional[httpx.Client] = None,
) -> list[str]:
    """Enumerate one provider. Raises :class:`InventoryError` on any failure."""
    if provider not in _FETCHERS:
        raise InventoryError(f"Cannot enumerate unknown provider {provider!r}")
    provider_cfg = (config.get("providers") or {}).get(provider) or {}
    key_env = provider_cfg.get("api_key_env")
    api_key = resolve_secret(key_env) if key_env else None
    if not api_key:
        raise InventoryError(
            f"Missing API key for {provider}: environment variable "
            f"{key_env or '<unset in router-config.yaml>'} is not set"
        )
    endpoint = list_endpoint(provider, provider_cfg)
    fetcher = _FETCHERS[provider]
    owns_client = client is None
    client = client or httpx.Client(timeout=_HTTP_TIMEOUT_SECONDS)
    try:
        if provider == "anthropic":
            ids = fetcher(
                client, endpoint=endpoint, api_key=api_key,
                api_version=provider_cfg.get("api_version", "2023-06-01"),
            )
        else:
            ids = fetcher(client, endpoint=endpoint, api_key=api_key)
    except httpx.HTTPError as exc:
        # httpx renders the request URL (and sometimes the response body) into
        # its exception text, and this message is printed to stderr by --refresh.
        raise InventoryError(
            f"{provider} enumeration failed: {redact_secret(str(exc), api_key)}"
        ) from None
    finally:
        if owns_client:
            client.close()
    if not ids:
        # An empty list is indistinguishable from "this provider sells nothing"
        # once it is in the lockfile, and would make every model of that
        # provider read as drift. Refuse to record it.
        raise InventoryError(f"{provider} returned an empty model list")
    return ids


# ---------------------------------------------------------------------------
# Lockfile IO
# ---------------------------------------------------------------------------


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(moment: datetime) -> str:
    return moment.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_lockfile(path) -> dict:
    """Read and shape-check the lockfile. Raises :class:`InventoryError`."""
    path = Path(path)
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise InventoryError(f"Cannot read lockfile {path}: {exc}") from exc
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise InventoryError(f"Lockfile {path} is not valid JSON: {exc}") from exc
    if not isinstance(payload, dict) or not isinstance(
        payload.get("providers"), dict
    ):
        raise InventoryError(f"Lockfile {path} has no 'providers' object")
    return payload


def write_lockfile(path, payload: dict) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )


def refresh_inventory(
    config: dict,
    *,
    lockfile_path=DEFAULT_LOCKFILE_PATH,
    providers: Sequence[str] = ENUMERATED_PROVIDERS,
    client: Optional[httpx.Client] = None,
    now: Optional[datetime] = None,
) -> tuple[dict, list[str]]:
    """Probe *providers* and write the lockfile.

    Returns ``(payload, failures)`` where *failures* is a list of human-readable
    strings, one per provider that could not be enumerated. A provider that
    fails keeps whatever snapshot it already had — a partial refresh must never
    downgrade a good snapshot to an empty or missing one — and the caller
    reports the failure loudly (the CLI exits non-zero).
    """
    now = now or _utc_now()
    try:
        previous = load_lockfile(lockfile_path)
    except InventoryError:
        previous = {"providers": {}}

    provider_blocks: dict = dict(previous.get("providers") or {})
    failures: list[str] = []

    for provider in providers:
        try:
            ids = probe_provider(provider, config, client=client)
        except InventoryError as exc:
            failures.append(str(exc))
            continue
        provider_cfg = (config.get("providers") or {}).get(provider) or {}
        provider_blocks[provider] = {
            "probed_at": _iso(now),
            "endpoint": list_endpoint(provider, provider_cfg),
            "model_count": len(set(ids)),
            "models": sorted(set(ids)),
        }

    payload = {
        "schema_version": SCHEMA_VERSION,
        "generated_by": "ai_router.model_inventory",
        "providers": provider_blocks,
    }
    write_lockfile(lockfile_path, payload)
    return payload, failures


# ---------------------------------------------------------------------------
# The drift check
# ---------------------------------------------------------------------------

#: A configured entry that is not offered by its provider. EVERY miss fails;
#: ``routable`` only says which KIND it is, so the operator can tell a live
#: routing defect from a stale identity record at a glance.
@dataclass(frozen=True)
class DriftFinding:
    alias: str
    provider: str
    model_id: str
    routable: bool
    reason: str

    def render(self) -> str:
        kind = "routable" if self.routable else "identity-only"
        return (
            f"  [x] {self.alias} ({kind}, provider={self.provider}, "
            f"model_id={self.model_id!r}): {self.reason}"
        )


@dataclass
class CheckResult:
    """Outcome of :func:`check_registry`. Never raises — the CLI turns this
    into an exit code."""

    checked: int = 0
    routable_drift: list = field(default_factory=list)
    identity_drift: list = field(default_factory=list)
    stale_providers: list = field(default_factory=list)
    fatal: list = field(default_factory=list)

    @property
    def ok(self) -> bool:
        # An identity-only miss fails too. The invariant this gate exists to
        # certify is "every configured model_id is offered by its provider" --
        # with no carve-out -- so an exit 0 that tolerated a known miss would
        # be certifying something untrue. The routable/identity-only split
        # survives in the REPORT, where it tells the operator how urgent the
        # miss is; it no longer survives in the exit code, where it would tell
        # automation a falsehood.
        return not (self.routable_drift or self.identity_drift or self.fatal)


def pinned_model_names(config: dict) -> set:
    """Aliases the routing table names DIRECTLY, bypassing ``is_enabled``.

    ``models.pick_model`` returns a ``task_type_overrides`` pin without its
    ``_survives()`` check whenever no provider exclusion is in play, so a
    pinned entry reaches the wire even with ``is_enabled: false``. Verified
    empirically during Set 109 S1. ``tier_assignments`` names models directly
    too. An id in either table is therefore ROUTABLE regardless of its flag,
    and a gate that trusted ``is_enabled`` alone would file it as a note.
    """
    routing = config.get("routing") or {}
    names = set()
    overrides = routing.get("task_type_overrides") or {}
    if isinstance(overrides, dict):
        names.update(str(v) for v in overrides.values() if v)
    assignments = routing.get("tier_assignments") or {}
    if isinstance(assignments, dict):
        names.update(str(v) for v in assignments.values() if v)
    return names


def check_registry(
    config: dict,
    lockfile: dict,
    *,
    now: Optional[datetime] = None,
    staleness_days: int = STALENESS_THRESHOLD_DAYS,
) -> CheckResult:
    """Compare every ``models:`` entry against the lockfile snapshot."""
    now = now or _utc_now()
    result = CheckResult()
    provider_blocks = lockfile.get("providers") or {}
    pinned = pinned_model_names(config)

    for provider, block in sorted(provider_blocks.items()):
        probed_at = (block or {}).get("probed_at")
        if not probed_at:
            # A snapshot with no timestamp can never be judged stale, so it
            # would pass forever without anyone able to see how old it is.
            # That is the silent hole this module exists to close: fatal.
            result.fatal.append(
                f"provider {provider!r} has a snapshot with no probed_at "
                "timestamp; re-run --refresh"
            )
            continue
        try:
            probed = datetime.strptime(probed_at, "%Y-%m-%dT%H:%M:%SZ").replace(
                tzinfo=timezone.utc
            )
        except (TypeError, ValueError):
            result.fatal.append(
                f"provider {provider!r} has an unparseable probed_at "
                f"{probed_at!r}"
            )
            continue
        age = now - probed
        if age > timedelta(days=staleness_days):
            result.stale_providers.append(
                f"{provider} (probed {age.days} days ago; threshold "
                f"{staleness_days})"
            )

    for alias, entry in sorted((config.get("models") or {}).items()):
        if not isinstance(entry, dict):
            continue
        provider = entry.get("provider")
        model_id = entry.get("model_id")
        # Routable = "this id can reach the wire", which is NOT `is_enabled`
        # alone. Default TRUE for the flag, matching every other reader in the
        # package (models.py, utils.py, verification.py) and the registry's own
        # "omit to accept default" convention; then OR in the routing pins,
        # because `pick_model` honours a `task_type_overrides` pin without
        # checking the flag when no provider exclusion applies. Both defaults
        # lean the same way on purpose: this gate must never UNDER-report.
        routable = bool(entry.get("is_enabled", True)) or alias in pinned
        if not provider or not model_id:
            result.fatal.append(
                f"registry entry {alias!r} is missing provider and/or model_id"
            )
            continue
        if provider not in ENUMERATED_PROVIDERS:
            # Not silently skipped: an entry nobody can check is itself a hole,
            # so it is reported at the severity of its own routability.
            finding = DriftFinding(
                alias=alias, provider=provider, model_id=model_id,
                routable=routable,
                reason=(
                    f"provider {provider!r} has no enumeration support in this "
                    "module, so its ids cannot be verified"
                ),
            )
            (result.routable_drift if routable else result.identity_drift).append(
                finding
            )
            continue

        block = provider_blocks.get(provider)
        if not block or not isinstance(block.get("models"), list):
            # Fatal, not drift: we do not know what this provider offers, so we
            # cannot claim the id is missing. Treating "never enumerated" as
            # "not offered" would report every model of that provider as drift.
            result.fatal.append(
                f"provider {provider!r} has never been enumerated; run "
                "`python -m ai_router.model_inventory --refresh`"
            )
            continue

        result.checked += 1
        if model_id in set(block["models"]):
            continue
        finding = DriftFinding(
            alias=alias, provider=provider, model_id=model_id, routable=routable,
            reason=f"not offered by {provider} (snapshot {block.get('probed_at')})",
        )
        (result.routable_drift if routable else result.identity_drift).append(finding)

    # Fatals are per-provider, but the loop above appends one per affected
    # registry entry. Collapse so the operator reads each cause once.
    result.fatal = sorted(set(result.fatal))
    return result


def render_check(result: CheckResult) -> list[str]:
    """Operator-facing report lines. ASCII-only (Windows cp1252 consoles)."""
    lines: list[str] = []
    for message in result.fatal:
        lines.append(f"[x] FATAL: {message}")
    for message in result.stale_providers:
        lines.append(f"[~] STALE: {message}")
    if result.routable_drift:
        lines.append(
            f"[x] DRIFT: {len(result.routable_drift)} routable registry "
            "entry/entries name a model_id the provider does not offer -- "
            "these ids can be put on the wire:"
        )
        lines.extend(f.render() for f in result.routable_drift)
    if result.identity_drift:
        lines.append(
            f"[x] DRIFT: {len(result.identity_drift)} identity-only "
            "entry/entries name a model_id the provider does not offer. "
            "Nothing routes to these, so they are not urgent -- but the id is "
            "still wrong, or the record belongs somewhere other than the "
            "model registry. Correct it or move it; it does not get to sit "
            "here indefinitely:"
        )
        lines.extend(f.render() for f in result.identity_drift)
    if result.ok:
        lines.append(
            f"[ ] OK: all {result.checked} configured model_id(s) are offered "
            "by their provider."
        )
    return lines


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _resolve_config(path: Optional[str]) -> dict:
    return load_config(path)


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m ai_router.model_inventory",
        description=(
            "Enumerate the model ids each provider offers (--refresh), and "
            "check router-config.yaml's registry against that snapshot "
            "(--check). --check never touches the network."
        ),
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument(
        "--refresh", action="store_true",
        help="Probe every provider's model-list endpoint and rewrite the lockfile.",
    )
    mode.add_argument(
        "--check", action="store_true",
        help="Compare router-config.yaml's model_ids against the lockfile.",
    )
    parser.add_argument(
        "--lockfile", default=str(DEFAULT_LOCKFILE_PATH),
        help=f"Lockfile path (default: {DEFAULT_LOCKFILE_PATH}).",
    )
    parser.add_argument(
        "--config", default=None,
        help="Explicit router-config.yaml path (default: normal resolution).",
    )
    args = parser.parse_args(argv)

    try:
        config = _resolve_config(args.config)
    except Exception as exc:  # config errors are already descriptive
        print(f"[x] FATAL: cannot load router-config.yaml: {exc}", file=sys.stderr)
        return EXIT_FATAL

    if args.refresh:
        payload, failures = refresh_inventory(config, lockfile_path=args.lockfile)
        for provider, block in sorted((payload.get("providers") or {}).items()):
            print(
                f"[ ] {provider}: {block.get('model_count')} model(s), probed "
                f"{block.get('probed_at')}"
            )
        print(f"Wrote {args.lockfile}")
        for failure in failures:
            print(f"[x] NOT REFRESHED: {failure}", file=sys.stderr)
        if failures:
            print(
                f"[x] {len(failures)} provider(s) were not refreshed; their "
                "previous snapshot (if any) is unchanged.",
                file=sys.stderr,
            )
            return EXIT_DRIFT
        return EXIT_OK

    try:
        lockfile = load_lockfile(args.lockfile)
    except InventoryError as exc:
        print(f"[x] FATAL: {exc}", file=sys.stderr)
        print(
            "    Run `python -m ai_router.model_inventory --refresh` to create it.",
            file=sys.stderr,
        )
        return EXIT_FATAL

    result = check_registry(config, lockfile)
    stream = sys.stdout if result.ok else sys.stderr
    for line in render_check(result):
        print(line, file=stream)
    if result.fatal:
        return EXIT_FATAL
    return EXIT_OK if result.ok else EXIT_DRIFT


if __name__ == "__main__":
    raise SystemExit(main())
