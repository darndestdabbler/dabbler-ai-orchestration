# Multi-Backend Coding-Assistant Adapter Specification

> **SUPERSEDED 2026-05-23.** This Draft v2 design predates Set 044's
> empirical pivot to log-harvest observability. The launch-adapter
> approach this document specifies (Sets 037-041) is retired; both
> the wrapper-channel and the native-log-parser channel of the
> replacement architecture are owned by Set 045
> (`docs/session-sets/045-log-harvest-implementation/spec.md`),
> behind the cross-provider-consensus locked proposal at
> `docs/session-sets/044-ai-chat-log-discovery-and-experiments/proposal.md`.
> This file is retained as audit history; do not implement against it.

**Purpose:** Define a Dabbler-compatible adapter layer that standardizes session
launch across coding-assistant backends while keeping `python -m ai_router.start_session`
and `python -m ai_router.close_session` as the canonical ownership writers.

**Status:** Draft v2 (SUPERSEDED — see banner above)
**Last reviewed:** 2026-05-22
**Locally characterized CLI:** GitHub Copilot CLI 1.0.51 on Windows
**Why this revision exists:** Dabbler already has a lifecycle writer and check-out
model. The missing capability is a uniform way to *launch* sessions with explicit
model, effort, and mode. A full headless conversation runtime is an optional later
layer, not the first ship target.

**Official Copilot CLI docs consulted for this revision:**

- https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference
- https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-programmatic-reference
- https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference
- https://docs.github.com/en/copilot/concepts/agents/copilot-cli/autopilot

---

## 1. Problem Statement

Dabbler can already record orchestrator ownership on a session set. The current
gap is narrower and more concrete:

- The extension can record `provider + model + effort`, but for Gemini and Copilot
  that is mostly declarative bookkeeping rather than a real launch path.
- `Check Out As...` is a coordination command, not a backend session launcher.
- The UI intentionally retired misleading orchestrator controls until there is a
  real session-launch path behind them.

The immediate product need is therefore:

1. Pick a uniform session profile.
2. Acquire Dabbler ownership through the canonical writer.
3. Launch the backend with that profile.

That is a smaller, safer deliverable than immediately replacing every backend's
conversation loop with a Dabbler-owned chat runtime.

---

## 2. Design Principle: Separate Ownership, Launch, and Conversation

This specification uses three layers with deliberately different responsibilities.

### 2.1 Ownership Layer (already exists in Dabbler)

This layer is canonical today.

- `ai_router.new_chat_id` provides Dabbler's per-chat identity when the host does
  not expose one.
- `ai_router.start_session` owns the check-out write.
- `ai_router.close_session` owns the check-in write.
- `session-state.json` is the source of truth for current holder identity.
- The extension renders state; it does not infer ownership from backend config files.

### 2.2 Launch Layer (first ship target)

This is the missing abstraction.

- Resolve a user-visible `SessionProfile` into backend-specific argv, env, cwd,
  and isolated config-home decisions.
- Launch either an interactive backend session or a one-shot prompt-mode process.
- Return enough metadata for audit, attach, and close-out.

This layer is sufficient to solve "launch chat sessions uniformly with model and
effort".

### 2.3 Conversation Layer (optional later)

Only build this layer if Dabbler decides to own the entire conversation loop.

- One prompt becomes one backend invocation.
- Dabbler stores conversation history and replay state.
- Native backend resume becomes an optimization rather than the primary contract.

This layer should not block the launch work.

```
VS Code extension / launcher
    |
    v
beginSession()
    |
    +--> ai_router.new_chat_id         (if needed)
    +--> ai_router.start_session       (canonical ownership write)
    +--> LaunchAdapter.buildLaunchPlan (backend translation)
    |
    v
Interactive CLI window or prompt-mode invocation
    |
    v
Optional future ConversationAdapter
```

---

## 3. Canonical Terms

### 3.1 `dabblerChatSessionId`

The Dabbler-owned per-chat identity written through `start_session` and used for
ownership checks, takeover UX, and close-out audit.

This is **not** the same thing as a backend-native conversation ID.

### 3.2 `nativeResumeToken`

A backend-native session locator when the backend exposes one and Dabbler can
retrieve it in a documented or well-characterized way.

