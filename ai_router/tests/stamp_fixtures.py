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

from pathlib import Path

from verification_stamp import (
    STAMP_SOURCE_VERIFY_SESSION,
    TEMPLATE_ID,
    sha256_hex,
    template_sha256,
)


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
    }
    row.update(field_overrides)
    return row
