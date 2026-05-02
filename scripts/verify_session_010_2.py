"""End-of-session cross-provider verification for Set 10 Session 2.

Builds a verification prompt that bundles the spec excerpt for Session
2 (PyPI publish via GitHub Actions OIDC trusted publishing), the new
release workflow, the release-process runbook, the collapsed README
adoption section, the v0.1+ PyPI note in the extension README, the
pyproject.toml packaging tightening, and the test-suite result.
Routes to a non-Anthropic verifier via
`route(task_type="session-verification")` per workflow Step 6 and
saves the raw verdict to `session-reviews/session-002.md`.
"""
from __future__ import annotations

import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
SET_DIR = REPO / "docs" / "session-sets" / "010-pypi-publish-and-installer"


def _load_ai_router():
    """Import ``ai_router`` directly. The previous
    ``importlib.util.spec_from_file_location`` shim, required when the
    package directory used a hyphenated name, is no longer needed:
    after Set 10 Session 1 the directory is ``ai_router/`` and the
    package is installable via ``pip install -e .`` from the repo
    root. The ``sys.path.insert`` covers the case where the script is
    run without the editable install.
    """
    if str(REPO) not in sys.path:
        sys.path.insert(0, str(REPO))
    import ai_router
    return ai_router


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _slice_session2_spec(spec_md: str) -> str:
    start = spec_md.find("### Session 2 of 3:")
    if start < 0:
        return "(could not locate Session 2 block)"
    end = spec_md.find("### Session 3 of 3:", start)
    if end < 0:
        end = len(spec_md)
    return spec_md[start:end]


def _slice_adoption_section(readme_md: str) -> str:
    start = readme_md.find("## Adopting `ai_router` in a project")
    if start < 0:
        return "(could not locate adoption section)"
    end = readme_md.find("## Repos that need UAT", start)
    if end < 0:
        end = len(readme_md)
    return readme_md[start:end]


def _slice_extension_requirements(extension_readme_md: str) -> str:
    start = extension_readme_md.find("## Requirements")
    if start < 0:
        return "(could not locate Requirements section)"
    end = extension_readme_md.find("## Cost reality", start)
    if end < 0:
        end = len(extension_readme_md)
    return extension_readme_md[start:end]


