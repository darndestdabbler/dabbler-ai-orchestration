"""Set 058 S3 — tests for the tier-model / consumer-bootstrap drift guards.

``drift_guard`` lives under ``ai_router/scripts/`` and is imported by bare
filename via the conftest ``SCRIPTS_DIR`` sys.path shim (same convention as
``backfill_session_state`` / ``dump_session_state_schema``).

Each check is exercised on synthetic temp trees (positive + negative), and a
final test asserts the REAL repository currently passes all three — so this
suite is itself the CI gate: adding stale framing, a second in-progress set, or
a stale committed ``dist/`` bundle turns it red.
"""
from __future__ import annotations

import json
from pathlib import Path

import drift_guard


# ---------------------------------------------------------------------------
# Check 1 — stale-framing guard
# ---------------------------------------------------------------------------


def _write(p: Path, text: str) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")


def test_stale_framing_flags_banned_phrase(tmp_path: Path):
    _write(tmp_path / "docs" / "guide.md", "Lightweight means no Python at all.\n")
    violations = drift_guard.scan_stale_framing(tmp_path)
    assert len(violations) == 1
    assert violations[0].check == "stale-framing"
    assert violations[0].location == "docs/guide.md:1"


def test_stale_framing_clean_doc_passes(tmp_path: Path):
    _write(
        tmp_path / "docs" / "guide.md",
        "Lightweight is router-off, not Python-off. Both tiers use a .venv.\n",
    )
    assert drift_guard.scan_stale_framing(tmp_path) == []


def test_stale_framing_exempts_compound_identifier(tmp_path: Path):
    # A banned label that is a SUB-TOKEN of a longer identifier is not framing.
    # This is the Set 075 telemetry case: `docs-only-excluded` (trailing `-`) and
    # `targetClass=docs-only` (leading `=`) are diffClass identifiers, not prose.
    _write(
        tmp_path / "docs" / "telemetry.md",
        "Tag the run `diffClass=docs-only-excluded` and the shorthand "
        "`targetClass=docs-only` is canonicalized into it.\n",
    )
    assert drift_guard.scan_stale_framing(tmp_path) == []


def test_stale_framing_still_flags_bare_backtick_quoted_label(tmp_path: Path):
    # The exemption is for COMPOUND identifiers only, not for backtick-quoting per
    # se: a bare `docs-only` (or `explorer-only`) label is still caught, so the ban
    # cannot be evaded simply by wrapping the label in backticks. (This mirrors the
    # bootstrap README, which must use an allow-region to use the bare label.)
    _write(
        tmp_path / "docs" / "telemetry.md",
        "Do not call the tier `docs-only` or `explorer-only`.\n",
    )
    violations = drift_guard.scan_stale_framing(tmp_path)
    locations = {v.location for v in violations}
    assert locations == {"docs/telemetry.md:1"}
    details = " ".join(v.detail for v in violations)
    assert "docs-only" in details and "explorer-only" in details


def test_stale_framing_still_flags_prose_label(tmp_path: Path):
    # The compound-identifier exemption does not defang a bare label in prose on
    # the same line as an exempt identifier.
    _write(
        tmp_path / "docs" / "telemetry.md",
        "The `docs-only-excluded` class is fine, but calling Lightweight "
        "docs-only is banned framing.\n",
    )
    violations = drift_guard.scan_stale_framing(tmp_path)
    assert len(violations) == 1
    assert violations[0].location == "docs/telemetry.md:1"


def test_stale_framing_flags_sentence_ending_label(tmp_path: Path):
    # The period is not an identifier char, so a label ending a sentence is caught.
    _write(tmp_path / "docs" / "g.md", "The tier is docs-only. Avoid explorer-only.\n")
    locations = {v.location for v in drift_guard.scan_stale_framing(tmp_path)}
    assert locations == {"docs/g.md:1"}


def test_stale_framing_flags_dangling_separator_not_a_real_identifier(tmp_path: Path):
    # A dangling `-` or `=` adjacent to a label is NOT a compound identifier (no
    # extra word component), so the label must still trip the ban.
    _write(
        tmp_path / "docs" / "g.md",
        "First docs-only- here.\nThen =docs-only here.\nAnd explorer-only- too.\n",
    )
    locations = {v.location for v in drift_guard.scan_stale_framing(tmp_path)}
    assert locations == {"docs/g.md:1", "docs/g.md:2", "docs/g.md:3"}


