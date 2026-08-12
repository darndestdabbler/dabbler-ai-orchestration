"""Set 125 falsifiers: a routed call cannot mutate the repo, on either path.

``route()`` is one contract with two transports, and until this set they did
not honour it equally:

- ``api`` sends model/max_tokens/system/messages and **no** ``tools`` key
  (``providers.py``), so the provider returns text and the call cannot touch
  the filesystem **by construction**.
- ``copilot-cli`` dispatches an *agentic* CLI. With ``--allow-all-tools``
  alone it held the whole tool universe -- ``powershell`` (arbitrary shell),
  ``create``, ``edit``, ``task``/``write_agent`` (sub-agent spawning) --
  against the live working tree.

That gap was not theoretical: on 2026-08-12 routed calls fired from the test
suite modified 23 files in this repo with no human in the loop, and wrote two
spurious rounds into a live verification ledger.

Per L-112-1, an argv-shaped rule is precisely the kind that reads as correct
while doing nothing, so both directions are asserted here:

- **The rule fires.** Both dispatch paths carry the allowlist, and it grants
  no mutating tool.
- **The rule does not fire indiscriminately.** ``view`` survives (the Set 104
  handoff *requires* a file-read tool to pull its payload), and
  ``--allow-all-tools`` survives (it governs auto-approval, which headless
  dispatch needs -- dropping it would make dispatch hang on a prompt).

Plus a **structural** assertion that the allowlist and the known-mutating set
are disjoint, which holds however either is spelled.

The live matched-pair proof is deliberately NOT run here -- it costs real
premium requests and would make the suite non-hermetic, which is the very
property Set 124 S1 had to restore. It is recorded in this set's spec and
change log:

    --allow-all-tools alone       -> filesModified: ["sample.txt"]
    + --available-tools=view,...  -> filesModified: []
"""

from __future__ import annotations

from typing import Optional, Sequence

import pytest

import cli_transport  # type: ignore[import-not-found]

from test_cli_transport import (  # type: ignore[import-not-found]
    FakeProcess,
    FakeSpawner,
)


def _flag_value(argv: Sequence[str], flag: str) -> Optional[str]:
    """The value following *flag*, or None when the flag is absent."""
    argv = list(argv)
    if flag not in argv:
        return None
    idx = argv.index(flag)
    return argv[idx + 1] if idx + 1 < len(argv) else None


def _granted_tools(argv: Sequence[str]) -> list[str]:
    raw = _flag_value(argv, "--available-tools")
    return [t.strip() for t in raw.split(",")] if raw else []


def _dispatch_inline() -> Sequence[str]:
    spawner = FakeSpawner(FakeProcess())
    transport = cli_transport.CopilotCliTransport(spawner=spawner)
    transport.dispatch(model_id="m", system_prompt="s", user_message="u")
    return spawner.calls[0].argv


def _dispatch_handoff() -> Sequence[str]:
    """Force the Set 104 temp-file handoff by exceeding the size threshold."""
    spawner = FakeSpawner(FakeProcess())
    transport = cli_transport.CopilotCliTransport(spawner=spawner)
    transport.dispatch(
        model_id="m",
        system_prompt="s",
        user_message="x" * (cli_transport.HANDOFF_THRESHOLD_UTF16_UNITS + 100),
    )
    return spawner.calls[0].argv


# ---------------------------------------------------------------------------
# The rule fires -- on BOTH paths
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "dispatch, label",
    [(_dispatch_inline, "inline"), (_dispatch_handoff, "handoff")],
)
def test_every_dispatch_path_restricts_the_tool_universe(dispatch, label):
    """A fix applied to one dispatch path only is the fix-one-site defect
    class this repo keeps re-learning (L-069-1). The handoff path builds its
    own argv, so it is asserted separately rather than assumed."""
    argv = dispatch()

    assert "--available-tools" in argv, (
        f"the {label} dispatch path grants the FULL tool universe -- it can "
        "run shell, create and edit files, and spawn sub-agents against the "
        "working tree"
    )
    assert _granted_tools(argv) == list(cli_transport.READ_ONLY_TOOLS)


@pytest.mark.parametrize(
    "dispatch, label",
    [(_dispatch_inline, "inline"), (_dispatch_handoff, "handoff")],
)
def test_no_dispatch_path_grants_a_mutating_tool(dispatch, label):
    """Named explicitly, because 'the allowlist is short' is not the same
    claim as 'the allowlist excludes the dangerous ones'."""
    granted = set(_granted_tools(dispatch()))

    leaked = granted & cli_transport.MUTATING_TOOLS
    assert not leaked, f"{label} path grants mutating tool(s): {sorted(leaked)}"

    for tool in ("powershell", "create", "edit", "task", "write_agent"):
        assert tool not in granted, f"{label} path grants {tool!r}"


# ---------------------------------------------------------------------------
# The rule does not fire indiscriminately
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "dispatch, label",
    [(_dispatch_inline, "inline"), (_dispatch_handoff, "handoff")],
)
def test_the_read_tool_the_handoff_depends_on_survives(dispatch, label):
    """The Set 104 bootstrap tells the model to read its payload with a
    file-read tool. A grant that removed ``view`` would look like a security
    win and silently break every large-prompt dispatch."""
    assert "view" in _granted_tools(dispatch()), (
        f"{label} path cannot read files; the Set 104 handoff pull would fail"
    )


@pytest.mark.parametrize(
    "dispatch, label",
    [(_dispatch_inline, "inline"), (_dispatch_handoff, "handoff")],
)
def test_headless_auto_approval_is_not_collateral_damage(dispatch, label):
    """``--allow-all-tools`` governs auto-approval, not the tool universe.
    Dropping it would make a headless dispatch prompt for permission and
    hang -- a plausible 'simplification' this pins against."""
    assert "--allow-all-tools" in dispatch(), (
        f"{label} path lost --allow-all-tools; headless dispatch would prompt"
    )


def test_the_bootstrap_still_asks_for_a_read_tool():
    """Ties the two halves together: the instruction and the grant have to
    agree, or one of them is wrong."""
    bootstrap = cli_transport._build_handoff_bootstrap("/tmp/payload.txt")
    assert "file-read tool" in bootstrap
    assert "view" in cli_transport.READ_ONLY_TOOLS


# ---------------------------------------------------------------------------
# STRUCTURAL -- holds however either side is spelled
# ---------------------------------------------------------------------------


def test_the_allowlist_and_the_mutating_set_are_disjoint():
    granted = set(cli_transport.READ_ONLY_TOOLS)
    assert not (granted & cli_transport.MUTATING_TOOLS)
    assert granted, "an empty allowlist would pass every disjointness check"


def test_both_paths_grant_the_identical_universe():
    """One shared constant feeds both paths. If a later edit inlines the flag
    into one of them, this fails even if both happen to be read-only today."""
    assert _granted_tools(_dispatch_inline()) == _granted_tools(
        _dispatch_handoff()
    )


def test_the_grant_helper_is_the_single_source():
    """The helper is what makes drift impossible; assert it is what ships."""
    fragment = cli_transport._tool_grant_argv()
    assert fragment[0] == "--available-tools"
    assert fragment[1] == ",".join(cli_transport.READ_ONLY_TOOLS)
    assert fragment == list(fragment), "fragment must be a plain argv list"
