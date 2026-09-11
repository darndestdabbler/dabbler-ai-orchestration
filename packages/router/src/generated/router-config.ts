// Generated from router-config.schema.json by packages/router/src/schema/generate.ts.
// Do not edit: the schema is the source, and `npm run check:types` fails
// when this file no longer matches it.

/**
 * router-config.yaml
 */
export type RouterConfig = {
  providers: Record<string, {
    api_key_env: string;
    enabled?: boolean;
    display_label?: string;
    base_url?: string;
    api_version?: string;
    timeout_seconds: number;
    rate_limit: {
      requests_per_minute: number;
      tokens_per_minute: number;
    };
    retry: {
      max_retries: number;
      backoff_base_seconds: number;
    };
  }>;
  /**
   * How capable a model is, as an ORDER: most capable first, and a tier name means only its position here. A verifying model may not sit below the authoring model's tier, because a review is worth what the reviewer is. Data rather than a judgement compiled into a function, because capability is a thing vendors change. This list is the one home for the names -- a model whose capability_tier is not one of these is refused at load, and the shape is checked here while the membership is checked there.
   */
  capability_tiers?: string[];
  models: Record<string, {
    provider: string;
    /**
     * Which tier of capability_tiers this model sits in. Absent is UNKNOWN and never unsupported: a model the record says nothing about stays eligible, because a hard filter on missing metadata would end cross-vendor verification by accident.
     */
    capability_tier?: string;
    model_id?: string;
    is_enabled?: boolean;
    is_enabled_as_verifier?: boolean;
    max_context_tokens?: number;
    max_output_tokens?: number;
    system_prompt_file?: string;
    notes?: string;
    generation_params?: Record<string, unknown>;
  }>;
  /**
   * Selection by role, applied identically on both transports. A role declares the provider set it may draw from (a hard filter) and a preference order (ordering only -- a model the order does not name still qualifies and simply sorts after the named ones). Names in 'prefer' are model ids as each transport puts them on the wire, so a name that matches nothing on this path is inert rather than an error.
   */
  roles?: Record<string, {
    prefer?: string[];
    require_provider_in?: string[];
  }>;
  escalation: {
    enabled: boolean;
    max_escalations: number;
    triggers: Record<string, unknown>;
    refusal_phrases?: string[];
  };
  transport?: {
    profile?: "api" | "copilot-cli" | "offline";
  };
  transports?: {
    offline?: {
      /**
       * Directory of scripted verifier responses, consumed in lexical order. Overridden by DABBLER_OFFLINE_RESPONSES.
       */
      responses_dir?: string;
    };
    "copilot-cli"?: {
      binary?: string;
      billed_usage_unavailable?: boolean;
      max_invocations_per_session?: number;
      timeouts?: {
        spawn_seconds?: number;
        first_byte_seconds?: number;
        total_seconds?: number;
      };
    };
  };
  task_type_params?: Record<string, unknown>;
  /**
   * Suites, deterministic controls, and the path-to-test selection rules. A repository declares this in its own tracked dabbler.yaml; the block appears here because that file is deep-merged onto this one and the merged result is validated as a whole.
   */
  testing?: Record<string, unknown>;
  /**
   * Path facts about the repository, declared in its tracked dabbler.yaml. Deliberately not part of run_policy: the machine-local overlay may override run policy and may not override this.
   */
  paths?: {
    sensitive_paths?: string[];
  };
  /**
   * Step (f) of the session lifecycle: pack, then push to the feed. A repository that declares no packaging block publishes nothing, which is a declaration rather than an omission -- there is no inferred build here, because guessing how a repository publishes is guessing an ecosystem. Placeholders are substituted per argv element and never through a shell: {output} is the run's own output directory, {artifact} is one file pack produced, {feed} is the declared feed, and {secret} is the resolved credential. Both commands are argv, not shell strings, so a credential cannot be re-split by a shell, and both are spawned with the child-environment allowlist, so the credential is in no environment at all. A repository whose release is a tag declares release: tag instead of the pair, and the two are mutually exclusive.
   */
  packaging?: unknown;
  verification?: Record<string, unknown>;
  critique?: {
    /**
     * The critique pipeline's authority. 'off' is the default and writes nothing. 'shadow' records critique artifacts without letting them decide anything. 'enforce' is declared here so the vocabulary lives in one place, and is refused at load until the set that implements it lands — see config.py, which names that set in the refusal.
     */
    pipeline?: "off" | "shadow" | "enforce";
  };
  metrics?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  run_policy?: {
    default?: "fast" | "verified";
    verification_rounds?: number;
    diff_limit_lines?: number;
    check_timeout_seconds?: number;
    budgets?: {
      model_usd?: number | null;
      model_dispatches?: number;
      elapsed_minutes?: number | null;
    };
  };
  git?: {
    push_on_finish?: boolean;
    worktree_per_run?: boolean;
    remote?: string;
  };
  explorer?: {
    stale_after_minutes?: number;
  };
  discovery?: {
    key_set_id?: string;
    max_age_hours?: number;
  };
  /**
   * How far `dabbler session drive` may go. Declared in the repository's dabbler.yaml (it is a repository-owned block) and read here after the merge.
   */
  driver?: {
    max_invocations?: number;
    engine_output?: "stream" | "quiet";
  };
  worktree?: {
    root?: string | null;
    init?: Array<{
      id: string;
      argv?: string[] | {
        windows: string[];
        posix: string[];
      };
      probe_argv?: string[] | {
        windows: string[];
        posix: string[];
      };
      shell?: boolean;
      command?: string;
      timeout_seconds?: number;
    }>;
  };
};
