"""The verifier's tool surface: what it may look at, how much of it, what it
was actually shown, and the one thing it may change.

Four operations reach the verifier -- list files by pattern, search file
contents by pattern, read a file, and create or modify a test file. The
first three arrive on the seat path as the Copilot CLI's own ``glob``,
``grep`` and ``view`` tools. The CLI executes them inside its own process,
so this module cannot refuse a read; what it can do is declare the limits to
the verifier and then measure the round against them, which is also the
limit that matters: a verifier that reaches a blocking finding by not
looking at the counterevidence is caught by the log, never by a refusal.

The fourth is different in kind, and the difference is the point. The
verifier holds no write tool on either transport -- it emits the file it
wants in its answer, and the framework writes the bytes. So a write can be
refused outright, and is: a path outside the test root this repository
declares never reaches the filesystem. Enforcement lives here rather than in
the prompt, because a prompt is a request and this is a boundary.

Fidelity is the part that is not bookkeeping. Scope, budget and a log record
which file was opened and never what came back from it, and those differ
whenever anything sits between the file and the model. The CLI's scrubbing
layer rewrites credential-shaped text, so a correct ``f"Bearer {api_key}"``
is displayed as ``f"******"`` -- one confident, specific, wrong Major finding
already came from exactly that. The scrubber is right and stays; what was
missing is the mark.

``view`` returns its content as ``N. <text>`` with the file's own 1-based
line numbers, which turns fidelity into an exact comparison instead of a
guess: the shown line carries the number of the disk line it claims to be,
so the two are compared directly. Only the lines actually shown are compared,
so a truncated or ranged read is not slandered as a transform.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from .checks import SelectionConfig, SuiteScope, names_a_test

#: The round could look at the tree through tools.
MODE_TOOLS = "tools"
#: The round could not. The direct-API path sends no tools at all, and a
#: round that could not look is never reported as equivalent to one that
#: could -- that is gap 1 re-opened, acceptable as a fallback and
#: unacceptable as a silent one.
MODE_NONE = "none"

OP_LIST = "list"
OP_SEARCH = "search"
OP_READ = "read"
#: The only write, and the only operation no tool performs: the verifier
#: asks for it in its answer and the framework acts, which is what makes a
#: refusal possible at all.
OP_WRITE = "write"

#: The CLI tool that performs each granted read operation. This mapping is
#: the whole read grant: a tool absent from it is not part of the surface.
TOOL_OPERATIONS: dict = {"glob": OP_LIST, "grep": OP_SEARCH, "view": OP_READ}

READ_OPERATIONS: tuple = (OP_LIST, OP_SEARCH, OP_READ)

#: Read operations allowed per round. A ceiling, not an allowance to spend:
#: a review that needs more than this many files is reviewing more than one
#: session's change.
DEFAULT_READ_BUDGET = 40

#: The shown bytes matched the bytes on disk, line for line.
FIDELITY_VERBATIM = "verbatim"
#: They did not. A finding resting on this read is weighable, not trustable.
FIDELITY_TRANSFORMED = "transformed"
#: The comparison could not be made -- the file is gone, unreadable as text,
#: or the tool returned nothing line-numbered to compare. Neither a clean
#: bill nor an accusation, and distinct from both on purpose.
FIDELITY_UNVERIFIED = "unverified"

#: The framework wrote the bytes.
WRITE_ACCEPTED = "accepted"
#: It did not, and the reason is on the row. A refused write is recorded
#: rather than dropped: a boundary nobody can see being enforced is
#: indistinguishable from one that is not there.
WRITE_REFUSED = "refused"

#: Whether the accepted write brought a file into existence or replaced one.
ACTION_CREATED = "created"
ACTION_MODIFIED = "modified"

#: The fence label each kind of round writes under. Different jobs get
#: different labels so a block lifted out of one round's transcript is not
#: honoured by another whose boundary is a different shape.
WRITE_LABEL_TEST = "test-write"
WRITE_LABEL_FIX = "fix-write"

#: Ledger rows are read by humans and by the unresolved-session view; an
#: unbounded scope list or operation log helps neither.
_MAX_RECORDED_SCOPE = 200
_MAX_RECORDED_OPERATIONS = 200

_VIEW_LINE = re.compile(r"^\s*(\d+)\.(?: (.*))?$")

_IMPORT = re.compile(
    r"^[ \t]*(?:from[ \t]+(\.*)([\w.]*)[ \t]+import[ \t]+([^\n#]*)"
    r"|import[ \t]+([\w.]+))",
    re.MULTILINE,
)

_NAME = re.compile(r"[A-Za-z_]\w*")


# --- Scope -------------------------------------------------------------------

def _posix(value) -> str:
    text = str(value).replace("\\", "/").strip("/").removeprefix("./")
    return "" if text == "." else text


def _imported_names(names: str) -> list:
    """The bare names an ``import`` clause lists, aliases and parentheses
    discarded. ``from . import ledger`` names a sibling module, not the
    package, so the names are half of what an import declares."""
    found = []
    for part in names.replace("(", " ").replace(")", " ").split(","):
        match = _NAME.match(part.strip())
        if match:
            found.append(match.group(0))
    return found


def declared_dependencies(repo_root, rel_paths) -> set:
    """The intra-repository modules the changed Python files import.

    The import statement is the declaration; there is no second manifest to
    keep in step with it. First-order only -- a transitive closure is the
    whole repository again by another route, which is the thing scope
    exists to prevent.
    """
    root = Path(repo_root)
    found: set = set()
    for rel in rel_paths:
        if not rel.endswith(".py"):
            continue
        try:
            source = (root / rel).read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        package = _posix(Path(rel).parent)
        for dots, module, names, plain in _IMPORT.findall(source):
            if plain:
                stem, submodules = plain.replace(".", "/"), []
            else:
                if not dots:
                    parts = [p for p in module.split(".") if p]
                else:
                    # One dot means "this package"; each extra dot climbs.
                    parts = package.split("/") if package else []
                    for _ in range(len(dots) - 1):
                        if parts:
                            parts.pop()
                    parts.extend(p for p in module.split(".") if p)
                stem, submodules = "/".join(parts), _imported_names(names)
            stem = _posix(stem)
            stems = [stem] if stem else []
            stems.extend(f"{stem}/{name}" if stem else name
                         for name in submodules)
            for candidate_stem in stems:
                for candidate in (f"{candidate_stem}.py",
                                  f"{candidate_stem}/__init__.py"):
                    if (root / candidate).is_file():
                        found.add(candidate)
    return found


def session_scope(repo_root, sessions_dir, changed_paths) -> tuple:
    """What this round's verifier is scoped to: the session's changed files,
    the modules they declare they depend on, and the session set's own
    directory -- which carries the spec the work is judged against.

    ``sessions_dir`` is optional: a round outside a session set has no spec
    directory to add, and naming one that does not exist would put a path
    in the scope that no reader could open.

    Never the whole repository. A scope that resolved to everything would
    make the out-of-scope count structurally unreachable and the limit a
    decoration.
    """
    changed = {_posix(p) for p in (changed_paths or ()) if str(p).strip()}
    scope = set(changed)
    scope |= declared_dependencies(repo_root, changed)
    set_rel = relative_posix(repo_root, sessions_dir) if sessions_dir else None
    if set_rel:
        scope.add(set_rel)
    return tuple(sorted(scope))


def _relative_to(repo_root, path) -> Optional[Path]:
    """The absolute path *path* names inside the repository, or ``None``.

    An absolute path is placed against the repository; a relative one is
    already repository-relative, because the CLI runs with the repository
    as its working directory. Resolving a relative tool argument against
    this process's own directory instead would silently invent a path.

    Separators are normalised before anything else, so that a backslash is
    a separator on every platform. It already is on Windows; on POSIX,
    ``tests\\..\\pkg\\x.py`` is a single filename here and a traversal to
    the caller of ``open``, and a boundary that decides on one reading
    while the filesystem acts on the other fails open.
    """
    try:
        root = Path(repo_root).resolve()
        candidate = Path(str(path).replace("\\", "/"))
        if not candidate.is_absolute():
            candidate = root / candidate
        resolved = candidate.resolve()
        resolved.relative_to(root)
        return resolved
    except (OSError, ValueError):
        return None


def relative_posix(repo_root, path) -> Optional[str]:
    """The repository-relative posix form of *path*, traversal collapsed."""
    resolved = _relative_to(repo_root, path)
    if resolved is None:
        return None
    return _posix(resolved.relative_to(Path(repo_root).resolve()))



def in_scope(scope, rel: str) -> bool:
    """Scope entries are files or directories; a directory covers what is
    under it. An unresolvable path is out of scope rather than exempt."""
    if not rel:
        return False
    return any(
        rel == entry or rel.startswith(entry.rstrip("/") + "/")
        for entry in scope
    )


# --- The grant ---------------------------------------------------------------

@dataclass(frozen=True)
class AgencyGrant:
    mode: str
    scope: tuple = ()
    read_budget: int = DEFAULT_READ_BUDGET
    #: Where this repository says its tests live and what it calls them,
    #: one :class:`~ai_router.checks.SuiteScope` per declaring suite.
    #: Supplied by the caller from the same declaration test selection
    #: reads, so the test root is defined in one place.
    test_scopes: tuple = ()
    #: Whether this round may author tests at all. A code review round may
    #: not: the tests phase is a different round with a different job, and
    #: a surface offered everywhere is a surface used everywhere.
    allow_write: bool = False
    #: The exact paths a fix round may write to. When set it replaces the
    #: test-root rule outright rather than narrowing it: a fix repairs the
    #: code that failed, and a round confined to an envelope is confined to
    #: that envelope and nothing beside it.
    write_envelope: tuple = ()
    #: The fence label this round's writes carry. Two rounds with different
    #: jobs get different labels, so a block copied out of one round's
    #: transcript into another's is not silently honoured.
    write_label: str = WRITE_LABEL_TEST

    @property
    def operations(self) -> tuple:
        """What this round could do. Reads need a transport that carries the
        tools; the write does not, because no tool performs it — the model
        describes a file and the framework opens one, which works over any
        transport that returns text."""
        reads = READ_OPERATIONS if self.mode == MODE_TOOLS else ()
        return reads + ((OP_WRITE,) if self.allow_write else ())

    @property
    def test_selection(self) -> SelectionConfig:
        return SelectionConfig(scopes=self.test_scopes)

    @property
    def test_roots(self) -> tuple:
        """Every root a write could land under, across the declared suites."""
        return self.test_selection.test_roots

    @property
    def declares_tests(self) -> bool:
        return self.test_selection.declares_tests


def grant_for_transport(
    transport: str, scope=(), read_budget: int = DEFAULT_READ_BUDGET,
    test_scopes=(), allow_write: bool = False,
    write_envelope=(), write_label: str = WRITE_LABEL_TEST,
) -> AgencyGrant:
    """Only the seat path is agentic. Naming the transport here keeps the
    two paths from being recorded as the same kind of review.

    **The write does not depend on the transport, and the reads do.** The
    tool surface is the seat's, because giving it to the direct-API path
    means a tool-use loop written three times against three vendors'
    function-calling protocols. The write costs none of that: it is a fenced
    block in an ordinary answer. Confining it to the seat as well would put
    the tests phase — which the lifecycle requires of every session — out of
    reach of the configuration this package ships as its default, and the
    round that authored without tools already says so in ``mode``.
    """
    if transport == "copilot-cli":
        return AgencyGrant(
            MODE_TOOLS, tuple(scope), read_budget,
            tuple(test_scopes), allow_write,
            tuple(write_envelope), write_label,
        )
    return AgencyGrant(
        MODE_NONE, (), 0, tuple(test_scopes), allow_write,
        tuple(write_envelope), write_label,
    )


def briefing(grant: AgencyGrant) -> str:
    """What the verifier is told about its own surface.

    Nothing is described that was not granted: describing tools that were
    not sent invites a model to report reads it never made, and describing a
    write that will be refused invites a proposal that costs a call to turn
    away.
    """
    parts = []
    if grant.mode == MODE_TOOLS:
        parts.extend(_read_briefing(grant))
    elif grant.allow_write:
        parts.append(
            "## What you can look at\n\n"
            "**Only what is in this message.** You have no tools on this "
            "transport — no way to list, search or open a file. Work from "
            "the text you were given, and say so plainly where it is not "
            "enough rather than describing a file you did not see."
        )
    if grant.allow_write:
        parts.append(_write_briefing(grant))
    return "\n\n".join(parts)


def _read_briefing(grant: AgencyGrant) -> list:
    listed = "\n".join(f"- {path}" for path in grant.scope[:_MAX_RECORDED_SCOPE])
    write_note = (
        " and no way to change anything" if not grant.allow_write else ""
    )
    parts = [
        "## Your read surface\n\n"
        "You may **list files** (`glob`), **search file contents** (`grep`) "
        f"and **read a file** (`view`). You have no other tools{write_note}."
        "\n\n"
        f"**Scope** — what this round is confined to, not the "
        f"repository:\n\n{listed}\n\n"
        f"**Budget** — at most {grant.read_budget} reads this round.\n\n"
        "**Log** — every list, search and read is recorded on the round, "
        "confined to the scope or not. Confine a search or a listing by "
        "naming the scope paths you want it to cover; a pattern on its own "
        "reaches the whole tree and is recorded as unconfined. Reading "
        "nothing is recorded too: a finding asserted about a file you did "
        "not open is a finding without evidence.",
        "**What you are shown may not be what is on disk.** Credential-"
        "shaped text is rewritten before it reaches you, so a correct "
        "`f\"Bearer {api_key}\"` can arrive as `f\"******\"`. The framework "
        "compares what you were shown against the bytes on disk and marks "
        "the difference. Do not raise a hardcoded-secret finding from a "
        "read alone.",
    ]
    return parts


def _write_briefing(grant: AgencyGrant) -> str:
    if grant.write_envelope:
        return _envelope_briefing(grant)
    return (
        "## Your one write\n\n"
        "You may **create or modify a test file**, and you do it by asking "
        "rather than by acting: emit the whole file inside a block of "
        "exactly this form, and the framework writes the bytes.\n\n"
        "````text\n"
        "```" + grant.write_label + " path=" + _example_test_path(grant) + "\n"
        "<the complete contents of the file>\n"
        "```\n"
        "````\n\n"
        "The block carries the **whole file**, never a patch or a fragment: "
        "what it contains is what the file will contain. Emit one block per "
        "file.\n\n"
        f"**Writes are confined to this repository's declared test "
        f"locations** — {_declared_locations(grant)}. A path "
        "outside that is refused by the framework before anything is "
        "written, and the refusal is recorded on the round — this is a "
        "boundary, not a request. You have no other write and no filesystem "
        "access of any kind."
    )


def _envelope_briefing(grant: AgencyGrant) -> str:
    """The write surface of a round confined to an envelope.

    The paths are listed rather than described. A rule stated in prose is a
    rule a model reasons about; a list is a list, and the framework is
    holding the same one.
    """
    listed = "\n".join(
        f"- `{path}`" for path in grant.write_envelope[:_MAX_RECORDED_SCOPE]
    )
    return (
        "## Your one write\n\n"
        "You may **modify a file inside the envelope below**, and you do it "
        "by asking rather than by acting: emit the whole file inside a block "
        "of exactly this form, and the framework writes the bytes.\n\n"
        "````text\n"
        "```" + grant.write_label + " path=" + grant.write_envelope[0] + "\n"
        "<the complete contents of the file>\n"
        "```\n"
        "````\n\n"
        "The block carries the **whole file**, never a patch or a fragment: "
        "what it contains is what the file will contain. Emit one block per "
        "file.\n\n"
        f"**The envelope — these paths, exactly:**\n\n{listed}\n\n"
        "Anything else is refused by the framework before a file is opened, "
        "and the refusal is recorded on the round. This is a boundary, not a "
        "request: you have no filesystem access of any kind, so there is no "
        "route by which a path outside this list can change."
    )


def _declared_locations(grant: AgencyGrant) -> str:
    """Every suite's roots and glob, listed rather than summarized. One glob
    cannot describe a repository that is Java and .NET at once, and a
    briefing that named only the first would have the verifier write files
    the framework then refuses."""
    parts = []
    for scope in grant.test_scopes:
        if not scope.complete:
            continue
        roots = ", ".join(f"`{root.strip('/')}/`" for root in scope.roots)
        suite = f" (suite `{scope.suite}`)" if scope.suite else ""
        parts.append(f"{roots} for filenames matching `{scope.glob}`{suite}")
    return "; ".join(parts) or "(none declared)"


def _example_test_path(grant: AgencyGrant) -> str:
    """A path from this repository's own declaration, so the example the
    verifier is shown is one the framework would actually accept."""
    complete = [s for s in grant.test_scopes if s.complete]
    if not complete:
        return "tests/test_example.py"
    scope = complete[0]
    return f"{scope.roots[0].strip('/')}/{scope.glob.replace('*', 'example', 1)}"


# --- What the round actually did ---------------------------------------------

@dataclass(frozen=True)
class AgencyOperation:
    kind: str
    target: str
    in_scope: bool
    fidelity: Optional[str] = None
    detail: Optional[str] = None

    def as_row(self) -> dict:
        row = {"kind": self.kind, "target": self.target,
               "in_scope": self.in_scope}
        if self.fidelity:
            row["fidelity"] = self.fidelity
        if self.detail:
            row["detail"] = self.detail
        return row


@dataclass(frozen=True)
class TestWrite:
    """One proposed write and what the framework did about it."""
    path: str
    outcome: str
    action: Optional[str] = None
    bytes_written: int = 0
    reason: Optional[str] = None

    @property
    def accepted(self) -> bool:
        return self.outcome == WRITE_ACCEPTED

    def as_row(self) -> dict:
        row = {"path": self.path, "outcome": self.outcome}
        if self.action:
            row["action"] = self.action
        if self.accepted:
            row["bytes"] = self.bytes_written
        if self.reason:
            row["reason"] = self.reason
        return row


@dataclass(frozen=True)
class AgencyRecord:
    mode: str
    grant: AgencyGrant
    operations: tuple = ()
    #: Writes are kept apart from operations on purpose: an operation is
    #: something the model did and the transport reported, a write is
    #: something the model asked for and the framework decided.
    writes: tuple = ()

    @property
    def reads(self) -> int:
        return sum(1 for op in self.operations if op.kind == OP_READ)

    @property
    def out_of_scope(self) -> int:
        return sum(1 for op in self.operations if not op.in_scope)

    @property
    def over_budget(self) -> int:
        return max(0, self.reads - self.grant.read_budget)

    @property
    def transformed_reads(self) -> int:
        return sum(
            1 for op in self.operations
            if op.fidelity == FIDELITY_TRANSFORMED
        )

    @property
    def writes_applied(self) -> int:
        return sum(1 for write in self.writes if write.accepted)

    @property
    def writes_refused(self) -> int:
        return sum(1 for write in self.writes if not write.accepted)

    def as_row(self) -> dict:
        row = {
            "mode": self.mode,
            "operations_granted": list(self.grant.operations),
            "read_budget": self.grant.read_budget,
            "scope": list(self.grant.scope[:_MAX_RECORDED_SCOPE]),
            "scope_size": len(self.grant.scope),
            "reads": self.reads,
            "listings": sum(
                1 for op in self.operations if op.kind == OP_LIST
            ),
            "searches": sum(
                1 for op in self.operations if op.kind == OP_SEARCH
            ),
            "out_of_scope": self.out_of_scope,
            "over_budget": self.over_budget,
            "transformed_reads": self.transformed_reads,
            "operations": [
                op.as_row() for op in
                self.operations[:_MAX_RECORDED_OPERATIONS]
            ],
            # Every write is recorded, applied or refused and never
            # truncated: a boundary is only worth having if the record
            # shows each time it held.
            "writes": [write.as_row() for write in self.writes],
            "writes_applied": self.writes_applied,
            "writes_refused": self.writes_refused,
        }
        if self.mode == MODE_NONE:
            row["reason"] = (
                "this transport sends no tools; the verifier could not look "
                "at the tree and this round is not equivalent to one that "
                "could"
            )
        return row


#: Which argument names the thing an operation acted on. The read tool names
#: a path; the search and list tools name a pattern, and confine it to the
#: scope only when they also name a path. A pattern on its own reaches the
#: whole working tree, so it is recorded as unconfined rather than in scope.
_PATH_ARGUMENTS = ("path", "paths")
_PATTERN_ARGUMENTS = ("pattern", "query")


def _tool_target(arguments) -> tuple:
    """``(target, names_a_path)`` for one call's arguments."""
    if not isinstance(arguments, dict):
        return "", False
    for key in _PATH_ARGUMENTS:
        value = arguments.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip(), True
        if isinstance(value, (list, tuple)) and value:
            return str(value[0]), True
    for key in _PATTERN_ARGUMENTS:
        value = arguments.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip(), False
    return "", False


