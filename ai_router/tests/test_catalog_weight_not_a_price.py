"""Set 131: the probe sample is not a price, and nothing may read it as one.

``ai_router/copilot-catalog.lock`` carries a per-model probe sample,
populated from the premium-request count the Copilot CLI reported for the
ONE short call that confirmed the model (``copilot_catalog.discover_catalog``).
Set 078 named it ``premium_request_weight``; the name said "weight" and the
value was a single call's consumption. Set 131 renamed it to
``probe_premium_requests`` and pinned the rationale to the declaration.

Measured on the seat store 2026-08-14, the sample disagrees with the
authoritative ``request_multiplier`` for the entire OpenAI family --
``gpt-5.5`` probes as ``0`` and bills at ``7.5``, the second-highest
multiplier on the seat -- while the Anthropic and Google entries happen to
agree, which is precisely what makes the field look trustworthy.

The defect is latent: nothing reads the field for selection today. Set 131
widened delegation, which is what would create such a reader. These tests
are the tripwire, and most of them are deliberately STRUCTURAL: the fix is
a rename plus a prohibition plus a documented rationale, and all three are
the sort of thing a later refactor drops without noticing.

Per L-112-1 each rule is planted from both sides where a look-alike exists:
the transport-metadata key ``premium_requests`` in ``cli_transport.py`` is
a legitimate neighbour that must NOT trip the prohibition scan.
"""

from __future__ import annotations

import ast
import re
from pathlib import Path

import pytest

import copilot_catalog

AI_ROUTER = Path(copilot_catalog.__file__).resolve().parent
CATALOG_PY = AI_ROUTER / "copilot_catalog.py"

FIELD = "probe_premium_requests"
LEGACY_FIELD = "premium_request_weight"

# The transport's own diagnostic key. It is a real, correct thing to read
# (it is where the probe sample comes from) and it must never be confused
# with the lockfile field -- a substring scan would flag it, which is how a
# prohibition gate acquires false positives and then gets deleted.
LOOK_ALIKE = "premium_requests"

# The one module allowed to name the field at all, plus this file and the
# catalog's own test module -- matched by path relative to ai_router/, not
# by basename, so a second file that merely CALLS itself copilot_catalog.py
# somewhere else in the tree does not inherit the exemption (round-1
# verification nit, and the hole this session flagged itself). Anything else
# is a new reader and must justify itself by editing this list -- which is
# the point: the edit is the review.
PERMITTED_PATHS = {
    "copilot_catalog.py",
    "tests/test_copilot_catalog.py",
    "tests/test_catalog_weight_not_a_price.py",
}

_FIELD_RE = re.compile(rf"\b(?:{FIELD}|{LEGACY_FIELD})\b")


def _python_sources() -> list[Path]:
    return [
        p
        for p in AI_ROUTER.rglob("*.py")
        if ".venv" not in p.parts and "node_modules" not in p.parts
    ]


def _rationale_block() -> str:
    """The contiguous comment run immediately above the field declaration.

    Located structurally rather than by a fixed character window, so the
    assertion still means "the warning is ON the declaration" after the
    comment grows or shrinks.
    """
    lines = CATALOG_PY.read_text(encoding="utf-8").splitlines()
    for index, line in enumerate(lines):
        if line.strip().startswith(f"{FIELD}:"):
            block: list[str] = []
            cursor = index - 1
            while cursor >= 0 and lines[cursor].strip().startswith("#"):
                block.append(lines[cursor])
                cursor -= 1
            return "\n".join(reversed(block))
    pytest.fail(f"no `{FIELD}:` declaration found in copilot_catalog.py")


def _model_entry_annotations() -> dict[str, ast.AnnAssign]:
    tree = ast.parse(CATALOG_PY.read_text(encoding="utf-8"))
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef) and node.name == "ModelEntry":
            return {
                stmt.target.id: stmt
                for stmt in node.body
                if isinstance(stmt, ast.AnnAssign)
                and isinstance(stmt.target, ast.Name)
            }
    pytest.fail("ModelEntry class not found in copilot_catalog.py")


