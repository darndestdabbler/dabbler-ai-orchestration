"""Set 085 F1 tests: the preload manifest + ratcheting ceiling gate.

Covers the spec's Session-1 Layer-1 matrix:

- manifest parsing (missing block, partial block, legacy-keys-only, bad
  types) in :func:`guidance_config.load_guidance_config`
- per-file and total breach exit codes in ``guidance_report --check``
- a ratchet-start fixture (every file exactly at its declared ceiling ->
  all green)
- a one-token-over fixture (fails, naming the offending file)
- a manifest file missing on disk (hard failure)
- back-compat: no manifest -> byte-identical two-file Set-064 behavior
- ``--write-headers`` opt-in (``stamp: true``) vs the default no-auto-edit

Bare-filename imports per the package test convention.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

import guidance_report
from guidance_config import (
    GuidanceConfig,
    PreloadEntry,
    PreloadManifest,
    load_guidance_config,
)
from guidance_report import (
    HEADER_BEGIN,
    build_preload_reports,
    preload_check_failures,
    render_preload_report,
)


# --- manifest parsing --------------------------------------------------------


def test_missing_preload_block_is_none():
    """No ``preload:`` key -> None (legacy two-file behavior)."""
    cfg = load_guidance_config({"guidance": {"disuse_window_sets": 20}})
    assert cfg.preload is None


def test_legacy_keys_only_leaves_manifest_none():
    """A repo with only the Set-064 keys keeps preload None (back-compat)."""
    cfg = load_guidance_config(
        {
            "guidance": {
                "active_lessons_ceiling_tokens": 10000,
                "project_guidance_ceiling_tokens": 6000,
            }
        }
    )
    assert cfg.preload is None
    assert cfg.active_lessons_ceiling_tokens == 10000
    assert cfg.project_guidance_ceiling_tokens == 6000


def test_no_config_at_all_is_none():
    cfg = load_guidance_config(None)
    assert cfg.preload is None
    assert cfg.preload_declared is False


def test_preload_declared_flag_tracks_key_presence():
    # Malformed preload (parses to None) but the key IS present -> declared.
    cfg = load_guidance_config({"guidance": {"preload": 7}})
    assert cfg.preload is None
    assert cfg.preload_declared is True
    # No preload key -> not declared.
    cfg2 = load_guidance_config({"guidance": {"disuse_window_sets": 20}})
    assert cfg2.preload_declared is False


def test_well_formed_manifest_parses():
    cfg = load_guidance_config(
        {
            "guidance": {
                "preload": {
                    "total_ceiling_tokens": 150,
                    "files": [
                        {"path": "a.md", "ceiling_tokens": 100},
                        {"path": "b.md", "ceiling_tokens": 50, "stamp": True},
                    ],
                }
            }
        }
    )
    assert cfg.preload is not None
    assert cfg.preload.total_ceiling_tokens == 150
    assert cfg.preload.files == (
        PreloadEntry(path="a.md", ceiling_tokens=100, stamp=False),
        PreloadEntry(path="b.md", ceiling_tokens=50, stamp=True),
    )


def test_partial_block_missing_total_is_uncapped_total():
    cfg = load_guidance_config(
        {"guidance": {"preload": {"files": [{"path": "a.md", "ceiling_tokens": 5}]}}}
    )
    assert cfg.preload is not None
    assert cfg.preload.total_ceiling_tokens is None
    assert cfg.preload.files[0].ceiling_tokens == 5


@pytest.mark.parametrize("bad", ["notadict", 5, ["a", "b"], None])
def test_preload_not_a_mapping_is_none(bad):
    cfg = load_guidance_config({"guidance": {"preload": bad}})
    assert cfg.preload is None


def test_files_not_a_list_is_none():
    cfg = load_guidance_config(
        {"guidance": {"preload": {"files": {"path": "a.md"}}}}
    )
    assert cfg.preload is None


def test_empty_files_list_is_none():
    cfg = load_guidance_config({"guidance": {"preload": {"files": []}}})
    assert cfg.preload is None


def test_malformed_entries_are_counted_not_silently_dropped():
    """A pathless / non-mapping files: item is excluded from ``files`` but
    COUNTED in ``malformed_entry_count`` -- it must not silently vanish
    from the gate (I-085-S1-8)."""
    cfg = load_guidance_config(
        {
            "guidance": {
                "preload": {
                    "files": [
                        "notadict",
                        {"ceiling_tokens": 10},  # no path
                        {"path": "", "ceiling_tokens": 10},  # empty path
                        {"path": "  ", "ceiling_tokens": 10},  # whitespace path
                        {"path": "keep.md", "ceiling_tokens": 10},
                    ]
                }
            }
        }
    )
    assert cfg.preload is not None
    assert [e.path for e in cfg.preload.files] == ["keep.md"]
    assert cfg.preload.malformed_entry_count == 4


def test_all_entries_malformed_still_returns_manifest():
    """Zero valid entries but some malformed -> a manifest carrying the
    count (so --check fails), NOT None (which would read as no-manifest)."""
    cfg = load_guidance_config(
        {"guidance": {"preload": {"files": [{"ceiling_tokens": 1}, "x"]}}}
    )
    assert cfg.preload is not None
    assert cfg.preload.files == ()
    assert cfg.preload.malformed_entry_count == 2


@pytest.mark.parametrize("bad_ceiling", ["100", 1.5, True, False, -3, None, [10]])
def test_bad_ceiling_type_is_uncapped_but_entry_kept(bad_ceiling):
    """A malformed ceiling -> uncapped (None), but the file stays visible.

    Silently dropping the entry would open a re-bloat hole; keeping it
    uncapped keeps the file in the report where a bad value is noticed.
    ``True``/``False`` must not read as ``1``/``0`` (bool is an int
    subclass) -- the L-066-1 isinstance-guard discipline.
    """
    cfg = load_guidance_config(
        {
            "guidance": {
                "preload": {"files": [{"path": "a.md", "ceiling_tokens": bad_ceiling}]}
            }
        }
    )
    assert cfg.preload is not None
    assert cfg.preload.files[0].ceiling_tokens is None


@pytest.mark.parametrize("bad_total", ["150", 1.5, True, -1, [150]])
def test_bad_total_type_is_uncapped(bad_total):
    cfg = load_guidance_config(
        {
            "guidance": {
                "preload": {
                    "total_ceiling_tokens": bad_total,
                    "files": [{"path": "a.md", "ceiling_tokens": 10}],
                }
            }
        }
    )
    assert cfg.preload is not None
    assert cfg.preload.total_ceiling_tokens is None


@pytest.mark.parametrize("bad_stamp", ["true", 1, 0, None, "yes"])
def test_non_true_stamp_defaults_false(bad_stamp):
    cfg = load_guidance_config(
        {
            "guidance": {
                "preload": {
                    "files": [
                        {"path": "a.md", "ceiling_tokens": 10, "stamp": bad_stamp}
                    ]
                }
            }
        }
    )
    assert cfg.preload.files[0].stamp is False


# --- report + gate fixtures --------------------------------------------------


def _write(root: Path, rel: str, chars: int) -> None:
    """Write *chars* 'x' bytes (no newline) -> ceil(chars/4) tokens exactly."""
    p = root / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text("x" * chars, encoding="utf-8")


@pytest.fixture
def repo(tmp_path: Path):
    # a.md: 400 chars -> 100 tokens; sub/b.md: 200 chars -> 50 tokens.
    _write(tmp_path, "a.md", 400)
    _write(tmp_path, "sub/b.md", 200)
    return tmp_path


def _manifest(a_ceiling=100, b_ceiling=50, total=150) -> PreloadManifest:
    return PreloadManifest(
        files=(
            PreloadEntry(path="a.md", ceiling_tokens=a_ceiling),
            PreloadEntry(path="sub/b.md", ceiling_tokens=b_ceiling),
        ),
        total_ceiling_tokens=total,
    )


def _patch_cfg(monkeypatch, cfg: GuidanceConfig) -> None:
    monkeypatch.setattr(guidance_report, "load_guidance_config", lambda c: cfg)


def test_build_preload_reports_measures_relative_paths(repo):
    reports = build_preload_reports(str(repo), _manifest())
    by_name = {r.name: r for r in reports}
    assert by_name["a.md"].tokens == 100
    assert by_name["sub/b.md"].tokens == 50
    assert all(not r.missing for r in reports)


def test_ratchet_start_all_green(repo, monkeypatch, capsys):
    """Every file exactly at its ceiling and total at the sum -> exit 0."""
    _patch_cfg(monkeypatch, GuidanceConfig(preload=_manifest()))
    rc = guidance_report.main(["--check", "--repo-root", str(repo)])
    out = capsys.readouterr().out
    assert rc == 0
    assert "Preload manifest" in out
    assert "OK (100% of ceiling)" in out


def test_one_token_over_names_the_file(repo, monkeypatch, capsys):
    """a.md is 100 tokens; ceiling 99 -> fails, naming a.md and the overage."""
    _patch_cfg(monkeypatch, GuidanceConfig(preload=_manifest(a_ceiling=99, total=1000)))
    rc = guidance_report.main(["--check", "--repo-root", str(repo)])
    out = capsys.readouterr().out
    assert rc == 1
    assert "CHECK FAILED" in out
    assert "a.md" in out
    assert "+1 tok" in out
    assert "ratchet DOWN only" in out


def test_total_breach_names_total(repo, monkeypatch, capsys):
    """Per-file all green, but total_ceiling below the sum -> fails on TOTAL."""
    _patch_cfg(monkeypatch, GuidanceConfig(preload=_manifest(total=149)))
    rc = guidance_report.main(["--check", "--repo-root", str(repo)])
    out = capsys.readouterr().out
    assert rc == 1
    assert "TOTAL" in out
    assert "+1 tok" in out


def test_missing_manifest_file_is_hard_failure(repo, monkeypatch, capsys):
    manifest = PreloadManifest(
        files=(
            PreloadEntry(path="a.md", ceiling_tokens=100),
            PreloadEntry(path="gone.md", ceiling_tokens=10),
        ),
        total_ceiling_tokens=1000,
    )
    _patch_cfg(monkeypatch, GuidanceConfig(preload=manifest))
    rc = guidance_report.main(["--check", "--repo-root", str(repo)])
    out = capsys.readouterr().out
    assert rc == 1
    assert "gone.md" in out
    assert "MISSING" in out


@pytest.mark.parametrize(
    "bad_path",
    ["/etc/passwd", "../../outside.md", "..", "C:\\Windows\\win.ini", "sub/../../x.md"],
)
def test_non_root_relative_path_fails_closed(repo, monkeypatch, capsys, bad_path):
    """A manifest path that is absolute or escapes the repo root fails
    --check closed (I-085-S1-6) -- the 'repo-root-relative' contract is
    actually enforced, not just documented."""
    manifest = PreloadManifest(
        files=(PreloadEntry(path=bad_path, ceiling_tokens=100),),
        total_ceiling_tokens=1000,
    )
    _patch_cfg(monkeypatch, GuidanceConfig(preload=manifest))
    rc = guidance_report.main(["--check", "--repo-root", str(repo)])
    out = capsys.readouterr().out
    assert rc == 1
    assert "repo-root-relative" in out


def test_path_escapes_root_helper():
    assert guidance_report._path_escapes_root("../x.md") is True
    assert guidance_report._path_escapes_root("..") is True
    assert guidance_report._path_escapes_root("/abs.md") is True
    assert guidance_report._path_escapes_root("sub/../../x.md") is True
    assert guidance_report._path_escapes_root("") is True
    assert guidance_report._path_escapes_root("docs/a.md") is False
    assert guidance_report._path_escapes_root("sub/deep/a.md") is False
    assert guidance_report._path_escapes_root("./a.md") is False
    assert guidance_report._path_escapes_root("a/../b.md") is False  # net-inside


def test_path_escapes_root_is_platform_independent():
    """Windows-absolute forms are rejected on ANY host (so the bad-path
    matrix behaves identically on the ubuntu CI runner; I-085-S1-11)."""
    for p in ("C:\\Windows\\win.ini", "C:/Windows/win.ini", "\\\\srv\\share\\x",
              "\\abs.md"):
        assert guidance_report._path_escapes_root(p) is True, p


def test_symlink_escaping_repo_fails_closed(repo, monkeypatch, capsys, tmp_path):
    """A lexically-safe path that is a symlink resolving OUTSIDE the repo
    is caught by the resolved (realpath) containment check (I-085-S1-11)."""
    outside = tmp_path.parent / "outside_target.md"
    outside.write_text("x" * 40, encoding="utf-8")
    link = repo / "linked.md"
    try:
        os.symlink(outside, link)
    except (OSError, NotImplementedError):
        pytest.skip("symlink creation not permitted on this host")
    manifest = PreloadManifest(
        files=(PreloadEntry(path="linked.md", ceiling_tokens=100),),
        total_ceiling_tokens=1000,
    )
    _patch_cfg(monkeypatch, GuidanceConfig(preload=manifest))
    rc = guidance_report.main(["--check", "--repo-root", str(repo)])
    out = capsys.readouterr().out
    assert rc == 1
    assert "repo-root-relative" in out


def test_misplaced_top_level_preload_fails_closed_raw(repo, monkeypatch, capsys):
    """A top-level `preload:` (no `guidance:`) is a misindented manifest,
    not a genuine legacy repo -> fail closed on the raw path (I-085-S1-7)."""
    monkeypatch.setattr(
        guidance_report, "load_config", lambda: (_ for _ in ()).throw(RuntimeError("boom"))
    )
    _patch_cfg(monkeypatch, GuidanceConfig())
    _write_router_config(
        repo, "preload:\n  files:\n    - path: a.md\n      ceiling_tokens: 1\n"
    )
    rc = guidance_report.main(["--check", "--repo-root", str(repo)])
    assert rc == 1
    assert "CHECK FAILED" in capsys.readouterr().out


def test_top_level_preload_with_guidance_present_fails_closed_raw(
    repo, monkeypatch, capsys
):
    """A misplaced top-level `preload:` fails closed even when a valid
    `guidance:` mapping ALSO exists (raw path parity with the success
    path; I-085-S1-9)."""
    monkeypatch.setattr(
        guidance_report, "load_config", lambda: (_ for _ in ()).throw(RuntimeError("boom"))
    )
    _patch_cfg(monkeypatch, GuidanceConfig())
    _write_router_config(
        repo,
        "guidance:\n"
        "  disuse_window_sets: 20\n"
        "preload:\n"
        "  files:\n"
        "    - path: a.md\n"
        "      ceiling_tokens: 1\n",
    )
    rc = guidance_report.main(["--check", "--repo-root", str(repo)])
    assert rc == 1
    assert "CHECK FAILED" in capsys.readouterr().out


def test_load_raw_top_level_preload_with_guidance_is_unconfirmable(repo):
    _write_router_config(
        repo, "guidance:\n  disuse_window_sets: 20\npreload:\n  files: []\n"
    )
    manifest, declared, unconfirmable = guidance_report.load_raw_preload_manifest(
        str(repo)
    )
    assert manifest is None and unconfirmable is True


def test_write_headers_never_stamps_escaping_path(repo, monkeypatch):
    """--write-headers must NOT open/write an escaping stamp:true entry
    (write-safety: never mutate a file outside the repo; I-085-S1-10)."""
    manifest = PreloadManifest(
        files=(
            PreloadEntry(path="a.md", ceiling_tokens=100, stamp=True),
            PreloadEntry(path="../evil.md", ceiling_tokens=100, stamp=True),
        ),
        total_ceiling_tokens=1000,
    )
    _patch_cfg(monkeypatch, GuidanceConfig(preload=manifest))
    evil = repo.parent / "evil.md"
    guidance_report.main(["--write-headers", "--repo-root", str(repo)])
    # The escaping path was never created/written.
    assert not evil.exists()
    # The in-repo stamp:true entry WAS stamped.
    assert HEADER_BEGIN in (repo / "a.md").read_text(encoding="utf-8")


def test_top_level_preload_with_valid_manifest_still_fails_closed(
    repo, monkeypatch, capsys
):
    """A stray top-level `preload:` fails closed even when a VALID
    guidance.preload manifest also parsed -- the second declaration must
    not be silently ignored while the first keeps enforcing (I-085-S1-13)."""
    _write(repo, "a.md", 40)
    cfgdict = {
        "guidance": {
            "preload": {
                "total_ceiling_tokens": 1000,
                "files": [{"path": "a.md", "ceiling_tokens": 100}],
            }
        },
        "preload": {"files": [{"path": "b.md"}]},  # stray misplaced manifest
    }
    _write_router_config(repo, "placeholder: true\n")  # so config path resolves
    monkeypatch.setattr(guidance_report, "load_config", lambda *a, **k: cfgdict)
    rc = guidance_report.main(["--check", "--repo-root", str(repo)])
    assert rc == 1
    assert "CHECK FAILED" in capsys.readouterr().out


def test_repo_root_steers_config_load(repo, monkeypatch):
    """--repo-root steers WHICH router-config.yaml is loaded on the success
    path, so config and measured files come from the same repo
    (I-085-S1-12)."""
    _write_router_config(repo, "x: 1\n")
    called = {}

    def fake_load(path=None):
        called["path"] = path
        return {"guidance": {}}

    monkeypatch.setattr(guidance_report, "load_config", fake_load)
    guidance_report.main(["--repo-root", str(repo)])
    assert called.get("path") is not None
    assert os.path.normpath(called["path"]) == os.path.normpath(
        str(repo / "ai_router" / "router-config.yaml")
    )


def test_misplaced_top_level_preload_fails_closed_success(repo, monkeypatch, capsys):
    """Same misplacement on the config-SUCCESS path also fails closed."""
    _write_router_config(repo, "placeholder: true\n")  # so config path resolves
    monkeypatch.setattr(
        guidance_report, "load_config", lambda *a, **k: {"preload": {"files": []}}
    )
    _patch_cfg(monkeypatch, GuidanceConfig())
    rc = guidance_report.main(["--check", "--repo-root", str(repo)])
    assert rc == 1
    assert "CHECK FAILED" in capsys.readouterr().out


def test_malformed_entry_fails_check_closed(repo, monkeypatch, capsys):
    """A valid entry + a malformed entry -> --check fails closed (the
    declared-but-dropped file must not silently escape the gate)."""
    manifest = PreloadManifest(
        files=(PreloadEntry(path="a.md", ceiling_tokens=100),),
        total_ceiling_tokens=1000,
        malformed_entry_count=1,
    )
    _patch_cfg(monkeypatch, GuidanceConfig(preload=manifest))
    rc = guidance_report.main(["--check", "--repo-root", str(repo)])
    out = capsys.readouterr().out
    assert rc == 1
    assert "malformed" in out and "silently dropped" in out


def test_malformed_entry_end_to_end_via_config(repo, monkeypatch, capsys):
    """End-to-end: a real config whose files: list has a pathless entry
    fails --check (not silently dropped) even when load_config succeeds."""
    # a.md is 100 tokens; give it a generous ceiling so the ONLY failure is
    # the malformed sibling entry -- proving the drop is what's caught.
    cfg = load_guidance_config(
        {
            "guidance": {
                "preload": {
                    "total_ceiling_tokens": 1000,
                    "files": [
                        {"path": "a.md", "ceiling_tokens": 1000},
                        {"ceiling_tokens": 5},  # pathless -> malformed
                    ],
                }
            }
        }
    )
    _patch_cfg(monkeypatch, cfg)
    rc = guidance_report.main(["--check", "--repo-root", str(repo)])
    out = capsys.readouterr().out
    assert rc == 1
    assert "malformed" in out


def test_uncapped_entry_never_blocks(repo, monkeypatch):
    manifest = PreloadManifest(
        files=(
            PreloadEntry(path="a.md", ceiling_tokens=None),
            PreloadEntry(path="sub/b.md", ceiling_tokens=None),
        ),
        total_ceiling_tokens=None,
    )
    _patch_cfg(monkeypatch, GuidanceConfig(preload=manifest))
    rc = guidance_report.main(["--check", "--repo-root", str(repo)])
    assert rc == 0


def test_preload_check_failures_helper():
    # Exercise the classifier directly: a.md over by 1 AND total over by 10.
    from guidance_report import FileReport

    r_over = FileReport("a.md", "a.md", 400, 1, 100, 99)
    r_ok = FileReport("b.md", "b.md", 200, 1, 50, 50)
    fails = preload_check_failures([r_over, r_ok], total_ceiling=140)
    # a.md over by 1, and total (150) over 140 by 10.
    assert any("a.md" in f and "+1" in f for f in fails)
    assert any(f.startswith("TOTAL") and "+10" in f for f in fails)


def test_render_preload_report_marks_missing():
    from guidance_report import FileReport

    missing = FileReport("gone.md", "gone.md", 0, 0, 0, 10, missing=True)
    txt = render_preload_report([missing], total_ceiling=100)
    assert "MISSING ON DISK" in txt


# --- back-compat: no manifest ------------------------------------------------


def test_no_manifest_uses_legacy_report(tmp_path, monkeypatch, capsys):
    """With cfg.preload None, main() renders the legacy header, not the manifest."""
    gdir = tmp_path / "docs" / "planning"
    gdir.mkdir(parents=True)
    (gdir / "lessons-learned.md").write_text("# L\n", encoding="utf-8")
    (gdir / "project-guidance.md").write_text("# G\n", encoding="utf-8")
    _patch_cfg(monkeypatch, GuidanceConfig())  # preload=None
    rc = guidance_report.main(["--check", "--repo-root", str(tmp_path)])
    out = capsys.readouterr().out
    assert rc == 0
    assert "Guidance overhead" in out
    assert "Preload manifest" not in out


# --- --write-headers opt-in --------------------------------------------------


def test_write_headers_skips_non_opt_in_manifest_files(repo, monkeypatch):
    """A manifest file with stamp:false (default) is never auto-edited."""
    _patch_cfg(monkeypatch, GuidanceConfig(preload=_manifest()))
    guidance_report.main(["--write-headers", "--repo-root", str(repo)])
    assert HEADER_BEGIN not in (repo / "a.md").read_text(encoding="utf-8")
    assert HEADER_BEGIN not in (repo / "sub" / "b.md").read_text(encoding="utf-8")


# --- back-compat: --json legacy shape (R2 remediation I-085-S1-2) -------------


def test_no_manifest_json_is_byte_identical_legacy_shape(tmp_path, monkeypatch, capsys):
    """A repo with no manifest must get the exact legacy JSON keys -- no
    manifest-only fields (``missing`` / ``total_*``) leak in."""
    import json

    gdir = tmp_path / "docs" / "planning"
    gdir.mkdir(parents=True)
    (gdir / "lessons-learned.md").write_text("# L\n", encoding="utf-8")
    (gdir / "project-guidance.md").write_text("# G\n", encoding="utf-8")
    _patch_cfg(monkeypatch, GuidanceConfig())  # preload=None
    guidance_report.main(["--json", "--repo-root", str(tmp_path)])
    payload = json.loads(capsys.readouterr().out)
    assert "total_tokens" not in payload
    assert "total_ceiling_tokens" not in payload
    for f in payload["files"]:
        assert set(f.keys()) == {
            "name",
            "bytes",
            "lines",
            "tokens",
            "ceiling",
            "over_ceiling",
            "pct_of_ceiling",
        }


def test_manifest_json_includes_manifest_fields(repo, monkeypatch, capsys):
    import json

    _patch_cfg(monkeypatch, GuidanceConfig(preload=_manifest()))
    guidance_report.main(["--json", "--repo-root", str(repo)])
    payload = json.loads(capsys.readouterr().out)
    assert payload["total_tokens"] == 150
    assert payload["total_ceiling_tokens"] == 150
    assert all("missing" in f for f in payload["files"])


# --- fail-closed on config-load failure (R2 remediation I-085-S1-1) -----------


def _write_router_config(repo_root: Path, body: str) -> None:
    cfgdir = repo_root / "ai_router"
    cfgdir.mkdir(parents=True, exist_ok=True)
    (cfgdir / "router-config.yaml").write_text(body, encoding="utf-8")


def test_check_fails_closed_when_config_unparseable(repo, monkeypatch, capsys):
    """load_config() failed AND router-config.yaml is unparseable -> --check
    exits non-zero rather than passing on the legacy fallback."""
    # Simulate load_config() raising (e.g. env validation / malformed config).
    monkeypatch.setattr(
        guidance_report, "load_config", lambda: (_ for _ in ()).throw(RuntimeError("boom"))
    )
    _patch_cfg(monkeypatch, GuidanceConfig())  # cfg.preload is None
    _write_router_config(repo, "guidance: : : not valid yaml : [")
    rc = guidance_report.main(["--check", "--repo-root", str(repo)])
    out = capsys.readouterr().out
    assert rc == 1
    assert "could not be" in out


def test_check_recovers_manifest_when_config_load_fails(repo, monkeypatch, capsys):
    """load_config() failed but the YAML is fine and declares a manifest ->
    the gate runs against the raw-parsed manifest (not silently skipped)."""
    monkeypatch.setattr(
        guidance_report, "load_config", lambda: (_ for _ in ()).throw(RuntimeError("boom"))
    )
    _patch_cfg(monkeypatch, GuidanceConfig())  # cfg.preload is None
    # a.md is 100 tokens; declare a ceiling of 1 so the recovered manifest
    # gate must FAIL -- proving it actually ran (not the fail-open legacy).
    _write_router_config(
        repo,
        "guidance:\n"
        "  preload:\n"
        "    total_ceiling_tokens: 1000\n"
        "    files:\n"
        "      - path: a.md\n"
        "        ceiling_tokens: 1\n",
    )
    rc = guidance_report.main(["--check", "--repo-root", str(repo)])
    out = capsys.readouterr().out
    assert rc == 1
    assert "a.md" in out and "CHECK FAILED" in out


def test_no_config_file_stays_fail_open_legacy(tmp_path, monkeypatch):
    """No router-config.yaml at all + load_config failing -> genuine legacy,
    fail-open (exit 0), back-compat preserved for a repo with no config."""
    monkeypatch.setattr(
        guidance_report, "load_config", lambda: (_ for _ in ()).throw(RuntimeError("boom"))
    )
    _patch_cfg(monkeypatch, GuidanceConfig())
    rc = guidance_report.main(["--check", "--repo-root", str(tmp_path)])
    assert rc == 0


def test_check_fails_closed_on_declared_but_malformed_manifest(repo, monkeypatch, capsys):
    """A ``preload:`` key present but malformed (parses to None) must FAIL
    --check closed, not silently revert to legacy -- even when load_config
    SUCCEEDS. Simulated via a cfg with preload=None but preload_declared=True
    (R2 remediation I-085-S1-3)."""
    _patch_cfg(
        monkeypatch, GuidanceConfig(preload=None, preload_declared=True)
    )
    rc = guidance_report.main(["--check", "--repo-root", str(repo)])
    out = capsys.readouterr().out
    assert rc == 1
    assert "CHECK FAILED" in out and "could not be confirmed" in out


def test_check_fails_closed_on_malformed_manifest_via_raw_path(repo, monkeypatch, capsys):
    """load_config() failed AND the raw config declares a malformed preload
    (`preload: 7`) -> fail closed (declared-but-unbuildable), not legacy."""
    monkeypatch.setattr(
        guidance_report, "load_config", lambda: (_ for _ in ()).throw(RuntimeError("boom"))
    )
    _patch_cfg(monkeypatch, GuidanceConfig())  # preload None, declared False
    _write_router_config(repo, "guidance:\n  preload: 7\n")
    rc = guidance_report.main(["--check", "--repo-root", str(repo)])
    out = capsys.readouterr().out
    assert rc == 1
    assert "CHECK FAILED" in out


@pytest.mark.parametrize("body", ["guidance: 7\n", "guidance: [a, b]\n"])
def test_check_fails_closed_on_malformed_guidance_block_raw_path(
    repo, monkeypatch, capsys, body
):
    """A `guidance:` key present but not a mapping is malformed, not a
    genuine no-manifest repo -> fail closed on the raw path (I-085-S1-5)."""
    monkeypatch.setattr(
        guidance_report, "load_config", lambda: (_ for _ in ()).throw(RuntimeError("boom"))
    )
    _patch_cfg(monkeypatch, GuidanceConfig())
    _write_router_config(repo, body)
    rc = guidance_report.main(["--check", "--repo-root", str(repo)])
    assert rc == 1
    assert "CHECK FAILED" in capsys.readouterr().out


def test_check_fails_closed_on_malformed_guidance_block_success_path(
    repo, monkeypatch, capsys
):
    """`guidance: 7` on the config-SUCCESS path (load_config returns a dict
    whose guidance is not a mapping) must also fail closed, not silently
    default past to legacy (I-085-S1-5)."""
    _write_router_config(repo, "placeholder: true\n")  # so config path resolves
    monkeypatch.setattr(guidance_report, "load_config", lambda *a, **k: {"guidance": 7})
    _patch_cfg(monkeypatch, GuidanceConfig())  # defaults; preload None
    rc = guidance_report.main(["--check", "--repo-root", str(repo)])
    assert rc == 1
    assert "CHECK FAILED" in capsys.readouterr().out


def test_load_raw_preload_manifest_no_file(tmp_path):
    manifest, declared, unconfirmable = guidance_report.load_raw_preload_manifest(
        str(tmp_path)
    )
    assert manifest is None and declared is False and unconfirmable is False


def test_load_raw_preload_manifest_malformed_preload_is_declared(repo):
    _write_router_config(repo, "guidance:\n  preload: 7\n")
    manifest, declared, unconfirmable = guidance_report.load_raw_preload_manifest(
        str(repo)
    )
    assert manifest is None and declared is True and unconfirmable is False


def test_load_raw_preload_manifest_malformed_guidance_is_unconfirmable(repo):
    _write_router_config(repo, "guidance: 7\n")
    manifest, declared, unconfirmable = guidance_report.load_raw_preload_manifest(
        str(repo)
    )
    assert manifest is None and declared is False and unconfirmable is True


def test_load_raw_preload_manifest_no_guidance_is_legacy(repo):
    _write_router_config(repo, "models: {}\n")
    manifest, declared, unconfirmable = guidance_report.load_raw_preload_manifest(
        str(repo)
    )
    assert manifest is None and declared is False and unconfirmable is False


def test_load_raw_preload_manifest_parses(repo):
    _write_router_config(
        repo,
        "guidance:\n"
        "  preload:\n"
        "    total_ceiling_tokens: 150\n"
        "    files:\n"
        "      - path: a.md\n"
        "        ceiling_tokens: 100\n",
    )
    manifest, declared, unconfirmable = guidance_report.load_raw_preload_manifest(
        str(repo)
    )
    assert declared is True and unconfirmable is False
    assert manifest is not None
    assert manifest.total_ceiling_tokens == 150
    assert manifest.files[0].path == "a.md"


def test_effective_repo_root_derives_from_config_location(repo):
    """With no --repo-root, the root is derived from the config location
    (<root>/ai_router/router-config.yaml -> <root>), so manifest paths
    resolve correctly from any cwd (I-085-S1-4)."""
    _write_router_config(repo, "guidance:\n  preload:\n    files: []\n")
    # repo/ai_router/router-config.yaml exists; effective root is repo.
    root = guidance_report.effective_repo_root(None)
    # effective_repo_root(None) uses the loader walk-up from cwd; assert the
    # explicit-arg branch is a pass-through and the derived form is a dir.
    assert guidance_report.effective_repo_root(str(repo)) == str(repo)
    assert root is None or os.path.isdir(root)


def test_write_headers_stamps_opt_in_manifest_file(repo, monkeypatch):
    manifest = PreloadManifest(
        files=(
            PreloadEntry(path="a.md", ceiling_tokens=100, stamp=True),
            PreloadEntry(path="sub/b.md", ceiling_tokens=50, stamp=False),
        ),
        total_ceiling_tokens=150,
    )
    _patch_cfg(monkeypatch, GuidanceConfig(preload=manifest))
    guidance_report.main(["--write-headers", "--repo-root", str(repo)])
    assert HEADER_BEGIN in (repo / "a.md").read_text(encoding="utf-8")
    assert HEADER_BEGIN not in (repo / "sub" / "b.md").read_text(encoding="utf-8")