Examples:

- Copilot CLI session picker / resume token.
- Codex conversation ID.

This token is optional. Dabbler correctness must not depend on it.

### 3.3 `SessionProfile`

The user-visible session selection: backend, provider, model, effort, and
optionally a backend-specific thinking toggle.

### 3.4 Dabbler Effort Scale

Keep Dabbler's canonical effort vocabulary aligned with the current extension:

`low | medium | high | max`

Adapters map this to backend-native values. Do **not** make Copilot's or Codex's
latest flag spelling the canonical repo-wide source of truth.

---

## 4. Canonical Types

```ts
type BackendId = "claude-code" | "codex" | "gemini-cli" | "copilot-cli";
type DabblerEffort = "low" | "medium" | "high" | "max";
type SessionMode = "normal" | "plan" | "autonomous";
type LaunchKind = "interactive" | "prompt";

interface SessionProfile {
  backend: BackendId;
  engine: "claude" | "codex" | "gemini" | "copilot";
  provider: "anthropic" | "openai" | "google" | "github";
  model: string;
  effort: DabblerEffort;
  thinking?: boolean;
}

interface PermissionPolicy {
  allowAll?: boolean;
  availableTools?: string[];
  allowTools?: string[];
  denyTools?: string[];
  addDirs?: string[];
  allowUrls?: string[];
  denyUrls?: string[];
  noAskUser?: boolean;
}

interface IsolationPolicy {
  workingDirectory: string;
  backendHomeDir?: string;
  preserveUserState: boolean;
}

interface BeginSessionRequest {
  sessionSetDir: string;
  sessionNumber?: number | null;
  profile: SessionProfile;
  sessionMode: SessionMode;
  launchKind: LaunchKind;
  initialPrompt?: string;
  dabblerChatSessionId?: string | null;
  nativeResumeToken?: string | null;
  permissions?: PermissionPolicy;
  isolation: IsolationPolicy;
  forceTakeover?: boolean;
  name?: string;
}

interface LaunchPlan {
  argv: string[];
  env: Record<string, string>;
  cwd: string;
  mode: LaunchKind;
  notes: string[];
}

interface BeginSessionResult {
  dabblerChatSessionId: string;
  sessionNumber: number;
  stateFile: string;
  launchPlan: LaunchPlan;
  nativeResumeToken: string | null;
  nativeResumeSupported: boolean;
  actualModelProbe: "stdout" | "jsonl" | "otel" | "none";
}

interface LaunchAdapter {
  readonly id: BackendId;
  readonly supportsInteractiveLaunch: boolean;
  readonly supportsHeadlessTurns: boolean;
  readonly supportsNativeResume: boolean;

  buildLaunchPlan(req: BeginSessionRequest): Promise<LaunchPlan>;
  normalizeActualModel?(artifacts: LaunchArtifacts): string | null;
}

interface LaunchArtifacts {
  stdout: string;
  stderr: string;
  files?: string[];
}
```

---

## 5. `beginSession()` Contract (exact)

`beginSession()` is the center of the launch layer. It is the contract the
extension should call before opening a terminal, starting a prompt-mode backend,
or offering takeover/attach UX.

### 5.1 Required behavior

1. Resolve `dabblerChatSessionId`.
   - Use the caller-supplied value when present.
   - Otherwise generate one with `python -m ai_router.new_chat_id`.

2. Acquire canonical ownership *before* backend launch.
   - Invoke `python -m ai_router.start_session` with:
     - `--session-set-dir`
     - `--session-number` when provided
     - `--engine`
     - `--model`
     - `--effort`
     - `--provider`
     - `--chat-session-id`
     - `--force` when takeover is explicit
   - If `start_session` refuses, do not spawn the backend.

3. Resolve backend launch parameters.
   - Call `LaunchAdapter.buildLaunchPlan(req)`.

4. Spawn the backend process.
   - Interactive launch opens a terminal session.
   - Prompt launch executes a one-shot command and captures artifacts.

5. Return a `BeginSessionResult` that keeps Dabbler identity separate from any
   backend-native resume token.

### 5.2 Boundary rule

`beginSession()` is allowed to fail *before* the backend process starts.
It must not create a partially launched backend and only then discover that the
session set is held by another chat.

