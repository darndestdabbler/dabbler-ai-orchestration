"""Evidence primitives: git tree snapshots, output hashing, replay
transcripts, out-of-band-write detection, and critique quote provenance.

The concerns share this module because they answer one question — "can
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
- **Critique provenance** makes a worker's evidence checkable by the
  framework rather than by the worker: a quote is re-read out of the
  reviewed tree and re-hashed here, and a declared absence search is
  re-executed here. What the worker says it saw is an input, never a
  result.
"""

from __future__ import annotations

import ast
import hashlib
import json
import os
import platform
import re
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from . import ledger
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


def read_tree_blob(repo_root, tree: str, path: str) -> Optional[bytes]:
    """The file's exact bytes as *tree* recorded them, or ``None``.

    The reviewed tree, never the working tree. The tree is pinned and the
    worktree keeps moving, so a quote checked against the worktree says
    nothing about what was reviewed — and would start passing again the
    moment an author re-typed the line it failed on. Bytes, not text:
    ``run_git`` strips newline framing, which is fine for porcelain and
    fatal for a content hash.
    """
    try:
        result = subprocess.run(
            ["git", "-C", str(repo_root), "cat-file", "blob",
             f"{tree}:{path}"],
            capture_output=True,
        )
    except (FileNotFoundError, OSError):
        return None
    return result.stdout if result.returncode == 0 else None


def tree_paths(repo_root, tree: str) -> list:
    """Every path in *tree*, repo-relative. The closed universe an absence
    search may range over."""
    rc, out, _ = run_git(repo_root, "ls-tree", "-r", "--name-only", "-z", tree)
    if rc != 0:
        return []
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


def hash_bytes(raw: bytes) -> str:
    """``sha256:<hex>`` of exact bytes. Content hashing never decodes: an
    encoding round trip is a transformation, and a quote must be pinned to
    what the tree holds rather than to one reader's view of it."""
    return "sha256:" + hashlib.sha256(raw).hexdigest()


def hash_output(raw) -> str:
    """``sha256:<hex>`` of the raw, unsummarized text — no normalization,
    no trimming; the prefix is part of the value."""
    if not isinstance(raw, str):
        raw = "" if raw is None else str(raw)
    return hash_bytes(raw.encode("utf-8"))


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


# --- Critique evidence provenance --------------------------------------------
#
# The framework checks the worker, not the other way round. A worker names
# what it saw and where; every one of those claims is re-derived here from
# the reviewed tree before it can reach the record. Nothing below routes to
# a model, and nothing below reads a verdict.


class EvidenceError(RuntimeError):
    """A refusal with a name. The code is the contract — an operator or a
    later stage sorts on ``code``, never on the prose."""

    def __init__(self, code: str, message: str):
        super().__init__(f"{code}: {message}")
        self.code = code


# --- Quote provenance --------------------------------------------------------

SPAN_KINDS = ("byte", "line")

# Only where a parser actually exists. Claiming an AST kind for a file this
# process cannot parse is refused rather than recorded unchecked: an
# unverifiable claim written down as verified is the failure this whole
# surface exists to prevent.
PARSED_SUFFIXES = (".py",)


def _line_start_offsets(blob: bytes) -> list:
    starts = [0]
    for index, char in enumerate(blob):
        if char == 0x0A:
            starts.append(index + 1)
    return starts


def _span_bounds(blob: bytes, span) -> tuple:
    """``(start, end)`` byte offsets for a declared span, half-open.

    ``byte`` spans are byte offsets; ``line`` spans are 1-based inclusive
    line numbers, which is how a human cites a file and how a worker will
    report one.
    """
    if not isinstance(span, dict):
        raise EvidenceError("quote-malformed", "span must be an object")
    kind = span.get("kind")
    start = span.get("start")
    end = span.get("end")
    if kind not in SPAN_KINDS or not all(
        isinstance(v, int) and not isinstance(v, bool) for v in (start, end)
    ):
        raise EvidenceError(
            "quote-malformed",
            f"span needs an integer start and end and a kind in "
            f"{list(SPAN_KINDS)}; got {span!r}",
        )
    if kind == "byte":
        if start < 0 or end < start or end > len(blob):
            raise EvidenceError(
                "quote-span-out-of-range",
                f"bytes {start}..{end} fall outside a {len(blob)}-byte file",
            )
        return start, end
    starts = _line_start_offsets(blob)
    if start < 1 or end < start or end > len(starts):
        raise EvidenceError(
            "quote-span-out-of-range",
            f"lines {start}..{end} fall outside a {len(starts)}-line file",
        )
    tail = starts[end] if end < len(starts) else len(blob)
    return starts[start - 1], tail


