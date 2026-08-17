"""Manual smoke script: one real routed call per configured provider whose
API key is present. Never run in CI — it spends real money.

    .venv/Scripts/python smoke.py
"""

import sys

from ai_router import route
from ai_router.config import load_config
from ai_router.secret_resolver import resolve_secret

PROBE_MODELS = {
    # cheapest enabled model per provider in the bundled config
    "google": "gemini-flash",
    "anthropic": "sonnet",
    "openai": "gpt-5-4-mini",
}


def main() -> int:
    config = load_config()
    any_key = False
    failures = 0
    for provider, prov_cfg in config["providers"].items():
        if not resolve_secret(prov_cfg["api_key_env"]):
            print(f"[skip] {provider}: {prov_cfg['api_key_env']} not set")
            continue
        any_key = True
        alias = PROBE_MODELS.get(provider)
        try:
            # At least ~40 words, so the short-response escalation trigger
            # (min_output_tokens) does not climb the probe off this provider.
            result = route(
                "In about fifty words, describe what a model router does.",
                task_type="formatting",
                prefer_model=alias,
                max_tier=3,
            )
            print(
                f"[ok]   {provider}: {result.model_name} -> "
                f"{result.content.strip()[:40]!r} "
                f"(cost={'$%.6f' % result.cost_usd if result.cost_usd is not None else 'unmeasured'})"
            )
        except Exception as exc:  # noqa: BLE001 - report and continue
            failures += 1
            print(f"[FAIL] {provider}: {exc}")
    if not any_key:
        print("No provider keys present; nothing to smoke-test.")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
