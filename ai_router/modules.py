"""Set 122 Session 1: the module lifecycle CLI.

``python -m ai_router.modules create | rename | delete | assign-sets`` --
every transactional module operation, in Python, with the validation,
numbering, rollback and running-session refusals the extension never had.

Why this module exists
----------------------

The multi-module verdict (``docs/proposals/2026-08-11-multi-module-
architecture/verdict.md`` Section 4, operator-confirmed 2026-08-11) adopts a
Python CLI for all module operations, launched from the context menu with
the command echoed so developers see what is executed. The port is not
cleanup deferred for taste: it **restores an invariant the project believes
it already has**. ``src/utils/cancelLifecycle.ts`` writes
``session-state.json`` from TypeScript today, reached through the
``deleteModule`` path, and only the sanctioned Python writers are allowed to
touch that file. Here, every state mutation goes through
:func:`ai_router.session_lifecycle.cancel_session_set` -- nothing in this
module opens ``session-state.json`` for writing, and
``test_modules_lifecycle.py`` asserts that structurally (with a planted
violation proving the assertion can fail).

What is ported, and what is new
-------------------------------

The on-disk contract is ``tools/dabbler-ai-orchestration/src/utils/
moduleAuthoring.ts``'s, unchanged: the same ``docs/modules.yaml`` shape, the
same header template, the same format-preserving text splices (never a
re-serialization, which would destroy the operator's comments and entry
order), the same parse-after-write guards, and the same refusals. A format
change here would strand every repo that already has a manifest.

What is NEW is transactionality. ``scaffoldNewModule`` writes the plan stub
first and the manifest second, so a manifest write that fails leaves an
orphan stub behind. Every writer here runs through :class:`_Transaction`,
which records each effect (file content or created directory) and undoes all
of them on any failure -- a create that scaffolds a directory and then fails
to append the manifest entry leaves neither behind.

Exit codes (stable -- the extension's thin launchers branch on them)
--------------------------------------------------------------------

* ``0`` -- the operation succeeded.
* ``2`` -- usage error (argparse).
* ``3`` -- **refused**: a preflight rejected the operation and NOTHING was
  written. The workspace is byte-identical to before the call.
* ``4`` -- **write failure / partial failure**: the apply phase stopped. For
  create/rename every touched file was rolled back (``rolledBack`` says
  whether the rollback itself succeeded); for delete the module is still
  declared and the operation is safely re-runnable.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
import tempfile
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence, Tuple

import yaml

try:  # pragma: no cover - import shim, mirrors session_lifecycle.py
    from session_lifecycle import (  # type: ignore[import-not-found]
        cancel_session_set as _cancel_session_set,
    )
except ImportError:  # pragma: no cover
    from .session_lifecycle import (  # type: ignore[no-redef]
        cancel_session_set as _cancel_session_set,
    )


# ---------------------------------------------------------------------------
# Constants -- the on-disk contract, matched to moduleAuthoring.ts
# ---------------------------------------------------------------------------

MODULES_MANIFEST_REL = os.path.join("docs", "modules.yaml")
#: The manifest path as shown to operators (forward-slashed on every OS).
MODULES_MANIFEST_DISPLAY = "docs/modules.yaml"
SESSION_SETS_REL = os.path.join("docs", "session-sets")
SESSION_STATE_FILENAME = "session-state.json"

#: The kebab-case shape a module slug must match (Set 087 ruling Q1).
MODULE_SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")

INVALID_MANIFEST_MESSAGE = (
    f"{MODULES_MANIFEST_DISPLAY} exists but is not a valid module manifest "
    f'(expected a YAML mapping with a "modules:" list). Fix the file by hand '
    f"before using the module-aware flows."
)

_MODULES_YAML_HEADER_COMMENTS = """\
# docs/modules.yaml - the module manifest (Dabbler module-organized projects).
#
# Each entry declares one module of this repo:
#   slug:      machine identity (kebab-case). Session sets declare
#              `module: <slug>` in their spec.md configuration block and the
#              Session Set Explorer groups them under this module.
#   title:     the display name the Explorer shows for the group.
#   codeRoots: the code paths this module owns ([] for an integration
#              module that only composes other modules).
#   planPath:  the module's project plan (decomposed into session sets).
#   touches:   optional - the modules an integration module is sanctioned
#              to work across; owners of every touched module review its PRs.
#
# Explorer display order = this file's order. Session-set NAMES stay
# globally unique across ALL modules - `module` is a grouping attribute,
# never part of a set's identity.
#
# To have an AI assistant decompose this project into modules and fill this
# file in, run the "Dabbler: Copy Module Decomposition Prompt" command
# (Command Palette) - then paste the copied prompt into your assistant.
#
# Renaming, deleting, splitting, or merging modules later (and adopting
# modules in an older repo) is covered in the module reorganization guide:
# https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/module-reorganization.md
"""

#: The canonical always-present manifest template (Set 091 S1, amendment 3):
#: header comments, commented-out examples, and a valid EMPTY ``modules: []``
#: list that the appender grows into its first block-style entry.
MODULES_YAML_TEMPLATE = (
    _MODULES_YAML_HEADER_COMMENTS
    + """#
# Example entries (copy below `modules:`, uncommented, to declare this
# repo's modules - or leave the list empty for a single-module repo):
#
# - slug: payment-api
#   title: "Payment API"
#   codeRoots:
#     - src/payment
#   planPath: docs/modules/payment-api/project-plan.md
# - slug: integration
#   title: "Cross-Module Integration"
#   codeRoots: []
#   planPath: docs/modules/integration/project-plan.md
#   touches:
#     - payment-api

