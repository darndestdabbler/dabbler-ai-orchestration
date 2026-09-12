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
   * What a direct-API dispatch needs that the catalog does not state: how much output to ask for, how large a prompt may get, which system prompt to send, and the provider's own generation knobs. There are NO MODEL NAMES in this block, which is the point of it -- a block with no model names in it cannot go stale the week a vendor ships a model nobody has added. The seat reads none of it: the CLI exposes no knobs.
   */
  provider_defaults?: Record<string, {
    /**
     * The SMALLEST window this provider serves: all it does is refuse an oversized prompt early.
     */
    max_context_tokens?: number;
    /**
     * This framework's output budget for the provider, well under every model's ceiling.
     */
    max_output_tokens?: number;
    /**
     * One consolidated file with an H2 section per provider slug; it was always read per provider.
     */
    system_prompt_file?: string;
    generation_params?: Record<string, unknown>;
  }>;
  /**
   * Selection by role, applied identically on both transports. A role declares a preference order and a vehicle, and nothing else. 'prefer' is ORDERING ONLY -- a model the order does not name still qualifies and simply sorts after the named ones -- so a stale entry costs a slightly older model and never a candidate; names in it are model ids as each transport puts them on the wire, so a name that matches nothing on this path is inert rather than an error. What a person CHOSE is not here: a selection lives in this machine's user-level preferences beside the catalog, because which model reviews is a fact about who is at this keyboard and what their machine can reach.
   */
  roles?: Record<string, {
    prefer?: string[];
    /**
     * This role's own vehicle: the transport it is dispatched over, where it differs from the machine's. The lowest of the layers that can name one, so a --transport flag, this checkout's .vscode/settings.json and the user-level preferences.json all outrank it; a role that names none resolves exactly as the machine does. It exists because reviewer selection may need the other transport when provider independence requires it, which this framework stated long before any surface could act on it.
     */
    transport?: "api" | "copilot-cli" | "offline";
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
  /**
   * Per task type, the generation knobs that task wants, keyed by PROVIDER. These were always provider-shaped: effort and thinking are Anthropic vocabulary, reasoning_effort OpenAI, thinking_budget Google.
   */
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
