"""Scripted, no-network transport: the framework without a vendor.

The framework's own model calls are the only thing in it that needs an API
key, and needing one to develop the framework is a poor trade — a live model
also cannot be asked to produce a specific awkward response on demand, which
is exactly what testing the verification loop requires.

This transport serves responses from a directory of files instead. They are
consumed in lexical order, one per dispatch, with the cursor kept on disk
because every CLI verb is a separate process. Exhausting the queue is an
error rather than a silent replay: a round 2 that quietly re-serves round
1's response would make the record claim something that did not happen.

Nothing here pretends to be a provider. The provider is ``offline``, the
served model id names the file that answered, and every result carries
``simulated: True`` so no reader has to infer it.
"""

from __future__ import annotations

import os
from pathlib import Path

from .base import APIResult

PROVIDER = "offline"
ENV_RESPONSES_DIR = "DABBLER_OFFLINE_RESPONSES"
CURSOR_NAME = ".cursor"
RESPONSE_SUFFIXES = (".md", ".txt")


class OfflineTransportError(RuntimeError):
    """The scripted queue cannot answer — missing, empty, or exhausted."""


def resolve_responses_dir(config: dict | None = None) -> Path:
    """``DABBLER_OFFLINE_RESPONSES`` > ``transports.offline.responses_dir``.

    There is no default location. The transport is opted into by saying
    where the script lives, so it can never be selected by accident.
    """
    env = os.environ.get(ENV_RESPONSES_DIR)
    if env and env.strip():
        return Path(env.strip()).expanduser()
    block = ((config or {}).get("transports") or {}).get("offline") or {}
    configured = block.get("responses_dir")
    if configured and str(configured).strip():
        return Path(str(configured).strip()).expanduser()
    raise OfflineTransportError(
        "the offline transport needs a response directory: set "
        f"{ENV_RESPONSES_DIR} or transports.offline.responses_dir in "
        "router-config.yaml"
    )


class OfflineTransport:
    """Serves the next scripted response. No network, no credentials."""

    def __init__(self, responses_dir: Path):
        self.responses_dir = Path(responses_dir)

    def responses(self) -> list[Path]:
        if not self.responses_dir.is_dir():
            raise OfflineTransportError(
                f"offline response directory {self.responses_dir} does not "
                "exist"
            )
        found = sorted(
            path for path in self.responses_dir.iterdir()
            if path.is_file() and path.suffix.lower() in RESPONSE_SUFFIXES
        )
        if not found:
            raise OfflineTransportError(
                f"offline response directory {self.responses_dir} holds no "
                f"{' or '.join(RESPONSE_SUFFIXES)} files"
            )
        return found

    # --- cursor ---------------------------------------------------------
    # Deliberately beside the responses, never under .dabbler/runs/ — this
    # is scaffolding for a developer, not part of the machine record.

    @property
    def _cursor_path(self) -> Path:
        return self.responses_dir / CURSOR_NAME

    def _read_cursor(self) -> int:
        try:
            return max(0, int(self._cursor_path.read_text().strip()))
        except (OSError, ValueError):
            return 0

    def _write_cursor(self, index: int) -> None:
        self._cursor_path.write_text(f"{index}\n", encoding="utf-8")

    def reset(self) -> None:
        """Rewind to the first response."""
        self._write_cursor(0)

    def dispatch(
        self,
        *,
        model_id: str,
        system_prompt: str = "",
        user_message: str = "",
        max_tokens: int | None = None,
        generation_params: dict | None = None,
    ) -> APIResult:
        responses = self.responses()
        index = self._read_cursor()
        if index >= len(responses):
            raise OfflineTransportError(
                f"offline responses exhausted: {len(responses)} scripted in "
                f"{self.responses_dir}, dispatch {index + 1} requested. Add "
                "another response file, or reset the cursor."
            )
        path = responses[index]
        content = path.read_text(encoding="utf-8")
        if not content.strip():
            raise OfflineTransportError(
                f"offline response {path.name} is empty; an empty response "
                "is an escalation trigger, not a script"
            )
        self._write_cursor(index + 1)
        return APIResult(
            content=content,
            # Nothing was metered because nothing was spent. Zero here means
            # unmeasured, and the escalation triggers read it that way.
            input_tokens=0,
            output_tokens=0,
            stop_reason="end_turn",
            served_model_id=f"{PROVIDER}:{path.name}",
            metadata={
                "error_class": None,
                "simulated": True,
                "response_file": path.name,
                "response_index": index,
                "requested_model_id": model_id,
            },
        )