modules: []
"""
)

#: Session-set artifact filenames that prove REAL execution happened (as
#: opposed to a bare ``kind: plan|decomposition`` scaffold that only has a
#: spec.md). Deliberately excludes ``session-state.json``: the router's own
#: writers create it, so its presence is not a "this was touched" signal.
EXECUTION_ARTIFACT_FILENAMES = (
    "activity-log.json",
    "session-events.jsonl",
    "change-log.md",
    "ai-assignment.md",
    "disposition.json",
    "CANCELLED.md",
    "RESTORED.md",
)

CANCELLED_FILENAME = "CANCELLED.md"
RESTORED_FILENAME = "RESTORED.md"


# ---------------------------------------------------------------------------
# Manifest reading -- mirrors fileSystem.ts readModulesManifest normalization
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ModuleEntry:
    """One normalized ``docs/modules.yaml`` entry.

    Normalization matches the Explorer's reader exactly: an entry with no
    usable ``slug`` is dropped, the FIRST of a duplicated slug wins, ``title``
    defaults to the slug, ``planPath`` is ``None`` when absent, and
    ``codeRoots`` / ``touches`` keep only their trimmed non-empty string
    members. The guards compare against this shape so "did the write change
    anything the Explorer can see?" is the question actually asked.
    """

    slug: str
    title: str
    code_roots: Tuple[str, ...] = ()
    plan_path: Optional[str] = None
    touches: Tuple[str, ...] = ()


def _string_list(value: object) -> Tuple[str, ...]:
    if not isinstance(value, list):
        return ()
    return tuple(
        item.strip()
        for item in value
        if isinstance(item, str) and item.strip() != ""
    )


def parse_manifest_entries(text: str) -> Optional[List[ModuleEntry]]:
    """Parse manifest *text* into normalized entries, or ``None`` if unusable.

    ``None`` means "not a valid module manifest" (unparseable YAML, not a
    mapping, or a ``modules:`` value that is neither null nor a list). A bare
    ``modules:`` (YAML null) is a VALID EMPTY manifest and returns ``[]`` --
    Set 091 amendment 3, and the difference matters: empty is the designed
    starting state, invalid is a config error that must refuse loud.
    """
    try:
        doc = yaml.safe_load(text)
    except yaml.YAMLError:
        return None
    if not isinstance(doc, dict) or "modules" not in doc:
        return None
    raw_modules = doc["modules"]
    if raw_modules is None:
        return []
    if not isinstance(raw_modules, list):
        return None
    out: List[ModuleEntry] = []
    seen = set()
    for raw in raw_modules:
        if not isinstance(raw, dict):
            continue
        slug_raw = raw.get("slug")
        slug = slug_raw.strip() if isinstance(slug_raw, str) else ""
        if not slug or slug in seen:
            continue
        seen.add(slug)
        title_raw = raw.get("title")
        title = (
            title_raw.strip()
            if isinstance(title_raw, str) and title_raw.strip() != ""
            else slug
        )
        plan_raw = raw.get("planPath")
        plan_path = (
            plan_raw.strip()
            if isinstance(plan_raw, str) and plan_raw.strip() != ""
            else None
        )
        out.append(
            ModuleEntry(
                slug=slug,
                title=title,
                code_roots=_string_list(raw.get("codeRoots")),
                plan_path=plan_path,
                touches=_string_list(raw.get("touches")),
            )
        )
    return out


@dataclass(frozen=True)
class ManifestClassification:
    """``absent`` / ``invalid`` / ``present`` -- the three-way manifest read.

    A truly ABSENT manifest is the designed repo-level fallback; a PRESENT
    but unusable one is a config error that must fail loud. Collapsing the
    two silently produces repo-level output in a module-organized repo,
    which is exactly the wrong-destination hazard.
    """

    kind: str
    entries: Tuple[ModuleEntry, ...] = ()

    @property
    def slugs(self) -> List[str]:
        return [entry.slug for entry in self.entries]


def manifest_path(root: str) -> str:
    return os.path.join(root, MODULES_MANIFEST_REL)


def classify_manifest(
    root: str, io: Optional["ModuleIo"] = None
) -> ManifestClassification:
    """Classify ``<root>/docs/modules.yaml`` as absent / invalid / present."""
    io = io or ModuleIo()
    path = manifest_path(root)
    try:
        text = io.read_text(path)
    except FileNotFoundError:
        # A dangling symlink is PRESENT (lexists) even though the read raised
        # ENOENT -- an I/O/config failure, not the designed no-manifest case.
        return ManifestClassification("invalid" if io.lexists(path) else "absent")
    except OSError:
        return ManifestClassification("invalid")
    entries = parse_manifest_entries(text)
    if entries is None:
        return ManifestClassification("invalid")
    return ManifestClassification("present", tuple(entries))


# ---------------------------------------------------------------------------
# Renderers -- byte-compatible with moduleAuthoring.ts
# ---------------------------------------------------------------------------


def validate_new_module_slug(raw: str, existing_slugs: Sequence[str]) -> Optional[str]:
    """Operator-readable error for a prospective slug, or ``None`` if valid."""
    slug = (raw or "").strip()
    if slug == "":
        return "Enter a module slug (kebab-case, e.g. greeter)."
    if not MODULE_SLUG_RE.match(slug):
        return (
            "Module slugs are kebab-case: lowercase letters and digits, "
            'joined by single hyphens (e.g. "greeter", "payment-api").'
        )
    if slug in existing_slugs:
        return f'Module "{slug}" already exists in {MODULES_MANIFEST_DISPLAY}.'
    return None


def default_module_plan_path(slug: str) -> str:
    """Canonical plan location for a module (forward-slashed, repo-relative)."""
    return f"docs/modules/{slug}/project-plan.md"


def _yaml_quote(value: str) -> str:
    """Emit *value* as a double-quoted YAML scalar (the TS JSON.stringify)."""
    return json.dumps(value, ensure_ascii=False)


def render_module_manifest_entry(slug: str, title: str, plan_rel_path: str) -> str:
    """The YAML block for one new entry, appended verbatim (never re-serialized)."""
    return (
        f"  - slug: {slug}\n"
        f"    title: {_yaml_quote(title)}\n"
        f"    codeRoots: []                # TODO: the code paths this module "
        f"owns, e.g. [src/{slug}]\n"
        f"    planPath: {plan_rel_path}\n"
    )


def render_module_plan_stub(slug: str, title: str) -> str:
    """The minimal module project-plan stub (Set 087 ruling Q1: H1 + TODO body)."""
    return (
        f"# {title} - module project plan\n"
        f"\n"
        f"> Module: `{slug}` (declared in `docs/modules.yaml`)\n"
        f"> Owner: TODO - name the developer(s) who own this module.\n"
        f"\n"
        f"TODO: describe this module's goals, phases, and key deliverables. When "
        f"the\nplan is ready, decompose it into session sets - each set is "
        f"stamped\n`module: {slug}` and grouped under this module in the Session "
        f"Set\nExplorer. Session-set names stay globally unique across all "
        f"modules; we\nrecommend including `{slug}` in each set's name.\n"
    )


# ---------------------------------------------------------------------------
# Format-preserving manifest text edits
# ---------------------------------------------------------------------------

# An EMPTY `modules:` line: flow-style `modules: []`, or a `modules:` that
# parses to YAML null (bare / `~` / `null` / `Null` / `NULL`). Leading
# whitespace is captured because YAML permits an indented root mapping; a
# trailing comment is captured and preserved; a quoted key keeps its quote
# style. A NESTED `modules:` under another mapping can also match, which is
# why the caller validates each candidate against the parse guard.
_EMPTY_MODULES_LINE_RE = re.compile(
    r"^([ \t]*)([\"']?)modules\2:[ \t]*(?:\[[ \t]*\]|~|null|Null|NULL)?"
    r"[ \t]*(#[^\r\n]*)?(?=\r?\n|\Z)",
    re.MULTILINE,
)

# One manifest entry's `- slug: <value>` marker line.
_ENTRY_MARKER_RE = re.compile(
    r"^([ \t]*)-([ \t]+)slug([ \t]*:[ \t]*)"
    r"(\"[^\"\r\n]*\"|'[^'\r\n]*'|[^#\r\n \t][^#\r\n]*?)"
    r"([ \t]*(?:#[^\r\n]*)?)(?=\r?\n|\Z)",
    re.MULTILINE,
)

_TITLE_LINE_RE = re.compile(
    r"^([ \t]+)title([ \t]*:[ \t]*)"
    r"(\"[^\"\r\n]*\"|'[^'\r\n]*'|[^#\r\n]*?)"
    r"([ \t]*(?:#[^\r\n]*)?)(?=\r?\n|\Z)",
    re.MULTILINE,
)

# Entry-span boundary walks. The rewrite walk looks for an EDIT point inside
# the surviving entry, so a following comment landing in its window is
# harmless. The REMOVAL walk decides what gets DELETED, and a same-or-
# shallower-indent `#` line conventionally attaches FORWARD to whatever
# follows it -- so it must stop the span rather than be swept into the
# deletion. The two deliberately diverge.
_REWRITE_BOUNDARY_RE = re.compile(r"\r?\n([ \t]*)(?:-[ \t]|[^ \t\r\n#])")
_REMOVE_BOUNDARY_RE = re.compile(r"\r?\n([ \t]*)(?:-[ \t]|#|[^ \t\r\n#])")


def _unquote_scalar(raw: str) -> str:
    token = raw.strip()
    if len(token) >= 2 and token[0] in "\"'" and token[-1] == token[0]:
        return token[1:-1]
    return token


def replace_empty_modules_list(text: str, entry_block: str) -> List[str]:
    """Candidate rewrites replacing an empty ``modules:`` marker with an entry.

    One candidate per matching line, in file order, each format-preserving
    (every other byte survives; a trailing comment is kept; an indented key
    keeps its indentation with the entry re-indented to nest under it). The
    caller MUST validate a candidate with the parse guard before writing it:
    a matching line may be a nested ``modules:`` key under another mapping,
    and only the guard can tell whether the ROOT list gained the entry.
    """
    out: List[str] = []
    for match in _EMPTY_MODULES_LINE_RE.finditer(text):
        indent = match.group(1)
        quote = match.group(2)
        comment = f" {match.group(3)}" if match.group(3) else ""
        after = text[match.end() :]
        body = entry_block[:-1] if entry_block.endswith("\n") else entry_block
        block = "\n".join(indent + line for line in body.split("\n"))
        out.append(
            text[: match.start()]
            + f"{indent}{quote}modules{quote}:{comment}\n"
            + block
            + ("\n" if after == "" else after)
        )
    return out


def _find_entry_marker(text: str, slug: str) -> Optional[re.Match]:
    for match in _ENTRY_MARKER_RE.finditer(text):
        if _unquote_scalar(match.group(4)) == slug:
            return match
    return None


def _entry_span_end(text: str, start_at: int, entry_indent: int, pattern) -> int:
    for match in pattern.finditer(text, start_at):
        if len(match.group(1)) <= entry_indent:
            return match.start()
    return len(text)


def rewrite_manifest_entry_text(
    text: str,
    old_slug: str,
    new_slug: Optional[str] = None,
    new_title: Optional[str] = None,
) -> Optional[str]:
    """Format-preserving rewrite of ONE entry's ``slug:`` and/or ``title:``.

    ``None`` when the entry cannot be edited safely in place (the caller
    refuses loudly and asks the operator to edit by hand) -- the same
    exotic-manifest-shape residual the appender declares. Assumes the slug
    lives on its ``- slug:`` list-item line, the shape the scaffold writes.
    """
    target = _find_entry_marker(text, old_slug)
    if target is None:
        return None

    entry_indent = len(target.group(1))
    key_indent = len(target.group(1)) + 1 + len(target.group(2))
    slug_value_start = (
        target.start()
        + len(target.group(1))
        + 1
        + len(target.group(2))
        + len("slug")
        + len(target.group(3))
    )
    slug_value_end = slug_value_start + len(target.group(4))
    slug_line_end = target.end()

    span_end = _entry_span_end(text, slug_line_end, entry_indent, _REWRITE_BOUNDARY_RE)

    edits: List[Tuple[int, int, str]] = []
    if new_slug is not None and new_slug != old_slug:
        edits.append((slug_value_start, slug_value_end, new_slug))
    if new_title is not None:
        span = text[slug_line_end:span_end]
        title_match = _TITLE_LINE_RE.search(span)
        if title_match:
            title_value_start = (
                slug_line_end
                + title_match.start()
                + len(title_match.group(1))
                + len("title")
                + len(title_match.group(2))
            )
            title_value_end = title_value_start + len(title_match.group(3))
            edits.append((title_value_start, title_value_end, _yaml_quote(new_title)))
        else:
            # No explicit title line -- insert one right after the slug line at
            # the entry's key indent (title defaults to the slug when absent,
            # so adding it is the only way a title-only rename can take
            # effect). Reuse the file's own newline convention.
            newline = "\r\n" if "\r\n" in text else "\n"
            insertion = f"{newline}{' ' * key_indent}title: {_yaml_quote(new_title)}"
            edits.append((slug_line_end, slug_line_end, insertion))
    if not edits:
        return text
    out = text
    for start, end, replacement in sorted(edits, key=lambda e: -e[0]):
        out = out[:start] + replacement + out[end:]
    return out


def remove_manifest_entry_text(text: str, slug: str) -> Optional[str]:
    """Format-preserving removal of one entry's whole block.

    Deletes the ``- slug: <slug>`` line through its last nested field, plus
    exactly the one trailing newline that separated it from what followed, so
    no blank line is left behind. ``None`` when the entry cannot be located
    safely -- the caller refuses loud.
    """
    target = _find_entry_marker(text, slug)
    if target is None:
        return None
    entry_indent = len(target.group(1))
    span_end = _entry_span_end(text, target.end(), entry_indent, _REMOVE_BOUNDARY_RE)
    newline_match = re.match(r"^\r?\n", text[span_end:])
    delete_end = span_end + (len(newline_match.group(0)) if newline_match else 0)
    return text[: target.start()] + text[delete_end:]


# ---------------------------------------------------------------------------
# Parse-after-write guards (semantic, not textual)
# ---------------------------------------------------------------------------


class ManifestGuardError(ValueError):
    """A computed manifest candidate failed its parse-after-write guard."""


def assert_appended_manifest_parses(
    candidate: str, slug: str, expected_count: int, entry_block: str
) -> None:
    """The candidate must parse to a mapping whose list gained exactly the entry."""

    def refuse(why: str):
        raise ManifestGuardError(
            f"Could not append the module entry to {MODULES_MANIFEST_DISPLAY} "
            f'automatically ({why}). Add this entry to the "modules:" list by '
            f"hand:\n{entry_block}"
        )

    entries = parse_manifest_entries(candidate)
    if entries is None:
        refuse(
            'appending requires the "modules:" block list to be the last '
            "top-level key"
        )
    if len(entries) != expected_count or slug not in [e.slug for e in entries]:
        refuse(
            'the appended entry did not land in the "modules:" list - the list '
            "is probably flow-style, holds entries the manifest reader dropped, "
            "or is not the last top-level key"
        )


def assert_renamed_manifest_parses(
    original_entries: Sequence[ModuleEntry],
    candidate_text: str,
    old_slug: str,
    new_slug: str,
    new_title: Optional[str],
) -> None:
    """The candidate must be the original entry set with only the rename applied."""

    def refuse(why: str):
        raise ManifestGuardError(f"Could not rename the module entry ({why}).")

    candidate = parse_manifest_entries(candidate_text)
    if candidate is None:
        refuse("the result is not a valid module manifest")
    if len(candidate) != len(original_entries):
        refuse(f"entry count changed ({len(original_entries)} -> {len(candidate)})")
    target_index = next(
        (i for i, e in enumerate(original_entries) if e.slug == old_slug), -1
    )
    if target_index < 0:
        refuse(f'the original had no "{old_slug}" entry')
    for i, before in enumerate(original_entries):
        after = candidate[i]
        if i != target_index:
            if after != before:
                refuse(f"entry {i} ({before.slug}) changed unexpectedly")
            continue
        if after.slug != new_slug:
            refuse(f"entry {i} slug is {after.slug!r}, expected {new_slug!r}")
        if (
            after.plan_path != before.plan_path
            or after.code_roots != before.code_roots
            or after.touches != before.touches
        ):
            refuse(f"entry {i} changed a field other than slug/title")
        if new_title is not None:
            if after.title != new_title:
                refuse(f"entry {i} title is {after.title!r}, expected {new_title!r}")
        elif after.title != before.title and after.title != new_slug:
            # Slug-only rename: the parsed title is EITHER the preserved
            # explicit title OR -- when the entry had none -- the slug-derived
            # default, which now follows the new slug. Anything else means the
            # splice corrupted the title.
            refuse(f"entry {i} title changed unexpectedly to {after.title!r}")
    new_slug_count = len([e for e in candidate if e.slug == new_slug])
    if new_slug_count != 1:
        refuse(f"the new slug appears {new_slug_count} times")
    if new_slug != old_slug and any(e.slug == old_slug for e in candidate):
        refuse(f'the old slug "{old_slug}" still appears')


def assert_manifest_entry_removed(
    original_entries: Sequence[ModuleEntry], candidate_text: str, slug: str
) -> None:
    """The candidate must be exactly the original entry set minus *slug*."""

    def refuse(why: str):
        raise ManifestGuardError(f"Could not remove the module entry ({why}).")

    candidate = parse_manifest_entries(candidate_text)
    if candidate is None:
        refuse("the result is not a valid module manifest")
    if len(candidate) != len(original_entries) - 1:
        refuse(
            f"entry count changed ({len(original_entries)} -> {len(candidate)}, "
            f"expected {len(original_entries) - 1})"
        )
    if any(e.slug == slug for e in candidate):
        refuse(f'the removed slug "{slug}" still appears')
    remaining = [e for e in original_entries if e.slug != slug]
    for i, before in enumerate(remaining):
        if candidate[i] != before:
            refuse(f"entry {i} ({before.slug}) changed unexpectedly")


# ---------------------------------------------------------------------------
# spec.md `module:` stamp / restamp (format-preserving, config-block bounded)
# ---------------------------------------------------------------------------

_CONFIG_HEADING_RE = re.compile(
    r"^##[ \t]+Session Set Configuration[ \t]*(?=\r?\n|\Z)", re.IGNORECASE | re.MULTILINE
)
_CONFIG_FENCE_OPEN_RE = re.compile(r"^```ya?ml[ \t]*\r?\n", re.IGNORECASE | re.MULTILINE)
_CONFIG_FENCE_CLOSE_RE = re.compile(r"^```[ \t]*(?=\r?\n|\Z)", re.MULTILINE)
_NEXT_HEADING_RE = re.compile(r"^##[ \t]", re.MULTILINE)
_TOP_LEVEL_MODULE_RE = re.compile(r"^module[ \t]*:", re.MULTILINE)


@dataclass(frozen=True)
class TextEdit:
    """The result of a pure spec.md splice: written / noop / refused."""

    kind: str
    text: Optional[str] = None
    reason: Optional[str] = None


def _locate_config_block(text: str) -> Optional[Tuple[int, int]]:
    """``(content_start, content_end)`` of the config block's YAML body.

    Bounded to the Session Set Configuration section: an UNTERMINATED config
    fence must refuse loud, never borrow a closing fence from a later section
    (which would let a malformed block be mutated instead of rejected).
    """
    heading = _CONFIG_HEADING_RE.search(text)
    if heading is None:
        return None
    after_heading = heading.end()
    next_heading = _NEXT_HEADING_RE.search(text, after_heading)
    section_end = next_heading.start() if next_heading else len(text)
    fence_open = _CONFIG_FENCE_OPEN_RE.search(text, after_heading, section_end)
    if fence_open is None:
        return None
    content_start = fence_open.end()
    fence_close = _CONFIG_FENCE_CLOSE_RE.search(text, content_start, section_end)
    if fence_close is None:
        return None
    return content_start, fence_close.start()


def _parsed_block_module(block: str) -> Tuple[bool, object]:
    """``(has_top_level_module_key, value)`` for a config block's YAML body.

    Decided from the PARSED top-level property, never a raw-text regex: an
    indented ``module:`` inside a block scalar or a nested mapping is not a
    stamp, and treating it as one silently no-ops a set that needed stamping.
    """
    try:
        doc = yaml.safe_load(block)
    except yaml.YAMLError:
        return False, None
    if not isinstance(doc, dict) or "module" not in doc:
        return False, None
    return True, doc["module"]


def stamp_module_into_spec_text(text: str, slug: str) -> TextEdit:
    """Splice ``module: <slug>`` as the first line inside the config block.

    Idempotent: a set already stamped to *slug* is a ``noop``; a set stamped
    to a DIFFERENT module refuses -- a differing stamp on a supposedly-legacy
    set is a stale snapshot, never silently overwritten.
    """
    located = _locate_config_block(text)
    if located is None:
        return TextEdit(
            "refused",
            reason='no spliceable "Session Set Configuration" yaml block',
        )
    content_start, content_end = located
    has_key, existing = _parsed_block_module(text[content_start:content_end])
    if has_key:
        if existing == slug:
            return TextEdit("noop")
        return TextEdit(
            "refused",
            reason=f"already stamped module: {existing}",
        )
    return TextEdit(
        "written", text=text[:content_start] + f"module: {slug}\n" + text[content_start:]
    )


def restamp_module_in_spec_text(text: str, expected_old: str, new_slug: str) -> TextEdit:
    """Rewrite ONLY the value token of the top-level ``module:`` line."""
    located = _locate_config_block(text)
    if located is None:
        return TextEdit(
            "refused",
            reason='no spliceable "Session Set Configuration" yaml block',
        )
    content_start, content_end = located
    block = text[content_start:content_end]
    has_key, existing = _parsed_block_module(block)
    if not has_key:
        return TextEdit("refused", reason="no top-level module: key to rewrite")
    if existing == new_slug:
        return TextEdit("noop")
    if existing != expected_old:
        return TextEdit(
            "refused", reason=f"stamped module: {existing!r}, not {expected_old!r}"
        )
    line = re.search(
        r"^(module[ \t]*:[ \t]*)([^\r\n]*?)([ \t]*(?:#[^\r\n]*)?)(?=\r?\n|\Z)",
        block,
        re.MULTILINE,
    )
    if line is None:
        return TextEdit("refused", reason="could not locate the module: line to rewrite")
    value_abs = content_start + line.start() + len(line.group(1))
    value_len = len(line.group(2))
    return TextEdit(
        "written", text=text[:value_abs] + new_slug + text[value_abs + value_len :]
    )


class SpecGuardError(ValueError):
    """A computed spec.md splice failed its parse-after-write guard."""


def _assert_block_stamp(new_text: str, expected_slug: str, verb: str) -> None:
    located = _locate_config_block(new_text)
    if located is None:
        raise SpecGuardError(f"Refusing the module {verb} (the config block no longer parses).")
    block = new_text[located[0] : located[1]]
    has_key, value = _parsed_block_module(block)
    if not has_key or value != expected_slug:
        raise SpecGuardError(
            f"Refusing the module {verb} (module resolved to {value!r}, "
            f"not {expected_slug!r})."
        )
    count = len(_TOP_LEVEL_MODULE_RE.findall(block))
    if count != 1:
        raise SpecGuardError(
            f"Refusing the module {verb} ({count} top-level module: lines in the block)."
        )


def assert_stamped_text_valid(original: str, new_text: str, slug: str) -> None:
    """The ONLY acceptable result is the deterministic canonical splice.

    Recomputes it and requires byte-for-byte equality (insertion-safe, unlike
    a common-prefix/suffix diff), then re-parses the resulting block as
    defense in depth.
    """
    expected = stamp_module_into_spec_text(original, slug)
    if expected.kind != "written":
        raise SpecGuardError(
            "Refusing the module stamp ("
            + (
                "the original is already stamped to this module"
                if expected.kind == "noop"
                else f"the original has no spliceable config block: {expected.reason}"
            )
            + ")."
        )
    if new_text != expected.text:
        raise SpecGuardError(
            "Refusing the module stamp (the result is not the exact canonical "
            "single-line splice)."
        )
    _assert_block_stamp(new_text, slug, "stamp")


def assert_restamped_text_valid(
    original: str, new_text: str, old_slug: str, new_slug: str
) -> None:
    """The ONLY acceptable result is the deterministic canonical value rewrite."""
    expected = restamp_module_in_spec_text(original, old_slug, new_slug)
    if expected.kind != "written":
        raise SpecGuardError(
            "Refusing the module restamp ("
            + (
                "the original is already stamped to the new module"
                if expected.kind == "noop"
                else f"the original cannot be restamped: {expected.reason}"
            )
            + ")."
        )
    if new_text != expected.text:
        raise SpecGuardError(
            "Refusing the module restamp (the result is not the exact canonical "
            "single-value rewrite)."
        )
    _assert_block_stamp(new_text, new_slug, "restamp")


# ---------------------------------------------------------------------------
# Session-set scanning and the running-session refusal
# ---------------------------------------------------------------------------

_SPEC_CONFIG_BLOCK_RE = re.compile(
    r"##\s*Session Set Configuration[\s\S]*?```ya?ml\s*([\s\S]*?)```", re.IGNORECASE
)


def _spec_string_field(block: str, key: str) -> Optional[str]:
    match = re.search(
        rf"^[ \t]*{re.escape(key)}[ \t]*:[ \t]*"
        rf"(?:\"([\w-]+)\"|'([\w-]+)'|([\w-]+))[ \t]*(?:#[^\r\n]*)?(?=\r?\n|\Z)",
        block,
        re.IGNORECASE | re.MULTILINE,
    )
    if match is None:
        return None
    return match.group(1) or match.group(2) or match.group(3)


def read_spec_module_and_kind(spec_path: str) -> Tuple[Optional[str], Optional[str]]:
    """The raw declared ``module:`` / ``kind:`` of a set, or ``(None, None)``.

    Mirrors the Explorer's ``parseSessionSetConfig``: read from inside the
    canonical block when present, else fall back to the whole file (the
    pre-Set-087 spec layouts).
    """
    try:
        with open(spec_path, "r", encoding="utf-8") as handle:
            text = handle.read()
    except OSError:
        return None, None
    block_match = _SPEC_CONFIG_BLOCK_RE.search(text)
    block = block_match.group(1) if block_match else text
    return _spec_string_field(block, "module"), _spec_string_field(block, "kind")


def list_session_set_dir_names(root: str) -> List[str]:
    """Directory basenames under ``docs/session-sets``, ``_``-prefixed skipped."""
    sets_root = os.path.join(root, SESSION_SETS_REL)
    if not os.path.isdir(sets_root):
        return []
    return sorted(
        name
        for name in os.listdir(sets_root)
        if not name.startswith("_") and os.path.isdir(os.path.join(sets_root, name))
    )


def _read_state_dict(set_dir: str) -> Optional[dict]:
    """Non-mutating read of ``session-state.json`` (never seeds the file)."""
    try:
        with open(os.path.join(set_dir, SESSION_STATE_FILENAME), "r", encoding="utf-8") as h:
            data = json.load(h)
    except (OSError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


def infer_legacy_status(set_dir: str) -> str:
    """File-presence status inference for a set with no usable state file.

    Mirrors the Set 7 backfill rules WITHOUT that reader's side effect of
    synthesizing a state file. A pre-Set-7 legacy set has no
    ``session-state.json`` at all, so a reader that treats "file absent" as
    unconditionally "not-started" misreads a genuinely COMPLETE or
    IN-PROGRESS legacy set as untouched -- which would wrongly cancel a
    complete set, and wrongly pass the running-session refusal.
    """
    if os.path.isfile(os.path.join(set_dir, "change-log.md")):
        return "complete"
    if os.path.isfile(os.path.join(set_dir, "activity-log.json")):
        return "in-progress"
    return "not-started"


def has_running_session(set_dir: str) -> bool:
    """``True`` iff a top-level or per-session ``status`` is ``in-progress``."""
    state = _read_state_dict(set_dir)
    if state is None:
        return infer_legacy_status(set_dir) == "in-progress"
    if state.get("status") == "in-progress":
        return True
    sessions = state.get("sessions")
    if isinstance(sessions, list):
        return any(
            isinstance(s, dict) and s.get("status") == "in-progress" for s in sessions
        )
    return False


def raw_session_set_status(set_dir: str) -> str:
    """Non-mutating canonical status read: complete / in-progress / not-started."""
    state = _read_state_dict(set_dir)
    if state is None:
        return infer_legacy_status(set_dir)
    status = state.get("status")
    if not isinstance(status, str):
        return infer_legacy_status(set_dir)
    canon = "complete" if status in ("completed", "done") else status
    return canon if canon in ("complete", "in-progress") else "not-started"


def read_cancellation_state(set_dir: str) -> str:
    """State-file-first cancellation read: cancelled / restored / active / unknown."""
    state = _read_state_dict(set_dir)
    if state is None:
        return "unknown"
    status = state.get("status")
    if not isinstance(status, str) or status == "":
        return "unknown"
    if status == "cancelled":
        return "cancelled"
    if os.path.isfile(os.path.join(set_dir, RESTORED_FILENAME)):
        return "restored"
    return "active"


def _has_execution_artifacts(set_dir: str) -> bool:
    return any(
        os.path.isfile(os.path.join(set_dir, name))
        for name in EXECUTION_ARTIFACT_FILENAMES
    )


@dataclass(frozen=True)
class SetDisposition:
    """One affected set's deletion disposition.

    ``terminal`` -- complete, or already cancelled: never touched.
    ``cancel``   -- non-terminal: cancelled via the sanctioned writer.
    ``remove``   -- an unstarted ``kind: plan|decomposition`` scaffold with no
                    execution artifacts: its directory is removed outright.
    """

    name: str
    dir: str
    disposition: str


def _classify_one_set_for_deletion(set_dir: str, kind: Optional[str]) -> str:
    cancellation = read_cancellation_state(set_dir)
    if cancellation == "cancelled" or (
        cancellation == "unknown"
        and os.path.isfile(os.path.join(set_dir, CANCELLED_FILENAME))
    ):
        # A set cancelled before it ever had a session-state.json leaves
        # CANCELLED.md as the ONLY signal; without this fallback it would be
        # re-classified "cancel" and re-cancelled.
        return "terminal"
    status = raw_session_set_status(set_dir)
    if status == "complete":
        return "terminal"
    if status == "not-started":
        if (kind or "").lower() in ("plan", "decomposition") and not _has_execution_artifacts(
            set_dir
        ):
            return "remove"
    return "cancel"


def classify_module_sets_for_deletion(root: str, slug: str) -> List[SetDisposition]:
    """Classify every set stamped ``module: <slug>`` by its deletion disposition."""
    sets_root = os.path.join(root, SESSION_SETS_REL)
    out: List[SetDisposition] = []
    for name in list_session_set_dir_names(root):
        set_dir = os.path.join(sets_root, name)
        module, kind = read_spec_module_and_kind(os.path.join(set_dir, "spec.md"))
        if module != slug:
            continue
        out.append(
            SetDisposition(name, set_dir, _classify_one_set_for_deletion(set_dir, kind))
        )
    return out


# ---------------------------------------------------------------------------
# Module lifecycle sets -- the numbering half of the adopted CLI surface
# ---------------------------------------------------------------------------

_MODULE_PLAN_SET_TEMPLATE = "module-plan-set.spec.md.template"
_MODULE_DECOMPOSITION_SET_TEMPLATE = "module-decomposition-set.spec.md.template"
_TOKEN_RE = re.compile(r"\{\{([A-Z_]+)\}\}")
_SET_PREFIX_RE = re.compile(r"^(\d+)-")


class LifecycleScaffoldError(ValueError):
    """A module's lifecycle sets could not be scaffolded."""


