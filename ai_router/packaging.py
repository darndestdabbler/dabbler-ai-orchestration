"""Step (f): pack, then push, and the two facts that decide whether it runs.

**A session publishes because it said it would, before it wrote anything.**
The declaration of §3.a is read here and never made here, and it fails closed
— a session that never declared is a session that cannot publish. That is the
entire reason the declaration comes first: otherwise a model decides in
hindsight what may go to a feed, having seen how the work turned out.

**The second fact is the order**, and "after (e)" has to mean the evidence for
(a) through (e) exists rather than that commands were typed in a pleasing
sequence. So this module asks the close gates instead of forming its own
opinion about verification, the run of record, the clean tree and the push.
One question with two answers is how a record starts disagreeing with itself.

**The credential is in no environment.** It resolves by name through
:mod:`ai_router.secret_resolver` and is substituted into a single element of
the push argv at spawn; both children are handed
:func:`ai_router.checks.child_env`, so nothing from the parent environment is
inherited either. Nothing is a shell string, so no shell can re-split the
element the value landed in. The record keeps the placeholder where the value
went and command output is scrubbed of it before it is written, because a
credential that reaches a log has leaked whether or not it reached an
environment.

**Pack writes into the run's own directory, never into the repository.** The
artifacts are then by construction what this run produced — last week's build
cannot be published by accident — and the tree that was just verified stays
the tree that was verified. That last part is checked rather than assumed: the
worktree is compared against its own tree id after every command, and a build
that leaves intermediates behind fails the attempt whatever its exit code
said. Artifacts from a tree nobody verified are exactly what step (f) exists
to keep off a feed.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from .checks import child_env
from .evidence import repo_root_for, snapshot_worktree_tree
from .gates import run_gates
from .ledger import (
    append_packaging, package_output_dir, packaging_path, read_packaging,
)
from .progress import read_session_state
from .secret_resolver import resolve_secret
from .writers import session_is_releasable

#: What the framework supplies, and the only tokens it will substitute. A
#: placeholder outside this set is left alone: it is either the tool's own
#: syntax or a typo, and silently emptying it would be the worse of the two.
PLACEHOLDER_OUTPUT = "{output}"
PLACEHOLDER_ARTIFACT = "{artifact}"
PLACEHOLDER_FEED = "{feed}"
PLACEHOLDER_SECRET = "{secret}"

#: What stands in the record where the value was. Deliberately the
#: placeholder itself rather than a row of asterisks: the recorded command is
#: then the declared command, which is the thing anyone reading it wants.
REDACTION = PLACEHOLDER_SECRET

OUTCOME_PUBLISHED = "published"
OUTCOME_REFUSED = "refused"
OUTCOME_FAILED = "failed"

STEP_PACK = "pack"
STEP_PUSH = "push"

DEFAULT_TIMEOUT_SECONDS = 900.0

#: How much of a command's output the record keeps. The tail, because that is
#: where a build tool puts the reason it stopped.
MAX_OUTPUT_CHARS = 20_000

#: Below this a scrub is refused rather than performed. A one- or two-
#: character "secret" would match everywhere in ordinary output and turn the
#: record into redaction confetti; a credential that short is a
#: misconfiguration to surface, not something to publish with.
MIN_SECRET_CHARS = 8


class PackagingConfigError(ValueError):
    """The declaration cannot be run as written. Refused at load, because a
    repository that declares nothing and one that declares something broken
    must never produce the same silence."""


class PackagingError(RuntimeError):
    """Packaging could not proceed. Never an outcome: a publication that was
    refused and one that failed at the feed are different facts, and both are
    recorded as themselves."""


@dataclass(frozen=True)
class PackStep:
    argv: tuple
    cwd: str = ""
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS


@dataclass(frozen=True)
class PushStep:
    argv: tuple
    feed: str
    secret: str
    secret_source: str = "env"
    cwd: str = ""
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS


@dataclass(frozen=True)
class Declaration:
    pack: PackStep
    push: PushStep


@dataclass(frozen=True)
class StepRun:
    """One command that ran. ``command`` is what the record shows, so the
    secret placeholder is still in it."""

    step: str
    command: str
    exit_code: Optional[int]
    duration_seconds: float
    timed_out: bool = False
    output: str = ""
    artifact: str = ""

    @property
    def green(self) -> bool:
        return self.exit_code == 0

    def as_row(self) -> dict:
        row = {
            "step": self.step,
            "command": self.command,
            "exit_code": self.exit_code,
            "duration_seconds": round(self.duration_seconds, 3),
            "timed_out": self.timed_out,
            "output": self.output,
        }
        if self.artifact:
            row["artifact"] = self.artifact
        return row


@dataclass(frozen=True)
class PackagingRun:
    """What one attempt did, and why. This is the record."""

    outcome: str
    session_number: int
    releasable: bool
    refusal: str = ""
    feed: str = ""
    secret_name: str = ""
    tree_digest: Optional[str] = None
    post_tree_digest: Optional[str] = None
    tree_mutated: bool = False
    artifacts: tuple = ()
    gates: tuple = ()
    steps: tuple = ()
    recorded_at: str = ""
    #: A dry run that got all the way to the point where a real one would
    #: have started packing. Never serialized and never filed: a rehearsal
    #: is not an attempt, and a ledger that carried them could not be read
    #: as a history of what was released.
    ready: bool = False

    @property
    def published(self) -> bool:
        return self.outcome == OUTCOME_PUBLISHED

    def as_record(self) -> dict:
        record = {
            "outcome": self.outcome,
            "session_number": self.session_number,
            "releasable": self.releasable,
            "recorded_at": self.recorded_at or _now_iso(),
        }
        if self.refusal:
            record["refusal"] = self.refusal
        if self.feed:
            record["feed"] = self.feed
        if self.secret_name:
            record["secret_name"] = self.secret_name
        if self.tree_digest is not None:
            record["tree_digest"] = self.tree_digest
        if self.tree_mutated:
            record["tree_mutated"] = True
            record["post_tree_digest"] = self.post_tree_digest
        if self.artifacts:
            record["artifacts"] = list(self.artifacts)
        if self.gates:
            record["gates"] = [dict(g) for g in self.gates]
        if self.steps:
            record["steps"] = [s.as_row() for s in self.steps]
        return record


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# --- The declaration ---------------------------------------------------------

def _argv_of(block: dict, label: str) -> tuple:
    argv = block.get("argv")
    if not isinstance(argv, list) or not argv:
        raise PackagingConfigError(f"{label}.argv must be a non-empty list")
    if not all(isinstance(a, str) and a.strip() for a in argv):
        raise PackagingConfigError(f"{label}.argv must be non-empty strings")
    return tuple(str(a) for a in argv)


def _timeout_of(block: dict, label: str) -> float:
    value = block.get("timeout_seconds")
    if value is None:
        return DEFAULT_TIMEOUT_SECONDS
    try:
        seconds = float(value)
    except (TypeError, ValueError):
        raise PackagingConfigError(
            f"{label}.timeout_seconds must be a number"
        ) from None
    if seconds <= 0:
        raise PackagingConfigError(
            f"{label}.timeout_seconds must be greater than zero"
        )
    return seconds


def _require_placeholders(argv: tuple, required, label: str) -> None:
    joined = " ".join(argv)
    missing = [token for token in required if token not in joined]
    if missing:
        raise PackagingConfigError(
            f"{label}.argv is missing {', '.join(missing)}. The framework "
            "supplies these, and a command that does not take them takes "
            "them from somewhere the record cannot see."
        )


def load_declaration(config: dict) -> Optional[Declaration]:
    """This repository's packaging declaration, or ``None`` for one that
    declares none.

    ``None`` is an answer, not a gap: a repository publishes because it said
    how, and there is no build to infer from a language nobody named.
    """
    block = (config or {}).get("packaging")
    if block is None:
        return None
    if not isinstance(block, dict):
        raise PackagingConfigError("packaging must be a mapping")

    pack_block = block.get("pack")
    push_block = block.get("push")
    for name, value in (("pack", pack_block), ("push", push_block)):
        if not isinstance(value, dict):
            raise PackagingConfigError(
                f"packaging.{name} must be a mapping; a packaging block "
                "declares both halves or neither, because a pack nobody "
                "pushes is a build and a push with nothing to send is a "
                "typo."
            )

    pack_argv = _argv_of(pack_block, "packaging.pack")
    _require_placeholders(pack_argv, (PLACEHOLDER_OUTPUT,), "packaging.pack")

    push_argv = _argv_of(push_block, "packaging.push")
    _require_placeholders(
        push_argv,
        (PLACEHOLDER_ARTIFACT, PLACEHOLDER_FEED, PLACEHOLDER_SECRET),
        "packaging.push",
    )

    feed = str(push_block.get("feed") or "").strip()
    if not feed:
        raise PackagingConfigError(
            "packaging.push.feed must name the feed. It is substituted into "
            "the command that runs, so the recorded destination is a fact "
            "about what happened rather than a caption beside it."
        )
    secret = str(push_block.get("secret") or "").strip()
    if not secret:
        raise PackagingConfigError(
            "packaging.push.secret must name the credential — the name, "
            "never the value. Values live in the environment or a "
            "registered secret backend, exactly as a provider's "
            "api_key_env does."
        )

    return Declaration(
        pack=PackStep(
            argv=pack_argv,
            cwd=str(pack_block.get("cwd") or ""),
            timeout_seconds=_timeout_of(pack_block, "packaging.pack"),
        ),
        push=PushStep(
            argv=push_argv,
            feed=feed,
            secret=secret,
            secret_source=str(push_block.get("secret_source") or "env"),
            cwd=str(push_block.get("cwd") or ""),
            timeout_seconds=_timeout_of(push_block, "packaging.push"),
        ),
    )


# --- Substitution, redaction, execution --------------------------------------

def substitute(argv, mapping: dict) -> tuple:
    """Replace placeholders element by element.

    Per element and never through a shell: a credential substituted into a
    shell string can be re-split, re-quoted, or logged by the shell itself,
    and none of those are things the framework can take back.
    """
    result = []
    for element in argv:
        text = str(element)
        for token, value in mapping.items():
            if token in text:
                text = text.replace(token, str(value))
        result.append(text)
    return tuple(result)


def redact(text: str, secret: Optional[str]) -> str:
    """Remove the resolved value from anything about to be written down.

    A short value is left alone rather than scrubbed: it would match inside
    ordinary words and bury the output under redactions, and a credential
    that short is a misconfiguration the record should show plainly.
    """
    if not text or not secret or len(secret) < MIN_SECRET_CHARS:
        return text
    return text.replace(secret, REDACTION)


def _tail(text: str) -> str:
    if len(text) <= MAX_OUTPUT_CHARS:
        return text
    return "...[truncated]...\n" + text[-MAX_OUTPUT_CHARS:]


def run_step(
    step: str, spawn_argv, record_argv, *, cwd, timeout_seconds: float,
    secret: Optional[str] = None, artifact: str = "",
) -> StepRun:
    """Run one declared command and report what it did.

    ``spawn_argv`` carries the resolved credential; ``record_argv`` carries
    the placeholder, and it is the one that is written down. The environment
    is :func:`ai_router.checks.child_env`, so the process inherits an
    allowlist rather than whatever the operator's shell happened to hold.
    """
    command = " ".join(record_argv)
    started = time.monotonic()
    with tempfile.TemporaryDirectory(
        prefix="dabbler-package-", ignore_cleanup_errors=True
    ) as scratch:
        env = child_env(scratch)
        try:
            completed = subprocess.run(
                list(spawn_argv), cwd=str(cwd), env=env,
                timeout=timeout_seconds, stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT, text=True, encoding="utf-8",
                errors="replace", check=False,
            )
            exit_code = completed.returncode
            output = completed.stdout or ""
            timed_out = False
        except subprocess.TimeoutExpired as exc:
            exit_code, timed_out = None, True
            raw = exc.output
            if isinstance(raw, bytes):
                raw = raw.decode("utf-8", "replace")
            output = (raw or "") + (
                f"\n[timed out after {timeout_seconds:g}s]"
            )
        except OSError as exc:
            # A command that could not start is a failed step, not a crash:
            # "dotnet is not installed on this machine" belongs in the
            # record beside the command that needed it.
            exit_code, timed_out = None, False
            output = f"[could not start: {type(exc).__name__}: {exc}]"
    return StepRun(
        step=step, command=command, exit_code=exit_code,
        duration_seconds=time.monotonic() - started, timed_out=timed_out,
        output=_tail(redact(output, secret)), artifact=artifact,
    )


# --- The output directory ----------------------------------------------------

def prepare_output_dir(repo_root, session_number: int) -> Path:
    """An empty directory of this run's own, replacing whatever was there.

    Replacing rather than reusing is the whole guarantee: everything found
    in it afterwards was built by the command that just ran, so no stale
    artifact can be swept into a push.
    """
    target = package_output_dir(repo_root, session_number)
    if target.exists():
        shutil.rmtree(target)
    target.mkdir(parents=True, exist_ok=True)
    return target


def artifacts_in(output_dir) -> tuple:
    """Everything pack produced, named relative to the output directory and
    in a stable order."""
    root = Path(output_dir)
    if not root.is_dir():
        return ()
    found = [p for p in root.rglob("*") if p.is_file()]
    return tuple(sorted(p.relative_to(root).as_posix() for p in found))


# --- The run -----------------------------------------------------------------

def _current_session(sessions_dir) -> Optional[int]:
    state = read_session_state(sessions_dir)
    if not state:
        return None
    return state.get("currentSession")


def _gate_rows(sessions_dir) -> tuple:
    """The close gates, asked exactly as the close asks them.

    No config is passed, because the close passes none: the gates resolve
    the configuration that governs the set's own repository. Handing them a
    different one is how packaging and the close come to disagree about
    whether the same session was ready.
    """
    return tuple(
        {
            "name": result.name,
            "passed": result.passed,
            "remediation": result.remediation,
        }
        for result in run_gates(sessions_dir)
    )


def _refusal(session_number, releasable, reason, gates=()) -> PackagingRun:
    return PackagingRun(
        outcome=OUTCOME_REFUSED, session_number=session_number,
        releasable=releasable, refusal=reason, gates=gates,
        recorded_at=_now_iso(),
    )


def package(sessions_dir, *, config=None, dry_run: bool = False) -> PackagingRun:
    """Run step (f) for the session in flight, or refuse and say why.

    The refusals are ordered by what they cost to discover. Releasability is
    first because it is free and because it is the one §3.a exists for; the
    credential resolves before ``pack`` runs, so a missing PAT is not
    discovered after a build has been paid for.
    """
    sessions_path = Path(sessions_dir)
    root = repo_root_for(sessions_path)
    if root is None:
        raise PackagingError(f"not inside a git repository: {sessions_path}")
    session_number = _current_session(sessions_path)
    if session_number is None:
        raise PackagingError(f"no session is in flight under {sessions_path}")

    if config is None:
        from .config import load_config
        # Resolved against the set's own repository, not the working
        # directory. A set in another checkout would otherwise be packaged
        # under this one's overlay -- which is where the feed and the
        # credential's name live.
        config = load_config(project_dir=str(root))

    releasable = session_is_releasable(sessions_path, session_number)
    if not releasable:
        return _refusal(
            session_number, False,
            f"session {session_number} did not declare itself releasable at "
            "step (a), so it cannot publish. An absent declaration is a "
            "refusal, not an unknown: declaring after the work is done is a "
            "model deciding in hindsight what may reach a feed.",
        )

    declaration = load_declaration(config)
    if declaration is None:
        return _refusal(
            session_number, True,
            "this repository declares no packaging block, so it publishes "
            "nothing. That is a declaration rather than a gap — there is no "
            "build to infer for an ecosystem nobody named.",
        )

    gates = _gate_rows(sessions_path)
    failed = [g for g in gates if not g["passed"]]
    if failed:
        return _refusal(
            session_number, True,
            "step (f) runs after (e), and the evidence for the earlier "
            "steps is not there: "
            + "; ".join(f"{g['name']}: {g['remediation']}" for g in failed),
            gates=gates,
        )

    secret_value = resolve_secret(
        declaration.push.secret, declaration.push.secret_source
    )
    if not secret_value:
        return _refusal(
            session_number, True,
            f"the credential {declaration.push.secret!r} is not set in the "
            f"{declaration.push.secret_source!r} backend. Resolving it "
            "before pack means a missing PAT costs nothing but this "
            "message, rather than a build that cannot be sent anywhere.",
            gates=gates,
        )

    if dry_run:
        return PackagingRun(
            outcome=OUTCOME_REFUSED, session_number=session_number,
            releasable=True, ready=True,
            refusal="dry run: every gate passed and nothing was run.",
            feed=declaration.push.feed, secret_name=declaration.push.secret,
            gates=gates, recorded_at=_now_iso(),
        )

    return _execute(
        root, sessions_path, session_number, declaration, secret_value, gates,
    )


def _execute(
    root, sessions_path, session_number, declaration, secret_value, gates,
) -> PackagingRun:
    tree_digest = snapshot_worktree_tree(root)
    output_dir = prepare_output_dir(root, session_number)
    push = declaration.push
    steps: list = []

    def _outcome(outcome, *, post=None, mutated=False, artifacts=()):
        return PackagingRun(
            outcome=outcome, session_number=session_number, releasable=True,
            feed=push.feed, secret_name=push.secret, tree_digest=tree_digest,
            post_tree_digest=post, tree_mutated=mutated, artifacts=artifacts,
            gates=gates, steps=tuple(steps), recorded_at=_now_iso(),
        )

    def _moved_the_tree() -> Optional[str]:
        """The tree id now, if a command has changed it.

        Checked after every command on the same terms
        :func:`ai_router.checks.execute` applies to a check: a command that
        changed the repository while it ran has invalidated its own result,
        whatever its exit code said. A build that leaves intermediates
        behind has produced artifacts from a tree nobody verified, and the
        push would put them on a feed under a record naming a tree that no
        longer exists on disk.
        """
        after = snapshot_worktree_tree(root)
        return after if after != tree_digest else None

    pack = declaration.pack
    pack_cwd = Path(root) / pack.cwd if pack.cwd else Path(root)
    pack_argv = substitute(pack.argv, {PLACEHOLDER_OUTPUT: str(output_dir)})
    steps.append(run_step(
        STEP_PACK, pack_argv, pack_argv, cwd=pack_cwd,
        timeout_seconds=pack.timeout_seconds,
    ))
    if not steps[-1].green:
        return _outcome(OUTCOME_FAILED)
    moved = _moved_the_tree()
    if moved:
        return _outcome(OUTCOME_FAILED, post=moved, mutated=True)

    artifacts = artifacts_in(output_dir)
    if not artifacts:
        return _refusal(
            session_number, True,
            "pack succeeded and produced no file, so there is nothing to "
            "push. An empty output directory is a broken declaration "
            "reporting success, and pushing nothing would record a "
            "publication that did not happen.",
            gates=gates,
        )

    push_cwd = Path(root) / push.cwd if push.cwd else Path(root)
    for artifact in artifacts:
        absolute = str(output_dir / artifact)
        common = {PLACEHOLDER_ARTIFACT: absolute, PLACEHOLDER_FEED: push.feed}
        spawn_argv = substitute(
            push.argv, {**common, PLACEHOLDER_SECRET: secret_value}
        )
        record_argv = substitute(
            push.argv, {**common, PLACEHOLDER_SECRET: REDACTION}
        )
        steps.append(run_step(
            STEP_PUSH, spawn_argv, record_argv, cwd=push_cwd,
            timeout_seconds=push.timeout_seconds, secret=secret_value,
            artifact=artifact,
        ))
        if not steps[-1].green:
            # Stop at the first rejection. Pushing the rest would leave a
            # feed holding part of a release and a record claiming it
            # published.
            return _outcome(OUTCOME_FAILED, artifacts=artifacts)
        moved = _moved_the_tree()
        if moved:
            return _outcome(
                OUTCOME_FAILED, post=moved, mutated=True, artifacts=artifacts,
            )

    return _outcome(OUTCOME_PUBLISHED, artifacts=artifacts)


def record(sessions_dir, run: PackagingRun) -> dict:
    """File the attempt. Machine-written, append-only, schema-validated."""
    if run.ready:
        raise PackagingError(
            "a dry run has nothing to file: it is a rehearsal of the gates, "
            "and a ledger carrying rehearsals cannot be read as a history of "
            "what was released."
        )
    sessions_path = Path(sessions_dir)
    root = repo_root_for(sessions_path)
    if root is None:
        raise PackagingError(f"not inside a git repository: {sessions_path}")
    return append_packaging(
        root, run.session_number, run.as_record()
    )


# --- CLI ---------------------------------------------------------------------

def _render(run: PackagingRun) -> str:
    lines = [f"packaging: {'ready (dry run)' if run.ready else run.outcome}"]
    for gate in run.gates:
        mark = "PASS" if gate["passed"] else "FAIL"
        note = f" — {gate['remediation']}" if gate["remediation"] else ""
        lines.append(f"  [{mark}] {gate['name']}{note}")
    if run.refusal:
        lines.append(f"  {run.refusal}")
    for step in run.steps:
        code = "timed out" if step.timed_out else f"exit {step.exit_code}"
        lines.append(f"  {step.step}: {code} — {step.command}")
    if run.tree_mutated:
        lines.append(
            f"  a declared command changed the repository while it ran "
            f"({run.tree_digest} -> {run.post_tree_digest}). The artifacts "
            "were built from a tree nobody verified, so nothing was pushed. "
            "Send the build's intermediates somewhere outside the "
            "repository, or ignore them."
        )
    if run.artifacts:
        lines.append(f"  artifacts: {', '.join(run.artifacts)}")
    if run.published:
        lines.append(f"  published to {run.feed}")
    return "\n".join(lines)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m ai_router.packaging",
        description=(
            "Step (f): pack the session's work and push it to the declared "
            "feed. Only a session that declared itself releasable at step "
            "(a) may publish, and only after the evidence for (a) through "
            "(e) exists."
        ),
    )
    parser.add_argument("--sessions-dir",
                        help="the repository's sessions root; derived from "
                             "the working directory when omitted")
    parser.add_argument(
        "--dry-run", action="store_true",
        help="show the gates and stop; nothing runs and nothing is recorded",
    )
    parser.add_argument(
        "--show-record", action="store_true",
        help="print the recorded attempts for the session in flight",
    )
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)

    from .evidence import resolve_sessions_dir

    sessions_dir = resolve_sessions_dir(args.sessions_dir)

    if args.show_record:
        sessions_path = Path(sessions_dir)
        root = repo_root_for(sessions_path)
        number = _current_session(sessions_path)
        if root is None or number is None:
            print("no session is in flight", file=sys.stderr)
            return 1
        rows = read_packaging(root, number)
        print(json.dumps(rows, indent=2) if args.json else (
            "\n".join(
                f"{r['recorded_at']}  {r['outcome']}  "
                f"{r.get('refusal') or r.get('feed', '')}" for r in rows
            ) or f"no packaging attempt recorded; see {packaging_path(root, number)}"
        ))
        return 0

    try:
        run = package(sessions_dir, dry_run=args.dry_run)
    except (PackagingError, PackagingConfigError) as exc:
        print(f"packaging: {exc}", file=sys.stderr)
        return 1

    if not args.dry_run:
        record(sessions_dir, run)

    print(json.dumps(run.as_record(), indent=2) if args.json else _render(run))
    return 0 if (run.published or run.ready) else 1


__all__ = [
    "Declaration", "PackStep", "PackagingConfigError", "PackagingError",
    "PackagingRun", "PushStep", "StepRun", "artifacts_in", "load_declaration",
    "package", "prepare_output_dir", "record", "redact", "run_step",
    "substitute",
]


if __name__ == "__main__":
    raise SystemExit(main())
