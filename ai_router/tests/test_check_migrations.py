"""Tests for the detect-only schema-drift scanner — Set 050 Session 2.

Covers (per spec §S2 step 4):

- Clean repo (all v4) -> no drift, exit 0.
- Mixed v2 / v3 / v4 / missing-version -> drift classified per file.
- Unreadable / corrupt / non-object state file -> STATUS_UNREADABLE, never raises.
- "Ahead" file (schemaVersion > local) -> STATUS_AHEAD.
- Advisory manifest fetch: success, network failure + cache fallback,
  total failure (no cache), and --strict-manifest fail-loud.
- manifest.currentSchemaVersion == SESSION_STATE_SCHEMA_VERSION (the
  manifest-vs-constant CI guard, S2 half of carried risk #1).
- The bundled bulk-upgrade chain actually takes a GENUINE v2 file all the
  way to v4 (carried risk #2 — "v2-needs-both-migrators sequence"). This is
  the test that falsified the verdict's two-migrator enumeration; it asserts
  the corrected three-migrator chain.
- CLI main(): exit codes, --json, --exit-zero.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

import check_migrations as cm
from check_migrations import (
    STATUS_AHEAD,
    STATUS_CLEAN,
    STATUS_DRIFT,
    STATUS_UNREADABLE,
    DriftResult,
    detect_drift,
    fetch_manifest,
    summarize_drift,
)


# --- fixtures ----------------------------------------------------------------


def _write_set(root: Path, name: str, state: object) -> Path:
    set_dir = root / name
    set_dir.mkdir(parents=True, exist_ok=True)
    path = set_dir / "session-state.json"
    if isinstance(state, str):
        path.write_text(state, encoding="utf-8")  # raw (for corrupt cases)
    else:
        path.write_text(json.dumps(state), encoding="utf-8")
    return set_dir


def _v4(name: str) -> dict:
    return {
        "schemaVersion": 4,
        "sessionSetName": name,
        "status": "complete",
        "sessions": [{"number": 1, "title": "S1", "status": "complete"}],
    }


def _v3(name: str) -> dict:
    return {
        "schemaVersion": 3,
        "sessionSetName": name,
        "status": "in-progress",
        "currentSession": 1,
        "totalSessions": 2,
        "completedSessions": [],
        "sessions": [
            {"number": 1, "title": "S1", "status": "in-progress"},
            {"number": 2, "title": "S2", "status": "not-started"},
        ],
    }


def _genuine_v2(name: str) -> dict:
    """Explicit schemaVersion:2 with the legacy triple shape (no sessions[])."""
    return {
        "schemaVersion": 2,
        "sessionSetName": name,
        "status": "complete",
        "lifecycleState": "closed",
        "currentSession": 2,
        "totalSessions": 2,
        "completedSessions": [1, 2],
    }


# --- scan classification -----------------------------------------------------


def test_clean_repo_reports_no_drift(tmp_path):
    for i in range(3):
        _write_set(tmp_path, f"00{i}-set", _v4(f"00{i}-set"))
    results = detect_drift(str(tmp_path), target=4)
    assert {r.status for r in results} == {STATUS_CLEAN}
    assert len(results) == 3


def test_mixed_versions_classified(tmp_path):
    _write_set(tmp_path, "001-v4", _v4("001-v4"))
    _write_set(tmp_path, "002-v3", _v3("002-v3"))
    _write_set(tmp_path, "003-v2", _genuine_v2("003-v2"))
    # missing schemaVersion (hand-authored pre-canonical shape)
    _write_set(tmp_path, "004-nover", {"sessionSetName": "004-nover", "status": "x", "sessions": []})
    by_name = {Path(r.set_dir).name: r for r in detect_drift(str(tmp_path), target=4)}
    assert by_name["001-v4"].status == STATUS_CLEAN
    assert by_name["002-v3"].status == STATUS_DRIFT
    assert by_name["002-v3"].schema_version == 3
    assert by_name["003-v2"].status == STATUS_DRIFT
    assert by_name["003-v2"].schema_version == 2
    assert by_name["004-nover"].status == STATUS_DRIFT
    assert by_name["004-nover"].schema_version is None


def test_corrupt_and_non_object_files_are_unreadable_not_fatal(tmp_path):
    _write_set(tmp_path, "001-bad-json", "{ not valid json ,,,")
    _write_set(tmp_path, "002-not-object", "[1, 2, 3]")
    results = {Path(r.set_dir).name: r for r in detect_drift(str(tmp_path), target=4)}
    assert results["001-bad-json"].status == STATUS_UNREADABLE
    assert results["001-bad-json"].error
    assert results["002-not-object"].status == STATUS_UNREADABLE


def test_ahead_file_flagged(tmp_path):
    _write_set(tmp_path, "001-future", {"schemaVersion": 9, "sessionSetName": "x", "status": "y", "sessions": []})
    (r,) = detect_drift(str(tmp_path), target=4)
    assert r.status == STATUS_AHEAD
    assert r.schema_version == 9


def test_bool_schema_version_is_not_an_int(tmp_path):
    # JSON `true` must not be mistaken for schemaVersion==1 (bool is int subclass).
    _write_set(tmp_path, "001-booly", {"schemaVersion": True, "sessionSetName": "x", "status": "y"})
    (r,) = detect_drift(str(tmp_path), target=4)
    assert r.schema_version is None
    assert r.status == STATUS_DRIFT


def test_empty_scan_root(tmp_path):
    assert detect_drift(str(tmp_path), target=4) == []


# --- advisory manifest fetch -------------------------------------------------


def _manifest_bytes(version: int = 4) -> bytes:
    return json.dumps(
        {
            "manifestVersion": 1,
            "currentSchemaVersion": version,
            "minimumAiRouterVersion": "0.10.0",
        }
    ).encode("utf-8")


def test_manifest_fetch_success_refreshes_cache(tmp_path):
    cache = tmp_path / "cache.json"
    res = fetch_manifest(
        "https://example/schema-current.json",
        cache_path=cache,
        fetch_fn=lambda url: _manifest_bytes(5),
    )
    assert res.source == "network"
    assert res.manifest["currentSchemaVersion"] == 5
    assert res.warning is None
    assert cache.is_file()  # cache written for next offline run


def test_manifest_fetch_failure_falls_back_to_cache(tmp_path):
    cache = tmp_path / "cache.json"
    cache.write_bytes(_manifest_bytes(4))

    def boom(url):
        raise OSError("network down")

    res = fetch_manifest("https://example/x.json", cache_path=cache, fetch_fn=boom)
    assert res.source == "cache"
    assert res.manifest["currentSchemaVersion"] == 4
    assert "network down" in res.warning


def test_manifest_fetch_failure_no_cache_returns_none(tmp_path):
    def boom(url):
        raise OSError("offline")

    res = fetch_manifest("https://example/x.json", cache_path=tmp_path / "absent.json", fetch_fn=boom)
    assert res.source == "none"
    assert res.manifest is None
    assert res.warning


def test_strict_manifest_raises_on_failure(tmp_path):
    def boom(url):
        raise OSError("offline")

    with pytest.raises(RuntimeError):
        fetch_manifest(
            "https://example/x.json",
            strict=True,
            cache_path=tmp_path / "absent.json",
            fetch_fn=boom,
        )


# --- manifest == constant CI guard (carried risk #1, S2 half) ----------------


def test_shipped_manifest_matches_local_schema_constant():
    manifest = cm.load_local_manifest()
    assert manifest is not None, "docs/schema-current.json must exist in this repo"
    assert manifest["currentSchemaVersion"] == cm.LOCAL_SCHEMA_VERSION, (
        "docs/schema-current.json currentSchemaVersion has drifted from "
        "ai_router's SESSION_STATE_SCHEMA_VERSION. Bump them together in the "
        "same release commit (release-coupling discipline)."
    )


def test_shipped_manifest_migrator_ids_are_known():
    """Every symbolic migrator ID in the manifest resolves to a local module."""
    manifest = cm.load_local_manifest()
    assert manifest is not None
    ids = {m["id"] for m in manifest["migrators"]}
    assert ids <= set(cm.MIGRATOR_MODULES), (
        f"manifest migrator IDs {ids} not all in MIGRATOR_MODULES "
        f"{set(cm.MIGRATOR_MODULES)}"
    )
    # The ordered bulk chain only references known IDs too.
    assert set(cm.BULK_UPGRADE_MIGRATOR_IDS) <= set(cm.MIGRATOR_MODULES)


# --- carried risk #2: the bulk chain actually upgrades a GENUINE v2 set -------


def test_bulk_chain_upgrades_genuine_v2_all_the_way_to_v4(tmp_path):
    """The bulk chain takes an explicit schemaVersion:2 file all the way to v4.

    This is the test the verdict's Q7 "v2-needs-both-migrators sequence"
    prescribed. It falsified the verdict's enumeration -- ``v3-to-v4`` alone
    SKIPS a genuine v2 file -- and confirms the v2-to-v3 step is required.
    Set 112 removed the ``lightweight-to-v4`` step from the chain along with
    the tier whose non-canonical state files it repaired.
    """
    import migrate_session_state as v2v3
    import migrate_v3_to_v4 as v34

    set_dir = _write_set(tmp_path, "050-genuine-v2", _genuine_v2("050-genuine-v2"))
    state_path = set_dir / "session-state.json"

    # Sanity: the v3->v4 migrator the verdict named SKIPS this file.
    assert detect_drift(str(tmp_path), target=4)[0].schema_version == 2
    v34.migrate_all(str(tmp_path), dry_run=False)
    still_v2 = json.loads(state_path.read_text(encoding="utf-8"))["schemaVersion"]
    assert still_v2 == 2, "v3-to-v4 alone should leave genuine v2 untouched"

    # The full chain (matching cm.BULK_UPGRADE_MIGRATOR_IDS order) lands v4.
    module_for = {
        "v2-to-v3": v2v3,
        "v3-to-v4": v34,
    }
    for mid in cm.BULK_UPGRADE_MIGRATOR_IDS:
        module_for[mid].migrate_all(str(tmp_path), dry_run=False)

    final = json.loads(state_path.read_text(encoding="utf-8"))
    assert final["schemaVersion"] == 4
    assert isinstance(final["sessions"], list) and len(final["sessions"]) == 2
    # Lossless: both sessions of the completed v2 set survive as complete.
    assert all(s["status"] == "complete" for s in final["sessions"])
    # And the scanner now sees it as clean.
    assert detect_drift(str(tmp_path), target=4)[0].status == STATUS_CLEAN


def test_bundled_bulk_commands_shape():
    cmds = cm.bulk_upgrade_commands()
    assert cmds == [
        "python -m ai_router.migrate_session_state --in-place",
        "python -m ai_router.migrate_v3_to_v4 --in-place",
    ]
    assert " && " in cm.bulk_upgrade_oneliner()


# --- CLI ---------------------------------------------------------------------


def test_cli_clean_exit_zero(tmp_path, capsys):
    _write_set(tmp_path, "001-v4", _v4("001-v4"))
    rc = cm.main(["--scan", str(tmp_path)])
    out = capsys.readouterr().out
    assert rc == 0
    assert "OK:" in out


def test_cli_drift_exit_one(tmp_path, capsys):
    _write_set(tmp_path, "001-v3", _v3("001-v3"))
    rc = cm.main(["--scan", str(tmp_path)])
    out = capsys.readouterr().out
    assert rc == 1
    assert "WARNING:" in out
    assert "older:" in out


def test_cli_exit_zero_flag_suppresses_failure(tmp_path):
    _write_set(tmp_path, "001-v3", _v3("001-v3"))
    assert cm.main(["--scan", str(tmp_path), "--exit-zero"]) == 0


def test_cli_json_output(tmp_path, capsys):
    _write_set(tmp_path, "001-v3", _v3("001-v3"))
    _write_set(tmp_path, "002-v4", _v4("002-v4"))
    rc = cm.main(["--scan", str(tmp_path), "--json"])
    payload = json.loads(capsys.readouterr().out)
    assert rc == 1
    assert payload["counts"]["drift"] == 1
    assert payload["counts"]["clean"] == 1
    assert payload["bulk_upgrade_commands"][0].endswith("migrate_session_state --in-place")


def test_cli_no_sets_found_exit_zero(tmp_path, capsys):
    rc = cm.main(["--scan", str(tmp_path)])
    assert rc == 0
    assert "No session sets found." in capsys.readouterr().out


def test_cli_ascii_only_output(tmp_path, capsys):
    """Output must be ASCII (Windows cp1252 consoles cannot encode e.g. the warn glyph)."""
    _write_set(tmp_path, "001-v3", _v3("001-v3"))
    cm.main(["--scan", str(tmp_path), "--verbose"])
    out = capsys.readouterr().out
    out.encode("ascii")  # raises if any non-ASCII char slipped in


def test_cli_manifest_note_when_upstream_newer(tmp_path, capsys, monkeypatch):
    _write_set(tmp_path, "001-v4", _v4("001-v4"))

    def fake_fetch(url, *, strict=False, cache_path=None, fetch_fn=None):
        return cm.ManifestResult(manifest={"currentSchemaVersion": 7, "minimumAiRouterVersion": "0.12.0"}, source="network")

    monkeypatch.setattr(cm, "fetch_manifest", fake_fetch)
    rc = cm.main(["--scan", str(tmp_path), "--manifest-url", "https://example/x.json"])
    out = capsys.readouterr().out
    assert "upstream publishes schema v7" in out
    # Local sets are all clean, so absent the manifest note this is exit 0.
    assert rc == 0


# --- summarize_drift (Set 053 lifecycle-embedded advisory) --------------------


def test_summarize_drift_returns_none_when_clean(tmp_path):
    for i in range(3):
        _write_set(tmp_path, f"00{i}-set", _v4(f"00{i}-set"))
    assert summarize_drift(str(tmp_path)) is None


def test_summarize_drift_reports_older_sets(tmp_path):
    _write_set(tmp_path, "001-v4", _v4("001-v4"))
    _write_set(tmp_path, "002-v3", _v3("002-v3"))
    _write_set(tmp_path, "003-v2", _genuine_v2("003-v2"))
    line = summarize_drift(str(tmp_path))
    assert line is not None
    # Two older sets (v3 + v2); v4 is current so excluded.
    assert "2 session-set(s) below the current schema v4" in line
    assert "older: v2, v3" in line
    # Non-directive: old schema is acceptable, points at the review command.
    assert "Old schema is acceptable" in line
    assert "check_migrations --verbose" in line


def test_summarize_drift_counts_missing_version(tmp_path):
    _write_set(tmp_path, "001-nover", {"sessionSetName": "x", "status": "y", "sessions": []})
    line = summarize_drift(str(tmp_path))
    assert line is not None
    assert "1 session-set(s) below the current schema v4" in line
    assert "no/unknown schemaVersion" in line


def test_summarize_drift_is_ascii_only(tmp_path):
    _write_set(tmp_path, "001-v3", _v3("001-v3"))
    _write_set(tmp_path, "002-nover", {"sessionSetName": "x", "status": "y", "sessions": []})
    summarize_drift(str(tmp_path)).encode("ascii")  # raises if non-ASCII slipped in


def test_summarize_drift_fail_open_on_bad_root(tmp_path):
    # Non-existent scan root -> fail-open -> None, never raises.
    assert summarize_drift(str(tmp_path / "does" / "not" / "exist")) is None


def test_summarize_drift_swallows_internal_errors(tmp_path, monkeypatch):
    # If detect_drift itself raises, summarize_drift must return None, not propagate.
    def boom(*a, **k):
        raise RuntimeError("scan exploded")

    monkeypatch.setattr(cm, "detect_drift", boom)
    assert summarize_drift(str(tmp_path)) is None


def test_summarize_drift_reports_unreadable_corrupt(tmp_path):
    """Set 053 S2 IV&V (IMP-1): a corrupt session-state.json must be
    surfaced, not hidden behind the older-schema count."""
    _write_set(tmp_path, "001-v4", _v4("001-v4"))  # clean
    _write_set(tmp_path, "002-corrupt", "{ not valid json ,,,")
    line = summarize_drift(str(tmp_path))
    assert line is not None
    assert "unreadable/corrupt session-state.json" in line
    assert "1 session-set(s) with an unreadable" in line


def test_summarize_drift_combines_older_and_unreadable(tmp_path):
    _write_set(tmp_path, "001-v3", _v3("001-v3"))
    _write_set(tmp_path, "002-corrupt", "[1, 2, 3]")  # non-object -> unreadable
    line = summarize_drift(str(tmp_path))
    assert line is not None
    assert "1 session-set(s) below the current schema v4 (older: v3)" in line
    assert "1 session-set(s) with an unreadable/corrupt" in line
    # both segments joined into one advisory line
    assert line.count("[dabbler]") == 1