def _lifecycle_template_dirs() -> List[str]:
    """Where the two lifecycle spec templates may live, in precedence order.

    The packaged copy under ``ai_router/templates/`` is what a
    ``pip install dabbler-ai-router`` ships, so it comes first; the repo's
    ``docs/templates/consumer-bootstrap/`` copy is the source-checkout
    fallback. ``test_modules_lifecycle.py`` pins the two byte-identical, so
    the duplication cannot drift silently (the risk the TypeScript resolver
    names but never checks).
    """
    here = os.path.dirname(os.path.abspath(__file__))
    return [
        os.path.join(here, "templates"),
        os.path.join(
            os.path.dirname(here), "docs", "templates", "consumer-bootstrap"
        ),
    ]


def load_lifecycle_template(filename: str) -> str:
    for directory in _lifecycle_template_dirs():
        candidate = os.path.join(directory, filename)
        if os.path.isfile(candidate):
            with open(candidate, "r", encoding="utf-8") as handle:
                return handle.read().replace("\r\n", "\n")
    raise LifecycleScaffoldError(
        f"the module-lifecycle template {filename} was not found in "
        f"{' or '.join(_lifecycle_template_dirs())}"
    )


def render_lifecycle_spec(filename: str, tokens: Dict[str, str]) -> str:
    """Substitute every ``{{TOKEN}}`` the table knows, then fail loud on leftovers."""
    rendered = _TOKEN_RE.sub(
        lambda m: tokens.get(m.group(1), m.group(0)),
        load_lifecycle_template(filename),
    )
    leftover = _TOKEN_RE.findall(rendered)
    if leftover:
        raise LifecycleScaffoldError(
            f"{filename}: unsubstituted token(s) {', '.join(sorted(set(leftover)))} "
            f"- a template/writer token-table mismatch."
        )
    return rendered