def test_no_module_outside_the_catalog_names_the_field() -> None:
    """A cost-aware selector reading this field would pick gpt-5.5 as free.

    The invariant is deliberately absolute -- *no* other module may even
    name it, under either spelling. A softer rule ("no module may use it
    for cost") is not mechanically checkable, and the failure it guards
    against is a reader that looks perfectly reasonable at the call site.
    """
    sources = _python_sources()
    # L-112-1: a scan whose corpus comes back empty passes having examined
    # nothing. Select by the gate's own corpus definition, never by
    # position, and name the members that must be in it.
    assert sources, "the prohibition scan found no Python sources at all"
    scanned = {p.name for p in sources}
    for required in ("copilot_catalog.py", "cli_transport.py", "seat_cost.py"):
        assert required in scanned, (
            f"{required} is not in the scanned corpus; the gate is reading "
            "the wrong tree and would pass having examined nothing"
        )

    offenders = sorted(
        rel
        for rel, path in (
            (p.relative_to(AI_ROUTER).as_posix(), p) for p in sources
        )
        if rel not in PERMITTED_PATHS
        and _FIELD_RE.search(path.read_text(encoding="utf-8"))
    )
    assert offenders == [], (
        f"{FIELD} is per-probe consumption, not a rate and not a price "
        f"(gpt-5.5 probes 0, bills 7.5). New readers: {offenders}. "
        "For real spend use ai_router/seat_cost.py, which reads the store."
    )


def test_the_transport_metadata_key_is_not_mistaken_for_the_field() -> None:
    """The legitimate look-alike must NOT fire (L-112-1, the other half).

    ``cli_transport.py`` and ``copilot_preflight.py`` both carry a
    ``premium_requests`` key in the transport's diagnostic metadata. That
    is the honest source of the probe sample, it is read for diagnostics
    and never for selection, and a substring-based prohibition would flag
    both -- a gate that cries wolf on correct code is a gate that gets
    deleted rather than obeyed.
    """
    by_name = {p.name: p for p in _python_sources()}
    for neighbour in ("cli_transport.py", "copilot_preflight.py"):
        assert neighbour in by_name, f"{neighbour} vanished from the corpus"
        text = by_name[neighbour].read_text(encoding="utf-8")
        # The plant is real only if the look-alike is genuinely present.
        assert LOOK_ALIKE in text, (
            f"{neighbour} no longer carries the {LOOK_ALIKE!r} transport key, "
            "so this look-alike no longer proves anything -- repoint it at a "
            "module that does, or delete it with its rationale"
        )
        assert not _FIELD_RE.search(text), (
            f"{neighbour} now names the lockfile field itself, not just the "
            f"{LOOK_ALIKE!r} transport key"
        )


def test_the_field_was_renamed_and_the_old_name_survives_only_as_a_legacy_key() -> None:
    """The NAME was the defect; a comment defending it is not the fix.

    ``weight`` asserts a rate. The value is one call's consumption. After
    the rename the old spelling may exist in exactly one place -- the
    backward-compatible read of a v1 lockfile -- and never as a field.
    """
    annotations = _model_entry_annotations()
    assert FIELD in annotations, f"ModelEntry no longer declares {FIELD}"
    assert LEGACY_FIELD not in annotations, (
        f"ModelEntry declares {LEGACY_FIELD} again; the name asserts a rate "
        "the value has never been"
    )
    assert copilot_catalog._LEGACY_PROBE_PREMIUM_KEY == LEGACY_FIELD, (
        "the legacy lockfile key changed; a v1 lock would silently lose its "
        "probe sample on load"
    )


def test_the_default_is_none_so_absent_reads_as_unknown_never_free() -> None:
    """Absent must mean UNKNOWN, never free (L-112-1).

    ``claude-haiku-4.5`` has no sample in the live lockfile at all while
    billing at 0.33. If this field ever acquires a non-None default, every
    unprobed model silently becomes a number.
    """
    declaration = _model_entry_annotations()[FIELD]
    assert declaration.value is not None, f"{FIELD} lost its default"
    assert isinstance(declaration.value, ast.Constant), (
        f"{FIELD} default is no longer a literal"
    )
    assert declaration.value.value is None, (
        f"{FIELD} default is {declaration.value.value!r}; absent must read as "
        "unknown, never as a number"
    )


def test_the_not_a_price_rationale_sits_on_the_declaration() -> None:
    """The prohibition IS the fix, so the rationale must not be refactored away.

    Without this, a tidy-up that collapses the comment leaves a bare
    ``Optional[int]`` beside a lockfile full of plausible small integers --
    the trap re-armed under a better name and no test failing.
    """
    block = _rationale_block()
    assert block.strip(), (
        f"the {FIELD} declaration no longer carries a comment block above it"
    )
    for phrase in ("NOT A PRICE", "gpt-5.5", "request_multiplier", "seat_cost"):
        assert phrase in block, (
            f"the {FIELD} rationale no longer names {phrase!r} directly above "
            "the field; restore it rather than deleting the warning"
        )


