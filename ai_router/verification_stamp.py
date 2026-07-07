"""Set 084 S2 (F3) — the verification-evidence stamp.

**Who uses this:** ``verify_session`` (and the ``close_session``
backstop) build the stamp; ``route()`` completes it at record time;
``metrics.record_call`` writes it onto the ``session-verification``
row; ``gate_checks.check_verification_integrity`` validates it at
close. One module so every producer and the consumer agree on the
field set and the hashing rules (L-069-1).

What the stamp is
-----------------
Additive fields on a ``session-verification`` metrics row (one per
:data:`STAMP_FIELDS` entry — that tuple is the authoritative list; all
``None`` on historical rows — the Set 078 additive-schema pattern):

- ``source`` — which sanctioned surface produced the row:
  ``"verify_session_cli"`` (Step 6) or ``"close_session_backstop"``
  (the Set 084 close backstop). A bare ``route()`` call writes no
  stamp, so its row can no longer corroborate a close.
- ``evidence_sha256`` — SHA-256 of the complete filled verification
  prompt (UTF-8), binding the row to the exact evidence bundle the
  verifier reviewed.
- ``template_id`` / ``template_sha256`` — the canonical adversarial
  template's versioned id and its **normalized** content hash (the
  consensus "missing half of F3"): a row not bound to the template
  lets diluted hand-rolled reviews creep back. The id lives in code
  (:data:`TEMPLATE_ID`), NOT in the template file — the template's
  framing is a hard constraint (L-069-2) and stays untouched; an
  operator template change is an explicit version bump here, never
  an accidental pass.
- ``verifier_model`` — the model that actually answered (filled by
  ``route()`` post-escalation). Must equal the row's own ``model``
  field; the duplication is a deliberate internal-consistency check.
- ``orchestrator_effective_provider`` — the exclusion that was
  applied (Set 084 F1/F2: registry-resolved from the orchestrator
  block's model, never the free-text seat label).
- ``artifact_path`` / ``artifact_sha256`` — the raw
  ``sN-verification*.md`` artifact (repo-relative POSIX path) and
  the SHA-256 of its exact bytes. The producer writes the artifact
  with ``newline=""`` so the on-disk bytes equal
  ``content.encode("utf-8")`` — the hash is computed from the
  routed response before the file exists.
- ``package_version`` — the ``dabbler-ai-router`` version that
  produced the row.

Framing (consensus-confirmed, spec F3): this is **drift/affordance
control, not cryptography**. A determined orchestrator forging the
full stamped artifact set is out of scope (spec residual 2); the
stamp raises the floor from "lazy shortcut" to "deliberate
multi-artifact forgery". Never document it as tamper-proof.
"""

from __future__ import annotations

import hashlib
import os
import re
from pathlib import Path
from typing import List, Optional, Tuple


# The sanctioned producer surfaces. Anything else (including absence)
# fails validation — a bare route() row carries source=None.
STAMP_SOURCE_VERIFY_SESSION = "verify_session_cli"
STAMP_SOURCE_CLOSE_BACKSTOP = "close_session_backstop"
STAMP_SOURCES = (STAMP_SOURCE_VERIFY_SESSION, STAMP_SOURCE_CLOSE_BACKSTOP)

# Versioned template id, minted in CODE so the canonical template file
# stays byte-identical (L-069-2 — the hash protects the framing; the id
# never rides inside it). An operator who deliberately revises the
# template bumps this constant in the same change — the PINNED hash
# registry below makes an unbumped edit fail closed rather than pass
# accidentally.
TEMPLATE_ID = "session-verification-v1"

# The immutable id -> normalized-hash registry (I-084-S2-2): each
# version id pins exactly one normalized content hash, recorded here at
# the moment the version is minted. This — not a comparison against
# whatever the template file currently says — is what makes "an
# operator template change is an explicit version bump, never an
# accidental pass" true for NEWLY produced rows too: an edited template
# under an unbumped id mismatches its pin, so the producer refuses to
# stamp against it and the consumer refuses rows claiming it. Revising
# the template = new TEMPLATE_ID + new pinned entry, in one change.
TEMPLATE_HASHES = {
    "session-verification-v1": (
        "9d7c1f0cb474498187a2210076b8631dd3a0642a53375cea17e404088dfc45de"
    ),
}