def _next_set_number_from(names: Sequence[str]) -> str:
    """``max(numeric prefix) + 1``, zero-padded to ``max(3, widest prefix)``.

    Mirrors :func:`ai_router.resolve_set.next_session_set_number`, but over a
    list of names rather than a directory, so a slug minted in this call can
    be reserved before the sibling number is resolved.
    """
    prefixes = [
        int(m.group(1)) for m in (_SET_PREFIX_RE.match(n) for n in names) if m
    ]
    widths = [len(m.group(1)) for m in (_SET_PREFIX_RE.match(n) for n in names) if m]
    nxt = max(prefixes) + 1 if prefixes else 1
    return f"{nxt:0{max(3, max(widths, default=0))}d}"


def _existing_lifecycle_slug(
    names: Sequence[str], module_slug: str, kind: str
) -> Optional[str]:
    """An already-scaffolded lifecycle set of *kind* for this module, by identity.

    Re-running the scaffold for a module that already has one must reuse it
    rather than mint a duplicate; the sorted pick keeps the pathological
    multi-match case deterministic.

    Set 122 S2 (residual ``S122-S1-R1``): the identity test is the name minus
    its numeric prefix equalling ``<slug>-<kind>`` EXACTLY. A suffix match --
    which is what the TypeScript ``findExistingLifecycleSetSlug`` did, and what
    the Session 1 port inherited -- makes module ``api`` reuse ``payment-api``'s
    sets, so the new module silently never gets its own.
    """
    expected = f"{module_slug}-{kind}"
    matches = sorted(
        n
        for n in names
        for m in (_SET_PREFIX_RE.match(n),)
        if m and n[m.end() :] == expected
    )
    return matches[0] if matches else None