def _position_at(starts: list, offset: int) -> tuple:
    """``(lineno, col_offset)`` for a byte offset, in the units the ``ast``
    module uses: 1-based lines, and columns counted in UTF-8 bytes."""
    lineno = 1
    for index, line_start in enumerate(starts):
        if line_start > offset:
            break
        lineno = index + 1
    return lineno, offset - starts[lineno - 1]


def ast_kinds_at(blob: bytes, start: int, end: int) -> tuple:
    """The chain of AST node kinds enclosing a byte span, innermost first.

    A chain rather than a single kind, because a worker cites the token it
    read and not the node boundary: ``foo`` inside ``foo(bar)`` is a
    ``Name`` whose chain contains ``Call``. What the chain cannot contain
    is a node the span is not inside — so the same ``foo(bar)`` written
    inside a string literal yields ``Constant`` and never ``Call``, which
    is the discrimination this check exists for.
    """
    tree = ast.parse(blob)
    starts = _line_start_offsets(blob)
    span_start = _position_at(starts, start)
    span_end = _position_at(starts, max(end - 1, start))
    enclosing = []
    for node in ast.walk(tree):
        lineno = getattr(node, "lineno", None)
        end_lineno = getattr(node, "end_lineno", None)
        if lineno is None or end_lineno is None:
            continue
        node_start = (lineno, node.col_offset)
        node_end = (end_lineno, node.end_col_offset)
        if node_start <= span_start and node_end >= span_end:
            size = (
                _offset_of(starts, blob, *node_end)
                - _offset_of(starts, blob, *node_start)
            )
            enclosing.append((size, type(node).__name__))
    enclosing.sort(key=lambda item: item[0])
    return tuple(kind for _, kind in enclosing) + ("Module",)


def _offset_of(starts: list, blob: bytes, lineno: int, col: int) -> int:
    if lineno < 1 or lineno > len(starts):
        return len(blob)
    return starts[lineno - 1] + col


def verify_quote(
    repo_root, reviewed_tree: str, quote, *, required_kinds=()
) -> dict:
    """Re-derive a quote from the reviewed tree and return the framework's
    own record of it. Raises :class:`EvidenceError` on any mismatch.

    The returned ``content_hash`` is the one computed here. The worker's
    value is only ever an assertion to be tested against the tree.

    *required_kinds* comes from the check being answered, never from the
    row: a check that asks about ``Call:os.system`` is asking about calls,
    so a quote is refused unless a node of that kind encloses it. Leaving
    that to a worker-declared ``ast_kind`` would make the discrimination
    opt-in for the party it constrains.
    """
    if not isinstance(quote, dict):
        raise EvidenceError("quote-malformed", "quote must be an object")
    path = quote.get("path")
    declared_hash = quote.get("content_hash")
    if not isinstance(path, str) or not path:
        raise EvidenceError("quote-malformed", "quote needs a path")
    if not isinstance(declared_hash, str) or not declared_hash:
        raise EvidenceError(
            "quote-malformed", f"quote for {path} needs a content_hash"
        )

    blob = read_tree_blob(repo_root, reviewed_tree, path)
    if blob is None:
        raise EvidenceError(
            "quote-path-missing",
            f"{path} is not in the reviewed tree {reviewed_tree}",
        )
    start, end = _span_bounds(blob, quote["span"])
    actual = hash_bytes(blob[start:end])
    if actual != declared_hash:
        raise EvidenceError(
            "quote-hash-mismatch",
            f"the quoted span of {path} hashes to {actual}, not the "
            f"{declared_hash} the worker recorded — the quote does not "
            "come from the reviewed tree",
        )

    declared_kind = quote.get("ast_kind")
    required = tuple(required_kinds)
    wanted = (
        f"the declared ast_kind {declared_kind!r}" if declared_kind is not None
        else f"the kinds {list(required)} the check asks about"
    )
    observed_kinds: tuple = ()
    if path.endswith(PARSED_SUFFIXES):
        try:
            observed_kinds = ast_kinds_at(blob, start, end)
        except (SyntaxError, ValueError) as exc:
            if declared_kind is not None or required:
                raise EvidenceError(
                    "quote-ast-unparseable",
                    f"{path} does not parse, so {wanted} cannot be checked "
                    f"({exc})",
                ) from exc
    elif declared_kind is not None or required:
        raise EvidenceError(
            "quote-ast-unsupported",
            f"no parser here handles {path}, so {wanted} cannot be checked; "
            "an unverifiable quote is refused rather than recorded as "
            "verified",
        )
    if declared_kind is not None and declared_kind not in observed_kinds:
        raise EvidenceError(
            "quote-ast-kind-mismatch",
            f"the span quoted from {path} is enclosed by "
            f"{list(observed_kinds)}, which does not include the declared "
            f"{declared_kind!r}",
        )
    if required and not set(required) & set(observed_kinds):
        raise EvidenceError(
            "quote-contract-unsatisfied",
            f"the span quoted from {path} is enclosed by "
            f"{list(observed_kinds)}; the check asks about {list(required)}, "
            "and text that merely spells one of those is not one of those",
        )

    record = {
        "path": path,
        "content_hash": actual,
        "span": dict(quote["span"]),
    }
    if declared_kind is not None or observed_kinds:
        record["ast_kind"] = declared_kind or observed_kinds[0]
    return record