def _shown_lines(result) -> dict:
    """The ``N. <text>`` lines a ``view`` returned, keyed by the file line
    number the tool claims each one is."""
    if isinstance(result, dict):
        content = result.get("content")
    else:
        content = result
    if not isinstance(content, str) or not content:
        return {}
    shown: dict = {}
    for raw in content.replace("\r\n", "\n").split("\n"):
        match = _VIEW_LINE.match(raw)
        if match:
            shown[int(match.group(1))] = match.group(2) or ""
    return shown


def read_fidelity(repo_root, rel: str, result) -> tuple:
    """``(fidelity, detail)`` for one read, by comparing each shown line
    against the disk line it numbers itself as."""
    shown = _shown_lines(result)
    if not shown:
        return FIDELITY_UNVERIFIED, "the tool returned no line-numbered content"
    try:
        disk = (
            Path(repo_root) / rel
        ).read_text(encoding="utf-8").replace("\r\n", "\n").split("\n")
    except (OSError, UnicodeDecodeError):
        return FIDELITY_UNVERIFIED, "the file could not be read as text here"
    for number, text in sorted(shown.items()):
        if number < 1 or number > len(disk):
            continue
        if disk[number - 1].rstrip("\r") != text.rstrip("\r"):
            return (
                FIDELITY_TRANSFORMED,
                f"line {number} was shown as {text.strip()[:120]!r}",
            )
    return FIDELITY_VERBATIM, None


