"""dabbler-ai-router v2: multi-provider model routing for AI-led sessions."""

from .route import (
    DispatchError,
    NoCandidateError,
    RouteResult,
    RouterError,
    route,
)

__version__ = "1.0.5"

__all__ = [
    "DispatchError",
    "NoCandidateError",
    "RouteResult",
    "RouterError",
    "route",
    "__version__",
]