# --- Framework-executed absence search ---------------------------------------

ABSENCE_QUERY_KINDS = ("literal", "regex", "ast")

_AST_QUERY_RE = re.compile(
    r"^(?P<kind>[A-Za-z_][A-Za-z0-9_]*)"
    r"(?::(?P<name>[A-Za-z_][A-Za-z0-9_.]*))?$"
)


def _glob_to_regex(pattern: str):
    """``**`` crosses directories, ``*`` and ``?`` do not. ``fnmatch``
    would let a bare ``*.py`` swallow the whole repository, which turns a
    declared narrow scope into an undeclared wide one."""
    out = []
    index = 0
    while index < len(pattern):
        char = pattern[index]
        if char == "*":
            if pattern[index + 1:index + 2] == "*":
                out.append(".*")
                index += 2
                continue
            out.append("[^/]*")
        elif char == "?":
            out.append("[^/]")
        else:
            out.append(re.escape(char))
        index += 1
    return re.compile("^" + "".join(out) + "$")


def scope_paths(repo_root, reviewed_tree: str, scope) -> list:
    """The paths a declared scope actually resolves to in the reviewed
    tree, sorted. The scope is closed: what is not in the tree is not
    searched, and what is not matched is not silently included."""
    if not isinstance(scope, (list, tuple)) or not scope:
        raise EvidenceError(
            "absence-declaration-malformed",
            "an absence search needs a non-empty scope",
        )
    matchers = [_glob_to_regex(str(pattern)) for pattern in scope]
    return sorted(
        path for path in tree_paths(repo_root, reviewed_tree)
        if any(matcher.match(path) for matcher in matchers)
    )


def _count_ast_matches(blob: bytes, query: str, path: str) -> int:
    match = _AST_QUERY_RE.match(query)
    if match is None:
        raise EvidenceError(
            "absence-query-invalid",
            f"{query!r} is not an AST query; the form is NodeKind or "
            "NodeKind:dotted.name",
        )
    kind = match.group("kind")
    wanted = match.group("name")
    try:
        tree = ast.parse(blob)
    except (SyntaxError, ValueError) as exc:
        raise EvidenceError(
            "absence-ast-unparseable",
            f"{path} does not parse, so an AST search over it cannot come "
            f"back empty honestly ({exc})",
        ) from exc
    return sum(
        1 for node in ast.walk(tree)
        if type(node).__name__ == kind
        and (wanted is None or _node_dotted_name(node) == wanted)
    )


def _node_dotted_name(node) -> Optional[str]:
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
        return node.name
    target = node.func if isinstance(node, ast.Call) else node
    parts = []
    while isinstance(target, ast.Attribute):
        parts.append(target.attr)
        target = target.value
    if not isinstance(target, ast.Name):
        return None
    parts.append(target.id)
    return ".".join(reversed(parts))