def _assert_lifecycle_spec_valid(
    text: str, expected_kind: str, expected_prereq: Optional[str]
) -> None:
    """Re-parse a rendered lifecycle spec and confirm what it must declare.

    Reads the config block as real YAML rather than re-deriving a regex: the
    declared ``kind`` is what the Explorer and the deletion classifier key
    off, and the decomposition set's ``prerequisites:`` cross-link is the
    entire gating mechanism (it reuses the existing prerequisite badge, so a
    template that silently lost it would gate nothing).
    """
    located = _locate_config_block(text)
    if located is None:
        raise LifecycleScaffoldError(
            "the rendered spec has no Session Set Configuration yaml block"
        )
    try:
        block = yaml.safe_load(text[located[0] : located[1]])
    except yaml.YAMLError as exc:
        raise LifecycleScaffoldError(
            f"the rendered spec's config block is not valid YAML: {exc}"
        ) from exc
    if not isinstance(block, dict):
        raise LifecycleScaffoldError("the rendered spec's config block is not a mapping")
    if block.get("kind") != expected_kind:
        raise LifecycleScaffoldError(
            f'expected kind "{expected_kind}", parsed {block.get("kind")!r} '
            f"- refusing (template/writer drift)."
        )
    if expected_prereq is not None:
        prereqs = block.get("prerequisites")
        ok = isinstance(prereqs, list) and any(
            isinstance(p, dict)
            and p.get("slug") == expected_prereq
            and p.get("condition") == "complete"
            for p in prereqs
        )
        if not ok:
            raise LifecycleScaffoldError(
                f'expected a prerequisites: entry for "{expected_prereq}" '
                f"- refusing (template/writer drift)."
            )


@dataclass(frozen=True)
class LifecycleSets:
    """The two lifecycle sets a module owns, and whether this call made them."""

    plan_slug: str
    plan_created: bool
    decomposition_slug: str
    decomposition_created: bool


def scaffold_module_lifecycle_sets(
    root: str,
    module_slug: str,
    module_title: str,
    plan_rel_path: str,
    transaction: "_Transaction",
    io: "ModuleIo",
    today: Optional[str] = None,
) -> LifecycleSets:
    """Scaffold a module's ``kind: plan`` + ``kind: decomposition`` set pair.

    Resolves the next two free set numbers, renders both templates into
    ``docs/session-sets/NNN-<module>-{plan,decomposition}/spec.md`` (spec.md
    only -- ``session-state.json`` belongs to the sanctioned runtime writers)
    and cross-links the decomposition set's ``prerequisites:`` to its sibling
    plan. Skip-existing by identity, so a re-run reuses what is there.

    Writes go through *transaction*, so a failure anywhere in ``create``
    removes these directories too.
    """
    if not MODULE_SLUG_RE.match((module_slug or "").strip()):
        raise LifecycleScaffoldError(
            f'Cannot scaffold lifecycle sets: "{module_slug}" is not a valid module slug.'
        )
    names = list(list_session_set_dir_names(root))
    existing_plan = _existing_lifecycle_slug(names, module_slug, "plan")
    existing_decomposition = _existing_lifecycle_slug(names, module_slug, "decomposition")

    plan_slug = existing_plan or f"{_next_set_number_from(names)}-{module_slug}-plan"
    # Reserve a freshly-minted plan slug so the decomposition number advances
    # past it rather than colliding with it.
    reserved = names if (existing_plan or plan_slug in names) else [*names, plan_slug]
    decomposition_slug = (
        existing_decomposition
        or f"{_next_set_number_from(reserved)}-{module_slug}-decomposition"
    )

    created = today or _today_iso()
    title = (module_title or "").strip() or module_slug
    sets_root = os.path.join(root, SESSION_SETS_REL)

    def write_one(slug: str, filename: str, kind: str, prereq: Optional[str]) -> bool:
        spec_abs = os.path.join(sets_root, slug, "spec.md")
        if io.exists(spec_abs):
            return False
        tokens = {
            "MODULE_TITLE": title,
            "MODULE_SLUG": module_slug,
            "SLUG": slug,
            "CREATED": created,
            "PLAN_REL_PATH": plan_rel_path,
        }
        if prereq is not None:
            tokens["PLAN_SLUG"] = prereq
        text = render_lifecycle_spec(filename, tokens)
        _assert_lifecycle_spec_valid(text, kind, prereq)
        transaction.makedirs(os.path.dirname(spec_abs))
        transaction.write(spec_abs, text)
        if io.read_text(spec_abs) != text:
            raise LifecycleScaffoldError(
                f"{slug}/spec.md did not verify after write (concurrent modification?)."
            )
        return True

    plan_created = (
        False
        if existing_plan
        else write_one(plan_slug, _MODULE_PLAN_SET_TEMPLATE, "plan", None)
    )
    decomposition_created = (
        False
        if existing_decomposition
        else write_one(
            decomposition_slug,
            _MODULE_DECOMPOSITION_SET_TEMPLATE,
            "decomposition",
            plan_slug,
        )
    )
    return LifecycleSets(
        plan_slug, plan_created, decomposition_slug, decomposition_created
    )


def _today_iso() -> str:
    from datetime import date

    return date.today().isoformat()


# ---------------------------------------------------------------------------
# The injectable filesystem seam and the rollback transaction
# ---------------------------------------------------------------------------


class ModuleIo:
    """Filesystem + sanctioned-writer seam, injectable so failures are testable.

    ``write_text`` publishes atomically (unique temp + ``os.replace``) so a
    crash never leaves a half-written file; :class:`_Transaction` layers
    all-or-nothing rollback on top by re-writing in-memory originals.
    ``missing_dirs`` is a pure query so the transaction can record its undo
    intent before anything is created.

    ``cancel_session_set`` is the ONLY route to a ``session-state.json``
    mutation in this module. It delegates to
    :func:`ai_router.session_lifecycle.cancel_session_set` -- the sanctioned
    Python writer -- because a lifecycle operation that hand-writes the state
    file is exactly the invariant violation Set 122 exists to remove.
    """

    def read_text(self, path: str) -> str:
        with open(path, "r", encoding="utf-8", newline="") as handle:
            return handle.read()

    def write_text(self, path: str, data: str) -> None:
        directory = os.path.dirname(path) or "."
        fd, tmp_path = tempfile.mkstemp(
            prefix=f".{os.path.basename(path)}.", suffix=".dabbler-tmp", dir=directory
        )
        try:
            with os.fdopen(fd, "wb") as handle:
                handle.write(data.encode("utf-8"))
            os.replace(tmp_path, path)
        except BaseException:
            if os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass
            raise

    def exists(self, path: str) -> bool:
        return os.path.exists(path)

    def lexists(self, path: str) -> bool:
        return os.path.lexists(path)

    def missing_dirs(self, path: str) -> List[str]:
        """Directories that ``makedirs(path)`` would have to create, outermost first.

        A pure query with no side effect, so a caller can record its undo
        intent BEFORE anything is created.
        """
        missing: List[str] = []
        current = os.path.abspath(path)
        while current and not os.path.isdir(current):
            missing.append(current)
            parent = os.path.dirname(current)
            if parent == current:
                break
            current = parent
        return list(reversed(missing))

    def makedirs(self, path: str) -> None:
        os.makedirs(path, exist_ok=True)

    def remove(self, path: str) -> None:
        os.remove(path)

    def rmdir(self, path: str) -> None:
        os.rmdir(path)

    def rmtree(self, path: str) -> None:
        shutil.rmtree(path)

    def cancel_session_set(self, set_dir: str, reason: str) -> None:
        _cancel_session_set(set_dir, reason)


