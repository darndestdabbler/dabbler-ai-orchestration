"""The Transport protocol: the one seam route() dispatches through.

Both transports return an :class:`APIResult`. The direct-API transport fills
token counts from the provider's own usage block; the Copilot CLI transport
reports what the CLI exposes (no input tokens, no billing-authoritative
usage) and carries its diagnostics in ``metadata``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional, Protocol


@dataclass
class APIResult:
    content: str
    input_tokens: int
    output_tokens: int
    stop_reason: str
    # The model id the PROVIDER says it served, read from the response body
    # (Anthropic/OpenAI expose it as `model`, Google as `modelVersion`, the
    # Copilot CLI echoes it back). It is not always the id asked for —
    # OpenAI has resolved a bare id to a differently-priced variant with
    # nothing else able to see it. ``None`` (never ``""``) means the
    # provider did not tell us, which is a different fact from "served
    # something unnamed" and must stay distinguishable in the metrics.
    served_model_id: Optional[str] = None
    # Transport diagnostics: error_class (None on success), session_id,
    # exit_code, etc. Open dict — values off the wire are shape-checked by
    # readers, never trusted.
    metadata: dict = field(default_factory=dict)

    @property
    def ok(self) -> bool:
        return self.metadata.get("error_class") is None


class Transport(Protocol):
    def dispatch(
        self,
        *,
        model_id: str,
        system_prompt: str,
        user_message: str,
        max_tokens: int,
        generation_params: Optional[dict] = None,
    ) -> APIResult:
        ...