# The stamp fields, in the order they appear on the row. The metrics
# writer and the gate validator both key off this tuple.
STAMP_FIELDS = (
    "source",
    "evidence_sha256",
    "template_id",
    "template_sha256",
    "verifier_model",
    "orchestrator_effective_provider",
    "artifact_path",
    "artifact_sha256",
    "package_version",
    # I-084-S2-5 (the dogfood's own round-3 finding): bind the row to
    # the REPO STATE it verified, so evidence produced at commit A can
    # never settle a close performed after further work landed.
    # ``evidence_base`` is the resolved sha the evidence diff was taken
    # against; ``work_diff_sha256`` hashes the canonical work diff
    # (base -> working tree, under the work-diff exclusions) —
    # recomputable at close time because the sanctioned flows land
    # exactly the reviewed tree: any post-verification work change
    # makes the recomputation mismatch and the row goes stale (fails
    # closed; the backstop then runs a fresh round).
    "evidence_base",
    "work_diff_sha256",
    # I-084-S2-7 (round 4): the VERDICT is part of the evidence. It is
    # parsed from the same response bytes artifact_sha256 binds, at
    # record time, so a hand-flipped disposition claim can never ride a
    # row whose verifier actually said otherwise — the close gate
    # requires claim == stamped verdict.
    "verdict",
)

# Git's well-known empty-tree object — the diff base for a session in a
# repo with no pre-session commit (a fresh repo's first session): the
# session's work IS the whole tree, and diffing against the empty tree
# hands the verifier exactly that instead of a silently empty bundle
# (I-084-S2-6).
GIT_EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904"

# The canonical exclusion sets for the work-diff freshness hash,
# deliberately NARROW (I-084-S2-5, round-4 refinement: excluding the
# whole session-set tree or all of docs/planning let substantive work
# in those locations ride stale evidence). Two layers:
#
# - WORK_DIFF_BASE_EXCLUDES — repo-wide generated bundles (the evidence
#   diff's own exclusions) plus the metrics ledger.
# - WORK_DIFF_SET_BOOKKEEPING — the exact per-set files the sanctioned
#   flows legitimately touch AFTER the verification reviewed the work:
#   the raw verification artifacts + findings envelopes (written from
#   the routed response after evidence assembly), the disposition
#   (verdict-patched), the lifecycle ledgers (events appended during
#   close; steps logged at boundaries), and the state snapshot (flipped
#   at close). Everything else in the set dir — spec.md,
#   ai-assignment.md, change-log.md, UAT checklists — is session WORK
#   and binds: a post-verification change makes the row stale.
#
# One definition, used by the producers, the consumer, and the test
# fixtures alike (L-069-1).
WORK_DIFF_BASE_EXCLUDES = (
    "dist",
    "out",
    "node_modules",
    ".venv",
    "__pycache__",
    "*.vsix",
)

WORK_DIFF_SET_BOOKKEEPING = (
    "s*-verification*.md",
    "s*-issues*.json",
    "disposition.json",
    "session-events.jsonl",
    "session-state.json",
    "activity-log.json",
    # Generated at close-out by the workflow itself ("on last session:
    # generates change-log.md") and policed by its own dedicated gate
    # (change_log_fresh) — close-out bookkeeping, not reviewed work.
    "change-log.md",
    # The close lock exists exactly while the close (and therefore the
    # freshness recompute) runs — same tolerance the working-tree
    # gate's ignore patterns give it.
    ".lifecycle.lock",
    ".close_session.lock",
)

_HEX_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")

_THIS_DIR = Path(__file__).resolve().parent
_TEMPLATE_PATH = _THIS_DIR / "prompt-templates" / "verification.md"


def sha256_hex(data: bytes) -> str:
    """SHA-256 of *data* as lowercase hex."""
    return hashlib.sha256(data).hexdigest()


def is_hex_sha256(value: object) -> bool:
    """True when *value* is a lowercase 64-hex-char SHA-256 string."""
    return isinstance(value, str) and bool(_HEX_SHA256_RE.match(value))


def normalize_template_text(text: str) -> str:
    """Whitespace-normalize template content for hashing.

    Line endings collapse to ``\\n``, trailing whitespace per line is
    stripped, and leading/trailing blank lines are dropped — so a CRLF
    checkout, a trailing-newline edit, or editor-added trailing spaces
    never change the hash, while ANY change to the template's words
    does (the drift the hash exists to catch).
    """
    unified = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = [line.rstrip() for line in unified.split("\n")]
    return "\n".join(lines).strip("\n")


