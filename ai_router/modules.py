"""Module manifest CLI: create one ``docs/modules.yaml`` entry.

The manifest is a YAML mapping with a ``modules`` list; each entry is
``{slug, title, planPath?}``. Readers (the VS Code extension) tolerate
extra keys (codeRoots, touches), so this writer emits only what the
caller supplied and preserves existing entries and their key order
verbatim. Create-only by design: rename, delete, and reorganization stay
manual edits to the file.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import yaml

EXIT_OK = 0
EXIT_REFUSED = 1
EXIT_USAGE = 2

MANIFEST_RELPATH = Path("docs") / "modules.yaml"


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


def create(workspace_root, slug: str, title: str, plan_path=None) -> int:
    path = manifest_path(workspace_root)
    try:
        doc = load_manifest(path)
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
    doc["modules"].append(entry)
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
    args = parser.parse_args(argv)
    if not Path(args.workspace_root).is_dir():
        print(f"modules: not a directory: {args.workspace_root}",
              file=sys.stderr)
        return EXIT_USAGE
    return create(args.workspace_root, args.slug, args.title,
                  args.plan_path)


if __name__ == "__main__":
    raise SystemExit(main())
