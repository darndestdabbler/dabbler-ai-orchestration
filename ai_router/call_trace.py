"""Counts the provider HTTP requests made inside a scope.

Set 109 S2. The router already records a metrics row per *logical* call, but a
row is a claim the recorder makes about itself: it cannot distinguish "one
`route()` made two provider requests" from "one request was written down
twice". Those two readings have opposite consequences -- the first is a routing
defect, the second is a metrics defect -- and nothing below the recorder could
tell them apart.

This module supplies the missing observation. The three api-profile callers in
:mod:`ai_router.providers` announce every HTTP POST they are about to issue;
:func:`trace_provider_calls` collects them for the duration of a ``with``
block. Announcing happens *inside* each caller rather than in ``call_model``
because ``call_model`` wraps a retry loop -- a retried request is a real
request, and counting above the loop would undercount exactly the calls most
worth seeing.

Outside a trace scope this is a ContextVar read and a ``None`` test, so the
production path carries no list, no lock, and no accumulating state.

Two limits, stated because a trace is used as evidence:

* Entries are recorded immediately **before** ``client.post`` returns control
  to the network layer, so an entry means "this request was dispatched", not
  "this request reached the provider". A connection that fails before
  transmission still appears. For the questions this exists to answer — which
  provider was contacted, and how many times — dispatch is the right boundary:
  a request the router chose to send counts even if the socket then failed.
* Isolation is per-thread and per-synchronous-call by virtue of ContextVar.
  An asyncio task spawned *inside* an active scope inherits the context, and
  therefore the same list, so its requests are collected too. Nothing in this
  package spawns such tasks; a future caller that does should open its own
  scope inside the task.
"""

from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Iterator, Optional

__all__ = ["HttpCall", "trace_provider_calls", "record_http_request"]


@dataclass(frozen=True)
class HttpCall:
    """One provider HTTP request, as issued.

    ``model_id`` is the id put ON THE WIRE, not the local registry alias --
    the same distinction Session 1 drew when it split ``requested_model_id``
    out of the metrics row's ``model`` field. A trace that recorded the alias
    could not show an alias resolving to something else, which is half of what
    this set exists to make visible.
    """

    provider: str
    model_id: str


_calls: ContextVar[Optional[list]] = ContextVar(
    "ai_router_provider_calls", default=None
)


@contextmanager
def trace_provider_calls() -> Iterator[list]:
    """Collect every provider HTTP request issued inside the block.

    Yields the list the requests land in. It is populated as the block runs,
    so it is readable afterwards::

        with trace_provider_calls() as calls:
            route(..., exclude_providers=["anthropic"])
        assert [c.provider for c in calls] == ["openai"]

    Nesting is supported: an inner scope takes over collection for its own
    extent, and the outer scope resumes -- without the inner requests -- when
    it exits. The token is always reset, including on an exception, so a
    failed traced call cannot leak collection into whatever runs next on the
    same task.

    See the module docstring for what an entry does and does not prove.
    """
    calls: list = []
    token = _calls.set(calls)
    try:
        yield calls
    finally:
        _calls.reset(token)


def record_http_request(provider: str, model_id: str) -> None:
    """Announce one about-to-be-dispatched provider request.

    A no-op unless a :func:`trace_provider_calls` scope is active. Recording
    must never be able to break a call, so this takes no locks and raises
    nothing a caller has to handle.
    """
    calls = _calls.get()
    if calls is None:
        return
    calls.append(HttpCall(provider=str(provider), model_id=str(model_id)))