def load_canonical_template() -> str:
    """The canonical push verification template's raw content."""
    return _TEMPLATE_PATH.read_text(encoding="utf-8")


def template_sha256(template_text: Optional[str] = None) -> str:
    """Normalized SHA-256 of the canonical template (or *template_text*)."""
    if template_text is None:
        template_text = load_canonical_template()
    return sha256_hex(normalize_template_text(template_text).encode("utf-8"))


def package_version() -> str:
    """The dabbler-ai-router package version, best-effort.

    Lazy triple fallback (installed metadata, then the sibling
    ``__init__.py``'s ``__version__`` line, then ``"unknown"``) so the
    stamp works identically under pip-install and under the test
    harness's bare-module sys.path shim. Never raises.
    """
    try:
        from importlib.metadata import version

        return version("dabbler-ai-router")
    except Exception:
        pass
    try:
        init_text = (_THIS_DIR / "__init__.py").read_text(encoding="utf-8")
        match = re.search(
            r'^__version__\s*=\s*["\']([^"\']+)["\']', init_text, re.M
        )
        if match:
            return match.group(1)
    except OSError:
        pass
    return "unknown"


def build_stamp(
    *,
    source: str,
    evidence_sha256: str,
    orchestrator_effective_provider: str,
    artifact_path: str,
    evidence_base: str,
    work_diff_sha256: str,
    template_text: Optional[str] = None,
) -> dict:
    """Assemble the producer-side stamp (pre-route).

    ``verifier_model`` and ``artifact_sha256`` are deliberately absent:
    ``route()`` fills them at record time — the verifier model is only
    known post-escalation, and the artifact hash is the hash of the
    routed response itself. Raises ``ValueError`` on a source outside
    :data:`STAMP_SOURCES` (the producer set is closed by design).
    """
    if source not in STAMP_SOURCES:
        raise ValueError(
            f"stamp source must be one of {STAMP_SOURCES!r} (got {source!r})"
        )
    # I-084-S2-2: the producer refuses to stamp against a template whose
    # normalized hash does not match TEMPLATE_ID's pinned entry — an
    # edited-but-unbumped template fails LOUD at production time, never
    # producing a row that claims the unbumped version.
    current_hash = template_sha256(template_text)
    pinned_hash = TEMPLATE_HASHES.get(TEMPLATE_ID)
    if current_hash != pinned_hash:
        raise ValueError(
            f"the verification template's normalized hash ({current_hash}) "
            f"does not match the hash pinned for {TEMPLATE_ID!r} "
            f"({pinned_hash}). The template changed without an explicit "
            "version bump — mint a new TEMPLATE_ID with a new pinned "
            "entry in TEMPLATE_HASHES (one change), or restore the "
            "canonical template. Refusing to stamp (fails closed)."
        )
    return {
        "source": source,
        "evidence_sha256": evidence_sha256,
        "template_id": TEMPLATE_ID,
        "template_sha256": current_hash,
        "orchestrator_effective_provider": orchestrator_effective_provider,
        "artifact_path": artifact_path,
        "package_version": package_version(),
        "evidence_base": evidence_base,
        "work_diff_sha256": work_diff_sha256,
    }


def complete_stamp(
    stamp: dict, *, verifier_model: str, response_content: str
) -> dict:
    """Return the record-time stamp: producer fields + the
    route()-filled fields — ``verifier_model``, ``artifact_sha256``
    over the response's UTF-8 bytes (the exact bytes the producer
    writes), and the ``verdict`` parsed from those same bytes
    (I-084-S2-7: the verdict is stamped from the content the artifact
    hash binds, so a later hand-flipped disposition claim can never
    ride this row)."""
    try:
        from .verification import parse_verification_response
    except ImportError:
        from verification import parse_verification_response  # type: ignore[no-redef]

    completed = dict(stamp)
    completed["verifier_model"] = verifier_model
    completed["artifact_sha256"] = sha256_hex(
        response_content.encode("utf-8")
    )
    verdict, _issues = parse_verification_response(response_content)
    completed["verdict"] = verdict
    return completed