def _tool_calls(metadata) -> list:
    calls = (metadata or {}).get("tool_calls")
    return list(calls) if isinstance(calls, list) else []


def record_for_round(
    repo_root, grant: AgencyGrant, metadata, writes=()
) -> AgencyRecord:
    """The round's agency record, built from what the transport reported.

    A granted surface with no recorded call is left visible rather than
    smoothed over: it is the shape a round takes when the tool grant did not
    reach the model and the model answered from invention instead.

    *writes* are the framework's own decisions from
    :func:`apply_writes`, which is why they are passed in rather than
    recovered from metadata: no transport reports them, because no transport
    performed them.
    """
    if grant.mode != MODE_TOOLS:
        return AgencyRecord(MODE_NONE, grant, (), tuple(writes))

    operations = []
    for call in _tool_calls(metadata):
        if not isinstance(call, dict):
            continue
        tool = str(call.get("tool") or "")
        kind = TOOL_OPERATIONS.get(tool)
        if kind is None:
            continue
        arguments = call.get("arguments")
        if isinstance(arguments, str):
            try:
                arguments = json.loads(arguments)
            except ValueError:
                arguments = {}
        target, names_path = _tool_target(arguments)
        detail = None
        if names_path:
            rel = relative_posix(repo_root, target) or _posix(target)
            scoped = in_scope(grant.scope, rel)
        else:
            # A pattern with no path was not confined to anything. Calling
            # that in-scope would let a repository-wide search leave the
            # record attesting to a scoped review it did not perform.
            rel, scoped = target, False
            detail = f"unconfined: no path limited this {kind} to the scope"
        fidelity = None
        if kind == OP_READ:
            fidelity, read_detail = read_fidelity(
                repo_root, rel, call.get("result")
            )
            detail = read_detail or detail
        operations.append(
            AgencyOperation(
                kind=kind, target=rel or target, in_scope=scoped,
                fidelity=fidelity, detail=detail,
            )
        )
    return AgencyRecord(MODE_TOOLS, grant, tuple(operations), tuple(writes))


