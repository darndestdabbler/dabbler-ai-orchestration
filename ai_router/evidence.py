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

import hashlib
import json
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from . import ledger
# The router spawns git in exactly one function, journal.run_git, and the
# tree snapshot and tree diff exist once, beside it. journal sits below this
# module and inside the run core, which may import nothing from here; this
# module is the name the lifecycle callers use.
from .journal import (  # noqa: F401  (re-exported)
    changed_paths_between,
    is_machine_state_path,
    repo_root_for,
    run_git,
    snapshot_worktree_tree,
)
from .ledger import RUNS_DIRNAME


# --- Machine-side state -----------------------------------------------------



# --- The repository's sessions root -----------------------------------------
#
# A repository has sessions, not sets of sessions. There is exactly one
# sessions root per repository, so no command takes a handle to one: it is
# derived, and the only override exists because a caller may run from
# outside the tree.

SESSIONS_DIRNAME = "sessions"
_SESSIONS_PARENT = "docs"

# The files that live at the sessions root. Their names are constants
# because nothing chooses where a record lands.
STATE_FILENAME = "sessions.json"
ACTIVITY_LOG_FILENAME = "activity-log.json"
SESSION_PLAN_FILENAME = "session-plan.md"


def sessions_dir_for(repo_root) -> Path:
    return Path(repo_root) / _SESSIONS_PARENT / SESSIONS_DIRNAME


def repo_root_from_sessions_dir(sessions_dir) -> Path:
    """The inverse of :func:`sessions_dir_for`, and it lives here so the
    two directions of one rule cannot disagree. A caller that already
    holds a sessions root needs the repository root to reach
    ``.dabbler/runs/``, and asking git for it would make the answer
    depend on the tree being a checkout -- which the projection's own
    fixtures are not."""
    return Path(sessions_dir).resolve().parent.parent


class SessionsRootNotFoundError(ValueError):
    pass


def resolve_sessions_dir(explicit=None, start=None) -> str:
    """The sessions root for the repository *start* lives in.

    An explicit path wins so a caller outside the tree can still address a
    repository; otherwise the root is derived from the working directory.
    Nothing here selects *which* sessions to act on — that is the session
    number's job.
    """
    if explicit:
        return str(explicit)
    root = repo_root_for(Path(start or os.getcwd()))
    if root is None:
        raise SessionsRootNotFoundError(
            f"not inside a git repository: {start or os.getcwd()}. "
            "Run from the repository, or pass --sessions-dir."
        )
    return str(sessions_dir_for(root))


def object_exists(repo_root, rev: str) -> bool:
    """Whether *rev* names an object this store actually holds. A round
    snapshot is written through a throwaway index, so on its own it is
    garbage-collectable and unpushable; :func:`anchor_round_tree` is what
    makes it reachable, and a round recorded before that existed -- or
    fetched by a clone that lacks :data:`ROUND_REFSPEC` -- still arrives
    with its baseline left behind."""
    rc, _, _ = run_git(repo_root, "cat-file", "-e", f"{rev}^{{object}}")
    return rc == 0


# --- Round refs: the baseline that travels ----------------------------------
#
# A round's completion tree is reachable from refs/dabbler/rounds/s<N>/r<R>,
# through a framework-authored commit, from the moment the round is
# recorded. A ref cannot usefully name a bare tree (most servers refuse it on
# push), so the commit is the object the ref names and the tree it carries
# hashes identically to the row's completion_tree.
#
# Retention: one ref per round per session, kept for good. The objects are a
# tree the session already had plus one commit, and the history is the
# point -- a baseline that can be pruned is a baseline that can go missing
# again. Nothing in ai_router deletes a round ref.
#
# The refs live outside refs/heads and refs/tags, so a clone's default
# refspecs neither push nor fetch them; ensure_round_refspecs() is what
# teaches a clone to carry them both ways.

ROUND_REF_NAMESPACE = "refs/dabbler/rounds"
ROUND_REFSPEC = f"+{ROUND_REF_NAMESPACE}/*:{ROUND_REF_NAMESPACE}/*"
# With remote.<name>.push set at all, a bare `git push` sends only what the
# refspecs name, so the current branch has to be named beside the rounds.
# HEAD pushes it to the branch of the same name, which is what push.default's
# `simple` does on the trunk-based layout every session runs on.
ROUND_PUSH_BRANCH_REFSPEC = "HEAD"
_ANCHOR_IDENTITY = {
    "GIT_AUTHOR_NAME": "dabbler-ai-router",
    "GIT_AUTHOR_EMAIL": "router@dabbler.invalid",
    "GIT_COMMITTER_NAME": "dabbler-ai-router",
    "GIT_COMMITTER_EMAIL": "router@dabbler.invalid",
}


