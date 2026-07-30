# Add a shout

> **Tier:** lightweight — no AI provider keys, no metered spend. The AI agent
> the developer already has open does the work.

---

## Session Set Configuration

```yaml
tier: lightweight
requiresUAT: false
requiresE2E: false
verificationMode: out-of-band-or-none
```

---

## The task

`hello/greeting.py` has a `greet` function and no `shout` function.
`test_greeting.py` expects both. Write `shout`.

```python
shout("world")  ->  "HELLO, WORLD!"
```

That is: the same greeting `greet` produces, in capital letters.

---

## Sessions

### Session 1 of 1: write `shout`

**Steps:**
1. Register the session (`start_session ... --no-router`).
2. Add `shout` to `hello/greeting.py`. Build it from `greet` rather than
   repeating the wording, so the two can never disagree.
3. Run `python -m unittest`. Both tests must pass.
4. Run `python main.py`. It must print `Hello, world!` then `HELLO, WORLD!`.
5. Write `disposition.json` and `change-log.md`, commit, and close the session
   (`close_session ... --no-router --accept-suggestions`). The exact commands
   are in `AGENTS.md`.

**Creates:** nothing new.
**Touches:** `hello/greeting.py`.
**Ends with:** both tests passing and the program printing both lines.

---

## End-of-set deliverables

- `shout` exists in `hello/greeting.py`.
- `python -m unittest` reports `OK`.
- `python main.py` prints the two expected lines.