### 5.3 Close rule

`close_session` remains the authoritative close-out path. Backend teardown and
Dabbler ownership release are related, but not the same action.

---

## 6. Launch Layer vs. Conversation Layer

The launch layer is required. The conversation layer is optional.

### 6.1 Launch layer responsibilities

- Uniform profile picking.
- `new_chat_id` generation.
- `start_session` / takeover enforcement.
- Backend-specific argv/env/cwd/home resolution.
- Interactive session launch.
- One-shot prompt launch.

### 6.2 Conversation layer responsibilities

- Per-turn `send()`.
- History replay.
- Native resume fallback.
- Event normalization for a Dabbler-owned chat UI.

### 6.3 Optional future contract

If Dabbler later owns the full loop, use a separate interface instead of making
the launch contract do both jobs.

```ts
interface ConversationAdapter {
  readonly id: BackendId;
  readonly supportsNativeResume: boolean;

  send(req: TurnRequest): AsyncIterable<AssistantEvent>;
  resumeToken(result: TurnResult): string | null;
}

interface TurnRequest {
  dabblerChatSessionId: string;
  nativeResumeToken?: string | null;
  history: Message[];
  message: string;
  profile: SessionProfile;
  sessionMode: SessionMode;
  workdir: string;
}

interface AssistantEvent {
  type: "text" | "tool_call" | "tool_result" | "model_info" | "status" | "error" | "done";
  data: unknown;
}

interface TurnResult {
  activeModel: string | null;
  nativeResumeToken: string | null;
  tokensUsed?: number;
  exitCode: number;
}
```

This section is intentionally secondary. Do not block launch work on it.

---

## 7. Copilot CLI: Officially Documented Surface (May 2026)

This section is based on the official GitHub docs listed at the top of this file.
Anything not stated there should be treated as unverified until locally characterized.

| Concern | Officially documented | Dabbler v1 policy |
|---|---|---|
| Interactive launch | `copilot` launches the interactive UI. `-i/--interactive=PROMPT` starts an interactive session and immediately executes a prompt. | Use this for a real "open chat" launch path. |
| Programmatic one-shot mode | `-p/--prompt=PROMPT` runs non-interactively and exits when done. Installed 1.0.51 help also examples this with `--allow-all-tools`, and labels that flag as required for non-interactive mode. | Use this for prompt-mode turns, probes, and automation, but always include an explicit non-interactive permission stance rather than assuming interactive prompts exist. |
| Model selection | `--model`, `COPILOT_MODEL`, and `settings.json` `model` are documented. Precedence is agent -> `--model` -> `COPILOT_MODEL` -> settings -> default. | Pass `--model` explicitly from Dabbler. Do not rely on ambient settings. |
| Effort selection | Installed 1.0.51 help accepts `none`, `low`, `medium`, `high`, `xhigh`, and `max` for `--effort` / `--reasoning-effort`. The docs pass was less explicit about the upper tiers. | Keep Dabbler's `max` effort. On Copilot CLI 1.0.51+, pass `--effort max` directly. Dabbler still does not expose `none` as a canonical tier. |
| Session mode | `--mode=interactive|plan|autopilot`, `--plan`, and `--autopilot` are documented. | Map `normal -> interactive`, `plan -> --plan`, `autonomous -> --autopilot` with explicit permission policy. |
| Resume / continue | `--continue` resumes the most recent session. `--resume[=VALUE]` resumes a named or selected session. Docs say session history under `~/.copilot/session-state/` powers this. | Allow interactive attach/resume UX, but do not make prompt-mode correctness depend on native Copilot resume. |
| Machine-readable output | `--output-format=json` emits JSONL. `-s/--silent` suppresses stats and decoration. | Use JSONL as transport, but do not lock its schema into Dabbler until locally characterized. |
| Actual model reporting | Docs say non-silent non-interactive output shows the model used. OTel `chat` spans document `gen_ai.response.model`. | Prefer an optional OTel audit path for durable actual-model capture. Otherwise parse non-silent output as a stopgap. |
| Permissions | `--allow-all`, `--allow-all-tools`, `--allow-tool`, `--deny-tool`, `--available-tools`, `--add-dir`, `--allow-url`, `--deny-url`, `--no-ask-user` are documented. Installed 1.0.51 help states `--allow-all-tools` is required for non-interactive mode. | Translate Dabbler permission policy directly to Copilot flags. For v1 prompt-mode, default to `--allow-all-tools` unless a narrower locally verified non-interactive permission profile is available. |
| Isolation | `COPILOT_HOME` replaces the entire `~/.copilot` path. Docs say it contains `settings.json`, `permissions-config.json`, `session-state/`, `logs/`, and more. | Use per-session `COPILOT_HOME` when reproducibility or isolation matters. |
| Auth | `COPILOT_GITHUB_TOKEN`, `GH_TOKEN`, `GITHUB_TOKEN` are documented in precedence order. | Use vendor-native auth only. |
| Backend chat identity | Installed 1.0.51 help documents `--session-id <id>` to resume an existing session or task, or set the UUID for a new session. No official per-chat env var is documented. | Keep Dabbler's chat ID as the canonical ownership id. When that id is UUID-shaped, pass it through as Copilot `--session-id` for new launches. |

