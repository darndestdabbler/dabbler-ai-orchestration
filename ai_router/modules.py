"""Module manifest: the one declaration of what a module is.

The manifest is a YAML mapping with a ``modules`` list; each entry is
``{slug, title?, planPath?, codeRoots?, touches?, specSections?,
contextAssets?}``. ``codeRoots`` bounds the module on disk,
``specSections`` maps reference spec sections to it, and
``contextAssets`` names its schemas/config/migrations. The extension's
reader takes the keys it knows and ignores the rest, so the extension
keeps rendering entries carrying the newer keys.

An unknown key is rejected rather than ignored: a misspelled
``codeRoot`` that is silently dropped leaves the module bounded by
something other than what was written, which is the failure this
manifest exists to prevent.

Create-only by design: rename, delete, and reorganization stay manual
edits to the file.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import yaml

EXIT_OK = 0
EXIT_REFUSED = 1
EXIT_USAGE = 2

MANIFEST_RELPATH = Path("docs") / "modules.yaml"

KNOWN_ENTRY_KEYS = (
    "slug", "title", "planPath", "codeRoots", "touches", "specSections",
    "contextAssets",
)

_LIST_KEYS = ("codeRoots", "touches", "specSections", "contextAssets")


@dataclass(frozen=True)
class ModuleEntry:
    """One validated manifest entry, in Python spelling."""

    slug: str
    title: str
    plan_path: Optional[str] = None
    code_roots: tuple = ()
    touches: tuple = ()
    spec_sections: tuple = ()
    context_assets: tuple = ()


def manifest_path(workspace_root) -> Path:
    return Path(workspace_root) / MANIFEST_RELPATH


def load_manifest(path: Path) -> dict:
    """The parsed manifest mapping. A missing file is the designed empty
    state (``{"modules": []}``); a bare ``modules:`` (YAML null) is a valid
    empty list. Unparseable YAML, a non-mapping document, or a ``modules``
    value that is neither null nor a list raises ``ValueError`` — a config
    error must refuse loud, never be silently rewritten."""
    if not path.is_file():
        return {"modules": []}
    try:
        doc = yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        raise ValueError(f"{path} is not valid YAML: {exc}") from exc
    if doc is None:
        doc = {}
    if not isinstance(doc, dict):
        raise ValueError(
            f"{path} must be a YAML mapping with a 'modules' list"
        )
    modules = doc.get("modules")
    if modules is None:
        doc["modules"] = []
    elif not isinstance(modules, list):
        raise ValueError(f"'modules' in {path} must be a list")
    return doc


def _string_list(value, where: str, key: str) -> tuple:
    if value is None:
        return ()
    if not isinstance(value, list):
        raise ValueError(f"{where}: '{key}' must be a list of strings")
    out = []
    for item in value:
        if not isinstance(item, str) or not item.strip():
            raise ValueError(
                f"{where}: '{key}' must contain only non-empty strings"
            )
        out.append(item.strip())
    return tuple(out)


def parse_entries(doc: dict, source="docs/modules.yaml") -> list:
    """Validated entries in file order. Rejects an unknown key, a
    non-mapping entry, a missing slug, a duplicate slug, and a
    mistyped list — never silently drops one."""
    entries: list = []
    seen: set = set()
    for index, raw in enumerate(doc.get("modules") or []):
        where = f"{source}: modules[{index}]"
        if not isinstance(raw, dict):
            raise ValueError(f"{where} must be a mapping")
        unknown = sorted(set(raw) - set(KNOWN_ENTRY_KEYS))
        if unknown:
            raise ValueError(
                f"{where} has unknown key(s) {', '.join(unknown)}. "
                f"Known keys: {', '.join(KNOWN_ENTRY_KEYS)}."
            )
        slug = raw.get("slug")
        if not isinstance(slug, str) or not slug.strip():
            raise ValueError(f"{where} needs a non-empty string 'slug'")
        slug = slug.strip()
        if slug in seen:
            raise ValueError(f"{source}: duplicate slug {slug!r}")
        seen.add(slug)
        title = raw.get("title")
        if title is not None and not isinstance(title, str):
            raise ValueError(f"{where}: 'title' must be a string")
        plan_path = raw.get("planPath")
        if plan_path is not None and not isinstance(plan_path, str):
            raise ValueError(f"{where}: 'planPath' must be a string")
        lists = {
            key: _string_list(raw.get(key), where, key) for key in _LIST_KEYS
        }
        entries.append(ModuleEntry(
            slug=slug,
            title=(title or "").strip() or slug,
            plan_path=(plan_path or "").strip() or None,
            code_roots=lists["codeRoots"],
            touches=lists["touches"],
            spec_sections=lists["specSections"],
            context_assets=lists["contextAssets"],
        ))
    return entries


def load_entries(workspace_root) -> list:
    """Validated entries for a workspace. An absent manifest is the
    designed empty state; an invalid one raises ``ValueError``."""
    path = manifest_path(workspace_root)
    return parse_entries(load_manifest(path), source=str(path))


def find_entry(workspace_root, slug: str):
    """The entry for *slug*, or ``None`` when the manifest does not
    declare it — an unresolvable slug is the caller's cue to fall back,
    never to guess at what the module covers."""
    if not slug:
        return None
    wanted = slug.strip()
    for entry in load_entries(workspace_root):
        if entry.slug == wanted:
            return entry
    return None


def create(workspace_root, slug: str, title: str, plan_path=None,
           code_roots=None, spec_sections=None, context_assets=None) -> int:
    path = manifest_path(workspace_root)
    try:
        doc = load_manifest(path)
        parse_entries(doc, source=str(path))
    except ValueError as exc:
        print(f"modules create: refused -- {exc}", file=sys.stderr)
        return EXIT_REFUSED
    existing = {
        entry.get("slug")
        for entry in doc["modules"] if isinstance(entry, dict)
    }
    if slug in existing:
        print(
            f"modules create: refused -- slug {slug!r} already exists "
            f"in {path}", file=sys.stderr,
        )
        return EXIT_REFUSED
    entry = {"slug": slug, "title": title}
    if plan_path:
        entry["planPath"] = plan_path
    for key, values in (
        ("codeRoots", code_roots),
        ("specSections", spec_sections),
        ("contextAssets", context_assets),
    ):
        if values:
            entry[key] = list(values)
    doc["modules"].append(entry)
    try:
        parse_entries(doc, source=str(path))
    except ValueError as exc:
        print(f"modules create: refused -- {exc}", file=sys.stderr)
        return EXIT_REFUSED
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="") as f:
        yaml.safe_dump(doc, f, sort_keys=False, allow_unicode=True,
                       default_flow_style=False)
    print(json.dumps(entry))
    return EXIT_OK


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="python -m ai_router.modules")
    sub = parser.add_subparsers(dest="command", required=True)
    p_create = sub.add_parser(
        "create", help="append one module entry to docs/modules.yaml"
    )
    p_create.add_argument("workspace_root",
                          help="workspace root containing docs/")
    p_create.add_argument("--slug", required=True,
                          help="machine identity (kebab-case)")
    p_create.add_argument("--title", required=True,
                          help="display name the Explorer shows")
    p_create.add_argument("--plan-path",
                          help="module plan path, relative to the root")
    p_create.add_argument("--code-root", action="append", dest="code_roots",
                          help="repo-relative directory that bounds the "
                               "module on disk (repeatable)")
    p_create.add_argument("--spec-section", action="append",
                          dest="spec_sections",
                          help="reference spec section as PATH or "
                               "PATH#anchor (repeatable)")
    p_create.add_argument("--context-asset", action="append",
                          dest="context_assets",
                          help="schema/config/migration path or glob "
                               "(repeatable)")
    args = parser.parse_args(argv)
    if not Path(args.workspace_root).is_dir():
        print(f"modules: not a directory: {args.workspace_root}",
              file=sys.stderr)
        return EXIT_USAGE
    return create(args.workspace_root, args.slug, args.title,
                  args.plan_path, args.code_roots, args.spec_sections,
                  args.context_assets)


if __name__ == "__main__":
    raise SystemExit(main())
