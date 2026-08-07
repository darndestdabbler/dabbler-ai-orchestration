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
# Check 4 — sample-project dist-in-sync guard (Set 107 S1)
#
# Same shipping defect as check 3 on the second template tree the extension
# ships, with one difference that matters: the sample bundle is a TREE, so the
# comparison must recurse. A flat comparison would have compared only
# bundle.json and silently ignored every file under files/ — which is the
# entire user-facing sample.
# ---------------------------------------------------------------------------


def _make_sample_bundles(base: Path, src_files: dict, dst_files: dict) -> None:
    src = base.joinpath("docs", "templates", "sample-project")
    dst = base.joinpath(
        "tools", "dabbler-ai-orchestration", "dist", "templates", "sample-project"
    )
    for root, files in ((src, src_files), (dst, dst_files)):
        for rel, content in files.items():
            path = root.joinpath(*rel.split("/"))
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")
        root.mkdir(parents=True, exist_ok=True)


def test_sample_dist_in_sync_identical_ok(tmp_path: Path):
    files = {"bundle.json": "{}\n", "files/main.py": "print(1)\n"}
    _make_sample_bundles(tmp_path, files, dict(files))
    assert drift_guard.check_sample_bundle_in_sync(tmp_path) == []


def test_sample_dist_in_sync_recurses_into_files_subtree(tmp_path: Path):
    # The whole point of the recursive walk: a nested drift must be caught.
    _make_sample_bundles(
        tmp_path,
        {"bundle.json": "{}\n", "files/hello/greeting.py": "def greet(): ...\n"},
        {"bundle.json": "{}\n", "files/hello/greeting.py": "STALE\n"},
    )
    violations = drift_guard.check_sample_bundle_in_sync(tmp_path)
    assert len(violations) == 1
    assert violations[0].check == "sample-dist-in-sync"
    assert "files/hello/greeting.py" in violations[0].location


def test_sample_dist_in_sync_missing_nested_dist_file_flagged(tmp_path: Path):
    _make_sample_bundles(
        tmp_path,
        {"bundle.json": "{}\n", "files/docs/session-sets/001-x/spec.md": "x\n"},
        {"bundle.json": "{}\n"},
    )
    violations = drift_guard.check_sample_bundle_in_sync(tmp_path)
    assert any("001-x/spec.md" in v.location for v in violations)


def test_sample_dist_in_sync_extra_stale_nested_dist_file_flagged(tmp_path: Path):
    _make_sample_bundles(
        tmp_path,
        {"bundle.json": "{}\n"},
        {"bundle.json": "{}\n", "files/hello/retired.py": "old\n"},
    )
    violations = drift_guard.check_sample_bundle_in_sync(tmp_path)
    assert any("files/hello/retired.py" in v.location for v in violations)


def test_sample_dist_in_sync_crlf_normalized_ok(tmp_path: Path):
    src = tmp_path.joinpath("docs", "templates", "sample-project", "files")
    dst = tmp_path.joinpath(
        "tools",
        "dabbler-ai-orchestration",
        "dist",
        "templates",
        "sample-project",
        "files",
    )
    src.mkdir(parents=True, exist_ok=True)
    dst.mkdir(parents=True, exist_ok=True)
    (src / "main.py").write_bytes(b"print(1)\n")
    (dst / "main.py").write_bytes(b"print(1)\r\n")
    assert drift_guard.check_sample_bundle_in_sync(tmp_path) == []


def test_sample_dist_in_sync_missing_dist_dir_flagged(tmp_path: Path):
    tmp_path.joinpath("docs", "templates", "sample-project").mkdir(parents=True)
    violations = drift_guard.check_sample_bundle_in_sync(tmp_path)
    assert len(violations) == 1
    assert "npm run compile" in violations[0].detail


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


# ---------------------------------------------------------------------------
# Set 109 S4 — the model-registry drift check, now wired into this guard.
#
# Round-1 verification finding: the set built `model_inventory --check` and
# left it unwired, because the repo's own registry failed it. S4 corrected the
# registry, so the one stated reason expired -- and a gate nothing invokes
# catches nothing, which is the same invisibility the set exists to end.
#
# The check reads only router-config.yaml and the committed lockfile. It never
# probes, so it goes red on a COMMIT and never on a provider's release
# schedule.
# ---------------------------------------------------------------------------