def summary_line(record: AgencyRecord) -> str:
    """One line for the operator, so a transformed, unlooking or refused
    round is visible without opening the ledger."""
    if record.mode != MODE_TOOLS:
        parts = [
            "agency: none — this round's verifier could not look at the tree"
        ]
    else:
        parts = [
            f"agency: {record.reads} read(s), "
            f"{sum(1 for op in record.operations if op.kind == OP_SEARCH)}"
            " search(es), "
            f"{sum(1 for op in record.operations if op.kind == OP_LIST)}"
            " listing(s)"
        ]
        if not record.operations:
            parts.append("the verifier looked at nothing it was granted")
        if record.transformed_reads:
            parts.append(
                f"{record.transformed_reads} read(s) were transformed"
            )
        if record.out_of_scope:
            parts.append(f"{record.out_of_scope} not confined to scope")
        if record.over_budget:
            parts.append(f"{record.over_budget} past the read budget")
    if record.writes_applied:
        parts.append(f"{record.writes_applied} test write(s) applied")
    if record.writes_refused:
        parts.append(f"{record.writes_refused} write(s) refused")
    return "; ".join(parts)


# --- The write ---------------------------------------------------------------
#
# The verifier authors tests because it did not write the code, and the
# framework performs the write because "the file says this" must be an
# observation rather than a claim. Both halves of that follow from the model
# having no filesystem: it emits a block, and everything after the block is
# the framework's.

