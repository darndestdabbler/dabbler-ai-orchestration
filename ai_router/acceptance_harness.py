"""The acceptance-criteria harness (Set 111 S2, Proposal B).

Fix-checking used to be an open-ended re-review: *"look at this again"*,
which is why a salience-limited verifier keeps returning fresh findings.
An acceptance criterion is a **closed** question — but a closed question
the remediator can satisfy trivially is worse than none, so a criterion
may close a finding only when it survives **baseline discrimination**
(the OpenAI critique's guard, proposal §6):

    Run the UNCHANGED criterion against BOTH the pre-fix tree and the
    fixed tree, in a harness the remediator does not drive. It may
    auto-close a finding **only if it fails before and passes after**.
    A criterion that already passes pre-fix is vacuous and stays
    judgment-based; a criterion whose test assets the remediation edited
    is invalidated.

Containment (proposal §6, "untrusted-code execution was missed
entirely"): a verifier-authored command is untrusted input. It is never
run in the live working tree. Each criterion gets its **own fresh pair**
of disposable git worktrees, checked out from the tree objects
``verify_session`` already captures (``discoveryBaselineTree`` for
pre-fix; a fresh ``snapshot_worktree_tree`` for post-fix), with

- **no shell** — the command is tokenized and spawned directly; any
  shell operator (``&&``, ``|``, ``;``, redirection, ``$(...)``) is
  refused outright rather than interpreted,
- **refused programs** — a general-purpose shell or a fetch tool as
  ``argv[0]`` is rejected, because either one re-opens what the
  tokenizer just closed,
- **a credential-stripped process environment** — API keys, tokens and
  secrets are removed from the child's ``os.environ``,
- **a wall-clock timeout**, and
- **cleanup on every path**, including errors.

**This is containment, NOT a sandbox — do not read it as one.** The
harness does not block network access; on Windows a child process can
still read User- or Machine-scope environment variables (and any OS
credential store) regardless of what was stripped from its own
environment; and the disposable checkout is only the child's **working
directory**, not a filesystem confinement — a criterion that writes to an
**absolute path**, or that reaches the main checkout through the shared
git directory, is not prevented from doing so. A criterion is untrusted
code running with the developer's own privileges.

What is actually true, stated narrowly: a criterion's **ordinary relative
reads and writes land in a throwaway checkout** rather than your working
tree, it **cannot silently use a shell**, and it **cannot inherit your
keys through the process environment**. Nothing stronger. Treat the
criteria in a round's raw artifact as code to be read, not as inputs that
have been made safe.

What this module never does: decide that a finding is *sufficiently*
addressed. Baseline discrimination proves a criterion is *related* to the
defect, not that it is the *right* criterion (proposal §10 Q2 — no
adequacy checker is built). Sufficiency is delegated to the one retained
``--phase remediation-review``, which reads this harness's results as
evidence and spends its attention on what the fixes BROKE and what the
criteria MISSED.

One more limit worth stating plainly: criteria run under the harness's
own interpreter, and in this repo that interpreter has ``ai_router``
installed **editable against the main checkout**. A criterion that
*imports the installed package* therefore measures the main tree, not the
disposable one. Criteria must exercise the checkout **by path** — run a
file, read a file, invoke a test module under a path argument — which is
what the template asks for.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import List, Optional, Sequence

try:  # package vs bare-import (mirrors the rest of ai_router)
    from .verification import is_blocking_issue
    from .verify_session import (
        VerifySessionError,
        find_discovery_baseline_tree,
        issues_artifact_path,
        repo_root_for,
        resolve_in_progress_session,
        snapshot_worktree_tree,
    )
except ImportError:  # pragma: no cover - test/bare context
    from verification import is_blocking_issue  # type: ignore[no-redef]
    from verify_session import (  # type: ignore[no-redef]
        VerifySessionError,
        find_discovery_baseline_tree,
        issues_artifact_path,
        repo_root_for,
        resolve_in_progress_session,
        snapshot_worktree_tree,
    )

EXIT_OK = 0
EXIT_USAGE = 2

ARTIFACT_SCHEMA_VERSION = 1

# Per-criterion outcomes. Exactly ONE of them auto-closes a finding; the
# rest are all routed to the retained holistic review, which is the
# fail-closed direction (a criterion that does not discriminate has
# proven nothing, so the finding keeps its blocking status).
OUTCOME_AUTO_CLOSED = "auto-closed"
OUTCOME_NOT_DISCRIMINATING = "not-discriminating"
OUTCOME_STILL_FAILING = "still-failing"
OUTCOME_TEST_ASSET_MODIFIED = "test-asset-modified"
OUTCOME_RUNNER_NOT_ATTRIBUTABLE = "runner-not-attributable"
OUTCOME_BASELINE_MISMATCH = "baseline-mismatch"
OUTCOME_CRITERION_CHANGED = "criterion-changed"
OUTCOME_CRITERION_UNBOUND = "criterion-unbound"
OUTCOME_REFUSED_UNSAFE = "refused-unsafe"
OUTCOME_JUDGMENT = "judgment"
OUTCOME_NO_CRITERION = "no-criterion"
OUTCOME_ERROR = "error"

AUTO_CLOSING_OUTCOMES = frozenset({OUTCOME_AUTO_CLOSED})

DEFAULT_TIMEOUT_SECONDS = 180

# Shell metacharacters. The harness does not spawn a shell, so these
# would be passed to the program as literal argv rather than doing what
# the verifier meant — silently changing the criterion's meaning. Refuse
# instead: an unrunnable criterion is judgment-based, never a guess.
_SHELL_METACHARACTERS = ("&&", "||", "|", ";", ">", "<", "$(", "`", "\n")

# Programs refused outright as argv[0]. The harness contains a criterion
# by giving it a throwaway checkout, no shell, and no credentials in its
# environment — it is NOT a sandbox, and cannot be (see the containment
# note in the module docstring). These entries close the cheapest escapes:
# a general-purpose shell re-introduces the operators the tokenizer
# refuses, and a fetch tool turns a "check" into an exfiltration channel.
_REFUSED_PROGRAMS = frozenset({
    "sh", "bash", "zsh", "fish", "csh", "ksh", "dash",
    "cmd", "cmd.exe", "powershell", "powershell.exe", "pwsh", "pwsh.exe",
    "curl", "curl.exe", "wget", "wget.exe", "nc", "ncat", "netcat",
    "ssh", "scp", "sftp", "rsync", "ftp", "telnet",
})

# Test runners: commands whose SCOPE is "the tests it would collect",
# not "the paths named on the command line". A bare `python -m pytest`
# names no path but runs every test in the tree, so a criterion using one
# is invalidated by ANY test-asset edit inside its scope.
_TEST_RUNNER_TOKENS = frozenset({
    "pytest", "py.test", "unittest", "nose2", "tox", "nox",
    "jest", "vitest", "mocha", "ava", "karma", "playwright", "cypress",
    "rspec", "minitest", "phpunit", "cargo", "gradle", "maven", "mvn",
    "test",  # `npm test`, `yarn test`, `pnpm test`, `go test`, `dotnet test`
})

# Interpreter spellings rewritten to the harness's own interpreter. The
# workspace venv is gitignored, so `.venv/Scripts/python.exe` does not
# exist inside a checkout of a git tree — and that is the exact spelling
# this repo's docs tell everyone to use. Rewriting keeps the documented
# form working instead of recording a spawn error for the normal case.
_VENV_INTERPRETER_RE = re.compile(
    r"^(?:\./)?\.?(?:venv|\.venv|env)/(?:Scripts|bin)/python(?:3(?:\.\d+)?)?(?:\.exe)?$",
    re.IGNORECASE,
)
_BARE_PYTHON_RE = re.compile(r"^python(?:3(?:\.\d+)?)?(?:\.exe)?$", re.IGNORECASE)

# Environment variables stripped from the child process. Verifier-authored
# code runs with no credentials, so a criterion cannot exfiltrate or spend.
_CREDENTIAL_PATTERN = re.compile(
    r"(?i)(api[_-]?key|token|secret|password|passwd|credential|pushover|"
    r"aws_|azure_|openai|anthropic|gemini|google_application)"
)

# Paths whose CONTENT the criterion is judging by, rather than judging.
# If the remediation changed one of these, the criterion's two runs are
# not comparable — the person being judged edited the ruler.
_TEST_ASSET_PATTERNS = (
    re.compile(r"(^|/)tests?/"),
    re.compile(r"(^|/)spec/"),
    re.compile(r"(^|/)test_[^/]*\.py$"),
    re.compile(r"[^/]*_test\.(py|go|rs|rb|ts|js|exs?)$"),
    re.compile(r"(^|/)conftest\.py$"),
    re.compile(r"\.(test|spec)\.[jt]sx?$"),
    re.compile(r"[^/]*(Test|Tests|Spec)\.(java|kt|cs|scala)$"),
    re.compile(r"[^/]*_spec\.rb$"),
    re.compile(r"(^|/)fixtures?/"),
    re.compile(r"(^|/)__fixtures__/"),
    re.compile(r"(^|/)__tests__/"),
    re.compile(r"(^|/)testdata/"),
)

_OUTPUT_TAIL_CHARS = 4000


class AcceptanceHarnessError(Exception):
    """A harness-level failure (bad inputs, unusable git state)."""


# ---------------------------------------------------------------------------
# Criterion shape
# ---------------------------------------------------------------------------

def acceptance_block(issue: dict) -> Optional[dict]:
    """The issue's acceptance block when it is a usable dict, else ``None``."""
    if not isinstance(issue, dict):
        return None
    block = issue.get("acceptance")
    return block if isinstance(block, dict) else None