def test_stale_framing_exempts_keyvalue_compound_identifier(tmp_path: Path):
    # A key=value with a real word key (e.g. `tier=docs-only`, like the Set 075
    # `targetClass=docs-only`) IS a compound identifier and stays exempt.
    _write(tmp_path / "docs" / "g.md", "Tag it `tier=docs-only` in the metadata.\n")
    assert drift_guard.scan_stale_framing(tmp_path) == []


# A file on the ALLOWED_MARKER_FILES allowlist may use the escape hatch.
_ALLOWLISTED_REL = Path("docs") / "concepts" / "tier-model.md"


def test_stale_framing_allow_region_is_skipped_in_allowlisted_file(tmp_path: Path):
    _write(
        tmp_path / _ALLOWLISTED_REL,
        "Intro line.\n"
        "<!-- drift-guard:allow-begin -->\n"
        "Banned: no Python / no venv / docs-only.\n"
        "<!-- drift-guard:allow-end -->\n"
        "After the region, all clean.\n",
    )
    assert drift_guard.scan_stale_framing(tmp_path) == []


def test_stale_framing_after_allow_region_is_enforced_again(tmp_path: Path):
    _write(
        tmp_path / _ALLOWLISTED_REL,
        "<!-- drift-guard:allow-begin -->\n"
        "no Python here is allowed\n"
        "<!-- drift-guard:allow-end -->\n"
        "but docs-only here is NOT\n",
    )
    violations = drift_guard.scan_stale_framing(tmp_path)
    assert len(violations) == 1
    assert violations[0].location.endswith(":4")


def test_stale_framing_marker_in_non_allowlisted_file_is_itself_flagged(tmp_path: Path):
    # A suppression marker in a file NOT on the allowlist is a violation, AND it
    # does not actually suppress the banned phrase it tried to hide.
    _write(
        tmp_path / "docs" / "rogue.md",
        "<!-- drift-guard:allow-begin -->\n"
        "no Python here\n"
        "<!-- drift-guard:allow-end -->\n",
    )
    violations = drift_guard.scan_stale_framing(tmp_path)
    locations = {v.location for v in violations}
    # The two marker lines are flagged as unauthorized, and the banned phrase
    # between them is still caught (the marker did not grant suppression).
    assert "docs/rogue.md:1" in locations  # allow-begin marker
    assert "docs/rogue.md:3" in locations  # allow-end marker
    assert "docs/rogue.md:2" in locations  # banned phrase not suppressed
    assert any("not on ALLOWED_MARKER_FILES" in v.detail for v in violations)


def test_stale_framing_excludes_session_sets_and_proposals(tmp_path: Path):
    _write(
        tmp_path / "docs" / "session-sets" / "001-x" / "spec.md",
        "Historical: Lightweight = no venv.\n",
    )
    _write(
        tmp_path / "docs" / "proposals" / "p" / "verdict.md",
        "Historical: docs-only workflow.\n",
    )
    assert drift_guard.scan_stale_framing(tmp_path) == []


def test_stale_framing_excludes_dist_and_node_modules(tmp_path: Path):
    _write(tmp_path / "dist" / "x.md", "no Python\n")
    _write(tmp_path / "node_modules" / "pkg" / "y.md", "docs-only\n")
    assert drift_guard.scan_stale_framing(tmp_path) == []


def test_stale_framing_close_out_phrasing_is_not_flagged(tmp_path: Path):
    # The close-out variants are deliberately not enforced (ambiguous with
    # legitimate "no closeout event" / "No close-out gate dependency" usage).
    _write(
        tmp_path / "docs" / "close.md",
        "The ledger has no closeout event. No close-out gate dependency.\n",
    )
    assert drift_guard.scan_stale_framing(tmp_path) == []


def test_stale_framing_scans_html(tmp_path: Path):
    _write(tmp_path / "webview" / "wizard.html", "<p>Lightweight: no venv.</p>\n")
    violations = drift_guard.scan_stale_framing(tmp_path)
    assert len(violations) == 1
    assert violations[0].location == "webview/wizard.html:1"


# ---------------------------------------------------------------------------
# Check 2 — one-active-set guard
# ---------------------------------------------------------------------------


def _make_set(base: Path, slug: str, status: str) -> None:
    d = base / "docs" / "session-sets" / slug
    d.mkdir(parents=True, exist_ok=True)
    (d / "session-state.json").write_text(
        json.dumps({"schemaVersion": 4, "status": status}), encoding="utf-8"
    )