#: A proposal opens with a fenced block labelled for the round's kind and
#: carrying a path. The fence may be longer than three backticks, so a test
#: file that itself contains a fence is still expressible -- the block closes
#: only on a fence at least as long as the one that opened it.
_FENCE = re.compile(r"^(?P<ticks>`{3,})[ \t]*(?P<info>.*?)[ \t]*$")
_WRITE_PATH = re.compile(r"^path[ \t]*=[ \t]*(?P<path>[^\s]+)[ \t]*$")


@dataclass(frozen=True)
class _Proposal:
    path: str
    content: str
    malformed: Optional[str] = None


def _parse_proposals(text, label: str = WRITE_LABEL_TEST) -> list:
    """The write blocks in *text* carrying *label*, in the order they appear.

    Ordinary fenced blocks are skipped whole, so a review that quotes the
    format inside a code sample does not accidentally propose a write. A
    block that opens and never closes, or that names no path, is returned
    as malformed rather than dropped: a proposal that vanishes silently
    looks exactly like one that was never made.

    A block under some other round's label is not this round's proposal and
    is skipped in the same way an ordinary fence is.
    """
    if not isinstance(text, str) or label not in text:
        return []
    marker = re.compile(rf"^{re.escape(label)}\b[ \t]*(?P<rest>.*)$")
    lines = text.replace("\r\n", "\n").split("\n")
    proposals = []
    index = 0
    while index < len(lines):
        opening = _FENCE.match(lines[index])
        if not opening:
            index += 1
            continue
        ticks, info = opening.group("ticks"), opening.group("info")
        matched = marker.match(info)
        body, closed, index = _consume_block(lines, index + 1, ticks)
        if not matched:
            continue
        path_match = _WRITE_PATH.match(matched.group("rest").strip())
        if not path_match:
            proposals.append(_Proposal(
                "", "", "the block named no path=<file> to write"
            ))
        elif not closed:
            proposals.append(_Proposal(
                path_match.group("path"), "",
                "the block was never closed, so its contents are incomplete",
            ))
        else:
            proposals.append(
                _Proposal(path_match.group("path"), "\n".join(body))
            )
    return proposals


