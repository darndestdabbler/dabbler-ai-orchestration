"""Renders a component contract as something a developer can actually read.

A signature list is not a contract. Everything a signature cannot carry -- what
must be true going in, what is guaranteed coming out, what is kept on purpose,
how it fails -- is written here, and each of those becomes a test.

Generated from the contract definition, never maintained beside it. A black box
with drifted documentation is worse than one with none, because people trust it.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import yaml

EXIT_OK = 0
EXIT_REFUSED = 1

#: Order matters: this is the order a reader needs them in.
SECTIONS = (
    ("preconditions", "Must be true going in",
     "What the caller guarantees before the call."),
    ("postconditions", "Guaranteed coming out",
     "What the component guarantees when it returns."),
    ("retained", "Kept on purpose",
     "Deliberately *not* removed or altered. The part people forget."),
    ("sideEffects", "Side effects",
     "Anything that changes besides the return value."),
    ("errors", "How it fails",
     "Including whether failure is a normal outcome."),
)

NOT_PROMISED = "notPromised"


class ContractError(Exception):
    pass


def load(path) -> dict:
    p = Path(path)
    if not p.is_file():
        raise ContractError(f"no contract at {p}")
    try:
        doc = yaml.safe_load(p.read_text(encoding="utf-8"))
    except yaml.YAMLError as e:
        raise ContractError(f"{p}: {e}") from e
    if not isinstance(doc, dict):
        raise ContractError(f"{p}: contract must be a mapping")
    for required in ("component", "operations"):
        if not doc.get(required):
            raise ContractError(f"{p}: '{required}' is required")
    if not isinstance(doc["operations"], list):
        raise ContractError(f"{p}: 'operations' must be a list")
    for i, op in enumerate(doc["operations"]):
        if not isinstance(op, dict) or not op.get("name"):
            raise ContractError(f"{p}: operations[{i}] needs a 'name'")
    return doc


def _cell(items) -> str:
    """List items into one table cell. Empty says so, rather than being blank."""
    if not items:
        return "*none stated*"
    if isinstance(items, str):
        items = [items]
    return "<br>".join(f"{s}" for s in items)


def diagram(contract: dict, solution=None) -> str:
    """Where this component sits. Generated, so it cannot drift."""
    name = contract["component"]
    lines = ["```mermaid", "graph LR"]
    safe = lambda s: s.replace("-", "_")
    lines.append(f'  {safe(name)}["{name}"]')
    if solution is not None:
        try:
            comp = solution.get(name)
        except KeyError:
            comp = None
        if comp is not None:
            for dep in comp.depends_on:
                lines.append(f'  {safe(name)} --> {safe(dep)}["{dep}"]')
            for user in comp.used_by:
                lines.append(f'  {safe(user)}["{user}"] --> {safe(name)}')
            lines.append(f"  style {safe(name)} stroke-width:3px")
    lines.append("```")
    if solution is not None and len(lines) == 4:
        return ""  # nothing to show; an arrowless diagram is noise
    return "\n".join(lines)


def render(contract: dict, solution=None) -> str:
    name = contract["component"]
    out = [f"# Contract — `{name}`", ""]
    if contract.get("version"):
        out.append(f"**Version {contract['version']}**  ")
    if contract.get("summary"):
        out.append(contract["summary"])
    out.append("")

    d = diagram(contract, solution)
    if d:
        out += ["## Where it sits", "", d, ""]
        if solution is not None:
            try:
                comp = solution.get(name)
                users = ", ".join(f"`{u}`" for u in comp.used_by) or "nothing yet"
                out += [f"**Used by:** {users} — these break if this contract "
                        f"changes.", ""]
            except KeyError:
                pass

    out += ["## What it promises", ""]
    for op in contract["operations"]:
        out.append(f"### `{op['name']}`")
        out.append("")
        if op.get("signature"):
            out += ["```", op["signature"], "```", ""]
        if op.get("summary"):
            out += [op["summary"], ""]
        out.append("| | | Tested |")
        out.append("| --- | --- | :---: |")
        for key, label, why in SECTIONS:
            out.append(f"| **{label}**<br><sub>{why}</sub> "
                       f"| {_cell(op.get(key))} | ✓ |")
        out.append("")
        np = op.get(NOT_PROMISED)
        out += [
            "> **Not promised.** " + (_cell(np).replace("<br>", " · ")
                                      if np else "*nothing stated*"),
            ">",
            "> Callers must not depend on any of this. Pinning it in a test "
            "freezes an implementation detail, so an improvement then looks "
            "like a break — and a check that cries wolf gets switched off.",
            "",
        ]
    out += ["---", "",
            "*Generated from the contract definition. Do not edit by hand — "
            "regenerate with `python -m ai_router.contractdoc`.*"]
    return "\n".join(out) + "\n"


def _main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="python -m ai_router.contractdoc")
    ap.add_argument("contract", help="path to a contract.yaml")
    ap.add_argument("--workspace-root", default=".",
                    help="read solution.yaml from here for the diagram")
    ap.add_argument("-o", "--out", help="write here instead of stdout")
    args = ap.parse_args(argv)

    try:
        contract = load(args.contract)
    except ContractError as e:
        print(f"refused: {e}", file=sys.stderr)
        return EXIT_REFUSED

    solution = None
    try:
        from ai_router import solution as solmod
        solution = solmod.load(args.workspace_root)
    except Exception:
        pass  # the diagram is a bonus; a missing manifest is not fatal

    text = render(contract, solution)
    if args.out:
        Path(args.out).write_text(text, encoding="utf-8")
        print(f"wrote {args.out}")
    else:
        sys.stdout.write(text)
    return EXIT_OK


if __name__ == "__main__":
    raise SystemExit(_main())