class _Transaction:
    """Records every filesystem effect so a failure can undo all of them.

    This is what makes the Python lifecycle transactional where the
    TypeScript one was not: ``scaffoldNewModule`` wrote the plan stub first
    and the manifest second, so a failed manifest write stranded an orphan
    stub. Here the same failure rolls the stub -- and any directory the call
    created -- back out.
    """

    def __init__(self, io: ModuleIo) -> None:
        self._io = io
        self._undo: List[Tuple[str, str, Optional[str]]] = []

    def write(self, path: str, data: str) -> None:
        # The undo entry is recorded BEFORE the write is attempted. A writer
        # that fails PART WAY -- or fails ambiguously -- must still be undone,
        # and recording afterwards silently drops exactly those cases. Undoing
        # a write that never landed is harmless: the prior bytes are rewritten
        # unchanged, or a file that does not exist is skipped.
        existed = self._io.lexists(path)
        prior = self._io.read_text(path) if existed else None
        self._undo.append(("restore", path, prior))
        self._io.write_text(path, data)

    def makedirs(self, path: str) -> None:
        # Recorded OUTERMOST-first so the reversed undo walk removes the
        # innermost directory first -- the other order leaves a non-empty
        # parent behind and reports a failed rollback. Recorded before the
        # create, for the same reason as `write`.
        for planned in self._io.missing_dirs(path):
            self._undo.append(("rmdir", planned, None))
        self._io.makedirs(path)

    def rollback(self) -> bool:
        """Undo every recorded effect, newest first. ``False`` iff an undo failed.

        Each undo is CONDITIONAL on the effect actually being present: a
        recorded write that never landed needs no restore, and a directory
        that was never created needs no removal. That keeps rollback
        idempotent, and keeps a genuinely-failed undo (the case the operator
        must reconcile from git) distinguishable from a no-op.
        """
        ok = True
        for action, path, payload in reversed(self._undo):
            try:
                if action == "restore":
                    try:
                        current = self._io.read_text(path)
                    except OSError:
                        current = None
                    if payload is None:
                        if self._io.lexists(path):
                            self._io.remove(path)
                    elif current != payload:
                        self._io.write_text(path, payload)
                elif action == "rmdir":
                    if self._io.lexists(path):
                        self._io.rmdir(path)
            except OSError:
                ok = False
        self._undo.clear()
        return ok


# ---------------------------------------------------------------------------
# Results
# ---------------------------------------------------------------------------


@dataclass
class LifecycleResult:
    """What a lifecycle operation did, or why it refused.

    ``refused`` means a preflight rejected the call and NOTHING was written.
    ``write_failed`` means the apply phase stopped; ``rolled_back`` says
    whether the undo itself succeeded (``False`` means the operator must
    reconcile from git).
    """

    command: str
    slug: str
    ok: bool = True
    refused: Optional[str] = None
    write_failed: Optional[str] = None
    rolled_back: Optional[bool] = None
    details: Dict[str, object] = field(default_factory=dict)

    @property
    def exit_code(self) -> int:
        if self.refused is not None:
            return 3
        if self.write_failed is not None:
            return 4
        return 0

    def to_dict(self) -> dict:
        out: dict = {
            "command": self.command,
            "slug": self.slug,
            "ok": self.ok,
            "exitCode": self.exit_code,
        }
        if self.refused is not None:
            out["refused"] = self.refused
        if self.write_failed is not None:
            out["writeFailed"] = self.write_failed
        if self.rolled_back is not None:
            out["rolledBack"] = self.rolled_back
        out.update(self.details)
        return out


def _refused(command: str, slug: str, reason: str, **details) -> LifecycleResult:
    return LifecycleResult(command, slug, ok=False, refused=reason, details=dict(details))


def _error_text(exc: BaseException) -> str:
    return str(exc) or exc.__class__.__name__


# ---------------------------------------------------------------------------
# create
# ---------------------------------------------------------------------------


def create_module(
    root: str,
    raw_slug: str,
    raw_title: Optional[str] = None,
    io: Optional[ModuleIo] = None,
) -> LifecycleResult:
    """Scaffold one new module: the plan stub plus a ``docs/modules.yaml`` entry.

    A valid EMPTY manifest is grown by replacing the empty-list marker with
    the first block-style entry; a populated one keeps the plain text append.
    Every candidate is computed and guarded BEFORE any write, so a refusal
    leaves the workspace untouched -- and a failure DURING the writes rolls
    back the plan stub and any directory this call created.
    """
    io = io or ModuleIo()
    slug = (raw_slug or "").strip()
    classified = classify_manifest(root, io)
    if classified.kind == "invalid":
        return _refused("create", slug, INVALID_MANIFEST_MESSAGE)
    slug_error = validate_new_module_slug(slug, classified.slugs)
    if slug_error:
        return _refused("create", slug, slug_error)

    title = (raw_title or "").strip() or slug
    plan_rel = default_module_plan_path(slug)
    entry_block = render_module_manifest_entry(slug, title, plan_rel)

    manifest_abs = manifest_path(root)
    manifest_created = classified.kind == "absent"
    # A CREATED manifest starts from the canonical template -- the same shape
    # every ensure-write site produces -- then grows. Otherwise the source is
    # the existing file.
    try:
        source_text = (
            MODULES_YAML_TEMPLATE if manifest_created else io.read_text(manifest_abs)
        )
    except OSError as exc:
        return _refused(
            "create", slug, f"could not read {MODULES_MANIFEST_DISPLAY}: {_error_text(exc)}"
        )

    candidate: Optional[str] = None
    if not classified.entries:
        for replaced in replace_empty_modules_list(source_text, entry_block):
            try:
                assert_appended_manifest_parses(replaced, slug, 1, entry_block)
            except ManifestGuardError:
                continue  # wrong site (a nested key) -- try the next line
            candidate = replaced
            break
    if candidate is None:
        candidate = (
            source_text if source_text.endswith("\n") else source_text + "\n"
        ) + entry_block
    try:
        assert_appended_manifest_parses(
            candidate, slug, len(classified.entries) + 1, entry_block
        )
    except ManifestGuardError as exc:
        return _refused("create", slug, _error_text(exc))

    plan_abs = os.path.join(root, *plan_rel.split("/"))
    transaction = _Transaction(io)
    plan_created = False
    lifecycle: Optional[LifecycleSets] = None
    try:
        # The stub is written FIRST: were the transaction to fail after it,
        # rollback removes it; a manifest entry pointing at a missing plan
        # would dangle.
        if not io.exists(plan_abs):
            transaction.makedirs(os.path.dirname(plan_abs))
            transaction.write(plan_abs, render_module_plan_stub(slug, title))
            plan_created = True
        transaction.write(manifest_abs, candidate)
        if io.read_text(manifest_abs) != candidate:
            raise OSError(f"{MODULES_MANIFEST_DISPLAY} did not verify after write")
        # The module's two lifecycle sets are part of the create, not a
        # best-effort afterthought. The TypeScript flow scaffolded them AFTER
        # the manifest write and downgraded a failure to a warning, because it
        # had no way to undo the entry it had just written; this one does, so
        # a create either fully happened or did not happen at all.
        lifecycle = scaffold_module_lifecycle_sets(
            root, slug, title, plan_rel, transaction, io
        )
    except Exception as exc:  # noqa: BLE001 -- any writer failure rolls back
        rolled_back = transaction.rollback()
        return LifecycleResult(
            "create",
            slug,
            ok=False,
            write_failed=f"creating module {slug!r} failed: {_error_text(exc)}",
            rolled_back=rolled_back,
            details={"manifestRel": MODULES_MANIFEST_DISPLAY, "planRel": plan_rel},
        )

    return LifecycleResult(
        "create",
        slug,
        details={
            "title": title,
            "manifestRel": MODULES_MANIFEST_DISPLAY,
            "planRel": plan_rel,
            "manifestCreated": manifest_created,
            "planCreated": plan_created,
            "planSetSlug": lifecycle.plan_slug,
            "planSetCreated": lifecycle.plan_created,
            "decompositionSetSlug": lifecycle.decomposition_slug,
            "decompositionSetCreated": lifecycle.decomposition_created,
        },
    )


# ---------------------------------------------------------------------------
# rename
# ---------------------------------------------------------------------------


