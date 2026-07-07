"""Set 084 S2 (F3) — verification_stamp unit tests.

The consumer-side ``validate_stamped_row`` matrix runs end-to-end in
``test_verification_integrity_gate.py`` (the gate is its one caller);
this file pins the producer-side primitives: template normalization
(an operator's whitespace/CRLF churn never changes the hash; a word
change always does), the code-minted versioned template id, stamp
assembly/completion, and the byte-exact artifact-hash contract.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

import pytest

import verification_stamp as vstamp
from verification_stamp import (
    STAMP_FIELDS,
    STAMP_SOURCE_CLOSE_BACKSTOP,
    STAMP_SOURCE_VERIFY_SESSION,
    TEMPLATE_ID,
    build_stamp,
    complete_stamp,
    is_hex_sha256,
    normalize_template_text,
    repo_relative_posix,
    sha256_hex,
    template_sha256,
)


class TestNormalization:
    def test_crlf_and_trailing_whitespace_do_not_change_the_hash(self):
        a = "## Title\n\nBody line.\n"
        b = "## Title  \r\n\r\nBody line.\r\n\r\n"
        assert template_sha256(a) == template_sha256(b)

    def test_a_word_change_always_changes_the_hash(self):
        a = "You are an adversarial independent verifier."
        b = "You are a friendly collaborative verifier."
        assert template_sha256(a) != template_sha256(b)

    def test_leading_and_trailing_blank_lines_are_dropped(self):
        assert normalize_template_text("\n\nX\n\n") == "X"

    def test_canonical_template_hashes_deterministically(self):
        assert template_sha256() == template_sha256()
        assert is_hex_sha256(template_sha256())


class TestStampAssembly:
    def _stamp(self, source=STAMP_SOURCE_VERIFY_SESSION):
        return build_stamp(
            source=source,
            evidence_sha256=sha256_hex(b"evidence"),
            orchestrator_effective_provider="anthropic",
            artifact_path="docs/session-sets/x/s1-verification.md",
        )

    def test_build_stamp_refuses_unknown_source(self):
        with pytest.raises(ValueError):
            self._stamp(source="my-own-script")

    def test_backstop_source_is_sanctioned(self):
        stamp = self._stamp(source=STAMP_SOURCE_CLOSE_BACKSTOP)
        assert stamp["source"] == STAMP_SOURCE_CLOSE_BACKSTOP

    def test_build_stamp_carries_the_code_minted_template_binding(self):
        stamp = self._stamp()
        assert stamp["template_id"] == TEMPLATE_ID
        assert stamp["template_sha256"] == template_sha256()
        assert stamp["package_version"]

    def test_complete_stamp_fills_the_route_time_halves(self):
        content = "VERIFIED -- tried hard, found nothing.\n"
        completed = complete_stamp(
            self._stamp(), verifier_model="gpt-5-4",
            response_content=content,
        )
        assert completed["verifier_model"] == "gpt-5-4"
        assert completed["artifact_sha256"] == hashlib.sha256(
            content.encode("utf-8")
        ).hexdigest()
        assert set(STAMP_FIELDS) <= set(completed)

    def test_artifact_hash_binds_to_a_newline_untranslated_write(
        self, tmp_path: Path,
    ):
        """The producers write with newline='' — the on-disk bytes must
        equal content.encode('utf-8') or the binding breaks on Windows."""
        content = "VERIFIED\nline two\n"
        completed = complete_stamp(
            self._stamp(), verifier_model="gpt-5-4",
            response_content=content,
        )
        artifact = tmp_path / "s1-verification.md"
        artifact.write_text(content, encoding="utf-8", newline="")
        assert (
            sha256_hex(artifact.read_bytes())
            == completed["artifact_sha256"]
        )


class TestHelpers:
    def test_repo_relative_posix(self, tmp_path: Path):
        target = tmp_path / "docs" / "x" / "s1-verification.md"
        assert repo_relative_posix(target, tmp_path) == (
            "docs/x/s1-verification.md"
        )

    def test_is_hex_sha256_rejects_bad_shapes(self):
        assert not is_hex_sha256(None)
        assert not is_hex_sha256("xyz")
        assert not is_hex_sha256("A" * 64)  # uppercase is not canonical
        assert is_hex_sha256("a" * 64)

    def test_package_version_never_raises(self):
        assert isinstance(vstamp.package_version(), str)
        assert vstamp.package_version()
