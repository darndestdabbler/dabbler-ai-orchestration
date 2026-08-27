"""The verifier's read surface: what it may look at, how much of it, and
what it was actually shown.

Three operations reach the verifier on the seat path -- list files by
pattern, search file contents by pattern, read a file -- and they arrive as
the Copilot CLI's own ``glob``, ``grep`` and ``view`` tools. The CLI executes
them inside its own process, so this module cannot refuse a read the way the
test-write path refuses a write. What it can do is declare the limits to the
verifier and then measure the round against them, which is also the limit
that matters: a verifier that reaches a blocking finding by not looking at
the counterevidence is caught by the log, never by a refusal.

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

#: The CLI tool that performs each granted operation. This mapping is the
#: whole grant: a tool absent from it is not part of the read surface.
TOOL_OPERATIONS: dict = {"glob": OP_LIST, "grep": OP_SEARCH, "view": OP_READ}

GRANTED_OPERATIONS: tuple = (OP_LIST, OP_SEARCH, OP_READ)

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


def session_scope(repo_root, set_dir, changed_paths) -> tuple:
    """What this round's verifier is scoped to: the session's changed files,
    the modules they declare they depend on, and the session set's own
    directory -- which carries the spec the work is judged against.

    Never the whole repository. A scope that resolved to everything would
    make the out-of-scope count structurally unreachable and the limit a
    decoration.
    """
    changed = {_posix(p) for p in (changed_paths or ()) if str(p).strip()}
    scope = set(changed)
    scope |= declared_dependencies(repo_root, changed)
    set_rel = _relative_to(repo_root, set_dir)
    if set_rel:
        scope.add(set_rel)
    return tuple(sorted(scope))


def _relative_to(repo_root, path) -> Optional[str]:
    """The repository-relative posix form of *path*.

    An absolute path is placed against the repository; a relative one is
    already repository-relative, because the CLI runs with the repository
    as its working directory. Resolving a relative tool argument against
    this process's own directory instead would silently invent a path.
    """
    try:
        root = Path(repo_root).resolve()
        candidate = Path(path)
        if not candidate.is_absolute():
            candidate = root / candidate
        return _posix(candidate.resolve().relative_to(root))
    except (OSError, ValueError):
        return None


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

    @property
    def operations(self) -> tuple:
        return GRANTED_OPERATIONS if self.mode == MODE_TOOLS else ()


def grant_for_transport(
    transport: str, scope=(), read_budget: int = DEFAULT_READ_BUDGET
) -> AgencyGrant:
    """Only the seat path is agentic. Naming the transport here keeps the
    two paths from being recorded as the same kind of review."""
    if transport == "copilot-cli":
        return AgencyGrant(MODE_TOOLS, tuple(scope), read_budget)
    return AgencyGrant(MODE_NONE, (), 0)


def briefing(grant: AgencyGrant) -> str:
    """What the verifier is told about its own surface. Empty on the
    direct-API path: describing tools that were not sent invites a model to
    report reads it never made."""
    if grant.mode != MODE_TOOLS:
        return ""
    listed = "\n".join(f"- {path}" for path in grant.scope[:_MAX_RECORDED_SCOPE])
    return (
        "## Your read surface\n\n"
        "You may **list files** (`glob`), **search file contents** (`grep`) "
        "and **read a file** (`view`). You have no other operations, and no "
        "way to change anything.\n\n"
        f"**Scope** — this session's changed files and what they import, "
        f"not the repository:\n\n{listed}\n\n"
        f"**Budget** — at most {grant.read_budget} reads this round.\n\n"
        "**Log** — every list, search and read is recorded on the round, "
        "confined to the scope or not. Confine a search or a listing by "
        "naming the scope paths you want it to cover; a pattern on its own "
        "reaches the whole tree and is recorded as unconfined. Reading "
        "nothing is recorded too: a finding asserted about a file you did "
        "not open is a finding without evidence.\n\n"
        "**What you are shown may not be what is on disk.** Credential-"
        "shaped text is rewritten before it reaches you, so a correct "
        "`f\"Bearer {api_key}\"` can arrive as `f\"******\"`. The framework "
        "compares what you were shown against the bytes on disk and marks "
        "the difference. Do not raise a hardcoded-secret finding from a "
        "read alone."
    )


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
class AgencyRecord:
    mode: str
    grant: AgencyGrant
    operations: tuple = ()

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


def record_for_round(repo_root, grant: AgencyGrant, metadata) -> AgencyRecord:
    """The round's agency record, built from what the transport reported.

    A granted surface with no recorded call is left visible rather than
    smoothed over: it is the shape a round takes when the tool grant did not
    reach the model and the model answered from invention instead.
    """
    if grant.mode != MODE_TOOLS:
        return AgencyRecord(MODE_NONE, grant, ())

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
            rel = _relative_to(repo_root, target) or _posix(target)
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
    return AgencyRecord(MODE_TOOLS, grant, tuple(operations))


def summary_line(record: AgencyRecord) -> str:
    """One line for the operator, so a transformed or unlooking round is
    visible without opening the ledger."""
    if record.mode != MODE_TOOLS:
        return "agency: none — this round's verifier could not look at the tree"
    parts = [
        f"agency: {record.reads} read(s), "
        f"{sum(1 for op in record.operations if op.kind == OP_SEARCH)} search(es), "
        f"{sum(1 for op in record.operations if op.kind == OP_LIST)} listing(s)"
    ]
    if not record.operations:
        parts.append("the verifier looked at nothing it was granted")
    if record.transformed_reads:
        parts.append(f"{record.transformed_reads} read(s) were transformed")
    if record.out_of_scope:
        parts.append(f"{record.out_of_scope} not confined to scope")
    if record.over_budget:
        parts.append(f"{record.over_budget} past the read budget")
    return "; ".join(parts)