def round_ref(session_number: int, round_number: int) -> str:
    return f"{ROUND_REF_NAMESPACE}/s{int(session_number)}/r{int(round_number)}"


def anchor_round_tree(
    repo_root, session_number: int, round_number: int, tree: str
) -> Optional[str]:
    """Make *tree* reachable: wrap it in a commit and point the round's ref
    at it. Returns the anchoring commit, or ``None`` when the tree is not
    in this store -- a row can only anchor an object it has, and inventing
    one would be a baseline nobody snapshotted."""
    if not object_exists(repo_root, tree):
        return None
    env = dict(os.environ, **_ANCHOR_IDENTITY)
    rc, commit, _ = run_git(
        repo_root, "commit-tree", tree, "-m",
        f"dabbler round snapshot: session {session_number} round "
        f"{round_number}",
        env=env,
    )
    commit = (commit or "").strip()
    if rc != 0 or not commit:
        return None
    rc, _, _ = run_git(
        repo_root, "update-ref", round_ref(session_number, round_number),
        commit,
    )
    return commit if rc == 0 else None


def session_round_refs(repo_root, session_number: int) -> list:
    """Every round ref this session has, ascending by round."""
    prefix = f"{ROUND_REF_NAMESPACE}/s{int(session_number)}/"
    rc, out, _ = run_git(
        repo_root, "for-each-ref", "--format=%(refname)", prefix,
    )
    if rc != 0 or not out:
        return []
    refs = [line.strip() for line in out.splitlines() if line.strip()]

    def _round(ref):
        tail = ref.rsplit("/", 1)[-1]
        return int(tail[1:]) if tail[1:].isdigit() else 0

    return sorted(refs, key=_round)


def upstream_remote(repo_root) -> str:
    """The remote the current branch pushes to, or ``origin`` when the
    branch names none."""
    rc, branch, _ = run_git(repo_root, "symbolic-ref", "--short", "-q", "HEAD")
    branch = (branch or "").strip()
    if rc == 0 and branch:
        rc, remote, _ = run_git(
            repo_root, "config", "--get", f"branch.{branch}.remote"
        )
        remote = (remote or "").strip()
        if rc == 0 and remote:
            return remote
    return "origin"


def push_round_refs(repo_root, session_number: int) -> tuple:
    """``(pushed_refs, error)``: push the session's round refs to the
    branch's remote. A push that carries the branch and silently leaves
    the rounds behind is the defect this exists to close, so an error is
    returned, never swallowed. No refs is not an error."""
    refs = session_round_refs(repo_root, session_number)
    if not refs:
        return [], None
    rc, _, err = run_git(
        repo_root, "push", upstream_remote(repo_root),
        *[f"{ref}:{ref}" for ref in refs],
    )
    if rc != 0:
        return [], err or f"git push exited {rc}"
    return refs, None


def ensure_round_refspecs(repo_root, remote: Optional[str] = None) -> list:
    """Teach the clone to carry round refs both ways; returns the config
    values added (empty when it already did). Fetching is what makes a
    round recorded elsewhere resolve here; pushing is what lets the
    operator's own mid-session push move a session without stranding its
    baselines. Any push refspec the clone already had is kept as it is
    and the branch entry is added only when there was none, because a
    clone that chose its own push refspecs chose what a bare push sends."""
    remote = remote or upstream_remote(repo_root)
    rc, _, _ = run_git(repo_root, "remote", "get-url", remote)
    if rc != 0:
        return []  # no remote, nothing to carry the refs to or from
    added = []
    for key, value in (
        (f"remote.{remote}.fetch", ROUND_REFSPEC),
        (f"remote.{remote}.push", ROUND_REFSPEC),
    ):
        rc, existing, _ = run_git(repo_root, "config", "--get-all", key)
        current = [
            line.strip() for line in (existing or "").splitlines()
            if line.strip()
        ] if rc == 0 else []
        if value in current:
            continue
        if key.endswith(".push") and not current:
            run_git(repo_root, "config", "--add", key, ROUND_PUSH_BRANCH_REFSPEC)
            added.append(f"{key}={ROUND_PUSH_BRANCH_REFSPEC}")
        rc, _, _ = run_git(repo_root, "config", "--add", key, value)
        if rc == 0:
            added.append(f"{key}={value}")
    return added


def read_tree_blob(repo_root, tree: str, path: str) -> Optional[bytes]:
    """The file's exact bytes as *tree* recorded them, or ``None``.

    The reviewed tree, never the working tree. The tree is pinned and the
    worktree keeps moving, so a quote checked against the worktree says
    nothing about what was reviewed — and would start passing again the
    moment an author re-typed the line it failed on. Bytes, not text:
    ``run_git`` strips newline framing, which is fine for porcelain and
    fatal for a content hash, so this one asks the same call for bytes
    rather than spawning around it.
    """
    rc, out, _ = run_git(
        repo_root, "cat-file", "blob", f"{tree}:{path}", binary=True,
    )
    return out if rc == 0 else None


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


