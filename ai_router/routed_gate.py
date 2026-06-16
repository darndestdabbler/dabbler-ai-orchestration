"""Set 068 S6 -- the per-session routed-verification gating predicate.

The Set 068 S4 keep/demote/retire decision
(``docs/session-sets/068-cadence-study-and-contract-gate/routed-fate-decision.md``)
**DEMOTED** per-session routed verification from mandatory-on-every-session to a
**gated** check: it fires on a session only when a programmatic blast-radius /
coupling predicate over the session diff is true. This module implements that
predicate -- the cut-over the S4 transition guard deferred to S6, now that the
S5 contract-test / CDC gate (the replacement floor) is live and stable.

The predicate is built **on top of** :func:`ai_router.blast_radius.classify_paths`
(the ``P_set = any(P_task)`` core cross-artifact / shared-schema / wiring / index
predicate from Set 066) plus the additional **session-level** triggers the S4
decision named (``routed-fate-decision.md`` section 3):

- changes spanning **multiple modules / packages** (cross-module coupling);
- a **broad** diff (many files touched at once);
- **build / CI / config** changes;
- the changed surface **lacks a deterministic contract probe** (operator-declared);
- an explicit **high-blast-radius / hotfix** marking, or a session that **follows
  a failed verification / fix loop**.

Two load-bearing design commitments, both from the S4 consensus:

1. **Programmatic, not a per-session feeling.** Both consulted engines warned
   that "decide per session whether it's risky enough" reintroduces the exact
   failure mode the mandatory gate existed to prevent -- the most dangerous
   sessions are the ones whose risk is *under-recognized at the time*. So the
   trigger is a deterministic diff heuristic; the only operator inputs are the
   two honestly-declared facts the diff cannot show (``--contract-uncovered`` and
   the ``--high-blast`` / ``--post-failed-loop`` overrides), and those can only
   *raise* the verdict to REQUIRED, never lower it.
2. **Biased toward REQUIRED when in doubt.** A false REQUIRED costs one extra
   cross-provider review; a false SKIP silently drops the safety net on a session
   that needed it. Only a genuinely small, single-module, probe-covered diff with
   no contract/coupling signal bypasses the routed call.

Output is ASCII-only (the cp1252 console convention).

CLI::

    python -m ai_router.routed_gate <path> [<path> ...]
    python -m ai_router.routed_gate --json <path> ...
    python -m ai_router.routed_gate --contract-uncovered <path> ...
    python -m ai_router.routed_gate --high-blast <path> ...
    python -m ai_router.routed_gate --post-failed-loop <path> ...

The CLI exits ``0`` when routed verification is REQUIRED and ``10`` when it may
be SKIPPED, so a Step-6 wrapper can branch on the exit code (``--json`` always
exits 0; read the ``required`` field). The paths are typically
``git diff --name-only <base>...HEAD`` for the session under review.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from typing import List, Optional, Sequence, Tuple

try:  # pragma: no cover - import shim (mirrors blast_radius.py)
    from blast_radius import classify_paths  # type: ignore[import-not-found]
except ImportError:  # pragma: no cover - import shim
    from .blast_radius import classify_paths  # type: ignore[no-redef]


# ---------------------------------------------------------------------------
# Trigger names (stable identifiers for the machine-readable output)
# ---------------------------------------------------------------------------

TRIGGER_BLAST_RADIUS = "blast-radius"
TRIGGER_MULTI_MODULE = "multi-module"
TRIGGER_BREADTH = "breadth"
TRIGGER_BUILD_CI_CONFIG = "build-ci-config"
TRIGGER_CONTRACT_UNCOVERED = "contract-uncovered"
TRIGGER_HIGH_BLAST = "high-blast"
TRIGGER_POST_FAILED_LOOP = "post-failed-loop"

ROUTED_GATE_TRIGGERS = (
    TRIGGER_BLAST_RADIUS,
    TRIGGER_MULTI_MODULE,
    TRIGGER_BREADTH,
    TRIGGER_BUILD_CI_CONFIG,
    TRIGGER_CONTRACT_UNCOVERED,
    TRIGGER_HIGH_BLAST,
    TRIGGER_POST_FAILED_LOOP,
)

# A diff touching at least this many distinct files is "broad" enough that a
# single-file bypass no longer applies, even within one module. Conservative
# (small) by design -- the bypass is meant only for genuinely tiny diffs.
BREADTH_THRESHOLD = 4

# Path substrings that mark a build / CI / config change. Matched against a
# normalized (lowercased, forward-slashed) path. Kept legible/tunable as a
# module constant. Some overlap with blast_radius INDEX/WIRING signals is fine
# -- this layer additionally catches the CI-workflow surface blast_radius does
# not model (``.github/workflows`` etc.).
_BUILD_CI_CONFIG_SIGNALS = (
    ".github/",
    "/workflows/",
    "pyproject.toml",
    "setup.cfg",
    "setup.py",
    "tox.ini",
    "dockerfile",
    "docker-compose",
    "tsconfig",
    "esbuild",
    ".eslintrc",
    "vsce",
    "/ci/",
    "ci.yml",
    "ci.yaml",
    "release.yml",
    "release.yaml",
    "test.yml",
    "test.yaml",
    # The repo's own runtime config surfaces -- covered DIRECTLY here (not only
    # indirectly via the blast_radius INDEX signal) so an isolated config-only
    # diff trips this named trigger, matching the documented "config changes".
    "router-config.yaml",
    "router-config.yml",
    "router-config.local.yaml",
    "package.json",
    "package-lock.json",
    ".pre-commit-config",
)

# Exit codes for the CLI branch-on-code contract.
EXIT_REQUIRED = 0
EXIT_SKIP = 10


def _normalize_path(path: str) -> str:
    return path.replace("\\", "/").strip().lower()


def _module_root(path: str) -> str:
    """Return the top-level module / package segment of a normalized path.

    ``ai_router/foo/bar.py`` -> ``ai_router``; ``docs/x.md`` -> ``docs``; a
    bare top-level file ``setup.py`` -> ``setup.py`` (its own root). Used to
    count how many distinct modules a diff spans.
    """
    p = _normalize_path(path)
    return p.split("/", 1)[0] if "/" in p else p


@dataclass(frozen=True)
class RoutedGateDecision:
    """The result of evaluating the per-session routed-verification predicate."""

    required: bool
    triggers: Tuple[str, ...]
    reasons: Tuple[str, ...]
    files: int
    modules: Tuple[str, ...]

    def render(self) -> str:
        """Return an ASCII-only, operator-facing report."""
        lines = ["Per-session routed-verification gate (Set 068 DEMOTE policy)"]
        verdict = "REQUIRED" if self.required else "SKIP (bypass)"
        lines.append(f"  Verdict: {verdict}")
        lines.append(
            f"  Diff: {self.files} file(s) across {len(self.modules)} module(s)"
        )
        mods = ", ".join(self.modules) if self.modules else "(none)"
        lines.append(f"  Modules: {mods}")
        trig = ", ".join(self.triggers) if self.triggers else "(none tripped)"
        lines.append(f"  Triggers: {trig}")
        lines.append("  Reasons:")
        if self.reasons:
            for reason in self.reasons:
                lines.append(f"    - {reason}")
        else:
            lines.append(
                "    - small, single-module, probe-covered diff with no "
                "coupling signal"
            )
        if self.required:
            lines.append(
                "  ACTION: run the per-session cross-provider routed "
                "verification (Step 6)."
            )
        else:
            lines.append(
                "  ACTION: the per-session routed call may be skipped; the "
                "end-of-set"
            )
            lines.append(
                "          path-aware critique + contract-test gate remain the "
                "primary surface."
            )
        lines.append(
            "  NOTE: gated, not gone -- a tripped predicate is the only path to "
            "a routed"
        )
        lines.append(
            "        call now; an explicit override can only RAISE the verdict, "
            "never lower it."
        )
        return "\n".join(lines)


def evaluate_routed_gate(
    changed_paths: Sequence[str],
    *,
    contract_uncovered: bool = False,
    high_blast: bool = False,
    post_failed_loop: bool = False,
    breadth_threshold: int = BREADTH_THRESHOLD,
) -> RoutedGateDecision:
    """Decide whether per-session routed verification is required for a session.

    ``changed_paths`` is the session diff (e.g. ``git diff --name-only``).
    The three boolean flags are the honestly-declared facts the diff cannot
    show; each can only **raise** the verdict to REQUIRED, never lower it.

    Required iff **any** trigger fires:

    - **blast-radius** -- ``blast_radius.classify_paths(...).p_set`` is true
      (a cross-artifact / shared-schema / wiring / index change);
    - **multi-module** -- the diff spans >= 2 distinct module roots;
    - **breadth** -- the diff touches >= ``breadth_threshold`` distinct files;
    - **build-ci-config** -- any path is a build / CI / config file;
    - **contract-uncovered** / **high-blast** / **post-failed-loop** -- the
      corresponding override flag is set.

    A diff that trips none -- small, single-module, probe-covered, no coupling
    signal -- bypasses the routed call.
    """
    # A nonsensical threshold (<= 0) would make the breadth trigger fire on
    # every non-empty diff. That fails SAFE (more REQUIRED, never fewer), but a
    # zero/negative threshold is meaningless input -- coerce it to the minimum
    # sensible value so the trigger means "a diff of at least this many files".
    if breadth_threshold < 1:
        breadth_threshold = 1

    # De-duplicate while preserving first-seen order (a diff may list a path
    # twice; counts must be over distinct files).
    seen: List[str] = []
    for raw in changed_paths:
        norm = _normalize_path(str(raw))
        if norm and norm not in seen:
            seen.append(norm)

    file_count = len(seen)
    modules = tuple(dict.fromkeys(_module_root(p) for p in seen))

    triggers: List[str] = []
    reasons: List[str] = []

    def _trip(trigger: str, reason: str) -> None:
        if trigger not in triggers:
            triggers.append(trigger)
        reasons.append(reason)

    # 1. The Set 066 core blast-radius predicate (cross-artifact/schema/wiring/index).
    if seen:
        br = classify_paths(seen)
        if br.p_set:
            cats = ", ".join(br.categories) if br.categories else "(unnamed)"
            _trip(
                TRIGGER_BLAST_RADIUS,
                f"blast-radius core predicate trips: {cats}",
            )

    # 2. Cross-module span.
    if len(modules) >= 2:
        _trip(
            TRIGGER_MULTI_MODULE,
            "diff spans multiple modules: {" + ", ".join(modules) + "}",
        )

    # 3. Breadth.
    if file_count >= breadth_threshold:
        _trip(
            TRIGGER_BREADTH,
            f"broad diff: {file_count} files (>= {breadth_threshold})",
        )

    # 4. Build / CI / config surface.
    for path in seen:
        for signal in _BUILD_CI_CONFIG_SIGNALS:
            if signal in path:
                _trip(
                    TRIGGER_BUILD_CI_CONFIG,
                    f"build/CI/config change: '{path}' matches '{signal}'",
                )
                break

    # 5. Operator-declared overrides (each can only RAISE to REQUIRED).
    if contract_uncovered:
        _trip(
            TRIGGER_CONTRACT_UNCOVERED,
            "operator declared the changed surface lacks a deterministic "
            "contract probe",
        )
    if high_blast:
        _trip(
            TRIGGER_HIGH_BLAST,
            "session marked high-blast-radius / hotfix",
        )
    if post_failed_loop:
        _trip(
            TRIGGER_POST_FAILED_LOOP,
            "session follows a failed verification / fix loop",
        )

    # Preserve canonical trigger order for stable output.
    ordered = tuple(t for t in ROUTED_GATE_TRIGGERS if t in triggers)
    return RoutedGateDecision(
        required=bool(ordered),
        triggers=ordered,
        reasons=tuple(reasons),
        files=file_count,
        modules=modules,
    )


def _result_to_dict(result: RoutedGateDecision) -> dict:
    return {
        "required": result.required,
        "triggers": list(result.triggers),
        "reasons": list(result.reasons),
        "files": result.files,
        "modules": list(result.modules),
    }


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m ai_router.routed_gate",
        description=(
            "Decide whether per-session routed verification is REQUIRED for a "
            "session, from its changed paths (Set 068 DEMOTE policy). Exit 0 = "
            "REQUIRED, 10 = may SKIP; --json always exits 0."
        ),
    )
    parser.add_argument(
        "paths",
        nargs="*",
        help="changed file paths (e.g. `git diff --name-only <base>...HEAD`)",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="emit one machine-readable JSON object on stdout (exit 0)",
    )
    parser.add_argument(
        "--contract-uncovered",
        action="store_true",
        help="the changed surface lacks a deterministic contract probe (raises to REQUIRED)",
    )
    parser.add_argument(
        "--high-blast",
        action="store_true",
        help="mark the session high-blast-radius / hotfix (raises to REQUIRED)",
    )
    parser.add_argument(
        "--post-failed-loop",
        action="store_true",
        help="the session follows a failed verification/fix loop (raises to REQUIRED)",
    )
    parser.add_argument(
        "--breadth-threshold",
        type=int,
        default=BREADTH_THRESHOLD,
        help=f"distinct-file count that trips the breadth trigger (default {BREADTH_THRESHOLD})",
    )
    args = parser.parse_args(argv)
    result = evaluate_routed_gate(
        args.paths,
        contract_uncovered=args.contract_uncovered,
        high_blast=args.high_blast,
        post_failed_loop=args.post_failed_loop,
        breadth_threshold=args.breadth_threshold,
    )
    if args.json:
        print(json.dumps(_result_to_dict(result), indent=2))
        return 0
    print(result.render())
    return EXIT_REQUIRED if result.required else EXIT_SKIP


if __name__ == "__main__":  # pragma: no cover - CLI entry
    sys.exit(main())