### 7.1 Important Copilot-specific nuance

The docs support a useful distinction:

- Dabbler can own **session identity** through `chatSessionId`.
- Copilot can still own **its own interactive session history** behind `--resume`.

Those are related but separate concerns. The launch contract should keep them separate.

### 7.3 Local characterization update for 1.0.51

The installed CLI tightened three previously open questions:

- `--session-id <uuid>` is a supported way to seed a new Copilot session id.
- `--effort` accepts both `xhigh` and `max`.
- Non-interactive mode should be launched with an explicit permission choice,
  and the shipped help text points at `--allow-all-tools` as the default-safe
  scripting path.

### 7.2 Optional OTel audit path

The command reference documents OpenTelemetry file export and the `chat` span
attribute `gen_ai.response.model`.

That gives a more robust path for actual-model auditing than scraping terminal text:

- Set `COPILOT_OTEL_FILE_EXPORTER_PATH` to a temp JSONL file.
- Run the Copilot command.
- Read the emitted `chat` span for `gen_ai.response.model` and
  `gen_ai.conversation.id`.

This is optional in v1, but it is the best documented path if model fidelity is
important.

---

## 8. CopilotLaunchAdapter v1 (first implementation slice)

This is the first concrete implementation slice to build.

### 8.1 Scope

Ship a uniform Copilot launcher, not a full Copilot conversation runtime.

### 8.2 Responsibilities

1. Accept a Dabbler `BeginSessionRequest`.
2. Resolve or generate `dabblerChatSessionId`.
3. Call `ai_router.start_session` before spawning Copilot.
4. Map Dabbler profile and permissions to documented Copilot CLI flags.
5. Launch either:
   - an interactive Copilot terminal session, or
   - a prompt-mode Copilot process.
6. Return launch metadata and an optional `nativeResumeToken`.

### 8.3 Command mapping

#### Interactive normal session

```bash
copilot \
  --session-id <uuid> \
  --model <model> \
  --effort <mapped-effort>
```

#### Interactive plan session

```bash
copilot \
  --session-id <uuid> \
  --model <model> \
  --effort <mapped-effort> \
  --plan
```

#### Interactive session with an initial prompt

```bash
copilot \
  --session-id <uuid> \
  --model <model> \
  --effort <mapped-effort> \
  --interactive "<prompt>"
```

#### Prompt-mode one-shot turn

```bash
copilot \
  --session-id <uuid> \
  --model <model> \
  --effort <mapped-effort> \
  --allow-all-tools \
  --output-format json \
  --prompt "<prompt>"
```

#### Autonomous prompt-mode run

```bash
copilot \
  --session-id <uuid> \
  --autopilot \
  --yolo \
  --max-autopilot-continues 10 \
  --model <model> \
  --effort <mapped-effort> \
  --prompt "<prompt>"
```

### 8.4 Permission mapping

Translate `PermissionPolicy` directly:

- `allowAll -> --allow-all`
- `availableTools -> --available-tools`
- `allowTools -> --allow-tool`
- `denyTools -> --deny-tool`
- `addDirs -> --add-dir`
- `allowUrls -> --allow-url`
- `denyUrls -> --deny-url`
- `noAskUser -> --no-ask-user`