def criterion_sha256(block: dict) -> str:
    """Hash of the whole criterion CONTRACT, so any edit is detectable.

    Deliberately not just the command: weakening
    ``expectedOutputContains`` or moving ``expectedExitCode`` changes what
    "pass" means while leaving the command byte-identical, which would be
    an edit the invalidation guard could not see.
    """
    contract = {
        "command": str(block.get("command") or ""),
        "expectedExitCode": block.get("expectedExitCode"),
        "expectedOutputContains": block.get("expectedOutputContains"),
    }
    canonical = json.dumps(contract, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def tokenize_command(command: str) -> List[str]:
    """Tokenize a criterion command for shell-free execution.

    Raises :class:`ValueError` when the command carries a shell operator
    (which this harness refuses rather than misinterprets), names a
    refused program (:data:`_REFUSED_PROGRAMS`), or cannot be tokenized
    at all. POSIX tokenization is used on every platform so quoting
    behaves identically — criteria are asked for forward slashes.

    ``argv[0]`` is rewritten to the harness's own interpreter when it
    names a virtualenv or bare ``python``: the workspace venv is
    gitignored, so ``.venv/Scripts/python.exe`` — the spelling this
    repo's docs prescribe — does not exist inside a checkout of a git
    tree, and a bare ``python`` depends on whatever is on PATH.
    """
    for meta in _SHELL_METACHARACTERS:
        if meta in command:
            raise ValueError(
                f"shell operator {meta!r} is not supported (the harness runs "
                "no shell)"
            )
    try:
        argv = shlex.split(command, posix=True)
    except ValueError as exc:
        raise ValueError(f"could not tokenize: {exc}") from exc
    if not argv:
        raise ValueError("empty command")
    program = PurePosixPath(argv[0].replace("\\", "/")).name.lower()
    if program in _REFUSED_PROGRAMS:
        raise ValueError(
            f"{program!r} is not an acceptance-criterion program (a shell or "
            "fetch tool re-opens exactly the escapes the harness closes)"
        )
    argv[0] = resolve_interpreter(argv[0])
    return argv


def resolve_interpreter(token: str) -> str:
    """Rewrite a venv / bare ``python`` ``argv[0]`` to this interpreter.

    Returns *token* unchanged when it is not a Python interpreter
    spelling. The substitution is recorded on the result so a reader can
    see that the criterion did not run the literal path it named.
    """
    normalized = token.replace("\\", "/")
    if _VENV_INTERPRETER_RE.match(normalized) or _BARE_PYTHON_RE.match(
        PurePosixPath(normalized).name
    ):
        return sys.executable
    return token


def is_test_runner(argv: Sequence[str]) -> bool:
    """Whether *argv* runs a test RUNNER (scope = the tests it collects)."""
    for token in argv:
        if token.startswith("-"):
            continue
        name = PurePosixPath(token.replace("\\", "/")).name.lower()
        name = name[:-4] if name.endswith(".exe") else name
        if name in _TEST_RUNNER_TOKENS:
            return True
    return False


def is_test_asset(path: str) -> bool:
    """Whether *path* (repo-relative, forward slashes) is a test asset."""
    normalized = path.replace("\\", "/").lstrip("./")
    return any(p.search(normalized) for p in _TEST_ASSET_PATTERNS)


def referenced_paths(argv: Sequence[str]) -> List[str]:
    """Repo-relative path-shaped tokens the command names.

    Deliberately generous and deliberately dumb: a token is path-shaped
    when it contains ``/`` or ends in a known source extension. pytest
    node ids (``path::test_name``) are split at ``::``. Anything that is
    not really a path simply will not resolve in either tree and is
    ignored by the caller.
    """
    found: List[str] = []
    for token in argv:
        if token.startswith("-"):
            continue
        candidate = token.split("::", 1)[0].replace("\\", "/")
        if not candidate or candidate.startswith("/"):
            continue
        if re.match(r"^[A-Za-z]:/", candidate):
            continue  # an absolute Windows path is not repo-relative
        looks_like_path = "/" in candidate or re.search(
            r"\.(py|ts|tsx|js|jsx|json|ya?ml|md|cfg|toml|txt)$", candidate
        )
        if looks_like_path and candidate not in found:
            found.append(candidate)
    return found


def _normalize_scope(path: str) -> str:
    """Repo-relative scope spelling: ``""`` means the whole repository.

    ``.``, ``./``, ``.\\`` and a trailing slash are all ordinary ways to
    write "here", and "here" for a criterion run from the repo root is
    the whole tree. Leaving them unnormalized meant ``pytest ./`` scoped
    to the literal string ``"."``, matched nothing, and let an edited
    test auto-close a finding (remediation-review round 4).
    """
    candidate = path.replace("\\", "/").strip()
    while candidate.startswith("./"):
        candidate = candidate[2:]
    candidate = candidate.rstrip("/")
    return "" if candidate in (".", "") else candidate


def criterion_scopes(argv: Sequence[str]) -> List[str]:
    """The repo areas a criterion's result actually depends on.

    A path token names its own subtree (so ``ai_router/tests`` covers
    every file under it).

    **A test runner always scopes to the whole repo (``""``).** Not
    because it necessarily collects everything, but because what a runner
    collects *cannot be determined from its argv* — and four consecutive
    verification rounds proved that trying is a losing game. Each round
    found another spelling the scope logic missed: ``pytest`` with no path
    at all, then ``pytest tests/test_widget.py`` versus the ``conftest.py``
    it loads implicitly, then ``pytest ./`` versus the literal ``"."``,
    then ``tests/fixtures/`` reached through an ancestor rather than at
    one, then ``go test ./...``. Each fix was correct and each was
    immediately followed by a new spelling, across directory conventions,
    path normalization and languages.

    So the rule is inverted rather than extended: a runner's ruler is
    every test asset, and any test-asset edit invalidates it. This is
    fail-closed, it is one rule instead of a growing table, and it costs
    only auto-closures that were never trustworthy — a criterion whose
    result depends on tests the remediator just rewrote proves nothing
    either way.

    Criteria that drive **product** code by path keep precise scoping and
    remain the auto-closable path, which is exactly what the template
    already asks verifiers to prefer.
    """
    if is_test_runner(argv):
        return [""]
    scopes: List[str] = []
    for path in referenced_paths(argv):
        normalized = _normalize_scope(path)
        if normalized not in scopes:
            scopes.append(normalized)
    return scopes


def changed_paths_between(
    repo_root: Path, baseline_tree: str, fixed_tree: str
) -> List[str]:
    """Repo-relative paths differing between the two captured trees."""
    result = _git(
        repo_root,
        ["diff", "--name-only", baseline_tree, fixed_tree],
    )
    if result.returncode != 0:
        return []
    return [
        line.strip().replace("\\", "/")
        for line in result.stdout.splitlines()
        if line.strip()
    ]


def is_loader_asset(path: str) -> bool:
    """Whether *path* is loaded IMPLICITLY by a test run under it.

    Retained as a classifier (a ``conftest.py`` or fixture file is
    obviously part of a test's ruler) but no longer load-bearing for
    scoping: a test runner now scopes to the whole repo, which subsumes
    every ancestor and nesting case this used to chase.
    """
    normalized = path.replace("\\", "/").lstrip("./")
    parts = PurePosixPath(normalized).parts
    if not parts:
        return False
    if parts[-1] == "conftest.py":
        return True
    return any(p in ("fixtures", "__fixtures__") for p in parts)


def modified_test_assets_in_scope(
    changed: Sequence[str],
    scopes: Sequence[str],
    *,
    runner: bool = False,
) -> List[str]:
    """Changed TEST assets that could move this criterion's ruler.

    A path scope covers its own subtree; the whole-repo scope ``""``
    covers everything. ``runner`` is accepted for call-site clarity and
    back-compatibility — a runner's scope is already ``[""]``, so no
    separate ancestor/loader walk is needed (see
    :func:`criterion_scopes`).
    """
    hits: List[str] = []
    for path in changed:
        if not is_test_asset(path):
            continue
        for scope in scopes:
            if scope == "" or path == scope or path.startswith(scope + "/"):
                if path not in hits:
                    hits.append(path)
                break
    return hits


# ---------------------------------------------------------------------------
# Git plumbing: disposable worktrees over captured tree objects
# ---------------------------------------------------------------------------

def _git(repo_root: Path, args: Sequence[str]) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", "-C", str(repo_root), *args],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )


def commit_for_tree(repo_root: Path, tree_sha: str, message: str) -> str:
    """A parentless commit wrapping *tree_sha* (worktrees need a commit-ish)."""
    env = os.environ.copy()
    env.update({
        "GIT_AUTHOR_NAME": "acceptance-harness",
        "GIT_AUTHOR_EMAIL": "acceptance-harness@localhost",
        "GIT_COMMITTER_NAME": "acceptance-harness",
        "GIT_COMMITTER_EMAIL": "acceptance-harness@localhost",
    })
    result = subprocess.run(
        ["git", "-C", str(repo_root), "commit-tree", tree_sha, "-m", message],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=env,
        check=False,
    )
    if result.returncode != 0:
        raise AcceptanceHarnessError(
            f"could not wrap tree {tree_sha[:12]} in a commit: "
            f"{result.stderr.strip()}"
        )
    sha = result.stdout.strip()
    if not sha:
        raise AcceptanceHarnessError(
            f"git commit-tree produced no commit for tree {tree_sha[:12]}"
        )
    return sha


def path_blob_sha(repo_root: Path, tree_sha: str, path: str) -> Optional[str]:
    """The blob sha of *path* inside *tree_sha*, or ``None`` when absent."""
    result = _git(repo_root, ["rev-parse", f"{tree_sha}:{path}"])
    if result.returncode != 0:
        return None
    sha = result.stdout.strip()
    return sha or None


class CriterionWorktrees:
    """Fresh disposable checkouts of the two captured trees, per criterion.

    Wrapping each tree in a commit is done ONCE (``git commit-tree`` is
    the only step that needs the object database); each criterion then
    gets its own pair of worktrees from those commits.

    Sharing one pair across criteria was a real defect (Set 111 S2
    verification, round 1): a verifier-authored command may write into
    its checkout — probes and test runs routinely do — and every later
    criterion would then be judged against a tree the previous one had
    mutated, which can manufacture fails-before/passes-after for a
    finding nothing actually fixed.
    """

    def __init__(self, repo_root: Path, baseline_tree: str, fixed_tree: str):
        self.repo_root = repo_root
        self.baseline_commit = commit_for_tree(
            repo_root, baseline_tree, f"acceptance-harness baseline {baseline_tree[:12]}"
        )
        self.fixed_commit = commit_for_tree(
            repo_root, fixed_tree, f"acceptance-harness fixed {fixed_tree[:12]}"
        )

    @contextmanager
    def fresh_pair(self):
        """A ``(baseline_path, fixed_path)`` pair, removed on every path."""
        with DisposableWorktree(
            self.repo_root, self.baseline_commit, "baseline"
        ) as before:
            with DisposableWorktree(
                self.repo_root, self.fixed_commit, "fixed"
            ) as after:
                yield before.path, after.path


class DisposableWorktree:
    """A throwaway checkout of one captured commit, removed on every path."""

    def __init__(self, repo_root: Path, commit: str, label: str):
        self.repo_root = repo_root
        self.commit = commit
        self.label = label
        self.path: Optional[Path] = None
        self._parent: Optional[str] = None

    def __enter__(self) -> "DisposableWorktree":
        self._parent = tempfile.mkdtemp(prefix=f"acceptance-{self.label}-")
        target = Path(self._parent) / "tree"
        result = _git(
            self.repo_root,
            ["worktree", "add", "--detach", "--force", str(target),
             self.commit],
        )
        if result.returncode != 0:
            self._cleanup()
            raise AcceptanceHarnessError(
                f"could not create the disposable {self.label} worktree: "
                f"{result.stderr.strip()}"
            )
        self.path = target
        return self

    def __exit__(self, exc_type, exc, tb) -> bool:
        self._cleanup()
        return False

    def _cleanup(self) -> None:
        if self.path is not None:
            _git(
                self.repo_root,
                ["worktree", "remove", "--force", str(self.path)],
            )
        if self._parent:
            shutil.rmtree(self._parent, ignore_errors=True)
        _git(self.repo_root, ["worktree", "prune"])
        self.path = None
        self._parent = None


def child_environment() -> dict:
    """The credential-stripped environment a criterion runs under."""
    env = {
        key: value
        for key, value in os.environ.items()
        if not _CREDENTIAL_PATTERN.search(key)
    }
    # A criterion must never re-enter the router: a metered call inside a
    # check would make the result depend on something other than the tree
    # it is judging (and would spend money the round did not budget).
    # This is the package's real no-router switch, not a decorative one.
    env["DABBLER_NO_ROUTER"] = "1"
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    return env


# ---------------------------------------------------------------------------
# Running one criterion
# ---------------------------------------------------------------------------

def _tail(text: str) -> str:
    text = text or ""
    if len(text) <= _OUTPUT_TAIL_CHARS:
        return text
    return "...[truncated]...\n" + text[-_OUTPUT_TAIL_CHARS:]


def run_criterion_in(
    worktree: Path,
    argv: Sequence[str],
    timeout: int,
    expects: Optional[str] = None,
) -> dict:
    """Run *argv* inside *worktree*; a structured run record, never raises.

    ``expects`` (the criterion's ``expectedOutputContains``) is matched
    against the **full** combined stdout+stderr, before the record's
    ``output`` field is truncated to a tail — otherwise a substring
    printed early in a chatty run would be judged absent purely because
    the artifact does not store the whole transcript.
    """
    try:
        completed = subprocess.run(
            list(argv),
            cwd=str(worktree),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            env=child_environment(),
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return {
            "exitCode": None,
            "timedOut": True,
            "output": "(timed out)",
        }
    except OSError as exc:
        return {
            "exitCode": None,
            "spawnError": str(exc),
            "output": f"(could not start: {exc})",
        }
    combined = (completed.stdout or "") + (completed.stderr or "")
    record = {
        "exitCode": completed.returncode,
        "outputChars": len(combined),
        "output": _tail(combined),
    }
    if expects:
        record["outputContainsExpected"] = expects in combined
    return record


def run_passed(run: dict, expected_exit: int, expects: Optional[str]) -> bool:
    """Whether a run record satisfies the criterion's stated expectation.

    A timeout or a spawn failure is never a pass — and never a clean
    *fail* either; the caller marks those as harness errors so an
    infrastructure problem cannot masquerade as baseline discrimination.
    """
    if run.get("timedOut") or run.get("spawnError"):
        return False
    if run.get("exitCode") != expected_exit:
        return False
    if expects and not run.get("outputContainsExpected"):
        return False
    return True


def _unusable(run: dict) -> bool:
    return bool(run.get("timedOut") or run.get("spawnError"))


# ---------------------------------------------------------------------------
# The harness
# ---------------------------------------------------------------------------

def acceptance_artifact_path(
    session_set_dir: Path, session_number: int, round_number: int
) -> Path:
    """``sN-acceptance-round-<M>.json`` for the envelope round *M*."""
    return session_set_dir / (
        f"s{session_number}-acceptance-round-{round_number}.json"
    )


def collect_criteria(envelope: dict) -> List[dict]:
    """The blocking findings of *envelope*, with their criteria, in order.

    ``index`` is the position in the envelope's ``issues`` array (after
    the same non-dict filtering the ledger assembler applies), so a
    result maps back to exactly one immutable finding.

    ``callKey`` is ``(discoveryCall, index_within_that_call)``, counted
    over **every** envelope issue rather than only the blocking ones —
    that is the coordinate that survives back to the raw verification
    artifact, whose parsed issue list is not filtered by severity.
    """
    issues = [i for i in (envelope.get("issues") or []) if isinstance(i, dict)]
    collected: List[dict] = []
    seen: dict = {}
    for index, issue in enumerate(issues):
        call = issue.get("discoveryCall")
        if not isinstance(call, int) or isinstance(call, bool) or call < 1:
            call = 1
        position = seen.get(call, 0)
        seen[call] = position + 1
        if not is_blocking_issue(issue):
            continue
        collected.append(
            {"index": index, "issue": issue, "callKey": (call, position)}
        )
    return collected


def _summarize(description: object, cap: int = 200) -> str:
    flat = re.sub(r"\s+", " ", str(description or "")).strip()
    return flat if len(flat) <= cap else flat[:cap].rstrip() + " ..."


def raw_artifact_criteria(
    session_set_dir: Path, session_number: int, round_number: int
) -> Optional[dict]:
    """The round's criteria as the VERIFIER wrote them, from raw artifacts.

    ``{(call_index, index_within_call): contract_hash}``, re-parsed from
    the immutable ``sN-verification*.md`` files (call 1 plus any
    ``-fanout-<k>`` siblings), in the same per-call order
    ``verify_session`` merges them.

    This exists because the findings ENVELOPE is not an authoritative
    record of the criterion. It is a derived artifact the orchestrator is
    explicitly invited to annotate (the advisory ``resolution_*``
    fields), so "the criterion is unchanged" cannot be established by
    comparing the envelope with itself — and comparing it only against a
    PREVIOUS harness run leaves the first run, the normal path,
    completely unguarded. The raw artifacts are the verifier's own
    output: never edited after they are written (a workflow invariant),
    and bound to the routed response by the verification stamp.

    Returns ``None`` when no raw artifact for the round can be read — the
    caller then refuses to auto-close rather than trusting the envelope.
    """
    try:
        from .verification import parse_verification_response
        from .verify_session import (
            fanout_artifact_path, verification_artifact_path,
        )
    except ImportError:  # pragma: no cover - test/bare context
        from verification import (  # type: ignore[no-redef]
            parse_verification_response,
        )
        from verify_session import (  # type: ignore[no-redef]
            fanout_artifact_path, verification_artifact_path,
        )

    contracts: dict = {}
    found_any = False
    call_index = 1
    while True:
        if call_index == 1:
            path = verification_artifact_path(
                session_set_dir, session_number, round_number
            )
        else:
            path = fanout_artifact_path(
                session_set_dir, session_number, round_number, call_index
            )
        if not path.is_file():
            break
        found_any = True
        try:
            text = path.read_text(encoding="utf-8")
        except OSError:
            return None
        _verdict, issues = parse_verification_response(text)
        for index, issue in enumerate(issues):
            block = acceptance_block(issue)
            if block is not None:
                contracts[(call_index, index)] = criterion_sha256(block)
        call_index += 1
    return contracts if found_any else None


def _call_key(entry: dict, seen: dict) -> tuple:
    """``(discoveryCall, index_within_that_call)`` for an envelope entry."""
    call = entry["issue"].get("discoveryCall")
    if not isinstance(call, int) or isinstance(call, bool) or call < 1:
        call = 1
    position = seen.get(call, 0)
    seen[call] = position + 1
    return (call, position)


def evaluate_criterion(
    repo_root: Path,
    entry: dict,
    changed_paths: Sequence[str],
    worktrees: Optional["CriterionWorktrees"],
    timeout: int,
    authoritative: Optional[dict],
    baseline_is_own: bool = True,
) -> dict:
    """One finding's acceptance result (see the module docstring's rules).

    ``authoritative`` is the raw-artifact criterion map from
    :func:`raw_artifact_criteria` (``None`` when it could not be read).
    ``worktrees`` supplies a FRESH pair of disposable checkouts for this
    criterion alone — criteria must not share them, or one that writes
    into its checkout silently rewrites the tree the next one is judged
    against. ``baseline_is_own`` is False when the resolved pre-fix tree
    belongs to an EARLIER round than the one supplying the criteria, in
    which case nothing may auto-close.
    """
    issue = entry["issue"]
    index = entry["index"]
    result: dict = {
        "issueIndex": index,
        "summary": _summarize(issue.get("description")),
        "severity": str(issue.get("severity") or "unrated"),
    }

    block = acceptance_block(issue)
    if block is None:
        result["outcome"] = OUTCOME_NO_CRITERION
        result["reason"] = (
            "the finding carries no acceptance block, so there is nothing to "
            "run; it is settled by the remediation review as before"
        )
        return result

    kind = str(block.get("kind") or "").strip().lower()
    if kind != "executable":
        result["outcome"] = OUTCOME_JUDGMENT
        result["criterion"] = str(
            block.get("statement") or block.get("command") or ""
        )
        result["reason"] = (
            "judgment-based criterion: never executed, never auto-closed"
        )
        return result

    command = str(block.get("command") or "").strip()
    if not command:
        result["outcome"] = OUTCOME_REFUSED_UNSAFE
        result["reason"] = "executable criterion with an empty command"
        return result

    if not baseline_is_own:
        # The resolved pre-fix tree belongs to an EARLIER round than the
        # one that raised this finding (close-backstop round 10). Only
        # discovery-family rounds record a discoveryBaselineTree, so
        # criteria from a remediation-review round resolve back to the
        # pre-remediation tree -- a tree that predates the fix, and often
        # predates the very FILE the finding is about. "Fails before"
        # then holds for a reason unrelated to the defect (the file did
        # not exist yet) and the test collapses into "does it pass now?",
        # which is exactly the vacuous auto-close baseline discrimination
        # exists to reject. The module's own contract says a criterion
        # run against the wrong "before" tree is worse than no criterion
        # at all, so this fails closed rather than guessing.
        result["outcome"] = OUTCOME_BASELINE_MISMATCH
        result["criterion"] = command
        result["reason"] = (
            "the only pre-fix tree available belongs to an earlier round "
            "than the one that raised this finding, so a fails-before "
            "result would not be attributable to this fix. The finding "
            "stays judgment-based."
        )
        return result

    digest = criterion_sha256(block)
    result["criterion"] = command
    result["criterionSha256"] = digest
    expected_exit = block.get("expectedExitCode")
    if not isinstance(expected_exit, int) or isinstance(expected_exit, bool):
        expected_exit = 0
    expects = block.get("expectedOutputContains")
    expects = expects.strip() if isinstance(expects, str) else None
    result["expectedExitCode"] = expected_exit
    if expects:
        result["expectedOutputContains"] = expects

    prior = authoritative.get(entry["callKey"]) if authoritative else None
    if authoritative is None:
        result["outcome"] = OUTCOME_CRITERION_UNBOUND
        result["reason"] = (
            "the round's raw verification artifact could not be read, so the "
            "criterion cannot be bound to what the VERIFIER actually wrote; "
            "refusing to auto-close on the envelope's word alone"
        )
        return result
    if prior is None:
        result["outcome"] = OUTCOME_CRITERION_UNBOUND
        result["reason"] = (
            "no criterion for this finding appears in the round's raw "
            "verification artifact, so this one is not verifier-authored "
            "evidence and cannot auto-close"
        )
        return result
    if prior != digest:
        result["outcome"] = OUTCOME_CRITERION_CHANGED
        result["reason"] = (
            "the criterion contract in the envelope does not match the one "
            f"the verifier wrote (raw artifact {prior[:12]}, envelope "
            f"{digest[:12]}) -- an edited criterion or expectation "
            "invalidates the result and cannot auto-close"
        )
        return result

    try:
        argv = tokenize_command(command)
    except ValueError as exc:
        result["outcome"] = OUTCOME_REFUSED_UNSAFE
        result["reason"] = f"refused: {exc}"
        return result
    result["argv"] = argv
    if argv[0] != shlex.split(command, posix=True)[0]:
        result["interpreterSubstituted"] = argv[0]

    scopes = criterion_scopes(argv)
    runner = is_test_runner(argv)
    result["scopes"] = scopes
    if runner:
        # A test runner's pass depends on the union of the product code
        # and every test asset it collects -- and the harness can
        # determine NEITHER set from the command line. Six consecutive
        # verification rounds each found a different spelling of that
        # gap (a pathless runner, a targeted file vs its own conftest,
        # `./` vs `.`, an ancestor fixtures dir, `go test ./...` with
        # `*_test.go` unrecognised, colocated snapshot files). Each fix
        # was correct; each was followed by another spelling, because
        # "what counts as a test asset" is an open-ended classification
        # problem across every ecosystem.
        #
        # So a runner criterion is not attributable, full stop. This
        # deletes the classification problem instead of enumerating it,
        # and costs nothing measurable: every runner criterion this
        # machinery has ever seen was invalidated anyway. Criteria that
        # drive PRODUCT code by path remain precisely scoped and remain
        # the auto-closable path -- which is what the template asks for.
        result["outcome"] = OUTCOME_RUNNER_NOT_ATTRIBUTABLE
        result["testRunner"] = True
        result["reason"] = (
            "the criterion invokes a test runner, whose result depends on "
            "both the product code and every test asset it collects -- "
            "neither of which can be determined from the command line, so "
            "a pass cannot be attributed to the fix. The finding stays "
            "judgment-based; a probe that drives the product by path is "
            "the criterion that can close."
        )
        return result
    modified_assets = modified_test_assets_in_scope(changed_paths, scopes)
    if modified_assets:
        result["outcome"] = OUTCOME_TEST_ASSET_MODIFIED
        result["modifiedTestAssets"] = modified_assets
        result["reason"] = (
            "the remediation changed test assets inside this criterion's "
            "scope (" + ", ".join(modified_assets[:8])
            + ") -- the person being judged moved the ruler, so the two runs "
            "are not comparable and the finding stays judgment-based"
        )
        return result

    if worktrees is None:
        result["outcome"] = OUTCOME_ERROR
        result["reason"] = "no disposable worktree was available"
        return result

    with worktrees.fresh_pair() as (before_path, after_path):
        baseline_run = run_criterion_in(before_path, argv, timeout, expects)
        fixed_run = run_criterion_in(after_path, argv, timeout, expects)
    result["baseline"] = baseline_run
    result["fixed"] = fixed_run

    if _unusable(baseline_run) or _unusable(fixed_run):
        result["outcome"] = OUTCOME_ERROR
        result["reason"] = (
            "the criterion could not be run to completion on both trees (a "
            "timeout or spawn failure is not evidence either way)"
        )
        return result

    baseline_passed = run_passed(baseline_run, expected_exit, expects)
    fixed_passed = run_passed(fixed_run, expected_exit, expects)
    result["baselinePassed"] = baseline_passed
    result["fixedPassed"] = fixed_passed

    if baseline_passed:
        result["outcome"] = OUTCOME_NOT_DISCRIMINATING
        result["reason"] = (
            "the criterion ALREADY PASSES on the pre-fix tree, so passing "
            "after the fix proves nothing (vacuous criterion) -- the finding "
            "stays judgment-based"
        )
        return result
    if not fixed_passed:
        result["outcome"] = OUTCOME_STILL_FAILING
        result["reason"] = (
            "the criterion still FAILS on the fixed tree: the fix does not "
            "satisfy the verifier's own acceptance condition"
        )
        return result

    result["outcome"] = OUTCOME_AUTO_CLOSED
    result["reason"] = (
        "baseline discrimination holds: the unchanged criterion FAILS on the "
        "pre-fix tree and PASSES on the fixed tree"
    )
    return result


def run_harness(
    session_set_dir: Path,
    session_number: int,
    round_number: int,
    timeout: int = DEFAULT_TIMEOUT_SECONDS,
) -> dict:
    """Evaluate every blocking finding of round *round_number*'s envelope.

    Returns the artifact dict (also written to
    ``sN-acceptance-round-<M>.json``). Raises
    :class:`AcceptanceHarnessError` when the round or its baseline is
    unusable — the harness never guesses at a missing baseline, because a
    criterion run against the wrong "before" tree is worse than no
    criterion at all.
    """
    envelope_path = issues_artifact_path(
        session_set_dir, session_number, round_number
    )
    if not envelope_path.is_file():
        raise AcceptanceHarnessError(
            f"no findings envelope at {envelope_path.name}: the harness runs "
            "against a round that reported blocking findings"
        )
    try:
        envelope = json.loads(envelope_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise AcceptanceHarnessError(
            f"could not read {envelope_path.name}: {exc}"
        ) from exc
    if not isinstance(envelope, dict):
        raise AcceptanceHarnessError(
            f"{envelope_path.name} is not a findings envelope object"
        )

    entries = collect_criteria(envelope)
    if not entries:
        raise AcceptanceHarnessError(
            f"{envelope_path.name} carries no blocking findings: acceptance "
            "criteria exist for Critical/Major findings only"
        )

    baseline = find_discovery_baseline_tree(
        session_set_dir, session_number, round_number + 1
    )
    if baseline is None:
        raise AcceptanceHarnessError(
            "no prior round of this session recorded a discoveryBaselineTree, "
            "so there is no pre-fix tree to discriminate against. Run "
            "--phase discovery first (it records the baseline)."
        )
    baseline_round, baseline_tree = baseline
    # A pre-fix tree is only usable for THIS round's criteria when the
    # round recorded it itself. Only discovery-family rounds do, so a
    # remediation-review round's criteria would otherwise be compared
    # against the pre-remediation tree (close-backstop round 10).
    baseline_is_own = baseline_round == round_number

    repo_root = repo_root_for(session_set_dir)
    fixed_tree = snapshot_worktree_tree(repo_root)
    if fixed_tree is None:
        raise AcceptanceHarnessError(
            "could not snapshot the current working tree as the fixed tree "
            "(fails closed)"
        )

    artifact_path = acceptance_artifact_path(
        session_set_dir, session_number, round_number
    )
    # The criteria as the VERIFIER wrote them. This — not the mutable
    # envelope, and not a previous harness run — is what "unchanged"
    # means, so the FIRST run is guarded like every later one.
    authoritative = raw_artifact_criteria(
        session_set_dir, session_number, round_number
    )
    changed_paths = changed_paths_between(
        repo_root, baseline_tree, fixed_tree
    )

    needs_execution = any(
        (acceptance_block(e["issue"]) or {}).get("kind") == "executable"
        for e in entries
    )
    results: List[dict] = []
    worktrees: Optional[CriterionWorktrees] = None
    if needs_execution and baseline_is_own and baseline_tree != fixed_tree:
        worktrees = CriterionWorktrees(repo_root, baseline_tree, fixed_tree)
    for entry in entries:
        results.append(
            evaluate_criterion(
                repo_root, entry, changed_paths, worktrees, timeout,
                authoritative, baseline_is_own,
            )
        )
    if needs_execution and worktrees is None and baseline_is_own:
        # The tree never moved: no remediation landed, so no criterion can
        # discriminate anything. Say that, rather than leaving the generic
        # "no disposable worktree" reason.
        for result in results:
            if result.get("outcome") == OUTCOME_ERROR:
                result["reason"] = (
                    "the fixed tree is identical to the pre-fix baseline: "
                    "no remediation has landed, so no criterion can "
                    "discriminate"
                )

    artifact = {
        "schemaVersion": ARTIFACT_SCHEMA_VERSION,
        "sessionNumber": session_number,
        "verificationRound": round_number,
        "baselineRound": baseline_round,
        "baselineIsOwnRound": baseline_is_own,
        "baselineTree": baseline_tree,
        "fixedTree": fixed_tree,
        "criteriaBoundToRawArtifact": authoritative is not None,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "timeoutSeconds": timeout,
        "results": results,
    }
    artifact_path.write_text(
        json.dumps(artifact, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return artifact


# ---------------------------------------------------------------------------
# Reading results back (consumed by verify_session's remediation-review)
# ---------------------------------------------------------------------------

def read_acceptance_results(
    session_set_dir: Path, session_number: int, upto_round: int
) -> List[dict]:
    """Every acceptance artifact for rounds before *upto_round*, in order.

    Tolerant, like every other artifact reader here: an unreadable or
    malformed artifact is skipped rather than raised on, because the
    review it feeds must still run.
    """
    artifacts: List[dict] = []
    for round_number in range(1, upto_round):
        path = acceptance_artifact_path(
            session_set_dir, session_number, round_number
        )
        if not path.is_file():
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if isinstance(data, dict) and isinstance(data.get("results"), list):
            artifacts.append(data)
    return artifacts


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="acceptance_harness",
        description=(
            "Run the verifier's acceptance criteria for a findings round "
            "against the pre-fix and fixed trees, in disposable worktrees. A "
            "criterion auto-closes its finding ONLY if it fails before and "
            "passes after (baseline discrimination). Everything else stays "
            "judgment-based for the retained remediation-review."
        ),
    )
    parser.add_argument(
        "--session-set-dir",
        required=True,
        help="Path to the session-set directory.",
    )
    parser.add_argument(
        "--session-number",
        type=int,
        default=None,
        help="Session number (defaults to the in-progress session).",
    )
    parser.add_argument(
        "--round",
        type=int,
        required=True,
        dest="round_number",
        help=(
            "The findings round whose envelope supplies the criteria (the "
            "round you just remediated)."
        ),
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=DEFAULT_TIMEOUT_SECONDS,
        help=(
            "Per-run wall-clock timeout in seconds "
            f"(default: {DEFAULT_TIMEOUT_SECONDS}). A timeout is a harness "
            "error, never a pass or a clean fail."
        ),
    )
    return parser


def _print_summary(artifact: dict) -> None:
    results = artifact.get("results") or []
    closed = [r for r in results if r.get("outcome") == OUTCOME_AUTO_CLOSED]
    print(
        f"acceptance_harness: session {artifact['sessionNumber']}, round "
        f"{artifact['verificationRound']} -- {len(results)} blocking "
        f"finding(s), {len(closed)} auto-closed by baseline discrimination."
    )
    print(
        f"  pre-fix tree {str(artifact['baselineTree'])[:12]} (round "
        f"{artifact['baselineRound']}) -> fixed tree "
        f"{str(artifact['fixedTree'])[:12]}"
    )
    for result in results:
        marker = "[x]" if result.get("outcome") == OUTCOME_AUTO_CLOSED else "[ ]"
        print(
            f"  {marker} #{result.get('issueIndex')} "
            f"[{result.get('severity')}] {result.get('outcome')}: "
            f"{result.get('summary')}"
        )
        reason = result.get("reason")
        if reason:
            print(f"        {reason}")
    print(
        "  Every non-auto-closed finding keeps its blocking status and is "
        "settled by --phase remediation-review, which also reads this "
        "artifact."
    )
    still_failing = [
        r for r in results if r.get("outcome") == OUTCOME_STILL_FAILING
    ]
    if still_failing:
        print(
            f"\n  ATTENTION: {len(still_failing)} criterion/criteria still "
            "FAIL on the fixed tree -- the fix does not satisfy the "
            "verifier's own acceptance condition. Fix that before spending "
            "a remediation-review cycle on it."
        )


def main(argv: Optional[List[str]] = None) -> int:
    args = _build_arg_parser().parse_args(argv)
    session_set_dir = Path(args.session_set_dir).resolve()
    if not session_set_dir.is_dir():
        print(
            f"acceptance_harness: not a directory: {session_set_dir}",
            file=sys.stderr,
        )
        return EXIT_USAGE
    session_number = args.session_number
    if session_number is None:
        try:
            session_number = resolve_in_progress_session(session_set_dir)
        except VerifySessionError as exc:
            print(f"acceptance_harness: {exc}", file=sys.stderr)
            return EXIT_USAGE
    if args.round_number < 1:
        print(
            "acceptance_harness: --round must be 1 or greater",
            file=sys.stderr,
        )
        return EXIT_USAGE
    if args.timeout < 1:
        print(
            "acceptance_harness: --timeout must be 1 or greater",
            file=sys.stderr,
        )
        return EXIT_USAGE
    try:
        artifact = run_harness(
            session_set_dir, session_number, args.round_number, args.timeout
        )
    except (AcceptanceHarnessError, VerifySessionError) as exc:
        print(f"acceptance_harness: {exc}", file=sys.stderr)
        return EXIT_USAGE
    _print_summary(artifact)
    return EXIT_OK


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
