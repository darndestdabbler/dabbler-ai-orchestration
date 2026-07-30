"""The sample project's greetings.

One function is here. One is missing on purpose -- that is the task.
"""


def greet(name: str) -> str:
    """Return a friendly greeting for ``name``."""
    return f"Hello, {name}!"


# `shout` is not written yet. That is why one test fails right now, and it is
# the whole job of the task in docs/session-sets/001-add-a-shout/spec.md.
