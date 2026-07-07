"""Shared Set 084 S2 (F3) stamped-evidence fixture builders.

Several test files exercise closes that must satisfy the tightened
verification-integrity gate (a ``session-verification`` metrics row now
corroborates a close only when it carries a valid, internally
consistent evidence stamp). This helper writes the paired artifact +
row so every fixture stays consistent with
``verification_stamp.validate_stamped_row`` through future stamp-field
changes (one builder, L-069-1).
"""

from __future__ import annotations

import subprocess
from pathlib import Path

from verification import parse_verification_response
from verification_stamp import (
    GIT_EMPTY_TREE,
    STAMP_SOURCE_VERIFY_SESSION,
    TEMPLATE_ID,
    compute_work_diff_sha256,
    resolve_commitish,
    sha256_hex,
    template_sha256,
)


def _git(repo: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", "-C", str(repo), *args], capture_output=True, check=False,
    )


def _ensure_repo_for(set_dir: Path) -> Path:
    """The git repo root containing *set_dir*, initializing one when the
    fixture is a plain tmp dir.

    The Set 084 freshness binding (``evidence_base`` +
    ``work_diff_sha256``) is recomputed by the gate against a real git
    tree, so every stamped fixture needs one. Fixtures already inside a
    repo are used as-is; a bare ``<tmp>/docs/session-sets/<slug>``
    layout gets a repo initialized at ``<tmp>`` with one baseline
    commit (later fixture writes are untracked additions, which git
    diff does not show, so the freshness hash stays stable across the
    test body).
    """
    cur = set_dir.resolve()
    for candidate in (cur, *cur.parents):
        if (candidate / ".git").exists():
            return candidate
    root = cur.parents[2] if len(cur.parents) >= 3 else cur.parent
    _git(root, "init", "-b", "main")
    _git(root, "config", "user.email", "fixture@example.invalid")
    _git(root, "config", "user.name", "Fixture")
    _git(root, "config", "commit.gpgsign", "false")
    _git(root, "add", "-A")
    _git(root, "commit", "--allow-empty", "-m", "fixture baseline")
    return root


def stamped_artifact_name(session_number: int, round_number: int = 1) -> str:
    if round_number <= 1:
        return f"s{session_number}-verification.md"
    return f"s{session_number}-verification-round-{round_number}.md"


def write_stamped_evidence(
    set_dir: Path,
    *,
    session_number: int = 1,
    round_number: int = 1,
    model: str = "gpt-5-4",
    provider: str = "openai",
    orchestrator_provider: str = "anthropic",
    source: str = STAMP_SOURCE_VERIFY_SESSION,
    content: str = "VERIFIED\n",
    task_type: str = "session-verification",
    write_artifact: bool = True,
    **field_overrides,
) -> dict:
    """Write the raw artifact and return one consistent stamped row.

    The defaults model the common shape: an anthropic orchestrator
    verified by gpt-5-4 through the ``verify_session`` CLI. Field
    overrides let a test break exactly one consistency rule (wrong
    template hash, missing field via ``field=None``, mismatched
    artifact hash, ...) while everything else stays valid.
    """
    artifact = set_dir / stamped_artifact_name(session_number, round_number)
    if write_artifact:
        # newline="" mirrors the producers: on-disk bytes must equal
        # content.encode("utf-8") for the artifact hash to bind.
        artifact.write_text(content, encoding="utf-8", newline="")
    # The freshness binding, computed live against the fixture's repo
    # (initialized on demand) exactly the way the producers compute it.
    repo_root = _ensure_repo_for(set_dir)
    evidence_base = resolve_commitish(repo_root, "HEAD") or GIT_EMPTY_TREE
    work_diff_sha256 = compute_work_diff_sha256(set_dir, evidence_base)
    row = {
        "task_type": task_type,
        "session_set": set_dir.name,
        "session_number": session_number,
        "provider": provider,
        "model": model,
        "source": source,
        "evidence_sha256": sha256_hex(b"fixture evidence bundle"),
        "template_id": TEMPLATE_ID,
        "template_sha256": template_sha256(),
        "verifier_model": model,
        "orchestrator_effective_provider": orchestrator_provider,
        "artifact_path": str(artifact),
        "artifact_sha256": sha256_hex(content.encode("utf-8")),
        "package_version": "0.0-test",
        "evidence_base": evidence_base,
        "work_diff_sha256": work_diff_sha256,
        # I-084-S2-7: the verdict is stamped from the same bytes the
        # artifact hash binds — parse it exactly like complete_stamp.
        "verdict": parse_verification_response(content)[0],
    }
    row.update(field_overrides)
    return row
