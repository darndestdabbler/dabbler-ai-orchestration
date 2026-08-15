"""The portable walkthrough scenario model (Set 113 Session 2).

One authored source renders the manual UAT walkthrough, the training
document, the captions and the chapter metadata. A video and an
instruction sheet that drift apart are worse than no video, because the
reviewer trusts the video and then cannot reproduce it -- so the four
renderings are generated, never hand-written, and
``ai_router.scenario_render --check`` refuses a rendering that no longer
matches its source.

**The seam that matters is the driver quarantine.** Round 3 of this
set's consults rejected a published recorder-plugin contract as
premature abstraction and named this instead: Playwright selectors and
any other target-specific mechanics live under ``drivers:``, which the
renderers never receive. The portable half is what a human reads and
what every rendering is derived from; the driver half is how a machine
reproduces it on one particular target. The separation is structural,
not a convention -- :meth:`Scenario.portable_payload` omits ``drivers``
entirely, so the digest stamped into every rendering cannot move when a
selector changes, and a driver-only edit leaves all four renderings
byte-identical. :mod:`ai_router.scenario_lint` is the advisory second
line: it flags selector-shaped text that leaked into the portable half.

**Reaching an arbitrary point means replaying a prefix.** The operator
cut the synced window on 2026-08-10 with one condition -- very clear
step-by-step instructions to reach any point in the scenario. Honestly
read, that is a replay from the known baseline or from the nearest
named ``checkpoint`` before the step, never random access to a stateful
UI. The model carries checkpoints so the renderers can say so plainly
rather than implying a seek bar.

**Closed vocabularies, on purpose.** Unknown top-level keys and unknown
step keys are refused rather than ignored, the same discipline Session 1
applied to the UAT record: a field nobody validates is how a
self-assessed confidence score, a debt ledger, or a stray driver detail
arrives without anyone deciding to add it. Adding a field is a code
change here, which is the point.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple

import yaml

#: The file every scenario directory is keyed on.
SCENARIO_FILENAME = "scenario.yaml"

#: Stable ids are lowercase kebab-case. They key the step-event stream
#: Session 3 emits, the caption cues and the chapter markers, so they
#: have to survive being pasted into a filename, a URL fragment and a
#: JSON key without transformation.
ID_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")

#: Top-level keys a scenario may declare. Anything else is refused.
SCENARIO_KEYS = frozenset(
    {
        "id",
        "title",
        "summary",
        "audience",
        "prerequisites",
        "baseline",
        "reset",
        "recovery",
        "steps",
        "drivers",
    }
)

#: Required top-level keys.
REQUIRED_SCENARIO_KEYS = ("id", "title", "summary", "audience", "baseline", "steps")

#: Step keys. ``id``, ``title``, ``action`` and ``expect`` are required;
#: the rest are optional.
STEP_KEYS = frozenset(
    {
        "id",
        "title",
        "action",
        "expect",
        "narration",
        "seconds",
        "checkpoint",
        "focus",
    }
)

REQUIRED_STEP_KEYS = ("id", "title", "action", "expect")

#: Keys of the ``baseline`` block.
BASELINE_KEYS = frozenset({"description", "setup", "observable"})

#: Keys of one ``recovery`` entry.
RECOVERY_KEYS = frozenset({"symptom", "action"})

#: Keys of one ``baseline.setup`` entry.
SETUP_KEYS = frozenset({"cwd", "command"})

#: Default on-screen seconds for a step that does not declare its own.
DEFAULT_STEP_SECONDS = 8

#: WebVTT's cue-timing arrow. A caption payload containing it can be read
#: as a timing line by a strict parser, which silently reshapes the cue.
#: Refused where a string can become a caption -- ``narration``, and
#: ``action`` because it is the caption fallback -- with the fix named.
VTT_ARROW = "-->"

#: The operator's hosting convention -- "very short (and they should be
#: ... less than one minute, if possible)" -- doubles as a design check:
#: a scenario that cannot be told in a minute is probably two scenarios.
#: It is a WARNING and never a refusal. This set's whole finding is that
#: a gate which forces an unpleasant outcome gets routed around rather
#: than satisfied, and a hard cap on an authored length would be exactly
#: that.
SUGGESTED_MAX_SECONDS = 60


class ScenarioError(ValueError):
    """A scenario source that cannot be trusted to render.

    A ``ValueError`` subclass so existing ``except ValueError`` handlers
    keep working, and a named type so a CLI can render it specially.
    """

    def __init__(self, message: str, source: Optional[Path] = None) -> None:
        self.source = source
        where = f" ({source})" if source is not None else ""
        super().__init__(f"{message}{where}")


@dataclass(frozen=True)
class SetupCommand:
    """One command that moves a reader from nothing to the baseline."""

    command: str
    cwd: Optional[str] = None

    def payload(self) -> Dict[str, Any]:
        out: Dict[str, Any] = {"command": self.command}
        if self.cwd is not None:
            out["cwd"] = self.cwd
        return out


@dataclass(frozen=True)
class Baseline:
    """The known starting state every replay begins from.

    ``observable`` is the load-bearing field: a baseline a reader cannot
    confirm they have reached is a baseline they cannot replay from.
    """

    description: str
    observable: str
    setup: Tuple[SetupCommand, ...] = ()

    def payload(self) -> Dict[str, Any]:
        return {
            "description": self.description,
            "observable": self.observable,
            "setup": [command.payload() for command in self.setup],
        }


@dataclass(frozen=True)
class Recovery:
    """A named way the walk goes wrong, and the way back."""

    symptom: str
    action: str

    def payload(self) -> Dict[str, Any]:
        return {"symptom": self.symptom, "action": self.action}


@dataclass(frozen=True)
class Step:
    """One portable step: what to do, and what you should then see.

    ``action`` and ``expect`` are what make the walkthrough usable with
    no video at all. ``narration`` is the caption line -- it falls back
    to ``action`` so a scenario is never silently uncaptioned.

    ``focus`` names, in prose, what the reader's eye should be on. It is
    the portable half of the operator's 2026-08-15 ruling that emphasis
    is a driver concern and not a capture concern: the *what* is
    authored here, the *how* (a selector to outline, a bounding box to
    record) belongs in a driver block.
    """

    id: str
    title: str
    action: str
    expect: str
    narration: Optional[str] = None
    seconds: int = DEFAULT_STEP_SECONDS
    checkpoint: Optional[str] = None
    focus: Optional[str] = None

    @property
    def caption(self) -> str:
        """The line a caption cue carries."""
        return self.narration or self.action

    def payload(self) -> Dict[str, Any]:
        out: Dict[str, Any] = {
            "id": self.id,
            "title": self.title,
            "action": self.action,
            "expect": self.expect,
            "seconds": self.seconds,
        }
        if self.narration is not None:
            out["narration"] = self.narration
        if self.checkpoint is not None:
            out["checkpoint"] = self.checkpoint
        if self.focus is not None:
            out["focus"] = self.focus
        return out


@dataclass(frozen=True)
class Scenario:
    """One authored micro-workflow, and the single source of four documents."""

    id: str
    title: str
    summary: str
    audience: str
    baseline: Baseline
    steps: Tuple[Step, ...]
    prerequisites: Tuple[str, ...] = ()
    reset: Optional[str] = None
    recovery: Tuple[Recovery, ...] = ()
    #: Target-specific mechanics, opaque to this module and NEVER passed
    #: to a renderer. See the module docstring.
    drivers: Mapping[str, Any] = field(default_factory=dict)

    @property
    def total_seconds(self) -> int:
        return sum(step.seconds for step in self.steps)

    @property
    def checkpoints(self) -> Tuple[Step, ...]:
        """Steps an author named as a resumable point, in order."""
        return tuple(step for step in self.steps if step.checkpoint)

    def step_index(self, step_id: str) -> int:
        """1-based position of *step_id*, for "replay steps 1 to N" prose."""
        for position, step in enumerate(self.steps, start=1):
            if step.id == step_id:
                return position
        raise KeyError(step_id)

    def portable_payload(self) -> Dict[str, Any]:
        """The half every rendering is derived from. ``drivers`` is absent.

        This is the canonical form the digest is taken over, so it is
        built from the PARSED model rather than the raw YAML: reflowing
        a block scalar or reordering two keys in the source must not
        restale four committed documents, and changing a selector must
        not either.
        """
        return {
            "id": self.id,
            "title": self.title,
            "summary": self.summary,
            "audience": self.audience,
            "prerequisites": list(self.prerequisites),
            "baseline": self.baseline.payload(),
            "reset": self.reset,
            "recovery": [entry.payload() for entry in self.recovery],
            "steps": [step.payload() for step in self.steps],
        }

    def portable_digest(self) -> str:
        """``sha256:...`` over the portable half, stamped into every rendering."""
        canonical = json.dumps(
            self.portable_payload(),
            sort_keys=True,
            ensure_ascii=False,
            separators=(",", ":"),
        )
        return "sha256:" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    def warnings(self) -> List[str]:
        """Advisory notes. Never a refusal -- see ``SUGGESTED_MAX_SECONDS``."""
        notes: List[str] = []
        if self.total_seconds > SUGGESTED_MAX_SECONDS:
            notes.append(
                f"scenario runs {self.total_seconds}s, over the "
                f"{SUGGESTED_MAX_SECONDS}s design check -- a scenario that "
                "cannot be told in a minute is usually two scenarios"
            )
        return notes


# ---------------------------------------------------------------------------
# Parsing
#
# "Readers lenient, writer strict" is the repo's rule for state files; a
# scenario is neither -- it is an authored SOURCE, and the failure mode
# that matters is a typo that silently drops a step from a document a
# human is about to trust. So every refusal below names the key and the
# fix, and nothing is coerced.
# ---------------------------------------------------------------------------


def _require_mapping(value: Any, what: str, source: Optional[Path]) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise ScenarioError(f"{what} must be a mapping, got {type(value).__name__}", source)
    return value


def _reject_unknown(
    block: Mapping[str, Any], allowed: frozenset, what: str, source: Optional[Path]
) -> None:
    unknown = sorted(str(key) for key in set(block) - allowed)
    if unknown:
        raise ScenarioError(
            f"{what} carries unknown key(s) {unknown}; allowed keys are "
            f"{sorted(allowed)}. Adding a field is a code change, on purpose",
            source,
        )


def _require_text(
    block: Mapping[str, Any], key: str, what: str, source: Optional[Path]
) -> str:
    value = block.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ScenarioError(f"{what} needs a non-empty string '{key}'", source)
    return value.strip()


def _optional_text(
    block: Mapping[str, Any], key: str, what: str, source: Optional[Path]
) -> Optional[str]:
    if key not in block or block[key] is None:
        return None
    value = block[key]
    if not isinstance(value, str) or not value.strip():
        raise ScenarioError(
            f"{what} declares '{key}' but it is not a non-empty string; "
            "omit the key instead of leaving it blank",
            source,
        )
    return value.strip()


def _require_id(value: str, what: str, source: Optional[Path]) -> str:
    if not ID_PATTERN.match(value):
        raise ScenarioError(
            f"{what} '{value}' is not lowercase kebab-case "
            f"(pattern {ID_PATTERN.pattern}); ids key caption cues, chapter "
            "markers and the Session 3 step-event stream",
            source,
        )
    return value


def _parse_string_list(value: Any, what: str, source: Optional[Path]) -> Tuple[str, ...]:
    if value is None:
        return ()
    if not isinstance(value, Sequence) or isinstance(value, str):
        raise ScenarioError(f"{what} must be a list of strings", source)
    out: List[str] = []
    for index, entry in enumerate(value, start=1):
        if not isinstance(entry, str) or not entry.strip():
            raise ScenarioError(f"{what} entry {index} must be a non-empty string", source)
        out.append(entry.strip())
    return tuple(out)


def _parse_setup(value: Any, source: Optional[Path]) -> Tuple[SetupCommand, ...]:
    if value is None:
        return ()
    if not isinstance(value, Sequence) or isinstance(value, str):
        raise ScenarioError("baseline.setup must be a list of commands", source)
    out: List[SetupCommand] = []
    for index, entry in enumerate(value, start=1):
        what = f"baseline.setup[{index}]"
        block = _require_mapping(entry, what, source)
        _reject_unknown(block, SETUP_KEYS, what, source)
        out.append(
            SetupCommand(
                command=_require_text(block, "command", what, source),
                cwd=_optional_text(block, "cwd", what, source),
            )
        )
    return tuple(out)


def _parse_baseline(value: Any, source: Optional[Path]) -> Baseline:
    block = _require_mapping(value, "baseline", source)
    _reject_unknown(block, BASELINE_KEYS, "baseline", source)
    return Baseline(
        description=_require_text(block, "description", "baseline", source),
        observable=_require_text(block, "observable", "baseline", source),
        setup=_parse_setup(block.get("setup"), source),
    )


def _parse_recovery(value: Any, source: Optional[Path]) -> Tuple[Recovery, ...]:
    if value is None:
        return ()
    if not isinstance(value, Sequence) or isinstance(value, str):
        raise ScenarioError("recovery must be a list of symptom/action entries", source)
    out: List[Recovery] = []
    for index, entry in enumerate(value, start=1):
        what = f"recovery[{index}]"
        block = _require_mapping(entry, what, source)
        _reject_unknown(block, RECOVERY_KEYS, what, source)
        out.append(
            Recovery(
                symptom=_require_text(block, "symptom", what, source),
                action=_require_text(block, "action", what, source),
            )
        )
    return tuple(out)


def _parse_seconds(block: Mapping[str, Any], what: str, source: Optional[Path]) -> int:
    if "seconds" not in block or block["seconds"] is None:
        return DEFAULT_STEP_SECONDS
    value = block["seconds"]
    # bool is an int subclass, and `seconds: true` is a typo, not a duration.
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise ScenarioError(f"{what} 'seconds' must be a positive whole number", source)
    return value


def _parse_steps(value: Any, source: Optional[Path]) -> Tuple[Step, ...]:
    if not isinstance(value, Sequence) or isinstance(value, str) or not value:
        raise ScenarioError("steps must be a non-empty list", source)
    out: List[Step] = []
    seen: Dict[str, int] = {}
    for index, entry in enumerate(value, start=1):
        what = f"steps[{index}]"
        block = _require_mapping(entry, what, source)
        _reject_unknown(block, STEP_KEYS, what, source)
        for key in REQUIRED_STEP_KEYS:
            if key not in block:
                raise ScenarioError(f"{what} is missing required key '{key}'", source)
        step_id = _require_id(_require_text(block, "id", what, source), f"{what} id", source)
        if step_id in seen:
            raise ScenarioError(
                f"{what} repeats step id '{step_id}' (first used at step "
                f"{seen[step_id]}); ids must be unique or a caption cue and a "
                "chapter marker cannot address one step",
                source,
            )
        seen[step_id] = index
        narration = _optional_text(block, "narration", what, source)
        if narration is not None:
            _reject_vtt_arrow(narration, what, "narration", source)
        out.append(
            Step(
                id=step_id,
                title=_require_text(block, "title", what, source),
                action=_reject_vtt_arrow(
                    _require_text(block, "action", what, source), what, "action", source
                ),
                expect=_require_text(block, "expect", what, source),
                narration=narration,
                seconds=_parse_seconds(block, what, source),
                checkpoint=_optional_text(block, "checkpoint", what, source),
                focus=_optional_text(block, "focus", what, source),
            )
        )
    return tuple(out)


def _reject_vtt_arrow(text: str, what: str, key: str, source: Optional[Path]) -> str:
    """Refuse ``-->`` in a string that can become a WebVTT cue payload."""
    if VTT_ARROW in text:
        raise ScenarioError(
            f"{what} '{key}' contains '{VTT_ARROW}', which WebVTT reads as a "
            "cue-timing arrow -- this text becomes a caption. Write '->' or "
            "an em dash instead",
            source,
        )
    return text


class _StrictLoader(yaml.SafeLoader):
    """``SafeLoader`` that refuses duplicate mapping keys.

    PyYAML's default is last-one-wins, silently. A scenario that declares
    ``action`` twice, or two ``steps`` blocks, would lose the earlier value
    with no diagnostic -- exactly the "typo that silently drops content"
    this parser exists to catch. Everything else about ``SafeLoader`` is
    unchanged.
    """


def _construct_mapping_no_duplicates(loader: "_StrictLoader", node: Any) -> Dict[Any, Any]:
    mapping: Dict[Any, Any] = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=False)
        if key in mapping:
            raise ScenarioError(
                f"duplicate key '{key}' on line {key_node.start_mark.line + 1}; "
                "YAML would silently keep only the last one and drop the "
                "content above it"
            )
        mapping[key] = loader.construct_object(value_node, deep=False)
    return mapping


_StrictLoader.add_constructor(
    yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG,
    _construct_mapping_no_duplicates,
)


def _parse_drivers(value: Any, source: Optional[Path]) -> Mapping[str, Any]:
    """Validate only the SHAPE. The contents are deliberately opaque.

    Round 3 refused a published recorder-plugin contract as premature
    abstraction: nothing here knows what Playwright, OBS or a future
    backend needs, and guessing would freeze a shape before a second
    driver exists to disagree with it. What IS enforced is that driver
    detail is addressable per driver name, so a renderer never has to
    reason about it and a reader can see which targets a scenario claims.
    """
    if value is None:
        return {}
    block = _require_mapping(value, "drivers", source)
    for name in block:
        if not isinstance(name, str) or not ID_PATTERN.match(name):
            raise ScenarioError(
                f"drivers key '{name}' is not lowercase kebab-case; each key "
                "names one target-specific driver",
                source,
            )
    return dict(block)


def parse_scenario(text: str, source: Optional[Path] = None) -> Scenario:
    """Parse and validate scenario YAML. Raises :class:`ScenarioError`."""
    try:
        raw = yaml.load(text, Loader=_StrictLoader)
    except ScenarioError as exc:
        # The duplicate-key constructor raises through the loader; re-raise
        # it carrying the source path the caller passed in.
        raise ScenarioError(str(exc), source) from exc
    except yaml.YAMLError as exc:  # pragma: no cover - message passthrough
        raise ScenarioError(f"scenario is not valid YAML: {exc}", source) from exc
    block = _require_mapping(raw, "scenario", source)
    _reject_unknown(block, SCENARIO_KEYS, "scenario", source)
    for key in REQUIRED_SCENARIO_KEYS:
        if key not in block:
            raise ScenarioError(f"scenario is missing required key '{key}'", source)
    return Scenario(
        id=_require_id(_require_text(block, "id", "scenario", source), "scenario id", source),
        title=_require_text(block, "title", "scenario", source),
        summary=_require_text(block, "summary", "scenario", source),
        audience=_require_text(block, "audience", "scenario", source),
        baseline=_parse_baseline(block.get("baseline"), source),
        steps=_parse_steps(block.get("steps"), source),
        prerequisites=_parse_string_list(block.get("prerequisites"), "prerequisites", source),
        reset=_optional_text(block, "reset", "scenario", source),
        recovery=_parse_recovery(block.get("recovery"), source),
        drivers=_parse_drivers(block.get("drivers"), source),
    )


def load_scenario(path: Path) -> Scenario:
    """Read and parse the scenario source at *path*."""
    path = Path(path)
    if path.is_dir():
        path = path / SCENARIO_FILENAME
    if not path.exists():
        raise ScenarioError(f"no scenario source at {path}", path)
    return parse_scenario(path.read_text(encoding="utf-8"), source=path)


def discover_scenarios(root: Path) -> List[Path]:
    """Every ``scenario.yaml`` under *root*, sorted for stable output."""
    return sorted(Path(root).rglob(SCENARIO_FILENAME))
