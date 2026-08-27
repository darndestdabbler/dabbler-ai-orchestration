"""Model discovery on the direct-API path: enumeration, freshness, drift.

**A role never depends on the model names it happens to list**, so something
has to say what currently exists. On the seat that is an empirical probe,
because the Copilot CLI has no list-models command; on the direct-API path
each vendor publishes a models endpoint, so the framework reads it.

**Enumeration is a metadata request and bills no tokens on any of the three
vendors.** That is the whole reason the default cadence is 24 hours: freshness
is free here, so the knob is a preference rather than a budget control. The
seat keeps its probe-based refresh precisely because a probe is not free.

Three rules shape everything below.

**A field a vendor stops reporting degrades to unknown, never to
unsupported.** Vendors report unequally already — one returns token limits and
generation methods, another a display name and a creation date, a third little
beyond an identifier — and a hard capability filter would disqualify every
model from the quietest vendor and end cross-vendor verification by accident.
Unknown is written by omission, a fresh unknown never overwrites a known
value, and nothing here filters a candidate on metadata.

**The framework reports the gap between the record and the roles; it does not
close it silently.** Enumeration keeps the record fresh on its own, but
ranking one model above another is a judgment metadata cannot make: newest is
not most capable, and no reported field separates a flagship from a mini. So
the gap comes out as a diff and the diff names the invocation that acts on it.

**Refresh never happens inside a session.** A session that changes its own
verifier pool while running has edited the conditions of its own review, so
``enumerate`` refuses while any session is in flight. Staleness, by contrast,
only ever warns: a stale record with confirmed entries still verifies
correctly, and turning a maintenance signal into an outage is how maintenance
signals get suppressed.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import time
import tomllib
from dataclasses import dataclass, field, replace
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from .lockfile import (
    digest_text,
    provenance,
    render_document,
    set_or_drop,
    utc_now,
    write_document,
    writer_id,
)
from .secret_resolver import resolve_secret

RECORD_SOURCE = "vendor-enumeration"

# Provider is first-party here, unlike the seat, where it can only be guessed
# from a name prefix. The stamp travels with the entry so the two records are
# never read as equally authoritative about the field a same-provider
# exclusion turns on.
PROVIDER_SOURCE_ENUMERATION = "vendor-enumeration"

ENUMERATE_COMMAND = "python -m ai_router.discovery enumerate"
DRIFT_COMMAND = "python -m ai_router.discovery drift"
SEAT_REFRESH_COMMAND = "python -m ai_router.transports.copilot refresh"

DEFAULT_RECORD_FILENAME = ".dabbler/api-models.lock"
DEFAULT_MAX_AGE_HOURS = 24.0
# The seat is not on the same clock and must not be: a probe costs premium
# requests, so a 24-hour warning on the seat catalog would fire every day of
# a month for a refresh nobody should run daily -- and a warning that is
# always on is a warning that is always ignored.
DEFAULT_SEAT_MAX_AGE_HOURS = 720.0

RECORD_API = "api-enumeration"
RECORD_SEAT = "seat-catalog"

ERROR_NO_API_KEY = "no-api-key"
ERROR_PROVIDER_DISABLED = "provider-disabled"
ERROR_PROVIDER_UNSUPPORTED = "no-enumeration-adapter"

# A vendor that paginated forever would turn a free metadata call into an
# unbounded loop; every endpoint here returns its whole catalog well inside
# one page at this size.
_PAGE_SIZE = 1000
_MAX_PAGES = 20

_TIMESTAMP_FORMAT = "%Y-%m-%dT%H:%M:%SZ"


# --- The record -------------------------------------------------------------

@dataclass
class ApiModelEntry:
    """One model a vendor reported, with everything it did not report absent.

    ``None`` and ``()`` mean the vendor said nothing, which is unknown. They
    never mean the model lacks the capability, and no code path may read them
    that way.
    """

    id: str
    provider: str
    provider_source: str = PROVIDER_SOURCE_ENUMERATION
    display_name: Optional[str] = None
    created_at: Optional[str] = None
    max_context_tokens: Optional[int] = None
    max_output_tokens: Optional[int] = None
    capabilities: tuple = ()
    enumerated_at: Optional[str] = None
    # Keys this version does not model, in file order, so a writer never
    # silently drops what a future version wrote.
    raw: dict = field(default_factory=dict, repr=False, compare=False)


@dataclass
class ProviderStatus:
    """What the last enumeration attempt against one vendor did.

    A failed attempt annotates rather than empties: an endpoint that timed out
    is not a vendor that withdrew its catalog, and deleting the models would
    turn a network blip into a drift report claiming every role names a model
    that does not exist.
    """

    name: str
    enumerated_at: Optional[str] = None
    model_count: Optional[int] = None
    last_error: Optional[str] = None
    last_error_at: Optional[str] = None
    raw: dict = field(default_factory=dict, repr=False, compare=False)


@dataclass
class RecordMeta:
    key_set_id: str
    source: str = RECORD_SOURCE
    enumerated_at: Optional[str] = None
    written_by: Optional[str] = None
    written_at: Optional[str] = None
    content_digest: Optional[str] = None
    raw: dict = field(default_factory=dict, repr=False, compare=False)


@dataclass
class ModelRecord:
    meta: RecordMeta
    providers: list = field(default_factory=list)
    models: list = field(default_factory=list)

    def provider_of(self, model_id: str) -> Optional[str]:
        for entry in self.models:
            if entry.id == model_id:
                return entry.provider
        return None


def empty_record(key_set_id: str = "default") -> ModelRecord:
    return ModelRecord(meta=RecordMeta(key_set_id=key_set_id))


def _optional_str(value) -> Optional[str]:
    return value if isinstance(value, str) and value else None


def _optional_int(value) -> Optional[int]:
    """A token limit off the wire, or ``None`` for unknown.

    A bool, a string, a negative or a non-finite value is not a limit, and
    unknown is the honest answer for those -- never zero, which would read as
    a model that accepts no input.
    """
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if value <= 0 or not math.isfinite(value):
        return None
    return int(value)


def _string_tuple(value) -> tuple:
    if not isinstance(value, (list, tuple)):
        return ()
    return tuple(item for item in value if isinstance(item, str) and item)


def _optional_count(value) -> Optional[int]:
    """A count off the wire, or ``None`` for unknown.

    Zero is a measurement here and not an absence: a vendor that answered and
    listed nothing is a fact worth keeping, and folding it into unknown would
    make an empty catalog indistinguishable from an endpoint never read.
    """
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if value < 0 or not math.isfinite(value):
        return None
    return int(value)


def load_record(path) -> ModelRecord:
    """Read an enumeration record (TOML) via stdlib ``tomllib``."""
    with open(path, "rb") as f:
        data = tomllib.load(f)
    meta_raw = data.get("meta")
    if not isinstance(meta_raw, dict):
        raise ValueError(f"discovery record {path!r} has no [meta] table")
    if "key_set_id" not in meta_raw:
        raise ValueError(
            "discovery record [meta] is missing required key 'key_set_id'"
        )
    meta = RecordMeta(
        key_set_id=str(meta_raw["key_set_id"]),
        source=str(meta_raw.get("source", RECORD_SOURCE)),
        enumerated_at=_optional_str(meta_raw.get("enumerated_at")),
        written_by=_optional_str(meta_raw.get("written_by")),
        written_at=_optional_str(meta_raw.get("written_at")),
        content_digest=_optional_str(meta_raw.get("content_digest")),
        raw=dict(meta_raw),
    )
    providers = []
    for pd in data.get("providers", []):
        if not isinstance(pd, dict) or "name" not in pd:
            raise ValueError(
                f"discovery record has a malformed [[providers]] entry: {pd!r}"
            )
        providers.append(ProviderStatus(
            name=str(pd["name"]),
            enumerated_at=_optional_str(pd.get("enumerated_at")),
            model_count=_optional_count(pd.get("model_count")),
            last_error=_optional_str(pd.get("last_error")),
            last_error_at=_optional_str(pd.get("last_error_at")),
            raw=dict(pd),
        ))
    models = []
    for md in data.get("models", []):
        if not isinstance(md, dict) or "id" not in md:
            raise ValueError(
                f"discovery record has a malformed [[models]] entry: {md!r}"
            )
        models.append(ApiModelEntry(
            id=str(md["id"]),
            provider=str(md.get("provider", "")),
            provider_source=str(
                md.get("provider_source", PROVIDER_SOURCE_ENUMERATION)
            ),
            display_name=_optional_str(md.get("display_name")),
            created_at=_optional_str(md.get("created_at")),
            max_context_tokens=_optional_int(md.get("max_context_tokens")),
            max_output_tokens=_optional_int(md.get("max_output_tokens")),
            capabilities=_string_tuple(md.get("capabilities")),
            enumerated_at=_optional_str(md.get("enumerated_at")),
            raw=dict(md),
        ))
    return ModelRecord(meta=meta, providers=providers, models=models)


def _meta_mapping(meta: RecordMeta) -> dict:
    out = dict(meta.raw)
    out["key_set_id"] = meta.key_set_id
    out["source"] = meta.source
    set_or_drop(out, "enumerated_at", meta.enumerated_at)
    set_or_drop(out, "written_by", meta.written_by)
    set_or_drop(out, "written_at", meta.written_at)
    set_or_drop(out, "content_digest", meta.content_digest)
    return out


def _provider_mapping(status: ProviderStatus) -> dict:
    out = dict(status.raw)
    out["name"] = status.name
    set_or_drop(out, "enumerated_at", status.enumerated_at)
    set_or_drop(out, "model_count", status.model_count)
    set_or_drop(out, "last_error", status.last_error)
    set_or_drop(out, "last_error_at", status.last_error_at)
    return out


def _entry_mapping(entry: ApiModelEntry) -> dict:
    # Starting from the entry as read keeps unmodelled keys in their original
    # position, so an entry nothing touched re-renders byte for byte.
    out = dict(entry.raw)
    out["id"] = entry.id
    set_or_drop(out, "provider", entry.provider or None)
    set_or_drop(out, "provider_source", entry.provider_source or None)
    set_or_drop(out, "display_name", entry.display_name)
    set_or_drop(out, "created_at", entry.created_at)
    set_or_drop(out, "max_context_tokens", entry.max_context_tokens)
    set_or_drop(out, "max_output_tokens", entry.max_output_tokens)
    set_or_drop(out, "capabilities", list(entry.capabilities) or None)
    set_or_drop(out, "enumerated_at", entry.enumerated_at)
    return out


def dumps_record(record: ModelRecord) -> str:
    tables = [("[meta]", _meta_mapping(record.meta))]
    tables.extend(
        ("[[providers]]", _provider_mapping(status))
        for status in record.providers
    )
    tables.extend(
        ("[[models]]", _entry_mapping(entry)) for entry in record.models
    )
    return render_document(tables)


def record_digest(record: ModelRecord) -> str:
    """SHA-256 over the record rendered with the digest key itself elided, so
    the same content digests the same whether or not it has been stamped."""
    unstamped = ModelRecord(
        meta=replace(record.meta, content_digest=None),
        providers=record.providers,
        models=record.models,
    )
    return digest_text(dumps_record(unstamped))


def stamp_record(record: ModelRecord, *, written_at=None) -> ModelRecord:
    meta = replace(
        record.meta,
        written_by=writer_id("ai_router.discovery"),
        written_at=written_at or utc_now(),
        content_digest=None,
    )
    unstamped = ModelRecord(
        meta=meta, providers=record.providers, models=record.models
    )
    return ModelRecord(
        meta=replace(meta, content_digest=record_digest(unstamped)),
        providers=record.providers,
        models=record.models,
    )


def record_provenance(record: ModelRecord) -> str:
    meta = record.meta
    return provenance(
        stored_digest=meta.content_digest,
        recomputed_digest=record_digest(record),
        written_by=meta.written_by,
        written_at=meta.written_at,
    )


def write_record(path, record: ModelRecord, *, written_at=None) -> ModelRecord:
    """Write the record, stamped. The sanctioned writer, and the only one:
    a record with no writer leaves hand-editing as the sole remedy for
    staleness, which destroys the empirical signal the file exists to carry."""
    stamped = stamp_record(record, written_at=written_at)
    write_document(path, dumps_record(stamped))
    return stamped


# --- Enumeration ------------------------------------------------------------

@dataclass(frozen=True)
class ProviderResult:
    provider: str
    entries: tuple = ()
    error: Optional[str] = None

    @property
    def ok(self) -> bool:
        return self.error is None


def _http_get(url, headers, params, timeout):
    import httpx

    with httpx.Client(timeout=timeout) as client:
        resp = client.get(url, headers=headers, params=params)
        resp.raise_for_status()
        return resp.json()


def _models_base(base_url: Optional[str], default: str) -> str:
    """The models endpoint's base, derived from the chat endpoint the provider
    block already names.

    A provider declares one base URL and it points at the operation the router
    dispatches with; enumeration is a sibling of that operation, so a trailing
    operation segment is dropped rather than a second URL being configured and
    left to drift out of agreement with the first.
    """
    base = (base_url or default).rstrip("/")
    for suffix in ("/messages", "/responses", "/chat/completions"):
        if base.endswith(suffix):
            return base[: -len(suffix)]
    return base


def _epoch_to_iso(value) -> Optional[str]:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if value <= 0 or not math.isfinite(value):
        return None
    return time.strftime(_TIMESTAMP_FORMAT, time.gmtime(value))


def _enumerate_anthropic(cfg, api_key, get, timeout) -> list:
    base = _models_base(cfg.get("base_url"), "https://api.anthropic.com/v1")
    headers = {
        "x-api-key": api_key,
        "anthropic-version": cfg.get("api_version", "2023-06-01"),
    }
    entries: list = []
    params = {"limit": _PAGE_SIZE}
    for _ in range(_MAX_PAGES):
        payload = get(f"{base}/models", headers, params, timeout)
        for item in (payload.get("data") or []):
            model_id = _optional_str((item or {}).get("id"))
            if not model_id:
                continue
            entries.append(ApiModelEntry(
                id=model_id,
                provider="anthropic",
                display_name=_optional_str(item.get("display_name")),
                created_at=_optional_str(item.get("created_at")),
            ))
        last_id = _optional_str(payload.get("last_id"))
        if not payload.get("has_more") or not last_id:
            break
        params = {"limit": _PAGE_SIZE, "after_id": last_id}
    return entries


def _enumerate_openai(cfg, api_key, get, timeout) -> list:
    base = _models_base(cfg.get("base_url"), "https://api.openai.com/v1")
    headers = {"Authorization": f"Bearer {api_key}"}
    payload = get(f"{base}/models", headers, None, timeout)
    entries: list = []
    for item in (payload.get("data") or []):
        model_id = _optional_str((item or {}).get("id"))
        if not model_id:
            continue
        entries.append(ApiModelEntry(
            id=model_id,
            provider="openai",
            created_at=_epoch_to_iso(item.get("created")),
        ))
    return entries


def _enumerate_google(cfg, api_key, get, timeout) -> list:
    base = _models_base(
        cfg.get("base_url"), "https://generativelanguage.googleapis.com/v1beta"
    )
    # The key travels in a header and never the query string: an exception
    # renders the full URL into operator-visible output, and a `?key=` URL
    # would leak a live credential into a log.
    headers = {"x-goog-api-key": api_key}
    entries: list = []
    params = {"pageSize": _PAGE_SIZE}
    for _ in range(_MAX_PAGES):
        payload = get(f"{base}/models", headers, params, timeout)
        for item in (payload.get("models") or []):
            name = _optional_str((item or {}).get("name"))
            if not name:
                continue
            entries.append(ApiModelEntry(
                id=name.split("/", 1)[1] if name.startswith("models/") else name,
                provider="google",
                display_name=_optional_str(item.get("displayName")),
                max_context_tokens=_optional_int(item.get("inputTokenLimit")),
                max_output_tokens=_optional_int(item.get("outputTokenLimit")),
                capabilities=_string_tuple(
                    item.get("supportedGenerationMethods")
                ),
            ))
        token = _optional_str(payload.get("nextPageToken"))
        if not token:
            break
        params = {"pageSize": _PAGE_SIZE, "pageToken": token}
    return entries


_ADAPTERS = {
    "anthropic": _enumerate_anthropic,
    "openai": _enumerate_openai,
    "google": _enumerate_google,
}


def enumerate_provider(config: dict, name: str, *, get=None) -> ProviderResult:
    """Read one vendor's models endpoint. Never raises for an operational
    failure -- the failure is the result, and the merge decides what it does
    to the record."""
    cfg = (config.get("providers") or {}).get(name)
    if not isinstance(cfg, dict) or not cfg.get("enabled", True):
        return ProviderResult(name, error=ERROR_PROVIDER_DISABLED)
    adapter = _ADAPTERS.get(name)
    if adapter is None:
        return ProviderResult(name, error=ERROR_PROVIDER_UNSUPPORTED)
    api_key = resolve_secret(cfg.get("api_key_env") or "")
    if not api_key:
        return ProviderResult(name, error=ERROR_NO_API_KEY)
    try:
        entries = adapter(
            cfg, api_key, get or _http_get, cfg.get("timeout_seconds", 60)
        )
    except Exception as exc:  # operational, not programmer, error
        # The class name and never the message: a vendor error body can echo
        # request headers, and this string is written to a committed record.
        return ProviderResult(name, error=type(exc).__name__)
    return ProviderResult(name, entries=tuple(entries))


def enumerate_all(config: dict, *, providers=None, get=None) -> list:
    names = list(providers) if providers else sorted(
        (config.get("providers") or {}).keys()
    )
    return [enumerate_provider(config, name, get=get) for name in names]


def _merge_entry(prior: ApiModelEntry, fresh: ApiModelEntry) -> ApiModelEntry:
    """Fresh wins where fresh knows something; prior survives where it does
    not. A vendor that stopped reporting a field leaves the last known value
    standing rather than blanking it -- and either way the value is never read
    as an absence of capability."""
    return replace(
        fresh,
        raw=prior.raw,
        display_name=fresh.display_name or prior.display_name,
        created_at=fresh.created_at or prior.created_at,
        max_context_tokens=(
            fresh.max_context_tokens
            if fresh.max_context_tokens is not None
            else prior.max_context_tokens
        ),
        max_output_tokens=(
            fresh.max_output_tokens
            if fresh.max_output_tokens is not None
            else prior.max_output_tokens
        ),
        capabilities=fresh.capabilities or prior.capabilities,
    )


def merge_record(
    record: ModelRecord, results, *, enumerated_at: Optional[str] = None
) -> ModelRecord:
    """Fold enumeration *results* into *record*, touching nothing else.

    A vendor that answered is authoritative about which of its models exist,
    so its list is replaced -- a model the endpoint no longer returns leaves
    the record and shows up in the drift diff, which is where a role naming a
    withdrawn model is supposed to become visible. A vendor that failed keeps
    everything it had and gains the failure beside it.
    """
    stamp = enumerated_at or utc_now()
    results = list(results)
    answered = {r.provider for r in results if r.ok}

    models = [
        entry for entry in record.models if entry.provider not in answered
    ]
    prior_by_key = {
        (entry.provider, entry.id): entry for entry in record.models
    }
    for result in results:
        if not result.ok:
            continue
        for fresh in result.entries:
            fresh = replace(fresh, enumerated_at=stamp)
            prior = prior_by_key.get((fresh.provider, fresh.id))
            models.append(_merge_entry(prior, fresh) if prior else fresh)

    statuses = {status.name: status for status in record.providers}
    for result in results:
        prior = statuses.get(result.provider) or ProviderStatus(
            name=result.provider
        )
        if result.ok:
            statuses[result.provider] = replace(
                prior,
                enumerated_at=stamp,
                model_count=len(result.entries),
                last_error=None,
                last_error_at=None,
            )
        else:
            statuses[result.provider] = replace(
                prior, last_error=result.error, last_error_at=stamp
            )

    meta = replace(
        record.meta,
        enumerated_at=stamp if answered else record.meta.enumerated_at,
    )
    return ModelRecord(
        meta=meta,
        providers=[statuses[name] for name in sorted(statuses)],
        models=models,
    )


# --- Configuration ----------------------------------------------------------

def discovery_settings(config: dict) -> dict:
    block = config.get("discovery")
    block = block if isinstance(block, dict) else {}
    return {
        "key_set_id": str(block.get("key_set_id") or "default"),
        "record": str(block.get("record") or DEFAULT_RECORD_FILENAME),
        "max_age_hours": float(
            block.get("max_age_hours", DEFAULT_MAX_AGE_HOURS)
        ),
        "seat_max_age_hours": float(
            block.get("seat_max_age_hours", DEFAULT_SEAT_MAX_AGE_HOURS)
        ),
    }


def _resolve_relative(config: dict, value: str) -> Path:
    """A relative record path resolves against the project, never against the
    package.

    The seat catalog ships because it is the operator's seat and belongs to
    the distribution; this record is derived from whichever key set happens to
    be present, so a build that swept it up would publish one checkout's
    credentials-shaped view of the world to every consumer. Writing outside
    the package tree makes that impossible rather than merely discouraged.
    """
    path = Path(value)
    if path.is_absolute():
        return path
    from .config import project_root

    root = project_root()
    return (Path(root) if root else Path.cwd()) / path


def resolve_record_path(config: dict) -> Path:
    """The record ``discovery.record`` names, resolved against the project
    that named it -- one resolution, so a reader and a writer cannot disagree
    about which file they mean."""
    return _resolve_relative(config, discovery_settings(config)["record"])


# --- Freshness --------------------------------------------------------------

def _parse_timestamp(value) -> Optional[datetime]:
    text = _optional_str(value)
    if not text:
        return None
    try:
        parsed = datetime.strptime(text, _TIMESTAMP_FORMAT)
    except ValueError:
        try:
            parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        except ValueError:
            return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


@dataclass(frozen=True)
class FreshnessRow:
    record: str
    path: str
    threshold_hours: float
    command: str
    present: bool = False
    dated_at: Optional[str] = None
    age_hours: Optional[float] = None
    # Per-vendor problems the record-level date cannot express. A record is
    # only as current as its stalest enabled vendor, and one vendor's success
    # must never date the whole file.
    notes: tuple = ()

    @property
    def stale(self) -> bool:
        """Absent, undated, overdue and partial are all stale, because all
        four mean the same thing to a reader: the record does not currently
        establish what exists."""
        return (
            not self.present
            or self.age_hours is None
            or self.age_hours > self.threshold_hours
            or bool(self.notes)
        )

    def message(self) -> str:
        if not self.present:
            head = f"{self.record}: no record at {self.path}."
        elif self.age_hours is None:
            head = (
                f"{self.record}: {self.path} carries no readable date "
                f"({self.dated_at!r}), so its age cannot be established."
            )
        else:
            head = (
                f"{self.record}: {self.age_hours:.0f}h old "
                f"(threshold {self.threshold_hours:.0f}h), oldest entry "
                f"dated {self.dated_at}."
            )
        detail = "".join(f" {note}." for note in self.notes)
        return f"{head}{detail} Run: {self.command}"


def _row(record, path, threshold, command, dated_at, present, now, notes=()):
    parsed = _parse_timestamp(dated_at) if present else None
    age = (
        (now - parsed).total_seconds() / 3600.0 if parsed is not None else None
    )
    return FreshnessRow(
        record=record,
        path=str(path),
        threshold_hours=threshold,
        command=command,
        present=present,
        dated_at=_optional_str(dated_at),
        age_hours=age,
        notes=tuple(notes),
    )


def enumerable_providers(config: dict) -> list:
    """Enabled providers this framework can actually enumerate.

    A provider with no adapter is not a hole in the record; a provider that is
    enabled and has an adapter and is missing from the record is.
    """
    return sorted(
        name
        for name, cfg in (config.get("providers") or {}).items()
        if isinstance(cfg, dict)
        and cfg.get("enabled", True)
        and name in _ADAPTERS
    )


def _api_freshness(config, path, threshold, now) -> FreshnessRow:
    """The API record aged against its stalest enabled vendor.

    ``meta.enumerated_at`` advances whenever any vendor answers, so reading it
    alone would report the whole record fresh while one vendor's key is
    expired and its entries are weeks old. Partial failure is an expected
    operational path here -- three endpoints this project does not control --
    so freshness is taken from the oldest per-vendor stamp and every vendor
    that is missing or last failed is named.
    """
    if not path.exists():
        return _row(RECORD_API, path, threshold, ENUMERATE_COMMAND,
                    None, False, now)
    try:
        record = load_record(path)
    except (OSError, ValueError, tomllib.TOMLDecodeError):
        # An unreadable record is not a fresh one, and it is also not an
        # outage: the row says so and the invocation that rewrites it is
        # named right there.
        return _row(RECORD_API, path, threshold, ENUMERATE_COMMAND,
                    None, True, now)

    statuses = {status.name: status for status in record.providers}
    expected = enumerable_providers(config)
    oldest, notes = None, []
    for name in expected:
        status = statuses.get(name)
        if status is None or not status.enumerated_at:
            notes.append(f"{name} has never been enumerated")
            continue
        if status.last_error:
            notes.append(
                f"{name}'s last attempt failed ({status.last_error}), so its "
                "entries are older than this date"
            )
        parsed = _parse_timestamp(status.enumerated_at)
        if parsed is None:
            notes.append(f"{name} carries an unreadable date")
            continue
        if oldest is None or parsed < oldest[0]:
            oldest = (parsed, status.enumerated_at)
    # With no enumerable provider configured there is no per-vendor evidence
    # to be conservative about, so the record-level date is all there is.
    dated_at = oldest[1] if oldest else (
        None if expected else record.meta.enumerated_at
    )
    return _row(RECORD_API, path, threshold, ENUMERATE_COMMAND,
                dated_at, True, now, notes)


def check_freshness(config: dict, *, now: Optional[datetime] = None) -> list:
    """Both records' ages against their thresholds.

    One check over both, because there is one question -- does the framework
    currently know what exists -- and answering it in two places is how the
    two answers come to disagree. This function warns and never blocks: it
    returns rows, raises nothing, and calls no vendor.
    """
    now = now or datetime.now(timezone.utc)
    settings = discovery_settings(config)
    rows = [_api_freshness(
        config, resolve_record_path(config), settings["max_age_hours"], now
    )]

    seat_path = "(no transports.copilot-cli.lockfile configured)"
    seat_present = False
    seat_dated = None
    try:
        from .transports.copilot import load_catalog, resolve_lockfile_path

        resolved = resolve_lockfile_path(config)
        seat_path = resolved
        seat_present = resolved.exists()
        if seat_present:
            seat_dated = load_catalog(resolved).meta.probed_at
    except (OSError, ValueError, tomllib.TOMLDecodeError):
        # An unconfigured or unreadable seat catalog is reported as a stale
        # record, which is what it is. It is never an error: this check has
        # to be safe to run on a machine that has no seat at all.
        pass
    rows.append(_row(
        RECORD_SEAT, seat_path, settings["seat_max_age_hours"],
        SEAT_REFRESH_COMMAND, seat_dated, seat_present, now,
    ))
    return rows


def freshness_warnings(config: dict, *, now: Optional[datetime] = None) -> list:
    """The warning lines for the stale records, and nothing for the fresh
    ones."""
    return [
        f"discovery: {row.message()}"
        for row in check_freshness(config, now=now)
        if row.stale
    ]


# --- Drift ------------------------------------------------------------------

@dataclass(frozen=True)
class Drift:
    unnamed: tuple = ()
    unavailable: tuple = ()
    freshness: tuple = ()


def _role_names(config: dict) -> dict:
    """``model id -> the roles that name it``, over every role's preference
    order."""
    out: dict = {}
    for role, block in (config.get("roles") or {}).items():
        if not isinstance(block, dict):
            continue
        for model_id in (block.get("prefer") or []):
            out.setdefault(str(model_id), []).append(str(role))
    return out


def _known_models(config: dict) -> dict:
    """``model id -> the records that carry it``, over both records.

    Both, because a role's preference order names ids as each transport puts
    them on the wire: a name that exists only on the seat is inert on the API
    path rather than missing, and reporting it as missing would train the
    reader to ignore the report.
    """
    known: dict = {}

    record_path = resolve_record_path(config)
    if record_path.exists():
        try:
            for entry in load_record(record_path).models:
                known.setdefault(entry.id, []).append(RECORD_API)
        except (OSError, ValueError, tomllib.TOMLDecodeError):
            pass

    try:
        from .transports.copilot import load_catalog, resolve_lockfile_path

        seat_path = resolve_lockfile_path(config)
        if seat_path.exists():
            for entry in load_catalog(seat_path).confirmed_models():
                known.setdefault(entry.id, []).append(RECORD_SEAT)
    except (OSError, ValueError, tomllib.TOMLDecodeError):
        pass
    return known


def compute_drift(config: dict, *, now: Optional[datetime] = None) -> Drift:
    """The §5.c diff: what exists and is unranked, what is ranked and does not
    exist, and how old the evidence for both statements is.

    Reported, never closed. Ranking one model above another is a judgment
    metadata cannot make, so this produces the gap and names the invocation
    that acts on it; a model may propose an ordering, enumeration or a probe
    confirms it, and the writer records it. Nothing here enables a model.
    """
    roles = _role_names(config)
    known = _known_models(config)

    unnamed = tuple(
        (model_id, ",".join(sorted(set(records))))
        for model_id, records in sorted(known.items())
        if model_id not in roles
    )
    unavailable = tuple(
        (model_id, ",".join(sorted(set(role_list))))
        for model_id, role_list in sorted(roles.items())
        if model_id not in known
    )
    return Drift(
        unnamed=unnamed,
        unavailable=unavailable,
        freshness=tuple(check_freshness(config, now=now)),
    )


def format_drift(drift: Drift) -> str:
    lines = ["drift: record against roles"]
    lines.append(
        f"  named in a role, in no record ({len(drift.unavailable)}) -- "
        "these roles fall through to whatever else survives:"
    )
    for model_id, roles in drift.unavailable:
        lines.append(f"    {model_id}  [{roles}]")
    if not drift.unavailable:
        lines.append("    (none)")
    lines.append(
        f"  in a record, named in no role ({len(drift.unnamed)}) -- "
        "these still qualify and simply sort last:"
    )
    for model_id, records in drift.unnamed:
        lines.append(f"    {model_id}  [{records}]")
    if not drift.unnamed:
        lines.append("    (none)")
    lines.append("  record age:")
    for row in drift.freshness:
        lines.append(f"    {'STALE' if row.stale else 'fresh'}  {row.message()}")
    return "\n".join(lines)


# --- Refresh never happens inside a session ---------------------------------

def sessions_in_flight(scan_root=None) -> list:
    """Session sets carrying a session that has started and not closed.

    Read from the machine-written state and from nothing else -- the presence
    of a lock file or a run directory is not the record.
    """
    from .session import default_scan_root

    root = Path(scan_root or default_scan_root())
    in_flight = []
    if not root.is_dir():
        return in_flight
    for set_dir in sorted(p for p in root.iterdir() if p.is_dir()):
        state_path = set_dir / "session-state.json"
        if not state_path.is_file():
            continue
        try:
            state = json.loads(state_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        sessions = state.get("sessions")
        numbers = [
            s.get("number") for s in sessions
            if isinstance(s, dict) and s.get("status") == "in-progress"
        ] if isinstance(sessions, list) else []
        if state.get("currentSession") is not None:
            numbers.append(state["currentSession"])
        for number in sorted({n for n in numbers if n is not None}):
            in_flight.append(f"{set_dir.name} session {number}")
    return in_flight


# --- CLI --------------------------------------------------------------------

def cmd_enumerate(config: dict, *, dry_run: bool, out) -> int:
    in_flight = sessions_in_flight()
    if in_flight and not dry_run:
        print(
            "enumerate: refused -- a session is in flight ("
            + "; ".join(in_flight)
            + "). Discovery runs between sessions: a session that changes "
            "its own verifier pool while running has edited the conditions "
            "of its own review.",
            file=sys.stderr,
        )
        return 2
    path = resolve_record_path(config)
    record = load_record(path) if path.exists() else empty_record(
        discovery_settings(config)["key_set_id"]
    )
    if dry_run:
        print(f"enumerate: would read {len(_ADAPTERS)} vendor endpoint(s) "
              f"and write {path}", file=out)
        for row in check_freshness(config):
            print(f"  {'STALE' if row.stale else 'fresh'}  {row.message()}",
                  file=out)
        return 0
    results = enumerate_all(config)
    merged = merge_record(record, results)
    write_record(path, merged)
    for result in results:
        detail = (
            f"{len(result.entries)} model(s)" if result.ok
            else f"FAILED ({result.error}); prior entries kept"
        )
        print(f"  {result.provider}: {detail}", file=out)
    print(
        f"enumerate: {len(merged.models)} model(s) recorded in {path}. "
        "No tokens were billed: a models endpoint is a metadata request.",
        file=out,
    )
    return 0


def cmd_status(config: dict, *, out) -> int:
    rows = check_freshness(config)
    for row in rows:
        print(f"{'STALE' if row.stale else 'fresh'}  {row.message()}", file=out)
    # Never blocks: a stale record with confirmed entries still verifies
    # correctly, and an outage here would only teach people to suppress it.
    return 0


def cmd_drift(config: dict, *, out) -> int:
    print(format_drift(compute_drift(config)), file=out)
    return 0


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m ai_router.discovery",
        description="direct-API model discovery: enumeration, freshness, drift",
    )
    sub = parser.add_subparsers(dest="command", required=True)
    enum = sub.add_parser(
        "enumerate",
        help="read each vendor's models endpoint and write the record",
    )
    enum.add_argument(
        "--dry-run", action="store_true",
        help="report what would be read and written, and call nothing",
    )
    sub.add_parser("status", help="report both records' freshness")
    sub.add_parser("drift", help="the record-against-roles diff")
    args = parser.parse_args(argv)

    from .config import load_config

    config = load_config()
    if args.command == "enumerate":
        return cmd_enumerate(config, dry_run=args.dry_run, out=sys.stdout)
    if args.command == "drift":
        return cmd_drift(config, out=sys.stdout)
    return cmd_status(config, out=sys.stdout)


if __name__ == "__main__":
    raise SystemExit(main())