def test_the_measured_disagreement_is_recorded_where_a_reader_will_find_it() -> None:
    """Pin the evidence, not the lockfile.

    ``ai_router/copilot-catalog.lock`` is seat-local and gitignored, so the
    real disagreement cannot be asserted against a committed fixture. What
    can be held down is that the concrete measured pairs stay written beside
    the field -- a future reader who doubts the prohibition needs the
    numbers, not just the rule.
    """
    source = CATALOG_PY.read_text(encoding="utf-8")
    for model, probed, billed in (
        ("gpt-5.5", "0", "7.5"),
        ("gpt-5.4", "0", "1.0"),
        ("gpt-5.3-codex", "0", "1.0"),
        ("gpt-5.4-mini", "0", "0.33"),
    ):
        pattern = (
            rf"{re.escape(model)}\s+probes\s+{re.escape(probed)}"
            rf"\s+bills\s+{re.escape(billed)}"
        )
        assert re.search(pattern, source), (
            f"the measured {model} disagreement (probes {probed}, bills "
            f"{billed}) is no longer recorded in copilot_catalog.py"
        )


def test_the_credit_axis_decoupling_is_stated() -> None:
    """The subtler half: the field is wrong even where it AGREES.

    At matched context ``claude-opus-5`` (multiplier 15.0) and ``gpt-5.5``
    (7.5) cost the same per inference, so even a lockfile with perfectly
    correct multipliers would not rank models by spend. A reader who learns
    only "the OpenAI numbers are wrong" concludes that correcting them makes
    the field usable. It does not, and that is the conclusion this assertion
    exists to block.
    """
    block = _rationale_block()
    assert "decoupled" in block, (
        "the premium-request/credit axis decoupling is no longer stated on "
        "the declaration; without it, 'fix the OpenAI weights' looks like a "
        "sufficient repair"
    )
    assert "claude-opus-5" in block, (
        "the matched-context comparison that proves the decoupling no longer "
        "names the model it was measured against"
    )


def test_a_v1_lockfile_still_loads_and_is_rewritten_under_the_new_name(
    tmp_path,
) -> None:
    """The one behaviour that changed, driven end to end.

    A v1 lock carries the old key. The sample it holds is a real
    measurement -- only its name and its use were wrong -- so the rename
    must not drop it, and the rewrite must not preserve the old spelling.
    """
    v1_text = "\n".join(
        [
            "[meta]",
            "schema_version = 1",
            'cli_name = "GitHub Copilot CLI"',
            'cli_version = "1.0.68"',
            "cli_version_pin_required = true",
            'seat_id = "seat-1"',
            'seat_label = "Seat"',
            'source = "empirical-probe"',
            'probed_at = "2026-01-01T00:00:00Z"',
            "",
            "[[models]]",
            'id = "gpt-5.5"',
            'provider = "openai"',
            'enablement = "confirmed"',
            f"{LEGACY_FIELD} = 0",
            "",
            "[[models]]",
            'id = "claude-haiku-4.5"',
            'provider = "anthropic"',
            'enablement = "confirmed"',
        ]
    )
    lockfile = tmp_path / "catalog.lock"
    lockfile.write_text(v1_text, encoding="utf-8")

    catalog = copilot_catalog.load_lockfile(lockfile)
    by_id = {m.id: m for m in catalog.models}
    assert by_id["gpt-5.5"].probe_premium_requests == 0, (
        "a v1 lockfile lost its probe sample on load"
    )
    assert by_id["claude-haiku-4.5"].probe_premium_requests is None, (
        "an entry that was never probed must stay unknown, not become 0"
    )

    rewritten = copilot_catalog.dumps(catalog)
    assert f"{FIELD} = 0" in rewritten
    assert LEGACY_FIELD not in rewritten, (
        "the rewrite kept the old key; the misleading spelling would outlive "
        "the rename in every refreshed lockfile"
    )

    # A v2 file wins outright when both spellings somehow appear.
    both = v1_text.replace(f"{LEGACY_FIELD} = 0", f"{LEGACY_FIELD} = 0\n{FIELD} = 3")
    reread = copilot_catalog.loads(both)
    assert {m.id: m for m in reread.models}["gpt-5.5"].probe_premium_requests == 3
    assert copilot_catalog.LOCKFILE_SCHEMA_VERSION == 2