def resolve_commitish(repo_root: Path, ref: str) -> Optional[str]:
    """Resolve *ref* to a full sha in *repo_root*, or None.

    Accepts the empty-tree hash verbatim (it is a tree, not a commit,
    so ``rev-parse <sha>^{commit}`` would refuse it).
    """
    if ref == GIT_EMPTY_TREE:
        return GIT_EMPTY_TREE
    import subprocess

    proc = subprocess.run(
        ["git", "-C", str(repo_root), "rev-parse", "--verify",
         f"{ref}^{{commit}}"],
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0:
        return None
    sha = proc.stdout.decode("utf-8", errors="replace").strip()
    return sha or None


def compute_work_diff_sha256(
    session_set_dir: Path, base: str
) -> Optional[str]:
    """The freshness digest: SHA-256 over the session's work state.

    A canonical content digest — one ``path\\0blob-hash`` line per file
    that differs from *base* (tracked changes AND untracked additions;
    a deletion digests as a marker), under the work-diff exclusions —
    rather than raw ``git diff`` bytes: an untracked deliverable is
    invisible to ``git diff`` (L-064-9) but becomes diff-visible the
    moment the sanctioned flow commits it, so a raw-diff hash would go
    stale on every session that creates a new file. The content digest
    is stable across the untracked→tracked transition and changes
    exactly when any bound file's CONTENT changes — which is the
    staleness the check exists to catch (I-084-S2-5).

    Returns ``None`` when the repo cannot be resolved or git fails —
    the caller fails closed.
    """
    import subprocess

    repo_root: Optional[Path] = None
    cur = Path(session_set_dir).resolve()
    for candidate in (cur, *cur.parents):
        if (candidate / ".git").exists():
            repo_root = candidate
            break
    if repo_root is None:
        return None
    set_rel = repo_relative_posix(cur, repo_root)
    excludes = [
        *(f"{set_rel}/{name}" for name in WORK_DIFF_SET_BOOKKEEPING),
        "*router-metrics.jsonl",
        *WORK_DIFF_BASE_EXCLUDES,
    ]
    pathspecs = [".", *(f":(exclude){pattern}" for pattern in excludes)]

    def _git_z(*args: str) -> Optional[List[str]]:
        proc = subprocess.run(
            ["git", "-C", str(repo_root), "-c", "core.quotepath=false",
             *args],
            capture_output=True,
            check=False,
        )
        if proc.returncode != 0:
            return None
        out = proc.stdout.decode("utf-8", errors="replace")
        return [p for p in out.split("\0") if p]

    changed = _git_z(
        "diff", "--name-only", "-z", "--no-ext-diff", base, "--", *pathspecs,
    )
    untracked = _git_z(
        "ls-files", "--others", "--exclude-standard", "-z", "--",
        *pathspecs,
    )
    if changed is None or untracked is None:
        return None

    lines: List[str] = []
    for rel in sorted(set(changed) | set(untracked)):
        target = repo_root / rel
        try:
            file_hash = sha256_hex(target.read_bytes())
        except OSError:
            file_hash = "deleted"
        lines.append(f"{rel}\0{file_hash}")
    return sha256_hex("\n".join(lines).encode("utf-8"))


def repo_relative_posix(path: Path, repo_root: Path) -> str:
    """*path* rendered repo-relative with forward slashes (falls back to
    the absolute POSIX form when *path* is outside *repo_root*)."""
    try:
        rel = os.path.relpath(os.path.abspath(str(path)), str(repo_root))
    except ValueError:
        rel = os.path.abspath(str(path))
    return rel.replace(os.sep, "/")


# ---------------------------------------------------------------------------
# Consumer-side validation (the Set 084 F3 gate layer)
# ---------------------------------------------------------------------------

def validate_stamped_row(
    row: dict,
    *,
    session_set_dir: str,
    session_number: int,
    orchestrator_effective_provider: str,
    models_registry: Optional[dict] = None,
    repo_root: Optional[str] = None,
) -> Tuple[bool, str]:
    """Return ``(ok, reason)`` for one ``session-verification`` row.

    Every check fails closed — a missing or inconsistent field is a
    refusal, never a pass. The checks, in order:

    1. ``source`` is one of the sanctioned producers.
    2. ``evidence_sha256`` is a well-formed SHA-256 (it cannot be
       recomputed at close — the working tree has moved on — so the
       binding value is presence + format; the artifact hash below is
       the recomputable half).
    3. ``template_id`` + ``template_sha256`` match the CURRENT
       canonical template (id from :data:`TEMPLATE_ID`, normalized
       hash from disk). An operator template edit without a version
       bump — or a diluted hand-rolled template — mismatches here.
    4. ``verifier_model`` equals the row's own ``model`` and
       registry-resolves to a provider (a stamp copied onto a
       different row's model fails).
    5. ``orchestrator_effective_provider`` equals the gate's own
       resolution of the session orchestrator AND differs from the
       verifier's resolved provider (the F2 exclusion, re-checked).
    6. ``artifact_path`` names an ``s<N>-verification*.md`` file at
       the session-set root whose bytes hash to ``artifact_sha256``.
    7. ``package_version`` is a non-empty string.
    """
    # 1. Source.
    source = row.get("source")
    if source not in STAMP_SOURCES:
        return False, (
            f"row carries no sanctioned stamp source (source={source!r}; "
            f"sanctioned: {', '.join(STAMP_SOURCES)}) — a bare route() "
            "row does not corroborate a close (Set 084 F3)"
        )

    # Presence sweep: any missing stamp field fails closed before the
    # per-field diagnostics below.
    missing = [f for f in STAMP_FIELDS if not row.get(f)]
    if missing:
        return False, (
            f"stamped row is missing field(s): {', '.join(missing)} "
            "(fails closed)"
        )

    # 2. Evidence hash format.
    if not is_hex_sha256(row.get("evidence_sha256")):
        return False, "evidence_sha256 is not a well-formed SHA-256"

    # 3. Template binding — against the PINNED id -> hash registry
    # (I-084-S2-2), not merely the file on disk: a row must claim the
    # current canonical version, its stamped hash must equal that
    # version's immutable pin, and the on-disk template must still
    # match its pin (a drifted template invalidates closes until the
    # version is explicitly bumped and re-pinned).
    if row.get("template_id") != TEMPLATE_ID:
        return False, (
            f"template_id {row.get('template_id')!r} does not match the "
            f"canonical {TEMPLATE_ID!r} — a template change is an "
            "explicit version bump, never an accidental pass"
        )
    pinned_hash = TEMPLATE_HASHES.get(TEMPLATE_ID)
    if not pinned_hash:
        return False, (
            f"{TEMPLATE_ID!r} has no pinned hash in TEMPLATE_HASHES "
            "(fails closed)"
        )
    if row.get("template_sha256") != pinned_hash:
        return False, (
            "template_sha256 does not match the hash pinned for "
            f"{TEMPLATE_ID!r} — the row was stamped against a diluted or "
            "drifted template; re-verify against the canonical template"
        )
    try:
        current_hash = template_sha256()
    except OSError as exc:
        return False, (
            f"canonical verification template unreadable "
            f"({type(exc).__name__}) — cannot confirm template binding "
            "(fails closed)"
        )
    if current_hash != pinned_hash:
        return False, (
            "the on-disk verification template's normalized hash does "
            f"not match the hash pinned for {TEMPLATE_ID!r} — the "
            "template changed without an explicit version bump; mint a "
            "new TEMPLATE_ID + pinned entry (or restore the canonical "
            "template) before any close can corroborate"
        )

    # 4. Verifier model consistency + registry resolution.
    if row.get("verifier_model") != row.get("model"):
        return False, (
            f"stamp verifier_model {row.get('verifier_model')!r} does not "
            f"equal the row's model {row.get('model')!r} (inconsistent "
            "stamp fails closed)"
        )
    try:
        from .orchestrator_identity import (  # type: ignore[import-not-found]
            resolve_model_provider,
        )
    except ImportError:
        from orchestrator_identity import (  # type: ignore[no-redef]
            resolve_model_provider,
        )
    verifier_provider = resolve_model_provider(
        row.get("model"), models_registry
    )
    if verifier_provider is None:
        return False, (
            f"the row's model {row.get('model')!r} resolves to no provider "
            "via the registry (fails closed)"
        )

    # 5. The exclusion, re-checked on the consumer side.
    if (
        row.get("orchestrator_effective_provider")
        != orchestrator_effective_provider
    ):
        return False, (
            f"stamp orchestrator_effective_provider "
            f"{row.get('orchestrator_effective_provider')!r} does not match "
            f"the resolved session orchestrator "
            f"({orchestrator_effective_provider!r})"
        )
    if verifier_provider == orchestrator_effective_provider:
        return False, (
            f"the verifier resolves to the orchestrator's own provider "
            f"({verifier_provider!r}) — not cross-provider"
        )

    # 6. Artifact binding.
    artifact_path = str(row.get("artifact_path"))
    base = repo_root if repo_root else session_set_dir
    resolved = (
        artifact_path
        if os.path.isabs(artifact_path)
        else os.path.join(base, artifact_path)
    )
    expected_prefix = f"s{session_number}-verification"
    basename = os.path.basename(resolved)
    if not (basename.startswith(expected_prefix) and basename.endswith(".md")):
        return False, (
            f"artifact_path {artifact_path!r} does not name an "
            f"{expected_prefix}*.md artifact"
        )
    if os.path.abspath(os.path.dirname(resolved)) != os.path.abspath(
        session_set_dir
    ):
        return False, (
            f"artifact_path {artifact_path!r} does not sit at the "
            "session-set root"
        )
    try:
        artifact_bytes = Path(resolved).read_bytes()
    except OSError:
        return False, (
            f"artifact {artifact_path!r} is missing or unreadable "
            "(fails closed)"
        )
    if sha256_hex(artifact_bytes) != row.get("artifact_sha256"):
        return False, (
            f"artifact {artifact_path!r} does not hash to the stamped "
            "artifact_sha256 — the artifact was edited after it was "
            "written (verification artifacts are never edited)"
        )

    # 7. Package version.
    if not isinstance(row.get("package_version"), str) or not row.get(
        "package_version"
    ):
        return False, "package_version is missing (fails closed)"

    # 8. Verdict binding (I-084-S2-7/-10): the stamped verdict is not
    # merely a legal token — it must RE-DERIVE from the artifact bytes
    # whose hash was just validated, so editing the metrics row's
    # verdict field (without touching the artifact) fails closed. The
    # claim-vs-stamp equality check lives with the consumers (the close
    # gate and the backstop's skip predicate), which know the
    # disposition's claim.
    if row.get("verdict") not in ("VERIFIED", "ISSUES_FOUND"):
        return False, (
            f"stamped verdict {row.get('verdict')!r} is not a legal "
            "token (fails closed)"
        )
    try:
        from .verification import parse_verification_response
    except ImportError:
        from verification import parse_verification_response  # type: ignore[no-redef]
    artifact_verdict, _artifact_issues = parse_verification_response(
        artifact_bytes.decode("utf-8", errors="replace")
    )
    if row.get("verdict") != artifact_verdict:
        return False, (
            f"stamped verdict {row.get('verdict')!r} does not re-derive "
            f"from the artifact's own content ({artifact_verdict!r}) — "
            "a row-level verdict edit cannot outrank the hash-bound "
            "artifact (fails closed)"
        )

    # 9. Freshness — the row must have verified THE repo state being
    # closed (I-084-S2-5). Recompute the canonical work-diff hash from
    # the stamped base against the tree as it stands now: the
    # sanctioned flows land exactly the reviewed work, so a match means
    # this evidence covers this close; any post-verification work
    # change (or an unresolvable base) mismatches and the row goes
    # stale — the close backstop then runs a fresh round.
    current_work_diff = compute_work_diff_sha256(
        Path(session_set_dir), str(row.get("evidence_base")),
    )
    if current_work_diff is None:
        return False, (
            f"the stamped evidence_base {row.get('evidence_base')!r} "
            "cannot be diffed against the current tree (fails closed)"
        )
    if current_work_diff != row.get("work_diff_sha256"):
        return False, (
            "the session's work changed after this row was stamped "
            "(work_diff_sha256 no longer matches the tree diffed from "
            f"evidence_base {str(row.get('evidence_base'))[:12]}) — "
            "stale evidence cannot settle this close; re-verify"
        )

    return True, ""


def find_valid_stamped_rows(
    rows: List[dict],
    *,
    session_set_dir: str,
    session_number: int,
    orchestrator_effective_provider: str,
    models_registry: Optional[dict] = None,
    repo_root: Optional[str] = None,
) -> Tuple[List[dict], List[str]]:
    """Split *rows* into ``(valid_stamped, rejection_reasons)``.

    *rows* are pre-filtered ``session-verification`` rows for the
    (set, session) under close. The reasons list carries one entry per
    rejected row, in row order, for the gate's refusal message.
    """
    valid: List[dict] = []
    reasons: List[str] = []
    for row in rows:
        ok, reason = validate_stamped_row(
            row,
            session_set_dir=session_set_dir,
            session_number=session_number,
            orchestrator_effective_provider=orchestrator_effective_provider,
            models_registry=models_registry,
            repo_root=repo_root,
        )
        if ok:
            valid.append(row)
        else:
            reasons.append(reason)
    return valid, reasons
