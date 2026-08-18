"""dabbler-ai-router v2: multi-provider model routing for AI-led sessions."""

from .route import (
    DispatchError,
    NoCandidateError,
    PromptTooLargeError,
    RouteResult,
    RouterError,
    route,
)

__version__ = "1.0.9"

__all__ = [
    "DispatchError",
    "NoCandidateError",
    "PromptTooLargeError",
    "RouteResult",
    "RouterError",
    "route",
    "__version__",
]
