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
  models: Record<string, {
    provider: string;
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
      lockfile?: string;
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
   * Step (f) of the session lifecycle: pack, then push to the feed. A repository that declares no packaging block publishes nothing, which is a declaration rather than an omission -- there is no inferred build here, because guessing how a repository publishes is guessing an ecosystem. Placeholders are substituted per argv element and never through a shell: {output} is the run's own output directory, {artifact} is one file pack produced, {feed} is the declared feed, and {secret} is the resolved credential. Both commands are argv, not shell strings, so a credential cannot be re-split by a shell, and both are spawned with the child-environment allowlist, so the credential is in no environment at all.
   */
  packaging?: {
    pack: {
      /**
       * Must contain {output}. A pack that does not take its output directory from the framework writes into the repository, dirtying the tree that was just verified and leaving last week's build sitting where this week's push will find it.
       */
      argv: string[];
      cwd?: string;
      timeout_seconds?: number;
    };
    push: {
      /**
       * Must contain {artifact}, {feed} and {secret}. All three are required rather than conventional: a command without {artifact} pushes nothing the framework can name, a command without {feed} makes the recorded destination a label instead of a fact about what ran, and a command without {secret} is publishing on an ambient credential the framework cannot see -- which makes 'the PAT is never in an environment' unprovable rather than true.
       */
      argv: string[];
      feed: string;
      /**
       * The NAME of the credential, never its value. It resolves through ai_router.secret_resolver at spawn time, exactly as a provider's api_key_env does.
       */
      secret: string;
      /**
       * Which secret_resolver backend holds it. Defaults to 'env'.
       */
      secret_source?: string;
      cwd?: string;
      timeout_seconds?: number;
    };
  };
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
    record?: string;
    max_age_hours?: number;
    seat_max_age_hours?: number;
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