def _registry_repo(tmp_path: Path, *, model_id: str, offered: list[str]) -> Path:
    (tmp_path / "ai_router").mkdir(parents=True, exist_ok=True)
    _write(tmp_path / "ai_router" / "router-config.yaml", f"""\
metadata:
  pricing_reviewed: "2026-08-04"
  review_frequency_days: 30
providers:
  openai:
    display_label: OpenAI
    enabled: true
    api_key_env: DABBLER_OPENAI_API_KEY
    base_url: https://api.openai.com/v1
models:
  probe-target:
    provider: openai
    model_id: {model_id}
    tier: 3
    is_enabled: true
    is_enabled_as_verifier: true
    input_cost_per_1m: 5.00
    output_cost_per_1m: 30.00
routing:
  tier1_max_complexity: 30
  tier2_max_complexity: 65
  tier_assignments:
    1: probe-target
    2: probe-target
    3: probe-target
  task_type_overrides: {{}}
""")
    _write(
        tmp_path / "ai_router" / "model-inventory.lock",
        json.dumps({
            "schemaVersion": 1,
            "providers": {
                "openai": {
                    "probed_at": "2099-01-01T00:00:00Z",
                    "models": offered,
                },
            },
        }),
    )
    return tmp_path


def test_model_registry_drift_flags_an_id_the_provider_does_not_offer(tmp_path):
    """The original defect, as a test: `gpt-5.6` is not an id OpenAI lists."""
    repo = _registry_repo(
        tmp_path, model_id="gpt-5.6", offered=["gpt-5.6-sol", "gpt-5.6-luna"]
    )
    violations = drift_guard.check_model_registry_matches_providers(repo)
    assert len(violations) == 1
    assert violations[0].check == "model-registry-drift"
    assert "gpt-5.6" in violations[0].detail
    assert "probe-target" in violations[0].location


def test_model_registry_drift_passes_on_a_real_id(tmp_path):
    repo = _registry_repo(
        tmp_path, model_id="gpt-5.6-sol", offered=["gpt-5.6-sol", "gpt-5.6-luna"]
    )
    assert drift_guard.check_model_registry_matches_providers(repo) == []


def test_model_registry_drift_needs_no_provider_api_keys(tmp_path, monkeypatch):
    """Set 111 S2 (operator, 2026-08-07): a guard that touches no provider
    must not demand provider credentials.

    This check reads only ``router-config.yaml`` and the committed
    lockfile -- it never probes. It used to load the config through the
    path that validated API keys, so on a Copilot-CLI seat (no
    ``DABBLER_*`` keys at all, which is one of the two supported
    populations, not a misconfiguration) the guard failed with a
    credentials complaint about a network call it was never going to
    make.
    """
    monkeypatch.delenv("DABBLER_OPENAI_API_KEY", raising=False)
    repo = _registry_repo(
        tmp_path, model_id="gpt-5.6-sol", offered=["gpt-5.6-sol"]
    )
    assert drift_guard.check_model_registry_matches_providers(repo) == []

    drifted = _registry_repo(
        tmp_path / "drifted", model_id="gpt-5.6", offered=["gpt-5.6-sol"]
    )
    violations = drift_guard.check_model_registry_matches_providers(drifted)
    assert len(violations) == 1
    assert "gpt-5.6" in violations[0].detail


def test_model_registry_drift_is_silent_without_the_inputs(tmp_path):
    """A checkout carrying neither file has nothing to certify. Absent inputs
    are not a violation -- this guard also runs in consumer repos."""
    assert drift_guard.check_model_registry_matches_providers(tmp_path) == []


def test_the_check_is_registered_so_it_actually_runs(tmp_path):
    """The finding was not "the check is wrong", it was "nothing calls it".
    Asserting registration is what makes that unable to regress."""
    assert "model-registry-drift" in dict(drift_guard.ALL_CHECKS)


def test_the_real_repository_passes_the_model_registry_check():
    """The property this session delivered, asserted against the real tree:
    every configured model_id is one its provider offers. This assertion
    could not have been written before Set 109 S4."""
    repo_root = Path(drift_guard.__file__).resolve().parent.parent.parent
    assert drift_guard.check_model_registry_matches_providers(repo_root) == []


def test_a_missing_lockfile_alone_is_a_violation(tmp_path):
    """Round-3 nit. An `or` meant deleting model-inventory.lock turned this
    gate green -- a fail-open inside the check added to close a fail-open. A
    registry with no snapshot to check against is unverifiable, and
    unverifiable is not passing."""
    repo = _registry_repo(tmp_path, model_id="gpt-5.6-sol", offered=["gpt-5.6-sol"])
    (repo / "ai_router" / "model-inventory.lock").unlink()
    violations = drift_guard.check_model_registry_matches_providers(repo)
    assert len(violations) == 1
    assert "model-inventory.lock" in violations[0].location