def _state_writes_path(repo_root) -> Path:
    return Path(repo_root) / RUNS_DIRNAME / _STATE_WRITES_FILENAME


def state_file_hash(sessions_dir) -> Optional[str]:
    path = Path(sessions_dir) / STATE_FILENAME
    try:
        return hash_output(path.read_text(encoding="utf-8"))
    except OSError:
        return None


def record_state_write(sessions_dir, repo_root=None) -> None:
    """Called by the sanctioned writers after every sessions.json write.
    Best-effort: outside a git repo (unit tests, scratch dirs) the record
    is simply not kept."""
    root = repo_root or repo_root_for(sessions_dir)
    if root is None:
        return
    digest = state_file_hash(sessions_dir)
    if digest is None:
        return
    path = _state_writes_path(root)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps({"hash": digest}) + "\n")
    except OSError:
        pass


def detect_out_of_band_write(
    sessions_dir, repo_root=None, *, require_record: bool = False
) -> Optional[str]:
    """``None`` when the current sessions.json content matches some
    sanctioned write; otherwise a reason string. With *require_record*
    (the close gate's mode) an absent or empty record is itself a finding —
    absence is the signature a fully-simulated session leaves."""
    root = repo_root or repo_root_for(sessions_dir)
    if root is None:
        return "not inside a git repository" if require_record else None
    current = state_file_hash(sessions_dir)
    if current is None:
        return f"{STATE_FILENAME} is unreadable"
    path = _state_writes_path(root)
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
            f"no sanctioned-writer record exists for {STATE_FILENAME} "
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
            f"{STATE_FILENAME} content matches no sanctioned write — it "
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
#
# Provenance is the triple that makes a quote checkable regardless of what
# language it was written in: the reviewed tree's digest, the exact line or
# byte range, and a byte-exact match of the quoted text against that tree.
# It proves *where* a quote came from, never *what kind of construct it is*
# — a check that needs the latter is a check for a deterministic analyzer,
# which the control surface already routes.

SPAN_KINDS = ("byte", "line")


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


def verify_quote(repo_root, reviewed_tree: str, quote) -> dict:
    """Re-derive a quote from the reviewed tree and return the framework's
    own record of it. Raises :class:`EvidenceError` on any mismatch.

    The returned ``content_hash`` is the one computed here. The worker's
    value is only ever an assertion to be tested against the tree. Path,
    span and hash are the whole contract: they prove where a quote came
    from and that its bytes match, in any file the tree contains, and
    nothing here asks what kind of construct those bytes form.
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

    return {
        "path": path,
        "content_hash": actual,
        "span": dict(quote["span"]),
    }


# --- Framework-executed absence search ---------------------------------------

ABSENCE_QUERY_KINDS = ("literal", "regex")


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


#: What produced an absence count, written onto every measured row.
#:
#: The field's job is not to name a regex engine but to overwrite whatever
#: the reviewer claimed: a worker can say it searched and report a number,
#: and this function re-runs the search and stamps its own answer. Any
#: framework-owned constant does that, and a constant is what this is.
#:
#: It used to be ``python-re/<version>``, which named the engine honestly and
#: cost two things. The TypeScript router cannot write it truthfully -- it
#: would have to claim an engine it did not run -- so the same row differed
#: between two routers required to write identical bytes. And it moved
#: whenever the interpreter's PATCH version moved, so it was never stable
#: inside one router either. Naming the framework fixes both, and loses
#: nothing a reader used: when two engines genuinely disagree the COUNT
#: differs, and the count is what is compared.
ABSENCE_TOOL = "dabbler-absence-search/1"


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
        matches += sum(
            1 for _ in pattern.finditer(blob.decode("utf-8", "replace"))
        )

    return {
        "query": query,
        "query_kind": query_kind,
        "scope": [str(pattern) for pattern in scope],
        "tool_version": ABSENCE_TOOL,
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


def verify_worker_result(
    repo_root, reviewed_tree: str, row, *, prior_results=()
) -> dict:
    """The framework's version of a worker's result row.

    Every quote is re-read from the reviewed tree, re-hashed, and matched
    byte-for-byte against the span it claims; every declared absence
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

    quotes = [
        verify_quote(repo_root, reviewed_tree, quote)
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
    repo_root, session_number: int, reviewed_tree: str, row
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
    checks = ledger.read_checks(repo_root, session_number, change_id)
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
        repo_root, reviewed_tree, row,
        prior_results=ledger.read_worker_results(
            repo_root, session_number, change_id
        ),
    )
    ledger.append_worker_result(repo_root, session_number, verified)
    return verified