def main() -> int:
    ai_router = _load_ai_router()
    route = ai_router.route

    release_yml = _read(REPO / ".github" / "workflows" / "release.yml")
    release_process_md = _read(REPO / "docs" / "planning" / "release-process.md")
    pyproject = _read(REPO / "pyproject.toml")
    manifest_in = _read(REPO / "MANIFEST.in")
    readme_md = _read(REPO / "README.md")
    extension_readme_md = _read(REPO / "tools" / "dabbler-ai-orchestration" / "README.md")
    spec_md = _read(SET_DIR / "spec.md")
    ai_assignment_md = _read(SET_DIR / "ai-assignment.md")

    prompt_lines = [
        "# Cross-provider verification — Set 10 Session 2: Publish "
        "`dabbler-ai-router` to PyPI via GitHub Actions OIDC trusted "
        "publishing",
        "",
        "## Spec excerpt for Session 2",
        "```markdown",
        _slice_session2_spec(spec_md),
        "```",
        "",
        "## Pre-session check completed during this session",
        "",
        "**PyPI name availability.** `dabbler-ai-router` is available "
        "on PyPI as of 2026-05-02 — `httpx.get('https://pypi.org/pypi/"
        "dabbler-ai-router/json')` returned status 404. No fallback "
        "name needed; the spec's risk-section fallbacks "
        "(`dabbler-airouter`, `dabbler-router`) are not invoked. "
        "Recorded in the release-process doc's Naming section.",
        "",
        "## Deliverables",
        "",
        "### 1. New `.github/workflows/release.yml` (OIDC trusted publishing)",
        "",
        "```yaml",
        release_yml,
        "```",
        "",
        "### 2. New `docs/planning/release-process.md` (release runbook)",
        "",
        "```markdown",
        release_process_md,
        "```",
        "",
        "### 3. README.md — Adopting section collapsed to one-liner + tuning + first-set",
        "",
        "Section was a 60-line walkthrough at end of Session 1 (six "
        "numbered steps walking through copying `ai_router/` and "
        "`pyproject.toml`, setting API keys, `pip install -e .`, "
        "importing, tuning, authoring first set). Now collapsed to "
        "the spec's target shape: one fenced block with the install "
        "command + import line + a short bulleted list (API keys, "
        "tuning, first set), plus two foot-notes (editable / source "
        "install for fork-trackers, and a forward-reference to "
        "Session 3's `Dabbler: Install ai-router` command).",
        "",
        "```markdown",
        _slice_adoption_section(readme_md),
        "```",
        "",
        "### 4. tools/dabbler-ai-orchestration/README.md — Requirements section update",
        "",
        "Added a v0.1+ PyPI note to the existing Requirements section "
        "(does not duplicate the README adoption section; just makes "
        "the install path explicit and forward-references Session 3's "
        "install command).",
        "",
        "```markdown",
        _slice_extension_requirements(extension_readme_md),
        "```",
        "",
        "### 5. pyproject.toml — packaging tightening",
        "",
        "Discovered during a local `python -m build` smoke test that "
        "the wheel was including all 35 files under `ai_router/tests/` "
        "(80 total entries vs the expected 45). The cause: "
        "`ai_router/tests/` lacks `__init__.py` and `[tool.setuptools."
        "packages.find]` was discovering it under PEP 420 implicit "
        "namespace handling. Fix: explicit `exclude = [\"ai_router."
        "tests\", \"ai_router.tests.*\"]` plus `namespaces = false` "
        "blocks both discovery paths. Post-fix wheel: 45 entries, 0 "
        "test files; package data (router-config.yaml, "
        "prompt-templates/*.md, schemas/*.json, docs/*.md) is "
        "preserved; `[project.scripts]` entries unchanged. Also "
        "added a `MANIFEST.in` for the sdist (mirrors the same "
        "exclude on the source-distribution side).",
        "",
        "```toml",
        pyproject,
        "```",
        "",
        "**MANIFEST.in:**",
        "",
        "```",
        manifest_in,
        "```",
        "",
        "### 6. ai-assignment.md — Session 2 block + Session 1 actuals appended",
        "",
        "```markdown",
        ai_assignment_md,
        "```",
        "",
        "## Local build verification",
        "",
        "`.venv/Scripts/python.exe -m build --outdir <tmp>/build-test/` "
        "produced both `dabbler_ai_router-0.1.0.tar.gz` (sdist) and "
        "`dabbler_ai_router-0.1.0-py3-none-any.whl` (wheel) cleanly. "
        "Wheel inspection (post packaging-tightening): 45 entries, "
        "0 test files, all expected package data present, "
        "entry_points.txt lists the 7 spec-named consoles "
        "(`backfill_session_state`, `close_session`, `heartbeat_status`, "
        "`queue_status`, `reconciler`, `report`, `restart_role`). The "
        "TestPyPI / PyPI publish path against this wheel is what the "
        "release workflow will exercise on the first `v0.1.0-rc1` / "
        "`v0.1.0` tag push.",
        "",
        "## Test-suite result",
        "",
        "`PYTHONPATH=. C:/Python311/python.exe -m pytest -q` against "
        "`ai_router/tests/` → **676 passed in 52.78s** (matches the "
        "Session 1 baseline; this session is doc + workflow YAML + "
        "packaging metadata only, no Python source touched, so a "
        "regression here would be surprising).",
        "",
        "## Workflow ordering note",
        "",
        "Workflow Step 6 (verification) is mode-aware; this set runs "
        "outsource-first and the verification routes synchronously "
        "through this script. The standing operator constraint "
        "restricts `ai_router` usage to end-of-session verification "
        "only — this is the only routed call this session.",
        "",
        "Per the spec's Session 2 'ends with' clause, the v0.1.0 tag "
        "push itself is **human-driven** — not automated by this "
        "script — and the close-out summary surfaces the handoff "
        "explicitly. The release workflow file is committed; whether "
        "v0.1.0 is on PyPI when Session 3 starts depends on whether "
        "the human has pushed the tag and approved the deployment "
        "environment by then.",
        "",
        "## Verification ask",
        "",
        "Evaluate whether the deliverables together satisfy the "
        "spec's Session 2 acceptance criteria. Specifically:",
        "",
        "  1. **Workflow correctness.** Does `release.yml` correctly "
        "implement OIDC trusted publishing? Are the `permissions: "
        "id-token: write` block and the `environment` references "
        "wired so a leaked / compromised secret cannot trigger an "
        "unauthorized upload? Does the tag-version-check job catch "
        "the 'tagged but didn't bump pyproject.toml' mistake before "
        "any upload? Are the two publish paths (TestPyPI for "
        "`-rc*`, PyPI for `vX.Y.Z`) gated correctly so a release "
        "candidate cannot accidentally end up on PyPI proper, and a "
        "final tag cannot accidentally end up only on TestPyPI?",
        "",
        "  2. **Runbook completeness.** Does `release-process.md` "
        "cover everything the human needs for the first release "
        "(one-time PyPI/TestPyPI trusted-publisher config, "
        "GitHub deployment-environment setup, RC verification, "
        "per-release checklist, rollback path including the "
        "PyPI 'no re-upload' constraint)? Are the failure modes "
        "table entries actionable, or do any of them just describe "
        "the symptom?",
        "",
        "  3. **README adoption-section collapse meets the spec.** "
        "Does the section now read as 'install command + tuning + "
        "first session set' (the spec's target shape) rather than "
        "the 60-line walkthrough? Does the editable / source-install "
        "fallback live below as a clearly-marked alternative for "
        "fork-trackers?",
        "",
        "  4. **Packaging-tightening doesn't break the public API.** "
        "Does the wheel's removal of `ai_router/tests/` impair any "
        "production code path? (Tests should be a development-time "
        "artifact, not a runtime concern; confirm.) Does "
        "`MANIFEST.in` cover the sdist correctly?",
        "",
        "  5. **No regressions.** Test count is still 676, build "
        "is still clean. Are there any lurking issues you can spot "
        "from the deliverables that the test suite or build wouldn't "
        "catch?",
        "",
        "Return the structured `{verdict, issues}` JSON described in "
        "the verification prompt template. Flag any required follow-up "
        "for the human's first release tag-push, or for Session 3.",
    ]

    prompt = "\n".join(prompt_lines)

    out_dir = SET_DIR / "session-reviews"
    out_dir.mkdir(parents=True, exist_ok=True)
    prompt_path = out_dir / "session-002-prompt.md"
    prompt_path.write_text(prompt, encoding="utf-8")
    print(f"Wrote prompt: {prompt_path} ({len(prompt)} chars)")

    print("Routing session-verification call (cross-provider)...")
    result = route(
        content=prompt,
        task_type="session-verification",
        complexity_hint=70,
        session_set=str(SET_DIR),
        session_number=2,
    )

    review_path = out_dir / "session-002.md"
    review_path.write_text(result.content, encoding="utf-8")
    print(f"Wrote review: {review_path} ({len(result.content)} chars)")

    print(
        "Verifier model:",
        getattr(result, "model_name", None) or getattr(result, "model", None),
    )
    print(
        "Cost USD:",
        getattr(result, "cost_usd", None)
        or getattr(result, "total_cost_usd", None),
    )

    print("--- Verifier output (first 4000 chars) ---")
    print(result.content[:4000])

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