def rename_module(
    root: str,
    old_slug_raw: str,
    new_slug: Optional[str] = None,
    new_title: Optional[str] = None,
    io: Optional[ModuleIo] = None,
) -> LifecycleResult:
    """Transactionally rename a declared module (slug and/or title).

    Preflight (every refusal leaves the workspace byte-identical): the
    manifest declares *old_slug*; on a slug change the new slug validates and
    is unique, a collision with an UNDECLARED slug that already carries
    stamped sets is refused (silent history merge is the failure mode), and
    any affected set with a **running session** refuses the whole rename.

    Then the all-or-nothing apply: restamp every affected spec.md (slug
    change only), manifest LAST, each guarded before any byte is written --
    and on any failure every written file is rolled back.
    """
    io = io or ModuleIo()
    old_slug = (old_slug_raw or "").strip()

    classified = classify_manifest(root, io)
    if classified.kind == "invalid":
        return _refused("rename", old_slug, INVALID_MANIFEST_MESSAGE)
    entries = list(classified.entries)
    target = next((e for e in entries if e.slug == old_slug), None)
    if target is None:
        return _refused(
            "rename",
            old_slug,
            f'Module "{old_slug}" is not declared in {MODULES_MANIFEST_DISPLAY}.',
        )

    requested_slug = None if new_slug is None else new_slug.strip()
    requested_title = None if new_title is None else new_title.strip()
    slug_changing = bool(requested_slug) and requested_slug != old_slug
    resolved_slug = requested_slug if slug_changing else old_slug
    title_changing = bool(requested_title) and requested_title != target.title
    resolved_title = requested_title if title_changing else None

    if not slug_changing and not title_changing:
        return _refused(
            "rename",
            old_slug,
            "no change requested - the new slug and title match the current module.",
        )
    if slug_changing:
        slug_error = validate_new_module_slug(resolved_slug, [e.slug for e in entries])
        if slug_error:
            return _refused("rename", old_slug, slug_error)

    # One scan of every set: the affected (old-slug) sets, and any undeclared
    # new-slug history collision.
    sets_root = os.path.join(root, SESSION_SETS_REL)
    affected: List[Tuple[str, str, str]] = []
    collisions: List[str] = []
    for name in list_session_set_dir_names(root):
        set_dir = os.path.join(sets_root, name)
        spec_abs = os.path.join(set_dir, "spec.md")
        module, _kind = read_spec_module_and_kind(spec_abs)
        if module == old_slug:
            affected.append((name, set_dir, spec_abs))
        elif slug_changing and module == resolved_slug:
            collisions.append(name)

    if slug_changing and collisions:
        return _refused(
            "rename",
            old_slug,
            f'Renaming to "{resolved_slug}" would merge histories: {len(collisions)} '
            f"set(s) already declare module: {resolved_slug}, which is not a declared "
            f"module ({', '.join(collisions)}). Pick a different name.",
        )
    # The running-session refusal covers EVERY rename mode, not just a slug
    # change. A title-only rename writes docs/modules.yaml under a session
    # that is mid-flight, and the spec's rule ("delete and rename must refuse
    # a module with a running session") is unqualified -- the TypeScript
    # original gated this on the slug change and left the title path open.
    running = [name for name, set_dir, _ in affected if has_running_session(set_dir)]
    if running:
        return _refused(
            "rename",
            old_slug,
            f'Refusing to rename "{old_slug}" while {len(running)} affected set(s) '
            f"have a running session ({', '.join(running)}). Finish or close them "
            f"first.",
        )

    # Compute + guard EVERY write before touching disk.
    writes: List[Tuple[str, str, str]] = []  # (abs, next_text, label)
    restamped: List[str] = []
    if slug_changing:
        for name, _set_dir, spec_abs in affected:
            try:
                original = io.read_text(spec_abs)
            except OSError as exc:
                return _refused(
                    "rename", old_slug, f"could not read {name}'s spec.md: {_error_text(exc)}"
                )
            edit = restamp_module_in_spec_text(original, old_slug, resolved_slug)
            if edit.kind == "noop":
                continue
            if edit.kind == "refused":
                return _refused("rename", old_slug, f"{name}: {edit.reason}")
            try:
                assert_restamped_text_valid(original, edit.text, old_slug, resolved_slug)
            except SpecGuardError as exc:
                return _refused("rename", old_slug, f"{name}: {_error_text(exc)}")
            writes.append((spec_abs, edit.text, name))
            restamped.append(name)

    manifest_abs = manifest_path(root)
    try:
        manifest_original = io.read_text(manifest_abs)
    except OSError as exc:
        return _refused(
            "rename", old_slug, f"could not read {MODULES_MANIFEST_DISPLAY}: {_error_text(exc)}"
        )
    manifest_next = rewrite_manifest_entry_text(
        manifest_original,
        old_slug,
        new_slug=resolved_slug if slug_changing else None,
        new_title=resolved_title if title_changing else None,
    )
    if manifest_next is None:
        return _refused(
            "rename",
            old_slug,
            f"could not rewrite the {MODULES_MANIFEST_DISPLAY} entry for "
            f'"{old_slug}" while preserving formatting - edit the slug/title by hand.',
        )
    try:
        assert_renamed_manifest_parses(
            entries,
            manifest_next,
            old_slug,
            resolved_slug,
            resolved_title if title_changing else None,
        )
    except ManifestGuardError as exc:
        return _refused("rename", old_slug, f"{MODULES_MANIFEST_DISPLAY}: {_error_text(exc)}")
    # Manifest LAST: the specs restamp first, and the declaration flips only
    # once every spec is safely written.
    writes.append((manifest_abs, manifest_next, MODULES_MANIFEST_DISPLAY))

    transaction = _Transaction(io)
    try:
        for abs_path, next_text, label in writes:
            transaction.write(abs_path, next_text)
            if io.read_text(abs_path) != next_text:
                raise OSError(f"{label} did not verify after write")
    except Exception as exc:  # noqa: BLE001 -- any writer failure rolls back
        rolled_back = transaction.rollback()
        return LifecycleResult(
            "rename",
            old_slug,
            ok=False,
            write_failed=f"renaming {old_slug!r} failed: {_error_text(exc)}",
            rolled_back=rolled_back,
        )

    return LifecycleResult(
        "rename",
        old_slug,
        details={
            "newSlug": resolved_slug,
            "newTitle": resolved_title,
            "slugChanged": slug_changing,
            "titleChanged": title_changing,
            "restamped": restamped,
        },
    )


# ---------------------------------------------------------------------------
# delete
# ---------------------------------------------------------------------------


def delete_module(
    root: str, slug_raw: str, io: Optional[ModuleIo] = None
) -> LifecycleResult:
    """Delete a declared module, cancelling its non-terminal sets.

    Preflight refuses while any affected set has a running session, and
    computes + guards the manifest removal up front -- an unspliceable
    manifest refuses before any set is touched.

    Apply order: cancel non-terminal sets **through the sanctioned session-
    state writer**, then remove unstarted lifecycle scaffolds, then the
    manifest entry LAST. Each step is idempotent, so a run that stops partway
    is simply re-invoked; the module stays declared until everything else
    succeeded, so an interrupted run never half-deletes it.
    """
    io = io or ModuleIo()
    slug = (slug_raw or "").strip()

    classified = classify_manifest(root, io)
    if classified.kind == "invalid":
        return _refused("delete", slug, INVALID_MANIFEST_MESSAGE)
    entries = list(classified.entries)
    if not any(e.slug == slug for e in entries):
        return _refused(
            "delete",
            slug,
            f'Module "{slug}" is not declared in {MODULES_MANIFEST_DISPLAY}.',
        )

    classifications = classify_module_sets_for_deletion(root, slug)
    running = [c.name for c in classifications if has_running_session(c.dir)]
    if running:
        return _refused(
            "delete",
            slug,
            f'Refusing to delete "{slug}" while {len(running)} affected set(s) have a '
            f"running session ({', '.join(running)}). Finish or close them first.",
        )

    terminal = sorted(c.name for c in classifications if c.disposition == "terminal")
    to_cancel = [c for c in classifications if c.disposition == "cancel"]
    to_remove = [c for c in classifications if c.disposition == "remove"]

    manifest_abs = manifest_path(root)
    try:
        manifest_original = io.read_text(manifest_abs)
    except OSError as exc:
        return _refused(
            "delete", slug, f"could not read {MODULES_MANIFEST_DISPLAY}: {_error_text(exc)}"
        )
    manifest_next = remove_manifest_entry_text(manifest_original, slug)
    if manifest_next is None:
        return _refused(
            "delete",
            slug,
            f"could not remove the {MODULES_MANIFEST_DISPLAY} entry for "
            f'"{slug}" while preserving formatting - remove it by hand.',
        )
    try:
        assert_manifest_entry_removed(entries, manifest_next, slug)
    except ManifestGuardError as exc:
        return _refused("delete", slug, f"{MODULES_MANIFEST_DISPLAY}: {_error_text(exc)}")

    cancelled: List[str] = []
    removed: List[str] = []

    def partial(reason: str) -> LifecycleResult:
        return LifecycleResult(
            "delete",
            slug,
            ok=False,
            write_failed=reason,
            details={
                "cancelled": cancelled,
                "removed": removed,
                "terminal": terminal,
                "stillDeclared": True,
            },
        )

    reason = f"module {slug} deleted"
    for item in to_cancel:
        try:
            io.cancel_session_set(item.dir, reason)
        except Exception as exc:  # noqa: BLE001 -- report, never half-delete
            return partial(f"cancelling {item.name} failed: {_error_text(exc)}")
        cancelled.append(item.name)
    for item in to_remove:
        try:
            io.rmtree(item.dir)
        except Exception as exc:  # noqa: BLE001
            return partial(f"removing {item.name} failed: {_error_text(exc)}")
        removed.append(item.name)

    try:
        io.write_text(manifest_abs, manifest_next)
    except Exception as exc:  # noqa: BLE001
        return partial(
            f"{len(cancelled)} set(s) cancelled and {len(removed)} scaffold(s) removed, "
            f"but writing {MODULES_MANIFEST_DISPLAY} failed: {_error_text(exc)} - "
            f"re-run to finish removing the manifest entry."
        )

    return LifecycleResult(
        "delete",
        slug,
        details={"cancelled": cancelled, "removed": removed, "terminal": terminal},
    )