### 8.5 Isolation mapping

When `backendHomeDir` is supplied, set:

```text
COPILOT_HOME=<backendHomeDir>
```

Docs explicitly say this relocates the entire state directory, including:

- `settings.json`
- `permissions-config.json`
- `session-state/`
- `logs/`
- `session-store.db`

Recommended v1 location pattern:

```text
<workspace>/.dabbler/backend-homes/copilot/<dabblerChatSessionId>/
```

### 8.6 Resume policy

For v1:

- Interactive launch may offer an `Attach As...` path that uses `--continue` or
  `--resume` for a human-driven terminal session.
- When Dabbler launches Copilot with `--session-id <dabblerChatSessionId>`, the
  adapter may set `nativeResumeToken` to the same UUID value.
- Prompt-mode launches should assume `nativeResumeToken = null` unless Dabbler has
  locally characterized a stable scripted resume flow.
- Dabbler's own history replay remains the portability fallback.

### 8.7 Actual model policy

For v1:

- `actualModelProbe = "otel"` when OTel file export is enabled.
- Otherwise `actualModelProbe = "stdout"` when non-silent prompt mode is used.
- Otherwise `actualModelProbe = "none"`.

Do not claim that Copilot JSONL output contains a stable resolved-model field until
that schema is characterized against a pinned version.

### 8.8 Pseudocode

```ts
async function beginSession(req: BeginSessionRequest): Promise<BeginSessionResult> {
  const chatId = req.dabblerChatSessionId ?? await newChatId();

  const sessionNumber = await startSessionBoundaryWrite({
    sessionSetDir: req.sessionSetDir,
    sessionNumber: req.sessionNumber ?? null,
    engine: req.profile.engine,
    provider: req.profile.provider,
    model: req.profile.model,
    effort: req.profile.effort,
    chatSessionId: chatId,
    force: req.forceTakeover === true,
  });

  const plan = await copilotLaunchAdapter.buildLaunchPlan({
    ...req,
    dabblerChatSessionId: chatId,
  });

  return {
    dabblerChatSessionId: chatId,
    sessionNumber,
    stateFile: `${req.sessionSetDir}/session-state.json`,
    launchPlan: plan,
    nativeResumeToken: plan.argv.includes("--session-id") ? chatId : null,
    nativeResumeSupported: true,
    actualModelProbe: plan.env.COPILOT_OTEL_FILE_EXPORTER_PATH ? "otel" : "stdout",
  };
}
```

---

## 9. Build Order

1. Add `beginSession()` and `LaunchAdapter` to the extension-side orchestration layer.
2. Implement `CopilotLaunchAdapter` first.
3. Evolve `Check Out As...` into `Launch As...`, but keep `start_session` as the
   canonical writer.
4. Add a distinct `Attach As...` flow for interactive resume.
5. Add `CodexLaunchAdapter`.
6. Add `GeminiLaunchAdapter`.
7. Revisit whether a full `ConversationAdapter` is worth the complexity.

---

## 10. Non-Goals and Risks

### 10.1 Non-goals

- Replacing `start_session` / `close_session` with backend-owned state.
- Reintroducing config-file watchers as ownership inference.
- Locking undocumented backend env vars into the canonical contract.
- Requiring native backend resume for correctness.

### 10.2 Risks

1. **Copilot CLI update churn.** Pin versions when possible and keep the docs-verified
   and locally-characterized surfaces distinct.
2. **Effort mismatch.** Copilot docs currently expose a flag-level and settings-level
   discrepancy for the highest effort tier.
3. **Prompt-mode schema drift.** JSONL output format is documented, but the exact
   event schema is not locked in the docs quoted here.
4. **Auth coupling mistakes.** Each backend must authenticate through its own official path.
5. **Over-scoping too early.** Launch uniformity solves the current UX gap. A full
   headless conversation runtime should be justified separately.

---

## 11. Bottom Line

For Dabbler, the right first move is:

- keep ownership in the existing writer,
- add a real launch adapter layer,
- implement Copilot first against documented flags and `COPILOT_HOME`,
- treat full per-turn conversation control as a later, optional layer.

That gives a uniform, honest session-launch path without reopening the watcher-
drift problems that Set 036 is explicitly trying to eliminate.