def _consume_block(lines, start: int, ticks: str) -> tuple:
    """``(body_lines, closed, index_after)`` for the block opened by
    *ticks*, which closes on a bare fence at least as long."""
    body = []
    index = start
    while index < len(lines):
        closing = _FENCE.match(lines[index])
        if (closing and not closing.group("info")
                and len(closing.group("ticks")) >= len(ticks)):
            return body, True, index + 1
        body.append(lines[index])
        index += 1
    return body, False, index


def _confine(repo_root, grant: AgencyGrant, raw_path: str) -> tuple:
    """``(rel, target, reason)`` -- *reason* is ``None`` when the write may
    proceed, and *target* is then the absolute path to open.

    The path is resolved exactly once, here, and the resolved form is what
    gets written. Deciding about one spelling of a path and then handing
    another to ``open`` is how a boundary fails open, so nothing downstream
    re-interprets the string.

    Two boundaries, never both: a round carrying an envelope is confined to
    that envelope, and every other round is confined to the declared test
    root. Which one applies is a property of the grant, so no caller can
    combine them into a wider surface than either.

    Every branch refuses before anything is written, and the order runs from
    the widest boundary inward, so the reason recorded is the outermost one
    the path crossed.
    """
    if OP_WRITE not in grant.operations:
        return _posix(raw_path), None, (
            "this round granted no write operation; tests are authored in "
            "the tests phase, not in a review round"
        )
    target = _relative_to(repo_root, raw_path)
    if target is None:
        return _posix(raw_path), None, (
            "the path resolves outside the repository"
        )
    rel = _posix(target.relative_to(Path(repo_root).resolve()))
    if grant.write_envelope:
        if rel not in set(grant.write_envelope):
            return rel, None, (
                "outside the envelope: this round may write only to the "
                "files the session already changed and the files its "
                "failures implicate"
            )
    elif not grant.declares_tests:
        return rel, None, (
            "this repository declares no test root, so no path can be "
            "confirmed to be a test"
        )
    elif not names_a_test(rel, grant.test_selection):
        return rel, None, (
            "outside the declared test locations: a write must match "
            + _declared_locations(grant)
        )
    if target.is_dir():
        return rel, None, "the path is a directory"
    return rel, target, None