def test_a_missing_config_alone_is_a_violation(tmp_path):
    repo = _registry_repo(tmp_path, model_id="gpt-5.6-sol", offered=["gpt-5.6-sol"])
    (repo / "ai_router" / "router-config.yaml").unlink()
    violations = drift_guard.check_model_registry_matches_providers(repo)
    assert len(violations) == 1
    assert "router-config.yaml" in violations[0].location


# ---------------------------------------------------------------------------
# Set 111 S4 — every workflow `uses:` is pinned to a commit SHA.
#
# A tag is mutable, so `actions/checkout@v4` can be repointed at arbitrary
# code; a branch ref (`@release/v1`, which this repo carried on the PyPI
# publish path) moves on every upstream push. The guard is what stops a
# future edit from quietly reintroducing either.
# ---------------------------------------------------------------------------


def _workflow(tmp_path: Path, body: str, name: str = "test.yml") -> Path:
    wf = tmp_path / ".github" / "workflows"
    wf.mkdir(parents=True, exist_ok=True)
    (wf / name).write_text(body, encoding="utf-8")
    return tmp_path


SHA40 = "11d5960a326750d5838078e36cf38b85af677262"


def test_actions_sha_pin_accepts_a_full_sha(tmp_path: Path):
    root = _workflow(
        tmp_path,
        f"jobs:\n  a:\n    steps:\n      - uses: actions/checkout@{SHA40}  # v4.4.0\n",
    )
    assert drift_guard.check_actions_are_sha_pinned(root) == []


def test_actions_sha_pin_flags_a_mutable_tag(tmp_path: Path):
    root = _workflow(
        tmp_path, "jobs:\n  a:\n    steps:\n      - uses: actions/checkout@v4\n"
    )
    violations = drift_guard.check_actions_are_sha_pinned(root)
    assert len(violations) == 1
    assert violations[0].check == "actions-sha-pinned"
    assert "not pinned to a commit SHA" in violations[0].detail


def test_actions_sha_pin_flags_a_moving_branch(tmp_path: Path):
    """`@release/v1` is not even a tag - it moves on every upstream push."""
    root = _workflow(
        tmp_path,
        "jobs:\n  a:\n    steps:\n"
        "      - uses: pypa/gh-action-pypi-publish@release/v1\n",
    )
    assert len(drift_guard.check_actions_are_sha_pinned(root)) == 1


def test_actions_sha_pin_flags_an_unversioned_reference(tmp_path: Path):
    root = _workflow(
        tmp_path, "jobs:\n  a:\n    steps:\n      - uses: actions/checkout\n"
    )
    assert len(drift_guard.check_actions_are_sha_pinned(root)) == 1


def test_actions_sha_pin_flags_a_short_sha(tmp_path: Path):
    """A 7-char sha is ambiguous and not what the hardening guidance asks."""
    root = _workflow(
        tmp_path, "jobs:\n  a:\n    steps:\n      - uses: actions/checkout@11d5960\n"
    )
    assert len(drift_guard.check_actions_are_sha_pinned(root)) == 1


def test_actions_sha_pin_exempts_a_local_composite_action(tmp_path: Path):
    """A local action resolves in-repo at the workflow's own commit."""
    root = _workflow(
        tmp_path,
        "jobs:\n  a:\n    steps:\n"
        "      - uses: ./.github/actions/require-green-test\n",
    )
    assert drift_guard.check_actions_are_sha_pinned(root) == []


def test_actions_sha_pin_reports_file_and_line(tmp_path: Path):
    root = _workflow(
        tmp_path,
        "jobs:\n  a:\n    steps:\n"
        f"      - uses: actions/checkout@{SHA40}\n"
        "      - uses: actions/setup-node@v4\n",
    )
    (violation,) = drift_guard.check_actions_are_sha_pinned(root)
    assert violation.location == ".github/workflows/test.yml:5"


def test_actions_sha_pin_scans_yaml_extension_too(tmp_path: Path):
    root = _workflow(
        tmp_path,
        "jobs:\n  a:\n    steps:\n      - uses: actions/checkout@v4\n",
        name="other.yaml",
    )
    assert len(drift_guard.check_actions_are_sha_pinned(root)) == 1


def test_actions_sha_pin_is_silent_without_a_workflows_dir(tmp_path: Path):
    assert drift_guard.check_actions_are_sha_pinned(tmp_path) == []


def test_actions_sha_pin_is_registered_so_it_actually_runs():
    assert "actions-sha-pinned" in dict(drift_guard.ALL_CHECKS)


def test_the_real_repo_has_every_action_sha_pinned():
    assert drift_guard.check_actions_are_sha_pinned(_repo_root()) == []


def test_the_real_repo_declares_a_dependabot_bump_path():
    """A SHA pin that nothing maintains rots invisibly."""
    assert (_repo_root() / ".github" / "dependabot.yml").is_file()
