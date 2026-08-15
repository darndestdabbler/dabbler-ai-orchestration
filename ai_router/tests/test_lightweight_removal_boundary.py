"""Set 112 — the removed-tier refusal on the REAL lifecycle path.

Round-1 verification found the fail-loud loader was true but unreachable:
`spec_config.parse_session_set_config` raised, but nothing on the
`start_session` happy path parsed the config block, and the one live
`gate_checks` caller swallowed the error in a broad `except Exception`.
A stranded Lightweight consumer — the exact population this set targets —
would have been registered and written to disk under one-tier semantics
and met an unrelated error several steps later.

These tests pin the fix where a user actually stands:

  * `start_session` refuses BEFORE any state or event write;
  * `close_session` refuses rather than failing at a downstream gate;
  * `gate_checks._uat_policy` re-raises instead of returning an inert
    policy (which would also have silently disarmed an armed UAT flag);
  * a set with no tier line, or a legacy `tier: full`, is unaffected.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

import close_session
import gate_checks
import start_session
from spec_config import LIGHTWEIGHT_REMOVED_MESSAGE, LightweightTierRemovedError

CONFIG_BLOCK = """# A consumer set

## Session Set Configuration

```yaml
{yaml}
```

## Session 1 of 1: Do the thing
"""


def _make_set(tmp_path: Path, yaml_body: str) -> Path:
    d = tmp_path / "001-legacy-set"
    d.mkdir(parents=True, exist_ok=True)
    (d / "spec.md").write_text(CONFIG_BLOCK.format(yaml=yaml_body), encoding="utf-8")
    return d


# ---------- start_session: refuse before any write ----------


def test_start_session_refuses_a_lightweight_spec(tmp_path: Path, capsys):
    d = _make_set(tmp_path, "tier: lightweight\nrequiresUAT: false")
    rc = start_session.main(
        [
            "--session-set-dir", str(d),
            "--engine", "claude-code",
            "--provider", "anthropic",
            "--total-sessions", "1",
        ]
    )
    assert rc == start_session.EXIT_BOUNDARY
    err = capsys.readouterr().err
    assert LIGHTWEIGHT_REMOVED_MESSAGE in err


def test_start_session_refusal_writes_nothing(tmp_path: Path):
    """The refusal must precede the boundary write, not follow it.

    A refusal that still registered the session would leave the consumer
    with a half-started set to clean up on top of the migration.
    """
    d = _make_set(tmp_path, "tier: lightweight")
    start_session.main(
        [
            "--session-set-dir", str(d),
            "--engine", "claude-code",
            "--provider", "anthropic",
            "--total-sessions", "1",
        ]
    )
    assert not (d / "session-state.json").exists()
    assert not (d / "session-events.jsonl").exists()


def test_start_session_accepts_a_spec_with_no_tier_line(tmp_path: Path):
    d = _make_set(tmp_path, "requiresUAT: false\nrequiresE2E: false")
    rc = start_session.main(
        [
            "--session-set-dir", str(d),
            "--engine", "claude-code",
            "--provider", "anthropic",
            "--total-sessions", "1",
        ]
    )
    assert rc == start_session.EXIT_OK
    state = json.loads((d / "session-state.json").read_text(encoding="utf-8"))
    assert state["status"] == "in-progress"


def test_start_session_accepts_a_legacy_tier_full_line(tmp_path: Path):
    """Consumer repos hold hundreds of these; they must keep working."""
    d = _make_set(tmp_path, "tier: full\nrequiresUAT: false")
    rc = start_session.main(
        [
            "--session-set-dir", str(d),
            "--engine", "claude-code",
            "--provider", "anthropic",
            "--total-sessions", "1",
        ]
    )
    assert rc == start_session.EXIT_OK


# ---------- close_session: refuse rather than fail downstream ----------


def test_close_session_refuses_a_lightweight_spec(tmp_path: Path):
    d = _make_set(tmp_path, "tier: lightweight")
    # A state file so the close does not short-circuit as "already closed".
    (d / "session-state.json").write_text(
        json.dumps(
            {
                "schemaVersion": 4,
                "sessionSetName": "001-legacy-set",
                "status": "in-progress",
                "sessions": [
                    {"number": 1, "title": "S1", "status": "in-progress"}
                ],
            }
        ),
        encoding="utf-8",
    )
    parser = close_session._build_parser()
    args = parser.parse_args(["--session-set-dir", str(d)])
    outcome = close_session.run(args)
    assert outcome.result == "invalid_invocation"
    assert any(LIGHTWEIGHT_REMOVED_MESSAGE in m for m in outcome.messages)


# ---------- gate_checks: the swallow that hid the refusal ----------


def test_uat_policy_reraises_instead_of_returning_an_inert_policy(tmp_path: Path):
    """The Round-1 root cause, pinned.

    `_uat_policy`'s broad handler exists so an UNPARSEABLE spec leaves the
    gate inert. A spec that parses fine and declares a DELETED tier is the
    opposite case: swallowing it both hid the migration message and
    evaporated an armed UAT policy.
    """
    d = _make_set(tmp_path, "tier: lightweight\nrequiresUAT: true\nuatScope: per-set")
    with pytest.raises(LightweightTierRemovedError):
        gate_checks._uat_policy(str(d))


def test_uat_policy_still_inert_for_an_unparseable_spec(tmp_path: Path):
    """The original fail-inert behavior survives for its real case."""
    d = tmp_path / "002-broken"
    d.mkdir()
    (d / "spec.md").write_text("no config block here at all\n", encoding="utf-8")
    assert gate_checks._uat_policy(str(d)) == (False, "none", None)


def test_uat_policy_still_arms_a_normal_set(tmp_path: Path):
    d = _make_set(tmp_path, "requiresUAT: true\nuatScope: per-set")
    assert gate_checks._uat_policy(str(d)) == (True, "per-set", None)