# ---------------------------------------------------------------------------
# assign-sets
# ---------------------------------------------------------------------------


def assign_sets(
    root: str,
    target_slug: str,
    set_names: Sequence[str],
    io: Optional[ModuleIo] = None,
) -> LifecycleResult:
    """Stamp ``module: <slug>`` into every named set's spec.md.

    Two-phase and fail-loud: phase 1 validates the ENTIRE batch (the target
    is manifest-declared and non-pseudo; every set exists, has a spliceable
    config block, and is not stamped to a different module), so any
    predictable refusal aborts with NOTHING written. Phase 2 writes the
    queued splices through the rollback transaction, so a failure part-way
    leaves no set stamped.

    A set already stamped to the SAME target is a no-op, counted rather than
    refused.
    """
    io = io or ModuleIo()
    slug = (target_slug or "").strip()
    if slug == "" or slug.lower() == "default":
        return _refused(
            "assign-sets", slug, f'"{target_slug}" is not a valid module target.'
        )

    classified = classify_manifest(root, io)
    if classified.kind == "invalid":
        return _refused("assign-sets", slug, INVALID_MANIFEST_MESSAGE)
    if slug not in classified.slugs:
        return _refused(
            "assign-sets",
            slug,
            f'Module "{slug}" is not declared in {MODULES_MANIFEST_DISPLAY}.',
        )
    if not set_names:
        return _refused("assign-sets", slug, "no session sets were named.")

    sets_root = os.path.join(root, SESSION_SETS_REL)
    queued: List[Tuple[str, str, str]] = []  # (name, spec_abs, next_text)
    already: List[str] = []
    for name in set_names:
        spec_abs = os.path.join(sets_root, name, "spec.md")
        try:
            original = io.read_text(spec_abs)
        except OSError as exc:
            return _refused(
                "assign-sets", slug, f"could not read {name}'s spec.md: {_error_text(exc)}"
            )
        edit = stamp_module_into_spec_text(original, slug)
        if edit.kind == "noop":
            already.append(name)
            continue
        if edit.kind == "refused":
            return _refused("assign-sets", slug, f"{name}: {edit.reason}")
        try:
            assert_stamped_text_valid(original, edit.text, slug)
        except SpecGuardError as exc:
            return _refused("assign-sets", slug, f"{name}: {_error_text(exc)}")
        queued.append((name, spec_abs, edit.text))

    stamped: List[str] = []
    transaction = _Transaction(io)
    try:
        for name, spec_abs, next_text in queued:
            transaction.write(spec_abs, next_text)
            if io.read_text(spec_abs) != next_text:
                raise OSError(f"{name}'s spec.md did not verify after write")
            stamped.append(name)
    except Exception as exc:  # noqa: BLE001 -- any writer failure rolls back
        rolled_back = transaction.rollback()
        return LifecycleResult(
            "assign-sets",
            slug,
            ok=False,
            write_failed=f"stamping module {slug!r} failed: {_error_text(exc)}",
            rolled_back=rolled_back,
            details={"alreadyAssigned": already},
        )

    return LifecycleResult(
        "assign-sets",
        slug,
        details={"stamped": stamped, "alreadyAssigned": already},
    )


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _describe(result: LifecycleResult) -> List[str]:
    """ASCII-only operator-facing lines (Windows cp1252 consoles, L-079-1)."""
    if result.refused is not None:
        return [f"[!] Refused: {result.refused}", "    Nothing was written."]
    if result.write_failed is not None:
        lines = [f"[!] {result.write_failed}"]
        if result.rolled_back is True:
            lines.append("    Every touched file was rolled back.")
        elif result.rolled_back is False:
            lines.append(
                "    A rollback write ALSO failed - reconcile from git before retrying."
            )
        if result.details.get("stillDeclared"):
            lines.append(
                f'    Module "{result.slug}" is still declared; re-run the command to '
                f"finish."
            )
        return lines
    detail = result.details
    if result.command == "create":
        return [
            f'[x] Created module "{result.slug}" ({detail["title"]}).',
            f"    {detail['manifestRel']}: "
            + ("created + entry added" if detail["manifestCreated"] else "entry added"),
            f"    {detail['planRel']}: "
            + ("plan stub written" if detail["planCreated"] else "existing plan kept"),
            f"    next steps: {detail['planSetSlug']}"
            + ("" if detail["planSetCreated"] else " (existing)")
            + f" and {detail['decompositionSetSlug']}"
            + ("" if detail["decompositionSetCreated"] else " (existing)"),
        ]
    if result.command == "rename":
        lines = [f'[x] Renamed module "{result.slug}".']
        if detail["slugChanged"]:
            lines.append(f"    slug:  {result.slug} -> {detail['newSlug']}")
        if detail["titleChanged"]:
            lines.append(f"    title: {detail['newTitle']}")
        restamped = detail["restamped"]
        lines.append(
            f"    restamped {len(restamped)} set(s)"
            + (f": {', '.join(restamped)}" if restamped else "")
        )
        return lines
    if result.command == "delete":
        return [
            f'[x] Deleted module "{result.slug}".',
            f"    cancelled: {', '.join(detail['cancelled']) or '(none)'}",
            f"    removed:   {', '.join(detail['removed']) or '(none)'}",
            f"    untouched: {', '.join(detail['terminal']) or '(none)'}",
        ]
    return [
        f'[x] Assigned {len(detail["stamped"])} set(s) to module "{result.slug}".',
        f"    stamped: {', '.join(detail['stamped']) or '(none)'}",
        f"    already assigned: {', '.join(detail['alreadyAssigned']) or '(none)'}",
    ]


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="ai_router.modules",
        description=(
            "Transactional module lifecycle operations against docs/modules.yaml. "
            "Exit 3 = refused (nothing written); exit 4 = write failure "
            "(create/rename roll back; delete leaves the module declared and is "
            "safely re-runnable)."
        ),
    )
    parser.add_argument(
        "--repo-root",
        default=None,
        help="Repository root holding docs/modules.yaml. Default: the current directory.",
    )
    parser.add_argument("--json", action="store_true", help="Machine-readable JSON output.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    create = subparsers.add_parser("create", help="Scaffold a new module.")
    create.add_argument("--slug", required=True, help="Module slug (kebab-case).")
    create.add_argument("--title", default=None, help="Display title. Default: the slug.")

    rename = subparsers.add_parser("rename", help="Rename a declared module.")
    rename.add_argument("--slug", required=True, help="The module's current slug.")
    rename.add_argument("--new-slug", default=None, help="New slug (kebab-case).")
    rename.add_argument("--new-title", default=None, help="New display title.")

    delete = subparsers.add_parser("delete", help="Delete a declared module.")
    delete.add_argument("--slug", required=True, help="The module to delete.")

    assign = subparsers.add_parser(
        "assign-sets", help="Stamp existing session sets into a module."
    )
    assign.add_argument("--slug", required=True, help="The target module.")
    assign.add_argument(
        "--set",
        dest="sets",
        action="append",
        default=[],
        metavar="NAME",
        help="Session-set directory name. Repeat for each set.",
    )
    return parser


def main(argv: Optional[List[str]] = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    root = os.path.abspath(args.repo_root or os.getcwd())

    if args.command == "create":
        result = create_module(root, args.slug, args.title)
    elif args.command == "rename":
        result = rename_module(root, args.slug, args.new_slug, args.new_title)
    elif args.command == "delete":
        result = delete_module(root, args.slug)
    else:
        result = assign_sets(root, args.slug, args.sets)

    if args.json:
        print(json.dumps(result.to_dict(), indent=2))
    else:
        stream = sys.stdout if result.exit_code == 0 else sys.stderr
        for line in _describe(result):
            print(line, file=stream)
    return result.exit_code


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())


__all__ = [
    "EXECUTION_ARTIFACT_FILENAMES",
    "INVALID_MANIFEST_MESSAGE",
    "MODULES_MANIFEST_DISPLAY",
    "MODULES_YAML_TEMPLATE",
    "MODULE_SLUG_RE",
    "LifecycleScaffoldError",
    "LifecycleSets",
    "ManifestClassification",
    "ManifestGuardError",
    "ModuleEntry",
    "ModuleIo",
    "LifecycleResult",
    "SetDisposition",
    "SpecGuardError",
    "TextEdit",
    "assert_appended_manifest_parses",
    "assert_manifest_entry_removed",
    "assert_renamed_manifest_parses",
    "assert_restamped_text_valid",
    "assert_stamped_text_valid",
    "assign_sets",
    "classify_manifest",
    "classify_module_sets_for_deletion",
    "create_module",
    "default_module_plan_path",
    "delete_module",
    "has_running_session",
    "infer_legacy_status",
    "list_session_set_dir_names",
    "load_lifecycle_template",
    "main",
    "manifest_path",
    "parse_manifest_entries",
    "raw_session_set_status",
    "read_cancellation_state",
    "read_spec_module_and_kind",
    "remove_manifest_entry_text",
    "rename_module",
    "render_lifecycle_spec",
    "render_module_manifest_entry",
    "render_module_plan_stub",
    "replace_empty_modules_list",
    "restamp_module_in_spec_text",
    "rewrite_manifest_entry_text",
    "scaffold_module_lifecycle_sets",
    "stamp_module_into_spec_text",
    "validate_new_module_slug",
]
