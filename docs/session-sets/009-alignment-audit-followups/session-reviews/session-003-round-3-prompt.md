## Round 3 verification — Set 9 Session 3 (D-2 hard-scoping)

Round 2 confirmed Issues 1, 2, and 4. Issue 3 (rejection tests should spy on `acquire_lock` rather than relying on on-disk file absence) is now fixed below. This focused Round 3 asks only for confirmation of that fix.

## Round 2 verbatim issue (the one being re-verified)

> **Issue** → the new assertions do **not** fully prove the original invariant 'no lock acquired.'
> **Location** → ai-router/tests/test_close_session_skeleton.py (test_force_rejected_without_env_var, test_force_rejected_without_reason_file)
> **Fix** → asserting that .close_session.lock is absent *after* rejection only proves no lock file remained on disk. It does **not** catch a regression where acquire_lock() is called and then released before returning invalid_invocation. Add an explicit spy/monkeypatch around acquire_lock and assert it was never invoked. Keeping the on-disk absence check as a secondary assertion is fine.

## Resolution

Both rejection tests now:

  1. Capture `close_session.acquire_lock` and replace it with a spy that records call args. The spy delegates to the real implementation if invoked (so the test would fail loudly with real lock-file artifacts, not silently dodge them) but the primary assertion is `acquire_calls == []`.
  2. Keep the on-disk absence check (`os.path.exists(<set>/.close_session.lock)` is False) as a secondary defensive assertion — covers the case where the spy targets the wrong symbol (e.g. a future refactor that imports acquire_lock under a different name).

```python
def test_force_rejected_without_env_var(started_session_set, tmp_path, monkeypatch):
    """Without ``AI_ROUTER_ALLOW_FORCE_CLOSE_OUT=1``, ``--force`` exits 2.

    The env-var gate fires before any state mutation: no events are
    written, ``acquire_lock`` is never called, and no lock file lands
    on disk. A normal terminal session that does not have the variable
    exported will fail loudly on accidental ``--force`` invocations.

    Spy assertion (primary): ``acquire_lock`` is monkeypatched to a
    counter and we verify it was never invoked. Spying directly catches
    a regression where the lock is acquired and then released before
    the ``invalid_invocation`` return — a code path that leaves no
    file behind but that would still represent a pre-mutation contract
    violation. The on-disk absence check below is the secondary
    assertion (weaker but defensive — covers the case where the spy
    is wrong about which acquire_lock symbol matters).
    """
    monkeypatch.delenv("AI_ROUTER_ALLOW_FORCE_CLOSE_OUT", raising=False)
    reason_path = tmp_path / "reason.md"
    reason_path.write_text("test reason\n", encoding="utf-8")

    acquire_calls: List[tuple] = []
    real_acquire = close_session.acquire_lock

    def _spy_acquire(*args, **kwargs):
        acquire_calls.append((args, kwargs))
        return real_acquire(*args, **kwargs)

    monkeypatch.setattr(close_session, "acquire_lock", _spy_acquire)

    args = _ns(
        session_set_dir=started_session_set,
        force=True,
        reason_file=str(reason_path),
    )
    outcome = run(args)
    assert outcome.result == "invalid_invocation"
    assert outcome.exit_code == 2
    assert any(
        "AI_ROUTER_ALLOW_FORCE_CLOSE_OUT" in m for m in outcome.messages
    )
    # Primary: acquire_lock was never invoked.
    assert acquire_calls == [], (
        "acquire_lock must not be called when --force validation rejects"
    )
    # No ledger events were emitted because validation fired before lock.
    events = [e.event_type for e in read_events(started_session_set)]
    assert "closeout_requested" not in events
    assert "closeout_force_used" not in events
    # Secondary defensive check: no lock file landed on disk.
    from close_lock import LOCK_FILENAME
    lock_path = os.path.join(started_session_set, LOCK_FILENAME)
    assert not os.path.exists(lock_path), (
        "rejected --force must not have acquired the close-out lock"
    )


def test_force_rejected_with_non_one_env_var(
    started_session_set, tmp_path, monkeypatch
):
    """Values like ``"true"``, ``"yes"``, ``"0"``, or ``""`` are rejected.

    The opt-in token is exactly ``"1"`` — anything else trips the gate.
    A loose check (e.g. truthy-ness) would let a stale ``=0`` in a
    process-environment template silently accept ``--force``, which is
    exactly the footgun the hard-scope is meant to close.
    """
    reason_path = tmp_path / "reason.md"
    reason_path.write_text("test reason\n", encoding="utf-8")
    for bad_value in ("0", "true", "yes", "", "TRUE"):
        monkeypatch.setenv("AI_ROUTER_ALLOW_FORCE_CLOSE_OUT", bad_value)
        args = _ns(
            session_set_dir=started_session_set,
            force=True,
            reason_file=str(reason_path),
        )
        outcome = run(args)
        assert outcome.result == "invalid_invocation", (
            f"value {bad_value!r} should be rejected"
        )


def test_force_rejected_without_reason_file(
    started_session_set, monkeypatch
):
    """``--force`` without ``--reason-file`` exits 2 even with the env var.

    The reason becomes the ``closeout_force_used`` event's payload, so
    refusing the silent-bypass case keeps the forensic audit trail
    honest. (Mirrors the ``--manual-verify`` contract.)

    Spy assertion (primary): same pattern as ``test_force_rejected_
    without_env_var`` — monkeypatch ``acquire_lock`` to a counter and
    verify it was never invoked. The on-disk absence check is the
    secondary defensive assertion.
    """
    monkeypatch.setenv("AI_ROUTER_ALLOW_FORCE_CLOSE_OUT", "1")

    acquire_calls: List[tuple] = []
    real_acquire = close_session.acquire_lock

    def _spy_acquire(*args, **kwargs):
        acquire_calls.append((args, kwargs))
        return real_acquire(*args, **kwargs)

    monkeypatch.setattr(close_session, "acquire_lock", _spy_acquire)

    args = _ns(session_set_dir=started_session_set, force=True)
    outcome = run(args)
    assert outcome.result == "invalid_invocation"
    assert outcome.exit_code == 2
    assert any("--reason-file" in m for m in outcome.messages)
    # Primary: acquire_lock was never invoked.
    assert acquire_calls == [], (
        "acquire_lock must not be called when --force validation rejects"
    )
    events = [e.event_type for e in read_events(started_session_set)]
    assert "closeout_force_used" not in events
    # Secondary defensive check: no lock file appears on disk.
    from close_lock import LOCK_FILENAME
    lock_path = os.path.join(started_session_set, LOCK_FILENAME)
    assert not os.path.exists(lock_path), (
        "rejected --force must not have acquired the close-out lock"
    )



```

## Test result

All 34 tests in `test_close_session_skeleton.py` pass. Full suite still at 676 passed.

## Verification ask

Confirm that the spy/monkeypatch resolution closes Issue 3. Reply `VERIFIED` if so. If anything else surfaces, reply `ISSUES_FOUND` with the specific dissent.