def run_absence_search(repo_root, reviewed_tree: str, declaration) -> dict:
    """Re-run a declared search here and return the framework's row.

    A worker's assertion that it searched is not evidence that it
    searched, so the count in the returned row is this function's, and the
    tool that produced it is named. A scope that resolves to no file is
    refused: absence over nothing is the cheapest false proof there is.
    """
    if not isinstance(declaration, dict):
        raise EvidenceError(
            "absence-declaration-malformed",
            "an absence search must be an object",
        )
    query = declaration.get("query")
    query_kind = declaration.get("query_kind")
    if not isinstance(query, str) or not query:
        raise EvidenceError(
            "absence-declaration-malformed", "the query must be a string"
        )
    if query_kind not in ABSENCE_QUERY_KINDS:
        raise EvidenceError(
            "absence-declaration-malformed",
            f"query_kind must be one of {list(ABSENCE_QUERY_KINDS)}",
        )
    scope = declaration.get("scope")
    selected = scope_paths(repo_root, reviewed_tree, scope)
    if query_kind == "ast":
        selected = [p for p in selected if p.endswith(PARSED_SUFFIXES)]
    if not selected:
        raise EvidenceError(
            "absence-scope-empty",
            f"scope {list(scope)} matches nothing searchable in the "
            f"reviewed tree {reviewed_tree}; an absence proved over an "
            "empty scope proves nothing",
        )

    if query_kind == "regex":
        try:
            pattern = re.compile(query)
        except re.error as exc:
            raise EvidenceError(
                "absence-query-invalid", f"{query!r} is not a regex ({exc})"
            ) from exc
    elif query_kind == "literal":
        pattern = re.compile(re.escape(query))

    matches = 0
    for path in selected:
        blob = read_tree_blob(repo_root, reviewed_tree, path)
        if blob is None:
            raise EvidenceError(
                "absence-scope-unreadable",
                f"{path} is in the declared scope but unreadable from the "
                f"reviewed tree {reviewed_tree}",
            )
        if query_kind == "ast":
            matches += _count_ast_matches(blob, query, path)
        else:
            matches += sum(
                1 for _ in pattern.finditer(blob.decode("utf-8", "replace"))
            )

    tool = "python-ast" if query_kind == "ast" else "python-re"
    return {
        "query": query,
        "query_kind": query_kind,
        "scope": [str(pattern) for pattern in scope],
        "tool_version": f"{tool}/{platform.python_version()}",
        "matches": matches,
    }


# --- The unprovable-absence ladder, and the one-way door out of blocked -------

UNPROVABLE_ABSENCE_LADDER = (
    "deterministic-test-or-analyzer",
    "narrower-positive-counterexample",
    "blocked-with-manager-adjudication",
    "human-review",
)

# Blocked for one of these means the worker ran out of reach, not that the
# code is clean. The next attempt may have a bigger budget; a bigger budget
# is not evidence, so it cannot move the result on its own.
UNDISCHARGEABLE_BLOCKED_REASONS = (
    "unprovable-absence",
    "authorized-pulls-insufficient",
    "bounds-exhausted",
    "tooling-unavailable",
)


def next_absence_fallback(exhausted=()) -> Optional[str]:
    """The next rung for a claim that cannot be proved by search, in the
    plan's order. ``None`` means human review has already been reached —
    which is the end of the ladder, never a licence to pass."""
    spent = tuple(exhausted)
    for rung in UNPROVABLE_ABSENCE_LADDER:
        if rung not in spent:
            return rung
    return None


def contract_ast_kinds(check) -> tuple:
    """The node kinds a check's own vocabulary requires of a quote.

    Read out of the check, never out of the row it is answering. Only the
    ``Kind:dotted.name`` form counts: a bare operand like ``docstring`` is
    prose about the file, while ``Call:os.system`` is a question about
    calls and can only be answered by quoting one.
    """
    kinds = set()
    pending = [(check or {}).get("condition"), (check or {}).get("branch")]
    while pending:
        node = pending.pop()
        if isinstance(node, dict):
            pending.extend(node.values())
        elif isinstance(node, (list, tuple)):
            pending.extend(node)
        elif isinstance(node, str) and ":" in node:
            match = _AST_QUERY_RE.match(node)
            if match is not None:
                kinds.add(match.group("kind"))
    return tuple(sorted(kinds))