def apply_writes(repo_root, grant: AgencyGrant, text) -> tuple:
    """Perform the writes *text* proposes, and report every decision.

    This is the whole of operation (d). The model never touches the
    filesystem: it describes a file, and this function is the only thing
    that opens one. A proposal outside the round's boundary is refused
    here, before any bytes are written -- which is the difference between a
    boundary and an instruction.
    """
    writes = []
    for proposal in _parse_proposals(text, grant.write_label):
        if proposal.malformed:
            writes.append(TestWrite(
                path=_posix(proposal.path), outcome=WRITE_REFUSED,
                reason=proposal.malformed,
            ))
            continue
        rel, target, reason = _confine(repo_root, grant, proposal.path)
        if reason is None and not proposal.content.strip():
            # An empty body against an existing file silently empties it,
            # which is a deletion wearing a write's name.
            reason = "the block carried no content"
        if reason:
            writes.append(TestWrite(
                path=rel, outcome=WRITE_REFUSED, reason=reason
            ))
            continue
        writes.append(_write_file(rel, target, proposal.content))
    return tuple(writes)


def _write_file(rel: str, target: Path, content: str) -> TestWrite:
    existed = target.is_file()
    body = content if content.endswith("\n") else content + "\n"
    data = body.encode("utf-8")
    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        # Newlines are written as authored on every platform: a test file
        # whose line endings depend on which machine ran the verifier is a
        # diff nobody asked for.
        with open(target, "w", encoding="utf-8", newline="") as handle:
            handle.write(body)
    except OSError as exc:
        return TestWrite(
            path=rel, outcome=WRITE_REFUSED,
            reason=f"the write failed: {exc}",
        )
    return TestWrite(
        path=rel, outcome=WRITE_ACCEPTED,
        action=ACTION_MODIFIED if existed else ACTION_CREATED,
        bytes_written=len(data),
    )


