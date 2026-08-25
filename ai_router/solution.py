"""Solution manifest: the one declaration of what a solution is made of.

A *module* (``ai_router.modules``) groups work inside one repository. A
*component* is a different thing: something with its own contract, its own
version, and consumers that break when it changes. The two manifests coexist
deliberately and do not overlap — a module answers "whose work is this", a
component answers "what does this promise and who depends on it".

The manifest is a YAML mapping with ``solution`` and ``components``. Every
component declares what it depends on; nothing declares what depends on *it*.
``used_by`` is derived, never written, because two directions maintained by
hand disagree eventually and the disagreement is silent.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath
from typing import Optional

import yaml

EXIT_OK = 0
EXIT_REFUSED = 1
EXIT_USAGE = 2

MANIFEST_RELPATH = Path("solution.yaml")

KINDS = ("library", "integration")

#: The six steps. There is no seventh: feedback loops run all along the way,
#: and a step moving backwards is an ordinary event, not an exception.
STEPS = (
    "plan",
    "decompose",
    "contracts",
    "mocks",
    "integration",
    "build",
)
STEP_TITLES = {
    "plan": "Plan and design",
    "decompose": "Break it into components",
    "contracts": "Write down the promises",
    "mocks": "Build stand-ins",
    "integration": "Build the whole thing on stand-ins",
    "build": "Replace the stand-ins for real",
}

#: What a step owes, in the words a reviewer is given. Declared here so the
#: review prompt and the tree cannot describe the same step differently.
STEP_DELIVERABLES = {
    "plan": (
        "A statement of the objective a reader can act on: what the solution "
        "is for, who uses it, what it must do, and what is deliberately out "
        "of scope. Vagueness that would let two people build different "
        "things is the defect to look for."
    ),
    "decompose": (
        "More than one candidate decomposition, each in plain language, with "
        "one recommended and the reasoning given. Components should hide "
        "decisions likely to change rather than mirror processing steps. A "
        "single candidate presented as the only option is a defect."
    ),
    "contracts": (
        "A contract per component carrying what a signature cannot: what must "
        "be true going in, what is guaranteed coming out, what is kept on "
        "purpose, side effects, how it fails, and what callers must not "
        "depend on. A promise nothing can prove is the defect to look for."
    ),
    "mocks": (
        "A stand-in per component that satisfies its contract and nothing "
        "more. A mock that is right by accident, or that promises behaviour "
        "the contract does not, is the defect to look for."
    ),
    "integration": (
        "The whole solution running on stand-ins alone, end to end. What it "
        "proves is that the contracts compose. A gap the integration papers "
        "over is a contract that is wrong."
    ),
    "build": (
        "A real component replacing its stand-in and passing the same "
        "contract checks the stand-in passed. A real component held to a "
        "weaker bar than its mock is the defect to look for."
    ),
}

#: The two steps a developer signs off. Derived from the step, never set per
#: call: an approval gate a caller can switch off is one a caller switches off.
#: Step 3 is deliberately absent — the developer sees the contracts and may
#: object, but the objection does not hold the work.
APPROVAL_STEPS = ("plan", "decompose")

#: The generated, readable form of a contract sits beside its source. Derived,
#: never declared, for the reason ``used_by`` is derived: two paths kept by
#: hand disagree eventually and the disagreement is silent.
CONTRACT_DOC_SUFFIX = ".md"


def contract_doc_path(contract: Optional[str]) -> Optional[str]:
    """``components/x/contract.yaml`` -> ``components/x/contract.md``.

    ``None`` when no contract is declared, and unchanged when the declared
    path is already the generated form.
    """
    if not contract:
        return None
    p = PurePosixPath(contract)
    if p.suffix == CONTRACT_DOC_SUFFIX:
        return contract
    return str(p.with_suffix(CONTRACT_DOC_SUFFIX))


KNOWN_SOLUTION_KEYS = ("name", "title", "step")
KNOWN_COMPONENT_KEYS = (
    "name", "kind", "title", "source", "contract", "artifact", "version",
    "step", "dependsOn", "owner",
)


class ManifestError(Exception):
    """The manifest cannot be trusted. Always names the offending entry."""


@dataclass(frozen=True)
class Component:
    name: str
    kind: str
    title: str
    source: Optional[str] = None
    contract: Optional[str] = None
    artifact: Optional[str] = None
    version: Optional[str] = None
    step: str = "plan"
    owner: Optional[str] = None
    depends_on: tuple = ()
    #: Derived from every other component's ``depends_on``.
    used_by: tuple = field(default=(), compare=False)


@dataclass(frozen=True)
class Solution:
    name: str
    title: str
    step: str
    components: tuple

    def get(self, name: str) -> Component:
        for c in self.components:
            if c.name == name:
                return c
        raise KeyError(name)

    @property
    def integration(self) -> tuple:
        return tuple(c for c in self.components if c.kind == "integration")


def manifest_path(workspace_root) -> Path:
    return Path(workspace_root) / MANIFEST_RELPATH


def _reject_unknown(entry: dict, known: tuple, where: str) -> None:
    """An unknown key is rejected rather than ignored.

    A misspelled ``dependsOn`` that is silently dropped leaves a component
    looking like it depends on nothing, which is exactly the answer this
    manifest exists to get right.
    """
    unknown = [k for k in entry if k not in known]
    if unknown:
        raise ManifestError(
            f"{where}: unknown key(s) {', '.join(sorted(unknown))}. "
            f"Known keys: {', '.join(known)}"
        )


def _check_cycles(edges: dict) -> None:
    """Depth-first, reporting the actual cycle rather than just its existence."""
    WHITE, GREY, BLACK = 0, 1, 2
    colour = {n: WHITE for n in edges}

    def walk(node, trail):
        colour[node] = GREY
        for nxt in edges[node]:
            if colour[nxt] == GREY:
                loop = trail[trail.index(nxt):] + [nxt]
                raise ManifestError(
                    "dependency cycle: " + " -> ".join(loop)
                    + ". Components form a directed graph; a cycle means two "
                    "of these are really one component."
                )
            if colour[nxt] == WHITE:
                walk(nxt, trail + [nxt])
        colour[node] = BLACK

    for node in edges:
        if colour[node] == WHITE:
            walk(node, [node])


def parse(document: dict) -> Solution:
    if not isinstance(document, dict):
        raise ManifestError("manifest must be a mapping")

    head = document.get("solution")
    if not isinstance(head, dict):
        raise ManifestError("manifest needs a 'solution' mapping")
    _reject_unknown(head, KNOWN_SOLUTION_KEYS, "solution")
    for required in ("name", "title"):
        if not head.get(required):
            raise ManifestError(f"solution: '{required}' is required")
    step = head.get("step", "plan")
    if step not in STEPS:
        raise ManifestError(
            f"solution: step '{step}' is not one of {', '.join(STEPS)}")

    raw = document.get("components")
    if not isinstance(raw, list) or not raw:
        raise ManifestError("manifest needs a non-empty 'components' list")

    parsed, seen = [], set()
    for i, entry in enumerate(raw):
        where = f"components[{i}]"
        if not isinstance(entry, dict):
            raise ManifestError(f"{where}: must be a mapping")
        _reject_unknown(entry, KNOWN_COMPONENT_KEYS, where)
        name = entry.get("name")
        if not name:
            raise ManifestError(f"{where}: 'name' is required")
        if name in seen:
            raise ManifestError(f"{where}: duplicate component '{name}'")
        seen.add(name)
        kind = entry.get("kind", "library")
        if kind not in KINDS:
            raise ManifestError(
                f"{where} ({name}): kind '{kind}' is not one of {', '.join(KINDS)}")
        cstep = entry.get("step", "plan")
        if cstep not in STEPS:
            raise ManifestError(
                f"{where} ({name}): step '{cstep}' is not one of {', '.join(STEPS)}")
        deps = entry.get("dependsOn") or []
        if not isinstance(deps, list):
            raise ManifestError(f"{where} ({name}): dependsOn must be a list")
        parsed.append({
            "name": name, "kind": kind,
            "title": entry.get("title") or name,
            "source": entry.get("source"), "contract": entry.get("contract"),
            "artifact": entry.get("artifact"), "version": entry.get("version"),
            "step": cstep, "owner": entry.get("owner"),
            "depends_on": tuple(deps),
        })

    edges = {c["name"]: list(c["depends_on"]) for c in parsed}
    for c in parsed:
        for dep in c["depends_on"]:
            if dep not in seen:
                raise ManifestError(
                    f"{c['name']}: depends on '{dep}', which is not a component "
                    "in this solution")
    _check_cycles(edges)

    used_by = {name: [] for name in seen}
    for c in parsed:
        for dep in c["depends_on"]:
            used_by[dep].append(c["name"])

    components = tuple(
        Component(**{k: v for k, v in c.items()},
                  used_by=tuple(sorted(used_by[c["name"]])))
        for c in parsed
    )
    return Solution(name=head["name"], title=head["title"], step=step,
                    components=components)


def load(workspace_root) -> Solution:
    path = manifest_path(workspace_root)
    if not path.is_file():
        raise ManifestError(f"no solution manifest at {path}")
    try:
        document = yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as e:
        raise ManifestError(f"{path}: {e}") from e
    return parse(document)


def as_dict(solution: Solution) -> dict:
    """The shape the extension reads. Derived fields included."""
    return {
        "solution": {
            "name": solution.name, "title": solution.title,
            "step": solution.step, "stepTitle": STEP_TITLES[solution.step],
            "stepNumber": STEPS.index(solution.step) + 1,
            "stepCount": len(STEPS),
        },
        "components": [
            {
                "name": c.name, "kind": c.kind, "title": c.title,
                "source": c.source, "contract": c.contract,
                "contractDoc": contract_doc_path(c.contract),
                "artifact": c.artifact, "version": c.version,
                "step": c.step, "stepTitle": STEP_TITLES[c.step],
                "stepNumber": STEPS.index(c.step) + 1,
                "owner": c.owner,
                "dependsOn": list(c.depends_on),
                "usedBy": list(c.used_by),
            }
            for c in solution.components
        ],
    }


def _main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="python -m ai_router.solution")
    ap.add_argument("command", choices=("show", "check"))
    ap.add_argument("--workspace-root", default=".")
    args = ap.parse_args(argv)

    try:
        solution = load(args.workspace_root)
    except ManifestError as e:
        print(f"refused: {e}", file=sys.stderr)
        return EXIT_REFUSED

    if args.command == "show":
        print(json.dumps(as_dict(solution), indent=2))
        return EXIT_OK

    # This command reads the manifest and nothing else. It printed the
    # declared step in the same shape `workflow status` prints live progress,
    # so the two disagreed on screen with nothing to say which was which --
    # a reader spent twelve steps trying to work out who was lying.
    print(f"{solution.title} ({solution.name})")
    print("  the manifest is valid")
    print(f"  {len(solution.components)} components, no cycles")
    for c in solution.components:
        used = ", ".join(c.used_by) if c.used_by else "nothing yet"
        print(f"    {c.name:<22} {c.kind:<12} used by: {used}")
    print(f"  declared starting step: {STEP_TITLES[solution.step]}. This is "
          "where the manifest says work begins,")
    print("  not where it has got to. For that, run "
          "`python -m ai_router.workflow status`.")
    return EXIT_OK


if __name__ == "__main__":
    raise SystemExit(_main())