def verify_worker_result(
    repo_root, reviewed_tree: str, row, *, check=None, prior_results=()
) -> dict:
    """The framework's version of a worker's result row.

    Every quote is re-read from the reviewed tree, re-hashed, and matched
    against the node kinds *check* asks about; every declared absence
    search is re-executed and its count replaced by the one measured here.
    A worker that reported a different count reported something untrue,
    and the row is refused rather than corrected — a silently corrected
    row would let a fabricated search be indexed as a real one.

    ``prior_results`` closes the one-way door. A check already recorded
    ``blocked`` for a reason that means "out of reach" has no ``pass`` in
    its future at all: the exits are the ladder's — a deterministic test
    or analyzer, a narrower check that asks something provable,
    adjudication, or human review — and none of them is this check
    passing. Anything weaker would make "run it again with more context"
    the exit, which is the one route the plan forbids.
    """
    if not isinstance(row, dict):
        raise EvidenceError(
            "worker-result-malformed", "a worker result must be an object"
        )
    result = row.get("result")
    check_id = row.get("check_id")
    if result not in ("pass", "fail", "blocked") or not isinstance(
        check_id, str
    ) or not check_id:
        raise EvidenceError(
            "worker-result-malformed",
            "a worker result needs a check_id and a result of pass, fail "
            f"or blocked; got {check_id!r}/{result!r}",
        )

    if result == "pass":
        stuck = sorted({
            prior.get("blocked_reason")
            for prior in prior_results
            if isinstance(prior, dict)
            and prior.get("check_id") == check_id
            and prior.get("result") == "blocked"
            and prior.get("blocked_reason") in UNDISCHARGEABLE_BLOCKED_REASONS
        })
        if stuck:
            raise EvidenceError(
                "blocked-not-dischargeable",
                f"check {check_id} is on the record as blocked "
                f"({', '.join(stuck)}), so it has no pass in its future. "
                f"The exits are {list(UNPROVABLE_ABSENCE_LADDER)}; a later "
                "attempt with more context or tools is a bigger budget, "
                "which is not evidence about the code.",
            )

    required = contract_ast_kinds(check)
    quotes = [
        verify_quote(repo_root, reviewed_tree, quote, required_kinds=required)
        for quote in row.get("quotes") or []
    ]
    searches = []
    for declared in row.get("absence_searches") or []:
        measured = run_absence_search(repo_root, reviewed_tree, declared)
        claimed = (declared or {}).get("matches")
        if isinstance(claimed, int) and not isinstance(claimed, bool):
            if claimed != measured["matches"]:
                raise EvidenceError(
                    "absence-search-disagrees",
                    f"the worker recorded {claimed} match(es) for "
                    f"{measured['query']!r}; re-running it over the same "
                    f"scope found {measured['matches']}",
                )
        searches.append(measured)

    verified = dict(row)
    if quotes or "quotes" in row:
        verified["quotes"] = quotes
    if searches or "absence_searches" in row:
        verified["absence_searches"] = searches
    return verified


def record_worker_result(
    repo_root, set_slug: str, session_number: int, reviewed_tree: str, row
) -> dict:
    """The one way a worker result reaches the record: verified here
    against the reviewed tree and against the check it answers, then
    validated and appended by the ledger.

    The check must already be on the record. A result for an unregistered
    check_id has no objective, no scope and no evidence contract to be
    held to, so accepting one would turn the quote contract off exactly
    when a worker names a check nobody wrote.
    """
    change_id = row["change_id"]
    checks = ledger.read_checks(repo_root, set_slug, session_number, change_id)
    check = next(
        (c for c in checks if c.get("check_id") == row.get("check_id")), None
    )
    if check is None:
        raise EvidenceError(
            "check-not-registered",
            f"no check {row.get('check_id')!r} is recorded for change "
            f"{change_id}; the checks on the record are "
            f"{[c.get('check_id') for c in checks]}. Write the check down "
            "and bound it before recording an answer to it.",
        )
    verified = verify_worker_result(
        repo_root, reviewed_tree, row, check=check,
        prior_results=ledger.read_worker_results(
            repo_root, set_slug, session_number, change_id
        ),
    )
    ledger.append_worker_result(repo_root, set_slug, session_number, verified)
    return verified
