"""Pushover notification helpers for session workflow events."""

from dataclasses import dataclass
import json
import os
import subprocess
from typing import Optional
from urllib import error, parse, request

PUSHOVER_MESSAGES_URL = "https://api.pushover.net/1/messages.json"


@dataclass
class NotificationResult:
    """Structured response from the Pushover API."""

    status: int
    request_id: Optional[str]
    raw_response: str


def send_pushover_notification(
    title: str,
    message: str,
    priority: int = 0,
    sound: Optional[str] = None,
    device: Optional[str] = None,
    url: Optional[str] = None,
    url_title: Optional[str] = None
) -> NotificationResult:
    """
    Send a Pushover notification using environment-based credentials.

    Credentials are read from `PUSHOVER_API_KEY` and `PUSHOVER_USER_KEY`.
    On Windows, this helper also falls back to the User/Machine environment
    variables if the current process environment does not contain them yet.
    """
    payload = {
        "token": _get_required_env_value("PUSHOVER_API_KEY"),
        "user": _get_required_env_value("PUSHOVER_USER_KEY"),
        "title": title,
        "message": message,
        "priority": str(priority),
    }

    if sound:
        payload["sound"] = sound
    if device:
        payload["device"] = device
    if url:
        payload["url"] = url
    if url_title:
        payload["url_title"] = url_title

    data = parse.urlencode(payload).encode("utf-8")
    req = request.Request(
        PUSHOVER_MESSAGES_URL,
        data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=15) as response:
            raw_response = response.read().decode("utf-8")
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"Pushover request failed with HTTP {exc.code}: {body}"
        ) from exc
    except error.URLError as exc:
        raise RuntimeError(
            f"Pushover request failed: {exc.reason}"
        ) from exc

    try:
        parsed = json.loads(raw_response)
    except json.JSONDecodeError as exc:
        raise RuntimeError(
            f"Pushover returned invalid JSON: {raw_response}"
        ) from exc

    status = int(parsed.get("status", 0))
    if status != 1:
        raise RuntimeError(
            f"Pushover notification was rejected: {raw_response}"
        )

    return NotificationResult(
        status=status,
        request_id=parsed.get("request"),
        raw_response=raw_response,
    )


def send_session_complete_notification(
    session_set: str,
    session_number: Optional[int] = None,
    total_sessions: Optional[int] = None,
    verification_verdict: Optional[str] = None,
    summary: Optional[str] = None
) -> NotificationResult:
    """Send a standard session-complete notification."""
    session_name = os.path.basename(os.path.normpath(session_set))
    title = f"Session complete: {session_name}"

    lines = [f"Session set: {session_name}"]

    if session_number is not None and total_sessions is not None:
        lines.append(f"Session: {session_number} of {total_sessions}")
    elif session_number is not None:
        lines.append(f"Session: {session_number}")

    if verification_verdict:
        lines.append(f"Verification: {verification_verdict}")

    if summary:
        lines.append(summary.strip())

    return send_pushover_notification(title=title, message="\n".join(lines))


def _get_required_env_value(name: str) -> str:
    value = _get_env_value(name)
    if value:
        return value
    raise RuntimeError(
        f"Missing required environment variable: {name}"
    )


def _get_env_value(name: str) -> Optional[str]:
    value = os.environ.get(name)
    if value and value.strip():
        return value.strip()

    if os.name != "nt":
        return None

    return _read_windows_environment_variable(name)


def _read_windows_environment_variable(name: str) -> Optional[str]:
    command = (
        f"$value = [System.Environment]::GetEnvironmentVariable('{name}', 'User'); "
        f"if (-not $value) {{ "
        f"$value = [System.Environment]::GetEnvironmentVariable('{name}', 'Machine') "
        f"}}; "
        f"if ($value) {{ Write-Output $value }}"
    )

    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-Command", command],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return None

    if result.returncode != 0:
        return None

    value = result.stdout.strip()
    return value or None
