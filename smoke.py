"""Manual smoke script: one real routed call per configured provider whose
API key is present. Never run in CI — it spends real money.

    .venv/Scripts/python smoke.py

It pins ``transport="api"`` because that is the thing under test. The shipped
default is the Copilot seat, and a probe that reached OpenAI through a seat
would report a working OpenAI API key it never used.
"""

import sys

from ai_router import route
from ai_router.config import load_config
from ai_router.secret_resolver import resolve_secret


def main() -> int:
    config = load_config()
    providers = list(config["providers"])
    any_key = False
    failures = 0
    for provider, prov_cfg in config["providers"].items():
        if not resolve_secret(prov_cfg["api_key_env"]):
            print(f"[skip] {provider}: {prov_cfg['api_key_env']} not set")
            continue
        any_key = True
        try:
            # At least ~40 words, so the short-response escalation trigger
            # (min_output_tokens) does not climb the probe off this provider.
            # Selection is by role, so the provider is pinned by excluding
            # the others rather than by naming a model.
            result = route(
                "In about fifty words, describe what a model router does.",
                task_type="formatting",
                transport="api",
                exclude_providers=[p for p in providers if p != provider],
            )
            print(
                f"[ok]   {provider}: {result.model_name} -> "
                f"{result.content.strip()[:40]!r} "
                f"({result.input_tokens}/{result.output_tokens} tokens)"
            )
        except Exception as exc:  # noqa: BLE001 - report and continue
            failures += 1
            print(f"[FAIL] {provider}: {exc}")
    if not any_key:
        print("No provider keys present; nothing to smoke-test.")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
