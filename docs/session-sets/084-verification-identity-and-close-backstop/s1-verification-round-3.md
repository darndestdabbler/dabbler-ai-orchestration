**ISSUES FOUND**

- **Issue 1:** Model-date normalization is broader than the contract and re-opens acceptance of non-registry model ids
  - **Category:** Correctness
  - **Severity:** Major
  - **Details:**
    - **Violation:** The scope note says: **“Dated Anthropic snapshot ids normalize to their undated alias (`claude-haiku-4-5-20251001 -> claude-haiku-4-5`), still registry-constrained.”** It also says: **“start_session now refuses ANY supplied `--model` that does not resolve in the registry.”**
    - **Impact:** The boundary no longer enforces “registry-constrained” literally. A caller can supply bogus dated ids for other providers, e.g. `gpt-5.4-20251001`, and `start_session` will accept them even though that id is not in the registry. That means new state can still be written with invented/non-registry model strings, and the gate/exclusion logic will treat them as real identities. That is exactly the class of boundary-hardening bug this session was supposed to close.
    - **Evidence:** In `ai_router/orchestrator_identity.py`, `_normalize_model_token()` strips any trailing `-YYYYMMDD` for every model:
      ```python
      _DATE_SUFFIX = re.compile(r"-\d{8}$")
      ...
      return _DATE_SUFFIX.sub("", token)
      ```
      That helper is used universally by `resolve_model_provider()` for registry matching. `start_session._refuse_unresolvable_identity()` accepts any supplied model for which `resolve_model_provider()` returns non-`None`:
      ```python
      resolved = resolve_model_provider(model) if model else None
      ...
      if model_supplied and resolved is None:
          return ...
      ```
      So a non-registry id like `gpt-5.4-20251001` normalizes to `gpt-5-4` and resolves against the existing OpenAI entry instead of being refused.
    - **Correct answer:** Limit date-suffix normalization to the explicitly sanctioned Anthropic snapshot family, or otherwise require an exact registry/universe entry for non-Anthropic ids. The boundary must reject invented dated variants for providers that do not have that alias contract.

- **Issue 2:** The copilot-cli path can report `verification_unavailable` even when the seat catalog does contain a different-provider confirmed model
  - **Category:** Correctness
  - **Severity:** Major
  - **Details:**
    - **Violation:** Session step 4 requires: **“Under `copilot-cli`, exclusion is applied against the catalog lockfile's confirmed entries; no different-provider candidate → `verification_unavailable`.”**
    - **Impact:** Automatic verification can be blocked unnecessarily. If the seat catalog has a confirmed different-provider model, but that model is not listed in `transports.copilot-cli.roles.generator.prefer`, the implementation declares `verification_unavailable` and forces the manual-attested path even though a valid different-provider candidate exists. That changes operator behavior and would change a reasonable merge decision, because the “manual only” outcome is supposed to happen only when no diverse confirmed candidate exists.
    - **Evidence:** In `ai_router/__init__.py`, `_resolve_copilot_generator()` does not search confirmed catalog entries generally; it only walks the configured `prefer` list:
      ```python
      prefer = gen_cfg.get("prefer") or []
      ...
      survivor = next(
          walk_role_prefer(
              catalog, prefer, require_provider_in, exclude_providers
          ),
          None,
      )
      ```
      If none of those preferred entries survive, `_route_via_copilot_cli()` raises `VerificationUnavailableError` whenever an exclusion is active:
      ```python
      if model_id is None:
          if exclusion:
              raise VerificationUnavailableError(...)
      ```
      There is no fallback scan of other confirmed catalog entries outside `prefer`.
    - **Correct answer:** For `session-verification` under `copilot-cli`, apply the exclusion against the seat catalog’s confirmed entries themselves, not only the configured `generator.prefer` subset, or explicitly prove that `prefer` is the complete candidate set for this task. `verification_unavailable` should only fire when the confirmed catalog truly has no surviving different-provider candidate.