def test_one_active_set_zero_in_progress_ok(tmp_path: Path):
    _make_set(tmp_path, "001-a", "complete")
    _make_set(tmp_path, "002-b", "not-started")
    assert drift_guard.check_one_active_set(tmp_path) == []


def test_one_active_set_single_in_progress_ok(tmp_path: Path):
    _make_set(tmp_path, "001-a", "in-progress")
    _make_set(tmp_path, "002-b", "complete")
    assert drift_guard.check_one_active_set(tmp_path) == []


def test_one_active_set_two_in_progress_flagged(tmp_path: Path):
    _make_set(tmp_path, "001-a", "in-progress")
    _make_set(tmp_path, "002-b", "in-progress")
    violations = drift_guard.check_one_active_set(tmp_path)
    assert len(violations) == 1
    assert violations[0].check == "one-active-set"
    assert "001-a" in violations[0].detail and "002-b" in violations[0].detail


def test_one_active_set_missing_dir_ok(tmp_path: Path):
    assert drift_guard.check_one_active_set(tmp_path) == []


# ---------------------------------------------------------------------------
# Check 3 — dist-bundle-in-sync guard
# ---------------------------------------------------------------------------


def _make_bundles(base: Path, src_files: dict, dst_files: dict) -> None:
    src = base.joinpath("docs", "templates", "consumer-bootstrap")
    dst = base.joinpath(
        "tools", "dabbler-ai-orchestration", "dist", "templates", "consumer-bootstrap"
    )
    src.mkdir(parents=True, exist_ok=True)
    dst.mkdir(parents=True, exist_ok=True)
    for name, content in src_files.items():
        (src / name).write_text(content, encoding="utf-8")
    for name, content in dst_files.items():
        (dst / name).write_text(content, encoding="utf-8")


def test_dist_in_sync_identical_ok(tmp_path: Path):
    files = {"a.template": "alpha\n", "b.md": "beta\n"}
    _make_bundles(tmp_path, files, dict(files))
    assert drift_guard.check_dist_bundle_in_sync(tmp_path) == []


def test_dist_in_sync_crlf_normalized_ok(tmp_path: Path):
    # Write exact bytes (write_text would re-translate newlines on Windows):
    # LF source vs CRLF dist must be treated as in-sync.
    src = tmp_path.joinpath("docs", "templates", "consumer-bootstrap")
    dst = tmp_path.joinpath(
        "tools", "dabbler-ai-orchestration", "dist", "templates", "consumer-bootstrap"
    )
    src.mkdir(parents=True, exist_ok=True)
    dst.mkdir(parents=True, exist_ok=True)
    (src / "a.template").write_bytes(b"alpha\n")
    (dst / "a.template").write_bytes(b"alpha\r\n")
    assert drift_guard.check_dist_bundle_in_sync(tmp_path) == []


def test_dist_in_sync_content_drift_flagged(tmp_path: Path):
    _make_bundles(tmp_path, {"a.template": "alpha\n"}, {"a.template": "STALE\n"})
    violations = drift_guard.check_dist_bundle_in_sync(tmp_path)
    assert len(violations) == 1
    assert violations[0].check == "dist-in-sync"


def test_dist_in_sync_missing_dist_file_flagged(tmp_path: Path):
    _make_bundles(tmp_path, {"a.template": "alpha\n", "b.md": "beta\n"}, {"a.template": "alpha\n"})
    violations = drift_guard.check_dist_bundle_in_sync(tmp_path)
    assert any("b.md" in v.location for v in violations)


def test_dist_in_sync_extra_stale_dist_file_flagged(tmp_path: Path):
    _make_bundles(tmp_path, {"a.template": "alpha\n"}, {"a.template": "alpha\n", "old.md": "x\n"})
    violations = drift_guard.check_dist_bundle_in_sync(tmp_path)
    assert any("old.md" in v.location for v in violations)


# ---------------------------------------------------------------------------
# Real-repo green — this suite IS the gate
# ---------------------------------------------------------------------------


def _repo_root() -> Path:
    # ai_router/tests/ -> ai_router/ -> repo root
    return Path(__file__).resolve().parents[2]


def test_real_repo_passes_all_drift_checks():
    violations = drift_guard.run_all(_repo_root())
    assert violations == [], "drift_guard found violations in the real repo:\n" + "\n".join(
        v.render() for v in violations
    )
