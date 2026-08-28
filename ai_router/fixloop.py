"""The complete suite, and the bounded fix loop a red run opens.

The suite runs against the tree that includes the tests the verifier wrote,
because a suite run before them proves the state of the code without the one
reading that was bought to challenge it.

**The envelope is the feature.** A model asked to fix failing tests will
otherwise revise whatever it notices on the way past, which is the thing the
operator excluded by name. So a fix round is handed only the failing test
names, their output, and the files those failures implicate; and its writes
are confined to the session's own diff plus those implicated files. A write
outside the envelope is refused before any bytes are written — a boundary,
not a sentence in a prompt asking nicely.

The confinement is complete rather than a first line of defence: the model
has no filesystem on any transport. It describes a file in a fenced block and
:mod:`ai_router.agency` is what opens one, so there is no second route by
which a fix could reach a path this module did not allow.

**Nothing here solicits a finding.** The round's job is the named failure. An
observation about anything else is recorded verbatim and acted on by nobody,
because a fix round that also reports is a fix round that also expands.

What counts as a failure is read out of the runner's own output against the
test root this repository declares, so the parser knows what a test is from
the same declaration selection reads. It fails closed in both directions: a
failure it cannot find narrows the envelope rather than widening it, and a
red run whose output names no test it recognises opens no fix round at all.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from ai_router import agency
from ai_router.checks import (
    STAGE_FINAL_FULL, changed_paths_between, execute, load_selection_config,
    names_a_test, snapshot_worktree_tree, timeout_for,
)
from ai_router.route import NoCandidateError, route
from ai_router.selection import ROLE_GENERATOR
from ai_router.testphase import PhaseError, suites_for

TASK_TYPE = "code-fix"

#: The words a runner puts beside a test it did not pass. A closed set, and
#: deliberately not a grammar for any one runner: this is a scan of output
#: for a declared test path standing next to a word meaning failure.
#:
#: Incompleteness here is safe by construction. A failure this misses is a
#: file the envelope does not open, so the loop can only ever be narrower
#: than the failures warrant — and a red run that names nothing recognisable
#: is refused rather than sent to a fix round with no target.
FAILURE_MARKERS = ("FAILED", "ERROR", "FAIL", "FAILURE")

#: How much of the run's output the fix round is shown. The whole run is in
#: the record; what goes to the model is the end, where runners put the
#: summary of what failed.
MAX_OUTPUT_CHARS = 20_000

#: How much of one implicated file is shown. A file over this is named
#: rather than quoted: a truncated source file invites a fix written against
#: half a function.
MAX_FILE_CHARS = 20_000

#: A path-shaped token: something with a directory separator or an extension,
#: optionally carrying the ``::selector`` suffix runners append to name one
#: test inside a file. A leading drive letter is part of the token, because a
#: traceback on Windows prints one and a path that stops at the colon is not
#: the path the runner named.
_DRIVE = r"(?:[A-Za-z]:[\\/])?"
_TOKEN_BODY = _DRIVE + r"[A-Za-z0-9_./\\-]*[A-Za-z0-9_-]\.[A-Za-z0-9_]+"
_TOKEN = re.compile(_TOKEN_BODY + r"(?:::[^\s,)\"']+)?")

#: The same token, but only where the output points *at* it — a line number
#: or a test selector attached to the path. Runners name a file with a
#: position when they are pointing at code that failed, and name it bare when
#: they are reporting their own configuration; requiring the position is what
#: keeps a header line like ``configfile: pytest.ini`` out of the envelope.
#: Two spellings, because runners have two: the position immediately after
#: the path (``app.py:4``, ``a.js:10:5``, ``File.cs:line 12``), and the path
#: quoted with the position beside it (``File "app.py", line 4``).
_LOCATED = re.compile(_TOKEN_BODY + r"(?=:\s*\d|::|:\s*line\b)", re.IGNORECASE)
_QUOTED_LOCATED = re.compile(
    r"[\"'](" + _TOKEN_BODY + r")[\"'][,:]?\s+line\s+\d+", re.IGNORECASE
)

#: Where a round puts what it noticed and was not asked about.
_OBSERVATIONS = re.compile(r"^#{1,6}\s*OBSERVATIONS\s*$", re.IGNORECASE)
_HEADING = re.compile(r"^#{1,6}\s+")


class FixLoopError(Exception):
    """The loop could not be run. Never an outcome — a fix round that did not
    happen and one whose writes were all refused are different facts."""


@dataclass(frozen=True)
class Failure:
    """One test the runner did not pass: what it was called, and the declared
    test file that name belongs to."""

    name: str
    path: str


@dataclass(frozen=True)
class Envelope:
    """Where a fix round may write: the session's own diff, plus the files
    the failures implicate.

    Membership is exact. A prefix rule would let one changed file in a
    package open the whole package, which is the sprawl the envelope exists
    to stop — and every entry here is a file, because both halves are
    produced by git and by the runner rather than typed.
    """

    session_paths: tuple = ()
    implicated: tuple = ()

    @property
    def paths(self) -> tuple:
        return tuple(sorted(set(self.session_paths) | set(self.implicated)))

    def allows(self, rel: str) -> bool:
        return bool(rel) and rel in set(self.paths)

    def as_dict(self) -> dict:
        return {
            "sessionPaths": list(self.session_paths),
            "implicated": list(self.implicated),
            "paths": list(self.paths),
        }


@dataclass(frozen=True)
class FixRound:
    """One fix round: who fixed, what the framework let them write, and what
    they mentioned that nobody will act on."""

    provider: str
    model: str
    transport: str
    writes: tuple = ()
    observations: tuple = ()
    simulated: bool = False

    @property
    def written(self) -> tuple:
        return tuple(w.path for w in self.writes if w.accepted)

    @property
    def refused(self) -> tuple:
        return tuple(w.path for w in self.writes if not w.accepted)

    def as_dict(self) -> dict:
        return {
            "provider": self.provider,
            "model": self.model,
            "transport": self.transport,
            "simulated": self.simulated,
            "written": list(self.written),
            "writes": [w.as_row() for w in self.writes],
            "observations": list(self.observations),
        }


def _posix(path) -> str:
    return str(path).replace("\\", "/").strip("/")


def run_suite(repo_root, config: dict, authored, *, run_id: str = ""):
    """Run the complete suite against the tree, and report what it said.

    Returns a tuple of :class:`ai_router.checks.CheckRun`, one per suite
    that owns some of the tests the verifier wrote, resolved through
    :func:`ai_router.testphase.suites_for` so that "which suite answers for
    these tests" has one implementation. Plural because a repository running
    two ecosystems has two complete suites, and running only the first would
    call one ecosystem's green the whole tree's.

    Each command is the declared one, unnarrowed: this stage is the whole
    suite by definition, and a targeted command here would be a smaller
    claim wearing the same name.
    """
    paths = tuple(dict.fromkeys(p for p in authored if p))
    if not paths:
        raise FixLoopError(
            "no authored test to include, so this would be the suite as it "
            "stood before the verifier read anything. The complete suite "
            "runs against the tree including the tests it wrote."
        )
    try:
        groups = suites_for(config, paths)
    except PhaseError as exc:
        raise FixLoopError(str(exc)) from exc
    runs = []
    for check, _owned in groups:
        tree = snapshot_worktree_tree(repo_root)
        if tree is None:
            raise FixLoopError(
                f"could not snapshot the working tree at {repo_root}. Every "
                "run is judged against a tree id, so a run that cannot name "
                "the tree it measured proves nothing about it."
            )
        try:
            timeout = timeout_for(check, config)
        except (KeyError, TypeError) as exc:
            raise FixLoopError(
                "run_policy.check_timeout_seconds is not declared, and an "
                f"unbounded suite run is how a loop stops being bounded: "
                f"{exc}"
            ) from exc
        runs.append(execute(
            repo_root, check, check.display_command(),
            stage=STAGE_FINAL_FULL, tree_digest=tree,
            timeout_seconds=timeout, run_id=run_id,
        ))
    return tuple(runs)


def _candidates(line: str) -> list:
    return [m.group(0) for m in _TOKEN.finditer(line)]


def _marked(line: str) -> bool:
    upper = line.upper()
    return any(
        re.search(rf"(?<![A-Z]){marker}(?![A-Z])", upper)
        for marker in FAILURE_MARKERS
    )


def _resolve(repo_root, token: str) -> str:
    """A path token as this repository would spell it, or ``""``.

    Runners print absolute paths as readily as relative ones — a Windows
    traceback names ``C:\\repo\\app.py`` and a subprocess names
    ``/repo/app.py`` — so the spelling is preserved until
    :func:`ai_router.agency.relative_posix` has placed it against the
    repository. Normalising first would strip the leading separator and turn
    an absolute path into a relative one that names something else.
    """
    path = str(token).split("::", 1)[0]
    if repo_root is None:
        return _posix(path)
    return agency.relative_posix(repo_root, path) or ""


def failures(output: str, selection, repo_root=None) -> tuple:
    """The tests the run named as not passing, in the order it named them.

    A line qualifies when it stands a declared test path next to a word
    meaning failure. Both halves are needed: the marker alone matches a test
    *about* errors, and the path alone matches every line of a verbose run.
    """
    found, seen = [], set()
    for line in (output or "").splitlines():
        if not _marked(line):
            continue
        for token in _candidates(line):
            path = _resolve(repo_root, token)
            selector = token.split("::", 1)[1] if "::" in token else ""
            name = f"{path}::{selector}" if selector else path
            if not path or not names_a_test(path, selection) or name in seen:
                continue
            seen.add(name)
            found.append(Failure(name=name, path=path))
    return tuple(found)


def implicated_paths(repo_root, output: str, failing=()) -> tuple:
    """The repository files the failures point at.

    Two sources, and no third: the files the named failing tests live in, and
    the files the output points at with a position — ``app.py:4``,
    ``main.go:17``, ``a.js:10:5``, ``File "app.py", line 4``. Whatever the
    runner, it names a file with a position when it is pointing at code that
    failed.

    A path the output merely mentions is not implicated. A runner also prints
    its own configuration, its rootdir and its plugins, and taking those as
    implicated would put the suite's own settings inside the envelope — which
    would let a fix round reroute the run instead of repairing the code.

    A token that does not resolve to a file inside the repository is dropped,
    so a vendored frame in a traceback cannot put ``site-packages`` in the
    envelope. Absolute paths a runner prints with a drive letter resolve on
    this rule too or not at all, which narrows the envelope rather than
    widening it.
    """
    root = Path(repo_root)
    found, seen = [], set()
    named = (
        [f.path for f in failing]
        + [m.group(0) for m in _LOCATED.finditer(output or "")]
        + [m.group(1) for m in _QUOTED_LOCATED.finditer(output or "")]
    )
    for token in named:
        rel = _resolve(root, token)
        if not rel or rel in seen or not (root / rel).is_file():
            continue
        seen.add(rel)
        found.append(rel)
    return tuple(sorted(found))


def build_envelope(repo_root, base_tree: str, output: str, selection) -> Envelope:
    """What this fix round may write to: the session's diff plus the files
    the failures implicate.

    The session half is measured with the machinery every other fix delta in
    this package is measured with, against the tree the session started
    from. A diff git cannot answer is refused rather than treated as empty:
    an empty envelope would refuse every write and read afterwards as a model
    that proposed nothing.

    The implicated half is derived from the failures this repository's own
    declaration lets the parser recognise, not from everything the runner
    printed.
    """
    current = snapshot_worktree_tree(repo_root)
    if current is None:
        raise FixLoopError(
            f"could not snapshot the working tree at {repo_root}, so the "
            "session's own diff cannot be measured and the envelope cannot "
            "be built."
        )
    changed = changed_paths_between(repo_root, base_tree, current)
    if changed is None:
        raise FixLoopError(
            f"git could not diff {base_tree} against the working tree. An "
            "unmeasurable session diff is not an empty one, and treating it "
            "as empty would silently refuse every fix."
        )
    return Envelope(
        session_paths=tuple(sorted(_posix(p) for p in changed)),
        implicated=implicated_paths(
            repo_root, output, failures(output, selection, repo_root)
        ),
    )


def observations(text: str) -> tuple:
    """What the round noticed and was not asked about, kept verbatim.

    Recorded because a finding erased is worse than a finding mis-severed,
    and acted on by nobody because this round's job is the named failure.
    """
    lines = (text or "").replace("\r\n", "\n").split("\n")
    out, collecting = [], False
    for line in lines:
        if _OBSERVATIONS.match(line.strip()):
            collecting = True
            continue
        if collecting and _HEADING.match(line):
            break
        if collecting and line.strip():
            out.append(line.strip().lstrip("-*").strip())
    return tuple(o for o in out if o)


def _tail(output: str) -> str:
    text = output or ""
    if len(text) <= MAX_OUTPUT_CHARS:
        return text
    return "…\n" + text[-MAX_OUTPUT_CHARS:]


def read_envelope_files(repo_root, envelope: Envelope) -> list:
    """The implicated files as ``(path, text)``, largest ones named only.

    Only the implicated half is quoted. The session diff is in the envelope
    because the fix may need to write there, not because the round is owed a
    tour of everything the session touched.
    """
    root = Path(repo_root)
    out = []
    for rel in envelope.implicated:
        try:
            text = (root / rel).read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        if len(text) > MAX_FILE_CHARS:
            out.append((rel, f"(not shown: {len(text)} characters)"))
        else:
            out.append((rel, text))
    return out


def build_prompt(failing, output: str, files: list, envelope: Envelope,
                 grant) -> str:
    """What the fix round is asked for: a repair to a named failure, and
    nothing else.

    The write surface is described by :func:`ai_router.agency.briefing`, so
    the block the prompt asks for and the block the framework parses are one
    description.
    """
    body = [
        "The test suite failed. Fix the failures named below.",
        "",
        "You wrote this code, or you are standing in for whoever did. This "
        "is not a review: nobody is asking you what you think of it.",
        "",
        "## What failed",
        "",
    ]
    body += [f"- `{f.name}`" for f in failing]
    body += ["", "## What the run said", "", "````", _tail(output).rstrip(),
             "````", ""]
    if files:
        body += ["## The files these failures implicate", ""]
        for path, text in files:
            body += [f"### `{path}`", "", "````", text.rstrip(), "````", ""]

    briefing = agency.briefing(grant)
    if briefing:
        body += [briefing, ""]

    body += [
        "## How to answer",
        "",
        "**Emit the repaired files and nothing else that matters.** Every "
        "file goes in its own write block, exactly as described above.",
        "",
        "- **Fix the named failures and nothing else.** A change that is not "
        "needed by one of the failures above is out of scope, however "
        "correct it is.",
        "- **Do not weaken a test to make it pass.** A test edited until it "
        "agrees with the code proves the code agrees with itself.",
        "- **Emit the whole file**, not a patch or a fragment. The framework "
        "writes what the block contains.",
        "",
        "**You may write only to these paths:**",
        "",
    ]
    body += [f"- `{p}`" for p in envelope.paths]
    body += [
        "",
        "A write to anything else is refused by the framework before "
        "anything is opened. It is not a request — there is no path by "
        "which a file outside this list can be changed by this round.",
        "",
        "**No findings are wanted.** If you noticed something unrelated, put "
        "it under an `## OBSERVATIONS` heading. It will be recorded word for "
        "word and acted on by nobody, which is the honest treatment: this "
        "round exists to answer a failing test, and a round that also "
        "reports is a round that also expands.",
    ]
    return "\n".join(body)


def fix(
    repo_root,
    config: dict,
    *,
    failing,
    output: str,
    envelope: Envelope,
    transport: Optional[str] = None,
    read_budget: Optional[int] = None,
) -> tuple:
    """Ask for the repair and write the parts of it the envelope allows.

    Returns ``(FixRound, raw response)`` — the raw text is returned so the
    caller can file it verbatim.

    No provider is excluded. The exclusion that makes a review cross-vendor
    is exactly wrong here: this is the author's own repair of the author's
    own code, and routing it away from them would make a second vendor
    responsible for work it has not seen.
    """
    if not failing:
        raise FixLoopError(
            "no failing test to fix. A fix round with no named failure is a "
            "model invited to revise whatever it notices, which is the one "
            "thing the envelope exists to prevent."
        )
    if not envelope.paths:
        raise FixLoopError(
            "the envelope is empty, so every write would be refused after "
            "the call had already been paid for. A session with no diff and "
            "no implicated file has nothing this round could repair."
        )

    from ai_router.config import resolve_transport

    # Read the implicated files; write the envelope. §3.d says the round
    # receives the failures and the files they implicate, so the reading
    # surface stops there — a session with an unrelated file in flight must
    # not have it blessed as something this round was invited to look at.
    # The write envelope is wider because §3.d says it is: a fix may need to
    # land in a file the session already changed.
    scope = tuple(envelope.implicated)
    budget = read_budget or agency.DEFAULT_READ_BUDGET

    def _grant(for_transport: str):
        return agency.grant_for_transport(
            for_transport, scope, budget, allow_write=True,
            write_envelope=envelope.paths,
            write_label=agency.WRITE_LABEL_FIX,
        )

    # Briefed from the resolved preference; the writes are applied under the
    # grant of the transport the call actually ran on, because a round that
    # fell back could not look however it was briefed.
    briefed = _grant(resolve_transport(config, transport))
    prompt = build_prompt(
        failing, output, read_envelope_files(repo_root, envelope),
        envelope, briefed,
    )
    try:
        result = route(
            content=prompt, task_type=TASK_TYPE, role=ROLE_GENERATOR,
            transport=transport,
        )
    except NoCandidateError as exc:
        raise FixLoopError(
            f"{exc}. There is no candidate to repair the failure, so the "
            "loop stops here rather than leaving the suite red and the "
            "record silent about why."
        ) from exc

    writes = agency.apply_writes(
        repo_root, _grant(result.transport), result.content
    )
    return FixRound(
        provider=result.provider,
        model=result.served_model_id or result.model_name,
        transport=result.transport,
        writes=writes,
        observations=observations(result.content),
        simulated=bool((result.metadata or {}).get("simulated")),
    ), result.content


def selection_for(config: dict):
    """This repository's declaration of where its tests live, or a refusal.

    The failure parser reads the same declaration selection reads, because a
    framework with a second opinion about what a test is will eventually
    disagree with itself about which run proved what.
    """
    loaded = load_selection_config(config)
    if not loaded.config.declares_tests:
        raise FixLoopError(
            "no suite in testing.suites declares where its tests live, so "
            "no line of the run's output could be confirmed to name a "
            "test and no failure could be found in it."
        )
    return loaded.config


__all__ = [
    "Envelope", "Failure", "FixLoopError", "FixRound", "build_envelope",
    "build_prompt", "failures", "fix", "implicated_paths", "observations",
    "run_suite", "selection_for",
]
