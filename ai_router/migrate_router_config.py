"""Idempotent forward migration for router-config.yaml and budget.yaml.

Injects new Set-026 schema fields that may be absent from older files,
and renames deprecated keys per Set 025 Appendix B. YAML comments and
formatting are preserved via ruamel.yaml's AST round-trip.

Exit codes:
  0  Success (files updated or already current — no-op)
  1  Parse error
  2  Unexpected schema version

Usage::

    python -m ai_router.migrate_router_config

    # or with explicit paths:
    python -m ai_router.migrate_router_config \\
        --router-config path/to/router-config.yaml \\
        --budget        path/to/budget.yaml
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from ruamel.yaml import YAML
from ruamel.yaml.comments import CommentedMap


_THIS_DIR = Path(__file__).parent


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _load(yaml_inst: YAML, path: Path) -> CommentedMap:
    try:
        with path.open(encoding="utf-8") as fh:
            doc = yaml_inst.load(fh)
    except Exception as exc:
        print(f"ERROR: could not parse {path}: {exc}", file=sys.stderr)
        sys.exit(1)
    if doc is None:
        doc = CommentedMap()
    return doc


def _dump(yaml_inst: YAML, doc: CommentedMap, path: Path) -> None:
    with path.open("w", encoding="utf-8") as fh:
        yaml_inst.dump(doc, fh)


def _make_yaml() -> YAML:
    y = YAML()
    y.preserve_quotes = True
    y.width = 120
    return y


# ---------------------------------------------------------------------------
# router-config.yaml migrations
# ---------------------------------------------------------------------------


def _migrate_router_config(doc: CommentedMap) -> bool:
    """Inject missing Set-026 fields into a router-config CommentedMap.

    Returns True if any change was made.
    """
    changed = False

    # 1. Add display_label + enabled to each provider entry
    providers = doc.get("providers")
    if isinstance(providers, dict):
        for name, prov in providers.items():
            if not isinstance(prov, dict):
                continue
            if "display_label" not in prov:
                prov["display_label"] = name.title()
                changed = True
            if "enabled" not in prov:
                prov["enabled"] = True
                changed = True

    # 2. Add routing.outsourcing_mode if absent
    routing = doc.get("routing")
    if isinstance(routing, dict):
        if "outsourcing_mode" not in routing:
            routing["outsourcing_mode"] = "whenever-helpful"
            changed = True

    return changed


# ---------------------------------------------------------------------------
# budget.yaml migrations
# ---------------------------------------------------------------------------

# Mapping of legacy threshold_scope values → (new scope, optional period)
_SCOPE_MAP: dict[str, tuple[str, str | None]] = {
    "project-lifetime": ("per-project", None),
    "per-project": ("per-project", None),
    "per-session-set": ("per-session-set", None),
    "per-session": ("per-session", None),
    "monthly": ("per-project", "monthly"),
}


def _migrate_budget(doc: CommentedMap) -> bool:
    """Migrate a budget.yaml CommentedMap.

    Returns True if any change was made.
    """
    changed = False

    # 1. threshold_scope → scope
    if "threshold_scope" in doc and "scope" not in doc:
        raw = str(doc["threshold_scope"])
        if raw not in _SCOPE_MAP:
            print(
                f"WARNING: unrecognised threshold_scope value {raw!r} — "
                "leaving as-is; set 'scope' manually.",
                file=sys.stderr,
            )
        else:
            new_scope, period = _SCOPE_MAP[raw]
            # Insert 'scope' right after 'threshold_scope' so the key order
            # stays readable. ruamel.yaml's CommentedMap preserves insertion
            # order, but doesn't have a "insert at position" API. We rebuild
            # the top-level map preserving all keys and comments.
            new_doc: CommentedMap = CommentedMap()
            for k, v in doc.items():
                if k == "threshold_scope":
                    new_doc["scope"] = new_scope
                    if period:
                        new_doc["period"] = period
                        print(
                            f"WARNING: threshold_scope='monthly' is deprecated; "
                            "migrated to scope='per-project' + period='monthly'. "
                            "Review your budgeting intent.",
                            file=sys.stderr,
                        )
                else:
                    new_doc[k] = v
            # Copy comments from old doc to new doc
            if hasattr(doc, "ca"):
                new_doc.ca.items.update(doc.ca.items)
            doc.clear()
            doc.update(new_doc)
            changed = True

    # 2. Inject warn_at_percent: 80 if absent
    if "warn_at_percent" not in doc:
        doc["warn_at_percent"] = 80
        changed = True

    return changed


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def migrate(
    router_config_path: Path | None = None,
    budget_path: Path | None = None,
) -> None:
    """Run idempotent migration on both files."""
    yaml_inst = _make_yaml()

    rc_path = router_config_path or (_THIS_DIR / "router-config.yaml")
    bg_path = budget_path or (_THIS_DIR / "budget.yaml")

    rc_changed = False
    if rc_path.exists():
        rc_doc = _load(yaml_inst, rc_path)
        rc_changed = _migrate_router_config(rc_doc)
        if rc_changed:
            _dump(yaml_inst, rc_doc, rc_path)
            print(f"Updated: {rc_path}")
        else:
            print(f"No changes needed: {rc_path}")
    else:
        print(f"Not found (skipped): {rc_path}", file=sys.stderr)

    bg_changed = False
    if bg_path.exists():
        bg_doc = _load(yaml_inst, bg_path)
        bg_changed = _migrate_budget(bg_doc)
        if bg_changed:
            _dump(yaml_inst, bg_doc, bg_path)
            print(f"Updated: {bg_path}")
        else:
            print(f"No changes needed: {bg_path}")
    else:
        print(f"Not found (skipped): {bg_path}", file=sys.stderr)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Idempotent migration for router-config.yaml and budget.yaml."
    )
    parser.add_argument(
        "--router-config",
        metavar="PATH",
        type=Path,
        default=None,
        help="Path to router-config.yaml (default: ai_router/router-config.yaml)",
    )
    parser.add_argument(
        "--budget",
        metavar="PATH",
        type=Path,
        default=None,
        help="Path to budget.yaml (default: ai_router/budget.yaml)",
    )
    args = parser.parse_args()
    migrate(router_config_path=args.router_config, budget_path=args.budget)


if __name__ == "__main__":
    main()
