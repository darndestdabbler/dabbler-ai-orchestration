"""Evidence primitives: git tree snapshots, output hashing, replay
transcripts, and out-of-band-write detection.

Three concerns share this module because they answer one question — "can
this claim be trusted?" — with the same tools:

- **Tree snapshots** pin what the working tree actually contained at a
  moment, tracked and untracked alike, without touching the real index.
  The verification loop diffs snapshot-to-snapshot for fix-delta rounds.
- **Transcripts** make a verifier's REPRODUCED claim checkable: a trusted
  probe id (never model-authored argv), a pristine checkout, and a replay
  whose output hash must byte-match.
- **Write records** make a hand-edit to ``session-state.json`` visible:
  every sanctioned write appends the file's content hash to a machine-side
  ledger; a state file whose hash matches no record was written by
  something else.
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from .ledger import MACHINE_DIRNAME, RUNS_DIRNAME


# --- Machine-side state -----------------------------------------------------

def is_machine_state_path(path) -> bool:
    """True for anything under the router's own ``.dabbler/`` directory.

    The one place that decides what is *the record of* a session rather
    than *the work of* one. A round is appended after the tree snapshot it
    describes, so counting the ledger as session content makes every
    verified session look like it drifted the instant it was verified.
    """
    normalized = str(path).replace("\\", "/")
    if normalized.startswith("./"):
        normalized = normalized[2:]
    return (
        normalized == MACHINE_DIRNAME
        or normalized.startswith(MACHINE_DIRNAME + "/")
    )


# --- Git primitives ---------------------------------------------------------

def run_git(repo_root, *args, env=None) -> tuple:
    """``(rc, stdout, stderr)``; a missing git binary is ``rc=127``."""
    try:
        result = subprocess.run(
            ["git", "-C", str(repo_root), *args],
            capture_output=True, text=True, encoding="utf-8",
            errors="replace", env=env,
        )
    except FileNotFoundError:
        return 127, "", "git not available on PATH"
    # stdout drops only the newline framing: porcelain status columns are
    # positional, and the first line may legitimately begin with a space.
    return result.returncode, result.stdout.strip("\n"), result.stderr.strip()


def repo_root_for(path) -> Optional[str]:
    rc, out, _ = run_git(Path(path), "rev-parse", "--show-toplevel")
    return out if rc == 0 and out else None


def snapshot_worktree_tree(repo_root) -> Optional[str]:
    """A tree object capturing tracked AND untracked non-ignored files,
    via a throwaway index — the real index and worktree are untouched.
    Both ends of a fix-delta diff must be snapshots like this one: a
    tree-vs-worktree diff reports an untracked file as deleted.

    The machine-side ``.dabbler/`` directory is dropped unconditionally,
    so the ledger cannot appear in a snapshot even in a repo that never
    got the ignore rule (or that committed the ledger before it did)."""
    fd, tmp_index = tempfile.mkstemp(prefix="dabbler-verify-index-")
    os.close(fd)
    os.unlink(tmp_index)  # let git create it
    env = dict(os.environ, GIT_INDEX_FILE=tmp_index)
    try:
        rc, _, _ = run_git(repo_root, "read-tree", "HEAD", env=env)
        if rc != 0:
            rc, _, _ = run_git(repo_root, "read-tree", "--empty", env=env)
            if rc != 0:
                return None
        rc, _, _ = run_git(repo_root, "add", "-A", env=env)
        if rc != 0:
            return None
        # After the add, so it also clears entries inherited from HEAD.
        # rc is ignored: --ignore-unmatch makes "nothing to drop" normal.
        run_git(
            repo_root, "rm", "--cached", "-r", "-f", "--ignore-unmatch",
            "-q", "--", MACHINE_DIRNAME, env=env,
        )
        rc, out, _ = run_git(repo_root, "write-tree", env=env)
        return out if rc == 0 and out else None
    finally:
        try:
            os.unlink(tmp_index)
        except OSError:
            pass


def changed_paths_between(repo_root, tree_a: str, tree_b: str) -> Optional[list]:
    """Repo-relative paths differing between two trees, or ``None`` on git
    failure (callers fail closed)."""
    rc, out, _ = run_git(
        repo_root, "diff", "--name-only", "-z", "--no-ext-diff",
        tree_a, tree_b,
    )
    if rc != 0:
        return None
    return [p for p in out.split("\0") if p]


# --- Output hashing and replay transcripts ----------------------------------

EVIDENCE_REPRODUCED = "REPRODUCED"
EVIDENCE_ASSERTED = "ASSERTED"
EVIDENCE_HYPOTHESIS = "HYPOTHESIS"
EVIDENCE_TIERS = (EVIDENCE_REPRODUCED, EVIDENCE_ASSERTED, EVIDENCE_HYPOTHESIS)
DEFAULT_EVIDENCE_TIER = EVIDENCE_ASSERTED

PUBLIC_ENTRYPOINT_KINDS = (
    "public_command", "public_api", "cli", "test_entrypoint",
)
ENTRYPOINT_AGENT_HARNESS = "agent_harness"


def hash_output(raw) -> str:
    """``sha256:<hex>`` of the raw, unsummarized text — no normalization,
    no trimming; the prefix is part of the value."""
    if not isinstance(raw, str):
        raw = "" if raw is None else str(raw)
    return "sha256:" + hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _validate_entrypoint(entrypoint, reasons: list) -> None:
    if not isinstance(entrypoint, dict):
        reasons.append("transcript needs an entrypoint object")
        return
    kind = entrypoint.get("kind")
    if kind == ENTRYPOINT_AGENT_HARNESS:
        reasons.append(
            "an agent-built harness cannot be the oracle for its own "
            "finding; drive a public entrypoint instead"
        )
    elif kind not in PUBLIC_ENTRYPOINT_KINDS:
        reasons.append(
            f"entrypoint.kind must be one of {list(PUBLIC_ENTRYPOINT_KINDS)}"
        )
    ref = entrypoint.get("ref")
    if not isinstance(ref, str) or not ref.strip():
        reasons.append("entrypoint.ref must be a non-empty string")


def _validate_exit_code(value, label: str, reasons: list) -> None:
    if value is not None and (
        isinstance(value, bool) or not isinstance(value, int)
    ):
        reasons.append(f"{label} must be an integer or null")


def validate_transcript(transcript) -> tuple:
    """``(ok, reasons)`` — accumulates every reason. The trust rules: a
    trusted probe identifier (commandId XOR templateId, never model-authored
    argv), a pristine checkout, raw output with its hash, a public
    entrypoint, and a pristine replay whose hash byte-matches."""
    if not isinstance(transcript, dict):
        return False, ["transcript is missing or not an object"]
    reasons: list = []

    pinned = transcript.get("pinnedRef")
    if not isinstance(pinned, str) or not pinned.strip():
        reasons.append("pinnedRef must be a non-empty string")

    has_command = "commandId" in transcript
    has_template = "templateId" in transcript
    if has_command and has_template:
        reasons.append(
            "transcript carries both commandId and templateId; exactly one "
            "trusted-probe identifier is required"
        )
    elif not (has_command or has_template):
        reasons.append(
            "transcript needs a commandId OR a templateId (a trusted, "
            "operator-authored probe identifier - never model-authored argv)"
        )

    args = transcript.get("args")
    if args is not None and not isinstance(args, (dict, list)):
        reasons.append("args must be an object or an array")
    if transcript.get("pristineCheckout") is not True:
        reasons.append("pristineCheckout must be true")
    if "exitCode" not in transcript:
        reasons.append("exitCode is required (null means killed/timed out)")
    else:
        _validate_exit_code(transcript["exitCode"], "exitCode", reasons)
    if not isinstance(transcript.get("rawOutput"), str):
        reasons.append("rawOutput must be the raw, unsummarized text")
    output_hash = transcript.get("outputHash")
    if not isinstance(output_hash, str) or not output_hash:
        reasons.append("outputHash must be a non-empty string")

    _validate_entrypoint(transcript.get("entrypoint"), reasons)

    replay = transcript.get("replay")
    if not isinstance(replay, dict):
        reasons.append("replay (a second, fresh checkout) is required")
    else:
        if replay.get("pristineCheckout") is not True:
            reasons.append("replay.pristineCheckout must be true")
        if "exitCode" in replay:
            _validate_exit_code(replay["exitCode"], "replay.exitCode", reasons)
        replay_hash = replay.get("outputHash")
        if not isinstance(replay_hash, str) or not replay_hash:
            reasons.append("replay.outputHash must be a non-empty string")
        elif isinstance(output_hash, str) and replay_hash != output_hash:
            reasons.append(
                "the replay did not reproduce the same raw result, so the "
                "finding is not a re-runnable falsifier"
            )
    return not reasons, reasons


@dataclass(frozen=True)
class EvidenceResult:
    ok: bool
    code: str
    tier: str
    reasons: tuple = ()


def validate_finding_evidence(finding) -> EvidenceResult:
    if not isinstance(finding, dict):
        return EvidenceResult(False, "evidence-not-an-object",
                              DEFAULT_EVIDENCE_TIER)
    tier = finding.get("evidenceTier")
    if tier is None:
        return EvidenceResult(True, "evidence-ok", DEFAULT_EVIDENCE_TIER)
    if tier not in EVIDENCE_TIERS:
        return EvidenceResult(
            False, "evidence-unknown-tier", DEFAULT_EVIDENCE_TIER,
            (f"unknown evidenceTier {tier!r}",),
        )
    if tier != EVIDENCE_REPRODUCED:
        return EvidenceResult(True, "evidence-ok", tier)
    transcript = finding.get("transcript")
    if transcript is None:
        return EvidenceResult(
            False, "reproduced-no-transcript", EVIDENCE_ASSERTED,
            ("REPRODUCED claims require a transcript",),
        )
    ok, reasons = validate_transcript(transcript)
    if ok:
        return EvidenceResult(True, "evidence-ok", EVIDENCE_REPRODUCED)
    return EvidenceResult(
        False, "reproduced-bad-transcript", EVIDENCE_ASSERTED, tuple(reasons)
    )


def authoritative_tier(proposed_tier, transcript) -> str:
    """The trust rule: a valid transcript earns REPRODUCED; otherwise the
    claim collapses to HYPOTHESIS (when proposed) or ASSERTED. The tier is
    stamped by the orchestrator post-hoc, never self-awarded."""
    if transcript is not None and validate_transcript(transcript)[0]:
        return EVIDENCE_REPRODUCED
    if proposed_tier == EVIDENCE_HYPOTHESIS:
        return EVIDENCE_HYPOTHESIS
    return EVIDENCE_ASSERTED


# --- Out-of-band-write detection for session-state.json ---------------------

_STATE_WRITES_FILENAME = "state-writes.jsonl"


def _state_writes_path(repo_root, set_slug: str) -> Path:
    return Path(repo_root) / RUNS_DIRNAME / str(set_slug) / _STATE_WRITES_FILENAME


def state_file_hash(set_dir) -> Optional[str]:
    path = Path(set_dir) / "session-state.json"
    try:
        return hash_output(path.read_text(encoding="utf-8"))
    except OSError:
        return None


def record_state_write(set_dir, repo_root=None) -> None:
    """Called by the sanctioned writers after every session-state.json
    write. Best-effort: outside a git repo (unit tests, scratch dirs) the
    record is simply not kept."""
    root = repo_root or repo_root_for(set_dir)
    if root is None:
        return
    digest = state_file_hash(set_dir)
    if digest is None:
        return
    path = _state_writes_path(root, Path(set_dir).name)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps({"hash": digest}) + "\n")
    except OSError:
        pass


def detect_out_of_band_write(
    set_dir, repo_root=None, *, require_record: bool = False
) -> Optional[str]:
    """``None`` when the current session-state.json content matches some
    sanctioned write; otherwise a reason string. With *require_record*
    (the close gate's mode) an absent or empty record is itself a finding —
    absence is the signature a fully-simulated session leaves."""
    root = repo_root or repo_root_for(set_dir)
    if root is None:
        return "not inside a git repository" if require_record else None
    current = state_file_hash(set_dir)
    if current is None:
        return "session-state.json is unreadable"
    path = _state_writes_path(root, Path(set_dir).name)
    recorded = set()
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                try:
                    row = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if isinstance(row, dict) and isinstance(row.get("hash"), str):
                    recorded.add(row["hash"])
    except FileNotFoundError:
        return (
            "no sanctioned-writer record exists for session-state.json "
            "(state-writes ledger absent)" if require_record else None
        )
    except OSError as exc:
        return f"state-writes ledger unreadable ({exc})"
    if not recorded:
        return (
            "the state-writes ledger is empty" if require_record else None
        )
    if current not in recorded:
        return (
            "session-state.json content matches no sanctioned write — it "
            "was edited out of band"
        )
    return None
