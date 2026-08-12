"""Set 123 (Session 1): the one entry point that answers *what verifies this
project*.

The operator's three-branch rule (designed in
``docs/planning/verify-type-resolution.md``, implemented here):

1. **Project file wins.** ``project-verify-type.txt`` **at the project root**
   (the first ancestor holding a ``.git`` entry), holding exactly
   ``DIRECT_API`` or ``COPILOT_CLI``. Present and valid -> that is the
   answer, silently. A configured project must not interrogate the user
   every session. It is read at the root and nowhere else: a nested copy
   must never be able to answer for the project, or the fact becomes
   cwd-dependent again.
2. **Environment default, confirmed once.** No file -> read
   ``AI_ORCHESTRATION_VERIFY_TYPE``. A valid value is a *suggestion*: the
   caller confirms it with the human and calls
   :func:`write_project_verify_type`, after which the project is in branch 1
   forever. Until then the resolution reports ``transport_profile = None``,
   because that is what dispatch will use -- a record that claimed the
   suggested profile could disagree with ``load_config``, which is the
   split-brain this module exists to remove.
3. **Guided setup.** Neither -> the agent sets the project up in the
   terminal, where it already is (this is what replaced the setup webview).

Two rules this module makes executable rather than implicit:

- **The file wins silently over the environment** (spec standing decision 5).
  A project's own answer is not overridden by a machine-wide default that
  spans every project on the box.
- **An invalid value is reported, never guessed at.** An unparseable project
  file does *not* quietly fall through to the environment: falling through
  would answer a question the project already tried to answer, and answer it
  differently. Both branches raise :class:`VerifyTypeError` naming the origin.

**``transport.profile`` is derived from this, not decided beside it** (spec
standing decision 2). :func:`derive_transport_profile` is what
``config.load_config`` calls, so the two facts cannot disagree: where a
project file exists it *is* the profile. Two mechanisms for one fact is a
defect class this repo has hit three times.

**An unconfirmed environment default never silently changes dispatch.** The
environment variable feeds branch 2 -- the confirm-once step -- and nothing
else; :func:`derive_transport_profile` does not read it. Until a human has
confirmed it and the file exists, the machine default is a suggestion, and a
suggestion that silently re-routed every dispatch would be the same
action-at-a-distance the file exists to eliminate.

Reuse, not reinvention (spec Session 1 step 4 audit): seat readiness stays in
:mod:`ai_router.copilot_preflight`, transport diagnosis in
:mod:`ai_router.transport_diagnostics`, effective-provider identity in
:mod:`ai_router.orchestrator_identity`, and profile *validation* in
:mod:`ai_router.config`. This module adds the resolution ORDER those four
never had, and deliberately imports none of them -- it is stdlib-only so
``config`` can import it without a cycle.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Mapping, NamedTuple, Optional

# --- The two verification types -------------------------------------------

DIRECT_API = "DIRECT_API"
COPILOT_CLI = "COPILOT_CLI"
VALID_VERIFY_TYPES: frozenset[str] = frozenset({DIRECT_API, COPILOT_CLI})

#: The project's answer for THIS checkout. Repo root, and **gitignored**:
#: Set 124 S1 (operator ruling, 2026-08-12) corrected Set 123's scoping --
#: this is machine/project state, not committed project configuration. Two
#: projects on one machine may differ; one project on two machines may differ.
PROJECT_FILE_NAME = "project-verify-type.txt"

#: The machine default. Only ever a branch-2 suggestion (see module docstring).
ENV_VAR = "AI_ORCHESTRATION_VERIFY_TYPE"

#: The one true mapping onto ``transport.profile``. Kept bijective so a
#: resolved type always names exactly one profile and vice versa.
PROFILE_BY_VERIFY_TYPE: dict[str, str] = {
    DIRECT_API: "api",
    COPILOT_CLI: "copilot-cli",
}
VERIFY_TYPE_BY_PROFILE: dict[str, str] = {
    profile: verify_type for verify_type, profile in PROFILE_BY_VERIFY_TYPE.items()
}

# --- Resolution sources ----------------------------------------------------

SOURCE_PROJECT_FILE = "project-file"
SOURCE_ENVIRONMENT = "environment"
SOURCE_UNRESOLVED = "unresolved"

# --- Derivation sources (what decided transport.profile) -------------------

PROFILE_SOURCE_PROJECT_FILE = "project-file"
PROFILE_SOURCE_CONFIG = "config"
PROFILE_SOURCE_DEFAULT = "default"


class VerifyTypeError(ValueError):
    """A verify type was declared but is not one this framework knows.

    Subclasses ``ValueError`` so callers already catching config-load errors
    keep working; the distinct class exists so a caller can tell "the project
    said something invalid" from "the config said something invalid".
    """


def _valid_values_hint() -> str:
    return " or ".join(sorted(VALID_VERIFY_TYPES))


def parse_verify_type(text: Optional[str], *, origin: str) -> str:
    """Parse *text* into a verify type, or raise naming *origin*.

    Blank lines and ``#`` comment lines are ignored so the project file can
    explain itself; exactly one value line must remain. Anything
    else raises -- this is the "reported, never guessed at" rule, and it is
    why a typo like ``DIRECT-API`` stops a session instead of silently
    selecting the other transport.
    """
    if text is None:
        raise VerifyTypeError(
            f"{origin} declares no verify type. Expected {_valid_values_hint()}."
        )
    lines = [
        line.strip()
        for line in text.splitlines()
        if line.strip() and not line.strip().startswith("#")
    ]
    if not lines:
        raise VerifyTypeError(
            f"{origin} is empty (comments and blank lines only). "
            f"Expected {_valid_values_hint()}."
        )
    if len(lines) > 1:
        raise VerifyTypeError(
            f"{origin} declares {len(lines)} values ({lines!r}); it must hold "
            f"exactly one of {_valid_values_hint()}."
        )
    value = lines[0]
    if value not in VALID_VERIFY_TYPES:
        raise VerifyTypeError(
            f"{origin} holds {value!r}, which is not a known verify type. "
            f"Expected {_valid_values_hint()}."
        )
    return value


def find_project_root(start: Optional[Path | str] = None) -> Optional[Path]:
    """Return the project root at or above *start* (default: cwd), or ``None``.

    The project root is the first ancestor holding a ``.git`` entry --
    ``exists()``, not ``is_dir()``, because in a git **worktree** ``.git`` is a
    file, and the worktree layout is this shop's standard.

    ``None`` means "no project here". That is a real answer, not a failure:
    the project file is anchored to a repository root, so a directory outside
    any repository has no project answer to read, and inventing one from the
    working directory is what makes a fact cwd-dependent.
    """
    try:
        current = (Path(start) if start is not None else Path.cwd()).resolve()
    except OSError:
        return None

    seen: set[Path] = set()
    while current not in seen:
        seen.add(current)
        try:
            if (current / ".git").exists():
                return current
        except OSError:
            pass
        parent = current.parent
        if parent == current:
            break
        current = parent
    return None


def find_project_file(start: Optional[Path | str] = None) -> Optional[Path]:
    """Return the project's ``project-verify-type.txt``, or ``None``.

    Looked up **at the project root only** -- never at the nearest ancestor
    that happens to hold one. A nested copy (a stale sample, a fixture, a
    scratch dir) must not be able to answer for the project: the whole point
    of a root-anchored file is that the answer does not change with the
    directory a tool was launched from.
    """
    root = find_project_root(start)
    if root is None:
        return None
    candidate = root / PROJECT_FILE_NAME
    try:
        return candidate if candidate.is_file() else None
    except OSError:  # pragma: no cover - defensive
        return None


def read_project_verify_type(path: Path | str) -> str:
    """Read and parse an existing project file, or raise :class:`VerifyTypeError`."""
    path = Path(path)
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:  # pragma: no cover - defensive
        raise VerifyTypeError(
            f"{path} is not valid UTF-8 ({exc}). Rewrite it holding exactly "
            f"one of {_valid_values_hint()}."
        ) from exc
    return parse_verify_type(text, origin=str(path))


def write_project_verify_type(
    project_root: Path | str, verify_type: str
) -> Path:
    """Write the project's answer to ``<project_root>/project-verify-type.txt``.

    This is the confirm-once-and-remember step: after it, resolution is
    branch 1 forever. Idempotent -- writing the same value twice is a no-op
    in effect. The written file carries a comment header, which
    :func:`parse_verify_type` tolerates by design.
    """
    if verify_type not in VALID_VERIFY_TYPES:
        raise VerifyTypeError(
            f"Refusing to write {verify_type!r}: expected {_valid_values_hint()}."
        )
    path = Path(project_root) / PROJECT_FILE_NAME
    path.write_text(
        "# How this project is verified, ON THIS MACHINE. Gitignored on\n"
        "# purpose: this is machine/project state, not committed project\n"
        "# configuration. A Copilot seat holds no DABBLER_* keys and must\n"
        "# resolve COPILOT_CLI; a teammate who installed with provider keys\n"
        "# must resolve DIRECT_API for this same checkout. Committing it\n"
        "# would publish one seat's answer to everyone.\n"
        "#\n"
        f"# Valid values: {_valid_values_hint()}\n"
        "# The router derives transport.profile from this value.\n"
        f"{verify_type}\n",
        encoding="utf-8",
    )
    return path


@dataclass(frozen=True)
class VerifyTypeResolution:
    """The answer to "what verifies this project", plus how it was reached.

    ``transport_profile`` is the profile **dispatch will actually use**, and
    it is therefore ``None`` until the answer is resolved. An unconfirmed
    machine default is reported as :attr:`suggested_transport_profile`
    instead. Claiming a profile for a suggestion is what would let this
    record and ``load_config`` disagree -- the exact split-brain this module
    exists to remove.
    """

    verify_type: Optional[str]
    source: str
    project_file: Optional[Path] = None
    env_value: Optional[str] = None
    needs_confirmation: bool = False
    needs_setup: bool = False

    @property
    def resolved(self) -> bool:
        """True only when setup is finished: the project file exists and is valid.

        A branch-2 suggestion is deliberately *not* resolved. The design's own
        bar is that setup is finished when both the environment variable is
        set and the project file carries the same value.

        Set 124 S1 retired the old name for this, ``committed``. The file is
        machine/project state and is gitignored, so "committed" named
        something that must never happen; what the answer actually is, is
        *resolved for this checkout*.
        """
        return self.source == SOURCE_PROJECT_FILE and self.verify_type is not None

    @property
    def transport_profile(self) -> Optional[str]:
        """The profile dispatch uses now, or ``None`` if nothing is resolved."""
        if not self.resolved:
            return None
        return PROFILE_BY_VERIFY_TYPE[self.verify_type]

    @property
    def suggested_transport_profile(self) -> Optional[str]:
        """The profile this answer *would* select once written. Narration
        only -- never what dispatch reads."""
        if self.verify_type is None:
            return None
        return PROFILE_BY_VERIFY_TYPE[self.verify_type]

    def to_dict(self) -> dict:
        return {
            "verify_type": self.verify_type,
            "source": self.source,
            "project_file": str(self.project_file) if self.project_file else None,
            "env_value": self.env_value,
            "resolved": self.resolved,
            "needs_confirmation": self.needs_confirmation,
            "needs_setup": self.needs_setup,
            "transport_profile": self.transport_profile,
            "suggested_transport_profile": self.suggested_transport_profile,
        }


def resolve_verify_type(
    *,
    start: Optional[Path | str] = None,
    env: Optional[Mapping[str, str]] = None,
) -> VerifyTypeResolution:
    """Resolve the verify type through the three-branch rule. One entry point.

    Raises :class:`VerifyTypeError` when a declared value is invalid -- in
    either the project file or the environment. A caller that wants "is this
    project set up?" without the exception should catch it; that IS the
    answer ("set up wrong"), and it must not be confused with "not set up".
    """
    environ = os.environ if env is None else env

    project_file = find_project_file(start)
    if project_file is not None:
        # Branch 1. The file wins silently -- no prompt, no confirmation, and
        # no glance at the environment (standing decision 5).
        return VerifyTypeResolution(
            verify_type=read_project_verify_type(project_file),
            source=SOURCE_PROJECT_FILE,
            project_file=project_file,
            env_value=environ.get(ENV_VAR),
        )

    raw_env = environ.get(ENV_VAR)
    if raw_env is not None and raw_env.strip():
        # Branch 2. A machine default the human must confirm once; the caller
        # persists it with write_project_verify_type.
        return VerifyTypeResolution(
            verify_type=parse_verify_type(raw_env, origin=f"${ENV_VAR}"),
            source=SOURCE_ENVIRONMENT,
            env_value=raw_env,
            needs_confirmation=True,
        )

    # Branch 3. Nothing to infer from; the agent runs guided setup.
    return VerifyTypeResolution(
        verify_type=None,
        source=SOURCE_UNRESOLVED,
        env_value=raw_env,
        needs_setup=True,
    )


class ProfileDerivation(NamedTuple):
    """What ``transport.profile`` resolved to, and what decided it."""

    profile: str
    source: str
    project_file: Optional[Path] = None


def derive_transport_profile(
    config: Mapping,
    *,
    anchors: Iterable[Optional[Path | str]] = (None,),
) -> ProfileDerivation:
    """Derive ``transport.profile`` for *config* (spec standing decision 2).

    *anchors* are ordered directories to look for a project from (``None``
    means the working directory). **The first anchor that lands in a project
    answers, and the search stops there** -- whether or not that project has
    written a file. A project without a ``project-verify-type.txt`` has
    said "I have not chosen yet", which is answered by its own configured
    profile; it is *not* an invitation for some other project's file to
    answer on its behalf.

    Within the answering project, order is:

    1. Its ``project-verify-type.txt``. This **wins over a configured
       profile**, including a seat-local ``local-overrides.yaml`` one: a
       project that has resolved its answer for this checkout is not
       overridden by a profile configured elsewhere. This is the branch the
       disagreement falsifier drives.
    2. An explicitly configured ``transport.profile``.
    3. ``api``, the default -- now reached *through* resolution rather than
       beside it.

    **The anchor follows the config, not the process.** ``load_config``
    passes the config file's own directory first and the working directory
    second. A verify type describes how *a project* is verified, so the
    project that owns the config being loaded answers for it -- automation
    running from repo A while explicitly loading repo B's config must
    dispatch B's calls by B's answer, and by B's default when B has not
    chosen. The working-directory anchor is what keeps a pip-installed
    consumer -- whose bundled config belongs to no repository at all --
    reading its own project file.

    The environment variable is deliberately absent: see the module
    docstring. An invalid project file raises rather than falling back, so a
    typo fails config load loudly instead of dispatching somewhere else.
    """
    for anchor in anchors:
        root = find_project_root(anchor)
        if root is None:
            continue
        project_file = root / PROJECT_FILE_NAME
        if project_file.is_file():
            verify_type = read_project_verify_type(project_file)
            return ProfileDerivation(
                profile=PROFILE_BY_VERIFY_TYPE[verify_type],
                source=PROFILE_SOURCE_PROJECT_FILE,
                project_file=project_file,
            )
        break

    transport = config.get("transport") or {}
    configured = transport.get("profile") if isinstance(transport, Mapping) else None
    if configured is not None:
        return ProfileDerivation(
            profile=configured, source=PROFILE_SOURCE_CONFIG
        )

    return ProfileDerivation(
        profile=PROFILE_BY_VERIFY_TYPE[DIRECT_API], source=PROFILE_SOURCE_DEFAULT
    )


# --- Operator-facing narration --------------------------------------------


def guided_setup_instructions(project_root: Optional[Path | str] = None) -> str:
    """The branch-3 script, for the terminal the agent is already in.

    Names the two things that must both be true before setup is finished,
    and points readiness checks at the modules that already own them rather
    than restating what they do.
    """
    if project_root is not None:
        root = Path(project_root)
    else:
        resolved_root = find_project_root()
        root = resolved_root if resolved_root is not None else Path.cwd()
    return (
        "No verify type is configured for this project.\n"
        "\n"
        f"Pick one and write it to {root / PROJECT_FILE_NAME}:\n"
        "\n"
        "  DIRECT_API   - provider API keys, no Copilot seat. At least one\n"
        "                 provider must have a key AND differ from the\n"
        "                 orchestrator, or verification is same-provider and\n"
        "                 the verdict says so.\n"
        "  COPILOT_CLI  - a GitHub Copilot seat, no provider API keys.\n"
        "\n"
        "Then, in order:\n"
        "\n"
        "  1. python -m ai_router.verify_type --set <VALUE>\n"
        f"  2. set {ENV_VAR}=<VALUE> in this machine's user environment\n"
        "  3. prove the credentials actually work before declaring setup done:\n"
        "       COPILOT_CLI -> python -m ai_router.copilot_preflight\n"
        "       DIRECT_API  -> confirm the DABBLER_*_API_KEY vars resolve and\n"
        "                      make one real routed call\n"
        "\n"
        f"Setup is finished when BOTH ${ENV_VAR} is set and\n"
        f"{PROJECT_FILE_NAME} exists carrying the same value.\n"
        "\n"
        f"{PROJECT_FILE_NAME} is gitignored on purpose: it is machine/project\n"
        "state (this project, on THIS machine), so each checkout answers for\n"
        "itself and no seat's answer is published to the whole team."
    )


def describe(resolution: VerifyTypeResolution) -> str:
    """One ASCII-only paragraph describing a resolution, for a terminal."""
    if resolution.source == SOURCE_PROJECT_FILE:
        return (
            f"[x] verify type: {resolution.verify_type} "
            f"(from {resolution.project_file})\n"
            f"    transport.profile derives to: {resolution.transport_profile}"
        )
    if resolution.source == SOURCE_ENVIRONMENT:
        return (
            f"[~] verify type: {resolution.verify_type} "
            f"(machine default ${ENV_VAR}; NOT yet written to this project)\n"
            "    transport.profile is UNCHANGED until it is written: an\n"
            "    unconfirmed default never silently re-routes dispatch. It\n"
            f"    would derive to {resolution.suggested_transport_profile}.\n"
            "    Confirm it with the human, then run:\n"
            "        python -m ai_router.verify_type --confirm"
        )
    return "[ ] verify type: unresolved\n\n" + guided_setup_instructions()


# --- CLI -------------------------------------------------------------------

EXIT_OK = 0
EXIT_INVALID = 2
EXIT_SETUP_REQUIRED = 3


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m ai_router.verify_type",
        description=(
            "Resolve what verifies this project: project-verify-type.txt, "
            "else the confirmed-once machine default, else guided setup. "
            "Exit 0 = resolved, 2 = a declared value is invalid, 3 = guided "
            "setup required."
        ),
    )
    parser.add_argument(
        "--project-root",
        default=None,
        help=(
            "Directory to resolve from, and to write to (default: cwd for "
            "reads, the enclosing PROJECT ROOT for writes -- the first "
            "ancestor holding a .git entry)."
        ),
    )
    parser.add_argument(
        "--confirm",
        action="store_true",
        help=(
            "Branch 2: persist the resolved machine default to "
            f"{PROJECT_FILE_NAME}. Only valid when the environment supplied "
            "the answer and no project file exists yet."
        ),
    )
    parser.add_argument(
        "--set",
        dest="set_value",
        default=None,
        choices=sorted(VALID_VERIFY_TYPES),
        help="Branch 3: write this value to the project file.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit the machine-readable resolution as JSON on stdout.",
    )
    return parser


def _resolve_write_root(explicit: Optional[str]) -> Path:
    """Where a write goes: the declared root, else the PROJECT root.

    Never the working directory by default. A ``project-verify-type.txt``
    dropped in whatever subdirectory a command happened to run from is not
    the project's answer -- and worse, it looks like success while leaving
    the project unconfigured from everywhere else.
    """
    if explicit:
        return Path(explicit)
    root = find_project_root()
    if root is None:
        raise VerifyTypeError(
            f"No project root found at or above {Path.cwd()} (looked for a "
            ".git entry), so there is nowhere to write "
            f"{PROJECT_FILE_NAME}. Run `git init` first, or pass "
            "--project-root explicitly."
        )
    return root


def main(argv: Optional[list] = None) -> int:
    parser = build_arg_parser()
    args = parser.parse_args(argv)

    if args.set_value is not None and args.confirm:
        print(
            "--set and --confirm are mutually exclusive: --set declares an "
            "answer, --confirm accepts the one already suggested.",
            file=sys.stderr,
        )
        return EXIT_INVALID

    read_from = Path(args.project_root) if args.project_root else Path.cwd()

    try:
        if args.set_value is not None:
            write_project_verify_type(
                _resolve_write_root(args.project_root), args.set_value
            )
        resolution = resolve_verify_type(start=read_from)
        if args.confirm:
            if resolution.source != SOURCE_ENVIRONMENT:
                print(
                    "--confirm applies only to a machine default awaiting "
                    f"confirmation; this project resolved via "
                    f"{resolution.source}. Nothing to confirm.",
                    file=sys.stderr,
                )
                return EXIT_INVALID
            write_project_verify_type(
                _resolve_write_root(args.project_root), resolution.verify_type
            )
            resolution = resolve_verify_type(start=read_from)
    except VerifyTypeError as exc:
        print(str(exc), file=sys.stderr)
        return EXIT_INVALID

    if args.json:
        print(json.dumps(resolution.to_dict(), indent=2))
    else:
        print(describe(resolution))

    return EXIT_OK if resolution.resolved else EXIT_SETUP_REQUIRED


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
